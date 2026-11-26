"""Watchdog: keeps the flow from getting stuck. Runs forever in the herdr window `watchdog` (started by tools/orchestrator.cmd).
Every minute it checks, deterministically:
  1. a worker/reviewer/intake window waiting for an answer (status blocked)  -> tells the orchestrator (once per new screen; also a worker whose last line is QUESTION:)
     and posts the question in the pinned issue 'Questions for the owner' (owner_q.py, #193; once per window+question); an owner reply there -> tells the orchestrator
  1b. every open owner question -> ONE pinned window question-<n> (qwin.py, #220): Hebrew page (tools/ask) + phone push, first answer wins, relayed
  2. a worker/reviewer that stopped without its RESULT:/VERDICT: line for 10 min -> tells the orchestrator
  3. free lanes + ready issues but no runner pass running                       -> starts a runner pass
  3b. a window waiting for the owner longer than park_minutes (the runner parks it itself; this is the fallback): issue gets blocked + ready-for-human, lane freed
  3c. owner lane: no intake window open + a needs-triage/needs-info issue -> opens ONE `intake-<n>` (oldest issue), `NEEDS YOU: intake-<n> is open`
  5. every observer_minutes: observer.py applies deterministic rules (make_ready, rerun, fix Blocked-by lines) within limits
  5b. every ai_observer_minutes (#203): ai_observer.py, ONE read-only headless Sonnet check in a thread; new findings -> the orchestrator
  5c. every tick (#262): an open PR that conflicts with main and has auto-merge or a review PASS -> a resolve run (window resolve-<n>, conflicts.py)
  5c. #219 nightly.py: once a day at retro_hour ONE read-only headless Sonnet retro + handoff (issue 'Daily retro <date>', handoff PR);
      batch trigger: tells the inbox to run /batch once a day, and early when >= 8 ready P2/P3 issues share a lane
  5d. #282 parked.py (hourly): batch members of a closed batch get ready-for-agent back; polish lists ready (P3) at 5 notes / 24 h;
      later/manual 2 h+ with no owner question and no run/PR -> 'parked without owner question: #n'; night report of every parked issue's reason
  6. every sync_minutes: git pull --ff-only of the main checkout when clean (logs when it can't), so runner/watchdog/panel never run old code
  4. the orchestrator window is gone                                           -> writes it in the log (the owner sees it in /status)
  4b. orchestrator / inbox / inspector terminal finished (#140)                -> removed by address and started again (recover.py commands)
It never answers questions or presses keys in other windows; it only tells the orchestrator and starts the runner.
Usage: python watchdog.py [--once | --lock | --alarms-once]
"""
import argparse, calendar, hashlib, importlib, json, re, shutil, subprocess, sys, time, threading
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import runner as R   # config, gh(), select(), hc paths
import owner_q as OQ # #193: the pinned 'Questions for the owner' issue

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
            url = OQ.post(name, q, tail)                        # #193: into the pinned owner-questions issue (once; retried while gh fails)
            if url: log(f"posted owner question for {name}: {url}")
            if told.get(name) != h:
                told[name] = h
                pin(t, True)
                what = f"asks: {q}" if q else "is waiting for an answer"
                tell(f"{needs_you_line(name, q, tail)}{chr(10)}WATCHDOG: window {name} {what}. NEW OWNER QUESTION"
                     + (f" (posted: {url})" if url else " (in the 'Questions for the owner' issue)")
                     + f": a pinned question window (question-<n>, #220) asks him on the Hebrew page and by PushNotification; do not push yourself. "
                     f"When it tells you OWNER ANSWERED, relay the answer (hc send {name} \"..\" or the menu option he picks). Its screen ends with:{chr(10)}{tail}")
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
    import freeze
    if freeze.is_frozen(R.RUNS): return     # #139: frozen, start no runner pass
    if any((t.get("name") or "").startswith("run-pass") and t.get("state") == "live" for t in ts): return
    rc, out = R.gh("issue", "list", "--state", "open", "--limit", "200", "--json", "number,labels,createdAt,updatedAt,title,body")
    if rc: return
    issues = [{**i, "labels": [l["name"] for l in i["labels"]]} for i in json.loads(out)]
    if not R.select(issues, R.total_lanes(), R.MAX_CORE, R.EXPRESS): return
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
              f"then close #{n} with links to the new tickets. Every ticket gets an '## Acceptance' section before ready-for-agent: 3-7 checkable points "
              f"+ the tests that prove them, and 'Out of scope' (#186). If #{n} is only waiting because it has no Acceptance section, "
              f"skip the grilling: write that section into #{n}'s body.")
    cmd = [R.HC, "run", "--bg", "--outlive-parent", *R.space_args(), "--name", name, "--cwd", R.CFG.get("main_checkout", str(R.ROOT)),
           "--label", f"issue={n}", "--label", "role=intake", shutil.which("claude") or "claude", prompt]
    rc, out = R.run(cmd, timeout=60)
    log(f"owner lane: opened {name} (rc {rc})")
    if rc == 0: tell(f"NEEDS YOU: {name} is open")

