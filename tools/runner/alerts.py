"""#844 watchdog alarms: ONE function for every alarm. The same rule + subject is sent at most once per `alert_repeat_minutes`
(config, 180); the next one carries a count ('x5 since HH:MM'). Routing: orchestrator live and healthy -> tell it; not running,
not reachable (hc send fails) or state error/approval/frozen in .runs/control_health.json (#890) -> a short Hebrew Telegram
message (silent for info) + the inspector (hc send, when it is up) and the alarm stays in the NEEDS-ATTENTION list.
The Telegram text names only the rule and a sanitised subject, never issue titles or screen text. State: .runs/alerts.json."""
import json, re, time
import runner as R

BAD_STATES = ("error", "approval", "frozen")
STATE = "alerts.json"

def every_min(): return float(R.CFG.get("alert_repeat_minutes", 180))

def _path(path=None): return path or (R.RUNS / STATE)

def load(path=None):
    try: d = json.loads(_path(path).read_text(encoding="utf-8")); return d if isinstance(d, dict) else {}
    except (OSError, ValueError): return {}

def _save(st, path=None):
    try: p = _path(path); p.parent.mkdir(parents=True, exist_ok=True); p.write_text(json.dumps(st), encoding="utf-8")
    except OSError: pass

def clean(s, n=30):
    """Subject/rule for Telegram: only a short id-like token (window name, #n); no titles, no screen text."""
    return re.sub(r"[^A-Za-z0-9#_.:\-]", "", str(s or "").replace(" ", "-"))[:n]

def state_of(name):
    """hc state of a control session ('live', 'gone', ...; '' when hc cannot be read)."""
    try:
        rc, out = R.hc("get", name, "--json", timeout=30)
        for line in reversed((out or "").strip().splitlines()):
            try: return str((json.loads(line) or {}).get("state") or "")
            except ValueError: continue
    except Exception: pass
    return ""

def hm(t): return time.strftime("%H:%M", time.localtime(t))

# ---------- pure ----------
def health_state(health, name):
    """The #890 file: {name: 'frozen'} or {name: {'state': 'frozen'}} -> the state string ('' when unknown)."""
    v = (health or {}).get(name)
    return str(v.get("state") if isinstance(v, dict) else v or "")

def orch_reachable(hc_state, health):
    return hc_state == "live" and health_state(health, "orchestrator") not in BAD_STATES

def decide(st, key, now, every=None):
    """-> (send now?, count, since, new entry). n = repeats held back since the last send; a send reports n+1 and the time of the first held-back one."""
    every = every_min() if every is None else every
    e = dict(st.get(key) or {})
    if not e or now - e.get("last", 0) >= every * 60:
        n = e.get("n", 0)
        return True, n + 1, (e.get("first", now) if n else now), {"last": now, "n": 0}
    e["n"] = e.get("n", 0) + 1
    e.setdefault("first", now)
    return False, 0, 0, e

def telegram_text(rule, subject, count, since):
    t = f"⚠️ התראה: {clean(rule)}" + (f" · {clean(subject)}" if subject else "")
    return t + (f" ×{count} מאז {hm(since)}" if count > 1 else "")

# ---------- side effects ----------
def raise_alarm(rule, subject, text, info=False, now=None, path=None, orch_state=None, health=None,
                tell=None, inspector=None, telegram=None, inspector_state=None):
    """-> 'told' | 'suppressed' | 'fallback'. tell(text)->rc, inspector(text)->rc, telegram(text, silent) are injectable (tests)."""
    now = time.time() if now is None else now
    key = f"{rule}|{subject}"
    st = load(path)
    counts = st.setdefault("counts", {}); counts[rule] = counts.get(rule, 0) + 1
    items = st.setdefault("items", {})
    send, count, since, e = decide(items, key, now)
    items[key] = e
    if not send: _save(st, path); return "suppressed"
    suffix = f" x{count} since {hm(since)}" if count > 1 else ""
    tell = tell or (lambda t: R.hc("send", "orchestrator", t, timeout=30)[0])
    inspector = inspector or (lambda t: R.hc("send", "inspector", t, timeout=30)[0])
    telegram = telegram or _telegram
    if orch_state is None: orch_state = state_of("orchestrator")
    if health is None: health = load(R.RUNS / "control_health.json")
    out = "told"
    if orch_reachable(orch_state, health):
        if tell(text + suffix) not in (0, None): out = "fallback"          # hc send failed: not reachable after all
    else: out = "fallback"
    if out == "fallback":
        items[key]["attention"] = rule
        ins_ok = (inspector_state if inspector_state is not None else state_of("inspector")) == "live"
        if ins_ok:
            try: inspector(text + suffix)
            except Exception: pass
        try: telegram(telegram_text(rule, subject, count, since), info)
        except Exception: pass
    _save(st, path)
    return out

def _telegram(text, silent=False):
    import telegram
    return telegram.send(text, silent=silent)

def attention(now=None, path=None):
    """Alarms that went to the fallback and are still within their repeat window -> ['STUCK run-3', ...]."""
    now = time.time() if now is None else now
    return [k.replace("|", " ").strip() for k, e in sorted((load(path).get("items") or {}).items())
            if e.get("attention") and now - e.get("last", 0) < every_min() * 60]

def lines(now=None, path=None):
    a = attention(now, path)
    return ["NEEDS-ATTENTION (alarms, orchestrator not reachable): " + " · ".join(a)] if a else []

def night_line(path=None, reset=True):
    """One line for the night report: alarm count per rule since the last report."""
    st = load(path); c = st.get("counts") or {}
    if reset and c: st["counts"] = {}; _save(st, path)
    return "ALARMS (since last report): " + (" · ".join(f"{r} {n}" for r, n in sorted(c.items())) if c else "none")
