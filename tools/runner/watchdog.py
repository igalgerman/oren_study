"""Watchdog: keeps the flow from getting stuck. Runs forever in the herdr window `watchdog` (started by tools/orchestrator.cmd).
Every minute it checks, deterministically:
  1. a worker/reviewer/intake window waiting for an answer (status blocked)  -> tells the orchestrator (once per new screen; also a worker whose last line is QUESTION:)
  2. a worker/reviewer that stopped without its RESULT:/VERDICT: line for 10 min -> tells the orchestrator
  3. free lanes + ready issues but no runner pass running                       -> starts a runner pass
  3b. a window waiting for the owner longer than park_minutes (the runner parks it itself; this is the fallback): issue gets blocked + ready-for-human, lane freed
  5. every observer_minutes: observer.py applies deterministic rules (make_ready, rerun, fix Blocked-by lines) within limits
  6. every sync_minutes: git pull --ff-only of the main checkout when clean (logs when it can't), so runner/watchdog/panel never run old code
  4. the orchestrator window is gone                                           -> writes it in the log (the owner sees it in /status)
It never answers questions or presses keys in other windows; it only tells the orchestrator and starts the runner.
Usage: python watchdog.py [--once]
"""
import hashlib, importlib, json, re, shutil, subprocess, sys, time, threading
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import runner as R   # config, gh(), select(), hc paths

EVERY = int(R.CFG.get("watchdog_seconds", 60))
LOG = R.RUNS / "watchdog.log"
told = {}          # window -> hash of the screen we already reported
idle_since = {}    # window -> first time seen stopped without a marker
waiting_since = {} # window -> first time seen waiting for a person (blocked menu or unanswered QUESTION:)

def log(msg):
    R.RUNS.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")

def windows():
    rc, out = R.hc("ls", "--json", timeout=30)
    if rc: return []
    try: return json.loads(out.strip().splitlines()[-1]).get("terminals", [])
    except Exception: return []

def tell(text):
    rc, out = R.hc("send", "orchestrator", text, timeout=30)
    log(("told orchestrator: " if rc == 0 else "could not tell orchestrator: ") + text[:200])

def screen_text(name):
    return R.hc("read", name, "--lines", "80", timeout=30)[1]

def screen_tail(name, n=12):
    rc, out = R.hc("read", name, "--lines", "60", timeout=30)
    lines = [l.rstrip() for l in out.splitlines() if l.strip() and not set(l.strip()) <= set("─╌│ ")]
    return "\n".join(lines[-n:])

def pin(t, on):
    """Pin a window that waits for the owner to the top of Herdr's agent lists (unpin when answered)."""
    if t.get("address") and Path(R.HERDR_APP).exists():
        R.run([R.HERDR_APP, "do", "terminal.pin", "--terminal", t["address"], "--pinned", "true" if on else "false"], timeout=30)

def needs_you_line(name, q, tail):
    """One console line for the orchestrator: `NEEDS YOU: #n <question>`."""
    m = re.match(r"(?:issue|review)-(\d+)", name)
    who = f"#{m[1]}" if m else name
    what = re.sub(r"^QUESTION:\s*", "", q) if q else "(waiting for an answer) " + (tail.strip().splitlines() or [""])[-1]
    return f"NEEDS YOU: {who} {what}".rstrip()

