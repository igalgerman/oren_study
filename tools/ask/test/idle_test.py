"""#125: an idle pre-connect (browsers open one and send nothing) must not block the page. Run: python3 tools/ask/test/idle_test.py"""
import json, os, re, socket, subprocess, sys, tempfile, urllib.request
here = os.path.dirname(os.path.abspath(__file__))
q = os.path.join(tempfile.mkdtemp(), "q.json")
json.dump({"title": "t", "intro": "", "questions": [{"id": "a", "text": "?", "options": ["x", "y"]}]}, open(q, "w", encoding="utf-8"))
p = subprocess.Popen([sys.executable, os.path.join(here, "..", "ask.py"), q, "--timeout-min", "1"],
                     env={**os.environ, "ASK_NO_BROWSER": "1"}, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL, text=True)
try:
    url = p.stderr.readline().strip()
    idle = socket.create_connection(("127.0.0.1", int(re.search(r":(\d+)/", url).group(1))))
    body = urllib.request.urlopen(url, timeout=5).read()
    assert b"<form" in body, body[:200]
    idle.close(); print("ok ask idle pre-connect")
finally:
    p.kill()
