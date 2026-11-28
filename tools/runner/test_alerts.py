"""#844 watchdog alerts: dedupe with a count, routing orchestrator -> tell, down/frozen -> Telegram (+ inspector), night line.
Run: python3 tools/runner/test_alerts.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
os.environ["OREN_TEST"] = "1"
from pathlib import Path
import alerts as A

T0 = 1_800_000_000; M = 60
P = Path(tempfile.mkdtemp()) / "alerts.json"

class Fake:
    def __init__(s, tell_rc=0): s.told, s.ins, s.tg, s.tell_rc = [], [], [], tell_rc
    def tell(s, t): s.told.append(t); return s.tell_rc
    def inspector(s, t): s.ins.append(t); return 0
    def telegram(s, t, silent=False): s.tg.append((t, silent)); return 1
def go(f, rule, subj, now, orch="live", health=None, ins="live", info=False, text="STUCK run-3 blah"):
    return A.raise_alarm(rule, subj, text, info, now=now, path=P, orch_state=orch, health=health or {}, tell=f.tell,
                         inspector=f.inspector, telegram=f.telegram, inspector_state=ins)

# 10 identical STUCK in 1 hour -> 1 tell; a different subject has its own message
f = Fake()
for k in range(10): go(f, "STUCK", "run-3", T0 + k * 6 * M)
assert len(f.told) == 1 and f.tg == [], (f.told, f.tg)
go(f, "STUCK", "run-4", T0 + 61 * M); assert len(f.told) == 2
# after 180 min the next one carries the count and the time of the first held-back one
go(f, "STUCK", "run-3", T0 + 181 * M)
assert len(f.told) == 3 and " x10 since " in f.told[-1], f.told[-1]
go(f, "STUCK", "run-3", T0 + 400 * M); assert f.told[-1].endswith("blah"), f.told[-1]       # one repeat only: no count

# orchestrator down -> exactly 1 Telegram (Hebrew, rule + subject only), the inspector too, nothing else; repeats suppressed
f = Fake()
for k in range(5): go(f, "STUCK", "run-9", T0 + k * M, orch="gone", text="STUCK Secret issue title here")
assert f.told == [] and len(f.tg) == 1 and len(f.ins) == 1, (f.told, f.tg, f.ins)
t, silent = f.tg[0]
assert "התראה" in t and "STUCK" in t and "run-9" in t and "Secret" not in t and silent is False, t
# info level -> silent
f = Fake(); go(f, "PLAN-CHANGED", "", T0, orch="gone", info=True); assert f.tg[0][1] is True
# Telegram carries the count on the next window
f = Fake()
for k in range(4): go(f, "IDLE", "lanes", T0 + k * 100 * M, orch="gone", ins="gone")
assert len(f.tg) == 2 and "×" in f.tg[1][0] and f.ins == [], f.tg
# the alarm stays in NEEDS-ATTENTION while its window is open, then goes
assert A.attention(T0 + 200 * M, P) == ["IDLE lanes"] and A.lines(T0 + 200 * M, P)[0].startswith("NEEDS-ATTENTION")
assert A.attention(T0 + 400 * M + 181 * M, P) == []

# orchestrator state 'frozen' in the health file -> 1 Telegram, 0 tell (also error, approval; both shapes of the file)
for h in ({"orchestrator": "frozen"}, {"orchestrator": {"state": "error"}}, {"orchestrator": {"state": "approval"}}):
    f = Fake(); go(f, "STUCK", "x" + str(len(str(h))), T0, health=h); assert f.told == [] and len(f.tg) == 1, (h, f.told, f.tg)
f = Fake(); go(f, "STUCK", "ok", T0, health={"orchestrator": {"state": "ok"}}); assert len(f.told) == 1 and f.tg == []

# orchestrator and inspector both down -> 1 Telegram, no tell, no inspector send
f = Fake(); go(f, "STUCK", "both", T0, orch="gone", ins="gone"); assert f.told == [] and f.ins == [] and len(f.tg) == 1
# live but `hc send` fails (rc != 0) -> not reachable: Telegram
f = Fake(tell_rc=1); assert go(f, "STUCK", "rc", T0) == "fallback" and len(f.tg) == 1

# subject sanitising: no spaces / titles leak into Telegram
assert A.clean("run 12: Hello World!") == "run-12:-Hello-World"[:30].replace("!", "") and " " not in A.clean("a b")

# night line: one count per rule, reset after
line = A.night_line(P)
assert line.startswith("ALARMS") and "STUCK" in line and "IDLE 4" in line, line
assert A.night_line(P) == "ALARMS (since last report): none"

# usage alarms move onto the same function (rules unchanged: still once per rule per 3 h in due())
import usage_alarms as U
seen = []
gv = {"week_pct": 50.0, "week_reset": T0 + 50 * 3600, "need": 0.5, "n_hi": 1, "lanes": 4, "b": 0.2, "b0": 0.1, "mode": "week-only"}
(Path(os.environ["RUNNER_RUNS"]) / "governor.json").write_text(__import__("json").dumps(gv))
U.tick(tell=lambda t: seen.append(("tell", t)), now=T0, hist=[], busy=4, send=lambda t: seen.append(("tg", t)),
       alarm=lambda r, s, t, info=False: seen.append((r, t)))
assert seen and all(k == "USAGE-UNDERUSE" for k, _ in seen), seen
# ---- the watchdog wiring (reviewer #945): W.alarm, sync_tick, WAITING ----
import time, watchdog as W, mainsync
A.state_of = lambda n: "live"; A.R.RUNS = Path(tempfile.mkdtemp(prefix="runs-w-"))
told = []; W.tell = lambda t: (told.append(t), 0)[1]; W.log = lambda m: None
# sync_tick: the SYNC alarm reaches the orchestrator (no NameError from a shadowed `alarm`)
W._sync.update(last=0.0, msg=""); W.R.sync_main = lambda info=None: ""
mainsync.deliver_tick = lambda log: None
mainsync.after_sync = lambda info, now, say, log: say("MAINSYNC behind 12 min")
W.sync_tick(); assert told == ["MAINSYNC behind 12 min"], told
# WAITING: two DIFFERENT questions from one window both arrive; the same screen again does not
told.clear(); W.OQ.post = lambda *a, **k: ""; W.pin = lambda t, on: None
scr = {"v": "x\n● QUESTION: first?\n"}; W.screen_text = lambda n: scr["v"]; W.told.clear()
ts = [{"name": "issue-5", "status": "idle", "state": "live"}]
W.check_windows(ts); W.check_windows(ts); assert len(told) == 1, told
scr["v"] = "x\n● QUESTION: second?\n"; W.check_windows(ts); assert len(told) == 2 and "second?" in told[1], told
print("test_alerts: ok")
