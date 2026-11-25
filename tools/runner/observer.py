"""Acting observer of the automatic flow. Called by the watchdog (observer.run_if_due()); also: python observer.py --once [--dry].
1. snapshot() (deterministic)  2. deterministic rules  3. headless Claude pass proposes `ACTION <name> <issue> <reason>` lines
4. execute() is the ONLY place that acts, inside strict limits (max actions per run, same action+issue once per 60 min,
   never on ready-for-human except ask_owner, never make_ready/rerun while a manual integration runs (integrate.lock),
   never edits code / merges / closes issues / touches other windows except send+enter to the orchestrator).
Stop it: config.toml observer_minutes = 0.
"""
import json, re, shutil, sys, threading, time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import runner as R

STATE, LOG, LAST = R.RUNS / "observer.state.json", R.RUNS / "observer.log", R.RUNS / "observer.last"
LOCK = R.RUNS / "integrate.lock"
PROMPT = HERE / "observer_prompt.md"
TOOLS = ["Read", "Grep", "Glob", "Bash(gh:*)", "Bash(git log:*)", "Bash(git show:*)"]
ACTIONS = ("nudge_orchestrator", "make_ready", "rerun", "fix_blocked_by", "ask_owner")
MAX_ACTIONS, REPEAT_MIN = 5, 60
ORCH_MIN, NORUN_MIN = 30, 10          # needs-orchestrator / P0 untouched this long; in-progress without run terminal this long
_running = {"v": False}

def ts(s):
    from datetime import datetime
    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp() if s else 0.0

def load_state():
    try: return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception: return {}

def save_state(st):
    R.RUNS.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(st), encoding="utf-8", newline="\n")

def olog(msg):
    R.RUNS.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a", encoding="utf-8", newline="\n") as f: f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")

def integrating():
    """True while integrate.lock exists and its pid is alive (manual integration in progress)."""
    try: pid = int(re.search(r"\d+", LOCK.read_text(encoding="utf-8")).group(0))
    except Exception: return False
    return R.pid_alive(pid)

# ---------- snapshot ----------
def snapshot(now=None, st=None):
    now = now or time.time(); st = st if st is not None else load_state()
    rc, out = R.gh("issue", "list", "--state", "open", "--limit", "100", "--json", "number,title,labels,body,createdAt,updatedAt,comments")
    issues = []
    for i in (json.loads(out) if rc == 0 else []):
        last = max([ts(c.get("createdAt")) for c in (i.get("comments") or [])] + [ts(i["updatedAt"])])
        issues.append({"number": i["number"], "title": i["title"], "labels": [l["name"] for l in i["labels"]], "body": (i.get("body") or "")[:1500],
                       "createdAt": i["createdAt"], "updatedAt": i["updatedAt"], "touched_min_ago": int((now - last) / 60)})
    rc, out = R.hc("ls", "--json", timeout=30)
    terms = []
    try: terms = json.loads(out.strip().splitlines()[-1]).get("terminals", [])
    except Exception: pass
    terms = [{"name": t.get("name") or "", "address": t.get("address"), "status": t.get("status", ""), "state": t.get("state")} for t in terms]
    orch = next((t["status"] for t in terms if t["name"] == "orchestrator" and t["state"] == "live"), "missing")
    st["orch_idle_since"] = (st.get("orch_idle_since") or now) if orch in ("idle", "done") else None
    idle_min = int((now - st["orch_idle_since"]) / 60) if st.get("orch_idle_since") else 0
    runs_live = {int(m.group(1)) for t in terms if t["state"] == "live" and (m := re.match(r"^run-(\d+)", t["name"]))}
    nr = st.setdefault("no_run_since", {})
    open_nums = {str(i["number"]) for i in issues}
    for i in issues:                     # in-progress without a live run-<n>: remember since when
        n = str(i["number"])
        if "in-progress" in i["labels"] and i["number"] not in runs_live: nr.setdefault(n, now)
        else: nr.pop(n, None)
    for n in [k for k in nr if k not in open_nums]: nr.pop(n)
    for i in issues: i["no_run_min"] = int((now - nr[str(i["number"])]) / 60) if str(i["number"]) in nr else 0
    rc, out = R.gh("pr", "list", "--state", "open", "--json", "number,title,headRefName,updatedAt")
    prs = json.loads(out) if rc == 0 else []
    try: log_tail = "\n".join((R.RUNS / "runner.log").read_text(encoding="utf-8", errors="replace").splitlines()[-15:])
    except Exception: log_tail = ""
    lab = lambda x: [i["number"] for i in issues if x in i["labels"]]
    return {"issues": issues, "in_progress": lab("in-progress"), "blocked": lab("blocked"), "needs_orchestrator": lab("needs-orchestrator"),
            "ready_for_human": lab("ready-for-human"), "terminals": terms, "orchestrator": orch, "orchestrator_idle_min": idle_min,
            "runner_log_tail": log_tail, "open_prs": prs, "integrating": integrating()}

