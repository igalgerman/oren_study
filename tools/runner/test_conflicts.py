# Tests for conflicts (#262: a green/approved PR that conflicts with main gets a resolve run by itself): python3 tools/runner/test_conflicts.py
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
import re, trust   # #800: old fixtures have no author: default them to the owner (explicit authors still count; test_trust.py covers the real rules)
_login = trust.login
trust.login = lambda c: _login(c) or (("oren-study-bot" if re.match(r"\s*(OWNER ANSWER|ANSWERED)", c.get("body") or "") or "owner-answer:" in (c.get("body") or "") else "igalgerman") if isinstance(c, dict) else "")
import json
from pathlib import Path
import conflicts as C

def pr(num, branch, mergeable="CONFLICTING", auto=False, head="a1", body="", comments=()):
    return {"number": num, "headRefName": branch, "mergeable": mergeable, "mergeStateStatus": "DIRTY" if mergeable == "CONFLICTING" else "CLEAN",
            "autoMergeRequest": {"mergeMethod": "SQUASH"} if auto else None, "headRefOid": head, "body": body,
            "comments": [{"body": c} for c in comments]}

# which issue a PR belongs to: lane/<n>, or the body's Fixes/Closes #n (cloud claude/* heads, #246)
assert C.issue_of(pr(1, "lane/221")) == 221
assert C.issue_of(pr(1, "claude/github-issue-238-x", body="Summary\n\nFixes #238\n")) == 238
assert C.issue_of(pr(1, "claude/x", body="no link")) is None

# dirty = GitHub says CONFLICTING (or merge state DIRTY); UNKNOWN is not dirty
assert C.is_dirty(pr(1, "lane/1")) and not C.is_dirty(pr(1, "lane/1", "MERGEABLE")) and not C.is_dirty(pr(1, "lane/1", "UNKNOWN"))
assert C.is_dirty({"mergeable": "UNKNOWN", "mergeStateStatus": "DIRTY"})

# eligible = auto-merge set, or a review PASS (stats of the local run, or a cloud reviewer's PR comment)
assert C.eligible(pr(1, "lane/5", auto=True), set())
assert C.eligible(pr(1, "lane/5"), {5})
assert C.eligible(pr(1, "lane/5", comments=["looks good\n\nVERDICT: PASS"]), set())
assert C.eligible(pr(1, "lane/5", comments=["VERDICT: PASS-NOTES a; b"]), set())
assert not C.eligible(pr(1, "lane/5", comments=["VERDICT: FIX tests"]), set())
assert not C.eligible(pr(1, "lane/5", comments=["VERDICT: PASS", "VERDICT: FIX again"]), set())   # the last verdict counts
assert not C.eligible(pr(1, "lane/5"), set())
print("ok helpers")

# 1. dirty + auto-merge -> a resolve run starts (round 1), lane/* AND claude/* heads
st = {}
acts = C.decide([pr(10, "lane/221", auto=True), pr(11, "claude/abc", auto=True, body="Fixes #238")], busy=set(), passed=set(), state=st)
assert [(a["do"], a["pr"], a["n"], a["branch"], a["round"]) for a in acts] == [("start", 10, 221, "lane/221", 1), ("start", 11, 238, "claude/abc", 1)], acts
assert st["10"]["rounds"] == 1 and st["10"]["head"] == "a1"
print("ok dirty+auto -> resolve")

# 2. dirty without PASS or auto-merge -> nothing
st = {}
assert C.decide([pr(10, "lane/221")], set(), set(), st) == [] and st == {}
print("ok dirty without PASS/auto -> nothing")

# 3. clean -> nothing (and a resolved PR's record is dropped)
st = {"10": {"n": 221, "rounds": 1, "head": "a1"}}
assert C.decide([pr(10, "lane/221", "MERGEABLE", auto=True)], set(), set(), st) == [] and st == {}
st = {"10": {"n": 221, "rounds": 1, "head": "a1"}}
assert C.decide([pr(10, "lane/221", "UNKNOWN", auto=True)], set(), set(), st) == [] and "10" in st   # GitHub still computing: keep the record
print("ok clean -> nothing")

# 4. one resolve run per PR at a time: its resolve window, or the issue's own run (it resolves inside its flow), is live -> wait
st = {}
assert C.decide([pr(10, "lane/221", auto=True)], busy={221}, passed=set(), state=st) == [] and st == {}
print("ok one at a time")

# 5. round 1 ended, still dirty, head unchanged -> round 2; round 2 failed too -> orchestrator, once
st = {}
C.decide([pr(10, "lane/221", auto=True)], set(), set(), st)
a2 = C.decide([pr(10, "lane/221", auto=True)], set(), set(), st)
assert [(a["do"], a["round"]) for a in a2] == [("start", 2)], a2
a3 = C.decide([pr(10, "lane/221", auto=True)], set(), set(), st)
assert [(a["do"], a["pr"], a["n"]) for a in a3] == [("escalate", 10, 221)], a3
assert C.decide([pr(10, "lane/221", auto=True)], set(), set(), st) == []           # told once, not every tick
print("ok second failure -> orchestrator")

# 6. the resolve pushed (head moved) but main moved again -> it worked; count starts over
st = {"10": {"n": 221, "rounds": 2, "head": "a1"}}
a = C.decide([pr(10, "lane/221", auto=True, head="b2")], set(), set(), st)
assert [(x["do"], x["round"]) for x in a] == [("start", 1)] and st["10"]["head"] == "b2", a
# a PR without an issue link cannot get a worktree: skipped
assert C.decide([pr(12, "claude/x", auto=True)], set(), set(), {}) == []
print("ok head moved -> new count")

