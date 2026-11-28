"""#220 Owner questions pop up, for every open owner question (the pinned issue 'Questions for the owner', owner_q.py #193:
worker/reviewer PURPLE/cloud QUESTION:/intake/orchestrator). The watchdog calls tick() every minute.
#368: deterministic, no LLM in the critical path:
  - a new open question -> tick itself writes .runs/questions/<key>.json and starts tools/ask/ask.py detached
    (CREATE_NO_WINDOW; ask.py opens the Hebrew page in the default browser), records the page URL from <key>.log
  - tick reads the page's answer (<key>.answers.json) itself -> answer(): relayed, owner_q answered, page stopped
  - #390 phone, at the SAME time as the page (owner 26 Nov 20:15): NOT from a freshly opened window (Claude Code calls a new
    session 'active' and skips the push). One `hc send` line to a long-lived Remote Control session that is idle (PUSHERS:
    inbox, else orchestrator): send this exact push and write a PUSH-RESULT line (#803: no session records an answer). Busy sessions get nothing; the push waits for the next tick with an idle one.
  - its result is read from that session's screen and logged once in watchdog.log: sent / NOT sent / no result line in
    10 min / no idle session for 10 min (Claude Code skips the push while the owner is active on this PC)
  - #440 Telegram, also at the SAME time (telegram.py; token + chat id only in ~/.oren/telegram.env, never logged): the
    question with numbered options; getUpdates polled every tick (offset in .runs/telegram.json); a reply (a number = that
    option, other text = his own answer; Reply or plain text) is
    recorded with answer(); a PC/chat answer posts a short 'answered' note there; 2 h reminder there too
  - #632 Telegram has ONE open question at a time (the next after an answer), so a plain reply is never ambiguous;
    notes (ai-observer, 'PR waits for your merge') go there once as plain notes that wait for nothing
  - first answer wins (page, chat or Telegram); the other side closes (answer() stops ask.py)
  - never two pages for the same question; at most MAX_WINDOWS questions at once, the rest wait (oldest first)
  - answered elsewhere (gone from the open list) -> ask.py stopped
  - question-* windows are not used any more: a live one (old) is unpinned and closed (#310)
  - the owner is never asked inside a terminal: the push line says no AskUserQuestion (Hebrew shows reversed there, #310)
  - unanswered for 2 h -> one reminder push through the same session
  - #803 third channel, the chat with the inspector: `qwin.py chat-answer <key> "<answer>" --quote "<his exact words>"` runs only when
    its process tree goes back to the live inspector terminal (is_inspector); it writes a bot record `via=inspector-chat`, nothing
    else. The watchdog confirms it on Telegram (undo `בטל` within 10 min, `אשר` = at once) and only then (final marker) it is in force
  - #894 a page that died (crash, kill, 24 h timeout) while its question is open is restarted by tick (backoff 1/2/5/10 min); a question
    "answered" but still open 10 min later gets its page again; `qwin.py page <key>` starts / prints the page (the ping says so);
    a reply that is a question back (ends with '?', names no option) is never an answer: relayed, the question stays open
Usage: python tools/runner/qwin.py page <key>   (start or show the page of an open question)
Usage: python tools/runner/qwin.py chat-answer <key> "<answer>" --quote "<quote>"   (the old `answer` CLI is gone, #803)
"""
import json, os, re, signal, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import runner as R
import owner_q as OQ
import trust
import telegram as TG
import recover

MAX_WINDOWS = 3
REMIND_S = 2 * 3600
RESULT_S = 600                                        # #390: no PUSH-RESULT / 'Not sent' on the screen in 10 min -> logged once
NO_IDLE_S = 600                                       # #390: no idle pushing session for 10 min -> logged once
PUSHERS = ("inbox", "orchestrator")                   # #390: long-lived Remote Control sessions that send the phone push
IDLE = ("idle", "done")
BACKOFF_S = (60, 120, 300, 600)                       # #894: a dead page is restarted after 1, 2, 5, 10 min (max 1 per question per tick)
CONFIRM_S = 600                                       # #894: "answered" but still open after 10 min (relay not confirmed) -> the page again
STATE = R.RUNS / "qwin.json"
DIR = R.RUNS / "questions"
ASK = (HERE.parent / "ask" / "ask.py").as_posix()
CHAT_WINDOW_S = 600                                  # #803: a chat answer comes into force 10 min after its Telegram confirmation
CHAT_STATE = OQ.CHAT_STATE
TG_STATE = R.RUNS / "telegram.json"                  # #440: the getUpdates offset

# swapped by the tests
def _hc(*a, **kw): return R.hc(*a, **kw)
def _gh(*a, **kw):
    with R.ghcache.quick(OQ.QUICK_S): return R.gh(*a, **kw)   # #469: never more than 10 s on GitHub per call
_gh_real = _gh
def _app_post(n, text):
    """#800: App-bot post or queue; a fake `_gh` (tests) is used as the App."""
    with R.ghcache.quick(OQ.LONG_S): return OQ.post_or_queue(n, text,   # #912: answer-record write, longer timeout
          _gh if _gh is not _gh_real else None)
