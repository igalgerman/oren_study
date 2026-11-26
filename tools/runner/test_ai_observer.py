"""#203 AI observer with a fake claude: output parsing, repeat filter, never two at once, off when 0. Run: python3 tools/runner/test_ai_observer.py"""
import json, subprocess, sys, tempfile, threading, time
from pathlib import Path
sys.argv.append("--dry-run")
import runner as R
import ai_observer as A
import owner_q as OQ
import observer as ob

tmp = Path(tempfile.mkdtemp())
A.LAST, A.STATE = tmp / "ai_observer.last", tmp / "ai_observer.state.json"
A.lock_text = lambda: "merge lock: free"
OQ.STATE = tmp / "owner_q.json"

class FakeClaude:
    """Stands in for subprocess.run: records the command, answers with `out` (optionally waits for `gate`)."""
    def __init__(self, out="no problems", rc=0, gate=None, timeout=False): self.out, self.rc, self.gate, self.timeout, self.calls = out, rc, gate, timeout, []
    def __call__(self, cmd, **kw):
        self.calls.append((cmd, kw))
        if self.gate: self.gate.wait(5)
        if self.timeout: raise subprocess.TimeoutExpired(cmd, kw.get("timeout"))
        return subprocess.CompletedProcess(cmd, self.rc, self.out, "")

# ---- parsing ----
out = ("Let me check.\nOBSERVER: #141 ready-for-human but still Blocked by #140 (open) -> orchestrator: label blocked\n"
       "- OBSERVER: #142 in-progress with no worker -> orchestrator: rerun\n" + "".join(f"OBSERVER: #{n} x -> worker\n" for n in range(1, 6)))
f = A.parse(out)
assert len(f) == 5 and f[0].startswith("OBSERVER: #141 ready-for-human") and f[1] == "OBSERVER: #142 in-progress with no worker -> orchestrator: rerun"
assert A.parse("no problems\n") == [] and A.parse("No problems.") == []
assert A.parse("I could not run gh") is None and A.parse("") is None
assert A.for_owner("OBSERVER: #9 needs a decision -> owner: pick a colour") and not A.for_owner("OBSERVER: #9 owner lane wrong -> orchestrator: relabel")
print("ok parse")

# ---- repeat filter: same issue + same text start not again within 6 h ----
a, b = "OBSERVER: #141 ready-for-human but still Blocked by #140 -> orchestrator", "OBSERVER: #141 ready-for-human but still Blocked by #140, now 2h -> orchestrator"
new, sent = A.fresh([a], {}, 1000)
assert new == [a]
assert A.fresh([b], sent, 1000 + 3600)[0] == []                         # same issue + same start, 1 h later
assert A.fresh(["OBSERVER: #142 ready-for-human but still Blocked by #140 -> x"], sent, 1000 + 60)[0] != []   # other issue
assert A.fresh([a], sent, 1000 + 6 * 3600 + 1)[0] == [a]                 # after 6 h: again
assert A.fresh([a, a], {}, 0)[0] == [a]                                  # twice in one run: once
print("ok repeat filter")

# ---- one run: command line, .last file, tell only new, owner finding -> #193 when it exists ----
told, logs, gh_calls = [], [], []
def fake_gh(*a, **kw):
    gh_calls.append(a)
    if a[:2] == ("issue", "list"): return 0, json.dumps([{"number": 193, "title": OQ.TITLE}])
    if a[:2] == ("issue", "view"): return 0, json.dumps({"comments": []})
    return 0, "https://github.com/x/y/issues/193#c1\n"
OQ.GH = fake_gh
fc = A.RUN = FakeClaude("OBSERVER: #50 waits for a colour choice -> owner: choose blue or green\nOBSERVER: #51 red check -> worker: fix")
assert A.run_once(told.append, logs.append, now=10**6) == ["OBSERVER: #50 waits for a colour choice -> owner: choose blue or green", "OBSERVER: #51 red check -> worker: fix"]
cmd, kw = fc.calls[0]
assert cmd[1:6] == ["-p", "--model", "sonnet", "--no-session-persistence", "--tools"] and kw["timeout"] == 600 and "OBSERVER:" in kw["input"]
assert "Bash(gh:*)" in cmd and "Bash(python tools/runner/remote.py status:*)" in cmd and "Bash(gh issue comment:*)" in cmd[cmd.index("--disallowedTools"):]
assert "Edit" not in cmd and "Write" not in cmd
assert "#51 red check" in A.LAST.read_text(encoding="utf-8") and len(told) == 1 and "#50" in told[0] and "#51" in told[0]
assert [c for c in gh_calls if c[:2] == ("issue", "comment")] and "choose blue or green" in [c for c in gh_calls if c[:2] == ("issue", "comment")][0][4]
n_comments = len([c for c in gh_calls if c[:2] == ("issue", "comment")])
assert A.run_once(told.append, logs.append, now=10**6 + 3600) and len(told) == 1          # same findings an hour later: not sent again
assert len([c for c in gh_calls if c[:2] == ("issue", "comment")]) == n_comments
OQ.GH = lambda *a, **kw: (0, "[]") if a[:2] == ("issue", "list") else (_ for _ in ()).throw(AssertionError("posted without #193"))
A.RUN = FakeClaude("OBSERVER: #60 decide the level -> owner: pick")
A.run_once(told.append, logs.append, now=10**6 + 7200); assert len(told) == 2           # told the orchestrator, no owner issue: no post
A.RUN = FakeClaude("no problems"); assert A.run_once(told.append, logs.append) == [] and len(told) == 2
assert "no problems" in A.LAST.read_text(encoding="utf-8")
A.RUN = FakeClaude(timeout=True); assert A.run_once(told.append, logs.append) is None and "timeout" in A.LAST.read_text(encoding="utf-8")
A.RUN = FakeClaude("blah", rc=1); assert A.run_once(told.append, logs.append) is None and "failed" in A.LAST.read_text(encoding="utf-8") and len(told) == 2
print("ok run")

# ---- run_if_due: never two at once, hourly, off when 0 ----
A.STATE.unlink()
gate = threading.Event(); A.RUN = FakeClaude("no problems", gate=gate)
assert A.run_if_due(told.append, logs.append, minutes=0) is False                        # off
assert A.run_if_due(told.append, logs.append, minutes=60) is True
assert A.run_if_due(told.append, logs.append, minutes=60, now=time.time() + 7200) is False   # first still running: never two
gate.set()
for _ in range(100):
    if not A._running["v"]: break
    time.sleep(0.05)
assert not A._running["v"] and len(A.RUN.calls) == 1
assert A.run_if_due(told.append, logs.append, minutes=60) is False                       # ran < 60 min ago
assert A.run_if_due(told.append, logs.append, minutes=60, now=time.time() + 3601) is True
for _ in range(100):
    if not A._running["v"]: break
    time.sleep(0.05)
_cfg = dict(R.CFG); R.CFG["ai_observer_minutes"] = 0
assert A.run_if_due(told.append, logs.append, now=time.time() + 10**6) is False          # config 0 = off
R.CFG.clear(); R.CFG.update(_cfg)
print("ok due")

# ---- observer v2 learns cloud lanes: no local run window by design ----
_I = lambda n, L: {"number": n, "labels": L, "touched_min_ago": 5, "no_run_min": 60, "body": ""}
_S = lambda i: {"issues": i, "orchestrator": "idle", "orchestrator_idle_min": 40, "integrating": False}
assert ob.rules(_S([_I(3, ["in-progress", "cloud"])])) == []
assert ob.rules(_S([_I(3, ["in-progress"])]))[0][:2] == ("rerun", 3)
print("ok cloud lanes")
