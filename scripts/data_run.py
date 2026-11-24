#!/usr/bin/env python3
"""Run planning for the daily station-data workflows (Season Map, Record Watch, Snow Map).

Those workflows fire several times each morning (GitHub schedules plus an
external trigger, because GitHub starts scheduled runs hours late). This
script decides what each run should do, so that the extra runs cost almost
nothing once the data are current and the repo gets about two data commits
per workflow per day.

  plan     → prints mode=full|daily|skip (for $GITHUB_OUTPUT) and a reason
  changed  → exit 0 if the built file differs from HEAD ignoring 'generated'

Plan rules, in order:
  no committed file or full requested                → full
  monthly full day and no full build yet today (UTC) → full
  manual run from the Actions page                   → daily
  the day's sweep run (late stations, revisions)     → daily
  committed 'end' already reaches yesterday          → skip
  otherwise                                          → daily

"Yesterday" uses US Eastern standard time, the same clock the builders use.
"""
import argparse, datetime as dt, json, subprocess, sys

EASTERN = dt.timezone(dt.timedelta(hours=-5))


def load(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def plan(a):
    now = dt.datetime.now(dt.timezone.utc)
    yesterday = now.astimezone(EASTERN).date() - dt.timedelta(days=1)
    data = load(a.file)
    auto = a.auto.lower() == 'true'
    if data is None:
        return 'full', 'no committed data yet'
    if a.full.lower() == 'true':
        return 'full', 'full rebuild requested'
    gen = str(data.get('generated', ''))[:10]
    if now.day == a.full_day and not (data.get('mode') == 'full' and gen == now.date().isoformat()):
        return 'full', 'monthly rebuild'
    if a.event == 'workflow_dispatch' and not auto:
        return 'daily', 'manual run'
    if a.event == 'schedule' and a.schedule == a.sweep:
        return 'daily', 'sweep run (late stations and revisions)'
    try:
        end = dt.date.fromisoformat(data['end'])
    except (KeyError, ValueError):
        return 'daily', 'committed file has no end date'
    if end >= yesterday:
        return 'skip', f'data already reach {end} (yesterday = {yesterday})'
    return 'daily', f'data end {end}, yesterday = {yesterday}'


def changed(path):
    new = load(path)
    try:
        old = json.loads(subprocess.run(['git', 'show', f'HEAD:{path}'], check=True,
                                        capture_output=True, text=True).stdout)
    except (subprocess.CalledProcessError, ValueError):
        old = None
    if new is None:
        return False
    if old is None:
        return True
    for d in (old, new):
        d.pop('generated', None)
    return old != new


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('plan')
    p.add_argument('--file', required=True)
    p.add_argument('--full-day', type=int, required=True)
    p.add_argument('--sweep', required=True, help='cron string of the sweep schedule')
    p.add_argument('--event', default='')
    p.add_argument('--schedule', default='')
    p.add_argument('--full', default='false')
    p.add_argument('--auto', default='false')
    c = sub.add_parser('changed')
    c.add_argument('file')
    a = ap.parse_args()
    if a.cmd == 'plan':
        mode, why = plan(a)
        print(f'mode={mode}')
        print(f'Mode: {mode} ({why})', file=sys.stderr)
    else:
        sys.exit(0 if changed(a.file) else 1)


if __name__ == '__main__':
    main()
