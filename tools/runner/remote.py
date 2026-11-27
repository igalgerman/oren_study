"""Cloud Claude sessions for the runner (#131 spike). See docs/agents/remote.md.

  python tools/runner/remote.py start <n> "<task>"     -> JSON {ok, session, url, error}
  python tools/runner/remote.py status <n>             -> JSON {state: working|done|stuck|question, line, pr}  (#297: an open PR quiet 10 min = done)
  (runner only) review_status(pr, since)               -> {state: working|done, line: last VERDICT line of a PR comment, body} (#134)
  python tools/runner/remote.py send <session> "<text>" -> JSON {ok, error}
  python tools/runner/remote.py cloud                  -> JSON list, one per open issue labelled cloud (#136) or in-progress with a remote run (#236):
      {n, title, state, line, last, stale, pr, session, manual}  last = ISO UTC of the newest comment/commit
      state done = RESULT: DONE or the PR merged; waiting for core slot = the run waits in core_slot(), no busy lane (#277); waiting review = open PR quiet 10 min, no RESULT line (#297); manual = no .runs/<n> (started by hand). Lanes show only active() rows (#263).

start needs a TTY (`claude --cloud` refuses piped output), so it runs inside a herdr terminal.
The herdr server's env has CLAUDE_CODE_OAUTH_TOKEN (inference-only scope -> 403 on cloud);
it is removed so claude uses the stored claude.ai login.
State comes from GitHub (the CLI's agents/logs do not list cloud sessions)."""
import json, os, re, shutil, subprocess, sys, tomllib
from pathlib import Path
import ghauth, ghcache

HERE = Path(__file__).resolve().parent
CFG = tomllib.loads((HERE / "config.toml").read_text(encoding="utf-8"))
HC = CFG.get("hc", "hc")
BASH = CFG.get("bash", "bash")
REPO = CFG.get("repo", "igalgerman/oren_study")
CLAUDE = shutil.which("claude") or "claude"
TOKEN_VAR = "CLAUDE_CODE_OAUTH_TOKEN"
RUNS = Path(os.environ.get("RUNNER_RUNS") or HERE / ".runs")   # same as runner.py: .runs/<n>/where says local|remote

def sh(cmd, env=None):
    alt_env = None
    if cmd and str(cmd[0]) in ("gh", "gh.exe"):
        orig = dict(os.environ if env is None else env); orig.pop(ghauth.OWNER, None)
        env = ghauth.apply(cmd, dict(os.environ if env is None else env))   # #363: the App token
        if env.get("GH_TOKEN") and env.get("GH_TOKEN") != orig.get("GH_TOKEN"): alt_env = orig   # #469: same call as the owner
    cap = ghcache.tick_cap()                            # #365: inside a watchdog tick: bounded, a timeout is an answer, never raises
    def raw(env_=env):
        left = ghcache.quick_left()
        if left is not None and left < 1: return 124, "skipped: no time left for GitHub (quick budget spent)"
        to = min(cap or 600, left) if left is not None else cap or 600
        try:
            p = subprocess.run(cmd, env=env_, capture_output=True, text=True, encoding="utf-8", errors="replace",
                               stdin=subprocess.DEVNULL, timeout=to,
                               creationflags=0x08000000 if os.name == "nt" else 0)   # #284: same as runner.no_window()
        except subprocess.TimeoutExpired:
            if not cap and left is None: raise
            return 124, f"timed out after {to:.0f} s: {' '.join(map(str, cmd))[:120]}"
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    return ghcache.call(list(map(str, cmd)), raw,       # #329: gh reads from the shared cache (panel, per-lane polls), rate limits retried
                        alt=(lambda: raw(alt_env)) if alt_env is not None else None, who="app" if alt_env is not None else "owner")   # #469: app limited -> owner at once

def clean_env():
    return {k: v for k, v in os.environ.items() if k != TOKEN_VAR}

