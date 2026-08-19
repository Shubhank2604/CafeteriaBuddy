from datetime import date

from sqlmodel import Session, SQLModel, create_engine, select

from models import CanonicalFoodProfile, FoodAlias, FoodEnrichmentResult, Meal, MenuOccurrence
from pipeline.catalogue import normalize_food_name
from pipeline.llm_enrichment import (
    apply_food_enrichment,
    enrichment_payload,
    foods_for_llm_enrichment,
)


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def test_enrichment_payload_includes_occurrence_examples():
    food = CanonicalFoodProfile(id=1, canonical_name="Squash Bisque", confidence=0.65)
    occurrence = MenuOccurrence(
        ingestion_id=1,
        menu_date=date(2026, 7, 25),
        meal=Meal.lunch,
        station="SOUP",
        raw_name="Squash Bisque",
        normalised_name=normalize_food_name("Squash Bisque"),
        food_id=1,
    )

    payload = enrichment_payload(food, [occurrence])

    assert payload["name"] == "Squash Bisque"
    assert payload["meal"] == "lunch"
    assert payload["menu_examples"][0]["station"] == "SOUP"


def test_apply_food_enrichment_updates_profile_and_aliases():
    with make_session() as session:
        food = CanonicalFoodProfile(canonical_name="Veg Pizza", confidence=0.65)
        session.add(food)
        session.commit()
        session.refresh(food)

        result = FoodEnrichmentResult(
            canonical_name="Vegetable Pizza",
            aliases=["Veg Pizza"],
            food_categories=["pizza_flatbread"],
            meal_suitability=[Meal.lunch],
            taste_profile={"savoury": True},
            explicit_ingredients=["vegetables"],
            inferred_ingredients=["cheese"],
            dietary_profile={"contains_dairy": True, "appears_vegetarian": True},
            possible_allergens=["milk", "wheat"],
            confidence=0.88,
        )

        apply_food_enrichment(session, food, result, provider_name="test")
        aliases = session.exec(select(FoodAlias)).all()

        assert food.canonical_name == "Vegetable Pizza"
        assert food.enrichment_version == "llm-v1:test"
        assert food.confidence == 0.88
        assert {alias.normalised_alias for alias in aliases} == {
            "vegetable pizza",
            "veg pizza",
        }


def test_foods_for_llm_enrichment_prioritizes_heuristic_low_confidence():
    with make_session() as session:
        session.add(
            CanonicalFoodProfile(
                canonical_name="Needs Work",
                confidence=0.65,
                enrichment_version="heuristic-v1",
            )
        )
        session.add(
            CanonicalFoodProfile(
                canonical_name="Done",
                food_categories=["salad"],
                confidence=0.92,
                enrichment_version="llm-v1:test",
            )
        )
        session.commit()

        candidates = foods_for_llm_enrichment(session, limit=10)

        assert [food.canonical_name for food in candidates] == ["Needs Work"]
