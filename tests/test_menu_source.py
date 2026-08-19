from datetime import date
from pathlib import Path

import pytest

from models import Meal
from pipeline.menu_source import format_yyyymmdd, meal_image_path, parse_yyyymmdd


def test_parse_and_format_yyyymmdd():
    parsed = parse_yyyymmdd("20260722")

    assert parsed == date(2026, 7, 22)
    assert format_yyyymmdd(parsed) == "20260722"


def test_parse_yyyymmdd_rejects_bad_shape():
    with pytest.raises(ValueError):
        parse_yyyymmdd("2026-07-22")


def test_meal_image_path_finds_jpg_or_jpeg():
    assert meal_image_path(Path("images"), date(2026, 7, 16), Meal.lunch).name == "lunch.jpg"
    assert (
        meal_image_path(Path("images"), date(2026, 7, 22), Meal.breakfast).name
        == "breakfast.jpeg"
    )
