"""#364: a run in flight picks up merged fixes (fresh import of the status helpers when the file changed on disk), and a
watchdog safety net resumes a quiet PR (20+ min, no new commit, no VERDICT, no review running) at review.
Run: python3 tools/runner/test_inflight.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # tests never write to the live .runs
os.environ["OREN_TEST"] = "1"
import json, sys, time, types
from pathlib import Path
sys.argv.append("--dry-run"); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import runner as r
import watchdog as W

d = Path(tempfile.mkdtemp(prefix="mods-test-")); sys.path.insert(0, str(d))
def write(name, src, bump=0):
    p = d / f"{name}.py"; p.write_text(src, encoding="utf-8")
    t = time.time() + bump; os.utime(p, (t, t)); return p

# ---- fresh(): unchanged file -> same module; changed -> reloaded; half-written -> old code kept, retried next poll ----
write("zz_status", "def status():\n    return {'state': 'working'}\n")
import zz_status
logs = []
assert r.fresh(zz_status, logs.append) is zz_status and r.fresh(zz_status).status() == {"state": "working"}
write("zz_status", "def status(:\n", 5)
assert r.fresh(zz_status, logs.append).status() == {"state": "working"}          # broken file: keep the old helper, no crash
write("zz_status", "def status():\n    return {'state': 'done', 'line': 'RESULT: DONE (new helper)'}\n", 10)
assert r.fresh(zz_status, logs.append).status()["state"] == "done"               # fixed file: the next poll loads it
assert any("zz_status" in m for m in logs), logs
print("ok fresh reload")

# ---- the wait loop: a fix merged mid-wait -> the very next poll uses the new helper ----
write("zz_wait", "def status():\n    return {'state': 'working'}\n")
import zz_wait
polls = [0]
def sleep(_):
    polls[0] += 1
    if polls[0] == 2: write("zz_wait", "def status():\n    return {'state': 'done', 'line': 'RESULT: DONE by new code'}\n", 20)
    if polls[0] > 5: raise AssertionError("never picked up the new helper")
st = r.wait_remote(lambda: r.fresh(zz_wait).status(), sleep, time.time, 3600, 1)
assert st["line"] == "RESULT: DONE by new code" and polls[0] == 2, (st, polls)
print("ok code change mid-wait -> new helper used")

# ---- __main__ (runner.py started as a script) is loaded as a fresh copy, never re-executed as __main__ ----
p = write("zz_script", "X = 1\nif __name__ == '__main__': raise SystemExit('ran main')\n")
fake_main = types.ModuleType("__main__"); fake_main.__file__ = str(p); fake_main.X = 1
assert r.fresh(fake_main) is fake_main                                              # first look: stamped
write("zz_script", "X = 2\nif __name__ == '__main__': raise SystemExit('ran main')\n", 30)
assert r.fresh(fake_main).X == 2 and r.fresh(fake_main).X == 2                     # the copy is kept for the next polls
print("ok fresh copy of a script")

# ---- the runner's own wait loops go through fresh() (status, review status, issue_over) ----
src = (Path(r.__file__)).read_text(encoding="utf-8")
body = src[src.index("def process_locked"):src.index("def close_windows")]
assert "lambda: remote.status(" not in body and "lambda: remote.review_status(" not in body, "status helpers must be called through fresh()"
assert "fresh_remote().status(" in body and "fresh_remote().review_status(" in body and ".issue_over(n, started)" in body
print("ok wait loops use fresh helpers")

# ---- pure: phase of a run from the stats events ----
E = lambda n, ev, ts: {"issue": n, "event": ev, "ts": ts}
ev = [E(7, "start", 1), E(7, "worker_done", 2), E(8, "start", 3), E(7, "review_fix", 4), E(9, "start", 1), E(9, "worker_done", 5)]
assert r.run_phase(ev, 7) == "review_fix" and r.run_phase(ev, 8) == "start" and r.run_phase(ev, 9) == "worker_done" and r.run_phase(ev, 1) == ""
print("ok run_phase")

# ---- pure: is a quiet PR due for the safety net? ----
NOW = 1_800_000_000
iso = lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))
def PJ(created_min=30, commit_min=25, comments=(), state="OPEN", mergeable="MERGEABLE", draft=False):
    return {"number": 354, "state": state, "isDraft": draft, "mergeable": mergeable, "headRefOid": "abc", "createdAt": iso(NOW - created_min * 60),
            "commits": [{"committedDate": iso(NOW - commit_min * 60)}], "comments": list(comments)}
assert r.net_due(PJ(), "start", NOW)                                                # the 7 stuck PRs: quiet, no VERDICT, worker phase
assert r.net_due(PJ(), "review_fix", NOW)                                           # fix worker pushed, forgot RESULT
assert not r.net_due(PJ(created_min=15), "start", NOW)                              # PR younger than 20 min
assert not r.net_due(PJ(commit_min=5), "start", NOW)                                # a new commit: still working
assert not r.net_due(PJ(), "worker_done", NOW) and not r.net_due(PJ(), "fix_done", NOW)   # a review is running
assert not r.net_due(PJ(comments=[{"body": "VERDICT: FIX x", "createdAt": iso(NOW - 60)}]), "start", NOW)   # the head has a VERDICT
assert not r.net_due(PJ(state="MERGED"), "start", NOW) and not r.net_due(PJ(draft=True), "start", NOW)
assert not r.net_due(PJ(mergeable="CONFLICTING"), "start", NOW)                     # conflicts: #262 resolves those
print("ok net_due")

# ---- watchdog net_tick with fakes: PR quiet 20 min -> the run is ended and the issue resumes at review ----
ts = [{"name": "run-354", "state": "live", "address": "w:1"}, {"name": "run-355", "state": "live", "address": "w:2"},
      {"name": "issue-354", "state": "live", "address": "w:3"}]
events = [E(354, "start", 1), E(355, "start", 1), E(355, "worker_done", 2)]
calls = {"kill": [], "gh": [], "said": []}
def gh(*a, **kw):
    calls["gh"].append(a)
    if a[:2] == ("pr", "view"): return 0, json.dumps(PJ())
    return 0, ""
def hc(*a, **kw): calls["kill"].append(a); return 0, ""
done = W.net_tick(ts, now=NOW, gh=gh, hc=hc, say=calls["said"].append, events=events, find_pr=lambda n: 354 if n == 354 else 400)
assert done == [354], done                                                          # 355 is in review: left alone
assert calls["kill"] == [("kill", "w:1")], calls["kill"]
assert (r.RUNS / "354" / "resume").read_text() == "review"
assert any(a[:3] == ("issue", "edit", "354") and "in-progress" in a and "ready-for-agent" in a for a in calls["gh"]), calls["gh"]
assert any(a[:3] == ("issue", "comment", "354") for a in calls["gh"]) and calls["said"]
calls["kill"].clear()
assert W.net_tick(ts, now=NOW + 60, gh=gh, hc=hc, say=calls["said"].append, events=events, find_pr=lambda n: 354) == []
assert calls["kill"] == []                                                          # same head: never twice
print("ok net_tick: quiet PR -> review starts")
