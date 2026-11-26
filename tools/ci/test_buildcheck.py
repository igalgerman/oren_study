# Unit test for the build check (#503): python3 tools/ci/test_buildcheck.py
# A fresh build_talents.py on the checked-out tree must leave the built files unchanged (else CI is red).
import os, subprocess, sys, tempfile, pathlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import buildcheck as b

def git(cwd, *a): subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True)
t = pathlib.Path(tempfile.mkdtemp())
(t / "oren2" / "cf" / "public").mkdir(parents=True)
# a tiny stand-in build: index.html + cf/public/index.html from part.js
(t / "oren2" / "build_talents.py").write_text("import pathlib\nd=pathlib.Path(__file__).parent\ns=(d/'part.js').read_text()\n"
    "(d/'index.html').write_text('<x>'+s+'</x>')\n(d/'cf'/'public'/'index.html').write_text('<site>'+s+'</site>')\n")
(t / "oren2" / "part.js").write_text("a")
subprocess.run([sys.executable, "build_talents.py"], cwd=t / "oren2", check=True)
git(t, "init", "-q"); git(t, "add", "-A"); git(t, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "x")
ok, msg = b.check(t)
assert ok, msg
print("ok committed build is fresh")

(t / "oren2" / "part.js").write_text("b")                    # a source change without a rebuild
git(t, "add", "-A"); git(t, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "y")
ok, msg = b.check(t)
assert not ok and "oren2/index.html" in msg and "oren2/cf/public/index.html" in msg and "build_talents.py" in msg, msg
print("ok stale build is red")

# the tests workflow runs the check on every PR and push to main
wf = (pathlib.Path(__file__).parents[2] / ".github" / "workflows" / "tests.yml").read_text()
assert "tools/ci/buildcheck.py" in wf, "tests.yml must run tools/ci/buildcheck.py"
print("ok tests.yml runs the build check")
