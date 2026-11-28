"""Timing stats from .runs/stats.jsonl. `python stats.py` prints a short report."""
import calendar, json, os, sys, time
from pathlib import Path

LOG = Path(os.environ.get("RUNNER_RUNS") or Path(__file__).resolve().parent / ".runs") / "stats.jsonl"   # #229

def read_events(path=LOG):
    out = []
    try:
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            try: out.append(json.loads(line))
            except ValueError: pass
    except OSError: pass
    return out

def _avg(xs): return sum(xs) / len(xs) if xs else None

def compute(events, now=None):
    """Per issue (latest start): build, review, fix_rounds, merge seconds; plus totals."""
    now = time.time() if now is None else now
    per = {}
    for e in sorted(events, key=lambda e: e["ts"]):
        n = e["issue"]
        if e["event"] == "start": per[n] = {"issue": n, "start": e["ts"], "fix_rounds": 0}; continue
        p = per.get(n)
        if not p: continue
        ev, ts = e["event"], e["ts"]
        if ev == "worker_done" and "build" not in p: p["build"] = ts - p["start"]; p["_wd"] = ts
        elif ev == "review_pass" and "_wd" in p: p["review"] = ts - p["_wd"]
        elif ev == "review_fix": p["fix_rounds"] += 1
        elif ev == "merged": p["merge"] = ts - p["start"]; p["merged_at"] = ts
        elif ev in ("parked", "blocked"): p[ev] = p.get(ev, 0) + 1
    issues = []
    for p in per.values():
        issues.append({k: v for k, v in p.items() if not k.startswith("_")})
    merged = [p for p in issues if "merge" in p]
    totals = {
        "merged_24h": sum(1 for p in merged if p["merged_at"] > now - 86400),
        "merged_total": len(merged),
        "avg_merge": _avg([p["merge"] for p in merged]),
        "avg_build": _avg([p["build"] for p in issues if "build" in p]),
        "avg_review": _avg([p["review"] for p in issues if "review" in p]),
        "parked": sum(p.get("parked", 0) for p in issues),
        "blocked": sum(p.get("blocked", 0) for p in issues),
    }
    return {"issues": issues, "totals": totals}

def finish_rate(events, now=None):
    """#148: -> (finished, started) in the last 24 h: distinct issues the runner merged by itself / started (#851: events by auto/hand are not the runner's)."""
    now = time.time() if now is None else now
    ev = [e for e in events if e.get("ts", 0) > now - 86400]
    return (len({e["issue"] for e in ev if e.get("event") == "merged" and e.get("by", "runner") == "runner"}), len({e["issue"] for e in ev if e.get("event") == "start"}))

def fmt(s):
    if s is None: return "-"
    m = round(s / 60)
    return f"{m}m" if m < 90 else f"{s / 3600:.1f}h"

def report(events, now=None):
    r = compute(events, now); t = r["totals"]
    lines = [f"merged: {t['merged_24h']} in 24h, {t['merged_total']} total; parked {t['parked']}, blocked {t['blocked']}",
             f"avg time to merge {fmt(t['avg_merge'])}; avg build {fmt(t['avg_build'])}, review {fmt(t['avg_review'])}"]
    if r["issues"]:
        p = max(r["issues"], key=lambda p: p["start"])
        lines.append(f"last #{p['issue']}: build {fmt(p.get('build'))}, review {fmt(p.get('review'))}, "
                     f"fix rounds {p['fix_rounds']}, merge {fmt(p.get('merge'))}")
    return "\n".join(lines)

# ---------- #717: model x effort audit (deterministic, reads only stats.jsonl + issue labels) ----------
RANK = {"haiku": 0, "sonnet": 1, "opus": 2, "fable": 3}
EFFORT = {"low": 0, "medium": 1, "high": 2, "xhigh": 3, "max": 4}
HIGH = {"high", "xhigh", "max"}
SKIP_OVER = ("design", "ui", "kid", "security", "save", "sync")   # never OVER: design/kid UI, security/save/sync

def _effort(e): return e.get("effort") if e.get("effort") in EFFORT else "medium"   # no effort (before #713) = medium
def _model(e): return e.get("model") if e.get("model") in RANK else "sonnet"

