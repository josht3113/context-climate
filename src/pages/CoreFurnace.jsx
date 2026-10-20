import { useLocation } from 'react-router-dom'

export default function CoreFurnace() {
  // the tool keeps its state in #s=…, which the HashRouter URL can't carry, so links send ?s=… instead
  const s = new URLSearchParams(useLocation().search).get('s')
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
        src={`${import.meta.env.BASE_URL}core-furnace.html${s ? '#s=' + s : ''}`}
        title="The Core Furnace"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      />
    </div>
  );
}
