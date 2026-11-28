"""#787 Privacy step 0: one-time cleanup of the text that is ALREADY public (names in titles/bodies/comments/edit history, play data).
Two steps, one script:
  python3 tools/privacy_cleanup.py --dry-run                # default: writes NOTHING to GitHub; plan file + counts, asks the owner ONE question (owner_q, gate #787)
  python3 tools/privacy_cleanup.py --apply [--recreate 12,13]  # real edits, only when `owner_q.py gate #787` is OPEN, else 'waiting for owner'
The plan, its JSON twin and the result live in the private data folder (OREN_HOME, default ~/.oren), never in the repo, never on GitHub.
Names come from the #783 private names file (scrub.names()); play data is a fixed list of ids (PLAY). All writes go through R.run (#783 scrub, App token).
Limits: a renamed title stays in the issue timeline ('renamed this from ...'); body edit history has no API (listed as `manual`: GitHub UI, 'Delete revision history');
a comment's edit history goes by deleting it and posting the cleaned text again (new id, date and position)."""
import hashlib, json, re, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "runner"))
import runner as R
import scrub

ISSUE = 787                      # the gate: owner_q.py gate #787
SKIP_TITLES = {317}              # #785 owns #317's title; its old versions are handled here
NEUTRAL = "removed: play data"
# play data by id only (never quoted anywhere): the first comment is the top priority, then the rest of these issues/PRs.
PLAY = {"first_comment": 7237624010, "issues": {670: "all", 734: "all", 205: "comments"}}   # "all" = body + comments, "comments" = comments only
WRITE_GAP = 1.0                  # at most 1 write per second
GH = lambda *a: R.run(["gh", *a])
GATE = lambda: subprocess.run([sys.executable, str(HERE / "runner" / "owner_q.py"), "gate", f"#{ISSUE}"], capture_output=True).returncode == 0
def ASK(text): subprocess.run([sys.executable, str(HERE / "runner" / "owner_q.py"), "ask", f"#{ISSUE}", text, "--gates", str(ISSUE)])

def plan_path(): return scrub.HOME / "privacy_cleanup_plan.txt"
def plan_json_path(): return scrub.HOME / "privacy_cleanup_plan.json"
def result_path(): return scrub.HOME / "privacy_cleanup_result.txt"
def _h(t): return hashlib.sha256((t or "").encode("utf-8")).hexdigest()[:16]
def _has_name(t): return bool(t) and scrub.scrub(t) != t

def mask(text, n=40):
    """First n chars with every name and every long number replaced by *** (masked BEFORE cutting, so no half name)."""
    for _, pat in scrub._compile(scrub.names()): text = pat.sub("***", text or "")
    return " ".join(re.sub(r"\d{3,}", "***", text).split())[:n]     # long numbers are play data: masked too

# ---------- read ----------
def _get(path):
    rc, out = GH("api", f"repos/{R.REPO}/{path}")
    try: return json.loads(out) if rc == 0 else None
    except ValueError: return None

def _all(path):
    res, page = [], 1
    while True:
        got = _get(f"{path}{'&' if '?' in path else '?'}per_page=100&page={page}")
        if got is None: raise SystemExit(f"could not read GitHub: {path}")
        if not got: return res
        res += got; page += 1

def history(node_ids):
    """node_id -> list of old versions' text (GraphQL userContentEdits), for edited items only; {} when GraphQL is unavailable."""
    out = {}
    for i in range(0, len(node_ids), 20):
        ids = node_ids[i:i + 20]
        frag = "userContentEdits(first:100){nodes{diff}}"
        q = "query{" + " ".join(f'a{k}: node(id:"{x}"){{... on Issue{{{frag}}} ... on PullRequest{{{frag}}} ... on IssueComment{{{frag}}}}}' for k, x in enumerate(ids)) + "}"
        rc, txt = GH("api", "graphql", "-f", f"query={q}")
        try: data = json.loads(txt)["data"] if rc == 0 else {}
        except (ValueError, KeyError): data = {}
        for k, x in enumerate(ids):
            nodes = ((data.get(f"a{k}") or {}).get("userContentEdits") or {}).get("nodes") or []
            out[x] = [n.get("diff") or "" for n in nodes]
    return out

