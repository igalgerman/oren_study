# Unit test for remote.py with a fake CLI: python tools/runner/test_remote.py
import json
import remote as r

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

# cloud (#136): one row per open issue labelled cloud; state, last activity, PR, session, STALE after 60 min quiet (owner)
assert r.STALE_MIN == 60
import calendar
NOW = calendar.timegm((2026, 11, 26, 12, 0, 0, 0, 0, 0))
c = lambda body, at: {"body": body, "createdAt": at}
iss = {"number": 140, "title": "t140", "createdAt": "2026-11-26T09:00:00Z", "comments": [
    c("Running in a cloud session ... https://claude.ai/code/session_01ABC?from=cli", "2026-11-26T09:05:00Z"),
    c("progress note", "2026-11-26T10:30:00Z")]}
row = r.cloud_lane(iss, None, "", NOW)
assert row == {"n": 140, "title": "t140", "state": "working", "line": "", "last": "2026-11-26T10:30:00Z", "stale": True,
               "pr": "", "session": "https://claude.ai/code/session_01ABC"}, row
assert r.cloud_lane(iss, None, "2026-11-26T11:30:00Z", NOW)["stale"] is False          # a new commit counts as activity
pr = {"number": 201, "url": "https://github.com/x/y/pull/201"}
done = {**iss, "comments": iss["comments"] + [c("RESULT: DONE https://github.com/x/y/pull/201", "2026-11-26T09:40:00Z")]}
row = r.cloud_lane(done, pr, "", NOW)
assert (row["state"], row["stale"], row["pr"]) == ("done", True, pr["url"]), row           # any state: quiet 60+ min = STALE
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
# extra issues (where=remote, no cloud label) join the cloud rows; closed ones are dropped
i203 = {"number": 203, "title": "t203", "createdAt": "2026-11-26T11:00:00Z", "state": "OPEN", "comments": []}
f = Fake(("issue list", 0, "[]"), ("issue view 203", 0, json.dumps(i203)), ("issue view 9", 0, json.dumps({**i203, "number": 9, "state": "CLOSED"})), ("pr list", 0, "[]"))
assert [x["n"] for x in r.cloud(run=f, now=NOW, extra=["203", "9"])] == [203]
print("ok cloud extra")
