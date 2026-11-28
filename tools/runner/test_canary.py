# Unit test for canary.py (#330) with a fake gh and a fake clock: python tools/runner/test_canary.py
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # tests never write to the live .runs
os.environ["OREN_TEST"] = "1"
import json, time
import repos; repos.GAME = ""   # #792: this suite is the one-repo mode (game_repo unset); two-repo cases: test_repos.py
import canary as C

M = 60
T0 = time.mktime(time.strptime("2026-11-26 14:00", "%Y-%m-%d %H:%M"))

# ---------- pure: when a canary is due ----------
assert C.due({}, T0, 0) == "first run"
assert C.due({"started": T0 - 3600}, T0, 0) is None, "6 h not over, no tooling change"
assert C.due({"started": T0 - 6 * 3600}, T0, 0) == "every 6 h"
assert C.due({"started": T0 - 3600}, T0, T0 - 600) == "tools/runner or tools/mods changed", "a merge into the tooling after the last start"
assert C.due({"started": T0 - 3600}, T0, T0 - 7200) is None, "the change was before the last canary"
assert C.due({"started": 0, "run": {"n": 5}}, T0, T0) is None, "never two canaries at once"
# #538: at most one canary per canary_minutes (default 60), whatever the reason
assert C.GAP_MIN == 60
assert C.due({"started": T0 - 30 * M}, T0, T0 - 10 * M) is None, "a tooling change 30 min after the last canary waits"
assert C.due({"started": T0 - 61 * M}, T0, T0 - 10 * M) == "tools/runner or tools/mods changed"
assert C.due({"started": T0 - 30 * M}, T0, T0 - 10 * M, gap_min=20) == "tools/runner or tools/mods changed", "canary_minutes from config"
assert C.p0_waiting([{"number": 3, "labels": [{"name": "P0"}, {"name": "ready-for-agent"}]}]) == [3]
assert C.p0_waiting([{"number": 3, "labels": ["P0", "ready-for-agent", "in-progress"]}, {"number": 4, "labels": ["P0", "needs-orchestrator"]}]) == [], \
       "a P0 that runs, or waits for the orchestrator (not for a lane), does not hold the canary"

# ---------- pure: which steps are done ----------
I = lambda state="OPEN", *labels: {"state": state, "labels": [{"name": l} for l in labels]}
assert C.steps_done(I(), None, "") == set()
assert C.steps_done(I("OPEN", "in-progress"), None, "") == {"start"}
assert C.steps_done(I(), {"state": "OPEN"}, "") == {"start", "pr"}, "a PR means the worker started"
assert C.steps_done(I(), {"state": "OPEN"}, "VERDICT: PASS") == {"start", "pr", "review"}
assert C.steps_done(I(), {"state": "MERGED"}, "") == {"start", "pr", "review", "merge"}
assert C.steps_done(I("CLOSED"), {"state": "MERGED"}, "") == set(s for s, _ in C.STEPS)
assert "close" not in C.steps_done(I("CLOSED"), None, ""), "closed without a merged PR is not a green canary"

# ---------- pure: deadlines, each step's clock starts when the step before it was seen done ----------
run = {"n": 7, "opened": T0, "at": {}}
assert C.late(run, T0 + 9 * M) is None
assert C.late(run, T0 + 11 * M) == ("start", 10)
C.advance(run, {"start"}, T0 + 5 * M)
assert C.late(run, T0 + 34 * M) is None, "pr has 30 min from the start (T0+5)"
assert C.late(run, T0 + 36 * M) == ("pr", 30)
C.advance(run, {"start", "pr", "review", "merge"}, T0 + 40 * M)
assert run["at"]["pr"] == run["at"]["review"] == T0 + 40 * M, "steps seen together all get the same time"
assert run["at"]["start"] == T0 + 5 * M, "a step's first time is kept"
assert C.late(run, T0 + 59 * M) is None and C.late(run, T0 + 61 * M) == ("close", 20)
assert dict(C.STEPS) == {"start": 10, "pr": 30, "review": 20, "merge": 20, "close": 20}

