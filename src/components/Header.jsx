import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import styles from './Header.module.css'

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
  // textLength forces the label to fill exactly 96px → equal 6px gaps on both sides of the brackets
  return (
    <svg
      width="150"
      height="36"
      viewBox="0 0 150 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Earth & Space"
    >
      <text x="4" y="26" fontSize="28" fontWeight="400" fill="#378ADD" fontFamily="monospace">[</text>
      <text
        x="27"
        y="25"
        fontSize="15"
        fontWeight="500"
        fill="#ffffff"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        textLength="96"
        lengthAdjust="spacing"
      >
        Earth &amp; Space
      </text>
      <text x="129" y="26" fontSize="28" fontWeight="400" fill="#378ADD" fontFamily="monospace">]</text>
    </svg>
  )
}

export default function Header() {
  const [open, setOpen] = useState(false)
  const handleNavClick = () => setOpen(false)

  return (
    <>
      <header className={styles.header}>
        <div className={styles.inner}>

          {/* ── Left: ContextClimate logo ── */}
          <div className={styles.innerLeft}>
            <NavLink to="/" className={styles.logo} onClick={handleNavClick}>
              <BracketMark />
              <span className={styles.logoText}>ContextClimate</span>
            </NavLink>
          </div>

          {/* ── Center: Home nav link (desktop only) ── */}
          <nav className={styles.nav}>
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navActive : ''}`
              }
            >
              Home
            </NavLink>
          </nav>

          {/* ── Right: Earth & Space logo + hamburger ── */}
          <div className={styles.innerRight}>
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

        </div>
      </header>

      {/* ── Mobile drawer ── */}
      <nav className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}>
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

        {[
          { label: 'Home', to: '/' },
          { label: 'Earth & Space', to: '/earthandspace' },
        ].map(({ label, to }) => (
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
