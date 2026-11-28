# Unit test for gitid.py + its wiring (#889): python tools/runner/test_gitid.py
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-"); os.environ["OREN_TEST"] = "1"
import sys, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gitid, remote, runner

NOREPLY = "4981680+igalgerman@users.noreply.github.com"
assert gitid.email() == NOREPLY and "noreply" in gitid.email()

# set_email: repo-local `git config user.email <noreply>` through a fake git
calls = []
gitid.set_email("/x/wt-1", lambda cmd, cwd=None: (calls.append((cmd, cwd)), (0, ""))[1])
assert calls == [(["git", "config", "user.email", NOREPLY], "/x/wt-1")], calls

# every cloud prompt (worker, reviewer, fixer, resolver, tester, desks) goes through remote.launch: the built command contains it
class Fake:
    def __init__(self): self.calls = []
    def __call__(self, cmd, env=None): self.calls.append(cmd); return 0, ""
prompts = [runner.remote_worker_prompt(7, "pack"), runner.remote_review_prompt(7, 9), runner.remote_fix_prompt(7, "fix it"),
           runner.remote_resolve_prompt(7, ["a"]), runner.tester.prompt(7, 9, "T1", "https://x")]
for p in prompts:
    f = Fake(); remote.launch(7, p, ".", run=f)
    task = f.calls[-1][-1]
    assert task.startswith(f"First run `git config user.email {NOREPLY}`"), task[:120]

# alarm: a rejected push naming e-mail privacy -> own reason, one tell per hour
tells, runs = [], tempfile.mkdtemp()
out = "remote: error: GH007: Your push would publish a private email address.\n ! [remote rejected] lane/1 (push declined due to email privacy restrictions)"
r1 = gitid.alarm(out, runs, tells.append, now=10000, n=5)
r2 = gitid.alarm(out, runs, tells.append, now=10000 + 60, n=5)
r3 = gitid.alarm(out, runs, tells.append, now=10000 + 3700, n=5)
assert r1 == r2 == r3 == gitid.REASON and "GH007" in r1
assert len(tells) == 2, tells
assert gitid.alarm("error: failed to push some refs", runs, tells.append, now=9999) == "" and len(tells) == 2

# runner.block names the reason (not a generic 'push failed')
seen = []
runner.set_labels = lambda *a, **k: None; runner.gh = lambda *a, **k: (seen.append(a), (0, ""))[1]
runner.tell_orchestrator = lambda t: None; runner.USE_HERDR = False
tmp = tempfile.mkdtemp(); lg = os.path.join(tmp, "log"); open(lg, "w").write("x")
runner.block(3, "push failed\n" + out, lg)
assert any("GH007" in str(a) and "e-mail privacy" in str(a) for a in seen), seen
print("test_gitid ok")
