import { useLocation } from 'react-router-dom'

export default function SunsPath() {
  const { search } = useLocation()   // passes ?lat=…&day=… through to the tool (Seasons Explorer link)
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src={`/the-suns-path.html${search}`}
        title="The Sun's Path"
        style={{ width: '100%', height: 'calc(100vh - 56px)', border: 'none', display: 'block' }}
      />
    </div>
  )
}
