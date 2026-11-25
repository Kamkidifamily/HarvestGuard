from datetime import datetime, timezone
from fastapi import FastAPI, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.config import settings
from app.database import Base, engine, get_db
from app.models import Site, Silo, Sensor, SensorReading
from app.schemas import (SiteCreate, SiteOut, SiloCreate, SiloOut, ReadingCreate, ReadingOut, SensorCreate, SensorUpdate, SensorOut)
from app.risk.engine import assess_reading
from fastapi.middleware.cors import CORSMiddleware

Base.metadata.create_all(bind=engine)
app = FastAPI(title=settings.app_name, version="0.1.0", description="Grain-storage monitoring prototype")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "HarvestGuard API", "version": "0.1.0"}

@app.post("/api/sites", response_model=SiteOut, status_code=201)
def create_site(payload: SiteCreate, db: Session = Depends(get_db)):
    if db.scalar(select(Site).where(Site.name == payload.name)):
        raise HTTPException(409, "A site with this name already exists")
    site = Site(**payload.model_dump())
    db.add(site); db.commit(); db.refresh(site)
    return site

@app.get("/api/sites", response_model=list[SiteOut])
def list_sites(db: Session = Depends(get_db)):
    return list(db.scalars(select(Site).order_by(Site.name)))

@app.post("/api/silos", response_model=SiloOut, status_code=201)
def create_silo(payload: SiloCreate, db: Session = Depends(get_db)):
    if not db.get(Site, payload.site_id):
        raise HTTPException(404, "Site not found")
    silo = Silo(**payload.model_dump())
    db.add(silo); db.commit(); db.refresh(silo)
    return silo

@app.get("/api/silos", response_model=list[SiloOut])
def list_silos(site_id: int | None = None, db: Session = Depends(get_db)):
    stmt = select(Silo).order_by(Silo.name)
    if site_id is not None:
        stmt = stmt.where(Silo.site_id == site_id)
    return list(db.scalars(stmt))



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


@app.post("/api/readings", response_model=ReadingOut, status_code=201)
def create_reading(payload: ReadingCreate, db: Session = Depends(get_db)):
    if not db.get(Silo, payload.silo_id):
        raise HTTPException(404, "Silo not found")
    data = payload.model_dump()
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

    reading = SensorReading(**data)
    db.add(reading); db.commit(); db.refresh(reading)
    return reading

@app.get("/api/silos/{silo_id}/readings", response_model=list[ReadingOut])
def list_readings(silo_id: int, limit: int = Query(default=100, ge=1, le=1000), db: Session = Depends(get_db)):
    if not db.get(Silo, silo_id):
        raise HTTPException(404, "Silo not found")
    stmt = select(SensorReading).where(SensorReading.silo_id == silo_id).order_by(SensorReading.recorded_at.desc()).limit(limit)
    return list(db.scalars(stmt))

@app.get("/api/silos/{silo_id}/risk")
def silo_risk(silo_id: int, db: Session = Depends(get_db)):
    silo = db.get(Silo, silo_id)
    if not silo:
        raise HTTPException(404, "Silo not found")
    readings = list(db.scalars(
        select(SensorReading).where(SensorReading.silo_id == silo_id)
        .order_by(SensorReading.recorded_at.desc()).limit(100)
    ))
    if not readings:
        return {"silo_id": silo_id, "status": "awaiting_data", "sensor_count": 0, "assessments": []}
    latest_by_sensor = {}
    for reading in readings:
        latest_by_sensor.setdefault(reading.sensor_id, reading)
    assessments = []
    for sensor_id, reading in latest_by_sensor.items():
        result = assess_reading(reading.temperature_c, reading.relative_humidity_pct,
                                reading.co2_ppm, reading.grain_moisture_pct)
        assessments.append({"sensor_id": sensor_id, "position": reading.position,
                            "recorded_at": reading.recorded_at, **result})
    overall = max(assessments, key=lambda x: x["score"])
    return {"silo_id": silo_id, "grain_type": silo.grain_type,
            "status": "assessed", "sensor_count": len(assessments),
            "overall_level": overall["level"], "overall_score": overall["score"],
            "assessments": assessments}
