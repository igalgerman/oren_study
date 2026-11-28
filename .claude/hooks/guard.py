#!/usr/bin/env python3
"""#800: PreToolUse guard for Bash and PowerShell (replaces block-dangerous-git.sh). Parses the command (no regex over raw JSON).
Blocks: merge commands (`gh pr merge`, REST/GraphQL merge and auto-merge calls), every git push whose target is main/master in any
refspec form (main, +main, HEAD:main, HEAD:refs/heads/main, refs/heads/main, :main = delete), forced pushes, mass pushes,
a push with no refspec while the current branch is main/master, deleting main, git clean -x.
Allows lane/<n> pushes (also HEAD:lane/<n>), gh pr create, gh pr comment. Exit 2 = blocked (message on stderr)."""
import json, re, shlex, subprocess, sys

PROTECTED = ("main", "master")
SPLIT = re.compile(r"\|\||&&|[;|&\n]")
MERGE_API = re.compile(r"(/merge\b|auto_merge|mergePullRequest|enablePullRequestAutoMerge|merge_pull_request)", re.I)

def segments(cmd):
    for part in SPLIT.split(cmd):
        part = part.strip().strip("()`{}")
        if not part: continue
        try: yield shlex.split(part, posix=True)
        except ValueError: yield part.split()

def strip_ref(r):
    r = r.lstrip("+")
    for p in ("refs/heads/", "heads/"):
        if r.startswith(p): r = r[len(p):]
    return r

def is_protected_dst(spec):
    dst = spec.split(":", 1)[1] if ":" in spec else spec          # `src:dst` -> dst; a bare name is its own target
    return strip_ref(dst) in PROTECTED

def current_branch():
    try: return subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception: return ""

def git_args(tok):
    """tokens after `git`, minus global options -> (subcommand, args)."""
    i = 0
    while i < len(tok):
        t = tok[i]
        if t in ("-C", "-c", "--git-dir", "--work-tree", "--namespace"): i += 2; continue
        if t.startswith("-"): i += 1; continue
        return t, tok[i + 1:]
    return "", []

def check_git(tok, branch=current_branch):
    sub, args = git_args(tok)
    if sub == "push":
        flags = [a for a in args if a.startswith("-") and a != "-"]
        pos = [a for a in args if not a.startswith("-") or a == "-"]
        if any(f in ("-f", "--mirror", "--all", "--prune") or f.startswith("--force") or re.fullmatch(r"-[a-zA-Z]*f[a-zA-Z]*", f) for f in flags):
            return "forced or mass push"
        refs = pos[1:]
        if any(f in ("-d", "--delete") for f in flags) and any(strip_ref(p) in PROTECTED for p in refs): return "deleting main"
        for r in refs:
            if r.startswith("+"): return "forced push (+refspec)"
            if is_protected_dst(r): return "push to the protected branch"
        if (not refs or "HEAD" in refs) and branch() in PROTECTED: return "push of the protected branch"
    elif sub == "branch" and any(a in ("-D", "-d", "--delete") for a in args) and any(strip_ref(a) in PROTECTED for a in args):
        return "deleting main"
    elif sub == "clean" and any(re.fullmatch(r"-[a-zA-Z]*x[a-zA-Z]*", a) for a in args):
        return "git clean -x (deletes ignored files such as .env)"
    return ""

def check_gh(tok):
    pos, i = [], 1
    while i < len(tok):
        if tok[i] in ("-R", "--repo", "--hostname"): i += 2; continue
        if not tok[i].startswith("-"): pos.append(tok[i])
        i += 1
    if pos[:2] == ["pr", "merge"]: return "gh pr merge"
    if pos[:1] == ["api"] and any(MERGE_API.search(t) for t in tok[2:]): return "merge via the API"
    return ""

def check(cmd, branch=current_branch):
    for tok in segments(cmd):
        while tok and (re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", tok[0]) or tok[0] in ("env", "sudo", "command", "exec", "nohup", "time")): tok = tok[1:]
        if not tok: continue
        exe = re.sub(r"\.exe$", "", tok[0].replace("\\", "/").rsplit("/", 1)[-1]).lower()
        r = ""
        if exe == "git": r = check_git(tok[1:], branch)
        elif exe == "gh": r = check_gh(tok)
        elif exe in ("bash", "sh", "pwsh", "powershell") and len(tok) > 2: r = check(" ".join(tok[2:]), branch)
        elif exe in ("curl", "wget", "python", "python3", "node"):
            line = " ".join(tok)
            if MERGE_API.search(line) and re.search(r"api\.github\.com|graphql", line): r = "merge via the API"
        if r: return r
    return ""

def main():
    try: d = json.load(sys.stdin)
    except ValueError: return 0
    cmd = (d.get("tool_input") or {}).get("command") or ""
    why = check(cmd)
    if why:
        print(f"BLOCKED by the guard (#800): {why}. Ask the orchestrator/owner instead (FLOW.md: never merge, never force, never push to main).", file=sys.stderr)
        return 2
    return 0

if __name__ == "__main__": sys.exit(main())
