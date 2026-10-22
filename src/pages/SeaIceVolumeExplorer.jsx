import { Link } from 'react-router-dom'

export default function SeaIceVolumeExplorer() {
  return (
    <div className="page-container">

      {/* Hero */}
      <section className="page-hero">
        <p className="page-eyebrow">Climate Data Visualization</p>
        <h1 className="page-title">Sea Ice Volume Explorer</h1>
        <p className="page-subtitle">
          Daily Arctic sea ice volume and thickness since 1979 — compare years against decade averages, and trace each year’s path through extent and volume together.
        </p>
      </section>

      {/* Tool */}
      <div style={{
        borderRadius:  'var(--radius-md)',
        overflow:      'hidden',
        border:        '0.5px solid var(--color-border)',
      }}>
        <iframe
          src={import.meta.env.BASE_URL + 'seaice-volume-explorer.html'}
          title="Sea Ice Volume Explorer"
          style={{ width: '100%', height: '1500px', border: 'none', display: 'block' }}
          loading="lazy"
        />
      </div>

      <p style={{
        fontSize: '0.75rem',
        color:    'var(--color-text-muted)',
        margin:   '1rem 0 0',
      }}>
        Source: PIOMAS v2.1, University of Washington Polar Science Center · NSIDC Sea Ice Index ·{' '}
        <Link to="/" style={{ color: 'inherit' }}>back to all tools</Link>
      </p>

    </div>
  )
}
