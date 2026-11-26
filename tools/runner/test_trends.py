"""#155 trend watcher. Run: python3 tools/runner/test_trends.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
import sys, time
sys.argv.append("--dry-run")
import trends as T
now = time.mktime((2026, 11, 26, 9, 0, 0, 0, 0, -1))
log = "\n".join([
  "2026-11-26 05:13:24 #89: BLOCKED: runner error TimeoutExpired(['bash', 'integrate.sh'], 3600)",
  "2026-11-26 07:57:10 #79: BLOCKED: runner error FileNotFoundError(2, 'The system cannot find the file')",
  "2026-11-26 08:01:11 #72: BLOCKED: runner error FileNotFoundError(2, 'x')",
  "2026-11-26 08:11:21 #41: BLOCKED: runner error FileNotFoundError(2, 'y')",
  "2026-11-26 08:54:40 #17: BLOCKED: reviewer asked for fixes twice; needs a human",
  "2026-11-24 08:00:00 #5: BLOCKED: runner error FileNotFoundError(2, 'old')",      # older than 24 h
  "2026-11-26 08:01:17 pass: started=0 stuck=0"])
ev = [{"ts": now - 3600 * k, "issue": k, "event": "start"} for k in range(1, 7)] + [{"ts": now - 60, "issue": 1, "event": "merged"}] \
   + [{"ts": now - 600, "issue": 1, "event": e} for e in ("review_fix", "review_fix", "review_fix", "review_pass", "review_pass")]
iss = [{"number": n, "labels": ["P1"] if n < 3 else []} for n in range(1, 10)]
f = T.findings(log, ev, iss, now)
assert f["repeats"] == {"runner error FileNotFoundError": [79, 72, 41]}, f["repeats"]
assert [k for k, _ in f["alarms"]] == ["finish", "fix", "noprio"], f["alarms"]
assert f["alarms"][0][1] == "runner finished only 1 of 6 issues it started in 24 h by itself", f["alarms"]
# #302: repeats count only the last 6 h (the 3 FileNotFoundError lines are 49-63 min old; one 7 h old line is not counted)
f6 = T.findings(log + "\n2026-11-26 02:00:00 #3: BLOCKED: lane.sh failed\n2026-11-26 08:00:00 #4: BLOCKED: lane.sh failed\n2026-11-26 08:10:00 #6: BLOCKED: lane.sh failed", ev, iss, now)
assert "lane.sh failed" not in f6["repeats"], f6["repeats"]
# act(): the FIRST sighting files (no silent baseline); search first: open -> comment, closed -> reopen + comment, none -> create; once per key per 6 h
calls, told = [], []
gh = lambda *a: calls.append(a[:2]) or (0, ""); tell = told.append
st = T.act(f, now, {}, gh, tell, existing={})
assert calls == [("issue", "create")] and told[0].startswith("TREND: new issue"), (calls, told)
st = T.act(f, now + 600, st, gh, tell, existing={T.TITLE + "runner error FileNotFoundError": (300, "OPEN")})
assert calls == [("issue", "create")], calls                        # same failure within 6 h: nothing more
st = T.act(f, now + 7 * 3600, st, gh, tell, existing={T.TITLE + "runner error FileNotFoundError": (300, "OPEN")})
assert calls[1:] == [("issue", "comment")], calls                   # still repeating 7 h later: a comment on the open issue, not a new one
calls.clear()
st = T.act(f, now, {}, gh, tell, existing={T.TITLE + "runner error FileNotFoundError": (158, "CLOSED")})
assert calls == [("issue", "reopen"), ("issue", "comment")], calls  # it was closed as fixed but came back
assert "#79" in T.body("runner error FileNotFoundError", [79, 72, 41])
more = lambda *ls: log + "".join("\n" + l for l in ls)
f3 = T.findings(more("2026-11-26 08:40:00 #22: BLOCKED: x", "2026-11-26 08:41:00 #22: BLOCKED: x", "2026-11-26 08:42:00 #22: BLOCKED: x"), ev, iss, now)
assert "x" not in f3["repeats"]                                     # one issue retried 3 times is not a pattern
# #302: the new runner reasons give stable keys
assert T.reason_key("merge step failed: no open PR for issue #12") == "merge step failed: no open PR for issue #n"
print("ok trends")
