from datetime import datetime, timezone
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

def utcnow():
    return datetime.now(timezone.utc)

class Site(Base):
    __tablename__ = "sites"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    county: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str] = mapped_column(String(80), default="Kenya")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    silos: Mapped[list["Silo"]] = relationship(back_populates="site", cascade="all, delete-orphan")

class Silo(Base):
    __tablename__ = "silos"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    grain_type: Mapped[str] = mapped_column(String(40), default="maize")
    capacity_tonnes: Mapped[float | None] = mapped_column(Float, nullable=True)
    site: Mapped[Site] = relationship(back_populates="silos")
    readings: Mapped[list["SensorReading"]] = relationship(back_populates="silo", cascade="all, delete-orphan")
    sensors: Mapped[list["Sensor"]] = relationship(back_populates="silo", cascade="all, delete-orphan")



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

class SensorReading(Base):
    __tablename__ = "sensor_readings"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    silo_id: Mapped[int] = mapped_column(ForeignKey("silos.id", ondelete="CASCADE"), index=True)
    sensor_id: Mapped[str] = mapped_column(String(80), index=True)
    sensor_ref_id: Mapped[int | None] = mapped_column(
        ForeignKey("sensors.id"), nullable=True, index=True
    )
    position: Mapped[str] = mapped_column(String(80), default="unspecified")
    temperature_c: Mapped[float] = mapped_column(Float)
    relative_humidity_pct: Mapped[float] = mapped_column(Float)
    co2_ppm: Mapped[float | None] = mapped_column(Float, nullable=True)
    grain_moisture_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    silo: Mapped[Silo] = relationship(back_populates="readings")
    sensor: Mapped["Sensor | None"] = relationship(back_populates="readings")

Index("ix_readings_silo_time", SensorReading.silo_id, SensorReading.recorded_at)
