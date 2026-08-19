import json
from typing import Any, Protocol

import requests

from config import get_settings
from models import FoodEnrichmentResult, Meal
from pipeline.enrich import heuristic_enrichment_result


class LLMConfigError(ValueError):
    pass


class LLMProviderError(RuntimeError):
    pass


class FoodEnrichmentClient(Protocol):
    provider_name: str

    def enrich_food(self, payload: dict[str, Any]) -> FoodEnrichmentResult:
        ...


class StubFoodEnrichmentClient:
    provider_name = "stub"

    def enrich_food(self, payload: dict[str, Any]) -> FoodEnrichmentResult:
        return heuristic_enrichment_result(
            name=str(payload["name"]),
            description=payload.get("description"),
            meal=Meal(str(payload["meal"])),
        )


class GeminiFoodEnrichmentClient:
    provider_name = "gemini"

    def __init__(
        self,
        base_url: str,
        api_key: str | None,
        model: str,
        http: requests.Session | None = None,
    ) -> None:
        if not api_key:
            raise LLMConfigError("GEMINI_API_KEY is required.")
        if not model:
            raise LLMConfigError("GEMINI_MODEL is required.")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.http = http or requests.Session()

    def enrich_food(self, payload: dict[str, Any]) -> FoodEnrichmentResult:
        content = self._generate_json(payload)
        try:
            return FoodEnrichmentResult.model_validate_json(content)
        except Exception:
            repaired = self._generate_json(
                {
                    "repair_instruction": "Return only valid JSON matching the enrichment schema.",
                    "invalid_json": content,
                    "original_payload": payload,
                }
            )
            return FoodEnrichmentResult.model_validate_json(repaired)

    def _generate_json(self, payload: dict[str, Any]) -> str:
        try:
            response = self.http.post(
                f"{self.base_url}/models/{self.model}:generateContent",
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": self.api_key,
                },
                json={
                    "systemInstruction": {
                        "parts": [{"text": enrichment_system_prompt()}],
                    },
                    "contents": [
                        {
                            "role": "user",
                            "parts": [
                                {
                                    "text": json.dumps(payload, ensure_ascii=False),
                                }
                            ],
                        }
                    ],
                    "generationConfig": {
                        "temperature": 0,
                        "responseMimeType": "application/json",
                        "responseSchema": gemini_enrichment_schema(),
                    },
                },
                timeout=60,
            )
        except requests.RequestException as exc:
            raise LLMProviderError("Gemini request failed before receiving a response.") from exc
        if response.status_code != 200:
            raise LLMProviderError(
                f"Gemini request failed with status {response.status_code}: {response.text}"
            )
        data = response.json()
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMProviderError("Gemini response did not contain text content.") from exc


def gemini_enrichment_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "canonical_name": {"type": "string"},
            "aliases": {"type": "array", "items": {"type": "string"}},
            "food_categories": {"type": "array", "items": {"type": "string"}},
            "meal_suitability": {
                "type": "array",
                "items": {"type": "string", "enum": ["breakfast", "lunch"]},
            },
            "taste_profile": {
                "type": "object",
                "properties": {
                    "savoury": {"type": "boolean"},
                    "sweet": {"type": "boolean"},
                    "spicy": {"type": "boolean"},
                },
            },
            "cuisine": {"type": "array", "items": {"type": "string"}},
            "explicit_ingredients": {"type": "array", "items": {"type": "string"}},
            "inferred_ingredients": {"type": "array", "items": {"type": "string"}},
            "dietary_profile": {
                "type": "object",
                "properties": {
                    "contains_meat": {"type": "boolean"},
                    "contains_pork": {"type": "boolean"},
                    "contains_beef": {"type": "boolean"},
                    "contains_chicken": {"type": "boolean"},
                    "contains_fish": {"type": "boolean"},
                    "contains_shellfish": {"type": "boolean"},
                    "contains_egg": {"type": "boolean"},
                    "contains_dairy": {"type": "boolean"},
                    "appears_vegetarian": {"type": "boolean"},
                    "appears_vegan": {"type": "boolean"},
                },
            },
            "confirmed_allergens": {"type": "array", "items": {"type": "string"}},
            "possible_allergens": {"type": "array", "items": {"type": "string"}},
            "evidence": {
                "type": "object",
                "properties": {
                    "dietary_profile": {"type": "string", "enum": evidence_levels()},
                    "meat": {"type": "string", "enum": evidence_levels()},
                    "egg": {"type": "string", "enum": evidence_levels()},
                    "dairy": {"type": "string", "enum": evidence_levels()},
                    "confirmed_allergens": {"type": "string", "enum": evidence_levels()},
                    "possible_allergens": {"type": "string", "enum": evidence_levels()},
                },
            },
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "warnings": {"type": "array", "items": {"type": "string"}},
        },
        "required": [
            "canonical_name",
            "aliases",
            "food_categories",
            "meal_suitability",
            "taste_profile",
            "cuisine",
            "explicit_ingredients",
            "inferred_ingredients",
            "dietary_profile",
            "confirmed_allergens",
            "possible_allergens",
            "evidence",
            "confidence",
            "warnings",
        ],
    }


def evidence_levels() -> list[str]:
    return ["confirmed", "strongly_inferred", "possible", "unknown"]


def enrichment_system_prompt() -> str:
    return """
You enrich cafe menu foods into strict JSON.
Do not claim allergen safety. If ingredient evidence is incomplete, use possible_allergens and warnings.
Return exactly this JSON object shape:
{
  "canonical_name": string,
  "aliases": [string],
  "food_categories": [string],
  "meal_suitability": ["breakfast"|"lunch"],
  "taste_profile": {"savoury": boolean, "sweet": boolean, "spicy": boolean},
  "cuisine": [string],
  "explicit_ingredients": [string],
  "inferred_ingredients": [string],
  "dietary_profile": {
    "contains_meat": boolean,
    "contains_pork": boolean,
    "contains_beef": boolean,
    "contains_chicken": boolean,
    "contains_fish": boolean,
    "contains_shellfish": boolean,
    "contains_egg": boolean,
    "contains_dairy": boolean,
    "appears_vegetarian": boolean,
    "appears_vegan": boolean
  },
  "confirmed_allergens": [string],
  "possible_allergens": [string],
  "evidence": {
    "dietary_profile": "confirmed"|"strongly_inferred"|"possible"|"unknown",
    "meat": "confirmed"|"strongly_inferred"|"possible"|"unknown",
    "egg": "confirmed"|"strongly_inferred"|"possible"|"unknown",
    "dairy": "confirmed"|"strongly_inferred"|"possible"|"unknown",
    "confirmed_allergens": "confirmed"|"strongly_inferred"|"possible"|"unknown",
    "possible_allergens": "confirmed"|"strongly_inferred"|"possible"|"unknown"
  },
  "confidence": number between 0 and 1,
  "warnings": [string]
}
""".strip()


def get_food_enrichment_client() -> FoodEnrichmentClient:
    settings = get_settings()
    if settings.llm_provider == "stub":
        return StubFoodEnrichmentClient()
    if settings.llm_provider == "gemini":
        return GeminiFoodEnrichmentClient(
            base_url=settings.gemini_base_url,
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
        )
    raise LLMConfigError(f"Unsupported LLM_PROVIDER: {settings.llm_provider}")
