import sys
from datetime import date
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session, select

from db import engine, init_db
from models import Meal, User
from pipeline.match import build_verdict


SAMPLE_MENU_DATE = date(2026, 7, 22)


def main() -> None:
    init_db()
    with Session(engine) as session:
        user = session.exec(select(User).where(User.name == "Schandak")).first()
        if not user:
            raise SystemExit("Run python scripts/seed_user.py first.")

        verdict = build_verdict(
            session=session,
            user_id=user.id,
            menu_date=SAMPLE_MENU_DATE,
            meal=Meal.lunch,
        )

    print(verdict.verdict)
    print()
    print("Exciting matches:")
    for item in verdict.exciting_matches:
        print(f"- {item.item}: {item.reason} ({item.final_score})")
    print()
    print("Other suitable options:")
    for item in verdict.other_suitable_options[:8]:
        print(f"- {item.item}: {item.reason} ({item.final_score})")
    print()
    print("Check with the cafe:")
    for item in verdict.check_with_cafe:
        print(f"- {item.item}: {item.reason}")
    print()
    print("Not suitable:")
    for item in verdict.not_suitable[:8]:
        print(f"- {item.item}: {item.reason}")


if __name__ == "__main__":
    main()
