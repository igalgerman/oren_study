# #303: repeated RED reviews never go to the owner. The last fix round uses Opus; still RED -> the orchestrator with all reviews; counted.
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
import sys; sys.argv.append("--dry-run")
import inspect, time
from pathlib import Path
import runner as r
import remote as RM
import dashboard as D

# ---- the last fix round uses Opus (never a weaker model; fable stays fable) ----
assert r.FIX_ROUNDS == 2
assert r.fix_model(1, "sonnet") == "sonnet"
assert r.fix_model(2, "sonnet") == "opus" and r.fix_model(2, "haiku") == "opus"
assert r.fix_model(2, "opus") == "opus" and r.fix_model(2, "claude-fable-5-2") == "claude-fable-5-2"
print("ok fix model")

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
assert "fix_model(rnd, wm)" in src
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

# ---- dashboard counts the escalations (24 h) ----
now = time.time()
ev = [{"ts": now - 600, "issue": 5, "event": "start"}, {"ts": now - 300, "issue": 5, "event": "red_escalated"},
      {"ts": now - 200, "issue": 6, "event": "red_escalated"}, {"ts": now - 90000, "issue": 4, "event": "red_escalated"}]
m = D.model([], [], ev, now, "")
assert m["truth"]["red_escalated"] == 2, m["truth"]
assert "to the orchestrator after 3 RED reviews: 2" in D.text(m)
print("ok dashboard count")
