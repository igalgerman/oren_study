"""#300: a change reloads ALL local modules in dependency order; a failed reload is retried; an AttributeError
in a tick is logged once and triggers a full reload. Run: python3 tools/runner/test_fullreload.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # tests never write to the live .runs
import importlib, sys, time
from pathlib import Path
sys.argv.append("--dry-run"); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import watchdog as W

# --- a fake package of modules: top imports mid, mid imports low (one import inside a function) ---
d = Path(tempfile.mkdtemp(prefix="mods-test-")); sys.path.insert(0, str(d))
def write(name, src, bump=0):
    p = d / f"{name}.py"; p.write_text(src, encoding="utf-8")
    t = time.time() + bump; os.utime(p, (t, t))
write("zz_low", "def a(): return 1\n")
write("zz_mid", "import zz_low as L\ndef b():\n    return L.a()\n")
write("zz_top", "import zz_mid\ndef c():\n    import zz_low\n    return zz_mid.b() + zz_low.a()\n")
write("zz_keep", "import zz_low\nGUARD = []\n")
import zz_top, zz_keep
zz_keep.GUARD.append("busy")

names = W.local_modules(d)
assert set(names) == {"zz_low", "zz_mid", "zz_top", "zz_keep"}, names
assert W.dep_order(names, d).index("zz_low") < W.dep_order(names, d).index("zz_mid") < W.dep_order(names, d).index("zz_top")

# "a fix was merged": low gets a new function, mid and top use it
write("zz_low", "def a(): return 1\ndef new(): return 40\n", 5)
write("zz_mid", "import zz_low as L\ndef b():\n    return L.new()\n", 5)
write("zz_top", "import zz_mid\ndef c():\n    import zz_low\n    return zz_mid.b() + zz_low.new() + 2\n", 5)
logs = []
done = W.reload_all(logs.append, d, keep=("zz_keep",))
assert zz_top.c() == 82, zz_top.c()
assert zz_keep.GUARD == ["busy"]                                   # kept modules (in-memory guards) are not reloaded
assert done.index("zz_low") < done.index("zz_mid") < done.index("zz_top") and "zz_keep" not in done, done
assert any("zz_low" in m for m in logs), logs

# a half-written file: the reload fails -> stamps unchanged, so the next tick tries again
st = W.stamps(d)
write("zz_low", "def a(:\n", 9)
try: W.reload_all(logs.append, d, keep=("zz_keep",)); raise AssertionError("no error")
except SyntaxError: pass
assert W.stamps(d) != st                                           # the loop keeps the old stamps and retries
write("zz_low", "def a(): return 1\ndef new(): return 41\n", 10)
W.reload_all(logs.append, d, keep=("zz_keep",))
assert zz_top.c() == 84, zz_top.c()   # 41 + 41 + 2: the fixed file is loaded

# --- the loop: a changed module reloads everything; an AttributeError is logged once and forces a full reload ---
calls, reloads = [], []
W.log = lambda m: calls.append(m)
def fake_reload_all(log, here=None, keep=None):
    reloads.append(1); return ["x"]
W.reload_all = fake_reload_all
W.reload_self = lambda w: w
n = [0]
def tick():
    n[0] += 1
    if n[0] in (1, 2): raise AttributeError("module 'remote' has no attribute 'cloud'")
    calls.append("ok")
W.tick = tick
def sleep(_):
    if n[0] >= 4: raise SystemExit
W.time.sleep = sleep
try: W.loop(False)
except SystemExit: pass
errs = [m for m in calls if "no attribute 'cloud'" in m]
assert len(errs) == 1, calls                                       # logged once, not every minute
assert len(reloads) >= 1, reloads                                  # and it triggered a full reload
assert calls.count("ok") == 2, calls
print("ok full reload (#300)")
