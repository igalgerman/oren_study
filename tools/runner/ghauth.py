"""#363 step A: the bots (runner, watchdog, panel, ghcache, remote.py) call gh with a GitHub App installation token,
so they have their own primary AND secondary rate limits instead of the owner's personal login.
Claude sessions keep the owner's login: only commands that start with `gh` get GH_TOKEN (apply()).
Config (tools/runner/config.toml): github_app_id, github_app_installation_id, github_app_key (path of the private key,
OUTSIDE the repo). The key is read only to sign the JWT; it is never printed, logged or copied.
Not set up, key missing or a mint failing -> '' = gh uses the owner login as before (the failure is logged, retried after BACKOFF)."""
import base64, json, os, shutil, subprocess, time, tempfile, urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNS = Path(os.environ.get("RUNNER_RUNS") or HERE / ".runs")
TOKEN_FILE, LOG = RUNS / "gh_app_token.json", RUNS / "ghauth.log"   # .runs is gitignored; one token shared by every bot process
REFRESH = 600              # s before expiry a new token is minted (tokens live 1 h)
BACKOFF = 300              # s after a failed mint before the next try
OWNER = "OREN_GH_OWNER"    # env marker: run this gh call as the owner (e.g. the owner's budget on the dashboard)
API = "https://api.github.com"

def _cfg():
    try:
        import tomllib
        return tomllib.loads((HERE / "config.toml").read_text(encoding="utf-8"))
    except Exception: return {}

def app_cfg(cfg):
    """(app_id, installation_id, key_path) or None when the App is not set up."""
    a, i, k = cfg.get("github_app_id"), cfg.get("github_app_installation_id"), cfg.get("github_app_key")
    return (int(a), int(i), str(k)) if a and i and k else None

def _b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

def _openssl():
    return shutil.which("openssl") or next((p for p in ("C:/Program Files/Git/usr/bin/openssl.exe", "C:/Program Files/Git/mingw64/bin/openssl.exe")
                                            if os.path.exists(p)), "openssl")

def sign_rs256(data, key_path):
    """RS256 signature of data with the PEM key at key_path (python `cryptography` if installed, else the openssl CLI)."""
    key_path = os.path.expanduser(key_path)
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
    except ImportError:
        p = subprocess.run([_openssl(), "dgst", "-sha256", "-sign", key_path], input=data, capture_output=True, timeout=30,
                           creationflags=0x08000000 if os.name == "nt" else 0)
        if p.returncode: raise RuntimeError(f"openssl sign failed rc {p.returncode}")   # stderr not echoed: no key material in logs
        return p.stdout
    key = serialization.load_pem_private_key(Path(key_path).read_bytes(), password=None)
    return key.sign(data, padding.PKCS1v15(), hashes.SHA256())

def make_jwt(app_id, key_path, now, sign=None):
    head = _b64(json.dumps({"alg": "RS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64(json.dumps({"iat": int(now) - 60, "exp": int(now) + 540, "iss": str(app_id)}, separators=(",", ":")).encode())
    msg = f"{head}.{body}"
    return f"{msg}.{_b64((sign or sign_rs256)(msg.encode(), key_path))}"

def post_token(url, jwt):
    req = urllib.request.Request(url, method="POST", data=b"", headers={
        "Authorization": f"Bearer {jwt}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))

def parse_time(s):
    try: return int(datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp())
    except (TypeError, ValueError): return 0

def _read():
    try: return json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError): return {}

def _write(d):
    try:
        RUNS.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=RUNS, prefix=".gh_app_token.")
        with os.fdopen(fd, "w", encoding="utf-8") as f: json.dump(d, f)
        os.replace(tmp, TOKEN_FILE)                        # atomic: other bot processes never read half a file
    except OSError: pass

def _log(now, msg):
    try:
        RUNS.mkdir(parents=True, exist_ok=True)
        with open(LOG, "a", encoding="utf-8") as f: f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(now))} {msg[:300]}\n")
    except OSError: pass

def token(cfg=None, now=None, post=None, sign=None):
    """The App installation token ('' = use the owner login). Minted once, shared via TOKEN_FILE, refreshed REFRESH s before expiry."""
    app = app_cfg(_cfg() if cfg is None else cfg)
    if not app: return ""
    now = time.time() if now is None else now
    d = _read()
    if d.get("token") and d.get("expires_at", 0) - now > REFRESH: return d["token"]
    if d.get("failed_at") and now - d["failed_at"] < BACKOFF: return ""
    app_id, inst, key = app
    try:
        r = (post or post_token)(f"{API}/app/installations/{inst}/access_tokens", make_jwt(app_id, key, now, sign))
        tok, exp = r["token"], parse_time(r.get("expires_at"))
        _write({"token": tok, "expires_at": exp or int(now) + 3600})
        _log(now, f"app token minted (expires {r.get('expires_at')})")
        return tok
    except Exception as e:
        _write({"failed_at": now})
        _log(now, f"app token mint failed, gh uses the owner login for {BACKOFF} s: {type(e).__name__}: {e}")
        return ""

def active(now=None):
    """True when bots currently run with the App token (dashboard: show budgets per identity)."""
    d, now = _read(), time.time() if now is None else now
    return bool(app_cfg(_cfg()) and d.get("token") and d.get("expires_at", 0) > now)

def apply(cmd, env, tok=None):
    """Set GH_TOKEN in env (in place) for a `gh` command; other commands (claude, git, bash) keep the owner login.
    env[OWNER] = '1' -> this gh call runs as the owner (GH_TOKEN removed)."""
    owner = env.pop(OWNER, None)
    if not cmd or os.path.basename(str(cmd[0])).lower() not in ("gh", "gh.exe"): return env
    if owner:
        env.pop("GH_TOKEN", None); env.pop("GITHUB_TOKEN", None); return env
    t = (tok or token)()
    if t: env["GH_TOKEN"] = t
    return env
