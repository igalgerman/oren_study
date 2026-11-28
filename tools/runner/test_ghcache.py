# Unit test for ghcache.py (#329: one GitHub reader + cache, retry on rate limit) with fakes: python tools/runner/test_ghcache.py
import os, tempfile; os.environ["OREN_TEST"] = "1"; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
import re, trust   # #800: old fixtures have no author: default them to the owner (explicit authors still count; test_trust.py covers the real rules)
_login = trust.login
trust.login = lambda c: _login(c) or (("oren-study-bot" if re.match(r"\s*(OWNER ANSWER|ANSWERED)", c.get("body") or "") or "owner-answer:" in (c.get("body") or "") else "igalgerman") if isinstance(c, dict) else "")
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

# #637: comments keep url + reactionGroups (a thumbs-up answers an owner question); > 100 comments -> real gh (it pages)
for sel in (G._COMMENTS, G._Q.split("prs:")[1], G._GATED_C):    # #911: reactions only for the gated issues (G._GATED_C), the rest is slim
    assert "url" in sel.split("comments(")[1] and "totalCount" in sel.split("comments(")[1], sel
assert "reactionGroups{content users(first:20){totalCount nodes{login}}}" in G._GATED_C
import owner_q as OQ
QB = "<!-- owner_q --><!-- owner-q:{k} -->\n**#{n}** חלון `remote-{n}`\n\n**שאלה:** q{n}?\n"
QCS = [{"body": QB.format(k="47df330c6428", n=392), "createdAt": "2026-11-27T10:00:00Z", "author": {"login": "o"},
        "url": "https://github.com/x/issues/205#issuecomment-1", "reactionGroups": [{"content": "THUMBS_UP", "users": {"totalCount": 1}}]},
       {"body": QB.format(k="3381e878897f", n=53), "createdAt": "2026-11-27T10:01:00Z", "author": {"login": "igalgerman"},
        "url": "https://github.com/x/issues/205#issuecomment-2", "reactionGroups": [{"content": "THUMBS_UP", "users": {"totalCount": 0}}]}]
Q205 = {**OPEN[1], "number": 205, "title": "Questions for the owner", "comments": {"totalCount": 2, "nodes": QCS}}
cc = G.load(); G._save({**cc, "open": cc["open"] + [G._flat(Q205)]})
rc, out = ans("gh", "issue", "view", "205", "--json", "comments")
qs = OQ.open_questions(json.loads(out)["comments"])
assert [q["key"] for q in qs] == ["3381e878897f"] and qs[0]["url"] == "https://github.com/x/issues/205#issuecomment-2", qs
G._save({**cc, "open": cc["open"] + [G._flat({**Q205, "comments": {"totalCount": 182, "nodes": QCS}})]})
assert ans("gh", "issue", "view", "205", "--json", "comments") is None, "the cache holds only the last 100 comments -> real gh pages them all"
assert json.loads(ans("gh", "issue", "view", "205", "--json", "title")[1]) == {"title": "Questions for the owner"}, "other fields still cached"
assert ans("gh", "issue", "list", "--state", "open", "--limit", "200", "--json", "number,comments") is None, "a list with a cut comment list -> real gh"
G._save(cc)
print("ok #637 cached comments keep url + reactions; > 100 comments -> real gh")
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
G._save({**G.load(), "rate_owner": {"graphql": [4000, 5000]}})          # #911: the owner login has budget left
app, own = ident("app", [LIM]), ident("owner", [])
rc, out = G.call(["gh", "issue", "comment", "123", "--body", "x"], app, sleep=fsleep, alt=own)     # #911: a WRITE may use the owner login
assert (rc, out) == (0, "owner") and slept == [] and len(app.got) == 1 and len(own.got) == 1, (rc, out, slept)
assert "switched to owner" in (G.RUNS / "ghauth.log").read_text(encoding="utf-8")
app2, own2 = ident("app", []), ident("owner", [])
assert G.call(["gh", "issue", "edit", "124", "--add-label", "x"], app2, sleep=fsleep, alt=own2) == (0, "owner") and not app2.got, \
    "the next WRITE starts on the other identity while the app is limited"
