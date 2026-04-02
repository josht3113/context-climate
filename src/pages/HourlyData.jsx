import { useState, useMemo, useEffect } from 'react'

// ── Constants ──────────────────────────────────────────────────────────────
const BASE = 'https://josht3113.github.io/Islip-Monthly-Charts/'
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const FMONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const HOURS = ['Midnight','1','2','3','4','5','6','7','8','9','10','11','Noon','1','2','3','4','5','6','7','8','9','10','11']
const YEARS = Array.from({ length: 2026 - 1973 + 1 }, (_, i) => 1973 + i)

// Cell / column dimensions
const CW = 29   // cell width px
const CH = 26   // cell height px
const LW = 72   // hour label width px
const AW = 47   // avg column width px

// ── Data types ─────────────────────────────────────────────────────────────
const DTYPES = [
  { id: 'temp',      label: 'Temperature',       fmt: v => v == null ? '' : String(Math.round(v)) },
  { id: 'td',        label: 'Dewpoint',           fmt: v => v == null ? '' : String(Math.round(v)) },
  { id: 'clouds',    label: 'Cloud Cover',        fmt: () => '' },
  { id: 'wind',      label: 'Wind Speed',         fmt: v => v == null ? '' : String(Math.round(v)) },
  { id: 'temp_anom', label: 'Temp Anomaly',       fmt: v => { if (v == null) return ''; const r = Math.round(v); return (r > 0 ? '+' : '') + r } },
  { id: 'td_anom',   label: 'Dewpoint Anomaly',   fmt: v => { if (v == null) return ''; const r = Math.round(v); return (r > 0 ? '+' : '') + r } },
  { id: 'temp_z',    label: 'Temp Std Dev',       fmt: v => v == null ? '' : v.toFixed(1) },
  { id: 'td_z',      label: 'Dewpoint Std Dev',   fmt: v => v == null ? '' : v.toFixed(1) },
]

const CLIMO_DTYPES = ['temp', 'td', 'clouds', 'wind']

// ── Color scales ───────────────────────────────────────────────────────────
const SCALES = {
  temp:      { vals: [-5,25,50,75,102],                              cols: ['#FFB3C6','#A8D4F0','#5DBF6A','#FFE033','#D41A1A'] },
  td:        { vals: [-25,5,18,30,55,68,80],                        cols: ['#4A3410','#B89870','#D4C060','#FFEE00','#3DB84A','#2A8C30','#2A72C8'] },
  clouds:    { vals: [1,2,3,4,5],                                    cols: ['#F5FA82','#C5C46A','#848477','#626258','#404040'] },
  wind:      { vals: [0,5,10,15,20,25,30,55],                       cols: ['#232323','#545E6B','#7D9BB5','#B4C8E3','#CEB8CC','#E09999','#E3625C','#FFE033'] },
  temp_anom: { vals: [-40,-24,-16,-10,-4,0,4,10,16,24,40],          cols: ['#FFB3C6','#6AAACF','#3E7AAA','#1E4A72','#0D2238','#0D1218','#38120A','#962010','#D03A18','#F05030','#FFE000'] },
  td_anom:   { vals: [-30,-15,-5,0,5,15,30],                        cols: ['#C8920A','#8C6208','#3D2A02','#2B2200','#2A3800','#4A6A00','#7DC840'] },
  temp_z:    { vals: [-5,-3,-2,-1.2,-0.5,0,0.5,1.2,2,3,5],         cols: ['#FFB3C6','#6AAACF','#3E7AAA','#1E4A72','#0D2238','#0D1218','#38120A','#962010','#D03A18','#F05030','#FFE000'] },
  td_z:      { vals: [-5,-3,-2,-1.2,-0.5,0,0.5,1.2,2,3,5],         cols: ['#FFB3C6','#68A8CC','#3C78A8','#1C4870','#0C2036','#0D1218','#38120A','#942010','#CC3816','#EE4E2E','#FFE000'] },
}

// ── Color helpers ──────────────────────────────────────────────────────────
function h2r(h) { return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)] }
function lrp(a, b, t) { return Math.round(a + (b - a) * t) }

