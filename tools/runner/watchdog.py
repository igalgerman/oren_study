"""Watchdog: keeps the flow from getting stuck. Runs forever in the herdr window `watchdog` (started by tools/orchestrator.cmd).
Every minute it checks, deterministically:
  1. a worker/reviewer/intake window waiting for an answer (status blocked)  -> tells the orchestrator (once per new screen; also a worker whose last line is QUESTION:)
  2. a worker/reviewer that stopped without its RESULT:/VERDICT: line for 10 min -> tells the orchestrator
  3. free lanes + ready issues but no runner pass running                       -> starts a runner pass
  3b. a window waiting for the owner longer than park_minutes (the runner parks it itself; this is the fallback): issue gets blocked + ready-for-human, lane freed
  3c. owner lane: no intake window open + a needs-triage/needs-info issue -> opens ONE `intake-<n>` (oldest issue), `NEEDS YOU: intake-<n> is open`
  5. every observer_minutes: a read-only headless Claude audits the flow (observer_prompt.md); problems go to the orchestrator
  6. every sync_minutes: git pull --ff-only of the main checkout when clean (logs when it can't), so runner/watchdog/panel never run old code
  4. the orchestrator window is gone                                           -> writes it in the log (the owner sees it in /status)
It never answers questions or presses keys in other windows; it only tells the orchestrator and starts the runner.
Usage: python watchdog.py [--once]
"""
import calendar, hashlib, importlib, json, re, shutil, subprocess, sys, time, threading
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import runner as R   # config, gh(), select(), hc paths

EVERY = int(R.CFG.get("watchdog_seconds", 60))
LOG = R.RUNS / "watchdog.log"
told = {}          # window -> hash of the screen we already reported
idle_since = {}    # window -> first time seen stopped without a marker
waiting_since = {} # window -> first time seen waiting for a person (blocked menu or unanswered QUESTION:)

def log(msg):
    R.RUNS.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")

def windows():
    rc, out = R.hc("ls", "--json", timeout=30)
    if rc: return []
    try: return json.loads(out.strip().splitlines()[-1]).get("terminals", [])
    except Exception: return []

def tell(text):
    rc, out = R.hc("send", "orchestrator", text, timeout=30)
    log(("told orchestrator: " if rc == 0 else "could not tell orchestrator: ") + text[:200])

def screen_text(name):
    return R.hc("read", name, "--lines", "80", timeout=30)[1]

def screen_tail(name, n=12):
    rc, out = R.hc("read", name, "--lines", "60", timeout=30)
    lines = [l.rstrip() for l in out.splitlines() if l.strip() and not set(l.strip()) <= set("─╌│ ")]
    return "\n".join(lines[-n:])

def pin(t, on):
    """Pin a window that waits for the owner to the top of Herdr's agent lists (unpin when answered)."""
    if t.get("address") and Path(R.HERDR_APP).exists():
        R.run([R.HERDR_APP, "do", "terminal.pin", "--terminal", t["address"], "--pinned", "true" if on else "false"], timeout=30)

def needs_you_line(name, q, tail):
    """One console line for the orchestrator: `NEEDS YOU: #n <question>`."""
    m = re.match(r"(?:issue|review)-(\d+)", name)
    who = f"#{m[1]}" if m else name
    what = re.sub(r"^QUESTION:\s*", "", q) if q else "(waiting for an answer) " + (tail.strip().splitlines() or [""])[-1]
    return f"NEEDS YOU: {who} {what}".rstrip()

