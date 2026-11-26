"""#220 Owner questions pop up, for every open owner question (the pinned issue 'Questions for the owner', owner_q.py #193:
worker/reviewer PURPLE/cloud QUESTION:/intake/orchestrator). The watchdog calls tick() every minute.
#368: deterministic, no LLM in the critical path:
  - a new open question -> tick itself writes .runs/questions/<key>.json and starts tools/ask/ask.py detached
    (CREATE_NO_WINDOW; ask.py opens the Hebrew page in the default browser), records the page URL from <key>.log
  - tick reads the page's answer (<key>.answers.json) itself -> answer(): relayed, owner_q answered, phone window closed
  - phone: after 2 min without an answer, ONE short window `question-<n>` (`claude --model haiku --remote-control`, pinned)
    whose only job is: send this exact push once, wait for a chat reply, run `qwin.py answer <key> "<reply>"` (that stops ask.py)
  - never two pages/windows for the same question; at most MAX_WINDOWS questions at once, the rest wait (oldest first)
  - answered elsewhere (gone from the open list) -> ask.py stopped, window unpinned and closed
  - a live question-* window with no open question of its own (leftover) -> unpinned and closed (#310)
  - the owner is never asked inside the terminal: AskUserQuestion is disallowed (Hebrew shows reversed there, #310)
  - unanswered for 2 h -> one reminder (the window sends the push once more)
Usage: python tools/runner/qwin.py answer <key> "<answer>"
"""
import json, os, re, shutil, signal, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import runner as R
import owner_q as OQ

MAX_WINDOWS = 3
PUSH_AFTER_S = 120
REMIND_S = 2 * 3600
STATE = R.RUNS / "qwin.json"
FAILS = R.RUNS / "qwin_fails.json"                    # #281: {key: failed opens}; after MAX_FAILS the orchestrator pushes instead
MAX_FAILS = 2
DIR = R.RUNS / "questions"
TOOLS = ["Bash", "PushNotification"]
ASK = (HERE.parent / "ask" / "ask.py").as_posix()

# swapped by the tests
def _hc(*a, **kw): return R.hc(*a, **kw)
def _gh(*a, **kw): return R.gh(*a, **kw)
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
    start = questions that get a window now; close = keys answered (window goes); remind = keys unanswered 2 h (once)."""
    keys = {q["key"] for q in open_qs}
    live = {t.get("name") for t in ts if t.get("state") == "live"}
    close = [k for k in st if k not in keys]
    remind = [k for k in st if k in keys and st[k]["name"] in live and now - st[k]["since"] >= REMIND_S and not st[k].get("reminded")]
    busy = {st[k]["name"] for k in st if k in keys and not st[k].get("answered") and not st[k].get("failed")   # #368: page waiting
            and (st[k]["name"] in live or not st[k].get("window"))}         # or its phone window live; leftovers do not count (#310)
    start = []
    for q in open_qs:
        if q["key"] in st: continue                     # one window per question, ever (no duplicates after a restart either)
        name = win_name(q)
        if name in busy or len(busy) >= MAX_WINDOWS: continue   # waits: same issue's earlier question, or 3 windows open
        busy.add(name); start.append(q)
    return start, close, remind

def leftovers(ts, st):
    """#310: live question-* windows that belong to no question we track (e.g. answered in the terminal, state lost)."""
    mine = {v.get("name") for v in st.values()}
    return sorted({t["name"] for t in ts if t.get("state") == "live" and (t.get("name") or "").startswith("question-")} - mine)

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

def prompt(q, name):
    """#368: the phone window's ONLY job (no issue refs: last time it went reading #220)."""
    py = sys.executable.replace("\\", "/")
    return (f"You are the phone window {name}. Your only job is one phone push and relaying the reply.\n"
            "NEVER ask anything inside this terminal (no AskUserQuestion, no question dialog: Hebrew shows reversed here). "
            "Do not read issues or files, do not run anything else.\n"
            "1. Send ONE PushNotification with exactly this text:\n"
            f"{push_text(q)}\n"
            "Then end your turn and wait.\n"
            f"2. When a chat message arrives (a number = that option, other text = his own answer), run once:\n"
            f"{py} tools/runner/qwin.py answer {q['key']} \"<the answer, as given>\"\n"
            "Then stop.\n"
            "A message that starts with WATCHDOG REMINDER is not an answer: send the same PushNotification once more and wait again.")

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

def space_args():
    import recover
    sid = recover.pick_space(recover.spaces(R), recover.control_space(R))   # #331: old 'Oren control' too
    return ["--label", f"herdr.space={sid}"] if sid else []

def open_window(q, name):
    _hc("rm", name, timeout=30)                          # a finished terminal of that name (an earlier question)
    rc, out = _hc("run", "--bg", "--outlive-parent", "--name", name, "--cwd", R.CFG.get("main_checkout", str(R.ROOT)),
                  "--label", f"issue={issue_no(q)}", "--label", "role=question", *space_args(),
                  # #281: through Git Bash like the worker windows (runner.agent): hc cannot start claude.CMD itself
                  R.BASH, "-c", 'export PATH="$1:$PATH"; shift; "$@"', "_", R.CFG["extra_path"],
                  shutil.which("claude") or "claude", "--model", "haiku", "--remote-control", f"oren-{name}",
                  "--permission-mode", "auto", "--allowedTools", *TOOLS, "--disallowedTools", "AskUserQuestion",
                  "--", R.argv_prompt(name, prompt(q, name)), timeout=60)   # #390: one line
    if rc: log(f"could not open {name}: {out.strip()[:200]}"); return False
    return True             # #390: NOT pinned: a pinned window counts as 'active', so Claude Code skips the phone push

