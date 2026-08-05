import { useState } from 'react'

export default function WinterPrecipTypes() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 56px)' }}>
      <iframe
        src={`${import.meta.env.BASE_URL}winter-precip-types.html`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Winter Precipitation Types"
      />
    </div>
  )
}
