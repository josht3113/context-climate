import { Link } from 'react-router-dom'

export default function OutbreakExplorer() {
  return (
    <div className="page-container">
      <section className="page-hero">
        <p className="page-eyebrow">Severe Weather Data Visualization</p>
        <h1 className="page-title">Tornado Outbreak Explorer</h1>
        <p className="page-subtitle">
          The days the sky broke loose — ranked outbreak days, a year-by-year intensity timeline, and a full track-by-track sequence for every major outbreak in the NOAA/SPC record.
        </p>
      </section>
      <div style={{borderRadius:'var(--radius-md)', overflow:'hidden', border:'0.5px solid var(--color-border)'}}>
        <iframe src={import.meta.env.BASE_URL + 'tornado-outbreak-explorer.html'} title="Tornado Outbreak Explorer" style={{width:'100%', height:'2400px', border:'none', display:'block'}} loading="lazy" />
      </div>
      <p style={{fontSize:'0.75rem', color:'var(--color-text-muted)', margin:'1rem 0 0'}}>
        Source: NOAA/NWS Storm Prediction Center severe weather database, 1950–2022 · <Link to="/" style={{color:'inherit'}}>back to all tools</Link>
      </p>
    </div>
  )
}
