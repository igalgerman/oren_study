"""#981: tools/file.py reads/writes gh as UTF-8 whatever the console code page; an unreadable duplicate check files nothing."""
import os, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(); os.environ["OREN_TEST"] = "1"
import file as F

HEB = "שלום עולם – בדיקה"
OUT = '[{"number": 7, "title": "%s", "state": "OPEN"}]' % HEB

# 1. every gh call is UTF-8, even under cp1255: a fake gh run through the real gh() path must see encoding utf-8
seen = {}
real = subprocess.run
def fake(cmd, **kw):
    seen.update(kw); seen["cmd"] = cmd
    return subprocess.CompletedProcess(cmd, 0, OUT, "")
subprocess.run = fake
try:
    r = F.gh(["issue", "list"], capture_output=True, text=True)
finally:
    subprocess.run = real
assert seen.get("encoding") == "utf-8", seen
# a bytes-level reader: cp1255 decoding of a Hebrew UTF-8 stream differs from UTF-8 decoding (the bug)
raw = OUT.encode("utf-8")
try: bad = raw.decode("cp1255") != OUT
except UnicodeDecodeError: bad = True
assert bad

# 2. duplicates finds a Hebrew title
mk = lambda rc, out: (lambda args, **kw: subprocess.CompletedProcess(args, rc, out, "boom"))
assert [i["number"] for i in F.duplicates("x/y", HEB, run=mk(0, OUT))] == [7]

# 3. unreadable check -> error, not "no duplicates"
for rc, out in [(1, ""), (0, ""), (0, "not json"), (0, None)]:
    try: F.duplicates("x/y", HEB, run=mk(rc, out))
    except F.DuplicateCheckError as e: assert str(e)
    else: raise AssertionError(f"duplicate check passed silently for rc={rc} out={out!r}")

# 4. main exits non-zero, says why and files nothing
calls = []
F.gh = lambda args, **kw: (calls.append(args), subprocess.CompletedProcess(args, 1, "", "gh: not logged in"))[1]
import io, contextlib
err = io.StringIO()
with contextlib.redirect_stderr(err):
    rc = F.main(["issue", "--title", HEB, "--body", HEB])
assert rc not in (0, 2) and "duplicate check" in err.getvalue() and "not logged in" in err.getvalue(), (rc, err.getvalue())
assert not any(c[:2] == ["issue", "create"] for c in calls), calls

# 5. Hebrew --body reaches gh unchanged
calls.clear()
F.gh = lambda args, **kw: (calls.append(args), subprocess.CompletedProcess(args, 0, "[]", ""))[1]
F.main(["issue", "--title", HEB, "--body", HEB])
create = [c for c in calls if c[:2] == ["issue", "create"]][0]
assert create[create.index("--body") + 1] == HEB
print("ok")
