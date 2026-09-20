import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './SectionNav.module.css'

// ── SectionNav ───────────────────────────────────────────────────────────────
// Reusable sticky "jump to section" pill row, with an optional tool filter on
// the right. Drop it right after a page's hero, and pass the same section list
// the page uses to render itself:
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
//   (scroll-spy) via a lightweight rAF-throttled scroll listener. The
//   listener is registered with `capture: true` so it still fires even if
//   the page's actual scrolling happens inside a nested container (e.g. a
//   layout with a pinned header + a scrollable content div) rather than on
//   `window` directly — 'scroll' events don't bubble, but capture-phase
//   listeners on an ancestor still see them.
// - Clicking a pill scrolls to that section via scrollIntoView (rather than
//   window.scrollTo), so it also works correctly regardless of which
//   element actually scrolls — offset handled via a temporary
//   scroll-margin-top so the heading doesn't land under the sticky nav.
//
// ── Search ───────────────────────────────────────────────────────────────────
// Pass `onQueryChange` to render the filter input; omit it and the component
// behaves exactly as it did before (Home and Earth & Space both pass it).
// This component deliberately does NOT filter anything — it owns the input,
// the "/" shortcut and the mobile collapse, and hands the raw string up. The
// page filters its own SECTIONS via ./toolSearch, because only the page knows
// its own card and section shape.
//
//   <SectionNav
//     sections={NAV_SECTIONS}
//     query={query}
//     onQueryChange={setQuery}
//     emptyIds={emptyIds}           // sections with zero matches — pill dims
//     resultCount={n} totalCount={m}
//   />
//
// Scroll-spy needs no special handling while filtering: sections with no
// matches simply aren't rendered, and updateActive already skips ids that
// getElementById can't find.

export default function SectionNav({
  sections,
  query = '',
  onQueryChange,
  emptyIds,
  resultCount,
  totalCount,
  searchPlaceholder = 'Search tools',
}) {
  const navRef = useRef(null)
  const sentinelRef = useRef(null)
  const inputRef = useRef(null)
  const [activeId, setActiveId] = useState(sections[0]?.id)
  const [topOffset, setTopOffset] = useState(0)
  const [mobileExpanded, setMobileExpanded] = useState(false)

  const hasSearch = typeof onQueryChange === 'function'
  const isFiltering = query.trim().length > 0
  const emptySet = useMemo(() => new Set(emptyIds || []), [emptyIds])

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
  // `query` is in the deps because filtering changes which sections exist in
  // the DOM without necessarily firing a scroll event.
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
    // capture: true — see note above on why this can't just be `window`
    // with the default (bubble) phase.
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', onScroll)
    }
  }, [sections, topOffset, query])

  // "/" focuses the filter from anywhere on the page, the way it works in
  // most docs sites. Ignored while the caret is already in a field.
  useEffect(() => {
    if (!hasSearch) return
    function onKeyDown(e) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return
      e.preventDefault()
      setMobileExpanded(true)
      window.requestAnimationFrame(() => inputRef.current?.focus())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hasSearch])

  // Typing while scrolled deep into the page collapses everything above the
  // caret's worth of results, and the browser clamps scroll to wherever the
  // now-shorter document allows — usually nowhere useful. On the transition
  // into a filtered state, pull the nav back to its natural position so the
  // first result sits directly beneath it. Only fires on empty → non-empty,
  // never on every keystroke, and never when the nav is already in view.
  const wasFiltering = useRef(isFiltering)
  useEffect(() => {
    if (isFiltering && !wasFiltering.current) {
      const sentinel = sentinelRef.current
      if (sentinel && sentinel.getBoundingClientRect().top < topOffset) {
        sentinel.style.scrollMarginTop = `${topOffset}px`
        sentinel.scrollIntoView({ block: 'start' })
      }
    }
    wasFiltering.current = isFiltering
  }, [isFiltering, topOffset])

  function handleClick(id) {
    const el = document.getElementById(id)
    if (!el) return
    const navHeight = navRef.current?.getBoundingClientRect().height || 0
    // scroll-margin-top makes the browser's own scrollIntoView do the offset
    // math correctly, whichever element actually ends up scrolling.
    el.style.scrollMarginTop = `${topOffset + navHeight + 12}px`
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleSearchKeyDown(e) {
    if (e.key !== 'Escape') return
    if (query) {
      onQueryChange('')
    } else {
      setMobileExpanded(false)
      inputRef.current?.blur()
    }
  }

  function clearSearch() {
    onQueryChange('')
    inputRef.current?.focus()
  }

  // On mobile the field is collapsed behind an icon, but it must stay open
  // while a query is active — otherwise the query becomes invisible while
  // the page below it is filtered.
  const searchOpen = mobileExpanded || isFiltering

  return (
    <>
      {/* Zero-height marker for the nav's natural (unstuck) position. */}
      <div ref={sentinelRef} aria-hidden="true" />

      <nav
        ref={navRef}
        className={styles.nav}
        style={{ top: `${topOffset}px` }}
        aria-label="Jump to section"
      >
        <div className={styles.navRow}>
          <div className={styles.navInner}>
            {sections.map((s) => {
              const isEmpty = emptySet.has(s.id)
              const isActive = activeId === s.id && !isEmpty
              return (
                <button
                  key={s.id}
                  type="button"
                  className={styles.pill}
                  disabled={isEmpty}
                  aria-current={isActive ? 'true' : undefined}
                  data-active={isActive ? '' : undefined}
                  data-empty={isEmpty ? '' : undefined}
                  style={{ '--pill-accent': s.accent }}
                  onClick={() => handleClick(s.id)}
                >
                  {s.label}
                </button>
              )
            })}
          </div>

          {hasSearch && (
            <div className={styles.search} role="search" data-expanded={searchOpen ? '' : undefined}>
              {isFiltering && typeof resultCount === 'number' && (
                <span className={styles.count} aria-live="polite">
                  {resultCount} of {totalCount}
                </span>
              )}

              <button
                type="button"
                className={styles.searchToggle}
                aria-label="Search tools"
                aria-expanded={searchOpen}
                onClick={() => {
                  setMobileExpanded(true)
                  window.requestAnimationFrame(() => inputRef.current?.focus())
                }}
              >
                <SearchIcon />
              </button>

              <div className={styles.searchField}>
                <span className={styles.searchIcon} aria-hidden="true">
                  <SearchIcon />
                </span>
                <input
                  ref={inputRef}
                  type="search"
                  className={styles.searchInput}
                  value={query}
                  placeholder={searchPlaceholder}
                  aria-label="Filter tools"
                  autoComplete="off"
                  spellCheck="false"
                  onChange={(e) => onQueryChange(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  onBlur={() => { if (!isFiltering) setMobileExpanded(false) }}
                />
                {isFiltering ? (
                  <button
                    type="button"
                    className={styles.searchClear}
                    aria-label="Clear search"
                    onClick={clearSearch}
                  >
                    ×
                  </button>
                ) : (
                  <span className={styles.searchHint} aria-hidden="true">/</span>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>
    </>
  )
}

function SearchIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  )
}
