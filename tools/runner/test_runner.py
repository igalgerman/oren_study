# Unit test for the selection logic: python tools/runner/test_runner.py
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
import re, trust   # #800: old fixtures have no author: default them to the owner (explicit authors still count; test_trust.py covers the real rules)
_login = trust.login
trust.login = lambda c: _login(c) or (("oren-study-bot" if re.match(r"\s*(OWNER ANSWER|ANSWERED)", c.get("body") or "") or "owner-answer:" in (c.get("body") or "") else "igalgerman") if isinstance(c, dict) else "")
import subprocess as _sp; _real_popen = _sp.Popen; _pregen_popens = []
class _NoPregenPopen(_real_popen):                 # #325: fail if any test path launches the real node pregen.js
    def __init__(self, args, *a, **k):
        if "pregen.js" in " ".join(map(str, args if isinstance(args, (list, tuple)) else [args])): _pregen_popens.append(args); raise RuntimeError("test launched real pregen.js")
        super().__init__(args, *a, **k)
_sp.Popen = _NoPregenPopen
import sys; sys.argv.append("--dry-run")
import repos; _GAME = repos.GAME; repos.GAME = ""   # #792: this suite is the one-repo mode (game_repo unset); two-repo cases: test_repos.py
import runner as r
def I(n, labels, t=None): return {"number": n, "labels": labels, "createdAt": t or f"2026-01-{n:02d}"}
R = "ready-for-agent"
def nums(x): return [i["number"] for i in x]
# core one at a time, oldest first; pack/review parallel
assert nums(r.select([I(1,[R,"core"]), I(2,[R,"core"]), I(3,[R,"pack"]), I(4,[R])], 3)) == [1,3]
# untagged = core
assert nums(r.select([I(1,[R]), I(2,[R]), I(3,[R,"review"])], 3)) == [1,3]
# running core blocks new core, pack still starts
assert nums(r.select([I(1,["in-progress","core"]), I(2,[R,"core"]), I(3,[R,"pack"])], 3)) == [3]
# parallel cap counts running issues
assert nums(r.select([I(1,["in-progress","pack"]), I(2,["in-progress","pack"]), I(3,[R,"pack"]), I(4,[R,"pack"])], 3)) == [3]
assert r.select([I(1,["in-progress","pack"])]*3 + [I(9,[R,"pack"])], 3) == []
# blocked / not ready skipped
assert nums(r.select([I(1,[R,"blocked","pack"]), I(2,["pack"]), I(3,[R,"pack"])], 3)) == [3]
assert r.last_line("a\nRESULT: DONE\n", "RESULT:") == "RESULT: DONE"
assert r.find_marker("❯ use `RESULT: DONE` or `RESULT: STUCK <why>`\n● hi\n  RESULT: DONE\n", "RESULT:") == "RESULT: DONE"
assert r.find_marker("❯ x\n  RESULT: DONE or RESULT: STUCK\n", "RESULT:") == ""
assert r.find_marker("VERDICT: FIX\nVERDICT: PASS", "VERDICT:") == "VERDICT: PASS"
print("ok")

# blocked-by: #3 waits while #1 is open; starts when #1 is gone
from runner import select as _sel, blockers as _bl
assert _bl("x\nBlocked by: #1, #2\n") == [1, 2]
assert _bl("- Blocked by: #23") == [23]
assert _bl("  * blocked by: #4, #5") == [4, 5]
assert _bl("> Blocked by: #6") == [6]
assert _bl("see Blocked by #7 in text") == []
_q = [{"number": 1, "labels": ["core"], "createdAt": "1"},
      {"number": 3, "labels": ["core", "ready-for-agent"], "createdAt": "3", "body": "Blocked by: #1"},
      {"number": 4, "labels": ["pack", "ready-for-agent"], "createdAt": "4", "body": ""}]
assert [i["number"] for i in _sel(_q, 3)] == [4]
assert [i["number"] for i in _sel(_q[1:], 3)] == [3, 4]
print("ok blocked-by")

# bugs jump the queue
_q2 = [{"number": 5, "labels": ["pack", "ready-for-agent"], "createdAt": "1"},
       {"number": 6, "labels": ["pack", "ready-for-agent", "bug"], "createdAt": "2"}]
assert [i["number"] for i in _sel(_q2, 1)] == [6]
print("ok bugs-first")

# #177: hand work labelled 'manual' never takes a lane and is never started by the runner
_q3 = [{"number": 10, "labels": ["manual", "in-progress", "core"], "createdAt": "1"},
       {"number": 11, "labels": ["manual"], "createdAt": "1"},
       {"number": 12, "labels": ["manual", "ready-for-agent"], "createdAt": "1"},
       {"number": 13, "labels": ["core", "ready-for-agent"], "createdAt": "2"}]
assert [i["number"] for i in _sel(_q3, 1)] == [13]
print("ok manual")

# questions + parking
NL = chr(10)
def scr(*lines): return NL.join(lines) + NL
q = scr("x", "● thinking", "  QUESTION: a or b?", "✻ Churned for 3s", "❯")
assert r.pending_question(q) == "QUESTION: a or b?"
assert r.pending_question(q + scr("❯  h<hc from=t2g>a</hc>", "● ok")) == ""            # answered
assert r.pending_question(scr("QUESTION: x?", "RESULT: DONE")) == ""                         # finished afterwards
assert r.pending_question("❯ end with `QUESTION: <short question, with options>`.") == ""  # prompt echo
assert r.waiting_now("blocked", "") and r.waiting_now("done", q) and not r.waiting_now("working", q) and not r.waiting_now("done", "hi")
assert not r.should_park(None, 1000, 30)
assert not r.should_park(1000, 1000 + 29 * 60, 30) and r.should_park(1000, 1000 + 30 * 60, 30)
print("ok park")

# watchdog cleanup: which windows are leftovers
import watchdog as W
_ts = [
  {"name": "issue-2", "state": "live", "status": "done", "marker": True},    # superseded by review-2 -> close
  {"name": "review-2", "state": "live", "status": "working", "marker": False},
  {"name": "issue-5", "state": "live", "status": "done", "marker": True},    # issue 5 closed -> close
  {"name": "run-5", "state": "live", "status": "", "marker": False},          # closed -> close
  {"name": "issue-7", "state": "live", "status": "blocked", "marker": False}, # parked -> keep
  {"name": "run-9", "state": "finished", "status": "", "marker": False},     # finished terminal -> remove
  {"name": "issue-8", "state": "live", "status": "working", "marker": False}, # working -> keep
]
assert sorted(W.leftovers(_ts, closed={5}, blocked={7})) == ["issue-2", "issue-5", "run-5", "run-9"], W.leftovers(_ts, {5}, {7})
print("ok cleanup")
# #43: every finished record goes; idle windows with no live run-<n> go (unless ready-for-human)
_f = [{"name": n, "state": "finished"} for n in ("run-pass-123", "run-4-r", "watchdog", "flowtest-1", "intake-3", "review-25")]
assert sorted(W.leftovers(_f, set(), set())) == sorted(x["name"] for x in _f)
_idle = [{"name": "review-25", "state": "live", "status": "idle"}, {"name": "issue-26", "state": "live", "status": "idle"},
         {"name": "run-26", "state": "live", "status": ""}, {"name": "intake-27", "state": "live", "status": "done"},
         {"name": "issue-28", "state": "live", "status": "idle"}, {"name": "issue-29", "state": "live", "status": "idle"}]
_st = {"review-25", "issue-26", "intake-27", "issue-28", "issue-29"}
assert sorted(W.leftovers(_idle, set(), set(), human={28}, stale=_st)) == ["intake-27", "issue-29", "review-25"]   # 26 has live run, 28 is for the owner
assert W.leftovers(_idle, set(), set(), human={28}, stale=set()) == []                                          # not idle long enough
print("ok orphans")
# #110: issue-<n>-resolve<k> windows: closed with the issue, when stale, or when the next round is live
_rs = [{"name": "issue-38-resolve1", "state": "live", "status": "done", "marker": True},
       {"name": "issue-38-resolve2", "state": "live", "status": "idle", "marker": True},
       {"name": "issue-40-resolve1", "state": "live", "status": "done", "marker": True},
       {"name": "issue-40-resolve2", "state": "live", "status": "working", "marker": False},
       {"name": "issue-41-resolve1", "state": "live", "status": "working", "marker": False}]
assert sorted(W.leftovers(_rs, closed={38}, blocked=set())) == ["issue-38-resolve1", "issue-38-resolve2", "issue-40-resolve1"], W.leftovers(_rs, {38}, set())
assert W.leftovers(_rs, closed=set(), blocked={38}, stale={"issue-41-resolve1"}) == ["issue-40-resolve1", "issue-41-resolve1"]
print("ok resolve windows")
# #113: a closed issue whose runner still holds issue-<n>.lock keeps its windows (the runner is deploying)
_bz = [{"name": "run-38", "state": "live", "status": "", "marker": False},
       {"name": "issue-38", "state": "live", "status": "done", "marker": True}]
assert W.leftovers(_bz, closed={38}, blocked=set(), busy={38}) == []
assert sorted(W.leftovers(_bz, closed={38}, blocked=set())) == ["issue-38", "run-38"]
print("ok busy run kept")
# #117 idle alarm: free lanes 15+ min with ready work, PR quiet 60+ min, blocked 2+ h
import calendar as _c
_now = _c.timegm((2026, 11, 26, 6, 0, 0, 0, 0, 0))
_iss = [{"number": 5, "labels": ["blocked", "ready-for-human"], "updatedAt": "2026-11-26T03:00:00Z"},
        {"number": 6, "labels": ["blocked"], "updatedAt": "2026-11-26T05:00:00Z"},
        {"number": 7, "labels": ["in-progress"], "updatedAt": "2026-11-26T05:59:00Z"}]
_prs = [{"number": 70, "title": "Observer v2", "updatedAt": "2026-11-26T04:30:00Z"}, {"number": 71, "title": "x", "updatedAt": "2026-11-26T05:30:00Z"}]
_al = W.idle_alarms(_iss, _prs, _now, _now - 20 * 60, 3)
assert [k for k, _ in _al] == ["free", "pr70", "bl5"], _al
assert _al[0][1] == "2 lane(s) free for 20 min while work is ready" and _al[1][1].startswith("PR #70 has not moved for 90 min"), _al
assert _al[2][1] == "#5 blocked for 3.0 h (waits for the owner)", _al
assert [k for k, _ in W.idle_alarms(_iss, [], _now, _now - 5 * 60, 3)] == ["bl5"]   # free only 5 min: no alarm yet
# #148: the idle alarm notes a runner finish rate under 50% (24 h)
_fa = W.idle_alarms([], [], _now, None, 3, finish=(2, 5))
assert _fa == [("finish", "runner finished on its own only 2 of 5 issues in 24 h (40%, goal 80%)")], _fa
assert W.idle_alarms([], [], _now, None, 3, finish=(3, 6)) == [] and W.idle_alarms([], [], _now, None, 3, finish=(0, 0)) == []
# #376: the finish alarm is keyed by kind (its text changes every pass): once per 6 h, sooner only if the rate drops 5+ points
_f1 = [("finish", "runner finished on its own only 1 of 7 issues in 24 h (14%, goal 80%)"), ("pr70", "PR #70 quiet")]
_n1, _s1, _st1 = W.pick_alarms(_f1, {}, {}, (1, 7), _now)
assert _n1 == [t for _, t in _f1] and _st1 == {"ts": _now, "pct": 100 / 7}, (_n1, _st1)
_f2 = [("finish", "runner finished on its own only 1 of 8 issues in 24 h (12%, goal 80%)"), ("pr71", "PR #71 quiet")]
_n2, _s2, _st2 = W.pick_alarms(_f2, _s1, _st1, (1, 8), _now + 20 * 60)          # 14% -> 12.5% within 1 h: no second finish alarm
assert _n2 == ["PR #71 quiet"] and _st2 == _st1, (_n2, _st2)
assert W.pick_alarms(_f2, _s1, _st1, (1, 8), _now + 61 * 60)[0] == ["PR #71 quiet"]     # past the hourly dedupe, still < 6 h
assert W.pick_alarms(_f2, _s1, _st1, (1, 8), _now + 6 * 3600)[0][0].startswith("runner finished")   # 6 h later: again
_n3, _, _st3 = W.pick_alarms(_f2, _s1, _st1, (1, 12), _now + 30 * 60)           # 14.3% -> 8.3%: dropped 5+ points -> again
assert _n3[0].startswith("runner finished") and abs(_st3["pct"] - 100 / 12) < 1e-9, (_n3, _st3)
assert W.pick_alarms(_f1, {"pr70": _now}, {}, (1, 7), _now + 10 * 60)[0] == [_f1[0][1]]   # PR alarms keep their own per-PR dedupe
from pathlib import Path as _P; _fs = _P(tempfile.mkdtemp()) / "finish_alarm.json"
W.save_finish_state(_st1, _fs); assert W.load_finish_state(_fs) == _st1 and W.load_finish_state(_fs.with_name("none.json")) == {}
_cl = [{"n": 7, "state": "working", "last": "2026-11-26T09:00:00Z"}, {"n": 8, "state": "working", "last": "2026-11-26T11:30:00Z"}, {"n": 9, "last": ""}]
_cn = _c.timegm((2026, 11, 26, 12, 0, 0, 0, 0, 0))
_ca = W.cloud_stuck_alarms(_cl, _cn, 2)
assert [k for k, _ in _ca] == ["cl7"] and "#7" in _ca[0][1] and "3.0 h" in _ca[0][1], _ca   # quiet 3 h > 2 h; #8 recent; #9 no data
assert W.cloud_stuck_alarms(_cl, _cn, 4) == []
print("ok idle alarm")
# #123: closed wins over blocked; parked windows go after PARKED_MIN idle, never while waiting on a prompt
_pk = [{"name": "review-41", "state": "live", "status": "done", "marker": True},
       {"name": "issue-48-fix", "state": "live", "status": "done", "marker": True},
       {"name": "issue-49", "state": "live", "status": "blocked", "marker": False}]
assert W.leftovers(_pk, closed={41}, blocked={41, 48, 49}) == ["review-41"]
assert W.leftovers(_pk, closed=set(), blocked={41, 48, 49}, old={"issue-48-fix"}) == ["issue-48-fix"]
print("ok parked windows")
# #164: after review_pass the done worker/reviewer windows go even while the runner is busy; resolve windows stay
_ps = [{"name": "issue-160", "state": "live", "status": "done", "marker": True}, {"name": "review-160-2", "state": "live", "status": "done", "marker": True},
       {"name": "run-160", "state": "live", "status": "", "marker": False}, {"name": "issue-160-resolve1", "state": "live", "status": "working", "marker": False},
       {"name": "issue-161", "state": "live", "status": "done", "marker": True}]
assert W.leftovers(_ps, closed=set(), blocked=set(), busy={160, 161}, passed={160}) == ["issue-160", "review-160-2"]
_ev = [{"ts": 1, "issue": 160, "event": "start"}, {"ts": 2, "issue": 160, "event": "review_pass"}, {"ts": 3, "issue": 161, "event": "review_pass"},
       {"ts": 4, "issue": 162, "event": "start"}, {"ts": 5, "issue": 162, "event": "review_pass"}, {"ts": 6, "issue": 162, "event": "start"}]
assert W.review_passed({160, 161, 162}, _ev) == {160}   # 161: no start; 162: a new run started after the pass
print("ok review-passed windows")

# regression: a finished run-2 next to a live run-2 must not close anything (the live one is working)
assert W.leftovers([{"name": "run-2", "state": "finished"}, {"name": "run-2", "state": "live", "status": ""}], set(), set()) == []
print("ok same-name")

# timing stats
import stats as st
_ev = lambda t, n, e: {"ts": t, "issue": n, "lane": "core", "event": e}
_log = [_ev(1000, 1, "start"), _ev(1600, 1, "worker_done"), _ev(1900, 1, "review_fix"), _ev(2200, 1, "fix_done"),
        _ev(2500, 1, "review_pass"), _ev(3000, 1, "merged"), _ev(3100, 1, "deployed"),
        _ev(90000, 2, "start"), _ev(90300, 2, "worker_done"), _ev(90400, 2, "review_pass"), _ev(90600, 2, "merged"),
        _ev(91000, 3, "start"), _ev(91100, 3, "parked"), _ev(91200, 3, "blocked")]
_r = st.compute(_log, now=91000)
_i = {p["issue"]: p for p in _r["issues"]}
assert (_i[1]["build"], _i[1]["review"], _i[1]["fix_rounds"], _i[1]["merge"]) == (600, 900, 1, 2000)
_t = _r["totals"]
assert (_t["merged_24h"], _t["merged_total"], _t["parked"], _t["blocked"]) == (1, 2, 1, 1)
assert _t["avg_merge"] == 1300 and _t["avg_build"] == 450 and _t["avg_review"] == 500
assert st.compute([])["totals"]["avg_merge"] is None and "merged: 0" in st.report([])
print("stats ok")

# max_core: 2 core + 1 other, never 3 core
_c = lambda n: I(n, [R, "core"])
assert nums(r.select([_c(1), _c(2), _c(3), I(4, [R, "pack"])], 3, 2)) == [1, 2, 4]
assert nums(r.select([_c(1), _c(2), _c(3)], 3, 2)) == [1, 2]
assert nums(r.select([I(1, ["in-progress", "core"]), _c(2), _c(3)], 3, 2)) == [2]
assert nums(r.select([I(1, ["in-progress", "core"]), I(2, ["in-progress", "core"]), _c(3), I(4, [R, "pack"])], 3, 2)) == [4]
assert nums(r.select([_c(1), _c(2)], 3)) == [1]          # default max_core = 1
assert r.CFG["max_core"] >= 2        # 3 since 26 Nov (#183)
print("ok max_core")

# conflict -> resolve -> retry, at most 2 resolve rounds
def _drive(results):
    """results: integrate outcomes in order, each (rc, out); resolve always succeeds. -> (outcome, #integrate calls, #resolve calls)"""
    it, calls = iter(results), {"i": 0, "r": 0}
    def integ(): calls["i"] += 1; return next(it)
    def resolve(files): calls["r"] += 1; return True
    return r.integrate_with_resolve(integ, resolve, 2), calls
(o, c) = _drive([(0, "integrated")]);                                       assert o[0] == "merged" and (c["i"], c["r"]) == (1, 0)
(o, c) = _drive([(2, "CONFLICTS (fix)\na.js\nb.js\n"), (0, "ok")]);          assert o[0] == "merged" and (c["i"], c["r"]) == (2, 1)
(o, c) = _drive([(5, "commit/push failed"), (2, "CONFLICTS\na.js\n"), (0, "ok")]); assert o[0] == "merged" and (c["i"], c["r"]) == (3, 2)
(o, c) = _drive([(2, "CONFLICTS\na.js\n")] * 3);                              assert o[0] == "giveup" and o[1] == ["a.js"] and (c["i"], c["r"]) == (3, 2)
(o, c) = _drive([(4, "TESTS FAILED")]);                                      assert o[0] == "failed" and (c["i"], c["r"]) == (1, 0)   # not a conflict: no resolve
def _bad(files): return False
assert r.integrate_with_resolve(lambda: (2, "CONFLICTS\nx\n"), _bad, 2)[0] == "failed"                                        # resolver did not finish
assert r.conflict_files("CONFLICTS (fix by hand, or send back to the lane):\nx/a.js\ny/b.css\n") == ["x/a.js", "y/b.css"]
assert "git fetch origin && git merge -X renormalize origin/main" in r.resolve_prompt(7, ["a.js"]) and "RESULT: DONE" in r.resolve_prompt(7, ["a.js"]) and "force" in r.resolve_prompt(7, [])
import os as _os
assert "* text=auto eol=lf" in open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "..", ".gitattributes"), encoding="utf-8").read()   # #62
print("ok resolve")

# routing: STUCK / runner error -> orchestrator (not the owner); a parked question -> the owner
assert r.stuck_labels() == ["blocked", "needs-orchestrator"] and "ready-for-human" not in r.stuck_labels()
import inspect
assert '"ready-for-human"' in inspect.getsource(r.park_issue) and "ready-for-human" not in inspect.getsource(r.block)
print("ok routing")

