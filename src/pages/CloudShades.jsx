export default function CloudShades() {
  return (
    <div style={{ width: '100%', height: 'calc(100vh - 56px)' }}>
      <iframe
        src={`${import.meta.env.BASE_URL}cloud-shades.html`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Cloud Shades"
      />
    </div>
  )
}
