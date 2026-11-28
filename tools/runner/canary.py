"""#330 End-to-end canary: a broken step of the flow is found by the system, not by the owner.
Every EVERY_H (and after a merge that touches tools/runner or tools/mods) the watchdog runs ONE tiny issue (label canary, express,
P3, pack, ready-for-agent: append one line to tools/runner/.canary.md) and lets the normal flow run it.
#538: at most one run per canary_minutes (config, default 60), never on a governor STOP or while a P0 waits for a lane. The issue is
ONE rolling issue (TITLE): each run reopens it, sets its body to the new line, makes it ready again and comments; its PR touches only FILE. #450: 'express' gives it its
own express lane, so all normal lanes busy never delay it; it never starts on a governor STOP, and its 'start' clock waits meanwhile:
  start (in-progress or a PR) -> PR -> review (a VERDICT comment) -> merge -> issue closed.
Each step has a deadline (STEPS, minutes), counted from the time the step before it was seen done (start: from the opening).
A missed deadline -> ONE alarm per step to the orchestrator and the inspector naming the step, a NEEDS-ATTENTION line, and
ONE P0 issue 'Canary: step <s> of the flow is broken' (searched first, so never twice while open; owner 19:50).
Green (closed after its PR merged) -> 'flow ok HH:MM'. Still not green GIVE_UP_H after opening -> the canary closes its own
PR and issue (no leftovers); leftover open canary issues are closed before the next one opens.
Side paths, read-only, every hour (the popup once a day): the question popup (the real tools/ask page, started with no browser
and answered by this check itself: no GitHub post, no owner prompt), the cloud inbox/ask desks (.runs/desks.json, #306),
the GitHub budget (gh_cache.json, #329) > BUDGET_PCT. A new problem is told once; it stays on the NEEDS-ATTENTION line.
Panel + dashboard read .runs/canary.json {"text": ...}.
Usage: python tools/runner/canary.py   (prints the line)"""
import json, os, shutil, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import runner as R
import trust

EVERY_H = 6
GAP_MIN = int(R.CFG.get("canary_minutes", 60))   # #538: never two canary runs closer than this
TITLE = "Canary: rolling end-to-end flow check (#330, #538)"
STEPS = (("start", 10), ("pr", 30), ("review", 20), ("merge", 20), ("close", 20))   # minutes per step
GIVE_UP_H = 3
CHECK_S = 120                   # GitHub is read at most this often while a canary runs
SIDE_EVERY_S, POPUP_EVERY_S = 3600, 86400
BUDGET_PCT = 20
LABEL, FILE = "canary", "tools/runner/.canary.md"
WATCH = ("tools/runner", "tools/mods", f":(exclude){FILE}")   # the canary's own merge does not start another one
STATE = R.RUNS / "canary.json"

# ---------- pure ----------
def due(st, now, changed_at, gap_min=None):
    """-> why a new canary starts now, or None. #538: never within gap_min (canary_minutes) of the last start."""
    if st.get("run"): return None
    if not st.get("started"): return "first run"
    if now - st["started"] < (GAP_MIN if gap_min is None else gap_min) * 60: return None
    if changed_at and changed_at > st["started"]: return "tools/runner or tools/mods changed"
    if now - st["started"] >= EVERY_H * 3600: return f"every {EVERY_H} h"
    return None

def steps_done(issue, pr, verdict):
    """issue: gh issue JSON, pr: {state} or None, verdict: the PR's last VERDICT line -> set of steps done."""
    labels = {l["name"] if isinstance(l, dict) else l for l in issue.get("labels", [])}
    merged = bool(pr) and pr.get("state") == "MERGED"
    done = set()
    if pr or "in-progress" in labels: done.add("start")
    if pr: done.add("pr")
    if verdict or merged: done.add("review")
    if merged: done.add("merge")
    if merged and issue.get("state") == "CLOSED": done.add("close")
    return done

def advance(run, done, now):
    """Record the first time each step was seen done (a later step seen implies the earlier ones)."""
    at = run.setdefault("at", {})
    last = max((k for k, (s, _) in enumerate(STEPS) if s in done), default=-1)
    for s, _ in STEPS[:last + 1]: at.setdefault(s, now)
    return run

def late(run, now):
    """-> (step, minutes) of the first step not done whose deadline has passed, or None."""
    t = max(run["opened"], run.get("held", 0))      # #450: 'start' counts from the last tick a governor STOP held it
    for s, mins in STEPS:
        if s in run.get("at", {}): t = run["at"][s]; continue
        return (s, mins) if now - t > mins * 60 else None
    return None

def p0_waiting(issues):
    """#538: open P0 issues waiting for a lane (ready-for-agent, not running) -> their numbers; the canary gives them the slot."""
    names = lambda i: {l["name"] if isinstance(l, dict) else l for l in i.get("labels", [])}
    return [i["number"] for i in issues if {"P0", "ready-for-agent"} <= names(i) and "in-progress" not in names(i)]

