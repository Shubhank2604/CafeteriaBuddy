import json
from pathlib import Path


def test_generated_parsed_artifacts_are_grouped_when_present():
    parsed_root = Path("data/parsed")
    if not parsed_root.exists():
        return

    parsed_files = [
        path
        for path in parsed_root.rglob("*.json")
        if path.parent.name in {"breakfast", "lunch"}
    ]
    if not parsed_files:
        return

    for path in parsed_files:
        payload = json.loads(path.read_text(encoding="utf-8"))
        assert "stations" in payload
        assert "items" not in payload
        assert payload["validation"]["status"] == "success"
        assert payload["validation"]["items_found"] > 0
        assert all("name" in station and "items" in station for station in payload["stations"])
