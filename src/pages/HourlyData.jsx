// ── Hourly Data page ──────────────────────────────────────────────────────
// Embeds the existing ISP Heatmap app via iframe — preserves all features
// (Single Year, Multi-Year Avg, Climatology, copy-to-image, etc.) exactly
// as they appear at josht3113.github.io/Islip-Monthly-Charts/
//
// If you later want to fully port the component into React, replace the
// <iframe> block below with the native component.

export default function HourlyData() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-height))' }}>
      <iframe
        src="https://josht3113.github.io/Islip-Monthly-Charts/"
        title="ISP Hourly Heatmaps"
        style={{
          flex: 1,
          width: '100%',
          border: 'none',
          display: 'block',
        }}
      />
    </div>
  )
}
