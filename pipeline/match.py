from datetime import date

from rapidfuzz import fuzz
from sqlmodel import Session, select

from models import (
    CanonicalFoodProfile,
    ConstraintStatus,
    MatchExplanation,
    Meal,
    MenuOccurrence,
    UserMenuVerdict,
    UserPreferenceProfile,
)
from pipeline.catalogue import normalize_food_name
from pipeline.embeddings import best_semantic_match, get_or_create_food_embedding, preference_vectors


EXCLUSION_TO_PROFILE_FIELD = {
    "meat": "contains_meat",
    "pork": "contains_pork",
    "beef": "contains_beef",
    "chicken": "contains_chicken",
    "fish": "contains_fish",
    "shellfish": "contains_shellfish",
    "egg": "contains_egg",
    "eggs": "contains_egg",
    "dairy": "contains_dairy",
    "milk": "contains_dairy",
}


def get_preferences_for_meal(profile: UserPreferenceProfile, meal: Meal) -> list[str]:
    if meal == Meal.breakfast:
        return profile.ideal_breakfast_items
    return profile.ideal_lunch_items


def profile_conflicts_with_exclusions(
    food: CanonicalFoodProfile,
    exclusions: list[str],
) -> list[str]:
    conflicts: list[str] = []
    dietary_profile = food.dietary_profile or {}
    for exclusion in exclusions:
        field = EXCLUSION_TO_PROFILE_FIELD.get(exclusion)
        if field and dietary_profile.get(field):
            conflicts.append(exclusion)
    return conflicts


def allergen_status(
    food: CanonicalFoodProfile,
    allergens: list[str],
    flags: list[str],
) -> tuple[ConstraintStatus, str | None]:
    watched = set(allergens) | set(flags)
    if not watched:
        return ConstraintStatus.allowed, None

    confirmed = set(food.confirmed_allergens or [])
    possible = set(food.possible_allergens or [])
    if watched & confirmed:
        return ConstraintStatus.excluded, f"confirmed conflict: {', '.join(sorted(watched & confirmed))}"
    if watched & possible:
        return (
            ConstraintStatus.check_with_cafe,
            f"possible conflict: {', '.join(sorted(watched & possible))}",
        )
    return ConstraintStatus.allowed, None


def lexical_preference_score(name: str, preferences: list[str]) -> tuple[float, str | None]:
    if not preferences:
        return 0.0, None
    best_pref = None
    best_score = 0.0
    normalized_name = normalize_food_name(name)
    for preference in preferences:
        score = fuzz.token_set_ratio(normalize_food_name(preference), normalized_name) / 100
        if score > best_score:
            best_score = score
            best_pref = preference
    return best_score, best_pref


def dislike_penalty(name: str, dislikes: list[str]) -> float:
    if not dislikes:
        return 0.0
    normalized_name = normalize_food_name(name)
    return (
        max(
            fuzz.token_set_ratio(normalize_food_name(dislike), normalized_name) / 100
            for dislike in dislikes
        )
        * 0.35
    )


def attribute_score(food: CanonicalFoodProfile, preferences: list[str]) -> float:
    joined_preferences = " ".join(preferences).lower()
    categories = food.food_categories or []
    if "pizza_flatbread" in categories and any(
        token in joined_preferences for token in ["pizza", "flatbread"]
    ):
        return 0.9
    if "rice" in categories and "rice" in joined_preferences:
        return 0.85
    if "stir_fry" in categories and any(
        token in joined_preferences for token in ["stir", "noodle", "tofu"]
    ):
        return 0.75
    if "sandwich" in categories and "sandwich" in joined_preferences:
        return 0.75
    return 0.4 if preferences else 0.2


