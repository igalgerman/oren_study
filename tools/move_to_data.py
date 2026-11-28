"""#790 one-time move of personal docs and real-play screenshots from the public tree to the private DATA repo.
  python3 tools/move_to_data.py --dry-run               # default: lists candidates in a private plan file, asks the owner ONE question (owner_q, gate #790)
  python3 tools/move_to_data.py --apply [--data-dir D]  # only when `owner_q.py gate #790` is OPEN; copies to the DATA clone, checks, then `git rm`s from this tree
The plan file lives in the private data folder (OREN_HOME, default ~/.oren), never in the repo or on GitHub; the question gives counts and the path only.
The owner may delete lines (pure UI shots stay) before saying yes: --apply moves exactly the lines left in the file.
Kinds: `data` = shows real play -> DATA repo (same relative path); `infra` = owner report -> INFRA docs/reports/. The game folder's docs/ never goes to GAME.
DATA holds documents and summaries only: raw play log, family codes and keys are refused (path + content patterns).
Old copies stay in git history; the clean GAME history (#796) is the real fix. ~/.oren/playlog is never touched."""
import filecmp, fnmatch, re, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE / "runner"))
import scrub

ISSUE = 790
# (kind, glob relative to the repo root); a glob that matches a folder takes the whole folder
CANDIDATES = [("data", "oren2/docs/qa-deep-report.md"), ("data", "oren2/docs/STATUS.md"), ("data", "oren2/docs/shots"), ("data", "shots"),
              ("data", "reports/shots-*"), ("data", "oren2/docs/reports/shots-*"), ("data", "oren2/docs/reports/retro-*.md"),
              ("infra", "oren2/docs/reports/*.md")]
REFUSE_PATH = re.compile(r"(playlog|diag\.key|\.key$|family[-_ ]?codes?|private_names|(^|/)\.env)", re.I)
REFUSE_TEXT = re.compile(r"(family[-_ ]?code\s*[:=]\s*\S+|(api[-_]?key|secret|token|LOG_READ_KEY)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY)", re.I)
TEXT_EXT = {".md", ".txt", ".json", ".csv", ".html", ".js", ".py", ".toml", ".yml", ".yaml"}

YES = re.compile(r"^\s*(1(\W|$)|כן|yes\b)", re.I)
NO = re.compile(r"^\s*(2(\W|$)|לא|no\b)", re.I)

def yes_in(out):
    """Pure: True only for `OPEN: <answers>` where an answer is a yes and none is a no. A bare reaction is not a yes."""
    if not (out or "").startswith("OPEN: "): return False
    ans = [a.strip() for a in out[6:].splitlines()[0].split(" | ")]
    return any(YES.match(a) for a in ans) and not any(NO.match(a) for a in ans)

def GATE():
    r = subprocess.run([sys.executable, str(HERE / "runner" / "owner_q.py"), "gate", f"#{ISSUE}"], capture_output=True, text=True)
    return r.returncode == 0 and yes_in(r.stdout)
def ASK(text): subprocess.run([sys.executable, str(HERE / "runner" / "owner_q.py"), "ask", f"#{ISSUE}", text, "--gates", str(ISSUE)])

def plan_path(): return scrub.HOME / "move_to_data_plan.txt"
def result_path(): return scrub.HOME / "move_to_data_result.txt"

def tracked(root):
    out = subprocess.run(["git", "-C", str(root), "ls-files"], capture_output=True, text=True).stdout
    return [l for l in out.splitlines() if l]

def refused(root, rel):
    """reason string when the file must never go to DATA, else ''."""
    if REFUSE_PATH.search(rel): return "path pattern"
    p = Path(root) / rel
    if p.suffix.lower() in TEXT_EXT and p.is_file():
        try:
            if REFUSE_TEXT.search(p.read_text(encoding="utf-8", errors="replace")): return "key/code in text"
        except OSError: return "unreadable"
    return ""

def candidates(root):
    """-> (items [(kind, rel)], refused [(rel, why)]); a file matches the first candidate rule that fits."""
    files, items, bad, seen = tracked(root), [], [], set()
    for kind, pat in CANDIDATES:
        for f in files:
            if f in seen: continue
            if fnmatch.fnmatchcase(f, pat) or f.startswith(pat.rstrip("/") + "/") or any(fnmatch.fnmatchcase("/".join(f.split("/")[:k]), pat) for k in range(1, len(f.split("/")))):
                seen.add(f)
                why = refused(root, f)
                (bad.append((f, why)) if why else items.append((kind, f)))
    return sorted(items, key=lambda x: (x[0], x[1])), sorted(bad)

def dest(kind, rel): return f"docs/reports/{Path(rel).name}" if kind == "infra" else rel

