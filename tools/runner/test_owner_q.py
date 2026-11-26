"""#193 owner questions: one post per window+question, from fake watchdog screens. Run: python3 tools/runner/test_owner_q.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
import json, re, sys, tempfile, time
from pathlib import Path
sys.argv.append("--dry-run")
import runner as R
import owner_q as OQ
import watchdog as W

tmp = Path(tempfile.mkdtemp())
OQ.STATE = tmp / "owner_q.json"

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
clock = [1000.0]
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
assert clock[0] - 1000 <= 240 and all(any(f"#{n}" in t or f"-{n}" in t for t in told) for n in (5, 7, 9, 6)), told
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
