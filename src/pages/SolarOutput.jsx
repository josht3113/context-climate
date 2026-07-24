// Wraps the standalone public/solar-output.html tool (Core Sample design
// system, two panels: TSI solar-cycle context + live surface irradiance
// at Islip). Iframe pattern matches the site's other standalone-HTML tools.

export default function SolarOutput() {
  return (
    <div className="page-container">

      <section className="page-hero">
        <p className="page-eyebrow">Solar</p>
        <h1 className="page-title">Solar Output</h1>
        <p className="page-subtitle">
          The Sun's total energy output across the 11-year solar cycle, plus a live look
          at how much of that energy is actually reaching the ground right now.
        </p>
      </section>

      <iframe
        src={`${import.meta.env.BASE_URL}solar-output.html`}
        title="Solar Output"
        style={{
          width: '100%',
          height: '1100px',
          border: 'none',
          display: 'block',
        }}
      />

    </div>
  )
}
