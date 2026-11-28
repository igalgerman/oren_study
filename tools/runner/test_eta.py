"""#951 eta.py on a fake stats.jsonl. Run: python3 tools/runner/test_eta.py"""
import sys, os, json, tempfile; from pathlib import Path
os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-"); os.environ["OREN_TEST"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent))
import eta as T

H = 3600; NOW = 100 * H
def ev(n, event, ts, lane="pack", **x): return {"ts": ts, "issue": n, "lane": lane, "event": event, **x}
# 12 merged pack issues, each 2 h start->merge, one merge every 30 min in the last 6 h (= 2 merges/h)
E = []
for i in range(12):
    m = NOW - i * H // 2 - 60
    E += [ev(i + 1, "start", m - 2 * H), ev(i + 1, "merged", m)]
E += [ev(50, "start", NOW - 10 * H, lane="core"), ev(50, "merged", NOW - 7 * H, lane="core")]      # core cycle 3 h, outside the 6 h window
def iss(n, labels, body="", state="open"): return {"number": n, "state": state, "labels": labels, "body": body}
I = {i["number"]: i for i in [
    iss(10, ["ready-for-agent", "pack", "P1"]), iss(11, ["ready-for-agent", "pack", "P1"]), iss(12, ["ready-for-agent", "pack", "P3"]),
    iss(20, ["ready-for-agent", "pack", "P2"], "Blocked by: #10, #30"), iss(30, ["ready-for-agent", "pack", "P2"], "Blocked by: #31"),
    iss(31, ["pack"], state="closed"), iss(40, ["ready-for-agent", "core", "P2"]),
    iss(60, ["ready-for-human", "pack", "P2", "owner-merge"]),
]}

assert abs(T.merges_per_hour(E, NOW) - 2.0) < 1e-9
assert T.cycle_time(E, I, "pack", NOW) == 2 * H                                  # median of the pack ones
assert T.cycle_time(E, I, "core", NOW) == 3 * H
assert T.cycle_time([], I, "pack", NOW) is None
assert T.chain(20, I) == [10, 30]                                                  # open blockers only (31 is closed)

r = T.eta(10, I, E, NOW)           # P1: one other P1 ahead (11); P3 does not count
assert r["ahead"] == 1 and r["chain"] == 0 and r["cycle"] == 2 * H and r["per_hour"] == 2.0
assert r["ts"] == NOW + int(0.5 * H) + 2 * H, r                                    # 1/2 per h + 1 own cycle
r = T.eta(20, I, E, NOW)           # P2: 11 ahead; 10 and 30 are its chain (not 'ahead'); 40 is core, 12 is P3
assert r["ahead"] == 1 and r["chain"] == 2
assert r["ts"] == NOW + int(0.5 * H) + 3 * 2 * H, r
r = T.eta(40, I, E, NOW); assert r["kind"] == "core" and r["cycle"] == 3 * H
r = T.eta(60, I, E, NOW); assert any("owner" in w for w in r["waits"]), r
txt = T.format_eta(T.eta(10, I, E, NOW), NOW)
assert "#10" in txt and "1 ahead" in txt and "2.0 merges/h" in txt and "cycle" in txt, txt
assert "closed" in T.format_eta(T.eta(31, I, E, NOW), NOW)
# no data -> says so, never a made-up time
r = T.eta(10, I, [], NOW); assert r["ts"] is None and "no data" in T.format_eta(r, NOW)

# log + hit/miss
log = Path(tempfile.mkdtemp()) / "eta.jsonl"
T.log_eta(T.eta(10, I, E, NOW), NOW, log)
assert json.loads(log.read_text().splitlines()[0])["issue"] == 10
E2 = E + [ev(10, "merged", NOW + 2 * H)]
assert T.hit_miss(T.read_log(log), E2, NOW) == (1, 0, 0)                                # merged before the ETA: hit
E3 = E + [ev(10, "merged", NOW + 9 * H)]
assert T.hit_miss(T.read_log(log), E3, NOW) == (0, 1, 0)                                # late: miss
assert T.hit_miss(T.read_log(log), E, NOW) == (0, 0, 1)                                 # not merged yet: pending
print("test_eta OK")
