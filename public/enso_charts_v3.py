"""
ENSO Phase vs Weather Scatter Chart Generator  v3
==================================================
Iterates every sheet in the Excel workbook and writes one HTML per city.

Run:
    python3 enso_charts_v3.py

Output goes to  output/ENSO_Charts_<TAB>.html
Upload those files to  public/  in the GitHub repo.

New in v3 (19 features)
-----------------------
1.  ONI value on hover (if 5th column present in Excel)
2.  Anomaly mode toggle – y-axis shows departure from full-record mean
3.  Summary table – collapsible per-phase stats (mean, median, std, trend)
4.  Box plot overlay toggle
5.  Per-phase trend annotations (slope per decade above the chart)
6.  Copy modal – Plotly.toImage at 1600×900; clipboard + download buttons
7.  No redundant in-canvas title (export-only title injected at image time)
8.  Rebalanced 3-row controls bar
9.  Larger, higher-contrast legend
10. Sliders linked between charts by default, with unlink toggle
11. Phase isolation linked between charts (when linked)
12. "Coloring by" indicator next to Decade toggle
13. Slider labels use season format: 1977–78
14. Separate Clear Isolation button (independent of full Reset)
15. Low-n caution flag: n < 5 → amber ⚠ on annotation
16. ACIS2 attribution enlarged and repositioned
17. NEUTRAL anchor label added to phase-group row
18. Season definition footnote below each chart
19. Decade colors: sequential gradient blue→purple→magenta→red→amber
"""

import json
import base64
import numpy as np
import pandas as pd
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────
EXCEL_FILE      = "ENSO_Phase_vs_Snowfall_scatter_ALL_CITIES.xlsx"
OUTPUT_DIR      = Path("output")
LOGO_PATH       = Path("contextclimate_bracket_logo.png")
JITTER_SEED     = 42
JITTER_WIDTH    = 0.25
LOW_N_THRESHOLD = 5

# For tabs where cell A1 is blank, fall back to these display names
CITY_NAME_FALLBACKS = {
    "NYC":         "Central Park, NY",
    "BOS":         "Boston, MA",
    "BUF":         "Buffalo, NY",
    "PHL":         "Philadelphia, PA",
    "BWI":         "Baltimore, MD",
    "DCA":         "Washington, DC",
    "PIT":         "Pittsburgh, PA",
    "CLE":         "Cleveland, OH",
    "DET":         "Detroit, MI",
    "CHI":         "Chicago, IL",
    "MSP":         "Minneapolis, MN",
    "STL":         "St. Louis, MO",
    "DEN":         "Denver, CO",
    "SLC":         "Salt Lake City, UT",
    "SEA":         "Seattle, WA",
    "PDX":         "Portland, OR",
    "SFO":         "San Francisco, CA",
    "ANC":         "Anchorage, AK",
    "FAI":         "Fairbanks, AK",
}

PHASES = [
    (1, "Strong<br>La Niña",   "Strong La Niña",   "#9B59B6"),
    (2, "Moderate<br>La Niña", "Moderate La Niña", "#5B9BD5"),
    (3, "Weak<br>La Niña",     "Weak La Niña",     "#85C1E9"),
    (4, "Neutral",             "Neutral",           "#27AE60"),
    (5, "Weak<br>El Niño",     "Weak El Niño",     "#F4D03F"),
    (6, "Moderate<br>El Niño", "Moderate El Niño", "#E67E22"),
    (7, "Strong<br>El Niño",   "Strong El Niño",   "#E74C3C"),
    (8, "Super<br>El Niño",    "Super El Niño",    "#922B21"),
]

# Sequential gradient: cool blue (oldest) → warm amber (newest)
# Traverses via indigo → purple → magenta → rose → red → orange-amber
# Avoids green by going the "warm" way around the color wheel
DECADE_COLORS = {
    "1860s": "#3967EF",
    "1870s": "#3948EF",
    "1880s": "#4839EF",
    "1890s": "#6739EF",
    "1900s": "#8539EF",
    "1910s": "#A339EF",
    "1920s": "#C239EF",
    "1930s": "#E039EF",
    "1940s": "#EF39E0",
    "1950s": "#EF39C2",
    "1960s": "#EF39A3",
    "1970s": "#EF3985",
    "1980s": "#EF3967",
    "1990s": "#EF3948",
    "2000s": "#EF4839",
    "2010s": "#EF6739",
    "2020s": "#EF8539",
}


# ── Helpers ─────────────────────────────────────────────────────────────────
def encode_logo() -> str | None:
    if LOGO_PATH.exists():
        return base64.b64encode(LOGO_PATH.read_bytes()).decode()
    return None


def get_city_name(xl: pd.ExcelFile, tab: str) -> str:
    try:
        raw = pd.read_excel(xl, sheet_name=tab, header=None, nrows=1)
        if raw.shape[0] > 0 and pd.notna(raw.iloc[0, 0]):
            val = str(raw.iloc[0, 0]).strip()
            if val:
                return val
    except Exception:
        pass
    return CITY_NAME_FALLBACKS.get(tab, tab)


def load_data(xl: pd.ExcelFile, tab: str) -> pd.DataFrame:
    df = pd.read_excel(xl, sheet_name=tab, header=2)

    # Rename first 4 required columns; accept optional 5th (ONI)
    base_cols = ["Season", "Temp", "Snowfall", "ENSO_Code"]
    if df.shape[1] >= 5:
        df = df.iloc[:, :5]
        df.columns = base_cols + ["ONI"]
    else:
        df = df.iloc[:, :4]
        df.columns = base_cols
        df["ONI"] = None

    # NOAA sentinel values
    for col in ["Temp", "Snowfall"]:
        df[col] = df[col].replace({"T": 0.0, "M": float("nan")})
        df[col] = pd.to_numeric(df[col], errors="coerce")

    if "ONI" in df.columns:
        df["ONI"] = pd.to_numeric(df["ONI"], errors="coerce")

    df = df.dropna(subset=["ENSO_Code", "Season", "Temp"])
    df["ENSO_Code"]  = df["ENSO_Code"].astype(int)
    df["Start_Year"] = df["Season"].astype(str).str[:4].astype(int)
    df["Decade"]     = df["Start_Year"].apply(lambda y: f"{(y // 10) * 10}s")
    return df.reset_index(drop=True)


