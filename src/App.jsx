import { HashRouter, Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Home     from './pages/Home'
import HourlyData from './pages/HourlyData'
import Climate  from './pages/Climate'
import ENSO     from './pages/ENSO'
import Seasons  from './pages/Seasons'
import Live     from './pages/Live'

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
      <Header />
      <main>
        <Routes>
          <Route path="/"        element={<Home />}      />
          <Route path="/hourly"  element={<HourlyData />} />
          <Route path="/climate" element={<Climate />}   />
          <Route path="/enso"    element={<ENSO />}      />
          <Route path="/seasons" element={<Seasons />}   />
          <Route path="/live"    element={<Live />}      />
        </Routes>
      </main>
    </HashRouter>
  )
}
