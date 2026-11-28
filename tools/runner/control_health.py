"""#890 control-session heartbeat. Every watchdog tick, for each live control role (orchestrator, inbox, inspector, executor):
read `hc get` (status, status_ms) and, when needed, the screen; detect error / approval / frozen; tell the owner on Telegram (Hebrew,
short, no screen text) and the inspector (the orchestrator when the inspector is the stuck one) ONCE, with backoff; one message on recovery.
Read-only: never sends keys to the stuck session. State lives in .runs/control_health.json (survives a watchdog restart).
Also: restart_gate = the #140 finished-session restart gets a backoff (3 restarts in 30 min -> one message, pause 30 min)."""
import hashlib, json, re, time
from collections import namedtuple
from pathlib import Path

IO = namedtuple("IO", "get read tell tg log")   # get(addr)->dict, read(addr, lines)->str, tell(role, text), tg(text)->id|0, log(msg)

DEFAULT_ERRORS = [r"limit reached", r"usage limit", r"rate.?limit", r"overloaded", r"api error", r"please run /login",
                  r"(login|session|token|authentication) (has )?expired", r"invalid api key", r"credit balance is too low"]
DIALOG = [r"do you want to", r"allow this", r"^\s*[❯>]?\s*1\.\s*yes\b"]
TRUST = "trust this folder"
WHO = {"orchestrator": "המנהל", "inbox": "תיבת הפניות", "inspector": "המפקח", "executor": "המבצע"}
WHAT = {"error": "מסך שגיאה או גבול שימוש", "approval": "ממתין לאישור", "frozen": "קפוא"}
TYPING_S, RESEND_S, REMIND_S, RESTART_N, RESTART_WIN_S = 120, 3600, 3 * 3600, 3, 1800

def _path():
    import runner as R
    return R.RUNS / "control_health.json"

def load():
    try: return json.loads(_path().read_text(encoding="utf-8"))
    except Exception: return {}

def save(st):
    try: p = _path(); p.parent.mkdir(parents=True, exist_ok=True); p.write_text(json.dumps(st, ensure_ascii=False), encoding="utf-8")
    except OSError: pass

def hhmm(t): return time.strftime("%H:%M", time.localtime(t))

def _lines(screen):
    return [l.rstrip() for l in screen.splitlines() if l.strip() and not set(l.strip()) <= set("─╌│ ")]

def _status(d):
    s = d.get("status")
    s = s if isinstance(s, dict) else {"state": s}
    return s.get("state") or d.get("state") or "", s.get("status_ms", d.get("status_ms"))

def tick(ts, io, now, cfg, st=None):
    """One pass. st = state dict (loaded and saved here when None). -> the state."""
    import recover
    disk = st is None
    st = load() if disk else st
    if cfg.get("control_health", True) is False:
        st["roles"] = {}; st["text"] = ""
        if disk: save(st)
        return st
    pats = [re.compile(p, re.I) for p in cfg.get("control_error_patterns") or DEFAULT_ERRORS]
    dlg = [re.compile(p, re.I | re.M) for p in DIALOG]
    appr_s, frozen_s = float(cfg.get("control_approval_min", 3)) * 60, float(cfg.get("control_frozen_min", 30)) * 60
    roles = st.setdefault("roles", {}); sent = st.setdefault("sent", {})
    live = {}
    for t in ts:
        r = recover.control_role(t) if t.get("state") == "live" else None
        if r and t.get("address") and r not in live: live[r] = t["address"]
    for role in [r for r in roles if r not in live]: roles.pop(role)      # gone: the #140 restart check handles it
    for role, addr in live.items():
        try: _one(role, addr, io, now, roles.setdefault(role, {}), sent, pats, dlg, appr_s, frozen_s)
        except Exception as e: io.log(f"control_health {role}: {e!r}")
    act = [f"{r} {e['ep']['state']} since {hhmm(e['ep']['first'])}" for r, e in roles.items() if e.get("ep")]
    st["text"] = "NEEDS-ATTENTION: control session " + " · ".join(act) if act else ""
    if disk: save(st)
    return st

