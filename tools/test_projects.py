"""#956 tests: path -> project, the hard-coded-repo grep, a dummy project in the dashboard. Run: python3 tools/test_projects.py"""
import os, re, sys, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools")); sys.path.insert(0, str(ROOT / "tools" / "runner"))
import projects as P, file as F

# 1. a path under oren2/ -> GAME repo; tools/ -> INFRA; unknown -> INFRA + warning
reg = P.load()
assert P.project_for_path("oren2/talents.js", reg) == ("game", "")
assert P.project_for_path("tools/file.py", reg) == ("infra", "")
n, w = P.project_for_path("somewhere/else.txt", reg, warn=lambda m: None)
assert n == reg["default"] == "infra" and "warning" in w, (n, w)
assert F.resolve(None, ["oren2/index.html"], reg)[0] == "game" and F.resolve(None, [], reg)[0] == "infra"
assert F.resolve(None, ["zzz/x"], reg)[0] == "infra" and F.resolve(None, ["zzz/x"], reg)[1]
assert F.plan("issue", "game", "t", "b", reg=reg)["repo"] == P.repo_for("game", reg)
assert "--label" in F.plan("question", "game", "t", "b", reg=reg)["cmd"]

# 2. CI grep: no hard-coded repo name outside projects.toml (existing ones are the #926 baseline: the list may only shrink)
BASELINE = {   # file -> max count of 'igalgerman/oren_study' (#926/#792 removes these)
    "tools/runner/config.toml": 1, "tools/runner/test_canary.py": 1, "tools/runner/test_ghcache.py": 2, "tools/runner/test_remote.py": 6, "tools/runner/test_runner.py": 1, "tools/runner/remote.py": 99, "tools/runner/nightly.py": 99, "tools/runner/recover.py": 99,
    "tools/runner/stats.py": 99, "tools/runner/interaction_limit.py": 99, "tools/runner/ai_observer.py": 99, "tools/runner/desks.py": 99,
    "tools/runner/ghcache.py": 99, "tools/setup/setup.ps1": 99, "tools/test_garden.py": 99, "tools/test_projects.py": 99, "tools/split/export.py": 1, "tools/split/game_settings.py": 1,
}
EXT = {".py", ".js", ".sh", ".ps1", ".cmd", ".toml", ".yml", ".yaml"}
bad = []
for f in sorted(ROOT.rglob("*")):
    rel = f.relative_to(ROOT).as_posix()
    if not f.is_file() or f.suffix not in EXT or rel.startswith((".git/", "node_modules/")) or "/node_modules/" in rel or rel == "projects.toml": continue
    c = len(re.findall(r"igalgerman/oren_study", f.read_text(encoding="utf-8", errors="ignore")))
    if c and c > BASELINE.get(rel, 0): bad.append(f"{rel}: {c}")
assert not bad, "new hard-coded repo name outside projects.toml:\n" + "\n".join(bad)

# 3. a dummy project in a test registry shows in the dashboard with no code change
d = tempfile.mkdtemp(); tp = Path(d) / "projects.toml"
tp.write_text('default = "infra"\n[project.infra]\nrepo = "x/infra"\nkind = "infra"\npaths = ["tools/"]\n[project.dummy]\nrepo = "x/dummy-app"\nkind = "app"\nprivate = false\npaths = ["dummy/"]\n', encoding="utf-8")
os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(); os.environ["OREN_TEST"] = "1"; sys.argv.append("--dry-run")
import dashboard as D
card = D.projects_card(P.load(tp))
assert "dummy" in card and "x/dummy-app" in card and "<th>project</th>" in card, card
assert P.project_for_path("dummy/a.txt", P.load(tp)) == ("dummy", "")
print("ok")
