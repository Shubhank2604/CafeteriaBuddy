from datetime import date

from sqlmodel import Session, SQLModel, create_engine, select

from models import (
    CanonicalFoodProfile,
    FoodAlias,
    FoodEmbedding,
    Meal,
    MenuOccurrence,
)
from pipeline.catalogue import normalize_food_name
from pipeline.catalogue_cleanup import cleanup_orphan_foods


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def add_food(session: Session, name: str) -> CanonicalFoodProfile:
    food = CanonicalFoodProfile(canonical_name=name)
    session.add(food)
    session.commit()
    session.refresh(food)
    session.add(
        FoodAlias(
            food_id=food.id,
            alias=name,
            normalised_alias=normalize_food_name(name),
            source="test",
        )
    )
    session.add(
        FoodEmbedding(
            food_id=food.id,
            embedding=[1.0],
            embedding_model="test",
            embedding_version="v1",
            embedded_text_hash=normalize_food_name(name),
        )
    )
    session.commit()
    return food


def test_cleanup_orphan_foods_dry_run_does_not_delete():
    with make_session() as session:
        add_food(session, "Stale Merged Food")

        result = cleanup_orphan_foods(session, apply=False)

        assert len(result.orphan_foods) == 1
        assert result.deleted_foods == 0
        assert len(session.exec(select(CanonicalFoodProfile)).all()) == 1


def test_cleanup_orphan_foods_deletes_only_unreferenced_records():
    with make_session() as session:
        referenced = add_food(session, "Papaya Salad")
        stale = add_food(session, "Stale Merged Food")
        session.add(
            MenuOccurrence(
                ingestion_id=1,
                menu_date=date(2026, 7, 25),
                meal=Meal.lunch,
                station="SALAD",
                raw_name="Papaya Salad",
                normalised_name="papaya salad",
                food_id=referenced.id,
            )
        )
        session.commit()

        result = cleanup_orphan_foods(session, apply=True)
        remaining_foods = session.exec(select(CanonicalFoodProfile)).all()
        remaining_aliases = session.exec(select(FoodAlias)).all()
        remaining_embeddings = session.exec(select(FoodEmbedding)).all()

        assert [orphan.food_id for orphan in result.orphan_foods] == [stale.id]
        assert result.deleted_foods == 1
        assert result.deleted_aliases == 1
        assert result.deleted_embeddings == 1
        assert [food.id for food in remaining_foods] == [referenced.id]
        assert [alias.food_id for alias in remaining_aliases] == [referenced.id]
        assert [embedding.food_id for embedding in remaining_embeddings] == [
            referenced.id
        ]
