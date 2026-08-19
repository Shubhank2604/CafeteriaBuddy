import argparse
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session

from db import engine, init_db
from pipeline.catalogue_cleanup import cleanup_orphan_foods


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean orphan canonical foods.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually delete orphan foods, aliases, and embeddings.",
    )
    args = parser.parse_args()

    init_db()
    with Session(engine) as session:
        result = cleanup_orphan_foods(session, apply=args.apply)

    mode = "APPLY" if result.apply else "DRY RUN"
    print(f"Mode: {mode}")
    print(f"Orphan foods: {len(result.orphan_foods)}")
    for orphan in result.orphan_foods[:50]:
        print(
            f"- food_id={orphan.food_id}: {orphan.canonical_name} "
            f"(aliases={orphan.alias_count}, embeddings={orphan.embedding_count})"
        )
    if len(result.orphan_foods) > 50:
        print(f"... {len(result.orphan_foods) - 50} more")

    print(f"Deleted foods: {result.deleted_foods}")
    print(f"Deleted aliases: {result.deleted_aliases}")
    print(f"Deleted embeddings: {result.deleted_embeddings}")


if __name__ == "__main__":
    main()
