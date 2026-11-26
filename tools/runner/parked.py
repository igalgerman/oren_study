"""#282 nothing put aside is forgotten (owner: no stuck issues, labels manual/later must not hide work). Run by the watchdog, hourly:
1. Batch members (no ready-for-agent on purpose) are safe only while their batch issue is open + ready-for-agent (or running).
   A batch issue closed while a member stays open -> the member gets ready-for-agent back (comment) and the orchestrator is told.
2. Rolling polish lists ('Polish backlog (<lane>)') become ready-for-agent (P3, with an Acceptance section) at 5 notes
   or when the oldest note is 24 h old, whichever comes first.
3. Alarm: an issue labelled later or manual for 2 h+ with no open owner question (owner_q) and no live run/PR
   -> 'parked without owner question: #n' to the orchestrator (the same issue at most once an hour).
   'Later until: <date>' in the body counts until that date.
4. Night report (once a day at retro_hour): every open issue that is not ready-for-agent with its reason; no reason = alarm.
Batch membership is read from the batch issues themselves (title 'Batch: ... (#a, #b)' and '- [ ] #a' lines), so no comments are needed.
Usage: python tools/runner/parked.py   (print the night report now)"""
import calendar, json, re, sys, time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import runner as R

STATE = R.RUNS / "parked.json"
PARK_H, EVERY_S, POLISH_NOTES, POLISH_H = 2, 3600, 5, 24
REPORT_HOUR = int(R.CFG.get("retro_hour", 23)) or 23
QUESTIONS_TITLE = "Questions for the owner"
MEMBER_RE = re.compile(r"(?m)^\s*[-*]\s*\[[ xX]\]\s*#(\d+)")
NOTE_RE = re.compile(r"(?m)^\s*-\s.*\(PR #\d+\)\s*$")
UNTIL_RE = re.compile(r"(?im)^\s*later until:?\s*(\d{4}-\d\d-\d\d)")
DUE_RE = re.compile(r"(?im)^\s*due:?\s*(\d{4}-\d\d-\d\d)")

