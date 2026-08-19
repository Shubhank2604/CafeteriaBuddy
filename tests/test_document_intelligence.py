from pathlib import Path

import pytest

from adapters.document_intelligence import (
    DocumentIntelligenceConfigError,
    DocumentIntelligenceError,
    DocumentIntelligenceLayoutClient,
    analyze_url,
    parse_layout_result,
)


class FakeResponse:
    def __init__(self, status_code=200, headers=None, payload=None, text="") -> None:
        self.status_code = status_code
        self.headers = headers or {}
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


class FakeHTTP:
    def __init__(self, post_response, get_responses) -> None:
        self.post_response = post_response
        self.get_responses = list(get_responses)
        self.posts = []
        self.gets = []

    def post(self, *args, **kwargs):
        self.posts.append((args, kwargs))
        return self.post_response

    def get(self, *args, **kwargs):
        self.gets.append((args, kwargs))
        return self.get_responses.pop(0)


def sample_payload():
    return {
        "status": "succeeded",
        "analyzeResult": {
            "pages": [
                {
                    "pageNumber": 1,
                    "width": 1280,
                    "height": 720,
                    "unit": "pixel",
                    "lines": [
                        {
                            "content": "CHEF'S TABLE",
                            "polygon": [64, 180, 404, 180, 404, 220, 64, 220],
                        },
                        {
                            "content": "Tempura Avocado Fingers",
                            "polygon": [896, 300, 1160, 300, 1160, 330, 896, 330],
                        },
                    ],
                }
            ]
        },
    }


def test_analyze_url_uses_prebuilt_layout_endpoint():
    assert (
        analyze_url(
            "https://example.cognitiveservices.azure.com/",
            "prebuilt-layout",
            "2024-11-30",
        )
        == "https://example.cognitiveservices.azure.com/documentintelligence/"
        "documentModels/prebuilt-layout:analyze?api-version=2024-11-30"
    )


def test_parse_layout_result_normalizes_page_polygons():
    result = parse_layout_result(sample_payload(), Path("images/20260722/lunch.jpeg"))

    assert result.provider == "azure_document_intelligence_layout"
    assert [line.text for line in result.lines] == [
        "CHEF'S TABLE",
        "Tempura Avocado Fingers",
    ]
    assert result.lines[0].x == pytest.approx(0.05)
    assert result.lines[0].y == pytest.approx(0.25)
    assert result.lines[0].width == pytest.approx(0.265625)
    assert result.lines[0].height == pytest.approx(0.0555556)


def test_client_requires_credentials():
    with pytest.raises(DocumentIntelligenceConfigError):
        DocumentIntelligenceLayoutClient(endpoint=None, key=None)


def test_client_posts_stream_and_polls_until_succeeded():
    http = FakeHTTP(
        post_response=FakeResponse(
            status_code=202,
            headers={"Operation-Location": "https://operation/1"},
        ),
        get_responses=[FakeResponse(payload=sample_payload())],
    )
    client = DocumentIntelligenceLayoutClient(
        endpoint="https://example.cognitiveservices.azure.com",
        key="secret",
        timeout_seconds=1,
        poll_interval_seconds=0,
        http=http,
    )

    result = client.extract(Path("images/20260722/lunch.jpeg"))

    assert result.lines[0].text == "CHEF'S TABLE"
    assert http.posts[0][0][0].endswith(
        "/documentModels/prebuilt-layout:analyze?api-version=2024-11-30"
    )
    assert http.gets[0][0][0] == "https://operation/1"


def test_client_fails_without_operation_location():
    http = FakeHTTP(post_response=FakeResponse(status_code=202), get_responses=[])
    client = DocumentIntelligenceLayoutClient(
        endpoint="https://example.cognitiveservices.azure.com",
        key="secret",
        timeout_seconds=1,
        poll_interval_seconds=0,
        http=http,
    )

    with pytest.raises(DocumentIntelligenceError):
        client.extract(Path("images/20260722/lunch.jpeg"))
