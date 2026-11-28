"""#193 One place for owner questions: the pinned GitHub issue 'Questions for the owner' (assigned to the owner, so GitHub mobile notifies him).
Every question from any window (worker, reviewer, intake, remote QUESTION comment, orchestrator) is one comment there:
issue link, the question, options if any, and a hidden key `<!-- owner-q:KEY -->` (no duplicates per window+question).
A question is answered when its comment has a reaction, or a comment `ANSWERED owner-q:KEY ...` exists.
Usage:
  python tools/runner/owner_q.py ask <window|#n> "<question>" [--gates 64,65]   # the orchestrator's own question (prints the url);
                                                                # #630: --gates = the issues whose owner gate this answer opens
  python tools/runner/owner_q.py open                           # open questions: key, window, text, url
  python tools/runner/owner_q.py answered <KEY> "<answer>"       # mark answered (after relaying the answer)
  python tools/runner/owner_q.py archive [--apply]               # #912: move answered questions older than a month out of the pinned issue (dry-run without --apply)
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
QUICK_S = 10        # #469: an owner question never waits longer than this on GitHub (a limit -> other identity, else queued); UI only (panel, dashboard)
LONG_S = 60         # #912: gate / open reads and answer-record writes wait this long per try (a PC at 100% CPU is slow, not down)
CACHE_TTL = 60      # #912: the #205 comments are read from GitHub at most once per this many seconds (our own writes make it dirty)
CACHE = R.RUNS / "owner_q_comments.json"
ANSWER_RE = re.compile(r"<!-- owner-answer:([0-9a-f]{12}) -->")   # #608: the record qwin.answer writes on the asking issue
CHAT_RE = re.compile(r"<!-- owner-answer:([0-9a-f]{12}) via=inspector-chat -->")   # #803: the chat answer record (never matches ANSWER_RE)
FINAL_RE = re.compile(r"<!-- owner-answer-final:([0-9a-f]{12}) -->")              # #803: written by the watchdog when the chat answer is in force
UNDO_RE = re.compile(r"<!-- owner-answer-undo:([0-9a-f]{12}) -->")                # #803: the owner's undo (Telegram)
CHAT_STATE = R.RUNS / "qwin_chat.json"                                             # #803: Telegram confirmation state (qwin.py)
GATES_RE = re.compile(r"<!-- gates: ([#\d ,]+) -->")   # #630: the issues this question gates (any window)
ARCH_REACT_RE = re.compile(r"<!-- archived-reaction:(\S+) -->")   # #912: written by archive() when the owner had reacted to the moved question
ARCH_TITLE = "Questions for the owner (archive "
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
        if trust.answer_ok(c): done |= set(re.findall(r"(?m)^\s*ANSWERED owner-q:([0-9a-f]{12})", b))
        m = KEY_RE.search(b)
        if m and owner_reacted(c): done.add(m[1])
    return done

def answer_body(key, text, via=""):
    """#608: the owner's answer as recorded on the asking issue (only qwin.answer writes it): the one thing that counts as him.
    #872: `via` (console|telegram) is named in the visible line only; the marker, and so the gate, stay the same."""
    v = f" via {via}" if via else ""
    return f"OWNER ANSWER (question window, owner-q:{key}{v}): {text}\n<!-- owner-answer:{key} -->"

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
    a = re.match(r"^OWNER ANSWER \(question window, owner-q:([0-9a-f]{12})(?: via [\w-]+)?\):\s*(.*)", (body or "").strip(), re.S)
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
    for c in issue_comments or []:                   # #800: an answer record counts only from the App bot (or the owner login before trust_since)
        if not trust.answer_ok(c): continue
        r = record_answer(c.get("body"))
        if r and r[0] in keys: out.append(r[1])
    for k, v in chat_states(issue_comments).items():   # #803: a chat answer counts only with the bot's final marker and no undo
        if k in keys and v["final"] and not v["undo"]: out.append(f"{v['answer']} (inspector chat)")
    for c in keys.values():
        if trust.is_bot(c) and (m := ARCH_REACT_RE.search(c.get("body") or "")): out.append(f"reaction {m[1]}")   # #912: the owner's reaction, copied when the question moved to an archive issue
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

GATE_TRIES = (LONG_S, LONG_S, LONG_S)               # #908/#912: a read that times out (PC at 100% CPU) is retried, 3 tries, never quick()
GATE_BACKOFF = (5, 15)                              # seconds to wait before retry 2 and 3

