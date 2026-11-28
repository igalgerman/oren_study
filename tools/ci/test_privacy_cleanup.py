"""#787 tools/privacy_cleanup.py on a fake gh and a fake owner gate (points 1-5). Run: python3 tools/ci/test_privacy_cleanup.py
The name and the play numbers below are invented; the real ones are never in the repo."""
import os, tempfile
os.environ["OREN_TEST"] = "1"; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
import json, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
T = Path(tempfile.mkdtemp(prefix="pc-test-"))
os.environ["OREN_HOME"] = str(T / "home"); os.environ["PRIVATE_NAMES"] = "Zorvak,זורבק"
sys.path.insert(0, str(ROOT / "tools")); sys.path.insert(0, str(ROOT / "tools" / "runner"))
sys.argv.append("--dry-run")
import privacy_cleanup as P

NAME, NUMS = "Zorvak", ["98765", "4417", "123456"]
PLAY = {"first_comment": 7237624010, "issues": {670: "all", 734: "all", 205: "comments"}}
fails = []
def ok(name, cond, info=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {info}" if info and not cond else ""))
    if not cond: fails.append(name)

class FakeGH:
    """gh api for one repo: issues (PRs have pull_request), comments, edit histories; records every write."""
    def __init__(self):
        I = lambda n, t, b="", pr=False, edited=False: {"number": n, "title": t, "body": b, "node_id": f"I{n}", "state": "open",
             "created_at": "2026-11-01T00:00:00Z", "updated_at": "2026-11-02T00:00:00Z" if edited else "2026-11-01T00:00:00Z", **({"pull_request": {}} if pr else {})}
        C = lambda cid, n, b, edited=False: {"id": cid, "issue_url": f"https://api.github.com/repos/{P.R.REPO}/issues/{n}", "body": b, "node_id": f"C{cid}",
             "created_at": "2026-11-01T00:00:00Z", "updated_at": "2026-11-02T00:00:00Z" if edited else "2026-11-01T00:00:00Z"}
        self.issues = {i["number"]: i for i in [
            I(1, f"{NAME} cannot read the map"), I(2, f"Fix for {NAME} map", pr=True), I(3, f"{NAME} asked a question", f"{NAME} wants a hint"),
            I(4, "Clean issue about the back button", "nothing here"),
            I(317, f"{NAME} status", "two phone links", edited=True),
            I(670, "Retro of play logs", f"round totals {NUMS[1]}"), I(734, "Retro text", f"played {NUMS[0]} rounds", pr=True), I(205, "Early notes", "neutral")]}
        self.comments = {c["id"]: c for c in [
            C(7237624010, 670, f"aggregated log {NUMS[2]} rounds"), C(11, 670, f"more play {NUMS[1]}"), C(12, 734, "retro comment"),
            C(13, 205, "the kid typed a thing"), C(14, 1, f"{NAME} scored {NUMS[0]} points"), C(15, 4, "fine"),
            C(16, 317, "now clean", edited=True)]}
        self.history = {"I317": [f"old body with {NAME}"], "C16": [f"first version said {NAME} here"]}
        self.calls, self.writes, self.next_id = [], [], 9000
    def __call__(self, *a, **kw):
        self.calls.append(a); a = list(a)
        if a[0] != "api": return 1, "unsupported"
        a = a[1:]; method = "GET"
        if "-X" in a: i = a.index("-X"); method = a[i + 1]; del a[i:i + 2]
        f = {}
        while "-f" in a: i = a.index("-f"); k, _, v = a[i + 1].partition("="); f[k] = v; del a[i:i + 2]
        path = a[0]
        if path == "graphql":
            ids = re.findall(r'node\(id:"([^"]+)"\)', f.get("query", ""))
            return 0, json.dumps({"data": {f"a{i}": {"userContentEdits": {"nodes": [{"diff": d} for d in self.history.get(x, [])]}} for i, x in enumerate(ids)}})
        if method != "GET": self.writes.append((method, path, dict(f)))
        pre = f"repos/{P.R.REPO}/"; p = path[len(pre):] if path.startswith(pre) else path
        base, _, q = p.partition("?"); page = int(re.search(r"(?:^|&)page=(\d+)", q).group(1)) if "&page=" in q else 1
        if method == "GET" and base == "issues": return 0, json.dumps(list(self.issues.values()) if page == 1 else [])
        if method == "GET" and base == "issues/comments": return 0, json.dumps(list(self.comments.values()) if page == 1 else [])
        m = re.fullmatch(r"issues/comments/(\d+)", base)
        if m:
            cid = int(m[1])
            if cid not in self.comments: return 1, "HTTP 404"
            if method == "GET": return 0, json.dumps(self.comments[cid])
            if method == "PATCH": self.comments[cid]["body"] = f["body"]; return 0, "{}"
            if method == "DELETE": del self.comments[cid]; return 0, ""
        m = re.fullmatch(r"issues/(\d+)", base)
        if m:
            n = int(m[1])
            if method == "GET": return (0, json.dumps(self.issues[n])) if n in self.issues else (1, "HTTP 404")
            if method == "PATCH": self.issues[n].update({k: v for k, v in f.items()}); return 0, "{}"
        m = re.fullmatch(r"issues/(\d+)/comments", base)
        if m and method == "POST":
            self.next_id += 1; n = int(m[1])
            self.comments[self.next_id] = {"id": self.next_id, "issue_url": f"https://api.github.com/repos/{P.R.REPO}/issues/{n}", "body": f["body"], "node_id": f"C{self.next_id}",
                                           "created_at": "2026-11-28T00:00:00Z", "updated_at": "2026-11-28T00:00:00Z"}
            return 0, json.dumps({"id": self.next_id})
        if base == "issues" and method == "POST":
            self.next_id += 1; self.issues[self.next_id] = {"number": self.next_id, "title": f["title"], "body": f.get("body", ""), "node_id": f"I{self.next_id}", "state": "open",
                                                           "created_at": "2026-11-28T00:00:00Z", "updated_at": "2026-11-28T00:00:00Z"}
            return 0, json.dumps({"number": self.next_id})
        return 1, "unknown " + path

def setup(gate_open=False):
    gh = FakeGH(); asks = []
    P.GH = gh; P.GATE = lambda: gate_open; P.ASK = lambda text: asks.append(text); P.WRITE_GAP = 0
    P.PLAY = PLAY
    return gh, asks

# ---------- 1 + 5: dry run lists the expected changes, no writes, plan outside the repo, priority items on top ----------
gh, asks = setup()
rc = P.main(["--dry-run"])
plan_txt = P.plan_path(); text = plan_txt.read_text(encoding="utf-8")
ok("dry run: exit 0, zero write calls", rc == 0 and not gh.writes, str(gh.writes))
ok("plan file is outside the repo", ROOT not in plan_txt.resolve().parents, str(plan_txt))
lines = [l for l in text.splitlines() if l.startswith("#")]
kinds = lambda w: [l for l in lines if f"| {w} |" in l]
ok("5: first plan line is comment 7237624010 on #670 (delete comment)", "7237624010" in lines[0] and "#670" in lines[0] and "delete comment" in lines[0], lines[0])
order = [re.match(r"#(\d+)", l)[1] for l in lines]
ok("5: priority targets #670, #734, #205 come before the name items", order[:2] == ["670", "670"] and order.index("734") < order.index("205") < min(order.index(x) for x in ("1", "2", "3", "317")), str(order))
ok("1: 3 titles renamed (#1, #2, #3), #317's title skipped", sorted(re.match(r"#(\d+)", l)[1] for l in kinds("title")) == ["1", "2", "3"], str(kinds("title")))
ok("1: the name comment on #1 is an edit comment, the clean issue/comment on #4 untouched", any(l.startswith("#1 ") and "14" in l and "edit comment" in l for l in lines) and not any(l.startswith("#4 ") for l in lines))
ok("1: #3 body is edited", any(l.startswith("#3 ") and "| body |" in l and "edit body" in l for l in lines))
ok("5: #317 old versions handled (comment history recreated, body history manual)", any(l.startswith("#317 ") and "16" in l and "delete edit-history versions" in l for l in lines)
   and any(l.startswith("#317 ") and "| history |" in l and "manual" in l for l in lines), str([l for l in lines if l.startswith("#317")]))
ok("plan header names the title-timeline limit", "renamed this from" in text)
ok("1: counts printed in plan header", re.search(r"\d+ titles, \d+ comments, \d+ bodies, \d+ histories", text) is not None)

# ---------- 2: no name, no play data in the plan previews or the owner question ----------
ok("2: plan has no name and no play numbers", NAME.lower() not in text.lower() and "זורבק" not in text and not any(n in text for n in NUMS))
ok("2: owner asked once, text has no name/numbers and the counts + path", len(asks) == 1 and NAME.lower() not in asks[0].lower() and not any(n in asks[0] for n in NUMS)
   and "privacy_cleanup_plan.txt" in asks[0] and re.search(r"\d", asks[0]), asks and asks[0])
ok("2: plan.json holds no name/numbers either", not any(n in P.plan_json_path().read_text(encoding="utf-8") for n in NUMS + [NAME]))

# ---------- 3: apply without the gate ----------
rc = P.main(["--apply"])
ok("3: closed gate -> exit 3 'waiting for owner', zero writes", rc == 3 and not gh.writes)
out = []; _p = print
import io, contextlib
buf = io.StringIO()
with contextlib.redirect_stdout(buf): P.main(["--apply"])
ok("3: message says waiting for owner", "waiting for owner" in buf.getvalue())

# ---------- 3 + 4: open gate performs the plan; second apply is idempotent; changed item skipped ----------
P.GATE = lambda: True
gh.comments[14]["body"] = f"someone edited this {NAME}"     # changed after the plan
rc = P.main(["--apply"])
ok("3: apply exits 0", rc == 0, str(rc))
ok("3: titles renamed without the name", all(NAME not in gh.issues[n]["title"] for n in (1, 2, 3)) and gh.issues[1]["title"] == "the kid cannot read the map", gh.issues[1]["title"])
ok("3: first priority comment deleted, play comments gone, #670/#734 bodies neutral", 7237624010 not in gh.comments and 11 not in gh.comments and 12 not in gh.comments and 13 not in gh.comments
   and gh.issues[670]["body"] == "removed: play data" and gh.issues[734]["body"] == "removed: play data")
ok("4: comment changed after the plan is skipped, not overwritten", gh.comments[14]["body"] == f"someone edited this {NAME}")
ok("3: #317 comment with old versions recreated clean", 16 not in gh.comments and any(c["issue_url"].endswith("/317") and c["body"] == "now clean" for c in gh.comments.values()))
ok("4: #317 title untouched", gh.issues[317]["title"] == f"{NAME} status")
res = P.result_path().read_text(encoding="utf-8")
ok("3: result file lists each item and the skipped-changed one", "changed since the plan" in res and "#1 " in res and "manual" in res and re.search(r"\d+ done", res), res[:300])
ok("2: result file has no name/numbers", not any(n in res for n in NUMS) and NAME not in res)
n_writes = len(gh.writes)
rc = P.main(["--apply"])
ok("4: second apply makes no writes", rc == 0 and len(gh.writes) == n_writes, str(gh.writes[n_writes:]))

# ---------- 6 (mechanism): a fresh scan after apply plans only the declined/manual/changed items ----------
gh.writes.clear(); P.main(["--dry-run"])
left = [l for l in P.plan_path().read_text(encoding="utf-8").splitlines() if l.startswith("#")]
ok("6: fresh scan: only the manual history, the changed comment and #317 title-free items remain", all(("manual" in l) or l.startswith("#1 ") for l in left) and not gh.writes, str(left))

# ---------- recreate option ----------
gh, asks = setup(True); P.main(["--dry-run"]); P.main(["--apply", "--recreate", "3"])
new = [n for n in gh.issues if n > 9000]
ok("recreate: new issue without the name, old closed as not planned", len(new) == 1 and NAME not in gh.issues[new[0]]["title"] and NAME not in gh.issues[new[0]]["body"] and gh.issues[3].get("state") == "closed")

print("FAILED: " + ", ".join(fails) if fails else "ok: all privacy_cleanup checks passed")
sys.exit(1 if fails else 0)
