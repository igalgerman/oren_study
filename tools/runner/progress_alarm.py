"""#891 No-progress alarm: the owner hears on his phone when work is ready but nothing has moved for `progress_alarm_min` (60) minutes.
One number, time since the last real progress, read from the GitHub cache (.runs/gh_cache.json, no new gh calls). Progress = the newest of:
a PR merged, a PR opened, a commit on a PR / lane branch, an issue closed, a RESULT or VERDICT comment, an issue moving to in-progress (stats 'start').
decide() is ONE pure function (timestamps and counts -> send / remind / recovered / no) that the cloud job of #866 can reuse.
cause() picks ONE probable cause by rules. State (.runs/progress_alarm.json) survives a restart; its 'text' is the NEEDS-ATTENTION line
for the panel and dashboard. Never fixes anything. Quiet hours (config progress_quiet_hours = "23-7", default none) and 'nothing startable' are skipped."""
import calendar, json, os, re, time, tomllib
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNS = Path(os.environ.get("RUNNER_RUNS") or HERE / ".runs")
try: _C = tomllib.loads((HERE / "config.toml").read_text(encoding="utf-8"))
except Exception: _C = {}
MIN = float(_C.get("progress_alarm_min", 60))
QUIET = str(_C.get("progress_quiet_hours", ""))
EVERY_S, AGAIN_H, REMIND_H = 300, 3, 6
CACHE_MAX_AGE = 600           # an older cache = watchdog trouble, not a stall: no verdict
STATE = "progress_alarm.json"
SIGNAL = re.compile(r"^\s*(RESULT|VERDICT)\b", re.M)

def iso(s):
    """GitHub UTC time -> epoch, 0 when empty/unparsable."""
    try: return calendar.timegm(time.strptime((s or "")[:19], "%Y-%m-%dT%H:%M:%S"))
    except ValueError: return 0

# ---------- pure ----------
def last_progress(cache, events=()):
    """Newest progress time (epoch) in the gh cache dict (+ stats events: 'start' = an issue moved to in-progress); 0 = none seen."""
    t = [0]
    for p in cache.get("prs") or []:
        t += [iso(p.get("mergedAt")), iso(p.get("createdAt"))] + [iso(c.get("committedDate")) for c in p.get("commits") or []]
        t += [iso(c.get("createdAt")) for c in p.get("comments") or [] if SIGNAL.search(c.get("body") or "")]
    for i in cache.get("closed") or []: t.append(iso(i.get("closedAt")))
    for i in cache.get("open") or []:
        t += [iso(c.get("createdAt")) for c in i.get("comments") or [] if SIGNAL.search(c.get("body") or "")]
    t += [iso(v) for v in (cache.get("lanes") or {}).values()]
    t += [e.get("ts") or 0 for e in events if e.get("event") == "start"]
    return max(t)

def quiet_now(spec, hour):
    """'23-7' = quiet from 23:00 to 07:00 local; '' = never."""
    m = re.fullmatch(r"\s*(\d{1,2})\s*-\s*(\d{1,2})\s*", spec or "")
    if not m: return False
    a, b = int(m[1]), int(m[2])
    return a <= hour < b if a < b else (hour >= a or hour < b)

def decide(now, last, ready, st, min_=MIN, quiet=False):
    """Pure. now/last: epoch, ready: startable issues, st: {since, alarm_at, sent_at}. -> ('send'|'remind'|'recovered'|'no', new st).
    last = 0 (nothing seen) counts from st['since'] (first look), so a restart never alarms at once."""
    st = dict(st or {})
    st.setdefault("since", now)
    quiet_for = now - max(last, st["since"])
    if st.get("alarm_at"):
        if last > st.get("alarm_last", 0):                                    # progress is back
            for k in ("alarm_at", "sent_at", "alarm_last"): st.pop(k, None)
            return "recovered", st
        if quiet or ready <= 0: return "no", st
        if now - st.get("sent_at", 0) >= REMIND_H * 3600:
            st["sent_at"] = now; return "remind", st
        return "no", st
    if quiet or ready <= 0 or quiet_for < min_ * 60: return "no", st
    st["alarm_at"] = st["sent_at"] = now; st["alarm_last"] = max(last, st["since"])
    return "send", st

