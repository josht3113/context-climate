export default function SunspotHeatmap() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}sunspot-heatmap.html`}
      style={{ width: '100%', border: 'none', display: 'block', height: 'calc(100vh - 52px)' }}
      title="Solar Sunspot Numbers"
    />
  )
}
