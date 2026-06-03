export default function PrecipHeatmapAnnual() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}precip-heatmap-annual.html`}
      style={{ width: '100%', border: 'none', display: 'block', height: 'calc(100vh - 52px)' }}
      title="Annual Precipitation Heatmap"
    />
  )
}
