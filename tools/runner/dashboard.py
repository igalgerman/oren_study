"""Owner dashboard (#142, v2 #169): the answer first (on track or not, when it will be finished), details folded below. On demand, always fresh.
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
import remote as RM         # cloud lanes (#136)
import parked as PK         # #282: batch members, manual, later
import stuck as SK          # #280: leftovers = open issues with no live state
import usage_entities as UE   # #708: usage per entity
import tester as TS         # #618: bugs found by the tester vs by the owner

OUT = R.RUNS / "dashboard.html"
STATES = [("running", "Running now"), ("needs_you", "Needs you"), ("blocked", "Blocked"),
          ("waiting", "Waiting for another issue"), ("ready", "Ready to start"),
          ("batch", "In a batch"), ("manual", "Manual"), ("later", "Later"), ("aside", "Put aside with a reason"), ("other", "Not triaged / other")]
STEP = {"start": "building", "worker_done": "in review", "review_fix": "fixing review notes", "fix_done": "in review",
        "review_pass": "merging (CI)", "resolve": "resolving a conflict", "merged": "deploying"}

def epoch(iso):
    try: return calendar.timegm(time.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S"))
    except (TypeError, ValueError): return None

def state_of(i, open_nums, bm=None, left=None):
    l = set(i["labels"])
    if "in-progress" in l: return "running"
    if l & {"ready-for-human", "needs-triage", "needs-info"}: return "needs_you"
    if "blocked" in l: return "blocked"
    if any(b != i["number"] and b in open_nums for b in R.blockers(i.get("body"))): return "waiting"
    if "ready-for-agent" in l: return "ready"
    k = PK.kind(i, bm or {})                         # #282: on purpose not ready-for-agent -> own bucket
    if k: return k
    return "other" if left is None or i["number"] in left else "aside"   # #280: PR, owner question, list ... is no 'not triaged'

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

def model(issues, prs, events, now, log_text="", cloud=(), qnums=frozenset()):
    """Pure: everything the page and the text show. issues/prs as gh JSON (labels as names), events from stats.jsonl,
    cloud = rows of remote.cloud() (#136), qnums = issue numbers with an open owner question (#280)."""
    op = [i for i in issues if i["state"] == "OPEN"]
    open_nums = {i["number"] for i in op}
    pend = R.pending_nums(op)   # #465: same rule as select(): an open 'later' blocker counts as done
    closed_at = {i["number"]: epoch(i.get("closedAt")) for i in issues if i["state"] == "CLOSED"}
    created = {i["number"]: epoch(i.get("createdAt")) for i in issues}
    bm = PK.batch_map(issues)
    left = [i["number"] for i in SK.leftovers(issues, [p for p in prs if p.get("state") == "OPEN"], set(qnums), now)]
    rows = sorted(({"n": i["number"], "title": i["title"], "state": state_of(i, pend, bm, set(left)), "prio": prio_of(i),
                    "batch": bm[i["number"]]["number"] if i["number"] in bm else None,
                    "age_h": (now - (created[i["number"]] or now)) / 3600,
                    "blockers": [b for b in R.blockers(i.get("body")) if b in pend and b != i["number"]]} for i in op),
                  key=lambda r: (r["prio"], r["n"]))
    by_state = {k: [r for r in rows if r["state"] == k] for k, _ in STATES}
    by_prio = {p: sum(r["prio"] == p for r in rows) for p in ("P0", "P1", "P2", "P3", "-")}
    within = lambda t, h: t is not None and t > now - h * 3600
    can = {i["number"] for i in issues if "canary" in i["labels"]}      # #538: canary runs are counted on their own
    is_can = lambda p: any(p.get("headRefName") == f"lane/{n}" or RM.fixes(p.get("body"), n) for n in can)
    can_merged = [epoch(p.get("mergedAt")) for p in prs if p.get("mergedAt") and is_can(p)]
    merged = [epoch(p.get("mergedAt")) for p in prs if p.get("mergedAt") and not is_can(p)]
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
    by_runner, started = S.finish_rate([e for e in events if e.get("issue") not in can], now)   # #538: canaries apart
    fixes = sum(e.get("event") == "review_fix" for e in ev24); passes = sum(e.get("event") == "review_pass" for e in ev24)
    red_esc = sum(e.get("event") == "red_escalated" for e in ev24)      # #303: still RED after the Opus fix round -> orchestrator
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
    cloud_done = [c for c in cloud if not RM.active(c)]                  # #263: finished sessions are no lane and not counted
    cloud = [c for c in cloud if RM.active(c)]
    done_n = {c["n"] for c in cloud_done}
    wait_n = {c["n"] for c in cloud if not RM.busy(c)}                 # #277: waiting for a core slot: listed, no busy lane
    cloud_n = {i["number"] for i in op if "cloud" in i["labels"] and i["number"] not in done_n | wait_n} | {c["n"] for c in cloud if c["n"] in open_nums and RM.busy(c)}   # #236: + remote runs
    running = [r for r in running if r["n"] not in cloud_n | wait_n]  # #136: cloud lanes have their own table
    recent = sorted(((closed_at[i["number"]], i) for i in issues if i["state"] == "CLOSED" and closed_at.get(i["number"])),
                    key=lambda x: -x[0])[:10]
    t = S.compute(events, now)["totals"]
    p0_closed = [closed_at[i["number"]] for i in issues if i["state"] == "CLOSED" and "P0" in i["labels"]]
    fc = forecast(len(op), list(closed_at.values()), list(created.values()), now, history_h)
    return {
        "plan": eta_plan(rows, running, t, fc, now),
        "now": now, "open": len(op), "leftovers": left, "cloud": list(cloud), "cloud_done": cloud_done, "cloud_n": len(cloud_n),
        "lanes": f"local {len(running)}/{R.CFG.get('local_lanes', 3)} · cloud {len(cloud_n)}/{R.CFG.get('remote_lanes', 0)}", "by_state": by_state, "by_prio": by_prio, "rows": rows, "running": running,
        "closed_24h": sum(within(c, 24) for c in closed_at.values()), "closed_7d": sum(within(c, 168) for c in closed_at.values()),
        "closed_total": len(closed_at), "opened_24h": sum(within(c, 24) for c in created.values()),
        "merged_24h": sum(within(m, 24) for m in merged), "merged_7d": sum(within(m, 168) for m in merged),
        "open_prs": sum(1 for p in prs if p.get("state") == "OPEN"), "days": days, "hours": hours, "history_h": history_h,
        "avg_build": t["avg_build"], "avg_review": t["avg_review"], "avg_merge": t["avg_merge"],
        "last_deploy": max(deploys, key=lambda e: e["ts"]) if deploys else None,
        "fc": fc,
        "fc_p0": forecast(by_prio["P0"], p0_closed, [], now, history_h) if by_prio["P0"] else None, "p0_open": by_prio["P0"],
        "truth": {"started": started, "by_runner": by_runner, "merged_by": S.merged_by([e for e in events if e.get("issue") not in can], now),   # #851
                  "by_runner": by_runner, "fixes": fixes, "passes": passes, "red_escalated": red_esc,
                  "canary": sum(within(m, 24) for m in can_merged),
                  "deploys_ok": sum(1 for d in deploys if d["ts"] > now - 86400 and d.get("ok")),
                  "deploys_fail": sum(1 for d in deploys if d["ts"] > now - 86400 and d.get("ok") is False),
                  "stuck": sorted(stuck.items(), key=lambda x: -len(x[1]))[:6]},
        "bug_sources": TS.bug_sources(issues),
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
        if r["state"] in ("needs_you", "blocked", "other", "batch", "manual", "later", "aside"):
            out[r["n"]] = {"needs_you": "waits for you", "blocked": "blocked", "other": "not triaged", "manual": "manual", "aside": "put aside",
                           "later": "later", "batch": f"in batch #{r.get('batch')}"}[r["state"]]
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

def last_eta(m, rs):
    """-> ((earliest, latest) when the last estimated issue of `rs` merges, or None; the rows that have no estimate)."""
    plan = m["plan"]
    ts = [plan[r["n"]] for r in rs if isinstance(plan.get(r["n"]), tuple)]
    return ((max(x[0] for x in ts), max(x[1] for x in ts)) if ts else None), [r for r in rs if not isinstance(plan.get(r["n"]), tuple)]

def bottom_line(m):
    """-> list of (label, eta text) for the P0s and the whole estimated queue."""
    rows, now = m["rows"], m["now"]
    (p0, a), (allq, b) = last_eta(m, [r for r in rows if r["prio"] == "P0"]), last_eta(m, rows)
    p0_none, all_none = len(a), len(b)
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

def conflicts_line(prs):
    """#262: open PRs GitHub reports as conflicting with main (written by the watchdog each tick)."""
    return f"PRs with conflicts: {len(prs)}" + (" (" + ", ".join(f"#{n}" for n in prs) + ")" if prs else "")

def pc_line(d, now):
    """#293: .runs/pc.json (pcload.py, written by the watchdog) -> 'PC: CPU x% · RAM y% free' (+ ' · ALARM'; '(stale)' when old)."""
    import pcload
    if not d.get("text"): return ""
    if now - float(d.get("at", 0)) >= pcload.FRESH_S: return d["text"] + " (stale)"
    return d["text"] + (" · ALARM" if d.get("alarm") else "")

def pc_div(t, e=html.escape):
    """#293: the page's PC line, red when alarmed."""
    if not t: return ""
    return f'<div class="sub"{' style="color:var(--bad)"' if "ALARM" in t else ""}>{e(t)}</div>'

def text(m):
    s, tr, fc = m["by_state"], m["truth"], m["fc"]
    lines = [f"Open issues: {m['open']}  (P0 {m['by_prio']['P0']}, P1 {m['by_prio']['P1']}, P2 {m['by_prio']['P2']}, P3 {m['by_prio']['P3']}, no priority {m['by_prio']['-']})",
             "  " + " · ".join(f"{name.lower()} {len(s[k])}" for k, name in STATES),
             f"Last 24 h: closed {m['closed_24h']}, new {m['opened_24h']}; PRs merged {m['merged_24h']} ({m['merged_7d']} in 7 days); open PRs {m['open_prs']}",
             f"Speed: closing {fc['c6']:.1f}/h (last 6 h), {fc['c24']:.1f}/h (24 h); new issues {fc['o6']:.1f}/h, {fc['o24']:.1f}/h",
             f"Forecast (estimate, {m['history_h']:.0f} h of history): " + fc_text(fc, m["now"], "all open issues"),
             "  " + (fc_text(m["fc_p0"], m["now"], f"the {m['p0_open']} open P0") if m["fc_p0"] else "no open P0"),
             f"Runner (24 h): started {tr['started']}, finished by itself {tr['by_runner']} ({pct(tr['by_runner'], tr['started'])}); "
             f"PRs not finished by the runner (by hand, or it crashed after merging) ≈ {max(0, m['merged_24h'] - tr['by_runner'])} (recorded: auto-merge {tr['merged_by'].get('auto', 0)}, by hand {tr['merged_by'].get('hand', 0)}); reviews sent back {tr['fixes']} of {tr['fixes'] + tr['passes']}; "
             f"to the orchestrator after 3 RED reviews: {tr.get('red_escalated', 0)}; canary PRs merged {tr.get('canary', 0)} (not counted above)",
             f"Average: build {S.fmt(m['avg_build'])}, review {S.fmt(m['avg_review'])}, start to merge {S.fmt(m['avg_merge'])}",
             f"Bugs found by the tester: {m['bug_sources']['tester']} · reported by the owner from the live game: {m['bug_sources']['owner']}"]
    d = m["last_deploy"]
    if m.get("privacy"): lines.append(m["privacy"])                     # #783: privacy scrub: on (N names) | no names file · ALARM
    if m.get("github"): lines.append(m["github"])                     # #329: calls/min, graphql/core left, alarm < 20%
    if m.get("canary"): lines.append("Canary: " + m["canary"])          # #330: flow ok HH:MM | NEEDS-ATTENTION ...
    if m.get("control"): lines.append(m["control"])                    # #890: NEEDS-ATTENTION: control session <role> <state> since HH:MM
    if m.get("usage"): lines.append(m["usage"])                         # #708: usage per entity (top rows, NEEDS-ATTENTION)
    import backoff; lines += backoff.lines()                           # #842: backoff: <job> next try HH:MM
    if m.get("pc"): lines.append(m["pc"])                               # #293: PC: CPU x% · RAM y% free (· ALARM)
    v = m.get("voice")                                                  # #400: kid sentences with no recording (after the last pregen)
    if v and v["n"]: lines.append(f"Voice: {v['text']} (first 20 in the deploy log)")
    lines.append("Last deploy: " + (f"{hhmm(d['ts'])} {'ok' if d.get('ok') else 'FAILED'}" if d else "no record yet") + f" · deploys 24 h: {tr['deploys_ok']} ok, {tr['deploys_fail']} failed")
    if tr["stuck"]: lines.append("Top stuck reasons (24 h): " + "; ".join(f"{k} ({len(v)})" for k, v in tr["stuck"][:3]))
    sl = m.get("stuck_lanes") or []     # #248: runs unchanged past stuck_hours and still stuck 30 min after the alarm
    if sl: lines.append(f"STUCK LANES: {len(sl)} (" + ", ".join(f"run-{n}" for n in sl) + ")")
    lines.append(conflicts_line(m.get("pr_conflicts") or []))
    if m.get("desks"): lines.append(m["desks"])                       # #306: cloud inbox / ask ok|down
    lines.append("Lanes: " + m["lanes"] + (" · " + m["governor"] if m.get("governor") else ""))
    for c in m["cloud"]:
        lines.append(f"  cloud #{c['n']} {c['title'][:40]} — {c['state']}{' · manual' if c.get('manual') else ''} · last {hhmm(epoch(c['last'])) if epoch(c['last']) else '-'}"
                     + (" · STALE" if c["stale"] else "") + (f" · {c['pr']}" if c["pr"] else "") + (f" · {c['session']}" if c["session"] else ""))
    if m.get("cloud_done"): lines.append("Cloud done: " + "; ".join(f"#{c['n']} {c['title'][:40]}" for c in m["cloud_done"]))   # #263
    if s.get("batch"):                   # #282: members under their batch
        by_b = {}
        for r in s["batch"]: by_b.setdefault(r["batch"], []).append(r["n"])
        lines.append("In batches: " + "; ".join(f"#{b} (" + " ".join(f"#{n}" for n in ns) + ")" for b, ns in sorted(by_b.items())))
    if m["running"]: lines.append("Running: " + "; ".join(f"#{r['n']} {r['step']} {dur(r['for_s'])}" for r in m["running"]))
    lines.append("Bottom line (estimate): " + "; ".join(f"{a} merged by {b}" for a, b in bottom_line(m)))
    nxt = sorted(((v, n) for n, v in m["plan"].items() if isinstance(v, tuple)))[:8]
    title = {r["n"]: r["title"] for r in m["rows"]}
    if nxt: lines.append("Next merges (estimate): " + "; ".join(f"#{n} {title.get(n, '')[:35]} ≈ {eta_str(v, m['now'])}" for v, n in nxt))
    lf = m.get("leftovers") or []
    if lf: lines.append(f"Not triaged (no live state, #280): {len(lf)} (" + " ".join(f"#{n}" for n in lf) + ")")
    if s["needs_you"]: lines.append("Needs you: " + ", ".join(f"#{r['n']} {r['title'][:50]}" for r in s["needs_you"]))
    for q in m.get("questions", []):
        h = int((m["now"] - (epoch(q.get("at")) or m["now"])) // 3600)
        lines.append(f"Needs you (question): {q['window']} {q['text'][:120]} {q['url']}" + (f" · waiting for owner {h}h" if h >= SK.AUTO_H else ""))   # #193, #280
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
:root{--bg:#f4f5f7;--card:#fff;--fg:#191919;--sub:#666;--line:#e3e5e8;--s1:#257de0;--s2:#f47230;--bad:#dc3c3d;--good:#0aac23;--goodtx:#006c10;--warn:#fbb315;--est:#fff7e0}
@media(prefers-color-scheme:dark){:root{--bg:#111;--card:#191919;--fg:#efefef;--sub:#9c9c9c;--line:#333;--s1:#338ced;--s2:#e76624;--goodtx:#53c556;--est:#2a2416}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 "Segoe UI",Arial,sans-serif}
main{max-width:900px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:22px;margin:0}h2{font-size:18px;margin:0 0 6px}h3{font-size:15px;margin:16px 0 0}p{margin:6px 0}
.sub{color:var(--sub);font-size:14px;font-weight:normal}a{color:var(--s1);text-decoration:none}a:hover{text-decoration:underline}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-top:12px}
.verdict{border-left:6px solid var(--sub);padding:18px 20px}.verdict .head{font-size:28px;font-weight:600;line-height:1.2;margin:8px 0 4px}
.verdict.ok{border-left-color:var(--good)}.verdict.slow,.verdict.you{border-left-color:var(--warn)}.verdict.bad{border-left-color:var(--bad)}
.chip{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.04em;border-radius:999px;padding:2px 10px;background:var(--line);color:var(--fg)}
.ok .chip{background:var(--good);color:#fff}.slow .chip,.you .chip{background:var(--warn);color:#0b0b0b}.bad .chip{background:var(--bad);color:#fff}
.tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:12px}.tiles .card{padding:14px 16px;margin:0}
.big{font-size:36px;font-weight:600;line-height:1.1}.attn{border:2px solid var(--warn)}
.est{background:var(--est)}.tag{font-size:11px;font-weight:600;border:1px solid var(--sub);border-radius:6px;padding:0 5px;color:var(--sub);margin-left:6px;vertical-align:2px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;margin:4px 0 8px}
.ans{font-size:24px;font-weight:600;line-height:1.3}
ul.rows{list-style:none;margin:6px 0 0;padding:0;display:grid;grid-template-columns:minmax(140px,max-content) 1fr}ul.rows li{display:contents}
ul.rows .when,ul.rows .what{padding:8px 0;border-top:1px solid var(--line)}
ul.rows .when{font-weight:600;white-space:nowrap;padding-right:20px;font-variant-numeric:tabular-nums}
ul.checks{list-style:none;margin:8px 0;padding:0}ul.checks li{display:grid;grid-template-columns:84px 1fr;padding:6px 0;border-top:1px solid var(--line)}
.st{font-size:12px;font-weight:700;letter-spacing:.03em;padding-top:3px}
.pill{font-size:11px;border:1px solid var(--line);border-radius:6px;padding:0 5px;color:var(--sub)}
.p0{color:var(--bad);border-color:var(--bad);font-weight:600}.count{color:var(--sub);font-weight:normal}.warn{color:var(--bad);font-weight:600}.good{color:var(--goodtx);font-weight:600}
ul.facts{margin:6px 0;padding-left:20px}ul.facts li{margin:4px 0}
h2.more{margin:28px 0 0}details summary{cursor:pointer}details.card[open]>summary{margin-bottom:10px}
.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:5px 6px;border-top:1px solid var(--line);vertical-align:top;text-align:left}
th{color:var(--sub);font-weight:normal;font-size:13px}td.n{white-space:nowrap;width:1%}code{font-size:13px}
.grid{stroke:var(--line);stroke-width:1}.ax{fill:var(--sub);font-size:13px}.lab{fill:var(--fg);font-size:14px;font-weight:600}
.s1{fill:var(--s1)}.s2{fill:var(--s2)}.ln{fill:none;stroke:var(--s1);stroke-width:2}.dot{fill:var(--s1);stroke:var(--card);stroke-width:2}.hit{fill:transparent}
rect:hover,.hit:hover+.dot{opacity:.75}
.legend{display:flex;gap:16px;font-size:13px;color:var(--sub);margin-bottom:6px}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
@media(max-width:760px){.tiles{grid-template-columns:1fr 1fr}.tiles .card:last-child{grid-column:span 2}.two{grid-template-columns:1fr}.verdict .head{font-size:24px}
ul.rows{grid-template-columns:1fr}ul.rows .when{padding-bottom:0}ul.rows .what{border-top:0;padding-top:0}}
"""

# the runner's step names (STEP) in plain words for the owner
PLAIN = {"building": "being built", "in review": "being checked by the reviewer", "fixing review notes": "fixing what the reviewer found",
         "merging (CI)": "passed the review, now running the tests", "resolving a conflict": "fixing a clash with other work",
         "deploying": "merged, now going live", "started by hand": "started by hand"}
HEALTH = [("runner", "does the work on each issue", "runner_age", 6 * 3600), ("watchdog", "checks every minute that nothing is stuck", "watchdog_age", 300),
          ("observer", "checks the rules for each issue every 30 minutes", "observer_age", 3600)]

def plural(n, one, many): return f"{n} {one if n == 1 else many}"

def watcher_health(o):
    """Pure: [(name, role in plain words, seconds since its last sign of life or None, ok)]; ok = within its limit (6 h, 5 min, 1 h)."""
    return [(n, role, o[k], o[k] is not None and o[k] <= lim) for n, role, k, lim in HEALTH]

def verdict(m):
    """Pure: the one answer at the top of the page -> {'level', 'head', 'why': [plain sentences]}.
    Levels, worst first: 'bad' (a watcher stopped or the last deploy failed), 'you' (issues wait for the owner),
    'slow' (nothing runs, or more issues open than close), 'ok', 'none' (nothing closed yet to measure). Every number comes from m."""
    s, fc, d = m["by_state"], m["fc"], m["last_deploy"]
    bad = [f"The {n} looks stopped: " + ("no sign of life found." if age is None else f"its last sign of life was {dur(age)} ago.")
           for n, _, age, ok in (watcher_health(m["ov"]) if m.get("ov") else []) if not ok]
    if d and not d.get("ok"): bad.append(f"The last deploy (at {hhmm(d['ts'])}) failed.")
    you = [plural(len(s["needs_you"]), "issue waits", "issues wait") + " for your answer or decision."] if s["needs_you"] else []
    slow, pace, head = [], [], "On track"
    if not s["running"] and s["ready"]:
        head = "Nothing is being worked on right now"; slow.append(plural(len(s["ready"]), "issue is", "issues are") + " ready to start, but none is running.")
    speed6 = f"closing {fc['c6']:.1f} per hour, new {fc['o6']:.1f} per hour"
    if not m["open"]: head = "All done"; pace.append("No issue is open.")
    elif fc["c6"] > fc["o6"]:
        pace.append(f"In the last 6 hours more issues were closed than opened ({speed6})." + ("" if fc["c24"] > fc["o24"] else " Over 24 hours it was the other way round."))
    elif fc["c24"] > fc["o24"]:
        if not slow: head = "Work is slowing down"
        slow.append(f"In the last 6 hours more new issues came in than were closed ({speed6}).")
    elif fc["c6"] or fc["c24"]:
        if not slow: head = "Work is moving, but the list is growing"
        slow.append(f"In the last 24 hours {plural(m['closed_24h'], 'issue was', 'issues were')} closed and {plural(m['opened_24h'], 'new one', 'new ones')} came in.")
    else: pace.append("No issue was closed yet, so the speed cannot be measured.")
    if bad: return {"level": "bad", "head": "Something looks wrong", "why": bad + you + slow}
    if you: return {"level": "you", "head": plural(len(s["needs_you"]), "issue needs", "issues need") + " you", "why": you + slow + pace}
    if slow: return {"level": "slow", "head": head, "why": slow + pace}
    if m["open"] and not (fc["c6"] or fc["c24"]): return {"level": "none", "head": "Too early to say", "why": pace}
    return {"level": "ok", "head": head, "why": pace}

def page(m):
    e = html.escape; repo = R.CFG["repo"]; s = m["by_state"]; p = m["by_prio"]; tr = m["truth"]; fc = m["fc"]; now = m["now"]; plan = m["plan"]
    link = lambda n: f'<a href="https://github.com/{repo}/issues/{n}">#{n}</a>'
    est_tag = '<span class="tag">ESTIMATE</span>'
    qs = m.get("questions", [])   # #193: open owner questions (pinned 'Questions for the owner' issue)
    qrows = "".join(f'<tr><td class="n">{e(q["window"])}</td><td>{e(q["text"])}</td><td class="n"><a href="{e(q["url"])}">answer</a></td></tr>' for q in qs)
    qcard = f'<section class="card attn"><h2>Needs you: open questions</h2><table><tr><th>from</th><th>question</th><th></th></tr>{qrows}</table></section>' if qrows else ""
    cl_rows = "".join(f'<tr><td class="n">{link(c["n"])}</td><td>{e(c["title"])}</td><td class="n">{e(c["state"])}' + (' <span class="tag">manual</span>' if c.get("manual") else '') + (' <span class="warn">STALE</span>' if c["stale"] else '')
                      + f'</td><td class="n sub">{hhmm(epoch(c["last"])) if epoch(c["last"]) else "-"}</td><td class="n">' + (f'<a href="{e(c["pr"])}">PR</a>' if c["pr"] else "-")
                      + '</td><td class="n">' + (f'<a href="{e(c["session"])}">session</a>' if c["session"] else "-") + '</td></tr>' for c in m["cloud"])
    cloud = (f'<section class="card"><h2>Cloud lanes <span class="count">{m["cloud_n"]}</span></h2><table><tr><th>#</th><th>issue</th><th>state</th>'
             f'<th>last activity</th><th>PR</th><th>session</th></tr>{cl_rows}</table></section>') if m["cloud_n"] or m["cloud"] else ""
    if m.get("cloud_done"):   # #263: finished cloud sessions go to DONE, not the lanes
        cloud += ('<section class="card"><h2>Cloud done <span class="count">' + str(len(m["cloud_done"])) + '</span></h2><ul class="rows">'
                  + "".join(f'<li>✓ {link(c["n"])} {e(c["title"])}</li>' for c in m["cloud_done"]) + '</ul></section>')
    approx = lambda v: "≈ " + eta_str(v, now) if isinstance(v, tuple) else "no estimate"
    pill = lambda r: f'<span class="pill{" p0" if r["prio"] == "P0" else ""}">{r["prio"] if r["prio"] != "-" else "no priority"}</span>'
    row = lambda when, r, note: (f'<li><div class="when">{when}</div><div class="what">{link(r["n"])} {e(r["title"])}'
                                 f'<div class="sub">{pill(r)} {note}</div></div></li>')
    rows_ul = lambda items: f'<ul class="rows">{"".join(items)}</ul>'
    fold = lambda title, hint, body: (f'<details class="card"><summary><b>{title}</b> <span class="sub">{hint}</span></summary>{body}</details>')
    # 1. the answer, then four numbers
    v = verdict(m)
    chip = {"bad": "! PROBLEM", "you": "! NEEDS YOU", "slow": "! SLOW", "ok": "✓ ON TRACK", "none": "? NO DATA YET"}[v["level"]]
    why = (f'<p>{e(v["why"][0])}</p>' if len(v["why"]) == 1 else '<ul class="facts">' + "".join(f"<li>{e(x)}</li>" for x in v["why"]) + "</ul>")
    top = f'<section class="card verdict {v["level"]}"><span class="chip">{chip}</span><div class="head">{e(v["head"])}</div>{why}</section>'
    tile = lambda big, label, sub, cls="": f'<div class="card {cls}"><div class="big">{big}</div><div>{label}</div><div class="sub">{sub}</div></div>'
    tiles = (tile(m["open"], "open issues", f"{p['P0']} of them urgent (P0)")
             + tile(m["closed_24h"], "closed in 24 hours", f"{m['opened_24h']} new ones came in")
             + tile(len(m["running"]), "being worked on now", f"{len(s['ready'])} more ready to start")
             + tile(len(s["needs_you"]) + len(qs), "need you", "your answer or decision" if s["needs_you"] or qs else "nothing waits for you", "attn" if s["needs_you"] or qs else "")
             + tile(f'{tr["by_runner"]} of {tr["started"]}', "runner finished on its own (24 h)",            # #148: goal 80%
                    ("stuck: " + ", ".join(f"{e(k)} ({len(v)})" for k, v in tr["stuck"][:2])) if tr["stuck"] else "no stuck runs in 24 hours",
                    "attn" if tr["started"] and tr["by_runner"] / tr["started"] < 0.5 else ""))
    # 2. needs you (only when something does)
    needs = (f'<section class="card attn"><h2>Needs you <span class="count">{len(s["needs_you"])}</span></h2>'
             f'<p class="sub">These issues wait for your answer or decision. They have no time estimate: they depend on you.</p>'
             + rows_ul(row(f'open {dur(r["age_h"] * 3600)}', r, "waits for you") for r in s["needs_you"]) + '</section>') if s["needs_you"] else ""
    # 3. bottom line: when the P0s and everything open now should be merged
    big_when = lambda t: "≈ " + ("today " if eta_str(t, now)[:1].isdigit() else "") + eta_str(t, now)      # eta_str names the day only when it is not today
    def answer(label, rs, list_them):
        t, none = last_eta(m, rs)
        note = ""
        if none and list_them:
            note = "No estimate for " + ", ".join(f'{link(r["n"])} ({e(str(plan.get(r["n"]) or "no reason recorded"))})' for r in none[:4]) + (f" and {len(none) - 4} more" if len(none) > 4 else "") + "."
        elif none:
            note = f"{len(none)} of them {'has' if len(none) == 1 else 'have'} no estimate. The reason is next to each one in the full list below."
        return f'<div><div>{label}</div><div class="ans">{big_when(t) if t else "no estimate yet"}</div><div class="sub">{note}</div></div>'
    p0_rows = [r for r in m["rows"] if r["prio"] == "P0"]
    rough = ""
    if m["fc_p0"] and m["fc_p0"]["net"]:
        a, b = m["fc_p0"]["net"][0], m["fc_p0"]["net"][-1]
        rough = (f'<p class="sub">A second, rougher check for the urgent issues (from their closing speed only): ≈ {dur(a * 3600)}' + (f" to {dur(b * 3600)}" if b - a > 0.5 else "")
                 + ' from now. Both are estimates.</p>')
    bottom = (f'<section class="card est"><h2>When will it be finished? {est_tag}</h2><div class="two">'
              + (answer("The " + plural(p["P0"], "urgent issue (P0), finished by", "urgent issues (P0), all finished by"), p0_rows, True) if p0_rows else '<div><div>Urgent issues (P0)</div><div class="ans">none open</div></div>')
              + (answer("The 1 open issue, finished by" if m["open"] == 1 else f"All {m['open']} open issues, finished by", m["rows"], False) if m["rows"] else '<div><div>All issues</div><div class="ans">nothing open</div></div>')
              + f'</div><p class="sub">Finished = merged into the game after review and tests. The times come from the speed of the last hours; '
              f'new urgent issues push them later.</p>{rough}</section>')
    # 4. timeline: what runs now, what comes next
    est = sorted(((x, r) for r in m["rows"] for x in [plan.get(r["n"])] if isinstance(x, tuple)), key=lambda x: x[0])
    run_n = {r["n"] for r in m["running"]}
    step = lambda r: PLAIN.get(r["step"], r["step"]) + (f' · started {dur(r["for_s"])} ago' if r["for_s"] is not None else "")
    qnote = lambda r: ("waits for " + ", ".join(link(b) for b in r["blockers"])) if r.get("blockers") else "ready to start"
    run_rows = [row(approx(plan.get(r["n"])), r, step(r)) for r in sorted(m["running"], key=lambda r: plan[r["n"]] if isinstance(plan.get(r["n"]), tuple) else (now, now))]
    queue = [row(approx(x), r, qnote(r)) for x, r in est if r["n"] not in run_n]
    timeline = (f'<section class="card"><h2>Timeline {est_tag}</h2><p class="sub">The time next to each issue is when it should be finished. ≈ means an estimate, not a promise.</p>'
                f'<h3>Being worked on now <span class="count">{len(run_rows)}</span></h3>'
                + (rows_ul(run_rows) if run_rows else '<p class="sub">Nothing is being worked on right now.</p>')
                + f'<h3>Next in line <span class="count">{len(queue)}</span></h3>'
                + (rows_ul(queue[:6]) if queue else '<p class="sub">No issue is waiting in line with an estimate.</p>')
                + (f'<details><summary class="sub">Show the other {len(queue) - 6} in line</summary>{rows_ul(queue[6:])}</details>' if len(queue) > 6 else "") + '</section>')
    # 6. everything else, folded
    legend = '<div class="legend"><span><i style="background:var(--s1)"></i>opened</span><span><i style="background:var(--s2)"></i>closed</span></div>'
    charts = fold("Charts", "issues opened and closed, per hour and per day",
                  f'<h3>Opened and closed, per hour (last 24 hours)</h3>{legend}{_bars(m["hours"], "Issues opened and closed per hour", 3)}'
                  f'<h3>Open issues, hour by hour (last 24 hours)</h3>{_line(m["hours"], "Open issues at the end of each hour", 3)}'
                  f'<h3>Opened and closed, per day</h3>{legend}{_bars(m["days"], "Issues opened and closed per day", 1 if len(m["days"]) <= 7 else 2)}')
    stuck = "".join(f"<tr><td>{e(k)}</td><td class='n'>{len(x)} issues</td><td class='sub'>{' '.join('#' + str(n) for n in x[:6])}</td></tr>" for k, x in tr["stuck"])
    truth = fold("How the work really gets done", "last 24 hours: who finished what, reviews, why issues got stuck",
                 f'<ul class="facts"><li>The runner started <b>{tr["started"]}</b> issues and finished <b>{tr["by_runner"]}</b> by itself ({pct(tr["by_runner"], tr["started"])}). '
                 f'{m["merged_24h"]} pull requests were merged in total, so about <b>{max(0, m["merged_24h"] - tr["by_runner"])}</b> were not finished by the runner: '
                 f'merged by hand (orchestrator), or the runner crashed right after merging and never recorded it. '
                 f'<b>{tr.get("canary", 0)}</b> canary pull requests (the automatic flow check) were merged too; they are not in these numbers.</li>'
                 f'<li>Reviews: {tr["passes"]} passed, <b>{tr["fixes"]}</b> sent back for fixes ({pct(tr["fixes"], tr["fixes"] + tr["passes"])}); '
                 f'<b>{tr.get("red_escalated", 0)}</b> still red after 3 reviews went to the orchestrator.</li>'
                 f'<li>Bugs (#618): <b>{m.get("bug_sources", {}).get("tester", 0)}</b> found by the tester (before merge or the tour after deploy), '
                 f'<b>{m.get("bug_sources", {}).get("owner", 0)}</b> reported by the owner from the live game.</li>'
                 f'<li>Runner deploys: {tr["deploys_ok"]} ok, {tr["deploys_fail"]} failed (hand deploys are not recorded).</li>'
                 f'<li>Average times (runner records): build {S.fmt(m["avg_build"])}, review {S.fmt(m["avg_review"])}, start to merge {S.fmt(m["avg_merge"])}.</li>'
                 f'<li>Pull requests: {m["merged_24h"]} merged in 24 hours, {m["merged_7d"]} in 7 days, {m["open_prs"]} open now. '
                 f'Issues closed: {m["closed_24h"]} in 24 hours, {m["closed_7d"]} in 7 days, {m["closed_total"]} in total.</li></ul>'
                 + (f'<h3>Why issues got stuck (distinct issues, 24 hours)</h3><div class="scroll"><table>{stuck}</table></div>' if stuck else ""))
    def fc_block(f, what):
        if not f: return f"<p><b>{what}:</b> nothing open</p>"
        if f["net"]:
            a, b = f["net"][0], f["net"][-1]; rng = len(f["net"]) > 1 and b - a > 0.5
            return (f"<p><b>{what}:</b> ≈ {dur(a * 3600)}" + (f" – {dur(b * 3600)}" if rng else "") + f" <span class='sub'>(around {when(now, a)}" + (f" to {when(now, b)}" if rng else "") + ")</span></p>")
        if f["gross"]:
            return (f"<p><b>{what}:</b> <span class='warn'>not shrinking</span> <span class='sub'>(new issues arrive as fast as old ones close; "
                    f"if nothing new came in: ≈ {dur(f['gross'][0] * 3600)})</span></p>")
        return f"<p><b>{what}:</b> not enough data yet</p>"
    speed = fold(f"A second estimate, from speed alone {est_tag}", "issues open now divided by how fast they close",
                 fc_block(fc, f"All {m['open']} open issues") + (fc_block(m["fc_p0"], f"The {m['p0_open']} open P0") if m["fc_p0"] else "<p><b>No open P0</b></p>")
                 + f'<ul class="facts sub"><li>Measured speed: closing <b>{fc["c6"]:.1f}/h</b> in the last 6 h and <b>{fc["c24"]:.1f}/h</b> over 24 h; '
                 f'new issues {fc["o6"]:.1f}/h and {fc["o24"]:.1f}/h. The range is the faster and the slower of the two.</li>'
                 f'<li>Based on only {m["history_h"]:.0f} h of history. It does not know which issues are big or small, and a new batch of issues makes it longer.</li>'
                 f'<li>The timeline above is the more detailed estimate: it follows each issue\'s place in line. This one only divides the count by the speed.</li></ul>')
    def state_rows(key):
        note = lambda r: (f'open for {dur(r["age_h"] * 3600)}' + (" · " + PLAIN.get(r["step"], r["step"]) if "step" in r else "")
                          + (" · " + e(plan[r["n"]]) if isinstance(plan.get(r["n"]), str) else " · " + qnote(r) if r["state"] == "waiting" else ""))
        return rows_ul(row(approx(plan.get(r["n"])), r, note(r)) for r in (m["running"] if key == "running" else s[key]))
    lists = fold(f'All open issues <span class="count">{m["open"]}</span>', "by state, each with its estimate or the reason it has none",
                 f'<p class="sub">By priority: P0 {p["P0"]} · P1 {p["P1"]} · P2 {p["P2"]} · P3 {p["P3"]}'
                 + (f' · <span class="warn">{p["-"]} without priority</span>' if p["-"] else "") + '</p>'
                 + "".join(f'<h3>{name} <span class="count">{len(s[k])}</span></h3>{state_rows(k)}' for k, name in STATES if s[k]))
    rec = "".join(f'<li><div class="when">{_clock(r["at"], now)}</div><div class="what">{link(r["n"])} {e(r["title"])}'
                  f'<div class="sub">was open for {dur(r["open_s"])}</div></div></li>' for r in m["recent"])
    recent = fold(f'Recently finished <span class="count">{len(m["recent"])}</span>', "the last closed issues and when they closed",
                  f'<ul class="rows">{rec}</ul>' if rec else '<p class="sub">No issue was closed yet.</p>')
    how = fold("How these numbers are made", "sources and how the estimates are calculated",
               '<ul class="facts"><li>Issues and pull requests are read live from GitHub every time this page is made.</li>'
               '<li>Steps and times come from the runner\'s own records (<code>.runs/stats.jsonl</code>, <code>runner.log</code>); deploys from the GitHub deploy workflow (deployments of environment production). '
               'Watcher health comes from the watchers\' own files (<code>watchdog.log</code>, <code>watchdog.beat</code>, <code>observer.last</code>).</li>'
               '<li>In the timeline, finished means merged. The steps of each issue are: build, review, tests and merge, deploy, close.</li>'
               f'<li>Issues being worked on now: the time left for their current step, from the runner\'s average step times (build {S.fmt(m["avg_build"])}, '
               f'review {S.fmt(m["avg_review"])}, start to merge {S.fmt(m["avg_merge"])}). The later time is 1.5 times the earlier one.</li>'
               f'<li>Issues in line: their place in line (by priority, as the runner picks) divided by the measured closing speed ({fc["c6"]:.1f}/h in 6 h, {fc["c24"]:.1f}/h in 24 h), '
               f'never sooner than a lane is free plus one full measured cycle ({S.fmt(m["avg_merge"])}) per round of {R.CFG.get("max_parallel", 3)} lanes. '
               'An issue that waits for another one comes after it, plus one full cycle.</li>'
               '<li>No estimate for issues that wait for you, are blocked or are not triaged: they depend on a person. New issues with a higher priority push the line back.</li>'
               f'<li>All speeds are measured over only {m["history_h"]:.0f} h of history, so the estimates are rough.</li></ul>')
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>Oren game: status {hhmm(now)}</title><style>{CSS}</style></head><body><main>'
            f'<h1>Oren game: work status</h1><div class="sub">Updated {time.strftime("%a %d %b %H:%M", time.localtime(now))} (Israel time). '
            f'For fresh numbers run tools\\dashboard.cmd again.</div>'
            f'{top}<div class="tiles">{tiles}</div><div class="sub">Lanes: {m["lanes"]}{" · " + e(m["governor"]) if m.get("governor") else ""}</div>{pc_div(m.get('privacy'), e)}{f'<div class="sub">{e(m["github"])}</div>' if m.get("github") else ""}{f'<div class="sub">Canary: {e(m["canary"])}</div>' if m.get("canary") else ""}{pc_div(m.get('pc'), e)}{f'<pre class="sub"{chr(32)}style="white-space:pre-wrap">{e(m["usage"])}</pre>' if m.get("usage") else ""}{qcard}{needs}{bottom}{timeline}{cloud}{_health_card(m)}{_ai_card(m)}'
            f'<h2 class="more">More details</h2><div class="sub">Everything else is here. Click a line to open it.</div>'
            f'{lists}{recent}{truth}{charts}{speed}{_ov_card(m)}{how}</main></body></html>')

def _clock(ts, now):
    """'09:22' today, 'Wed 21:40' on another day."""
    same = time.strftime("%d", time.localtime(ts)) == time.strftime("%d", time.localtime(now))
    return time.strftime("%H:%M" if same else "%a %H:%M", time.localtime(ts))

def _health_card(m):
    """Short 'is the system healthy' list: one line per check, a plain label first (OK / STOPPED? / FAILED / LOW / STUCK)."""
    o, tr, d, blocked = m.get("ov"), m["truth"], m["last_deploy"], m["by_state"]["blocked"]
    checks = []                                                       # (ok or None = not measured, label, name, detail)
    for n, role, age, ok in (watcher_health(o) if o else []):
        checks.append((ok, "OK" if ok else "STOPPED?", n.capitalize(), f"{role}; " + ("no sign of life found" if age is None else f"last active {dur(age)} ago")))
    if d: checks.append((bool(d.get("ok")), "OK" if d.get("ok") else "FAILED", "Last deploy", f"at {hhmm(d['ts'])}; deploys in 24 hours: {tr['deploys_ok']} ok, {tr['deploys_fail']} failed"))
    else: checks.append((None, "NO DATA", "Last deploy", "no deploy is recorded yet"))
    if tr["started"]:
        ok = tr["by_runner"] / tr["started"] >= 0.5
        checks.append((ok, "OK" if ok else "LOW", "Finished without help", f"{tr['by_runner']} of the {plural(tr['started'], 'issue', 'issues')} the runner started in 24 hours "
                       f"({pct(tr['by_runner'], tr['started'])}); the rest were finished by hand or not recorded"))
    else: checks.append((None, "NO DATA", "Finished without help", "the runner started no issue in 24 hours"))
    v = m.get("voice")                                                # #400: shown, never counted as a failure (ok None)
    if v and v["n"]: checks.append((None, "MISSING", "Voice recordings", v["text"] + "; the first 20 are in the deploy log (pregen job)"))
    checks.append((not blocked, "STUCK" if blocked else "OK", "Stuck issues", (f"{len(blocked)} blocked: " + " ".join(f"#{r['n']}" for r in blocked[:8])) if blocked else "no issue is blocked"))
    bad = sum(ok is False for ok, *_ in checks)
    cls = lambda ok: "sub" if ok is None else ("good" if ok else "warn")
    head = (f'<span class="warn">{bad} of {len(checks)} checks {"needs" if bad == 1 else "need"} a look</span>' if bad else f'<span class="good">All {len(checks)} checks are OK</span>')
    notes = (f'<p class="sub">In the last 24 hours the watchers sent {plural(o["told"], "note", "notes")} to the orchestrator (the session that manages the work), among them '
             f'{plural(o["idle"], "idle alarm", "idle alarms")} and {plural(o["trend"], "trend alarm", "trend alarms")}. '
             f'The watchdog logged {plural(o["errors"], "error", "errors")}. Details are in "Oversight" below.</p>') if o else \
            '<p class="sub">Watcher status is not available in this run.</p>'
    return (f'<section class="card"><h2>Is the system healthy?</h2><div>{head}</div><ul class="checks">'
            + "".join(f'<li><span class="st {cls(ok)}">{lab}</span><div><b>{name}</b> <span class="sub">{html.escape(det)}</span></div></li>' for ok, lab, name, det in checks)
            + f'</ul>{notes}</section>')

def _ai_card(m):
    a = m.get("ai")
    if not a:
        return ('<section class="card"><h2>AI assessment <span class="tag">AI</span></h2><div class="sub">Not written yet. '
                'The watchdog writes it every hour. For one now, run tools\\dashboard_ai.cmd.</div></section>')
    old = m["now"] - a.get("at", 0) > 2 * 3600
    pts = [re.sub(r"^(?:[-•]|\*(?!\*))\s*", "", l.strip()) for l in a["text"].splitlines() if l.strip()]   # drop a bullet mark, keep **bold**
    return (f'<section class="card"><h2>AI assessment <span class="tag">AI</span></h2>'
            f'<div class="sub">An AI model read the numbers on this page and wrote this. AI-written, may be wrong: check the numbers.</div><ul class="facts">'
            + "".join("<li>" + re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", html.escape(x)) + "</li>" for x in pts) +
            f'</ul><div class="sub">Written {time.strftime("%d %b %H:%M", time.localtime(a["at"]))} by Claude {html.escape(a["model"])}'
            f'{" (<span class=warn>older than 2 h</span>)" if old else ""}.</div></section>')

def _ov_card(m):
    """Folded detail: every watcher, what it watches, its last activity, and the latest notes to the orchestrator."""
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
    return (f'<details class="card"><summary><b>Oversight: who watches the system</b> <span class="sub">every watcher, its last activity, the latest alarms</span></summary>'
            f'<div class="scroll"><table><tr><th>watcher</th><th>watches</th><th>how often</th><th>last activity</th></tr>{rows}</table></div>'
            f'<ul class="facts"><li>Last 24 h: <b>{o["told"]}</b> notes to the orchestrator ({o["idle"]} idle alarms, {o["trend"]} trend alarms), '
            f'{o["closed_windows"]} finished windows cleaned up, {o["errors"]} watchdog errors.</li>'
            f'<li>Observer last result: {html.escape(o["observer_last"]) or "-"}</li></ul>'
            + (f'<h3>Latest notes to the orchestrator</h3><div class="scroll"><table>{notes}</table></div>' if notes else "") + '</details>')

def fetch():
    rc, out = R.gh("issue", "list", "--state", "all", "--limit", "1000", "--json", "number,title,state,labels,createdAt,closedAt,body")
    rc2, out2 = R.gh("pr", "list", "--state", "all", "--limit", "500", "--json", "number,state,mergedAt,headRefName,title,body")
    if rc or rc2: raise SystemExit("could not read GitHub (gh): " + (out if rc else out2)[:300])
    return [{**i, "labels": [l["name"] for l in i["labels"]]} for i in json.loads(out)], json.loads(out2)

def deploy_events(statuses):
    """Pure (#192): latest status of each GitHub deployment (environment production, made by the deploy workflow) -> deploy events
    like the runner's stats.jsonl ones. Only finished ones: success = ok, failure/error = failed."""
    out = []
    for s in statuses:
        if not s or s.get("state") not in ("success", "failure", "error"): continue
        out.append({"ts": epoch(s.get("created_at")), "issue": 0, "event": "deploy", "ok": s["state"] == "success", "url": s.get("environment_url") or ""})
    return out

def merge_deploys(events, ci_events, ci=True):
    """deploy_in_ci: the runner no longer deploys, so its old deploy records are replaced by the workflow's deploys."""
    return [e for e in events if e.get("event") != "deploy"] + ci_events if ci else events

def ci_deploys(n=8):
    """The last `n` deploys of the deploy workflow, read from GitHub; [] if gh fails."""
    rc, out = R.run(["gh", "api", f"repos/{R.REPO}/deployments?environment=production&per_page={n}", "--jq", "[.[].statuses_url]"])
    if rc: return []
    st = []
    for u in json.loads(out or "[]"):
        rc, o = R.run(["gh", "api", u + "?per_page=1", "--jq", ".[0]"])
        st.append(None if rc or not o.strip() or o.strip() == "null" else json.loads(o))
    return deploy_events(st)

def voice_missing(statuses):
    """Pure (#400): the 'voice-missing' commit status the deploy workflow's pregen job posts -> {"n", "text"}; None if absent."""
    for st in statuses or []:
        if st and st.get("context") == "voice-missing":
            d = st.get("description") or ""; n = re.match(r"\s*(\d+)", d)
            return {"n": int(n.group(1)), "text": d} if n else None
    return None

def ci_voice(n=3):
    """#400: the voice-missing status of the newest production deploy that has one (pregen runs after the deploy); None if gh fails."""
    rc, out = R.run(["gh", "api", f"repos/{R.REPO}/deployments?environment=production&per_page={n}", "--jq", "[.[].sha]"])
    if rc: return None
    for sha in json.loads(out or "[]"):
        rc, o = R.run(["gh", "api", f"repos/{R.REPO}/commits/{sha}/statuses?per_page=100"])
        v = None if rc else voice_missing(json.loads(o or "[]"))
        if v: return v
    return None

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
    model, effort = R.floors("dashboard_ai", model or R.CFG.get("ai_model", "haiku"))   # #714: Haiku allowed (status summary), effort medium
    claude = shutil.which("claude") or "claude"
    try:
        # the prompt goes on stdin: --tools takes a list and would swallow a prompt argument after it
        p = subprocess.run([claude, "-p", "--model", model, "--effort", effort, "--no-session-persistence", "--output-format", "json", "--tools", ""], input=AI_PROMPT + numbers,
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180, creationflags=R.no_window())
    except (OSError, subprocess.TimeoutExpired):
        return None
    out = UE.unwrap(p.stdout or "", "dashboard-ai", model).strip()
    if p.returncode or not out: return None
    data = {"at": time.time(), "model": model, "text": out[:3000]}
    AI_FILE.write_text(json.dumps(data), encoding="utf-8")
    return data

def ai_load():
    try: return json.loads(AI_FILE.read_text(encoding="utf-8"))
    except Exception: return None

def governor_line():
    """#239: the runner's last governor line (.runs/governor.json), '' when missing."""
    try: return json.loads((R.RUNS / "governor.json").read_text(encoding="utf-8")).get("text", "")
    except Exception: return ""

def gather():
    issues, prs = fetch()
    now = time.time()
    ci = R.CFG.get("deploy_in_ci", True)
    ev = merge_deploys(S.read_events(R.RUNS / "stats.jsonl"), ci_deploys() if ci else [], ci)
    import owner_q
    qs = owner_q.open_list() or []                        # #193
    m = model(issues, prs, ev, now, runner_log(), RM.cloud(), {int(r[1:]) for r in map(PK.owner_q_ref, qs) if r})
    w, wmt = _file("watchdog.log"); _, rmt = _file("runner.log"); ol, omt = _file("observer.last")
    _, bmt = _file("watchdog.beat"); wmt = bmt or wmt          # heartbeat every pass; the log is written only on events
    m["ov"] = oversight(w, wmt, rmt, ol, omt, now)
    m["questions"] = qs
    try: m["stuck_lanes"] = json.loads((R.RUNS / "stuck_lanes.json").read_text(encoding="utf-8"))   # #248 (written by the watchdog)
    except Exception: m["stuck_lanes"] = []
    try: m["pr_conflicts"] = json.loads((R.RUNS / "pr_conflicts.json").read_text(encoding="utf-8"))   # #262 (written by the watchdog)
    except Exception: m["pr_conflicts"] = []
    m["governor"] = governor_line()                         # #239
    import ghcache; m["github"] = ghcache.dashboard_line()  # #329
    import scrub; m["privacy"] = scrub.status_line()        # #783
    try: m["desks"] = json.loads((R.RUNS / "desks.json").read_text(encoding="utf-8")).get("text", "")   # #306 (written by desks.py)
    except Exception: m["desks"] = ""
    try: m["usage"] = UE.text(UE.load())                                     # #708 (written by the watchdog's usage_tick)
    except Exception: m["usage"] = ""
    try: m["canary"] = json.loads((R.RUNS / "canary.json").read_text(encoding="utf-8")).get("text", "")   # #330 (written by canary.py)
    except Exception: m["canary"] = ""
    import control_health; m["control"] = control_health.line()   # #890
    import pcload; m["pc"] = pc_line(pcload.load(), now)    # #293 (written by the watchdog)
    m["voice"] = ci_voice() if ci else None                # #400
    return m

def ai_tick(log=print):
    """Watchdog hook: refresh the AI assessment when it is older than AI_EVERY_MIN (call it in a background thread)."""
    a = ai_load()
    if a and time.time() - a.get("at", 0) < AI_EVERY_MIN * 60: return None
    m = gather()
    ok = bool(ai_refresh(text(m) + "\n" + ov_text(m["ov"])))
    log("ai assessment " + ("refreshed" if ok else "failed"))
    return ok     # #842: the watchdog backs off while it fails

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
