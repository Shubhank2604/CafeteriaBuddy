from sqlmodel import Session, SQLModel, create_engine

from models import DietaryPattern, UserCreate, UserPreferenceProfileCreate
from pipeline.profile import compile_restrictions, create_user, upsert_user_profile


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def test_compile_restrictions_keeps_signal_types_separate():
    payload = UserPreferenceProfileCreate(
        dietary_pattern=DietaryPattern.vegetarian,
        foods_not_consumed=["No eggs", "No pork"],
        allergens=["Milk"],
        other_avoidances=["Mushrooms"],
        ideal_lunch_items=["tofu stir-fry, vegetable pizza"],
        disliked_foods=["cold sandwiches"],
    )

    compiled = compile_restrictions(payload)

    assert "meat" in compiled["dietary_exclusions"]
    assert compiled["personal_exclusions"] == ["egg", "pork"]
    assert compiled["allergens"] == ["milk"]
    assert compiled["flags"] == ["mushrooms"]
    assert "egg" in compiled["strict_exclusions"]


def test_create_user_and_profile_normalizes_preferences():
    with make_session() as session:
        user = create_user(session, UserCreate(name="Schandak"))
        profile = upsert_user_profile(
            session,
            user.id,
            UserPreferenceProfileCreate(
                dietary_pattern=DietaryPattern.vegetarian,
                foods_not_consumed=["No eggs"],
                allergens=[],
                other_avoidances=[],
                ideal_breakfast_items=["Avocado toast\nMasala dosa"],
                ideal_lunch_items=["Tofu Stir-Fry, Vegetable Pizza"],
                disliked_foods=["Cold sandwiches"],
            ),
        )

        assert user.id is not None
        assert profile.ideal_breakfast_items == ["avocado toast", "masala dosa"]
        assert profile.ideal_lunch_items == ["tofu stir-fry", "vegetable pizza"]
        assert profile.disliked_foods == ["cold sandwiches"]
        assert profile.compiled_restrictions["strict_exclusions"]