def _gate_read(n, secs):
    with ghcache.quick(secs):
        qcs = question_comments()
        ics = comments(n) if qcs is not None else None
    return ics, qcs

def gate_read(n, tries=None, backoff=None, sleep=time.sleep):
    """#908: (issue comments, question comments) of issue n; a failed read is retried with a longer timeout and backoff. (None, ...) = still unreadable."""
    tries, backoff = tries or GATE_TRIES, GATE_BACKOFF if backoff is None else backoff
    for i, secs in enumerate(tries):
        ics, qcs = _gate_read(n, secs)
        if ics is not None and qcs is not None: break
        if i + 1 < len(tries): sleep(backoff[min(i, len(backoff) - 1)] if backoff else 0)
    return ics, qcs

def merge_gate(n, **kw):
    """#636: merge_state of issue n read from GitHub (the questions issue + issue n). #908: reads retried before 'error'."""
    ics, qcs = gate_read(n, **kw)
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

_CQ = ("query($o:String!,$r:String!,$n:Int!,$c:String){repository(owner:$o,name:$r){issue(number:$n){comments(first:100,after:$c){"
       "pageInfo{hasNextPage endCursor} nodes{body createdAt url author{login} reactionGroups{content users(first:20){totalCount nodes{login}}}}}}}}")
MAX_PAGES = 30

def _api(*args):
    return R.run(["gh", *args])        # args start with "api"

def _cache_load():
    try: return json.loads(CACHE.read_text(encoding="utf-8"))
    except Exception: return {}

def _cached(n, now=None):
    """#912: the cached comments of issue n when younger than CACHE_TTL and no write of ours touched n since; else None."""
    e = _cache_load().get(str(n)); now = time.time() if now is None else now
    if not e or CACHE_TTL <= 0 or not (0 <= now - e["ts"] < CACHE_TTL): return None
    if {str(n), "*"} & ghcache._dirty_since(e["ts"]): return None
    return e["comments"]

def _store(n, cs, now=None):
    c = _cache_load(); ts = time.time() if now is None else now
    c[str(n)] = {"ts": int(ts * 1000) / 1000, "comments": cs}        # ms floor: the dirty log has 3 decimals
    try: R.RUNS.mkdir(parents=True, exist_ok=True); CACHE.write_text(json.dumps(c), encoding="utf-8")
    except OSError: pass

def touch(n):
    """#912: our own write to issue n (post, answer record, ANSWERED line, archive move): the next read of n is fresh (also in other processes)."""
    ghcache.mark_dirty(str(n))
    c = _cache_load()
    if c.pop(str(n), None) is not None:
        try: CACHE.write_text(json.dumps(c), encoding="utf-8")
        except OSError: pass

def comments(n, gh=None):
    """All comments of issue n, oldest first, with author login, url and the reacting users (`gh issue view --json comments` has no
    reaction logins, so every owner thumbs-up was invisible). GraphQL, first:100 + after-cursor loop. None when unreadable.
    A test fake gh is called as gh('api', 'graphql', ...); the real one runs plain `gh api`."""
    hit = _cached(n)
    if hit is not None: return hit                    # #912: 60 s cache (the App-token GraphQL query runs at most once a minute per issue)
    call = gh or GH
    if call is R.gh: call = _api                      # the real gh wrapper appends --repo, which `gh api` does not know
    owner, name = R.REPO.split("/", 1)
    out, cur = [], ""
    for _ in range(MAX_PAGES):
        args = ["graphql", "-f", f"query={_CQ}", "-f", f"o={owner}", "-f", f"r={name}", "-F", f"n={int(n)}"] + (["-f", f"c={cur}"] if cur else [])
        with ghcache.gate_read():                      # #911: a gate read may use the owner login when the app is limited
            rc, txt = call("api", *args)
        if rc: return None
        try:
            c = json.loads(txt)["data"]["repository"]["issue"]["comments"]
            out += c["nodes"]; page = c["pageInfo"]
        except (ValueError, KeyError, TypeError): return None
        if not page.get("hasNextPage"): _store(n, out); return out
        cur = page.get("endCursor") or ""
        if not cur: return None
    return None                                      # absurdly long: refuse rather than decide on a partial list

