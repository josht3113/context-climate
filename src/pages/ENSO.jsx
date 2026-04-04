import { useState } from "react";

// ── City registry ─────────────────────────────────────────────────────────────
const CITIES = [
  // Northeast
  { tab: "NYC",  name: "New York City",      region: "Northeast"   },
  { tab: "BOS",  name: "Boston",             region: "Northeast"   },
  { tab: "PHL",  name: "Philadelphia",       region: "Northeast"   },
  { tab: "ALB",  name: "Albany",             region: "Northeast"   },
  { tab: "PWM",  name: "Portland, ME",       region: "Northeast"   },
  // Mid-Atlantic
  { tab: "DCA",  name: "Washington D.C.",    region: "Mid-Atlantic" },
  { tab: "RIC",  name: "Richmond",           region: "Mid-Atlantic" },
  // Midwest
  { tab: "ORD",  name: "Chicago",            region: "Midwest"     },
  { tab: "CLE",  name: "Cleveland",          region: "Midwest"     },
  { tab: "IND",  name: "Indianapolis",       region: "Midwest"     },
  { tab: "OMA",  name: "Omaha",              region: "Midwest"     },
  { tab: "MSP",  name: "Minneapolis",        region: "Midwest"     },
  // West
  { tab: "SEA",  name: "Seattle",            region: "West"        },
  { tab: "SLC",  name: "Salt Lake City",     region: "West"        },
  { tab: "RNO",  name: "Reno",               region: "West"        },
  { tab: "ABQ",  name: "Albuquerque",        region: "West"        },
  { tab: "COS",  name: "Colorado Springs",   region: "West"        },
  { tab: "FLG",  name: "Flagstaff",          region: "West"        },
  // Alaska
  { tab: "PAFA", name: "Fairbanks, AK",      region: "Alaska"      },
];

const REGIONS = ["Northeast", "Mid-Atlantic", "Midwest", "West", "Alaska"];

// ── Inline styles ─────────────────────────────────────────────────────────────
const S = {
  page: {
    background: "#0d0d0d",
    minHeight: "100vh",
    color: "#eee",
    fontFamily: "Arial, sans-serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "28px 16px 48px",
    gap: "20px",
  },
  heading: {
    textAlign: "center",
    fontSize: "22px",
    fontWeight: "bold",
    color: "#fff",
    letterSpacing: "0.3px",
    margin: 0,
  },
  subheading: {
    textAlign: "center",
    fontSize: "13px",
    color: "#666",
    margin: 0,
  },
  panel: {
    width: "min(960px, 100%)",
    background: "#161616",
    border: "1px solid #2a2a2a",
    borderRadius: "12px",
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  regionBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  regionLabel: {
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "1px",
    color: "#555",
  },
  cityRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  btn: (active) => ({
    padding: "7px 14px",
    borderRadius: "6px",
    border: `1px solid ${active ? "#5B9BD5" : "#2e2e2e"}`,
    background: active ? "#1e3a60" : "#1e1e1e",
    color: active ? "#fff" : "#aaa",
    fontSize: "12.5px",
    cursor: "pointer",
    transition: "all 0.13s",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
  }),
  activeLabel: {
    textAlign: "center",
    fontSize: "13px",
    color: "#5B9BD5",
  },
  frameWrap: {
    width: "min(960px, 100%)",
    borderRadius: "12px",
    overflow: "hidden",
    border: "1px solid #2a2a2a",
    background: "#0d0d0d",
  },
  iframe: {
    width: "100%",
    height: "1160px",
    border: "none",
    display: "block",
    background: "#0d0d0d",
  },
};

export default function ENSO() {
  const [selected, setSelected] = useState(CITIES[0]);

  // HTML files live in /public, served from the site root
  const src = `/ENSO_Charts_${selected.tab}.html`;

  return (
    <div style={S.page}>
      <h1 style={S.heading}>ENSO Phase Weather Charts</h1>
      <p style={S.subheading}>
        Historical winter temperature &amp; snowfall by ENSO phase · Select a city below
      </p>

      {/* ── City selector ── */}
      <div style={S.panel}>
        {REGIONS.map((region) => (
          <div key={region} style={S.regionBlock}>
            <div style={S.regionLabel}>{region}</div>
            <div style={S.cityRow}>
              {CITIES.filter((c) => c.region === region).map((city) => {
                const active = city.tab === selected.tab;
                return (
                  <button
                    key={city.tab}
                    style={S.btn(active)}
                    onClick={() => setSelected(city)}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "#252525";
                        e.currentTarget.style.borderColor = "#444";
                        e.currentTarget.style.color = "#ddd";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "#1e1e1e";
                        e.currentTarget.style.borderColor = "#2e2e2e";
                        e.currentTarget.style.color = "#aaa";
                      }
                    }}
                  >
                    {city.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Active city label ── */}
      <div style={S.activeLabel}>
        Viewing: <strong>{selected.name}</strong>
      </div>

      {/* ── Chart iframe ── */}
      <div style={S.frameWrap}>
       <iframe
  key={src}
  src={src}
  style={S.iframe}
  title={`ENSO Charts — ${selected.name}`}
/>
      </div>
    </div>
  );
}
