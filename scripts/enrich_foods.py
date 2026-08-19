import argparse
import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session

from db import engine, init_db
from adapters.llm_provider import LLMProviderError
from pipeline.llm_enrichment import enrich_foods


def main() -> None:
    parser = argparse.ArgumentParser(description="Preview or apply LLM food enrichment.")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--json", action="store_true", help="Print JSONL output.")
    args = parser.parse_args()

    init_db()
    with Session(engine) as session:
        try:
            rows = enrich_foods(session=session, limit=args.limit, apply=args.apply)
        except LLMProviderError as exc:
            raise SystemExit(str(exc)) from exc

    mode = "APPLY" if args.apply else "DRY RUN"
    if not args.json:
        print(f"Mode: {mode}")
        print(f"Rows: {len(rows)}")

    for preview, result in rows:
        if args.json:
            print(
                json.dumps(
                    {
                        "food_id": preview.food_id,
                        "canonical_name": preview.canonical_name,
                        "occurrence_count": preview.occurrence_count,
                        "payload": preview.payload,
                        "result": result.model_dump(mode="json") if result else None,
                    },
                    ensure_ascii=False,
                )
            )
        else:
            print(
                f"- food_id={preview.food_id} occurrences={preview.occurrence_count}: "
                f"{preview.canonical_name}"
            )
            if result:
                print(
                    f"  -> {result.canonical_name} confidence={result.confidence:.2f} "
                    f"categories={', '.join(result.food_categories) or 'none'}"
                )


if __name__ == "__main__":
    main()
