"""Cloud Claude sessions for the runner (#131 spike). See docs/agents/remote.md.

  python tools/runner/remote.py start <n> "<task>"     -> JSON {ok, session, url, error}
  python tools/runner/remote.py status <n>             -> JSON {state: working|done|stuck|question, line, pr}
  (runner only) review_status(pr, since)               -> {state: working|done, line: last VERDICT line of a PR comment, body} (#134)
  python tools/runner/remote.py send <session> "<text>" -> JSON {ok, error}
  python tools/runner/remote.py cloud                  -> JSON list, one per open issue labelled cloud (#136) or in-progress with a remote run (#236):
      {n, title, state, line, last, stale, pr, session}  last = ISO UTC of the newest comment/commit

start needs a TTY (`claude --cloud` refuses piped output), so it runs inside a herdr terminal.
The herdr server's env has CLAUDE_CODE_OAUTH_TOKEN (inference-only scope -> 403 on cloud);
it is removed so claude uses the stored claude.ai login.
State comes from GitHub (the CLI's agents/logs do not list cloud sessions)."""
import json, os, re, shutil, subprocess, sys, tomllib
from pathlib import Path

HERE = Path(__file__).resolve().parent
CFG = tomllib.loads((HERE / "config.toml").read_text(encoding="utf-8"))
HC = CFG.get("hc", "hc")
BASH = CFG.get("bash", "bash")
REPO = CFG.get("repo", "igalgerman/oren_study")
CLAUDE = shutil.which("claude") or "claude"
TOKEN_VAR = "CLAUDE_CODE_OAUTH_TOKEN"
RUNS = Path(os.environ.get("RUNNER_RUNS") or HERE / ".runs")   # same as runner.py: .runs/<n>/where says local|remote

def sh(cmd, env=None):
    p = subprocess.run(cmd, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace",
                       stdin=subprocess.DEVNULL, timeout=600)
    return p.returncode, (p.stdout or "") + (p.stderr or "")

def clean_env():
    return {k: v for k, v in os.environ.items() if k != TOKEN_VAR}

def parse_start(out):
    m = re.search(r"https://claude\.ai/code/(session_\w+)\S*", out)
    if "Created cloud session" in out and m:
        return {"ok": True, "session": m[1], "url": m[0], "error": ""}
    lines = [l.strip() for l in out.splitlines() if l.strip()]
    err = next((l for l in lines if "rror" in l or "fail" in l), lines[-1] if lines else "no output")
    return {"ok": False, "session": "", "url": "", "error": err}

def start(n, task, cwd, run=sh):
    """cwd must be a checkout whose current commit is on GitHub (e.g. the main checkout): the session starts there."""
    task = task.replace('"', "'")                             # double quotes break the Windows argv to bash ('file not found')
    name = f"remote-{n}"
    run([HC, "rm", name])                                        # leftover finished terminal of an earlier start
    rc, out = run([HC, "run", "--bg", "--outlive-parent", "--name", name, "--cwd", str(cwd), "--label", f"issue={n}",
                   "--label", "role=remote", BASH, "-c", f'unset {TOKEN_VAR}; "$0" --cloud "$1"', CLAUDE, task])
    if rc:
        return {"ok": False, "session": "", "url": "", "error": out.strip()[:300] or f"hc run exit {rc}"}
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

def status(n, run=sh, since=None):
    """since = ISO UTC time (#133): only comments created at or after it count, so an earlier run's RESULT line is ignored.
    Without since (CLI) the latest 'Runner: started' comment marks the run start (#236)."""
    rc, out = run(["gh", "issue", "view", str(n), "--repo", REPO, "--json", "comments"])
    comments = [c.get("body", "") for c in current_run(json.loads(out).get("comments", []))
                if not since or c.get("createdAt", "") >= since] if rc == 0 else []
    st = state_from(comments, None)
    st["pr"] = find_pr(n, run, "all", st["line"], "number,url,isDraft")      # #246: also a claude/* head
    return st

PR_URL = re.compile(r"/pull/(\d+)")

def fixes(body, n):
    """#246: the PR body says Fixes/Closes/Resolves #n (not #n0)."""
    return bool(re.search(rf"\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#{n}(?!\d)", body or "", re.I))

def _json(rc, out, default):
    try: return json.loads(out) if rc == 0 and out.strip() else default
    except ValueError: return default

