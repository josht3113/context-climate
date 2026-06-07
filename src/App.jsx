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
          <Route path="/igneous"                             element={<Igneous />}                 />
          <Route path="/earthandspace"                       element={<EarthAndSpace />}           />
          <Route path="/bowens"                              element={<Bowens />}                  />
          <Route path="/metamorphic"                         element={<Metamorphic />}             />
          <Route path="/stream-transport"                    element={<StreamTransport />}         />
          <Route path="/bowensgoldich"                       element={<BowensGoldich />}           />
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
        </Routes>
      </main>
      <footer style={{
        borderTop: '0.5px solid rgba(255,255,255,0.08)',
        padding: '1.25rem 2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--color-text-muted)',
          letterSpacing: '0.05em',
        }}>
          © {new Date().getFullYear()} ContextClimate · ISP · Long Island · NYC
        </span>
        <a
          href="/context-climate/privacy.html"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--color-text-muted)',
            letterSpacing: '0.05em',
            textDecoration: 'none',
          }}
          onMouseOver={e => e.target.style.color = 'var(--color-text-secondary)'}
          onMouseOut={e => e.target.style.color = 'var(--color-text-muted)'}
        >
          Privacy Policy
        </a>
      </footer>
    </HashRouter>
  )
}
