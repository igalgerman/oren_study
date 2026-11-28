"""#951 ETA from measured speed, never a guess. `python3 tools/runner/eta.py <issue...>` prints the ETA and its basis.
ETA = now + (ready issues ahead / merges per hour, last 6 h) + (open chain incl. itself x median cycle of the last 20 merged of its kind).
Owner OKs / preview days are named separately (not counted: nobody can measure them). Every ETA given is logged to .runs/eta.jsonl;
`eta.py --check` (and the nightly retro) report hit / miss / pending against the merged events."""
import json, os, re, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import stats, repos

RUNS = Path(os.environ.get("RUNNER_RUNS") or Path(__file__).resolve().parent / ".runs")
LOG = RUNS / "eta.jsonl"
WINDOW_H, LAST_N = 6, 20
H = 3600
_BLOCK = re.compile(r"^\s*Blocked by:\s*(.+)$", re.I | re.M)

def _labels(i): return [x["name"] if isinstance(x, dict) else x for x in i.get("labels", [])]
def _rank(i):
    l = _labels(i)
    if "express" in l: return -1
    for p in range(4):
        if f"P{p}" in l: return p
    return 2
def kind(i): return "core" if "core" in _labels(i) else "pack"
def _open(i): return bool(i) and str(i.get("state", "open")).lower() == "open"

def merged_events(events):
    """distinct merged issues -> time of the latest merged event."""
    m = {}
    for e in events:
        if e.get("event") == "merged": m[e["issue"]] = max(m.get(e["issue"], 0), e["ts"])
    return m

def merges_per_hour(events, now):
    n = sum(1 for t in merged_events(events).values() if now - WINDOW_H * H < t <= now)
    return n / WINDOW_H

