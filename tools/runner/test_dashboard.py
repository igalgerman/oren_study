"""#142 dashboard: pure model() and text(). Run: python3 tools/runner/test_dashboard.py"""
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
import calendar, re, sys, time
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
assert {k: [r["n"] for r in v] for k, v in m["by_state"].items() if v or k in ("running", "needs_you", "blocked", "waiting", "ready", "other")} == {"running": [1], "needs_you": [2], "blocked": [3], "waiting": [4], "ready": [5], "other": [6]}, m["by_state"]
assert (m["closed_24h"], m["closed_7d"], m["closed_total"], m["merged_24h"], m["open_prs"]) == (1, 2, 2, 1, 1), (m["closed_24h"], m["closed_7d"], m["closed_total"], m["merged_24h"], m["open_prs"])
assert len(m["days"]) == 14 and m["days"][0]["label"] == "13 Nov" and m["days"][-1]["closed"] == 1 and m["days"][-1]["open_end"] == 6, m["days"][-1]
t = D.text(m)
assert t.startswith("Open issues: 6  (P0 1, P1 1, P2 2, P3 0, no priority 2)") and "Needs you: #2 t2" in t and "Last deploy:" in t, t
assert "<svg" in D.page(m) and "#2</a>" in D.page(m)
# the answer at the top (verdict): worst thing first, every sentence from the model's own numbers
v = D.verdict(m)
assert (v["level"], v["head"]) == ("you", "1 issue needs you") and "1 issue waits for your answer or decision." in v["why"], v
pg = D.page(m)
assert "NEEDS YOU" in pg and "<h2>Needs you" in pg and "Is the system healthy?" in pg and "Watcher status is not available" in pg
calm = [i for i in issues if i["number"] != 2]
v = D.verdict(D.model(calm, prs, ev, now))
assert v["level"] == "ok" and v["head"] == "On track" and "closing 0.2 per hour, new 0.0 per hour" in v["why"][0], v      # 1 closed in the last 6 h, none opened
idle = D.model([i for i in calm if i["number"] != 1], prs, ev, now)                    # nothing runs, #5 is ready
v = D.verdict(idle)
assert v["level"] == "slow" and v["head"] == "Nothing is being worked on right now", v
pg = D.page(idle)
assert "<h2>Needs you" not in pg and "Nothing is being worked on right now.</p>" in pg  # no empty 'Needs you' card; honest empty state
grow = D.verdict(D.model(calm + [I(20 + k, "OPEN", ["ready-for-agent"], c="2026-11-26T07:30:00Z") for k in range(3)], prs, ev, now))
assert grow["level"] == "slow" and grow["why"] == ["In the last 24 hours 1 issue was closed and 3 new ones came in."], grow
failed = D.verdict(D.model(calm, prs, ev[:2] + [{"ts": now - 600, "issue": 0, "event": "deploy", "ok": False}], now))
assert failed["level"] == "bad" and "failed" in failed["why"][0], failed
esc = D.page(D.model([{**I(31, "OPEN", ["ready-for-agent"]), "title": "<i>x</i> & y"}], prs, ev, now))
assert "&lt;i&gt;x&lt;/i&gt; &amp; y" in esc and "<i>x" not in esc                       # issue titles are escaped
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
# #148: the finish-rate tile on the first screen, with the top stuck reasons from runner.log
assert D.S.finish_rate(ev2, now) == (1, 2) and D.S.finish_rate([], now) == (0, 0)
assert D.S.finish_rate(ev2 + [{"ts": now - 90000, "issue": 9, "event": "start"}], now) == (1, 2)      # older than 24 h: not counted
first = pg.split("More details")[0]
assert "1 of 2" in first and "runner finished on its own" in first and "integrate.sh exit 4 (2)" in first, first
low = D.page(D.model(issues, prs, ev2 + [{"ts": now - 500, "issue": 5, "event": "start"}], now, log))     # 1 of 3: under 50%
assert re.search(r'<div class="card attn"><div class="big">1 of 3</div>', low)
print("ok dashboard v2")
# #171 oversight + AI card
wl = "\n".join(["2026-11-26 07:30:00 told orchestrator: IDLE ALARM (watchdog): PR #31 quiet", "2026-11-26 07:40:00 told orchestrator: TREND ALARM: x",
                "2026-11-26 07:50:00 closed window issue-5 (t1, was live)", "2026-11-26 07:55:00 error: boom", "2026-11-26 07:56:00 trends: 24h: started 3",
                "2026-11-24 07:00:00 told orchestrator: too old", "garbage"])
