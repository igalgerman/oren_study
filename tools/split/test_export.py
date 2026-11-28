# #814: python tools/split/test_export.py  (fixture trees and two fixture repos with local remotes; no network, a fake gh)
import io, json, os, subprocess, sys, tempfile, contextlib
from pathlib import Path
os.environ["PRIVATE_NAMES"] = "Zorro,זורו"          # fake kid name for the verify step; never a real one
os.environ["PRIVATE_NAMES_FILE"] = os.devnull
os.environ["SPLIT_PERSONAL_LIST"] = os.devnull
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C, export as E, guards as G

NEUTRAL = C.neutral_email()
OTHER = "someone" + "@" + "example.org"

def sh(cwd, *a, **kw):
    e = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": OTHER, "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": OTHER}   # a personal-looking identity on purpose
    r = subprocess.run(["git", "-C", str(cwd), *a], capture_output=True, text=True, env=e)
    assert r.returncode == 0 or kw.get("ok"), (a, r.stderr)
    return r.stdout.strip()

def put(root, files):
    for p, t in files.items():
        f = Path(root) / p; f.parent.mkdir(parents=True, exist_ok=True); f.write_text(t, encoding="utf-8", newline="\n")

INFRA_FILES = {
    "oren2/index.html": "<html>game</html>\n", "oren2/talents.js": "// talents\n", "oren2/ci/tour.js": "// tour\n",
    "oren2/docs/STATUS.md": "private doc\n", "oren2/node_modules/x/y.js": "junk\n",
    ".github/workflows/tests.yml": "name: tests\n", ".github/workflows/deploy.yml": "name: deploy\n", ".github/workflows/preview.yml": "name: preview\n",
    ".github/workflows/cloud-trigger.yml": "name: infra only\n",
    "GLOSSARY.md": "# glossary\n", ".gitattributes": "* text=auto\n", ".claude/settings.json": "{}\n", ".claude/hooks/guard.py": "# guard\n",
    ".claude/commands/go.md": "infra\n", "CLAUDE.md": "infra rules\n", "FLOW.md": "flow\n", "tools/runner/runner.py": "infra\n",
    "tools/split/game_CLAUDE.md": "# game rules\n",
}
GAME_PATHS = sorted(["oren2/index.html", "oren2/talents.js", "oren2/ci/tour.js", ".github/workflows/tests.yml", ".github/workflows/deploy.yml",
                     ".github/workflows/preview.yml", "GLOSSARY.md", ".gitattributes", ".claude/settings.json", ".claude/hooks/guard.py", "CLAUDE.md"])

# ---- allowlist: only listed paths, game CLAUDE.md renamed, docs and infra never
tmp = Path(tempfile.mkdtemp(prefix="split-test-"))
infra = tmp / "infra"; infra.mkdir(); put(infra, INFRA_FILES)
out = tmp / "out"; out.mkdir()
assert C.build_tree(infra, out) == GAME_PATHS, C.build_tree(infra, tmp / "o2")
assert (out / "CLAUDE.md").read_text() == "# game rules\n"
for bad in ("oren2/docs/STATUS.md", ".claude/commands/go.md", "FLOW.md", "tools/runner/runner.py", ".github/workflows/cloud-trigger.yml", "oren2/node_modules/x/y.js"):
    assert not (out / bad).exists(), bad
assert not C.is_game_path("oren2/docs/x.md") and not C.is_game_path("other/x") and C.is_game_path("oren2/ci/a.js")
assert C.to_game("tools/split/game_CLAUDE.md") == "CLAUDE.md" and C.to_infra("CLAUDE.md") == "tools/split/game_CLAUDE.md" and C.to_game("CLAUDE.md") == ""
print("ok allowlist")

# ---- dry run prints counts only
buf = io.StringIO()
with contextlib.redirect_stdout(buf): rc = E.dry_run(infra)
txt = buf.getvalue()
assert rc == 0 and "11 paths" in txt and "verify: ok" in txt and "talents" not in txt and "game rules" not in txt, txt
print("ok dry run")

