export default function SurfaceAnalysis() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}surface-analysis.html`}
      style={{
        width:   '100%',
        height:  'calc(100vh - 56px)',
        border:  'none',
        display: 'block',
      }}
      title="Surface Analysis Builder"
    />
  )
}
