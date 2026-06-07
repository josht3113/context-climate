import { useEffect } from 'react';

export default function EnsoHeatmap() {
  useEffect(() => {
    document.title = 'ENSO Heatmap · Context Climate';
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <iframe
        src={`${import.meta.env.BASE_URL}enso-heatmap.html`}
        title="ENSO Heatmap"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
      />
    </div>
  );
}
