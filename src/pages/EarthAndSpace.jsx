import { Link } from 'react-router-dom'
import styles from './Home.module.css'

// ── Accent colors per section ─────────────────────────────────────────────────
const ACCENT = {
  essrt:    '#C8923A',          // warm amber — reference/document feel
  geology:  'var(--accent-earth)', // existing teal-green
  meteor:   '#3AA8CC',          // sky blue
  astro:    '#8B6BC9',          // deep indigo-purple
}

// ── Section data ──────────────────────────────────────────────────────────────
const SECTIONS = [
  // ── ESSRT Pages ─────────────────────────────────────────────────────────────
  {
    key:    'essrt',
    label:  'ESSRT Pages',
    accent: ACCENT.essrt,
    cards: [
      {
        tags:        ['ESSRT', 'Reference', 'Interactive'],
        title:       'Geologic History of New York State',
        description: 'Explore ESSRT pages 6–7 interactively — navigate the Geologic History of New York State, with fossil time distributions, key events, and inferred positions of Earth\'s landmasses.',
        footerTags:  ['Geologic Time', 'Fossils', 'New York State', 'Reference'],
        to:          '/ESSRT_6_7',
        thumb:       '/ESSRT_6_7_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['ESSRT', 'Reference', 'Interactive'],
        title:       'NYS Bedrock, Resources & Landscape Regions',
        description: 'Explore ESSRT pages 8–10 interactively — surface bedrock geology, energy and mineral resources, and the geographic province and landscape regions of New York State.',
        footerTags:  ['Bedrock Geology', 'Mineral Resources', 'Landscape Regions', 'Reference'],
        to:          '/ESSRT_8_9_10',
        thumb:       '/ESSRT_8_9_10_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['ESSRT', 'Reference', 'Interactive'],
        title:       'More ESSRT Pages Coming Soon',
        description: 'Additional interactive ESSRT reference pages currently in development — covering topics across astronomy, meteorology, and Earth systems.',
        footerTags:  [],
        to:          null,
        thumb:       null,
        status:      'soon',
      },
    ],
  },

  // ── Geology ──────────────────────────────────────────────────────────────────
  {
    key:    'geology',
    label:  'Geology',
    accent: ACCENT.geology,
    cards: [
      {
        tags:        ['Earth Science', 'Geology', 'Interactive'],
        title:       'Igneous Crystallization Simulator',
        description: 'Explore how cooling rate and magma composition control crystal size and rock texture in igneous systems.',
        footerTags:  ['Magma', 'Crystal Growth', 'Rock Texture', 'Geology'],
        to:          '/igneous',
        thumb:       '/IgneousCrystallization_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['Earth Science', 'Geology', 'Interactive'],
        title:       "Bowen's Reaction Series Simulator",
        description: "Visualize how magma cools and minerals crystallize in sequence, tracing both the discontinuous and continuous reaction series to predict igneous rock type.",
        footerTags:  ["Bowen's Series", 'Mineral Crystallization', 'Igneous Rocks', 'Geology'],
        to:          '/bowens',
        thumb:       '/BowensReactionSeries_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['Earth Science', 'Geology', 'Interactive'],
        title:       'Metamorphic Transformation Simulator',
        description: 'Apply heat and pressure to parent rocks and watch mineralogy shift through Barrovian metamorphic grades — from shale to slate, phyllite, schist, and gneiss.',
        footerTags:  ['Metamorphism', 'Index Minerals', 'Rock Cycle', 'Geology'],
        to:          '/metamorphic',
        thumb:       '/MetamorphicTransformation_thumbnail.png',
        status:      'live',
      },
       {
        tags:        ['Earth Science', 'Geology', 'Interactive'],
        title:       "Bowen's Reaction Series & Godich Stability Series",
        description: "Simulate mineral crystalization from cooling magma, then flip to weathering mode to watch the same minerals break down in reverse stability order.",
        footerTags:  ["Bowen's Series", 'Goldich Satbility Series', 'Weathering', 'Soil development'],
        to:          '/bowens_goldich',
        thumb:       '/BowensGoldich_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['Earth Science', 'Geology', 'Interactive'],
        title:       'Stream Sediment Transport Simulator',
        description: 'Control stream velocity and observe how erosion, saltation, suspension, and deposition respond — bringing the Hjulström curve to life.',
        footerTags:  ['Stream Transport', 'Erosion & Deposition', 'Sedimentology', 'Geology'],
        to:          '/stream-transport',
        thumb:       '/StreamTransport_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['Earth Science', 'Geology', 'Interactive'],
        title:       'Radioactive Decay Simulator',
        description: 'Select a parent isotope from the ESSRT table and calculate the age of a sample based on remaining parent material and half-life — with visual decay curve.',
        footerTags:  ['Radiometric Dating', 'Half-Life', 'Isotopes'],
        to:          '/radioactive_decay_simulator',
        thumb:       '/radioactive_decay_simulator_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['Earth Science', 'Geology', 'Interactive'],
        title:       'Plate Tectonics Boundary Simulator',
        description: 'Interact with convergent, divergent, and transform boundaries — visualizing the geologic features and seismic events that result at each plate margin.',
        footerTags:  ['Plate Tectonics', 'Boundaries', 'Earthquakes', 'Volcanoes'],
        to:          null,
        thumb:       null,
        status:      'soon',
      },
      {
        tags:        ['Earth Science', 'Geology', 'Interactive'],
        title:       'More tools',
        description: 'Work in progress',
        footerTags:  ['Earth Science', 'Geology'],
        to:          null,
        thumb:       null,
        status:      'soon',
      },
    ],
  },

  // ── Meteorology & Climate ─────────────────────────────────────────────────────
  {
    key:    'meteor',
    label:  'Meteorology & Climate',
    accent: ACCENT.meteor,
    cards: [
      {
        tags:        ['Earth Science', 'Meteorology', 'Interactive'],
        title:       'Weather Station Model Builder',
        description: 'Practice reading and plotting weather station models — decode sky cover, wind speed, pressure trends, and precipitation symbols directly from the ESSRT key.',
        footerTags:  ['Station Model', 'Weather Maps', 'Pressure', 'Meteorology'],
        to:          null,
        thumb:       null,
        status:      'soon',
      },
      {
        tags:        ['Earth Science', 'Climate', 'Interactive'],
        title:       'Planetary Wind Belt Simulator',
        description: "Explore the Hadley, Ferrel, and Polar cells and how global pressure belts drive Earth's trade winds, westerlies, and polar easterlies across every latitude.",
        footerTags:  ['Wind Belts', 'Atmospheric Circulation', 'Climate', 'Troposphere'],
        to:          null,
        thumb:       null,
        status:      'soon',
      },
      {
        tags:        ['Earth Science', 'Meteorology', 'Interactive'],
        title:       'Air Mass & Front Tracker',
        description: 'Simulate the collision of cold and warm air masses to visualize cold, warm, stationary, and occluded fronts — and the weather patterns each one produces.',
        footerTags:  ['Air Masses', 'Fronts', 'Weather Patterns', 'Meteorology'],
        to:          null,
        thumb:       null,
        status:      'soon',
      },
    ],
  },

  // ── Astronomy ─────────────────────────────────────────────────────────────────
  {
    key:    'astro',
    label:  'Astronomy',
    accent: ACCENT.astro,
    cards: [
      {
        tags:        ['Earth Science', 'Astronomy', 'Interactive'],
        title:       'H-R Diagram Explorer',
        description: 'Plot stars by temperature and luminosity on an interactive Hertzsprung-Russell diagram — identify main sequence stars, giants, supergiants, and white dwarfs from the ESSRT.',
        footerTags:  ['H-R Diagram', 'Stars', 'Luminosity', 'Astronomy'],
        to:          null,
        thumb:       null,
        status:      'soon',
      },
      {
        tags:        ['Earth Science', 'Astronomy', 'Interactive'],
        title:       'Stellar Life Cycle Simulator',
        description: 'Follow the birth, evolution, and death of stars — from nebula to protostar, main sequence, and beyond — with pathways that diverge based on initial stellar mass.',
        footerTags:  ['Star Life Cycle', 'Supernovae', 'Nebula', 'Astronomy'],
        to:          null,
        thumb:       null,
        status:      'soon',
      },
      {
        tags:        ['Earth Science', 'Astronomy', 'Interactive'],
        title:       'Solar System Data Visualizer',
        description: 'Compare planetary properties from the ESSRT Solar System Objects Data Table — orbital period, eccentricity, axial tilt, and diameter — through dynamic charts and scale models.',
        footerTags:  ['Solar System', 'Planets', 'Orbital Data', 'Astronomy'],
        to:          null,
        thumb:       null,
        status:      'soon',
      },
    ],
  },
]

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EarthAndSpace() {
  return (
    <div className="page-container">

      {/* Hero */}
      <section className="page-hero">

          <p className="page-eyebrow">Earth &amp; Space Science</p>
        <h1 className="page-title">Earth &amp; Space Science Visualizations and Tools</h1>
        <p className="page-subtitle">
          Created and maintained by Josh Timlin
        </p>
      </section>

      {/* Sections */}
      {SECTIONS.map((section) => (
        <section key={section.key} style={{ marginBottom: '56px' }}>

          {/* Section header */}
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          '12px',
            marginBottom: '24px',
          }}>
            {/* Colored accent bar */}
            <div style={{
              width:        '4px',
              height:       '28px',
              borderRadius: '2px',
              background:   section.accent,
              flexShrink:   0,
            }} />
            <h2 style={{
              margin:     0,
              fontSize:   '0.8rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color:      'var(--color-text-muted)',
            }}>
              {section.label}
            </h2>
            {/* Divider line */}
            <div style={{
              flex:        1,
              height:      '1px',
              background:  'var(--color-border)',
              opacity:     0.5,
            }} />
          </div>

          {/* Cards grid */}
          <div className={styles.grid}>
            {section.cards.map((card, i) => (
              <ToolCard key={`${section.key}-${i}`} {...card} accent={section.accent} />
            ))}
          </div>

        </section>
      ))}

    </div>
  )
}

