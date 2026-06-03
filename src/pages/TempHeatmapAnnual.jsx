export default function TempHeatmapAnnual() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}OG-heatmap-annual.html`}
      style={{ width: '100%', border: 'none', display: 'block', height: 'calc(100vh - 52px)' }}
      title="Annual Temperature Heatmap"
    />
  )
}
