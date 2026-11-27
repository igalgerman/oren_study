# Unit test for remote.py with a fake CLI: python tools/runner/test_remote.py
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
import json
import remote as r
import owner_q as OQ   # #608: the owner answer record

class Fake:
    """Records commands; answers with the first (needle, rc, out) whose needle is in the joined command."""
    def __init__(self, *answers): self.answers, self.calls = answers, []
    def __call__(self, cmd, env=None):
        self.calls.append((cmd, env))
        line = " ".join(map(str, cmd))
        for needle, rc, out in self.answers:
            if needle in line: return rc, out
        return 0, ""

CREATED = """Created cloud session: Spike #143 test
View: https://claude.ai/code/session_01USAbYNsMTEcs7c4DnnSVnm?from=cli&m=0
Resume with: claude --teleport session_01USAbYNsMTEcs7c4DnnSVnm
"""

# start: parse the session id + url from the terminal screen
s = r.parse_start(CREATED)
assert s == {"ok": True, "session": "session_01USAbYNsMTEcs7c4DnnSVnm",
             "url": "https://claude.ai/code/session_01USAbYNsMTEcs7c4DnnSVnm?from=cli&m=0", "error": ""}, s
# start refused (403, usage limit, ...): ok False with the error line -> runner falls back to local
s = r.parse_start("Error: Cloud session create failed: Request failed with status code 403\n")
assert s["ok"] is False and s["session"] == "" and "403" in s["error"], s
assert r.parse_start("")["error"] == "no output"

# start runs claude --cloud in a herdr terminal (needs a TTY) without the inference-only token
f = Fake(("read", 0, CREATED))
s = r.start(143, "do it", cwd="C:/x", run=f)
assert s["ok"] and s["session"].startswith("session_"), s
start_cmd = next(c[0] for c in f.calls if c[0][1] == "run")
first = " ".join(start_cmd)
assert " run " in f"{first} " and "--name remote-143" in first and "--cloud" in first, first
assert "unset CLAUDE_CODE_OAUTH_TOKEN" in first, first
assert start_cmd[-1] == "do it", "task passed as its own argument"
assert any("wait" in c[0] for c in f.calls), "waits for the start command to end"
# terminal could not even start -> refused
f = Fake(("run", 1, "hc: no server"))
s = r.start(143, "do it", cwd="C:/x", run=f)
assert not s["ok"] and "no server" in s["error"], s

# send: claude -p --cloud <id> <text>, no TTY needed, token removed from env
f = Fake(("--cloud", 0, json.dumps({"ok": True, "session_id": "session_A", "url": "u"}) + "\nSessionEnd hook ... failed\n"))
assert r.send("session_A", "hello", run=f) == {"ok": True, "error": ""}
cmd, env = f.calls[0]
assert cmd[1:4] == ["-p", "--cloud", "session_A"] and cmd[-1] == "hello", cmd
assert env is not None and "CLAUDE_CODE_OAUTH_TOKEN" not in env
f = Fake(("--cloud", 1, "Error: not a cloud session ID or URL."))
s = r.send("bad", "hi", run=f)
assert s["ok"] is False and "not a cloud session" in s["error"], s

# status from GitHub: last RESULT/QUESTION comment wins; otherwise working (PR or not)
assert r.state_from(["hi", "RESULT: DONE https://x/pull/1\n\n---\n_Generated_"], None)["state"] == "done"
assert r.state_from(["RESULT: STUCK no access"], None) == {"state": "stuck", "line": "RESULT: STUCK no access", "pr": None}
assert r.state_from(["QUESTION: A or B?"], None)["state"] == "question"
assert r.state_from(["QUESTION: A or B?", "RESULT: DONE"], None)["state"] == "done"
assert r.state_from(["RESULT: DONE", "QUESTION: again?"], None)["state"] == "question"
assert r.state_from(["Runner: started"], {"number": 5, "url": "u"}) == {"state": "working", "line": "", "pr": {"number": 5, "url": "u"}}
assert r.state_from([], None)["state"] == "working"

