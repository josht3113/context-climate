export default function TurningSky() {
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src="/the-turning-sky.html"
        title="The Turning Sky"
        style={{ width: '100%', height: 'calc(100vh - 56px)', border: 'none', display: 'block' }}
      />
    </div>
  )
}
