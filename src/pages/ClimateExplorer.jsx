export default function ClimateExplorer() {
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src={`${import.meta.env.BASE_URL}climate-explorer.html`}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        title="Climate Record Explorer"
      />
    </div>
  )
}
