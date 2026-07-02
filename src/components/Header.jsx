import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import styles from './Header.module.css'

// Email kept out of the markup/bundle as plaintext (base64, decoded only on
// click) so basic scrapers can't harvest it straight from the source.
const CONTACT_EMAIL_B64 = 'am9zaHQzMTEzQHlhaG9vLmNvbQ=='
const X_PROFILE_URL = 'https://x.com/joshtimlin'

function handleContactClick(e) {
  e.preventDefault()
  window.location.href = `mailto:${atob(CONTACT_EMAIL_B64)}`
}

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
              <span className={styles.wordmarkEs}>Earth and Space</span>
              <span className={styles.bracketEs}>]</span>
            </NavLink>

            {/* ── Contact / X (desktop only) ── */}
            <div className={styles.utilityLinks}>
              <a
                href="#"
                onClick={handleContactClick}
                className={styles.iconLink}
                aria-label="Contact"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 7l9 6 9-6" />
                </svg>
              </a>
              <a
                href={X_PROFILE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.iconLink}
                aria-label="X (Twitter)"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>

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
          <span className={styles.wordmarkEs}>Earth and Space</span>
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
        <NavLink
          to="/earthandspace"
          className={({ isActive }) =>
            `${styles.drawerItem} ${isActive ? styles.drawerItemActive : ''}`
          }
          onClick={handleNavClick}
        >
          Earth & Space
        </NavLink>

        {/* ── Contact / X (mobile drawer) ── */}
        <div className={styles.drawerUtility}>
          <a href="#" onClick={handleContactClick} className={styles.drawerIconLink}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 7l9 6 9-6" />
            </svg>
            <span>Contact</span>
          </a>
          <a
            href={X_PROFILE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.drawerIconLink}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <span>@joshtimlin</span>
          </a>
        </div>
      </nav>
    </>
  )
}