def check_windows(ts):
    names = {t.get("name") or "" for t in ts}
    if "orchestrator" not in names: log("orchestrator window is not running")
    now = time.time()
    for t in ts:
        name, status = t.get("name") or "", t.get("status", "")
        if t.get("state") != "live" or not name.startswith(("issue-", "review-", "intake")): continue
        screen = screen_text(name) if status in ("blocked", "done", "idle") else ""
        q = R.pending_question(screen) if status in ("done", "idle") else ""
        if status == "blocked" or q:
            since = waiting_since.setdefault(name, now)
            tail = chr(10).join(l for l in screen.splitlines() if l.strip() and not set(l.strip()) <= set("─╌│ "))[-1500:]
            if status == "blocked" and "trust this folder" in screen and now - since < 120: continue   # the runner accepts this dialog itself
            if status == "blocked" and now - since < 90: continue                                        # short menus the runner/owner answers at once: no alarm
            h = hashlib.sha1((q or tail[-600:]).encode()).hexdigest()
            if told.get(name) != h:
                told[name] = h
                pin(t, True)
                what = f"asks: {q}" if q else "is waiting for an answer"
                tell(f"{needs_you_line(name, q, tail)}{chr(10)}WATCHDOG: window {name} {what}. Ask the owner ONE short line in your window, then answer it "
                     f"(hc send {name} \"..\" or the menu option he picks). Its screen ends with:{chr(10)}{tail}")
            m = re.match(r"(?:issue|review)-(\d+)", name)       # fallback for a runner that did not park by itself
            if m and R.should_park(since, now, R.PARK_MINUTES + 3) and R.park_issue(int(m[1]), name, tail, since):
                log(f"parked #{m[1]} ({name} waiting since {time.strftime('%H:%M', time.localtime(since))})")
            continue
        if waiting_since.pop(name, None) is not None: pin(t, False)  # answered: unpin
        if told.get(name) not in (None, "idle"): told.pop(name)       # answered: a later new question is reported again
        if status in ("done", "idle") and name.startswith(("issue-", "review-")):
            marker = "VERDICT:" if name.startswith("review-") else "RESULT:"
            if R.find_marker(screen, marker):
                idle_since.pop(name, None); continue
            first = idle_since.setdefault(name, now)
            if now - first > 600 and told.get(name) != "idle":
                told[name] = "idle"
                tell(f"WATCHDOG: {name} stopped 10+ minutes ago without its {marker} line. Read it (hc read {name}) and get it to finish "
                     f"(push, PR, last line {marker} ...), or ask the owner.")
        else:
            idle_since.pop(name, None); told.pop(name, None)

def check_lanes(ts):
    if any((t.get("name") or "").startswith("run-pass") and t.get("state") == "live" for t in ts): return
    rc, out = R.gh("issue", "list", "--state", "open", "--limit", "200", "--json", "number,labels,createdAt,updatedAt,title,body")
    if rc: return
    issues = [{**i, "labels": [l["name"] for l in i["labels"]]} for i in json.loads(out)]
    if not R.select(issues, R.CFG["max_parallel"], R.MAX_CORE, R.EXPRESS): return
    orch = R.hc_json("get", "orchestrator", "--json").get("address", "")
    name = f"run-pass-{int(time.time()) % 100000}"
    cmd = [R.HC, "run", "--bg", "--outlive-parent", "--name", name, "--cwd", str(R.ROOT), "--label", "role=runner"]
    cmd += ["--parent", orch] if orch else ["--no-parent"]
    cmd += [sys.executable, str(HERE / "runner.py"), f"--term={name}"]
    rc, out = R.run(cmd, timeout=60)
    log(f"free lane + ready issue -> started {name} (rc {rc})")

def pick_intake(issues, ts):
    """Pure: the OLDEST open needs-triage / needs-info issue, unless an intake-* window is live (never two). issues: labels as names."""
    if any((t.get("name") or "").startswith("intake") and t.get("state") == "live" for t in ts): return None
    cand = [i for i in issues if {"needs-triage", "needs-info"} & set(i["labels"])]
    return min(cand, key=lambda i: (i.get("createdAt") or "", i["number"])) if cand else None

def check_intake(ts):
    """Owner lane: open ONE `intake-<n>` window (grill-me) for the oldest issue that needs the owner; tell the orchestrator."""
    if any((t.get("name") or "").startswith("intake") and t.get("state") == "live" for t in ts): return
    rc, out = R.gh("issue", "list", "--state", "open", "--limit", "200", "--json", "number,labels,createdAt,title")
    if rc: return
    i = pick_intake([{**x, "labels": [l["name"] for l in x["labels"]]} for x in json.loads(out)], ts)
    if not i: return
    n, name = i["number"], f"intake-{i['number']}"
    prompt = (f"/grill-me issue #{n} (gh issue view {n} --repo {R.CFG['repo']} --comments), then /to-tickets for what comes out of it, "
              f"then close #{n} with links to the new tickets.")
    cmd = [R.HC, "run", "--bg", "--outlive-parent", *R.space_args(), "--name", name, "--cwd", R.CFG.get("main_checkout", str(R.ROOT)),
           "--label", f"issue={n}", "--label", "role=intake", shutil.which("claude") or "claude", prompt]
    rc, out = R.run(cmd, timeout=60)
    log(f"owner lane: opened {name} (rc {rc})")
    if rc == 0: tell(f"NEEDS YOU: {name} is open")

