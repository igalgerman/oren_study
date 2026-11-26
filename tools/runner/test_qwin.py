"""#220/#368/#390 owner questions with fakes: page + phone push together (through an idle inbox/orchestrator), no duplicates, max 3, 2 h reminder, push result logged, answer relayed.
Run: python3 tools/runner/test_qwin.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
import json, re, sys, tempfile
from pathlib import Path
sys.argv.append("--dry-run")
import runner as R
import owner_q as OQ
import qwin as QW

tmp = Path(tempfile.mkdtemp())
OQ.STATE, QW.STATE, QW.DIR = tmp / "owner_q.json", tmp / "qwin.json", tmp / "questions"
QW.log = lambda m: None

class FakeHerdr:
    """hc + herdr-app pin: terminals by name."""
    def __init__(self): self.t, self.calls, self.pins, self.sent, self.status, self.screen = {}, [], [], [], {}, {}
    def hc(self, *a, **kw):
        self.calls.append(a)
        if a[0] == "run":
            name = a[a.index("--name") + 1]; self.t[name] = {"name": name, "state": "live", "address": f"w{len(self.calls)}", "argv": a}
            return 0, "ok"
        if a[0] == "get": return 0, json.dumps(self.t.get(a[1], {}))
        if a[0] == "kill": (a[1] in self.t) and self.t[a[1]].update(state="done"); return 0, ""
        if a[0] == "rm": self.t.pop(a[1], None); return 0, ""
        if a[0] == "send": self.sent.append((a[1], a[2])); return 0, ""
        if a[0] == "read": return 0, self.screen.get(a[1], "")
        return 0, ""
    def run(self, cmd, **kw):
        if "terminal.pin" in cmd: self.pins.append((cmd[cmd.index("--terminal") + 1], cmd[-1]))
        return 0, ""
    def ts(self): return list(self.t.values()) + [{"name": n, "state": "live", "status": self.status.get(n, "idle")} for n in ("orchestrator", "inbox")]

h = FakeHerdr()
QW._hc, QW._run, QW._herdr_ok = h.hc, h.run, lambda: True

qs = [{"key": f"k{i}", "window": f"#{i}", "source": src, "text": f"שאלה {i}?", "url": f"u{i}"}
      for i, src in [(1, "issue-1"), (2, "review-2"), (3, "remote-3"), (4, "intake-4"), (5, "orchestrator")]]
qs[4]["window"] = "orchestrator"
opened = [dict(q) for q in qs]
OQ.open_list = lambda gh=None: [dict(q) for q in opened]
win = lambda: sorted(n for n, t in h.t.items() if t["state"] == "live" and n.startswith("question-"))

class FakeSpawn:
    """#368: ask.py started by qwin.tick itself (no LLM): records the command, hands back a pid."""
    def __init__(self): self.cmds, self.killed = [], []
    def spawn(self, cmd, out, err):
        self.cmds.append(cmd); return 4000 + len(self.cmds)
    def kill(self, pid): self.killed.append(pid)
sp = FakeSpawn()
QW._spawn, QW._kill = sp.spawn, sp.kill
asked = lambda: [Path(c[c.index(QW.ASK) + 1]).stem for c in sp.cmds]

