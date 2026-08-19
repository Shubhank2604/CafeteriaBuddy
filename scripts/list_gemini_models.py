import sys
from pathlib import Path

import requests

sys.path.append(str(Path(__file__).resolve().parents[1]))

from config import get_settings


def main() -> None:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise SystemExit("GEMINI_API_KEY is not set.")

    response = requests.get(
        f"{settings.gemini_base_url.rstrip('/')}/models",
        headers={"x-goog-api-key": settings.gemini_api_key},
        timeout=30,
    )
    if response.status_code != 200:
        raise SystemExit(
            f"Gemini list models failed with status {response.status_code}: {response.text}"
        )

    models = response.json().get("models", [])
    generate_models = [
        model
        for model in models
        if "generateContent" in model.get("supportedGenerationMethods", [])
    ]

    print("Models supporting generateContent:")
    for model in generate_models:
        print(f"- {model.get('name', '').removeprefix('models/')}")


if __name__ == "__main__":
    main()
