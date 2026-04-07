import { useState, useEffect } from "react";

// ── Mobile breakpoint hook ────────────────────────────────────────────────────
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

// ── Inline styles ─────────────────────────────────────────────────────────────
const S = {
  page: (mobile) => ({
    background: "#0d0d0d",
    minHeight: "100vh",
    color: "#eee",
    fontFamily: "Arial, sans-serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: mobile ? "20px 8px 48px" : "28px 16px 48px",
    gap: "20px",
  }),
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
  frameWrap: (mobile) => ({
    width: mobile ? "100%" : "min(960px, 100%)",
    borderRadius: mobile ? "8px" : "12px",
    overflow: "hidden",
    border: "1px solid #2a2a2a",
    background: "#0d0d0d",
    boxSizing: "border-box",
  }),
  iframe: (mobile) => ({
    width: "100%",
    height: mobile ? "88vh" : "1260px",
    border: "none",
    display: "block",
    background: "#0d0d0d",
  }),
};

export default function Hurricanes() {
  const isMobile = useIsMobile();

  return (
    <div style={S.page(isMobile)}>
      <h1 style={S.heading}>Tropical Cyclones ENSO Phase Comparison</h1>
      <p style={S.subheading}>
        Atlantic &amp; Eastern Pacific hurricane activity stratified by ENSO phase · 1851–2025
      </p>

      {/* ── Chart iframe ── */}
      <div style={S.frameWrap(isMobile)}>
        <iframe
          src="/context-climate/ENSO_Charts_Hurricanes.html"
          style={S.iframe(isMobile)}
          title="Tropical Cyclones ENSO Phase Comparison"
        />
      </div>
    </div>
  );
}
