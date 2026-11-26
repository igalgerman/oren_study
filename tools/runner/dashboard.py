"""Owner dashboard (#142, v2 #169): open issues, forecast, how the work really gets done. On demand, always fresh.
Usage: python3 tools/runner/dashboard.py          write .runs/dashboard.html and open it in the browser
       python3 tools/runner/dashboard.py --text   the same numbers as plain text (for a terminal / the orchestrator)
Every number is measured from GitHub (issues, PRs) or the runner's own records (.runs/stats.jsonl, runner.log);
estimates are marked with ≈ and show a range and what they are based on."""
import calendar, html, json, re, shutil, subprocess, sys, time, webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import runner as R          # gh(), blockers(), CFG
import stats as S           # pipeline timings from stats.jsonl
import trends as T          # stuck reasons from runner.log

OUT = R.RUNS / "dashboard.html"
STATES = [("running", "Running now"), ("needs_you", "Needs you"), ("blocked", "Blocked"),
          ("waiting", "Waiting for another issue"), ("ready", "Ready to start"), ("other", "Not triaged / other")]
STEP = {"start": "building", "worker_done": "in review", "review_fix": "fixing review notes", "fix_done": "in review",
        "review_pass": "merging (CI)", "resolve": "resolving a conflict", "merged": "deploying"}

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

def dur(sec):
    if sec is None: return "-"
    m = sec / 60
    return f"{m:.0f} min" if m < 90 else (f"{m / 60:.1f} h" if m < 48 * 60 else f"{m / 1440:.1f} days")

def forecast(open_n, closed_ts, opened_ts, now, history_h):
    """Pure: how long until `open_n` issues are done, as a range from the measured rates (per hour) over 6 h and 24 h.
    Net rate = closed minus newly opened. -> rates, 'net' [fast, slow] hours (None = not shrinking), 'gross' = if nothing new came in."""
    def rate(ts, h): return sum(1 for t in ts if t and t > now - h * 3600) / min(h, max(history_h, 1))
    c6, c24, o6, o24 = rate(closed_ts, 6), rate(closed_ts, 24), rate(opened_ts, 6), rate(opened_ts, 24)
    nets = [x for x in (c6 - o6, c24 - o24) if x > 0]
    gross = [x for x in (c6, c24) if x > 0]
    return {"c6": c6, "c24": c24, "o6": o6, "o24": o24,
            "net": [open_n / x for x in sorted(nets, reverse=True)] if nets else None,
            "gross": [open_n / x for x in sorted(gross, reverse=True)] if gross else None}

