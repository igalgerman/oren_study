# Tests for recover (#140), fake hc/gh: python tools/runner/test_recover.py
import json, os, tempfile, time
from pathlib import Path
import recover as rc

def I(n, labels=()): return {"number": n, "labels": list(labels)}

# stale locks: dead pid, unreadable, or taken before this boot go; a live one taken after boot stays
with tempfile.TemporaryDirectory() as d:
    d = Path(d); now = time.time()
    (d / "issue-1.lock").write_text(f"111\nworker\n{now:.0f}")          # dead
    (d / "issue-2.lock").write_text(f"222\nworker\n{now:.0f}")          # alive, after boot
    (d / "issue-3.lock").write_text(f"222\nworker\n{now - 9999:.0f}")   # pid reused after reboot: taken before boot
    (d / "core-1.lock").write_text("garbage")
    gone = rc.stale_locks(d, lambda p: p == 222, now - 100)
    assert gone == ["core-1.lock", "issue-1.lock", "issue-3.lock"], gone
    assert [p.name for p in d.glob("*.lock")] == ["issue-2.lock"]

# candidates: freeze.json wins; else labels + open lane PRs + lane branches
assert rc.candidates({"7": {}, "5": {}}, [I(9, ["in-progress"])], [], []) == [5, 7]
assert rc.candidates(None, [I(9, ["in-progress"]), I(4)], [{"headRefName": "lane/12"}, {"headRefName": "feature/x"}],
                     ["refs/heads/lane/4", "refs/heads/lane/9", "refs/heads/lane/code-mode-trial"]) == [4, 9, 12]

# plan: closed, parked/manual, remote lanes are skipped
go, skip = rc.plan([1, 2, 3, 4, 5, 6], [I(1), I(2, ["blocked", "ready-for-human"]), I(3, ["manual"]), I(4), I(5)],
                   lambda n: "sess" if n == 4 else "", {"5": {"remote": "s5"}})
assert go == [1] and skip == {2: "label blocked, ready-for-human", 3: "label manual", 4: "remote lane", 5: "remote lane", 6: "closed"}, skip

def mk(d, gh, live_names=(), resume_rc=0):
    log = {"started": [], "resumed": [], "claimed": [], "told": [], "order": []}
    alive = set(live_names)
    def start(name): log["started"].append(name); log["order"].append("start " + name); alive.add(name)
    def resume(n): log["resumed"].append(n); log["order"].append(f"resume {n}"); return resume_rc
    def claim(n): log["claimed"].append(n); log["order"].append(f"claim {n}")
    def unfreeze(): (Path(d) / "frozen").unlink(missing_ok=True); log["order"].append("unfreeze")
    deps = dict(runs=Path(d), alive=lambda p: False, boot=0, live=lambda n: n in alive, start=start, github=lambda: gh,
                remote=lambda n: "", resume=resume, claim=claim, unfreeze=unfreeze, tell=log["told"].append)
    return deps, log

ISSUES = [I(5, ["in-progress"]), I(6, ["in-progress"]), I(7), I(8, ["blocked"])]

# planned restart: from freeze.json, everything started, frozen removed before resuming, watchdog last, orchestrator told
with tempfile.TemporaryDirectory() as d:
    (Path(d) / "frozen").write_text("x")
    (Path(d) / "freeze.json").write_text(json.dumps({"5": {"state": "pushed"}, "7": {"state": "open"}, "8": {}}))
    (Path(d) / "issue-5.lock").write_text("999\nworker\n1")             # dead pid from before the restart
    deps, log = mk(d, (ISSUES, [], []))
    r = rc.recover(**deps)
    assert r["resumed"] == [5, 7] and r["skipped"] == {8: "label blocked"}, r
    assert log["started"] == ["herdr_space", "orchestrator", "watchdog"], log["started"]
    assert log["order"].index("unfreeze") < log["order"].index("resume 5") and log["order"][-1] == "start watchdog", log["order"]
    assert log["order"].index("claim 5") < log["order"].index("resume 5")
    assert not (Path(d) / "frozen").exists() and not (Path(d) / "freeze.json").exists() and (Path(d) / "freeze.recovered.json").exists()
    assert len(log["told"]) == 1 and "#5" in log["told"][0] and "#7" in log["told"][0] and "freeze.json" in log["told"][0], log["told"]
    assert "1 stale lock" in log["told"][0]

# crash: no freeze.json -> labels/PRs/branches; already running ones are not resumed twice; live windows not restarted
with tempfile.TemporaryDirectory() as d:
    (Path(d) / "issue-6.lock").write_text(f"{os.getpid()}\nworker\n{time.time():.0f}")
    deps, log = mk(d, (ISSUES, [{"headRefName": "lane/7"}], ["refs/heads/lane/8"]), live_names=("orchestrator", "herdr_space", "watchdog", "run-5"))
    deps["alive"] = lambda p: p == os.getpid()
    r = rc.recover(**deps)
    assert log["started"] == [] and r["resumed"] == [7], r
    assert r["skipped"] == {5: "already running", 6: "already running", 8: "label blocked"}, r
    assert log["claimed"] == [7] and "crash" in log["told"][0]

# running recover a second time resumes nothing again (the first run's run-<n> windows are live)
with tempfile.TemporaryDirectory() as d:
    (Path(d) / "freeze.json").write_text(json.dumps({"5": {}}))
    deps, log = mk(d, (ISSUES, [], []))
    rc.recover(**deps); assert log["resumed"] == [5]
    deps["live"] = lambda n: True
    r = rc.recover(**deps); assert log["resumed"] == [5] and r["resumed"] == [] and r["skipped"][5] == "already running", r

# GitHub not reachable: nothing resumed, still frozen, no watchdog, orchestrator told
with tempfile.TemporaryDirectory() as d:
    (Path(d) / "frozen").write_text("x"); (Path(d) / "freeze.json").write_text("{}")
    deps, log = mk(d, None)
    r = rc.recover(**deps)
    assert r["resumed"] == [] and (Path(d) / "frozen").exists() and (Path(d) / "freeze.json").exists()
    assert log["started"] == ["herdr_space", "orchestrator"] and "not reachable" in log["told"][0]

# a run that cannot start is reported, not counted
with tempfile.TemporaryDirectory() as d:
    (Path(d) / "freeze.json").write_text(json.dumps({"5": {}}))
    deps, log = mk(d, (ISSUES, [], []), resume_rc=1)
    r = rc.recover(**deps); assert r["resumed"] == [] and r["skipped"] == {5: "could not start run"}

# --install: at-logon task for this user, 1 min delay, runs recover.cmd
c = rc.install_cmd(r"C:\work\a\tools\recover.cmd", r"PC\owner")
assert c[:2] == ["schtasks", "/Create"] and c[c.index("/SC") + 1] == "ONLOGON" and c[c.index("/TN") + 1] == "Oren recover"
assert c[c.index("/RU") + 1] == r"PC\owner" and c[c.index("/TR") + 1] == r'"C:\work\a\tools\recover.cmd"' and "/DELAY" in c
print("ok")
