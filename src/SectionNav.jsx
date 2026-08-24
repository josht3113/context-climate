import { useEffect, useRef, useState } from 'react'
import styles from './SectionNav.module.css'

// ── SectionNav ───────────────────────────────────────────────────────────────
// Reusable sticky "jump to section" pill row. Drop it right after a page's
// hero, and pass the same section list the page uses to render itself:
//
//   <SectionNav sections={[{ id, label, accent }, ...]} />
//
// - `id` must match the `id` attribute on that section's <section> element.
// - `accent` can be a hex string OR a var(--token) string — both work with
//   color-mix() in the stylesheet.
//
// Behavior:
// - Sticks to the top of the viewport once scrolled to (CSS position:sticky,
//   no JS toggling needed for that part).
// - Docks itself just below the page's own header IF that header is sticky
//   or fixed — measured at runtime via `document.querySelector('header')`,
//   so this doesn't need to hardcode a pixel value or know in advance
//   whether the site header scrolls away or stays pinned. If your layout's
//   persistent header isn't a <header> element, update the selector below.
// - Highlights whichever section currently owns the top of the viewport
//   (scroll-spy) via a lightweight rAF-throttled scroll listener.
// - Clicking a pill smooth-scrolls to that section, offset so its heading
//   doesn't land underneath the sticky nav (or the page header).

export default function SectionNav({ sections }) {
  const navRef = useRef(null)
  const [activeId, setActiveId] = useState(sections[0]?.id)
  const [topOffset, setTopOffset] = useState(0)

  // Measure the page's own persistent header, if it has one, so this nav
  // docks directly below it instead of overlapping or guessing an offset.
  useEffect(() => {
    function measureHeaderOffset() {
      const header = document.querySelector('header')
      if (!header) {
        setTopOffset(0)
        return
      }
      const position = window.getComputedStyle(header).position
      const isPinned = position === 'sticky' || position === 'fixed'
      setTopOffset(isPinned ? header.getBoundingClientRect().height : 0)
    }
    measureHeaderOffset()
    window.addEventListener('resize', measureHeaderOffset)
    return () => window.removeEventListener('resize', measureHeaderOffset)
  }, [])

  // Scroll-spy: the active pill is whichever section's top has most recently
  // crossed the line just below the (possibly-stacked) nav + header.
  useEffect(() => {
    let ticking = false

    function updateActive() {
      const navHeight = navRef.current?.getBoundingClientRect().height || 0
      const line = topOffset + navHeight + 16
      let current = sections[0]?.id
      for (const s of sections) {
        const el = document.getElementById(s.id)
        if (el && el.getBoundingClientRect().top <= line) current = s.id
      }
      setActiveId(current)
      ticking = false
    }

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(updateActive)
        ticking = true
      }
    }

    updateActive()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [sections, topOffset])

  function handleClick(id) {
    const el = document.getElementById(id)
    if (!el) return
    const navHeight = navRef.current?.getBoundingClientRect().height || 0
    const y = window.scrollY + el.getBoundingClientRect().top - topOffset - navHeight - 12
    window.scrollTo({ top: Math.max(y, 0), behavior: 'smooth' })
  }

  return (
    <nav
      ref={navRef}
      className={styles.nav}
      style={{ top: `${topOffset}px` }}
      aria-label="Jump to section"
    >
      <div className={styles.navInner}>
        {sections.map((s) => {
          const isActive = activeId === s.id
          return (
            <button
              key={s.id}
              type="button"
              className={styles.pill}
              aria-current={isActive ? 'true' : undefined}
              data-active={isActive ? '' : undefined}
              style={{ '--pill-accent': s.accent }}
              onClick={() => handleClick(s.id)}
            >
              {s.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
