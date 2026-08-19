import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session

from db import engine, init_db
from pipeline.catalogue_audit import build_catalogue_audit


def main() -> None:
    init_db()
    with Session(engine) as session:
        audit = build_catalogue_audit(session)

    print(f"Occurrences: {audit['occurrence_count']}")
    print(f"Canonical foods: {audit['food_count']}")
    print(f"Orphan canonical foods: {audit['orphan_food_count']}")
    print(f"Foods reused at least once: {audit['reused_food_count']}")

    print("\nOrphan canonical foods:")
    orphans = audit["orphan_foods"]
    if not orphans:
        print("- none")
    for orphan in orphans[:25]:
        print(
            f"- food_id={orphan.food_id}: {orphan.canonical_name} "
            f"(aliases={orphan.alias_count}, embeddings={orphan.embedding_count})"
        )

    print("\nMost reused foods:")
    for food_id, name, count, names in audit["most_reused_foods"]:
        aliases = f" ({'; '.join(names)})" if len(names) > 1 else ""
        print(f"- food_id={food_id} count={count}: {name}{aliases}")

    print("\nRepeated raw names:")
    for item in audit["repeated_raw_names"][:25]:
        ids = ", ".join(str(food_id) for food_id in item.food_ids)
        print(f"- {item.name}: {item.count} occurrences -> food_ids=[{ids}]")

    print("\nPossible duplicate canonical foods:")
    duplicates = audit["possible_duplicates"]
    if not duplicates:
        print("- none")
    for item in duplicates[:40]:
        print(
            f"- {item.score}: food_id={item.left_id} {item.left_name} "
            f"<-> food_id={item.right_id} {item.right_name}"
        )

    print("\nFoods needing enrichment:")
    for food_id, name, confidence, reason in audit["foods_needing_enrichment"]:
        print(f"- food_id={food_id} confidence={confidence:.2f}: {name} ({reason})")


if __name__ == "__main__":
    main()
