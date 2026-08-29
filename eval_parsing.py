from __future__ import annotations

import argparse
import json

from evaluation.parsing import evaluate_parsing


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate deterministic menu parsing.")
    parser.add_argument("--dataset", default="evals/parsing_benchmark.json")
    parser.add_argument("--output")
    parser.add_argument("--min-item-recall", type=float, default=0.98)
    args = parser.parse_args()
    report = evaluate_parsing(args.dataset)
    print(json.dumps(report, indent=2))
    if args.output:
        with open(args.output, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2)
            handle.write("\n")
    if report["item_station_recall"] < args.min_item_recall:
        raise SystemExit(
            f"item/station recall {report['item_station_recall']:.3f} is below "
            f"{args.min_item_recall:.3f}"
        )


if __name__ == "__main__":
    main()