FINISHED_RE = re.compile(r"^(run|issue|review|intake|resolve)-|^watchdog|^flowtest")
IDLE_MIN = 15      # a live issue/review/intake window done/idle this long, with no live run-<n>, only holds RAM
PARKED_MIN = 60    # #123: a parked (blocked) issue's done/idle windows, after this long
quiet_since = {}   # live window name -> first time seen done/idle

def leftovers(ts, closed, blocked, human=frozenset(), stale=frozenset(), busy=frozenset(), old=frozenset(), passed=frozenset()):
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
        if n in passed and role in ("issue", "review") and not suffix.startswith("-resolve") and t.get("status") in ("done", "idle"):
            out.append(name); continue                                      # #164: review passed, runner only merges now
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

def review_passed(nums, events=None):
    """#164: issues whose CURRENT run (after its last start) has a review_pass event in stats.jsonl."""
    if events is None:
        import stats; events = stats.read_events(R.RUNS / "stats.jsonl")
    start, ok = {}, set()
    for e in sorted(events, key=lambda e: e.get("ts", 0)):
        n = e.get("issue")
        if n not in nums: continue
        if e.get("event") == "start": start[n] = e["ts"]; ok.discard(n)
        elif e.get("event") == "review_pass" and n in start: ok.add(n)
    return ok

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
    for name in leftovers(rows, closed, blocked, human, stale, busy, old, review_passed(nums)):
        # act on the ADDRESS of the matching row, never the bare name: a finished terminal can share its
        # name with a new live one, and `hc kill <name>` would hit the live one.
        for t in rows:
            if t["name"] != name or not t.get("address"): continue
            if t.get("state") == "live": R.hc("kill", t["address"], timeout=30)
            R.hc("rm", t["address"], timeout=30)
            log(f"closed window {name} ({t['address']}, was {t.get('state')})")

def check_control(ts):
    """#140: a finished orchestrator / inbox / inspector terminal is removed (by address) and started again, same command as recover."""
    import recover
    for name, address in recover.finished_control(ts):
        R.hc("rm", address, timeout=30)
        rc = recover.start_control(R, name)
        log(f"{name} had finished: restarted (rc {rc})")
        if rc == 0 and name != "orchestrator": tell(f"WATCHDOG: {name} had finished; restarted it")

def qwin_tick(ts):
    import qwin; importlib.reload(qwin); qwin.tick(ts)   # #220: one pinned question window per open owner question

def resume_tick():
    for n in R.resume_answered(): log(f"#{n}: owner answered the cloud question -> unparked, the next pass resumes its session (#135)")

def observer_tick():
    import observer; observer.run_if_due()      # acting observer (observer.py)

