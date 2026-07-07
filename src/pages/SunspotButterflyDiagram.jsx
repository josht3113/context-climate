export default function SunspotButterflyDiagram() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}sunspot-butterfly-diagram.html`}
      style={{ width: '100%', border: 'none', display: 'block', height: 'calc(100vh - 52px)' }}
      title="Sunspot Butterfly Diagram"
    />
  )
}