# busy issues from the live windows: run-<n>, resolve-<n>, issue-<n>-resolve<k>
ts = [{"name": "run-221", "state": "live"}, {"name": "resolve-238", "state": "live"}, {"name": "issue-240-resolve2", "state": "live"},
      {"name": "resolve-9", "state": "finished"}, {"name": "issue-7", "state": "live"}]
assert C.busy(ts) == {221, 238, 240}, C.busy(ts)
print("ok busy")

T0 = 1_000_000
# tick with fakes: starts, escalates with needs-orchestrator (never ready-for-human), writes the dashboard count, keeps state on disk
calls = []
def gh(*a):
    calls.append(a)
    if a[:2] == ("pr", "list"): return 0, json.dumps(PRS)
    return 0, ""
started, told = [], []
path = Path(os.environ["RUNNER_RUNS"]) / "conflicts.json"
PRS = [pr(10, "lane/221", auto=True), pr(20, "lane/300")]
C.tick(set(), lambda nums: set(), gh=gh, start=lambda a: started.append((a["n"], a["pr"], a["round"])) or True, say=told.append, path=path, now=T0)
assert started == [(221, 10, 1)], started
C.tick(set(), lambda nums: set(), gh=gh, start=lambda a: started.append((a["n"], a["pr"], a["round"])) or True, say=told.append, path=path, now=T0 + 60)
assert started == [(221, 10, 1)], started                                     # #289: round 1 (cloud) still running
assert json.loads((path.parent / "pr_conflicts.json").read_text()) == [10, 20]       # dashboard: every open PR with conflicts
for k in (1, 2): C.tick(set(), lambda nums: set(), gh=gh, start=lambda a: started.append((a["n"], a["pr"], a["round"])) or True, say=told.append, path=path, now=T0 + k * (C.RESOLVE_WAIT_MIN + 1) * 60)
assert started == [(221, 10, 1), (221, 10, 2)], started
edits = [c for c in calls if c[:2] == ("issue", "edit")]
assert edits and "needs-orchestrator" in edits[0] and "blocked" in edits[0] and "ready-for-human" not in " ".join(edits[0]), edits
assert any(c[:2] == ("issue", "comment") and c[2] == "221" for c in calls)
assert len(told) == 1 and "#10" in told[0] and "#221" in told[0], told
# a start that fails (hc run error) is not counted as a round
path.unlink(); started.clear()
C.tick(set(), lambda nums: set(), gh=gh, start=lambda a: False, say=told.append, path=path)
assert json.loads(path.read_text()) == {}, path.read_text()
# a gh error does nothing and keeps the old count
assert C.tick(set(), lambda nums: set(), gh=lambda *a: (1, "boom"), start=lambda a: True, say=told.append, path=path) == []
print("ok tick")

# dashboard line
import dashboard
assert "PRs with conflicts: 2" in dashboard.conflicts_line([10, 20]) and dashboard.conflicts_line([]) == "PRs with conflicts: 0"
print("ok dashboard")
print("ALL OK")

# #289: the resolve run is a CLOUD session on the PR branch (no local worker): the watchdog launches it without waiting
import watchdog as W
calls = []
ok = W.resolve_start({"n": 221, "pr": 10, "round": 2, "branch": "claude/x-221"}, launch=lambda n, task, cwd, name=None: calls.append((n, task, name)) or {"ok": True})
assert ok and calls[0][0] == 221 and calls[0][2] == "resolve-221", calls
task = calls[0][1]
assert "claude/x-221" in task and "merge" in task and "RESULT: DONE" in task and "#221" in task and "never force-push" in task.lower(), task
assert "C:/" not in task and "worktree" not in task.lower(), task          # a cloud session has no PC paths
assert not W.resolve_start({"n": 5, "pr": 1, "round": 1, "branch": "lane/5"}, launch=lambda *a, **k: {"ok": False, "error": "403"})
assert not hasattr(W, "resolve_cmd")                                       # no local `runner.py --resolve-pr` window any more
assert W.FINISHED_RE.match("resolve-221")          # the short-lived launch terminal is removed like the others
print("ok watchdog cloud resolve")

# #289: a cloud resolve round has no live window to wait on: the round counts as running for RESOLVE_WAIT_MIN (same head)
st = {}
T0 = 1_000_000
assert [a["round"] for a in C.decide([pr(10, "lane/221", auto=True)], set(), set(), st, now=T0)] == [1] and st["10"]["at"] == T0
assert C.decide([pr(10, "lane/221", auto=True)], set(), set(), st, now=T0 + 10 * 60) == []            # the session is still working
a2 = C.decide([pr(10, "lane/221", auto=True)], set(), set(), st, now=T0 + (C.RESOLVE_WAIT_MIN + 1) * 60)
assert [(a["do"], a["round"]) for a in a2] == [("start", 2)], a2                                      # still dirty, same head -> round 2
print("ok cloud round wait")

# two failed rounds inside the runner's own flow also go to the orchestrator, never to the owner (owner rule)
import inspect, runner as R
assert "ready-for-human" not in inspect.getsource(R.process), "process() must not park conflicts for the owner"
assert "--resolve-pr" in inspect.getsource(R.main) and "remote_resolve_prompt" in inspect.getsource(R.resolve_pr)
print("ok never ready-for-human")
