# CI (#889): no repo file hard-codes the owner's personal e-mail address; commits use the noreply one.
import subprocess, sys
PERSONAL = "igalgerman" + "@" + "gmail" + ".com"
files = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True).stdout.splitlines()
bad = []
for f in files:
    try: text = open(f, encoding="utf-8", errors="ignore").read()
    except OSError: continue
    if PERSONAL in text.lower(): bad.append(f)
if bad: sys.exit("personal e-mail address hard-coded in: " + ", ".join(bad) + " (use git_email from tools/runner/config.toml)")
print("test_no_personal_email ok")
