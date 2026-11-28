"""#641 tools/playlog.py: paging, the day file, the summary. Run: python3 tools/ci/test_playlog.py"""
import io, json, os, sys, tempfile, contextlib
from pathlib import Path
HOME = tempfile.mkdtemp(prefix="oren-home-"); os.environ["OREN_HOME"] = HOME
os.environ["OREN_ENV"] = os.path.join(HOME, "no.env")   # #675: off unless a test writes it
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import playlog as P

fails = []
def ok(name, cond, info=""):
    print(("PASS " if cond else "FAIL ") + name + (f" — {info}" if info and not cond else ""))
    if not cond: fails.append(name)

frm, to = P.day_range("2026-11-27")
ok("day_range: one local day", (to - frm) // 3600000 in (23, 24, 25), str(to - frm))

T = frm + 3600000
EV = [{"sid": "s1", "i": 1, "t": T, "k": "ss", "dev": "tablet", "os": "Android", "br": "Chrome 130", "scw": 800, "sch": 1280, "vw": 800, "vh": 1200},
      {"sid": "s1", "i": 2, "t": T + 1000, "k": "mis", "m": "add-0", "tg": "#go", "via": "sMap"},
      {"sid": "s1", "i": 3, "t": T + 2000, "k": "q", "q": "x1"},
      {"sid": "s1", "i": 4, "t": T + 3000, "k": "au", "ev": "fail", "src": "google", "why": "no-audio", "sn": "abc"},
      {"sid": "s1", "i": 5, "t": T + 3100, "k": "au", "ev": "missing", "src": "google", "why": "no-audio", "sn": "abc"},
      {"sid": "s1", "i": 6, "t": T + 7000, "k": "au", "ev": "play", "src": "google"}]
EV += [{"sid": "s1", "i": 7, "t": T + 8000, "k": "ans", "q": "x1", "ok": 1},
       {"sid": "s1", "i": 8, "t": T + 9000, "k": "q", "q": "x1"},
       {"sid": "s1", "i": 9, "t": T + 61000, "k": "mis", "m": "add-0", "auto": 1},
       {"sid": "s1", "i": 10, "t": T + 91000, "k": "tap"}]

# a fake /api/log/raw: pages of 3, oldest first, cursor = index of the last event sent
calls = []
def fake(q, page=3):
    calls.append(dict(q)); start = int(q.get("after") or 0)
    sel = [e for e in EV if q["from"] <= e["t"] < q["to"]]
    part = sel[start:start + page]
    return {"ev": part, "next": str(start + page) if start + page < len(sel) else None}

got = P.fetch_all(fake, frm, to)
ok("paging: every event once, in order, page after page", [e["i"] for e in got] == list(range(1, 11)) and len(calls) == 4, str([e["i"] for e in got]))
ok("paging: each call asks for this day only, the next page with after=", all(c["from"] == frm and c["to"] == to for c in calls) and calls[1].get("after") == "3" and "after" not in calls[0])

L = P.summary(got); txt = "\n".join(L)
ok("summary: events and sessions", L[0] == "10 events, 1 sessions", L[0])
ok("summary: the device of the session (os, browser, screen)", "Android Chrome 130 screen 800x1280" in txt, txt)
ok("summary: missions in order with time on screen and why", "mission add-0 60 s (tap #go on sMap)" in txt and "mission add-0 30 s (auto)" in txt, txt)
ok("summary: questions right/wrong", "questions 2, right 1, wrong 0" in txt, txt)
ok("summary: a silent voice wait from the first fail to the next play", "silent voice waits 1" in txt and "sentence abc: 4.0 s until the next voice" in txt, txt)
ok("summary: repeats of a mission and a question", "repeats: add-0 x2, question x1 x2" in txt, txt)

# #730 mission ends: done/skip/left per mission
E2 = EV + [{"sid": "s1", "i": 11, "t": T + 95000, "k": "mdone", "m": "add-0", "sec": 40},
           {"sid": "s1", "i": 12, "t": T + 96000, "k": "mskip", "m": "add-1", "sec": 5},
           {"sid": "s1", "i": 13, "t": T + 97000, "k": "mleft", "m": "add-1", "sec": 3}]
t2 = "\n".join(P.summary(E2))
ok("#730 summary: done/skip/left per mission", "add-0: done 1, skip 0, left 0" in t2 and "add-1: done 0, skip 1, left 1" in t2, t2)
ok("#730 summary: no end events = no ends block", "mission ends" not in txt)

# main: writes ~/.oren/playlog/<day>.json (outside the repo), prints the summary, never the key
out = io.StringIO()
with contextlib.redirect_stdout(out): rc = P.main(["day", "2026-11-27"], get=fake)
f = Path(HOME) / "playlog" / "2026-11-27.json"
ok("main: the day file has every event", rc == 0 and f.is_file() and len(json.loads(f.read_text())) == 10, out.getvalue())
ok("main: says how many were saved", "saved 10 events to" in out.getvalue())
out = io.StringIO()
with contextlib.redirect_stdout(out): rc = P.main(["day", "2026-11-27"])
ok("main: no key file = a clear message, rc 2", rc == 2 and "diag.key" in out.getvalue(), out.getvalue())
(Path(HOME) / "diag.key").write_text("sekret-641\n")
seen = {}
P.http_get = lambda key: (seen.setdefault("key", key), fake)[1]
out = io.StringIO()
with contextlib.redirect_stdout(out): rc = P.main(["day", "2026-11-27"])
ok("main: the key comes from ~/.oren/diag.key and is never printed", rc == 0 and seen.get("key") == "sekret-641" and "sekret" not in out.getvalue())
ok("main: bad day = rc 2", P.main(["day", "27-11"]) == 2)
# #675 the automated read token: LOG_READ_KEY from the local .env (never committed, never printed) wins over the parent key
Path(os.environ["OREN_ENV"]).write_text('# local secrets\nTELEGRAM_X=1\nLOG_READ_KEY="rd-675-secret"\n', encoding="utf-8")
seen.clear(); out = io.StringIO()
with contextlib.redirect_stdout(out): rc = P.main(["day", "2026-11-27"])
ok("#675 main: the read token from .env is sent, not the parent key, and never printed", rc == 0 and seen.get("key") == "rd-675-secret" and "rd-675" not in out.getvalue(), str(seen))
Path(os.environ["OREN_ENV"]).write_text("LOG_READ_KEY=\n", encoding="utf-8"); seen.clear()
with contextlib.redirect_stdout(io.StringIO()): rc = P.main(["day", "2026-11-27"])
ok("#675 main: an empty LOG_READ_KEY falls back to ~/.oren/diag.key", rc == 0 and seen.get("key") == "sekret-641", str(seen))

# #715 cloud sessions: LOG_READ_KEY from the environment wins, is never printed; none anywhere = one clear line, no request
os.environ["LOG_READ_KEY"] = "env-715-secret"; seen.clear(); out = io.StringIO()
with contextlib.redirect_stdout(out): rc = P.main(["day", "2026-11-27"])
ok("#715 main: LOG_READ_KEY from the environment is sent first and never printed", rc == 0 and seen.get("key") == "env-715-secret" and "env-715" not in out.getvalue(), str(seen))
del os.environ["LOG_READ_KEY"]; (Path(HOME) / "diag.key").unlink(); seen.clear(); out = io.StringIO()
with contextlib.redirect_stdout(out): rc = P.main(["day", "2026-11-27"])
ok("#715 main: no key at all in the cloud = ONE line 'LOG_READ_KEY missing in the cloud environment', rc 2, no request",
   rc == 2 and out.getvalue().startswith("LOG_READ_KEY missing in the cloud environment") and len(out.getvalue().strip().splitlines()) == 1 and not seen, out.getvalue())

print("RESULT playlog " + (f"{len(fails)} FAILED" if fails else "ok"))
sys.exit(1 if fails else 0)
