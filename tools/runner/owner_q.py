"""#193 One place for owner questions: the pinned GitHub issue 'Questions for the owner' (assigned to the owner, so GitHub mobile notifies him).
Every question from any window (worker, reviewer, intake, remote QUESTION comment, orchestrator) is one comment there:
issue link, the question, options if any, and a hidden key `<!-- owner-q:KEY -->` (no duplicates per window+question).
A question is answered when its comment has a reaction, or a comment `ANSWERED owner-q:KEY ...` exists.
Usage:
  python tools/runner/owner_q.py ask <window|#n> "<question>" [--gates 64,65]   # the orchestrator's own question (prints the url);
                                                                # #630: --gates = the issues whose owner gate this answer opens
  python tools/runner/owner_q.py open                           # open questions: key, window, text, url
  python tools/runner/owner_q.py answered <KEY> "<answer>"       # mark answered (after relaying the answer)
  python tools/runner/owner_q.py gate <#n>                      # #608: the owner's answers for issue n (exit 0 = gate open, 1 = closed)
A PR whose issue is owner-gated (an owner question about it exists) never merges while that gate is CLOSED (#636, merge_gate).
"""
import hashlib, json, os, re, shutil, subprocess, sys, threading, time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import runner as R
import ghcache, ghauth, trust, remote

TITLE = "Questions for the owner"
OWNER = R.REPO.split("/")[0]
STATE = R.RUNS / "owner_q.json"
GH = R.gh             # tests swap in a fake gh
KEY_RE = re.compile(r"<!-- owner-q:([0-9a-f]{12}) -->")
MARK = "<!-- owner_q -->"  # #211: every post of this tool (same GitHub account as the owner) -> never counted as his answer
QUICK_S = 10        # #469: an owner question never waits longer than this on GitHub (a limit -> other identity, else queued)
ANSWER_RE = re.compile(r"<!-- owner-answer:([0-9a-f]{12}) -->")   # #608: the record qwin.answer writes on the asking issue
CHAT_RE = re.compile(r"<!-- owner-answer:([0-9a-f]{12}) via=inspector-chat -->")   # #803: the chat answer record (never matches ANSWER_RE)
FINAL_RE = re.compile(r"<!-- owner-answer-final:([0-9a-f]{12}) -->")              # #803: written by the watchdog when the chat answer is in force
UNDO_RE = re.compile(r"<!-- owner-answer-undo:([0-9a-f]{12}) -->")                # #803: the owner's undo (Telegram)
CHAT_STATE = R.RUNS / "qwin_chat.json"                                             # #803: Telegram confirmation state (qwin.py)
GATES_RE = re.compile(r"<!-- gates: ([#\d ,]+) -->")   # #630: the issues this question gates (any window)
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

def gates_of(b):
    """#630: issue numbers a question comment gates (its hidden `<!-- gates: #64 -->` marker), else []."""
    m = GATES_RE.search(b or "")
    return [int(x) for x in re.findall(r"\d+", m[1])] if m else []

HE = re.compile(r"[א-ת]"); LAT = re.compile(r"[A-Za-z]")
TR_TIMEOUT_S = 15     # #699: a translation never holds a watchdog tick (bound 60 s, #365) longer than this
FALLBACK_HE = "הודעה מהמערכת. הפרטים ב-GitHub:"   # #699: shown instead of English when no Hebrew version exists
TRANSLATE = None      # text -> Hebrew text or None; tests swap in a fake (default: one short call to a cheap model)

def is_hebrew(t):
    return len(HE.findall(t or "")) >= len(LAT.findall(t or ""))

