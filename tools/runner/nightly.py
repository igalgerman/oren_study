"""#219 nightly jobs, run by the watchdog (everything automatic, nothing for the owner to type).
1. Retro + handoff: once a day at retro_hour (config.toml, default 23, 0 = off) ONE background headless
   `claude -p --model sonnet --no-session-persistence` (read-only tools, 15 min timeout, never two at once) follows
   docs/agents/skills/retro.md over the DAY (runner/watchdog logs, stats.jsonl, trends summary, ai_observer.last, tails of the
   orchestrator/inspector transcripts) and docs/agents/skills/handoff.md. Python then:
   - opens ONE issue 'Daily retro <date>' (labels retro, P2) with at most 7 ranked proposals, each tied to evidence
     (proposals without evidence are dropped). Nothing is applied; the orchestrator turns accepted ones into tickets.
   - refreshes the UPDATE section of INSPECTOR_HANDOFF.md (config inspector_handoff, outside the repo)
   - refreshes the '## Handoff (nightly)' section of ORCHESTRATOR.md through a PR on branch nightly/handoff-<date> (never a direct push).
2. Batch trigger: tells the inbox to run /batch once a day, and early when >= BATCH_MIN P2/P3 ready, unbatched issues share a lane.
3. Night report (#282): once a day at retro_hour, every open issue that is not ready-for-agent with its reason (parked.py); none = ALARM.
4. Prune (#304): once a day removes .runs/<n> of issues closed > PRUNE_HOURS (stats.jsonl and other root files stay).
#289: `retro_where = "cloud"` (default): step 1's Claude part runs as a nightly CLOUD scheduled task (docs/agents/cloud-tasks.md,
the subscription, no claude on the PC); it opens 'Daily retro <date>' itself with the RETRO lines and both HANDOFF sections.
From retro_hour on the watchdog looks for that issue (every RELAY_MIN) and only writes the two handoffs; none MISSING_H h
after retro_hour -> one note to the orchestrator. "local" = the old headless run here.
Usage: python tools/runner/nightly.py retro   (one local retro run now)
"""
import base64, calendar, json, re, shutil, subprocess, sys, threading, time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import runner as R

STATE = R.RUNS / "nightly.state.json"
MAX_PROPOSALS, TIMEOUT_S, MODEL = 7, 900, "sonnet"
TOOLS = ["Read", "Grep", "Glob", "Bash(gh issue list:*)", "Bash(gh issue view:*)", "Bash(gh pr list:*)", "Bash(gh pr view:*)", "Bash(git log:*)"]
RUN = subprocess.run         # tests swap in a fake claude
GH = R.run                   # tests swap in a fake gh (argv list -> (rc, out))
_running = globals().get("_running") or {"v": False}   # #345: kept across a reload (a thread may be running)
_batch_chk = {"at": 0.0}  # the issue list is read at most every BATCH_CHECK_MIN
BATCH_CHECK_MIN = 30
ORCH_HEADING, INSPECTOR_HEADING = "## Handoff (nightly)", "## UPDATE"
BATCH_MIN, BATCH_EARLY_H = 8, 6
PRUNE_HOURS = 24
LANES = ("core", "pack", "review")

PROMPT = """You are the NIGHTLY RETRO of the Oren study automatic flow ({date}). Read-only: you change NOTHING.
Follow docs/agents/skills/retro.md for the DAY below, then docs/agents/skills/handoff.md for the two handoffs. Repo: {repo}.
Every proposal must point to a concrete moment (a log line, an issue #n, a time HH:MM). No evidence -> leave it out.
Output exactly this, nothing else:
RETRO: <proposal, one line> | EVIDENCE: <log line / #n / HH:MM>
(at most {max} RETRO lines, most valuable first; none when there is nothing real)
HANDOFF-INSPECTOR:
<short handoff for the next inspector session: state, open threads, what to watch>
HANDOFF-ORCHESTRATOR:
<short handoff for the next orchestrator session: state, open threads, what to do first>

--- runner.log (today) ---
{runner}
--- watchdog.log (today) ---
{watchdog}
--- stats.jsonl (today) ---
{stats}
--- trends (24 h) ---
{trends}
--- ai_observer.last ---
{observer}
--- orchestrator / inspector transcripts (tails) ---
{transcripts}
"""