# ---------- deterministic rules ----------
BLOCK_LINE = re.compile(r"^\s*(?:[-*]\s*)?blocked\s+by\b(.*)$", re.I)
GOOD_LINE = re.compile(r"^Blocked by: #\d+(, #\d+)*$")

def normalize_body(body):
    """Pure: body with every dependency line rewritten to 'Blocked by: #a, #b'. Returns (new_body, changed)."""
    out, changed = [], False
    for line in body.split("\n"):
        l = line.rstrip("\r"); m = BLOCK_LINE.match(l)
        if m and not GOOD_LINE.match(l):
            nums = re.findall(r"\d+", m.group(1))
            if nums:
                out.append("Blocked by: " + ", ".join("#" + n for n in dict.fromkeys(nums))); changed = True; continue
        out.append(line)
    return "\n".join(out), changed

def rules(snap):
    """Pure: [(action, issue, reason)] from the deterministic rules. Nothing that restarts work while integrating."""
    acts, idle = [], snap["orchestrator_idle_min"]
    orch_idle = snap["orchestrator"] in ("idle", "done")
    for i in snap["issues"]:
        L, n, m = i["labels"], i["number"], i["touched_min_ago"]
        if "ready-for-human" in L: continue
        if not snap.get("integrating"):
            if ("needs-orchestrator" in L or ("blocked" in L and "P0" in L)) and orch_idle and idle >= ORCH_MIN and m >= ORCH_MIN:
                acts.append(("make_ready", n, f"{'P0 ' if 'P0' in L else ''}needs-orchestrator untouched {m} min, orchestrator idle {idle} min"))
            elif "in-progress" in L and i["no_run_min"] >= NORUN_MIN:
                acts.append(("rerun", n, f"in-progress with no live run-{n} terminal for {i['no_run_min']} min"))
        if normalize_body(i["body"])[1]: acts.append(("fix_blocked_by", n, "malformed dependency line"))
    return acts

# ---------- LLM pass ----------
ACT_RE = re.compile(r"^ACTION (\w+) (\S+)\s*(.*)$")

def parse_output(text):
    """Pure: (problem lines, [(action, issue|None, reason)]) from the LLM output."""
    probs = [l.strip() for l in text.splitlines() if l.strip().startswith("OBSERVER:") and l.strip() != "OBSERVER: OK"][:8]
    acts = []
    for l in text.splitlines():
        m = ACT_RE.match(l.strip())
        if not m or m.group(1) not in ACTIONS: continue
        n = m.group(2).lstrip("#")
        if n.isdigit(): acts.append((m.group(1), int(n), m.group(3).strip()))
        elif m.group(1) in ("nudge_orchestrator", "ask_owner"): acts.append((m.group(1), None, m.group(3).strip()))
    return probs, acts

def llm_pass(snap):
    prompt = PROMPT.read_text(encoding="utf-8").replace("{HC}", R.HC) + "\n\nSNAPSHOT:\n" + json.dumps(snap, ensure_ascii=False)
    cmd = [shutil.which("claude") or "claude", "-p", "--model", "sonnet", "--permission-mode", "auto", "--allowedTools", *TOOLS]
    return R.run(cmd, cwd=str(R.ROOT), input=prompt, timeout=900)

# ---------- executor ----------
def select_actions(cands, snap, st, now):
    """Pure: dedupe, drop forbidden, apply the 60-min repeat limit and the max per run."""
    labels = {i["number"]: i["labels"] for i in snap["issues"]}
    done = st.setdefault("acted", {}); picked, seen = [], set()
    for a, n, why in cands:
        key = f"{a}:{n}"
        if key in seen or a not in ACTIONS: continue
        if a in ("make_ready", "rerun", "fix_blocked_by"):
            if n not in labels or "ready-for-human" in labels[n]: continue
        if a in ("make_ready", "rerun") and snap.get("integrating"): continue
        if now - done.get(key, 0) < REPEAT_MIN * 60: continue
        seen.add(key); picked.append((a, n, why))
        if len(picked) >= MAX_ACTIONS: break
    return picked

