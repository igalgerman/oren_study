# Unit test for ghcache.py (#329: one GitHub reader + cache, retry on rate limit) with fakes: python tools/runner/test_ghcache.py
import os, tempfile; os.environ["OREN_TEST"] = "1"; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
import json, time
from pathlib import Path
import ghcache as G

R = "igalgerman/oren_study"
NOW = 1_800_000_000

# ---------- rate-limit text -> retry, not exit ----------
assert G.rate_limited("GraphQL: API rate limit already exceeded for user ID 1.")
assert G.rate_limited("HTTP 403: You have exceeded a secondary rate limit. Please wait a few minutes")
assert G.rate_limited("abuse detection mechanism")
assert not G.rate_limited("HTTP 404: Not Found")
assert G.wait_s("Retry-After: 17") == 17 and G.wait_s("nothing") == 60 and G.wait_s("retry after 9999 s") == 300

calls, slept = [], []
answers = [(1, "GraphQL: API rate limit already exceeded"), (1, "secondary rate limit"), (0, "[]")]
def once():
    calls.append(1); return answers[len(calls) - 1]
rc, out = G.with_retry(once, sleep=slept.append)
assert (rc, out) == (0, "[]") and len(calls) == 3 and slept == [60, 60], (rc, out, calls, slept)
calls.clear(); slept.clear()
rc, out = G.with_retry(lambda: (calls.append(1), (1, "HTTP 404: Not Found"))[1], sleep=slept.append)
assert rc == 1 and len(calls) == 1 and slept == [], "a real error is not retried"
calls.clear(); slept.clear()
rc, out = G.with_retry(lambda: (calls.append(1), (1, "API rate limit exceeded"))[1], sleep=slept.append, tries=3)
assert rc == 1 and len(calls) == 3 and len(slept) == 2, "gives up after `tries`, the caller decides (never a crash)"
print("ok rate limit -> retry with backoff")

# ---------- writes vs reads ----------
assert not G.is_write(["gh", "issue", "list", "--repo", R])
assert not G.is_write(["gh", "pr", "view", "5", "--json", "comments"])
assert not G.is_write(["gh", "api", f"repos/{R}/branches/lane/5", "--jq", "."])
assert not G.is_write(["gh", "api", "graphql", "-f", "query=query{viewer{login}}"])
assert G.is_write(["gh", "issue", "edit", "7", "--add-label", "x", "--repo", R]) and G.write_target(["gh", "issue", "edit", "7"]) == "7"
assert G.is_write(["gh", "issue", "comment", "7", "--body", "b"]) and G.is_write(["gh", "pr", "merge", "12", "--squash"])
assert G.is_write(["gh", "label", "create", "x", "--force"]) and G.write_target(["gh", "label", "create", "x"]) == "", "label writes change no issue: cache stays valid"
assert G.is_write(["gh", "api", "-X", "POST", f"repos/{R}/issues/9/comments", "-f", "body=x"])
assert G.write_target(["gh", "api", "-X", "POST", f"repos/{R}/issues/9/comments"]) == "9"
print("ok writes are told apart from reads")

# ---------- one batched GraphQL query -> cache ----------
def conn(nodes, more=False, cur="c1", total=None):
    return {"totalCount": len(nodes) if total is None else total, "pageInfo": {"hasNextPage": more, "endCursor": cur}, "nodes": nodes}
OPEN = [{"number": 9, "title": "nine", "body": "b9", "state": "OPEN", "createdAt": "2026-11-26T10:00:00Z", "updatedAt": "2026-11-26T11:00:00Z",
         "closedAt": None, "labels": {"nodes": [{"name": "in-progress"}, {"name": "cloud"}]},
         "comments": {"nodes": [{"body": "Runner: started (pack lane, remote)", "createdAt": "2026-11-26T10:01:00Z", "author": {"login": "o"}}]}},
        {"number": 8, "title": "eight", "body": "b8", "state": "OPEN", "createdAt": "2026-11-26T09:00:00Z", "updatedAt": "2026-11-26T09:00:00Z",
         "closedAt": None, "labels": {"nodes": [{"name": "ready-for-agent"}]}, "comments": {"nodes": []}}]
