export default function KelvinWaveExplainer() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 56px)' }}>
      <iframe
        src={`${import.meta.env.BASE_URL}kelvin-wave-explainer.html`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Kelvin Wave & ENSO Cycle Explainer"
      />
    </div>
  )
}
