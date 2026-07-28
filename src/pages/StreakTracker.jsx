import { useState } from 'react'

export default function StreakTracker() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 56px)' }}>
      <iframe
        src={`${import.meta.env.BASE_URL}streak-tracker.html`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Streak Tracker"
      />
    </div>
  )
}