CLOSED = [{"number": 7, "title": "seven", "state": "CLOSED", "createdAt": "2026-11-25T09:00:00Z", "updatedAt": "2026-11-26T08:00:00Z",
           "closedAt": "2026-11-26T08:00:00Z", "labels": {"nodes": [{"name": "pack"}]}}]
PRS = [{"number": 20, "url": "https://github.com/x/pull/20", "title": "t", "headRefName": "lane/9", "body": "Closes #9", "state": "OPEN", "isDraft": False,
        "mergedAt": None, "createdAt": "2026-11-26T10:30:00Z", "updatedAt": "2026-11-26T10:40:00Z", "closedAt": None, "labels": {"nodes": []},
        "commits": {"nodes": [{"commit": {"committedDate": "2026-11-26T10:35:00Z"}}]},
        "comments": {"nodes": [{"body": "VERDICT: PASS", "createdAt": "2026-11-26T10:50:00Z", "author": {"login": "o"}}]}},
       {"number": 19, "url": "https://github.com/x/pull/19", "title": "old", "headRefName": "lane/7", "body": "", "state": "MERGED", "isDraft": False,
        "mergedAt": "2026-11-26T07:59:00Z", "createdAt": "2026-11-25T10:00:00Z", "updatedAt": "2026-11-26T07:59:00Z", "closedAt": "2026-11-26T07:59:00Z",
        "labels": {"nodes": []}, "commits": {"nodes": []}, "comments": {"nodes": []}}]
REFS = [{"name": "9", "target": {"committedDate": "2026-11-26T10:35:00Z"}}]

def graphql_answer(full=True, closed_nodes=CLOSED, closed_more=False):
    repo = {"open": conn(OPEN), "closed": conn(closed_nodes, closed_more)}
    d = {"data": {"repository": repo}}
    if full:
        repo.update({"prs": {"nodes": PRS}, "openPrs": {"totalCount": 1}, "refs": conn(REFS)})
    return json.dumps(d)

seen = []
def fake_gh(cmd):
    seen.append(cmd)
    line = " ".join(cmd)
    if cmd[:3] == ["gh", "api", "graphql"]: return 0, graphql_answer(full="full=true" in line)
    if cmd[:3] == ["gh", "api", "rate_limit"]:
        return 0, json.dumps({"resources": {"core": {"limit": 5000, "remaining": 4900, "reset": NOW + 900},
                                             "graphql": {"limit": 5000, "remaining": 900, "reset": NOW + 900}}})
    return 1, "unexpected"

c = G.refresh(fake_gh, now=NOW)
assert sum(x[:3] == ["gh", "api", "graphql"] for x in seen) == 1, "ONE batched GraphQL query per refresh"
assert [i["number"] for i in c["open"]] == [9, 8] and c["open"][0]["labels"] == [{"name": "in-progress"}, {"name": "cloud"}]
assert c["closed"][0]["number"] == 7 and c["closed_total"] == 1 and c["prs"][0]["commits"] == [{"committedDate": "2026-11-26T10:35:00Z"}]
assert c["rate"] == {"graphql": [900, 5000], "core": [4900, 5000]} and c["ts"] == NOW
assert json.loads((Path(os.environ["RUNNER_RUNS"]) / "gh_cache.json").read_text(encoding="utf-8"))["ts"] == NOW
print("ok refresh: one batched GraphQL query -> .runs/gh_cache.json")

# a later refresh keeps closed issues it saw before (one closed page per minute is enough), drops ones open again
c2 = G.merge_closed([{"number": 7, "closedAt": "x"}, {"number": 6, "closedAt": "2026-11-20T00:00:00Z"}], [{"number": 5, "closedAt": "2026-11-26T09:00:00Z"}], {7})
assert [i["number"] for i in c2] == [5, 6], c2
print("ok closed issues merged across refreshes")

