"""#708 usage per entity: who burns the budget. Builds the daily table .runs/usage_by_entity.json ({day, rows, attention, at}) from
  - local Claude Code transcripts (~/.claude/projects/<cwd>/<session>.jsonl + <session>/subagents/agent-*.jsonl): ONLY the numeric
    usage fields, model, effort and timestamp are read; message content is never stored or printed (the first user prompt is only
    compared with the known control prompts, equality/prefix, to tell which control session it is);
  - headless `claude -p` calls: record_headless() appends one numeric line to .runs/usage_headless.jsonl;
  - cloud runs: no token data on the PC, so run-minutes from .runs/stats.jsonl (rows marked proxy).
Units = "Sonnet-equivalent tokens" (WEIGHTS are priors). Share of the week = share of the day x the week-% burned in the period
(.runs/usage_hist.jsonl `week`). Alarms: alarms() (pure), sent by the watchdog's usage_tick; at most once per entity per 3 h.
Usage: python usage_entities.py [--write]"""
import json, os, re, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNS = Path(os.environ.get("RUNNER_RUNS") or HERE / ".runs")
OUT_NAME = "usage_by_entity.json"
WEIGHTS = {"sonnet": 1.0, "opus": 2.0, "haiku": 0.05, "fable": 4.0}   # priors, unverified
CACHE_READ_W = 0.1            # a cache read costs about a tenth of a fresh input token
PROXY_TOK_PER_MIN = 20000     # prior: a cloud run-minute counted as this many tokens (before the model weight)
CONTROL = ("orchestrator", "inbox", "inspector", "executor")
ALARM_EVERY_H = 3
LIMITS = {"orchestrator": 15.0, "control": 10.0, "governor": 3.0}   # % of the day
ISSUE_WEEK_LIMIT = 5.0                                              # % of the week, one issue
FIX = {"orchestrator": "shorten its turns / stop polling loops, hand work to the runner",
       "control": "check what that session loops on; restart it with a fresh context",
       "governor": "run the AI governor step less often or on a smaller model",
       "issue": "split the issue or check for a fix loop (review rounds); park it if it keeps failing"}

def weight(model):
    m = (model or "").lower()
    return next((w for k, w in WEIGHTS.items() if k in m), 1.0)

def _num(x):
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) else 0

def usage_tokens(u):
    """Pure: a usage dict -> weighted-by-kind token count (numbers only)."""
    u = u or {}
    return _num(u.get("input_tokens")) + _num(u.get("output_tokens")) + _num(u.get("cache_creation_input_tokens")) \
        + CACHE_READ_W * _num(u.get("cache_read_input_tokens"))

def known_prompts():
    try:
        import recover as RC
        return {"inbox": RC.INBOX_PROMPT, "orchestrator": RC.ORCH_PROMPT, "inspector": RC.INSPECTOR_PROMPT, "executor": RC.EXECUTOR_PROMPT}
    except Exception: return {}

def classify(first_prompt, known):
    """Pure: the first user prompt -> a control session name or 'other' (equality or prefix only)."""
    p = (first_prompt or "").strip()
    for name, k in known.items():
        k = k.strip()
        if p and (p == k or p.startswith(k) or k.startswith(p)): return name
    return "other"

def _first_text(msg):
    c = (msg or {}).get("content")
    if isinstance(c, str): return c
    if isinstance(c, list):
        for b in c:
            if isinstance(b, dict) and isinstance(b.get("text"), str): return b["text"]
    return ""

def parse_transcript(path):
    """-> (first user prompt text [for classify only, never stored], [ {ts, model, effort, tokens} ]); one row per message.id."""
    first, seen, rows = None, set(), []
    try: lines = Path(path).read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError: return "", []
    for l in lines:
        try: d = json.loads(l)
        except ValueError: continue
        if not isinstance(d, dict): continue
        if d.get("type") == "user" and first is None: first = _first_text(d.get("message"))
        if d.get("type") != "assistant": continue
        m = d.get("message") or {}
        mid = m.get("id")
        if mid is not None:
            if mid in seen: continue
            seen.add(mid)
        rows.append({"ts": _ts(d.get("timestamp")), "model": m.get("model") or "", "effort": d.get("effort") or "", "tokens": usage_tokens(m.get("usage"))})
    return first or "", rows

