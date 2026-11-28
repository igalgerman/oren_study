# #792: three-repo support: python tools/runner/test_repos.py
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-"); os.environ["OREN_TEST"] = "1"
import json, re, subprocess, sys, textwrap
from pathlib import Path
import trust
trust.login = lambda c: (c.get("author") or {}).get("login") or "igalgerman"
import repos, remote as r

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
I, G = repos.INFRA, repos.GAME
assert I and G and repos.DATA and len({I, G, repos.DATA}) == 3, (I, G, repos.DATA)
assert repos.both() == [I, G] and repos.both(game="") == [I]

class Fake:
    """(needle, out) pairs: the first needle in the joined command answers; every call is recorded."""
    def __init__(self, *answers): self.answers, self.calls = answers, []
    def __call__(self, cmd, env=None):
        self.calls.append(" ".join(map(str, cmd)))
        for needle, out in self.answers:
            if needle in self.calls[-1]: return 0, json.dumps(out)
        return 0, "[]"

# ---- the config names, repo = INFRA, no hardcoded name anywhere else (rename readiness)
def test_no_hardcoded_repo():
    names = {I, G, repos.DATA, I.split("/")[1], G.split("/")[1], repos.DATA.split("/")[1], "sw-factory", "learn-quest", "family-vault"}
    bad = []
    roots = [ROOT / "tools", ROOT / ".github"]
    for root in roots:
        for f in root.rglob("*"):
            if not f.is_file() or ".runs" in f.parts or "node_modules" in f.parts or f.suffix in (".png", ".pyc", ".ico", ".jpg"): continue
            if f.name == "config.toml" or (f.name.startswith("test_") and f.name != "test_garden.py") or f.name == "gh_cache.json": continue     # config = the one place; tests hold fake data
            try: text = f.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError): continue
            for i, l in enumerate(text.splitlines(), 1):
                if any(nm in l for nm in names) or re.search(r"\boren_study\b", l): bad.append(f"{f.relative_to(ROOT)}:{i}")
    assert not bad, "hardcoded repo name outside config.toml:\n" + "\n".join(bad)
test_no_hardcoded_repo()
print("ok #792 no hardcoded repo")

# ---- rename: another `repo` in a temp config -> every name the runner uses follows
tmp = Path(tempfile.mkdtemp()) / "config.toml"
tmp.write_text('repo = "acme/factory"\ngame_repo = "game-x"\ndata_repo = "acme/vault"\n')
c = repos.load(tmp)
assert c == {"infra": "acme/factory", "game": "acme/game-x", "data": "acme/vault"}, c
assert repos.load(tempfile.mkdtemp() + "/none.toml") == {"infra": "", "game": "", "data": ""}
out = subprocess.run([sys.executable, "-c", textwrap.dedent(f"""
    import os; os.environ['RUNNER_RUNS'] = {tempfile.mkdtemp()!r}
    import remote, ghcache, repos
    repos.INFRA, repos.GAME = 'acme/factory', 'acme/game-x'
    remote.REPO = 'acme/factory'; remote.repos.INFRA = 'acme/factory'; remote.repos.GAME = 'acme/game-x'
    calls = []
    def run(cmd, env=None): calls.append(' '.join(cmd)); return 0, '[]'
    remote.find_pr_repo(5, run, 'open', line='')
    assert all('--repo acme/' in c for c in calls if ' pr ' in c), calls
    assert any('--repo acme/factory' in c for c in calls) and any('--repo acme/game-x' in c for c in calls), calls
    assert not any('igalgerman' in c for c in calls), calls
    print('renamed ok')"""), ], cwd=HERE, capture_output=True, text=True)
assert "renamed ok" in out.stdout, out.stdout + out.stderr
print("ok #792 rename follows config")

