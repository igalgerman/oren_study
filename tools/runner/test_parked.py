"""#282 parked issues: batch members, manual/later, polish lists, night report. Run: python3 tools/runner/test_parked.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
import calendar, json, sys
sys.argv.append("--dry-run")
import parked as P

now = calendar.timegm((2026, 11, 26, 14, 0, 0, 0, 0, 0))
iso = lambda h: P.iso(now - h * 3600)
I = lambda n, labels, st="OPEN", title=None, body="", upd=3, c=30: {"number": n, "title": title or f"t{n}", "state": st, "labels": labels,
                                                                   "body": body, "updatedAt": iso(upd), "createdAt": iso(c)}

# --- batch members: from the batch issue's title and its member list ---
b216 = I(216, ["ready-for-agent", "P2", "core"], title="Batch: Simplicity (#95, #96)", body="Members:\n- [ ] #95  a\n- [x] #97  b\nFixes nothing #300")
b200 = I(200, ["P2"], st="CLOSED", title="Batch: old (#50, #51)")
assert P.members(b216) == {95, 96, 97}, P.members(b216)
issues = [b216, b200, I(95, ["P2", "core"]), I(96, ["P2"]), I(97, ["P2"]), I(50, ["P3"]), I(51, ["P3", "ready-for-agent"]),
          I(60, ["manual"]), I(61, ["later"]), I(62, ["later"], upd=1), I(63, ["later"], body="Later until: 2026-12-01"),
          I(64, ["manual"], upd=5), I(65, ["later"]), I(66, ["manual", "in-progress"]),
          I(193, ["manual"], title="Questions for the owner"), I(247, ["pack", "later"], title="Polish backlog (pack)"),
          I(70, ["needs-triage"]), I(71, ["ready-for-agent", "P2"]), I(72, ["blocked", "needs-orchestrator"]),
          I(73, ["P2"], body="Blocked by: #71"), I(74, ["later"], body="due 2026-11-20")]
bm = P.batch_map(issues)
assert bm[95]["number"] == 216 and bm[50]["number"] == 200 and 71 not in bm
assert P.kind(issues[2], bm) == "batch" and P.kind(I(60, ["manual"]), bm) == "manual" and P.kind(I(61, ["later"]), bm) == "later"
assert P.kind(issues[5], bm) is None                     # its batch #200 is closed: no longer safe
assert P.kind(I(71, ["ready-for-agent"]), bm) is None

# --- orphans: batch closed, member still open without ready-for-agent -> gets it back ---
assert P.orphans(issues, bm) == [(50, 200)], P.orphans(issues, bm)     # #51 already has ready-for-agent

# --- hourly alarm: later/manual 2 h+ with no owner question and no live run/PR ---
prs = [{"number": 400, "headRefName": "lane/65", "title": "x", "body": ""}, {"number": 401, "headRefName": "claude/z", "title": "y", "body": "Fixes #64"}]
qs = {60}
al = P.parked_alarms(issues, prs, qs, now)
assert [k for k, _ in al] == ["pk61", "pk74"], al                       # 60 asked, 62 too fresh, 63 dated, 64/65 PR, 66 running, 193/247 tools
assert al[0][1] == "parked without owner question: #61", al
assert "date passed" in al[1][1], al

# --- polish lists: ready at 5 notes OR oldest note 24 h old ---
pol = I(278, ["core"], title="Polish backlog (core)", body="Rolling list...\n\n- a (PR #1)\n- b (PR #1)", c=3)
cm = lambda h, body: {"created_at": iso(h), "body": body}
assert P.polish_notes(pol, [cm(2, "- c (PR #2)\n- d (PR #2)")]) == [now - 3 * 3600] * 2 + [now - 2 * 3600] * 2
assert not P.polish_due(pol, [cm(2, "- c (PR #2)\n- d (PR #2)")], now)                # 4 notes, oldest 3 h
assert P.polish_due(pol, [cm(2, "- c (PR #2)\n- d (PR #2)\n- e (PR #3)")], now)       # 5 notes
assert P.polish_due({**pol, "createdAt": iso(25)}, [], now)                           # oldest note 25 h
assert not P.polish_due({**pol, "createdAt": iso(25), "body": "Rolling list..."}, [], now)   # no notes at all
assert not P.polish_due({**pol, "labels": ["core", "ready-for-agent"], "createdAt": iso(25)}, [], now)   # already ready
assert "## Acceptance" in P.with_acceptance(pol["body"]) and P.with_acceptance("x\n## Acceptance\n- y") == "x\n## Acceptance\n- y"

# --- night report: every open issue that is not ready-for-agent with its reason; no reason = alarm ---
rs = dict(P.reasons(issues, prs, qs, now))
assert 216 not in rs and 71 not in rs and 51 not in rs                                # ready-for-agent issues are not listed
assert rs[95] == "batch #216" and rs[60] == "manual, waiting for owner question" and rs[63] == "later until 2026-12-01"
assert rs[65] == "PR #400" and rs[66] == "running" and rs[73] == "waits for #71" and rs[72] == "blocked (needs-orchestrator)"
assert rs[193] == "owner questions list" and rs[247].startswith("polish list")
assert rs[50] is None and rs[61] is None and rs[70] is None and rs[74] is None, rs  # closed batch / no question / untriaged / date passed
t = P.night_report(issues, prs, qs, now)
assert t.startswith("NIGHT REPORT (#282): ") and "#95 batch #216" in t and "ALARM no reason: #50 #61 #62 #70 #74" in t, t

# --- the hourly tick with a fake gh: relabels orphans and due polish lists, tells the orchestrator once ---
calls, told = [], []
def fake_gh(*a):
    calls.append(a)
    if a[:2] == ("issue", "list"): return 0, json.dumps([{**i, "labels": [{"name": l} for l in i["labels"]]} for i in issues + [{**pol, "createdAt": iso(25)}]])
    if a[:2] == ("pr", "list"): return 0, json.dumps(prs)
    if a[0] == "api": return 0, "[]"
    return 0, ""
st = {}
P.tick(fake_gh, told.append, lambda s: None, now=now, questions=lambda: qs, st=st)
edits = [a for a in calls if a[:2] == ("issue", "edit")]
assert ("issue", "edit", "50", "--add-label", "ready-for-agent") in edits, edits
pe = next(a for a in edits if a[2] == "278")
assert "ready-for-agent" in pe and "P3" in pe and "--body" in pe, pe
assert any(a[:3] == ("issue", "comment", "50") for a in calls)
assert len(told) == 1 and "#50" in told[0] and "#278" in told[0] and "parked without owner question: #61" in told[0], told
told.clear(); P.tick(fake_gh, told.append, lambda s: None, now=now + 600, questions=lambda: qs, st=st)
assert told == [], told                                                               # at most once an hour
calls.clear(); P.tick(lambda *a: (1, "boom"), told.append, lambda s: None, now=now + 7200, questions=lambda: qs, st=st)
assert told == []                                                                     # gh error: nothing done
print("parked tests OK")
