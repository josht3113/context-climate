# ContextClimate — Project Context

Paste this file at the start of a new conversation to catch Claude up quickly.

---

## What this is
A personal weather and climate data visualization site built by Josh Timlin (josht3113 on GitHub). Separate from his teaching site (joshtimlin.com). The goal is interactive, data-forward charts anchored to Islip (KISP) with potential to expand geographically over time.

---

## Live site
- **URL:** https://contextclimate.io
- **Repo:** https://github.com/josht3113/context-climate
- **Hosting:** GitHub Pages with custom domain via Namecheap
- **Deploys:** Automatically via GitHub Actions on push to main

---

## Stack
- Vite + React
- React Router (HashRouter — required for GitHub Pages)
- CSS Modules for component styles
- Google Fonts: Barlow Condensed (display), Barlow (body), IBM Plex Mono (data/labels)
- No component library — everything custom

---

## Design system
- **Theme:** Dark background (#0f1117), not light
- **Accent colors per section:**
  - Hourly Data → blue (#378ADD)
  - Climate → amber (#BA7517)
  - ENSO → purple (#7F77DD)
  - Seasons → coral (#D85A30)
  - Live → teal (#1D9E75)
- **Logo:** Bracket mark SVG `[ ]` in blue, next to "ContextClimate" in Barlow Condensed
- **Geo badge:** "ISP · LI · NYC" in monospace, blue-tinted, sits right of nav separated by a divider
- **Favicon:** Heatmap grid concept (Concept B from logo exploration) — not yet implemented
- **Cards:** Dark surface (#171b24), 2px colored top accent bar, monospace tags, arrow footer

---

## Site structure
| Route | Page | Status |
|-------|------|--------|
| `/` | Home (card grid overview) | Live |
| `/hourly` | ISP Hourly Heatmaps | Stub — heatmap migration pending |
| `/climate` | Climate Charts | Stub |
| `/enso` | ENSO & Winter Analysis | Stub |
| `/seasons` | Seasons Analysis | Stub |
| `/live` | Live Conditions | Stub — future auto-updating feature |

---

## Key files
```
src/
  App.jsx                  # Router + page layout shell
  index.css                # Global tokens, reset, shared helpers
  components/
    Header.jsx             # Nav + bracket logo + geo badge
    Header.module.css
  pages/
    Home.jsx               # Card grid with CARDS and META arrays
    Home.module.css
    HourlyData.jsx         # Stub
    Climate.jsx            # Stub
    ENSO.jsx               # Stub
    Seasons.jsx            # Stub
    Live.jsx               # Stub
.github/workflows/
  deploy.yml               # GitHub Actions build + deploy
vite.config.js             # base: '/' (custom domain, not repo subpath)
CNAME                      # contextclimate.io
```

---

## Existing apps (separate repos)
| App | Repo | Status |
|-----|------|--------|
| ISP Hourly Heatmap | josht3113/Islip-Monthly-Charts | Ready to migrate into context-climate |
| ISP Precip Charts | josht3113/Islip-Precip-Charts | Data issues — not ready |
| NYC Precip Charts | josht3113/NYC-Precip-Charts | Started, left at deploy diagnostics |

**Migration plan:** Move heatmap code fully into `src/pages/HourlyData.jsx` (not iframe). Data files move into the same repo. One codebase going forward.

---

## Decisions made
- `.io` domain over `.com` (taken) or `.net`
- Bracket mark for header logo; heatmap grid reserved for favicon
- Dark theme chosen and locked in
- HashRouter used (not BrowserRouter) — GitHub Pages doesn't support server-side routing
- No component library — keeping it lean and custom
- Geo badge on right side of nav (Variation 2 from header mockup session)
- Teaching content (joshtimlin.com) kept fully separate from this site

---

## What's next
1. Migrate ISP Hourly Heatmap into `/hourly` page
2. Implement heatmap grid as favicon
3. Fill in Climate, ENSO, Seasons pages
4. Live Conditions page (auto-updating via NWS / Open-Meteo API)
