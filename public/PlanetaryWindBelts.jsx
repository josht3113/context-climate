export default function PlanetaryWindBelts() {
  // BASE_URL rather than a leading slash, so the iframe resolves correctly
  // whether the app is served from the domain root or from a sub-path such as
  // /context-climate/. With base '/' this produces exactly the same URL the
  // other wrappers use.
  const src = `${import.meta.env.BASE_URL}planetary-wind-belts.html`
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src={src}
        title="Planetary Wind Belts"
        style={{ width: '100%', height: 'calc(100vh - 56px)', border: 'none', display: 'block' }}
      />
    </div>
  )
}