def hhmm(t): return time.strftime("%H:%M", time.localtime(t))

def line(st):
    """The panel/dashboard line."""
    bad, run = [], st.get("run") or {}
    if run.get("alarmed"):
        s = run["alarmed"][-1]
        bad.append(f"canary #{run['n']} step {s} late ({dict(STEPS)[s]} min)")
    elif st.get("fail"):
        f = st["fail"]
        bad.append(f"canary #{f['n']} stuck at {f['step']}, closed {hhmm(f['at'])}")
    bad += st.get("side", [])
    ok = f"flow ok {hhmm(st['last_ok'])}" if st.get("last_ok") else (f"flow: canary #{run['n']} running" if run else "flow: no canary yet")
    return ("NEEDS-ATTENTION: " + " · ".join(bad) + " · " + ok) if bad and st.get("last_ok") else \
           ("NEEDS-ATTENTION: " + " · ".join(bad)) if bad else ok

def issue_body(stamp):
    return (f"Canary (#330): an automatic end-to-end check of the flow, opened by the watchdog. Do not change it by hand.\n\n"
            f"Append this one line at the end of `{FILE}`:\n\n`canary {stamp}`\n\n"
            f"## Acceptance\n- `{FILE}` ends with the line `canary {stamp}`; the PR touches only `{FILE}` (no other file changes).\n"
            f"- Tests: none (one text line); CI runs as usual.\n\nOut of scope: everything else.\n")

def budget_problems(cache):
    """GitHub budget below BUDGET_PCT in the shared cache (#329) -> problem texts."""
    if not cache: return []
    ids = [("app ", cache.get("rate") or {}), ("owner ", cache["rate_owner"])] if cache.get("rate_owner") else [("", cache.get("rate") or {})]
    out = []
    for who, rate in ids:
        for k in ("graphql", "core"):
            if k in rate:
                rem, lim = rate[k]
                p = round(100 * rem / lim) if lim else 0
                if p < BUDGET_PCT: out.append(f"GitHub budget {who}{k} {p}% < {BUDGET_PCT}%")
    return out

def desks_problems(text):
    """The cloud inbox/ask desks line (#306) -> problem texts."""
    if text is None: return ["cloud desks: no status (.runs/desks.json)"]
    return [text] if "down" in text else []

# ---------- side effects ----------
def _sh(cmd, env=None):
    import remote
    return remote.sh(cmd, env)

def gov_stop():
    """#450: the governor says STOP now (.runs/governor.json, fresh, the 5h reset not passed) -> the canary cannot start."""
    try:
        gv = json.loads((R.RUNS / "governor.json").read_text(encoding="utf-8"))
        return bool(gv["stop"]) and time.time() - gv["at"] < 15 * 60 and not (gv.get("reset") and gv["reset"] <= time.time())
    except Exception: return False

def _say(text):
    for w in ("orchestrator", "inspector"): R.hc("send", w, text, timeout=30)

def _log(msg):
    R.RUNS.mkdir(parents=True, exist_ok=True)
    with open(R.RUNS / "watchdog.log", "a", encoding="utf-8") as f: f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + "canary: " + msg + "\n")

def last_tool_change():
    """Commit time of the newest change to tools/runner or tools/mods in the main checkout (synced by the watchdog), 0 = unknown."""
    try:
        p = subprocess.run(["git", "-C", str(R.ROOT), "log", "-1", "--format=%ct", "HEAD", "--", *WATCH],
                           capture_output=True, text=True, timeout=30)
        return int(p.stdout.strip() or 0) if p.returncode == 0 else 0
    except (OSError, ValueError, subprocess.SubprocessError): return 0

def _desks():
    if int(R.CFG.get("status_minutes", 10)) == 0: return "off"
    try: return json.loads((R.RUNS / "desks.json").read_text(encoding="utf-8")).get("text", "")
    except (OSError, ValueError): return None

def _cache():
    import ghcache
    return ghcache.load()

