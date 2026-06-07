export default function EnsoSpaghetti() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}enso-analog-spaghetti.html`}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="ENSO Analog Spaghetti"
    />
  )
}
