#!/usr/bin/env python3
"""Issue runner: one pass = pick ready GitHub issues, run each in its own headless Claude session
(worker -> reviewer -> integrate -> deploy -> close). Config: config.toml. Usage: runner.py [<issue>] [--dry-run]; no number = one pass over the ready queue."""
import json, os, re, shutil, subprocess, sys, tempfile, threading, time, tomllib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent                      # repo checkout (tools/runner/../..)
RUNS = HERE / ".runs"
CFG = tomllib.loads((HERE / "config.toml").read_text(encoding="utf-8"))
REPO, REMOTE, BRANCH, MODEL = CFG["repo"], CFG["remote"], CFG["branch"], CFG["model"]
BASH = CFG["bash"]
DRY = "--dry-run" in sys.argv
HC = CFG.get("hc", "")                            # herdr CLI; missing -> old hidden `claude -p` path
USE_HERDR = bool(HC) and Path(HC).exists() and not DRY and os.environ.get("RUNNER_NO_HERDR") != "1"
TERM = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--term=")), "")   # our own herdr terminal name (set by launch_self)
INTERACTIVE_NOTE = ("\nWhen you are completely finished, make the very last line of your final message exactly the marker line described above, "
                    "then stay open: the owner may open this terminal and ask you questions.")

COMMON_TOOLS = ["Read", "Glob", "Grep", "Bash(gh:*)"]
WORKER_TOOLS = COMMON_TOOLS + ["Edit", "Write", "Bash(git:*)", "Bash(node:*)", "Bash(npx:*)", "Bash(python3:*)",
                               "Bash(bash tools/:*)", "Bash(bash tests/:*)", "Bash(cd:*)", "Bash(ls:*)", "Bash(mkdir:*)"]
READ_TOOLS = COMMON_TOOLS + ["Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)", "Bash(git status:*)"]
REVIEW_LANE_TOOLS = READ_TOOLS + ["Bash(node:*)", "Bash(python3:*)"]

# ---------- pure logic (unit-tested in test_runner.py) ----------
def lane_of(labels):
    for l in ("core", "pack", "review"):
        if l in labels:
            return l
    return "core"

def blockers(body):
    """Issue numbers in 'Blocked by: #1, #2' lines."""
    out = []
    for line in (body or "").splitlines():
        if line.strip().lower().startswith("blocked by"):
            out += [int(x) for x in re.findall(r"#(\d+)", line)]
    return out

def select(issues, max_parallel):
    """issues: [{number, labels:[names], createdAt, body}] -> issues to start now (oldest first).
    An issue waits while any issue in its 'Blocked by:' line is still open (= in this list)."""
    open_nums = {i["number"] for i in issues}
    active = [i for i in issues if "in-progress" in i["labels"]]
    core_busy = any(lane_of(i["labels"]) == "core" for i in active)
    slots = max_parallel - len(active)
    ready = [i for i in issues if "ready-for-agent" in i["labels"]
             and "in-progress" not in i["labels"] and "blocked" not in i["labels"]
             and not any(b in open_nums for b in blockers(i.get("body")))]
    chosen = []
    for i in sorted(ready, key=lambda i: ("bug" not in i["labels"], i["createdAt"])):   # bugs first
        if slots <= 0:
            break
        if lane_of(i["labels"]) == "core":
            if core_busy:
                continue
            core_busy = True
        chosen.append(i); slots -= 1
    return chosen

def find_marker(text, prefix):
    """Last RESULT:/VERDICT: line on a terminal screen (skips the echoed prompt: it has backticks / placeholders)."""
    hits = []
    for l in text.splitlines():
        s = l.strip().lstrip("\u25cf\u23fa\u2022").strip()
        if s.startswith(prefix) and "`" not in s and "<why>" not in s and " or " not in s:
            hits.append(s)
    return hits[-1] if hits else ""

def last_line(text, prefix):
    hits = [l.strip() for l in text.splitlines() if l.strip().startswith(prefix)]
    return hits[-1] if hits else ""

