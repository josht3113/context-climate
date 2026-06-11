export default function SiderealSynodicMonth() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}sidereal-synodic-month.html`}
      style={{
        width:   '100%',
        height:  'calc(100vh - 56px)',
        border:  'none',
        display: 'block',
      }}
      title="Sidereal vs Synodic Month"
    />
  )
}