# ---------- fake GitHub ----------
class GH:
    """Answers gh commands from a little world: the rolling canary issue, maybe its PR; records writes."""
    def __init__(self): self.issue, self.pr, self.verdict, self.calls, self.leftovers, self.p0, self.pr_at = None, None, "", [], [], [], "2099-01-01T00:00:00Z"
    def __call__(self, cmd, env=None):
        self.calls.append(cmd)
        line = " ".join(map(str, cmd))
        if cmd[:3] == ["gh", "label", "create"]: return 0, ""
        if cmd[:3] == ["gh", "issue", "list"] and "canary" in cmd:
            old = [{"number": n, "state": "OPEN", "title": f"Canary 2026-11-2{n % 10} 10:00"} for n in self.leftovers]
            roll = [{"number": 401, "state": self.issue["state"], "title": C.TITLE}] if self.issue else []
            return 0, json.dumps(old + roll)
        if cmd[:3] == ["gh", "issue", "list"] and "P0" in cmd: return 0, json.dumps(self.p0)
        if cmd[:3] == ["gh", "issue", "create"] and "P0" in cmd[cmd.index("--label") + 1]:
            self.p0.append({"number": 500 + len(self.p0), "title": cmd[cmd.index("--title") + 1]}); return 0, "https://github.com/x/y/issues/500\n"
        if cmd[:3] == ["gh", "issue", "create"]:
            assert self.issue is None, "the rolling canary issue is never created twice"
            self.issue = {"number": 401, "state": "OPEN", "labels": []}
            return 0, "https://github.com/igalgerman/oren_study/issues/401\n"
        if cmd[:3] == ["gh", "issue", "reopen"]: self.issue["state"] = "OPEN"; return 0, ""
        if cmd[:3] == ["gh", "issue", "edit"]:
            self.issue["labels"] = [{"name": l} for l in cmd[cmd.index("--add-label") + 1].split(",")]; return 0, ""
        if cmd[:3] == ["gh", "issue", "view"]:
            return 0, json.dumps({**self.issue, "comments": []})
        if cmd[:3] == ["gh", "pr", "list"]:
            if "--head" in cmd and self.pr: return 0, json.dumps([{"number": 77, "headRefName": "lane/401", "state": self.pr, "createdAt": self.pr_at}])
            return 0, "[]"
        if cmd[:3] == ["gh", "pr", "view"]:
            return 0, json.dumps({"comments": [{"body": self.verdict}] if self.verdict else []})
        if cmd[:3] in (["gh", "issue", "close"], ["gh", "pr", "close"], ["gh", "issue", "comment"]): return 0, ""
        raise AssertionError("unexpected gh call: " + line)
    def writes(self, *head): return [c for c in self.calls if c[:len(head)] == list(head)]

said = []
def tick(gh, st, now, changed=0, side=None, stopped=False):
    return C.tick(run=gh, say=said.append, log=lambda m: None, now=now, st=st, changed=lambda: changed,
                  side=side or (lambda st, now: []), stopped=lambda: stopped)

