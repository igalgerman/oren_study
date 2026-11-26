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
INTEG = Path(CFG["worktree_prefix"] + "integrate")       # own checkout for merge/test/deploy, so a dirty orchestrator checkout never blocks it
INTERACTIVE_NOTE = ("\nWhen you are completely finished, make the very last line of your final message exactly the marker line described above, "
                    "then stay open: the owner may open this terminal and ask you questions.\n"
                    "If you need a decision from the owner, do NOT wait silently: first print one line `QUESTION: <short question, with options>`, "
                    "then ask it with the AskUserQuestion tool (this marks your window as waiting in Herdr, with a sound and an alert). "
                    "The owner answers there, or the orchestrator relays his answer; then continue.")

COMMON_TOOLS = ["Read", "Glob", "Grep", "Skill", "AskUserQuestion", "Bash(gh:*)"]
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

def priority_of(labels):
    """0-3 from a P0..P3 label; P2 (normal) when missing."""
    for n in range(4):
        if f"P{n}" in labels:
            return n
    return 2

def blockers(body):
    """Issue numbers in 'Blocked by: #1, #2' lines."""
    out = []
    for line in (body or "").splitlines():
        if line.strip().lower().startswith("blocked by"):
            out += [int(x) for x in re.findall(r"#(\d+)", line)]
    return out

def select(issues, max_parallel, max_core=1):
    """issues: [{number, labels:[names], createdAt, body}] -> issues to start now (oldest first).
    An issue waits while any issue in its 'Blocked by:' line is still open (= in this list)."""
    open_nums = {i["number"] for i in issues}
    active = [i for i in issues if "in-progress" in i["labels"]]
    core_running = sum(lane_of(i["labels"]) == "core" for i in active)
    slots = max_parallel - len(active)
    ready = [i for i in issues if "ready-for-agent" in i["labels"]
             and "in-progress" not in i["labels"] and "blocked" not in i["labels"]
             and not any(b in open_nums for b in blockers(i.get("body")))]
    chosen = []
    for i in sorted(ready, key=lambda i: ("bug" not in i["labels"], priority_of(i["labels"]), i["createdAt"])):   # bugs first, then P0..P3, then oldest
        if slots <= 0:
            break
        if lane_of(i["labels"]) == "core":
            if core_running >= max_core:
                continue
            core_running += 1
        chosen.append(i); slots -= 1
    return chosen

def conflict_files(out):
    """File names listed after the CONFLICTS line of integrate.sh output."""
    lines = out.splitlines()
    for k, l in enumerate(lines):
        if l.startswith(("CONFLICTS", "CI RED")):
            return [x.strip() for x in lines[k + 1:] if x.strip() and not x.startswith(("[", "$"))]
    return []

def integrate_with_resolve(integrate, resolve, max_rounds=2):
    """integrate() -> (rc, out); resolve(files) -> True when the worker merged main in and pushed.
    rc 2 (merge conflict), 5 (push rejected / CI timeout) or 6 (CI red after one rerun, #74) -> up to max_rounds resolve rounds, each followed by a retry.
    Returns ('merged', out) | ('giveup', files, out) | ('failed', rc, out)."""
    files = []
    for rnd in range(max_rounds + 1):
        rc, out = integrate()
        if rc == 0:
            return ("merged", out)
        if rc not in (2, 5, 6):
            return ("failed", rc, out)
        files = conflict_files(out) or files
        if rnd == max_rounds:
            return ("giveup", files, out)
        if not resolve(files):
            return ("failed", rc, out)

def ci_verdict(checks):
    """Pure (#74): `gh pr checks --json name,bucket` list -> 'none' (no checks yet) | 'pending' | 'red' | 'green'.
    A missing or pending check is never green; skipped checks are ignored."""
    b = [(c.get("name", ""), c.get("bucket", "")) for c in checks or []]
    b = [x for x in b if x[1] != "skipping"]
    if not b: return "none"
    if any(x[1] in ("fail", "cancel") for x in b): return "red"
    if any(x[1] != "pass" for x in b): return "pending"
    return "green"

def failed_checks(checks):
    return [c.get("name", "?") for c in checks or [] if c.get("bucket") in ("fail", "cancel")]

