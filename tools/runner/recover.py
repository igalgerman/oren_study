"""Recover (#140): `tools/recover.cmd` runs at Windows logon (Task Scheduler task, installed once by `tools/recover.cmd --install`).
The WHOLE recovery after a restart (planned freeze #139, or a crash), in order:
  1. clears stale .runs/*.lock files (dead pid, or taken before this boot), starts Herdr if it is not running
  2. removes finished terminals left by the restart (by address, never by name)
  3. layout: space 'oren' (control_space) holds the tabs orchestrator, inbox, inspector; worker windows go to herdr_space ('oren-workers')
  4. starts orchestrator, inbox, inspector when missing (same commands as the watchdog's restart check, CONTROL below)
  5. every open in-progress issue (local or cloud) whose runner is dead: a half-done merge in its worktree is reset to the pushed branch,
     in-progress is removed (ready-for-agent kept/added) so the runner restarts it; .runs/frozen is removed first
  6. starts the watchdog when missing (it starts the runner passes), then reports in ONE issue comment (recover_issue) and to the orchestrator
Usage: python recover.py [--install | --open]   (--open = tools/orchestrator.cmd, #25: steps 1-4 + watchdog only)"""
import json, os, shutil, sys, time
from pathlib import Path

TASK = "Oren recover"
CONTROL = ("orchestrator", "inbox", "inspector")    # the 3 Claude sessions on the PC, tabs of 'oren' in this order
INBOX_PROMPT = ("You are the INBOX of the Oren game multi-agent system (repo igalgerman/oren_study). Read CLAUDE.md and FLOW.md. "
                "The owner talks to you: a new idea -> /idea, a clear task -> /task, a bug -> /bug, a status question -> /status. "
                "Write every new issue the way docs/agents/skills/writing-for-agents.md says. Propose each new issue's model label (docs/agents/models.md). Do nothing else; wait for the owner.")
ORCH_PROMPT = "Read ORCHESTRATOR.md and continue as the orchestrator. Open the Oren lanes panel (/lanes)."
INSPECTOR_PROMPT = "You are the INSPECTOR of the Oren game multi-agent system. Read C:/work/Oren_study/INSPECTOR_HANDOFF.md first and follow it."

# ---------- pure logic (test_recover.py) ----------
def control_argv(name, main_checkout, plugin_dir, claude="claude", python="python", watchdog=""):
    """-> (cwd, argv) of the program for orchestrator / inbox / inspector / watchdog."""
    mc = str(main_checkout)
    return {"orchestrator": (mc, [claude, "--remote-control", "oren-orchestrator", "--plugin-dir", str(plugin_dir), ORCH_PROMPT]),
            "inbox": (mc, [claude, "--model", "sonnet", "--remote-control", "oren-inbox", INBOX_PROMPT]),
            "inspector": (str(Path(mc).parent), [claude, "--model", "opus", "--remote-control", "oren-inspector", INSPECTOR_PROMPT]),
            "watchdog": (mc, [python, str(watchdog)])}[name]

def hc_run_args(name, cwd, argv, space_id=""):
    return ["run", "--bg", "--no-parent", "--outlive-parent", "--name", name, "--cwd", cwd,
            *(["--label", f"herdr.space={space_id}"] if space_id else []), *argv]

SPACE_FALLBACK = {"oren": "Oren control", "oren-workers": "Oren workers"}   # #331: until the owner renames the spaces

def pick_space(sp, want):
    """Id of space `want` in {name: id}, else of its old name (SPACE_FALLBACK); never creates one. -> id or ''."""
    return sp.get(want) or sp.get(SPACE_FALLBACK.get(want, ""), "") or ""

def _argv(t):
    fg = t.get("foreground") if isinstance(t.get("foreground"), dict) else {}
    a = fg.get("argv") or t.get("foreground_argv") or t.get("argv") or []
    return a.split() if isinstance(a, str) else [str(x) for x in a]

