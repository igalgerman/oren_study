#!/usr/bin/env python3
"""#814: port_pr.py <pr> --src INFRA_DIR --game GAME_DIR: an open game PR of the old repo becomes branch `lane/<n>` + a PR in GAME.
<n> = the issue the PR fixes (else the PR number). The PR's diff against the merge base (game-tree paths only, never `.github`-less
outside files) is applied on GAME main. If it does not apply: nothing is applied or pushed, the issue goes back to ready with ONE note.
Never pushes main (#800). Prints counts only."""
import argparse, json, re, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C
import export as E

READY, DROP = "ready-for-agent", ("in-progress", "blocked", "needs-orchestrator")

def issue_of(body, pr):
    m = re.search(r"(?i)\b(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?)\s+#(\d+)", body or "")
    return int(m[1]) if m else pr

def view(pr, infra_repo):
    rc, out = E.RUN(["gh", "pr", "view", str(pr), "--repo", infra_repo, "--json", "number,state,title,body,headRefName,baseRefName"])
    if rc: raise RuntimeError("cannot read the PR")
    return json.loads(out)

def back_to_ready(n, infra_repo, why):
    cmd = ["gh", "issue", "edit", str(n), "--repo", infra_repo, "--add-label", READY]
    for l in DROP: cmd += ["--remove-label", l]
    E.RUN(cmd)
    E.RUN(["gh", "issue", "comment", str(n), "--repo", infra_repo, "--body", f"Port to the game repo failed ({why}); back in ready for a new worker on the new repo."])

def port(pr, src, game, game_repo=E.GAME_REPO, infra_repo=E.INFRA_REPO):
    src, game = Path(src), Path(game)
    info = view(pr, infra_repo)
    if info.get("state") != "OPEN": print(f"port: PR {pr} is not open"); return 2
    n = issue_of(info.get("body"), pr)
    head = info["headRefName"]
    C.git(src, "fetch", "-q", "origin", check=False)
    ref = f"origin/{head}" if C.git(src, "rev-parse", "--verify", "-q", f"origin/{head}", check=False)[0] == 0 else head
    main = "origin/main" if C.git(src, "rev-parse", "--verify", "-q", "origin/main", check=False)[0] == 0 else "main"
    base = C.git(src, "merge-base", main, ref)[1].strip()
    changed = C.git(src, "diff", "--name-only", "--no-renames", base, ref)[1].splitlines()
    paths = [p for p in changed if C.is_game_path(p)]
    if not paths: print(f"port: PR {pr} changes no game-tree file, nothing to port ({len(changed)} files)"); return 0
    patch = subprocess.run(["git", "-C", str(src), "diff", "--binary", "--no-renames", base, ref, "--", *paths], capture_output=True, check=True).stdout
    C.set_identity(game)
    C.git(game, "fetch", "-q", "origin")
    br = f"lane/{n}"
    C.guard_branch(br)
    C.git(game, "checkout", "-q", "-B", br, "origin/main")
    def leave():
        C.git(game, "reset", "-q", "--hard", "origin/main"); C.git(game, "checkout", "-q", "--detach"); C.git(game, "branch", "-qD", br, check=False)
    ok = subprocess.run(["git", "-C", str(game), "apply", "--check", "--index", "-"], input=patch, capture_output=True).returncode == 0
    if not ok:
        leave(); back_to_ready(n, infra_repo, f"{len(paths)} files do not apply on the game main")
        print(f"port: does not apply on GAME main ({len(paths)} files); issue #{n} back in ready"); return 1
    r = subprocess.run(["git", "-C", str(game), "apply", "--index", "-"], input=patch, capture_output=True)
    if r.returncode: leave(); back_to_ready(n, infra_repo, "apply failed"); print("port: apply failed, nothing kept"); return 1
    C.commit(game, f"{info['title']}\n\nPorted from the old repo, PR {pr}.")
    E.push(game, br)
    url = E.open_pr(game_repo, info["title"], br, "main",
                    f"Ported from https://github.com/{infra_repo}/pull/{pr} (issue https://github.com/{infra_repo}/issues/{n}); {len(paths)} files.")
    print(f"port: {len(paths)} files, branch {br}, PR {url}")
    return 0

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("pr", type=int)
    ap.add_argument("--src", default=str(C.ROOT)); ap.add_argument("--game", required=True)
    ap.add_argument("--game-repo", default=E.GAME_REPO); ap.add_argument("--infra-repo", default=E.INFRA_REPO)
    a = ap.parse_args(argv)
    return port(a.pr, a.src, a.game, a.game_repo, a.infra_repo)

if __name__ == "__main__":
    sys.exit(main())
