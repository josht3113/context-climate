export default function TropicalACE() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}tropical-ace.html`}
      style={{ width: '100%', height: 'calc(100vh - 60px)', border: 'none', display: 'block' }}
      title="Tropical ACE Tracker"
    />
  )
}
