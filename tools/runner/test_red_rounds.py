# #303: repeated RED reviews never go to the owner. The last fix round uses Opus; still RED -> the orchestrator with all reviews; counted.
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
import sys; sys.argv.append("--dry-run")
import inspect, time
from pathlib import Path
import runner as r
import remote as RM
import dashboard as D

# ---- #716: the upgrade ladder replaces the fixed Opus round ----
assert r.FIX_ROUNDS == 2
assert r.LADDER == [("sonnet", "medium"), ("sonnet", "high"), ("opus", "medium"), ("opus", "high"), ("opus", "xhigh")]
for (m, e), want in zip(r.LADDER, r.LADDER[1:] + [r.LADDER[-1]]):           # every step, and the cap
    assert r.next_rung(m, e) == want, (m, e)
assert r.next_rung("opus", "xhigh") == ("opus", "xhigh")
assert r.next_rung("haiku", "medium") == ("sonnet", "high") and r.next_rung("sonnet", "low") == ("sonnet", "high")   # haiku/low never used: raised first
assert r.next_rung("claude-fable-5-2", "high") == ("claude-fable-5-2", "high")                                       # fable stays
assert r.next_rung("opus", "max") == ("opus", "max")                                                                  # max stays owner-only
assert all(e != "low" and m != "haiku" for m, e in r.LADDER) and all(r.next_rung(m, e)[1] != "low" for m in ("haiku", "sonnet", "opus") for e in ("low", "medium"))
assert r.fix_rung(1, "sonnet", "medium") == ("sonnet", "high")
assert r.fix_rung(2, "sonnet", "medium") == ("opus", "high")               # round 2 is at least opus-high
assert r.fix_rung(2, "opus", "medium") == ("opus", "xhigh") and r.fix_rung(2, "opus", "xhigh") == ("opus", "xhigh")
assert r.fix_rung(2, "claude-fable-5-2", "medium") == ("claude-fable-5-2", "medium")
# a blocked restart starts one rung above its last run
n_ = 716001
assert r.read_rung(n_) is None
r.write_rung(n_, "sonnet", "high"); assert r.read_rung(n_) is None          # not blocked: no upgrade (e.g. limit requeue)
(r.RUNS / str(n_) / "rung.blocked").write_text("1")
assert r.next_rung(*r.read_rung(n_)) == ("opus", "medium")
# the runner's words: comment + upgraded in fix_done
src = inspect.getsource(r.process_locked)
assert "Runner: upgraded to" in src and "upgraded=up" in src and "fix_rung(rnd, wm, eff)" in src and "fix_model" not in src
assert r.rung_name("opus", "high") == "opus-high" and r.rung_name("claude-fable-5-2", "high") == "fable-high"
print("ok ladder")

# ---- escalation comment: both (all) reviews, the orchestrator, never 'needs a human' ----
body = r.red_escalation(303, ["VERDICT: FIX no test for x", "VERDICT: FIX still no test", "VERDICT: FIX wrong nikud"])
assert "Review 1" in body and "no test for x" in body and "Review 2" in body and "still no test" in body and "wrong nikud" in body
assert "orchestrator" in body and "human" not in body.lower() and "owner" not in body.lower()
long = r.red_escalation(1, ["x" * 9000, "y" * 9000, "z" * 9000])
assert len(long) < 12000                                                 # fits in one issue comment
print("ok escalation text")

# ---- process(): the escalation path labels for the orchestrator, records the event, never ready-for-human ----
src = inspect.getsource(r.process_locked)
assert "needs a human" not in src and "red_escalation(" in src and '"red_escalated"' in src
assert "ready-for-human" not in inspect.getsource(r.block) and r.stuck_labels() == ["blocked", "needs-orchestrator"]
print("ok process wiring")

# ---- remote: the Opus round starts a fresh cloud session with that model (a session cannot change model) ----
calls = []
def _start(n, t, c, model=None): calls.append(("start", model)); return {"ok": True, "session": "s2"}
done = lambda: {"state": "done", "line": "RESULT: DONE https://p"}
sent = []
assert r.remote_fix(7, "s1", "FIX x", lambda s, x: sent.append(s) or {"ok": True}, _start, done, lambda s: None, lambda: 0, model="opus") == "RESULT: DONE https://p"
assert sent == [] and calls == [("start", "opus")], (sent, calls)
calls.clear()
assert r.remote_fix(7, "s1", "FIX x", lambda s, x: sent.append(s) or {"ok": True}, _start, done, lambda s: None, lambda: 0) == "RESULT: DONE https://p"
assert sent == ["s1"] and calls == []                                    # earlier rounds: same session as before
# model start refused -> retry without the model, the fix still runs
calls.clear()
def _start2(n, t, c, model=None): calls.append(model); return {"ok": model is None, "session": "s3", "error": "bad flag"}
assert r.remote_fix(7, "s1", "FIX x", None, _start2, done, lambda s: None, lambda: 0, model="opus") == "RESULT: DONE https://p"
assert calls == ["opus", None], calls
print("ok remote opus round")

# remote.start passes --model to claude
ran = []
def _run(args, **k): ran.append(args); return (0, "Created cloud session https://claude.ai/code/session_ab")
assert RM.start(7, "task", ".", run=_run, model="opus")["ok"]
cmd = next(a for a in ran if "run" in a and "--bg" in a)
assert "--model opus" in " ".join(cmd), cmd
ran.clear(); RM.start(7, "task", ".", run=_run)
assert "--model" not in " ".join(next(a for a in ran if "--bg" in a))
print("ok remote.start model")

# #713: effort in the command lines (cloud start, local claude -p, interactive agent) and in the stat events
ran.clear(); RM.start(7, "task", ".", run=_run, effort="high")
assert "--effort high" in " ".join(next(a for a in ran if "--bg" in a))
ws = []
r.with_effort(lambda n, t, c, **k: ws.append(k) or {"ok": True}, "high")(7, "t", ".", model="opus")
assert ws == [{"effort": "high", "model": "opus"}], ws
sh = []
def _fake_run(cmd, **k): sh.append(cmd); return (0, "ok")
_old = r.run; r.run = _fake_run
try:
    r.claude_hidden("p", ".", ["Read"], None, "sonnet", effort="high")
finally: r.run = _old
assert sh[0][sh[0].index("--effort") + 1] == "high", sh
assert "effort" in inspect.signature(r.agent).parameters and '"--effort"' in inspect.getsource(r.agent)
src = inspect.getsource(r.process_locked)
for ev in ("start", "review_pass", "fix_done", "resolve", "test_pass"):
    assert f'"{ev}"' in src
assert "effort=eff" in src and "model=model_name" in src
print("ok effort")

# ---- dashboard counts the escalations (24 h) ----
now = time.time()
ev = [{"ts": now - 600, "issue": 5, "event": "start"}, {"ts": now - 300, "issue": 5, "event": "red_escalated"},
      {"ts": now - 200, "issue": 6, "event": "red_escalated"}, {"ts": now - 90000, "issue": 4, "event": "red_escalated"}]
m = D.model([], [], ev, now, "")
assert m["truth"]["red_escalated"] == 2, m["truth"]
assert "to the orchestrator after 3 RED reviews: 2" in D.text(m)
print("ok dashboard count")
