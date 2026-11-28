# Unit test for scrub.py (#783: one central scrub of the kid's real name in every GitHub write): python tools/runner/test_scrub.py
# The names below are invented for this test; the real name is never in the repo.
import os, tempfile; os.environ["OREN_TEST"] = "1"; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: never the live .runs
import json, stat, sys, time
from pathlib import Path
T = Path(tempfile.mkdtemp(prefix="scrub-test-"))
os.environ["OREN_HOME"] = str(T / "home"); os.environ.pop("PRIVATE_NAMES", None); os.environ.pop("PRIVATE_NAMES_FILE", None)
import scrub as S
sys.argv.append("--dry-run")
import runner as R

LAT, HEB = "Zorvak", "זורבק"
NS = [LAT, HEB]

# ---------- 1: replacement ----------
assert S.scrub(f"{LAT} finished the quest", NS) == "the kid finished the quest"
assert S.scrub(f"{LAT.lower()} and {LAT.upper()}", NS) == "the kid and the kid", "case-insensitive"
assert S.scrub(f"{LAT}'s game, {LAT}\u2019s turn", NS) == "the kid's game, the kid's turn"
assert S.scrub(f"המשחק של {HEB} מוכן", NS) == "המשחק של הילד מוכן"
assert S.scrub(f"{HEB} שיחק", NS) == "הילד שיחק"
assert S.scrub(f"נתנו ל{HEB} משימה", NS) == "נתנו לילד משימה", "ל prefix"
assert S.scrub(f"של{HEB} ו{HEB} ב{HEB}", NS) == "של הילד והילד בילד", "של / ו / ב prefixes"
assert S.scrub(f"{HEB}, {LAT}: ok ({LAT}).", NS) == "הילד, the kid: ok (the kid)."
mixed = f"Issue: {LAT} asked; {HEB} שאל. ל{HEB} ו {LAT}."
assert S.scrub(mixed, NS) == "Issue: the kid asked; הילד שאל. לילד ו the kid.", S.scrub(mixed, NS)
clean = "Fix the back button on the map screen (P1) לילד אין בעיה"
assert S.scrub(clean, NS) == clean and S.scrub("", NS) == "" and S.scrub(None, NS) is None
assert S.scrub(f"{LAT} x", []) == f"{LAT} x", "no names: nothing changes"
R_SECRET = "tok-123456789"; R.SECRETS.append(R_SECRET)
assert R.redact(f"key {R_SECRET} for {LAT}") == f"key *** for {LAT}", "redact still hides secrets (the scrub is separate)"
assert S.scrub(R.redact(f"key {R_SECRET} for {LAT}"), NS) == "key *** for the kid"
print("ok replacement")

# ---------- 2: protected tokens ----------
for t in (f"igalgerman/{LAT.lower()}-game", f"https://example.com/{LAT.lower()}/page", f"https://{LAT.lower()}.example.com/x", f"see tools/{LAT.lower()}/notes.md",
          f"~/.{LAT.lower()}/playlog/day.json", f"C:\\Users\\{LAT}\\x.txt", f"branch lane/{LAT.lower()}-fix", f"label {LAT.lower()}_pack", f"{LAT}Land", f"x{LAT}",
          f"{LAT.lower()}.md", f"/home/user/{HEB}/x", f"@{LAT.lower()}"):
    assert S.scrub(t, NS) == t, f"protected: {t!r} -> {S.scrub(t, NS)!r}"
assert S.scrub(f"{LAT} in oren/{LAT}-x.", NS) == f"the kid in oren/{LAT}-x.", "a protected token does not stop a real match next to it"
print("ok protected tokens")

