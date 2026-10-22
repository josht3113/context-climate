import { Link } from 'react-router-dom'

export default function SeaIceVolumeHeatmap() {
  return (
    <div className="page-container">

      {/* Hero */}
      <section className="page-hero">
        <p className="page-eyebrow">Climate Data Visualization</p>
        <h1 className="page-title">Sea Ice Volume Heatmap</h1>
        <p className="page-subtitle">
          Every month of Arctic sea ice volume, thickness and daily growth or melt since 1979, with per-month trends over the full record or from 2010.
        </p>
      </section>

      {/* Tool */}
      <div style={{
        borderRadius:  'var(--radius-md)',
        overflow:      'hidden',
        border:        '0.5px solid var(--color-border)',
      }}>
        <iframe
          src={import.meta.env.BASE_URL + 'seaice-volume-heatmap.html'}
          title="Sea Ice Volume Heatmap"
          style={{ width: '100%', height: '1450px', border: 'none', display: 'block' }}
          loading="lazy"
        />
      </div>

      <p style={{
        fontSize: '0.75rem',
        color:    'var(--color-text-muted)',
        margin:   '1rem 0 0',
      }}>
        Source: PIOMAS v2.1, University of Washington Polar Science Center ·{' '}
        <Link to="/" style={{ color: 'inherit' }}>back to all tools</Link>
      </p>

    </div>
  )
}
