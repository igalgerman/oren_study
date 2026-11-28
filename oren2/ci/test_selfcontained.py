# #794: the three game workflows work from a GAME checkout alone (no tools/).
# Copies only the game paths (oren2/ + .github/workflows) to a temp dir and runs the workflow steps' commands up to the first secret.
# Run: python3 oren2/ci/test_selfcontained.py
import os, re, shutil, subprocess, sys, tempfile, pathlib
root = pathlib.Path(__file__).resolve().parents[2]
tmp = pathlib.Path(tempfile.mkdtemp(prefix="game-only-"))
ign = shutil.ignore_patterns("node_modules", ".tmp", "__pycache__")
shutil.copytree(root / "oren2", tmp / "oren2", ignore=ign)
shutil.copytree(root / ".github" / "workflows", tmp / ".github" / "workflows")
assert not (tmp / "tools").exists()

# 1. no game workflow step or game file refers to tools/ (only the INFRA `tools` job of tests.yml may, guarded by hashFiles)
for wf in ("deploy.yml", "preview.yml"):
    t = "\n".join(l for l in (tmp / ".github" / "workflows" / wf).read_text().splitlines() if not l.lstrip().startswith("#"))
    assert not re.search(r"(?<![\w/])tools/(ci|runner|ask|mods)", t), f"{wf} refers to the INFRA tools/ tree"
    assert "tools/ci" not in t
t = (tmp / ".github" / "workflows" / "tests.yml").read_text()
assert "tools/ci" not in t and "oren2/ci/buildcheck.py" in t
for m in re.finditer(r"- name: (.*)\n((?:        .*\n)+)", t):
    if "tools/" in m.group(2).replace("oren2/cf/tools", ""):
        assert "hashFiles('tools/" in m.group(2), f"tests.yml step '{m.group(1)}' needs tools/ without a hashFiles guard"
for f in list((tmp / "oren2" / "ci").iterdir()) + list((tmp / "oren2" / "tests").glob("*")):
    if f.is_file() and f.suffix in (".py", ".js", ".sh") and f.name != "test_selfcontained.py":
        assert "tools/ci" not in f.read_text(errors="ignore"), f"{f.name} still mentions tools/ci"

def run(cmd, cwd=tmp, env=None):
    r = subprocess.run(cmd, shell=True, cwd=cwd, env={**os.environ, **(env or {})}, capture_output=True, text=True)
    assert r.returncode == 0, f"FAILED in game-only tree: {cmd}\n{r.stdout[-800:]}{r.stderr[-800:]}"
    return r.stdout

# 2. tests.yml commands (the ones without browsers): build check, game CI helper tests, shard + budget checks
# (test_selfcontained itself is skipped inside the copy: no recursion)
run("python3 oren2/ci/buildcheck.py")
for t in sorted((tmp / "oren2" / "ci").glob("test_*.py")):
    if t.name != "test_selfcontained.py":
        run(f"python3 oren2/ci/{t.name}")
run("bash tests/shard.test.sh", cwd=tmp / "oren2")
run("bash tests/budget.test.sh", cwd=tmp / "oren2")
# 3. deploy.yml: plan/guard helper and the 'no token' deploy step (stops before the secret is used); preview.yml summary
out = run("python3 oren2/ci/deploy_ci.py plan", env={"EVENT": "workflow_dispatch", "RUN_SHA": "", "MAIN_SHA": "a" * 40, "GREEN_SHA": "a" * 40, "GITHUB_OUTPUT": str(tmp / "out.txt")})
assert "a" * 40 in (tmp / "out.txt").read_text()
run('[ -z "$CLOUDFLARE_API_TOKEN" ] && echo "no token" > deploy.log', cwd=tmp / "oren2", env={"CLOUDFLARE_API_TOKEN": ""})
run("test -f oren2/ci/tour.js && node -e \"require('fs').accessSync('oren2/tests/mute.js')\"")
shutil.rmtree(tmp, ignore_errors=True)
print("ok game workflows run from a game-only copy")