def question_comments(gh=None):
    """#912: the question comments the gate reads: the pinned issue plus its archive issues (answered questions moved out of it).
    None when unreadable."""
    q = find_issue(gh)
    cs = comments(q, gh) if q else None
    if cs is None: return None
    for a in _state().get("archives", []):
        more = comments(a, gh)
        if more is None: return None
        cs = cs + more
    return cs

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
    if key in s.get("posted", []) or key in queued_keys(): return ""     # #897: answered, record queued: never asked again
    n = find_issue(gh)
    if not n: return None
    cs = comments(n, gh)
    if cs is None: return None
    if any(KEY_RE.search(c.get("body") or "") and key in c["body"] for c in trust.only(cs)):
        s = _state(); s.setdefault("posted", []).append(key); _save(s); return ""
    rc, out = gh("issue", "comment", str(n), "--body", R.redact(body(key, window, question, tail, gates, hebrew_of(question))))
    if rc: return None
    touch(n)
    s = _state(); s["posted"] = (s.get("posted", []) + [key])[-500:]; _save(s)
    return (out or "").strip().splitlines()[-1] if (out or "").strip() else f"https://github.com/{R.REPO}/issues/{n}"

def open_list(gh=None):
    gh = gh or GH
    with ghcache.quick(LONG_S):                       # #912: not quick()
        n = find_issue(gh)
        cs = comments(n, gh) if n else None
    if cs is None: return None
    qk = queued_keys()                                # #897: answered, record queued: not open (no popup, no second ask)
    return [{**q, "issue": n} for q in open_questions(cs) if q["key"] not in qk]

def mark_answered(key, answer="", gh=None):
    """#800: the ANSWERED line is written by the App bot only (gh=None; a test passes a fake gh). True = posted now; False = queued
    (flush_pending retries) or no questions issue. Never under the owner login."""
    with ghcache.quick(LONG_S):                       # #912: answer-record write, longer timeout
        n = find_issue(gh)
        return bool(n) and post_or_queue(n, f"ANSWERED owner-q:{key} {answer}".strip() + "\n" + MARK, gh)

def post_app(n, text, gh=None):
    """#800: an owner-answer record / ANSWERED line is written ONLY by the App bot. gh=None: R.gh as the App with no owner fallback
    (no App token -> False, the caller queues it); a test passes a fake gh.
    #897: R.gh itself (a caller's `gh`) is NOT a fake: it falls back to the owner login on an App rate limit (#469), so it too goes the App-only way."""
    if gh is R.gh: gh = None
    if gh is not None: ok = gh("issue", "comment", str(n), "--body", R.redact(text))[0] == 0
    else:
        env = {**os.environ, remote.APP_ONLY: "1"}
        ok = remote.sh(["gh", "issue", "comment", str(n), "--repo", R.REPO, "--body", R.redact(text)], env=env)[0] == 0
    if ok: touch(n)                                   # #912: the next read of n is fresh
    return ok

def queue_answer(n, text, now=None):
    s = _state(); p = s.setdefault("pending_answers", [])
    if not any(x.get("n") == n and x.get("text") == text for x in p): p.append({"n": n, "text": text, "at": time.time() if now is None else now})
    s["pending_answers"] = p[-50:]; _save(s)

QUEUE_KEY_RE = re.compile(r"owner-q:([0-9a-f]{12})|owner-answer:([0-9a-f]{12})")
ALARM_S = int(R.CFG.get("owner_q_alarm_min", 10)) * 60   # #897/#912: a queued answer record still stuck after this (config.toml, default 10 min) -> one alarm

def queued_keys():
    """#897: keys of the owner answers whose record waits in pending_answers (the owner HAS answered; the App has not posted it yet)."""
    return {m[1] or m[2] for p in _state().get("pending_answers", []) for m in QUEUE_KEY_RE.finditer(p.get("text", ""))}

def post_or_queue(n, text, gh=None):
    """#800: App post, or queue (flush_pending retries, answers_tick alarms) when the App token is missing. -> True when posted now."""
    if post_app(n, text, gh): return True
    queue_answer(n, text); return False