def _run(cmd, **kw): return R.run(cmd, **kw)
def _herdr_ok(): return Path(R.HERDR_APP).exists()
def _spawn(cmd, out, err):
    """#368: start ask.py detached, no console window; -> pid."""
    with open(out, "w", encoding="utf-8") as o, open(err, "w", encoding="utf-8") as e:
        return subprocess.Popen(cmd, stdout=o, stderr=e, stdin=subprocess.DEVNULL, cwd=str(HERE.parent.parent),
                                creationflags=R.no_window() | (0x200 if os.name == "nt" else 0),   # + CREATE_NEW_PROCESS_GROUP
                                start_new_session=os.name != "nt").pid
def _alive(pid):
    """#894: is the page process still running? (reaps our own zombie child first; never signals on Windows)"""
    if not pid: return False
    if os.name == "nt":
        try:
            import ctypes
            k = ctypes.windll.kernel32; h = k.OpenProcess(0x1000, False, int(pid))
            if not h: return False
            code = ctypes.c_ulong(); ok = k.GetExitCodeProcess(h, ctypes.byref(code)); k.CloseHandle(h)
            return bool(ok) and code.value == 259
        except Exception: return False
    try:
        if os.waitpid(pid, os.WNOHANG)[0] == pid: return False
    except ChildProcessError: pass
    except Exception: return False
    try: os.kill(pid, 0); return True
    except Exception: return False
def _kill(pid):
    try: os.kill(pid, signal.SIGTERM)
    except Exception: pass
def _send_remote(session, text):
    import remote; return remote.send(session, text)

def log(msg):
    R.RUNS.mkdir(parents=True, exist_ok=True)
    with open(R.RUNS / "watchdog.log", "a", encoding="utf-8") as f:
        f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + "qwin: " + msg + "\n")

def load():
    try: return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception: return {}

def save(s):
    R.RUNS.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(s, ensure_ascii=False), encoding="utf-8")

def issue_no(q):
    m = re.match(r"#(\d+)$", OQ.issue_ref(q.get("source") or "") or OQ.issue_ref(q.get("window") or "") or "")
    return int(m[1]) if m else 0

def win_name(q):
    n = issue_no(q)
    return f"question-{n}" if n else f"question-{q['key'][:6]}"

def plan(open_qs, ts, st, now):
    """Pure: -> (start, close, remind). open_qs: open questions oldest first; ts: herdr terminals; st: {key: {name, since, reminded}}.
    start = questions that get their page + push now; close = keys answered elsewhere; remind = keys pushed, unanswered 2 h (once)."""
    keys = {q["key"] for q in open_qs}
    close = [k for k in st if k not in keys]
    remind = [k for k in st if k in keys and st[k].get("via") and now - st[k]["since"] >= REMIND_S and not st[k].get("reminded")]
    busy = {st[k]["name"] for k in st if k in keys and not st[k].get("answered") and not is_note(st[k])}   # #368: its page is waiting
    start = []
    for q in open_qs:
        if q["key"] in st: continue                     # one window per question, ever (no duplicates after a restart either)
        if is_note(q): start.append(q); continue        # #696: a notice has no page and takes no slot
        name = win_name(q)
        if name in busy or len(busy) >= MAX_WINDOWS: continue   # waits: same issue's earlier question, or 3 windows open
        busy.add(name); start.append(q)
    return start, close, remind

def leftovers(ts):
    """#310/#390: live question-* windows. None is opened any more (the push goes through PUSHERS), so every one is old."""
    return sorted({t["name"] for t in ts if t.get("state") == "live" and (t.get("name") or "").startswith("question-")})

def close_window(name):
    pin(name, False); _hc("kill", name, timeout=30); _hc("rm", name, timeout=30)

def split_options(text):
    """'question? 1) a 2) b' -> ('question?', ['a', 'b']); no numbered options -> (text, [])."""
    parts = re.split(r"\s*(?<!\d)\b(\d)[.)]\s+", (text or "").strip())
    nums = parts[1::2]
    if len(nums) >= 2 and nums == [str(i) for i in range(1, len(nums) + 1)]:
        return parts[0].strip(), [o.strip() for o in parts[2::2]]
    return (text or "").strip(), []

def headline(q):
    """#699: ('one Hebrew line', options, details): the first line of the question; everything else is details (hidden under 'עוד')."""
    first, _, rest = (q.get("text", "") or "").strip().partition("\n")
    text, opts = split_options(first)
    return text, opts, rest.strip()

def page_data(q):
    """#368: the Hebrew page (tools/ask) for one question: the options as buttons (+ own answer), else a free answer.
    #699: one line first, the details collapsed under 'עוד'."""
    text, opts, rest = headline(q)
    item = {"id": "a", "text": text, "options": opts, "other": True} if opts else {"id": "a", "text": text, "free": True}
    if rest: item["details"] = rest
    return {"title": "שאלה ממערכת המשחק", "intro": "בחר תשובה ולחץ שלח.", "questions": [item]}