# a green canary: issue opened -> started -> PR -> review -> merge -> closed; panel 'flow ok HH:MM'
gh, st = GH(), {}
gh.pr_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(T0 + 15 * M))
tick(gh, st, T0)
c = gh.writes("gh", "issue", "create")[0]
assert c[c.index("--label") + 1] == "canary,express,P3,pack,ready-for-agent", c   # #450: its own express lane
body = c[c.index("--body") + 1]
assert "## Acceptance" in body and C.FILE in body and "Out of scope" in body, "the runner refuses an issue without Acceptance (#186)"
assert c[c.index("--title") + 1] == C.TITLE, "one rolling canary issue (#538)"
assert "only" in body and "Refs" not in body, body
assert st["run"]["n"] == 401 and st["started"] == T0
assert gh.writes("gh", "label", "create"), "the canary label is made once"
gh.issue["labels"] = [{"name": "in-progress"}]; tick(gh, st, T0 + 4 * M)
gh.pr = "OPEN"; tick(gh, st, T0 + 20 * M)
gh.verdict = "review...\nVERDICT: PASS"; tick(gh, st, T0 + 30 * M)
gh.pr = "MERGED"; tick(gh, st, T0 + 40 * M)
gh.issue["state"] = "CLOSED"; tick(gh, st, T0 + 45 * M)
assert said == [], said
assert st.get("run") is None and st["last_ok"] == T0 + 45 * M
assert C.line(st) == "flow ok 14:45", C.line(st)
assert not gh.writes("gh", "issue", "close") and not gh.writes("gh", "pr", "close"), "a green canary is closed by the flow itself"
saved = json.loads(C.STATE.read_text(encoding="utf-8"))
assert saved["text"] == "flow ok 14:45", "the panel/dashboard read .runs/canary.json text"
tick(gh, st, T0 + 3 * 3600)
assert st.get("run") is None, "the next canary waits 6 h"
# #538: the next run reuses the same issue: reopened, ready again, a comment for this run; no new issue
tick(gh, st, T0 + 6 * 3600 + M)
assert len(gh.writes("gh", "issue", "create")) == 1, "no second canary issue"
assert gh.writes("gh", "issue", "reopen") and gh.writes("gh", "issue", "reopen")[0][3] == "401"
ed = gh.writes("gh", "issue", "edit")[-1]
assert "ready-for-agent" in ed[ed.index("--add-label") + 1] and "in-progress" in ed[ed.index("--remove-label") + 1], ed
assert "canary " + time.strftime("%Y-%m-%d %H:%M", time.localtime(T0 + 6 * 3600 + M)) in ed[ed.index("--body") + 1], "the new line to append"
cm = gh.writes("gh", "issue", "comment")[-1]
assert cm[3] == "401" and "Canary run" in cm[cm.index("--body") + 1], cm
assert st["run"]["n"] == 401 and st["run"]["opened"] == T0 + 6 * 3600 + M
# the last run's merged PR is not this run's: steps start again from nothing
gh.issue["labels"] = []
tick(gh, st, T0 + 6 * 3600 + 5 * M)
assert st["run"]["at"] == {}, st["run"]
gh.pr, gh.verdict, gh.pr_at = "OPEN", "", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(T0 + 6 * 3600 + 8 * M))
tick(gh, st, T0 + 6 * 3600 + 10 * M)
assert set(st["run"]["at"]) == {"start", "pr"}, st["run"]

# #538: two ticks 10 min apart (a tooling merge in between) -> one canary
gh, st, said[:] = GH(), {}, []
gh.pr_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(T0 + M))
tick(gh, st, T0)
gh.pr, gh.verdict, gh.issue["state"] = "MERGED", "VERDICT: PASS", "CLOSED"
tick(gh, st, T0 + 5 * M)
assert st.get("run") is None and st["last_ok"] == T0 + 5 * M, "green in 5 min"
tick(gh, st, T0 + 15 * M, changed=T0 + 10 * M)
assert len(gh.writes("gh", "issue", "create")) == 1 and not gh.writes("gh", "issue", "reopen"), "only one canary within the hour"
tick(gh, st, T0 + 61 * M, changed=T0 + 10 * M)
assert gh.writes("gh", "issue", "reopen"), "after the hour the tooling change starts the next one"
# never on a governor STOP, never while a P0 waits for a lane; it starts once they are gone
gh, st = GH(), {}
tick(gh, st, T0, stopped=True)
assert not gh.writes("gh", "issue", "create") and st.get("run") is None, "governor STOP: no canary"
gh.p0 = [{"number": 9, "title": "real P0", "labels": [{"name": "P0"}, {"name": "ready-for-agent"}]}]
tick(gh, st, T0 + 5 * M)
assert not gh.writes("gh", "issue", "create") and st.get("run") is None, "a P0 waits: no canary"
gh.p0 = []
tick(gh, st, T0 + 10 * M)
assert gh.writes("gh", "issue", "create") and st["run"]["n"] == 401

