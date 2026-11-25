import sqlite3
import shutil
from pathlib import Path
from datetime import datetime

db = Path("harvestguard.db")

if not db.exists():
    raise SystemExit("harvestguard.db not found. No migration performed.")

backup = db.with_name(
    f"harvestguard_backup_sensors_{datetime.now():%Y%m%d_%H%M%S}.db"
)
shutil.copy2(db, backup)
print(f"Database backup: {backup}")

conn = sqlite3.connect(db)
conn.execute("PRAGMA foreign_keys = ON")

try:
    tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
    }

    if "silos" not in tables or "sensor_readings" not in tables:
        raise RuntimeError(
            "Expected silos and sensor_readings tables were not found."
        )

    conn.execute("""
        CREATE TABLE IF NOT EXISTS sensors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            silo_id INTEGER NOT NULL REFERENCES silos(id) ON DELETE CASCADE,
            sensor_code VARCHAR NOT NULL,
            position VARCHAR NOT NULL DEFAULT 'unspecified',
            status VARCHAR NOT NULL DEFAULT 'active',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_sensor_silo_code UNIQUE (silo_id, sensor_code)
        )
    """)

    columns = {
        row[1]
        for row in conn.execute("PRAGMA table_info(sensor_readings)")
    }

    if "sensor_ref_id" not in columns:
        conn.execute("""
            ALTER TABLE sensor_readings
            ADD COLUMN sensor_ref_id INTEGER REFERENCES sensors(id)
        """)
        print("Added sensor_ref_id to sensor_readings.")
    else:
        print("sensor_ref_id already exists.")

    conn.execute("""
        CREATE INDEX IF NOT EXISTS ix_sensor_readings_sensor_ref_id
        ON sensor_readings(sensor_ref_id)
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS ix_sensors_silo_id
        ON sensors(silo_id)
    """)

    existing = conn.execute("""
        SELECT DISTINCT silo_id, sensor_id, COALESCE(position, 'unspecified')
        FROM sensor_readings
        WHERE sensor_id IS NOT NULL AND TRIM(sensor_id) <> ''
    """).fetchall()

    for silo_id, sensor_code, position in existing:
        conn.execute("""
            INSERT OR IGNORE INTO sensors
                (silo_id, sensor_code, position, status)
            VALUES (?, ?, ?, 'active')
        """, (silo_id, sensor_code, position))

    conn.execute("""
        UPDATE sensor_readings
        SET sensor_ref_id = (
            SELECT sensors.id
            FROM sensors
            WHERE sensors.silo_id = sensor_readings.silo_id
              AND sensors.sensor_code = sensor_readings.sensor_id
        )
        WHERE sensor_ref_id IS NULL
    """)

    conn.commit()

    sensor_count = conn.execute(
        "SELECT COUNT(*) FROM sensors"
    ).fetchone()[0]

    total, linked = conn.execute("""
        SELECT COUNT(*), COUNT(sensor_ref_id)
        FROM sensor_readings
    """).fetchone()

    print("\n========== SENSOR MIGRATION ==========")
    print(f"Registered sensors: {sensor_count}")
    print(f"Existing readings:  {total}")
    print(f"Linked readings:    {linked}")
    print(f"Unlinked readings:  {total - linked}")
    print("======================================")

except Exception:
    conn.rollback()
    raise
finally:
    conn.close()
