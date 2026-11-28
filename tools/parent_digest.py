#!/usr/bin/env python3
"""#684 daily message to the parent's phone: three short Hebrew lines after a play day.

  python3 tools/parent_digest.py day 2026-11-27     # send the day's message (once; nothing on a day without play)
  python3 tools/parent_digest.py test                # send one test message first, to prove the channel arrives

Channel: the owner's Telegram chat (tools/runner/telegram.py, #440; token + chat id only in ~/.oren/telegram.env).
Built from the play log by fixed rules (no paid API, no model). The log is read with tools/playlog.py (own site API).
Only the three lines go to Telegram: counts and mission ids, no raw events, no kid answers, no names. Sent once per day
(marker ~/.oren/digest/<day>.sent). Hebrew for the parent, so no nikud.
"""
# Play data never goes to GitHub (#786): this digest goes to Telegram only, never to an issue, PR or file in the repo.
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "runner"))
import playlog as PL
import telegram as TG

HOME = Path(os.environ.get("OREN_HOME") or Path.home() / ".oren")


def digest(ev):
    """Pure: events of one day -> three Hebrew lines, or None when there was no play (no mission started, no question)."""
    if not any(e.get("k") in ("mis", "mdone", "q") for e in ev): return None
    stats = {}                                           # mission -> [done, skip, left, tapped]
    for e in ev:
        k = {"mdone": 0, "mskip": 1, "mleft": 2, "mis": 3}.get(e.get("k"))
        if k is not None: stats.setdefault(e.get("m", "?"), [0, 0, 0, 0])[k] += 1
    right = sum(1 for e in ev if e.get("k") == "ans" and e.get("ok"))
    wrong = sum(1 for e in ev if e.get("k") == "ans" and not e.get("ok"))
    # loved: finished most often, ties by starts; stuck: skipped/left most often, then wrong answers
    loved = max(((m, s) for m, s in stats.items() if s[0]), key=lambda x: (x[1][0], x[1][3], x[0]), default=None)
    stuck = max(((m, s) for m, s in stats.items() if s[1] + s[2]), key=lambda x: (x[1][1] + x[1][2], x[0]), default=None)
    l1 = f"אהב היום: {loved[0]} (הושלם {loved[1][0]} פעמים)" if loved else f"היום שיחק {len(stats)} משימות"
    if stuck: l2 = f"נתקע ב: {stuck[0]} (דילג או עזב {stuck[1][1] + stuck[1][2]} פעמים)"
    elif wrong: l2 = f"נתקע בשאלות: {wrong} תשובות שגויות מתוך {right + wrong}"
    else: l2 = "לא נתקע היום"
    pick = (loved or stuck or (next(iter(stats), "?"), None))[0]
    l3 = f"שאלה לשאול אותו: ספר לי איך שיחקת ב{pick}?" if not stuck else f"שאלה לשאול אותו: מה היה קשה ב{stuck[0]}?"
    return [l1, l2, l3]


def marker(day): return HOME / "digest" / f"{day}.sent"


def run(day, get=None, send=TG.send):
    """-> 'sent' | 'no-play' | 'already' | 'failed'. The marker is written only after Telegram accepted the message."""
    if marker(day).exists(): return "already"
    frm, to = PL.day_range(day)
    if get is None:
        key = PL.read_token()
        if not key: return "failed"
        get = PL.http_get(key)
    try: ev = PL.fetch_all(get, frm, to)
    except (OSError, ValueError, RuntimeError): return "failed"
    lines = digest(ev)
    if lines is None: return "no-play"
    if not send("\n".join(lines)): return "failed"
    marker(day).parent.mkdir(parents=True, exist_ok=True); marker(day).write_text("1")
    return "sent"


def main(argv):
    if argv == ["test"]:
        ok = TG.send("בדיקה: ההודעה היומית על אורן תגיע לכאן")
        print("test message sent" if ok else "test message NOT sent (is ~/.oren/telegram.env set up?)"); return 0 if ok else 1
    if len(argv) == 2 and argv[0] == "day":
        r = run(argv[1]); print(r); return 0 if r != "failed" else 1
    print("usage: parent_digest.py day YYYY-MM-DD | test"); return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