def score_allowed_item(
    session: Session,
    occurrence: MenuOccurrence,
    food: CanonicalFoodProfile,
    profile: UserPreferenceProfile,
) -> MatchExplanation:
    preferences = get_preferences_for_meal(profile, occurrence.meal)
    lexical_score, matched_preference = lexical_preference_score(
        occurrence.raw_name, preferences
    )
    attr_score = attribute_score(food, preferences)
    food_embedding = get_or_create_food_embedding(session, food)
    semantic_score, semantic_preference = best_semantic_match(
        food_embedding.embedding,
        preference_vectors(session, profile.user_id, occurrence.meal, "positive"),
    )
    if semantic_score > lexical_score and semantic_preference:
        matched_preference = semantic_preference
    penalty = dislike_penalty(occurrence.raw_name, profile.disliked_foods)
    final_score = max(
        0.0,
        (0.30 * semantic_score) + (0.45 * lexical_score) + (0.25 * attr_score) - penalty,
    )

    if matched_preference and max(lexical_score, semantic_score) >= 0.50:
        reason = f"Matches your preference for {matched_preference}"
    elif attr_score >= 0.75:
        reason = "Matches one of your preferred food styles"
    else:
        reason = "Appears compatible with your restrictions"

    return MatchExplanation(
        item=occurrence.raw_name,
        matched_preference=matched_preference,
        lexical_score=round(lexical_score, 3),
        semantic_score=round(semantic_score, 3),
        attribute_score=round(attr_score, 3),
        dislike_penalty=round(penalty, 3),
        final_score=round(final_score, 3),
        constraint_status=ConstraintStatus.allowed,
        reason=reason,
    )


def build_verdict(
    session: Session,
    user_id: int,
    menu_date: date,
    meal: Meal,
) -> UserMenuVerdict:
    profile = session.exec(
        select(UserPreferenceProfile).where(UserPreferenceProfile.user_id == user_id)
    ).first()
    if not profile:
        raise ValueError("User profile not found.")

    occurrences = session.exec(
        select(MenuOccurrence)
        .where(MenuOccurrence.menu_date == menu_date)
        .where(MenuOccurrence.meal == meal)
    ).all()

    exciting: list[MatchExplanation] = []
    suitable: list[MatchExplanation] = []
    check: list[MatchExplanation] = []
    not_suitable: list[MatchExplanation] = []
    restrictions = profile.compiled_restrictions or {}

    for occurrence in occurrences:
        if occurrence.food_id is None:
            continue
        food = session.get(CanonicalFoodProfile, occurrence.food_id)
        if not food:
            continue

        conflicts = profile_conflicts_with_exclusions(
            food, restrictions.get("strict_exclusions", [])
        )
        if conflicts:
            not_suitable.append(
                MatchExplanation(
                    item=occurrence.raw_name,
                    constraint_status=ConstraintStatus.excluded,
                    reason=f"Excluded because it conflicts with: {', '.join(conflicts)}",
                )
            )
            continue

        status, conflict_reason = allergen_status(
            food,
            restrictions.get("allergens", []),
            restrictions.get("flags", []),
        )
        if status == ConstraintStatus.excluded:
            not_suitable.append(
                MatchExplanation(
                    item=occurrence.raw_name,
                    constraint_status=status,
                    reason=conflict_reason or "Excluded by allergen rule",
                )
            )
            continue
        if status == ConstraintStatus.check_with_cafe:
            check.append(
                MatchExplanation(
                    item=occurrence.raw_name,
                    constraint_status=status,
                    reason=conflict_reason or "Ingredient information is incomplete",
                )
            )
            continue

        scored = score_allowed_item(session, occurrence, food, profile)
        if scored.final_score >= 0.60:
            exciting.append(scored)
        else:
            suitable.append(scored)

    exciting.sort(key=lambda item: item.final_score, reverse=True)
    suitable.sort(key=lambda item: item.final_score, reverse=True)

    if exciting:
        verdict_text = f"Happy {meal.value} day"
    elif suitable:
        verdict_text = f"Some {meal.value} options today"
    else:
        verdict_text = f"Not much for {meal.value} today"

    return UserMenuVerdict(
        user_id=user_id,
        menu_date=menu_date,
        meal=meal,
        verdict=verdict_text,
        exciting_matches=exciting,
        other_suitable_options=suitable,
        check_with_cafe=check,
        not_suitable=not_suitable,
    )