# ---- verify: fails closed, prints path + count, never the matched text
v = tmp / "v"; v.mkdir()
put(v, {"a.js": "hello Zorro and zorro\n", "b/he.js": "שלום זורו\n", "c.txt": f"mail {OTHER} and {NEUTRAL}\n", "ok.txt": "fine\n", "oren2/x.txt": "see oren2 and oren-game\n",
        "playlog/day1.json": "{}\n", "d/Zorro.txt": "x\n", "docs/mine.md": "mine\n"})
probs = C.verify_tree(v, personal=["docs/*"])
joined = "\n".join(probs)
assert "a.js: private name (2)" in probs and "b/he.js: private name (1)" in probs, probs
assert "c.txt: e-mail address other than the neutral author (1)" in probs, probs
assert any(p.startswith("playlog/day1.json: play-log pattern") for p in probs) and any(p.startswith("d/Zorro.txt: name in path") for p in probs)
assert "docs/mine.md: on the personal list (1)" in probs
assert not any(p.startswith(("ok.txt", "oren2/")) for p in probs), probs            # allowed technical identifiers pass
assert "Zorro" not in joined.replace("d/Zorro.txt", "") and "זורו" not in joined and OTHER not in joined          # no matched text
assert C.verify_tree(v, names=[], personal=[])[0].startswith("(names list)")          # no names configured: fail closed
nik = tmp / "nik"; nik.mkdir(); put(nik, {"n.js": "זוֹרוֹ\n"}); assert C.verify_tree(nik, personal=[]) == ["n.js: private name (1)"]   # with nikud too
print("ok verify")

# ---- fixture repos: INFRA (main + remote) and GAME (empty bare remote + checkout)
def repo_with_remote(name):
    bare = tmp / f"{name}.git"; subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(bare)], check=True)
    w = tmp / name
    return bare, w
ibare, _ = repo_with_remote("infra-r"); gbare, gw = repo_with_remote("game-w")
subprocess.run(["git", "init", "-q", "-b", "main", str(infra)], check=True)
sh(infra, "remote", "add", "origin", str(ibare)); sh(infra, "add", "-A"); sh(infra, "commit", "-q", "-m", "infra start"); sh(infra, "push", "-q", "-u", "origin", "main")
subprocess.run(["git", "clone", "-q", str(gbare), str(gw)], check=True, capture_output=True)

prs = []
def fake_gh(cmd, input=None):
    prs.append(cmd)
    if "pulls" in " ".join(cmd): return 0, json.dumps({"html_url": "https://example.test/pr/" + str(len(prs))})
    return 0, ""
E.RUN = fake_gh

# first import into the empty GAME: pushed branch, neutral author + committer, no PR, no push to main
buf = io.StringIO()
with contextlib.redirect_stdout(buf): assert E.sync(infra, gw, "o/game") == 0
assert "first import" in buf.getvalue() and "--default-branch import/" in buf.getvalue() and not prs
heads = sh(gbare, "for-each-ref", "--format=%(refname)").split()
assert len(heads) == 1 and heads[0].startswith("refs/heads/import/"), heads
imp = heads[0].split("refs/heads/")[1]
assert C.commits_bad(gbare, imp) == 0 and len(C.commit_emails(gbare, imp)) == 1
assert sh(gbare, "ls-tree", "-r", "--name-only", imp).split("\n") == GAME_PATHS
assert sh(gw, "config", "user.email") == NEUTRAL                                  # the checkout got the neutral identity
sh(gbare, "branch", "-m", imp, "main")                                            # the owner's one command: the branch becomes the default branch
sh(gw, "fetch", "-q", "origin"); sh(gw, "checkout", "-q", "--detach", "origin/main")
print("ok first import")

