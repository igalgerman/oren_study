"""#284: the PC stays quiet - no console windows, one runner pass, gh timeouts never block. Run: python3 tools/runner/test_quiet.py"""
import os, re, subprocess, sys, tempfile, time
from pathlib import Path
os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
HERE = Path(__file__).resolve().parent
sys.argv.append("--dry-run"); sys.path.insert(0, str(HERE))
import runner as R, remote, watchdog as W, ai_observer as A, nightly as N

# 1. one helper: CREATE_NO_WINDOW on Windows, 0 elsewhere
assert R.no_window("nt") == 0x08000000, hex(R.no_window("nt"))
assert R.no_window("posix") == 0
assert R.no_window() == (0x08000000 if os.name == "nt" else 0)

# ... R.run and remote.sh pass it to every child
seen = []
real = subprocess.run
def fake(cmd, **kw):
    seen.append(kw); return subprocess.CompletedProcess(cmd, 0, "", "")
subprocess.run = fake
try:
    R.run(["x"]); remote.sh(["x"])
finally:
    subprocess.run = real
assert len(seen) == 2 and all(kw.get("creationflags") == R.no_window() for kw in seen), seen

# ... and no subprocess call in the PC tools forgets it (source scan)
for f in ("runner.py", "watchdog.py", "qwin.py", "remote.py", "ai_observer.py", "nightly.py", "dashboard.py"):
    src = (HERE / f).read_text(encoding="utf-8")
    for m in re.finditer(r"(subprocess\.(?:run|Popen|call|check_output)|\(popen or subprocess\.Popen\)|\bRUN)\(", src):
        i, depth = m.end(), 1                                                  # the whole call, up to its closing paren
        while depth: depth += {"(": 1, ")": -1}.get(src[i], 0); i += 1
        call = src[m.start():i]
        assert "creationflags" in call, f"{f}: {call[:160]!r} has no creationflags (#284: use no_window())"

# 2. a gh timeout is transient: the issue is retried next pass, never BLOCKED
assert R.is_transient(subprocess.TimeoutExpired(["gh", "api", "graphql"], 1.48))
assert not R.is_transient(R.Blocked("lane.sh failed twice"))
assert not R.is_transient(ValueError("x"))
assert R.is_transient(R.GateUnreadable("cannot read the owner gate of #1")) and R.unreadable_gate("cannot read the owner gate of #1")   # #908: never BLOCKED
assert not R.unreadable_gate("the owner gate of #1 is CLOSED (x)") and not R.unreadable_gate("")
# a cloud-status poll that times out just polls again
t = [0]
seq = iter([subprocess.TimeoutExpired("gh", 60), {"state": "working"}, {"state": "done", "line": "RESULT: DONE"}])
def st():
    v = next(seq)
    if isinstance(v, Exception): raise v
    return v
res = R.wait_remote(st, lambda s: t.__setitem__(0, t[0] + s), lambda: t[0], 3600, 30)
assert res["state"] == "done" and t[0] == 60, (res, t)

# 3. one runner pass at a time, and no restart for the same reason within 5 min
key = (5, 7)
ok, why = W.pass_decision(pass_held=True, key=key, last=None, now=1000)
assert not ok and "running" in why
ok, _ = W.pass_decision(pass_held=False, key=key, last=None, now=1000); assert ok
ok, why = W.pass_decision(pass_held=False, key=key, last={"ts": 900, "key": [5, 7]}, now=1000)
assert not ok and "back off" in why, why
ok, _ = W.pass_decision(pass_held=False, key=key, last={"ts": 1000 - 301, "key": [5, 7]}, now=1000); assert ok   # 5 min later: again
ok, _ = W.pass_decision(pass_held=False, key=(5, 8), last={"ts": 900, "key": [5, 7]}, now=1000); assert ok       # new reason: at once
# the watchdog keeps its last start in .runs/pass_start.json
W.note_pass_start(key, 1234.0)
assert W.last_pass_start() == {"ts": 1234.0, "key": [5, 7]}

# 4. the game suites refuse to run on the PC (oren2/tests/localguard.test.sh: run.sh + lib.js guard)
p = subprocess.run(["bash", "tests/localguard.test.sh"], cwd=str(HERE.parent.parent / "oren2"), capture_output=True, text=True, timeout=120)
assert p.returncode == 0 and "PASS localguard" in p.stdout, (p.stdout, p.stderr)

print("ok")

# 5. quiet.py wrapper (#305): exit code, stdout and stderr pass through; a missing binary -> 127
Q = str(HERE / "quiet.py")
p = subprocess.run([sys.executable, Q, sys.executable, "-c", "print('x'); import sys; sys.stderr.write('e'); sys.exit(3)"],
                   capture_output=True, text=True)
assert p.returncode == 3, p.returncode
assert p.stdout.strip() == "x", p.stdout
assert p.stderr == "e", p.stderr
p = subprocess.run([sys.executable, Q, "no-such-binary-xyz"], capture_output=True)
assert p.returncode == 127
print("quiet ok")

