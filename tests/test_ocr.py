from datetime import date
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from models import Meal
from pipeline.ingest import ingest_menu_image
from pipeline.ocr import run_ocr_for_ingestion


def make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def test_local_ocr_returns_normalized_lines(tmp_path):
    with make_session() as session:
        image_bytes = Path("images", "20260722", "breakfast.jpeg").read_bytes()
        ingestion, _ = ingest_menu_image(
            session=session,
            image_bytes=image_bytes,
            filename="breakfast.jpeg",
            meal=Meal.breakfast,
            menu_date=date(2026, 7, 25),
            data_dir=tmp_path,
        )

        result = run_ocr_for_ingestion(session, ingestion, data_dir=tmp_path)

        assert result.provider == "local_fixture"
        assert result.raw_response_path is not None
        assert Path(result.raw_response_path).exists()
        assert any(line.text == "FRUIT AND YOGURT BAR" for line in result.lines)
        assert all(0 <= line.x <= 1 for line in result.lines)
        assert all(0 <= line.y <= 1 for line in result.lines)