# sync with a change -> branch + PR, never main; second sync with no change -> no commit
put(infra, {"oren2/talents.js": "// talents v2\n", "FLOW.md": "flow v2\n"}); sh(infra, "commit", "-qam", "infra change"); sh(infra, "push", "-q", "origin", "main")
with contextlib.redirect_stdout(buf): assert E.sync(infra, gw, "o/game") == 0
assert len(prs) == 1 and any(a.startswith("head=sync/") for a in prs[0]) and "base=main" in prs[0] and not any(a == "head=main" for a in prs[0])
br = [r for r in sh(gbare, "for-each-ref", "--format=%(refname:short)").split() if r.startswith("sync/")][0]
assert sh(gbare, "show", f"{br}:oren2/talents.js") == "// talents v2" and C.commits_bad(gbare, f"main..{br}") == 0
assert sh(gbare, "log", "-1", "--format=%B", br).count("Synced-From: " + sh(infra, "rev-parse", "HEAD")) == 1
sh(gbare, "branch", "-D", "main"); sh(gbare, "branch", "-m", br, "main")      # the sync PR is merged
assert sh(gbare, "log", "--format=%ae %ce", "main").split("\n") == [f"{NEUTRAL} {NEUTRAL}"] * 2
n_before = len(prs); commits_before = sh(gbare, "rev-list", "--count", "main")
buf = io.StringIO()
with contextlib.redirect_stdout(buf): assert E.sync(infra, gw, "o/game") == 0
assert "no change" in buf.getvalue() and len(prs) == n_before and sh(gbare, "rev-list", "--count", "main") == commits_before
print("ok sync both directions: change and no change")

# the way back: GAME changes -> ONE PR in INFRA; nothing changed = no PR
sh(gw, "fetch", "-q", "origin"); sh(gw, "checkout", "-q", "-B", "work", "origin/main")
put(gw, {"oren2/index.html": "<html>game v2</html>\n", "oren2/new.js": "// new\n", "CLAUDE.md": "# game rules v2\n"}); sh(gw, "rm", "-q", "oren2/ci/tour.js")
C.git(gw, "add", "-A"); C.commit(gw, "game side change"); C.git(gw, "push", "-q", "origin", "work:main")
prs.clear(); buf = io.StringIO()
with contextlib.redirect_stdout(buf): assert E.back(infra, gw, "o/infra") == 0
assert len(prs) == 1 and "head=back/" + sh(gw, "rev-parse", "origin/main")[:12] in prs[0] and "base=main" in prs[0], prs
assert sh(infra, "rev-parse", "--abbrev-ref", "HEAD") == "main"
bb = [r for r in sh(ibare, "for-each-ref", "--format=%(refname:short)").split() if r.startswith("back/")][0]
assert sh(ibare, "show", f"{bb}:oren2/new.js") == "// new" and sh(ibare, "show", f"{bb}:tools/split/game_CLAUDE.md") == "# game rules v2"
assert sh(ibare, "ls-tree", "-r", "--name-only", bb).count("oren2/ci/tour.js") == 0 and C.commits_bad(ibare, f"main..{bb}") == 0
# sync before the way back is merged must refuse (it would overwrite the GAME-side change)
put(infra, {"oren2/index.html": "<html>infra other</html>\n"}); sh(infra, "commit", "-qam", "infra edits the same file")
buf = io.StringIO()
with contextlib.redirect_stdout(buf): assert E.sync(infra, gw, "o/game") == 3
assert "run --back first" in buf.getvalue() and sh(gw, "status", "--porcelain") == ""
print("ok way back")

# --identity and the main guard
sh(gw, "config", "--unset", "user.email"); C.set_identity(gw); assert sh(gw, "config", "user.email") == NEUTRAL and sh(gw, "config", "user.name") == C.NEUTRAL_NAME
for t in ("main", "refs/heads/main", "x:main"):
    try: C.guard_branch(t); assert False, t
    except RuntimeError: pass
C.guard_branch("lane/7")
print("ok identity + main guard")

# ---- guards: the commit e-mail check of a GAME PR (count only)
good = {"commit": {"author": {"email": NEUTRAL}, "committer": {"email": NEUTRAL}}}
badc = {"commit": {"author": {"email": OTHER}, "committer": {"email": NEUTRAL}}}
badc2 = {"commit": {"author": {"email": NEUTRAL}, "committer": {"email": OTHER}}}
assert G.commit_refusal([good, good]) == ""
r = G.commit_refusal([good, badc, badc2]); assert r.startswith("2 commit(s)") and OTHER not in r
print("ok guards pure")
print("test_export ok")