# ---- acting observer ----
import observer as ob
def _I(n, L, touched=60, norun=0, body=""): return {"number": n, "labels": L, "touched_min_ago": touched, "no_run_min": norun, "body": body}
def _S(issues, orch="idle", idle=40, integ=False): return {"issues": issues, "orchestrator": orch, "orchestrator_idle_min": idle, "integrating": integ}
assert ob.rules(_S([_I(1, ["blocked", "P0", "needs-orchestrator"], 31)])) == [("make_ready", 1, ob.rules(_S([_I(1, ["blocked", "P0", "needs-orchestrator"], 31)]))[0][2])]
assert ob.rules(_S([_I(1, ["needs-orchestrator"], 20)])) == []                       # younger than 30 min
assert ob.rules(_S([_I(1, ["needs-orchestrator"], 40)], orch="working")) == []       # orchestrator busy
assert ob.rules(_S([_I(1, ["needs-orchestrator"], 40)], integ=True)) == []           # manual integration
assert ob.rules(_S([_I(1, ["needs-orchestrator", "ready-for-human"], 90)])) == []
assert ob.rules(_S([_I(2, ["in-progress"], 5, norun=11)]))[0][:2] == ("rerun", 2)
assert ob.rules(_S([_I(2, ["in-progress"], 5, norun=3)])) == []
assert ob.normalize_body("x\n- Blocked by 56, 7\nBlocked by: 8\nBlocked by: #1, #2\n") == ("x\nBlocked by: #56, #7\nBlocked by: #8\nBlocked by: #1, #2\n", True)
assert ob.normalize_body("Blocked by: #1\n")[1] is False
_s = _S([_I(n, ["x"]) for n in range(1, 9)])
assert len(ob.select_actions([("make_ready", n, "r") for n in range(1, 9)], _s, {}, 10**6)) == 5          # max 5
assert ob.select_actions([("make_ready", 1, "r")], _s, {"acted": {"make_ready:1": 10**6 - 59 * 60}}, 10**6) == []   # repeat < 60 min
assert len(ob.select_actions([("make_ready", 1, "r")], _s, {"acted": {"make_ready:1": 10**6 - 61 * 60}}, 10**6)) == 1
assert ob.select_actions([("rerun", 1, "r")], _S([_I(1, ["ready-for-human"])]), {}, 10**6) == []          # never on ready-for-human
assert ob.select_actions([("rerun", 1, "r")], _S([_I(1, ["x"])], integ=True), {}, 10**6) == []
_pr = _S([_I(1, ["x"]), _I(2, ["x"])]); _pr["open_prs"] = [{"headRefName": "lane/1"}, {"headRefName": "lane/12"}]
assert ob.select_actions([("make_ready", 1, "r"), ("fix_blocked_by", 1, "r"), ("rerun", 2, "r")], _pr, {}, 10**6) == [("rerun", 2, "r")]   # open lane/1 PR: being merged
_sets = []; _old = (ob.integrating, ob.R.set_labels, ob.comment)
ob.R.set_labels = lambda n, add=(), remove=(): _sets.append(n); ob.comment = lambda *a: None
ob.integrating = lambda: True; assert ob.execute("make_ready", 1, "r", {"terminals": []}) is False and ob.execute("rerun", 1, "r", {"terminals": []}) is False and _sets == []   # lock appeared after snapshot
ob.integrating = lambda: False; assert ob.execute("make_ready", 1, "r", {"terminals": []}) is True and _sets == [1]
ob.integrating, ob.R.set_labels, ob.comment = _old
print("observer ok")
# priority: P0, then bug, then P1<P2<P3 (missing = P2), then oldest (#437: P0 now before bugs)
assert nums(r.select([I(1,[R,"pack","P3"]), I(2,[R,"pack"]), I(3,[R,"pack","P1"]), I(4,[R,"pack","P0"])], 4)) == [4,3,2,1]
assert nums(r.select([I(1,[R,"pack","P0"]), I(2,[R,"pack","bug","P3"]), I(3,[R,"pack","P1"])], 3)) == [1,2,3]
assert nums(r.select([I(5,[R,"pack","P1"]), I(3,[R,"pack","P1"])], 2)) == [3,5]
assert r.priority_of(["P1", "x"]) == 1 and r.priority_of([]) == 2
print("ok priority")
# #437 tiers: express, then P0 (any tier), then tier-1 (no label) < tier-2 < tier-3, then bug, then P1..P3, then oldest
assert r.tier_of([]) == 1 and r.tier_of(["tier-2"]) == 2 and r.tier_of(["tier-3", "P1"]) == 3
assert nums(r.select([I(1,[R,"pack","P1","tier-2"]), I(2,[R,"pack","P2"])], 2)) == [2,1]               # P1 tier-2 after P2 tier-1
assert nums(r.select([I(1,[R,"pack","P1"]), I(2,[R,"pack","P0","tier-2"])], 2)) == [2,1]               # P0 tier-2 before P1 tier-1
assert nums(r.select([I(1,[R,"pack","P0"]), I(2,[R,"pack","P3","tier-3","express"])], 1, express_lanes=0)) == [2]   # express first
assert nums(r.select([I(1,[R,"pack","tier-2","bug"]), I(2,[R,"pack","P3"]), I(3,[R,"pack","tier-3"])], 3)) == [2,1,3]   # tier before bug
print("ok tiers")
# stale window on resume: a finished (done/idle) window is stale, because every window found at the start of a run is older than this run
# (and than the latest push); only working / blocked / waiting-for-an-answer windows are re-attached
assert r.is_stale_window("done", scr("● hi", "  VERDICT: FIX", "❯"))                       # old finished review: stale
assert r.is_stale_window("idle", scr("  RESULT: DONE"))
assert not r.is_stale_window("working", scr("  VERDICT: FIX"))
assert not r.is_stale_window("blocked", "")
assert not r.is_stale_window("done", q)                                                      # finished but asked the owner: keep
print("ok stale-window")
# deploy_text: "ok <url>" is the LAST line of deploy.sh; pregen only when config pregen = true (#50)
_calls = []
NL = chr(10)
def _fake_run(cmd, **kw):
    _calls.append(cmd)
    return (0, "injected 1 2" + NL + "website copy written" + NL + "worker 3" + NL + "ok https://x.oren-game.pages.dev" + NL) if "deploy.sh" in " ".join(map(str, cmd)) else (0, "")
_orig_run, _orig_env = r.run, r.env_file
r.run, r.env_file = _fake_run, (lambda: {"CLOUDFLARE_API_TOKEN": "t"})
# #192: deploy runs in GitHub Actions by default: the runner never calls deploy.sh, never starts pregen, never marks deployed.sha
_dic = r.CFG.get("deploy_in_ci"); r.CFG.pop("deploy_in_ci", None)
assert r.deploy_text(None).startswith("deploy runs in GitHub Actions") and _calls == []
assert not r.deploy_text(None).startswith("deployed")          # so process() skips start_pregen and deploy_main skips deployed.sha
r.CFG["deploy_in_ci"] = False
r.CFG["pregen"] = False
assert r.deploy_text(None) == "deployed ok https://x.oren-game.pages.dev (pregen off)" and not any("pregen.js" in " ".join(map(str, c)) for c in _calls)
r.CFG["pregen"] = True; _calls.clear()
assert r.deploy_text(None).startswith("deployed ok https://") and not any("pregen.js" in " ".join(map(str, c)) for c in _calls)   # #175: pregen runs later, outside the lock
r.run, r.env_file = _orig_run, _orig_env; r.CFG["pregen"] = False
if _dic is None: r.CFG.pop("deploy_in_ci", None)
else: r.CFG["deploy_in_ci"] = _dic
print("ok deploy")
# sync_decision: keep the main checkout up to date with origin/main (#47)
assert r.sync_decision("main", "main", False, 3) == ("pull", "")
assert r.sync_decision("main", "main", False, 0) == ("skip", "")                 # already current: nothing to say
assert r.sync_decision("main", "main", True, 3)[0] == "skip" and "uncommitted" in r.sync_decision("main", "main", True, 3)[1]
assert r.sync_decision("lane/9", "main", False, 3)[0] == "skip" and "lane/9" in r.sync_decision("lane/9", "main", False, 3)[1]
# git status lines: untracked files are fine, tracked edits are dirty
assert r.is_dirty("?? tools/x.txt\n?? y\n") is False
assert r.is_dirty(" M tools/runner/runner.py\n?? y\n") is True
assert r.is_dirty("") is False
print("ok sync-main")


# #16: space lookup (mock herdr-app), pin/unpin, NEEDS YOU line, terminal.keep workaround is gone
import json as _json
_ran = []
def _mock_run(out):
    def f(cmd, **kw):
        _ran.append(list(map(str, cmd))); return (0, out)
    return f
_orig_run16 = r.run
r.run = _mock_run(_json.dumps({"spaces": [{"id": "s1", "name": "other"}, {"id": "s2", "name": r.CFG.get("herdr_space", "oren-workers")}]}))
r._SPACE = None
assert r.space_args() == ["--label", "herdr.space=s2"]; assert len(_ran) == 1
r.space_args(); assert len(_ran) == 1                                                       # cached
r.run = _mock_run(_json.dumps({"spaces": [{"id": "s1", "name": "other"}]})); r._SPACE = None
assert r.space_args() == []                                                                   # no such space: no label
r.run = _mock_run(_json.dumps({"spaces": [{"id": "s1", "name": "other"}, {"id": "s3", "name": "Oren workers"}]})); r._SPACE = None
assert r.space_args() == ["--label", "herdr.space=s3"]                                        # #331: 'oren-workers' not made yet -> old 'Oren workers'
r.run = _mock_run("not json"); r._SPACE = None
assert r.space_args() == []                                                                   # bad output: no label, no crash
r.run = _orig_run16; r._SPACE = None
assert not hasattr(r, "show")                                                                 # terminal.keep workaround removed

_orig_run_w, _orig_app = W.R.run, W.R.HERDR_APP
W.R.run = _mock_run(""); W.R.HERDR_APP = sys.executable
_ran.clear(); W.pin({"address": "t:1"}, True)
assert _ran[-1][1:] == ["do", "terminal.pin", "--terminal", "t:1", "--pinned", "true"], _ran
W.pin({"address": "t:1"}, False); assert _ran[-1][-1] == "false"
n = len(_ran); W.pin({}, True); assert len(_ran) == n                                         # no address: nothing to pin
W.R.HERDR_APP = r"C:\no\such\herdr-app.exe"; W.pin({"address": "t:1"}, True); assert len(_ran) == n   # app missing: nothing
W.R.run, W.R.HERDR_APP = _orig_run_w, _orig_app
assert W.needs_you_line("issue-16", "QUESTION: a or b?", "tail") == "NEEDS YOU: #16 a or b?"
assert W.needs_you_line("review-7", "", "x\nlast line") == "NEEDS YOU: #7 (waiting for an answer) last line"
assert W.needs_you_line("intake", "QUESTION: ok?", "") == "NEEDS YOU: intake ok?"
print("ok herdr-leftovers")
# remove_worktree: the node_modules junction goes alone, the real modules survive; a half-made worktree is cleaned (#82)
import tempfile, subprocess, os
from pathlib import Path as _P
_t = _P(tempfile.mkdtemp()); _real = _t / "real_modules"; _real.mkdir(); (_real / "keep.txt").write_text("x")
_wt = _t / "wt-x"; (_wt / "oren2").mkdir(parents=True)
if os.name == "nt":
    subprocess.run(["cmd", "/c", "mklink", "/J", str(_wt / "oren2" / "node_modules"), str(_real)], capture_output=True, check=True)
    assert os.path.isjunction(_wt / "oren2" / "node_modules")
else:                                                # CI on Linux (#152): the same case with a symlink
    os.symlink(_real, _wt / "oren2" / "node_modules")
r.remove_worktree(_wt)
assert not _wt.exists() and (_real / "keep.txt").exists()
import shutil; shutil.rmtree(_t, ignore_errors=True)
print("ok remove-worktree")

# CI merge decisions (#74)
def _ck(*b): return [{"name": f"c{i}", "bucket": x} for i, x in enumerate(b)]
assert r.ci_verdict([]) == "none" and r.ci_verdict(None) == "none"
assert r.ci_verdict(_ck("pass", "pass")) == "green" and r.ci_verdict(_ck("pass", "skipping")) == "green"
assert r.ci_verdict(_ck("pass", "pending")) == "pending"             # a pending check is never green
assert r.ci_verdict(_ck("pending", "fail")) == "red" and r.ci_verdict(_ck("cancel")) == "red"
assert r.ci_verdict(_ck("skipping")) == "none"
def _cm(seq, merge_ok=True, **kw):
    it, log = iter(seq), []
    out = r.ci_merge(lambda: next(it), lambda: log.append("rerun"), lambda: log.append("merge") or merge_ok, lambda s: log.append("sleep"), **kw)
    return out, log
assert _cm([_ck("pass")]) == (("merged",), ["merge"])
assert _cm([_ck("pending"), _ck("pass")]) == (("merged",), ["sleep", "merge"])
assert _cm([_ck("fail"), _ck("pending"), _ck("pass")]) == (("merged",), ["rerun", "sleep", "sleep", "merge"])   # flaky: rerun once, then green
assert _cm([_ck("fail"), _ck("fail")])[0] == ("red", ["c0"]) and _cm([_ck("fail"), _ck("fail")])[1].count("rerun") == 1   # still red: back to the worker
assert _cm([_ck("pass")], merge_ok=False)[0] == ("merge-failed",)
assert _cm([_ck("pass")], merge_ok="conflict")[0] == ("conflict",)     # #160: CI green but main moved -> conflict, not a block
assert r.merge_conflict("Pull Request has merge conflicts") and r.merge_conflict("not mergeable: the merge commit cannot be cleanly created") and not r.merge_conflict("required status check missing")
_mr = iter([(2, "CONFLICTS"), (7, "x"), (0, "ok")])
assert r.integrate_with_resolve(lambda: next(_mr), lambda f: True, 2)[0] == "failed"
_mr = iter([(2, "CONFLICTS"), (0, "ok")])
assert r.integrate_with_resolve(lambda: next(_mr), lambda f: True, 2)[0] == "merged"            # merge conflict -> resolve round -> retry -> merged
assert _cm([_ck("pending")] * 99, timeout_s=60, poll_s=30)[0] == ("timeout",)
assert r.deploy_needed("a", "b") and not r.deploy_needed("b", "b") and r.deploy_needed("", "b") and not r.deploy_needed("a", "")
assert r.conflict_files("CI RED\nc0\n") == ["c0"]
assert r.integrate_with_resolve(iter([(6, "CI RED\nc0\n"), (0, "ok")]).__next__, lambda f: f == ["c0"], 2)[0] == "merged"
assert "c0" in r.ci_fix_prompt(7, ["c0"]) and "RESULT: DONE" in r.ci_fix_prompt(7, [])
assert r.CFG["ci_merge"] is True
# rerun race: after the rerun the old failed run may still show; red is judged only once the run stamp changed
def _race(stamps, checks):
    it, st, log = iter(checks), iter(stamps), []
    out = r.ci_merge(lambda: next(it), lambda: log.append("rerun"), lambda: True, lambda s: None, stamp=lambda: next(st))
    return out, log
assert _race(["a", "a", "a", "b"], [_ck("fail"), _ck("fail"), _ck("pending"), _ck("pass")])[0] == ("merged",)       # old red ignored
assert _race(["a", "a", "b", "b"], [_ck("fail"), _ck("fail"), _ck("fail"), _ck("fail")])[0] == ("red", ["c0"])       # new run red: judged
assert _race(["a", "a", "a", "a"] + ["a"] * 20, [_ck("fail")] * 30)[0] == ("red", ["c0"])                          # stamp never changes: bounded
# deploy_main writes deployed.sha only when the text says "deployed" (not "not deployed: no token")
import tempfile; from pathlib import Path
_t = Path(tempfile.mkdtemp()); (_t / ".git").mkdir()
_o = (r.run, r.INTEG, r.RUNS, r.deploy_text)
r.run = lambda cmd, **kw: (0, "abc123" + chr(10)) if "rev-parse" in cmd else (0, "")
r.INTEG, r.RUNS = _t, _t
(_t / "oren2").mkdir()
r.deploy_text = lambda log: "not deployed: no token"
assert r.deploy_main(None) == "not deployed: no token" and not (_t / "deployed.sha").exists()
r.deploy_text = lambda log: "deployed ok https://x"
assert r.deploy_main(None).startswith("deployed") and (_t / "deployed.sha").read_text() == "abc123"
# #503: deploy_main never rebuilds + pushes to main (that push lost races -> BLOCKED); PRs carry the build, CI checks it
_cmds = []
r.run = lambda cmd, **kw: (_cmds.append(cmd), (1, "") if "diff" in cmd else (0, "def456" + chr(10)))[1]
(_t / "deployed.sha").unlink()
r.deploy_main(None)
assert not any("push" in c for c in _cmds), _cmds
assert not any("build_talents.py" in c for c in _cmds), _cmds
r.run, r.INTEG, r.RUNS, r.deploy_text = _o
# CI timeout / failed merge (rc 7) -> blocked with the real reason, no resolve round
_n = {"r": 0}
def _res(f): _n["r"] += 1; return True
assert r.integrate_with_resolve(lambda: (7, "CI timed out"), _res, 2) == ("failed", 7, "CI timed out") and _n["r"] == 0
print("ok ci-merge")

# #72 express lane: own extra lane, starts first, may exceed max_core
_e = lambda n, extra=(): I(n, [R, "express", *extra])
assert nums(r.select([I(1, ["in-progress", "pack"]), I(2, ["in-progress", "pack"]), I(3, ["in-progress", "pack"]), _e(4, ["pack"])], 3, 2, 1)) == [4]
assert nums(r.select([I(1, ["in-progress", "pack"]), I(2, ["in-progress", "pack"]), I(3, ["in-progress", "pack"]), _e(4, ["pack"])], 3, 2, 0)) == []   # no express lane configured
assert nums(r.select([I(1, [R, "pack"]), _e(2, ["pack"])], 1, 1, 1)) == [2, 1]      # express first; normal lane still used
assert nums(r.select([I(1, ["in-progress", "pack"]), I(2, ["in-progress", "pack"]), I(3, ["in-progress", "pack"]), _e(4, ["pack"]), _e(5, ["pack"])], 3, 2, 1)) == [4]   # only one express lane
assert nums(r.select([I(1, ["in-progress", "pack", "express"]), _e(2, ["pack"])], 3, 2, 1)) == [2]   # express lane busy: 2 uses a normal slot
assert nums(r.select([_c(1), _c(2), _e(3, ["core"])], 3, 2, 1)) == [3, 1, 2]       # express core first, doesn't use core limit
assert nums(r.select([I(1, ["in-progress", "core"]), I(2, ["in-progress", "core"]), _e(3, ["core"]), _c(4)], 3, 2, 1)) == [3]   # express core despite max_core
assert nums(r.select([_e(1, ["pack", "blocked"]), _e(2, ["pack"], )], 3, 2, 1)) == [2]
assert r.CFG["express_lanes"] >= 1
print("ok express")

# runner must not call "python3" directly: on Windows it is only a bash shim / Store alias -> FileNotFoundError after every CI merge (#79, #72, #41)
assert '["python3"' not in (r.HERE / "runner.py").read_text(encoding="utf-8")
print("ok no-python3")
# #65: model from the issue's model:* label
assert r.model_of([]) == "sonnet" and r.model_of(["pack", "P1"]) == "sonnet"     # no label = config default
assert r.model_of(["model:opus"]) == "opus" and r.model_of(["model:haiku", "pack"]) == "haiku"
assert r.model_of(["model:bogus"]) == "sonnet"
assert r.model_of(["model:fable"]) == "claude-fable-5-2"
assert r.model_of(["model:sonnet", "model:opus"]) == "opus"                      # most capable wins if two labels
assert r.reviewer_model(["model:opus"]) == "opus"
assert r.reviewer_model(["model:haiku"]) == r.reviewer_model([]) == r.reviewer_model(["model:fable"]) == "opus"   # #714: always opus
# #714: floors(role, model, effort, labels) table
assert r.floors("reviewer", "sonnet", None, []) == ("opus", "medium")
assert r.floors("reviewer", "sonnet", "low", []) == ("opus", "medium")
assert r.floors("reviewer", "sonnet", "medium", ["model:opus"]) == ("opus", "high")
assert r.floors("reviewer", "sonnet", None, ["effort:xhigh"]) == ("opus", "high")
assert r.floors("worker", "sonnet", "low") == ("sonnet", "medium")
assert r.floors("worker", "haiku", "high") == ("sonnet", "high") and r.floors("resolver", "haiku")[0] == "sonnet"
assert r.floors("dashboard_ai", "haiku", None) == ("haiku", "medium") and "dashboard_ai" in r.STATUS_ROLES
assert r.floors("resolver", "sonnet") == ("sonnet", "medium") and r.floors("resolver", "opus") == ("opus", "medium")
assert r.floors("tester", None)[0] == "sonnet"
assert r.model_name(["model:fable"]) == "fable" and r.model_name([]) == "sonnet"
# #713: effort label -> level; default medium; never below medium; most capable wins
assert r.effort_of([]) == "medium" and r.effort_of(["pack", "P1"]) == "medium"
assert r.effort_of(["effort:high"]) == "high" and r.effort_of(["effort:xhigh", "model:opus"]) == "xhigh"
assert r.effort_of(["effort:medium", "effort:high"]) == "high"
assert r.effort_of(["effort:low"]) == "medium" and r.effort_of(["effort:bogus"]) == "medium"
assert r.raise_effort("low") == "medium" and r.raise_effort(None) == "medium" and r.raise_effort("max") == "max"
print("ok model labels")

# #133: remote lanes (local_lanes / remote_lanes), remote worker start, results from GitHub
assert r.CFG["local_lanes"] == 0 and r.CFG["remote_lanes"] >= 1 and "max_parallel" not in r.CFG
assert r.total_lanes() == r.CFG["local_lanes"] + r.CFG["remote_lanes"]   # count set by the owner / usage governor (#239)
ch = [I(1, [R, "pack"]), I(2, [R, "pack"]), I(3, [R, "pack"])]
assert [(i["number"], w) for i, w in r.assign_where(ch, 0, 0, 1, 4)] == [(1, "local"), (2, "remote"), (3, "remote")]
assert [(i["number"], w) for i, w in r.assign_where(ch, 1, 0, 1, 4)] == [(1, "remote"), (2, "remote"), (3, "remote")]   # local busy -> remote
assert [(i["number"], w) for i, w in r.assign_where(ch, 1, 3, 1, 4)] == [(1, "remote")]                                 # one remote slot left
assert r.assign_where(ch, 1, 4, 1, 4) == []                                                                              # all busy
ex = [{"number": 9, "labels": ["express"]}]
assert [(i["number"], w) for i, w in r.assign_where(ex, 1, 4, 1, 4)] == [(9, "remote")]   # #72: express beyond the cap still gets a slot
assert [(i["number"], w) for i, w in r.assign_where(ex, 1, 0, 1, 0)] == [(9, "local")]    # no remote lanes: local
assert r.assign_where([{"number": 9, "labels": []}], 1, 4, 1, 4) == []                    # a normal issue still waits
assert [(i["number"], w) for i, w in r.assign_where(ch, 0, 0, 1, 0)] == [(1, "local")]                                  # no remote lanes configured
p = r.remote_worker_prompt(7, "core", bug=True)
assert "#7" in p and "lane/7" in p and "FLOW.md" in p and "Fixes #7" in p and "gh issue comment 7" in p
assert "RESULT: DONE" in p and "QUESTION:" in p and "diagnosing-bugs" in p
assert "diagnosing-bugs" not in r.remote_worker_prompt(7, "core")
# #297: the cloud prompt ENDS with the mandatory RESULT comment step
assert "LAST STEP (mandatory)" in p and p.rstrip().endswith("not finished until that comment is on the issue.") and p.rindex("RESULT: DONE <PR url>") > p.rindex("gh pr create"), p
# #219: Batch:/spec issues follow implement-spec (local and cloud prompts)
assert "implement-spec.md" in r.remote_worker_prompt(7, "core") and "Batch:" in r.remote_worker_prompt(7, "core") and "spec" in r.worker_prompt(7, "core")
assert "implement-spec.md" in r.worker_prompt(7, "core")
for p in (r.worker_prompt(7, "pack"), r.remote_worker_prompt(7, "pack")):   # #187: new tests go into an existing suite, a new suite gets a budget line
    assert "existing suite unless a new one is clearly needed" in p and "oren2/tests/budget.txt" in p
