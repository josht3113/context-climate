// ── Live page ─────────────────────────────────────────
// Will contain: Real-time ISP observations via NWS / Open-Meteo API

export default function Live() {
  return (
    <div className="page-container">
      <div className="page-hero">
        <p className="page-eyebrow">Auto-updating</p>
        <h1 className="page-title">Live Conditions</h1>
        <p className="page-subtitle">
          Real-time observations from Islip (KISP) with rolling 24-hour
          charts. Updated automatically from NWS and Open-Meteo.
        </p>
        <div className="stub-notice">
          <span className="stub-dot" style={{ background: 'var(--accent-live)' }} />
          Live data feed coming soon
        </div>
      </div>
    </div>
  )
}
