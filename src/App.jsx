import { HashRouter, Routes, Route } from 'react-router-dom'
import Header                      from './components/Header'
import Home                        from './pages/Home'
import HourlyData                  from './pages/HourlyData'
import Climate                     from './pages/Climate'
import ENSO                        from './pages/ENSO'
import Seasons                     from './pages/Seasons'
import IspLive                     from './pages/IspLive'
import PrecipSnow                  from './pages/PrecipSnow'
import NortheastClimate            from './pages/NortheastClimate'
import Hurricanes                  from './pages/Hurricanes'
import Solar                       from './pages/Solar'
import Igneous                     from './pages/Igneous'
import ScrollToTop                 from './components/ScrollToTop'
import EarthAndSpace               from './pages/EarthAndSpace'
import Bowens                      from './pages/Bowens'
import Metamorphic                 from './pages/Metamorphic'
import StreamTransport             from './pages/StreamTransport'
import BowensGoldich               from './pages/BowensGoldich'
import ESSRT_8_9_10                from './pages/ESSRT_8_9_10'
import ESSRT_6_7                   from './pages/ESSRT_6_7'
import RadioactiveDecay           from './pages/Radioactive_decay_simulator'

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
          <Route path="/"                                    element={<Home />}             />
          <Route path="/isp-live"                            element={<IspLive />}          />
          <Route path="/precipsnow"                          element={<PrecipSnow />}       />
          <Route path="/northeast-climate"                   element={<NortheastClimate />} />
          <Route path="/seasons"                             element={<Seasons />}          />
          <Route path="/monthly"                             element={<HourlyData />}       />
          <Route path="/annual"                              element={<Climate />}          />
          <Route path="/enso"                                element={<ENSO />}             />
          <Route path="/hurricanes"                          element={<Hurricanes />}       />
          <Route path="/solar"                               element={<Solar />}            />
          <Route path="/igneous"                             element={<Igneous />}          />
          <Route path="/earthandspace"                       element={<EarthAndSpace />}    />
          <Route path="/bowens"                              element={<Bowens />}           />
          <Route path="/metamorphic"                         element={<Metamorphic />}      />
          <Route path="/stream-transport"                    element={<StreamTransport />}  />
          <Route path="/bowensgoldich"                       element={<BowensGoldich />}    />
          <Route path="/ESSRT_8_9_10"                        element={<ESSRT_8_9_10 />}     />
          <Route path="/ESSRT_6_7"                           element={<ESSRT_6_7 />}        />
          <Route path="/radioactive_decay_simulator"         element={<radioactive_decay_simulatpr />}        />
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