# ---------- pure logic (test_nightly.py) ----------
def today_lines(text, date, n=150):
    """Lines of a log that start with this date (YYYY-MM-DD), last n."""
    return "\n".join([l for l in (text or "").splitlines() if l.startswith(date)][-n:]) or "(nothing today)"

def stats_today(text, since, n=150):
    out = []
    for l in (text or "").splitlines():
        try:
            if json.loads(l).get("ts", 0) >= since: out.append(l)
        except ValueError: pass
    return "\n".join(out[-n:]) or "(nothing today)"

def transcript_tail(text, n=30, width=300):
    """Pure: the last n user/assistant text messages of a Claude session .jsonl, one line each."""
    out = []
    for l in (text or "").splitlines():
        try: e = json.loads(l)
        except ValueError: continue
        if e.get("type") not in ("user", "assistant"): continue
        c = (e.get("message") or {}).get("content")
        t = c if isinstance(c, str) else " ".join(x.get("text", "") for x in (c or []) if isinstance(x, dict) and x.get("type") == "text")
        t = " ".join(t.split())
        if t: out.append(f"{e['type']}: {t[:width]}")
    return "\n".join(out[-n:])

def project_dir(path):
    """Claude's ~/.claude/projects folder name for a cwd (every non-alphanumeric character -> '-')."""
    return re.sub(r"[^A-Za-z0-9]", "-", str(path))

RETRO_RE = re.compile(r"^\s*[-*\d.]*\s*`?RETRO:\s*(.+?)\s*\|\s*EVIDENCE:\s*(.*?)`?\s*$", re.I)

def parse(out):
    """Pure -> (proposals [(text, evidence)] max 7, without-evidence dropped; inspector handoff; orchestrator handoff) or None (no markers)."""
    out = out or ""
    props = [(m[1].strip(), m[2].strip()) for m in map(RETRO_RE.match, out.splitlines()) if m and m[2].strip() and m[2].strip() not in ("-", "none", "n/a")]
    hi, ho = out.find("HANDOFF-INSPECTOR:"), out.find("HANDOFF-ORCHESTRATOR:")
    if hi < 0 and ho < 0 and not props: return None
    insp = out[hi + 18:ho if ho > hi else len(out)].strip() if hi >= 0 else ""
    orch = out[ho + 21:hi if hi > ho else len(out)].strip() if ho >= 0 else ""
    return props[:MAX_PROPOSALS], insp, orch

def models_line_now(now=None):
    """#717: the nightly MODELS: line (stats.jsonl + labels only, no Claude)."""
    try:
        import stats
        return stats.models_line(stats.models_data(stats.read_events(R.RUNS / "stats.jsonl"), stats.issue_labels(), now), now)
    except Exception as e: return f"MODELS: unavailable ({e!r})"

def retro_body(props, date):
    lines = [f"Nightly retro (#219) of {date}, following docs/agents/skills/retro.md. Ranked proposals, each with its evidence. "
             "Nothing was applied: the orchestrator turns the accepted ones into tickets.", ""]
    lines += [f"{i}. {p}\n   Evidence: {e}" for i, (p, e) in enumerate(props, 1)]
    return "\n".join(lines)

def replace_section(text, heading, body):
    """Pure: replace the section under `heading` (up to the next '## ' heading) with body; append it when missing."""
    new = f"{heading}\n{body.strip()}\n"
    lines = (text or "").splitlines(keepends=True)
    start = next((i for i, l in enumerate(lines) if l.rstrip() == heading), None)
    if start is None:
        return (text or "").rstrip("\n") + ("\n\n" if text and text.strip() else "") + new
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    return "".join(lines[:start]) + new + ("\n" + "".join(lines[end:]) if end < len(lines) else "")

def retro_due(now_struct, hour, last_day):
    """Pure: once per day, at or after retro_hour; hour 0 = off."""
    return hour > 0 and now_struct.tm_hour >= hour and time.strftime("%Y-%m-%d", now_struct) != last_day

