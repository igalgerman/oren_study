#!/usr/bin/env python3
"""#814: game_settings.py --check | --apply: GAME repo settings against what the game needs and against INFRA.
Checked (booleans and enum words only, a secret value is never read or printed): required check `tests`, no force push, no deletion,
the rule holds for admins, auto-merge + squash allowed, head branches deleted after merge, Issues off, interaction limit,
fork PR workflows need approval. `--check` prints OK/DIFF per line and exits 1 on any difference (or unreadable answer).
`--apply` is run by the OWNER (GitHub settings are his): it asks to type the GAME repo name and nothing starts by itself."""
import argparse, json, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))

GAME, INFRA = "igalgerman/learn-quest", "igalgerman/oren_study"

def gh_api(path):
    r = subprocess.run(["gh", "api", path], capture_output=True, text=True)
    return r.returncode, r.stdout
RUN = gh_api          # tests swap in fake gh answers: RUN(api path) -> (rc, json text)

def _j(rc_out):
    rc, out = rc_out
    if rc: return None
    try: return json.loads(out or "null")
    except ValueError: return None

def _en(d, k):
    v = (d or {}).get(k)
    return v.get("enabled") if isinstance(v, dict) else None

# name -> (api path suffix, extractor(json) -> value, wanted value)
ITEMS = [
    ("required check tests",        "branches/main/protection", lambda d: "tests" in ((d.get("required_status_checks") or {}).get("contexts") or [])
                                                                       or "tests" in [c.get("context") for c in ((d.get("required_status_checks") or {}).get("checks") or [])], True),
    ("no force push",               "branches/main/protection", lambda d: _en(d, "allow_force_pushes") is False, True),
    ("no deletion",                 "branches/main/protection", lambda d: _en(d, "allow_deletions") is False, True),
    ("rule holds for admins",       "branches/main/protection", lambda d: _en(d, "enforce_admins") is True, True),
    ("auto-merge allowed",          "",                          lambda d: d.get("allow_auto_merge"), True),
    ("squash merge allowed",        "",                          lambda d: d.get("allow_squash_merge"), True),
    ("head branches deleted",       "",                          lambda d: d.get("delete_branch_on_merge"), True),
    ("issues off",                  "",                          lambda d: d.get("has_issues") is False, True),
    ("interaction limit",           "interaction-limits",        lambda d: (d or {}).get("limit") or "none", "collaborators_only"),
    ("fork PR workflows approval",  "actions/permissions/fork-pr-contributor-approval", lambda d: (d or {}).get("approval_policy") or "none", "all_external_contributors"),
]

def read(repo):
    """{name: value or None(unreadable)} for one repo."""
    cache, out = {}, {}
    for name, path, fn, _ in ITEMS:
        if path not in cache: cache[path] = _j(RUN(f"repos/{repo}" + (f"/{path}" if path else "")))
        d = cache[path]
        if d is None and path == "interaction-limits": d = {}      # an empty answer means no limit set
        try: out[name] = None if d is None else fn(d)
        except Exception: out[name] = None
    return out

def compare(game, infra):
    """-> (lines, number of differences). Values are booleans / enum words only."""
    lines, bad = [], 0
    for name, _, _, want in ITEMS:
        g, i = game.get(name), infra.get(name)
        if g is None: st, bad = "UNREADABLE", bad + 1
        elif g != want: st, bad = "DIFF", bad + 1
        else: st = "OK"
        lines.append(f"{st:10} {name}: game={_s(g)} infra={_s(i)} want={_s(want)}")
    return lines, bad

def _s(v): return "unreadable" if v is None else str(v)

def apply_commands(repo):
    """The gh commands that make GAME match; one list of argv (the protection body goes through stdin: (argv, body))."""
    prot = {"required_status_checks": {"strict": False, "contexts": ["tests"]}, "enforce_admins": True,
            "required_pull_request_reviews": None, "restrictions": None, "allow_force_pushes": False, "allow_deletions": False}
    return [
        (["gh", "api", "-X", "PATCH", f"repos/{repo}", "-F", "has_issues=false", "-F", "allow_auto_merge=true", "-F", "allow_squash_merge=true",
          "-F", "delete_branch_on_merge=true"], None),
        (["gh", "api", "-X", "PUT", f"repos/{repo}/branches/main/protection", "--input", "-"], json.dumps(prot)),
        (["gh", "api", "-X", "PUT", f"repos/{repo}/interaction-limits", "-f", "limit=collaborators_only", "-f", "expiry=six_months"], None),
        (["gh", "api", "-X", "PUT", f"repos/{repo}/actions/permissions/fork-pr-contributor-approval", "-f", "approval_policy=all_external_contributors"], None),
    ]

def run_cmd(cmd, body=None):
    r = subprocess.run(cmd, capture_output=True, text=True, input=body)
    return r.returncode, (r.stdout or r.stderr)
EXEC = run_cmd        # tests swap in a recorder

def check(game=GAME, infra=INFRA, out=print):
    lines, bad = compare(read(game), read(infra))
    for l in lines: out(l)
    out(f"{bad} difference(s)" if bad else "GAME settings equal what the game needs")
    return 1 if bad else 0

def apply(game=GAME, ask=input, out=print):
    out("The owner applies these GitHub settings to " + game + ":")
    cmds = apply_commands(game)
    for c, _ in cmds: out("  " + " ".join(c))
    if (ask(f"Type the repo name ({game}) to apply: ") or "").strip() != game:
        out("not confirmed, nothing changed"); return 2
    fails = 0
    for c, body in cmds:
        rc, o = EXEC(c, body)
        if rc: fails += 1; out(f"FAILED rc {rc}: {c[3] if len(c) > 3 else c[0]} (no output shown)")
    out(f"applied with {fails} failure(s); run --check to verify")
    return 1 if fails else 0

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true"); g.add_argument("--apply", action="store_true")
    ap.add_argument("--game-repo", default=GAME); ap.add_argument("--infra-repo", default=INFRA)
    a = ap.parse_args(argv)
    return check(a.game_repo, a.infra_repo) if a.check else apply(a.game_repo)

if __name__ == "__main__":
    sys.exit(main())