FINISHED_RE = re.compile(r"^(run|issue|review|intake)-|^watchdog|^flowtest")
IDLE_MIN = 15      # a live issue/review/intake window done/idle this long, with no live run-<n>, only holds RAM
PARKED_MIN = 60    # #123: a parked (blocked) issue's done/idle windows, after this long
quiet_since = {}   # live window name -> first time seen done/idle

def leftovers(ts, closed, blocked, human=frozenset(), stale=frozenset(), busy=frozenset(), old=frozenset()):
    """Pure: names of windows to close. ts = hc terminals (name, state, status, marker True/False),
    closed = closed issue numbers, blocked = issue numbers labelled blocked (parked: keep their windows for the owner),
    human = issue numbers labelled ready-for-human (owner may look), stale = live window names done/idle for IDLE_MIN+,
    busy = issue numbers whose runner still holds issue-<n>.lock (#113: a CI merge auto-closes the issue before the deploy),
    old = live window names done/idle for PARKED_MIN+ (#123: a parked issue's windows go then; its screen is in the park comment)."""
    live = {t["name"] for t in ts if t.get("state") == "live"}
    live_run = {int(m.group(1)) for x in live for m in [re.match(r"^run-(\d+)(-\w+)?$", x)] if m}
    out = []
    for t in ts:
        name = t.get("name") or ""
        if t.get("state") != "live" and FINISHED_RE.match(name):            # any finished terminal: remove it (by address)
            if name not in live and name not in out: out.append(name)
            continue
        m = re.match(r"^(issue|review|run|intake)-(\d+)(-fix|-2|-resolve\d+)?$", name)   # #110: resolve rounds too
        if not m: continue
        n, role, suffix = int(m.group(2)), m.group(1), m.group(3) or ""
        if t.get("state") != "live": continue
        if n in busy: continue                                              # #113: runner still deploying/closing it
        if n in closed: out.append(name); continue                          # issue done: everything for it goes (#123: even if labelled blocked)
        if n in blocked:                                                    # parked: the owner may look, for PARKED_MIN
            if name in old: out.append(name)
            continue
        if role != "run" and name in stale and n not in live_run and n not in human: out.append(name); continue
        if role in ("run", "intake") or t.get("status") not in ("done", "idle") or not t.get("marker"): continue
        # a worker/reviewer that printed its RESULT/VERDICT and was superseded by the next step's window
        if suffix.startswith("-resolve"):                                   # #110: superseded by the next resolve round
            if f"issue-{n}-resolve{int(suffix[8:]) + 1}" in live: out.append(name)
            continue
        later = {"issue": [f"review-{n}", f"review-{n}-2", f"issue-{n}-fix"] if not suffix else [f"review-{n}-2"],
                 "review": [f"issue-{n}-fix"] if not suffix else []}[role]
        if any(x in live for x in later): out.append(name)
    return out

def cleanup(ts):
    rc, out = R.gh("issue", "list", "--state", "all", "--limit", "300", "--json", "number,state,labels")
    if rc: return
    iss = json.loads(out)
    closed = {i["number"] for i in iss if i["state"] == "CLOSED"}
    blocked = {i["number"] for i in iss if any(l["name"] == "blocked" for l in i["labels"])}
    human = {i["number"] for i in iss if any(l["name"] == "ready-for-human" for l in i["labels"])}
    rows, now, stale, old = [], time.time(), set(), set()
    for t in ts:
        name = t.get("name") or ""
        if not FINISHED_RE.match(name): continue
        if t.get("state") == "live" and t.get("status") in ("done", "idle"):
            q = now - quiet_since.setdefault(name, now)
            if q >= IDLE_MIN * 60: stale.add(name)
            if q >= PARKED_MIN * 60: old.add(name)
        else: quiet_since.pop(name, None)
        if t.get("state") == "live" and not re.match(r"^(issue|review|run|intake)-\d+", name): continue   # never touch live watchdog etc.
        mk = "VERDICT:" if name.startswith("review-") else "RESULT:"
        marker = t.get("state") == "live" and t.get("status") in ("done", "idle") and bool(R.find_marker(screen_tail(name, 40), mk))
        rows.append({**t, "name": name, "marker": marker})
    nums = {int(m.group(1)) for t in rows for m in [re.match(r"^\w+-(\d+)", t["name"])] if m}
    busy = {n for n in nums if R.FileLock(f"issue-{n}").held_by_other()}
    for name in leftovers(rows, closed, blocked, human, stale, busy, old):
        # act on the ADDRESS of the matching row, never the bare name: a finished terminal can share its
        # name with a new live one, and `hc kill <name>` would hit the live one.
        for t in rows:
            if t["name"] != name or not t.get("address"): continue
            if t.get("state") == "live": R.hc("kill", t["address"], timeout=30)
            R.hc("rm", t["address"], timeout=30)
            log(f"closed window {name} ({t['address']}, was {t.get('state')})")

