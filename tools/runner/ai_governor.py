"""#707 AI governor: a Sonnet (effort medium) step, hourly and on big changes, decides lanes / order / raises / mode / actions INSIDE the
hard bounds of the deterministic core (#705). The core keeps the hard stop and takes over whenever the step fails.
Flow: `maybe_start()` (called by runner.governor_pass) starts ONE background `claude -p --model sonnet --effort medium` (3 min timeout)
when `trigger()` says so; its JSON answer is stored in .runs/ai_governor.json; `overlay()` applies the stored decision to every core
result through the pure `apply_ai()`. Quality before usage: floors are reviewer Opus medium+, effort medium+, never Haiku for code/review.
"""
import json, shutil, subprocess, sys, threading, time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

MODEL, EFFORT, TIMEOUT_S, EVERY_S, MAX_VALID_MIN = "sonnet", "medium", 180, 3600, 90
RANK = ["haiku", "sonnet", "opus", "fable"]
EFFORTS = ["low", "medium", "high", "xhigh", "max"]
MODES = ("sprint", "normal", "hold")
ACTIONS = ("orchestrator_idle", "stop_run", "role_model")
ROLES = ("worker", "reviewer", "fix", "tester")
RUN = subprocess.run                               # tests swap in a fake claude
_running = globals().get("_running") or {"v": False}

def _runs():
    import runner as R
    return R.RUNS

def _int(x):
    try: return int(x)
    except (TypeError, ValueError): return None

def floor_of(role, labels=()):
    """Pure: (min model, min effort) for a role. Reviewer Opus; design/UI/security/save/sync work Opus + high; effort medium everywhere."""
    sensitive = any(l in labels for l in ("design", "ui", "ux", "security", "save", "sync"))
    if role == "reviewer" or sensitive: return "opus", ("high" if sensitive else "medium")
    return "sonnet" if role in ("worker", "fix") else "sonnet", "medium"

def apply_ai(core, advice, now, labels_of=None):
    """Pure (#707): core governor dict (lanes, stop, n_hi, n_lo, c, ready, ...) + the AI advice dict -> (applied, refused).
    applied = {lanes, order, raise, mode, actions, reason, c} or None when the whole advice is unusable (stale/invalid -> core alone);
    refused = [reasons]. Every field is clamped to the bounds: lanes in [N_lo, N_hi] (and never when the core stops), order only ready
    issue numbers (express/P0 stay first: the runner's queue key keeps them first), raise only upwards and never below the floors,
    C only lowered, actions only the known kinds, role_model never below the floors."""
    refused = []
    if not isinstance(advice, dict): return None, ["invalid advice"]
    at = advice.get("at")
    valid = min(float(advice.get("valid_min") or MAX_VALID_MIN), MAX_VALID_MIN)
    if not isinstance(at, (int, float)) or now - at > valid * 60: return None, [f"decision older than {valid:.0f} min"]
    out = {"lanes": core.get("lanes"), "order": [], "raise": [], "mode": "normal", "actions": [], "c": core.get("c"),
           "reason": str(advice.get("reason") or "")[:200]}
    lanes = _int(advice.get("lanes"))
    if lanes is not None:
        lo, hi = int(core.get("n_lo") or 0), int(core.get("n_hi") if core.get("n_hi") is not None else core.get("lanes", 0))
        if core.get("stop"): refused.append(f"lanes {lanes} while the core stops")
        elif lanes > hi: refused.append(f"lanes {lanes} > N_hi {hi}"); out["lanes"] = hi
        elif lanes < lo: refused.append(f"lanes {lanes} < N_lo {lo}"); out["lanes"] = lo
        else: out["lanes"] = lanes
    mode = advice.get("mode")
    if mode in MODES: out["mode"] = mode
    elif mode is not None: refused.append(f"mode {mode!r} unknown")
    if advice.get("c") is not None:
        try:
            c = float(advice["c"])
            if core.get("c") is not None and c > core["c"]: refused.append(f"C {c:g} > core C {core['c']:g}")
            else: out["c"] = c
        except (TypeError, ValueError): refused.append("C invalid")
    order = advice.get("order") or []
    ints = [n for n in map(_int, order) if n is not None] if isinstance(order, list) else []
    out["order"] = list(dict.fromkeys(ints))
    labels_of = labels_of or (lambda n: [])
    for r in advice.get("raise") or []:
        n, m, e = _int((r or {}).get("issue")), (r or {}).get("model"), (r or {}).get("effort")
        cur_m = max((x for x in RANK if f"model:{x}" in labels_of(n)), key=RANK.index, default="sonnet") if n else "sonnet"
        cur_e = max((x for x in EFFORTS if f"effort:{x}" in labels_of(n)), key=EFFORTS.index, default="medium") if n else "medium"
        fm, fe = floor_of("worker", labels_of(n) if n else ())
        item = {"issue": n}
        if n is None: refused.append("raise without issue"); continue
        if m is not None:
            if m not in RANK or RANK.index(m) < max(RANK.index(cur_m), RANK.index(fm)): refused.append(f"raise #{n} model {m} below {max(cur_m, fm, key=RANK.index)}")
            else: item["model"] = m
        if e is not None:
            if e not in EFFORTS or EFFORTS.index(e) < max(EFFORTS.index(cur_e), EFFORTS.index(fe)): refused.append(f"raise #{n} effort {e} below {max(cur_e, fe, key=EFFORTS.index)}")
            else: item["effort"] = e
        if len(item) > 1: out["raise"].append(item)
    for a in advice.get("actions") or []:
        k = (a or {}).get("kind")
        if k not in ACTIONS: refused.append(f"action {k!r} unknown"); continue
        if k == "role_model":
            fm, fe = floor_of(a.get("role"))
            if a.get("role") not in ROLES or a.get("model") not in RANK or RANK.index(a["model"]) < RANK.index(fm) \
               or (a.get("effort") is not None and (a["effort"] not in EFFORTS or EFFORTS.index(a["effort"]) < EFFORTS.index(fe))):
                refused.append(f"role_model {a.get('role')} {a.get('model')} below the floor"); continue
        if k == "stop_run" and _int(a.get("issue")) is None: refused.append("stop_run without issue"); continue
        out["actions"].append(a)
    return out, refused

