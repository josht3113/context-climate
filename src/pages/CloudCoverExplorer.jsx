export default function CloudCoverExplorer() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}cloud-cover-explorer.html`}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="Cloud Cover Explorer"
    />
  )
}
