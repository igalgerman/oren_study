# #814: python tools/split/test_game_settings.py  (fake gh answers; no network)
import io, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import game_settings as S

SECRET = "ghp_SECRET_VALUE_123"
def answers(prot=True, issues=False, limit="collaborators_only", fork="all_external_contributors", auto=True, squash=True, delb=True,
            force=False, delete=False, admins=True, readable=True):
    def fake(path):
        if not readable: return 1, "HTTP 404"
        if path.endswith("/branches/main/protection"):
            if not prot: return 1, "HTTP 404 Branch not protected"
            return 0, json.dumps({"required_status_checks": {"contexts": ["tests"], "token": SECRET}, "enforce_admins": {"enabled": admins},
                                  "allow_force_pushes": {"enabled": force}, "allow_deletions": {"enabled": delete}})
        if path.endswith("/interaction-limits"): return 0, json.dumps({"limit": limit, "expires_at": "x"} if limit else {})
        if path.endswith("/fork-pr-contributor-approval"): return 0, json.dumps({"approval_policy": fork})
        return 0, json.dumps({"allow_auto_merge": auto, "allow_squash_merge": squash, "delete_branch_on_merge": delb, "has_issues": issues, "secret": SECRET})
    return fake

def run_check(game_fake, infra_fake):
    def fake(path): return (game_fake if "learn-quest" in path else infra_fake)(path)
    S.RUN = fake; buf = []
    rc = S.check("o/learn-quest", "o/oren_study", out=buf.append)
    return rc, "\n".join(buf)

# everything right: OK, exit 0, no secret value printed
rc, out = run_check(answers(), answers(issues=True))
assert rc == 0 and "DIFF" not in out and "UNREADABLE" not in out and SECRET not in out, out
assert out.count("OK") == 10 and "issues off: game=True infra=False want=True" in out

# every setting wrong or missing is reported, each on its own line
rc, out = run_check(answers(prot=False, issues=True, limit=None, fork="none", auto=False, squash=False, delb=False), answers())
assert rc == 1 and SECRET not in out
for name in ("required check tests", "no force push", "no deletion", "rule holds for admins", "auto-merge allowed", "squash merge allowed",
             "head branches deleted", "issues off", "interaction limit", "fork PR workflows approval"):
    assert any(l.startswith("UNREADABLE") or l.startswith("DIFF") for l in out.splitlines() if f" {name}:" in l), name
rc, out = run_check(answers(force=True, delete=True, admins=False), answers())
assert rc == 1 and out.count("DIFF") == 3 and "no force push: game=False" in out and "rule holds for admins: game=False" in out
rc, out = run_check(answers(readable=False), answers()); assert rc == 1 and out.count("UNREADABLE") == 9 and "DIFF       interaction limit" in out   # no answer for the limit = no limit set
print("ok check")

# apply: needs the typed repo name; the tool never runs it by itself
ran = []; S.EXEC = lambda c, body=None: (ran.append((c, body)), (0, ""))[1]
lines = []
assert S.apply("o/learn-quest", ask=lambda p: "yes", out=lines.append) == 2 and not ran            # wrong confirmation: nothing changes
assert S.apply("o/learn-quest", ask=lambda p: "o/learn-quest", out=lines.append) == 0 and len(ran) == 4
joined = " ".join(" ".join(c) for c, _ in ran) + " ".join(b or "" for _, b in ran)
assert "has_issues=false" in joined and "allow_auto_merge=true" in joined and "delete_branch_on_merge=true" in joined and "collaborators_only" in joined
body = json.loads([b for _, b in ran if b][0]); assert body["enforce_admins"] is True and body["allow_force_pushes"] is False and body["required_status_checks"]["contexts"] == ["tests"]
assert all("o/learn-quest" in " ".join(c) for c, _ in ran) and not any("oren_study" in " ".join(c) for c, _ in ran)   # only ever GAME
S.EXEC = lambda c, body=None: (1, "boom SECRET")
lines = []; assert S.apply("o/learn-quest", ask=lambda p: "o/learn-quest", out=lines.append) == 1 and "SECRET" not in "\n".join(lines)
print("test_game_settings ok")
