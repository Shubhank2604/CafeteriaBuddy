from datetime import date
from hashlib import sha256
from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from sqlmodel import Session, select

from config import get_settings
from models import IngestionStatus, Meal, MenuIngestion


ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}


class InvalidImageError(ValueError):
    pass


def calculate_image_hash(image_bytes: bytes) -> str:
    return sha256(image_bytes).hexdigest()


def validate_image(image_bytes: bytes, filename: str) -> str:
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise InvalidImageError("Only .jpg, .jpeg, and .png menu images are supported.")

    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image.verify()
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImageError("Uploaded file is not a readable image.") from exc

    return extension


def next_revision(session: Session, menu_date: date, meal: Meal) -> int:
    existing = session.exec(
        select(MenuIngestion)
        .where(MenuIngestion.menu_date == menu_date)
        .where(MenuIngestion.meal == meal)
    ).all()
    if not existing:
        return 1
    return max(record.revision for record in existing) + 1


def mark_existing_inactive(session: Session, menu_date: date, meal: Meal) -> None:
    active_records = session.exec(
        select(MenuIngestion)
        .where(MenuIngestion.menu_date == menu_date)
        .where(MenuIngestion.meal == meal)
        .where(MenuIngestion.is_active == True)  # noqa: E712
    ).all()
    for record in active_records:
        record.is_active = False
        session.add(record)


def save_raw_image(
    image_bytes: bytes,
    filename: str,
    image_hash: str,
    menu_date: date,
    meal: Meal,
    revision: int,
    data_dir: Path | None = None,
) -> Path:
    extension = validate_image(image_bytes, filename)
    base_dir = data_dir or get_settings().data_dir
    target_dir = base_dir / "inbox" / menu_date.isoformat() / meal.value
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"r{revision}_{image_hash[:16]}{extension}"
    target_path.write_bytes(image_bytes)
    return target_path


def ingest_menu_image(
    session: Session,
    image_bytes: bytes,
    filename: str,
    meal: Meal,
    menu_date: date,
    data_dir: Path | None = None,
) -> tuple[MenuIngestion, bool]:
    image_hash = calculate_image_hash(image_bytes)

    duplicate = session.exec(
        select(MenuIngestion).where(MenuIngestion.image_hash == image_hash)
    ).first()
    if duplicate:
        return duplicate, True

    revision = next_revision(session, menu_date, meal)
    raw_image_path = save_raw_image(
        image_bytes=image_bytes,
        filename=filename,
        image_hash=image_hash,
        menu_date=menu_date,
        meal=meal,
        revision=revision,
        data_dir=data_dir,
    )

    mark_existing_inactive(session, menu_date, meal)
    ingestion = MenuIngestion(
        image_hash=image_hash,
        menu_date=menu_date,
        meal=meal,
        revision=revision,
        status=IngestionStatus.received,
        raw_image_path=str(raw_image_path),
        is_active=True,
    )
    session.add(ingestion)
    session.commit()
    session.refresh(ingestion)
    return ingestion, False