def parse_start(out):
    m = re.search(r"https://claude\.ai/code/(session_\w+)\S*", out)
    if "Created cloud session" in out and m:
        return {"ok": True, "session": m[1], "url": m[0], "error": ""}
    lines = [l.strip() for l in out.splitlines() if l.strip()]
    err = next((l for l in lines if "rror" in l or "fail" in l), lines[-1] if lines else "no output")
    return {"ok": False, "session": "", "url": "", "error": err}

def launch(n, task, cwd, run=sh, name=None, model=None, desk=False):
    """#289: start a cloud session in a short-lived herdr terminal and return at once (no 180 s wait for its URL), so a
    watchdog tick can start one. -> {ok, error}. name: window name (default remote-<n>); desk (#306): label role=desk."""
    task = re.sub(r"[ \t]*[\r\n]+[ \t]*", " ", task.replace('"', "'")).strip()   # #390: cmd.exe cuts argv at a newline                             # double quotes break the Windows argv to bash ('file not found')
    labels = ["--label", "role=desk"] if desk else ["--label", f"issue={n}", "--label", "role=remote"]
    name = name or f"remote-{n}"
    run([HC, "rm", name])                                        # leftover finished terminal of an earlier start
    rc, out = run([HC, "run", "--bg", "--outlive-parent", "--name", name, "--cwd", str(cwd), *labels,
                   BASH, "-c", f'unset {TOKEN_VAR}; "$0" ' + (f"--model {model} " if model else "") + '--cloud "$1"', CLAUDE, task])   # model: #303
    if rc:
        return {"ok": False, "session": "", "url": "", "error": out.strip()[:300] or f"hc run exit {rc}"}
    return {"ok": True, "session": "", "url": "", "error": "", "name": name}

def start(n, task, cwd, run=sh, name=None, model=None):
    """cwd must be a checkout whose current commit is on GitHub (e.g. the main checkout): the session starts there.
    name (#306): a session that is not an issue's worker (the cloud desks) -> window <name>, label role=desk."""
    s = launch(n, task, cwd, run, name, model, desk=bool(name))
    if not s["ok"]: return s
    name = s["name"]
    run([HC, "wait", name, "--timeout", "180", "--json"])
    return parse_start(run([HC, "read", name, "--lines", "200"])[1])

def send(session, text, run=sh):
    rc, out = run([CLAUDE, "-p", "--cloud", session, "--output-format", "json", text], env=clean_env())
    for line in out.splitlines():
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if isinstance(d, dict) and d.get("ok"):
            return {"ok": True, "error": ""}
    return {"ok": False, "error": out.strip()[:300] or f"exit {rc}"}

MARK = re.compile(r"^\s*(RESULT: (DONE|STUCK)|QUESTION:).*", re.M)

def state_from(comments, pr):
    """Last RESULT:/QUESTION: line in the issue comments decides; none -> still working."""
    for body in reversed(comments):
        m = MARK.search(body or "")
        if m:
            line = m[0].strip()
            state = "question" if line.startswith("QUESTION:") else m[2].lower()
            return {"state": state, "line": line, "pr": pr}
    return {"state": "working", "line": "", "pr": pr}

STARTED = "Runner: started ("

def current_run(comments):
    """#236: only the comments from the latest 'Runner: started' comment on (a reopened issue's earlier RESULT is not this run's)."""
    k = max((i for i, c in enumerate(comments) if (c.get("body") or "").startswith(STARTED)), default=0)
    return comments[k:]

QUIET_MIN = 10           # #297: an open PR whose head has no new commit for this long = the worker is done (it forgot RESULT: DONE)
BY_PR = "done by PR (no RESULT line)"

def last_commit(pr):
    return max((c.get("committedDate", "") for c in (pr or {}).get("commits") or []), default="")

def pr_quiet(pr, now, quiet_min=QUIET_MIN, commit_iso=None):
    """Pure (#297): pr is open (not merged/closed) and its newest commit is at least quiet_min old."""
    if not pr or pr.get("mergedAt") or (pr.get("state") or "OPEN").upper() != "OPEN": return False
    t = _epoch(commit_iso if commit_iso is not None else last_commit(pr))
    return t > 0 and now - t >= quiet_min * 60

