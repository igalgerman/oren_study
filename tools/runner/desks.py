"""Cloud desks (#306): two always-on Claude cloud sessions the owner uses from the phone, also when the PC is off.
  'Oren inbox (cloud)'  he writes a task in Hebrew/English -> it checks the backlog and opens a correct issue
  'Oren ask (cloud)'    read-only: answers 'what is running, what needs me' from GitHub + the pinned status issue
The watchdog calls tick() every minute (deterministic, no LLM here):
  - ONE pinned issue (TITLE, label manual) holds the two session links and the live status (dashboard.py --text),
    its body edited in place every status_minutes (10). Nothing is committed.
  - keep-alive: a desk with no session is started (remote.start, window desk-<role>); every desk_probe_hours a short PING
    is sent (remote.send); a failed send = the session ended -> a new one, and the pinned links change at once.
  - .runs/desks.json {"text": "cloud desks: inbox ok · ask down"} for the panel and the dashboard.
Sessions run on the claude.ai subscription (claude --cloud), no paid API.
Usage: python tools/runner/desks.py [--once]   (one tick now; prints the desks line)"""
import json, re, sys, threading, time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import runner as R

TITLE = "Oren cloud: phone links + live status"
INBOX_TITLE, ASK_TITLE = "Oren inbox (cloud)", "Oren ask (cloud)"
ROLES = ("inbox", "ask")
MARK = "<!-- desks #306 -->"
RETRY_MIN = 30                  # a refused start is tried again after this long, not every minute
MAX_STATUS = 50000              # GitHub body limit is 65536
LINE = R.RUNS / "desks.json"
STATE = R.RUNS / "desks_state.json"
PING = "PING (keep-alive from the PC): reply with one word, ok. Do nothing else."

def prompt(role, issue):
    """The session's first message: its whole role (the cloud has no PC windows, so the PC inbox's /idea and /task do not apply)."""
    if role == "inbox":
        return (f"You are '{INBOX_TITLE}', the owner's always-on inbox for the Oren game backlog (repo igalgerman/oren_study). "
                "He writes from his phone, in Hebrew or English. Read CLAUDE.md and FLOW.md once. Use the GitHub tools you have (gh may be missing here). "
                "For every new task, idea or bug: 1) search open AND closed issues first (one backlog, no duplicates): if it exists, comment on it "
                "(or reopen it) instead of a new issue. 2) Otherwise create ONE issue in English, written the way docs/agents/skills/writing-for-agents.md says: "
                "a short title, what and why, an ## Acceptance section (3-7 checkable points + the tests that prove them, and Out of scope); labels: one priority "
                "(P0 urgent, P1, P2 normal, P3 low), a lane (pack for tooling and pack files; core only for the game core files in FLOW.md Lanes), "
                "the model label docs/agents/models.md says, ready-for-agent, and bug for a bug; add a line Blocked by: #n when it overlaps an open issue. "
                "Kid-facing text in Hebrew with correct nikud. 3) Reply to him in short Hebrew: the issue number and one line of what you wrote. "
                f"A status question: answer it briefly from GitHub, or point him to '{ASK_TITLE}' (pinned issue #{issue}). "
                "Never change code, never open a PR, never close issues. A PING from the PC is a keep-alive: reply ok and do nothing else.")
    return (f"You are '{ASK_TITLE}', a READ-ONLY helper for the owner of the Oren game backlog (repo igalgerman/oren_study). "
            "He asks from his phone, in Hebrew, things like: what is running now and what needs me? Answer in short Hebrew (nikud not needed). "
            f"Sources, read fresh for every question: the pinned issue #{issue} (its body is the PC's live status, dashboard.py --text, refreshed every "
            "10 min; say how old it is, and older than 20 min means the PC is probably off), plus GitHub: open and closed issues and labels "
            "(in-progress = running; ready-for-human, needs-info and the issue 'Questions for the owner' = needs him), PRs, their checks and comments. "
            "Use the GitHub tools you have (gh may be missing here). Never change anything: no code, issues, labels, comments or PRs. "
            "A PING from the PC is a keep-alive: reply ok and do nothing else.")

def ok(s): return bool(s.get("session")) and s.get("ok", False)

def desk_line(state):
    return "cloud desks: " + " · ".join(f"{r} {'ok' if ok(state.get(r) or {}) else 'down'}" for r in ROLES)

def _iso(t): return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))