def reopen_hint(q):
    """#894: how to get the page back when it is gone."""
    return f"\nהדף נסגר? python tools/runner/qwin.py page {q['key']}" if q.get("key") else ""

def push_text(q):
    """#368: the exact phone push: the question, numbered options, how to answer."""
    text, opts, _ = headline(q)
    return text + "".join(f"\n{i}. {o}" for i, o in enumerate(opts, 1)) + (
        "\nענה במספר בצ'אט, או בדף שנפתח בדפדפן" if opts else "\nענה בצ'אט, או בדף שנפתח בדפדפן") + reopen_hint(q)

def tg_text(q):
    """#440: the Telegram message: the question line, numbered options, how to answer; #699: no details, the page link instead."""
    text, opts, rest = headline(q)
    link = page_url(q["key"]) if q.get("key") else ""
    return text + "".join(f"\n{i}. {o}" for i, o in enumerate(opts, 1)) + (
        "\nענה במספר או במילים (Reply להודעה הזו), או בדף שנפתח במחשב" if opts else "\nענה כאן (Reply להודעה הזו), או בדף שנפתח במחשב") + (
        f"\nפרטים: {link}" if rest and link else "") + reopen_hint(q)

def question_back(text, q_text):
    """#894: a reply that is a question back (ends with '?' and names no option) is never an answer."""
    t = (text or "").strip()
    if not t.endswith(("?", "\uff1f")): return False
    opts = split_options(q_text)[1]
    low = t.lower()
    if any(o.lower().replace("(מומלץ)", "").strip() and o.lower().replace("(מומלץ)", "").strip() in low for o in opts): return False
    return not any(n.isdigit() and 1 <= int(n) <= len(opts) for n in re.findall(r"\d+", t))

def relay_question_back(key, q_text, text, src=""):
    """#894: not an answer: no record, no gate; the orchestrator/inspector get it as a follow-up question; the question stays open."""
    for who in ("orchestrator", "inspector"):
        _hc("send", who, R.one_line(f"OWNER FOLLOW-UP QUESTION (not an answer; the question {src or key} stays open, its page stays live): "
            f"{(q_text or '')[:200]} -> owner asks back: {text}"), timeout=30)
    log(f"{key}: the reply is a question back, not an answer (relayed, question stays open)")

def tg_answer(q_text, reply):
    """#440: '2' -> the 2nd option's text; anything else is his own answer."""
    opts = split_options(q_text)[1]
    return opts[int(reply) - 1] if reply.isdigit() and 1 <= int(reply) <= len(opts) else reply

def is_note(e):
    """#632: not a question (nothing to answer): ai-observer notes, 'PR #n waits for your merge'."""
    return (e.get("source") or "").startswith("ai-observer") or bool(re.match(r"PR #\d+ waits for your merge", e.get("text") or ""))

def tg_send(st, now):
    """#440/#632: open questions go to Telegram ONE at a time (oldest first): the next one only after the current one is
    answered (page, chat or Telegram), so a plain reply always has one question. Notes go once as plain notes, waiting for
    nothing. A failure is logged once and retried next tick."""
    if not TG.config(): return
    for key, e in st.items():
        if e.get("answered") or e.get("tg") or e.get("tg_note") or not is_note(e): continue
        mid = TG.send(e.get("text", ""))     # #696: the whole text
        if mid: e["tg_note"] = mid; log(f"{e['name']}: telegram note sent for {key}")
    if not any(e.get("tg") and not e.get("answered") and not is_note(e) for e in st.values()):   # an old-state note never blocks
        nxt = sorted(((e["since"], i, k) for i, (k, e) in enumerate(st.items())
                      if not e.get("answered") and not e.get("tg") and not is_note(e)), key=lambda x: x[:2])
        for _, _, key in nxt[:1]:
            e = st[key]; mid = TG.send(tg_text(e))
            if mid: e["tg"], e["tg_at"] = mid, now; log(f"{e['name']}: telegram message sent for {key}")
            elif not e.get("tg_fail"): e["tg_fail"] = True; log(f"{e['name']}: telegram NOT sent for {key} (retried every tick)")
    for key, e in st.items():                             # 2 h unanswered: one reminder there, as a reply to the question
        if e.get("tg") and not e.get("answered") and not e.get("tg_reminded") and now - e.get("tg_at", e["since"]) >= REMIND_S:
            r = TG.send("תזכורת: שעתיים בלי תשובה.\n" + tg_text(e), reply_to=e["tg"])
            if r: e["tg_reminded"], e["tg_r"] = True, r; log(f"{e['name']}: 2 h reminder in telegram")