def ci_merge(get_checks, rerun, merge, sleep, timeout_s=3600, poll_s=30, max_reruns=1, stamp=None, max_stale=10):
    """Pure decision loop (#74): wait for the PR checks, then merge. Red -> rerun the failed jobs once (flaky), still red -> send back to the worker.
    stamp() = run id/status/attempt of the latest run: after a rerun, red is ignored until it changes (the old failed run is still shown for a while).
    Returns ('merged',) | ('red', [names]) | ('timeout',) | ('merge-failed',)."""
    waited, reruns, old, stale = 0, 0, None, 0
    while True:
        checks = get_checks()
        v = ci_verdict(checks)
        if v == "green":
            return ("merged",) if merge() else ("merge-failed",)
        if v == "red":
            if reruns and stamp and old is not None and stamp() == old and stale < max_stale:
                stale += 1; sleep(poll_s); waited += poll_s; continue      # still the old failed run: not judged yet
            if reruns >= max_reruns:
                return ("red", failed_checks(checks))
            old = stamp() if stamp else None
            reruns += 1; rerun(); sleep(poll_s); waited += poll_s; continue
        if waited >= timeout_s:
            return ("timeout",)
        sleep(poll_s); waited += poll_s

def deploy_needed(deployed_sha, main_sha):
    """Pure (#74): batching. PRs merged one after another are deployed ONCE: the first deploy after the last merge covers all of them."""
    return bool(main_sha) and deployed_sha != main_sha

def ci_fix_prompt(n, names):
    return (f"Issue #{n}: the CI check(s) {', '.join(names) or '(see the PR)'} failed on lane/{n} even after one rerun. "
            f"Use `gh run list --branch lane/{n}` and `gh run view <id> --log-failed`, fix the real cause in this worktree, "
            f"run the affected suites locally, commit, and `git push {REMOTE} lane/{n}`. Never force-push, never push to {BRANCH}. "
            "The very last line of your final message must be `RESULT: DONE` or `RESULT: STUCK <why>`.")

def resolve_prompt(n, files):
    return (f"Issue #{n}: merging lane/{n} into {BRANCH} failed because {BRANCH} moved on" + (f" (conflicting files: {', '.join(files)})" if files else "") + ". "
            f"In this worktree run `git fetch {REMOTE} && git merge {REMOTE}/{BRANCH}`, resolve the conflicts keeping BOTH sides' intent, "
            "run `python3 build_talents.py` (in oren2/) and the full tests (`oren2/tests/run.sh`; rerun a flaky suite alone once), commit, "
            f"and `git push {REMOTE} lane/{n}`. Never force-push, never rewrite {BRANCH}, never push to {BRANCH}. "
            "The very last line of your final message must be `RESULT: DONE` or `RESULT: STUCK <why>`.")

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

def pending_question(text):
    """The worker's last `QUESTION:` line if it is still unanswered (no later owner/orchestrator message, no RESULT/VERDICT line), else ''."""
    q = u = m = -1; qtext = ""
    for i, l in enumerate(text.splitlines()):
        s = l.strip().lstrip("●⏺•").strip()
        if s.startswith("QUESTION:") and "`" not in s and "<short" not in s:
            q, qtext = i, s
        elif s.startswith(("RESULT:", "VERDICT:")) and "`" not in s and "<why>" not in s and " or " not in s:
            m = i
        elif (s.startswith("❯") and s[1:].strip()) or s.startswith("<hc from"):
            u = i                                   # a message typed into the window (answer from the orchestrator / owner)
    return qtext if q > max(u, m) else ""

def waiting_now(status, screen):
    """True when the window waits for a person: a permission/trust menu (blocked) or a finished turn ending in QUESTION:."""
    return status == "blocked" or (status in ("done", "idle") and bool(pending_question(screen)))

def is_stale_window(status, screen):
    """A live window found when an agent starts is from an earlier run, so if its turn already finished (done/idle) its marker is old news.
    Only windows still working, blocked, or waiting for an answer are re-attached."""
    return status in ("done", "idle") and not pending_question(screen)

def should_park(since, now, minutes):
    """since = when the window started waiting (epoch) or None. Park (give the lane back) after `minutes` of waiting."""
    return since is not None and now - since >= minutes * 60

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

MAIN_CHECKOUT = Path(CFG.get("main_checkout", str(ROOT)))   # the checkout the watchdog/runner/panel import code from

def is_dirty(status):
    """Pure: True when `git status --porcelain` shows tracked changes (untracked files '??' are fine)."""
    return any(l.strip() and not l.startswith("??") for l in status.splitlines())

def sync_decision(branch, into, dirty, behind):
    """Pure: ('pull', '') | ('skip', reason). reason '' = nothing to report."""
    if behind <= 0: return ("skip", "")
    if branch != into: return ("skip", f"main checkout is on {branch}, not {into}")
    if dirty: return ("skip", "main checkout has uncommitted changes")
    return ("pull", "")

