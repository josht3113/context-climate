#!/usr/bin/env python3
"""
One-off data build for ESSRT_20.html (Surface Ocean Currents, ESSRT 2026 p. 20).

Everything is fetched from NOAA on the Actions runner and reduced to small,
self-describing files in --out:

  ocean.json     drifter-climatology currents (Laurindo et al. 2017, AOML GDP
                 v3.x annual means), 0.5 deg, companded int8; eddy speed from
                 the drifter variance file; OISST v2.1 1991-2020 annual-mean
                 SST, 0.5 deg, uint8; per-city monthly coastal SST
  drifters.json  real GDP drifter tracks (6-hourly QC, decimated to daily)
                 that pass through boxes on the named currents
  normals.json   1991-2020 monthly normals for the international cities
                 (GHCN-Daily, with Meteostat monthly as a fallback)
  report.txt     everything that happened, coverage, directory listings

Every section is independent: a failure is logged and the rest still runs.
"""
import argparse, base64, csv, datetime as dt, gzip, io, json, math, os, subprocess, sys, time, traceback
import numpy as np

UA = 'contextclimate-p20/1.0 (+https://contextclimate.io)'
LOG = []


def log(*a):
    s = ' '.join(str(x) for x in a)
    print(s, flush=True)
    LOG.append(s)


def fetch(url, dest=None, max_time=900, tries=4):
    """curl with retries; returns bytes (dest=None) or path."""
    last = ''
    for k in range(tries):
        tmp = (dest or '/tmp/_fetch') + '.part'
        cmd = ['curl', '-sS', '-L', '--http1.1', '-A', UA, '--max-time', str(max_time), '-o', tmp, '-w', '%{http_code}', url]
        r = subprocess.run(cmd, capture_output=True, text=True)
        code = (r.stdout or '').strip()[-3:]
        if r.returncode == 0 and code == '200':
            if dest:
                os.replace(tmp, dest)
                return dest
            b = open(tmp, 'rb').read()
            os.remove(tmp)
            return b
        last = f'rc={r.returncode} http={code} {r.stderr.strip()[:200]}'
        log(f'  retry {k + 1} {url[:140]}: {last}')
        time.sleep(4 + 6 * k)
    raise RuntimeError(f'fetch failed {last}: {url}')


def b64(a):
    return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode('ascii')


# ─────────────────────────────────────────────────────────────────────────────
# Cities (international pairs + the three US cities, for the SST lookup)
CITIES = [
    # key, name, lat, lon, group
    ('lima', 'Lima, Peru', -12.02, -77.11, 'intl'),
    ('salvador', 'Salvador, Brazil', -12.91, -38.33, 'intl'),
    ('portnolloth', 'Port Nolloth, South Africa', -29.24, 16.87, 'intl'),
    ('alexanderbay', 'Alexander Bay, South Africa', -28.57, 16.53, 'intl'),
    ('durban', 'Durban, South Africa', -29.97, 30.95, 'intl'),
    ('bergen', 'Bergen, Norway', 60.38, 5.33, 'intl'),
    ('nain', 'Nain, Labrador', 56.55, -61.68, 'intl'),
    ('hopedale', 'Hopedale, Labrador', 55.45, -60.23, 'intl'),
    ('cartwright', 'Cartwright, Labrador', 53.71, -57.04, 'intl'),
    ('saglek', 'Saglek, Labrador', 58.33, -62.59, 'intl'),
    ('porto', 'Porto, Portugal', 41.24, -8.68, 'intl'),
    ('lisbon', 'Lisbon, Portugal', 38.77, -9.13, 'intl'),
    ('islip', 'Islip, NY', 40.79, -73.10, 'us'),
    ('sanfrancisco', 'San Francisco, CA', 37.62, -122.37, 'us'),
    ('norfolk', 'Norfolk, VA', 36.90, -76.19, 'us'),
]

