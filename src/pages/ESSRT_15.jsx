import { Link } from 'react-router-dom'

// ── ESSRT p. 15 — Rock Cycle Infographic ─────────────────────────────────────
// The tool itself is a standalone HTML file living flat in public/ alongside
// core-sample-tools.css, same as the other ESSRT pages. BASE_URL keeps the src
// correct whether the site is served from the domain root or from a sub-path
// like /context-climate/.
const TOOL_SRC = `${import.meta.env.BASE_URL}ESSRT_15.html`

export default function ESSRT_15() {
  return (
    <div className="page-container">

      {/* Hero */}
      <section className="page-hero">
        <p className="page-eyebrow">ESSRT Reference</p>
        <h1 className="page-title">Rock Cycle Infographic</h1>
        <p className="page-intro">
          ESSRT page 15 packs more than sixty labels onto a single diagram. Click any
          marker to unpack one process &mdash; what it is, why it happens, and what to
          look for on the page &mdash; or take the guided tour, which walks the cycle in
          causal order from magma back to magma rather than by rock category.
        </p>
        <p className="page-intro">
          The 2026 edition retired the three rock identification schemes, so this page is
          now the only place in the reference tables where many of these rocks appear at
          all. Markers are colour-coded by where they sit in the cycle; filter to one
          group, or use the index to jump straight to a process.
        </p>
        <Link to="/earthandspace" className="jump-link">
          Back to Earth &amp; Space <span className="jump-link-arrow">&rarr;</span>
        </Link>
      </section>

      {/* Tool */}
      <iframe
        src={TOOL_SRC}
        title="Rock Cycle Infographic — ESSRT page 15"
        style={{
          display:      'block',
          width:        '100%',
          height:       'clamp(720px, calc(100vh - 96px), 1200px)',
          border:       '0.5px solid var(--color-border)',
          borderRadius: 'var(--radius-md, 4px)',
          background:   'var(--color-bg)',
        }}
      />

      <p style={{
        margin:     '10px 0 0',
        fontFamily: 'var(--font-mono)',
        fontSize:   '11px',
        letterSpacing: '0.05em',
        color:      'var(--color-text-muted)',
      }}>
        Works best with room to pan and zoom &mdash;{' '}
        <a
          href={TOOL_SRC}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent-earth, #3CA3AE)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
        >
          open it full screen
        </a>.
      </p>

    </div>
  )
}