def _one(role, addr, io, now, r, sent, pats, dlg, appr_s, frozen_s):
    state, sms = _status(io.get(addr) or {})
    if r.get("sms") != sms or r.get("state") != state: r.update(sms=sms, state=state, since=now)
    age = now - r["since"]
    screen = ""
    if state not in ("working", "done") or (state == "working" and age >= TYPING_S):
        screen = io.read(addr, 60) or ""
        h = hashlib.sha1(screen.encode("utf-8", "replace")).hexdigest()
        if r.get("h") is None: r.update(h=h, hsince=r["since"])
        elif r["h"] != h: r.update(h=h, hsince=now, hchg=now)
    typing = bool(r.get("hchg")) and now - r["hchg"] < TYPING_S
    bad, tail = None, _lines(screen)[-12:]
    if screen:
        text = "\n".join(tail)
        dialog = state == "blocked" or any(d.search(text) for d in dlg)
        if any(p.search(text) for p in pats): bad = "error"
        elif dialog and TRUST not in screen.lower():
            r.setdefault("appr", now)
            if now - r["appr"] >= appr_s: bad = "approval"
        if not (dialog and TRUST not in screen.lower()): r.pop("appr", None)
        if not bad and state == "working" and age >= frozen_s and now - r["hsince"] >= frozen_s: bad = "frozen"
    if typing: return                          # the owner is at the keyboard: no alarm, no recovery message
    ep = r.get("ep")
    if bad and ep and ep["state"] != bad: r.pop("ep"); ep = None
    if not bad:
        if ep:
            if ep["alerted"]: io.tg(f"{WHO[role]} ({role}) חזר לעבוד")
            r.pop("ep")
        return
    if not ep:
        ep = r["ep"] = {"state": bad, "first": now, "alerted": False, "last": 0, "n": 0}
        if now - sent.get(f"{role}|{bad}", -RESEND_S) < RESEND_S: return        # flapping: the same role+state within 60 min stays quiet
        _alert(role, bad, ep, tail, io, now, sent, "")
    elif not ep["alerted"] and now - sent.get(f"{role}|{bad}", 0) >= RESEND_S:   # a flapping episode that lasts: alert once the 60 min are over
        _alert(role, bad, ep, tail, io, now, sent, "")
    elif ep["alerted"] and now - ep["last"] >= REMIND_S:
        ep["n"] += 1
        _alert(role, bad, ep, tail, io, now, sent, f" (x{ep['n'] + 1} since {hhmm(ep['first'])})")

def _alert(role, bad, ep, tail, io, now, sent, suffix):
    ep.update(alerted=True, last=now); sent[f"{role}|{bad}"] = now
    if not io.tg(f"{WHO[role]} ({role}) נתקע: {WHAT[bad]}. צריך לבדוק.{suffix}"): io.log(f"control_health: Telegram not sent ({role} {bad})")
    to = "orchestrator" if role == "inspector" else "inspector"
    io.tell(to, f"WATCHDOG (#890): control session {role} is stuck: {bad}{suffix}. Last screen lines:\n" + "\n".join(tail[-3:]))
    io.log(f"control_health: {role} {bad}{suffix}")

def restart_gate(role, now, tg, st=None):
    """#140 backoff: True = restart now. A role restarted RESTART_N times in 30 min: ONE Telegram message, no restart for 30 min."""
    disk = st is None
    st = load() if disk else st
    rs = st.setdefault("restarts", {}); pause = st.setdefault("pause", {})
    ok = True
    if now < pause.get(role, 0): ok = False
    else:
        pause.pop(role, None)
        h = [x for x in rs.get(role, []) if now - x < RESTART_WIN_S]
        if len(h) >= RESTART_N:
            pause[role] = now + RESTART_WIN_S; h = []; ok = False
            tg(f"{WHO.get(role, role)} ({role}): לא מצליח להפעיל. עצרתי ל-30 דקות.")
        else: h.append(now)
        rs[role] = h
    if disk: save(st)
    return ok

def line(st=None):
    return (st if st is not None else load()).get("text", "")
