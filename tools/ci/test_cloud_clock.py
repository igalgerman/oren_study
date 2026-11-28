# #857: python3 tools/ci/test_cloud_clock.py  (fake HTTP server + fake GitHub api, no real call)
import http.server, json, os, pathlib, re, sys, threading, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cloud_clock as c

seen, code = [], [200]
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        seen.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
        self.send_response(code[0]); self.end_headers()
    def log_message(self, *a): pass
srv = http.server.HTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
os.environ["CLAUDE_TRIGGER_URL"] = f"http://127.0.0.1:{srv.server_port}/fire"
os.environ["CLAUDE_TRIGGER_TOKEN"] = "tok-secret-857"
os.environ["GITHUB_TOKEN"] = "ghs-secret-857"

calls = []
def fake_api(method, path, token, body=None, existing=()):
    calls.append((method, path, body)); return list(existing) if method == "GET" else {}

# observer + retro send their own prompt
assert c.main(["x", "observer"], api=fake_api) == 0 and "AI observer" in seen[-1]["text"]
assert c.main(["x", "retro"], api=fake_api) == 0 and "Nightly retro" in seen[-1]["text"] and calls == []
print("ok observer and retro prompts, no comment on success")

# failure: red + one comment on #528, no secrets in the comment
code[0] = 503
assert c.main(["x", "observer"], api=fake_api) == 1
posts = [x for x in calls if x[0] == "POST"]
assert len(posts) == 1 and "/issues/528/comments" in posts[0][1] and c.FAIL_MARK in posts[0][2]["body"]
assert "tok-secret-857" not in posts[0][2]["body"] and "127.0.0.1" not in posts[0][2]["body"]
print("ok failed trigger: red + one comment on #528")

# not repeated within 6 h; again after 6 h
now = time.time()
iso = lambda e: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(e))
recent = [{"body": c.FAIL_MARK + " x", "created_at": iso(now - 3600)}]
old = [{"body": c.FAIL_MARK + " x", "created_at": iso(now - 7 * 3600)}]
calls.clear()
assert not c.report_failure("observer", "l", "t", now, api=lambda m, p, t, b=None: fake_api(m, p, t, b, recent))
assert not [x for x in calls if x[0] == "POST"]
calls.clear()
assert c.report_failure("observer", "l", "t", now, api=lambda m, p, t, b=None: fake_api(m, p, t, b, old))
assert [x for x in calls if x[0] == "POST"]
print("ok no second comment within 6 h")

# missing secrets: red, one line
del os.environ["CLAUDE_TRIGGER_TOKEN"]
assert c.main(["x", "observer"], api=fake_api) == 1
assert c.main(["x", "bogus"], api=fake_api) == 2
print("ok missing secrets / bad kind")

# workflow parse: schedule + dispatch only, secrets masked and never echoed
wf = (pathlib.Path(__file__).parents[2] / ".github" / "workflows" / "cloud-clock.yml").read_text()
on = re.search(r"^on:\n((?:[ ]+.*\n|\n)+)", wf, re.M).group(1)
assert re.findall(r"^  (\w+):", on, re.M) == ["schedule", "workflow_dispatch"], on
crons = re.findall(r'cron: "([^"]+)"', wf)
assert len(crons) == 2 and crons[0].split()[1] == "*" and crons[1].split()[1] != "*", crons
assert "add-mask" in wf and "secrets.CLAUDE_TRIGGER_TOKEN" in wf and "timeout-minutes: 3" in wf
for ln in wf.splitlines():
    if re.match(r"\s*(echo|print|cat)\b", ln) and "TRIGGER" in ln: assert "add-mask" in ln, ln
print("ok workflow: schedule + dispatch, hourly + nightly, secrets masked")