def write_plan(root, items, bad):
    n = lambda k: sum(1 for i in items if i[0] == k)
    head = [f"MOVE TO DATA PLAN (#{ISSUE}) - private file, not for GitHub or chat.",
            f"{n('data')} files to the DATA repo (real play), {n('infra')} owner reports to INFRA docs/reports/, {len(bad)} refused (key/code/play-log patterns, never moved).",
            "Delete a line to keep that file where it is (pure UI shots stay). Format: kind<TAB>path.", ""]
    body = [f"{k}\t{f}" for k, f in items]
    refl = [""] + [f"# refused ({why}): {f}" for f, why in bad] if bad else []
    scrub.HOME.mkdir(parents=True, exist_ok=True)
    plan_path().write_text("\n".join(head + body + refl) + "\n", encoding="utf-8")

def dry_run(root=ROOT):
    items, bad = candidates(root); write_plan(root, items, bad)
    d = sum(1 for k, _ in items if k == "data"); i = len(items) - d
    shown = str(plan_path()).replace(str(Path.home()), "~")
    print(f"plan: {shown}\n{d} data, {i} infra, {len(bad)} refused")
    if items:
        ASK(f"רשימת ההעברה מוכנה: {d} קבצים שמראים משחק אמיתי יעברו לריפו הפרטי, {i} דוחות יעברו לתיקיית הדוחות של התשתית. הרשימה המלאה בקובץ {shown} (לא ב-GitHub). "
            "אפשר למחוק שורות מהקובץ, מה שנשאר ברשימה יעבור. האם להעביר? אפשרויות: 1. כן, להעביר (מומלץ) 2. לא")
    return 0

def read_plan():
    items = []
    for l in plan_path().read_text(encoding="utf-8").splitlines():
        m = re.match(r"^(data|infra)\t(.+)$", l)
        if m: items.append((m[1], m[2]))
    return items

def apply(root=ROOT, data_dir=None):
    root = Path(root)
    if not GATE(): print("waiting for owner: the owner_q gate is CLOSED, nothing changed"); return 3
    try: items = read_plan()
    except OSError: print("no plan: run --dry-run first"); return 2
    data_dir = Path(data_dir or scrub.HOME / "family-vault")
    if not (data_dir / ".git").exists(): print("no DATA clone at the data dir (clone family-vault there first)"); return 2
    infra_dir = root
    tr, res, bad = set(tracked(root)), [], 0
    moved = []
    names = {}
    for kind, rel in items:
        if kind == "infra": names.setdefault(Path(rel).name, []).append(rel)
    for kind, rel in items:                                                 # 1. copy + verify (nothing is removed yet)
        if kind == "infra" and len(names[Path(rel).name]) > 1: res.append(f"{rel}: skipped (name clash)"); bad += 1; continue
        why = refused(root, rel) if rel in tr else "not tracked"
        if why: res.append(f"{rel}: skipped ({why})"); bad += 1; continue
        target = (data_dir if kind == "data" else infra_dir) / dest(kind, rel)
        if kind == "infra" and target == root / rel: continue                # already in place
        target.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(root / rel, target)
        if not filecmp.cmp(root / rel, target, shallow=False): res.append(f"{rel}: copy differs"); bad += 1; continue
        moved.append((kind, rel)); res.append(f"{rel}: copied")
    for kind, rel in moved:                                                 # 2. remove from this tree (data: gone; infra: moved)
        subprocess.run(["git", "-C", str(root), "rm", "-q", "-f", "--", rel], capture_output=True)
        if kind == "infra": subprocess.run(["git", "-C", str(root), "add", "--", dest(kind, rel)], capture_output=True)
    if any(k == "data" for k, _ in moved):
        subprocess.run(["git", "-C", str(data_dir), "add", "-A"], capture_output=True)
        subprocess.run(["git", "-C", str(data_dir), "commit", "-q", "-m", "Move personal docs and real-play screenshots from INFRA (#790)"], capture_output=True)
    left = [r for k, r in moved if r in set(tracked(root)) and not (k == "infra" and dest(k, r) == r)]
    scrub.HOME.mkdir(parents=True, exist_ok=True)
    result_path().write_text(f"{len(moved)} moved, {bad} skipped, {len(left)} still tracked\n" + "\n".join(res) + "\n", encoding="utf-8")
    print(f"result: {result_path()}\n{len(moved)} moved, {bad} skipped, {len(left)} still tracked (push the DATA clone, then commit this tree)")
    return 1 if left or bad else 0

def main(argv):
    if "--apply" in argv:
        dd = argv[argv.index("--data-dir") + 1] if "--data-dir" in argv else None
        return apply(ROOT, dd)
    return dry_run()

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
