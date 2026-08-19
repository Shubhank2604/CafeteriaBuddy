from datetime import date
import json
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine, select

from models import IngestionStatus, Meal, MenuOccurrence
from pipeline.ingest import ingest_menu_image
from pipeline.orchestrator import process_ingestion


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def test_process_ingestion_persists_lunch_occurrences(tmp_path):
    with make_session() as session:
        image_bytes = Path("images", "20260722", "lunch.jpeg").read_bytes()
        ingestion, _ = ingest_menu_image(
            session=session,
            image_bytes=image_bytes,
            filename="lunch.jpeg",
            meal=Meal.lunch,
            menu_date=date(2026, 7, 25),
            data_dir=tmp_path,
        )

        occurrences, validation = process_ingestion(
            session=session,
            ingestion=ingestion,
            data_dir=tmp_path,
        )
        stored = session.exec(select(MenuOccurrence)).all()

        assert ingestion.status == IngestionStatus.completed
        assert validation.status == "success"
        assert len(occurrences) == 25
        assert len(stored) == 25
        assert any(item.raw_name == "Tempura Avocado Fingers" for item in stored)
        parsed_paths = list((tmp_path / "parsed").rglob("*.json"))
        assert parsed_paths
        payload = json.loads(parsed_paths[0].read_text(encoding="utf-8"))
        assert set(payload) == {"ingestion", "validation", "stations"}
        assert payload["ingestion"]["menu_date"] == "2026-07-25"
        assert payload["ingestion"]["meal"] == "lunch"
        assert payload["validation"]["items_found"] == 25
        assert "items" not in payload
        assert payload["stations"][0]["name"] == "CHEF'S TABLE"
        assert "station" not in payload["stations"][0]["items"][0]
