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