def cause(s):
    """Pure: first matching cause (a key) from signals {beat_age_s, control_bad, main_red, lock_min, budget_pct, stop, frozen, all_busy}."""
    if s.get("beat_age_s") is None or s["beat_age_s"] > 300: return "watchdog"
    if s.get("stop"): return "quota"
    if s.get("frozen"): return "frozen"
    if s.get("control_bad"): return "control"
    if s.get("main_red"): return "ci"
    if (s.get("lock_min") or 0) > 20: return "lock"
    if s.get("budget_pct") is not None and s["budget_pct"] < 20: return "github"
    if s.get("all_busy"): return "lanes"
    return "unknown"

CAUSES = {"watchdog": "המשגיח לא פועל", "quota": "מגבלת שימוש (עצירה)", "frozen": "המערכת מוקפאת",
          "control": "המתאם או המפקח תקועים", "ci": "הבדיקות על main אדומות", "lock": "נעילת המיזוג תפוסה",
          "github": "מכסת GitHub נמוכה", "lanes": "כל הנתיבים פעילים בלי שינוי", "unknown": "לא ידוע"}

def message(kind, min_, ready, busy, why):
    if kind == "recovered": return "חזר לעבוד"
    pre = "תזכורת: " if kind == "remind" else ""
    return f"{pre}אין התקדמות {int(min_)} דקות: {ready} משימות מוכנות, {busy} פעילות. בדוק את המחשב. סיבה: {CAUSES[why]}."

def line(st):
    """NEEDS-ATTENTION line for the panel and dashboard, '' when no alarm is on."""
    if not st.get("alarm_at"): return ""
    h = (st.get("at", st["alarm_at"]) - st["alarm_last"]) / 3600
    return f"NEEDS-ATTENTION: no progress {max(1, round(h))}h"

# ---------- side effects ----------
def count(runs=None, now=None, hours=24):
    """Alarm and reminder messages sent in the last `hours` (the night report counts them)."""
    now = now or time.time()
    return sum(now - x < hours * 3600 for x in _load(runs or RUNS).get("log", []))

def _load(runs):
    try: return json.loads((Path(runs) / STATE).read_text(encoding="utf-8"))
    except (OSError, ValueError): return {}

def tick(now, cache, events, ready, busy, signals, send_owner, send_hc, log=print, runs=None, hour=None):
    """Watchdog hook (every EVERY_S): -> the message sent, or None. signals() is read only when an alarm goes out."""
    runs = Path(runs or RUNS)
    if not cache or now - cache.get("ts", 0) > CACHE_MAX_AGE: return None
    st = _load(runs)
    last = last_progress(cache, events)
    q = quiet_now(QUIET, time.localtime(now).tm_hour if hour is None else hour)
    act, st = decide(now, last, ready, st, MIN, q)
    msg = None
    if act != "no":
        why = cause(signals()) if act != "recovered" else ""
        msg = message(act, MIN, ready, busy, why)
        log(f"progress alarm {act}: {msg}")
        if act != "recovered": st["log"] = [x for x in st.get("log", []) if now - x < 7 * 86400] + [now]
        for f in (send_owner, send_hc):
            try: f(msg)
            except Exception as e: log(f"progress alarm not delivered: {e!r}")
    st["at"] = now
    st["text"] = line(st)
    try:
        runs.mkdir(parents=True, exist_ok=True)
        (runs / STATE).write_text(json.dumps(st, ensure_ascii=False), encoding="utf-8")
    except OSError as e: log(f"progress alarm state not saved: {e!r}")
    return msg
