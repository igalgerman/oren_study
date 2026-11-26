"""#280 no issue sits stuck: live states, STUCK alarm once, owner question re-push at 4 h and the 24 h rule.
Run: python3 tools/runner/test_stuck.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
os.environ["OREN_TEST"] = "1"
import calendar, json, sys
sys.argv.append("--dry-run")
import stuck as S
import owner_q as OQ

now = calendar.timegm((2026, 11, 26, 14, 0, 0, 0, 0, 0))
iso = lambda h: S.PK.iso(now - h * 3600)
I = lambda n, labels, title=None, body="", upd=8, st="OPEN": {"number": n, "title": title or f"t{n}", "state": st, "labels": labels,
                                                              "body": body, "updatedAt": iso(upd), "createdAt": iso(30)}

# --- (1) every live state, and the leftovers ---
batch = I(300, ["ready-for-agent"], title="Batch: x (#11)")
issues = [batch,
          I(10, ["ready-for-agent", "P2"]),        # ready-for-agent
          I(11, ["P2"]),                           # batch member (batch open)
          I(12, ["in-progress"]),                  # running
          I(13, ["P2"]),                           # open PR
          I(14, ["manual"]),                       # owner question open
          I(15, ["needs-triage"]),                 # untriaged -> leftover
          I(16, ["later"]),                        # later, nobody asked -> leftover
          I(17, []),                               # no label, fresh -> leftover, not yet stuck
          I(18, ["P2"]),                           # its batch is closed -> leftover
          I(301, ["P2"], title="Batch: old (#18)", st="CLOSED")]
issues[9]["updatedAt"] = iso(8); issues[8]["updatedAt"] = iso(1)
prs = [{"number": 400, "headRefName": "lane/13", "title": "x", "body": ""}]
qs = {14}
by = {i["number"]: i for i in issues}
bm = S.PK.batch_map(issues)
assert S.live(by[10], issues, prs, qs, bm, now) == "ready-for-agent"
assert S.live(by[11], issues, prs, qs, bm, now) == "batch #300"
assert S.live(by[12], issues, prs, qs, bm, now) == "running"
assert S.live(by[13], issues, prs, qs, bm, now) == "PR #400"
assert "owner question" in S.live(by[14], issues, prs, qs, bm, now)
for n in (15, 16, 17, 18): assert S.live(by[n], issues, prs, qs, bm, now) is None, n
assert [i["number"] for i in S.leftovers(issues, prs, qs, now)] == [15, 16, 17, 18]

st = S.stuck(issues, prs, qs, now)                       # > 6 h without a live state; #17 is only 1 h old
assert [(n, m) for n, _, m in st] == [(15, "ready-for-agent"), (16, "owner question"), (18, "ready-for-agent")], st
assert st[0][1] == 8

# --- one alarm per issue, not every cycle; again only after it was live in between ---
mem = {}
a1 = S.new_alarms(st, mem)
assert [n for n, _ in a1] == [15, 16, 18] and "#15" in a1[0][1] and "ready-for-agent" in a1[0][1]
assert S.new_alarms(st, mem) == []                       # next cycle: silent
assert S.new_alarms([x for x in st if x[0] != 15], mem) == []   # #15 became live -> forgotten
assert [n for n, _ in S.new_alarms(st, mem)] == [15]      # stuck again -> one new alarm

# --- (2) owner questions: re-push once at 4 h, at 24 h the recommended option if 'skip is safe' ---
Q = lambda key, h, text, w="#14": {"key": key, "window": w, "source": w, "text": text, "url": "u", "at": iso(h)}
qlist = [Q("a" * 12, 2, "which colour? 1. red 2. blue"),
         Q("b" * 12, 5, "which colour? 1. red 2. blue"),
         Q("c" * 12, 25, "which colour? 1. red (recommended) 2. blue. skip is safe", w="#20"),
         Q("d" * 12, 30, "which colour? 1. red (recommended) 2. blue", w="#21")]
assert S.recommended(qlist[2]["text"]) == "red"
assert S.recommended("כן או לא? כן (מומלץ); לא") == "כן"
assert S.skip_safe(qlist[2]["text"]) and not S.skip_safe(qlist[3]["text"])
qm = {}
acts = S.question_actions(qlist, now, qm)
assert [(k, q["key"][0]) for k, q, _ in acts] == [("repush", "b"), ("auto", "c"), ("repush", "d")], acts
assert acts[1][2] == "red"
assert S.question_actions(qlist, now, qm) == []           # each only once
w = S.waiting(qlist, now)                                  # dashboard: 'waiting for owner Nh' (24 h+, not auto)
assert w == [("#21", 30)], w

# --- tick: alarm + push to the orchestrator once, auto answer posted on the issue and marked ---
calls, told = [], []
def gh(*a):
    calls.append(a)
    if a[:2] == ("issue", "list"): return 0, json.dumps([{**i, "labels": [{"name": l} for l in i["labels"]]} for i in issues])
    if a[:2] == ("pr", "list"): return 0, json.dumps(prs)
    return 0, ""
marked = []
mem = {}
S.tick(gh=gh, tell=told.append, log=lambda *_: None, now=now, questions=lambda: qlist, st=mem,
       mark=lambda k, t: marked.append(k) or True, push=lambda q, t: False)
assert any(t.startswith("STUCK ISSUES (watchdog, #280)") and "#15" in t and "PushNotification" in t for t in told), told
assert marked == ["c" * 12], marked
assert any(c[:3] == ("issue", "comment", "20") and "red" in c[-1] for c in calls), calls
assert any("REMINDER" in t and "#14" in t for t in told), told     # push failed -> the orchestrator pushes
n = len(told)
S.tick(gh=gh, tell=told.append, log=lambda *_: None, now=now + 700, questions=lambda: qlist, st=mem,
       mark=lambda k, t: True, push=lambda q, t: True)
assert len(told) == n, told[n:]                            # next cycle: nothing new
saved = json.loads(S.STATE.read_text(encoding="utf-8"))
assert [r["n"] for r in saved["stuck"]] == [15, 16, 18] and saved["waiting"] == [["#21", 30]], saved

# --- gh error: nothing happens ---
told2 = []
S.tick(gh=lambda *a: (1, ""), tell=told2.append, log=lambda *_: None, now=now + 5000, questions=lambda: qlist, st={})
assert told2 == []

# --- owner_q keeps the question's time ---
assert OQ.open_questions([{"body": "<!-- owner-q:abcdefabcdef -->\n**#5**\n\n**שאלה:** x", "createdAt": "2026-11-26T10:00:00Z"}])[0]["at"] == "2026-11-26T10:00:00Z"
print("test_stuck OK")
