import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function GlobalTemperatureContext() {
  // pass ?view=…&ref=…&yr=…&pins=… through so links can open a set view
  const search = useLocation().search

  useEffect(() => {
    document.title = 'Global Temperature in Context — ContextClimate'
  }, [])

  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src={`${import.meta.env.BASE_URL}global-temperature-context.html${search}`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Global Temperature in Context"
      />
    </div>
  )
}