def _claude_hebrew(text):
    """#696: one short plain Hebrew version of an English text (haiku, no tools); None when it fails or under tests."""
    if os.environ.get("OREN_TEST"): return None
    try:
        p = subprocess.run([shutil.which("claude") or "claude", "-p", "--model", "haiku", "--no-session-persistence"],
                           input="Write this text for a parent in short, plain Hebrew (no nikud). Keep every option, number and #issue as is. "
                                 "Output only the Hebrew text.\n\n" + text, capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=TR_TIMEOUT_S, stdin=None, cwd=str(R.ROOT))
    except (OSError, subprocess.TimeoutExpired): return None
    out = (p.stdout or "").strip()
    return out if p.returncode == 0 and out and is_hebrew(out) else None

def _bounded(fn, text, secs):
    """#699: fn(text) in a daemon thread, at most `secs` s; a slow or failing translator -> None."""
    box = []
    def run():
        try: box.append(fn(text))
        except Exception: pass
    t = threading.Thread(target=run, daemon=True); t.start(); t.join(secs)
    return box[0] if box and not t.is_alive() else None

def hebrew_of(question):
    """#696: the question as Hebrew; a Hebrew text stays; None = a Hebrew text or empty. #699: an English text whose translation
    failed or timed out -> the fixed Hebrew fallback line (the caller adds the issue link), never the English."""
    q = re.sub(r"^QUESTION:\s*", "", question or "").strip()
    if not q or is_hebrew(q): return None
    return _bounded(TRANSLATE or _claude_hebrew, q, TR_TIMEOUT_S) or FALLBACK_HE

def body(key, window, question, tail="", gates=(), he=None):
    """The comment text (parent-facing: Hebrew without nikud)."""
    ref = issue_ref(window)
    head = f"**{ref}**" + (f" (חלון `{window}`)" if window and window != ref else "") if ref else f"חלון `{window}`"
    q = re.sub(r"^QUESTION:\s*", "", question).strip() or ("(מחכה לתשובה) " + (tail.strip().splitlines() or [""])[-1].strip())
    opts = options_of(question, tail)
    orig = f"\n\n<details><summary>English original</summary>\n\n{q}\n\n</details>" if he else ""
    if he:
        n = ref[1:] if ref else _state().get("issue", "")
        q = he if he != FALLBACK_HE else f"{FALLBACK_HE} https://github.com/{R.REPO}/issues/{n}"
    g = f"<!-- gates: {' '.join(f'#{n}' for n in gates)} -->" if gates else ""
    return (f"{MARK}<!-- owner-q:{key} -->{g}\n{head}\n\n**שאלה:** {q}\n"
            + ("".join(f"\n- {o}" for o in opts) + "\n" if opts else "") + orig
            + "\nענה כאן בתגובה (או לאורקסטרטור). אחרי שהתשובה הועברה: `ANSWERED owner-q:" + key + "`")

def owner_reacted(c):
    """#800: a reaction counts only from the owner login: the reaction group must list its users and the owner must be one."""
    return any(trust.OWNER in {u.get("login") for u in (g.get("users") or {}).get("nodes") or []} for g in c.get("reactionGroups") or [])

def answered_keys(comments):
    done = set()
    for c in trust.only(comments):                  # #800: only trusted authors; ANSWERED lines only from the App bot
        b = c.get("body") or ""
        if trust.is_bot(c): done |= set(re.findall(r"(?m)^\s*ANSWERED owner-q:([0-9a-f]{12})", b))
        m = KEY_RE.search(b)
        if m and owner_reacted(c): done.add(m[1])
    return done

def answer_body(key, text):
    """#608: the owner's answer as recorded on the asking issue (only qwin.answer writes it): the one thing that counts as him."""
    return f"OWNER ANSWER (question window, owner-q:{key}): {text}\n<!-- owner-answer:{key} -->"

def chat_answer_body(key, text, quote):
    """#803: the inspector-chat answer record. Not an `owner-answer` record (ANSWER_RE needs no `via=`): it counts only with the final marker."""
    return f"OWNER ANSWER (inspector chat, owner-q:{key}): {text}\nQuote: {quote}\n<!-- owner-answer:{key} via=inspector-chat -->"

