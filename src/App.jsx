import { HashRouter, Routes, Route } from 'react-router-dom'
import Header                      from './components/Header'
import Home                        from './pages/Home'
import HourlyData                  from './pages/HourlyData'
import Climate                     from './pages/Climate'
import ENSO                        from './pages/ENSO'
import Seasons                     from './pages/Seasons'
import IspLive                     from './pages/IspLive'
import CurrentConditions           from './pages/CurrentConditions'
import PrecipSnow                  from './pages/PrecipSnow'
import NortheastClimate            from './pages/NortheastClimate'
import Hurricanes                  from './pages/Hurricanes'
import Solar                       from './pages/Solar'
import SolarCalendar               from './pages/SolarCalendar'
import SunriseSunsetCalendar        from './pages/SunriseSunsetCalendar'
import SunspotHeatmap               from './pages/SunspotHeatmap'
import SolarCycleProgression        from './pages/SolarCycleProgression'
import SunspotButterflyDiagram      from './pages/SunspotButterflyDiagram'
import Igneous                     from './pages/Igneous'
import ScrollToTop                 from './components/ScrollToTop'
import EarthAndSpace               from './pages/EarthAndSpace'
import Bowens                      from './pages/Bowens'
import Metamorphic                 from './pages/Metamorphic'
import StreamTransport             from './pages/StreamTransport'
import BowensGoldich               from './pages/BowensGoldich'
import ESSRT_8_9_10                from './pages/ESSRT_8_9_10'
import ESSRT_6_7                   from './pages/ESSRT_6_7'
import RadioactiveDecay            from './pages/radioactive_decay_simulator'
import CloudFormationLab           from './pages/CloudFormationLab'
import SeismicWaveExplorer         from './pages/SeismicWaveExplorer'
import HomerunDerby                from './pages/HomerunDerby'
import DewpointFrequency           from './pages/DewpointFrequency'
import TempFrequency               from './pages/TempFrequency'
import DewpointFrequencyMonthly    from './pages/DewpointFrequencyMonthly'
import TempFrequencyMonthly        from './pages/TempFrequencyMonthly'
import WindHourHeatmap             from './pages/WindHourHeatmap'
import SubductionExplorer          from './pages/SubductionExplorer'
import Flapstronaut               from './pages/Flapstronaut'
import DewpointThresholdHeatmap    from './pages/DewpointThresholdHeatmap'
import FogHeatmap                  from './pages/FogHeatmap'
import ThunderstormHeatmap         from './pages/ThunderstormHeatmap'
import WinterPrecipHeatmap         from './pages/WinterPrecipHeatmap'
import SnowfallSeasonWindow        from './pages/SnowfallSeasonWindow'
import SnowFrequency               from './pages/SnowFrequency'
import UsPrecipYears               from './pages/UsPrecipYears'
import UsSnowSeasons               from './pages/UsSnowSeasons'
import TempThresholdHeatmap        from './pages/TempThresholdHeatmap'
import SlpHeatmap                  from './pages/SlpHeatmap'
import WindThresholdHeatmap        from './pages/WindThresholdHeatmap'
import TempHeatmapMonthly          from './pages/TempHeatmapMonthly'
import TempHeatmapAnnual           from './pages/TempHeatmapAnnual'
import PrecipHeatmapMonthly        from './pages/PrecipHeatmapMonthly'
import PrecipHeatmapAnnual         from './pages/PrecipHeatmapAnnual'
import EnsoHeatmap                 from './pages/EnsoHeatmap'
import EnsoSpaghetti               from './pages/EnsoSpaghetti'
import KelvinWaveExplainer         from './pages/KelvinWaveExplainer'
import PacificSstMap               from './pages/PacificSstMap'
import SiderealSynodicMonth        from './pages/SiderealSynodicMonth'
import ObliquityExplorer           from './pages/ObliquityExplorer'
import PrecessionExplorer          from './pages/PrecessionExplorer'
import EccentricityExplorer        from './pages/EccentricityExplorer'
import StackedSignal               from './pages/StackedSignal'
import KeplerLaw1                  from './pages/KeplerLaw1'
import KeplerLaw2                  from './pages/KeplerLaw2'
import KeplerLaw3                  from './pages/KeplerLaw3'
import InverseSquareLaw            from './pages/InverseSquareLaw'
import HurricaneSteering           from './pages/HurricaneSteering'
import SurfaceMap                     from './pages/SurfaceMap'
import SurfaceAnalysis               from './pages/SurfaceAnalysis'
import SeafloorSpreading               from './pages/SeafloorSpreading'
import PlanetaryRetrograde         from './pages/PlanetaryRetrograde'
import HrDiagram                   from './pages/HrDiagram'
import StellarLifeCycles           from './pages/StellarLifeCycles'
import TidalRhythm                 from './pages/TidalRhythm'
import SunsPath                    from './pages/SunsPath'
import TurningSky                  from './pages/TurningSky'
import SeaIceExtentExplorer        from './pages/SeaIceExtentExplorer'
import SeaIceHeatmap               from './pages/SeaIceHeatmap'
import JetStream                   from './pages/JetStream'
import SpectralFingerprintLab      from './pages/SpectralFingerprintLab'
import DopplerShiftExplorer        from './pages/DopplerShiftExplorer'
import HubblesLawExplorer          from './pages/HubblesLawExplorer'
import MoonPhaseSimulator          from './pages/MoonPhaseSimulator'