def cycle_time(events, issues, k, now=None):
    """median start -> merge seconds of the last LAST_N merged issues of kind k (core / pack); None without data."""
    rows = []
    for p in stats.compute(events, now)["issues"]:
        if "merge" not in p: continue
        lane = next((e.get("lane") for e in events if e["issue"] == p["issue"] and e["event"] == "start" and e["ts"] == p["start"]), None)
        kk = lane if lane in ("core", "pack") else (kind(issues[p["issue"]]) if p["issue"] in issues else "pack")
        if kk == k: rows.append((p["merged_at"], p["merge"]))
    xs = sorted(m for _, m in sorted(rows)[-LAST_N:])
    if not xs: return None
    return (xs[len(xs) // 2] + xs[(len(xs) - 1) // 2]) / 2

def blockers(i):
    return [int(n) for m in _BLOCK.findall(i.get("body") or "") for n in re.findall(r"#(\d+)", m)]

def chain(n, issues):
    """open issues in the 'Blocked by' chain of n (not n itself), in discovery order."""
    out, todo = [], blockers(issues.get(n, {}))
    while todo:
        b = todo.pop(0)
        if b in out or b == n or not _open(issues.get(b)): continue
        out.append(b); todo += blockers(issues[b])
    return out

def eta(n, issues, events, now=None):
    now = time.time() if now is None else now
    i = issues.get(n)
    if not i: return {"issue": n, "ts": None, "why": "unknown issue", "waits": []}
    if not _open(i): return {"issue": n, "ts": None, "why": "closed", "waits": []}
    k, ch = kind(i), chain(n, issues)
    per_hour, cyc = merges_per_hour(events, now), cycle_time(events, issues, k, now)
    ahead = [j["number"] for j in issues.values() if j["number"] != n and j["number"] not in ch and _open(j)
             and {"ready-for-agent", "in-progress"} & set(_labels(j)) and kind(j) == k and _rank(j) <= _rank(i) and not [b for b in blockers(j) if _open(issues.get(b))]]
    l = _labels(i)
    waits = (["owner OK (merge)"] if "owner-merge" in l or "ready-for-human" in l else []) + (["preview day"] if "preview" in l else [])
    r = {"issue": n, "kind": k, "ahead": len(ahead), "chain": len(ch), "per_hour": per_hour, "cycle": cyc, "waits": waits, "ts": None}
    if not per_hour and ahead: r["why"] = "no merges in the last 6 h"
    elif cyc is None: r["why"] = "no merged issue of this kind yet"
    else: r["ts"] = now + int((len(ahead) / per_hour if per_hour else 0) * H) + int((len(ch) + 1) * cyc)
    return r

def _hm(s): return f"{s / H:.1f} h"

def format_eta(r, now=None):
    now = time.time() if now is None else now
    n = f"#{r['issue']}"
    if r.get("why") == "closed": return f"{n}: already closed"
    if r.get("why") == "unknown issue": return f"{n}: unknown issue"
    basis = f"{r['ahead']} ahead, {r['per_hour']:.1f} merges/h, {r['chain']} blocker(s) open + itself x cycle " + (_hm(r["cycle"]) if r["cycle"] else "-")
    w = ("; separately (not counted): " + ", ".join(r["waits"])) if r["waits"] else ""
    if r["ts"] is None: return f"{n}: no data ({r.get('why')}) -> no time given [{basis}]{w}"
    d = "today" if time.strftime("%Y%m%d", time.localtime(r["ts"])) == time.strftime("%Y%m%d", time.localtime(now)) else time.strftime("%a %d %b", time.localtime(r["ts"]))
    return f"{n}: {d} ~{time.strftime('%H:%M', time.localtime(r['ts']))} ({basis}){w}"

def log_eta(r, now=None, path=LOG):
    if r.get("ts") is None: return
    try:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps({"at": now or time.time(), "issue": r["issue"], "eta": r["ts"], "ahead": r["ahead"], "chain": r["chain"]}) + "\n")
    except OSError: pass

def read_log(path=LOG):
    out = []
    try:
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            try: out.append(json.loads(line))
            except ValueError: pass
    except OSError: pass
    return out

def hit_miss(log, events, now=None):
    """-> (hit, miss, pending): merged by the ETA = hit; merged later = miss; not merged since = pending (a pending ETA already in the past counts as miss)."""
    m, now, h, x, p = merged_events(events), time.time() if now is None else now, 0, 0, 0
    for e in log:
        t = m.get(e["issue"])
        if t is not None and t >= e["at"]:
            if t <= e["eta"]: h += 1
            else: x += 1
        elif e["eta"] < now: x += 1
        else: p += 1
    return h, x, p

def summary_line(events=None, path=LOG):
    h, x, p = hit_miss(read_log(path), stats.read_events() if events is None else events)
    return f"ETA: {h} hit, {x} miss, {p} pending" if h + x + p else "ETA: none given"

def load_issues():
    """issue number -> {number, state, labels, body}; REST (GraphQL is off in cloud sessions), PRs left out."""
    try:
        out = subprocess.run(["gh", "api", "-X", "GET", f"repos/{repos.INFRA}/issues", "-f", "state=all", "-f", "per_page=100", "--paginate", "--jq",
                              '.[] | select(has("pull_request")|not) | {number, state, labels, body}'], capture_output=True, text=True, timeout=120, check=True).stdout
        return {i["number"]: i for i in map(json.loads, out.splitlines()) if i}
    except Exception: return {}

def main(argv):
    if "--check" in argv: print(summary_line()); return 0
    nums = [int(a.lstrip("#")) for a in argv if a.lstrip("#").isdigit()]
    if not nums: print(__doc__.splitlines()[0]); return 2
    issues, events, now = load_issues(), stats.read_events(), time.time()
    if not issues: print("cannot read the issues (gh)"); return 1
    for n in nums:
        r = eta(n, issues, events, now); print(format_eta(r, now)); log_eta(r, now)
    return 0

if __name__ == "__main__": sys.exit(main(sys.argv[1:]))
