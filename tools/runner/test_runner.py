# Unit test for the selection logic: python tools/runner/test_runner.py
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
r.CFG["pregen"] = False
assert r.deploy_text(None) == "deployed ok https://x.oren-game.pages.dev (pregen off)" and not any("pregen.js" in " ".join(map(str, c)) for c in _calls)
r.CFG["pregen"] = True; _calls.clear()
assert r.deploy_text(None).startswith("deployed ok https://") and not any("pregen.js" in " ".join(map(str, c)) for c in _calls)   # #175: pregen runs later, outside the lock
r.run, r.env_file = _orig_run, _orig_env; r.CFG["pregen"] = False
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
subprocess.run(["cmd", "/c", "mklink", "/J", str(_wt / "oren2" / "node_modules"), str(_real)], capture_output=True, check=True)
assert os.path.isjunction(_wt / "oren2" / "node_modules")
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
# Code Mode trial: every 3rd issue number; 0 = off
_cm = r.CFG.get("code_mode_every")
r.CFG["code_mode_every"] = 3; assert [n for n in range(1, 10) if r.code_mode(n)] == [3, 6, 9]
r.CFG["code_mode_every"] = 0; assert not any(r.code_mode(n) for n in range(1, 10))
r.CFG["code_mode_every"] = _cm
assert '"CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1"] if code_mode(n)' in (r.HERE / "runner.py").read_text(encoding="utf-8")
print("ok code mode trial")
