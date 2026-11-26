# Tests for freeze (#139): python tools/runner/test_freeze.py
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
import json, tempfile
from pathlib import Path
import freeze as f

# which windows are running work, and what step
ts = [{"name": "issue-5", "state": "live"}, {"name": "issue-6-fix", "state": "live"}, {"name": "review-7", "state": "live"},
      {"name": "issue-8-resolve1", "state": "live"}, {"name": "issue-9", "state": "exited"}, {"name": "watchdog", "state": "live"},
      {"name": "run-5", "state": "live"}]
assert f.running(ts) == {5: ("issue-5", "worker"), 6: ("issue-6-fix", "fix"), 7: ("review-7", "review"), 8: ("issue-8-resolve1", "resolve")}

# marker: only a real output line counts, not the echoed instruction
assert f.frozen_marker("> push and print FROZEN: N pushed\n", 5) == ""
assert f.frozen_marker("x\n● FROZEN: 5 pushed\n", 5) == "pushed"
assert f.frozen_marker("FROZEN: 6 pushed\n", 5) == ""

def mk(tmp, wins, screens, ticks=0):
    log = {"sent": [], "comments": []}
    t = [0]
    def sleep(s): t[0] += s
    deps = dict(runs=Path(tmp), windows=lambda: wins, send=lambda w, m: log["sent"].append(w),
                read=lambda w: screens(w, t[0]), pr=lambda n: 40 + n, comment=lambda n, b: log["comments"].append((n, b)),
                remote=lambda n: "", sleep=sleep, clock=lambda: t[0], timeout=600, poll=10)
    return deps, log

# all reach the safe point
with tempfile.TemporaryDirectory() as d:
    deps, log = mk(d, ts[:1], lambda w, t: "FROZEN: 5 pushed" if t >= 20 else "")
    r = f.freeze(**deps)
    assert (Path(d) / "frozen").exists()
    assert log["sent"] == ["issue-5"]
    data = json.loads((Path(d) / "freeze.json").read_text(encoding="utf-8"))
    assert data["5"] == {"step": "worker", "branch": "lane/5", "pr": 45, "window": "issue-5", "remote": "", "state": "pushed"}, data
    assert r["open"] == [] and "safe to restart" in r["message"]
    assert [n for n, _ in log["comments"]] == [5]

# one never answers: after the timeout it is parked with a note, and still listed as open
with tempfile.TemporaryDirectory() as d:
    deps, log = mk(d, ts[:3], lambda w, t: "FROZEN: 5 pushed" if w == "issue-5" else "")
    r = f.freeze(**deps)
    assert sorted(r["open"]) == [6, 7]
    assert "safe to restart" not in r["message"] and "#6" in r["message"] and "#7" in r["message"]
    data = json.loads((Path(d) / "freeze.json").read_text(encoding="utf-8"))
    assert data["6"]["state"] == "open"
    assert sorted(n for n, _ in log["comments"]) == [5, 6, 7]

# nothing running: still frozen, safe at once
with tempfile.TemporaryDirectory() as d:
    deps, log = mk(d, [], lambda w, t: "")
    r = f.freeze(**deps)
    assert (Path(d) / "frozen").exists() and "safe to restart" in r["message"]

# is_frozen / unfreeze
with tempfile.TemporaryDirectory() as d:
    assert not f.is_frozen(Path(d)); (Path(d) / "frozen").write_text("x")
    assert f.is_frozen(Path(d)); f.unfreeze(Path(d)); assert not f.is_frozen(Path(d))
print("ok")
