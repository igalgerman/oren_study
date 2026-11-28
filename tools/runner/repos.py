"""#792: the ONE place that knows the repo names. INFRA = `repo` (backlog, runner), GAME = `game_repo` (game PRs), DATA = `data_repo`.
Every name comes from config.toml; no other source file hardcodes one (test_repos.py: test_no_hardcoded_repo).
game_repo unset/empty = one-repo mode: the runner behaves as before (INFRA only)."""
import threading, tomllib
from pathlib import Path

HERE = Path(__file__).resolve().parent

def load(path=None):
    """-> {infra, game, data}; game/data '' when unset. A bare name gets the INFRA owner."""
    try: cfg = tomllib.loads(Path(path or HERE / "config.toml").read_text(encoding="utf-8"))
    except (OSError, ValueError): cfg = {}
    infra = cfg.get("repo", "")
    owner = infra.split("/")[0] if "/" in infra else ""
    full = lambda n: (n if "/" in n or not n or not owner else f"{owner}/{n}")
    return {"infra": infra, "game": full(cfg.get("game_repo", "")), "data": full(cfg.get("data_repo", ""))}

_R = load()
INFRA, GAME, DATA = _R["infra"], _R["game"], _R["data"]

def deploy_repo():
    """#792: deployments, deploy runs, the voice-missing status and the suite times live in GAME (INFRA in one-repo mode)."""
    return GAME or INFRA

def both(infra=None, game=None):
    """The repos a PR may live in, INFRA first ([INFRA] in one-repo mode)."""
    infra, game = INFRA if infra is None else infra, GAME if game is None else game
    return [infra] + ([game] if game and game != infra else [])

def closes_ref(n, infra=None):
    """#792: the full cross-repo reference for a PR body written in GAME: 'Closes owner/infra#n' (a bare '#n' there is a GAME number)."""
    return f"Closes {INFRA if infra is None else infra}#{n}"

def pr_ref(repo, pr):
    """#792: a PR reference on an INFRA issue is always a full URL (GAME PR 5 and INFRA issue 5 coexist)."""
    return f"https://github.com/{repo}/pull/{pr}"

_T = threading.local()

def pr_repo():
    """#792: the repo of the PR this lane thread works on (set when its PR is found, in GAME or INFRA); INFRA when none."""
    return getattr(_T, "repo", None) or INFRA

def set_pr_repo(repo): _T.repo = repo or None

class in_repo:
    """`with in_repo(r):` PR commands of this thread go to repo r."""
    def __init__(self, repo): self.repo = repo
    def __enter__(self): self.prev = getattr(_T, "repo", None); _T.repo = self.repo
    def __exit__(self, *a): _T.repo = self.prev