def ai_observer_tick():
    import ai_observer; ai_observer.run_if_due(tell, log)   # #203: hourly AI check (thread; not reloaded: that would reset its never-two guard)

def parked_tick():
    try:
        import parked; parked.tick(tell, log)      # #282: hourly guard inside (state in .runs/parked.json)
    except Exception as e: log(f"parked tick error: {e!r}")

def nightly_tick():
    import nightly   # #219: not reloaded (that would reset its never-two guard)
    nightly.retro_if_due(tell, log)
    nightly.batch_tick(lambda t: R.hc("send", "inbox", t, timeout=30)[0], log)

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

def idle_alarms(issues, prs, now, free_since, max_parallel, finish=(0, 0)):
    """Pure (#117): -> list of (key, text). issues: open, labels as names; prs: open (number, title, updatedAt);
    free_since = epoch when 'free lane + startable work' was first seen (None = not now);
    finish = (finished, started) by the runner in 24 h (stats.finish_rate, #148)."""
    out = []
    done, started = finish
    if started and done / started < 0.5:
        out.append(("finish", f"runner finished on its own only {done} of {started} issues in 24 h ({100 * done / started:.0f}%, goal 80%)"))
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

def cloud_stuck_alarms(rows, now, stuck_hours):
    """Pure (#136): -> list of (key, text) for cloud lanes (remote.cloud() rows) with no comment/commit for stuck_hours."""
    out = []
    for c in rows:
        m = _age_min(c.get("last"), now)
        if c.get("last") and m >= stuck_hours * 60:
            out.append((f"cl{c['n']}", f"cloud lane #{c['n']} has had no activity for {m / 60:.1f} h (stuck_hours {stuck_hours:g}; state {c.get('state', '?')})"))
    return out

def alarms_once(now=None):
    now = now or time.time()
    rc, out = R.gh("issue", "list", "--state", "open", "--limit", "200", "--json", "number,labels,createdAt,updatedAt,title,body")
    rc2, out2 = R.gh("pr", "list", "--state", "open", "--json", "number,title,updatedAt")
    if rc or rc2: return None
    issues = [{**i, "labels": [l["name"] for l in i["labels"]]} for i in json.loads(out)]
    issues, _ = R.gate(issues)                      # #186: issues the runner refuses are not startable work
    running = sum("in-progress" in i["labels"] for i in issues)
    free = running < R.total_lanes() and bool(R.select(issues, R.total_lanes()))
    if not free: _alarm["free_since"] = None
    elif _alarm["free_since"] is None: _alarm["free_since"] = now
    try:
        import remote; cloud = remote.cloud(now=now)
    except Exception as e:
        log(f"cloud lanes unreadable: {e!r}"); cloud = []
    import stats
    finish = stats.finish_rate(stats.read_events(R.RUNS / "stats.jsonl"), now)    # #148
    return idle_alarms(issues, json.loads(out2), now, _alarm["free_since"], R.total_lanes(), finish) + cloud_stuck_alarms(cloud, now, float(R.CFG.get("stuck_hours", 2)))

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

RELOAD = ("remote", "owner_q", "freeze", "stats", "recover", "conflicts", "parked")   # #229: reloaded on change, before runner.py (observer/ai_observer keep in-memory guards: not reloaded)

def parse_args(argv):
    """#229: unknown flags (and --help) end here, before the loop."""
    p = argparse.ArgumentParser(prog="watchdog.py", description="Oren runner watchdog: checks windows, lanes and alarms every minute.")
    p.add_argument("--once", action="store_true", help="one pass, then exit")
    p.add_argument("--lock", action="store_true", help="who holds the merge lock, then exit")
    p.add_argument("--alarms-once", action="store_true", help="print idle/stuck alarms, then exit")
    p.add_argument("--dry-run", action="store_true", help=argparse.SUPPRESS)
    return p.parse_args(argv)

