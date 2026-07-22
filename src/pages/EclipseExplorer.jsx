export default function EclipseExplorer() {
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src="/eclipse-explorer.html"
        title="Eclipse Explorer"
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  )
}
