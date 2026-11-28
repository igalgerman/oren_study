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
    if mod is W: mod.tick = lambda: calls.append("new"); mod.SRC_HASH = "changed"; return mod
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

# #127 Acceptance 2: log "reloaded watchdog.py" only when watchdog.py's own content changed
import hashlib as _h
def run_loop(touch_name):
    """One loop pass where `touch_name` (a runner file) gets a new mtime; hash of watchdog.py as given. -> log lines"""
    out = []; W2 = real_wd
    W2.log = lambda m: out.append(m)
    W2.tick = lambda: None
    W2.reload_all = lambda log: None
    W2.reload_self = lambda W: (setattr(W, "SRC_HASH", W.SRC_HASH if touch_name != "watchdog.py" else "x"), W)[1]
    base = W2.stamps(); k = [0]
    def stamps():
        k[0] += 1
        if k[0] == 1: return base
        return {**base, touch_name: base.get(touch_name, 0) + 5}
    W2.stamps = stamps
    n = [0]
    def sleep(_):
        n[0] += 1
        if n[0] > 1: raise SystemExit
    W2.time.sleep = sleep
    try: W2.loop(False)
    except SystemExit: pass
    return [l for l in out if l == "reloaded watchdog.py"]
orig = (real_wd.log, real_wd.tick, real_wd.reload_all, real_wd.reload_self, real_wd.stamps, real_wd.SRC_HASH)
assert run_loop("stats.py") == [], "another runner file changed: no 'reloaded watchdog.py'"
assert run_loop("watchdog.py") == ["reloaded watchdog.py"], "watchdog.py changed: exactly one line"
real_wd.log, real_wd.tick, real_wd.reload_all, real_wd.reload_self, real_wd.stamps, real_wd.SRC_HASH = orig
print("ok reloaded-watchdog log only on a real change")
