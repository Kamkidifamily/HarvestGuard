from pathlib import Path
from datetime import datetime
import shutil

schemas_path = Path("app/schemas.py")
main_path = Path("app/main.py")

schemas = schemas_path.read_text(encoding="utf-8")
main = main_path.read_text(encoding="utf-8")

# Prevent accidental duplicate insertion.
if "class SensorCreate(BaseModel):" in schemas:
    raise SystemExit("Sensor schemas already exist. No changes made.")

if '@app.post("/api/sensors"' in main:
    raise SystemExit("Sensor API routes already exist. No changes made.")

# Verify expected source patterns before modifying anything.
checks = [
    (schemas, "class ReadingOut(ReadingCreate):", "schemas.py"),
    (main, "from app.models import Site, Silo, SensorReading", "main.py"),
    (main, "from app.schemas import SiteCreate, SiteOut, SiloCreate, SiloOut, ReadingCreate, ReadingOut", "main.py"),
    (main, '@app.post("/api/readings", response_model=ReadingOut, status_code=201)', "main.py"),
    (main, '    data = payload.model_dump()\n    data["recorded_at"] = data["recorded_at"] or datetime.now(timezone.utc)', "main.py"),
    (main, '@app.get("/api/silos/{silo_id}/readings", response_model=list[ReadingOut])', "main.py"),
]

for content, expected, filename in checks:
    if expected not in content:
        raise SystemExit(f"Expected code not found in {filename}: {expected}")

# Back up both files.
stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
for path in (schemas_path, main_path):
    backup = path.with_name(f"{path.name}.backup-{stamp}")
    shutil.copy2(path, backup)
    print(f"Backup created: {backup}")

# Add sensor schemas.
sensor_schemas = '''

class SensorCreate(BaseModel):
    silo_id: int
    sensor_code: str = Field(min_length=2, max_length=80)
    position: str = Field(default="unspecified", min_length=1, max_length=80)


class SensorUpdate(BaseModel):
    position: str | None = Field(default=None, min_length=1, max_length=80)
    status: str | None = Field(
        default=None,
        pattern="^(active|inactive|maintenance)$",
    )


class SensorOut(BaseModel):
    id: int
    silo_id: int
    sensor_code: str
    position: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
'''

schemas = schemas.replace(
    "class ReadingOut(ReadingCreate):",
    sensor_schemas + "\nclass ReadingOut(ReadingCreate):",
    1,
)

# Add model and schema imports.
main = main.replace(
    "from app.models import Site, Silo, SensorReading",
    "from app.models import Site, Silo, Sensor, SensorReading",
    1,
)

main = main.replace(
    "from app.schemas import SiteCreate, SiteOut, SiloCreate, SiloOut, ReadingCreate, ReadingOut",
    "from app.schemas import (SiteCreate, SiteOut, SiloCreate, SiloOut, "
    "ReadingCreate, ReadingOut, SensorCreate, SensorUpdate, SensorOut)",
    1,
)

# Add sensor registration and management endpoints before readings.
sensor_routes = '''

@app.post("/api/sensors", response_model=SensorOut, status_code=201)
def create_sensor(payload: SensorCreate, db: Session = Depends(get_db)):
    if not db.get(Silo, payload.silo_id):
        raise HTTPException(404, "Silo not found")

    existing = db.scalar(
        select(Sensor).where(
            Sensor.silo_id == payload.silo_id,
            Sensor.sensor_code == payload.sensor_code,
        )
    )
    if existing:
        raise HTTPException(409, "This sensor is already registered to this silo")

    sensor = Sensor(**payload.model_dump())
    db.add(sensor)
    db.commit()
    db.refresh(sensor)
    return sensor


@app.get("/api/sensors", response_model=list[SensorOut])
def list_sensors(
    silo_id: int | None = None,
    db: Session = Depends(get_db),
):
    stmt = select(Sensor).order_by(Sensor.silo_id, Sensor.sensor_code)
    if silo_id is not None:
        stmt = stmt.where(Sensor.silo_id == silo_id)
    return list(db.scalars(stmt))


@app.get("/api/silos/{silo_id}/sensors", response_model=list[SensorOut])
def list_silo_sensors(silo_id: int, db: Session = Depends(get_db)):
    if not db.get(Silo, silo_id):
        raise HTTPException(404, "Silo not found")

    stmt = (
        select(Sensor)
        .where(Sensor.silo_id == silo_id)
        .order_by(Sensor.sensor_code)
    )
    return list(db.scalars(stmt))


@app.patch("/api/sensors/{sensor_id}", response_model=SensorOut)
def update_sensor(
    sensor_id: int,
    payload: SensorUpdate,
    db: Session = Depends(get_db),
):
    sensor = db.get(Sensor, sensor_id)
    if not sensor:
        raise HTTPException(404, "Sensor not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(400, "No sensor changes supplied")

    if any(value is None for value in changes.values()):
        raise HTTPException(422, "Sensor fields cannot be null")

    for field, value in changes.items():
        setattr(sensor, field, value)

    db.commit()
    db.refresh(sensor)
    return sensor

'''

main = main.replace(
    '@app.post("/api/readings", response_model=ReadingOut, status_code=201)',
    sensor_routes + '\n@app.post("/api/readings", response_model=ReadingOut, status_code=201)',
    1,
)

# Automatically associate readings with registered sensors.
old_reading_logic = '''    data = payload.model_dump()
    data["recorded_at"] = data["recorded_at"] or datetime.now(timezone.utc)
    reading = SensorReading(**data)'''

new_reading_logic = '''    data = payload.model_dump()
    data["recorded_at"] = data["recorded_at"] or datetime.now(timezone.utc)

    registered_sensor = db.scalar(
        select(Sensor).where(
            Sensor.silo_id == payload.silo_id,
            Sensor.sensor_code == payload.sensor_id,
        )
    )

    if registered_sensor:
        data["sensor_ref_id"] = registered_sensor.id
        data["position"] = registered_sensor.position
    else:
        data["sensor_ref_id"] = None

    reading = SensorReading(**data)'''

main = main.replace(old_reading_logic, new_reading_logic, 1)

# Write updated files.
schemas_path.write_text(schemas, encoding="utf-8")
main_path.write_text(main, encoding="utf-8")

print()
print("SUCCESS: Sensor schemas and API routes added.")
print("Existing site, silo, reading and risk routes preserved.")
print("Registered sensor readings will be linked automatically.")