def models_data(events, labels=None, now=None):
    """-> per issue (latest start): lane, model, effort, fix count, merged?, worker seconds, lines, files, upgraded.
    labels: issue number -> label names. The reviewer is not looked at (always Opus)."""
    per = {}
    for e in sorted(events, key=lambda e: e["ts"]):
        n, ev = e["issue"], e["event"]
        if ev == "start":
            old = per.get(n)
            m, f = _model(e), _effort(e)
            up = bool(old and (old["up"] or RANK[m] > RANK[old["model"]] or EFFORT[f] > EFFORT[old["effort"]]))
            per[n] = {"issue": n, "lane": e.get("lane") or "?", "model": m, "effort": f, "start": e["ts"], "fix": 0,
                      "merged": None, "work": None, "lines": None, "files": None, "up": up}
            continue
        p = per.get(n)
        if not p: continue
        if ev == "fix_done": p["fix"] += 1
        elif ev == "worker_done" and p["work"] is None: p["work"] = e["ts"] - p["start"]
        elif ev == "merged":
            p["merged"] = e["ts"]
            for k in ("lines", "files"):
                if isinstance(e.get(k), int): p[k] = e[k]
    out = []
    for p in per.values():
        L = [l.lower() for l in (labels or {}).get(p["issue"], [])]
        p["labels"] = L
        p["first"] = p["merged"] is not None and p["fix"] == 0 and not p["up"]
        p["under"] = p["fix"] >= 2 or p["up"]
        p["over"] = (p["merged"] is not None and p["fix"] == 0 and not p["up"] and (p["model"] == "opus" or p["effort"] in HIGH)
                     and p["lines"] is not None and p["lines"] <= 60 and p["files"] is not None and p["files"] <= 3
                     and not any(w in l.replace("-", " ").replace(":", " ").split() for l in L for w in SKIP_OVER))
        out.append(p)
    return out

def _median(xs):
    xs = sorted(xs); n = len(xs)
    return None if not n else xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2

def models_table(data):
    rows = {}
    for p in data: rows.setdefault((p["model"], p["effort"], p["lane"]), []).append(p)
    lines = ["model x effort x lane       issues  first-time  FIX/merged  median worker"]
    for k in sorted(rows, key=lambda k: (RANK[k[0]], EFFORT[k[1]], k[2])):
        r = rows[k]; mg = [p for p in r if p["merged"]]
        first = f"{100 * sum(p['first'] for p in mg) // len(mg)}%" if mg else "-"
        fpm = f"{sum(p['fix'] for p in mg) / len(mg):.1f}" if mg else "-"
        lines.append(f"{'/'.join(k):<27} {len(r):>6}  {first:>10}  {fpm:>10}  {fmt(_median([p['work'] for p in r if p['work'] is not None])):>13}")
    return "\n".join(lines if rows else ["no runs yet"])

def models_lists(data):
    """-> (UNDER issues, OVER issues)"""
    return [p for p in data if p["under"]], [p for p in data if p["over"]]

def hits_by_type(data, now=None, days=7):
    """lane -> UNDER+OVER hits in the last `days` (by merge/start time); 3+ = the inbox changes that row of docs/agents/models.md."""
    now = time.time() if now is None else now
    h = {}
    for p in data:
        if (p["merged"] or p["start"]) > now - days * 86400 and (p["under"] or p["over"]): h[p["lane"]] = h.get(p["lane"], 0) + 1
    return h

def models_line(data, now=None):
    """The one nightly `MODELS:` line."""
    u, o = models_lists(data)
    hot = sorted(l for l, c in hits_by_type(data, now).items() if c >= 3)
    return (f"MODELS: {len(data)} issues, UNDER {len(u)}, OVER {len(o)}"
            + (f"; 3+ hits this week in {', '.join(hot)}: change that row of docs/agents/models.md" if hot else "; no row to change"))

def models_report(events, labels=None, now=None):
    d = models_data(events, labels, now); u, o = models_lists(d)
    fmt_l = lambda ps: ", ".join(f"#{p['issue']} ({p['model']}/{p['effort']}, {p['lane']}, FIX {p['fix']}{', upgraded' if p['up'] else ''})" for p in ps) or "none"
    return "\n".join([models_table(d), f"UNDER: {fmt_l(u)}", f"OVER: {fmt_l(o)}", models_line(d, now)])

def issue_labels():
    """issue number -> label names from .runs/gh_cache.json (best effort; empty when unreadable)."""
    try:
        import ghcache
        c = ghcache.load() or {}
        return {i["number"]: [x["name"] for x in i.get("labels", [])] for i in c.get("open", []) + c.get("closed", [])}
    except Exception: return {}

