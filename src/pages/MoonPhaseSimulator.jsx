export default function MoonPhaseSimulator() {
  return (
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0 }}>
      <iframe
        src="/moon-phase-simulator.html"
        title="Lunar Phase Simulator"
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  )
}
