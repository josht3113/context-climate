export default function TemperatureClimatology() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}temperature-climatology.html`}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="Daily Temperature Climatology"
    />
  )
}
