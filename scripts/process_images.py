import sys
from datetime import date
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session

from models import IngestionStatus, Meal
from pipeline.ingest import ingest_menu_image
from pipeline.menu_source import meal_image_path, parse_yyyymmdd
from pipeline.orchestrator import process_ingestion


def process_image(
    session: Session,
    image_path: Path,
    meal: Meal,
    menu_date: date,
    force: bool = False,
) -> str:
    ingestion, duplicate = ingest_menu_image(
        session=session,
        image_bytes=image_path.read_bytes(),
        filename=image_path.name,
        meal=meal,
        menu_date=menu_date,
    )
    if duplicate and ingestion.status == IngestionStatus.completed and not force:
        return f"{menu_date.isoformat()} {meal.value}: already processed ingestion_id={ingestion.id}"

    raw_image_path = Path(ingestion.raw_image_path)
    if force and not raw_image_path.exists():
        raw_image_path.parent.mkdir(parents=True, exist_ok=True)
        raw_image_path.write_bytes(image_path.read_bytes())

    occurrences, validation = process_ingestion(session=session, ingestion=ingestion)
    return (
        f"{menu_date.isoformat()} {meal.value}: ingestion_id={ingestion.id}, "
        f"items={len(occurrences)}, validation={validation.status}"  # type: ignore
    )


def process_date(
    session: Session,
    image_root: Path,
    menu_date: date,
    force: bool = False,
) -> list[str]:
    messages: list[str] = []
    for meal in (Meal.breakfast, Meal.lunch):
        image_path = meal_image_path(image_root, menu_date, meal)
        messages.append(process_image(session, image_path, meal, menu_date, force=force))
    return messages


def discover_date_folders(image_root: Path) -> list[date]:
    dates: list[date] = []
    for folder in image_root.iterdir():
        if not folder.is_dir():
            continue
        try:
            dates.append(parse_yyyymmdd(folder.name))
        except ValueError:
            continue
    return sorted(dates)
