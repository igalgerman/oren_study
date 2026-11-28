"""#220/#368/#390 owner questions with fakes: page + phone push together (through an idle inbox/orchestrator), no duplicates, max 3, 2 h reminder, push result logged, answer relayed.
Run: python3 tools/runner/test_qwin.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
os.environ["OREN_TELEGRAM_ENV"] = os.path.join(os.environ["RUNNER_RUNS"], "no-telegram.env")   # #440: off unless a test sets it up
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
import json, re, sys, tempfile
import re, trust   # #800: old fixtures have no author: default them to the owner (explicit authors still count; test_trust.py covers the real rules)
_login = trust.login
trust.login = lambda c: _login(c) or (("oren-study-bot" if re.match(r"\s*(OWNER ANSWER|ANSWERED)", c.get("body") or "") or "owner-answer:" in (c.get("body") or "") else "igalgerman") if isinstance(c, dict) else "")
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
    def __init__(self): self.cmds, self.killed, self.live = [], [], set()
    def spawn(self, cmd, out, err):
        self.cmds.append(cmd); self.live.add(4000 + len(self.cmds)); return 4000 + len(self.cmds)
    def kill(self, pid): self.killed.append(pid); self.live.discard(pid)
    def alive(self, pid): return pid in self.live          # #894: the fake pid check
sp = FakeSpawn()
QW._spawn, QW._kill, QW._alive = sp.spawn, sp.kill, sp.alive
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
assert "owner-q:k1" in m and "שאלה 1?" in m and "qwin.py answer" not in m and "PUSH-RESULT" in m, m   # #803: no session records an answer
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
# #699: one Hebrew line, options as buttons, details under 'עוד' (page); Telegram: line + options + page link, no details
lq = {"key": "d1", "text": "לשחרר את הגרסה? 1) כן 2) לא\nפירוט ארוך: הרבה הקשר כאן"}
d = QW.page_data(lq)["questions"][0]
assert d["text"] == "לשחרר את הגרסה?" and d["options"] == ["כן", "לא"] and "פירוט ארוך" in d["details"], d
import importlib.util as _iu
_sp = _iu.spec_from_file_location("ask_page", str(QW.ASK)); _am = _iu.module_from_spec(_sp); _sp.loader.exec_module(_am)
_h = _am.page(QW.page_data(lq))
assert "<summary>עוד</summary>" in _h and _h.index("לשחרר") < _h.index("<summary>"), "details collapsed after the line"
(QW.DIR / "d1.log").write_text("http://127.0.0.1:1/p\n", encoding="utf-8")
tg = QW.tg_text(lq)
assert "פירוט ארוך" not in tg and "1. כן" in tg and "2. לא" in tg and "http://127.0.0.1:1/p" in tg, tg
nf = QW.page_data({"key": "d2", "text": "מה לעשות?"})["questions"][0]
assert nf["text"] == "מה לעשות?" and nf.get("free") and "details" not in nf, nf          # no options: line + answer box
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

# #630: an orchestrator question that gates #64: the answer record is written on #64 too (so `owner_q.py gate #64` opens)
opened.append({"key": "6"*12, "window": "orchestrator", "source": "orchestrator", "text": "עיצוב?", "url": "u6", "gates": [64]})
gh_calls.clear()
d = QW.answer("6"*12, "approve")
assert d.get("gates") == {64: True}, d
assert any(a[:3] == ("issue", "comment", "64") and OQ.record_answer(a[-1]) == ("6"*12, "approve") for a in gh_calls), gh_calls
print("ok qwin #630 answer recorded on the gated issue")

# #897: the App is rate limited: the answer record and the ANSWERED line are queued (never posted under another login),
# the question is answered-queued (no second ask), and the next flush posts them
KEY7 = "7" * 12
opened.append({"key": KEY7, "window": "#677", "source": "issue-677", "text": "שער?", "url": "u7", "gates": []})
sent_as = []
limited = [True]
def app_gh(*a, **kw):
    sent_as.append(a)
    return (1, "API rate limit exceeded") if limited[0] and a[:2] == ("issue", "comment") else (0, "")
QW._gh = app_gh
OQ._save({"issue": 205, "posted": []})
d = QW.answer(KEY7, "yes")
assert d.get("issue") is False and KEY7 in OQ.queued_keys(), (d, OQ._state())      # the record is queued, not posted
limited[0] = False
OQ.flush_pending(app_gh)
assert OQ._state()["pending_answers"] == [] and any(a[:3] == ("issue", "comment", "677") and OQ.record_answer(a[-1]) == (KEY7, "yes") for a in sent_as), sent_as
print("ok qwin #897 App rate limited: answer queued, then posted by the flush")

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

# #440 Telegram, the second channel, with a fake Telegram API (a local HTTP server): every owner question goes to the page
# AND Telegram at the same time (numbered options); a Telegram reply (number or text) is recorded like a page answer and
# closes the page; a PC answer posts a short 'answered' note in Telegram; one reminder after 2 h; token never logged.
import threading, http.server
import telegram as TG
class FakeTG(http.server.BaseHTTPRequestHandler):
    calls, updates, n, down = [], [], [100], [False]
    def log_message(self, *a): pass
    def do_POST(self):
        if FakeTG.down[0]: self.send_response(502); self.end_headers(); return
        tok, method = self.path.split("/")[1], self.path.split("/")[2]
        p = json.loads(self.rfile.read(int(self.headers["Content-Length"])).decode("utf-8"))
        FakeTG.calls.append((tok, method, p))
        if method == "sendMessage": FakeTG.n[0] += 1; res = {"message_id": FakeTG.n[0], "text": p["text"]}
        else: res = [u for u in FakeTG.updates if u["update_id"] >= p.get("offset", 0)]
        b = json.dumps({"ok": True, "result": res}).encode(); self.send_response(200); self.end_headers(); self.wfile.write(b)
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), FakeTG); threading.Thread(target=srv.serve_forever, daemon=True).start()
TG.API = f"http://127.0.0.1:{srv.server_port}"
sent = lambda: [c[2] for c in FakeTG.calls if c[1] == "sendMessage"]
upd = lambda uid, text, chat=777, reply=0, date=50000: FakeTG.updates.append(
    {"update_id": uid, "message": {"message_id": 900 + uid, "date": date, "chat": {"id": chat}, "text": text,
                                   **({"reply_to_message": {"message_id": reply}} if reply else {})}})
logged = []; QW.log = logged.append
h6 = FakeHerdr(); h6.status = {"inbox": "working", "orchestrator": "working"}; QW._hc, QW._run = h6.hc, h6.run
QW.STATE = tmp / "qwin6.json"
marked.clear(); n_kill = len(sp.killed)
# not set up (no telegram.env): nothing is called, the page still works
opened[:] = [{"key": "t0", "window": "#20", "source": "issue-20", "text": "בלי טלגרם?", "url": "u"}]
QW.tick(h6.ts(), now=49000); assert not FakeTG.calls and QW.load()["t0"].get("pid"), FakeTG.calls
QW.STATE = tmp / "qwin7.json"
TG.ENV = tmp / "telegram.env"; TG.ENV.write_text('TELEGRAM_BOT_TOKEN=SECRET123:abc\nTELEGRAM_CHAT_ID="777"\n', encoding="utf-8")
opened[:] = [{"key": "t1", "window": "#21", "source": "issue-21", "text": "איזה צבע? 1) ירוק 2) כחול", "url": "u"},
             {"key": "t2", "window": "#22", "source": "issue-22", "text": "שם לדמות?", "url": "u"}]
QW.tick(h6.ts(), now=50000)                                   # the pages and the first Telegram message at the same tick
assert asked()[-2:] == ["t1", "t2"], asked()
assert [(p["chat_id"], p["text"].split("\n")[0]) for p in sent()] == [("777", "איזה צבע?")], sent()   # #632: one at a time
assert "1. ירוק" in sent()[0]["text"] and "2. כחול" in sent()[0]["text"], sent()
assert all(c[0] == "botSECRET123:abc" for c in FakeTG.calls)
QW.tick(h6.ts(), now=50060); assert len(sent()) == 1           # no repeat
t1 = QW.load()["t1"]["tg"]
# a message from another chat is ignored; a reply '2' to t1's message = option 2, recorded like a page answer
upd(1, "1", chat=555); upd(2, "2", reply=t1)
QW.tick(h6.ts(), now=50120)
assert marked == [("t1", "כחול")], marked
t2 = QW.load()["t2"]["tg"]; assert sent()[-1]["text"].startswith("שם לדמות?"), sent()     # #632: t1 answered -> t2 sent now
assert QW.load()["t1"]["answered"] and 4000 + asked().index("t1") + 1 in sp.killed        # the page closes
assert json.loads((R.RUNS / "telegram.json").read_text())["offset"] == 3                  # offset kept in .runs
gu = [c[2] for c in FakeTG.calls if c[1] == "getUpdates"]; assert gu[0]["offset"] == 0 and gu[-1]["offset"] == 0, gu
QW.tick(h6.ts(), now=50180); assert marked == [("t1", "כחול")]                              # recorded once
assert [c[2] for c in FakeTG.calls if c[1] == "getUpdates"][-1]["offset"] == 3
assert not any(p.get("reply_to_message_id") == t1 for p in sent()), sent()                # no 'answered' note for its own answer
# t2: answered on the PC page -> a short 'answered' note in Telegram (a reply to its message); a late Telegram text is ignored
(QW.DIR / "t2.answers.json").write_text(json.dumps({"answers": {"a": "בּוֹבּוֹ"}}, ensure_ascii=False), encoding="utf-8")
QW.tick(h6.ts(), now=50240)
assert marked[-1] == ("t2", "בּוֹבּוֹ"), marked
note = [p for p in sent() if p.get("reply_to_message_id") == t2]
assert len(note) == 1 and "בּוֹבּוֹ" in note[0]["text"], sent()
upd(3, "טוטו", reply=t2); QW.tick(h6.ts(), now=50300); assert marked[-1] == ("t2", "בּוֹבּוֹ") and len(marked) == 2
# free text (not a reply) with ONE open question = its answer; 2 h unanswered = one reminder in Telegram
opened[:] = [{"key": "t3", "window": "#23", "source": "issue-23", "text": "מתי? 1) עכשיו 2) מחר", "url": "u"}]
QW.tick(h6.ts(), now=60000); t3 = QW.load()["t3"]["tg"]
QW.tick(h6.ts(), now=60000 + 7200); QW.tick(h6.ts(), now=60000 + 7300)
rem = [p for p in sent() if p.get("reply_to_message_id") == t3]; assert len(rem) == 1, sent()
upd(4, "בעוד שעה", date=60000 + 7400); QW.tick(h6.ts(), now=60000 + 7460)
assert marked[-1] == ("t3", "בעוד שעה"), marked
# Telegram down: the page still has the question, 'NOT sent' logged once, sent on a later tick
FakeTG.down[0] = True
opened[:] = [{"key": "t4", "window": "#24", "source": "issue-24", "text": "עוד?", "url": "u"}]
QW.tick(h6.ts(), now=70000); QW.tick(h6.ts(), now=70060)
assert QW.load()["t4"].get("pid") and not QW.load()["t4"].get("tg")
assert sum("telegram" in l.lower() and "not sent" in l.lower() for l in logged) == 1, logged
FakeTG.down[0] = False; QW.tick(h6.ts(), now=70120); assert QW.load()["t4"]["tg"]
assert not any("SECRET123" in l for l in logged), logged                                  # the token never in watchdog.log
print("ok qwin telegram second channel")

# #632 ONE Telegram question at a time (live 27 Nov: 3 out at once, his plain reply matched all 3 and was lost): 3 open
# questions -> 1 message; a plain reply is recorded for it; then the next one is sent. A note (ai-observer, 'PR waits for
# your merge') goes out as a plain note that waits for nothing and never takes a plain reply.
QW.STATE = tmp / "qwin8.json"; FakeTG.calls.clear(); FakeTG.updates.clear(); marked.clear()
opened[:] = [{"key": "n1", "window": "#531", "source": "#531", "text": "PR #531 waits for your merge: x", "url": "u"},
             {"key": "o1", "window": "#31", "source": "issue-31", "text": "ראשונה? 1) כן 2) לא", "url": "u"},
             {"key": "o2", "window": "#32", "source": "issue-32", "text": "שנייה?", "url": "u"},
             {"key": "o3", "window": "#33", "source": "issue-33", "text": "שלישית?", "url": "u"}]
QW.tick(h6.ts(), now=80000); QW.tick(h6.ts(), now=80060)
qs_out = [p for p in sent() if "ענה" in p["text"]]
assert [p["text"].split("\n")[0] for p in qs_out] == ["ראשונה?"], sent()                  # only ONE question out
notes = [p for p in sent() if p["text"].startswith("PR #531")]
assert len(notes) == 1 and "ענה" not in notes[0]["text"], sent()                         # the note: once, asks nothing
upd(10, "1", date=80100)                                                                 # a plain message, not a Reply
QW.tick(h6.ts(), now=80120)
assert marked == [("o1", "כן")], marked                                                  # recorded for the current one
assert [p["text"].split("\n")[0] for p in sent() if "ענה" in p["text"]] == ["ראשונה?", "שנייה?"], sent()   # next one sent
upd(11, "בסדר", date=80150); QW.tick(h6.ts(), now=80180)
assert marked[-1] == ("o2", "בסדר") and not any(k == "n1" for k, _ in marked), marked   # the note never takes a reply
assert sent()[-1]["text"].startswith("שלישית?"), sent()
assert not any("כמה שאלות" in p["text"] for p in sent()), sent()                         # never 'several open, use Reply'
print("ok qwin telegram one question at a time")

# #632 review: state from before the deploy (2 questions + a note, all with 'tg', no 'tg_at'): a plain reply is never
# recorded silently for one of them (gets the 'use Reply' hint), the note never takes it; Reply still works
QW.STATE = tmp / "qwin9.json"; FakeTG.calls.clear(); FakeTG.updates.clear(); marked.clear()
old = [{"key": "p1", "window": "#53", "source": "issue-53", "text": "ישנה?", "url": "u"},
       {"key": "p2", "window": "#392", "source": "issue-392", "text": "חדשה?", "url": "u"},
       {"key": "pn", "window": "ai-observer", "source": "ai-observer", "text": "QUESTION: note", "url": "u"}]
opened[:] = [dict(q) for q in old]
QW.save({q["key"]: {"name": f"question-{i}", "since": 90000, "source": q["source"], "text": q["text"], "pid": 0, "tg": 500 + i}
         for i, q in enumerate(old)})
upd(20, "כן", date=90100); QW.tick(h6.ts(), now=90120)
assert marked == [], marked                                                               # not recorded for the wrong one
hint = [p for p in sent() if p.get("reply_to_message_id") == 920]
assert len(hint) == 1 and "Reply" in hint[0]["text"], sent()                             # the 'use Reply' hint, as before
upd(21, "כן", reply=501, date=90150); QW.tick(h6.ts(), now=90180)
assert marked == [("p2", "כן")], marked                                                  # a Reply goes to its question
upd(22, "אוקיי", date=90200); QW.tick(h6.ts(), now=90240)
assert marked[-1] == ("p1", "אוקיי") and len(marked) == 2, marked                        # one left: a plain reply is its answer
srv.shutdown(); TG.ENV = tmp / "no-telegram.env"; QW.log = lambda m: None
print("ok qwin telegram old state after deploy")

# #696 an alert note (ai-observer) is a NOTICE: Telegram message with the whole text, no page, no push, no waiting.
# A real question still gets its page with option buttons and the Telegram text with numbered options.
QW.STATE = tmp / "qwin10.json"; sp.cmds.clear(); h6.sent.clear(); FakeTG.calls.clear(); FakeTG.updates.clear()
TG.ENV = tmp / "telegram.env"
srv2 = http.server.ThreadingHTTPServer(("127.0.0.1", 0), FakeTG); threading.Thread(target=srv2.serve_forever, daemon=True).start()
TG.API = f"http://127.0.0.1:{srv2.server_port}"
alert = "התראה: המשימה השעתית לא רצה.\nהתחבר מחדש ל-claude.ai/code ואז Scheduled, ההמשך ממשיך בינתיים."
h6.status = {"inbox": "idle", "orchestrator": "idle"}
opened[:] = [{"key": "a1", "window": "ai-observer-5", "source": "ai-observer-5", "text": alert, "url": "u"},
             {"key": "q1", "window": "#41", "source": "issue-41", "text": "איזה צבע? 1) ירוק 2) כחול", "url": "u"}]
QW.tick(h6.ts(), now=100000)
assert asked() == ["q1"], asked()                                                        # no page for the alert
assert not any("owner-q:a1" in s[1] for s in h6.sent), h6.sent                           # no phone push for it either
al = [p for p in sent() if p["text"].startswith("התראה")]
assert len(al) == 1 and al[0]["text"] == alert, sent()                                    # one notice, the whole text, asks nothing
qd = json.loads((QW.DIR / "q1.json").read_text(encoding="utf-8"))["questions"][0]
assert qd["options"] == ["ירוק", "כחול"], qd                                              # real question: option buttons on the page
assert [p["text"] for p in sent() if "1. ירוק" in p["text"] and "2. כחול" in p["text"]], sent()   # and numbered in Telegram
QW.tick(h6.ts(), now=100060); assert len([p for p in sent() if p["text"].startswith("התראה")]) == 1   # once
# a notice never fills the 3 page slots
opened[:] += [{"key": f"z{i}", "window": f"#5{i}", "source": f"issue-5{i}", "text": f"שאלה {i}?", "url": "u"} for i in range(3)]
QW.tick(h6.ts(), now=100120); assert {"z0", "z1"} <= set(asked()), asked()
srv2.shutdown()
print("ok qwin #696 alert is a notice, question has buttons")

# #803 the third channel: the chat with the inspector. is_inspector (pure), chat-answer refusals, the bot record, the Telegram
# confirmation with 10 min to undo, `אשר`, late `בטל`, Telegram off, a page answer that wins.
INS = {"name": "inspector", "state": "live", "cwd": "C:/work/Oren_study", "foreground": {"argv": ["claude", "--remote-control", "oren-inspector"], "pid": 10}}
other = {"name": "worker", "state": "live", "cwd": "C:/work/Oren_study/a", "foreground": {"argv": ["claude"], "pid": 20}}
D = "C:/work/Oren_study"
ok_i = lambda chain, ts, d=D: QW.is_inspector(chain, ts, d)
assert ok_i([5, 10, 1], [INS, other])
assert not ok_i([5, 20, 1], [INS, other])                                         # another terminal's claude
assert not ok_i([10], [other])                                                    # no inspector
assert not ok_i([10], [INS, {**INS, "name": "inspector", "foreground": {**INS["foreground"], "pid": 11}}])   # two inspectors
assert not ok_i([10], [{**INS, "foreground": {"argv": ["claude"], "pid": 10}, "name": "inspector"}])         # no --remote-control oren-inspector
assert not ok_i([10], [{**INS, "foreground": {"argv": ["python", "--remote-control", "oren-inspector"], "pid": 10}}])   # not claude
assert not ok_i([10], [{**INS, "cwd": "C:/work/other"}])                          # wrong cwd
assert not ok_i([10], None) and not ok_i([10], [])                                # herdr unreadable
# #907 walk_chain over a fake process table {pid: {ppid, ctime}}: the inspector's claude is pid 10 (INS), another session's is 20
def table(rows): return lambda pid: rows.get(pid)
pids = lambda rows, start=1: [p for p, _ in QW.walk_chain(start, table(rows))]
plain = {1: {"ppid": 2, "ctime": 900}, 2: {"ppid": 3, "ctime": 800}, 3: {"ppid": 10, "ctime": 700}, 10: {"ppid": 99, "ctime": 100}, 99: {"ppid": 0, "ctime": 50}}
assert pids(plain) == [1, 2, 3, 10, 99] and ok_i(pids(plain), [INS, other])
# a shell that Git Bash replaced (exited, still held by its parent): it is in the table, so the walk goes on to claude
helper = {1: {"ppid": 2, "ctime": 900}, 2: {"ppid": 3, "ctime": 890}, 3: {"ppid": 4, "ctime": 880, "alive": False},
          4: {"ppid": 5, "ctime": 870}, 5: {"ppid": 10, "ctime": 860}, 10: {"ppid": 99, "ctime": 100}}
assert 10 in pids(helper) and ok_i(pids(helper), [INS, other])
# a parent that cannot be opened (gone): the walk ends there, the pid is never in the chain -> refused
dead = {1: {"ppid": 2, "ctime": 900}, 2: {"ppid": 10, "ctime": 800}, 9: {"ppid": 10, "ctime": 700}}
assert pids(dead) == [1, 2] and not ok_i(pids(dead), [INS, other])
# a reused pid: the recorded parent pid now belongs to a process created AFTER the child -> the walk stops before it
reuse = {1: {"ppid": 2, "ctime": 900}, 2: {"ppid": 10, "ctime": 800}, 10: {"ppid": 99, "ctime": 850}}
assert pids(reuse) == [1, 2] and not ok_i(pids(reuse), [INS, other])
assert pids({1: {"ppid": 10, "ctime": 900}, 10: {"ppid": 0, "ctime": 900}}) == [1]    # the same creation time is not earlier
assert pids({1: {"ppid": 10, "ctime": 900}, 10: {"ppid": 0, "ctime": 0}}) == [1]      # no creation time: not verified
assert pids({1: {"ppid": 1, "ctime": 900}}) == [1] and pids({}) == []                  # a loop; nothing at all
# another session (its own claude 20): refused, also through a replaced shell
others = {1: {"ppid": 2, "ctime": 900}, 2: {"ppid": 3, "ctime": 880, "alive": False}, 3: {"ppid": 20, "ctime": 870},
          20: {"ppid": 7, "ctime": 300}, 7: {"ppid": 0, "ctime": 10}}
assert 20 in pids(others) and 10 not in pids(others) and not ok_i(pids(others), [INS, other])
assert len(QW.walk_chain(1, lambda p: {"ppid": p + 1, "ctime": 10 ** 6 - p})) == 32   # at most 32 steps
assert QW.walk_chain(1, lambda p: {"ppid": p + 1, "ctime": 10 ** 6 - p}, limit=3)[-1][0] == 3
if os.name != "nt": assert QW.chain_pids() == [] and QW._chain_info() == []
# live_terminals: hc ls --json, then hc get per live terminal
_calls = []
def _fh(*a, **kw):
    _calls.append(a)
    if a[0] == "ls": return 0, json.dumps({"terminals": [{"name": "inspector", "address": "w1", "state": "live"}, {"name": "x", "address": "w2", "state": "finished"}]})
    if a[0] == "get": return 0, json.dumps(INS)
    return 1, ""
QW._hc = _fh; lt = QW.live_terminals()
assert [t["name"] for t in lt] == ["inspector"] and ("get", "w1", "--json") in [c[:3] for c in _calls] and ok_i([10], lt)
QW._hc = lambda *a, **kw: (1, ""); assert QW.live_terminals() is None

class GH3:
    """fake gh: issue comments by the App bot"""
    def __init__(self): self.c, self.calls = {}, []
    def __call__(self, *a, **kw):
        self.calls.append(a)
        if a[:2] == ("issue", "comment"):
            self.c.setdefault(int(a[2]), []).append({"body": a[a.index("--body") + 1], "author": {"login": "oren-study-bot"}, "reactionGroups": []}); return 0, "u\n"
        if a[:2] == ("issue", "view"): return 0, json.dumps({"comments": self.c.get(int(a[2]), [])})
        if a[:2] == ("api", "graphql"):          # #824: owner_q.comments reads GraphQL (-F n=<issue>)
            n = int(a[a.index("-F") + 1].split("=", 1)[1])
            return 0, json.dumps({"data": {"repository": {"issue": {"comments": {"nodes": self.c.get(n, []), "pageInfo": {"hasNextPage": False}}}}}})
        return 0, ""
g3 = GH3(); QW._gh = g3; OQ.GH = g3
srv3 = http.server.ThreadingHTTPServer(("127.0.0.1", 0), FakeTG); threading.Thread(target=srv3.serve_forever, daemon=True).start()
TG.API = f"http://127.0.0.1:{srv3.server_port}"; FakeTG.down[0] = False
h7 = FakeHerdr(); h7.status = {"inbox": "working", "orchestrator": "working"}; QW._hc, QW._run = h7.hc, h7.run
QW.is_inspector_real = QW.is_inspector
chain = [[10]]
QW._chain = lambda: chain[0]; QW.live_terminals = lambda: [INS, other]; QW._inspector_dir = lambda: Path(D)
chat_log = []; QW.log = chat_log.append
BODY = lambda i: [c["body"] for c in g3.c.get(i, [])]
N = [0]
def scenario(text="כן או לא? 1) כן 2) לא"):
    """a fresh open question (61, gates 62) with its page + Telegram question sent; -> key, t0"""
    N[0] += 1; key = f"c0ffee00000{N[0]}"; t0 = 300000 + N[0] * 10000
    QW.STATE, QW.CHAT_STATE = tmp / f"qw-chat{N[0]}.json", tmp / f"chat{N[0]}.json"; OQ.CHAT_STATE = QW.CHAT_STATE
    g3.c.clear(); g3.calls.clear(); FakeTG.calls.clear(); marked.clear(); h7.sent.clear(); chat_log.clear()
    opened[:] = [{"key": key, "window": "#61", "source": "issue-61", "text": text, "gates": [62], "url": "u"}]
    QW.tick(h7.ts(), now=t0); g3.calls.clear(); return key, t0
conf = lambda: [p for p in sent() if "נרשמה תשובה מהצ'אט" in p["text"]]
# a refused chat-answer (another session): no gh call, non-zero, one log line, one Telegram note
key, t0 = scenario(); chain[0] = [5, 20, 1]
rc, msg = QW.chat_answer(key, "כן", "הוא אמר כן")
assert rc != 0 and not g3.calls, g3.calls
assert len([l for l in chat_log if "REFUSED" in l]) == 1 and len([p for p in sent() if "נדחתה" in p["text"]]) == 1, (chat_log, sent())
chain[0] = [10]
# #907 whoami: the chain, the inspector terminal, the verdict; it posts, sends and logs nothing (both verdicts)
g3.calls.clear(); FakeTG.calls.clear(); chat_log.clear(); real_ci = QW._chain_info
for ch, want in (([(5, {"ppid": 10, "name": "python.exe"}), (10, {"ppid": 1, "name": "claude.exe"})], 0),
                 ([(5, {"ppid": 20, "name": "python.exe"}), (20, {"ppid": 1, "name": "claude.exe", "alive": False})], 1)):
    QW._chain_info = lambda ch=ch: ch
    rc, out = QW.whoami()
    assert rc == want and "claude.exe" in out and "pid 10" in out and ("verdict: INSPECTOR" in out) == (want == 0), out
    assert QW.main(["whoami"]) == want
assert "(exited)" in out and not g3.calls and not sent() and not chat_log, (g3.calls, sent(), chat_log)
QW._chain_info = real_ci
# a missing / empty / too long --quote is refused (no gh call)
for q in (None, "", "  ", "x" * 501): assert QW.chat_answer(key, "כן", q)[0] != 0 and not g3.calls
assert QW.main(["chat-answer", key, "כן"]) != 0 and QW.main(["answer", key, "כן"]) == 2     # no --quote; the old `answer` CLI refuses
assert not marked and not g3.calls
# accepted: exactly one bot record per issue (asking issue + the gated one), redacted quote, no ANSWERED/relay/page stop
QW.R.SECRETS.append("SeCrEtToKeN"); killed0 = len(sp.killed)
assert QW.chat_answer(key, "כן", "הוא אמר כן SeCrEtToKeN")[0] == 0
for i in (61, 62):
    assert len(BODY(i)) == 1 and "via=inspector-chat" in BODY(i)[0] and "הוא אמר כן ***" in BODY(i)[0] and "SeCrEtToKeN" not in BODY(i)[0], BODY(i)
    assert OQ.record_answer(BODY(i)[0]) is None                                              # never an old-style answer record
assert not marked and not [s for s in h7.sent if "OWNER ANSWERED" in s[1]] and len(sp.killed) == killed0
# the tick confirms it once, as a reply to the question's Telegram message, with the quote
tgq = QW.load()[key]["tg"]; QW.tick(h7.ts(), now=t0 + 60)
assert len(conf()) == 1 and conf()[0]["reply_to_message_id"] == tgq and "הוא אמר כן" in conf()[0]["text"] and 'בטל' in conf()[0]["text"], sent()
QW.tick(h7.ts(), now=t0 + 120); assert len(conf()) == 1                                      # once
assert not marked and not any("final" in b for b in BODY(61))                                # the gate stays closed in the window
# 10 minutes without undo: final marker (both issues), ANSWERED, relay, ✓
QW.tick(h7.ts(), now=t0 + 60 + 599); assert not marked
QW.tick(h7.ts(), now=t0 + 60 + 600)
assert all(any(f"owner-answer-final:{key}" in b for b in BODY(i)) for i in (61, 62)), BODY(62)
assert marked == [(key, "כן")] and [s for s in h7.sent if "OWNER ANSWERED" in s[1]] and len(sp.killed) > killed0, (marked, h7.sent)
assert [p for p in sent() if p["text"] == "✓ נכנסה לתוקף"], sent()
assert not any("OWNER ANSWER (question window" in b for i in (61, 62) for b in BODY(i))      # no second record: the chat record + final marker are it
# a late בטל (a Reply to the confirmation) -> too late
mid = QW.load_chat()[key]["mid"]; upd(101, "בטל", reply=mid); QW.tick(h7.ts(), now=t0 + 800)
assert any(p["text"].startswith("מאוחר מדי") for p in sent()) and not any("undo" in b for b in BODY(61)), sent()
# a Reply בטל inside the window: undo record, no final marker, the question stays open
key, t0 = scenario(); QW.chat_answer(key, "לא", "לא")
QW.tick(h7.ts(), now=t0 + 60); mid = QW.load_chat()[key]["mid"]; upd(102, "בטל", reply=mid)
QW.tick(h7.ts(), now=t0 + 120)
assert all(any(f"owner-answer-undo:{key}" in b for b in BODY(i)) for i in (61, 62)) and any(p["text"].startswith("בוטל") for p in sent())
QW.tick(h7.ts(), now=t0 + 900); assert not marked and not any("final" in b for b in BODY(61)) and QW.load()[key].get("answered") is None
# a plain בטל while one chat answer is pending
key, t0 = scenario(); QW.chat_answer(key, "לא", "לא"); QW.tick(h7.ts(), now=t0 + 60)
upd(103, "בטל", date=t0 + 70); QW.tick(h7.ts(), now=t0 + 120); QW.tick(h7.ts(), now=t0 + 900)
assert any(f"owner-answer-undo:{key}" in b for b in BODY(61)) and not marked and not any("final" in b for b in BODY(61))
# `אשר` = in force at once
key, t0 = scenario(); QW.chat_answer(key, "כן", "כן"); QW.tick(h7.ts(), now=t0 + 60); mid = QW.load_chat()[key]["mid"]
upd(104, "אשר", reply=mid); QW.tick(h7.ts(), now=t0 + 120)
assert marked == [(key, "כן")] and any(f"owner-answer-final:{key}" in b for b in BODY(61)), marked
# Telegram off / failing: no confirmation, no final marker, ONE alarm after 10 minutes to the inspector and the orchestrator
key, t0 = scenario(); QW.chat_answer(key, "כן", "כן"); FakeTG.down[0] = True; FakeTG.calls.clear()
QW.tick(h7.ts(), now=t0 + 60); QW.tick(h7.ts(), now=t0 + 400); assert not [s for s in h7.sent if "not confirmed" in s[1]]
QW.tick(h7.ts(), now=t0 + 700); QW.tick(h7.ts(), now=t0 + 760); QW.tick(h7.ts(), now=t0 + 5000)
assert sorted(s[0] for s in h7.sent if "not confirmed" in s[1]) == ["inspector", "orchestrator"], h7.sent
assert not marked and not any("final" in b for b in BODY(61)); FakeTG.down[0] = False
# a page answer inside the window wins: the chat record never comes into force
key, t0 = scenario(); QW.chat_answer(key, "כן", "כן"); QW.tick(h7.ts(), now=t0 + 60)
(QW.DIR / f"{key}.answers.json").write_text(json.dumps({"answers": {"a": "לא"}}, ensure_ascii=False), encoding="utf-8")
QW.tick(h7.ts(), now=t0 + 120); assert marked == [(key, "לא")], marked
opened.clear(); QW.tick(h7.ts(), now=t0 + 180); QW.tick(h7.ts(), now=t0 + 1000)
assert marked == [(key, "לא")] and not any("final" in b for b in BODY(61)), (marked, BODY(61))
# a Telegram answer inside the window wins too
key, t0 = scenario(); QW.chat_answer(key, "כן", "כן"); QW.tick(h7.ts(), now=t0 + 60)
upd(105, "2", reply=QW.load()[key]["tg"]); QW.tick(h7.ts(), now=t0 + 120)
assert marked == [(key, "לא")], marked
opened.clear(); QW.tick(h7.ts(), now=t0 + 1000); assert marked == [(key, "לא")] and not any("final" in b for b in BODY(61))
srv3.shutdown(); TG.ENV = tmp / "no-telegram.env"
print("ok qwin #803 inspector chat channel")

# ---------- #894: a page never dies while its question is open ----------
def fresh(n=1):
    global opened
    QW.STATE.write_text("{}"); opened = [{"key": f"p{i}", "window": f"#{900+i}", "source": f"issue-{900+i}", "text": f"שאלה {i}? 1) כן 2) לא"} for i in range(n)]
    sp.cmds.clear(); sp.killed.clear(); sp.live.clear(); h.sent.clear(); h.status = {"inbox": "working", "orchestrator": "working"}
    for f in QW.DIR.glob("p*"): f.unlink()
QW._hc, QW._run = h.hc, h.run
OQ.open_list = lambda gh=None: [dict(q) for q in opened]
OQ.mark_answered = lambda key, ans="", gh=None: True
QW._app_post = lambda n, t: True
T = lambda now: QW.tick(h.ts(), now=now)
# 1+5: dead page restarted with backoff 1, 2, 5, 10, 10 min; one restart per tick; logged once per restart
logs = []; QW.log = logs.append
fresh(); T(0); assert asked() == ["p0"]
sp.live.clear(); T(30); assert len(sp.cmds) == 1                        # backoff: not before 1 min
T(61); assert len(sp.cmds) == 2 and len([l for l in logs if "page restarted" in l]) == 1
T(62); assert len(sp.cmds) == 2                                         # alive again: nothing
for gap, n in [(120, 3), (300, 4), (600, 5), (600, 6)]:
    sp.live.clear(); t = QW.load()["p0"]["last_start"]; T(t + gap - 1); assert len(sp.cmds) == n - 1; T(t + gap); assert len(sp.cmds) == n, (gap, n)
assert len([l for l in logs if "page restarted" in l]) == 5
# 5: the 24 h timeout (page long alive, then gone) restarts at once, backoff starts over
t = QW.load()["p0"]["last_start"]; T(t + 90000)                          # alive until now
sp.live.clear(); T(t + 90001); assert len(sp.cmds) == 7, len(sp.cmds)
# 2: answered on the page but still open after 10 min -> page again, not treated as answered
fresh(); T(0); (QW.DIR / "p0.answers.json").write_text(json.dumps({"answers": {"a": "כן"}})); sp.live.clear()
T(100); assert QW.load()["p0"]["answered"] and len(sp.cmds) == 1         # relayed; still open, waiting for the confirmation
T(100 + 599); assert QW.load()["p0"]["answered"] and len(sp.cmds) == 1
T(100 + 600); e = QW.load()["p0"]; assert not e["answered"] and len(sp.cmds) == 2 and not (QW.DIR / "p0.answers.json").exists(), e
# 4: answered and confirmed closed -> entry dropped, page stopped
(QW.DIR / "p0.answers.json").write_text(json.dumps({"answers": {"a": "לא"}})); T(800); pid = QW.load()["p0"]["pid"]; opened.clear(); T(900)
assert "p0" not in QW.load() and pid not in sp.live, (QW.load(), sp.live)
# no duplicate pages for one key: many ticks with a live page start nothing
fresh(); [T(i * 60) for i in range(5)]; assert len(sp.cmds) == 1
# 3: `page <key>`: live page -> its URL, no new process; dead -> started; unknown -> rc 1; the ping carries the way
(QW.DIR / "p0.log").write_text("http://127.0.0.1:7/\n"); assert QW.page_cmd("p0", now=500) == (0, "http://127.0.0.1:7/") and len(sp.cmds) == 1
sp.live.clear(); QW.page_cmd("p0", now=501); assert len(sp.cmds) == 2
assert QW.page_cmd("nope")[0] == 1
assert "qwin.py page p0" in QW.push_text(opened[0]) and "qwin.py page p0" in QW.tg_text(opened[0])
fresh(); sp.live.clear(); assert QW.page_cmd("p0", now=5)[0] == 0 and asked() == ["p0"]       # no entry yet: created
# the last question-back rule: Hebrew and English, no option -> no record, gate stays closed, question and page stay open
posted = []; QW._app_post = lambda n, t: posted.append((n, t)) or True
marked = []; OQ.mark_answered = lambda key, ans="", gh=None: marked.append(key) or True
for qb in ["למה צריך את זה?", "Why do we need this?", "מה זה אומר?"]:
    fresh(); T(0); (QW.DIR / "p0.answers.json").write_text(json.dumps({"answers": {"a": qb}}), encoding="utf-8"); sp.live.clear(); h.sent.clear()
    T(10)
    e = QW.load()["p0"]
    assert not e.get("answered") and not posted and not marked, (qb, posted, marked)
    assert any("FOLLOW-UP QUESTION" in m and qb in m for _, m in h.sent), h.sent
    assert len(sp.cmds) == 2 and not (QW.DIR / "p0.answers.json").exists(), qb                    # page back at once
    assert OQ.open_list() and QW.chat_answer.__name__                                              # still open
assert QW.question_back("2?", "מה? 1) כן 2) לא") is False and QW.question_back("Yes?", "ok? 1) Yes 2) No") is False
assert QW.question_back("כן", "x? 1) כן 2) לא") is False and QW.question_back("למה?", "x? 1) כן 2) לא") is True
fresh(); T(0); (QW.DIR / "p0.answers.json").write_text(json.dumps({"answers": {"a": "כן"}})); T(5)      # a real answer still counts
assert QW.load()["p0"]["answered"] and marked == ["p0"] and posted, (marked, posted)
print("ok qwin #894 page always alive")

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

# ---------- #872: console mirror (fake HTTP) ----------
import console_mirror as CM
CM.STATE = tmp / "console_mirror.json"; CM.log = lambda m: None
CM.CONF = tmp / "console.json"; CM.CONF.write_text(json.dumps({"url": "https://c.test", "push_key": "pk", "read_key": "rk"}))
Q1 = {"key": "aaaaaaaaaaaa", "window": "#5", "source": "issue-5", "text": "לאשר? 1) כן (מומלץ) 2) לא", "gates": [5], "at": "2026-11-28T10:00:00Z"}
NOTE = {"key": "bbbbbbbbbbbb", "window": "ai-observer", "source": "ai-observer", "text": "PR #7 waits for your merge", "gates": [], "at": ""}
class FakeNet:
    def __init__(self): self.calls, self.fail, self.rows = [], False, []
    def __call__(self, method, url, key, body=None):
        self.calls.append((method, url.split("test")[1], key, body))
        if self.fail: return 0, {}
        return 200, ({"questions": self.rows} if method == "GET" else {"ok": True})
net = FakeNet(); CM.http = net
answers = []
CM.QW.answer = lambda k, t, **kw: answers.append((k, t, kw)) or {}
OQ.open_list = lambda gh=None: [dict(Q1), dict(NOTE)]
CM.tick(now=1000, answers=False)
posts = [c for c in net.calls if c[0] == "POST"]
q = next(c for c in posts if c[1] == "/api/console/question")
assert q[2] == "pk" and q[3]["key"] == Q1["key"] and q[3]["repo"] == R.REPO and q[3]["issue"] == 5 and q[3]["gates"] == [5]
assert q[3]["options"] == ["כן (מומלץ)", "לא"] and q[3]["recommended"] == "כן" and q[3]["text_he"] and q[3]["asked_at"] > 0, q
assert [c for c in posts if c[1] == "/api/console/notice"][0][3]["text_he"].startswith("PR #7"), posts
# shadow: no pull; unchanged within 10 min: no push; notice never twice
net.calls.clear(); net.rows = [{"repo": R.REPO, "key": Q1["key"], "answer": "כן", "via": "console"}]
CM.tick(now=1100, answers=False)
assert net.calls == [] and answers == [], (net.calls, answers)
CM.tick(now=1000 + CM.EVERY_S + 1, answers=False)
assert [c[1] for c in net.calls] == ["/api/console/question"], net.calls     # the refresh; the notice is not sent again
# true: the D1 answer -> one qwin.answer with via; a second tick -> none
net.calls.clear(); CM.tick(now=1200, answers=True); CM.tick(now=1300, answers=True)
assert answers == [(Q1["key"], "כן", {"via": "console"})], answers
# already answered another way (question no longer open) -> no record
answers.clear(); st = CM._load(); st["pulled"] = []; CM._save(st)
OQ.open_list = lambda gh=None: [dict(NOTE)]
CM.tick(now=1400, answers=True); assert answers == [], answers
# an API failure: tick returns True, never raises, retried next tick (digest not stored)
OQ.open_list = lambda gh=None: [dict(Q1, key="cccccccccccc")]; net.fail = True
assert CM.tick(now=2000, answers=True) is True
net.fail = False; net.calls.clear(); assert CM.tick(now=2001, answers=False) is False
assert any(c[3] and c[3].get("key") == "cccccccccccc" for c in net.calls)
print("ok qwin console mirror")
