from evaluation.parsing import evaluate_parsing


def test_versioned_parsing_baseline() -> None:
    report = evaluate_parsing("evals/parsing_benchmark.json")

    assert report["cases"] == 2
    assert report["expected_items"] == 55
    assert report["station_precision"] == 1.0
    assert report["station_recall"] == 1.0
    assert report["item_station_precision"] == 1.0
    assert report["item_station_recall"] == 1.0