def _ts(v):
    if isinstance(v, (int, float)): return float(v)
    try:
        import calendar
        return float(calendar.timegm(time.strptime(str(v)[:19], "%Y-%m-%dT%H:%M:%S")))
    except Exception: return 0.0

def transcript_rows(root, since, known=None):
    """All transcripts under root (a ~/.claude/projects folder or its parent) -> [ {entity, model, effort, tokens, ts} ] newer than since."""
    known, out = known if known is not None else known_prompts(), []
    for f in Path(root).rglob("*.jsonl"):
        if f.parent.name == "subagents": continue
        try:
            if f.stat().st_mtime < since: continue
        except OSError: continue
        first, rows = parse_transcript(f)
        ent = classify(first, known)
        out += [{**r, "entity": ent} for r in rows]
        for sf in (f.parent / f.stem / "subagents").glob("agent-*.jsonl") if (f.parent / f.stem / "subagents").is_dir() else ():
            meta = {}
            try: meta = json.loads(sf.with_suffix(".meta.json").read_text(encoding="utf-8"))
            except Exception: pass
            _, srows = parse_transcript(sf)
            kind = re.sub(r"[^A-Za-z0-9_-]", "", str(meta.get("agentType") or "agent"))[:30]
            out += [{**r, "model": r["model"] or str(meta.get("model") or ""), "entity": f"{ent}/sub:{kind}"} for r in srows]
    return [r for r in out if r["ts"] >= since]

def record_headless(entity, model, usage=None, cost=None, now=None):
    """Append one numeric line for a `claude -p --output-format json` call (never raises)."""
    try:
        RUNS.mkdir(exist_ok=True)
        with open(RUNS / "usage_headless.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps({"ts": int(now or time.time()), "entity": entity, "model": model or "", "tokens": usage_tokens(usage),
                                "cost": _num(cost)}) + "\n")
    except Exception: pass

def _jsonl(name, since=0):
    out = []
    try:
        for l in (RUNS / name).read_text(encoding="utf-8").splitlines():
            try: d = json.loads(l)
            except ValueError: continue
            if isinstance(d, dict) and d.get("ts", d.get("at", 0)) >= since: out.append(d)
    except OSError: pass
    return out

def headless_rows(since):
    return [{"entity": str(d.get("entity")), "model": d.get("model", ""), "effort": "", "tokens": _num(d.get("tokens")), "ts": d["ts"]}
            for d in _jsonl("usage_headless.jsonl", since)]

def cloud_rows(events, since):
    """Pure: stats.jsonl events -> proxy rows by run-minutes. start->worker_done = worker, worker_done->review_* = reviewer,
    review_fix->worker_done = fix. A row: {entity '#n worker|reviewer|fix', issue, model, minutes, tokens, proxy, merged}."""
    per, out = {}, []
    for e in sorted((e for e in events if isinstance(e, dict) and "ts" in e and "issue" in e), key=lambda e: e["ts"]):
        n, ev, ts = e["issue"], e.get("event"), e["ts"]
        st = per.setdefault(n, {"at": None, "role": None, "model": "sonnet"})
        mdl = e.get("model") or st["model"]
        def close(role):
            if st["at"] is not None and ts >= since and ts > st["at"]:
                mins = (ts - st["at"]) / 60
                out.append({"entity": f"#{n} {role}", "issue": n, "model": mdl, "effort": "", "minutes": round(mins, 2),
                            "tokens": mins * PROXY_TOK_PER_MIN * weight(mdl), "proxy": True, "ts": ts})
            st["at"] = None
        if ev == "start": st.update(at=ts, role="worker", model=mdl)
        elif ev == "worker_done": close(st["role"] or "worker"); st.update(at=ts, role="reviewer")
        elif ev in ("review_pass", "review_fix"): close("reviewer"); st.update(at=ts if ev == "review_fix" else None, role="fix")
        elif ev in ("merged", "parked", "blocked"): st["at"] = None
        if ev == "merged" and ts >= since: out.append({"entity": f"#{n} merged", "issue": n, "model": mdl, "effort": "", "minutes": 0, "tokens": 0, "proxy": True, "ts": ts, "merged": 1})
    return out

