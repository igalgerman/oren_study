# Unit test for ghauth.py (#363 step A: the bots use a GitHub App installation token, own rate-limit budget) with fakes:
#   python tools/runner/test_ghauth.py
import os, tempfile; os.environ["OREN_TEST"] = "1"; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: never the live .runs
import base64, json, shutil, subprocess
from pathlib import Path
import ghauth as A

NOW = 1_800_000_000
CFG = {"github_app_id": 5939551, "github_app_installation_id": 186191764, "github_app_key": "/nowhere/app.pem"}

def b64d(s): return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

# ---------- config ----------
assert A.app_cfg(CFG) == (5939551, 186191764, "/nowhere/app.pem")
assert A.app_cfg({}) is None and A.app_cfg({"github_app_id": 1}) is None, "not set up -> None (owner login)"
assert A.app_cfg({**CFG, "github_app_id": 0}) is None, "0 = off"
print("ok config")

# ---------- JWT ----------
signed = []
def fake_sign(data, key): signed.append((data, key)); return b"SIG"
jwt = A.make_jwt(5939551, "/k.pem", NOW, sign=fake_sign)
h, p, s = jwt.split(".")
assert json.loads(b64d(h)) == {"alg": "RS256", "typ": "JWT"}
pl = json.loads(b64d(p))
assert pl["iss"] == "5939551" and pl["iat"] == NOW - 60 and pl["exp"] <= NOW + 600 and pl["exp"] > NOW, pl   # GitHub: max 10 min, clock skew
assert b64d(s) == b"SIG" and signed == [(f"{h}.{p}".encode(), "/k.pem")]
print("ok JWT header/payload/signature")

# real RS256 with a throwaway key (the owner's key is never in the repo or the cloud)
tmp = Path(tempfile.mkdtemp(prefix="ghauth-key-"))
key = tmp / "fake.pem"
have_ssl = shutil.which("openssl") and subprocess.run(["openssl", "genrsa", "-out", str(key), "2048"], capture_output=True).returncode == 0
if have_ssl:
    j = A.make_jwt(1, str(key), NOW)
    h, p, s = j.split(".")
    (tmp / "data").write_bytes(f"{h}.{p}".encode()); (tmp / "sig").write_bytes(b64d(s))
    subprocess.run(["openssl", "rsa", "-in", str(key), "-pubout", "-out", str(tmp / "pub.pem")], capture_output=True, check=True)
    v = subprocess.run(["openssl", "dgst", "-sha256", "-verify", str(tmp / "pub.pem"), "-signature", str(tmp / "sig"), str(tmp / "data")], capture_output=True, text=True)
    assert v.returncode == 0 and "Verified OK" in v.stdout, v
    import sys
    saved = {k: sys.modules.pop(k) for k in list(sys.modules) if k.startswith("cryptography")}
    sys.modules["cryptography"] = None                              # no `cryptography` installed -> the openssl CLI signs
    try: sig2 = A.sign_rs256(f"{h}.{p}".encode(), str(key))
    finally: del sys.modules["cryptography"]; sys.modules.update(saved)
    assert sig2 == b64d(s), "openssl fallback gives the same RS256 signature (PKCS#1 v1.5 is deterministic)"
    print("ok real RS256 signature verifies (cryptography and openssl)")
else:
    print("skip real RS256 (no openssl)")

# ---------- token: mint, cache, refresh, fallback ----------
posts = []
def fake_post(url, jwt):
    posts.append((url, jwt))
    return {"token": f"ghs_tok{len(posts)}", "expires_at": "2027-01-15T08:00:00Z"}
EXP = A.parse_time("2027-01-15T08:00:00Z")
assert A.parse_time("1970-01-01T01:00:00Z") == 3600 and A.parse_time("junk") == 0
t0 = EXP - 3600                                                    # token fresh: 1 h left
tok = A.token(CFG, now=t0, post=fake_post, sign=fake_sign)
assert tok == "ghs_tok1" and posts[0][0] == "https://api.github.com/app/installations/186191764/access_tokens", posts
assert A.token(CFG, now=t0 + 60, post=fake_post, sign=fake_sign) == "ghs_tok1" and len(posts) == 1, "cached: no new mint"
assert json.loads(A.TOKEN_FILE.read_text())["token"] == "ghs_tok1", "shared by runner/watchdog/panel processes"
assert A.token(CFG, now=EXP - 300, post=fake_post, sign=fake_sign) == "ghs_tok2" and len(posts) == 2, "refresh before the 1 h expiry"
assert A.token({}, now=t0, post=fake_post, sign=fake_sign) == "" and len(posts) == 2, "no App set up -> '' (owner login), no mint"

A.TOKEN_FILE.unlink()
def bad_post(url, jwt): raise OSError("HTTP 401 Bad credentials")
assert A.token(CFG, now=t0, post=bad_post, sign=fake_sign) == "", "a failed mint never breaks gh: owner login"
assert "401" in A.LOG.read_text() and "SIG" not in A.LOG.read_text()
assert A.token(CFG, now=t0 + 60, post=fake_post, sign=fake_sign) == "" and len(posts) == 2, "after a failure: back off, no mint storm"
assert A.token(CFG, now=t0 + A.BACKOFF + 1, post=fake_post, sign=fake_sign) == "ghs_tok3", "tries again after the back-off"
def no_key(data, key): raise FileNotFoundError(key)
A.TOKEN_FILE.unlink()
assert A.token(CFG, now=t0 + 9999, post=fake_post, sign=no_key) == "", "missing key file (cloud) -> owner login"
print("ok token mint / cache / refresh / fallback")

# ---------- apply: only gh commands get the App token ----------
A.TOKEN_FILE.write_text(json.dumps({"token": "ghs_live", "expires_at": NOW + 3600}))
tk = lambda: A.token(CFG, now=NOW, post=fake_post, sign=fake_sign)
e = {"PATH": "x"}; A.apply(["gh", "issue", "list"], e, tok=tk)
assert e["GH_TOKEN"] == "ghs_live"
e = {"PATH": "x"}; A.apply(["claude", "-p", "hi"], e, tok=tk)
assert "GH_TOKEN" not in e, "Claude sessions keep the owner's login"
e = {"PATH": "x"}; A.apply(["git", "push"], e, tok=tk)
assert "GH_TOKEN" not in e
e = {"GH_TOKEN": "old", A.OWNER: "1"}; A.apply(["gh", "api", "rate_limit"], e, tok=tk)
assert "GH_TOKEN" not in e and A.OWNER not in e, "OWNER marker: this call runs as the owner (dashboard owner budget)"
e = {}; A.apply(["gh", "issue", "list"], e, tok=lambda: "")
assert "GH_TOKEN" not in e, "no App token -> owner login"
print("ok apply: gh only, owner marker")
