import { useLocation } from 'react-router-dom'

export default function ESSRT_5() {
  const { search } = useLocation()   // passes ?m=… through to the tool (cross-tool links)
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src={`/ESSRT_5.html${search}`}
        title="ESSRT Page 5 — Life Cycles of Stars"
        style={{ width: '100%', height: 'calc(100vh - 56px)', border: 'none', display: 'block' }}
      />
    </div>
  )
}
