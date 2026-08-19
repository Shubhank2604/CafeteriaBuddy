from dataclasses import dataclass
from typing import Any

from sqlmodel import Session, select

from adapters.llm_provider import FoodEnrichmentClient, get_food_enrichment_client
from models import CanonicalFoodProfile, FoodAlias, FoodEnrichmentResult, MenuOccurrence, utc_now
from pipeline.catalogue import add_alias_if_missing, normalize_food_name
from pipeline.embeddings import get_or_create_food_embedding


LLM_ENRICHMENT_VERSION = "llm-v1"


@dataclass(frozen=True)
class EnrichmentPreview:
    food_id: int
    canonical_name: str
    occurrence_count: int
    payload: dict[str, Any]


def food_occurrences(session: Session, food_id: int) -> list[MenuOccurrence]:
    return session.exec(
        select(MenuOccurrence)
        .where(MenuOccurrence.food_id == food_id)
        .order_by(MenuOccurrence.menu_date, MenuOccurrence.meal)
    ).all()


def enrichment_payload(
    food: CanonicalFoodProfile,
    occurrences: list[MenuOccurrence],
) -> dict[str, Any]:
    examples = [
        {
            "menu_date": occurrence.menu_date.isoformat(),
            "meal": occurrence.meal.value,
            "station": occurrence.station,
            "name": occurrence.raw_name,
            "description": occurrence.raw_description,
        }
        for occurrence in occurrences[:8]
    ]
    first = occurrences[0] if occurrences else None
    return {
        "food_id": food.id,
        "name": food.canonical_name,
        "description": first.raw_description if first else None,
        "meal": first.meal.value if first else "lunch",
        "station": first.station if first else None,
        "existing_profile": {
            "food_categories": food.food_categories,
            "taste_profile": food.taste_profile,
            "dietary_profile": food.dietary_profile,
            "confirmed_allergens": food.confirmed_allergens,
            "possible_allergens": food.possible_allergens,
            "confidence": food.confidence,
            "enrichment_version": food.enrichment_version,
        },
        "menu_examples": examples,
    }


def apply_food_enrichment(
    session: Session,
    food: CanonicalFoodProfile,
    result: FoodEnrichmentResult,
    provider_name: str,
) -> CanonicalFoodProfile:
    food.canonical_name = result.canonical_name
    food.food_categories = result.food_categories
    food.taste_profile = result.taste_profile
    food.dietary_profile = result.dietary_profile
    food.ingredients = {
        "explicit": result.explicit_ingredients,
        "inferred": result.inferred_ingredients,
        "evidence": {key: value.value for key, value in result.evidence.items()},
        "warnings": result.warnings,
    }
    food.confirmed_allergens = result.confirmed_allergens
    food.possible_allergens = result.possible_allergens
    food.cuisine = result.cuisine
    food.confidence = result.confidence
    food.enrichment_version = f"{LLM_ENRICHMENT_VERSION}:{provider_name}"
    food.updated_at = utc_now()
    session.add(food)
    session.commit()
    session.refresh(food)

    for alias in [result.canonical_name, *result.aliases]:
        add_alias_if_missing(
            session=session,
            food_id=food.id,  # type: ignore[arg-type]
            alias=alias,
            normalised_alias=normalize_food_name(alias),
            source=f"llm:{provider_name}",
        )

    get_or_create_food_embedding(session, food)
    return food


def foods_for_llm_enrichment(
    session: Session,
    limit: int,
) -> list[CanonicalFoodProfile]:
    foods = session.exec(select(CanonicalFoodProfile)).all()
    candidates = [
        food
        for food in foods
        if food.id is not None
        and (
            food.enrichment_version.startswith("heuristic")
            or food.confidence < 0.75
            or not food.food_categories
        )
    ]
    candidates.sort(key=lambda food: (food.confidence, food.canonical_name))
    return candidates[:limit]


def preview_enrichment_queue(session: Session, limit: int) -> list[EnrichmentPreview]:
    previews: list[EnrichmentPreview] = []
    for food in foods_for_llm_enrichment(session, limit):
        occurrences = food_occurrences(session, food.id)  # type: ignore[arg-type]
        previews.append(
            EnrichmentPreview(
                food_id=food.id,  # type: ignore[arg-type]
                canonical_name=food.canonical_name,
                occurrence_count=len(occurrences),
                payload=enrichment_payload(food, occurrences),
            )
        )
    return previews


def enrich_foods(
    session: Session,
    limit: int,
    apply: bool = False,
    client: FoodEnrichmentClient | None = None,
) -> list[tuple[EnrichmentPreview, FoodEnrichmentResult | None]]:
    client = client or get_food_enrichment_client()
    output: list[tuple[EnrichmentPreview, FoodEnrichmentResult | None]] = []
    for preview in preview_enrichment_queue(session, limit):
        if not apply:
            output.append((preview, None))
            continue
        food = session.get(CanonicalFoodProfile, preview.food_id)
        if not food:
            continue
        result = client.enrich_food(preview.payload)
        apply_food_enrichment(session, food, result, client.provider_name)
        output.append((preview, result))
    return output