def tg_poll(st):
    """#440: read the owner's Telegram replies (getUpdates, offset in .runs) and record each one like a page answer."""
    wait = {k: e for k, e in st.items() if e.get("tg") and not e.get("answered") and not is_note(e)}
    if not TG.config() or not (wait or load_chat()): return
    try: off = json.loads(TG_STATE.read_text(encoding="utf-8")).get("offset", 0)
    except Exception: off = 0
    new, msgs = TG.messages(off)
    if new != off: R.RUNS.mkdir(parents=True, exist_ok=True); TG_STATE.write_text(json.dumps({"offset": new}), encoding="utf-8")
    for m in msgs:
        if chat_command(st, m): continue                  # #803: `בטל` / `אשר` for a pending inspector-chat answer
        wait = {k: e for k, e in st.items() if e.get("tg") and not e.get("answered") and not is_note(e)}
        key = next((k for k, e in st.items() if m["reply_to"] and m["reply_to"] in (e.get("tg"), e.get("tg_r"))), None)
        if key is None and not m["reply_to"]:            # #632: at most one question is out: a plain reply is its answer
            fresh = [k for k, e in wait.items() if m["date"] >= e.get("tg_at", e["since"]) - 60]   # never an old message
            if len(fresh) == 1: key = fresh[0]
            elif len(fresh) > 1: TG.send("יש כמה שאלות פתוחות: ענה ב-Reply להודעה של השאלה.", reply_to=m["id"]); continue   # old state only (before #632)
        if key not in wait: continue                      # answered already (first answer wins) or not a question
        e = wait[key]
        if answer(key, tg_answer(e.get("text", ""), m["text"]), from_tg=True).get("question_back"):
            TG.send("זו שאלה חזרה, לא תשובה: הועברה הלאה. השאלה נשארת פתוחה.", reply_to=m["id"]); continue
        e["answered"] = True; e["answered_at"] = time.time()
        log(f"{e['name']}: answered in telegram")

def push_message(q):
    """#390: the ONE line a long-lived idle session gets (hc send): push this text, report. #803: no session records an answer."""
    return R.one_line(
        f"PHONE PUSH (owner-q:{q['key']}, #390): send ONE PushNotification with exactly this text: {R.one_line(push_text(q))} "
        f"-- Right after it, write one line: PUSH-RESULT <key> ok, or PUSH-RESULT <key> failed <the reason the tool gave>. "
        "The owner answers on the page, in Telegram, or in the chat with the inspector (never record an answer yourself). "
        "Never ask him inside the terminal (no AskUserQuestion: Hebrew shows reversed there). Then go on with your own work.")

OPEN_FAILS = [0]   # #842: count of pages that could not open; the watchdog backs off while it grows

def start_page(q):
    """#368: write <key>.json and start ask.py ourselves -> pid (0 = could not start)."""
    DIR.mkdir(parents=True, exist_ok=True)
    base = DIR / q["key"]
    (DIR / f"{q['key']}.json").write_text(json.dumps(page_data(q), ensure_ascii=False), encoding="utf-8")
    try: return _spawn([sys.executable, ASK, (DIR / f"{q['key']}.json").as_posix(), "--timeout-min", "1440"],
                       str(base) + ".out", str(base) + ".log")
    except Exception as e: OPEN_FAILS[0] += 1; log(f"could not start ask.py for {q['key']}: {e}"); return 0

def page_url(key):
    try: return next((l.strip() for l in (DIR / f"{key}.log").read_text(encoding="utf-8").splitlines() if l.startswith("http")), "")
    except Exception: return ""

def page_answer(key):
    """The page's answer (ask.py wrote <key>.answers.json) or None."""
    try: a = json.loads((DIR / f"{key}.answers.json").read_text(encoding="utf-8")).get("answers", {}).get("a")
    except Exception: return None
    if a is None: return None
    return ", ".join(map(str, a)) if isinstance(a, list) else str(a)

def pin(name, on):
    info = {}
    for line in reversed((_hc("get", name, "--json", timeout=30)[1] or "").strip().splitlines()):
        try: info = json.loads(line); break
        except ValueError: continue
    if info.get("address") and _herdr_ok():
        _run([R.HERDR_APP, "do", "terminal.pin", "--terminal", info["address"], "--pinned", "true" if on else "false"], timeout=30)
    return info.get("address", "")

def new_entry(q, now):
    name = win_name(q)
    return {"name": name, "since": now, "source": q.get("source", ""), "issue": issue_no(q), "text": q.get("text", ""),
            "gates": q.get("gates", []), "pid": 0 if is_note(q) else start_page(q), "last_start": now, "restarts": 0}

def restart_page(key, e, now, why):
    """#894: the page again (old answers file dropped, new URL read from the new log); logged once."""
    try: (DIR / f"{key}.answers.json").unlink()
    except OSError: pass
    e["pid"] = start_page({"key": key, "text": e.get("text", "")}); e["last_start"] = now; e["page"] = ""
    e["restarts"] = max(e.get("restarts", 0), 0) + 1
    log(f"{e['name']}: page restarted for {key} ({why}; pid {e['pid']})")

