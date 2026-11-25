import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function TemperatureChart({
  chartData,
  series,
  formatTime,
  formatDate,
  readingsCount,
  plural,
}) {
  return (
    <section className="section-block chart-section">
      <div className="section-heading">
        <div>
          <h2>Temperature by position</h2>
          <p>Historical temperature readings across the silo.</p>
        </div>
        <span className="data-count">
          {plural(readingsCount, "reading")}
        </span>
      </div>

      <div className="chart-legend">
        {series.map((item) => (
          <span key={item.sensorId}>
            <i style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      <div className="chart-container">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
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
              {series.map((item) => (
                <Line
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  name={item.label}
                  stroke={item.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="chart-empty">
            No temperature history is available yet.
          </div>
        )}
      </div>
    </section>
  );
}