w_app, w_own = ident("app", []), ident("owner", [])
assert G.call(["gh", "issue", "comment", "5", "--body", "x"], w_app, sleep=fsleep, alt=w_own) == (0, "owner") and not w_app.got, "a write leaves the app only while it is limited"
G.LIMITED.unlink()
w_app, w_own = ident("app", []), ident("owner", [])
assert G.call(["gh", "issue", "comment", "5", "--body", "x"], w_app, sleep=fsleep, alt=w_own) == (0, "app") and not w_own.got, "writes keep the app"
print("ok #469 app limited -> owner used at once, no 60 s sleep")
G.LIMITED.unlink(missing_ok=True); slept.clear()
app, own = ident("app", [LIM, (0, "app")]), ident("owner", [(1, "You have exceeded a secondary rate limit")])
assert G.call(["gh", "issue", "comment", "125", "--body", "x"], app, sleep=fsleep, alt=own) == (0, "app")
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
# #848: endpoint per call (numbers replaced, no query/token), old lines parse, top groups by caller + endpoint
assert G.endpoint_of(["gh", "api", "repos/igalgerman/oren_study/issues/848/comments?per_page=100&access_token=SECRET"]) == "repos/{o}/{r}/issues/{n}/comments"
assert G.endpoint_of(["gh", "api", "-X", "GET", "repos/a/b/pulls/7"]) == "repos/{o}/{r}/pulls/{n}" and G.endpoint_of(["gh", "api", "graphql", "-f", "query=x"]) == "graphql"
assert G.endpoint_of(["gh", "issue", "list", "--json", "x"]) == "issue_list" and G.endpoint_of(["gh"]) == ""
G.CALLS.write_text(f"{NOW} app watchdog:api\ngarbage\n{NOW+1} app watchdog:api repos/{{o}}/{{r}}/issues/{{n}}/comments\n{NOW+2} app watchdog:api repos/{{o}}/{{r}}/issues/{{n}}/comments\n{NOW+3} owner x:pr pr_list\n", encoding="utf-8")
assert [c[3] for c in G._calls()] == ["", "repos/{o}/{r}/issues/{n}/comments", "repos/{o}/{r}/issues/{n}/comments", "pr_list"]
tail = G.top_report(NOW - 1, NOW + 120).split("total by caller + endpoint:")[1].split("\n")
assert tail[1].split(None, 1) == ["2", "watchdog:api repos/{o}/{r}/issues/{n}/comments"] and any(l.split(None, 1) == ["1", "watchdog:api"] for l in tail), tail
G.note_call(NOW, "app", "w:api", G.endpoint_of(["gh", "api", "repos/a/b/issues/3"]))
assert G.CALLS.read_text(encoding="utf-8").splitlines()[-1] == f"{NOW} app w:api repos/{{o}}/{{r}}/issues/{{n}}"
print("ok #848 endpoint log + top by caller+endpoint")
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
try: rc, out = RN.run(["gh", "issue", "comment", "127", "--body", "x"])
finally: RN.subprocess.run, ghauth.token, G.time.sleep = real_sub, real_tok, real_sleep
assert (rc, out) == (0, "owner ok") and toks[0] == "ghs_app" and toks[1] != "ghs_app", toks
G.LIMITED.unlink(missing_ok=True); G._clock = time.monotonic
print("ok #469 runner.run switches to the owner login on the app's limit")
# ---------- #726: a garbage log line never fails the refresh; a PermissionError on replace is retried ----------
G.CALLS.write_text(f"e\n\n{NOW + 190}\n{NOW + 190} who cal\n12", encoding="utf-8")
G.DIRTY.write_text("e\n\nxx y\nhalf\n", encoding="utf-8")
c = G.refresh(fake_gh, now=NOW + 200)
assert c and c["ts"] == NOW + 200, "refresh survives garbage lines in gh_calls.log / gh_dirty.log"
kept = G._lines(G.CALLS)
assert kept and all(l.split()[0].replace(".", "").isdigit() for l in kept) and "e" not in kept, kept
assert G._dirty_since(0) == set(), "garbage dirty lines are skipped"
real_replace, n_perm = G.os.replace, []
def flaky(a, b):
    if not n_perm: n_perm.append(1); raise PermissionError(13, "Access is denied")
    return real_replace(a, b)
G.os.replace, G.time.sleep = flaky, lambda s: None
try: G._save({"ts": NOW + 300})
finally: G.os.replace, G.time.sleep = real_replace, time.sleep
assert n_perm and G.load()["ts"] == NOW + 300, "saved after one PermissionError"
print("ok #726 garbage log lines and replace retry")

# ---------- #911 ----------
# 1. a cached PR view without -q: every field the CI wait reads comes from the cache, no gh call
G.LIMITED.unlink(missing_ok=True)
def pr_cache(state, **extra):
    G._save({"ts": NOW, "open": [], "closed": [], "open_complete": True, "prs_complete": True, "lanes": {}, "rate": {}, "closed_total": 0,
             "prs": [{"number": 30, "state": "OPEN", "mergeable": "MERGEABLE", "isDraft": False, "labels": [{"name": "x"}], "body": "Fixes #5",
                      "headRefOid": "a" * 40, "headRefName": "lane/5", "statusCheckRollup": [{"state": state, "conclusion": state}] if state else [], **extra}]})
    if G.DIRTY.exists(): G.DIRTY.unlink()
