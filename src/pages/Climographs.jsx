import { useLocation } from 'react-router-dom'

export default function Climographs() {
  // pass ?city=…&compare=…&units=… through so links can open a city or pair
  const search = useLocation().search
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src={`${import.meta.env.BASE_URL}climograph-tool.html${search}`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Climographs"
      />
    </div>
  )
}
