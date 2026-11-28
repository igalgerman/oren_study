"""#956: the one filing helper. `python3 tools/file.py issue|pr|question [--project NAME] [--path PATH ...] --title T --body B [--head BRANCH] [--dry-run]`
Repo comes from projects.toml; files under a project's tree map to it (--path), else the default (INFRA). Issues get a duplicate check first."""
import argparse, json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import projects as P
sys.path.insert(0, str(Path(__file__).resolve().parent / "runner"))
import scrub

def gh(args, **kw):
    """Every gh call goes through the privacy scrub (#783)."""
    cmd, inp = scrub.scrub_cmd(["gh", *args])[0], kw.pop("input", None)
    kw.pop("text", None); kw.pop("universal_newlines", None)
    kw.setdefault("encoding", "utf-8"); kw.setdefault("errors", "replace")   # #981: never the console code page (cp1255)
    return subprocess.run(cmd, input=inp, **kw)

def resolve(project, paths, reg=None):
    """-> (project name, warning). Explicit --project wins; else the paths (must agree); else the default."""
    reg = reg or P.load()
    if project: P.get(project, reg); return project, ""
    if not paths: return reg["default"], ""
    found = [P.project_for_path(p, reg, warn=lambda m: None) for p in paths]
    names = sorted({n for n, _ in found})
    warns = [w for _, w in found if w]
    return (names[0] if len(names) == 1 else reg["default"]), "; ".join(warns + ([f"paths span {names}: filed to default"] if len(names) > 1 else []))

def plan(kind, project, title, body, labels=(), head=None, reg=None):
    pr = P.get(project, reg); repo = pr["repo"]
    lab = list(dict.fromkeys([*pr.get("labels", []), *labels, *(["question"] if kind == "question" else [])]))
    if kind == "pr":
        cmd = ["pr", "create", "--repo", repo, "--base", "main", "--title", title, "--body", body] + (["--head", head] if head else [])
    else:
        cmd = ["issue", "create", "--repo", repo, "--title", title, "--body", body]
    for l in lab: cmd += ["--label", l]
    return {"repo": repo, "project": project, "labels": lab, "cmd": cmd}

class DuplicateCheckError(Exception): pass

def duplicates(repo, title, run=None):
    """Open or closed issues in `repo` whose title equals ours (case-insensitive). An unreadable check raises DuplicateCheckError (#981)."""
    r = (run or gh)(["issue", "list", "-R", repo, "--state", "all", "--limit", "200", "--json", "number,title,state"], capture_output=True, text=True)
    if r.returncode: raise DuplicateCheckError(f"gh issue list failed (exit {r.returncode}): {(r.stderr or '').strip()[:200]}")
    try: items = json.loads(r.stdout or "")
    except (ValueError, TypeError): raise DuplicateCheckError("gh issue list gave empty or unreadable output")
    if not isinstance(items, list): raise DuplicateCheckError("gh issue list gave unexpected output")
    return [i for i in items if i["title"].strip().lower() == title.strip().lower()]

def main(argv=None):
    a = argparse.ArgumentParser(prog="file.py")
    a.add_argument("kind", choices=["issue", "pr", "question"])
    a.add_argument("--project"); a.add_argument("--path", action="append", default=[])
    a.add_argument("--title", required=True); a.add_argument("--body", default=""); a.add_argument("--label", action="append", default=[])
    a.add_argument("--head"); a.add_argument("--dry-run", action="store_true")
    o = a.parse_args(argv)
    proj, warn = resolve(o.project, o.path)
    if warn: print(warn, file=sys.stderr)
    pl = plan(o.kind, proj, o.title, o.body, o.label, o.head)
    if o.kind != "pr":
        try: d = duplicates(pl["repo"], o.title) if not o.dry_run else []
        except DuplicateCheckError as e: print(f"duplicate check failed, nothing filed: {e}", file=sys.stderr); return 3
        if d: print(f"duplicate of #{d[0]['number']} ({d[0]['state']}) in {pl['repo']}: comment there instead", file=sys.stderr); return 2
    if o.dry_run: print(json.dumps(pl)); return 0
    return gh(pl["cmd"]).returncode

if __name__ == "__main__": sys.exit(main())
