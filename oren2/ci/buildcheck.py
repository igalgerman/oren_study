# Build check (#503): a fresh `python3 build_talents.py` on the checked-out tree (in CI: the PR merged into main)
# must leave the committed oren2/index.html and oren2/cf/public/index.html unchanged, else CI is red.
# Usage: python3 oren2/ci/buildcheck.py [repo root]
import pathlib, subprocess, sys

BUILT = ["oren2/index.html", "oren2/cf/public/index.html"]

def check(root):
    root = pathlib.Path(root)
    b = subprocess.run([sys.executable, "build_talents.py"], cwd=root / "oren2", capture_output=True, text=True)
    if b.returncode: return False, "build_talents.py failed:\n" + b.stdout + b.stderr
    st = subprocess.run(["git", "status", "--porcelain", "--", *BUILT], cwd=root, capture_output=True, text=True).stdout
    stale = [l[3:].strip() for l in st.splitlines() if l.strip()]
    if not stale: return True, "built files match a fresh build"
    return False, ("stale build: " + ", ".join(stale) + " differ from a fresh build. Fix: run `python3 build_talents.py` "
                   "in oren2/ (after merging main) and commit both built files.")

if __name__ == "__main__":
    ok, msg = check(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parents[2])
    print(msg)
    sys.exit(0 if ok else 1)
