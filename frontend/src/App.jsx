import React, { useState } from "react";
import axios from "axios";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const COLORS = {
  Green: "#4caf50",
  Yellow: "#ff9800",
  Red: "#f44336",
};

// For sorting risk severity
const RISK_ORDER = { Red: 3, Yellow: 2, Green: 1 };

function App() {
  // ---- NAV STATE: which "page" is active ----
  const [activePage, setActivePage] = useState("single"); // single | kpi | summary | table

  // ---- SINGLE ASSET PREDICTOR STATE ----
  const [form, setForm] = useState({
    uid: "M14860", // Machine ID / UID
    air_temperature_k: 300,
    process_temperature_k: 310,
    rotational_speed_rpm: 1500,
    torque_nm: 40,
    tool_wear_min: 5,
    type: "H", // H / L / M
  });

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [csvError, setCsvError] = useState("");

  // ---- SHARED ASSET STATE FOR ALL OTHER PAGES ----
  // Each asset: { id, type, torque_nm, air_temperature_k, tool_wear_min, failure_probability, risk_level }
  const [assets, setAssets] = useState([]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    // uid & type stay string, others numeric
    if (name === "uid" || name === "type") {
      setForm((prev) => ({ ...prev, [name]: value }));
    } else {
      setForm((prev) => ({ ...prev, [name]: parseFloat(value) }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      // --- Derived features (must match training logic) ---
      const power = form.rotational_speed_rpm * form.torque_nm;
      const temperature_difference =
        form.process_temperature_k - form.air_temperature_k;
      const power_wear = power * form.tool_wear_min;
      const temperature_power = temperature_difference / power;

      let type_l = 0;
      let type_m = 0;
      if (form.type === "L") type_l = 1;
      if (form.type === "M") type_m = 1;

      const payload = {
        air_temperature_k: form.air_temperature_k,
        process_temperature_k: form.process_temperature_k,
        rotational_speed_rpm: form.rotational_speed_rpm,
        torque_nm: form.torque_nm,
        tool_wear_min: form.tool_wear_min,
        power,
        power_wear,
        temperature_difference,
        temperature_power,
        type_l,
        type_m,
        type: form.type, // can be ignored by backend
      };

      console.log("Payload sent to /predict:", payload);

      const resp = await axios.post(`${API_BASE}/predict`, payload);
      const data = resp.data;
      setResult(data);

      // ---- Update assets list for KPI / Summary / Table ----
      setAssets((prev) => {
        const existingIndex = prev.findIndex((a) => a.id === form.uid);
        const updatedAsset = {
          id: form.uid,
          type: form.type,
          torque_nm: form.torque_nm,
          air_temperature_k: form.air_temperature_k,
          tool_wear_min: form.tool_wear_min,
          failure_probability: data.failure_probability,
          risk_level: data.risk_level,
        };

        if (existingIndex !== -1) {
          // Replace existing asset
          const clone = [...prev];
          clone[existingIndex] = updatedAsset;
          return clone;
        }

        // Add new asset
        return [...prev, updatedAsset];
      });
    } catch (err) {
      console.error("Prediction error:", err);
      if (err.response) {
        console.error("Backend response:", err.response.data);
      }
      setError("Failed to fetch prediction. Check API connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleCsvUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvError("");
    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target.result;
      if (typeof text !== "string") {
        setCsvError("Unable to read CSV file.");
        return;
      }

      const lines = text.trim().split(/\r?\n/);
      if (lines.length < 2) {
        setCsvError("CSV must contain a header and at least one data row.");
        return;
      }

      // Parse header
      const header = lines[0]
        .split(",")
        .map((h) => h.trim().replace(/^"|"$/g, ""));
      const row = lines[1]
        .split(",")
        .map((v) => v.trim().replace(/^"|"$/g, ""));

      const get = (colName) => {
        const idx = header.indexOf(colName);
        if (idx === -1) return null;
        return row[idx];
      };

      // Map AI4I columns -> form fields
      const uid = get("UDI") || get("uid") || get("UID");
      const airTemp = parseFloat(get("Air temperature [K]"));
      const procTemp = parseFloat(get("Process temperature [K]"));
      const rpm = parseFloat(get("Rotational speed [rpm]"));
      const torque = parseFloat(get("Torque [Nm]"));
      const wear = parseFloat(get("Tool wear [min]"));
      const typeRaw = (get("Type") || "H").toString().trim();

      if (
        !uid ||
        Number.isNaN(airTemp) ||
        Number.isNaN(procTemp) ||
        Number.isNaN(rpm) ||
        Number.isNaN(torque) ||
        Number.isNaN(wear)
      ) {
        setCsvError(
          "Could not map CSV columns. Make sure it contains UDI, Air temperature [K], Process temperature [K], Rotational speed [rpm], Torque [Nm], Tool wear [min], Type."
        );
        return;
      }

      // Normalise Type to H / L / M
      let type = "H";
      if (["L", "M", "H"].includes(typeRaw)) {
        type = typeRaw;
      }

      // Update the form with the first row
      setForm((prev) => ({
        ...prev,
        uid,
        air_temperature_k: airTemp,
        process_temperature_k: procTemp,
        rotational_speed_rpm: rpm,
        torque_nm: torque,
        tool_wear_min: wear,
        type,
      }));
    };

    reader.onerror = () => {
      setCsvError("Error reading CSV file.");
    };

    reader.readAsText(file);
  };

  const pieData = result
    ? [
        { name: "Failure probability", value: result.failure_probability },
        { name: "No-failure probability", value: 1 - result.failure_probability },
      ]
    : [];

  const riskColor = result ? COLORS[result.risk_level] : "#9e9e9e";

  // ---- PAGE 2: KPI CARDS / GAUGES (LIVE) ----
  function KpiCardsView() {
    if (assets.length === 0) {
      return (
        <div>
          <h2>Machine KPI Cards</h2>
          <p>No assets yet. Run a prediction on the “Single Asset Predictor” tab.</p>
        </div>
      );
    }

    return (
      <div>
        <h2>Machine KPI Cards</h2>
        <p>
          Each card represents an individual machine with a traffic-light style
          risk indication.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
            marginTop: "1rem",
          }}
        >
          {assets.map((asset) => {
            const bg = COLORS[asset.risk_level] || "#424242";
            const isDarkText = asset.risk_level === "Yellow";
            return (
              <div
                key={asset.id}
                style={{
                  padding: "1rem",
                  borderRadius: 8,
                  background:
                    asset.risk_level === "Green"
                      ? "linear-gradient(135deg,#388e3c,#66bb6a)"
                      : asset.risk_level === "Yellow"
                      ? "linear-gradient(135deg,#f9a825,#ffeb3b)"
                      : "linear-gradient(135deg,#c62828,#ef5350)",
                  color: isDarkText ? "#000" : "#fff",
                  boxShadow:
                    asset.risk_level === "Red"
                      ? "0 0 16px rgba(244,67,54,0.7)"
                      : "0 0 10px rgba(0,0,0,0.3)",
                }}
              >
                <div style={{ fontSize: 14, opacity: 0.9 }}>
                  Machine #{asset.id}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>
                  {asset.risk_level === "Red"
                    ? "CRITICAL"
                    : asset.risk_level === "Yellow"
                    ? "Moderate Risk"
                    : "Healthy"}
                </div>
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  Failure Probability:{" "}
                  <strong>
                    {(asset.failure_probability * 100).toFixed(1)}%
                  </strong>
                </div>
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  Type: <strong>{asset.type}</strong> | Torque:{" "}
                  <strong>{asset.torque_nm.toFixed(1)} Nm</strong>
                </div>
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  Tool Wear: <strong>{asset.tool_wear_min} min</strong>
                </div>

                {/* Simple "traffic light" */}
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      border: "2px solid rgba(0,0,0,0.3)",
                      backgroundColor: bg,
                    }}
                  />
                  <span style={{ fontSize: 12 }}>
                    {asset.risk_level === "Red"
                      ? "Immediate action required"
                      : asset.risk_level === "Yellow"
                      ? "Inspection recommended soon"
                      : "Running smoothly"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- PAGE 3: ASSET HEALTH SUMMARY (BAR CHART, LIVE) ----
  function HealthSummaryView() {
    if (assets.length === 0) {
      return (
        <div>
          <h2>Overall Fleet Health Status</h2>
          <p>No assets yet. Run some predictions first.</p>
        </div>
      );
    }

    const counts = assets.reduce(
      (acc, asset) => {
        acc[asset.risk_level] = (acc[asset.risk_level] || 0) + 1;
        return acc;
      },
      { Green: 0, Yellow: 0, Red: 0 }
    );

    const data = [
      { name: "Healthy", risk: "Green", count: counts.Green },
      { name: "Monitoring Required", risk: "Yellow", count: counts.Yellow },
      { name: "Critical", risk: "Red", count: counts.Red },
    ];

    return (
      <div>
        <h2>Overall Fleet Health Status</h2>
        <p>
          High-level overview of machines by risk category (Green / Yellow /
          Red).
        </p>
        <div style={{ width: "100%", height: 320, marginTop: "1rem" }}>
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#444" />
              <XAxis dataKey="name" stroke="#ccc" />
              <YAxis stroke="#ccc" allowDecimals={false} />
              <Tooltip
                formatter={(value) => [`${value} machines`, "Count"]}
                contentStyle={{
                  backgroundColor: "#222",
                  border: "1px solid #555",
                }}
              />
              <Legend />
              <Bar
                dataKey="count"
                name="Machines"
                radius={[4, 4, 0, 0]}
                label={{ position: "top", fill: "#fff" }}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`bar-${index}`}
                    fill={COLORS[entry.risk] || "#9e9e9e"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // ---- PAGE 4: DETAILED TABLE (LIVE) ----
  function DetailedTableView() {
    if (assets.length === 0) {
      return (
        <div>
          <h2>Asset Details & Risk Table</h2>
          <p>No assets yet. Run a prediction to populate this table.</p>
        </div>
      );
    }

    const sortedAssets = [...assets].sort(
      (a, b) => RISK_ORDER[b.risk_level] - RISK_ORDER[a.risk_level]
    );

    const riskIcon = (risk) => {
      const color = COLORS[risk] || "#9e9e9e";
      const shape =
        risk === "Red" ? "■" : risk === "Yellow" ? "▲" : "●"; // square / triangle / circle
      return (
        <span style={{ color, fontSize: 16, marginRight: 4 }}>{shape}</span>
      );
    };

    return (
      <div>
        <h2>Asset Details & Risk Table</h2>
        <p>
          Highest-risk machines appear at the top. Use this for planning and
          investigation.
        </p>
        <div style={{ overflowX: "auto", marginTop: "1rem" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 700,
            }}
          >
            <thead>
              <tr>
                {[
                  "UID",
                  "Type",
                  "Air Temp (K)",
                  "Torque (Nm)",
                  "Tool Wear (min)",
                  "Failure Probability",
                  "Risk Status",
                ].map((col) => (
                  <th
                    key={col}
                    style={{
                      textAlign: "left",
                      padding: "0.5rem",
                      borderBottom: "1px solid #444",
                      backgroundColor: "#111",
                      color: "#eee",
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedAssets.map((asset) => (
                <tr
                  key={asset.id}
                  style={{
                    backgroundColor:
                      asset.risk_level === "Red"
                        ? "rgba(244, 67, 54, 0.1)"
                        : asset.risk_level === "Yellow"
                        ? "rgba(255, 193, 7, 0.1)"
                        : "rgba(76, 175, 80, 0.08)",
                  }}
                >
                  <td
                    style={{ padding: "0.5rem", borderBottom: "1px solid #333" }}
                  >
                    {asset.id}
                  </td>
                  <td
                    style={{ padding: "0.5rem", borderBottom: "1px solid #333" }}
                  >
                    {asset.type}
                  </td>
                  <td
                    style={{ padding: "0.5rem", borderBottom: "1px solid #333" }}
                  >
                    {asset.air_temperature_k.toFixed(1)}
                  </td>
                  <td
                    style={{ padding: "0.5rem", borderBottom: "1px solid #333" }}
                  >
                    {asset.torque_nm.toFixed(1)}
                  </td>
                  <td
                    style={{ padding: "0.5rem", borderBottom: "1px solid #333" }}
                  >
                    {asset.tool_wear_min.toFixed(1)}
                  </td>
                  <td
                    style={{ padding: "0.5rem", borderBottom: "1px solid #333" }}
                  >
                    {(asset.failure_probability * 100).toFixed(2)}%
                  </td>
                  <td
                    style={{ padding: "0.5rem", borderBottom: "1px solid #333" }}
                  >
                    {riskIcon(asset.risk_level)}
                    {asset.risk_level}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---- MAIN RENDER ----
  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
        backgroundColor: "#000",
        color: "#eee",
        minHeight: "100vh",
      }}
    >
      

      {/* Simple tab navigation */}
      <div
        style={{
          marginTop: "1rem",
          marginBottom: "1rem",
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        {[
          { id: "single", label: "Single Asset Predictor" },
          { id: "kpi", label: "KPI Cards (Per Asset)" },
          { id: "summary", label: "Asset Health Summary" },
          { id: "table", label: "Detailed Table" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActivePage(tab.id)}
            style={{
              padding: "0.4rem 0.8rem",
              borderRadius: 999,
              border: "1px solid #444",
              backgroundColor:
                activePage === tab.id ? "#1976d2" : "transparent",
              color: activePage === tab.id ? "#fff" : "#ccc",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activePage === "single" && (
        <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
          {/* Left: form */}
          <form
            onSubmit={handleSubmit}
            style={{
              flex: "1 1 320px",
              maxWidth: 400,
              padding: "1rem",
              border: "1px solid #333",
              borderRadius: 8,
              backgroundColor: "#111",
            }}
          >
            <h2>Input Sensors</h2>

            {/* CSV upload */}
            <div style={{ marginBottom: "0.75rem" }}>
              <label
                htmlFor="csv"
                style={{ display: "block", marginBottom: 4 }}
              >
                Load from CSV
              </label>
              <input
                id="csv"
                name="csv"
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                style={{
                  width: "100%",
                  padding: "0.3rem",
                  borderRadius: 4,
                  border: "1px solid #555",
                  backgroundColor: "#222",
                  color: "#eee",
                }}
              />
              {csvError && (
                <div style={{ color: "orange", marginTop: 4, fontSize: 12 }}>
                  {csvError}
                </div>
              )}
            </div>

            {/* Machine ID */}
            <div style={{ marginBottom: "0.75rem" }}>
              <label
                htmlFor="uid"
                style={{ display: "block", marginBottom: 4 }}
              >
                Machine ID / UID
              </label>
              <input
                id="uid"
                name="uid"
                type="text"
                value={form.uid}
                onChange={handleChange}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: 4,
                  border: "1px solid #555",
                  backgroundColor: "#222",
                  color: "#eee",
                }}
              />
            </div>

            {[
              { name: "air_temperature_k", label: "Air Temperature (K)" },
              { name: "process_temperature_k", label: "Process Temperature (K)" },
              { name: "rotational_speed_rpm", label: "Rotational Speed (RPM)" },
              { name: "torque_nm", label: "Torque (Nm)" },
              { name: "tool_wear_min", label: "Tool Wear (min)" },
            ].map((field) => (
              <div key={field.name} style={{ marginBottom: "0.75rem" }}>
                <label
                  htmlFor={field.name}
                  style={{ display: "block", marginBottom: 4 }}
                >
                  {field.label}
                </label>
                <input
                  id={field.name}
                  name={field.name}
                  type="number"
                  step="0.01"
                  value={form[field.name]}
                  onChange={handleChange}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: 4,
                    border: "1px solid #555",
                    backgroundColor: "#222",
                    color: "#eee",
                  }}
                />
              </div>
            ))}

            {/* Machine Type */}
            <div style={{ marginBottom: "0.75rem" }}>
              <label
                htmlFor="type"
                style={{ display: "block", marginBottom: 4 }}
              >
                Machine Type
              </label>
              <select
                id="type"
                name="type"
                value={form.type}
                onChange={handleChange}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: 4,
                  border: "1px solid #555",
                  backgroundColor: "#222",
                  color: "#eee",
                }}
              >
                <option value="H">Type H</option>
                <option value="L">Type L</option>
                <option value="M">Type M</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: "0.5rem",
                padding: "0.5rem 1rem",
                borderRadius: 4,
                border: "none",
                backgroundColor: "#1976d2",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              {loading ? "Predicting..." : "Predict"}
            </button>

            {error && (
              <p style={{ color: "red", marginTop: "0.5rem" }}>{error}</p>
            )}
          </form>

          {/* Right: prediction */}
          <div
            style={{
              flex: "1 1 320px",
              minWidth: 320,
              padding: "1rem",
              border: "1px solid #333",
              borderRadius: 8,
              backgroundColor: "#111",
            }}
          >
            <h2>Prediction</h2>
            {!result && (
              <p>No prediction yet. Submit the form to see results.</p>
            )}
            {result && (
              <>
                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    alignItems: "center",
                    marginBottom: "1rem",
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      backgroundColor: riskColor,
                    }}
                  />
                  <div>
                    <div>
                      <strong>Risk Level:</strong> {result.risk_level}
                    </div>
                    <div>
                      <strong>Failure Probability:</strong>{" "}
                      {(result.failure_probability * 100).toFixed(2)}%
                    </div>
                  </div>
                </div>

                <PieChart width={320} height={240}>
                  <Pie
                    dataKey="value"
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={index === 0 ? "#f44336" : "#4caf50"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => `${(value * 100).toFixed(2)}%`}
                  />
                  <Legend />
                </PieChart>
              </>
            )}
          </div>
        </div>
      )}

      {activePage === "kpi" && <KpiCardsView />}
      {activePage === "summary" && <HealthSummaryView />}
      {activePage === "table" && <DetailedTableView />}
    </div>
  );
}

export default App;
