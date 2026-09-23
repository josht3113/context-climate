import { BUILD_DATE } from './buildInfo'

// ── HeroMeta ─────────────────────────────────────────────────────────────────
// The inert metadata tags in the top-right of a page hero: the display notice
// and the tool count / build stamp. Drop it as the first child of .page-hero:
//
//   <HeroMeta toolCount={TOTAL_TOOLS} />
//
// Shared by Home and Earth & Space, which previously each carried their own
// copy of the display-note markup. Pass the page's own derived total —
// countCards(SECTIONS), never a literal.
//
// ── On color ─────────────────────────────────────────────────────────────────
// These tags are deliberately NEUTRAL. Across these pages color means one of
// two things: this is interactive (jump link, nav pills), or this is a
// section's identity (card stripes, tags, section rules). The display notice
// used to sit here in --accent-earth teal, which is neither — it's a fixed
// statement about the page. Draining it to muted keeps accent color meaningful
// and hands the hero's one accent slot to the jump link, which is clickable.
//
// The count's NUMBER is the one live value here, so it earns emphasis via
// weight — --color-text-primary against the muted rest — rather than hue.
//
// The styles live as global classes in src/index.css alongside .page-hero and
// .jump-link (not a CSS module) because .display-note is already global and is
// used standalone on tool pages; .hero-meta only overrides its positioning
// when it appears inside this wrapper.
export default function HeroMeta({ toolCount }) {
  return (
    <div className="hero-meta">
      <span className="display-note">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
          <rect x="1.5" y="2.5" width="13" height="9" rx="1" />
          <path d="M5 14h6" />
        </svg>
        Built for Chromebook &amp; desktop
      </span>

      <span className="tool-count">
        <span>
          <span className="tool-count-n">{toolCount}</span> Tools
        </span>
        {/* Empty outside a Vite build — render nothing rather than a stub. */}
        {BUILD_DATE && (
          <>
            <span aria-hidden="true">·</span>
            <span>Updated {BUILD_DATE}</span>
          </>
        )}
      </span>
    </div>
  )
}
