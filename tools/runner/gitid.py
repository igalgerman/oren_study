"""Git identity (#889): GitHub's e-mail privacy push-block is ON, so every session commits with the noreply address
(`git_email` in config.toml), never the personal one. Pure helpers + the once-per-hour alarm for a rejected push."""
import json, time, tomllib
from pathlib import Path

HERE = Path(__file__).resolve().parent
ALARM_EVERY_S = 3600

def email():
    return tomllib.loads((HERE / "config.toml").read_text(encoding="utf-8"))["git_email"]

def set_command(addr=None):
    return ["git", "config", "user.email", addr or email()]

def set_email(repo, run, addr=None):
    """Repo-local user.email of a checkout or worktree (worktrees share the main one). run(cmd, cwd=) -> (rc, out)."""
    return run(set_command(addr), cwd=str(repo))[0]

def prompt_prefix(addr=None):
    """First words of every cloud session prompt."""
    return f"First run `git config user.email {addr or email()}` (GitHub blocks pushes that expose another address). "

def privacy_reject(out):
    t = (out or "").lower()
    return "gh007" in t or "email privacy" in t or "e-mail privacy" in t

REASON = "git push declined by GitHub e-mail privacy (GH007): commits carry a personal address; use `git config user.email` = git_email (config.toml), then amend the unpushed commits"

def alarm(out, runs, tell, now=None, n=None):
    """A push output that mentions e-mail privacy -> REASON ('' otherwise) and, at most once per hour, tell() to orchestrator + inspector."""
    if not privacy_reject(out): return ""
    now = time.time() if now is None else now
    f = Path(runs) / "gitid_alarm.json"
    try: last = json.loads(f.read_text(encoding="utf-8")).get("at", 0)
    except (OSError, ValueError): last = 0
    if now - last >= ALARM_EVERY_S:
        try: Path(runs).mkdir(parents=True, exist_ok=True); f.write_text(json.dumps({"at": now}), encoding="utf-8")
        except OSError: pass
        tell(f"GH007 push declined (e-mail privacy)" + (f" on #{n}" if n else "") + ": a session committed with a personal address. " + REASON)
    return REASON
