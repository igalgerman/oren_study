"""#956: project registry reader. The only code that knows which repo belongs to which project (data: projects.toml).
Path -> project: longest matching prefix in `paths`; unknown -> the `default` project + a warning."""
import os, sys, tomllib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
REGISTRY = Path(os.environ.get("PROJECTS_TOML") or ROOT / "projects.toml")   # tests point this at a dummy registry

def load(path=None):
    return tomllib.loads(Path(path or REGISTRY).read_text(encoding="utf-8"))

def projects(reg=None):
    return (reg or load())["project"]

def get(name, reg=None):
    reg = reg or load()
    if name not in reg["project"]: raise KeyError(f"unknown project {name!r}; known: {', '.join(reg['project'])}")
    return reg["project"][name]

def repo_for(name, reg=None):
    return get(name, reg)["repo"]

def project_for_path(path, reg=None, warn=None):
    """-> (project name, warning or ''). Absolute paths are taken relative to the repo root."""
    reg = reg or load()
    p = Path(path)
    if p.is_absolute():
        try: p = p.relative_to(ROOT)
        except ValueError: pass
    s = p.as_posix().lstrip("./") if str(path).startswith("./") else p.as_posix()
    best, blen = None, -1
    for name, pr in reg["project"].items():
        for pre in pr.get("paths", []):
            if (s + "/").startswith(pre) or s.startswith(pre):
                if len(pre) > blen: best, blen = name, len(pre)
    if best: return best, ""
    msg = f"warning: path {path!r} is under no project in projects.toml; using the default project {reg['default']!r}"
    (warn or (lambda m: print(m, file=sys.stderr)))(msg)
    return reg["default"], msg

if __name__ == "__main__":
    for n, p in projects().items(): print(n, p["repo"], p["kind"])
