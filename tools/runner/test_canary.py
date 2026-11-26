# Unit test for canary.py (#330) with a fake gh and a fake clock: python tools/runner/test_canary.py
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # tests never write to the live .runs
os.environ["OREN_TEST"] = "1"
import json, time
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
    """Answers gh commands from a little world: one canary issue, maybe its PR; records writes."""
    def __init__(self): self.issue, self.pr, self.verdict, self.calls, self.leftovers = None, None, "", [], []
    def __call__(self, cmd, env=None):
        self.calls.append(cmd)
        line = " ".join(map(str, cmd))
        if cmd[:3] == ["gh", "label", "create"]: return 0, ""
        if cmd[:3] == ["gh", "issue", "list"] and "canary" in cmd: return 0, json.dumps([{"number": n} for n in self.leftovers])
        if cmd[:3] == ["gh", "issue", "create"]:
            self.issue = {"number": 401, "state": "OPEN", "labels": []}
            return 0, "https://github.com/igalgerman/oren_study/issues/401\n"
        if cmd[:3] == ["gh", "issue", "view"]:
            return 0, json.dumps({**self.issue, "comments": []})
        if cmd[:3] == ["gh", "pr", "list"]:
            if "--head" in cmd and self.pr: return 0, json.dumps([{"number": 77, "headRefName": "lane/401", "state": self.pr}])
            return 0, "[]"
        if cmd[:3] == ["gh", "pr", "view"]:
            return 0, json.dumps({"comments": [{"body": self.verdict}] if self.verdict else []})
        if cmd[:3] in (["gh", "issue", "close"], ["gh", "pr", "close"], ["gh", "issue", "comment"]): return 0, ""
        raise AssertionError("unexpected gh call: " + line)
    def writes(self, *head): return [c for c in self.calls if c[:len(head)] == list(head)]

said = []
def tick(gh, st, now, changed=0, side=None):
    return C.tick(run=gh, say=said.append, log=lambda m: None, now=now, st=st, changed=lambda: changed,
                  side=side or (lambda st, now: []))

# a green canary: issue opened -> started -> PR -> review -> merge -> closed; panel 'flow ok HH:MM'
gh, st = GH(), {}
tick(gh, st, T0)
c = gh.writes("gh", "issue", "create")[0]
assert c[c.index("--label") + 1] == "canary,P3,pack,ready-for-agent", c
body = c[c.index("--body") + 1]
assert "## Acceptance" in body and C.FILE in body and "Out of scope" in body, "the runner refuses an issue without Acceptance (#186)"
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

# leftover canary issues (state lost, watchdog restart) are closed before a new canary opens
gh, st, said[:] = GH(), {}, []
gh.leftovers = [390, 395]
tick(gh, st, T0)
closed = [c[3] for c in gh.writes("gh", "issue", "close")]
assert closed == ["390", "395"], closed

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
