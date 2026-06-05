export default function CurrentConditions() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}current-conditions.html`}
      style={{ width: '100%', height: '100vh', border: 'none', display: 'block' }}
      title="Current Conditions"
    />
  )
}
