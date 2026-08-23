import { Link } from 'react-router-dom'
import styles from './Home.module.css'

// ── Accent colors per section ─────────────────────────────────────────────────
const ACCENT = {
  essrt:    '#B78F36',          // brass/ledger gold — reference/document feel
  geology:  'var(--accent-earth)', // deep teal-cyan
  meteor:   '#4F9FBB',          // deep sky-cyan
  astro:    '#998FC2',          // deep indigo-purple
}

// ── Section data ──────────────────────────────────────────────────────────────
const SECTIONS = [

  // ── Astronomy ─────────────────────────────────────────────────────────────────
  // Grouped into subgroups (still one "Astronomy" section) since this list has
  // grown past 20 tools — flat, it was a long undifferentiated scroll.
  {
    key:    'astro',
    label:  'Astronomy',
    accent: ACCENT.astro,
    subgroups: [
      // ── The Earth–Moon System ────────────────────────────────────────────────
      {
        key:   'earth-moon',
        label: 'The Earth–Moon System',
        cards: [
          {
            tags:        ['Lunar Cycle', 'Interactive'],
            title:       'Sidereal vs Synodic Month',
            description: 'Why does a complete cycle of Moon phases take 29.5 days when the Moon orbits Earth in just 27.3 days? Explore the geometry behind the sidereal and synodic month through an animated orbital simulation.',
            footerTags:  ['Moon Phases', 'Orbital Mechanics'],
            to:          '/earthandspace/sidereal-synodic-month',
            thumb:       '/SiderealSynodicMonth_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ['Moon Phases', 'Interactive'],
            title:       'Lunar Phase Simulator',
            description: 'Explore why we observe different moon phases over the course of a month, and discover why we always see the same side of the moon from Earth. Sync to Today button pulls up tonight\'s real phase.',
            footerTags:  ['Moon Phases', 'Tidal Locking'],
            to:          '/earthandspace/moon-phase-simulator',
            thumb:       '/MoonPhaseSimulator_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ['Tidal Forces', 'Astronomy', 'Interactive'],
            title:       'Tidal Rhythm',
            description: 'See why the Moon raises two tidal bulges, watch spring and neap tides emerge from the combined pull of the Sun and Moon, and check the theory against real NOAA tide data from two Long Island stations.',
            footerTags:  ['Tidal Forces', 'Spring & Neap Tides'],
            to:          '/earthandspace/tidal-rhythm',
            thumb:       '/TidalRhythm_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ['Eclipses', 'Interactive'],
            title:       'Eclipse Explorer',
            description: 'UNDER CONSTRUCTION',
            footerTags:  ['Shadow Geometry', 'Eclipses'],
            to:          '/earthandspace/eclipse-explorer',
            thumb:       '/EclipseExplorer_thumbnail.png',
            status:      'live',
          },
        ],
      },

      // ── Orbital Mechanics & Kepler's Laws ────────────────────────────────────
      {
        key:   'orbital-mechanics',
        label: "Orbital Mechanics & Kepler's Laws",
        cards: [
          {
            tags:        ['Natural Law', 'Interactive'],
            title:       'The Inverse Square Law',
            description: 'See how gravity, solar irradiance, and starlight all weaken with the square of distance.',
            footerTags:  ['Gravity', 'Solar Irradiance', 'Starlight'],
            to:          '/earthandspace/inverse-square-law',
            thumb:       '/InverseSquareLaw_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ["Kepler's Laws", 'Interactive', '1 of 3'],
            title:       "Kepler's First Law",
            description: "Explore how eccentricity changes as the shape of planetary orbits range from nearly circular to highly elliptical. Change eccentricity, reveal geometry overlays for various properties, and animate the planet with realistic speed variation.",
            footerTags:  ["Kepler's Laws", 'Eccentricity'],
            to:          '/earthandspace/kepler-law1-ellipses',
            thumb:       '/KeplerLaw1_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ["Kepler's Laws", 'Interactive', '2 of 3'],
            title:       "Kepler's Second Law",
            description: "Discover why planets move faster near their star and slower far away. Click to sweep equal areas in equal times, compare wedges at different orbital positions, and watch the speed arrow change in real time.",
            footerTags:  ["Kepler's Laws", 'Equal Areas'],
            to:          '/earthandspace/kepler-law2-areas',
            thumb:       '/KeplerLaw2_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ["Kepler's Laws", 'Interactive', '3 of 3'],
            title:       "Kepler's Third Law",
            description: "Race all planets simultaneously to see how orbital period changes as a function of distance from the Sun.",
            footerTags:  ["Kepler's Laws", 'Orbital Periods'],
            to:          '/earthandspace/kepler-law3-periods',
            thumb:       '/KeplerLaw3_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ['Orbital Mechanics', 'Interactive'],
            title:       'Planetary Retrograde Motion',
            description: 'Watch apparent retrograde motion emerge from the geometry of orbits, and trace the looping path it draws across the sky.',
            footerTags:  ['Retrograde Motion', 'Orbital Mechanics'],
            to:          '/earthandspace/planetary-retrograde',
            thumb:       '/PlanetaryRetrograde_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ['Space Travel', 'Interactive'],
            title:       'Mission to Mars',
            description: "Launch a rover toward Mars by timing your departure just right to meet the target at the perfect location. Watch the rover sweep a real Hohmann transfer ellipse, and see exactly how many days a mistimed launch misses by.",
            footerTags:  ['Hohmann Transfer', 'Launch Windows'],
            to:          '/earthandspace/mission-to-mars',
            thumb:       '/MissionToMars_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ['Planetary Formation', 'Interactive'],
            title:       'Chemical Fractionation',
            description: "Explore how planets forming in different regions of the young solar system formed from different materials with different properties, and how Earth developed its interior layers.",
            footerTags:  ['Condensation Sequence', 'Planetary Differentiation'],
            to:          '/earthandspace/chemical-fractionation',
            thumb:       '/ChemicalFractionation_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ['Gravity Game', 'Interactive'],
            title:       'Flapstronaut',
            description: 'Guide your astronaut through the cosmos in this physics-based arcade challenge. Navigate gravitational fields and orbital hazards — how long can you survive?',
            footerTags:  ['Gravity', 'Space Physics'],
            to:          '/earthandspace/flapstronaut',
            thumb:       '/flapstronaut_thumbnail.png',
            status:      'live',
          },
        ],
      },

      // ── Milankovitch Cycles & Climate Astronomy ──────────────────────────────
      {
        key:   'milankovitch',
        label: 'Milankovitch Cycles & Climate Astronomy',
        cards: [
          {
            tags:        ['Milankovitch Cycles', 'Interactive', '1 of 4'],
            title:       'Obliquity Explorer',
            description: 'Animate Earth\'s axial tilt as it cycles between ~22° and 24.5° over roughly 41,000 years — and see how changing obliquity drives long-term shifts in seasonal contrast and Milankovitch-driven climate cycles.',
            footerTags:  ['Axial Tilt', 'Milankovitch Cycles'],
            to:          '/earthandspace/obliquity-explorer',
            thumb:       '/ObliquityExplorer_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ['Milankovitch Cycles', 'Interactive', '2 of 4'],
            title:       'Precession Explorer',
            description: 'Follow Earth\'s slow axial wobble — a ~26,000-year cycle that shifts which star sits at the celestial north pole and alters when perihelion falls relative to the seasons.',
            footerTags:  ['Axial Precession', 'Milankovitch Cycles'],
            to:          '/earthandspace/precession-explorer',
            thumb:       '/PrecessionExplorer_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ['Milankovitch Cycles', 'Interactive', '3 of 4'],
            title:       'Eccentricity Explorer',
            description: 'Animate Earth\'s orbital shape as it shifts between nearly circular and more elliptical over ~100,000-year and ~413,000-year cycles. Discover why eccentricity acts as the "volume knob" that modulates the strength of precession-driven insolation changes.',
            footerTags:  ['Orbital Eccentricity', 'Milankovitch Cycles'],
            to:          '/earthandspace/eccentricity-explorer',
            thumb:       '/EccentricityExplorerMilankovitch_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ['Milankovitch Cycles', 'Interactive', '4 of 4'],
            title:       'The Stacked Signal',
            description: 'Layer all three Milankovitch cycles — eccentricity, obliquity, and precession — to compute 65°N summer insolation and compare it directly to the EPICA Dome C ice core record. Toggle each component on and off, then witness the pacemaker of the ice ages.',
            footerTags:  ['Milankovitch Cycles', 'Ice Ages'],
            to:          '/earthandspace/stacked-signal',
            thumb:       '/StackedSignal_thumbnail.png',
            status:      'live',
          },
        ],
      },

      // ── Observing the Sky ────────────────────────────────────────────────────
      {
        key:   'observing-sky',
        label: 'Observing the Sky',
        cards: [
          {
            tags:        ['Apparent Motion', 'Interactive'],
            title:       "The Sun's Path",
            description: "Watch the Sun trace its daily arc across a south-facing sky on the first day of each season at 41-degrees north and at the Arctic Circle.",
            footerTags:  ['Solar Altitude', 'Seasons'],
            to:          '/earthandspace/suns-path',
            thumb:       '/TheSunsPath_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ['Apparent Motion', 'Interactive'],
            title:       'The Turning Sky',
            description: 'Take a virtual step outside on a Long Island night and watch the sky turn. Toggle between north-facing or south-facing views, and daily or yearly temporal scales.',
            footerTags:  ['Celestial Observation', 'Circumpolar Stars'],
            to:          '/earthandspace/turning-sky',
            thumb:       '/TheTurningSky_thumbnail.png',
            status:      'live',
          },
        ],
      },

      // ── Stars, Spectra & Cosmology ────────────────────────────────────────────
      {
        key:   'stars-cosmology',
        label: 'Stars, Spectra & Cosmology',
        cards: [
          {
            tags:        ['Spectroscopy', 'Interactive'],
            title:       'Spectral Analysis',
            description: 'Discover how every element leaves its own pattern of bright or dark lines on a spectrum — a fingerprint that provides information about the composition of stars and their motions.',
            footerTags:  ['Emission Spectra', 'Absorption Spectra'],
            to:          '/earthandspace/spectral-fingerprint-lab',
            thumb:       '/SpectralFingerprintLab_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ['Spectroscopy', 'Interactive'],
            title:       'Doppler Shift Explorer',
            description: 'Set a star in motion toward or away from an observer and watch its entire spectral fingerprint shift together, and connect Doppler shift to how astronomers measure a star or galaxy\'s motion.',
            footerTags:  ['Redshift', 'Blueshift', 'Doppler Effect'],
            to:          '/earthandspace/doppler-shift-explorer',
            thumb:       '/DopplerShiftExplorer_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ['Cosmology', 'Interactive'],
            title:       "Hubble's Law Explorer",
            description: 'Stretch a simple row of galaxies and pick any one of them as home to observe the velocity-distance relationship, then build the real Hubble diagram yourself from four classic galaxy clusters.',
            footerTags:  ['Hubble Constant', 'Expanding Universe', 'Big Bang'],
            to:          '/earthandspace/hubbles-law-explorer',
            thumb:       '/HubblesLawExplorer_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ['Stellar Evolution', 'Interactive'],
            title:       'The H-R Diagram',
            description: 'Plot stars by temperature and luminosity to see why the H-R Diagram is one of the most powerful tools in stellar astronomy.',
            footerTags:  ['Luminosity', 'Stellar Classification'],
            to:          '/earthandspace/hr-diagram',
            thumb:       '/HRdiagram_thumbnail.png',
            status:      'live',
          },
          {
            tags:        ['Stellar Evolution', 'Interactive'],
            title:       'Life Cycles of Stars',
            description: 'Follow a star from its birth in a nebula through to its final stage, and see how a star\'s initial mass influences the the length of a star\'s life cycle and the ultimate fate of the star.',
            footerTags:  ['Stellar Evolution', 'Nebula', 'Supernova'],
            to:          '/earthandspace/stellar-life-cycles',
            thumb:       '/StellarLifeCycles_thumbnail.png',
            status:      'live',
          },
        ],
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
        tags:        ['Polar Jet Stream', 'Interactive'],
        title:       'The Jet Stream',
        description: 'Watch the polar jet stream snake across North America on a real geographic map — adjust its amplitude, wavelength, and trough/ridge position to see how a wavy upper-level flow pattern forms, then toggle winter and summer to compare flow speed and temperature contrast along the ribbon.',
        footerTags:  ['Polar Jet Stream', 'Upper-Level Winds', 'Meteorology'],
        to:          '/earthandspace/jet-stream',
        thumb:       '/JetStream_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['Fronts', 'Air Masses', 'Interactive'],
        title:       'Anatomy of a Front',
        description: 'See what a front actually is — watch cold, warm, stationary, and occluded boundaries in cross-section while a single weather station traces out its own temperature, dewpoint, pressure, and wind record as the front passes overhead. Drop the vertical exaggeration to 1× to find out how nearly flat a real front is.',
        footerTags:  ['Cold & Warm Fronts', 'Frontal Lifting'],
        to:          '/earthandspace/fronts-cross-section',
        thumb:       '/FrontsCrossSection_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['Surface Analysis', 'Interactive'],
        title:       'Find the Front',
        description: 'Fronts are never observed directly — you infer them. Read the station models across a surface weather map, draw where you think each boundary lies, and see how well your front separates the air masses. Three maps, with temperature, dewpoint, wind, and isobar clues you can toggle on as you work.',
        footerTags:  ['Surface Analysis', 'Air Masses'],
        to:          '/earthandspace/fronts-map-analysis',
        thumb:       '/FrontsAnalysis_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['Bermuda High', 'Hurricanes', 'Interactive'],
        title:       'Hurricane Steering Currents',
        description: 'Explore how upper-level atmospheric flow guides hurricane tracks — visualize how Bermuda High placement and strength can influence the path of tropical systems across the Atlantic basin.',
        footerTags:  ['Hurricanes', 'Steering Currents', 'Meteorology'],
        to:          '/earthandspace/hurricane-steering',
        thumb:       '/HurricaneSteering_thumbnail.png',
        status:      'live',
      },
      {
        tags:        ['ENSO', 'Ocean–Atmosphere', 'Interactive'],
        title:       'ENSO Cycle Explainer',
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
      {
        tags:        ['Atmospheric Circulation', 'Interactive'],
        title:       'The Coriolis Effect',
        description: 'Observe how movement in a rotating frame causes changes in the trajectory of objects travelling over long distances and influences storm circulation patterns.',
        footerTags:  ['Coriolis Effect', 'Rotating Reference Frames'],
        to:          '/earthandspace/coriolis-effect',
        thumb:       '/CoriolisEffect_thumbnail.png',
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
      {
        tags:        ['Earth Science', 'Plate Tectonics', 'Interactive'],
        title:       'Seafloor Spreading Simulator',
        description: 'Watch new oceanic crust form at mid-ocean ridges as magma upwells, cools, and spreads outward — visualizing the mechanism behind continental drift and magnetic stripe patterns.',
        footerTags:  ['Plate Tectonics', 'Mid-Ocean Ridge', 'Magnetic Stripes', 'Geology'],
        to:          '/earthandspace/seafloor-spreading',
        thumb:       '/SeafloorSpreading_thumbnail.png',
        status:      'live',
      },
    ],
  },

  // ── ESSRT Pages ─────────────────────────────────────────────────────────────
  // Kept last — this is reference-table lookup material rather than a concept
  // exploration tool, so it trails the browsable/exploratory sections above.
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

]

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EarthAndSpace() {
  return (
    <div className="page-container">

      {/* Hero */}
      <section className="page-hero">

        <p className="page-eyebrow">Interactive Learning Tools</p>
        <h1 className="page-title">Earth &amp; Space Science</h1>
        <p className="page-intro" style={{ marginBottom: '16px' }}>
          This page is a resource for students and teachers of the NY State Earth &amp; Space Science curriculum. Each card contains an interactive tool for exploring concepts and ideas related to the course material. Have an idea for a tool, or found something that doesn't look right? I'd genuinely like to hear about it &ndash; send an{' '}
          <a
            href="mailto:josht3113@yahoo.com"
            className="page-intro-link"
            style={{ color: 'var(--accent-earth, #3CA3AE)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
          >
            email
          </a>{' '}
          or message me on{' '}
          <a
            href="https://x.com/Joshtimlin"
            className="page-intro-link"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent-earth, #3CA3AE)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
          >
            X
          </a>.
        </p>
        <p className="page-intro">
          The ContextClimate page contains charts and graphs using real data, some of which are also useful in the classroom.
        </p>
        <Link to="/" className="jump-link">
          Jump to ContextClimate <span className="jump-link-arrow">→</span>
        </Link>
      </section>

      {/* Sections */}
      {SECTIONS.map((section) => (
        <section key={section.key} style={{ marginBottom: '56px' }}>

          {/* Section header — reuses Home's .sectionLabel so section titles
              match the font/size/weight used for "Live · Updates Continuously" etc. */}
          <h2
            className={styles.sectionLabel}
            style={{ '--section-accent': section.accent }}
          >
            <span className={styles.sectionLabelBar} />
            {section.label}
          </h2>

          {/* Cards grid — either a flat grid, or (for sections with a
              "subgroups" array, e.g. Astronomy) a labeled grid per subgroup,
              still nested under the one section header above. */}
          {section.subgroups
            ? section.subgroups.map((sub, si) => (
                <div
                  key={sub.key}
                  style={{ marginBottom: si < section.subgroups.length - 1 ? '40px' : 0 }}
                >
                  <h3 style={{
                    margin:        '0 0 18px',
                    fontFamily:    'var(--font-mono)',
                    fontSize:      '1rem',
                    fontWeight:    700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color:         'var(--color-text-primary)',
                  }}>
                    {sub.label}
                  </h3>
                  <div className={styles.grid}>
                    {sub.cards.map((card, i) => (
                      <ToolCard key={`${section.key}-${sub.key}-${i}`} {...card} accent={section.accent} />
                    ))}
                  </div>
                </div>
              ))
            : (
              <div className={styles.grid}>
                {section.cards.map((card, i) => (
                  <ToolCard key={`${section.key}-${i}`} {...card} accent={section.accent} />
                ))}
              </div>
            )
          }

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
    <article
      className={`${styles.card} ${isSoon ? styles.cardSoon : ''}`}
      style={{ '--card-accent': isSoon ? 'var(--color-border)' : accentColor }}
    >

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
