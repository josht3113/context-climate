import { Link } from 'react-router-dom'

export default function TornadoHistoryNearYou() {
  return (
    <div className="page-container">

      {/* Hero */}
      <section className="page-hero">
        <p className="page-eyebrow">Severe Weather Data Visualization</p>
        <h1 className="page-title">Tornado History Near You</h1>
        <p className="page-subtitle">
          Search any U.S. city or airport station to see every tornado on record within
          a chosen radius — frequency by month, strength breakdown, and a full log of nearby tracks.
        </p>
      </section>

      {/* Tool */}
      <div style={{
        borderRadius:  'var(--radius-md)',
        overflow:      'hidden',
        border:        '0.5px solid var(--color-border)',
      }}>
        <iframe
          src={import.meta.env.BASE_URL + 'tornado-history-near-you.html'}
          title="Tornado History Near You"
          style={{ width: '100%', height: '1750px', border: 'none', display: 'block' }}
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