function getColor(val, sc) {
  if (val == null) return '#111'
  const { vals: vs, cols: cs } = sc
  if (val <= vs[0]) return cs[0]
  if (val >= vs[vs.length - 1]) return cs[cs.length - 1]
  for (let i = 0; i < vs.length - 1; i++) {
    if (val >= vs[i] && val <= vs[i + 1]) {
      const t = (val - vs[i]) / (vs[i + 1] - vs[i])
      const a = h2r(cs[i]), b = h2r(cs[i + 1])
      return `rgb(${lrp(a[0],b[0],t)},${lrp(a[1],b[1],t)},${lrp(a[2],b[2],t)})`
    }
  }
  return cs[cs.length - 1]
}

function txtCol(dt) { return (dt === 'temp' || dt === 'td') ? '#000' : '#fff' }

function gradCss(sc) {
  const lo = sc.vals[0], span = sc.vals[sc.vals.length - 1] - lo
  return 'linear-gradient(to right,' + sc.cols.map((c, i) => `${c} ${((sc.vals[i] - lo) / span * 100).toFixed(1)}%`).join(',') + ')'
}

function rowAvg(arr, n) {
  const v = arr.slice(0, n).filter(x => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

// ── Styles (inline, referencing CSS vars where possible) ───────────────────
const S = {
  page: {
    background: 'var(--color-bg)',
    minHeight: '100vh',
    fontFamily: 'var(--font-body)',
    color: 'var(--color-text-primary)',
  },
  card: {
    background: 'var(--color-surface)',
    border: '0.5px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    padding: '20px 24px',
    marginBottom: '20px',
  },
  controlRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  label: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--color-text-muted)',
  },
  select: {
    background: 'var(--color-surface-2)',
    border: '0.5px solid var(--color-border-hover)',
    color: 'var(--accent-hourly)',
    padding: '4px 10px',
    fontSize: 13,
    cursor: 'pointer',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-body)',
    fontWeight: 700,
  },
  gridWrap: {
    overflowX: 'auto',
    display: 'inline-block',
    maxWidth: '100%',
    border: '0.5px solid var(--color-border-hover)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
  },
  gridInner: {
    display: 'inline-block',
    minWidth: 'max-content',
    background: '#0A0A0A',
  },
  row: { display: 'flex', alignItems: 'center' },
  hdrCell: {
    width: CW, flexShrink: 0,
    textAlign: 'center',
    color: 'var(--color-text-secondary)',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    lineHeight: CH + 'px',
  },
  hourLabel: {
    width: LW, flexShrink: 0,
    textAlign: 'right',
    paddingRight: 8,
    color: 'var(--color-text-secondary)',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    lineHeight: CH + 'px',
    background: '#0A0A0A',
    whiteSpace: 'nowrap',
  },
  avgLabel: {
    width: AW, flexShrink: 0,
    textAlign: 'center',
    color: '#FFD700',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    lineHeight: CH + 'px',
  },
  spacer: { width: 8, flexShrink: 0, background: '#0A0A0A' },
}

// ── Month pill button ──────────────────────────────────────────────────────
function MonthBtn({ m, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(55,138,221,0.15)' : 'transparent',
        border: `0.5px solid ${active ? 'var(--accent-hourly)' : 'var(--color-border)'}`,
        color: active ? 'var(--accent-hourly)' : 'var(--color-text-muted)',
        padding: '3px 11px',
        fontSize: 12,
        cursor: 'pointer',
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-body)',
        fontWeight: 600,
        transition: 'all 0.12s',
      }}
    >
      {m}
    </button>
  )
}

// ── Variable pill button ───────────────────────────────────────────────────
function DtBtn({ d, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(255,215,0,0.08)' : 'transparent',
        border: `0.5px solid ${active ? '#FFD700' : 'var(--color-border)'}`,
        color: active ? '#FFD700' : 'var(--color-text-muted)',
        padding: '3px 9px',
        fontSize: 11,
        cursor: 'pointer',
        borderRadius: 'var(--radius-sm)',
        fontFamily: 'var(--font-body)',
        whiteSpace: 'nowrap',
        transition: 'all 0.12s',
      }}
    >
      {d.label}
    </button>
  )
}

// ── Single heatmap cell ────────────────────────────────────────────────────
function Cell({ val, sc, dtObj, dt }) {
  const bg = getColor(val, sc)
  return (
    <div style={{
      width: CW, height: CH, flexShrink: 0,
      background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, color: txtCol(dt), fontWeight: 700,
      fontFamily: 'var(--font-mono)',
      borderRight: '1px solid rgba(0,0,0,0.3)',
      borderBottom: '1px solid rgba(0,0,0,0.3)',
      userSelect: 'none',
    }}>
      {dtObj.fmt(val)}
    </div>
  )
}

