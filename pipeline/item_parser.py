import re

from models import Meal, MenuOccurrence, OCRLine
from pipeline.catalogue import normalize_food_name
from pipeline.layout_parser import LayoutParseResult


DESCRIPTION_SEPARATOR = re.compile(r"\s+[-–]\s+(?:with\s+)?", flags=re.IGNORECASE)
COMPLETE_DISH_ENDINGS = (
    "salad",
    "stir-fry",
    "pizza",
    "chicken",
    "rice",
    "potatoes",
    "cauliflower",
    "fingers",
    "chili",
    "bisque",
)
CONTINUATION_PHRASES = {
    "frittata",
    "wheat bread",
    "caesar dressing",
}


def should_merge_wrapped_line(previous: OCRLine, current: OCRLine) -> bool:
    y_gap = current.y - previous.y
    if abs(previous.x - current.x) > 0.03 or y_gap <= 0 or y_gap > 0.045:
        return False

    previous_text = previous.text.strip()
    previous_lower = previous_text.lower()
    current_lower = current.text.strip().lower()
    current_words = current.text.strip().split()
    if previous_text.endswith(("&", ",", "-", "–")):
        return True
    if current_lower in CONTINUATION_PHRASES:
        return True
    if previous_lower.endswith(COMPLETE_DISH_ENDINGS):
        return False
    return False


def merge_wrapped_lines(lines: list[OCRLine]) -> list[OCRLine]:
    merged: list[OCRLine] = []
    for line in lines:
        if merged and should_merge_wrapped_line(merged[-1], line):
            previous = merged[-1]
            previous.text = f"{previous.text.rstrip()} {line.text.strip()}"
            previous.height = max(previous.height, (line.y + line.height) - previous.y)
            previous.confidence = min(previous.confidence, line.confidence)
        else:
            merged.append(line.model_copy(deep=True))
    return merged


def split_name_description(text: str) -> tuple[str, str | None]:
    pieces = DESCRIPTION_SEPARATOR.split(text, maxsplit=1)
    if len(pieces) == 1:
        return text.strip(), None
    return pieces[0].strip(), pieces[1].strip()


def parse_items(
    layout: LayoutParseResult,
    ingestion_id: int,
    menu_date,
) -> list[MenuOccurrence]:
    occurrences: list[MenuOccurrence] = []

    for section in layout.sections:
        for line in merge_wrapped_lines(section.lines):
            name, description = split_name_description(line.text)
            occurrences.append(
                MenuOccurrence(
                    ingestion_id=ingestion_id,
                    menu_date=menu_date,
                    meal=layout.meal,
                    station=section.heading,
                    raw_name=name,
                    raw_description=description,
                    normalised_name=normalize_food_name(name),
                    ocr_confidence=line.confidence,
                )
            )

    return occurrences
