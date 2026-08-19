from collections import defaultdict
from dataclasses import dataclass

from rapidfuzz import fuzz
from sqlmodel import Session, select

from models import CanonicalFoodProfile, FoodAlias, FoodEmbedding, MenuOccurrence
from pipeline.catalogue import normalize_food_name


@dataclass(frozen=True)
class RepeatedFood:
    name: str
    count: int
    food_ids: tuple[int, ...]


@dataclass(frozen=True)
class PossibleDuplicate:
    left_id: int
    left_name: str
    right_id: int
    right_name: str
    score: float


@dataclass(frozen=True)
class OrphanFood:
    food_id: int
    canonical_name: str
    alias_count: int
    embedding_count: int


def repeated_raw_names(occurrences: list[MenuOccurrence]) -> list[RepeatedFood]:
    grouped: dict[str, list[MenuOccurrence]] = defaultdict(list)
    for occurrence in occurrences:
        grouped[normalize_food_name(occurrence.raw_name)].append(occurrence)

    repeated: list[RepeatedFood] = []
    for normalized_name, rows in grouped.items():
        if len(rows) <= 1:
            continue
        display_name = min((row.raw_name for row in rows), key=len)
        food_ids = tuple(sorted({row.food_id for row in rows if row.food_id is not None}))
        repeated.append(
            RepeatedFood(name=display_name, count=len(rows), food_ids=food_ids)
        )

    return sorted(repeated, key=lambda item: (-item.count, item.name))


def possible_duplicate_foods(
    foods: list[CanonicalFoodProfile],
    threshold: float = 88.0,
) -> list[PossibleDuplicate]:
    duplicates: list[PossibleDuplicate] = []
    normalized = [
        (food, normalize_food_name(food.canonical_name))
        for food in foods
        if food.id is not None
    ]

    for index, (left, left_normalized) in enumerate(normalized):
        for right, right_normalized in normalized[index + 1 :]:
            score = max(
                fuzz.ratio(left_normalized, right_normalized),
                fuzz.token_sort_ratio(left_normalized, right_normalized),
            )
            if score >= threshold:
                duplicates.append(
                    PossibleDuplicate(
                        left_id=left.id,  # type: ignore[arg-type]
                        left_name=left.canonical_name,
                        right_id=right.id,  # type: ignore[arg-type]
                        right_name=right.canonical_name,
                        score=round(score, 1),
                    )
                )

    return sorted(duplicates, key=lambda item: (-item.score, item.left_name, item.right_name))


def occurrence_counts_by_food(
    occurrences: list[MenuOccurrence],
) -> list[tuple[int, str, int, list[str]]]:
    grouped: dict[int, list[MenuOccurrence]] = defaultdict(list)
    for occurrence in occurrences:
        if occurrence.food_id is not None:
            grouped[occurrence.food_id].append(occurrence)

    rows: list[tuple[int, str, int, list[str]]] = []
    for food_id, items in grouped.items():
        names = sorted({item.raw_name for item in items})
        rows.append((food_id, names[0], len(items), names))

    return sorted(rows, key=lambda item: (-item[2], item[1]))


def foods_needing_enrichment(
    foods: list[CanonicalFoodProfile],
) -> list[tuple[int, str, float, str]]:
    rows: list[tuple[int, str, float, str]] = []
    for food in foods:
        if food.id is None:
            continue
        dietary_profile = food.dietary_profile or {}
        reasons: list[str] = []
        if food.confidence < 0.75:
            reasons.append("low confidence")
        if not food.food_categories:
            reasons.append("no category")
        if dietary_profile.get("appears_vegetarian") is None:
            reasons.append("unknown vegetarian status")
        if food.enrichment_version.startswith("heuristic"):
            reasons.append("heuristic profile")

        if reasons:
            rows.append((food.id, food.canonical_name, food.confidence, ", ".join(reasons)))

    return sorted(rows, key=lambda item: (item[2], item[1]))


def orphan_foods(
    foods: list[CanonicalFoodProfile],
    occurrences: list[MenuOccurrence],
    aliases: list[FoodAlias],
    embeddings: list[FoodEmbedding],
) -> list[OrphanFood]:
    referenced_food_ids = {
        occurrence.food_id
        for occurrence in occurrences
        if occurrence.food_id is not None
    }
    alias_counts: dict[int, int] = defaultdict(int)
    embedding_counts: dict[int, int] = defaultdict(int)
    for alias in aliases:
        alias_counts[alias.food_id] += 1
    for embedding in embeddings:
        embedding_counts[embedding.food_id] += 1

    rows: list[OrphanFood] = []
    for food in foods:
        if food.id is None or food.id in referenced_food_ids:
            continue
        rows.append(
            OrphanFood(
                food_id=food.id,
                canonical_name=food.canonical_name,
                alias_count=alias_counts[food.id],
                embedding_count=embedding_counts[food.id],
            )
        )

    return sorted(rows, key=lambda item: item.canonical_name)


def build_catalogue_audit(session: Session) -> dict[str, object]:
    foods = session.exec(select(CanonicalFoodProfile)).all()
    occurrences = session.exec(select(MenuOccurrence)).all()
    aliases = session.exec(select(FoodAlias)).all()
    embeddings = session.exec(select(FoodEmbedding)).all()
    repeated = repeated_raw_names(occurrences)
    duplicates = possible_duplicate_foods(foods)
    orphans = orphan_foods(foods, occurrences, aliases, embeddings)
    reused = [
        row
        for row in occurrence_counts_by_food(occurrences)
        if row[2] > 1
    ]

    return {
        "food_count": len(foods),
        "occurrence_count": len(occurrences),
        "orphan_food_count": len(orphans),
        "reused_food_count": len(reused),
        "orphan_foods": orphans,
        "repeated_raw_names": repeated,
        "possible_duplicates": duplicates,
        "most_reused_foods": reused[:25],
        "foods_needing_enrichment": foods_needing_enrichment(foods)[:40],
    }
