#!/usr/bin/env python3
"""#854: the mirror. GAME follows INFRA main as ONE auto-merging PR per tick (no AI, no freeze, no new secret).
  mirror.py --tick  [--src DIR --game DIR]   one pass (the watchdog calls tick(); gh goes through runner.run = App token)
  mirror.py --status                         last mirrored INFRA commit, commits behind, tree hash equal? ("lag 0")
  mirror.py --resume                         clear a pause (after the conflict / verify hit was fixed)
  mirror.py --stop                           end the mirror cleanly (#796 part C)
How: the delta of the allowlisted paths (#814, common.is_game_path) from the last mirrored INFRA commit L to INFRA main H is applied to
GAME main as a PATCH (never an overwrite), so a commit made directly in GAME survives. The PR is made by the neutral author, titled and
described with the INFRA commit range only, labelled `mirror`, and auto-merges when `tests` is green.
The last mirrored INFRA commit lives in GAME itself: the file `.mirror-state` (changed by the mirror PR, so it survives squash and restarts);
before the first mirror PR the `Synced-From:` trailer of the first import (export.py) counts.
State of the mirror process (pause, open PR, lag clock): RUNS/mirror.json. An idle tick makes no GitHub call at all
(INFRA main is the local checkout, fast-forwarded by the main sync); one call while a mirror PR is open.
A conflict or a verify hit pauses the mirror with ONE alarm line (commit, path and count only, never text)."""
import argparse, json, os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C
import export as E
import guards as G

STATE_FILE = ".mirror-state"          # in GAME: the last mirrored INFRA sha
LABEL = "mirror"
LAG_ALARM_MIN = 30

def runs_dir(): return G.runs_dir()
def state_path(): return runs_dir() / "mirror.json"

def load():
    try: d = json.loads(state_path().read_text(encoding="utf-8"))
    except (OSError, ValueError): d = {}
    return {"seen": d.get("seen", ""), "pr": d.get("pr"), "paused": d.get("paused", ""), "stopped": bool(d.get("stopped")),
            "behind_since": d.get("behind_since"), "lag_alarmed": bool(d.get("lag_alarmed"))}

def save(st):
    runs_dir().mkdir(parents=True, exist_ok=True)
    state_path().write_text(json.dumps(st), encoding="utf-8")

def default_run(cmd, input=None):
    import runner as R
    return R.run(cmd, input=input)

# ---------- reading the two trees ----------
def infra_head(src): return C.git(src, "rev-parse", "main")[1].strip()

def last_mirrored(game, ref="origin/main"):
    """INFRA sha GAME has: the `.mirror-state` file, else the first import's Synced-From trailer, else ''."""
    rc, out = C.git(game, "show", f"{ref}:{STATE_FILE}", check=False)
    if rc == 0 and re.fullmatch(r"[0-9a-f]{7,40}", out.strip()): return out.strip()
    return E.last_sync(game, ref)[1] or ""

def delta_paths(src, base, head):
    """INFRA paths of the allowlist that changed between base and head."""
    out = C.git(src, "diff", "--name-only", "--no-renames", base, head)[1].splitlines()
    return sorted(p for p in out if C.to_game(p))

def delta_patch(src, base, head, paths):
    """The delta as a patch with GAME paths (the game CLAUDE.md comes from tools/split/game_CLAUDE.md)."""
    raw = subprocess.run(["git", "-C", str(src), "diff", "--binary", "--no-renames", base, head, "--", *paths], capture_output=True, check=True).stdout
    if C.GAME_CLAUDE_SRC.encode() not in raw: return raw
    out = []
    for line in raw.split(b"\n"):
        if line.startswith((b"diff --git ", b"--- ", b"+++ ")): line = line.replace(C.GAME_CLAUDE_SRC.encode(), C.GAME_CLAUDE_DST.encode())
        out.append(line)
    return b"\n".join(out)

