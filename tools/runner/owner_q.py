"""#193 One place for owner questions: the pinned GitHub issue 'Questions for the owner' (assigned to the owner, so GitHub mobile notifies him).
Every question from any window (worker, reviewer, intake, remote QUESTION comment, orchestrator) is one comment there:
issue link, the question, options if any, and a hidden key `<!-- owner-q:KEY -->` (no duplicates per window+question).
A question is answered when its comment has a reaction, or a comment `ANSWERED owner-q:KEY ...` exists.
Usage:
  python tools/runner/owner_q.py ask <window|#n> "<question>"   # the orchestrator's own question (prints the comment url)
  python tools/runner/owner_q.py open                           # open questions: key, window, text, url
  python tools/runner/owner_q.py answered <KEY> "<answer>"       # mark answered (after relaying the answer)
"""
import hashlib, json, re, sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import runner as R

TITLE = "Questions for the owner"
OWNER = R.REPO.split("/")[0]
STATE = R.RUNS / "owner_q.json"
GH = R.gh             # tests swap in a fake gh
KEY_RE = re.compile(r"<!-- owner-q:([0-9a-f]{12}) -->")
OPT_RE = re.compile(r"^\s*[❯>›]?\s*(\d+[.)]\s+\S.*)$")

def key_of(window, question):
    return hashlib.sha1(f"{window}|{question.strip()}".encode()).hexdigest()[:12]

def options_of(question, tail=""):
    """Numbered menu lines on the screen (a permission menu), else none (a QUESTION: line carries its options itself)."""
    if question: return []
    return [m[1].strip() for m in map(OPT_RE.match, tail.splitlines()) if m][-6:]

def issue_ref(window):
    m = re.match(r"(?:issue|review|intake|remote)-(\d+)", window or "") or re.match(r"#(\d+)$", window or "")
    return f"#{m[1]}" if m else ""

def body(key, window, question, tail=""):
    """The comment text (parent-facing: Hebrew without nikud)."""
    ref = issue_ref(window)
    head = f"**{ref}**" + (f" (חלון `{window}`)" if window and window != ref else "") if ref else f"חלון `{window}`"
    q = re.sub(r"^QUESTION:\s*", "", question).strip() or ("(מחכה לתשובה) " + (tail.strip().splitlines() or [""])[-1].strip())
    opts = options_of(question, tail)
    return (f"<!-- owner-q:{key} -->\n{head}\n\n**שאלה:** {q}\n"
            + ("".join(f"\n- {o}" for o in opts) + "\n" if opts else "")
            + "\nענה כאן בתגובה (או לאורקסטרטור). אחרי שהתשובה הועברה: `ANSWERED owner-q:" + key + "`")

def answered_keys(comments):
    done = set()
    for c in comments:
        b = c.get("body") or ""
        done |= set(re.findall(r"(?m)^\s*ANSWERED owner-q:([0-9a-f]{12})", b))
        m = KEY_RE.search(b)
        if m and any(g.get("users", {}).get("totalCount", 1) for g in c.get("reactionGroups") or []): done.add(m[1])
    return done

def open_questions(comments):
    """Pure: unanswered question comments, oldest first -> [{key, window, text, url}]."""
    done, out = answered_keys(comments), []
    for c in comments:
        b = c.get("body") or ""
        m = KEY_RE.search(b)
        if not m or m[1] in done or b.lstrip().startswith("ANSWERED"): continue
        q = re.search(r"\*\*שאלה:\*\*\s*(.*)", b); w = re.search(r"\*\*(#\d+)\*\*|חלון `([^`]+)`", b)
        src = re.search(r"חלון `([^`]+)`", b)                       # #220: the asking window (remote-<n> gets its answer sent)
        window = (w[1] or w[2]) if w else ""
        out.append({"key": m[1], "window": window, "source": src[1] if src else window,
                    "text": q[1].strip() if q else "", "url": c.get("url", "")})
    return out

# ---------- GitHub side ----------
def _state():
    try: return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception: return {"issue": 0, "posted": []}

def _save(s):
    R.RUNS.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(s), encoding="utf-8")

