"""#229: watchdog flags/lock, remote.py reload, tests never touch the live .runs. Run: python3 tools/runner/test_watchdog_guard.py"""
import os, re, subprocess, sys, tempfile, time
from pathlib import Path
os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
HERE = Path(__file__).resolve().parent
sys.argv.append("--dry-run"); sys.path.insert(0, str(HERE))

def wd(*args, runs):
    env = {**os.environ, "RUNNER_RUNS": str(runs)}
    return subprocess.run([sys.executable, str(HERE / "watchdog.py"), *args], capture_output=True, text=True, timeout=30, env=env)

# 3. RUNNER_RUNS moves every runner record (runner.RUNS, stats.LOG) away from tools/runner/.runs
import runner as R, stats
assert R.RUNS == Path(os.environ["RUNNER_RUNS"]), R.RUNS
assert stats.LOG == R.RUNS / "stats.jsonl", stats.LOG
# ... and every test sets it before it imports a runner module
IMPORT = re.compile(r"^\s*(import|from)\s+(runner|watchdog|owner_q|qwin|ai_observer|dashboard|trends|recover|freeze|remote|stats|observer|conflicts)\b", re.M)
for t in sorted(HERE.glob("test_*.py")):
    src = t.read_text(encoding="utf-8")
    m, s = IMPORT.search(src), src.find('os.environ["RUNNER_RUNS"]')
    assert m is None or 0 <= s < m.start(), f"{t.name}: set os.environ['RUNNER_RUNS'] to a temp dir before importing runner modules"

# 1. --help prints usage and exits; an unknown flag exits 2; neither starts the loop
with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    p = wd("--help", runs=d); assert p.returncode == 0 and "usage" in p.stdout.lower(), (p.returncode, p.stdout, p.stderr)
    p = wd("--bogus", runs=d); assert p.returncode == 2 and "usage" in p.stderr.lower(), (p.returncode, p.stderr)
    assert not (d / "watchdog.log").exists() or "watchdog started" not in (d / "watchdog.log").read_text(encoding="utf-8")
    # a second watchdog refuses while a live one holds watchdog.lock (our own pid = alive)
    (d / "watchdog.lock").write_text(f"{os.getpid()}\nwatchdog\n{time.time():.0f}")
    p = wd("--once", runs=d); assert p.returncode == 1 and "already running" in (p.stdout + p.stderr), (p.returncode, p.stdout, p.stderr)
    assert "watchdog started" not in (d / "watchdog.log").read_text(encoding="utf-8") if (d / "watchdog.log").exists() else True

# 2. main() reloads a changed remote.py (and the other runner modules), before runner.py
import importlib, watchdog as W
import remote, owner_q
calls, reloaded = [], []
W.tick = lambda: calls.append("tick"); W.log = calls.append
real_reload = importlib.reload
def fake_reload(mod):
    reloaded.append(mod.__name__)
    if mod is W: return mod
    return real_reload(mod)
importlib.reload = fake_reload
rp = HERE / "remote.py"; st = os.stat(rp); n = [0]
def sleep(_):
    n[0] += 1
    if n[0] == 1: os.utime(rp, (st.st_atime, st.st_mtime + 5))            # "a remote.py fix was merged"
    else: os.utime(rp, (st.st_atime, st.st_mtime)); raise SystemExit
W.time.sleep = sleep
try: W.main()
except SystemExit: pass
finally: os.utime(rp, (st.st_atime, st.st_mtime)); importlib.reload = real_reload
assert "reloaded remote.py" in calls, calls
assert reloaded == ["remote"], reloaded
assert calls.count("tick") == 2, calls
assert hasattr(R.remote, "cloud")
print("ok watchdog guard")
