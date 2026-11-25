import { useLocation } from 'react-router-dom'

export default function SolarCycleProgression() {
  // pass ?tab=… through so links can open a specific view
  const search = useLocation().search
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src={`${import.meta.env.BASE_URL}solar-cycle-progression.html${search}`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Solar Cycle Progression"
      />
    </div>
  )
}
