from hashlib import sha256
from math import sqrt

from sqlmodel import Session, select

from models import (
    CanonicalFoodProfile,
    FoodEmbedding,
    Meal,
    PreferenceEmbedding,
    UserPreferenceProfile,
)
from pipeline.catalogue import normalize_food_name


LOCAL_EMBEDDING_MODEL = "local-hash-bow"
LOCAL_EMBEDDING_VERSION = "v1"
LOCAL_EMBEDDING_DIMENSIONS = 64


def text_hash(text: str) -> str:
    return sha256(text.encode("utf-8")).hexdigest()


def tokens(text: str) -> list[str]:
    return normalize_food_name(text).split()


def embed_text(text: str, dimensions: int = LOCAL_EMBEDDING_DIMENSIONS) -> list[float]:
    vector = [0.0] * dimensions
    for token in tokens(text):
        digest = sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        vector[index] += 1.0

    norm = sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector
    return [value / norm for value in vector]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    return sum(a * b for a, b in zip(left, right))


def food_embedding_text(food: CanonicalFoodProfile) -> str:
    categories = " ".join(food.food_categories or [])
    taste = " ".join(
        key for key, value in (food.taste_profile or {}).items() if bool(value)
    )
    dietary = " ".join(
        key for key, value in (food.dietary_profile or {}).items() if bool(value)
    )
    allergens = " ".join((food.confirmed_allergens or []) + (food.possible_allergens or []))
    return f"{food.canonical_name}. {categories}. {taste}. {dietary}. {allergens}."


def get_or_create_food_embedding(
    session: Session,
    food: CanonicalFoodProfile,
) -> FoodEmbedding:
    embedded_text = food_embedding_text(food)
    embedded_hash = text_hash(embedded_text)
    existing = session.exec(
        select(FoodEmbedding)
        .where(FoodEmbedding.food_id == food.id)
        .where(FoodEmbedding.embedding_model == LOCAL_EMBEDDING_MODEL)
        .where(FoodEmbedding.embedding_version == LOCAL_EMBEDDING_VERSION)
        .where(FoodEmbedding.embedded_text_hash == embedded_hash)
    ).first()
    if existing:
        return existing

    embedding = FoodEmbedding(
        food_id=food.id,
        embedding=embed_text(embedded_text),
        embedding_model=LOCAL_EMBEDDING_MODEL,
        embedding_version=LOCAL_EMBEDDING_VERSION,
        embedded_text_hash=embedded_hash,
    )
    session.add(embedding)
    session.commit()
    session.refresh(embedding)
    return embedding


def delete_preference_embeddings(session: Session, user_id: int) -> None:
    existing = session.exec(
        select(PreferenceEmbedding).where(PreferenceEmbedding.user_id == user_id)
    ).all()
    for embedding in existing:
        session.delete(embedding)
    session.commit()


def add_preference_embedding(
    session: Session,
    user_id: int,
    meal: Meal | None,
    preference_type: str,
    text: str,
) -> PreferenceEmbedding:
    embedding = PreferenceEmbedding(
        user_id=user_id,
        meal=meal,
        preference_type=preference_type,
        preference_text=text,
        embedding=embed_text(text),
        embedding_model=LOCAL_EMBEDDING_MODEL,
        embedding_version=LOCAL_EMBEDDING_VERSION,
    )
    session.add(embedding)
    session.commit()
    session.refresh(embedding)
    return embedding


def refresh_preference_embeddings(
    session: Session,
    profile: UserPreferenceProfile,
) -> None:
    delete_preference_embeddings(session, profile.user_id)
    for text in profile.ideal_breakfast_items:
        add_preference_embedding(session, profile.user_id, Meal.breakfast, "positive", text)
    for text in profile.ideal_lunch_items:
        add_preference_embedding(session, profile.user_id, Meal.lunch, "positive", text)
    for text in profile.disliked_foods:
        add_preference_embedding(session, profile.user_id, None, "dislike", text)


def preference_vectors(
    session: Session,
    user_id: int,
    meal: Meal,
    preference_type: str,
) -> list[PreferenceEmbedding]:
    query = select(PreferenceEmbedding).where(
        PreferenceEmbedding.user_id == user_id,
        PreferenceEmbedding.preference_type == preference_type,
    )
    if preference_type == "positive":
        query = query.where(PreferenceEmbedding.meal == meal)
    return session.exec(query).all()


def best_semantic_match(
    item_embedding: list[float],
    preferences: list[PreferenceEmbedding],
) -> tuple[float, str | None]:
    best_score = 0.0
    best_text = None
    for preference in preferences:
        score = cosine_similarity(item_embedding, preference.embedding)
        if score > best_score:
            best_score = score
            best_text = preference.preference_text
    return best_score, best_text
