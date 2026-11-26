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
        if a[0] == "kill": self.t[a[1]]["state"] = "done"; return 0, ""
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
p = argv[-1]
assert "tools/ask/ask.py" in p and "PushNotification" in p and "(מומלץ)" in p and "qwin.py answer k3" in p and "שאלה 3?" in p and "TaskStop" in p
assert [x for x in h.pins if x[1] == "true"].__len__() == 3                     # pinned on top
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
assert d == {"issue": True, "answered": True, "remote": True}, d
assert any(a[:3] == ("issue", "comment", "3") and "ירוק" in a[-1] for a in gh_calls), gh_calls
assert marked == [("k3", "ירוק")]
assert remote_sent and remote_sent[0][0] == "session_01ABC" and "ירוק" in remote_sent[0][1]
assert any(s[0] == "orchestrator" and "ירוק" in s[1] for s in h.sent), h.sent
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
