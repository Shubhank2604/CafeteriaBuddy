import pytest

from config import get_settings


@pytest.fixture(autouse=True)
def force_local_ocr_provider(monkeypatch):
    monkeypatch.setenv("OCR_PROVIDER", "local")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
