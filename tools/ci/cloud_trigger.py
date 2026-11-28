#!/usr/bin/env python3
"""#853: start a cloud worker from GitHub Actions through a scheduled-task API trigger.
Usage (workflow): python3 tools/ci/cloud_trigger.py <issue> <lane>   env: CLAUDE_TRIGGER_URL, CLAUDE_TRIGGER_TOKEN
Never prints the URL or token. A failed trigger (401/429/5xx, network) = ONE line + exit 1, no retry."""
import json, os, sys, urllib.request, urllib.error
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "runner"))

def build_request(url, token, prompt):
    """Pure: the POST that starts one session. The prompt goes in the `text` field."""
    return urllib.request.Request(url, data=json.dumps({"text": prompt}).encode(), method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})

def fire(url, token, prompt, timeout=30):
    """Returns (ok, one_line). Never includes url or token in the line."""
    try:
        with urllib.request.urlopen(build_request(url, token, prompt), timeout=timeout) as r:
            return True, f"trigger ok: HTTP {r.status}"
    except urllib.error.HTTPError as e:
        why = {401: "token rejected", 429: "rate limited"}.get(e.code, "server error" if e.code >= 500 else "refused")
        return False, f"trigger failed: HTTP {e.code} ({why})"
    except (urllib.error.URLError, OSError) as e:
        return False, f"trigger failed: network error ({type(e).__name__})"

def main(argv):
    if len(argv) < 2 or not argv[1].isdigit():
        print("usage: cloud_trigger.py <issue> [lane]"); return 2
    url, token = os.environ.get("CLAUDE_TRIGGER_URL", ""), os.environ.get("CLAUDE_TRIGGER_TOKEN", "")
    if not url or not token:
        print("trigger failed: secrets CLAUDE_TRIGGER_URL / CLAUDE_TRIGGER_TOKEN are not set"); return 1
    import runner
    ok, line = fire(url, token, runner.remote_worker_prompt(int(argv[1]), argv[2] if len(argv) > 2 else "pack"))
    print(line); return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv))
