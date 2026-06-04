import { useEffect } from 'react'

export default function SunriseSunsetCalendar() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}sunrise-sunset-calendar.html`}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="Sunrise & Sunset Calendar"
    />
  )
}
