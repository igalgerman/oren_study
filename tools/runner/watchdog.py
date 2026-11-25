"""Watchdog: keeps the flow from getting stuck. Runs forever in the herdr window `watchdog` (started by tools/orchestrator.cmd).
Every minute it checks, deterministically:
  1. a worker/reviewer/intake window waiting for an answer (status blocked)  -> tells the orchestrator (once per new screen)
  2. a worker/reviewer that stopped without its RESULT:/VERDICT: line for 10 min -> tells the orchestrator
  3. free lanes + ready issues but no runner pass running                       -> starts a runner pass
  4. the orchestrator window is gone                                           -> writes it in the log (the owner sees it in /status)
It never answers questions or presses keys in other windows; it only tells the orchestrator and starts the runner.
Usage: python watchdog.py [--once]
"""
import hashlib, json, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import runner as R   # config, gh(), select(), hc paths

EVERY = int(R.CFG.get("watchdog_seconds", 60))
LOG = R.RUNS / "watchdog.log"
told = {}          # window -> hash of the screen we already reported
idle_since = {}    # window -> first time seen stopped without a marker

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

def screen_tail(name, n=12):
    rc, out = R.hc("read", name, "--lines", "60", timeout=30)
    lines = [l.rstrip() for l in out.splitlines() if l.strip() and not set(l.strip()) <= set("─╌│ ")]
    return "\n".join(lines[-n:])

def check_windows(ts):
    names = {t.get("name") or "" for t in ts}
    if "orchestrator" not in names: log("orchestrator window is not running")
    for t in ts:
        name, status = t.get("name") or "", t.get("status", "")
        if t.get("state") != "live" or not name.startswith(("issue-", "review-", "intake")): continue
        if status == "blocked":
            tail = screen_tail(name)
            h = hashlib.sha1(tail.encode()).hexdigest()
            if told.get(name) != h:
                told[name] = h
                tell(f"WATCHDOG: window {name} is waiting for an answer. Ask the owner ONE short line in your window, then answer it "
                     f"(hc send {name} \"...\" or the menu option he picks). Its screen ends with:\n{tail}")
        elif status in ("done", "idle") and name.startswith(("issue-", "review-")):
            marker = "VERDICT:" if name.startswith("review-") else "RESULT:"
            if R.find_marker(screen_tail(name, 40), marker):
                idle_since.pop(name, None); continue
            first = idle_since.setdefault(name, time.time())
            if time.time() - first > 600 and told.get(name) != "idle":
                told[name] = "idle"
                tell(f"WATCHDOG: {name} stopped 10+ minutes ago without its {marker} line. Read it (hc read {name}) and get it to finish "
                     f"(push, PR, last line {marker} ...), or ask the owner.")
        else:
            idle_since.pop(name, None)
            if told.get(name) == "idle": told.pop(name, None)

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

def main():
    log("watchdog started")
    while True:
        try:
            ts = windows()
            check_windows(ts)
            check_lanes(ts)
        except Exception as e:
            log(f"error: {e!r}")
        if "--once" in sys.argv: return
        time.sleep(EVERY)

if __name__ == "__main__":
    main()