def sync_main(log=None):
    """Fast-forward the main checkout to origin/main when that is harmless. Returns a message ('' = nothing to say); never raises."""
    try:
        g = lambda *a: run(["git", "-C", str(MAIN_CHECKOUT), *a], timeout=120)
        rc, out = g("fetch", "-q", REMOTE)
        if rc: return f"sync failed: fetch rc {rc} {out.strip()[:200]}"
        branch = g("rev-parse", "--abbrev-ref", "HEAD")[1].strip()
        behind = int(g("rev-list", "--count", f"HEAD..{REMOTE}/{BRANCH}")[1].strip() or 0)
        act, why = sync_decision(branch, BRANCH, is_dirty(g("status", "--porcelain")[1]), behind)
        if act == "pull":
            rc, out = g("merge", "-q", "--ff-only", f"{REMOTE}/{BRANCH}")
            return f"main checkout fast-forwarded ({behind} commits)" if rc == 0 else f"sync failed: ff-only rc {rc} {out.strip()[:200]}"
        return f"sync skipped ({behind} behind): {why}" if why else ""
    except Exception as e:
        return f"sync error: {e!r}"

def remove_worktree(wt, log=None):
    """Remove a lane worktree. oren2/node_modules is a JUNCTION to the real modules: take the junction off alone first
    (rmdir, never /s, never rmtree: that would delete the real modules), then remove the worktree and any leftover folder (#82)."""
    wt = Path(wt)
    nm = wt / "oren2" / "node_modules"
    if os.path.isjunction(nm):
        run(["cmd", "/c", "rmdir", str(nm)])
    elif nm.is_symlink():
        nm.unlink()
    run(["git", "worktree", "remove", "--force", str(wt)], cwd=ROOT, log=log)
    if wt.exists() and not (wt / ".git").exists():       # half-made worktree (no checkout): leftovers only, safe now the junction is gone
        shutil.rmtree(wt, ignore_errors=True)

def gh(*args, **kw):
    return run(["gh", *args, "--repo", REPO], **kw)

def now():
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")

