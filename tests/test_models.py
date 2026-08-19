from datetime import date

from db import init_db
from models import Meal, UserMenuVerdict


def test_user_menu_verdict_serializes():
    verdict = UserMenuVerdict(
        user_id=1,
        menu_date=date(2026, 7, 25),
        meal=Meal.lunch,
        verdict="No menu items have been matched yet.",
    )

    payload = verdict.model_dump(mode="json")

    assert payload["user_id"] == 1
    assert payload["meal"] == "lunch"
    assert payload["exciting_matches"] == []


def test_database_initializes():
    init_db()
