import { Link } from 'react-router-dom'

export default function TornadoTrackExplorer() {
  return (
    <div className="page-container">

      {/* Hero */}
      <section className="page-hero">
        <p className="page-eyebrow">Severe Weather Data Visualization</p>
        <h1 className="page-title">Tornado Track Explorer</h1>
        <p className="page-subtitle">
          Every confirmed tornado track in the NOAA/SPC severe weather database —
          filter by year, month, and EF rating, and click any track for its full record.
        </p>
      </section>

      {/* Tool */}
      <div style={{
        borderRadius:  'var(--radius-md)',
        overflow:      'hidden',
        border:        '0.5px solid var(--color-border)',
      }}>
        <iframe
          src={import.meta.env.BASE_URL + 'tornado-track-explorer.html'}
          title="Tornado Track Explorer"
          style={{ width: '100%', height: '1600px', border: 'none', display: 'block' }}
          loading="lazy"
        />
      </div>

      <p style={{
        fontSize: '0.75rem',
        color:    'var(--color-text-muted)',
        margin:   '1rem 0 0',
      }}>
        Source: NOAA/NWS Storm Prediction Center severe weather database, 1950–2022 ·{' '}
        <Link to="/" style={{ color: 'inherit' }}>back to all tools</Link>
      </p>

    </div>
  )
}
