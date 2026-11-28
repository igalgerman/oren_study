"""#814: the merge guards of the split, used by runner.merge_block (pure functions + the flip state file).
 - commit_refusal: a GAME PR whose commits carry any author/committer e-mail other than the neutral one is refused (count only).
 - tree_refusal: one source of truth. Before the flip INFRA is the source: allowed. During the flip (`hold`): no game-tree merge.
   After the flip a NEW INFRA PR that changes the game tree is refused (it belongs in GAME); allowed: in-flight PRs of issues routed
   to INFRA before the flip, and the `--back` PR (branch `back/*`).
State: RUNS/split_flip.json {"flipped": bool, "hold": bool, "infra_issues": [n..]}; the flip script (#796) sets and clears it:
  python3 tools/split/guards.py hold on|off   |   flipped <issue numbers routed to INFRA before the flip>   |   show"""
import json, os, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import common as C

STATE = "split_flip.json"

def runs_dir():
    return Path(os.environ.get("RUNNER_RUNS") or C.ROOT / "tools" / "runner" / ".runs")

def load(runs=None):
    try: d = json.loads((Path(runs or runs_dir()) / STATE).read_text(encoding="utf-8"))
    except (OSError, ValueError): d = {}
    return {"flipped": bool(d.get("flipped")), "hold": bool(d.get("hold")), "infra_issues": [int(x) for x in d.get("infra_issues") or []]}

def save(d, runs=None):
    r = Path(runs or runs_dir()); r.mkdir(parents=True, exist_ok=True)
    (r / STATE).write_text(json.dumps(d), encoding="utf-8")

def set_hold(on, runs=None):
    d = load(runs); d["hold"] = bool(on); save(d, runs); return d

def set_flipped(issues, runs=None):
    d = load(runs); d["flipped"] = True; d["infra_issues"] = sorted(set(d["infra_issues"]) | {int(i) for i in issues}); save(d, runs); return d

def commit_refusal(commits, neutral=None):
    """`gh api repos/<game>/pulls/<n>/commits` (parsed list) -> '' or a refusal with the COUNT of commits with another e-mail."""
    neutral = (neutral or C.neutral_email()).lower()
    bad = 0
    for c in commits or []:
        cm = c.get("commit") or {}
        a = ((cm.get("author") or {}).get("email") or "").lower()
        k = ((cm.get("committer") or {}).get("email") or "").lower()
        if a != neutral or k != neutral: bad += 1
    return f"{bad} commit(s) carry an author or committer e-mail other than the neutral one" if bad else ""

def pr_issue_numbers(body):
    return [int(x) for x in re.findall(r"(?i)\b(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?|refs?)\s+#(\d+)", body or "")]

def tree_refusal(files, body="", head="", state=None):
    """files = paths the INFRA PR changes. -> '' or why the merge is refused."""
    st = load() if state is None else state
    if not any(C.is_game_only(f) for f in files or []): return ""
    if st.get("hold"): return "the flip is in progress: game-tree merges are held for a few minutes"
    if not st.get("flipped"): return ""
    if (head or "").startswith(C.BACK_PREFIX): return ""
    if set(pr_issue_numbers(body)) & set(st.get("infra_issues") or []): return ""
    return "the game tree now lives in the game repo: this change belongs in a PR there"

def main(argv):
    a = argv[1:]
    if a[:1] == ["hold"] and a[1:2] in (["on"], ["off"]): print(set_hold(a[1] == "on"))
    elif a[:1] == ["flipped"]: print(set_flipped(a[1:]))
    elif a[:1] == ["show"]: print(load())
    else: print(__doc__); return 2
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv))
