"""#220 question windows with fakes: one window per question, no duplicates, max 3, closed after the answer, 2 h reminder, answer relayed.
Run: python3 tools/runner/test_qwin.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
import json, sys, tempfile
from pathlib import Path
sys.argv.append("--dry-run")
import runner as R
import owner_q as OQ
import qwin as QW

tmp = Path(tempfile.mkdtemp())
OQ.STATE, QW.STATE, QW.DIR = tmp / "owner_q.json", tmp / "qwin.json", tmp / "questions"
QW.log = lambda m: None
QW.space_args = lambda: ["--label", "herdr.space=ctl"]

class FakeHerdr:
    """hc + herdr-app pin: terminals by name."""
    def __init__(self): self.t, self.calls, self.pins, self.sent = {}, [], [], []
    def hc(self, *a, **kw):
        self.calls.append(a)
        if a[0] == "run":
            name = a[a.index("--name") + 1]; self.t[name] = {"name": name, "state": "live", "address": f"w{len(self.calls)}", "argv": a}
            return 0, "ok"
        if a[0] == "get": return 0, json.dumps(self.t.get(a[1], {}))
        if a[0] == "kill": (a[1] in self.t) and self.t[a[1]].update(state="done"); return 0, ""
        if a[0] == "rm": self.t.pop(a[1], None); return 0, ""
        if a[0] == "send": self.sent.append((a[1], a[2])); return 0, ""
        return 0, ""
    def run(self, cmd, **kw):
        if "terminal.pin" in cmd: self.pins.append((cmd[cmd.index("--terminal") + 1], cmd[-1]))
        return 0, ""
    def ts(self): return list(self.t.values()) + [{"name": "orchestrator", "state": "live"}]

h = FakeHerdr()
QW._hc, QW._run, QW._herdr_ok = h.hc, h.run, lambda: True

qs = [{"key": f"k{i}", "window": f"#{i}", "source": src, "text": f"שאלה {i}?", "url": f"u{i}"}
      for i, src in [(1, "issue-1"), (2, "review-2"), (3, "remote-3"), (4, "intake-4"), (5, "orchestrator")]]
qs[4]["window"] = "orchestrator"
opened = [dict(q) for q in qs]
OQ.open_list = lambda gh=None: [dict(q) for q in opened]
win = lambda: sorted(n for n, t in h.t.items() if t["state"] == "live" and n.startswith("question-"))

# one window per question, oldest first, at most 3 at once; ticks repeat: no duplicates
for k in range(3): QW.tick(h.ts(), now=1000 + 60 * k)
assert win() == ["question-1", "question-2", "question-3"], win()
assert sum(a[0] == "run" for a in h.calls) == 3, h.calls
argv = h.t["question-3"]["argv"]
assert argv[argv.index("--model") + 1] == "haiku" and argv[argv.index("--remote-control") + 1] == "oren-question-3"
assert "herdr.space=ctl" in argv and "role=question" in argv
# #281: claude starts through Git Bash like the worker windows (hc cannot start claude.CMD directly)
assert R.BASH in argv and argv[argv.index(R.BASH) + 1] == "-c" and argv.index(R.BASH) < argv.index("--model"), argv
assert argv[argv.index(R.BASH) + 3] == "_" and argv[argv.index(R.BASH) + 4] == R.CFG["extra_path"], argv
p = argv[-1]
assert "tools/ask/ask.py" in p and "PushNotification" in p and "(מומלץ)" in p and "qwin.py answer k3" in p and "שאלה 3?" in p and "TaskStop" in p
assert [x for x in h.pins if x[1] == "true"].__len__() == 3                     # pinned on top
# #310: the owner is never asked inside the terminal (AskUserQuestion shows reversed Hebrew there): tool removed + prompt says so
assert argv[argv.index("--disallowedTools") + 1] == "AskUserQuestion" and argv.index("--disallowedTools") < argv.index("--"), argv
assert "never" in p.lower() and "AskUserQuestion" in p and "page URL" in p, p
# a second question of the same issue waits for the first one's window
assert QW.plan([qs[0], {**qs[0], "key": "k1b"}], [], {}, 0)[0] == [qs[0]]
# question 1 answered: its window is unpinned + closed, the oldest waiting (#4) opens
opened.pop(0)
QW.tick(h.ts(), now=1300)
assert win() == ["question-2", "question-3", "question-4"], win()
assert any(x[1] == "false" for x in h.pins) and "question-1" not in h.t
QW.tick(h.ts(), now=1360); assert sum(a[0] == "run" for a in h.calls) == 4     # the orchestrator question still waits (3 open)
# 2 h unanswered: one reminder, the window stays
QW.tick(h.ts(), now=1000 + 7200); QW.tick(h.ts(), now=1000 + 7300)
rem = [s for s in h.sent if s[1].startswith("WATCHDOG REMINDER")]
assert sorted(s[0] for s in rem) == ["question-2", "question-3"], rem               # question-4 opened later: not yet
assert "question-2" in win()
# a question that already had a window never gets a second one (window gone, question still open)
h.t["question-2"]["state"] = "done"
QW.tick(h.ts(), now=9000)
assert sum(a[0] == "run" and a[a.index("--name") + 1] == "question-2" for a in h.calls) == 1
print("ok qwin windows")

# ---- answer relayed: issue + questions issue + orchestrator; a cloud worker gets it in its session ----
gh_calls, marked, remote_sent = [], [], []
QW._gh = lambda *a, **kw: (gh_calls.append(a), (0, json.dumps({"comments": [{"body": "Running in a cloud session: https://claude.ai/code/session_01ABC"}]})))[1]
OQ.mark_answered = lambda key, answer="", gh=None: (marked.append((key, answer)), True)[1]
QW._send_remote = lambda s, t: (remote_sent.append((s, t)), {"ok": True})[1]
h.sent.clear()
d = QW.answer("k3", "ירוק")
assert d == {"issue": True, "answered": True, "remote": True, "closed": True}, d
assert any(a[:3] == ("issue", "comment", "3") and "ירוק" in a[-1] for a in gh_calls), gh_calls
assert marked == [("k3", "ירוק")]
assert remote_sent and remote_sent[0][0] == "session_01ABC" and "ירוק" in remote_sent[0][1]
assert any(s[0] == "orchestrator" and "ירוק" in s[1] for s in h.sent), h.sent
# #310: the window closes itself once the answer is recorded (unpinned + killed)
assert ("kill", "question-3") in [a[:2] for a in h.calls] and h.t.get("question-3", {}).get("state") != "live", h.t.get("question-3")
# a local window's answer: the orchestrator relays it (no remote send)
remote_sent.clear(); h.sent.clear()
QW.answer("k2", "1")
assert not remote_sent and any(s[0] == "orchestrator" and "review-2" in s[1] for s in h.sent)
print("ok qwin answer relayed")

# owner_q keeps the asking window (source) for the relay
b = OQ.body("abcdef012345", "remote-7", "QUESTION: כן או לא?")
q = OQ.open_questions([{"body": b, "url": "u"}])[0]
assert q["window"] == "#7" and q["source"] == "remote-7" and QW.win_name(q) == "question-7", q
print("ok qwin source")

# #135: a runner-managed cloud issue (.runs/<n>/where = remote): the answer is NOT sent here; the runner resumes the session with it
(R.RUNS / "3").mkdir(parents=True, exist_ok=True); (R.RUNS / "3" / "where").write_text("remote")
remote_sent.clear(); h.sent.clear(); gh_calls.clear()
d = QW.answer("k3", "ירוק")
assert not remote_sent and d.get("remote") is None, (d, remote_sent)
assert any(a[:3] == ("issue", "comment", "3") and "OWNER ANSWER" in a[-1] for a in gh_calls)   # the issue comment the runner resumes from
assert any(s[0] == "orchestrator" and "resume" in s[1] for s in h.sent), h.sent
(R.RUNS / "3" / "where").unlink()
print("ok qwin runner-managed cloud answer")

# #281: a window that cannot open is not retried silently every minute: after 2 failures the orchestrator is told ONCE
# to send the phone push itself (question text + link); no more retries for that question
h2 = FakeHerdr()
def failing_hc(*a, **kw):
    if a[0] == "run": h2.calls.append(a); return 1, "spawn_failed cannot start C:\\...\\claude.CMD"
    return h2.hc(*a, **kw)
QW._hc, QW._run = failing_hc, h2.run
QW.STATE, QW.FAILS = tmp / "qwin2.json", tmp / "qwin2_fails.json"
opened[:] = [{"key": "f1", "window": "#9", "source": "issue-9", "text": "צבע כפתור?", "url": "https://github.com/x/issues/193#c1"}]
for k in range(5): QW.tick(h2.ts(), now=20000 + 60 * k)
assert sum(a[0] == "run" for a in h2.calls) == 2, h2.calls                          # tried twice, then stopped
told = [s for s in h2.sent if s[0] == "orchestrator"]
assert len(told) == 1, told
assert "PushNotification" in told[0][1] and "צבע כפתור?" in told[0][1] and "issues/193#c1" in told[0][1] and "question-9" in told[0][1], told
# answered later: the state entry goes, nothing else is sent
opened.clear(); QW.tick(h2.ts(), now=30000)
assert QW.load() == {} and len([s for s in h2.sent if s[0] == "orchestrator"]) == 1
print("ok qwin open failure -> one push via the orchestrator")

# #310: the watchdog closes leftover question windows (no open question of its own, e.g. answered in the terminal)
h3 = FakeHerdr()
QW._hc, QW._run = h3.hc, h3.run
QW.STATE, QW.FAILS = tmp / "qwin3.json", tmp / "qwin3_fails.json"
h3.t["question-cb326d"] = {"name": "question-cb326d", "state": "live", "address": "wx"}
h3.t["question-7"] = {"name": "question-7", "state": "live", "address": "wy"}
QW.save({"k7": {"name": "question-7", "since": 40000}})
opened[:] = [{"key": "k7", "window": "#7", "source": "issue-7", "text": "?", "url": "u"}]
QW.tick(h3.ts(), now=40060)
assert "question-cb326d" not in h3.t and ("wx", "false") in h3.pins, h3.t          # leftover: unpinned + gone
assert h3.t["question-7"]["state"] == "live"                                         # its question is still open: stays
print("ok qwin leftovers closed")