def popup_check(timeout=20):
    """The question popup page (tools/ask, as qwin starts it) answered by this check itself -> '' ok, else what broke."""
    import qwin
    d = Path(tempfile.mkdtemp(prefix="canary-q-"))
    qf = d / "q.json"
    qf.write_text(json.dumps(qwin.page_data({"text": "בדיקת מערכת (canary)"}), ensure_ascii=False), encoding="utf-8")
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try: p = subprocess.Popen([sys.executable, qwin.ASK, str(qf), "--timeout-min", "2"], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              text=True, encoding="utf-8", env={**os.environ, "ASK_NO_BROWSER": "1"}, creationflags=flags)
    except OSError:
        shutil.rmtree(d, ignore_errors=True); return "page did not start (no process)"
    web = urllib.request.build_opener(urllib.request.ProxyHandler({}))   # 127.0.0.1: never through a proxy
    try:
        url = (p.stderr.readline() or "").strip()
        if not url.startswith("http"): return "page did not start"
        if "שאלה ממערכת המשחק" not in web.open(url, timeout=timeout).read().decode("utf-8"): return "page has no question"
        req = urllib.request.Request(url + "answer", data=json.dumps({"a": "canary"}).encode(), method="POST")
        if web.open(req, timeout=timeout).read() != b"ok": return "page did not take the answer"
        p.wait(timeout)
        a = json.loads((d / "q.answers.json").read_text(encoding="utf-8")).get("answers", {}).get("a")
        return "" if a == "canary" else "answer not recorded"
    except Exception as e: return f"page failed: {e!r}"[:200]
    finally:
        if p.poll() is None: p.kill()
        for s in (p.stdout, p.stderr): s.close()
        p.wait()
        shutil.rmtree(d, ignore_errors=True)

def side_tick(st, now, say=_say, log=_log, cache=_cache, desks=_desks, popup=popup_check):
    """Every SIDE_EVERY_S: budget + desks; the popup once a day. New problems told once. -> current problems."""
    if now - st.get("side_at", 0) < SIDE_EVERY_S: return st.get("side", [])
    st["side_at"] = now
    probs = budget_problems(cache()) + desks_problems(desks())
    if now - st.get("popup_at", 0) >= POPUP_EVERY_S:
        st["popup_at"], st["popup_err"] = now, popup()
    if st.get("popup_err"): probs.append(f"question popup: {st['popup_err']}")
    new = [x for x in probs if x not in st.get("side", [])]
    if new:
        say("CANARY ALARM (#330, side path): " + " · ".join(new) + ". Fix it now.")
        log("side: " + " · ".join(new))
    st["side"] = probs
    return probs

def _load():
    try: return json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError): return {}

def _save(st):
    R.RUNS.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps({**st, "text": line(st)}, ensure_ascii=False), encoding="utf-8")

def _json(rc, out, default):
    try: return json.loads(out) if rc == 0 and out.strip() else default
    except ValueError: return default

LABELS = f"{LABEL},express,P3,pack,ready-for-agent"

def _open(run, st, now, why, log):
    """#538: reuse the ONE rolling canary issue (reopen, new body, ready again, a comment), or create it the first time.
    Other open canary issues (the old one-per-run ones) are closed. -> True when this run started."""
    if not st.get("label"):
        run(["gh", "label", "create", LABEL, "--repo", R.REPO, "--force", "--color", "bfd4f2", "--description", "end-to-end flow check (#330)"])
        st["label"] = True
    rc, out = run(["gh", "issue", "list", "--repo", R.REPO, "--label", LABEL, "--state", "all", "--limit", "200", "--json", "number,state,title"])
    if rc: log("GitHub unreadable, canary not opened"); return False
    found = _json(rc, out, [])
    roll = min((i for i in found if i.get("title") == TITLE), key=lambda i: i["number"], default=None)
    for i in found:
        if i.get("state") == "OPEN" and i is not roll:
            run(["gh", "issue", "close", str(i["number"]), "--repo", R.REPO, "--reason", "not planned", "--comment", "Leftover canary, closed by the next one (#330)."])
    stamp = time.strftime("%Y-%m-%d %H:%M", time.localtime(now))
    if roll:
        n = roll["number"]
        if roll.get("state") != "OPEN": run(["gh", "issue", "reopen", str(n), "--repo", R.REPO])
        rc, out = run(["gh", "issue", "edit", str(n), "--repo", R.REPO, "--body", issue_body(stamp), "--add-label", LABELS,
                       "--remove-label", "in-progress,blocked"])
        if rc: log(f"canary #{n} not reused: {out.strip()[:200]}"); return False
        run(["gh", "issue", "comment", str(n), "--repo", R.REPO, "--body", f"Canary run {stamp} ({why}): append `canary {stamp}` to `{FILE}` (see the body)."])
    else:
        rc, out = run(["gh", "issue", "create", "--repo", R.REPO, "--title", TITLE, "--label", LABELS, "--body", issue_body(stamp)])
        try: n = int(out.strip().rstrip("/").rsplit("/", 1)[-1]) if rc == 0 else 0
        except ValueError: n = 0
        if not n: log(f"canary not opened: {out.strip()[:200]}"); return False
    st["run"], st["started"] = {"n": n, "opened": now, "since": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now)), "at": {}, "alarmed": []}, now
    log(f"#{n} run started ({why})")
    return True

