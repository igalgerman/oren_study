"""#142 dashboard: pure model() and text(). Run: python3 tools/runner/test_dashboard.py"""
import calendar, sys, time
sys.argv.append("--dry-run")
import dashboard as D
now = calendar.timegm((2026, 11, 26, 8, 0, 0, 0, 0, 0))
I = lambda n, st, labels, c="2026-11-25T08:00:00Z", cl=None, body="": {"number": n, "title": f"t{n}", "state": st, "labels": labels, "createdAt": c, "closedAt": cl, "body": body}
issues = [I(1, "OPEN", ["in-progress", "P1"]), I(2, "OPEN", ["ready-for-human", "P0"]), I(3, "OPEN", ["blocked", "P2"]),
          I(4, "OPEN", ["ready-for-agent", "P2"], body="Blocked by: #1"), I(5, "OPEN", ["ready-for-agent"]), I(6, "OPEN", []),
          I(7, "CLOSED", ["P1"], cl="2026-11-26T07:00:00Z"), I(8, "CLOSED", [], c="2026-11-10T08:00:00Z", cl="2026-11-20T07:00:00Z")]
prs = [{"number": 9, "state": "MERGED", "mergedAt": "2026-11-26T06:00:00Z"}, {"number": 10, "state": "OPEN", "mergedAt": None}]
ev = [{"ts": now - 3600, "issue": 1, "event": "start"}, {"ts": now - 1800, "issue": 1, "event": "worker_done"},
      {"ts": now - 600, "issue": 0, "event": "deploy", "ok": True}]
m = D.model(issues, prs, ev, now)
assert m["open"] == 6 and m["by_prio"] == {"P0": 1, "P1": 1, "P2": 2, "P3": 0, "-": 2}, m["by_prio"]
assert {k: [r["n"] for r in v] for k, v in m["by_state"].items()} == {"running": [1], "needs_you": [2], "blocked": [3], "waiting": [4], "ready": [5], "other": [6]}, m["by_state"]
assert (m["closed_24h"], m["closed_7d"], m["closed_total"], m["merged_24h"], m["open_prs"]) == (1, 2, 2, 1, 1), (m["closed_24h"], m["closed_7d"], m["closed_total"], m["merged_24h"], m["open_prs"])
assert len(m["days"]) == 14 and m["days"][0]["label"] == "13 Nov" and m["days"][-1]["closed"] == 1 and m["days"][-1]["open_end"] == 6, m["days"][-1]
t = D.text(m)
assert t.startswith("Open issues: 6  (P0 1, P1 1, P2 2, P3 0, no priority 2)") and "Needs you: #2 t2" in t and "Last deploy:" in t, t
assert "<svg" in D.page(m) and "#2</a>" in D.page(m)
print("ok dashboard")
# v2 (#169): forecast ranges and honesty, truth numbers, running step
f = D.forecast(10, [now - 600 * k for k in range(12)], [now - 3600], now, 48)     # 12 closed in the last 2 h, 1 opened
assert f["net"] and f["net"][0] < f["net"][-1], f                                   # fast (6 h) and slow (24 h) ends of the range
assert D.forecast(10, [now - 60], [now - 60, now - 120], now, 48)["net"] is None    # more opened than closed: not shrinking
assert D.forecast(10, [], [], now, 48)["gross"] is None
assert "not shrinking" in D.fc_text(D.forecast(10, [now - 60], [now - 60, now - 120], now, 48), now, "x")
ev2 = ev + [{"ts": now - 900, "issue": 1, "event": "review_pass"}, {"ts": now - 800, "issue": 1, "event": "merged"},
            {"ts": now - 700, "issue": 2, "event": "start"}, {"ts": now - 600, "issue": 2, "event": "review_fix"}]
log = "2026-11-26 07:00:00 #3: BLOCKED: integrate.sh exit 4\n2026-11-26 07:10:00 #4: BLOCKED: integrate.sh exit 4"
m2 = D.model(issues, prs, ev2, now, log)
assert (m2["truth"]["started"], m2["truth"]["by_runner"], m2["truth"]["fixes"], m2["truth"]["passes"]) == (2, 1, 1, 1), m2["truth"]
assert m2["truth"]["stuck"] == [("integrate.sh exit 4", [3, 4])], m2["truth"]["stuck"]
assert [(r["n"], r["step"]) for r in m2["running"]] == [(1, "deploying")], m2["running"]
assert len(m2["hours"]) == 24 and m2["recent"][0]["n"] == 7
t2 = D.text(m2)
assert "Forecast (estimate" in t2 and "finished by itself 1 (50%)" in t2, t2
pg = D.page(m2)
assert "ESTIMATE" in pg and "How the work really gets done" in pg and "Recently finished" in pg
print("ok dashboard v2")
