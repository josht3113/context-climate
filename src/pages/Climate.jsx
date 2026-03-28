// ── Climate page ──────────────────────────────────────
// Will contain: Precipitation Charts + Climo Charts (LI/NYC)

export default function Climate() {
  return (
    <div className="page-container">
      <div className="page-hero">
        <p className="page-eyebrow">Daily · Monthly · Climatology</p>
        <h1 className="page-title">Climate Charts</h1>
        <p className="page-subtitle">
          Daily average temperatures, record highs and lows, and monthly
          precipitation totals for Long Island and New York City.
        </p>
        <div className="stub-notice">
          <span className="stub-dot" />
          Charts coming soon
        </div>
      </div>
    </div>
  )
}
