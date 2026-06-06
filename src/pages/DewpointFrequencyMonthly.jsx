export default function DewpointFrequencyMonthly() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}dewpoint-frequency-monthly.html`}
      style={{ width: '100%', height: 'calc(100vh - 56px)', border: 'none', display: 'block' }}
      title="Monthly Dewpoint Frequency"
    />
  )
}
