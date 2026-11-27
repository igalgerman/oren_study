"""#220 Owner questions pop up, for every open owner question (the pinned issue 'Questions for the owner', owner_q.py #193:
worker/reviewer PURPLE/cloud QUESTION:/intake/orchestrator). The watchdog calls tick() every minute.
#368: deterministic, no LLM in the critical path:
  - a new open question -> tick itself writes .runs/questions/<key>.json and starts tools/ask/ask.py detached
    (CREATE_NO_WINDOW; ask.py opens the Hebrew page in the default browser), records the page URL from <key>.log
  - tick reads the page's answer (<key>.answers.json) itself -> answer(): relayed, owner_q answered, page stopped
  - #390 phone, at the SAME time as the page (owner 26 Nov 20:15): NOT from a freshly opened window (Claude Code calls a new
    session 'active' and skips the push). One `hc send` line to a long-lived Remote Control session that is idle (PUSHERS:
    inbox, else orchestrator): send this exact push, write a PUSH-RESULT line, and run `qwin.py answer <key> "<reply>"` when
    the owner answers in that chat. Busy sessions get nothing; the push waits for the next tick with an idle one.
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
Usage: python tools/runner/qwin.py answer <key> "<answer>"
"""
import json, os, re, signal, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import runner as R
import owner_q as OQ
import telegram as TG

MAX_WINDOWS = 3
REMIND_S = 2 * 3600
RESULT_S = 600                                        # #390: no PUSH-RESULT / 'Not sent' on the screen in 10 min -> logged once
NO_IDLE_S = 600                                       # #390: no idle pushing session for 10 min -> logged once
PUSHERS = ("inbox", "orchestrator")                   # #390: long-lived Remote Control sessions that send the phone push
IDLE = ("idle", "done")
STATE = R.RUNS / "qwin.json"
DIR = R.RUNS / "questions"
ASK = (HERE.parent / "ask" / "ask.py").as_posix()
TG_STATE = R.RUNS / "telegram.json"                  # #440: the getUpdates offset

# swapped by the tests
def _hc(*a, **kw): return R.hc(*a, **kw)
def _gh(*a, **kw):
    with R.ghcache.quick(OQ.QUICK_S): return R.gh(*a, **kw)   # #469: never more than 10 s on GitHub per call
def _run(cmd, **kw): return R.run(cmd, **kw)
def _herdr_ok(): return Path(R.HERDR_APP).exists()
def _spawn(cmd, out, err):
    """#368: start ask.py detached, no console window; -> pid."""
    with open(out, "w", encoding="utf-8") as o, open(err, "w", encoding="utf-8") as e:
        return subprocess.Popen(cmd, stdout=o, stderr=e, stdin=subprocess.DEVNULL, cwd=str(HERE.parent.parent),
                                creationflags=R.no_window() | (0x200 if os.name == "nt" else 0),   # + CREATE_NEW_PROCESS_GROUP
                                start_new_session=os.name != "nt").pid
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
    busy = {st[k]["name"] for k in st if k in keys and not st[k].get("answered")}   # #368: its page is waiting
    start = []
    for q in open_qs:
        if q["key"] in st: continue                     # one window per question, ever (no duplicates after a restart either)
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

def page_data(q):
    """#368: the Hebrew page (tools/ask) for one question: the options as buttons (+ own answer), else a free answer."""
    text, opts = split_options(q.get("text", ""))
    item = {"id": "a", "text": text, "options": opts, "other": True} if opts else {"id": "a", "text": text, "free": True}
    return {"title": "שאלה ממערכת המשחק", "intro": "בחר תשובה ולחץ שלח.", "questions": [item]}

def push_text(q):
    """#368: the exact phone push: the question, numbered options, how to answer."""
    text, opts = split_options(q.get("text", ""))
    return text + "".join(f"\n{i}. {o}" for i, o in enumerate(opts, 1)) + (
        "\nענה במספר בצ'אט, או בדף שנפתח בדפדפן" if opts else "\nענה בצ'אט, או בדף שנפתח בדפדפן")

