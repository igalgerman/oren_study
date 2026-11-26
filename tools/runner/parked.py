"""#282 nothing put aside is forgotten. Issues without ready-for-agent on purpose (batch members, labels manual/later,
the rolling polish lists) each need a reason; the watchdog checks them once an hour, the nightly job lists them once a day.
- Batch members ('In batch #N', from the batch issue's title/member list) are safe only while their batch is open and
  ready-for-agent (or running). Batch closed while a member stays open -> the member gets ready-for-agent back.
- later/manual for PARK_H+ with no open owner question, no live run/PR and no future 'until/due YYYY-MM-DD' date -> alarm.
- 'Polish backlog (<lane>)' becomes ready-for-agent (P3) at POLISH_MAX notes or when the oldest note is POLISH_H old.
Pure functions take gh JSON with labels as names; tick() does the side effects through an injected gh."""
import calendar, json, re, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import runner as R

PARK_H, POLISH_MAX, POLISH_H, EVERY_S = 2, 5, 24, 3600
OWNER_Q_TITLE = "Questions for the owner"
DATE_RE = re.compile(r"(?i)\b(?:until|due)\b[:\s]+(\d{4}-\d{2}-\d{2})")

def epoch(s):
    try: return calendar.timegm(time.strptime(s[:19], "%Y-%m-%dT%H:%M:%S"))
    except (TypeError, ValueError): return None

def iso(t): return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))

def is_batch(i): return (i.get("title") or "").startswith("Batch:")
def is_polish(i): return (i.get("title") or "").startswith("Polish backlog (")

def members(b):
    """Member numbers of a batch issue: the '(#a, #b)' in its title + its '- [ ] #n' list lines."""
    t = re.search(r"\(([^)]*)\)\s*$", b.get("title") or "")
    out = {int(x) for x in re.findall(r"#(\d+)", t[1])} if t else set()
    out |= {int(x) for x in re.findall(r"(?m)^\s*-\s*\[[ xX]\]\s*#(\d+)", b.get("body") or "")}
    return out

def batch_map(issues):
    """member number -> its batch issue (the newest batch that lists it)."""
    out = {}
    for b in sorted((i for i in issues if is_batch(i)), key=lambda i: i["number"]):
        for n in members(b) - {b["number"]}: out[n] = b
    return out

def batch_safe(b):
    return b is not None and b["state"] == "OPEN" and bool({"ready-for-agent", "in-progress"} & set(b["labels"]))

def kind(i, bm):
    """Dashboard bucket of a not-started issue: 'batch' (member of a safe batch), 'manual', 'later', or None."""
    L = set(i["labels"])
    if batch_safe(bm.get(i["number"])): return "batch"
    if "manual" in L: return "manual"
    if "later" in L: return "later"
    return None

def orphans(issues, bm):
    """[(member, batch)]: the batch is closed, the member is still open and has no ready-for-agent."""
    return [(i["number"], bm[i["number"]]["number"]) for i in issues
            if i["state"] == "OPEN" and i["number"] in bm and bm[i["number"]]["state"] == "CLOSED"
            and not {"ready-for-agent", "in-progress"} & set(i["labels"])]

def pr_of(n, prs):
    """The open PR for issue n: head lane/<n>, or 'Closes/Fixes #n' in its title/body."""
    pat = re.compile(rf"(?i)\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#{n}\b")
    return next((p["number"] for p in prs if p.get("headRefName") == f"lane/{n}" or pat.search((p.get("title") or "") + "\n" + (p.get("body") or ""))), None)

def date_of(i):
    m = DATE_RE.search(i.get("body") or "")
    return m[1] if m else None

def _open(issues): return [i for i in issues if i["state"] == "OPEN"]

def parked_alarms(issues, prs, qs, now, hours=PARK_H):
    """-> [(key, text)] for later/manual issues untouched for `hours` with no owner question, no live run/PR, no future date."""
    out = []
    for i in _open(issues):
        L, n = set(i["labels"]), i["number"]
        if not L & {"later", "manual"} or is_polish(i) or i.get("title") == OWNER_Q_TITLE: continue
        if n in qs or "in-progress" in L or pr_of(n, prs): continue
        if (now - (epoch(i.get("updatedAt")) or now)) / 3600 < hours: continue
        d = date_of(i)
        if d and d >= time.strftime("%Y-%m-%d", time.gmtime(now)): continue
        out.append((f"pk{n}", f"parked without owner question: #{n}" + (f" (date passed: {d})" if d else "")))
    return out

def polish_notes(i, comments):
    """Epoch of every note ('- ' line) of a rolling polish list: body lines at the issue's creation, comment lines at the comment's."""
    lines = lambda t: sum(1 for l in (t or "").splitlines() if l.startswith("- "))
    out = [epoch(i.get("createdAt"))] * lines(i.get("body"))
    for c in comments: out += [epoch(c.get("created_at") or c.get("createdAt"))] * lines(c.get("body"))
    return [t for t in out if t]

