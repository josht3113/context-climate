export default function PlanetaryRetrograde() {
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0, zIndex: 0 }}>
      <iframe
        src="/planetary-retrograde.html"
        title="Planetary Retrograde Motion"
        style={{ border: 'none', display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  )
}
