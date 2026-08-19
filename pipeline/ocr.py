import json
from pathlib import Path

from sqlmodel import Session

from adapters.document_intelligence import DocumentIntelligenceLayoutClient
from adapters.local_ocr import extract_local_ocr
from config import get_settings
from models import MenuIngestion, OCRResult


def extract_text(image_path: Path, meal) -> OCRResult:
    settings = get_settings()
    if settings.ocr_provider == "local":
        return extract_local_ocr(image_path=image_path, meal=meal)
    if settings.ocr_provider in {"document_intelligence", "azure_document_intelligence"}:
        client = DocumentIntelligenceLayoutClient(
            endpoint=settings.azure_document_intelligence_endpoint,
            key=settings.azure_document_intelligence_key,
            api_version=settings.azure_document_intelligence_api_version,
            model_id=settings.azure_document_intelligence_model_id,
            timeout_seconds=settings.azure_document_intelligence_timeout_seconds,
        )
        return client.extract(image_path)
    raise NotImplementedError(f"Unsupported OCR provider: {settings.ocr_provider}")


def save_ocr_result(result: OCRResult, ingestion: MenuIngestion, data_dir: Path | None = None) -> Path:
    base_dir = data_dir or get_settings().data_dir
    target_dir = base_dir / "ocr" / ingestion.menu_date.isoformat() / ingestion.meal.value
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"r{ingestion.revision}_{ingestion.image_hash[:16]}.json"
    target_path.write_text(
        json.dumps(result.model_dump(mode="json"), indent=2),
        encoding="utf-8",
    )
    return target_path


def run_ocr_for_ingestion(
    session: Session,
    ingestion: MenuIngestion,
    data_dir: Path | None = None,
) -> OCRResult:
    result = extract_text(Path(ingestion.raw_image_path), ingestion.meal)
    ocr_path = save_ocr_result(result, ingestion, data_dir=data_dir)
    result.raw_response_path = str(ocr_path)
    ingestion.ocr_response_path = str(ocr_path)
    session.add(ingestion)
    session.commit()
    session.refresh(ingestion)
    return result