def _blocked(run, stopped):
    """#538: why no canary may start now (governor STOP, a P0 waiting for a lane), or '' when it may."""
    if stopped(): return "governor STOP"
    rc, out = run(["gh", "issue", "list", "--repo", R.REPO, "--state", "open", "--label", "P0", "--limit", "100", "--json", "number,title,labels"])
    if rc: return "GitHub unreadable"
    w = p0_waiting(_json(rc, out, []))
    return f"P0 #{w[0]} waiting" if w else ""

def p0_title(step): return f"Canary: step '{step}' of the flow is broken"

def _p0(run, step, n, detail, log):
    """Owner 19:50 (#330): a red step also opens ONE P0 issue, so the alarm is not lost when no window is up. Searched first:
    an open P0 with the same title -> nothing new. A GitHub error -> nothing (the hc alarm went out)."""
    rc, out = run(["gh", "issue", "list", "--repo", R.REPO, "--state", "open", "--label", "P0", "--limit", "100", "--json", "number,title"])
    if rc: log(f"P0 for step {step} not checked (GitHub unreadable)"); return
    if any(i.get("title") == p0_title(step) for i in _json(rc, out, [])): return
    run(["gh", "issue", "create", "--repo", R.REPO, "--title", p0_title(step), "--label", "P0,needs-orchestrator",
         "--body", f"Opened by the canary (#330): canary #{n}, step '{step}': {detail}.\n\nFind why that step of the flow is broken, "
                   f"fix it, then close this issue. The next canary shows whether it works again."])
    log(f"P0 opened for step {step} (canary #{n})")

def _check(run, st, now, say, log, stopped=gov_stop):
    """Read the canary's issue/PR, advance its steps, alarm late steps, finish (green) or give up."""
    import remote
    r = st["run"]; n = r["n"]
    rc, out = run(["gh", "issue", "view", str(n), "--repo", R.REPO, "--json", "state,labels"])
    issue = _json(rc, out, None)
    if issue is None: return                                   # GitHub unreadable: next tick
    pr = remote.find_pr(n, run, state="all", fields="number,state", since=r.get("since"))   # #538: the rolling issue's earlier PRs are not this run's
    verdict = ""
    if pr:
        pv = _json(*run(["gh", "pr", "view", str(pr["number"]), "--repo", R.REPO, "--json", "comments"]), {})
        verdict = remote.verdict_from([c.get("body", "") for c in trust.only(pv.get("comments", []))])[0]
    advance(r, steps_done(issue, pr, verdict), now)
    if "start" not in r["at"] and stopped(): r["held"] = now
    if "close" in r["at"]:
        st["run"], st["last_ok"], st["fail"] = None, now, None
        log(f"#{n} green: flow ok")
        return
    lt = late(r, now)
    if lt and lt[0] not in r["alarmed"]:
        r["alarmed"].append(lt[0])
        say(f"CANARY ALARM (#330): canary #{n} step '{lt[0]}' missed its {lt[1]} min deadline. That step of the flow is broken: check it now.")
        _p0(run, lt[0], n, f"missed its {lt[1]} min deadline", log)
        log(f"#{n} step {lt[0]} late")
    if now - r["opened"] >= GIVE_UP_H * 3600:
        step = next(s for s, _ in STEPS if s not in r["at"])
        if pr and pr.get("state") == "OPEN":
            run(["gh", "pr", "close", str(pr["number"]), "--repo", R.REPO, "--delete-branch", "--comment", f"Canary not green in {GIVE_UP_H} h, closed (#330)."])
        if issue.get("state") != "CLOSED":
            run(["gh", "issue", "close", str(n), "--repo", R.REPO, "--reason", "not planned", "--comment", f"Canary stuck at '{step}' for {GIVE_UP_H} h, closed (#330)."])
        st["run"], st["fail"] = None, {"n": n, "step": step, "at": now}
        say(f"CANARY ALARM (#330): canary #{n} stuck at '{step}' for {GIVE_UP_H} h: its PR and issue are closed; the next canary runs at the regular time.")
        _p0(run, step, n, f"stuck for {GIVE_UP_H} h, canary closed", log)
        log(f"#{n} given up at {step}")

def tick(run=_sh, say=_say, log=_log, now=None, st=None, changed=last_tool_change, side=side_tick, stopped=gov_stop):
    """Watchdog, every minute (GitHub at most every CHECK_S)."""
    now = time.time() if now is None else now
    if st is None:
        st = _st
        if not st.get("loaded"): st.update({**_load(), "loaded": True})   # survives a watchdog restart
    if now - st.get("checked", 0) >= CHECK_S:
        st["checked"] = now
        if st.get("run"): _check(run, st, now, say, log, stopped)
        if not st.get("run") and (why := due(st, now, changed())) and not _blocked(run, stopped): _open(run, st, now, why, log)
    side(st, now)
    _save(st)
    return st

_st = {}

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    print(line(_load()))