# ---------- helpers ----------
def env_file():
    out = {}
    try:
        for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
            m = re.match(r"\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*)$", line)
            if m and not line.lstrip().startswith("#"):
                out[m[1]] = m[2].strip().strip("\"'")
    except OSError:
        pass
    return out

SECRETS = [v for k, v in env_file().items() if v and len(v) > 6 and re.search("TOKEN|KEY|SECRET", k)]
def redact(t):
    for s in SECRETS:
        t = t.replace(s, "***")
    return t

def run(cmd, cwd=None, env=None, input=None, log=None, timeout=None):
    e = dict(os.environ); e.update(env or {})
    e["PATH"] = CFG["extra_path"].replace("/c/", "C:/", 1) + os.pathsep + e["PATH"]
    p = subprocess.run(cmd, cwd=cwd, env=e, input=input, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=timeout)
    out = redact((p.stdout or "") + (p.stderr or ""))
    if log:
        with open(log, "a", encoding="utf-8") as f:
            f.write(f"\n$ {' '.join(map(str, cmd))[:300]}\n{out}\n[exit {p.returncode}]\n")
    return p.returncode, out

def gh(*args, **kw):
    return run(["gh", *args, "--repo", REPO], **kw)

def now():
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")

# ---------- pipeline for one issue ----------
class Blocked(Exception):
    pass

def pid_alive(pid):
    rc, out = run(["tasklist", "/FI", f"PID eq {pid}", "/NH"])
    return f" {pid} " in out

class FileLock:
    """Cross-process lock: lock file holding our pid; stale (dead pid) locks are taken over. wait=0: give up at once."""
    def __init__(self, name, wait=0):
        self.path, self.wait = RUNS / f"{name}.lock", wait
    def held_by_other(self):
        try:
            return pid_alive(int(self.path.read_text().strip()))
        except (OSError, ValueError):
            return False
    def __enter__(self):
        RUNS.mkdir(exist_ok=True)
        while True:
            try:
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY); os.write(fd, str(os.getpid()).encode()); os.close(fd)
                return self
            except FileExistsError:
                if not self.held_by_other():
                    self.path.unlink(missing_ok=True); continue
                if not self.wait: raise Blocked("busy")
                time.sleep(20)
    def __exit__(self, *a):
        self.path.unlink(missing_ok=True)

def claude_hidden(prompt, cwd, tools, log):
    cmd = [shutil.which("claude") or "claude", "-p", "--model", MODEL, "--permission-mode", "acceptEdits",
           "--allowedTools", *tools]
    # prompt goes via stdin; "--allowedTools" is variadic so keep it last
    rc, out = run(cmd, cwd=cwd, input=prompt, log=log, timeout=3 * 3600)
    return out

# ---------- herdr terminals ----------
def hc(*args, timeout=300):
    return run([HC, *args], timeout=timeout)

def hc_json(*args):
    rc, out = hc(*args)
    for line in reversed(out.strip().splitlines()):
        try:
            return json.loads(line)
        except ValueError:
            continue
    return {}

def parent_args():
    """Notes go to the main session: config `parent`, else the parent of our own run-<n> terminal, else herdr's default."""
    p = CFG.get("parent", "")
    if not p and TERM:
        p = hc_json("get", TERM, "--json").get("parent", "")
    return ["--parent", p] if p else []

