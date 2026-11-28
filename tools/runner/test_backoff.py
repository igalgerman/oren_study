"""#842: backoff helper, fake clock. Run: python3 tools/runner/test_backoff.py"""
import os, tempfile; os.environ["OREN_TEST"] = "1"; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
import sys; sys.argv.append("--dry-run"); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import backoff as B
from pathlib import Path
P = Path(tempfile.mkdtemp()) / "backoff.json"
alerts = []; a = alerts.append
t = 10_000.0
assert B.due("ai", t, P)
waits = []
for _ in range(3):                                   # 3 failures -> waits of 2/4/8 min
    B.failed("ai", t, a, P)
    waits.append((B.load(P)["ai"]["next"] - t) / 60)
    assert not B.due("ai", t + waits[-1] * 60 - 1, P) and B.due("ai", t + waits[-1] * 60, P)
    t += waits[-1] * 60
assert waits == [2, 4, 8], waits
assert len(alerts) == 1 and "ai started failing" in alerts[0], alerts      # exactly one alert
assert B.load(P)["ai"]["next"] and B.lines(t - 1, P) and B.lines(t - 1, P)[0].startswith("backoff: ai next try ")
for _ in range(6): B.failed("ai", t, a, P)
assert B.delay_min(20) == 60 and (B.load(P)["ai"]["next"] - t) / 60 == 60       # capped at 60
assert len(alerts) == 1
assert B.load(P)["ai"]["fails"] == 9 and B.load(P) == B.load(P)                  # state is on disk (survives a restart)
B.ok("ai", t, a, P)                                  # success resets, one recovery alert
assert B.due("ai", t, P) and B.lines(t, P) == [] and len(alerts) == 2 and "recovered" in alerts[1]
B.ok("ai", t, a, P); assert len(alerts) == 2          # a success with no failure: quiet
B.failed("ai", t, a, P); assert (B.load(P)["ai"]["next"] - t) / 60 == 2           # starts again at 2
print("test_backoff: ok")

# wiring: the dashboard prints the line while a job backs off
import dashboard as D
B.failed("ai"); assert any(l.startswith("backoff: ai next try ") for l in B.lines()); B.ok("ai")
assert B.lines() == []
