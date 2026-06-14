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
    ],
  },

  // ── Astronomy ─────────────────────────────────────────────────────────────────
  {
    key:    'astro',
    label:  'Astronomy',
    accent: ACCENT.astro,
    cards: [
      {
        tags:        ["Kepler's Laws", 'Interactive', '1 of 3'],
        title:       "Kepler's First Law — Orbit Shape Explorer",
        description: "Explore how eccentricity determines the shape of planetary orbits — from nearly circular to highly elliptical. Drag to change eccentricity, reveal geometry overlays for semi-major axis, foci, perihelion and aphelion, and animate the planet with realistic speed variation.",
        footerTags:  ['Orbital Mechanics', "Kepler's Laws", 'Eccentricity', 'Astronomy'],
        to:          '/earthandspace/kepler-law1-ellipses',
        thumb:       '/KeplerLaw1_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ["Kepler's Laws", 'Interactive', '2 of 3'],
        title:       "Kepler's Second Law — Equal Areas Explorer",
        description: "Discover why planets move faster near their star and slower far away. Click to sweep equal areas in equal times, compare wedges at different orbital positions, and watch the speed arrow change in real time.",
        footerTags:  ['Orbital Mechanics', "Kepler's Laws", 'Equal Areas', 'Astronomy'],
        to:          '/earthandspace/kepler-law2-areas',
        thumb:       '/KeplerLaw2_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ["Kepler's Laws", 'Interactive', '3 of 3'],
        title:       "Kepler's Third Law — Harmony of the Spheres",
        description: "Race all planets simultaneously to see how orbital period scales with distance from the Sun, then prove T² = a³ on an interactive log-log plot. Adjust star mass to explore the law's universality across stellar systems.",
        footerTags:  ['Orbital Mechanics', "Kepler's Laws", 'Orbital Periods', 'Astronomy'],
        to:          '/earthandspace/kepler-law3-periods',
        thumb:       '/KeplerLaw3_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['Moon Phases', 'Interactive'],
        title:       'Sidereal vs Synodic Month',
        description: 'Why does a complete cycle of Moon phases take 29.5 days when the Moon orbits Earth in just 27.3 days? Explore the geometry behind the sidereal and synodic month through an animated orbital simulation — with a ghost moon, sidereal reference star, and phase tracker.',
        footerTags:  ['Moon Phases', 'Orbital Mechanics', 'Sidereal Month'],
        to:          '/earthandspace/sidereal-synodic-month',
        thumb:       '/SiderealSynodicMonth_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['Milankovitch Cycles', 'Interactive', '1 of 4'],
        title:       'Obliquity Explorer',
        description: 'Animate Earth\'s axial tilt as it cycles between ~22° and 24.5° over roughly 41,000 years — and see how changing obliquity drives long-term shifts in seasonal contrast and Milankovitch-driven climate cycles.',
        footerTags:  ['Axial Tilt', 'Milankovitch Cycles', 'Climate'],
        to:          '/earthandspace/obliquity-explorer',
        thumb:       '/ObliquityExplorer_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['Milankovitch Cycles', 'Interactive', '2 of 4'],
        title:       'Precession Explorer',
        description: 'Follow Earth\'s slow axial wobble — a ~26,000-year cycle that shifts which star sits at the celestial north pole and alters when perihelion falls relative to the seasons.',
        footerTags:  ['Axial Precession', 'Milankovitch Cycles', 'Polaris', 'Astronomy'],
        to:          '/earthandspace/precession-explorer',
        thumb:       '/PrecessionExplorer_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['Milankovitch Cycles', 'Interactive', '3 of 4'],
        title:       'Eccentricity Explorer',
        description: 'Animate Earth\'s orbital shape as it shifts between nearly circular and more elliptical over ~100,000-year and ~413,000-year cycles. Discover why eccentricity acts as the "volume knob" that modulates the strength of precession-driven insolation changes.',
        footerTags:  ['Orbital Eccentricity', 'Milankovitch Cycles', 'Insolation', 'Astronomy'],
        to:          '/earthandspace/eccentricity-explorer',
        thumb:       '/EccentricityExplorerMilankovitch_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['Milankovitch Cycles', 'Interactive', '4 of 4'],
        title:       'The Stacked Signal',
        description: 'Layer all three Milankovitch cycles — eccentricity, obliquity, and precession — to compute 65°N summer insolation and compare it directly to the EPICA Dome C ice core record. Toggle each component on and off, then witness the pacemaker of the ice ages.',
        footerTags:  ['Milankovitch Cycles', 'Ice Ages', 'EPICA Ice Core', 'Astronomy'],
        to:          '/earthandspace/stacked-signal',
        thumb:       '/StackedSignal_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['Gravity Game', 'Astronomy', 'Interactive'],
        title:       'Flapstronaut',
        description: 'Guide your astronaut through the cosmos in this physics-based arcade challenge. Navigate gravitational fields and orbital hazards — how long can you survive in space?',
        footerTags:  ['Gravity', 'Space Physics', 'Astronomy'],
        to:          '/earthandspace/flapstronaut',
        thumb:       '/flapstronaut_thumbnail.png',
        status:      'live',
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
        tags:        ['ENSO Dynamics', 'Ocean–Atmosphere', 'Interactive'],
        title:       'Kelvin Wave & ENSO Cycle Explainer',
        description: 'Interactive simulation of the ocean–atmosphere mechanism behind El Niño and La Niña — from westerly wind burst to Kelvin wave propagation, thermocline response, and Walker Circulation shift. Includes the full ENSO cycle through La Niña.',
        footerTags:  ['Kelvin Wave', 'Walker Circulation', 'El Niño', 'La Niña'],
        to:          '/earthandspace/kelvin-wave-explainer',
        thumb:       '/kelvin_wave_explainer_thumbnail.png',
        status:      'live',
      },
      {
        tags: ['Clouds', 'Atmosphere'],
        title: 'Cloud Formation Lab',
        description: 'Adjust surface temperature and dew point to simulate parcel lifting and cloud formation processes.',
        footerTags: ['Cloud Formation', 'Thermodynamics'],
        to: '/earthandspace/cloud-formation-lab',
        accentVar: '--accent',
        thumb: 'cloud_formation_lab_thumbnail.png',
        status: 'live',
      },
      {
        tags:        ['Air Density', 'Baseball', 'Interactive'],
        title:       'Homerun Derby Simulator',
        description: 'Step up to the plate and discover how altitude, air density, and temperature determine how far a baseball travels. Hit the ball and watch atmospheric physics decide if it clears the fence — with real MLB stadium dimensions from Fenway to Coors Field.',
        footerTags:  ['Air Density', 'Altitude', 'Atmospheric Physics', 'Baseball'],
        to:          '/earthandspace/homerun-derby',
        thumb:       'homerun-derby_thumbnail.png',
        status:      'live',
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
        footerTags:  ["Bowen's Series", 'Goldich Satbility Series', 'Weathering'],
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
        tags:         ['Seismic Waves', 'Earth\'s Interior'],
        title:       'Seismic Wave Explorer',
        description: 'Visualize P- and S-wave propagation through Earth\'s interior layers and discover how seismic data reveals internal structure.',
        footerTags:   ['Earth\'s Layers', 'Seismology'],
        to:           '/earthandspace/seismic-wave-explorer',
        accentVar:    '--accent',
        thumb:         'seismic_wave_explorer_thumbnail.png',
        status:       'live',
},
      {
        tags:        ['Earth Science', 'Geology', 'Interactive'],
        title:       'Subduction Zone Explorer',
        description: 'Simulate the collision of oceanic and continental plates — visualize subduction, trench formation, volcanic arcs, and the geologic features that emerge at convergent boundaries.',
        footerTags:  ['Plate Tectonics', 'Subduction', 'Convergent Boundaries', 'Geology'],
        to:          '/earthandspace/subduction-explorer',
        thumb:       '/SubductionExplorer_thumbnail.png',
        status:      'live',
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
        <h1 className="page-title">Earth &amp; Space Science Playground</h1>
        <p className="page-subtitle">
          Learning tools created and maintained by Josh Timlin
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
              fontSize:   '1.0rem',
              fontWeight: 700,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color:      'var(--color-text)',
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
