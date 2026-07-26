export default function GlobalCloudCoverTrend() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}global-cloud-cover-trend.html`}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="Global Cloud Cover Trend"
    />
  )
}
