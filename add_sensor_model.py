from pathlib import Path
from datetime import datetime
import re
import shutil

path = Path("app/models.py")
if not path.exists():
    raise SystemExit("app/models.py not found. Run this from the project root.")

source = path.read_text(encoding="utf-8")

if "class Sensor(Base):" in source:
    raise SystemExit("Sensor model already exists. No changes made.")

marker = "class SensorReading(Base):"
if marker not in source:
    raise SystemExit("Could not find SensorReading model. No changes made.")

if "Column(" not in source:
    raise SystemExit("Expected SQLAlchemy Column definitions were not found. No changes made.")

backup = path.with_name(
    f"models.py.backup-{datetime.now():%Y%m%d-%H%M%S}"
)
shutil.copy2(path, backup)

# Add SQLAlchemy imports, preserving any future import at the top.
import_line = (
    "from sqlalchemy import Column, Integer, String, DateTime, "
    "ForeignKey, UniqueConstraint, func\n"
)

if "from sqlalchemy import" not in source:
    future_match = re.search(
        r"^from __future__ import .+$",
        source,
        flags=re.MULTILINE,
    )
    if future_match:
        end = future_match.end()
        source = source[:end] + "\n" + import_line + source[end:]
    else:
        source = import_line + source

# Add a nullable reference to the registered sensor.
if "sensor_ref_id" not in source:
    source = source.replace(
        marker,
        marker + '\n    sensor_ref_id = Column(Integer, ForeignKey("sensors.id"), nullable=True, index=True)\n',
        1,
    )

sensor_model = '''

class Sensor(Base):
    __tablename__ = "sensors"
    __table_args__ = (
        UniqueConstraint("silo_id", "sensor_code", name="uq_sensor_silo_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    silo_id = Column(
        Integer,
        ForeignKey("silos.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sensor_code = Column(String, nullable=False, index=True)
    position = Column(String, nullable=False, default="unspecified")
    status = Column(String, nullable=False, default="active")
    created_at = Column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
    )
'''

source = source.rstrip() + "\n" + sensor_model + "\n"
path.write_text(source, encoding="utf-8")

print("Sensor model added successfully.")
print(f"Backup: {backup}")
