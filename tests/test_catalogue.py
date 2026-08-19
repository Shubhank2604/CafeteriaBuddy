from datetime import date

from sqlmodel import Session, SQLModel, create_engine

from sqlmodel import select

from models import FoodAlias, Meal, MenuOccurrence, ResolutionMethod
from pipeline.catalogue import normalize_food_name, resolve_occurrence_food


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def occurrence(name: str) -> MenuOccurrence:
    return MenuOccurrence(
        ingestion_id=1,
        menu_date=date(2026, 7, 25),
        meal=Meal.lunch,
        station="HEARTH",
        raw_name=name,
        normalised_name=normalize_food_name(name),
    )


def test_exact_alias_resolution_reuses_existing_food():
    with make_session() as session:
        first = occurrence("Vegetable Flatbread")
        session.add(first)
        session.commit()
        session.refresh(first)
        resolve_occurrence_food(session, first)

        second = occurrence("Vegetable Flatbread")
        session.add(second)
        session.commit()
        session.refresh(second)
        resolve_occurrence_food(session, second)

        assert second.food_id == first.food_id
        assert second.resolution_method == ResolutionMethod.known_alias


def test_fuzzy_alias_resolution_reuses_safe_spelling_variant():
    with make_session() as session:
        first = occurrence("Vegetable Flatbread")
        session.add(first)
        session.commit()
        session.refresh(first)
        resolve_occurrence_food(session, first)

        second = occurrence("Vegetable Flat Bread")
        session.add(second)
        session.commit()
        session.refresh(second)
        resolve_occurrence_food(session, second)

        assert second.food_id == first.food_id
        assert second.resolution_method == ResolutionMethod.known_variant
        assert second.resolution_confidence >= 0.94
        aliases = session.exec(
            select(FoodAlias).where(FoodAlias.normalised_alias == "vegetable flat bread")
        ).all()
        assert len(aliases) == 1
        assert aliases[0].source == "fuzzy_variant"


def test_fuzzy_alias_resolution_does_not_merge_weak_shared_tokens():
    with make_session() as session:
        first = occurrence("Nashville Hot Chicken Pizza")
        session.add(first)
        session.commit()
        session.refresh(first)
        resolve_occurrence_food(session, first)

        second = occurrence("Crazy Caprese Pizza")
        session.add(second)
        session.commit()
        session.refresh(second)
        resolve_occurrence_food(session, second)

        assert second.food_id != first.food_id
        assert second.resolution_method == ResolutionMethod.new_food
