import { useEffect } from 'react'

export default function SlpHeatmap() {
  useEffect(() => {
    document.title = 'Sea Level Pressure Heatmap | ContextClimate'
  }, [])

  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src={`${import.meta.env.BASE_URL}slp-heatmap.html`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Sea Level Pressure Heatmap"
      />
    </div>
  )
}
