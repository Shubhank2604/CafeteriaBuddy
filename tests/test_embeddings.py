from sqlmodel import Session, SQLModel, create_engine, select
import pytest

from models import DietaryPattern, FoodEmbedding, Meal, PreferenceEmbedding, UserCreate, UserPreferenceProfileCreate
from pipeline.embeddings import cosine_similarity, embed_text
from pipeline.profile import create_user, upsert_user_profile


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def test_local_embedding_is_deterministic_and_normalized():
    first = embed_text("Vegetable pizza")
    second = embed_text("vegetable pizza")

    assert first == second
    assert cosine_similarity(first, second) == pytest.approx(1.0)


def test_profile_upsert_refreshes_preference_embeddings():
    with make_session() as session:
        user = create_user(session, UserCreate(name="Embeddings User"))
        upsert_user_profile(
            session,
            user.id,
            UserPreferenceProfileCreate(
                dietary_pattern=DietaryPattern.standard,
                ideal_breakfast_items=["avocado toast"],
                ideal_lunch_items=["vegetable pizza", "rice"],
                disliked_foods=["mushrooms"],
            ),
        )

        embeddings = session.exec(select(PreferenceEmbedding)).all()

        assert len(embeddings) == 4
        assert {embedding.preference_type for embedding in embeddings} == {
            "positive",
            "dislike",
        }
        assert any(embedding.meal == Meal.lunch for embedding in embeddings)
