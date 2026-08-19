import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session, select

from db import engine, init_db
from models import DietaryPattern, User, UserCreate, UserPreferenceProfileCreate
from pipeline.profile import create_user, upsert_user_profile


def main() -> None:
    init_db()
    with Session(engine) as session:
        user = session.exec(select(User).where(User.name == "Schandak")).first()
        if not user:
            user = create_user(session, UserCreate(name="Schandak"))

        profile = upsert_user_profile(
            session,
            user.id, # type: ignore
            UserPreferenceProfileCreate(
                dietary_pattern=DietaryPattern.vegetarian,
                foods_not_consumed=[],
                allergens=[],
                other_avoidances=[],
                ideal_breakfast_items=["avocado toast", "masala dosa", "fruit and yogurt"],
                ideal_lunch_items=["tofu stir-fry", "vegetable pizza", "guacamole", "rice"],
                disliked_foods=["cold sandwiches", "mushrooms"],
            ),
        )
        user_id = user.id
        profile_id = profile.id

    print(f"Seeded user_id={user_id}, profile_id={profile_id}")


if __name__ == "__main__":
    main()
