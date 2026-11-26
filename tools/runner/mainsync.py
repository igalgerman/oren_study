"""#326: the main checkout's sync health and the reloads a sync makes necessary. The watchdog's sync_tick calls it.
  - alarm (orchestrator + inspector) when the main checkout is behind origin/main for BEHIND_MIN+ minutes or the sync is
    skipped SKIPS times in a row; the alarm names the dirty files; again at most once an hour while it lasts
  - a sync that changed tools/mods/oren-lanes/** -> '/reload-plugins' to the orchestrator (the mod API has no hot reload)
  - a sync that changed CLAUDE.md / ORCHESTRATOR.md / the inbox prompt (INBOX_PROMPT in recover.py) -> ONE message to that
    session to re-read it
Sends wait until the session is idle (done/idle, never into an open menu) and live in .runs/mainsync.json, so a watchdog
reload after the same merge never loses them."""
import ast, json, time
import runner as R

STATE = R.RUNS / "mainsync.json"
BEHIND_MIN, SKIPS, AGAIN_MIN = 10, 2, 60
IDLE = ("done", "idle")
PANEL = "tools/mods/oren-lanes/"
RECOVER = "tools/runner/recover.py"
READS = {"CLAUDE.md": ("orchestrator", "inbox"), "ORCHESTRATOR.md": ("orchestrator",)}   # file -> sessions that read it at start

# ---------- pure ----------
def health(st, info, now):
    """Pure: -> (new state, alarm text or None). info from R.sync_main: act pull|none|skip|fail|net, behind (None = unknown), why, dirty."""
    st, act, behind = dict(st), info.get("act"), info.get("behind")
    if act in ("pull", "none") or behind == 0:
        return {"skips": 0}, None
    if act in ("skip", "fail"):
        st["skips"] = st.get("skips", 0) + 1
        st["why"], st["dirty"] = info.get("why", ""), info.get("dirty") or []
    if behind: st["behind"] = behind
    st.setdefault("since", now)
    late = now - st["since"] >= BEHIND_MIN * 60
    if not (late or st.get("skips", 0) >= SKIPS) or now - st.get("alarmed", -1e18) < AGAIN_MIN * 60:
        return st, None
    st["alarmed"] = now
    parts = [f"MAIN SYNC (#326): the main checkout {R.MAIN_CHECKOUT} is "
             + (f"{st['behind']} commits behind origin/main" if st.get("behind") else "not synced with origin/main")
             + f" for {int((now - st['since']) / 60)} min"]
    if st.get("skips"): parts.append(f"sync skipped {st['skips']} times in a row: {st.get('why') or '?'}")
    if st.get("dirty"): parts.append("dirty files: " + ", ".join(st["dirty"][:20]) + (" ..." if len(st["dirty"]) > 20 else ""))
    parts.append("commit, stash or revert them in the main checkout; the watchdog then fast-forwards it by itself")
    return st, ". ".join(parts) + "."

def reload_plan(files, old_inbox, new_inbox):
    """Pure: changed files (+ old/new inbox prompt) -> {session: [messages in order]}; at most ONE re-read message per session."""
    plan, reread = {}, {}
    if any(f.startswith(PANEL) for f in files): plan["orchestrator"] = ["/reload-plugins"]
    for f, who in READS.items():
        if f in files:
            for w in who: reread.setdefault(w, []).append(f)
    for w, what in reread.items():
        plan.setdefault(w, []).append(f"WATCHDOG (#326): main changed {', '.join(what)}. Re-read {' and '.join(what)} now "
                                      f"(the file in the main checkout) and follow the new version from here on.")
    if old_inbox != new_inbox:
        text = f"WATCHDOG (#326): your inbox prompt changed. From here on follow this one: {new_inbox}"
        if plan.get("inbox"): plan["inbox"][-1] += " " + text
        else: plan["inbox"] = [text]
    return plan

def inbox_prompt(src):
    """Pure: the INBOX_PROMPT string literal in a recover.py source ('' if none)."""
    try: tree = ast.parse(src)
    except (SyntaxError, ValueError): return ""
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", "") == "INBOX_PROMPT" for t in node.targets):
            try: return str(ast.literal_eval(node.value))
            except ValueError: return ast.get_source_segment(src, node.value) or ""
    return ""

def deliver(pending, status_of, send):
    """-> pending left. Per session at most ONE message per call, only while it is idle; a failed send stays."""
    left = {}
    for name, msgs in pending.items():
        msgs = list(msgs)
        if msgs and status_of(name) in IDLE and send(name, msgs[0]) == 0: msgs.pop(0)
        if msgs: left[name] = msgs
    return left

# ---------- side effects ----------
def load():
    try: return json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError): return {}

def save(st):
    try:
        R.RUNS.mkdir(parents=True, exist_ok=True)
        STATE.write_text(json.dumps(st), encoding="utf-8", newline="\n")
    except OSError: pass

def show(rev, path):
    rc, out = R.run(["git", "-C", str(R.MAIN_CHECKOUT), "show", f"{rev}:{path}"], timeout=60)
    return out if rc == 0 else ""

def status_of(name):
    d = R.hc_json("get", name, "--json") or {}
    if d.get("state") != "live": return ""
    s = d.get("status") or {}
    return s.get("state") if isinstance(s, dict) else s

def after_sync(info, now, say, log):
    """After one sync: health alarm (say = orchestrator + inspector) and, after a pull, the reload sends to queue."""
    st = load()
    st["health"], alarm = health(st.get("health") or {}, info, now)
    if alarm: say(alarm); log(alarm)
    if info.get("act") == "pull" and info.get("changed"):
        files = info["changed"]
        old = new = ""
        if RECOVER in files: old, new = inbox_prompt(show(info["old"], RECOVER)), inbox_prompt(show(info["new"], RECOVER))
        pend = st.get("pending") or {}
        for name, msgs in reload_plan(files, old, new).items():
            pend[name] = pend.get(name, []) + [m for m in msgs if m not in pend.get(name, [])]
            log(f"after sync: queued for {name} (when idle): " + " | ".join(m[:60] for m in msgs))
        st["pending"] = pend
    save(st)

def deliver_tick(log):
    """Every watchdog tick: send the queued messages to sessions that are idle now."""
    st = load()
    if not st.get("pending"): return
    def send(name, text):
        rc = R.hc("send", name, text, timeout=30)[0]
        log(f"after sync: sent to {name} (rc {rc}): {text[:80]}")
        return rc
    st["pending"] = deliver(st["pending"], status_of, send)
    save(st)
