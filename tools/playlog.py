#!/usr/bin/env python3
"""#641 play log for debugging: download every game event of one day and print a short summary.

  python3 tools/playlog.py day 2026-11-27

#730 the summary ends with one line per mission: done / skip / left (events mdone, mskip, mleft).

The key: #715 the environment variable LOG_READ_KEY first (cloud sessions: set in the cloud environment, docs/agents/remote.md), then #675 the read token LOG_READ_KEY from the local .env at the repo root (the automated readers' key, also a Cloudflare
Pages secret; never committed, printed or posted), else the parent key from ~/.oren/diag.key (never printed). The events go to ~/.oren/playlog/<day>.json: private, outside
the repo (the repo is public, never commit or post raw events). The day is the PC's local day. Paging: /api/log/raw,
5000 events a page, oldest first (from/to/after), until next is null.
"""
import json, os, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

SITE = os.environ.get("OREN_SITE", "https://oren-game.pages.dev")
HOME = Path(os.environ.get("OREN_HOME") or Path.home() / ".oren")
ENV = Path(os.environ.get("OREN_ENV") or Path(__file__).resolve().parents[1] / ".env")
PAGE, MAX_PAGES = 5000, 400


def read_token():
    """#715 LOG_READ_KEY from the environment (cloud sessions), else #675 from the local .env, or '' when neither has it."""
    k = os.environ.get("LOG_READ_KEY", "").strip()
    if k: return k
    try: lines = ENV.read_text(encoding="utf-8").splitlines()
    except OSError: return ""
    for line in lines:
        m = re.match(r"\s*(?:export\s+)?LOG_READ_KEY\s*=\s*(.*)$", line)
        if m: return m[1].strip().strip("\"'")
    return ""


def day_range(day):
    """'YYYY-MM-DD' -> (from_ms, to_ms) of that local day (DST-safe)."""
    t = time.strptime(day, "%Y-%m-%d")
    a = time.mktime((t.tm_year, t.tm_mon, t.tm_mday, 0, 0, 0, 0, 0, -1))
    b = time.mktime((t.tm_year, t.tm_mon, t.tm_mday + 1, 0, 0, 0, 0, 0, -1))
    return int(a * 1000), int(b * 1000)


def fetch_all(get, frm, to):
    """get(params) -> {ev, next}. Every event from..to, page after page, oldest first."""
    out, cur = [], None
    for _ in range(MAX_PAGES):
        q = {"from": frm, "to": to, "n": PAGE}
        if cur: q["after"] = cur
        j = get(q)
        out += j.get("ev") or []
        cur = j.get("next")
        if not cur: return out
    raise RuntimeError(f"more than {MAX_PAGES} pages")


def http_get(key):
    def get(q):
        req = urllib.request.Request(SITE + "/api/log/raw?" + urllib.parse.urlencode(q),
                                     headers={"x-admin-key": key, "user-agent": "oren-playlog"})
        with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read().decode("utf-8"))
    return get


def hm(t): return time.strftime("%H:%M:%S", time.localtime(t / 1000))


