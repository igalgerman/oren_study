# Tests for prune_branches (#847) with a fake gh: python3 tools/runner/test_prune_branches.py
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
os.environ["OREN_TEST"] = "1"
import json
from pathlib import Path
import prune_branches as P, remote

def pr(ref, state, body="", fork=False):
    return {"head": {"ref": ref, "repo": {"full_name": "someone/else" if fork else P.REPO}}, "state": state, "body": body}

BRANCHES = ["main", "lane/1", "lane/2", "lane/3", "lane/4", "lane/5", "claude/github-issue-9-x", "claude/abc", "feature/x", "lane/6"]
PRS = [pr("lane/1", "closed"),                       # merged -> delete
       pr("lane/2", "closed"), pr("lane/2", "open"), # a later open PR -> keep
       pr("lane/3", "closed"),                       # issue 3 has a live run -> keep
       pr("claude/github-issue-9-x", "closed", "Fixes #9"),   # delete
       pr("claude/abc", "closed", "Fixes #5"),       # issue 5 is live -> keep
       pr("lane/4", "closed", fork=True),            # only a fork's PR -> not ours, no PR on ours -> keep
       pr("feature/x", "closed"), pr("main", "closed")]       # other prefix / main -> never
deleted = []
def fake(cmd):
    cmd = list(map(str, cmd))
    if cmd[:3] == ["gh", "api", "--paginate"]:
        if "/branches" in cmd[3]: return 0, json.dumps([{"name": b} for b in BRANCHES[:5]]) + "\n" + json.dumps([{"name": b} for b in BRANCHES[5:]])   # two pages
        return 0, json.dumps(PRS)
    if cmd[:3] == ["gh", "issue", "list"]: return 0, json.dumps([{"number": 3}, {"number": 5}])
    if cmd[:4] == ["gh", "api", "-X", "DELETE"]:
        b = cmd[4].split("/heads/")[1]
        if b == "lane/gone": return 1, "gh: Reference does not exist (HTTP 422)"
        deleted.append(b); return 0, ""
    raise AssertionError(cmd)

got = P.candidates(fake)
assert [b for b, _ in got] == ["claude/github-issue-9-x", "lane/1"], got
print("ok candidates: merged/closed only, no open PR, no live run, never main")

# dry-run deletes nothing; apply deletes and logs each
assert P.main(["--dry-run"], fake) == 0 and deleted == []
assert P.main(["--apply"], fake) == 0 and sorted(deleted) == ["claude/github-issue-9-x", "lane/1"], deleted
log = P.LOG.read_text(encoding="utf-8").splitlines()
assert len(log) == 2 and all("deleted" in l for l in log), log
print("ok dry-run / apply / log")

# a failed delete is logged and reported, the rest still go
deleted.clear()
assert P.apply(fake, [("lane/gone", "x"), ("lane/1", "x")]) == ["lane/1"] and "FAILED" in P.LOG.read_text(encoding="utf-8")
# GitHub unreadable -> error, nothing deleted
try: P.candidates(lambda c: (1, "boom")); raise SystemExit("should raise")
except RuntimeError: pass
assert P.main(["--x"], fake) == 2
print("ok failures")

# audit: with the branch gone (404 after merge) the runner paths give no error and no BLOCKED
import runner as R
calls = []
def gone(cmd, **kw):
    cmd = list(map(str, cmd)); calls.append(cmd)
    if cmd[:2] == ["gh", "issue"] and "list" in cmd: return 0, json.dumps([{"number": 7, "title": "t", "createdAt": "2026-11-28T00:00:00Z", "comments": []}])
    if cmd[:2] == ["gh", "pr"]: return 0, "[]"
    if cmd[:2] == ["gh", "api"]: return 1, "gh: Not Found (HTTP 404)"
    raise AssertionError(cmd)
rows = remote.cloud(run=gone)                           # no PR, branch 404 -> empty commit date, no exception
assert len(rows) == 1 and rows[0]["n"] == 7, rows
import subprocess
bare = tempfile.mkdtemp(prefix="bare-"); subprocess.run(["git", "init", "-q", "--bare", bare], check=True)
rc, out = R.run(["git", "ls-remote", "--heads", bare, "lane/7"])
assert rc == 0 and out.strip() == ""                    # a deleted branch reads rc 0 + empty -> 'not pushed', not an error
print("ok audit: branch gone after merge")
print("ALL prune_branches tests passed")