def batchable(issues):
    """Pure: ready, unbatched P2/P3 issues by lane. issues: labels as names."""
    by = {}
    for i in issues:
        L = set(i["labels"])
        if "ready-for-agent" not in L or L & {"P0", "P1", "cloud", "in-progress", "blocked", "manual", "bug"}: continue
        if (i.get("title") or "").startswith("Batch:"): continue
        lane = next((l for l in LANES if l in L), None)
        if lane: by.setdefault(lane, []).append(i["number"])
    return by

def batch_due(by_lane, now, st):
    """Pure -> the message for the inbox, or None. Once a day; early (after BATCH_EARLY_H) when one lane holds >= BATCH_MIN."""
    day = time.strftime("%Y-%m-%d", time.localtime(now))
    full = {l: ns for l, ns in by_lane.items() if len(ns) >= BATCH_MIN}
    if st.get("batch_day") == day and not (full and now - st.get("batch_at", 0) >= BATCH_EARLY_H * 3600): return None
    why = ("; ".join(f"{len(ns)} ready P2/P3 issues in lane {l}" for l, ns in full.items()) if full else "daily batch check")
    return f"WATCHDOG: run /batch ({why}). Follow .claude/skills/batch and docs/agents/skills/to-tickets.md."

def prunable(names, closed, now, hours=None):
    """Pure (#304): numbers of the .runs/<n> dir names whose issue closed more than `hours` ago. closed: n -> closedAt epoch."""
    hours = PRUNE_HOURS if hours is None else hours
    return sorted(int(d) for d in names if d.isdigit() and int(d) in closed and now - closed[int(d)] > hours * 3600)

# ---------- side effects ----------
def load_state():
    try: return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception: return {}

def save_state(st):
    R.RUNS.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(st), encoding="utf-8", newline="\n")

def _read(p):
    try: return Path(p).read_text(encoding="utf-8", errors="replace")
    except OSError: return ""

