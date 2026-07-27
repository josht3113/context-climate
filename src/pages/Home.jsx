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
        tags:       ['US Cities', 'UPDATES HOURLY'],
        title:      'Current Conditions & Forecast',
        description:'Live ASOS station observations with time-series charts, climate normals, daily records, and solar data updated continuously.',
        footerTags: ['Climate Normals', 'Daily Records', 'Solar & Moon'],
        to:         '/current-conditions',
        accentVar:  '--accent-live',
        thumb:      '/current-conditions_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'UPDATES HOURLY'],
        title:      'Monthly Temperature Heatmap',
        description:'Hour-by-hour temperature, dewpoint, wind, clouds, and anomalies for any month at any US ASOS station. Streams live data for the current month.',
        footerTags: ['Temp', 'Dewpoint', 'Wind', 'Clouds', 'Anomalies', 'Live'],
        to:         '/temp-heatmap-monthly',
        accentVar:  '--accent-live',
        thumb:      '/OG_Monthly_Heatmap_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'UPDATES HOURLY'],
        title:      'Annual Temperature Heatmap',
        description:'Full-year hourly temperature and weather patterns at a glance — 366 days × 24 hours in a single view. Grows in real time through the current year.',
        footerTags: ['Temp', 'Dewpoint', 'Wind', 'Clouds', 'Live'],
        to:         '/temp-heatmap-annual',
        accentVar:  '--accent-live',
        thumb:      '/OG_Annual_Heatmap_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'UPDATES HOURLY'],
        title:      'Monthly Precipitation Heatmap',
        description:'Hourly liquid-equivalent precipitation for any month and station. Streams live data for the current month.',
        footerTags: ['Hourly Precip', 'Daily Totals', 'Live'],
        to:         '/precip-heatmap-monthly',
        accentVar:  '--accent-live',
        thumb:      '/precip_heatmap_monthly_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'UPDATES HOURLY'],
        title:      'Annual Precipitation Heatmap',
        description:'Full-year hourly precipitation grid with daily totals and monthly accumulated totals per hour of day. Live through the current year.',
        footerTags: ['Hourly Precip', 'Daily Totals', 'Annual Total', 'Live'],
        to:         '/precip-heatmap-annual',
        accentVar:  '--accent-live',
        thumb:      '/precip_heatmap_annual_thumbnail.png',
      },
      {
        tags:       ['US CITIES', 'UPDATES DAILY'],
        title:      'Meteorological Seasons',
        description:'Meteorological seasons explores the stochastic way in which the seasons unfold each year at various US locations. Updates daily.',
        footerTags: ['Seasons', 'Trends', 'Calendars'],
        to:         '/seasons',
        accentVar:  '--accent-live',
        thumb:      '/Seasons_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'UPDATES MONTHLY'],
        title:      'Cloud Cover Explorer',
        description:'Long-term overcast-sky frequency for any U.S. city — a decades-long trend line and a month-by-month heatmap built from hourly ASOS sky-condition observations.',
        footerTags: ['Overcast Frequency', 'Trend', 'Heatmap'],
        to:         '/cloud-cover-explorer',
        accentVar:  '--accent-live',
        thumb:      '/CloudCoverExplorer_thumbnail.png',
      },
    ],
  },
  {
    id:    'heatmaps',
    label: 'Climatology Heatmaps',
    cards: [
      {
        tags:       ['US Cities', 'WIND SPEED'],
        title:      'Wind by Hour Heatmap',
        description:'Heatmap of wind speed by hour of day across the full climatological record for various US cities.',
        footerTags: ['Wind Speed', 'Seasonal Pattern', 'Diurnal Pattern'],
        to:         '/wind-hour-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/WindHourHeatmap_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'WIND'],
        title:      'Wind Threshold Heatmap',
        description:'Probability of sustained and gust wind speeds meeting or exceeding key thresholds by hour and day of year.',
        footerTags: ['Wind', 'Climatology'],
        to:         '/wind-threshold-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/WindThresholdHeatmap_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'DEWPOINT'],
        title:      'Dewpoint Threshold Heatmap',
        description:'Monthly frequency of days meeting or exceeding key dewpoint thresholds at various US cities.',
        footerTags: ['Dewpoint', 'Climatology'],
        to:         '/dewpoint-threshold-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/DewptThresholdHeatmap_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Temp Frequencies'],
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
        tags:       ['US Cities', 'Smoke Reports'],
        title:      'Smoke Heatmap',
        description:'Monthly frequency of smoke reports (METAR code FU) at various US cities — wildfire smoke, agricultural burning, and haze events across the climatological record.',
        footerTags: ['Smoke', 'Climatology'],
        to:         '/smoke-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/SmokeHeatmap_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'WINTER CLIMO'],
        title:      'Winter Precipitation Heatmap',
        description:'Heatmap of winter precipitation types and totals at various US cities.',
        footerTags: ['Snow', 'Sleet', 'Freezing Rain', 'Climatology'],
        to:         '/winter-precip-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/WinterPrecipHeatmap_thumbnail.png',
      },
      {
        tags:       ['US Cities','PRESSURE'],
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
        description:'Monthly Niño 3.4 SST anomaly from 1870 to present — placing the developing ENSO conditions in historical context.',
        footerTags: ['Niño 3.4', 'HadISST 1.1', 'Model Forecast', '1870–Present'],
        to:         '/enso-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/ENSO_Heatmap_thumbnail.png',
      },
      {
        tags:       ['Sea Ice Area', 'ARCTIC / ANTARCTIC'],
        title:      'Sea Ice Extent Heatmap',
        description:'Every month since 1979 in one grid — toggle between anomaly and raw extent to see the long-term Arctic and Antarctic changes at a glance.',
        footerTags: ['NSIDC G02135', '1991–2020 Baseline', 'Arctic ⇄ Antarctic'],
        to:         '/seaice-heatmap',
        accentVar:  '--accent-hourly',
        thumb:      '/SeaiceHeatmap_thumbnail.png',
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
        tags:       ['ENSO HISTORY', 'EL NIÑO / LA NIÑA'],
        title:      'ENSO Analog Spaghetti',
        description:'Every historical El Niño and La Niña trajectory overlaid on a single 24-month window with the current event bold on top. Compare past years to today at a glance.',
        footerTags: ['Niño 3.4', 'ONI', 'Analogs', '1870–Present'],
        to:         '/enso-spaghetti',
        accentVar:  '--accent-climate',
        thumb:      '/enso-analog-spaghetti_thumbnail.png',
      },
      {
        tags:       ['US CIties', 'ANNUAL FREQUENCY'],
        title:      'Temperature Frequency',
        description:'Distribution of observed temperatures across months and seasons — how often each temperature range occurs throughout the year.',
        footerTags: ['Temperature', 'Frequency', 'ISP Climatology'],
        to:         '/temp-frequency',
        accentVar:  '--accent-climate',
        thumb:      '/TempFrequency_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'MONTHLY FREQUENCY'],
        title:      'Monthly Temperature Frequency',
        description:'Daily high, daily low, or hourly temperature observations broken down by month — explore the distribution for any month and period, with normal curve fit and current observation overlay.',
        footerTags: ['Temperature', 'Daily High', 'Daily Low', 'Hourly Counts'],
        to:         '/temp-frequency-monthly',
        accentVar:  '--accent-climate',
        thumb:      '/TempFrequencyMonthly_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'ANY CITY'],
        title:      'Daily Temperature Climatology',
        description:'Every day of the year’s normal and record high/low temperature for any U.S. city, threaded across a station’s full period of record — with peak-of-summer, peak-of-winter, and all-time record chips.',
        footerTags: ['Normals 1991–2020', 'Record Highs/Lows', 'Any City'],
        to:         '/temperature-climatology',
        accentVar:  '--accent-climate',
        thumb:      '/TemperatureClimatology_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'ANNUAL FREQUENCY'],
        title:      'Dewpoint Frequency',
        description:'Distribution of dewpoint temperatures at various US cities across months and seasons.',
        footerTags: ['Dewpoint', 'Frequency', 'ISP Climatology'],
        to:         '/dewpoint-frequency',
        accentVar:  '--accent-climate',
        thumb:      '/DewpointFrequency_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'MONTHLY FREQUENCY'],
        title:      'Monthly Dewpoint Frequency',
        description:'Hourly dewpoint observations broken down by month — select any month and period to see the full frequency distribution, with normal curve fit and current observation overlay.',
        footerTags: ['Dewpoint', 'Hourly Counts', 'Normal Fit', 'Current Obs'],
        to:         '/dewpoint-frequency-monthly',
        accentVar:  '--accent-climate',
        thumb:      '/DewpointFrequencyMonthly_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'ANY CITY'],
        title:      'Daily Dewpoint Climatology',
        description:'Every day of the year’s record and average dewpoint for any U.S. city, threaded across a station’s full ASOS record — with most-humid-day, driest-day, and all-time record chips.',
        footerTags: ['Record Highs/Lows', 'Daily Averages', 'Any City'],
        to:         '/dewpoint-climatology',
        accentVar:  '--accent-climate',
        thumb:      '/DewpointClimatology_thumbnail.png',
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
        tags:       ['US CITIES', 'SEASONAL SNOWFALL'],
        title:      'U.S. Seasonal Snowfall',
        description:'Season-by-season snowfall totals for select U.S. cities — comparing individual winters against climatological averages and long-term trends.',
        footerTags: ['Seasonal Totals', 'Multi-City', 'Trends'],
        to:         '/us-snow-seasons',
        accentVar:  '--accent-climate',
        thumb:      '/US_seasonal_snowfall_thumbnail.png',
      },
      {
        tags:       ['US CITIES', 'ANNUAL PRECIPITATION'],
        title:      'U.S. Annual Precipitation',
        description:'Year-by-year total precipitation for select U.S. cities — visualizing wet and dry years against long-term averages and percentile ranges.',
        footerTags: ['Annual Totals', 'Percentiles', 'Multi-City'],
        to:         '/us-precip-years',
        accentVar:  '--accent-climate',
        thumb:      '/US_annual_precipitation_thumbnail.png',
      },
      {
        tags:       ['ARCTIC', 'ANTARCTIC', 'DAILY'],
        title:      'Sea Ice Extent Explorer',
        description:'Daily Arctic and Antarctic sea ice extent since 1979 — isolate any year, compare it against decade averages, and see how today stacks up against the full historical record.',
        footerTags: ['NSIDC G02135', '1979–Present', 'Arctic ⇄ Antarctic'],
        to:         '/seaice-extent-explorer',
        accentVar:  '--accent-climate',
        thumb:      '/SeaIceExtent_thumbnail.png',
      },
      {
        tags:       ['Global Sample', 'UPDATES WEEKLY'],
        title:      'Global Cloud Cover Trend',
        description:'Global mean cloud cover from a 144-point equal-area ERA5 reanalysis sample, 1980 to present — tracking how planetary cloudiness is trending against the 1991–2020 baseline.',
        footerTags: ['ERA5 Reanalysis', '144-Point Sample', '1980–Present'],
        to:         '/global-cloud-cover-trend',
        accentVar:  '--accent-climate',
        thumb:      '/CloudCoverTrend_thumbnail.png',
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
      {
        tags:       ['Solar Activity', 'Astronomy', 'Interactive'],
        title:      'Solar Sunspot Numbers',
        description:'Monthly sunspot counts since 1749 as an interactive heatmap — watch the ~11-year solar cycle rise and fall through 275 years of the longest continuous scientific record on Earth, and see exactly where Solar Cycle 25 stands today.',
        footerTags: ['Solar Cycle', 'Sunspot Number', 'SILSO Data'],
        to:         '/sunspot-heatmap',
        accentVar:  '--accent-enso',
        thumb:      '/SunspotHeatMap_thumbnail.png',
      },
      {
        tags:       ['Solar Activity', 'Astronomy', 'Interactive'],
        title:      'Sunspot Butterfly Diagram',
        description:"Every sunspot group's latitude since 1874 — watch each solar cycle's bands drift from the mid-latitudes toward the equator, cycle after cycle, in the classic Maunder-style diagram.",
        footerTags: ["Spörer's Law", 'RGO/USAF/NOAA', '1874–Present'],
        to:         '/sunspot-butterfly-diagram',
        accentVar:  '--accent-enso',
        thumb:      '/SunspotButterflyDiagram_thumbnail.png',
      },
      {
        tags:       ['Solar Cycle', 'Astronomy', 'Interactive'],
        title:      'Solar Cycle Progression',
        description:'The traditional sunspot-number time series, plus a cycle-comparison view that restacks any set of solar cycles on a shared "years since minimum" axis so you can see exactly how Cycle 25 stacks up against its predecessors.',
        footerTags: ['Solar Cycle', 'Cycle Comparison', 'SILSO Data'],
        to:         '/solar-cycle-progression',
        accentVar:  '--accent-enso',
        thumb:      '/SolarCycleProgression_thumbnail.png',
      },
      {
        tags:       ['Solar Activity', 'Live + Historical', 'Interactive'],
        title:      'Solar Output',
        description:'The Sun\'s total energy output across the 11-year solar cycle, paired with a live look at how much of that energy is actually reaching the ground at Islip right now versus what\'s typical for the date.',
        footerTags: ['TSI', 'Live Irradiance', 'LASP · Open-Meteo'],
        to:         '/solar-output',
        accentVar:  '--accent-enso',
        thumb:      '/SolarOutput_thumbnail.png',
      },
    ],
  },
  {
    id:    'maps',
    label: 'Maps',
    cards: [
      {
        tags:       ['Surface Obs', 'UPDATES HOURLY'],
        title:      'Surface Map',
        description:'Live station observations. Temperature, dewpoint, pressure, wind barbs, and sky cover — updated each hour.',
        footerTags: ['Station Model', 'Local', 'Live Obs'],
        to:         '/surface-map',
        accentVar:  '--accent-live',
        thumb:      '/SurfaceMap_thumbnail.png',
      },
      {
        tags:       ['Surface Maps', 'UPDATES HOURLY'],
        title:      'Surface Analysis Builder',
        description:'Draw your own surface analysis on a live CONUS station map. Plot cold fronts, warm fronts, troughs, and pressure centers over real-time observations, with isobars, isotherms, radar, satellite, and zoom.',
        footerTags: ['Fronts', 'Isobars', 'Isotherms', 'Radar', 'Satellite', 'Zoom'],
        to:         '/surface-analysis',
        accentVar:  '--accent-live',
        thumb:      '/SurfaceAnalysis_thumbnail.png',
      },
      {
        tags:       ['ENSO', 'CLIMATE DATA'],
        title:      'Pacific SST Anomaly Map',
        description:'Explore monthly sea surface temperature anomalies across the equatorial Pacific from 1980 to present. Navigate the full ENSO record.',
        footerTags: ['ERSSTv5', 'Niño 3.4', 'ENSO', 'Walker Circulation'],
        to:         '/pacific-sst-map',
        accentVar:  '--accent-live',
        thumb:      '/PacificSstMap_thumbnail.png',
      },
    ],
  },
  {
    id:    'severe-weather',
    label: 'Severe Weather',
    cards: [
      {
        tags:       ['1950–2022', 'INTERACTIVE MAP'],
        title:      'Tornado Track Explorer',
        description:'Every confirmed tornado track in the NOAA/SPC severe weather database — filter by year, month, and EF rating, and click any track for its full record.',
        footerTags: ['EF Scale', 'Path Data', '68,701 Tracks'],
        to:         '/tornado-track-explorer',
        accentVar:  '--accent-severe',
        thumb:      '/TornadoTrackExplorer_thumbnail.png',
      },
      {
        tags:       ['1950–2022', 'ANY CITY'],
        title:      'Tornado History Near You',
        description:'Search any U.S. city or airport station to see every tornado on record within a chosen radius — monthly frequency, strength breakdown, and a full nearby-track log.',
        footerTags: ['Radius Search', 'EF Scale', 'Monthly Frequency'],
        to:         '/tornado-history-near-you',
        accentVar:  '--accent-severe',
        thumb:      '/TornadoHistoryNearYou_thumbnail.png',
      },
      {
        tags:       ['1950–2022', 'NATIONAL DASHBOARD'],
        title:      'U.S. Tornado Climatology',
        description:'Annual trends, seasonal and time-of-day patterns, state-by-state rankings, and the records that define the historical database — all in one dashboard.',
        footerTags: ['Annual Trend', 'State Rankings', 'Records & Extremes'],
        to:         '/us-tornado-climatology',
        accentVar:  '--accent-severe',
        thumb:      '/TornadoClimatology_thumbnail.png',
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
        <Link to="/earthandspace" className="jump-link">
          Jump to Earth &amp; Space <span className="jump-link-arrow">→</span>
        </Link>
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
          <p
            className={styles.sectionLabel}
            style={{ '--section-accent': `var(${section.cards[0]?.accentVar || '--color-text-primary'})` }}
          >
            <span className={styles.sectionLabelBar} />
            {section.label}
            {section.id === 'live-heatmaps' && (
              <span className={styles.livePulse} aria-hidden="true" />
            )}
          </p>
          {section.id === 'heatmaps' && (
            <p
              style={{
                fontSize:     '0.75rem',
                color:        'var(--color-text-muted)',
                margin:       '0.25rem 0 1rem',
              }}
            >
              Note: data fetches for these tools may take ~30 seconds to load.
            </p>
          )}
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
    <article
      className={`${styles.card} ${isSoon ? styles.cardSoon : ''}`}
      style={{ '--card-accent': isSoon ? 'var(--color-border)' : `var(${accentVar})` }}
    >

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
