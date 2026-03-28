// ── Seasons page ──────────────────────────────────────
// Will contain: Meteorological season length analysis at ISP

export default function Seasons() {
  return (
    <div className="page-container">
      <div className="page-hero">
        <p className="page-eyebrow">Annual · Trends</p>
        <h1 className="page-title">Seasons Analysis</h1>
        <p className="page-subtitle">
          Meteorological season lengths at Islip tracked year by year from
          1990 to present. Expanding summers, shrinking shoulder seasons.
        </p>
        <div className="stub-notice">
          <span className="stub-dot" />
          Charts coming soon
        </div>
      </div>
    </div>
  )
}
