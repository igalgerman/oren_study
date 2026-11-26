"""#326 main sync + reloads: alarm when the main checkout is behind 10+ min or the sync is skipped twice in a row (names the
dirty files); after a sync that changes the panel mod -> /reload-plugins to the orchestrator when idle; CLAUDE.md /
ORCHESTRATOR.md / the inbox prompt changed -> that session is told to re-read it (one send, when idle); nightly: helper
worktrees under .claude/worktrees whose branch is pushed and merged/closed are removed. All with fakes.
Run: python3 tools/runner/test_mainsync.py"""
import os, tempfile; os.environ["OREN_TEST"] = "1"; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229
import json, subprocess, sys
from pathlib import Path
sys.argv.append("--dry-run")
import runner as R
import mainsync as M
import nightly as N
import watchdog as W

NOW = 1_800_000_000.0

# ---- 1. health: pure alarm rules ----
st = {}
skip = {"act": "skip", "behind": 3, "why": "main checkout has uncommitted changes", "dirty": ["oren2/index.html", "FLOW.md"]}
st, al = M.health(st, skip, NOW)
assert al is None, "one skip: no alarm yet"
st, al = M.health(st, skip, NOW + 180)
assert al and "2 times in a row" in al and "oren2/index.html" in al and "FLOW.md" in al and "3 commits behind" in al, al
st, al = M.health(st, skip, NOW + 360)
assert al is None, "same episode: not again within the hour"
st, al = M.health(st, skip, NOW + 180 + 3600)
assert al, "still stuck an hour later: once more"
st, al = M.health(st, {"act": "pull", "behind": 3}, NOW + 4000)
assert al is None and not st.get("since") and st.get("skips") == 0, st
# behind 10+ min without two skips in a row (e.g. ff-only failures alternating with network errors) -> alarm
st = {}
fail = {"act": "fail", "behind": 2, "why": "ff-only rc 1 not possible", "dirty": []}
st, al = M.health(st, fail, NOW)
assert al is None
st, al = M.health(st, {"act": "net", "behind": None}, NOW + 300)   # network error: unknown, the clock keeps running
assert al is None
st, al = M.health(st, {"act": "net", "behind": None}, NOW + 601)
assert al and "behind origin/main for 10 min" in al, al
# up to date -> reset
st, al = M.health(st, {"act": "none", "behind": 0}, NOW + 700)
assert al is None and st.get("skips") == 0 and not st.get("since")

# ---- 2. reload plan: pure ----
assert M.reload_plan(["oren2/talents.js"], "a", "a") == {}
p = M.reload_plan(["tools/mods/oren-lanes/hooks/lanes.ts", "CLAUDE.md"], "a", "a")
assert p["orchestrator"][0] == "/reload-plugins" and len(p["orchestrator"]) == 2 and "CLAUDE.md" in p["orchestrator"][1], p
assert len(p["inbox"]) == 1 and "CLAUDE.md" in p["inbox"][0], p
assert "inspector" not in p
p = M.reload_plan(["ORCHESTRATOR.md", "CLAUDE.md"], "a", "a")
assert len(p["orchestrator"]) == 1 and "ORCHESTRATOR.md" in p["orchestrator"][0] and "CLAUDE.md" in p["orchestrator"][0], "ONE send per session"
assert "ORCHESTRATOR.md" not in p["inbox"][0]
p = M.reload_plan(["tools/runner/recover.py"], "old prompt", "NEW PROMPT")
assert list(p) == ["inbox"] and "NEW PROMPT" in p["inbox"][0], p
assert M.reload_plan(["tools/runner/recover.py"], "same", "same") == {}, "recover.py changed elsewhere: no send"

# inbox prompt read from a recover.py source
src = 'X = 1\nINBOX_PROMPT = ("You are the INBOX. "\n                "Wait.")\n'
assert M.inbox_prompt(src) == "You are the INBOX. Wait."
assert M.inbox_prompt("nothing here") == "" and M.inbox_prompt("def (") == ""