def week_burn(hist, now, hours=24):
    """Pure: week-% burned in the last `hours` from usage_hist samples with a `week` field (a reset inside the period: last value)."""
    ws = [(h["at"], h["week"]) for h in hist if isinstance(h.get("week"), (int, float)) and h.get("at", 0) >= now - hours * 3600]
    if len(ws) < 2: return None
    ws.sort(); d = ws[-1][1] - ws[0][1]
    return d if d >= 0 else ws[-1][1]

def build(rows, wk, day="", now=None):
    """Pure: raw rows -> the table. Rows are grouped by (entity, model, effort); shares are of the day's total units
    (units = tokens x model weight; proxy rows already carry their weight); week share = day share x wk (None when wk unknown)."""
    now = now or time.time()
    units = lambda r: r["tokens"] * (1.0 if r.get("proxy") else weight(r["model"]))
    tot = sum(units(r) for r in rows) or 1.0
    g = {}
    for r in rows:
        k = (r["entity"], r.get("model") or "", r.get("effort") or "")
        a = g.setdefault(k, {"entity": k[0], "model": k[1], "effort": k[2], "tokens": 0.0, "minutes": 0.0, "units": 0.0, "runs": 0,
                             "merged": 0, "proxy": bool(r.get("proxy")), "issue": r.get("issue")})
        a["tokens"] += r["tokens"]; a["minutes"] += r.get("minutes", 0) or 0; a["units"] += units(r)
        a["runs"] += 0 if r.get("merged") else 1; a["merged"] += r.get("merged", 0)
    out, iw = [], {}      # iw: an issue's whole week share (all its rows), the base of "merged PRs per 1% of the week"
    for a in g.values():
        if a["issue"] is not None and wk is not None: iw[a["issue"]] = iw.get(a["issue"], 0.0) + 100 * a["units"] / tot * wk / 100
    for a in sorted(g.values(), key=lambda a: -a["units"]):
        day_pct = 100 * a["units"] / tot
        wk_pct = None if wk is None else day_pct * wk / 100
        out.append({"entity": a["entity"], "model": a["model"], "effort": a["effort"], "tokens": round(a["tokens"]),
                    **({"minutes": round(a["minutes"], 1), "proxy": True} if a["proxy"] else {}),
                    "issue": a["issue"], "day_pct": round(day_pct, 2), "week_pct": None if wk_pct is None else round(wk_pct, 3),
                    "runs": a["runs"], "merged_per_week_pct": round(a["merged"] / iw[a["issue"]], 2) if a["merged"] and iw.get(a["issue"]) else None})
    return out

def entity_totals(rows):
    """Pure: -> ({entity: day %} for non-issue entities, {issue: (day %, week % or None)})."""
    ents, iss = {}, {}
    for r in rows:
        if r.get("issue") is not None:
            d, w = iss.get(r["issue"], (0.0, None))
            iss[r["issue"]] = (d + r["day_pct"], None if r["week_pct"] is None and w is None else (w or 0) + (r["week_pct"] or 0))
        else:
            ents[r["entity"]] = ents.get(r["entity"], 0.0) + r["day_pct"]
    return ents, iss

def alarms(rows, sent, now):
    """Pure: -> ([alarm text], new sent {key: ts}). orchestrator > 15% of the day, another control session > 10%, the AI governor
    step > 3%, one issue > 5% of the week. Every alarm names the entity, its share and one fix; the same key again only after 3 h."""
    ents, iss = entity_totals(rows)
    hits = []
    for e, p in ents.items():
        base = e.split("/")[0]
        if base == "orchestrator" and p > LIMITS["orchestrator"]: hits.append((e, f"{p:.1f}% of the day (limit {LIMITS['orchestrator']:.0f}%)", FIX["orchestrator"]))
        elif base in CONTROL and base != "orchestrator" and p > LIMITS["control"]: hits.append((e, f"{p:.1f}% of the day (limit {LIMITS['control']:.0f}%)", FIX["control"]))
        elif base == "governor" and p > LIMITS["governor"]: hits.append((e, f"{p:.1f}% of the day (limit {LIMITS['governor']:.0f}%)", FIX["governor"]))
    for n, (d, w) in iss.items():
        if w is not None and w > ISSUE_WEEK_LIMIT: hits.append((f"#{n}", f"{w:.1f}% of the week (limit {ISSUE_WEEK_LIMIT:.0f}%)", FIX["issue"]))
    new, texts = dict(sent), []
    for key, what, fix in hits:
        if now - sent.get(key, 0) < ALARM_EVERY_H * 3600: continue
        new[key] = now; texts.append(f"ENTITY {key} takes {what}. Fix: {fix}.")
    return texts, new

