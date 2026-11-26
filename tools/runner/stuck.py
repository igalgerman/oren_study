"""#280 no issue sits stuck. Every open issue needs a live state: ready-for-agent, running, an open PR, a member of an open
batch, an open owner question (#193), or one of the other reasons of parked.reason (#282). The watchdog checks every 10 min:
- no live state for STUCK_H+ (since its last update) -> ONE 'STUCK ISSUES' note to the orchestrator (it pushes the owner's phone),
  with the missing label; again only after the issue was live in between.
- an owner question unanswered REPUSH_H -> pushed again once (its question window sends one more push; else the orchestrator);
  at AUTO_H: the recommended option is applied when the question says 'skip is safe', else it is listed as 'waiting for owner Nh'.
The list goes to .runs/stuck.json; the dashboard counts the same leftovers() as 'not triaged'.
Usage: python3 tools/runner/stuck.py [--hours H]   print the stuck issues now (read-only)"""
import json, re, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import runner as R
import parked as PK

STUCK_H, REPUSH_H, AUTO_H, EVERY_S = 6, 4, 24, 600
STATE = R.RUNS / "stuck.json"
REC_RE = re.compile(r"(?:^|[:;|,?]|\d[.)])\s*(?:\d+[.)]\s*)?([^:;|,?]*?)\s*\((?:recommended|מומלץ)\)", re.I)

def live(i, issues, prs, qs, bm, now):
    """The issue's live state, or None (= a leftover)."""
    if "ready-for-agent" in i["labels"]: return "ready-for-agent"
    return PK.reason(i, issues, prs, qs, bm, now)

def leftovers(issues, prs, qs, now):
    bm = PK.batch_map(issues)
    return [i for i in sorted(PK._open(issues), key=lambda i: i["number"]) if live(i, issues, prs, qs, bm, now) is None]

def missing(i):
    return "owner question" if {"manual", "later"} & set(i["labels"]) else "ready-for-agent"

def stuck(issues, prs, qs, now, hours=STUCK_H):
    """-> [(n, hours without an update, missing label)] for leftovers older than `hours`."""
    out = []
    for i in leftovers(issues, prs, qs, now):
        h = int((now - (PK.epoch(i.get("updatedAt")) or now)) // 3600)
        if h >= hours: out.append((i["number"], h, missing(i)))
    return out

def new_alarms(rows, mem):
    """One alarm per issue: -> [(n, text)] for issues not alarmed yet; issues no longer stuck are forgotten (mem['alarmed'])."""
    seen = set(mem.get("alarmed", []))
    now_n = {n for n, _, _ in rows}
    out = [(n, f"#{n} ({h} h, missing: {m})") for n, h, m in rows if n not in seen]
    mem["alarmed"] = sorted((seen & now_n) | now_n)
    return out

def skip_safe(text): return bool(re.search(r"(?i)\bskip is safe\b", text or ""))

def recommended(text):
    m = REC_RE.search(text or "")
    return m[1].strip() if m and m[1].strip() else None

def _age_h(q, now): return int((now - (PK.epoch(q.get("at")) or now)) // 3600)

def autoable(q): return skip_safe(q.get("text")) and recommended(q.get("text")) is not None

def question_actions(qlist, now, mem):
    """-> [('repush', q, None) | ('auto', q, option)], each once per question (mem['repushed'] / mem['auto'])."""
    rep, auto, out = set(mem.get("repushed", [])), set(mem.get("auto", [])), []
    for q in qlist:
        h, k = _age_h(q, now), q["key"]
        if h >= AUTO_H and autoable(q):
            if k not in auto: out.append(("auto", q, recommended(q["text"]))); auto.add(k)
        elif h >= REPUSH_H and k not in rep:
            out.append(("repush", q, None)); rep.add(k)
    mem["repushed"], mem["auto"] = sorted(rep)[-500:], sorted(auto)[-500:]
    return out

def waiting(qlist, now):
    """Dashboard: questions unanswered AUTO_H+ that cannot be skipped -> [(window, hours)]."""
    return [(q["window"], _age_h(q, now)) for q in qlist if _age_h(q, now) >= AUTO_H and not autoable(q)]

# ---------- side effects ----------
def open_qs():
    import owner_q
    return owner_q.open_list()

def mark(key, text):
    import owner_q
    return owner_q.mark_answered(key, text)

def push(q, text):
    """One more phone push through the question's own window (qwin, #220). -> False when there is no such window."""
    import qwin
    return R.hc("send", qwin.win_name(q), text, timeout=30)[0] == 0

def _load():
    try: return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception: return {}

def _save(d):
    R.RUNS.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")

def tick(gh=None, tell=print, log=print, now=None, questions=open_qs, st=None, mark=mark, push=push):
    """Watchdog, every EVERY_S: STUCK alarm (once per issue), owner question re-push and 24 h rule. Any gh error: nothing is done."""
    gh, now = gh or R.gh, now or time.time()
    st = _st if st is None else st
    if not st: st.update(_load())
    if now - st.get("at", 0) < EVERY_S: return None
    st["at"] = now
    got, ql = PK.fetch(gh), questions()
    if got is None or ql is None: log("stuck: GitHub unreadable"); return None
    issues, prs = got
    qnums = {int(r[1:]) for r in (PK.owner_q_ref(q) for q in ql) if r}
    rows = stuck(issues, prs, qnums, now)
    al = new_alarms(rows, st)
    if al:
        tell("STUCK ISSUES (watchdog, #280): " + " · ".join(t for _, t in al) + ". Give each a live state (label, owner question, "
             "batch) and send ONE PushNotification to the owner with this line.")
        log("stuck: " + " · ".join(t for _, t in al))
    for kind, q, opt in question_actions(ql, now, st):
        ref = q.get("window") or q.get("source") or q["key"]
        if kind == "repush":
            t = f"WATCHDOG REMINDER: {REPUSH_H} hours without an answer (#280). Send ONE PushNotification reminder now, then wait again."
            if not push(q, t): tell(f"OWNER QUESTION REMINDER (#280): {ref} unanswered {REPUSH_H} h: send ONE PushNotification to the owner: {q['text'][:200]} {q.get('url', '')}")
            log(f"stuck: re-push {ref}")
        else:
            ans = f"No answer in {AUTO_H} h and the question said skip is safe: the recommended option is applied: {opt} (#280)."
            m = re.match(r"#(\d+)$", PK.owner_q_ref(q) or "")
            if m: gh("issue", "comment", m[1], "--body", ans)       # a cloud worker resumes on this reply (#135)
            mark(q["key"], ans)
            tell(f"OWNER QUESTION AUTO-ANSWER (#280): {ref}: {ans} Relay it to the waiting window.")
            log(f"stuck: auto answer {ref}: {opt}")
    st["stuck"] = [{"n": n, "h": h, "missing": m} for n, h, m in rows]
    st["waiting"] = waiting(ql, now)
    _save(st)
    return al

_st = {}

def main(argv):
    sys.stdout.reconfigure(encoding="utf-8")
    hours = float(argv[argv.index("--hours") + 1]) if "--hours" in argv else STUCK_H
    got, ql = PK.fetch(R.gh), open_qs()
    if got is None or ql is None: print("could not read GitHub (gh)"); return 1
    qnums = {int(r[1:]) for r in (PK.owner_q_ref(q) for q in ql) if r}
    rows = stuck(*got, qnums, time.time(), hours)
    print("\n".join(f"STUCK #{n} ({h} h, missing: {m})" for n, h, m in rows) or "no stuck issues")
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
