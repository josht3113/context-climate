import { NavLink } from 'react-router-dom'
import styles from './Header.module.css'

// ── Nav items ──────────────────────────────────────────
// To add or rename pages, edit this array.
// Each item needs a `label` (what shows in the nav) and
// a `to` path (must match a route in App.jsx).
const NAV_ITEMS = [
  { label: 'Overview',    to: '/'            },
  { label: 'Hourly Data', to: '/hourly'      },
  { label: 'Climate',     to: '/climate'     },
  { label: 'ENSO',        to: '/enso'        },
  { label: 'Seasons',     to: '/seasons'     },
  { label: 'Live',        to: '/live'        },
]

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>

        {/* ── Logo / Site name ── */}
        <NavLink to="/" className={styles.logo}>
          {/* Change "CONTEXTCLIMATE" to whatever you want the site called */}
          <span className={styles.logoText}>CONTEXTCLIMATE</span>
          {/* Change this badge to update the geographic tagline */}
          <span className={styles.logoBadge}>ISP · LI · NYC</span>
        </NavLink>

        {/* ── Navigation ── */}
        <nav className={styles.nav}>
          {NAV_ITEMS.map(({ label, to }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navActive : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

      </div>
    </header>
  )
}