# ---------- 5 (part): names loading, status ----------
assert S.names() == [] and "ALARM" in S.status_line() and "no names file" in S.status_line()
(T / "home").mkdir(); (T / "home" / "private_names.txt").write_text(f"{LAT}\n\n{HEB}\n", encoding="utf-8")
assert S.names() == NS and S.status_line() == "privacy scrub: on (2 names)", S.status_line()
assert LAT not in S.status_line() and HEB not in S.status_line()
os.environ["PRIVATE_NAMES_FILE"] = str(T / "other.txt"); os.environ["PRIVATE_NAMES"] = "Qux, זוזו"
assert S.names() == ["Qux", "זוזו"], "env file override + env list"
os.environ.pop("PRIVATE_NAMES_FILE"); os.environ.pop("PRIVATE_NAMES")
print("ok names + status line")

# ---------- 3: R.run with a fake gh ----------
bin_ = T / "bin"; bin_.mkdir()
rec = T / "calls.jsonl"
fake = bin_ / "gh"
fake.write_text(f"#!{sys.executable}\nimport json, sys\nstdin = sys.stdin.read() if '-' in sys.argv[1:] else ''\n"
                f"open({str(rec)!r}, 'a', encoding='utf-8').write(json.dumps({{'argv': sys.argv[1:], 'stdin': stdin}}, ensure_ascii=False) + '\\n')\nprint('ok')\n")
fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
os.environ["PATH"] = str(bin_) + os.pathsep + os.environ["PATH"]
R.CFG["extra_path"] = str(bin_)
def last():
    return json.loads(rec.read_text(encoding="utf-8").splitlines()[-1])

body = f"{LAT} and ל{HEB} played https://x.org/{LAT.lower()}"
rc, _ = R.gh("issue", "create", "--title", f"{LAT}'s map", "--body", body)
c = last(); a = c["argv"]
assert rc == 0 and a[a.index("--title") + 1] == "the kid's map" and a[a.index("--body") + 1] == f"the kid and לילד played https://x.org/{LAT.lower()}", a
R.gh("issue", "comment", "5", "--body-file", "-", input=f"{HEB} שאל את {LAT}")
c = last(); assert c["stdin"] == "הילד שאל את the kid" and "-" in c["argv"], c
R.gh("pr", "edit", "7", "--title", f"fix for {LAT}")
assert last()["argv"][last()["argv"].index("--title") + 1] == "fix for the kid"
R.gh("pr", "comment", "7", f"--body={LAT} ok")
assert f"--body=the kid ok" in last()["argv"]
bf = T / "b.md"; bf.write_text(f"file text {LAT}", encoding="utf-8")
R.gh("issue", "comment", "5", "--body-file", str(bf))
a = last()["argv"]; assert Path(a[a.index("--body-file") + 1]).read_text(encoding="utf-8") == "file text the kid" and bf.read_text(encoding="utf-8") == f"file text {LAT}"
R.run(["gh", "api", "-X", "POST", "repos/o/r/issues", "-f", f"title=About {LAT}", "-f", f"body={HEB} here", "-f", f"labels[]={LAT.lower()}-x"])
a = last()["argv"]
assert "title=About the kid" in a and "body=הילד here" in a and f"labels[]={LAT.lower()}-x" in a, a
R.run(["gh", "label", "create", "pack", "--description", f"for {LAT}"])
assert "for the kid" in last()["argv"]
n = len(rec.read_text(encoding="utf-8").splitlines())
rc, _ = R.gh("issue", "list", "--search", f"{LAT} in:title", "--json", "number")
c = last(); assert len(rec.read_text(encoding="utf-8").splitlines()) == n + 1 and f"{LAT} in:title" in c["argv"], "a read is not scrubbed"
os.environ["PRIVATE_NAMES"] = ""; (T / "home" / "private_names.txt").unlink()
R.gh("issue", "comment", "9", "--body", f"{LAT} x")
assert f"{LAT} x" in last()["argv"], "no names file: nothing changes, no crash"
(T / "home" / "private_names.txt").write_text(f"{LAT}\n{HEB}\n", encoding="utf-8")
print("ok R.run with a fake gh")

