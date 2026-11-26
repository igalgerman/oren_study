"""#241 durable 'Due:' reminders. Run: python3 tools/runner/test_due.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
os.environ["OREN_TEST"] = "1"   # #325
import json, sys, time
sys.argv.append("--dry-run")
import due as D

local = lambda s: time.mktime(time.strptime(s, "%Y-%m-%d %H:%M"))   # Due times are the owner's local clock
now = local("2026-11-28 18:00")

# --- parsing: one 'Due: YYYY-MM-DD HH:MM' line; a bad date is ignored ---
assert D.due_of("x\nDue: 2026-11-28 17:30\ny") == ("2026-11-28 17:30", local("2026-11-28 17:30"))
assert D.due_of("Due: 2026-11-28 17:30 (Israel time), 30 min after the reset.\nOwner...")[0] == "2026-11-28 17:30"   # #240's real line
assert D.due_of("**Due:** 2026-11-28 9:05") == ("2026-11-28 9:05", local("2026-11-28 09:05"))
assert D.due_of("Due: 2026-13-40 25:00") is None          # bad date
assert D.due_of("Due: tomorrow") is None and D.due_of("") is None and D.due_of(None) is None
assert D.due_of("Later until: 2026-11-20") is None        # parked.py's date lines are not reminders
assert D.due_of("it is due 2026-11-20 10:00 maybe") is None   # only a line that starts with 'Due:'

# --- which issues are due: open, time passed, not yet reminded ---
I = lambda n, body, labels=(), st="OPEN": {"number": n, "title": f"t{n}", "state": st, "labels": list(labels), "body": body}
issues = [I(240, "Due: 2026-11-28 17:30", ["owner"]),           # passed -> remind
          I(242, "Due: 2026-11-28 19:00"),                       # future -> no
          I(243, "Due: 2026-11-27 08:00"),                       # passed, already commented -> no
          I(244, "Due: 2026-02-30 10:00"),                       # bad date -> ignored
          I(245, "Due: 2026-11-01 10:00", st="CLOSED"),          # closed -> no
          I(246, "no due line")]
assert [i["number"] for i in D.candidates(issues, now)] == [240, 243], D.candidates(issues, now)
done = [{"body": D.comment_text("2026-11-27 08:00")}]
assert D.reminded("2026-11-27 08:00", done) and not D.reminded("2026-11-28 17:30", done)
assert not D.reminded("2026-11-27 08:00", [{"body": "Due reached? not yet"}])

# --- the tick with a fake gh: one reminder, tells the orchestrator, owner popup only for label owner ---
calls, told, asked = [], [], []
def fake_gh(*a):
    calls.append(a)
    if a[:2] == ("issue", "list"): return 0, json.dumps([{**i, "labels": [{"name": l} for l in i["labels"]]} for i in issues])
    if a[:2] == ("issue", "view"):
        return 0, json.dumps({"comments": done if a[2] == "243" else []})
    return 0, ""
st = {}
out = D.tick(fake_gh, told.append, lambda s: None, now=now, ask=lambda w, q: asked.append((w, q)) or "url", st=st)
assert out == [240], out
coms = [a for a in calls if a[:2] == ("issue", "comment")]
assert len(coms) == 1 and coms[0][2] == "240" and "Due reached" in coms[0][4], coms
assert len(told) == 1 and "#240" in told[0] and "t240" in told[0], told
assert len(asked) == 1 and asked[0][0] == "#240" and asked[0][1].startswith("QUESTION:"), asked

# owner popup only when labelled owner
issues[0]["labels"] = []
calls.clear(); told.clear(); asked.clear()
assert D.tick(fake_gh, told.append, lambda s: None, now=now + 700, ask=lambda w, q: asked.append(w), st=st) == [240]
assert asked == [] and len(told) == 1

# at most once per 10 minutes (cheap)
calls.clear(); told.clear()
assert D.tick(fake_gh, told.append, lambda s: None, now=now + 800, st=st) is None and calls == [] and told == []

# already commented (state lives on GitHub, so a restart does not fire it again) -> none
done.append({"body": D.comment_text("2026-11-28 17:30")})
fake_view = lambda *a: (0, json.dumps({"comments": done})) if a[:2] == ("issue", "view") else fake_gh(*a)
calls.clear(); told.clear()
assert D.tick(fake_view, told.append, lambda s: None, now=now + 2000, st={}) == [] and told == []
assert not [a for a in calls if a[:2] == ("issue", "comment")]

# comment fails -> nobody is told (next pass retries); gh list error -> nothing
told.clear()
fail_comment = lambda *a: (1, "boom") if a[:2] == ("issue", "comment") else fake_gh(*a)
issues[0]["labels"] = ["owner"]; done.pop()
assert D.tick(fail_comment, told.append, lambda s: None, now=now, ask=lambda w, q: asked.append(w), st={}) == [] and told == []
assert D.tick(lambda *a: (1, "boom"), told.append, lambda s: None, now=now, st={}) is None and told == []
print("due tests OK")