# ---- 3. deliver: one message per session per tick, only when idle; a failed send is kept ----
pending = {"orchestrator": ["/reload-plugins", "re-read"], "inbox": ["re-read inbox"]}
sent = []
status = {"orchestrator": "idle", "inbox": "working"}
left = M.deliver(pending, lambda n: status[n], lambda n, t: (sent.append((n, t)), 0)[1])
assert sent == [("orchestrator", "/reload-plugins")] and left == {"orchestrator": ["re-read"], "inbox": ["re-read inbox"]}, (sent, left)
left = M.deliver(left, lambda n: "working", lambda n, t: (sent.append((n, t)), 0)[1])
assert len(sent) == 1, "busy: nothing sent"
left = M.deliver(left, lambda n: "done", lambda n, t: 1)             # hc send failed: kept
assert left == {"orchestrator": ["re-read"], "inbox": ["re-read inbox"]}
left = M.deliver(left, lambda n: "blocked", lambda n, t: 0)          # a menu is open: never type into it
assert left == {"orchestrator": ["re-read"], "inbox": ["re-read inbox"]}
left = M.deliver(left, lambda n: "idle", lambda n, t: 0)
assert left == {}

# ---- 4. after_sync + tick with fakes: state on disk (a watchdog reload must not lose a pending send) ----
M.STATE = R.RUNS / "mainsync.json"
said, logs = [], []
shows = {"OLD:tools/runner/recover.py": 'INBOX_PROMPT = ("old")', "NEW:tools/runner/recover.py": 'INBOX_PROMPT = ("new one")'}
M.show = lambda rev, path: shows.get(f"{rev}:{path}", "")
info = {"act": "pull", "behind": 2, "old": "OLD", "new": "NEW",
        "changed": ["tools/mods/oren-lanes/hooks/lanes.ts", "tools/runner/recover.py"]}
M.after_sync(info, NOW, say=said.append, log=logs.append)
st = json.loads(M.STATE.read_text(encoding="utf-8"))
assert st["pending"] == {"orchestrator": ["/reload-plugins"], "inbox": [M.reload_plan(["x"], "old", "new one")["inbox"][0]]}, st
assert any("/reload-plugins" in l for l in logs), logs
sends = []
R.hc_json = lambda *a: {"state": "live", "status": {"state": "idle"}}
R.hc = lambda *a, timeout=300: (sends.append(a), (0, ""))[1]
M.deliver_tick(log=logs.append)
assert ("send", "orchestrator", "/reload-plugins") in sends and any(s[1] == "inbox" and "new one" in s[2] for s in sends), sends
assert json.loads(M.STATE.read_text(encoding="utf-8"))["pending"] == {}
# skips -> the alarm goes to say() (the watchdog: orchestrator + inspector)
M.after_sync(skip, NOW, say=said.append, log=logs.append)
M.after_sync(skip, NOW + 180, say=said.append, log=logs.append)
assert len(said) == 1 and "FLOW.md" in said[0], said

