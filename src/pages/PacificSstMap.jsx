export default function PacificSstMap() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}pacific-sst-anomaly-map.html`}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="Pacific SST Anomaly Map"
    />
  )
}
