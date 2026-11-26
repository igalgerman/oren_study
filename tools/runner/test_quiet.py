# Unit test for quiet.py: python tools/runner/test_quiet.py
import subprocess, sys
from pathlib import Path

Q = str(Path(__file__).with_name("quiet.py"))
p = subprocess.run([sys.executable, Q, sys.executable, "-c", "print('x'); import sys; sys.stderr.write('e'); sys.exit(3)"],
                   capture_output=True, text=True)
assert p.returncode == 3, p.returncode
assert p.stdout.strip() == "x", p.stdout
assert p.stderr == "e", p.stderr
p = subprocess.run([sys.executable, Q, "no-such-binary-xyz"], capture_output=True)
assert p.returncode == 127
print("quiet ok")