def transcripts(now):
    """Tails of today's newest orchestrator/inbox (main checkout) and inspector (its parent folder) sessions."""
    root, mc = Path.home() / ".claude" / "projects", Path(R.CFG.get("main_checkout", str(R.ROOT)))
    out = []
    for cwd in (mc, mc.parent):
        files = sorted((root / project_dir(cwd)).glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
        for p in [f for f in files if now - f.stat().st_mtime < 86400][:2]:
            out.append(f"[{cwd} {p.name}]\n" + transcript_tail(_read(p)))
    return "\n".join(out) or "(none today)"

def trends_summary(now):
    try:
        import trends
        f, _ = trends.gather(now)
        return f["summary"] if f else "(unavailable)"
    except Exception as e: return f"(unavailable: {e!r})"

def build_prompt(now):
    date = time.strftime("%Y-%m-%d", time.localtime(now))
    return PROMPT.format(date=date, repo=R.REPO, max=MAX_PROPOSALS, runner=today_lines(_read(R.RUNS / "runner.log"), date),
                         watchdog=today_lines(_read(R.RUNS / "watchdog.log"), date), stats=stats_today(_read(R.RUNS / "stats.jsonl"), now - 86400),
                         trends=trends_summary(now), observer=_read(R.RUNS / "ai_observer.last").strip() or "(none)", transcripts=transcripts(now))

def command():
    return [shutil.which("claude") or "claude", "-p", "--model", MODEL, "--no-session-persistence",
            "--tools", "Read,Grep,Glob,Bash", "--allowedTools", *TOOLS]

def ask_claude(prompt):
    try:
        p = RUN(command(), input=prompt, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=TIMEOUT_S, cwd=str(R.ROOT), creationflags=R.no_window())
    except subprocess.TimeoutExpired: return False, f"timeout after {TIMEOUT_S // 60} min"
    except OSError as e: return False, f"could not start claude: {e!r}"
    if p.returncode: return False, f"claude exit {p.returncode}: {((p.stderr or '') + (p.stdout or '')).strip()[:200]}"
    return True, p.stdout or ""

def gh(*args):
    return GH(["gh", *args, "--repo", R.REPO]) if args[0] != "api" else GH(["gh", *args])

def open_retro_issue(props, date, log):
    title = f"Daily retro {date}"
    rc, out = gh("issue", "list", "--state", "all", "--search", f'"{title}" in:title', "--json", "number,title")
    if rc == 0 and any(i["title"] == title for i in json.loads(out or "[]")): log(f"retro: '{title}' exists"); return None
    gh("label", "create", "retro", "--color", "c5def5", "--description", "Nightly retro proposals (#219)", "--force")
    rc, out = gh("issue", "create", "--title", title, "--label", "retro,P2", "--body", retro_body(props, date))
    log(f"retro: issue '{title}' rc {rc} {out.strip()[:120]}")
    return out.strip() if rc == 0 else None

def write_inspector_handoff(text, log):
    p = Path(R.CFG.get("inspector_handoff", "C:/work/Oren_study/INSPECTOR_HANDOFF.md"))
    try:
        p.write_text(replace_section(_read(p), INSPECTOR_HEADING, text), encoding="utf-8", newline="\n"); log(f"handoff: {p} UPDATE refreshed")
    except OSError as e: log(f"handoff: could not write {p}: {e!r}")

def orchestrator_handoff_pr(text, date, log):
    """ORCHESTRATOR.md handoff section through a PR (GitHub REST, no local checkout touched, never a direct push to main)."""
    api, branch = f"repos/{R.REPO}", f"nightly/handoff-{date}"
    rc, out = gh("api", f"{api}/contents/ORCHESTRATOR.md?ref={R.BRANCH}")
    if rc: log(f"handoff: could not read ORCHESTRATOR.md: {out[:120]}"); return None
    f = json.loads(out); old = base64.b64decode(f["content"]).decode("utf-8")
    new = replace_section(old, ORCH_HEADING, text)
    if new == old: log("handoff: ORCHESTRATOR.md unchanged"); return None
    rc, out = gh("api", f"{api}/git/ref/heads/{R.BRANCH}")
    if rc: log(f"handoff: no {R.BRANCH} sha: {out[:120]}"); return None
    sha = json.loads(out)["object"]["sha"]
    gh("api", "-X", "POST", f"{api}/git/refs", "-f", f"ref=refs/heads/{branch}", "-f", f"sha={sha}")
    rc, out = gh("api", "-X", "PUT", f"{api}/contents/ORCHESTRATOR.md", "-f", f"message=Nightly orchestrator handoff {date} (#219)",
                 "-f", "content=" + base64.b64encode(new.encode("utf-8")).decode(), "-f", f"sha={f['sha']}", "-f", f"branch={branch}")
    if rc: log(f"handoff: commit failed: {out[:120]}"); return None
    rc, out = gh("api", "-X", "POST", f"{api}/pulls", "-f", f"title=Nightly orchestrator handoff {date}", "-f", f"head={branch}",
                 "-f", f"base={R.BRANCH}", "-f", "body=Nightly handoff (#219, docs/agents/skills/handoff.md): refreshes the '## Handoff (nightly)' section of ORCHESTRATOR.md.")
    url = (json.loads(out).get("html_url") if rc == 0 else None)
    log(f"handoff: PR {url or 'failed: ' + out[:120]}")
    return url

def run_once(tell=print, log=print, now=None):
    """One nightly retro + handoff. -> parsed result or None when claude failed."""
    now = now or time.time(); date = time.strftime("%Y-%m-%d", time.localtime(now))
    ok, out = ask_claude(build_prompt(now))
    res = parse(out) if ok else None
    if res is None:
        log("nightly retro failed: " + (out if not ok else "no RETRO/HANDOFF markers: " + (out or "").strip()[:200])[:200]); return None
    props, insp, orch = res
    url = open_retro_issue(props, date, log) if props else None
    if not props: log("retro: no proposals with evidence today")
    if insp: write_inspector_handoff(insp, log)
    pr = orchestrator_handoff_pr(orch, date, log) if orch else None
    tell(f"NIGHTLY RETRO {date}: {len(props)} proposal(s)" + (f" in {url}" if url else "") + (f"; handoff PR {pr}" if pr else "")
         + ". Turn the accepted ones into tickets.")
    return res

RELAY_MIN, MISSING_H = 10, 2

FALLBACK_MARK = "<!-- fallback #525 -->"   # #525: the first line of a retro issue made by the runner's fallback run (not the trigger)
FALLBACK_PROMPT = ("Follow docs/agents/cloud-tasks.md, section Nightly retro, in igalgerman/oren_study, for the date {date} (use this "
                   "date, not today's, for the title and the day). This is the runner's fallback run (#525: the scheduled task does "
                   f"not run): make the first line of the issue body exactly {FALLBACK_MARK}")
LAUNCH = None   # remote.launch; tests swap in a fake

def retro_start(hour, now):
    """Pure-ish: epoch of the latest retro_hour:00 (local) at or before now. #525: retro_hour 23 + MISSING_H = 01:00 the next day."""
    lt = time.localtime(now)
    t = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, hour, 0, 0, 0, 0, -1))
    if t > now: t = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday - 1, hour, 0, 0, 0, 0, -1))
    return t

