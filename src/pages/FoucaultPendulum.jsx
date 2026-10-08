export default function FoucaultPendulum() {
  return (
    <div style={{ position: 'fixed', top: '56px', left: 0, right: 0, bottom: 0 }}>
      <iframe
        src="/foucault-pendulum.html"
        title="Foucault Pendulum"
        style={{ width: '100%', height: 'calc(100vh - 56px)', border: 'none', display: 'block' }}
      />
    </div>
  )
}

/*
  src/App.jsx — append at the end of each list:
    import FoucaultPendulum from './pages/FoucaultPendulum'
    <Route path="/earthandspace/foucault-pendulum" element={<FoucaultPendulum />} />

  src/pages/EarthAndSpace.jsx — append to the Astronomy › Observing the Sky subgroup's cards:
    {
      tags:        ['Earth\'s Rotation', 'Interactive'],
      title:       'Foucault Pendulum',
      description: 'Time-lapse a Foucault pendulum at any latitude and compare how fast, and which way, its swing turns from pole to equator.',
      footerTags:  ['Earth\'s Rotation', 'Latitude', 'Evidence'],
      to:          '/earthandspace/foucault-pendulum',
      thumb:       '/foucault_pendulum_thumbnail.png',
      status:      'live',
    },
*/