OBSERVER_MIN = int(R.CFG.get("observer_minutes", 30))
OBS_PROMPT = HERE / "observer_prompt.md"
OBS_LOG, OBS_LAST = R.RUNS / "observer.log", R.RUNS / "observer.last"
OBS_TOOLS = ["Read", "Grep", "Glob", "Bash(gh:*)", "Bash(git log:*)", "Bash(git show:*)", "Bash(hc:*)"]
_obs = {"last": 0.0, "running": False}

def observer_due(last, now, minutes, running):
    """Pure: start the observer when none runs and `minutes` passed since the last start."""
    return not running and now - last >= minutes * 60

def parse_observer(text):
    """Pure: the `OBSERVER: <problem> -> <fix>` lines of the output ([] when OK or unparseable), max 8."""
    out = [l.strip() for l in text.splitlines() if l.strip().startswith("OBSERVER:")]
    out = [l for l in out if l.rstrip() != "OBSERVER: OK"]
    return out[:8]

def observer_once():
    """Run the observer now (blocking); returns the problem lines. Logs, writes observer.last, tells the orchestrator."""
    prompt = OBS_PROMPT.read_text(encoding="utf-8").replace("{HC}", R.HC)
    cmd = [shutil.which("claude") or "claude", "-p", "--model", "sonnet", "--permission-mode", "auto", "--allowedTools", *OBS_TOOLS]
    rc, out = R.run(cmd, cwd=str(R.ROOT), input=prompt, timeout=900)   # prompt on stdin: --allowedTools would swallow a positional one
    hhmm = time.strftime("%H:%M")
    R.RUNS.mkdir(parents=True, exist_ok=True)
    with open(OBS_LOG, "a", encoding="utf-8") as f: f.write(f"=== {time.strftime('%Y-%m-%d %H:%M:%S')} rc={rc}\n{out}\n")
    probs = parse_observer(out)
    if rc or ("OBSERVER-END" not in out and not probs and "OBSERVER: OK" not in out): res = f"{hhmm} failed (rc {rc})"
    elif probs: res = f"{hhmm} {len(probs)} problems"
    else: res = f"{hhmm} OK"
    OBS_LAST.write_text(res + "\n", encoding="utf-8")
    if probs: tell("OBSERVER found:" + chr(10) + chr(10).join(probs))
    log("observer: " + res)
    return probs

def observer_tick():
    if not observer_due(_obs["last"], time.time(), OBSERVER_MIN, _obs["running"]): return
    _obs["last"], _obs["running"] = time.time(), True
    def work():
        try: observer_once()
        except Exception as e: log(f"observer error: {e!r}")
        finally: _obs["running"] = False
    threading.Thread(target=work, daemon=True).start()

SYNC_MIN = int(R.CFG.get("sync_minutes", 3))
_sync = {"last": 0.0, "msg": ""}

def sync_tick():
    """Every SYNC_MIN minutes fast-forward the main checkout; log changes of state only."""
    if time.time() - _sync["last"] < SYNC_MIN * 60: return
    _sync["last"] = time.time()
    msg = R.sync_main()
    if msg and msg != _sync["msg"]: log(msg)
    _sync["msg"] = msg

PR_QUIET_MIN, BLOCKED_HOURS, FREE_MIN, ALARM_EVERY_MIN = 60, 2, 15, 60   # #117 idle alarm
_alarm = {"last": 0.0, "free_since": None, "sent": {}}