def retro_fallback(date, log):
    """#525: start the retro prompt for `date` as a cloud job (remote.launch: returns at once, takes no runner lane). -> started?"""
    if LAUNCH: launch = LAUNCH
    else:
        import remote; launch = remote.launch
    r = launch(0, FALLBACK_PROMPT.format(date=date), R.CFG.get("main_checkout", str(R.ROOT)), name="cloud-retro", model=MODEL, desk=True)
    ok = bool((r or {}).get("ok"))
    log(f"nightly retro (cloud): fallback cloud run for {date} " + ("started" if ok else "could not start: " + str((r or {}).get("error", ""))[:150]))
    return ok

def cloud_retro(tell, log, hour, now):
    """#289: the cloud task's 'Daily retro <date>' issue -> the inspector + orchestrator handoffs, once a day. -> handled?
    #525: the retro day is the one of the latest retro_hour (so 01:00 still looks for yesterday's issue); none MISSING_H h after
    retro_hour -> note + (until a trigger-made retro issue is seen, state 'proven') the retro prompt as a cloud job, once a day."""
    if hour <= 0: return False
    start = retro_start(hour, now); date = time.strftime("%Y-%m-%d", time.localtime(start))
    st = load_state()
    if st.get("retro_day") == date or now - st.get("relay_at", 0) < RELAY_MIN * 60: return False
    st["relay_at"] = now; save_state(st)
    title = f"Daily retro {date}"
    rc, out = gh("issue", "list", "--state", "all", "--search", f'"{title}" in:title', "--json", "number,title,body,url")
    try: found = next((i for i in json.loads(out or "[]") if i.get("title") == title), None) if rc == 0 else None
    except ValueError: found = None
    res = parse(found.get("body")) if found else None
    if res is None:
        if now - start >= MISSING_H * 3600 and st.get("missing_day") != date:
            st["missing_day"] = date; save_state(st)
            tell(f"NIGHTLY RETRO: no '{title}' issue from the cloud scheduled task by {(hour + MISSING_H) % 24}:00. Check the scheduled task (docs/agents/cloud-tasks.md).")
        if now - start >= MISSING_H * 3600 and not st.get("proven") and st.get("fallback_day") != date and retro_fallback(date, log):
            st = load_state(); st["fallback_day"] = date; save_state(st)
        return False
    props, insp, orch = res
    st = load_state(); st["retro_day"] = date
    if FALLBACK_MARK not in (found.get("body") or ""): st["proven"] = True
    save_state(st)
    if insp: write_inspector_handoff(insp, log)
    pr = orchestrator_handoff_pr(orch, date, log) if orch else None
    tell(f"NIGHTLY RETRO {date} (cloud task): {len(props)} proposal(s) in {found.get('url') or '#' + str(found.get('number'))}"
         + (f"; handoff PR {pr}" if pr else "") + ". Turn the accepted ones into tickets.")
    return True

