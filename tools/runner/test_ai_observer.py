"""#203 AI observer with a fake claude: output parsing, repeat filter, never two at once, off when 0. Run: python3 tools/runner/test_ai_observer.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
import json, subprocess, sys, tempfile, threading, time
import re, trust   # #800: old fixtures have no author: default them to the owner (explicit authors still count; test_trust.py covers the real rules)
_login = trust.login
trust.login = lambda c: _login(c) or (("oren-study-bot" if re.match(r"\s*(OWNER ANSWER|ANSWERED)", c.get("body") or "") or "owner-answer:" in (c.get("body") or "") else "igalgerman") if isinstance(c, dict) else "")
from pathlib import Path
sys.argv.append("--dry-run")
import runner as R
import ai_observer as A
import owner_q as OQ
import observer as ob

tmp = Path(tempfile.mkdtemp())
A.LAST, A.STATE = tmp / "ai_observer.last", tmp / "ai_observer.state.json"
A.lock_text = lambda: "merge lock: free"
OQ.STATE = tmp / "owner_q.json"
R.CFG["ai_observer_where"] = "local"     # the local (headless) mode first; #289's cloud relay is tested at the end

class FakeClaude:
    """Stands in for subprocess.run: records the command, answers with `out` (optionally waits for `gate`)."""
    def __init__(self, out="no problems", rc=0, gate=None, timeout=False): self.out, self.rc, self.gate, self.timeout, self.calls = out, rc, gate, timeout, []
    def __call__(self, cmd, **kw):
        self.calls.append((cmd, kw))
        if self.gate: self.gate.wait(5)
        if self.timeout: raise subprocess.TimeoutExpired(cmd, kw.get("timeout"))
        return subprocess.CompletedProcess(cmd, self.rc, self.out, "")

# ---- parsing ----
out = ("Let me check.\nOBSERVER: #141 ready-for-human but still Blocked by #140 (open) -> orchestrator: label blocked\n"
       "- OBSERVER: #142 in-progress with no worker -> orchestrator: rerun\n" + "".join(f"OBSERVER: #{n} x -> worker\n" for n in range(1, 6)))
f = A.parse(out)
assert len(f) == 5 and f[0].startswith("OBSERVER: #141 ready-for-human") and f[1] == "OBSERVER: #142 in-progress with no worker -> orchestrator: rerun"
assert A.parse("no problems\n") == [] and A.parse("No problems.") == []
assert A.parse("I could not run gh") is None and A.parse("") is None
assert A.for_owner("OBSERVER: #9 needs a decision -> owner: pick a colour") and not A.for_owner("OBSERVER: #9 owner lane wrong -> orchestrator: relabel")
print("ok parse")

# ---- repeat filter: same issue + same text start not again within 6 h ----
a, b = "OBSERVER: #141 ready-for-human but still Blocked by #140 -> orchestrator", "OBSERVER: #141 ready-for-human but still Blocked by #140, now 2h -> orchestrator"
new, sent = A.fresh([a], {}, 1000)
assert new == [a]
assert A.fresh([b], sent, 1000 + 3600)[0] == []                         # same issue + same start, 1 h later
assert A.fresh(["OBSERVER: #142 ready-for-human but still Blocked by #140 -> x"], sent, 1000 + 60)[0] != []   # other issue
assert A.fresh([a], sent, 1000 + 6 * 3600 + 1)[0] == [a]                 # after 6 h: again
assert A.fresh([a, a], {}, 0)[0] == [a]                                  # twice in one run: once
print("ok repeat filter")

# ---- one run: command line, .last file, tell only new, owner finding -> #193 when it exists ----
def GQL(cs, more=False): return json.dumps({"data": {"repository": {"issue": {"comments": {"pageInfo": {"hasNextPage": more, "endCursor": "c1" if more else None}, "nodes": cs}}}}})   # #800: owner_q.comments reads GraphQL
told, logs, gh_calls = [], [], []
def fake_gh(*a, **kw):
    gh_calls.append(a)
    if a[:2] == ("api", "graphql"): return 0, GQL([])
    if a[:2] == ("issue", "list"): return 0, json.dumps([{"number": 193, "title": OQ.TITLE}])
    if a[:2] == ("issue", "view"): return 0, json.dumps({"comments": []})
    return 0, "https://github.com/x/y/issues/193#c1\n"
OQ.GH = fake_gh
fc = A.RUN = FakeClaude("OBSERVER: #50 waits for a colour choice -> owner: choose blue or green\nOBSERVER: #51 red check -> worker: fix")
assert A.run_once(told.append, logs.append, now=10**6) == ["OBSERVER: #50 waits for a colour choice -> owner: choose blue or green", "OBSERVER: #51 red check -> worker: fix"]
cmd, kw = fc.calls[0]
assert cmd[1:8] == ["-p", "--model", "sonnet", "--effort", "medium", "--no-session-persistence", "--output-format"] and "--tools" in cmd and cmd[cmd.index("--output-format") + 1] == "json" and kw["timeout"] == 600 and "OBSERVER:" in kw["input"]
assert "Bash(gh:*)" in cmd and "Bash(python tools/runner/remote.py status:*)" in cmd and "Bash(gh issue comment:*)" in cmd[cmd.index("--disallowedTools"):]
assert "Edit" not in cmd and "Write" not in cmd
assert "#51 red check" in A.LAST.read_text(encoding="utf-8") and len(told) == 1 and "#50" in told[0] and "#51" in told[0]
assert not [c for c in gh_calls if c[:2] == ("issue", "comment")]                         # #899: never a post on the owner questions
n_comments = len([c for c in gh_calls if c[:2] == ("issue", "comment")])
assert A.run_once(told.append, logs.append, now=10**6 + 3600) and len(told) == 1          # same findings an hour later: not sent again
assert len([c for c in gh_calls if c[:2] == ("issue", "comment")]) == n_comments
OQ.GH = lambda *a, **kw: (0, "[]") if a[:2] == ("issue", "list") else (_ for _ in ()).throw(AssertionError("posted without #193"))
A.RUN = FakeClaude("OBSERVER: #60 decide the level -> owner: pick")
A.run_once(told.append, logs.append, now=10**6 + 7200); assert len(told) == 2           # told the orchestrator, no post
A.RUN = FakeClaude("no problems"); assert A.run_once(told.append, logs.append) == [] and len(told) == 2
assert "no problems" in A.LAST.read_text(encoding="utf-8")
A.RUN = FakeClaude(timeout=True); assert A.run_once(told.append, logs.append) is None and "timeout" in A.LAST.read_text(encoding="utf-8")
A.RUN = FakeClaude("blah", rc=1); assert A.run_once(told.append, logs.append) is None and "failed" in A.LAST.read_text(encoding="utf-8") and len(told) == 2
print("ok run")

# ---- run_if_due: never two at once, hourly, off when 0 ----
A.STATE.unlink()
gate = threading.Event(); A.RUN = FakeClaude("no problems", gate=gate)
assert A.run_if_due(told.append, logs.append, minutes=0) is False                        # off
assert A.run_if_due(told.append, logs.append, minutes=60) is True
assert A.run_if_due(told.append, logs.append, minutes=60, now=time.time() + 7200) is False   # first still running: never two
gate.set()
for _ in range(100):
    if not A._running["v"]: break
    time.sleep(0.05)
assert not A._running["v"] and len(A.RUN.calls) == 1
assert A.run_if_due(told.append, logs.append, minutes=60) is False                       # ran < 60 min ago
assert A.run_if_due(told.append, logs.append, minutes=60, now=time.time() + 3601) is True
for _ in range(100):
    if not A._running["v"]: break
    time.sleep(0.05)
_cfg = dict(R.CFG); R.CFG["ai_observer_minutes"] = 0
assert A.run_if_due(told.append, logs.append, now=time.time() + 10**6) is False          # config 0 = off
R.CFG.clear(); R.CFG.update(_cfg)
print("ok due")

# ---- observer v2 learns cloud lanes: no local run window by design ----
_I = lambda n, L: {"number": n, "labels": L, "touched_min_ago": 5, "no_run_min": 60, "body": ""}
_S = lambda i: {"issues": i, "orchestrator": "idle", "orchestrator_idle_min": 40, "integrating": False}
assert ob.rules(_S([_I(3, ["in-progress", "cloud"])])) == []
assert ob.rules(_S([_I(3, ["in-progress"])]))[0][:2] == ("rerun", 3)
print("ok cloud lanes")

# ---------- #289: the AI observer runs as a cloud scheduled task; the PC only relays its comment (no claude -p here) ----------
A.STATE = tmp / "ai_observer.cloud.json"
A.LAUNCH = lambda *a, **kw: {"ok": True}; A.TELEGRAM = lambda t: 1; A.WEEK_STOP = lambda: False   # #525: never a real cloud start / owner post here
OQ.GH = lambda *a, **kw: (0, GQL([]) if a[:2] == ("api", "graphql") else "[]")   # #603: the once-cleanup reads #193
claude = FakeClaude(out="OBSERVER: never used")
A.RUN = claude
# round 2 of #485: gh has no `lastComment` JSON field (rc=1 on every call) and `--json comments` stops at 100. The fakes return
# exactly what real gh returns: `gh issue list --json number` -> [{"number"}], REST `gh api .../comments?since=` -> [{created_at, body}]
ISS = json.dumps([{"number": 600}])
def GH(log=None):
    def gh(*a):
        if log is not None: log.append(a)
        assert list(a) == ["issue", "list", "--state", "open", "--label", A.CLOUD_LABEL, "--limit", "5", "--json", "number"], a
        return 0, ISS
    return gh
def API(comments, log=None):
    """REST: GitHub returns the comments updated at/after `since`, oldest first, at most per_page."""
    def api(argv):
        if log is not None: log.append(argv)
        assert argv[:2] == ["gh", "api"] and len(argv) == 3 and "--repo" not in argv, argv
        path, _, q = argv[2].partition("?")
        assert path == f"repos/{R.REPO}/issues/600/comments", argv
        qs = dict(kv.split("=", 1) for kv in q.split("&"))
        assert qs["per_page"] == "100" and re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", qs["since"]), argv
        return 0, json.dumps([c for c in comments if c["created_at"] >= qs["since"]][:100])
    return api
import re
C1 = {"created_at": "2026-11-26T20:00:00Z", "body": "Cloud observer 22:00\nOBSERVER: #12 blocked but its PR is green -> orchestrator merges it\n\n---\n_Generated by Claude Code_"}
import calendar as _cal
t20 = _cal.timegm(time.strptime("2026-11-26T20:00:00", "%Y-%m-%dT%H:%M:%S"))
told, ghc, apic = [], [], []
assert A.run_if_due(told.append, lambda s: None, now=t20 + 600, where="cloud", gh=GH(ghc), api=API([C1], apic)) is False   # never a local run
assert claude.calls == []                                                                         # no headless claude on the PC
assert len(told) == 1 and "#12 blocked" in told[0] and told[0].startswith("AI OBSERVER"), told
assert "#12 blocked" in A.LAST.read_text()
assert len(ghc) == 1 and len(apic) == 1, (ghc, apic)
assert "since=2026-11-25T20:10:00Z" in apic[0][2], apic                                          # first run: the last day
# the same comment is relayed once; the next tick inside RELAY_MIN reads nothing
ghc.clear(); apic.clear(); A.run_if_due(told.append, lambda s: None, now=t20 + 660, where="cloud", gh=GH(ghc), api=API([C1], apic))
assert ghc == [] and apic == [] and len(told) == 1
A.run_if_due(told.append, lambda s: None, now=t20 + 600 + A.RELAY_MIN * 60, where="cloud", gh=GH(), api=API([C1], apic))
assert len(told) == 1, told                                                                       # nothing new
assert "since=2026-11-26T20:00:00Z" in apic[-1][2], apic                                         # since = the last seen comment
# a newer 'no problems' comment: nothing told; an unreadable comment is skipped
C2 = {"created_at": "2026-11-26T21:00:00Z", "body": "no problems"}
CJ = {"created_at": "2026-11-26T21:30:00Z", "body": "random chatter"}
A.run_if_due(told.append, lambda s: None, now=t20 + 600 + 2 * A.RELAY_MIN * 60, where="cloud", gh=GH(), api=API([C1, C2, CJ]))
assert len(told) == 1 and "no problems" in A.LAST.read_text()
# the cloud task went silent for SILENT_H hours -> one note to the orchestrator (then not again for SILENT_H)
t21 = _cal.timegm(time.strptime("2026-11-26T21:00:00", "%Y-%m-%dT%H:%M:%S"))
A.run_if_due(told.append, lambda s: None, now=t21 + (A.SILENT_H * 3600) - 600, where="cloud", gh=GH(), api=API([C1, C2]))
assert len(told) == 1, told                                                                       # not silent yet (no new comment since)
A.run_if_due(told.append, lambda s: None, now=t21 + (A.SILENT_H * 3600) + 60, where="cloud", gh=GH(), api=API([C1, C2]))
assert len(told) == 2 and "silent" in told[1] and "cloud-tasks.md" in told[1], told
A.run_if_due(told.append, lambda s: None, now=t21 + (A.SILENT_H * 3600) + 60 + A.RELAY_MIN * 60, where="cloud", gh=GH(), api=API([C1, C2]))
assert len(told) == 2
# a gh / gh api error relays nothing and never crashes the tick (e.g. the round-2 bug: rc=1 'Unknown JSON field')
n = len(told)
A.run_if_due(told.append, lambda s: None, now=t21 + 10**6, where="cloud", gh=lambda *a: (1, "Unknown JSON field: 'lastComment'"), api=API([]))
A.run_if_due(told.append, lambda s: None, now=t21 + 10**6 + 600, where="cloud", gh=GH(), api=lambda argv: (1, "boom"))
assert len(told) == n
import tomllib as _toml
assert _toml.loads((R.HERE / "config.toml").read_text(encoding="utf-8")).get("ai_observer_where") == "cloud"   # the PC default is the cloud
# 150 comments on the issue: since= reads only the unseen ones, so the 150th is relayed (never stuck on the oldest 100)
old = [{"created_at": f"2026-11-2{d}T{h:02d}:00:00Z", "body": "no problems"} for d in range(3, 9) for h in range(24)][:149]
C150 = {"created_at": "2026-11-30T10:00:00Z", "body": "OBSERVER: #150 the newest finding -> orchestrator"}
A.STATE = tmp / "ai_observer.cloud150.json"; told150 = []
A.save_state({"cloud_seen": old[-1]["created_at"]})
t30 = _cal.timegm(time.strptime("2026-11-30T10:30:00", "%Y-%m-%dT%H:%M:%S"))
A.run_if_due(told150.append, lambda s: None, now=t30, where="cloud", gh=GH(), api=API(old + [C150]))
assert len(told150) == 1 and "#150 the newest" in told150[0], told150
print("ok #289 cloud AI observer relay")

# ---------- #525: the triggers never ran. Silence -> ONE owner note (owner_q, also Telegram), at most every 12 h; until a
# trigger-made comment is seen the watchdog starts the observer prompt itself as a cloud job every hour (remote.launch) ----------
A.STATE = tmp / "ai_observer.525.json"
posts, starts = [], []
A.TELEGRAM = lambda text: posts.append(("tg", "QUESTION: " + text)) or 1; A.WEEK_STOP = lambda: False   # #899: Telegram notice, no owner_q
def LAUNCH(ok=True):
    def launch(n, task, cwd, name=None, model=None, desk=False):
        starts.append({"task": task, "name": name, "desk": desk, "model": model}); return {"ok": ok}
    return launch
A.LAUNCH = LAUNCH()
NOISSUE = lambda *a: (0, "[]")                                    # the ai-observer issue does not exist (the real 27 Nov state)
t0 = _cal.timegm(time.strptime("2026-11-27T00:00:00", "%Y-%m-%dT%H:%M:%S"))
told = []
A.relay(told.append, lambda s: None, t0, gh=NOISSUE, api=API([]))
assert len(starts) == 1 and starts[0]["name"] == "cloud-observer" and starts[0]["desk"] is True, starts      # fallback started at once
assert "cloud-tasks.md" in starts[0]["task"] and "AI observer" in starts[0]["task"] and A.FALLBACK_MARK in starts[0]["task"]
assert posts == []                                                                # not silent 3 h yet
A.relay(told.append, lambda s: None, t0 + 30 * 60, gh=NOISSUE, api=API([]))
assert len(starts) == 1                                                           # once an hour, not every relay
A.relay(told.append, lambda s: None, t0 + 3600, gh=NOISSUE, api=API([]))
assert len(starts) == 2                                                           # the next hour: again
A.relay(told.append, lambda s: None, t0 + 3 * 3600, gh=NOISSUE, api=API([]))
assert len(posts) == 1 and posts[0][1].startswith("QUESTION: cloud AI observer silent since "), posts
assert "log in again (/login) or check claude.ai/code -> Scheduled" in posts[0][1]
since = time.strftime("%H:%M", time.localtime(t0)); assert f"silent since {since} " in posts[0][1], posts
for k in range(1, 21):                                                            # dedupe: not again within 24 h
    A.relay(told.append, lambda s: None, t0 + 3 * 3600 + k * 3600 - 60, gh=NOISSUE, api=API([]))
assert len(posts) == 1, posts
A.relay(told.append, lambda s: None, t0 + 27 * 3600 + 60, gh=NOISSUE, api=API([]))
assert len(posts) == 2, posts                                                     # 24 h later: once more
# fallback-made comments do not prove the trigger: the fallback keeps running and the owner note keeps its 24 h repeat
FB = {"created_at": "2026-11-28T16:00:00Z", "body": A.FALLBACK_MARK + "\nno problems"}
n0 = len(starts)
A.relay(told.append, lambda s: None, t0 + 41 * 3600, gh=GH(), api=API([FB]))
assert len(starts) == n0 + 1 and not A.load_state().get("proven")
# a trigger-made comment (no marker) -> proven: the fallback stops by itself, and no owner note while it keeps posting
TR = {"created_at": "2026-11-28T17:30:00Z", "body": "no problems"}
A.relay(told.append, lambda s: None, t0 + 42 * 3600, gh=GH(), api=API([FB, TR]))
assert A.load_state().get("proven") is True
for k in range(1, 3): A.relay(told.append, lambda s: None, t0 + 42 * 3600 + k * 3600, gh=GH(), api=API([]))
assert len(starts) == n0 + 1, starts                                              # off while the trigger is < 3 h old (#689)
np = len(posts)
A.relay(told.append, lambda s: None, t0 + 54 * 3600, gh=GH(), api=API([]))       # trigger silent again 3 h+: owner note again
assert len(posts) == np + 1 and "silent since " + time.strftime("%H:%M", time.localtime(t0 + 41.5 * 3600)) in posts[-1][1], posts
# #689: proven once, then the trigger stops: trigger_seen 4 h old -> the fallback runs again; 1 h old -> not; fallback 30 min ago -> not
A.STATE = tmp / "ai_observer.689.json"; starts.clear(); A.LAUNCH = LAUNCH()
iso = lambda e: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(e))
A.save_state({"proven": True, "trigger_seen": iso(t0 - 4 * 3600)}); assert A.fallback(t0, lambda s: None) and len(starts) == 1
assert not A.fallback(t0 + 30 * 60, lambda s: None) and len(starts) == 1              # at most once per FALLBACK_MIN
A.save_state({"proven": True, "trigger_seen": iso(t0 - 3600)}); assert not A.fallback(t0, lambda s: None) and len(starts) == 1
A.save_state({"proven": True, "trigger_seen": iso(t0 - 4 * 3600), "fallback_at": t0 - 30 * 60}); assert not A.fallback(t0, lambda s: None)
print("ok #689 fallback runs again when the trigger is silent")
# a failed cloud start is retried at the next relay (not an hour later)
A.STATE = tmp / "ai_observer.525b.json"; starts.clear(); A.LAUNCH = LAUNCH(ok=False)
A.relay(told.append, lambda s: None, t0, gh=NOISSUE, api=API([]))
A.LAUNCH = LAUNCH(); A.relay(told.append, lambda s: None, t0 + A.RELAY_MIN * 60, gh=NOISSUE, api=API([]))
assert len(starts) == 2, starts
print("ok #525 silent -> owner note + hourly cloud fallback")

# ---------- #603: only a line whose fix names 'owner' as the DOER is an owner question; the rest go only to the orchestrator ----------
REAL = [  # real 27 Nov lines from the ai-observer issue (#528)
    ("OBSERVER: PRs #557 (#64) and #553 (#53) are still `dirty` -> orchestrator: schedule a rebase on main, or ask the owner the pending question so #53 can move.", False),
    ("OBSERVER: #53 has no owner reply -> orchestrator: relay the question to the owner channel and drop `ready-for-agent` until he picks.", False),
    ("OBSERVER: #557 RED -> orchestrator: drop `ready-for-agent` on both; owner: write \"design approved\" on #63/#64 (his decision), then merge #557.", True),
    ("OBSERVER: PR #531 waits -> owner: merge #531 (or orchestrator: say why it waits).", True),
    ("OBSERVER: #12 x -> worker: fix it; #53 also waits for the owner's voice answer, so the owner should answer it.", False),
    ("OBSERVER: #9 x -> owner merges #9", True)]
for line, want in REAL: assert A.for_owner(line) is want, (line, want)
assert not A.for_owner("x -> orchestrator: y") and A.for_owner("x -> owner: merge #531")
A.STATE = tmp / "ai_observer.603.json"; OQ.STATE = tmp / "owner_q.603.json"
posted = []
def gh603(*a, **kw):
    if a[:2] == ("api", "graphql"): return 0, GQL([])
    if a[:2] == ("issue", "list"): return 0, json.dumps([{"number": 205, "title": OQ.TITLE}])
    if a[:2] == ("issue", "view"): return 0, json.dumps({"comments": []})
    if a[:2] == ("issue", "comment"): posted.append(a[-1]); return 0, "https://github.com/x/y/issues/205#c9\n"
    return 0, ""
OQ.GH = gh603; told = []
A.report(True, "OBSERVER: #1 dirty -> orchestrator: y\nOBSERVER: #531 green -> owner: merge #531", told.append, lambda s: None, 10**7)
assert len(told) == 1 and "#1 dirty" in told[0] and "#531" not in told[0]                  # #899: 'owner: merge #n' is the watchdog's
assert posted == [], posted                                                               # #899: no owner question from the observer
# the old wrong ones (window ai-observer, no owner doer) are closed once; owner-doer ones and other windows stay open
def qc(key, window, text): return {"body": OQ.body(key, window, "QUESTION: " + text), "url": f"u/{key}", "reactionGroups": []}
OLD = [qc("a" * 12, "ai-observer", "#557 dirty -> orchestrator: rebase, or ask the owner"),
       qc("b" * 12, "ai-observer", "PR #531 -> owner: merge #531"),
       qc("c" * 12, "issue-53", "voice -> orchestrator: x"),
       qc("d" * 12, "ai-observer-1700000000", "QUESTION: cloud AI observer silent since 01:00 - log in again")]
marks = []
def gh_old(*a, **kw):
    if a[:2] == ("api", "graphql"): return 0, GQL(OLD)
    if a[:2] == ("issue", "list"): return 0, json.dumps([{"number": 205, "title": OQ.TITLE}])
    if a[:2] == ("issue", "view"): return 0, json.dumps({"comments": OLD})
    if a[:2] == ("issue", "comment"): marks.append(a[-1]); return 0, "ok"
    return 0, ""
assert A.close_wrong_owner_q(gh_old) == 1
assert len(marks) == 1 and marks[0].startswith("ANSWERED owner-q:" + "a" * 12) and "#603" in marks[0], marks
assert A.close_wrong_owner_q(gh_old) == 0 and len(marks) == 1                             # once only
A.STATE = tmp / "ai_observer.603b.json"
assert A.close_wrong_owner_q(lambda *a, **kw: (1, "boom")) is None and not A.load_state().get("owner_q_cleaned")   # gh error: retried later
print("ok #603 owner questions only when the owner is the doer")

# #714: the observer's command line carries --effort medium (sonnet)
_c = A.command()
assert _c[_c.index("--effort") + 1] == "medium" and _c[_c.index("--model") + 1] == "sonnet", _c
print("ok #714 observer effort")

# ---------- #899: the observer never posts to owner_q; findings go to the orchestrator only ----------
A.STATE = tmp / "ai_observer.899.json"
oq_posts = []; _orig_post = OQ.post
OQ.post = lambda *a, **kw: oq_posts.append(a) or "url"
told899, log899 = [], []
OUT = "OBSERVER: PR stuck #5 -> owner: click the login\nOBSERVER: ready PR #531 -> owner: merge #531\nOBSERVER: lane idle #7 -> orchestrator: rebase"
A.report(True, OUT, told899.append, log899.append, time.time())
assert oq_posts == [], oq_posts                                                  # no owner_q post, ever
assert len(told899) == 1 and "click the login" in told899[0] and "rebase" in told899[0], told899   # told to the orchestrator
assert "merge #531" not in told899[0], told899                                   # 'owner: merge #n' is the watchdog's (#542)
# silence: known reason (week stop) -> nothing for the owner
tg = []; todo = []
A.TELEGRAM = lambda text: tg.append(text) or 1
A.TODO_ADD = None
A.WEEK_STOP = lambda: True
A.STATE = tmp / "ai_observer.899b.json"
s0 = {"relay_since": 0}; A.save_state(s0)
assert A.owner_note(100 * 3600) is False and tg == [] and oq_posts == []
# silence, no reason, no to-do list yet: ONE Telegram notice per 24 h, never owner_q
A.WEEK_STOP = lambda: False
assert A.owner_note(100 * 3600) is True and len(tg) == 1
assert A.owner_note(101 * 3600) is False and A.owner_note(123 * 3600) is False and len(tg) == 1   # < 24 h: nothing more
assert A.owner_note(100 * 3600 + 24 * 3600 + 1) is True and len(tg) == 2                          # 24 h later: one more
# the #525 fallback ran (its comment was seen recently) -> a known reason, nothing for the owner
A.STATE = tmp / "ai_observer.899c.json"; A.save_state({"relay_since": 0, "fallback_seen": "2026-11-27T09:30:00Z"})
assert A.owner_note(_cal.timegm(time.strptime("2026-11-27T10:00:00", "%Y-%m-%dT%H:%M:%S"))) is False and len(tg) == 2
# with a to-do list: ONE item (kind step, check trigger-seen), a second tick adds nothing
A.STATE = tmp / "ai_observer.899d.json"; A.save_state({"relay_since": 0})
A.TODO_ADD = lambda **kw: todo.append(kw) or True
assert A.owner_note(100 * 3600) is True and len(todo) == 1 and todo[0]["kind"] == "step" and todo[0]["check"] == "trigger-seen"
assert A.owner_note(100 * 3600 + 13 * 3600) is False and A.owner_note(100 * 3600 + 60) is False and len(todo) == 1 and len(tg) == 2
assert oq_posts == []
# a Telegram send that fails (0) is no notice: tried again on the next tick, not 24 h later
A.TODO_ADD = None; A.STATE = tmp / "ai_observer.899e.json"; A.save_state({"relay_since": 0})
A.TELEGRAM = lambda text: 0
assert A.owner_note(100 * 3600) is False
A.TELEGRAM = lambda text: tg.append(text) or 1
assert A.owner_note(100 * 3600 + 60) is True and len(tg) == 3
OQ.post = _orig_post
print("ok 899")
