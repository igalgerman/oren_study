"""#262: a green/approved PR that conflicts with main (mergeable_state=dirty) never auto-merges and nothing reacted.
Every watchdog tick: each open PR that is dirty AND has auto-merge set or a review PASS gets a resolve run (the runner's
resolve worker: merge origin/main in, resolve, tests, normal push), lane/* and claude/* heads, one run per PR at a time.
#289: the resolve run is a cloud session on the PR branch (watchdog.resolve_start), never a local worker; a round counts as
running for RESOLVE_WAIT_MIN while the head has not moved.
Two failed rounds (still dirty, head not moved) -> blocked + needs-orchestrator (never ready-for-human: the owner never resolves).
State: .runs/conflicts.json {pr: {n, rounds, head, told}}; dashboard count: .runs/pr_conflicts.json [pr numbers]."""
import json, re, time
from pathlib import Path

MAX_ROUNDS = 2
RESOLVE_WAIT_MIN = 40     # #289: a cloud resolve round has no local window: it counts as running this long (head unchanged)
FIXES = re.compile(r"\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)\b", re.I)
VERDICT = re.compile(r"^\s*VERDICT:\s*(\S+)", re.M)
BUSY = re.compile(r"^(?:run|resolve)-(\d+)$|^issue-(\d+)-resolve\d+$")
FIELDS = "number,headRefName,headRefOid,mergeable,mergeStateStatus,autoMergeRequest,isDraft,body,comments"

def issue_of(p):
    """Issue number of a PR: lane/<n>, else the first Fixes/Closes/Resolves #n in its body; None when neither."""
    m = re.match(r"^lane/(\d+)$", p.get("headRefName") or "")
    if m: return int(m[1])
    m = FIXES.search(p.get("body") or "")
    return int(m[1]) if m else None

def is_dirty(p):
    return (p.get("mergeable") or "").upper() == "CONFLICTING" or (p.get("mergeStateStatus") or "").upper() == "DIRTY"

def last_verdict(p):
    hits = [h for c in p.get("comments") or [] for h in VERDICT.findall((c.get("body") if isinstance(c, dict) else c) or "")]
    return hits[-1].upper() if hits else ""

def eligible(p, passed):
    """Auto-merge set, or a review PASS / PASS-NOTES (runner stats for local runs, the last VERDICT comment for cloud reviews)."""
    return p.get("autoMergeRequest") is not None or issue_of(p) in passed or last_verdict(p).startswith("PASS")

def busy(ts):
    """Issues with a live run-<n> (its own flow resolves), resolve-<n> or issue-<n>-resolve<k> window."""
    out = set()
    for t in ts:
        m = BUSY.match(t.get("name") or "")
        if m and t.get("state") == "live": out.add(int(m[1] or m[2]))
    return out

def decide(prs, busy, passed, state, max_rounds=MAX_ROUNDS, now=None, wait_min=RESOLVE_WAIT_MIN):
    """Pure: -> [{do: start|escalate, pr, n, branch, round}]. state is changed in place (str(pr) -> {n, rounds, head, told, at}).
    now (#289): a round started less than wait_min ago on the same head is still running (cloud session): wait."""
    acts, open_ = [], {str(p["number"]) for p in prs}
    for k in [k for k in state if k not in open_]: state.pop(k)            # merged / closed
    for p in prs:
        k, n = str(p["number"]), issue_of(p)
        if not is_dirty(p):
            if (p.get("mergeable") or "").upper() == "MERGEABLE": state.pop(k, None)   # resolved; UNKNOWN = GitHub still computing
            continue
        if p.get("isDraft") or n is None or not eligible(p, passed) or n in busy: continue
        s = state.get(k)
        if s and s.get("head") != p.get("headRefOid"): s = None               # a push landed (the resolve worked), main moved again: start over
        if s and now is not None and now - s.get("at", -1e18) < wait_min * 60: continue   # #289: the cloud round is still working
        if s and s["rounds"] >= max_rounds:
            if not s.get("told"):
                s["told"] = True
                acts.append({"do": "escalate", "pr": p["number"], "n": n, "branch": p.get("headRefName"), "round": s["rounds"]})
            continue
        rnd = (s["rounds"] if s else 0) + 1
        state[k] = {"n": n, "rounds": rnd, "head": p.get("headRefOid"), "told": False, **({"at": now} if now is not None else {})}
        acts.append({"do": "start", "pr": p["number"], "n": n, "branch": p.get("headRefName"), "round": rnd})
    return acts

def _load(path):
    try: return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError): return {}

def tick(busy_issues, passed_of, gh, start, say, path, now=None):
    """One pass. passed_of(issue numbers) -> set with a review PASS; start(action) -> True when the resolve run started;
    say(text) tells the orchestrator. A gh error does nothing."""
    rc, out = gh("pr", "list", "--state", "open", "--limit", "100", "--json", FIELDS)
    if rc: return []
    try: prs = json.loads(out)
    except ValueError: return []
    path = Path(path)
    try: (path.parent / "pr_conflicts.json").write_text(json.dumps(sorted(p["number"] for p in prs if is_dirty(p))), encoding="utf-8")
    except OSError: pass
    state = _load(path)
    nums = {n for p in prs for n in [issue_of(p)] if n}
    acts = decide(prs, busy_issues, passed_of(nums), state, now=time.time() if now is None else now)
    for a in acts:
        if a["do"] == "start" and not start(a):
            st = state.get(str(a["pr"]), {})                                   # not started: this round does not count
            st["rounds"] -= 1
            if st["rounds"] <= 0: state.pop(str(a["pr"]), None)
        elif a["do"] == "escalate":
            why = (f"PR #{a['pr']} ({a['branch']}) still conflicts with main after {a['round']} automatic resolve rounds (watchdog #262).")
            gh("issue", "edit", str(a["n"]), "--add-label", "blocked", "--add-label", "needs-orchestrator", "--remove-label", "in-progress")
            gh("issue", "comment", str(a["n"]), "--body", "Runner: " + why + " Orchestrator: resolve it by hand or send it back to the lane.")
            say(f"CONFLICT (watchdog #262): {why} Issue #{a['n']} is blocked + needs-orchestrator.")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(state), encoding="utf-8")
    except OSError: pass
    return acts
