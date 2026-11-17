"""One-off: Wikimedia Commons photos for ESSRT pp.16-17 mineral cards.
Run 1 (no photos/select.json): candidate contact sheets + candidates.json per mineral.
Run 2 (photos/select.json present): download chosen files at 1600 px + license manifest."""
import json, os, sys, time, io, urllib.parse, urllib.request
from PIL import Image, ImageDraw, ImageFont
UA = "ContextClimate-ESSRT-photos/1.0 (https://contextclimate.io; josht3113@github)"
API = "https://commons.wikimedia.org/w/api.php"
OK = ("cc by", "cc-by", "cc0", "public domain", "pd")
TERMS = {
 "quartz":["Quartz"], "corundum":["Corundum","Sapphire crystal"], "garnet":["Almandine","Garnet"],
 "olivine":["Olivine","Forsterite","Peridot"], "staurolite":["Staurolite"], "kyanite":["Kyanite"],
 "beryl":["Beryl","Aquamarine"], "amphibole":["Hornblende"], "pyroxene":["Augite","Pyroxene"],
 "plag-ca":["Anorthite","Labradorite","Bytownite"], "plag-na":["Albite","Oligoclase"],
 "kspar":["Orthoclase","Microcline","K-feldspar"], "hematite":["Hematite","Specularite"],
 "limonite":["Limonite","Goethite"], "sulfur":["Sulfur","Sulphur"], "malachite":["Malachite"],
 "muscovite":["Muscovite"], "biotite":["Biotite"], "chlorite":["Clinochlore","Chlorite"],
 "talc":["Talc"], "gypsum":["Gypsum","Selenite"], "wollastonite":["Wollastonite"],
 "halite":["Halite"], "calcite":["Calcite","Iceland spar"], "dolomite":["Dolomite"],
 "fluorite":["Fluorite"], "magnetite":["Magnetite"], "graphite":["Graphite"], "galena":["Galena"],
 "pyrite":["Pyrite"], "chalcopyrite":["Chalcopyrite"], "ilmenite":["Ilmenite"],
}
def get(params):
    params = dict(params, format="json", formatversion=2)
    url = API + "?" + urllib.parse.urlencode(params)
    for k in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            return json.load(urllib.request.urlopen(req, timeout=60))
        except Exception as e:
            print("retry", e, file=sys.stderr); time.sleep(3 + 4 * k)
    return {}
def fetch(url):
    for k in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            return urllib.request.urlopen(req, timeout=120).read()
        except Exception as e:
            print("retry", url, e, file=sys.stderr); time.sleep(3 + 4 * k)
    return None
def search(q, width, n=25):
    d = get({"action":"query","generator":"search","gsrsearch":q,"gsrnamespace":6,"gsrlimit":n,
             "prop":"imageinfo","iiprop":"url|extmetadata|size|mime","iiurlwidth":width})
    out = []
    for p in (d.get("query") or {}).get("pages", []):
        ii = (p.get("imageinfo") or [{}])[0]; md = ii.get("extmetadata", {})
        lic = md.get("LicenseShortName", {}).get("value", "")
        if ii.get("mime") not in ("image/jpeg", "image/png"): continue
        if not lic.lower().startswith(OK): continue
        if min(ii.get("width", 0), ii.get("height", 0)) < 900: continue
        out.append({"title": p["title"], "thumb": ii.get("thumburl"), "page": ii.get("descriptionurl"),
                    "license": lic, "licenseUrl": md.get("LicenseUrl", {}).get("value", ""),
                    "artist": md.get("Artist", {}).get("value", ""), "w": ii["width"], "h": ii["height"],
                    "index": p.get("index", 99)})
    return sorted(out, key=lambda c: c["index"])
def run1():
    os.makedirs("photos/candidates", exist_ok=True)
    try: font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
    except Exception: font = ImageFont.load_default()
    for key, terms in TERMS.items():
        seen, cands = set(), []
        for t in terms:
            for q in (f'intitle:"{t}" insource:"Lavinsky"', f'intitle:"{t}" filetype:bitmap'):
                for c in search(q, 260):
                    if c["title"] in seen: continue
                    seen.add(c["title"]); cands.append(c)
        cands = cands[:36]
        cell = 260; cols = 6; rows = max(1, (len(cands) + cols - 1) // cols)
        sheet = Image.new("RGB", (cols * cell, rows * cell), (30, 30, 30)); dr = ImageDraw.Draw(sheet)
        for i, c in enumerate(cands):
            b = fetch(c["thumb"]) if c["thumb"] else None
            if b:
                try:
                    im = Image.open(io.BytesIO(b)).convert("RGB"); im.thumbnail((cell - 6, cell - 6))
                    sheet.paste(im, ((i % cols) * cell + 3, (i // cols) * cell + 3))
                except Exception: pass
            x, y = (i % cols) * cell, (i // cols) * cell
            dr.rectangle([x, y, x + 34, y + 28], fill=(0, 0, 0)); dr.text((x + 4, y + 2), str(i), fill=(255, 220, 0), font=font)
            time.sleep(0.15)
        sheet.save(f"photos/candidates/{key}.jpg", quality=80)
        json.dump(cands, open(f"photos/candidates/{key}.json", "w"), indent=1)
        print(key, len(cands))
def run2():
    sel = json.load(open("photos/select.json")); os.makedirs("photos/full", exist_ok=True); man = {}
    for key, titles in sel.items():
        man[key] = []
        for j, t in enumerate(titles):
            d = get({"action":"query","titles":t,"prop":"imageinfo","iiprop":"url|extmetadata","iiurlwidth":1600})
            p = d["query"]["pages"][0]; ii = p["imageinfo"][0]; md = ii.get("extmetadata", {})
            b = fetch(ii["thumburl"]); fn = f"photos/full/{key}-{j}.jpg"
            Image.open(io.BytesIO(b)).convert("RGB").save(fn, quality=92)
            man[key].append({"file": fn, "title": t, "page": ii["descriptionurl"],
                "license": md.get("LicenseShortName", {}).get("value", ""),
                "licenseUrl": md.get("LicenseUrl", {}).get("value", ""),
                "artist": md.get("Artist", {}).get("value", ""),
                "credit": md.get("Credit", {}).get("value", "")})
            print(fn); time.sleep(0.3)
    json.dump(man, open("photos/manifest.json", "w"), indent=1)
if __name__ == "__main__":
    run2() if os.path.exists("photos/select.json") else run1()
