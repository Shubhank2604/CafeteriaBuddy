from typing import Any

from models import EvidenceLevel, FoodEnrichmentResult, Meal


MEAT_TERMS = {
    "meat": ["sausage", "ham", "turkey", "bacon"],
    "pork": ["pork", "ham", "bacon", "sausage"],
    "beef": ["beef"],
    "chicken": ["chicken"],
    "fish": ["fish"],
    "shellfish": ["shrimp", "crab", "lobster", "shellfish"],
}

EGG_TERMS = ["egg", "eggs", "frittata"]
DAIRY_TERMS = [
    "cheese",
    "yogurt",
    "yoghurt",
    "cream",
    "feta",
    "parmesan",
    "caprese",
    "bisque",
    "mozzarella",
]
WHEAT_TERMS = [
    "bread",
    "bagel",
    "muffin",
    "pancake",
    "pizza",
    "wrap",
    "sub",
    "sandwich",
    "biscuit",
    "crouton",
    "soba",
]
SOY_TERMS = ["tofu", "edamame", "soy", "bean curd"]
NUT_TERMS = ["peanut", "almond", "walnut", "cashew", "pecan"]
SESAME_TERMS = ["sesame"]


def contains_any(text: str, terms: list[str]) -> bool:
    return any(term in text for term in terms)


def collect_meat_flags(text: str) -> dict[str, bool]:
    flags = {key: contains_any(text, terms) for key, terms in MEAT_TERMS.items()}
    flags["meat"] = flags["meat"] or any(
        flags[key] for key in ["pork", "beef", "chicken", "fish", "shellfish"]
    )
    return flags


def infer_possible_allergens(text: str) -> list[str]:
    allergens: list[str] = []
    if contains_any(text, DAIRY_TERMS):
        allergens.append("milk")
    if contains_any(text, EGG_TERMS):
        allergens.append("eggs")
    if contains_any(text, WHEAT_TERMS):
        allergens.append("wheat")
    if contains_any(text, SOY_TERMS):
        allergens.append("soy")
    if contains_any(text, NUT_TERMS):
        allergens.append("tree nuts")
    if contains_any(text, SESAME_TERMS):
        allergens.append("sesame")
    return allergens


def infer_food_profile(name: str, description: str | None = None) -> dict[str, Any]:
    text = f"{name} {description or ''}".lower()
    meat_flags = collect_meat_flags(text)
    contains_egg = contains_any(text, EGG_TERMS)
    contains_dairy = contains_any(text, DAIRY_TERMS)
    possible_allergens = infer_possible_allergens(text)

    categories: list[str] = []
    if "pizza" in text or "flatbread" in text:
        categories.append("pizza_flatbread")
    if "salad" in text:
        categories.append("salad")
    if "soup" in text or "bisque" in text or "chili" in text:
        categories.append("soup")
    if "wrap" in text or "sub" in text or "sandwich" in text:
        categories.append("sandwich")
    if "rice" in text:
        categories.append("rice")
    if "stir" in text:
        categories.append("stir_fry")
    if "yogurt" in text or "fruit" in text or "cereal" in text or "granola" in text:
        categories.append("breakfast_light")

    return {
        "food_categories": categories,
        "taste_profile": {
            "savoury": not any(term in text for term in ["fruit", "yogurt", "jam"]),
            "sweet": any(term in text for term in ["fruit", "yogurt", "jam", "pancake"]),
            "spicy": any(term in text for term in ["buffalo", "hot", "chili"]),
        },
        "dietary_profile": {
            "contains_meat": meat_flags["meat"],
            "contains_pork": meat_flags["pork"],
            "contains_beef": meat_flags["beef"],
            "contains_chicken": meat_flags["chicken"],
            "contains_fish": meat_flags["fish"],
            "contains_shellfish": meat_flags["shellfish"],
            "contains_egg": contains_egg,
            "contains_dairy": contains_dairy,
            "appears_vegetarian": not meat_flags["meat"],
            "appears_vegan": not meat_flags["meat"] and not contains_egg and not contains_dairy,
        },
        "ingredients": {"explicit_terms": sorted(set(text.replace("&", " ").split()))},
        "confirmed_allergens": [],
        "possible_allergens": possible_allergens,
        "cuisine": [],
        "confidence": 0.65,
    }


def heuristic_enrichment_result(
    name: str,
    description: str | None = None,
    meal: Meal = Meal.lunch,
) -> FoodEnrichmentResult:
    inferred = infer_food_profile(name, description)
    ingredients = inferred["ingredients"]["explicit_terms"]
    evidence: dict[str, EvidenceLevel] = {
        "dietary_profile": EvidenceLevel.strongly_inferred,
        "confirmed_allergens": EvidenceLevel.unknown,
        "possible_allergens": EvidenceLevel.possible,
    }
    return FoodEnrichmentResult(
        canonical_name=name,
        aliases=[name],
        food_categories=inferred["food_categories"],
        meal_suitability=[meal],
        taste_profile=inferred["taste_profile"],
        cuisine=inferred["cuisine"],
        explicit_ingredients=ingredients,
        inferred_ingredients=[],
        dietary_profile=inferred["dietary_profile"],
        confirmed_allergens=inferred["confirmed_allergens"],
        possible_allergens=inferred["possible_allergens"],
        evidence=evidence,
        confidence=inferred["confidence"],
        warnings=["Heuristic enrichment only; ingredient information is incomplete."],
    )
