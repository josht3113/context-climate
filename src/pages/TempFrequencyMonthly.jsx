export default function TempFrequencyMonthly() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}temp-frequency-monthly.html`}
      style={{ width: '100%', height: 'calc(100vh - 56px)', border: 'none', display: 'block' }}
      title="Monthly Temperature Frequency"
    />
  )
}