# a missed deadline: ONE alarm naming the step (to orchestrator + inspector), NEEDS-ATTENTION on the panel
gh, st, said[:] = GH(), {}, []
tick(gh, st, T0)
tick(gh, st, T0 + 12 * M)
assert len(said) == 1 and "'start'" in said[0] and "#401" in said[0] and "10 min" in said[0], said
assert C.line(st).startswith("NEEDS-ATTENTION: canary #401 step start late"), C.line(st)
tick(gh, st, T0 + 14 * M)
assert len(said) == 1, "the same step is not alarmed twice"
gh.issue["labels"] = [{"name": "in-progress"}]; gh.pr = "OPEN"; tick(gh, st, T0 + 16 * M)
assert C.line(st).startswith("NEEDS-ATTENTION"), "the attention line stays until the canary is green"
tick(gh, st, T0 + 16 * M + 21 * M)
assert len(said) == 2 and "'review'" in said[1], said
# still stuck GIVE_UP_H after it opened: the flow closes the canary PR and issue itself
tick(gh, st, T0 + C.GIVE_UP_H * 3600 + M)
assert gh.writes("gh", "pr", "close") and gh.writes("gh", "issue", "close")
assert st.get("run") is None and st["fail"]["step"] == "review"
assert "NEEDS-ATTENTION" in C.line(st) and "review" in C.line(st)
assert len(said) == 3 and "closed" in said[2], said
# owner 19:50 (#330): a red step also opens ONE P0 issue (searched first), so the alarm is not lost when no window is up
p0 = [c for c in gh.writes("gh", "issue", "create") if "P0" in c[c.index("--label") + 1]]
titles = [c[c.index("--title") + 1] for c in p0]
assert titles == ["Canary: step 'start' of the flow is broken", "Canary: step 'review' of the flow is broken"], titles
assert all(c[c.index("--label") + 1] == "P0,needs-orchestrator" for c in p0), p0
assert "#401" in p0[0][p0[0].index("--body") + 1]
# an open P0 for the same step already exists: none is created
gh, st, said[:] = GH(), {}, []
gh.p0 = [{"number": 499, "title": "Canary: step 'start' of the flow is broken"}]
tick(gh, st, T0); tick(gh, st, T0 + 12 * M)
assert len(said) == 1 and len(gh.p0) == 1, gh.p0

# #450: all normal lanes busy -> the canary (express) still starts in the express lane, ahead of queued work; no false alarm
import runner as R
busy = [{"number": k, "labels": ["in-progress", "pack"], "createdAt": "2026-11-26T10:00:00Z"} for k in range(1, 9)]
queued = [{"number": 20, "labels": ["ready-for-agent", "pack", "P0"], "createdAt": "2026-11-26T09:00:00Z", "body": "## Acceptance\n- x"}]
can = {"number": 401, "labels": "canary,express,P3,pack,ready-for-agent".split(","), "createdAt": "2026-11-26T14:00:00Z", "body": C.issue_body("x")}
ch = R.select(busy + queued + [can], 8, 1, 2)
assert [i["number"] for i in ch] == [401], ch
assert [(i["number"], w) for i, w in R.assign_where(ch, 0, 8, 0, 8)] == [(401, "remote")], "all lanes busy: the express slot"
assert [i["number"] for i in R.select(queued + [can], 8, 1, 2)][0] == 401, "ahead of queued work"
# the canary never runs while the governor says STOP (an owner 'express' still does, #269)
assert R.stop_filter([can], {"stop": True, "pct": 95}) == []
assert R.stop_filter([{"number": 9, "labels": ["express"]}], {"stop": True, "pct": 95}) != []
assert R.stop_filter([can], {"stop": False, "pct": 50}) == [can]
# ... and its 'start' clock waits while STOP holds it: no false 'start missed deadline'
gh, st, said[:] = GH(), {}, []
tick(gh, st, T0)
tick(gh, st, T0 + 5 * M, stopped=True); tick(gh, st, T0 + 30 * M, stopped=True)
tick(gh, st, T0 + 38 * M)
assert said == [], said
tick(gh, st, T0 + 41 * M)
assert len(said) == 1 and "'start'" in said[0], "10 min after the stop ended it is late again"

