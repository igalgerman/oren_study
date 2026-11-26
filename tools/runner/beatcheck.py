"""#365: who watches the watchdog. A Windows scheduled task ('Oren beatcheck', every 5 min; recover.py installs it at logon) runs this.
watchdog.beat older than STALE_S (5 min) -> ONCE per stale beat: the hung watchdog line is stopped (its herdr terminal by address, then
its pid), ONE new watchdog is started (recover.start_control, never `recover --open`), and the orchestrator is told to push the owner
(orchestrator unreachable -> a comment on the owner questions issue). Nothing else is touched. Log: .runs/beatcheck.log
Usage: python beatcheck.py [--install]"""
import json, os, sys, time
from pathlib import Path

STALE_S = 300
TASK = "Oren beatcheck"

def decide(beat, now, st):
    """Pure: -> (actions, new state). One alarm + one restart per stale beat value; a fresh beat (or none yet) resets."""
    if beat is None or now - beat <= STALE_S: return [], {}
    if st.get("beat") == beat: return [], st
    return ["alarm", "restart"], {"beat": beat, "at": now}

def check(d):
    """d = callables (fakes in tests): beat() -> int|None, now(), state (dict, updated in place), terminals(), kill(addr), rm(addr),
    lock_pid() -> int|None, stop_pid(pid), start() -> rc, tell(text) -> rc, comment(text), log(msg)."""
    beat, now = d["beat"](), d["now"]()
    acts, st = decide(beat, now, d["state"])
    d["state"].clear(); d["state"].update(st)
    if not acts: return []
    mins = int((now - beat) / 60)
    for t in d["terminals"]():
        if t.get("name") == "watchdog" and t.get("address"):
            if t.get("state") == "live": d["kill"](t["address"])
            d["rm"](t["address"])
    pid = d["lock_pid"]()
    if pid: d["stop_pid"](pid)
    rc = d["start"]()
    what = f"watchdog.beat is {mins} min old (the watchdog loop hung); " + ("restarted it once" if rc == 0 else f"restart FAILED (rc {rc})")
    d["log"](what)
    text = (f"WATCHDOG STALE (#365, beatcheck): {what}. Send ONE PushNotification to the owner now: "
            f"'שומר המערכת (watchdog) נתקע {mins} דקות; " + ("הופעל מחדש.'" if rc == 0 else "ההפעלה מחדש נכשלה, צריך לבדוק.'")
            + " Then check that watchdog.beat moves again.")
    if d["tell"](text) != 0: d["comment"](f"ALARM (beatcheck #365): {what}. The orchestrator could not be told.")
    return acts

def install_cmd(python, script, user):
    """schtasks line: every 5 minutes, windowless python, this file."""
    return ["schtasks", "/Create", "/F", "/TN", TASK, "/SC", "MINUTE", "/MO", "5", "/RL", "LIMITED", "/RU", user, "/IT",
            "/TR", f'"{python}" "{script}"']

def pythonw():
    w = Path(sys.executable).with_name("pythonw.exe")
    return str(w if w.exists() else sys.executable)

def install(R):
    """Idempotent (/F). Windows only; returns rc."""
    if os.name != "nt": return 0
    user = (os.environ.get("USERDOMAIN", "") + "\\" if os.environ.get("USERDOMAIN") else "") + os.environ.get("USERNAME", "")
    return R.run(install_cmd(pythonw(), str(Path(__file__).resolve()), user), timeout=60)[0]

def stop_pid(R, pid):
    if not R.pid_alive(pid): return
    if os.name == "nt": R.run(["taskkill", "/F", "/T", "/PID", str(pid)], timeout=30)
    else:
        try: os.kill(int(pid), 15)
        except OSError: pass

def main():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import runner as R, recover
    if "--install" in sys.argv:
        rc = install(R); print(f"installed: '{TASK}' every 5 min" if rc == 0 else f"install failed (rc {rc})"); return rc
    sf, bf = R.RUNS / "beatcheck.json", R.RUNS / "watchdog.beat"
    try: state = json.loads(sf.read_text(encoding="utf-8"))
    except (OSError, ValueError): state = {}
    def beat():
        try: return int(bf.read_text(encoding="utf-8").strip())
        except (OSError, ValueError): return None
    def log(m):
        with open(R.RUNS / "beatcheck.log", "a", encoding="utf-8") as f: f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + m + "\n")
    with R.tick_mode():                               # bounded calls: a hung herdr/gh never holds this check either
        check(dict(beat=beat, now=time.time, state=state, terminals=lambda: R.hc_json("ls", "--all", "--json").get("terminals", []),
                   kill=lambda a: R.hc("kill", a, timeout=30), rm=lambda a: R.hc("rm", a, timeout=30),
                   lock_pid=lambda: (R.FileLock("watchdog").info() or (None,))[0], stop_pid=lambda p: stop_pid(R, p),
                   start=lambda: recover.start_control(R, "watchdog"), tell=lambda t: R.hc("send", "orchestrator", t, timeout=30)[0],
                   comment=lambda t: R.gh("issue", "comment", str(R.CFG.get("owner_questions_issue", 205)), "--body", t), log=log))
    try: sf.write_text(json.dumps(state), encoding="utf-8")
    except OSError: pass
    return 0

if __name__ == "__main__":
    sys.exit(main())