def log_line(text):
    import time
    try:
        RUNS.mkdir(parents=True, exist_ok=True)
        with open(RUNS / "runner.log", "a", encoding="utf-8") as f: f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + text + chr(10))
    except OSError: pass

def status(n, run=sh, since=None, now=None):
    """since = ISO UTC time (#133): only comments created at or after it count, so an earlier run's RESULT line is ignored.
    Without since (CLI) the latest 'Runner: started' comment marks the run start (#236).
    #297: no RESULT line but this run's PR is open and quiet QUIET_MIN min -> done (logged 'done by PR (no RESULT line)')."""
    import time
    rc, out = run(["gh", "issue", "view", str(n), "--repo", REPO, "--json", "comments"])
    cur = current_run(json.loads(out).get("comments", [])) if rc == 0 else []
    comments = [c.get("body", "") for c in cur if not since or c.get("createdAt", "") >= since]
    st = state_from(comments, None)
    if not since and cur and (cur[0].get("body") or "").startswith(STARTED): since = cur[0].get("createdAt", "")
    st["pr"] = find_pr(n, run, "all", st["line"], "number,url,isDraft,state,commits", since=since)   # #246: also a claude/* head; #264: this run's PR only
    if st["state"] == "working" and pr_quiet(st["pr"], time.time() if now is None else now):
        st["state"], st["line"] = "done", f"RESULT: DONE {st['pr'].get('url', '')} ({BY_PR})"
        log_line(f"#{n} {BY_PR}: PR #{st['pr'].get('number')} quiet {QUIET_MIN}+ min")
    return st

PR_URL = re.compile(r"/pull/(\d+)")

def fixes(body, n):
    """#246: the PR body says Fixes/Closes/Resolves #n (not #n0); #453: or Refs #n (a PR that must not close its issue)."""
    return bool(re.search(rf"\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?|refs?)\s+#{n}(?!\d)", body or "", re.I))

def _json(rc, out, default):
    try: return json.loads(out) if rc == 0 and out.strip() else default
    except ValueError: return default

def find_pr(n, run=sh, state="open", line=None, fields="number,headRefName", since=None):
    """#246: the PR of issue n (dict with `fields`, or None). Cloud sessions may only push claude/* branches, so:
    lane/<n> first, else the PR URL in this run's RESULT: DONE line (line=None: read from the issue), else a PR whose body says Fixes/Closes #n.
    state = open | merged | all. since (ISO UTC, #264): a PR found by lane/<n> or the Fixes line must be opened at/after it
    (an earlier run's PR is not this run's); the RESULT line's PR always counts."""
    fl = fields + (",createdAt" if since and "createdAt" not in fields.split(",") else "")
    def fresh(p):
        if not since: return True
        ok = p.get("createdAt", "") >= since
        if "createdAt" not in fields.split(","): p.pop("createdAt", None)
        return ok
    prs = [p for p in _json(*run(["gh", "pr", "list", "--repo", REPO, "--head", f"lane/{n}", "--state", state, "--json", fl]), []) if fresh(p)]
    if prs: return prs[0]
    if line is None:
        rc, out = run(["gh", "issue", "view", str(n), "--repo", REPO, "--json", "comments"])
        line = state_from([c.get("body", "") for c in current_run(_json(rc, out, {}).get("comments", []))], None)["line"]
    m = PR_URL.search(line or "") if (line or "").startswith("RESULT: DONE") else None
    if m:
        p = _json(*run(["gh", "pr", "view", m[1], "--repo", REPO, "--json", fields + ("" if "state" in fields.split(",") else ",state")]), {})
        if p.get("number") and (state == "all" or p.get("state", "").lower() == state):
            if "state" not in fields.split(","): p.pop("state", None)
            return p
    prs = _json(*run(["gh", "pr", "list", "--repo", REPO, "--state", state, "--limit", "100", "--json", fl + ",body"]), [])
    p = next((p for p in prs if fixes(p.get("body"), n) and fresh(p)), None)
    if p and "body" not in fields.split(","): p.pop("body", None)
    return p

