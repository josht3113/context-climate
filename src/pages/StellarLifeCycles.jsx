import { useLocation } from 'react-router-dom'

export default function StellarLifeCycles() {
  const { search } = useLocation()   // passes ?m=…&mode=… through to the tool (cross-tool links)
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src={`/stellar-life-cycles.html${search}`}
        title="Stellar Life Cycles"
        style={{ width: '100%', height: 'calc(100vh - 56px)', border: 'none', display: 'block' }}
      />
    </div>
  )
}
