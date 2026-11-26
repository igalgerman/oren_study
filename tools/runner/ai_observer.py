"""#203 AI observer: every ai_observer_minutes (config.toml, default 60, 0 = off) the watchdog starts ONE short headless
`claude -p --model sonnet` in a background thread (never two at once, hard timeout 10 min) with read-only tools.
It reads issues/PRs/cloud lanes/logs/the merge lock and reports at most 5 lines `OBSERVER: <what is wrong, #n> -> <fix, who>`
(or 'no problems'). Python then: writes .runs/ai_observer.last, sends NEW findings to the orchestrator (the same issue + text start
not again within 6 h), and posts a finding for the OWNER in the 'Questions for the owner' issue (#193) when that issue exists.
The AI observer never edits, merges, labels or comments by itself.
Usage: python tools/runner/ai_observer.py   (one run now, prints the findings)
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

def for_owner(finding):
    """The fix part (after ->) says the owner does it."""
    return bool(re.search(r"\bowner\b|הבעלים", finding.split("->", 1)[-1], re.I))

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
    now = now or time.time()
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
    if new: tell("AI OBSERVER (hourly, read-only):\n" + "\n".join(new))
    owner = [f for f in new if for_owner(f)]
    if owner and owner_issue():
        import owner_q as OQ
        for f in owner: OQ.post("ai-observer", "QUESTION: " + re.sub(r"^OBSERVER:\s*", "", f))
    return found

def run_if_due(tell, log, minutes=None, now=None):
    """Watchdog hook, every tick. Starts a background run when due; never two at once; ai_observer_minutes = 0 = off. -> started?"""
    minutes = int(R.CFG.get("ai_observer_minutes", 60)) if minutes is None else minutes
    now = now or time.time()
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