# Boxes on named currents for real drifter tracks: (key, name, lat0, lat1, lon0, lon1)
BOXES = [
    ('gulf', 'Gulf Stream off Cape Hatteras', 34.0, 36.5, -76.0, -73.5),
    ('gulf_li', 'Gulf Stream south of Long Island', 37.0, 39.5, -72.0, -68.0),
    ('kuroshio', 'Kuroshio off Japan', 30.0, 34.0, 131.0, 137.0),
    ('agulhas', 'Agulhas Current', -33.5, -30.0, 29.0, 32.0),
    ('brazil', 'Brazil Current', -25.0, -21.0, -42.0, -38.0),
    ('california', 'California Current', 34.0, 39.0, -127.0, -123.5),
    ('canary', 'Canary Current', 26.0, 32.0, -17.0, -12.0),
    ('peru', 'Peru Current', -18.0, -10.0, -81.0, -76.0),
    ('benguela', 'Benguela Current', -30.0, -24.0, 11.0, 14.5),
    ('nec_pac', 'N. Equatorial Current (Pacific)', 10.0, 16.0, -150.0, -135.0),
    ('acc', 'Circum-Antarctic Current (Drake Passage)', -58.0, -54.0, -66.0, -58.0),
    ('labrador', 'Labrador Current', 52.0, 57.0, -57.0, -52.0),
    ('norwegian', 'Norwegian Current', 62.0, 66.0, 0.0, 6.0),
    ('ecc_pac', 'Equatorial Countercurrent (Pacific)', 5.0, 8.0, -150.0, -120.0),
]

# ─────────────────────────────────────────────────────────────────────────────