# ---- pr_for: found in INFRA / in GAME / in neither / in both = error
f = Fake((f"--repo {I} --head lane/7", [{"number": 31, "headRefName": "lane/7"}]))
assert r.find_pr_repo(7, f) == ({"number": 31, "headRefName": "lane/7"}, I)
assert r.pr_where(7, f) == (31, "lane/7", I)
f = Fake((f"--repo {G} --head lane/7", [{"number": 5, "headRefName": "lane/7"}]))
assert r.pr_where(7, f) == (5, "lane/7", G) and r.pr_for(7, f) == (5, "lane/7")
f = Fake(("issue view", {"comments": []}))
assert r.pr_where(7, f) == (None, None, None) and r.find_pr_repo(7, f) == (None, None)
f = Fake((f"--repo {I} --head lane/7", [{"number": 31, "headRefName": "lane/7"}]), (f"--repo {G} --head lane/7", [{"number": 5, "headRefName": "lane/7"}]))
try: r.find_pr_repo(7, f); raise SystemExit("both repos must be an error")
except ValueError as e: assert "both repos" in str(e)
assert r.pr_for(7, f) == (None, None)                                   # the runner never guesses: no PR, logged
# the issue's route picks ONE repo: one lookup, one gh call
f = Fake((f"--repo {G} --head lane/7", [{"number": 5, "headRefName": "lane/7"}]))
assert r.find_pr_repo(7, f, repo=G)[1] == G and len(f.calls) == 1 and f"--repo {I}" not in f.calls[0], f.calls
# a RESULT line with a GAME PR URL, and a GAME PR body with the full ref (a bare #n in GAME is a GAME number)
url = f"https://github.com/{G}/pull/9"
f = Fake(("--head", []), ("pr view 9", {"number": 9, "headRefName": "claude/x", "state": "OPEN"}))
assert r.find_pr_repo(7, f, line=f"RESULT: DONE {url}") == ({"number": 9, "headRefName": "claude/x"}, G)
assert f"pr view 9 --repo {G}" in " ".join(f.calls)
full = repos.closes_ref(7)
assert full == f"Closes {I}#7"
assert r.fixes(full, 7, G) and r.fixes(full, 7) and not r.fixes("Closes #7", 7, G) and r.fixes("Fixes #7", 7, I) and not r.fixes(full + "0", 7, G)
f = Fake((f"--repo {G} --state open --limit 100", [{"number": 4, "headRefName": "claude/y", "body": "x\n" + full}]))
assert r.find_pr_repo(7, f, line="") == ({"number": 4, "headRefName": "claude/y"}, G)
f = Fake((f"--repo {G} --state open --limit 100", [{"number": 4, "headRefName": "claude/y", "body": "Closes #7"}]))
assert r.find_pr_repo(7, f, line="") == (None, None)                    # bare #7 in GAME is GAME #7, not our issue
assert repos.pr_ref(G, 5) == f"https://github.com/{G}/pull/5"           # runner text on an INFRA issue: always the full URL
print("ok #792 pr lookup in both repos")

# ---- one-repo mode: game_repo unset = as today (INFRA only, bare #n counts)
g0, repos.GAME = repos.GAME, ""
f = Fake((f"--head lane/7", [{"number": 31, "headRefName": "lane/7"}]))
assert r.pr_where(7, f) == (31, "lane/7", I) and all(f"--repo {I}" in c for c in f.calls) and len(f.calls) == 1, f.calls
f = Fake(("issue view", {"comments": []}), ("--limit 100", [{"number": 4, "headRefName": "claude/y", "body": "Fixes #7"}]))
assert r.find_pr_repo(7, f) == ({"number": 4, "headRefName": "claude/y"}, I) and not any(G in c for c in f.calls)
repos.GAME = g0
print("ok #792 one-repo mode")

# ---- ghcache: GAME rides in the SAME graphql call; keys per (repo, number); calls per repo in `top`
import ghcache as GC, time
assert GC.REPO == I and GC.GAME == G
def pr(n, head, body="", state="OPEN"):
    return {"number": n, "url": f"https://github.com/x/pull/{n}", "title": "t", "headRefName": head, "body": body, "state": state, "isDraft": False, "mergedAt": None,
            "createdAt": "2026-11-28T10:00:00Z", "updatedAt": "2026-11-28T10:00:00Z", "closedAt": None, "labels": {"nodes": []},
            "commits": {"nodes": [{"commit": {"committedDate": "2026-11-28T10:05:00Z"}}]}, "comments": {"nodes": []}}
def conn(nodes): return {"totalCount": len(nodes), "pageInfo": {"hasNextPage": False, "endCursor": None}, "nodes": nodes}
INFRA_DATA = {"open": conn([{"number": 5, "title": "infra five", "body": "", "state": "OPEN", "createdAt": "2026-11-28T09:00:00Z", "updatedAt": "2026-11-28T09:00:00Z",
                             "closedAt": None, "labels": {"nodes": []}, "comments": {"nodes": []}}]), "closed": conn([]),
              "prs": {"nodes": [pr(31, "lane/5")]}, "openPrs": {"totalCount": 1}, "refs": {"pageInfo": {"hasNextPage": False}, "nodes": [{"name": "5", "target": {"committedDate": "2026-11-28T10:00:00Z"}}]}}
