import { useState } from 'react'

export default function UsPrecipYears() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 56px)' }}>
      <iframe
        src={`${import.meta.env.BASE_URL}us-precip-years.html`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="U.S. Annual Precipitation"
      />
    </div>
  )
}
