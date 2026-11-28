"""#203 AI observer: every ai_observer_minutes (config.toml, default 60, 0 = off) the watchdog starts ONE short headless
`claude -p --model sonnet` in a background thread (never two at once, hard timeout 10 min) with read-only tools.
It reads issues/PRs/cloud lanes/logs/the merge lock and reports at most 5 lines `OBSERVER: <what is wrong, #n> -> <fix, who>`
(or 'no problems'). Python then: writes .runs/ai_observer.last, sends NEW findings to the orchestrator (the same issue + text start
not again within 6 h), and posts a finding for the OWNER in the 'Questions for the owner' issue (#193) when that issue exists.
The AI observer never edits, merges, labels or comments by itself.
#289: `ai_observer_where = "cloud"` (default): the check runs as an hourly CLOUD scheduled task (docs/agents/cloud-tasks.md, the
subscription, no claude on the PC). It posts its lines as a comment on the open issue labelled `ai-observer` ('AI observer (cloud)');
the watchdog only relays the newest comment (REST `gh api .../comments?since=`) when unseen, through the same path (.last file, 6 h repeat filter, orchestrator, #193).
Silent for SILENT_H h -> one note to the orchestrator.
#525: no trigger-made comment for 3 h -> one owner note (owner_q, Telegram), every 12 h at most; until one is seen the watchdog
starts the observer prompt itself as an hourly cloud job (remote.launch, window cloud-observer; its comment starts FALLBACK_MARK). "local" = the old headless run on the PC.
Usage: python tools/runner/ai_observer.py   (one local run now, prints the findings)
"""
import json, re, shutil, subprocess, sys, threading, time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import runner as R

LAST, STATE = R.RUNS / "ai_observer.last", R.RUNS / "ai_observer.state.json"
MAX_FINDINGS, REPEAT_H, TIMEOUT_S = 5, 6, 600
MODEL = "sonnet"
TOOLS = ["Read", "Grep", "Glob", "Bash(gh:*)", "Bash(git log:*)", "Bash(git show:*)", "Bash(hc:*)",
         "Bash(python tools/runner/remote.py status:*)"]
DENY = ["Bash(gh issue edit:*)", "Bash(gh issue comment:*)", "Bash(gh issue close:*)", "Bash(gh issue create:*)",
        "Bash(gh pr merge:*)", "Bash(gh pr comment:*)", "Bash(gh pr review:*)", "Bash(gh pr close:*)", "Bash(gh api:*)",
        "Bash(hc send:*)", "Bash(hc kill:*)", "Bash(hc rm:*)", "Bash(hc run:*)"]
RUN = subprocess.run        # tests swap in a fake claude
_running = globals().get("_running") or {"v": False}   # #345: kept across a reload (a thread may be running)

PROMPT = """You are the AI OBSERVER of the Oren study automatic flow: a fresh, read-only auditor. You change NOTHING (no labels, comments, edits, merges, sends). Be quick: a few commands only.
Repo: {repo} (always `gh ... --repo {repo}`). Rules: FLOW.md, ORCHESTRATOR.md, docs/agents/triage-labels.md.
Labels: `ready-for-human` = the owner must answer/do it. `needs-triage`/`needs-info` = owner grilling. `blocked` + `needs-orchestrator` = the orchestrator (an agent) handles it. `ready-for-agent` = agents can build it. `in-progress` = a lane runs it. `cloud` = its worker runs in a cloud session: it has NO local window or worktree by design, never flag that.
Check:
1. Open issues: `gh issue list --state open --limit 100 --json number,title,labels,body,updatedAt`. Labels that contradict each other or the `Blocked by: #n` lines (e.g. ready-for-agent or ready-for-human while its blocker is still open; in-progress with no lane; an owner-lane issue an agent could do).
2. Open PRs: `gh pr list --state open --json number,title,headRefName,updatedAt,isDraft,autoMergeRequest,statusCheckRollup,reviewDecision` and their review comments (VERDICT: PASS/FIX). Red checks nobody fixes, PASS but not merging, PRs not moving.
3. Cloud issues (label cloud): `python tools/runner/remote.py status <n>`: stuck, a QUESTION nobody relays, DONE with no PR.
4. The log tails and the merge lock below: errors repeating, a lock held long, the runner not starting work.
Output, nothing else: at most {max} lines, each exactly
OBSERVER: <what is wrong, with #n> -> <the fix, who does it (orchestrator / worker / owner)>
Only real problems, most important first; "owner" only when it is truly his decision. If nothing is wrong, the single line: no problems

--- runner.log (tail) ---
{runner}
--- watchdog.log (tail) ---
{watchdog}
--- merge lock (watchdog.py --lock) ---
{lock}
"""

