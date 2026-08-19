from datetime import date
from pathlib import Path

from pipeline.menu_source import parse_yyyymmdd
from scripts.process_images import discover_date_folders


def test_discover_date_folders_ignores_non_date_directories(tmp_path):
    (tmp_path / "20260722").mkdir()
    (tmp_path / "not-a-date").mkdir()
    (tmp_path / "202607").mkdir()

    assert discover_date_folders(tmp_path) == [date(2026, 7, 22)]


def test_repository_image_folders_are_discoverable():
    dates = discover_date_folders(Path("images"))

    assert dates[0] == parse_yyyymmdd("20260716")
    assert dates[-1] == parse_yyyymmdd("20260722")
