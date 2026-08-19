from contextlib import asynccontextmanager
from datetime import date

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from sqlmodel import Session, select

from db import get_session, init_db
from models import Meal, MenuIngestion, MenuOccurrence, User, UserCreate, UserPreferenceProfile, UserPreferenceProfileCreate
from pipeline.ingest import InvalidImageError, ingest_menu_image
from pipeline.match import build_verdict
from pipeline.orchestrator import process_ingestion
from pipeline.profile import create_user, upsert_user_profile


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Apple Hill Cafe Menu Bot", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health(session: Session = Depends(get_session)) -> dict[str, object]:
    ingestion_count = len(session.exec(select(MenuIngestion)).all())
    return {
        "status": "ok",
        "database": "sqlite",
        "ingestions": ingestion_count,
    }


@app.post("/webhook/menu-image", status_code=status.HTTP_202_ACCEPTED)
async def upload_menu_image(
    image: UploadFile = File(...),
    meal: Meal = Form(...),
    menu_date: date = Form(...),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")

    try:
        ingestion, duplicate = ingest_menu_image(
            session=session,
            image_bytes=image_bytes,
            filename=image.filename or "menu.jpeg",
            meal=meal,
            menu_date=menu_date,
        )
    except InvalidImageError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "id": ingestion.id,
        "status": ingestion.status,
        "duplicate": duplicate,
        "menu_date": ingestion.menu_date,
        "meal": ingestion.meal,
        "revision": ingestion.revision,
        "raw_image_path": ingestion.raw_image_path,
    }


@app.post("/ingestions/{ingestion_id}/process")
def process_menu_ingestion(
    ingestion_id: int,
    session: Session = Depends(get_session),
) -> dict[str, object]:
    ingestion = session.get(MenuIngestion, ingestion_id)
    if not ingestion:
        raise HTTPException(status_code=404, detail="Ingestion not found.")

    occurrences, validation = process_ingestion(session=session, ingestion=ingestion)
    return {
        "id": ingestion.id,
        "status": ingestion.status,
        "menu_date": ingestion.menu_date,
        "meal": ingestion.meal,
        "items_found": len(occurrences),
        "validation": validation.model_dump(mode="json"), # type: ignore
    }


@app.get("/menus/{menu_date}/{meal}/items")
def get_menu_items(
    menu_date: date,
    meal: Meal,
    session: Session = Depends(get_session),
) -> dict[str, object]:
    items = session.exec(
        select(MenuOccurrence)
        .where(MenuOccurrence.menu_date == menu_date)
        .where(MenuOccurrence.meal == meal)
        .order_by(MenuOccurrence.station, MenuOccurrence.raw_name)
    ).all()
    return {
        "menu_date": menu_date,
        "meal": meal,
        "items": [item.model_dump(mode="json") for item in items],
    }


@app.post("/users", status_code=status.HTTP_201_CREATED)
def create_user_endpoint(
    payload: UserCreate,
    session: Session = Depends(get_session),
) -> dict[str, object]:
    user = create_user(session=session, payload=payload)
    return user.model_dump(mode="json")


@app.post("/users/{user_id}/profile")
def upsert_user_profile_endpoint(
    user_id: int,
    payload: UserPreferenceProfileCreate,
    session: Session = Depends(get_session),
) -> dict[str, object]:
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    profile = upsert_user_profile(session=session, user_id=user_id, payload=payload)
    return profile.model_dump(mode="json")


@app.get("/users/{user_id}/profile")
def get_user_profile_endpoint(
    user_id: int,
    session: Session = Depends(get_session),
) -> dict[str, object]:
    profile = session.exec(
        select(UserPreferenceProfile).where(UserPreferenceProfile.user_id == user_id)
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found.")
    return profile.model_dump(mode="json")


@app.get("/menus/{menu_date}/{meal}/verdict")
def get_menu_verdict(
    menu_date: date,
    meal: Meal,
    user_id: int,
    session: Session = Depends(get_session),
) -> dict[str, object]:
    try:
        verdict = build_verdict(
            session=session,
            user_id=user_id,
            menu_date=menu_date,
            meal=meal,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return verdict.model_dump(mode="json")
