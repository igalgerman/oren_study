"""#187 test gardener: tests may grow; this lists the ones worth trimming. It NEVER deletes or edits a test.
Weekly from the watchdog (tools/runner/watchdog.py garden_tick) and on demand:
    python3 tools/test_garden.py            # opens or updates ONE issue 'Test trim proposal (week N)'
    python3 tools/test_garden.py --dry-run  # prints the report only
Evidence: the times.tsv of every CI shard (artifacts 'times-<i>' of the tests workflow, last 30 days; oren2/tests/run.sh writes them),
oren2/tests/quarantine.txt (+ git log for when a line was added) and the test files. Candidates:
  - a desktop+phone pair whose file has nothing phone-specific, both never failed in 30 days (run it once);
  - near-duplicate test names in two files whose suites never failed in 30 days;
  - a suite whose median time got > 30% slower than the week before;
  - a suite quarantined for more than 2 days.
A worker trims only after the owner/orchestrator approves the issue (adds ready-for-agent), reviewed like any change."""
import calendar, difflib, io, json, os, re, statistics, subprocess, sys, time, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OREN = ROOT / "oren2"
import tomllib
_CFG = tomllib.loads((Path(__file__).resolve().parent / "runner" / "config.toml").read_text(encoding="utf-8"))   # #792: the names live only in config
REPO = _CFG["repo"]
RUNS_REPO = _CFG.get("game_repo") or REPO   # suite times come from the GAME repo's tests workflow (INFRA in one-repo mode)
DAY = 86400
WINDOW_D, WEEK_D, SLOWER, QUAR_D, EVERY_D = 30, 7, 0.30, 2, 7
TITLE = "Test trim proposal ("
# a file that does any of this behaves differently on a phone, so its desktop+phone pair is not an overlap
PHONE_RE = re.compile(r"""variant\s*[!=]==?\s*['"]phone|['"]phone['"]\s*[!=]==|isMobile|hasTouch|\.tap\(|touchscreen|scrollWidth|innerWidth|boundingBox""")
NAME_RE = re.compile(r"""\b(?:ok|check|t)\(.*,\s*(['"`])((?:(?!\1).){8,}?)\1\s*\)""")

def parse_times(text, at=0):
    """times.tsv (suite, seconds, budget, status) -> rows {at, suite, seconds, status}; bad lines are skipped."""
    out = []
    for ln in (text or "").splitlines()[1:]:
        p = ln.split("\t")
        if len(p) >= 4 and p[1].isdigit(): out.append({"at": at, "suite": p[0], "seconds": int(p[1]), "status": p[3].strip()})
    return out

def never_failed(rows, now, days=WINDOW_D):
    """Suites seen in the last `days` with every run ok (FAILED or SLOW = a failure). Never seen = unknown, not listed."""
    seen, bad = set(), set()
    for r in rows:
        if now - r["at"] > days * DAY: continue
        seen.add(r["suite"])
        if r["status"] != "ok": bad.add(r["suite"])
    return seen - bad

def phone_twins(suites, read):
    """Files run as '<f> desktop' and '<f> phone' whose source (read(f)) has nothing phone-specific."""
    out = []
    for s in suites:
        f, _, v = s.partition(" ")
        if v == "desktop" and f"{f} phone" in suites and f not in out and not PHONE_RE.search(read(f) or ""): out.append(f)
    return out

def test_names(src):
    return [m[2].strip() for m in NAME_RE.finditer(src or "")]

def near_dupes(srcs, ratio=0.9):
    """[(file_a, name_a, file_b, name_b)] for test names in two different files that are (nearly) the same."""
    names = sorted((f, n) for f, s in srcs.items() for n in set(test_names(s)))
    out = []
    for i, (fa, na) in enumerate(names):
        for fb, nb in names[i + 1:]:
            if fa != fb and difflib.SequenceMatcher(None, na.lower(), nb.lower()).ratio() >= ratio: out.append((fa, na, fb, nb))
    return out

