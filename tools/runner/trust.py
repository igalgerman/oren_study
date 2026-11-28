"""#800: who may write a control line (RESULT:, VERDICT:, TEST:, QUESTION:, owner-answer records, ANSWERED, Runner: started).
Pure. Trusted = the owner login + the GitHub App bot (config `owner_login`, `bot_logins`). Reads GraphQL `author.login`
or REST `user.login`; a missing author is untrusted. Owner-answer records count only from the App bot (`is_bot`)."""
import tomllib
from pathlib import Path

_CFG = tomllib.loads((Path(__file__).resolve().parent / "config.toml").read_text(encoding="utf-8"))
OWNER = _CFG.get("owner_login", "igalgerman")
BOTS = tuple(_CFG.get("bot_logins", ["oren-study-bot", "oren-study-bot[bot]"]))
SINCE = str(_CFG.get("trust_since", "2026-11-28T12:28:45Z"))   # before this the owner login also wrote ANSWERED lines / answer records

def login(c):
    """The author login of a comment/issue/PR dict ('' when missing)."""
    if not isinstance(c, dict): return ""
    for k in ("author", "user"):
        a = c.get(k)
        if isinstance(a, dict) and a.get("login"): return str(a["login"])
    return ""

def is_bot(c): return login(c) in BOTS
def ok(c): return login(c) == OWNER or is_bot(c)
def old_owner(c):
    """Grandfather: a comment by the owner login created strictly before `trust_since` (ISO UTC; no createdAt = not old)."""
    return login(c) == OWNER and isinstance(c, dict) and bool(c.get("createdAt")) and str(c["createdAt"]) < SINCE
def answer_ok(c):
    """Who may write an ANSWERED line / owner-answer record: the App bot, or the owner login before `trust_since`."""
    return is_bot(c) or old_owner(c)
def only(items): return [c for c in items or [] if ok(c)]
def bots(items): return [c for c in items or [] if is_bot(c)]
def hidden(items): return len(items or []) - len(only(items))
