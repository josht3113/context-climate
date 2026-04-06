import { HashRouter, Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Home       from './pages/Home'
import HourlyData from './pages/HourlyData'
import Annual     from './pages/Climate'      // file stays Climate.jsx
import ENSO       from './pages/ENSO'
import Hurricanes from './pages/Hurricanes'
import Seasons    from './pages/Seasons'
import Climo      from './pages/Climo'        // rename Live.jsx → Climo.jsx on GitHub

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
          <Route path="/monthly"  element={<HourlyData />} />
          <Route path="/annual"  element={<Annual />}    />
          <Route path="/enso"    element={<ENSO />}      />
          <Route path="/hurricanes" element={<Hurricanes />} />
          <Route path="/seasons" element={<Seasons />}   />
          <Route path="/climo"   element={<Climo />}     />
        </Routes>
      </main>
    </HashRouter>
  )
}
