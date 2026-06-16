export default function HurricaneSteering() {
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0, zIndex: 0 }}>
      <iframe
        src="/hurricane_steering.html"
        title="Hurricane Steering Currents"
        style={{ border: 'none', display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  )
}