assert "docs/agents/skills/diagnosing-bugs.md" in r.remote_worker_prompt(7, "core", bug=True) and "docs/agents/skills/diagnosing-bugs.md" in r.worker_prompt(7, "core", bug=True)
import recover as _rc; assert "docs/agents/skills/writing-for-agents.md" in _rc.INBOX_PROMPT
print("ok #219 skill docs")
# wait_remote polls GitHub state (no herdr screen) until a final state
seq = iter([{"state": "working"}, {"state": "working"}, {"state": "done", "line": "RESULT: DONE x", "pr": {"number": 9}}])
t = [0]
def sl(s): t[0] += s
res = r.wait_remote(lambda: next(seq), sl, lambda: t[0], 3600, 30)
assert res["state"] == "done" and t[0] == 60
t[0] = 0
res = r.wait_remote(lambda: {"state": "working"}, sl, lambda: t[0], 100, 30)
assert res["state"] == "timeout"
assert r.wait_remote(lambda: {"state": "question", "line": "QUESTION: a or b?"}, sl, lambda: 0, 100, 30)["state"] == "question"
# a started remote issue records where=remote in stats
import json as _j
r.RUNS = r.HERE / ".runs-test133"
r.stat(5, "core", "start", where="remote")
ev = _j.loads((r.RUNS / "stats.jsonl").read_text().splitlines()[-1]); assert ev["where"] == "remote"
import shutil as _sh; _sh.rmtree(r.RUNS)
# remote_worker(): start via remote.py, poll GitHub, map to RESULT line; fake remote + fake gh
calls = []
def fake_start(n, task, cwd): calls.append(("start", n, task)); return {"ok": True, "session": "session_x", "url": "https://claude.ai/code/session_x"}
res = r.remote_worker(7, "pack", False, fake_start, lambda: {"state": "done", "line": "RESULT: DONE https://p", "pr": {"number": 3}}, lambda s: None, lambda: 0, 60, 30)
assert res == "RESULT: DONE https://p" and calls[0][0] == "start" and calls[0][1] == 7 and "lane/7" in calls[0][2]
try: r.remote_worker(7, "pack", False, lambda n, t, cwd: {"ok": False, "error": "403"}, lambda: {"state": "working"}, lambda s: None, lambda: 0, 60, 30); assert False, "no Refused"
except r.Refused as e: assert "403" in str(e)                       # #137: a refused start is not STUCK: the caller falls back / waits
res = r.remote_worker(7, "pack", False, fake_start, lambda: {"state": "question", "line": "QUESTION: x?"}, lambda s: None, lambda: 0, 60, 30)
assert res == "QUESTION: x?"
kept = []
r.remote_worker(7, "pack", False, fake_start, lambda: {"state": "done", "line": "RESULT: DONE"}, lambda s: None, lambda: 0, 60, 30, on_start=kept.append)
assert kept and kept[0]["session"] == "session_x"                  # #134: the session id is kept for the FIX round
print("ok remote lanes")

# #134: remote reviewer = a cloud session; its VERDICT comes from a PR comment
_rp = r.remote_review_prompt(7, 9, "button crashes")
assert "PR #9" in _rp and "#7" in _rp and "gh pr comment 9" in _rp and "gh pr diff 9" in _rp and "own line" in _rp
assert "VERDICT: PASS-NOTES" in _rp and "VERDICT: PURPLE" in _rp and "RED" in _rp and "button crashes" in _rp   # same four colours + round-2 rule
assert "C:/work" not in _rp and "Change NO files" in _rp                                                           # cloud: no local paths, read-only
starts = []
def _st(n, task, cwd): starts.append(task); return {"ok": True, "session": "session_rv", "url": "https://claude.ai/code/session_rv"}
seq = iter([{"state": "working"}, {"state": "done", "line": "VERDICT: FIX no test", "body": "x\nVERDICT: FIX no test\n"}])
assert r.remote_review(7, 9, "", _st, lambda: next(seq), lambda s: None, lambda: 0, 3600, 60) == ("x\nVERDICT: FIX no test\n", "VERDICT: FIX no test")
assert "gh pr comment 9" in starts[-1]
rv, v = r.remote_review(7, 9, "", lambda n, t, c: {"ok": False, "error": "403"}, lambda: {"state": "working"}, lambda s: None, lambda: 0, 60, 30)
assert v == "" and "403" in rv
# #322: a cloud reviewer that fails to start is retried after 60 s, then 300 s; then no verdict with the real error
_sl, _n = [], [0]
def _flaky(n, t, c):
    _n[0] += 1
    return {"ok": False, "error": "Cloud session create failed: timeout of 15000ms exceeded"} if _n[0] == 1 else _st(n, t, c)
rv, v = r.remote_review(7, 9, "", _flaky, lambda: {"state": "done", "line": "VERDICT: PASS", "body": ""}, _sl.append, lambda: 0, 60, 30)
assert v == "VERDICT: PASS" and _n[0] == 2 and _sl == [60], (rv, v, _n, _sl)     # fails once, then succeeds -> review runs
_sl, _n = [], [0]
def _dead(n, t, c): _n[0] += 1; return {"ok": False, "error": "timeout of 15000ms exceeded"}
rv, v = r.remote_review(7, 9, "", _dead, lambda: {"state": "working"}, _sl.append, lambda: 0, 60, 30)
assert v == "" and _n[0] == 3 and _sl == [60, 300], (_n, _sl)
assert "timeout of 15000ms exceeded" in rv and "3 tries" in rv, rv                 # the real error for the orchestrator
t[0] = 0
rv, v = r.remote_review(7, 9, "", _st, lambda: {"state": "working"}, sl, lambda: t[0], 120, 60)
assert v == "" and "no VERDICT" in rv                                                # silent reviewer -> no verdict -> runner blocks
assert r.parse_verdict(r.remote_review(7, 9, "", _st, lambda: {"state": "done", "line": "VERDICT: PURPLE a or b? merge-safe", "body": ""},
                                       lambda s: None, lambda: 0, 60, 30)[1]) == ("purple", "a or b?", "merge-safe")
# FIX: sent to the worker's session; send fails / no session -> a new cloud fix session (with the branch to check out)
sent, starts[:] = [], []
done = lambda: {"state": "done", "line": "RESULT: DONE https://p"}
assert r.remote_fix(7, "session_w", "VERDICT: FIX no test", lambda s, x: sent.append((s, x)) or {"ok": True}, _st, done, lambda s: None, lambda: 0) == "RESULT: DONE https://p"
assert sent[0][0] == "session_w" and "no test" in sent[0][1] and "lane/7" in sent[0][1] and "RESULT: DONE" in sent[0][1] and not starts
kept = []
assert r.remote_fix(7, "session_w", "FIX x", lambda s, x: {"ok": False}, _st, done, lambda s: None, lambda: 0, on_start=kept.append) == "RESULT: DONE https://p"
assert len(starts) == 1 and "git checkout lane/7" in starts[0] and kept[0]["session"] == "session_rv"
assert r.remote_fix(7, "", "FIX x", lambda s, x: 1 / 0, _st, done, lambda s: None, lambda: 0) == "RESULT: DONE https://p"   # no session: no send
assert r.remote_fix(7, "", "FIX x", None, lambda n, t, c: {"ok": False, "error": "limit"}, done, lambda s: None, lambda: 0).startswith("RESULT: STUCK")
t[0] = 0
assert "silent" in r.remote_fix(7, "s", "FIX x", lambda s, x: {"ok": True}, _st, lambda: {"state": "working"}, sl, lambda: t[0], 120, 60)
assert r.remote_fix(7, "s", "FIX x", lambda s, x: {"ok": True}, _st, lambda: {"state": "question", "line": "QUESTION: a?"}, sl, lambda: 0) == "QUESTION: a?"
# process_locked: remote issues use the cloud reviewer and cloud fix; local ones keep the herdr agent
_pl = (r.HERE / "runner.py").read_text(encoding="utf-8").split("def process_locked", 1)[1].split("def close_windows", 1)[0]
assert "fresh_remote().review_status(pr, since=since)" in _pl and "remote_fix(" in _pl and 'agent(f"review-{n}"' in _pl
assert _pl.index('if where == "remote": prep_worktree()') > _pl.index("remote_fix(")          # worktree made after the last cloud fix
print("ok #134 remote reviewer")
# #175: voice pregen runs in the background AFTER the merge lock, one at a time, never blocking an issue
import os as _os
class _P:
    def __init__(self, *a, **k): self.pid = _os.getpid(); _P.calls.append(a[0]); _P.kw = k
_P.calls = []
r.RUNS.mkdir(exist_ok=True); (r.RUNS / "pregen.lock").unlink(missing_ok=True)
_old = r.CFG.get("pregen"); _oldci = r.CFG.get("deploy_in_ci")
# #325: CI deploys + pregens, so the PC never does: 'off' unless deploy_in_ci = false AND pregen = true
r.CFG["pregen"] = True; r.CFG.pop("deploy_in_ci", None); assert r.start_pregen(popen=_P) == "off" and _P.calls == []
r.CFG["deploy_in_ci"] = True; assert r.start_pregen(popen=_P) == "off" and _P.calls == []
r.CFG["deploy_in_ci"] = False
# #325: under tests (OREN_TEST=1 or a temp RUNS) a real Popen is never used
assert os.environ.get("OREN_TEST") == "1" and r.start_pregen() == "off (test)" and _pregen_popens == []
os.environ.pop("OREN_TEST"); assert r.start_pregen() == "off (test)" and _pregen_popens == []   # RUNS is a temp dir
os.environ["OREN_TEST"] = "1"
assert r.start_pregen(popen=_P) == "started" and _P.calls == [r.pregen_cmd()]
# #325: no visible console: CREATE_NO_WINDOW on Windows and never DETACHED_PROCESS (a detached node gives each child its own window)
assert _P.kw["creationflags"] & 0x00000008 == 0 and (_P.kw["creationflags"] & 0x08000000) == (r.no_window() & 0x08000000)
assert r.start_pregen(popen=_P) == "already running" and len(_P.calls) == 1      # lock holds our (live) pid
(r.RUNS / "pregen.lock").unlink(missing_ok=True)
r.CFG["pregen"] = False; assert r.start_pregen(popen=_P) == "off"
# #301: a pregen failure is a note, never a block: nothing in start_pregen may raise (lock check, log file, Popen)
r.CFG["pregen"] = True; (r.RUNS / "pregen.lock").unlink(missing_ok=True)
def _boom(*a, **k): raise TimeoutError("pregen.js 1800")
assert r.start_pregen(popen=_boom).startswith("failed:")
_hb = r.FileLock.held_by_other; r.FileLock.held_by_other = lambda self: _boom()
assert r.start_pregen(popen=_P).startswith("failed:")
r.FileLock.held_by_other = _hb
assert r.pregen_note("started") == "" and r.pregen_note("off") == "" and r.pregen_note("already running") == ""
assert r.pregen_note("failed: x").startswith(" Note: voice pregen did not start (failed: x)")
r.CFG["pregen"] = _old
if _oldci is None: r.CFG.pop("deploy_in_ci", None)
else: r.CFG["deploy_in_ci"] = _oldci
# #301: no code path waits on pregen: pregen_cmd is only used by the detached Popen, and its result only becomes a note
_src0 = (r.HERE / "runner.py").read_text(encoding="utf-8")
assert _src0.count("pregen_cmd()") == 2 and "(popen or subprocess.Popen)(pregen_cmd()" in _src0
assert "pre = start_pregen(log) if dep.startswith(\"deployed\") else \"\"" in _src0 and "{dep}.{pregen_note(pre)}" in _src0
_src = (r.HERE / "runner.py").read_text(encoding="utf-8")
_blk = _src.split('with FileLock("integrate", wait=True, note=f"#{n} deploy"):\n            stat(n, lane, "merged"', 1)[1].split("\n        m = sync_main", 1)[0]
assert "pregen.js" not in _src.split("def deploy_text", 1)[1].split("def pregen_cmd", 1)[0] and "start_pregen(log)" in _blk
print("ok pregen outside the merge lock")
# #166: merge straight on green; update the branch only on a real conflict; lock only around `gh pr merge`
assert r.needs_branch_update("CONFLICTING") and not r.needs_branch_update("MERGEABLE") and not r.needs_branch_update("UNKNOWN") and not r.needs_branch_update("")
_src = (r.HERE / "runner.py").read_text(encoding="utf-8")
_ci = _src.split("def ci_integrate", 1)[1].split("def find_pr_merged", 1)[0]
assert "needs_branch_update" in _ci and "FileLock" not in _ci          # #185: no lock for merging (GitHub merges); deploy keeps its lock
_ib = _src.split("def integrate():", 1)[1].split("rounds = [0]", 1)[0]
assert _ib.index("kind[\"ci\"] = rc == 6") < _ib.index("FileLock(\"integrate\"")   # CI path takes no lock; only the fallback does
print("ok #166 merge on green, lock only around gh pr merge")
# #181 merge lock watch: the lock says who/why/since; dead holders cleared; held > 20 min -> alarm
r.RUNS.mkdir(exist_ok=True)
_lk = r.FileLock("test181", note="#5 deploy"); _lk.path.unlink(missing_ok=True)
with _lk:
    _i = _lk.info()
    assert _i[0] == _os.getpid() and _i[1] == "#5 deploy" and abs(_i[2] - __import__("time").time()) < 5, _i
assert _lk.info() is None
_lk.path.write_text("999999999", encoding="utf-8")                      # old pid-only file, dead pid
assert _lk.info()[:2] == (999999999, "") and not _lk.held_by_other()
_lk.path.unlink(missing_ok=True)
_t = 10_000.0
assert W.lock_alarm(None, True, _t) is None
assert W.lock_alarm((7, "#1 CI merge", _t - 5 * 60), True, _t) is None                   # 5 min: fine
_a = W.lock_alarm((7, "#122 deploy", _t - 31 * 60), True, _t, [167, 176])
assert _a[0] == "alarm" and "31 min" in _a[1] and "#122 deploy" in _a[1] and "#167, #176" in _a[1], _a
assert W.lock_alarm((7, "#1 CI merge", _t - 60), False, _t)[0] == "clear"
print("ok merge lock watch")

# #149: four review colours. GREEN pass / BLUE pass-with-notes / PURPLE owner question / RED fix
assert r.parse_verdict("VERDICT: PASS") == ("pass", "", "")
assert r.parse_verdict("VERDICT: PASS-NOTES rename x; add test y") == ("notes", "rename x; add test y", "")
assert r.parse_verdict("VERDICT: FIX button crashes: no test") == ("fix", "button crashes: no test", "")
assert r.parse_verdict("VERDICT: PURPLE should Oren hear a or b? merge-safe") == ("purple", "should Oren hear a or b?", "merge-safe")
assert r.parse_verdict("VERDICT: PURPLE should it speak? hold") == ("purple", "should it speak?", "hold")
assert r.parse_verdict("VERDICT: PURPLE should it speak?") == ("purple", "should it speak?", "hold")   # no flag: safe default = hold
assert r.parse_verdict("") == ("none", "", "") and r.parse_verdict("VERDICT: MAYBE") == ("none", "", "")
assert r.find_marker("● VERDICT: PURPLE a or b? hold\n", "VERDICT:") == "VERDICT: PURPLE a or b? hold"   # ' or ' in a question is fine for VERDICT
assert r.find_marker("❯ end with `VERDICT: PASS`, `VERDICT: PASS-NOTES <list>` ...\n", "VERDICT:") == ""
assert r.polish_lines("a; b ;", 5) == ["- a (PR #5)", "- b (PR #5)"]
assert r.polish_title("pack") == "Polish backlog (pack)"
# round 2 checks only the round-1 RED points; FIX only for RED reasons
_p = r.review_prompt(7, 9, round1="button crashes")
assert "button crashes" in _p and "ONLY" in _p
assert "VERDICT: PASS-NOTES" in r.review_prompt(7, 9) and "VERDICT: PURPLE" in r.review_prompt(7, 9) and "RED" in r.review_prompt(7, 9)
assert r.FIX_ROUNDS == 2          # one more fix round before blocking (2 fixes, 3 reviews)
print("ok #149")
# #149: no screenshots when no oren2/ file changed
assert "no oren2/ file changed" in r.worker_prompt(7, "pack", "") and "no oren2/ file changed" in r.review_prompt(7, 9)
print("ok skip screenshots")
# Code Mode trial: every 3rd issue number; 0 = off
_cm = r.CFG.get("code_mode_every")
r.CFG["code_mode_every"] = 3; assert [n for n in range(1, 10) if r.code_mode(n)] == [3, 6, 9]
r.CFG["code_mode_every"] = 0; assert not any(r.code_mode(n) for n in range(1, 10))
r.CFG["code_mode_every"] = _cm
assert '"CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1"] if code_mode(n)' in (r.HERE / "runner.py").read_text(encoding="utf-8")
print("ok code mode trial")
# batch skill: workers may use sub-agents; the worker prompt knows batch issues
assert "Agent" in r.WORKER_TOOLS
assert "Batch:" in r.worker_prompt(7, "core") and "sub-agents" in r.worker_prompt(7, "core")
assert (r.HERE.parent.parent / ".claude" / "skills" / "batch" / "SKILL.md").exists()
print("ok batch skill")
# #225 watch the checker: idle orchestrator + reviews waiting -> nudge, then escalate after 30 min
import calendar as _c2
_n = _c2.timegm((2026, 11, 26, 10, 0, 0, 0, 0, 0))
_g = [{"conclusion": "SUCCESS"}]
_prs = [{"number": 213, "statusCheckRollup": _g, "updatedAt": "2026-11-26T09:40:00Z"},                      # waits 20 min
        {"number": 214, "statusCheckRollup": _g, "updatedAt": "2026-11-26T09:55:00Z"},                      # 5 min: too new
        {"number": 215, "statusCheckRollup": _g, "updatedAt": "2026-11-26T09:00:00Z", "autoMergeRequest": {}},  # already set
        {"number": 216, "statusCheckRollup": [{"status": "IN_PROGRESS"}], "updatedAt": "2026-11-26T09:00:00Z"},  # not green
        {"number": 180, "isDraft": True, "statusCheckRollup": _g, "updatedAt": "2026-11-26T08:00:00Z"}]
assert W.waiting_reviews(_prs, _n) == [213], W.waiting_reviews(_prs, _n)
_st = {"nudged": 0.0, "first": 0.0, "escalated": 0.0}
assert W.orch_decision("working", [213], _st, _n) == "reset" and W.orch_decision("done", [], _st, _n) == "reset"
assert W.orch_decision("done", [213], _st, _n) == "nudge"
_st.update(nudged=_n, first=_n)
assert W.orch_decision("done", [213], _st, _n + 5 * 60) is None                 # nudged 5 min ago
assert W.orch_decision("done", [213], _st, _n + 11 * 60) == "nudge"
assert W.orch_decision("done", [213], _st, _n + 31 * 60) == "escalate"
_st["escalated"] = _n + 31 * 60
assert W.orch_decision("done", [213], _st, _n + 40 * 60) == "nudge"              # no second escalation within 2 h
print("ok watch the checker")
# #471: a PR whose issue has a live run-<n> is the runner's (it reviews/merges it): the #225 nudge must not list it
_ts = [{"name": "run-463", "state": "live"}, {"name": "run-500", "state": "finished"}, {"name": "run-470", "state": "live"},
       {"name": "issue-213", "state": "live"}]
_own = [{"number": 464, "headRefName": "lane/463", "body": ""},                                   # live run, lane branch
        {"number": 465, "headRefName": "claude/x-1", "body": "Fixes #470"},                       # live run, cloud branch + Fixes line
        {"number": 466, "headRefName": "lane/500", "body": "Fixes #500"},                         # run finished -> nobody owns it
        {"number": 213, "headRefName": "lane/213", "body": ""},                                   # no run-213 (only its issue window)
        {"number": 467, "headRefName": "claude/y", "body": "Fixes #4630"}]                         # #4630 is not #463
