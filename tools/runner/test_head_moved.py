# Tests for #344: the PR head moved after the review PASS. Only merges of main -> merge the new head; any other commit -> one re-review.
# python3 tools/runner/test_head_moved.py
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
import subprocess, sys
from pathlib import Path
sys.argv.append("--dry-run")
import runner as r

repo = Path(tempfile.mkdtemp(prefix="head-moved-"))
def g(*a):
    p = subprocess.run(["git", *a], cwd=repo, capture_output=True, text=True)
    assert p.returncode == 0, (a, p.stdout, p.stderr)
    return p.stdout.strip()
def write(name, text): (repo / name).write_text(text, encoding="utf-8", newline="\n")
def commit(msg): g("add", "-A"); g("commit", "-qm", msg); return g("rev-parse", "HEAD")
def git(args): p = subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True); return p.returncode, p.stdout
MAIN = f"{r.REMOTE}/{r.BRANCH}"

g("init", "-q", "-b", "main"); g("config", "user.email", "t@t"); g("config", "user.name", "t")
lines = [f"line {i}" for i in range(1, 11)]
write("a.txt", "\n".join(lines) + "\n"); write("b.txt", "b\n"); write("lane.txt", "lane\n")
m0 = commit("m0")
g("checkout", "-qb", "lane")
write("lane.txt", "lane change\n"); A = commit("A")                       # the reviewed head
g("checkout", "-q", "main"); write("b.txt", "b on main\n"); m1 = commit("m1")
g("update-ref", f"refs/remotes/{MAIN}", m1)

g("checkout", "-q", "lane"); g("merge", "-q", "--no-edit", "main"); B = g("rev-parse", "HEAD")   # B = clean merge of main
assert r.head_moved(git, A, A, MAIN) == "same"
assert r.head_moved(git, A, B, MAIN) == "main"
write("lane.txt", "more code\n"); C = commit("C")                         # C = a code change after the merge
assert r.head_moved(git, A, C, MAIN) == "code"

g("checkout", "-q", "-B", "evil", A); g("merge", "-q", "--no-commit", "main")
write("lane.txt", "sneaky\n"); D = commit("evil merge")                    # a merge commit that also changes code
assert r.head_moved(git, A, D, MAIN) == "code"

g("checkout", "-q", "-B", "other", m0); write("b.txt", "not main\n"); X = commit("side")
g("checkout", "-q", "-B", "side", A); g("merge", "-q", "--no-edit", "other"); S = g("rev-parse", "HEAD")
assert r.head_moved(git, A, S, MAIN) == "code"                             # a merge of a branch that is not main
assert r.head_moved(git, A, m1, MAIN) == "code"                            # reviewed sha is not in the head's history (force-push)

# conflicting merge of main: edits only inside the conflict region = still only a merge of main; an edit outside = code
g("checkout", "-q", "main"); write("a.txt", "\n".join(lines[:4] + ["line 5 main"] + lines[5:]) + "\n"); m2 = commit("m2")
g("update-ref", f"refs/remotes/{MAIN}", m2)
g("checkout", "-q", "-B", "lane2", A); write("a.txt", "\n".join(lines[:4] + ["line 5 lane"] + lines[5:]) + "\n"); A2 = commit("A2")
def conflict_merge(extra_top):
    g("checkout", "-q", "-B", "res", A2)
    subprocess.run(["git", "merge", "-q", "main"], cwd=repo, capture_output=True)   # conflicts in a.txt
    top = ["line 1 changed"] if extra_top else lines[:1]
    write("a.txt", "\n".join(top + lines[1:4] + ["line 5 both"] + lines[5:]) + "\n")
    return commit("resolved")
assert r.head_moved(git, A2, conflict_merge(False), MAIN) == "main"
assert r.head_moved(git, A2, conflict_merge(True), MAIN) == "code"
print("ok head_moved")

# ci_merge: `gh pr merge` says 'Head branch was modified' -> ('moved',), not merge-failed
assert r.head_modified("GraphQL: Head branch was modified. Review and try the merge again.")
assert not r.head_modified("auto-merge is not allowed")
assert r.ci_merge(lambda: [{"name": "tests", "bucket": "pass"}], None, lambda: "moved", lambda s: None) == ("moved",)

# ci_integrate with fakes: reviewed A, head B = merge of main -> merges B; head C = code -> rc 8 (re-review), no merge
def ci(head, moved_once=False):
    calls, st = [], {"head": A if moved_once else head, "merged": False}
    def fake_gh(*a, **k):
        calls.append(a)
        if a[:2] == ("pr", "view"):
            if "isDraft,labels" in a: return 0, '{"isDraft":false,"labels":[]}'
            if "headRefOid" in a: return 0, st["head"]
            if "mergeable" in a and "-q" in a: return 0, "MERGEABLE"
            return 0, '{"state":"%s","mergeable":"MERGEABLE"}' % ("MERGED" if st["merged"] else "OPEN")
        if a[:2] == ("pr", "checks"): return 0, '[{"name":"tests","bucket":"pass"}]'
        if a[:2] == ("pr", "merge") and "--disable-auto" in a: return 0, ""
        if a[:2] == ("pr", "merge"):
            st["head"] = head                                              # the push lands just before the merge (the #262 resolver)
            want = a[a.index("--match-head-commit") + 1]
            if want != st["head"]: return 1, "GraphQL: Head branch was modified. Review and try the merge again."
            if "--auto" in a: return 1, "Pull request is in clean status"
            st["merged"] = True; return 0, ""
        return 0, ""
    real_run = r.run
    def fake_run(cmd, cwd=None, **k):
        if cmd[:2] == ["git", "fetch"]: return 0, ""
        if cmd[:1] == ["git"]: return real_run(cmd, cwd=repo)
        return 0, ""
    saved = r.gh, r.run, r.remote.pr_for, r.time.sleep
    r.gh, r.run, r.remote.pr_for, r.time.sleep = fake_gh, fake_run, (lambda n, run=None, state="open": (338, "claude/x")), (lambda s: None)
    try: return r.ci_integrate(344, str(repo), None, None, A), calls
    finally: r.gh, r.run, r.remote.pr_for, r.time.sleep = saved
g("update-ref", f"refs/remotes/{MAIN}", m1)
res, calls = ci(B)
assert res[0] == 0, res
assert any(x[:2] == ("pr", "merge") and x[-1] == B for x in calls), calls      # merged with the new sha
res, calls = ci(C)
assert res[0] == 8 and C[:7] in res[1], res
assert not any(x[:2] == ("pr", "merge") and "--disable-auto" not in x for x in calls)   # never merged unreviewed code
res, calls = ci(B, moved_once=True)                                        # head moves to B after the runner read it
assert res[0] == 0 and any(x[:2] == ("pr", "merge") and x[-1] == B for x in calls), (res, calls)
res, calls = ci(C, moved_once=True)
assert res[0] == 8, res
print("ok ci_integrate head moved")

# rc 8 is not a STUCK reason: process() re-reviews the new head once (cloud reviewer), then integrates again
_src = Path(r.__file__).read_text(encoding="utf-8")
_proc = _src.split("def process_locked", 1)[1].split("def close_windows", 1)[0]
assert "== 8" in _proc and "rereview_prompt(" in _proc and "remote_review(" in _proc.split("== 8", 1)[1]
assert "only the commits after" in r.rereview_prompt(344, 338, A, B) and A in r.rereview_prompt(344, 338, A, B)
print("ok re-review on code change")
