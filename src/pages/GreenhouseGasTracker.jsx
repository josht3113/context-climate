export default function GreenhouseGasTracker() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-height))' }}>
      <iframe
        src="/greenhouse-gas-tracker.html"
        title="Greenhouse Gas Tracker"
        style={{ flex: 1, width: '100%', border: 'none', display: 'block' }}
      />
    </div>
  )
}
