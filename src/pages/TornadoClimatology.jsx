import { Link } from 'react-router-dom'

export default function TornadoClimatology() {
  return (
    <div className="page-container">
      <section className="page-hero">
        <p className="page-eyebrow">Severe Weather Data Visualization</p>
        <h1 className="page-title">U.S. Tornado Climatology</h1>
        <p className="page-subtitle">
          National patterns from the NOAA/SPC severe weather database — annual trends, seasonal and diurnal timing, state-by-state rankings, and the records that define the historical record.
        </p>
      </section>
      <div style={{borderRadius:'var(--radius-md)', overflow:'hidden', border:'0.5px solid var(--color-border)'}}>
        <iframe src={import.meta.env.BASE_URL + 'us-tornado-climatology.html'} title="U.S. Tornado Climatology" style={{width:'100%', height:'2000px', border:'none', display:'block'}} loading="lazy" />
      </div>
      <p style={{fontSize:'0.75rem', color:'var(--color-text-muted)', margin:'1rem 0 0'}}>
        Source: NOAA/NWS Storm Prediction Center severe weather database, 1950–2022 · <Link to="/" style={{color:'inherit'}}>back to all tools</Link>
      </p>
    </div>
  )
}