def keep_page_alive(key, e, now):
    """#894: an open, unanswered question always has a live page: dead -> restarted with backoff 1, 2, 5, 10 min."""
    if _alive(e.get("pid")):
        if now - e.get("last_start", e["since"]) >= BACKOFF_S[-1]: e["restarts"] = 0     # it lived: start the backoff over
        return
    n = e.get("restarts", 0)
    if now - e.get("last_start", e["since"]) >= BACKOFF_S[min(n, len(BACKOFF_S) - 1)]:
        restart_page(key, e, now, "it was not running")

def page_cmd(key, now=None):
    """#894: `qwin.py page <key>`: start the page of an open question, or print the URL of the live one. -> (rc, message)"""
    now = time.time() if now is None else now
    qs = OQ.open_list()
    if qs is None: return 1, "cannot read the open questions now: try again"
    q = next((q for q in qs if q["key"] == key), None)
    if not q: return 1, f"no open question {key}"
    st = load(); e = st.get(key)
    if e is None: e = st[key] = new_entry(q, now); log(f"{e['name']}: page started for {key} by hand (pid {e['pid']})")
    elif not _alive(e.get("pid")): e["answered"] = False; e.pop("answered_at", None); restart_page(key, e, now, "asked by hand")
    save(st)
    for _ in range(50):
        if page_url(key): break
        time.sleep(0.1)
    return 0, page_url(key) or "page starting: run the command again in a few seconds"

def tick(ts, now=None):
    """One watchdog pass: start pages and their phone pushes together, read the answers, remind, check push results."""
    now = time.time() if now is None else now
    qs = OQ.open_list()
    if qs is None: return
    st = load()
    start, close, remind = plan(qs, ts, st, now)
    for name in leftovers(ts):
        close_window(name); log(f"{name}: old question window closed (#390: the push goes through {'/'.join(PUSHERS)})")
    for k in close:
        e = st.pop(k)
        if e.get("pid") and _alive(e["pid"]): _kill(e["pid"])               # answered (confirmed closed) or elsewhere: the page goes too
        if e.get("tg") and not e.get("answered"): TG.send("✓ השאלה נענתה", reply_to=e["tg"])   # #440
        log(f"{e['name']}: answered, closed")
    for q in start:                                       # #368: the page, started by python itself
        name, key = win_name(q), q["key"]
        st[key] = new_entry(q, now)
        log(f"{name}: page started for {key} (pid {st[key]['pid']})")
    idle = [t["name"] for n in PUSHERS for t in ts if t.get("name") == n and t.get("state") == "live" and t.get("status") in IDLE]
    for key, e in st.items():
        if is_note(e): continue
        if e.get("answered") and "answered_at" not in e: e["answered_at"] = now
        if e.get("answered") and now - e["answered_at"] >= CONFIRM_S:     # #894: answered, but still open: the relay did not close it
            e["answered"] = False; e.pop("answered_at", None); e["restarts"] = 0
            if not _alive(e.get("pid")): restart_page(key, e, now, "answered but still open")
        if e.get("answered"): continue                  # #696: a notice: no page, no push, nothing to answer
        if not e.get("page") and page_url(key): e["page"] = page_url(key); log(f"{e['name']}: page at {e['page']}")
        a = page_answer(key)
        if a is not None:                                 # #368: the page answered: relay it ourselves
            if answer(key, a, from_page=True, tg=e.get("tg", 0)).get("question_back"):
                e["restarts"] = -1                          # a question back: the page (it exited) comes back at once, backoff over
                if not _alive(e.get("pid")): restart_page(key, e, now, "question back, not an answer")
                else: (DIR / f"{key}.answers.json").unlink(missing_ok=True)
            else:
                e["answered"] = True; e["answered_at"] = now; log(f"{e['name']}: answered on the page")
                continue
        keep_page_alive(key, e, now)
        if e.get("via"): continue
        if not idle:                                      # #390: busy sessions get nothing; next tick
            if now - e["since"] >= NO_IDLE_S and not e.get("no_idle"):
                e["no_idle"] = True; log(f"{e['name']}: no idle session ({'/'.join(PUSHERS)}) for {NO_IDLE_S // 60} min: phone push not sent yet, only the page has the question")
            continue
        via = idle.pop(0)                                 # one push per session per tick
        if _hc("send", via, push_message({"key": key, "text": e.get("text", "")}), timeout=30)[0] == 0:
            e["via"], e["pushed"] = via, now; log(f"{e['name']}: phone push for {key} handed to {via}")
    for k in remind:
        e = st[k]
        if e.get("answered") or e.get("via") not in idle: continue    # its session busy: next tick
        idle.remove(e["via"])
        if _hc("send", e["via"], "WATCHDOG REMINDER: 2 hours without an answer. " + push_message({"key": k, "text": e.get("text", "")}), timeout=30)[0] == 0:
            e["reminded"] = True; log(f"{e['name']}: 2 h reminder via {e['via']}")
    check_pushes(st, now)
    tg_poll(st); tg_send(st, now)                         # #440; #632 poll first: an answer sends the next one now
    chat_tick(st, qs, now)                                # #803: confirm, undo, bring into force
    save(st)