def add_jitter(df: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(JITTER_SEED)
    phase_to_idx = {code: i for i, (code, *_) in enumerate(PHASES)}
    df = df.copy()
    df["x_pos"] = df["ENSO_Code"].map(phase_to_idx).astype(float)
    for code in df["ENSO_Code"].unique():
        mask = df["ENSO_Code"] == code
        df.loc[mask, "x_pos"] += rng.uniform(-JITTER_WIDTH, JITTER_WIDTH, mask.sum())
    return df


def build_app_data(df: pd.DataFrame, city_name: str, logo_b64: str | None) -> dict:
    phase_map = {code: (lbl_br, lbl, color) for code, lbl_br, lbl, color in PHASES}

    points = []
    for row in df.itertuples():
        snow = None if pd.isna(row.Snowfall) else round(float(row.Snowfall), 1)
        oni  = None if (row.ONI is None or pd.isna(row.ONI)) else round(float(row.ONI), 2)
        points.append({
            "season":       str(row.Season),
            "temp":         round(float(row.Temp), 1),
            "snowfall":     snow,
            "enso_code":    int(row.ENSO_Code),
            "start_year":   int(row.Start_Year),
            "decade":       row.Decade,
            "x_pos":        round(float(row.x_pos), 4),
            "phase_color":  phase_map[int(row.ENSO_Code)][2],
            "decade_color": DECADE_COLORS.get(row.Decade, "#888"),
            "oni":          oni,
        })

    phases = [
        {"code": code, "label_br": lbl_br, "label": lbl,
         "color": color, "x_center": i}
        for i, (code, lbl_br, lbl, color) in enumerate(PHASES)
    ]

    present_decades = sorted({p["decade"] for p in points})
    decades = [{"label": d, "color": DECADE_COLORS.get(d, "#888")} for d in present_decades]

    return {
        "points":    points,
        "phases":    phases,
        "decades":   decades,
        "city_name": city_name,
        "min_year":  int(df["Start_Year"].min()),
        "max_year":  int(df["Start_Year"].max()),
        "logo_b64":  logo_b64,
    }


# ── HTML Template ────────────────────────────────────────────────────────────
HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>__CITY_NAME__ — ENSO Weather Charts</title>
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #0d0d0d;
  color: #eee;
  font-family: Arial, sans-serif;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px 40px;
  gap: 16px;
  min-height: 100vh;
}

/* ── Chart card ── */
.chart-card {
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  padding: 22px 22px 16px;
  width: min(980px, 100%);
}

.chart-title {
  text-align: center;
  font-size: 17px;
  font-weight: bold;
  color: #fff;
  margin-bottom: 3px;
  line-height: 1.3;
}

.chart-subtitle {
  text-align: center;
  font-size: 12px;
  color: #666;
  margin-bottom: 14px;
  min-height: 16px;
}

/* ── Controls ── */
.controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #1e1e1e;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  padding: 13px 16px 11px;
  margin-bottom: 6px;
}

.ctrl-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #555;
  margin-bottom: 5px;
}

.ctrl-year-display {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  font-weight: bold;
  color: #bbb;
  margin-bottom: 7px;
}

.ctrl-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.ctrl-row.space-between { justify-content: space-between; }

/* ── Dual-range slider ── */
.range-wrap { flex: 1; min-width: 220px; }

.dual-slider {
  position: relative;
  height: 22px;
  display: flex;
  align-items: center;
}

.dual-slider .track-bg {
  position: absolute;
  inset: 0;
  margin: auto;
  height: 4px;
  border-radius: 2px;
  background: #3a3a3a;
}

.dual-slider .track-fill {
  position: absolute;
  height: 4px;
  border-radius: 2px;
  background: #5B9BD5;
  pointer-events: none;
  top: 50%;
  transform: translateY(-50%);
}

.dual-slider input[type=range] {
  position: absolute;
  width: 100%;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  pointer-events: none;
  outline: none;
  height: 0;
}

