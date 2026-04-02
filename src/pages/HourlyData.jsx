// ── Hourly Data page ──────────────────────────────────
// This is where the ISP hourly heatmap app will live.
// Replace the stub below with the embedded heatmap component
// or an iframe pointing to the existing GitHub Pages app.

export default function HourlyData() {
  return (
    <div className="page-container">
      <div className="page-hero">
        <p className="page-eyebrow">Hourly · Multi-year</p>
        <h1 className="page-title">ISP Hourly Heatmaps</h1>
        <p className="page-subtitle">
          Month-by-month temperature, dewpoint, wind, cloud cover, and anomaly
          fields across decades of Islip (KISP) data.
        </p>
        <div className="stub-notice">
          <span className="stub-dot" />
          Heatmap component coming soon
        </div>
      </div>
    </div>
  )
}
