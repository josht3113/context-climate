export default function FallFoliage() {
  return (
    <iframe
      src={`${import.meta.env.BASE_URL}fall-foliage.html`}
      style={{ width: '100%', height: 'calc(100vh - 60px)', border: 'none', display: 'block' }}
      title="Fall Foliage"
    />
  )
}