def repair(keys, gh=None):
    """#897, one-time: re-post, as the App, the answer records that were written under the owner login after `trust_since` (the #800 rule ignores
    them). Only the given keys; the record text is copied from the owner-login comment on each issue, so the owner's words stay exact.
    -> {key: number of issues re-posted}; a record already there from the App is not posted twice."""
    out = {}
    q = find_issue(gh); qcs = comments(q, gh) if q else None
    if qcs is None: return out
    for k in keys:                                   # the ANSWERED line lives in the questions issue itself (#205), not on the asking issue
        line = re.compile(rf"(?m)^\s*ANSWERED owner-q:{k}\b")
        if any(trust.is_bot(c) and line.search(c.get("body") or "") for c in qcs): continue
        src = next((c for c in qcs if trust.login(c) == trust.OWNER and not trust.answer_ok(c) and line.search(c.get("body") or "")), None)
        if src: post_or_queue(q, src["body"], gh); out[k] = out.get(k, 0) + 1
    # the issues to repair: the one the question was asked from (`**#n**` in its comment) and the ones it gates (`--gates`)
    issues = {int(m[1]) for c in trust.only(qcs) for m in [re.search(r"\*\*#(\d+)\*\*", c.get("body") or "")] if m and any(k in (c.get("body") or "") for k in keys)}
    for n in sorted(issues | {x for c in qcs if any(k in (c.get("body") or "") for k in keys) for x in gates_of(c.get("body") or "")}):
        cs = comments(n, gh) or []
        for k in keys:
            if any(trust.is_bot(c) and f"<!-- owner-answer:{k} -->" in (c.get("body") or "") for c in cs): continue
            src = next((c for c in cs if trust.login(c) == trust.OWNER and not trust.answer_ok(c) and f"<!-- owner-answer:{k} -->" in (c.get("body") or "")), None)
            if src: post_or_queue(n, src["body"], gh); out[k] = out.get(k, 0) + 1
    return out

# ---------- #912: archive answered questions out of the pinned issue ----------
ARCHIVE_DAYS = 30
def archive_max(): return int(R.CFG.get("owner_q_archive_max", 100))

def _cid(c):
    m = re.search(r"issuecomment-(\d+)", c.get("url") or "")
    return m[1] if m else ""

def _iso(t):
    try: return int(time.mktime(time.strptime(t, "%Y-%m-%dT%H:%M:%SZ"))) - time.timezone
    except (TypeError, ValueError): return 0

def archive_plan(cs, now=None):
    """Pure: which comments of the questions issue move out. A question that is answered (ANSWERED line or the owner's reaction) and older
    than ARCHIVE_DAYS moves, with its ANSWERED lines; when the issue has more than archive_max() comments, every answered one moves.
    -> [{key, month, comments: [comment, ...]}] oldest first. Open questions and the owner's own free comments never move."""
    now = time.time() if now is None else now
    done = answered_keys(cs); big = len(cs) > archive_max(); out = {}
    for c in trust.only(cs):
        b = c.get("body") or ""; m = KEY_RE.search(b)
        if m and m[1] in done and not b.lstrip().startswith("ANSWERED"):
            t = _iso(c.get("createdAt"))
            if big or (t and now - t >= ARCHIVE_DAYS * 86400):
                out[m[1]] = {"key": m[1], "month": (c.get("createdAt") or "")[:7] or time.strftime("%Y-%m", time.localtime(now)), "comments": [c]}
    for c in trust.only(cs):
        b = c.get("body") or ""
        for k in out:
            if b.lstrip().startswith("ANSWERED") and re.search(rf"owner-q:{k}\b", b): out[k]["comments"].append(c)
    return sorted((v for v in out.values() if _cid(v["comments"][0])), key=lambda v: v["comments"][0].get("createdAt") or "")

def archive(apply=False, gh=None, now=None):
    """#912: dry-run by default (-> the plan, nothing written). apply=True: post each moved question (and its ANSWERED lines) into the issue
    'Questions for the owner (archive YYYY-MM)' (label manual, not pinned; created when missing), THEN delete the originals from the pinned issue.
    State follows: `archives` lists the archive issues (gate reads them too), `seen` drops by the moved comments, `posted` keys stay (never asked again).
    A question the owner reacted to keeps that reaction as a hidden marker in the archived copy. -> dict(plan=[...], moved=n)."""
    gh = gh or GH
    q = find_issue(gh); cs = comments(q, gh) if q else None
    if cs is None: return {"plan": [], "moved": 0, "error": "unreadable"}
    plan = archive_plan(cs, now)
    res = {"plan": [{"key": p["key"], "month": p["month"], "comments": len(p["comments"])} for p in plan], "moved": 0}
    if not apply or not plan: return res
    s = _state(); arch = dict(s.get("archive_by_month", {})); removed_idx = set()
    for p in plan:
        month = p["month"]; n = arch.get(month)
        if not n:
            rc, out = gh("issue", "create", "--title", f"{ARCH_TITLE}{month})", "--label", "manual", "--body",
                         "Archive of answered owner questions moved out of the pinned issue (#912). Not pinned; the gate still reads it.")
            m = re.search(r"/issues/(\d+)", out or "")
            if rc or not m: continue
            n = arch[month] = int(m[1])
            s = _state(); s["archive_by_month"] = arch; s["archives"] = sorted(set(s.get("archives", [])) | {n}); _save(s)
        ok = True
        for c in p["comments"]:
            body = c.get("body") or ""
            if c is p["comments"][0]:
                react = next((g.get("content") for g in c.get("reactionGroups") or [] if trust.OWNER in {u.get("login") for u in (g.get("users") or {}).get("nodes") or []}), "")
                if react: body += f"\n<!-- archived-reaction:{react} -->"
            rc, _ = gh("issue", "comment", str(n), "--body", R.redact(body)); ok = ok and rc == 0
        touch(n)
        if not ok: continue                           # never delete an original whose copy is not there
        for c in p["comments"]:
            rc, _ = (_api if gh is R.gh else gh)("api", "-X", "DELETE", f"repos/{R.REPO}/issues/comments/{_cid(c)}")
            if rc == 0: removed_idx.add(id(c)); res["moved"] += 1
    if removed_idx:
        touch(q)
        gone = sum(1 for i, c in enumerate(cs[:s.get("seen", len(cs))]) if id(c) in removed_idx)
        s = _state(); s["seen"] = max(0, s.get("seen", len(cs)) - gone); _save(s)
    return res

