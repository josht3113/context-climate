export default function SeafloorSpreading() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}seafloor-spreading.html`}
      style={{
        width:   '100%',
        height:  'calc(100vh - 56px)',
        border:  'none',
        display: 'block',
      }}
      title="Seafloor Spreading"
    />
  )
}
