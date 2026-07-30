export default function Climographs() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}climograph-tool.html`}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="Climographs"
    />
  )
}
