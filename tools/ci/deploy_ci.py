"""Deploy workflow helper (#192), used by .github/workflows/deploy.yml. Stdlib only.
  python3 tools/ci/deploy_ci.py report <deploy.log>   parse deploy.sh output -> job summary + outputs ok/url/d1; exit 1 if not deployed
  python3 tools/ci/deploy_ci.py smoke <url>           live check: page loads, save round trip (D1), /api/tts/status; exit 1 on a failure"""
import json, os, sys, time, urllib.request

SMOKE_ID = "0" * 31 + "1"          # one fixed save id for the smoke check: each deploy overwrites the same row
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
    with urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=h), timeout=30) as r:
        return r.status, r.read().decode("utf-8", "replace")

def _page(base):
    s, t = _req("GET", base + "/"); return s == 200 and "<html" in t.lower()

def _save(base):
    mark = str(time.time())
    body = json.dumps({"v": 4, "smoke": mark})
    if _req("PUT", f"{base}/api/save/{SMOKE_ID}", body)[0] != 200: return False
    s, t = _req("GET", f"{base}/api/save/{SMOKE_ID}"); return s == 200 and json.loads(t).get("smoke") == mark

def _tts(base):
    s, t = _req("GET", base + "/api/tts/status"); return s == 200 and json.loads(t).get("ok") is True

def smoke(base, tries=5, wait=6):
    """-> [(name, passed)]. Each check is retried: a brand-new deployment URL can take a few seconds to answer."""
    base = base.rstrip("/"); res = []
    for name, f in (("page loads", _page), ("save round trip", _save), ("/api/tts/status", _tts)):
        ok = False
        for i in range(tries):
            try: ok = f(base)
            except Exception: ok = False
            if ok: break
            if i < tries - 1: time.sleep(wait)
        res.append((name, ok))
    return res

def _append(var, text):
    p = os.environ.get(var)
    if p:
        with open(p, "a", encoding="utf-8") as f: f.write(text)

def main(argv):
    if len(argv) == 2 and argv[0] == "report":
        r = parse(open(argv[1], encoding="utf-8", errors="replace").read())
        _append("GITHUB_STEP_SUMMARY", summary(r))
        _append("GITHUB_OUTPUT", f"ok={str(r['ok']).lower()}\nurl={r['url']}\nd1={'yes' if r['d1'] else 'no'}\n")
        print(summary(r)); return 0 if r["ok"] else 1
    if len(argv) == 2 and argv[0] == "smoke":
        res = smoke(argv[1], tries=int(os.environ.get("SMOKE_TRIES", "5")))
        text = "\n## Live smoke check\n\n" + "".join(f"- {'ok' if ok else 'FAILED'}: {n}\n" for n, ok in res)
        _append("GITHUB_STEP_SUMMARY", text); print(text)
        return 0 if all(ok for _, ok in res) else 1
    print(__doc__); return 2

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
