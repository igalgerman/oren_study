# Unit test for the selection logic: python tools/runner/test_runner.py
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
import sys; sys.argv.append("--dry-run")
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
# priority: bug first, then P0<P1<P2<P3 (missing = P2), then oldest
assert nums(r.select([I(1,[R,"pack","P3"]), I(2,[R,"pack"]), I(3,[R,"pack","P1"]), I(4,[R,"pack","P0"])], 4)) == [4,3,2,1]
assert nums(r.select([I(1,[R,"pack","P0"]), I(2,[R,"pack","bug","P3"])], 2)) == [2,1]
assert nums(r.select([I(5,[R,"pack","P1"]), I(3,[R,"pack","P1"])], 2)) == [3,5]
assert r.priority_of(["P1", "x"]) == 1 and r.priority_of([]) == 2
print("ok priority")
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
r.run = _mock_run(_json.dumps({"spaces": [{"id": "s1", "name": "other"}, {"id": "s2", "name": r.CFG.get("herdr_space", "Oren_study_orech")}]}))
r._SPACE = None
assert r.space_args() == ["--label", "herdr.space=s2"]; assert len(_ran) == 1
r.space_args(); assert len(_ran) == 1                                                       # cached
r.run = _mock_run(_json.dumps({"spaces": [{"id": "s1", "name": "other"}]})); r._SPACE = None
assert r.space_args() == []                                                                   # no such space: no label
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
assert r.CFG["express_lanes"] == 1
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
assert r.reviewer_model(["model:haiku"]) == "sonnet" and r.reviewer_model([]) == "sonnet" and r.reviewer_model(["model:fable"]) == "sonnet"
assert r.model_name(["model:fable"]) == "fable" and r.model_name([]) == "sonnet"
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
# #219: Batch:/spec issues follow implement-spec (local and cloud prompts)
assert "implement-spec.md" in r.remote_worker_prompt(7, "core") and "Batch:" in r.remote_worker_prompt(7, "core") and "spec" in r.worker_prompt(7, "core")
assert "implement-spec.md" in r.worker_prompt(7, "core")
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
assert "remote.review_status(pr, since=since)" in _pl and "remote_fix(" in _pl and 'agent(f"review-{n}"' in _pl
assert _pl.index('if where == "remote": prep_worktree()') > _pl.index("remote_fix(")          # worktree made after the last cloud fix
print("ok #134 remote reviewer")
# #175: voice pregen runs in the background AFTER the merge lock, one at a time, never blocking an issue
import os as _os
class _P:
    def __init__(self, *a, **k): self.pid = _os.getpid(); _P.calls.append(a[0])
_P.calls = []
r.RUNS.mkdir(exist_ok=True); (r.RUNS / "pregen.lock").unlink(missing_ok=True)
_old = r.CFG.get("pregen"); r.CFG["pregen"] = True
assert r.start_pregen(popen=_P) == "started" and _P.calls == [r.pregen_cmd()]
assert r.start_pregen(popen=_P) == "already running" and len(_P.calls) == 1      # lock holds our (live) pid
(r.RUNS / "pregen.lock").unlink(missing_ok=True)
r.CFG["pregen"] = False; assert r.start_pregen(popen=_P) == "off"
r.CFG["pregen"] = _old
_src = (r.HERE / "runner.py").read_text(encoding="utf-8")
_blk = _src.split('with FileLock("integrate", wait=True, note=f"#{n} deploy"):\n            stat(n, lane, "merged")', 1)[1].split("\n        m = sync_main", 1)[0]
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
assert _proc.index('stat(n, lane, "review_pass")') < _proc.index("ci_integrate(")
_fix = _proc.split('stat(n, lane, "review_fix")', 1)[0].rsplit("if kind != \"fix\":", 1)[1]
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
            return (0, pr_json) if "isDraft,labels" in a else (0, "MERGEABLE") if "mergeable" in a else (0, '{"state":"OPEN","mergeable":"MERGEABLE"}')
        if a[:2] == ("pr", "checks"): return 0, '[{"name":"tests","bucket":"pass"}]'
        if a[:2] == ("pr", "merge") and "--auto" in a: return auto_rc
        return 0, ""
    saved = r.gh, r.run, r.remote.pr_for, r.time.sleep
    r.gh, r.run, r.remote.pr_for, r.time.sleep = g, (lambda *a, **k: (0, "")), (lambda n, run=None, state="open": (251, "claude/x")), (lambda s: None)
    try: res = r.ci_integrate(185, "wt", None, None, sha)
    finally: r.gh, r.run, r.remote.pr_for, r.time.sleep = saved
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
_G = {"target": 90, "min": 2, "max": 8, "stop": 93, "pace": 3.5, "week_cap": 4, "stale_s": 900, "fallback": 4}
def _u(pct, reset_h, week=10, week_reset_h=24 * 6, age=60):
    return {"five_h_pct": pct, "five_h_reset": _iso(_now + reset_h * 3600), "week_pct": week, "week_reset": _iso(_now + week_reset_h * 3600), "at": _iso(_now - age)}
