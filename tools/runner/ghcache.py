"""#329: ONE GitHub reader. The watchdog calls refresh() once a minute: one batched GraphQL query (open issues with comments,
recent closed issues, recent PRs with comments/commits, lane branches) + the free `gh api rate_limit` -> .runs/gh_cache.json.
Every gh call of the runner, the per-lane polls, the panel (remote.py cloud) and the dashboard goes through call():
  - a READ the cache can answer (gh issue list/view, gh pr list/view, gh api .../branches/lane/<n>) is answered from it, no gh call;
  - anything else runs gh; a rate-limit answer ("API rate limit", "secondary rate limit") is retried after Retry-After / 60 s;
  - a WRITE marks its issue/PR dirty, so reads of it go to GitHub until the next refresh (lists: after any newer write).
A cache older than MAX_AGE (watchdog down) is never used: everything falls back to plain gh.
#469: two identities (the GitHub App and the owner login, two budgets). A rate-limited answer marks that identity limited
(.runs/gh_limited.json) and the same call runs at once as the other one (log 'switched to owner/app'); while one is limited, calls start
on the other. Both limited -> a short BOTH_WAIT, then retry. quick(s): every wait and timeout of the calls inside stays within s seconds
(owner questions: 10 s). Each real call is logged with its identity and caller: `python ghcache.py top [minutes]` = calls per minute per caller."""
import json, os, re, sys, threading, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNS = Path(os.environ.get("RUNNER_RUNS") or HERE / ".runs")
CACHE, DIRTY, CALLS = RUNS / "gh_cache.json", RUNS / "gh_dirty.log", RUNS / "gh_calls.log"
MAX_AGE = 180              # s; the watchdog refreshes every ~60 s
CLOSED_KEEP = 300          # closed issues kept across refreshes (the panel's/cleanup's 300)
TRIES = 5                  # rate-limited calls: tries before the caller gets the error
ALARM_PCT = 20
LIMITED = RUNS / "gh_limited.json"   # #469: {"until": {who: ts}, "hits": [[ts, who, kind], ...]}
BOTH_WAIT = 5              # s: both identities limited -> wait this, then retry
KEEP_CALLS = 7200          # s of gh_calls.log kept (enough to find a burst afterwards)
OTHER = {"app": "owner", "owner": "app"}
OWNER_MIN_PCT = 50         # #911: a bot uses the owner login only above this % GraphQL left (it is the login of every Claude session and git)
STALE_LIMITED = 600        # #911: a read of a limited app is answered from a cache up to this old (s) instead of the owner login
ROLLUP_FINAL = ("SUCCESS", "FAILURE", "ERROR")   # #911: a PR's cached check rollup is final (the real `gh pr checks` decides)

def _repo():
    try:
        import tomllib
        return tomllib.loads((HERE / "config.toml").read_text(encoding="utf-8")).get("repo", "igalgerman/oren_study")
    except Exception: return "igalgerman/oren_study"
REPO = _repo()

# ---------- rate limit -> retry ----------
_RL = re.compile(r"rate limit|abuse detection", re.I)
def rate_limited(text): return bool(_RL.search(text or ""))

def wait_s(text, default=60):
    m = re.search(r"retry[- ]after:?\s*(\d+)", text or "", re.I)
    return max(1, min(300, int(m[1]))) if m else default

# #365: set by runner.tick_mode inside a watchdog tick (per thread; survives a module reload): calls are bounded, no rate-limit sleeps
_TICK = globals().get("_TICK") or threading.local()
def tick_cap(): return getattr(_TICK, "cap", None)

_clock = time.monotonic    # tests swap in a fake clock
class quick:
    """#469: inside, gh waits (rate-limit sleeps, timeouts) end by `seconds` from now. Nested: the earlier deadline wins."""
    def __init__(self, seconds): self.s = seconds
    def __enter__(self):
        self.prev = getattr(_TICK, "deadline", None)
        d = _clock() + self.s
        _TICK.deadline = min(d, self.prev) if self.prev is not None else d
        return self
    def __exit__(self, *a): _TICK.deadline = self.prev

def quick_left():
    """Seconds left inside quick(), else None."""
    d = getattr(_TICK, "deadline", None)
    return None if d is None else max(0.0, d - _clock())