def retro_if_due(tell, log, hour=None, now=None, where=None):
    """Watchdog hook, every tick. Background run once a day at retro_hour; never two at once; 0 = off. -> started?
    #289: where = cloud (config retro_where): no local run; cloud_retro() writes the handoffs from the cloud task's issue."""
    hour = int(R.CFG.get("retro_hour", 23)) if hour is None else hour
    now = now or time.time()
    if (where or R.CFG.get("retro_where", "cloud")) == "cloud": return cloud_retro(tell, log, hour, now)
    if _running["v"]: return False
    st = load_state()
    if not retro_due(time.localtime(now), hour, st.get("retro_day")): return False
    _running["v"] = True; st["retro_day"] = time.strftime("%Y-%m-%d", time.localtime(now)); save_state(st)
    def work():
        try: run_once(tell, log, now)
        except Exception as e: log(f"nightly retro error: {e!r}")
        finally: _running["v"] = False
    threading.Thread(target=work, daemon=True).start()
    return True

def parked_data():
    """(all issues, open PRs, issues with an open owner question) for the night report, or None when GitHub is unreadable."""
    import parked
    got, qs = parked.fetch(R.gh), parked.owner_q_issues()
    return None if got is None or qs is None else (*got, qs)

def night_report_if_due(tell, log, hour=None, now=None, data=parked_data):
    """#282, every watchdog tick: once a day at retro_hour (0 = off) tell the orchestrator every open issue that is not
    ready-for-agent with its reason (batch #N / later until X / waiting for owner question / ...); no reason = ALARM."""
    import parked
    hour = int(R.CFG.get("retro_hour", 23)) if hour is None else hour
    now = now or time.time()
    st = load_state()
    if not retro_due(time.localtime(now), hour, st.get("parked_day")): return None
    d = data()
    if d is None: log("night report: GitHub unreadable"); return None
    st["parked_day"] = time.strftime("%Y-%m-%d", time.localtime(now)); save_state(st)
    text = parked.night_report(*d, now) + "\n" + models_line_now(now)
    tell(text); log(text[:300])
    return text

def batch_tick(send, log, issues=None, now=None):
    """Watchdog hook: tell the inbox to run /batch when batch_due says so. send(text) -> rc. -> message sent or None."""
    now = now or time.time()
    if issues is None:
        if now - _batch_chk["at"] < BATCH_CHECK_MIN * 60: return None
        _batch_chk["at"] = now
        rc, out = gh("issue", "list", "--state", "open", "--limit", "300", "--json", "number,title,labels")
        if rc: return None
        issues = [{**i, "labels": [l["name"] for l in i["labels"]]} for i in json.loads(out)]
    st = load_state()
    msg = batch_due(batchable(issues), now, st)
    if not msg: return None
    rc = send(msg)
    if rc == 0:
        st.update(batch_day=time.strftime("%Y-%m-%d", time.localtime(now)), batch_at=now); save_state(st)
    log(f"batch trigger -> inbox (rc {rc}): {msg[:150]}")
    return msg if rc == 0 else None

PLAYLOG_RUN = None   # #641: tests swap in a fake (argv -> rc)
PLAYLOG_RETRY_MIN = 60

def playlog_if_due(log, now=None, run=None):
    """#641, every watchdog tick: once a day archive yesterday's play events on this PC (tools/playlog.py day <yesterday>
    -> ~/.oren/playlog/<day>.json, private, never in the repo). A failed run is tried again at most once an hour. -> rc or None."""
    now = now or time.time()
    lt = time.localtime(now); day = time.strftime("%Y-%m-%d", time.localtime(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday - 1, 12, 0, 0, 0, 0, -1))))
    st = load_state()
    if st.get("playlog_day") == day or now - st.get("playlog_at", 0) < PLAYLOG_RETRY_MIN * 60: return None
    st["playlog_at"] = now; save_state(st)
    run = run or PLAYLOG_RUN
    argv = [sys.executable, str(Path(R.MAIN_CHECKOUT) / "tools" / "playlog.py"), "day", day]
    if run: rc = run(argv)
    else:
        try: rc = R.run(argv, timeout=120)[0]
        except (OSError, subprocess.TimeoutExpired) as e: log(f"playlog {day}: {e!r}"[:200]); return 1
    if rc == 0:
        st = load_state(); st["playlog_day"] = day; save_state(st)
    log(f"playlog {day}: " + ("archived" if rc == 0 else f"failed (rc {rc}), again in {PLAYLOG_RETRY_MIN} min"))
    return rc

