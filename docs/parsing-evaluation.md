# Menu parsing evaluation

This benchmark checks whether the deterministic layout and item parsers preserve station headings and assign each parsed item to the correct station.

## Dataset

`evals/parsing_benchmark.json` contains two labeled cases derived from the credential-free local OCR fixtures:

| Meal | Stations | Item/station labels |
| --- | ---: | ---: |
| Breakfast | 4 | 30 |
| Lunch | 7 | 25 |
| Total | 11 | 55 |

Each expected item is represented by the pair `(station, item name)`. This catches both missing items and items assigned to the wrong station.

## Run the benchmark

```bash
python eval_parsing.py
```

To write a machine-readable report and enforce the same gate used in CI:

```bash
python eval_parsing.py \
  --min-item-recall 0.98 \
  --output parsing-report.json
```

The versioned baseline is stored at `evals/results/parsing-baseline.json`.

## Baseline

| Metric | Result |
| --- | ---: |
| Station precision | 1.000 |
| Station recall | 1.000 |
| Item/station precision | 1.000 |
| Item/station recall | 1.000 |

## Limits

This is a parser regression benchmark, not an OCR benchmark. It starts from fixed text lines returned by the local OCR adapter, so it does not measure Azure Document Intelligence accuracy, image preprocessing, or generalization to unseen menu formats.

It also does not evaluate ingredient extraction, allergen completeness, recommendation quality, or medical safety. New production layouts should be added as labeled cases before changing parser rules.
