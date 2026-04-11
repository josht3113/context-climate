import { Link } from 'react-router-dom'
import styles from './Home.module.css'

// ── Section & card data ───────────────────────────────────────────────────────
// To add a card: drop a new object into the cards array of the right section.
// To add a section: add a new object to SECTIONS.
// status: 'soon' → dashed border, no link, "In Development" footer label.

const SECTIONS = [
  {
    id:    'local',
    label: 'Long Island & NY Metro',
    cards: [
      {
        tags:       ['HOURLY', 'MULTI-YEAR'],
        title:      'Monthly Heatmaps',
        description:'Hour-by-hour temperature, dewpoint, wind, cloud cover, and anomaly fields across decades of Islip data.',
        footerTags: ['Temp', 'Dewpoint', 'Wind', 'Clouds'],
        to:         '/monthly',
        accentVar:  '--accent-hourly',
        thumb:      '/MonthlyThumbnail.png',
      },
      {
        tags:       ['ANNUAL', 'HEATMAPS'],
        title:      'Annual Heatmaps',
        description:'Year-by-year temperature and precipitation heatmaps revealing long-term trends and anomalies at ISP.',
        footerTags: ['Temp', 'Precipitation', 'Anomaly'],
        to:         '/annual',
        accentVar:  '--accent-live',
        thumb:      '/annualthumbnail.png',
      },
      {
       tags:       ['Normals', 'Records', 'Updates Daily'],
  title:      'NORTHEAST CLIMATE DASHBOARD',
  description:'Daily, monthly and yearly climate data and trends for select cities in the Northeast US.',
  footerTags: ['11 Stations', 'Temp', 'Precip', 'Snow'],
  to:         '/northeast-climate',
        accentVar:  '--accent-climate',
        thumb:      '/NEclimatedashboard_thumbnail.png',
      },
      {
        tags:       ['ANNUAL', 'TRENDS'],
        title:      'Meteorological Seasons',
        description:'Meteorological season lengths tracked year by year for various cities.',
        footerTags: ['Full climo records', 'Decadal Trends'],
        to:         '/seasons',
        accentVar:  '--accent-seasons',
        thumb:      '/Seasons_thumbnail.png',
      },
      {
        tags:       ['Precip', 'Snow', 'NE US Cities],
        title:      'Precipitation & Snowfall Climo',
        description:'Daily average temperatures with record highs and lows. Seasonal variability and extreme range by calendar day.',
        footerTags: ['Avg', 'Record High', 'Record Low'],
        to:         '/precipsnow',
        accentVar:  '--accent-precip',
        thumb:      null,
      },
      {
        tags:       ['COMING SOON'],
        title:      'More Local Tools',
        description:'Additional Long Island and NY Metro climate visualizations currently in development.',
        footerTags: [],
        to:         null,
        accentVar:  '--accent-hourly',
        thumb:      null,
        status:     'soon',
      },
    ],
  },
  {
    id:    'connections',
    label: 'Climate Connections',
    cards: [
      {
        tags:       ['SEASONAL', 'ENSO'],
        title:      'ENSO & Winter Analysis',
        description:'Snowfall and winter temperatures across 19 U.S. cities, stratified by El Niño, La Niña, and neutral ENSO phases.',
        footerTags: ['19 Cities', 'Snowfall', 'Temp', 'Phase Composites'],
        to:         '/enso',
        accentVar:  '--accent-hourly',
        thumb:      '/ENSOThumbnail.png',
      },
      {
        tags:       ['TROPICAL', 'ENSO'],
        title:      'Tropical Cyclones ENSO Phase Comparison',
        description:'Atlantic and Eastern Pacific hurricane activity by ENSO phase — named storms, hurricane days, and ACE from 1851 onward.',
        footerTags: ['Atlantic', 'East Pacific', 'ACE', '1851–2025'],
        to:         '/hurricanes',
        accentVar:  '--accent-live',
        thumb:      '/ENSOhurricanesThumbnail.png',
      },
      {
        tags:       ['COMING SOON'],
        title:      'More Climate Connections',
        description:'Additional national and global climate pattern tools currently in development.',
        footerTags: [],
        to:         null,
        accentVar:  '--accent-climate',
        thumb:      null,
        status:     'soon',
      },
    ],
  },
  {
    id:    'solar',
    label: 'Solar Visualizations',
    cards: [
      {
        tags:       ['Solar', 'Astronomy', 'Interactive'],
        title:      'Solar Heatmap Explorer',
        description:'Visualize solar altitude, azimuth, and day length across any latitude and time of year.',
        footerTags: [],
        to:         '/solar',
        accentVar:  '--accent-hourly',
        thumb:      'SolarHeatMap_thumbnail.png',
        status:     'live',
      },
      {
        tags:       ['COMING SOON'],
        title:      'Daylight & UV Index Trends',
        description:'Sunrise, sunset, and usable daylight hours across the year alongside historical UV index patterns for Long Island.',
        footerTags: [],
        to:         null,
        accentVar:  '--accent-climate',
        thumb:      null,
        status:     'soon',
      },
      {
        tags:       ['COMING SOON'],
        title:      'More Solar Tools',
        description:'Additional solar and atmospheric radiation visualizations currently in development.',
        footerTags: [],
        to:         null,
        accentVar:  '--accent-climate',
        thumb:      null,
        status:     'soon',
      },
    ],
  },
]
// ── Component ─────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <div className="page-container">

      {/* Hero */}
      <section className="page-hero">
        <p className="page-eyebrow">Weather &amp; Climate Data Visualization</p>
        <h1 className="page-title">Data Visualizations &amp; Tools</h1>
        <p className="page-subtitle">
          Providing context for the weather you experience daily through interactive charts, heatmaps, and other tools.  
        </p>
      </section>

      {/* Sections */}
      {SECTIONS.map((section, i) => (
        <section
          key={section.id}
          style={{
            paddingBottom: '2.5rem',
            borderTop: i > 0 ? '0.5px solid var(--color-border)' : 'none',
          }}
        >
          <p className={styles.sectionLabel}>{section.label}</p>
          <div className={styles.grid}>
            {section.cards.map((card) => (
              <ToolCard key={card.title} {...card} />
            ))}
          </div>
        </section>
      ))}

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
