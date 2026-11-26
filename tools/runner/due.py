"""#241 durable reminders: a line 'Due: YYYY-MM-DD HH:MM' (the owner's local time) in an open issue body is a reminder.
The watchdog checks every EVERY_S (one gh issue list). Due time passed and no 'Due reached' comment for that time yet ->
post that comment (so it fires once; the state is on GitHub and survives restarts), tell the orchestrator, and for an
issue labelled `owner` post an owner question (#193), which opens the question popup (#220).
A bad date is ignored. Pure functions take gh JSON with labels as names; tick() does the side effects through an injected gh."""
import json, re, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import runner as R

EVERY_S = 600
DUE_RE = re.compile(r"(?im)^[\s*_>-]*Due:?[*_]*:?\s+(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2})\b")

def due_of(body):
    """-> (text, epoch) of the issue's 'Due:' line, or None (no line / bad date)."""
    m = DUE_RE.search(body or "")
    if not m: return None
    text = " ".join(m[1].split())
    try: return text, time.mktime(time.strptime(text, "%Y-%m-%d %H:%M"))
    except (ValueError, OverflowError): return None

def candidates(issues, now):
    """Open issues whose Due time has passed (whether already reminded is checked on their comments)."""
    return [i for i in issues if i.get("state", "OPEN") == "OPEN" and (d := due_of(i.get("body"))) and d[1] <= now]

def comment_text(due):
    return f"Due reached ({due}). Reminder from the watchdog (#241)."

def reminded(due, comments):
    return any((c.get("body") or "").startswith(f"Due reached ({due})") for c in comments)

def _ask(window, question):
    import owner_q
    return owner_q.post(window, question)

def tick(gh=None, tell=print, log=print, now=None, ask=_ask, st=None):
    """-> [issue numbers reminded now], or None when not run (too soon / gh error)."""
    gh, now, st = gh or R.gh, now or time.time(), _st if st is None else st
    if now - st.get("at", 0) < EVERY_S: return None
    st["at"] = now
    rc, out = gh("issue", "list", "--state", "open", "--limit", "500", "--json", "number,title,state,labels,body")
    if rc: log("due: GitHub unreadable"); return None
    issues = [{**i, "labels": [l["name"] if isinstance(l, dict) else l for l in i["labels"]]} for i in json.loads(out or "[]")]
    done = []
    for i in candidates(issues, now):
        n, due = i["number"], due_of(i["body"])[0]
        rc, out = gh("issue", "view", str(n), "--json", "comments")
        if rc: continue
        if reminded(due, json.loads(out or "{}").get("comments", [])): continue
        if gh("issue", "comment", str(n), "--body", comment_text(due))[0]: continue   # not posted: retried next pass, nobody told yet
        tell(f"DUE REACHED (#241): #{n} {i.get('title', '')} (Due: {due}). Do what it says now.")
        log(f"due: #{n} reminded ({due})")
        if "owner" in i["labels"]: ask(f"#{n}", f"QUESTION: תזכורת: הגיע הזמן ({due}) - {i.get('title', '')}")
        done.append(n)
    return done

_st = {}