f = Fake(("issue view", 0, json.dumps({"comments": [{"body": "RESULT: DONE u"}]})),
         ("pr list", 0, json.dumps([{"number": 145, "url": "u", "isDraft": True}])))
st = r.status(143, run=f)
assert st["state"] == "done" and st["pr"]["number"] == 145, st
assert any("lane/143" in " ".join(c[0]) for c in f.calls)
print("ok remote")
# #133: comments before `since` are ignored (an earlier run's RESULT line)
f = Fake(("issue view", 0, json.dumps({"comments": [{"body": "RESULT: DONE old", "createdAt": "2026-11-26T08:00:00Z"}]})), ("pr list", 0, "[]"))
assert r.status(5, run=f, since="2026-11-26T09:00:00Z")["state"] == "working"
f = Fake(("issue view", 0, json.dumps({"comments": [{"body": "RESULT: DONE new", "createdAt": "2026-11-26T09:30:00Z"}]})), ("pr list", 0, "[]"))
assert r.status(5, run=f, since="2026-11-26T09:00:00Z")["state"] == "done"
print("ok since")

# cloud (#136): one row per open issue labelled cloud; state, last activity, PR, session, STALE after stuck_hours quiet
assert r.STALE_MIN == int(r.CFG["stuck_hours"] * 60)
import calendar
NOW = calendar.timegm((2026, 11, 26, 12, 0, 0, 0, 0, 0))
c = lambda body, at: {"body": body, "createdAt": at}
iss = {"number": 140, "title": "t140", "createdAt": "2026-11-26T09:00:00Z", "comments": [
    c("Running in a cloud session ... https://claude.ai/code/session_01ABC?from=cli", "2026-11-26T09:05:00Z"),
    c("progress note", "2026-11-26T09:30:00Z")]}
row = r.cloud_lane(iss, None, "", NOW)
assert row == {"n": 140, "title": "t140", "state": "working", "line": "", "last": "2026-11-26T09:30:00Z", "stale": True,
               "pr": "", "session": "https://claude.ai/code/session_01ABC", "manual": False}, row
assert r.cloud_lane(iss, None, "2026-11-26T11:30:00Z", NOW)["stale"] is False          # a new commit counts as activity
pr = {"number": 201, "url": "https://github.com/x/y/pull/201"}
done = {**iss, "comments": iss["comments"] + [c("RESULT: DONE https://github.com/x/y/pull/201", "2026-11-26T09:40:00Z")]}
row = r.cloud_lane(done, pr, "", NOW)
assert (row["state"], row["stale"], row["pr"]) == ("done", True, pr["url"]), row           # any state: quiet stuck_hours+ = STALE
assert r.cloud_lane({**iss, "comments": [c("QUESTION: a or b?", "2026-11-26T11:50:00Z")]}, None, "", NOW)["state"] == "question"
f = Fake(("issue list", 0, json.dumps([iss])), ("pr list", 0, json.dumps([{**pr, "headRefName": "lane/140",
         "commits": [{"committedDate": "2026-11-26T11:45:00Z"}]}])))
rows = r.cloud(run=f, now=NOW)
assert [(x["n"], x["stale"], x["last"], x["pr"]) for x in rows] == [(140, False, "2026-11-26T11:45:00Z", pr["url"])], rows
assert "--label" in f.calls[0][0] and "cloud" in f.calls[0][0]
f = Fake(("issue list", 0, json.dumps([iss])), ("pr list", 0, "[]"), ("branches/lane/140", 0, "2026-11-26T11:55:00Z\n"))
assert r.cloud(run=f, now=NOW)[0]["last"] == "2026-11-26T11:55:00Z"                       # no PR yet: the lane branch's last commit
assert r.cloud(run=Fake(("issue list", 1, "error")), now=NOW) == []
print("ok cloud")

# #236: a reopened issue: RESULT lines from before the latest "Runner: started" comment belong to the earlier run
old_run = [c("RESULT: DONE https://github.com/x/y/pull/197", "2026-11-26T10:00:00Z"),
           c("Runner: started (core lane, remote, worker sonnet, reviewer sonnet).", "2026-11-26T13:16:00Z")]