# ---------- answers: reads served from the cache, no gh call ----------
def ans(*cmd, now=NOW + 30): return G.answer(list(cmd), now=now)
rc, out = ans("gh", "issue", "list", "--state", "open", "--limit", "200", "--json", "number,labels,title", "--repo", R)
assert rc == 0 and json.loads(out) == [{"number": 9, "labels": [{"name": "in-progress"}, {"name": "cloud"}], "title": "nine"},
                                       {"number": 8, "labels": [{"name": "ready-for-agent"}], "title": "eight"}], out
rc, out = ans("gh", "issue", "list", "--repo", R, "--state", "open", "--label", "cloud", "--limit", "50", "--json", "number,title,createdAt,comments")
assert [i["number"] for i in json.loads(out)] == [9] and json.loads(out)[0]["comments"][0]["body"].startswith("Runner: started")
rc, out = ans("gh", "issue", "list", "-R", R, "--state", "closed", "--limit", "300", "--json", "number,title,labels,closedAt")
assert [i["number"] for i in json.loads(out)] == [7]
rc, out = ans("gh", "issue", "list", "--state", "all", "--limit", "300", "--json", "number,state,labels")
assert [(i["number"], i["state"]) for i in json.loads(out)] == [(9, "OPEN"), (8, "OPEN"), (7, "CLOSED")]
assert ans("gh", "issue", "list", "--state", "all", "--limit", "1000", "--json", "number,body") is None, "closed issues have no body in the cache -> real gh"
rc, out = ans("gh", "issue", "view", "9", "--repo", R, "--json", "number,labels,createdAt,state,title")
assert json.loads(out) == {"number": 9, "labels": [{"name": "in-progress"}, {"name": "cloud"}], "createdAt": "2026-11-26T10:00:00Z", "state": "OPEN", "title": "nine"}
rc, out = ans("gh", "issue", "view", "7", "--json", "state")
assert json.loads(out) == {"state": "CLOSED"}
assert ans("gh", "issue", "view", "123", "--json", "state") is None, "unknown issue -> real gh"
rc, out = ans("gh", "pr", "list", "--repo", R, "--head", "lane/9", "--state", "all", "--json", "number,url,isDraft,state,commits")
assert json.loads(out) == [{"number": 20, "url": "https://github.com/x/pull/20", "isDraft": False, "state": "OPEN", "commits": [{"committedDate": "2026-11-26T10:35:00Z"}]}]
rc, out = ans("gh", "pr", "list", "--repo", R, "--state", "open", "--json", "headRefName")
assert json.loads(out) == [{"headRefName": "lane/9"}]
rc, out = ans("gh", "pr", "list", "--repo", R, "--state", "merged", "--json", "number,mergedAt")
assert json.loads(out) == [{"number": 19, "mergedAt": "2026-11-26T07:59:00Z"}]
rc, out = ans("gh", "pr", "view", "20", "--repo", R, "--json", "comments")
assert json.loads(out)["comments"][0]["body"] == "VERDICT: PASS"
assert ans("gh", "pr", "list", "--state", "open", "--json", "number,reviewDecision") is None, "a field the cache lacks -> real gh"
cc = G.load(); G._save({**cc, "prs_complete": False})                 # a repo with more PRs than the cache page
assert ans("gh", "pr", "list", "--state", "all", "--limit", "500", "--json", "number") is None, "more than the cache holds -> real gh"
G._save(cc)
assert ans("gh", "issue", "list", "--search", "x", "--json", "number") is None, "unknown flag -> real gh"
assert ans("gh", "issue", "view", "9", "--json", "title", "-q", ".title") is None
rc, out = ans("gh", "api", f"repos/{R}/branches/lane/9", "--jq", ".commit.commit.committer.date")
assert (rc, out.strip()) == (0, "2026-11-26T10:35:00Z")
assert ans("gh", "api", f"repos/{R}/branches/lane/77", "--jq", ".commit.commit.committer.date")[0] != 0, "no such lane branch (refs complete)"
assert G.issue_over_cached(9, "2026-11-26T00:00:00Z", now=NOW + 30) is False
assert G.issue_over_cached(7, "2026-11-26T00:00:00Z", now=NOW + 30) is True
assert G.issue_over_cached(123, "2026-11-26T00:00:00Z", now=NOW + 30) is None
print("ok reads answered from the cache")