def push_result(screen, key):
    """#390: -> 'ok' / 'failed' / None from the pushing session's screen, after the last request for this key."""
    seg = (screen or "").split(f"owner-q:{key}")[-1] if f"owner-q:{key}" in (screen or "") else ""
    if "Not sent" in seg or re.search(rf"PUSH-RESULT {re.escape(key)} failed", seg): return "failed"
    if re.search(rf"PUSH-RESULT {re.escape(key)} ok", seg): return "ok"
    return None

def check_pushes(st, now=None):
    """#390: read each push's result on its session's screen; say it in watchdog.log once per question."""
    now = time.time() if now is None else now
    for e in st.values():
        if not e.get("via") or e.get("answered") or e.get("not_sent") or e.get("push_ok"): continue
        r = push_result(_hc("read", e["via"], "--lines", "80", timeout=30)[1], next(k for k, v in st.items() if v is e))
        if r == "failed":
            e["not_sent"] = True
            log(f"{e['name']}: phone push NOT sent by {e['via']} (Claude Code: owner active in that terminal); the browser page "
                "and Telegram (#440) have the question")
        elif r == "ok":
            e["push_ok"] = True; log(f"{e['name']}: phone push sent by {e['via']}")
        elif now - e.get("pushed", now) >= RESULT_S and not e.get("no_result"):
            e["no_result"] = True; log(f"{e['name']}: no push result from {e['via']} in {RESULT_S // 60} min")

def session_of(n):
    try: return json.loads((R.RUNS / str(n) / "remote.json").read_text(encoding="utf-8")).get("session", "")
    except Exception: pass
    rc, out = _gh("issue", "view", str(n), "--json", "comments")
    try: bodies = [c.get("body", "") for c in trust.only(json.loads(out).get("comments", []))] if rc == 0 else []
    except ValueError: bodies = []
    return next((m[0].rsplit("/", 1)[-1] for b in reversed(bodies) for m in [re.search(r"https://claude\.ai/code/session_\w+", b or "")] if m), "")

def answer(key, text, from_page=False, from_tg=False, tg=0, records=True):
    """Relay the owner's answer: comment on the source issue, ANSWERED in the questions issue, tell the orchestrator,
    and a cloud worker (remote-<n>) gets it in its session. -> dict of what was done."""
    st = load()
    qt = (st.get(key) or {}).get("text") or next((q.get("text", "") for q in OQ.open_list() or [] if q["key"] == key), "")
    if question_back(text, qt):                          # #894: never an answer: no record, no ANSWERED, no gate
        relay_question_back(key, qt, text, (st.get(key) or {}).get("source", "")); return {"question_back": True}
    info = st.get(key) or next(({"source": q.get("source", ""), "issue": issue_no(q), "text": q.get("text", ""),
                                      "gates": q.get("gates", [])}
                                     for q in OQ.open_list() or [] if q["key"] == key), {})
    n, src, done = info.get("issue", 0), info.get("source", ""), {}
    if n and records: done["issue"] = _app_post(n, OQ.answer_body(key, text))      # #800: the record is written only by the App bot; queued when it cannot
    for g in [g for g in info.get("gates", []) if g != n and records]:     # #630: the record also on each issue the question gates
        done.setdefault("gates", {})[g] = _app_post(g, OQ.answer_body(key, text))
    done["answered"] = OQ.mark_answered(key, text)
    resumes = src.startswith("remote-") and n and R.where_of(n) == "remote"   # #135: runner-managed: the watchdog resumes the session from the issue comment
    if src.startswith("remote-") and n and not resumes:
        s = session_of(n)
        done["remote"] = bool(s) and _send_remote(s, f"OWNER ANSWER to your QUESTION on #{n}: {text}\nContinue the issue with this answer.").get("ok", False)
    _hc("send", "orchestrator", f"OWNER ANSWERED (question window, {src or key}): {info.get('text', '')[:200]} -> {text}\n"
        + ("The runner resumes the cloud session with it (#135). " if resumes else "The cloud session got it (remote.py send). " if done.get("remote") else f"Relay it to {src or 'the asker'} (hc send / the menu option). ")
        + "Unpark the issue if it was parked.", timeout=30)
    if info.get("pid") and not from_page and not info.get("answered"):
        _kill(info["pid"]); done["stopped"] = True            # #368: the chat won: the page (ask.py) goes
    tg = tg or info.get("tg", 0)
    if tg and not from_tg and not info.get("answered"):
        done["telegram"] = bool(TG.send(f"✓ נענתה במחשב: {text}", reply_to=tg))   # #440: the PC answer, a short note there
    if key in st: st[key]["answered"] = True; save(st)
    return done

# ---------- #803: the inspector chat channel ----------
def load_chat():
    try: return json.loads(CHAT_STATE.read_text(encoding="utf-8"))
    except Exception: return {}

def save_chat(c):
    R.RUNS.mkdir(parents=True, exist_ok=True)
    CHAT_STATE.write_text(json.dumps(c, ensure_ascii=False), encoding="utf-8")