def section_ocean(out, work):
    import netCDF4 as nc
    res = {}
    # ── drifter climatology, annual means
    src = None
    for u in ['https://erddap.aoml.noaa.gov/gdp/erddap/files/drifter_annualmeans/drifter_annualmeans.nc',
              'https://www.aoml.noaa.gov/ftp/pub/phod/lumpkin/drifter_climatology/drifter_annualmeans.nc',
              'https://www.aoml.noaa.gov/ftp/phod/pub/lumpkin/drifter_climatology/drifter_annualmeans.nc']:
        try:
            src = fetch(u, os.path.join(work, 'drifter_annualmeans.nc'))
            log('drifter climatology from', u); res['cur_url'] = u
            break
        except Exception as e:
            log('  drifter climatology failed', u, e)
    if src:
        d = nc.Dataset(src)
        log('drifter nc vars:', {k: (v.dimensions, v.shape) for k, v in d.variables.items()})
        log('drifter nc attrs:', {k: str(d.getncattr(k))[:200] for k in d.ncattrs()})
        lat = np.array(d.variables['latitude'][:] if 'latitude' in d.variables else d.variables['Lat'][:]).astype(float).ravel()
        lon = np.array(d.variables['longitude'][:] if 'longitude' in d.variables else d.variables['Lon'][:]).astype(float).ravel()

        def grid(name):
            v = d.variables[name]
            a = np.ma.filled(v[:].astype(float), np.nan)
            a = np.squeeze(a)
            dims = [x.lower() for x in v.dimensions if x.lower() not in ('time',)]
            if a.shape == (len(lon), len(lat)):
                a = a.T
            assert a.shape == (len(lat), len(lon)), (name, a.shape)
            a[np.abs(a) > 1e5] = np.nan
            return a
        U, V, N = grid('U'), grid('V'), grid('N')
        SSTd = grid('SST')
        if lat[0] > lat[-1]:
            lat = lat[::-1]; U = U[::-1]; V = V[::-1]; N = N[::-1]; SSTd = SSTd[::-1]
        lon = ((lon + 180) % 360) - 180
        o = np.argsort(lon); lon = lon[o]; U = U[:, o]; V = V[:, o]; N = N[:, o]; SSTd = SSTd[:, o]
        log(f'drifter grid {len(lat)}x{len(lon)} lat {lat[0]}..{lat[-1]} lon {lon[0]}..{lon[-1]}; '
            f'max speed {np.nanmax(np.hypot(U, V)):.2f} m/s; valid {np.isfinite(U).mean():.3f}')
        # coarsen to 0.5 deg (2x2 block mean of valid cells); keep the native 0.25 for a
        # regional Gulf Stream / LI inset as well
        def coarsen(a, f):
            ny, nx = a.shape[0] // f * f, a.shape[1] // f * f
            b = a[:ny, :nx].reshape(ny // f, f, nx // f, f)
            return np.nanmean(b, axis=(1, 3))
        import warnings
        warnings.simplefilter('ignore')
        U5, V5, N5 = coarsen(U, 2), coarsen(V, 2), coarsen(N, 2)
        lat5 = coarsen(lat[:, None], 2)[:, 0] if False else lat[: len(lat) // 2 * 2].reshape(-1, 2).mean(1)
        lon5 = lon[: len(lon) // 2 * 2].reshape(-1, 2).mean(1)
        # companded int8: q = round(127*sign*sqrt(|v|/VMAX)), VMAX 2.0 m/s
        VMAX = 2.0
        def comp(a):
            q = np.where(np.isfinite(a), np.round(127 * np.sign(a) * np.sqrt(np.clip(np.abs(a), 0, VMAX) / VMAX)), -128)
            return q.astype(np.int8)
        res['cur'] = {'lat0': float(lat5[0]), 'lon0': float(lon5[0]), 'dlat': float(lat5[1] - lat5[0]), 'dlon': float(lon5[1] - lon5[0]),
                      'ny': int(len(lat5)), 'nx': int(len(lon5)), 'vmax': VMAX, 'enc': 'int8 sqrt-companded, -128 missing, rows south->north',
                      'u': b64(comp(U5)), 'v': b64(comp(V5)),
                      'n': b64(np.where(np.isfinite(N5), np.clip(np.round(N5), 0, 255), 0).astype(np.uint8)),
                      'version': str(getattr(d, 'version', '')), 'datadate': str(getattr(d, 'datadate', ''))}
        # drifter SST (bulk) at 0.5 deg too, for the "where drifters measured" comparison
        res['dsst'] = {'enc': 'uint8 (T+2)*5, 255 missing', 'v': b64(np.where(np.isfinite(coarsen(SSTd, 2)), np.clip(np.round((coarsen(SSTd, 2) + 2) * 5), 0, 254), 255).astype(np.uint8))}
        # 0.25 deg window for zoomed views: NW Atlantic 25-50N, 82-40W
        def window(a, la0, la1, lo0, lo1):
            iy = np.where((lat >= la0) & (lat <= la1))[0]; ix = np.where((lon >= lo0) & (lon <= lo1))[0]
            return a[np.ix_(iy, ix)], lat[iy], lon[ix]
        wu, wl, wo = window(U, 24.0, 50.0, -82.0, -40.0)
        wv, _, _ = window(V, 24.0, 50.0, -82.0, -40.0)
        res['cur_nwa'] = {'lat0': float(wl[0]), 'lon0': float(wo[0]), 'dlat': 0.25, 'dlon': 0.25, 'ny': int(len(wl)), 'nx': int(len(wo)),
                          'vmax': VMAX, 'u': b64(comp(wu)), 'v': b64(comp(wv))}
    # ── eddy variance
    for u in ['https://erddap.aoml.noaa.gov/gdp/erddap/files/drifter_currentvariance/drifter_variance.nc',
              'https://www.aoml.noaa.gov/phod/dac/drifter_variance.nc']:
        try:
            p = fetch(u, os.path.join(work, 'drifter_variance.nc'))
            d2 = nc.Dataset(p)
            log('variance nc vars:', {k: (v.dimensions, v.shape) for k, v in d2.variables.items()})
            la = np.array(d2.variables['latitude'][:] if 'latitude' in d2.variables else d2.variables['Lat'][:]).astype(float).ravel()
            lo = np.array(d2.variables['longitude'][:] if 'longitude' in d2.variables else d2.variables['Lon'][:]).astype(float).ravel()
            def g2(name):
                a = np.squeeze(np.ma.filled(d2.variables[name][:].astype(float), np.nan))
                if a.shape == (len(lo), len(la)):
                    a = a.T
                a[np.abs(a) > 1e5] = np.nan
                return a
            up, vp = g2('Up2bar'), g2('Vp2bar')
            if la[0] > la[-1]:
                la = la[::-1]; up = up[::-1]; vp = vp[::-1]
            lo = ((lo + 180) % 360) - 180; o = np.argsort(lo); lo = lo[o]; up = up[:, o]; vp = vp[:, o]
            eke = np.sqrt(np.clip(up + vp, 0, None))         # rms eddy speed, m/s
            # 1 deg
            f = max(1, int(round(1.0 / abs(la[1] - la[0]))))
            ny, nx = eke.shape[0] // f * f, eke.shape[1] // f * f
            e1 = np.nanmean(eke[:ny, :nx].reshape(ny // f, f, nx // f, f), axis=(1, 3))
            la1 = la[:ny].reshape(-1, f).mean(1); lo1 = lo[:nx].reshape(-1, f).mean(1)
            res['eddy'] = {'lat0': float(la1[0]), 'lon0': float(lo1[0]), 'dlat': float(la1[1] - la1[0]), 'dlon': float(lo1[1] - lo1[0]),
                           'ny': int(len(la1)), 'nx': int(len(lo1)), 'enc': 'uint8 rms eddy speed cm/s (0.5 cm/s steps), 255 missing',
                           'v': b64(np.where(np.isfinite(e1), np.clip(np.round(e1 * 200), 0, 254), 255).astype(np.uint8))}
            log(f'eddy rms speed grid {e1.shape}, median {np.nanmedian(e1):.3f} max {np.nanmax(e1):.3f} m/s; from {u}')
            break
        except Exception as e:
            log('  variance failed', u, e)
    # ── OISST v2.1 1991-2020 monthly LTM
    sst = None
    for u in ['https://downloads.psl.noaa.gov/Datasets/noaa.oisst.v2.highres/sst.mon.ltm.1991-2020.nc',
              'https://psl.noaa.gov/thredds/fileServer/Datasets/noaa.oisst.v2.highres/sst.mon.ltm.1991-2020.nc',
              'https://downloads.psl.noaa.gov/Datasets/noaa.oisst.v2/sst.ltm.1991-2020.nc',
              'https://downloads.psl.noaa.gov/Datasets/noaa.ersst.v5/sst.mon.ltm.1991-2020.nc']:
        try:
            p = fetch(u, os.path.join(work, 'sst_ltm.nc'))
            sst = nc.Dataset(p); res['sst_url'] = u
            log('SST LTM from', u, {k: (v.dimensions, v.shape) for k, v in sst.variables.items()})
            break
        except Exception as e:
            log('  SST failed', u, e)
    try:
        lst = fetch('https://downloads.psl.noaa.gov/Datasets/noaa.oisst.v2.highres/', max_time=120).decode('utf8', 'ignore')
        log('PSL highres listing (ltm lines):\n' + '\n'.join(l.strip()[:200] for l in lst.splitlines() if 'ltm' in l or '1991' in l))
    except Exception as e:
        log('  listing failed', e)
    if sst is not None:
        la = np.array(sst.variables['lat'][:]).astype(float); lo = np.array(sst.variables['lon'][:]).astype(float)
        m = np.ma.filled(sst.variables['sst'][:].astype(float), np.nan)   # (12, lat, lon)
        m[(m < -5) | (m > 45)] = np.nan
        if la[0] > la[-1]:
            la = la[::-1]; m = m[:, ::-1]
        lo = ((lo + 180) % 360) - 180; o = np.argsort(lo); lo = lo[o]; m = m[:, :, o]
        # ice: OISST LTM sets ice-covered water to about -1.8; keep as is
        ann = np.nanmean(m, axis=0)
        f = max(1, int(round(0.5 / abs(la[1] - la[0]))))
        def co(a):
            ny, nx = a.shape[0] // f * f, a.shape[1] // f * f
            return np.nanmean(a[:ny, :nx].reshape(ny // f, f, nx // f, f), axis=(1, 3))
        a5 = co(ann); la5 = la[: len(la) // f * f].reshape(-1, f).mean(1); lo5 = lo[: len(lo) // f * f].reshape(-1, f).mean(1)
        enc = lambda a: np.where(np.isfinite(a), np.clip(np.round((a + 2) * 5), 0, 254), 255).astype(np.uint8)
        res['sst'] = {'lat0': float(la5[0]), 'lon0': float(lo5[0]), 'dlat': float(la5[1] - la5[0]), 'dlon': float(lo5[1] - lo5[0]),
                      'ny': int(len(la5)), 'nx': int(len(lo5)), 'enc': 'uint8 (T+2)*5 degC, 255 land', 'ann': b64(enc(a5))}
        # Feb and Aug too (seasonal extremes)
        res['sst']['feb'] = b64(enc(co(m[1]))); res['sst']['aug'] = b64(enc(co(m[7])))
        log(f'SST 0.5deg {a5.shape}; global ocean mean {np.nanmean(a5):.2f}')
        # monthly coastal SST at each city: nearest valid cell, prefer within 120 km
        R = 6371.0
        LA, LO = np.meshgrid(la, lo, indexing='ij')
        cs = {}
        for key, name, clat, clon, grp in CITIES:
            dlon = np.radians(((LO - clon + 180) % 360) - 180)
            dist = R * np.arccos(np.clip(np.sin(np.radians(LA)) * np.sin(np.radians(clat)) + np.cos(np.radians(LA)) * np.cos(np.radians(clat)) * np.cos(dlon), -1, 1))
            dist[~np.isfinite(ann)] = np.inf
            # skip enclosed bays: require the cell to be at least 15 km from the coast city point
            dist[dist < 15] = np.inf
            k = np.unravel_index(np.argmin(dist), dist.shape)
            cs[key] = {'lat': float(la[k[0]]), 'lon': float(lo[k[1]]), 'km': float(dist[k]), 'm': [round(float(m[i][k]), 2) for i in range(12)]}
            log(f'  coastal SST {key}: cell {la[k[0]]:.2f},{lo[k[1]]:.2f} at {dist[k]:.0f} km, ann {np.nanmean([m[i][k] for i in range(12)]):.1f} C')
        res['city_sst'] = cs
    json.dump(res, open(os.path.join(out, 'ocean.json'), 'w'), separators=(',', ':'))
    log('ocean.json', os.path.getsize(os.path.join(out, 'ocean.json')), 'bytes')


# ─────────────────────────────────────────────────────────────────────────────
ERD = 'https://erddap.aoml.noaa.gov/gdp/erddap/tabledap/drifter_6hour_qc'


def erddap_csv(q, max_time=600):
    b = fetch(ERD + '.csv?' + q, max_time=max_time, tries=3)
    rows = list(csv.reader(io.StringIO(b.decode('utf8', 'ignore'))))
    return rows[0], rows[2:]          # header, (units row skipped)


def section_drifters(out, work):
    from urllib.parse import quote
    res = {'source': 'NOAA AOML Global Drifter Program, 6-hourly interpolated QC (drifter_6hour_qc)', 'boxes': {}}
    try:
        das = fetch(ERD + '.das', max_time=180).decode('utf8', 'ignore')
        names = [l.strip().split()[0] for l in das.splitlines() if l.startswith('  ') and l.strip().endswith('{')]
        log('drifter_6hour_qc variables:', names)
    except Exception as e:
        log('  das failed', e); names = []
    has_drogue = 'drogue_lost_date' in names
    for key, nm, la0, la1, lo0, lo1 in BOXES:
        try:
            t0 = time.time()
            q = ('ID,time,latitude,longitude'
                 f'&latitude>={la0}&latitude<={la1}&longitude>={lo0}&longitude<={lo1}'
                 '&time>=2005-01-01T00:00:00Z&time<=2022-12-31T00:00:00Z')
            try:
                hdr, rows = erddap_csv(q.replace('>', '%3E').replace('<', '%3C'))
            except Exception as e:
                log(f'  box {key} query failed ({e}); trying 0-360 longitudes'); rows = []
            if not rows and lo0 < 0:
                q360 = q.replace(f'longitude>={lo0}&longitude<={lo1}', f'longitude>={lo0 + 360}&longitude<={lo1 + 360}')
                hdr, rows = erddap_csv(q360.replace('>', '%3E').replace('<', '%3C'))
            first = {}
            for r in rows:
                i, t = r[0], r[1]
                if i not in first or t < first[i]:
                    first[i] = t
            log(f'box {key}: {len(rows)} rows, {len(first)} drifters ({time.time() - t0:.0f}s)')
            cands = sorted(first.items(), key=lambda kv: kv[1])
            # spread candidates through time, then fetch up to 18 tracks
            if len(cands) > 18:
                idx = np.linspace(0, len(cands) - 1, 18).round().astype(int)
                cands = [cands[i] for i in idx]
            tracks = []
            for i, tfirst in cands:
                try:
                    t_end = (dt.datetime.fromisoformat(tfirst.replace('Z', '')) + dt.timedelta(days=540)).strftime('%Y-%m-%dT%H:%M:%SZ')
                    vars_ = 'ID,time,latitude,longitude' + (',drogue_lost_date' if has_drogue else '')
                    q2 = f'{vars_}&ID=%22{i}%22&time>={tfirst}&time<={t_end}'
                    try:
                        h2, r2 = erddap_csv(q2.replace('>', '%3E').replace('<', '%3C'), max_time=300)
                    except Exception:
                        q2 = q2.replace(f'ID=%22{i}%22', f'ID={i}')
                        h2, r2 = erddap_csv(q2.replace('>', '%3E').replace('<', '%3C'), max_time=300)
                    pts = []
                    drog = None
                    for r in r2:
                        try:
                            pts.append((r[1], float(r[2]), ((float(r[3]) + 180) % 360) - 180))
                        except ValueError:
                            continue
                        if has_drogue and r[4] and r[4] != 'NaN':
                            drog = r[4]
                    # daily: keep 00Z points
                    day = [p for p in pts if p[0][11:13] == '00']
                    if len(day) < 30:
                        continue
                    # drogued part only when we know the loss date
                    nd = len(day)
                    if drog:
                        try:
                            dl = drog[:19]
                            day_d = [p for p in day if p[0][:19] < dl]
                            nd = len(day_d)
                        except Exception:
                            pass
                    # net displacement (km) as a "followed the current" score
                    def gc(a, b):
                        p1, p2 = math.radians(a[1]), math.radians(b[1]); dl = math.radians(b[2] - a[2])
                        return 6371 * math.acos(max(-1, min(1, math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dl))))
                    path = sum(gc(day[k], day[k + 1]) for k in range(len(day) - 1))
                    disp = gc(day[0], day[min(len(day) - 1, 120)])
                    tracks.append({'id': i, 't0': day[0][0][:10], 'n': len(day), 'drogued_days': nd, 'drogue_lost': drog,
                                   'path_km': round(path), 'disp120_km': round(disp),
                                   'lat': [round(p[1], 3) for p in day], 'lon': [round(p[2], 3) for p in day]})
                except Exception as e:
                    log(f'  track {i} failed: {e}')
            tracks.sort(key=lambda t: -t['disp120_km'])
            res['boxes'][key] = {'name': nm, 'box': [la0, la1, lo0, lo1], 'n_drifters': len(first), 'tracks': tracks[:8]}
            log(f'  kept {len(tracks[:8])}: ' + ', '.join(f"{t['id']} {t['t0']} disp120 {t['disp120_km']} km drogued {t['drogued_days']}/{t['n']}" for t in tracks[:8]))
        except Exception as e:
            log(f'box {key} failed: {e}')
    json.dump(res, open(os.path.join(out, 'drifters.json'), 'w'), separators=(',', ':'))
    log('drifters.json', os.path.getsize(os.path.join(out, 'drifters.json')), 'bytes')


# ─────────────────────────────────────────────────────────────────────────────
def normals_from_daily(csvbytes):
    """GHCN-Daily per-station CSV (access/ format) -> 1991-2020 monthly normals."""
    rd = csv.DictReader(io.StringIO(csvbytes.decode('utf8', 'ignore')))
    tmax = {}; tmin = {}; prcp = {}
    for r in rd:
        d = r.get('DATE', '')
        if len(d) < 10:
            continue
        y, m = int(d[:4]), int(d[5:7])
        if y < 1991 or y > 2020:
            continue
        for k, store in (('TMAX', tmax), ('TMIN', tmin), ('PRCP', prcp)):
            v = (r.get(k) or '').strip()
            if v == '':
                continue
            try:
                store.setdefault((y, m), []).append(float(v) / 10.0)   # tenths of degC / tenths of mm
            except ValueError:
                pass
    def month_means(store, agg, need):
        per = {m: [] for m in range(1, 13)}
        for (y, m), vals in store.items():
            dim = [31, 29 if y % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
            if len(vals) >= need * dim:
                per[m].append(agg(vals, dim))
        return per
    tx = month_means(tmax, lambda v, n: sum(v) / len(v), 0.67)
    tn = month_means(tmin, lambda v, n: sum(v) / len(v), 0.67)
    pr = month_means(prcp, lambda v, n: sum(v) * n / len(v), 0.80)
    out = {'tmax': [], 'tmin': [], 'tavg': [], 'prcp': [], 'years_t': [], 'years_p': []}
    for m in range(1, 13):
        a, b, p = tx[m], tn[m], pr[m]
        out['tmax'].append(round(sum(a) / len(a), 2) if a else None)
        out['tmin'].append(round(sum(b) / len(b), 2) if b else None)
        out['tavg'].append(round((sum(a) / len(a) + sum(b) / len(b)) / 2, 2) if a and b else None)
        out['prcp'].append(round(sum(p) / len(p), 1) if p else None)
        out['years_t'].append(min(len(a), len(b)))
        out['years_p'].append(len(p))
    return out


def section_normals(out, work):
    res = {'stations': {}, 'notes': []}
    st = inv = None
    try:
        st = fetch('https://www.ncei.noaa.gov/pub/data/ghcn/daily/ghcnd-stations.txt', max_time=600).decode('utf8', 'ignore').splitlines()
        inv = fetch('https://www.ncei.noaa.gov/pub/data/ghcn/daily/ghcnd-inventory.txt', max_time=600).decode('utf8', 'ignore').splitlines()
        log('ghcnd stations', len(st), 'inventory', len(inv))
    except Exception as e:
        log('  ghcnd lists failed', e)
    cover = {}
    if inv:
        for l in inv:
            sid = l[0:11]; el = l[31:35]
            try:
                y0, y1 = int(l[36:40]), int(l[41:45])
            except ValueError:
                continue
            cover.setdefault(sid, {})[el] = (y0, y1)
    stations = []
    if st:
        for l in st:
            try:
                stations.append((l[0:11], float(l[12:20]), float(l[21:30]), l[41:71].strip()))
            except ValueError:
                pass
    # Meteostat station list (fallback)
    mst = None
    try:
        mst = json.loads(gzip.decompress(fetch('https://bulk.meteostat.net/v2/stations/lite.json.gz', max_time=300)))
        log('meteostat stations', len(mst))
    except Exception as e:
        log('  meteostat stations failed', e)

    def hav(a, b, c, d):
        p1, p2 = math.radians(a), math.radians(c); dl = math.radians(d - b)
        return 6371 * math.acos(max(-1, min(1, math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dl))))

    for key, name, clat, clon, grp in CITIES:
        entry = {'name': name, 'lat': clat, 'lon': clon, 'ghcnd': [], 'meteostat': []}
        # GHCN-Daily candidates within 60 km that cover 1991-2020 for TMAX/TMIN/PRCP
        cands = []
        for sid, la, lo, nm in stations:
            if abs(la - clat) > 0.8:
                continue
            dkm = hav(clat, clon, la, lo)
            if dkm > 60:
                continue
            cv = cover.get(sid, {})
            ok = all(e in cv and cv[e][0] <= 1995 and cv[e][1] >= 2016 for e in ('TMAX', 'TMIN'))
            cands.append((0 if ok else 1, dkm, sid, la, lo, nm, cv))
        cands.sort()
        for okf, dkm, sid, la, lo, nm, cv in cands[:4]:
            try:
                b = fetch(f'https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/{sid}.csv', max_time=600, tries=2)
                n = normals_from_daily(b)
                entry['ghcnd'].append({'id': sid, 'name': nm, 'lat': la, 'lon': lo, 'km': round(dkm, 1), 'inv': {k: v for k, v in cv.items() if k in ('TMAX', 'TMIN', 'PRCP')}, **n})
                log(f'  {key}: GHCND {sid} {nm} {dkm:.0f} km years_t {n["years_t"]} years_p {n["years_p"]}')
            except Exception as e:
                log(f'  {key}: GHCND {sid} failed {e}')
        # Meteostat monthly fallback within 60 km
        if mst:
            mc = []
            for s in mst:
                loc = s.get('location') or {}
                la, lo = loc.get('latitude'), loc.get('longitude')
                if la is None or lo is None or abs(la - clat) > 0.8:
                    continue
                dkm = hav(clat, clon, la, lo)
                if dkm <= 60:
                    mc.append((dkm, s))
            mc.sort(key=lambda x: x[0])
            for dkm, s in mc[:3]:
                try:
                    raw = gzip.decompress(fetch(f'https://bulk.meteostat.net/v2/monthly/{s["id"]}.csv.gz', max_time=300, tries=2)).decode('utf8', 'ignore')
                    per = {m: {'tavg': [], 'tmin': [], 'tmax': [], 'prcp': []} for m in range(1, 13)}
                    for r in csv.reader(io.StringIO(raw)):
                        try:
                            y, m = int(r[0]), int(r[1])
                        except (ValueError, IndexError):
                            continue
                        if y < 1991 or y > 2020:
                            continue
                        for j, k in ((2, 'tavg'), (3, 'tmin'), (4, 'tmax'), (5, 'prcp')):
                            if j < len(r) and r[j] not in ('', None):
                                try:
                                    per[m][k].append(float(r[j]))
                                except ValueError:
                                    pass
                    agg = {k: [round(sum(per[m][k]) / len(per[m][k]), 2) if per[m][k] else None for m in range(1, 13)] for k in ('tavg', 'tmin', 'tmax', 'prcp')}
                    agg['years'] = {k: [len(per[m][k]) for m in range(1, 13)] for k in ('tavg', 'prcp')}
                    entry['meteostat'].append({'id': s['id'], 'name': (s.get('name') or {}).get('en'), 'wmo': (s.get('identifiers') or {}).get('wmo'),
                                               'km': round(dkm, 1), **agg})
                    log(f'  {key}: meteostat {s["id"]} {(s.get("name") or {}).get("en")} {dkm:.0f} km years {agg["years"]}')
                except Exception as e:
                    log(f'  {key}: meteostat {s.get("id")} failed {e}')
        res['stations'][key] = entry
    # what NCEI has for WMO 1991-2020 normals (for a possible second pass)
    try:
        lst = fetch('https://www.ncei.noaa.gov/pub/data/normals/WMO/1991-2020/', max_time=120).decode('utf8', 'ignore')
        log('NCEI WMO normals listing:\n' + '\n'.join(l.strip()[:220] for l in lst.splitlines() if 'href' in l)[:6000])
    except Exception as e:
        log('  WMO listing failed', e)
    json.dump(res, open(os.path.join(out, 'normals.json'), 'w'), separators=(',', ':'))
    log('normals.json', os.path.getsize(os.path.join(out, 'normals.json')), 'bytes')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='p20-out')
    ap.add_argument('--work', default='/tmp/p20')
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True); os.makedirs(a.work, exist_ok=True)
    secs = [('ocean', section_ocean), ('drifters', section_drifters), ('normals', section_normals)]
    for nm, fn in secs:
        if a.only and nm not in a.only.split(','):
            continue
        log(f'══ {nm} ══ {dt.datetime.utcnow().isoformat()}Z')
        try:
            fn(a.out, a.work)
        except Exception:
            log(f'SECTION {nm} FAILED\n' + traceback.format_exc())
    open(os.path.join(a.out, 'report.txt'), 'w').write('\n'.join(LOG) + '\n')


if __name__ == '__main__':
    main()