class gate_read:
    """#911: inside, a read is an owner-gate read (owner_q.comments): it may use the owner login when the app is limited."""
    def __enter__(self): self.prev = getattr(_TICK, "gate", False); _TICK.gate = True; return self
    def __exit__(self, *a): _TICK.gate = self.prev

def owner_pct():
    """Owner login GraphQL left in % from the cache, None when unknown."""
    r = ((load() or {}).get("rate_owner") or {}).get("graphql")
    return round(100 * r[0] / r[1]) if r and r[1] else None

def owner_allowed(cmd):
    """#911: may a bot fall back to the owner login for this call? Only a write or a gate read, and only above OWNER_MIN_PCT
    (unknown budget counts as allowed: a question to the owner must not wait)."""
    if not (is_write(cmd) or getattr(_TICK, "gate", False)): return False
    p = owner_pct()
    return p is None or p > OWNER_MIN_PCT

def _limits():
    try: return json.loads(LIMITED.read_text(encoding="utf-8"))
    except (OSError, ValueError): return {}

def is_limited(who, now=None):
    return (_limits().get("until") or {}).get(who, 0) > (time.time() if now is None else now)

def mark_limited(who, text, now=None):
    now = time.time() if now is None else now
    d = _limits()
    d.setdefault("until", {})[who] = now + wait_s(text)
    kind = "secondary" if re.search(r"secondary|abuse", text or "", re.I) else "primary"
    d["hits"] = (d.get("hits") or [])[-19:] + [[now, who, kind]]
    try:
        RUNS.mkdir(parents=True, exist_ok=True)
        tmp = LIMITED.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text(json.dumps(d), encoding="utf-8"); os.replace(tmp, LIMITED)
    except OSError: pass

def _switch_log(frm, to):
    _append(RUNS / "ghauth.log", f"{time.strftime('%Y-%m-%d %H:%M:%S')} {frm} rate limited: switched to {to} (#469)")

def with_retry(once, sleep=None, tries=TRIES):
    """once() -> (rc, out). A rate-limit failure is transient: wait and try again (up to `tries`), never raise."""
    for k in range(tries):
        rc, out = once()
        if rc == 0 or not rate_limited(out) or k == tries - 1: return rc, out
        (sleep or time.sleep)(wait_s(out))

# ---------- reads vs writes ----------
_WRITE_SUB = {"issue": {"edit", "comment", "close", "reopen", "create", "delete", "lock", "unlock", "pin", "unpin", "transfer", "develop"},
              "pr": {"merge", "edit", "comment", "create", "close", "reopen", "ready", "review", "update-branch"},
              "run": {"rerun", "cancel", "delete"}}

def is_write(cmd):
    if len(cmd) < 2 or cmd[0] != "gh": return False
    if cmd[1] == "label": return True
    if cmd[1] == "api":
        args = cmd[2:]
        for i, a in enumerate(args):
            if a in ("-X", "--method") and i + 1 < len(args): return args[i + 1].upper() != "GET"
        if "graphql" in args: return any(a.startswith("query=") and a[6:].lstrip().startswith("mutation") for a in args)
        return any(a in ("-f", "-F", "--field", "--raw-field", "--input") for a in args)
    return len(cmd) > 2 and cmd[2] in _WRITE_SUB.get(cmd[1], ())

def write_target(cmd):
    """The issue/PR number a write touches ('' = no issue/PR data: labels, workflow runs; 'new' = a created issue/PR: only lists change;
    '*' = unknown, #911: only when no number can be found in the command)."""
    if len(cmd) > 1 and cmd[1] in ("label", "run"): return ""
    if len(cmd) > 2 and cmd[1] in ("issue", "pr") and cmd[2] == "create": return "new"
    if len(cmd) > 2 and cmd[1] in ("issue", "pr"):
        skip = False
        for a in cmd[3:]:                                    # the first positional number, flag values skipped (`--repo X 911`)
            a = str(a)
            if skip: skip = False; continue
            if a.startswith("-"): skip = "=" not in a and a not in ("--squash", "--auto", "--merge", "--rebase", "--admin", "--delete-branch", "--web", "--disable-auto"); continue
            if a.lstrip("#").isdigit(): return a.lstrip("#")
    m = next((re.search(r"/(?:issues|pulls)/(\d+)", a) for a in cmd if re.search(r"/(?:issues|pulls)/(\d+)", a)), None)
    if m: return m[1]
    if len(cmd) > 2 and cmd[1] == "api" and any(re.search(r"/(?:issues|pulls)$", str(a)) for a in cmd): return "new"   # POST .../issues
    nums = {m2 for a in cmd for m2 in re.findall(r"(?:^|[=\s])(?:number|issueNumber|prNumber|n)=(\d+)$", str(a))}
    return nums.pop() if len(nums) == 1 else "*"

