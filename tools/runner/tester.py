"""#618: test levels and the Tester role (FLOW.md, Reviewer + Tester sections).

The reviewer ends its comment with `TEST: T0|T1|T2|T3` (missing = T2). After a review PASS, T1+ gets a cloud Tester session
`test-<n>` (Sonnet; Opus for T3) that plays the changed flows + the regression tour on the PR's Cloudflare Pages preview
and posts `TEST: PASS` or `TEST: FAIL <repro>` on the PR. FAIL goes back to the worker like a RED review (#303 loop).
After deploy the scripted tour (oren2/ci/tour.js) runs on production; a fail opens a P0 bug (tour_fail_actions)."""
import json, os, re, sys
import remote, trust
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "oren2", "ci"))
from deploy_ci import TESTER_MARK, tour_fail_actions   # the post-deploy tour lives in CI (stdlib only); re-exported for the dashboard

LEVELS = ("T0", "T1", "T2", "T3")
DEFAULT = "T2"
LEVEL = re.compile(r"^\s*TEST:\s*(T\d)\s*$", re.M | re.I)
RESULT = re.compile(r"^\s*TEST:\s*(PASS|FAIL)\b.*", re.M)

TOUR = ("the daily path: 3 missions (open each, play one to the end)",
        "voice on a question + help -> read (both are heard)",
        "the music/sound button (music off, stays off on the next screen, back on)",
        "a story with questions (open, answer one)",
        "the parent panel live update (kid progress shows up on the parent panel without a reload)",
        "a parent message reaching the kid",
        "the time limit and +minutes (play ends at the limit; +minutes from the parent lets the kid go on)")
FIT = ("no duplicate or competing buttons", "one main action per screen", "the same back / sound / help controls as the other screens",
       "consistent voice and Hebrew nikud", "no conflict with an open PR on the same screen")

def parse_level(text):
    """The reviewer's last `TEST: Tn` line -> T0..T3; none or an unknown level -> T2."""
    hits = [h.upper() for h in LEVEL.findall(text or "")]
    return hits[-1] if hits and hits[-1] in LEVELS else DEFAULT

# #746: a PR that touches sync, speech or the home redraw is always T3 (two devices at once), whatever the reviewer wrote.
# The one list: files (the save server) and patterns on the changed lines (the game code in oren2/*.js, index.html).
T3_FILES = re.compile(r"(^|/)cf/functions/api/save/")
T3_CODE = re.compile(r"emit\(\s*['\"]synced['\"]|on\(\s*['\"]synced['\"]|\bfamPull\b|\bfamNow\b|\bmergeIn\b|\bfunction\s+(say|sayNext|sayOne|hush)\b|"
                     r"\bhush\s*\(|\bsayNow\b|\bO\.quiet\s*\(\s*home\b|\bfunction\s+home\b")

def touches_t3(diff):
    """Pure: a unified diff (`gh pr diff`) -> True when a file in T3_FILES changes or an added/removed line matches T3_CODE.
    The built copy oren2/cf/public/index.html is skipped (same lines as oren2/index.html)."""
    path = ""
    for ln in (diff or "").splitlines():
        if ln.startswith("diff --git"):
            path = ln.split(" b/", 1)[-1]
            if T3_FILES.search(path): return True
        elif ln[:1] in "+-" and ln[:3] not in ("+++", "---") and not path.startswith("oren2/cf/public/") and T3_CODE.search(ln): return True
    return False

def raise_level(level, diff):
    """The reviewer's level, raised to T3 when the diff touches sync/speech/home-redraw code."""
    return "T3" if touches_t3(diff) else level

def needs_test(level): return level != "T0"
def model_for(level):
    """T1/T2 Sonnet, T3 Opus; effort medium (#714: runner.floors, via with_effort in the runner)."""
    return "opus" if level == "T3" else "sonnet"
def session_name(n): return f"test-{n}"
def preview_url(pr): return f"https://pr-{pr}.oren-game.pages.dev"   # .github/workflows/preview.yml deploys branch pr-<n>