def tree_of(repo, ref, to_game=False):
    """{game path: blob sha} of the exported tree at `ref` (GAME: everything but the state file)."""
    out = C.git(repo, "ls-tree", "-r", ref)[1].splitlines(); d = {}
    for l in out:
        meta, _, p = l.partition("\t"); blob = meta.split()[2]
        if to_game:
            g = C.to_game(p)
            if g: d[g] = blob
        elif p != STATE_FILE: d[p] = blob
    return d

def behind(src, last, head):
    if not last: return -1
    return int(C.git(src, "rev-list", "--count", f"{last}..{head}", check=False)[1].strip() or 0)

def status_lines(src, game):
    last = last_mirrored(game); head = infra_head(src)
    if not last: return ["mirror: GAME has no mirrored INFRA commit yet (first import first: export.py --sync)"]
    n = behind(src, last, head)
    eq = tree_of(src, head, True) == tree_of(game, "origin/main")
    st = load()
    flags = (" PAUSED: " + st["paused"] if st["paused"] else "") + (" STOPPED" if st["stopped"] else "") + (f" PR #{st['pr']} open" if st["pr"] else "")
    return [f"mirror: GAME has INFRA {last[:12]}, {n} INFRA commits behind (INFRA main {head[:12]})",
            "mirror: game tree equals INFRA main: " + ("yes (lag 0)" if eq else "no") + flags]

# ---------- one pass ----------
def pause(st, why, say, key):
    st["paused"] = why; save(st)
    say(f"MIRROR paused at INFRA {key}: {why}")

def tick(src, game, run=None, say=print, game_repo=E.GAME_REPO, now=None):
    """-> short text of what happened. Never raises for a GitHub or git problem it can name; never pushes main."""
    run = run or default_run; now = now or time.time()
    src, game = Path(src), Path(game)
    st = load()
    if st["stopped"]: return "stopped"
    head = infra_head(src)
    if st["pr"]:                                                  # one PR in flight: its state is the ONE call of this tick
        rc, out = run(["gh", "pr", "view", str(st["pr"]), "--repo", game_repo, "--json", "state"])
        if rc: return f"cannot read PR #{st['pr']} ({out[:80]})"
        s = (json.loads(out).get("state") or "") if out.strip().startswith("{") else ""
        if s == "OPEN": return lag_check(st, say, now) or f"PR #{st['pr']} still open"
        pr = st["pr"]; st["pr"] = None; st["seen"] = ""
        if s != "MERGED": save(st); return pause(st, f"PR #{pr} was closed without merging", say, head[:12]) or "paused"
        save(st)
    if st["paused"]: return lag_check(st, say, now) or "paused"
    if st["seen"] == head and not st["behind_since"]: return "nothing to mirror"   # no GitHub call
    C.set_identity(game)
    C.git(game, "fetch", "-q", "origin")
    last = last_mirrored(game)
    if not last: st["seen"] = ""; save(st); return "GAME has no first import yet"
    paths = delta_paths(src, last, head)
    if not paths:
        st.update(seen=head, behind_since=None, lag_alarmed=False); save(st)
        return "no allowlisted change"
    if not st["behind_since"]: st["behind_since"] = now
    st["seen"] = head; save(st)
    return open_mirror_pr(st, src, game, last, head, paths, run, say, game_repo, now)