def pr_for(n, run=sh, state="open"):
    """#246: (number, headRefName) of issue n's PR, or (None, None). Use the returned branch wherever lane/<n> was assumed."""
    p = find_pr(n, run, state) or {}
    return (p.get("number"), p.get("headRefName")) if p.get("number") else (None, None)


def answer_after_question(comments):
    """Pure (#135): the owner's answer to the last QUESTION: line in the issue comments ('' = none yet).
    Answer = the owner_q answer records after that question (#608: qwin.answer writes them; free comments never count).
    A later RESULT/QUESTION line, or a `Runner: started` (a resumed run used it), means nothing waits."""
    import owner_q                                   # lazy: owner_q imports runner, which imports this module
    bodies = [((c.get("body") if isinstance(c, dict) else c) or "").strip() for c in comments]
    q = max((i for i, b in enumerate(bodies) if (m := MARK.search(b)) and m[0].strip().startswith("QUESTION:")), default=-1)
    if q < 0: return ""
    out = []
    for b in bodies[q + 1:]:
        if MARK.search(b) or b.startswith(STARTED): return ""
        a = owner_q.record_answer(b)                 # #608: only the owner_q answer record is the owner; any other comment
        if a: out.append(a[1])                       # from the shared account (orchestrator, bots, sessions) is no answer
    return "\n".join(out)

VERDICT = re.compile(r"^\s*VERDICT:.*", re.M)

def verdict_from(comments):
    """#134: (last VERDICT line on its own line, that comment's body) from PR comments; ('', '') when none yet."""
    for body in reversed(comments):
        hits = VERDICT.findall(body or "")
        if hits:
            return hits[-1].strip(), body
    return "", ""

def review_status(pr, run=sh, since=None):
    """#134: the cloud reviewer's verdict comment on the PR -> {state: done|working, line, body}. since = ISO UTC start of this review round."""
    rc, out = run(["gh", "pr", "view", str(pr), "--repo", REPO, "--json", "comments"])
    try:
        comments = [c.get("body", "") for c in json.loads(out).get("comments", []) if not since or c.get("createdAt", "") >= since] if rc == 0 else []
    except ValueError:
        comments = []
    line, body = verdict_from(comments)
    return {"state": "done" if line else "working", "line": line, "body": body}

SESSION = re.compile(r"https://claude\.ai/code/session_\w+")
STALE_MIN = int(float(CFG.get("stuck_hours", 1)) * 60)   # same threshold as the runner's stuck rule and the watchdog alarm

WAIT_CORE = "waiting for core slot"   # #277: the run waits in the runner's core_slot(); listed, but no busy lane

def cloud_lane(issue, pr, commit_iso, now, manual=False, waiting=False, since=""):
    """Pure (#136): one cloud lane row from the issue (gh JSON with comments), its lane PR (or None) and the last commit time.
    manual = started by hand (remote.py start, no run dir) (#263). #277: waiting = the run waits for a core slot;
    since = ISO UTC start of this run: only activity from then on counts for 'last' / STALE."""
    comments = issue.get("comments") or []
    bodies = [c.get("body", "") for c in comments]
    st = state_from([c.get("body", "") for c in current_run(comments)], pr)    # #236: only this run's RESULT counts
    if (pr or {}).get("mergedAt"): st["state"] = "done"                        # #263: PR merged = done
    elif st["state"] == "working" and pr_quiet(pr, now, commit_iso=commit_iso or ""): st["state"] = "waiting review"   # #297: done by PR
    elif waiting and st["state"] == "working": st["state"] = WAIT_CORE
    sess = next((m[0] for b in reversed(bodies) for m in [SESSION.search(b or "")] if m), "")
    times = [t for t in [*(c.get("createdAt", "") for c in current_run(comments)), commit_iso or ""] if t and t >= since]
    last = max(times) if times else (since or issue.get("createdAt", ""))
    stale = bool(last) and now - _epoch(last) > STALE_MIN * 60
    return {"n": issue["number"], "title": issue.get("title", ""), "state": st["state"], "line": st["line"],
            "last": last, "stale": stale, "pr": (pr or {}).get("url", ""), "session": sess, "manual": manual}