# ---------- freshness: stale cache or a newer write -> real gh ----------
assert ans("gh", "issue", "view", "9", "--json", "state", now=NOW + G.MAX_AGE + 1) is None, "stale cache is never used"
G.mark_dirty("9", now=NOW + 10)
assert ans("gh", "issue", "view", "9", "--json", "state") is None, "issue written after the cache: real gh until the next refresh"
assert ans("gh", "issue", "view", "8", "--json", "state") is not None, "other issues still from the cache"
assert ans("gh", "issue", "list", "--state", "open", "--json", "number") is None, "lists after any newer write: real gh"
c = G.refresh(fake_gh, now=NOW + 60)
assert ans("gh", "issue", "list", "--state", "open", "--json", "number", now=NOW + 70) is not None, "a newer refresh covers the write"
print("ok stale cache / newer writes go to GitHub")

# ---------- call(): the one entry point used by runner.run and remote.sh ----------
raw_calls = []
def raw(): raw_calls.append(1); return 0, "done"
assert G.call(["gh", "issue", "view", "9", "--json", "state"], raw, now=NOW + 70)[0] == 0 and raw_calls == []
assert G.call(["gh", "issue", "edit", "8", "--add-label", "x"], raw, now=NOW + 71) == (0, "done") and raw_calls == [1]
assert G.answer(["gh", "issue", "view", "8", "--json", "state"], now=NOW + 72) is None, "the write marked #8 dirty"
assert G.call(["git", "status"], raw, now=NOW + 73) == (0, "done")
assert G.calls_per_min(now=NOW + 75) >= 1, "real gh calls are counted"
print("ok call(): cache first, writes mark dirty, calls counted")

# ---------- dashboard line ----------
line = G.status_line({"ts": NOW, "rate": {"graphql": [900, 5000], "core": [4900, 5000]}}, 12, now=NOW + 20)
assert line == "GitHub: 12 calls/min · graphql 900/5000 (18%) · core 4900/5000 (98%) · cache 20 s old · ALARM GitHub budget < 20%", line
line = G.status_line({"ts": NOW, "rate": {"graphql": [4000, 5000], "core": [4900, 5000]}}, 3, now=NOW + 20)
assert "ALARM" not in line and "graphql 4000/5000 (80%)" in line
assert G.status_line(None, 3, now=NOW) == "GitHub: 3 calls/min · no cache yet (watchdog reads GitHub once a minute)"
assert "ALARM cache" in G.status_line({"ts": NOW, "rate": {}}, 3, now=NOW + 600)
print("ok dashboard line: calls/min, remaining graphql/core, alarm < 20%")
# #363: with the GitHub App the bots and the owner have their own budget: one line, per identity
line = G.status_line({"ts": NOW, "rate": {"graphql": [4000, 5000], "core": [4900, 5000]}, "rate_owner": {"graphql": [800, 5000], "core": [5000, 5000]}}, 3, now=NOW + 20)
assert line == ("GitHub: 3 calls/min · app graphql 4000/5000 (80%) · app core 4900/5000 (98%) · owner graphql 800/5000 (16%) · "
                "owner core 5000/5000 (100%) · cache 20 s old · ALARM GitHub budget < 20%"), line
owner_seen = []
def owner_gh(cmd):
    owner_seen.append(cmd)
    return 0, json.dumps({"resources": {"core": {"limit": 5000, "remaining": 4000}, "graphql": {"limit": 5000, "remaining": 3000}}})
