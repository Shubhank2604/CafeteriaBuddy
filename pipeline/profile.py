from sqlmodel import Session, select

from models import DietaryPattern, User, UserCreate, UserPreferenceProfile, UserPreferenceProfileCreate, utc_now


DIETARY_RULES = {
    DietaryPattern.vegan: {
        "meat",
        "pork",
        "beef",
        "chicken",
        "poultry",
        "fish",
        "shellfish",
        "egg",
        "dairy",
    },
    DietaryPattern.vegetarian: {
        "meat",
        "pork",
        "beef",
        "chicken",
        "poultry",
        "fish",
        "shellfish",
    },
    DietaryPattern.standard: set(),
}


FOODS_NOT_CONSUMED_MAP = {
    "no pork": "pork",
    "no beef": "beef",
    "no fish": "fish",
    "no shellfish": "shellfish",
    "no chicken": "chicken",
    "no other meat": "meat",
    "no eggs": "egg",
    "no dairy products": "dairy",
}


def normalize_answer(value: str) -> str:
    return " ".join(value.strip().lower().replace("_", " ").split())


def normalize_list(values: list[str]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for value in values:
        item = normalize_answer(value)
        if item and item not in seen:
            normalized.append(item)
            seen.add(item)
    return normalized


def split_preference_items(values: list[str]) -> list[str]:
    items: list[str] = []
    for value in values:
        for piece in value.replace("\n", ",").split(","):
            normalized = normalize_answer(piece)
            if normalized:
                items.append(normalized)
    return normalize_list(items)


def compile_restrictions(profile: UserPreferenceProfileCreate) -> dict[str, list[str]]:
    dietary_exclusions = set(DIETARY_RULES[profile.dietary_pattern])
    personal_exclusions = {
        FOODS_NOT_CONSUMED_MAP.get(normalize_answer(item), normalize_answer(item))
        for item in profile.foods_not_consumed
    }
    personal_exclusions.discard("other")

    return {
        "dietary_exclusions": sorted(dietary_exclusions),
        "personal_exclusions": sorted(personal_exclusions),
        "allergens": normalize_list(profile.allergens),
        "flags": normalize_list(profile.other_avoidances),
        "strict_exclusions": sorted(dietary_exclusions | personal_exclusions),
    }


def create_user(session: Session, payload: UserCreate) -> User:
    user = User(name=payload.name, teams_user_id=payload.teams_user_id)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def upsert_user_profile(
    session: Session,
    user_id: int,
    payload: UserPreferenceProfileCreate,
) -> UserPreferenceProfile:
    existing = session.exec(
        select(UserPreferenceProfile).where(UserPreferenceProfile.user_id == user_id)
    ).first()

    values = {
        "dietary_pattern": payload.dietary_pattern.value,
        "foods_not_consumed": normalize_list(payload.foods_not_consumed),
        "allergens": normalize_list(payload.allergens),
        "other_avoidances": normalize_list(payload.other_avoidances),
        "ideal_breakfast_items": split_preference_items(payload.ideal_breakfast_items),
        "ideal_lunch_items": split_preference_items(payload.ideal_lunch_items),
        "disliked_foods": split_preference_items(payload.disliked_foods),
        "compiled_restrictions": compile_restrictions(payload),
        "updated_at": utc_now(),
    }

    if existing:
        for key, value in values.items():
            setattr(existing, key, value)
        profile = existing
    else:
        profile = UserPreferenceProfile(user_id=user_id, **values)

    session.add(profile)
    session.commit()
    session.refresh(profile)
    from pipeline.embeddings import refresh_preference_embeddings

    refresh_preference_embeddings(session, profile)
    return profile