GAME_DATA = {"prs": {"nodes": [pr(5, "lane/6", f"Closes {I}#6"), pr(2, "claude/z", "x")]}, "openPrs": {"totalCount": 2},
             "refs": {"pageInfo": {"hasNextPage": False}, "nodes": [{"name": "6", "target": {"committedDate": "2026-11-28T10:01:00Z"}}]}}
gh_calls = []
def fake_gh(cmd):
    gh_calls.append(cmd)
    if cmd[:3] == ["gh", "api", "rate_limit"]: return 0, json.dumps({"resources": {"graphql": {"remaining": 4000, "limit": 5000}, "core": {"remaining": 4000, "limit": 5000}}})
    return 0, json.dumps({"data": {"repository": INFRA_DATA, "game": GAME_DATA}})
NOW = time.time()
c = GC.refresh(fake_gh, now=NOW)
assert sum(1 for x in gh_calls if "graphql" in x) == 1, "the second repo adds no second read per minute"
q = " ".join(next(x for x in gh_calls if "graphql" in x)); assert f"go={G.split('/')[0]}" in q and f"gr={G.split('/')[1]}" in q and "hg=true" in q
assert [p["number"] for p in c["game"]["prs"]] == [5, 2] and [p["number"] for p in c["prs"]] == [31] and "6" in c["game"]["lanes"]
raw_calls = []
def raw(): raw_calls.append(1); return 1, "raw"
ls = lambda repo, head: ["gh", "pr", "list", "--repo", repo, "--head", head, "--state", "open", "--json", "number,headRefName"]
assert GC.call(ls(G, "lane/6"), raw, now=NOW + 1) == (0, json.dumps([{"number": 5, "headRefName": "lane/6"}])) and not raw_calls, "GAME list from the cache"
assert GC.call(ls(I, "lane/5"), raw, now=NOW + 1)[1] == json.dumps([{"number": 31, "headRefName": "lane/5"}]) and not raw_calls
# INFRA issue 5 and GAME PR 5 alive at once: each view answers its own repo
view = lambda kind, repo, n: ["gh", kind, "view", str(n), "--repo", repo, "--json", "number,title" if kind == "issue" else "number,headRefName"]
assert json.loads(GC.call(view("pr", G, 5), raw, now=NOW + 1)[1]) == {"number": 5, "headRefName": "lane/6"} and not raw_calls
assert json.loads(GC.call(view("issue", I, 5), raw, now=NOW + 1)[1])["title"] == "infra five" and not raw_calls
assert GC.call(view("pr", I, 5), raw, now=NOW + 1)[0] == 1 and raw_calls, "INFRA has no PR 5: the cache does not answer with GAME's"
raw_calls.clear()
assert GC.call(view("issue", G, 5), raw, now=NOW + 1)[0] == 1 and raw_calls, "GAME issues are not cached: real gh"
raw_calls.clear()
# a write on GAME PR 5 dirties only GAME #5; INFRA issue 5 stays cached
assert GC.write_target(["gh", "pr", "comment", "5", "--repo", G, "--body", "x"]) == "g:5" and GC.write_target(["gh", "issue", "comment", "5", "--repo", I]) == "5"
GC.mark_dirty("g:5", NOW + 2)
assert GC.call(view("pr", G, 5), raw, now=NOW + 3)[0] == 1 and raw_calls, "dirty GAME PR 5 goes to gh"
raw_calls.clear()
assert GC.call(view("issue", I, 5), raw, now=NOW + 3)[0] == 0 and not raw_calls, "INFRA issue 5 not dirtied by GAME PR 5"
br = lambda repo, n: ["gh", "api", f"repos/{repo}/branches/lane/{n}", "--jq", ".commit.commit.committer.date"]
assert GC.call(br(G, 6), raw, now=NOW + 3)[1].strip() == "2026-11-28T10:01:00Z" and GC.call(br(I, 5), raw, now=NOW + 3)[1].strip() == "2026-11-28T10:00:00Z"
assert GC.call(br(G, 5), raw, now=NOW + 3)[0] == 1 and GC.call(br(I, 6), raw, now=NOW + 3)[0] == 1
assert GC.endpoint_of(["gh", "api", f"repos/{G}/pulls/5"]).endswith("@game") and not GC.endpoint_of(["gh", "api", f"repos/{I}/pulls/5"]).endswith("@game")
assert GC.endpoint_of(["gh", "pr", "list", "--repo", G]).endswith("@game") and not GC.endpoint_of(["gh", "pr", "list", "--repo", I]).endswith("@game")
# one-repo mode: no game section asked for, none cached
GC.GAME = ""
gh_calls.clear()
c1 = GC.refresh(lambda cmd: (gh_calls.append(cmd), (0, json.dumps({"data": {"repository": INFRA_DATA}})) if "graphql" in cmd else (0, "{}"))[1], now=NOW + 100)
assert "game" not in c1 and "hg=false" in " ".join(next(x for x in gh_calls if "graphql" in x))
GC.GAME = G
print("ok #792 ghcache: one query, keys per repo, calls per repo")