def control_role(t):
    """#331: the control role (orchestrator/inbox/inspector) a terminal is, matched by name, by '--remote-control oren-<role>' in its
    foreground argv, or by its tab ('where' ending in '/ <role>'). A hand-started session has no name. -> role or None"""
    if t.get("name") in CONTROL: return t["name"]
    a = _argv(t)
    for i, x in enumerate(a[:-1]):
        if x == "--remote-control" and a[i + 1].startswith("oren-") and a[i + 1][5:] in CONTROL: return a[i + 1][5:]
    tab = str(t.get("where") or "").rsplit("/", 1)
    if len(tab) == 2 and tab[1].strip() in CONTROL: return tab[1].strip()
    return None

def live_roles(ts):
    """Control roles that have at least one live terminal."""
    return {r for t in ts if t.get("state") == "live" and (r := control_role(t))}

def finished(ts):
    """Addresses of terminals whose program ended (a restart leaves them as 'finished')."""
    return [t["address"] for t in ts if t.get("state") != "live" and t.get("address")]

def finished_control(ts):
    """Watchdog check: control windows (CONTROL + watchdog is not here: it is the one checking) that are finished and have no live twin.
    -> [(name, address)]"""
    live = live_roles(ts)
    return [(t["name"], t["address"]) for t in ts
            if t.get("name") in CONTROL and t.get("state") != "live" and t.get("address") and t["name"] not in live]

def stale_locks(runs, alive, boot):
    """Remove lock files whose pid is dead or that were taken before this boot (a reused pid is not ours). -> removed names."""
    gone = []
    for p in sorted(Path(runs).glob("*.lock")):
        pid, since = None, 0
        try:
            parts = p.read_text(encoding="utf-8").split("\n")
            pid = int(parts[0].strip())
            since = float(parts[2]) if len(parts) > 2 else p.stat().st_mtime
        except (OSError, ValueError):
            pass
        if pid is None or since < boot or not alive(pid):
            p.unlink(missing_ok=True); gone.append(p.name)
    return gone

def dead_runs(issues, live_names, lock_held):
    """Open in-progress issues (not manual hand work) whose runner is gone: no live run-<n> window and no live issue-<n>.lock."""
    return sorted(i["number"] for i in issues if "in-progress" in i["labels"] and "manual" not in i["labels"]
                  and f"run-{i['number']}" not in live_names and not lock_held(i["number"]))

def start_tabs(d, lines):
    """The 3 tabs of the main space (control_space, 'oren'), in order, when missing. -> names of live terminals."""
    sp = d["spaces"]()
    ctl = pick_space(sp, d["control_space"])
    for s in (d["control_space"], d["worker_space"]):
        if not pick_space(sp, s): lines.append(f"space '{s}' not found in Herdr: its windows open in the default space")
    ts = d["terminals"]()
    live = {t.get("name") for t in ts if t.get("state") == "live"} | live_roles(ts)
    for name in CONTROL:
        if name in live: continue
        rc = d["start"](name, ctl)
        lines.append(f"started {name}" + (f" (FAILED, rc {rc})" if rc else ""))
    return live

def start_watchdog(d, live, lines):
    """The watchdog runs with no tab (no space label); it starts the runner passes, which have no tab either."""
    if "watchdog" in live: return
    rc = d["start"]("watchdog", "")
    lines.append("started watchdog" + (f" (FAILED, rc {rc})" if rc else ""))

def open_oren(d):
    """#25, tools/orchestrator.cmd (double-click): Herdr up, space 'oren' = tabs orchestrator, inbox, inspector; the watchdog with no tab.
    Only starts what is missing; touches no issue and no other terminal. d: herdr_up, start_herdr, terminals, spaces, control_space,
    worker_space, start(name, space_id). -> lines (what it did)"""
    lines = []
    if not d["herdr_up"]():
        d["start_herdr"](); lines.append("started Herdr")
    start_watchdog(d, start_tabs(d, lines), lines)
    return lines

