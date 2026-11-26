# Tests for recover (#140), fake hc/gh/herdr: python tools/runner/test_recover.py
import json, os, sys, tempfile, time
from pathlib import Path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recover as rc

def I(n, labels=()): return {"number": n, "labels": list(labels)}
def T(name, state, addr): return {"name": name, "state": state, "address": addr}

# stale locks: dead pid, unreadable, or taken before this boot go; a live one taken after boot stays
with tempfile.TemporaryDirectory() as d:
    d = Path(d); now = time.time()
    (d / "issue-1.lock").write_text(f"111\nworker\n{now:.0f}")          # dead
    (d / "issue-2.lock").write_text(f"222\nworker\n{now:.0f}")          # alive, after boot
    (d / "issue-3.lock").write_text(f"222\nworker\n{now - 9999:.0f}")   # pid reused after reboot: taken before boot
    (d / "core-1.lock").write_text("garbage")
    assert rc.stale_locks(d, lambda p: p == 222, now - 100) == ["core-1.lock", "issue-1.lock", "issue-3.lock"]
    assert [p.name for p in d.glob("*.lock")] == ["issue-2.lock"]

# finished terminals by address; control windows finished with no live twin
ts = [T("orchestrator", "finished", "t:1"), T("inbox", "live", "t:2"), T("inbox", "finished", "t:3"), T("inspector", "finished", "t:4"),
      T("issue-5", "finished", "t:5"), T("watchdog", "live", "t:6"), {"name": "x", "state": "finished"}]
assert rc.finished(ts) == ["t:1", "t:3", "t:4", "t:5"]
assert rc.finished_control(ts) == [("orchestrator", "t:1"), ("inspector", "t:4")]

# exact commands (owner, #140 comments)
cwd, a = rc.control_argv("inbox", "C:/work/Oren_study/a", "P")
assert cwd == "C:/work/Oren_study/a" and a[:5] == ["claude", "--model", "sonnet", "--remote-control", "oren-inbox"] and "INBOX" in a[5]
cwd, a = rc.control_argv("inspector", "C:/work/Oren_study/a", "P")
assert Path(cwd) == Path("C:/work/Oren_study") and a[:5] == ["claude", "--model", "opus", "--remote-control", "oren-inspector"] and "INSPECTOR_HANDOFF.md" in a[5]
cwd, a = rc.control_argv("orchestrator", "C:/work/Oren_study/a", "P")
assert a[:5] == ["claude", "--remote-control", "oren-orchestrator", "--plugin-dir", "P"]
assert rc.control_argv("watchdog", "M", "P", python="py", watchdog="W")[1] == ["py", "W"]
h = rc.hc_run_args("inbox", "C:/m", ["claude"], "sp1")
assert h[:4] == ["run", "--bg", "--no-parent", "--outlive-parent"] and "herdr.space=sp1" in h and h[-1] == "claude"
assert "--label" not in rc.hc_run_args("watchdog", "C:/m", ["py"], "")

# dead runners: in-progress, no live run-<n>, no live lock; manual hand work never touched
iss = [I(5, ["in-progress"]), I(6, ["in-progress"]), I(7, ["in-progress"]), I(8, ["in-progress", "manual"]), I(9, ["ready-for-agent"])]
assert rc.dead_runs(iss, {"run-6"}, lambda n: n == 7) == [5]

def mk(d, terms, issues, herdr=True, sp=None):
    log = {"rm": [], "start": [], "relabel": [], "reset": [], "comment": [], "tell": [], "order": []}
    state = {"terms": list(terms)}
    def start(name, sid): log["start"].append((name, sid)); log["order"].append("start " + name); return 0
    def unfreeze(): (Path(d) / "frozen").unlink(missing_ok=True); log["order"].append("unfreeze")
    def relabel(n): log["relabel"].append(n); log["order"].append(f"relabel {n}")
    def rm(a): log["rm"].append(a); state["terms"] = [t for t in state["terms"] if t.get("address") != a]
    deps = dict(runs=Path(d), alive=lambda p: False, boot=0, herdr_up=lambda: herdr, start_herdr=lambda: log["order"].append("herdr"),
                terminals=lambda: state["terms"], rm=rm, spaces=lambda: {"Oren control": "c1", "Oren workers": "w1"} if sp is None else sp,
                control_space="Oren control", worker_space="Oren workers", start=start, issues=lambda: issues,
                where=lambda n: "remote" if n == 6 else "local", lock_held=lambda n: (Path(d) / f"issue-{n}.lock").exists(),
                reset_merge=lambda n: (log["reset"].append(n), "merge reset" if n == 5 else "")[1], relabel=relabel,
                unfreeze=unfreeze, comment=log["comment"].append, tell=log["tell"].append)
    return deps, log