o = D.oversight(wl, now - 30, now - 600, "09:32 · 0 actions", now - 4000, now)
assert (o["told"], o["idle"], o["trend"], o["closed_windows"], o["errors"]) == (2, 1, 1, 1, 1), o
assert o["last_told"][0][1].startswith("TREND") and o["trends_last"] == "trends: 24h: started 3"
assert "STOPPED" not in D.ov_text(o) and "STOPPED" in D.ov_text(D.oversight("", now - 900, None, "", None, now))
m2["ov"] = o; m2["ai"] = {"at": now - 60, "model": "haiku", "text": "- **Good:** things go well.\n- Risk: <b>x</b>"}
pg = D.page(m2)
assert "Oversight: who watches the system" in pg and "STOPPED?" in pg     # observer last ran 67 min ago > 60
vb = D.verdict(m2)
assert vb["level"] == "bad" and vb["head"] == "Something looks wrong" and vb["why"][0].startswith("The observer looks stopped"), vb
assert "PROBLEM" in pg and "2 of 6 checks need a look" in pg and "1 idle alarm and 1 trend alarm" in pg     # observer stopped + #3 blocked
assert [(n, ok) for n, _, _, ok in D.watcher_health(o)] == [("runner", True), ("watchdog", True), ("observer", False)]
assert "<b>Good:</b>" in pg and "AI assessment" in pg and "&lt;b&gt;x&lt;/b&gt;" in pg and "may be wrong" in pg
m2["ai"] = None; assert "Not written yet" in D.page(m2)
print("ok dashboard ai/oversight")
# #173 merge ETA per issue + bottom line
t0 = {"avg_build": 1200, "avg_review": 300, "avg_merge": 3600}
fc0 = {"c6": 2.0, "c24": 1.0}
rows0 = [{"n": 1, "prio": "P0", "state": "ready", "blockers": []}, {"n": 2, "prio": "P1", "state": "ready", "blockers": []},
         {"n": 3, "prio": "P1", "state": "waiting", "blockers": [1]}, {"n": 4, "prio": "P2", "state": "needs_you", "blockers": []},
         {"n": 5, "prio": "P2", "state": "waiting", "blockers": [4]}, {"n": 6, "prio": "P1", "state": "running", "blockers": []}]
run0 = [{"n": 6, "step": "merging (CI)", "for_s": 3000}]
pl = D.eta_plan(rows0, run0, t0, fc0, now, lanes=3)
assert pl[6] == (now + 1050, now + 1575), pl[6]                                  # merging: half the CI/merge wait (2100 s)
assert pl[1] == (now + 3600, now + 5400) and pl[2] == (now + 3600, now + 7200), (pl[1], pl[2])   # at least one cycle; place 2 at 1/h = 2 h
assert pl[3][0] >= pl[1][0] + 3600 and pl[3][1] >= pl[1][1] + 5400, pl[3]           # after its blocker + one cycle
assert pl[4] == "waits for you" and pl[5] == "after #4", (pl[4], pl[5])
assert D.eta_str("waits for you", now) == "waits for you" and "–" in D.eta_str(pl[2], now)
mm = {"plan": pl, "rows": [{**r, "title": "t"} for r in rows0], "now": now}
bl = dict(D.bottom_line(mm))
assert "all 1 P0" in bl and "2 without an estimate" in bl["everything open now"], bl
pg = D.page(m2)
assert "When will it be finished?" in pg and "<h2>Timeline" in pg and "ESTIMATE" in pg and "Next in line" in pg
assert "≈ " + D.eta_str(m2["plan"][1], now) in pg and "merged, now going live" in pg     # the running issue: its estimate and its step in plain words
assert "No estimate for" in pg and "(waits for you)" in pg                              # the P0 that waits for the owner is named, not hidden
assert pg.count("<details") >= 6 and "How these numbers are made" in pg and "stats.jsonl" in pg.split("How these numbers are made")[1]
assert "stats.jsonl" not in pg.split("More details")[0]                                # no internal file names on the first screen
assert D.last_eta(mm, mm["rows"])[0] == (max(x[0] for x in pl.values() if isinstance(x, tuple)), max(x[1] for x in pl.values() if isinstance(x, tuple)))
assert "Bottom line (estimate)" in D.text(m2)
pl1 = D.eta_plan(rows0, run0, t0, {"c6": 50.0, "c24": 50.0}, now, lanes=1)        # 1 lane, busy until #6 merges
assert pl1[1][0] == now + 1050 + 3600 and pl1[2][0] == now + 1050 + 7200, (pl1[1], pl1[2])   # lane frees, then one cycle each
print("ok merge eta")
# #136 cloud lanes: lanes line, one row per cloud lane, STALE, not in "Running now"
ic = issues + [I(11, "OPEN", ["in-progress", "cloud", "P0"]), I(12, "OPEN", ["cloud"])]
cl = [{"n": 11, "title": "t11", "state": "working", "line": "", "last": "2026-11-26T06:30:00Z", "stale": True, "pr": "", "session": "https://claude.ai/code/session_01A"},
      {"n": 12, "title": "t12", "state": "done", "line": "RESULT: DONE", "last": "2026-11-26T07:50:00Z", "stale": False, "pr": "https://github.com/x/y/pull/201", "session": ""}]
