# Tests for the #800 PreToolUse guard (.claude/hooks/guard.py): python3 tools/runner/test_guard.py
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-"); os.environ["OREN_TEST"] = "1"
import importlib.util, json, subprocess, sys
from pathlib import Path
P = Path(__file__).resolve().parents[2] / ".claude" / "hooks" / "guard.py"
spec = importlib.util.spec_from_file_location("guard", P); G = importlib.util.module_from_spec(spec); spec.loader.exec_module(G)
lane = lambda: "lane/800"
mainb = lambda: "main"
BLOCK = [
    "gh pr merge 5", "gh pr merge 5 --squash --auto", "gh --repo a/b pr merge 5", "gh api -X PUT repos/a/b/pulls/5/merge",
    "gh api repos/a/b/pulls/5/merge -X PUT", "gh api graphql -f query='mutation{mergePullRequest(input:{pullRequestId:\"x\"}){clientMutationId}}'",
    "gh api graphql -f query='mutation{enablePullRequestAutoMerge(input:{}){x}}'", "gh api -X PUT repos/a/b/pulls/5/ccr/auto_merge",
    "curl -X PUT https://api.github.com/repos/a/b/pulls/5/merge",
    "git push origin main", "git push origin master", "git push origin +main", "git push origin HEAD:main", "git push origin HEAD:refs/heads/main",
    "git push origin refs/heads/main", "git push origin lane/1:main", "git push origin :main", "git push --delete origin main", "git push -u origin main",
    "git -C /x push origin main", "git push origin lane/800 main", "GIT_X=1 git push origin main", "cd x && git push origin main",
    "git push --force origin lane/1", "git push -f origin lane/1", "git push --force-with-lease origin lane/1", "git push origin +lane/1",
    "git push --all origin", "git push --mirror", "bash -c 'git push origin main'", "git branch -D main", "git clean -fdx",
    "echo hi; gh pr merge 5", "true | gh pr merge 5",
]
ALLOW = [
    "git push -u origin lane/800", "git push origin lane/800", "git push origin HEAD:lane/800", "git push origin HEAD:refs/heads/lane/800",
    "git push -u origin claude/github-issue-800-bfe6cg", "gh pr create --repo a/b --base main --head lane/800", "gh pr comment 5 --body 'merge later'",
    "gh issue comment 800 --body 'RESULT: DONE'", "gh pr view 5 --json comments", "git merge origin/main", "git checkout main", "git pull origin main",
    "git status", "git log main..HEAD", "git diff main", "gh api repos/a/b/pulls/5/comments", "gh pr create --title 'main fix' --head lane/1",
    "git push origin lane/main-fix",
]
bad = [c for c in BLOCK if not G.check(c, branch=lane)]; assert not bad, ("should block", bad)
bad = [c for c in ALLOW if G.check(c, branch=lane)]; assert not bad, ("should allow", [(c, G.check(c, branch=lane)) for c in bad])
# no refspec / HEAD push: allowed on a lane branch, blocked while on main
assert not G.check("git push", branch=lane) and not G.check("git push origin", branch=lane) and not G.check("git push origin HEAD", branch=lane)
assert G.check("git push", branch=mainb) and G.check("git push origin", branch=mainb) and G.check("git push origin HEAD", branch=mainb)
# the real hook: exit 2 on a blocked command, 0 on an allowed one
def hook(cmd): return subprocess.run([sys.executable, str(P)], input=json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}}), text=True, capture_output=True)
assert hook("gh pr merge 5").returncode == 2 and "BLOCKED" in hook("gh pr merge 5").stderr
assert hook("git status").returncode == 0 and subprocess.run([sys.executable, str(P)], input="not json", text=True).returncode == 0
settings = json.loads((P.parents[1] / "settings.json").read_text(encoding="utf-8"))
m = settings["hooks"]["PreToolUse"][0]; assert m["matcher"] == "Bash|PowerShell" and "guard.py" in m["hooks"][0]["command"]
assert not (P.parent / "block-dangerous-git.sh").exists()
print("ok guard #800")
