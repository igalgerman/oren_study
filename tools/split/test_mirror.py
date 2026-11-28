# #854: python tools/split/test_mirror.py  (two fixture repos with local remotes, a fake gh; no network)
import io, json, os, subprocess, sys, tempfile, contextlib
from pathlib import Path
os.environ["PRIVATE_NAMES"] = "Zorro,זורו"; os.environ["PRIVATE_NAMES_FILE"] = os.devnull; os.environ["SPLIT_PERSONAL_LIST"] = os.devnull
tmp = Path(tempfile.mkdtemp(prefix="mirror-test-")); os.environ["RUNNER_RUNS"] = str(tmp / "runs")
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C, export as E, mirror as M

NEUTRAL, OTHER = C.neutral_email(), "someone" + "@" + "example.org"
def sh(cwd, *a, ok=False):
    e = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": OTHER, "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": OTHER}
    r = subprocess.run(["git", "-C", str(cwd), *a], capture_output=True, text=True, env=e); assert r.returncode == 0 or ok, (a, r.stderr); return r.stdout.strip()
def put(root, files):
    for p, t in files.items():
        f = Path(root) / p; f.parent.mkdir(parents=True, exist_ok=True); f.write_text(t, encoding="utf-8", newline="\n")

FILES = {"oren2/index.html": "".join(f"line {i}\n" for i in range(1, 21)), "oren2/talents.js": "// t\n", "tools/split/game_CLAUDE.md": "# game rules\n",
         "FLOW.md": "flow\n", "tools/runner/x.py": "infra\n"}
infra = tmp / "infra"; infra.mkdir(); put(infra, FILES)
ibare, gbare, gw = tmp / "i.git", tmp / "g.git", tmp / "game"
for b in (ibare, gbare): subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(b)], check=True)
subprocess.run(["git", "init", "-q", "-b", "main", str(infra)], check=True)
sh(infra, "remote", "add", "origin", str(ibare)); sh(infra, "add", "-A"); sh(infra, "commit", "-qm", "start"); sh(infra, "push", "-q", "-u", "origin", "main")
subprocess.run(["git", "clone", "-q", str(gbare), str(gw)], check=True, capture_output=True)
calls = []
def fake_gh(cmd, input=None):
    calls.append(cmd)
    if cmd[:3] == ["gh", "pr", "view"]: return 0, json.dumps({"state": pr_state[0]})
    if "pulls" in " ".join(cmd):
        prs.append(cmd); return 0, json.dumps({"html_url": f"https://example.test/o/g/pull/{len(prs)}"})
    return 0, ""
prs, pr_state, alarms = [], ["OPEN"], []
E.RUN = fake_gh
with contextlib.redirect_stdout(io.StringIO()): assert E.sync(infra, gw, "o/g") == 0          # first import
imp = sh(gbare, "for-each-ref", "--format=%(refname:short)").split()[0]; sh(gbare, "branch", "-m", imp, "main")
def tick(now=1000.0):
    sh(gw, "fetch", "-q", "origin"); return M.tick(infra, gw, run=fake_gh, say=alarms.append, now=now)
def merge_pr():                                       # the mirror PR is merged (squash = the branch tip becomes main here)
    br = [r for r in sh(gbare, "for-each-ref", "--format=%(refname:short)").split() if r.startswith("mirror/")][-1]
    sh(gbare, "update-ref", "refs/heads/main", f"refs/heads/{br}"); sh(gbare, "branch", "-D", br); pr_state[0] = "MERGED"
def commit_infra(files, msg="infra"):
    put(infra, files); sh(infra, "add", "-A"); sh(infra, "commit", "-qm", msg); sh(infra, "push", "-q", "origin", "main")
def reset_gw(): sh(gw, "fetch", "-q", "origin"); sh(gw, "checkout", "-q", "--detach", "origin/main")

# ---- no change: no PR, no gh call, and again
assert "no allowlisted" in tick() and not prs
# an INFRA commit outside the allowlist: no PR
commit_infra({"FLOW.md": "flow2\n"}); assert "no allowlisted change" in tick() and not prs
n = len(calls); assert tick() == "nothing to mirror" and len(calls) == n          # idle tick: zero gh calls
print("ok no change")

# ---- one delta: PR, neutral author, label, auto-merge, range only in title/body, state file, patch not overwrite
commit_infra({"oren2/talents.js": "// t2\n", "tools/split/game_CLAUDE.md": "# game rules v2\n", "FLOW.md": "flow3 SECRET-PR-TEXT\n"}, "do not leak this text")
r = tick(); assert r.startswith("mirror PR #1"), r
assert len(prs) == 1 and "head=mirror/" + sh(infra, "rev-parse", "HEAD")[:12] in prs[0] and "base=main" in prs[0]
joined = " ".join(prs[0]); assert "leak" not in joined and "SECRET" not in joined and "Mirror INFRA " in joined
assert any("labels[]=mirror" in " ".join(c) for c in calls) and any(c[:3] == ["gh", "pr", "merge"] and "--auto" in c for c in calls)
br = "mirror/" + sh(infra, "rev-parse", "HEAD")[:12]
assert sh(gbare, "show", f"{br}:oren2/talents.js") == "// t2" and sh(gbare, "show", f"{br}:CLAUDE.md") == "# game rules v2"
assert sh(gbare, "show", f"{br}:.mirror-state") == sh(infra, "rev-parse", "HEAD") and C.commits_bad(gbare, f"main..{br}") == 0
assert sh(gbare, "show", f"{br}:FLOW.md", ok=True) == ""
n = len(calls); assert "still open" in tick() and len(calls) == n + 1            # one call while a PR is open
merge_pr(); assert "no allowlisted" in tick(); assert len(prs) == 1
print("ok one delta")

