from dataclasses import dataclass

from sqlmodel import Session, select

from models import CanonicalFoodProfile, FoodAlias, FoodEmbedding, MenuOccurrence
from pipeline.catalogue_audit import OrphanFood, orphan_foods


@dataclass(frozen=True)
class CleanupResult:
    apply: bool
    orphan_foods: list[OrphanFood]
    deleted_foods: int
    deleted_aliases: int
    deleted_embeddings: int


def find_orphan_foods(session: Session) -> list[OrphanFood]:
    foods = session.exec(select(CanonicalFoodProfile)).all()
    occurrences = session.exec(select(MenuOccurrence)).all()
    aliases = session.exec(select(FoodAlias)).all()
    embeddings = session.exec(select(FoodEmbedding)).all()
    return orphan_foods(foods, occurrences, aliases, embeddings)


def cleanup_orphan_foods(session: Session, apply: bool = False) -> CleanupResult:
    orphans = find_orphan_foods(session)
    if not apply:
        return CleanupResult(
            apply=False,
            orphan_foods=orphans,
            deleted_foods=0,
            deleted_aliases=0,
            deleted_embeddings=0,
        )

    deleted_aliases = 0
    deleted_embeddings = 0
    deleted_foods = 0

    for orphan in orphans:
        aliases = session.exec(
            select(FoodAlias).where(FoodAlias.food_id == orphan.food_id)
        ).all()
        embeddings = session.exec(
            select(FoodEmbedding).where(FoodEmbedding.food_id == orphan.food_id)
        ).all()
        food = session.get(CanonicalFoodProfile, orphan.food_id)

        for alias in aliases:
            session.delete(alias)
            deleted_aliases += 1
        for embedding in embeddings:
            session.delete(embedding)
            deleted_embeddings += 1
        if food:
            session.delete(food)
            deleted_foods += 1

    session.commit()
    return CleanupResult(
        apply=True,
        orphan_foods=orphans,
        deleted_foods=deleted_foods,
        deleted_aliases=deleted_aliases,
        deleted_embeddings=deleted_embeddings,
    )
