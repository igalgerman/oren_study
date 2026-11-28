"""Watchdog: keeps the flow from getting stuck. Runs forever in the herdr window `watchdog` (started by tools/orchestrator.cmd).
Every minute it checks, deterministically:
  1. a worker/reviewer/intake window waiting for an answer (status blocked)  -> tells the orchestrator (once per new screen; also a worker whose last line is QUESTION:)
     and posts the question in the pinned issue 'Questions for the owner' (owner_q.py, #193; once per window+question); an owner reply there -> tells the orchestrator
  1b. every open owner question (qwin.py, #220/#368): python starts the Hebrew page (tools/ask) and reads its answer; at the same time an idle inbox/orchestrator session sends the phone push (#390); first answer wins, relayed
  2. a worker/reviewer that stopped without its RESULT:/VERDICT: line for 10 min -> tells the orchestrator
  3. free lanes + ready issues but no runner pass running                       -> starts a runner pass
  3b. a window waiting for the owner longer than park_minutes (the runner parks it itself; this is the fallback): issue gets blocked + ready-for-human, lane freed
  3c. owner lane: no intake window open + a needs-triage/needs-info issue -> opens ONE `intake-<n>` (oldest issue), `NEEDS YOU: intake-<n> is open`
  5. every observer_minutes: observer.py applies deterministic rules (make_ready, rerun, fix Blocked-by lines) within limits
  5b. every ai_observer_minutes (#203): ai_observer.py, ONE read-only headless Sonnet check in a thread, or the cloud task relay (#289); new findings -> the orchestrator
  5c. every tick (#262): an open PR that conflicts with main and has auto-merge or a review PASS -> a cloud resolve session (#289, conflicts.py)
  5c. #219 nightly.py: once a day at retro_hour ONE read-only headless Sonnet retro, or the cloud task relay (#289), + handoff (issue 'Daily retro <date>', handoff PR);
      batch trigger: tells the inbox to run /batch once a day, and early when >= 8 ready P2/P3 issues share a lane
  5d. #282 parked.py, once an hour: closed batch -> its open members get ready-for-agent back; a polish list at 5 notes or 24 h -> ready-for-agent P3;
      later/manual 2 h+ with no owner question, run, PR or future date -> 'parked without owner question: #n' to the orchestrator; night report at retro_hour
  5d. #280 stuck.py, every 10 min: an open issue with no live state (ready-for-agent, run, PR, open batch, owner question) for 6 h
      -> ONE 'STUCK ISSUES' note to the orchestrator (it pushes the owner); an owner question 4 h old -> one more push,
      24 h old -> its recommended option when it says 'skip is safe', else 'waiting for owner Nh' on the dashboard
  5e. #241 due.py, every 10 min: an open issue's 'Due: YYYY-MM-DD HH:MM' passed -> one 'Due reached' comment, the orchestrator told,
      label owner -> an owner question (popup)
  5d. #306 desks.py: keeps the two cloud sessions 'Oren inbox (cloud)' / 'Oren ask (cloud)' alive and every status_minutes
      writes the session links + dashboard.py --text into ONE pinned issue (edited in place, nothing committed)
  5d. #330 canary.py: every 6 h (and after a merge into tools/runner or tools/mods; #538: at most once per canary_minutes) ONE rolling canary issue runs the whole flow;
      a step past its deadline -> alarm to the orchestrator + inspector, NEEDS-ATTENTION on panel/dashboard; side paths hourly
  5f. #293 pcload.py, every 2 min: CPU / free RAM / heavy process counts; an overload -> alarm with the top 3 processes by RAM and who
      started them, to the orchestrator + inspector (once per 60 min per cause, sooner only when worse, #567); .runs/pc.json for the panel/dashboard. Never kills.
  5e. #187 once a week: tools/test_garden.py (test trim proposal: ONE issue 'Test trim proposal (week N)'; it never deletes a test)
  6. every sync_minutes: git pull --ff-only of the main checkout when clean (logs when it can't), so runner/watchdog/panel never run old code
  6b. #326 mainsync.py: behind 10+ min or skipped twice in a row -> alarm (orchestrator + inspector, names the dirty files);
     a sync that changed the panel mod -> /reload-plugins to the orchestrator, CLAUDE.md/ORCHESTRATOR.md/inbox prompt -> re-read (when idle)
  7. #304: a network error (sync, or a tick that raised a network/timeout error) is retried next tick and only logged + told to the
     orchestrator on the NET_ALARM-th in a row; nightly.prune_if_due removes .runs/<n> of issues closed > 24 h once a day
  4. the orchestrator window is gone                                           -> writes it in the log (the owner sees it in /status)
  4b. orchestrator / inbox / inspector terminal finished (#140)                -> removed by address and started again (recover.py commands)
  4c. #492 a finished run-/run-pass-/issue-/review-/resolve-/question- terminal 5+ min old -> removed by address (sweep_tick, no gh needed; first-seen times in .runs/sweep_seen.json survive a reload)
It never answers questions or presses keys in other windows; it only tells the orchestrator and starts the runner.
Usage: python watchdog.py [--once | --lock | --alarms-once]
"""
import argparse, calendar, hashlib, importlib, json, re, shutil, subprocess, sys, time, threading
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import ghauth     # #363: GitHub App token for the bots
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