def agent(name, prompt, cwd, tools, log, marker, n, role):
    """Run an INTERACTIVE claude in a herdr terminal the owner can open; return (screen text, marker line).
    Terminals are left open afterwards. Falls back to the hidden `claude -p` when herdr is unavailable."""
    if not USE_HERDR:
        out = claude_hidden(prompt, cwd, tools, log)
        return out, last_line(out, marker)
    # bash wrapper only puts the python3 shim on PATH; the prompt goes after `--` ("--allowedTools" is variadic)
    cmd = [HC, "run", "--bg", "--name", name, "--cwd", str(cwd), "--label", f"issue={n}", "--label", f"role={role}", *parent_args(),
           BASH, "-c", 'export PATH="$1:$PATH"; shift; exec "$@"', "_", CFG["extra_path"],
           shutil.which("claude") or "claude", "--model", MODEL, "--permission-mode", "acceptEdits",
           "--allowedTools", *tools, "--", prompt + INTERACTIVE_NOTE]
    rc, out = run(cmd, log=log)
    if rc: raise Blocked(f"cannot start terminal {name}: {out.strip()[:200]}")
    deadline, screen = time.time() + 3 * 3600, ""
    try:
        while time.time() < deadline:
            info = hc_json("wait", name, "--timeout", "120", "--json")
            rc, screen = hc("read", name, "--lines", "400")
            if info.get("status") == "blocked" and "trust this folder" in screen:   # fresh worktree: accept the folder-trust dialog
                hc("keys", name, "down", "enter"); time.sleep(5); continue
            if find_marker(screen, marker) and info.get("status") in ("done", "idle", None):
                break
            if hc_json("get", name, "--json").get("state") == "finished":
                break
            time.sleep(10)           # agent idle without a marker (e.g. the owner is talking to it): look again later
        else:
            raise Blocked(f"{name}: no {marker} line after 3h")
    finally:
        rc, full = hc("read", name, "--lines", "3000")
        Path(log).with_suffix(".screen.txt").write_text(redact(full), encoding="utf-8")
    return screen, find_marker(screen, marker)

def spawn(extra_args):
    """From inside a run terminal: start another run (one issue, or a pass) as its own terminal, reporting to the same main session."""
    name = f"run-{extra_args[0].lstrip('#')}" if extra_args else f"run-pass-{int(time.time()) % 100000}"
    parent = CFG.get("parent") or (hc_json("get", TERM, "--json").get("parent", "") if TERM else "")
    cmd = [HC, "run", "--bg", "--outlive-parent", "--name", name, "--cwd", str(ROOT), "--label", "role=runner"]
    if parent: cmd += ["--parent", parent]
    cmd += [sys.executable, str(HERE / "runner.py"), *extra_args, f"--term={name}"]
    rc, out = run(cmd)
    print(out.strip() or f"started terminal {name}")
    return rc

def launch_self():
    """run.cmd entry: start this whole run as terminal run-<n> (its exit note goes to the main session) and return at once."""
    pos = [a for a in sys.argv[1:] if not a.startswith("--")]
    name = f"run-{pos[0].lstrip('#')}" if pos else "run-pass"
    cmd = [HC, "run", "--bg", "--outlive-parent", "--name", name, "--cwd", str(ROOT), "--label", "role=runner",
           sys.executable, str(HERE / "runner.py"), *sys.argv[1:], f"--term={name}"]
    rc, out = run(cmd)
    print(out.strip() or f"started terminal {name}")
    return rc

def worker_prompt(n, lane, review_text=None, bug=False):
    base = (f"You are an unattended worker for GitHub issue #{n} in repo {REPO} (lane: {lane}). Read CLAUDE.md and FLOW.md, then the issue "
            f"(`gh issue view {n} --repo {REPO} --comments`). Work only inside this worktree (your cwd). Implement ONLY what the issue asks.\n")
    if lane == "review":
        return base + (f"This is a read-only review issue: change NO files, make no commits, open no PR. Post your report as ONE issue comment "
                       f"(`gh issue comment {n} --repo {REPO} --body-file <file>`; write the file under oren2/tests/.tmp/). "
                       "End your output with a line `RESULT: DONE` or `RESULT: STUCK <why>`.")
    if bug:
        base += ("This is a BUG: first reproduce it with a failing test (add it to the relevant suite in oren2/tests/), then fix it so the test passes; "
                 "say the root cause in the PR body.\n")
    steps = ("Steps: 1) implement; 2) python3 build_talents.py (in oren2/, PATH already has python3) and run the build + the suites for what you changed, muted "
             "(see FLOW.md); 3) for each changed screen take screenshots at phone 390x844 and desktop 1366x768 into "
             f"oren2/tests/.tmp/shots-{n}/ and LOOK at them (simple, one main action, Hebrew with nikud); 4) commit (do NOT commit oren2/index.html "
             f"or oren2/cf/public/index.html, node_modules, package*.json, tests/.tmp); 5) `git push -u {REMOTE} lane/{n}`; 6) open a PR to {BRANCH} with "
             f"`gh pr create --repo {REPO} --base {BRANCH} --head lane/{n}` whose body contains `Closes #{n}` (skip if a PR already exists). "
             "Never deploy, never force-push. If blocked or the issue is unclear, stop and say why. "
             "End your output with a line `RESULT: DONE` or `RESULT: STUCK <why>`.")
    if review_text:
        steps += ("\nThe PR already exists and a reviewer asked for fixes. Fix exactly these points on the same branch (new commit, push, no new PR), "
                  "re-run tests and screenshots:\n---\n" + review_text[-6000:] + "\n---")
    return base + steps

