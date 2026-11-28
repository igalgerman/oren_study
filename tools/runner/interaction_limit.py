"""#829: the repo interaction limit (collaborators only) ends after at most 6 months; the owner must renew it.
Deterministic (no AI): for each public repo read `gh api repos/<repo>/interaction-limits` -> expires_at. One alarm (watchdog tell + Telegram)
14 days before the expiry, repeated once a day until renewed; a limit already gone (empty answer) is an immediate alarm.
State: .runs/interaction_limit.json {sent: {repo: last alarm}}. Never renews anything itself."""
import json, os, time, tomllib
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNS = Path(os.environ.get("RUNNER_RUNS") or HERE / ".runs")
try: _C = tomllib.loads((HERE / "config.toml").read_text(encoding="utf-8"))
except Exception: _C = {}
REPOS = list(_C.get("interaction_limit_repos", ["igalgerman/oren_study"]))   # add the GAME repo here once it exists
WARN_DAYS, EVERY_H, STATE = 14, 24, "interaction_limit.json"

def command(repo):
    return f"gh api -X PUT repos/{repo}/interaction-limits -f limit=collaborators_only -f expiry=six_months"

def expiry(answer):
    """Pure: the gh answer -> epoch of expires_at, or 0 when the limit is gone (empty answer / no expires_at); None = unreadable."""
    try: d = json.loads(answer)
    except Exception: return None
    if not isinstance(d, dict): return None
    e = d.get("expires_at")
    if not e: return 0
    try: return time.mktime(time.strptime(e[:19], "%Y-%m-%dT%H:%M:%S")) - time.timezone
    except ValueError: return None

def alarm(repo, exp, now):
    """Pure: the alarm text, or '' when quiet."""
    cmd = f"Owner: run once in a terminal: {command(repo)} , then write in the chat \"חודש\" (renews for 6 months)."
    if exp == 0: return f"The interaction limit (collaborators only) of {repo} is gone. {cmd}"
    if exp - now > WARN_DAYS * 86400: return ""
    date = time.strftime("%Y-%m-%d", time.gmtime(exp))
    return f"The interaction limit (collaborators only) of {repo} expires on {date}. {cmd}"

def _fetch(repo):
    import runner as R
    rc, out = R.run(["gh", "api", f"repos/{repo}/interaction-limits"], timeout=60)
    return out if rc == 0 else None

def tick(tell=print, log=print, now=None, send=None, fetch=None, repos=None):
    now = now or time.time()
    try: d = json.loads((RUNS / STATE).read_text(encoding="utf-8"))
    except Exception: d = {}
    sent, texts = dict(d.get("sent", {})), []
    for repo in repos or REPOS:
        ans = (fetch or _fetch)(repo)
        e = expiry(ans) if ans is not None else None
        if e is None: log(f"interaction limit of {repo} unreadable"); continue
        text = alarm(repo, e, now)
        if not text: sent.pop(repo, None); continue            # fine or renewed: cleared
        if now - sent.get(repo, 0) < EVERY_H * 3600 - 300: continue
        sent[repo] = now; texts.append("ALARM (interaction limit): " + text)
    try:
        RUNS.mkdir(exist_ok=True)
        (RUNS / STATE).write_text(json.dumps({"sent": sent, "at": now}), encoding="utf-8")
    except OSError as e: log(f"interaction limit state not saved: {e!r}")
    for x in texts:
        tell(x)
        try: (send or __import__("telegram").send)(x)
        except Exception: pass
    return texts
