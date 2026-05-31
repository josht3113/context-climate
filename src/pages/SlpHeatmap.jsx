import { useEffect } from 'react'

export default function SlpHeatmap() {
  useEffect(() => {
    document.title = 'Sea Level Pressure Heatmap | ContextClimate'
  }, [])

  return (
    <iframe
      src={`${import.meta.env.BASE_URL}slp-heatmap.html`}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="Sea Level Pressure Heatmap"
    />
  )
}
