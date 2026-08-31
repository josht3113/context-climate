export default function CoreFurnace() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 56,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      <iframe
        src={`${import.meta.env.BASE_URL}core-furnace.html`}
        title="The Core Furnace"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      />
    </div>
  );
}