# #368/#390: the first tick writes the question page AND sends the phone push at the same moment (owner 26 Nov 20:15),
# through the long-lived idle inbox session (a freshly opened window is 'active' for Claude Code: push skipped)
h.status = {"inbox": "idle", "orchestrator": "idle"}
QW.tick(h.ts(), now=1000)
assert asked() == ["k1", "k2", "k3"], sp.cmds                                         # at most 3 at once, oldest first
c = sp.cmds[2]
assert c[0] == sys.executable and c[c.index(QW.ASK) + 2:] == ["--timeout-min", "1440"], c
d3 = json.loads((QW.DIR / "k3.json").read_text(encoding="utf-8"))
assert d3["questions"][0]["text"] == "שאלה 3?" and d3["questions"][0]["id"] == "a", d3
assert d3["questions"][0].get("free") or d3["questions"][0].get("other"), d3
assert QW.load()["k3"]["pid"] == 4003
assert not any(a[0] == "run" for a in h.calls), h.calls                               # #390: no question window is opened any more
pushes = [s for s in h.sent if "PushNotification" in s[1]]
assert [s[0] for s in pushes] == ["inbox", "orchestrator"], pushes                    # one push per idle session per tick
for s in pushes: assert "\n" not in s[1] and "\r" not in s[1], s                       # one line (#390)
m = pushes[0][1]
assert "owner-q:k1" in m and "שאלה 1?" in m and "qwin.py answer k1" in m and "PUSH-RESULT" in m, m
assert QW.load()["k1"]["via"] == "inbox" and QW.load()["k2"]["via"] == "orchestrator" and not QW.load()["k3"].get("via")
# a busy session gets nothing; k3 waits for the next tick with an idle session
h.status = {"inbox": "working", "orchestrator": "working"}; h.sent.clear()
(QW.DIR / "k3.log").write_text("http://127.0.0.1:5555/\n", encoding="utf-8")
QW.tick(h.ts(), now=1060)
assert QW.load()["k3"]["page"] == "http://127.0.0.1:5555/" and len(sp.cmds) == 3
assert not [s for s in h.sent if "PushNotification" in s[1]], h.sent
h.status = {"inbox": "done", "orchestrator": "working"}
QW.tick(h.ts(), now=1120)
assert [s[0] for s in h.sent if "owner-q:k3" in s[1]] == ["inbox"] and QW.load()["k3"]["via"] == "inbox", h.sent
QW.tick(h.ts(), now=1180); assert sum("owner-q:k3" in s[1] for s in h.sent) == 1        # pushed once
# options in the question text -> radio buttons (recommended first), still with 'other'
d = QW.page_data({"key": "x", "text": "איזה צבע? 1) ירוק (מומלץ) 2) כחול"})["questions"][0]
assert d["text"] == "איזה צבע?" and d["options"] == ["ירוק (מומלץ)", "כחול"] and d["other"], d
assert "1. ירוק" in QW.push_text({"text": "איזה צבע? 1) ירוק 2) כחול"})
pm = QW.push_message({"key": "z", "text": "איזה צבע? 1) ירוק 2) כחול"})
assert "\n" not in pm and "1. ירוק" in pm and "2. כחול" in pm and "AskUserQuestion" in pm, pm   # never asked in the terminal (#310)
assert not re.search(r"#\d", pm.replace("#390", "")), pm                               # #368: no issue refs to go reading
# a second question of the same issue waits for the first one
assert QW.plan([qs[0], {**qs[0], "key": "k1b"}], [], {}, 0)[0] == [qs[0]]
# question 1 answered (elsewhere): ask.py stopped, the oldest waiting (#4) gets its page and its push
h.status = {"inbox": "idle", "orchestrator": "idle"}
opened.pop(0)
QW.tick(h.ts(), now=1300)
assert 4001 in sp.killed and asked()[-1] == "k4", (sp.killed, asked())
assert "k1" not in QW.load() and QW.load()["k4"]["via"] in ("inbox", "orchestrator")
QW.tick(h.ts(), now=1360); assert len(sp.cmds) == 4                             # the orchestrator question still waits (3 open)
# 2 h unanswered: one reminder through the same session, when it is idle
h.sent.clear()
QW.tick(h.ts(), now=1000 + 7200); QW.tick(h.ts(), now=1000 + 7300)
rem = [s for s in h.sent if s[1].startswith("WATCHDOG REMINDER")]
assert sorted((s[0], re.search(r"owner-q:(\w+)", s[1])[1]) for s in rem) == [("inbox", "k3"), ("orchestrator", "k2")], rem
assert all("PushNotification" in s[1] and "\n" not in s[1] for s in rem), rem
assert asked().count("k2") == 1
# #280 stuck.py's later re-push goes to the session that sent the first push (no question window any more)
import stuck as SK
SK.R.hc = lambda *a, **kw: (h.sent.append((a[1], a[2])), (0, ""))[1]
h.sent.clear()
assert SK.push({"key": "k3", "text": "שאלה 3?"}, "WATCHDOG REMINDER: 4 hours.") and h.sent[0][0] == "inbox", h.sent
assert "owner-q:k3" in h.sent[0][1] and "\n" not in h.sent[0][1], h.sent
assert not SK.push({"key": "nope", "text": "?"}, "x")                                # never pushed: the caller tells the orchestrator
SK.R.hc = R.hc
print("ok qwin page + phone push together")