def chat_record(body):
    """Pure (#803): (key, answer, quote) of an inspector-chat record, else None."""
    m = CHAT_RE.search(body or "")
    a = re.match(r"^OWNER ANSWER \(inspector chat, owner-q:([0-9a-f]{12})\):\s*(.*?)(?:\nQuote:\s*(.*?))?\n?<!-- owner-answer:", (body or "").strip(), re.S)
    if not (m and a and a[1] == m[1]): return None
    return m[1], a[2].strip(), (a[3] or "").strip()

def chat_states(issue_comments):
    """Pure (#803): {key: {'answer', 'final', 'undo'}} of the bot-written chat records, markers and undo records on one issue."""
    out = {}
    for c in trust.bots(issue_comments):
        b = c.get("body") or ""; r = chat_record(b)
        if r: out.setdefault(r[0], {"answer": r[1], "quote": r[2], "final": False, "undo": False}).update(answer=r[1], quote=r[2])
        for rx, f in ((FINAL_RE, "final"), (UNDO_RE, "undo")):
            for k in rx.findall(b): out.setdefault(k, {"answer": "", "final": False, "undo": False})[f] = True
    return {k: v for k, v in out.items() if v["answer"]}

def record_answer(body):
    """Pure (#608): (key, answer text) of an owner_q answer record, else None. Free comment text never is one."""
    m = ANSWER_RE.search(body or "")
    a = re.match(r"^OWNER ANSWER \(question window, owner-q:([0-9a-f]{12})\):\s*(.*)", (body or "").strip(), re.S)
    if not (m and a and a[1] == m[1]): return None
    return m[1], ANSWER_RE.sub("", a[2]).strip()

def gate(n, issue_comments, question_comments):
    """Pure (#608): the owner's answers to the owner questions about issue n, oldest first; [] = the owner gate is closed.
    A #n question = asked from #n's window, or one that gates #n (#630, any window).
    Counts only an answer record on issue n with the key of a #n question in the questions issue, or a reaction on that question."""
    keys, out = {}, []
    for c in trust.only(question_comments):
        b = c.get("body") or ""; m = KEY_RE.search(b)
        if m and (re.search(rf"\*\*#{n}\*\*", b) or n in gates_of(b)): keys[m[1]] = c   # #630: or it gates #n
    for c in trust.bots(issue_comments):             # #800: an answer record counts only from the App bot
        r = record_answer(c.get("body"))
        if r and r[0] in keys: out.append(r[1])
    for k, v in chat_states(issue_comments).items():   # #803: a chat answer counts only with the bot's final marker and no undo
        if k in keys and v["final"] and not v["undo"]: out.append(f"{v['answer']} (inspector chat)")
    for c in keys.values():
        out += [f"reaction {g.get('content', '')}" for g in c.get("reactionGroups") or [] if trust.OWNER in {u.get('login') for u in (g.get('users') or {}).get('nodes') or []}]   # #800: owner login only
    return out

def merge_state(n, issue_comments, question_comments):
    """Pure (#636): the owner gate as the merge sees it -> 'none' (no owner question about #n: not owner-gated), 'open', 'closed',
    or 'error' (unreadable: the caller refuses). #739: only a question marked `--gates n` counts; a plain worker question (access, how-to) does not. Its own reviewer's PURPLE question (window review-<n>) is no merge gate:
    'hold' parks the issue anyway, 'merge-safe' merges by design."""
    if issue_comments is None or question_comments is None: return "error"
    qs = [c for c in question_comments if KEY_RE.search(c.get("body") or "") and n in gates_of(c.get("body"))   # #739: only a question marked as a gate (--gates n) gates the merge; a plain worker question never does
          and f"`review-{n}`" not in (c.get("body") or "")]
    if not qs: return "none"
    return "open" if gate(n, issue_comments, qs) else "closed"

def merge_gate(n):
    """#636: merge_state of issue n read from GitHub (the questions issue + issue n)."""
    with ghcache.quick(QUICK_S):
        q = find_issue(); qcs = comments(q) if q else None
        ics = comments(n) if qcs is not None else None
    return merge_state(n, ics, qcs)

