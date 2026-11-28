# Unit test for tester.py (#618: reviewer test level, Tester role, post-deploy tour): python tools/runner/test_tester.py
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
os.environ["OREN_TEST"] = "1"
import re, trust   # #800: old fixtures have no author: default them to the owner (explicit authors still count; test_trust.py covers the real rules)
_login = trust.login
trust.login = lambda c: _login(c) or (("oren-study-bot" if re.match(r"\s*(OWNER ANSWER|ANSWERED)", c.get("body") or "") or "owner-answer:" in (c.get("body") or "") else "igalgerman") if isinstance(c, dict) else "")
import tester as T

# the reviewer's TEST line: T0-T3; a missing or broken line counts as T2
assert T.parse_level("Looks fine.\nTEST: T0\nVERDICT: PASS") == "T0"
assert T.parse_level("TEST: T3\nVERDICT: PASS-NOTES a") == "T3"
assert T.parse_level("TEST:t1") == "T1"
assert T.parse_level("VERDICT: PASS") == "T2"                   # missing -> T2
assert T.parse_level("TEST: T9\nVERDICT: PASS") == "T2"         # unknown -> T2
assert T.parse_level("") == "T2" and T.parse_level(None) == "T2"
assert T.parse_level("TEST: T1\nTEST: T3") == "T3"              # the last line counts
assert T.parse_level("the tester posts `TEST: PASS`\nVERDICT: PASS") == "T2"   # a tester result is no level
print("ok level")

# who tests: T0 nobody; T1/T2 Sonnet; T3 Opus with two browsers
assert not T.needs_test("T0") and all(T.needs_test(l) for l in ("T1", "T2", "T3"))
assert T.model_for("T1") == T.model_for("T2") == "sonnet" and T.model_for("T3") == "opus"
import runner as _R
assert _R.floors("tester", T.model_for("T3"), "low") == ("opus", "medium") and _R.floors("tester", T.model_for("T1")) == ("sonnet", "medium")   # #714
assert T.session_name(618) == "test-618"
assert T.preview_url(640) == "https://pr-640.oren-game.pages.dev"
print("ok roles")

# the tester's prompt: preview URL, both viewports, the regression tour, the fit check, the result line
p = T.prompt(618, 640, "T2", T.preview_url(640))
for s in ("https://pr-640.oren-game.pages.dev", "1366x768", "390x844", "TEST: PASS", "TEST: FAIL",
          "3 missions", "help", "music", "story", "parent panel", "parent message", "time limit", "+minutes",
          "duplicate", "one main action", "node oren2/ci/tour.js https://pr-640.oren-game.pages.dev", "nikud", "open PR", "Polish backlog", "gh pr comment 640"):
    assert s in p, s
assert "two browsers" not in p                                  # only T3 plays kid + parent at once
assert "two browsers" in T.prompt(618, 640, "T3", T.preview_url(640))
assert len(T.TOUR) == 7
print("ok prompt")

# the tester's result: only PASS / FAIL count (not the reviewer's `TEST: T2` level line)
assert T.parse_result("TEST: PASS") == ("pass", "")
assert T.parse_result("TEST: FAIL tap skip on mission 2 -> nothing") == ("fail", "tap skip on mission 2 -> nothing")
assert T.parse_result("TEST: T2") == ("none", "") and T.parse_result("") == ("none", "")
c = ["review\nTEST: T2\nVERDICT: PASS", "shots...\nTEST: FAIL help -> read is silent", "TEST: PASS"]
assert T.result_from(c) == ("TEST: PASS", "TEST: PASS")
assert T.result_from(c[:2])[0] == "TEST: FAIL help -> read is silent"
assert T.result_from(c[:1]) == ("", "")
print("ok result")

# status on the PR: only comments since this test round started
class Fake:
    def __init__(self, out): self.out, self.calls = out, []
    def __call__(self, cmd, env=None): self.calls.append(cmd); return 0, self.out
import json
f = Fake(json.dumps({"comments": [{"body": "TEST: FAIL old", "createdAt": "2026-11-27T09:00:00Z"},
                                  {"body": "TEST: PASS", "createdAt": "2026-11-27T10:00:00Z"}]}))
assert T.status(640, run=f, since="2026-11-27T09:30:00Z") == {"state": "done", "line": "TEST: PASS", "body": "TEST: PASS"}
assert T.status(640, run=f, since="2026-11-27T11:00:00Z")["state"] == "working"
print("ok status")