assert W.run_owned(_own, _ts) == {464, 465}, W.run_owned(_own, _ts)
assert W.run_owned(_own, _ts, parked={463}) == {465}                                              # parked/blocked run: back to the orchestrator
assert W.run_owned(_own, []) == set()
_calls = []
_saved = W.R.hc_json, W.R.gh, W.tell, W.windows
W.R.hc_json = lambda *a, **k: {"state": "live", "status": "done"}
W.R.gh = lambda *a, **k: (0, _json.dumps([dict(p, statusCheckRollup=_g, updatedAt="2026-11-26T09:00:00Z") for p in _own])) if a[:2] == ("pr", "list") else (0, "[]")
W.tell = lambda t: _calls.append(t)
W._orch.update(nudged=0.0, first=0.0, escalated=0.0)
try: W.orch_idle_tick(now=_n, ts=_ts)
finally: W.R.hc_json, W.R.gh, W.tell, W.windows = _saved
assert len(_calls) == 1 and "#466" in _calls[0] and "#213" in _calls[0] and "#464" not in _calls[0] and "#465" not in _calls[0], _calls
# #765: cloud run = no run-<n> window, but issue-<n>.lock held by a live pid -> PR not listed
assert W.run_owned(_own, _ts, locked={213}) == {464, 465, 213}, W.run_owned(_own, _ts, locked={213})
assert W.run_owned(_own, [], locked={500}) == {466} and W.run_owned(_own, [], locked={500}, parked={500}) == set()
import tempfile as _tf, os as _os
_runs0 = W.R.RUNS
W.R.RUNS = Path(_tf.mkdtemp())
(W.R.RUNS / "issue-213.lock").write_text(str(_os.getpid()) + "\n")       # live pid
(W.R.RUNS / "issue-466.lock").write_text("99999999\n")                    # dead pid
try: assert W.locked_issues() == {213}, W.locked_issues()
finally: W.R.RUNS = _runs0
print("ok #471 nudge skips PRs owned by a live run")
# #542: PRs only the owner merges (owner-merge / no-automerge) are not nudged; owner-merge open 12 h -> ONE owner note (owner_q)
_lb = lambda *ns: [{"name": x} for x in ns]
_om = [{"number": 531, "title": "CLAUDE.md rule", "labels": _lb("owner-merge"), "createdAt": "2026-11-25T20:00:00Z"},   # 14 h
       {"number": 532, "title": "keep", "labels": _lb("no-automerge"), "createdAt": "2026-11-25T20:00:00Z"},           # no note
       {"number": 533, "title": "young", "labels": _lb("owner-merge"), "createdAt": "2026-11-26T00:00:00Z"},           # 10 h: too new
       {"number": 534, "title": "normal", "labels": [], "createdAt": "2026-11-25T20:00:00Z"}]
assert W.waiting_reviews([dict(p, statusCheckRollup=_g, updatedAt="2026-11-26T09:00:00Z") for p in _om], _n) == [534]
assert W.owner_merge_due(_om, _n) == [(531, "CLAUDE.md rule")], W.owner_merge_due(_om, _n)
_calls, _notes = [], []
_saved = W.R.hc_json, W.R.gh, W.tell, W.windows, W.OQ.post
W.R.hc_json = lambda *a, **k: {"state": "live", "status": "done"}
W.R.gh = lambda *a, **k: (0, _json.dumps([dict(p, statusCheckRollup=_g, updatedAt="2026-11-26T09:00:00Z") for p in _om])) if a[:2] == ("pr", "list") else (0, "[]")
W.tell = lambda t: _calls.append(t)
W.OQ.post = lambda w, q, *a, **k: _notes.append((w, q)) or "url"
W._orch.update(nudged=0.0, first=0.0, escalated=0.0)
try:
    W.orch_idle_tick(now=_n, ts=[]); W.orch_idle_tick(now=_n + 3600, ts=[])
    W.R.hc_json = lambda *a, **k: {}                                            # orchestrator gone: the owner note still comes
    W.orch_idle_tick(now=_n + 1800, ts=[])
finally: W.R.hc_json, W.R.gh, W.tell, W.windows, W.OQ.post = _saved
assert _calls and all("#534" in c and "#531" not in c and "#532" not in c for c in _calls), _calls
assert _notes and set(_notes) == {("#531", "PR #531 waits for your merge: CLAUDE.md rule")}, _notes   # same key each time: owner_q posts it ONCE
print("ok #542 owner-merge PRs: no nudge, one owner note after 12 h")
# #185: GitHub auto-merge after PASS. mark() = `gh pr merge --auto --squash` (or a direct merge when GitHub says 'clean status');
# state() = merged|conflict|open from `gh pr view`. The runner only waits for MERGED, then deploys.
assert r.auto_refused_clean("GraphQL: Pull request Pull request is in clean status (enablePullRequestAutoMerge)")
assert not r.auto_refused_clean("auto-merge enabled") and not r.auto_refused_clean("")
assert r.pr_state('{"state":"MERGED","mergeable":"UNKNOWN"}') == "merged"
assert r.pr_state('{"state":"OPEN","mergeable":"CONFLICTING"}') == "conflict"
assert r.pr_state('{"state":"OPEN","mergeable":"MERGEABLE"}') == "open" and r.pr_state("not json") == "open"
def _am(seq, states, mark_res="auto", merge_ok=True, **kw):
    it, st, log = iter(seq), iter(states), []
    out = r.ci_merge(lambda: next(it), lambda: log.append("rerun"), lambda: log.append("merge") or merge_ok, lambda s: log.append("sleep"),
                     mark=lambda: log.append("mark") or mark_res, state=lambda: next(st), **kw)
    return out, log
assert _am([_ck("pending")], ["merged"]) == (("merged",), ["mark"])                          # GitHub merged it itself: no runner merge
assert _am([_ck("pending"), _ck("pass")], ["open", "merged"]) == (("merged",), ["mark", "sleep"])
assert _am([], [], mark_res="merged") == (("merged",), ["mark"])                              # 'clean status' -> direct merge inside mark
assert _am([], [], mark_res="conflict")[0] == ("conflict",)
assert _am([_ck("pending")], ["conflict"])[0] == ("conflict",)                                # main moved while waiting -> resolve path
assert _am([_ck("fail"), _ck("fail")], ["open", "open"])[0] == ("red", ["c0"])                # red after one rerun: back to the worker
assert _am([_ck("pass")] * 9, ["open"] * 9, grace=2)[1] == ["mark", "sleep", "sleep", "merge"] # auto set but GitHub idle: direct merge after a grace
assert _am([_ck("pass")], ["open"], mark_res=False)[1] == ["mark", "merge"]                   # mark failed: merge on green (old way)
assert _am([_ck("pending")] * 99, ["open"] * 99, timeout_s=60, poll_s=30)[0] == ("timeout",)
# order: --auto only after the review passed; a FIX verdict disables it; no lock around merging; failure disables auto
_src = (r.HERE / "runner.py").read_text(encoding="utf-8")
_ci = _src.split("def ci_integrate", 1)[1].split("def find_pr_merged", 1)[0]
assert '"--auto"' in _ci and "auto_refused_clean" in _ci and "disable_auto(pr, log)" in _ci and "FileLock" not in _ci
_proc = _src.split("verdict = \"\"; red = \"\"", 1)[1]
assert _proc.index('stat(n, lane, "review_pass", **me)') < _proc.index("ci_integrate(")
_fix = _proc.split('stat(n, lane, "review_fix", **me)', 1)[0].rsplit("if kind != \"fix\":", 1)[1]
assert "disable_auto(pr, log)" in _fix
assert '"--auto"' not in _src.split("def ci_integrate", 1)[0]                                 # nothing marks a PR before the review
print("ok #185 auto-merge after PASS")
assert r.merge_refusal('{"isDraft":false,"labels":[{"name":"core"}]}') == "" and r.merge_refusal('{"isDraft":true,"labels":[]}') == "PR is a draft"
assert "no-automerge" in r.merge_refusal('{"isDraft":false,"labels":[{"name":"no-automerge"}]}') and "blocked" in r.merge_refusal('{"isDraft":false,"labels":[{"name":"x"},{"name":"blocked"}]}')
assert r.merge_refusal("not json")                                                           # unreadable state: refuse
def _ci_int(pr_json, auto_rc=(0, "ok"), sha="abc123"):
    calls = []
    def g(*a, **k):
        calls.append(a)
        if a[:2] == ("pr", "view"):
            return (0, pr_json) if any(str(x).startswith("isDraft,labels") for x in a) else (0, "MERGEABLE") if "mergeable" in a else (0, '{"state":"OPEN","mergeable":"MERGEABLE"}')
        if a[:2] == ("pr", "checks"): return 0, '[{"name":"tests","bucket":"pass"}]'
        if a[:2] == ("pr", "merge") and "--auto" in a: return auto_rc
        return 0, ""
    saved = r.gh, r.run, r.remote.pr_for, r.remote.pr_where, r.time.sleep
    r.gh, r.run, r.remote.pr_for, r.remote.pr_where, r.time.sleep = g, (lambda *a, **k: (0, "")), (lambda n, run=None, state="open": (251, "claude/x")), (lambda n, run=None, state="open", repo=None: (251, "claude/x", r.REPO)), (lambda s: None)
    try: res = r.ci_integrate(185, "wt", None, None, sha)
    finally: r.gh, r.run, r.remote.pr_for, r.remote.pr_where, r.time.sleep = saved
    return res, calls
_ok = '{"isDraft":false,"labels":[]}'
_res, _c = _ci_int(_ok)
assert _res[0] == 0 and ("pr", "merge", "251", "--auto", "--squash", "--match-head-commit", "abc123") in [tuple(x[:7]) for x in _c]
_res, _c = _ci_int(_ok, auto_rc=(1, "Pull request is in clean status"))                        # clean status -> direct merge, still tied to the head
assert _res[0] == 0 and any(x[:4] == ("pr", "merge", "251", "--squash") and x[4:6] == ("--match-head-commit", "abc123") for x in _c)
for _bad in ('{"isDraft":true,"labels":[]}', '{"isDraft":false,"labels":[{"name":"no-automerge"}]}', '{"isDraft":false,"labels":[{"name":"blocked"}]}'):
    _res, _c = _ci_int(_bad)
    assert _res[0] == 7 and not any("--auto" in x or "--squash" in x for x in _c) and ("pr", "merge", "251", "--disable-auto") in [tuple(x[:4]) for x in _c], _res
assert _ci_int(_ok, sha="")[0][0] == 7                                                        # no reviewed sha: never merge
print("ok #185 head-tied merge + draft/label guard")

# #636: PR #557 had blocked + no-automerge + owner-merge and its issue's owner gate was CLOSED, yet it was merged.
assert "owner-merge" in r.merge_refusal('{"isDraft":false,"labels":[{"name":"owner-merge"}]}')
assert r.pr_issues("Fixes #64\nFixes #70, closes #71. Refs #72 (see #99)") == [64, 70, 71, 72]
_gs = {64: "closed", 65: "open", 66: "none", 67: "error"}
assert "#64" in r.gate_refusal("Refs #64", _gs.get) and "CLOSED" in r.gate_refusal("Refs #64", _gs.get)
assert r.gate_refusal("Fixes #65\nFixes #66", _gs.get) == "" and r.gate_refusal("no refs", _gs.get) == ""
assert r.gate_refusal("Fixes #67", _gs.get), "unreadable gate: refuse"
assert "#64" in r.gate_refusal("Fixes #66\nFixes #64", _gs.get), "a batch PR: one closed member gate refuses"
_g0 = r.GATE
try:
    r.GATE = _gs.get
    for _bad in ('{"isDraft":false,"labels":[{"name":"owner-merge"}],"body":"Fixes #66"}',      # fake: owner-merge label -> no merge
                 '{"isDraft":false,"labels":[{"name":"blocked"}],"body":"Fixes #66"}',          # fake: blocked label -> no merge
                 '{"isDraft":false,"labels":[],"body":"Refs #64"}'):                            # fake: gate CLOSED -> no merge
        _res, _c = _ci_int(_bad)
        assert _res[0] == 7 and not any("--auto" in x or "--squash" in x for x in _c), (_bad, _res)
    _res, _c = _ci_int('{"isDraft":false,"labels":[],"body":"Fixes #65"}')                    # gate OPEN -> merges
    assert _res[0] == 0, _res
finally: r.GATE = _g0
# only the runner merges: no session prompt lets a Claude merge, and local agents may not run `gh pr merge`
_ps = [r.remote_worker_prompt(64, "pack"), r.worker_prompt(64, "pack"), r.remote_review_prompt(64, 557), r.review_prompt(64, 557),
       r.remote_fix_prompt(64, "FIX x"), r.ci_fix_prompt(64, []), r.resolve_prompt(64, []), r.remote_resolve_prompt(64, []),
       r.remote_resolve_prompt(64, [], ci=True), r.tester.prompt(64, 557, "T1", "u")]
for _p in _ps: assert r.NO_MERGE in _p, _p[:80]
# #808: no cloud prompt may make the owner's phone ask for an approval (Artifact tool, screenshots on public GitHub)
for _p in _ps: assert r.remote.NO_APPROVAL in _p, _p[:80]
assert "Artifact" in r.remote.NO_APPROVAL and "RESULT" in r.remote.NO_APPROVAL and "VERDICT" in r.remote.NO_APPROVAL and "public GitHub" in r.remote.NO_APPROVAL
assert "gh pr merge" in r.NO_MERGE and "Bash(gh pr merge:*)" in r.DENY_TOOLS
_sent = []
r.remote_resume(64, "pack", False, "s1", "yes", lambda s, t: _sent.append(t) or {"ok": True}, None,
                lambda: {"state": "done", "line": "RESULT: DONE x"}, lambda s: None, lambda: 0)
assert _sent and r.NO_MERGE in _sent[0], "#557: the answer relay to the resumed session forbids merging"
assert r.remote.NO_APPROVAL in _sent[0], "#808: the answer relay carries the no-approval rule"
_ag = _src.split("def agent(", 1)[1].split("\ndef ", 1)[0]
assert '"--disallowedTools", *DENY_TOOLS' in _ag
# the orchestrator's hand merge goes through the same guard: tools/runner/merge.py <pr>
import merge as _M
def _mg(js, gate="none"):
    calls = []
    def g(*a, **k):
        calls.append(a)
        return (0, js) if a[:2] == ("pr", "view") else (0, "")
    _M.R.gh, _g1, _G1 = g, _M.R.gh, _M.R.GATE
    _M.R.GATE = lambda n: gate
    try: rc = _M.main(["557"])
    finally: _M.R.gh, _M.R.GATE = _g1, _G1
    return rc, [x for x in calls if x[:2] == ("pr", "merge")]
assert _mg('{"isDraft":false,"labels":[{"name":"blocked"}],"body":"Refs #64"}') == (1, [])
assert _mg('{"isDraft":false,"labels":[],"body":"Refs #64"}', "closed") == (1, [])
_rc, _m = _mg('{"isDraft":false,"labels":[],"body":"Refs #64"}', "open")
assert _rc == 0 and _m == [("pr", "merge", "557", "--auto", "--squash")], _m
print("ok #636 merge guard: labels, owner gate, no session merges")

# #246: the runner finds a cloud worker's claude/* PR and uses its branch wherever lane/<n> was hard-coded
import json as _js
_CL = "claude/github-issue-236-u7l8gj"
def _fake_run(cmd, cwd=None, env=None, input=None, log=None, timeout=None):
    line = " ".join(map(str, cmd))
    if "--head lane/236" in line: return 0, "[]"
    if "issue view 236" in line: return 0, _js.dumps({"comments": [{"body": "Runner: started (pack lane, remote)"}, {"body": "RESULT: DONE https://github.com/igalgerman/oren_study/pull/243"}]})
    if "pr view 243" in line: return 0, _js.dumps({"number": 243, "headRefName": _CL, "state": "OPEN"})
    return 0, "[]"
_run0 = r.run; r.run = _fake_run
try:
    assert r.find_pr(236) == 243 and r.branch_of(236) == _CL and r.find_pr_merged(236) is False
finally:
    r.run = _run0
for _p in (r.ci_fix_prompt(236, ["tests"], _CL), r.resolve_prompt(236, ["a.js"], _CL), r.remote_fix_prompt(236, "FIX x", _CL)):
    assert _CL in _p and "lane/236" not in _p, _p
assert "lane/7" in r.ci_fix_prompt(7, []) and "lane/7" in r.resolve_prompt(7, []) and "lane/7" in r.remote_fix_prompt(7, "x")   # default: lane/<n>
_src = (r.HERE / "runner.py").read_text(encoding="utf-8")
_ci = _src.split("def ci_integrate", 1)[1].split("def find_pr_merged", 1)[0]
assert 'f"lane/{n}"' not in _ci and "f\"{REMOTE}/lane/{n}\"" not in _ci, "ci_integrate uses the PR's head branch"
_pl = _src.split("def process_locked", 1)[1].split("def close_windows", 1)[0]
assert '"tools/integrate.sh", f"lane/{n}"' not in _pl and "no open PR for lane/%d" not in _pl
print("ok #246 claude/* PR heads")
# #239 usage governor (pure)
from datetime import datetime as _dt, timezone as _tz
_iso = lambda t: _dt.fromtimestamp(t, _tz.utc).isoformat()
_now = 1_800_000_000.0
import time as _time_mod
_G = {"stale_s": 900}
def _u(pct, reset_h, week=None, week_reset_h=24 * 6, age=60):
    return {"five_h_pct": pct, "five_h_reset": _iso(_now + reset_h * 3600), "week_pct": week, "week_reset": _iso(_now + week_reset_h * 3600), "at": _iso(_now - age)}
def _ux(week, H, age=60): return {"five_h_pct": None, "week_pct": week, "week_reset": _iso(_now + H * 3600), "at": _iso(_now - age)}   # Ultra: week bucket only
# #712 owner override: only the lane count moves, inside the core's bounds
_g0 = r.governor(_ux(40, 80), [], _now, _G, busy=3, ready=9)
_o = lambda m, **k: r.override_make(m, _now, **k)
g = r.override_apply(_g0, _o("fast"), _now)[0]; assert g["lanes"] == _g0["n_hi"] == 12 and g["override"]["mode"] == "fast", g
_gs = r.governor(_ux(98, 80), [], _now, _G, busy=3, ready=9); assert _gs["stop"], _gs                      # W 98 >= week_stop: fast cannot start anything
g = r.override_apply(_gs, _o("fast"), _now)[0]; assert g["stop"] and g["lanes"] == _gs["lanes"], g
g, ex = r.override_apply(_g0, _o("fast"), _now + 3 * 3600 + 1); assert ex == "expired" and g["lanes"] == _g0["lanes"] and "override" not in g   # expiry -> normal
assert r.override_apply(_g0, _o("fast", until_reset=True), _now + 80 * 3600 + 1)[1] == "expired"
g = r.override_apply(_g0, _o("fast", until_reset=True), _now + 3600)[0]; assert g["lanes"] == 12 and g["override"]["until_reset"]
assert r.override_apply(_g0, _o("20"), _now)[0]["lanes"] == _g0["n_hi"]                                    # lanes 20 -> clamped to N_hi
assert r.override_apply(_g0, _o("2"), _now)[0]["lanes"] == 2
g = r.override_apply(_g0, _o("save"), _now)[0]; assert g["lanes"] == max(_g0["n_lo"], round(0.6 * _g0["n_week"])) < _g0["n_hi"], g
for m in ("fast", "save", "5", "normal"):                                                                  # models and efforts are never touched
    g = r.override_apply(_g0, _o(m), _now)[0]; assert {k: v for k, v in g.items() if k not in ("lanes", "why", "override")} == {k: v for k, v in _g0.items() if k not in ("lanes", "why")}, m
assert r.override_make("bogus", _now) is None and r.parse_for("3h") == 10800 and r.parse_for("90m") == 5400 and r.parse_for("x") is None
assert "mode FAST until" in r.governor_text(r.override_apply(_g0, _o("fast"), _now)[0])
print("ok #712 owner override")
# #705 even pacing: 80h left, week 40%, 3 busy lanes, 9 ready -> need (94-40-0.3)/80-0.1 = 0.57 %/h -> ~3 lanes
g = r.governor(_ux(40, 80), [], _now, _G, busy=3, ready=9); assert g["lanes"] == 3 and g["mode"] == "week-only" and abs(g["need"] - 0.5712) < 0.001 and g["n_hi"] == 12, g
t = r.governor_text(g); assert t == "governor: 3 lanes: week 40%, behind pace (need 0.6%/h), 9 ready, reserve 5% · b̂ 0.20%/h (prior) · p 0.24 budget: tight, fewer lanes", t
# ahead of pace -> fewer lanes; behind -> more
lo = r.governor(_ux(80, 80), [], _now, _G, busy=3, ready=9)["lanes"]; hi = r.governor(_ux(20, 80), [], _now, _G, busy=3, ready=9)["lanes"]
assert lo < 3 < hi, (lo, hi)
g = r.governor(_ux(80, 80), [], _now, _G, busy=3, ready=9); assert "ahead of pace" in g["why"], g
assert r.governor(_ux(94, 80), [], _now, _G, busy=3, ready=9)["lanes"] == 0                  # no budget left (need < 0) and N_lo 0
# 1% used with 6 h left (and plenty of work): N_hi; only L + Q or the ceiling bounds it
g = r.governor(_ux(1, 6), [], _now, _G, busy=2, ready=20); assert g["lanes"] == 16 == g["n_hi"], g
g = r.governor(_ux(1, 6), [], _now, _G, busy=2, ready=3); assert g["lanes"] == 5 == g["n_hi"], g                 # L + Q
assert r.governor(_ux(1, 6), [], _now, _G, busy=2, ready=0)["lanes"] == 2                                         # no work: N_lo 0, N_hi = L
assert r.governor(_ux(1, 6), [], _now, {"ceiling": 4}, busy=0, ready=20)["lanes"] == 4
# the owner reserve is released over the last 12 h
_gg = {**r.GOV, "stale_s": 900}
assert [round(r.reserve_at(h, _gg), 3) for h in (200, 12, 6.5, 1, 0.2)] == [5, 5, 2.5, 0, 0]
n12, p12 = r.lane_plan(70, 12, None, None, 0, 20, None, _gg); n6, p6 = r.lane_plan(70, 6, None, None, 0, 20, None, _gg)
assert p12["c"] == 94 and abs(p6["c"] - (99 - 5 * 5 / 11)) < 1e-9 and p6["need"] > (94 - 70) / 6 - 0.1, (p12, p6)
# 5h bucket (5h+week): N_5h is a cap, never a goal: 5h 50% with 2 h left: (97-50)/(8*0.2*2) = 14.7 -> not binding; 90% -> 4.4 h-> binding
assert r.governor(_u(50, 2, week=1, week_reset_h=6), [], _now, _G, busy=2, ready=20)["lanes"] == 14
g = r.governor(_u(90, 4, week=1, week_reset_h=6), [], _now, _G, busy=2, ready=20); assert g["mode"] == "5h+week" and g["lanes"] == 1 and g["n_hi"] < 2, g
g = r.governor(_u(20, 4, week=1, week_reset_h=6), [], _now, _G, busy=2, ready=20); assert g["lanes"] == 12 and g["pct"] == 20, g
assert " · 5h 20% (cap 97%)" in r.governor_text(g), r.governor_text(g)
# week-only: no 5h cap and no 5h stop even with a 5h value in an old shape of 99
g = r.governor(_ux(1, 6), [], _now, _G, busy=2, ready=20); assert g["pct"] is None and not g["stop"] and g["lanes"] == 16
# 5h stop (99) stays on the 5h+week plan
g = r.governor(_u(99, 1, week=1, week_reset_h=6), [], _now, _G, busy=2, ready=20); assert g["stop"] and "STOP" in r.governor_text(g) and "governor: 0 lanes" in r.governor_text(g)
assert not r.governor(_u(92.9, 0.1, week=1, week_reset_h=6), [], _now, _G, busy=2, ready=20)["stop"]
# noisy readings: at most +-2 lanes per pass, hysteresis 0.6: a pace series of 12 passes (3 h) changes the count at most twice
_prev, _chg, _ln = 3, 0, []
for _k, _w in enumerate([40, 40.6, 40.4, 41.0, 40.9, 41.6, 41.5, 42.0, 42.2, 42.6, 42.5, 43.1]):
    _n = r.governor(_ux(_w, 80 - _k / 4), [], _now, _G, busy=_prev, ready=9, prev=_prev)["lanes"]
    _chg += _n != _prev; _prev = _n; _ln.append(_n)