assert [x["body"] for x in r.current_run(old_run)] == [old_run[1]["body"]]
assert r.current_run([c("RESULT: DONE", "2026-11-26T10:00:00Z")]) == [c("RESULT: DONE", "2026-11-26T10:00:00Z")]   # no runner comment: all count
f = Fake(("issue view", 0, json.dumps({"comments": old_run})), ("pr list", 0, json.dumps([{"number": 197, "url": "u"}])))
assert r.status(192, run=f)["state"] == "working"                                          # CLI status (no since): old RESULT ignored
f = Fake(("issue view", 0, json.dumps({"comments": old_run + [c("RESULT: DONE new", "2026-11-26T14:00:00Z")]})), ("pr list", 0, "[]"))
assert r.status(192, run=f)["state"] == "done"                                             # new RESULT after the start -> done
assert r.status(192, run=f, since="2026-11-26T13:16:00Z")["state"] == "done"
assert r.cloud_lane({**iss, "comments": old_run}, None, "", NOW)["state"] == "working"     # panel row too
# #236: the cloud table/count also has in-progress issues whose run is remote (.runs/<n>/where), not only label cloud
(r.RUNS / "208").mkdir(parents=True); (r.RUNS / "208" / "where").write_text("remote")
(r.RUNS / "209").mkdir(parents=True); (r.RUNS / "209" / "where").write_text("local")
inprog = [{"number": 208, "title": "t208", "createdAt": "2026-11-26T09:00:00Z", "comments": []},
          {"number": 209, "title": "t209", "createdAt": "2026-11-26T09:00:00Z", "comments": []}]
f = Fake(("label cloud", 0, json.dumps([iss])), ("label in-progress", 0, json.dumps(inprog + [iss])), ("pr list", 0, "[]"))
assert [x["n"] for x in r.cloud(run=f, now=NOW)] == [140, 208]
print("ok current run")

# #263: a merged PR means done (even without a RESULT line); a session with no run dir (remote.py start by hand) is manual
assert r.cloud_lane(iss, {**pr, "mergedAt": "2026-11-26T10:00:00Z"}, "", NOW)["state"] == "done"
assert r.cloud_lane(iss, {**pr, "mergedAt": None}, "", NOW)["state"] == "working"
assert r.cloud_lane(iss, None, "", NOW, manual=True)["manual"] is True
f = Fake(("label cloud", 0, json.dumps([iss])), ("label in-progress", 0, json.dumps(inprog)), ("pr list", 0, "[]"))
assert [(x["n"], x["manual"]) for x in r.cloud(run=f, now=NOW)] == [(140, True), (208, False)]   # 140: no .runs/140
assert "mergedAt" in " ".join(next(c for c, _ in f.calls if "pr" in c and "list" in c))
assert [r.active(x) for x in [{"state": "working"}, {"state": "done"}, {"state": "question"}]] == [True, False, True]
print("ok #263 done/manual")

# #246: a cloud worker may only push claude/* branches: pr_for(n) -> (number, headRefName)
#   lane/<n> first, else the PR URL in this run's RESULT: DONE line, else an open PR whose body says Fixes/Closes #n
CL = "claude/github-issue-236-u7l8gj"
run236 = {"comments": [c("Runner: started (pack lane, remote)", "2026-11-26T13:00:00Z"),
                       c("RESULT: DONE https://github.com/igalgerman/oren_study/pull/243", "2026-11-26T13:25:00Z")]}
f = Fake(("--head lane/236", 0, json.dumps([{"number": 240, "headRefName": "lane/236"}])))
assert r.pr_for(236, run=f) == (240, "lane/236")
f = Fake(("--head lane/236", 0, "[]"), ("issue view", 0, json.dumps(run236)),
         ("pr view 243", 0, json.dumps({"number": 243, "headRefName": CL, "state": "OPEN"})))
assert r.pr_for(236, run=f) == (243, CL)
assert r.pr_for(236, run=f, state="merged") == (None, None)                     # that PR is still open, not merged
f = Fake(("--head lane/236", 0, "[]"), ("issue view", 0, json.dumps(run236)),
         ("pr view 243", 0, json.dumps({"number": 243, "headRefName": CL, "state": "MERGED"})))
