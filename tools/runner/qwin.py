"""#220 Owner questions pop up: ONE short Claude window per open owner question (the questions in the pinned issue
'Questions for the owner', owner_q.py #193: worker/reviewer PURPLE/cloud QUESTION:/intake/orchestrator).
The watchdog calls tick() every minute:
  - a new open question -> window `question-<issue>` in the 'Oren control' space:
    `claude --model haiku --remote-control oren-question-<issue>`, pinned (herdr alert). The window
      PC:    writes a questions.json and runs tools/ask/ask.py in the background (the Hebrew page opens in the browser),
      phone: after 2 min without an answer, a Hebrew PushNotification with numbered options (answer by number in Remote Control),
    first answer wins (the other path is stopped), then `qwin.py answer <key> "<answer>"` and stops.
  - never two windows for the same question (a question gets one window, ever); at most MAX_WINDOWS at once, the rest wait (oldest first)
  - answered (gone from the open list) -> window unpinned and closed
  - unanswered for 2 h -> one reminder (the window sends one more push); the window stays
Usage: python tools/runner/qwin.py answer <key> "<answer>"
"""
import json, re, shutil, sys, time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import runner as R
import owner_q as OQ

MAX_WINDOWS = 3
PUSH_AFTER_S = 120
REMIND_S = 2 * 3600
STATE = R.RUNS / "qwin.json"
DIR = R.RUNS / "questions"
TOOLS = ["Bash", "Read", "Write", "PushNotification", "TaskStop"]