pr_cache("PENDING")
nogh = lambda: (_ for _ in ()).throw(AssertionError("real gh call"))
for f in ("state,mergeable", "mergeable", "headRefOid", "isDraft,labels,body"):
    rc, out = G.call(["gh", "pr", "view", "30", "--json", f, "--repo", R], nogh, now=NOW + 5)
    assert rc == 0 and set(json.loads(out)) == set(f.split(",")), (f, out)
assert json.loads(G.call(["gh", "pr", "view", "30", "--json", "headRefOid", "--repo", R], nogh, now=NOW + 5)[1])["headRefOid"] == "a" * 40
assert G.call(["gh", "pr", "view", "30", "--json", "mergeable", "-q", ".mergeable", "--repo", R], lambda: (0, "RAW"), now=NOW + 5) == (0, "RAW"), "-q still goes to gh"
print("ok #911 pr view (no -q) answered from the cache")
# 2. the cached rollup
assert G.pr_rollup(30, now=NOW + 5) == "PENDING" and G.pr_rollup(99, now=NOW + 5) is None and G.pr_rollup(30, now=NOW + 999) is None
pr_cache(None); assert G.pr_rollup(30, now=NOW + 5) == ""
pr_cache("SUCCESS"); G.mark_dirty("30", NOW + 6); assert G.pr_rollup(30, now=NOW + 7) is None, "a write to the PR makes the rollup unknown"
print("ok #911 pr_rollup")
# 3. unknown write targets mark only what they can touch
assert G.write_target(["gh", "pr", "merge", "--repo", R, "30", "--squash"]) == "30" and G.write_target(["gh", "issue", "comment", "--repo", R, "911", "--body", "5"]) == "911"
assert G.write_target(["gh", "pr", "merge", "30", "--auto", "--squash", "--match-head-commit", "abc"]) == "30"
assert G.write_target(["gh", "issue", "create", "--title", "t"]) == "new" and G.write_target(["gh", "pr", "create", "--base", "main"]) == "new"
assert G.write_target(["gh", "api", "-X", "POST", f"repos/{R}/issues", "-f", "title=t"]) == "new"
assert G.write_target(["gh", "api", "graphql", "-f", "query=mutation{x}", "-F", "n=7"]) == "7"
assert G.write_target(["gh", "api", "graphql", "-f", "query=mutation{x}"]) == "*", "still unknown: the old behaviour"
pr_cache("SUCCESS"); G.mark_dirty("new", NOW + 6)
assert G.call(["gh", "pr", "view", "30", "--json", "state"], nogh, now=NOW + 7)[0] == 0, "a created issue does not dirty an unrelated PR view"
print("ok #911 write targets")
# 4. the owner login only above 50% and for writes / gate reads
def own_cache(pct, **kw):
    pr_cache("SUCCESS"); c = G.load(); c["rate_owner"] = {"graphql": [pct * 50, 5000]}; G._save(c)
own_cache(40); G.LIMITED.unlink(missing_ok=True); slept.clear()
G.mark_limited("app", "API rate limit already exceeded", now=time.time())
a_, o_ = ident("app", []), ident("owner", [])
assert G.call(["gh", "issue", "comment", "5", "--body", "x"], a_, sleep=fsleep, alt=o_, now=time.time()) [0] == 0 and not o_.got, "owner at 40%: not even a write"
own_cache(80); G.LIMITED.unlink(missing_ok=True); G.mark_limited("app", "API rate limit already exceeded", now=time.time())
a_, o_ = ident("app", []), ident("owner", [])
assert G.call(["gh", "issue", "comment", "5", "--body", "x"], a_, sleep=fsleep, alt=o_, now=time.time()) == (0, "owner") and not a_.got, "owner at 80%: a write goes"
a_, o_ = ident("app", []), ident("owner", [])
assert G.call(["gh", "api", "graphql", "-f", "query=q"], a_, sleep=fsleep, alt=o_, now=time.time())[0] == 0 and not o_.got, "a plain read never uses the owner login"
with G.gate_read():
    a_, o_ = ident("app", []), ident("owner", [])
    assert G.call(["gh", "api", "graphql", "-f", "query=q"], a_, sleep=fsleep, alt=o_, now=time.time()) == (0, "owner"), "a gate read may"
