"""Owner dashboard (#142): open issues, progress, pipeline. On demand, always fresh.
Usage: python3 tools/runner/dashboard.py          write .runs/dashboard.html and open it in the browser
       python3 tools/runner/dashboard.py --text   the same numbers as plain text (for a terminal / the orchestrator)"""
import calendar, html, json, sys, time, webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import runner as R          # gh(), blockers(), CFG
import stats as S           # pipeline timings from stats.jsonl

OUT = R.RUNS / "dashboard.html"
STATES = [("running", "Running now"), ("needs_you", "Needs you"), ("blocked", "Blocked"),
          ("waiting", "Waiting in a chain"), ("ready", "Ready to start"), ("other", "Not triaged / other")]

def epoch(iso):
    try: return calendar.timegm(time.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S"))
    except (TypeError, ValueError): return None

def state_of(i, open_nums):
    l = set(i["labels"])
    if "in-progress" in l: return "running"
    if l & {"ready-for-human", "needs-triage", "needs-info"}: return "needs_you"
    if "blocked" in l: return "blocked"
    if any(b != i["number"] and b in open_nums for b in R.blockers(i.get("body"))): return "waiting"
    if "ready-for-agent" in l: return "ready"
    return "other"

def prio_of(i):
    return next((p for p in ("P0", "P1", "P2", "P3") if p in i["labels"]), "-")

def model(issues, prs, events, now):
    """Pure: everything the page and the text show. issues/prs as gh JSON (labels as names), events from stats.jsonl."""
    op = [i for i in issues if i["state"] == "OPEN"]
    open_nums = {i["number"] for i in op}
    closed_at = {i["number"]: epoch(i.get("closedAt")) for i in issues if i["state"] == "CLOSED"}
    rows = sorted(({"n": i["number"], "title": i["title"], "state": state_of(i, open_nums), "prio": prio_of(i),
                    "age_h": (now - (epoch(i.get("createdAt")) or now)) / 3600} for i in op),
                  key=lambda r: (r["prio"], r["n"]))
    by_state = {k: [r for r in rows if r["state"] == k] for k, _ in STATES}
    by_prio = {p: sum(r["prio"] == p for r in rows) for p in ("P0", "P1", "P2", "P3", "-")}
    within = lambda t, h: t is not None and t > now - h * 3600
    merged = [epoch(p.get("mergedAt")) for p in prs if p.get("mergedAt")]
    # local days (the PC runs on Israel time): from the first issue's day, at most the last 14
    first = min([epoch(i.get("createdAt")) or now for i in issues] + [now])
    ndays = max(1, min(14, int((now - first) // 86400) + 2))
    days = []
    for k in range(ndays - 1, -1, -1):
        lt = time.localtime(now - k * 86400)
        start = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1)); end = start + 86400
        created = [epoch(i.get("createdAt")) for i in issues]
        days.append({"day": time.strftime("%d %b", lt),
                     "opened": sum(1 for c in created if c and start <= c < end),
                     "closed": sum(1 for c in closed_at.values() if c and start <= c < end),
                     "open_end": sum(1 for i in issues if (epoch(i.get("createdAt")) or 0) < min(end, now)
                                     and not (closed_at.get(i["number"]) and closed_at[i["number"]] < min(end, now)))})
    t = S.compute(events, now)["totals"]
    dep = [e for e in events if e.get("event") == "deploy"]
    return {
        "now": now, "open": len(op), "by_state": by_state, "by_prio": by_prio, "rows": rows,
        "closed_24h": sum(within(c, 24) for c in closed_at.values()), "closed_7d": sum(within(c, 168) for c in closed_at.values()),
        "closed_total": len(closed_at),
        "merged_24h": sum(within(m, 24) for m in merged), "merged_7d": sum(within(m, 168) for m in merged),
        "open_prs": sum(1 for p in prs if p.get("state") == "OPEN"), "days": days,
        "avg_build": t["avg_build"], "avg_review": t["avg_review"], "avg_merge": t["avg_merge"],
        "last_deploy": max(dep, key=lambda e: e["ts"]) if dep else None,
    }

def hhmm(ts): return time.strftime("%H:%M", time.localtime(ts))

def text(m):
    s = m["by_state"]
    lines = [f"Open issues: {m['open']}  (P0 {m['by_prio']['P0']}, P1 {m['by_prio']['P1']}, P2 {m['by_prio']['P2']}, P3 {m['by_prio']['P3']}, no priority {m['by_prio']['-']})",
             "  " + " · ".join(f"{name.lower()} {len(s[k])}" for k, name in STATES),
             f"Closed: {m['closed_24h']} in 24h, {m['closed_7d']} in 7 days, {m['closed_total']} total",
             f"PRs merged: {m['merged_24h']} in 24h, {m['merged_7d']} in 7 days; open PRs {m['open_prs']}",
             f"Average: build {S.fmt(m['avg_build'])}, review {S.fmt(m['avg_review'])}, start to merge {S.fmt(m['avg_merge'])}"]
    d = m["last_deploy"]
    lines.append("Last deploy: " + (f"{hhmm(d['ts'])} {'ok' if d.get('ok') else 'FAILED'}" if d else "no record yet"))
    if s["needs_you"]: lines.append("Needs you: " + ", ".join(f"#{r['n']} {r['title'][:50]}" for r in s["needs_you"]))
    return "\n".join(lines)

def _bars(days):
    """Grouped bars: opened (slot 1) vs closed (slot 2) per day, inline SVG with hover titles."""
    W, H, top, bot, left = 680, 200, 14, 28, 34
    mx = max([1] + [max(d["opened"], d["closed"]) for d in days])
    step = (W - left) / len(days); bw = min(28, max(4, (step - 8) / 2))
    y = lambda v: top + (H - top - bot) * (1 - v / mx)
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Issues opened and closed per day">']
    for g in sorted({0, round(mx / 2), mx}):
        out.append(f'<line x1="{left}" x2="{W}" y1="{y(g):.1f}" y2="{y(g):.1f}" class="grid"/><text x="{left - 6}" y="{y(g) + 4:.1f}" class="ax" text-anchor="end">{g}</text>')
    for k, d in enumerate(days):
        x0 = left + k * step + (step - 2 * bw - 2) / 2
        for j, key in enumerate(("opened", "closed")):
            v = d[key]; x = x0 + j * (bw + 2); h = max(0, y(0) - y(v))
            out.append(f'<rect x="{x:.1f}" y="{y(v):.1f}" width="{bw:.1f}" height="{h:.1f}" rx="2" class="s{j + 1}"><title>{d["day"]}: {v} {key}</title></rect>')
        if len(days) <= 7 or k % 2 == (len(days) - 1) % 2:
            out.append(f'<text x="{x0 + bw:.1f}" y="{H - 8}" class="ax" text-anchor="middle">{d["day"]}</text>')
    return "".join(out) + "</svg>"

def _line(days):
    W, H, top, bot, left, right = 680, 170, 28, 28, 34, 40
    vs = [d["open_end"] for d in days]; mx = max([1] + vs)
    step = (W - left - right) / max(1, len(days) - 1)
    pt = lambda k, v: (left + 5 + k * step, top + (H - top - bot) * (1 - v / mx))
    path = " ".join(f"{'M' if k == 0 else 'L'}{pt(k, v)[0]:.1f},{pt(k, v)[1]:.1f}" for k, v in enumerate(vs))
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Open issues at the end of each day">']
    for g in sorted({0, round(mx / 2), mx}):
        yy = pt(0, g)[1]; out.append(f'<line x1="{left}" x2="{W}" y1="{yy:.1f}" y2="{yy:.1f}" class="grid"/><text x="{left - 6}" y="{yy + 4:.1f}" class="ax" text-anchor="end">{g}</text>')
    out.append(f'<path d="{path}" class="ln"/>')
    for k, (d, v) in enumerate(zip(days, vs)):
        x, yy = pt(k, v)
        out.append(f'<circle cx="{x:.1f}" cy="{yy:.1f}" r="10" class="hit"><title>{d["day"]}: {v} open</title></circle><circle cx="{x:.1f}" cy="{yy:.1f}" r="4" class="dot"/>')
        if len(days) <= 7 or k % 2 == (len(days) - 1) % 2:
            out.append(f'<text x="{x:.1f}" y="{H - 8}" class="ax" text-anchor="middle">{d["day"]}</text>')
    out.append(f'<text x="{x:.1f}" y="{yy - 12:.1f}" class="lab" text-anchor="end">{vs[-1]} open now</text>')
    return "".join(out) + "</svg>"

CSS = """
:root{--bg:#f4f5f7;--card:#fff;--fg:#191919;--sub:#666;--line:#e3e5e8;--s1:#257de0;--s2:#f47230;--bad:#dc3c3d}
@media(prefers-color-scheme:dark){:root{--bg:#111;--card:#191919;--fg:#efefef;--sub:#9c9c9c;--line:#333;--s1:#338ced;--s2:#e76624}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 "Segoe UI",Arial,sans-serif}
main{max-width:1000px;margin:0 auto;padding:18px}
h1{font-size:22px;margin:0 0 2px}h2{font-size:16px;margin:0 0 10px}.sub{color:var(--sub);font-size:13px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:14px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px}
.big{font-size:34px;font-weight:600;line-height:1.1}.tiles .card{margin:0}
.grid{stroke:var(--line);stroke-width:1}.ax{fill:var(--sub);font-size:13px}.lab{fill:var(--fg);font-size:14px;font-weight:600}
.s1{fill:var(--s1)}.s2{fill:var(--s2)}.ln{fill:none;stroke:var(--s1);stroke-width:2}.dot{fill:var(--s1);stroke:var(--card);stroke-width:2}.hit{fill:transparent}
rect:hover,.hit:hover+.dot{opacity:.75}
.legend{display:flex;gap:16px;font-size:13px;color:var(--sub);margin-bottom:6px}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:760px){.cols{grid-template-columns:1fr}}
table{width:100%;border-collapse:collapse;font-size:14px}td{padding:5px 6px;border-top:1px solid var(--line);vertical-align:top}
td.n{white-space:nowrap;width:1%}a{color:var(--s1);text-decoration:none}.pill{font-size:11px;border:1px solid var(--line);border-radius:6px;padding:0 5px;color:var(--sub)}
.p0{color:var(--bad);border-color:var(--bad);font-weight:600}
.count{color:var(--sub);font-weight:normal}.warn{color:var(--bad);font-weight:600}
"""

def page(m):
    e = html.escape; repo = R.CFG["repo"]; s = m["by_state"]
    tile = lambda big, label, sub="": f'<div class="card"><div class="big">{big}</div><div>{label}</div><div class="sub">{sub}</div></div>'
    p = m["by_prio"]
    d = m["last_deploy"]
    dep = (f"{hhmm(d['ts'])} " + ("ok" if d.get("ok") else '<span class="warn">FAILED</span>')) if d else "no record yet"
    tiles = "".join([
        tile(m["open"], "open issues", f"P0 {p['P0']} · P1 {p['P1']} · P2 {p['P2']} · P3 {p['P3']}"),
        tile(len(s["needs_you"]), "need you", "answer or decide"),
        tile(len(s["running"]), "running now", f"{len(s['ready'])} ready · {len(s['waiting'])} waiting · {len(s['blocked'])} blocked"),
        tile(m["closed_24h"], "closed in 24h", f"{m['closed_7d']} in 7 days · {m['closed_total']} total"),
        tile(m["merged_24h"], "PRs merged in 24h", f"{m['merged_7d']} in 7 days · {m['open_prs']} open"),
        tile(S.fmt(m["avg_merge"]), "avg start → merge", f"build {S.fmt(m['avg_build'])} · review {S.fmt(m['avg_review'])} · last deploy {dep}"),
    ])
    def table(key, name):
        rs = s[key]
        if not rs: return ""
        body = "".join(f'<tr><td class="n"><a href="https://github.com/{repo}/issues/{r["n"]}">#{r["n"]}</a></td>'
                       f'<td>{e(r["title"])}</td><td class="n"><span class="pill{" p0" if r["prio"] == "P0" else ""}">{r["prio"]}</span></td>'
                       f'<td class="n sub">{r["age_h"] / 24:.0f}d</td></tr>' for r in rs)
        return f'<div class="card"><h2>{name} <span class="count">{len(rs)}</span></h2><table>{body}</table></div>'
    lists = "".join(table(k, n) for k, n in STATES)
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>Oren game: status {hhmm(m["now"])}</title><style>{CSS}</style></head><body><main>'
            f'<h1>Oren game: work status</h1><div class="sub">Made {time.strftime("%d %b %H:%M", time.localtime(m["now"]))} (Israel time). For fresh numbers run tools\\dashboard.cmd again.</div>'
            f'<div class="tiles">{tiles}</div>'
            f'<div class="cols"><div class="card"><h2>Issues opened vs closed per day</h2>'
            f'<div class="legend"><span><i class="s1" style="background:var(--s1)"></i>opened</span><span><i style="background:var(--s2)"></i>closed</span></div>{_bars(m["days"])}</div>'
            f'<div class="card"><h2>Open issues at the end of each day</h2>{_line(m["days"])}</div></div>'
            f'{lists}</main></body></html>')

def fetch():
    rc, out = R.gh("issue", "list", "--state", "all", "--limit", "1000", "--json", "number,title,state,labels,createdAt,closedAt,body")
    rc2, out2 = R.gh("pr", "list", "--state", "all", "--limit", "500", "--json", "number,state,mergedAt")
    if rc or rc2: raise SystemExit("could not read GitHub (gh): " + (out if rc else out2)[:300])
    return [{**i, "labels": [l["name"] for l in i["labels"]]} for i in json.loads(out)], json.loads(out2)

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    issues, prs = fetch()
    m = model(issues, prs, S.read_events(), time.time())
    if "--text" in sys.argv: print(text(m)); return
    OUT.write_text(page(m), encoding="utf-8")
    print(text(m)); print(f"\npage: {OUT}")
    webbrowser.open(OUT.as_uri())

if __name__ == "__main__":
    main()
