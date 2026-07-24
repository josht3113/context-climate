export default function DewpointClimatology() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}dewpoint-climatology.html`}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="Daily Dewpoint Climatology"
    />
  )
}
