"""#219 nightly retro + handoff + batch trigger with a fake claude and a fake gh. Run: python3 tools/runner/test_nightly.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
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