# after a restart: Herdr started, finished terminals removed, the 3 control windows in 'Oren control' in order, dead issues relabelled,
# frozen removed before, watchdog last, one comment + one line to the orchestrator
with tempfile.TemporaryDirectory() as d:
    (Path(d) / "frozen").write_text("x"); (Path(d) / "freeze.json").write_text("{}")
    (Path(d) / "issue-5.lock").write_text("999\nworker\n1")             # dead pid from before the restart
    terms = [T("orchestrator", "finished", "t:1"), T("issue-5", "finished", "t:2"), T("run-6", "finished", "t:3")]
    deps, log = mk(d, terms, [I(5, ["in-progress"]), I(6, ["in-progress"]), I(7, ["ready-for-agent"])], herdr=False)
    r = rc.recover(deps)
    assert log["order"][0] == "herdr"
    assert log["rm"] == ["t:1", "t:2", "t:3"]
    assert log["start"] == [("orchestrator", "c1"), ("inbox", "c1"), ("inspector", "c1"), ("watchdog", "")], log["start"]
    assert r["restarted"] == [5] and log["relabel"] == [5] and log["reset"] == [5]   # #6 is remote: its cloud session runs on, never reset
    o = log["order"]; assert o.index("unfreeze") < o.index("relabel 5") and o[-1] == "start watchdog", o
    assert not (Path(d) / "frozen").exists() and (Path(d) / "freeze.recovered.json").exists()
    assert len(log["comment"]) == 1 and len(log["tell"]) == 1
    c = log["comment"][0]
    assert "#5 (local)" in c and "merge reset" in c and "#6 (remote): left alone" in c and "1 stale lock" in c and "removed 3 finished" in c, c

# everything already running: nothing started twice, live runner untouched
with tempfile.TemporaryDirectory() as d:
    terms = [T(n, "live", f"t:{k}") for k, n in enumerate(["orchestrator", "inbox", "inspector", "watchdog", "run-5"])]
    deps, log = mk(d, terms, [I(5, ["in-progress"])])
    r = rc.recover(deps)
    assert log["start"] == [] and log["rm"] == [] and r["restarted"] == [] and "nothing to do" in log["comment"][0]

# a missing space is reported; GitHub down: no issue reset, still frozen, no comment, the orchestrator is told
with tempfile.TemporaryDirectory() as d:
    (Path(d) / "frozen").write_text("x")
    deps, log = mk(d, [], None, sp={"Oren workers": "w1"})
    rc.recover(deps)
    assert log["start"][0] == ("orchestrator", "") and (Path(d) / "frozen").exists() and log["comment"] == [] and log["relabel"] == []
    assert "not reachable" in log["tell"][0] and "'Oren control' not found" in log["tell"][0]

# --install: at-logon task for this user, 1 min delay, runs recover.cmd
c = rc.install_cmd(r"C:\work\a\tools\recover.cmd", r"PC\owner")
assert c[:2] == ["schtasks", "/Create"] and c[c.index("/SC") + 1] == "ONLOGON" and c[c.index("/TN") + 1] == "Oren recover"
assert c[c.index("/RU") + 1] == r"PC\owner" and c[c.index("/TR") + 1] == r'"C:\work\a\tools\recover.cmd"' and "/DELAY" in c

# watchdog: a finished control window is removed by address and started again
sys.argv.append("--dry-run")
import watchdog as W
calls = []
W.R.hc = lambda *a, **k: (calls.append(a), (0, ""))[1]
W.log = lambda m: None; W.tell = lambda t: calls.append(("tell", t))
rc.start_control = lambda R, name, sid=None: (calls.append(("start", name)), 0)[1]
W.check_control([T("inbox", "finished", "t:9"), T("orchestrator", "live", "t:1")])
assert calls[0] == ("rm", "t:9") and calls[1] == ("start", "inbox"), calls
print("ok")