# ---------- 5: no names file: ONE warning per day ----------
(T / "home" / "private_names.txt").unlink()
said = []; t0 = 1_800_000_000
assert S.warn_once(t0, said.append) and not S.warn_once(t0 + 3600, said.append) and said == ["privacy scrub: no names file"]
assert S.warn_once(t0 + 86400 * 2, said.append) and len(said) == 2, "a new day warns again"
assert "no names file" in (Path(os.environ["RUNNER_RUNS"]) / "privacy_scrub.log").read_text(encoding="utf-8")
(T / "home" / "private_names.txt").write_text(f"{LAT}\n{HEB}\n", encoding="utf-8")
print("ok warning once a day")

# ---------- 6: the watchdog sweep ----------
import watchdog as W
now = time.time()
iso = lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))
cache = {"ts": now,
         "open": [{"number": 1, "title": f"Fix {LAT}'s screen", "updatedAt": iso(now - 60), "comments": [
                      {"body": f"{HEB} did it", "createdAt": iso(now - 120), "url": "https://github.com/o/r/issues/1#issuecomment-111"},
                      {"body": "clean comment", "createdAt": iso(now - 100), "url": "https://github.com/o/r/issues/1#issuecomment-112"},
                      {"body": f"old {LAT}", "createdAt": iso(now - 3 * 3600), "url": "https://github.com/o/r/issues/1#issuecomment-113"}]},
                 {"number": 2, "title": "Clean title", "updatedAt": iso(now - 60), "comments": []},
                 {"number": 3, "title": f"{LAT} old issue", "updatedAt": iso(now - 5 * 3600), "comments": []}],
         "closed": [], "prs": [{"number": 4, "title": f"PR for {LAT}", "updatedAt": iso(now - 60), "comments": []}]}
edits, fail = [], {"on": True}
def title(kind, n, text): edits.append(("title", kind, n, text)); return not (fail["on"] and n == 4)
def comment(cid, text): edits.append(("comment", cid, text)); return True
assert S.sweep(cache, title, comment, now, NS) == 2          # issue 1 title + comment 111; the PR edit failed
assert ("title", "issue", 1, "Fix the kid's screen") in edits and ("comment", "111", "הילד did it") in edits
assert not any(e[1:2] == ("112",) or e[2:3] == (2,) or e[2:3] == (3,) or e[1:2] == ("113",) for e in edits), "clean / old items untouched"
edits.clear(); fail["on"] = False
cache["open"][0]["title"] = "Fix the kid's screen"; cache["open"][0]["comments"][0]["body"] = "הילד did it"   # what GitHub holds after the first edits
assert S.sweep(cache, title, comment, now, NS) == 1 and edits == [("title", "pr", 4, "PR for the kid")], edits    # the failed one is retried, the fixed ones are not edited twice
edits.clear(); cache["prs"][0]["title"] = "PR for the kid"
assert S.sweep(cache, title, comment, now, NS) == 0 and not edits, "all clean: nothing to do"
# the watchdog step: through R.gh (scrubbed again), count kept, once per 10 min, a warning when no names
calls = []
def fake_gh(*a): calls.append(a); return 0, ""
cache2 = {"open": [{"number": 8, "title": f"{LAT} here", "updatedAt": iso(now), "comments": [{"body": f"{LAT}!", "createdAt": iso(now), "url": "x#issuecomment-55"}]}], "closed": [], "prs": []}
assert W.privacy_tick(now, cache2, fake_gh) == 2
assert ("issue", "edit", "8", "--title", "the kid here") in calls and any(c[:3] == ("api", "-X", "PATCH") and "body=the kid!" in c for c in calls), calls
assert W.privacy_tick(now + 60, cache2, fake_gh) == 0, "once per 10 min"
assert "sweep fixed 2" in S.status_line()
print("ok sweep")
print("all scrub tests ok")
