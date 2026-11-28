"""#814: shared helpers of the split tools (export, port_pr, game_settings). Pure functions + thin git/gh wrappers; tests inject `run`.
Nothing here pushes to main (the session guard of #800); nothing prints matched text, only paths and counts."""
import fnmatch, os, re, subprocess, sys, unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "tools" / "runner"))

# ---------- the ONE explicit allowlist of the GAME tree ----------
GAME_DIRS = ("oren2",)                                   # the game folder ...
EXCLUDE = ("oren2/docs", "oren2/node_modules", "oren2/tests/.tmp")   # ... without its docs/ and build leftovers
GAME_FILES = (".github/workflows/tests.yml", ".github/workflows/deploy.yml", ".github/workflows/preview.yml",   # the three game workflows
              "GLOSSARY.md", ".gitattributes",
              ".claude/settings.json", ".claude/hooks/guard.py")       # the session settings + guard hook of #800
GAME_CLAUDE_SRC = "tools/split/game_CLAUDE.md"           # INFRA path of the game CLAUDE.md; it is `CLAUDE.md` in GAME
GAME_CLAUDE_DST = "CLAUDE.md"
# GAME-only paths: after the flip a NEW INFRA PR may not change them (they belong in GAME) (#814, runner.merge_block)
GAME_ONLY_DIRS, GAME_ONLY_FILES = GAME_DIRS, ("GLOSSARY.md",)
GAME_ONLY_EXCLUDE = EXCLUDE
BACK_PREFIX = "back/"                                    # branch prefix of the --back PR in INFRA

def _under(p, d): return p == d or p.startswith(d + "/")

def norm(p):
    p = str(p).replace("\\", "/")
    return p[2:] if p.startswith("./") else p

def is_game_path(p, dirs=GAME_DIRS, files=GAME_FILES, exclude=EXCLUDE):
    p = norm(p)
    if any(_under(p, e) for e in exclude): return False
    return p in files or any(_under(p, d) for d in dirs)

def is_game_only(p):
    return is_game_path(p, GAME_ONLY_DIRS, GAME_ONLY_FILES, GAME_ONLY_EXCLUDE)

def to_game(p):
    """INFRA path -> GAME path ('' when it is not exported)."""
    p = norm(p)
    if p == GAME_CLAUDE_SRC: return GAME_CLAUDE_DST
    return p if is_game_path(p) else ""

def to_infra(p):
    """GAME path -> INFRA path ('' when it has no INFRA home)."""
    p = norm(p)
    if p == GAME_CLAUDE_DST: return GAME_CLAUDE_SRC
    return p if is_game_path(p) else ""

def list_tree(src):
    """Repo-relative paths of the exported tree of `src` (tracked files when it is a git checkout, else a walk); sorted."""
    src = Path(src); out = set()
    if (src / ".git").exists():
        r = subprocess.run(["git", "-C", str(src), "ls-files", "-z"], capture_output=True, check=True)
        cands = [x.decode("utf-8", "surrogateescape") for x in r.stdout.split(b"\0") if x]
        cands = [c for c in cands if (src / c).is_file()]
    else:
        cands = [norm(os.path.relpath(os.path.join(d, f), src)) for d, _, fs in os.walk(src) for f in fs]
    for c in cands:
        g = to_game(c)
        if g: out.add(c)
    return sorted(out)

def build_tree(src, dst):
    """Copy the exported tree of `src` into the empty folder `dst` (INFRA path -> GAME path). -> {game path: ...} sorted list."""
    dst = Path(dst); done = []
    for c in list_tree(src):
        g = to_game(c)
        t = dst / g; t.parent.mkdir(parents=True, exist_ok=True)
        t.write_bytes((Path(src) / c).read_bytes()); done.append(g)
    return sorted(done)

def counts(paths):
    """Path counts per top-level folder (never names, never content)."""
    c = {}
    for p in paths:
        k = p.split("/", 1)[0] if "/" in p else "(root)"
        c[k] = c.get(k, 0) + 1
    return c

# ---------- neutral identity ----------
def neutral_email():
    if os.environ.get("SPLIT_NEUTRAL_EMAIL"): return os.environ["SPLIT_NEUTRAL_EMAIL"]
    import gitid; return gitid.email()

NEUTRAL_NAME = "learn-quest"

def neutral_env(base=None):
    """Environment for a git commit: neutral author AND committer."""
    e = dict(os.environ if base is None else base); m = neutral_email()
    e.update(GIT_AUTHOR_NAME=NEUTRAL_NAME, GIT_AUTHOR_EMAIL=m, GIT_COMMITTER_NAME=NEUTRAL_NAME, GIT_COMMITTER_EMAIL=m)
    return e

