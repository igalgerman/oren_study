"""#710 usage alarms: each rule fires once on fakes, repeats only after 3 h, nothing fires on an on-pace series.
Run: python3 tools/runner/test_usage_alarms.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
os.environ["OREN_TEST"] = "1"
import json, sys
import usage_alarms as U

T0 = 1_800_000_000; H = 3600
reset = T0 + 50 * H
# on pace: W 50, 50 h left, b 0.2, b0 0.1, 4 busy of 4 lanes, need 0.5/h; full speed (n_hi 4) = 50 + 0.9*50 = 95 >= 94, proj 95 < 100
def gv(**k): return {"week_pct": 50.0, "week_reset": reset, "need": 0.5, "n_hi": 4, "lanes": 4, "b": 0.2, "b0": 0.1, "mode": "week-only", **k}
def hist(rate, now=T0, hours=3.2, w=50.0):   # week-% per hour burn, samples every 20 min up to now (w = value at now)
    return [{"at": now - i * 1200, "week": w - rate * i / 3, "busy": 4} for i in range(int(hours * 3), -1, -1)]
names = lambda f: [r for r, _, _ in f]
ev = lambda g, busy=4, h=None, st=None, now=T0: U.evaluate(g, busy, h if h is not None else hist(0.5), now, st)

# nothing fires on an on-pace series (also over 6 h of ticks)
st = {}
for k in range(36):
    w = 50 + 0.9 * k / 6      # the week burns at b*4 + b0 = 0.9 %/h
    f, st = ev(gv(week_pct=w), st=st, now=T0 + k * 600, h=hist(0.9, T0 + k * 600, w=w))
    assert f == [], f

# UNDERUSE: full speed ends below 94 (n_hi 1: 50 + 0.3*50 = 65); text has the number and a fix
f, _ = ev(gv(n_hi=1)); assert names(f) == ["UNDERUSE"], f
assert "65%" in f[0][1] and "Fix:" in f[0][1], f[0][1]
# OVERUSE: 10 busy lanes -> 50 + 2.1*50 = 155
f, _ = ev(gv(), busy=10, h=hist(0.5)); assert "OVERUSE" in names(f) and "155%" in dict((r, t) for r, t, _ in f)["OVERUSE"]
# STALE
f, _ = ev(gv(stale_since=T0 - 600)); assert names(f) == ["STALE"] and "Fix:" in f[0][1], f
# PLAN CHANGED is info only, once at the change
f, st = ev(gv(mode="5h+week"), st={"mode": "week-only"}); assert names(f) == ["PLAN CHANGED"] and f[0][2] is True and st["mode"] == "5h+week"
f, st = ev(gv(mode="5h+week"), st=st); assert f == []
# IDLE: busy 2 of 4 with need > 0: nothing before 60 min, fires after
st = {}
f, st = ev(gv(), busy=2, st=st, now=T0); assert "IDLE" not in names(f)
f, st = ev(gv(), busy=2, st=st, now=T0 + 59 * 60); assert "IDLE" not in names(f)
f, st = ev(gv(), busy=2, st=st, now=T0 + 61 * 60); assert "IDLE" in names(f) and "2 of 4" in f[names(f).index("IDLE")][1]
f, st = ev(gv(), busy=4, st=st, now=T0 + 70 * 60); assert "idle_since" not in st      # lanes full again: the clock resets
# BEHIND: burn 0.1/h vs need 0.5 (< 50%)
f, _ = ev(gv(), h=hist(0.1)); assert "BEHIND" in names(f) and "0.10%/h" in dict((r, t) for r, t, _ in f)["BEHIND"], f
f, _ = ev(gv(), h=hist(0.1)[-3:]); assert "BEHIND" not in names(f)                     # too little data: no alarm
f, _ = ev(gv(), h=[{"at": T0 - 3 * H, "week": 90.0, "busy": 4}, {"at": T0, "week": 50.0, "busy": 4}]); assert "BEHIND" not in names(f)  # week reset: no alarm

# once per rule per 3 h
found = [("UNDERUSE", "x", False), ("PLAN CHANGED", "y", True)]
t1, sent = U.due(found, {}, T0); assert len(t1) == 2
t2, sent = U.due(found, sent, T0 + 2 * H); assert t2 == []
t3, sent = U.due(found, sent, T0 + 3 * H + 1); assert len(t3) == 2
assert U.active({"UNDERUSE": T0}, found, T0 + H) == ["UNDERUSE"]                      # info rules never show on the panel line
assert U.active({"UNDERUSE": T0}, found, T0 + 4 * H) == []

# tick end to end: files in, one send per rule, repeat only after 3 h, panel line + clear when quiet
R = U.RUNS; R.mkdir(exist_ok=True)
(R / "governor.json").write_text(json.dumps(gv(n_hi=1)), encoding="utf-8")
(R / "usage_hist.jsonl").write_text("".join(json.dumps(h) + "\n" for h in hist(0.5)), encoding="utf-8")
sent_msgs = []
snd = lambda x: sent_msgs.append(x)
def tk(now): return U.tick(tell=snd, send=snd, now=now, hist=hist(0.5, now))   # fresh samples every time
a = tk(T0); assert len(a) == 1 and len(sent_msgs) == 2 and a[0].startswith("UNDERUSE"), a
assert U.line() == " · ALARM: UNDERUSE", U.line()
assert tk(T0 + 2 * H) == []
assert len(tk(T0 + 3 * H + 5)) == 1
(R / "governor.json").write_text(json.dumps(gv(week_pct=53.0)), encoding="utf-8")
tk(T0 + 3 * H + 10); assert U.line() == "", U.line()
print("usage_alarms ok")
