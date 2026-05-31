import { useState } from 'react'

export default function TempThresholdHeatmap() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 56px)' }}>
      <iframe
        src={`${import.meta.env.BASE_URL}temp-threshold-heatmap.html`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Temperature Threshold Heatmap"
      />
    </div>
  )
}