def review_prompt(n, pr):
    return (f"You are a fresh, read-only reviewer for PR #{pr} (issue #{n}) in {REPO}. You may not edit files. Read CLAUDE.md, the issue "
            f"(`gh issue view {n} --repo {REPO}`), the diff (`gh pr diff {pr} --repo {REPO}`, ignore the built index.html files) and the screenshots in "
            f"oren2/tests/.tmp/shots-{n}/ (look at them). Check: correctness vs the issue, simplicity (one main action per screen), Hebrew with correct "
            "nikud, facts correct, no unrelated changes. Post ONE comment with `gh pr comment " + f"{pr} --repo {REPO} --body-file <file>` (write the file under "
            "oren2/tests/.tmp/; this is the only file you may write, via the Bash echo/redirect). Print the same comment as your output. "
            "The very last line must be `VERDICT: PASS` or `VERDICT: FIX` (FIX = list the concrete points above it).")

def set_labels(n, add=(), remove=()):
    args = ["issue", "edit", str(n)]
    for a in add: args += ["--add-label", a]
    for r in remove: args += ["--remove-label", r]
    gh(*args)

def block(n, why, log, human=False):
    tail = ""
    try:
        tail = "\n".join(Path(log).read_text(encoding="utf-8").splitlines()[-20:])
    except OSError:
        pass
    set_labels(n, add=["blocked"] + (["ready-for-human"] if human else []), remove=["in-progress"])
    gh("issue", "comment", str(n), "--body", redact(f"Runner blocked: {why}\n\nLast log lines:\n```\n{tail[-2500:]}\n```"))

def find_pr(n):
    rc, out = gh("pr", "list", "--head", f"lane/{n}", "--state", "open", "--json", "number")
    try:
        return json.loads(out)[0]["number"]
    except (ValueError, IndexError, KeyError):
        return None

def deploy_text(log):
    tok = env_file().get("CLOUDFLARE_API_TOKEN", "")
    if not tok:
        return "not deployed: no token"
    env = {"CLOUDFLARE_API_TOKEN": tok}
    for k, v in env_file().items():
        if k.startswith("CLOUDFLARE_"): env[k] = v
    rc, out = run([BASH, "oren2/cf/tools/deploy.sh"], cwd=ROOT, env=env, log=log, timeout=900)
    if rc != 0 or not out.strip().startswith("ok"):
        raise Blocked("deploy failed")
    url = out.strip().splitlines()[-1]
    rc, _ = run(["node", "oren2/cf/tools/pregen.js"], cwd=ROOT, env=env, log=log, timeout=1800)
    return f"deployed {url}" + ("" if rc == 0 else " (pregen failed, see log)")

def process(issue):
    n = issue["number"]
    try:
        with FileLock(f"issue-{n}"):
            if lane_of(issue["labels"]) == "core":
                with FileLock("core", wait=True):   # a second core issue waits here, it does not fail
                    return process_locked(issue)
            return process_locked(issue)
    except Blocked:
        return "BLOCKED: already running"

