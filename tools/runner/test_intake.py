"""Owner lane: the watchdog opens ONE intake-<n> window for the oldest needs-triage/needs-info issue. Run: python3 tools/runner/test_intake.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
import os, sys
sys.argv.append("--dry-run"); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import watchdog as W

def I(n, labels, t): return {"number": n, "title": f"t{n}", "labels": labels, "createdAt": t}
issues = [I(5, ["needs-triage"], "2026-11-05"), I(3, ["needs-info"], "2026-11-03"), I(2, ["ready-for-agent"], "2026-11-01"), I(4, ["needs-triage"], "2026-11-04")]
# oldest needs-triage / needs-info, not other labels
assert W.pick_intake(issues, [])["number"] == 3
# never a second window: any live intake-* blocks it
assert W.pick_intake(issues, [{"name": "intake-3", "state": "live"}]) is None
# a finished intake window does not block
assert W.pick_intake(issues, [{"name": "intake-3", "state": "finished"}])["number"] == 3
assert W.pick_intake([I(2, ["ready-for-agent"], "2026-11-01")], []) is None

# check_intake starts exactly one window, and tells the orchestrator once
runs, told = [], []
W.R.gh = lambda *a, **k: (0, '[{"number":3,"title":"t3","labels":[{"name":"needs-info"}],"createdAt":"2026-11-03"},{"number":4,"title":"t4","labels":[{"name":"needs-triage"}],"createdAt":"2026-11-04"}]')
W.R.run = lambda cmd, **k: (runs.append(cmd), (0, ""))[1]
W.R.space_args = lambda: ["--label", "herdr.space=sp1"]
W.tell = lambda t: told.append(t)
W.log = lambda m: None
W.check_intake([])
assert len(runs) == 1, runs
c = runs[0]
assert c[c.index("--name") + 1] == "intake-3" and "--outlive-parent" in c and "herdr.space=sp1" in c, c
assert "/grill-me" in c[-1] and "#3" in c[-1] and "/to-tickets" in c[-1], c[-1]
assert "## Acceptance" in c[-1] and "{n}" not in c[-1], c[-1]          # #186: the intake writes the Acceptance section
assert told == ["NEEDS YOU: intake-3 is open"], told
W.check_intake([{"name": "intake-3", "state": "live"}])
assert len(runs) == 1
print("ok intake")
