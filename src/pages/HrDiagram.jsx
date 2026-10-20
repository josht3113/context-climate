import { useLocation } from 'react-router-dom'

export default function HrDiagram() {
  const { search } = useLocation()   // passes ?a=…&b=…&view=… through to the tool (cross-tool links)
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src={`/hr-diagram.html${search}`}
        title="H-R Diagram"
        style={{ width: '100%', height: 'calc(100vh - 56px)', border: 'none', display: 'block' }}
      />
    </div>
  )
}