def process_locked(issue):
    n = issue["number"]; lane = lane_of(issue["labels"])
    d = RUNS / str(n); d.mkdir(parents=True, exist_ok=True)
    log = d / "run.log"
    wt = Path(CFG["worktree_prefix"] + str(n))
    try:
        set_labels(n, add=["in-progress"]); gh("issue", "comment", str(n), "--body", f"Runner: started ({lane} lane, {MODEL}).")
        if wt.exists() or run(["git", "rev-parse", "--verify", f"lane/{n}"], cwd=ROOT)[0] == 0:   # leftovers from an earlier try
            run(["git", "worktree", "remove", "--force", str(wt)], cwd=ROOT, log=log)
            run(["git", "branch", "-D", f"lane/{n}"], cwd=ROOT, log=log)
            if not find_pr(n):
                run(["git", "push", REMOTE, "--delete", f"lane/{n}"], cwd=ROOT, log=log)
        rc, _ = run([BASH, "tools/lane.sh", str(n), BRANCH], cwd=ROOT, env={"REMOTE": REMOTE}, log=log)
        if rc: raise Blocked("lane.sh failed")

        out, res = agent(f"issue-{n}", worker_prompt(n, lane, bug="bug" in issue["labels"]), wt, WORKER_TOOLS if lane != "review" else REVIEW_LANE_TOOLS,
                         d / "worker1.log", "RESULT:", n, "worker")
        (d / "worker1.out").write_text(redact(out), encoding="utf-8")
        if not res.startswith("RESULT: DONE"):
            raise Blocked(res or "worker gave no RESULT line")
        if lane == "review":
            gh("issue", "close", str(n), "--comment", "Review report posted above (runner).")
            set_labels(n, remove=["in-progress"]); return "DONE report posted"

        verdict = ""
        for rnd in (1, 2):
            pr = find_pr(n)
            if not pr: raise Blocked("worker said DONE but no open PR for lane/%d" % n)
            rv, verdict = agent(f"review-{n}" + ("" if rnd == 1 else f"-{rnd}"), review_prompt(n, pr), wt, READ_TOOLS,
                                d / f"review{rnd}.log", "VERDICT:", n, "reviewer")
            (d / f"review{rnd}.out").write_text(redact(rv), encoding="utf-8")
            if verdict.startswith("VERDICT: PASS"):
                break
            if not verdict.startswith("VERDICT: FIX"):
                raise Blocked(verdict or "reviewer gave no VERDICT line")
            if rnd == 2:
                block(n, "reviewer asked for fixes twice; needs a human", log, human=True); return "BLOCKED: reviewer asked for fixes twice; needs a human"
            out, res = agent(f"issue-{n}-fix", worker_prompt(n, lane, rv, bug="bug" in issue["labels"]), wt, WORKER_TOOLS, d / "worker2.log", "RESULT:", n, "worker")
            if not res.startswith("RESULT: DONE"):
                raise Blocked(res or "fix worker gave no RESULT line")

        with FileLock("integrate", wait=True):
            rc, out = run([BASH, "tools/integrate.sh", f"lane/{n}", BRANCH], cwd=ROOT,
                          env={"REMOTE": REMOTE, "JOBS": "4", "RUNNER": "1"}, log=log, timeout=3600)
            if rc:
                run(["git", "merge", "--abort"], cwd=ROOT, log=log)
                raise Blocked(f"integrate.sh exit {rc}")
            dep = deploy_text(log)
        gh("issue", "close", str(n), "--comment", f"Merged to {BRANCH}, tests green, {dep}.")
        set_labels(n, remove=["in-progress"])
        run(["git", "worktree", "remove", "--force", str(wt)], cwd=ROOT, log=log)
        return f"DONE {dep}"
    except Blocked as e:
        block(n, str(e), log); return f"BLOCKED: {e}"
    except Exception as e:                      # any crash: never leave the issue in-progress
        block(n, f"runner error: {e!r}", log); return f"BLOCKED: runner error {e!r}"