def _norm(p): return str(p or "").replace("\\", "/").rstrip("/").lower()

def _term_pid(t):
    fg = t.get("foreground") if isinstance(t.get("foreground"), dict) else {}
    return fg.get("pid") or t.get("foreground_pid") or t.get("pid")

def _term_cwd(t):
    fg = t.get("foreground") if isinstance(t.get("foreground"), dict) else {}
    return t.get("cwd") or fg.get("cwd") or ""

def is_inspector(chain_pids, terminals, inspector_dir):
    """Pure (#803): True only when exactly ONE live terminal has the control role inspector, its foreground is `claude` with
    `--remote-control oren-inspector` in the inspector folder, and that claude pid is in the caller's parent chain.
    terminals None (herdr unreadable) or anything else -> False."""
    if not terminals: return False
    ins = [t for t in terminals if t.get("state", "live") == "live" and recover.control_role(t) == "inspector"]
    if len(ins) != 1: return False
    t = ins[0]; a = recover._argv(t)
    if not a or not re.match(r"claude(\.exe|\.cmd)?$", re.split(r"[\\/]", a[0])[-1].lower()): return False
    if not any(x == "--remote-control" and a[i + 1] == "oren-inspector" for i, x in enumerate(a[:-1])): return False
    if _norm(_term_cwd(t)) != _norm(inspector_dir): return False
    pid = _term_pid(t)
    return bool(pid) and pid in set(chain_pids or [])

def chain_pids(limit=16):
    """Our own parent-process chain on Windows (ctypes Toolhelp snapshot, at most `limit` steps); [] elsewhere or on any failure."""
    if os.name != "nt": return []
    try:
        import ctypes
        from ctypes import wintypes
        class PE(ctypes.Structure):
            _fields_ = [("dwSize", wintypes.DWORD), ("cntUsage", wintypes.DWORD), ("th32ProcessID", wintypes.DWORD),
                        ("th32DefaultHeapID", ctypes.c_void_p), ("th32ModuleID", wintypes.DWORD), ("cntThreads", wintypes.DWORD),
                        ("th32ParentProcessID", wintypes.DWORD), ("pcPriClassBase", ctypes.c_long), ("dwFlags", wintypes.DWORD),
                        ("szExeFile", ctypes.c_wchar * 260)]
        k = ctypes.windll.kernel32; k.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
        snap = k.CreateToolhelp32Snapshot(2, 0); parent = {}
        pe = PE(); pe.dwSize = ctypes.sizeof(PE); ok = k.Process32FirstW(snap, ctypes.byref(pe))
        while ok:
            parent[pe.th32ProcessID] = pe.th32ParentProcessID; ok = k.Process32NextW(snap, ctypes.byref(pe))
        k.CloseHandle(snap)
        out, pid = [], os.getpid()
        for _ in range(limit):
            if pid not in parent: break
            out.append(pid); pid = parent[pid]
        return out + [pid] if pid else out
    except Exception: return []

def live_terminals():
    """hc ls --json, then hc get <t> --json for each live terminal -> list of merged dicts, or None when herdr is unreadable."""
    rc, out = _hc("ls", "--json", timeout=30)
    if rc: return None
    rows = None
    for line in reversed((out or "").strip().splitlines()):
        try: rows = json.loads(line).get("terminals"); break
        except (ValueError, AttributeError): continue
    if rows is None: return None
    res = []
    for r in rows:
        if r.get("state", "live") != "live": continue
        d = {}
        for line in reversed((_hc("get", r.get("address") or r.get("name") or "", "--json", timeout=30)[1] or "").strip().splitlines()):
            try: d = json.loads(line); break
            except ValueError: continue
        res.append({**r, **d})
    return res

def _inspector_dir(): return Path(R.MAIN_CHECKOUT).parent
def _chain(): return chain_pids()

def refuse(why):
    log(f"chat-answer REFUSED: {why}")
    TG.send("תשובה מהצ'אט נדחתה: ניסיון מסשן אחר (לא האינספקטור). לא נרשם כלום.")
    return 1

def chat_answer(key, text, quote):
    """#803: the inspector records the owner's chat answer: one bot record per issue, nothing else. -> (exit code, message)."""
    quote = R.redact((quote or "").strip())
    if not quote or len(quote) > 500: return 2, "--quote is required (1-500 characters: the owner's exact words)"
    if not is_inspector(_chain(), live_terminals(), _inspector_dir()): refuse("the caller is not the inspector"); return 1, "refused: not the inspector"
    info = next(({"issue": issue_no(q), "gates": q.get("gates", []), "text": q.get("text", "")} for q in OQ.open_list() or [] if q["key"] == key), None)
    if not info: return 1, f"no open question {key}"
    if question_back(text, info["text"]): relay_question_back(key, info["text"], text); return 1, "that is a question back, not an answer: relayed, the question stays open"
    body = OQ.chat_answer_body(key, text, quote)
    for n in dict.fromkeys([info["issue"], *info["gates"]]):
        if n: _app_post(n, body)
    log(f"chat answer recorded for {key} (waits for the Telegram confirmation)")
    return 0, "recorded: waits for the Telegram confirmation (10 min to undo)"

