"""Cloud Claude sessions for the runner (#131 spike). See docs/agents/remote.md.

  python tools/runner/remote.py start <n> "<task>"     -> JSON {ok, session, url, error}
  python tools/runner/remote.py status <n>             -> JSON {state: working|done|stuck|question, line, pr}
  python tools/runner/remote.py send <session> "<text>" -> JSON {ok, error}

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
    name = f"remote-{n}"
    run([HC, "rm", name])                                        # leftover finished terminal of an earlier start
    rc, out = run([HC, "run", "--bg", "--outlive-parent", "--name", name, "--cwd", str(cwd), "--label", f"issue={n}",
                   "--label", "role=remote", BASH, "-c", f'unset {TOKEN_VAR}; exec "$0" --cloud "$1"', CLAUDE, task])
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

def status(n, run=sh):
    rc, out = run(["gh", "issue", "view", str(n), "--repo", REPO, "--json", "comments"])
    comments = [c.get("body", "") for c in json.loads(out).get("comments", [])] if rc == 0 else []
    rc, out = run(["gh", "pr", "list", "--repo", REPO, "--head", f"lane/{n}", "--state", "all",
                   "--json", "number,url,isDraft"])
    prs = json.loads(out) if rc == 0 and out.strip() else []
    return state_from(comments, prs[0] if prs else None)

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
    else:
        print(__doc__); return 2
    print(json.dumps(res, ensure_ascii=False))
    return 0 if res.get("ok", True) else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