# ---------- main ----------
def issue_by_number(n):
    rc, out = gh("issue", "view", str(n), "--json", "number,labels,createdAt,state,title")
    if rc: raise SystemExit(f"cannot read #{n}: {out.strip()[:200]}")
    d = json.loads(out)
    if d["state"] != "OPEN": raise SystemExit(f"#{n} is not open")
    return {**d, "labels": [l["name"] for l in d["labels"]]}

def ensure_labels():
    for lbl, color in (("in-progress", "fbca04"), ("blocked", "b60205"), ("ready-for-human", "0e8a16")):
        gh("label", "create", lbl, "--color", color, "--force")   # no-op when present

def log_line(line):
    RUNS.mkdir(exist_ok=True)
    with open(RUNS / "runner.log", "a", encoding="utf-8") as f: f.write(line + chr(10))
    print(line)

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if USE_HERDR and not TERM:        # started from run.cmd / a shell: re-launch inside a herdr terminal and return at once
        return launch_self()
    if args:   # run.cmd <issue>: run that one issue now (ignores the queue label and the parallel cap)
        n = int(args[0].lstrip("#"))
        issue = issue_by_number(n)
        if DRY:
            print(f"[dry-run] would run #{n} ({lane_of(issue['labels'])}): {issue['title']}"
                  + ("; core: waits for any running core issue" if lane_of(issue["labels"]) == "core" else "")); return 0
        ensure_labels()
        res = process(issue)
        log_line(f"{now()} #{n}: {res}")
        print(f"ISSUE {n}: {res}")
        if USE_HERDR and TERM: spawn([])        # keep the lanes full: a fresh pass picks the next ready issues
        return 0
    rc, out = gh("issue", "list", "--state", "open", "--limit", "200", "--json", "number,labels,createdAt,updatedAt,title,body")
    if rc: print("gh failed:", out); return 1
    issues = [{**i, "labels": [l["name"] for l in i["labels"]]} for i in json.loads(out)]
    chosen = [c for c in select(issues, CFG["max_parallel"]) if not FileLock(f"issue-{c['number']}").held_by_other()]
    cutoff = CFG["stuck_hours"] * 3600
    stuck = [i for i in issues if "in-progress" in i["labels"] and not FileLock(f"issue-{i['number']}").held_by_other()
             and (time.time() - datetime.fromisoformat(i["updatedAt"].replace("Z", "+00:00")).timestamp()) > cutoff]
    if DRY:
        print(f"[dry-run] repo={REPO} branch={BRANCH} model={MODEL} max_parallel={CFG['max_parallel']}")
        print(f"[dry-run] open issues: {len(issues)}; in-progress: {sum('in-progress' in i['labels'] for i in issues)}")
        for c in chosen: print(f"[dry-run] would start #{c['number']} ({lane_of(c['labels'])}): {c['title']}")
        for s in stuck: print(f"[dry-run] would block stuck #{s['number']} (in-progress, idle > {CFG['stuck_hours']}h, no runner process)")
        if not chosen and not stuck: print("[dry-run] nothing to do")
        return 0
    ensure_labels()
    for s in stuck:
        set_labels(s["number"], add=["blocked"], remove=["in-progress"])
        gh("issue", "comment", str(s["number"]), "--body", f"Runner: in-progress for over {CFG['stuck_hours']}h with no runner process; marked blocked.")
    results = []
    if chosen and USE_HERDR and TERM:
        for c in chosen:
            set_labels(c["number"], add=["in-progress"])          # claim now so the next pass doesn't pick it twice
            spawn([str(c["number"])])
        results = [(c["number"], "started") for c in chosen]
    elif chosen:
        with ThreadPoolExecutor(max_workers=len(chosen)) as ex:
            results = list(ex.map(lambda c: (c["number"], process(c)), chosen))
    log_line(f"{now()} pass: started={len(chosen)} stuck={len(stuck)} " + " ".join(f"#{n}:{r}" for n, r in results))
    for n, r in results: print(f"ISSUE {n}: {r}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
