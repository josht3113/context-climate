export default function PrecipHeatmapMonthly() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}precip-heatmap-monthly.html`}
      style={{ width: '100%', border: 'none', display: 'block', height: 'calc(100vh - 52px)' }}
      title="Monthly Precipitation Heatmap"
    />
  )
}
