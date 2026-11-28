# Tests for recover (#140), fake hc/gh/herdr: python tools/runner/test_recover.py
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
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

# #332: a live control session is matched by herdr name OR label name=<role> OR --remote-control oren-<role> in argv
live_unnamed = {"name": "", "state": "live", "status": "done", "address": "t:7", "labels": {"name": "inspector"}}
assert rc.control_role(live_unnamed) == "inspector"
assert rc.control_role({"name": "", "state": "live", "labels": ["herdr.space=c1", "name=inbox"]}) == "inbox"
assert rc.control_role({"name": None, "state": "live", "argv": ["claude", "--model", "opus", "--remote-control", "oren-inspector", "x"]}) == "inspector"
assert rc.control_role({"name": "", "state": "live", "command": "claude --remote-control oren-orchestrator --plugin-dir P"}) == "orchestrator"
assert rc.control_role({"name": "issue-5", "state": "live", "argv": ["claude", "-p", "x"]}) is None
assert rc.control_role({"name": "x", "state": "live", "labels": {"role": "intake"}}) is None
# the 16:23 case: old 'inspector' row finished, the real inspector live but unnamed -> nothing restarted
ts2 = [T("inspector", "finished", "t:4"), live_unnamed, T("orchestrator", "finished", "t:1"),
       {"name": "", "state": "live", "address": "t:8", "argv": ["claude", "--remote-control", "oren-orchestrator"]}]
assert rc.finished_control(ts2) == [], rc.finished_control(ts2)
assert rc.live_roles(ts2) == {"inspector", "orchestrator"}
# status 'done' (idle between turns) is never finished; only state finished/exited
idle = [{"name": "inspector", "state": "live", "status": "done", "address": "t:4"}, T("inbox", "idle", "t:3"), T("orchestrator", "exited", "t:1")]
assert rc.finished_control(idle) == [("orchestrator", "t:1")], rc.finished_control(idle)
assert rc.finished(idle) == ["t:1"]
# an unnamed finished control row (label only) with no live twin is restarted under its role
assert rc.finished_control([{"name": "", "state": "exited", "address": "t:9", "labels": ["name=inbox"]}]) == [("inbox", "t:9")]
# recover --open: an unnamed live inspector is not started again
d332 = {"spaces": lambda: {"oren": "c1", "oren-workers": "w1"}, "control_space": "oren", "worker_space": "oren-workers",
        "terminals": lambda: [live_unnamed, T("orchestrator", "live", "t:1"), T("inbox", "live", "t:2"), T("executor", "live", "t:5")], "start": lambda n, s: started.append(n) or 0}
started = []; rc.start_tabs(d332, [])
assert started == [], started

# exact commands (owner, #140 comments)
cwd, a = rc.control_argv("inbox", "C:/work/Oren_study/a", "P")
assert cwd == "C:/work/Oren_study/a" and a[:5] == ["claude", "--model", "sonnet", "--remote-control", "oren-inbox"] and "INBOX" in a[5]
cwd, a = rc.control_argv("inspector", "C:/work/Oren_study/a", "P")
assert Path(cwd) == Path("C:/work/Oren_study") and a[:5] == ["claude", "--model", "opus", "--remote-control", "oren-inspector"] and "INSPECTOR_HANDOFF.md" in a[5]
cwd, a = rc.control_argv("orchestrator", "C:/work/Oren_study/a", "P")
assert a[:7] == ["claude", "--model", "sonnet", "--remote-control", "oren-orchestrator", "--plugin-dir", "P"]
cwd, a = rc.control_argv("executor", "C:/work/Oren_study/a", "P")
assert cwd == "C:/work/Oren_study/a" and a[:5] == ["claude", "--model", "sonnet", "--remote-control", "oren-executor"] and "EXECUTOR.md" in a[5] and "executor" in rc.CONTROL
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
                terminals=lambda: state["terms"], rm=rm, spaces=lambda: {"oren": "c1", "oren-workers": "w1"} if sp is None else sp,
                control_space="oren", worker_space="oren-workers", start=start, issues=lambda: issues,
                where=lambda n: "remote" if n == 6 else "local", lock_held=lambda n: (Path(d) / f"issue-{n}.lock").exists(),
                reset_merge=lambda n: (log["reset"].append(n), "merge reset" if n == 5 else "")[1], relabel=relabel,
                unfreeze=unfreeze, comment=log["comment"].append, tell=log["tell"].append)
    return deps, log

