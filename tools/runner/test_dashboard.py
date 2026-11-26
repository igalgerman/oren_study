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
assert len(m["days"]) == 14 and m["days"][0]["day"] == "13 Nov" and m["days"][-1]["closed"] == 1 and m["days"][-1]["open_end"] == 6, m["days"][-1]
t = D.text(m)
assert t.startswith("Open issues: 6  (P0 1, P1 1, P2 2, P3 0, no priority 2)") and "Needs you: #2 t2" in t and "Last deploy:" in t, t
assert "<svg" in D.page(m) and "#2</a>" in D.page(m)
print("ok dashboard")
