"""#390: no multi-line prompt on a command line. cmd.exe (claude.CMD) cuts an argv at the first newline, so a window got
only line 1 of its prompt. Every launcher (worker/reviewer windows, question windows, intake, control windows, cloud starts)
must hand claude ONE line: a long prompt goes to .runs/prompts/<name>.md + 'Read <path> and follow it exactly.'
Run: python3 tools/runner/test_oneline.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
os.environ["OREN_TEST"] = "1"
import json, sys
from pathlib import Path
sys.argv.append("--dry-run"); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import runner as R
import qwin as QW
import owner_q as OQ
import watchdog as W
import recover as RC
import remote as RM

def single(cmd):
    bad = [a for a in cmd if isinstance(a, str) and ("\n" in a or "\r" in a)]
    assert not bad, f"multi-line argv: {bad[0][:120]!r}"

# ---- the helper: one line stays as it is; several lines -> a prompt file + one line pointing at it ----
assert R.argv_prompt("x", "one line") == "one line"
line = R.argv_prompt("question-ab", "line 1\nline 2\r\nline 3")
assert "\n" not in line and line.startswith("Read ") and line.endswith("and follow it exactly."), line
p = R.RUNS / "prompts" / "question-ab.md"
assert p.as_posix() in line and p.read_bytes() == "line 1\nline 2\r\nline 3".encode()
assert R.one_line("a\n  b\r\nc") == "a b c"
print("ok helper")

# ---- worker / reviewer window (runner.agent) ----
ran = []
R.USE_HERDR, R.live = True, lambda name: False
R.run = lambda cmd, **k: (ran.append(cmd), (1, "stop here"))[1]
try: R.agent("issue-9", "multi\nline\nprompt", ".", ["Bash"], str(Path(tempfile.mkdtemp()) / "l.log"), "RESULT:", 9, "worker")
except R.Blocked: pass
cmd = next(c for c in ran if "run" in c and "--bg" in c)
assert "issue-9.md" in cmd[-1], cmd
single(cmd)
assert "multi\nline\nprompt" in (R.RUNS / "prompts" / "issue-9.md").read_text(encoding="utf-8")
print("ok agent")

# ---- question window (qwin.open_window): one line, NOT pinned (#390: a pinned window counts as 'active', push suppressed) ----
calls, pins = [], []
QW._hc = lambda *a, **k: (calls.append(a), (0, json.dumps({"address": "w1"}) if a[0] == "get" else "ok"))[1]
QW._run = lambda cmd, **k: (pins.append(cmd), (0, ""))[1]
QW._herdr_ok, QW.space_args = lambda: True, lambda: []
q = {"key": "c984ed", "window": "#205", "source": "issue-205", "text": "לבחור? 1. כן 2. לא"}
assert QW.open_window(q, "question-c984ed")
run_cmd = next(a for a in calls if a[0] == "run")
single(run_cmd)
body = (R.RUNS / "prompts" / "question-c984ed.md").read_text(encoding="utf-8")
assert "PushNotification" in body and "qwin.py answer c984ed" in body, body
assert not [c for c in pins if "terminal.pin" in c and c[-1] == "true"], pins
print("ok question window")

# ---- intake window (watchdog.check_intake) ----
runs = []
W.R.gh = lambda *a, **k: (0, '[{"number":3,"title":"t3","labels":[{"name":"needs-info"}],"createdAt":"2026-11-03"}]')
W.R.run = lambda cmd, **k: (runs.append(cmd), (0, ""))[1]
W.R.space_args = lambda: []
W.tell = W.log = lambda m: None
W.check_intake([])
assert runs; single(runs[0])
print("ok intake")

# ---- control windows (recover) ----
for name in RC.CONTROL:
    single(RC.hc_run_args(name, *RC.control_argv(name, "C:/m", "C:/m/p")))
print("ok control windows")

# ---- cloud start (remote.start): the PC file is not on the cloud, so the task is joined into one line ----
got = []
RM.start(7, "Do this.\nThen that.\n", ".", run=lambda a, **k: (got.append(a), (0, "Created cloud session https://claude.ai/code/session_ab"))[1])
start_cmd = next(a for a in got if "--bg" in a)
single(start_cmd)
assert start_cmd[-1] == "Do this. Then that.", start_cmd[-1]
print("ok remote start")

# ---- a push Claude Code did not send ('Not sent because you're active') is logged in watchdog.log, once ----
logged = []
QW.log = logged.append
st = {"c984ed": {"name": "question-c984ed", "window": True, "since": 0}}
QW._hc = lambda *a, **k: (0, "PushNotification\n  Not sent because you're active in this terminal.") if a[0] == "read" else (0, "")
QW.check_not_sent(st); QW.check_not_sent(st)
assert len(logged) == 1 and "not sent" in logged[0].lower() and "question-c984ed" in logged[0], logged
assert st["c984ed"]["not_sent"]
QW._hc = lambda *a, **k: (0, "Sent.")
st2 = {"k": {"name": "question-k", "window": True, "since": 0}}; QW.check_not_sent(st2)
assert len(logged) == 1 and not st2["k"].get("not_sent")
print("ok not sent logged")
print("ok oneline")
