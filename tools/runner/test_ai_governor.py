"""#707 AI governor on recorded situations. Run: python3 tools/runner/test_ai_governor.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
os.environ["OREN_TEST"] = "1"
import json, subprocess, sys
from pathlib import Path
sys.argv.append("--dry-run")
import runner as R
import ai_governor as A

NOW = 1_800_000_000.0
core = lambda **k: {"lanes": 4, "stop": False, "n_lo": 1, "n_hi": 9, "c": 94.0, "ready": 9, "week_pct": 40.0, "pct": None, "mode": "week-only", "why": "week 40%", **k}
adv = lambda **k: {"at": NOW - 60, "valid_min": 60, "reason": "r", **k}

# week ahead: fewer lanes, hold
a, ref = A.apply_ai(core(), adv(lanes=1, mode="hold"), NOW); assert a["lanes"] == 1 and a["mode"] == "hold" and not ref, (a, ref)
# week behind with work ready: sprint, more lanes within N_hi
a, ref = A.apply_ai(core(), adv(lanes=7, mode="sprint", order=[701, 702]), NOW); assert a["lanes"] == 7 and a["mode"] == "sprint" and a["order"] == [701, 702] and not ref
# lanes above N_hi refused
a, ref = A.apply_ai(core(), adv(lanes=20), NOW); assert a["lanes"] == 9 and ref == ["lanes 20 > N_hi 9"], ref
# empty queue: N_hi = busy lanes, no new lanes
a, ref = A.apply_ai(core(lanes=2, n_hi=2, ready=0), adv(lanes=5, mode="sprint"), NOW); assert a["lanes"] == 2 and ref
# core stop: lanes advice refused
a, ref = A.apply_ai(core(stop=True, lanes=0), adv(lanes=3), NOW); assert a["lanes"] == 0 and ref
# C never raised, lowering fine
a, ref = A.apply_ai(core(), adv(c=97), NOW); assert a["c"] == 94.0 and "C 97 > core C 94" in ref[0]
a, ref = A.apply_ai(core(), adv(c=90), NOW); assert a["c"] == 90.0 and not ref
# raise below a floor refused (reviewer/design -> opus; effort below medium; below inbox label)
lab = lambda n: ["model:opus", "effort:high"] if n == 5 else ["design"]
a, ref = A.apply_ai(core(), adv(**{"raise": [{"issue": 5, "model": "sonnet", "effort": "medium"}, {"issue": 6, "model": "sonnet"}, {"issue": 7, "model": "opus", "effort": "high"}, {"issue": 8, "effort": "low"}]}), NOW, lab)
assert [r["issue"] for r in a["raise"]] == [7] and len(ref) == 4, (a, ref)
a, ref = A.apply_ai(core(), adv(actions=[{"kind": "role_model", "role": "reviewer", "model": "haiku"}, {"kind": "role_model", "role": "reviewer", "model": "opus", "effort": "high"},
                                          {"kind": "orchestrator_idle"}, {"kind": "format_disk"}, {"kind": "stop_run"}]), NOW)
assert [x["kind"] for x in a["actions"]] == ["role_model", "orchestrator_idle"] and len(ref) == 3, (a, ref)
# stale / invalid -> core alone
assert A.apply_ai(core(), adv(at=NOW - 91 * 60, valid_min=500, lanes=2), NOW)[0] is None
assert A.apply_ai(core(), adv(at=NOW - 3601, lanes=2), NOW)[0] is None
assert A.apply_ai(core(), None, NOW)[0] is None and A.parse("no json") is None and A.parse("x {bad} y") is None
assert A.parse('ok ```{"lanes": 3}```') == {"lanes": 3}

# triggers: hourly, plan change, limit near, queue jump, 3 FIX, entity alarm; nothing else
st = {"at": NOW - 600, "ready": 9, "mode": "week-only"}
ctx = {"fix_1h": 0, "entity_alarm": False}
assert A.trigger(core(), st, NOW, ctx) is None
assert A.trigger(core(), {**st, "at": NOW - 3600}, NOW, ctx) == "hourly"
assert "plan changed" in A.trigger(core(mode="5h+week"), st, NOW, ctx)
assert A.trigger(core(week_pct=91.5), st, NOW, ctx) == "limit near" and A.trigger(core(pct=90.0), st, NOW, ctx) == "limit near"
assert A.trigger(core(ready=14), st, NOW, ctx) == "ready queue jumped" and A.trigger(core(ready=13), st, NOW, ctx) is None
assert A.trigger(core(), st, NOW, {**ctx, "fix_1h": 3}) and A.trigger(core(), st, NOW, {**ctx, "entity_alarm": True}) == "entity alarm"

# the step with a fake claude: ok -> stored + overlay applies + logged; failure/bad JSON/timeout -> core alone with the exact why
logs = []; R.log_line = lambda l: logs.append(l)
class P:
    def __init__(s, out="", rc=0): s.stdout, s.stderr, s.returncode = out, "", rc
def fake(out="", rc=0, exc=None):
    def f(cmd, **k):
        fake.cmd = cmd
        if exc: raise exc
        return P(out, rc)
    return f
c = core()
A.RUN = fake(json.dumps({"lanes": 5, "mode": "sprint", "order": [701], "reason": "behind", "valid_min": 60}))
assert A.maybe_start(c, NOW, background=False) == "hourly"
assert fake.cmd[fake.cmd.index("--model") + 1] == "sonnet" and fake.cmd[fake.cmd.index("--effort") + 1] == "medium" and "haiku" not in fake.cmd
gv = A.overlay(c, NOW + 5); assert gv["lanes"] == 5 and "AI governor: 5 lanes, sprint (9 ready), #701 first" in gv["why"], gv["why"]
assert any(l.endswith("AI governor: 5 lanes, sprint (9 ready), #701 first: behind") for l in logs), logs
assert "AI governor: 5 lanes" in R.governor_text({**gv, "need": 1.0, "stop": False})
n = len(logs); A.overlay(c, NOW + 6); assert len(logs) == n                   # logged once per decision
A.RUN = fake(json.dumps({"lanes": 20, "reason": "x"})); A._running["v"] = False
A.step(c, {}, NOW + 7200, "t"); A.overlay(c, NOW + 7201); assert "AI governor refused: lanes 20 > N_hi 9" in " ".join(logs)
assert A.maybe_start(c, NOW + 7300, background=False) is None                 # not again within the hour
for bad in (fake("not json"), fake("", rc=1), fake(exc=subprocess.TimeoutExpired("claude", 180)), fake(exc=OSError("nope"))):
    A.RUN = bad; A.step(c, {}, NOW + 20000, "t")
    gv = A.overlay(c, NOW + 20001); assert gv["lanes"] == c["lanes"] and gv["why"].endswith("AI governor down: core alone"), gv["why"]
A.RUN = fake(json.dumps({"lanes": 2, "reason": "r", "valid_min": 30})); A.step(c, {}, NOW + 30000, "t")
assert A.overlay(c, NOW + 30001)["lanes"] == 2
assert A.overlay(c, NOW + 30000 + 31 * 60)["why"].endswith("AI governor down: core alone")      # stale decision
assert A.overlay(c, NOW + 30000)["lanes"] == 2 and A._running["v"] is False

# usage-per-entity file: read when present, ignored when missing
assert A.entity_info(NOW) is None and A.context(c, NOW)["entity"] is None and not A.context(c, NOW)["entity_alarm"]
(R.RUNS / "usage_by_entity.json").write_text(json.dumps({"alarm": "issue #9 loops", "rows": []}))
assert A.entity_info(NOW)["alarm"] and A.context(c, NOW)["entity_alarm"] and "alarm" in A.prompt(c, A.context(c, NOW), [])

# the AI order sits after express/P0 in the queue
R.AI_ORDER.clear(); R.AI_ORDER.update({702: 0, 701: 1})
mk = lambda n, *l: {"number": n, "labels": list(l), "createdAt": "2026-01-01"}
q = sorted([mk(701), mk(702), mk(703, "P0"), mk(704, "express")], key=R.queue_key); assert [i["number"] for i in q] == [704, 703, 702, 701]
R.AI_ORDER.clear()
print("ok #707 AI governor")