assert _chg <= 2 and max(_ln) - min(_ln) <= 2, _ln
assert r.governor(_ux(1, 6), [], _now, _G, busy=2, ready=20, prev=4)["lanes"] == 6                      # +2 per pass at most
assert r.governor(_ux(93, 20), [], _now, _G, busy=8, ready=20, prev=8)["lanes"] == 6                    # -2 per pass at most (the limit is far)
assert r.governor(_ux(1, 6), [], _now, _G, busy=2, ready=20, prev=16)["lanes"] == 16
# a plan (bucket kinds) change is logged once, by the pass
assert r.plan_mode(_u(5, 1, week=3)) == "5h+week" and r.plan_mode(_ux(3, 5)) == "week-only" and r.plan_mode(None) == "none"
assert r.plan_mode({"buckets": [{"kind": "five_hour", "pct": 1}, {"kind": "seven_day", "pct": 2}]}) == "5h+week" and r.plan_mode({"buckets": [{"kind": "seven_day", "pct": 2}]}) == "week-only"
assert r.plan_change("5h+week", "week-only") == "plan changed: 5h+week -> week-only" and r.plan_change("week-only", "week-only") is None and r.plan_change(None, "week-only") is None
_gb = r.governor({"buckets": [{"kind": "seven_day", "pct": 40, "reset": _iso(_now + 80 * 3600)}], "at": _iso(_now - 60)}, [], _now, _G, busy=3, ready=9); assert _gb["mode"] == "week-only" and _gb["lanes"] == 3, _gb
_gd = r.governor_pass(3, now=_now, ready=9)       # DRY: pure; the log line is written by a real pass
assert r.plan_change(r.governor(_u(5, 1, week=3), [], _now, _G)["mode"], r.governor(_ux(3, 5), [], _now, _G)["mode"]) == "plan changed: 5h+week -> week-only"
_cfg = open(os.path.join(os.path.dirname(r.__file__), "config.toml"), encoding="utf-8").read()
for _k in ("governor_min", "governor_max", "governor_week_cap", "governor_target", "governor_week_target", "governor_pace"): assert _k + " " not in _cfg and _k not in r.GOV, _k
for _k in ("governor_reserve = 5", "governor_reserve_release_h = 12", "governor_5h_cap = 97", "governor_ceiling = 16"): assert _k in _cfg, _k
assert (r.GOV["reserve"], r.GOV["release_h"], r.GOV["cap_5h"], r.GOV["ceiling"]) == (5, 12, 97, 16)
# replay of this week (simple model): week rises 0.40 %/h per lane + 0.15 %/h owner 08-23, from Thu 26 14:30 at 39%, reset Sat 17:00, one pass per 15 min,
# 5h bucket absent (Ultra), 20 ready issues: ends 97-99.5%, never 100% before the reset
_t0 = _dt(2026, 11, 26, 14, 30).timestamp(); _end = _dt(2026, 11, 28, 17, 0).timestamp(); _W, _L, _tt, _mx = 39.0, 3, _t0, 0
_pv = None
while _tt < _end:
    _gv = r.governor({"five_h_pct": None, "week_pct": _W, "week_reset": _iso(_end), "at": _iso(_tt - 60)}, [], _tt, _G, busy=_L, ready=20, prev=_pv)
    _pv = _gv["lanes"]; _L = 0 if _gv["stop"] else _pv
    _hr = _dt.fromtimestamp(_tt).hour
    _W += (0.40 * _L + (0.15 if 8 <= _hr < 23 else 0)) * 0.25; _mx = max(_mx, _W); _tt += 900
assert 97 <= _W <= 99.5 and _mx < 100, (_W, _mx)
# #709 burn-rate fit: synthetic week, b = 0.40 per weighted lane-hour, b0 = 0.15 %/h, k = 8 5h-% per week-%
_hs = []; _w = 30.0; _f = 0.0
for _i in range(24):                                  # 6 h of 15-min passes
    _m = {"sonnet": 1 + _i % 3, "opus": _i % 2}; _wl = r.weighted_lanes(_m)
    _hs.append({"at": _now - (24 - _i) * 900, "week": _w, "pct": _f, "reset": "R", "models": _m, "wlanes": _wl})
    _dw = (0.40 * _wl + 0.15) * 0.25; _w += _dw; _f += 8 * _dw
assert r.weighted_lanes({"sonnet": 2, "opus": 1, "haiku": 20, "fable": 1}) == 2 + 2 + 1 + 4
_ft = r.burn_fit(_hs, _now)
assert _ft["fit"] and abs(_ft["b"] - 0.40) < 0.04 and abs(_ft["b0"] - 0.15) < 0.015 and abs(_ft["k"] - 8) < 0.8, _ft
assert r.burn_fit(_hs[-6:], _now) == {"b": r.GOV["b"], "b0": r.GOV["b0"], "k": r.GOV["k"], "fit": False}      # < 2 h of data: the priors
assert r.burn_fit([], _now)["fit"] is False and r.burn_fit(_hs, _now + 8 * 3600)["fit"] is False           # nothing in the last 6 h
_gf = r.governor(_ux(40, 80), _hs, _now, {"stale_s": 900}, busy=3, ready=9); assert _gf["b"] == _ft["b"] and _gf["fit"], _gf       # governor() uses the fit
assert f"b̂ {_ft['b']:.2f}%/h" in r.governor_text(_gf) and "(prior)" not in r.governor_text(_gf)
print("ok #709 burn fit recovered", {k: round(v, 3) for k, v in _ft.items() if k != "fit"})
print("ok #705 governor: even pacing, bounds, reserve release, week-only, kind change, replay ends", round(_W, 1))
# #704 stale / missing reading: hold prev 30 min, then the floor (1); never remote_lanes (_G fallback 4 must not appear)
_old = _u(20, 4, age=16 * 60)
g = r.governor(_old, [], _now, _G, prev=6); assert g["lanes"] == 6 and g["why"] == "stale reading: hold" and g["stale_since"] == _now and not g["stop"], g
g = r.governor(_old, [], _now + 29 * 60, _G, prev=6, stale_since=_now); assert g["lanes"] == 6 and g["why"] == "stale reading: hold", g
g = r.governor(_old, [], _now + 30 * 60, _G, prev=6, stale_since=_now); assert g["lanes"] == 1 and g["why"] == "stale reading: floor" and not g["stop"], g
g = r.governor(None, [], _now, _G, prev=2); assert g["lanes"] == 2 and g["why"] == "stale reading: hold", g
g = r.governor({"at": "junk"}, [], _now, _G); assert g["lanes"] == 1 and g["why"] == "stale reading: floor", g          # nothing to hold: floor
g = r.governor(_u(20, 4, week=98, week_reset_h=24, age=16 * 60), [], _now + 3600, _G, prev=6, stale_since=_now, ); assert g["lanes"] == 0 and g["stop"], g   # no budget: N_lo 0
assert "stale reading" in r.governor_text(r.governor(None, [], _now, _G, prev=3))
# 5h 15% frozen 45 min with busy lanes -> stale; shorter / idle / value changed -> not stale
_fz = lambda n, busy=4, pct=15: [{"at": _now - 60 * m, "pct": pct, "reset": _iso(_now + 4 * 3600), "busy": busy} for m in range(n, -1, -5)]
_uf = _u(15, 4)
g = r.governor(_uf, _fz(45), _now, _G, prev=4); assert g["why"] == "stale reading: hold" and g["lanes"] == 4, g
assert r.governor(_uf, _fz(40), _now, _G, prev=4)["why"] != "stale reading: hold"
assert not r.governor(_uf, _fz(45, busy=0), _now, _G, prev=4)["why"].startswith("stale")
assert not r.governor(_u(16, 4), _fz(45), _now, _G, prev=4)["why"].startswith("stale")
assert r.governor(_u(15, 4, week=99.5), _fz(45), _now, _G, prev=4)["why"].startswith("limit hit")           # W >= 99: not stale
_ur = {**_uf, "read_at": _iso(_now - 46 * 60)}; assert r.governor(_ur, _fz(45), _now, _G, prev=4)["why"] == "stale reading: hold"   # read_at wins
assert not r.governor({**_uf, "read_at": _iso(_now - 5 * 60)}, _fz(45), _now, _G, prev=4)["why"].startswith("stale")
# week-only data (no five_h bucket) is not stale and never remote_lanes
g = r.governor({"five_h_pct": None, "week_pct": 40, "week_reset": _iso(_now + 3 * 86400), "at": _iso(_now - 60)}, [], _now, _G, prev=3, busy=3, ready=9)
assert g["mode"] == "week-only" and "stale_since" not in g and not g["stop"], g
g = r.governor({"five_h_pct": None, "week_pct": 40, "at": _iso(_now - 60)}, [], _now, _G); assert g["lanes"] == 1 and g["why"] == "no week usage: hold", g   # no week reset: floor 1
assert "fallback" not in r.GOV
# #269: the 5h reset is past -> a new window: pct 0, never stop
g = r.governor(_u(95, -0.05, week=1, week_reset_h=6), [], _now, _G, busy=2, ready=20); assert not g["stop"] and g["pct"] == 0 and "new 5h window" in g["why"] and g["reset"] > _now, g
g = r.governor(_u(99, 0.05, week=1, week_reset_h=6), [], _now, _G); assert g["stop"] and "STOP" in r.governor_text(g)   # reset still ahead -> stop per governor_stop
assert r.governor(_u(95, -0.05, age=16 * 60), [], _now, _G)["why"].startswith("stale reading")   # stale -> floor (#704)
# #269: on stop only express issues still start (below 100%); 100% -> nothing
_ch = [{"number": 1, "labels": ["core"]}, {"number": 2, "labels": ["express", "core"]}]
assert r.stop_filter(_ch, {"stop": False, "pct": 50}) == _ch
assert [c["number"] for c in r.stop_filter(_ch, {"stop": True, "pct": 95})] == [2]
assert r.stop_filter(_ch, {"stop": True, "pct": 100}) == []
print("ok governor")
# total_lanes follows a fresh governor.json (the watchdog uses it), else config
import json as _json, time as _time
(r.RUNS).mkdir(exist_ok=True)
(r.RUNS / "governor.json").write_text(_json.dumps({"lanes": 7, "stop": False, "at": _time.time()}))
assert r.total_lanes() == r.LOCAL_LANES + 7
(r.RUNS / "governor.json").write_text(_json.dumps({"lanes": 7, "stop": True, "at": _time.time()}))
assert r.total_lanes() == r.LOCAL_LANES
(r.RUNS / "governor.json").write_text(_json.dumps({"lanes": 7, "stop": False, "at": _time.time() - 3600}))
assert r.total_lanes() == r.LOCAL_LANES + r.REMOTE_LANES
# #269: a stop written before the 5h reset does not hold the lanes at 0 after it (the watchdog then starts a pass)
(r.RUNS / "governor.json").write_text(_json.dumps({"lanes": 7, "stop": True, "reset": _time.time() - 30, "at": _time.time()}))
assert r.total_lanes() == r.LOCAL_LANES + 7
(r.RUNS / "governor.json").write_text(_json.dumps({"lanes": 7, "stop": True, "reset": _time.time() + 600, "at": _time.time()}))
assert r.total_lanes() == r.LOCAL_LANES
(r.RUNS / "governor.json").unlink()
print("ok governor lanes")
# #245 efficiency = merged PRs per 10% of a 5h window; wasted runs per window; add lanes only while efficiency holds
_W1, _W2, _W3 = _now - 6 * 3600, _now - 3600, _now + 4 * 3600          # resets: two finished windows + the current one
_hh = [{"at": _W1 - 4 * 3600, "pct": 10, "reset": _iso(_W1), "busy": 2, "lanes": 2}, {"at": _W1 - 600, "pct": 40, "reset": _iso(_W1), "busy": 2, "lanes": 2},
       {"at": _W2 - 4 * 3600, "pct": 30, "reset": _iso(_W2), "busy": 4, "lanes": 4}, {"at": _W2 - 600, "pct": 80, "reset": _iso(_W2), "busy": 4, "lanes": 4},
       {"at": _now - 60, "pct": 10, "reset": _iso(_W3), "busy": 4, "lanes": 4}]
_ev = ([{"ts": _W1 - 3600 - k, "issue": 10 + k, "event": "merged"} for k in range(4)]                    # W1: 4 merged / 40% -> 1.00
       + [{"ts": _W2 - 3600 - k, "issue": 20 + k, "event": "merged"} for k in range(6)]                 # W2: 6 merged / 80% -> 0.75
       + [{"ts": _W2 - 100, "issue": 30, "event": e} for e in ("blocked", "ended", "retry", "parked", "start", "review_fix")]   # W2: 3 wasted
       + [{"ts": _now - 30, "issue": 40, "event": "merged"}, {"ts": _now - 20, "issue": 41, "event": "blocked"}])            # W3 (now)
_ws = r.gov_windows(_hh, _ev, _now)
assert [w["done"] for w in _ws] == [True, True, False], _ws
assert [w["used"] for w in _ws] == [40, 80, 10] and [w["merged"] for w in _ws] == [4, 6, 1] and [w["wasted"] for w in _ws] == [0, 3, 1], _ws
assert abs(_ws[0]["eff"] - 1.0) < 1e-9 and abs(_ws[1]["eff"] - 0.75) < 1e-9 and abs(_ws[2]["eff"] - 1.0) < 1e-9 and [w["lanes"] for w in _ws] == [2, 4, 4], _ws
assert r.gov_windows([{"at": _now - 60, "pct": 0.5, "reset": _iso(_W3)}], [], _now)[0]["eff"] is None   # < 1% used: no efficiency yet
assert r.gov_windows([], _ev, _now) == [] and r.gov_windows([{"at": _now, "pct": 5, "reset": None}], [], _now) == []
# add-lane rule: lanes went 2 -> 4 and efficiency dropped 1.00 -> 0.75 -> hold at the current count
n_, why_ = r.lane_gate(6, 4, _ws); assert n_ == 4 and "1.00 -> 0.75" in why_ and "2 -> 4" in why_, why_
assert r.lane_gate(3, 4, _ws) == (3, None) and r.lane_gate(4, 4, _ws) == (4, None)                      # fewer / same lanes: always
assert r.lane_gate(6, None, _ws) == (6, None)                                                            # no earlier count
_up = [dict(_ws[0]), {**_ws[1], "eff": 1.2}, _ws[2]]; assert r.lane_gate(6, 4, _up) == (6, None)          # efficiency held: add
_flat = [{**_ws[0], "lanes": 4}, _ws[1], _ws[2]]; assert r.lane_gate(6, 4, _flat) == (6, None)            # drop without more lanes: add
assert r.lane_gate(6, 4, _ws[1:]) == (6, None)                                                          # one finished window: too little data
# the governor applies the rule (projection follows the held count); a stop / fallback is unchanged
g = r.governor(_ux(1, 6), [], _now, _G, prev=4, wins=_ws, busy=4, ready=20); assert g["lanes"] == 4 and "hold 4" in g["why"], g
assert r.governor(_ux(1, 6), [], _now, _G, prev=4, wins=_up, busy=4, ready=20)["lanes"] == 6
assert r.governor(None, [], _now, _G, prev=2, wins=_ws)["lanes"] == 2          # #704 stale: hold
# shown on the panel and dashboard (both print governor.json's text)
t = r.eff_text(_ws); assert t == " · efficiency 1.00 merged/10% (last 0.75) · wasted 1 (last 3)", t
assert r.eff_text([]) == "" and r.eff_text([{**_ws[2], "eff": None}]) == " · efficiency - · wasted 1", r.eff_text([{**_ws[2], "eff": None}])
# governor_pass: reads stats.jsonl, keeps 'lanes' in the samples, logs the reason of each lane change
_dry = r.DRY; r.DRY = False
(r.RUNS / "usage.json").write_text(_json.dumps({**_u(5, 1, week=1, week_reset_h=6), "at": _iso(_time.time() - 30), "five_h_reset": _iso(_time.time() + 3600), "week_reset": _iso(_time.time() + 6 * 3600)}))
(r.RUNS / "governor.json").write_text(_json.dumps({"lanes": 3, "stop": False, "at": _time.time()}))
(r.RUNS / "stats.jsonl").write_text("")
(r.RUNS / "usage_hist.jsonl").write_text("")
g = r.governor_pass(2)
_log = (r.RUNS / "runner.log").read_text(encoding="utf-8")
assert f"governor: lanes 3 -> {g['lanes']} (" in _log and g["lanes"] != 3, _log
assert _json.loads((r.RUNS / "usage_hist.jsonl").read_text().splitlines()[-1])["lanes"] == g["lanes"]
assert " · efficiency " in _json.loads((r.RUNS / "governor.json").read_text())["text"]
_gj = _json.loads((r.RUNS / "governor.json").read_text()); assert _gj["wasted"] == 0 and "eff" in _gj and "eff_last" in _gj, _gj   # #245 fields for the panel
assert r.eff_fields(_ws) == {"eff": 1.0, "wasted": 1, "eff_last": 0.75, "wasted_last": 3} and r.eff_fields([]) == {"eff": None, "wasted": 0, "eff_last": None, "wasted_last": None}
(r.RUNS / "usage.json").write_text(_json.dumps({**_u(5, 1, week=97.5, week_reset_h=6), "at": _iso(_time.time() - 30), "five_h_reset": _iso(_time.time() + 3600), "week_reset": _iso(_time.time() + 6 * 3600)}))
(r.RUNS / "governor.json").write_text(_json.dumps({"lanes": 0, "stop": False, "at": _time.time()}))
n_log = _log.count("governor: lanes"); r.governor_pass(2)                                                # no change -> no new line
assert (r.RUNS / "runner.log").read_text(encoding="utf-8").count("governor: lanes") == n_log
# #705: a change of the bucket kinds (5h+week -> week-only) is logged once, in the pass that sees it
(r.RUNS / "usage.json").write_text(_json.dumps({"five_h_pct": None, "week_pct": 1, "at": _iso(_time.time() - 30), "week_reset": _iso(_time.time() + 6 * 3600)}))
r.governor_pass(2); r.governor_pass(2)
assert (r.RUNS / "runner.log").read_text(encoding="utf-8").count("governor: plan changed: 5h+week -> week-only") == 1
r.DRY = _dry
for _f in ("usage.json", "governor.json", "stats.jsonl", "usage_hist.jsonl"): (r.RUNS / _f).unlink()
print("ok #245 efficiency governor")
# #234: a run ends as DONE when its issue is closed or its lane PR is merged elsewhere (every wait loop checks, one gh call per poll)
_S0 = "2026-11-26T12:00:00Z"                         # run start
assert r.run_over("CLOSED", [], _S0) and r.run_over("OPEN", ["2026-11-26T12:30:00Z"], _S0)
assert not r.run_over("OPEN", [], _S0) and not r.run_over("", [], _S0) and not r.run_over(None, None, _S0)
assert not r.run_over("OPEN", ["2026-11-20T09:00:00Z"], _S0)          # reopened issue: lane/<n> PR merged BEFORE this run -> keep working
assert not r.run_over("OPEN", [None], _S0)
def _gq_(state, merged): return _j.dumps({"data": {"repository": {"issue": {"state": state}, "pullRequests": {"nodes": [{"mergedAt": m} for m in merged]}}}})
_calls = []
def _fr(out, rc=0):
    def f(cmd, **kw): _calls.append(cmd); return rc, out
    return f
assert r.issue_over(7, _S0, run_=_fr(_gq_("CLOSED", []))) and r.issue_over(7, _S0, run_=_fr(_gq_("OPEN", ["2026-11-26T13:00:00Z"])))
assert not r.issue_over(7, _S0, run_=_fr(_gq_("OPEN", [])))
assert not r.issue_over(7, _S0, run_=_fr(_gq_("OPEN", ["2026-11-01T13:00:00Z"])))      # #234 review: old merged lane PR of a reopened issue
assert not r.issue_over(7, _S0, run_=_fr("boom", rc=1)) and not r.issue_over(7, _S0, run_=_fr("not json"))   # gh failed: never end a run on an error
assert all(c[:3] == ["gh", "api", "graphql"] for c in _calls[:1]) and any("h=lane/7" in c for c in _calls)   # graphql first
# wait_remote: ended() -> {'state': 'ended'}; a final status still wins
_t = [0]
_seq = iter([{"state": "working"}, {"state": "working"}])
_ends = iter([False, True])
assert r.wait_remote(lambda: next(_seq), lambda s: _t.__setitem__(0, _t[0] + s), lambda: _t[0], 3600, 30, ended=lambda: next(_ends))["state"] == "ended" and _t[0] == 30
assert r.wait_remote(lambda: {"state": "done", "line": "RESULT: DONE x"}, lambda s: None, lambda: 0, 100, 30, ended=lambda: True)["state"] == "done"
# remote_worker / remote_review / remote_fix raise Ended instead of waiting 3 h
_ok = lambda *a, **k: {"ok": True, "session": "s", "url": "u"}
for _f in (lambda: r.remote_worker(7, "pack", False, _ok, lambda: {"state": "working"}, lambda s: None, lambda: 0, ended=lambda: True),
           lambda: r.remote_review(7, 9, "", _ok, lambda: {"state": "working"}, lambda s: None, lambda: 0, ended=lambda: True),
           lambda: r.remote_fix(7, "s", "fix", lambda *a: {"ok": True}, _ok, lambda: {"state": "working"}, lambda s: None, lambda: 0, ended=lambda: True)):
    try: _f(); assert False, "no Ended"
    except r.Ended: pass
