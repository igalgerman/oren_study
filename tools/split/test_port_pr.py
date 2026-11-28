# #814: python tools/split/test_port_pr.py  (fixture repos with local remotes, a fake gh)
import json, os, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C, export as E, port_pr as P

OTHER = "someone" + "@" + "example.org"
NEUTRAL = C.neutral_email()
tmp = Path(tempfile.mkdtemp(prefix="port-test-"))

def sh(cwd, *a):
    e = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": OTHER, "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": OTHER}
    r = subprocess.run(["git", "-C", str(cwd), *a], capture_output=True, text=True, env=e); assert r.returncode == 0, (a, r.stderr); return r.stdout.strip()
def put(root, files):
    for p, t in files.items():
        f = Path(root) / p; f.parent.mkdir(parents=True, exist_ok=True); f.write_text(t, newline="\n")
def mk(name, files):
    bare = tmp / f"{name}.git"; subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(bare)], check=True)
    w = tmp / name; subprocess.run(["git", "init", "-q", "-b", "main", str(w)], check=True)
    put(w, files); sh(w, "remote", "add", "origin", str(bare)); sh(w, "add", "-A"); sh(w, "commit", "-qm", "start"); sh(w, "push", "-q", "-u", "origin", "main")
    return bare, w

BASE = {"oren2/a.js": "line1\nline2\nline3\n", "oren2/b.js": "b\n", "FLOW.md": "flow\n"}
ibare, infra = mk("infra", BASE)
gbare, game = mk("game", {"oren2/a.js": "line1\nline2\nline3\n", "oren2/b.js": "b\n"})
# the old-repo PR: changes a game file, a new game file, an infra-only file
sh(infra, "checkout", "-q", "-b", "lane/42"); put(infra, {"oren2/a.js": "line1\nline2 NEW\nline3\n", "oren2/c.js": "c\n", "FLOW.md": "flow2\n"})
sh(infra, "add", "-A"); sh(infra, "commit", "-qm", "work"); sh(infra, "push", "-q", "origin", "lane/42"); sh(infra, "checkout", "-q", "main")

calls = []
def fake(cmd, input=None):
    calls.append(cmd)
    if cmd[:3] == ["gh", "pr", "view"]:
        return 0, json.dumps({"number": 7, "state": "OPEN", "title": "Make mission X easier", "body": "Fixes #42", "headRefName": "lane/42", "baseRefName": "main"})
    if cmd[:2] == ["gh", "api"]: return 0, json.dumps({"html_url": "https://example.test/pr/1"})
    return 0, ""
E.RUN = fake

# clean port: lane/<issue> branch + PR in GAME, game files only, neutral commit
assert P.port(7, infra, game, "o/game", "o/infra") == 0
assert sh(gbare, "show", "lane/42:oren2/a.js") == "line1\nline2 NEW\nline3" and sh(gbare, "show", "lane/42:oren2/c.js") == "c"
assert "FLOW.md" not in sh(gbare, "ls-tree", "-r", "--name-only", "lane/42")
assert sh(gbare, "log", "main..lane/42", "--format=%ae %ce") == f"{NEUTRAL} {NEUTRAL}"
api = [c for c in calls if c[:2] == ["gh", "api"]]
assert len(api) == 1 and "head=lane/42" in api[0] and "base=main" in api[0]
assert not any(a == "head=main" for a in api[0]) and "refs/heads/main" not in sh(gbare, "for-each-ref", "--format=%(refname)", "refs/heads/lane").split()
assert not [c for c in calls if c[:3] == ["gh", "issue", "edit"]]                        # nothing went back to ready
print("ok port")

# conflict: GAME main changed the same line; nothing applied, nothing pushed, issue back in ready with ONE note
sh(game, "checkout", "-q", "main"); put(game, {"oren2/a.js": "line1\nline2 OTHER\nline3\n"}); sh(game, "commit", "-qam", "game edit"); sh(game, "push", "-q", "origin", "main")
sh(gbare, "branch", "-D", "lane/42"); sh(game, "branch", "-D", "lane/42")
calls.clear()
assert P.port(7, infra, game, "o/game", "o/infra") == 1
assert not sh(gbare, "for-each-ref", "refs/heads/lane") and not [c for c in calls if c[:2] == ["gh", "api"]]
assert sh(game, "status", "--porcelain") == "" and sh(game, "branch", "--list", "lane/42") == ""
edits = [c for c in calls if c[:3] == ["gh", "issue", "edit"]]; notes = [c for c in calls if c[:3] == ["gh", "issue", "comment"]]
assert len(edits) == 1 and "ready-for-agent" in edits[0] and "in-progress" in edits[0] and len(notes) == 1 and "42" in edits[0]
print("ok conflict")

# a PR that touches no game file; a closed PR
sh(infra, "checkout", "-q", "-b", "lane/43"); put(infra, {"FLOW.md": "flow3\n"}); sh(infra, "commit", "-qam", "infra only"); sh(infra, "push", "-q", "origin", "lane/43"); sh(infra, "checkout", "-q", "main")
E.RUN = lambda cmd, input=None: (0, json.dumps({"number": 8, "state": "OPEN", "title": "t", "body": "Fixes #43", "headRefName": "lane/43", "baseRefName": "main"}))
assert P.port(8, infra, game, "o/game", "o/infra") == 0
E.RUN = lambda cmd, input=None: (0, json.dumps({"number": 9, "state": "MERGED", "title": "t", "body": "", "headRefName": "lane/43", "baseRefName": "main"}))
assert P.port(9, infra, game, "o/game", "o/infra") == 2
assert P.issue_of("Closes #5, fixes #6", 9) == 5 and P.issue_of("", 9) == 9
print("test_port_pr ok")
