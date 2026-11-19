import { useLocation } from 'react-router-dom'

export default function StreakTracker() {
  // pass ?st=…&streak=… through to the tool (links from Record Watch)
  const search = useLocation().search
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 56px)' }}>
      <iframe
        src={`${import.meta.env.BASE_URL}streak-tracker.html${search}`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Streak Tracker"
      />
    </div>
  )
}
