# Unit test for the deploy workflow helper (#192): python3 tools/ci/test_deploy_ci.py
import json, os, sys, tempfile, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import deploy_ci as d

NL = chr(10)
# parse: "ok <url>" is the LAST line of deploy.sh; D1 is bound unless deploy.sh warned
ok = d.parse("injected 1 2" + NL + "worker 3" + NL + "ok https://ab12.oren-game.pages.dev" + NL)
assert ok == {"ok": True, "url": "https://ab12.oren-game.pages.dev", "d1": True}, ok
bad = d.parse("WARNING: D1 not bound (token lacks 'D1: Edit'?): family saves stay on KV (#109)" + NL + "[{'code': 10000, 'message': 'Authentication error'}] None" + NL)
assert bad["ok"] is False and bad["d1"] is False and bad["url"] == "", bad
assert d.parse("")["ok"] is False
assert d.parse("ok None")["ok"] is False                      # success without a deployment url is not a deploy
print("ok parse")

# summary text: ok/fail, url, D1 yes/no
s = d.summary(ok); assert "ok" in s and "https://ab12.oren-game.pages.dev" in s and "D1 bound: yes" in s, s
s = d.summary(bad); assert "FAILED" in s and "D1 bound: no" in s, s
print("ok summary")

# smoke (#150): page loads, save round trip (random id, then deleted), D1 bound, /api/tts/status - against a fake site
STORE = {}
class H(BaseHTTPRequestHandler):
    broken = set()
    def log_message(self, *a): pass
    def _send(self, code, body, ct="application/json"):
        b = body.encode(); self.send_response(code); self.send_header("content-type", ct); self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path == "/" and "page" not in H.broken: return self._send(200, "<html><body><div id=app>game</div></body></html>", "text/html")
        if self.path.startswith("/api/save/") and self.path in STORE and "save" not in H.broken: return self._send(200, STORE[self.path])
        if self.path == "/api/tts/status": return self._send(200, json.dumps({"ok": "tts" not in H.broken, "ver": 3, "d1": "d1" not in H.broken}))
        self._send(404, "{}")
    def do_PUT(self):
        t = self.rfile.read(int(self.headers["content-length"])).decode()
        STORE[self.path] = t; self._send(200, '{"ok":true}')
    def do_DELETE(self):                                     # like the worker: only a save marked smoke can be deleted
        if "delete" in H.broken or "smoke" not in json.loads(STORE.get(self.path, "{}")): return self._send(403, "{}")
        del STORE[self.path]; self._send(200, '{"ok":true}')
srv = ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{srv.server_address[1]}"
res = d.smoke(URL, tries=1)
assert all(r[1] for r in res) and [r[0] for r in res] == ["page loads", "save round trip", "D1 bound", "/api/tts/status"], res
assert STORE == {}, STORE                                    # no test data left behind
STORE["/api/save/" + "ab" * 16] = json.dumps({"v": 4, "gems": 7})      # a family save is never touched
for part, name in (("page", "page loads"), ("save", "save round trip"), ("delete", "save round trip"), ("d1", "D1 bound"), ("tts", "/api/tts/status")):
    H.broken = {part}; [STORE.pop(k) for k in list(STORE) if "smoke" in STORE[k]]
    res = dict(d.smoke(URL, tries=1)); assert res[name] is False and sum(not v for v in res.values()) == 1, (part, res)
    assert ("delete" in H.broken) or list(STORE) == ["/api/save/" + "ab" * 16], (part, STORE)   # cleaned up even when a check fails
H.broken = set(); STORE.clear()
ids = set()
_orig = d._req
def _spy(m, u, b=None):
    if "/api/save/" in u: ids.add(u.rsplit("/", 1)[1])
    return _orig(m, u, b)
d._req = _spy; d.smoke(URL, tries=1); d.smoke(URL, tries=1); d._req = _orig
assert len(ids) == 2 and all(len(i) == 32 for i in ids), ids    # a fresh random test id each run
H.broken = set()
print("ok smoke")

# main: writes the step summary + outputs, exit code 1 on a failed deploy or a failed smoke
tmp = tempfile.mkdtemp(); log = os.path.join(tmp, "deploy.log"); summ = os.path.join(tmp, "summary.md"); outp = os.path.join(tmp, "out")
os.environ["GITHUB_STEP_SUMMARY"], os.environ["GITHUB_OUTPUT"], os.environ["SMOKE_TRIES"] = summ, outp, "1"
open(log, "w").write("ok " + URL + NL)
assert d.main(["report", log]) == 0 and "ok=true" in open(outp).read() and "url=" + URL in open(outp).read() and "D1 bound: yes" in open(summ).read()
open(outp, "w").close(); open(summ, "w").close()
assert d.main(["smoke", URL, URL + "/"]) == 0 and "save round trip" in open(summ).read() and "smoke=true" in open(outp).read()
assert open(summ).read().count("D1 bound") == 2               # both the deployment URL and production are checked
open(log, "w").write("[{'code': 10000}] None" + NL)
assert d.main(["report", log]) == 1 and "ok=false" in open(outp).read()
# forced failure (D1 not bound on the live site): exit 1 -> the deploy job fails (GitHub deployment = failed, dashboard deploy event ok=false)
# and the workflow's deploy-failed job opens/comments the P0 issue "Deploy failed" (the orchestrator alarm)
H.broken = {"d1"}; open(outp, "w").close()
assert d.main(["smoke", URL]) == 1 and "smoke=false" in open(outp).read() and "FAILED: D1 bound" in open(summ).read()
H.broken = set()
wf = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".github", "workflows", "deploy.yml"), encoding="utf-8").read()
assert "deploy_ci.py smoke \"${{ steps.report.outputs.url }}\" https://oren-game.pages.dev" in wf, "smoke must check the deployment URL and production"
assert "needs.deploy.result == 'failure'" in wf and '"Deploy failed"' in wf and "--label P0" in wf
# #400: after pregen, the read-only missing-voice report runs (also when pregen failed) and its line becomes the dashboard's status
pg = wf.split("\n  pregen:")[1]
assert pg.index("node oren2/cf/tools/pregen.js") < pg.index("node oren2/cf/tools/voicemissing.js") and "context=voice-missing" in pg and "statuses: write" in pg
assert "state=success" in pg and "state=failure" not in pg                     # a missing count is never a failure
srv.shutdown()
print("ok main")