// ── The heatmap grid (shared between inline + modal) ───────────────────────
function HeatGrid({ grid, nDays, sc, dt, dtObj, rowAvgs, colAvgs, overall }) {
  const headerRow = (
    <div style={S.row}>
      <div style={{ width: LW, flexShrink: 0 }} />
      {Array.from({ length: nDays }, (_, i) => (
        <div key={i} style={S.hdrCell}>{i + 1}</div>
      ))}
      <div style={S.spacer} />
      <div style={{ ...S.avgLabel }}>Avg</div>
    </div>
  )

  const dataRows = HOURS.map((lbl, h) => {
    const ra = rowAvgs[h]
    return (
      <div key={h} style={S.row}>
        <div style={S.hourLabel}>{lbl}</div>
        {Array.from({ length: nDays }, (_, d) => {
          const val = grid[h]?.[d] ?? null
          return <Cell key={d} val={val} sc={sc} dtObj={dtObj} dt={dt} />
        })}
        <div style={{ ...S.spacer, height: CH, borderBottom: '1px solid rgba(255,255,255,0.04)' }} />
        <div style={{
          width: AW, height: CH, flexShrink: 0,
          background: getColor(ra, sc),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: txtCol(dt), fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          borderLeft: '1px solid rgba(255,215,0,0.2)',
          borderBottom: '1px solid rgba(0,0,0,0.3)',
        }}>
          {dtObj.fmt(ra)}
        </div>
      </div>
    )
  })

  const avgRow = (
    <div style={S.row}>
      <div style={{ ...S.hourLabel, color: '#FFD700' }}>Avg</div>
      {colAvgs.map((ca, d) => (
        <div key={d} style={{
          width: CW, height: CH, flexShrink: 0,
          background: getColor(ca, sc),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: txtCol(dt), fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          borderTop: '1px solid rgba(255,215,0,0.2)',
          borderRight: '1px solid rgba(0,0,0,0.3)',
        }}>
          {dtObj.fmt(ca)}
        </div>
      ))}
      <div style={S.spacer} />
      <div style={{
        width: AW, height: CH, flexShrink: 0,
        background: getColor(overall, sc),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, color: txtCol(dt), fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        borderTop: '1px solid rgba(255,215,0,0.2)',
        borderLeft: '1px solid rgba(255,215,0,0.2)',
      }}>
        {dtObj.fmt(overall)}
      </div>
    </div>
  )

  return (
    <div style={S.gridInner}>
      {headerRow}
      {dataRows}
      <div style={{ height: 4, background: '#0A0A0A' }} />
      {avgRow}
    </div>
  )
}

// ── Modal overlay ──────────────────────────────────────────────────────────
function Modal({ onClose, children }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.88)', zIndex: 1000,
        overflowY: 'auto', display: 'flex',
        alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 16px', boxSizing: 'border-box',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0A0A0A',
          border: '0.5px solid rgba(255,255,255,0.25)',
          borderRadius: 'var(--radius-md)',
          padding: '20px',
          position: 'relative',
          display: 'inline-block',
          maxWidth: '100%',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 10, right: 10,
            background: 'var(--color-surface-2)',
            border: '0.5px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            width: 28, height: 28,
            cursor: 'pointer', fontSize: 18,
            lineHeight: '28px', textAlign: 'center',
            borderRadius: 'var(--radius-sm)',
          }}
        >×</button>
        {children}
      </div>
    </div>
  )
}