def run_rows(ts):
    """#289: the live windows + one virtual live run-<n> per lane of the ONE poller (`lanes` window), which has no run-<n> window."""
    return R.with_lanes(ts)

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
                     + f": qwin (#220/#390) asks him on the Hebrew page and has an idle inbox/orchestrator session send the PushNotification; send one yourself only when it hands you a PHONE PUSH line. "
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

PASS_BACKOFF_S = 300   # #284: the same ready issues as the last start -> no new pass for 5 min (the pass started nothing for them)

def pass_decision(pass_held, key, last, now, backoff=PASS_BACKOFF_S):
    """Pure (#284): (start?, why). pass_held: a runner pass holds the 'pass' lock; key: the ready issue numbers;
    last: {'ts', 'key'} of the watchdog's last start or None."""
    if pass_held: return False, "a runner pass is running"
    if last and list(last.get("key") or []) == list(key) and now - float(last.get("ts", 0)) < backoff:
        return False, f"back off: same ready issues {list(key)} as the pass started {int(now - float(last['ts']))}s ago"
    return True, ""

def last_pass_start():
    try: return json.loads((R.RUNS / "pass_start.json").read_text(encoding="utf-8"))
    except (OSError, ValueError): return None

def note_pass_start(key, now):
    R.RUNS.mkdir(parents=True, exist_ok=True)
    (R.RUNS / "pass_start.json").write_text(json.dumps({"ts": now, "key": list(key)}), encoding="utf-8")

def check_lanes(ts):
    import freeze
    if freeze.is_frozen(R.RUNS): return     # #139: frozen, start no runner pass
    if any((t.get("name") or "").startswith("run-pass") and t.get("state") == "live" for t in ts): return
    rc, out = R.gh("issue", "list", "--state", "open", "--limit", "200", "--json", "number,labels,createdAt,updatedAt,title,body")
    if rc: return
    issues = [{**i, "labels": [l["name"] for l in i["labels"]]} for i in json.loads(out)]
    ready = [i for i, _ in R.pass_now(issues)]     # #279: the pass's own lane check; no free lane -> no pass (and no gh call of it)
    if not ready: return
    key, now = tuple(sorted(i["number"] for i in ready)), time.time()
    ok, why = pass_decision(R.FileLock("pass").held_by_other(), key, last_pass_start(), now)   # #284/#250: one pass alive at a time
    if not ok: return
    note_pass_start(key, now)
    orch = R.hc_json("get", "orchestrator", "--json").get("address", "")
    name = f"run-pass-{int(time.time()) % 100000}"
    rc, out = R.run(R.pass_cmd(name, orch), timeout=60)   # #279: notify off; the pass tells the orchestrator only when it started/blocked something
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
    import recover
    prompt = (f"/grill-me issue #{n} (python3 tools/runner/view.py issue {n}: trusted authors only), then /to-tickets for what comes out of it, "
              f"then close #{n} with links to the new tickets. Every ticket gets an '## Acceptance' section before ready-for-agent: 3-7 checkable points "
              f"+ the tests that prove them, and 'Out of scope' (#186). If #{n} is only waiting because it has no Acceptance section, "
              f"skip the grilling: write that section into #{n}'s body. " + recover.TRIAGE_STEPS)
    cmd = [R.HC, "run", "--bg", "--outlive-parent", *R.space_args(), "--name", name, "--cwd", R.CFG.get("main_checkout", str(R.ROOT)),
           "--label", f"issue={n}", "--label", "role=intake", shutil.which("claude") or "claude", R.argv_prompt(name, prompt)]
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

# ---------- #492: finished lane terminals go 5 min after they finished, even when GitHub can't be read ----------
SWEEP_RE = re.compile(r"^(run|issue|review|resolve|question)-")   # run-pass-* too; never control windows
SWEEP_MIN = 5
SWEEP_SEEN = R.RUNS / "sweep_seen.json"   # address -> first time seen finished; on disk, so a reload of this file keeps it

def _load_seen():
    try: return json.loads(SWEEP_SEEN.read_text(encoding="utf-8"))
    except (OSError, ValueError): return {}

def _save_seen(seen):
    try: R.RUNS.mkdir(parents=True, exist_ok=True); SWEEP_SEEN.write_text(json.dumps(seen), encoding="utf-8")
    except OSError: pass

