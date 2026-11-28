"""#710 usage alarms: the owner hears early when the week budget is wasted or about to run out, one fix per alarm.
Rules (pure, evaluate()): UNDERUSE, IDLE, BEHIND, OVERUSE, STALE, PLAN CHANGED (info only). Inputs: the governor dict
(.runs/governor.json: week_pct, week_reset, need, n_hi, lanes, b, b0, mode, stale_since), the last busy-lane count and the
usage_hist samples. Sent by the watchdog's usage_tick (watchdog tell + Telegram), each rule at most once per `every_h` hours;
active alarms are kept in .runs/usage_alarms.json and appended to the governor line (panel + dashboard). Never fixes anything."""
import json, os, time, tomllib
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNS = Path(os.environ.get("RUNNER_RUNS") or HERE / ".runs")
try: _C = tomllib.loads((HERE / "config.toml").read_text(encoding="utf-8"))
except Exception: _C = {}
CFG = {"every_h": float(_C.get("usage_alarm_every_h", 3)), "underuse": float(_C.get("usage_underuse_pct", 94)),
       "idle_min": float(_C.get("usage_idle_min", 60)), "behind_ratio": float(_C.get("usage_behind_ratio", 0.5)),
       "behind_h": float(_C.get("usage_behind_h", 3)), "overuse": float(_C.get("usage_overuse_pct", 100))}
STATE = "usage_alarms.json"

def burn_3h(hist, now, w, reset, cfg):
    """Pure: week-% per hour burned over the last behind_h hours (same week only), None when the samples do not cover ~85% of it."""
    rows = [h for h in hist or [] if h.get("week") is not None and now - h.get("at", 0) <= cfg["behind_h"] * 3600 + 600]
    if not rows: return None
    first = min(rows, key=lambda h: h["at"])
    span = (now - first["at"]) / 3600
    if span < 0.85 * cfg["behind_h"] or w < first["week"]: return None    # too little data, or the week reset in between
    return (w - first["week"]) / span

def evaluate(gv, busy, hist, now, st, cfg=CFG):
    """Pure: -> ([(rule, text, info_only)], new idle/mode state). `st` = {idle_since, mode}. A rule's text names the number and one fix."""
    out, st = [], dict(st or {})
    mode = gv.get("mode")
    if mode and st.get("mode") and mode != st["mode"] and "none" not in (mode, st["mode"]):
        out.append(("PLAN CHANGED", f"The usage buckets changed: {st['mode']} -> {mode}. Fix: none needed, the governor re-plans by itself (info only)", True))
    if mode: st["mode"] = mode
    if gv.get("stale_since") is not None:
        out.append(("STALE", f"The usage reading is stale since {time.strftime('%H:%M', time.localtime(gv['stale_since']))}; lanes hold, then drop to the floor. "
                             "Fix: check that the panel is open and writing .runs/usage.json", False))
    W, reset = gv.get("week_pct"), gv.get("week_reset")
    if W is None or reset is None or gv.get("need") is None or reset <= now: st.pop("idle_since", None); return out, st
    H, b, b0 = (reset - now) / 3600, gv.get("b") or 0.2, gv.get("b0") or 0.0
    n_hi, need, lanes = gv.get("n_hi") or 0, gv["need"], gv.get("lanes") or 0
    full = W + (b * n_hi + b0) * H
    if full < cfg["underuse"]:
        out.append(("UNDERUSE", f"Even at full speed the week ends at {full:.0f}% (< {cfg['underuse']:.0f}%): {cfg['underuse'] - full:.0f}% of the budget will be left over. "
                                f"Fix: add ready issues (N_hi is {n_hi:.0f} now)", False))
    proj = W + (b * busy + b0) * H
    if proj >= cfg["overuse"]:
        out.append(("OVERUSE", f"The week is projected to reach {proj:.0f}% before the reset (now {W:.0f}%, {busy} busy lanes). "
                               "Fix: lower governor_ceiling or park low-priority issues", False))
    if need > 0 and busy < lanes:
        st.setdefault("idle_since", now)
        if now - st["idle_since"] > cfg["idle_min"] * 60:
            out.append(("IDLE", f"{busy} of {lanes} lanes busy for {(now - st['idle_since']) / 60:.0f} min while {need:.1f}%/h is still to burn. "
                                "Fix: add ready issues, or raise max_core if core issues are waiting", False))
    else: st.pop("idle_since", None)
    bn = burn_3h(hist, now, W, reset, cfg)
    if need > 0 and bn is not None and bn < cfg["behind_ratio"] * need:
        out.append(("BEHIND", f"Burn over {cfg['behind_h']:.0f} h is {bn:.2f}%/h, below {cfg['behind_ratio'] * 100:.0f}% of the {need:.2f}%/h needed. "
                              "Fix: add ready issues or more parallel lanes", False))
    return out, st

def due(found, sent, now, every_h=None):
    """Pure: found [(rule, text, info)] + {rule: last sent} -> ([texts to send now], new sent). At most once per rule per every_h."""
    every_h = CFG["every_h"] if every_h is None else every_h
    texts, sent = [], dict(sent)
    for rule, text, info in found:
        if now - sent.get(rule, 0) < every_h * 3600: continue
        sent[rule] = now; texts.append(f"{rule}: {text}")
    return texts, sent

def active(sent, found, now, every_h=None):
    """Pure: the rules firing now AND sent within every_h -> names for the panel line."""
    every_h = CFG["every_h"] if every_h is None else every_h
    return [r for r, _, info in found if not info and now - sent.get(r, 0) < every_h * 3600]

def line():
    """'ALARM: UNDERUSE · IDLE' for the governor line (panel + dashboard), '' when none."""
    try: d = json.loads((RUNS / STATE).read_text(encoding="utf-8"))
    except Exception: return ""
    return " · ALARM: " + " · ".join(d["active"]) if d.get("active") else ""

def tick(tell=print, log=print, now=None, send=None, busy=None, hist=None):
    """Watchdog hook: read governor.json + usage_hist.jsonl, send the due alarms, write usage_alarms.json."""
    now = now or time.time()
    try: gv = json.loads((RUNS / "governor.json").read_text(encoding="utf-8"))
    except Exception: return []
    if hist is None:
        try: hist = [json.loads(l) for l in (RUNS / "usage_hist.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
        except Exception: hist = []
    if busy is None: busy = int((hist[-1].get("busy") or 0)) if hist else 0
    try: d = json.loads((RUNS / STATE).read_text(encoding="utf-8"))
    except Exception: d = {}
    found, st = evaluate(gv, busy, hist, now, d.get("state"), CFG)
    texts, sent = due(found, d.get("sent", {}), now)
    try:
        RUNS.mkdir(exist_ok=True)
        (RUNS / STATE).write_text(json.dumps({"state": st, "sent": sent, "active": active(sent, found, now), "at": now}), encoding="utf-8")
    except OSError as e: log(f"usage alarms not saved: {e!r}")
    for x in texts:
        tell("ALARM (usage): " + x)
        try: (send or __import__("telegram").send)("ALARM (usage): " + x)
        except Exception: pass
    return texts