def _append(path, line):
    try:
        RUNS.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f: f.write(line + "\n")
    except OSError: pass

def mark_dirty(target, now=None): _append(DIRTY, f"{now if now is not None else time.time():.3f} {target}")
def caller_of(cmd):
    return f"{Path(sys.argv[0] or 'py').stem}:{cmd[1] if len(cmd) > 1 else ''}"

def endpoint_of(cmd):
    """Endpoint of a gh call with numbers/ids replaced and no query string (#848): 'repos/{o}/{r}/issues/{n}/comments';
    `gh issue list` -> 'issue list'. Never a token, never a query value. No spaces (one log field)."""
    try:
        if len(cmd) > 2 and cmd[1] == "api":
            a = next((x for x in cmd[2:] if x == "graphql" or re.match(r"/?(repos|user|orgs|search|rate_limit|app|installation)", x)), "")
            if a == "graphql": return "graphql"
            parts = a.split("?")[0].strip("/").split("/")
            if len(parts) >= 3 and parts[0] == "repos": parts[1:3] = ["{o}", "{r}"]
            return "/".join("{n}" if re.fullmatch(r"\d+", x) else "{sha}" if re.fullmatch(r"[0-9a-f]{40}", x) else x for x in parts)[:120] or "api"
        return "_".join(str(x) for x in cmd[1:3] if not str(x).startswith("-"))[:40]
    except Exception: return ""

def note_call(now=None, who="app", caller=None, endpoint=""):
    _append(CALLS, f"{now if now is not None else time.time():.0f} {who} {caller or caller_of(['gh'])}" + (f" {endpoint.replace(' ', '_')}" if endpoint else ""))

def _lines(path):
    try: return path.read_text(encoding="utf-8").splitlines()
    except OSError: return []

def _calls():
    """gh_calls.log -> [(ts, who, caller, endpoint)] (old lines: endpoint ''; one-field lines: who/caller '?')."""
    out = []
    for l in _lines(CALLS):
        f = l.split()
        if len(f) > 1 and f[1] == "cost": continue                      # #911: refresh cost lines are not calls
        try: out.append((float(f[0]), f[1] if len(f) > 1 else "?", f[2] if len(f) > 2 else "?", f[3] if len(f) > 3 else ""))
        except (IndexError, ValueError): pass
    return out

def calls_per_min(now=None):
    now = time.time() if now is None else now
    return sum(1 for t, *_ in _calls() if now - 60 <= t <= now + 1)

def calls_by(now=None):
    now = time.time() if now is None else now
    out = {}
    for t, who, *_ in _calls():
        if now - 60 <= t <= now + 1: out[who] = out.get(who, 0) + 1
    return out