// Email kept out of the markup/bundle as plaintext (base64, decoded only on
// click) so basic scrapers can't harvest it straight from the source.
const CONTACT_EMAIL_B64 = 'am9zaHQzMTEzQHlhaG9vLmNvbQ=='
const X_PROFILE_URL = 'https://x.com/joshtimlin'

function handleContactClick(e) {
  e.preventDefault()
  window.location.href = `mailto:${atob(CONTACT_EMAIL_B64)}`
}

// ── App shell ─────────────────────────────────────────
// HashRouter is used so that GitHub Pages works correctly
// with client-side routing (no server config needed).
// To add a new page:
//   1. Create src/pages/YourPage.jsx
//   2. Import it here
//   3. Add a <Route path="/your-path" element={<YourPage />} />
//   4. Add it to NAV_ITEMS in Header.jsx

export default function App() {
  return (
   <HashRouter>
  <ScrollToTop />
  <Header />
      <main style={{ overflowX: 'hidden' }}>
        <Routes>
          <Route path="/"                                    element={<Home />}                    />
          <Route path="/isp-live"                            element={<IspLive />}                 />
          <Route path="/current-conditions"                  element={<CurrentConditions />}       />
          <Route path="/precipsnow"                          element={<PrecipSnow />}              />
          <Route path="/northeast-climate"                   element={<NortheastClimate />}        />
          <Route path="/seasons"                             element={<Seasons />}                 />
          <Route path="/monthly"                             element={<HourlyData />}              />
          <Route path="/annual"                             element={<Climate />}                 />
          <Route path="/enso"                                element={<ENSO />}                    />
          <Route path="/hurricanes"                          element={<Hurricanes />}              />
          <Route path="/solar"                               element={<Solar />}                   />
          <Route path="/solar-calendar"                      element={<SolarCalendar />}           />
          <Route path="/sunrise-sunset-calendar"             element={<SunriseSunsetCalendar />}   />
          <Route path="/sunspot-heatmap"                     element={<SunspotHeatmap />}          />
          <Route path="/solar-cycle-progression"             element={<SolarCycleProgression />}   />
          <Route path="/sunspot-butterfly-diagram"           element={<SunspotButterflyDiagram />} />
          <Route path="/igneous"                             element={<Igneous />}                 />
          <Route path="/earthandspace"                       element={<EarthAndSpace />}           />
          <Route path="/bowens"                              element={<Bowens />}                  />
          <Route path="/metamorphic"                         element={<Metamorphic />}             />
          <Route path="/stream-transport"                    element={<StreamTransport />}         />
          <Route path="/bowens_goldich"                      element={<BowensGoldich />}           />
          <Route path="/ESSRT_8_9_10"                        element={<ESSRT_8_9_10 />}            />
          <Route path="/ESSRT_6_7"                           element={<ESSRT_6_7 />}               />
          <Route path="/radioactive_decay_simulator"         element={<RadioactiveDecay />}        />
          <Route path="/earthandspace/cloud-formation-lab"   element={<CloudFormationLab />}       />
          <Route path="/earthandspace/seismic-wave-explorer" element={<SeismicWaveExplorer />}     />
          <Route path="/earthandspace/homerun-derby"         element={<HomerunDerby />}            />
          <Route path="/dewpoint-frequency"                  element={<DewpointFrequency />}       />
          <Route path="/temp-frequency"                      element={<TempFrequency />}           />
          <Route path="/dewpoint-frequency-monthly"           element={<DewpointFrequencyMonthly />} />
          <Route path="/temp-frequency-monthly"               element={<TempFrequencyMonthly />}    />
          <Route path="/wind-hour-heatmap"                   element={<WindHourHeatmap />}         />
          <Route path="/earthandspace/subduction-explorer"   element={<SubductionExplorer />}      />
          <Route path="/earthandspace/flapstronaut"          element={<Flapstronaut />}            />
          <Route path="/dewpoint-threshold-heatmap"          element={<DewpointThresholdHeatmap />} />
          <Route path="/fog-heatmap"                         element={<FogHeatmap />}              />
          <Route path="/thunderstorm-heatmap"                element={<ThunderstormHeatmap />}     />
          <Route path="/winter-precip-heatmap"               element={<WinterPrecipHeatmap />}     />
          <Route path="/snowfall-season-window"              element={<SnowfallSeasonWindow />}    />
          <Route path="/snow-frequency"                      element={<SnowFrequency />}           />
          <Route path="/us-precip-years"                     element={<UsPrecipYears />}           />
          <Route path="/us-snow-seasons"                     element={<UsSnowSeasons />}           />
          <Route path="/temp-threshold-heatmap"              element={<TempThresholdHeatmap />}    />
          <Route path="/slp-heatmap"                         element={<SlpHeatmap />}              />
          <Route path="/wind-threshold-heatmap"              element={<WindThresholdHeatmap />}    />
          <Route path="/temp-heatmap-monthly"                element={<TempHeatmapMonthly />}      />
          <Route path="/temp-heatmap-annual"                 element={<TempHeatmapAnnual />}       />
          <Route path="/precip-heatmap-monthly"              element={<PrecipHeatmapMonthly />}    />
          <Route path="/precip-heatmap-annual"               element={<PrecipHeatmapAnnual />}     />
          <Route path="/enso-heatmap"                        element={<EnsoHeatmap />}             />
          <Route path="/enso-spaghetti"                      element={<EnsoSpaghetti />}           />
          <Route path="/earthandspace/kelvin-wave-explainer" element={<KelvinWaveExplainer />}     />
          <Route path="/pacific-sst-map"                         element={<PacificSstMap />}           />
          <Route path="/earthandspace/sidereal-synodic-month" element={<SiderealSynodicMonth />}   />
          <Route path="/earthandspace/obliquity-explorer"     element={<ObliquityExplorer />}       />
          <Route path="/earthandspace/precession-explorer"    element={<PrecessionExplorer />}      />
          <Route path="/earthandspace/eccentricity-explorer"  element={<EccentricityExplorer />}    />
          <Route path="/earthandspace/stacked-signal"         element={<StackedSignal />}           />
          <Route path="/earthandspace/kepler-law1-ellipses"   element={<KeplerLaw1 />}              />
          <Route path="/earthandspace/kepler-law2-areas"      element={<KeplerLaw2 />}              />
          <Route path="/earthandspace/kepler-law3-periods"    element={<KeplerLaw3 />}              />
          <Route path="/earthandspace/inverse-square-law"     element={<InverseSquareLaw />}        />
          <Route path="/earthandspace/hurricane-steering"     element={<HurricaneSteering />}       />
          <Route path="/earthandspace/planetary-retrograde"         element={<PlanetaryRetrograde />}       />
          <Route path="/surface-map"                              element={<SurfaceMap />}               />
          <Route path="/surface-analysis"                         element={<SurfaceAnalysis />}          />
          <Route path="/earthandspace/seafloor-spreading"         element={<SeafloorSpreading />}        />
          <Route path="/earthandspace/hr-diagram"                  element={<HrDiagram />}                />
          <Route path="/earthandspace/stellar-life-cycles"         element={<StellarLifeCycles />}        />
          <Route path="/earthandspace/tidal-rhythm"                element={<TidalRhythm />}               />
          <Route path="/earthandspace/moon-phase-simulator"        element={<MoonPhaseSimulator />}        />
          <Route path="/earthandspace/suns-path"                   element={<SunsPath />}                  />
          <Route path="/earthandspace/turning-sky"                 element={<TurningSky />}                />
          <Route path="/seaice-extent-explorer"                    element={<SeaIceExtentExplorer />}      />
          <Route path="/seaice-heatmap"                            element={<SeaIceHeatmap />}             />
          <Route path="/earthandspace/jet-stream"                  element={<JetStream />}                 />
          <Route path="/earthandspace/spectral-fingerprint-lab"    element={<SpectralFingerprintLab />}    />
          <Route path="/earthandspace/doppler-shift-explorer"      element={<DopplerShiftExplorer />}      />
          <Route path="/earthandspace/hubbles-law-explorer"        element={<HubblesLawExplorer />}        />
        </Routes>
      </main>
      <footer style={{
        borderTop: '0.5px solid var(--color-border)',
        padding: '1.25rem 2rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem 1.5rem',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--color-text-muted)',
            letterSpacing: '0.05em',
          }}>
            © {new Date().getFullYear()} ContextClimate
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <a
            href="/context-climate/privacy.html"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--color-text-muted)',
              letterSpacing: '0.05em',
              textDecoration: 'none',
              transition: 'color 0.15s',
            }}
            onMouseOver={e => e.target.style.color = 'var(--color-text-secondary)'}
            onMouseOut={e => e.target.style.color = 'var(--color-text-muted)'}
          >
            Privacy Policy
          </a>

          <a
            href="#"
            onClick={handleContactClick}
            aria-label="Contact"
            style={{ display: 'flex', color: 'var(--color-text-muted)', transition: 'color 0.15s' }}
            onMouseOver={e => e.currentTarget.style.color = 'var(--accent-live)'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 6 9-6" />
            </svg>
          </a>

          <a
            href={X_PROFILE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X (Twitter)"
            style={{ display: 'flex', color: 'var(--color-text-muted)', transition: 'color 0.15s' }}
            onMouseOver={e => e.currentTarget.style.color = 'var(--accent-live)'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        </div>
      </footer>
    </HashRouter>
  )
}