# ---- answer relayed: issue + questions issue + orchestrator; a cloud worker gets it in its session ----
gh_calls, marked, remote_sent = [], [], []
QW._gh = lambda *a, **kw: (gh_calls.append(a), (0, json.dumps({"comments": [{"body": "Running in a cloud session: https://claude.ai/code/session_01ABC"}]})))[1]
OQ.mark_answered = lambda key, answer="", gh=None: (marked.append((key, answer)), True)[1]
QW._send_remote = lambda s, t: (remote_sent.append((s, t)), {"ok": True})[1]
h.sent.clear()
d = QW.answer("k3", "ירוק")
assert d == {"issue": True, "answered": True, "remote": True, "stopped": True}, d
assert 4003 in sp.killed                                                             # the chat won: ask.py (the page) is stopped
assert any(a[:3] == ("issue", "comment", "3") and "ירוק" in a[-1] for a in gh_calls), gh_calls
assert marked == [("k3", "ירוק")]
assert remote_sent and remote_sent[0][0] == "session_01ABC" and "ירוק" in remote_sent[0][1]
assert any(s[0] == "orchestrator" and "ירוק" in s[1] for s in h.sent), h.sent
# a local window's answer: the orchestrator relays it (no remote send)
remote_sent.clear(); h.sent.clear()
QW.answer("k2", "1")
assert not remote_sent and any(s[0] == "orchestrator" and "review-2" in s[1] for s in h.sent)
print("ok qwin answer relayed")

# #368: the page answered: tick reads <key>.answers.json itself and relays it (no LLM)
marked.clear(); h.sent.clear(); n_kill = len(sp.killed)
(QW.DIR / "k4.answers.json").write_text(json.dumps({"answers": {"a": "כחול"}}, ensure_ascii=False), encoding="utf-8")
QW.tick(h.ts(), now=9100)
assert marked == [("k4", "כחול")], marked
assert len(sp.killed) == n_kill
assert any(s[0] == "orchestrator" and "כחול" in s[1] for s in h.sent), h.sent
QW.tick(h.ts(), now=9160); assert marked == [("k4", "כחול")]                          # relayed once
print("ok qwin page answer read by python")

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

# #390: the push's result is checked on the pushing session's screen and logged once: Claude Code's 'Not sent' (or the
# session's own PUSH-RESULT line) -> watchdog.log says so (second channel: Telegram, #440, once set up); ok -> logged too
logged = []
QW.log = logged.append
h4 = FakeHerdr(); QW._hc, QW._run = h4.hc, h4.run
st = {"n1": {"name": "question-1", "since": 0, "via": "inbox", "pushed": 0},
      "n2": {"name": "question-2", "since": 0, "via": "orchestrator", "pushed": 0},
      "n3": {"name": "question-3", "since": 0, "via": "inbox", "pushed": 0}}
h4.screen = {"inbox": "old: PushNotification Not sent because you're active\n> PHONE PUSH (owner-q:n1, #390) ...\n"
                      "PushNotification\n  Not sent because you're active in this terminal.\nPUSH-RESULT n1 failed active\n"
                      "> PHONE PUSH (owner-q:n3, #390) ...\nPushNotification\nPUSH-RESULT n3 ok\n",
             "orchestrator": "> PHONE PUSH (owner-q:n2, #390) ... write PUSH-RESULT <key> ok or PUSH-RESULT <key> failed <reason>\n"}
