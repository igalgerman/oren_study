"""#127: main() loads a changed watchdog.py by itself. Run: python3 tools/runner/test_selfreload.py"""
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
assert calls == ["watchdog started", "old", "reloaded watchdog.py", "new"], calls
print("ok watchdog self-reload")
