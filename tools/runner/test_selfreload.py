"""#127: main() loads a changed watchdog.py by itself. Run: python3 tools/runner/test_selfreload.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
import importlib, os, sys, time
sys.argv.append("--dry-run"); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import watchdog as W
calls = []
W.tick = lambda: calls.append("old")
W.log = lambda m: calls.append(m)
real_reload = importlib.reload
def fake_reload(mod):
    if mod is W: mod.tick = lambda: calls.append("new"); return mod
    return real_reload(mod)
importlib.reload = fake_reload
st = os.stat(W.__file__); n = [0]
def sleep(_):
    n[0] += 1
    if n[0] == 1: os.utime(W.__file__, (st.st_atime, st.st_mtime + 5))   # "a fix was merged"
    else: os.utime(W.__file__, (st.st_atime, st.st_mtime)); raise SystemExit
W.time.sleep = sleep
try: W.main()
except SystemExit: pass
calls = [c for c in calls if not (c.startswith("reloaded ") and c != "reloaded watchdog.py")]   # #300: the other modules are reloaded first
assert calls == ["watchdog started", "old", "reloaded watchdog.py", "new"], calls
print("ok watchdog self-reload")

# #127 (reopened): the running process was __main__ and a cached stale 'watchdog' module made reload_self a no-op.
import types, tempfile, textwrap
d = tempfile.mkdtemp(prefix="wd-test-"); f = os.path.join(d, "watchdog.py")
open(f, "w").write("def tick(): return 'old'\n")
sys.path.insert(0, d)
real_wd = sys.modules.pop("watchdog")                 # the real one is restored below
stale = importlib.import_module("watchdog"); assert stale.tick() == "old"   # something imported it earlier
open(f, "w").write("def tick(): return 'new'\n")
os.utime(f, (time.time() + 10, time.time() + 10))
importlib.invalidate_caches()
main_mod = types.ModuleType("__main__")               # the running loop's W: the __main__ copy
got = real_wd.reload_self(main_mod)
assert got.tick() == "new", "reload_self returned the stale cached watchdog module"
sys.modules["watchdog"] = real_wd; sys.path.remove(d)
print("ok watchdog main-module function change is picked up")