def recover(d):
    """One recovery. d = dict of callables (fakes in tests):
    runs, alive(pid), boot, herdr_up() -> bool, start_herdr(), terminals() -> hc ls --all, rm(address), spaces() -> {name: id},
    control_space, worker_space, start(name, space_id) -> rc, issues() -> open issues or None, where(n), lock_held(n),
    reset_merge(n) -> note or "", relabel(n), unfreeze(), comment(text), tell(text).  -> {"lines": [...], "restarted": [...]}"""
    runs, lines = Path(d["runs"]), []
    locks = d.get("cleared", []) + stale_locks(runs, d["alive"], d["boot"])
    if locks: lines.append(f"cleared {len(locks)} stale lock(s): {', '.join(locks)}")
    if not d["herdr_up"]():
        d["start_herdr"](); lines.append("started Herdr")
    gone = finished(d["terminals"]())
    for a in gone: d["rm"](a)
    if gone: lines.append(f"removed {len(gone)} finished terminal(s)")
    live = start_tabs(d, lines)
    issues = d["issues"]()
    restarted = []
    if issues is None:
        lines.append("GitHub not reachable: no issue was reset (run tools/recover.cmd again)")
    else:
        d["unfreeze"]()                               # a runner started while frozen exits at once
        cloud = {i["number"] for i in issues if "cloud" in i["labels"]}
        for n in dead_runs(issues, live, d["lock_held"]):
            if n in cloud or d["where"](n) == "remote":     # the cloud session may still be running: a reset would start a duplicate worker
                lines.append(f"#{n} (remote): left alone, its cloud session runs on without this PC (check: python tools/runner/remote.py status {n})")
                continue
            note = d["reset_merge"](n)
            d["relabel"](n)
            restarted.append(n)
            lines.append(f"#{n} ({d['where'](n)}): runner was dead; in-progress removed so the runner restarts it" + (f"; {note}" if note else ""))
        fz = runs / "freeze.json"
        if fz.exists(): fz.replace(runs / "freeze.recovered.json"); lines.append("freeze.json used up (now freeze.recovered.json)")
    start_watchdog(d, live, lines)
    text = "RECOVER after a restart:\n" + "\n".join(f"- {l}" for l in lines or ["nothing to do: everything was running"])
    if issues is not None: d["comment"](text)
    d["tell"](text.replace("\n", " "))
    return {"lines": lines, "restarted": restarted}

def install_cmd(cmd_path, user):
    """schtasks line for the 'at logon' task (1 min delay so the network is up)."""
    return ["schtasks", "/Create", "/F", "/TN", TASK, "/SC", "ONLOGON", "/DELAY", "0001:00", "/RL", "LIMITED",
            "/RU", user, "/IT", "/TR", f'"{cmd_path}"']

# ---------- real wiring ----------
def boot_time():
    try:
        import ctypes
        ctypes.windll.kernel32.GetTickCount64.restype = ctypes.c_ulonglong
        return time.time() - ctypes.windll.kernel32.GetTickCount64() / 1000
    except Exception:
        return 0

def _R():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import runner as R
    return R

def control_space(R): return R.CFG.get("control_space", "oren")

def spaces(R):
    try: return {s.get("name"): s.get("id") for s in json.loads(R.run([R.HERDR_APP, "ls"], timeout=30)[1]).get("spaces", [])}
    except Exception: return {}

def start_control(R, name, space_id=None):
    """Start orchestrator / inbox / inspector (in 'oren') or the watchdog. Used by recover and by the watchdog's restart check."""
    if space_id is None: space_id = pick_space(spaces(R), control_space(R)) if name in CONTROL else ""
    mc = R.CFG.get("main_checkout", str(R.ROOT))
    cwd, argv = control_argv(name, mc, Path(mc) / "tools" / "mods" / "oren-lanes", shutil.which("claude") or "claude",
                             sys.executable, R.HERE / "watchdog.py")
    rc, out = R.hc(*hc_run_args(name, cwd, argv, space_id), timeout=60)
    print(name, out.strip()[:200])
    return rc

