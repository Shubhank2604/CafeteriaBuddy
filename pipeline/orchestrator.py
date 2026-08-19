import json
from pathlib import Path

from sqlmodel import Session, select

from config import get_settings
from models import IngestionStatus, MenuIngestion, MenuOccurrence
from pipeline.catalogue import resolve_occurrence_food
from pipeline.extraction import group_items_by_station
from pipeline.item_parser import parse_items
from pipeline.layout_parser import parse_layout
from pipeline.ocr import run_ocr_for_ingestion


def save_parsed_menu(
    ingestion: MenuIngestion,
    occurrences: list[MenuOccurrence],
    validation,
    data_dir: Path | None = None,
) -> Path:
    base_dir = data_dir or get_settings().data_dir
    target_dir = base_dir / "parsed" / ingestion.menu_date.isoformat() / ingestion.meal.value
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"r{ingestion.revision}_{ingestion.image_hash[:16]}.json"
    items = [
        {
            "station": item.station,
            "name": item.raw_name,
            "description": item.raw_description,
            "normalised_name": item.normalised_name,
            "food_id": item.food_id,
            "resolution_method": item.resolution_method,
            "resolution_confidence": item.resolution_confidence,
            "ocr_confidence": item.ocr_confidence,
            "daily_attributes": item.daily_attributes,
        }
        for item in occurrences
    ]
    payload = {
        "ingestion": {
            "id": ingestion.id,
            "image_hash": ingestion.image_hash,
            "menu_date": ingestion.menu_date.isoformat(),
            "meal": ingestion.meal.value,
            "revision": ingestion.revision,
            "status": ingestion.status,
            "raw_image_path": ingestion.raw_image_path,
            "ocr_response_path": ingestion.ocr_response_path,
            "parser_version": ingestion.parser_version,
        },
        "validation": {
            **validation.model_dump(mode="json"),
            "items_found": len(occurrences),
        },
        "stations": group_items_by_station(items),
    }
    target_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return target_path


def clear_existing_occurrences(session: Session, ingestion_id: int) -> None:
    existing = session.exec(
        select(MenuOccurrence).where(MenuOccurrence.ingestion_id == ingestion_id)
    ).all()
    for occurrence in existing:
        session.delete(occurrence)


def process_ingestion(
    session: Session,
    ingestion: MenuIngestion,
    data_dir: Path | None = None,
) -> tuple[list[MenuOccurrence], object]:
    ingestion.status = IngestionStatus.processing
    session.add(ingestion)
    session.commit()
    session.refresh(ingestion)

    try:
        ocr_result = run_ocr_for_ingestion(session, ingestion, data_dir=data_dir)
        layout = parse_layout(ocr_result, ingestion.meal)
        occurrences = parse_items(
            layout=layout,
            ingestion_id=ingestion.id, # type: ignore
            menu_date=ingestion.menu_date,
        )
        clear_existing_occurrences(session, ingestion.id) # type: ignore
        for occurrence in occurrences:
            session.add(occurrence)
            session.commit()
            session.refresh(occurrence)
            resolve_occurrence_food(session, occurrence)

        ingestion.status = IngestionStatus.completed
        ingestion.parser_version = "layout-v1/item-v1"
        session.add(ingestion)
        session.commit()
        for occurrence in occurrences:
            session.refresh(occurrence)
        session.refresh(ingestion)
        save_parsed_menu(
            ingestion=ingestion,
            occurrences=occurrences,
            validation=layout.validation,
            data_dir=data_dir,
        )
        return occurrences, layout.validation
    except Exception as exc:
        ingestion.status = IngestionStatus.failed
        ingestion.error_message = str(exc)
        session.add(ingestion)
        session.commit()
        raise
