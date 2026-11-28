# #264: blocked issues with an open PR resume by themselves; ready-for-human only for a real owner QUESTION.
# python tools/runner/test_resume.py
import json, os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
import re, trust   # #800: old fixtures have no author: default them to the owner (explicit authors still count; test_trust.py covers the real rules)
_login = trust.login
trust.login = lambda c: _login(c) or (("oren-study-bot" if re.match(r"\s*(OWNER ANSWER|ANSWERED)", c.get("body") or "") or "owner-answer:" in (c.get("body") or "") else "igalgerman") if isinstance(c, dict) else "")
import sys; sys.argv.append("--dry-run")
import runner as r
import remote

# ---- pure: which step a resumed run starts at ----
assert r.resume_step("CONFLICTING", "VERDICT: PASS") == "resolve"          # dirty PR: resolve first, whatever the verdict
assert r.resume_step("MERGEABLE", "") == "review"                          # no VERDICT for the head
assert r.resume_step("MERGEABLE", "VERDICT: FIX a; b") == "fix"            # red
assert r.resume_step("MERGEABLE", "VERDICT: PASS") == "merge"
assert r.resume_step("UNKNOWN", "VERDICT: PASS-NOTES x") == "merge"
assert r.resume_step("MERGEABLE", "VERDICT: PURPLE blue or green? hold") == ""   # an owner question: never auto-resumed
print("ok resume_step")

# ---- pure: the VERDICT that belongs to the PR head (comments at/after the last commit) ----
cs = [{"body": "VERDICT: FIX old", "createdAt": "2026-11-26T10:00:00Z"},
      {"body": "review\nVERDICT: PASS", "createdAt": "2026-11-26T12:00:00Z"}]
assert r.head_verdict(cs, "2026-11-26T11:00:00Z") == "VERDICT: PASS"
assert r.head_verdict(cs, "2026-11-26T13:00:00Z") == ""                    # new commits after the review: review again
assert r.head_verdict(cs[:1], "2026-11-26T09:00:00Z") == "VERDICT: FIX old"
print("ok head_verdict")

# ---- auto_resume with fakes ----
def I(n, labels): return {"number": n, "labels": list(labels), "createdAt": "1", "body": "## Acceptance\n- x"}
B = ["blocked", "needs-orchestrator", "ready-for-agent", "core"]
def fakes(look):
    log = {"labels": [], "comments": [], "told": []}
    return log, dict(lookup=look, set_labels=lambda n, add=(), remove=(): log["labels"].append((n, tuple(add), tuple(remove))),
                     comment=lambda n, b: log["comments"].append((n, b)), tell=lambda t: log["told"].append(t))

issues = [I(185, B), I(186, B), I(192, B), I(137, ["blocked", "ready-for-human"]), I(5, ["blocked", "needs-orchestrator", "manual"]), I(6, ["ready-for-agent"])]
look = {185: {"pr": 251, "mergeable": "MERGEABLE", "verdict": ""},                 # resume-at-review
        186: {"pr": 253, "mergeable": "MERGEABLE", "verdict": "VERDICT: FIX add test"},   # resume-at-fix
        192: None,                                                                  # no open PR: stays blocked
        137: {"pr": 1, "mergeable": "MERGEABLE", "verdict": ""}, 5: {"pr": 2, "mergeable": "MERGEABLE", "verdict": ""}}
log, kw = fakes(look.get)
got = r.auto_resume(issues, **kw)
assert got == [(185, "review"), (186, "fix")], got
assert r.take_resume(185) == "review" and r.take_resume(185) == "" and r.take_resume(186) == "fix"
assert (185, ("ready-for-agent",), ("blocked", "needs-orchestrator")) in log["labels"], log["labels"]
assert all(n in (185, 186) for n, *_ in log["labels"])                           # owner question (137), manual (5), no PR (192): untouched
assert "blocked" not in issues[0]["labels"] and "needs-orchestrator" not in issues[0]["labels"]   # the same pass can start it
assert any("auto-resume 1/2" in b and "review" in b for n, b in log["comments"] if n == 185), log["comments"]
assert {i["number"] for i in r.select(issues, 5, 3)} == {6, 185, 186}
print("ok auto_resume review/fix")