# ---- runner: full Closes ref in the worker prompts, merge in the PR's repo gated by GAME `tests`
import runner as RU
assert RU.fixes_ref(7) == f"{I}#7" and f"Fixes {I}#7" in RU.remote_worker_prompt(7, "pack") and f"Fixes {I}#m" in RU.remote_worker_prompt(7, "pack")
assert f"Closes {I}#7" in RU.worker_prompt(7, "pack") and "Closes #7" not in RU.worker_prompt(7, "pack")
g0 = repos.GAME; repos.GAME = ""
assert RU.fixes_ref(7) == "#7"                                              # one-repo mode: as today
repos.GAME = g0
chk = [{"name": "tests", "bucket": "pass"}, {"name": "tools", "bucket": "fail"}]
assert RU.gate_checks(chk, G) == [{"name": "tests", "bucket": "pass"}] and RU.ci_verdict(RU.gate_checks(chk, G)) == "green"
only_tools = [{"name": "tools", "bucket": "pass"}]
assert RU.gate_checks(only_tools, G) == [] and RU.ci_verdict(RU.gate_checks(only_tools, G)) == "none"   # no `tests` yet: never green
assert RU.gate_checks(chk, I) == chk                                         # INFRA: its own (tiny) check, all checks as today

def ci_run(prrepo):
    sent = []
    def fake(cmd, **k):
        sent.append(cmd); line = " ".join(cmd)
        if "isDraft,labels" in line: return 0, '{"isDraft":false,"labels":[]}'
        if "mergeable" in cmd and "-q" in cmd: return 0, "MERGEABLE"
        if "state,mergeable" in line: return 0, '{"state":"OPEN","mergeable":"MERGEABLE"}'
        if cmd[:3] == ["gh", "pr", "checks"]: return 0, json.dumps([{"name": "tests", "bucket": "pass"}, {"name": "other", "bucket": "fail"}] if prrepo == G else only_tools)
        return 0, ""
    saved = RU.run, RU.remote.pr_where, RU.time.sleep
    RU.run, RU.remote.pr_where, RU.time.sleep = fake, (lambda n, run=None, state="open", repo=None: (251, "claude/x", prrepo)), (lambda s: None)
    try: res = RU.ci_integrate(185, "wt", None, None, "abc123")
    finally: RU.run, RU.remote.pr_where, RU.time.sleep = saved
    return res, sent
res, sent = ci_run(G)
prc = [c for c in sent if c[:2] == ["gh", "pr"]]
assert res[0] == 0 and prc and all(c[c.index("--repo") + 1] == G for c in prc), (res, prc)       # every PR call goes to the GAME repo
assert any(c[2] == "merge" and "--squash" in c for c in prc), prc
res, sent = ci_run(I)
assert res[0] == 0 and all(c[c.index("--repo") + 1] == I for c in sent if c[:2] == ["gh", "pr"]), "an INFRA PR merges in INFRA"
seen = []
saved_run = RU.run; RU.run = lambda cmd, **k: (seen.append(cmd), (0, ""))[1]
with RU.in_repo(G):                                                          # issue calls stay in INFRA while a GAME PR is the lane's PR
    RU.gh("pr", "view", "5"); RU.gh("issue", "comment", "7", "--body", "x"); RU.gh("run", "list")
