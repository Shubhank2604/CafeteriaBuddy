import time
from pathlib import Path
from typing import Any

import requests

from models import OCRLine, OCRResult


class DocumentIntelligenceConfigError(ValueError):
    pass


class DocumentIntelligenceError(RuntimeError):
    pass


def normalized_endpoint(endpoint: str) -> str:
    return endpoint.rstrip("/")


def analyze_url(endpoint: str, model_id: str, api_version: str) -> str:
    return (
        f"{normalized_endpoint(endpoint)}/documentintelligence/documentModels/"
        f"{model_id}:analyze?api-version={api_version}"
    )


def page_dimensions(page: dict[str, Any]) -> tuple[float, float]:
    width = float(page.get("width") or 1.0)
    height = float(page.get("height") or 1.0)
    return max(width, 1.0), max(height, 1.0)


def normalize_polygon(
    polygon: list[float],
    page_width: float,
    page_height: float,
) -> tuple[float, float, float, float]:
    xs = polygon[0::2]
    ys = polygon[1::2]
    left = min(xs) / page_width
    top = min(ys) / page_height
    width = (max(xs) - min(xs)) / page_width
    height = (max(ys) - min(ys)) / page_height
    return (
        max(0.0, min(left, 1.0)),
        max(0.0, min(top, 1.0)),
        max(0.0, min(width, 1.0)),
        max(0.0, min(height, 1.0)),
    )


def line_confidence(line: dict[str, Any]) -> float:
    spans = line.get("spans") or []
    if spans and all(isinstance(span, dict) for span in spans):
        confidences = [
            float(span["confidence"])
            for span in spans
            if isinstance(span, dict) and "confidence" in span
        ]
        if confidences:
            return sum(confidences) / len(confidences)
    return float(line.get("confidence") or 1.0)


def parse_layout_result(payload: dict[str, Any], image_path: Path) -> OCRResult:
    lines: list[OCRLine] = []
    pages = payload.get("analyzeResult", {}).get("pages", [])
    for page in pages:
        width, height = page_dimensions(page)
        for line in page.get("lines", []):
            text = str(line.get("content", "")).strip()
            polygon = line.get("polygon") or []
            if not text or len(polygon) < 8:
                continue
            x, y, box_width, box_height = normalize_polygon(
                polygon,
                page_width=width,
                page_height=height,
            )
            lines.append(
                OCRLine(
                    text=text,
                    x=x,
                    y=y,
                    width=box_width,
                    height=box_height,
                    confidence=line_confidence(line),
                )
            )

    return OCRResult(
        image_path=str(image_path),
        provider="azure_document_intelligence_layout",
        lines=sorted(lines, key=lambda item: (item.y, item.x)),
    )


class DocumentIntelligenceLayoutClient:
    def __init__(
        self,
        endpoint: str | None,
        key: str | None,
        api_version: str = "2024-11-30",
        model_id: str = "prebuilt-layout",
        timeout_seconds: int = 60,
        poll_interval_seconds: float = 1.0,
        http: requests.Session | None = None,
    ) -> None:
        if not endpoint or not key:
            raise DocumentIntelligenceConfigError(
                "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and "
                "AZURE_DOCUMENT_INTELLIGENCE_KEY are required."
            )
        self.endpoint = endpoint
        self.key = key
        self.api_version = api_version
        self.model_id = model_id
        self.timeout_seconds = timeout_seconds
        self.poll_interval_seconds = poll_interval_seconds
        self.http = http or requests.Session()

    def extract(self, image_path: Path) -> OCRResult:
        response = self.http.post(
            analyze_url(self.endpoint, self.model_id, self.api_version),
            headers={
                "Ocp-Apim-Subscription-Key": self.key,
                "Content-Type": "application/octet-stream",
            },
            data=image_path.read_bytes(),
            timeout=30,
        )
        if response.status_code != 202:
            raise DocumentIntelligenceError(
                "Document Intelligence analyze request failed with "
                f"status {response.status_code}: {response.text}"
            )

        operation_location = response.headers.get("Operation-Location")
        if not operation_location:
            raise DocumentIntelligenceError(
                "Document Intelligence response did not include Operation-Location."
            )

        payload = self.poll(operation_location)
        return parse_layout_result(payload, image_path=image_path)

    def poll(self, operation_location: str) -> dict[str, Any]:
        deadline = time.monotonic() + self.timeout_seconds
        while time.monotonic() < deadline:
            response = self.http.get(
                operation_location,
                headers={"Ocp-Apim-Subscription-Key": self.key},
                timeout=30,
            )
            if response.status_code != 200:
                raise DocumentIntelligenceError(
                    "Document Intelligence poll failed with "
                    f"status {response.status_code}: {response.text}"
                )
            payload = response.json()
            status = str(payload.get("status", "")).lower()
            if status == "succeeded":
                return payload
            if status == "failed":
                raise DocumentIntelligenceError("Document Intelligence operation failed.")
            time.sleep(self.poll_interval_seconds)

        raise DocumentIntelligenceError("Document Intelligence operation timed out.")