# swapped by the tests
def _hc(*a, **kw): return R.hc(*a, **kw)
def _gh(*a, **kw): return R.gh(*a, **kw)
def _run(cmd, **kw): return R.run(cmd, **kw)
def _herdr_ok(): return Path(R.HERDR_APP).exists()
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
    start = questions that get a window now; close = keys answered (window goes); remind = keys unanswered 2 h (once)."""
    keys = {q["key"] for q in open_qs}
    live = {t.get("name") for t in ts if t.get("state") == "live"}
    close = [k for k in st if k not in keys]
    remind = [k for k in st if k in keys and st[k]["name"] in live and now - st[k]["since"] >= REMIND_S and not st[k].get("reminded")]
    busy = {n for n in live if (n or "").startswith("question-")} - {st[k]["name"] for k in close}
    start = []
    for q in open_qs:
        if q["key"] in st: continue                     # one window per question, ever (no duplicates after a restart either)
        name = win_name(q)
        if name in busy or len(busy) >= MAX_WINDOWS: continue   # waits: same issue's earlier question, or 3 windows open
        busy.add(name); start.append(q)
    return start, close, remind

def prompt(q, name, qfile):
    py, ref = sys.executable.replace("\\", "/"), OQ.issue_ref(q.get("source") or "") or q.get("source") or "האורקסטרטור"
    return (f"You are the owner-question window {name} (#220). ONE question waits for the owner (he reads Hebrew):\n"
            f"From: {q.get('source') or '?'} ({ref}). In the pinned issue: {q.get('url', '')}\n"
            f"Question: {q.get('text', '')}\n\n"
            "Do exactly this, nothing else:\n"
            f"1. Write {qfile} (UTF-8) for the Hebrew question page: "
            '{"title": "שאלה - ' + ref + '", "intro": "<one short line of context>", "questions": [{"id": "a", "text": "<the question in plain words>", '
            '"options": ["<recommended> (מומלץ)", "<option 2>", ...], "other": true}]}. '
            "2-4 options, the recommended one first marked (מומלץ). Parent-facing Hebrew without nikud; words Oren sees or hears keep their nikud exactly.\n"
            f"2. In the BACKGROUND (Bash run_in_background) start: {py} tools/ask/ask.py {qfile} --timeout-min 1440   (the page opens in his browser). "
            f"Also in the background: sleep {PUSH_AFTER_S}\n"
            "3. Print one line: 'ענה בדף שנפתח בדפדפן, או במספר כאן' and end your turn (wait).\n"
            f"4. When the {PUSH_AFTER_S}s sleep ends and there is no answer yet: send ONE PushNotification in Hebrew: the question and the numbered options "
            "(1. ... 2. ...), 'ענה במספר בצ'אט'. Then wait again.\n"
            "5. The FIRST answer wins: the page (ask.py prints {\"answers\": {\"a\": ...}}) or his chat message here (a number = that option, other text = his own answer). "
            "If the chat won, stop ask.py (TaskStop) so the page is closed.\n"
            f"6. Run: {py} tools/runner/qwin.py answer {q['key']} \"<the answer, as given>\"  (posts it on the issue and in the questions issue, tells the orchestrator, "
            "sends a cloud session its answer). Then print 'תודה' and stop. The watchdog closes this window.\n"
            "A message that starts with WATCHDOG REMINDER is not an answer: send ONE PushNotification reminder (same question, numbered options) and wait again.")

def pin(name, on):
    info = {}
    for line in reversed((_hc("get", name, "--json", timeout=30)[1] or "").strip().splitlines()):
        try: info = json.loads(line); break
        except ValueError: continue
    if info.get("address") and _herdr_ok():
        _run([R.HERDR_APP, "do", "terminal.pin", "--terminal", info["address"], "--pinned", "true" if on else "false"], timeout=30)
    return info.get("address", "")

def space_args():
    import recover
    sid = recover.spaces(R).get(recover.control_space(R), "")
    return ["--label", f"herdr.space={sid}"] if sid else []

def open_window(q, name):
    DIR.mkdir(parents=True, exist_ok=True)
    qfile = (DIR / f"{q['key']}.json").as_posix()
    _hc("rm", name, timeout=30)                          # a finished terminal of that name (an earlier question)
    rc, out = _hc("run", "--bg", "--outlive-parent", "--name", name, "--cwd", R.CFG.get("main_checkout", str(R.ROOT)),
                  "--label", f"issue={issue_no(q)}", "--label", "role=question", *space_args(),
                  shutil.which("claude") or "claude", "--model", "haiku", "--remote-control", f"oren-{name}",
                  "--permission-mode", "auto", "--allowedTools", *TOOLS, "--", prompt(q, name, qfile), timeout=60)
    if rc: log(f"could not open {name}: {out.strip()[:200]}"); return False
    pin(name, True)
    return True

def tick(ts, now=None):
    """One watchdog pass: open/close/remind question windows."""
    now = time.time() if now is None else now
    qs = OQ.open_list()
    if qs is None: return
    st = load()
    start, close, remind = plan(qs, ts, st, now)
    for k in close:
        name = st.pop(k)["name"]
        if any(t.get("name") == name and t.get("state") == "live" for t in ts):
            pin(name, False); _hc("kill", name, timeout=30)
        _hc("rm", name, timeout=30)
        log(f"{name}: answered, window closed")
    for k in remind:
        _hc("send", st[k]["name"], "WATCHDOG REMINDER: 2 hours without an answer. Send ONE PushNotification reminder now, then wait again.", timeout=30)
        st[k]["reminded"] = True; log(f"{st[k]['name']}: 2 h reminder")
    for q in start:
        name = win_name(q)
        if open_window(q, name):
            st[q["key"]] = {"name": name, "since": now, "source": q.get("source", ""), "issue": issue_no(q), "text": q.get("text", "")}
            log(f"{name}: opened for {q['key']}")
    save(st)

def session_of(n):
    try: return json.loads((R.RUNS / str(n) / "remote.json").read_text(encoding="utf-8")).get("session", "")
    except Exception: pass
    rc, out = _gh("issue", "view", str(n), "--json", "comments")
    try: bodies = [c.get("body", "") for c in json.loads(out).get("comments", [])] if rc == 0 else []
    except ValueError: bodies = []
    return next((m[0].rsplit("/", 1)[-1] for b in reversed(bodies) for m in [re.search(r"https://claude\.ai/code/session_\w+", b or "")] if m), "")

def answer(key, text):
    """Relay the owner's answer: comment on the source issue, ANSWERED in the questions issue, tell the orchestrator,
    and a cloud worker (remote-<n>) gets it in its session. -> dict of what was done."""
    info = load().get(key) or next(({"source": q.get("source", ""), "issue": issue_no(q), "text": q.get("text", "")}
                                     for q in OQ.open_list() or [] if q["key"] == key), {})
    n, src, done = info.get("issue", 0), info.get("source", ""), {}
    if n: done["issue"] = _gh("issue", "comment", str(n), "--body", R.redact(f"OWNER ANSWER (question window, owner-q:{key}): {text}"))[0] == 0
    done["answered"] = OQ.mark_answered(key, text)
    if src.startswith("remote-") and n:
        s = session_of(n)
        done["remote"] = bool(s) and _send_remote(s, f"OWNER ANSWER to your QUESTION on #{n}: {text}\nContinue the issue with this answer.").get("ok", False)
    _hc("send", "orchestrator", f"OWNER ANSWERED (question window, {src or key}): {info.get('text', '')[:200]} -> {text}\n"
        + ("The cloud session got it (remote.py send). " if done.get("remote") else f"Relay it to {src or 'the asker'} (hc send / the menu option). ")
        + "Unpark the issue if it was parked.", timeout=30)
    return done

def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) == 3 and argv[0] == "answer":
        print(json.dumps(answer(argv[1], argv[2]), ensure_ascii=False)); return 0
    print(__doc__); return 2

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
