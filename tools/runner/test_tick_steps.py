"""#445: one failing tick step never skips the later steps. Each step runs through step(name, fn); its error is
logged once per error text per hour, and the beat file is written every tick. Run: python3 tools/runner/test_tick_steps.py"""
import os, tempfile; os.environ["OREN_TEST"] = "1"; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
import sys
sys.argv.append("--dry-run"); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import watchdog as W, runner as R

# 1. the helper: an exception is logged once per error text per hour, the value or None comes back
logs = []; W.log = logs.append
W._step_err.clear()
def boom(): raise ValueError("bad")
assert W.step("x", lambda a: a + 1, 1) == 2
assert W.step("x", boom, now=1000) is None
assert W.step("x", boom, now=1000 + 60) is None              # same text within the hour: quiet
assert logs == ["step x failed: ValueError('bad')"], logs
W.step("x", boom, now=1000 + 3601)                            # an hour later: logged again
assert len(logs) == 2, logs
W.step("y", boom, now=1000 + 3602)                            # another step, same text: its own line
assert logs[-1] == "step y failed: ValueError('bad')", logs

# 2. a whole tick with fakes: canary_tick raises -> every later step still runs, the beat is written
ran = []
STEPS = ["fresh", "ghcache_tick", "windows", "check_windows", "qwin_tick", "resume_tick", "check_lanes", "check_intake",
         "check_control", "cleanup", "reap_tick", "stuck_tick", "net_due_tick", "conflicts_tick", "observer_tick",
         "ai_observer_tick", "nightly_tick", "parked_tick", "due_tick", "garden_tick", "issues_stuck_tick", "desks_tick",
         "canary_tick", "sync_tick", "alarm_tick", "trends_tick", "ai_tick", "lock_tick", "orch_idle_tick"]
def rec(name):
    def f(*a, **k): ran.append(name); return [] if name == "windows" else None
    return f
for n in STEPS: setattr(W, n, rec(n))
def bad_canary(*a, **k): ran.append("canary_tick"); raise RuntimeError("canary broke")
W.canary_tick = bad_canary
W.OQ.answers_tick = lambda *a, **k: ran.append("answers_tick")
def bad_hc_json(*a, **k): raise OSError("hc gone")               # a failing step whose value later steps need
R.hc_json = bad_hc_json
beat = R.RUNS / "watchdog.beat"
if beat.exists(): beat.unlink()
logs.clear(); W._step_err.clear()
W.tick()
for n in ["canary_tick", "sync_tick", "alarm_tick", "trends_tick", "ai_tick", "lock_tick", "orch_idle_tick", "check_control", "cleanup"]:
    assert n in ran, (n, ran)
assert beat.exists(), "beat not written"
assert logs.count("step canary_tick failed: RuntimeError('canary broke')") == 1, logs
assert any(m.startswith("step all_windows failed") for m in logs), logs

# 3. the next tick (same errors) logs nothing new; the beat is written again
beat.unlink(); ran.clear(); n_logs = len(logs)
W.tick()
assert beat.exists() and "orch_idle_tick" in ran and len(logs) == n_logs, logs[n_logs:]
print("test_tick_steps: ok")
