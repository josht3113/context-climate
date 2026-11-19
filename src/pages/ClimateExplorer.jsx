import { useLocation } from 'react-router-dom'

export default function ClimateExplorer() {
  // pass ?st=…&v=…&stat=…&p=…&order=…&y=… through to the tool (links from Record Watch)
  const search = useLocation().search
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src={`${import.meta.env.BASE_URL}climate-explorer.html${search}`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Climate Record Explorer"
      />
    </div>
  )
}
