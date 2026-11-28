"""#890 control-session heartbeat: fake hc, fake clock, fake Telegram, fake screens. Run: python3 tools/runner/test_control_health.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
os.environ["OREN_TEST"] = "1"
import json
import control_health as C

M, H = 60, 3600
T0 = 1_800_000_000

class Fake:
    def __init__(s):
        s.state, s.sms, s.screen, s.tg_out, s.notes, s.reads, s.sent_keys = "working", 1, "", [], [], 0, 0
        s.tg_on = True
    def get(s, addr): return {"status": {"state": s.state}, "status_ms": s.sms}
    def read(s, addr, n): s.reads += 1; return s.screen
    def tell(s, role, text): s.notes.append((role, text))
    def tg(s, text):
        if not s.tg_on: return 0
        s.tg_out.append(text); return 1
    def log(s, m): pass

def io_of(f): return C.IO(get=f.get, read=f.read, tell=f.tell, tg=f.tg, log=f.log)
ROW = lambda name=None, labels=None: {"address": "t1", "state": "live", "name": name, "labels": labels or {}}
LIMIT = "work work\n● done\n5-hour limit reached ∙ resets 3pm\n"

def run(f, ts, mins, st, start=0, every=1, cfg=None):
    for m in range(start, mins + 1, every): C.tick(ts, io_of(f), T0 + m * M, cfg or {}, st)

# usage-limit screen -> 1 Telegram (Hebrew, no screen text) + 1 inspector note with the last lines
f, st = Fake(), {}; f.state, f.screen = "idle", LIMIT
ts = [ROW("orchestrator")]
run(f, ts, 5, st)
assert len(f.tg_out) == 1 and "orchestrator" in f.tg_out[0] and "המנהל" in f.tg_out[0], f.tg_out
assert "limit reached" not in f.tg_out[0]
assert [r for r, _ in f.notes] == ["inspector"] and "limit reached" in f.notes[0][1] and "error" in f.notes[0][1], f.notes
# same again within 59 min -> nothing; at 3 h -> reminder x2
run(f, ts, 59, st, start=6, every=1); assert len(f.tg_out) == 1, f.tg_out
run(f, ts, 179, st, start=60, every=5); assert len(f.tg_out) == 1
run(f, ts, 181, st, start=180, every=1); assert len(f.tg_out) == 2 and "x2" in f.tg_out[1], f.tg_out
# state is a file: a "restarted watchdog" (fresh dict from disk) sends nothing more
C.save(st); st2 = C.load(); run(f, ts, 190, st2, start=182); assert len(f.tg_out) == 2
# recovery -> one message
f.state, f.screen = "working", "all good\n"; f.sms = 2
run(f, ts, 195, st2, start=191); run(f, ts, 200, st2, start=196)
assert len(f.tg_out) == 3 and "חזר לעבוד" in f.tg_out[2], f.tg_out

# flapping: error, recovered, error again -> nothing at +10 min, one message at +60 min of the last send
f, st = Fake(), {}; f.state, f.screen = "idle", LIMIT
run(f, ts, 1, st); assert len(f.tg_out) == 1
f.state, f.screen, f.sms = "working", "ok\n", 5; run(f, ts, 3, st, start=2); assert len(f.tg_out) == 2    # recovery message
f.state, f.screen, f.sms = "idle", LIMIT, 6; run(f, ts, 10, st, start=4); assert len(f.tg_out) == 2, f.tg_out
run(f, ts, 59, st, start=11); assert len(f.tg_out) == 2
run(f, ts, 62, st, start=60); assert len(f.tg_out) == 3 and "x" not in f.tg_out[2].split("(")[-1][:1], f.tg_out

# the stuck role is the inspector (nameless, found by label) -> the note goes to the orchestrator
f, st = Fake(), {}; f.state, f.screen = "idle", "Usage limit reached\n"
run(f, [ROW(None, {"name": "inspector"})], 2, st)
assert len(f.tg_out) == 1 and "inspector" in f.tg_out[0] and [r for r, _ in f.notes] == ["orchestrator"], (f.tg_out, f.notes)

# blocked 4 min -> approval; not before 3 min; trust-folder dialog does not count
f, st = Fake(), {}; f.state, f.screen = "blocked", "Do you want to proceed?\n 1. Yes\n 2. No\n"
run(f, ts, 2, st); assert f.tg_out == []
run(f, ts, 4, st, start=3); assert len(f.tg_out) == 1 and "approval" in f.notes[0][1], f.notes
f, st = Fake(), {}; f.state, f.screen = "blocked", "Do you trust this folder?\n 1. Yes\n"
run(f, ts, 10, st); assert f.tg_out == []

# working with a moving screen 60 min -> nothing; same for the owner typing
f, st = Fake(), {}
for m in range(0, 61):
    f.screen = f"line {m}\n"; C.tick(ts, io_of(f), T0 + m * M, {}, st)
assert f.tg_out == [] and f.notes == []
# working, still screen 31 min -> frozen (and not at 29)
f, st = Fake(), {}; f.screen = "thinking...\n"
run(f, ts, 29, st); assert f.tg_out == []
run(f, ts, 31, st, start=30); assert len(f.tg_out) == 1 and "frozen" in f.notes[0][1], (f.tg_out, f.notes)
# done / idle with nothing to do is healthy and a working session is not read early
f, st = Fake(), {}; f.state, f.screen = "done", "ready\n"; run(f, ts, 90, st); assert f.tg_out == [] and f.reads == 0
f, st = Fake(), {}; f.state, f.screen = "idle", "ready\n"; run(f, ts, 90, st); assert f.tg_out == []
f, st = Fake(), {}; run(f, ts, 1, st); assert f.reads == 0

# the owner typing in an error screen: screen changed in the last 2 min -> no message yet
f, st = Fake(), {}; f.state, f.screen = "idle", "ready\n"; C.tick(ts, io_of(f), T0, {}, st)
for m in range(1, 4): f.screen = LIMIT + "x" * m + "\n"; C.tick(ts, io_of(f), T0 + m * M, {}, st)
assert f.tg_out == [], f.tg_out
run(f, ts, 8, st, start=4); assert len(f.tg_out) == 1

# Telegram off -> logged only, the inspector note still goes
f, st = Fake(), {}; f.tg_on = False; f.state, f.screen = "idle", LIMIT
run(f, ts, 3, st); assert f.tg_out == [] and len(f.notes) == 1

# control_health = false -> nothing, no reads
f, st = Fake(), {}; f.state, f.screen = "idle", LIMIT
run(f, ts, 5, st, cfg={"control_health": False}); assert f.tg_out == [] and f.reads == 0

# dashboard line while it lasts, empty after
f, st = Fake(), {}; f.state, f.screen = "idle", LIMIT
run(f, ts, 3, st); assert C.line(st).startswith("NEEDS-ATTENTION:") and "orchestrator" in C.line(st) and "error" in C.line(st)
f.state, f.screen, f.sms = "working", "ok\n", 9; run(f, ts, 6, st, start=4); assert C.line(st) == ""

# the 3-restarts rule: 3 restarts in 30 min, the 4th is refused with ONE message, then nothing for 30 min
f, st = Fake(), {}
ok = [C.restart_gate("inbox", T0 + k * 5 * M, f.tg, st) for k in range(3)]; assert ok == [True] * 3 and f.tg_out == []
assert C.restart_gate("inbox", T0 + 16 * M, f.tg, st) is False and len(f.tg_out) == 1 and "לא מצליח להפעיל" in f.tg_out[0]
assert C.restart_gate("inbox", T0 + 30 * M, f.tg, st) is False and len(f.tg_out) == 1
assert C.restart_gate("inbox", T0 + 47 * M, f.tg, st) is True            # 30 min after the pause began
assert C.restart_gate("orchestrator", T0 + 17 * M, f.tg, st) is True      # per role
assert C.restart_gate("inbox", T0 + 3 * H, f.tg, {"restarts": {"inbox": [T0, T0 + M]}}) is True   # old restarts expire
print("control_health ok")
