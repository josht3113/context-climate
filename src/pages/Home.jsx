import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import styles from './Home.module.css'
import SectionNav from './SectionNav'
import HeroMeta from './HeroMeta'
import { parseQuery, filterSections, countCards } from './toolSearch'

// ── Section & card data ───────────────────────────────────────────────────────
// To add a card: drop a new object into the cards array of the right section.
// To add a section: add a new object to SECTIONS.
//
// Accent lives on the SECTION, not the card — every card in a section takes
// the section's accentVar, so a card can't drift to a stale color when it
// moves between sections.
//
// `slow: true` marks a card whose tool does a long live data fetch (~30 s);
// the card shows a small load-time marker.
//
// Station climatology (Temperature / Precipitation / Wind) shares one accent.
// Global Climate sits between it and ENSO & Tropics on purpose: the blue and
// the lavender are only ~16 ΔE apart and must not be adjacent.

const SECTIONS = [
  {
    id:        'live',
    label:     'Live  ·  Updates Continuously',
    navLabel:  'Live',
    accentVar: '--accent-live',
    cards: [
      {
        tags:       ['US Cities', 'Updates Continuously'],
        title:      'Local Weather & Forecast',
        description:'Live station observations with time-series charts, climate normals, daily records, and solar data updated continuously.',
        footerTags: ['Climate Normals', 'Forecasts', 'Solar & Moon'],
        to:         '/current-conditions',
        thumb:      '/current-conditions_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Updates Hourly'],
        title:      'Monthly Temperature Heatmap',
        description:'Hour-by-hour temperature, dewpoint, wind, clouds, and anomalies for any month at any US ASOS station. Streams live data for the current month.',
        footerTags: ['Temp', 'Dewpoint', 'Wind', 'Clouds', 'Anomalies'],
        to:         '/temp-heatmap-monthly',
        thumb:      '/OG_Monthly_Heatmap_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Updates Hourly'],
        title:      'Annual Temperature Heatmap',
        description:'Full-year hourly temperature and weather patterns at a glance — 366 days × 24 hours in a single view. Grows in real time through the current year.',
        footerTags: ['Temp', 'Dewpoint', 'Wind', 'Clouds', 'Anomalies'],
        to:         '/temp-heatmap-annual',
        thumb:      '/OG_Annual_Heatmap_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Updates Hourly'],
        title:      'Monthly Precipitation Heatmap',
        description:'Hourly liquid-equivalent precipitation for any month and station. Streams live data for the current month.',
        footerTags: ['Hourly Precip', 'Daily Totals', 'Live'],
        to:         '/precip-heatmap-monthly',
        thumb:      '/precip_heatmap_monthly_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Updates Hourly'],
        title:      'Annual Precipitation Heatmap',
        description:'Full-year hourly precipitation grid with daily totals and monthly accumulated totals per hour of day. Live through the current year.',
        footerTags: ['Hourly Precip', 'Annual Total', 'Live'],
        to:         '/precip-heatmap-annual',
        thumb:      '/precip_heatmap_annual_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Updates Hourly'],
        title:      'Streak Tracker',
        description:'Current active streaks and all-time records for U.S. cities, tracked hourly or daily.',
        footerTags: ['Temperature', 'Humidity', 'Sky', 'Wind', 'Precipitation'],
        to:         '/streak-tracker',
        thumb:      '/StreakTracker_thumbnail.png',
        slow:       true,
      },
      {
        tags:       ['US Cities', 'Updates Daily'],
        title:      'Meteorological Seasons',
        description:'Meteorological seasons explores the stochastic way in which the seasons unfold each year at various US locations. Updates daily.',
        footerTags: ['Seasons', 'Trends', 'Calendars'],
        to:         '/seasons',
        thumb:      '/Seasons_thumbnail.png',
      },
      {
        tags:       ['Surface Obs', 'Updates Hourly'],
        title:      'Surface Map',
        description:'Live station observations. Temperature, dewpoint, pressure, wind barbs, and sky cover — updated each hour.',
        footerTags: ['Station Model', 'Local', 'Live Obs'],
        to:         '/surface-map',
        thumb:      '/SurfaceMap_thumbnail.png',
      },
      {
        tags:       ['Surface Maps', 'Updates Hourly'],
        title:      'Surface Analysis Builder',
        description:'Draw your own surface analysis on a live CONUS station map. Plot cold fronts, warm fronts, troughs, and pressure centers over real-time observations, with isobars, isotherms, radar, satellite, and zoom.',
        footerTags: ['Fronts', 'Isobars', 'Isotherms', 'Radar', 'Satellite', 'Zoom'],
        to:         '/surface-analysis',
        thumb:      '/SurfaceAnalysis_thumbnail.png',
      },
    ],
  },
  {
    id:        'temperature',
    label:     'Temperature & Humidity',
    navLabel:  'Temp & Humidity',
    accentVar: '--accent-hourly',
    cards: [
      {
        tags:       ['US Cities', 'Any City'],
        title:      'Climographs',
        description:'The classic monthly climograph for any U.S. city — average temperature and precipitation side by side, with two-city compare mode, °F/°C and in/mm toggles, and full data tables.',
        footerTags: ['Normals 1991–2020', 'Compare Cities', 'Any City'],
        to:         '/climographs',
        thumb:      '/climographs_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Any City'],
        title:      'Daily Temperature Climatology',
        description:'Every day of the year’s normal and record high/low temperature for any U.S. city, threaded across a station’s full period of record — with peak-of-summer, peak-of-winter, and all-time record chips.',
        footerTags: ['Normals 1991–2020', 'Record Highs/Lows', 'Any City'],
        to:         '/temperature-climatology',
        thumb:      '/TemperatureClimatology_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Frequency'],
        title:      'Temperature Frequency',
        description:'Distribution of temperatures at various US cities across years, months, and seasons. Turn on current conditions for context.',
        footerTags: ['Annual', 'Seasonal', 'Monthly'],
        to:         '/temp-frequency',
        thumb:      '/TempFrequency_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Temp Frequencies'],
        title:      'Temperature Threshold Heatmap',
        description:'Probability of hourly temperatures meeting or exceeding key hot and cold thresholds at various US cities.',
        footerTags: ['Temperature', 'Climatology'],
        to:         '/temp-threshold-heatmap',
        thumb:      '/TempThresholdHeatmap_thumbnail.png',
        slow:       true,
      },
      {
        tags:       ['US Cities', 'Any City'],
        title:      'Daily Dewpoint Climatology',
        description:'Every day of the year’s record and average dewpoint for any U.S. city, threaded across a station’s full ASOS record — with most-humid-day, driest-day, and all-time record chips.',
        footerTags: ['Record Highs/Lows', 'Daily Averages', 'Any City'],
        to:         '/dewpoint-climatology',
        thumb:      '/DewpointClimatology_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Frequency'],
        title:      'Dewpoint Frequency',
        description:'Distribution of dewpoint temperatures at various US cities across years, months, and seasons. Turn on current conditions for context.',
        footerTags: ['Annual', 'Seasonal', 'Monthly'],
        to:         '/dewpoint-frequency',
        thumb:      '/DewpointFrequency_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Dewpoint'],
        title:      'Dewpoint Threshold Heatmap',
        description:'Monthly frequency of days meeting or exceeding key dewpoint thresholds at various US cities.',
        footerTags: ['Dewpoint', 'Climatology'],
        to:         '/dewpoint-threshold-heatmap',
        thumb:      '/DewptThresholdHeatmap_thumbnail.png',
        slow:       true,
      },
    ],
  },
  {
    id:        'precipitation',
    label:     'Precipitation & Snow',
    navLabel:  'Precip & Snow',
    accentVar: '--accent-hourly',
    cards: [
      {
        tags:       ['US Cities', 'Annual Precipitation'],
        title:      'U.S. Annual Precipitation',
        description:'Year-by-year total precipitation for select U.S. cities — visualizing wet and dry years against long-term averages and percentile ranges.',
        footerTags: ['Annual Totals', 'Percentiles', 'Multi-City'],
        to:         '/us-precip-years',
        thumb:      '/US_annual_precipitation_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Seasonal Snowfall'],
        title:      'U.S. Seasonal Snowfall',
        description:'Season-by-season snowfall totals for select U.S. cities — comparing individual winters against climatological averages and long-term trends.',
        footerTags: ['Seasonal Totals', 'Multi-City', 'Trends'],
        to:         '/us-snow-seasons',
        thumb:      '/US_seasonal_snowfall_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Snowfall'],
        title:      'Snowfall Season Window',
        description:'First and last snowfall dates and season length for Northeast cities — visualizing how the window of winter precipitation shifts year to year.',
        footerTags: ['First Snow', 'Last Snow', 'Season Length', 'Trends'],
        to:         '/snowfall-season-window',
        thumb:      '/snowfall_season_window_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Snowfall'],
        title:      'Snow Frequency',
        description:'Monthly snow day frequency for Northeast cities — how often measurable snowfall occurs by month and how that pattern has evolved over time.',
        footerTags: ['Snow Days', 'Monthly Frequency', 'Trends'],
        to:         '/snow-frequency',
        thumb:      '/snowfall_frequency_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Rain vs Snow'],
        title:      'Winter Precipitation Types',
        description:'Rain vs. snow days each winter, total winter snowfall trends, and how the size of major snowstorms has shifted by decade.',
        footerTags: ['Rain vs Snow Days', 'Storm Size by Decade', 'Trends'],
        to:         '/winter-precip-types',
        thumb:      '/winter_precip_types_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Winter Climo'],
        title:      'Winter Precipitation Heatmap',
        description:'Heatmap of winter precipitation types and totals at various US cities.',
        footerTags: ['Snow', 'Sleet', 'Freezing Rain', 'Climatology'],
        to:         '/winter-precip-heatmap',
        thumb:      '/WinterPrecipHeatmap_thumbnail.png',
        slow:       true,
      },
    ],
  },
  {
    id:        'wind-sky',
    label:     'Wind, Pressure & Sky',
    navLabel:  'Wind & Sky',
    accentVar: '--accent-hourly',
    cards: [
      {
        tags:       ['US Cities', 'Wind Speed'],
        title:      'Wind by Hour Heatmap',
        description:'Heatmap of wind speed by hour of day across the full climatological record for various US cities.',
        footerTags: ['Wind Speed', 'Seasonal Pattern', 'Diurnal Pattern'],
        to:         '/wind-hour-heatmap',
        thumb:      '/WindHourHeatmap_thumbnail.png',
        slow:       true,
      },
      {
        tags:       ['US Cities', 'Wind'],
        title:      'Wind Threshold Heatmap',
        description:'Probability of sustained and gust wind speeds meeting or exceeding key thresholds by hour and day of year.',
        footerTags: ['Wind', 'Climatology'],
        to:         '/wind-threshold-heatmap',
        thumb:      '/WindThresholdHeatmap_thumbnail.png',
        slow:       true,
      },
      {
        tags:       ['US Cities', 'Pressure'],
        title:      'Sea Level Pressure Heatmap',
        description:'Climatological mean sea level pressure by hour and day of year. Individual years are much more interesting with this one.',
        footerTags: ['SLP', 'Seasonal Cycle', 'Diurnal Signal'],
        to:         '/slp-heatmap',
        thumb:      '/SLP_Heatmap_thumbnail.png',
        slow:       true,
      },
      {
        tags:       ['US Cities', 'Updates Monthly'],
        title:      'Cloud Cover Explorer',
        description:'Long-term overcast-sky frequency for any U.S. city — a decades-long trend line and a month-by-month heatmap built from hourly ASOS sky-condition observations.',
        footerTags: ['Overcast Frequency', 'Trend', 'Heatmap'],
        to:         '/cloud-cover-explorer',
        thumb:      '/CloudCoverExplorer_thumbnail.png',
      },
      {
        tags:       ['US Cities', 'Fog'],
        title:      'Fog Climatology Heatmap',
        description:'Monthly and seasonal frequency of fog events at various US cities.',
        footerTags: ['Fog Days', 'Climatology'],
        to:         '/fog-heatmap',
        thumb:      '/FogHeatmap_thumbnail.png',
        slow:       true,
      },
      {
        tags:       ['US Cities', 'Thunderstorm Days'],
        title:      'Thunderstorm Heatmap',
        description:'Monthly frequency of thunderstorm days at various US Cities.',
        footerTags: ['Thunderstorms', 'Climatology'],
        to:         '/thunderstorm-heatmap',
        thumb:      '/ThunderstormHeatmap_thumbnail.png',
        slow:       true,
      },
    ],
  },
  {
    id:        'global',
    label:     'Global Climate',
    navLabel:  'Global',
    accentVar: '--accent-climate',
    cards: [
      {
        tags:       ['Global', 'Updates Daily'],
        title:      'Global Temperature in Context',
        description:'Every day of the ERA5 record, 1940 to present, layered on one calendar — see exactly how today compares against 86 years of history, colored by El Niño / La Niña phase.',
        footerTags: ['ERA5 Reanalysis', 'ENSO Phase', '1940–Present'],
        to:         '/global-temperature-context',
        thumb:      '/GlobalTemperatureContext_thumbnail.png',
      },
      {
        tags:       ['Arctic', 'Antarctic', 'Daily'],
        title:      'Sea Ice Extent Explorer',
        description:'Daily Arctic and Antarctic sea ice extent since 1979 — isolate any year, compare it against decade averages, and see how today stacks up against the full historical record.',
        footerTags: ['NSIDC G02135', '1979–Present', 'Arctic ⇄ Antarctic'],
        to:         '/seaice-extent-explorer',
        thumb:      '/SeaIceExtent_thumbnail.png',
      },
      {
        tags:       ['Sea Ice Area', 'Arctic / Antarctic'],
        title:      'Sea Ice Extent Heatmap',
        description:'Every month since 1979 in one grid — toggle between anomaly and raw extent to see the long-term Arctic and Antarctic changes at a glance.',
        footerTags: ['Sea Ice', 'Arctic ⇄ Antarctic'],
        to:         '/seaice-heatmap',
        thumb:      '/SeaiceHeatmap_thumbnail.png',
      },
      {
        tags:       ['NOAA GML', '1979–Present'],
        title:      'Greenhouse Gas Tracker',
        description:'Forty-six years of measured atmospheric composition — 22 long-lived gases from CO₂ to HFCs, plotted alongside NOAA’s Annual Greenhouse Gas Index and its radiative-forcing breakdown.',
        footerTags: ['22 Gases', 'AGGI', 'Radiative Forcing'],
        to:         '/greenhouse-gas-tracker',
        thumb:      '/GreenhouseGasExplorer_thumbnail.png',
      },
      {
        tags:       ['Global Sample', 'Updates Weekly'],
        title:      'Global Cloud Cover Trend',
        description:'Global mean cloud cover from a 144-point equal-area ERA5 reanalysis sample, 1980 to present — tracking how planetary cloudiness is trending against the 1991–2020 baseline.',
        footerTags: ['ERA5 Reanalysis', '144-Point Sample', '1980–Present'],
        to:         '/global-cloud-cover-trend',
        thumb:      '/CloudCoverTrend_thumbnail.png',
      },
    ],
  },
  {
    id:        'enso-tropics',
    label:     'ENSO & Tropics',
    navLabel:  'ENSO & Tropics',
    accentVar: '--accent-enso',
    cards: [
      {
        tags:       ['ENSO History', 'El Niño / La Niña'],
        title:      'ENSO History Heatmap',
        description:'Monthly Niño 3.4 SST anomaly from 1870 to present — placing current ENSO conditions in historical context.',
        footerTags: ['El Niño', 'Model Forecast', '1870–Present'],
        to:         '/enso-heatmap',
        thumb:      '/ENSO_Heatmap_thumbnail.png',
      },
      {
        tags:       ['ENSO History', 'El Niño / La Niña'],
        title:      'ENSO Analog Spaghetti',
        description:'Every historical El Niño and La Niña trajectory overlaid on a single 24-month window with the current event bold on top. Compare past years to today at a glance.',
        footerTags: ['Niño 3.4', 'ONI', 'Analogs', '1870–Present'],
        to:         '/enso-spaghetti',
        thumb:      '/enso-analog-spaghetti_thumbnail.png',
      },
      {
        tags:       ['ENSO', 'Climate Data'],
        title:      'Pacific SST Anomaly Map',
        description:'Explore monthly sea surface temperature anomalies across the equatorial Pacific from 1980 to present. Navigate the full ENSO record.',
        footerTags: ['ERSSTv5', 'Niño 3.4', 'ENSO', 'Walker Circulation'],
        to:         '/pacific-sst-map',
        thumb:      '/PacificSstMap_thumbnail.png',
      },
      {
        tags:       ['ENSO Phase Comparisons', 'US Cities'],
        title:      'ENSO Winter Analysis',
        description:'Snowfall and winter temperatures across various US cities, stratified by El Niño, La Niña, and neutral ENSO phases.',
        footerTags: ['ENSO', 'Snowfall', 'Temp'],
        to:         '/enso',
        thumb:      '/ENSOThumbnail.png',
      },
      {
        tags:       ['ENSO Phase Comparisons', 'Tropical Cyclones'],
        title:      'Tropical Cyclones ENSO Phase Comparison',
        description:'Atlantic and Eastern Pacific hurricane activity by ENSO phase — named storms, hurricane days, and ACE from 1851 onward.',
        footerTags: ['Atlantic', 'East Pacific', 'ACE', 'ENSO'],
        to:         '/hurricanes',
        thumb:      '/ENSOhurricanesThumbnail.png',
      },
      {
        tags:       ['Tropical Cyclones', 'Updates Daily'],
        title:      'Tropical ACE Tracker',
        description:'Cumulative Accumulated Cyclone Energy for every basin, each season plotted against the whole satellite-era record and against its closest analog seasons.',
        footerTags: ['All Basins', 'Global', 'ACE', 'Analogs'],
        to:         '/tropical-ace',
        thumb:      '/TropicalACE_thumbnail.png',
      },
    ],
  },
  {
    id:        'severe-weather',
    label:     'Severe Weather',
    navLabel:  'Severe',
    accentVar: '--accent-severe',
    cards: [
      {
        tags:       ['1950–2022', 'Interactive Map'],
        title:      'Tornado Track Explorer',
        description:'Every confirmed tornado track in the NOAA/SPC severe weather database — filter by year, month, and EF rating, and click any track for its full record.',
        footerTags: ['EF Scale', 'Path Data', '68,701 Tracks'],
        to:         '/tornado-track-explorer',
        thumb:      '/TornadoTrackExplorer_thumbnail.png',
      },
      {
        tags:       ['1950–2022', 'Any City'],
        title:      'Tornado History Near You',
        description:'Search any U.S. city or airport station to see every tornado on record within a chosen radius — monthly frequency, strength breakdown, and a full nearby-track log.',
        footerTags: ['Radius Search', 'EF Scale', 'Monthly Frequency'],
        to:         '/tornado-history-near-you',
        thumb:      '/TornadoHistoryNearYou_thumbnail.png',
      },
      {
        tags:       ['1950–2022', 'National Dashboard'],
        title:      'U.S. Tornado Climatology',
        description:'Annual trends, seasonal and time-of-day patterns, state-by-state rankings, and the records that define the historical database — all in one dashboard.',
        footerTags: ['Annual Trend', 'State Rankings', 'Records & Extremes'],
        to:         '/us-tornado-climatology',
        thumb:      '/TornadoClimatology_thumbnail.png',
      },
      {
        tags:       ['1950–2022', 'Outbreak Days'],
        title:      'Tornado Outbreak Explorer',
        description:'Ranked outbreak days, a year-by-year intensity timeline, and a full track-by-track map and sequence for the Super Outbreaks, Palm Sunday, and every other major outbreak in the record.',
        footerTags: ['Outbreak Rankings', 'Sequence Maps', '13 Named Outbreaks'],
        to:         '/tornado-outbreak-explorer',
        thumb:      '/OutbreakExplorer_thumbnail.png',
      },
    ],
  },
  {
    id:        'solar',
    label:     'Solar',
    navLabel:  'Solar',
    accentVar: '--accent-solar',
    cards: [
      {
        tags:       ['Solar', 'Interactive'],
        title:      'Solar Heatmap Explorer',
        description:'Visualize solar altitude, azimuth, and day length across any latitude and time of year.',
        footerTags: ['All NH Latitudes', 'Solar Altitude', 'Solar Azimuth'],
        to:         '/solar',
        thumb:      '/SolarHeatMap_thumbnail.png',
      },
      {
        tags:       ['Solar Angle Calendar', 'Global Cities', 'Interactive'],
        title:      'Solar Calendar',
        description:'Day-by-day solar angle and duration data across the full year by location.',
        footerTags: ['Solar Angle', 'Day Length'],
        to:         '/solar-calendar',
        thumb:      '/SolarCalendar_thumbnail.png',
      },
      {
        tags:       ['Sunrise & Sunset', 'Global Cities'],
        title:      'Sunrise & Sunset Calendar',
        description:'Daily sunrise and sunset clock times across the full year — revealing how the earliest sunrise and latest sunset are offset from the solstice by the equation of time.',
        footerTags: ['Sunrise', 'Sunset', 'Equation of Time'],
        to:         '/sunrise-sunset-calendar',
        thumb:      '/SunriseSunsetCalendar_thumbnail.png',
      },
      {
        tags:       ['Solar Activity', 'Interactive'],
        title:      'Solar Sunspot Numbers',
        description:'Monthly sunspot counts since 1749 as an interactive heatmap — watch the ~11-year solar cycle rise and fall through 275 years of the longest continuous scientific record on Earth, and see exactly where Solar Cycle 25 stands today.',
        footerTags: ['Solar Cycle', 'Sunspot Number'],
        to:         '/sunspot-heatmap',
        thumb:      '/SunspotHeatMap_thumbnail.png',
      },
      {
        tags:       ['Solar Activity', 'Interactive'],
        title:      'Sunspot Butterfly Diagram',
        description:"Every sunspot group's latitude since 1874 — watch each solar cycle's bands drift from the mid-latitudes toward the equator, cycle after cycle, in the classic Maunder-style diagram.",
        footerTags: ["Spörer's Law", '1874–Present'],
        to:         '/sunspot-butterfly-diagram',
        thumb:      '/SunspotButterflyDiagram_thumbnail.png',
      },
      {
        tags:       ['Solar Cycle', 'Interactive'],
        title:      'Solar Cycle Progression',
        description:'The traditional sunspot-number time series, plus a cycle-comparison view that restacks any set of solar cycles on a shared "years since minimum" axis so you can see exactly how Cycle 25 stacks up against its predecessors.',
        footerTags: ['Solar Cycle', 'Cycle Comparison', 'SILSO Data'],
        to:         '/solar-cycle-progression',
        thumb:      '/SolarCycleProgression_thumbnail.png',
      },
      {
        tags:       ['Solar Activity', 'Live + Historical', 'Interactive'],
        title:      'Solar Output',
        description:'The Sun\'s total energy output across the 11-year solar cycle, paired with a live look at how much of that energy is actually reaching the ground at Islip right now versus what\'s typical for the date.',
        footerTags: ['TSI', 'Live Irradiance', 'LASP · Open-Meteo'],
        to:         '/solar-output',
        thumb:      '/SolarOutput_thumbnail.png',
      },
    ],
  },
]

