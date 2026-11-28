# CI test (#786): play data never goes to GitHub. Fails with a file:line list (never prints play data or names).
# Run: python3 tools/test_no_playdata_to_github.py
import ast, re, sys, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools" / "runner"))
import ghcache

MARKER = "Play data never goes to GitHub"
MARKER_FILES = ["CLAUDE.md", "FLOW.md", "docs/agents/skills/retro.md", "tools/runner/nightly.py"]
# modules that hold or send play data: never allowed any GitHub write (no allowlist)
STRICT = ["tools/playlog.py", "tools/parent_digest.py"]
# file -> reason; a play-log reader that may write to GitHub (starts empty)
ALLOW = {}
IGNORE_LINES = ["playlog/", "playlog*.json", "diag.key"]
KEY_TOKENS = re.compile(r"\b(read_token|LOG_READ_KEY|diag\.key)\b")
SKIP_DIRS = {".git", "node_modules", "__pycache__"}

def rel(root, p): return str(Path(p).relative_to(root)).replace("\\", "/")

def reads_playlog(tree, src):
    for n in ast.walk(tree):
        if isinstance(n, ast.Import) and any(a.name.split(".")[0] == "playlog" for a in n.names): return True
        if isinstance(n, ast.ImportFrom) and (n.module or "").split(".")[0] == "playlog": return True
    return bool(KEY_TOKENS.search(src))

def gh_writes(tree):
    """line numbers of GitHub writes: gh write lists, R.gh/gh('issue','comment',..) calls, api.github.com, git commit/push."""
    hits = []
    for n in ast.walk(tree):
        if isinstance(n, ast.List) and n.elts and all(isinstance(e, ast.Constant) or isinstance(e, ast.Starred) for e in n.elts):
            c = [e.value if isinstance(e, ast.Constant) and isinstance(e.value, str) else "?" for e in n.elts]
            if c[:1] == ["gh"] and (any(isinstance(e, ast.Starred) for e in n.elts[:3]) or ghcache.is_write(c)): hits.append(n.lineno)
            if c[:1] == ["git"] and len(c) > 1 and c[1] in ("commit", "push"): hits.append(n.lineno)
        if isinstance(n, ast.Call):
            f = n.func
            name = f.attr if isinstance(f, ast.Attribute) else getattr(f, "id", "")
            if name in ("gh", "_gh", "GH") and n.args and all(isinstance(a, ast.Constant) for a in n.args[:3]):
                c = ["gh"] + [a.value for a in n.args if isinstance(a, ast.Constant)]
                if ghcache.is_write(c): hits.append(n.lineno)
        if isinstance(n, ast.Constant) and isinstance(n.value, str) and "api.github.com" in n.value: hits.append(n.lineno)
    return sorted(set(hits))

TRACKED_DEST = re.compile(r"\bROOT\b|\bREPO\b|MAIN_CHECKOUT|__file__|\bHERE\b|getcwd|Path\.cwd|^['\"f]|Path\(['\"]")   # a repo-relative path or a literal path
PRIVATE_DEST = re.compile(r"HOME|\.oren|tempfile|tmp", re.I)

def file_writes(tree):
    """#790: line numbers of file writes (write_text/write_bytes/open w,a,x) whose target is a repo path (ROOT/HERE/__file__/cwd) or a literal path, and does not name the private folder (HOME, ~/.oren, a temp dir)."""
    hits = []
    for n in ast.walk(tree):
        if not isinstance(n, ast.Call): continue
        f = n.func
        if isinstance(f, ast.Attribute) and f.attr in ("write_text", "write_bytes"): target = ast.unparse(f.value)
        elif isinstance(f, ast.Name) and f.id == "open" and n.args and len(n.args) > 1 and isinstance(n.args[1], ast.Constant) and set(str(n.args[1].value)) & set("wax"): target = ast.unparse(n.args[0])
        else: continue
        if TRACKED_DEST.search(target) and not PRIVATE_DEST.search(target): hits.append(n.lineno)
    return hits

