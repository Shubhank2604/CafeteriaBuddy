from pathlib import Path
from typing import Any

import yaml
from rapidfuzz import fuzz

from models import Meal, OCRLine, OCRResult, ParseValidationSummary


PARSER_VERSION = "layout-v1"
HEADING_THRESHOLD = 88


class ParsedSection:
    def __init__(self, heading: str, heading_line: OCRLine, lines: list[OCRLine]) -> None:
        self.heading = heading
        self.heading_line = heading_line
        self.lines = lines


class LayoutParseResult:
    def __init__(
        self,
        meal: Meal,
        sections: list[ParsedSection],
        validation: ParseValidationSummary,
    ) -> None:
        self.meal = meal
        self.sections = sections
        self.validation = validation


def load_template(meal: Meal, template_dir: Path | None = None) -> dict[str, Any]:
    base_dir = template_dir or Path("templates")
    path = base_dir / f"{meal.value}.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def is_ignored_line(line: OCRLine, template: dict[str, Any]) -> bool:
    text = line.text.strip()
    return any(fragment in text for fragment in template.get("ignore_text_contains", []))


def match_heading(text: str, headings: list[str]) -> tuple[str | None, float]:
    normalized = text.strip().upper()
    best_heading = None
    best_score = 0.0
    for heading in headings:
        score = fuzz.token_set_ratio(normalized, heading)
        if score > best_score:
            best_heading = heading
            best_score = score
    if best_score < HEADING_THRESHOLD:
        return None, best_score
    return best_heading, best_score


def assign_by_template_regions(
    line: OCRLine,
    template: dict[str, Any],
    heading_map: dict[str, OCRLine],
) -> str | None:
    regions = template.get("regions") or {}
    if not regions:
        return None

    line_center = line.x + (line.width / 2)
    candidates: list[tuple[float, str]] = []
    for heading, region in regions.items():
        heading_line = heading_map.get(heading)
        if not heading_line or line.y <= heading_line.y:
            continue

        x_min = float(region.get("x_min", 0.0))
        x_max = float(region.get("x_max", 1.0))
        if not x_min <= line_center <= x_max:
            continue

        y_max_heading = region.get("y_max_heading")
        if y_max_heading:
            y_max_line = heading_map.get(y_max_heading)
            if y_max_line and line.y >= y_max_line.y:
                continue

        candidates.append((heading_line.y, heading))

    if not candidates:
        return None
    return max(candidates, key=lambda item: item[0])[1]


def parse_layout(ocr_result: OCRResult, meal: Meal) -> LayoutParseResult:
    template = load_template(meal)
    expected_headings = template["headings"]
    usable_lines = [
        line
        for line in sorted(ocr_result.lines, key=lambda item: (item.y, item.x))
        if not is_ignored_line(line, template)
    ]

    heading_matches: list[tuple[str, OCRLine]] = []
    used_headings: set[str] = set()
    content_lines: list[OCRLine] = []

    for line in usable_lines:
        heading, _ = match_heading(line.text, expected_headings)
        if heading and heading not in used_headings:
            heading_matches.append((heading, line))
            used_headings.add(heading)
        else:
            content_lines.append(line)

    heading_map = {heading: line for heading, line in heading_matches}
    section_buckets: dict[str, list[OCRLine]] = {heading: [] for heading, _ in heading_matches}
    unassigned_lines: list[str] = []

    for line in content_lines:
        region_heading = assign_by_template_regions(line, template, heading_map)
        if region_heading:
            section_buckets[region_heading].append(line)
            continue

        candidates: list[tuple[float, float, str, OCRLine]] = []
        line_center = line.x + (line.width / 2)
        for heading, heading_line in heading_matches:
            if line.y <= heading_line.y:
                continue
            heading_center = heading_line.x + (heading_line.width / 2)
            horizontal_distance = abs(line_center - heading_center)

            # Document Intelligence returns heading text bounds, not the drawn
            # station box bounds. The sandwich heading is centered while entries
            # start much farther left, so vertical precedence should dominate.
            if heading in template.get("description_sections", []):
                horizontal_distance *= 0.35

            candidates.append(
                (heading_line.y, -horizontal_distance, heading, heading_line)
            )
        if not candidates:
            unassigned_lines.append(line.text)
            continue
        _, _, selected_heading, _ = max(candidates, key=lambda item: (item[0], item[1]))
        section_buckets[selected_heading].append(line)

    sections: list[ParsedSection] = []
    for heading, heading_line in heading_matches:
        sections.append(
            ParsedSection(
                heading=heading,
                heading_line=heading_line,
                lines=sorted(section_buckets[heading], key=lambda item: (item.y, item.x)),
            )
        )

    validation = ParseValidationSummary(
        status="success" if len(used_headings) == len(expected_headings) else "incomplete",
        template=meal,
        headings_found=len(used_headings),
        headings_expected=len(expected_headings),
        items_found=sum(len(section.lines) for section in sections),
        unassigned_lines=unassigned_lines,
        warnings=[],
    )
    if validation.status != "success":
        validation.warnings.append("Not all expected station headings were detected.")
    if unassigned_lines:
        validation.warnings.append("Some OCR lines were not assigned to a station.")

    return LayoutParseResult(meal=meal, sections=sections, validation=validation)