// ── ToolCard ──────────────────────────────────────────────────────────────────
function ToolCard({ tags, title, description, footerTags, to, thumb, status, accent }) {
  const isSoon   = status === 'soon'
  // Resolve the accent to a usable CSS color string (handles both CSS vars and hex)
  const accentColor = accent

  // Build color-mix expressions — works for both var(--x) and #hex in modern browsers
  const accentBg     = `color-mix(in srgb, ${accentColor} 12%, transparent)`
  const accentBorder = `color-mix(in srgb, ${accentColor} 30%, transparent)`

  const inner = (
    <article className={`${styles.card} ${isSoon ? styles.cardSoon : ''}`}>

      {/* Accent stripe */}
      <div
        className={styles.cardAccent}
        style={{ background: isSoon ? 'var(--color-border)' : accentColor }}
      />

      {/* Tags */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {tags.map((t) => (
          <span
            key={t}
            className={styles.cardTag}
            style={{
              color:      isSoon ? 'var(--color-text-muted)' : accentColor,
              background: isSoon ? 'transparent'             : accentBg,
              border:     `0.5px solid ${isSoon ? 'var(--color-border)' : accentBorder}`,
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
          position:     'relative',
          marginTop:    '16px',
          borderRadius: 'var(--radius-sm)',
          overflow:     'hidden',
          height:       '90px',
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
            position:   'absolute',
            inset:       0,
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
