import { useEffect, useState } from 'react'
import AdUnit from './AdUnit'
import styles from './AdRails.module.css'

// "Side rail" ad unit in AdSense — fixed 160×600, shared by both rails.
const RAIL_SLOT = '3278815666'

// Rails sit in the blank margins outside .page-container (1320px max).
// Each needs 160px + a 24px gap + a 16px edge margin, so they only fit from
// 1320 + 2 × 200 = 1720px wide. The height floor keeps the pinned rail
// (header + gap + label + 600px ad ≈ 700px) clear of the footer.
const RAIL_QUERY = '(min-width: 1720px) and (min-height: 780px)'

function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [query])
  return matches
}

// Left and right margin ads for the landing pages (Home, Earth & Space).
// Not rendered at all below the breakpoint — a hidden zero-width AdSense
// slot throws errors — and never used on tool pages.
export default function AdRails() {
  const show = useMediaQuery(RAIL_QUERY)
  if (!show) return null

  return (
    <>
      <aside className={`${styles.rail} ${styles.left}`} aria-label="Advertisement">
        <AdUnit slot={RAIL_SLOT} width="160px" height="600px" />
      </aside>
      <aside className={`${styles.rail} ${styles.right}`} aria-label="Advertisement">
        <AdUnit slot={RAIL_SLOT} width="160px" height="600px" />
      </aside>
    </>
  )
}