def _age_min(iso, now):
    try: return (now - calendar.timegm(time.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S"))) / 60   # GitHub times are UTC
    except (TypeError, ValueError): return 0

def idle_alarms(issues, prs, now, free_since, max_parallel):
    """Pure (#117): -> list of (key, text). issues: open, labels as names; prs: open (number, title, updatedAt);
    free_since = epoch when 'free lane + startable work' was first seen (None = not now)."""
    out = []
    running = sum("in-progress" in i["labels"] for i in issues)
    if free_since is not None and now - free_since >= FREE_MIN * 60:
        out.append(("free", f"{max_parallel - running} lane(s) free for {int((now - free_since) / 60)} min while work is ready"))
    for p in prs:
        m = _age_min(p.get("updatedAt"), now)
        if m >= PR_QUIET_MIN: out.append((f"pr{p['number']}", f"PR #{p['number']} has not moved for {int(m)} min ({p.get('title', '')[:50]})"))
    for i in issues:
        h = _age_min(i.get("updatedAt"), now) / 60
        if "blocked" in i["labels"] and h >= BLOCKED_HOURS:
            out.append((f"bl{i['number']}", f"#{i['number']} blocked for {h:.1f} h" + (" (waits for the owner)" if "ready-for-human" in i["labels"] else "")))
    return out

def alarms_once(now=None):
    now = now or time.time()
    rc, out = R.gh("issue", "list", "--state", "open", "--limit", "200", "--json", "number,labels,createdAt,updatedAt,title,body")
    rc2, out2 = R.gh("pr", "list", "--state", "open", "--json", "number,title,updatedAt")
    if rc or rc2: return None
    issues = [{**i, "labels": [l["name"] for l in i["labels"]]} for i in json.loads(out)]
    running = sum("in-progress" in i["labels"] for i in issues)
    free = running < R.CFG["max_parallel"] and bool(R.select(issues, R.CFG["max_parallel"]))
    if not free: _alarm["free_since"] = None
    elif _alarm["free_since"] is None: _alarm["free_since"] = now
    return idle_alarms(issues, json.loads(out2), now, _alarm["free_since"], R.CFG["max_parallel"])

def alarm_tick():
    """Every 10 min: idle alarms to the orchestrator (+ watchdog.log); the same alarm at most once an hour."""
    now = time.time()
    if now - _alarm["last"] < 600: return
    _alarm["last"] = now
    al = alarms_once(now) or []
    new = [t for k, t in al if now - _alarm["sent"].get(k, 0) >= ALARM_EVERY_MIN * 60]
    if not new: return
    for k, t in al:
        if t in new: _alarm["sent"][k] = now
    tell("IDLE ALARM (watchdog): " + " · ".join(new))

def main():
    if "--alarms-once" in sys.argv:          # #117: one command: is anything idle or stuck?
        sys.stdout.reconfigure(encoding="utf-8")
        al = alarms_once()
        print("could not read GitHub" if al is None else "\n".join(t for _, t in al) or "nothing idle or stuck"); return
    if "--observe-once" in sys.argv:
        sys.stdout.reconfigure(encoding="utf-8")
        print("\n".join(observer_once()) or "no problems"); print(OBS_LAST.read_text()); return
    log("watchdog started")
    W, me = sys.modules[__name__], Path(__file__).resolve()
    stamp, wstamp = (HERE / "runner.py").stat().st_mtime, me.stat().st_mtime
    while True:
        try:
            m = (HERE / "runner.py").stat().st_mtime
            if m != stamp:                    # runner.py changed: pick up the new select()/park logic without restarting this window
                stamp = m; importlib.reload(R); log("reloaded runner.py")
            w = me.stat().st_mtime
            if w != wstamp:                   # #127: watchdog.py changed (a merged fix): load it too, no manual restart
                wstamp = w; W = importlib.reload(W) if W.__name__ == "watchdog" else importlib.import_module("watchdog")
                log("reloaded watchdog.py")
            W.tick()
        except Exception as e:
            log(f"error: {e!r}")
        if "--once" in sys.argv: return
        time.sleep(EVERY)

def tick():
    """One watchdog pass (main() calls it on the newest loaded copy of this file)."""
    ts = windows()
    check_windows(ts)
    check_lanes(ts)
    check_intake(ts)
    cleanup(R.hc_json("ls", "--all", "--json").get("terminals", []) or ts)
    observer_tick()
    sync_tick()
    alarm_tick()

if __name__ == "__main__":
    main()