def trigger(core, st, now, ctx):
    """Pure (#707): why a step should start now (a string) or None. st = state {at, ready, mode}; ctx = {fix_1h, entity_alarm}.
    Hourly, plan changed, limit near (W >= C-3 or 5h >= 90), ready queue +5, 3+ FIX in the last hour, an ENTITY alarm."""
    if now - st.get("at", 0) >= EVERY_S: return "hourly"
    W, C, F = core.get("week_pct"), core.get("c"), core.get("pct")
    if st.get("mode") and core.get("mode") and st["mode"] != core["mode"]: return f"plan changed {st['mode']} -> {core['mode']}"
    if (W is not None and C is not None and W >= C - 3) or (F is not None and F >= 90): return "limit near"
    if core.get("ready") is not None and st.get("ready") is not None and core["ready"] - st["ready"] >= 5: return "ready queue jumped"
    if ctx.get("fix_1h", 0) >= 3: return "3+ FIX verdicts in the last hour"
    if ctx.get("entity_alarm"): return "entity alarm"
    return None

def prompt(core, ctx, history):
    return ("You are the AI governor of the Oren study runner. Decide usage for the next hour. QUALITY BEFORE USAGE: the reviewer is always Opus "
            "(effort medium+, high for design/UI/UX/security/save/sync); effort floor medium everywhere; never Haiku for code or review; a tight "
            "budget means fewer lanes, never cheaper review. You may lower C, never raise it. Stay inside lanes in [n_lo, n_hi].\n"
            "Answer with ONE JSON object only: {\"lanes\": int, \"order\": [issue numbers], \"raise\": [{\"issue\": n, \"model\": \"opus\", \"effort\": \"high\"}], "
            "\"mode\": \"sprint\"|\"normal\"|\"hold\", \"actions\": [{\"kind\": \"orchestrator_idle\"|\"stop_run\"|\"role_model\", ...}], \"reason\": str, \"valid_min\": <=90}\n\n"
            "--- core forecast ---\n" + json.dumps({k: core.get(k) for k in ("lanes", "n_lo", "n_hi", "n_week", "need", "week_pct", "pct", "c", "mode", "ready", "why")}, default=str)
            + "\n--- situation ---\n" + json.dumps(ctx, default=str) + "\n--- last decisions ---\n" + json.dumps(history[-6:], default=str))

def command():
    return [shutil.which("claude") or "claude", "-p", "--model", MODEL, "--effort", EFFORT, "--no-session-persistence", "--tools", ""]

def parse(out):
    """Pure: the first JSON object in the output -> dict, or None."""
    s = out or ""
    i, j = s.find("{"), s.rfind("}")
    if i < 0 or j <= i: return None
    try: d = json.loads(s[i:j + 1])
    except ValueError: return None
    return d if isinstance(d, dict) else None