def prompt(n, pr, level, url, repo=None):
    repo = repo or remote.repos.pr_repo()          # #792: the PR may be in GAME
    two = ("This is T3: use two browsers at once, the kid on the laptop (1366x768) and the parent on the phone (390x844), "
           "same test family, and play every kid <-> parent step across them. " if level == "T3" else "")
    tour = "".join(f"\n  {i}. {t}" for i, t in enumerate(TOUR, 1))
    return (f"You are the Tester (#618) for PR #{pr} (issue #{n}) in {repo}, unattended in a cloud session. Change NO files in the repo, "
            f"push nothing. Read CLAUDE.md, the issue (`python3 tools/runner/view.py issue {n}` (trusted authors only)) and the diff (`gh pr diff {pr} --repo {repo}`). "
            f"Test level {level}. The PR's preview site is {url} (wait up to 10 min for it to answer with this PR's build). "
            "With Playwright (require('playwright'), chromium.launch()) in a real browser, at desktop 1366x768 AND phone 390x844: "
            "play the changed flows like Oren (6-7, taps, no reading) and like the parent. " + two +
            "Use a throwaway test family code, never a real family. Then the fixed regression tour of the core experience: first the scripted "
            f"part, `node oren2/ci/tour.js {url}` (the same tour runs on production after deploy), then play it yourself:" + tour +
            "\nFit check (on the changed screens and the tour): " + "; ".join(FIT) + " (list the open PRs with "
            f"`gh pr list --repo {repo}` and look for one on the same screen). Fit issues are FAIL only for wrong behaviour; "
            "polish goes as a note to the rolling 'Polish backlog' issue of the lane. "
            f"Post ONE comment on the PR (`gh pr comment {pr} --repo {repo} --body-file <file>`, file in your scratch dir) with the "
            "screenshots (attach or link them) and, on its own last line, `TEST: PASS` or `TEST: FAIL <exact repro steps>` (no backticks). "
            + remote.NO_MERGE)

def parse_result(line):
    m = re.match(r"\s*TEST:\s*(PASS|FAIL)\b\s*(.*)$", line or "", re.S)
    return (m.group(1).lower(), m.group(2).strip()) if m else ("none", "")

def result_from(comments):
    """(last `TEST: PASS|FAIL` line, that comment's body) from PR comment bodies; ('', '') when none yet."""
    for body in reversed(comments):
        hits = [h.group(0).strip() for h in RESULT.finditer(body or "")]
        if hits: return hits[-1], body
    return "", ""

def status(pr, run=remote.sh, since=None):
    """The tester's result comment on the PR since this round -> {state: done|working, line, body} (like remote.review_status)."""
    rc, out = run(["gh", "pr", "view", str(pr), "--repo", remote.repos.pr_repo(), "--json", "comments"])
    try: comments = [c.get("body", "") for c in trust.only(json.loads(out).get("comments", [])) if not since or c.get("createdAt", "") >= since] if rc == 0 else []
    except ValueError: comments = []
    line, body = result_from(comments)
    return {"state": "done" if line else "working", "line": line, "body": body}

def fail_red(line, body="", level=""):
    """A `TEST: FAIL <repro>` -> the red text the #303 FIX loop takes (like a reviewer's VERDICT: FIX)."""
    return f"VERDICT: FIX tester{f' ({level})' if level else ''} found: {parse_result(line)[1]}\n\n{(body or '')[-3000:]}"

def gate(review, run_tester, diff=""):
    """Pure order after a review PASS: T0 -> merge; T1+ -> run_tester(level) -> (body, line); PASS -> merge,
    FAIL -> fix (the red text for the #303 loop), no line -> blocked. -> (step, level, text)."""
    level = raise_level(parse_level(review), diff)
    if not needs_test(level): return ("merge", level, "")
    body, line = run_tester(level)
    kind, repro = parse_result(line)
    if kind == "pass": return ("merge", level, line)
    if kind == "fail": return ("fix", level, fail_red(line, body, level))
    return ("blocked", level, body or "tester gave no TEST line")

OWNER = re.compile(r"!\[[^\]]*\]\(|<img\b|\bOwner\b")

def bug_sources(issues):
    """Dashboard (#618): bug issues found by the tester (TESTER_MARK) vs reported by the owner from the live game (a photo or 'Owner')."""
    out = {"tester": 0, "owner": 0}
    for i in issues:
        if "bug" not in [l.get("name") if isinstance(l, dict) else l for l in i.get("labels") or []]: continue
        b = i.get("body") or ""
        if TESTER_MARK in b: out["tester"] += 1
        elif OWNER.search(b): out["owner"] += 1
    return out
