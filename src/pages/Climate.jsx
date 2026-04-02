// ── Climate page ───────────────────────────────────────────────────────────
// Embeds the existing ISP Annual Heatmap app via iframe — preserves all
// features exactly as they appear at:
// josht3113.github.io/Islip-Yearly-Heat-Map/annual.html

export default function Climate() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-height))' }}>
      <iframe
        src="https://josht3113.github.io/Islip-Yearly-Heat-Map/annual.html"
        title="ISP Annual Heatmap"
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