assert r.pr_for(236, run=f, state="merged") == (243, CL)
old = {"comments": [c("RESULT: DONE https://github.com/x/y/pull/197", "2026-11-26T10:00:00Z"), c("Runner: started (x)", "2026-11-26T13:00:00Z")]}
f = Fake(("--head lane/236", 0, "[]"), ("issue view", 0, json.dumps(old)),
         ("pr view 197", 0, json.dumps({"number": 197, "headRefName": "lane/197", "state": "OPEN"})),
         ("pr list", 0, json.dumps([{"number": 250, "headRefName": "claude/x", "body": "Fixes #2366"},
                                    {"number": 243, "headRefName": CL, "body": "Summary\n\nCloses #236\n"}])))
assert r.pr_for(236, run=f) == (243, CL)                                         # an earlier run's URL is ignored; body Closes #236 (not #2366)
f = Fake(("issue view", 0, json.dumps({"comments": []})), ("pr list", 0, "[]"))
assert r.pr_for(236, run=f) == (None, None)
assert r.pr_for(236, run=Fake(("gh", 1, "error"))) == (None, None)
# status() and the cloud table find the claude/* PR too
f = Fake(("--head lane/236", 0, "[]"), ("issue view", 0, json.dumps(run236)),
         ("pr view 243", 0, json.dumps({"number": 243, "headRefName": CL, "state": "OPEN", "url": "https://github.com/igalgerman/oren_study/pull/243", "isDraft": False})))
st = r.status(236, run=f)
assert st["state"] == "done" and st["pr"]["number"] == 243, st
f = Fake(("issue list", 0, json.dumps([iss])), ("pr list", 0, json.dumps([{**pr, "headRefName": "claude/abc", "body": "Fixes #140",
         "commits": [{"committedDate": "2026-11-26T11:45:00Z"}]}])))
assert [(x["n"], x["last"], x["pr"]) for x in r.cloud(run=f, now=NOW)] == [(140, "2026-11-26T11:45:00Z", pr["url"])]
print("ok #246 pr_for")

# #297: a worker that opened a PR but never posted RESULT: DONE -> done once the PR head is quiet 10 min (log it)
assert r.QUIET_MIN == 10
NOW297 = calendar.timegm((2026, 11, 26, 14, 40, 0, 0, 0, 0))
pr297 = lambda at, state="OPEN": {"number": 270, "url": "https://github.com/igalgerman/oren_study/pull/270", "isDraft": False, "state": state,
                                  "headRefName": "claude/x", "createdAt": "2026-11-26T14:24:00Z", "commits": [{"committedDate": at}]}
started = {"comments": [c("Runner: started (pack lane, remote)", "2026-11-26T14:10:00Z")]}
f = Fake(("issue view", 0, json.dumps(started)), ("--head lane/269", 0, "[]"), ("pr list", 0, json.dumps([{**pr297("2026-11-26T14:24:00Z"), "body": "Fixes #269"}])))
st = r.status(269, run=f, now=NOW297)
assert st["state"] == "done" and st["line"].startswith("RESULT: DONE https://github.com/igalgerman/oren_study/pull/270"), st
assert "done by PR (no RESULT line)" in st["line"] and st["pr"]["number"] == 270, st
assert "done by PR (no RESULT line)" in (r.RUNS / "runner.log").read_text(encoding="utf-8")
f = Fake(("issue view", 0, json.dumps(started)), ("--head lane/269", 0, "[]"), ("pr list", 0, json.dumps([{**pr297("2026-11-26T14:35:00Z"), "body": "Fixes #269"}])))
assert r.status(269, run=f, now=NOW297)["state"] == "working"                       # a commit 5 min ago: still working
f = Fake(("issue view", 0, json.dumps(started)), ("pr list", 0, "[]"))
assert r.status(269, run=f, now=NOW297)["state"] == "working"                       # no PR: working as before
f = Fake(("issue view", 0, json.dumps(started)), ("--head lane/269", 0, "[]"), ("pr list", 0, json.dumps([{**pr297("2026-11-26T14:24:00Z", "CLOSED"), "body": "Fixes #269"}])))
assert r.status(269, run=f, now=NOW297)["state"] == "working"                       # a closed PR does not count
f = Fake(("issue view", 0, json.dumps({"comments": started["comments"] + [c("RESULT: DONE https://github.com/igalgerman/oren_study/pull/270", "2026-11-26T14:36:00Z")]})),
         ("pr view 270", 0, json.dumps(pr297("2026-11-26T14:35:00Z"))))
