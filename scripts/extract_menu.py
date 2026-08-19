import argparse
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from models import Meal
from pipeline.extraction import extract_menu_items_from_ocr, write_extraction_json
from pipeline.ocr import extract_text


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract menu items from one image.")
    parser.add_argument("--image", required=True)
    parser.add_argument("--meal", required=True, choices=[meal.value for meal in Meal])
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    image_path = Path(args.image)
    meal = Meal(args.meal)
    ocr_result = extract_text(image_path=image_path, meal=meal)
    items, validation = extract_menu_items_from_ocr(ocr_result=ocr_result, meal=meal)

    print(f"provider={ocr_result.provider}")
    print(
        f"validation={validation['status']} "
        f"headings={validation['headings_found']}/{validation['headings_expected']} "
        f"items={len(items)}"
    )
    for item in items:
        description = f" - {item['description']}" if item["description"] else ""
        print(f"- [{item['station']}] {item['name']}{description}")

    if args.out:
        write_extraction_json(
            path=Path(args.out),
            meal=meal,
            provider=ocr_result.provider,
            items=items,
            validation=validation,
        )
        print(f"wrote={args.out}")


if __name__ == "__main__":
    main()