def tail(path, n=40):
    try: return "\n".join(Path(path).read_text(encoding="utf-8", errors="replace").splitlines()[-n:]) or "(empty)"
    except OSError: return "(missing)"

def lock_text():
    try:
        p = subprocess.run([sys.executable, str(HERE / "watchdog.py"), "--lock"], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=60, stdin=subprocess.DEVNULL, creationflags=R.no_window())
        return (p.stdout or p.stderr or "").strip() or "(no output)"
    except (OSError, subprocess.TimeoutExpired) as e: return f"(could not read: {e!r})"

def build_prompt():
    return PROMPT.format(repo=R.REPO, max=MAX_FINDINGS, runner=tail(R.RUNS / "runner.log"), watchdog=tail(R.RUNS / "watchdog.log"), lock=lock_text())

def command(model=None):
    """The claude command line. The prompt goes on stdin (--allowedTools takes a list and would swallow it)."""
    return [shutil.which("claude") or "claude", "-p", "--model", model or MODEL, "--no-session-persistence",
            "--tools", "Read,Grep,Glob,Bash", "--allowedTools", *TOOLS, "--disallowedTools", *DENY]

def ask_claude(prompt):
    """-> (ok, stdout or error text)."""
    try:
        p = RUN(command(), input=prompt, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=TIMEOUT_S, cwd=str(R.ROOT), creationflags=R.no_window())
    except subprocess.TimeoutExpired: return False, f"timeout after {TIMEOUT_S // 60} min"
    except OSError as e: return False, f"could not start claude: {e!r}"
    if p.returncode: return False, f"claude exit {p.returncode}: {((p.stderr or '') + (p.stdout or '')).strip()[:200]}"
    return True, p.stdout or ""

LINE = re.compile(r"^\s*[-*]?\s*`?OBSERVER:\s*(.+?)`?\s*$")

def parse(out):
    """Pure: -> list of 'OBSERVER: ...' lines (max 5), [] = no problems, None = unreadable output."""
    found = [f"OBSERVER: {m[1].strip()}" for m in map(LINE.match, (out or "").splitlines()) if m]
    if found: return found[:MAX_FINDINGS]
    return [] if re.search(r"no problems", out or "", re.I) else None

def key(finding):
    """Same issue (first #n) + same text start = the same finding."""
    t = re.sub(r"^OBSERVER:\s*", "", finding).lower()
    m = re.search(r"#(\d+)", t)
    return f"{m[1] if m else '-'}|{re.sub(r'[^a-z0-9א-ת]+', ' ', t).strip()[:40]}"

def fresh(findings, sent, now):
    """Pure: -> (findings not sent within REPEAT_H, updated sent map key -> time)."""
    sent = {k: v for k, v in sent.items() if now - v < REPEAT_H * 3600}
    new = []
    for f in findings:
        k = key(f)
        if k in sent: continue
        sent[k] = now; new.append(f)
    return new, sent

OWNER_DOER = re.compile(r"^\s*(?:the\s+)?(?:owner|הבעלים)\b|(?:\bowner|הבעלים)\s*:", re.I)

def for_owner(finding):
    """#603: the fix part (after ->) names the owner as the DOER: it starts with 'owner' or has 'owner:'. A fix for the
    orchestrator that only mentions the owner ('orchestrator: ... or ask the owner') is no owner question."""
    return "->" in finding and bool(OWNER_DOER.search(finding.split("->", 1)[1]))

def close_wrong_owner_q(gh=None):
    """#603, once: open owner_q questions from window ai-observer whose fix has no owner doer -> marked answered (closed).
    -> number closed, None when gh failed (tried again at the next relay)."""
    import owner_q as OQ
    if load_state().get("owner_q_cleaned"): return 0
    qs = OQ.open_list(gh)
    if qs is None: return None
    wrong = [q for q in qs if q.get("source") == "ai-observer" and not for_owner(q.get("text", ""))]
    for q in wrong:
        if not OQ.mark_answered(q["key"], "closed by the runner: not an owner question, it is for the orchestrator (#603)", gh): return None
    st = load_state(); st["owner_q_cleaned"] = True; save_state(st)
    return len(wrong)

def owner_issue():
    """Number of the open 'Questions for the owner' issue, 0 when it does not exist (never created here)."""
    import owner_q as OQ
    rc, out = OQ.GH("issue", "list", "--state", "open", "--search", f'"{OQ.TITLE}" in:title', "--json", "number,title")
    if rc: return 0
    try: return next((i["number"] for i in json.loads(out or "[]") if i["title"] == OQ.TITLE), 0)
    except ValueError: return 0

