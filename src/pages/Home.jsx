import { Link } from 'react-router-dom'
import styles from './Home.module.css'

// ── Section & card data ───────────────────────────────────────────────────────
// To add a card: drop a new object into the cards array of the right section.
// To add a section: add a new object to SECTIONS.

const SECTIONS = [
  {
    id:    'heatmaps',
    label: 'Climatology Heatmaps',
    cards: [
      {
        tags:       ['ISP', '1973–2026'],
        title:      'Monthly Heatmaps',
        description:'Hour-by-hour temperature, dewpoint, wind, cloud cover, and anomaly fields across decades of Islip data.',
        footerTags: ['Temp', 'Dewpoint', 'Wind', 'Clouds', 'Anomalies'],
        to:         '/monthly',
        accentVar:  '--accent-hourly',
        thumb:      '/MonthlyThumbnail.png',
      },
      {
        tags:       ['ISP', '1973–2026'],
        title:      'Annual Heatmaps',
        description:'Year-by-year temperature and precipitation heatmaps revealing long-term trends and anomalies at ISP.',
        footerTags: ['Temp', 'Dewpoint', 'Wind', 'Clouds'],
        to:         '/annual',
        accentVar:  '--accent-hourly',
        thumb:      '/annualthumbnail.png',
      },
      {
        tags:       ['US Cities', 'WIND', 'HOUR OF DAY'],
        title:      'Wind by Hour Heatmap',
        description:'Heatmap of wind speed by hour of day across the full climatological record for various US cities.',
        footerTags: ['Wind Speed', 'Seasonal Pattern', 'Diurnal Pattern'],
        to:         '/wind-hour-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/WindHourHeatmap_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'HUMIDITY', 'Dewpoint'],
        title:      'Dewpoint Threshold Heatmap',
        description:'Monthly frequency of days meeting or exceeding key dewpoint thresholds at various US cities.',
        footerTags: ['Dewpoint', 'Climatology'],
        to:         '/dewpoint-threshold-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/DewptThresholdHeatmap_thumbnail.png',
      },
      {
        tags:       ['Temperature Threshold Frequencies', 'Various US Cities'],
        title:      'Temperature Threshold Heatmap',
        description:'Probability of hourly temperatures meeting or exceeding key hot and cold thresholds at various US cities.
        footerTags: ['Temperature', 'Climatology'],
        to:         '/temp-threshold-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/TempThresholdHeatmap_thumbnail.png',
      },
      {
        tags:       ['Fog', 'Various US Cities'],
        title:      'Fog Climatology Heatmap',
        description:'Monthly and seasonal frequency of fog events at various US cities.',
        footerTags: ['Fog Days', 'Climatology'],
        to:         '/fog-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/FogHeatmap_thumbnail.png',
      },
      {
        tags:       ['Thunderstorm Days', 'Various US Cities'],
        title:      'Thunderstorm Heatmap',
        description:'Monthly frequency of thunderstorm days at various US Cities.',
        footerTags: ['Thunderstorms', 'Climatology'],
        to:         '/thunderstorm-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/ThunderstormHeatmap_thumbnail.png',
      },
      {
        tags:       ['ISP', 'WINTER', 'Various US Cities'],
        title:      'Winter Precipitation Heatmap',
        description:'Heatmap of winter precipitation types and totals at various US cities.',
        footerTags: ['Snow', 'Sleet', 'Freezing Rain', 'Climatology'],
        to:         '/winter-precip-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/WinterPrecipHeatmap_thumbnail.png',
      },
    ],
  },
  {
    id:    'connections',
    label: 'Climatology Charts',
    cards: [
      {
        tags:       ['ENSO PHASE COMPARISONS', 'SELECT US CITIES'],
        title:      'ENSO Winter Analysis',
        description:'Snowfall and winter temperatures across various US cities, stratified by El Niño, La Niña, and neutral ENSO phases.',
        footerTags: ['ENSO', 'Snowfall', 'Temp'],
        to:         '/enso',
        accentVar:  '--accent-climate',
        thumb:      '/ENSOThumbnail.png',
      },
      {
        tags:       ['ENSO PHASE COMPARISONS', 'TROPICAL CYCLONES'],
        title:      'Tropical Cyclones ENSO Phase Comparison',
        description:'Atlantic and Eastern Pacific hurricane activity by ENSO phase — named storms, hurricane days, and ACE from 1851 onward.',
        footerTags: ['Atlantic', 'East Pacific', 'ACE', 'ENSO'],
        to:         '/hurricanes',
        accentVar:  '--accent-climate',
        thumb:      '/ENSOhurricanesThumbnail.png',
      },
      {
        tags:       ['ISP', 'FREQUENCY DISTRIBUTION'],
        title:      'Dewpoint Frequency',
        description:'Distribution of dewpoint temperatures at Islip across months and seasons — how often each dewpoint range occurs throughout the year.',
        footerTags: ['Dewpoint', 'Frequency', 'ISP Climatology'],
        to:         '/dewpoint-frequency',
        accentVar:  '--accent-climate',
        thumb:      '/DewpointFrequency_thumbnail.png',
      },
      {
        tags:       ['ISP', 'FREQUENCY DISTRIBUTION'],
        title:      'Temperature Frequency',
        description:'Distribution of observed temperatures at Islip across months and seasons — how often each temperature range occurs throughout the year.',
        footerTags: ['Temperature', 'Frequency', 'ISP Climatology'],
        to:         '/temp-frequency',
        accentVar:  '--accent-climate',
        thumb:      '/TempFrequency_thumbnail.png',
      },
      {
        tags:       ['NE US CITIES', 'SNOWFALL'],
        title:      'Snowfall Season Window',
        description:'First and last snowfall dates and season length for Northeast cities — visualizing how the window of winter precipitation shifts year to year.',
        footerTags: ['First Snow', 'Last Snow', 'Season Length', 'Trends'],
        to:         '/snowfall-season-window',
        accentVar:  '--accent-climate',
        thumb:      '/snowfall_season_window_thumbnail.png',
      },
      {
        tags:       ['NE US CITIES', 'SNOWFALL'],
        title:      'Snow Frequency',
        description:'Monthly snow day frequency for Northeast cities — how often measurable snowfall occurs by month and how that pattern has evolved over time.',
        footerTags: ['Snow Days', 'Monthly Frequency', 'Trends'],
        to:         '/snow-frequency',
        accentVar:  '--accent-climate',
        thumb:      '/snowfall_frequency_thumbnail.png',
      },
      {
        tags:       ['US CITIES', 'PRECIPITATION', 'ANNUAL'],
        title:      'U.S. Annual Precipitation',
        description:'Year-by-year total precipitation for select U.S. cities — visualizing wet and dry years against long-term averages and percentile ranges.',
        footerTags: ['Annual Totals', 'Percentiles', 'Multi-City'],
        to:         '/us-precip-years',
        accentVar:  '--accent-climate',
        thumb:      '/US_annual_precipitation_thumbnail.png',
      },
      {
        tags:       ['US CITIES', 'SNOWFALL', 'SEASONAL'],
        title:      'U.S. Seasonal Snowfall',
        description:'Season-by-season snowfall totals for select U.S. cities — comparing individual winters against climatological averages and long-term trends.',
        footerTags: ['Seasonal Totals', 'Multi-City', 'Trends'],
        to:         '/us-snow-seasons',
        accentVar:  '--accent-climate',
        thumb:      '/US_seasonal_snowfall_thumbnail.png',
      },
      {
        tags:       ['SEASONS', 'NE US CITIES', 'UPDATES DAILY'],
        title:      'Meteorological Seasons',
        description:'Meteorological season lengths tracked year by year for various cities.',
        footerTags: ['Seasons', 'Trends', 'Calendars'],
        to:         '/seasons',
        accentVar:  '--accent-climate',
        thumb:      '/Seasons_thumbnail.png',
      },
    ],
  },
  {
    id:    'solar',
    label: 'Solar',
    cards: [
      {
        tags:       ['Solar', 'Astronomy', 'Interactive'],
        title:      'Solar Heatmap Explorer',
        description:'Visualize solar altitude, azimuth, and day length across any latitude and time of year.',
        footerTags: ['All NH Latitudes', 'Solar Altitude', 'Solar Azimuth'],
        to:         '/solar',
        accentVar:  '--accent-enso',
        thumb:      'SolarHeatMap_thumbnail.png',
      },
      {
        tags:       ['Solar Angle Calendar', 'US & Global Cities', 'Interactive'],
        title:      'Solar Calendar',
        description:'Day-by-day solar angle and duration data across the full year by location.',
        footerTags: ['Solar Angle', 'Day Length', 'Insolation Index'],
        to:         '/solar-calendar',
        accentVar:  '--accent-enso',
        thumb:      '/SolarCalendar_thumbnail.png',
      },
    ],
  },
  {
    id:    'local',
    label: 'Long Island  |  NY Metro  |  Northeast US',
    cards: [
      {
        tags:       ['ISP Current', 'Updates Hourly'],
        title:      'Islip Weather Conditions',
        description:'current weather | month-to-date graph | recent observations table | model output forecast',
        footerTags: ['ISP Current Conditions', 'Recent Weather'],
        to:         '/isp-live',
        accentVar:  '--accent-hourly',
        thumb:      '/ISPlive_thumbnail.png',
      },
      {
        tags:       ['Precip', 'Snow', 'NE US Cities'],
        title:      'Precip & Snowfall Climo',
        description:'Daily average temperatures with record highs and lows. Seasonal variability and extreme range by calendar day.',
        footerTags: ['Precip Records', 'Snowfall Records', 'Snow Cover'],
        to:         '/precipsnow',
        accentVar:  '--accent-live',
        thumb:      '/PrecipSnow_thumbnail.png',
      },
      {
        tags:       ['Normals', 'Records', 'Updates Daily'],
        title:      'NORTHEAST CLIMATE DASHBOARD',
        description:'Daily, monthly and yearly climate data and trends for select cities in the Northeast US.',
        footerTags: ['11 Stations', 'Temp', 'Precip', 'Snow'],
        to:         '/northeast-climate',
        accentVar:  '--accent-seasons',
        thumb:      '/NEclimatedashboard_thumbnail.png',
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
        <h1 className="page-title">Interactive Weather &amp; Climate Tools</h1>
        <p className="page-subtitle">
          Created and maintained by Josh Timlin  
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
