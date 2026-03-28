import { useNavigate } from 'react-router-dom'
import styles from './Home.module.css'

// ── Section cards ──────────────────────────────────────
// Edit label, description, stat, and to fields freely.
// accent matches the CSS variable name (without --accent-).
// Set comingSoon: true to render the card as a stub.
const CARDS = [
  {
    accent:      'hourly',
    tag:         'Hourly · Multi-year',
    title:       'ISP Hourly Heatmaps',
    description: 'Hour-by-hour temperature, dewpoint, wind, cloud cover, and anomaly fields across decades of Islip data.',
    stat:        'Temp · Dewpoint · Wind · Clouds · Anomaly',
    to:          '/hourly',
  },
  {
    accent:      'climate',
    tag:         'Monthly · Totals',
    title:       'Precipitation Charts',
    description: 'Monthly rainfall and snowfall totals for ISP, color-coded by intensity with historical percentile context.',
    stat:        'Rain · Snow · Percentiles',
    to:          '/climate',
  },
  {
    accent:      'climate',
    tag:         'Daily · Climatology',
    title:       'Climo Charts · LI / NYC',
    description: 'Daily average temperatures with record highs and lows. Seasonal variability and extreme range by calendar day.',
    stat:        'Avg · Record High · Record Low',
    to:          '/climate',
  },
  {
    accent:      'enso',
    tag:         'Seasonal · ENSO',
    title:       'ENSO & Winter Analysis',
    description: 'Snowfall totals and winter temperatures stratified by El Niño, La Niña, and neutral ENSO phases.',
    stat:        'Snowfall · Temp · Phase Composites',
    to:          '/enso',
  },
  {
    accent:      'seasons',
    tag:         'Annual · Trends',
    title:       'Seasons Analysis',
    description: 'Meteorological season lengths at ISP tracked year by year. Expanding summers, shrinking shoulder seasons.',
    stat:        '1990 – 2025 · Decadal Trends',
    to:          '/seasons',
  },
  {
    accent:      'live',
    tag:         'Auto-updating',
    title:       'Live Conditions',
    description: 'Real-time ISP observations with rolling 24-hour charts. Updated automatically from NWS / Open-Meteo.',
    stat:        'KISP · Updates every hour',
    to:          '/live',
    comingSoon:  true,
  },
]

// ── Hero meta items ────────────────────────────────────
// Edit label/value pairs to update the hero stats row.
const META = [
  { label: 'Primary Station', value: 'KISP · Islip, NY' },
  { label: 'Data Span',       value: '1973 — 2025'      },
  { label: 'Last Updated',    value: 'Mar 2026'          },
]

export default function Home() {
  const navigate = useNavigate()

  return (
    <div className={styles.page}>
      <div className="page-container">

        {/* ── Hero ── */}
        <section className={styles.hero}>
          <p className="page-eyebrow">Weather &amp; Climate Data Visualization</p>
          {/* Change these two lines to update the hero headline */}
          <h1 className={styles.heroTitle}>
            Long Island &amp;<br />New York Metro
          </h1>
          {/* Change this to update the hero description */}
          <p className={styles.heroSub}>
            Interactive charts, heatmaps, and climate analysis anchored to
            Islip (ISP) — with comparisons across the metro region.
          </p>
          <div className={styles.heroMeta}>
            {META.map(({ label, value }) => (
              <div key={label} className={styles.metaItem}>
                <span className={styles.metaLabel}>{label}</span>
                <span className={styles.metaValue}>{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Card grid ── */}
        <section>
          <p className={styles.sectionLabel}>Interactive Tools</p>
          <div className={styles.grid}>
            {CARDS.map((card) => (
              <div
                key={card.title}
                className={`${styles.card} ${card.comingSoon ? styles.cardSoon : ''}`}
                onClick={() => !card.comingSoon && navigate(card.to)}
                style={{ cursor: card.comingSoon ? 'default' : 'pointer' }}
              >
                <div
                  className={styles.cardAccent}
                  style={{ background: `var(--accent-${card.accent})` }}
                />
                <span
                  className={styles.cardTag}
                  style={{
                    color:      `var(--accent-${card.accent})`,
                    background: `color-mix(in srgb, var(--accent-${card.accent}) 12%, transparent)`,
                    border:     `0.5px solid color-mix(in srgb, var(--accent-${card.accent}) 30%, transparent)`,
                  }}
                >
                  {card.tag}
                </span>
                <h2 className={styles.cardTitle}>{card.title}</h2>
                <p className={styles.cardDesc}>{card.description}</p>
                <div className={styles.cardFooter}>
                  <span className={styles.cardStat}>
                    {card.comingSoon
                      ? <span className={styles.soonLabel}>Coming soon</span>
                      : card.stat
                    }
                  </span>
                  <span className={styles.cardArrow}
                    style={{ opacity: card.comingSoon ? 0.25 : 1 }}>
                    →
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