def find_issue(gh=None):
    """Number of the open 'Questions for the owner' issue; created (assigned to the owner, pinned) when missing. 0 if gh fails."""
    gh = gh or GH
    s = _state()
    if s.get("issue"): return s["issue"]
    rc, out = gh("issue", "list", "--state", "open", "--search", f'"{TITLE}" in:title', "--json", "number,title")
    if rc: return 0
    n = next((i["number"] for i in json.loads(out or "[]") if i["title"] == TITLE), 0)
    if not n:
        rc, out = gh("issue", "create", "--title", TITLE, "--assignee", OWNER, "--label", "manual", "--body",
                     "כל שאלה שמחכה לך מופיעה כאן כתגובה (מכל חלון). ענה בתגובה; האורקסטרטור מעביר את התשובה.\n\n"
                     "(#193: the runner ignores this issue: label `manual`.)")
        m = re.search(r"/issues/(\d+)", out or "")
        if rc or not m: return 0
        n = int(m[1])
        gh("issue", "pin", str(n))
    s["issue"] = n; _save(s)
    return n

def comments(n, gh=None):
    gh = gh or GH
    rc, out = gh("issue", "view", str(n), "--json", "comments")
    if rc: return None
    try: return json.loads(out).get("comments", [])
    except ValueError: return None

def post(window, question, tail="", gh=None):
    """Post the question once per window+question. -> comment url when posted now, '' when already there, None when gh failed (retry later)."""
    gh = gh or GH
    key = key_of(window, question or tail[-600:])
    s = _state()
    if key in s.get("posted", []): return ""
    n = find_issue(gh)
    if not n: return None
    cs = comments(n, gh)
    if cs is None: return None
    if any(KEY_RE.search(c.get("body") or "") and key in c["body"] for c in cs):
        s = _state(); s.setdefault("posted", []).append(key); _save(s); return ""
    rc, out = gh("issue", "comment", str(n), "--body", R.redact(body(key, window, question, tail)))
    if rc: return None
    s = _state(); s["posted"] = (s.get("posted", []) + [key])[-500:]; _save(s)
    return (out or "").strip().splitlines()[-1] if (out or "").strip() else f"https://github.com/{R.REPO}/issues/{n}"

def open_list(gh=None):
    gh = gh or GH
    n = find_issue(gh)
    cs = comments(n, gh) if n else None
    return None if cs is None else [{**q, "issue": n} for q in open_questions(cs)]

def mark_answered(key, answer="", gh=None):
    gh = gh or GH
    n = find_issue(gh)
    return bool(n) and gh("issue", "comment", str(n), "--body", f"ANSWERED owner-q:{key} {answer}".strip())[0] == 0

def new_answers(cs, seen):
    """Pure: comments after the first `seen` that are not question posts or ANSWERED lines = the owner's replies."""
    return [c for c in cs[seen:] if not KEY_RE.search(c.get("body") or "") and not (c.get("body") or "").lstrip().startswith("ANSWERED")]

def answers_tick(tell, gh=None):
    """Watchdog: the owner replied in the questions issue -> tell the orchestrator (reply + open questions) so it relays the answer."""
    gh = gh or GH
    n = find_issue(gh)
    cs = comments(n, gh) if n else None
    if cs is None: return
    s = _state(); seen = s.get("seen", len(cs))
    new = new_answers(cs, seen)
    if new:
        qs = "; ".join(f"{q['key']} {q['window']}: {q['text'][:120]}" for q in open_questions(cs)) or "none"
        tell("OWNER ANSWERED in 'Questions for the owner' (#%d): %s\nOpen questions: %s\nRelay it to the waiting window/issue, then "
             "python tools/runner/owner_q.py answered <key> \"<answer>\"." % (n, " | ".join((c.get("body") or "")[:300] for c in new), qs))
    if seen != len(cs) or "seen" not in s:
        s = _state(); s["seen"] = len(cs); _save(s)

def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) == 3 and argv[0] == "ask":
        url = post(argv[1], "QUESTION: " + re.sub(r"^QUESTION:\s*", "", argv[2]))
        print(url or ("already posted" if url == "" else "could not post (gh)")); return 0 if url is not None else 1
    if argv == ["open"]:
        qs = open_list()
        if qs is None: print("could not read GitHub (gh)"); return 1
        print("\n".join(f"{q['key']}  {q['window']}  {q['text']}  {q['url']}" for q in qs) or "no open questions"); return 0
    if len(argv) in (2, 3) and argv[0] == "answered":
        ok = mark_answered(argv[1], argv[2] if len(argv) == 3 else "")
        print("marked answered" if ok else "could not mark (gh)"); return 0 if ok else 1
    print(__doc__); return 2

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
