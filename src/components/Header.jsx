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

          {/* ── Desktop nav + geo badge ── */}
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
