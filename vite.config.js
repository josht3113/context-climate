import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ── Build stamp ───────────────────────────────────────────────────────────────
// Feeds the "Updated <Mon> <Year>" half of the hero's tool-count tag. Evaluated
// once, when this config loads at the start of a build, then substituted into
// the bundle by `define` below as a plain string literal. Derived rather than
// hand-typed for the same reason TOTAL_TOOLS is derived from countCards(): a
// number or date that has to be remembered is a number or date that goes stale.
//
// Caveat: this stamps every deploy, including one that only fixed a typo. That
// was the accepted trade against adding a per-card `lastUpdated` field.
//
// `define` does raw identifier substitution, so __BUILD_DATE__ only exists
// inside a Vite build — anything importing a page outside one (the jsdom
// integration tests mount Home and EarthAndSpace directly) sees an undefined
// global. src/pages/buildInfo.js owns that guard; read the date from there,
// never from __BUILD_DATE__ directly.
const BUILD_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'America/New_York',
}).format(new Date())

export default defineConfig({
  plugins: [react()],
  // This must match your GitHub repo name exactly
  base: '/',
  define: {
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
  },
})
