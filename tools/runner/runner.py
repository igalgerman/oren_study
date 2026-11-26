#!/usr/bin/env python3
"""Issue runner: one pass = pick ready GitHub issues, run each in its own headless Claude session
(worker -> reviewer -> integrate -> deploy -> close). Config: config.toml. Usage: runner.py [<issue>] [--dry-run]; no number = one pass over the ready queue."""
import json, os, re, shutil, subprocess, sys, tempfile, threading, time, tomllib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import remote
ROOT = HERE.parent.parent                      # repo checkout (tools/runner/../..)
RUNS = Path(os.environ.get("RUNNER_RUNS") or HERE / ".runs")   # #229: tests point this at a temp dir
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
                               "Bash(bash tools/:*)", "Bash(bash tests/:*)", "Bash(cd:*)", "Bash(ls:*)", "Bash(mkdir:*)",
                               "Agent"]                                  # sub-agents for independent members of a batch issue
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

MODEL_IDS = {"haiku": "haiku", "sonnet": "sonnet", "opus": "opus", "fable": "claude-fable-5-2"}
_MODEL_RANK = ["haiku", "sonnet", "opus", "fable"]

def model_name(labels):
    """#65: short name from a model:<x> label; MODEL (config, sonnet) when missing or unknown. Two labels: the most capable wins."""
    found = [m for m in _MODEL_RANK if f"model:{m}" in labels]
    return found[-1] if found else MODEL

def model_of(labels):
    """Value for `claude --model`."""
    return MODEL_IDS.get(model_name(labels), MODEL)

def reviewer_model(labels):
    """Reviewer: opus when the issue is model:opus, else sonnet."""
    return "opus" if "model:opus" in labels else "sonnet"

def blockers(body):
    """Issue numbers in 'Blocked by: #1, #2' lines."""
    out = []
    for line in (body or "").splitlines():
        if line.lstrip(" 	-*>").lower().startswith("blocked by"):
            out += [int(x) for x in re.findall(r"#(\d+)", line)]
    return out

def select(issues, max_parallel, max_core=1, express_lanes=0):
    """issues: [{number, labels:[names], createdAt, body}] -> issues to start now (express first, then oldest).
    An issue waits while any issue in its 'Blocked by:' line is still open (= in this list).
    #72: label 'express' = owner-approved. It gets its own extra lane (express_lanes), starts before any other ready issue,
    and an express core issue in that lane ignores max_core. When the express lane is busy it uses a normal slot."""
    open_nums = {i["number"] for i in issues}
    active = [i for i in issues if "in-progress" in i["labels"] and "manual" not in i["labels"]]   # #177: hand work (label manual) takes no lane
    core_running = sum(lane_of(i["labels"]) == "core" for i in active)
    exp_active = sum("express" in i["labels"] for i in active)
    exp_free = max(0, express_lanes - exp_active)
    slots = max_parallel - (len(active) - min(exp_active, express_lanes))
    ready = [i for i in issues if "ready-for-agent" in i["labels"]
             and "in-progress" not in i["labels"] and "blocked" not in i["labels"] and "manual" not in i["labels"]
             and not any(b in open_nums for b in blockers(i.get("body")))]
    chosen = []
    for i in sorted(ready, key=lambda i: ("express" not in i["labels"], "bug" not in i["labels"], priority_of(i["labels"]), i["createdAt"])):   # express first, bugs, then P0..P3, then oldest
        if "express" in i["labels"] and exp_free > 0:
            exp_free -= 1; chosen.append(i); continue
        if slots <= 0:
            continue
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

def ci_merge(get_checks, rerun, merge, sleep, timeout_s=3600, poll_s=30, max_reruns=1, stamp=None, max_stale=10, ended=None):
    """Pure decision loop (#74): wait for the PR checks, then merge. Red -> rerun the failed jobs once (flaky), still red -> send back to the worker.
    stamp() = run id/status/attempt of the latest run: after a rerun, red is ignored until it changes (the old failed run is still shown for a while).
    merge() -> True | False | 'conflict' (#160: main moved after green CI -> the caller resolves and retries).
    ended() True (#234: PR merged / issue closed elsewhere) -> ('ended',).
    Returns ('merged',) | ('red', [names]) | ('timeout',) | ('conflict',) | ('merge-failed',) | ('ended',)."""
    waited, reruns, old, stale = 0, 0, None, 0
    while True:
        if ended and ended():
            return ("ended",)
        checks = get_checks()
        v = ci_verdict(checks)
        if v == "green":
            m = merge()
            return ("merged",) if m is True else ("conflict",) if m == "conflict" else ("merge-failed",)
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

def merge_conflict(text):
    """Pure (#160): does a failed `gh pr merge` output mean 'main moved, PR now conflicts'?"""
    t = (text or "").lower()
    return "conflict" in t or "not mergeable" in t or "cannot be cleanly created" in t

def needs_branch_update(mergeable):
    """Pure (#166): update the lane with main only when GitHub says the PR really conflicts; otherwise merge straight on green (one CI run, not two)."""
    return (mergeable or "").upper() == "CONFLICTING"

def deploy_needed(deployed_sha, main_sha):
    """Pure (#74): batching. PRs merged one after another are deployed ONCE: the first deploy after the last merge covers all of them."""
    return bool(main_sha) and deployed_sha != main_sha

def push_ref(n, br):
    """#246: what a worker in the local worktree (branch lane/<n>) pushes: lane/<n>, or HEAD:<the PR's claude/* head>."""
    return f"lane/{n}" if br in (None, f"lane/{n}") else f"HEAD:{br}"

def ci_fix_prompt(n, names, br=None):
    br = br or f"lane/{n}"
    return (f"Issue #{n}: the CI check(s) {', '.join(names) or '(see the PR)'} failed on {br} even after one rerun. "
            f"Use `gh run list --branch {br}` and `gh run view <id> --log-failed`, fix the real cause in this worktree, "
            f"run the affected suites locally, commit, and `git push {REMOTE} {push_ref(n, br)}`. Never force-push, never push to {BRANCH}. "
            "The very last line of your final message must be `RESULT: DONE` or `RESULT: STUCK <why>`.")

def resolve_prompt(n, files, br=None):
    br = br or f"lane/{n}"
    return (f"Issue #{n}: merging {br} into {BRANCH} failed because {BRANCH} moved on" + (f" (conflicting files: {', '.join(files)})" if files else "") + ". "
            f"In this worktree run `git fetch {REMOTE} && git merge -X renormalize {REMOTE}/{BRANCH}`, resolve the conflicts keeping BOTH sides' intent, "
            "run `python3 build_talents.py` (in oren2/) and the full tests (`oren2/tests/run.sh`; rerun a flaky suite alone once), commit, "
            f"and `git push {REMOTE} {push_ref(n, br)}`. Never force-push, never rewrite {BRANCH}, never push to {BRANCH}. "
            "The very last line of your final message must be `RESULT: DONE` or `RESULT: STUCK <why>`.")

LOCAL_LANES = int(CFG.get("local_lanes", 1))
REMOTE_LANES = int(CFG.get("remote_lanes", 0))

def total_lanes():
    """#133: lanes in total = local + remote (replaces max_parallel). #239: remote = the governor's last count (.runs/governor.json, < 15 min old)."""
    try:
        gv = json.loads((RUNS / "governor.json").read_text(encoding="utf-8"))
        if time.time() - gv["at"] < 15 * 60: return LOCAL_LANES + (0 if gv["stop"] else int(gv["lanes"]))
    except Exception: pass
    return LOCAL_LANES + REMOTE_LANES

# #239 usage governor: cloud lane count follows the 5h window (the panel writes .runs/usage.json every refresh)
GOV = {"target": float(CFG.get("governor_target", 90)), "min": int(CFG.get("governor_min", 2)), "max": int(CFG.get("governor_max", 8)),
       "stop": float(CFG.get("governor_stop", 93)), "pace": float(CFG.get("governor_pace", 3.5)), "week_cap": int(CFG.get("governor_week_cap", 4)),
       "stale_s": 15 * 60, "fallback": REMOTE_LANES}

def _ts(iso):
    try: return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp()
    except Exception: return None