def tg_text(q):
    """#440: the Telegram message: the question, numbered options, how to answer."""
    text, opts = split_options(q.get("text", ""))
    return text + "".join(f"\n{i}. {o}" for i, o in enumerate(opts, 1)) + (
        "\nענה במספר או במילים (Reply להודעה הזו), או בדף שנפתח במחשב" if opts else "\nענה כאן (Reply להודעה הזו), או בדף שנפתח במחשב")

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
        mid = TG.send(R.one_line(e.get("text", "")))
        if mid: e["tg_note"] = mid; log(f"{e['name']}: telegram note sent for {key}")
    if not any(e.get("tg") and not e.get("answered") for e in st.values()):
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
    wait = {k: e for k, e in st.items() if e.get("tg") and not e.get("answered")}
    if not wait or not TG.config(): return
    try: off = json.loads(TG_STATE.read_text(encoding="utf-8")).get("offset", 0)
    except Exception: off = 0
    new, msgs = TG.messages(off)
    if new != off: R.RUNS.mkdir(parents=True, exist_ok=True); TG_STATE.write_text(json.dumps({"offset": new}), encoding="utf-8")
    for m in msgs:
        wait = {k: e for k, e in st.items() if e.get("tg") and not e.get("answered")}
        key = next((k for k, e in st.items() if m["reply_to"] and m["reply_to"] in (e.get("tg"), e.get("tg_r"))), None)
        if key is None and not m["reply_to"]:            # #632: at most one question is out: a plain reply is its answer
            key = next((k for k, e in wait.items() if m["date"] >= e.get("tg_at", e["since"]) - 60), None)   # never an old message
        if key not in wait: continue                      # answered already (first answer wins) or not a question
        e = wait[key]
        answer(key, tg_answer(e.get("text", ""), m["text"]), from_tg=True); e["answered"] = True
        log(f"{e['name']}: answered in telegram")

def push_message(q):
    """#390: the ONE line a long-lived idle session gets (hc send): push this text, report, relay the chat answer."""
    py = sys.executable.replace("\\", "/")
    return R.one_line(
        f"PHONE PUSH (owner-q:{q['key']}, #390): send ONE PushNotification with exactly this text: {R.one_line(push_text(q))} "
        f"-- Right after it, write one line: PUSH-RESULT <key> ok, or PUSH-RESULT <key> failed <the reason the tool gave>. "
        f"When the owner answers it in this chat (a number = that option, other text = his own answer), run once: "
        f"{py} {(HERE / 'qwin.py').as_posix()} answer {q['key']} \"<the answer, as given>\" "
        "Never ask him inside the terminal (no AskUserQuestion: Hebrew shows reversed there). Then go on with your own work.")

def start_page(q):
    """#368: write <key>.json and start ask.py ourselves -> pid (0 = could not start)."""
    DIR.mkdir(parents=True, exist_ok=True)
    base = DIR / q["key"]
    (DIR / f"{q['key']}.json").write_text(json.dumps(page_data(q), ensure_ascii=False), encoding="utf-8")
    try: return _spawn([sys.executable, ASK, (DIR / f"{q['key']}.json").as_posix(), "--timeout-min", "1440"],
                       str(base) + ".out", str(base) + ".log")
    except Exception as e: log(f"could not start ask.py for {q['key']}: {e}"); return 0

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
        if e.get("pid") and not e.get("answered"): _kill(e["pid"])          # answered elsewhere: the page goes too
        if e.get("tg") and not e.get("answered"): TG.send("✓ השאלה נענתה", reply_to=e["tg"])   # #440
        log(f"{e['name']}: answered, closed")
    for q in start:                                       # #368: the page, started by python itself
        name, key = win_name(q), q["key"]
        st[key] = {"name": name, "since": now, "source": q.get("source", ""), "issue": issue_no(q), "text": q.get("text", ""),
                   "pid": start_page(q)}
        log(f"{name}: page started for {key} (pid {st[key]['pid']})")
    idle = [t["name"] for n in PUSHERS for t in ts if t.get("name") == n and t.get("state") == "live" and t.get("status") in IDLE]
    for key, e in st.items():
        if e.get("answered"): continue
        if not e.get("page") and page_url(key): e["page"] = page_url(key); log(f"{e['name']}: page at {e['page']}")
        a = page_answer(key)
        if a is not None:                                 # #368: the page answered: relay it ourselves
            answer(key, a, from_page=True, tg=e.get("tg", 0)); e["answered"] = True; log(f"{e['name']}: answered on the page")
            continue
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
    try: bodies = [c.get("body", "") for c in json.loads(out).get("comments", [])] if rc == 0 else []
    except ValueError: bodies = []
    return next((m[0].rsplit("/", 1)[-1] for b in reversed(bodies) for m in [re.search(r"https://claude\.ai/code/session_\w+", b or "")] if m), "")

def answer(key, text, from_page=False, from_tg=False, tg=0):
    """Relay the owner's answer: comment on the source issue, ANSWERED in the questions issue, tell the orchestrator,
    and a cloud worker (remote-<n>) gets it in its session. -> dict of what was done."""
    st = load()
    info = st.get(key) or next(({"source": q.get("source", ""), "issue": issue_no(q), "text": q.get("text", "")}
                                     for q in OQ.open_list() or [] if q["key"] == key), {})
    n, src, done = info.get("issue", 0), info.get("source", ""), {}
    if n: done["issue"] = _gh("issue", "comment", str(n), "--body", R.redact(OQ.answer_body(key, text)))[0] == 0
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

def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) == 3 and argv[0] == "answer":
        print(json.dumps(answer(argv[1], argv[2]), ensure_ascii=False)); return 0
    print(__doc__); return 2

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
