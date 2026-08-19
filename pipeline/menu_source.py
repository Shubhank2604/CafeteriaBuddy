from datetime import date
from pathlib import Path

from models import Meal


def parse_yyyymmdd(value: str) -> date:
    if len(value) != 8 or not value.isdigit():
        raise ValueError("Date folder must be in YYYYMMDD format.")
    return date(int(value[:4]), int(value[4:6]), int(value[6:8]))


def format_yyyymmdd(value: date) -> str:
    return value.strftime("%Y%m%d")


def meal_image_path(image_root: Path, menu_date: date, meal: Meal) -> Path:
    folder = image_root / format_yyyymmdd(menu_date)
    for extension in (".jpeg", ".jpg", ".png"):
        candidate = folder / f"{meal.value}{extension}"
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        f"No {meal.value} image found under {folder} with .jpeg, .jpg, or .png."
    )
