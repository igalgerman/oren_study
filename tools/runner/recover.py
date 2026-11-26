"""Recover (#140): `tools/recover.cmd` runs at Windows logon (Task Scheduler task, installed once by `tools/recover.cmd --install`).
It brings the flow back after a restart, planned (freeze, #139) or a crash:
  1. clears stale .runs/*.lock files (dead pid, or taken before this boot)
  2. starts the Herdr space, the orchestrator window (the inbox, if needed, is the intake window the watchdog opens itself)
  3. finds what was running: .runs/freeze.json if present, else open issues with `in-progress` / an open lane/<n> PR / a lane/<n> branch
  4. removes .runs/frozen, resumes each issue ONCE as run-<n> (skipped: lock held, run-<n> live, blocked/manual/ready-for-human, remote lane)
  5. starts the watchdog, tells the orchestrator what resumed; freeze.json is kept as freeze.recovered.json
Usage: python recover.py [--install]"""
import json, os, re, sys, time
from pathlib import Path

SKIP_LABELS = {"blocked", "manual", "ready-for-human"}
TASK = "Oren recover"

# ---------- pure logic (test_recover.py) ----------
def stale_locks(runs, alive, boot):
    """Remove lock files whose pid is dead or that were taken before this boot (a reused pid is not ours). -> removed names."""
    gone = []
    for p in sorted(Path(runs).glob("*.lock")):
        try:
            parts = p.read_text(encoding="utf-8").split("\n")
            pid = int(parts[0].strip())
        except (OSError, ValueError):
            pid = None
        try: since = float(parts[2])
        except (NameError, IndexError, ValueError):
            try: since = p.stat().st_mtime
            except OSError: since = 0
        if pid is None or since < boot or not alive(pid):
            p.unlink(missing_ok=True); gone.append(p.name)
    return gone

def candidates(freeze_data, issues, prs, branches):
    """Issue numbers that were running: freeze.json keys if present, else in-progress label / open lane/<n> PR / lane/<n> branch."""
    if freeze_data is not None: return sorted(int(k) for k in freeze_data)
    lane = lambda ref: int(m[1]) if (m := re.fullmatch(r"(?:refs/heads/)?lane/(\d+)", ref or "")) else None
    found = {i["number"] for i in issues if "in-progress" in i["labels"]}
    found |= {n for n in (lane(p.get("headRefName")) for p in prs) if n}
    found |= {n for n in map(lane, branches) if n}
    return sorted(found)

def plan(nums, issues, remote, freeze_data=None):
    """-> (resume, skipped{n: why}). Only open issues; never a parked/manual one; never a remote lane (it keeps running in the cloud)."""
    by = {i["number"]: i for i in issues}
    go, skip = [], {}
    for n in nums:
        i = by.get(n)
        if not i: skip[n] = "closed"; continue
        bad = SKIP_LABELS & set(i["labels"])
        if bad: skip[n] = "label " + ", ".join(sorted(bad)); continue
        if remote(n) or (freeze_data or {}).get(str(n), {}).get("remote"): skip[n] = "remote lane"; continue
        go.append(n)
    return go, skip

def recover(runs, alive, boot, live, start, github, remote, resume, claim, unfreeze, tell, cleared=()):
    """One recovery. live(name) -> bool; start(name) starts herdr_space/orchestrator/watchdog; github() -> (issues, prs, branches) or None;
    resume(n) -> rc (starts run-<n>); claim(n) sets in-progress. -> {"resumed", "skipped", "message"}"""
    runs = Path(runs)
    locks = list(cleared) + stale_locks(runs, alive, boot)
    for name in ("herdr_space", "orchestrator"):
        if not live(name): start(name)
    fz = runs / "freeze.json"
    try: data = json.loads(fz.read_text(encoding="utf-8")) if fz.exists() else None
    except ValueError: data = {}
    gh = github()
    if gh is None:
        msg = "RECOVER: GitHub not reachable; nothing resumed (still frozen if it was). Run tools/recover.cmd again."
        tell(msg); return {"resumed": [], "skipped": {}, "message": msg}
    issues, prs, branches = gh
    go, skip = plan(candidates(data, issues, prs, branches), issues, remote, data)
    unfreeze()                                    # before resuming: a run started while frozen exits at once
    done = []
    for n in go:
        if live(f"run-{n}") or (runs / f"issue-{n}.lock").exists(): skip[n] = "already running"; continue   # once, no duplicates
        claim(n)                                  # in-progress first: the next runner pass neither picks it again nor calls it stuck
        if resume(n): skip[n] = "could not start run"
        else: done.append(n)
    if data is not None: fz.replace(runs / "freeze.recovered.json")
    if not live("watchdog"): start("watchdog")
    src = "freeze.json" if data is not None else "labels/PRs/branches (no freeze.json: crash)"
    msg = (f"RECOVER ({src}): resumed " + (", ".join(f"#{n}" for n in done) or "nothing")
           + ("; skipped " + ", ".join(f"#{n} ({w})" for n, w in sorted(skip.items())) if skip else "")
           + (f"; cleared {len(locks)} stale lock(s)" if locks else "") + ".")
    tell(msg)
    return {"resumed": done, "skipped": skip, "message": msg}

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

