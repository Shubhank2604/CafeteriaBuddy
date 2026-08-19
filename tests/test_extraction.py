from models import Meal
from adapters.local_ocr import extract_local_ocr
from pipeline.extraction import extract_menu_items_from_ocr, group_items_by_station


def test_extract_menu_items_from_ocr_returns_serializable_summary():
    ocr = extract_local_ocr("images/lunch.jpeg", Meal.lunch)
    items, validation = extract_menu_items_from_ocr(ocr, Meal.lunch)

    assert validation["status"] == "success"
    assert len(items) == 25
    assert items[0]["station"] == "CHEF'S TABLE"
    assert any(item["name"] == "Squash Bisque" for item in items)


def test_group_items_by_station_removes_repeated_station_field():
    grouped = group_items_by_station(
        [
            {"station": "HEARTH", "name": "Pizza"},
            {"station": "HEARTH", "name": "Grilled Cheese"},
            {"station": "SOUP", "name": "Bisque"},
        ]
    )

    assert grouped == [
        {"name": "HEARTH", "items": [{"name": "Pizza"}, {"name": "Grilled Cheese"}]},
        {"name": "SOUP", "items": [{"name": "Bisque"}]},
    ]
