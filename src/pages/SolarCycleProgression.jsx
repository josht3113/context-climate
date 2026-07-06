export default function SolarCycleProgression() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}solar-cycle-progression.html`}
      style={{ width: '100%', border: 'none', display: 'block', height: 'calc(100vh - 52px)' }}
      title="Solar Cycle Progression"
    />
  )
}