def stat(n, lane, event):
    """Append one timing event to .runs/stats.jsonl; never raises."""
    try:
        RUNS.mkdir(exist_ok=True)
        with open(RUNS / "stats.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps({"ts": int(time.time()), "issue": n, "lane": lane, "event": event}) + chr(10))
    except Exception: pass

# ---------- pipeline for one issue ----------
class Blocked(Exception):
    pass

class Parked(Exception):
    """The issue waits for the owner (question unanswered for park_minutes): lane freed, windows stay open, the run exits cleanly."""

PARK_MINUTES = int(CFG.get("park_minutes", 30))

def tell_orchestrator(text):
    if USE_HERDR: hc("send", "orchestrator", text, timeout=30)

def live(name):
    return USE_HERDR and hc_json("get", name, "--json").get("state") == "live"

def issue_labels(n):
    rc, out = gh("issue", "view", str(n), "--json", "labels")
    try: return [l["name"] for l in json.loads(out)["labels"]]
    except (ValueError, KeyError): return None      # gh failed: unknown, never treat as parked

def park_issue(n, name, tail, since):
    """Give the lane back: comment with the question, blocked + ready-for-human, drop in-progress, tell the orchestrator. Idempotent."""
    if "blocked" in (issue_labels(n) or []): return False
    hhmm = time.strftime("%H:%M", time.localtime(since))
    set_labels(n, add=["blocked", "ready-for-human"], remove=["in-progress"])
    gh("issue", "comment", str(n), "--body", redact(f"Parked: window `{name}` has waited for the owner since {hhmm}. It stays open.\n\nIts screen ends with:\n```\n{tail[-2000:]}\n```\n"
       f"To resume: answer in the window, remove labels `blocked` and `ready-for-human`, run `tools/runner/run.cmd {n}`."))
    tell_orchestrator(f"#{n} parked: waiting for you since {hhmm} (window {name}). Ask the owner; to resume: answer in {name}, remove labels blocked + ready-for-human, run.cmd {n}.")
    return True

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
    cmd = [shutil.which("claude") or "claude", "-p", "--model", MODEL, "--permission-mode", "auto",
           "--allowedTools", *tools]
    # prompt goes via stdin; "--allowedTools" is variadic so keep it last
    rc, out = run(cmd, cwd=cwd, input=prompt, log=log, timeout=3 * 3600)
    return out

# ---------- herdr terminals ----------
HERDR_APP = CFG.get("herdr_app", r"C:\Users\97254\AppData\Local\Programs\herdr-app\herdr-app.exe")
_SPACE = None
def space_args():
    """`--label herdr.space=<id>`: the terminal opens as a tab in that Herdr space, shows in the Agents panel and
    gets Herdr's own blocked/done alerts. Space chosen by name (config herdr_space, default Oren_study_orech)."""
    global _SPACE
    if _SPACE is None:
        _SPACE = ""
        try:
            rc, out = run([HERDR_APP, "ls"], timeout=30)
            for sp in json.loads(out).get("spaces", []):
                if sp.get("name") == CFG.get("herdr_space", "Oren_study_orech"): _SPACE = sp["id"]
        except Exception:
            pass
    return ["--label", f"herdr.space={_SPACE}"] if _SPACE else []

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
    Terminals are closed after success and left open when BLOCKED/PARKED. A window of that name that is still live (parked earlier) is re-attached, not restarted.
    Waiting for a person longer than park_minutes -> Parked. Falls back to the hidden `claude -p` when herdr is unavailable."""
    if not USE_HERDR:
        out = claude_hidden(prompt, cwd, tools, log)
        return out, last_line(out, marker)
    if live(name):
        info0 = hc_json("get", name, "--json"); screen0 = hc("read", name, "--lines", "400")[1]
        if is_stale_window(info0.get("status"), screen0):      # finished before this run: its old verdict/result must not be reused
            hc("kill", name, timeout=30); hc("rm", name, timeout=30)
    if not live(name):
        # bash wrapper only puts the python3 shim on PATH; the prompt goes after `--` ("--allowedTools" is variadic)
        cmd = [HC, "run", "--bg", "--outlive-parent", "--name", name, "--cwd", str(cwd), "--label", f"issue={n}", "--label", f"role={role}", *space_args(), *parent_args(),
               BASH, "-c", 'export PATH="$1:$PATH"; shift; exec "$@"', "_", CFG["extra_path"],
               shutil.which("claude") or "claude", "--model", MODEL, "--permission-mode", "auto",
               "--allowedTools", *tools, "--", prompt + INTERACTIVE_NOTE]
        rc, out = run(cmd, log=log)
        if rc: raise Blocked(f"cannot start terminal {name}: {out.strip()[:200]}")
    deadline, screen = time.time() + 3 * 3600, ""
    waiting = marker_since = None; last_check = 0
    try:
        while time.time() < deadline:
            info = hc_json("wait", name, "--timeout", "120", "--json")
            rc, screen = hc("read", name, "--lines", "400")
            status = info.get("status")
            if status == "blocked" and "trust this folder" in screen:   # fresh worktree: accept the folder-trust dialog
                hc("keys", name, "down", "enter"); time.sleep(5); continue
            if find_marker(screen, marker):
                if status in ("done", "idle", None): break
                marker_since = marker_since or time.time()
                if time.time() - marker_since > 180: break               # marker printed but a background shell keeps it "working"
            else:
                marker_since = None
            if hc_json("get", name, "--json").get("state") == "finished":
                break
            if waiting_now(status, screen):
                waiting = waiting or time.time()
                if should_park(waiting, time.time(), PARK_MINUTES):
                    park_issue(n, name, "\n".join([l for l in screen.splitlines() if l.strip()][-14:]), waiting)
                    raise Parked(name)
            else:
                waiting = None
            if time.time() - last_check > 60:                           # someone (watchdog / owner) parked or blocked the issue: stop waiting
                last_check = time.time()
                if "blocked" in (issue_labels(n) or []): raise Parked(name)
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
            f"(`gh issue view {n} --repo {REPO} --comments`). Work only inside this worktree (your cwd). Implement ONLY what the issue asks. Use the mattpocock-skills:tdd skill (test first).\n")
    if lane == "review":
        return base + (f"This is a read-only review issue: change NO files, make no commits, open no PR. Post your report as ONE issue comment "
                       f"(`gh issue comment {n} --repo {REPO} --body-file <file>`; write the file under oren2/tests/.tmp/). "
                       "The very last line of your final message must be `RESULT: DONE` or `RESULT: STUCK <why>`.")
    if bug:
        base += ("This is a BUG: use the mattpocock-skills:diagnosing-bugs skill, then tdd: reproduce it with a failing test (add it to the relevant suite in oren2/tests/), then fix it so the test passes; "
                 "say the root cause in the PR body.\n")
    steps = ("Steps: 1) implement; 2) python3 build_talents.py (in oren2/, PATH already has python3) and run the build + the suites for what you changed, muted "
             "(see FLOW.md); 3) for each changed screen take screenshots at phone 390x844 and desktop 1366x768 into "
             f"C:/work/Oren_study/shots/{n}/ and LOOK at them (simple, one main action, Hebrew with nikud); 4) commit (do NOT commit oren2/index.html "
             f"or oren2/cf/public/index.html, node_modules, package*.json, tests/.tmp); 5) `git push -u {REMOTE} lane/{n}`; 6) open a PR to {BRANCH} with "
             f"`gh pr create --repo {REPO} --base {BRANCH} --head lane/{n}` whose body contains `Closes #{n}` (use the mattpocock-skills:pr skill to write the PR body; skip if a PR already exists). "
             "Never deploy, never force-push. If blocked or the issue is unclear, stop and say why. "
             "The very last line of your final message must be `RESULT: DONE` or `RESULT: STUCK <why>`.")
    if review_text:
        steps += ("\nThe PR already exists and a reviewer asked for fixes. Fix exactly these points on the same branch (new commit, push, no new PR), "
                  "re-run tests and screenshots:\n---\n" + review_text[-6000:] + "\n---")
    return base + steps

def review_prompt(n, pr):
    return (f"You are a fresh, read-only reviewer for PR #{pr} (issue #{n}) in {REPO}. You may not edit files. Read CLAUDE.md, the issue "
            f"(`gh issue view {n} --repo {REPO}`), the diff (`gh pr diff {pr} --repo {REPO}`, ignore the built index.html files) and the screenshots in "
            f"C:/work/Oren_study/shots/{n}/ (look at them). Check: correctness vs the issue, simplicity (one main action per screen), Hebrew with correct "
            "nikud, facts correct, no unrelated changes. Use the mattpocock-skills:code-review skill (Standards = CLAUDE.md + FLOW.md, Spec = the issue), then post ONE comment with `gh pr comment " + f"{pr} --repo {REPO} --body-file <file>` (write the file under "
            "oren2/tests/.tmp/; this is the only file you may write, via the Bash echo/redirect). Print the same comment as your output. "
            "The very last line must be `VERDICT: PASS` or `VERDICT: FIX` (FIX = list the concrete points above it).")

def set_labels(n, add=(), remove=()):
    args = ["issue", "edit", str(n)]
    for a in add: args += ["--add-label", a]
    for r in remove: args += ["--remove-label", r]
    gh(*args)

def stuck_labels():
    """Labels for a runner/worker failure (STUCK, runner error, reviewer asked twice): the ORCHESTRATOR handles it, not the owner.
    Only a parked owner question (park_issue) or a hand task gets `ready-for-human`."""
    return ["blocked", "needs-orchestrator"]

def block(n, why, log):
    tail = ""
    try:
        tail = "\n".join(Path(log).read_text(encoding="utf-8").splitlines()[-20:])
    except OSError:
        pass
    set_labels(n, add=stuck_labels(), remove=["in-progress"])
    gh("issue", "comment", str(n), "--body", redact(f"Runner blocked: {why}\n\nLast log lines:\n```\n{tail[-2500:]}\n```"))
    tell_orchestrator(f"STUCK #{n}: {why[:300]} — decide: unblock, split, or ask the owner")

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
    rc, out = run([BASH, "oren2/cf/tools/deploy.sh"], cwd=INTEG, env=env, log=log, timeout=900)
    last = (out.strip().splitlines() or [""])[-1]           # deploy.sh prints progress lines first, "ok <url>" last (#50)
    if rc != 0 or not last.startswith("ok"):
        raise Blocked("deploy failed")
    url = last
    if not CFG.get("pregen", False):                       # off until #68: pregen burns the free KV write limit
        return f"deployed {url} (pregen off)"
    rc, _ = run(["node", "oren2/cf/tools/pregen.js"], cwd=INTEG, env=env, log=log, timeout=1800)
    return f"deployed {url}" + ("" if rc == 0 else " (pregen failed, see log)")

def ci_integrate(n, wt, log):
    """CI-based integrate (#74): update the lane with main, push, wait for the PR checks, `gh pr merge --squash`. -> (rc, out) like integrate.sh:
    0 merged, 2 conflict, 4 no PR, 5 push failed, 6 CI red after one rerun, 7 CI timeout / merge failed (blocked, real reason in out)."""
    pr = find_pr(n)
    if not pr: return 4, "no open PR for lane/%d" % n
    run(["git", "fetch", "-q", REMOTE], cwd=wt, log=log)
    rc, out = run(["git", "merge", "--no-edit", f"{REMOTE}/{BRANCH}"], cwd=wt, log=log)
    if rc:
        files = run(["git", "diff", "--name-only", "--diff-filter=U"], cwd=wt, log=log)[1].split()
        run(["git", "merge", "--abort"], cwd=wt, log=log)
        return 2, "CONFLICTS (fix by hand, or send back to the lane):\n" + "\n".join(files)
    if run(["git", "rev-parse", "HEAD"], cwd=wt)[1] != run(["git", "rev-parse", f"{REMOTE}/lane/{n}"], cwd=wt)[1]:
        if run(["git", "push", "-q", REMOTE, f"lane/{n}"], cwd=wt, log=log)[0]: return 5, "push failed"
        time.sleep(20)                                           # let GitHub start the new run
    def get_checks():
        try: return json.loads(gh("pr", "checks", str(pr), "--json", "name,bucket", log=log)[1] or "[]")
        except ValueError: return []
    def stamp():
        return run(["gh", "run", "list", "--repo", REPO, "--branch", f"lane/{n}", "--limit", "1", "--json", "databaseId,status,attempt", "-q", ".[0]|[.databaseId,.status,.attempt]|join(\":\")"], log=log)[1].strip()
    def rerun():
        rid = run(["gh", "run", "list", "--repo", REPO, "--branch", f"lane/{n}", "--limit", "1", "--json", "databaseId", "-q", ".[0].databaseId"], log=log)[1].strip()
        if rid.isdigit(): run(["gh", "run", "rerun", rid, "--failed", "--repo", REPO], log=log)
    def merge(): return gh("pr", "merge", str(pr), "--squash", log=log)[0] == 0
    res = ci_merge(get_checks, rerun, merge, time.sleep, int(CFG.get("ci_timeout_minutes", 60)) * 60, stamp=stamp)
    if res[0] == "merged": return 0, "merged PR #%d" % pr
    if res[0] == "red": return 6, "CI RED\n" + "\n".join(res[1])
    return 7, "CI " + ("timed out" if res[0] == "timeout" else "green but `gh pr merge` failed")

def find_pr_merged(n):
    rc, out = gh("pr", "list", "--head", f"lane/{n}", "--state", "merged", "--json", "number")
    try: return bool(json.loads(out))
    except ValueError: return False

def deploy_main(log):
    """After CI merges (#74): bring the integrate checkout to main, rebuild, commit the built files if changed, deploy ONCE (skipped when this sha is already deployed)."""
    run(["git", "fetch", "-q", REMOTE], cwd=ROOT, log=log)
    if not (INTEG / ".git").exists():
        run(["git", "worktree", "prune"], cwd=ROOT); run(["git", "worktree", "add", "-B", "integrate", str(INTEG), f"{REMOTE}/{BRANCH}"], cwd=ROOT, log=log)
    run(["git", "merge", "--abort"], cwd=INTEG); run(["git", "reset", "-q", "--hard"], cwd=INTEG)
    run(["git", "checkout", "-q", "-B", "integrate", f"{REMOTE}/{BRANCH}"], cwd=INTEG, log=log)
    if run(["python3", "build_talents.py"], cwd=INTEG / "oren2", log=log)[0]: raise Blocked("build failed after CI merge")
    run(["git", "add", "oren2/index.html", "oren2/cf/public/index.html"], cwd=INTEG)
    if run(["git", "diff", "--cached", "--quiet"], cwd=INTEG)[0]:
        run(["git", "commit", "-qm", "Rebuild index.html\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"], cwd=INTEG, log=log)
        if run(["git", "push", "-q", REMOTE, f"HEAD:{BRANCH}"], cwd=INTEG, log=log)[0]: raise Blocked("push of rebuilt index.html failed")
    sha = run(["git", "rev-parse", "HEAD"], cwd=INTEG)[1].strip()
    mark = RUNS / "deployed.sha"
    if not deploy_needed(mark.read_text().strip() if mark.exists() else "", sha):
        return "already deployed with an earlier PR (batch)"
    dep = deploy_text(log)
    if dep.startswith("deployed"): mark.write_text(sha)       # never mark a sha that was not deployed (no token)
    return dep

MAX_CORE = int(CFG.get("max_core", 1))

class core_slot:
    """One of MAX_CORE core slot locks (cross-process)."""
    def __enter__(self):
        while True:
            for k in range(MAX_CORE):
                try:
                    self.lock = FileLock(f"core-{k}").__enter__(); return self
                except Blocked:
                    pass
            time.sleep(20)
    def __exit__(self, *a):
        self.lock.__exit__()

def process(issue):
    n = issue["number"]
    try:
        with FileLock(f"issue-{n}"):
            if lane_of(issue["labels"]) == "core":
                with core_slot():                   # at most max_core core issues run; an extra one waits here, it does not fail
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
        stat(n, lane, "start")
        set_labels(n, add=["in-progress"]); gh("issue", "comment", str(n), "--body", f"Runner: started ({lane} lane, {MODEL}).")
        run(["git", "fetch", "-q", REMOTE], cwd=ROOT, log=log)
        pushed = bool(find_pr(n)) or bool(run(["git", "ls-remote", "--heads", REMOTE, f"lane/{n}"], cwd=ROOT)[1].strip())
        resume = any(live(w) for w in (f"issue-{n}", f"issue-{n}-fix", f"review-{n}", f"review-{n}-2"))
        if resume and wt.exists():
            pass                                             # parked earlier: re-attach to its windows and worktree, change nothing
        else:
            if (wt.exists() or run(["git", "rev-parse", "--verify", f"lane/{n}"], cwd=ROOT)[0] == 0) and not pushed:   # leftovers of an unfinished try
                remove_worktree(wt, log)
                run(["git", "branch", "-D", f"lane/{n}"], cwd=ROOT, log=log)
            if not wt.exists():                              # lane.sh continues from origin/lane/<n> when pushed work exists (never deleted)
                rc, _ = run([BASH, "tools/lane.sh", str(n), BRANCH], cwd=ROOT, env={"REMOTE": REMOTE}, log=log)
                if rc: raise Blocked("lane.sh failed")

        out, res = agent(f"issue-{n}", worker_prompt(n, lane, bug="bug" in issue["labels"]), wt, WORKER_TOOLS if lane != "review" else REVIEW_LANE_TOOLS,
                         d / "worker1.log", "RESULT:", n, "worker")
        (d / "worker1.out").write_text(redact(out), encoding="utf-8")
        if not res.startswith("RESULT: DONE"):
            raise Blocked(res or "worker gave no RESULT line")
        stat(n, lane, "worker_done")
        if lane == "review":
            gh("issue", "close", str(n), "--comment", "Review report posted above (runner).")
            set_labels(n, remove=["in-progress"]); close_windows(n); return "DONE report posted"

        verdict = ""
        for rnd in (1, 2):
            pr = find_pr(n)
            if not pr: raise Blocked("worker said DONE but no open PR for lane/%d" % n)
            rv, verdict = agent(f"review-{n}" + ("" if rnd == 1 else f"-{rnd}"), review_prompt(n, pr), wt, READ_TOOLS,
                                d / f"review{rnd}.log", "VERDICT:", n, "reviewer")
            (d / f"review{rnd}.out").write_text(redact(rv), encoding="utf-8")
            if verdict.startswith("VERDICT: PASS"):
                stat(n, lane, "review_pass"); break
            if not verdict.startswith("VERDICT: FIX"):
                raise Blocked(verdict or "reviewer gave no VERDICT line")
            stat(n, lane, "review_fix")
            if rnd == 2:
                stat(n, lane, "blocked")
                block(n, "reviewer asked for fixes twice; needs a human", log); return "BLOCKED: reviewer asked for fixes twice; needs a human"
            out, res = agent(f"issue-{n}-fix", worker_prompt(n, lane, rv, bug="bug" in issue["labels"]), wt, WORKER_TOOLS, d / "worker2.log", "RESULT:", n, "worker")
            if not res.startswith("RESULT: DONE"):
                raise Blocked(res or "fix worker gave no RESULT line")
            stat(n, lane, "fix_done")

        kind = {"ci": False}
        def integrate():
            if CFG.get("ci_merge", True) and find_pr(n):     # #74: CI decides, no local full suite
                with FileLock("integrate", wait=True):
                    rc, out = ci_integrate(n, wt, log)
                    kind["ci"] = rc == 6
                    return rc, out
            with FileLock("integrate", wait=True):          # fallback: local merge + full suite
                rc, out = run([BASH, "tools/integrate.sh", f"lane/{n}", BRANCH], cwd=ROOT,
                              env={"REMOTE": REMOTE, "JOBS": "4", "RUNNER": "1"}, log=log, timeout=3600)
                if rc:
                    run(["git", "merge", "--abort"], cwd=INTEG, log=log)
                return rc, out
        rounds = [0]
        def resolve(files):
            rounds[0] += 1
            stat(n, lane, "resolve")
            o, r_ = agent(f"issue-{n}-resolve{rounds[0]}", ci_fix_prompt(n, files) if kind["ci"] else resolve_prompt(n, files), wt, WORKER_TOOLS, d / f"resolve{rounds[0]}.log", "RESULT:", n, "worker")
            return r_.startswith("RESULT: DONE")
        outcome = integrate_with_resolve(integrate, resolve, 2)
        if outcome[0] == "giveup":
            stat(n, lane, "blocked")
            files = outcome[1]
            set_labels(n, add=["blocked", "ready-for-human"], remove=["in-progress"])
            gh("issue", "comment", str(n), "--body", redact("Runner: merge conflicts not resolved after 2 rounds. Conflicting files: " + (", ".join(files) or "(see log)")))
            return "BLOCKED: merge conflicts after 2 resolve rounds"
        if outcome[0] == "failed":
            raise Blocked(outcome[2] if outcome[1] == 7 else f"integrate.sh exit {outcome[1]}")
        with FileLock("integrate", wait=True):
            stat(n, lane, "merged")
            dep = deploy_main(log) if CFG.get("ci_merge", True) and find_pr_merged(n) else deploy_text(log)
        m = sync_main(log)                       # result logged (review of #47)
        if m: log_line(m)
        gh("issue", "close", str(n), "--comment", f"Merged to {BRANCH}, tests green, {dep}.")
        set_labels(n, remove=["in-progress"])
        remove_worktree(wt, log)
        close_windows(n)
        stat(n, lane, "deployed")
        return f"DONE {dep}"
    except Parked as e:                         # waiting for the owner: windows stay open, locks are released by the caller's `with`
        stat(n, lane, "parked")
        return f"PARKED: waiting for the owner in {e}"
    except Blocked as e:
        stat(n, lane, "blocked")
        block(n, str(e), log); return f"BLOCKED: {e}"
    except Exception as e:                      # any crash: never leave the issue in-progress
        stat(n, lane, "blocked")
        block(n, f"runner error: {e!r}", log); return f"BLOCKED: runner error {e!r}"

def close_windows(n):
    """After a successful issue: close its worker/reviewer windows (kept open when BLOCKED, so the owner can look)."""
    if not USE_HERDR: return
    for t in (f"issue-{n}", f"issue-{n}-fix", f"issue-{n}-resolve1", f"issue-{n}-resolve2", f"review-{n}", f"review-{n}-2"):
        hc("kill", t, timeout=30); hc("rm", t, timeout=30)

# ---------- main ----------
def issue_by_number(n):
    rc, out = gh("issue", "view", str(n), "--json", "number,labels,createdAt,state,title")
    if rc: raise SystemExit(f"cannot read #{n}: {out.strip()[:200]}")
    d = json.loads(out)
    if d["state"] != "OPEN": raise SystemExit(f"#{n} is not open")
    return {**d, "labels": [l["name"] for l in d["labels"]]}

def ensure_labels():
    for lbl, color in (("in-progress", "fbca04"), ("blocked", "b60205"), ("ready-for-human", "0e8a16"), ("needs-orchestrator", "d93f0b")):
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
    chosen = [c for c in select(issues, CFG["max_parallel"], MAX_CORE) if not FileLock(f"issue-{c['number']}").held_by_other()]
    cutoff = CFG["stuck_hours"] * 3600
    stuck = [i for i in issues if "in-progress" in i["labels"] and not FileLock(f"issue-{i['number']}").held_by_other()
             and (time.time() - datetime.fromisoformat(i["updatedAt"].replace("Z", "+00:00")).timestamp()) > cutoff]
    if DRY:
        print(f"[dry-run] repo={REPO} branch={BRANCH} model={MODEL} max_parallel={CFG['max_parallel']} max_core={MAX_CORE}")
        print(f"[dry-run] open issues: {len(issues)}; in-progress: {sum('in-progress' in i['labels'] for i in issues)}")
        for c in chosen: print(f"[dry-run] would start #{c['number']} ({lane_of(c['labels'])}): {c['title']}")
        for s in stuck: print(f"[dry-run] would block stuck #{s['number']} (in-progress, idle > {CFG['stuck_hours']}h, no runner process)")
        if not chosen and not stuck: print("[dry-run] nothing to do")
        return 0
    ensure_labels()
    for s in stuck:
        set_labels(s["number"], add=stuck_labels(), remove=["in-progress"])
        gh("issue", "comment", str(s["number"]), "--body", f"Runner: in-progress for over {CFG['stuck_hours']}h with no runner process; marked blocked.")
    results = []
    if chosen and USE_HERDR and TERM:
        for c in chosen:
            set_labels(c["number"], add=["in-progress"])          # claim now so the next pass doesn't pick it twice
            if spawn([str(c["number"])]):                         # could not start (e.g. name_taken): give it back, log it, don't count it
                set_labels(c["number"], remove=["in-progress"]); results.append((c["number"], "not started (hc run failed)"))
            else: results.append((c["number"], "started"))
    elif chosen:
        with ThreadPoolExecutor(max_workers=len(chosen)) as ex:
            results = list(ex.map(lambda c: (c["number"], process(c)), chosen))
    log_line(f"{now()} pass: started={sum(r == 'started' for _, r in results) if results else len(chosen)} stuck={len(stuck)} " + " ".join(f"#{n}:{r}" for n, r in results))
    for n, r in results: print(f"ISSUE {n}: {r}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
