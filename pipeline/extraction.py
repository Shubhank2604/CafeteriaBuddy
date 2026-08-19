from pathlib import Path

from models import Meal, OCRResult
from pipeline.item_parser import parse_items
from pipeline.layout_parser import parse_layout


def group_items_by_station(items: list[dict[str, object]]) -> list[dict[str, object]]:
    grouped: list[dict[str, object]] = []
    station_index: dict[str, dict[str, object]] = {}

    for item in items:
        station = str(item["station"])
        if station not in station_index:
            station_group = {"name": station, "items": []}
            grouped.append(station_group)
            station_index[station] = station_group

        compact_item = {key: value for key, value in item.items() if key != "station"}
        station_index[station]["items"].append(compact_item)  # type: ignore[index]

    return grouped


def extract_menu_items_from_ocr(
    ocr_result: OCRResult,
    meal: Meal,
    ingestion_id: int = 0,
    menu_date=None,
) -> tuple[list[dict[str, object]], dict[str, object]]:
    layout = parse_layout(ocr_result, meal)
    occurrences = parse_items(
        layout=layout,
        ingestion_id=ingestion_id,
        menu_date=menu_date,
    )
    items = [
        {
            "station": item.station,
            "name": item.raw_name,
            "description": item.raw_description,
            "ocr_confidence": item.ocr_confidence,
        }
        for item in occurrences
    ]
    validation = layout.validation.model_dump(mode="json")
    validation["items_found"] = len(items)
    return items, validation


def write_extraction_json(
    path: Path,
    meal: Meal,
    provider: str,
    items: list[dict[str, object]],
    validation: dict[str, object],
) -> None:
    import json

    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "meal": meal.value,
        "provider": provider,
        "validation": {**validation, "items_found": len(items)},
        "stations": group_items_by_station(items),
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