def _ts(iso):
    try: return calendar.timegm(time.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S")) if iso else None
    except (TypeError, ValueError): return None

def _day(s):
    try: return time.mktime(time.strptime(s, "%Y-%m-%d"))
    except (TypeError, ValueError): return None

def is_batch(i): return (i.get("title") or "").startswith("Batch:")
def is_polish(i): return bool(re.match(r"Polish backlog \(\w+\)$", i.get("title") or ""))

def batch_members(issues):
    """Pure: {member: batch number} from every batch issue (open and closed); the newest batch wins."""
    out = {}
    for b in sorted((i for i in issues if is_batch(i)), key=lambda i: i["number"]):
        for m in {int(x) for x in re.findall(r"#(\d+)", b["title"])} | {int(x) for x in MEMBER_RE.findall(b.get("body") or "")}:
            if m != b["number"]: out[m] = b["number"]
    return out

def batch_ok(b):
    return b.get("state") == "OPEN" and bool({"ready-for-agent", "in-progress"} & set(b["labels"]))

def broken_members(issues):
    """Pure: [(member, batch)] open members, not ready-for-agent, whose batch issue is closed."""
    by_n, mem = {i["number"]: i for i in issues}, batch_members(issues)
    return [(n, b) for n, b in sorted(mem.items()) if n in by_n and by_n[n]["state"] == "OPEN" and b in by_n
            and by_n[b]["state"] == "CLOSED" and not {"ready-for-agent", "in-progress"} & set(by_n[n]["labels"])]

def question_for(n, qs):
    """The open owner question about issue n (window '#n', 'issue-n', 'review-n', ...) or None."""
    return next((q for q in qs or [] if re.fullmatch(rf"(?:#|[a-z]+-){n}", q.get("window") or "")), None)

def pr_for(n, prs):
    return next((p for p in prs or [] if p.get("headRefName") == f"lane/{n}"
                 or re.search(rf"(?i)\b(?:closes|fixes|resolves)\s+#{n}\b", p.get("body") or "")), None)

def _live(i, qs, prs, now):
    """Why a parked (manual/later) issue is not forgotten, or None."""
    n, L = i["number"], set(i["labels"])
    kind = "manual" if "manual" in L else "later"
    if is_polish(i): return "polish list (ready at 5 notes or 24 h)"
    q = question_for(n, qs)
    if q: return f"{kind}, waiting for owner question {q['key']}"
    p = pr_for(n, prs)
    if p: return f"{kind}, PR #{p['number']} open"
    if "in-progress" in L: return f"{kind}, running"
    m = UNTIL_RE.search(i.get("body") or "")
    if m and (_day(m[1]) or 0) > now: return f"later until {m[1]}"
    return None

def reason_of(i, mem, by_n, qs, prs, now):
    """Pure: the reason an open, not ready-for-agent issue waits (None = forgotten)."""
    n, L, body = i["number"], set(i["labels"]), i.get("body") or ""
    if n in mem:
        b = by_n.get(mem[n])
        return f"batch #{mem[n]}" if b and batch_ok(b) else None
    if L & {"manual", "later"} or is_polish(i): return _live(i, qs, prs, now)
    if (i.get("title") or "") == QUESTIONS_TITLE: return "owner questions issue"
    if "retro" in L: return "retro (orchestrator)"
    q = question_for(n, qs)
    if q: return f"waiting for owner question {q['key']}"
    m = DUE_RE.search(body)
    if m: return f"due {m[1]}"
    p = pr_for(n, prs)
    if p: return f"PR #{p['number']} open"
    bl = [b for b in R.blockers(body) if b != n and by_n.get(b, {}).get("state") == "OPEN"]
    if bl: return "waits for " + ", ".join(f"#{b}" for b in bl)
    if "ready-for-human" in L: return "waits for the owner (ready-for-human)"
    if L & {"needs-triage", "needs-info"}: return "new, waits for triage"
    if "blocked" in L: return "blocked (orchestrator)"
    return None

def reasons(issues, qs, prs, now):
    """Pure: [{n, title, reason}] for every open issue that is not ready-for-agent and not running."""
    by_n, mem = {i["number"]: i for i in issues}, batch_members(issues)
    return [{"n": i["number"], "title": i["title"], "reason": reason_of(i, mem, by_n, qs, prs, now)}
            for i in sorted(issues, key=lambda i: i["number"])
            if i["state"] == "OPEN" and not {"ready-for-agent", "in-progress"} & set(i["labels"])]

def night_report(rs):
    bad, ok = [r for r in rs if r["reason"] is None], [r for r in rs if r["reason"]]
    head = (f"NIGHT REPORT (#282): {len(bad)} open issues have NO reason (alarm): " + ", ".join(f"#{r['n']} {r['title'][:50]}" for r in bad)
            if bad else "NIGHT REPORT (#282): every open issue that is not ready-for-agent has a reason")
    return head + (" | with a reason: " + "; ".join(f"#{r['n']} {r['title'][:40]}: {r['reason']}" for r in ok) if ok else "")

def parked_alarms(issues, qs, prs, now, st):
    """Pure (state in st['seen'] / st['sent']): -> alarm texts for later/manual issues parked 2 h+ with nothing alive."""
    seen, sent, out = st.setdefault("seen", {}), st.setdefault("sent", {}), []
    cur = {str(i["number"]): i for i in issues if i.get("state", "OPEN") == "OPEN" and {"manual", "later"} & set(i["labels"])}
    for k in list(seen):
        if k not in cur: seen.pop(k); sent.pop(k, None)
    for k, i in sorted(cur.items(), key=lambda x: int(x[0])):
        seen.setdefault(k, now)
        if now - seen[k] < PARK_H * 3600 or _live(i, qs, prs, now): continue
        if now - sent.get(k, 0) < EVERY_S - 60: continue
        sent[k] = now; out.append(f"parked without owner question: #{k}")
    return out

def polish_notes(i):
    """Pure: (number of notes, epoch of the oldest note) on a rolling polish issue (body + comments)."""
    count, oldest = len(NOTE_RE.findall(i.get("body") or "")), _ts(i.get("createdAt")) if NOTE_RE.search(i.get("body") or "") else None
    for c in i.get("comments") or []:
        k = len(NOTE_RE.findall(c.get("body") or ""))
        if k:
            count += k; t = _ts(c.get("createdAt"))
            oldest = t if oldest is None else min(oldest, t or oldest)
    return count, oldest

def polish_due(i, now):
    """Pure: why the polish list is due now ('5 notes' / 'oldest note 24 h old') or None."""
    if {"ready-for-agent", "in-progress"} & set(i["labels"]): return None
    count, oldest = polish_notes(i)
    if count >= POLISH_NOTES: return f"{POLISH_NOTES} notes"
    if oldest and now - oldest >= POLISH_H * 3600: return f"oldest note {POLISH_H} h old"
    return None

POLISH_ACCEPT = ("\n\n## Acceptance\n- Every note line above (body and comments) is done, or answered in the PR why not.\n"
                 "- All suites green; ONE PR with `Closes #{n}`.\n- Out of scope: anything not on this list.\n")

def _labels(i): return [l["name"] if isinstance(l, dict) else l for l in i.get("labels") or []]

def load():
    try: return json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError): return {}