QW.check_pushes(st, now=60); QW.check_pushes(st, now=120)
assert st["n1"]["not_sent"] and not st["n3"].get("not_sent") and st["n3"]["push_ok"], st
assert len([l for l in logged if "n1" in l or "question-1" in l]) == 1 and "#440" in logged[0] and "not sent" in logged[0].lower(), logged
assert any("question-3" in l and "sent" in l for l in logged), logged
assert not st["n2"].get("not_sent") and not st["n2"].get("push_ok")                 # its own request text is not a result
QW.check_pushes(st, now=QW.RESULT_S + 10)                                            # no result line in 10 min: said once
assert st["n2"]["no_result"] and sum("question-2" in l for l in logged) == 1, logged
QW.check_pushes(st, now=QW.RESULT_S + 70); assert sum("question-2" in l for l in logged) == 1
print("ok qwin push result logged")

# #390: no idle session for 10 min -> logged once (the page still has the question); then the push goes when one is idle
logged.clear()
h5 = FakeHerdr(); h5.status = {"inbox": "working", "orchestrator": "blocked"}; QW._hc, QW._run = h5.hc, h5.run
QW.STATE = tmp / "qwin5.json"
opened[:] = [{"key": "w1", "window": "#9", "source": "issue-9", "text": "צבע כפתור?", "url": "u"}]
for k in range(12): QW.tick(h5.ts(), now=20000 + 60 * k)
assert not h5.sent and sum("no idle session" in l for l in logged) == 1, (h5.sent, logged)
h5.status["inbox"] = "idle"; QW.tick(h5.ts(), now=21000)
assert [s[0] for s in h5.sent] == ["inbox"] and "צבע כפתור?" in h5.sent[0][1], h5.sent
QW.log = lambda m: None
print("ok qwin waits for an idle session")

# #390: question windows are no longer used: every live question-* window (old ones too) is unpinned and closed
h3 = FakeHerdr()
QW._hc, QW._run = h3.hc, h3.run
QW.STATE = tmp / "qwin3.json"
h3.t["question-cb326d"] = {"name": "question-cb326d", "state": "live", "address": "wx"}
h3.t["question-7"] = {"name": "question-7", "state": "live", "address": "wy"}
QW.save({"k7": {"name": "question-7", "since": 40000, "via": "inbox"}})
opened[:] = [{"key": "k7", "window": "#7", "source": "issue-7", "text": "?", "url": "u"}]
QW.tick(h3.ts(), now=40060)
assert "question-cb326d" not in h3.t and ("wx", "false") in h3.pins and "question-7" not in h3.t, h3.t
assert "k7" in QW.load()                                                             # its question is still open
print("ok qwin leftovers closed")

# #368 real process: the real _spawn starts the real ask.py (no browser), the URL is read from its log,
# an answer POSTed to the page lands in <key>.answers.json and page_answer reads it
import importlib, time, urllib.request
os.environ["ASK_NO_BROWSER"] = "1"
real = importlib.reload(QW); real.DIR, real.log = tmp / "real", lambda m: None
pid = real.start_page({"key": "r1", "text": "איזה צבע? 1) ירוק 2) כחול"})
try:
    assert pid > 0
    for _ in range(100):
        if real.page_url("r1"): break
        time.sleep(0.1)
    url = real.page_url("r1"); assert url.startswith("http://127.0.0.1:"), (tmp / "real" / "r1.log").read_text()
    html = urllib.request.urlopen(url, timeout=5).read().decode("utf-8")
    assert "איזה צבע?" in html and "ירוק" in html and 'dir="rtl"' in html
    urllib.request.urlopen(urllib.request.Request(url + "answer", data=json.dumps({"a": "כחול"}).encode(), method="POST"), timeout=5)
    for _ in range(100):
        if real.page_answer("r1") is not None: break
        time.sleep(0.1)
    assert real.page_answer("r1") == "כחול", real.page_answer("r1")
finally:
    real._kill(pid)
print("ok qwin real ask.py page")