# cap of 2: the third time it stays blocked + needs-orchestrator, one note to the orchestrator
for k in (2, 3):
    iss = [I(185, B)]
    log, kw = fakes(look.get)
    got = r.auto_resume(iss, **kw)
    if k == 2:
        assert got == [(185, "review")] and any("auto-resume 2/2" in b for _, b in log["comments"]), (got, log)
    else:
        assert got == [] and not log["labels"] and "blocked" in iss[0]["labels"], (got, log)
        assert any("185" in t for t in log["told"]) and any("needs-orchestrator" in b for _, b in log["comments"]), log
log, kw = fakes(look.get)
assert r.auto_resume([I(185, B)], **kw) == [] and not log["comments"] and not log["told"]   # said once, not every pass
print("ok auto_resume cap 2")

# lookup from gh JSON (pure part)
pj = {"number": 251, "mergeable": "CONFLICTING", "headRefOid": "abc",
      "commits": [{"committedDate": "2026-11-26T10:00:00Z"}, {"committedDate": "2026-11-26T11:00:00Z"}],
      "comments": [{"body": "VERDICT: PASS", "createdAt": "2026-11-26T12:00:00Z"}]}
assert r.pr_resume_info(pj) == {"pr": 251, "mergeable": "CONFLICTING", "verdict": "VERDICT: PASS", "sha": "abc", "review": "VERDICT: PASS", "test": ""}
print("ok pr_resume_info")

# #618: the tester's result for the head counts in the resume: TEST: FAIL after a PASS -> fix with the repro, never merge
pj2 = dict(pj, mergeable="MERGEABLE", comments=pj["comments"] + [{"body": "shots\nTEST: FAIL help -> read is silent", "createdAt": "2026-11-26T12:30:00Z"}])
_i = r.pr_resume_info(pj2)
assert _i["test"] == "TEST: FAIL help -> read is silent", _i
st, red = r.resume_of(_i)
assert st == "fix" and red.startswith("VERDICT: FIX") and "help -> read is silent" in red, (st, red)
assert r.resume_of(r.pr_resume_info(dict(pj2, comments=pj2["comments"] + [{"body": "TEST: PASS", "createdAt": "2026-11-26T13:00:00Z"}]))) == ("merge", "VERDICT: PASS")
assert r.resume_of(r.pr_resume_info(dict(pj, mergeable="MERGEABLE"))) == ("merge", "VERDICT: PASS")   # no test yet: merge step, which runs the tester gate
old_fail = dict(pj, mergeable="MERGEABLE", comments=[{"body": "TEST: FAIL old head", "createdAt": "2026-11-26T09:00:00Z"}, *pj["comments"]])
assert r.resume_of(r.pr_resume_info(old_fail))[0] == "merge"      # a FAIL on an older head does not count
print("ok #618 resume_of: TEST: FAIL for the head -> fix")

# ---- ready-for-human only for a real QUESTION ----
hum = [{"number": 137, "labels": [{"name": "blocked"}, {"name": "ready-for-human"}], "comments": [{"body": "Runner: merge conflicts not resolved after 2 rounds."}]},
       {"number": 140, "labels": [{"name": "blocked"}, {"name": "ready-for-human"}], "comments": [{"body": "QUESTION: blue or green?"}]},
       {"number": 141, "labels": [{"name": "blocked"}, {"name": "ready-for-human"}], "comments": [{"body": "Reviewer PURPLE question for the owner (hold, PR #9): x?"}]},
       {"number": 142, "labels": [{"name": "ready-for-human"}], "comments": []}]       # a hand task (not blocked): the owner's own
assert r.human_without_question(hum) == [137]
_saved = (r.gh, r.set_labels)
_lab = []
r.gh = lambda *a, **k: (0, json.dumps(hum)) if a[:2] == ("issue", "list") else (0, "")
r.set_labels = lambda n, add=(), remove=(): _lab.append((n, tuple(add), tuple(remove)))
try: assert r.migrate_human() == [137]
finally: r.gh, r.set_labels = _saved
assert _lab == [(137, ("needs-orchestrator",), ("ready-for-human",))], _lab
print("ok migrate ready-for-human without QUESTION")