def polish_due(i, comments, now):
    if i["state"] != "OPEN" or not is_polish(i) or "ready-for-agent" in i["labels"]: return False
    ts = polish_notes(i, comments)
    return len(ts) >= POLISH_MAX or bool(ts) and now - min(ts) >= POLISH_H * 3600

def with_acceptance(body):
    """The runner starts no issue without an Acceptance section (#186): add a short one to a polish list."""
    if R.has_acceptance(body): return body
    return (body or "").rstrip() + ("\n\n## Acceptance\n- Every note in this issue and its comments is done, in ONE PR.\n- All suites green.\n"
                                    "Out of scope: anything not in the notes.\n")

def reason(i, issues, prs, qs, bm, now):
    """Why an open issue without ready-for-agent is not forgotten, or None (= alarm)."""
    L, n = set(i["labels"]), i["number"]
    open_nums = {x["number"] for x in _open(issues)}
    if "in-progress" in L: return "running"
    p = pr_of(n, prs)
    if p: return f"PR #{p}"
    if batch_safe(bm.get(n)): return f"batch #{bm[n]['number']}"
    if i.get("title") == OWNER_Q_TITLE: return "owner questions list"
    if is_polish(i): return f"polish list (ready at {POLISH_MAX} notes or {POLISH_H} h)"
    if n in qs: return ("manual, " if "manual" in L else "later, " if "later" in L else "") + "waiting for owner question"
    d = date_of(i)
    if d and d >= time.strftime("%Y-%m-%d", time.gmtime(now)): return ("later until " if "later" in L else "due ") + d
    bl = [b for b in R.blockers(i.get("body")) if b in open_nums and b != n]
    if bl: return "waits for " + ", ".join(f"#{b}" for b in bl)
    if "blocked" in L and "needs-orchestrator" in L: return "blocked (needs-orchestrator)"
    if "retro" in L: return "retro proposals (orchestrator)"
    return None

def reasons(issues, prs, qs, now):
    bm = batch_map(issues)
    return [(i["number"], reason(i, issues, prs, qs, bm, now)) for i in sorted(_open(issues), key=lambda i: i["number"])
            if "ready-for-agent" not in i["labels"]]

def night_report(issues, prs, qs, now):
    rs = reasons(issues, prs, qs, now)
    ok = "; ".join(f"#{n} {r}" for n, r in rs if r) or "-"
    bad = [n for n, r in rs if not r]
    return f"NIGHT REPORT (#282): {len(rs)} open issue(s) not ready-for-agent: {ok}" + (" · ALARM no reason: " + " ".join(f"#{n}" for n in bad) if bad else "")

# ---------- side effects ----------
def owner_q_issues():
    """Issue numbers that have an open owner question (#193), or None when it cannot be read."""
    import owner_q
    qs = owner_q.open_list()
    if qs is None: return None
    return {int(r[1:]) for r in (owner_q.issue_ref(q.get("window") or q.get("source")) for q in qs) if r}

def fetch(gh):
    rc, out = gh("issue", "list", "--state", "all", "--limit", "1000", "--json", "number,title,state,labels,body,createdAt,updatedAt")
    rc2, out2 = gh("pr", "list", "--state", "open", "--limit", "200", "--json", "number,title,body,headRefName")
    if rc or rc2: return None
    return [{**i, "labels": [l["name"] if isinstance(l, dict) else l for l in i["labels"]]} for i in json.loads(out)], json.loads(out2)

def tick(gh=None, tell=print, log=print, now=None, questions=owner_q_issues, st=None):
    """Watchdog, once an hour: orphaned batch members and due polish lists get ready-for-agent; parked issues -> ONE note
    to the orchestrator. Any gh error: nothing is done."""
    gh, now, st = gh or R.gh, now or time.time(), _st if st is None else st
    if now - st.get("at", 0) < EVERY_S: return None
    st["at"] = now
    got, qs = fetch(gh), questions()
    if got is None or qs is None: log("parked: GitHub unreadable"); return None
    issues, prs = got
    notes = []
    bm = batch_map(issues)
    for n, b in orphans(issues, bm):
        gh("issue", "edit", str(n), "--add-label", "ready-for-agent")
        gh("issue", "comment", str(n), "--body", f"Batch #{b} closed while this issue stayed open: ready-for-agent is back (#282).")
        notes.append(f"#{n} back to ready-for-agent (batch #{b} closed)")
    for i in _open(issues):
        if not is_polish(i) or "ready-for-agent" in i["labels"]: continue
        rc, out = gh("api", f"repos/{R.REPO}/issues/{i['number']}/comments?per_page=100")
        if rc or not polish_due(i, json.loads(out or "[]"), now): continue
        gh("issue", "edit", str(i["number"]), "--add-label", "ready-for-agent", "--add-label", "P3", "--remove-label", "later", "--body", with_acceptance(i.get("body")))
        notes.append(f"#{i['number']} polish list is ready-for-agent (P3)")
    notes += [t for _, t in parked_alarms(issues, prs, qs, now)]
    if notes:
        tell("PARKED (watchdog, #282): " + " · ".join(notes)); log("parked: " + " · ".join(notes))
    return notes

_st = {}