def load_state():
    try: return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception: return {}

def save_state(st):
    R.RUNS.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(st), encoding="utf-8", newline="\n")

def run_once(tell=print, log=print, now=None):
    """One observer run. -> findings list ([] = no problems) or None when claude failed."""
    ok, out = ask_claude(build_prompt())
    return report(ok, out, tell, log, now or time.time())

def report(ok, out, tell, log, now, head="AI OBSERVER (hourly, read-only):"):
    """The findings in out -> .last file, repeat filter, orchestrator, owner (#193). -> findings or None (unreadable)."""
    found = parse(out) if ok else None
    stamp = time.strftime("%Y-%m-%d %H:%M ", time.localtime(now))
    R.RUNS.mkdir(parents=True, exist_ok=True)
    if found is None:
        why = out if not ok else "no OBSERVER lines in the output: " + (out or "").strip()[:200]
        LAST.write_text(stamp + "failed: " + why + "\n", encoding="utf-8", newline="\n"); log("ai observer failed: " + why[:200])
        return None
    LAST.write_text(stamp + ("\n".join(found) or "no problems") + "\n", encoding="utf-8", newline="\n")
    st = load_state()
    new, st["sent"] = fresh(found, st.get("sent", {}), now)
    save_state(st)
    log(f"ai observer: {len(found)} finding(s), {len(new)} new")
    if new: tell(head + "\n" + "\n".join(new))
    owner = [f for f in new if for_owner(f)]
    if owner and owner_issue():
        import owner_q as OQ
        for f in owner: OQ.post("ai-observer", "QUESTION: " + re.sub(r"^OBSERVER:\s*", "", f))
    return found

CLOUD_TITLE, CLOUD_LABEL = "AI observer (cloud)", "ai-observer"
RELAY_MIN, SILENT_H = 5, 3

def _epoch(iso):
    import calendar
    try: return calendar.timegm(time.strptime((iso or "")[:19], "%Y-%m-%dT%H:%M:%S"))
    except ValueError: return 0

def relay(tell, log, now, gh=None, api=None):
    """#289: the cloud task's newest unseen comment on the ai-observer issue -> report(). Every RELAY_MIN; a gh error does nothing.
    Round 2 of #485: GraphQL `--json comments` stops at the first 100 and gh has no `lastComment` field, so the comments come from
    REST: `gh api .../issues/<n>/comments?since=<cloud_seen>` (R.gh adds --repo, which `gh api` has no flag for -> R.run)."""
    st = load_state()
    if now - st.get("relay_at", 0) < RELAY_MIN * 60: return None
    st["relay_at"] = now; save_state(st)
    rc, out = (gh or R.gh)("issue", "list", "--state", "open", "--label", CLOUD_LABEL, "--limit", "5", "--json", "number")
    try: issues = json.loads(out) if rc == 0 else None
    except ValueError: issues = None
    if issues is None: return None
    seen = st.get("cloud_seen", "") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - 24 * 3600))  # first run: the last day
    comments = []
    for i in issues:
        rc, out = (api or R.run)(["gh", "api", f"repos/{R.REPO}/issues/{i['number']}/comments?since={seen}&per_page=100"])
        try: page = json.loads(out) if rc == 0 else None
        except ValueError: page = None
        if not isinstance(page, list): return None
        comments += [c for c in page if isinstance(c, dict)]
    comments.sort(key=lambda c: c.get("created_at") or "")
    readable = [c for c in comments if parse(c.get("body")) is not None]
    last = readable[-1] if readable else None
    st = load_state()
    if last and (last.get("created_at") or "") > st.get("cloud_seen", ""):
        st["cloud_seen"] = last["created_at"]; save_state(st)
        found = report(True, last.get("body"), tell, log, now, head="AI OBSERVER (hourly cloud task, read-only):")
        st = load_state()
    newest = max(_epoch(last.get("created_at")) if last else 0, _epoch(st.get("cloud_seen")))
    st.setdefault("relay_since", now)                               # the first relay is no 'silent' alarm
    trig = [c.get("created_at") or "" for c in readable if FALLBACK_MARK not in (c.get("body") or "")]   # #525: made by the trigger
    if trig:
        st["proven"] = True; st["trigger_seen"] = max([st.get("trigger_seen", "")] + trig)
    save_state(st)
    if now - max(newest, st.get("silent_told", 0), st["relay_since"]) >= SILENT_H * 3600:
        st["silent_told"] = now; save_state(st)
        tell(f"AI OBSERVER: the cloud scheduled task has been silent for {SILENT_H}+ h (no comment on the '{CLOUD_TITLE}' issue). "
             "Check the scheduled task (docs/agents/cloud-tasks.md).")
        log("ai observer (cloud): silent")
    owner_note(now); fallback(now, log)                             # #525 (after the state writes above)
    if close_wrong_owner_q():                                     # #603 (once)
        log("ai observer: closed the old owner questions that were for the orchestrator (#603)")
    return last

