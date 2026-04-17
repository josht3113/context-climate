import { Link } from 'react-router-dom'
import styles from './Home.module.css'

// ── Card data ─────────────────────────────────────────────────────────────────
// To add a card: drop a new object into CARDS.
// status: 'soon' → dashed border, no link, "In Development" footer label.

const CARDS = [
  {
    tags:       ['Earth Science', 'Geology', 'Interactive'],
    title:      'Igneous Crystallization Simulator',
    description:'Explore how cooling rate and magma composition control crystal size and rock texture in igneous systems.',
    footerTags: ['Magma', 'Crystal Growth', 'Rock Texture', 'Geology'],
    to:         '/igneous',
    accentVar:  '--accent-earth',
    thumb:      '/IgneousCrystallization_thumbnail.png',
    status:     'live',
  },
  {
    tags:       ['COMING SOON'],
    title:      'More Earth & Space Tools',
    description:'Additional Earth and Space Science visualizations and simulations currently in development.',
    footerTags: [],
    to:         null,
    accentVar:  '--accent-earth',
    thumb:      null,
    status:     'soon',
  },
  {
    tags:       ['COMING SOON'],
    title:      'More Earth & Space Tools',
    description:'Additional Earth and Space Science visualizations and simulations currently in development.',
    footerTags: [],
    to:         null,
    accentVar:  '--accent-earth',
    thumb:      null,
    status:     'soon',
  },
]

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EarthAndSpace() {
  return (
    <div className="page-container">

      {/* Hero */}
      <section className="page-hero">
        <p className="page-eyebrow">Earth &amp; Space Science</p>
        <h1 className="page-title">Animations &amp; Tools for Understanding Earth &amp; Space Science</h1>
        <p className="page-subtitle">
          Interactive simulations and visualizations exploring concepts in geology, astronomy, and Earth systems —
          aligned with New York State Earth &amp; Space Sciences curriculum.
        </p>
      </section>

      {/* Cards */}
      <section>
        <div className={styles.grid}>
          {CARDS.map((card) => (
            <ToolCard key={card.title} {...card} />
          ))}
        </div>
      </section>

    </div>
  )
}

// ── ToolCard ──────────────────────────────────────────────────────────────────
function ToolCard({ tags, title, description, footerTags, to, accentVar, thumb, status }) {
  const isSoon = status === 'soon'

  const inner = (
    <article className={`${styles.card} ${isSoon ? styles.cardSoon : ''}`}>

      {/* Accent stripe */}
      <div
        className={styles.cardAccent}
        style={{ background: isSoon ? 'var(--color-border)' : `var(${accentVar})` }}
      />

      {/* Tags */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
        {tags.map((t) => (
          <span
            key={t}
            className={styles.cardTag}
            style={{
              color:      isSoon ? 'var(--color-text-muted)' : `var(${accentVar})`,
              background: isSoon ? 'transparent' : `color-mix(in srgb, var(${accentVar}) 12%, transparent)`,
              border:     `0.5px solid ${isSoon ? 'var(--color-border)' : `color-mix(in srgb, var(${accentVar}) 30%, transparent)`}`,
            }}
          >
            {t}
          </span>
        ))}
      </div>

      {/* Body */}
      <h2 className={styles.cardTitle}>{title}</h2>
      <p className={styles.cardDesc}>{description}</p>

      {/* Thumbnail */}
      {thumb && (
        <div style={{
          position: 'relative', marginTop: '16px',
          borderRadius: 'var(--radius-sm)', overflow: 'hidden', height: '90px',
        }}>
          <img
            src={thumb}
            alt={`${title} preview`}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              objectPosition: 'center 30%', display: 'block', opacity: 0.75,
            }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, transparent 40%, var(--color-surface) 100%)',
          }} />
        </div>
      )}

      {/* Footer */}
      <div className={styles.cardFooter}>
        {isSoon
          ? <span className={styles.soonLabel}>In Development</span>
          : <span className={styles.cardStat}>{footerTags.join(' · ')}</span>
        }
        {!isSoon && <span className={styles.cardArrow}>→</span>}
      </div>

    </article>
  )

  if (isSoon) return inner
  return <Link to={to} style={{ textDecoration: 'none' }}>{inner}</Link>
}
