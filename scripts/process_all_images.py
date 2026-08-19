import argparse
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from sqlmodel import Session, select

from db import engine, init_db
from models import MenuIngestion
from scripts.process_images import discover_date_folders, process_date


def main() -> None:
    parser = argparse.ArgumentParser(description="Process all YYYYMMDD image folders.")
    parser.add_argument("--image-root", default="images")
    parser.add_argument("--force", action="store_true", help="Reprocess even if already completed.")
    args = parser.parse_args()

    image_root = Path(args.image_root)
    dates = discover_date_folders(image_root)
    if not dates:
        raise SystemExit(f"No YYYYMMDD folders found under {image_root}.")

    init_db()
    with Session(engine) as session:
        for menu_date in dates:
            for message in process_date(session, image_root, menu_date, force=args.force):
                print(message)

        ingestions = session.exec(select(MenuIngestion)).all()
        print(f"processed_dates={len(dates)}")
        print(f"total_ingestions={len(ingestions)}")


if __name__ == "__main__":
    main()
