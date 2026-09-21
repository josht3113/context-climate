export default function DopplerShiftChallenge() {
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src="/doppler-shift-challenge.html"
        title="Doppler Shift Challenge"
        style={{ width: '100%', height: 'calc(100vh - 56px)', border: 'none', display: 'block' }}
      />
    </div>
  )
}
