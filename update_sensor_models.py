from pathlib import Path
from datetime import datetime
import shutil

path = Path("app/models.py")
source = path.read_text(encoding="utf-8")

if "class Sensor(Base):" in source:
    raise SystemExit("Sensor model already exists. Stopping to avoid duplication.")

required = [
    "from sqlalchemy.orm import Mapped, mapped_column, relationship",
    'class Silo(Base):',
    'class SensorReading(Base):',
    'readings: Mapped[list["SensorReading"]]',
    'silo: Mapped[Silo] = relationship(back_populates="readings")',
]

for item in required:
    if item not in source:
        raise SystemExit(f"Expected code not found: {item}")

backup = path.with_name(
    f"models.py.backup-{datetime.now():%Y%m%d-%H%M%S}"
)
shutil.copy2(path, backup)

# Add UniqueConstraint to the existing SQLAlchemy import.
source = source.replace(
    "from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Index",
    "from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Index, UniqueConstraint",
    1,
)

# Add the sensor relationship to Silo.
source = source.replace(
    '    readings: Mapped[list["SensorReading"]] = relationship(back_populates="silo", cascade="all, delete-orphan")',
    '    readings: Mapped[list["SensorReading"]] = relationship(back_populates="silo", cascade="all, delete-orphan")\n'
    '    sensors: Mapped[list["Sensor"]] = relationship(back_populates="silo", cascade="all, delete-orphan")',
    1,
)

# Add the Sensor model before SensorReading.
sensor_model = '''

class Sensor(Base):
    __tablename__ = "sensors"
    __table_args__ = (
        UniqueConstraint("silo_id", "sensor_code", name="uq_sensor_silo_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    silo_id: Mapped[int] = mapped_column(
        ForeignKey("silos.id", ondelete="CASCADE"),
        index=True,
    )
    sensor_code: Mapped[str] = mapped_column(String(80), index=True)
    position: Mapped[str] = mapped_column(String(80), default="unspecified")
    status: Mapped[str] = mapped_column(String(30), default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
    )

    silo: Mapped["Silo"] = relationship(back_populates="sensors")
    readings: Mapped[list["SensorReading"]] = relationship(
        back_populates="sensor",
    )

'''

source = source.replace(
    "class SensorReading(Base):",
    sensor_model + "class SensorReading(Base):",
    1,
)

# Add the nullable foreign-key reference to SensorReading.
source = source.replace(
    '    sensor_id: Mapped[str] = mapped_column(String(80), index=True)',
    '    sensor_id: Mapped[str] = mapped_column(String(80), index=True)\n'
    '    sensor_ref_id: Mapped[int | None] = mapped_column(\n'
    '        ForeignKey("sensors.id"), nullable=True, index=True\n'
    '    )',
    1,
)

# Add the ORM relationship to SensorReading.
source = source.replace(
    '    silo: Mapped[Silo] = relationship(back_populates="readings")',
    '    silo: Mapped[Silo] = relationship(back_populates="readings")\n'
    '    sensor: Mapped["Sensor | None"] = relationship(back_populates="readings")',
    1,
)

path.write_text(source, encoding="utf-8")

print("SQLAlchemy Sensor model and relationships added.")
print(f"Backup: {backup}")
