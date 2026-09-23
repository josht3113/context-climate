// ── buildInfo ────────────────────────────────────────────────────────────────
// The one place that reads the build stamp Vite injects (see vite.config.js).
//
// `define` replaces the __BUILD_DATE__ *identifier* with a string literal at
// build time — it does not create a real global. So any code path that loads a
// page outside a Vite build hits an undefined identifier and throws a
// ReferenceError: the jsdom integration tests mount Home.jsx and
// EarthAndSpace.jsx directly, and would take all 33 of them down with it.
//
// `typeof` is the only safe way to probe an identifier that may not exist
// (esbuild constant-folds `typeof "Sep 2026"` to `"string"` inside a build, and
// plain node evaluates it to `"undefined"` outside one). Everything reads
// BUILD_DATE from here so that guard exists exactly once.
//
// Empty string outside a build — callers should treat it as "no stamp" and
// render nothing rather than a placeholder.
export const BUILD_DATE =
  typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : ''