# ci_merge: merged / closed elsewhere -> ('ended',), never merges or reruns
def _cm2(seq, **kw):
    it, log = iter(seq), []
    return r.ci_merge(lambda: next(it), lambda: log.append("rerun"), lambda: log.append("merge") or True, lambda s: log.append("sleep"), **kw), log
assert _cm2([_ck("pending")] * 3, ended=iter([False, True]).__next__) == (("ended",), ["sleep"])
assert _cm2([_ck("pass")], ended=lambda: True) == (("ended",), [])
# process_locked: a remote run whose issue got closed -> DONE, in-progress dropped, worktree + windows cleaned, no block
_saved = {k: getattr(r, k) for k in ("gh", "run", "set_labels", "stat", "remove_worktree", "close_windows", "block", "issue_over", "set_where")}
_saved_remote = (r.remote.start, r.remote.status)
_lab, _did = [], []
r.gh = lambda *a, **k: (0, ""); r.run = lambda *a, **k: (0, ""); r.stat = lambda *a, **k: None; r.set_where = lambda *a: None
r.set_labels = lambda n, add=(), remove=(): _lab.append((tuple(add), tuple(remove)))
r.remove_worktree = lambda *a, **k: _did.append("wt"); r.close_windows = lambda n: _did.append("win")
r.block = lambda *a, **k: _did.append("block"); r.issue_over = lambda n, since: bool(since)
r.remote.start = _ok; r.remote.status = lambda n, since=None: {"state": "working"}
try:
    _res = r.process_locked({"number": 7, "labels": ["pack"]}, "remote")
finally:
    for k, v in _saved.items(): setattr(r, k, v)
    r.remote.start, r.remote.status = _saved_remote
assert _res.startswith("DONE") and "block" not in _did and "wt" in _did and "win" in _did, (_res, _did)
assert _lab[-1] == ((), ("in-progress",)), _lab
# #246: a MERGED claude/* PR (found by remote.find_pr) ends the run too
def _fr246(cmd, **kw):
    line = " ".join(map(str, cmd))
    if "graphql" in line: return 0, _gq_("OPEN", [])
    if "--head lane/7" in line: return 0, "[]"
    if "issue view 7" in line: return 0, _j.dumps({"comments": []})
    if "pr list" in line and "--state merged" in line: return 0, _j.dumps([{"number": 9, "headRefName": "claude/github-issue-7-abc", "mergedAt": "2026-11-26T13:00:00Z", "body": "Fixes #7"}])
    return 0, "[]"
assert r.issue_over(7, _S0, run_=_fr246)
assert not r.issue_over(7, "2026-11-26T14:00:00Z", run_=_fr246)         # merged before this run started
print("ok run ends when its issue is closed or PR merged (#234)")
# #250: one pass at a time; a failed spawn gives in-progress back only when no run-<n> is live, never on name_taken
assert r.may_give_back(7, "boom", []) is True
assert r.may_give_back(7, "error: name_taken run-7", []) is False
assert r.may_give_back(7, "boom", [{"name": "run-7", "state": "live"}]) is False
assert r.may_give_back(7, "boom", [{"name": "run-7", "state": "exited"}, {"name": "run-70", "state": "live"}]) is True
_lab2 = []
_saved = {k: getattr(r, k) for k in ("set_labels", "set_where")}
r.set_labels = lambda n, add=(), remove=(): _lab2.append((n, tuple(add), tuple(remove))); r.set_where = lambda *a: None
try:
    _res2 = r.start_chosen([{"number": 5}, {"number": 6}, {"number": 8}], {5: "remote", 6: "local", 8: "local"},
                           spawn_=lambda a: (0, "") if a[0] == "5" else (1, "name_taken" if a[0] == "6" else "boom"),
                           terms_=lambda: [])
finally:
    for k, v in _saved.items(): setattr(r, k, v)
assert _res2 == [(5, "started"), (6, "not started (run already live)"), (8, "not started (hc run failed)")], _res2
assert (6, (), ("in-progress",)) not in _lab2 and (8, (), ("in-progress",)) in _lab2, _lab2
# the pass lock: a second pass exits at once while the first holds it
_ran = []
with r.FileLock("pass"):
    assert r.one_pass(lambda: _ran.append(1) or 0) == 0 and _ran == []
assert r.one_pass(lambda: _ran.append(1) or 0) == 0 and _ran == [1]
assert not (r.RUNS / "pass.lock").exists()
print("ok one pass at a time (#250)")

# #186: no '## Acceptance' section -> the runner refuses the issue (stays ready, one batched inbox line per hour)
assert r.has_acceptance("Goal\n\n## Acceptance\n- [ ] a\n")
assert r.has_acceptance("### Acceptance (3 points)\n- a")
assert not r.has_acceptance("see the acceptance list") and not r.has_acceptance("") and not r.has_acceptance(None)
_qa = [{"number": 1, "labels": [R, "pack"], "createdAt": "1", "body": "## Acceptance\n- a"},
       {"number": 2, "labels": [R, "pack"], "createdAt": "2", "body": "no section"},
       {"number": 3, "labels": ["in-progress", "pack"], "createdAt": "3", "body": ""},        # already running: never refused
       {"number": 4, "labels": [R, "pack", "manual"], "createdAt": "4", "body": ""}]       # hand work: runner ignores it
assert nums(r.no_acceptance(_qa)) == [2]
assert nums(r.no_acceptance(_qa + [{"number": 6, "labels": [R, "P0"], "createdAt": "6", "body": ""}, {"number": 7, "labels": [R, "express"], "createdAt": "7", "body": ""},
                                   {"number": 8, "labels": [R, "bug"], "createdAt": "8", "body": ""}])) == [2]          # P0 / express / bug are exempt
assert r.acceptance_line([_qa[1], _qa[0]]) == "add Acceptance lists: #2 #1"
assert r.acceptance_due(0, 5000) and not r.acceptance_due(1000, 1000 + 3599) and r.acceptance_due(1000, 1000 + 3600)
import tempfile as _tf
_saved = {k: getattr(r, k) for k in ("hc", "USE_HERDR", "RUNS")}
_sent2 = []
r.hc = lambda *a, **k: _sent2.append(a); r.USE_HERDR = True; r.RUNS = Path(_tf.mkdtemp())
try:
    assert r.ask_acceptance([_qa[1]], now=10000) and not r.ask_acceptance([_qa[1]], now=10000 + 60)     # once per hour, no per-issue pings
    assert r.ask_acceptance([_qa[1]], now=10000 + 3600) and not r.ask_acceptance([], now=99999)
finally:
    for k, v in _saved.items(): setattr(r, k, v)
assert _sent2[0][:3] == ("send", "inbox", "add Acceptance lists: #2") and len(_sent2) == 2, _sent2
# worker: build exactly the Acceptance list; reviewer: FIX only for a missed acceptance point, wrong behaviour or a failing test
for _w in (r.worker_prompt(7, "pack"), r.remote_worker_prompt(7, "pack")):
    assert "## Acceptance" in _w and "Out of scope" in _w, _w
for _v in (r.review_prompt(7, 9), r.remote_review_prompt(7, 9)):
    assert "missed Acceptance point" in _v and "PASS-NOTES" in _v, _v
# gate(): shared by the pass and the watchdog idle alarm; hc raising must not crash ask_acceptance
_g, _gr = r.gate(_qa)
assert nums(_gr) == [2] and "ready-for-agent" not in _g[1]["labels"] and nums(r.select(_g, 3)) == [1]
def _boom(*a, **k): raise FileNotFoundError("hc")
_saved = {k: getattr(r, k) for k in ("hc", "USE_HERDR", "RUNS")}
r.hc = _boom; r.USE_HERDR = True; r.RUNS = Path(_tf.mkdtemp())
try:
    assert r.ask_acceptance([_qa[1]], now=10000) is False and not (r.RUNS / "acceptance_ask.txt").exists()
finally:
    for k, v in _saved.items(): setattr(r, k, v)
import json, watchdog as _W
_saved_gh = _W.R.gh; _W.R.gh = lambda *a, **k: (0, json.dumps([{"number": 2, "labels": [{"name": R}], "createdAt": "2", "updatedAt": "2", "title": "t", "body": "no section"}]) if a[0] == "issue" else "[]")
_W._alarm["free_since"] = None
try:
    _W.alarms_once(now=1000.0)
    assert _W._alarm["free_since"] is None, "refused issue must not count as startable work"
finally:
    _W.R.gh = _saved_gh
print("ok acceptance (#186)")
# #137: cloud start refused -> local lane if free, else wait; one note per hour; dead session -> retry once, then STUCK
_t = [0]
def _clk(): return _t[0]
def _sl(x): _t[0] += x
_starts, _notes = [], []
def _st2(n, task, cwd): _starts.append(task); return {"ok": True, "session": f"s{len(_starts)}", "url": f"u{len(_starts)}"}
_seq = iter([{"state": "working"}] * 3 + [{"state": "done", "line": "RESULT: DONE p"}])
_res = r.remote_worker(7, "pack", False, _st2, lambda: next(_seq), _sl, _clk, 60, 30, comment=_notes.append)
assert _res == "RESULT: DONE p" and len(_starts) == 2 and len(_notes) == 1 and "u1" in _notes[0] and "retry" in _notes[0].lower(), (_res, _notes)
assert "continue" in _starts[1] and "continue" not in _starts[0]          # the retry continues pushed work on lane/7
assert not any(l.startswith(("RESULT:", "QUESTION:", "Runner: started (")) for l in _notes[0].splitlines())   # never read as a marker / a new run
_starts.clear(); _notes.clear(); _t[0] = 0
_res = r.remote_worker(7, "pack", False, _st2, lambda: {"state": "working"}, _sl, _clk, 60, 30, comment=_notes.append)
assert _res.startswith("RESULT: STUCK") and "twice" in _res and "u1" in _res and "u2" in _res and len(_starts) == 2 and len(_notes) == 1, _res
# pause + note throttle (pure)
assert not r.remote_paused({}, 10_000) and r.remote_paused({"at": 10_000}, 10_000 + 3599) and not r.remote_paused({"at": 10_000}, 10_000 + 3600)
assert r.note_due({}, 5) and not r.note_due({"noted": 100}, 100 + 3599) and r.note_due({"noted": 100}, 100 + 3600)
assert r.lanes_now(4, {"at": 100}, 200) == 0 and r.lanes_now(4, {"at": 100}, 100 + 3600) == 4 and r.lanes_now(4, {}, 5) == 4
# record_refusal: state file + one orchestrator note and one watchdog.log line per hour, however many starts fail
import tempfile as _tf, pathlib as _pl
_saved = {k: getattr(r, k) for k in ("RUNS", "tell_orchestrator")}
r.RUNS = _pl.Path(_tf.mkdtemp(prefix="runs137-")); _told = []; r.tell_orchestrator = _told.append
try:
    assert r.record_refusal(7, "Error: usage limit", now=1000) is True
    assert r.record_refusal(8, "Error: usage limit", now=1100) is False          # second refusal within the hour: no new note
    assert r.remote_paused(r.refusal_state(), 1200)
    assert r.record_refusal(9, "Error: x", now=1000 + 3600) is True
    _wl = (r.RUNS / "watchdog.log").read_text(encoding="utf-8").splitlines()
    assert len(_told) == 2 and len(_wl) == 2 and "#7" in _told[0] and "usage limit" in _wl[0], (_told, _wl)
finally:
    for k, v in _saved.items(): setattr(r, k, v)
# process_locked: refused start, no local lane free -> WAITING (in-progress dropped, not blocked); local lane free -> runs locally
_saved = {k: getattr(r, k) for k in ("gh", "run", "set_labels", "stat", "remove_worktree", "close_windows", "block", "issue_over",
                                       "set_where", "record_refusal", "local_lane_free", "agent")}
_saved_remote = r.remote.start
_lab, _did, _wh = [], [], []
r.gh = lambda *a, **k: (_did.append(("gh",) + a), (0, ""))[1]; r.run = lambda *a, **k: (0, ""); r.stat = lambda *a, **k: None
r.set_where = lambda n, w: _wh.append(w); r.set_labels = lambda n, add=(), remove=(): _lab.append((tuple(add), tuple(remove)))
r.remove_worktree = lambda *a, **k: None; r.close_windows = lambda n: None
r.block = lambda *a, **k: _did.append("block"); r.issue_over = lambda n, since: False
r.record_refusal = lambda n, err, now=None: _did.append(("refused", err)) or True
r.remote.start = lambda *a, **k: {"ok": False, "error": "Error: Cloud session create failed: limit"}
r.agent = lambda *a, **k: (_did.append("agent"), ("out", "RESULT: STUCK test stop"))[1]
try:
    r.local_lane_free = lambda n: False
    _res = r.process_locked({"number": 7, "labels": ["pack"]}, "remote")
    assert _res.startswith("WAITING") and "block" not in _did and "agent" not in _did and ("refused", "Error: Cloud session create failed: limit") in _did, (_res, _did)
    assert _lab[-1] == ((), ("in-progress",)), _lab
    _did.clear(); _wh.clear()
    r.local_lane_free = lambda n: True
    _res = r.process_locked({"number": 7, "labels": ["pack"]}, "remote")
    assert "agent" in _did and _wh[-1] == "local", (_res, _did, _wh)       # ran in the local lane (agent stub then stops it)
    assert any(c[0] == "gh" and "comment" in c and any("locally" in str(x) for x in c) for c in _did if isinstance(c, tuple))
finally:
    for k, v in _saved.items(): setattr(r, k, v)
    r.remote.start = _saved_remote
if r.LOCAL_LANES == 0: assert r.local_lane_free(7) is False              # 0 local lanes (config now): never free, no gh call
print("ok cloud fallback (#137)")
# #248: watchdog backstop: reap run windows of closed issues, escalate stuck runs
import json
_rt = [{"name": f"run-{n}", "state": "live", "address": f"a{n}"} for n in (1, 2, 3, 4)] + [{"name": "run-pass-9", "state": "live", "address": "ap"}, {"name": "run-5", "state": "finished", "address": "a5"}]
_cs = {1: 1000.0, 2: 1000.0 + 590, 3: 1000.0, 5: 1000.0}                       # 1 old, 2 inside grace, 3 lock holder, 4 open, 5 finished window
assert W.reap_runs(_rt, _cs, 1000.0 + 600, lock_holder=3) == [("a1", 1)], W.reap_runs(_rt, _cs, 1600.0, 3)
assert W.reap_runs(_rt, {1: 1000.0}, 1000.0 + 599, None) == []                   # inside grace -> keep
assert W.lock_holder_issue((7, "#3 CI merge", 0)) == 3 and W.lock_holder_issue(None) is None
_calls, _said = [], []
_hc = lambda *a, **k: _calls.append(("hc",) + a) or (0, "")
_gh = lambda *a, **k: _calls.append(("gh",) + a) or (0, json.dumps([{"number": 1, "state": "CLOSED"}, {"number": 4, "state": "OPEN"}]))
W.closed_seen.clear()
assert W.reap_tick(_rt, now=5000.0, gh=_gh, hc=_hc, say=_said.append, holder=None) == []          # first sight: grace starts
assert W.reap_tick(_rt, now=5000.0 + 601, gh=_gh, hc=_hc, say=_said.append, holder=None) == [("a1", 1)]
assert ("hc", "kill", "a1") in [c[:3] for c in _calls] and ("gh", "issue", "edit", "1", "--remove-label", "in-progress") in _calls and len(_said) == 1
_calls.clear(); W.closed_seen.clear()
assert W.reap_tick(_rt, now=9e9, gh=lambda *a, **k: (1, "boom"), hc=_hc, say=_said.append, holder=None) == [] and not _calls   # gh error -> keep
print("ok reap closed runs (#248)")
_sr = [{"name": "run-8", "state": "live"}, {"name": "run-9", "state": "live"}]
_stt = {}
al, lanes = W.stuck_runs(_sr, {8: 0.0, 9: 7000.0}, 7300.0, 2, _stt)               # 8 silent 2.03 h, 9 fresh
assert [n for n, _ in al] == [8] and lanes == [], (al, lanes)
al, lanes = W.stuck_runs(_sr, {8: 0.0, 9: 7000.0}, 7300.0 + 1700, 2, _stt)        # < 30 min later: nothing
assert al == [] and lanes == []
al, lanes = W.stuck_runs(_sr, {8: 0.0, 9: 7000.0}, 7300.0 + 1800, 2, _stt)        # 30 min: again, counted
assert [n for n, _ in al] == [8] and lanes == [8], (al, lanes)
al, lanes = W.stuck_runs(_sr, {8: 0.0, 9: 16000.0}, 7300.0 + 9000, 2, _stt)        # only once
assert al == [] and lanes == [8]
al, lanes = W.stuck_runs(_sr, {8: 7300.0 + 9000, 9: 16000.0}, 7300.0 + 9001, 2, _stt)   # it moved: cleared
assert al == [] and lanes == []
print("ok stuck escalation (#248)")
# #521: a requeued run (no live run-<n> terminal, or its issue lost in-progress) is dropped: no STILL-stuck alarm, no stuck lane
_st5 = {5: {"m": 0.0, "at": 7300.0, "again": False}}
al, lanes = W.stuck_runs([], {5: 0.0}, 7300.0 + 1800, 2, _st5)                                   # no live terminal
assert al == [] and lanes == [] and 5 not in _st5, (al, lanes, _st5)
_st5 = {5: {"m": 0.0, "at": 7300.0, "again": False}}
_v5 = [{"name": "run-5", "state": "live", "virtual": True}]                                       # poller still lists it
al, lanes = W.stuck_runs(_v5, {5: 0.0}, 7300.0 + 1800, 2, _st5, held=set())                       # but in-progress is gone
assert al == [] and lanes == [] and 5 not in _st5, (al, lanes, _st5)
_st5 = {5: {"m": 0.0, "at": 7300.0, "again": False}}
al, lanes = W.stuck_runs(_v5, {5: 0.0}, 7300.0 + 1800, 2, _st5, held={5})                         # still in-progress: alarm
assert [n for n, _ in al] == [5] and lanes == [5], (al, lanes)
_st5 = {5: {"m": 0.0, "at": 7300.0, "again": False}}
al, lanes = W.stuck_runs(_v5, {5: 0.0}, 7300.0 + 1800, 2, _st5, held=None)                        # labels unreadable: as before
assert [n for n, _ in al] == [5]
# stuck_tick end to end with fakes: stuck_lanes.json loses run-5, nothing told
_sv = (W.tell, W.run_mtime, W.R.gh, dict(W._stuck)); _told5 = []
W.tell = _told5.append; W.run_mtime = lambda n: 0.0
W.R.gh = lambda *a, **k: (0, _json.dumps([]))                                                    # no issue is in-progress
W._stuck.clear(); W._stuck[5] = {"m": 0.0, "at": 7300.0, "again": True}
(W.R.RUNS / "stuck_lanes.json").write_text("[5]", encoding="utf-8")
W.stuck_tick(_v5, now=7300.0 + 1800)
assert _told5 == [] and _json.loads((W.R.RUNS / "stuck_lanes.json").read_text(encoding="utf-8")) == [] and 5 not in W._stuck
W._stuck.clear(); W._stuck[5] = {"m": 0.0, "at": 7300.0, "again": True}
W.stuck_tick([], now=7300.0 + 1800)                                                               # no live terminal
assert _told5 == [] and _json.loads((W.R.RUNS / "stuck_lanes.json").read_text(encoding="utf-8")) == []
W.tell, W.run_mtime, W.R.gh = _sv[:3]; W._stuck.clear(); W._stuck.update(_sv[3])
print("ok requeued run dropped from stuck lanes (#521)")
# #135: a cloud QUESTION parks the issue (lane freed, owner asked); the owner's answer resumes the same session
import json
_saved = {k: getattr(r, k) for k in ("gh", "set_labels", "tell_orchestrator")}
_lab, _gh, _told = [], [], []
r.gh = lambda *a, **k: (_gh.append(a), (0, ""))[1]
r.set_labels = lambda n, add=(), remove=(): _lab.append((n, tuple(add), tuple(remove)))
r.tell_orchestrator = _told.append
import owner_q as _oq
_posted, _oq_post = [], _oq.post
_oq.post = lambda w, q, tail="", gh=None: _posted.append((w, q)) or "https://q"
try:
    try: r.park_remote(7, "QUESTION: red or green?"); assert False, "no Parked"
    except r.Parked: pass
    assert _lab == [(7, ("blocked", "ready-for-human"), ("in-progress",))], _lab
    assert _posted == [("remote-7", "QUESTION: red or green?")]                      # 'needs you' in the questions issue, panel, dashboard
    assert _told and "#7" in _told[0] and "red or green?" in _told[0]                 # the orchestrator is told
    _c = [a for a in _gh if a[:3] == ("issue", "comment", "7")]
    assert _c and _c[0][-1].startswith("Parked (cloud)") and not r.remote.MARK.search(_c[0][-1])   # the park comment is no new QUESTION/RESULT
    # resume: answer stored for the next run, labels back, the orchestrator told
    _lab.clear(); _gh.clear(); _told.clear()
    r.resume_remote(7, "green")
    assert r.take_answer(7) == "green" and r.take_answer(7) is None                  # read once
    assert _lab == [(7, (), ("blocked", "ready-for-human"))] and _told
    assert any(a[:3] == ("issue", "comment", "7") and a[-1].startswith("Runner:") for a in _gh)
    # the watchdog tick: parked cloud issues with an answer resume; others stay
    (r.RUNS / "8").mkdir(parents=True, exist_ok=True); (r.RUNS / "8" / "where").write_text("remote")
    (r.RUNS / "9").mkdir(parents=True, exist_ok=True); (r.RUNS / "9" / "where").write_text("remote")
    _lab.clear()
    (r.RUNS / "11").mkdir(parents=True, exist_ok=True); (r.RUNS / "11" / "where").write_text("remote")
    _list = [{"number": 8, "comments": [{"body": "QUESTION: a or b?"}, {"body": "Parked (cloud): x"}, {"body": _oq.answer_body("abcdef012345", "b")}]},
             {"number": 11, "comments": [{"body": "QUESTION: a or b?"}, {"body": "HOLD (owner-merge) on PR #557; re-parked."}]},   # #608: the orchestrator's note is no owner answer
             {"number": 9, "comments": [{"body": "QUESTION: a or b?"}]},                           # no answer yet
             {"number": 10, "comments": [{"body": "QUESTION: a or b?"}, {"body": "b"}]}]           # not a cloud run: the old local flow
    r.gh = lambda *a, **k: (_gh.append(a), (0, json.dumps(_list)) if a[:2] == ("issue", "list") else (0, ""))[1]
    assert r.resume_answered() == [8]
    assert r.take_answer(8) == "b" and r.take_answer(9) is None and r.take_answer(10) is None and r.take_answer(11) is None
    _la = next(a for a in _gh if a[:2] == ("issue", "list"))
    assert "blocked" in _la and "ready-for-human" in _la
    r.gh = lambda *a, **k: (1, "gh down")
    assert r.resume_answered() == []