# after a restart: Herdr started, finished terminals removed, the 3 control windows in 'oren' in order, dead issues relabelled,
# frozen removed before, watchdog last, one comment + one line to the orchestrator
with tempfile.TemporaryDirectory() as d:
    (Path(d) / "frozen").write_text("x"); (Path(d) / "freeze.json").write_text("{}")
    (Path(d) / "issue-5.lock").write_text("999\nworker\n1")             # dead pid from before the restart
    terms = [T("orchestrator", "finished", "t:1"), T("issue-5", "finished", "t:2"), T("run-6", "finished", "t:3")]
    deps, log = mk(d, terms, [I(5, ["in-progress"]), I(6, ["in-progress"]), I(7, ["ready-for-agent"])], herdr=False)
    r = rc.recover(deps)
    assert log["order"][0] == "herdr"
    assert log["rm"] == ["t:1", "t:2", "t:3"]
    assert log["start"] == [("orchestrator", "c1"), ("inbox", "c1"), ("inspector", "c1"), ("executor", "c1"), ("watchdog", "")], log["start"]
    assert r["restarted"] == [5] and log["relabel"] == [5] and log["reset"] == [5]   # #6 is remote: its cloud session runs on, never reset
    o = log["order"]; assert o.index("unfreeze") < o.index("relabel 5") and o[-1] == "start watchdog", o
    assert not (Path(d) / "frozen").exists() and (Path(d) / "freeze.recovered.json").exists()
    assert len(log["comment"]) == 1 and len(log["tell"]) == 1
    c = log["comment"][0]
    assert "#5 (local)" in c and "merge reset" in c and "#6 (remote): left alone" in c and "1 stale lock" in c and "removed 3 finished" in c, c

# everything already running: nothing started twice, live runner untouched
with tempfile.TemporaryDirectory() as d:
    terms = [T(n, "live", f"t:{k}") for k, n in enumerate(["orchestrator", "inbox", "inspector", "executor", "watchdog", "run-5"])]
    deps, log = mk(d, terms, [I(5, ["in-progress"])])
    r = rc.recover(deps)
    assert log["start"] == [] and log["rm"] == [] and r["restarted"] == [] and "nothing to do" in log["comment"][0]

# a missing space is reported; GitHub down: no issue reset, still frozen, no comment, the orchestrator is told
with tempfile.TemporaryDirectory() as d:
    (Path(d) / "frozen").write_text("x")
    deps, log = mk(d, [], None, sp={"oren-workers": "w1"})
    rc.recover(deps)
    assert log["start"][0] == ("orchestrator", "") and (Path(d) / "frozen").exists() and log["comment"] == [] and log["relabel"] == []
    assert "not reachable" in log["tell"][0] and "'oren' not found" in log["tell"][0]

# --install: at-logon task for this user, 1 min delay, runs recover.cmd
c = rc.install_cmd(r"C:\work\a\tools\recover.cmd", r"PC\owner")
assert c[:2] == ["schtasks", "/Create"] and c[c.index("/SC") + 1] == "ONLOGON" and c[c.index("/TN") + 1] == "Oren recover"
assert c[c.index("/RU") + 1] == r"PC\owner" and c[c.index("/TR") + 1] == r'"C:\work\a\tools\recover.cmd"' and "/DELAY" in c

# #25: the space names the owner asked for (26 Nov): ONE space 'oren' (orchestrator, inbox, inspector, executor), workers in 'oren-workers'
import tomllib
cfg = tomllib.loads((Path(__file__).resolve().parent / "config.toml").read_text(encoding="utf-8"))
assert cfg["control_space"] == "oren" and cfg["herdr_space"] == "oren-workers", cfg

# #25: tools/orchestrator.cmd (double-click) = open_oren: Herdr up, the 4 tabs of 'oren' in order, watchdog with no tab (no space),
# nothing else (no issue resets, no terminals removed); a second double-click starts nothing twice
def mk_open(terms, herdr=True, sp=None):
    log = {"start": [], "order": []}
    def start(name, sid): log["start"].append((name, sid)); return 0
    deps = dict(herdr_up=lambda: herdr, start_herdr=lambda: log["order"].append("herdr"), terminals=lambda: terms,
                spaces=lambda: {"oren": "c1", "oren-workers": "w1"} if sp is None else sp,
                control_space="oren", worker_space="oren-workers", start=start)
    return deps, log
