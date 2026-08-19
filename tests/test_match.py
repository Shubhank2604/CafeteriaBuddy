from datetime import date
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from models import DietaryPattern, Meal, UserCreate, UserPreferenceProfileCreate
from pipeline.ingest import ingest_menu_image
from pipeline.match import build_verdict
from pipeline.orchestrator import process_ingestion
from pipeline.profile import create_user, upsert_user_profile


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def prepare_lunch(session, tmp_path):
    image_bytes = Path("images", "20260722", "lunch.jpeg").read_bytes()
    ingestion, _ = ingest_menu_image(
        session=session,
        image_bytes=image_bytes,
        filename="lunch.jpeg",
        meal=Meal.lunch,
        menu_date=date(2026, 7, 25),
        data_dir=tmp_path,
    )
    process_ingestion(session=session, ingestion=ingestion, data_dir=tmp_path)


def test_vegetarian_lunch_verdict_excludes_meat_and_ranks_preferences(tmp_path):
    with make_session() as session:
        prepare_lunch(session, tmp_path)
        user = create_user(session, UserCreate(name="Schandak"))
        upsert_user_profile(
            session,
            user.id,
            UserPreferenceProfileCreate(
                dietary_pattern=DietaryPattern.vegetarian,
                foods_not_consumed=[],
                allergens=[],
                other_avoidances=[],
                ideal_lunch_items=["vegetable pizza", "avocado", "rice", "stir fry"],
                disliked_foods=["mushrooms"],
            ),
        )

        verdict = build_verdict(session, user.id, date(2026, 7, 25), Meal.lunch)
        exciting_names = {item.item for item in verdict.exciting_matches}
        excluded_names = {item.item for item in verdict.not_suitable}

        assert verdict.verdict == "Happy lunch day"
        assert "Tempura Avocado Fingers" in exciting_names
        assert "Edamame, Coriander, & Lime Rice" in exciting_names
        assert "Bell Pepper & Shitake Garlic Stir-Fry" in exciting_names
        assert "Chicken Scarpariello with Sausage" in excluded_names
        assert "Beef Chili" in excluded_names


def test_milk_allergy_moves_possible_dairy_to_check_with_cafe(tmp_path):
    with make_session() as session:
        prepare_lunch(session, tmp_path)
        user = create_user(session, UserCreate(name="Milk Allergy User"))
        upsert_user_profile(
            session,
            user.id,
            UserPreferenceProfileCreate(
                dietary_pattern=DietaryPattern.standard,
                foods_not_consumed=[],
                allergens=["milk"],
                other_avoidances=[],
                ideal_lunch_items=["pizza", "soup"],
                disliked_foods=[],
            ),
        )

        verdict = build_verdict(session, user.id, date(2026, 7, 25), Meal.lunch)
        check_names = {item.item for item in verdict.check_with_cafe}

        assert "Crazy Caprese Pizza" in check_names
        assert "Squash Bisque" in check_names