# park_issue: a permission menu (no QUESTION on screen) goes to the orchestrator, a QUESTION to the owner
_saved = (r.gh, r.set_labels, r.issue_labels, r.tell_orchestrator)
_lab = []
r.gh = lambda *a, **k: (0, ""); r.issue_labels = lambda n: []; r.tell_orchestrator = lambda t: None
r.set_labels = lambda n, add=(), remove=(): _lab.append((n, tuple(add)))
try:
    r.park_issue(7, "issue-7", "Do you want to allow Bash(rm -rf x)?\n1. Yes\n2. No", 0)
    r.park_issue(8, "issue-8", "QUESTION: blue or green?", 0)
finally: r.gh, r.set_labels, r.issue_labels, r.tell_orchestrator = _saved
assert _lab == [(7, ("blocked", "needs-orchestrator")), (8, ("blocked", "ready-for-human"))], _lab
print("ok park_issue labels")

# ---- end to end: process() picks up the stored step ----
_names = ("gh", "run", "set_labels", "stat", "set_where", "issue_over", "tell_orchestrator", "find_pr", "branch_of", "agent",
          "ci_integrate", "remote_review", "remote_tester", "remote_fix", "remote_worker", "remote_task", "find_pr_merged", "deploy_main", "sync_main", "remove_worktree", "close_windows")
_saved = {k: getattr(r, k) for k in _names}
def e2e(n, step, verdicts, integ, where="remote", stored="", real_review=False, tests=None):
    calls = {"agent": [], "cloud": [], "review": 0, "fix": 0, "worker": 0, "labels": [], "comments": [], "test": [], "fixtext": [], "ci": 0}
    ts = list(tests or [])
    r.remote_tester = lambda n, pr, level, *a, **k: calls["test"].append(level) or ("shots", ts.pop(0) if ts else "TEST: PASS")   # #618
    r.gh = lambda *a, **k: (calls["comments"].append(a[3]) if a[:2] == ("issue", "comment") else None) or (0, "sha1")
    r.run = lambda *a, **k: (0, ""); r.stat = lambda *a, **k: None; r.set_where = lambda *a: None
    r.issue_over = lambda n, since: False; r.tell_orchestrator = lambda t: None
    r.set_labels = lambda n, add=(), remove=(): calls["labels"].append((tuple(add), tuple(remove)))
    r.find_pr = lambda n: 99; r.branch_of = lambda n: f"lane/{n}"
    r.remote_worker = lambda *a, **k: calls.__setitem__("worker", calls["worker"] + 1) or "RESULT: DONE"
    vs = list(verdicts)
    if not real_review:
        r.remote_review = lambda *a, **k: (calls.__setitem__("review", calls["review"] + 1), (lambda v: (v, v.splitlines()[-1]))(vs.pop(0)))[1]
    r.remote_fix = lambda n, sess, text, *a, **k: calls["fixtext"].append(text) or calls.__setitem__("fix", calls["fix"] + 1) or "RESULT: DONE"
    r.agent = lambda name, *a, **k: calls["agent"].append(name) or ("", "RESULT: STUCK cannot")
    r.remote_task = lambda n, text, *a, **k: calls["cloud"].append(text) or "RESULT: STUCK cannot"     # #289: a cloud lane resolves in the cloud
    ig = list(integ)
    r.ci_integrate = lambda *a, **k: calls.__setitem__("ci", calls["ci"] + 1) or ig.pop(0)
    r.find_pr_merged = lambda n: True; r.deploy_main = lambda log: "deployed"; r.sync_main = lambda log=None: ""
    r.remove_worktree = lambda *a, **k: None; r.close_windows = lambda n: None
    r.set_resume(n, step, stored)
    try: res = r.process({"number": n, "labels": ["core", "ready-for-agent"]}, where)
    finally:
        for k, v in _saved.items(): setattr(r, k, v)
    return res, calls

res, c = e2e(185, "review", ["VERDICT: PASS"], [(0, "")])
assert res.startswith("DONE") and c["worker"] == 0 and c["review"] == 1, (res, c)                  # resume-at-review: no new worker
res, c = e2e(186, "fix", ["VERDICT: PASS"], [(0, "")])
assert res.startswith("DONE") and c["worker"] == 0 and c["fix"] == 1 and c["review"] == 1, (res, c)  # resume-at-fix: fix first, then review
res, c = e2e(187, "merge", [], [(0, "")])
assert res.startswith("DONE") and c["worker"] == c["review"] == c["fix"] == 0, (res, c)
res, c = e2e(188, "resolve", [], [(2, "CONFLICTS\na.js"), (2, "CONFLICTS\na.js")], stored="VERDICT: PASS")
assert res.startswith("BLOCKED") and c["worker"] == c["review"] == 0 and len(c["cloud"]) == 1 and c["agent"] == [], (res, c)   # #289: no local resolve worker
assert not any("ready-for-human" in a for a, _ in c["labels"]) and any("needs-orchestrator" in a for a, _ in c["labels"]), c["labels"]   # never the owner
print("ok process resumes at review / fix / merge / resolve; conflicts -> needs-orchestrator")

