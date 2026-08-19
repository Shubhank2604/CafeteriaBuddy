import json

import pytest

from adapters.llm_provider import (
    GeminiFoodEnrichmentClient,
    LLMConfigError,
    StubFoodEnrichmentClient,
)


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text="") -> None:
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


class FakeHTTP:
    def __init__(self, response) -> None:
        self.response = response
        self.posts = []

    def post(self, *args, **kwargs):
        self.posts.append((args, kwargs))
        return self.response


def enrichment_json():
    return json.dumps(
        {
            "canonical_name": "Vegetable Pizza",
            "aliases": ["Veggie Pizza"],
            "food_categories": ["pizza_flatbread"],
            "meal_suitability": ["lunch"],
            "taste_profile": {"savoury": True, "sweet": False, "spicy": False},
            "cuisine": ["Italian-American"],
            "explicit_ingredients": ["vegetables"],
            "inferred_ingredients": ["cheese", "wheat crust"],
            "dietary_profile": {
                "contains_meat": False,
                "contains_pork": False,
                "contains_beef": False,
                "contains_chicken": False,
                "contains_fish": False,
                "contains_shellfish": False,
                "contains_egg": False,
                "contains_dairy": True,
                "appears_vegetarian": True,
                "appears_vegan": False,
            },
            "confirmed_allergens": [],
            "possible_allergens": ["milk", "wheat"],
            "evidence": {"contains_dairy": "strongly_inferred"},
            "confidence": 0.86,
            "warnings": ["May contain dairy; confirm with the cafe."],
        }
    )


def test_stub_provider_returns_valid_enrichment():
    result = StubFoodEnrichmentClient().enrich_food(
        {"name": "Squash Bisque", "description": None, "meal": "lunch"}
    )

    assert result.canonical_name == "Squash Bisque"
    assert "milk" in result.possible_allergens


def test_gemini_requires_key():
    with pytest.raises(LLMConfigError):
        GeminiFoodEnrichmentClient(
            base_url="https://generativelanguage.googleapis.com/v1beta",
            api_key=None,
            model="gemini-3-flash-preview",
        )


def test_gemini_parses_generate_content_json():
    http = FakeHTTP(
        FakeResponse(
            payload={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {"text": enrichment_json()},
                            ]
                        }
                    }
                ]
            }
        )
    )
    client = GeminiFoodEnrichmentClient(
        base_url="https://generativelanguage.googleapis.com/v1beta",
        api_key="secret",
        model="gemini-3-flash-preview",
        http=http,
    )

    result = client.enrich_food(
        {"name": "Vegetable Pizza", "description": None, "meal": "lunch"}
    )
    request_json = http.posts[0][1]["json"]

    assert result.canonical_name == "Vegetable Pizza"
    assert result.confidence == 0.86
    assert (
        http.posts[0][0][0]
        == "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent"
    )
    assert http.posts[0][1]["headers"]["x-goog-api-key"] == "secret"
    assert "params" not in http.posts[0][1]
    assert request_json["generationConfig"]["responseMimeType"] == "application/json"
    assert "responseSchema" in request_json["generationConfig"]