finally:
    for k, v in _saved.items(): setattr(r, k, v)
    _oq.post = _oq_post
# remote_resume: the answer goes to the same session; send fails / no session -> a new session with the issue thread
sent, starts = [], []
_st = lambda n, task, cwd: starts.append(task) or {"ok": True, "session": "session_new", "url": "u"}
done = lambda: {"state": "done", "line": "RESULT: DONE https://p"}
assert r.remote_resume(7, "pack", False, "session_w", "green", lambda s, x: sent.append((s, x)) or {"ok": True}, _st, done, lambda s: None, lambda: 0) == "RESULT: DONE https://p"
assert sent[0][0] == "session_w" and "green" in sent[0][1] and "RESULT: DONE" in sent[0][1] and not starts
kept = []
assert r.remote_resume(7, "pack", False, "session_w", "green", lambda s, x: {"ok": False}, _st, done, lambda s: None, lambda: 0, on_start=kept.append) == "RESULT: DONE https://p"
assert len(starts) == 1 and "green" in starts[0] and "view.py issue 7" in starts[0] and "lane/7" in starts[0] and kept[0]["session"] == "session_new"
assert r.remote_resume(7, "pack", False, "", "green", lambda s, x: 1 / 0, _st, done, lambda s: None, lambda: 0) == "RESULT: DONE https://p"
assert r.remote_resume(7, "pack", False, "", "g", None, lambda n, t, c: {"ok": False, "error": "limit"}, done, lambda s: None, lambda: 0).startswith("RESULT: STUCK")
assert r.remote_resume(7, "pack", False, "s", "g", lambda s, x: {"ok": True}, _st, lambda: {"state": "question", "line": "QUESTION: c?"}, lambda s: None, lambda: 0) == "QUESTION: c?"
try: r.remote_resume(7, "pack", False, "s", "g", lambda s, x: {"ok": True}, _st, lambda: {"state": "working"}, lambda s: None, lambda: 0, ended=lambda: True); assert False
except r.Ended: pass
# process_locked: a stored answer resumes the saved session instead of starting a new worker; a QUESTION parks via park_remote
_pl = (r.HERE / "runner.py").read_text(encoding="utf-8").split("def process_locked", 1)[1].split("def close_windows", 1)[0]
assert "remote_resume(" in _pl and "take_answer(n)" in _pl and "park_remote(n, res)" in _pl
_pr = (r.HERE / "runner.py").read_text(encoding="utf-8").split("\ndef process(", 1)[1].split("\ndef process_locked", 1)[0]
assert "pending_answer(n)" in _pr                                  # a resumed issue always runs in the cloud (its session is there)
_wd = (r.HERE / "watchdog.py").read_text(encoding="utf-8")
assert "resume_tick)" in _wd.split("def tick():", 1)[1].split("\ndef ", 1)[0] and "R.resume_answered()" in _wd.split("def resume_tick():", 1)[1].split("\ndef ", 1)[0]
print("ok #135 cloud question parks, answer resumes")
# end to end: stored answer -> process_locked sends it to the saved session (no new start); a new QUESTION parks again
_saved = {k: getattr(r, k) for k in ("gh", "run", "set_labels", "stat", "set_where", "issue_over", "tell_orchestrator")}
_saved_remote = (r.remote.start, r.remote.send, r.remote.status)
_sent, _starts, _lab = [], [], []
r.gh = lambda *a, **k: (0, ""); r.run = lambda *a, **k: (0, ""); r.stat = lambda *a, **k: None; r.set_where = lambda *a: None
r.issue_over = lambda n, since: False; r.tell_orchestrator = lambda t: None
r.set_labels = lambda n, add=(), remove=(): _lab.append((tuple(add), tuple(remove)))
r.remote.start = lambda *a, **k: _starts.append(a) or {"ok": True, "session": "x", "url": "u"}
r.remote.send = lambda s, t: _sent.append((s, t)) or {"ok": True}
r.remote.status = lambda n, since=None: {"state": "question", "line": "QUESTION: and blue?"}
_oq.post = lambda *a, **k: ""
(r.RUNS / "11").mkdir(parents=True, exist_ok=True)
(r.RUNS / "11" / "remote.json").write_text(json.dumps({"session": "session_old"}))
r.answer_file(11).write_text(json.dumps({"answer": "green"}))
try:
    _res = r.process({"number": 11, "labels": ["pack"]}, "local")       # the pass chose local: the stored answer makes it remote
finally:
    for k, v in _saved.items(): setattr(r, k, v)
    r.remote.start, r.remote.send, r.remote.status = _saved_remote
    _oq.post = _oq_post
assert _res.startswith("PARKED"), _res
assert _sent and _sent[0][0] == "session_old" and "green" in _sent[0][1] and not _starts, (_sent, _starts)
assert ("blocked", "ready-for-human") in [a for a, _ in _lab] and not r.pending_answer(11)
print("ok #135 resume end to end")

# 26 Nov: a gh timeout in issue_over never ends or kills a run
import subprocess as _sp
def _slow(cmd, **k): raise _sp.TimeoutExpired(cmd, 60)
assert r.issue_over(5, 0, run_=_slow) is False
print("ok issue_over timeout")

_core = lambda n: I(n, [R, "core"])
# #277: core runs that already hold a core slot count even without an in-progress label (max_core never exceeded);
# the lane goes to a pack issue instead
assert nums(r.select([_core(1), I(2, [R, "pack"])], 3, 3, core_held=3)) == [2]
assert nums(r.select([_core(1), _core(2), I(3, [R, "pack"])], 3, 3, core_held=2)) == [1, 3]
assert nums(r.select([I(1, ["in-progress", "core"]), _core(2), _core(3)], 4, 3, core_held=1)) == [2, 3]   # label and lock are the same run
assert nums(r.select([_core(1), _e(2, ["core"])], 3, 1, 1, core_held=1)) == [2]                          # express rule unchanged
# #277: a run waiting in core_slot() writes .runs/<n>/core_wait (with its pid) until it gets a slot; it is no busy cloud lane
locks = [r.FileLock(f"core-{k}").__enter__() for k in range(r.MAX_CORE)]
seen = []
class _Stop(Exception): pass
def _sleep(s):
    seen.append(r.waiting_core(277))
    if len(seen) > 1: raise _Stop()
    for l in locks: l.__exit__()                                  # slots free up while it waits
_real_sleep, r.time.sleep = r.time.sleep, _sleep
try:
    with r.core_slot(277): got = r.waiting_core(277)
finally: r.time.sleep = _real_sleep
assert seen == [True] and got is False and not r.waiting_core(277), (seen, got)
r.set_where(278, "remote"); r.set_where(279, "remote"); r.set_where(280, "local")
(r.RUNS / "279" / "core_wait").write_text(str(os.getpid()))
assert r.waiting_core(279) and r.remote_busy([278, 279, 280]) == 1
(r.RUNS / "279" / "core_wait").write_text("999999999")         # dead pid: stale marker, not waiting
assert not r.waiting_core(279)
print("ok core wait (#277)")
# #302: block reasons name the real failure (not 'integrate.sh exit N'); ci_merge never falls back to the local integrate.sh
assert r.integrate_failure(6, "CI RED\ntests") == "CI red: tests"
assert r.integrate_failure(4, "no open PR for issue #12") == "merge step failed: no open PR for issue #12"
assert r.integrate_failure(7, "CI green but `gh pr merge` failed: GraphQL: Head branch was modified") == "CI green but `gh pr merge` failed: GraphQL: Head branch was modified"
assert r.integrate_failure(3, "") == "merge step failed (exit 3, no output)"
assert "integrate.sh exit" not in _src.split("def process_locked", 1)[1].split("def close_windows", 1)[0]
_int = _src.split("def integrate():", 1)[1].split("def resolve(", 1)[0]
assert 'if CFG.get("ci_merge", True):' in _int and "find_pr(n)" not in _int   # ci_merge=true + no PR found: rc 4, not the local full suite
# #302: `gh pr merge` fails on a green PR because GitHub's auto-merge merged it a moment earlier -> merged, not blocked
def _ci_race(merge_out, final_state):
    st = {"merged": False}
    def g(*a, **k):
        if a[:2] == ("pr", "view"):
            if "isDraft,labels,body" in a: return 0, '{"isDraft":false,"labels":[]}'
            if "mergeable" in a and "-q" in a: return 0, "MERGEABLE"
            return 0, '{"state":"%s","mergeable":"MERGEABLE"}' % (final_state if st["merged"] else "OPEN")
        if a[:2] == ("pr", "checks"): return 0, '[{"name":"tests","bucket":"pass"}]'
        if a[:2] == ("pr", "merge") and "--auto" in a: return 1, "auto-merge is not allowed"
        if a[:2] == ("pr", "merge") and "--squash" in a: st["merged"] = True; return 1, merge_out
        return 0, ""
    saved = r.gh, r.run, r.remote.pr_for, r.remote.pr_where, r.time.sleep
    r.gh, r.run, r.remote.pr_for, r.remote.pr_where, r.time.sleep = g, (lambda *a, **k: (0, "")), (lambda n, run=None, state="open": (104, "lane/104")), (lambda n, run=None, state="open", repo=None: (104, "lane/104", r.REPO)), (lambda s: None)
    try: return r.ci_integrate(104, "wt", None, None, "abc")
    finally: r.gh, r.run, r.remote.pr_for, r.remote.pr_where, r.time.sleep = saved
assert _ci_race("Pull request #104 was already merged", "MERGED")[0] == 0
_res = _ci_race("GraphQL: Head branch was modified. Review and try the merge again.", "OPEN")
assert _res[0] == 7 and "Head branch was modified" in _res[1], _res                     # the real gh text is in the reason
print("ok #302 merge failures")
# #344: no open PR but a merged one -> rc 0; no PR at all -> still 4
def _ci_nopr(merged):
    saved = r.gh, r.run, r.remote.pr_for, r.remote.pr_where
    r.gh, r.run = (lambda *a, **k: (0, "")), (lambda *a, **k: (0, ""))
    r.remote.pr_where = lambda n, run=None, state="open", repo=None: (None, None, None)
    r.remote.pr_for = lambda n, run=None, state="open": (345, "x") if (state == "merged" and merged) else (None, None)
    try: return r.ci_integrate(344, "wt", None, None, "abc")
    finally: r.gh, r.run, r.remote.pr_for, r.remote.pr_where = saved
assert _ci_nopr(True)[0] == 0 and "already merged" in _ci_nopr(True)[1]
assert _ci_nopr(False)[0] == 4
print("ok #344 already merged PR is done")
# #357: a pass that exits early writes ONE runner.log line (FAILED <reason>, or SKIPPED for a rate limit)
import time
_t0 = time.mktime((2026, 11, 26, 16, 45, 51, 0, 0, -1))
_l = r.pass_exit_line("HTTP 502: Bad Gateway\n  token=" + "x" * 300, _t0)
assert _l.startswith("pass: FAILED HTTP 502: Bad Gateway") and "\n" not in _l and len(_l) <= len("pass: FAILED ") + 160, _l
_l = r.pass_exit_line("GraphQL: API rate limit already exceeded for user ID 1.", _t0, reset_ts=_t0 + 14 * 60)
assert _l == "pass: SKIPPED rate limit (retry after 16:59)", _l
assert r.pass_exit_line("secondary rate limit; retry-after: 120", _t0) == "pass: SKIPPED rate limit (retry after 16:47)"
assert r.pass_exit_line("API rate limit exceeded", _t0) == "pass: SKIPPED rate limit (retry after 16:46)"   # no hint: 60 s
_saved = {k: getattr(r, k) for k in ("gh", "rate_reset", "DRY")}
_logf = r.RUNS / "runner.log"
def _lines(): return [l for l in _logf.read_text(encoding="utf-8").splitlines() if " pass: " in l] if _logf.exists() else []
try:
    r.DRY = False; r.rate_reset = lambda: _t0 + 600
    r.gh = lambda *a: (1, "gh: GraphQL: API rate limit already exceeded for user ID 1.")      # fake gh: rate limited
    _n = len(_lines()); assert r.run_pass() == 1 and len(_lines()) == _n + 1 and "pass: SKIPPED rate limit (retry after " in _lines()[-1], _lines()
    r.gh = lambda *a: (1, "HTTP 500: server error")                                           # fake gh: plain failure
    assert r.run_pass() == 1 and len(_lines()) == _n + 2 and _lines()[-1].endswith("pass: FAILED HTTP 500: server error"), _lines()
    def _boom(): raise ValueError("bad json")                                                  # a crash inside the pass
    try: r.one_pass(_boom); raise AssertionError("must re-raise")
    except ValueError: pass
    assert len(_lines()) == _n + 3 and "pass: FAILED ValueError('bad json')" in _lines()[-1], _lines()
finally:
    for k, v in _saved.items(): setattr(r, k, v)
print("ok #357 early pass exits are logged")
import json
# #652 (owner 27 Nov): close on merge + deploy; the #453 'Refs #n + later' rule is gone
for _p in (r.worker_prompt(7, "pack"), r.remote_worker_prompt(7, "pack")):          # worker: Fixes/Closes, no later / Due: / Refs
    assert "Refs #7" not in _p and "`later`" not in _p and "Due:" not in _p and "#453" not in _p, _p
    assert "Fixes #7" in _p or "Closes #7" in _p, _p
for _p in (r.review_prompt(7, 9), r.remote_review_prompt(7, 9)):                       # reviewer: no RED for a remaining live check
    assert "#453" not in _p and "Refs #" not in _p and "`later`" not in _p and "live check" not in _p, _p
assert not hasattr(r, "live_hint") and not hasattr(r, "live_rule")
assert r.remote.fixes("Fixes #7", 7) and not r.remote.fixes("Fixes #70", 7)
_saved = {k: getattr(r, k) for k in ("gh",)}
try:                                                                                   # the DONE step with a fake gh: always closes
    _calls = []
    def _lab(names, comments=()):
        _calls.clear()
        def g(*a, **k):
            _calls.append(a)
            if a[:2] == ("issue", "view"): return 0, json.dumps({"labels": [{"name": x} for x in names], "comments": [{"body": c} for c in comments]})
            return 0, ""
        return g
    closes = lambda: ("issue", "close", "7", "--comment", "Merged.") in _calls
    # #744: no LIVE line and no proof -> stays open; a LIVE comment line -> closes; docs/tooling exempt
    r.gh = _lab(["pack"]); assert r.finish_issue(7, "Merged.") is False and not any(a[:2] == ("issue", "close") for a in _calls), _calls
    r.gh = _lab(["pack"], ["LIVE seen ok"]); assert r.finish_issue(7, "Merged.") is False      # not a `LIVE:` line
    r.gh = _lab(["pack", "later"], ["x\nLIVE: kid screen seen on production 2026-11-28"]); assert r.finish_issue(7, "Merged.") is True and closes(), _calls
    r.gh = _lab(["pack", "tooling"]); assert r.finish_issue(7, "Merged.") is True and closes(), _calls
    # automatic proof: ok -> LIVE line goes into the close comment; none (could not run) -> closes with the 'not checked' line; failed -> open + back to a worker
    r.gh = _lab(["pack"]); assert r.finish_issue(7, "Merged.", live=(True, "LIVE: smoke ok")) is True
    assert ("issue", "close", "7", "--comment", "Merged.\nLIVE: smoke ok") in _calls, _calls
    r.gh = _lab(["pack"]); assert r.finish_issue(7, "Merged.", live=(None, "LIVE: not checked: no network")) is True
    r.gh = _lab(["pack"]); assert r.finish_issue(7, "Merged.", live=(False, "LIVE check FAILED")) is False
    assert not any(a[:2] == ("issue", "close") for a in _calls) and any("ready-for-agent" in a for a in _calls), _calls
    assert r.has_live_line(["a", "LIVE: x"]) and not r.has_live_line(["live: x", "LIVE:"])
finally:
    for k, v in _saved.items(): setattr(r, k, v)
_src = open(r.__file__, encoding="utf-8").read()
assert 'finish_issue(n, f"Merged to' in _src and 'gh("issue", "close", str(n), "--comment", f"Merged to' not in _src and "live=live_proof()" in _src   # the run's DONE step uses it
_i = _src.index('finish_issue(n, f"Merged to')
assert _src.rindex("deploy_main(log)", 0, _i) < _i                                     # closes only after the merge + deploy step
print("ok #652 close on merge + deploy, #744 only with a LIVE line")
assert _pregen_popens == [], _pregen_popens          # #325: no test path launched the real pregen.js
print("ok #325 no real pregen under tests")

# 26 Nov (#453): an issue labelled 'later' (only a live/owner check left) never gets a worker, even with ready-for-agent
_iss = [{"number": 900, "labels": ["ready-for-agent", "later", "pack", "P2"], "createdAt": "2026-11-26T00:00:00Z", "body": ""},
        {"number": 901, "labels": ["ready-for-agent", "pack", "P2"], "createdAt": "2026-11-26T00:00:01Z", "body": ""}]
assert [c["number"] for c in r.select(_iss, 4, 3, 0)] == [901]
print("ok later skipped")
# 26 Nov (#465): an open blocker labelled 'later' (code merged, only a live check left) counts as done; without 'later' it still blocks
_b = lambda n, labels: {"number": n, "labels": labels, "createdAt": f"2026-11-26T00:00:{n % 60:02d}Z", "body": ""}
_dep = {"number": 911, "labels": ["ready-for-agent", "pack", "P2"], "createdAt": "2026-11-26T00:01:00Z", "body": "Blocked by: #910"}
assert [c["number"] for c in r.select([_b(910, ["later", "pack"]), _dep], 4)] == [911]
assert [c["number"] for c in r.select([_b(910, ["pack"]), _dep], 4)] == []
print("ok later blocker counts as done")

# ---------- #289: no worker / resolve Claude on the PC for cloud lanes ----------
# the resolve/CI-fix round inside a cloud lane's flow is a cloud session too: start + wait for its RESULT on the issue
_st = []
_done = lambda: {"state": "done", "line": "RESULT: DONE https://p"}
assert r.remote_task(7, "resolve it", lambda n, t, cwd: _st.append((n, t)) or {"ok": True}, _done, lambda s: None, lambda: 0) == "RESULT: DONE https://p"
assert _st == [(7, "resolve it")]
assert r.remote_task(7, "x", lambda n, t, cwd: {"ok": False, "error": "403"}, _done, lambda s: None, lambda: 0).startswith("RESULT: STUCK cloud start failed: 403")
_t = iter(range(0, 10**6, 3600))
assert r.remote_task(7, "x", lambda n, t, cwd: {"ok": True}, lambda: {"state": "working"}, lambda s: None, lambda: next(_t), timeout_s=3600).startswith("RESULT: STUCK")
try:
    r.remote_task(7, "x", lambda n, t, cwd: {"ok": True}, lambda: {"state": "working"}, lambda s: None, lambda: 0, ended=lambda: True); raise AssertionError("no Ended")
except r.Ended: pass
_p = r.remote_resolve_prompt(7, ["a.js"], "claude/x")
assert "claude/x" in _p and "a.js" in _p and "RESULT: DONE" in _p and "C:/" not in _p and "worktree" not in _p
assert "gh run view" in r.remote_resolve_prompt(7, ["tests"], "lane/7", ci=True)
import inspect as _insp
_psrc = _insp.getsource(r.process_locked)
assert "remote_task(" in _psrc and "remote_resolve_prompt(" in _psrc, "a cloud lane's resolve must not start a local agent"
print("ok #289 cloud resolve in the flow")

# the pass hands cloud picks to the ONE poller (queue + one `lanes` window), local picks still get their own run-<n>
import lanes as _L
for _i in _L.queued(r.RUNS): _L.take(r.RUNS, _i["number"])     # earlier start_chosen tests queued their cloud picks too
_spawned, _lanes_started = [], []
_res = r.start_chosen([{"number": 501, "labels": ["pack"]}, {"number": 502, "labels": ["pack"]}, {"number": 503, "labels": ["pack"]}],
                      {501: "remote", 502: "remote", 503: "local"}, spawn_=lambda a: _spawned.append(a) or (0, ""), terms_=lambda: [],
                      lanes_=lambda: _lanes_started.append(1) or (0, ""))
