import sqlite3
from datetime import datetime
from pathlib import Path

from sqlalchemy import text
from app.config import settings
from app.database import engine
from sqlalchemy.engine import make_url

url = make_url(settings.database_url)

if url.drivername != "sqlite":
    raise RuntimeError("This migration is designed for SQLite only.")

database_path = Path(url.database).resolve()

if not database_path.exists():
    raise FileNotFoundError(f"Database not found: {database_path}")

timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
backup_path = database_path.with_name(
    f"{database_path.stem}_backup_{timestamp}{database_path.suffix}"
)

# Back up the active SQLite database.
with sqlite3.connect(str(database_path)) as source:
    with sqlite3.connect(str(backup_path)) as backup:
        source.backup(backup)

print(f"Backup created: {backup_path}")

mapping = {
    "HG-NODE-01": "HG-MUR-001-T01",
    "HG-NODE-02": "HG-MUR-001-T02",
    "HG-NODE-03": "HG-MUR-001-T03",
}

with engine.begin() as connection:
    before = connection.execute(
        text("SELECT COUNT(*) FROM sensor_readings")
    ).scalar_one()

    print(f"Readings before migration: {before}")

    for old_id, new_id in mapping.items():
        old_count = connection.execute(
            text("""
                SELECT COUNT(*) FROM sensor_readings
                WHERE sensor_id = :sensor_id
            """),
            {"sensor_id": old_id},
        ).scalar_one()

        if old_count:
            connection.execute(
                text("""
                    UPDATE sensor_readings
                    SET sensor_id = :new_id
                    WHERE sensor_id = :old_id
                """),
                {"new_id": new_id, "old_id": old_id},
            )

        print(f"{old_id} -> {new_id}: {old_count} readings renamed")

    after = connection.execute(
        text("SELECT COUNT(*) FROM sensor_readings")
    ).scalar_one()

    if before != after:
        raise RuntimeError(
            f"Reading count changed unexpectedly: {before} -> {after}"
        )

    remaining = connection.execute(
        text("""
            SELECT COUNT(*) FROM sensor_readings
            WHERE sensor_id IN (
                'HG-NODE-01', 'HG-NODE-02', 'HG-NODE-03'
            )
        """)
    ).scalar_one()

    if remaining:
        raise RuntimeError(f"{remaining} old sensor IDs remain.")

print(f"Readings after migration: {after}")
print("Migration completed successfully.")