def check_windows(ts):
    names = {t.get("name") or "" for t in ts}
    if "orchestrator" not in names: log("orchestrator window is not running")
    now = time.time()
    for t in ts:
        name, status = t.get("name") or "", t.get("status", "")
        if t.get("state") != "live" or not name.startswith(("issue-", "review-", "intake")): continue
        screen = screen_text(name) if status in ("blocked", "done", "idle") else ""
        q = R.pending_question(screen) if status in ("done", "idle") else ""
        if status == "blocked" or q:
            since = waiting_since.setdefault(name, now)
            tail = chr(10).join(l for l in screen.splitlines() if l.strip() and not set(l.strip()) <= set("─╌│ "))[-1500:]
            if status == "blocked" and "trust this folder" in screen and now - since < 120: continue   # the runner accepts this dialog itself
            if status == "blocked" and now - since < 90: continue                                        # short menus the runner/owner answers at once: no alarm
            h = hashlib.sha1((q or tail[-600:]).encode()).hexdigest()
            if told.get(name) != h:
                told[name] = h
                pin(t, True)
                what = f"asks: {q}" if q else "is waiting for an answer"
                tell(f"{needs_you_line(name, q, tail)}{chr(10)}WATCHDOG: window {name} {what}. Ask the owner ONE short line in your window, then answer it "
                     f"(hc send {name} \"..\" or the menu option he picks). Its screen ends with:{chr(10)}{tail}")
            m = re.match(r"(?:issue|review)-(\d+)", name)       # fallback for a runner that did not park by itself
            if m and R.should_park(since, now, R.PARK_MINUTES + 3) and R.park_issue(int(m[1]), name, tail, since):
                log(f"parked #{m[1]} ({name} waiting since {time.strftime('%H:%M', time.localtime(since))})")
            continue
        if waiting_since.pop(name, None) is not None: pin(t, False)  # answered: unpin
        if told.get(name) not in (None, "idle"): told.pop(name)       # answered: a later new question is reported again
        if status in ("done", "idle") and name.startswith(("issue-", "review-")):
            marker = "VERDICT:" if name.startswith("review-") else "RESULT:"
            if R.find_marker(screen, marker):
                idle_since.pop(name, None); continue
            first = idle_since.setdefault(name, now)
            if now - first > 600 and told.get(name) != "idle":
                told[name] = "idle"
                tell(f"WATCHDOG: {name} stopped 10+ minutes ago without its {marker} line. Read it (hc read {name}) and get it to finish "
                     f"(push, PR, last line {marker} ...), or ask the owner.")
        else:
            idle_since.pop(name, None); told.pop(name, None)

def check_lanes(ts):
    if any((t.get("name") or "").startswith("run-pass") and t.get("state") == "live" for t in ts): return
    rc, out = R.gh("issue", "list", "--state", "open", "--limit", "200", "--json", "number,labels,createdAt,updatedAt,title,body")
    if rc: return
    issues = [{**i, "labels": [l["name"] for l in i["labels"]]} for i in json.loads(out)]
    if not R.select(issues, R.CFG["max_parallel"], R.MAX_CORE, R.EXPRESS): return
    orch = R.hc_json("get", "orchestrator", "--json").get("address", "")
    name = f"run-pass-{int(time.time()) % 100000}"
    cmd = [R.HC, "run", "--bg", "--outlive-parent", "--name", name, "--cwd", str(R.ROOT), "--label", "role=runner"]
    cmd += ["--parent", orch] if orch else ["--no-parent"]
    cmd += [sys.executable, str(HERE / "runner.py"), f"--term={name}"]
    rc, out = R.run(cmd, timeout=60)
    log(f"free lane + ready issue -> started {name} (rc {rc})")

FINISHED_RE = re.compile(r"^(run|issue|review|intake)-|^watchdog|^flowtest")
IDLE_MIN = 15      # a live issue/review/intake window done/idle this long, with no live run-<n>, only holds RAM
quiet_since = {}   # live window name -> first time seen done/idle

