export default function HomerunDerby() {
  return (
    <div style={{ width: '100%', height: 'calc(100dvh - 60px)', overflow: 'hidden' }}>
      <iframe
        src={`${import.meta.env.BASE_URL}homerun-derby.html`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Homerun Derby Simulator"
        allow="fullscreen"
      />
    </div>
  )
}
