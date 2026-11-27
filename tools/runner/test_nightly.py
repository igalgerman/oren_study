"""#219 nightly retro + handoff + batch trigger with a fake claude and a fake gh. Run: python3 tools/runner/test_nightly.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
import base64, json, subprocess, sys, threading, time
from pathlib import Path
sys.argv.append("--dry-run")
import runner as R
import nightly as N

tmp = Path(tempfile.mkdtemp())
N.STATE = tmp / "nightly.state.json"
N.trends_summary = lambda now: "24h: started 3"
N.transcripts = lambda now: "(none today)"
R.CFG["inspector_handoff"] = str(tmp / "INSPECTOR_HANDOFF.md")
R.CFG["retro_where"] = "local"     # the local (headless) mode first; #289's cloud mode is tested at the end

class FakeClaude:
    def __init__(self, out="", rc=0, gate=None, timeout=False): self.out, self.rc, self.gate, self.timeout, self.calls = out, rc, gate, timeout, []
    def __call__(self, cmd, **kw):
        self.calls.append((cmd, kw))
        if self.gate: self.gate.wait(5)
        if self.timeout: raise subprocess.TimeoutExpired(cmd, kw.get("timeout"))
        return subprocess.CompletedProcess(cmd, self.rc, self.out, "")

class FakeGH:
    def __init__(self, existing=()): self.calls, self.existing = [], list(existing)
    def __call__(self, argv, **kw):
        a = argv[1:]; self.calls.append(a)
        if a[:2] == ["issue", "list"]: return 0, json.dumps([{"number": 1, "title": t} for t in self.existing])
        if a[:2] == ["issue", "create"]: return 0, "https://github.com/x/y/issues/300\n"
        if a[0] == "api" and "contents/ORCHESTRATOR.md?ref=main" in a[-1]:
            return 0, json.dumps({"sha": "f1", "content": base64.b64encode(b"# Orch\n\n## Rules\nx\n").decode()})
        if a[0] == "api" and a[-1].endswith("git/ref/heads/main"): return 0, json.dumps({"object": {"sha": "abc"}})
        if a[0] == "api" and "pulls" in " ".join(a): return 0, json.dumps({"html_url": "https://github.com/x/y/pull/301"})
        return 0, "{}"

# ---- pure ----
OUT = ("thinking...\nRETRO: cap the core lane at 2 | EVIDENCE: 14:02 #166 waited 59 min for a core slot\n"
       "RETRO: be nicer | EVIDENCE:\n- RETRO: rerun flaky reading suite alone | EVIDENCE: runner.log 16:40 #210 BLOCKED reading\n"
       "HANDOFF-INSPECTOR:\nWatch #210.\nHANDOFF-ORCHESTRATOR:\nStart with #166.\n")
props, insp, orch = N.parse(OUT)
assert props == [("cap the core lane at 2", "14:02 #166 waited 59 min for a core slot"), ("rerun flaky reading suite alone", "runner.log 16:40 #210 BLOCKED reading")]
assert insp == "Watch #210." and orch == "Start with #166."
assert N.parse("".join(f"RETRO: p{i} | EVIDENCE: #{i}\n" for i in range(10)))[0][6] == ("p6", "#6") and len(N.parse("".join(f"RETRO: p{i} | EVIDENCE: #{i}\n" for i in range(10)))[0]) == 7
assert N.parse("nothing useful") is None and N.parse("") is None
assert N.replace_section("# A\n\n## UPDATE\nold\nold2\n\n## Next\nkeep\n", "## UPDATE", "new") == "# A\n\n## UPDATE\nnew\n\n## Next\nkeep\n"
assert N.replace_section("# A\n", "## UPDATE", "new") == "# A\n\n## UPDATE\nnew\n" and N.replace_section("", "## UPDATE", "n") == "## UPDATE\nn\n"
assert N.project_dir("C:/work/Oren_study/a") == "C--work-Oren-study-a"
tr = "\n".join(json.dumps(e) for e in [{"type": "user", "message": {"content": "hi  there"}}, {"type": "assistant", "message": {"content": [{"type": "text", "text": "ok"}, {"type": "tool_use"}]}}, {"type": "system"}]) + "\nbad"
assert N.transcript_tail(tr) == "user: hi there\nassistant: ok"
assert N.today_lines("2026-11-26 10:00 a\n2026-11-25 23:00 b\n2026-11-26 11:00 c", "2026-11-26") == "2026-11-26 10:00 a\n2026-11-26 11:00 c"
t23, t22 = time.strptime("2026-11-26 23:05", "%Y-%m-%d %H:%M"), time.strptime("2026-11-26 22:59", "%Y-%m-%d %H:%M")
assert N.retro_due(t23, 23, None) and not N.retro_due(t22, 23, None) and not N.retro_due(t23, 23, "2026-11-26") and not N.retro_due(t23, 0, None)
print("ok parse")

# ---- one run: read-only command, issue 'Daily retro <date>' (retro, P2), handoffs, nothing applied ----
told, logs = [], []
fc = N.RUN = FakeClaude(OUT); g = N.GH = FakeGH()
now = time.mktime(time.strptime("2026-11-26 23:05", "%Y-%m-%d %H:%M"))
Path(R.CFG["inspector_handoff"]).write_text("# Inspector\n\n## UPDATE\nyesterday\n\n## Rules\nr\n", encoding="utf-8")
assert N.run_once(told.append, logs.append, now)
cmd, kw = fc.calls[0]
assert cmd[1:5] == ["-p", "--model", "sonnet", "--no-session-persistence"] and kw["timeout"] == 900 and "retro.md" in kw["input"] and "handoff.md" in kw["input"]
assert "Edit" not in cmd and "Write" not in cmd and not any("comment" in c or "create" in c or "edit" in c for c in cmd)
cr = [c for c in g.calls if c[:2] == ["issue", "create"]][0]
assert cr[cr.index("--title") + 1] == "Daily retro 2026-11-26" and cr[cr.index("--label") + 1] == "retro,P2"
body = cr[cr.index("--body") + 1]
assert "1. cap the core lane at 2" in body and "Evidence: 14:02 #166" in body and "be nicer" not in body
assert Path(R.CFG["inspector_handoff"]).read_text(encoding="utf-8") == "# Inspector\n\n## UPDATE\nWatch #210.\n\n## Rules\nr\n"
put = [c for c in g.calls if c[:3] == ["api", "-X", "PUT"]][0]
assert "branch=nightly/handoff-2026-11-26" in put and "## Handoff (nightly)\nStart with #166." in base64.b64decode(next(x for x in put if x.startswith("content="))[8:]).decode()
assert not any("ref=refs/heads/main" in x for c in g.calls for x in c)                       # never a direct push to main
assert any("base=main" in c for c in g.calls if "pulls" in " ".join(c)) and "pull/301" in told[0] and "issues/300" in told[0]
g2 = N.GH = FakeGH(existing=["Daily retro 2026-11-26"]); N.run_once(told.append, logs.append, now)
assert not [c for c in g2.calls if c[:2] == ["issue", "create"]]                                   # never two retro issues a day
N.RUN = FakeClaude(timeout=True); assert N.run_once(told.append, logs.append, now) is None
N.RUN = FakeClaude("x", rc=1); assert N.run_once(told.append, logs.append, now) is None
print("ok run")

# ---- retro_if_due: once per day, never two at once, off when 0 ----
gate = threading.Event(); N.RUN = FakeClaude(OUT, gate=gate); N.GH = FakeGH()
assert N.retro_if_due(told.append, logs.append, hour=0, now=now) is False                       # off
assert N.retro_if_due(told.append, logs.append, hour=23, now=now - 3600) is False                # before 23:00
assert N.retro_if_due(told.append, logs.append, hour=23, now=now) is True
assert N.retro_if_due(told.append, logs.append, hour=23, now=now + 86400) is False               # first still running: never two
gate.set()
for _ in range(100):
    if not N._running["v"]: break
    time.sleep(0.05)
assert not N._running["v"] and len(N.RUN.calls) == 1
assert N.retro_if_due(told.append, logs.append, hour=23, now=now + 600) is False                 # once per day
assert N.retro_if_due(told.append, logs.append, hour=23, now=now + 86400) is True                # next day
for _ in range(100):
    if not N._running["v"]: break
    time.sleep(0.05)
R.CFG["retro_hour"] = 0; assert N.retro_if_due(told.append, logs.append, now=now + 3 * 86400) is False; R.CFG["retro_hour"] = 23
print("ok due")

# ---- batch trigger: once a day, early when one lane has >= 8 ready P2/P3 unbatched issues ----
I = lambda n, *L, title="x": {"number": n, "title": title, "labels": ["ready-for-agent", *L]}
iss = [I(1, "pack"), I(2, "pack", "P1"), I(3, "pack", "cloud"), I(4, "core", "P3"), {"number": 5, "title": "x", "labels": ["pack"]}, I(6, "pack", title="Batch: x"), I(7, "pack", "bug")]
assert N.batchable(iss) == {"pack": [1], "core": [4]}
bnow = time.mktime(time.strptime("2026-11-26 08:00", "%Y-%m-%d %H:%M"))
N.STATE.unlink(missing_ok=True); sent = []
send = lambda t: sent.append(t) or 0
assert "/batch" in N.batch_tick(send, logs.append, iss, bnow) and len(sent) == 1                  # first of the day
assert N.batch_tick(send, logs.append, iss, bnow + 600) is None                                     # once a day
many = [I(n, "pack") for n in range(10, 18)]
assert N.batch_tick(send, logs.append, many, bnow + 3600) is None                                   # 8 ready, but < 6 h after the last tell
assert "8 ready P2/P3 issues in lane pack" in N.batch_tick(send, logs.append, many, bnow + 7 * 3600) and len(sent) == 2
assert N.batch_tick(lambda t: 1, logs.append, iss, bnow + 2 * 86400) is None                        # inbox not reachable: retried next tick
assert N.batch_tick(send, logs.append, iss, bnow + 2 * 86400) and len(sent) == 3
N.GH = FakeGH(); N._batch_chk["at"] = 0
N.batch_tick(send, logs.append, None, bnow + 3 * 86400); N.batch_tick(send, logs.append, None, bnow + 3 * 86400 + 60)
assert len([c for c in N.GH.calls if c[:2] == ["issue", "list"]]) == 1                              # issue list read at most every 30 min
print("ok batch")

# #282: night report once a day at retro_hour: every open issue not ready-for-agent with its reason; no reason = alarm
lt = lambda h: time.mktime((2026, 11, 26, h, 5, 0, 0, 0, -1))
iss = [{"number": 5, "title": "t5", "state": "OPEN", "labels": ["later"], "body": "", "updatedAt": "2026-11-20T00:00:00Z", "createdAt": "2026-11-20T00:00:00Z"}]
told = []
assert N.night_report_if_due(told.append, lambda s: None, hour=23, now=lt(22), data=lambda: (iss, [], set())) is None and told == []
assert N.night_report_if_due(told.append, lambda s: None, hour=23, now=lt(23), data=lambda: (iss, [], set())).startswith("NIGHT REPORT")
assert len(told) == 1 and "ALARM no reason: #5" in told[0], told
assert N.night_report_if_due(told.append, lambda s: None, hour=23, now=lt(23) + 60, data=lambda: (iss, [], set())) is None and len(told) == 1   # once a day
print("nightly #282 night report OK")

# ---- #289: the retro runs as a nightly CLOUD scheduled task (it opens 'Daily retro <date>' itself); the PC writes only the handoffs ----
N.STATE = tmp / "nightly.cloud.json"
N.LAUNCH = lambda *a, **kw: {"ok": True}   # #525: never a real cloud start here
fc = N.RUN = FakeClaude(OUT)
BODY = ("Nightly retro (cloud scheduled task, #289)\n\nRETRO: cap the core lane at 2 | EVIDENCE: 14:02 #166 waited\n"
        "HANDOFF-INSPECTOR:\nWatch #210.\nHANDOFF-ORCHESTRATOR:\nStart with #166.\n\n---\n_Generated by Claude Code_")
class CloudGH(FakeGH):
    def __init__(self, issues): super().__init__(); self.issues = issues
    def __call__(self, argv, **kw):
        if argv[1:3] == ["issue", "list"]: self.calls.append(argv[1:]); return 0, json.dumps(self.issues)
        return super().__call__(argv, **kw)
told, logs = [], []
Path(R.CFG["inspector_handoff"]).write_text("# Inspector\n\n## UPDATE\nyesterday\n", encoding="utf-8")
g = N.GH = CloudGH([])
assert N.retro_if_due(told.append, logs.append, hour=23, now=now, where="cloud") is False          # not there yet: nothing, no local claude
assert fc.calls == [] and told == []
g = N.GH = CloudGH([{"number": 310, "title": "Daily retro 2026-11-26", "body": BODY, "url": "https://github.com/x/y/issues/310"}])
assert N.retro_if_due(told.append, logs.append, hour=23, now=now + 30, where="cloud") is False      # checked at most every RELAY_MIN
assert N.retro_if_due(told.append, logs.append, hour=23, now=now + N.RELAY_MIN * 60, where="cloud") is True
assert fc.calls == [] and not [c for c in g.calls if c[:2] == ["issue", "create"]]                  # the cloud task made the issue
assert "## UPDATE\nWatch #210." in Path(R.CFG["inspector_handoff"]).read_text(encoding="utf-8")
assert [c for c in g.calls if c[:3] == ["api", "-X", "PUT"]], g.calls                                # orchestrator handoff PR (REST, deterministic)
assert len(told) == 1 and "NIGHTLY RETRO 2026-11-26" in told[0] and "issues/310" in told[0], told
assert N.retro_if_due(told.append, logs.append, hour=23, now=now + 3 * N.RELAY_MIN * 60, where="cloud") is False and len(told) == 1   # once a day
# no cloud retro by MISSING_H hours after retro_hour -> one note to the orchestrator that day
N.STATE = tmp / "nightly.cloud2.json"; N.GH = CloudGH([])
late = now                                                                                          # 23:05 = retro_hour 21 + MISSING_H
N.retro_if_due(told.append, logs.append, hour=23 - N.MISSING_H, now=late, where="cloud")
assert len(told) == 2 and "no 'Daily retro 2026-11-26'" in told[1] and "cloud-tasks.md" in told[1], told
N.retro_if_due(told.append, logs.append, hour=23 - N.MISSING_H, now=late + N.RELAY_MIN * 60, where="cloud"); assert len(told) == 2
import tomllib as _toml
assert _toml.loads((R.HERE / "config.toml").read_text(encoding="utf-8")).get("retro_where") == "cloud"
print("ok #289 cloud retro relay")

# ---- #525: no 'Daily retro <date>' 2 h after retro_hour -> the watchdog starts the retro prompt itself (a cloud job), once a day,
# until a trigger-made retro issue is seen. retro_hour 23 + 2 h = 01:00 the next day (the date is still the retro day) ----
N.STATE = tmp / "nightly.525.json"; N.GH = CloudGH([]); told = []; starts = []
N.LAUNCH = lambda n, task, cwd, name=None, model=None, desk=False: starts.append({"task": task, "name": name, "desk": desk}) or {"ok": True}
d26 = lambda h, m=5: time.mktime((2026, 11, 26, h, m, 0, 0, 0, -1))
N.retro_if_due(told.append, logs.append, hour=23, now=d26(23), where="cloud"); assert starts == [] and told == []
N.retro_if_due(told.append, logs.append, hour=23, now=d26(24, 30), where="cloud"); assert starts == []      # 00:35: < 2 h
N.retro_if_due(told.append, logs.append, hour=23, now=d26(25), where="cloud")                               # 01:05 on the 27th
assert len(starts) == 1 and starts[0]["name"] == "cloud-retro" and starts[0]["desk"] is True, starts
assert "Nightly retro" in starts[0]["task"] and "2026-11-26" in starts[0]["task"] and N.FALLBACK_MARK in starts[0]["task"]
assert len(told) == 1 and "no 'Daily retro 2026-11-26'" in told[0], told                                   # the note fires too now
N.retro_if_due(told.append, logs.append, hour=23, now=d26(26), where="cloud"); assert len(starts) == 1     # once a day
# the fallback's own issue (marker) is used for the handoffs but does not prove the trigger
FBODY = N.FALLBACK_MARK + "\n" + BODY
N.GH = CloudGH([{"number": 311, "title": "Daily retro 2026-11-26", "body": FBODY, "url": "u311"}])
assert N.retro_if_due(told.append, logs.append, hour=23, now=d26(26, 30), where="cloud") is True and not N.load_state().get("proven")
N.GH = CloudGH([])
N.retro_if_due(told.append, logs.append, hour=23, now=d26(49), where="cloud"); assert len(starts) == 2      # next night: again
N.GH = CloudGH([{"number": 312, "title": "Daily retro 2026-11-28", "body": BODY, "url": "u312"}])
N.retro_if_due(told.append, logs.append, hour=23, now=d26(71), where="cloud"); assert N.load_state().get("proven") is True
N.GH = CloudGH([])
N.retro_if_due(told.append, logs.append, hour=23, now=d26(97), where="cloud"); assert len(starts) == 2      # proven: off for good
print("ok #525 cloud retro fallback")

# ---- #641: once a day the watchdog archives yesterday's play events (tools/playlog.py day <yesterday>) on this PC ----
N.STATE = tmp / "nightly.641.json"; runs = []; logs = []
d27 = lambda h, m=5: time.mktime((2026, 11, 27, h, m, 0, 0, 0, -1))
rc_next = [1]
fake_run = lambda argv: runs.append(argv) or rc_next[0]
assert N.playlog_if_due(logs.append, now=d27(8), run=fake_run) == 1                       # network down: failed
assert runs[0][-2:] == ["day", "2026-11-26"] and runs[0][1].endswith("playlog.py"), runs
assert N.playlog_if_due(logs.append, now=d27(8, 30), run=fake_run) is None and len(runs) == 1   # retry at most once an hour
rc_next[0] = 0
assert N.playlog_if_due(logs.append, now=d27(9, 10), run=fake_run) == 0 and len(runs) == 2      # archived
assert N.playlog_if_due(logs.append, now=d27(23), run=fake_run) is None and len(runs) == 2      # once a day
assert N.playlog_if_due(logs.append, now=d27(24 + 2), run=fake_run) == 0 and runs[-1][-1] == "2026-11-27"   # next day: yesterday
assert any("archived" in l for l in logs), logs
print("ok #641 nightly playlog archive")