# ---------- plan ----------
def build_plan():
    issues = _all("issues?state=all")
    comments = _all("issues/comments")
    num = lambda c: int(c["issue_url"].rsplit("/", 1)[1])
    title_of = {i["number"]: i["title"] for i in issues}
    edited = [x["node_id"] for x in issues + comments if x.get("updated_at") != x.get("created_at")]
    hist = history(edited)
    dirty_hist = lambda x: any(_has_name(d) for d in hist.get(x["node_id"], []))
    items = []
    def add(prio, n, where, cid, action, text, manual=False):
        items.append({"prio": prio, "n": n, "where": where, "cid": cid, "action": action, "hash": _h(text), "manual": manual,
                      "preview": "(play data, hidden)" if prio < 4 else mask(text), "title": scrub.scrub(title_of.get(n, ""))})
    play_c = set()
    for c in comments:                                            # priority 0: the one aggregated play log
        if c["id"] == PLAY["first_comment"]: add(0, num(c), "comment", c["id"], "delete comment", c["body"]); play_c.add(c["id"])
    for p, (n, mode) in enumerate(PLAY["issues"].items(), 1):    # priorities 1..: #670, #734, #205
        i = next((x for x in issues if x["number"] == n), None)
        if mode == "all" and i and i.get("body") and i["body"] != NEUTRAL: add(p, n, "body", "-", "blank body part", i["body"])
        for c in comments:
            if num(c) == n and c["id"] not in play_c: add(p, n, "comment", c["id"], "delete comment", c["body"]); play_c.add(c["id"])
        if mode == "all" and i and i["updated_at"] != i["created_at"] and hist.get(i["node_id"]): add(p, n, "history", "-", "delete edit-history versions (manual)", i["body"] or "", True)
    for i in issues:                                              # names: titles, bodies
        n = i["number"]
        if _has_name(i["title"]) and n not in SKIP_TITLES: add(4, n, "title", "-", "rename title | option: recreate without the name (default no)", i["title"])
        if _has_name(i.get("body")): add(4, n, "body", "-", "edit body", i["body"])
        elif i["node_id"] in hist and dirty_hist(i) and not any(t["n"] == n and t["where"] == "history" for t in items):
            add(4, n, "history", "-", "delete edit-history versions (manual)", i.get("body") or "", True)
    for c in comments:                                            # names: comments (whole recreate when old versions hold the name)
        if c["id"] in play_c: continue
        if dirty_hist(c): add(4, num(c), "history", c["id"], "delete edit-history versions", c["body"])
        elif _has_name(c["body"]): add(4, num(c), "comment", c["id"], "edit comment", c["body"])
    items.sort(key=lambda x: x["prio"])
    return items

def counts(items):
    c = lambda w: sum(1 for x in items if x["where"] == w)
    return c("title"), c("comment"), c("body"), c("history")

def write_plan(items):
    t, c, b, h = counts(items)
    head = [f"PRIVACY CLEANUP PLAN (#{ISSUE}) - private file, not for GitHub or chat.",
            f"{t} titles, {c} comments, {b} bodies, {h} histories",
            "Known limit: a renamed title stays visible in the issue timeline ('renamed this from ...') and cannot be deleted by API; per title the option is",
            "'recreate the issue without the name and close the old one as duplicate' (apply --recreate N,N; default no). Deleting an issue needs admin rights: owner's choice.",
            "Deleting edit history is PERMANENT. Comment history: the comment is deleted and posted again clean (new id/date). Body history: manual (GitHub UI).",
            "Priority (top): comment 7237624010 on #670, then #670, PR #734 retro, #205.", ""]
    lines = [f"#{x['n']} {x['title']} | {x['cid']} | {x['where']} | {x['action']} | {x['preview']}" for x in items]
    scrub.HOME.mkdir(parents=True, exist_ok=True)
    plan_path().write_text("\n".join(head + lines) + "\n", encoding="utf-8")
    plan_json_path().write_text(json.dumps(items), encoding="utf-8")

def dry_run():
    items = build_plan(); write_plan(items)
    t, c, b, h = counts(items)
    home = str(Path.home()); shown = str(plan_path()).replace(home, "~")
    print(f"plan: {shown}\n{t} titles, {c} comments, {b} bodies, {h} histories")
    if items:
        ASK(f"ניקוי פרטיות חד-פעמי: {t} כותרות, {c} תגובות, {b} גופי הודעה, {h} היסטוריות עריכה. הרשימה המלאה בקובץ {shown} (לא ב-GitHub). "
            "מחיקת היסטוריית עריכה היא לצמיתות, וכותרת ששונתה נשארת גלויה בציר הזמן. האם להריץ? אפשרויות: 1. כן, להריץ (מומלץ) 2. לא")
    return 0