def find_pr(n, run=sh, state="open", line=None, fields="number,headRefName"):
    """#246: the PR of issue n (dict with `fields`, or None). Cloud sessions may only push claude/* branches, so:
    lane/<n> first, else the PR URL in this run's RESULT: DONE line (line=None: read from the issue), else a PR whose body says Fixes/Closes #n.
    state = open | merged | all."""
    prs = _json(*run(["gh", "pr", "list", "--repo", REPO, "--head", f"lane/{n}", "--state", state, "--json", fields]), [])
    if prs: return prs[0]
    if line is None:
        rc, out = run(["gh", "issue", "view", str(n), "--repo", REPO, "--json", "comments"])
        line = state_from([c.get("body", "") for c in current_run(_json(rc, out, {}).get("comments", []))], None)["line"]
    m = PR_URL.search(line or "") if (line or "").startswith("RESULT: DONE") else None
    if m:
        p = _json(*run(["gh", "pr", "view", m[1], "--repo", REPO, "--json", fields + ",state"]), {})
        if p.get("number") and (state == "all" or p.get("state", "").lower() == state):
            if "state" not in fields.split(","): p.pop("state", None)
            return p
    prs = _json(*run(["gh", "pr", "list", "--repo", REPO, "--state", state, "--limit", "100", "--json", fields + ",body"]), [])
    p = next((p for p in prs if fixes(p.get("body"), n)), None)
    if p and "body" not in fields.split(","): p.pop("body", None)
    return p

def pr_for(n, run=sh, state="open"):
    """#246: (number, headRefName) of issue n's PR, or (None, None). Use the returned branch wherever lane/<n> was assumed."""
    p = find_pr(n, run, state) or {}
    return (p.get("number"), p.get("headRefName")) if p.get("number") else (None, None)

OWNER_ANSWER = re.compile(r"^OWNER ANSWER(?: \([^)]*\))?:\s*(.*)", re.S)   # qwin.answer's comment on the issue
CLAUDE_FOOTER = "Generated by [Claude Code]"                                  # every comment a Claude session posts ends with it

def answer_after_question(comments):
    """Pure (#135): the owner's answer to the last QUESTION: line in the issue comments ('' = none yet).
    Answer = the comments after that question that no tool wrote (runner `Runner:`/`Parked`, owner_q, a Claude session).
    A later RESULT/QUESTION line, or a `Runner: started` (a resumed run used it), means nothing waits."""
    bodies = [((c.get("body") if isinstance(c, dict) else c) or "").strip() for c in comments]
    q = max((i for i, b in enumerate(bodies) if (m := MARK.search(b)) and m[0].strip().startswith("QUESTION:")), default=-1)
    if q < 0: return ""
    out = []
    for b in bodies[q + 1:]:
        if MARK.search(b) or b.startswith(STARTED): return ""
        m = OWNER_ANSWER.match(b)
        if m: out.append(m[1].strip()); continue
        if not b or b.startswith(("Runner", "Parked", "Reviewer PURPLE")) or "<!-- owner_q -->" in b or CLAUDE_FOOTER in b: continue
        out.append(b)
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

def cloud_lane(issue, pr, commit_iso, now):
    """Pure (#136): one cloud lane row from the issue (gh JSON with comments), its lane PR (or None) and the last commit time."""
    comments = issue.get("comments") or []
    bodies = [c.get("body", "") for c in comments]
    st = state_from([c.get("body", "") for c in current_run(comments)], pr)    # #236: only this run's RESULT counts
    sess = next((m[0] for b in reversed(bodies) for m in [SESSION.search(b or "")] if m), "")
    times = [t for t in [*(c.get("createdAt", "") for c in comments), commit_iso or ""] if t]
    last = max(times) if times else issue.get("createdAt", "")
    stale = bool(last) and now - _epoch(last) > STALE_MIN * 60
    return {"n": issue["number"], "title": issue.get("title", ""), "state": st["state"], "line": st["line"],
            "last": last, "stale": stale, "pr": (pr or {}).get("url", ""), "session": sess}

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
    rc, out = run(["gh", "pr", "list", "--repo", REPO, "--state", "all", "--limit", "200", "--json", "number,url,headRefName,commits,body"])
    allp = json.loads(out) if rc == 0 and out.strip() else []
    prs = {p["headRefName"]: p for p in allp}
    rows = []
    for i in sorted(issues, key=lambda i: i["number"]):
        pr = prs.get(f"lane/{i['number']}") or next((p for p in allp if fixes(p.get("body"), i["number"])), None)   # #246: claude/* head
        commit = max((c.get("committedDate", "") for c in (pr or {}).get("commits") or []), default="")
        if not pr:
            rc, out = run(["gh", "api", f"repos/{REPO}/branches/lane/{i['number']}", "--jq", ".commit.commit.committer.date"])
            commit = out.strip() if rc == 0 else ""
        rows.append(cloud_lane(i, pr, commit, now))
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
