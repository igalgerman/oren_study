# CI test (#783): every `gh` WRITE call under tools/**/*.py goes through R.run / R.gh (where the privacy scrub lives, tools/runner/scrub.py).
# A new bypass fails with the file:line list. Run: python3 tools/test_no_gh_bypass.py
import ast, os, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools" / "runner"))
import ghcache

# callables that end in R.run / remote.sh (both scrub) or scrub it themselves
OK_CALLEES = {"run", "gh", "GH", "_gh", "sh", "_sh", "scrub_cmd", "R.run", "R.gh", "remote.sh", "R.run_", "RUN", "E.RUN"}   # RUN = tools/split gh_run, which scrubs
# file -> reason; a write list in these files may bypass the wrapper
ALLOW = {
    "tools/split/game_settings.py": "owner-run repo settings (PATCH/PUT settings, no issue/PR text)",
    "tools/runner/ghauth.py": "mints the App installation token (POST access_tokens): no issue/PR text",
}

def name_of(node):
    if isinstance(node, ast.Name): return node.id
    if isinstance(node, ast.Attribute):
        b = name_of(node.value)
        return f"{b}.{node.attr}" if b else node.attr
    return ""

def const_list(node):
    return [e.value if isinstance(e, ast.Constant) and isinstance(e.value, str) else "?" for e in node.elts]

def writes(lst):
    """The list literal ['gh', ...] with unknown parts as '?': a write command? (unknown subcommand after a star -> treat as a write)"""
    if any(isinstance(e, ast.Starred) for e in lst.elts[:3]): return True
    c = const_list(lst)
    return ghcache.is_write(c) or (c[:1] == ["gh"] and len(c) > 2 and c[1] == "?")

def scan(path, src):
    tree = ast.parse(src)
    parent = {}
    for p in ast.walk(tree):
        for ch in ast.iter_child_nodes(p): parent[ch] = p
    bad = []
    for n in ast.walk(tree):
        if not (isinstance(n, ast.List) and n.elts and isinstance(n.elts[0], ast.Constant) and n.elts[0].value == "gh"): continue
        if not writes(n): continue
        p = parent.get(n)
        callee = ""
        if isinstance(p, ast.Call) and n in p.args: callee = name_of(p.func)
        elif isinstance(p, ast.Assign) and isinstance(p.targets[0], ast.Name):      # cmd = ["gh", ...]; run(cmd)
            var, fn = p.targets[0].id, p
            while fn in parent and not isinstance(fn, (ast.FunctionDef, ast.Module)): fn = parent[fn]
            uses = [c for c in ast.walk(fn) if isinstance(c, ast.Call) and any(isinstance(a, ast.Name) and a.id == var for a in c.args)]
            callee = name_of(uses[0].func) if uses and all(name_of(u.func).split(".")[-1] in {c.split(".")[-1] for c in OK_CALLEES} for u in uses) else ""
        elif isinstance(p, ast.Subscript) or isinstance(p, ast.Call):      # scrub_cmd([...])[0]
            q = p
            while q in parent and not isinstance(q, ast.Call): q = parent[q]
            if isinstance(q, ast.Call): callee = name_of(q.func)
        if not callee or callee.split(".")[0] in ("subprocess", "os", "sp", "asyncio") or callee.split(".")[-1] not in {c.split(".")[-1] for c in OK_CALLEES}:
            bad.append(f"{path}:{n.lineno}")
    return bad

def run():
    out = []
    for f in sorted((ROOT / "tools").rglob("*.py")):
        rel = f.relative_to(ROOT).as_posix()
        if "/test_" in rel or rel.rsplit("/", 1)[-1].startswith("test_") or "node_modules" in rel or rel in ALLOW: continue
        out += scan(rel, f.read_text(encoding="utf-8"))
    return out

if __name__ == "__main__":
    # the scanner itself: a bypass is found, a wrapped call is not
    assert scan("x.py", "import subprocess\nsubprocess.run(['gh','issue','comment','1','--body',t])") == ["x.py:2"]
    assert scan("x.py", "import subprocess\nsubprocess.run(['gh','issue','list'])") == [], "reads are fine"
    assert scan("x.py", "R.run(['gh','issue','comment','1','--body',t])") == [] and scan("x.py", "R.gh('issue','comment')") == []
    assert scan("x.py", "def f():\n    c = ['gh','pr','edit','1']\n    subprocess.run(c)") == ["x.py:2"]
    assert scan("x.py", "def f():\n    c = ['gh','pr','edit','1']\n    run(c)") == []
    bad = run()
    assert not bad, "gh write calls that bypass R.run/R.gh (the privacy scrub, #783):\n  " + "\n  ".join(bad)
    print("ok: no gh write bypasses R.run / R.gh")
