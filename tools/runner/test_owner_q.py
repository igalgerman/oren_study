"""#193 owner questions: one post per window+question, from fake watchdog screens. Run: python3 tools/runner/test_owner_q.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
import json, re, sys, tempfile, time
from pathlib import Path
sys.argv.append("--dry-run")
import runner as R
import owner_q as OQ
import watchdog as W

tmp = Path(tempfile.mkdtemp())
OQ.STATE = tmp / "owner_q.json"
_lt = time.localtime                   # #207: Windows rejects negative times; fail the same way on Linux
def _win_localtime(t=None):
    if t is not None and t < 0: raise OSError(22, "Invalid argument")
    return _lt() if t is None else _lt(t)
time.localtime = _win_localtime

class FakeGH:
    """A fake `gh` with one repo: issues + comments in memory."""
    def __init__(self): self.issues, self.calls, self.fail = {}, [], False
    def __call__(self, *a, **kw):
        self.calls.append(a)
        if self.fail: return 1, "network"
        if a[:2] == ("issue", "list"):
            return 0, json.dumps([{"number": n, "title": i["title"]} for n, i in self.issues.items()])
        if a[:2] == ("issue", "create"):
            n = 900 + len(self.issues); self.issues[n] = {"title": a[a.index("--title") + 1], "comments": [], "args": a}
            return 0, f"https://github.com/x/y/issues/{n}\n"
        if a[:2] == ("issue", "pin"): self.issues[int(a[2])]["pinned"] = True; return 0, ""
        if a[:2] == ("issue", "view"):
            return 0, json.dumps({"comments": self.issues[int(a[2])]["comments"]})
        if a[:2] == ("issue", "comment"):
            cs = self.issues[int(a[2])]["comments"]
            cs.append({"body": a[a.index("--body") + 1], "url": f"https://github.com/x/y/issues/{a[2]}#c{len(cs)}", "reactionGroups": []})
            return 0, cs[-1]["url"] + "\n"
        return 0, ""

def posts(g): return [c for i in g.issues.values() for c in i["comments"] if OQ.KEY_RE.search(c["body"])]

# ---- the watchdog part: fake herdr screens -> one post per question ----
g = FakeGH()
OQ.GH = g                              # the watchdog posts through the fake gh
screens = {"issue-5": "● working\n● QUESTION: לשנות את הצבע? (כחול / ירוק)\n", "review-7": "● review\n● QUESTION: Is the nikud on שָׁלוֹם right? (yes / no)\n",
           "intake-9": "grill\n● QUESTION: לכמה גילאים?\n", "issue-6": "Allow this command?\n❯ 1. Yes\n  2. No, tell Claude\n"}
status = {"issue-5": "idle", "review-7": "done", "intake-9": "idle", "issue-6": "blocked"}
told = []
W.screen_text = lambda n: screens[n]
W.tell = told.append
W.pin = lambda t, on: None
W.R.should_park = lambda *a: False
ts = lambda: [{"name": n, "status": status[n], "state": "live"} for n in screens] + [{"name": "orchestrator", "state": "live"}]
clock = [time.time()]              # #207: a real time, so later time.localtime(now - days) stays positive
start = clock[0]
W.time.time = lambda: clock[0]
for k in range(4):                     # four watchdog ticks, 60 s apart: the same screens
    W.check_windows(ts()); clock[0] += 60
issue = next(iter(g.issues))
assert g.issues[issue]["title"] == OQ.TITLE and g.issues[issue].get("pinned"), g.issues
args = g.issues[issue]["args"]; assert args[args.index("--assignee") + 1] == "igalgerman", args
p = posts(g)
assert len(p) == 4, [c["body"] for c in p]                     # one post per window+question, no duplicates over 4 ticks
by = {re.search(r"\*\*(#\d+)\*\*", c["body"])[1]: c["body"] for c in p}
assert "לשנות את הצבע? (כחול / ירוק)" in by["#5"] and "QUESTION:" not in by["#5"]
assert "שָׁלוֹם" in by["#7"] and "`review-7`" in by["#7"] and "#9" in by
assert "- 1. Yes" in by["#6"] and "- 2. No, tell Claude" in by["#6"]   # a permission menu: its options are listed
assert clock[0] - start <= 240 and all(any(f"#{n}" in t or f"-{n}" in t for t in told) for n in (5, 7, 9, 6)), told
assert all("NEW OWNER QUESTION" in t and "PushNotification" in t for t in told), told
assert sum("issue-5" in t for t in told) == 1                  # the orchestrator is told once per question
# blocked menu seen for under 90 s: nothing posted yet (the runner answers short menus at once)
g2 = FakeGH(); OQ.STATE = tmp / "b.json"
OQ.GH = g2
W.waiting_since.clear(); W.told.clear()
screens2 = {"issue-8": "Allow?\n❯ 1. Yes\n"}; W.screen_text = lambda n: screens2[n]
W.check_windows([{"name": "issue-8", "status": "blocked", "state": "live"}]); assert posts(g2) == []
clock[0] += 60; W.check_windows([{"name": "issue-8", "status": "blocked", "state": "live"}]); assert posts(g2) == []
clock[0] += 60; W.check_windows([{"name": "issue-8", "status": "blocked", "state": "live"}]); assert len(posts(g2)) == 1   # within 2 minutes
# a new question in the same window is posted again; gh down -> retried on the next tick
screens2["issue-8"] = "● QUESTION: עוד שאלה?\n"; g2.fail = True
W.check_windows([{"name": "issue-8", "status": "idle", "state": "live"}]); g2.fail = False; assert len(posts(g2)) == 1
W.check_windows([{"name": "issue-8", "status": "idle", "state": "live"}]); assert len(posts(g2)) == 2
W.check_windows([{"name": "issue-8", "status": "idle", "state": "live"}]); assert len(posts(g2)) == 2
# lost state file: the key in the issue comments still prevents a duplicate
OQ.STATE.unlink(); OQ._save({"issue": next(iter(g2.issues)), "posted": []})
W.check_windows([{"name": "issue-8", "status": "idle", "state": "live"}]); assert len(posts(g2)) == 2
print("ok owner_q watchdog")

# ---- open / answered (dashboard + orchestrator) ----
cs = g.issues[issue]["comments"]
qs = OQ.open_questions(cs)
assert [q["window"] for q in qs] == ["#5", "#7", "#9", "#6"] and qs[0]["text"].startswith("לשנות") and qs[0]["url"], qs
k5, k7 = qs[0]["key"], qs[1]["key"]
assert OQ.mark_answered(k5, "כחול", gh=g)
cs[1]["reactionGroups"] = [{"content": "THUMBS_UP", "users": {"totalCount": 1}}]       # the owner reacted: answered too
assert [q["window"] for q in OQ.open_questions(cs)] == ["#9", "#6"]
# the owner replies in the issue -> the orchestrator is told once, with the open questions
OQ.STATE = tmp / "owner_q.json"; told.clear()
OQ.answers_tick(told.append, gh=g); assert told == []                                   # nothing new since last time
cs.append({"body": "ירוק, ו-9 עד 11", "url": "u", "reactionGroups": []})
OQ.answers_tick(told.append, gh=g); OQ.answers_tick(told.append, gh=g)
assert len(told) == 1 and "ירוק, ו-9 עד 11" in told[0] and "#9" in told[0] and "#5" not in told[0].split("Open questions:")[1], told
# dashboard: 'Needs you' lists the open questions with text and link
import dashboard as D
now = time.time()
m = D.model([{"number": 1, "title": "t", "state": "OPEN", "labels": [], "createdAt": "2026-11-25T08:00:00Z", "closedAt": None, "body": ""}], [], [], now)
m["questions"] = OQ.open_questions(cs); m["ov"] = D.oversight("", now, now, "", now, now); m["ai"] = None
assert "Needs you (question): #9 לכמה גילאים?" in D.text(m) and cs[2]["url"] in D.text(m), D.text(m)
pg = D.page(m); assert "Needs you: open questions" in pg and "לכמה גילאים?" in pg and f'href="{cs[2]["url"]}"' in pg
print("ok owner_q open/answered/dashboard")
# #211: the tool posts under the owner's own account -> its posts carry a hidden marker and are never counted as his answer
told.clear()
assert OQ.post("orchestrator", "QUESTION: NEEDS YOU: add the Cloudflare token as a GitHub secret", gh=g)
assert OQ.mark_answered(qs[2]["key"], "done", gh=g)
assert all(OQ.MARK in c["body"] for c in cs[-2:]), cs[-2:]
OQ.answers_tick(told.append, gh=g); assert told == [], told
cs.append({"body": OQ.MARK + "\nNEEDS YOU (blocks deploys): a tool note without a key", "url": "u", "reactionGroups": []})
OQ.answers_tick(told.append, gh=g); assert told == [], told
cs.append({"body": "כן, הוספתי", "url": "u", "reactionGroups": []})                      # a real owner reply (no marker)
OQ.answers_tick(told.append, gh=g); assert len(told) == 1 and "כן, הוספתי" in told[0] and "Cloudflare" not in told[0].split("Open questions:")[0], told
print("ok owner_q #211 own posts are not answers")
# #469: GitHub limited for BOTH identities -> a question post returns within 10 s (no 60 s sleeps) and is never lost:
# it is queued and the watchdog's answers_tick posts it once GitHub answers again
import ghcache as GC, ghauth
class _P:
    def __init__(self, rc, out): self.returncode, self.stdout, self.stderr = rc, out, ""
clk, slept = [0.0], []
real = (R.subprocess.run, ghauth.token, GC._clock, GC.time.sleep, OQ.GH)
R.subprocess.run = lambda cmd, **k: _P(1, "GraphQL: API rate limit already exceeded for installation ID 186191764")
ghauth.token = lambda *a, **k: "ghs_app"
GC._clock = lambda: clk[0]
GC.time.sleep = lambda s: (slept.append(s), clk.__setitem__(0, clk[0] + s))
OQ.GH = R.gh
try:
    assert OQ.post("issue-77", "QUESTION: כחול או ירוק?") is None
    assert sum(slept) <= 10, slept
    slept.clear()
    assert OQ.main(["ask", "#78", "צבע?"]) == 0, "ask: queued, not an error"
finally:
    R.subprocess.run, ghauth.token, GC._clock, GC.time.sleep, OQ.GH = real
    GC.LIMITED.unlink(missing_ok=True)
assert sum(slept) <= 10, slept
assert [p["window"] for p in OQ._state().get("pending", [])] == ["issue-77", "#78"], OQ._state()
OQ.answers_tick(told.append, gh=g)
assert not OQ._state().get("pending") and any("כחול או ירוק?" in c["body"] for c in cs) and any("צבע?" in c["body"] for c in cs), "posted later"
print("ok owner_q #469 a limited GitHub never blocks a question > 10 s, and it is posted later")

# #608: an owner gate (design approved, merge OK, release OK) counts only through the owner channel = an owner_q answer record
# (question page / Telegram via qwin.answer, or a reaction on the question in #205), never a free comment text
QK = OQ.key_of("remote-64", "QUESTION: design ok?")
qcs = [{"body": OQ.body(QK, "remote-64", "QUESTION: design ok?"), "reactionGroups": []},
       {"body": OQ.body("1" * 12, "remote-65", "QUESTION: other?"), "reactionGroups": []}]
bot = [{"body": "design approved (owner, 27 Nov, via cloud session)\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_"},
       {"body": "design approved"}, {"body": "HOLD (owner-merge) on PR #557"},
       {"body": f"OWNER ANSWER (question window, owner-q:{QK}): approved"}]                # typed text without the record mark
assert OQ.gate(64, bot, qcs) == [], "a bot comment 'design approved' -> gate still closed"
assert OQ.gate(64, bot + [{"body": OQ.answer_body(QK, "מאושר")}], qcs) == ["מאושר"], "an owner_q answer -> gate open"
assert OQ.gate(64, [{"body": OQ.answer_body("1" * 12, "x")}], qcs) == [], "a record of another issue's question does not count"
assert OQ.gate(64, [{"body": OQ.answer_body("2" * 12, "x")}], qcs) == [], "a record with no such question does not count"
qcs[0]["reactionGroups"] = [{"content": "THUMBS_UP", "users": {"totalCount": 1}}]        # the owner reacted in #205
assert OQ.gate(64, bot, qcs) == ["reaction THUMBS_UP"]
# the CLI reviewers and the runner use: `owner_q.py gate <n>` reads both issues, exit 0 = open
g3 = FakeGH(); OQ.STATE = tmp / "owner_q_gate.json"; OQ.GH = g3
g3.issues[205] = {"title": OQ.TITLE, "comments": [dict(c, reactionGroups=[]) for c in qcs]}; g3.issues[64] = {"title": "x", "comments": list(bot)}
import io, contextlib
class _Out(io.StringIO):
    def reconfigure(self, **k): pass
out = _Out()
with contextlib.redirect_stdout(out): rc = OQ.main(["gate", "#64"])
assert rc == 1 and "CLOSED" in out.getvalue(), out.getvalue()
g3.issues[64]["comments"].append({"body": OQ.answer_body(QK, "כן")})
out = _Out()
with contextlib.redirect_stdout(out): rc = OQ.main(["gate", "64"])
assert rc == 0 and "OPEN" in out.getvalue() and "כן" in out.getvalue(), out.getvalue()
print("ok owner_q #608 owner gate only through an owner_q answer record")

# #636: the merge gate. An issue is owner-gated when an owner question about it exists (any window but its own reviewer's
# PURPLE: hold parks the issue, merge-safe merges by design). Gated + gate CLOSED -> never merge; gated + OPEN or not gated -> fine.
qcs2 = [{"body": OQ.body(QK, "remote-64", "QUESTION: design ok?"), "reactionGroups": []},
        {"body": OQ.body("3" * 12, "review-66", "QUESTION: blue or green?"), "reactionGroups": []}]
assert OQ.merge_state(64, bot, qcs2) == "closed", "#557: the owner's #64 question unanswered + a bot 'design approved' -> closed"
assert OQ.merge_state(64, bot + [{"body": OQ.answer_body(QK, "כן")}], qcs2) == "open"
assert OQ.merge_state(65, [], qcs2) == "none", "no owner question about #65 -> not owner-gated"
assert OQ.merge_state(66, [], qcs2) == "none", "a reviewer PURPLE question (merge-safe or hold) is not a merge gate"
assert OQ.merge_state(64, None, qcs2) == "error" and OQ.merge_state(64, [], None) == "error"
g4 = FakeGH(); OQ.STATE = tmp / "owner_q_merge.json"; OQ.GH = g4
g4.issues[205] = {"title": OQ.TITLE, "comments": [dict(c) for c in qcs2]}; g4.issues[64] = {"title": "x", "comments": list(bot)}; g4.issues[65] = {"title": "y", "comments": []}
assert OQ.merge_gate(64) == "closed" and OQ.merge_gate(65) == "none"
g4.fail = True; OQ.STATE = tmp / "owner_q_merge2.json"
assert OQ.merge_gate(64) == "error", "GitHub unreadable -> error (the runner refuses)"
print("ok owner_q #636 merge gate: gated + CLOSED never merges")

# #630: a question names the issue(s) it gates (owner_q.py ask --gates 64): gate #64 opens on its answer, whatever its window
GK = OQ.key_of("orchestrator", "QUESTION: building world design ok?")
gb = OQ.body(GK, "orchestrator", "QUESTION: building world design ok?", gates=[64])
assert "<!-- gates: #64 -->" in gb and OQ.gates_of(gb) == [64], gb
assert OQ.open_questions([{"body": gb, "url": "u"}])[0]["gates"] == [64]
gq = [{"body": gb, "reactionGroups": []}]
assert OQ.gate(64, [], gq) == [], "unanswered -> closed"
assert OQ.gate(64, [{"body": OQ.answer_body(GK, "approve")}], gq) == ["approve"], "answered from window 'orchestrator' gating #64 -> OPEN"
assert OQ.gate(65, [{"body": OQ.answer_body(GK, "approve")}], gq) == [], "it gates #64 only"
assert OQ.gate(64, [{"body": OQ.answer_body(GK, "approve")}], [{"body": OQ.body(GK, "orchestrator", "QUESTION: building world design ok?")}]) == [], "no gates marker -> not #64's"
gq[0]["reactionGroups"] = [{"content": "THUMBS_UP", "users": {"totalCount": 1}}]
assert OQ.gate(64, [], gq) == ["reaction THUMBS_UP"]
# the CLI: ask --gates 64 posts the marker; gate #64 is OPEN after the answer record on #64
g4 = FakeGH(); OQ.STATE = tmp / "owner_q_gates.json"; OQ.GH = g4
out = _Out()
with contextlib.redirect_stdout(out): rc = OQ.main(["ask", "orchestrator", "building world design ok?", "--gates", "64"])
qn = next(n for n, i in g4.issues.items() if i["title"] == OQ.TITLE)
assert rc == 0 and OQ.gates_of(g4.issues[qn]["comments"][-1]["body"]) == [64], g4.issues
g4.issues[64] = {"title": "x", "comments": [{"body": OQ.answer_body(GK, "approve")}]}
out = _Out()
with contextlib.redirect_stdout(out): rc = OQ.main(["gate", "#64"])
assert rc == 0 and "OPEN" in out.getvalue(), out.getvalue()
assert OQ.merge_state(64, [], [{"body": gb, "reactionGroups": []}]) == "closed", "#630+#636: an unanswered --gates 64 question gates the merge"
assert OQ.merge_state(64, [{"body": OQ.answer_body(GK, "approve")}], [{"body": gb, "reactionGroups": []}]) == "open"
print("ok owner_q #630 gate opens on an answered question that gates #n, whatever its window")

# #696 every owner question is Hebrew and whole: an English text gets a short Hebrew version (the English original stays
# in the comment for the agents); a Hebrew text is left alone; a failed translation keeps the original; a multi-line
# question is read back in full (it was cut at the first line).
g5 = FakeGH(); OQ.STATE = tmp / "owner_q_he.json"; OQ.GH = g5
told = []
OQ.TRANSLATE = lambda t: (told.append(t), "הסוכן הקבוע לא רץ. התחבר מחדש.")[1]
OQ.post("#696a", "QUESTION: the hourly task does not run - re-login")
c = posts(g5)[-1]["body"]
assert told == ["the hourly task does not run - re-login"], told
qa = OQ.open_questions([{"body": c, "url": "u"}])[0]
assert qa["text"] == "הסוכן הקבוע לא רץ. התחבר מחדש.", qa
assert "the hourly task does not run - re-login" in c, c                                # the original stays for the agents
OQ.post("#696b", "QUESTION: איזה צבע? 1) ירוק 2) כחול"); assert len(told) == 1, told        # Hebrew: no translation
OQ.TRANSLATE = lambda t: None                                                           # translator down: original kept, still posted
OQ.post("#696c", "QUESTION: still english")
assert OQ.open_questions([{"body": posts(g5)[-1]["body"], "url": "u"}])[0]["text"] == "still english"
long_q = "שורה ראשונה.\nשורה שנייה ארוכה.\nשורה שלישית?"
OQ.post("#696d", "QUESTION: " + long_q)
assert OQ.open_questions([{"body": posts(g5)[-1]["body"], "url": "u"}])[0]["text"] == long_q, "whole text, not cut"
OQ.TRANSLATE = None
print("ok owner_q #696 Hebrew question, whole text")
