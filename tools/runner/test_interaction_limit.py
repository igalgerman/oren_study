"""#829 interaction-limit reminder: 20 days left = quiet, 13 days = one alarm (then daily), gone = alarm, renewed = cleared.
Run: python3 tools/runner/test_interaction_limit.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
os.environ["OREN_TEST"] = "1"
import json, time
import interaction_limit as L

D = 86400; NOW = 1_800_000_000
iso = lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))
def gh(exp):          # fake `gh api .../interaction-limits` answer
    return lambda repo: json.dumps({"limit": "collaborators_only", "origin": "repository", "expires_at": iso(exp)}) if exp else "{}"
def run(exp, now, repos=("o/infra",)):
    told, sent = [], []
    L.tick(told.append, lambda *_: None, now=now, send=sent.append, fetch=gh(exp), repos=repos)
    return told, sent

# 20 days left: quiet
t, s = run(NOW + 20 * D, NOW); assert t == [] and s == [], t
# 13 days: ONE alarm naming repo, date, exact command; same day again: quiet
t, s = run(NOW + 13 * D, NOW + 1); assert len(t) == 1 and len(s) == 1, t
for need in ("o/infra", iso(NOW + 13 * D)[:10], "gh api -X PUT repos/o/infra/interaction-limits -f limit=collaborators_only -f expiry=six_months"):
    assert need in t[0], (need, t[0])
t, _ = run(NOW + 13 * D, NOW + 3600); assert t == []
# next day: repeats
t, _ = run(NOW + 13 * D, NOW + 1 + D + 60); assert len(t) == 1, t
# renewed (far expiry): cleared, and a later new window starts fresh
t, _ = run(NOW + 180 * D, NOW + 2 * D); assert t == []
assert json.loads((L.RUNS / L.STATE).read_text()).get("sent") == {}
# gone (empty answer): immediate alarm; two repos alarm separately
t, _ = run(None, NOW + 3 * D, repos=("o/infra", "o/game")); assert len(t) == 2 and "gone" in t[0].lower(), t
# a gh failure is not an alarm
told = []; L.tick(told.append, lambda *_: None, now=NOW + 9 * D, send=told.append, fetch=lambda r: None, repos=("o/x",)); assert told == []
print("ok")