assert not getattr(G._TICK, "gate", False)
own_cache(30); G.LIMITED.unlink(missing_ok=True); G.mark_limited("app", "API rate limit already exceeded", now=time.time())
with G.gate_read():
    a_, o_ = ident("app", []), ident("owner", [])
    G.call(["gh", "api", "graphql", "-f", "query=q"], a_, sleep=fsleep, alt=o_, now=time.time()); assert not o_.got, "a gate read below 50% waits too"
# limited app + a read the (up to 10 min old) cache can answer: no call at all
own_cache(80); c = G.load(); c["ts"] = time.time() - 400; G._save(c); G.LIMITED.unlink(missing_ok=True); G.mark_limited("app", "API rate limit already exceeded", now=time.time())
assert G.call(["gh", "pr", "view", "30", "--json", "mergeable", "--repo", R], nogh, alt=nogh)[0] == 0, "a 400 s old cache serves a limited app's read"
c["ts"] = time.time() - 700; G._save(c)
a_ = ident("app", []); assert G.call(["gh", "pr", "view", "30", "--json", "mergeable", "--repo", R], a_, sleep=fsleep, alt=ident("owner", []))[0] == 0 and a_.got, "older than 10 min: a real call"
G.LIMITED.unlink(missing_ok=True)
print("ok #911 owner login: writes and gate reads only, above 50%")
# 5. dashboard: a recent 'already exceeded' answer is the real state
G.LIMITED.unlink(missing_ok=True); G.mark_limited("app", "API rate limit already exceeded", now=NOW + 20)
line = G.status_line({"ts": NOW, "rate": {"graphql": [4516, 5000], "core": [4900, 5000]}, "rate_owner": {"graphql": [4000, 5000]}}, 3, now=NOW + 21)
assert "app graphql 0/5000 (0%" in line and "limited until" in line and "ALARM GitHub budget" in line and "owner graphql 4000/5000 (80%)" in line, line
assert "limited until" not in G.status_line({"ts": NOW, "rate": {"graphql": [4516, 5000]}}, 3, now=NOW + 200), "the limit ends at its Retry-After"
G.LIMITED.unlink(missing_ok=True)
print("ok #911 dashboard shows the answer's state")
# 6. the refresh query is slim and its cost is logged
assert "reactionGroups" not in G._Q and "comments(last:100)" not in G._Q and "comments(last:50)" not in G._Q and "rateLimit{cost" in G._Q
def costly(cmd):
    d = json.loads(fake_gh(cmd)[1]) if cmd[:3] == ["gh", "api", "graphql"] else None
    if d: d["data"]["rateLimit"] = {"cost": 31, "remaining": 4000}; return 0, json.dumps(d)
    return fake_gh(cmd)
G.CALLS.write_text("", encoding="utf-8"); G.refresh(costly, now=time.time())
assert G.refresh_costs(5) and all(x == 31 for x in G.refresh_costs(5)), G.refresh_costs(5)
assert G.calls_per_min() == 0 and G.calls_by() == {}, "cost lines are not calls"
# the gated issue (an owner question in its comments, or the owner_q questions issue) gets its comments with reaction users in ONE extra query
G.RUNS.joinpath("owner_q.json").write_text(json.dumps({"issue": 8}), encoding="utf-8")
seen.clear()
GC = [{"body": "x", "createdAt": "2026-11-27T10:00:00Z", "url": "u", "author": {"login": "igalgerman"}, "reactionGroups": [{"content": "THUMBS_UP", "users": {"totalCount": 1, "nodes": [{"login": "igalgerman"}]}}]}]
def gated_gh(cmd):
    if cmd[:3] == ["gh", "api", "graphql"] and "i8:issue(number:8)" in " ".join(cmd): seen.append(cmd)
    if cmd[:3] == ["gh", "api", "graphql"] and "i8:issue(number:8)" in " ".join(cmd):
        return 0, json.dumps({"data": {"repository": {"i8": {"comments": {"totalCount": 1, "nodes": GC}}}, "rateLimit": {"cost": 4, "remaining": 1}}})
    return fake_gh(cmd)
assert G.gated_issues([G._flat(i) for i in OPEN]) == [8]
c = G.refresh(gated_gh, now=time.time())
assert [i["number"] for i in c["open"]] == [9, 8] and c["open"][1]["comments"] == GC and "comments_cut" not in c["open"][1], c["open"][1]
assert c["open"][0]["comments"][0]["body"].startswith("Runner: started"), "other issues stay slim"
assert sum(x[:3] == ["gh", "api", "graphql"] for x in seen) == 2, "main query + ONE gated query"
G.RUNS.joinpath("owner_q.json").unlink()
print("ok #911 refresh query slim + cost logged")
print("ALL ghcache tests passed")
