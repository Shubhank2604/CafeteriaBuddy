from datetime import date

from adapters.local_ocr import extract_local_ocr
from models import Meal
from pipeline.item_parser import parse_items
from pipeline.layout_parser import parse_layout


def item_names(items):
    return [item.raw_name for item in items]


def test_breakfast_layout_and_items_from_fixture():
    ocr = extract_local_ocr("images/breakfast.jpeg", Meal.breakfast)
    layout = parse_layout(ocr, Meal.breakfast)
    items = parse_items(layout, ingestion_id=1, menu_date=date(2026, 7, 25))

    names = item_names(items)

    assert layout.validation.status == "success"
    assert layout.validation.headings_found == 4
    assert "Squash Blossom & Goat Cheese Frittata" in names
    assert "Little Northern Bakehouse Gluten Free Wheat Bread" in names
    assert "Strawberry Yogurt" in names
    assert len(items) == 30


def test_lunch_layout_and_sandwich_descriptions_from_fixture():
    ocr = extract_local_ocr("images/lunch.jpeg", Meal.lunch)
    layout = parse_layout(ocr, Meal.lunch)
    items = parse_items(layout, ingestion_id=1, menu_date=date(2026, 7, 25))

    by_name = {item.raw_name: item for item in items}

    assert layout.validation.status == "success"
    assert layout.validation.headings_found == 7
    assert "Buffalo Chicken Wrap" in by_name
    assert "Arancini alla Nonna with Pomodoro Sauce" in by_name
    assert "Zesty Roasted Potatoes" in by_name
    assert "Romaine" in by_name["Buffalo Chicken Wrap"].raw_description
    assert "Chickpea Caesar Wrap" in by_name
    assert "Vegetarian Caesar Dressing" in by_name["Chickpea Caesar Wrap"].raw_description
    assert "Bell Pepper & Shitake Garlic Stir-Fry" in by_name
    assert by_name["Bell Pepper & Shitake Garlic Stir-Fry"].raw_description is None
    assert len(items) == 25