def check(root):
    root = Path(root); bad = []
    for p in sorted((root / "tools").rglob("*.py")) if (root / "tools").is_dir() else []:
        if SKIP_DIRS & set(p.parts) or p.name.startswith("test_"): continue
        r = rel(root, p)
        try: src = p.read_text(encoding="utf-8", errors="replace"); tree = ast.parse(src)
        except SyntaxError: continue
        strict = r in STRICT
        if not (strict or reads_playlog(tree, src)) or r in ALLOW: continue
        for ln in gh_writes(tree):
            bad.append(f"{r}:{ln}: GitHub write in a module that reads play data" + ("" if strict else " (not in ALLOW)"))
        for ln in file_writes(tree):
            bad.append(f"{r}:{ln}: file write outside the private folder in a module that reads play data")
    for f in MARKER_FILES:
        p = root / f
        if not p.is_file() or MARKER not in p.read_text(encoding="utf-8", errors="replace"):
            bad.append(f"{f}:1: marker phrase '{MARKER}' missing")
    gi = root / ".gitignore"
    lines = {l.strip() for l in gi.read_text().splitlines()} if gi.is_file() else set()
    for pat in IGNORE_LINES:
        if pat not in lines: bad.append(f".gitignore:1: pattern '{pat}' missing")
    for p in root.rglob("*"):
        if SKIP_DIRS & set(p.relative_to(root).parts) or not p.is_file(): continue
        if "playlog" in p.relative_to(root).parts[:-1] or re.match(r"^playlog.*\.json$", p.name):
            bad.append(f"{rel(root, p)}:1: play-log file in the repo")
    return bad

def fixture(root, drop_marker=None, extra=None):
    root = Path(root)
    for f in MARKER_FILES:
        (root / f).parent.mkdir(parents=True, exist_ok=True)
        (root / f).write_text("" if f == drop_marker else MARKER)
    (root / ".gitignore").write_text("\n".join(IGNORE_LINES) + "\n")
    (root / "tools").mkdir(exist_ok=True)
    for name, src in (extra or {}).items(): (root / name).write_text(src)

def selftest():
    with tempfile.TemporaryDirectory() as d:
        fixture(d); assert check(d) == [], check(d)
    for f in MARKER_FILES:
        with tempfile.TemporaryDirectory() as d:
            fixture(d, drop_marker=f)
            assert any(b.startswith(f + ":") for b in check(d)), f
    with tempfile.TemporaryDirectory() as d:
        fixture(d, extra={"tools/bad.py": "import playlog\nimport runner as R\nR.gh('issue', 'comment', '1', '--body', 'x')\n"})
        assert check(d) == ["tools/bad.py:3: GitHub write in a module that reads play data (not in ALLOW)"], check(d)
    with tempfile.TemporaryDirectory() as d:   # #790: play numbers into a tracked path
        fixture(d, extra={"tools/bad.py": "import playlog\nfrom pathlib import Path\nPath('docs/day.md').write_text('x')\nopen('a.txt', 'w')\nPath(HOME / 'ok.json').write_text('x')\n"})
        assert [b.split(": ")[0] for b in check(d)] == ["tools/bad.py:3", "tools/bad.py:4"], check(d)
    with tempfile.TemporaryDirectory() as d:
        fixture(d, extra={"tools/playlog.py": "x = ['git', 'push']\n", "tools/ok.py": "import runner as R\nR.gh('issue', 'comment', '1')\n"})
        assert [b.split(":")[0] for b in check(d)] == ["tools/playlog.py"], check(d)
    with tempfile.TemporaryDirectory() as d:
        fixture(d); (Path(d) / "playlog").mkdir(); (Path(d) / "playlog" / "2026-11-27.json").write_text("{}")
        assert any("play-log file" in b for b in check(d))
    with tempfile.TemporaryDirectory() as d:
        fixture(d); (Path(d) / ".gitignore").write_text("")
        assert len(check(d)) == len(IGNORE_LINES)

if __name__ == "__main__":
    selftest()
    bad = check(ROOT)
    if bad: print("play data may reach GitHub:\n" + "\n".join(bad)); sys.exit(1)
    print("ok: no play data to GitHub")