# ---------- #851: every merged PR gets one `merged` event, also auto-merge and merges by hand ----------
import re
_CLOSES = re.compile(r"\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)", re.I)
RUNNER_SLACK = 6 * 3600     # a runner `merged` event without a PR number covers a PR of its issue merged within this time

def _epoch(iso):
    try: return int(calendar.timegm(time.strptime(iso, "%Y-%m-%dT%H:%M:%SZ")))
    except (TypeError, ValueError): return 0

def pr_issue(pr):
    """Pure: the issue a PR is for: `Closes/Fixes #n` in the body, else the branch lane/<n> or claude/github-issue-<n>-..., else the title's #n; 0 if unknown."""
    m = _CLOSES.search(pr.get("body") or "")
    if m: return int(m.group(1))
    m = re.match(r"(?:lane/|claude/github-issue-)(\d+)", pr.get("headRefName") or "")
    if m: return int(m.group(1))
    m = re.search(r"#(\d+)", pr.get("title") or "")
    return int(m.group(1)) if m else 0

def merge_events(prs, events, now=None, days=7):
    """Pure: the `merged` events still missing for the merged PRs of the last `days`: [{ts, issue, lane, event, pr, by, merged_at}].
    Recorded already = an event with this `pr`, or a runner event (no `pr`) of the same issue within RUNNER_SLACK of the merge.
    by: runner (the runner's own event covers it; never written again), auto (GitHub auto-merge was on), hand (anything else)."""
    now = time.time() if now is None else now
    have = {e["pr"] for e in events if e.get("event") == "merged" and "pr" in e}
    runner = [e for e in events if e.get("event") == "merged" and "pr" not in e]
    out = []
    for p in sorted(prs, key=lambda p: p.get("mergedAt") or ""):
        at = _epoch(p.get("mergedAt"))
        if not at or at < now - days * 86400 or p.get("number") in have: continue
        n = pr_issue(p)
        if any(e.get("issue") == n and abs(e.get("ts", 0) - at) <= RUNNER_SLACK for e in runner): continue
        lane = next((e.get("lane") for e in events if e.get("issue") == n and e.get("lane")), "")
        out.append({"ts": at, "issue": n, "lane": lane, "event": "merged", "pr": p["number"], "by": "auto" if p.get("autoMergeRequest") else "hand",
                    "merged_at": p["mergedAt"]})
        have.add(p["number"])
    return out

def record_merges(prs, now=None, days=7, path=LOG, dry=False):
    """Append the missing events to stats.jsonl (dry: only count); -> the list. Safe to call every minute."""
    new = merge_events(prs, read_events(path), now, days)
    if new and not dry:
        with open(path, "a", encoding="utf-8") as f:
            f.write("".join(json.dumps(e) + "\n" for e in new))
    return new

def merged_by(events, now=None, hours=24):
    """-> {by: distinct merged PRs/issues in the last `hours`}; an event without `by` is the runner's."""
    now = time.time() if now is None else now
    seen = {}
    for e in events:
        if e.get("event") == "merged" and e.get("ts", 0) > now - hours * 3600:
            seen[e.get("pr") or ("i", e.get("issue"), e.get("ts"))] = e.get("by", "runner")
    c = {}
    for b in seen.values(): c[b] = c.get(b, 0) + 1
    return c

def backfill(days=7, apply=False, run=None):
    """One time: `python3 stats.py --backfill [--apply]`. Without --apply it only prints how many events it would write (dry run)."""
    import subprocess
    run = run or (lambda: subprocess.run(["gh", "pr", "list", "--repo", "igalgerman/oren_study", "--state", "merged", "--limit", "300",
                  "--json", "number,title,body,headRefName,mergedAt,autoMergeRequest"], capture_output=True, text=True, timeout=120).stdout)
    new = record_merges(json.loads(run() or "[]"), days=days, dry=not apply)
    return f"backfill {days} days: {len(new)} merged events {'written' if apply else 'would be written (dry run; add --apply)'}"

if __name__ == "__main__":
    if "--backfill" in sys.argv: print(backfill(apply="--apply" in sys.argv))
    else: print(models_report(read_events(), issue_labels()) if "--models" in sys.argv else report(read_events()))
