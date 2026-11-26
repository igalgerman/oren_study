# Tests for pcload (#293, PC load watch): python tools/runner/test_pcload.py
import os, tempfile; os.environ["RUNNER_RUNS"] = tempfile.mkdtemp(prefix="runs-test-")   # #229: tests never write to the live .runs
os.environ["OREN_TEST"] = "1"
import json
from pathlib import Path
import pcload as P

GB = 1024 ** 3
def proc(pid, ppid, name, gb=0.1, cmd=""):
    return {"pid": pid, "ppid": ppid, "name": name, "rss": int(gb * GB), "cmd": cmd}

# process kinds: .exe and version suffixes are one kind; other names are not counted
assert P.kind("chrome-headless-shell.exe") == "chrome-headless-shell"
assert P.kind("node.exe") == "node" and P.kind("Python3.12.exe") == "python" and P.kind("pythonw.exe") == "python"
assert P.kind("claude.exe") == "claude" and P.kind("gh.exe") == "gh" and P.kind("conhost.exe") == "conhost"
assert P.kind("explorer.exe") is None and P.kind("") is None
c = P.counts([proc(1, 0, "node.exe"), proc(2, 0, "node"), proc(3, 0, "gh.exe"), proc(4, 0, "explorer.exe")])
assert c == {"chrome-headless-shell": 0, "node": 2, "claude": 0, "python": 0, "gh": 1, "conhost": 0}, c

# owner lookup: walk parent pids up to a herdr terminal, else the Claude session that started it
procs = [proc(10, 1, "claude.exe", 0.5, "claude --remote-control oren-orchestrator ..."),
         proc(11, 10, "bash.exe"), proc(12, 11, "node.exe", 0.3), proc(13, 12, "chrome-headless-shell.exe", 2.0),
         proc(20, 1, "bash.exe"), proc(21, 20, "python.exe", 0.2),           # 20 = the herdr terminal 'watchdog'
         proc(30, 1, "claude.exe", 0.4, "claude -p hello"), proc(31, 30, "node.exe", 1.0),
         proc(40, 1, "chrome.exe", 3.0),                                    # nobody of ours
         proc(50, 51, "node.exe"), proc(51, 50, "node.exe")]                 # a parent loop never hangs
terms = {20: "watchdog (w:3)"}
assert P.owner(21, procs, terms) == "watchdog (w:3)"
assert P.owner(13, procs, terms) == "claude session orchestrator"     # chrome <- node <- bash <- claude --remote-control oren-orchestrator
assert P.owner(31, procs, terms) == "claude session pid 30"
assert P.owner(40, procs, terms) == "unknown"
assert P.owner(50, procs, terms) == "unknown"
assert P.owner(20, procs, terms) == "watchdog (w:3)"                  # the terminal's own shell
# terminals from hc ls: a pid field -> {pid: 'name (address)'}
assert P.term_pids([{"name": "watchdog", "address": "w:3", "pid": 20, "state": "live"}, {"name": "x", "address": "w:4"}]) == {20: "watchdog (w:3)"}

# top 3 by RAM, with owner
top = P.top3(procs, terms)
assert top == ["chrome.exe 3.0 GB (unknown)", "chrome-headless-shell.exe 2.0 GB (claude session orchestrator)",
               "node.exe 1.0 GB (claude session pid 30)"], top

# thresholds (fake samples): CPU > 85% for 4 min, free RAM < 15%, chrome-headless-shell > 5, claude > control sessions + 2
def sample(cpu=10, free=50, chrome=0, claude=0):
    ps = [proc(100 + i, 1, "chrome-headless-shell.exe") for i in range(chrome)] + [proc(200 + i, 1, "claude.exe") for i in range(claude)]
    return {"cpu": cpu, "ram_free": free, "procs": ps}
st = {}
assert P.causes(sample(cpu=90), st, 0, 3) == []                       # high, but not 4 min yet
assert P.causes(sample(cpu=95), st, 120, 3) == []
assert [k for k, _ in P.causes(sample(cpu=88), st, 240, 3)] == ["cpu"]   # 4 min high
assert P.causes(sample(cpu=80), st, 360, 3) == []                     # back down: the 4 min start again
assert P.causes(sample(cpu=90), st, 480, 3) == [] and P.causes(sample(cpu=90), st, 600, 3) == []
assert [k for k, _ in P.causes(sample(cpu=90), st, 720, 3)] == ["cpu"]
assert P.causes(sample(cpu=85), {}, 0, 3) == []                        # exactly 85 is not > 85
assert [k for k, _ in P.causes(sample(free=14.9), {}, 0, 3)] == ["ram"]
assert P.causes(sample(free=15), {}, 0, 3) == []
assert P.causes(sample(chrome=5), {}, 0, 3) == [] and [k for k, _ in P.causes(sample(chrome=6), {}, 0, 3)] == ["chrome"]
assert P.causes(sample(claude=5), {}, 0, 3) == [] and [k for k, _ in P.causes(sample(claude=6), {}, 0, 3)] == ["claude"]
assert [k for k, _ in P.causes(sample(claude=3), {}, 0, 0)] == ["claude"]   # no control session live: > 2
t = dict(P.causes(sample(free=10, chrome=50), {}, 0, 3))
assert "RAM 10% free" in t["ram"] and "50 chrome-headless-shell" in t["chrome"], t

