"""#842: one backoff helper for every watchdog job that keeps failing. A failed job waits 2, 4, 8 ... up to 60 min before
its next try; a success resets it. State in .runs/backoff.json (survives a restart). ONE alert when a job starts failing and
ONE when it recovers; nothing in between (the caller still logs every try). Pure functions take `now`; no sleeping."""
import json, time
import runner as R

FIRST_MIN, MAX_MIN = 2, 60

def _path(path=None): return path or (R.RUNS / "backoff.json")

def load(path=None):
    try: d = json.loads(_path(path).read_text(encoding="utf-8")); return d if isinstance(d, dict) else {}
    except (OSError, ValueError): return {}

def _save(st, path=None):
    try: p = _path(path); p.parent.mkdir(parents=True, exist_ok=True); p.write_text(json.dumps(st), encoding="utf-8")
    except OSError: pass

def delay_min(fails): return min(MAX_MIN, FIRST_MIN * 2 ** max(0, fails - 1))

def due(job, now=None, path=None):
    """True when the job may try now (never failed, or its wait is over)."""
    now = time.time() if now is None else now
    return now >= float(load(path).get(job, {}).get("next", 0))

def failed(job, now=None, alert=None, path=None):
    """A try failed: wait longer next time; alert only on the first failure."""
    now = time.time() if now is None else now
    st = load(path); e = st.get(job) or {"fails": 0}
    e["fails"] = int(e.get("fails", 0)) + 1
    e["next"] = now + delay_min(e["fails"]) * 60
    st[job] = e; _save(st, path)
    if e["fails"] == 1 and alert: alert(f"WATCHDOG: {job} started failing; retrying with backoff (2, 4, 8 ... 60 min)")

def ok(job, now=None, alert=None, path=None):
    """A try worked: reset; one alert only if the job was failing."""
    st = load(path)
    if job not in st: return
    del st[job]; _save(st, path)
    if alert: alert(f"WATCHDOG: {job} recovered")

def lines(now=None, path=None):
    """Dashboard lines for jobs that are backing off."""
    now = time.time() if now is None else now
    out = []
    for job, e in sorted(load(path).items()):
        if float(e.get("next", 0)) > now: out.append(f"backoff: {job} next try {time.strftime('%H:%M', time.localtime(e['next']))}")
    return out
