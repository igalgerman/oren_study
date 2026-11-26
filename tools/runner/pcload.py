"""PC load watch (#293): the watchdog checks the PC itself, so the owner never has to notice a slow PC first.
Every EVERY_S (2 min), from the watchdog tick: CPU %, free RAM %, and how many chrome-headless-shell / node / claude / python / gh / conhost
processes run (psutil when installed, else ONE powershell call with Get-CimInstance Win32_Process; no console window).
Alarm causes: CPU > 85% for 4 min, free RAM < 15%, chrome-headless-shell > 5, claude > live control sessions + 2.
An alarm names the top 3 processes by RAM and their owner (parent pids walked up to a herdr terminal or the Claude session that started
them), goes to the orchestrator AND the inspector (hc send), once per 30 min per cause, plus a watchdog.log line.
.runs/pc.json {text 'PC: CPU x% · RAM y% free', alarm, causes, at} feeds the panel and the dashboard (red when alarmed).
While alarmed the runner starts no new LOCAL work and a cloud start that failed with no output sets no cloud pause (pc_not_cloud).
It never kills anything (owner rule): it only reports."""
import json, os, re, subprocess, time
from pathlib import Path

HERE = Path(__file__).parent
RUNS = Path(os.environ.get("RUNNER_RUNS") or HERE / ".runs")   # same as runner.RUNS (no runner import: the runner imports this file)
EVERY_S, CPU_MAX, CPU_FOR_S, RAM_MIN, CHROME_MAX, CLAUDE_EXTRA = 120, 85, 240, 15, 5, 2
ALARM_EVERY_S = 1800      # once per 30 min per cause
FRESH_S = 600             # pc.json older than this (watchdog not running) counts as not alarmed
WATCH = ("chrome-headless-shell", "node", "claude", "python", "gh", "conhost")
CONTROL = ("orchestrator", "inbox", "inspector")   # recover.CONTROL: the Claude sessions that always run on the PC

def kind(name):
    """'Python3.12.exe' -> 'python'; a name we do not count -> None."""
    n = re.sub(r"\.exe$", "", (name or "").lower())
    if n.startswith("python"): return "python"
    return n if n in WATCH else None

def counts(procs):
    c = dict.fromkeys(WATCH, 0)
    for p in procs:
        k = kind(p.get("name"))
        if k: c[k] += 1
    return c

def term_pids(ts):
    """hc ls terminals -> {pid: 'name (address)'} for the ones that report a pid."""
    out = {}
    for t in ts or []:
        pid = t.get("pid") or t.get("pane_pid") or t.get("shell_pid")
        if pid: out[int(pid)] = f"{t.get('name') or '?'} ({t.get('address') or '?'})"
    return out

def owner(pid, procs, terms):
    """Walk parent pids up: the first herdr terminal wins; else the nearest Claude session (its --remote-control name or pid); else 'unknown'."""
    by = {p["pid"]: p for p in procs}
    seen, claude = set(), None
    while pid and pid not in seen:
        seen.add(pid)
        if pid in terms: return terms[pid]
        p = by.get(pid)
        if not p: break
        if claude is None and kind(p.get("name")) == "claude":
            m = re.search(r"--remote-control\s+(?:oren-)?(\S+)", p.get("cmd") or "")
            claude = f"claude session {m[1]}" if m else f"claude session pid {pid}"
        pid = p.get("ppid")
    return claude or "unknown"

def top3(procs, terms):
    big = sorted(procs, key=lambda p: -(p.get("rss") or 0))[:3]
    return [f"{p.get('name')} {(p.get('rss') or 0) / 1024 ** 3:.1f} GB ({owner(p['pid'], procs, terms)})" for p in big]

def causes(sample, st, now, control):
    """Pure but for st['cpu_since'] (first time CPU was seen > CPU_MAX). -> [(cause, text)]."""
    out, c = [], counts(sample.get("procs") or [])
    cpu, free = float(sample.get("cpu") or 0), float(100 if sample.get("ram_free") is None else sample["ram_free"])
    if cpu > CPU_MAX:
        since = st.setdefault("cpu_since", now)
        if now - since >= CPU_FOR_S: out.append(("cpu", f"CPU {cpu:.0f}% for {int((now - since) / 60)} min"))
    else: st.pop("cpu_since", None)
    if free < RAM_MIN: out.append(("ram", f"RAM {free:.0f}% free"))
    if c["chrome-headless-shell"] > CHROME_MAX: out.append(("chrome", f"{c['chrome-headless-shell']} chrome-headless-shell (max {CHROME_MAX})"))
    if c["claude"] > control + CLAUDE_EXTRA: out.append(("claude", f"{c['claude']} claude processes ({control} control sessions + {CLAUDE_EXTRA} allowed)"))
    return out

