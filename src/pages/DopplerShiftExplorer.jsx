export default function DopplerShiftExplorer() {
  return (
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0 }}>
      <iframe
        src="/doppler-shift-explorer.html"
        title="Doppler Shift Explorer"
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  )
}