# #618: review -> test -> merge for T1+ (no TEST line = T2); T0 skips the tester; a tester FAIL goes back to the worker like a RED review
res, c = e2e(618, "review", ["TEST: T0\nVERDICT: PASS"], [(0, "")])
assert res.startswith("DONE") and c["test"] == [], (res, c)
res, c = e2e(619, "review", ["VERDICT: PASS"], [(0, "")])
assert res.startswith("DONE") and c["test"] == ["T2"], (res, c)
res, c = e2e(620, "review", ["TEST: T3\nVERDICT: PASS-NOTES name", "TEST: T3\nVERDICT: PASS"], [(0, "")],
             tests=["TEST: FAIL parent +10 min -> kid still locked", "TEST: PASS"])
assert res.startswith("DONE") and c["test"] == ["T3", "T3"] and c["fix"] == 1 and c["review"] == 2, (res, c)
assert "parent +10 min" in c["fixtext"][0] and "VERDICT: FIX" in c["fixtext"][0], c["fixtext"]
res, c = e2e(621, "review", ["TEST: T1\nVERDICT: PASS"] * 3, [(0, "")], tests=["TEST: FAIL a"] * 3)
assert res.startswith("BLOCKED") and c["fix"] == 2 and "still RED" in res, (res, c)                    # same #303 limit as a RED review
print("ok #618 review -> test -> merge; T0 skips; tester FAIL -> fix loop")

# #618 (review of PR #620): a blocked issue resumed at merge never reaches ci_integrate without a TEST: PASS for its head
res, c = e2e(622, "merge", ["TEST: T2\nVERDICT: PASS"], [(0, "")], tests=["TEST: FAIL skip does nothing", "TEST: PASS"])
assert res.startswith("DONE") and c["test"] == ["T2", "T2"] and c["fix"] == 1 and c["review"] == 1, (res, c)   # gate -> fix -> re-review -> test -> merge
assert "skip does nothing" in c["fixtext"][0], c["fixtext"]
res, c = e2e(623, "merge", ["TEST: T1\nVERDICT: PASS"] * 3, [(0, "")], tests=["TEST: FAIL a"] * 4)
assert res.startswith("BLOCKED") and c["ci"] == 0, (res, c)                        # never reached ci_integrate
# auto_resume after the tester FAILed: the head's TEST: FAIL -> resume at fix (not merge), with the repro as the red verdict
log, kw = fakes(lambda n: _i)
got = r.auto_resume([I(625, B)], **kw)
assert got == [(625, "fix")] and "help -> read is silent" in r.take_resume_verdict(625), got
r.take_resume(625)
print("ok #618 auto-resume at merge runs the tester gate; a head TEST: FAIL resumes at fix")

# review of #273: a dirty PR without a PASS is never merged unreviewed: fix + review run before ci_integrate
res, c = e2e(190, "resolve", ["VERDICT: PASS"], [(0, "")], stored="VERDICT: FIX add a test")
assert res.startswith("DONE") and c["fix"] == 1 and c["review"] == 1, (res, c)
res, c = e2e(191, "resolve", ["VERDICT: PASS"], [(0, "")], stored="")
assert res.startswith("DONE") and c["fix"] == 0 and c["review"] == 1, (res, c)                # no review yet: review first
res, c = e2e(193, "resolve", [], [(2, "CONFLICTS\na.js"), (0, "")], stored="VERDICT: PASS")
assert c["review"] == 0 and c["cloud"] and not c["agent"], (res, c)                              # PASS head: resolve in integrate (#289: in the cloud), no new review
print("ok resolve-resume reviews a head without a PASS before merging")