c = G.refresh(fake_gh, now=NOW + 61, run_owner=owner_gh)
assert owner_seen == [["gh", "api", "rate_limit"]] and c["rate_owner"] == {"graphql": [3000, 5000], "core": [4000, 5000]}, c.get("rate_owner")
assert c["rate"] == {"graphql": [900, 5000], "core": [4900, 5000]}, "the bots' own budget"
assert "rate_owner" not in G.refresh(fake_gh, now=NOW + 62), "no App: one identity, no owner line"
print("ok #363 budget per identity (app / owner)")
# ---------- runner.run: the real entry point, with a fake gh ----------
import subprocess, runner as RN, ghauth
ghauth.token = lambda *a, **k: ""    # config.toml has the App set up: never mint (openssl/network) in a unit test; the patched subprocess.run would be eaten
class P:
    def __init__(self, rc, out): self.returncode, self.stdout, self.stderr = rc, out, ""
outs, waits = [P(1, "GraphQL: API rate limit already exceeded for user ID 1."), P(0, '{"number": 5}')], []
real_sub, real_sleep = RN.subprocess.run, G.time.sleep
RN.subprocess.run = lambda *a, **k: outs.pop(0)
G.time.sleep = waits.append
try:
    rc, out = RN.run(["gh", "issue", "view", "5", "--json", "number"])
    assert (rc, out) == (0, '{"number": 5}') and waits == [60], "rate-limited gh call is retried by runner.run, the run does not exit"
    RN.subprocess.run = lambda *a, **k: (_ for _ in ()).throw(AssertionError("gh called although the cache knows #9"))
    G._save({**G.load(), "ts": time.time()}); G.DIRTY.unlink()          # NOW above is a future time: start clean at the real clock
    assert json.loads(RN.issue_by_number(9) and RN.gh("issue", "view", "9", "--json", "number,title")[1]) == {"number": 9, "title": "nine"}
    assert RN.issue_by_number(9)["labels"] == ["in-progress", "cloud"], "a run's start reads its issue from the cache"
    assert RN.issue_over(9, "2026-11-26T00:00:00Z") is False and RN.issue_over(7, "2026-11-26T00:00:00Z") is True, "#234 from the cache"
    assert G.rate_limited(str(SystemExit("cannot read #5: GraphQL: API rate limit already exceeded")))   # main(): -> back to ready
finally:
    RN.subprocess.run, G.time.sleep = real_sub, real_sleep
print("ok runner.run: cache first, rate limit retried")
# #363: runner.run gives gh (and only gh) the App token; OWNER marker -> owner login
envs, real_tok = [], ghauth.token
ghauth.token = lambda *a, **k: "ghs_app"
RN.subprocess.run = lambda cmd, **k: (envs.append(k["env"]), P(0, "{}"))[1]
try:
    RN.run(["gh", "api", "repos/x/y/commits", "--jq", "."]); RN.run(["claude", "-p", "x"]); RN.run(["gh", "api", "rate_limit"], env={ghauth.OWNER: "1"})
finally:
    RN.subprocess.run, ghauth.token = real_sub, real_tok