def prune_if_due(log, now=None):
    """Watchdog hook (#304): once a day remove .runs/<n> of issues closed > PRUNE_HOURS. -> numbers pruned, or None."""
    now = now or time.time(); day = time.strftime("%Y-%m-%d", time.localtime(now))
    st = load_state()
    if st.get("prune_day") == day or not R.RUNS.is_dir(): return None
    rc, out = gh("issue", "list", "--state", "closed", "--limit", "1000", "--json", "number,closedAt")
    if rc: return None                      # GitHub unreadable: try again next tick
    closed = {}
    for i in json.loads(out):
        try: closed[i["number"]] = calendar.timegm(time.strptime(i["closedAt"][:19], "%Y-%m-%dT%H:%M:%S"))
        except (KeyError, TypeError, ValueError): pass
    gone = prunable([d.name for d in R.RUNS.iterdir() if d.is_dir()], closed, now)
    for n in gone: shutil.rmtree(R.RUNS / str(n), ignore_errors=True)
    st["prune_day"] = day; save_state(st)
    if gone: log(f"pruned .runs of {len(gone)} closed issue(s): " + " ".join(f"#{n}" for n in gone))
    return gone

# ---------- #326: helper worktrees (.claude/worktrees/*, the inspector's sub-agents) ----------
def stale_worktrees(rows, prs):
    """Pure (#326): paths of clean worktrees whose branch is pushed (a PR of it is at the same head, or origin has the head)
    and whose PRs are all merged/closed. rows: {path, branch, head, dirty, remote_has_head}; prs: {headRefName, headRefOid, state}."""
    out = []
    for w in rows:
        mine = [p for p in prs if p.get("headRefName") == w["branch"]]
        if w["dirty"] or w["branch"] in ("", "HEAD") or not mine: continue
        if any(p.get("state") == "OPEN" for p in mine): continue
        if w["remote_has_head"] or any(p.get("headRefOid") == w["head"] for p in mine): out.append(w["path"])
    return out

def worktree_rows():
    """The git worktrees under <main checkout>/.claude/worktrees: branch, head, dirty (any change, untracked too), pushed head."""
    root, rows = Path(R.MAIN_CHECKOUT) / ".claude" / "worktrees", []
    if not root.is_dir(): return rows
    for d in sorted(p for p in root.iterdir() if p.is_dir() and (p / ".git").exists()):
        g = lambda *a: R.run(["git", "-C", str(d), *a], timeout=60)
        rc, head = g("rev-parse", "HEAD")
        if rc: continue
        branch = g("rev-parse", "--abbrev-ref", "HEAD")[1].strip()
        rc_st, st = g("status", "--porcelain")
        rc_r, n = g("rev-list", "--count", f"HEAD", f"^{R.REMOTE}/{branch}") if branch != "HEAD" else (1, "")
        rows.append({"path": str(d), "branch": branch, "head": head.strip(), "dirty": rc_st != 0 or bool(st.strip()),
                     "remote_has_head": rc_r == 0 and n.strip() == "0"})
    return rows

def worktrees_if_due(log, now=None):
    """Watchdog hook (#326), once a day with the #304 prune: remove stale helper worktrees. -> paths removed, or None."""
    now = now or time.time(); day = time.strftime("%Y-%m-%d", time.localtime(now))
    st = load_state()
    if st.get("worktrees_day") == day: return None
    rows = worktree_rows()
    if rows:
        rc, out = gh("pr", "list", "--state", "all", "--limit", "500", "--json", "headRefName,headRefOid,state")
        if rc: return None                  # GitHub unreadable: try again next tick
        gone = stale_worktrees(rows, json.loads(out))
    else: gone = []
    for p in gone: R.remove_worktree(p)
    st["worktrees_day"] = day; save_state(st)
    if gone: log(f"removed {len(gone)} stale helper worktree(s): " + " ".join(gone))
    return gone

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if sys.argv[1:2] == ["retro"]: print(run_once(tell=print))
    else: print(__doc__)