def slower(rows, now):
    """[(suite, median the week before, median this week)] for suites > 30% slower; both weeks need data."""
    a, b = {}, {}
    for r in rows:
        age = now - r["at"]
        if age <= WEEK_D * DAY: b.setdefault(r["suite"], []).append(r["seconds"])
        elif age <= 2 * WEEK_D * DAY: a.setdefault(r["suite"], []).append(r["seconds"])
    out = []
    for s in sorted(set(a) & set(b)):
        x, y = statistics.median(a[s]), statistics.median(b[s])
        if x > 0 and y > x * (1 + SLOWER): out.append((s, x, y))
    return out

def quarantined(added, now):
    """added = {suite: epoch the quarantine line was added | None} -> [(suite, days)] for more than 2 days."""
    return [(s, int((now - t) // DAY)) for s, t in sorted(added.items()) if t and now - t > QUAR_D * DAY]

def key(s): return s.replace(" ", "-")

def candidates(rows, suites, read, added, now):
    ok = never_failed(rows, now)
    files = sorted({s.split(" ")[0] for s in suites})
    file_ok = {f: all(key(s) in ok for s in suites if s.split(" ")[0] == f) for f in files}
    twins = [f for f in phone_twins(suites, read) if file_ok.get(f)]
    dupes = near_dupes({f: read(f) for f in files if file_ok.get(f)})
    return {"twins": twins, "dupes": dupes, "slower": slower(rows, now), "quarantined": quarantined(added, now)}

def title(now): return f"Test trim proposal (week {int(time.strftime('%V', time.gmtime(now)))})"

def report(c, runs):
    L = [f"Test gardener (#187), from {runs} CI runs (times.tsv of every shard, last {WINDOW_D} days) + oren2/tests/quarantine.txt.",
         "It never deletes a test. To trim: approve by adding `ready-for-agent`; a worker then trims exactly what is listed, reviewed like any change.", ""]
    if c["twins"]:
        L += ["## Run once, not twice (desktop + phone, nothing phone-specific, never failed in 30 days)"]
        L += [f"- `{f} desktop` + `{f} phone`: keep one (oren2/tests/{f}.test.js)" for f in c["twins"]] + [""]
    if c["dupes"]:
        L += ["## Near-duplicate test names (both suites never failed in 30 days)"]
        L += [f"- {a}: \"{na}\" ~ {b}: \"{nb}\"" for a, na, b, nb in c["dupes"][:20]] + [""]
    if c["slower"]:
        L += ["## Got > 30% slower in a week (median)"] + [f"- {s}: {x:g}s -> {y:g}s" for s, x, y in c["slower"]] + [""]
    if c["quarantined"]:
        L += ["## Quarantined > 2 days (fix it or remove it)"] + [f"- {s}: {d} days in oren2/tests/quarantine.txt" for s, d in c["quarantined"]] + [""]
    return "\n".join(L)

def publish(gh, ttl, body):
    """ONE open proposal: update it (any week) or create it. -> ('updated'|'created', n) or None on a gh error."""
    rc, out = gh("issue", "list", "--repo", REPO, "--state", "open", "--limit", "200", "--search", "Test trim proposal in:title", "--json", "number,title")
    if rc or out is None: return None
    open_ = [i for i in json.loads(out or "[]") if i["title"].startswith(TITLE)]
    if open_:
        n = min(i["number"] for i in open_)
        gh("issue", "edit", str(n), "--repo", REPO, "--title", ttl, "--body", body)
        return ("updated", n)
    rc, out = gh("issue", "create", "--repo", REPO, "--title", ttl, "--body", body, "--label", "needs-triage")
    m = re.search(r"/issues/(\d+)", out or "")
    return ("created", int(m[1]) if m else None)

def run_if_due(marker, now=None, spawn=None):
    """Watchdog: start one gardener run when the last one is EVERY_D days old (marker file holds its epoch)."""
    now = now or time.time()
    try: last = float(Path(marker).read_text())
    except (OSError, ValueError): last = 0
    if now - last < EVERY_D * DAY: return False
    Path(marker).write_text(str(int(now)))
    (spawn or (lambda: subprocess.Popen([sys.executable, str(Path(__file__).resolve())], cwd=str(ROOT))))()
    return True

# ---------- data (side effects) ----------
def gh(*a):
    p = subprocess.run(["gh", *a], capture_output=True, text=True, encoding="utf-8", errors="replace")
    return p.returncode, p.stdout

def gh_bytes(path):
    p = subprocess.run(["gh", "api", path], capture_output=True)
    return p.stdout if p.returncode == 0 else None

def ci_rows(now, cache=ROOT / "tools" / "runner" / ".runs" / "garden", max_runs=150):
    """Rows from the times-* artifacts of the tests workflow (newest max_runs runs of the last 30 days). Cached by artifact id."""
    since = time.strftime("%Y-%m-%d", time.gmtime(now - WINDOW_D * DAY))
    rc, out = gh("api", f"repos/{RUNS_REPO}/actions/workflows/tests.yml/runs?per_page=100&created=>={since}", "--paginate", "--jq", ".workflow_runs[] | [.id, .created_at] | @tsv")
    runs = [ln.split("\t") for ln in (out or "").splitlines() if "\t" in ln][:max_runs] if not rc else []
    cache.mkdir(parents=True, exist_ok=True)
    rows, used = [], 0
    for rid, created in runs:
        at = calendar.timegm(time.strptime(created[:19], "%Y-%m-%dT%H:%M:%S"))
        rc, arts = gh("api", f"repos/{RUNS_REPO}/actions/runs/{rid}/artifacts", "--jq", '.artifacts[] | select(.name | startswith("times-")) | .id')
        ids = (arts or "").split() if not rc else []
        used += bool(ids)
        for aid in ids:
            f = cache / f"{aid}.tsv"
            if not f.exists():
                z = gh_bytes(f"repos/{RUNS_REPO}/actions/artifacts/{aid}/zip")
                if not z: continue
                try: f.write_text(zipfile.ZipFile(io.BytesIO(z)).read("times.tsv").decode("utf-8"), encoding="utf-8")
                except (zipfile.BadZipFile, KeyError): continue
            rows += parse_times(f.read_text(encoding="utf-8"), at)
    return rows, used

def suite_list():
    p = subprocess.run(["bash", "tests/run.sh"], cwd=str(OREN), capture_output=True, text=True, env={**os.environ, "LIST_ONLY": "1", "FULL": "1"})
    return [s for s in p.stdout.splitlines() if s.strip()]

def quarantine_entries():
    f = OREN / "tests" / "quarantine.txt"
    return [ln.strip() for ln in f.read_text(encoding="utf-8").splitlines() if ln.strip() and not ln.startswith("#")] if f.exists() else []

def added_at(name):
    p = subprocess.run(["git", "log", "-1", "--format=%ct", f"-S{name}", "--", "oren2/tests/quarantine.txt"], cwd=str(ROOT), capture_output=True, text=True)
    return int(p.stdout.strip()) if p.stdout.strip().isdigit() else None

def read_test(f):
    p = OREN / "tests" / f"{f}.test.js"
    return p.read_text(encoding="utf-8") if p.exists() else ""

def main(argv):
    now = time.time()
    rows, runs = ci_rows(now)
    c = candidates(rows, suite_list(), read_test, {q: added_at(q) for q in quarantine_entries()}, now)
    if not any(c.values()):
        print(f"test gardener: no trim candidates ({runs} CI runs)"); return 0
    body = report(c, runs)
    if "--dry-run" in argv: print(title(now)); print(body); return 0
    print("test gardener:", publish(gh, title(now), body))
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
