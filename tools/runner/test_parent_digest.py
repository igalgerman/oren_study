"""#684 parent digest with a fixture day and a fake send. Run: python3 tools/runner/test_parent_digest.py"""
import os, sys, tempfile
os.environ["OREN_HOME"] = tempfile.mkdtemp(prefix="digest-test-")
os.environ["OREN_TEST"] = "1"
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import parent_digest as D

DAY = "2026-11-27"
PLAY = [{"k": "mis", "m": "chess"}, {"k": "mdone", "m": "chess"}, {"k": "mis", "m": "chess"}, {"k": "mdone", "m": "chess"},
        {"k": "mis", "m": "read"}, {"k": "mskip", "m": "read"}, {"k": "q"}, {"k": "ans", "ok": True}, {"k": "ans", "ok": False}]

def getter(ev): return lambda q: {"ev": ev, "next": None}
sent = []
def send(t): sent.append(t); return 7

l = D.digest(PLAY)
assert len(l) == 3 and "chess" in l[0] and "read" in l[1] and "read" in l[2], l
assert D.digest([{"k": "ss"}, {"k": "scr"}]) is None and D.digest([]) is None       # no play -> no message

assert D.run(DAY, getter([]), send) == "no-play" and not sent                        # nothing sent on a day without play
assert not D.marker(DAY).exists()
assert D.run(DAY, getter(PLAY), lambda t: 0) == "failed" and not D.marker(DAY).exists()   # channel down: retry later
assert D.run(DAY, getter(PLAY), send) == "sent" and len(sent) == 1 and sent[0].count("\n") == 2
assert D.run(DAY, getter(PLAY), send) == "already" and len(sent) == 1                # once per day
print("ok")