# leftover canary issues (state lost, watchdog restart) are closed before a new canary opens
gh, st, said[:] = GH(), {}, []
gh.leftovers = [390, 395]
tick(gh, st, T0)
closed = [c[3] for c in gh.writes("gh", "issue", "close")]
assert closed == ["390", "395"], closed
# ... but never the rolling one
gh2, st2 = GH(), {}
gh2.issue = {"number": 401, "state": "OPEN", "labels": []}
tick(gh2, st2, T0)
assert not gh2.writes("gh", "issue", "close") and st2["run"]["n"] == 401

# a GitHub error: nothing is opened, retried next tick
class Down(GH):
    def __call__(self, cmd, env=None): self.calls.append(cmd); return 1, "HTTP 502"
d, st = Down(), {}
tick(d, st, T0)
assert st.get("run") is None and st.get("started") is None

# ---------- side paths (read-only) ----------
assert C.budget_problems({"rate": {"graphql": [4000, 5000], "core": [900, 5000]}}) == ["GitHub budget core 18% < 20%"]
assert C.budget_problems({"rate": {"graphql": [4000, 5000]}, "rate_owner": {"graphql": [100, 5000]}}) == ["GitHub budget owner graphql 2% < 20%"]
assert C.budget_problems({}) == [] and C.budget_problems(None) == []
assert C.desks_problems('cloud desks: inbox ok · ask ok') == []
assert C.desks_problems('cloud desks: inbox ok · ask down') == ["cloud desks: inbox ok · ask down"]
assert C.desks_problems(None) == ["cloud desks: no status (.runs/desks.json)"]

# the question popup: the real tools/ask page, answered by the test itself (no browser, no GitHub, no owner prompt)
assert C.popup_check() == "", C.popup_check()

# side checks: hourly, popup once a day, problems on the NEEDS-ATTENTION line, each told once until it is fixed
calls = {"popup": 0}
def popup():
    calls["popup"] += 1; return calls.get("pop_err", "")
st, said[:] = {"last_ok": T0}, []
probs = C.side_tick(st, T0, say=said.append, log=lambda m: None, cache=lambda: {"rate": {"core": [100, 5000]}},
                    desks=lambda: "cloud desks: inbox ok · ask ok", popup=popup)
assert probs == ["GitHub budget core 2% < 20%"] and calls["popup"] == 1, (probs, calls)
assert len(said) == 1 and "GitHub budget" in said[0]
assert C.line(st) == "NEEDS-ATTENTION: GitHub budget core 2% < 20% · flow ok 14:00", C.line(st)
C.side_tick(st, T0 + 30 * M, say=said.append, log=lambda m: None, cache=lambda: {}, desks=lambda: "x", popup=popup)
assert st["side"] == ["GitHub budget core 2% < 20%"], "not again within the hour"
calls["pop_err"] = "page did not answer"
C.side_tick(st, T0 + 61 * M, say=said.append, log=lambda m: None, cache=lambda: {"rate": {"core": [100, 5000]}},
            desks=lambda: "cloud desks: inbox ok · ask ok", popup=popup)
assert calls["popup"] == 1, "the popup test runs once a day"
assert len(said) == 1, "an unchanged problem is not told again"
C.side_tick(st, T0 + 25 * 3600, say=said.append, log=lambda m: None, cache=lambda: {}, desks=lambda: "cloud desks: inbox ok · ask ok", popup=popup)
assert calls["popup"] == 2 and st["side"] == ["question popup: page did not answer"] and len(said) == 2, (st, said)
assert C.line(st) == "NEEDS-ATTENTION: question popup: page did not answer · flow ok 14:00"
print("canary ok")
