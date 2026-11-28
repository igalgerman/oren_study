"""#872 owner console mirror: the watchdog pushes open owner questions and notices to the console API (#869, D1) and,
when `console_answers = true`, pulls new D1 answers into `qwin.answer` (which writes the `owner-answer` record as today;
`owner_q.py gate` is unchanged). Shadow mode (default): mirror only, nothing is pulled.
Keys and url: ~/.oren/console.json {"url", "push_key", "read_key"}, never in the repo. Every HTTP call is bounded (#365);
a failure is logged and retried next tick, it never raises into the tick."""
import hashlib, json, os, re, time, urllib.error, urllib.request
from datetime import datetime
from pathlib import Path
import runner as R
import owner_q as OQ
import qwin as QW

EVERY_S = 600                                   # push at least this often even when nothing changed
HTTP_S = 10
STATE = R.RUNS / "console_mirror.json"
CONF = Path(os.environ.get("OREN_CONSOLE_JSON") or Path.home() / ".oren" / "console.json")

def log(m): QW.log("console: " + m)

def conf():
    try: c = json.loads(CONF.read_text(encoding="utf-8"))
    except (OSError, ValueError): return None
    return c if c.get("url") and c.get("push_key") else None

def _load():
    try: return json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError): return {}

def _save(s):
    try: STATE.parent.mkdir(parents=True, exist_ok=True); STATE.write_text(json.dumps(s), encoding="utf-8")
    except OSError: pass

def http(method, url, key, body=None):
    """-> (status, parsed json or {}); network errors -> (0, {}). Replaced by a fake in tests."""
    req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode("utf-8"),
                                 headers={"x-console-key": key, "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=HTTP_S) as r: return r.status, json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read().decode("utf-8") or "{}")
        except Exception: return e.code, {}
    except Exception: return 0, {}

def _ms(iso):
    try: return int(datetime.fromisoformat((iso or "").replace("Z", "+00:00")).timestamp() * 1000)
    except ValueError: return None

def question_payload(q, project):
    """The console row of one open question (the shape of POST /api/console/question)."""
    text, opts, _ = QW.headline(q)
    rec = next((re.sub(r"\s*[(\[]?(מומלץ|recommended)[)\]]?\s*", " ", o, flags=re.I).strip() for o in opts if re.search(r"מומלץ|recommended", o, re.I)), None)
    n = QW.issue_no(q)
    p = {"repo": R.REPO, "project": project, "key": q["key"], "text_he": text or q.get("text") or "", "options": opts,
         "gates": [g for g in q.get("gates", [])], "recommended": rec, "asked_at": _ms(q.get("at"))}
    if n: p["issue"] = n
    return {k: v for k, v in p.items() if v is not None}

def notice_payload(q, project):
    n = QW.issue_no(q)
    p = {"repo": R.REPO, "project": project, "text_he": q.get("text") or ""}
    if n: p["issue"] = n
    return p

def push(qs, c, st, project, now):
    """Mirror open questions (all of them when the set changed or EVERY_S passed) and each new notice once. -> failed?"""
    items = [q for q in qs if not QW.is_note(q)]
    digest = hashlib.sha1(json.dumps([question_payload(q, project) for q in items], sort_keys=True).encode()).hexdigest()
    failed = False
    if digest != st.get("digest") or now - st.get("pushed_at", 0) >= EVERY_S:
        for q in items:
            code, _ = http("POST", c["url"].rstrip("/") + "/api/console/question", c["push_key"], question_payload(q, project))
            if code != 200: failed = True; log(f"question {q['key']} not mirrored (HTTP {code}); retried next tick"); break
        else: st["digest"], st["pushed_at"] = digest, now
    sent = set(st.get("notices", []))
    for q in [q for q in qs if QW.is_note(q)]:
        if failed: break
        nk = hashlib.sha1((q["key"] + (q.get("text") or "")).encode()).hexdigest()[:16]
        if nk in sent: continue
        code, _ = http("POST", c["url"].rstrip("/") + "/api/console/notice", c["push_key"], notice_payload(q, project))
        if code != 200: failed = True; log(f"notice {q['key']} not mirrored (HTTP {code}); retried next tick"); break
        sent.add(nk)
    st["notices"] = sorted(sent)[-500:]
    return failed

def pull(qs, c, st):
    """console_answers = true: each answered D1 row of this repo whose question is still open here -> qwin.answer once.
    A question already answered another way is no longer open (its record exists): no second record. -> failed?"""
    rk = c.get("read_key")
    if not rk: log("no read_key in console.json: nothing pulled"); return True
    code, d = http("GET", c["url"].rstrip("/") + "/api/console/questions?state=answered", rk)
    if code != 200: log(f"answers not read (HTTP {code}); retried next tick"); return True
    open_keys = {q["key"] for q in qs if not QW.is_note(q)}
    done = set(st.get("pulled", []))
    for r in d.get("questions", []):
        k = r.get("key")
        if r.get("repo") != R.REPO or k in done or k not in open_keys or not r.get("answer"): continue
        via = r.get("via") if r.get("via") in ("console", "telegram", "chat-card") else "console"
        res = QW.answer(k, r["answer"], via=via)
        if not res.get("question_back"): done.add(k)      # a question back is no answer: it stays open
        log(f"answer for {k} pulled from the console (via {via})")
    st["pulled"] = sorted(done)[-500:]
    return False

def tick(now=None, answers=None):
    """One watchdog pass. Returns True when something failed (the caller's backoff counts it); never raises."""
    now = time.time() if now is None else now
    c = conf()
    if not c: return False
    try:
        qs = OQ.open_list()
        if qs is None: return True
        st = _load()
        failed = push(qs, c, st, R.CFG.get("console_project", "oren"), now)
        if (R.CFG.get("console_answers", False) if answers is None else answers) and not failed:
            failed = pull(qs, c, st)
        _save(st)
        return failed
    except Exception as e:
        log(f"tick failed: {type(e).__name__}: {e}"); return True
