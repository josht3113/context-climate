import { Link } from 'react-router-dom'
import styles from './Home.module.css'

// ── Section & card data ───────────────────────────────────────────────────────
// To add a card: drop a new object into the cards array of the right section.
// To add a section: add a new object to SECTIONS.

const SECTIONS = [
  {
    id:    'live-heatmaps',
    label: 'Live  ·  Updates Continuously',
    cards: [
      {
        tags:       ['US Cities', 'LIVE CONDITIONS', 'UPDATES HOURLY'],
        title:      'Current Conditions',
        description:'Live ASOS station observations with time-series charts, climate normals, daily records, and solar data. Temperature, wind, pressure, precipitation, and more — updated continuously.',
        footerTags: ['Live Obs', 'Climate Normals', 'Daily Records', 'Solar & Moon', 'Wind Charts'],
        to:         '/current-conditions',
        accentVar:  '--accent-live',
        thumb:      '/current-conditions_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'TEMPERATURE', 'UPDATES HOURLY'],
        title:      'Monthly Temperature Heatmap',
        description:'Hour-by-hour temperature, dewpoint, wind, clouds, and anomalies for any month at any US ASOS station. Streams live data for the current month.',
        footerTags: ['Temp', 'Dewpoint', 'Wind', 'Clouds', 'Anomalies', 'Live'],
        to:         '/temp-heatmap-monthly',
        accentVar:  '--accent-live',
        thumb:      '/OG_Monthly_Heatmap_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'TEMPERATURE', 'UPDATES HOURLY'],
        title:      'Annual Temperature Heatmap',
        description:'Full-year hourly temperature and weather patterns at a glance — 366 days × 24 hours in a single view. Grows in real time through the current year.',
        footerTags: ['Temp', 'Dewpoint', 'Wind', 'Clouds', 'Live'],
        to:         '/temp-heatmap-annual',
        accentVar:  '--accent-live',
        thumb:      '/OG_Annual_Heatmap_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'PRECIPITATION', 'UPDATES HOURLY'],
        title:      'Monthly Precipitation Heatmap',
        description:'Hourly liquid-equivalent precipitation for any month and station. Streams live data for the current month.',
        footerTags: ['Hourly Precip', 'Daily Totals', 'Live'],
        to:         '/precip-heatmap-monthly',
        accentVar:  '--accent-live',
        thumb:      '/precip_heatmap_monthly_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'PRECIPITATION', 'UPDATES HOURLY'],
        title:      'Annual Precipitation Heatmap',
        description:'Full-year hourly precipitation grid with daily totals and monthly accumulated totals per hour of day revealing seasonal wet and dry patterns. Live through the current year.',
        footerTags: ['Hourly Precip', 'Daily Totals', 'Annual Total', 'Live'],
        to:         '/precip-heatmap-annual',
        accentVar:  '--accent-live',
        thumb:      '/precip_heatmap_annual_thumbnail.png',
      },
      {
        tags:       ['US CITIES', 'SEASONS', 'UPDATES DAILY'],
        title:      'Meteorological Seasons',
        description:'Meteorological seasons explores the stochastic way in which the seasons unfold each year at various US locations. Updates daily.',
        footerTags: ['Seasons', 'Trends', 'Calendars'],
        to:         '/seasons',
        accentVar:  '--accent-live',
        thumb:      '/Seasons_thumbnail.png',
      },
      {
        tags:       ['TRI-STATE', 'ASOS / AWOS', 'UPDATES HOURLY'],
        title:      'Surface Map',
        description:'Live hourly ASOS and AWOS station observations plotted on a Northeast US map. Temperature, dewpoint, pressure, wind barbs, and sky cover — updated each hour.',
        footerTags: ['Station Model', 'Local', 'Live Obs'],
        to:         '/surface-map',
        accentVar:  '--accent-live',
        thumb:      '/SurfaceMap_thumbnail.png',
      },
    ],
  },
  {
    id:    'heatmaps',
    label: 'Climatology Heatmaps',
    cards: [
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
        tags:       ['US Cities', 'WIND', 'THRESHOLDS'],
        title:      'Wind Threshold Heatmap',
        description:'Probability of sustained and gust wind speeds meeting or exceeding key thresholds by hour and day of year — from breezy to gale force.',
        footerTags: ['Wind', 'Climatology'],
        to:         '/wind-threshold-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/WindThresholdHeatmap_thumbnail.png',
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
        tags:       ['US Cities', 'Temp Threshold Frequencies'],
        title:      'Temperature Threshold Heatmap',
        description:'Probability of hourly temperatures meeting or exceeding key hot and cold thresholds at various US cities.',
        footerTags: ['Temperature', 'Climatology'],
        to:         '/temp-threshold-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/TempThresholdHeatmap_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Fog'],
        title:      'Fog Climatology Heatmap',
        description:'Monthly and seasonal frequency of fog events at various US cities.',
        footerTags: ['Fog Days', 'Climatology'],
        to:         '/fog-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/FogHeatmap_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Thunderstorm Days'],
        title:      'Thunderstorm Heatmap',
        description:'Monthly frequency of thunderstorm days at various US Cities.',
        footerTags: ['Thunderstorms', 'Climatology'],
        to:         '/thunderstorm-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/ThunderstormHeatmap_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'WINTER', 'CLIMO'],
        title:      'Winter Precipitation Heatmap',
        description:'Heatmap of winter precipitation types and totals at various US cities.',
        footerTags: ['Snow', 'Sleet', 'Freezing Rain', 'Climatology'],
        to:         '/winter-precip-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/WinterPrecipHeatmap_thumbnail.png',
      },
      {
        tags:       ['US Cities','Barometric PRESSURE'],
        title:      'Sea Level Pressure Heatmap',
        description:'Climatological mean sea level pressure by hour and day of year. Individual years are much more interesting with this one.',
        footerTags: ['SLP', 'Seasonal Cycle', 'Diurnal Signal'],
        to:         '/slp-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/SLP_Heatmap_thumbnail.png',
      },
      {
        tags:       ['ENSO HISTORY', 'EL NIÑO / LA NIÑA'],
        title:      'ENSO History Heatmap',
        description:'Monthly Niño 3.4 SST anomaly from 1870 to present — placing the developing 2026 super El Niño in 156 years of historical context.',
        footerTags: ['Niño 3.4', 'HadISST 1.1', 'Model Forecast', '1870–Present'],
        to:         '/enso-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/ENSO_Heatmap_thumbnail.png',
      },
      {
        tags:       ['ENSO HISTORY', 'EL NIÑO / LA NIÑA'],
        title:      'ENSO Analog Spaghetti',
        description:'Every historical El Niño and La Niña trajectory overlaid on a single 24-month window — colored by strength tier, with the current event bold on top. Compare 1997–98 to today at a glance.',
        footerTags: ['Niño 3.4', 'ONI', 'Analogs', '1870–Present'],
        to:         '/enso-spaghetti',
        accentVar:  '--accent-hourly',
        thumb:      '/enso-analog-spaghetti_thumbnail.png',
      },
      {
        tags:       ['ENSO', 'PACIFIC OCEAN', 'CLIMATE DATA'],
        title:      'Pacific SST Anomaly Map',
        description:'Explore monthly sea surface temperature anomalies across the equatorial Pacific from 1980 to present. Navigate the full ENSO record — track El Niño and La Niña events through Niño region indices and 850 hPa wind anomaly overlays.',
        footerTags: ['ERSSTv5', 'Niño 3.4', 'ENSO', 'Walker Circulation'],
        to:         '/pacific-sst-map',
        accentVar:  '--accent-hourly',
        thumb:      '/PacificSstMap_thumbnail.png',
      },
    ],
  },
  {
    id:    'connections',
    label: 'Climatology Charts',
    cards: [
      {
        tags:       ['ENSO PHASE COMPARISONS', 'US CITIES'],
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
        tags:       ['US Cities', 'FREQUENCY DISTRIBUTION'],
        title:      'Dewpoint Frequency',
        description:'Distribution of dewpoint temperatures at various US cities across months and seasons.',
        footerTags: ['Dewpoint', 'Frequency', 'ISP Climatology'],
        to:         '/dewpoint-frequency',
        accentVar:  '--accent-climate',
        thumb:      '/DewpointFrequency_thumbnail.png',
      },
      {
        tags:       ['US CIties', 'FREQUENCY DISTRIBUTION'],
        title:      'Temperature Frequency',
        description:'Distribution of observed temperatures at Islip across months and seasons — how often each temperature range occurs throughout the year.',
        footerTags: ['Temperature', 'Frequency', 'ISP Climatology'],
        to:         '/temp-frequency',
        accentVar:  '--accent-climate',
        thumb:      '/TempFrequency_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'FREQUENCY DISTRIBUTION', 'BY MONTH'],
        title:      'Monthly Dewpoint Frequency',
        description:'Hourly dewpoint observations broken down by month — select any month and period to see the full frequency distribution, with normal curve fit and current observation overlay.',
        footerTags: ['Dewpoint', 'Hourly Counts', 'Normal Fit', 'Current Obs'],
        to:         '/dewpoint-frequency-monthly',
        accentVar:  '--accent-climate',
        thumb:      '/DewpointFrequencyMonthly_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'FREQUENCY DISTRIBUTION', 'BY MONTH'],
        title:      'Monthly Temperature Frequency',
        description:'Daily high, daily low, or hourly temperature observations broken down by month — explore the distribution for any month and period, with normal curve fit and current observation overlay.',
        footerTags: ['Temperature', 'Daily High', 'Daily Low', 'Hourly Counts'],
        to:         '/temp-frequency-monthly',
        accentVar:  '--accent-climate',
        thumb:      '/TempFrequencyMonthly_thumbnail.png',
      },
      {
        tags:       ['US CITIES', 'SNOWFALL'],
        title:      'Snowfall Season Window',
        description:'First and last snowfall dates and season length for Northeast cities — visualizing how the window of winter precipitation shifts year to year.',
        footerTags: ['First Snow', 'Last Snow', 'Season Length', 'Trends'],
        to:         '/snowfall-season-window',
        accentVar:  '--accent-climate',
        thumb:      '/snowfall_season_window_thumbnail.png',
      },
      {
        tags:       ['US CITIES', 'SNOWFALL'],
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
      {
        tags:       ['Sunrise & Sunset', 'Global Cities', 'DST-Aware'],
        title:      'Sunrise & Sunset Calendar',
        description:'Daily sunrise and sunset clock times across the full year — revealing how the earliest sunrise and latest sunset are offset from the solstice by the equation of time.',
        footerTags: ['Sunrise', 'Sunset', 'Equation of Time', 'DST'],
        to:         '/sunrise-sunset-calendar',
        accentVar:  '--accent-enso',
        thumb:      '/SunriseSunsetCalendar_thumbnail.png',
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
