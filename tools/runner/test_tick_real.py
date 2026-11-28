"""#300 (reopened): one watchdog tick runs EVERY step against the real tools/runner modules; only the process
boundary (subprocess) is faked, so a call with a wrong signature (desks -> remote.start(name=)) or a missing
function (stats.finish_rate) fails here. And: the tick itself reloads modules that are older than their file,
so even a loop() started from old code (it never picks up its own new code) runs fully updated modules.
Run: python3 tools/runner/test_tick_real.py"""
import os, tempfile; os.environ["OREN_TEST"] = "1"; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # tests never write to the live .runs
import json, subprocess, sys
sys.argv.append("--dry-run"); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

calls = []
def fake_run(cmd, *a, **k):
    """GitHub / herdr / git answer 'nothing there'; creating an issue answers with its URL."""
    calls.append(cmd); s = " ".join(map(str, cmd))
    if "issue create" in s: out = "https://github.com/x/y/issues/5\n"
    elif " ls" in s and "--json" in s: out = json.dumps({"terminals": []})
    elif " view" in s: out = "{}"
    elif "--json" in s or " api " in s: out = "[]"
    else: out = ""
    return subprocess.CompletedProcess(cmd, 0, out, "")
class NoPopen:
    def __init__(self, cmd, *a, **k): calls.append(cmd); raise FileNotFoundError("no processes in tests")
subprocess.run, subprocess.Popen = fake_run, NoPopen

import threading
import watchdog as W, desks, stats, remote
logs = []; W.log = logs.append
_tick = W.tick
def tick():                                                # a tick + the threads it started (ai assessment, ...)
    _tick()
    for t in threading.enumerate():
        if t is not threading.main_thread(): t.join(60)
def errors(): return [m for m in logs if "error" in m.lower() or "Error(" in m or "attribute" in m]

# 1. every tick step, real modules: no exception, nothing logged as an error
tick()
assert not errors(), errors()

# 2. the old watchdog's case: stats / remote in memory are OLDER than their files (finish_rate missing,
#    start() without name=). The next tick reloads them before any step runs.
real_start = remote.start
del stats.finish_rate
remote.start = lambda n, task, cwd, run=None, **k: {"ok": False}
for m in (stats, remote): m._loaded_mtime = 0            # "the file changed after this module was loaded"
logs.clear(); tick()
assert hasattr(stats, "finish_rate"), "stale stats.py not reloaded by the tick"
assert remote.start.__code__ is not None and "name" in remote.start.__code__.co_varnames, "stale remote.py not reloaded"
assert any("reloaded" in m and "stats.py" in m for m in logs), logs
assert not errors(), errors()

# 3. a second tick with nothing changed reloads nothing
logs.clear(); tick()
assert not any(m.startswith("reloaded") for m in logs), logs

# 4. the two calls that failed in watchdog.log, through the real modules
assert W.alarms_once() is not None                         # stats.finish_rate (#148)
logs.clear(); desks.run_once(logs.append)                  # remote.start(..., name=) (#306)
assert not errors(), errors()
assert any("desk-inbox" in " ".join(map(str, c)) for c in calls), "desks did not reach remote.start"

# 5. desks keeps its never-two guard across a reload (a desks thread may be running during the reload)
busy = desks._busy
desks._loaded_mtime = 0; tick()
assert desks._busy is busy
print("ok real tick (#300)")
