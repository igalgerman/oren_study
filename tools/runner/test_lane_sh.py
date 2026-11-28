"""#302: tools/lane.sh must not fail on leftovers of an earlier try. Run: python3 tools/runner/test_lane_sh.py"""
import os, shutil, subprocess, sys, tempfile
os.environ["OREN_TEST"] = "1"   # #325: start_pregen never launches a real pregen.js under tests
from pathlib import Path
HERE = Path(__file__).resolve().parent
LANE = HERE.parent / "lane.sh"
BASH = shutil.which("bash") or r"C:/Program Files/Git/bin/bash.exe"
def git(*a, cwd):
    p = subprocess.run(["git", *a], cwd=cwd, capture_output=True, text=True)
    assert p.returncode == 0, (a, p.stdout, p.stderr); return p.stdout.strip()
def lane(n, root):
    return subprocess.run([BASH, str(LANE), str(n), "main"], cwd=root, capture_output=True, text=True)
t = Path(tempfile.mkdtemp(prefix="lane-test-"))
try:
    git("init", "-q", "--bare", "-b", "main", str(t / "origin.git"), cwd=t)
    git("clone", "-q", str(t / "origin.git"), str(t / "a"), cwd=t)
    root = t / "a"
    for k, v in (("user.email", "t@t"), ("user.name", "t"), ("commit.gpgsign", "false")): git("config", k, v, cwd=root)
    (root / "x.txt").write_text("x"); git("add", "x.txt", cwd=root); git("commit", "-qm", "x", cwd=root); git("push", "-q", "origin", "main", cwd=root)
    p = lane(7, root); assert p.returncode == 0 and (t / "wt-7").is_dir(), p.stderr          # fresh lane
    shutil.rmtree(t / "wt-7")                                                                 # folder gone, worktree still registered, lane/7 still local
    p = lane(7, root); assert p.returncode == 0 and (t / "wt-7" / "x.txt").exists(), p.stderr  # stale registration + leftover branch: still works
    assert git("rev-parse", "--abbrev-ref", "HEAD", cwd=t / "wt-7") == "lane/7"
    print("ok #302 lane.sh leftovers")
    # #974: lane/<n> checked out in ANOTHER worktree (hand work)
    git("worktree", "add", "-q", "-b", "lane/8", str(t / "hand"), "origin/main", cwd=root); git("push", "-q", "origin", "lane/8", cwd=t / "hand")
    p = lane(8, root); assert p.returncode == 0 and (t / "wt-8" / "x.txt").exists(), p.stderr   # clean + pushed: detached, lane continues
    assert git("rev-parse", "--abbrev-ref", "HEAD", cwd=t / "hand") == "HEAD" and git("rev-parse", "--abbrev-ref", "HEAD", cwd=t / "wt-8") == "lane/8"
    git("worktree", "remove", "--force", str(t / "wt-8"), cwd=root); git("worktree", "remove", "--force", str(t / "hand"), cwd=root)
    for why in ("dirty", "unpushed"):
        git("worktree", "add", "-q", "-f", str(t / "hand"), "lane/8", cwd=root)
        if why == "dirty": (t / "hand" / "x.txt").write_text("changed")
        else: (t / "hand" / "y.txt").write_text("y"); git("add", "y.txt", cwd=t / "hand"); git("commit", "-qm", "y", cwd=t / "hand")
        p = lane(8, root); assert p.returncode != 0 and not (t / "wt-8").exists(), why           # blocks, nothing changed
        msgs = [l for l in p.stderr.splitlines() if l.strip()]
        assert len(msgs) == 1 and "hand" in msgs[0], (why, p.stderr)                            # ONE message naming the path
        assert git("rev-parse", "--abbrev-ref", "HEAD", cwd=t / "hand") == "lane/8"            # not detached, not deleted
        git("worktree", "remove", "--force", str(t / "hand"), cwd=root)
    print("ok #974 lane.sh branch checked out elsewhere")
finally:
    shutil.rmtree(t, ignore_errors=True)