def _issues_of(e): return [n for n in dict.fromkeys([e.get("issue", 0), *e.get("gates", [])]) if n]

def _post_all(e, text):
    for n in _issues_of(e): _app_post(n, text)

def _find_chat(e):
    """The chat answer on the question's issues (bot-written, #800) -> {'answer','final','undo'} or None, for the key found."""
    out = {}
    for n in _issues_of(e):
        for k, v in OQ.chat_states(OQ.comments(n) or []).items():
            o = out.setdefault(k, {"answer": v["answer"], "quote": v.get("quote", ""), "final": False, "undo": False})
            o["final"] |= v["final"]; o["undo"] |= v["undo"]
    return out

def finalize(key, e, c, now):
    """The chat answer is in force: final marker, then what answer() does (ANSWERED, relay, page stopped), `✓ נכנסה לתוקף`."""
    _post_all(e, f"<!-- owner-answer-final:{key} -->")
    answer(key, c["answer"], from_tg=True, records=False); e["answered"] = True
    c["final"] = True
    if e.get("tg"): TG.send("✓ נכנסה לתוקף", reply_to=e["tg"])
    elif c.get("mid"): TG.send("✓ נכנסה לתוקף", reply_to=c["mid"])
    log(f"{e['name']}: chat answer in force for {key}")

def chat_command(st, m):
    """#803: a Telegram `בטל` / `אשר` -> True when it was for a chat answer (reply to its confirmation, or the one pending)."""
    cmd = (m.get("text") or "").strip()
    if cmd not in ("בטל", "אשר"): return False
    cs = load_chat()
    key = next((k for k, c in cs.items() if m.get("reply_to") and c.get("mid") == m["reply_to"]), None)
    if key is None and not m.get("reply_to"):
        pend = [k for k, c in cs.items() if c.get("mid") and not c.get("final") and not c.get("undo")]
        key = pend[0] if len(pend) == 1 else None
    if key is None: return False
    c, e = cs[key], st.get(key) or {}
    if c.get("final"): TG.send("מאוחר מדי: התשובה כבר בתוקף.", reply_to=m["id"]); return True
    if c.get("undo"): return True
    if cmd == "בטל":
        _post_all(e, f"<!-- owner-answer-undo:{key} -->"); c["undo"] = True
        TG.send("בוטל. השאלה פתוחה שוב.", reply_to=m["id"]); log(f"chat answer for {key} undone by the owner")
    else:
        finalize(key, e, c, 0)
    save_chat(cs)
    return True

def chat_tick(st, qs, now):
    """#803 watchdog pass: confirm each new chat record on Telegram once, bring it into force 10 min after the confirmation,
    one alarm when it cannot be confirmed; a question answered elsewhere never gets its chat answer in force."""
    cs, open_keys = load_chat(), {q["key"] for q in qs}
    for k in [k for k in cs if k not in open_keys or (st.get(k) or {}).get("answered") and not cs[k].get("final")]: cs.pop(k)
    for key, e in st.items():
        if e.get("answered") or key not in open_keys or is_note(e): continue
        found = _find_chat(e).get(key)
        if not found or found["undo"]: continue
        c = cs.setdefault(key, {"answer": found["answer"], "quote": found.get("quote", ""), "seen": now})
        if c.get("final") or c.get("undo"): continue
        if found["final"] and not c.get("final"): finalize(key, e, c, now); continue
        if not c.get("mid"):
            mid = TG.send(f"נרשמה תשובה מהצ'אט עם האינספקטור: {c.get('quote') or c['answer']} — לביטול תוך 10 דקות: השב \"בטל\" להודעה הזו. \"אשר\" = בתוקף מיד.", reply_to=e.get("tg", 0))
            if mid: c["mid"], c["sent_at"] = mid, now
            elif now - c["seen"] >= CHAT_WINDOW_S and not c.get("alarm"):
                c["alarm"] = True
                for who in ("inspector", "orchestrator"):
                    _hc("send", who, f"chat answer {key} not confirmed: ask the owner to answer on the page or in Telegram", timeout=30)
                log(f"chat answer {key} not confirmed (Telegram off or failing)")
        elif now - c["sent_at"] >= CHAT_WINDOW_S: finalize(key, e, c, now)
    save_chat(cs)

def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) >= 1 and argv[0] == "answer":
        print("refused: the owner's answer is recorded on the page, in Telegram, or with `chat-answer` by the inspector (#803)"); return 2
    if len(argv) >= 3 and argv[0] == "chat-answer":
        quote = argv[argv.index("--quote") + 1] if "--quote" in argv[:-1] else ""
        rc, msg = chat_answer(argv[1], argv[2], quote); print(msg); return rc
    if len(argv) == 2 and argv[0] == "page":
        rc, msg = page_cmd(argv[1]); print(msg); return rc
    print(__doc__); return 2

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
