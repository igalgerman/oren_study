"""#282 nothing put aside is forgotten: batch members, manual/later, polish lists, night list. Fakes only.
Run: python3 tools/runner/test_parked.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
import calendar, json, sys
from pathlib import Path
sys.argv.append("--dry-run")
import parked as P

now = calendar.timegm((2026, 11, 26, 20, 0, 0, 0, 0, 0))
def time_iso(t):
    import time; return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))
def I(n, labels, st="OPEN", title=None, body="", c=None):
    return {"number": n, "title": title or f"t{n}", "state": st, "labels": labels, "body": body,
            "createdAt": c or "2026-11-25T08:00:00Z", "updatedAt": "2026-11-26T08:00:00Z"}

# ---- batch membership: from the batch issues' title and member list (open AND closed batches) ----
b1 = I(50, ["ready-for-agent", "P2", "core"], title="Batch: parent panel (#11, #12)", body="Members:\n- [ ] #11  a\n- [x] #12  b\n- [ ] #13  c\n## Acceptance\nx")
b2 = I(60, ["P2", "pack"], st="CLOSED", title="Batch: texts (#21, #22)", body="- [ ] #21 x\n- [ ] #22 y")
b3 = I(70, ["in-progress", "P2"], title="Batch: tests (#31)", body="- [ ] #31 z")
mem = P.batch_members([b1, b2, b3, I(5, [], body="- [ ] #99 not a batch")])
assert mem == {11: 50, 12: 50, 13: 50, 21: 60, 22: 60, 31: 70}, mem
assert P.batch_ok(b1) and P.batch_ok(b3) and not P.batch_ok(b2)
assert not P.batch_ok(I(80, ["P2"], title="Batch: x (#1)"))                 # open but neither ready nor running: not safe

# ---- broken batches: member open, its batch closed -> ready-for-agent back ----
iss = [b1, b2, b3, I(11, ["P2"]), I(21, ["P2", "pack"]), I(22, ["P2"], st="CLOSED"), I(31, ["P3"])]
assert P.broken_members(iss) == [(21, 60)], P.broken_members(iss)
assert P.broken_members([b2, I(21, ["P2", "ready-for-agent"])]) == []                  # already ready again: nothing to do

# ---- reasons for every open issue that is not ready-for-agent ----
qs = [{"key": "abc123abc123", "window": "#40", "text": "which colour?", "url": "u"},
      {"key": "def456def456", "window": "issue-41", "text": "ok?", "url": "u2"}]
prs = [{"number": 900, "headRefName": "lane/42", "body": "", "title": "x"}, {"number": 901, "headRefName": "claude/x", "body": "Closes #43", "title": "y"}]
op = [b1, b3, I(11, ["P2"]), I(21, ["P2"]), I(31, ["P3"]),
      I(40, ["manual", "P2"]), I(41, ["later", "P3"]), I(42, ["manual"]), I(43, ["later"]),
      I(44, ["later", "P3"], body="Later until: 2026-12-05"), I(45, ["P2"], body="Due: 2026-12-01"),
      I(46, ["manual", "P2"]), I(47, ["later"]), I(48, []), I(49, ["P2"], body="Blocked by: #11"),
      I(51, ["ready-for-human", "P2"]), I(52, ["needs-triage"]), I(53, ["blocked", "needs-orchestrator"]),
      I(54, ["ready-for-agent", "P2"]), I(55, ["in-progress"]), I(56, [], title="Questions for the owner"),
      I(57, ["retro", "P2"], title="Daily retro 2026-11-26"), I(58, ["core"], title="Polish backlog (core)", body="- a (PR #1)")]
rs = P.reasons(op + [b2], qs, prs, now)
got = {r["n"]: r["reason"] for r in rs}
assert 54 not in got and 55 not in got and 50 not in got and 70 not in got, got        # ready / running: not parked
assert got[11] == "batch #50" and got[31] == "batch #70" and got[21] is None, got        # #21: its batch #60 is closed
assert got[40] == "manual, waiting for owner question abc123abc123" and got[41] == "later, waiting for owner question def456def456", got
assert got[42] == "manual, PR #900 open" and got[43] == "later, PR #901 open", got
assert got[44] == "later until 2026-12-05" and got[45] == "due 2026-12-01", got
assert got[46] is None and got[47] is None and got[48] is None, got                      # no reason -> alarm
assert got[49] == "waits for #11" and got[51] == "waits for the owner (ready-for-human)", got
assert got[52] == "new, waits for triage" and got[53] == "blocked (orchestrator)", got
assert got[56] == "owner questions issue" and got[57] == "retro (orchestrator)" and got[58].startswith("polish list"), got
assert [r["n"] for r in rs if r["reason"] is None] == [21, 46, 47, 48], rs
assert P.reasons([I(247, ["pack", "later"], title="Polish backlog (pack)")], [], [], now)[0]["reason"].startswith("polish list")   # the promotion rule owns it
rep = P.night_report(rs)
assert rep.startswith("NIGHT REPORT (#282): 4 open issues have NO reason") and "#46 t46" in rep and "#11 t11: batch #50" in rep, rep
assert P.night_report([r for r in rs if r["reason"]]).startswith("NIGHT REPORT (#282): every open issue that is not ready-for-agent has a reason"), rep
print("ok parked reasons")

# ---- the parked alarm: later/manual for 2 h+, no open owner question, no live run/PR ----
st = {}
lab = [I(40, ["manual"]), I(41, ["later"]), I(42, ["manual"]), I(46, ["manual"]), I(47, ["later"]),
       I(44, ["later"], body="Later until: 2026-12-05"), I(59, ["later"], body="Later until: 2026-11-20"), I(55, ["manual", "in-progress"])]
lab.append(I(247, ["pack", "later"], title="Polish backlog (pack)"))                     # never 'parked': promoted at 5 notes / 24 h
assert P.parked_alarms(lab, qs, prs, now, st) == []                                     # first seen now: not 2 h yet
assert set(st["seen"]) == {"40", "41", "42", "46", "47", "44", "59", "55", "247"}
assert P.parked_alarms(lab, qs, prs, now + 7100, st) == []
al = P.parked_alarms(lab, qs, prs, now + 7200, st)
assert al == ["parked without owner question: #46", "parked without owner question: #47", "parked without owner question: #59"], al   # #59: its date passed
assert P.parked_alarms([i for i in lab if i["number"] != 46], qs, prs, now + 7300, st) == [] and "46" not in st["seen"]   # within the hour; label gone: forgotten
assert P.parked_alarms([I(46, ["manual"])], qs, prs, now + 7400, st) == []             # labelled again: the 2 h start over

# ---- rolling polish lists: ready (P3) at 5 notes or when the oldest note is 24 h old ----
def pol(n, notes_at, labels=("core",)):
    body = "Rolling list of BLUE review notes.\n\n- first (PR #1)"
    return {"number": n, "title": "Polish backlog (core)", "state": "OPEN", "labels": list(labels), "body": body, "createdAt": time_iso(notes_at[0]),
            "comments": [{"body": "- n%d (PR #%d)\n- m (PR #2)" % (k, k), "createdAt": time_iso(t)} for k, t in enumerate(notes_at[1:])]}
assert P.polish_notes(pol(1, [now - 3600, now - 60])) == (3, now - 3600)
assert P.polish_due(pol(1, [now - 3600, now - 60]), now) is None                        # 3 notes, 1 h old
assert P.polish_due(pol(1, [now - 3600, now - 60, now - 30]), now) == "5 notes"
assert P.polish_due(pol(1, [now - 86400]), now) == "oldest note 24 h old"
assert P.polish_due(pol(1, [now - 86400], ("core", "ready-for-agent")), now) is None  # already ready
assert P.polish_due(pol(1, [now - 86400], ("core", "in-progress")), now) is None
assert P.is_polish({"title": "Polish backlog (pack)"}) and not P.is_polish({"title": "Polish the menu"})

class FakeGH:
    def __init__(self, issues, polish=()):
        self.issues, self.polish, self.calls = issues, {p["number"]: p for p in polish}, []
    def __call__(self, *a, **kw):
        self.calls.append(a)
        if a[:2] == ("issue", "list"):
            return 0, json.dumps([{**i, "labels": [{"name": l} for l in i["labels"]]} for i in self.issues])
        if a[:2] == ("pr", "list"): return 0, json.dumps(prs)
        if a[:2] == ("issue", "view"): return 0, json.dumps(self.polish[int(a[2])])
        return 0, ""
pol278 = {**pol(278, [now - 90000]), "labels": ["core"]}
g = FakeGH([b1, b2, I(21, ["P2", "pack"]), I(46, ["manual"]), {k: v for k, v in pol278.items() if k != "comments"}], [pol278])
told, logs = [], []
P.STATE = Path(tempfile.mkdtemp()) / "parked.json"
P.tick(told.append, logs.append, gh=g, questions=lambda: qs, now=now)
edits = [a for a in g.calls if a[:2] == ("issue", "edit")]
assert ("issue", "edit", "21", "--add-label", "ready-for-agent") in edits, edits                    # batch #60 closed -> member ready again
pe = next(a for a in edits if a[2] == "278")
assert "--add-label" in pe and "ready-for-agent" in pe and "P3" in pe and "## Acceptance" in pe[pe.index("--body") + 1], pe   # promoted with P3 + Acceptance
assert any(a[:3] == ("issue", "comment", "21") for a in g.calls) and any(a[:3] == ("issue", "comment", "278") for a in g.calls)
assert len(told) == 1 and "#21" in told[0] and "batch #60 is closed" in told[0] and "#278" in told[0], told
g.calls.clear(); told.clear()
P.tick(told.append, logs.append, gh=g, questions=lambda: qs, now=now + 600)              # once an hour
assert g.calls == [] and told == []
P.tick(told.append, logs.append, gh=g, questions=lambda: qs, now=now + 7300)             # 2 h later: #46 parked without a question
assert any("parked without owner question: #46" in t for t in told), told
told.clear()
P.tick(told.append, logs.append, gh=g, questions=lambda: qs, now=now + 7300 + 3600)     # the same alarm: once an hour (each tick is an hour)
assert any("#46" in t for t in told)
# night report once a day at retro_hour
told.clear(); st = json.loads(P.STATE.read_text())
import time
P.REPORT_HOUR = 23
lt = time.localtime(now + 86400)                                                         # the next day: the earlier ticks did not report yet
at_hour = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, P.REPORT_HOUR, 5, 0, 0, 0, -1))
st["at"] = 0; P.STATE.write_text(json.dumps(st))
P.tick(told.append, logs.append, gh=g, questions=lambda: qs, now=at_hour)
assert any(t.startswith("NIGHT REPORT (#282)") for t in told), told
told.clear(); st = json.loads(P.STATE.read_text()); st["at"] = 0; P.STATE.write_text(json.dumps(st))
P.tick(told.append, logs.append, gh=g, questions=lambda: qs, now=at_hour + 60)
assert not any(t.startswith("NIGHT REPORT") for t in told), told                          # not twice the same day
# gh failing: nothing happens, no crash
P.tick(told.append, logs.append, gh=lambda *a, **k: (1, "network"), questions=lambda: None, now=at_hour + 99999)
print("ok parked tick")
# the watchdog runs it every tick (parked.tick keeps its own hourly guard); an error never stops the watchdog
import watchdog as W
calls = []
P.tick = lambda tell, log, **k: calls.append(1)
W.parked_tick(); assert calls == [1]
P.tick = lambda *a, **k: 1 / 0
W.parked_tick()
assert "parked" in W.RELOAD and "parked_tick()" in Path(W.__file__).read_text()
print("ok parked watchdog")