# #322: the cloud reviewer never starts (3 tries) -> blocked + needs-orchestrator with the real error, no local reviewer, PR kept
_rs, _sleep, _starts, _slept = r.remote.start, r.time.sleep, [], []
r.remote.start = lambda *a, **k: _starts.append(1) or {"ok": False, "error": "timeout of 15000ms exceeded"}
r.time.sleep = _slept.append
try: res, c = e2e(322, "review", [], [], real_review=True)
finally: r.remote.start, r.time.sleep = _rs, _sleep
assert res.startswith("BLOCKED") and "timeout of 15000ms exceeded" in res and len(_starts) == 3, (res, _starts)
assert _slept[:2] == [60, 300] and c["agent"] == [] and c["worker"] == 0, (_slept, c)        # no local reviewer window, nothing redone
assert any("needs-orchestrator" in a for a, _ in c["labels"]) and not any("ready-for-human" in a for a, _ in c["labels"]), c["labels"]
print("ok cloud reviewer start retried 60 s / 300 s, then needs-orchestrator")

# remote.status: only this run's PR (an older PR that says Fixes #n is not this run's)
def fake_run(cmd):
    if cmd[:3] == ["gh", "issue", "view"]:
        return 0, json.dumps({"comments": [{"body": "Runner: started (core lane, remote)", "createdAt": "2026-11-26T12:00:00Z"}]})
    if cmd[:3] == ["gh", "pr", "list"] and "--head" in cmd: return 0, "[]"
    if cmd[:3] == ["gh", "pr", "list"]:
        return 0, json.dumps([{"number": 238, "url": "u238", "isDraft": False, "body": "Fixes #192", "createdAt": "2026-11-26T12:30:00Z"},
                              {"number": 197, "url": "u197", "isDraft": False, "body": "Fixes #192", "createdAt": "2026-11-26T08:00:00Z"}][::-1])
    return 1, ""
assert remote.status(192, run=fake_run, since="2026-11-26T12:00:00Z")["pr"]["number"] == 238
assert remote.status(192, run=fake_run)["pr"]["number"] == 238                    # CLI: the 'Runner: started' comment is the run start
print("ok remote.status ignores an earlier run's PR")

# #295: the pass never starts a second worker for an issue that already has an open PR (lane/n, claude/*, 'Fixes #n')
saved = r.remote.pr_for, r.gh
prs = {281: (286, "claude/github-issue-281-x")}                                   # #281 has a cloud worker's PR open
def fgh(*a, **k):
    if a[:2] == ("pr", "view"): return 0, json.dumps({"number": int(a[2]), "state": "OPEN", "mergeable": "MERGEABLE", "headRefOid": "h", "commits": [], "comments": []})
    return 0, ""
r.remote.pr_for, r.gh = (lambda n, run=None, state="open": prs.get(n, (None, None))), fgh
try:
    chosen = [I(281, ["ready-for-agent", "pack"]), I(148, ["ready-for-agent", "pack"])]
    got = r.open_pr_resumes(chosen, r.resume_lookup)
finally: r.remote.pr_for, r.gh = saved
assert [c["number"] for c in got] == [281, 148], got                              # both run: 281 as a resume, 148 fresh
assert r.take_resume(281) == "review" and r.take_resume(148) == "", "open claude/* PR -> resume at review, no new worker"
look = {300: {"pr": 9, "mergeable": "MERGEABLE", "verdict": "VERDICT: PURPLE red or blue? hold"},
        301: {"pr": 8, "mergeable": "MERGEABLE", "verdict": "VERDICT: FIX add test"}, 302: {"pr": 7, "mergeable": "CONFLICTING", "verdict": ""}}
r.set_resume(303, "merge", "VERDICT: PASS")                                       # auto_resume already stored a step: kept as is
calls = []
got = r.open_pr_resumes([I(n, ["ready-for-agent"]) for n in (300, 301, 302, 303)], lambda n: calls.append(n) or look.get(n))
assert [c["number"] for c in got] == [301, 302, 303] and 303 not in calls, (got, calls)   # PURPLE owner question: not started at all
assert r.take_resume(301) == "fix" and r.take_resume_verdict(301) == "VERDICT: FIX add test"
assert r.take_resume(302) == "resolve" and r.take_resume(303) == "merge" and r.take_resume(300) == ""
print("ok #295 an open PR resumes, no second worker")
