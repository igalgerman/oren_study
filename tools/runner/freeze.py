"""Freeze (#139): `tools/freeze.cmd` = `runner.py --freeze`. Stops new work, brings every running local run to a safe point,
saves where each issue is, and says "safe to restart". `runner.py --unfreeze` removes the flag (watchdog and runner start work again).
.runs/frozen     flag: runner passes and the watchdog start nothing new while it exists
.runs/freeze.json  issue -> {step, branch, pr, window, remote, state: pushed|open}"""
import json, re, time
from pathlib import Path

WIN = re.compile(r"^(issue-(\d+)(-fix|-resolve\d+)?|review-(\d+)(-2)?)$")

def is_frozen(runs): return (Path(runs) / "frozen").exists()

def unfreeze(runs):
    p = Path(runs) / "frozen"
    if p.exists(): p.unlink()

def running(terminals):
    """{issue: (window, step)} for live worker/fix/resolve/review windows."""
    out = {}
    for t in terminals:
        name = t.get("name") or ""
        m = WIN.match(name)
        if not m or t.get("state") != "live": continue
        n = int(m[2] or m[4])
        step = "review" if m[4] else {"-fix": "fix"}.get(m[3] or "", "resolve" if m[3] else "worker")
        out[n] = (name, step)
    return out

def frozen_marker(screen, n):
    """'pushed' / 'nothing' when a real output line `FROZEN: <n> pushed|nothing` is on screen (not the echoed instruction)."""
    m = re.search(rf"^\s*(?:[●⏺•]\s*)?FROZEN: {n} (pushed|nothing)\s*$", screen or "", re.M)
    return m[1] if m else ""

def instruction(n):
    return (f"FREEZE: the owner is restarting the machine. Stop what you are doing now. If the worktree has changes: commit them as WIP and push to origin lane/{n} "
            f"(never to main). Then print one line `FROZEN: {n} pushed` (or `FROZEN: {n} nothing` if there was nothing to push) and wait. Do nothing else.")

def freeze(runs, windows, send, read, pr, comment, remote, sleep, clock, timeout=600, poll=10):
    runs = Path(runs); runs.mkdir(parents=True, exist_ok=True)
    (runs / "frozen").write_text(time.strftime("%Y-%m-%d %H:%M:%S"), encoding="utf-8")   # first: nothing new starts
    work = running(windows())
    data = {str(n): {"step": step, "branch": f"lane/{n}", "pr": pr(n), "window": w, "remote": remote(n), "state": "open"} for n, (w, step) in work.items()}
    for n, (w, _) in work.items(): send(w, instruction(n))
    start = clock()
    pending = set(work)
    while pending:
        for n in sorted(pending):
            if frozen_marker(read(work[n][0]), n):
                data[str(n)]["state"] = "pushed"; pending.discard(n)
                comment(n, f"Freeze: stopped at a safe point (step {data[str(n)]['step']}); WIP pushed to lane/{n}. Window {work[n][0]} stays open. Resume with run.cmd {n} after the restart.")
        if not pending or clock() - start >= timeout: break
        sleep(poll)
    for n in sorted(pending):
        comment(n, f"Freeze: window {work[n][0]} did not reach a safe point within {timeout // 60} min (step {data[str(n)]['step']}); parked. Its worktree may hold unpushed work.")
    (runs / "freeze.json").write_text(json.dumps(data, indent=1), encoding="utf-8")
    if pending:
        msg = "NOT everything is safe. Still open: " + ", ".join(f"#{n} ({work[n][0]})" for n in sorted(pending)) + ". State saved in .runs/freeze.json."
    else:
        msg = "safe to restart. State saved in .runs/freeze.json."
    return {"open": sorted(pending), "message": msg}
