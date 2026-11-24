"""TEMPORARY diagnostic: why do stations fail the 1991-2020 snow completeness test?"""
import json, math, sys, os, concurrent.futures as cf
sys.path.insert(0, 'scripts')
import build_snow_map as B
roster = B.read_roster()
def job(st):
    try:
        rows = B.acis(st['id'], '1991-07-01', '2021-06-30')
    except Exception as e:
        return st['id'], {'err': str(e)[:80]}
    S = B.seasons_from_rows(rows)
    out = {}
    for key, f in (('v', 'snow'), ('d', 'cover')):
        months = {m: 0 for m in B.CORE_MONTHS}; anydata = 0; passed = 0; pass_nm = 0; pass80 = 0
        for sy in range(1991, 2021):
            if sy not in S: continue
            arr = S[sy][key]
            if any(not math.isnan(x) for x in arr): anydata += 1
            ok = True; ok_nm = True; ok80 = True
            for m in B.CORE_MONTHS:
                y = B.cal_year(sy, m); nd = B.days_in_month(y, m)
                c = sum(1 for d in range(1, nd + 1) if not math.isnan(arr[B.slot_of(m, d)]))
                if c / nd < 0.9:
                    months[m] += 1; ok = False
                    if m in (11, 12, 1, 2, 3): ok_nm = False
                if c / nd < 0.8: ok80 = False
            passed += ok; pass_nm += ok_nm; pass80 += ok80
        out[f] = dict(any=anydata, ok=passed, nov_mar=pass_nm, ok80=pass80, fail_by_month=months)
    return st['id'], out
res = {}
with cf.ThreadPoolExecutor(8) as ex:
    for sid, o in ex.map(job, roster):
        res[sid] = o
json.dump(res, open('tmpdiag/diag-out.json', 'w'), indent=0)
print('done', len(res))