def finished_old(ts, seen, now, min_age=SWEEP_MIN):
    """Pure: [(name, address)] of finished/exited lane terminals first seen finished min_age+ min ago. Updates seen."""
    import recover
    out, fin = [], set()
    for t in ts:
        a, name = t.get("address"), t.get("name") or ""
        if not a or t.get("state") not in recover.FINISHED or not SWEEP_RE.match(name): continue
        fin.add(a)
        t0 = t["finished_ms"] / 1000 if t.get("finished_ms") else seen.setdefault(a, now)   # herdr's own finish time when given
        if now - t0 >= min_age * 60: out.append((name, a))
    for a in [a for a in seen if a not in fin]: seen.pop(a)
    return out

def sweep_tick(ts, now=None, seen=None, hc=None, say=None):
    """#492: rm (by address) the finished lane terminals; one log line with the count, none when 0. -> count."""
    disk = seen is None
    seen = _load_seen() if disk else seen
    hc, say = hc or R.hc, say or log
    gone = [(n, a) for n, a in finished_old(ts, seen, now or time.time()) if hc("rm", a, timeout=30)[0] == 0]
    for _, a in gone: seen.pop(a, None)
    if disk: _save_seen(seen)
    if gone: say(f"sweep: removed {len(gone)} finished terminal(s) older than {SWEEP_MIN} min: " + " ".join(n for n, _ in gone[:20]))
    return len(gone)

def check_control(ts):
    """#140: a finished orchestrator / inbox / inspector terminal is removed (by address) and started again, same command as recover."""
    import recover
    for name, address in recover.finished_control(ts):
        R.hc("rm", address, timeout=30)
        rc = recover.start_control(R, name)
        log(f"{name} had finished: restarted (rc {rc})")
        if rc == 0 and name != "orchestrator": tell(f"WATCHDOG: {name} had finished; restarted it")

def qwin_tick(ts):
    import qwin; importlib.reload(qwin); qwin.tick(ts)   # #220/#390: page + phone push per open owner question

def resume_tick():
    for n in R.resume_answered(): log(f"#{n}: owner answered the cloud question -> unparked, the next pass resumes its session (#135)")

def observer_tick():
    import observer; observer.run_if_due()      # acting observer (observer.py)

def ai_observer_tick():
    import ai_observer; ai_observer.run_if_due(tell, log)   # #203: hourly AI check (thread; its never-two guard survives a reload)

def nightly_tick():
    import nightly   # #219 (its never-two guard survives a reload, #345)
    nightly.retro_if_due(tell, log)
    nightly.batch_tick(lambda t: R.hc("send", "inbox", t, timeout=30)[0], log)
    nightly.prune_if_due(log)   # #304
    nightly.playlog_if_due(log)   # #641: yesterday's play events -> ~/.oren/playlog/<day>.json (private)
    nightly.worktrees_if_due(log)   # #326: helper worktrees whose branch is pushed and merged/closed
    nightly.night_report_if_due(tell, log)   # #282

def parked_tick():
    """#282, once an hour: orphaned batch members / due polish lists get ready-for-agent; parked later/manual -> the orchestrator."""
    import parked
    parked.tick(tell=tell, log=log)

def issues_stuck_tick():
    """#280: no issue sits without a live state; owner questions re-pushed at 4 h, the 24 h rule."""
    import stuck
    stuck.tick(tell=tell, log=log)
def due_tick():
    """#241, every 10 min: a passed 'Due:' line in an open issue -> one 'Due reached' comment + the orchestrator (+ owner popup)."""
    import due
    due.tick(tell=tell, log=log)

def canary_tick():
    import canary; canary.tick(say=lambda t: (tell(t), R.hc("send", "inspector", t, timeout=30)), log=lambda m: log("canary: " + m))   # #330

def pc_tick(ts):
    import pcload; pcload.tick(ts, send=lambda w, m: R.hc("send", w, m, timeout=30), log=log)   # #293: reports only, never kills

def desks_tick():
    import desks; desks.run_if_due(log)   # #306: cloud inbox + ask sessions, pinned links + live status (thread; its never-two lock survives a reload)

# ---------- #304: network errors retry next tick, alarm only after NET_ALARM in a row ----------
NET_ALARM = 3
NET_RE = re.compile(r"could not resolve host|unable to access|failed to connect|connection (?:timed out|refused|reset)|"
                    r"network is unreachable|temporary failure in name resolution|TimeoutExpired|timed out", re.I)
_net = {}   # key -> network errors in a row

def is_net_error(msg):
    """Pure: True when a message looks like a passing network/timeout error."""
    return bool(NET_RE.search(msg or ""))

def net_streak(streaks, key, msg):
    """(#304) -> (errors in a row, alarm now?). A network error counts up (alarm exactly at NET_ALARM); anything else resets."""
    streaks[key] = streaks.get(key, 0) + 1 if is_net_error(msg) else 0
    return streaks[key], streaks[key] == NET_ALARM

