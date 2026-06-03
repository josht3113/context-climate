export default function TempHeatmapMonthly() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}OG-heatmap-monthly.html`}
      style={{ width: '100%', border: 'none', display: 'block', height: 'calc(100vh - 52px)' }}
      title="Monthly Temperature Heatmap"
    />
  )
}
