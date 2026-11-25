# HarvestGuard

A clean-start prototype for grain-storage monitoring. Version 0.1 focuses on a transparent software foundation:
- FastAPI backend
- SQLite by default (PostgreSQL-ready configuration)
- Silo and sensor data models
- Deterministic sensor simulator
- Explainable, rule-based risk indicators
- Basic API and tests

## Important scope and safety note
The initial risk score is an **engineering prototype indicator**, not a validated fungal-growth model, food-safety determination, or seven-day spoilage prediction. Thresholds are configurable placeholders pending grain-specific scientific calibration and field validation. Never use this prototype to make a real grain-release, fumigation, or safety decision.

## Requirements
- Python 3.11+
- Windows, macOS, or Linux

## Setup (Windows PowerShell)
```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

Open:
- API docs: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/api/health

## Run the simulator
In a second terminal, activate the environment and run:
```powershell
python -m simulator.run --api http://127.0.0.1:8000 --site-name "Demo Grain Facility" --silo-name "Maize Silo 01" --hours 72
```
This generates synthetic hourly readings for three sensor positions. It posts readings to the API as it runs.

## Run tests
```powershell
pytest -q
```

## Main endpoints
- `GET /api/health`
- `GET /api/sites`
- `POST /api/sites`
- `GET /api/silos`
- `POST /api/silos`
- `GET /api/silos/{silo_id}/readings`
- `POST /api/readings`
- `GET /api/silos/{silo_id}/risk`

## Project structure
```text
harvestguard/
  app/
    __init__.py
    config.py
    database.py
    main.py
    models.py
    schemas.py
    risk/
      __init__.py
      engine.py
  simulator/
    __init__.py
    run.py
  tests/
    test_risk_engine.py
  requirements.txt
  .env.example
```

## Next build milestone
After confirming this runs locally, we will add MQTT ingestion and TimescaleDB-compatible time-series storage, then build the React dashboard against these API contracts.

## Development Roadmap

HarvestGuard is being developed as a prototype IoT platform for monitoring grain storage conditions. The current development phase uses simulated sensor readings so that the complete data pipeline can be tested before physical hardware is acquired.

### Implemented

- [x] FastAPI backend and REST API.
- [x] Site and silo registration.
- [x] Sensor registration and assignment to silos.
- [x] Sensor positions: upper, middle and lower.
- [x] Sensor reading storage in the database.
- [x] Association of readings with registered sensors.
- [x] Initial grain-storage risk assessment prototype.
- [x] React dashboard with sensor readings and charts.
- [x] Automatic dashboard data refresh.
- [x] Initial sensor registry interface.

### Next Development Phases

#### Phase 1: Simulated IoT Devices
- [ ] Build a Python-based IoT sensor simulator.
- [ ] Generate temperature, relative humidity, CO2 and grain moisture readings.
- [ ] Simulate multiple sensors across multiple silos.
- [ ] Configure automatic readings at regular intervals.
- [ ] Simulate changing storage conditions over time.
- [ ] Clearly distinguish simulated measurements from real hardware readings.

#### Phase 2: Device Identity and Security
- [ ] Give each IoT device a unique identity.
- [ ] Implement device authentication using secure credentials.
- [ ] Restrict devices to submitting readings for their assigned silos and sensors.
- [ ] Validate incoming measurements and reject invalid submissions.

#### Phase 3: Automated Data Ingestion
- [ ] Develop a dedicated device-ingestion endpoint.
- [ ] Receive readings automatically from simulated IoT devices.
- [ ] Associate every reading with the correct site, silo and sensor.
- [ ] Store incoming readings with accurate timestamps.
- [ ] Handle duplicate, missing and invalid readings.

#### Phase 4: Live Monitoring
- [ ] Connect the simulator to the backend API.
- [ ] Update dashboard measurements automatically.
- [ ] Introduce WebSocket communication for near-real-time updates.
- [ ] Display the latest reading and last communication time for each sensor.
- [ ] Add device connectivity and stale-data indicators.

#### Phase 5: Historical Data and Analytics
- [ ] Build historical temperature, humidity, CO2 and grain moisture charts.
- [ ] Support selectable time ranges.
- [ ] Compare sensor measurements across silo positions.
- [ ] Provide silo-level and site-level monitoring summaries.

#### Phase 6: Risk Monitoring and Alerts
- [ ] Improve the prototype grain-storage risk assessment engine.
- [ ] Introduce configurable warning thresholds.
- [ ] Detect unusual measurement patterns.
- [ ] Display alerts and recommended inspection actions.
- [ ] Record alert history and acknowledgement status.

#### Phase 7: Physical IoT Hardware Integration
- [ ] Evaluate ESP32 and industrial IoT controllers.
- [ ] Integrate suitable temperature, humidity, CO2 and grain moisture sensors.
- [ ] Implement communication through Wi-Fi, Ethernet or cellular connectivity.
- [ ] Evaluate MQTT and industrial protocols such as RS485/Modbus.
- [ ] Replace simulated readings with measurements from physical devices.
- [ ] Test sensor reliability, calibration and connectivity.

#### Phase 8: Deployment and Production Readiness
- [ ] Deploy the backend and frontend.
- [ ] Configure a production database.
- [ ] Secure API communication using HTTPS.
- [ ] Implement backups, logging and monitoring.
- [ ] Test multiple sites, silos and connected devices.
- [ ] Document installation, configuration and hardware setup.

### Prototype Data Disclaimer

During the simulation phase, sensor readings are generated by software and do not represent actual measurements from physical grain storage facilities. Risk assessments are experimental screening indicators and must not be treated as validated grain-spoilage forecasts or food-safety determinations.
