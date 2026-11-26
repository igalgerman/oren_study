"""#440 Telegram: the second channel for owner questions (qwin.py). Bot token and chat id come from a local untracked file
(~/.oren/telegram.env: TELEGRAM_BOT_TOKEN=..., TELEGRAM_CHAT_ID=...); they are read only here, never logged, printed or
committed. No webhook, nothing public: qwin polls getUpdates from the watchdog tick, the offset is kept in .runs."""
import json, os, urllib.request
from pathlib import Path

ENV = Path(os.environ.get("OREN_TELEGRAM_ENV") or Path.home() / ".oren" / "telegram.env")
API = os.environ.get("TELEGRAM_API") or "https://api.telegram.org"     # the tests point this at a fake Telegram API

def config():
    """-> (token, chat_id) or None (not set up: the channel is off)."""
    try: lines = ENV.read_text(encoding="utf-8-sig").splitlines()
    except Exception: return None
    kv = {}
    for l in lines:
        k, sep, v = l.partition("=")
        if sep: kv[k.strip()] = v.strip().strip('"').strip("'")
    tok, chat = kv.get("TELEGRAM_BOT_TOKEN", ""), kv.get("TELEGRAM_CHAT_ID", "")
    return (tok, chat) if tok and chat else None

def call(method, params, timeout=20):
    """-> the API's 'result', or None on any failure (the reason never carries the token)."""
    c = config()
    if not c: return None
    req = urllib.request.Request(f"{API}/bot{c[0]}/{method}", data=json.dumps(params, ensure_ascii=False).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: d = json.loads(r.read().decode("utf-8"))
    except Exception: return None
    return d.get("result") if d.get("ok") else None

def send(text, reply_to=0):
    """-> the message_id, or 0 when not sent."""
    c = config()
    if not c: return 0
    p = {"chat_id": c[1], "text": text}
    if reply_to: p["reply_to_message_id"], p["allow_sending_without_reply"] = reply_to, True
    r = call("sendMessage", p)
    return (r or {}).get("message_id", 0) if isinstance(r, dict) else 0

def messages(offset):
    """-> (new offset, [text messages from the owner's chat only]). Each: {id, text, date, reply_to}."""
    c = config()
    if not c: return offset, []
    ups = call("getUpdates", {"offset": offset, "timeout": 0, "allowed_updates": ["message"]})
    if not isinstance(ups, list): return offset, []
    out = []
    for u in ups:
        offset = max(offset, u.get("update_id", 0) + 1)
        m = u.get("message") or {}
        if str((m.get("chat") or {}).get("id", "")) != str(c[1]) or not m.get("text"): continue   # only the owner's chat
        out.append({"id": m.get("message_id", 0), "text": m["text"].strip(), "date": m.get("date", 0),
                    "reply_to": (m.get("reply_to_message") or {}).get("message_id", 0)})
    return offset, out