def leftovers(ts, closed, blocked, human=frozenset(), stale=frozenset()):
    """Pure: names of windows to close. ts = hc terminals (name, state, status, marker True/False),
    closed = closed issue numbers, blocked = issue numbers labelled blocked (parked: keep their windows for the owner),
    human = issue numbers labelled ready-for-human (owner may look), stale = live window names done/idle for IDLE_MIN+."""
    live = {t["name"] for t in ts if t.get("state") == "live"}
    live_run = {int(m.group(1)) for x in live for m in [re.match(r"^run-(\d+)(-\w+)?$", x)] if m}
    out = []
    for t in ts:
        name = t.get("name") or ""
        if t.get("state") != "live" and FINISHED_RE.match(name):            # any finished terminal: remove it (by address)
            if name not in live and name not in out: out.append(name)
            continue
        m = re.match(r"^(issue|review|run|intake)-(\d+)(-fix|-2)?$", name)
        if not m: continue
        n, role, suffix = int(m.group(2)), m.group(1), m.group(3) or ""
        if t.get("state") != "live": continue
        if n in blocked: continue                                           # parked: the owner looks at it later
        if n in closed: out.append(name); continue                          # issue done: everything for it goes
        if role != "run" and name in stale and n not in live_run and n not in human: out.append(name); continue
        if role in ("run", "intake") or t.get("status") not in ("done", "idle") or not t.get("marker"): continue
        # a worker/reviewer that printed its RESULT/VERDICT and was superseded by the next step's window
        later = {"issue": [f"review-{n}", f"review-{n}-2", f"issue-{n}-fix"] if not suffix else [f"review-{n}-2"],
                 "review": [f"issue-{n}-fix"] if not suffix else []}[role]
        if any(x in live for x in later): out.append(name)
    return out

def cleanup(ts):
    rc, out = R.gh("issue", "list", "--state", "all", "--limit", "300", "--json", "number,state,labels")
    if rc: return
    iss = json.loads(out)
    closed = {i["number"] for i in iss if i["state"] == "CLOSED"}
    blocked = {i["number"] for i in iss if any(l["name"] == "blocked" for l in i["labels"])}
    human = {i["number"] for i in iss if any(l["name"] == "ready-for-human" for l in i["labels"])}
    rows, now, stale = [], time.time(), set()
    for t in ts:
        name = t.get("name") or ""
        if not FINISHED_RE.match(name): continue
        if t.get("state") == "live" and t.get("status") in ("done", "idle"):
            if now - quiet_since.setdefault(name, now) >= IDLE_MIN * 60: stale.add(name)
        else: quiet_since.pop(name, None)
        if t.get("state") == "live" and not re.match(r"^(issue|review|run|intake)-\d+", name): continue   # never touch live watchdog etc.
        mk = "VERDICT:" if name.startswith("review-") else "RESULT:"
        marker = t.get("state") == "live" and t.get("status") in ("done", "idle") and bool(R.find_marker(screen_tail(name, 40), mk))
        rows.append({**t, "name": name, "marker": marker})
    for name in leftovers(rows, closed, blocked, human, stale):
        # act on the ADDRESS of the matching row, never the bare name: a finished terminal can share its
        # name with a new live one, and `hc kill <name>` would hit the live one.
        for t in rows:
            if t["name"] != name or not t.get("address"): continue
            if t.get("state") == "live": R.hc("kill", t["address"], timeout=30)
            R.hc("rm", t["address"], timeout=30)
            log(f"closed window {name} ({t['address']}, was {t.get('state')})")

def observer_tick():
    import observer; observer.run_if_due()      # acting observer (observer.py)

SYNC_MIN = int(R.CFG.get("sync_minutes", 3))
_sync = {"last": 0.0, "msg": ""}

def sync_tick():
    """Every SYNC_MIN minutes fast-forward the main checkout; log changes of state only."""
    if time.time() - _sync["last"] < SYNC_MIN * 60: return
    _sync["last"] = time.time()
    msg = R.sync_main()
    if msg and msg != _sync["msg"]: log(msg)
    _sync["msg"] = msg

def main():
    log("watchdog started")
    stamp = (HERE / "runner.py").stat().st_mtime
    while True:
        try:
            m = (HERE / "runner.py").stat().st_mtime
            if m != stamp:                    # runner.py changed: pick up the new select()/park logic without restarting this window
                stamp = m; importlib.reload(R); log("reloaded runner.py")
            ts = windows()
            check_windows(ts)
            check_lanes(ts)
            cleanup(R.hc_json("ls", "--all", "--json").get("terminals", []) or ts)
            observer_tick()
            sync_tick()
        except Exception as e:
            log(f"error: {e!r}")
        if "--once" in sys.argv: return
        time.sleep(EVERY)

if __name__ == "__main__":
    main()
