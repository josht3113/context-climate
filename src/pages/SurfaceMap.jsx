export default function SurfaceMap() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}surface-map.html`}
      style={{
        width:   '100%',
        height:  'calc(100vh - 56px)',
        border:  'none',
        display: 'block',
      }}
      title="Surface Map"
    />
  )
}
