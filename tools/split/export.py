#!/usr/bin/env python3
"""#814: export the GAME tree from INFRA as clean commits, and the way back.
  export.py --dry-run               build the GAME tree in a temp folder from the ONE allowlist, verify it, print path counts only
  export.py --sync --game DIR       the next clean commit from INFRA main as a branch + PR in GAME (normal `tests` gate); no change = no commit
  export.py --back --game DIR       ONE PR in INFRA with what changed in GAME since the last sync (the way back)
  export.py --identity DIR          set the neutral git identity (repo level) of a GAME checkout
The last sync is the newest commit on GAME main whose message holds `Synced-From: <INFRA sha>` (the sync PR title/body carry it too).
Never pushes to main (#800). An empty GAME (first import) gets a pushed branch `import/<sha>` that the owner makes the default branch
with the one command the tool prints. Prints paths and counts only, never matched text."""
import argparse, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C

GAME_REPO, INFRA_REPO = "igalgerman/learn-quest", "igalgerman/oren_study"
TRAILER = "Synced-From: "

def gh_run(cmd, input=None):
    r = subprocess.run(cmd, capture_output=True, text=True, input=input)
    return r.returncode, (r.stdout or r.stderr)
RUN = gh_run          # tests swap in a fake gh

def head_sha(repo):
    rc, out = C.git(repo, "rev-parse", "HEAD", check=False)
    return out.strip() if rc == 0 else "nogit"

def verify_dir(tree):
    problems = C.verify_tree(tree)
    for p in problems: print("VERIFY FAIL " + p)
    return problems

def dry_run(src):
    tmp = Path(tempfile.mkdtemp(prefix="game-export-"))
    try:
        paths = C.build_tree(src, tmp)
        print(f"export: {len(paths)} paths " + json.dumps(C.counts(paths), sort_keys=True))
        bad = verify_dir(tmp)
        print("verify: " + (f"FAILED, {len(bad)} problems" if bad else "ok"))
        return 1 if bad else 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

def last_sync(game, ref="origin/main"):
    """(commit sha, INFRA sha) of the newest sync commit on `ref`, or (None, None)."""
    rc, out = C.git(game, "log", ref, "--format=%H%x00%B%x01", check=False)
    if rc: return None, None
    for chunk in out.split("\x01"):
        sha, _, body = chunk.strip().partition("\0")
        for line in body.splitlines():
            if line.startswith(TRAILER): return sha, line[len(TRAILER):].strip()
    return None, None

def changed_since(game, base, ref="origin/main"):
    """{path: status letter} of files that differ between `base` and `ref` (no rename detection)."""
    out = C.git(game, "diff", "--name-status", "--no-renames", base, ref)[1]
    return {l.split("\t", 1)[1]: l[0] for l in out.splitlines() if "\t" in l}

def open_pr(repo, title, head, base, body):
    rc, out = RUN(["gh", "api", f"repos/{repo}/pulls", "-f", f"title={title}", "-f", f"head={head}", "-f", f"base={base}", "-f", f"body={body}"])
    if rc: raise RuntimeError("could not open the PR: " + (out or "")[:200])
    try: return json.loads(out).get("html_url") or out.strip()
    except ValueError: return out.strip()

def push(repo, branch):
    C.guard_branch(branch)
    C.git(repo, "push", "-q", "-u", "origin", branch)

def fill(game, tree):
    """Make the working tree of `game` equal to `tree` (everything but .git replaced)."""
    for p in list(Path(game).iterdir()):
        if p.name == ".git": continue
        shutil.rmtree(p) if p.is_dir() else p.unlink()
    for d, _, fs in os.walk(tree):
        for f in fs:
            s = Path(d) / f; t = Path(game) / s.relative_to(tree)
            t.parent.mkdir(parents=True, exist_ok=True); t.write_bytes(s.read_bytes())

