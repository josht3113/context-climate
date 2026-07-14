export default function HubblesLawExplorer() {
  return (
    <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0 }}>
      <iframe
        src="/hubbles-law-explorer.html"
        title="Hubble's Law Explorer"
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  )
}