st = r.status(269, run=f, now=NOW297)
assert st["state"] == "done" and st["line"] == "RESULT: DONE https://github.com/igalgerman/oren_study/pull/270", st   # RESULT line: done as today
assert r.pr_quiet(pr297("2026-11-26T14:30:00Z"), NOW297) and not r.pr_quiet(pr297("2026-11-26T14:31:00Z"), NOW297)
assert not r.pr_quiet(None, NOW297) and not r.pr_quiet({**pr297("x"), "commits": []}, NOW297)
# panel row: open PR, quiet 10 min, no RESULT line -> 'waiting review' (not 'working'); recent commit -> working
iss297 = {"number": 269, "title": "t269", "createdAt": "2026-11-26T14:00:00Z", "comments": started["comments"]}
assert r.cloud_lane(iss297, pr297("2026-11-26T14:24:00Z"), "2026-11-26T14:24:00Z", NOW297)["state"] == "waiting review"
assert r.cloud_lane(iss297, pr297("2026-11-26T14:35:00Z"), "2026-11-26T14:35:00Z", NOW297)["state"] == "working"
assert r.active({"state": "waiting review"})
f = Fake(("issue list", 0, json.dumps([iss297])), ("pr list", 0, json.dumps([{**pr297("2026-11-26T14:24:00Z"), "body": "Fixes #269", "mergedAt": None}])))
assert [x["state"] for x in r.cloud(run=f, now=NOW297)] == ["waiting review"]
print("ok #297 done by PR")

# #134: the cloud reviewer posts its verdict as a PR comment; the last VERDICT line (own line, not in backticks) wins
assert r.verdict_from(["looks fine", "Review\n\nVERDICT: FIX no test for x\n\n---\n_Generated by Claude Code_"]) == \
    ("VERDICT: FIX no test for x", "Review\n\nVERDICT: FIX no test for x\n\n---\n_Generated by Claude Code_")
assert r.verdict_from(["VERDICT: FIX a", "VERDICT: PASS"])[0] == "VERDICT: PASS"
assert r.verdict_from(["end with `VERDICT: PASS`", "no verdict"]) == ("", "")
f = Fake(("pr view", 0, json.dumps({"comments": [{"body": "VERDICT: FIX old", "createdAt": "2026-11-26T08:00:00Z"},
                                                 {"body": "VERDICT: PASS-NOTES a; b", "createdAt": "2026-11-26T09:30:00Z"}]})))
st = r.review_status(201, run=f, since="2026-11-26T09:00:00Z")
assert st == {"state": "done", "line": "VERDICT: PASS-NOTES a; b", "body": "VERDICT: PASS-NOTES a; b"}, st
assert f.calls[0][0][:4] == ["gh", "pr", "view", "201"]
assert r.review_status(201, run=f, since="2026-11-26T10:00:00Z")["state"] == "working"     # only comments of this round count
assert r.review_status(201, run=Fake(("pr view", 1, "error")))["state"] == "working"
print("ok review_status")

