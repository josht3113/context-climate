export default function AngleOfInsolation() {
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src="/angle-of-insolation.html"
        title="Angle of Insolation"
        style={{ width: '100%', height: 'calc(100vh - 56px)', border: 'none', display: 'block' }}
      />
    </div>
  )
}
