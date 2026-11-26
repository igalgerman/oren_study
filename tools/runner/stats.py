"""Timing stats from .runs/stats.jsonl. `python stats.py` prints a short report."""
import json, os, sys, time
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

if __name__ == "__main__":
    print(report(read_events()))