def comment(n, a, why): R.gh("issue", "comment", str(n), "--body", f"Observer: {a} — {why}")

def close_issue_windows(n, terms):
    pat = re.compile(rf"^(issue|review|run)-{n}(-\w+)?$")
    for t in terms:
        if pat.match(t["name"]) and t.get("address"):
            if t["state"] == "live": R.hc("kill", t["address"], timeout=30)
            R.hc("rm", t["address"], timeout=30)

def nudge(text, kind="OBSERVER"):
    R.hc("send", "orchestrator", f"{kind}: {text}", timeout=30)
    time.sleep(1)
    rc, scr = R.hc("read", "orchestrator", "--lines", "8", timeout=30)
    if "[Pasted text" in scr: R.hc("keys", "orchestrator", "enter", timeout=30)

def execute(a, n, why, snap):
    if a == "make_ready":
        R.set_labels(n, add=["ready-for-agent"], remove=["blocked", "needs-orchestrator", "in-progress"]); comment(n, a, why)
    elif a == "rerun":
        close_issue_windows(n, snap["terminals"])
        R.set_labels(n, add=["ready-for-agent"], remove=["in-progress", "blocked"]); comment(n, a, why)
    elif a == "fix_blocked_by":
        rc, out = R.gh("issue", "view", str(n), "--json", "body")
        body, ch = normalize_body(json.loads(out)["body"] or "") if rc == 0 else ("", False)
        if not ch: return False
        R.gh("issue", "edit", str(n), "--body", body); comment(n, a, why)
    elif a == "nudge_orchestrator": nudge(why)
    elif a == "ask_owner": nudge(why, "NEEDS YOU (owner)")
    return True

def run_once(dry=False, now=None, llm=True):
    now = now or time.time(); st = load_state(); snap = snapshot(now, st)
    cands = rules(snap)
    rc, out = llm_pass(snap) if llm else (0, "OBSERVER-END")
    probs, llm_acts = parse_output(out)
    chosen = select_actions(cands + llm_acts, snap, st, now)
    n_done = 0
    for a, n, why in chosen:
        olog(f"{'WOULD ' if dry else ''}{a} #{n} {why}")
        if dry: continue
        try:
            if execute(a, n, why, snap): st.setdefault("acted", {})[f"{a}:{n}"] = now; n_done += 1
        except Exception as e: olog(f"error {a} #{n}: {e!r}")
    hhmm = time.strftime("%H:%M")
    res = f"{hhmm} failed (rc {rc})" if rc or not out.strip() else f"{hhmm} · {len(probs)} problems · {len(chosen) if dry else n_done} actions"
    if not dry:
        st["acted"] = {k: v for k, v in st.get("acted", {}).items() if now - v < 86400}
        save_state(st); LAST.write_text(res + "\n", encoding="utf-8", newline="\n")
        with open(LOG, "a", encoding="utf-8", newline="\n") as f: f.write(f"=== {time.strftime('%Y-%m-%d %H:%M:%S')} rc={rc}\n{out}\n")
    return snap, probs, chosen, res

def run_if_due(minutes=None):
    """Called by the watchdog every tick: starts a background run when due. observer_minutes = 0 switches it off."""
    minutes = int(R.CFG.get("observer_minutes", 10)) if minutes is None else minutes
    st = load_state()
    if minutes <= 0 or _running["v"] or time.time() - st.get("last_run", 0) < minutes * 60: return
    _running["v"] = True; st["last_run"] = time.time(); save_state(st)
    def work():
        try:
            s = load_state(); s["last_run"] = time.time(); save_state(s); run_once()
        except Exception as e: olog(f"observer error: {e!r}")
        finally: _running["v"] = False
    threading.Thread(target=work, daemon=True).start()

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    dry = "--dry" in sys.argv
    snap, probs, chosen, res = run_once(dry=dry, llm="--no-llm" not in sys.argv)
    print(f"issues {len(snap['issues'])} | in-progress {snap['in_progress']} blocked {snap['blocked']} needs-orch {snap['needs_orchestrator']} human {snap['ready_for_human']}")
    print(f"orchestrator {snap['orchestrator']} idle {snap['orchestrator_idle_min']} min | terminals {len(snap['terminals'])} | PRs {len(snap['open_prs'])} | integrating {snap['integrating']}")
    print("\n".join(probs) or "no problems")
    print("\n".join(f"{'WOULD ' if dry else ''}{a} #{n} {w}" for a, n, w in chosen) or "no actions"); print(res)