# #135: the owner's answer to a cloud QUESTION, read from the issue comments
Q = {"body": "QUESTION: red or green? 1. red 2. green"}
PARK = {"body": "Parked (cloud): the cloud session waits for the owner."}
assert r.answer_after_question([Q]) == ""                                                    # no answer yet
assert r.answer_after_question([Q, PARK]) == ""                                              # runner/tool comments are no answer
assert r.answer_after_question([Q, PARK, {"body": OQ.answer_body("abcdef012345", "green")}]) == "green"
assert r.answer_after_question(["x", Q["body"], OQ.answer_body("abcdef012345", "2")]) == "2"   # plain bodies work too
assert r.answer_after_question([Q, {"body": OQ.answer_body("abcdef012345", "ירוק")}]) == "ירוק"     # #608: the owner_q record
# #608: only an owner_q answer record counts; any free comment from the shared account is no answer
assert r.answer_after_question([Q, {"body": "OWNER ANSWER (question window, owner-q:abcdef012345): ירוק"}]) == ""   # no hidden record mark
assert r.answer_after_question([Q, {"body": "HOLD (owner-merge): #64 waits for the owner; re-parked."}]) == ""   # the orchestrator's own note
assert r.answer_after_question([Q, {"body": "design approved (owner, 27 Nov, via cloud session)"}]) == ""
assert r.answer_after_question([Q, {"body": "done\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_"}]) == ""   # a Claude session's comment
assert r.answer_after_question([Q, {"body": "<!-- owner_q --> x"}]) == ""
assert r.answer_after_question([Q, {"body": OQ.answer_body("abcdef012345", "green")}, {"body": "RESULT: DONE https://p"}]) == ""   # the session went on: nothing waits
assert r.answer_after_question([Q, {"body": OQ.answer_body("abcdef012345", "green")}, {"body": "Runner: started (pack lane, remote)"}]) == ""   # already used by a resumed run
assert r.answer_after_question([{"body": OQ.answer_body("abcdef012345", "green")}, Q]) == ""                                 # a comment before the question is no answer
assert r.answer_after_question([Q, {"body": OQ.answer_body("abcdef012345", "a")}, {"body": "QUESTION: b or c?"}, {"body": OQ.answer_body("abcdef012345", "c")}]) == "c"   # the last question counts
assert r.answer_after_question([]) == ""
print("ok answer_after_question")

# #277: a run waiting for a core slot shows 'waiting for core slot' (still listed, not a busy lane);
# STALE counts only activity since THIS run started (older comments/commits ignored)
NOW277 = calendar.timegm((2026, 11, 26, 14, 35, 0, 0, 0, 0))
i57 = {"number": 57, "title": "t57", "createdAt": "2026-11-20T09:00:00Z", "comments": [c("old note", "2026-11-25T22:46:00Z")]}
row = r.cloud_lane(i57, None, "2026-11-25T20:00:00Z", NOW277, waiting=True, since="2026-11-26T14:22:00Z")
assert row["state"] == r.WAIT_CORE == "waiting for core slot" and row["stale"] is False and row["last"] == "2026-11-26T14:22:00Z", row
assert r.active(row) and not r.busy(row) and r.busy({"state": "working"}) and not r.busy({"state": "done"})
assert r.cloud_lane(i57, None, "", calendar.timegm((2026, 11, 26, 18, 0, 0, 0, 0, 0)), since="2026-11-26T14:22:00Z")["stale"] is True   # quiet since start
assert r.cloud_lane(i57, None, "2026-11-26T14:30:00Z", NOW277, since="2026-11-26T14:22:00Z")["last"] == "2026-11-26T14:30:00Z"
# cloud(): since = when .runs/<n>/where was written; waiting = .runs/<n>/core_wait with a live pid
(r.RUNS / "57").mkdir(parents=True, exist_ok=True); (r.RUNS / "57" / "where").write_text("remote")
os.utime(r.RUNS / "57" / "where", (NOW277 - 600, NOW277 - 600)); (r.RUNS / "57" / "core_wait").write_text(str(os.getpid()))
f = Fake(("--label cloud", 0, "[]"), ("--label in-progress", 0, json.dumps([i57])), ("pr list", 0, "[]"), ("branches/", 1, ""))
row = r.cloud(run=f, now=NOW277)[0]
assert row["state"] == "waiting for core slot" and not row["stale"] and row["last"] == "2026-11-26T14:25:00Z", row
print("ok #277")

