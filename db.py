from collections.abc import Generator
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from config import get_settings


settings = get_settings()

if settings.database_url.startswith("sqlite:///"):
    sqlite_path = settings.database_url.removeprefix("sqlite:///")
    Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        settings.database_url,
        echo=False,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(settings.database_url, echo=False)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