def model(issues, prs, events, now, log_text=""):
    """Pure: everything the page and the text show. issues/prs as gh JSON (labels as names), events from stats.jsonl."""
    op = [i for i in issues if i["state"] == "OPEN"]
    open_nums = {i["number"] for i in op}
    closed_at = {i["number"]: epoch(i.get("closedAt")) for i in issues if i["state"] == "CLOSED"}
    created = {i["number"]: epoch(i.get("createdAt")) for i in issues}
    rows = sorted(({"n": i["number"], "title": i["title"], "state": state_of(i, open_nums), "prio": prio_of(i),
                    "age_h": (now - (created[i["number"]] or now)) / 3600,
                    "blockers": [b for b in R.blockers(i.get("body")) if b in open_nums and b != i["number"]]} for i in op),
                  key=lambda r: (r["prio"], r["n"]))
    by_state = {k: [r for r in rows if r["state"] == k] for k, _ in STATES}
    by_prio = {p: sum(r["prio"] == p for r in rows) for p in ("P0", "P1", "P2", "P3", "-")}
    within = lambda t, h: t is not None and t > now - h * 3600
    merged = [epoch(p.get("mergedAt")) for p in prs if p.get("mergedAt")]
    first = min([c for c in created.values() if c] + [now])
    history_h = (now - first) / 3600
    # local days (the PC runs on Israel time): from the first issue's day, at most the last 14
    ndays = max(1, min(14, int((now - first) // 86400) + 2))
    days = []
    for k in range(ndays - 1, -1, -1):
        lt = time.localtime(now - k * 86400)
        start = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1)); end = min(start + 86400, now)
        days.append({"label": time.strftime("%d %b", lt),
                     "opened": sum(1 for c in created.values() if c and start <= c < end),
                     "closed": sum(1 for c in closed_at.values() if c and start <= c < end),
                     "open_end": sum(1 for n, c in created.items() if (c or 0) < end and not (closed_at.get(n) and closed_at[n] < end))})
    hours = []
    for k in range(23, -1, -1):
        h0 = (now // 3600 - k) * 3600
        hours.append({"label": time.strftime("%H", time.localtime(h0)),
                      "opened": sum(1 for c in created.values() if c and h0 <= c < h0 + 3600),
                      "closed": sum(1 for c in closed_at.values() if c and h0 <= c < h0 + 3600),
                      "open_end": sum(1 for n, c in created.items() if (c or 0) < min(h0 + 3600, now) and not (closed_at.get(n) and closed_at[n] < min(h0 + 3600, now)))})
    # how the work really gets done (24 h, the runner's own records)
    ev24 = [e for e in events if e.get("ts", 0) > now - 86400]
    started = {e["issue"] for e in ev24 if e.get("event") == "start"}
    by_runner = {e["issue"] for e in ev24 if e.get("event") == "merged"}
    fixes = sum(e.get("event") == "review_fix" for e in ev24); passes = sum(e.get("event") == "review_pass" for e in ev24)
    deploys = [e for e in events if e.get("event") == "deploy"]
    stuck = {}
    for n, k in T.blocked_lines(log_text, now - 86400):
        if n not in stuck.setdefault(k, []): stuck[k].append(n)
    # running now: step from the last runner event of the current run
    last = {}
    for e in sorted(events, key=lambda e: e.get("ts", 0)):
        n = e.get("issue")
        if e.get("event") == "start": last[n] = {"start": e["ts"], "event": "start"}
        elif n in last and e.get("event") in STEP: last[n]["event"] = e["event"]
    running = [{**r, "step": STEP.get(last.get(r["n"], {}).get("event"), "started by hand"),
                "for_s": now - last[r["n"]]["start"] if r["n"] in last else None} for r in by_state["running"]]
    recent = sorted(((closed_at[i["number"]], i) for i in issues if i["state"] == "CLOSED" and closed_at.get(i["number"])),
                    key=lambda x: -x[0])[:10]
    t = S.compute(events, now)["totals"]
    p0_closed = [closed_at[i["number"]] for i in issues if i["state"] == "CLOSED" and "P0" in i["labels"]]
    fc = forecast(len(op), list(closed_at.values()), list(created.values()), now, history_h)
    return {
        "plan": eta_plan(rows, running, t, fc, now),
        "now": now, "open": len(op), "by_state": by_state, "by_prio": by_prio, "rows": rows, "running": running,
        "closed_24h": sum(within(c, 24) for c in closed_at.values()), "closed_7d": sum(within(c, 168) for c in closed_at.values()),
        "closed_total": len(closed_at), "opened_24h": sum(within(c, 24) for c in created.values()),
        "merged_24h": sum(within(m, 24) for m in merged), "merged_7d": sum(within(m, 168) for m in merged),
        "open_prs": sum(1 for p in prs if p.get("state") == "OPEN"), "days": days, "hours": hours, "history_h": history_h,
        "avg_build": t["avg_build"], "avg_review": t["avg_review"], "avg_merge": t["avg_merge"],
        "last_deploy": max(deploys, key=lambda e: e["ts"]) if deploys else None,
        "fc": fc,
        "fc_p0": forecast(by_prio["P0"], p0_closed, [], now, history_h) if by_prio["P0"] else None, "p0_open": by_prio["P0"],
        "truth": {"started": len(started), "by_runner": len(by_runner), "fixes": fixes, "passes": passes,
                  "deploys_ok": sum(1 for d in deploys if d["ts"] > now - 86400 and d.get("ok")),
                  "deploys_fail": sum(1 for d in deploys if d["ts"] > now - 86400 and d.get("ok") is False),
                  "stuck": sorted(stuck.items(), key=lambda x: -len(x[1]))[:6]},
        "recent": [{"n": i["number"], "title": i["title"], "at": c, "open_s": c - (created[i["number"]] or c)} for c, i in recent],
    }

def eta_plan(rows, running, t, fc, now, lanes=None):
    """Pure estimate (#173): when each open issue should be merged -> {n: (earliest, latest) epoch, or a reason string}.
    Running: time left for its current step (runner averages; latest = 1.5x). Queue = ready issues, then waiting ones,
    in priority order; a waiting issue goes after its blockers (their merge + one full cycle). Queue position k ->
    k / close rate, earliest with the faster rate (6 h or 24 h), latest with the slower. Needs you / blocked / not triaged: no estimate."""
    b, rv, mg = t.get("avg_build") or 1200, t.get("avg_review") or 300, t.get("avg_merge") or 3600
    wait = max(300, mg - b - rv)
    left = {"in review": rv + wait, "fixing review notes": b / 2 + rv + wait, "merging (CI)": wait / 2,
            "resolving a conflict": 900 + wait / 2, "deploying": 300}
    out = {}
    for r in running:
        sec = max(600, b - (r["for_s"] or 0)) + rv + wait if r["step"] == "building" else left.get(r["step"], mg / 2)
        out[r["n"]] = (now + sec, now + sec * 1.5)
    for r in rows:
        if r["state"] in ("needs_you", "blocked", "other"):
            out[r["n"]] = {"needs_you": "waits for you", "blocked": "blocked", "other": "not triaged"}[r["state"]]
    fast, slow = max(fc["c6"], fc["c24"]), min(fc["c6"], fc["c24"]) or max(fc["c6"], fc["c24"])
    lanes = lanes or int(R.CFG.get("max_parallel", 3))
    busy = [v[0] - now for v in out.values() if isinstance(v, tuple)]
    free0 = min(busy) if busy and len(running) >= lanes else 0          # all lanes busy: the first one frees when its issue merges
    queue = [r for r in rows if r["state"] in ("ready", "waiting")]         # rows are in priority order, as the runner picks
    k = 0
    while queue:
        pending = {q["n"] for q in queue}
        r = next((q for q in queue if not any(x in pending for x in q.get("blockers", []))), None)   # first whose blockers are placed
        if r is None: break
        queue.remove(r)
        bl = r.get("blockers", [])
        hard = [x for x in bl if isinstance(out.get(x), str) or x not in out]
        if hard: out[r["n"]] = "after #" + ", #".join(map(str, hard)); continue
        if fast <= 0: out[r["n"]] = "no speed measured yet"; continue
        k += 1
        rnd = -(-k // lanes)                                                 # lane round of the k-th queued issue
        lo = now + max(k / fast * 3600, free0 + rnd * mg)                    # not started: its lane frees, then full cycles
        hi = now + max(k / slow * 3600, free0 + rnd * mg * 1.5)
        for x in bl:
            lo, hi = max(lo, out[x][0] + mg), max(hi, out[x][1] + mg * 1.5)
        out[r["n"]] = (lo, hi)
    for r in queue: out.setdefault(r["n"], "circular Blocked-by")
    return out

def eta_str(v, now):
    """(lo, hi) -> '10:40 – 11:30' today, else with the day; a reason string stays as it is."""
    if not isinstance(v, tuple): return v or "-"
    r10 = lambda x: x - x % 600 + (600 if x % 600 else 0)
    lo, hi = r10(v[0]), r10(v[1])
    f = lambda x: time.strftime("%H:%M" if time.strftime("%d", time.localtime(x)) == time.strftime("%d", time.localtime(now)) else "%a %H:%M", time.localtime(x))
    return f(lo) if hi - lo < 900 else f"{f(lo)} – {f(hi)}"

def bottom_line(m):
    """-> list of (label, eta text) for the P0s and the whole estimated queue."""
    plan, rows, now = m["plan"], m["rows"], m["now"]
    def last(rs):
        ts = [plan[r["n"]] for r in rs if isinstance(plan.get(r["n"]), tuple)]
        return (max(x[0] for x in ts), max(x[1] for x in ts)) if ts else None, len(rs) - len(ts)
    p0, p0_none = last([r for r in rows if r["prio"] == "P0"])
    allq, all_none = last(rows)
    out = []
    if p0: out.append((f"all {sum(r['prio'] == 'P0' for r in rows)} P0", eta_str(p0, now) + (f" ({p0_none} without an estimate)" if p0_none else "")))
    if allq: out.append(("everything open now", eta_str(allq, now) + (f" ({all_none} without an estimate: wait for you, blocked or not triaged)" if all_none else "")))
    return out

def hhmm(ts): return time.strftime("%H:%M", time.localtime(ts))
def when(now, hours): return time.strftime("%a %d %b %H:%M", time.localtime(now + hours * 3600))
def pct(a, b): return f"{100 * a / b:.0f}%" if b else "-"

def fc_text(fc, now, what):
    if not fc: return f"{what}: nothing open"
    if fc["net"]:
        a, b = fc["net"][0], fc["net"][-1]; rng = len(fc["net"]) > 1 and b - a > 0.5
        return f"{what}: ≈ {dur(a * 3600)}" + (f" to {dur(b * 3600)}" if rng else "") + f" (around {when(now, a)}" + (f" – {when(now, b)}" if rng else "") + ")"
    if fc["gross"]:
        return f"{what}: not shrinking (new issues arrive as fast as old ones close); with no new issues ≈ {dur(fc['gross'][0] * 3600)}"
    return f"{what}: no closed issues yet to measure"

def text(m):
    s, tr, fc = m["by_state"], m["truth"], m["fc"]
    lines = [f"Open issues: {m['open']}  (P0 {m['by_prio']['P0']}, P1 {m['by_prio']['P1']}, P2 {m['by_prio']['P2']}, P3 {m['by_prio']['P3']}, no priority {m['by_prio']['-']})",
             "  " + " · ".join(f"{name.lower()} {len(s[k])}" for k, name in STATES),
             f"Last 24 h: closed {m['closed_24h']}, new {m['opened_24h']}; PRs merged {m['merged_24h']} ({m['merged_7d']} in 7 days); open PRs {m['open_prs']}",
             f"Speed: closing {fc['c6']:.1f}/h (last 6 h), {fc['c24']:.1f}/h (24 h); new issues {fc['o6']:.1f}/h, {fc['o24']:.1f}/h",
             f"Forecast (estimate, {m['history_h']:.0f} h of history): " + fc_text(fc, m["now"], "all open issues"),
             "  " + (fc_text(m["fc_p0"], m["now"], f"the {m['p0_open']} open P0") if m["fc_p0"] else "no open P0"),
             f"Runner (24 h): started {tr['started']}, finished by itself {tr['by_runner']} ({pct(tr['by_runner'], tr['started'])}); "
             f"PRs not finished by the runner (by hand, or it crashed after merging) ≈ {max(0, m['merged_24h'] - tr['by_runner'])}; reviews sent back {tr['fixes']} of {tr['fixes'] + tr['passes']}",
             f"Average: build {S.fmt(m['avg_build'])}, review {S.fmt(m['avg_review'])}, start to merge {S.fmt(m['avg_merge'])}"]
    d = m["last_deploy"]
    lines.append("Last deploy: " + (f"{hhmm(d['ts'])} {'ok' if d.get('ok') else 'FAILED'}" if d else "no record yet") + f" · runner deploys 24 h: {tr['deploys_ok']} ok, {tr['deploys_fail']} failed")
    if tr["stuck"]: lines.append("Top stuck reasons (24 h): " + "; ".join(f"{k} ({len(v)})" for k, v in tr["stuck"][:3]))
    if m["running"]: lines.append("Running: " + "; ".join(f"#{r['n']} {r['step']} {dur(r['for_s'])}" for r in m["running"]))
    lines.append("Bottom line (estimate): " + "; ".join(f"{a} merged by {b}" for a, b in bottom_line(m)))
    nxt = sorted(((v, n) for n, v in m["plan"].items() if isinstance(v, tuple)))[:8]
    title = {r["n"]: r["title"] for r in m["rows"]}
    if nxt: lines.append("Next merges (estimate): " + "; ".join(f"#{n} {title.get(n, '')[:35]} ≈ {eta_str(v, m['now'])}" for v, n in nxt))
    if s["needs_you"]: lines.append("Needs you: " + ", ".join(f"#{r['n']} {r['title'][:50]}" for r in s["needs_you"]))
    return "\n".join(lines)

def _bars(rows, aria, every=1):
    """Grouped bars: opened (slot 1) vs closed (slot 2) per row, inline SVG with hover titles."""
    W, H, top, bot, left = 680, 200, 14, 28, 34
    mx = max([1] + [max(d["opened"], d["closed"]) for d in rows])
    step = (W - left) / len(rows); bw = min(28, max(3, (step - 6) / 2))
    y = lambda v: top + (H - top - bot) * (1 - v / mx)
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{aria}">']
    for g in sorted({0, round(mx / 2), mx}):
        out.append(f'<line x1="{left}" x2="{W}" y1="{y(g):.1f}" y2="{y(g):.1f}" class="grid"/><text x="{left - 6}" y="{y(g) + 4:.1f}" class="ax" text-anchor="end">{g}</text>')
    for k, d in enumerate(rows):
        x0 = left + k * step + (step - 2 * bw - 2) / 2
        for j, key in enumerate(("opened", "closed")):
            v = d[key]; x = x0 + j * (bw + 2); h = max(0, y(0) - y(v))
            out.append(f'<rect x="{x:.1f}" y="{y(v):.1f}" width="{bw:.1f}" height="{h:.1f}" rx="2" class="s{j + 1}"><title>{d["label"]}: {v} {key}</title></rect>')
        if (len(rows) - 1 - k) % every == 0:
            out.append(f'<text x="{x0 + bw:.1f}" y="{H - 8}" class="ax" text-anchor="middle">{d["label"]}</text>')
    return "".join(out) + "</svg>"

def _line(days, aria="Open issues at the end of each day", every=2):
    W, H, top, bot, left, right = 680, 170, 28, 28, 34, 40
    vs = [d["open_end"] for d in days]; mx = max([1] + vs)
    step = (W - left - right) / max(1, len(days) - 1)
    pt = lambda k, v: (left + 5 + k * step, top + (H - top - bot) * (1 - v / mx))
    path = " ".join(f"{'M' if k == 0 else 'L'}{pt(k, v)[0]:.1f},{pt(k, v)[1]:.1f}" for k, v in enumerate(vs))
    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{aria}">']
    for g in sorted({0, round(mx / 2), mx}):
        yy = pt(0, g)[1]; out.append(f'<line x1="{left}" x2="{W}" y1="{yy:.1f}" y2="{yy:.1f}" class="grid"/><text x="{left - 6}" y="{yy + 4:.1f}" class="ax" text-anchor="end">{g}</text>')
    out.append(f'<path d="{path}" class="ln"/>')
    for k, (d, v) in enumerate(zip(days, vs)):
        x, yy = pt(k, v)
        out.append(f'<circle cx="{x:.1f}" cy="{yy:.1f}" r="10" class="hit"><title>{d["label"]}: {v} open</title></circle><circle cx="{x:.1f}" cy="{yy:.1f}" r="4" class="dot"/>')
        if len(days) <= 7 or (len(days) - 1 - k) % every == 0:
            out.append(f'<text x="{x:.1f}" y="{H - 8}" class="ax" text-anchor="middle">{d["label"]}</text>')
    out.append(f'<text x="{x:.1f}" y="{yy - 12:.1f}" class="lab" text-anchor="end">{vs[-1]} open now</text>')
    return "".join(out) + "</svg>"

CSS = """
:root{--bg:#f4f5f7;--card:#fff;--fg:#191919;--sub:#666;--line:#e3e5e8;--s1:#257de0;--s2:#f47230;--bad:#dc3c3d;--est:#fff7e0}
@media(prefers-color-scheme:dark){:root{--bg:#111;--card:#191919;--fg:#efefef;--sub:#9c9c9c;--line:#333;--s1:#338ced;--s2:#e76624;--est:#2a2416}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 "Segoe UI",Arial,sans-serif}
main{max-width:1040px;margin:0 auto;padding:18px}
h1{font-size:22px;margin:0 0 2px}h2{font-size:16px;margin:0 0 10px}.sub{color:var(--sub);font-size:13px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:14px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px}
.big{font-size:34px;font-weight:600;line-height:1.1}.mid{font-size:20px;font-weight:600}.tiles .card{margin:0}
.est{background:var(--est)}.tag{font-size:11px;font-weight:600;border:1px solid var(--sub);border-radius:6px;padding:0 5px;color:var(--sub);margin-left:6px;vertical-align:2px}
.warnbg{border-color:var(--bad)}
.grid{stroke:var(--line);stroke-width:1}.ax{fill:var(--sub);font-size:13px}.lab{fill:var(--fg);font-size:14px;font-weight:600}
.s1{fill:var(--s1)}.s2{fill:var(--s2)}.ln{fill:none;stroke:var(--s1);stroke-width:2}.dot{fill:var(--s1);stroke:var(--card);stroke-width:2}.hit{fill:transparent}
rect:hover,.hit:hover+.dot{opacity:.75}
.legend{display:flex;gap:16px;font-size:13px;color:var(--sub);margin-bottom:6px}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:760px){.cols{grid-template-columns:1fr}}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:5px 6px;border-top:1px solid var(--line);vertical-align:top;text-align:left}th{color:var(--sub);font-weight:normal;font-size:13px}
td.n{white-space:nowrap;width:1%}a{color:var(--s1);text-decoration:none}.pill{font-size:11px;border:1px solid var(--line);border-radius:6px;padding:0 5px;color:var(--sub)}
.p0{color:var(--bad);border-color:var(--bad);font-weight:600}.count{color:var(--sub);font-weight:normal}.warn{color:var(--bad);font-weight:600}.good{color:#0aac23;font-weight:600}
ul.facts{margin:0;padding-left:18px}ul.facts li{margin:3px 0}details summary{cursor:pointer}
"""

def page(m):
    e = html.escape; repo = R.CFG["repo"]; s = m["by_state"]; p = m["by_prio"]; tr = m["truth"]; fc = m["fc"]; now = m["now"]
    link = lambda n: f'<a href="https://github.com/{repo}/issues/{n}">#{n}</a>'
    tile = lambda big, label, sub="", cls="": f'<div class="card {cls}"><div class="big">{big}</div><div>{label}</div><div class="sub">{sub}</div></div>'
    d = m["last_deploy"]
    dep = (f"{hhmm(d['ts'])} " + ("ok" if d.get("ok") else '<span class="warn">FAILED</span>')) if d else "no record yet"
    fin = tr["by_runner"] / tr["started"] if tr["started"] else None
    tiles = "".join([
        tile(m["open"], "open issues", f"P0 {p['P0']} · P1 {p['P1']} · P2 {p['P2']} · P3 {p['P3']}" + (f" · <span class='warn'>{p['-']} without priority</span>" if p['-'] else "")),
        tile(len(s["needs_you"]), "need you", "answer or decide" if s["needs_you"] else "nothing waits for you"),
        tile(len(s["running"]), "running now", f"{len(s['ready'])} ready · {len(s['waiting'])} waiting · {len(s['blocked'])} blocked"),
        tile(m["closed_24h"], "closed in 24 h", f"{m['opened_24h']} new in 24 h · {m['closed_total']} closed in total"),
        tile(m["merged_24h"], "PRs merged in 24 h", f"{m['open_prs']} PRs open · last deploy {dep}"),
        tile(pct(tr["by_runner"], tr["started"]), "finished by the runner itself",
             f"{tr['by_runner']} of {tr['started']} it started in 24 h; the rest needed a human", "" if fin is None or fin >= 0.5 else "warnbg"),
    ])
    def fc_block(f, what):
        if not f: return f"<div class='mid'>{what}: nothing open</div>"
        if f["net"]:
            a, b = f["net"][0], f["net"][-1]; rng = len(f["net"]) > 1 and b - a > 0.5
            return (f"<div class='mid'>{what}: ≈ {dur(a * 3600)}" + (f" – {dur(b * 3600)}" if rng else "") + "</div>"
                    f"<div class='sub'>around {when(now, a)}" + (f" to {when(now, b)}" if rng else "") + "</div>")
        if f["gross"]:
            return (f"<div class='mid'>{what}: <span class='warn'>not shrinking</span></div><div class='sub'>new issues arrive as fast as old ones close. "
                    f"If nothing new came in: ≈ {dur(f['gross'][0] * 3600)}</div>")
        return f"<div class='mid'>{what}: not enough data yet</div>"
    p0 = fc_block(m["fc_p0"], f"The {m['p0_open']} open P0") if m["fc_p0"] else "<div class='mid'>No open P0</div>"
    fcard = (f'<div class="card est"><h2>Forecast <span class="tag">ESTIMATE</span></h2><div class="cols">'
             f'<div>{fc_block(fc, "All " + str(m["open"]) + " open issues")}</div><div>{p0}</div></div>'
             f'<ul class="facts sub" style="margin-top:8px"><li>Measured speed: closing <b>{fc["c6"]:.1f}/h</b> in the last 6 h and <b>{fc["c24"]:.1f}/h</b> over 24 h; '
             f'new issues {fc["o6"]:.1f}/h and {fc["o24"]:.1f}/h. The range is the faster and the slower of the two.</li>'
             f'<li>Based on only {m["history_h"]:.0f} h of history. P0 work is bigger than average (new systems), so the P0 line is optimistic.</li>'
             f'<li>Assumes today\'s lanes. Remote lanes (#133) and faster merges (#166) should shorten it; a new batch of issues makes it longer.</li></ul></div>')
    stuck = "".join(f"<tr><td>{e(k)}</td><td class='n'>{len(v)} issues</td><td class='sub'>{' '.join('#' + str(x) for x in v[:6])}</td></tr>" for k, v in tr["stuck"])
    truth = (f'<div class="card"><h2>How the work really gets done (last 24 h)</h2><ul class="facts">'
             f'<li>The runner started <b>{tr["started"]}</b> issues and finished <b>{tr["by_runner"]}</b> by itself ({pct(tr["by_runner"], tr["started"])}). '
             f'{m["merged_24h"]} PRs merged in total, so about <b>{max(0, m["merged_24h"] - tr["by_runner"])}</b> were not finished by the runner: merged by hand (orchestrator), or the runner crashed right after merging and never recorded it.</li>'
             f'<li>Reviews: {tr["passes"]} passed, <b>{tr["fixes"]}</b> sent back for fixes ({pct(tr["fixes"], tr["fixes"] + tr["passes"])}).</li>'
             f'<li>Runner deploys: {tr["deploys_ok"]} ok, {tr["deploys_fail"]} failed (hand deploys are not recorded).</li>'
             f'<li>Average times (runner records): build {S.fmt(m["avg_build"])}, review {S.fmt(m["avg_review"])}, start to merge {S.fmt(m["avg_merge"])}.</li></ul>'
             + (f'<h2 style="margin-top:12px">Why issues got stuck (distinct issues, 24 h)</h2><table>{stuck}</table>' if stuck else "") + '</div>')
    plan = m["plan"]
    run_rows = "".join(f'<tr><td class="n">{link(r["n"])}</td><td>{e(r["title"])}</td><td class="n">{r["step"]}</td><td class="n sub">{dur(r["for_s"])}</td>'
                       f'<td class="n">{eta_str(plan.get(r["n"]), now)}</td></tr>' for r in m["running"])
    running = (f'<div class="card"><h2>Running now <span class="count">{len(m["running"])}</span></h2><table><tr><th>#</th><th>issue</th><th>step</th>'
               f'<th>running for</th><th>merge ≈</th></tr>{run_rows}</table></div>') if run_rows else ""
    est = sorted(((v, r) for r in m["rows"] for v in [plan.get(r["n"])] if isinstance(v, tuple)), key=lambda x: x[0])
    tl_row = lambda v, r: (f'<tr><td class="n"><b>{eta_str(v, now)}</b></td><td class="n">{link(r["n"])}</td><td>{e(r["title"])}</td>'
                           f'<td class="n"><span class="pill{" p0" if r["prio"] == "P0" else ""}">{r["prio"]}</span></td>'
                           f'<td class="n sub">{next((x["step"] for x in m["running"] if x["n"] == r["n"]), dict(STATES).get(r["state"], r["state"]).lower())}</td></tr>')
    head = '<tr><th>merge ≈</th><th>#</th><th>issue</th><th>prio</th><th>now</th></tr>'
    bl = "".join(f"<div class='mid'>{e(a)}: ≈ {e(b)}</div>" for a, b in bottom_line(m))
    timeline = (f'<div class="card est"><h2>Timeline: when each issue should be merged <span class="tag">ESTIMATE</span></h2>{bl}'
                f'<table style="margin-top:8px">{head}{"".join(tl_row(v, r) for v, r in est[:20])}</table>'
                + (f'<details><summary class="sub">{len(est) - 20} more</summary><table>{head}{"".join(tl_row(v, r) for v, r in est[20:])}</table></details>' if len(est) > 20 else "")
                + '<ul class="facts sub" style="margin-top:8px"><li>Running issues: the time left for their current step, from the runner\'s average step times (the later time = 1.5x).</li>'
                f'<li>Queued issues: their place in line (by priority, as the runner picks; an issue that waits for another one is placed after it) divided by the measured close speed ({fc["c6"]:.1f}/h in 6 h, {fc["c24"]:.1f}/h in 24 h), never sooner than its lane frees plus one full measured cycle ({S.fmt(m["avg_merge"])}) per round of {R.CFG.get("max_parallel", 3)} lanes; '
                'an issue that waits for another one comes after it, plus one full cycle.</li>'
                '<li>No estimate for issues that wait for you, are blocked or not triaged: they depend on a person. New issues with a higher priority push the queue back.</li></ul></div>')
    rec_rows = "".join(f'<tr><td class="n">{link(r["n"])}</td><td>{e(r["title"])}</td><td class="n sub">{hhmm(r["at"])}</td><td class="n sub">{dur(r["open_s"])}</td></tr>' for r in m["recent"])
    recent = f'<div class="card"><h2>Recently finished</h2><table><tr><th>#</th><th>issue</th><th>closed</th><th>was open</th></tr>{rec_rows}</table></div>' if rec_rows else ""
    def table(key, name):
        rs = s[key]
        if not rs or key == "running": return ""
        body = "".join(f'<tr><td class="n">{link(r["n"])}</td><td>{e(r["title"])}</td><td class="n"><span class="pill{" p0" if r["prio"] == "P0" else ""}">{r["prio"]}</span></td>'
                       f'<td class="n sub">{dur(r["age_h"] * 3600)}</td><td class="n">{eta_str(plan.get(r["n"]), now)}</td></tr>' for r in rs)
        return (f'<details class="card" {"open" if key in ("needs_you", "blocked", "ready") else ""}><summary><b>{name}</b> <span class="count">{len(rs)}</span></summary>'
                f'<table><tr><th>#</th><th>issue</th><th>prio</th><th>open for</th><th>merge ≈</th></tr>{body}</table></details>')
    lists = "".join(table(k, n) for k, n in STATES)
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>Oren game: status {hhmm(now)}</title><style>{CSS}</style></head><body><main>'
            f'<h1>Oren game: work status</h1><div class="sub">Made {time.strftime("%d %b %H:%M", time.localtime(now))} (Israel time). '
            f'Sources: GitHub issues and PRs (live), the runner\'s records (.runs/stats.jsonl, runner.log). Estimates are marked. '
            f'For fresh numbers run tools\\dashboard.cmd again.</div>'
            f'<div class="tiles">{tiles}</div>{_ai_card(m)}{timeline}{running}{fcard}'
            f'<div class="cols"><div class="card"><h2>Opened vs closed, per hour (last 24 h)</h2>'
            f'<div class="legend"><span><i style="background:var(--s1)"></i>opened</span><span><i style="background:var(--s2)"></i>closed</span></div>{_bars(m["hours"], "Issues opened and closed per hour", 3)}</div>'
            f'<div class="card"><h2>Open issues, hour by hour (last 24 h)</h2>{_line(m["hours"], "Open issues at the end of each hour", 3)}</div></div>'
            f'<div class="cols"><div class="card"><h2>Opened vs closed, per day</h2>'
            f'<div class="legend"><span><i style="background:var(--s1)"></i>opened</span><span><i style="background:var(--s2)"></i>closed</span></div>{_bars(m["days"], "Issues opened and closed per day", 1 if len(m["days"]) <= 7 else 2)}</div>'
            f'{truth}</div>{_ov_card(m)}{recent}{lists}</main></body></html>')

def _ai_card(m):
    a = m.get("ai")
    if not a:
        return ('<div class="card est"><h2>AI assessment <span class="tag">AI</span></h2><div class="sub">Not written yet. '
                'The watchdog writes it every hour; run <code>python3 tools/runner/dashboard.py --ai</code> for one now.</div></div>')
    old = m["now"] - a.get("at", 0) > 2 * 3600
    pts = [re.sub(r"^(?:[-•]|\*(?!\*))\s*", "", l.strip()) for l in a["text"].splitlines() if l.strip()]   # drop a bullet mark, keep **bold**
    return (f'<div class="card est"><h2>AI assessment <span class="tag">AI</span></h2><ul class="facts">'
            + "".join("<li>" + re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", html.escape(x)) + "</li>" for x in pts) +
            f'</ul><div class="sub" style="margin-top:6px">Written {time.strftime("%d %b %H:%M", time.localtime(a["at"]))} by Claude {html.escape(a["model"])} '
            f'from the numbers on this page{" (<span class=warn>older than 2 h</span>)" if old else ""}. AI-written, may be wrong: check the numbers below.</div></div>')

def _ov_card(m):
    o = m.get("ov")
    if not o: return ""
    def health(age, limit):
        if age is None: return '<span class="warn">no log</span>'
        return f'{dur(age)} ago ' + ('<span class="good">OK</span>' if age <= limit else '<span class="warn">STOPPED?</span>')
    last = {"runner": health(o["runner_age"], 6 * 3600), "watchdog": health(o["watchdog_age"], 300),
            "observer": health(o["observer_age"], 3600), "trend watcher": ("last: " + html.escape(o["trends_last"][8:90])) if o["trends_last"] else "no run yet",
            "orchestrator": f'{o["told"]} notes received in 24 h'}
    rows = "".join(f"<tr><td class='n'><b>{n}</b></td><td>{w}</td><td class='n sub'>{h}</td><td class='sub'>{last[n]}</td></tr>" for n, w, h in WATCHERS)
    notes = "".join(f"<tr><td class='n sub'>{hhmm(t)}</td><td>{html.escape(x[:160])}</td></tr>" for t, x in o["last_told"])
    return (f'<div class="card"><h2>Oversight: who watches the system</h2><table><tr><th>watcher</th><th>watches</th><th>how often</th><th>last activity</th></tr>{rows}</table>'
            f'<ul class="facts" style="margin-top:10px"><li>Last 24 h: <b>{o["told"]}</b> notes to the orchestrator ({o["idle"]} idle alarms, {o["trend"]} trend alarms), '
            f'{o["closed_windows"]} finished windows cleaned up, {o["errors"]} watchdog errors.</li>'
            f'<li>Observer last result: {html.escape(o["observer_last"]) or "-"}</li></ul>'
            + (f'<h2 style="margin-top:12px">Latest notes to the orchestrator</h2><table>{notes}</table>' if notes else "") + '</div>')

def fetch():
    rc, out = R.gh("issue", "list", "--state", "all", "--limit", "1000", "--json", "number,title,state,labels,createdAt,closedAt,body")
    rc2, out2 = R.gh("pr", "list", "--state", "all", "--limit", "500", "--json", "number,state,mergedAt")
    if rc or rc2: raise SystemExit("could not read GitHub (gh): " + (out if rc else out2)[:300])
    return [{**i, "labels": [l["name"] for l in i["labels"]]} for i in json.loads(out)], json.loads(out2)

def runner_log():
    f = R.RUNS / "runner.log"
    return f.read_text(encoding="utf-8", errors="replace") if f.exists() else ""

# ---------- oversight (#171): who watches what, measured from the watchers' own logs ----------
WATCHERS = [("runner", "each issue: worker -> review -> CI merge -> deploy -> close", "one run per issue"),
            ("watchdog", "windows, free lanes, leftovers, idle alarm, main checkout sync", "every minute"),
            ("observer", "rules per issue (stuck labels, missing windows, Blocked-by lines)", "every 30 min"),
            ("trend watcher", "patterns over 24 h: repeated stuck reasons, finish and review rates", "every hour"),
            ("orchestrator", "acts on every note and alarm above; merges by hand when the runner cannot", "always on")]

def _file(name):
    f = R.RUNS / name
    return (f.read_text(encoding="utf-8", errors="replace"), f.stat().st_mtime) if f.exists() else ("", None)

def oversight(wlog, wlog_mt, rlog_mt, obs_last, obs_mt, now):
    """Pure: watcher health + what they sent in the last 24 h. Log lines start with 'YYYY-mm-dd HH:MM:SS '."""
    rows = []
    for l in wlog.splitlines():
        try: t = time.mktime(time.strptime(l[:19], "%Y-%m-%d %H:%M:%S"))
        except ValueError: continue
        if t > now - 86400: rows.append((t, l[20:]))
    told = [(t, x.split("told orchestrator: ", 1)[1]) for t, x in rows if x.startswith("told orchestrator: ")]
    trends = [x for _, x in rows if x.startswith("trends: ")]
    age = lambda mt: None if mt is None else now - mt
    return {
        "watchdog_age": age(wlog_mt), "runner_age": age(rlog_mt), "observer_age": age(obs_mt), "observer_last": obs_last.strip()[:300],
        "told": len(told), "idle": sum("IDLE ALARM" in x for _, x in told), "trend": sum("TREND" in x for _, x in told),
        "last_told": told[-5:][::-1], "closed_windows": sum(x.startswith("closed window") for _, x in rows),
        "errors": sum(x.startswith("error") or " error" in x[:20] for _, x in rows), "trends_last": trends[-1] if trends else "",
    }

def ov_text(o):
    a = lambda s: "never" if s is None else f"{dur(s)} ago"
    return (f"Oversight: watchdog last active {a(o['watchdog_age'])}" + (" (STOPPED?)" if o["watchdog_age"] is None or o["watchdog_age"] > 300 else "") +
            f"; observer last ran {a(o['observer_age'])}; runner log {a(o['runner_age'])}. 24 h: {o['told']} notes to the orchestrator "
            f"({o['idle']} idle alarms, {o['trend']} trend alarms), {o['closed_windows']} windows cleaned up, {o['errors']} watchdog errors."
            + (f" {o['trends_last']}" if o["trends_last"] else ""))

# ---------- AI assessment (#171): a model reads this page's own numbers ----------
AI_FILE, AI_EVERY_MIN = R.RUNS / "ai_summary.json", 60
AI_PROMPT = ("You audit an automatic software-work pipeline for its owner (a parent building a learning game for his son). "
             "Below are its measured numbers. Write 4 to 6 short bullet points in plain English: what is going well, what is going wrong, "
             "the biggest risk, and ONE concrete recommendation. Use only numbers that appear below; never invent numbers; if something "
             "cannot be judged from them, say so. No headings, no preamble, each bullet under 30 words.\n\n")

def ai_refresh(numbers, model=None):
    """Ask Claude (no tools, no saved session) for the assessment; store it with time and model. -> dict or None."""
    model = model or R.CFG.get("ai_model", "haiku")
    claude = shutil.which("claude") or "claude"
    try:
        # the prompt goes on stdin: --tools takes a list and would swallow a prompt argument after it
        p = subprocess.run([claude, "-p", "--model", model, "--no-session-persistence", "--tools", ""], input=AI_PROMPT + numbers,
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
    except (OSError, subprocess.TimeoutExpired):
        return None
    out = (p.stdout or "").strip()
    if p.returncode or not out: return None
    data = {"at": time.time(), "model": model, "text": out[:3000]}
    AI_FILE.write_text(json.dumps(data), encoding="utf-8")
    return data

def ai_load():
    try: return json.loads(AI_FILE.read_text(encoding="utf-8"))
    except Exception: return None

def gather():
    issues, prs = fetch()
    now = time.time()
    m = model(issues, prs, S.read_events(R.RUNS / "stats.jsonl"), now, runner_log())
    w, wmt = _file("watchdog.log"); _, rmt = _file("runner.log"); ol, omt = _file("observer.last")
    _, bmt = _file("watchdog.beat"); wmt = bmt or wmt          # heartbeat every pass; the log is written only on events
    m["ov"] = oversight(w, wmt, rmt, ol, omt, now)
    return m

def ai_tick(log=print):
    """Watchdog hook: refresh the AI assessment when it is older than AI_EVERY_MIN (call it in a background thread)."""
    a = ai_load()
    if a and time.time() - a.get("at", 0) < AI_EVERY_MIN * 60: return
    m = gather()
    log("ai assessment " + ("refreshed" if ai_refresh(text(m) + "\n" + ov_text(m["ov"])) else "failed"))

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    m = gather()
    if "--ai" in sys.argv:                                   # refresh the AI assessment now (otherwise the watchdog does it hourly)
        print("asking Claude for the assessment ...", flush=True)
        ai_refresh(text(m) + "\n" + ov_text(m["ov"]))
    m["ai"] = ai_load()
    if "--text" in sys.argv:
        print(text(m)); print(ov_text(m["ov"]))
        if m["ai"]: print(f"\nAI assessment ({hhmm(m['ai']['at'])}, {m['ai']['model']}, may be wrong):\n" + m["ai"]["text"])
        return
    OUT.write_text(page(m), encoding="utf-8")
    print(text(m)); print(ov_text(m["ov"])); print(f"\npage: {OUT}")
    webbrowser.open(OUT.as_uri())

if __name__ == "__main__":
    main()