def main():
    a = parse_args(sys.argv[1:])
    if a.lock:                 # #181: who holds the merge lock, why, for how long
        sys.stdout.reconfigure(encoding="utf-8")
        _, info, alive = lock_state()
        if not info: print("merge lock: free"); return
        pid, note, since = info
        print(f"merge lock: held by {note or 'unknown step'} (pid {pid}, {'alive' if alive else 'DEAD'}) for {int((time.time() - since) / 60)} min")
        w = green_waiting(); print("green PRs waiting: " + (", ".join(f"#{n}" for n in w) if w else "none")); return
    if a.alarms_once:          # #117: one command: is anything idle or stuck?
        sys.stdout.reconfigure(encoding="utf-8")
        al = alarms_once()
        print("could not read GitHub" if al is None else "\n".join(t for _, t in al) or "nothing idle or stuck"); return
    try: lock = R.FileLock("watchdog", note="watchdog loop").__enter__()   # #229: one live loop only
    except R.Blocked:
        print(f"watchdog already running (pid {(R.FileLock('watchdog').info() or ('?',))[0]}); not starting a second loop", file=sys.stderr); sys.exit(1)
    try: loop(a.once)
    finally: lock.__exit__()

def _mtime(name):
    try: return (HERE / f"{name}.py").stat().st_mtime
    except OSError: return None

def loop(once):
    log("watchdog started")
    W, me = sys.modules[__name__], Path(__file__).resolve()
    stamp, wstamp = (HERE / "runner.py").stat().st_mtime, me.stat().st_mtime
    mods = {n: _mtime(n) for n in RELOAD}
    while True:
        try:
            for n in RELOAD:                  # #229: remote.py & co changed: reload them first, so runner.py and the ticks use the new code
                t = _mtime(n)
                if t != mods[n]:
                    mods[n] = t
                    if n in sys.modules: importlib.reload(sys.modules[n]); log(f"reloaded {n}.py")
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
        if once: return
        time.sleep(EVERY)

def tick():
    """One watchdog pass (main() calls it on the newest loaded copy of this file)."""
    try: (R.RUNS / "watchdog.beat").write_text(str(int(time.time())), encoding="utf-8")   # #171: liveness for the dashboard
    except OSError: pass
    ts = windows()
    check_windows(ts)
    OQ.answers_tick(tell)
    qwin_tick(ts)
    resume_tick()
    check_lanes(ts)
    check_intake(ts)
    all_ts = R.hc_json("ls", "--all", "--json").get("terminals", []) or ts
    check_control(all_ts)
    cleanup(all_ts)
    reap_tick(ts)       # #248
    stuck_tick(ts)
    conflicts_tick(ts)  # #262
    observer_tick()
    ai_observer_tick()
    nightly_tick()
    parked_tick()
    sync_tick()
    alarm_tick()
    trends_tick()
    ai_tick()
    lock_tick()
    orch_idle_tick()

# ---------- #262: a green/approved PR that conflicts with main gets a resolve run by itself ----------
def resolve_cmd(a):
    """hc command for one resolve run: terminal resolve-<n> runs `runner.py <n> --resolve-pr --round=<k>` (the runner's resolve worker)."""
    name = f"resolve-{a['n']}"
    return [R.HC, "run", "--bg", "--outlive-parent", "--name", name, "--cwd", str(R.ROOT), "--label", f"issue={a['n']}", "--label", "role=runner",
            *R.parent_args(), sys.executable, str(HERE / "runner.py"), str(a["n"]), "--resolve-pr", f"--round={a['round']}", f"--term={name}"]

def conflicts_tick(ts):
    import conflicts
    def start(a):
        rc, out = R.run(resolve_cmd(a))
        log(f"#262 PR #{a['pr']} conflicts with main: " + (f"resolve round {a['round']} started (resolve-{a['n']})" if rc == 0 else f"could not start resolve-{a['n']}: {out.strip()[:200]}"))
        return rc == 0
    conflicts.tick(conflicts.busy(ts), review_passed, R.gh, start, tell, R.RUNS / "conflicts.json")

