import { useLocation } from 'react-router-dom'

export default function SnowMap() {
  // pass ?mode=season&field=cover&th=…&d=…&st=… through to the tool
  const search = useLocation().search
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src={`${import.meta.env.BASE_URL}snow-map.html${search}`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="US Snow Map"
      />
    </div>
  )
}
