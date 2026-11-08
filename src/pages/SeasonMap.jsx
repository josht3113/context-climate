import { useLocation } from 'react-router-dom'

export default function SeasonMap() {
  // pass ?d=YYYY-MM-DD&thr=…&st=…&fill=1 through to the tool
  const search = useLocation().search
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src={`${import.meta.env.BASE_URL}season-map.html${search}`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="US Season Map"
      />
    </div>
  )
}