# ---------- #248: backstop: a lane is never held for a closed issue or a silent run ----------
REAP_GRACE_MIN, STUCK_AGAIN_MIN = 10, 30
closed_seen = {}   # issue number -> first time seen CLOSED (grace for the deploy)
_stuck = {}        # run number -> {"m": dir mtime at the first alarm, "at": alarm time, "again": reported twice}

def lock_holder_issue(info):
    """Issue number in the merge lock note ('#12 CI merge'), or None."""
    m = re.match(r"#(\d+)", (info[1] if info else "") or "")
    return int(m.group(1)) if m else None

def reap_runs(ts, closed_since, now, lock_holder, grace_min=REAP_GRACE_MIN):
    """Pure (#248): -> [(address, n)] of LIVE run-<n> windows whose issue was seen CLOSED for >= grace_min and that do not hold the merge lock.
    closed_since = {issue: first time seen closed}."""
    out = []
    for t in ts:
        m = re.match(r"^run-(\d+)$", t.get("name") or "")
        if not m or t.get("state") != "live" or not t.get("address"): continue
        n = int(m.group(1))
        if n == lock_holder or n not in closed_since: continue
        if now - closed_since[n] >= grace_min * 60: out.append((t["address"], n))
    return out

def reap_tick(ts, now=None, gh=None, hc=None, say=None, holder=None):
    """Kill (by ADDRESS) run windows of issues closed for the grace time; drop in-progress. A gh error reaps nothing."""
    now, gh, hc, say = now or time.time(), gh or R.gh, hc or R.hc, say or tell
    rc, out = gh("issue", "list", "--state", "all", "--limit", "300", "--json", "number,state")
    if rc: return []
    try: closed = {i["number"] for i in json.loads(out) if i["state"] == "CLOSED"}
    except (ValueError, KeyError, TypeError): return []
    for n in closed: closed_seen.setdefault(n, now)
    for n in [n for n in closed_seen if n not in closed]: closed_seen.pop(n)
    if holder is None: holder = lock_holder_issue(lock_state()[1])
    done = []
    for addr, n in reap_runs(ts, closed_seen, now, holder):
        hc("kill", addr, timeout=30)
        gh("issue", "edit", str(n), "--remove-label", "in-progress")
        log(f"#248 reaped run-{n} ({addr}): issue #{n} closed for {int((now - closed_seen[n]) / 60)}+ min, lane freed")
        say(f"WATCHDOG (#248): closed run-{n} (issue #{n} is closed, the lane was held for nothing)")
        done.append((addr, n))
    return done

def run_mtime(n):
    """Newest change in .runs/<n> (the dir and its files); None when there is no such dir."""
    d = R.RUNS / str(n)
    try: return max([d.stat().st_mtime] + [f.stat().st_mtime for f in d.iterdir()])
    except OSError: return None

def stuck_runs(ts, mtimes, now, stuck_hours, st):
    """Pure (#248): -> (alarms [(n, text)], stuck_lanes [n]). First alarm when .runs/<n> is unchanged for stuck_hours; if it is STILL
    unchanged STUCK_AGAIN_MIN later: reported again once, and counted as a stuck lane (until it moves or the window is gone)."""
    live = {int(m.group(1)) for t in ts if t.get("state") == "live" for m in [re.match(r"^run-(\d+)$", t.get("name") or "")] if m}
    for n in [n for n in st if n not in live]: st.pop(n)
    alarms = []
    for n in sorted(live):
        mt = mtimes.get(n)
        if mt is None or now - mt < stuck_hours * 3600: st.pop(n, None); continue
        s = st.get(n)
        if not s or s["m"] != mt:
            st[n] = {"m": mt, "at": now, "again": False}
            alarms.append((n, f"run-{n} has not changed for {(now - mt) / 3600:.1f} h (stuck_hours {stuck_hours:g})"))
        elif not s["again"] and now - s["at"] >= STUCK_AGAIN_MIN * 60:
            s["again"] = True
            alarms.append((n, f"run-{n} is STILL stuck {int((now - s['at']) / 60)} min after the first alarm: counted as a stuck lane"))
    return alarms, sorted(n for n, s in st.items() if s["again"])

