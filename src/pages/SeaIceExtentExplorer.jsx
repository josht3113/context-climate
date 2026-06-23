import { Link } from 'react-router-dom'

export default function SeaIceExtentExplorer() {
  return (
    <div className="page-container">

      {/* Hero */}
      <section className="page-hero">
        <p className="page-eyebrow">Climate Data Visualization</p>
        <h1 className="page-title">Sea Ice Extent Explorer</h1>
        <p className="page-subtitle">
          Daily Arctic and Antarctic sea ice extent since 1979 — isolate any year,
          toggle decade averages, and compare any two years directly.
        </p>
      </section>

      {/* Tool */}
      <div style={{
        borderRadius:  'var(--radius-md)',
        overflow:      'hidden',
        border:        '0.5px solid var(--color-border)',
      }}>
        <iframe
          src={import.meta.env.BASE_URL + 'seaice-extent-explorer.html'}
          title="Sea Ice Extent Explorer"
          style={{ width: '100%', height: '1000px', border: 'none', display: 'block' }}
          loading="lazy"
        />
      </div>

      <p style={{
        fontSize: '0.75rem',
        color:    'var(--color-text-muted)',
        margin:   '1rem 0 0',
      }}>
        Source: NSIDC Sea Ice Index (G02135, v4.0) · updated daily ·{' '}
        <Link to="/" style={{ color: 'inherit' }}>back to all tools</Link>
      </p>

    </div>
  )
}