# 6. #279: an empty pass is not spawned and does not notify the orchestrator
ACC = "x\n## Acceptance\n- a\n"
def iss(n, *labels, body=ACC): return {"number": n, "labels": list(labels), "createdAt": f"2026-11-26T10:0{n % 10}:00Z", "body": body, "title": f"t{n}"}
GV = {"lanes": 2, "stop": False, "pct": 10}
nolock = lambda n: False
busy2 = [iss(1, "in-progress", "pack"), iss(2, "in-progress", "pack")]
# all lanes busy -> nothing to start
assert R.pass_choice(busy2 + [iss(3, "ready-for-agent", "pack")], 0, 2, GV, 0, nolock, lambda n: "remote") == []
# a free lane + a ready issue -> it starts in the free lane
got = R.pass_choice([busy2[0], iss(3, "ready-for-agent", "pack")], 0, 2, GV, 0, nolock, lambda n: "remote")
assert [(i["number"], w) for i, w in got] == [(3, "remote")], got
# the same checks as the pass: no Acceptance, issue lock held, governor stop, core slots held -> nothing
assert R.pass_choice([iss(3, "ready-for-agent", "pack", body="no list")], 0, 2, GV, 0, nolock) == []
assert R.pass_choice([iss(3, "ready-for-agent", "pack")], 0, 2, GV, 0, lambda n: n == 3) == []
assert R.pass_choice([iss(3, "ready-for-agent", "pack")], 0, 2, {**GV, "stop": True}, 0, nolock) == []
assert R.pass_choice([iss(3, "ready-for-agent", "core")], 0, 2, GV, R.MAX_CORE, nolock) == []
# governor_now reads governor.json without a new sample; stale -> config remote_lanes
import json as _j
(R.RUNS / "governor.json").write_text(_j.dumps({"at": time.time(), "lanes": 5, "stop": False, "pct": 40}))
assert R.governor_now()["lanes"] == 5 and not R.governor_now()["stop"]
(R.RUNS / "governor.json").write_text(_j.dumps({"at": time.time() - 3600, "lanes": 5, "stop": True}))
assert R.governor_now() == {"lanes": R.REMOTE_LANES, "stop": False, "pct": None, "week_pct": None, "limit_hit": False, "shift": 0}
(R.RUNS / "governor.json").write_text(_j.dumps({"at": time.time(), "lanes": 2, "stop": False, "pct": 10}))
# the watchdog: no free lane -> no `hc run` (no pass, no gh call of a pass); a free lane -> a pass with notify off
calls, issues_now = [], []
saved = (R.gh, R.run, R.hc_json, R.where_of, W.pass_decision)
R.gh = lambda *a, **k: (0, _j.dumps([{**i, "labels": [{"name": l} for l in i["labels"]]} for i in issues_now]))
R.run = lambda cmd, **k: (calls.append(cmd), (0, ""))[1]
R.hc_json = lambda *a, **k: {"address": "orch1"}
R.where_of = lambda n: "remote"
W.pass_decision = lambda *a, **k: (True, "")
try:
    issues_now[:] = busy2 + [iss(3, "ready-for-agent", "pack")]
    W.check_lanes([]); assert calls == [], calls
    issues_now[:] = [busy2[0], iss(3, "ready-for-agent", "pack")]
    W.check_lanes([]); assert len(calls) == 1, calls
    c = calls[0]
    assert "--no-parent" in c and "--parent" not in c and "--notify=orch1" in c, c
finally:
    R.gh, R.run, R.hc_json, R.where_of, W.pass_decision = saved
# a pass started by a run (spawn_out with no args) is notify-off too and passes its parent on as --notify
calls.clear(); saved = (R.run, R.hc_json); R.run = lambda cmd, **k: (calls.append(cmd), (0, ""))[1]; R.hc_json = lambda *a, **k: {"parent": "orch2"}
R.TERM = "run-9"
try:
    R.spawn_out([]); c = calls[0]
    assert "--no-parent" in c and "--parent" not in c and "--notify=orch2" in c, c
    calls.clear(); R.spawn_out(["7"]); assert "--parent" in calls[0] and calls[0][calls[0].index("--parent") + 1] == "orch2", calls   # issue runs: as today
finally:
    R.run, R.hc_json = saved; R.TERM = ""
# the pass itself tells its notify target only when it started or blocked something
sent = []
send = lambda to, text: sent.append((to, text))
R.notify_pass(0, 0, "pass: started=0 stuck=0", "orch1", send); assert sent == []
R.notify_pass(1, 0, "pass: started=1 stuck=0 #3:started", "orch1", send); assert sent == [("orch1", "pass: started=1 stuck=0 #3:started")]
R.notify_pass(0, 2, "pass: started=0 stuck=2", "orch1", send); assert len(sent) == 2
R.notify_pass(1, 0, "x", "", send); assert len(sent) == 2      # no target (started by hand): herdr's own exit note as before
# a child run of a notify-off pass still reports to the orchestrator
R.NOTIFY = "orch1"; saved = R.hc_json; R.hc_json = lambda *a, **k: {}
try: assert R.my_parent() == "orch1"
finally: R.NOTIFY = ""; R.hc_json = saved
print("empty pass ok")