assert envs[0].get("GH_TOKEN") == "ghs_app" and envs[1].get("GH_TOKEN") != "ghs_app" and "GH_TOKEN" not in envs[2] and ghauth.OWNER not in envs[2], [e.get("GH_TOKEN") for e in envs]
import remote as RM
envs.clear(); ghauth.token = lambda *a, **k: "ghs_app"
real_rsub = RM.subprocess.run
RM.subprocess.run = lambda cmd, **k: (envs.append(k["env"]), P(0, "{}"))[1]
try: RM.sh(["gh", "api", "repos/x/y/commits"]); RM.sh(["claude", "--version"], env={"A": "1"})
finally: RM.subprocess.run, ghauth.token = real_rsub, real_tok
assert envs[0].get("GH_TOKEN") == "ghs_app" and (envs[1] or {}).get("GH_TOKEN") != "ghs_app", "remote.py (panel, cloud polls) too; Claude sessions keep the owner"
print("ok #363 runner.run / remote.sh: App token for gh only")
# ---------- watchdog: the one reader, in a thread, never two at once ----------
import watchdog as W
started = []
G._save({**G.load(), "ts": time.time()})
assert W.ghcache_tick(start=started.append) is False and not started, "cache fresh: no read"
G._save({**G.load(), "ts": time.time() - 120})
assert W.ghcache_tick(start=started.append) is True and len(started) == 1
assert W.ghcache_tick(start=started.append) is False, "a refresh is still running: never two"
RN.subprocess.run = lambda cmd, **k: P(*fake_gh(cmd))
try: started[0]()
finally: RN.subprocess.run = real_sub
assert time.time() - G.load()["ts"] < 5 and not W._GH_BUSY.is_set(), "the thread refreshed the cache through runner.run"
print("ok watchdog ghcache_tick")

# ---------- review fix: CI from the cache counts as green for the watchdog (#225 nudge, merge-lock alarm) ----------
def pr_node(n, st):
    return {"number": n, "isDraft": False, "autoMergeRequest": None, "createdAt": "2026-11-26T10:00:00Z", "updatedAt": "2026-11-26T10:00:00Z",
            "commits": {"nodes": [{"commit": {"committedDate": "2026-11-26T10:00:00Z", "statusCheckRollup": {"state": st}}}]}}
cached = [G._flat(pr_node(1, "SUCCESS")), G._flat(pr_node(2, "PENDING")), G._flat(pr_node(3, "FAILURE"))]
assert W.waiting_reviews(cached, time.time()) == [1], "a cached SUCCESS PR waits for review; PENDING/FAILURE do not"
real_gh = W.R.gh
W.R.gh = lambda *a, **k: (0, json.dumps(cached))
try: assert W.green_waiting() == [1], "merge-lock alarm lists the cached green PR"
finally: W.R.gh = real_gh
print("ok cached statusCheckRollup is green for watchdog checks")
# ---------- #469: two identities (app / owner), switch on a rate limit, never a long wait for owner questions ----------
G.LIMITED.unlink(missing_ok=True)
clk = [1000.0]; G._clock = lambda: clk[0]
def fsleep(s): slept.append(s); clk[0] += s
def ident(name, answers):
    got = []
    def f(): got.append(1); return answers.pop(0) if answers else (0, name)
    f.got = got; return f
LIM = (1, "GraphQL: API rate limit already exceeded for installation ID 186191764")
slept.clear()
app, own = ident("app", [LIM]), ident("owner", [])
rc, out = G.call(["gh", "issue", "view", "123", "--json", "body"], app, sleep=fsleep, alt=own)
assert (rc, out) == (0, "owner") and slept == [] and len(app.got) == 1 and len(own.got) == 1, (rc, out, slept)
assert "switched to owner" in (G.RUNS / "ghauth.log").read_text(encoding="utf-8")
app2, own2 = ident("app", []), ident("owner", [])
assert G.call(["gh", "issue", "view", "124", "--json", "body"], app2, sleep=fsleep, alt=own2) == (0, "owner") and not app2.got, \
    "the next READ starts on the other identity while the app is limited"
w_app, w_own = ident("app", []), ident("owner", [])
assert G.call(["gh", "issue", "comment", "5", "--body", "x"], w_app, sleep=fsleep, alt=w_own) == (0, "owner") and not w_app.got, "a write leaves the app only while it is limited"
G.LIMITED.unlink()
w_app, w_own = ident("app", []), ident("owner", [])
assert G.call(["gh", "issue", "comment", "5", "--body", "x"], w_app, sleep=fsleep, alt=w_own) == (0, "app") and not w_own.got, "writes keep the app"
print("ok #469 app limited -> owner used at once, no 60 s sleep")
G.LIMITED.unlink(missing_ok=True); slept.clear()
app, own = ident("app", [LIM, (0, "app")]), ident("owner", [(1, "You have exceeded a secondary rate limit")])
assert G.call(["gh", "issue", "view", "125", "--json", "body"], app, sleep=fsleep, alt=own) == (0, "app")
assert slept == [G.BOTH_WAIT] and G.BOTH_WAIT <= 15, slept
print("ok #469 both limited -> short wait, then retry")
G.LIMITED.unlink(missing_ok=True); slept.clear()
app, own = ident("app", [LIM] * 50), ident("owner", [LIM] * 50)
with G.quick(10):
    rc, out = G.call(["gh", "issue", "comment", "193", "--body", "q"], app, sleep=fsleep, alt=own)
