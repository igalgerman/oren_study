"""Watchdog: keeps the flow from getting stuck. Runs forever in the herdr window `watchdog` (started by tools/orchestrator.cmd).
Every minute it checks, deterministically:
  1. a worker/reviewer/intake window waiting for an answer (status blocked)  -> tells the orchestrator (once per new screen; also a worker whose last line is QUESTION:)
  2. a worker/reviewer that stopped without its RESULT:/VERDICT: line for 10 min -> tells the orchestrator
  3. free lanes + ready issues but no runner pass running                       -> starts a runner pass
  3b. a window waiting for the owner longer than park_minutes (the runner parks it itself; this is the fallback): issue gets blocked + ready-for-human, lane freed
  5. every observer_minutes: a read-only headless Claude audits the flow (observer_prompt.md); problems go to the orchestrator
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
                tell(f"WATCHDOG: window {name} {what}. Ask the owner ONE short line in your window, then answer it "
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
    if not R.select(issues, R.CFG["max_parallel"]): return
    orch = R.hc_json("get", "orchestrator", "--json").get("address", "")
    name = f"run-pass-{int(time.time()) % 100000}"
    cmd = [R.HC, "run", "--bg", "--outlive-parent", "--name", name, "--cwd", str(R.ROOT), "--label", "role=runner"]
    cmd += ["--parent", orch] if orch else ["--no-parent"]
    cmd += [sys.executable, str(HERE / "runner.py"), f"--term={name}"]
    rc, out = R.run(cmd, timeout=60)
    log(f"free lane + ready issue -> started {name} (rc {rc})")

def leftovers(ts, closed, blocked):
    """Pure: names of finished windows to close. ts = hc terminals (name, state, status, marker True/False),
    closed = closed issue numbers, blocked = issue numbers labelled blocked (parked: keep their windows for the owner)."""
    live = {t["name"] for t in ts if t.get("state") == "live"}
    out = []
    for t in ts:
        name = t.get("name") or ""
        m = re.match(r"^(issue|review|run|intake)-(\d+)(-fix|-2)?$", name)
        if not m: continue
        n, role, suffix = int(m.group(2)), m.group(1), m.group(3) or ""
        if t.get("state") != "live":                                       # finished terminal: remove it (by address)
            if name not in live: out.append(name)
            continue
        if n in blocked: continue                                           # parked: the owner looks at it later
        if n in closed: out.append(name); continue                          # issue done: everything for it goes
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
    rows = []
    for t in ts:
        name = t.get("name") or ""
        if not re.match(r"^(issue|review|run|intake)-\d+", name): continue
        mk = "VERDICT:" if name.startswith("review-") else "RESULT:"
        marker = t.get("state") == "live" and t.get("status") in ("done", "idle") and bool(R.find_marker(screen_tail(name, 40), mk))
        rows.append({**t, "name": name, "marker": marker})
    for name in leftovers(rows, closed, blocked):
        # act on the ADDRESS of the matching row, never the bare name: a finished terminal can share its
        # name with a new live one, and `hc kill <name>` would hit the live one.
        for t in rows:
            if t["name"] != name or not t.get("address"): continue
            if t.get("state") == "live": R.hc("kill", t["address"], timeout=30)
            R.hc("rm", t["address"], timeout=30)
            log(f"closed window {name} ({t['address']}, was {t.get('state')})")

OBSERVER_MIN = int(R.CFG.get("observer_minutes", 30))
OBS_PROMPT = HERE / "observer_prompt.md"
OBS_LOG, OBS_LAST = R.RUNS / "observer.log", R.RUNS / "observer.last"
OBS_TOOLS = ["Read", "Grep", "Glob", "Bash(gh:*)", "Bash(git log:*)", "Bash(git show:*)", "Bash(hc:*)"]
_obs = {"last": 0.0, "running": False}

def observer_due(last, now, minutes, running):
    """Pure: start the observer when none runs and `minutes` passed since the last start."""
    return not running and now - last >= minutes * 60

def parse_observer(text):
    """Pure: the `OBSERVER: <problem> -> <fix>` lines of the output ([] when OK or unparseable), max 8."""
    out = [l.strip() for l in text.splitlines() if l.strip().startswith("OBSERVER:")]
    out = [l for l in out if l.rstrip() != "OBSERVER: OK"]
    return out[:8]

def observer_once():
    """Run the observer now (blocking); returns the problem lines. Logs, writes observer.last, tells the orchestrator."""
    prompt = OBS_PROMPT.read_text(encoding="utf-8").replace("{HC}", R.HC)
    cmd = [shutil.which("claude") or "claude", "-p", "--model", "sonnet", "--permission-mode", "auto", "--allowedTools", *OBS_TOOLS]
    rc, out = R.run(cmd, cwd=str(R.ROOT), input=prompt, timeout=900)   # prompt on stdin: --allowedTools would swallow a positional one
    hhmm = time.strftime("%H:%M")
    R.RUNS.mkdir(parents=True, exist_ok=True)
    with open(OBS_LOG, "a", encoding="utf-8") as f: f.write(f"=== {time.strftime('%Y-%m-%d %H:%M:%S')} rc={rc}\n{out}\n")
    probs = parse_observer(out)
    if rc or ("OBSERVER-END" not in out and not probs and "OBSERVER: OK" not in out): res = f"{hhmm} failed (rc {rc})"
    elif probs: res = f"{hhmm} {len(probs)} problems"
    else: res = f"{hhmm} OK"
    OBS_LAST.write_text(res + "\n", encoding="utf-8")
    if probs: tell("OBSERVER found:" + chr(10) + chr(10).join(probs))
    log("observer: " + res)
    return probs

def observer_tick():
    if not observer_due(_obs["last"], time.time(), OBSERVER_MIN, _obs["running"]): return
    _obs["last"], _obs["running"] = time.time(), True
    def work():
        try: observer_once()
        except Exception as e: log(f"observer error: {e!r}")
        finally: _obs["running"] = False
    threading.Thread(target=work, daemon=True).start()

def main():
    if "--observe-once" in sys.argv:
        sys.stdout.reconfigure(encoding="utf-8")
        print("\n".join(observer_once()) or "no problems"); print(OBS_LAST.read_text()); return
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
        except Exception as e:
            log(f"error: {e!r}")
        if "--once" in sys.argv: return
        time.sleep(EVERY)

if __name__ == "__main__":
    main()