def summary(ev):
    """Pure: the events of a day -> summary lines (sessions, missions in order with time on screen, questions,
    silent voice waits, repeats). Counts and ids only."""
    S = {}
    for e in ev: S.setdefault(e.get("sid", "?"), []).append(e)
    for L in S.values(): L.sort(key=lambda e: (e.get("t", 0), e.get("i", 0)))
    lines = [f"{len(ev)} events, {len(S)} sessions"]
    waits, qn, right, wrong = [], 0, 0, 0
    for sid, L in sorted(S.items(), key=lambda x: x[1][0].get("t", 0)):
        ss = next((e for e in L if e.get("k") == "ss"), None)
        dev = (f"{ss.get('dev', '?')} {ss.get('os', '?')} {ss.get('br', '?')} screen {ss.get('scw', '?')}x{ss.get('sch', '?')} "
               f"view {ss.get('vw', '?')}x{ss.get('vh', '?')}") if ss else "no device event"
        lines.append(f"session {sid} {hm(L[0]['t'])}-{hm(L[-1]['t'])}, {len(L)} events, {dev}")
        mis = [x for x, e in enumerate(L) if e.get("k") == "mis"]
        seen, qs = {}, {}
        for x in mis:
            e, end = L[x], L[-1]["t"]
            for f in L[x + 1:]:
                if f.get("k") == "mis" or (f.get("k") == "scr" and f["t"] - e["t"] > 1000): end = f["t"]; break
            why = "auto" if e.get("auto") else f"tap {e.get('tg', '?')} on {e.get('via', '?')}" if e.get("tg") else "?"
            seen[e.get("m")] = seen.get(e.get("m"), 0) + 1
            lines.append(f"  {hm(e['t'])} mission {e.get('m', '?')} {round((end - e['t']) / 1000)} s ({why})")
        miss = None
        for e in L:
            k = e.get("k")
            if k == "q": qn += 1; qs[e.get("q")] = qs.get(e.get("q"), 0) + 1
            elif k == "ans":
                if e.get("ok"): right += 1
                else: wrong += 1
            elif k == "au" and e.get("ev") in ("fail", "missing") and miss is None: miss = e
            elif k == "au" and e.get("ev") == "play" and miss is not None:
                waits.append((sid, miss, e["t"] - miss["t"])); miss = None
        if miss is not None: waits.append((sid, miss, None))
        rep = [f"{m} x{n}" for m, n in seen.items() if n > 1] + [f"question {q} x{n}" for q, n in qs.items() if n > 1]
        if rep: lines.append("  repeats: " + ", ".join(rep))
    lines.append(f"questions {qn}, right {right}, wrong {wrong}")
    ends = {}
    for e in ev:
        k = {"mdone": 0, "mskip": 1, "mleft": 2}.get(e.get("k"))
        if k is not None: ends.setdefault(e.get("m", "?"), [0, 0, 0])[k] += 1
    if ends:
        lines.append("mission ends (done/skip/left)")
        for m, (d, s_, l) in sorted(ends.items()): lines.append(f"  {m}: done {d}, skip {s_}, left {l}")
    lines.append(f"silent voice waits {len(waits)}")
    for sid, e, ms in waits:
        lines.append(f"  {hm(e['t'])} {sid} {e.get('why', e.get('ev'))} sentence {e.get('sn', '?')}: "
                     + (f"{ms / 1000:.1f} s until the next voice" if ms is not None else "no voice after it"))
    return lines


def save(day, ev):
    d = HOME / "playlog"; d.mkdir(parents=True, exist_ok=True)
    try: os.chmod(d, 0o700)
    except OSError: pass
    p = d / f"{day}.json"
    p.write_text(json.dumps(ev, ensure_ascii=False), encoding="utf-8")
    return p


def main(argv, get=None):
    if len(argv) != 2 or argv[0] != "day":
        print("usage: playlog.py day YYYY-MM-DD"); return 2
    day = argv[1]
    try: frm, to = day_range(day)
    except ValueError: print("bad day, use YYYY-MM-DD"); return 2
    if get is None:
        key, kf = read_token(), HOME / "diag.key"
        if not key and not kf.is_file():
            print(f"LOG_READ_KEY missing in the cloud environment (on the PC: put it in {ENV} or the admin key in {kf})"); return 2
        get = http_get(key or kf.read_text(encoding="utf-8").strip())
    try: ev = fetch_all(get, frm, to)
    except (OSError, ValueError, RuntimeError) as e:   # HTTPError/URLError are OSErrors; the URL and key are not printed
        print(f"download failed: {getattr(e, 'code', '') or type(e).__name__}"); return 1
    p = save(day, ev)
    for line in summary(ev): print(line)
    print(f"saved {len(ev)} events to {p}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