def git(repo, *args, env=None, check=True, input=None):
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, env=env or neutral_env(), input=input)
    out = r.stdout.decode("utf-8", "replace")
    if check and r.returncode:
        raise RuntimeError(f"git {args[0]} failed (rc {r.returncode}): {r.stderr.decode('utf-8', 'replace').strip()[:300]}")
    return r.returncode, out

def set_identity(repo):
    """Repo-level neutral identity of a checkout (its worktrees share it)."""
    git(repo, "config", "user.email", neutral_email()); git(repo, "config", "user.name", NEUTRAL_NAME)
    git(repo, "config", "user.useConfigOnly", "true")
    git(repo, "config", "commit.gpgsign", "false")

def commit(repo, msg, config=True):
    """Commit everything staged with the neutral author AND committer (env always; repo config too unless config=False). -> sha."""
    if config: set_identity(repo)
    git(repo, "commit", "-q", "-m", msg)
    return git(repo, "rev-parse", "HEAD")[1].strip()

def commit_emails(repo, rng):
    """[(sha, author e-mail, committer e-mail)] of the commits in `rng`."""
    out = git(repo, "log", "--format=%H %ae %ce", rng)[1].splitlines()
    return [tuple(l.split(" ")) for l in out if l.strip()]

def commits_bad(repo, rng):
    """Count of commits in `rng` whose author or committer e-mail is not the neutral one."""
    m = neutral_email()
    return sum(1 for _, a, c in commit_emails(repo, rng) if a != m or c != m)

def guard_branch(name):
    """The session guard (#800): the split tools never push main/master."""
    if name in ("main", "master", "refs/heads/main", "refs/heads/master") or name.endswith(":main"):
        raise RuntimeError("refusing to push to main: the split tools only push branches (#800)")

# ---------- the verify step ----------
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+")
PLAYLOG_RE = re.compile(r"(?:^|/)(?:playlog/|playlog[^/]*\.json$|diag\.key$|play[-_]?log[^/]*\.(?:json|jsonl|csv|ndjson)$)", re.I)

def _fold(s):
    """Lower-case, no Hebrew nikud / cantillation (so a name matches with or without nikud)."""
    s = unicodedata.normalize("NFD", s)
    return "".join(ch for ch in s if not ("֑" <= ch <= "ׇ")).casefold()

def read_list(path):
    try: lines = Path(path).read_text(encoding="utf-8").splitlines()
    except OSError: return []
    return [l.strip() for l in lines if l.strip() and not l.strip().startswith("#")]

def allowed_identifiers():
    return read_list(os.environ.get("SPLIT_ALLOWED_IDENTIFIERS") or HERE / "allowed_identifiers.txt")

def personal_patterns():
    return read_list(os.environ.get("SPLIT_PERSONAL_LIST") or HERE / "personal_paths.txt")

def private_names():
    import scrub
    return [_fold(n) for n in scrub.names()]

def verify_tree(root, names=None, allowed=None, personal=None, email=None):
    """Fails closed. -> list of problem lines `path: kind (count)`; never the matched text. No names configured = a problem too."""
    root = Path(root); problems = []
    names = private_names() if names is None else [_fold(n) for n in names]
    allowed = [_fold(a) for a in (allowed_identifiers() if allowed is None else allowed)]
    personal = personal_patterns() if personal is None else personal
    email = (email or neutral_email()).lower()
    if not names: problems.append("(names list): empty, cannot verify (set PRIVATE_NAMES or the private names file) (1)")
    files = sorted(norm(os.path.relpath(os.path.join(d, f), root)) for d, _, fs in os.walk(root) for f in fs)
    for rel in files:
        if any(fnmatch.fnmatch(rel, pat) or _under(rel, pat.rstrip("/")) for pat in personal):
            problems.append(f"{rel}: on the personal list (1)")
        if PLAYLOG_RE.search(rel): problems.append(f"{rel}: play-log pattern (1)")
        for text, kind in ((rel, "name in path"),):
            n = _name_hits(text, names, allowed)
            if n: problems.append(f"{rel}: {kind} ({n})")
        data = (root / rel).read_bytes()
        if b"\0" in data[:4096]: continue                # binary: names and e-mails are looked for in text only
        text = data.decode("utf-8", "replace")
        n = _name_hits(text, names, allowed)
        if n: problems.append(f"{rel}: private name ({n})")
        n = sum(1 for m in EMAIL_RE.findall(text) if m.lower() != email)
        if n: problems.append(f"{rel}: e-mail address other than the neutral author ({n})")
    return problems

def _name_hits(text, names, allowed):
    t = _fold(text)
    for a in allowed: t = t.replace(a, " ")
    return sum(t.count(n) for n in names if n)
