"""#289: ONE poller serves all cloud lanes (no run-<n> process per cloud lane).

The runner pass queues each cloud pick as .runs/lanes/<n>.json and makes sure ONE herdr window `lanes`
(`runner.py --lanes`) is live. That one process runs every cloud lane's flow (worker -> review -> fix -> merge) in a
thread, and all of them poll GitHub on the same minute grid (aligned_sleep), so one ghcache read answers all lanes at once.
It writes .runs/lanes.json {pid, issues, at} and exits after IDLE_S with nothing to do (the next pass starts it again).

The watchdog, observer and recover still see one `run-<n>` per lane: virtual(runs) lists them (no address) while the
poller is alive (or the issue is still queued). The #364 safety net cannot kill a virtual run: it asks with stop(runs, n);
the lane's wait loop sees stopped() and ends the run."""
import json, os, threading, time
from pathlib import Path

IDLE_S = 300
STEP_S = 10

def _q(runs): return Path(runs) / "lanes"
def _state(runs): return Path(runs) / "lanes.json"

def queue(runs, issue):
    """Hand one cloud pick to the poller."""
    d = _q(runs); d.mkdir(parents=True, exist_ok=True)
    (d / f"{issue['number']}.json").write_text(json.dumps(issue, ensure_ascii=False), encoding="utf-8")

def queued(runs):
    """-> [issue dict] waiting to be picked up, oldest number first."""
    out = []
    for p in sorted(_q(runs).glob("*.json"), key=lambda p: int(p.stem) if p.stem.isdigit() else 0):
        try: out.append(json.loads(p.read_text(encoding="utf-8")))
        except (OSError, ValueError): pass
    return out

def take(runs, n):
    (_q(runs) / f"{n}.json").unlink(missing_ok=True)

def write_state(runs, pid, nums, now=None):
    try: _state(runs).write_text(json.dumps({"pid": pid, "issues": sorted(nums), "at": int(now or time.time())}), encoding="utf-8")
    except OSError: pass

def clear_state(runs, pid):
    try:
        if json.loads(_state(runs).read_text(encoding="utf-8")).get("pid") == pid: _state(runs).unlink()
    except (OSError, ValueError): pass

def held(runs, alive):
    """Issues the poller runs now (its pid alive) plus the queued ones."""
    out = {int(i["number"]) for i in queued(runs) if str(i.get("number", "")).isdigit()}
    try: st = json.loads(_state(runs).read_text(encoding="utf-8"))
    except (OSError, ValueError): st = {}
    if st.get("pid") and alive(int(st["pid"])): out |= {int(n) for n in st.get("issues") or []}
    return out

def virtual(runs, alive, names=()):
    """Terminal-like rows `run-<n>` for the poller's lanes (no address: nothing to kill or read); names already listed are skipped."""
    have = set(names)
    return [{"name": f"run-{n}", "state": "live", "status": "working", "virtual": True} for n in sorted(held(runs, alive)) if f"run-{n}" not in have]

def with_virtual(terms, runs, alive):
    return list(terms) + virtual(runs, alive, [t.get("name") for t in terms if t.get("state") == "live"])

def stop(runs, n):
    d = Path(runs) / str(n); d.mkdir(parents=True, exist_ok=True)
    (d / "lanes_stop").write_text(str(int(time.time())), encoding="utf-8")

def stopped(runs, n):
    return (Path(runs) / str(n) / "lanes_stop").exists()

def clear_stop(runs, n):
    (Path(runs) / str(n) / "lanes_stop").unlink(missing_ok=True)

def aligned_sleep(s, clock=time.time, sleep=time.sleep):
    """Sleep up to the next multiple of s on the wall clock: every lane thread wakes at the same moment (one shared poll)."""
    sleep(s - clock() % s or s)

def serve(runs, process, done, pid=None, clock=time.time, sleep=time.sleep, idle_s=IDLE_S, step_s=STEP_S, start=None):
    """The poller loop. process(issue) -> result text (runs the whole cloud lane); done(n, result) logs it and starts a pass.
    start(fn) runs fn in the background (a thread; tests run it inline). -> number of lanes served."""
    pid = pid or os.getpid()
    start = start or (lambda fn: threading.Thread(target=fn, daemon=True).start())
    running, served, idle_since = set(), 0, clock()
    lock = threading.Lock()
    def lane(issue):
        n = int(issue["number"])
        try: res = process(issue)
        except Exception as e: res = f"BLOCKED: lanes error {e!r}"
        with lock: running.discard(n)
        write_state(runs, pid, set(running), clock())
        done(n, res)
    while True:
        for issue in queued(runs):
            n = int(issue["number"])
            with lock:
                if n in running: continue           # its earlier run is still ending (a #364 stop): start it after that
                running.add(n)
            take(runs, n)
            clear_stop(runs, n); served += 1
            write_state(runs, pid, set(running), clock())
            start(lambda i=issue: lane(i))
        with lock: busy = bool(running)
        write_state(runs, pid, set(running), clock())
        if busy or queued(runs): idle_since = clock()
        elif clock() - idle_since >= idle_s:
            clear_state(runs, pid)
            if not queued(runs): return served      # a pick that arrived while we stopped keeps us going
            write_state(runs, pid, set(), clock()); idle_since = clock()
        sleep(step_s)
