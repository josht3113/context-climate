import { useState } from 'react'

export default function radioactive_decay_simulator() {
  return (
    <iframe
      src={`${process.env.PUBLIC_URL}/radioactive_decay_simulator.html`}
      style={{ width:'100%', height:'100vh', border:'none', display:'block' }}
      title="Radioactive Decay Simulator"
    />
  )
}