def stuck_tick(ts, now=None):
    now = now or time.time()
    nums = [int(m.group(1)) for t in ts if t.get("state") == "live" for m in [re.match(r"^run-(\d+)$", t.get("name") or "")] if m]
    alarms, lanes = stuck_runs(ts, {n: run_mtime(n) for n in nums}, now, float(R.CFG.get("stuck_hours", 2)), _stuck)
    for n, text in alarms: log("#248 " + text)
    if alarms: tell("STUCK RUN (watchdog #248): " + " · ".join(t for _, t in alarms))
    try: (R.RUNS / "stuck_lanes.json").write_text(json.dumps(lanes), encoding="utf-8")
    except OSError: pass

# ---------- #181: merge lock watch ----------
LOCK_WARN_MIN, LOCK_REPEAT_MIN = 20, 30
_lock = {"sent": 0.0, "key": None}

def lock_alarm(info, alive, now, waiting=()):
    """Pure: -> ('clear', text) when the holder is dead, ('alarm', text) when held > LOCK_WARN_MIN, else None.
    info = (pid, note, since) from FileLock.info(); waiting = green open PR numbers."""
    if not info: return None
    pid, note, since = info
    mins = int((now - since) / 60)
    who = f"{note or 'unknown step'} (pid {pid})"
    if not alive:
        return ("clear", f"merge lock held by a dead process: {who}, {mins} min; removed")
    if mins >= LOCK_WARN_MIN:
        w = f"; green PRs waiting: #{', #'.join(map(str, waiting))}" if waiting else ""
        return ("alarm", f"MERGE LOCK held {mins} min by {who}{w}. Check that step; nothing slow belongs inside the lock (#181)")
    return None

def green_waiting():
    rc, out = R.gh("pr", "list", "--state", "open", "--json", "number,isDraft,statusCheckRollup")
    if rc: return []
    ok = lambda p: p.get("statusCheckRollup") and all((c.get("conclusion") or c.get("status")) in ("SUCCESS", "SKIPPED", "NEUTRAL") for c in p["statusCheckRollup"])
    return [p["number"] for p in json.loads(out) if not p.get("isDraft") and ok(p)]

def lock_state(now=None):
    lk = R.FileLock("integrate"); info = lk.info()
    return lk, info, (bool(info) and R.pid_alive(info[0]))

# ---------- #225: watch the checker (an idle orchestrator while work waits) ----------
ORCH_WAIT_MIN, ORCH_NUDGE_EVERY_MIN, ORCH_ESCALATE_MIN, ORCH_ESCALATE_EVERY_H = 10, 10, 30, 2
OWNER_ISSUE = int(R.CFG.get("owner_questions_issue", 205))
_orch = {"nudged": 0.0, "first": 0.0, "escalated": 0.0}

def waiting_reviews(prs, now):
    """Pure: open non-draft PRs, all checks green, no auto-merge yet, open >= ORCH_WAIT_MIN -> [numbers] (they wait for a review)."""
    out = []
    for p in prs:
        if p.get("isDraft") or p.get("autoMergeRequest") is not None: continue
        checks = p.get("statusCheckRollup") or []
        if not checks or not all((c.get("conclusion") or c.get("status")) in ("SUCCESS", "SKIPPED", "NEUTRAL") for c in checks): continue
        t = _age_min(p.get("updatedAt") or p.get("createdAt"), now)
        if t >= ORCH_WAIT_MIN: out.append(p["number"])
    return sorted(out)

