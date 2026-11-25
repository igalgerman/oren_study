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
assert r.CFG["max_core"] == 2
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
assert "git fetch origin && git merge origin/main" in r.resolve_prompt(7, ["a.js"]) and "RESULT: DONE" in r.resolve_prompt(7, ["a.js"]) and "force" in r.resolve_prompt(7, [])
print("ok resolve")

# routing: STUCK / runner error -> orchestrator (not the owner); a parked question -> the owner
assert r.stuck_labels() == ["blocked", "needs-orchestrator"] and "ready-for-human" not in r.stuck_labels()
import inspect
assert '"ready-for-human"' in inspect.getsource(r.park_issue) and "ready-for-human" not in inspect.getsource(r.block)
print("ok routing")

# observer scheduling + parse
assert W.observer_due(0, 1800, 30, False) and not W.observer_due(0, 1799, 30, False) and not W.observer_due(0, 99999, 30, True)
assert W.parse_observer("OBSERVER: OK\nOBSERVER-END") == []
_p = W.parse_observer("noise\nOBSERVER: #3 needs no owner → label ready-for-agent\nOBSERVER: backlog low → add work\nOBSERVER-END")
assert _p == ["OBSERVER: #3 needs no owner → label ready-for-agent", "OBSERVER: backlog low → add work"]
assert len(W.parse_observer(NL.join(f"OBSERVER: p{i} → f" for i in range(12)))) == 8
print("ok observer")

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
assert r.deploy_text(None).startswith("deployed ok https://") and any("pregen.js" in " ".join(map(str, c)) for c in _calls)
r.run, r.env_file = _orig_run, _orig_env; r.CFG["pregen"] = False
print("ok deploy")
