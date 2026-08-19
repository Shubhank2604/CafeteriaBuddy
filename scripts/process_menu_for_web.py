import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

from sqlmodel import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import get_settings
from db import engine, init_db
from models import CanonicalFoodProfile, Meal, MenuOccurrence
from pipeline.ingest import ingest_menu_image
from pipeline.orchestrator import process_ingestion


DIETARY_TAGS = {
    "contains_meat": "meat",
    "contains_pork": "pork",
    "contains_beef": "beef",
    "contains_chicken": "chicken",
    "contains_fish": "fish",
    "contains_shellfish": "shellfish",
    "contains_egg": "egg",
    "contains_dairy": "dairy",
    "appears_vegetarian": "vegetarian",
    "appears_vegan": "vegan",
}


def _normalise_tag(value: Any) -> str:
    return str(value).strip().lower().replace(" ", "_")


def _item_tags(session: Session, occurrence: MenuOccurrence) -> list[str]:
    tags: set[str] = set()
    daily_tags = (occurrence.daily_attributes or {}).get("tags", [])
    tags.update(_normalise_tag(value) for value in daily_tags if value)

    if occurrence.food_id is None:
        return sorted(tags)

    food = session.get(CanonicalFoodProfile, occurrence.food_id)
    if not food:
        return sorted(tags)

    tags.update(_normalise_tag(value) for value in food.food_categories if value)
    tags.update(_normalise_tag(value) for value in food.confirmed_allergens if value)
    tags.update(_normalise_tag(value) for value in food.possible_allergens if value)
    for field, tag in DIETARY_TAGS.items():
        if (food.dietary_profile or {}).get(field) is True:
            tags.add(tag)
    return sorted(tags)


def _structured_menu(
    session: Session,
    menu_date: date,
    meal: Meal,
    occurrences: list[MenuOccurrence],
) -> dict[str, Any]:
    stations: dict[str, list[dict[str, Any]]] = {}
    for occurrence in occurrences:
        stations.setdefault(occurrence.station, []).append(
            {
                "name": occurrence.raw_name,
                "tags": _item_tags(session, occurrence),
                "notes": occurrence.raw_description,
            }
        )

    return {
        "date": menu_date.isoformat(),
        "meals": [
            {
                "type": meal.value,
                "stations": [
                    {"name": station, "items": items}
                    for station, items in stations.items()
                ],
            }
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Process one menu image for the MealWorks web app."
    )
    parser.add_argument("--image", type=Path, required=True)
    parser.add_argument("--date", type=date.fromisoformat, required=True)
    parser.add_argument("--meal", choices=[meal.value for meal in Meal], required=True)
    args = parser.parse_args()

    try:
        image_path = args.image.resolve(strict=True)
        meal = Meal(args.meal)
        init_db()
        with Session(engine) as session:
            ingestion, duplicate = ingest_menu_image(
                session=session,
                image_bytes=image_path.read_bytes(),
                filename=image_path.name,
                meal=meal,
                menu_date=args.date,
            )
            occurrences, validation = process_ingestion(
                session=session,
                ingestion=ingestion,
            )
            payload = {
                "ok": True,
                "source": f"python:{get_settings().ocr_provider}",
                "duplicate": duplicate,
                "ingestion_id": ingestion.id,
                "validation": validation.model_dump(mode="json"),
                "menu": _structured_menu(
                    session=session,
                    menu_date=args.date,
                    meal=meal,
                    occurrences=occurrences,
                ),
            }
            print(json.dumps(payload, separators=(",", ":")))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
