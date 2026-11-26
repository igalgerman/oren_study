"""#329: ONE GitHub reader. The watchdog calls refresh() once a minute: one batched GraphQL query (open issues with comments,
recent closed issues, recent PRs with comments/commits, lane branches) + the free `gh api rate_limit` -> .runs/gh_cache.json.
Every gh call of the runner, the per-lane polls, the panel (remote.py cloud) and the dashboard goes through call():
  - a READ the cache can answer (gh issue list/view, gh pr list/view, gh api .../branches/lane/<n>) is answered from it, no gh call;
  - anything else runs gh; a rate-limit answer ("API rate limit", "secondary rate limit") is retried after Retry-After / 60 s;
  - a WRITE marks its issue/PR dirty, so reads of it go to GitHub until the next refresh (lists: after any newer write).
A cache older than MAX_AGE (watchdog down) is never used: everything falls back to plain gh."""
import json, os, re, threading, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNS = Path(os.environ.get("RUNNER_RUNS") or HERE / ".runs")
CACHE, DIRTY, CALLS = RUNS / "gh_cache.json", RUNS / "gh_dirty.log", RUNS / "gh_calls.log"
MAX_AGE = 180              # s; the watchdog refreshes every ~60 s
CLOSED_KEEP = 300          # closed issues kept across refreshes (the panel's/cleanup's 300)
TRIES = 5                  # rate-limited calls: tries before the caller gets the error
ALARM_PCT = 20

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
    """The issue/PR number a write touches ('*' = unknown / many, '' = no issue/PR data: labels, workflow runs)."""
    if len(cmd) > 1 and cmd[1] in ("label", "run"): return ""
    if len(cmd) > 3 and cmd[1] in ("issue", "pr") and str(cmd[3]).lstrip("#").isdigit(): return str(cmd[3]).lstrip("#")
    m = next((re.search(r"/(?:issues|pulls)/(\d+)", a) for a in cmd if re.search(r"/(?:issues|pulls)/(\d+)", a)), None)
    return m[1] if m else "*"

def _append(path, line):
    try:
        RUNS.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f: f.write(line + "\n")
    except OSError: pass

def mark_dirty(target, now=None): _append(DIRTY, f"{now if now is not None else time.time():.3f} {target}")
def note_call(now=None): _append(CALLS, f"{now if now is not None else time.time():.0f}")

def _lines(path):
    try: return path.read_text(encoding="utf-8").splitlines()
    except OSError: return []

def calls_per_min(now=None):
    now = time.time() if now is None else now
    return sum(1 for l in _lines(CALLS) if l.strip() and now - 60 <= float(l) <= now + 1)

def _dirty_since(ts):
    out = set()
    for l in _lines(DIRTY):
        try: t, what = l.split(" ", 1)
        except ValueError: continue
        if float(t) >= ts: out.add(what.strip())
    return out

# ---------- the cache ----------
def load():
    try: return json.loads(CACHE.read_text(encoding="utf-8"))
    except Exception: return None

def _save(c):
    RUNS.mkdir(parents=True, exist_ok=True)
    tmp = CACHE.with_suffix(".tmp")
    tmp.write_text(json.dumps(c, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, CACHE)

def _usable(now):
    c = load()
    return c if c and now - c.get("ts", 0) <= MAX_AGE else None

_COMMENTS = "comments(last:100){nodes{body createdAt author{login}}}"
_Q = ("query($o:String!,$r:String!,$oc:String,$cc:String,$wo:Boolean!,$wc:Boolean!,$full:Boolean!){repository(owner:$o,name:$r){"
      "open:issues(states:OPEN,first:100,after:$oc,orderBy:{field:CREATED_AT,direction:DESC})@include(if:$wo){totalCount pageInfo{hasNextPage endCursor}"
      " nodes{number title body url state createdAt updatedAt closedAt labels(first:30){nodes{name}} " + _COMMENTS + "}}"
      " closed:issues(states:CLOSED,first:100,after:$cc,orderBy:{field:UPDATED_AT,direction:DESC})@include(if:$wc){totalCount pageInfo{hasNextPage endCursor}"
      " nodes{number title url state createdAt updatedAt closedAt labels(first:30){nodes{name}}}}"
      " prs:pullRequests(first:100,orderBy:{field:UPDATED_AT,direction:DESC})@include(if:$full){nodes{number url title headRefName body state isDraft"
      " mergedAt createdAt updatedAt closedAt labels(first:30){nodes{name}} mergeable autoMergeRequest{enabledAt} closingIssuesReferences(first:5){nodes{number}} commits(last:1){nodes{commit{committedDate statusCheckRollup{state}}}} comments(last:50){nodes{body createdAt author{login}}}}}"
      " openPrs:pullRequests(states:OPEN)@include(if:$full){totalCount}"
      " refs(refPrefix:\"refs/heads/lane/\",first:100,orderBy:{field:TAG_COMMIT_DATE,direction:DESC})@include(if:$full){pageInfo{hasNextPage} nodes{name target{... on Commit{committedDate}}}}"
      "}}")

def _flat(node):
    d = dict(node)
    if isinstance(d.get("labels"), dict): d["labels"] = [{"name": l["name"]} for l in d["labels"].get("nodes") or []]
    if isinstance(d.get("comments"), dict): d["comments"] = d["comments"].get("nodes") or []
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
    try: return json.loads(out)["data"]["repository"]
    except (ValueError, KeyError, TypeError): raise RuntimeError(f"gh graphql: unexpected answer {out.strip()[:200]}")

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
    keep = [l for l in _lines(CALLS) if l.strip() and float(l) >= now - 600]     # trim the logs
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
        if any(f not in it for f in fields): return None
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

def answer(cmd, now=None):
    """(0, json text) when the cache can answer this read exactly enough, else None (-> real gh)."""
    if len(cmd) < 3 or cmd[0] != "gh" or is_write(cmd): return None
    now = time.time() if now is None else now
    c = _usable(now)
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

def call(cmd, raw, now=None, sleep=None):
    """The one gh entry point: cache first for reads; real calls counted and retried on rate limits; writes mark dirty."""
    if not cmd or cmd[0] != "gh": return raw()
    hit = answer(cmd, now)
    if hit: return hit
    def once():
        note_call(now); return raw()
    rc, out = with_retry(once, sleep, 1 if tick_cap() else TRIES)
    if is_write(cmd) and write_target(cmd): mark_dirty(write_target(cmd), None if now is None else now + 0.5)
    return rc, out

# ---------- dashboard ----------
def status_line(c, calls, now=None):
    now = time.time() if now is None else now
    if not c: return f"GitHub: {calls} calls/min · no cache yet (watchdog reads GitHub once a minute)"
    parts, low = [f"GitHub: {calls} calls/min"], False
    ids = [("app ", c.get("rate") or {}), ("owner ", c["rate_owner"])] if c.get("rate_owner") else [("", c.get("rate") or {})]   # #363
    for who, rate in ids:
        for k in ("graphql", "core"):
            if k in rate:
                rem, lim = rate[k]
                p = round(100 * rem / lim) if lim else 0
                low = low or p < ALARM_PCT
                parts.append(f"{who}{k} {rem}/{lim} ({p}%)")
    age = int(now - c.get("ts", 0))
    parts.append(f"cache {age} s old")
    if low: parts.append(f"ALARM GitHub budget < {ALARM_PCT}%")
    if age > MAX_AGE: parts.append("ALARM cache stale (is the watchdog running?)")
    return " · ".join(parts)

def dashboard_line(now=None):
    return status_line(load(), calls_per_min(now), now)