# below target: 20% with 4h left, 3.5%/h/lane -> (90-20)/(3.5*4)=5 lanes
g = r.governor(_u(20, 4), [], _now, _G); assert g["lanes"] == 5 and not g["stop"] and abs(g["projected"] - 90) < 0.01, g
# far below: capped at max
assert r.governor(_u(5, 1), [], _now, _G)["lanes"] == 8
# above target: projection over 90 even at min -> min
g = r.governor(_u(85, 3), [], _now, _G); assert g["lanes"] == 2 and g["projected"] > 90, g
# 93% stop: no new run
g = r.governor(_u(93, 1), [], _now, _G); assert g["stop"] and "STOP" in r.governor_text(g) and "governor: 0 lanes" in r.governor_text(g)
assert not r.governor(_u(92.9, 0.1), [], _now, _G)["stop"]
# weekly guard: 2 days into the week (even ~28.6%), week 45% > 38.6 -> cap 4; 30% -> no cap
assert r.governor(_u(5, 1, week=45, week_reset_h=24 * 5), [], _now, _G)["lanes"] == 4
assert r.governor(_u(5, 1, week=30, week_reset_h=24 * 5), [], _now, _G)["lanes"] == 8
# stale / missing -> config remote_lanes
assert r.governor(_u(20, 4, age=16 * 60), [], _now, _G)["lanes"] == 4
assert r.governor(None, [], _now, _G)["lanes"] == 4 and not r.governor(None, [], _now, _G)["stop"]
assert r.governor({"at": "junk"}, [], _now, _G)["lanes"] == 4
assert "no fresh usage" in r.governor_text(r.governor(None, [], _now, _G))
# pace from the last hour (same window): 10 pts in 1h with 5 busy lanes = 2%/h/lane -> 20% + 2*n*4 <= 90 -> 8
_rs = _iso(_now + 4 * 3600)
_h = [{"at": _now - 3600, "pct": 10, "reset": _rs, "busy": 5}, {"at": _now - 60, "pct": 20, "reset": _rs, "busy": 5}]
assert abs(r.gov_pace(_h, _now, _rs, 3.5) - 10 / (3540 / 3600) / 5) < 1e-9
assert r.governor(_u(20, 4), _h, _now, _G)["lanes"] == 8
# samples from another window, too short a span, or no busy lanes -> default pace
assert r.gov_pace(_h, _now, "other", 3.5) == 3.5
assert r.gov_pace([{**_h[1], "at": _now - 300}, _h[1]], _now, _rs, 3.5) == 3.5
assert r.gov_pace([{**x, "busy": 0} for x in _h], _now, _rs, 3.5) == 3.5
t = r.governor_text(r.governor(_u(20, 4), [], _now, _G)); assert t.startswith("governor: 5 lanes (5h 20% -> ~90% at ") and len(t.split(" at ")[1]) == 6, t
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
(r.RUNS / "governor.json").unlink()
print("ok governor lanes")
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
_ok = lambda *a: {"ok": True, "session": "s", "url": "u"}
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
r.remote.start = lambda *a: {"ok": False, "error": "Error: Cloud session create failed: limit"}
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
    _list = [{"number": 8, "comments": [{"body": "QUESTION: a or b?"}, {"body": "Parked (cloud): x"}, {"body": "b"}]},
             {"number": 9, "comments": [{"body": "QUESTION: a or b?"}]},                           # no answer yet
             {"number": 10, "comments": [{"body": "QUESTION: a or b?"}, {"body": "b"}]}]           # not a cloud run: the old local flow
    r.gh = lambda *a, **k: (_gh.append(a), (0, json.dumps(_list)) if a[:2] == ("issue", "list") else (0, ""))[1]
    assert r.resume_answered() == [8]
    assert r.take_answer(8) == "b" and r.take_answer(9) is None and r.take_answer(10) is None
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
assert len(starts) == 1 and "green" in starts[0] and "gh issue view 7" in starts[0] and "lane/7" in starts[0] and kept[0]["session"] == "session_new"
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
assert "resume_tick()" in _wd.split("def tick():", 1)[1].split("\ndef ", 1)[0] and "R.resume_answered()" in _wd.split("def resume_tick():", 1)[1].split("\ndef ", 1)[0]
print("ok #135 cloud question parks, answer resumes")
# end to end: stored answer -> process_locked sends it to the saved session (no new start); a new QUESTION parks again
_saved = {k: getattr(r, k) for k in ("gh", "run", "set_labels", "stat", "set_where", "issue_over", "tell_orchestrator")}
_saved_remote = (r.remote.start, r.remote.send, r.remote.status)
_sent, _starts, _lab = [], [], []
r.gh = lambda *a, **k: (0, ""); r.run = lambda *a, **k: (0, ""); r.stat = lambda *a, **k: None; r.set_where = lambda *a: None
r.issue_over = lambda n, since: False; r.tell_orchestrator = lambda t: None
r.set_labels = lambda n, add=(), remove=(): _lab.append((tuple(add), tuple(remove)))
r.remote.start = lambda *a: _starts.append(a) or {"ok": True, "session": "x", "url": "u"}
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