def main():
    R = _R()
    if "--install" in sys.argv:
        user = (os.environ.get("USERDOMAIN", "") + "\\" if os.environ.get("USERDOMAIN") else "") + os.environ.get("USERNAME", "")
        rc, out = R.run(install_cmd(str(R.ROOT / "tools" / "recover.cmd"), user), timeout=60)
        print(out.strip())
        print(f"installed: '{TASK}' runs tools\\recover.cmd at logon" if rc == 0 else "install failed: run tools\\recover.cmd --install once as administrator")
        return rc
    import freeze, subprocess
    def terminals(): return R.hc_json("ls", "--all", "--json").get("terminals", [])
    def herdr_up(): return R.hc("ls", "--json", timeout=30)[0] == 0 and bool(spaces(R))
    def start_herdr():
        try: subprocess.Popen([R.HERDR_APP])
        except OSError as e: print("cannot start Herdr:", e); return
        for _ in range(18):                           # up to 90 s for the app and its server
            time.sleep(5)
            if herdr_up(): return
    if "--open" in sys.argv:                          # #25: tools/orchestrator.cmd
        for l in open_oren(dict(herdr_up=herdr_up, start_herdr=start_herdr, terminals=terminals, spaces=lambda: spaces(R),
                                control_space=control_space(R), worker_space=R.CFG.get("herdr_space", "oren-workers"),
                                start=lambda name, sid: start_control(R, name, sid))) or ["everything was running"]:
            print(l)
        return 0
    def issues():
        for k in range(10):                           # at logon the network may come up late
            rc, out = R.gh("issue", "list", "--state", "open", "--limit", "200", "--json", "number,labels")
            if rc == 0:
                try: return [{**i, "labels": [l["name"] for l in i["labels"]]} for i in json.loads(out)]
                except (ValueError, KeyError): pass
            if k < 9: time.sleep(30)
        return None
    def reset_merge(n):
        wt = Path(R.CFG["worktree_prefix"] + str(n))
        if not wt.exists() or R.run(["git", "rev-parse", "-q", "--verify", "MERGE_HEAD"], cwd=wt)[0]: return ""
        R.run(["git", "merge", "--abort"], cwd=wt)
        R.run(["git", "fetch", "-q", R.REMOTE, f"lane/{n}"], cwd=wt)
        if R.run(["git", "rev-parse", "-q", "--verify", f"{R.REMOTE}/lane/{n}"], cwd=wt)[0] == 0:
            R.run(["git", "reset", "-q", "--hard", f"{R.REMOTE}/lane/{n}"], cwd=wt)
            return f"half-done merge in {wt.name} reset to the pushed lane/{n}"
        return f"half-done merge in {wt.name} aborted (lane/{n} was never pushed)"
    def comment(text): R.gh("issue", "comment", str(R.CFG.get("recover_issue", 138)), "--body", text)
    def tell(text):
        print(text)
        R.hc("send", "orchestrator", text, timeout=30)
    R.RUNS.mkdir(parents=True, exist_ok=True)
    cleared = stale_locks(R.RUNS, R.pid_alive, boot_time())     # first, so a recover.lock left by a crash does not block us
    try:
        with R.FileLock("recover"):
            recover(dict(runs=R.RUNS, alive=R.pid_alive, boot=boot_time(), cleared=cleared, herdr_up=herdr_up, start_herdr=start_herdr,
                         terminals=terminals, rm=lambda a: R.hc("rm", a, timeout=30), spaces=lambda: spaces(R),
                         control_space=control_space(R), worker_space=R.CFG.get("herdr_space", "oren-workers"),
                         start=lambda name, sid: start_control(R, name, sid), issues=issues, where=R.where_of,
                         lock_held=lambda n: R.FileLock(f"issue-{n}").held_by_other(), reset_merge=reset_merge,
                         relabel=lambda n: R.set_labels(n, add=["ready-for-agent"], remove=["in-progress"]),
                         unfreeze=lambda: freeze.unfreeze(R.RUNS), comment=comment, tell=tell))
    except R.Blocked:
        print("recover is already running")
    return 0

if __name__ == "__main__":
    sys.exit(main())
