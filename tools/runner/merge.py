"""#636 The only way an orchestrator agent merges a PR by hand. It refuses a draft, a PR labelled blocked / no-automerge /
owner-merge, and a PR whose issue is owner-gated with its gate CLOSED (owner_q.py gate #n) - the same guard as the runner.
Otherwise it marks `gh pr merge <pr> --auto --squash` (GitHub merges when the checks are green).
Usage: python tools/runner/merge.py <pr>
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import runner as R

def main(argv):
    if len(argv) != 1 or not argv[0].lstrip("#").isdigit():
        print(__doc__); return 2
    pr = argv[0].lstrip("#")
    why = R.merge_block(pr)
    if why:
        print(f"REFUSED: PR #{pr}: {why}"); return 1
    rc, out = R.gh("pr", "merge", pr, "--auto", "--squash")
    print(out.strip() or (f"PR #{pr}: auto-merge set" if rc == 0 else f"gh pr merge failed (exit {rc})"))
    return 0 if rc == 0 else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
