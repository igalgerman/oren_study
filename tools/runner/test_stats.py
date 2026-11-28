"""#717 stats.py --models audit on a fixed event list. Run: python3 tools/runner/test_stats.py"""
import sys, os, tempfile; from pathlib import Path
os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-"); os.environ["OREN_TEST"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent))
import stats as S

D = 86400; NOW = 10 * D
def ev(n, event, ts, lane="pack", **x): return {"ts": ts, "issue": n, "lane": lane, "event": event, **x}
E = [
    ev(1, "start", 100, model="sonnet", effort="medium"), ev(1, "worker_done", 700), ev(1, "merged", 900, lines=40, files=2),   # clean
    ev(2, "start", 100, model="sonnet"), ev(2, "fix_done", 300), ev(2, "fix_done", 400), ev(2, "merged", 900),               # no effort -> medium; 2 FIX = UNDER
    ev(3, "start", 100, model="sonnet"), ev(3, "start", 200, model="opus", effort="high"), ev(3, "merged", 500),             # upgraded = UNDER
    ev(4, "start", 100, model="opus", effort="high"), ev(4, "worker_done", 160), ev(4, "merged", 300, lines=30, files=1),    # OVER
    ev(5, "start", 100, model="opus", effort="high"), ev(5, "merged", 300, lines=30, files=1),                              # OVER unless labelled
    ev(6, "start", 100, model="opus", effort="high"), ev(6, "merged", 300, lines=500, files=9),                             # big: not OVER
    ev(7, "start", 100, model="opus", effort="high"), ev(7, "fix_done", 150), ev(7, "merged", 300, lines=30, files=1),       # needed a fix: not OVER
]
d = {p["issue"]: p for p in S.models_data(E, {5: ["P2", "design"]}, NOW)}
assert d[2]["effort"] == "medium" and d[2]["under"] and not d[2]["first"]
assert d[3]["up"] and d[3]["under"]
assert not d[1]["under"] and not d[1]["over"] and d[1]["first"]
assert d[4]["over"] and not d[5]["over"] and not d[6]["over"] and not d[7]["over"]
assert d[1]["work"] == 600
u, o = S.models_lists(list(d.values()))
assert sorted(p["issue"] for p in u) == [2, 3] and [p["issue"] for p in o] == [4]
t = S.models_table(list(d.values()))
assert "sonnet/medium/pack" in t and "opus/high/pack" in t and "first-time" in t
assert "UNDER 2, OVER 1" in S.models_line(list(d.values()), NOW) and "no row to change" in S.models_line(list(d.values()), NOW)
# 3+ hits in one type in the week -> the row is named; hits older than a week do not count
E2 = E + [ev(8, "start", 100, model="sonnet"), ev(8, "fix_done", 150), ev(8, "fix_done", 160), ev(8, "merged", 300)]
assert "pack" in S.models_line(S.models_data(E2, {}, NOW), 3 * D).split(";")[1]
assert "no row" in S.models_line(S.models_data(E2, {}, NOW), NOW)
assert S.models_report([]).startswith("no runs yet")
print("test_stats ok")

# fix round: the runner records the PR size on merge, and the audit reads it (OVER must fire on that path)
import json
sys.argv.append("--dry-run")
import runner as R
files = [{"path": "tools/runner/a.py", "additions": 20, "deletions": 5}, {"path": "oren2/index.html", "additions": 900, "deletions": 3},
         {"path": "oren2/cf/public/index.html", "additions": 900, "deletions": 3}, {"path": "x.md", "additions": 1, "deletions": 0}]
assert R.pr_size(json.dumps({"files": files})) == {"lines": 26, "files": 2}      # built index.html copies left out
assert R.pr_size("garbage") == {} and R.pr_size("") == {"lines": 0, "files": 0}
R.stat(9, "pack", "start", model="opus", effort="high"); R.stat(9, "pack", "merged", **R.pr_size(json.dumps({"files": files})))
real = S.models_data(S.read_events(Path(os.environ["RUNNER_RUNS"]) / "stats.jsonl"), {})
assert real[0]["lines"] == 26 and real[0]["files"] == 2 and real[0]["over"]      # written by the runner, read back: OVER fires
# whole label names only: 'build' must not exempt an issue, 'ui' / 'security' do
E3 = [ev(1, "start", 1, model="opus", effort="high"), ev(1, "merged", 2, lines=5, files=1)]
assert S.models_data(E3, {1: ["build"]}, NOW)[0]["over"]
assert not S.models_data(E3, {1: ["ui"]}, NOW)[0]["over"] and not S.models_data(E3, {1: ["security"]}, NOW)[0]["over"]
print("test_stats fix round ok")