def net_alarm(what, msg):
    text = f"network error {NET_ALARM} in a row ({what}): {msg[:200]}"
    log(text); tell("WATCHDOG: " + text)

SYNC_MIN = int(R.CFG.get("sync_minutes", 3))
_sync = {"last": 0.0, "msg": ""}

def sync_tick():
    """Every SYNC_MIN minutes fast-forward the main checkout; log changes of state only. Network errors: retried next tick (#304).
    #326 (mainsync.py): every tick queued reload sends go to idle sessions; after each sync the behind/skip alarm (orchestrator +
    inspector, names the dirty files) and, after a pull, /reload-plugins and re-read messages are queued."""
    import mainsync
    mainsync.deliver_tick(log)
    if time.time() - _sync["last"] < SYNC_MIN * 60: return
    _sync["last"] = time.time()
    info = {}
    msg = R.sync_main(info=info)
    mainsync.after_sync(info, time.time(), say=lambda t: (tell(t), R.hc("send", "inspector", t, timeout=30)), log=log)
    k, alarm = net_streak(_net, "sync", msg)
    if k:
        _sync["last"] = 0.0
        if alarm: net_alarm("sync", msg)
        return
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
    _alarm["finish"] = finish                                                     # #376: pick_alarms compares the rate
    return idle_alarms(issues, json.loads(out2), now, _alarm["free_since"], R.total_lanes(), finish) + cloud_stuck_alarms(cloud, now, float(R.CFG.get("stuck_hours", 2)))

FINISH_EVERY_H, FINISH_DROP = 6, 5   # #376: finish-rate alarm at most once per 6 h, sooner only if the rate drops 5+ points
FINISH_STATE = R.RUNS / "finish_alarm.json"   # on disk: a watchdog restart must not resend it

def load_finish_state(path=None):
    try: return json.loads(Path(path or FINISH_STATE).read_text(encoding="utf-8"))
    except (OSError, ValueError): return {}

def save_finish_state(st, path=None):
    try: Path(path or FINISH_STATE).write_text(json.dumps(st), encoding="utf-8")
    except OSError as e: log(f"finish alarm state not saved: {e!r}")

def pick_alarms(al, sent, fin, finish, now):
    """Pure (#376): -> (texts to send, new sent, new fin). Every alarm is keyed by kind/PR (hourly); the 'finish' alarm
    (its text changes every pass) also needs FINISH_EVERY_H since the last one or a drop of FINISH_DROP+ points (fin = {ts, pct})."""
    sent, fin, new = dict(sent), dict(fin), []
    done, started = finish
    pct = 100 * done / started if started else 0
    for k, t in al:
        if k == "finish":
            if fin and now - fin.get("ts", 0) < FINISH_EVERY_H * 3600 and fin.get("pct", 0) - pct < FINISH_DROP: continue
            fin = {"ts": now, "pct": pct}
        elif now - sent.get(k, 0) < ALARM_EVERY_MIN * 60: continue
        else: sent[k] = now
        new.append(t)
    return new, sent, fin

def alarm_tick():
    """Every 10 min: idle alarms to the orchestrator (+ watchdog.log); the same alarm at most once an hour (finish: #376)."""
    now = time.time()
    if now - _alarm["last"] < 600: return
    _alarm["last"] = now
    al = alarms_once(now) or []
    fin = load_finish_state()
    new, _alarm["sent"], fin2 = pick_alarms(al, _alarm["sent"], fin, _alarm.get("finish", (0, 0)), now)
    if fin2 != fin: save_finish_state(fin2)
    if new: tell("IDLE ALARM (watchdog): " + " · ".join(new))

KEEP = ()   # #345: empty; the never-two guards (observer/ai_observer/nightly `_running`, desks `_busy`) survive a reload

def local_modules(here=None):
    """#300: names of the loaded modules that live in tools/runner (except watchdog itself / __main__)."""
    here = Path(here or HERE).resolve(); out = []
    for n, m in list(sys.modules.items()):
        f = getattr(m, "__file__", None)
        if n in ("__main__", "watchdog") or not f: continue
        try:
            if Path(f).resolve().parent == here: out.append(n)
        except OSError: pass
    return sorted(out)

