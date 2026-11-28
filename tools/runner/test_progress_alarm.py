"""#891 no-progress alarm: fake clock, fake cache, fake Telegram. Run: python3 tools/runner/test_progress_alarm.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
os.environ["OREN_TEST"] = "1"
import time
import progress_alarm as P

T0 = 1_800_000_000; M = 60
ts = lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))
def cache(prog=None, now=T0):
    c = {"ts": now, "prs": [], "closed": [], "open": [], "lanes": {}}
    if prog is not None: c["closed"] = [{"number": 1, "closedAt": ts(prog)}]
    return c
class Fake:
    def __init__(s): s.tg, s.hc, s.runs = [], [], tempfile.mkdtemp(prefix="pa-")
    def go(s, now, c, ready=3, busy=2, sig=None, ev=(), hour=12):
        return P.tick(now, c, ev, ready, busy, lambda: sig or {"beat_age_s": 10}, s.tg.append, s.hc.append, log=lambda m: None, runs=s.runs, hour=hour)
def at(f, mins, last_prog_min=0, **k):          # progress last happened at T0+last_prog_min
    now = T0 + mins * M
    return f.go(now, cache(T0 + last_prog_min * M, now), **k)

# 59 min quiet -> none; 61 -> one message (Hebrew, with the cause), also one hc send; no issue titles
f = Fake(); at(f, 0)
assert at(f, 59) is None and not f.tg
m = at(f, 61)
assert m and f.tg == [m] and f.hc == [m], (m, f.tg, f.hc)
assert "אין התקדמות 60 דקות: 3 משימות מוכנות, 2 פעילות. בדוק את המחשב." in m and "סיבה" in m, m
assert "NEEDS-ATTENTION: no progress" in P._load(f.runs)["text"]
# again within 3 h -> none; reminder at 6 h; again after the reminder within 6 h -> none
assert at(f, 61 + 170) is None and len(f.tg) == 1
r = at(f, 61 + 6 * 60)
assert r and r.startswith("תזכורת") and len(f.tg) == 2
assert P.count(f.runs, T0 + (61 + 361) * M) == 2   # the night report counts alarms + reminders
assert at(f, 61 + 7 * 60) is None
# the state survives a restart (same state dir, fresh calls)
assert at(f, 61 + 8 * 60) is None and len(f.tg) == 2
# recovery -> exactly one message, the alarm line is gone, no new alarm right after
rec = f.go(T0 + 600 * M, cache(T0 + 599 * M, T0 + 600 * M))
assert rec == "חזר לעבוד" and len(f.tg) == 3 and P._load(f.runs)["text"] == ""
assert f.go(T0 + 601 * M, cache(T0 + 599 * M, T0 + 601 * M)) is None

# a merge at 30 min resets the clock: nothing at 61, alarm only 60 min after the merge
f = Fake(); at(f, 0)
assert at(f, 61, last_prog_min=30) is None
assert at(f, 91, last_prog_min=30) is not None

# no startable issue -> never an alarm (nothing to do is not stuck)
f = Fake(); at(f, 0, ready=0); assert at(f, 300, ready=0) is None and not f.tg
# quiet hours skip
P.QUIET = "23-7"
f = Fake(); at(f, 0, hour=3); assert at(f, 120, hour=3) is None and not f.tg
assert at(f, 121, hour=12) is not None
P.QUIET = ""
assert P.quiet_now("23-7", 3) and P.quiet_now("23-7", 23) and not P.quiet_now("23-7", 12) and not P.quiet_now("", 3)
st = {"since": T0}
assert P.decide(T0 + 7200, 0, 2, st, 60, quiet=True)[0] == "no"
# a stale cache gives no verdict
f = Fake(); at(f, 0); assert f.go(T0 + 300 * M, cache(T0, T0 + 100 * M)) is None

# causes: governor STOP names the quota; stale beat -> watchdog; the rest in order
f = Fake(); at(f, 0)
at(f, 61, sig={"beat_age_s": 10, "stop": True}); assert P.CAUSES["quota"] in f.tg[0]
f = Fake(); at(f, 0)
at(f, 61, sig={"beat_age_s": 400, "stop": True}); assert P.CAUSES["watchdog"] in f.tg[0]
c = P.cause
ok = {"beat_age_s": 1}
assert c({}) == "watchdog" and c(ok) == "unknown"
assert c({**ok, "frozen": True}) == "frozen" and c({**ok, "control_bad": True, "main_red": True}) == "control"
assert c({**ok, "main_red": True, "lock_min": 30}) == "ci" and c({**ok, "lock_min": 30, "budget_pct": 5}) == "lock"
assert c({**ok, "lock_min": 20}) == "unknown" and c({**ok, "budget_pct": 19, "all_busy": True}) == "github"
assert c({**ok, "all_busy": True}) == "lanes"

# progress sources: merged / opened PR, PR commit, lane branch, closed issue, RESULT / VERDICT comment, start event
base = {"prs": [], "closed": [], "open": [], "lanes": {}}
assert P.last_progress(base) == 0
assert P.last_progress({**base, "prs": [{"mergedAt": ts(T0)}]}) == T0
assert P.last_progress({**base, "prs": [{"createdAt": ts(T0 + 5), "commits": [{"committedDate": ts(T0 + 9)}]}]}) == T0 + 9
assert P.last_progress({**base, "lanes": {"891": ts(T0 + 3)}}) == T0 + 3
assert P.last_progress({**base, "open": [{"comments": [{"body": "chat", "createdAt": ts(T0 + 50)}, {"body": "RESULT: DONE x", "createdAt": ts(T0 + 20)}]}]}) == T0 + 20
assert P.last_progress({**base, "prs": [{"comments": [{"body": "VERDICT: GREEN", "createdAt": ts(T0 + 7)}]}]}) == T0 + 7
assert P.last_progress(base, [{"event": "start", "ts": T0 + 11}, {"event": "merged", "ts": T0 + 99}]) == T0 + 11
print("ok")
