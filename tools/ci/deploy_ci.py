"""Deploy workflow helper (#192), used by .github/workflows/deploy.yml. Stdlib only.
  python3 tools/ci/deploy_ci.py report <deploy.log>   parse deploy.sh output -> job summary + outputs ok/url/d1; exit 1 if not deployed
  python3 tools/ci/deploy_ci.py smoke <url> [<url>..] live check (#150): page loads, save round trip (random id, then deleted), D1 bound,
                                                      /api/tts/status; exit 1 on a failure. Workers: run it on demand against
                                                      https://oren-game.pages.dev to verify a fix on the live site; it leaves no data behind.
  python3 tools/ci/deploy_ci.py plan                  which sha to deploy (env EVENT, RUN_SHA, MAIN_SHA, GREEN_SHA) -> output sha ("" = skip)"""
import json, os, secrets, subprocess, sys, time, urllib.error, urllib.request

UA = {"user-agent": "oren-deploy-smoke"}

def parse(out):
    """deploy.sh prints progress lines first and 'ok <url>' last (#50); it warns 'D1 not bound' (#109)."""
    last = (out.strip().splitlines() or [""])[-1].split()
    url = last[-1] if len(last) > 1 and last[-1].startswith("http") else ""
    return {"ok": bool(last) and last[0] == "ok" and bool(url), "url": url, "d1": "D1 not bound" not in out}

def summary(r):
    return (f"## Deploy: {'ok' if r['ok'] else 'FAILED'}\n\n"
            f"- deployment URL: {r['url'] or '-'}\n- D1 bound: {'yes' if r['d1'] else 'no'}\n")

def _req(method, url, body=None):
    data = body.encode() if body is not None else None
    h = dict(UA, **({"content-type": "application/json"} if data else {}))
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=h), timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")

def _page(base):
    s, t = _req("GET", base + "/"); return s == 200 and "<html" in t.lower()

def _save(base):
    """A fresh random save id each run: PUT, read back, DELETE (the worker deletes only saves marked smoke), then it must be gone."""
    u, mark = f"{base}/api/save/{secrets.token_hex(16)}", str(time.time())
    try:
        if _req("PUT", u, json.dumps({"v": 4, "smoke": mark}))[0] != 200: return False
        s, t = _req("GET", u); back = s == 200 and json.loads(t).get("smoke") == mark
    finally:
        gone = _req("DELETE", u)[0] in (200, 404)             # cleaned up even when the read back failed
    return back and gone and _req("GET", u)[0] == 404

def _status(base):
    s, t = _req("GET", base + "/api/tts/status"); return json.loads(t) if s == 200 else {}

def _d1(base): return _status(base).get("d1") is True       # the live worker sees its D1 binding (deploys said ok while it was broken)

def _tts(base): return _status(base).get("ok") is True

def smoke(base, tries=5, wait=6):
    """-> [(name, passed)]. Each check is retried: a brand-new deployment URL can take a few seconds to answer."""
    base = base.rstrip("/"); res = []
    for name, f in (("page loads", _page), ("save round trip", _save), ("D1 bound", _d1), ("/api/tts/status", _tts)):
        ok = False
        for i in range(tries):
            try: ok = f(base)
            except Exception: ok = False
            if ok: break
            if i < tries - 1: time.sleep(wait)
        res.append((name, ok))
    return res

def plan(event, run_sha, main_sha, green_sha, attempted):
    """Pure: -> (sha to deploy or "", why). workflow_run: the commit whose tests just went green, only if it is still the newest main.
    schedule (every 15 min): the newest green main, so a skipped/cancelled run never leaves merged work off the site.
    Both skip a sha whose deploy was already tried (no double deploy, no failing again every 15 min). Manual run: always the newest main."""
    if event == "workflow_dispatch": return main_sha, "manual run: newest main"
    sha = run_sha if event == "workflow_run" else green_sha
    if not sha: return "", "no green commit on main yet"
    if event == "workflow_run" and sha != main_sha: return "", f"main moved on to {main_sha}; that commit deploys after its tests"
    if attempted(sha): return "", f"{sha} was already deployed (or tried)"
    return sha, "newest green main" if event == "schedule" else "tests green on the newest main"

def guard(event, sha, main_sha, green_sha):
    """Pure: -> (still current?, why). Run in the deploy job right before anything goes live: a run that waited (or was planned long ago)
    must not put an older sha over a newer one. workflow_run: sha must still be the newest main; schedule: the newest green main. Manual: always deploys."""
    if event == "workflow_dispatch": return True, "manual run"
    want = main_sha if event == "workflow_run" else green_sha
    return sha == want, "still the newest" if sha == want else f"{sha} is no longer the newest ({want} is); not deploying it"

def attempted_cache(sha):
    """A deploy of `sha` was tried: the deploy job saves the Actions cache key deploy-attempt-<sha> before deploy.sh (needs actions: read)."""
    key = "deploy-attempt-" + sha
    p = subprocess.run(["gh", "api", f"repos/{os.environ.get('GITHUB_REPOSITORY', '')}/actions/caches?key={key}", "--jq", "[.actions_caches[].key]"],
                       capture_output=True, text=True)
    if p.returncode: raise SystemExit("could not read the Actions caches: " + p.stderr[:300])
    return key in json.loads(p.stdout or "[]")

def _append(var, text):
    p = os.environ.get(var)
    if p:
        with open(p, "a", encoding="utf-8") as f: f.write(text)

def main(argv, attempted=attempted_cache):
    if len(argv) == 2 and argv[0] == "report":
        r = parse(open(argv[1], encoding="utf-8", errors="replace").read())
        _append("GITHUB_STEP_SUMMARY", summary(r))
        _append("GITHUB_OUTPUT", f"ok={str(r['ok']).lower()}\nurl={r['url']}\nd1={'yes' if r['d1'] else 'no'}\n")
        print(summary(r)); return 0 if r["ok"] else 1
    if len(argv) >= 2 and argv[0] == "smoke":
        good = True
        for url in argv[1:]:
            res = smoke(url, tries=int(os.environ.get("SMOKE_TRIES", "5"))); good = good and all(ok for _, ok in res)
            text = f"\n## Live smoke check: {url}\n\n" + "".join(f"- {'ok' if ok else 'FAILED'}: {n}\n" for n, ok in res)
            _append("GITHUB_STEP_SUMMARY", text); print(text)
        _append("GITHUB_OUTPUT", f"smoke={str(good).lower()}\n")
        return 0 if good else 1
    if argv == ["plan"]:
        e = os.environ.get
        sha, why = plan(e("EVENT", ""), e("RUN_SHA", ""), e("MAIN_SHA", ""), e("GREEN_SHA", ""), attempted)
        _append("GITHUB_OUTPUT", f"sha={sha}\n")
        text = (f"Deploy {sha}: {why}\n" if sha else f"Skipped: {why}\n"); _append("GITHUB_STEP_SUMMARY", text); print(text)
        return 0
    if argv == ["guard"]:
        e = os.environ.get
        ok, why = guard(e("EVENT", ""), e("PLAN_SHA", ""), e("MAIN_SHA", ""), e("GREEN_SHA", ""))
        _append("GITHUB_OUTPUT", f"current={str(ok).lower()}\n")
        text = f"Guard: {why}\n"; _append("GITHUB_STEP_SUMMARY", text); print(text)
        return 0
    print(__doc__); return 2

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