m3 = D.model(ic, prs, ev, now, "", cl)
assert m3["lanes"] == f"local 1/{D.R.CFG.get('local_lanes', 3)} · cloud 1/{D.R.CFG.get('remote_lanes', 0)}", m3["lanes"]   # #263: done #12 not a lane
assert [r["n"] for r in m3["running"]] == [1], m3["running"]
t3 = D.text(m3)
assert "Lanes: local 1/" in t3 and "cloud #11 t11 — working · last " in t3 and " · STALE · https://claude.ai/code/session_01A" in t3, t3
assert "cloud #12" not in t3 and "Cloud done: #12 t12" in t3, t3                         # #263: done goes to DONE, not the lanes
pg3 = D.page(m3)
assert "Cloud lanes" in pg3 and ">session</a>" in pg3 and "STALE" in pg3
assert "Cloud lanes" not in D.page(m)
assert "Cloud lanes" in pg3 and "Cloud done" in pg3 and "pull/201" not in pg3.split("Cloud lanes")[1].split("</section>")[0]
assert [c["n"] for c in m3["cloud"]] == [11] and [c["n"] for c in m3["cloud_done"]] == [12]
# #263: all cloud sessions done -> no cloud lane, count 0; a manual session still working gets a 'manual' tag
m5 = D.model(ic, prs, ev, now, "", [{**cl[0], "state": "done"}, cl[1]])
assert m5["cloud_n"] == 0 and m5["cloud"] == [] and "Cloud lanes" not in D.page(m5), m5["lanes"]
m6 = D.model(ic, prs, ev, now, "", [{**cl[0], "manual": True}, cl[1]])
assert "cloud #11 t11 — working · manual · last " in D.text(m6) and '<span class="tag">manual</span>' in D.page(m6)
print("ok dashboard cloud")
# #192: with deploy_in_ci the deploys come from the GitHub deployments of the deploy workflow (environment production), not stats.jsonl
st = [{"state": "success", "created_at": "2026-11-26T07:50:00Z", "environment_url": "https://ab.oren-game.pages.dev"},
      {"state": "failure", "created_at": "2026-11-26T07:20:00Z", "environment_url": ""}, {"state": "in_progress", "created_at": "2026-11-26T07:55:00Z"}, None]
de = D.deploy_events(st)
assert de == [{"ts": now - 600, "issue": 0, "event": "deploy", "ok": True, "url": "https://ab.oren-game.pages.dev"},
              {"ts": now - 2400, "issue": 0, "event": "deploy", "ok": False, "url": ""}], de
md = D.model(issues, prs, [e for e in ev if e["event"] != "deploy"] + de, now)
assert md["last_deploy"]["ok"] is True and md["truth"]["deploys_ok"] == 1 and md["truth"]["deploys_fail"] == 1
assert D.merge_deploys(ev, de, ci=True) == [e for e in ev if e["event"] != "deploy"] + de      # old runner deploy records are dropped
assert D.merge_deploys(ev, de, ci=False) == ev
print("ok dashboard ci deploys")
m3["governor"] = "governor: 6 lanes (5h 40% -> ~89% at 19:00)"
assert "Lanes: " in D.text(m3) and "· governor: 6 lanes (5h 40% -> ~89% at 19:00)" in D.text(m3) and "governor: 6 lanes" in D.page(m3)
print("ok dashboard governor")
# #236: an in-progress issue running remote without the cloud label is a cloud lane (a remote.cloud() row), not local
ic4 = issues + [I(13, "OPEN", ["in-progress", "P0"])]
cl4 = [{"n": 13, "title": "t13", "state": "working", "line": "", "last": "2026-11-26T07:50:00Z", "stale": False, "pr": "", "session": ""}]
m4 = D.model(ic4, prs, ev, now, "", cl4)
assert m4["cloud_n"] == 1 and 13 not in [r["n"] for r in m4["running"]], (m4["cloud_n"], m4["running"])
assert m4["lanes"] == f"local 1/{D.R.CFG.get('local_lanes', 3)} · cloud 1/{D.R.CFG.get('remote_lanes', 0)}", m4["lanes"]
print("ok dashboard remote lanes")
# #282: batch members count under their batch; manual and later have their own counts, not 'not triaged'
pk = [I(40, "OPEN", ["ready-for-agent", "P2"], body="- [ ] #41  a\n- [ ] #42  b") | {"title": "Batch: x (#41, #42)"},
      I(41, "OPEN", ["P2"]), I(42, "OPEN", ["P2"]), I(43, "OPEN", ["manual"]), I(44, "OPEN", ["later"]), I(45, "OPEN", [])]
mp = D.model(pk, prs, ev, now)
assert {k: [r["n"] for r in v] for k, v in mp["by_state"].items() if v} == {"ready": [40], "batch": [41, 42], "manual": [43], "later": [44], "other": [45]}, mp["by_state"]
assert [r["batch"] for r in mp["by_state"]["batch"]] == [40, 40] and mp["plan"][41] == "in batch #40" and mp["plan"][43] == "manual"
tp = D.text(mp)
assert "in a batch 2" in tp and "not triaged / other 1" in tp and "In batches: #40 (#41 #42)" in tp, tp
assert "In a batch" in D.page(mp)
print("dashboard #282 OK")
