"""#187 test gardener: candidate rules on fixtures, the issue it opens/updates, the weekly due check. Run: python3 tools/test_test_garden.py"""
import calendar, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_garden as G

DAY = 86400
now = calendar.timegm((2026, 11, 26, 12, 0, 0, 0, 0, 0))
row = lambda d, suite, secs=10, st="ok": {"at": now - d * DAY, "suite": suite, "seconds": secs, "status": st}

# --- times.tsv parsing ---
tsv = "suite\tseconds\tbudget\tstatus\nhelp-desktop\t12\t60\tok\nspell\t70\t60\tSLOW\n"
assert G.parse_times(tsv, at=5) == [{"at": 5, "suite": "help-desktop", "seconds": 12, "status": "ok"},
                                    {"at": 5, "suite": "spell", "seconds": 70, "status": "SLOW"}], G.parse_times(tsv, at=5)
assert G.parse_times("") == [] and G.parse_times("garbage") == []

# --- never failed in 30 days: seen, only ok; an old failure (> 30 d) does not count; unseen suites are unknown ---
rows = [row(1, "help-desktop"), row(2, "help-phone"), row(3, "spell", st="FAILED"), row(40, "help-phone", st="FAILED"),
        row(5, "chess-desktop"), row(6, "chess-phone", st="SLOW")]
assert G.never_failed(rows, now) == {"help-desktop", "help-phone", "chess-desktop"}, G.never_failed(rows, now)

# --- desktop+phone twins with nothing phone-specific in the file ---
suites = ["help desktop", "help phone", "chess desktop", "chess phone", "learn", "parent desktop", "parent phone"]
src = {"help": "ok(a, 'x');", "chess": "ok(a, 'x');", "parent": "if (L.variant === 'phone') tap();"}
tw = G.phone_twins(suites, src.get)
assert tw == ["help", "chess"], tw          # parent branches on phone: needed twice

# --- near-duplicate test names across files ---
srcs = {"help": "ok(x, 'HELP API present');\nok(y, `voice text: numbers spoken as words`);",
        "again": "ok(z, 'voice text: numbers spoken as word');\nok(w, 'totally different check here');",
        "spell": "ok(q, 'HELP API present ');"}
assert G.test_names(srcs["help"]) == ["HELP API present", "voice text: numbers spoken as words"], G.test_names(srcs["help"])
d = G.near_dupes(srcs)
pairs = {(a, b) for a, _, b, _ in d}
assert ("again", "help") in pairs and ("help", "spell") in pairs and len(d) == 2, d
assert all(x != y for x, _, y, _ in d)                                 # never within one file

# --- got > 30% slower in a week (median this week vs the week before) ---
rows = [row(1, "a", 20), row(2, "a", 21), row(9, "a", 10), row(10, "a", 11),     # a: 10.5 -> 20.5: slower
        row(1, "b", 12), row(9, "b", 10),                                       # b: +20%: fine
        row(1, "c", 50)]                                                         # c: no earlier week: unknown
assert G.slower(rows, now) == [("a", 10.5, 20.5)], G.slower(rows, now)

# --- quarantined > 2 days ---
q = G.quarantined({"reading": now - 3 * DAY, "spell": now - 1 * DAY, "ghost": None}, now)
assert q == [("reading", 3)], q

# --- candidates: twins/dupes only when the suites never failed; report + title ---
ci = [row(1, "help-desktop"), row(1, "help-phone"), row(1, "chess-desktop"), row(1, "chess-phone", st="FAILED"),
      row(1, "again"), row(1, "spell"), row(1, "a", 20), row(9, "a", 10)]
c = G.candidates(ci, suites + ["again", "spell"], {"help": srcs["help"], "chess": "", "parent": src["parent"], "again": srcs["again"], "spell": srcs["spell"]}.get,
                 {"reading": now - 3 * DAY}, now)
assert c["twins"] == ["help"], c                     # chess phone failed this month: keep both
assert {(a, b) for a, _, b, _ in c["dupes"]} == {("again", "help"), ("help", "spell")}, c["dupes"]
assert c["slower"] == [("a", 10.0, 20.0)] and c["quarantined"] == [("reading", 3)], c
assert G.title(now) == "Test trim proposal (week 48)", G.title(now)
body = G.report(c, runs=12)
for s in ("help desktop", "help phone", "HELP API present", "a: 10s -> 20s", "reading", "never deletes", "ready-for-agent", "12 CI runs"):
    assert s in body, (s, body)
assert not any(G.candidates([], suites, src.get, {}, now).values())

# --- publish: ONE issue; an open proposal (any week) is updated, else one is created ---
calls = []
def gh(*a):
    calls.append(a)
    if a[:2] == ("issue", "list"): return 0, gh.listing
    return 0, ""
gh.listing = '[{"number": 7, "title": "Test trim proposal (week 47)"}, {"number": 8, "title": "other"}]'
assert G.publish(gh, "Test trim proposal (week 48)", "B") == ("updated", 7)
assert calls[-1][:3] == ("issue", "edit", "7") and "Test trim proposal (week 48)" in calls[-1] and "B" in calls[-1]
calls.clear(); gh.listing = "[]"
assert G.publish(gh, "T", "B")[0] == "created"
assert calls[-1][:2] == ("issue", "create") and "needs-triage" in calls[-1], calls
calls.clear(); gh.listing = None
def bad(*a): calls.append(a); return 1, ""
assert G.publish(bad, "T", "B") is None and all(c[:2] == ("issue", "list") for c in calls)   # gh error: nothing written

# --- weekly from the watchdog: due once per 7 days, marker written, never twice ---
m = Path(tempfile.mkdtemp()) / "garden.last"
spawned = []
assert G.run_if_due(m, now, spawn=lambda: spawned.append(1)) is True and spawned == [1]
assert G.run_if_due(m, now + 6 * DAY, spawn=lambda: spawned.append(1)) is False and spawned == [1]
assert G.run_if_due(m, now + 7 * DAY + 1, spawn=lambda: spawned.append(1)) is True and spawned == [1, 1]

# --- the real repo: run.sh's suite list and quarantine.txt parse ---
real = G.suite_list()
assert "help desktop" in real and "playthrough phone" in real, real[:5]
assert isinstance(G.quarantine_entries(), list)
print("PASS test_garden")
