# #853: python3 tools/ci/test_cloud_trigger.py  (fake HTTP server, no real call)
import http.server, json, os, pathlib, re, sys, threading
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cloud_trigger as c

seen, code = [], [200]
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        seen.append((self.headers.get("Authorization"), json.loads(self.rfile.read(int(self.headers["Content-Length"])))))
        self.send_response(code[0]); self.end_headers()
    def log_message(self, *a): pass
srv = http.server.HTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = f"http://127.0.0.1:{srv.server_port}/fire"

ok, line = c.fire(url, "tok123", "do issue 5")
assert ok and seen == [("Bearer tok123", {"text": "do issue 5"})], (ok, seen)
print("ok request builder: POST, bearer token, prompt in text")
for status in (401, 429, 500, 503):
    code[0] = status; n = len(seen)
    ok, line = c.fire(url, "tok123", "x")
    assert not ok and str(status) in line and "\n" not in line and "tok123" not in line and url not in line, line
    assert len(seen) == n + 1, "no retry"
print("ok 401/429/5xx: one line, no secrets, one request")
ok, line = c.fire("http://127.0.0.1:1/x", "t", "x", timeout=2)
assert not ok and "\n" not in line
print("ok network error: one line")

wf = (pathlib.Path(__file__).parents[2] / ".github" / "workflows" / "cloud-trigger.yml").read_text()
on = re.search(r"^on:\n((?:[ ]+.*\n|\n)+)", wf, re.M).group(1)
assert re.findall(r"^  (\w+):", on, re.M) == ["workflow_dispatch"], on
assert "add-mask" in wf and "secrets.CLAUDE_TRIGGER_TOKEN" in wf
print("ok workflow has only workflow_dispatch, masks secrets")
