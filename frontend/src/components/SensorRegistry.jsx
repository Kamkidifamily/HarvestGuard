import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";

const API_BASE = "http://127.0.0.1:8000";

const POSITIONS = ["upper", "middle", "lower", "unspecified"];
const STATUSES = ["active", "inactive", "maintenance"];

// FastAPI sends `detail` as a string for most errors, but as a list of
// objects for validation errors. Turn either into a readable sentence.
function errorMessage(data, status) {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => item.msg).filter(Boolean);
    if (messages.length) return messages.join(". ");
  }
  return `Request failed with status ${status}`;
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      `Can't reach the API at ${API_BASE}. Check that the server is running.`,
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(errorMessage(data, response.status));
  }

  return data;
}

function capitalise(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unspecified";
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SensorRegistry({ siloId, siloName }) {
  const [sensors, setSensors] = useState([]);
  const [sensorCode, setSensorCode] = useState("");
  const [position, setPosition] = useState("upper");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadSensors = useCallback(async () => {
    if (!siloId) {
      setSensors([]);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await request(`/api/silos/${siloId}/sensors`);
      setSensors(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [siloId]);

  useEffect(() => {
    loadSensors();
  }, [loadSensors]);

  async function handleRegister(event) {
    event.preventDefault();

    const code = sensorCode.trim();
    if (!code || !siloId) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await request("/api/sensors", {
        method: "POST",
        body: JSON.stringify({
          silo_id: Number(siloId),
          sensor_code: code,
          position,
        }),
      });

      setSensorCode("");
      setPosition("upper");
      setNotice(`Registered ${code}.`);
      await loadSensors();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateSensor(sensor, changes) {
    setUpdatingId(sensor.id);
    setError("");
    setNotice("");

    try {
      await request(`/api/sensors/${sensor.id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });

      setNotice(`Saved changes to ${sensor.sensor_code}.`);
      await loadSensors();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingId(null);
    }
  }

  const activeCount = sensors.filter(
    (sensor) => sensor.status === "active",
  ).length;

  return (
    <div className="registry-page">
      <section className="page-heading registry-heading">
        <div>
          <h1>Sensor registry</h1>
          <p>
            {siloId
              ? `Probes installed in ${siloName || "this silo"}.`
              : "Select a silo to see and register its probes."}
          </p>
        </div>

        <button
          type="button"
          className="refresh-button"
          onClick={loadSensors}
          disabled={loading || !siloId}
        >
          <RefreshCw size={15} className={loading ? "spin" : ""} />
          Refresh
        </button>
      </section>

      {error && (
        <div className="registry-message error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="registry-message success" role="status">
          {notice}
        </div>
      )}

      <section className="registry-summary">
        <div>
          <span>Registered</span>
          <strong>{sensors.length}</strong>
        </div>
        <div>
          <span>Active</span>
          <strong>{activeCount}</strong>
        </div>
        <div>
          <span>Not active</span>
          <strong>{sensors.length - activeCount}</strong>
        </div>
      </section>

      <section className="section-block registry-form-section">
        <div className="section-heading">
          <div>
            <h2>Register a sensor</h2>
            <p>Enter the probe's code and where it's installed.</p>
          </div>
        </div>

        <form className="registry-form" onSubmit={handleRegister}>
          <label>
            <span>Sensor code</span>
            <input
              type="text"
              value={sensorCode}
              onChange={(event) => setSensorCode(event.target.value)}
              placeholder="e.g. HG-MUR-001-T04"
              minLength={2}
              maxLength={80}
              required
            />
          </label>

          <label>
            <span>Position in silo</span>
            <select
              value={position}
              onChange={(event) => setPosition(event.target.value)}
            >
              {POSITIONS.map((item) => (
                <option key={item} value={item}>
                  {capitalise(item)}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="registry-submit"
            disabled={saving || !siloId}
          >
            <Plus size={16} />
            {saving ? "Registering…" : "Register sensor"}
          </button>
        </form>
      </section>

      <section className="section-block registry-list-section">
        <div className="section-heading">
          <div>
            <h2>Installed sensors</h2>
            <p>Changing a position or status saves straight away.</p>
          </div>
          <span className="data-count">{sensors.length} registered</span>
        </div>

        {!siloId ? (
          <div className="empty-inline">Select a silo first.</div>
        ) : loading && sensors.length === 0 ? (
          <div className="empty-inline">Loading sensors…</div>
        ) : sensors.length === 0 ? (
          <div className="empty-inline">
            No sensors yet. Register the first one above.
          </div>
        ) : (
          <div className="registry-table-wrap">
            <table className="registry-table">
              <thead>
                <tr>
                  <th>Sensor</th>
                  <th>Position</th>
                  <th>Status</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {sensors.map((sensor) => (
                  <tr key={sensor.id}>
                    <td>
                      <div className="registry-sensor-name">
                        <div>
                          <strong>{sensor.sensor_code}</strong>
                          <span>ID {sensor.id}</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <select
                        value={sensor.position || "unspecified"}
                        disabled={updatingId === sensor.id}
                        onChange={(event) =>
                          updateSensor(sensor, {
                            position: event.target.value,
                          })
                        }
                        aria-label={`Position for ${sensor.sensor_code}`}
                      >
                        {POSITIONS.map((item) => (
                          <option key={item} value={item}>
                            {capitalise(item)}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <select
                        className={`registry-status ${sensor.status}`}
                        value={sensor.status}
                        disabled={updatingId === sensor.id}
                        onChange={(event) =>
                          updateSensor(sensor, {
                            status: event.target.value,
                          })
                        }
                        aria-label={`Status for ${sensor.sensor_code}`}
                      >
                        {STATUSES.map((item) => (
                          <option key={item} value={item}>
                            {capitalise(item)}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>{formatDate(sensor.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="registry-footnote">
        <span>
          This list only tracks which probes exist and where they sit. Readings
          are collected separately.
        </span>
      </div>
    </div>
  );
}