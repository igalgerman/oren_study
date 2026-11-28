#!/usr/bin/env python3
"""#857: the GitHub Actions clock for the AI observer (hourly) and the night retro (once a night).
Usage (workflow): python3 tools/ci/cloud_clock.py observer|retro   env: CLAUDE_TRIGGER_URL, CLAUDE_TRIGGER_TOKEN, GITHUB_TOKEN
POSTs the API trigger of #853 with the prompt from docs/agents/cloud-tasks.md. Never prints the URL or token.
A failed trigger: the job ends red with ONE line and ONE comment on #528 (the ai-observer issue), not repeated within 6 h."""
import json, os, sys, time, urllib.request, urllib.error
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cloud_trigger as T

REPO, ISSUE = "igalgerman/oren_study", 528
FAIL_MARK = "<!-- cloud-clock-failed #857 -->"
REPEAT_H = 6
PROMPTS = {
    "observer": f"Follow docs/agents/cloud-tasks.md, section AI observer, in {REPO}.",
    "retro": f"Follow docs/agents/cloud-tasks.md, section Nightly retro, in {REPO}.",
}

def _api(method, path, token, body=None, timeout=20):
    req = urllib.request.Request("https://api.github.com/" + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read() or b"null")

def recently_failed(comments, now, repeat_h=REPEAT_H):
    """Pure: does a failure comment younger than repeat_h exist?"""
    import calendar
    for c in comments:
        if FAIL_MARK in (c.get("body") or ""):
            try: t = calendar.timegm(time.strptime((c.get("created_at") or "")[:19], "%Y-%m-%dT%H:%M:%S"))
            except ValueError: continue
            if now - t < repeat_h * 3600: return True
    return False

def report_failure(kind, line, token, now=None, api=_api):
    """One comment on #528 unless one was made in the last 6 h. -> True when it commented. A gh error never hides the red job."""
    now = time.time() if now is None else now
    try:
        since = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now - REPEAT_H * 3600))
        comments = api("GET", f"repos/{REPO}/issues/{ISSUE}/comments?since={since}&per_page=100", token) or []
        if recently_failed(comments, now): return False
        api("POST", f"repos/{REPO}/issues/{ISSUE}/comments", token,
            {"body": f"{FAIL_MARK}\nCloud clock (#857): the {kind} trigger failed - {line}. The PC fallback runs after 2 h without an observer line."})
        return True
    except (urllib.error.URLError, OSError, ValueError):
        return False

def main(argv, api=_api, now=None):
    if len(argv) < 2 or argv[1] not in PROMPTS:
        print("usage: cloud_clock.py observer|retro"); return 2
    kind = argv[1]
    url, tok = os.environ.get("CLAUDE_TRIGGER_URL", ""), os.environ.get("CLAUDE_TRIGGER_TOKEN", "")
    if not url or not tok: ok, line = False, "secrets CLAUDE_TRIGGER_URL / CLAUDE_TRIGGER_TOKEN are not set"
    else: ok, line = T.fire(url, tok, PROMPTS[kind])
    print(f"{kind}: {line}")
    if ok: return 0
    gh = os.environ.get("GITHUB_TOKEN", "")
    if gh: report_failure(kind, line, gh, now, api)
    return 1

if __name__ == "__main__":
    sys.exit(main(sys.argv))