def open_questions(comments):
    """Pure: unanswered question comments, oldest first -> [{key, window, text, url}]."""
    done, out = answered_keys(comments), []
    for c in trust.only(comments):
        b = c.get("body") or ""
        m = KEY_RE.search(b)
        if not m or m[1] in done or b.lstrip().startswith("ANSWERED"): continue
        q = re.search(r"\*\*שאלה:\*\*\s*(.*?)(?=\n\n- |\n\n<details>|\n\nענה כאן|\Z)", b, re.S); w = re.search(r"\*\*(#\d+)\*\*|חלון `([^`]+)`", b)
        src = re.search(r"חלון `([^`]+)`", b)                       # #220: the asking window (remote-<n> gets its answer sent)
        window = (w[1] or w[2]) if w else ""
        out.append({"key": m[1], "window": window, "source": src[1] if src else window,
                    "text": q[1].strip() if q else "", "gates": gates_of(b), "url": c.get("url", ""), "at": c.get("createdAt", "")})
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

def post(window, question, tail="", gh=None, gates=()):
    """Post the question once per window+question. -> comment url when posted now, '' when already there, None when gh failed:
    then it is queued (state 'pending') and answers_tick posts it later (#469: never lost, never more than QUICK_S s on GitHub)."""
    with ghcache.quick(QUICK_S):
        r = _post(window, question, tail, gh, gates)
    s = _state(); pend = [p for p in s.get("pending", []) if (p["window"], p["question"]) != (window, question)]
    if r is None: pend.append({"window": window, "question": question, "tail": tail[-1500:], "gates": list(gates)})
    if pend != s.get("pending", []): s["pending"] = pend[-50:]; _save(s)
    return r

def flush_pending(gh=None):
    """#469: post the questions that could not be posted earlier (GitHub limited); each stays queued until it is posted."""
    for p in list(_state().get("pending", [])): post(p["window"], p["question"], p.get("tail", ""), gh, p.get("gates", ()))
    for p in list(_state().get("pending_answers", [])):      # #800: answer records waiting for the App token
        if post_app(p["n"], p["text"], gh):
            s = _state(); s["pending_answers"] = [x for x in s.get("pending_answers", []) if x != p]; _save(s)

def _post(window, question, tail="", gh=None, gates=()):
    gh = gh or GH
    key = key_of(window, question or tail[-600:])
    s = _state()
    if key in s.get("posted", []): return ""
    n = find_issue(gh)
    if not n: return None
    cs = comments(n, gh)
    if cs is None: return None
    if any(KEY_RE.search(c.get("body") or "") and key in c["body"] for c in trust.only(cs)):
        s = _state(); s.setdefault("posted", []).append(key); _save(s); return ""
    rc, out = gh("issue", "comment", str(n), "--body", R.redact(body(key, window, question, tail, gates, hebrew_of(question))))
    if rc: return None
    s = _state(); s["posted"] = (s.get("posted", []) + [key])[-500:]; _save(s)
    return (out or "").strip().splitlines()[-1] if (out or "").strip() else f"https://github.com/{R.REPO}/issues/{n}"

def open_list(gh=None):
    gh = gh or GH
    with ghcache.quick(QUICK_S):
        n = find_issue(gh)
        cs = comments(n, gh) if n else None
    return None if cs is None else [{**q, "issue": n} for q in open_questions(cs)]

def mark_answered(key, answer="", gh=None):
    gh = gh or GH
    with ghcache.quick(QUICK_S):
        n = find_issue(gh)
        return bool(n) and post_app(n, f"ANSWERED owner-q:{key} {answer}".strip() + "\n" + MARK, gh)