def orch_decision(state, waiting, st, now):
    """Pure: -> 'reset' | 'nudge' | 'escalate' | None. state = orchestrator terminal state; st = _orch-like dict."""
    idle = state in ("done", "idle", "blocked")
    if not idle or not waiting: return "reset"
    if st["first"] and now - st["first"] >= ORCH_ESCALATE_MIN * 60 and now - st["escalated"] >= ORCH_ESCALATE_EVERY_H * 3600:
        return "escalate"
    if now - st["nudged"] >= ORCH_NUDGE_EVERY_MIN * 60: return "nudge"
    return None

def orch_idle_tick(now=None):
    now = now or time.time()
    d = R.hc_json("get", "orchestrator", "--json") or {}
    stt = d.get("status") or {}
    state = stt.get("state") if isinstance(stt, dict) else stt
    if not d or d.get("state") != "live": return                      # gone/finished: the #140 restart check handles it
    rc, out = R.gh("pr", "list", "--state", "open", "--json", "number,isDraft,autoMergeRequest,statusCheckRollup,updatedAt,createdAt")
    if rc: return
    waiting = waiting_reviews(json.loads(out), now)
    act = orch_decision(state, waiting, _orch, now)
    if act == "reset":
        _orch.update(nudged=0.0, first=0.0); return
    if act == "nudge":
        if not _orch["first"]: _orch["first"] = now
        _orch["nudged"] = now
        tell(f"WATCHDOG (#225): you are idle while PRs wait for review: #{', #'.join(map(str, waiting))}. Review them now "
             f"(gh pr merge N --auto --squash after a PASS). Owner questions never stop your work.")
    elif act == "escalate":
        _orch["escalated"] = now
        try: R.run([R.HERDR_APP, "do", "terminal.pin", json.dumps({"terminal": d.get("address"), "pinned": True})], timeout=30)
        except Exception: pass
        R.gh("issue", "comment", str(OWNER_ISSUE), "--body",
             f"ESCALATION (watchdog #225): the orchestrator has been idle {int((now - _orch['first']) / 60)} min while PRs wait for review: "
             f"#{', #'.join(map(str, waiting))}. It was nudged and did not move. Open the orchestrator window (pinned in herdr).")
        log(f"orchestrator idle escalation: {waiting}")

def lock_tick(now=None):
    now = now or time.time()
    lk, info, alive = lock_state()
    if not info: _lock["key"] = None; return
    if not alive:
        a = lock_alarm(info, False, now)
        lk.path.unlink(missing_ok=True); log(a[1]); return
    if (now - info[2]) / 60 < LOCK_WARN_MIN: return
    key = (info[0], info[1])
    if _lock["key"] == key and now - _lock["sent"] < LOCK_REPEAT_MIN * 60: return
    a = lock_alarm(info, True, now, green_waiting())
    _lock.update(sent=now, key=key); tell(a[1])

_ai = {"running": False}
def ai_tick():
    """#171: hourly AI assessment for the dashboard, in a background thread (claude -p can take a minute)."""
    if _ai["running"] or not R.CFG.get("ai_model", "haiku"): return
    import dashboard; importlib.reload(dashboard)
    a = dashboard.ai_load()
    if a and time.time() - a.get("at", 0) < dashboard.AI_EVERY_MIN * 60: return
    _ai["running"] = True
    def work():
        try: dashboard.ai_tick(log)
        except Exception as e: log(f"ai assessment error: {e!r}")
        finally: _ai["running"] = False
    threading.Thread(target=work, daemon=True).start()

def trends_tick():
    """#155: hourly patterns over 24 h (repeated BLOCKED reasons, finish/fix rates); reloaded so merged fixes apply."""
    import trends; importlib.reload(trends); trends.tick(tell, log)

if __name__ == "__main__":
    main()
