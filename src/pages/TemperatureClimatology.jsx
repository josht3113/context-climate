import { useLocation } from 'react-router-dom'

export default function TemperatureClimatology() {
  // pass ?st=…&yr=…&ax=…&u=… through so links can open a station and view
  const search = useLocation().search
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src={`${import.meta.env.BASE_URL}temperature-climatology.html${search}`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Daily Temperature Climatology"
      />
    </div>
  )
}