# ---------- #289: ONE poller serves all cloud lanes (lanes.py) ----------
import tempfile as _tf
from pathlib import Path as _P
import lanes as L
runs = _P(_tf.mkdtemp(prefix="lanes-test-"))
alive = lambda pid: pid == 4242
# a cloud pick is queued, and while queued it already counts as a live run-<n> (no observer rerun, no recover restart)
L.queue(runs, {"number": 12, "labels": ["pack"]}); L.queue(runs, {"number": 7, "labels": ["core"]})
assert [i["number"] for i in L.queued(runs)] == [7, 12]
assert L.held(runs, alive) == {7, 12}
v = L.with_virtual([{"name": "run-7", "state": "live", "address": "w1"}, {"name": "orchestrator", "state": "live"}], runs, alive)
assert [t["name"] for t in v] == ["run-7", "orchestrator", "run-12"] and v[-1]["virtual"] and "address" not in v[-1], v
# serve: ONE loop runs every queued lane (here inline), writes lanes.json while it runs, logs each result, exits when idle
clock = {"t": 1000.0}
seen, results = [], []
def proc(issue):
    seen.append((issue["number"], L.held(runs, alive)))     # while it runs, the poller holds it
    return f"DONE #{issue['number']}"
def fake_sleep(s): clock["t"] += s
n = L.serve(runs, proc, lambda k, res: results.append((k, res)), pid=4242, clock=lambda: clock["t"], sleep=fake_sleep,
            idle_s=60, step_s=10, start=lambda fn: fn())
assert n == 2 and [k for k, _ in seen] == [7, 12] and 12 in seen[1][1], seen
assert results == [(7, "DONE #7"), (12, "DONE #12")], results
assert L.queued(runs) == [] and not (runs / "lanes.json").exists()      # idle -> state cleared, process ends
assert L.held(runs, alive) == set() and L.virtual(runs, alive) == []
# a crashing lane never kills the poller (the other lanes go on), the result says why
L.queue(runs, {"number": 3}); L.queue(runs, {"number": 4})
out = []
def boom(issue):
    if issue["number"] == 3: raise RuntimeError("x")
    return "DONE"
L.serve(runs, boom, lambda k, res: out.append((k, res)), pid=4242, clock=lambda: clock["t"], sleep=fake_sleep, idle_s=30, start=lambda fn: fn())
assert out[0][0] == 3 and out[0][1].startswith("BLOCKED: lanes error") and out[1] == (4, "DONE"), out
# a dead poller holds nothing (its lanes are free for recover / the observer)
L.write_state(runs, 999, {5}); assert L.held(runs, alive) == set()
L.write_state(runs, 4242, {5}); assert L.held(runs, alive) == {5}
# stop (#364 safety net on a virtual run): a flag the lane's wait loop reads; a new start clears it
L.stop(runs, 5); assert L.stopped(runs, 5); L.clear_stop(runs, 5); assert not L.stopped(runs, 5)
# aligned_sleep: every lane wakes on the same minute grid (one shared poll)
naps = []
L.aligned_sleep(60, clock=lambda: 600_015.0, sleep=naps.append); L.aligned_sleep(60, clock=lambda: 600_050.0, sleep=naps.append)
L.aligned_sleep(60, clock=lambda: 600_000.0, sleep=naps.append)
assert naps == [45.0, 10.0, 60.0] and len({600_015 + naps[0], 600_050 + naps[1]}) == 1, naps
print("ok #289 lanes poller")

# ---------- #289: launch = start a cloud session without waiting (the watchdog tick stays short) ----------
f = Fake()
res = r.launch(262, "resolve it", cwd=".", run=f, name="resolve-262")
assert res["ok"] and [c[0][1] for c in f.calls] == ["rm", "run"], f.calls
run_cmd = f.calls[1][0]
assert "--name" in run_cmd and run_cmd[run_cmd.index("--name") + 1] == "resolve-262" and "issue=262" in run_cmd and "role=remote" in run_cmd, run_cmd
assert not any("wait" == c[0][1] for c in f.calls)
f = Fake(("run --bg", 3, "name_taken"))
assert r.launch(262, "x", cwd=".", run=f, name="resolve-262") == {"ok": False, "session": "", "url": "", "error": "name_taken"}
print("ok #289 launch")
