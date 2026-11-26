"""Trend watcher (#155): patterns over the last 24 h that no single snapshot shows. Deterministic, no LLM.
Hourly from the watchdog (trends.tick()); also: python3 tools/runner/trends.py --text (prints, acts on nothing).
- the same BLOCKED reason >= REPEAT times -> one 'Repeated runner failure: <reason>' issue (comment if it exists; <= NEW_PER_DAY new a day)
- runner finish rate, review fix rate, open issues without a P-level -> orchestrator alarm (each at most once per ALARM_HOURS)"""
import json, re, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import runner as R
import stats as S

REPEAT, NEW_PER_DAY, ALARM_HOURS, EVERY_MIN = 3, 2, 6, 60
MIN_STARTS, FINISH_MIN, MIN_REVIEWS, FIX_MAX, NOPRIO_MAX = 5, 0.5, 5, 0.4, 5
TITLE = "Repeated runner failure: "
STATE = R.RUNS / "trends.state.json"
LINE = re.compile(r"^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) #(\d+): BLOCKED: (.*)$")

def reason_key(why):
    """'runner error FileNotFoundError(2, ...)' / 'integrate.sh exit 4' -> a short stable key (issue numbers and long tails removed)."""
    k = re.sub(r"#\d+", "#n", why)
    k = re.sub(r"\(.*", "", k) if k.startswith("runner error") else k
    k = re.sub(r"RESULT: STUCK\s*", "worker STUCK: ", k)
    return k.strip()[:60]

def blocked_lines(log_text, since):
    out = []
    for l in log_text.splitlines():
        m = LINE.match(l)
        if m and time.mktime(time.strptime(m.group(1), "%Y-%m-%d %H:%M:%S")) >= since:
            out.append((int(m.group(2)), reason_key(m.group(3))))
    return out

def findings(log_text, events, open_issues, now):
    """Pure -> {'repeats': {key: [issue numbers]}, 'alarms': [(key, text)], 'summary': str}."""
    since = now - 86400
    rep = {}
    for n, k in blocked_lines(log_text, since):
        if n not in rep.setdefault(k, []): rep[k].append(n)          # distinct issues: one issue retried is not a pattern
    repeats = {k: ns for k, ns in rep.items() if len(ns) >= REPEAT}
    ev = [e for e in events if e.get("ts", 0) >= since]
    starts = {e["issue"] for e in ev if e.get("event") == "start"}
    merged = {e["issue"] for e in ev if e.get("event") == "merged"}
    fixes = sum(e.get("event") == "review_fix" for e in ev); passes = sum(e.get("event") == "review_pass" for e in ev)
    noprio = [i["number"] for i in open_issues if not any(p in i["labels"] for p in ("P0", "P1", "P2", "P3"))]
    alarms = []
    if len(starts) >= MIN_STARTS and len(merged) / len(starts) < FINISH_MIN:
        alarms.append(("finish", f"runner finished only {len(merged)} of {len(starts)} issues it started in 24 h by itself"))
    if fixes + passes >= MIN_REVIEWS and fixes / (fixes + passes) > FIX_MAX:
        alarms.append(("fix", f"{fixes} of {fixes + passes} reviews in 24 h sent the work back"))
    if len(noprio) > NOPRIO_MAX:
        alarms.append(("noprio", f"{len(noprio)} open issues have no P-level (#{', #'.join(map(str, noprio[:8]))}{' …' if len(noprio) > 8 else ''})"))
    summary = (f"24h: started {len(starts)}, merged by runner {len(merged)}, reviews {passes} pass / {fixes} fix, "
               f"blocked {sum(len(v) for v in rep.values())}" + (", repeated: " + "; ".join(f"{k} x{len(v)}" for k, v in repeats.items()) if repeats else ""))
    return {"repeats": repeats, "alarms": alarms, "summary": summary}

def _load():
    try: return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception: return {"last": 0, "alarm": {}, "new": []}

def act(f, now, st, gh, tell, existing):
    """Side effects with limits. existing = {title: issue number} of open 'Repeated runner failure' issues."""
    st["new"] = [t for t in st.get("new", []) if t > now - 86400]
    if "seen" not in st:                                                  # first run: baseline, old (already fixed) causes are not reopened
        st["seen"] = {k: len(ns) for k, ns in f["repeats"].items()}
        if f["repeats"]: tell("TREND (baseline, no action): " + "; ".join(f"{k} x{len(ns)}" for k, ns in f["repeats"].items()))
    for k, ns in f["repeats"].items():
        if len(ns) - st["seen"].get(k, 0) < (REPEAT if k in st["seen"] else 0): continue   # known pattern: act again only after REPEAT new issues
        st["seen"][k] = len(ns)
        title = TITLE + k
        body = f"Trend watcher (#155): '{k}' blocked {len(ns)} issues in the last 24 h: #{', #'.join(map(str, ns))}. A failure that repeats is real: find the cause, fix it once."
        if title in existing:
            if st.setdefault("commented", {}).get(title, 0) < now - ALARM_HOURS * 3600:
                gh("issue", "comment", str(existing[title]), "--body", body); st["commented"][title] = now
        elif len(st["new"]) < NEW_PER_DAY:
            gh("issue", "create", "--title", title, "--label", "bug,P1,core,needs-orchestrator", "--body", body)
            st["new"].append(now); tell(f"TREND: new issue '{title}' ({len(ns)} times in 24 h)")
    due = [(k, t) for k, t in f["alarms"] if st.setdefault("alarm", {}).get(k, 0) < now - ALARM_HOURS * 3600]
    for k, _ in due: st["alarm"][k] = now
    if due: tell("TREND ALARM: " + " · ".join(t for _, t in due))
    return st

def gather(now):
    log = (R.RUNS / "runner.log").read_text(encoding="utf-8", errors="replace") if (R.RUNS / "runner.log").exists() else ""
    rc, out = R.gh("issue", "list", "--state", "open", "--limit", "300", "--json", "number,title,labels")
    if rc: return None, {}
    iss = [{**i, "labels": [l["name"] for l in i["labels"]]} for i in json.loads(out)]
    existing = {i["title"]: i["number"] for i in iss if i["title"].startswith(TITLE)}
    return findings(log, S.read_events(), [i for i in iss if not i["title"].startswith(TITLE)], now), existing

def tick(tell, log):
    now = time.time(); st = _load()
    if now - st.get("last", 0) < EVERY_MIN * 60: return
    st["last"] = now
    f, existing = gather(now)
    if f is None: return
    log("trends: " + f["summary"])
    st = act(f, now, st, R.gh, tell, existing)
    STATE.write_text(json.dumps(st), encoding="utf-8")

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    f, _ = gather(time.time())
    if f is None: print("could not read GitHub"); sys.exit(1)
    print(f["summary"]); print("\n".join(t for _, t in f["alarms"]) or "no rate alarms")
    for k, ns in f["repeats"].items(): print(f"repeated: {k} x{len(ns)} (#{', #'.join(map(str, ns))})")
