from datetime import date, datetime, timezone
from enum import Enum
from typing import Any

from sqlalchemy import Column
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Meal(str, Enum):
    breakfast = "breakfast"
    lunch = "lunch"


class DietaryPattern(str, Enum):
    vegan = "vegan"
    vegetarian = "vegetarian"
    standard = "standard"


class IngestionStatus(str, Enum):
    received = "received"
    processing = "processing"
    completed = "completed"
    failed = "failed"
    duplicate = "duplicate"


class ResolutionMethod(str, Enum):
    exact_known = "EXACT_KNOWN"
    known_alias = "KNOWN_ALIAS"
    known_variant = "KNOWN_VARIANT"
    possible_match = "POSSIBLE_MATCH"
    new_food = "NEW_FOOD"


class ConstraintStatus(str, Enum):
    allowed = "allowed"
    excluded = "excluded"
    check_with_cafe = "check_with_cafe"


class EvidenceLevel(str, Enum):
    confirmed = "confirmed"
    strongly_inferred = "strongly_inferred"
    possible = "possible"
    unknown = "unknown"


class OCRLine(SQLModel):
    text: str
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    width: float = Field(ge=0.0, le=1.0)
    height: float = Field(ge=0.0, le=1.0)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class OCRResult(SQLModel):
    image_path: str
    provider: str
    lines: list[OCRLine] = Field(default_factory=list)
    raw_response_path: str | None = None


class ParseValidationSummary(SQLModel):
    status: str
    template: Meal
    headings_found: int
    headings_expected: int
    items_found: int
    unassigned_lines: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class MenuIngestion(SQLModel, table=True):
    __tablename__ = "menu_ingestions" # type: ignore

    id: int | None = Field(default=None, primary_key=True)
    image_hash: str = Field(index=True)
    menu_date: date = Field(index=True)
    meal: Meal = Field(index=True)
    revision: int = Field(default=1)
    status: IngestionStatus = Field(default=IngestionStatus.received, index=True)
    raw_image_path: str
    ocr_response_path: str | None = None
    parser_version: str | None = None
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=utc_now)
    completed_at: datetime | None = None
    error_message: str | None = None


class MenuOccurrence(SQLModel, table=True):
    __tablename__ = "menu_occurrences" # type: ignore

    id: int | None = Field(default=None, primary_key=True)
    ingestion_id: int = Field(foreign_key="menu_ingestions.id", index=True)
    menu_date: date = Field(index=True)
    meal: Meal = Field(index=True)
    station: str
    raw_name: str
    raw_description: str | None = None
    normalised_name: str = Field(index=True)
    food_id: int | None = Field(default=None, foreign_key="foods.id", index=True)
    resolution_method: ResolutionMethod | None = None
    resolution_confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    daily_attributes: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON)
    )
    ocr_confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class CanonicalFoodProfile(SQLModel, table=True):
    __tablename__ = "foods" # type: ignore

    id: int | None = Field(default=None, primary_key=True)
    canonical_name: str = Field(index=True)
    food_categories: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    taste_profile: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    dietary_profile: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON)
    )
    ingredients: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    confirmed_allergens: list[str] = Field(
        default_factory=list, sa_column=Column(JSON)
    )
    possible_allergens: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    cuisine: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    enrichment_version: str = "v1"
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class FoodAlias(SQLModel, table=True):
    __tablename__ = "food_aliases" # type: ignore

    id: int | None = Field(default=None, primary_key=True)
    food_id: int = Field(foreign_key="foods.id", index=True)
    alias: str
    normalised_alias: str = Field(index=True)
    source: str = "system"


class FoodEmbedding(SQLModel, table=True):
    __tablename__ = "food_embeddings" # type: ignore

    id: int | None = Field(default=None, primary_key=True)
    food_id: int = Field(foreign_key="foods.id", index=True)
    embedding: list[float] = Field(sa_column=Column(JSON))
    embedding_model: str
    embedding_version: str
    embedded_text_hash: str = Field(index=True)
    created_at: datetime = Field(default_factory=utc_now)


class User(SQLModel, table=True):
    __tablename__ = "users" # type: ignore

    id: int | None = Field(default=None, primary_key=True)
    teams_user_id: str | None = Field(default=None, index=True)
    name: str
    active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=utc_now)


class UserCreate(SQLModel):
    name: str
    teams_user_id: str | None = None


class UserPreferenceProfile(SQLModel, table=True):
    __tablename__ = "user_profiles" # type: ignore

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    dietary_pattern: str
    foods_not_consumed: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    allergens: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    other_avoidances: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    ideal_breakfast_items: list[str] = Field(
        default_factory=list, sa_column=Column(JSON)
    )
    ideal_lunch_items: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    disliked_foods: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    compiled_restrictions: dict[str, Any] = Field(
        default_factory=dict, sa_column=Column(JSON)
    )
    updated_at: datetime = Field(default_factory=utc_now)


class UserPreferenceProfileCreate(SQLModel):
    dietary_pattern: DietaryPattern
    foods_not_consumed: list[str] = Field(default_factory=list)
    allergens: list[str] = Field(default_factory=list)
    other_avoidances: list[str] = Field(default_factory=list)
    ideal_breakfast_items: list[str] = Field(default_factory=list)
    ideal_lunch_items: list[str] = Field(default_factory=list)
    disliked_foods: list[str] = Field(default_factory=list)


class PreferenceEmbedding(SQLModel, table=True):
    __tablename__ = "preference_embeddings" # type: ignore

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    meal: Meal | None = Field(default=None, index=True)
    preference_type: str = Field(index=True)
    preference_text: str
    embedding: list[float] = Field(sa_column=Column(JSON))
    embedding_model: str
    embedding_version: str


class NotificationSent(SQLModel, table=True):
    __tablename__ = "notifications_sent" # type: ignore

    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    menu_date: date = Field(index=True)
    meal: Meal = Field(index=True)
    ingestion_id: int = Field(foreign_key="menu_ingestions.id", index=True)
    notification_type: str
    destination: str
    sent_at: datetime = Field(default_factory=utc_now)


class MatchExplanation(SQLModel):
    item: str
    matched_preference: str | None = None
    semantic_score: float = 0.0
    lexical_score: float = 0.0
    attribute_score: float = 0.0
    dislike_penalty: float = 0.0
    final_score: float = 0.0
    constraint_status: ConstraintStatus
    reason: str


class UserMenuVerdict(SQLModel):
    user_id: int
    menu_date: date
    meal: Meal
    verdict: str
    exciting_matches: list[MatchExplanation] = Field(default_factory=list)
    other_suitable_options: list[MatchExplanation] = Field(default_factory=list)
    check_with_cafe: list[MatchExplanation] = Field(default_factory=list)
    not_suitable: list[MatchExplanation] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=utc_now)


class FoodEnrichmentResult(SQLModel):
    canonical_name: str
    aliases: list[str] = Field(default_factory=list)
    food_categories: list[str] = Field(default_factory=list)
    meal_suitability: list[Meal] = Field(default_factory=list)
    taste_profile: dict[str, Any] = Field(default_factory=dict)
    cuisine: list[str] = Field(default_factory=list)
    explicit_ingredients: list[str] = Field(default_factory=list)
    inferred_ingredients: list[str] = Field(default_factory=list)
    dietary_profile: dict[str, Any] = Field(default_factory=dict)
    confirmed_allergens: list[str] = Field(default_factory=list)
    possible_allergens: list[str] = Field(default_factory=list)
    evidence: dict[str, EvidenceLevel] = Field(default_factory=dict)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    warnings: list[str] = Field(default_factory=list)