deps, log = mk_open([], herdr=False)
lines = rc.open_oren(deps)
assert log["order"] == ["herdr"]
assert log["start"] == [("orchestrator", "c1"), ("inbox", "c1"), ("inspector", "c1"), ("executor", "c1"), ("watchdog", "")], log["start"]
assert "started orchestrator" in lines and "started watchdog" in lines, lines
deps, log = mk_open([T(n, "live", f"t:{k}") for k, n in enumerate(["orchestrator", "inbox", "inspector", "executor", "watchdog"])])
assert rc.open_oren(deps) == [] and log["start"] == []
deps, log = mk_open([T("orchestrator", "live", "t:1")], sp={})      # spaces not made in Herdr yet: said plainly, windows still start
lines = rc.open_oren(deps)
assert [s for s, _ in log["start"]] == ["inbox", "inspector", "executor", "watchdog"]
assert any("'oren' not found" in l for l in lines) and any("'oren-workers' not found" in l for l in lines), lines

# #331: a control role is present when ANY live terminal matches it by name, by '--remote-control oren-<role>' in its foreground argv,
# or by its tab ('where' ending in '/ <role>'); a hand-started inspector (name null) is never started twice
by_argv = {"name": None, "state": "live", "address": "t:9", "foreground": {"argv": ["claude", "--model", "opus", "--remote-control", "oren-inspector", "x"]}}
by_argv2 = {"name": None, "state": "live", "address": "t:8", "argv": ["claude", "--remote-control", "oren-inbox"]}
by_tab = {"name": None, "state": "live", "address": "t:7", "where": "Oren control / orchestrator"}
assert rc.control_role(by_argv) == "inspector" and rc.control_role(by_argv2) == "inbox" and rc.control_role(by_tab) == "orchestrator"
assert rc.control_role(T("inbox", "live", "t:1")) == "inbox" and rc.control_role({"name": None, "where": "Oren workers / issue-5"}) is None
assert rc.live_roles([by_argv, dict(by_tab, state="finished")]) == {"inspector"}
deps, log = mk_open([by_argv, by_argv2, by_tab, T("executor", "live", "t:9"), T("watchdog", "live", "t:1")])
assert rc.open_oren(deps) == [] and log["start"] == [], log
with tempfile.TemporaryDirectory() as d:
    deps, log = mk(d, [by_argv, by_tab, T("inbox", "live", "t:2"), T("executor", "live", "t:4"), T("watchdog", "live", "t:3")], [])
    rc.recover(deps)
    assert log["start"] == [], log["start"]
# the watchdog's restart check: a finished 'inspector' with a live hand-started twin (name null) is left alone
assert rc.finished_control([T("inspector", "finished", "t:4"), by_argv]) == []

# #331: spaces 'oren' / 'oren-workers' not made yet -> the old 'Oren control' / 'Oren workers' spaces are used, never new ones
old = {"Oren control": "c0", "Oren workers": "w0"}
assert rc.pick_space(old, "oren") == "c0" and rc.pick_space(old, "oren-workers") == "w0"
assert rc.pick_space({"oren": "c1", **old}, "oren") == "c1" and rc.pick_space({}, "oren") == ""
deps, log = mk_open([], sp=old)
lines = rc.open_oren(deps)
assert log["start"][:3] == [("orchestrator", "c0"), ("inbox", "c0"), ("inspector", "c0")], log["start"]
assert not any("not found" in l for l in lines), lines

cmd = (Path(__file__).resolve().parents[1] / "orchestrator.cmd").read_text(encoding="utf-8")
assert "recover.py\" --open" in cmd and "attach orchestrator" in cmd, cmd
assert "--name watchdog" not in cmd and "--name orchestrator" not in cmd   # started by open_oren (one place), not twice

# watchdog: a finished control window is removed by address and started again
sys.argv.append("--dry-run")
import watchdog as W
calls = []
W.R.hc = lambda *a, **k: (calls.append(a), (0, ""))[1]
W.log = lambda m: None; W.tell = lambda t: calls.append(("tell", t))
rc.start_control = lambda R, name, sid=None: (calls.append(("start", name)), 0)[1]
W.check_control([T("inbox", "finished", "t:9"), T("orchestrator", "live", "t:1")])
assert calls[0] == ("rm", "t:9") and calls[1] == ("start", "inbox"), calls
calls.clear()   # #332: finished 'inspector' row + live unnamed inspector (label name=inspector, status done) -> no rm, no restart
W.check_control([T("inspector", "finished", "t:4"), {"name": "", "state": "live", "status": "done", "address": "t:7", "labels": {"name": "inspector"}}])
assert calls == [], calls
print("ok")