def issue_body(state, status, now):
    """Parent-facing pinned issue body: the two links (open them in the Claude app) + the live status in one code block."""
    def link(role, title, what):
        s = state.get(role) or {}
        return f"- **{title}** ({what}): " + (f"{s['url']} — {'ok' if ok(s) else 'down'}" if s.get("url") else "not started yet")
    st = (status or "(no status yet)").replace("```", "'''")[:MAX_STATUS]
    return (f"{MARK}\n## Phone links (open in the Claude app)\n"
            + link("inbox", INBOX_TITLE, "write a new task, Hebrew ok · כתוב משימה חדשה") + "\n"
            + link("ask", ASK_TITLE, "ask what is running · שאל מה קורה") + "\n\n"
            + f"Status updated {_iso(now)} (every 10 min while the PC is on; older = the PC is off).\n\n"
            + "## Live status (dashboard.py --text)\n```text\n" + st + "\n```\n\n"
            + "(#306: written by the watchdog, edited in place. Label `manual`: the runner ignores this issue.)")

def tick(d):
    """One pass. d: now, state (dict, changed in place), save(state), start(role, prompt) -> remote.start result,
    probe(session) -> bool, status_text() -> str|None, find_issue() -> n|0, edit(n, body) -> rc, log(text),
    status_minutes (0 = off), probe_hours."""
    s, now, log = d["state"], d["now"], d["log"]
    if not d.get("status_minutes"): return
    n = s.get("issue") or d["find_issue"]()
    if not n: log("desks: pinned issue not found/created (GitHub?)"); return
    s["issue"], changed = n, False
    for role in ROLES:
        x = s.setdefault(role, {})
        if x.get("session"):
            if now - x.get("checked", 0) < d["probe_hours"] * 3600: continue
            x["checked"] = now
            if d["probe"](x["session"]): x["ok"] = True; continue
            log(f"desks: {role} session {x['session']} did not answer: restarted")
        elif not x.get("ok", True) and now - x.get("tried", 0) < RETRY_MIN * 60:
            continue
        r = d["start"](role, prompt(role, n))
        x.update(tried=now, checked=now, ok=r["ok"], error=r.get("error", ""))
        if r["ok"]: x.update(session=r["session"], url=r["url"]); log(f"desks: started {role}: {r['url']}")
        else: x.pop("session", None); log(f"desks: {role} start FAILED: {r.get('error', '')}")
        changed = True
    if changed or now - s.get("published", 0) >= d["status_minutes"] * 60:
        if d["edit"](n, issue_body(s, d["status_text"](), now)) == 0: s["published"] = now
    d["save"](s)

def write_line(state):
    try:
        R.RUNS.mkdir(parents=True, exist_ok=True)
        LINE.write_text(json.dumps({"text": desk_line(state)}, ensure_ascii=False), encoding="utf-8")
    except OSError: pass

# ---------- real wiring ----------
def _load():
    try: return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception: return {}

def _save(s):
    R.RUNS.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(s), encoding="utf-8")
    write_line(s)

def find_issue():
    """The open pinned issue TITLE; created (label manual, pinned, assigned to the owner) when missing. 0 when gh fails."""
    rc, out = R.gh("issue", "list", "--state", "open", "--search", f'"{TITLE}" in:title', "--json", "number,title")
    if rc: return 0
    try: n = next((i["number"] for i in json.loads(out or "[]") if i["title"] == TITLE), 0)
    except ValueError: return 0
    if n: return n
    rc, out = R.gh("issue", "create", "--title", TITLE, "--assignee", R.REPO.split("/")[0], "--label", "manual", "--body", MARK)
    m = re.search(r"/issues/(\d+)", out or "")
    if rc or not m: return 0
    R.gh("issue", "pin", m[1])
    return int(m[1])

def status_text():
    rc, out = R.run([sys.executable, str(HERE / "dashboard.py"), "--text"], timeout=300)
    return out.strip() if rc == 0 and out.strip() else None

def run_once(log=print):
    import remote as RM
    cwd = R.CFG.get("main_checkout", str(R.ROOT))
    tick(dict(now=time.time(), state=_load(), save=_save, log=log,
              start=lambda role, p: RM.start(role, p, cwd=cwd, name=f"desk-{role}"),
              probe=lambda sess: RM.send(sess, PING)["ok"], status_text=status_text, find_issue=find_issue,
              edit=lambda n, body: R.gh("issue", "edit", str(n), "--body", body)[0],
              status_minutes=int(R.CFG.get("status_minutes", 10)), probe_hours=float(R.CFG.get("desk_probe_hours", 12))))

_busy = globals().get("_busy") or threading.Lock()   # #300: kept across a reload (a desks thread may hold it)

def run_if_due(log):
    """Watchdog hook: one tick in a thread (dashboard.py --text and a cloud start take a while); never two at once."""
    if R.DRY or not _busy.acquire(blocking=False): return
    def go():
        try: run_once(log)
        except Exception as e: log(f"desks: error {e!r}")
        finally: _busy.release()
    threading.Thread(target=go, daemon=True).start()

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    run_once()
    print(desk_line(_load()))
