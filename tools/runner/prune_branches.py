"""Delete finished lane/* and claude/* branches (#847): python3 tools/runner/prune_branches.py --dry-run | --apply

A branch is listed only when it has at least one PR and every PR on it is merged or closed, no PR on it is open,
and its issue has no live run (open issue labelled in-progress). main and branches without any PR are never touched.
--apply deletes each listed branch with the REST ref delete and logs one line per branch to .runs/prune_branches.log.
(The repo setting delete_branch_on_merge keeps new ones from piling up; the runner works without the branch: PRs are
found by head name with --state all, ls-remote/fetch failures are ignored, a missing branch reads as '' in remote.cloud.)"""
import json, re, sys, time
from pathlib import Path
import remote

REPO = remote.REPO
LOG = remote.RUNS / "prune_branches.log"
PREFIXES = ("lane/", "claude/")

def _json(run, cmd, default):
    rc, out = run(cmd)
    try: return json.loads(out) if rc == 0 and out.strip() else default
    except ValueError: return default

def _pages(run, path, key=""):
    """All pages of a REST list (gh api --paginate prints one JSON array per page)."""
    rc, out = run(["gh", "api", "--paginate", path])
    if rc: raise RuntimeError(f"gh api {path} rc {rc}: {out.strip()[:200]}")
    items, dec, i, out = [], json.JSONDecoder(), 0, out.strip()
    while i < len(out):
        v, j = dec.raw_decode(out, i); items += v if isinstance(v, list) else [v]
        i = j
        while i < len(out) and out[i].isspace(): i += 1
    return items

def issue_of(branch, bodies=()):
    m = re.match(r"lane/(\d+)$", branch) or re.search(r"issue-(\d+)", branch)
    if m: return int(m[1])
    for b in bodies:
        m = re.search(r"\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)", b or "", re.I)
        if m: return int(m[1])
    return None

def candidates(run):
    """Pure-ish: [(branch, why)] to delete, from fake-able gh. Raises when GitHub cannot be read (nothing is guessed)."""
    branches = [b["name"] for b in _pages(run, f"repos/{REPO}/branches?per_page=100")]
    prs = _pages(run, f"repos/{REPO}/pulls?state=all&per_page=100")
    live = {i["number"] for i in _json(run, ["gh", "issue", "list", "--repo", REPO, "--state", "open", "--label", "in-progress",
                                             "--limit", "100", "--json", "number"], [])}
    by = {}
    for p in prs:
        head = p.get("head") or {}
        if (head.get("repo") or {}).get("full_name", REPO) != REPO: continue     # a fork's branch of the same name is not ours
        by.setdefault(head.get("ref"), []).append(p)
    out = []
    for b in sorted(branches):
        if b == "main" or not b.startswith(PREFIXES): continue
        ps = by.get(b)
        if not ps or any(p.get("state") == "open" for p in ps): continue
        n = issue_of(b, [p.get("body") for p in ps])
        if n in live: continue
        out.append((b, f"{len(ps)} PR(s) all merged/closed" + (f", issue #{n}" if n else "")))
    return out

def apply(run, cands, log=LOG, now=None):
    done = []
    for b, why in cands:
        rc, msg = run(["gh", "api", "-X", "DELETE", f"repos/{REPO}/git/refs/heads/{b}"])
        line = f"{time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(now))} {'deleted' if rc == 0 else 'FAILED rc %d %s' % (rc, msg.strip()[:100])} {b} ({why})"
        try:
            Path(log).parent.mkdir(parents=True, exist_ok=True)
            with open(log, "a", encoding="utf-8", newline="\n") as f: f.write(line + "\n")
        except OSError: pass
        print(line)
        if rc == 0: done.append(b)
    return done

def main(argv, run=remote.sh):
    if argv not in (["--dry-run"], ["--apply"]):
        print(__doc__); return 2
    cands = candidates(run)
    if argv == ["--dry-run"]:
        for b, why in cands: print(f"would delete {b} ({why})")
        print(f"{len(cands)} branch(es)"); return 0
    done = apply(run, cands)
    print(f"deleted {len(done)} of {len(cands)}")
    return 0 if len(done) == len(cands) else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
