import { useEffect } from 'react'

export default function WindThresholdHeatmap() {
  useEffect(() => {
    document.title = 'Wind Threshold Heatmap | ContextClimate'
  }, [])

  return (
    <iframe
      src={`${import.meta.env.BASE_URL}wind-threshold-heatmap.html`}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="Wind Threshold Heatmap"
    />
  )
}