# ---------- #525: the triggers never ran (no ai-observer issue at all on 27 Nov) ----------
FALLBACK_MARK = "<!-- fallback #525 -->"   # the first line of a comment made by the runner's own fallback run (not the trigger)
OWNER_SILENT_H, OWNER_REPEAT_H, FALLBACK_MIN = 3, 12, 60
FALLBACK_PROMPT = ("Follow docs/agents/cloud-tasks.md, section AI observer, in igalgerman/oren_study. This is the runner's fallback "
                   f"run (#525: the scheduled task does not run): make the first line of your comment exactly {FALLBACK_MARK}")
OWNER_POST = None   # (window, question) -> owner_q.post; tests swap in a fake
LAUNCH = None       # remote.launch; tests swap in a fake

def owner_note(now):
    """No trigger-made comment for OWNER_SILENT_H h (or none ever since the watchdog started relaying) -> ONE note to the owner
    through owner_q (#193; qwin also sends it to Telegram, #440), at most every OWNER_REPEAT_H h."""
    st = load_state()
    since = _epoch(st.get("trigger_seen")) or st.get("relay_since", now)
    if now - since < OWNER_SILENT_H * 3600 or now - st.get("owner_told", 0) < OWNER_REPEAT_H * 3600: return False
    q = (f"QUESTION: cloud AI observer silent since {time.strftime('%H:%M', time.localtime(since))} - "
         "log in again (/login) or check claude.ai/code -> Scheduled")
    if OWNER_POST: OWNER_POST(f"ai-observer-{int(now)}", q)          # the window carries the time: a repeat is a new key, never deduped away
    else:
        import owner_q as OQ; OQ.post(f"ai-observer-{int(now)}", q)   # None = queued: owner_q posts it later, still told once
    st = load_state(); st["owner_told"] = now; save_state(st)
    return True

def fallback(now, log):
    """While the last trigger-made comment (state 'trigger_seen') is missing or older than OWNER_SILENT_H h (#689: not a sticky
    'proven' flag), start the observer prompt as a cloud job every FALLBACK_MIN (remote.launch from the watchdog: returns at
    once, takes no runner lane). A failed start is retried at the next relay."""
    st = load_state()
    seen = _epoch(st.get("trigger_seen"))
    if (seen and now - seen < OWNER_SILENT_H * 3600) or now - st.get("fallback_at", 0) < FALLBACK_MIN * 60: return False
    if LAUNCH: launch = LAUNCH
    else:
        import remote; launch = remote.launch
    r = launch(0, FALLBACK_PROMPT, R.CFG.get("main_checkout", str(R.ROOT)), name="cloud-observer", model=MODEL, desk=True)
    ok = bool((r or {}).get("ok"))
    if ok: st = load_state(); st["fallback_at"] = now; save_state(st)
    log("ai observer (cloud): fallback cloud run " + ("started" if ok else "could not start: " + str((r or {}).get("error", ""))[:150]))
    return ok

def run_if_due(tell, log, minutes=None, now=None, where=None, gh=None, api=None):
    """Watchdog hook, every tick. Starts a background run when due; never two at once; ai_observer_minutes = 0 = off. -> started?
    #289: where = cloud (config ai_observer_where): no local run, only relay() of the cloud task's comment."""
    minutes = int(R.CFG.get("ai_observer_minutes", 60)) if minutes is None else minutes
    now = now or time.time()
    if (where or R.CFG.get("ai_observer_where", "cloud")) == "cloud":
        if minutes > 0: relay(tell, log, now, gh, api)
        return False
    if minutes <= 0 or _running["v"]: return False
    st = load_state()
    if now - st.get("last_run", 0) < minutes * 60: return False
    _running["v"] = True; st["last_run"] = now; save_state(st)
    def work():
        try: run_once(tell, log)
        except Exception as e: log(f"ai observer error: {e!r}")
        finally: _running["v"] = False
    threading.Thread(target=work, daemon=True).start()
    return True

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    res = run_once(tell=lambda t: None)
    print(LAST.read_text(encoding="utf-8").strip())