assert [c[c.index("--repo") + 1] for c in seen] == [G, I, G], seen
# find_pr remembers the repo; a new run forgets it
RU.run = saved_run
saved_pw = RU.remote.pr_where; RU.remote.pr_where = lambda n, run=None, state="open", repo=None: (5, "lane/7", G)
assert RU.find_pr(7) == 5 and repos.pr_repo() == G
RU.remote.pr_where = saved_pw; repos.set_pr_repo(None); assert repos.pr_repo() == I
# the runner closes the INFRA issue with the GAME PR URL as the proof line (a bare #5 on an INFRA issue would point at INFRA #5)
RU.remote.pr_where = lambda n, run=None, state="open", repo=None: (5, "lane/7", G)
assert RU.merged_proof(7) == f" PR: https://github.com/{G}/pull/5"
RU.remote.pr_where = lambda n, run=None, state="open", repo=None: (5, "lane/7", I)
assert RU.merged_proof(7) == ""                                              # INFRA PR: text as today
RU.remote.pr_where = saved_pw
closed = []
RU.gh = lambda *a, **k: (closed.append(a), (0, json.dumps({"labels": [{"name": "pack"}], "comments": [{"body": "LIVE: ok", "author": {"login": "igalgerman"}}]})) if a[:2] == ("issue", "view") else (0, ""))[1]
assert RU.finish_issue(7, f"Merged to main. PR: https://github.com/{G}/pull/5") and any(a[:2] == ("issue", "close") and "pull/5" in a[-1] for a in closed), closed
print("ok #792 prompts, gate check, merge in the PR's repo, runner closes the INFRA issue")

# ---- INFRA issue 5 and GAME PR 5 alive at once: state keyed by (repo, number); runner text is a full URL
assert repos.pr_ref(G, 5) != repos.pr_ref(I, 5) and "#5" not in repos.pr_ref(G, 5)
f = Fake((f"--repo {I} --head lane/5", [{"number": 5, "headRefName": "lane/5"}]))   # INFRA issue 5 has its PR 5 in INFRA; no GAME PR 5 by head
assert r.pr_where(5, f) == (5, "lane/5", I)
f = Fake((f"--repo {G} --head lane/5", [{"number": 5, "headRefName": "lane/5"}]))
assert r.pr_where(5, f) == (5, "lane/5", G)

# ---- trusted authors (#800) cover GAME comments through the same helper
cm = lambda body, who: {"body": body, "createdAt": "2026-11-28T12:00:00Z", "author": {"login": who}}
f = Fake((f"pr view 5 --repo {G}", {"comments": [cm("VERDICT: PASS", "mallory"), cm("VERDICT: FIX x", "igalgerman")]}))
st = r.review_status(5, f, repo=G)
assert st["line"] == "VERDICT: FIX x" and f"--repo {G}" in f.calls[0], st                 # the stranger's PASS is ignored; the GAME repo was read
f = Fake((f"pr view 5 --repo {G}", {"comments": [cm("VERDICT: PASS", "mallory")]}))
assert r.review_status(5, f, repo=G)["state"] == "working"
repos.set_pr_repo(G)
f = Fake(("pr view 5", {"comments": []}))
r.review_status(5, f); assert f"--repo {G}" in f.calls[0]; repos.set_pr_repo(None)    # default = the lane's PR repo

# ---- deploy readers read GAME (INFRA in one-repo mode)
assert repos.deploy_repo() == G
import dashboard as DB
seen = []
saved_dr = DB.R.run; DB.R.run = lambda cmd, **k: (seen.append(" ".join(cmd)), (0, '["abc"]' if "deployments" in " ".join(cmd) else "[]"))[1]
DB.ci_voice(); DB.R.run = saved_dr
assert seen and all(f"repos/{G}/" in x for x in seen) and not any(f"repos/{I}/" in x for x in seen), seen
g0 = repos.GAME; repos.GAME = ""; assert repos.deploy_repo() == I; repos.GAME = g0
src = (ROOT / "tools" / "test_garden.py").read_text(encoding="utf-8")
assert "actions/workflows/tests.yml" in src and "repos/{RUNS_REPO}/actions" in src and "repos/{REPO}/actions" not in src   # suite times: GAME
print("ok #792 same-number refs, trusted authors on GAME, deploy readers")
print("ALL repos tests passed")