def tick(ts, now=None):
    """One watchdog pass: start pages, read their answers, open/close/remind phone windows."""
    now = time.time() if now is None else now
    qs = OQ.open_list()
    if qs is None: return
    st = load()
    start, close, remind = plan(qs, ts, st, now)
    live = {t.get("name") for t in ts if t.get("state") == "live"}
    for name in leftovers(ts, st):
        close_window(name); log(f"{name}: leftover window closed (no open question of its own)")
    for k in close:
        e = st.pop(k); name = e["name"]
        if e.get("pid") and not e.get("answered"): _kill(e["pid"])          # answered elsewhere: the page goes too
        if name in live: pin(name, False); _hc("kill", name, timeout=30)
        _hc("rm", name, timeout=30)
        log(f"{name}: answered, closed")
    for q in start:                                       # #368: the page, started by python itself
        name, key = win_name(q), q["key"]
        st[key] = {"name": name, "since": now, "source": q.get("source", ""), "issue": issue_no(q), "text": q.get("text", ""),
                   "pid": start_page(q)}
        log(f"{name}: page started for {key} (pid {st[key]['pid']})")
    fails = load_fails()
    for key, e in st.items():
        if e.get("answered"): continue
        if not e.get("page") and page_url(key): e["page"] = page_url(key); log(f"{e['name']}: page at {e['page']}")
        a = page_answer(key)
        if a is not None:                                 # #368: the page answered: relay it ourselves
            answer(key, a, from_page=True); e["answered"] = True; log(f"{e['name']}: answered on the page")
            continue
        if e.get("window") or e.get("failed") or now - e["since"] < PUSH_AFTER_S: continue
        q = {"key": key, "text": e.get("text", "")}
        if open_window(q, e["name"]):
            e["window"] = True; fails.pop(key, None); log(f"{e['name']}: phone window opened for {key}")
            continue
        fails[key] = fails.get(key, 0) + 1
        if fails[key] >= MAX_FAILS:                      # #281: no silent retry every minute: the orchestrator pushes it, once
            e["failed"] = True; fails.pop(key, None)
            url = next((x.get("url", "") for x in qs if x["key"] == key), "")
            _hc("send", "orchestrator", f"QUESTION WINDOW FAILED (#281): {e['name']} could not open {MAX_FAILS} times, so no phone push was sent "
                f"(the browser page is open). Send ONE PushNotification now with the question and this link, then follow the answer as usual.\n"
                f"Question ({e.get('source') or '?'}): {e.get('text', '')[:300]}\nLink: {url}", timeout=30)
            log(f"{e['name']}: could not open {MAX_FAILS} times, orchestrator told to push {key}")
    for k in remind:
        if st[k].get("answered"): continue
        _hc("send", st[k]["name"], "WATCHDOG REMINDER: 2 hours without an answer. Send the same PushNotification once more, then wait again.", timeout=30)
        st[k]["reminded"] = True; log(f"{st[k]['name']}: 2 h reminder")
    check_not_sent(st)
    save_fails(fails)
    save(st)

def check_not_sent(st):
    """#390: Claude Code skips a push while it thinks the owner is active in that terminal ('Not sent because ...').
    Say so in watchdog.log, once per question (the browser page stays open). A second channel waits for the owner's choice."""
    for e in st.values():
        if not e.get("window") or e.get("answered") or e.get("not_sent"): continue
        if "Not sent" in (_hc("read", e["name"], "--lines", "80", timeout=30)[1] or ""):
            e["not_sent"] = True
            log(f"{e['name']}: phone push NOT sent (Claude Code: owner active in this terminal); only the browser page has the question")

def load_fails():
    try: return json.loads(FAILS.read_text(encoding="utf-8"))
    except Exception: return {}

def save_fails(f):
    R.RUNS.mkdir(parents=True, exist_ok=True)
    FAILS.write_text(json.dumps(f), encoding="utf-8")

def session_of(n):
    try: return json.loads((R.RUNS / str(n) / "remote.json").read_text(encoding="utf-8")).get("session", "")
    except Exception: pass
    rc, out = _gh("issue", "view", str(n), "--json", "comments")
    try: bodies = [c.get("body", "") for c in json.loads(out).get("comments", [])] if rc == 0 else []
    except ValueError: bodies = []
    return next((m[0].rsplit("/", 1)[-1] for b in reversed(bodies) for m in [re.search(r"https://claude\.ai/code/session_\w+", b or "")] if m), "")

def answer(key, text, from_page=False):
    """Relay the owner's answer: comment on the source issue, ANSWERED in the questions issue, tell the orchestrator,
    and a cloud worker (remote-<n>) gets it in its session. -> dict of what was done."""
    st = load()
    info = st.get(key) or next(({"source": q.get("source", ""), "issue": issue_no(q), "text": q.get("text", "")}
                                     for q in OQ.open_list() or [] if q["key"] == key), {})
    n, src, done = info.get("issue", 0), info.get("source", ""), {}
    if n: done["issue"] = _gh("issue", "comment", str(n), "--body", R.redact(f"OWNER ANSWER (question window, owner-q:{key}): {text}"))[0] == 0
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
    if key in st: st[key]["answered"] = True; save(st)
    name = info.get("name")
    if name:                                             # #310: the answer is recorded: this window goes now (last step: it may be our own)
        sys.stdout.flush(); close_window(name); done["closed"] = True
    return done

def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    if len(argv) == 3 and argv[0] == "answer":
        print(json.dumps(answer(argv[1], argv[2]), ensure_ascii=False)); return 0
    print(__doc__); return 2

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
