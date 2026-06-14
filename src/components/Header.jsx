import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import styles from './Header.module.css'

const CC_LOGO = `${import.meta.env.BASE_URL}contextclimate_bracket_logo.png`
const ES_LOGO = `${import.meta.env.BASE_URL}earth_space_bracket_logo.png`

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
              <img
                src={CC_LOGO}
                alt="ContextClimate"
                className={styles.logoImg}
              />
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
              <img
                src={ES_LOGO}
                alt="Earth & Space"
                className={styles.earthSpaceImg}
              />
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
          <img
            src={ES_LOGO}
            alt="Earth & Space"
            className={styles.earthSpaceImg}
          />
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