.dual-slider input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px; height: 18px;
  border-radius: 50%;
  background: #5B9BD5;
  border: 2px solid #fff;
  cursor: ew-resize;
  pointer-events: all;
  box-shadow: 0 1px 4px rgba(0,0,0,.6);
  transition: background .15s;
}
.dual-slider input[type=range]::-webkit-slider-thumb:hover { background: #7ab4e8; }
.dual-slider input[type=range]::-moz-range-thumb {
  width: 18px; height: 18px;
  border-radius: 50%;
  background: #5B9BD5;
  border: 2px solid #fff;
  cursor: ew-resize;
  pointer-events: all;
}

/* ── Buttons ── */
.btn-group { display: flex; gap: 7px; align-items: flex-end; flex-wrap: wrap; }

.btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #3a3a3a;
  background: #252525;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
  transition: background .14s, border-color .14s, color .14s;
  white-space: nowrap;
  line-height: 1.5;
  user-select: none;
}
.btn:hover  { background: #333; border-color: #555; color: #fff; }
.btn.active { background: #1e3a60; border-color: #5B9BD5; color: #fff; }

.btn-copy {
  border-color: #27AE60;
  color: #27AE60;
  background: #0f1f14;
}
.btn-copy:hover { background: #27AE60; color: #fff; border-color: #27AE60; }

/* Coloring-by indicator */
.coloring-by {
  font-size: 10px;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  align-self: flex-end;
  padding-bottom: 8px;
  white-space: nowrap;
}

/* ── Legend ── */
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-top: 10px;
  padding: 10px 14px;
  background: #111;
  border: 1px solid #222;
  border-radius: 6px;
  min-height: 40px;
}

.leg-item {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: #c0c0c0;
  cursor: pointer;
  padding: 4px 9px;
  border-radius: 4px;
  border: 1px solid transparent;
  transition: background .1s, border-color .1s;
  user-select: none;
}
.leg-item:hover  { background: #1e1e1e; border-color: #333; }
.leg-item.iso    { border-color: #5B9BD5; background: #1a2a3a; color: #fff; }
.leg-item.noclick { cursor: default; color: #888; }
.leg-item.noclick:hover { background: transparent; border-color: transparent; }

.leg-dot { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; }
.leg-diamond { width: 10px; height: 10px; transform: rotate(45deg); flex-shrink: 0; background: #aaa; }
.leg-divider { width: 1px; background: #2a2a2a; align-self: stretch; margin: 0 2px; }

/* ── Stats table ── */
.stats-panel {
  display: none;
  margin-top: 10px;
  border: 1px solid #222;
  border-radius: 6px;
  overflow: hidden;
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
  color: #bbb;
}

.stats-table th {
  text-align: center;
  padding: 7px 10px;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
  color: #777;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 10px;
  font-weight: normal;
}
.stats-table th:first-child { text-align: left; }

.stats-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #1c1c1c;
  text-align: center;
}
.stats-table td:first-child { text-align: left; }
.stats-table tr:last-child td { border-bottom: none; }
.stats-table tr:hover td { background: #1a1a1a; }

.phase-cell { display: flex; align-items: center; gap: 7px; }
.warn { color: #e0a020; }
.trend-pos { color: #E87070; }
.trend-neg { color: #7090E8; }

/* ── Footnote ── */
.footnote {
  font-size: 10.5px;
  color: #3d3d3d;
  text-align: center;
  margin-top: 9px;
  line-height: 1.6;
}

/* ── Link bar ── */
.link-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.link-hint {
  font-size: 11px;
  color: #3a3a3a;
}

/* ── Copy modal ── */
#copy-modal {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.88);
  z-index: 1000;
  align-items: center;
  justify-content: center;
}

.modal-inner {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 22px;
  max-width: 92vw;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  overflow-y: auto;
}

#modal-loading {
  color: #666;
  font-size: 14px;
  padding: 40px 60px;
}

#modal-img {
  display: none;
  max-width: 100%;
  max-height: 62vh;
  border-radius: 6px;
  border: 1px solid #333;
}

#modal-actions {
  display: none;
  gap: 10px;
}

.modal-hint {
  color: #444;
  font-size: 11px;
}

#modal-toast {
  display: none;
  background: #27AE60;
  color: #fff;
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 13px;
}
</style>
</head>
<body>

<!-- ── Copy modal (shared) ────────────────────────────────────────────────── -->
<div id="copy-modal">
  <div class="modal-inner">
    <p id="modal-loading">Generating image…</p>
    <img id="modal-img" alt="Chart export">
    <div id="modal-actions" class="btn-group">
      <button class="btn btn-copy" onclick="clipboardCopy()">📋 Copy to Clipboard</button>
      <button class="btn btn-copy" onclick="downloadImg()" style="border-color:#5B9BD5;color:#5B9BD5;background:#0d1a2a">⬇ Download PNG</button>
      <button class="btn"          onclick="closeModal()">✕ Close</button>
    </div>
    <p class="modal-hint">Right-click image to copy or save &nbsp;·&nbsp; 1600 × 900 px</p>
    <div id="modal-toast">✓ Copied to clipboard!</div>
  </div>
</div>

<!-- ── Temperature chart ──────────────────────────────────────────────────── -->
<div class="chart-card" id="card-temp">
  <div class="chart-title"    id="title-temp"></div>
  <div class="chart-subtitle" id="sub-temp"></div>

  <div class="controls">
    <!-- Row 1: slider -->
    <div class="ctrl-row">
      <div class="range-wrap">
        <div class="ctrl-label">Year Range Filter</div>
        <div class="ctrl-year-display">
          <span id="yr-min-temp"></span>
          <span id="yr-max-temp"></span>
        </div>
        <div class="dual-slider">
          <div class="track-bg"></div>
          <div class="track-fill" id="fill-temp"></div>
          <input type="range" id="rlo-temp">
          <input type="range" id="rhi-temp">
        </div>
      </div>
    </div>

    <!-- Row 2: toggle buttons -->
    <div class="ctrl-row space-between">
      <div class="btn-group">
        <button class="btn" id="abtn-temp"  onclick="toggleAnomaly('temp')">Anomaly</button>
        <button class="btn" id="bbtn-temp"  onclick="toggleBoxplot('temp')">Box Plot</button>
        <button class="btn" id="tbtn-temp"  onclick="toggleTrend('temp')">Trend ↗</button>
        <button class="btn" id="stbtn-temp" onclick="toggleStats('temp')">Summary ▾</button>
      </div>
      <div class="btn-group">
        <button class="btn" id="dbtn-temp"  onclick="toggleDecade('temp')">🎨 Decade Colors</button>
        <span class="coloring-by" id="cby-temp">Phase</span>
      </div>
    </div>

    <!-- Row 3: action buttons -->
    <div class="ctrl-row">
      <button class="btn btn-copy" id="copybtn-temp" onclick="showCopyModal('temp')">📋 Copy Chart</button>
      <button class="btn"                             onclick="clearIso('temp')">✕ Clear Isolation</button>
      <button class="btn"                             onclick="resetAll('temp')">↺ Reset</button>
    </div>
  </div>

  <div id="plt-temp"></div>
  <div class="legend" id="leg-temp"></div>
  <div class="stats-panel" id="stats-temp"><table class="stats-table" id="stbl-temp"></table></div>
  <div class="footnote">
    Click dot or legend label to isolate &nbsp;·&nbsp; Double-click chart to clear &nbsp;·&nbsp;
    Season year is winter start: 1977 = Dec 1977 – Feb 1978
  </div>
</div>

<!-- ── Link bar ───────────────────────────────────────────────────────────── -->
<div class="link-bar">
  <button class="btn active" id="link-btn" onclick="toggleLink()">🔗 Charts Linked</button>
  <span class="link-hint">Slider and isolation sync between charts when linked</span>
</div>

<!-- ── Snowfall chart ────────────────────────────────────────────────────── -->
<div class="chart-card" id="card-snow">
  <div class="chart-title"    id="title-snow"></div>
  <div class="chart-subtitle" id="sub-snow"></div>

  <div class="controls">
    <div class="ctrl-row">
      <div class="range-wrap">
        <div class="ctrl-label">Year Range Filter</div>
        <div class="ctrl-year-display">
          <span id="yr-min-snow"></span>
          <span id="yr-max-snow"></span>
        </div>
        <div class="dual-slider">
          <div class="track-bg"></div>
          <div class="track-fill" id="fill-snow"></div>
          <input type="range" id="rlo-snow">
          <input type="range" id="rhi-snow">
        </div>
      </div>
    </div>

    <div class="ctrl-row space-between">
      <div class="btn-group">
        <button class="btn" id="abtn-snow"  onclick="toggleAnomaly('snow')">Anomaly</button>
        <button class="btn" id="bbtn-snow"  onclick="toggleBoxplot('snow')">Box Plot</button>
        <button class="btn" id="tbtn-snow"  onclick="toggleTrend('snow')">Trend ↗</button>
        <button class="btn" id="stbtn-snow" onclick="toggleStats('snow')">Summary ▾</button>
      </div>
      <div class="btn-group">
        <button class="btn" id="dbtn-snow"  onclick="toggleDecade('snow')">🎨 Decade Colors</button>
        <span class="coloring-by" id="cby-snow">Phase</span>
      </div>
    </div>

    <div class="ctrl-row">
      <button class="btn btn-copy" id="copybtn-snow" onclick="showCopyModal('snow')">📋 Copy Chart</button>
      <button class="btn"                             onclick="clearIso('snow')">✕ Clear Isolation</button>
      <button class="btn"                             onclick="resetAll('snow')">↺ Reset</button>
    </div>
  </div>

  <div id="plt-snow"></div>
  <div class="legend" id="leg-snow"></div>
  <div class="stats-panel" id="stats-snow"><table class="stats-table" id="stbl-snow"></table></div>
  <div class="footnote">
    Click dot or legend label to isolate &nbsp;·&nbsp; Double-click chart to clear &nbsp;·&nbsp;
    Season year is winter start: 1977 = Dec 1977 – Feb 1978
  </div>
</div>

<script>
// ═══════════════════════════════════════════════════════════════════════════
//  DATA  (injected by Python)
// ═══════════════════════════════════════════════════════════════════════════
const D = __APP_DATA__;

// ═══════════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
const N   = D.phases.length;       // 8
const OTH = { temp: 'snow', snow: 'temp' };

const Y_FIELD = { temp: 'temp',           snow: 'snowfall'         };
const Y_LABEL = { temp: 'Temperature (°F)', snow: 'Snowfall (in)' };
const Y_ANOM  = { temp: 'Temp Anomaly (°F)', snow: 'Snowfall Anomaly (in)' };
const Y_UNIT  = { temp: '°F',              snow: '"'              };

const TITLES = {
  temp: `${D.city_name} \u2014 DJF Mean Temperature by ENSO Phase`,
  snow: `${D.city_name} \u2014 Seasonal Snowfall by ENSO Phase`,
};

const HAS_ONI = D.points.some(p => p.oni !== null && p.oni !== undefined);

// Full-record means (for anomaly baseline)
const FULL_MEAN = {
  temp: D.points.reduce((s,p) => s + p.temp, 0) / D.points.length,
  snow: (() => {
    const sv = D.points.filter(p => p.snowfall !== null && p.snowfall !== undefined);
    return sv.length ? sv.reduce((s,p) => s + p.snowfall, 0) / sv.length : 0;
  })(),
};

// Trace index offsets
const T_DOT  = 0;       // 0 … N-1
const T_DIAM = N;       // N … 2N-1
const T_BOX  = N * 2;  // 2N … 3N-1

// ═══════════════════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════════════════
const ST = {
  temp: { lo: D.min_year, hi: D.max_year, decade: false, iso: null,
          iso_decade: null, anomaly: false, boxplot: false, trend: false },
  snow: { lo: D.min_year, hi: D.max_year, decade: false, iso: null,
          iso_decade: null, anomaly: false, boxplot: false, trend: false },
  linked: true,
};

let _syncing = false;  // prevents slider/isolation sync loops
let _copyUrl  = '';
let _copyCid  = '';
let _debounce = { temp: null, snow: null };

// ═══════════════════════════════════════════════════════════════════════════
//  PURE UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════
function seasonLabel(y) {
  return `${y}\u2013${String(y + 1).slice(-2)}`;
}

function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function medianVal(arr) {
  const s = [...arr].sort((a,b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
}

function stdDevVal(arr) {
  if (arr.length < 2) return null;
  const m = arr.reduce((a,b) => a+b, 0) / arr.length;
  return Math.sqrt(arr.reduce((s,v) => s + (v-m)**2, 0) / (arr.length - 1));
}

function linreg(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a,b) => a+b, 0) / n;
  const my = ys.reduce((a,b) => a+b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den > 0 ? num / den : null;
}

function ptY(p, cid) {
  // Raw y value for a point (null-safe)
  const v = p[Y_FIELD[cid]];
  return (v === null || v === undefined) ? null : v;
}

function dispY(raw, cid) {
  // Displayed y value (apply anomaly offset if active)
  if (raw === null || raw === undefined) return null;
  return ST[cid].anomaly ? raw - FULL_MEAN[cid] : raw;
}

function dotColor(p, cid) {
  return ST[cid].decade ? p.decade_color : p.phase_color;
}

function dotOpacity(p, cid) {
  const s = ST[cid];
  const inR = p.start_year >= s.lo && p.start_year <= s.hi;
  const inP = s.decade
    ? (s.iso_decade === null || p.decade === s.iso_decade)
    : (s.iso        === null || p.enso_code === s.iso);
  if ( inR &&  inP) return 0.88;
  if ( inR && !inP) return 0.10;
  if (!inR &&  inP) return 0.15;
  return 0.04;
}

function yLabel(cid) {
  return ST[cid].anomaly ? Y_ANOM[cid] : Y_LABEL[cid];
}

// ═══════════════════════════════════════════════════════════════════════════
//  DATA HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function filteredPts(cid) {
  const s = ST[cid];
  return D.points.filter(p =>
    p.start_year >= s.lo && p.start_year <= s.hi &&
    ptY(p, cid) !== null
  );
}

function phaseStats(cid) {
  const fps = filteredPts(cid);
  const out = {};
  D.phases.forEach(ph => {
    const vals = fps.filter(p => p.enso_code === ph.code).map(p => ptY(p, cid));
    const n = vals.length;
    const mean = n ? vals.reduce((a,b) => a+b, 0) / n : null;
    out[ph.code] = {
      mean,
      median: n ? medianVal(vals) : null,
      std:    n > 1 ? stdDevVal(vals) : null,
      count:  n,
    };
  });
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
//  TRACE BUILDER
// ═══════════════════════════════════════════════════════════════════════════
function buildTraces(cid) {
  const stats  = phaseStats(cid);
  const fps    = filteredPts(cid);
  const traces = [];

  // ── DOT traces (0 … N-1) ──────────────────────────────────────────────
  D.phases.forEach(ph => {
    const pts = D.points.filter(p =>
      p.enso_code === ph.code && ptY(p, cid) !== null
    );
    const hov = HAS_ONI
      ? '<b>%{customdata[0]}</b><br>' + Y_LABEL[cid] + ': %{customdata[1]}<br>ONI: %{customdata[3]}<extra></extra>'
      : '<b>%{customdata[0]}</b><br>' + Y_LABEL[cid] + ': %{customdata[1]}<extra></extra>';
    traces.push({
      type: 'scatter', mode: 'markers',
      x: pts.map(p => p.x_pos),
      y: pts.map(p => dispY(ptY(p, cid), cid)),
      marker: {
        color:   pts.map(p => dotColor(p, cid)),
        opacity: pts.map(p => dotOpacity(p, cid)),
        size: 9,
        line: { width: 0.5, color: 'rgba(0,0,0,.25)' },
      },
      customdata: pts.map(p => [p.season, ptY(p, cid), p.decade, p.oni]),
      hovertemplate: hov,
      showlegend: false,
      _phase: ph.code,
    });
  });

  // ── DIAMOND mean traces (N … 2N-1) ───────────────────────────────────
  D.phases.forEach(ph => {
    const s = stats[ph.code];
    const dY = s.mean !== null ? dispY(s.mean, cid) : null;
    traces.push({
      type: 'scatter', mode: 'markers',
      x: [ph.x_center],
      y: [dY],
      marker: {
        symbol: 'diamond', size: 16,
        color: ph.color,
        line: { width: 2, color: 'white' },
        opacity: 1,
      },
      customdata: [[ph.label, s.mean !== null ? s.mean.toFixed(1) : '\u2014']],
      hovertemplate: '<b>%{customdata[0]}</b><br>Phase mean: %{customdata[1]}<extra></extra>',
      showlegend: false,
      _diamond: true,
      _phase: ph.code,
    });
  });

  // ── BOX traces (2N … 3N-1) ───────────────────────────────────────────
  D.phases.forEach(ph => {
    const vals = fps.filter(p => p.enso_code === ph.code)
                    .map(p => dispY(ptY(p, cid), cid));
    const show = ST[cid].boxplot && vals.length >= 3;
    traces.push({
      type: 'box',
      x: Array(vals.length).fill(ph.x_center),
      y: vals,
      boxpoints: false,
      fillcolor: hexToRgba(ph.color, 0.16),
      line: { color: ph.color, width: 1.5 },
      whiskerwidth: 0.5,
      width: 0.28,
      showlegend: false,
      visible: show,
      hoverinfo: 'skip',
    });
  });

  return traces;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ANNOTATION BUILDERS
// ═══════════════════════════════════════════════════════════════════════════
function makeAnnotations(cid) {
  const stats = phaseStats(cid);
  const ann   = [];

  // n= count per phase
  D.phases.forEach(ph => {
    const n   = stats[ph.code].count;
    const low = n > 0 && n < LOW_N_THRESHOLD;
    ann.push({
      x: ph.x_center, y: -0.12, xref: 'x', yref: 'paper',
      text: low ? `n=${n} \u26A0` : `n=${n}`,
      showarrow: false,
      font: { size: 10, color: low ? '#e0a020' : '#555' },
    });
  });

  // Phase group labels
  ann.push(
    { x: 1.0, y: -0.20, xref: 'x', yref: 'paper',
      text: '<b>\u25C4 LA NI\u00D1A</b>',
      font: { color: '#85C1E9', size: 12 }, showarrow: false },
    { x: 3.0, y: -0.20, xref: 'x', yref: 'paper',
      text: '<b>NEUTRAL</b>',
      font: { color: '#27AE60', size: 12 }, showarrow: false },
    { x: 5.5, y: -0.20, xref: 'x', yref: 'paper',
      text: '<b>EL NI\u00D1O \u25BA</b>',
      font: { color: '#E74C3C', size: 12 }, showarrow: false },
  );

  // ACIS2 attribution (larger, more legible)
  ann.push({
    x: 0.01, y: -0.32, xref: 'paper', yref: 'paper',
    text: 'Data: ACIS2 / Applied Climate Information System',
    showarrow: false,
    font: { size: 11, color: '#666' },
    align: 'left',
    xanchor: 'left',
  });

  // Trend annotations (if trend mode active)
  if (ST[cid].trend) {
    const fps = filteredPts(cid);
    D.phases.forEach(ph => {
      const pts  = fps.filter(p => p.enso_code === ph.code);
      if (pts.length < 3) return;
      const xs   = pts.map(p => p.start_year);
      const ys   = pts.map(p => dispY(ptY(p, cid), cid));
      const slope = linreg(xs, ys);
      if (slope === null) return;
      const sd   = slope * 10;
      const sign = sd >= 0 ? '+' : '';
      const col  = sd >= 0 ? '#E87070' : '#7090E8';
      ann.push({
        x: ph.x_center, y: 1.055, xref: 'x', yref: 'paper',
        text: `${sign}${sd.toFixed(1)}${Y_UNIT[cid]}/dec`,
        showarrow: false,
        font: { size: 9, color: col },
      });
    });
  }

  return ann;
}

// ═══════════════════════════════════════════════════════════════════════════
//  LAYOUT BUILDER
// ═══════════════════════════════════════════════════════════════════════════
function buildLayout(cid) {
  const tMargin = ST[cid].trend ? 40 : 10;

  const layout = {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: '#111',
    font: { color: '#ddd', family: 'Arial' },
    xaxis: {
      tickmode: 'array',
      tickvals: D.phases.map(p => p.x_center),
      ticktext: D.phases.map(p => p.label_br),
      tickfont: { size: 11, color: '#bbb' },
      showgrid: false, zeroline: false,
      range: [-0.6, N - 0.4],
    },
    yaxis: {
      title: { text: yLabel(cid), font: { size: 13 } },
      gridcolor: 'rgba(255,255,255,.06)',
      zeroline: ST[cid].anomaly,
      zerolinecolor: 'rgba(255,255,255,.35)',
      zerolinewidth: 1.5,
    },
    shapes: ST[cid].anomaly ? [{
      type: 'line',
      x0: -0.6, x1: N - 0.4, y0: 0, y1: 0,
      xref: 'x', yref: 'y',
      line: { color: 'rgba(255,255,255,.3)', width: 1.5, dash: 'dash' },
    }] : [],
    annotations: makeAnnotations(cid),
    hoverlabel: { bgcolor: '#1e1e1e', font: { color: '#fff' }, bordercolor: '#444' },
    margin: { l: 65, r: 20, t: tMargin, b: 160 },
    showlegend: false,
    height: 500,
  };

  // Logo image (if available)
  if (D.logo_b64) {
    layout.images = [{
      source: 'data:image/png;base64,' + D.logo_b64,
      xref: 'paper', yref: 'paper',
      x: 0.99, y: -0.22,
      sizex: 0.08, sizey: 0.08,
      xanchor: 'right', yanchor: 'top',
      layer: 'above',
    }];
  }

  return layout;
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORT LAYOUT (for copy modal image)
// ═══════════════════════════════════════════════════════════════════════════
function buildExportLayout(cid) {
  const base = buildLayout(cid);
  const layout = Object.assign({}, base, {
    paper_bgcolor: '#0d0d0d',   // solid dark — prevents white background in static PNG
    title: {
      text: TITLES[cid],
      font: { size: 20, color: '#fff', family: 'Arial' },
      x: 0.5, xanchor: 'center', y: 0.97,
    },
    margin: { l: 80, r: 40, t: 80, b: 165 },
    xaxis: Object.assign({}, base.xaxis, { tickfont: { size: 13, color: '#bbb' } }),
    yaxis: Object.assign({}, base.yaxis, {
      title: { text: yLabel(cid), font: { size: 15 } },
      tickfont: { size: 12 },
    }),
    font: { color: '#ddd', family: 'Arial', size: 13 },
  });
  // Reposition logo to sit inside the bottom margin of the export canvas
  if (D.logo_b64) {
    layout.images = [{
      source: 'data:image/png;base64,' + D.logo_b64,
      xref: 'paper', yref: 'paper',
      x: 0.99, y: -0.24,
      sizex: 0.07, sizey: 0.07,
      xanchor: 'right', yanchor: 'top',
      layer: 'above',
    }];
  }
  return layout;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CHART BUILD + REFRESH
// ═══════════════════════════════════════════════════════════════════════════
function buildChart(cid) {
  const div = document.getElementById(`plt-${cid}`);
  Plotly.react(div, buildTraces(cid), buildLayout(cid),
    { responsive: true, displayModeBar: false });

  div.on('plotly_click', ev => {
    const tr = ev.points[0].data;
    if (tr._diamond) return;
    if (ST[cid].decade) {
      const d = ev.points[0].customdata[2];
      ST[cid].iso_decade = ST[cid].iso_decade === d ? null : d;
    } else {
      ST[cid].iso = ST[cid].iso === tr._phase ? null : tr._phase;
    }
    if (ST.linked && !_syncing) {
      _syncing = true;
      ST[OTH[cid]].iso         = ST[cid].iso;
      ST[OTH[cid]].iso_decade  = ST[cid].iso_decade;
      refresh(OTH[cid]);
      _syncing = false;
    }
    refresh(cid);
  });

  div.on('plotly_doubleclick', () => {
    ST[cid].iso        = null;
    ST[cid].iso_decade = null;
    if (ST.linked && !_syncing) {
      _syncing = true;
      ST[OTH[cid]].iso        = null;
      ST[OTH[cid]].iso_decade = null;
      refresh(OTH[cid]);
      _syncing = false;
    }
    refresh(cid);
    return false;
  });
}

function refresh(cid) {
  Plotly.react(
    document.getElementById(`plt-${cid}`),
    buildTraces(cid),
    buildLayout(cid),
    { responsive: true, displayModeBar: false }
  );
  updateSubtitle(cid);
  buildLegend(cid);
  updateColoringIndicator(cid);
  if (document.getElementById(`stats-${cid}`).style.display !== 'none') {
    buildStatsTable(cid);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SUBTITLE
// ═══════════════════════════════════════════════════════════════════════════
function updateSubtitle(cid) {
  const s   = ST[cid];
  const fps = filteredPts(cid);
  const n   = fps.length;
  const full = s.lo === D.min_year && s.hi === D.max_year;
  let txt = full
    ? `${seasonLabel(D.min_year)}\u2013${seasonLabel(D.max_year)}  \u00B7  ${n} seasons`
    : `Filtered ${seasonLabel(s.lo)}\u2013${seasonLabel(s.hi)}  \u00B7  ${n} of ${D.points.filter(p => ptY(p,cid) !== null).length} seasons`;

  if (s.anomaly) {
    const m = FULL_MEAN[cid];
    txt += `  \u00B7  Anomaly from ${m.toFixed(1)}${Y_UNIT[cid]} mean`;
  }
  if (s.decade && s.iso_decade) {
    txt += `  \u00B7  Showing: ${s.iso_decade}`;
  } else if (!s.decade && s.iso !== null) {
    const ph = D.phases.find(p => p.code === s.iso);
    if (ph) txt += `  \u00B7  Isolated: ${ph.label}`;
  }

  document.getElementById(`sub-${cid}`).textContent = txt;
}

// ═══════════════════════════════════════════════════════════════════════════
//  LEGEND
// ═══════════════════════════════════════════════════════════════════════════
function buildLegend(cid) {
  const el = document.getElementById(`leg-${cid}`);
  el.innerHTML = '';

  if (ST[cid].decade) {
    const present = [...new Set(D.points.map(p => p.decade))].sort();
    present.forEach(d => {
      const dc   = D.decades.find(x => x.label === d)?.color ?? '#888';
      const item = document.createElement('div');
      item.className = 'leg-item' + (ST[cid].iso_decade === d ? ' iso' : '');
      item.innerHTML = `<div class="leg-dot" style="background:${dc}"></div>${d}`;
      item.onclick = () => {
        ST[cid].iso_decade = ST[cid].iso_decade === d ? null : d;
        if (ST.linked && !_syncing) {
          _syncing = true;
          ST[OTH[cid]].iso_decade = ST[cid].iso_decade;
          refresh(OTH[cid]);
          _syncing = false;
        }
        refresh(cid);
      };
      el.appendChild(item);
    });
  } else {
    D.phases.forEach(ph => {
      const item = document.createElement('div');
      item.className = 'leg-item' + (ST[cid].iso === ph.code ? ' iso' : '');
      item.innerHTML = `<div class="leg-dot" style="background:${ph.color}"></div>${ph.label}`;
      item.onclick = () => {
        ST[cid].iso = ST[cid].iso === ph.code ? null : ph.code;
        if (ST.linked && !_syncing) {
          _syncing = true;
          ST[OTH[cid]].iso = ST[cid].iso;
          refresh(OTH[cid]);
          _syncing = false;
        }
        refresh(cid);
      };
      el.appendChild(item);
    });
    // Diamond key
    const div = document.createElement('div');
    div.className = 'leg-divider';
    el.appendChild(div);
    const mi = document.createElement('div');
    mi.className = 'leg-item noclick';
    mi.innerHTML = `<div class="leg-diamond"></div>Phase mean`;
    el.appendChild(mi);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  STATS TABLE
// ═══════════════════════════════════════════════════════════════════════════
const LOW_N_THRESHOLD = 5;

function buildStatsTable(cid) {
  const stats = phaseStats(cid);
  const fps   = filteredPts(cid);
  const showTrend = ST[cid].trend;

  let html = '<thead><tr>';
  html += '<th style="text-align:left">Phase</th><th>n</th>';
  html += '<th>Mean</th><th>Median</th><th>Std Dev</th>';
  if (showTrend) html += '<th>Trend/dec</th>';
  html += '</tr></thead><tbody>';

  D.phases.forEach(ph => {
    const s    = stats[ph.code];
    const pts  = fps.filter(p => p.enso_code === ph.code);
    const vals = pts.map(p => dispY(ptY(p, cid), cid));
    const n    = s.count;
    const warn = n > 0 && n < LOW_N_THRESHOLD;

    const fmtMean = s.mean !== null ? dispY(s.mean, cid).toFixed(1) : '\u2014';
    const fmtMed  = s.median !== null ? dispY(s.median, cid).toFixed(1) : '\u2014';
    const fmtStd  = s.std    !== null ? s.std.toFixed(1) : '\u2014';

    let trendCell = '';
    if (showTrend) {
      const xs  = pts.map(p => p.start_year);
      const ys  = vals;
      const slp = linreg(xs, ys);
      if (slp !== null && n >= 3) {
        const sd  = slp * 10;
        const cls = sd >= 0 ? 'trend-pos' : 'trend-neg';
        trendCell = `<span class="${cls}">${sd >= 0 ? '+' : ''}${sd.toFixed(1)}${Y_UNIT[cid]}</span>`;
      } else {
        trendCell = '\u2014';
      }
    }

    html += `<tr>`;
    html += `<td><div class="phase-cell">
               <div class="leg-dot" style="background:${ph.color};width:10px;height:10px;border-radius:50%;flex-shrink:0"></div>
               ${ph.label}
             </div></td>`;
    html += `<td>${n}${warn ? ' <span class="warn">\u26A0</span>' : ''}</td>`;
    html += `<td>${fmtMean}</td>`;
    html += `<td>${fmtMed}</td>`;
    html += `<td>${fmtStd}</td>`;
    if (showTrend) html += `<td>${trendCell}</td>`;
    html += `</tr>`;
  });

  html += '</tbody>';
  document.getElementById(`stbl-${cid}`).innerHTML = html;
}

function updateColoringIndicator(cid) {
  document.getElementById(`cby-${cid}`).textContent =
    ST[cid].decade ? 'Decade' : 'Phase';
}

// ═══════════════════════════════════════════════════════════════════════════
//  SLIDER
// ═══════════════════════════════════════════════════════════════════════════
function syncFill(cid) {
  const lo   = parseInt(document.getElementById(`rlo-${cid}`).value);
  const hi   = parseInt(document.getElementById(`rhi-${cid}`).value);
  const span = D.max_year - D.min_year;
  const lp   = ((lo - D.min_year) / span) * 100;
  const wp   = ((hi - lo) / span) * 100;
  document.getElementById(`fill-${cid}`).style.left  = lp + '%';
  document.getElementById(`fill-${cid}`).style.width = wp + '%';
  document.getElementById(`yr-min-${cid}`).textContent = seasonLabel(lo);
  document.getElementById(`yr-max-${cid}`).textContent = seasonLabel(hi);
}

function initSlider(cid) {
  const rlo = document.getElementById(`rlo-${cid}`);
  const rhi = document.getElementById(`rhi-${cid}`);
  [rlo, rhi].forEach(r => { r.min = D.min_year; r.max = D.max_year; });
  rlo.value = D.min_year;
  rhi.value = D.max_year;
  syncFill(cid);

  function onInput() {
    const GAP = 5;
    let lo = parseInt(rlo.value), hi = parseInt(rhi.value);
    if (lo > hi - GAP) { lo = hi - GAP; rlo.value = lo; }
    if (hi < lo + GAP) { hi = lo + GAP; rhi.value = hi; }
    syncFill(cid);
    ST[cid].lo = lo;
    ST[cid].hi = hi;

    // Debounce the chart refresh
    clearTimeout(_debounce[cid]);
    _debounce[cid] = setTimeout(() => {
      refresh(cid);
      if (ST.linked && !_syncing) {
        _syncing = true;
        const oth = OTH[cid];
        document.getElementById(`rlo-${oth}`).value = lo;
        document.getElementById(`rhi-${oth}`).value = hi;
        ST[oth].lo = lo;
        ST[oth].hi = hi;
        syncFill(oth);
        refresh(oth);
        _syncing = false;
      }
    }, 40);
  }

  rlo.addEventListener('input', onInput);
  rhi.addEventListener('input', onInput);
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOGGLE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════
function toggleDecade(cid) {
  ST[cid].decade = !ST[cid].decade;
  if (!ST[cid].decade) ST[cid].iso_decade = null;
  document.getElementById(`dbtn-${cid}`).classList.toggle('active', ST[cid].decade);
  refresh(cid);
}

function toggleAnomaly(cid) {
  ST[cid].anomaly = !ST[cid].anomaly;
  document.getElementById(`abtn-${cid}`).classList.toggle('active', ST[cid].anomaly);
  refresh(cid);
}

function toggleBoxplot(cid) {
  ST[cid].boxplot = !ST[cid].boxplot;
  document.getElementById(`bbtn-${cid}`).classList.toggle('active', ST[cid].boxplot);
  refresh(cid);
}

function toggleTrend(cid) {
  ST[cid].trend = !ST[cid].trend;
  document.getElementById(`tbtn-${cid}`).classList.toggle('active', ST[cid].trend);
  refresh(cid);
}

function toggleStats(cid) {
  const panel = document.getElementById(`stats-${cid}`);
  const btn   = document.getElementById(`stbtn-${cid}`);
  const open  = panel.style.display === 'block';
  panel.style.display = open ? 'none' : 'block';
  btn.classList.toggle('active', !open);
  if (!open) buildStatsTable(cid);
}

function toggleLink() {
  ST.linked = !ST.linked;
  const btn = document.getElementById('link-btn');
  btn.classList.toggle('active', ST.linked);
  btn.textContent = ST.linked ? '\uD83D\uDD17 Charts Linked' : '\u26D3 Unlinked';
  document.querySelector('.link-hint').textContent = ST.linked
    ? 'Slider and isolation sync between charts when linked'
    : 'Charts are independent';
}

function clearIso(cid) {
  ST[cid].iso        = null;
  ST[cid].iso_decade = null;
  if (ST.linked && !_syncing) {
    _syncing = true;
    ST[OTH[cid]].iso        = null;
    ST[OTH[cid]].iso_decade = null;
    refresh(OTH[cid]);
    _syncing = false;
  }
  refresh(cid);
}

function resetAll(cid) {
  ST[cid] = {
    lo: D.min_year, hi: D.max_year,
    decade: false, iso: null, iso_decade: null,
    anomaly: false, boxplot: false, trend: false,
  };
  ['abtn','bbtn','tbtn','stbtn','dbtn'].forEach(id => {
    document.getElementById(`${id}-${cid}`).classList.remove('active');
  });
  document.getElementById(`stats-${cid}`).style.display = 'none';
  document.getElementById(`rlo-${cid}`).value = D.min_year;
  document.getElementById(`rhi-${cid}`).value = D.max_year;
  syncFill(cid);
  refresh(cid);
}

// ═══════════════════════════════════════════════════════════════════════════
//  COPY MODAL
// ═══════════════════════════════════════════════════════════════════════════
async function showCopyModal(cid) {
  _copyCid = cid;
  document.getElementById('modal-loading').style.display = 'block';
  document.getElementById('modal-img').style.display     = 'none';
  document.getElementById('modal-actions').style.display = 'none';
  document.getElementById('modal-toast').style.display   = 'none';
  document.getElementById('copy-modal').style.display    = 'flex';

  const btn = document.getElementById(`copybtn-${cid}`);
  btn.textContent = '\u23F3 Generating\u2026';
  btn.disabled = true;

  try {
    const graphDiv = document.getElementById(`plt-${cid}`);
    const url = await Plotly.toImage(
      { data: graphDiv.data, layout: buildExportLayout(cid) },
      { format: 'png', width: 1600, height: 900 }
    );
    _copyUrl = url;
    const img = document.getElementById('modal-img');
    img.src = url;
    img.style.display = 'block';
    document.getElementById('modal-loading').style.display = 'none';
    document.getElementById('modal-actions').style.display = 'flex';
  } catch(e) {
    closeModal();
    alert('Error generating image: ' + e.message);
  } finally {
    btn.textContent = '\uD83D\uDCCB Copy Chart';
    btn.disabled = false;
  }
}

async function clipboardCopy() {
  if (!_copyUrl) return;
  try {
    const blob = await (await fetch(_copyUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    const toast = document.getElementById('modal-toast');
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2200);
  } catch(e) {
    alert('Copy failed. Right-click the image to copy or save it manually.');
  }
}

function downloadImg() {
  if (!_copyUrl) return;
  const s    = ST[_copyCid];
  const city = D.city_name.replace(/[^a-z0-9]/gi, '_');
  const rng  = (s.lo === D.min_year && s.hi === D.max_year)
    ? '' : `_${s.lo}-${s.hi}`;
  const a    = document.createElement('a');
  a.href     = _copyUrl;
  a.download = `ENSO_${_copyCid}_${city}${rng}.png`;
  a.click();
}

function closeModal() {
  document.getElementById('copy-modal').style.display = 'none';
}

// Close modal on backdrop click
document.getElementById('copy-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('copy-modal')) closeModal();
});

// ═══════════════════════════════════════════════════════════════════════════
//  INITIALISATION
// ═══════════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  ['temp', 'snow'].forEach(cid => {
    document.getElementById(`title-${cid}`).textContent = TITLES[cid];
    buildChart(cid);
    initSlider(cid);
    updateSubtitle(cid);
    buildLegend(cid);
    updateColoringIndicator(cid);
  });
});
</script>
</body>
</html>
"""


# ── Main ────────────────────────────────────────────────────────────────────
def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    logo_b64 = encode_logo()
    if logo_b64:
        print(f"Logo loaded: {LOGO_PATH}")
    else:
        print(f"Logo not found at {LOGO_PATH} — skipping")

    xl = pd.ExcelFile(EXCEL_FILE)
    print(f"\nFound {len(xl.sheet_names)} sheet(s): {xl.sheet_names}\n")

    success = 0
    for tab in xl.sheet_names:
        print(f"  Processing '{tab}'…", end="  ")
        try:
            city_name = get_city_name(xl, tab)
            df        = load_data(xl, tab)
            df        = add_jitter(df)
            app_data  = build_app_data(df, city_name, logo_b64)

            html = HTML \
                .replace("__APP_DATA__", json.dumps(app_data, ensure_ascii=False)) \
                .replace("__CITY_NAME__", city_name)

            out = OUTPUT_DIR / f"ENSO_Charts_{tab}.html"
            out.write_text(html, encoding="utf-8")
            print(f"✓  {city_name}  →  {out.name}  ({len(df)} seasons)")
            success += 1
        except Exception as e:
            print(f"✗  ERROR: {e}")

    print(f"\nDone — {success}/{len(xl.sheet_names)} cities written to {OUTPUT_DIR}/")

    # Quick phase-stats summary for the first successful city
    if success:
        try:
            tab = xl.sheet_names[0]
            df  = add_jitter(load_data(xl, tab))
            stats = df.groupby("ENSO_Code")[["Temp", "Snowfall"]].agg(
                ["mean", "median", "count"]
            )
            code_to_label = {code: lbl for code, _, lbl, _ in PHASES}
            stats.index = [code_to_label.get(i, str(i)) for i in stats.index]
            print("\nPhase summary — first city:\n", stats.round(1).to_string())
        except Exception:
            pass


if __name__ == "__main__":
    main()