def archive_tick(gh=None, now=None):
    """Watchdog: archive for real only after the owner's OK for the first move (`owner_q.py archive --apply` sets archive_ok); before that nothing moves."""
    if not _state().get("archive_ok"): return None
    return archive(True, gh, now)

def new_answers(cs, seen):
    """Pure: comments after the first `seen` without the tool's marks (MARK, question key, ANSWERED line) = the owner's replies."""
    tool = lambda b: MARK in b or KEY_RE.search(b) or b.lstrip().startswith("ANSWERED")
    return [c for c in trust.only(cs[seen:]) if not tool(c.get("body") or "")]    # #800: only the owner's own account

def answers_tick(tell, gh=None):
    """Watchdog: the owner replied in the questions issue -> tell the orchestrator (reply + open questions) so it relays the answer."""
    flush_pending(gh)                                # gh=None here: queued answer records go out as the App only (#800), never via R.gh's owner fallback
    gh = gh or GH
    try: archive_tick(gh)                            # #912: no-op until the owner's OK for the first move
    except Exception: pass
    now = time.time(); s = _state(); late = [p for p in s.get("pending_answers", []) if now - p.get("at", now) >= ALARM_S and not p.get("alarmed")]
    for p in s.get("pending_answers", []): p.setdefault("at", now)          # records queued by an older runner get their clock now
    if late:                                         # #897: ONE alarm per record, to the orchestrator and the inspector
        msg = f"ALARM: an owner answer record has waited {ALARM_S // 60}+ min in the queue ({len(late)}): the GitHub App cannot write (token missing or rate limited). Nothing is posted under the owner login (#800, #897); the question is not asked again."
        tell(msg)
        try: R.hc("send", "inspector", msg, timeout=30)
        except Exception: pass
        for p in late: p["alarmed"] = True
    _save(s)
    with ghcache.quick(LONG_S):
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
        rows = [f"{q['key']}  {q['window']}  {q['text']}  {q['url']}" for q in qs] + [f"{k}  answered, record queued (the App posts it when it can write)" for k in sorted(queued_keys())]   # #897
        print("\n".join(rows) or "no open questions"); return 0
    if len(argv) in (2, 3) and argv[0] == "answered":
        ok = mark_answered(argv[1], argv[2] if len(argv) == 3 else "")
        print("marked answered" if ok else "could not mark now (no App token or gh failed): queued, the watchdog posts it as the App"); return 0 if ok else 1
    if argv[:1] == ["archive"]:                              # #912: dry-run unless --apply (the first --apply needs the owner's OK)
        apply = "--apply" in argv
        if apply: s = _state(); s["archive_ok"] = True; _save(s)
        r = archive(apply); print(json.dumps(r, ensure_ascii=False)); return 0 if "error" not in r else 1
    if len(argv) >= 2 and argv[0] == "repair":              # #897: python3 tools/runner/owner_q.py repair KEY KEY (the two 28 Nov answers)
        done = repair([k for k in argv[1:] if re.fullmatch(r"[0-9a-f]{12}", k)]); print(f"re-posted as the App (or queued): {done or 'nothing to repair'}"); return 0
    if len(argv) == 2 and argv[0] == "gate":
        n = int(argv[1].lstrip("#"))
        ics, qcs = gate_read(n)                              # #908: retried with a longer timeout
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
