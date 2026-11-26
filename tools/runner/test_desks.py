"""#306 cloud desks (inbox + ask), with fakes: python3 tools/runner/test_desks.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
import json, sys
from pathlib import Path
sys.argv.append("--dry-run")
import desks as D
import remote as RM

# ---- prompts: the inbox role and the read-only ask role ----
p = D.prompt("inbox", 777)
for need in ("open AND closed", "## Acceptance", "ready-for-agent", "P0", "pack", "core", "Hebrew", "nikud", "PING"):
    assert need in p, need
for need in ("tier-1", "tier-2", "tier-3", "unsure", "one-line reason"):   # #437: the inbox picks the tier and says why
    assert need in p, need
a = D.prompt("ask", 777)
assert "#777" in a and "READ-ONLY" in a and "Hebrew" in a and "PING" in a, a
assert "20 min" in a                                   # tells the owner when the status is old (PC off)
assert '"' not in p and '"' not in a                   # remote.start turns " into ' (Windows argv)

# ---- one line for the panel / dashboard ----
assert D.desk_line({}) == "cloud desks: inbox down · ask down"
assert D.desk_line({"inbox": {"session": "s1", "ok": True}, "ask": {"session": "s2", "ok": False}}) == "cloud desks: inbox ok · ask down"

# ---- the pinned issue body: links + live status ----
st = {"inbox": {"session": "s1", "url": "https://claude.ai/code/s1", "ok": True},
      "ask": {"session": "s2", "url": "https://claude.ai/code/s2", "ok": True}}
b = D.issue_body(st, "Open issues: 5\nRunning: #9", 0)
assert "https://claude.ai/code/s1" in b and "https://claude.ai/code/s2" in b
assert D.INBOX_TITLE in b and D.ASK_TITLE in b
assert "Open issues: 5" in b and "1970-01-01T00:00:00Z" in b and D.MARK in b
assert "```" not in "Open issues: 5"                   # status sits in one code block
assert len(D.issue_body(st, "x" * 100000, 0)) < 60000   # GitHub body limit 65536
assert "(no status yet)" in D.issue_body({}, None, 0)

# ---- tick: starts missing desks, publishes every status_minutes, probes and restarts ----
class World:
    def __init__(self):
        self.state, self.starts, self.edits, self.probes, self.logs = {}, [], [], [], []
        self.start_ok, self.probe_ok, self.issue = True, True, 777
    def d(self, now):
        def start(role, prompt):
            self.starts.append((role, prompt))
            k = len(self.starts)
            if not self.start_ok: return {"ok": False, "session": "", "url": "", "error": "403"}
            return {"ok": True, "session": f"session_{k}", "url": f"https://claude.ai/code/session_{k}", "error": ""}
        def probe(session): self.probes.append(session); return self.probe_ok
        return dict(now=now, state=self.state, save=lambda s: None, start=start, probe=probe,
                    status_text=lambda: "Open issues: 3", find_issue=lambda: self.issue,
                    edit=lambda n, body: self.edits.append((n, body)) or 0, log=self.logs.append,
                    status_minutes=10, probe_hours=12)

w = World()
D.tick(w.d(1000))
assert [r for r, _ in w.starts] == ["inbox", "ask"], w.starts
assert "#777" in w.starts[1][1]                        # the ask prompt names the status issue
assert w.state["issue"] == 777 and w.state["inbox"]["ok"] and w.state["ask"]["session"] == "session_2"
assert len(w.edits) == 1 and w.edits[0][0] == 777 and "session_1" in w.edits[0][1] and "Open issues: 3" in w.edits[0][1]

D.tick(w.d(1000 + 5 * 60))                             # 5 min later: nothing due
assert len(w.starts) == 2 and len(w.edits) == 1 and w.probes == []
D.tick(w.d(1000 + 10 * 60))                            # 10 min: status published again, no new session
assert len(w.starts) == 2 and len(w.edits) == 2

D.tick(w.d(1000 + 12 * 3600))                          # 12 h: keep-alive probe, both alive
assert w.probes == ["session_1", "session_2"] and len(w.starts) == 2

w.probe_ok = False                                     # a session expired: a new one, and the links are updated at once
D.tick(w.d(1000 + 24 * 3600))
assert [r for r, _ in w.starts[2:]] == ["inbox", "ask"]
assert w.state["inbox"]["session"] == "session_3" and "session_3" in w.edits[-1][1]
assert any("restarted" in l for l in w.logs), w.logs

w2 = World(); w2.start_ok = False                      # start refused: down, retried after RETRY_MIN, not every minute
D.tick(w2.d(0))
assert w2.state["inbox"]["ok"] is False and len(w2.starts) == 2
assert "inbox down" in D.desk_line(w2.state) and "403" in w2.state["inbox"]["error"]
D.tick(w2.d(60)); assert len(w2.starts) == 2
w2.start_ok = True
D.tick(w2.d(D.RETRY_MIN * 60)); assert len(w2.starts) == 4 and w2.state["ask"]["ok"]

w3 = World(); w3.issue = 0                             # GitHub down: nothing started (the ask prompt needs the issue)
D.tick(w3.d(0)); assert w3.starts == [] and w3.edits == []

w4 = World()                                           # status_minutes = 0 turns the whole thing off
d4 = w4.d(0); d4["status_minutes"] = 0
D.tick(d4); assert w4.starts == [] and w4.edits == []

# ---- remote.start takes a window name for non-issue sessions ----
calls = []
def fake(cmd, env=None):
    calls.append(cmd)
    return 0, "Created cloud session: x\nView: https://claude.ai/code/session_01abc?from=cli\n" if cmd[1] == "read" else ""
s = RM.start("inbox", "be the inbox", cwd="C:/x", run=fake, name="desk-inbox")
assert s["ok"] and s["session"] == "session_01abc", s
assert calls[0][1:] == ["rm", "desk-inbox"], calls[0]
assert "desk-inbox" in calls[1] and "role=desk" in calls[1], calls[1]

# ---- the desks file the panel reads ----
D.write_line({"inbox": {"session": "s", "ok": True}})
assert json.loads(D.LINE.read_text(encoding="utf-8")) == {"text": "cloud desks: inbox ok · ask down"}
print("test_desks: ok")
