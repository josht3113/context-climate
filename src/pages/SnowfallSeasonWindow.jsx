import { useState } from 'react'

export default function SnowfallSeasonWindow() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 56px)' }}>
      <iframe
        src={`${import.meta.env.BASE_URL}snowfall-season-window.html`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Snowfall Season Window"
      />
    </div>
  )
}