def _imports(path):
    """Local-looking module names a file imports (top level and inside functions)."""
    import ast
    try: tree = ast.parse(Path(path).read_text(encoding="utf-8", errors="replace"))
    except (OSError, SyntaxError, ValueError): return set()
    out = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import): out |= {a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module and not node.level: out.add(node.module.split(".")[0])
    return out

def dep_order(names, here=None):
    """#300: names sorted so a module comes after the local modules it imports (cycles: file order)."""
    here, names, done, seen = Path(here or HERE), list(names), [], set()
    def visit(n):
        if n in seen: return
        seen.add(n)
        for d in sorted(_imports(here / f"{n}.py")):
            if d in names and d != n: visit(d)
        done.append(n)
    for n in names: visit(n)
    return done

def reload_all(log, here=None, keep=KEEP):
    """#300: reload every loaded tools/runner module (not `keep`) in dependency order. Raises on a failed reload
    (the caller keeps the old stamps, so the next tick retries). -> the names reloaded."""
    order = [n for n in dep_order(local_modules(here), here) if n not in keep]
    for n in order:
        t = _mtime(sys.modules[n])                    # read before the reload: a write during it is seen next tick
        importlib.reload(sys.modules[n]); sys.modules[n]._loaded_mtime = t
    if order: log("reloaded " + ", ".join(f"{n}.py" for n in order))
    return order

def _mtime(m):
    try: return Path(m.__file__).stat().st_mtime
    except (OSError, TypeError, AttributeError): return None

def fresh(log, here=None, keep=KEEP):
    """#300 (reopened): at the start of EVERY tick: a loaded tools/runner module older than its file (or never stamped)
    -> reload_all. In the tick, not only in loop(): a running loop() never picks up its own new code, so a watchdog
    started before a fix kept stale stats/remote forever. -> the names reloaded."""
    if all(getattr(sys.modules[n], "_loaded_mtime", None) == _mtime(sys.modules[n])
           for n in local_modules(here) if n not in keep): return []
    return reload_all(log, here, keep)

def stamps(here=None):
    """#300: mtime of every .py in tools/runner (a merge touches several at once)."""
    out = {}
    for f in Path(here or HERE).glob("*.py"):
        try: out[f.name] = f.stat().st_mtime
        except OSError: pass
    return out

def reload_self(W):
    """Load the newest watchdog.py (main() runs as __main__ the first time)."""
    return importlib.reload(W) if W.__name__ == "watchdog" else importlib.import_module("watchdog")

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

def loop(once):
    log("watchdog started")
    W = sys.modules[__name__]
    st, seen = stamps(), set()                # #345: the per-file stamps of the LAST clean reload
    while True:
        try:
            now = stamps()
            if now != st:                     # #300: a merged fix (any tools/runner file): reload ALL, in dependency order, then watchdog.py
                reload_all(log)
                W = reload_self(W); log("reloaded watchdog.py")
                st = now                      # only after a clean reload: a failed one is retried next tick
            W.tick()
            _net["tick"] = 0
        except AttributeError as e:           # #345: log once; no forced reload (that looped every tick); a real file change reloads
            if repr(e) not in seen: seen.add(repr(e)); log(f"error: {e!r}")
        except Exception as e:
            k, alarm = net_streak(_net, "tick", repr(e))   # #304: a passing network/timeout error: quiet until NET_ALARM in a row
            if alarm: net_alarm("tick", f"error: {e!r}")
            elif not k: log(f"error: {e!r}")
        if once: return
        time.sleep(EVERY)

STEP_ERR_EVERY_S = 3600
_step_err = {}     # (step name, error text) -> last time logged (#445)

def step(name, fn, *a, now=None, **k):
    """#445: run one tick step; an exception is logged once per error text per hour and the tick goes on. -> fn's value or None."""
    try: return fn(*a, **k)
    except Exception as e:
        now, key = now or time.time(), (name, repr(e))
        if now - _step_err.get(key, -STEP_ERR_EVERY_S) >= STEP_ERR_EVERY_S:
            _step_err[key] = now; log(f"step {name} failed: {e!r}")
        return None

def tick():
    """One watchdog pass (main() calls it on the newest loaded copy of this file). #365: every call inside is bounded (R.tick_mode).
    #445: every step runs through step(), so one failing step never skips the later ones."""
    with R.tick_mode():
        try: (R.RUNS / "watchdog.beat").write_text(str(int(time.time())), encoding="utf-8")   # #171: liveness for the dashboard
        except OSError: pass
        step("fresh", fresh, log)            # #300: never run a step against a module older than its file
        step("ghcache_tick", ghcache_tick)   # #329: the ONE GitHub reader (every reader below uses its cache)
        ts = step("windows", windows) or []
        step("check_windows", check_windows, ts)
        step("answers_tick", OQ.answers_tick, tell)
        step("qwin_tick", qwin_tick, ts)
        step("resume_tick", resume_tick)
        step("check_lanes", check_lanes, ts)
        step("check_intake", check_intake, ts)
        all_ts = (step("all_windows", R.hc_json, "ls", "--all", "--json") or {}).get("terminals", []) or ts
        step("check_control", check_control, all_ts)
        step("cleanup", cleanup, all_ts)
        rts = step("run_rows", run_rows, ts) or ts   # #289: + the ONE poller's cloud lanes as virtual run-<n> rows
        step("sweep_tick", sweep_tick, all_ts)  # #492
        step("reap_tick", reap_tick, ts)       # #248 (a virtual run ends itself when its issue closes)
        step("stuck_tick", stuck_tick, rts)
        step("net_due_tick", net_due_tick, rts) # #364
        step("conflicts_tick", conflicts_tick, rts)  # #262
        step("pc_tick", pc_tick, ts)                # #293
        for name, fn in (("observer_tick", observer_tick), ("ai_observer_tick", ai_observer_tick), ("nightly_tick", nightly_tick),
                         ("parked_tick", parked_tick), ("due_tick", due_tick), ("garden_tick", garden_tick),   # #282 #241 #187
                         ("issues_stuck_tick", issues_stuck_tick), ("desks_tick", desks_tick), ("canary_tick", canary_tick),   # #280 #330
                         ("sync_tick", sync_tick), ("alarm_tick", alarm_tick), ("trends_tick", trends_tick), ("ai_tick", ai_tick), ("usage_tick", usage_tick), ("usage_alarm_tick", usage_alarm_tick),
                         ("lock_tick", lock_tick), ("orch_idle_tick", orch_idle_tick)):
            step(name, fn)

# ---------- #262: a green/approved PR that conflicts with main gets a resolve run by itself ----------
def resolve_start(a, launch=None):
    """#289: one resolve round = a CLOUD session on the PR's branch (remote.launch: returns at once, no local worker or worktree).
    Window resolve-<n> only lives while `claude --cloud` creates the session; conflicts.py waits RESOLVE_WAIT_MIN per round."""
    import remote
    launch = launch or remote.launch
    s = launch(a["n"], R.remote_resolve_prompt(a["n"], [], a["branch"]), R.CFG.get("main_checkout", str(R.ROOT)), name=f"resolve-{a['n']}")
    if s.get("ok"): R.stat(a["n"], "", "resolve", by="watchdog", round=a["round"], where="remote")
    return bool(s.get("ok"))

def conflicts_tick(ts):
    import conflicts
    def start(a):
        ok = resolve_start(a)
        log(f"#262 PR #{a['pr']} conflicts with main: " + (f"cloud resolve round {a['round']} started" if ok else f"could not start the cloud resolve for #{a['n']}"))
        return ok
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

NET_EVERY_S = 300
_netq = {"at": 0.0}

def net_tick(ts, now=None, gh=None, hc=None, say=None, events=None, find_pr=None):
    """#364 safety net: a live run-<n> that waits on its worker (stats phase start/review_fix) while its PR has been quiet
    R.NET_QUIET_MIN+ min with no VERDICT -> kill the run window, store 'resume at review' (#264 path) and give the issue
    back to the queue (the next pass starts the review, no new worker). Once per PR head. -> [n]."""
    import stats
    now, gh, hc, say = now or time.time(), gh or R.gh, hc or R.hc, say or tell
    events = stats.read_events(R.RUNS / "stats.jsonl") if events is None else events
    find_pr = find_pr or R.find_pr
    done = []
    for t in ts:
        m = re.match(r"^run-(\d+)$", t.get("name") or "")
        if not m or t.get("state") != "live" or not (t.get("address") or t.get("virtual")): continue
        n = int(m.group(1))
        phase = R.run_phase(events, n)
        if phase not in ("start", "review_fix"): continue
        pr = find_pr(n)
        if not pr: continue
        rc, out = gh("pr", "view", str(pr), "--json", "number,state,isDraft,mergeable,headRefOid,createdAt,commits,comments")
        try: pj = json.loads(out) if rc == 0 else {}
        except ValueError: continue
        if not R.net_due(pj, phase, now): continue
        mark = R.RUNS / str(n) / "net_head"
        try:
            if mark.read_text(encoding="utf-8").strip() == pj.get("headRefOid", ""): continue
        except OSError: pass
        if t.get("virtual"):
            import lanes; lanes.stop(R.RUNS, n)       # #289: a lane of the ONE poller: its wait loop ends the run
        else: hc("kill", t["address"], timeout=30)
        R.set_resume(n, "review")
        mark.write_text(pj.get("headRefOid", ""), encoding="utf-8")
        gh("issue", "edit", str(n), "--remove-label", "in-progress", "--add-label", "ready-for-agent")
        gh("issue", "comment", str(n), "--body", f"Runner (watchdog #364): PR #{pr} quiet {R.NET_QUIET_MIN}+ min with no VERDICT while the run "
           "still waited on its worker; the run is ended and the next pass resumes at review (no new worker).")
        log(f"#364 run-{n}: PR #{pr} quiet, no VERDICT -> resume at review")
        say(f"WATCHDOG (#364): run-{n} waited on a quiet PR #{pr}; resumed at review")
        done.append(n)
    return done

def net_due_tick(ts, now=None):
    now = now or time.time()
    if now - _netq["at"] < NET_EVERY_S: return []
    _netq["at"] = now
    return net_tick(ts, now)

def run_mtime(n):
    """Newest change in .runs/<n> (the dir and its files); None when there is no such dir."""
    d = R.RUNS / str(n)
    try: return max([d.stat().st_mtime] + [f.stat().st_mtime for f in d.iterdir()])
    except OSError: return None

def stuck_runs(ts, mtimes, now, stuck_hours, st, held=None):
    """Pure (#248): -> (alarms [(n, text)], stuck_lanes [n]). First alarm when .runs/<n> is unchanged for stuck_hours; if it is STILL
    unchanged STUCK_AGAIN_MIN later: reported again once, and counted as a stuck lane (until it moves or the window is gone).
    #521: held = issue numbers still labelled in-progress (None = unknown): a run whose issue lost it was requeued -> dropped."""
    live = {int(m.group(1)) for t in ts if t.get("state") == "live" for m in [re.match(r"^run-(\d+)$", t.get("name") or "")] if m}
    if held is not None: live &= set(held)
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

def in_progress_nums():
    """#521: open issues labelled in-progress (from the gh cache); None when GitHub can't be read (then nothing is dropped)."""
    rc, out = R.gh("issue", "list", "--state", "open", "--label", "in-progress", "--limit", "200", "--json", "number")
    try: return None if rc else {int(i["number"]) for i in json.loads(out or "[]")}
    except (ValueError, KeyError, TypeError): return None

def stuck_tick(ts, now=None):
    now = now or time.time()
    nums = [int(m.group(1)) for t in ts if t.get("state") == "live" for m in [re.match(r"^run-(\d+)$", t.get("name") or "")] if m]
    held = in_progress_nums() if nums else None
    alarms, lanes = stuck_runs(ts, {n: run_mtime(n) for n in nums}, now, float(R.CFG.get("stuck_hours", 2)), _stuck, held)
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
OWNER_ONLY = ("owner-merge", "no-automerge")   # #542: only the owner merges these PRs -> never a review nudge
OWNER_MERGE_NOTE_H = 12                         # #542: an owner-merge PR open this long -> ONE owner note (owner_q, Telegram too)

def _labels(p):
    return {l.get("name") if isinstance(l, dict) else l for l in p.get("labels") or []}

def owner_merge_due(prs, now):
    """Pure (#542): open PRs labelled owner-merge, open >= OWNER_MERGE_NOTE_H -> [(number, title)]."""
    return sorted((p["number"], p.get("title") or "") for p in prs
                  if "owner-merge" in _labels(p) and _age_min(p.get("createdAt"), now) >= OWNER_MERGE_NOTE_H * 60)

def waiting_reviews(prs, now):
    """Pure: open non-draft PRs, all checks green, no auto-merge yet, open >= ORCH_WAIT_MIN -> [numbers] (they wait for a review)."""
    out = []
    for p in prs:
        if p.get("isDraft") or p.get("autoMergeRequest") is not None or _labels(p) & set(OWNER_ONLY): continue
        checks = p.get("statusCheckRollup") or []
        if not checks or not all((c.get("conclusion") or c.get("status")) in ("SUCCESS", "SKIPPED", "NEUTRAL") for c in checks): continue
        t = _age_min(p.get("updatedAt") or p.get("createdAt"), now)
        if t >= ORCH_WAIT_MIN: out.append(p["number"])
    return sorted(out)

def run_owned(prs, ts, parked=frozenset(), locked=frozenset()):
    """Pure (#471): -> {PR numbers} whose issue has a LIVE run-<n> window that is not parked (issue labelled blocked).
    Such a PR is the runner's (it reviews and merges it): the #225 nudge must not send the orchestrator to it (race #464/#245/#302).
    PR -> issue: branch lane/<n>, or the body says Fixes/Closes/Refs #n (cloud claude/* branches)."""
    import remote
    live = {int(m.group(1)) for t in ts if t.get("state") == "live" for m in [re.match(r"^run-(\d+)$", t.get("name") or "")] if m}
    live |= set(locked)                                  # #765: cloud runs have no run-<n> window: a held issue-<n>.lock is a live run too
    live -= set(parked)
    out = set()
    for p in prs:
        m = re.match(r"^lane/(\d+)$", p.get("headRefName") or "")
        if (m and int(m.group(1)) in live) or any(remote.fixes(p.get("body"), n) for n in live): out.add(p["number"])
    return out

def locked_issues():
    """#765: issue numbers whose issue-<n>.lock is held by a live pid (the shared lanes poller holds them for cloud runs)."""
    out = set()
    for f in R.RUNS.glob("issue-*.lock"):
        m = re.match(r"^issue-(\d+)\.lock$", f.name)
        if m and R.FileLock(f"issue-{m.group(1)}").held_by_other(): out.add(int(m.group(1)))
    return out

def orch_decision(state, waiting, st, now):
    """Pure: -> 'reset' | 'nudge' | 'escalate' | None. state = orchestrator terminal state; st = _orch-like dict."""
    idle = state in ("done", "idle", "blocked")
    if not idle or not waiting: return "reset"
    if st["first"] and now - st["first"] >= ORCH_ESCALATE_MIN * 60 and now - st["escalated"] >= ORCH_ESCALATE_EVERY_H * 3600:
        return "escalate"
    if now - st["nudged"] >= ORCH_NUDGE_EVERY_MIN * 60: return "nudge"
    return None

def orch_idle_tick(now=None, ts=None):
    now = now or time.time()
    d = R.hc_json("get", "orchestrator", "--json") or {}
    stt = d.get("status") or {}
    state = stt.get("state") if isinstance(stt, dict) else stt
    rc, out = R.gh("pr", "list", "--state", "open", "--json", "number,title,labels,isDraft,autoMergeRequest,statusCheckRollup,updatedAt,createdAt,headRefName,body")
    if rc: return
    prs = json.loads(out)
    for n, title in owner_merge_due(prs, now):                       # #542: same window+question -> owner_q posts it only once
        OQ.post(f"#{n}", f"PR #{n} waits for your merge: {title}")
    if not d or d.get("state") != "live": return                      # gone/finished: the #140 restart check handles it
    rc2, out2 = R.gh("issue", "list", "--state", "open", "--label", "blocked", "--limit", "200", "--json", "number")
    try: parked = {i["number"] for i in json.loads(out2)} if rc2 == 0 else set()
    except (ValueError, KeyError, TypeError): parked = set()
    owned = run_owned(prs, windows() if ts is None else ts, parked, locked_issues())   # #471: a live run reviews/merges its own PR
    waiting = [n for n in waiting_reviews(prs, now) if n not in owned]
    act = orch_decision(state, waiting, _orch, now)
    if act == "reset":
        _orch.update(nudged=0.0, first=0.0); return
    if act == "nudge":
        if not _orch["first"]: _orch["first"] = now
        _orch["nudged"] = now
        tell(f"WATCHDOG (#225): you are idle while PRs wait for review: #{', #'.join(map(str, waiting))}. Review them now "
             f"(python tools/runner/merge.py N after a PASS, never gh pr merge, #636). Owner questions never stop your work.")
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

_GH_BUSY = threading.Event()
def ghcache_tick(start=None):
    """#329: refresh .runs/gh_cache.json (one batched GraphQL query) in a thread: a slow or rate-limited GitHub never holds the tick.
    Never two at once; skipped when the cache is younger than 50 s."""
    import ghcache
    c = ghcache.load()
    if _GH_BUSY.is_set() or (c and time.time() - c.get("ts", 0) < 50): return False
    _GH_BUSY.set()
    def work():
        owner = (lambda cmd: R.run(cmd, env={ghauth.OWNER: "1"}, timeout=120)) if ghauth.app_cfg(R.CFG) else None   # #363: owner budget too
        try: ghcache.refresh(lambda cmd: R.run(cmd, timeout=120), run_owner=owner)
        except Exception as e: log(f"gh cache refresh failed: {e}"[:300])      # old cache stays; readers fall back to gh when it is stale
        finally: _GH_BUSY.clear()
    (start or (lambda f: threading.Thread(target=f, daemon=True).start()))(work)
    return True

def garden_tick():
    """#187, once a week: the test gardener (its own process; it opens/updates ONE 'Test trim proposal' issue, never deletes a test)."""
    if R.DRY: return
    sys.path.insert(0, str(HERE.parent))
    import test_garden
    try:
        if test_garden.run_if_due(R.RUNS / "garden.last"): log("test gardener started (weekly, #187)")
    except OSError as e: log(f"test gardener could not start: {e!r} (next try in a week; run python3 tools/test_garden.py by hand)")

_usage = {"last": 0.0}
def usage_tick():
    """#708: every 30 min the per-entity usage table (.runs/usage_by_entity.json) + ENTITY alarms (watchdog tell + Telegram, once per entity per 3 h)."""
    if time.time() - _usage["last"] < 1800: return
    _usage["last"] = time.time()
    import usage_entities; importlib.reload(usage_entities); usage_entities.tick(tell, log)

_ualarm = {"last": 0.0}
def usage_alarm_tick():
    """#710: every 5 min the usage alarms (UNDERUSE, IDLE, BEHIND, OVERUSE, STALE, PLAN CHANGED): watchdog tell + Telegram, once per rule per 3 h."""
    if time.time() - _ualarm["last"] < 300: return
    _ualarm["last"] = time.time()
    import usage_alarms; importlib.reload(usage_alarms); usage_alarms.tick(tell, log)

def trends_tick():
    """#155: hourly patterns over 24 h (repeated BLOCKED reasons, finish/fix rates); reloaded so merged fixes apply."""
    import trends; importlib.reload(trends); trends.tick(tell, log)

if __name__ == "__main__":
    main()