def open_mirror_pr(st, src, game, last, head, paths, run, say, game_repo, now):
    br = f"mirror/{head[:12]}"
    C.guard_branch(br)
    patch = delta_patch(src, last, head, paths)
    C.git(game, "checkout", "-q", "-B", br, "origin/main")
    def leave():
        C.git(game, "reset", "-q", "--hard", "origin/main"); C.git(game, "checkout", "-q", "--detach"); C.git(game, "branch", "-qD", br, check=False)
    if subprocess.run(["git", "-C", str(game), "apply", "--index", "-"], input=patch, capture_output=True).returncode:
        subprocess.run(["git", "-C", str(game), "reset", "-q", "--hard"], capture_output=True)
        leave()
        pause(st, f"INFRA {head[:12]} does not apply on GAME main ({len(paths)} files)", say, head[:12]); return "paused: conflict"
    changed = C.git(game, "diff", "--cached", "--name-only")[1].splitlines()
    tmp = Path(tempfile.mkdtemp(prefix="mirror-verify-"))
    try:
        for p in changed:
            f = game / p
            if f.is_file(): (tmp / p).parent.mkdir(parents=True, exist_ok=True); (tmp / p).write_bytes(f.read_bytes())
        bad = C.verify_tree(tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if bad:
        subprocess.run(["git", "-C", str(game), "reset", "-q", "--hard"], capture_output=True); leave()
        pause(st, f"verify hit in {len(bad)} place(s): " + "; ".join(b.rsplit(" (", 1)[0] for b in bad[:3]) + " (paths only)", say, head[:12]); return "paused: verify"
    (game / STATE_FILE).write_text(head + "\n", encoding="utf-8", newline="\n")
    C.git(game, "add", STATE_FILE)
    rng = f"{last[:12]}..{head[:12]}"
    n = behind(src, last, head)
    title = f"Mirror INFRA {rng}"
    body = f"Mirror of INFRA commits {rng} ({n} commits, {len(changed)} files changed).\n\n{E.TRAILER}{head}"
    C.commit(game, f"{title}\n\n{E.TRAILER}{head}")
    E.RUN = run                                                   # export.open_pr / push use the same gh
    E.push(game, br)
    url = E.open_pr(game_repo, title, br, "main", body)
    leave()
    m = re.search(r"/pull/(\d+)", url or "") or re.search(r"(\d+)\s*$", url or "")
    if not m: pause(st, "PR opened but its number is unknown: " + (url or "")[:80], say, head[:12]); return "paused: no pr number"
    num = int(m[1]); st["pr"] = num; save(st)
    run(["gh", "api", f"repos/{game_repo}/issues/{num}/labels", "-f", f"labels[]={LABEL}"])
    run(["gh", "pr", "merge", str(num), "--repo", game_repo, "--auto", "--squash"])
    return f"mirror PR #{num} for {rng}"

def lag_check(st, say, now):
    """ONE alarm per episode when the lag is over 30 min while no mirror PR is open or the mirror is paused. -> '' (keeps the caller's text)."""
    if st["behind_since"] and not st["lag_alarmed"] and now - st["behind_since"] > LAG_ALARM_MIN * 60 and (not st["pr"] or st["paused"]):
        st["lag_alarmed"] = True; save(st)
        say(f"MIRROR lag over {LAG_ALARM_MIN} min with no mirror PR open or the mirror paused")
    return ""

def resume():
    st = load(); st.update(paused="", seen="", lag_alarmed=False); save(st)

def stop():
    st = load(); st["stopped"] = True; save(st)
    return f"mirror stopped" + (f"; mirror PR #{st['pr']} is still open (it auto-merges or close it)" if st["pr"] else "")

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    g = ap.add_mutually_exclusive_group(required=True)
    for f in ("tick", "status", "resume", "stop"): g.add_argument("--" + f, action="store_true")
    ap.add_argument("--src", default=str(C.ROOT)); ap.add_argument("--game"); ap.add_argument("--game-repo", default=E.GAME_REPO)
    a = ap.parse_args(argv)
    if a.resume: resume(); print("mirror resumed"); return 0
    if a.stop: print(stop()); return 0
    if not a.game: ap.error("--game DIR is required")
    if a.status:
        C.git(a.game, "fetch", "-q", "origin", check=False)
        print("\n".join(status_lines(a.src, a.game))); return 0
    print(tick(a.src, a.game, game_repo=a.game_repo)); return 0

if __name__ == "__main__":
    sys.exit(main())