def main():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import runner as R
    if "--install" in sys.argv:
        user = (os.environ.get("USERDOMAIN", "") + "\\" if os.environ.get("USERDOMAIN") else "") + os.environ.get("USERNAME", "")
        rc, out = R.run(install_cmd(str(R.ROOT / "tools" / "recover.cmd"), user), timeout=60)
        print(out.strip())
        print(f"installed: '{TASK}' runs tools\\recover.cmd at logon" if rc == 0 else "install failed: run tools\\recover.cmd --install once as administrator")
        return rc
    py, root = sys.executable, str(R.ROOT)
    def term(name): return R.hc_json("get", name, "--json")
    def live(name):
        if name == "herdr_space": R._SPACE = None; return bool(R.space_args())
        return term(name).get("state") == "live"
    def start(name):
        if name == "herdr_space":
            import subprocess
            try: subprocess.Popen([R.HERDR_APP])
            except OSError as e: print("cannot start Herdr:", e); return
            for _ in range(18):                   # up to 90 s for the app and its space
                time.sleep(5); R._SPACE = None
                if R.space_args(): return
            return
        args = {"orchestrator": ["--no-parent", "claude", "--remote-control", "oren-orchestrator", "--plugin-dir", str(R.ROOT / "tools" / "mods" / "oren-lanes"),
                                 "Read ORCHESTRATOR.md and continue as the orchestrator. Open the Oren lanes panel (/lanes)."],
                "watchdog": ["--no-parent", py, str(R.HERE / "watchdog.py")]}[name]
        R.hc("rm", name, timeout=30)              # a dead terminal of that name would make `run` fail (name taken)
        print(name, R.hc("run", "--bg", "--outlive-parent", "--name", name, "--cwd", root, *args, timeout=60)[1].strip())
    def github():
        for k in range(10):                       # at logon the network may come up late
            rc1, o1 = R.gh("issue", "list", "--state", "open", "--limit", "200", "--json", "number,labels")
            rc2, o2 = R.gh("pr", "list", "--state", "open", "--limit", "100", "--json", "number,headRefName")
            rc3, o3 = R.run(["git", "ls-remote", "--heads", R.REMOTE, "lane/*"], cwd=R.ROOT, timeout=60)
            if not (rc1 or rc2 or rc3):
                try:
                    issues = [{**i, "labels": [l["name"] for l in i["labels"]]} for i in json.loads(o1)]
                    return issues, json.loads(o2), [l.split()[-1] for l in o3.splitlines() if l.strip()]
                except (ValueError, KeyError, IndexError): pass
            if k < 9: time.sleep(30)
        return None
    def remote(n):
        try: return json.loads((R.RUNS / str(n) / "remote.json").read_text(encoding="utf-8")).get("session", "")
        except Exception: return ""
    def resume(n):
        name = f"run-{n}"
        orch = term("orchestrator").get("address", "")
        R.hc("rm", name, timeout=30)
        rc, out = R.hc("run", "--bg", "--outlive-parent", "--name", name, "--cwd", root, "--label", "role=runner",
                       *(["--parent", orch] if orch else ["--no-parent"]), py, str(R.HERE / "runner.py"), str(n), f"--term={name}", timeout=60)
        return rc
    def claim(n):
        R.set_labels(n, add=["in-progress"])
        R.gh("issue", "comment", str(n), "--body", "Recover: resumed after a PC restart (run.cmd " + str(n) + ").")
    def tell(t):
        print(t)
        if live("orchestrator"): R.hc("send", "orchestrator", t, timeout=30)
    import freeze
    R.RUNS.mkdir(parents=True, exist_ok=True)
    cleared = stale_locks(R.RUNS, R.pid_alive, boot_time())     # first, so a recover.lock left by a crash does not block us
    try:
        with R.FileLock("recover"):
            recover(R.RUNS, R.pid_alive, boot_time(), live, start, github, remote, resume, claim, lambda: freeze.unfreeze(R.RUNS), tell, cleared)
    except R.Blocked:
        print("recover is already running"); return 0
    return 0

if __name__ == "__main__":
    sys.exit(main())