def ask(text):
    """-> (ok, stdout or error text)."""
    try: p = RUN(command(), input=text, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=TIMEOUT_S)
    except subprocess.TimeoutExpired: return False, f"timeout after {TIMEOUT_S // 60} min"
    except OSError as e: return False, f"could not start claude: {e!r}"
    if p.returncode: return False, f"claude exit {p.returncode}"
    return True, p.stdout or ""

def _load(name, default):
    try: return json.loads((_runs() / name).read_text(encoding="utf-8"))
    except Exception: return default

def _save(name, data):
    try: (_runs()).mkdir(exist_ok=True); (_runs() / name).write_text(json.dumps(data), encoding="utf-8")
    except Exception: pass

def entity_info(now):
    """#708 file read when present (-> dict), ignored when missing (-> None)."""
    return _load("usage_by_entity.json", None)

def context(core, now):
    import runner as R
    ev = []
    try:
        for l in (R.RUNS / "stats.jsonl").read_text(encoding="utf-8").splitlines()[-5000:]:
            try: ev.append(json.loads(l))
            except ValueError: pass
    except OSError: pass
    day = [e for e in ev if e.get("ts", 0) > now - 86400]
    cnt = lambda name, since=86400: sum(e.get("event") == name and e.get("ts", 0) > now - since for e in day)
    ent = entity_info(now)
    return {"fix_1h": cnt("review_fix", 3600), "merged_24h": cnt("merged"), "fix_24h": cnt("review_fix"), "redo_24h": cnt("retry"),
            "entity": ent, "entity_alarm": bool(ent and ent.get("alarm")), "override": _load("override.json", None),
            "ready": core.get("ready"), "ready_issues": _load("ai_ready.json", [])}

def log(msg, now=None):
    import runner as R
    R.log_line(f"{time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(now or time.time()))} {msg}")

def step(core, ctx, now, reason):
    """One AI step (blocking): ask, parse, store. Failure -> state `down`, the core runs alone. Never raises."""
    st = _load("ai_governor_state.json", {})
    ok, out = ask(prompt(core, ctx, _load("ai_governor_hist.json", [])))
    advice = parse(out) if ok else None
    st.update({"at": now, "ready": core.get("ready"), "mode": core.get("mode"), "down": advice is None})
    if advice is None:
        log(f"AI governor down: core alone ({out if not ok else 'invalid JSON'})", now)
    else:
        advice["at"] = now; advice["trigger"] = reason
        _save("ai_governor.json", advice)
        hist = (_load("ai_governor_hist.json", []) + [{"at": now, "lanes": advice.get("lanes"), "mode": advice.get("mode"), "reason": advice.get("reason")}])[-24:]
        _save("ai_governor_hist.json", hist)
    _save("ai_governor_state.json", st)
    return advice

def maybe_start(core, now, background=True):
    """Called by runner.governor_pass: starts ONE step in a background thread when a trigger fires. -> trigger reason or None."""
    if _running["v"]: return None
    st = _load("ai_governor_state.json", {})
    ctx = context(core, now)
    why = trigger(core, st, now, ctx)
    if not why: return None
    _running["v"] = True
    def go():
        try: step(core, ctx, now, why)
        finally: _running["v"] = False
    if background: threading.Thread(target=go, daemon=True).start()
    else: go()
    return why

def decision_text(core, applied):
    return f"AI governor: {applied['lanes']} lanes, {applied['mode']} ({core.get('ready')} ready)" + \
           (f", #{applied['order'][0]} first" if applied["order"] else "") + (f": {applied['reason']}" if applied["reason"] else "")

def overlay(core, now, labels_of=None):
    """Apply the stored decision to the core result (never raises). Logs every decision/refusal once per decision. -> core dict
    (a copy with lanes/why/ai fields) -- the core alone with why 'AI governor down: core alone' when the step failed or is stale."""
    try:
        st = _load("ai_governor_state.json", {})
        if not st: return core                                   # no step yet: the core alone, silently
        advice = _load("ai_governor.json", None)
        applied, refused = apply_ai(core, advice if not st.get("down") else None, now, labels_of)
        gv = dict(core)
        if applied is None:
            gv["ai"] = None; gv["why"] = f"{core['why']}; AI governor down: core alone"
            return gv
        gv.update({"lanes": applied["lanes"], "ai": applied, "c": applied["c"]})
        gv["why"] = f"{core['why']}; {decision_text(core, applied)}"
        if advice and advice.get("logged") != advice.get("at"):
            log(decision_text(core, applied), now)
            for r in refused: log(f"AI governor refused: {r}", now)
            advice["logged"] = advice.get("at"); _save("ai_governor.json", advice)
            for a in applied["actions"]: log(f"AI governor action: {json.dumps(a)}", now)
        return gv
    except Exception:
        return core
