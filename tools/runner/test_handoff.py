# Tests for handoff.py save/show (#923), fake gh + tmp dirs: python tools/runner/test_handoff.py
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229
os.environ["OREN_TEST"] = "1"   # #325
import base64, json, os, sys, tempfile
from pathlib import Path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import handoff as H

class Scrub:
    def __init__(self, ok=True): self.ok = ok
    def require(self):
        if not self.ok: raise RuntimeError("no names")
    def scrub(self, t): return t.replace("Secretname", "the kid")

class GH:
    def __init__(self, fail_put=False, branch=True, copy=None):
        self.calls, self.fail_put, self.branch, self.copy = [], fail_put, branch, copy
    def __call__(self, *a):
        self.calls.append(a); url = a[-1] if "-f" not in a else ""
        if "-X" in a and "PUT" in a:
            if self.fail_put: return 1, "boom"
            self.put = {a[i]: a[i + 1] for i in range(len(a) - 1) if a[i] == "-f"}
            return 0, "{}"
        if "-X" in a: return 0, "{}"
        if "git/ref/heads/state/roles" in a[1]: return (0, "{}") if self.branch else (1, "404")
        if "git/ref/heads/main" in a[1]: return 0, json.dumps({"object": {"sha": "abc"}})
        if "contents/" in a[1]:
            if self.copy is None: return 1, "404"
            return 0, json.dumps({"sha": "s1", "content": base64.b64encode(self.copy.encode()).decode()})
        return 1, ""

def deps(tmp, gh=None, scrub=None, max_lines=80):
    return dict(runs=Path(tmp) / "runs", gh=gh or GH(), repo="o/r", base="main", scrub=scrub or Scrub(), max_lines=max_lines,
                template=Path(tmp) / "tpl.md", home=Path(tmp) / "home")

def live(tmp, role, text):
    p = H.live_path(role, Path(tmp) / "runs"); p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text, encoding="utf-8")

with tempfile.TemporaryDirectory() as t:
    # save pushes the scrubbed text to state/roles, creating the branch from main when missing
    live(t, "inbox", "## Now\nSecretname asked for #5\n")
    gh = GH(branch=False); rc, line = H.save("inbox", deps(t, gh))
    assert rc == 0, line
    body = base64.b64decode([x for x in gh.calls[-1] if x.startswith("content=")][0][8:]).decode()
    assert "the kid" in body and "Secretname" not in body, body
    assert any("git/refs" in str(c) for c in gh.calls) and any("branch=state/roles" in c for c in gh.calls[-1])
    assert "docs/roles/inbox-state.md" in gh.calls[-1][3]
    # refuses: missing names list, over-long, play data, no file
    assert H.save("inbox", deps(t, scrub=Scrub(False)))[0] == 2
    live(t, "inbox", "x\n" * 5); assert H.save("inbox", deps(t, max_lines=3))[0] == 2
    live(t, "inbox", "see playlog numbers\n"); r = H.save("inbox", deps(t)); assert r[0] == 2 and "play data" in r[1]
    assert H.save("executor", deps(t))[0] == 2
    # a failed push keeps the live file and logs; the next save retries
    live(t, "inbox", "## Now\nok\n"); r = H.save("inbox", deps(t, GH(fail_put=True)))
    assert r[0] == 1 and H.live_path("inbox", Path(t) / "runs").exists() and "push failed" in (Path(t) / "runs" / "handoff.log").read_text()
    assert H.save("inbox", deps(t))[0] == 0
    # show: live, then branch copy, then template, then private notes
    live(t, "inbox", "LIVE\n")
    assert H.show("inbox", deps(t, GH(copy="BRANCH"))).strip() == "LIVE"
    H.live_path("inbox", Path(t) / "runs").unlink()
    assert H.show("inbox", deps(t, GH(copy="BRANCH"))).strip() == "BRANCH"
    Path(t, "tpl.md").write_text("TEMPLATE", encoding="utf-8")
    assert H.show("inbox", deps(t, GH())).strip() == "TEMPLATE"
    pp = H.private_path("inbox", Path(t) / "home"); pp.parent.mkdir(parents=True); pp.write_text("PRIVATE", encoding="utf-8")
    out = H.show("inbox", deps(t, GH())); assert out.index("TEMPLATE") < out.index("PRIVATE")
print("ok")
