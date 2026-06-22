import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import styles from './Header.module.css'

// Category links — currently all point Home. See note below: the actual
// Home.jsx sections (Live, Climatology Heatmaps, Climatology Charts, Solar)
// don't map 1:1 onto these five labels yet, so these are placeholders until
// that mapping is confirmed.
const CATEGORY_LINKS = ['Hourly', 'Climate', 'ENSO', 'Seasons', 'Live']

export default function Header() {
  const [open, setOpen] = useState(false)
  const handleNavClick = () => setOpen(false)

  return (
    <>
      <header className={styles.header}>
        <div className={styles.inner}>

          {/* ── Left: ContextClimate wordmark (text) ── */}
          <div className={styles.innerLeft}>
            <NavLink to="/" className={styles.logo} onClick={handleNavClick}>
              <span className={styles.bracketCc}>[ ]</span>
              <span className={styles.wordmark}>ContextClimate</span>
            </NavLink>
          </div>

          {/* ── Center: nav links (desktop only) ── */}
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
            {CATEGORY_LINKS.map((label) => (
              <Link key={label} to="/" className={styles.navItem}>
                {label}
              </Link>
            ))}
          </nav>

          {/* ── Right: Earth & Space wordmark + hamburger ── */}
          <div className={styles.innerRight}>
            <NavLink
              to="/earthandspace"
              className={({ isActive }) =>
                `${styles.earthSpaceBadge} ${isActive ? styles.earthSpaceBadgeActive : ''}`
              }
              aria-label="Earth & Space"
              onClick={handleNavClick}
            >
              <span className={styles.bracketEs}>[</span>
              <span className={styles.wordmarkEs}>Earth 🌍 Space</span>
              <span className={styles.bracketEs}>]</span>
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
          <span className={styles.bracketEs}>[</span>
          <span className={styles.wordmarkEs}>Earth 🌍 Space</span>
          <span className={styles.bracketEs}>]</span>
        </NavLink>

        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `${styles.drawerItem} ${isActive ? styles.drawerItemActive : ''}`
          }
          onClick={handleNavClick}
        >
          Home
        </NavLink>
        {CATEGORY_LINKS.map((label) => (
          <Link
            key={label}
            to="/"
            className={styles.drawerItem}
            onClick={handleNavClick}
          >
            {label}
          </Link>
        ))}
        <NavLink
          to="/earthandspace"
          className={({ isActive }) =>
            `${styles.drawerItem} ${isActive ? styles.drawerItemActive : ''}`
          }
          onClick={handleNavClick}
        >
          Earth & Space
        </NavLink>
      </nav>
    </>
  )
}