def usage_line(rows, n=5):
    """Pure: the nightly `USAGE:` line, top n entities (an entity's rows summed)."""
    ents = {}
    for r in rows: ents[r["entity"]] = ents.get(r["entity"], 0.0) + r["day_pct"]
    top = sorted(ents.items(), key=lambda kv: -kv[1])[:n]
    return "USAGE: " + (" · ".join(f"{e} {p:.0f}%" for e, p in top) if top else "no data")

def text(table, n=8):
    """Dashboard lines for the table (top n rows)."""
    if not table or not table.get("rows"): return ""
    lines = [f"Usage per entity ({table.get('day', '')}; share of the day / week; proxy = cloud run-minutes, not tokens):"]
    for r in table["rows"][:n]:
        amt = f"{r['minutes']:.0f} min proxy" if r.get("proxy") else f"{r['tokens'] / 1000:.0f}k tok"
        wk = "-" if r["week_pct"] is None else f"{r['week_pct']:.2f}%"
        lines.append(f"  {r['entity'][:34]:34} {r['model'][:8]:8} {r['effort'][:6]:6} {amt:>14} · day {r['day_pct']:.1f}% · week {wk} · runs {r['runs']}")
    if table.get("attention"): lines.append("NEEDS-ATTENTION: " + " · ".join(table["attention"]))
    return "\n".join(lines)

def load():
    try: return json.loads((RUNS / OUT_NAME).read_text(encoding="utf-8"))
    except Exception: return None

def projects_root():
    return Path(os.environ.get("CLAUDE_PROJECTS") or Path.home() / ".claude" / "projects")

def compute(now=None, root=None, known=None):
    """Read everything for the last 24 h -> the table dict (not written)."""
    now = now or time.time(); since = now - 86400
    raw = []
    try: raw += transcript_rows(root or projects_root(), since, known)
    except Exception: pass
    raw += headless_rows(since) + cloud_rows(_jsonl("stats.jsonl", since - 86400), since)
    rows = build(raw, week_burn(_jsonl("usage_hist.jsonl"), now), now=now)
    return {"day": time.strftime("%Y-%m-%d", time.localtime(now)), "rows": rows, "attention": [], "at": now}

def tick(tell=print, log=print, now=None, send=None, **kw):
    """Watchdog hook: write the table, send the due alarms (watchdog tell + Telegram) and keep them as NEEDS-ATTENTION."""
    now = now or time.time()
    t = compute(now, **kw)
    try: sent = json.loads((RUNS / "usage_alarm.json").read_text(encoding="utf-8"))
    except Exception: sent = {}
    texts, sent = alarms(t["rows"], sent, now)
    t["attention"] = [k for k, v in sent.items() if now - v < ALARM_EVERY_H * 3600]
    try:
        RUNS.mkdir(exist_ok=True)
        (RUNS / OUT_NAME).write_text(json.dumps(t), encoding="utf-8")
        (RUNS / "usage_alarm.json").write_text(json.dumps(sent), encoding="utf-8")
    except OSError as e: log(f"usage table not saved: {e!r}")
    for x in texts:
        tell("ALARM (usage): " + x)
        try:
            (send or __import__("telegram").send)("ALARM (usage): " + x)
        except Exception: pass
    return t

if __name__ == "__main__":
    t = tick(now=None) if "--write" in sys.argv else compute()
    print(text(t)); print(usage_line(t["rows"]))
