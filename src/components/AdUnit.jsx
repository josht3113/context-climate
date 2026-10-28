import { useEffect, useRef } from 'react'
import styles from './AdUnit.module.css'

// AdSense publisher ID — matches the loader script in index.html.
const AD_CLIENT = 'ca-pub-7204677737254346'

// One manual AdSense slot with a small "Advertisement" label above it.
//   Fixed size  → pass width + height (e.g. the 160×600 side rail).
//   Responsive  → omit width/height; `format` sets the shape (default 'auto').
// The whole block (label included) collapses when AdSense reports the slot
// as unfilled, so an empty labeled box never sits on the page.
export default function AdUnit({ slot, width, height, format = 'auto', className = '' }) {
  const insRef = useRef(null)

  useEffect(() => {
    const ins = insRef.current
    // Skip if this <ins> was already filled — guards against a double push
    // (React StrictMode mounts effects twice in dev, and AdSense throws on
    // a second push to the same element).
    if (!ins || ins.getAttribute('data-adsbygoogle-status')) return
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch (e) {
      // Ad blockers and network failures land here — the page carries on.
    }
  }, [])

  const fixed = Boolean(width && height)

  return (
    <div className={`${styles.wrap} ${fixed ? '' : styles.responsive} ${className}`}>
      <span className={styles.label}>Advertisement</span>
      <ins
        ref={insRef}
        className={`adsbygoogle ${styles.ins}`}
        style={fixed ? { display: 'inline-block', width, height } : { display: 'block' }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={slot}
        {...(fixed
          ? {}
          : { 'data-ad-format': format, 'data-full-width-responsive': 'true' })}
      />
    </div>
  )
}
