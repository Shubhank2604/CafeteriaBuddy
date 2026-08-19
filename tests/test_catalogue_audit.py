from datetime import date

from models import CanonicalFoodProfile, Meal, MenuOccurrence
from pipeline.catalogue import normalize_food_name
from pipeline.catalogue_audit import (
    foods_needing_enrichment,
    possible_duplicate_foods,
    repeated_raw_names,
)


def occurrence(name: str, food_id: int) -> MenuOccurrence:
    return MenuOccurrence(
        ingestion_id=1,
        menu_date=date(2026, 7, 25),
        meal=Meal.lunch,
        station="SEASONAL",
        raw_name=name,
        normalised_name=normalize_food_name(name),
        food_id=food_id,
    )


def test_repeated_raw_names_reports_food_id_spread():
    repeated = repeated_raw_names(
        [
            occurrence("Papaya Salad", 1),
            occurrence("Papaya Salad", 1),
            occurrence("Papaya Salad", 2),
            occurrence("Squash Bisque", 3),
        ]
    )

    assert repeated[0].name == "Papaya Salad"
    assert repeated[0].count == 3
    assert repeated[0].food_ids == (1, 2)


def test_possible_duplicate_foods_finds_spelling_variant():
    duplicates = possible_duplicate_foods(
        [
            CanonicalFoodProfile(id=1, canonical_name="Shitake Garlic Stir-Fry"),
            CanonicalFoodProfile(id=2, canonical_name="Shiitake Garlic Stir-Fry"),
            CanonicalFoodProfile(id=3, canonical_name="Crazy Caprese Pizza"),
        ],
        threshold=88,
    )

    assert len(duplicates) == 1
    assert duplicates[0].left_id == 1
    assert duplicates[0].right_id == 2


def test_foods_needing_enrichment_flags_heuristic_low_confidence_profiles():
    rows = foods_needing_enrichment(
        [
            CanonicalFoodProfile(
                id=1,
                canonical_name="House Curry",
                confidence=0.65,
                enrichment_version="heuristic-v1",
            ),
            CanonicalFoodProfile(
                id=2,
                canonical_name="Known Food",
                food_categories=["salad"],
                dietary_profile={"appears_vegetarian": True},
                confidence=0.92,
                enrichment_version="llm-v1",
            ),
        ]
    )

    assert len(rows) == 1
    assert rows[0][1] == "House Curry"