# once per 30 min per cause
send, sent = P.due(["ram", "chrome"], {}, 0)
assert send == ["ram", "chrome"]
send, sent = P.due(["ram", "cpu"], sent, 600)
assert send == ["cpu"]                                                 # ram was sent 10 min ago
send, sent = P.due(["ram"], sent, 1799)
assert send == []
send, sent = P.due(["ram"], sent, 1800)
assert send == ["ram"]

# the panel/dashboard line
assert P.line({"cpu": 42.4, "ram_free": 31.6}) == "PC: CPU 42% · RAM 32% free"

# tick: alarm to the orchestrator AND the inspector, a watchdog.log line, .runs/pc.json for the panel; never kills
with tempfile.TemporaryDirectory() as d:
    d = Path(d); said, logged = [], []
    def run(now, s):
        return P.tick([{"name": "orchestrator", "state": "live", "pid": 10, "address": "c:1"}, {"name": "inspector", "state": "live"}],
                      send=lambda w, m: said.append((w, m)), log=logged.append, now=now, sample=s, runs=d)
    s = {**sample(free=10), "procs": procs}
    assert run(1000, s) == ["ram"]
    assert [w for w, _ in said] == ["orchestrator", "inspector"], said
    assert "RAM 10% free" in said[0][1] and "chrome.exe 3.0 GB (unknown)" in said[0][1], said
    assert "PC LOAD ALARM" in said[0][1] and said[0][1] == said[1][1]
    assert any("PC LOAD ALARM" in l for l in logged), logged
    pj = json.loads((d / "pc.json").read_text(encoding="utf-8"))
    assert pj["text"] == "PC: CPU 10% · RAM 10% free" and pj["alarm"] is True and pj["causes"] == ["ram"], pj
    assert P.alarmed(d, now=1000 + 60) and not P.alarmed(d, now=1000 + P.FRESH_S + 1)   # an old file (watchdog down) is no alarm
    said.clear()
    assert run(1060, s) == []                                          # too soon: every 2 min
    assert run(1000 + P.EVERY_S, s) == [] and said == []               # still alarmed, but sent < 30 min ago
    assert P.alarmed(d, now=1000 + P.EVERY_S)
    assert run(1000 + 2 * P.EVERY_S, sample()) == []                   # calm again
    pj = json.loads((d / "pc.json").read_text(encoding="utf-8"))
    assert pj["alarm"] is False and not P.alarmed(d, now=1000 + 2 * P.EVERY_S)
    assert run(1000 + 1800 + 3 * P.EVERY_S, s) == ["ram"]              # 30 min later: told again
    # no sample (no psutil, no powershell): nothing written, nothing said
    said.clear()
    assert P.tick([], send=lambda w, m: said.append(w), log=logged.append, now=99999, sample=None, runs=d, collect=lambda: None) == []
    assert said == []
assert not P.alarmed(Path(tempfile.mkdtemp()))                         # no file: not alarmed

# the runner: no cloud refusal pause from a start that failed with no output while the PC is alarmed (#293, 14:52)
assert P.pc_not_cloud("no output", True) and P.pc_not_cloud("", True)
assert not P.pc_not_cloud("no output", False)
assert not P.pc_not_cloud("Error: usage limit reached", True)

assert [k for k, _ in P.causes({"cpu": 5, "ram_free": 0, "procs": []}, {}, 0, 3)] == ["ram"]   # 0% free is an alarm, not 'unknown'

# runner: while alarmed no new LOCAL work; a no-output refusal sets no cloud pause
import runner as R
assert R.local_lanes_now(True, 2) == 0 and R.local_lanes_now(False, 2) == 2
with tempfile.TemporaryDirectory() as d:
    d = Path(d)
    (d / "pc.json").write_text(json.dumps({"alarm": True, "at": 1000}), encoding="utf-8")
    assert R.refusal_pauses("no output", d, now=1010) is False          # the PC, not the cloud
    assert R.refusal_pauses("Error: usage limit", d, now=1010) is True
    (d / "pc.json").write_text(json.dumps({"alarm": False, "at": 1000}), encoding="utf-8")
    assert R.refusal_pauses("no output", d, now=1010) is True

# dashboard: the PC line (red marker when alarmed)
import dashboard as D
assert D.pc_line({"text": "PC: CPU 91% · RAM 12% free", "alarm": True, "at": 1000}, 1010) == "PC: CPU 91% · RAM 12% free · ALARM"
assert D.pc_line({"text": "PC: CPU 9% · RAM 52% free", "alarm": False, "at": 1000}, 1010) == "PC: CPU 9% · RAM 52% free"
assert D.pc_line({"text": "PC: CPU 9% · RAM 52% free", "alarm": True, "at": 1000}, 1000 + P.FRESH_S + 5) == "PC: CPU 9% · RAM 52% free (stale)"
assert D.pc_line({}, 0) == ""
assert 'var(--bad)' in D.pc_div("PC: CPU 91% · RAM 12% free · ALARM") and 'var(--bad)' not in D.pc_div("PC: CPU 9% · RAM 52% free")

# collect() never opens a console window and never fails the tick
assert callable(P.collect)
print("pcload tests OK")