// Section list for the jump nav — accent comes from the section itself, the
// same value its header and cards use. Pills use the short `navLabel` so all
// eight fit one row (measured: fits at viewports ≥ ~1230px with the filter
// count showing, ≥ ~1160px without); section headings keep the full `label`.
// NOTE: derived from the FULL SECTIONS, not the filtered list — the nav needs
// every pill (dimmed when empty) and a stable accent per section regardless of
// which card happens to match.
const NAV_SECTIONS = SECTIONS.map((section) => ({
  id:     section.id,
  label:  section.navLabel ?? section.label,
  accent: `var(${section.accentVar})`,
}))

// Denominator for the filter's "n of m" readout — derived, so it can't drift
// as tools are added.
const TOTAL_TOOLS = countCards(SECTIONS)

// ── Component ─────────────────────────────────────────────────────────────────
export default function Home() {
  // Filter state lives here, not in SectionNav — the nav owns the input, this
  // page owns what a match means for its own card shape.
  const [query, setQuery] = useState('')
  const terms           = useMemo(() => parseQuery(query), [query])
  const visibleSections = useMemo(() => filterSections(SECTIONS, terms), [terms])
  const resultCount     = useMemo(() => countCards(visibleSections), [visibleSections])
  // Sections filtered out entirely — their pills dim rather than disappear,
  // so the row keeps a stable width while typing.
  const emptyIds = useMemo(() => {
    const visible = new Set(visibleSections.map((s) => s.id))
    return NAV_SECTIONS.filter((s) => !visible.has(s.id)).map((s) => s.id)
  }, [visibleSections])

  return (
    <div className="page-container">

      {/* Hero */}
      <section className="page-hero">
        {/* Hero meta tags — display notice + tool count.
            Top-right of the hero, level with the title. */}
        <HeroMeta toolCount={TOTAL_TOOLS} />

        <p className="page-eyebrow">Interactive Data Tools</p>
        <h1 className="page-title">Weather &amp; Climate</h1>
        <p style={{
          margin:        '0 0 14px',
          fontFamily:    'var(--font-body)',
          fontSize:      '15px',
          fontWeight:    500,
          color:         'var(--color-text-secondary)',
          letterSpacing: '0.01em',
        }}>
          Created by Josh Timlin <span style={{ color: 'var(--color-text-muted)' }}>·</span> Long Island, NY
        </p>
        <p className="page-intro" style={{ marginBottom: '16px' }}>
          This page is a resource for observing and understanding current and past weather and climate. Each card contains an interactive tool that allows you to dig into a specific phenomenon, track trends and relationships in the data, or get broader context on something happening right now. Updates to the page will be relatively frequent as tools continue to be built and modified. Have an idea for a tool, or found something that doesn't look right? I'd genuinely like to hear about it &ndash; send an{' '}
          <a
            href="mailto:josht3113@yahoo.com"
            className="page-intro-link"
          >
            email
          </a>{' '}
          or message me on{' '}
          <a
            href="https://x.com/Joshtimlin"
            className="page-intro-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            X
          </a>.
        </p>
        <p className="page-intro">
          The Earth &amp; Space page contains interactive learning tools aligned with NY State curriculum for classroom use or casual curiosity.
        </p>
        <Link to="/earthandspace" className="jump-link">
          Jump to Earth &amp; Space <span className="jump-link-arrow">→</span>
        </Link>
      </section>

      {/* Jump nav + tool filter */}
      <SectionNav
        sections={NAV_SECTIONS}
        query={query}
        onQueryChange={setQuery}
        emptyIds={emptyIds}
        resultCount={resultCount}
        totalCount={TOTAL_TOOLS}
      />

      {resultCount === 0 && (
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize:   '13px',
          color:      'var(--color-text-muted)',
          margin:     '0 0 56px',
        }}>
          No tools match &ldquo;{query.trim()}&rdquo;.
        </p>
      )}

      {/* Sections */}
      {visibleSections.map((section, i) => (
        <section
          key={section.id}
          id={section.id}
          style={{
            paddingBottom: '2.5rem',
            borderTop: i > 0 ? '0.5px solid var(--color-border)' : 'none',
          }}
        >
          <p
            className={styles.sectionLabel}
            style={{ '--section-accent': `var(${section.accentVar})` }}
          >
            <span className={styles.sectionLabelBar} />
            {section.label}
            {section.id === 'live' && (
              <span className={styles.livePulse} aria-hidden="true" />
            )}
          </p>
          <div className={styles.grid}>
            {section.cards.map((card) => (
              <ToolCard key={card.title} {...card} accentVar={section.accentVar} />
            ))}
          </div>
        </section>
      ))}

    </div>
  )
}

// ── ToolCard ──────────────────────────────────────────────────────────────────
function ToolCard({ tags, title, description, footerTags, to, accentVar, thumb, status, slow }) {
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

      {/* Tags (+ load-time marker, right-aligned; wraps below on narrow cards) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
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
        {slow && !isSoon && (
          <span
            title="Data fetch may take ~30 seconds"
            style={{
              marginLeft:    'auto',
              alignSelf:     'center',
              fontFamily:    'var(--font-mono)',
              fontSize:      '11px',
              letterSpacing: '0.06em',
              color:         'var(--color-text-muted)',
              whiteSpace:    'nowrap',
            }}
          >
            ~30 s load
          </span>
        )}
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
