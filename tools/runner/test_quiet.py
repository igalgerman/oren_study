"""#284: the PC stays quiet - no console windows, one runner pass, gh timeouts never block. Run: python3 tools/runner/test_quiet.py"""
import os, re, subprocess, sys, tempfile, time
from pathlib import Path
os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
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