def gov_pace(hist, now, reset, default):
    """Pure (#239): 5h % used per hour per busy remote lane over the last hour of samples [{at, pct, reset, busy}] of the SAME window. Too little data -> default."""
    s = [h for h in hist if now - 3600 <= h["at"] <= now and h.get("reset") == reset]
    if len(s) < 2 or s[-1]["at"] - s[0]["at"] < 600: return default
    busy = sum(h.get("busy", 0) for h in s) / len(s)
    if busy < 0.5: return default
    return max(0.0, (s[-1]["pct"] - s[0]["pct"]) / ((s[-1]["at"] - s[0]["at"]) / 3600) / busy)

def governor(usage, hist, now, g=None):
    """Pure (#239): usage.json dict (or None) + samples + now -> {lanes, stop, pct, projected, reset, why}.
    Most remote lanes in [min, max] whose projection at the 5h reset stays <= target (min when even that is above); 5h >= stop -> no new run;
    week above its even pace +10 pts -> at most week_cap lanes; usage missing or older than 15 min -> config remote_lanes."""
    g = {**GOV, **(g or {})}
    at = _ts((usage or {}).get("at"))
    if not usage or at is None or now - at > g["stale_s"] or usage.get("five_h_pct") is None:
        return {"lanes": g["fallback"], "stop": False, "pct": None, "projected": None, "reset": None, "why": "no fresh usage: config remote_lanes"}
    pct = float(usage["five_h_pct"]); reset = _ts(usage.get("five_h_reset")) or now
    hours = max(0.0, (reset - now) / 3600)
    pace = gov_pace(hist, now, usage.get("five_h_reset"), g["pace"])
    proj = lambda n: pct + pace * n * hours
    lanes = max([n for n in range(g["min"], g["max"] + 1) if proj(n) <= g["target"]] or [g["min"]])
    why = f"pace {pace:.1f}%/h per lane"
    wk, wreset = usage.get("week_pct"), _ts(usage.get("week_reset"))
    if wk is not None and wreset is not None:
        even = 100 * min(1.0, max(0.0, 1 - (wreset - now) / (7 * 86400)))
        if float(wk) > even + 10 and lanes > g["week_cap"]:
            lanes = g["week_cap"]; why += f"; week {float(wk):.0f}% > even {even:.0f}%+10: cap {g['week_cap']}"
    stop = pct >= g["stop"]
    if stop: why = f"5h {pct:.0f}% >= {g['stop']:.0f}%: no new run"
    return {"lanes": lanes, "stop": stop, "pct": pct, "projected": proj(lanes), "reset": reset, "why": why}

def governor_text(gv):
    """'governor: N lanes (5h X% -> ~Y% at HH:MM)' (local time)."""
    if gv["pct"] is None: return f"governor: {gv['lanes']} lanes ({gv['why']})"
    s = f"governor: {0 if gv['stop'] else gv['lanes']} lanes (5h {gv['pct']:.0f}% -> ~{min(100, gv['projected']):.0f}% at {time.strftime('%H:%M', time.localtime(gv['reset']))})"
    return s + (" · STOP" if gv["stop"] else "")

def governor_pass(remote_busy, now=None):
    """Read .runs/usage.json, keep a sample in .runs/usage_hist.jsonl, write .runs/governor.json. Returns the governor dict; never raises."""
    now = now or time.time()
    try: usage = json.loads((RUNS / "usage.json").read_text(encoding="utf-8"))
    except Exception: usage = None
    hist = []
    try:
        for l in (RUNS / "usage_hist.jsonl").read_text(encoding="utf-8").splitlines()[-300:]:
            try: hist.append(json.loads(l))
            except Exception: pass
    except Exception: pass
    gv = governor(usage, hist, now)
    if DRY: return gv
    try:
        RUNS.mkdir(exist_ok=True)
        if gv["pct"] is not None:
            hist = [h for h in hist if now - h.get("at", 0) < 2 * 3600] + [{"at": now, "pct": gv["pct"], "reset": usage.get("five_h_reset"), "busy": remote_busy}]
            (RUNS / "usage_hist.jsonl").write_text("".join(json.dumps(h) + "\n" for h in hist), encoding="utf-8")
        (RUNS / "governor.json").write_text(json.dumps({**gv, "text": governor_text(gv), "at": now}), encoding="utf-8")
    except Exception: pass
    return gv

def assign_where(chosen, local_busy, remote_busy, local_lanes, remote_lanes):
    """Pure (#133): chosen issues (in priority order) -> [(issue, 'local'|'remote')]. A free local lane first, then a free remote slot; the rest wait."""
    lf, rf, out = max(0, local_lanes - local_busy), max(0, remote_lanes - remote_busy), []
    for i in chosen:
        if lf > 0: lf -= 1; out.append((i, "local"))
        elif rf > 0: rf -= 1; out.append((i, "remote"))
        elif "express" in i.get("labels", []): out.append((i, "remote" if remote_lanes > 0 else "local"))   # #72: select() gave it the extra express slot: all lanes busy still starts it
    return out

def remote_worker_prompt(n, lane, bug=False, retry=False):
    """Task for a cloud worker (#133): no herdr, no local paths. It reports through an issue comment (the runner polls GitHub)."""
    base = (f"You are an unattended worker for GitHub issue #{n} in repo {REPO} (lane: {lane}). If its title starts with 'Batch:', follow "
            f"its 'How to work' section: independent members (different files) may go to sub-agents (Agent tool); you integrate, test once "
            f"and open ONE PR with a 'Fixes #m' line per member. Read CLAUDE.md and FLOW.md, then the issue "
            f"(`gh issue view {n} --repo {REPO} --comments`). Implement ONLY what the issue asks. Use the mattpocock-skills:tdd skill (test first).\n")
    if bug:
        base += "This is a BUG: use the mattpocock-skills:diagnosing-bugs skill, then tdd: reproduce it with a failing test, then fix it; say the root cause in the PR body.\n"
    if retry:                                    # #137: an earlier cloud session died without a RESULT comment
        base += (f"An earlier cloud session for this issue ended without a RESULT comment: if lane/{n} exists on GitHub, "
                 f"continue from it (`git fetch {REMOTE} lane/{n}` and check it out) instead of starting over.\n")
    return base + (f"Work on branch lane/{n} (create it from {BRANCH}). Follow the worker rules in FLOW.md: run the tests you touched, commit "
                   f"(not the built oren2/index.html or oren2/cf/public/index.html), `git push -u {REMOTE} lane/{n}`, and open a PR to {BRANCH} "
                   f"with `gh pr create --repo {REPO} --base {BRANCH} --head lane/{n}` whose body contains `Fixes #{n}` (if you may only push claude/* branches, use your claude/* branch instead; the runner finds the PR by `Fixes #{n}`). Never deploy, never force-push, never push to {BRANCH}.\n"
                   f"You have no terminal the owner can see, so report ONLY through an issue comment: when finished post `gh issue comment {n} --repo {REPO} --body \"RESULT: DONE <PR url>\"`; "
                   f"if blocked post `RESULT: STUCK <why>`; if you need the owner post `QUESTION: <short question, with options>` and stop. "
                   "The comment must have that line on its own line.")

def run_over(issue_state, merged_at, since):
    """Pure (#234): the run has nothing left to do when its issue is CLOSED or a lane PR was merged AFTER this run started
    (since, ISO UTC). A lane/<n> PR merged before (a reopened issue reuses lane/<n>) does not count."""
    return issue_state == "CLOSED" or any(m and m >= since for m in merged_at or [])

_OVER_Q = ("query($o:String!,$r:String!,$n:Int!,$h:String!){repository(owner:$o,name:$r){"
           "issue(number:$n){state} pullRequests(headRefName:$h,states:MERGED,first:5,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{mergedAt}}}}")

def issue_over(n, since, run_=None):
    """#234: ONE gh call: is issue #n closed, or lane/<n> merged after `since` (run start)? Any gh/parse error -> False (never end a run on an error)."""
    o, name = REPO.split("/", 1)
    rc, out = (run_ or run)(["gh", "api", "graphql", "-f", f"query={_OVER_Q}", "-f", f"o={o}", "-f", f"r={name}", "-F", f"n={n}", "-f", f"h=lane/{n}"], timeout=60)
    if rc: return False
    try:
        repo = json.loads(out)["data"]["repository"]
        if run_over((repo.get("issue") or {}).get("state"), [x.get("mergedAt") for x in (repo.get("pullRequests") or {}).get("nodes") or []], since):
            return True
        p = remote.find_pr(n, run_ or run, "merged", fields="number,mergedAt")      # #246: a cloud worker's claude/* PR merged after the run start
        return bool(p) and run_over(None, [p.get("mergedAt")], since)
    except (ValueError, KeyError, TypeError, IndexError, AttributeError):
        return False

