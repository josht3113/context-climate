"""Build public/vocab-terms.json from the vocabulary Sheet.

Usage:
    python scripts/build_vocab_terms.py path/to/ESS_Vocabulary_Bank.xlsx

The workbook is the Sheet "ESS Vocabulary Bank" downloaded as .xlsx.
Each chapter is a tab named "Ch N entries" with these columns:
    Term, Status, §, Type, Definition, Everyday meaning, Fill-in 1, Fill-in 2,
    Fill-in 3, Mix-up with, Word parts, Also called, ESSRT, Regents (first seen),
    Image idea, Note, Diagram, Tool link
Rows whose Status is "Cut" are skipped. "Also in Ch N" in the Note column adds
the term to chapter N's deck. Diagram names a file in public/vocab-img/.

To add a chapter: add a "Ch N entries" tab to the Sheet and an entry to
CHAPTERS below. Uses only the Python standard library.
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

CHAPTERS = [
    (1, "Prologue & Introduction", ["Thinking Like a Scientist", "Measurement & Math Skills", "Reading Graphs", "Density",
                                    "Earth’s Spheres & Systems", "Earth’s History", "Earth’s Shape", "Latitude & Longitude"]),
    (2, "Rotation, Revolution & Apparent Motions", ["Models of the Solar System", "Rotation", "Revolution", "Planets & Retrograde Motion"]),
    (3, "Seasons & the Sun’s Path", ["Why Earth Has Seasons", "Intensity & Duration of Insolation",
                                     "The Sun’s Path in Sea Cliff", "The Sun’s Path at Other Latitudes"]),
    (4, "Solar System & Orbits", ["Objects in the Solar System", "How the Solar System Formed", "Gravity: Two Models",
                                  "Kepler’s Laws & Eccentricity", "Putting It Together"]),
]

# Tool link name (as typed in the Sheet) -> route on contextclimate.io
TOOLS = {
    "The Turning Sky": "/earthandspace/turning-sky",
    "The Coriolis Effect": "/earthandspace/coriolis-effect",
    "Planetary Retrograde Motion": "/earthandspace/planetary-retrograde",
    "Foucault Pendulum": "/earthandspace/foucault-pendulum",
    "Angle of Insolation": "/earthandspace/angle-of-insolation",
    "The Sun’s Path": "/earthandspace/suns-path",
    "Seasons Explorer": "/earthandspace/seasons-explorer",
    "Gravity & Orbits": "/earthandspace/gravity-orbits",
    "The Inverse Square Law": "/earthandspace/inverse-square-law",
    "Kepler’s First Law": "/earthandspace/kepler-law1-ellipses",
    "Kepler’s Second Law": "/earthandspace/kepler-law2-areas",
    "Kepler’s Third Law": "/earthandspace/kepler-law3-periods",
    "Planet Formation": "/earthandspace/planet-formation",
    "The Core Furnace": "/earthandspace/core-furnace",
    "ESSRT p. 2 Solar System Objects": "/ESSRT_2",
    "ESSRT pp. 6–7 Geologic History": "/ESSRT_6_7",
    "ESSRT pp. 8–10 Bedrock Map": "/ESSRT_8_9_10",
    "ESSRT p. 11 Earth’s Interior": "/ESSRT_11",
}

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def read_xlsx(path):
    """Return {sheet name: [[cell text, ...], ...]} using only the standard library."""
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    target = {r.get("Id"): r.get("Target") for r in rels}
    out = {}
    for sh in wb.find("m:sheets", NS):
        t = target[sh.get(REL)].lstrip("/")
        t = t if t.startswith("xl/") else "xl/" + t
        rows = []
        for row in ET.fromstring(z.read(t)).iter("{%s}row" % NS["m"]):
            cells = {}
            for c in row.findall("m:c", NS):
                v = c.find("m:v", NS)
                if c.get("t") == "s" and v is not None:
                    val = shared[int(v.text)]
                elif c.get("t") == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter("{%s}t" % NS["m"]))
                else:
                    val = v.text if v is not None else ""
                cells[col_index(c.get("r"))] = val
            rows.append([cells.get(i, "") for i in range(max(cells) + 1)] if cells else [])
        out[sh.get("name")] = rows
    return out


def split(x):
    return [p.strip() for p in (x or "").split(";") if p.strip()]


def main(xlsx):
    book = read_xlsx(xlsx)
    terms, ids = [], set()
    for n, _, _ in CHAPTERS:
        rows = book.get(f"Ch {n} entries")
        if rows is None:
            sys.exit(f'Missing tab "Ch {n} entries"')
        head = [h.strip() for h in rows[0]]
        col = {h: i for i, h in enumerate(head)}
        get = lambda r, h: (r[col[h]].strip() if col.get(h) is not None and col[h] < len(r) else "")
        for r in rows[1:]:
            term = get(r, "Term")
            if not term or get(r, "Status") == "Cut":
                continue
            note = get(r, "Note")
            m = re.search(r"Also in ([^;.(]*)", note)
            also = sorted({int(x) for x in re.findall(r"Ch (\d+)", m.group(1))} - {n}) if m else []
            tool_name = get(r, "Tool link")
            if tool_name and tool_name not in TOOLS:
                sys.exit(f'Unknown tool link "{tool_name}" for "{term}" — add it to TOOLS')
            img = get(r, "Diagram") or None
            if img and not Path(__file__).resolve().parent.parent.joinpath("public", "vocab-img", img + ".svg").exists():
                sys.exit(f'Missing diagram public/vocab-img/{img}.svg for "{term}"')
            tid = f"c{n}-" + re.sub(r"[^a-z0-9]+", "-", term.lower()).strip("-")
            if tid in ids:
                sys.exit(f"Duplicate term id {tid}")
            ids.add(tid)
            terms.append({
                "id": tid, "ch": n, "also": also, "sec": int(float(get(r, "§") or 1)), "term": term,
                "type": get(r, "Type"), "def": get(r, "Definition"), "every": get(r, "Everyday meaning") or None,
                "sents": [s for s in (get(r, "Fill-in 1"), get(r, "Fill-in 2"), get(r, "Fill-in 3")) if s],
                "mix": [re.sub(r"\s*\(.*?\)", "", x).strip() for x in split(get(r, "Mix-up with"))],
                "parts": get(r, "Word parts") or None, "aka": split(get(r, "Also called")),
                "essrt": get(r, "ESSRT") or None, "reg": get(r, "Regents (first seen)") or None,
                "img": img, "tool": tool_name or None,
            })
    tools = {name: {"name": name, "route": route} for name, route in TOOLS.items()}
    out = {"chapters": [{"n": n, "title": t, "sections": s} for n, t, s in CHAPTERS], "tools": tools, "terms": terms}
    dest = Path(__file__).resolve().parent.parent / "public" / "vocab-terms.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(terms)} terms to {dest}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