# ---- several INFRA merges inside one tick = ONE PR; a commit made directly in GAME survives
sh(gw, "fetch", "-q", "origin"); sh(gw, "checkout", "-q", "-B", "w", "origin/main"); put(gw, {"oren2/index.html": "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\nline 9\nline 10\nGAME EDIT\nline 11\nline 12\nline 13\nline 14\nline 15\nline 16\nline 17\nline 18\nline 19\nline 20\n"})
C.git(gw, "add", "-A"); C.commit(gw, "direct game commit"); C.git(gw, "push", "-q", "origin", "w:main"); reset_gw()
idx = FILES["oren2/index.html"].replace("line 18\n", "line 18 INFRA\n")
commit_infra({"oren2/index.html": idx}, "one"); commit_infra({"oren2/new.js": "// new\n"}, "two")
prs.clear(); r = tick(); assert r.startswith("mirror PR") and len(prs) == 1, r
br = "mirror/" + sh(infra, "rev-parse", "HEAD")[:12]
got = sh(gbare, "show", f"{br}:oren2/index.html"); assert "GAME EDIT" in got and "line 18 INFRA" in got and sh(gbare, "show", f"{br}:oren2/new.js") == "// new"
merge_pr(); tick()
print("ok several deltas + direct GAME commit survives")

# ---- status: lag 0 only while the trees are equal; GAME-only edit shows as not equal
reset_gw(); out = "\n".join(M.status_lines(infra, gw)); assert "0 INFRA commits behind" in out
commit_infra({"oren2/talents.js": "// t3\n"}); out = "\n".join(M.status_lines(infra, gw)); assert "1 INFRA commits behind" in out and "(lag 0)" not in out, out
tick(); merge_pr(); tick(); reset_gw(); out = "\n".join(M.status_lines(infra, gw)); assert "0 INFRA commits behind" in out, out
print("ok status")

# ---- conflict: nothing half-applied, ONE alarm, mirror pauses, no new PR
sh(gw, "checkout", "-q", "-B", "w", "origin/main"); put(gw, {"oren2/talents.js": "// GAME wins\n"}); C.git(gw, "add", "-A"); C.commit(gw, "game edits same line"); C.git(gw, "push", "-q", "origin", "w:main"); reset_gw()
commit_infra({"oren2/talents.js": "// infra other\n"}); prs.clear(); alarms.clear()
r = tick(); assert r == "paused: conflict" and len(alarms) == 1 and sh(infra, "rev-parse", "HEAD")[:12] in alarms[0] and not prs, (r, alarms)
assert sh(gw, "status", "--porcelain") == "" and not [x for x in sh(gbare, "for-each-ref", "--format=%(refname:short)").split() if x.startswith("mirror/")]
assert tick(2000.0) == "paused" and len(alarms) == 1 and len(prs) == 0
# lag alarm: paused for over 30 minutes = ONE alarm, once
tick(1000.0 + 31 * 60); tick(1000.0 + 40 * 60); assert len(alarms) == 2 and "lag" in alarms[1]
print("ok conflict pause + lag alarm")

# ---- --resume after the conflict is solved in GAME (the clashing edit is undone there): the mirror goes on
sh(gw, "checkout", "-q", "-B", "w", "origin/main"); put(gw, {"oren2/talents.js": "// t3\n"}); C.git(gw, "add", "-A"); C.commit(gw, "owner undoes the GAME edit"); C.git(gw, "push", "-q", "origin", "w:main"); reset_gw()
M.resume(); alarms.clear()
r = tick(5000.0); assert r.startswith("mirror PR") or "no allowlisted" in r, r
if r.startswith("mirror PR"): merge_pr()
print("ok resume")

# ---- verify hit: stops with one alarm naming path and count, never the text
commit_infra({"oren2/leak.js": "hi Zorro\n"}); prs.clear(); alarms.clear()
r = tick(6000.0); assert r == "paused: verify" and len(alarms) == 1 and "oren2/leak.js" in alarms[0] and "Zorro" not in alarms[0] and not prs, (r, alarms)
assert sh(gw, "status", "--porcelain") == ""
print("ok verify hit")

# ---- restart: state in GAME + runs file; a PR closed without merge pauses; --stop
M.resume(); commit_infra({"oren2/leak.js": "clean\n"})
r = tick(7000.0); assert r.startswith("mirror PR"), r
n_state = M.load(); assert n_state["pr"]
import importlib; importlib.reload(M)                                  # "restart": a fresh process reads the files again
pr_state[0] = "CLOSED"; alarms.clear(); assert "paused" in tick(7100.0) and len(alarms) == 1
M.resume(); assert M.load()["paused"] == "" and "stopped" in M.stop()
assert M.tick(infra, gw, run=fake_gh, say=alarms.append) == "stopped"
print("ok restart + stop")
print("test_mirror ok")
