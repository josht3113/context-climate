import { useLocation } from 'react-router-dom'

export default function CurrentConditions() {
  // pass ?st=…&tab=…&date=… through to the tool (links from Record Watch)
  const search = useLocation().search
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src={`${import.meta.env.BASE_URL}current-conditions.html${search}`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Current Conditions"
      />
    </div>
  )
}