def top_report(t0, t1):
    """Calls per minute between t0 and t1: 'HH:MM  total  who n top-caller · ...' (find what bursts, #469)."""
    mins = {}
    tot = {}
    for t, who, caller, ep in _calls():
        if t0 <= t <= t1:
            caller = f"{caller} {ep}" if ep else caller
            tot[caller] = tot.get(caller, 0) + 1
            d = mins.setdefault(int(t // 60) * 60, {}).setdefault(who, {})
            d[caller] = d.get(caller, 0) + 1
    rows = []
    for m in sorted(mins):
        per = sorted(((sum(cs.values()), who, max(cs, key=cs.get)) for who, cs in mins[m].items()), key=lambda x: (-x[0], x[1]))
        rows.append(f"{time.strftime('%H:%M', time.localtime(m))}  {sum(n for n, _, _ in per)}  " + " · ".join(f"{w} {n} {c}" for n, w, c in per))
    if tot: rows += ["", "total by caller + endpoint:"] + [f"{n:6d}  {c}" for c, n in sorted(tot.items(), key=lambda x: (-x[1], x[0]))[:15]]
    return "\n".join(rows)

def _ts_ok(line, since):
    try: return float(line.split()[0]) >= since
    except (IndexError, ValueError): return False

def _dirty_since(ts):
    out = set()
    for l in _lines(DIRTY):
        try: t, what = l.split(" ", 1)
        except ValueError: continue
        try: ok = float(t) >= ts
        except ValueError: continue                                      # #726: a torn line is skipped
        if ok: out.add(what.strip())
    return out

# ---------- the cache ----------
def load():
    try: return json.loads(CACHE.read_text(encoding="utf-8"))
    except Exception: return None

def _save(c):
    RUNS.mkdir(parents=True, exist_ok=True)
    tmp = CACHE.with_suffix(".tmp")
    tmp.write_text(json.dumps(c, ensure_ascii=False), encoding="utf-8")
    for i in range(5):                                                  # #726: Windows WinError 5 while a reader holds the file
        try: os.replace(tmp, CACHE); return
        except PermissionError:
            if i == 4: raise
            time.sleep(0.2)

def _usable(now, max_age=None):
    c = load()
    return c if c and now - c.get("ts", 0) <= (MAX_AGE if max_age is None else max_age) else None

_COMMENTS = "comments(last:20){totalCount nodes{body createdAt url author{login}}}"   # #911: no reaction users (owner_q.comments reads them itself), the last 20 only (more -> comments_cut -> real gh)
_Q = ("query($o:String!,$r:String!,$oc:String,$cc:String,$wo:Boolean!,$wc:Boolean!,$full:Boolean!){repository(owner:$o,name:$r){"
      "open:issues(states:OPEN,first:100,after:$oc,orderBy:{field:CREATED_AT,direction:DESC})@include(if:$wo){totalCount pageInfo{hasNextPage endCursor}"
      " nodes{number title body url state createdAt updatedAt closedAt labels(first:30){nodes{name}} " + _COMMENTS + "}}"
      " closed:issues(states:CLOSED,first:100,after:$cc,orderBy:{field:UPDATED_AT,direction:DESC})@include(if:$wc){totalCount pageInfo{hasNextPage endCursor}"
      " nodes{number title url state createdAt updatedAt closedAt labels(first:30){nodes{name}}}}"
      " prs:pullRequests(first:100,orderBy:{field:UPDATED_AT,direction:DESC})@include(if:$full){nodes{number url title headRefName body state isDraft"
      " mergedAt createdAt updatedAt closedAt labels(first:30){nodes{name}} mergeable autoMergeRequest{enabledAt} closingIssuesReferences(first:5){nodes{number}} headRefOid commits(last:1){nodes{commit{committedDate statusCheckRollup{state}}}} comments(last:20){totalCount nodes{body createdAt url author{login}}}}}"   # #911: headRefOid for the CI wait; slim comments
      " openPrs:pullRequests(states:OPEN)@include(if:$full){totalCount}"
      " refs(refPrefix:\"refs/heads/lane/\",first:100,orderBy:{field:TAG_COMMIT_DATE,direction:DESC})@include(if:$full){pageInfo{hasNextPage} nodes{name target{... on Commit{committedDate}}}}"
      "} rateLimit{cost remaining}}")   # #911: the cost of every refresh is logged

def _flat(node):
    d = dict(node)
    if isinstance(d.get("labels"), dict): d["labels"] = [{"name": l["name"]} for l in d["labels"].get("nodes") or []]
    if isinstance(d.get("comments"), dict):
        cs = d["comments"]; d["comments"] = cs.get("nodes") or []
        if cs.get("totalCount", 0) > len(d["comments"]): d["comments_cut"] = True   # #637: only the last ones cached -> reads of comments go to gh
    if isinstance(d.get("commits"), dict):
        nodes = d["commits"].get("nodes") or []
        d["commits"] = [{"committedDate": (c.get("commit") or {}).get("committedDate", "")} for c in nodes]
        st = ((nodes[-1].get("commit") or {}).get("statusCheckRollup") or {}).get("state") if nodes else None   # panel: CI red = FAILURE/ERROR
        d["statusCheckRollup"] = [{"state": st, "conclusion": st}] if st else []   # watchdog green checks read conclusion (review #341)
    if isinstance(d.get("closingIssuesReferences"), dict): d["closingIssuesReferences"] = d["closingIssuesReferences"].get("nodes") or []
    return d

def _query(run, full, open_cur=None, closed_cur=None, want_open=True, want_closed=True):
    o, r = REPO.split("/", 1)
    cmd = ["gh", "api", "graphql", "-f", f"query={_Q}", "-f", f"o={o}", "-f", f"r={r}",
           "-F", f"wo={str(want_open).lower()}", "-F", f"wc={str(want_closed).lower()}", "-F", f"full={str(full).lower()}"]
    if open_cur: cmd += ["-f", f"oc={open_cur}"]
    if closed_cur: cmd += ["-f", f"cc={closed_cur}"]
    rc, out = run(cmd)
    if rc: raise RuntimeError(f"gh graphql rc {rc}: {out.strip()[:200]}")
    try:
        data = json.loads(out)["data"]
        cost = (data.get("rateLimit") or {}).get("cost")
        if cost is not None: _append(CALLS, f"{time.time():.0f} cost refresh graphql_cost={cost}")   # #911: measured, `ghcache.py top` shows it
        return data["repository"]
    except (ValueError, KeyError, TypeError): raise RuntimeError(f"gh graphql: unexpected answer {out.strip()[:200]}")

def refresh_costs(minutes=60, now=None):
    """#911: the graphql cost (points) of each refresh in the last `minutes`, oldest first."""
    now = time.time() if now is None else now
    out = []
    for l in _lines(CALLS):
        f = l.split()
        try:
            if len(f) >= 4 and f[1] == "cost" and f[3].startswith("graphql_cost=") and now - 60 * minutes <= float(f[0]): out.append(int(f[3].split("=", 1)[1]))
        except ValueError: pass
    return out

_GATED_C = "comments(last:100){totalCount nodes{body createdAt url author{login} reactionGroups{content users(first:20){totalCount nodes{login}}}}}"   # #637: reactions (owner_q)

def gated_issues(opn):
    """#911: the open issues whose cached comments need the reacting users: the ones holding an owner question (owner-gate issues)
    and the owner_q questions issue itself. Everything else is cached without reactions."""
    nums = {i["number"] for i in opn if any("<!-- owner-q:" in (c.get("body") or "") for c in i.get("comments") or [])}
    try:
        q = json.loads((RUNS / "owner_q.json").read_text(encoding="utf-8")).get("issue")
        if q and any(i["number"] == int(q) for i in opn): nums.add(int(q))
    except (OSError, ValueError, TypeError): pass
    return sorted(nums)

def _gated_comments(run, nums):
    """One query for the comments (with reaction users) of the gated issues -> {number: flat issue fragment}."""
    o, r = REPO.split("/", 1)
    q = "query($o:String!,$r:String!){repository(owner:$o,name:$r){" + " ".join(f"i{n}:issue(number:{n}){{{_GATED_C}}}" for n in nums) + "} rateLimit{cost remaining}}"
    rc, out = run(["gh", "api", "graphql", "-f", f"query={q}", "-f", f"o={o}", "-f", f"r={r}"])
    if rc: return {}
    try:
        data = json.loads(out)["data"]
        cost = (data.get("rateLimit") or {}).get("cost")
        if cost is not None: _append(CALLS, f"{time.time():.0f} cost refresh graphql_cost={cost}")
        repo = data["repository"]
        return {n: _flat({"comments": repo[f"i{n}"]["comments"]}) for n in nums if repo.get(f"i{n}")}
    except (ValueError, KeyError, TypeError): return {}

def merge_closed(prev, new, open_nums, keep=CLOSED_KEEP):
    """Pure: closed issues = this refresh's page + the ones kept from before, minus issues open again; newest closedAt first."""
    by = {i["number"]: i for i in prev if i["number"] not in open_nums}
    by.update({i["number"]: i for i in new if i["number"] not in open_nums})
    return sorted(by.values(), key=lambda i: i.get("closedAt") or "", reverse=True)[:keep]

def _rate(run):
    rc, out = run(["gh", "api", "rate_limit"])                         # free: does not count against the limit
    try:
        res = json.loads(out)["resources"] if rc == 0 else {}
        return {k: [res[k]["remaining"], res[k]["limit"]] for k in ("graphql", "core") if k in res}
    except (ValueError, KeyError, TypeError): return {}

def refresh(run, now=None, run_owner=None):
    """The ONE reader (watchdog, once a minute). run(cmd) -> (rc, out). Writes and returns the cache; raises on a gh error (old cache stays).
    #363: run_owner (set when the GitHub App is on) reads the owner's own budget too -> c['rate_owner']."""
    now = time.time() if now is None else now
    repo = _query(run, True)
    opn, cur = [_flat(i) for i in repo["open"]["nodes"]], repo["open"]["pageInfo"]
    for _ in range(4):                                                  # > 100 open issues: next pages (issues only)
        if not cur.get("hasNextPage"): break
        page = _query(run, False, open_cur=cur["endCursor"], want_closed=False)["open"]
        opn += [_flat(i) for i in page["nodes"]]; cur = page["pageInfo"]
    open_nums = {i["number"] for i in opn}
    gated = gated_issues(opn)
    if gated:                                                           # #911: reaction users only where an owner gate reads them
        frag = _gated_comments(run, gated)
        for i in opn:
            f = frag.get(i["number"])
            if f:
                i["comments"] = f["comments"]
                if f.get("comments_cut"): i["comments_cut"] = True
                else: i.pop("comments_cut", None)
    prev = load() or {}
    closed = merge_closed(prev.get("closed") or [], [_flat(i) for i in repo["closed"]["nodes"]], open_nums)
    total, ccur = repo["closed"].get("totalCount", len(closed)), repo["closed"]["pageInfo"]
    for _ in range(2):                                                  # first run: fill the closed list once (later: one page a minute)
        if len(closed) >= min(CLOSED_KEEP, total) or not ccur.get("hasNextPage"): break
        page = _query(run, False, closed_cur=ccur["endCursor"], want_open=False)["closed"]
        closed = merge_closed(closed, [_flat(i) for i in page["nodes"]], open_nums); ccur = page["pageInfo"]
    refs = repo.get("refs") or {}
    c = {"ts": now, "open": opn, "open_complete": not cur.get("hasNextPage"), "closed": closed, "closed_total": total,
         "prs": [_flat(p) for p in (repo.get("prs") or {}).get("nodes") or []], "open_prs": (repo.get("openPrs") or {}).get("totalCount", 0),
         "prs_complete": len((repo.get("prs") or {}).get("nodes") or []) < 100,
         "lanes": {n["name"]: (n.get("target") or {}).get("committedDate", "") for n in refs.get("nodes") or []},
         "lanes_complete": not (refs.get("pageInfo") or {}).get("hasNextPage"), "rate": dict(prev.get("rate") or {})}
    c["rate"] = _rate(run) or c["rate"]
    if run_owner: c["rate_owner"] = _rate(run_owner) or dict(prev.get("rate_owner") or {})
    _save(c)
    keep = [l for l in _lines(CALLS) if _ts_ok(l, now - KEEP_CALLS)]     # trim the logs (#726: garbage lines are dropped)
    try:
        CALLS.write_text("".join(x + "\n" for x in keep), encoding="utf-8")
        DIRTY.write_text("".join(x + "\n" for x in _lines(DIRTY)[-200:]), encoding="utf-8")
    except OSError: pass
    return c

# ---------- answers ----------
_FLAGS = {"--repo": "repo", "-R": "repo", "--state": "state", "-s": "state", "--label": "label", "-l": "label",
          "--limit": "limit", "-L": "limit", "--json": "json", "--head": "head", "-H": "head"}

def _parse(args):
    """gh flags -> dict, or None when a flag the cache cannot honour is present (--jq, --search, ...)."""
    o, pos, i = {"label": []}, [], 0
    while i < len(args):
        a = str(args[i])
        if a in _FLAGS and i + 1 < len(args):
            k = _FLAGS[a]
            if k == "label": o["label"].append(args[i + 1])
            else: o[k] = str(args[i + 1])
            i += 2
        elif a.startswith("-"): return None
        else: pos.append(a); i += 1
    o["pos"] = pos
    return o

def _pick(items, fields):
    out = []
    for it in items:
        if any(f not in it for f in fields) or ("comments" in fields and it.get("comments_cut")): return None
        out.append({f: it[f] for f in fields})
    return out

def _issue_list(c, o):
    state, limit = o.get("state", "open").lower(), int(o.get("limit", 30))
    if state not in ("open", "closed", "all"): return None
    items = (c["open"] if state != "closed" else []) + (c["closed"] if state != "open" else [])
    items = sorted((i for i in items if all(l in [x["name"] for x in i.get("labels", [])] for l in o["label"])), key=lambda i: i["number"], reverse=True)
    complete = (state == "closed" or c.get("open_complete")) and (state == "open" or len(c["closed"]) >= c.get("closed_total", 0))
    return items[:limit] if complete or len(items) >= limit else None

def _pr_list(c, o):
    state, limit = o.get("state", "open").lower(), int(o.get("limit", 30))
    if state not in ("open", "closed", "merged", "all"): return None
    items = [p for p in c["prs"] if (state == "all" or p.get("state", "").lower() == state)
             and (not o.get("head") or p.get("headRefName") == o["head"])
             and all(l in [x["name"] for x in p.get("labels", [])] for l in o["label"])]
    complete = c.get("prs_complete") or (state == "open" and sum(p.get("state") == "OPEN" for p in c["prs"]) >= c.get("open_prs", 0))
    return items[:limit] if complete or o.get("head") or len(items) >= limit else None   # --head lane/<n>: its PR is recent

def answer(cmd, now=None, max_age=None):
    """(0, json text) when the cache can answer this read exactly enough, else None (-> real gh). max_age: #911 a staler cache is fine."""
    if len(cmd) < 3 or cmd[0] != "gh" or is_write(cmd): return None
    now = time.time() if now is None else now
    c = _usable(now, max_age)
    if not c: return None
    dirty = _dirty_since(c["ts"])
    if cmd[1] == "api":
        m = re.fullmatch(rf"repos/{re.escape(REPO)}/branches/lane/(\d+)", str(cmd[2]))
        if not m or cmd[3:] != ["--jq", ".commit.commit.committer.date"] or {m[1], "*"} & dirty: return None
        if m[1] in c.get("lanes", {}): return 0, c["lanes"][m[1]] + "\n"
        return (1, "gh: Branch not found (HTTP 404)") if c.get("lanes_complete") else None
    if cmd[1] not in ("issue", "pr") or cmd[2] not in ("list", "view"): return None
    o = _parse(cmd[3:])
    if o is None or "json" not in o or o.get("repo", REPO) != REPO: return None
    fields = o["json"].split(",")
    if cmd[2] == "view":
        if len(o["pos"]) != 1 or not o["pos"][0].lstrip("#").isdigit(): return None
        n = int(o["pos"][0].lstrip("#"))
        if {str(n), "*"} & dirty: return None
        pool = c["prs"] if cmd[1] == "pr" else c["open"] + c["closed"]
        it = next((x for x in pool if x["number"] == n), None)
        got = _pick([it], fields) if it else None
        return (0, json.dumps(got[0], ensure_ascii=False)) if got else None
    if o["pos"] or dirty: return None
    items = _issue_list(c, o) if cmd[1] == "issue" else _pr_list(c, o)
    got = _pick(items, fields) if items is not None else None
    return (0, json.dumps(got, ensure_ascii=False)) if got is not None else None

def pr_rollup(n, now=None):
    """#911: the cached check rollup of PR n: 'SUCCESS'|'FAILURE'|'ERROR'|'PENDING'|'EXPECTED'|'' (no checks yet), None when the cache cannot tell
    (stale, PR missing, or a write touched it since the last refresh)."""
    now = time.time() if now is None else now
    c = _usable(now)
    if not c or {str(n), "*"} & _dirty_since(c["ts"]): return None
    p = next((x for x in c["prs"] if x["number"] == n), None)
    if not p: return None
    r = p.get("statusCheckRollup") or []
    return (r[0].get("state") or "") if r else ""

def issue_over_cached(n, since, now=None):
    """#234 from the cache: True/False when known, None when the cache cannot tell (-> the GraphQL check)."""
    now = time.time() if now is None else now
    c = _usable(now)
    if not c or {str(n), "*"} & _dirty_since(c["ts"]): return None
    if any(i["number"] == n for i in c["closed"]): return True
    if not any(i["number"] == n for i in c["open"]): return None
    fixes = re.compile(rf"\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#{n}(?!\d)", re.I)     # same as remote.fixes (#246); no import: no cycle
    return any(p.get("mergedAt") and p["mergedAt"] >= since and (p.get("headRefName") == f"lane/{n}" or fixes.search(p.get("body") or ""))
               for p in c["prs"])

def call(cmd, raw, now=None, sleep=None, alt=None, who="app"):
    """The one gh entry point: cache first for reads; real calls counted; writes mark dirty.
    #469: alt() = the same call as the other identity. A rate limit switches to it at once (no sleep); both limited -> BOTH_WAIT, retry.
    No alt (one identity): the old Retry-After / 60 s wait. Inside quick(): all waiting stays within its deadline."""
    if not cmd or cmd[0] != "gh": return raw()
    hit = answer(cmd, now)
    if hit: return hit
    if alt and who == "app" and not owner_allowed(cmd):          # #911: the owner login stays free for the sessions
        alt = None
        if is_limited("app", now):
            hit = answer(cmd, now, max_age=STALE_LIMITED)        # the app is limited: a cache up to 10 min old, else wait for the reset
            if hit: return hit
    ids = [(who, raw)] + ([(OTHER.get(who, "owner"), alt)] if alt else [])
    if alt and is_limited(ids[0][0]) and not is_limited(ids[1][0]): ids.reverse()   # the free budget first (reads and writes)
    caller, tries = caller_of(cmd), 1 if tick_cap() else TRIES
    rc, out = 1, ""
    for k in range(tries):
        for j, (name, fn) in enumerate(ids):
            note_call(now, name, caller, endpoint_of(cmd)); rc, out = fn()
            if rc == 0 or not rate_limited(out): break
            mark_limited(name, out)
            if j + 1 < len(ids): _switch_log(name, ids[j + 1][0])
        else:
            if k == tries - 1: break
            w, left = (BOTH_WAIT if alt else wait_s(out)), quick_left()
            if left is not None:
                if left <= 0: break
                w = min(w, left)
            (sleep or time.sleep)(w)
            continue
        break
    if is_write(cmd) and write_target(cmd): mark_dirty(write_target(cmd), None if now is None else now + 0.5)
    return rc, out

# ---------- dashboard ----------
def status_line(c, calls, now=None, by=None):
    now = time.time() if now is None else now
    per = f" ({' · '.join(f'{w} {n}' for w, n in sorted(by.items()))})" if by else ""     # #469: calls per identity
    hit = next((h for h in reversed(_limits().get("hits") or []) if now - 3600 <= h[0] <= now + 1), None)
    alarm = f"ALARM {hit[1]} hit the {hit[2]} rate limit {time.strftime('%H:%M', time.localtime(hit[0]))}" if hit else ""
    if not c: return f"GitHub: {calls} calls/min{per} · no cache yet (watchdog reads GitHub once a minute)" + (f" · {alarm}" if alarm else "")
    parts, low = [f"GitHub: {calls} calls/min{per}"], False
    ids = [("app ", c.get("rate") or {}), ("owner ", c["rate_owner"])] if c.get("rate_owner") else [("", c.get("rate") or {})]   # #363
    for who, rate in ids:
        lim_until = _limits().get("until") or {}
        until = lim_until.get(who.strip(), 0) if len(ids) > 1 else max(lim_until.values(), default=0)
        for k in ("graphql", "core"):
            if k in rate:
                rem, lim = rate[k]
                p = round(100 * rem / lim) if lim else 0
                if until > now:                                    # #911: GitHub's own "already exceeded" answer beats the cached reading
                    rem, p = 0, 0; parts.append(f"{who}{k} 0/{lim} (0%, limited until {time.strftime('%H:%M', time.localtime(until))} by GitHub's answer)")
                else: parts.append(f"{who}{k} {rem}/{lim} ({p}%)")
                low = low or p < ALARM_PCT
    age = int(now - c.get("ts", 0))
    parts.append(f"cache {age} s old")
    if low: parts.append(f"ALARM GitHub budget < {ALARM_PCT}%")
    if age > MAX_AGE: parts.append("ALARM cache stale (is the watchdog running?)")
    if alarm: parts.append(alarm)
    return " · ".join(parts)

def dashboard_line(now=None):
    return status_line(load(), calls_per_min(now), now, calls_by(now))

if __name__ == "__main__":     # python tools/runner/ghcache.py top [minutes]: gh calls per minute per identity and caller (#469)
    if sys.argv[1:2] == ["top"]:
        t = time.time(); print(top_report(t - 60 * int((sys.argv[2:3] or ["60"])[0]), t) or "no calls logged")
    else: print(__doc__)
