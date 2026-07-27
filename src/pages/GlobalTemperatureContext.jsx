import { useEffect } from 'react'

// Standalone tool lives at public/global-temperature-context.html — this
// wrapper just iframes it in, same pattern as the other self-contained
// Plotly/canvas tools (see EnsoSpaghetti, GlobalCloudCoverTrend, etc.).

export default function GlobalTemperatureContext() {
  useEffect(() => {
    document.title = 'Global Temperature in Context — ContextClimate'
  }, [])

  return (
    <iframe
      src={`${import.meta.env.BASE_URL}global-temperature-context.html`}
      title="Global Temperature in Context"
      style={{
        display: 'block',
        width: '100%',
        height: '100vh',
        border: 'none',
      }}
    />
  )
}