# ---------- apply ----------
def _w(*args):
    rc, out = GH(*args); time.sleep(WRITE_GAP); return rc, out

def _read(x):
    if x["where"] in ("comment", "history") and x["cid"] != "-":
        c = _get(f"issues/comments/{x['cid']}"); return None if c is None else c["body"]
    i = _get(f"issues/{x['n']}")
    return None if i is None else (i["title"] if x["where"] == "title" else i.get("body") or "")

def _do(x, cur):
    """One planned write on the freshly read text; -> (rc, out)."""
    n, cid, a = x["n"], x["cid"], x["action"]
    new = scrub.scrub(cur)
    if a == "rename title" or a.startswith("rename title"): return _w("api", "-X", "PATCH", f"repos/{R.REPO}/issues/{n}", "-f", f"title={new}")
    if a == "edit body": return _w("api", "-X", "PATCH", f"repos/{R.REPO}/issues/{n}", "-f", f"body={new}")
    if a == "blank body part": return _w("api", "-X", "PATCH", f"repos/{R.REPO}/issues/{n}", "-f", f"body={NEUTRAL}")
    if a == "edit comment": return _w("api", "-X", "PATCH", f"repos/{R.REPO}/issues/comments/{cid}", "-f", f"body={new}")
    if a == "delete comment": return _w("api", "-X", "DELETE", f"repos/{R.REPO}/issues/comments/{cid}")
    if a == "delete edit-history versions":                      # post the clean text first, then delete the old comment
        rc, out = _w("api", "-X", "POST", f"repos/{R.REPO}/issues/{n}/comments", "-f", f"body={new}")
        return (rc, out) if rc else _w("api", "-X", "DELETE", f"repos/{R.REPO}/issues/comments/{cid}")
    return 1, "unknown action " + a

def apply(recreate=()):
    if not GATE(): print("waiting for owner: the owner_q gate is CLOSED, nothing changed"); return 3
    try: items = json.loads(plan_json_path().read_text(encoding="utf-8"))
    except (OSError, ValueError): print("no plan: run --dry-run first"); return 2
    res, tally = [], {"done": 0, "already clean": 0, "changed since the plan": 0, "manual": 0, "failed": 0}
    def note(x, k, extra=""):
        tally[k] += 1; res.append(f"#{x['n']} {x['where']} {x['cid']} {x['action'].split(' |')[0]}: {k}{(' ' + extra) if extra else ''}")
    for x in items:
        if x["manual"]: note(x, "manual", "(GitHub UI: Delete revision history)"); continue
        cur = _read(x)
        if cur is None: note(x, "already clean", "(gone)"); continue
        if _h(cur) != x["hash"]:
            clean = cur == NEUTRAL if x["action"] == "blank body part" else (not _has_name(cur) and x["prio"] == 4 and x["action"] != "delete edit-history versions")
            note(x, "already clean" if clean else "changed since the plan"); continue
        rc, out = _do(x, cur)
        note(x, "done") if rc == 0 else note(x, "failed", f"(gh rc {rc})")
    for n in recreate:
        i = _get(f"issues/{n}")
        if not i or "pull_request" in i: res.append(f"#{n} recreate: skipped (not an issue)"); continue
        rc, out = _w("api", "-X", "POST", f"repos/{R.REPO}/issues", "-f", f"title={scrub.scrub(i['title'])}", "-f", f"body={scrub.scrub(i.get('body') or '')}")
        try: new = json.loads(out)["number"]
        except (ValueError, KeyError): new = 0
        if rc or not new: tally["failed"] += 1; res.append(f"#{n} recreate: failed"); continue
        _w("api", "-X", "POST", f"repos/{R.REPO}/issues/{n}/comments", "-f", f"body=Duplicate of #{new} (recreated without private text).")
        _w("api", "-X", "PATCH", f"repos/{R.REPO}/issues/{n}", "-f", "state=closed", "-f", "state_reason=not_planned")
        tally["done"] += 1; res.append(f"#{n} recreate: done as #{new}")
    head = ", ".join(f"{v} {k}" for k, v in tally.items())
    result_path().write_text(head + "\n" + "\n".join(res) + "\n", encoding="utf-8")
    print(f"result: {result_path()}\n{head}")
    return 1 if tally["failed"] else 0

def main(argv):
    if "--apply" in argv:
        rec = []
        if "--recreate" in argv: rec = [int(v) for v in re.findall(r"\d+", argv[argv.index("--recreate") + 1])]
        return apply(rec)
    return dry_run()

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
