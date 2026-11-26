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

# smoke: page loads, save round trip, /api/tts/status - against a fake site
STORE = {}
class H(BaseHTTPRequestHandler):
    broken = set()
    def log_message(self, *a): pass
    def _send(self, code, body, ct="application/json"):
        b = body.encode(); self.send_response(code); self.send_header("content-type", ct); self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path == "/" and "page" not in H.broken: return self._send(200, "<html><body><div id=app>game</div></body></html>", "text/html")
        if self.path.startswith("/api/save/") and self.path in STORE and "save" not in H.broken: return self._send(200, STORE[self.path])
        if self.path == "/api/tts/status" and "tts" not in H.broken: return self._send(200, json.dumps({"ok": True, "ver": 3}))
        self._send(404, "{}")
    def do_PUT(self):
        t = self.rfile.read(int(self.headers["content-length"])).decode()
        STORE[self.path] = t; self._send(200, '{"ok":true}')
srv = ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{srv.server_address[1]}"
res = d.smoke(URL, tries=1)
assert all(r[1] for r in res) and [r[0] for r in res] == ["page loads", "save round trip", "/api/tts/status"], res
assert list(STORE) == ["/api/save/" + d.SMOKE_ID] and json.loads(STORE["/api/save/" + d.SMOKE_ID])["v"] == 4
for part, name in (("page", "page loads"), ("save", "save round trip"), ("tts", "/api/tts/status")):
    H.broken = {part}
    res = dict(d.smoke(URL, tries=1)); assert res[name] is False and sum(not v for v in res.values()) == 1, (part, res)
H.broken = set()
print("ok smoke")

# main: writes the step summary + outputs, exit code 1 on a failed deploy or a failed smoke
tmp = tempfile.mkdtemp(); log = os.path.join(tmp, "deploy.log"); summ = os.path.join(tmp, "summary.md"); outp = os.path.join(tmp, "out")
os.environ["GITHUB_STEP_SUMMARY"], os.environ["GITHUB_OUTPUT"], os.environ["SMOKE_TRIES"] = summ, outp, "1"
open(log, "w").write("ok " + URL + NL)
assert d.main(["report", log]) == 0 and "ok=true" in open(outp).read() and "url=" + URL in open(outp).read() and "D1 bound: yes" in open(summ).read()
assert d.main(["smoke", URL]) == 0 and "save round trip" in open(summ).read()
open(log, "w").write("[{'code': 10000}] None" + NL)
assert d.main(["report", log]) == 1 and "ok=false" in open(outp).read()
H.broken = {"tts"}
assert d.main(["smoke", URL]) == 1
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