assert rc != 0 and sum(slept) <= 10, slept
slept.clear(); one = ident("app", [LIM] * 50)
with G.quick(10): G.call(["gh", "issue", "view", "126", "--json", "body"], one, sleep=fsleep)
assert sum(slept) <= 10, "one identity (no App) is bounded too"
assert G.quick_left() is None, "outside quick(): no deadline"
print("ok #469 quick(10): never more than 10 s of waiting")
# caller per call + dashboard: both budgets, calls per identity, alarm at the first secondary-limit hit
lines = [l.split() for l in G.CALLS.read_text(encoding="utf-8").splitlines() if l.strip()]
assert all(len(l) >= 3 for l in lines[-3:]) and lines[-1][1] in ("app", "owner"), lines[-3:]
G.CALLS.write_text("".join(f"{t} {w} {c}\n" for t, w, c in [(NOW, "app", "watchdog:api"), (NOW + 1, "app", "watchdog:api"), (NOW + 2, "owner", "owner_q:issue"),
                                                                 (NOW + 61, "app", "remote:pr")]), encoding="utf-8")
assert G.calls_per_min(now=NOW + 30) == 3 and G.calls_by(now=NOW + 30) == {"app": 2, "owner": 1}
rep = G.top_report(NOW - 1, NOW + 120)
assert rep.splitlines()[0].endswith("3  app 2 watchdog:api · owner 1 owner_q:issue") and "remote:pr" in rep.splitlines()[1], rep
G.LIMITED.unlink(missing_ok=True)
G.mark_limited("app", "You have exceeded a secondary rate limit", now=NOW + 5)
line = G.status_line({"ts": NOW, "rate": {"graphql": [4000, 5000]}, "rate_owner": {"graphql": [3000, 5000]}}, 3, now=NOW + 20, by={"app": 2, "owner": 1})
assert "calls/min (app 2 · owner 1)" in line and "ALARM app hit the secondary rate limit" in line, line
assert "ALARM app hit" not in G.status_line({"ts": NOW + 4000, "rate": {}}, 0, now=NOW + 4000), "the alarm ends an hour after the last hit"
print("ok #469 caller log, per-minute report, dashboard alarm")
# runner.run: the App token first; on its limit the same command runs as the owner (no GH_TOKEN)
G.LIMITED.unlink(missing_ok=True)
toks = []
def sub_lim(cmd, **k):
    toks.append(k["env"].get("GH_TOKEN"))
    return P(1, LIM[1]) if k["env"].get("GH_TOKEN") == "ghs_app" else P(0, "owner ok")
ghauth.token = lambda *a, **k: "ghs_app"; RN.subprocess.run = sub_lim; G.time.sleep = lambda s: (_ for _ in ()).throw(AssertionError("slept"))
try: rc, out = RN.run(["gh", "issue", "view", "127", "--json", "body"])
finally: RN.subprocess.run, ghauth.token, G.time.sleep = real_sub, real_tok, real_sleep
assert (rc, out) == (0, "owner ok") and toks[0] == "ghs_app" and toks[1] != "ghs_app", toks
G.LIMITED.unlink(missing_ok=True); G._clock = time.monotonic
print("ok #469 runner.run switches to the owner login on the app's limit")
print("ALL ghcache tests passed")
