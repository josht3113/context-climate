import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import styles from './Header.module.css'
import { EARTH_SPACE_PATHS } from '../pages/EarthAndSpace'

// Email kept out of the markup/bundle as plaintext (base64, decoded only on
// click) so basic scrapers can't harvest it straight from the source.
const CONTACT_EMAIL_B64 = 'am9zaHQzMTEzQHlhaG9vLmNvbQ=='
const X_PROFILE_URL = 'https://x.com/joshtimlin'

function handleContactClick(e) {
  e.preventDefault()
  window.location.href = `mailto:${atob(CONTACT_EMAIL_B64)}`
}

// The site has two hubs. Every page belongs to one of them: Earth & Space
// owns /earthandspace and any route its hub page links to; everything else
// belongs to Weather & Climate (the home page).
const HUBS = [
  { key: 'wx',    label: 'Weather & Climate', to: '/' },
  { key: 'earth', label: 'Earth & Space',     to: '/earthandspace' },
]

function hubFor(pathname) {
  if (pathname === '/earthandspace' || pathname.startsWith('/earthandspace/')) return 'earth'
  if (EARTH_SPACE_PATHS.has(pathname)) return 'earth'
  return 'wx'
}

const MailIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
)

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)

export default function Header() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const activeHub = hubFor(pathname)

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setOpen(false) }, [pathname])

  const tabClass = (hub) =>
    `${styles.tab} ${styles[`tab_${hub.key}`]} ${activeHub === hub.key ? styles.tabActive : ''}`
  const drawerClass = (hub) =>
    `${styles.drawerItem} ${styles[`tab_${hub.key}`]} ${activeHub === hub.key ? styles.drawerItemActive : ''}`

  return (
    <>
      <header className={styles.header}>
        <div className={styles.inner}>

          <NavLink to="/" className={styles.logo} title="ContextClimate home">
            <span className={styles.bracket}>[ ]</span>
            <span className={styles.wordmark}>ContextClimate</span>
          </NavLink>

          <nav className={styles.tabs} aria-label="Sections">
            {HUBS.map((hub) => (
              <NavLink
                key={hub.key}
                to={hub.to}
                className={tabClass(hub)}
                aria-current={activeHub === hub.key ? 'page' : undefined}
              >
                {hub.label}
              </NavLink>
            ))}
          </nav>

          <div className={styles.utility}>
            <a href="#" onClick={handleContactClick} className={styles.iconLink} aria-label="Email Josh" title="Email">
              <MailIcon />
            </a>
            <a href={X_PROFILE_URL} target="_blank" rel="noopener noreferrer" className={styles.iconLink} aria-label="@joshtimlin on X" title="@joshtimlin on X">
              <XIcon />
            </a>
          </div>

          <button
            className={styles.menuButton}
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            <span className={styles.menuLabel}>{open ? 'Close' : 'Menu'}</span>
            <span className={`${styles.menuBars} ${open ? styles.menuBarsOpen : ''}`}>
              <span /><span /><span />
            </span>
          </button>

        </div>
      </header>

      <nav className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`} aria-label="Sections">
        {HUBS.map((hub) => (
          <NavLink key={hub.key} to={hub.to} className={drawerClass(hub)} onClick={() => setOpen(false)}>
            {hub.label}
          </NavLink>
        ))}

        <div className={styles.drawerUtility}>
          <a href="#" onClick={handleContactClick} className={styles.drawerIconLink}>
            <MailIcon /><span>Email</span>
          </a>
          <a href={X_PROFILE_URL} target="_blank" rel="noopener noreferrer" className={styles.drawerIconLink}>
            <XIcon /><span>@joshtimlin</span>
          </a>
        </div>
      </nav>
    </>
  )
}