assert _res == [(501, "started"), (502, "started"), (503, "started")], _res
assert _spawned == [["503"]], _spawned                       # no run-501 / run-502 process
assert _lanes_started == [1] and [i["number"] for i in _L.queued(r.RUNS)] == [501, 502], (_lanes_started, _L.queued(r.RUNS))
for _k in (501, 502): _L.take(r.RUNS, _k)
# the lanes window cannot start (not name_taken = not already live): the picks go back to the queue owner (ready again)
_res = r.start_chosen([{"number": 504, "labels": ["pack"]}], {504: "remote"}, spawn_=lambda a: (0, ""), terms_=lambda: [], lanes_=lambda: (1, "hc down"))
assert _res == [(504, "not started (hc run failed)")] and _L.queued(r.RUNS) == [], _res
_res = r.start_chosen([{"number": 505, "labels": ["pack"]}], {505: "remote"}, spawn_=lambda a: (0, ""), terms_=lambda: [], lanes_=lambda: (1, "name_taken"))
assert _res == [(505, "started")] and [i["number"] for i in _L.queued(r.RUNS)] == [505]   # already live: it picks the queue up
_L.take(r.RUNS, 505)
# a stop from the watchdog (#364 safety net on a virtual run-<n>) ends that lane's wait loops
_L.stop(r.RUNS, 506); assert r.lane_stopped(506); _L.clear_stop(r.RUNS, 506); assert not r.lane_stopped(506)
# runner.py --lanes serves the queue; the virtual run-<n> rows reach the pass's live_terminals (no double start)
assert "--lanes" in _insp.getsource(r.main)
_L.write_state(r.RUNS, os.getpid(), {507})
assert any(t["name"] == "run-507" for t in r.with_lanes([]))
(r.RUNS / "lanes.json").unlink()
_naps, _real = [], r.time.sleep
r.time.sleep = _naps.append
try: r.poll_sleep(300); r.poll_sleep(60)
finally: r.time.sleep = _real
assert _naps[0] == 300 and 0 < _naps[1] <= 60, _naps          # a back-off keeps its length; the poll aligns to the minute
print("ok #289 one poller for cloud lanes")

# the orchestrator's reviews / fixes go to cloud sessions (ORCHESTRATOR.md): runner.py <n> --cloud-review | --cloud-fix=<points>
_calls = []
assert r.cloud_job(7, "review", "", pr_for=lambda n: (70, "claude/x"), start=lambda n, t, cwd: _calls.append(t) or {"ok": True, "url": "https://claude.ai/code/session_1"}) == "started https://claude.ai/code/session_1"
assert "VERDICT" in _calls[-1] and "70" in _calls[-1]
assert r.cloud_job(7, "fix", "FIX a; b", pr_for=lambda n: (70, "claude/x"), start=lambda n, t, cwd: _calls.append(t) or {"ok": True, "url": "u"}) == "started u"
assert "FIX a; b" in _calls[-1] and "claude/x" in _calls[-1]
assert r.cloud_job(7, "review", "", pr_for=lambda n: (None, None), start=None) == "no open PR for #7"
_orch = (r.ROOT / "ORCHESTRATOR.md").read_text(encoding="utf-8")
assert "--cloud-review" in _orch and "--cloud-fix" in _orch and "read-only lookups" in _orch
print("ok #289 orchestrator reviews/fixes in the cloud")

# 26 Nov (#26): an ended issue's worker/reviewer tabs are settled with herdr-app tab.settle (once per tab), running issues are left alone
_saved = {k: getattr(r, k) for k in ("hc", "hc_json", "run", "USE_HERDR", "HERDR_APP")}
try:
    _app = os.path.join(tempfile.mkdtemp(prefix="herdr-app-"), "herdr-app.exe"); open(_app, "w").close()
    _live = {"issue-5": "t:5w", "review-5": "t:5r", "issue-6": "t:6w"}       # #6 is still running
    _runs, _hcs = [], []
    r.USE_HERDR, r.HERDR_APP = True, _app
    r.hc = lambda *a, **k: (_hcs.append(a), (0, ""))[1]
    r.hc_json = lambda *a: {"address": _live[a[1]]} if a[:1] == ("get",) and a[1] in _live else {}
    r.run = lambda cmd, **k: (_runs.append(cmd), (0, ""))[1]
    r.close_windows(5)
    _settled = [c[c.index("--terminal") + 1] for c in _runs if c[:3] == [_app, "do", "tab.settle"]]
    assert sorted(_settled) == ["t:5r", "t:5w"], _runs                       # once per tab of the ended issue
    assert "t:6w" not in _settled                                            # never a running issue's tab
    assert ("kill", "issue-5") in [a[:2] for a in _hcs]                      # windows still closed as before
    _runs.clear(); r.USE_HERDR = False; r.close_windows(5); assert _runs == []   # no herdr: nothing
finally:
    for k, v in _saved.items(): setattr(r, k, v)
_cw = _src.split("def close_windows", 1)[1].split("\ndef ", 1)[0]
assert "tab.settle" in _cw
_pl = _src.split("def process_locked", 1)[1].split("def close_windows", 1)[0]
assert _pl.count("close_windows(n)") >= 2 and "close_windows" not in _pl.split("except Parked", 1)[1].split("except", 1)[0]   # DONE + Ended settle; parked keeps tabs
print("ok #26 ended issue tabs settled")

# #608: workers and reviewers never write 'approved' for the owner; the gate is the owner_q record (owner_q.py gate), never comment text
for _p in (r.worker_prompt(5, "pack"), r.remote_worker_prompt(5, "pack"), r.review_prompt(5, 9), r.remote_review_prompt(5, 9)):
    assert "on the owner's behalf" in _p and "owner_q.py gate #5" in _p, _p[-800:]
print("ok #608 prompts: no approvals on the owner's behalf; the gate is the owner_q record")

# #618: the reviewer adds a TEST level line; after a PASS the tester (cloud session test-<n>, Sonnet / Opus for T3) plays the preview
for _p in (r.review_prompt(5, 9), r.remote_review_prompt(5, 9)):
    assert "TEST: T0" in _p and "T3" in _p and "counts as T2" in _p, _p[-1500:]
_ts = []
def _tstart(n, t, c, name=None, model=None): _ts.append((n, name, model, t)); return {"ok": True, "url": "u"}
rv, v = r.remote_tester(7, 9, "T3", _tstart, lambda: {"state": "done", "line": "TEST: PASS", "body": "shots\nTEST: PASS"}, lambda s: None, lambda: 0, 60, 30)
assert v == "TEST: PASS" and _ts[0][:3] == (7, "test-7", "opus") and "pr-9.oren-game.pages.dev" in _ts[0][3], _ts
rv, v = r.remote_tester(7, 9, "T1", _tstart, lambda: {"state": "done", "line": "TEST: FAIL x", "body": "b"}, lambda s: None, lambda: 0, 60, 30)
assert v == "TEST: FAIL x" and _ts[1][2] == "sonnet"
rv, v = r.remote_tester(7, 9, "T1", lambda *a, **k: {"ok": False, "error": "403"}, lambda: {"state": "working"}, lambda s: None, lambda: 0, 60, 30)
assert v == "" and "403" in rv
rv, v = r.remote_tester(7, 9, "T2", _tstart, lambda: {"state": "working"}, lambda s: None, iter(range(0, 10**6, 60)).__next__, 120, 60)
assert v == "" and "no TEST line" in rv, rv
print("ok #618 tester: level line in the review prompts, cloud tester session test-<n> with the level's model")

# #703: the week is a hard bound; a hit limit stops everything and puts died runs back in the queue
_Gw = {**_G, "stop": 99, "reserve": 5}
_ex = {"number": 1, "labels": ["express"]}; _nx = {"number": 2, "labels": []}
g = r.governor(_u(0, 4.8, week=100), [], _now, _Gw)                       # Sat 11:26: week 100
assert g["stop"] and g["limit_hit"] and g["why"].startswith("limit hit") and "governor: 0 lanes" in r.governor_text(g), g
assert r.stop_filter([_ex, _nx], g) == []
g = r.governor(_u(10, 3, week=97.5), [], _now, _Gw); assert g["stop"] and not g["limit_hit"] and r.stop_filter([_ex, _nx], g) == [_ex], g
g = r.governor(_u(10, 3, week=98), [], _now, _Gw); assert g["stop"] and r.stop_filter([_ex, _nx], g) == [], g
g = r.governor(_u(10, 3, week=93), [], _now, _Gw); assert not g["stop"] and not g["limit_hit"]
_h = lambda reset_h: {"at": _now - 600, "pct": 0, "busy": 3, "reset": _iso(_now + reset_h * 3600)}
g = r.governor(_u(0, 4.9, week=96), [_h(4.7), _h(4.8)], _now, _Gw)        # Fri 20:30-21:16: 5h 0%, reset moving forward, lanes busy
assert g["limit_hit"] and g["stop"] and g["why"].startswith("limit hit"), g
g = r.governor(_u(0, 4.9, week=50), [_h(4.9), _h(4.9)], _now, _Gw); assert not g["limit_hit"], g       # reset steady: normal
g = r.governor(_u(0, 4.9, week=50), [{**_h(4.7), "busy": 0}, _h(4.8)], _now, _Gw); assert not g["limit_hit"], g   # idle lanes
_uw = {"five_h_pct": None, "week_pct": 100, "week_reset": _iso(_now + 3600), "at": _iso(_now - 60)}   # no 5h bucket
g = r.governor(_uw, [], _now, _Gw); assert g["stop"] and g["limit_hit"], g
g = r.governor({**_uw, "week_pct": 50}, [], _now, _Gw, prev=4); assert not g["stop"] and not g["limit_hit"] and g["lanes"] > 0, g
assert r.limit_requeue("RESULT: STUCK cloud worker died twice without a RESULT line (a, b)", True)
assert r.limit_requeue("", True) and not r.limit_requeue("RESULT: STUCK cloud worker died twice x", False) and not r.limit_requeue("RESULT: DONE", True)
print("ok #703 governor: week hard bounds, limit_hit, week-only usage, died run goes back in the queue")

# #713: PURPLE hold/merge-safe stat events (a hold must not crash, must say "parked")
_ev713 = []
_old_stat = r.stat; r.stat = lambda n, lane, event, **x: _ev713.append((event, x))
try:
    r.stat_purple(5, "pack", "hold", {"model": "sonnet", "effort": "medium"})
    r.stat_purple(5, "pack", "merge-safe", {"model": "sonnet", "effort": "medium"})
finally: r.stat = _old_stat
assert _ev713 == [("parked", {"model": "sonnet", "effort": "medium", "colour": "purple"}),
                  ("review_pass", {"model": "sonnet", "effort": "medium", "colour": "purple"})], _ev713
assert "stat_purple(n, lane, extra, me)" in inspect.getsource(r.process_locked)

# #747: draft PR early; a draft PR without RESULT = resume at worker; DONE without PR -> the runner opens it
_p = r.remote_worker_prompt(7, "pack")
assert "--draft" in _p and "first green commit" in _p and "gh pr ready" in _p
_tasks = []
def _fs(n, task, cwd): _tasks.append(task); return {"ok": True, "session": "s", "url": "u"}
r.remote_worker(7, "pack", False, _fs, lambda: {"state": "done", "line": "RESULT: DONE"}, lambda s: None, lambda: 0, 60, 30, has_draft=lambda: 5)
assert "continue from it" in _tasks[-1] and "draft PR" in _tasks[-1]            # draft PR exists -> continue on lane/7
r.remote_worker(7, "pack", False, _fs, lambda: {"state": "done", "line": "RESULT: DONE"}, lambda s: None, lambda: 0, 60, 30, has_draft=lambda: None)
assert "continue from it" not in _tasks[-1]                                      # no draft -> fresh start
_sv = (r.gh, r.run, r.find_pr)
try:
    _g = []
    r.find_pr = lambda n: 5                       # pass level: a draft PR (no RESULT) is not resumed into review; a ready PR is
    r.gh = lambda *a, **k: (0, json.dumps({"number": 5, "state": "OPEN", "isDraft": True}))
    assert r.resume_lookup(7) is None
    _ch = r.open_pr_resumes([{"number": 7}], r.resume_lookup)
    assert _ch == [{"number": 7}] and not r._resume_file(7, "resume").exists()   # started as a worker, no resume=review stored
    r.gh = lambda *a, **k: (0, json.dumps({"number": 5, "state": "OPEN", "isDraft": False, "mergeable": "MERGEABLE", "headRefOid": "x", "commits": [], "comments": []}))
    assert r.resume_lookup(7) is not None
    _g = []
    r.find_pr = lambda n: 5                                                                    # also a claude/* PR
    r.gh = lambda *a, **k: (_g.append(a), (0, json.dumps({"isDraft": True}) if a[:2] == ("pr", "view") else ""))[1]
    assert r.draft_pr(7) == 5 and r.ensure_pr_ready(7) == 5 and ("pr", "ready", "5") in _g     # DONE + draft -> marked ready
    _g.clear(); _made = []
    r.gh = lambda *a, **k: (_g.append(a), (0, ""))[1]
    r.find_pr = lambda n: 9 if any(x[:2] == ("pr", "create") for x in _g) else None
    r.run = lambda cmd, **k: (0, "abc\trefs/heads/lane/7\n")
    assert r.ensure_pr_ready(7) == 9 and any(x[:2] == ("pr", "create") and "Fixes #7" in x[-1] for x in _g)   # DONE, pushed, no PR -> runner opens it
    _g.clear(); r.find_pr = lambda n: None; r.run = lambda cmd, **k: (0, "")
    assert r.ensure_pr_ready(7) is None and not any(x[:2] == ("pr", "create") for x in _g)    # nothing pushed -> still blocked
finally: r.gh, r.run, r.find_pr = _sv
print("ok #747 draft PR resume + runner opens PR")

# #711 budget pressure p and shift (0 or +1, never lower)
for _p, _s in ((0.3, 0), (0.8, 0), (1.0, 0), (1.5, 1)):      # need = p * b * N_hi with b 0.2, N_hi 10
    _pp, _sh = r.budget_shift(_p * 2.0, 0.2, 10); assert abs(_pp - _p) < 1e-9 and _sh == _s, (_p, _pp, _sh)
assert r.budget_shift(0.6, 0.2, 10)[1] == 0 and r.budget_shift(3.0, 0.2, 10)[1] == 1 and r.budget_shift(1, 0.2, 0) == (None, 0)
_g1 = r.governor(_ux(40, 80), [], _now, _G, busy=3, ready=9); assert _g1["shift"] == 0 and _g1["p"] < 1 and "budget: tight, fewer lanes" in r.governor_text(_g1), _g1
_g2 = r.governor(_ux(1, 80), [], _now, _G, busy=3, ready=1); assert _g2["p"] > 1 and _g2["shift"] == 1 and "budget: behind, shift +1" in r.governor_text(_g2), _g2
_gl = [r.governor(_ux(w, 80), [], _now, _G, busy=3, ready=9) for w in (10, 40, 70)]
assert _gl[0]["p"] > _gl[1]["p"] > _gl[2]["p"] and _gl[0]["lanes"] >= _gl[1]["lanes"] >= _gl[2]["lanes"] and _gl[0]["lanes"] > _gl[2]["lanes"], _gl   # p falls -> fewer lanes
assert all(x["shift"] in (0, 1) for x in _gl)

# #719 budget shift at start: behind (+1) raises a core worker above the floors; tight (0) changes nothing; never lowers; an upgraded task keeps its rung
assert r.apply_shift(1, "sonnet", "medium", "core") == ("sonnet", "high")                       # behind: Sonnet core task -> high
assert r.apply_shift(0, "sonnet", "medium", "core") == ("sonnet", "medium")                     # tight: labels as they are
assert r.apply_shift(1, "sonnet", "medium", "pack") == ("sonnet", "medium")                     # not core: unchanged
assert r.apply_shift(-1, "sonnet", "high", "core") == ("sonnet", "high")                        # no negative shift
for _m, _e in (("sonnet", "medium"), ("sonnet", "high"), ("opus", "medium"), ("opus", "xhigh"), ("fable", "high")):
    for _s in (0, 1):
        _m2, _e2 = r.apply_shift(_s, _m, _e, "core"); assert r._rung_index(_m2, _e2) >= r._rung_index(_m, _e) or _m == "fable", (_m, _e, _s)
assert r.floors("worker", *r.apply_shift(1, "opus", "high", "core"), labels=()) [1] in ("high", "xhigh")   # a floor is never lowered
_src719 = inspect.getsource(r.process_locked)
assert "if not upgrade:" in _src719 and "apply_shift(shift" in _src719 and "shift=shift" in _src719 and '", shift +1"' in _src719   # upgraded task keeps its rung; shown in stat + comment
assert r.governor_now(now=0)["shift"] in (0, 1)

# #841: a cloud session with no sign of life for dead_minutes goes back to the queue; 2 dead lanes in 30 min pause starts
_dead_s = r.DEAD_MINUTES * 60
assert r.DEAD_MINUTES == 20
_t = [0]
_sl = lambda s: _t.__setitem__(0, _t[0] + s)
_res = r.wait_remote(lambda: {"state": "working"}, _sl, lambda: _t[0], 3 * 3600, 60, life=lambda: "same", dead_s=_dead_s)   # silent: dead at 20 min
assert _res["state"] == "dead" and _t[0] == 20 * 60 and _res["minutes"] == 20, (_res, _t)
_t[0] = 0                                                                                                                    # a commit at 15 min: keeps waiting
_res = r.wait_remote(lambda: {"state": "working"}, _sl, lambda: _t[0], 3 * 3600, 60, life=lambda: "c1" if _t[0] < 900 else "c2", dead_s=_dead_s)
assert _res["state"] == "dead" and _t[0] == 15 * 60 + 20 * 60, _t     # the 20 min restart from the sign of life
_t[0] = 0                                                                                                                    # a session that keeps showing life keeps the 3 h limit
_res = r.wait_remote(lambda: {"state": "working"}, _sl, lambda: _t[0], 3 * 3600, 60, life=lambda: _t[0] // 600, dead_s=_dead_s)
assert _res["state"] == "timeout" and _t[0] == 3 * 3600
_t[0] = 0                                                                                                                    # a change of the status (a PR appears) is life too; a failing life() is not death
_res = r.wait_remote(lambda: {"state": "working", "pr": {"number": 5} if _t[0] >= 600 else None}, _sl, lambda: _t[0], 3600, 60, life=lambda: "x", dead_s=_dead_s)
assert _res["state"] == "dead" and _t[0] == 600 + 20 * 60
def _boom(): raise OSError("gh down")
_t[0] = 0
assert r.wait_remote(lambda: {"state": "working"}, _sl, lambda: _t[0], 3600, 60, life=_boom, dead_s=_dead_s)["state"] == "timeout"
# remote_worker: a dead session -> one comment (session link + minutes silent), Dead raised (the caller requeues; no second session here)
_cm = []
try: r.remote_worker(7, "pack", False, fake_start, lambda: {"state": "working"}, _sl, lambda: _t[0], 3 * 3600, 60, comment=_cm.append, life=lambda: "same", dead_s=_dead_s); assert False, "no Dead"
except r.Dead as e: assert e.minutes == 20 and "session_x" in e.url
assert len(_cm) == 1 and "session_x" in _cm[0] and "20 min" in _cm[0], _cm
# dead lanes: 2 within 30 min -> no new cloud starts for 30 min, why = 'dead lanes: 2', ONE alert per 3 h
_st = {}
_st, _n, _alert = r.note_dead(_st, 1000); assert (_n, _alert) == (1, False) and not r.dead_paused(_st, 1000)
_st, _n, _alert = r.note_dead(_st, 1000 + 20 * 60); assert (_n, _alert) == (2, True) and r.dead_paused(_st, 1000 + 20 * 60)
assert r.dead_why(_st, 1000 + 20 * 60) == "dead lanes: 2" and r.lanes_now(4, {}, 0, dead=_st) == 0 and r.lanes_now(4, {}, 0, dead={}) == 4
assert not r.dead_paused(_st, 1000 + 20 * 60 + 30 * 60 + 1) and r.dead_why(_st, 1000 + 20 * 60 + 30 * 60 + 1) == ""
_st, _n, _alert = r.note_dead(_st, 1000 + 25 * 60); assert _n == 3 and _alert is False          # at most one alert per 3 h
_st2, _n, _alert = r.note_dead({}, 5000); _st2, _n, _alert = r.note_dead(_st2, 5000 + 31 * 60); assert _n == 1 and not r.dead_paused(_st2, 5000 + 31 * 60)   # 30 min apart: no pause
_st3 = r.note_dead({**_st, "times": []}, 1000 + 3 * 3600 + 30 * 60)[0]; assert r.note_dead(_st3, 1000 + 3 * 3600 + 40 * 60)[2] is True     # 3 h later: alert again
print("ok #841 dead sessions")
# remote.life: comments + branch heads; a new commit changes it; an unreadable GitHub raises
import remote as _rm
_cn = [1]; _sha = ["a"]
def _fake_gh(cmd):
    if cmd[1] == "issue": return 0, json.dumps({"comments": [{}] * _cn[0]})
    return 0, json.dumps([{"ref": "refs/heads/lane/7", "object": {"sha": _sha[0]}}] if cmd[2].endswith("heads/lane/7") else [])
_s0 = _rm.life(7, _fake_gh); assert _rm.life(7, _fake_gh) == _s0
_sha[0] = "b"; assert _rm.life(7, _fake_gh) != _s0
_s1 = _rm.life(7, _fake_gh); _cn[0] = 2; assert _rm.life(7, _fake_gh) != _s1
try: _rm.life(7, lambda c: (1, "err")); assert False
except OSError: pass
print("ok #841 remote.life")
