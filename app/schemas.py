from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

class SiteCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    county: str | None = None
    country: str = "Kenya"

class SiteOut(SiteCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)

class SiloCreate(BaseModel):
    site_id: int
    name: str = Field(min_length=2, max_length=160)
    grain_type: str = "maize"
    capacity_tonnes: float | None = Field(default=None, gt=0)

class SiloOut(SiloCreate):
    id: int
    model_config = ConfigDict(from_attributes=True)

class ReadingCreate(BaseModel):
    silo_id: int
    sensor_id: str
    position: str = "unspecified"
    temperature_c: float = Field(ge=-30, le=80)
    relative_humidity_pct: float = Field(ge=0, le=100)
    co2_ppm: float | None = Field(default=None, ge=0, le=100000)
    grain_moisture_pct: float | None = Field(default=None, ge=0, le=100)
    recorded_at: datetime | None = None



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

class ReadingOut(ReadingCreate):
    id: int
    recorded_at: datetime
    model_config = ConfigDict(from_attributes=True)