# ---- 5. sync_main fills info (real git, two temp repos) ----
tmp = Path(tempfile.mkdtemp(prefix="sync-"))
def git(*a, cwd): return subprocess.run(["git", *a], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()
origin, main = tmp / "origin.git", tmp / "main"
git("init", "-q", "--bare", "-b", "main", str(origin), cwd=tmp)
git("clone", "-q", str(origin), str(main), cwd=tmp)
for k, v in (("user.email", "t@t"), ("user.name", "t")): git("config", k, v, cwd=main)
(main / "CLAUDE.md").write_text("v1\n"); git("add", ".", cwd=main); git("commit", "-qm", "1", cwd=main); git("push", "-q", "origin", "main", cwd=main)
other = tmp / "other"; git("clone", "-q", str(origin), str(other), cwd=tmp)
for k, v in (("user.email", "t@t"), ("user.name", "t")): git("config", k, v, cwd=other)
(other / "CLAUDE.md").write_text("v2\n"); git("commit", "-qam", "2", cwd=other); git("push", "-q", "origin", "main", cwd=other)
R.MAIN_CHECKOUT, R.REMOTE, R.BRANCH = main, "origin", "main"
R.run = lambda cmd, timeout=None, **kw: (lambda p: (p.returncode, p.stdout + p.stderr))(subprocess.run(cmd, capture_output=True, text=True))
(main / "CLAUDE.md").write_text("local edit\n")                     # dirty -> skip, names the file
info = {}
assert "uncommitted" in R.sync_main(info=info)
assert info["act"] == "skip" and info["behind"] == 1 and info["dirty"] == ["CLAUDE.md"], info
git("checkout", "--", "CLAUDE.md", cwd=main)
info = {}
assert "fast-forwarded" in R.sync_main(info=info)
assert info["act"] == "pull" and info["changed"] == ["CLAUDE.md"] and info["old"] != info["new"], info
info = {}
assert R.sync_main(info=info) == "" and info["act"] == "none" and info["behind"] == 0, info

# ---- 6. watchdog sync_tick wires it: info to mainsync, pending delivered every tick ----
calls = []
R.sync_main = lambda log=None, info=None: (info.update(act="pull", behind=1, changed=[]), "main checkout fast-forwarded (1 commits)")[1]
M.after_sync = lambda info, now, say, log: calls.append(("after", info["act"]))
M.deliver_tick = lambda log: calls.append(("deliver",))
W.log = lambda m: None
W._sync.update(last=0.0, msg=""); W._net.clear()
W.sync_tick()
assert calls == [("deliver",), ("after", "pull")], calls
W.sync_tick()                                                        # within sync_minutes: no sync, but delivery still runs
assert calls[-1] == ("deliver",) and len(calls) == 3, calls

# ---- 7. nightly: helper worktrees under .claude/worktrees ----
prs = [{"headRefName": "worktree-a", "headRefOid": "aaa", "state": "MERGED"},
       {"headRefName": "worktree-b", "headRefOid": "bbb", "state": "CLOSED"},
       {"headRefName": "worktree-c", "headRefOid": "ccc", "state": "OPEN"},
       {"headRefName": "worktree-d", "headRefOid": "old", "state": "MERGED"}]
rows = [{"path": "wa", "branch": "worktree-a", "head": "aaa", "dirty": False, "remote_has_head": False},   # PR merged at its head
        {"path": "wb", "branch": "worktree-b", "head": "bbb", "dirty": False, "remote_has_head": True},    # closed
        {"path": "wc", "branch": "worktree-c", "head": "ccc", "dirty": False, "remote_has_head": True},    # PR still open: keep
        {"path": "wd", "branch": "worktree-d", "head": "new", "dirty": False, "remote_has_head": False},   # commits after the PR, not pushed: keep
        {"path": "we", "branch": "worktree-e", "head": "eee", "dirty": False, "remote_has_head": True},    # no PR: keep
        {"path": "wf", "branch": "worktree-a", "head": "aaa", "dirty": True, "remote_has_head": True},     # uncommitted work: keep
        {"path": "wg", "branch": "HEAD", "head": "aaa", "dirty": False, "remote_has_head": True}]         # detached: keep
assert N.stale_worktrees(rows, prs) == ["wa", "wb"], N.stale_worktrees(rows, prs)
assert N.stale_worktrees(rows, prs + [{"headRefName": "worktree-a", "headRefOid": "aaa", "state": "OPEN"}]) == ["wb"], "an open PR keeps it"

N.STATE = R.RUNS / "nightly.state.json"; N.save_state({})
real_rows = N.worktree_rows
removed, logs = [], []
N.worktree_rows = lambda: rows
N.GH = lambda argv, **kw: (0, json.dumps(prs))
R.remove_worktree = lambda wt, log=None: removed.append(wt)
assert N.worktrees_if_due(logs.append, now=NOW) == ["wa", "wb"] and removed == ["wa", "wb"]
assert any("worktree" in l and "wa" in l for l in logs), logs
assert N.worktrees_if_due(logs.append, now=NOW + 60) is None and len(removed) == 2, "once a day"
N.save_state({}); N.GH = lambda argv, **kw: (1, "Could not resolve host")
assert N.worktrees_if_due(logs.append, now=NOW) is None and len(removed) == 2 and not N.load_state().get("worktrees_day"), "gh down: retried"

# worktree_rows reads real git worktrees (temp repo)
wt_root = main / ".claude" / "worktrees"
git("worktree", "add", "-q", "-b", "worktree-x", str(wt_root / "x"), cwd=main)
N.R.MAIN_CHECKOUT = main
got = real_rows()
assert len(got) == 1 and got[0]["branch"] == "worktree-x" and got[0]["dirty"] is False and got[0]["remote_has_head"] is False, got
assert got[0]["head"] == git("rev-parse", "HEAD", cwd=wt_root / "x")
print("test_mainsync: ok")
