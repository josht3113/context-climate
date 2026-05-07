import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import styles from './Header.module.css'

const NAV_ITEMS = [
  { label: 'Home',          to: '/'       },
  { label: 'Earth & Space', to: '/earthandspace' },
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

function EarthSpaceLogo() {
  return (
    <svg
      width="160"
      height="36"
      viewBox="0 0 160 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Earth & Space"
    >
      {/* Left bracket */}
      <text x="6" y="26" fontSize="28" fontWeight="400" fill="#4ECDC4" fontFamily="monospace">[</text>
      {/* Label */}
      <text
        x="24"
        y="25"
        fontSize="15"
        fontWeight="500"
        fill="#ffffff"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        letterSpacing="0.3"
      >
        Earth &amp; Space
      </text>
      {/* Right bracket */}
      <text x="140" y="26" fontSize="28" fontWeight="400" fill="#4ECDC4" fontFamily="monospace">]</text>
    </svg>
  )
}

export default function Header() {
  const [open, setOpen] = useState(false)
  const location = useLocation()

  // Close drawer on navigation
  const handleNavClick = () => setOpen(false)

  return (
    <>
      <header className={styles.header}>
        <div className={styles.inner}>

          {/* ── Logo ── */}
          <NavLink to="/" className={styles.logo} onClick={handleNavClick}>
            <BracketMark />
            <span className={styles.logoText}>ContextClimate</span>
          </NavLink>

          {/* ── Desktop nav + Earth & Space logo badge ── */}
          <div className={styles.navGroup}>

            {/* Earth & Space clickable logo badge */}
            <NavLink
              to="/earthandspace"
              className={({ isActive }) =>
                `${styles.earthSpaceBadge} ${isActive ? styles.earthSpaceBadgeActive : ''}`
              }
              aria-label="Earth & Space"
              onClick={handleNavClick}
            >
              <EarthSpaceLogo />
            </NavLink>

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

          {/* ── Hamburger (mobile only) ── */}
          <button
            className={styles.hamburger}
            onClick={() => setOpen(o => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            <span />
            <span />
            <span />
          </button>

        </div>
      </header>

      {/* ── Mobile drawer ── */}
      <nav className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}>

        {/* Earth & Space logo in mobile drawer */}
        <NavLink
          to="/earthandspace"
          className={({ isActive }) =>
            `${styles.drawerEarthSpace} ${isActive ? styles.drawerItemActive : ''}`
          }
          onClick={handleNavClick}
          aria-label="Earth & Space"
        >
          <EarthSpaceLogo />
        </NavLink>

        {NAV_ITEMS.map(({ label, to }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `${styles.drawerItem} ${isActive ? styles.drawerItemActive : ''}`
            }
            onClick={handleNavClick}
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
