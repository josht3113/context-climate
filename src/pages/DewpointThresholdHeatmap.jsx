import { useState } from 'react'

export default function DewpointThresholdHeatmap() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 56px)' }}>
      <iframe
        src={`${import.meta.env.BASE_URL}dewpoint-threshold-heatmap.html`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Dewpoint Threshold Heatmap"
      />
    </div>
  )
}