def active(row):
    """#263: a cloud row that is still a lane (not done); done rows go to DONE and are not counted."""
    return row.get("state") != "done"

def busy(row):
    """#277: an active row that really holds a cloud lane (one waiting for a core slot does not)."""
    return active(row) and row.get("state") != WAIT_CORE

def run_since(n):
    """#277: ISO UTC of when this run started (.runs/<n>/where is written at the start), '' when unknown."""
    import time
    try: return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime((RUNS / str(n) / "where").stat().st_mtime))
    except OSError: return ""

def waiting_core(n, runs=None):
    """#277: the runner writes .runs/<n>/core_wait (its pid) while the run waits for a core slot."""
    try: pid = int(((runs or RUNS) / str(n) / "core_wait").read_text().strip())
    except (OSError, ValueError): return False
    if os.name != "nt":
        try: os.kill(pid, 0); return True
        except OSError: return False
    rc, out = sh(["tasklist", "/FI", f"PID eq {pid}", "/NH"])
    return f" {pid} " in out

def _epoch(iso):
    import calendar, time
    try: return calendar.timegm(time.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S"))
    except ValueError: return 0

def where(n):
    try: return (RUNS / str(n) / "where").read_text().strip()
    except OSError: return ""

def cloud(run=sh, now=None):
    """All open issues labelled cloud, plus in-progress ones whose run is remote (.runs/<n>/where, #236)."""
    import time
    now = time.time() if now is None else now
    def listed(label):
        rc, out = run(["gh", "issue", "list", "--repo", REPO, "--state", "open", "--label", label, "--limit", "50",
                       "--json", "number,title,createdAt,comments"])
        try: return json.loads(out) if rc == 0 and out.strip() else []
        except ValueError: return []
    issues = {i["number"]: i for i in listed("cloud")}
    for i in listed("in-progress"):
        if i["number"] not in issues and where(i["number"]) == "remote": issues[i["number"]] = i
    issues = list(issues.values())
    rc, out = run(["gh", "pr", "list", "--repo", REPO, "--state", "all", "--limit", "100", "--json", "number,url,headRefName,commits,body,mergedAt,state"])   # #329: what the cache holds
    allp = json.loads(out) if rc == 0 and out.strip() else []
    prs = {p["headRefName"]: p for p in allp}
    rows = []
    for i in sorted(issues, key=lambda i: i["number"]):
        pr = prs.get(f"lane/{i['number']}") or next((p for p in allp if fixes(p.get("body"), i["number"])), None)   # #246: claude/* head
        commit = max((c.get("committedDate", "") for c in (pr or {}).get("commits") or []), default="")
        if not pr:
            rc, out = run(["gh", "api", f"repos/{REPO}/branches/lane/{i['number']}", "--jq", ".commit.commit.committer.date"])
            commit = out.strip() if rc == 0 else ""
        rows.append(cloud_lane(i, pr, commit, now, manual=not (RUNS / str(i["number"])).is_dir(),
                               waiting=waiting_core(i["number"]), since=run_since(i["number"])))
    return rows

def main(argv):
    if len(argv) == 3 and argv[0] == "start":
        res = start(argv[1].lstrip("#"), argv[2], cwd=CFG.get("main_checkout", "."))
    elif len(argv) == 2 and argv[0] == "status":
        res = status(argv[1].lstrip("#"))
        if res["state"] == "question":                     # #193: the owner sees every question in ONE pinned issue
            import owner_q
            res["posted"] = owner_q.post(f"remote-{argv[1].lstrip('#')}", res["line"])
    elif len(argv) == 3 and argv[0] == "send":
        res = send(argv[1], argv[2])
    elif argv == ["cloud"]:
        print(json.dumps(cloud(), ensure_ascii=False)); return 0
    else:
        print(__doc__); return 2
    print(json.dumps(res, ensure_ascii=False))
    return 0 if res.get("ok", True) else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