def save(st):
    try: STATE.parent.mkdir(exist_ok=True); STATE.write_text(json.dumps(st), encoding="utf-8")
    except OSError: pass

def tick(tell, log, gh=None, questions=None, now=None):
    """Watchdog hook (hourly): restore broken batch members, promote due polish lists, parked alarms, the night report."""
    gh, now = gh or R.gh, time.time() if now is None else now
    st = load()
    if now - st.get("at", 0) < EVERY_S - 60: return
    rc, out = gh("issue", "list", "--state", "all", "--limit", "500", "--json", "number,title,state,labels,body,createdAt,updatedAt")
    rc2, out2 = gh("pr", "list", "--state", "open", "--json", "number,headRefName,body,title")
    if rc or rc2: log(f"parked: gh failed: {(out if rc else out2)[:150]}"); return
    try: issues, prs = [{**i, "labels": _labels(i)} for i in json.loads(out)], json.loads(out2)
    except ValueError: log("parked: unreadable gh output"); return
    if questions is None:
        import owner_q; questions = owner_q.open_list
    qs = questions()
    if qs is None: log("parked: owner questions unreadable"); return
    st["at"] = now
    news = []
    for n, b in broken_members(issues):
        gh("issue", "edit", str(n), "--add-label", "ready-for-agent")
        gh("issue", "comment", str(n), "--body", f"Batch #{b} is closed but this member is still open: `ready-for-agent` is back (#282).")
        news.append(f"#{n} (batch #{b} is closed): ready-for-agent again")
    for p in (i for i in issues if i["state"] == "OPEN" and is_polish(i) and not {"ready-for-agent", "in-progress"} & set(i["labels"])):
        rc, o = gh("issue", "view", str(p["number"]), "--json", "number,title,labels,body,createdAt,comments")
        try: full = {**json.loads(o), "labels": p["labels"]} if not rc else None
        except ValueError: full = None
        why = full and polish_due(full, now)
        if not why: continue
        body = (full.get("body") or "") + ("" if R.has_acceptance(full.get("body")) else POLISH_ACCEPT.format(n=p["number"]))
        args = ["issue", "edit", str(p["number"]), "--add-label", "ready-for-agent", "--body", body]
        if not any(x in p["labels"] for x in ("P0", "P1", "P2", "P3")): args[4:4] = ["--add-label", "P3"]
        gh(*args)
        gh("issue", "comment", str(p["number"]), "--body", f"Polish list due ({why}): ready-for-agent (#282).")
        news.append(f"#{p['number']} polish list ready ({why})")
    al = parked_alarms(issues, qs, prs, now, st)
    lt = time.localtime(now)
    day = time.strftime("%Y-%m-%d", lt)
    rep = None
    if lt.tm_hour >= REPORT_HOUR and st.get("report_day") != day:
        st["report_day"] = day; rep = night_report(reasons(issues, qs, prs, now))
    save(st)
    if news or al: tell("PARKED (watchdog #282): " + " · ".join(news + al)); log("parked: " + " · ".join(news + al))
    if rep: tell(rep); log(rep[:300])

def main():
    rc, out = R.gh("issue", "list", "--state", "all", "--limit", "500", "--json", "number,title,state,labels,body")
    rc2, out2 = R.gh("pr", "list", "--state", "open", "--json", "number,headRefName,body,title")
    if rc or rc2: print("gh failed"); return 1
    import owner_q
    print(night_report(reasons([{**i, "labels": _labels(i)} for i in json.loads(out)], owner_q.open_list() or [], json.loads(out2), time.time())))
    return 0

if __name__ == "__main__":
    sys.exit(main())
