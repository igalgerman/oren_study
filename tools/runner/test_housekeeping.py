"""#304 housekeeping: nightly prune of .runs/<n> for closed issues; network errors in watchdog ticks retry and alarm only
after 3 in a row. Run: python3 tools/runner/test_housekeeping.py"""
import os, tempfile; os.environ["OREN_TEST"] = "1"; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
import json, sys, time
from pathlib import Path
sys.argv.append("--dry-run")
import runner as R
import nightly as N
import watchdog as W

NOW = 1_800_000_000.0
iso = lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))

# ---- 1. prune: pure choice ----
closed = {5: NOW - 25 * 3600, 6: NOW - 23 * 3600}
assert N.prunable(["5", "6", "7", "stats.jsonl", "abc"], closed, NOW) == [5], "only closed > 24 h, only number dirs"
assert N.prunable(["5"], closed, NOW, hours=26) == []

# ---- 1b. prune_if_due: deletes the dirs, keeps stats and open-issue dirs, once a day ----
runs = R.RUNS
for n in (5, 6, 7): (runs / str(n)).mkdir(parents=True, exist_ok=True); (runs / str(n) / "worker.log").write_text("x")
(runs / "stats.jsonl").write_text('{"ts": 1}\n')
N.STATE = runs / "nightly.state.json"
calls = []
def fake_gh(argv, **kw):
    calls.append(argv[1:])
    return 0, json.dumps([{"number": 5, "closedAt": iso(NOW - 30 * 3600)}, {"number": 6, "closedAt": iso(NOW - 3600)}])
N.GH = fake_gh
logs = []
assert N.prune_if_due(logs.append, now=NOW) == [5]
assert not (runs / "5").exists() and (runs / "6").exists() and (runs / "7").exists()
assert (runs / "stats.jsonl").read_text() == '{"ts": 1}\n', "stats kept"
assert any("pruned" in l and "#5" in l for l in logs), logs
assert calls and calls[0][:2] == ["issue", "list"] and "closed" in calls[0]
assert N.prune_if_due(logs.append, now=NOW + 60) is None, "once a day"
assert len(calls) == 1
# gh fails -> nothing deleted, retried later the same day
N.save_state({}); N.GH = lambda argv, **kw: (1, "Could not resolve host: github.com")
assert N.prune_if_due(logs.append, now=NOW) is None and (runs / "6").exists()
assert N.load_state().get("prune_day") is None

# ---- 2. network streak: pure ----
st = {}
assert W.is_net_error("sync failed: fetch rc 128 fatal: unable to access 'https://github.com/x/': Could not resolve host: github.com")
assert W.is_net_error("error: TimeoutExpired(['claude.CMD'], 600)")
assert not W.is_net_error("sync skipped (2 behind): main checkout has uncommitted changes")
assert [W.net_streak(st, "sync", "Could not resolve host: github.com") for _ in range(4)] == [(1, False), (2, False), (3, True), (4, False)]
assert W.net_streak(st, "sync", "main checkout fast-forwarded (1 commits)") == (0, False) and st["sync"] == 0

# ---- 2b. sync_tick: network error -> silent, retried next tick; 3rd in a row -> log + tell the orchestrator ----
msgs, told, logged = ["sync failed: fetch rc 128 Could not resolve host: github.com"] * 3 + ["main checkout fast-forwarded (2 commits)"], [], []
R.sync_main = lambda log=None, info=None: msgs.pop(0)
W.tell, W.log = told.append, logged.append
W._sync.update(last=0.0, msg=""); W._net.clear()
W.sync_tick(); W.sync_tick()
assert not logged and not told, (logged, told)
assert W._sync["last"] == 0.0, "network error: retry on the next tick, not after sync_minutes"
W.sync_tick()
assert len(told) == 1 and "3 in a row" in told[0] and "resolve host" in told[0], told
assert any("3 in a row" in l for l in logged), logged
W.sync_tick()
assert logged[-1] == "main checkout fast-forwarded (2 commits)" and W._net["sync"] == 0

# ---- 2c. loop: a network/timeout exception in a tick is logged only on the 3rd in a row ----
told.clear(); logged.clear(); W._net.clear()
def boom(): raise __import__("subprocess").TimeoutExpired(["claude.CMD"], 600)
W.tick = boom
for _ in range(2): W.loop(once=True)
assert not any("TimeoutExpired" in l for l in logged) and not told, (logged, told)
W.loop(once=True)
assert any("TimeoutExpired" in l and "3 in a row" in l for l in logged) and len(told) == 1, (logged, told)
W.tick = lambda: None; W.loop(once=True)
assert W._net["tick"] == 0, "a clean tick resets the streak"
def other(): raise ValueError("bad")
W.tick = other; W.loop(once=True)
assert any("ValueError" in l for l in logged), "other errors are still logged at once"
print("test_housekeeping: ok")

# ---- #492: every tick removes finished run/issue/review/resolve/question terminals 5+ min after they finished ----
T5 = lambda name, state, addr: {"name": name, "state": state, "address": addr}
seen = {}
ts = [T5("run-5", "finished", "a1"), T5("run-pass-77", "exited", "a2"), T5("issue-6", "finished", "a3"),
      T5("review-7", "finished", "a4"), T5("resolve-8", "finished", "a5"), T5("question-9", "finished", "a6"),
      T5("run-10", "live", "a7"), T5("orchestrator", "finished", "a8"), T5("inbox", "finished", "a9"),
      T5("watchdog", "finished", "a10"), T5("intake-3", "finished", "a11"), {"name": "run-11", "state": "finished"}]
assert W.finished_old(ts, seen, NOW) == [], "just seen finished: kept (clock starts now)"
assert W.finished_old(ts, seen, NOW + 299) == [], "under 5 min: kept"
assert W.finished_old(ts, seen, NOW + 301) == [("run-5", "a1"), ("run-pass-77", "a2"), ("issue-6", "a3"), ("review-7", "a4"),
                                               ("resolve-8", "a5"), ("question-9", "a6")], "finished 5+ min: removed by address; live/control/no address kept"
assert W.finished_old([T5("run-5", "live", "a1")], seen, NOW + 400) == [] and "a1" not in seen, "live again: forgotten"
# the tick: rm by address, one log line with the count, none when 0
rm, lines = [], []
seen2 = {"a1": NOW - 600, "a7": NOW - 600}
assert W.sweep_tick([T5("run-5", "finished", "a1"), T5("run-5", "live", "a7")], now=NOW, seen=seen2,
                    hc=lambda *a, **k: (rm.append(a), (0, ""))[1], say=lines.append) == 1
assert rm == [("rm", "a1")], f"rm by address only, never the live twin: {rm}"
assert len(lines) == 1 and "1" in lines[0], lines
assert W.sweep_tick([T5("run-10", "live", "a7")], now=NOW, seen=seen2, hc=lambda *a, **k: (rm.append(a), (0, ""))[1], say=lines.append) == 0
assert len(lines) == 1, "no log line when nothing was removed"
print("ok sweep (#492)")
