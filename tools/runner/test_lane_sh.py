"""#302: tools/lane.sh must not fail on leftovers of an earlier try. Run: python3 tools/runner/test_lane_sh.py"""
import os, shutil, subprocess, sys, tempfile
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
finally:
    shutil.rmtree(t, ignore_errors=True)
