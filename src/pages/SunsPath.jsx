export default function SunsPath() {
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src="/the-suns-path.html"
        title="The Sun's Path"
        style={{ width: '100%', height: 'calc(100vh - 56px)', border: 'none', display: 'block' }}
      />
    </div>
  )
}
