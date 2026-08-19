import re
import unicodedata

from sqlmodel import Session, select

from models import CanonicalFoodProfile, FoodAlias, MenuOccurrence, ResolutionMethod
from pipeline.enrich import infer_food_profile
from rapidfuzz import fuzz


NON_WORD = re.compile(r"[^a-z0-9\s]")
WHITESPACE = re.compile(r"\s+")
FUZZY_ALIAS_THRESHOLD = 94.0
FUZZY_ALIAS_AMBIGUITY_GAP = 3.0


def normalize_food_name(value: str) -> str:
    ascii_value = (
        unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    )
    lowered = ascii_value.lower()
    no_punctuation = NON_WORD.sub(" ", lowered)
    return WHITESPACE.sub(" ", no_punctuation).strip()


def create_food_profile(session: Session, occurrence: MenuOccurrence) -> CanonicalFoodProfile:
    inferred = infer_food_profile(occurrence.raw_name, occurrence.raw_description)
    food = CanonicalFoodProfile(
        canonical_name=occurrence.raw_name,
        food_categories=inferred["food_categories"],
        taste_profile=inferred["taste_profile"],
        dietary_profile=inferred["dietary_profile"],
        ingredients=inferred["ingredients"],
        confirmed_allergens=inferred["confirmed_allergens"],
        possible_allergens=inferred["possible_allergens"],
        cuisine=inferred["cuisine"],
        confidence=inferred["confidence"],
        enrichment_version="heuristic-v1",
    )
    session.add(food)
    session.commit()
    session.refresh(food)

    alias = FoodAlias(
        food_id=food.id, # type: ignore
        alias=occurrence.raw_name,
        normalised_alias=occurrence.normalised_name,
        source="initial_occurrence",
    )
    session.add(alias)
    session.commit()
    from pipeline.embeddings import get_or_create_food_embedding

    get_or_create_food_embedding(session, food)
    return food


def add_alias_if_missing(
    session: Session,
    food_id: int,
    alias: str,
    normalised_alias: str,
    source: str,
) -> None:
    existing = session.exec(
        select(FoodAlias)
        .where(FoodAlias.food_id == food_id)
        .where(FoodAlias.normalised_alias == normalised_alias)
    ).first()
    if existing:
        return
    session.add(
        FoodAlias(
            food_id=food_id,
            alias=alias,
            normalised_alias=normalised_alias,
            source=source,
        )
    )
    session.commit()


def find_fuzzy_alias(session: Session, normalised_name: str) -> tuple[FoodAlias, float] | None:
    aliases = session.exec(select(FoodAlias)).all()
    scored: list[tuple[FoodAlias, float]] = []
    for alias in aliases:
        ratio = fuzz.ratio(normalised_name, alias.normalised_alias)
        token_score = fuzz.token_sort_ratio(normalised_name, alias.normalised_alias)
        score = max(ratio, token_score)
        if score >= FUZZY_ALIAS_THRESHOLD:
            scored.append((alias, score))

    if not scored:
        return None

    scored.sort(key=lambda item: item[1], reverse=True)
    if len(scored) > 1 and scored[0][1] - scored[1][1] < FUZZY_ALIAS_AMBIGUITY_GAP:
        return None
    return scored[0]


def resolve_occurrence_food(session: Session, occurrence: MenuOccurrence) -> MenuOccurrence:
    alias = session.exec(
        select(FoodAlias).where(FoodAlias.normalised_alias == occurrence.normalised_name)
    ).first()

    if alias:
        occurrence.food_id = alias.food_id
        occurrence.resolution_method = ResolutionMethod.known_alias
        occurrence.resolution_confidence = 1.0
    elif fuzzy_match := find_fuzzy_alias(session, occurrence.normalised_name):
        fuzzy_alias, score = fuzzy_match
        occurrence.food_id = fuzzy_alias.food_id
        occurrence.resolution_method = ResolutionMethod.known_variant
        occurrence.resolution_confidence = round(score / 100, 3)
        add_alias_if_missing(
            session=session,
            food_id=fuzzy_alias.food_id,
            alias=occurrence.raw_name,
            normalised_alias=occurrence.normalised_name,
            source="fuzzy_variant",
        )
    else:
        food = create_food_profile(session, occurrence)
        occurrence.food_id = food.id
        occurrence.resolution_method = ResolutionMethod.new_food
        occurrence.resolution_confidence = 1.0

    session.add(occurrence)
    session.commit()
    session.refresh(occurrence)
    return occurrence