def sync(src, game, game_repo=GAME_REPO):
    src, game = Path(src), Path(game)
    if C.git(src, "rev-parse", "--abbrev-ref", "HEAD")[1].strip() != "main":
        print("sync: the source checkout is not on main (the export is made from INFRA main)"); return 2
    sha = head_sha(src)
    C.set_identity(game)
    tmp = Path(tempfile.mkdtemp(prefix="game-export-"))
    try:
        paths = C.build_tree(src, tmp)
        if verify_dir(tmp): print("sync: verify failed, nothing committed"); return 1
        C.git(game, "fetch", "-q", "origin", check=False)
        have_main = C.git(game, "rev-parse", "--verify", "-q", "origin/main", check=False)[0] == 0
        if not have_main:                                           # first import into the empty GAME
            br = f"import/{sha[:12]}"
            C.guard_branch(br)
            C.git(game, "checkout", "-q", "--orphan", br)
            fill(game, tmp)
            C.git(game, "add", "-A"); C.commit(game, f"Import from INFRA {sha[:12]}\n\n{TRAILER}{sha}")
            push(game, br)
            print(f"sync: first import, branch {br} pushed ({len(paths)} paths). Owner, one command: "
                  f"gh repo edit {game_repo} --default-branch {br}")
            return 0
        base, _ = last_sync(game)
        br = f"sync/{sha[:12]}"
        C.guard_branch(br)
        C.git(game, "checkout", "-q", "-B", br, "origin/main")
        fill(game, tmp)
        C.git(game, "add", "-A")
        def leave():
            C.git(game, "reset", "-q", "--hard", "origin/main"); C.git(game, "checkout", "-q", "--detach"); C.git(game, "branch", "-qD", br, check=False)
        if C.git(game, "diff", "--cached", "--quiet", check=False)[0] == 0:
            leave(); print("sync: no change, no commit"); return 0
        mine = set(C.git(game, "diff", "--cached", "--name-only")[1].splitlines())
        if base:                                                    # never overwrite a GAME-side change that is not back in INFRA yet
            clash = sorted(set(changed_since(game, base)) & mine)
            if clash:
                leave(); print(f"sync: GAME has {len(clash)} changed file(s) that are not back in INFRA yet: run --back first"); return 3
        C.commit(game, f"Sync from INFRA {sha[:12]}\n\n{TRAILER}{sha}")
        push(game, br)
        url = open_pr(game_repo, f"Sync from INFRA {sha[:12]}", br, "main",
                      f"Clean export of the game tree from INFRA main ({len(mine)} files changed).\n\n{TRAILER}{sha}")
        print(f"sync: {len(mine)} files changed, PR {url}")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

def back(src, game, infra_repo=INFRA_REPO):
    src, game = Path(src), Path(game)
    C.git(game, "fetch", "-q", "origin", check=False)
    base, _ = last_sync(game)
    if not base: print("back: GAME has no sync commit yet, nothing to bring back"); return 2
    todo, skipped = {}, 0
    for p, st in changed_since(game, base).items():
        t = C.to_infra(p)
        if t: todo[t] = (p, st)
        else: skipped += 1
    if not todo: print(f"back: no change since the last sync ({skipped} outside the list)"); return 0
    if C.git(src, "status", "--porcelain")[1].strip(): print("back: the INFRA checkout has local changes, commit or stash them first"); return 2
    gsha = C.git(game, "rev-parse", "origin/main")[1].strip()
    prev = C.git(src, "rev-parse", "--abbrev-ref", "HEAD")[1].strip()
    br = f"{C.BACK_PREFIX}{gsha[:12]}"
    C.git(src, "checkout", "-q", "-b", br, "main")
    try:
        for t, (p, st) in todo.items():
            f = src / t
            if st == "D": f.unlink(missing_ok=True)
            else:
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_bytes(subprocess.run(["git", "-C", str(game), "show", f"origin/main:{p}"], capture_output=True, check=True).stdout)
        C.git(src, "add", "-A")
        C.commit(src, f"Bring back GAME changes up to {gsha[:12]}", config=False)
        push(src, br)
        url = open_pr(infra_repo, f"Bring back GAME changes up to {gsha[:12]}", br, "main",
                      f"Way back (#814): {len(todo)} file(s) changed in GAME since the last sync. The merge guard allows this branch.")
        print(f"back: {len(todo)} files, PR {url}")
        return 0
    finally:
        C.git(src, "checkout", "-q", prev)

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true"); g.add_argument("--sync", action="store_true")
    g.add_argument("--back", action="store_true"); g.add_argument("--identity", metavar="DIR")
    ap.add_argument("--src", default=str(C.ROOT), help="the INFRA checkout (default: this repo)")
    ap.add_argument("--game", help="the local GAME checkout")
    ap.add_argument("--game-repo", default=GAME_REPO); ap.add_argument("--infra-repo", default=INFRA_REPO)
    a = ap.parse_args(argv)
    if a.identity: C.set_identity(a.identity); print("neutral identity set"); return 0
    if a.dry_run: return dry_run(a.src)
    if not a.game: ap.error("--game DIR is required")
    return sync(a.src, a.game, a.game_repo) if a.sync else back(a.src, a.game, a.infra_repo)

if __name__ == "__main__":
    sys.exit(main())
