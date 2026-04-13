import { NavLink } from 'react-router-dom'
import styles from './Header.module.css'

const NAV_ITEMS = [
  { label: 'Home',       to: '/'                  },
  { label: 'Live',       to: '/isp-live'           },
  { label: 'Climo',      to: '/precipsnow'         },
  { label: 'NE Climate', to: '/northeast-climate'  },
  { label: 'Seasons',    to: '/seasons'            },
]

function BracketMark() {
  return (
    <svg width="22" height="26" viewBox="0 0 28 32" fill="none" aria-hidden="true">
      <path d="M10,3 L4,3 L4,29 L10,29" stroke="#378ADD" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M18,3 L24,3 L24,29 L18,29" stroke="#378ADD" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="10" y1="16" x2="18" y2="16" stroke="#378ADD" strokeWidth="1.5" strokeOpacity="0.35"/>
    </svg>
  )
}

export default function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>

        {/* ── Logo ── */}
        <NavLink to="/" className={styles.logo}>
          <BracketMark />
          <span className={styles.logoText}>ContextClimate</span>
        </NavLink>

        {/* ── Nav + geo badge ── */}
        <div className={styles.navGroup}>
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
          <div className={styles.navDivider} />
          <span className={styles.geoBadge}>Data Vis · Tools · Context</span>
        </div>

      </div>
    </header>
  )
}
