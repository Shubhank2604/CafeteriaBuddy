import sys
from datetime import date
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session, select

from db import engine, init_db
from models import MenuIngestion
from pipeline.menu_source import parse_yyyymmdd
from scripts.process_images import process_date


SAMPLE_MENU_DATE = date(2026, 7, 22)


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Process breakfast/lunch images by date.")
    parser.add_argument("--date", default=SAMPLE_MENU_DATE.strftime("%Y%m%d"))
    parser.add_argument("--image-root", default="images")
    parser.add_argument("--force", action="store_true", help="Reprocess even if already completed.")
    args = parser.parse_args()

    menu_date = parse_yyyymmdd(args.date)
    image_root = Path(args.image_root)

    init_db()
    with Session(engine) as session:
        for message in process_date(session, image_root, menu_date, force=args.force):
            print(message)

        ingestions = session.exec(select(MenuIngestion)).all()
        print(f"total_ingestions={len(ingestions)}")


if __name__ == "__main__":
    main()