def wait_remote(get_status, sleep, clock, timeout_s=3 * 3600, poll_s=60, ended=None):
    """Pure loop (#133): poll the GitHub-based status until it is done/stuck/question. Returns that status dict, or {'state': 'timeout'}.
    ended() True (#234: issue closed / lane PR merged elsewhere) -> {'state': 'ended'}."""
    start = clock()
    while True:
        st = get_status()
        if st.get("state") in ("done", "stuck", "question"):
            return st
        if ended and ended():
            return {"state": "ended", "line": "", "pr": st.get("pr")}
        if clock() - start >= timeout_s:
            return {"state": "timeout", "line": "", "pr": st.get("pr")}
        sleep(poll_s)

class Refused(Exception):
    """#137: the cloud refused to start a session (CLI error, usage limit, no network): run locally or wait, never STUCK."""

def remote_worker(n, lane, bug, start, get_status, sleep, clock, timeout_s=3 * 3600, poll_s=60, on_start=None, ended=None, comment=None):
    """Start the cloud worker and wait for its comment. Returns the marker line (`RESULT: ...` / `QUESTION: ...`) like agent() does.
    on_start(start result) keeps the session id (#134: FIX points are sent back to this session).
    #137: a refused start raises Refused; a session silent for timeout_s (died without RESULT) -> comment() + ONE new session, then STUCK."""
    urls = []
    for attempt in (1, 2):
        s = start(n, remote_worker_prompt(n, lane, bug, retry=attempt > 1), CFG.get("main_checkout", "."))
        if not s.get("ok"):
            raise Refused(s.get("error", "?"))
        if on_start: on_start(s)
        urls.append(s.get("url", "") or "?")
        st = wait_remote(get_status, sleep, clock, timeout_s, poll_s, ended)
        if st["state"] == "ended": raise Ended("cloud worker")
        if st["state"] != "timeout":
            return st["line"]
        if attempt == 1 and comment:
            comment(f"Runner: the cloud session {urls[0]} ended without a RESULT line (silent for {timeout_s // 60} min); retrying once in a new cloud session.")
    return f"RESULT: STUCK cloud worker died twice without a RESULT line ({', '.join(urls)})"

REFUSE_PAUSE_S = 3600   # #137: after a refused cloud start: no new cloud start, and at most one orchestrator note, per hour

def refusal_state():
    try: return json.loads((RUNS / "remote_refused.json").read_text(encoding="utf-8"))
    except (OSError, ValueError): return {}

def remote_paused(state, now):
    return now - state.get("at", -REFUSE_PAUSE_S) < REFUSE_PAUSE_S

def note_due(state, now):
    return now - state.get("noted", -REFUSE_PAUSE_S) >= REFUSE_PAUSE_S

def lanes_now(remote_lanes, state, now):
    """Remote slots for this pass: none while a refused start is less than an hour old (no retry storm)."""
    return 0 if remote_paused(state, now) else remote_lanes

def record_refusal(n, error, now=None):
    """Remember the refusal (pauses cloud starts for an hour); one orchestrator note + watchdog.log line per hour. -> True when noted."""
    now = time.time() if now is None else now
    st = refusal_state(); due = note_due(st, now)
    st.update(at=now, error=error[:300], issue=n)
    if due: st["noted"] = now
    RUNS.mkdir(parents=True, exist_ok=True)
    (RUNS / "remote_refused.json").write_text(json.dumps(st), encoding="utf-8")
    if due:
        msg = f"cloud start refused for #{n}: {error[:200]} - cloud starts paused 1 h; issues run locally if a local lane is free, else wait"
        with open(RUNS / "watchdog.log", "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ", time.localtime(now)) + msg + chr(10))
        tell_orchestrator(msg)
    return due

def local_lane_free(n):
    """#137: is a local lane free for #n (other in-progress issues running locally < local_lanes)? Any gh error -> False."""
    if LOCAL_LANES <= 0: return False
    rc, out = gh("issue", "list", "--state", "open", "--label", "in-progress", "--limit", "200", "--json", "number,labels")
    if rc: return False
    try: busy = [i["number"] for i in json.loads(out) if i["number"] != n and "manual" not in [l["name"] for l in i["labels"]]]
    except (ValueError, KeyError, TypeError): return False
    return sum(where_of(b) == "local" for b in busy) < LOCAL_LANES

def find_marker(text, prefix):
    """Last RESULT:/VERDICT: line on a terminal screen (skips the echoed prompt: it has backticks / placeholders)."""
    hits = []
    for l in text.splitlines():
        s = l.strip().lstrip("\u25cf\u23fa\u2022").strip()
        if s.startswith(prefix) and "`" not in s and "<why>" not in s and (" or " not in s or prefix == "VERDICT:"):
            hits.append(s)
    return hits[-1] if hits else ""

# #149: four review colours. GREEN `VERDICT: PASS` merge / BLUE `VERDICT: PASS-NOTES a; b` merge + notes to the polish backlog /
# PURPLE `VERDICT: PURPLE <question> merge-safe|hold` owner question / RED `VERDICT: FIX <list>` only for wrong behaviour, missing test, spec miss, security, data loss, broken build.
FIX_ROUNDS = 2          # fix rounds before blocking (one more than before): up to 3 reviews

def parse_verdict(line):
    """VERDICT line -> (kind, text, extra); kind pass|notes|purple|fix|none. PURPLE extra = merge-safe|hold (no flag = hold)."""
    m = re.match(r"VERDICT:\s*(PASS-NOTES|PASS|PURPLE|FIX)\b\s*(.*)$", (line or "").strip(), re.S)
    if not m: return ("none", "", "")
    kind, text = m.group(1), m.group(2).strip()
    if kind == "PURPLE":
        flag = "hold"
        m2 = re.search(r"\s*\b(merge-safe|hold)\s*$", text)
        if m2: flag, text = m2.group(1), text[:m2.start()].strip()
        return ("purple", text, flag)
    return ({"PASS-NOTES": "notes", "PASS": "pass", "FIX": "fix"}[kind], text, "")

def polish_title(lane):
    return f"Polish backlog ({lane})"

def polish_lines(notes, pr):
    """'a; b' -> one backlog line per note, each with the PR number."""
    return [f"- {x.strip()} (PR #{pr})" for x in notes.split(";") if x.strip()]

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

def stat(n, lane, event, **extra):
    """Append one timing event to .runs/stats.jsonl (extra fields, e.g. deploy ok/url/d1); never raises."""
    try:
        RUNS.mkdir(exist_ok=True)
        with open(RUNS / "stats.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps({"ts": int(time.time()), "issue": n, "lane": lane, "event": event, **extra}) + chr(10))
    except Exception: pass

# ---------- pipeline for one issue ----------
class Blocked(Exception):
    pass

class Ended(Exception):
    """#234: the issue was closed or its lane PR merged elsewhere while the run waited: end as DONE, free the lane."""

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
    if os.name != "nt":                                  # CI on Linux (#152)
        try: os.kill(int(pid), 0); return True
        except (OSError, ValueError): return False
    rc, out = run(["tasklist", "/FI", f"PID eq {pid}", "/NH"])
    return f" {pid} " in out

class FileLock:
    """Cross-process lock: lock file holding our pid (+ #181: a note and the time taken); stale (dead pid) locks are taken over.
    wait=0: give up at once."""
    def __init__(self, name, wait=0, note=""):
        self.path, self.wait, self.note = RUNS / f"{name}.lock", wait, note
    def info(self):
        """-> (pid, note, since) of the current holder, or None. Old files hold only a pid."""
        try:
            parts = self.path.read_text(encoding="utf-8").split("\n")
            pid = int(parts[0].strip())
        except (OSError, ValueError, IndexError):
            return None
        note = parts[1].strip() if len(parts) > 1 else ""
        try: since = float(parts[2])
        except (IndexError, ValueError):
            try: since = self.path.stat().st_mtime
            except OSError: since = time.time()
        return pid, note, since
    def held_by_other(self):
        i = self.info()
        return bool(i) and pid_alive(i[0])
    def __enter__(self):
        RUNS.mkdir(exist_ok=True)
        while True:
            try:
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, f"{os.getpid()}\n{self.note}\n{time.time():.0f}".encode()); os.close(fd)
                return self
            except FileExistsError:
                if not self.held_by_other():
                    self.path.unlink(missing_ok=True); continue
                if not self.wait: raise Blocked("busy")
                time.sleep(20)
    def __exit__(self, *a):
        self.path.unlink(missing_ok=True)