# plan: which sha this run deploys ("" = skip). attempted(sha) = a deploy of that sha was already tried (cache marker)
never, always = (lambda s: False), (lambda s: True)
assert d.plan("workflow_run", "b", "b", "b", never)[0] == "b"
sha, why = d.plan("workflow_run", "a", "b", "a", never); assert sha == "" and "main moved on" in why, why      # a newer commit deploys after its tests
sha, why = d.plan("workflow_run", "b", "b", "b", always); assert sha == "" and "already" in why, why           # a re-run of tests: no second deploy
assert d.plan("schedule", "", "c", "b", never)[0] == "b"                       # 15-min check: the newest GREEN main, even while main's newest tests run
sha, why = d.plan("schedule", "", "c", "b", always); assert sha == "" and "already" in why, why                # never redeploy (or re-fail) the same sha every 15 min
sha, why = d.plan("schedule", "", "c", "", never); assert sha == "" and "no green" in why, why
assert d.plan("workflow_dispatch", "", "c", "b", always)[0] == "c"            # manual run: always the newest main
os.environ.update(GITHUB_OUTPUT=outp, EVENT="schedule", RUN_SHA="", MAIN_SHA="c", GREEN_SHA="b")
open(outp, "w").close()
assert d.main(["plan"], attempted=never) == 0 and "sha=b" in open(outp).read() and "Deploy b" in open(summ).read()
open(outp, "w").close()
assert d.main(["plan"], attempted=always) == 0 and "sha=\n" in open(outp).read() and "Skipped" in open(summ).read()
print("ok plan")

# guard (deploy job, before the marker/deploy): an older planned sha never overwrites a newer one
assert d.guard("workflow_run", "b", "b", "b")[0] is True
ok, why = d.guard("workflow_run", "a", "b", "a"); assert not ok and "no longer" in why, why
assert d.guard("schedule", "b", "c", "b")[0] is True                          # newest green main, even while main's newest tests run
assert d.guard("schedule", "a", "c", "b")[0] is False                         # a newer green commit appeared while this run waited
assert d.guard("workflow_dispatch", "c", "c", "b")[0] is True
os.environ.update(EVENT="schedule", PLAN_SHA="a", MAIN_SHA="c", GREEN_SHA="b"); open(outp, "w").close()
assert d.main(["guard"]) == 0 and "current=false" in open(outp).read()
os.environ.update(PLAN_SHA="b"); open(outp, "w").close()
assert d.main(["guard"]) == 0 and "current=true" in open(outp).read()
print("ok guard")

# #618: the post-deploy regression tour: its TOUR line -> pass/fail + repro; a fail opens ONE P0 bug (+ the undo only after a passing tour)
assert d.tour_result("PASS daily-path desktop\nTOUR: PASS\n") == ("pass", "")
assert d.tour_result("FAIL story phone no question\nTOUR: FAIL story: open a story -> no question") == ("fail", "story: open a story -> no question")
res, why = d.tour_result("Error: browser crashed\n"); assert res == "fail" and "did not finish" in why and "crashed" in why, why
tl = os.path.join(tempfile.mkdtemp(), "tour.log"); open(tl, "w").write("TOUR: FAIL time-limit: +10 min did nothing\n"); open(outp, "w").close()
assert d.main(["tour", tl]) == 0 and "tour=fail" in open(outp).read() and "repro=time-limit: +10 min did nothing" in open(outp).read()
class R:
    def __init__(self, found=""): self.found, self.calls = found, []
    def __call__(self, cmd, **k):
        self.calls.append(cmd); return type("P", (), {"stdout": self.found if cmd[2] == "list" else ""})()
rr = R(); a, f = d.tour_issue({"REPRO": "help -> read is silent", "SHA": "abc1234ff", "TITLE": "x (#610)", "PREV": "pass"}, run=rr)
cr = rr.calls[-1]
assert cr[:3] == ["gh", "issue", "create"] and "Live tour failed after deploy abc1234" in cr and a["undo"], cr
assert [cr[i + 1] for i, c in enumerate(cr) if c == "--label"] == ["P0", "bug", "express", "ready-for-agent", "pack"], cr
assert "git revert --no-edit abc1234ff" in a["body"] and d.TESTER_MARK in a["body"]
rr = R(); a, _ = d.tour_issue({"REPRO": "r", "SHA": "abc1234ff", "PREV": "fail"}, run=rr)
assert not a["undo"] and "express" not in rr.calls[-1] and "git revert" not in a["body"]       # broken before: fix forward, no undo
rr = R("77"); a, f = d.tour_issue({"REPRO": "r", "SHA": "abc1234ff", "PREV": "pass"}, run=rr)
assert f == "77" and rr.calls[-1][:4] == ["gh", "issue", "comment", "77"] and len(rr.calls) == 2      # a rerun never opens it twice
print("ok tour (#618)")
