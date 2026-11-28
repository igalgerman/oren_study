"""#708 usage per entity: transcript parsing (numeric fields only), cloud proxy rows, week-share math, alarms, no content leak.
Run: python3 tools/runner/test_usage_entities.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")
os.environ["OREN_TEST"] = "1"
import json, sys
from pathlib import Path
import usage_entities as U

SECRET = "TOP-SECRET-MESSAGE-CONTENT"
T0 = 1_800_000_000
iso = lambda t: time_iso(t)
import time
time_iso = lambda t: time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(t))
KNOWN = {"orchestrator": "Read ORCHESTRATOR.md and continue as the orchestrator.", "inbox": "You are the INBOX of the Oren"}

def asst(t, mid, model, inp, out, cr=0, cc=0, effort="high"):
    return {"type": "assistant", "timestamp": iso(t), "effort": effort,
            "message": {"id": mid, "model": model, "content": [{"type": "text", "text": SECRET}],
                        "usage": {"input_tokens": inp, "output_tokens": out, "cache_read_input_tokens": cr, "cache_creation_input_tokens": cc}}}
def user(text): return {"type": "user", "message": {"role": "user", "content": text}}
def write(p, lines): Path(p).parent.mkdir(parents=True, exist_ok=True); Path(p).write_text("\n".join(json.dumps(l) for l in lines) + "\n", encoding="utf-8")

# --- (1) fixture: orchestrator session (two lines share one message.id) + one sub-agent file ---
root = Path(tempfile.mkdtemp(prefix="proj-")); sess = root / "C--work-x" / "s1.jsonl"
write(sess, [user("Read ORCHESTRATOR.md and continue as the orchestrator. Open /lanes " + SECRET),
             asst(T0, "m1", "claude-opus-5-5", 100, 50, cr=1000), asst(T0, "m1", "claude-opus-5-5", 100, 50, cr=1000),   # same id: once
             asst(T0 + 5, "m2", "claude-sonnet-5-5", 10, 20)])
write(root / "C--work-x" / "s1" / "subagents" / "agent-a.jsonl", [asst(T0 + 6, "s1", "", 40, 10)])
(root / "C--work-x" / "s1" / "subagents" / "agent-a.meta.json").write_text(json.dumps({"model": "claude-haiku-5-5", "agentType": "Explore"}))
first, rows = U.parse_transcript(sess)
assert len(rows) == 2 and rows[0]["tokens"] == 100 + 50 + 0.1 * 1000 and rows[0]["effort"] == "high", rows
assert U.classify(first, KNOWN) == "orchestrator" and U.classify("hello", KNOWN) == "other" and U.classify(KNOWN["inbox"] + " more", KNOWN) == "inbox"
raw = U.transcript_rows(root, 0, KNOWN)
assert sorted({r["entity"] for r in raw}) == ["orchestrator", "orchestrator/sub:Explore"], raw
assert [r["model"] for r in raw if "sub" in r["entity"]] == ["claude-haiku-5-5"]    # model from the .meta.json

# --- (2) table + week math on fixed numbers ---
fix = [{"entity": "orchestrator", "model": "sonnet", "effort": "", "tokens": 600, "ts": 1},
       {"entity": "inbox", "model": "opus", "effort": "", "tokens": 200, "ts": 1},          # 400 units
       {"entity": "governor", "model": "haiku", "effort": "", "tokens": 400, "ts": 1}]      # 20 units
tab = U.build(fix, 10.0)            # total 1020 units; the week burned 10% in the period
by = {r["entity"]: r for r in tab}
assert abs(by["orchestrator"]["day_pct"] - 58.82) < 0.01 and abs(by["orchestrator"]["week_pct"] - 5.882) < 0.001, by
assert U.build(fix, None)[0]["week_pct"] is None
assert U.week_burn([{"at": 100, "week": 20}, {"at": 200, "week": 26}], 300) == 6 and U.week_burn([{"at": 100, "week": 90}, {"at": 200, "week": 3}], 300) == 3
assert U.week_burn([{"at": 100, "pct": 5}], 300) is None
assert U.usage_line(tab, 2).startswith("USAGE: orchestrator 59% · inbox 39%")

# --- (3) cloud run -> proxy rows by run-minutes, per issue and model ---
ev = [{"ts": 1000, "issue": 7, "lane": "pack", "event": "start", "model": "opus"}, {"ts": 1000 + 600, "issue": 7, "lane": "pack", "event": "worker_done"},
      {"ts": 1000 + 900, "issue": 7, "lane": "pack", "event": "review_pass"}, {"ts": 1000 + 960, "issue": 7, "lane": "pack", "event": "merged"}]
cr = U.cloud_rows(ev, 0)
assert [(r["entity"], r["minutes"], r["proxy"]) for r in cr if not r.get("merged")] == [("#7 worker", 10.0, True), ("#7 reviewer", 5.0, True)], cr
assert cr[0]["tokens"] == 10 * U.PROXY_TOK_PER_MIN * 2 and cr[0]["model"] == "opus" and cr[0]["issue"] == 7
ct = U.build(cr, 10.0); assert all(r.get("proxy") for r in ct) and ct[0]["minutes"] == 10.0
assert any(r["entity"] == "#7 merged" and r["merged_per_week_pct"] for r in ct)

# --- (4) alarms: thresholds, 3 h repeat ---
rows_a = [{"entity": "orchestrator", "day_pct": 16.0, "week_pct": 1, "issue": None}, {"entity": "inbox", "day_pct": 10.5, "week_pct": 1, "issue": None},
          {"entity": "inspector", "day_pct": 9.0, "week_pct": 1, "issue": None}, {"entity": "governor", "day_pct": 3.5, "week_pct": 0.3, "issue": None},
          {"entity": "#9 worker", "day_pct": 30, "week_pct": 5.5, "issue": 9}, {"entity": "#9 fix", "day_pct": 1, "week_pct": 0.2, "issue": 9},
          {"entity": "#10 worker", "day_pct": 5, "week_pct": 4.0, "issue": 10}]
t, sent = U.alarms(rows_a, {}, T0)
keys = set(sent); assert keys == {"orchestrator", "inbox", "governor", "#9"}, keys
assert all("ENTITY" in x and "Fix:" in x and "%" in x for x in t) and len(t) == 4
t2, sent2 = U.alarms(rows_a, sent, T0 + 3 * 3600 - 1); assert t2 == [] and sent2 == sent
t3, _ = U.alarms(rows_a, sent, T0 + 3 * 3600); assert len(t3) == 4
assert U.alarms([{"entity": "orchestrator", "day_pct": 15.0, "week_pct": None, "issue": None}], {}, T0)[0] == []     # not above the limit

# --- (5) tick: writes the file, tells + Telegram once, and no message content anywhere in the output ---
tolds, tgs = [], []
for f in root.rglob('*.jsonl'): os.utime(f, (T0, T0))
(U.RUNS).mkdir(exist_ok=True)
(U.RUNS / "usage_hist.jsonl").write_text("".join(json.dumps(h) + "\n" for h in [{"at": T0 - 3600, "week": 10}, {"at": T0, "week": 30}]))
tb = U.tick(tell=tolds.append, log=print, now=T0 + 10, send=tgs.append, root=root, known=KNOWN)
assert tolds and tolds == tgs and "orchestrator" in tolds[0], tolds           # 100% of the day is the orchestrator (> 15%)
n_told = len(tolds); U.tick(tell=tolds.append, log=print, now=T0 + 20, send=tgs.append, root=root, known=KNOWN); assert len(tolds) == n_told   # not again within 3 h
out = (U.RUNS / U.OUT_NAME).read_text(encoding="utf-8"); d = json.loads(out)
assert set(d) == {"day", "rows", "attention", "at"} and d["rows"] and d["attention"]
assert SECRET not in out and "ORCHESTRATOR.md" not in out and SECRET not in "".join(tolds) and "content" not in out
U.record_headless("governor", "haiku", {"input_tokens": 5, "output_tokens": 1}, 0.01, now=T0)
assert SECRET not in (U.RUNS / "usage_headless.jsonl").read_text() and U.headless_rows(0)[0]["entity"] == "governor"
assert "Usage per entity" in U.text(d) and "NEEDS-ATTENTION" in U.text(d)
print("test_usage_entities: ok")
