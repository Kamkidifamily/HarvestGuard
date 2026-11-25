import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  Database,
  Droplets,
  Layers3,
  Leaf,
  RefreshCw,
  ShieldCheck,
  Thermometer,
  Wind,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./App.css";
import SensorRegistry from "./components/SensorRegistry.jsx";
const TemperatureChart = lazy(
  () => import("./components/TemperatureChart.jsx"),
);

const API_BASE = "http://127.0.0.1:8000";
const REFRESH_MS = 15000;
// A sensor with no new reading for this long is flagged as stale. Tune to your logging interval.
const STALE_AFTER_MIN = 30;
const POSITION_ORDER = ["upper", "middle", "lower"];
const SERIES_COLORS = ["#C65A3A", "#315C78", "#6F8F5E", "#8A6FA8"];
const ALERT_COLOR = "#C65A3A";

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`API request failed (${response.status}): ${path}`);
  }
  return response.json();
}

// Timestamps without a zone (common from FastAPI + naive datetimes) are treated as UTC.
// If your backend stores local Nairobi time instead, remove the `Z` handling here.
function parseTime(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return new Date(value);
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasZone ? value : `${value}Z`);
}

const ts = (value) => parseTime(value)?.getTime() ?? 0;

function formatTime(value) {
  const date = parseTime(value);
  if (!date) return "—";
  return date.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value) {
  const date = parseTime(value);
  if (!date) return "—";
  return date.toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function minutesSince(value) {
  const time = ts(value);
  return time ? (Date.now() - time) / 60000 : Infinity;
}

function timeAgo(value) {
  if (!value) return "no data";
  const mins = Math.round(minutesSince(value));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

function capitalise(text) {
  if (!text) return "Unspecified";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function fmt(value, digits = 1, unit = "") {
  return value == null ? "—" : `${Number(value).toFixed(digits)}${unit}`;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function average(items, key) {
  const values = items.map((item) => item[key]).filter((v) => v != null);
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

function highest(items, key) {
  return items.reduce(
    (best, item) => (item[key] != null && (!best || item[key] > best[key]) ? item : best),
    null,
  );
}

function riskClass(level) {
  return ["low", "moderate", "high", "critical"].includes(level?.toLowerCase())
    ? level.toLowerCase()
    : "unknown";
}

function RiskPill({ level }) {
  const value = level || "Unknown";
  return (
    <span className={`risk-pill ${riskClass(value)}`}>
      <span className="risk-dot" />
      {value}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, unit, note, tone = "green" }) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}>
        <Icon size={19} strokeWidth={1.8} />
      </div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value ?? "—"}
        {value !== null && value !== undefined && (
          <span className="metric-unit">{unit}</span>
        )}
      </div>
      <div className="metric-note">{note}</div>
    </article>
  );
}

function SensorCard({ sensor }) {
  const stale = minutesSince(sensor.recorded_at) > STALE_AFTER_MIN;
  return (
    <article className="sensor-card">
      <div className="sensor-card-top">
        <div>
          <h3>{capitalise(sensor.position)}</h3>
        </div>
        <span
          className="sensor-indicator"
          style={stale ? { color: ALERT_COLOR } : undefined}
        >
          <Activity size={15} /> {timeAgo(sensor.recorded_at)}
        </span>
      </div>
      <div className="sensor-reading-grid">
        <div>
          <strong>{fmt(sensor.temperature_c, 1, "°C")}</strong>
          <span>Temperature</span>
        </div>
        <div>
          <strong>{fmt(sensor.relative_humidity_pct, 1, "%")}</strong>
          <span>Relative humidity</span>
        </div>
        <div>
          <strong>{fmt(sensor.co2_ppm, 0, " ppm")}</strong>
          <span>CO₂</span>
        </div>
        <div>
          <strong>{fmt(sensor.grain_moisture_pct, 1, "%")}</strong>
          <span>Grain moisture</span>
        </div>
      </div>
      <div className="sensor-card-footer">
        <span>{sensor.sensor_id}</span>
        <span>Updated {formatTime(sensor.recorded_at)}</span>
      </div>
    </article>
  );
}

function SiloProfile({
  sensors,
  assessments,
  selectedSensorId,
  onSelect,
}) {
  const positions = [
    { key: "upper", label: "Upper", top: "24%" },
    { key: "middle", label: "Middle", top: "51%" },
    { key: "lower", label: "Lower", top: "78%" },
  ];

  const selectedSensor =
    sensors.find((sensor) => sensor.sensor_id === selectedSensorId) ||
    sensors[0] ||
    null;

  const selectedAssessment = assessments?.find(
    (item) => item.sensor_id === selectedSensor?.sensor_id,
  );

  if (!selectedSensor) {
    return (
      <section className="section-block">
        <div className="section-heading">
          <div>
            <h2>Silo cross-section</h2>
            <p>Where each probe sits in the grain.</p>
          </div>
        </div>
        <div className="empty-inline">
          The cross-section appears once sensors start reporting.
        </div>
      </section>
    );
  }

  return (
    <section className="section-block silo-profile-section">
      <div className="section-heading">
        <div>
          <h2>Silo cross-section</h2>
          <p>
            Select a probe to see its latest reading and risk score.
          </p>
        </div>
        <span className="data-count">{sensors.length} sensor positions</span>
      </div>

      <div className="silo-profile-layout">
        <div className="silo-visual-panel">
          <div className="silo-visual-heading">
            <span>Vertical section</span>
            <span>Schematic, not to scale</span>
          </div>

          <div className="silo-drawing">
            <div className="silo-roof">
              <span>Roof</span>
            </div>

            <div className="silo-body">
              <div className="silo-grain">
                <span className="grain-label">Grain mass</span>
              </div>

              <div className="silo-probe-line" />

              {positions.map((position) => {
                const sensor = sensors.find(
                  (item) =>
                    item.position?.toLowerCase() === position.key,
                );

                const assessment = assessments?.find(
                  (item) => item.sensor_id === sensor?.sensor_id,
                );

                const isSelected =
                  sensor?.sensor_id === selectedSensor.sensor_id;

                const isStale =
                  sensor &&
                  minutesSince(sensor.recorded_at) > STALE_AFTER_MIN;

                return (
                  <button
                    key={position.key}
                    type="button"
                    className={`silo-probe ${isSelected ? "selected" : ""} ${
                      assessment ? riskClass(assessment.level) : "unknown"
                    }`}
                    style={{ top: position.top }}
                    disabled={!sensor}
                    onClick={() => sensor && onSelect(sensor.sensor_id)}
                    aria-pressed={isSelected}
                    title={
                      sensor
                        ? `${position.label}: ${sensor.sensor_id}`
                        : `${position.label}: no reading available`
                    }
                  >
                    <span className="silo-probe-marker" />
                    <span className="silo-probe-label">
                      <strong>{position.label}</strong>
                      <small>
                        {sensor
                          ? fmt(sensor.temperature_c, 1, "°C")
                          : "No data"}
                      </small>
                      {isStale && <small>Stale</small>}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="silo-base">
              <span>Discharge</span>
            </div>
          </div>

          <div className="silo-visual-legend">
            <span><i className="legend-dot low" /> Low</span>
            <span><i className="legend-dot moderate" /> Moderate</span>
            <span><i className="legend-dot high" /> High / critical</span>
          </div>
        </div>

        <div className="silo-selected-panel">
          <div className="silo-selected-heading">
            <div>
              <h3>{capitalise(selectedSensor.position)}</h3>
              <p>{selectedSensor.sensor_id}</p>
            </div>
            <RiskPill level={selectedAssessment?.level || "Unknown"} />
          </div>

          <div className="silo-selected-readings">
            <div>
              <span>Temperature</span>
              <strong>{fmt(selectedSensor.temperature_c, 1, "°C")}</strong>
            </div>
            <div>
              <span>Relative humidity</span>
              <strong>{fmt(selectedSensor.relative_humidity_pct, 1, "%")}</strong>
            </div>
            <div>
              <span>CO₂</span>
              <strong>{fmt(selectedSensor.co2_ppm, 0, " ppm")}</strong>
            </div>
            <div>
              <span>Grain moisture</span>
              <strong>{fmt(selectedSensor.grain_moisture_pct, 1, "%")}</strong>
            </div>
          </div>

          <div className="silo-selected-footer">
            <span>
              {minutesSince(selectedSensor.recorded_at) > STALE_AFTER_MIN
                ? "Stale reading"
                : "Recent reading"}
            </span>
            <span>Recorded {formatDate(selectedSensor.recorded_at)}</span>
          </div>

          {selectedAssessment && (
            <div className="silo-risk-note">
              <span>Screening score</span>
              <strong>{selectedAssessment.score}/100</strong>
              <p>
                {selectedAssessment.reasons?.length
                  ? selectedAssessment.reasons.join(" ")
                  : "No risk factors reported for this reading."}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}


export default function App() {
  const [sites, setSites] = useState([]);
  const [silos, setSilos] = useState([]);
  const [selectedSiloId, setSelectedSiloId] = useState("");
  const [selectedSensorId, setSelectedSensorId] = useState("");
  const [readings, setReadings] = useState([]);
  const [risk, setRisk] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [view, setView] = useState("overview");

  const selectedSilo = silos.find(
    (silo) => String(silo.id) === String(selectedSiloId),
  );

  const loadInventory = useCallback(async () => {
    const [siteData, siloData] = await Promise.all([
      apiGet("/api/sites"),
      apiGet("/api/silos"),
    ]);
    setSites(siteData);
    setSilos(siloData);

    if (siloData.length > 0) {
      setSelectedSiloId((current) => {
        if (current && siloData.some((s) => String(s.id) === String(current))) {
          return current;
        }
        return String(siloData[0].id);
      });
    }
  }, []);

  const loadSiloData = useCallback(async (siloId) => {
    if (!siloId) {
      setReadings([]);
      setRisk(null);
      return;
    }

    const [readingData, riskData] = await Promise.all([
      apiGet(`/api/silos/${siloId}/readings?limit=100`),
      apiGet(`/api/silos/${siloId}/risk`),
    ]);

    setReadings(readingData);
    setRisk(riskData);
    setLastUpdated(new Date());
  }, []);

  const refreshAll = useCallback(async (showSpinner = true) => {
    if (showSpinner) setRefreshing(true);
    try {
      await loadInventory();
    } catch (err) {
      setError(err.message);
    } finally {
      if (showSpinner) setRefreshing(false);
      setLoading(false);
    }
  }, [loadInventory]);

  useEffect(() => {
    refreshAll(false);
  }, [refreshAll]);

  useEffect(() => {
    if (!selectedSiloId) return;
    let active = true;

    const update = async () => {
      try {
        const [readingData, riskData] = await Promise.all([
          apiGet(`/api/silos/${selectedSiloId}/readings?limit=100`),
          apiGet(`/api/silos/${selectedSiloId}/risk`),
        ]);
        if (active) {
          setReadings(readingData);
          setRisk(riskData);
          setLastUpdated(new Date());
          setError("");
        }
      } catch (err) {
        if (active) setError(err.message);
      }
    };

    update();
    const timer = setInterval(update, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selectedSiloId]);

  // Latest reading per sensor, upper to lower. Sensors with an unexpected position still show, at the end.
  const latestSensors = useMemo(() => {
    const bySensor = new Map();
    [...readings]
      .sort((a, b) => ts(b.recorded_at) - ts(a.recorded_at))
      .forEach((reading) => {
        if (!bySensor.has(reading.sensor_id)) {
          bySensor.set(reading.sensor_id, reading);
        }
      });

    const rank = (sensor) => {
      const index = POSITION_ORDER.indexOf(sensor.position?.toLowerCase());
      return index === -1 ? POSITION_ORDER.length : index;
    };
    return [...bySensor.values()].sort((a, b) => rank(a) - rank(b));
  }, [readings]);

  const latestRecordedAt = latestSensors.reduce(
    (newest, sensor) =>
      !newest || ts(sensor.recorded_at) > ts(newest) ? sensor.recorded_at : newest,
    null,
  );

  // One line per sensor, so the chart shows each layer instead of zigzagging between them.
  const series = useMemo(
    () =>
      latestSensors.map((sensor, index) => ({
        key: `s${index}`,
        sensorId: sensor.sensor_id,
        label: capitalise(sensor.position),
        color: SERIES_COLORS[index % SERIES_COLORS.length],
      })),
    [latestSensors],
  );

  const chartData = useMemo(() => {
    const keyBySensor = new Map(series.map((s) => [s.sensorId, s.key]));
    return [...readings]
      .filter((r) => r.temperature_c != null && keyBySensor.has(r.sensor_id))
      .sort((a, b) => ts(a.recorded_at) - ts(b.recorded_at))
      .map((r) => ({
        ts: ts(r.recorded_at),
        [keyBySensor.get(r.sensor_id)]: r.temperature_c,
      }));
  }, [readings, series]);


  const selectedSensor =
  latestSensors.find(
    (sensor) => sensor.sensor_id === selectedSensorId,
  ) || latestSensors[0] || null;

const selectedSensorHistory = useMemo(() => {
  if (!selectedSensor) return [];

  return readings
    .filter(
      (reading) =>
        reading.sensor_id === selectedSensor.sensor_id &&
        reading.temperature_c != null,
    )
    .sort((a, b) => ts(a.recorded_at) - ts(b.recorded_at))
    .map((reading) => ({
      ts: ts(reading.recorded_at),
      temperature: reading.temperature_c,
    }));
}, [readings, selectedSensor]);

  const overallRisk = risk?.overall_level || "Awaiting data";
  const riskTone =
    riskClass(overallRisk) === "low"
      ? "green"
      : riskClass(overallRisk) === "unknown"
        ? "blue"
        : "orange";

  const averageTemperature = average(latestSensors, "temperature_c");
  const averageHumidity = average(latestSensors, "relative_humidity_pct");
  const averageCo2 = average(latestSensors, "co2_ppm");

  const extremeNote = (sensor, key, digits, unit, word) => {
    if (!sensor) return "No readings yet";
    if (latestSensors.length < 2) return "Single sensor";
    return `${capitalise(sensor.position)} is ${word} at ${fmt(sensor[key], digits, unit)}`;
  };

  const selectedSite = sites.find((site) => site.id === selectedSilo?.site_id);

  const stale = Boolean(latestRecordedAt) && minutesSince(latestRecordedAt) > STALE_AFTER_MIN;
  const statusText = error
    ? "API not reachable"
    : !latestRecordedAt
      ? "No readings yet"
      : stale
        ? `No new readings since ${formatTime(latestRecordedAt)}`
        : "Receiving readings";
  const statusDot = error || stale ? { background: ALERT_COLOR } : undefined;

  const handleManualRefresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      await loadInventory();
      if (selectedSiloId) await loadSiloData(selectedSiloId);
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  // Overview and Risk scroll within the dashboard. If the registry is open, switch back first.
  const showOverview = (sectionId) => (event) => {
    if (view === "overview") return;
    event.preventDefault();
    setView("overview");
    setTimeout(() => document.getElementById(sectionId)?.scrollIntoView(), 0);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-mark"><Leaf size={28} /></div>
        <h2>HarvestGuard</h2>
        <p>Loading silos…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Leaf size={22} /></div>
          <div>
            <strong>HarvestGuard</strong>
            <span>Storage monitoring</span>
          </div>
        </div>

        <nav className="side-nav">
          <a
            className={`nav-item ${view === "overview" ? "active" : ""}`}
            href="#overview"
            onClick={showOverview("overview")}
          >
            <Layers3 size={18} /> Overview
          </a>
          <a
            className={`nav-item ${view === "sensors" ? "active" : ""}`}
            href="#sensors"
            onClick={(event) => {
              event.preventDefault();
              setView("sensors");
            }}
          >
            <Activity size={18} /> Sensors
          </a>
          <a
            className="nav-item"
            href="#risk"
            onClick={showOverview("risk")}
          >
            <ShieldCheck size={18} /> Risk
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="connection-card">
            <span
              className="connection-light"
              style={error ? { background: ALERT_COLOR } : undefined}
            />
            <div>
              <strong>{error ? "API not reachable" : "API connected"}</strong>
              <span>{API_BASE.replace("http://", "")}</span>
            </div>
          </div>
          <div className="sidebar-version">v0.1</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>{selectedSite?.name || "Sites"}</span>
            <span className="crumb-slash">/</span>
            <strong>{selectedSilo?.name || "Overview"}</strong>
          </div>
          <div className="topbar-actions">
            <span className="live-status"><span style={statusDot} /> {statusText}</span>
            <button className="refresh-button" onClick={handleManualRefresh} disabled={refreshing}>
              <RefreshCw size={15} className={refreshing ? "spin" : ""} />
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </header>

        <div className="page-content">
          {view === "overview" && (
          <section className="page-heading" id="overview">
            <div>
              <h1>{selectedSilo?.name || "Storage overview"}</h1>
              <p>
                {latestSensors.length
                  ? `${selectedSite?.name || "Unnamed site"}, ${plural(latestSensors.length, "sensor")} reporting.`
                  : "No readings have been recorded for this silo yet."}
              </p>
            </div>
            <div className="heading-date">
              <span>Last reading</span>
              <strong>{formatDate(latestRecordedAt)}</strong>
            </div>
          </section>
          )}

          {error && (
            <div className="error-banner">
              <AlertCircle size={18} />
              <span>
                Couldn't load data: {error}. Check that the FastAPI server is running at{" "}
                {API_BASE} and that CORS allows this origin.
              </span>
            </div>
          )}

          <section className="selection-bar">
            <div className="selection-title">
              <div className="selection-icon"><Database size={18} /></div>
              <div>
                <strong>Site</strong>
                <span>{selectedSite?.name || "Select a silo to begin"}</span>
              </div>
            </div>
            <label className="silo-select-wrap">
              <span>Silo</span>
              <div className="select-control">
                <select
                  value={selectedSiloId}
                  onChange={(event) => setSelectedSiloId(event.target.value)}
                >
                  {silos.length === 0 && <option value="">No silos available</option>}
                  {silos.map((silo) => (
                    <option key={silo.id} value={silo.id}>{silo.name}</option>
                  ))}
                </select>
                <ChevronDown size={16} />
              </div>
            </label>
          </section>

          {view === "sensors" ? (
            <SensorRegistry siloId={selectedSiloId} siloName={selectedSilo?.name} />
          ) : silos.length === 0 ? (
            <div className="empty-state">
              <Database size={30} />
              <h2>No silos yet</h2>
              <p>Add a site and a silo through the backend, then they will show up here.</p>
            </div>
          ) : (
            <>
              <section className="metrics-grid">
                <MetricCard
                  icon={Thermometer}
                  label="Avg. temperature"
                  value={averageTemperature?.toFixed(1)}
                  unit="°C"
                  note={extremeNote(highest(latestSensors, "temperature_c"), "temperature_c", 1, "°C", "warmest")}
                  tone="orange"
                />
                <MetricCard
                  icon={Droplets}
                  label="Avg. humidity"
                  value={averageHumidity?.toFixed(1)}
                  unit="%"
                  note={extremeNote(highest(latestSensors, "relative_humidity_pct"), "relative_humidity_pct", 1, "%", "most humid")}
                  tone="blue"
                />
                <MetricCard
                  icon={Wind}
                  label="Avg. CO₂"
                  value={averageCo2?.toFixed(0)}
                  unit="ppm"
                  note={extremeNote(highest(latestSensors, "co2_ppm"), "co2_ppm", 0, " ppm", "highest")}
                  tone="purple"
                />
                <MetricCard
                  icon={ShieldCheck}
                  label="Risk score"
                  value={risk?.overall_score}
                  unit="/100"
                  note={<RiskPill level={overallRisk} />}
                  tone={riskTone}
                />
              </section>

             <SiloProfile
  sensors={latestSensors}
  assessments={risk?.assessments || []}
 selectedSensorId={selectedSensor?.sensor_id || ""}
  onSelect={setSelectedSensorId}
/>
<Suspense
  fallback={
    <section className="section-block chart-section">
      <div className="chart-empty">Loading chart…</div>
    </section>
  }
>
  <TemperatureChart
    chartData={chartData}
    series={series}
    formatTime={formatTime}
    formatDate={formatDate}
    readingsCount={readings.length}
    plural={plural}
  />
</Suspense>
<section className="section-block chart-section">
  <div className="section-heading">
    <div>
      <h2>Selected sensor history</h2>
      <p>
        {selectedSensor
          ? `${capitalise(selectedSensor.position)} sensor, ${selectedSensor.sensor_id}`
          : "Select a sensor to view its history."}
      </p>
    </div>
    {selectedSensor && (
      <span className="data-count">
        {plural(selectedSensorHistory.length, "reading")}
      </span>
    )}
  </div>

  <div className="chart-container">
    {selectedSensorHistory.length > 0 ? (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={selectedSensorHistory}
          margin={{ top: 12, right: 18, left: -12, bottom: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 5"
            vertical={false}
            stroke="#D9D9D0"
          />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatTime}
            tick={{ fill: "#87949A", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(value) => `${value}°`}
            tick={{ fill: "#87949A", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              border: "1px solid #D9D9D0",
              borderRadius: 2,
              fontSize: 12,
            }}
            formatter={(value) => `${Number(value).toFixed(1)} °C`}
            labelFormatter={(value) => `Recorded ${formatDate(value)}`}
          />
          <Line
            type="monotone"
            dataKey="temperature"
            name="Temperature"
            stroke="#C65A3A"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    ) : (
      <div className="chart-empty">
        No temperature history is available for this sensor.
      </div>
    )}
  </div>
</section>

<section className="section-block" id="sensors">
                <div className="section-heading">
                  <div>
                    <h2>Sensors</h2>
                    <p>Latest reading from each position in the silo.</p>
                  </div>
                   <span className="data-count">
  {plural(
    latestSensors.filter(
      (sensor) => minutesSince(sensor.recorded_at) <= STALE_AFTER_MIN,
    ).length,
    "recent reading",
  )}
  {", "}
  {plural(
    latestSensors.filter(
      (sensor) => minutesSince(sensor.recorded_at) > STALE_AFTER_MIN,
    ).length,
    "stale reading",
  )}
</span>
                </div>

                {latestSensors.length > 0 ? (
                  <div className="sensor-grid">
                    {latestSensors.map((sensor) => (
                      <SensorCard key={sensor.sensor_id} sensor={sensor} />
                    ))}
                  </div>
                ) : (
                  <div className="empty-inline">No sensor readings have been recorded for this silo yet.</div>
                )}
              </section>
<section className="section-block" id="risk">
                <div className="section-heading">
                  <div>
                    <h2>Risk assessment</h2>
                    <p>Scored from the latest reading of each sensor.</p>
                  </div>
                  <RiskPill level={overallRisk} />
                </div>

                <div className="risk-summary">
                  <div className={`risk-score-panel ${riskClass(overallRisk)}`}>
                    <span>Overall score</span>
                    <strong>{risk?.overall_score ?? "—"}<small>/100</small></strong>
                    <div className="score-track">
                      <div style={{ width: `${Math.min(risk?.overall_score || 0, 100)}%` }} />
                    </div>
                    <p>The highest of the individual sensor scores.</p>
                  </div>

                  <div className="risk-details">
                    {risk?.assessments?.length ? risk.assessments.map((assessment) => (
                      <div className="risk-row" key={assessment.sensor_id}>
                        <div className="risk-row-heading">
                          <strong>{capitalise(assessment.position)} ({assessment.sensor_id})</strong>
                          <RiskPill level={assessment.level} />
                        </div>
                        <span className="risk-row-score">Score {assessment.score}/100</span>
                        <ul>
                          {(assessment.reasons || []).map((reason, index) => (
                            <li key={index}>{reason}</li>
                          ))}
                        </ul>
                        {assessment.recommended_checks?.length > 0 && (
                          <div className="check-recommendation">
                            <AlertTriangle size={15} />
                            <span>{assessment.recommended_checks.join(" ")}</span>
                          </div>
                        )}
                      </div>
                    )) : (
                      <div className="empty-inline">Risk scores will appear once this silo has readings.</div>
                    )}
                  </div>
                </div>

                <div className="disclaimer">
                  <AlertCircle size={16} />
                  <p>
                    This is a screening score, not a validated spoilage forecast or a food-safety
                    decision. Check anything flagged with a calibrated meter and a representative
                    grain sample.
                  </p>
                </div>
              </section>
            </>
          )}

          <footer className="page-footer">
            <div><Leaf size={15} /> HarvestGuard</div>
            <div>
              {lastUpdated ? `Fetched ${lastUpdated.toLocaleTimeString("en-KE")}` : "Waiting for data"}
              <span className="footer-separator">,</span> refreshes every {REFRESH_MS / 1000} seconds
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}