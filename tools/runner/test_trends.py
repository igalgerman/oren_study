"""#155 trend watcher. Run: python3 tools/runner/test_trends.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
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
# act(): one new issue, then only comments; alarms at most once per ALARM_HOURS
calls, told = [], []
gh = lambda *a: calls.append(a[:2]); tell = told.append
st = T.act(f, now, {}, gh, tell, existing={})                      # first run: baseline only, plus the rate alarm
assert calls == [] and len(told) == 2 and told[0].startswith("TREND (baseline"), (calls, told)
st = T.act(f, now + 600, st, gh, tell, existing={})                 # nothing new
assert calls == [] and len(told) == 2
more = lambda *ls: log + "".join("\n" + l for l in ls)
f2 = T.findings(more("2026-11-26 08:30:00 #90: BLOCKED: lane.sh failed", "2026-11-26 08:31:00 #91: BLOCKED: lane.sh failed",
                     "2026-11-26 08:32:00 #92: BLOCKED: lane.sh failed"), ev, iss, now)
st = T.act(f2, now + 1200, st, gh, tell, existing={})               # a NEW pattern -> one issue
assert calls == [("issue", "create")] and told[-1].startswith("TREND: new issue"), (calls, told)
f3 = T.findings(more("2026-11-26 08:40:00 #22: BLOCKED: x", "2026-11-26 08:41:00 #22: BLOCKED: x", "2026-11-26 08:42:00 #22: BLOCKED: x"), ev, iss, now)
assert "x" not in f3["repeats"]                                     # one issue retried 3 times is not a pattern
print("ok trends")
