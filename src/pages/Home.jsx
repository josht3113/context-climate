import { Link } from 'react-router-dom'

// ── Card data ─────────────────────────────────────────────────────────────────
// Edit titles, descriptions, tags, footerTags, and to (route) freely here.
// thumb: path relative to /public — leave as null if no thumbnail.

const CARDS = [
  {
    tags:        ['HOURLY', 'MULTI-YEAR'],
    title:       'ISP Hourly Heatmaps',
    description: 'Hour-by-hour temperature, dewpoint, wind, cloud cover, and anomaly fields across decades of Islip data.',
    footerTags:  ['Temp', 'Dewpoint', 'Wind', 'Clouds', 'Anomaly'],
    to:          '/hourly',
    accentVar:   '--accent-hourly',
    thumb:       null,
  },
  {
    tags:        ['ANNUAL', 'HEATMAPS'],
    title:       'Annual Heatmaps',
    description: 'Year-by-year temperature and precipitation heatmaps revealing long-term trends and anomalies at ISP.',
    footerTags:  ['Temp', 'Precipitation', 'Anomaly'],
    to:          '/climate',
    accentVar:   '--accent-live',
    thumb:       '/context-climate/annualthumbnail.png',
  },
  {
    tags:        ['MONTHLY', 'TOTALS'],
    title:       'Precipitation Charts',
    description: 'Monthly rainfall and snowfall totals for ISP, color-coded by intensity with historical percentile context.',
    footerTags:  ['Rain', 'Snow', 'Percentiles'],
    to:          '/climate',
    accentVar:   '--accent-climate',
    thumb:       '/context-climate/MonthlyThumbnail.png',
  },
  {
    tags:        ['SEASONAL', 'ENSO'],
    title:       'ENSO & Winter Analysis',
    description: 'Snowfall totals and winter temperatures stratified by El Niño, La Niña, and neutral ENSO phases.',
    footerTags:  ['Snowfall', 'Temp', 'Phase Composites'],
    to:          '/enso',
    accentVar:   '--accent-hourly',
    thumb:       null,
  },
  {
    tags:        ['ANNUAL', 'TRENDS'],
    title:       'Seasons Analysis',
    description: 'Meteorological season lengths at ISP tracked year by year. Expanding summers, shrinking shoulder seasons.',
    footerTags:  ['1990 – 2025', 'Decadal Trends'],
    to:          '/seasons',
    accentVar:   '--accent-seasons',
    thumb:       null,
  },
  {
    tags:        ['DAILY', 'CLIMATOLOGY'],
    title:       'Climo Charts · LI / NYC',
    description: 'Daily average temperatures with record highs and lows. Seasonal variability and extreme range by calendar day.',
    footerTags:  ['Avg', 'Record High', 'Record Low'],
    to:          '/climate',
    accentVar:   '--accent-enso',
    thumb:       null,
  },
]

// ── Component ─────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <div className="page-container">

      {/* Hero */}
      <section className="page-hero">
        <p className="page-eyebrow">Weather &amp; Climate Data Visualization</p>
        <h1 className="page-title">
          Long Island &amp;<br />New York Metro
        </h1>
        <p className="page-subtitle">
          Interactive charts, heatmaps, and climate analysis anchored to Islip (ISP) — with
          comparisons across the metro region.
        </p>
      </section>

      {/* Cards grid */}
      <section style={{ paddingBottom: '3rem' }}>
        <p className="page-eyebrow" style={{ marginBottom: '1.25rem' }}>Interactive Tools</p>
        <div style={grid}>
          {CARDS.map((card) => (
            <ToolCard key={card.title} {...card} />
          ))}
        </div>
      </section>

    </div>
  )
}

// ── ToolCard ──────────────────────────────────────────────────────────────────
function ToolCard({ tags, title, description, footerTags, to, accentVar, thumb }) {
  return (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <article
        className="tool-card"
        style={{ '--card-accent': `var(${accentVar})` }}
      >
        {/* Tag row */}
        <div style={tagRow}>
          {tags.map((t) => (
            <span key={t} style={tagBadge}>{t}</span>
          ))}
        </div>

        {/* Body */}
        <h2 style={cardTitle}>{title}</h2>
        <p style={cardDesc}>{description}</p>

        {/* Thumbnail */}
        {thumb && (
          <div style={thumbWrap}>
            <img src={thumb} alt={`${title} preview`} style={thumbImg} />
            <div style={thumbOverlay} />
          </div>
        )}

        {/* Footer */}
        <div style={cardFooter}>
          <span style={footerText}>{footerTags.join(' · ')}</span>
          <span style={arrow}>→</span>
        </div>
      </article>
    </Link>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '1rem',
}
const tagRow = {
  display: 'flex',
  gap: '6px',
  marginBottom: '14px',
}
const tagBadge = {
  fontFamily: 'var(--font-mono)',
  fontSize: '9px',
  fontWeight: 500,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--card-accent)',
  background: 'color-mix(in srgb, var(--card-accent) 12%, transparent)',
  border: '0.5px solid color-mix(in srgb, var(--card-accent) 30%, transparent)',
  padding: '3px 8px',
  borderRadius: 'var(--radius-sm)',
}
const cardTitle = {
  fontFamily: 'var(--font-display)',
  fontSize: '22px',
  fontWeight: 700,
  color: 'var(--color-text-primary)',
  marginBottom: '10px',
  lineHeight: 1.15,
}
const cardDesc = {
  fontSize: '13px',
  color: 'var(--color-text-secondary)',
  lineHeight: 1.6,
}
const thumbWrap = {
  position: 'relative',
  marginTop: '16px',
  borderRadius: 'var(--radius-sm)',
  overflow: 'hidden',
  height: '90px',
}
const thumbImg = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: 'center 30%',
  display: 'block',
  opacity: 0.75,
}
const thumbOverlay = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(to bottom, transparent 40%, var(--color-surface) 100%)',
}
const cardFooter = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: '16px',
  paddingTop: '14px',
  borderTop: '0.5px solid var(--color-border)',
}
const footerText = {
  fontFamily: 'var(--font-mono)',
  fontSize: '10px',
  color: 'var(--color-text-muted)',
  letterSpacing: '0.05em',
}
const arrow = {
  color: 'var(--color-text-muted)',
  fontSize: '14px',
}