def due(keys, sent, now):
    """Once per ALARM_EVERY_S per cause. -> (keys to send now, new sent)."""
    sent, out = dict(sent), []
    for k in keys:
        if now - sent.get(k, -ALARM_EVERY_S) >= ALARM_EVERY_S: sent[k] = now; out.append(k)
    return out, sent

def line(sample):
    return f"PC: CPU {float(sample.get('cpu') or 0):.0f}% · RAM {float(sample.get('ram_free') or 0):.0f}% free"

def load(runs=None):
    try: return json.loads((Path(runs or RUNS) / "pc.json").read_text(encoding="utf-8"))
    except (OSError, ValueError): return {}

def alarmed(runs=None, now=None):
    """The runner's check: the watchdog's last sample (fresh) had an alarm cause."""
    d = load(runs)
    return bool(d.get("alarm")) and (now or time.time()) - float(d.get("at", 0)) < FRESH_S

def pc_not_cloud(error, is_alarmed):
    """#293 (14:52): a cloud start that failed with NO output while the PC is overloaded was the PC, not the cloud: no cloud pause."""
    return bool(is_alarmed) and (error or "").strip().lower() in ("", "no output", "?")

PS = ("$o=Get-CimInstance Win32_OperatingSystem;$c=(Get-CimInstance Win32_Processor|Measure-Object LoadPercentage -Average).Average;"
      "$p=Get-CimInstance Win32_Process|Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,CommandLine;"
      "@{cpu=$c;free=$o.FreePhysicalMemory;total=$o.TotalVisibleMemorySize;procs=@($p)}|ConvertTo-Json -Depth 3 -Compress")

def _cut(cmd): return (cmd if isinstance(cmd, str) else " ".join(cmd or []))[:300]

def collect():
    """One sample {cpu, ram_free, procs [{pid, ppid, name, rss, cmd}]} or None (no psutil and no powershell)."""
    try:
        import psutil
        vm, procs = psutil.virtual_memory(), []
        for p in psutil.process_iter(["pid", "ppid", "name", "memory_info", "cmdline"]):
            i = p.info
            procs.append({"pid": i["pid"], "ppid": i.get("ppid"), "name": i.get("name") or "",
                          "rss": getattr(i.get("memory_info"), "rss", 0) or 0, "cmd": _cut(i.get("cmdline"))})
        return {"cpu": psutil.cpu_percent(interval=1), "ram_free": 100 * vm.available / vm.total, "procs": procs}
    except ImportError: pass
    except Exception: return None
    if os.name != "nt": return None
    try:
        p = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", PS], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", stdin=subprocess.DEVNULL, timeout=60, creationflags=0x08000000)   # no window
        d = json.loads(p.stdout)
        procs = [{"pid": x.get("ProcessId"), "ppid": x.get("ParentProcessId"), "name": x.get("Name") or "",
                  "rss": x.get("WorkingSetSize") or 0, "cmd": _cut(x.get("CommandLine") or "")} for x in d.get("procs") or []]
        return {"cpu": float(d.get("cpu") or 0), "ram_free": 100 * float(d["free"]) / float(d["total"]), "procs": procs}
    except Exception: return None

_st = {"at": None, "sent": {}}

def tick(ts, send, log, now=None, sample=None, runs=None, collect=collect, st=None):
    """Every EVERY_S: sample, write pc.json, send new alarms (orchestrator + inspector). -> the causes sent now. Never kills anything."""
    now, st, runs = now or time.time(), _st if st is None else st, Path(runs or RUNS)
    if st.get("at") is not None and now - st["at"] < EVERY_S: return []
    st["at"] = now
    s = sample if sample is not None else collect()
    if not s: return []
    live = [t for t in ts or [] if t.get("state") == "live"]
    control = sum((t.get("name") or "") in CONTROL for t in live)
    found = causes(s, st, now, control)
    runs.mkdir(parents=True, exist_ok=True)
    (runs / "pc.json").write_text(json.dumps({"text": line(s), "alarm": bool(found), "causes": [k for k, _ in found], "at": now,
                                              "counts": counts(s.get("procs") or [])}), encoding="utf-8")
    keys, st["sent"] = due([k for k, _ in found], st.get("sent", {}), now)
    if not keys: return []
    msg = (f"PC LOAD ALARM (watchdog #293): {' · '.join(t for k, t in found if k in keys)}. {line(s)}. "
           f"Top RAM: {'; '.join(top3(s.get('procs') or [], term_pids(ts)))}. "
           "The runner starts no local work while this lasts. Nothing was killed: stop what is not needed.")
    log(msg)
    for w in ("orchestrator", "inspector"): send(w, msg)
    return keys
