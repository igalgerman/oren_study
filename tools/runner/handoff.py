"""Rolling role handoff (#923): `python tools/runner/handoff.py save|show <role>`.
Live file: .runs/roles/<role>-state.md (never tracked). Public copy: docs/roles/<role>-state.md on branch state/roles (REST contents API,
never main, no PR, no CI). Private notes: ~/.oren/roles/<role>-private.md (never pushed). Play data never goes to GitHub (#786)."""
import base64, json, os, re, sys, time
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
STATE_BRANCH = "state/roles"
PLAY_RE = re.compile("|".join(["play" + "log", "diag" + r"\.key", "LOG_READ" + "_KEY", "read" + "_token", "minutes per day", "play log", "session recording"]), re.I)

def _runs(): return Path(os.environ.get("RUNNER_RUNS") or HERE / ".runs")
def live_path(role, runs=None): return Path(runs or _runs()) / "roles" / f"{role}-state.md"
def private_path(role, home=None): return Path(home or Path(os.environ.get("OREN_HOME") or Path.home() / ".oren")) / "roles" / f"{role}-private.md"
def template_path(root=None): return Path(root or HERE.parent.parent) / "docs" / "roles" / "state.template.md"
def public_name(role): return f"docs/roles/{role}-state.md"

def playdata_flag(text):
    """#786: -> the first line number that looks like play data, else 0."""
    for i, l in enumerate(text.splitlines(), 1):
        if PLAY_RE.search(l): return i
    return 0

def _log(runs, msg):
    try:
        runs = Path(runs); runs.mkdir(parents=True, exist_ok=True)
        with open(runs / "handoff.log", "a", encoding="utf-8", newline="\n") as f: f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")
    except OSError: pass

def push(role, text, gh, repo, base, runs, now=None):
    """Write the public copy to state/roles with the contents API. gh(*args) -> (rc, out). -> (ok, msg)"""
    api = f"repos/{repo}"; path = public_name(role)
    rc, out = gh("api", f"{api}/git/ref/heads/{STATE_BRANCH}")
    if rc:
        rc, out = gh("api", f"{api}/git/ref/heads/{base}")
        if rc: return False, f"no {base} sha"
        sha = json.loads(out)["object"]["sha"]
        rc, out = gh("api", "-X", "POST", f"{api}/git/refs", "-f", f"ref=refs/heads/{STATE_BRANCH}", "-f", f"sha={sha}")
        if rc: return False, f"cannot create {STATE_BRANCH}"
    rc, out = gh("api", f"{api}/contents/{path}?ref={STATE_BRANCH}")
    args = []
    if rc == 0:
        try: args = ["-f", f"sha={json.loads(out)['sha']}"]
        except (ValueError, KeyError): pass
    rc, out = gh("api", "-X", "PUT", f"{api}/contents/{path}", "-f", f"message=Handoff {role} state (#923)",
                 "-f", "content=" + base64.b64encode(text.encode("utf-8")).decode(), "-f", f"branch={STATE_BRANCH}", *args)
    return (rc == 0), ("pushed" if rc == 0 else "push failed")

def save(role, d):
    """d: runs, gh, repo, base, max_lines, scrub (module with require/scrub). -> (rc, line). rc 2 = refused. A failed push keeps the live file."""
    runs = d["runs"]; p = live_path(role, runs)
    try: text = p.read_text(encoding="utf-8")
    except OSError: return 2, f"handoff save refused: no live file {p.name}"
    if len(text.splitlines()) > d["max_lines"]:
        return 2, f"handoff save refused: {role} state is over {d['max_lines']} lines"
    try: d["scrub"].require()
    except RuntimeError: return 2, "handoff save refused: the scrub names list is missing (#876)"
    n = playdata_flag(text)
    if n: return 2, f"handoff save refused: line {n} looks like play data (#786)"
    clean = d["scrub"].scrub(text)
    ok, msg = push(role, clean, d["gh"], d["repo"], d["base"], runs)
    _log(runs, f"save {role}: {msg}")
    return (0 if ok else 1), f"handoff save {role}: {msg}" + ("" if ok else " (live file kept, the next save retries)")

def show(role, d):
    """live file, else the branch copy, else the template; then the private notes when present."""
    parts = []
    try: parts.append(live_path(role, d["runs"]).read_text(encoding="utf-8"))
    except OSError:
        txt = None
        rc, out = d["gh"]("api", f"repos/{d['repo']}/contents/{public_name(role)}?ref={STATE_BRANCH}")
        if rc == 0:
            try: txt = base64.b64decode(json.loads(out)["content"]).decode("utf-8")
            except (ValueError, KeyError): txt = None
        if txt is None:
            try: txt = Path(d["template"]).read_text(encoding="utf-8")
            except OSError: txt = ""
        parts.append(txt)
    try: parts.append(private_path(role, d.get("home")).read_text(encoding="utf-8"))
    except OSError: pass
    return "\n".join(parts)

def _deps():
    import runner as R, scrub
    return dict(runs=R.RUNS, gh=lambda *a: R.run(["gh", *a]), repo=R.REPO, base=R.BRANCH, scrub=scrub,
                max_lines=int(R.CFG.get("handoff_max_lines", 80)), template=template_path(R.CFG.get("main_checkout", R.ROOT)))

def main(argv):
    if len(argv) != 2 or argv[0] not in ("save", "show"): print("usage: handoff.py save|show <role>"); return 2
    d = _deps()
    if argv[0] == "show": print(show(argv[1], d)); return 0
    rc, line = save(argv[1], d); print(line); return rc

if __name__ == "__main__": sys.exit(main(sys.argv[1:]))
