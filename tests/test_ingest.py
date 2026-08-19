from datetime import date
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine, select

from models import Meal, MenuIngestion
from pipeline.ingest import calculate_image_hash, ingest_menu_image


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def read_fixture(name: str) -> bytes:
    return Path("images", "20260722", name).read_bytes()


def test_ingest_saves_image_and_record(tmp_path):
    with make_session() as session:
        image_bytes = read_fixture("breakfast.jpeg")
        ingestion, duplicate = ingest_menu_image(
            session=session,
            image_bytes=image_bytes,
            filename="breakfast.jpeg",
            meal=Meal.breakfast,
            menu_date=date(2026, 7, 25),
            data_dir=tmp_path,
        )

        stored = session.exec(select(MenuIngestion)).all()

        assert duplicate is False
        assert ingestion.id is not None
        assert ingestion.image_hash == calculate_image_hash(image_bytes)
        assert len(stored) == 1
        assert Path(ingestion.raw_image_path).exists()


def test_ingest_exact_duplicate_returns_existing_record(tmp_path):
    with make_session() as session:
        image_bytes = read_fixture("lunch.jpeg")

        first, first_duplicate = ingest_menu_image(
            session=session,
            image_bytes=image_bytes,
            filename="lunch.jpeg",
            meal=Meal.lunch,
            menu_date=date(2026, 7, 25),
            data_dir=tmp_path,
        )
        second, second_duplicate = ingest_menu_image(
            session=session,
            image_bytes=image_bytes,
            filename="lunch.jpeg",
            meal=Meal.lunch,
            menu_date=date(2026, 7, 25),
            data_dir=tmp_path,
        )

        stored = session.exec(select(MenuIngestion)).all()

        assert first_duplicate is False
        assert second_duplicate is True
        assert second.id == first.id
        assert len(stored) == 1


def test_corrected_image_creates_new_active_revision(tmp_path):
    with make_session() as session:
        breakfast = read_fixture("breakfast.jpeg")
        lunch = read_fixture("lunch.jpeg")

        first, _ = ingest_menu_image(
            session=session,
            image_bytes=breakfast,
            filename="breakfast.jpeg",
            meal=Meal.breakfast,
            menu_date=date(2026, 7, 25),
            data_dir=tmp_path,
        )
        second, duplicate = ingest_menu_image(
            session=session,
            image_bytes=lunch,
            filename="lunch.jpeg",
            meal=Meal.breakfast,
            menu_date=date(2026, 7, 25),
            data_dir=tmp_path,
        )

        session.refresh(first)
        session.refresh(second)

        assert duplicate is False
        assert first.is_active is False
        assert second.is_active is True
        assert second.revision == 2
