from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from adapters.local_ocr import extract_local_ocr
from models import Meal
from pipeline.item_parser import parse_items
from pipeline.layout_parser import parse_layout


def _scores(expected: set, predicted: set) -> tuple[float, float, int, int, int]:
    true_positive = len(expected & predicted)
    false_positive = len(predicted - expected)
    false_negative = len(expected - predicted)
    precision = true_positive / len(predicted) if predicted else 0.0
    recall = true_positive / len(expected) if expected else 0.0
    return precision, recall, true_positive, false_positive, false_negative


def evaluate_parsing(dataset_path: str | Path) -> dict:
    dataset = json.loads(Path(dataset_path).read_text(encoding="utf-8"))
    expected_stations: set[tuple[str, str]] = set()
    predicted_stations: set[tuple[str, str]] = set()
    expected_items: set[tuple[str, str, str]] = set()
    predicted_items: set[tuple[str, str, str]] = set()
    case_results = []

    for case in dataset["cases"]:
        meal = Meal(case["meal"])
        layout = parse_layout(extract_local_ocr(Path("fixture"), meal), meal)
        items = parse_items(layout, ingestion_id=1, menu_date=date(2026, 7, 22))
        expected_stations.update((case["id"], station) for station in case["stations"])
        predicted_stations.update((case["id"], section.heading) for section in layout.sections)
        expected_items.update((case["id"], station, name) for station, name in case["items"])
        predicted_items.update((case["id"], item.station, item.raw_name) for item in items)
        case_results.append({
            "id": case["id"],
            "expected_stations": len(case["stations"]),
            "predicted_stations": len(layout.sections),
            "expected_items": len(case["items"]),
            "predicted_items": len(items),
        })

    station_precision, station_recall, _, station_fp, station_fn = _scores(
        expected_stations, predicted_stations
    )
    item_precision, item_recall, _, item_fp, item_fn = _scores(expected_items, predicted_items)
    return {
        "dataset_version": dataset["version"],
        "cases": len(dataset["cases"]),
        "expected_items": len(expected_items),
        "station_precision": round(station_precision, 4),
        "station_recall": round(station_recall, 4),
        "item_station_precision": round(item_precision, 4),
        "item_station_recall": round(item_recall, 4),
        "station_false_positives": station_fp,
        "station_false_negatives": station_fn,
        "item_false_positives": item_fp,
        "item_false_negatives": item_fn,
        "results": case_results,
    }
