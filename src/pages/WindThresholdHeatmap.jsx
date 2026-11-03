import { useEffect } from 'react'

export default function WindThresholdHeatmap() {
  useEffect(() => {
    document.title = 'Wind Threshold Heatmap | ContextClimate'
  }, [])

  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src={`${import.meta.env.BASE_URL}wind-threshold-heatmap.html`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Wind Threshold Heatmap"
      />
    </div>
  )
}
