export default function Bowens() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-height))', width: '100%' }}
      <iframe
        src="/bowens_simulator.html"
        title="Bowen's Reaction Series Simulator"
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
