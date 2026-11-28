"""#790 tools/move_to_data.py on a temp git repo with a fake owner gate and fake question. Run: python3 tools/test_move_to_data.py"""
import os, tempfile
os.environ["OREN_TEST"] = "1"; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
import subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
T = Path(tempfile.mkdtemp(prefix="mtd-test-"))
os.environ["OREN_HOME"] = str(T / "home")
sys.path.insert(0, str(ROOT / "tools")); sys.path.insert(0, str(ROOT / "tools" / "runner"))
import move_to_data as M

fails = []
def ok(name, cond, info=""):
    print(("PASS " if cond else "FAIL ") + name + (f" - {info}" if info and not cond else ""))
    if not cond: fails.append(name)
def git(d, *a): return subprocess.run(["git", "-C", str(d), *a], capture_output=True, text=True).stdout

repo, data = T / "infra", T / "data"
FILES = {"oren2/docs/STATUS.md": "status", "oren2/docs/qa-deep-report.md": "qa", "oren2/docs/shots/1/a.png": "png",
         "shots/9/b.png": "png2", "oren2/docs/reports/retro-1.md": "retro", "oren2/docs/reports/ux-audit-1.md": "audit",
         "oren2/docs/reports/shots-5/c.png": "png3", "oren2/docs/bag-artifacts.md": "stays", "oren2/index.html": "game",
         "oren2/docs/reports/leak.md": "LOG_READ_KEY = abcdef0123456789abcdef", "shots/playlog-1.json": "{}", "shots/diag.key": "k"}
for rel, txt in FILES.items():
    p = repo / rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(txt)
for d in (repo, data):
    d.mkdir(exist_ok=True); git(d, "init", "-q"); git(d, "config", "user.email", "t@t"); git(d, "config", "user.name", "t")
git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", "x")

REAL_GATE = M.GATE
asked, gate = [], {"open": False}
M.ASK = lambda t: asked.append(t); M.GATE = lambda: gate["open"]

items, bad = M.candidates(repo)
paths = {r for _, r in items}
ok("candidates found", {"oren2/docs/STATUS.md", "oren2/docs/shots/1/a.png", "shots/9/b.png", "oren2/docs/reports/shots-5/c.png", "oren2/docs/reports/retro-1.md"} <= paths, paths)
ok("other docs and the game stay", "oren2/docs/bag-artifacts.md" not in paths and "oren2/index.html" not in paths)
ok("owner report is infra", ("infra", "oren2/docs/reports/ux-audit-1.md") in items)
ok("refuses play log, key file, key text", {r for r, _ in bad} == {"shots/playlog-1.json", "shots/diag.key", "oren2/docs/reports/leak.md"}, bad)

M.dry_run(repo)
plan = M.plan_path().read_text()
ok("dry-run writes the plan in the private folder, question has counts and path only", M.plan_path().is_relative_to(T / "home") and len(asked) == 1 and "STATUS" not in asked[0] and "move_to_data_plan.txt" in asked[0], asked)
ok("dry-run changes nothing", git(repo, "status", "--short") == "" and not any(data.glob("oren2")))

M.ROOT = repo
rc = M.apply(repo, data)
ok("apply without an open gate changes nothing", rc == 3 and git(repo, "status", "--short") == "" and "oren2" not in os.listdir(data))

ok("yes_in: only a real yes opens", [M.yes_in(x) for x in ("OPEN: 1. כן, להעביר (מומלץ)", "OPEN: כן", "OPEN: 2. לא", "OPEN: reaction +1", "OPEN: reaction heart | 1. yes", "CLOSED: no owner_q answer", "OPEN: 1. כן | 2. לא", "")] == [True, True, False, False, True, False, False, False])
import types
M.GATE = REAL_GATE
_run = subprocess.run
subprocess.run = lambda *a, **k: types.SimpleNamespace(returncode=0, stdout="OPEN: 2. לא\n") if "gate" in a[0] else _run(*a, **k)
rc = M.apply(repo, data)
ok("gate open with the answer 'no' changes nothing", rc == 3 and git(repo, "status", "--short") == "" and "oren2" not in os.listdir(data))
subprocess.run = _run
M.GATE = lambda: gate["open"]

# the owner keeps a pure UI shot: deletes its line
M.plan_path().write_text("\n".join(l for l in plan.splitlines() if "shots/9/b.png" not in l) + "\n")
gate["open"] = True
rc = M.apply(repo, data)
tracked = set(M.tracked(repo))
ok("apply ok", rc == 0, rc)
ok("files are in DATA", all((data / r).is_file() for k, r in items if k == "data" and r != "shots/9/b.png") and git(data, "log", "--oneline") != "")
ok("data files are gone from the tree (git ls-files)", not any(k == "data" and r in tracked for k, r in items if r != "shots/9/b.png"))
ok("the kept line stays", "shots/9/b.png" in tracked)
ok("infra report moved to docs/reports/", "docs/reports/ux-audit-1.md" in tracked and "oren2/docs/reports/ux-audit-1.md" not in tracked)
ok("refused files untouched", all((repo / r).exists() for r, _ in bad) and not any((data / r).exists() for r, _ in bad))

# the play log folder is never touched
home_log = T / "home" / "playlog"; home_log.mkdir(parents=True, exist_ok=True); (home_log / "d.json").write_text("{}")
M.dry_run(repo); ok("~/.oren/playlog is left alone", (home_log / "d.json").read_text() == "{}")

if fails: print("FAILED: " + ", ".join(fails)); sys.exit(1)
print("ok: move_to_data")