def claude_hidden(prompt, cwd, tools, log, model=MODEL):
    cmd = [shutil.which("claude") or "claude", "-p", "--model", model, "--permission-mode", "auto",
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

def code_mode(n):
    """Code Mode trial (owner, 26 Nov): issues whose number is a multiple of code_mode_every run their Claude windows with
    CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1 (interactive sessions only; 0 = off). Recorded in the 'start' stat for comparison."""
    k = int(CFG.get("code_mode_every", 0) or 0)
    return k > 0 and int(n) % k == 0

def agent(name, prompt, cwd, tools, log, marker, n, role, model=MODEL, over=None):
    """Run an INTERACTIVE claude in a herdr terminal the owner can open; return (screen text, marker line).
    Terminals are closed after success and left open when BLOCKED/PARKED. A window of that name that is still live (parked earlier) is re-attached, not restarted.
    Waiting for a person longer than park_minutes -> Parked. Falls back to the hidden `claude -p` when herdr is unavailable."""
    if not USE_HERDR:
        out = claude_hidden(prompt, cwd, tools, log, model)
        return out, last_line(out, marker)
    if live(name):
        info0 = hc_json("get", name, "--json"); screen0 = hc("read", name, "--lines", "400")[1]
        if is_stale_window(info0.get("status"), screen0):      # finished before this run: its old verdict/result must not be reused
            hc("kill", name, timeout=30); hc("rm", name, timeout=30)
    if not live(name):
        # bash wrapper only puts the python3 shim on PATH; the prompt goes after `--` ("--allowedTools" is variadic)
        cmd = [HC, "run", "--bg", "--outlive-parent", "--name", name, "--cwd", str(cwd), "--label", f"issue={n}", "--label", f"role={role}", *space_args(), *parent_args(),
               BASH, "-c", 'export PATH="$1:$PATH"; shift; "$@"', "_", CFG["extra_path"],
               *(["env", "CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1"] if code_mode(n) else []),   # Code Mode trial (owner, 26 Nov)
               shutil.which("claude") or "claude", "--model", model, "--permission-mode", "auto",
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
                if over and over(): raise Ended(name)                      # #234: closed / merged elsewhere
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
    base = (f"You are an unattended worker for GitHub issue #{n} in repo {REPO} (lane: {lane}). If its title starts with 'Batch:', follow "
            f"its 'How to work' section: independent members (different files) may go to sub-agents (Agent tool); you integrate, test once "
            f"and open ONE PR with a 'Fixes #m' line per member. Read CLAUDE.md and FLOW.md, then the issue "
            f"(`gh issue view {n} --repo {REPO} --comments`). Work only inside this worktree (your cwd). Implement ONLY what the issue asks. Use the mattpocock-skills:tdd skill (test first).\n")
    if lane == "review":
        return base + (f"This is a read-only review issue: change NO files, make no commits, open no PR. Post your report as ONE issue comment "
                       f"(`gh issue comment {n} --repo {REPO} --body-file <file>`; write the file under oren2/tests/.tmp/). "
                       "The very last line of your final message must be `RESULT: DONE` or `RESULT: STUCK <why>`.")
    if bug:
        base += ("This is a BUG: use the mattpocock-skills:diagnosing-bugs skill, then tdd: reproduce it with a failing test (add it to the relevant suite in oren2/tests/), then fix it so the test passes; "
                 "say the root cause in the PR body.\n")
    steps = ("Steps: 1) implement; 2) python3 build_talents.py (in oren2/, PATH already has python3) and run the build + the suites for what you changed, muted "
             "(see FLOW.md); 3) for each changed screen take screenshots (skip them when no oren2/ file changed) at phone 390x844 and desktop 1366x768 into "
             f"C:/work/Oren_study/shots/{n}/ and LOOK at them (simple, one main action, Hebrew with nikud); 4) commit (do NOT commit oren2/index.html "
             f"or oren2/cf/public/index.html, node_modules, package*.json, tests/.tmp); 5) `git push -u {REMOTE} lane/{n}`; 6) open a PR to {BRANCH} with "
             f"`gh pr create --repo {REPO} --base {BRANCH} --head lane/{n}` whose body contains `Closes #{n}` (use the mattpocock-skills:pr skill to write the PR body; skip if a PR already exists). "
             "Never deploy, never force-push. If blocked or the issue is unclear, stop and say why. "
             "The very last line of your final message must be `RESULT: DONE` or `RESULT: STUCK <why>`.")
    if review_text:
        steps += ("\nThe PR already exists and a reviewer asked for fixes. Fix exactly these points on the same branch (new commit, push, no new PR), "
                  "re-run tests and screenshots:\n---\n" + review_text[-6000:] + "\n---")
    return base + steps

def review_colours(round1=""):
    colours = ("Verdict colours (the last line, exactly one): `VERDICT: PASS` (GREEN, nothing to say); "
               "`VERDICT: PASS-NOTES <note>; <note>` (BLUE: nothing wrong for Oren or the parent, only polish such as naming, small cleanup, extra test idea, comment wording; one line, notes split by `;`); "
               "`VERDICT: PURPLE <question in one line> merge-safe` or `... hold` (PURPLE: a real product/design choice only the owner can make, e.g. what Oren sees or hears or what the parent can do, the code works; "
               "merge-safe = merge now and ask, hold = park until he answers; never for code style); "
               "`VERDICT: FIX <points>` (RED). RED ONLY for: wrong behaviour for Oren or the parent, a failing or missing test for the change, a spec/acceptance miss, security, data loss, a broken build. "
               "Justify each RED point in one line. Everything else is a BLUE note, never FIX.")
    if round1:
        colours += ("\nThis is a re-review: check ONLY whether these round-1 RED points are fixed, raise NO new nits and no new points "
                    "(a new RED only if the fix itself broke something):\n---\n" + round1[-3000:] + "\n---")
    return colours

def review_prompt(n, pr, round1=""):
    colours = review_colours(round1)
    return (f"You are a fresh, read-only reviewer for PR #{pr} (issue #{n}) in {REPO}. You may not edit files. Read CLAUDE.md, the issue "
            f"(`gh issue view {n} --repo {REPO}`), the diff (`gh pr diff {pr} --repo {REPO}`, ignore the built index.html files) and the screenshots in "
            f"C:/work/Oren_study/shots/{n}/ (look at them; none expected when no oren2/ file changed). Check: correctness vs the issue, simplicity (one main action per screen), Hebrew with correct "
            "nikud, facts correct, no unrelated changes. Use the mattpocock-skills:code-review skill (Standards = CLAUDE.md + FLOW.md, Spec = the issue), then post ONE comment with `gh pr comment " + f"{pr} --repo {REPO} --body-file <file>` (write the file under "
            "oren2/tests/.tmp/; this is the only file you may write, via the Bash echo/redirect). Print the same comment as your output. "
            + colours)

def remote_review_prompt(n, pr, round1=""):
    """#134: task for a cloud reviewer session. No terminal: the verdict is read from its PR comment."""
    return (f"You are a fresh, read-only reviewer for PR #{pr} (issue #{n}) in {REPO}, running unattended in a cloud session. Change NO files, "
            f"make no commits, push nothing, open nothing. Read CLAUDE.md, FLOW.md, the issue with its comments (`gh issue view {n} --repo {REPO} --comments`) "
            f"and the diff (`gh pr diff {pr} --repo {REPO}`, ignore the built index.html files). Check: correctness vs the issue, simplicity (one main action "
            "per screen), Hebrew with correct nikud, facts correct, no unrelated changes, tests for the change. Use the code-review skill if you have it "
            f"(Standards = CLAUDE.md + FLOW.md, Spec = the issue). Then post ONE comment on the PR (`gh pr comment {pr} --repo {REPO} --body-file <file>`, "
            "file in your scratch dir). The runner reads ONLY that comment: put the verdict on its own line starting with VERDICT: (no backticks). "
            + review_colours(round1))

def remote_review(n, pr, round1, start, get_verdict, sleep, clock, timeout_s=3600, poll_s=60, ended=None):
    """#134: the reviewer as a cloud session; get_verdict() = remote.review_status of this round. -> (comment, VERDICT line) like agent(); '' line = none."""
    s = start(n, remote_review_prompt(n, pr, round1), CFG.get("main_checkout", "."))
    if not s.get("ok"):
        return f"remote review start failed: {s.get('error', '?')}", ""
    st = wait_remote(get_verdict, sleep, clock, timeout_s, poll_s, ended)
    if st["state"] == "ended": raise Ended("cloud review")
    if st["state"] == "timeout":
        return f"remote reviewer posted no VERDICT in {timeout_s // 60} min ({s.get('url', '')})", ""
    return st.get("body") or st["line"], st["line"]

def remote_fix_prompt(n, review_text, br=None):
    br = br or f"lane/{n}"
    return (f"Fix round for issue #{n} in {REPO}: the reviewer of the PR on branch {br} asked for fixes. If you are not on that branch: "
            f"`git fetch {REMOTE} {br} && git checkout {br}`; read CLAUDE.md and FLOW.md. Fix exactly these points (new commit, "
            f"`git push {REMOTE} {br}`, no new PR, never force-push, never push to {BRANCH}), run the tests you touched, then post an issue comment on #{n} "
            "with `RESULT: DONE <PR url>` (or `RESULT: STUCK <why>`, or `QUESTION: <question, options>` and stop) on its own line:\n---\n"
            + review_text[-6000:] + "\n---")

def remote_fix(n, session, review_text, send, start, get_status, sleep, clock, timeout_s=3 * 3600, poll_s=60, on_start=None, ended=None, br=None):
    """#134: FIX for a cloud worker: the points go to its session (send); no session or send failed -> a new cloud fix session. -> marker line."""
    text = remote_fix_prompt(n, review_text, br)
    if not (session and send(session, text).get("ok")):
        s = start(n, text, CFG.get("main_checkout", "."))
        if not s.get("ok"):
            return f"RESULT: STUCK remote fix start failed: {s.get('error', '?')}"
        if on_start: on_start(s)
    st = wait_remote(get_status, sleep, clock, timeout_s, poll_s, ended)
    if st["state"] == "ended": raise Ended("cloud fix")
    if st["state"] == "timeout":
        return f"RESULT: STUCK remote fix silent for {timeout_s // 3600}h"
    return st["line"]

def remote_resume(n, lane, bug, session, answer, send, start, get_status, sleep, clock, timeout_s=3 * 3600, poll_s=60, on_start=None, ended=None):
    """#135: the owner answered the cloud worker's QUESTION: the answer goes to the same session (send); no session or send failed ->
    a new cloud session that reads the issue thread and continues lane/<n>. -> marker line, like remote_worker."""
    text = (f"OWNER ANSWER to your QUESTION on #{n}: {answer}\nContinue the issue with this answer. Report on the issue as before, on its own line: "
            "`RESULT: DONE <PR url>`, `RESULT: STUCK <why>`, or `QUESTION: <short question, with options>` and stop.")
    if not (session and send(session, text).get("ok")):
        s = start(n, remote_worker_prompt(n, lane, bug) + f"\nThe owner already answered a QUESTION on this issue (read its comments): {answer}\n"
                  f"If lane/{n} is on GitHub, continue it (`git fetch {REMOTE} lane/{n} && git checkout lane/{n}`; no second PR).", CFG.get("main_checkout", "."))
        if not s.get("ok"):
            return f"RESULT: STUCK remote resume start failed: {s.get('error', '?')}"
        if on_start: on_start(s)
    st = wait_remote(get_status, sleep, clock, timeout_s, poll_s, ended)
    if st["state"] == "ended": raise Ended("cloud resume")
    if st["state"] == "timeout":
        return f"RESULT: STUCK remote worker silent for {timeout_s // 3600}h after the owner's answer"
    return st["line"]

def park_remote(n, line):
    """#135: the cloud session posted QUESTION: on the issue: park it (lane freed), the question goes to the owner, the orchestrator is told."""
    set_labels(n, add=["blocked", "ready-for-human"], remove=["in-progress"])
    gh("issue", "comment", str(n), "--body", "Parked (cloud): the cloud session waits for the owner (its question is above). The lane is free.\n\n"
       "Answer here on the issue (or through the question window / the orchestrator): the runner sends the answer to the same session and the issue resumes.")
    try:
        import owner_q; owner_q.post(f"remote-{n}", line)          # 'needs you': questions issue -> question window, panel, dashboard
    except Exception: pass
    tell_orchestrator(f"#{n} parked: its cloud session asks the owner: {line[:300]} - a question window asks him; "
                      f"his answer posted on #{n} resumes the session by itself (watchdog, within a minute).")
    raise Parked(f"cloud session of #{n}: {line[:200]}")

def answer_file(n):
    return RUNS / str(n) / "answer.json"

def pending_answer(n):
    return answer_file(n).exists()

def take_answer(n):
    """The stored owner answer for the resumed run (read once), or None."""
    try: a = json.loads(answer_file(n).read_text(encoding="utf-8")).get("answer")
    except (OSError, ValueError): return None
    answer_file(n).unlink(missing_ok=True)
    return a

def resume_remote(n, answer):
    """#135: unpark a cloud issue: keep the answer for the next run (it sends it to the session), labels back, the next pass starts it."""
    (RUNS / str(n)).mkdir(parents=True, exist_ok=True)
    answer_file(n).write_text(json.dumps({"answer": answer}, ensure_ascii=False), encoding="utf-8")
    set_labels(n, remove=["blocked", "ready-for-human"])
    gh("issue", "comment", str(n), "--body", redact("Runner: the owner answered; the cloud session gets the answer and the issue resumes."))
    tell_orchestrator(f"#{n} unparked: the owner answered ({answer[:200]}); the runner resumes its cloud session.")

def resume_answered():
    """#135 watchdog tick: parked cloud issues (blocked + ready-for-human, run in the cloud) whose QUESTION has an answer -> resume. -> numbers."""
    rc, out = gh("issue", "list", "--state", "open", "--label", "blocked", "--label", "ready-for-human", "--limit", "50", "--json", "number,comments")
    try: issues = json.loads(out) if rc == 0 and out.strip() else []
    except ValueError: return []
    done = []
    for i in issues:
        if where_of(i["number"]) != "remote": continue
        a = remote.answer_after_question(i.get("comments") or [])
        if a:
            resume_remote(i["number"], a); done.append(i["number"])
    return done

def post_polish(n, lane, pr, notes):
    """BLUE notes: one line each (with the PR link) on the ONE rolling 'Polish backlog (<lane>)' issue; created when missing. Never one issue per note."""
    lines = polish_lines(notes, pr)
    if not lines: return
    title = polish_title(lane)
    rc, out = gh("issue", "list", "--state", "open", "--search", f'"{title}" in:title', "--json", "number,title")
    num = None
    try: num = next((x["number"] for x in json.loads(out) if x["title"] == title), None)
    except ValueError: pass
    body = "\n".join(lines)
    if num:
        gh("issue", "comment", str(num), "--body", body)
    else:
        gh("issue", "create", "--title", title, "--label", lane, "--body",
           "Rolling list of BLUE review notes (polish only). When 5-8 notes are here, ONE worker does them in one PR.\n\n" + body)

def ask_owner(n, pr, question, flag):
    """PURPLE: the question goes to the owner via the orchestrator (never to the worker); on hold the issue is parked."""
    gh("issue", "comment", str(n), "--body", redact(f"Reviewer PURPLE question for the owner ({flag}, PR #{pr}): {question}"))
    if flag == "hold": set_labels(n, add=["blocked", "ready-for-human"], remove=["in-progress"])
    try:                                                  # #220: into the questions issue -> a question window asks the owner
        import owner_q; owner_q.post(f"review-{n}", "QUESTION: " + question)
    except Exception: pass
    tell_orchestrator(f"#{n} owner question ({flag}): {question[:300]} - ask the owner in Hebrew (tools/ask), post his answer on the issue")

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
    """Open PR number of issue n: lane/<n>, or a cloud worker's claude/* PR (#246, remote.pr_for)."""
    return remote.pr_for(n, run=run)[0]

def branch_of(n):
    """#246: head branch of issue n's open PR (lane/<n> when there is none)."""
    return remote.pr_for(n, run=run)[1] or f"lane/{n}"

def deploy_text(log):
    if CFG.get("deploy_in_ci", True):                      # #192: .github/workflows/deploy.yml deploys + pregens every green push to main
        return "deploy runs in GitHub Actions (workflow deploy, after tests)"
    tok = env_file().get("CLOUDFLARE_API_TOKEN", "")
    if not tok:
        return "not deployed: no token"
    env = {"CLOUDFLARE_API_TOKEN": tok}
    for k, v in env_file().items():
        if k.startswith("CLOUDFLARE_"): env[k] = v
    rc, out = run([BASH, "oren2/cf/tools/deploy.sh"], cwd=INTEG, env=env, log=log, timeout=900)
    last = (out.strip().splitlines() or [""])[-1]           # deploy.sh prints progress lines first, "ok <url>" last (#50)
    d1 = "D1 not bound" not in out                           # deploy.sh warns when the save database is not bound (#109)
    if rc != 0 or not last.startswith("ok"):
        stat(0, "", "deploy", ok=False, d1=d1, why=last[:200])   # #114: deploy evidence
        raise Blocked("deploy failed")
    url = last
    stat(0, "", "deploy", ok=True, d1=d1, url=last.split()[-1])
    if not CFG.get("pregen", False):                       # off until #68: pregen burns the free KV write limit
        return f"deployed {url} (pregen off)"
    return f"deployed {url} (voice pregen runs in the background)"   # #175: started by process() after the merge lock is released

def pregen_cmd():
    return ["node", "oren2/cf/tools/pregen.js"]

def start_pregen(log=None, popen=None):
    """#175: voice pregen in the background, OUTSIDE the merge lock (it can take 30 min); one at a time; never blocks an issue.
    -> 'started' / 'already running' / 'off' / 'failed: ...'."""
    if not CFG.get("pregen", False): return "off"
    lock = FileLock("pregen")
    if lock.held_by_other(): return "already running"
    env = dict(os.environ); env.update({k: v for k, v in env_file().items() if k.startswith("CLOUDFLARE_")})
    try:
        RUNS.mkdir(exist_ok=True)
        out = open(RUNS / "pregen.log", "a", encoding="utf-8")
        out.write(f"\n=== pregen {time.strftime('%Y-%m-%d %H:%M:%S')} ===\n"); out.flush()
        flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        p = (popen or subprocess.Popen)(pregen_cmd(), cwd=str(MAIN_CHECKOUT), env=env, stdout=out, stderr=subprocess.STDOUT, creationflags=flags)
        lock.path.write_text(str(p.pid))                     # held while that process lives (FileLock checks the pid)
        if log: log_to(log, f"voice pregen started in the background (pid {p.pid}, .runs/pregen.log)")
        return "started"
    except Exception as e:
        return f"failed: {e!r}"

def log_to(log, text):
    try:
        with open(log, "a", encoding="utf-8") as f: f.write(text + "\n")
    except OSError: pass

def ci_integrate(n, wt, log, over=None):
    """CI-based integrate (#74): update the lane with main, push, wait for the PR checks, `gh pr merge --squash`. -> (rc, out) like integrate.sh:
    0 merged, 2 conflict, 4 no PR, 5 push failed, 6 CI red after one rerun, 7 CI timeout / merge failed (blocked, real reason in out)."""
    pr, br = remote.pr_for(n, run=run)                           # #246: the head may be a cloud worker's claude/* branch
    if not pr: return 4, "no open PR for issue #%d" % n
    mergeable = gh("pr", "view", str(pr), "--json", "mergeable", "-q", ".mergeable", log=log)[1].strip()
    if needs_branch_update(mergeable):                           # #166: only a real conflict updates the branch
        run(["git", "fetch", "-q", REMOTE], cwd=wt, log=log)
        rc, out = run(["git", "merge", "--no-edit", "-X", "renormalize", f"{REMOTE}/{BRANCH}"], cwd=wt, log=log)
        if rc:
            files = run(["git", "diff", "--name-only", "--diff-filter=U"], cwd=wt, log=log)[1].split()
            run(["git", "merge", "--abort"], cwd=wt, log=log)
            return 2, "CONFLICTS (fix by hand, or send back to the lane):\n" + "\n".join(files)
        if run(["git", "rev-parse", "HEAD"], cwd=wt)[1] != run(["git", "rev-parse", f"{REMOTE}/{br}"], cwd=wt)[1]:
            if run(["git", "push", "-q", REMOTE, f"HEAD:{br}"], cwd=wt, log=log)[0]: return 5, "push failed"
            time.sleep(20)                                           # let GitHub start the new run
    def get_checks():
        try: return json.loads(gh("pr", "checks", str(pr), "--json", "name,bucket", log=log)[1] or "[]")
        except ValueError: return []
    def stamp():
        return run(["gh", "run", "list", "--repo", REPO, "--branch", br, "--limit", "1", "--json", "databaseId,status,attempt", "-q", ".[0]|[.databaseId,.status,.attempt]|join(\":\")"], log=log)[1].strip()
    def rerun():
        rid = run(["gh", "run", "list", "--repo", REPO, "--branch", br, "--limit", "1", "--json", "databaseId", "-q", ".[0].databaseId"], log=log)[1].strip()
        if rid.isdigit(): run(["gh", "run", "rerun", rid, "--failed", "--repo", REPO], log=log)
    def merge():
        with FileLock("integrate", wait=True, note=f"#{n} CI merge"):                   # #166: the lock covers only the merge itself
            rc_, o_ = gh("pr", "merge", str(pr), "--squash", log=log)
        return True if rc_ == 0 else ("conflict" if merge_conflict(o_) else False)
    res = ci_merge(get_checks, rerun, merge, time.sleep, int(CFG.get("ci_timeout_minutes", 60)) * 60, stamp=stamp, ended=over)
    if res[0] == "ended": raise Ended("CI merge")
    if res[0] == "merged": return 0, "merged PR #%d" % pr
    if res[0] == "red": return 6, "CI RED\n" + "\n".join(res[1])
    if res[0] == "conflict": return 2, "CONFLICT: main moved after green CI (gh pr merge reports merge conflicts)"
    return 7, "CI " + ("timed out" if res[0] == "timeout" else "green but `gh pr merge` failed")

def find_pr_merged(n):
    return remote.pr_for(n, run=run, state="merged")[0] is not None     # #246: lane/<n> or claude/* head

def deploy_main(log):
    """After CI merges (#74): bring the integrate checkout to main, rebuild, commit the built files if changed, deploy ONCE (skipped when this sha is already deployed)."""
    run(["git", "fetch", "-q", REMOTE], cwd=ROOT, log=log)
    if not (INTEG / ".git").exists():
        run(["git", "worktree", "prune"], cwd=ROOT); run(["git", "worktree", "add", "-B", "integrate", str(INTEG), f"{REMOTE}/{BRANCH}"], cwd=ROOT, log=log)
    run(["git", "merge", "--abort"], cwd=INTEG); run(["git", "reset", "-q", "--hard"], cwd=INTEG)
    run(["git", "checkout", "-q", "-B", "integrate", f"{REMOTE}/{BRANCH}"], cwd=INTEG, log=log)
    if run([sys.executable, "build_talents.py"], cwd=INTEG / "oren2", log=log)[0]: raise Blocked("build failed after CI merge")
    run(["git", "add", "oren2/index.html", "oren2/cf/public/index.html"], cwd=INTEG)
    if run(["git", "diff", "--cached", "--quiet"], cwd=INTEG)[0]:
        run(["git", "commit", "-qm", "Rebuild index.html\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"], cwd=INTEG, log=log)
        if run(["git", "push", "-q", REMOTE, f"HEAD:{BRANCH}"], cwd=INTEG, log=log)[0]: raise Blocked("push of rebuilt index.html failed")
    sha = run(["git", "rev-parse", "HEAD"], cwd=INTEG)[1].strip()
    mark = RUNS / "deployed.sha"                               # only used when deploy_in_ci = false (#192)
    if not deploy_needed(mark.read_text().strip() if mark.exists() else "", sha):
        return "already deployed with an earlier PR (batch)"
    dep = deploy_text(log)
    if dep.startswith("deployed"): mark.write_text(sha)       # never mark a sha that was not deployed (no token)
    return dep

MAX_CORE = int(CFG.get("max_core", 1))
EXPRESS = int(CFG.get("express_lanes", 0))

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

def where_of(n):
    """'remote' when this issue's worker runs in the cloud (#133): .runs/<n>/where, written when the run starts."""
    try: return (RUNS / str(n) / "where").read_text().strip() or "local"
    except OSError: return "local"

def set_where(n, where):
    (RUNS / str(n)).mkdir(parents=True, exist_ok=True)
    (RUNS / str(n) / "where").write_text(where)

def process(issue, where="local"):
    n = issue["number"]
    if pending_answer(n): where = "remote"          # #135: resumed after the owner's answer: its session is in the cloud
    try:
        with FileLock(f"issue-{n}"):
            if lane_of(issue["labels"]) == "core":
                with core_slot():                   # at most max_core core issues run; an extra one waits here, it does not fail
                    return process_locked(issue, where)
            return process_locked(issue, where)
    except Blocked:
        return "BLOCKED: already running"

def process_locked(issue, where="local"):
    n = issue["number"]; lane = lane_of(issue["labels"])
    d = RUNS / str(n); d.mkdir(parents=True, exist_ok=True)
    set_where(n, where)
    log = d / "run.log"
    wt = Path(CFG["worktree_prefix"] + str(n))
    wm, rm = model_of(issue["labels"]), reviewer_model(issue["labels"])
    started = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")      # remote: only issue comments after this count as the cloud worker's report
    try:
        stat(n, lane, "start", model=model_name(issue["labels"]), where=where, code_mode=code_mode(n))
        set_labels(n, add=["in-progress"]); gh("issue", "comment", str(n), "--body", f"Runner: started ({lane} lane, {where}, worker {model_name(issue['labels'])}, reviewer {rm}).")
        run(["git", "fetch", "-q", REMOTE], cwd=ROOT, log=log)
        def prep_worktree():
            pushed = bool(find_pr(n)) or bool(run(["git", "ls-remote", "--heads", REMOTE, f"lane/{n}"], cwd=ROOT)[1].strip())
            resume = any(live(w) for w in (f"issue-{n}", f"issue-{n}-fix", f"review-{n}", f"review-{n}-2", f"review-{n}-3", f"issue-{n}-fix2"))
            if resume and wt.exists():
                pass                                             # parked earlier: re-attach to its windows and worktree, change nothing
            else:
                if (wt.exists() or run(["git", "rev-parse", "--verify", f"lane/{n}"], cwd=ROOT)[0] == 0) and not pushed:   # leftovers of an unfinished try
                    remove_worktree(wt, log)
                    run(["git", "branch", "-D", f"lane/{n}"], cwd=ROOT, log=log)
                if not wt.exists():                              # lane.sh continues from origin/lane/<n> when pushed work exists (never deleted)
                    for attempt in (1, 2):                       # #116: one lane.sh at a time (two at once race on .git/config), one retry
                        with FileLock("lane", wait=True):
                            rc, _ = run([BASH, "tools/lane.sh", str(n), BRANCH], cwd=ROOT, env={"REMOTE": REMOTE}, log=log)
                        if not rc: break
                        remove_worktree(wt, log); run(["git", "branch", "-D", f"lane/{n}"], cwd=ROOT, log=log)
                    if rc: raise Blocked("lane.sh failed twice (see run.log)")
                    br = branch_of(n)                            # #246: a cloud worker's PR on claude/*: the worktree takes that branch's work
                    if br != f"lane/{n}":
                        run(["git", "fetch", "-q", REMOTE, br], cwd=wt, log=log)
                        if run(["git", "reset", "-q", "--hard", f"{REMOTE}/{br}"], cwd=wt, log=log)[0]: raise Blocked(f"cannot check out {br}")


        def save_session(s):                             # #134: FIX points go back to this cloud session; freeze reads it too
            (d / "remote.json").write_text(json.dumps({"session": s.get("session", ""), "url": s.get("url", "")}), encoding="utf-8")
        def utc():
            return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        over = lambda: issue_over(n, started)                   # #234: every wait loop ends the run when the issue is closed / PR merged
        def remote_question(res):                        # the session already posted it on the issue: park, the owner answers there (#135)
            if res.startswith("QUESTION:"): park_remote(n, res)
        def saved_session():
            try: return json.loads((d / "remote.json").read_text(encoding="utf-8")).get("session", "")
            except (OSError, ValueError): return ""
        answer = take_answer(n) if where == "remote" else None
        if answer:                                       # #135: parked on a QUESTION, the owner answered: same session continues
            res = remote_resume(n, lane, "bug" in issue["labels"], saved_session(), answer, remote.send, remote.start,
                                lambda: remote.status(n, since=started), time.sleep, time.time, 3 * 3600, 60, on_start=save_session, ended=over)
            remote_question(res)
            out = res
        elif where == "remote":                          # #133: the cloud worker needs no worktree here; it is made after the review (resolve uses it, #134)
            try:
                res = remote_worker(n, lane, "bug" in issue["labels"], remote.start, lambda: remote.status(n, since=started),
                                    time.sleep, time.time, 3 * 3600, 60, on_start=save_session, ended=over,
                                    comment=lambda b: gh("issue", "comment", str(n), "--body", b))
                remote_question(res)
                out = res
            except Refused as e:                         # #137: local lane free -> run here; else give the issue back, it waits
                record_refusal(n, str(e))
                if not local_lane_free(n):
                    stat(n, lane, "waiting", why="cloud start refused")
                    set_labels(n, remove=["in-progress"])
                    return f"WAITING: cloud start refused ({str(e)[:200]}), no local lane free"
                where = "local"; set_where(n, where)
                gh("issue", "comment", str(n), "--body", redact(f"Runner: cloud start refused ({str(e)[:200]}); running locally instead."))
        if where == "local":
            prep_worktree()
            out, res = agent(f"issue-{n}", worker_prompt(n, lane, bug="bug" in issue["labels"]), wt, WORKER_TOOLS if lane != "review" else REVIEW_LANE_TOOLS,
                             d / "worker1.log", "RESULT:", n, "worker", wm, over=over)
        (d / "worker1.out").write_text(redact(out), encoding="utf-8")
        if not res.startswith("RESULT: DONE"):
            raise Blocked(res or "worker gave no RESULT line")
        stat(n, lane, "worker_done", where=where)
        if lane == "review":
            gh("issue", "close", str(n), "--comment", "Review report posted above (runner).")
            set_labels(n, remove=["in-progress"]); close_windows(n); return "DONE report posted"

        verdict = ""; red = ""
        for rnd in range(1, FIX_ROUNDS + 2):
            pr = find_pr(n)
            if not pr: raise Blocked("worker said DONE but no open PR for #%d (lane/%d, the RESULT line's PR, or a PR body 'Fixes #%d')" % (n, n, n))
            if where == "remote":                  # #134: the reviewer is a cloud session too; its VERDICT is a PR comment
                since = utc()
                rv, verdict = remote_review(n, pr, red, remote.start, lambda: remote.review_status(pr, since=since), time.sleep, time.time, 3600, 60, ended=over)
            else:
                rv, verdict = agent(f"review-{n}" + ("" if rnd == 1 else f"-{rnd}"), review_prompt(n, pr, red), wt, READ_TOOLS,
                                    d / f"review{rnd}.log", "VERDICT:", n, "reviewer", rm, over=over)
            (d / f"review{rnd}.out").write_text(redact(rv), encoding="utf-8")
            kind, text, extra = parse_verdict(verdict)
            if kind == "pass":
                stat(n, lane, "review_pass"); break
            if kind == "notes":                    # BLUE: merge now, notes go to the rolling polish issue
                stat(n, lane, "review_pass", colour="blue"); post_polish(n, lane, pr, text); break
            if kind == "purple":                   # PURPLE: owner question; merge-safe merges, hold parks
                stat(n, lane, "review_pass" if extra == "merge-safe" else "parked", colour="purple")
                ask_owner(n, pr, text, extra)
                if extra == "merge-safe": break
                raise Parked(f"owner question: {text[:200]}")
            if kind != "fix":
                raise Blocked(verdict or "reviewer gave no VERDICT line" + (f": {rv[:300]}" if where == "remote" else ""))
            stat(n, lane, "review_fix")
            if rnd == FIX_ROUNDS + 1:
                stat(n, lane, "blocked")
                block(n, f"reviewer asked for fixes {rnd} times; needs a human", log); return f"BLOCKED: reviewer asked for fixes {rnd} times; needs a human"
            red = text or rv[-1500:]
            if where == "remote":                  # #134: FIX goes back to the cloud worker session (or a new cloud fix session)
                since = utc()
                res = remote_fix(n, saved_session(), rv, remote.send, remote.start, lambda: remote.status(n, since=since), time.sleep, time.time,
                                 3 * 3600, 60, on_start=save_session, ended=over, br=branch_of(n))
                remote_question(res)
            else:
                out, res = agent(f"issue-{n}-fix" + ("" if rnd == 1 else str(rnd)), worker_prompt(n, lane, rv, bug="bug" in issue["labels"]), wt, WORKER_TOOLS, d / f"worker{rnd + 1}.log", "RESULT:", n, "worker", wm, over=over)
            if not res.startswith("RESULT: DONE"):
                raise Blocked(res or "fix worker gave no RESULT line")
            stat(n, lane, "fix_done")
        if where == "remote": prep_worktree()        # #134: after the cloud review/fix rounds, so the worktree has the final pushed branch

        kind = {"ci": False}
        def integrate():
            if CFG.get("ci_merge", True) and find_pr(n):     # #74: CI decides, no local full suite
                rc, out = ci_integrate(n, wt, log, over)           # #166: takes the lock itself, only around `gh pr merge`
                kind["ci"] = rc == 6
                return rc, out
            with FileLock("integrate", wait=True, note=f"#{n} local merge"):          # fallback: local merge + full suite
                rc, out = run([BASH, "tools/integrate.sh", branch_of(n), BRANCH], cwd=ROOT,
                              env={"REMOTE": REMOTE, "JOBS": "4", "RUNNER": "1"}, log=log, timeout=3600)
                if rc:
                    run(["git", "merge", "--abort"], cwd=INTEG, log=log)
                return rc, out
        rounds = [0]
        def resolve(files):
            rounds[0] += 1
            stat(n, lane, "resolve")
            o, r_ = agent(f"issue-{n}-resolve{rounds[0]}", ci_fix_prompt(n, files, branch_of(n)) if kind["ci"] else resolve_prompt(n, files, branch_of(n)), wt, WORKER_TOOLS, d / f"resolve{rounds[0]}.log", "RESULT:", n, "worker", wm, over=over)
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
        with FileLock("integrate", wait=True, note=f"#{n} deploy"):
            stat(n, lane, "merged")
            dep = deploy_main(log) if CFG.get("ci_merge", True) and find_pr_merged(n) else deploy_text(log)
        if dep.startswith("deployed"): start_pregen(log)    # #175: after the lock, in the background
        m = sync_main(log)                       # result logged (review of #47)
        if m: log_line(m)
        gh("issue", "close", str(n), "--comment", f"Merged to {BRANCH}, tests green, {dep}.")
        set_labels(n, remove=["in-progress"])
        remove_worktree(wt, log)
        close_windows(n)
        stat(n, lane, "deployed")
        return f"DONE {dep}"
    except Ended as e:                          # #234: closed / merged elsewhere: DONE, lane freed (locks: the caller's `with`)
        stat(n, lane, "ended")
        set_labels(n, remove=["in-progress"])
        remove_worktree(wt, log)
        close_windows(n)
        return f"DONE closed or merged elsewhere (seen in {e})"
    except Parked as e:                         # waiting for the owner: windows stay open, locks are released by the caller's `with`
        stat(n, lane, "parked")
        return f"PARKED: waiting for the owner in {e}"
    except Blocked as e:
        stat(n, lane, "blocked")
        block(n, str(e), log); return f"BLOCKED: {e}"
    except Exception as e:                      # any crash: never leave the issue in-progress
        stat(n, lane, "blocked")
        try:                                    # full traceback in run.log: a bare FileNotFoundError(2, ...) names no file (#158)
            import traceback
            with open(log, "a", encoding="utf-8") as f:
                f.write(f"\n[runner crash] sys.executable={sys.executable!r}\n{traceback.format_exc()}\n")
        except Exception: pass
        block(n, f"runner error: {e!r}", log); return f"BLOCKED: runner error {e!r}"

def close_windows(n):
    """After a successful issue: close its worker/reviewer windows (kept open when BLOCKED, so the owner can look)."""
    if not USE_HERDR: return
    for t in (f"issue-{n}", f"issue-{n}-fix", f"issue-{n}-resolve1", f"issue-{n}-resolve2", f"review-{n}", f"review-{n}-2", f"review-{n}-3", f"issue-{n}-fix2"):
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

def do_freeze():
    """#139: `--freeze` stops new work and parks running issues at a safe point; `--unfreeze` lets work start again."""
    import freeze
    if "--unfreeze" in sys.argv:
        freeze.unfreeze(RUNS); print("unfrozen: runner and watchdog start work again"); return 0
    def windows():
        rc, out = hc("ls", "--json", timeout=30)
        try: return json.loads(out.strip().splitlines()[-1]).get("terminals", [])
        except Exception: return []
    def remote(n):
        try: return json.loads((RUNS / str(n) / "remote.json").read_text(encoding="utf-8")).get("session", "")
        except Exception: return ""
    res = freeze.freeze(RUNS, windows, lambda w, m: hc("send", w, m, timeout=30), lambda w: hc("read", w, "--lines", "60", timeout=30)[1],
                        find_pr, lambda n, b: gh("issue", "comment", str(n), "--body", b), remote, time.sleep, time.time)
    print(res["message"]); return 0 if not res["open"] else 1

def main():
    if "--freeze" in sys.argv or "--unfreeze" in sys.argv: return do_freeze()
    import freeze
    if freeze.is_frozen(RUNS) and not DRY:
        print("frozen: nothing new starts (tools/runner/runner.py --unfreeze to continue)"); return 0
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
        res = process(issue, "remote" if "--remote" in sys.argv else "local")
        log_line(f"{now()} #{n}: {res}")
        print(f"ISSUE {n}: {res}")
        if USE_HERDR and TERM: spawn([])        # keep the lanes full: a fresh pass picks the next ready issues
        return 0
    rc, out = gh("issue", "list", "--state", "open", "--limit", "200", "--json", "number,labels,createdAt,updatedAt,title,body")
    if rc: print("gh failed:", out); return 1
    issues = [{**i, "labels": [l["name"] for l in i["labels"]]} for i in json.loads(out)]
    busy = [i["number"] for i in issues if "in-progress" in i["labels"]]
    remote_busy = sum(where_of(b) == "remote" for b in busy)
    gv = governor_pass(remote_busy)                     # #239: remote lane count from the 5h usage
    remote_lanes = lanes_now(gv["lanes"], refusal_state(), time.time())   # #137: no cloud starts for 1 h after a refusal
    chosen = [] if gv["stop"] else [c for c in select(issues, LOCAL_LANES + remote_lanes, MAX_CORE, EXPRESS) if not FileLock(f"issue-{c['number']}").held_by_other()]
    wmap = {c["number"]: w for c, w in assign_where(chosen, len(busy) - remote_busy, remote_busy, LOCAL_LANES, remote_lanes)}
    chosen = [c for c in chosen if c["number"] in wmap]
    cutoff = CFG["stuck_hours"] * 3600
    stuck = [i for i in issues if "in-progress" in i["labels"] and not FileLock(f"issue-{i['number']}").held_by_other()
             and (time.time() - datetime.fromisoformat(i["updatedAt"].replace("Z", "+00:00")).timestamp()) > cutoff]
    if DRY:
        print(f"[dry-run] repo={REPO} branch={BRANCH} model={MODEL} local_lanes={LOCAL_LANES} remote_lanes={REMOTE_LANES} max_core={MAX_CORE}")
        print(f"[dry-run] {governor_text(gv)}; {gv['why']}")
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
            set_where(c["number"], wmap[c["number"]])
            if spawn([str(c["number"])] + (["--remote"] if wmap[c["number"]] == "remote" else [])):                         # could not start (e.g. name_taken): give it back, log it, don't count it
                set_labels(c["number"], remove=["in-progress"]); results.append((c["number"], "not started (hc run failed)"))
            else: results.append((c["number"], "started"))
    elif chosen:
        with ThreadPoolExecutor(max_workers=len(chosen)) as ex:
            results = list(ex.map(lambda c: (c["number"], process(c, wmap[c["number"]])), chosen))
    log_line(f"{now()} pass: started={sum(r == 'started' for _, r in results) if results else len(chosen)} stuck={len(stuck)} " + " ".join(f"#{n}:{r}" for n, r in results))
    for n, r in results: print(f"ISSUE {n}: {r}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