# the order review -> test -> merge (T1+), T0 skips the tester; FAIL goes back like a RED review (same FIX loop)
ran = []
def tester(level): ran.append(level); return ("shots + TEST: PASS", "TEST: PASS")
assert T.gate("TEST: T0\nVERDICT: PASS", tester) == ("merge", "T0", "") and ran == []
assert T.gate("TEST: T1\nVERDICT: PASS", tester)[0] == "merge" and ran == ["T1"]
assert T.gate("VERDICT: PASS", tester)[:2] == ("merge", "T2") and ran == ["T1", "T2"]   # no line -> T2 -> tested
step, level, red = T.gate("TEST: T3\nVERDICT: PASS", lambda l: ("body", "TEST: FAIL parent +10 min -> kid still locked"))
assert (step, level) == ("fix", "T3") and red.startswith("VERDICT: FIX") and "parent +10 min" in red, red
step, _, why = T.gate("TEST: T1", lambda l: ("tester posted nothing in 60 min", ""))
assert step == "blocked" and "60 min" in why, why
print("ok gate")

# #746: sync / speech / home-redraw code in the diff raises the level to T3, whatever the reviewer wrote
def d(path, line, sign="+"): return f"diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n@@ -1 +1 @@\n{sign}{line}\n"
for line in ("O.on('synced',()=>limCheck());", "if(x)emit('synced');", "async function famPull(){", "function say(t,lang){", "function hush(){",
             "O.hush&&O.hush();", "O.quiet(home);", "window.OREN.famNow()", "mergeIn(snap.data());"):
    assert T.touches_t3(d("oren2/talents.js", line)), line
assert T.touches_t3(d("oren2/talents.js", "O.hush();", "-")), "a removed line counts"
assert T.touches_t3(d("oren2/cf/functions/api/save/[id].js", "x"))
assert not T.touches_t3(d("oren2/talents.js", "const a = 1;")) and not T.touches_t3("") and not T.touches_t3(None)
assert not T.touches_t3(d("oren2/cf/public/index.html", "function say(t){")), "the built copy alone does not count"
assert T.raise_level("T0", d("oren2/talents.js", "O.hush();")) == "T3" and T.raise_level("T1", "") == "T1"
ran = []
def tester2(l): ran.append(l); return ("ok", "TEST: PASS")
assert T.gate("TEST: T0\nVERDICT: PASS", tester2, d("oren2/index.html", "emit('synced');"))[:2] == ("merge", "T3") and ran == ["T3"]
assert T.gate("TEST: T0\nVERDICT: PASS", tester2, "")[:2] == ("merge", "T0") and ran == ["T3"]
print("ok t3 rule")

# after deploy: a tour fail opens a P0 bug with the repro; it undoes the last merge only when the tour passed on the previous deploy
a = T.tour_fail_actions("parent-live: panel did not update", "abc1234def", "Fix the skip button (#614)", prev="pass")
assert a["undo"] is True and set(a["labels"]) >= {"P0", "bug", "express", "ready-for-agent"}, a
assert "parent-live: panel did not update" in a["body"] and "git revert" in a["body"] and "abc1234" in a["title"] + a["body"]
assert "## Acceptance" in a["body"] and T.TESTER_MARK in a["body"]
b = T.tour_fail_actions("story: no question", "abc1234def", "x", prev="fail")
assert b["undo"] is False and "express" not in b["labels"] and "git revert" not in b["body"] and {"P0", "bug"} <= set(b["labels"])
assert T.tour_fail_actions("x", "abc", "x", prev="")["undo"] is False        # no earlier tour: never undo blindly
print("ok tour")

# dashboard: bugs found by the tester vs bugs the owner reports from the live game
iss = [{"number": 1, "labels": [{"name": "bug"}], "body": "found by the tester\n" + T.TESTER_MARK},
       {"number": 2, "labels": [{"name": "bug"}], "body": "Owner (27 Nov): no voice ![photo](https://x/y.jpg)"},
       {"number": 3, "labels": [{"name": "bug"}], "body": "<img src=a.png> skip does nothing"},
       {"number": 4, "labels": [{"name": "enhancement"}], "body": "Owner wants a new game"},
       {"number": 5, "labels": [{"name": "bug"}], "body": "CI found it"}]
assert T.bug_sources(iss) == {"tester": 1, "owner": 2}
print("ok dashboard")
print("PASS test_tester")
