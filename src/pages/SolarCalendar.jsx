export default function SolarCalendar() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}solar-calendar.html`}
      style={{ width: '100%', height: 'calc(100vh - 60px)', border: 'none', display: 'block' }}
      title="Solar Calendar"
    />
  )
}