// ── Main page component ────────────────────────────────────────────────────
export default function HourlyData() {
  const [year, setYear]         = useState(2026)
  const [month, setMonth]       = useState('Jan')
  const [dt, setDt]             = useState('temp')
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [err, setErr]           = useState(null)
  const [showModal, setShowModal] = useState(false)

  const isClimo = year === 'climo'

  // Fetch year JSON from the existing GitHub Pages data source
  useEffect(() => {
    setLoading(true); setErr(null); setData(null)
    const url = isClimo ? `${BASE}climo.json` : `${BASE}${year}.json`
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
      .then(d => { setData(d); setLoading(false) })
      .catch(ex => { setErr(ex.message); setLoading(false) })
  }, [year])

  const md     = data?.[month]
  const nDays  = md?.nDays ?? 31
  const grid   = md?.[dt] ?? null
  const sc     = SCALES[dt]
  const dtObj  = DTYPES.find(d => d.id === dt)
  const isAnom = dt === 'temp_anom' || dt === 'td_anom' || dt === 'temp_z' || dt === 'td_z'
  const mIdx   = MONTHS.indexOf(month)
  const lo     = sc.vals[0]
  const hi     = sc.vals[sc.vals.length - 1]

  const rowAvgs = useMemo(() => {
    if (!grid) return new Array(24).fill(null)
    return grid.map(row => rowAvg(row, nDays))
  }, [grid, nDays])

  const colAvgs = useMemo(() => {
    if (!grid) return []
    return Array.from({ length: nDays }, (_, d) => rowAvg(grid.map(r => r[d]), 24))
  }, [grid, nDays])

  const overall = useMemo(() => {
    const v = rowAvgs.filter(x => x != null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }, [rowAvgs])

  const gridProps = { grid, nDays, sc, dt, dtObj, rowAvgs, colAvgs, overall }

  const chartTitle = (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 22, fontWeight: 700,
        color: 'var(--color-text-primary)',
        letterSpacing: '0.01em',
      }}>
        {dtObj.label} — Islip, NY
      </div>
      <div style={{ color: '#FFD700', fontSize: 15, fontWeight: 700, marginTop: 2, fontFamily: 'var(--font-body)' }}>
        {isClimo ? '1991–2020 Climatology' : `${FMONTHS[mIdx]} ${year}`}
      </div>
      {isAnom && (
        <div style={{ color: 'var(--color-text-muted)', fontSize: 11, marginTop: 3, fontFamily: 'var(--font-mono)' }}>
          vs. 1991–2020 normals
        </div>
      )}
    </div>
  )

  const legendBar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>{lo}</span>
      <div style={{ height: 10, width: 180, background: gradCss(sc), border: '0.5px solid var(--color-border)', borderRadius: 2 }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>{hi}</span>
    </div>
  )

  return (
    <div style={S.page}>
      {/* ── Page hero ── */}
      <div className="page-container">
        <div className="page-hero">
          <p className="page-eyebrow" style={{ color: 'var(--accent-hourly)' }}>Hourly · Multi-year</p>
          <h1 className="page-title">ISP Hourly Heatmaps</h1>
          <p className="page-subtitle">
            Month-by-month temperature, dewpoint, wind, cloud cover, and anomaly
            fields across decades of Islip (KISP) data.
          </p>
        </div>

        {/* ── Controls ── */}
        <div style={S.card}>
          {/* Year selector */}
          <div style={S.controlRow}>
            <span style={S.label}>Year</span>
            <select
              value={year}
              onChange={e => {
                const val = e.target.value
                const newYear = val === 'climo' ? 'climo' : Number(val)
                if (newYear === 'climo' && !CLIMO_DTYPES.includes(dt)) setDt('temp')
                setYear(newYear)
              }}
              style={S.select}
            >
              <option value="climo">◆ 1991–2020 Climo</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Month pills */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            {MONTHS.map(m => (
              <MonthBtn key={m} m={m} active={m === month} onClick={() => setMonth(m)} />
            ))}
          </div>

          {/* Variable pills */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {DTYPES
              .filter(d => !isClimo || CLIMO_DTYPES.includes(d.id))
              .map(d => (
                <DtBtn key={d.id} d={d} active={d.id === dt} onClick={() => setDt(d.id)} />
              ))}
          </div>
        </div>

        {/* ── Chart area ── */}
        <div style={S.card}>
          {chartTitle}
          {legendBar}

          {loading && (
            <div style={{ color: 'var(--accent-hourly)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '24px 0' }}>
              Loading {year}…
            </div>
          )}
          {err && (
            <div style={{ color: '#f66', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '24px 0' }}>
              Error: {err}
            </div>
          )}
          {!loading && !err && grid && (
            <>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>
                Click chart to expand ↗
              </p>
              <div style={S.gridWrap} onClick={() => setShowModal(true)}>
                <HeatGrid {...gridProps} />
              </div>
            </>
          )}

          {/* Footer */}
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
            Eastern Daylight Time · Data: IEM & NOAA
          </div>
        </div>
      </div>

      {/* ── Expanded modal ── */}
      {showModal && grid && (
        <Modal onClose={() => setShowModal(false)}>
          {chartTitle}
          {legendBar}
          <div style={{ border: '0.5px solid var(--color-border-hover)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <HeatGrid {...gridProps} />
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
            Eastern Daylight Time · Data: IEM & NOAA
          </div>
        </Modal>
      )}
    </div>
  )
}
