"""#365: nobody watched the watchdog. (1) A fake gh that HANGS (a real process): one watchdog tick still finishes and the beat moves;
every subprocess call inside the tick carries a timeout. (2) beatcheck.py: a beat older than 5 min -> the orchestrator is alarmed
(and asked to push the owner) and the watchdog is restarted ONCE per stale beat; never recover --open.
Run: python3 tools/runner/test_beat.py"""
import os, tempfile; os.environ["OREN_TEST"] = "1"; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
import json, stat, subprocess, sys, threading, time
from pathlib import Path
sys.argv.append("--dry-run"); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ---------- (1) a hanging gh never holds the tick ----------
bin_dir = Path(tempfile.mkdtemp(prefix="fake-gh-"))
(bin_dir / "gh").write_text("#!/usr/bin/env python3\nimport time\ntime.sleep(30)\n")    # hangs (no grandchild: env execs python)
(bin_dir / "gh").chmod(0o755)
os.environ["PATH"] = str(bin_dir) + os.pathsep + os.environ["PATH"]

real_run = subprocess.run
calls = []
def fake_run(cmd, *a, **k):
    if threading.current_thread().name == "tick": calls.append((list(map(str, cmd)), k.get("timeout")))   # the tick's own calls (not its threads)
    if str(cmd[0]) == "gh": return real_run(cmd, *a, **k)        # the REAL hanging process
    s = " ".join(map(str, cmd))
    out = json.dumps({"terminals": []}) if " ls" in s and "--json" in s else "{}" if " view" in s else "[]" if "--json" in s else ""
    return subprocess.CompletedProcess(cmd, 0, out, "")
real_popen = subprocess.Popen
def NoPopen(cmd, *a, **k):
    if str(cmd[0]) == "gh": return real_popen(cmd, *a, **k)
    raise FileNotFoundError("no processes in tests")
subprocess.run, subprocess.Popen = fake_run, NoPopen

import runner as R, watchdog as W
R.TICK_TIMEOUT_S = 2                                              # small, so the test is quick
W.log = lambda m: None
beat = R.RUNS / "watchdog.beat"; beat.write_text("1")
done = threading.Event()
def go():
    try: W.tick()
    finally: done.set()
t0 = time.time(); threading.Thread(target=go, daemon=True, name="tick").start()
assert done.wait(40), "the tick hung on a gh that never answers"
took = time.time() - t0
hung = [c for c, _ in calls if c[0] == "gh"]
assert int(beat.read_text()) > time.time() - 60, "the beat did not move"
assert any(c[0] == "gh" for c, _ in calls), "the tick made no gh call: the test proves nothing"
assert all(to is not None for _, to in calls), [c for c in calls if c[1] is None]
assert took < 20, f"tick took {took:.0f} s: after one gh timeout the rest of the tick must not wait on gh again"
assert not R.ghcache.tick_cap(), "tick mode leaked out of the tick"

# remote.sh (cloud polls inside the tick) is bounded the same way
import remote
with R.tick_mode(1):
    rc, out = remote.sh(["gh", "api", "x"]); assert rc == 124 and "timed out" in out, (rc, out)

# outside a tick: run() is unchanged (no forced timeout, a timeout still raises for the runner's own retry logic, #284)
calls.clear()
try: R.run(["gh", "x"], timeout=1); raise AssertionError("expected TimeoutExpired outside the tick")
except subprocess.TimeoutExpired: pass
with R.tick_mode(1):
    assert R.tick_timeout(None) == 1 and R.tick_timeout(300) == 120 and R.tick_timeout(30) == 30
    rc, out = R.run(["gh", "y"])
    assert rc and "timed out" in out, (rc, out)
    rc, out = R.run(["gh", "z"])                                  # gh already timed out in this tick: fails at once
    assert rc and "skipped" in out, (rc, out)
    assert R.ghcache.TRIES and R._tries() == 1                    # a rate-limited call is not slept on inside a tick
assert R._tries() == R.ghcache.TRIES
print("tick: ok")

# ---------- (2) beatcheck ----------
import beatcheck as B
now = 10_000
# fresh beat (or no beat file): nothing, state reset
assert B.decide(now - 60, now, {"beat": 5}) == ([], {})
assert B.decide(None, now, {}) == ([], {})
# stale: alarm + restart, once per stale beat value
acts, st = B.decide(now - 301, now, {})
assert acts == ["alarm", "restart"] and st["beat"] == now - 301, (acts, st)
assert B.decide(now - 301, now + 600, st) == ([], st)              # same hung beat: no second restart, no repeat alarm
assert B.decide(now + 500, now + 900, st)[0] == ["alarm", "restart"]  # a new beat that went stale again: a new episode

# wiring with fakes: kill the hung watchdog by address, start ONE new watchdog line, alarm the orchestrator (push the owner)
done = []
def mk(beat_v, send_rc=0):
    return dict(beat=lambda: beat_v, now=lambda: now, state={},
                terminals=lambda: [{"name": "watchdog", "state": "live", "address": "t:9"}, {"name": "inspector", "state": "live", "address": "t:1"}],
                kill=lambda a: done.append(("kill", a)), rm=lambda a: done.append(("rm", a)),
                lock_pid=lambda: 4242, stop_pid=lambda p: done.append(("stop", p)),
                start=lambda: done.append(("start",)) or 0,
                tell=lambda t: done.append(("tell", t)) or send_rc, comment=lambda t: done.append(("comment", t)), log=lambda m: None)
d = mk(now - 400); B.check(d)
assert ("kill", "t:9") in done and ("rm", "t:9") in done and ("stop", 4242) in done, done
assert [x for x in done if x[0] == "start"] == [("start",)], done
assert done.index(("kill", "t:9")) < done.index(("start",))
assert not any(x == ("kill", "t:1") for x in done), "never touches the inspector"
tell = [x[1] for x in done if x[0] == "tell"]
assert len(tell) == 1 and "PushNotification" in tell[0] and "6 min" in tell[0] and "restarted" in tell[0], tell
assert not any(x[0] == "comment" for x in done)
done.clear(); B.check(d)                                            # next run, beat still stale: nothing more
assert done == [], done
done.clear(); B.check(mk(now - 400, send_rc=1))                     # orchestrator unreachable: owner issue comment instead
assert any(x[0] == "comment" for x in done), done
done.clear(); B.check(mk(now - 10))
assert done == [], done
# the Windows task: every 5 min, windowless python, this file; never recover.py
cmd = B.install_cmd("C:/py/pythonw.exe", "C:/m/tools/runner/beatcheck.py", "PC\\me")
assert cmd[:2] == ["schtasks", "/Create"] and "MINUTE" in cmd and cmd[cmd.index("/MO") + 1] == "5" and "beatcheck.py" in cmd[-1]
assert not any("recover" in c for c in cmd)
print("beatcheck: ok")
print("test_beat: all ok")
