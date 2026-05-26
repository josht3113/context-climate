import { useState } from 'react'

export default function WindHourHeatmap() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 56px)' }}>
      <iframe
        src={`${import.meta.env.BASE_URL}wind-hour-heatmap.html`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Wind by Hour Heatmap"
      />
    </div>
  )
}