def post_app(n, text, gh=None):
    """#800: an owner-answer record / ANSWERED line is written ONLY by the App bot. gh=None: R.gh as the App with no owner fallback
    (no App token -> False, the caller queues it); a test passes a fake gh."""
    if gh is not None: return gh("issue", "comment", str(n), "--body", R.redact(text))[0] == 0
    env = {**os.environ, remote.APP_ONLY: "1"}
    return remote.sh(["gh", "issue", "comment", str(n), "--repo", R.REPO, "--body", R.redact(text)], env=env)[0] == 0

def queue_answer(n, text):
    s = _state(); p = s.setdefault("pending_answers", [])
    if {"n": n, "text": text} not in p: p.append({"n": n, "text": text})
    s["pending_answers"] = p[-50:]; _save(s)

def post_or_queue(n, text, gh=None):
    """#800: App post, or queue (flush_pending retries, answers_tick alarms) when the App token is missing. -> True when posted now."""
    if post_app(n, text, gh): return True
    queue_answer(n, text); return False

def new_answers(cs, seen):
    """Pure: comments after the first `seen` without the tool's marks (MARK, question key, ANSWERED line) = the owner's replies."""
    tool = lambda b: MARK in b or KEY_RE.search(b) or b.lstrip().startswith("ANSWERED")
    return [c for c in trust.only(cs[seen:]) if not tool(c.get("body") or "")]    # #800: only the owner's own account

def answers_tick(tell, gh=None):
    """Watchdog: the owner replied in the questions issue -> tell the orchestrator (reply + open questions) so it relays the answer."""
    gh = gh or GH
    flush_pending(gh)
    if _state().get("pending_answers") and not _state().get("answers_alarm"):    # #800: an answer record cannot be posted (no App token)
        tell("ALARM: an owner answer record is queued: the GitHub App token is missing, nothing is posted under another login (#800).")
        s = _state(); s["answers_alarm"] = True; _save(s)
    with ghcache.quick(QUICK_S):
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
    gates = []
    if argv[:1] == ["ask"] and "--gates" in argv[:-1]:     # #630: ask ... --gates 64,65
        i = argv.index("--gates"); gates = [int(x) for x in re.findall(r"\d+", argv[i + 1])]; argv = argv[:i] + argv[i + 2:]
    if len(argv) == 3 and argv[0] == "ask":
        url = post(argv[1], "QUESTION: " + re.sub(r"^QUESTION:\s*", "", argv[2]), gates=gates)
        print(url or ("already posted" if url == "" else "GitHub is busy: queued, the watchdog posts it within a minute or two")); return 0
    if argv == ["open"]:
        qs = open_list()
        if qs is None: print("could not read GitHub (gh)"); return 1
        print("\n".join(f"{q['key']}  {q['window']}  {q['text']}  {q['url']}" for q in qs) or "no open questions"); return 0
    if len(argv) in (2, 3) and argv[0] == "answered":
        ok = mark_answered(argv[1], argv[2] if len(argv) == 3 else "")
        print("marked answered" if ok else "could not mark (gh)"); return 0 if ok else 1
    if len(argv) == 2 and argv[0] == "gate":
        n = int(argv[1].lstrip("#"))
        with ghcache.quick(QUICK_S):
            q = find_issue(); qcs = comments(q) if q else None; ics = comments(n)
        if qcs is None or ics is None: print("could not read GitHub (gh)"); return 2
        got = gate(n, ics, qcs)
        wait = [k for k, v in chat_states(ics).items() if not v["final"] and not v["undo"] and k not in {x for x in answered_keys(qcs)}]
        if not got and wait:
            try: at = json.loads(CHAT_STATE.read_text(encoding="utf-8")).get(wait[0], {}).get("sent_at")
            except Exception: at = None
            print(f"CLOSED: chat answer for {wait[0]} waits" + (f" until {time.strftime('%H:%M', time.localtime(at + 600))}" if at else " for the Telegram confirmation")); return 1
        print(("OPEN: " + " | ".join(got)) if got else f"CLOSED: no owner_q answer for #{n} (free comments never count, #608)")
        return 0 if got else 1
    print(__doc__); return 2

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
