"""#783 privacy step 0: ONE central scrub for every GitHub write the bots make (runner.run is the single gh entry point).
The kid's real name never lives in the repo: the list is read from `private_names.txt` in the private data folder
(`OREN_HOME`, default ~/.oren, same as tools/playlog.py) or env PRIVATE_NAMES_FILE; env PRIVATE_NAMES (comma list) also works.
Hebrew word -> הילד, Latin word -> the kid (possessive: the kid's); Hebrew one-letter prefixes keep working.
Protected, never touched: a name inside a longer word, a path, a URL, a repo/branch/label name.
No names: nothing changes, ONE warning per day, the dashboard shows an ALARM line."""
import calendar, json, os, re, sys, time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import ghcache

HOME = Path(os.environ.get("OREN_HOME") or Path.home() / ".oren")
RUNS = ghcache.RUNS
STATE = RUNS / "privacy_scrub.json"      # {"warned": "YYYY-MM-DD", "fixes": n, "sweep_at": ts}
WARNING = "privacy scrub: no names file"
HEB, LAT = "הילד", "the kid"
_HEB_RE = re.compile(r"[֐-׿]")
_NIKUD = "֑-ׇ"
_CACHE = {}

def names_file():
    return Path(os.environ.get("PRIVATE_NAMES_FILE") or HOME / "private_names.txt")

def names():
    """The configured names (file lines + env list), stripped, no blanks, no duplicates."""
    out = []
    try: out += names_file().read_text(encoding="utf-8").splitlines()
    except OSError: pass
    out += (os.environ.get("PRIVATE_NAMES") or "").split(",")
    seen, res = set(), []
    for n in (x.strip() for x in out):
        if n and not n.startswith("#") and n.lower() not in seen: seen.add(n.lower()); res.append(n)
    return res

# a match must not touch a word/path character before, and not continue into a word, path, URL or hyphenated name after
_BEFORE = r"(?<![\w/\\@#~.\-])"
_AFTER = r"(?![\w" + _NIKUD + r"]|[/\\_\-]\w|\.\w|://)"
_HEB_PREFIX = r"(?:של|[ולבכמהש]{1,2})?"

def _compile(ns):
    key = tuple(ns)
    if key in _CACHE: return _CACHE[key]
    heb = [n for n in ns if _HEB_RE.search(n)]
    lat = [n for n in ns if not _HEB_RE.search(n)]
    pats = []
    if heb:
        alt = "|".join(re.escape(n) for n in sorted(heb, key=len, reverse=True))
        pats.append(("h", re.compile(_BEFORE + "(?P<p>" + _HEB_PREFIX + ")(?P<n>" + alt + ")" + _AFTER)))
    if lat:
        alt = "|".join(re.escape(n) for n in sorted(lat, key=len, reverse=True))
        pats.append(("l", re.compile(_BEFORE + "(?P<n>" + alt + ")(?P<s>['’]s)?" + _AFTER, re.I)))
    _CACHE[key] = pats
    return pats

def _heb(m):
    p = m.group("p") or ""
    if p == "של": return "של " + HEB
    if not p: return HEB
    return p + ("ילד" if p[-1] in "לבכה" else HEB)

def _lat(m): return LAT + ("'s" if m.group("s") else "")

def scrub(text, ns=None):
    """Pure: text with every configured name replaced. `ns` = the name list (default: read from the file / env)."""
    if not text: return text
    ns = names() if ns is None else ns
    if not ns: return text
    for kind, pat in _compile(ns):
        text = pat.sub(_heb if kind == "h" else _lat, text)
    return text

# ---------- the gh command ----------
_TEXT_FLAGS = {"--title", "-t", "--body", "-b", "--comment", "--description", "-d", "--message", "-m"}
_KEYS = {"title", "body", "description", "message"}
_FIELD = ("-f", "-F", "--field", "--raw-field")

def _file(path, ns, tmpdir):
    """--body-file / -F body=@file: scrub the file's text into a temp copy; -> its path (the original when unreadable or clean)."""
    try: t = Path(path).read_text(encoding="utf-8")
    except OSError: return path
    s = scrub(t, ns)
    if s == t: return path
    tmpdir.mkdir(parents=True, exist_ok=True)
    p = tmpdir / f"scrub-{os.getpid()}-{time.time_ns()}.txt"
    p.write_text(s, encoding="utf-8")
    return str(p)

def scrub_cmd(cmd, input=None, ns=None, tmpdir=None):
    """Every text argument of a gh WRITE command (and stdin for `--body-file -` / `--input -`) scrubbed. Reads pass unchanged.
    -> (cmd, input)."""
    cmd = [str(c) for c in cmd]
    if not ghcache.is_write(cmd): return cmd, input
    ns = names() if ns is None else ns
    if not ns: return cmd, input
    tmpdir = tmpdir or RUNS / "scrub_tmp"
    out, i = [], 0
    while i < len(cmd):
        a = cmd[i]
        nxt = cmd[i + 1] if i + 1 < len(cmd) else None
        if a in _TEXT_FLAGS and nxt is not None:
            out += [a, scrub(nxt, ns)]; i += 2; continue
        m = re.match(r"(--(?:title|body|comment|description|message))=(.*)$", a, re.S)
        if m: out.append(m[1] + "=" + scrub(m[2], ns)); i += 1; continue
        if a in ("--body-file", "--input") and nxt is not None:
            if nxt == "-":
                if isinstance(input, str): input = scrub(input, ns)
                out += [a, nxt]
            else: out += [a, _file(nxt, ns, tmpdir)]
            i += 2; continue
        if a in _FIELD and nxt is not None:
            k, sep, v = nxt.partition("=")
            if sep and k in _KEYS:
                v = ("@" + _file(v[1:], ns, tmpdir)) if a in ("-F", "--field") and v.startswith("@") and v != "@-" else scrub(v, ns)
                out += [a, f"{k}={v}"]
            else: out += [a, nxt]
            i += 2; continue
        out.append(a); i += 1
    return out, input

# ---------- state, warning, dashboard ----------
def _load():
    try: return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception: return {}

def _save(d):
    try: RUNS.mkdir(parents=True, exist_ok=True); STATE.write_text(json.dumps(d), encoding="utf-8")
    except OSError: pass

def warn_once(now=None, say=None):
    """No names: ONE warning per day (log line + say). -> True when it warned."""
    now = time.time() if now is None else now
    day, st = time.strftime("%Y-%m-%d", time.localtime(now)), _load()
    if st.get("warned") == day: return False
    st["warned"] = day; _save(st)
    try:
        RUNS.mkdir(parents=True, exist_ok=True)
        with open(RUNS / "privacy_scrub.log", "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(now))} {WARNING}\n")
    except OSError: pass
    if say: say(WARNING)
    return True

def status_line(ns=None):
    """Dashboard line: the count, never the names."""
    ns = names() if ns is None else ns
    st = _load()
    fixed = f" · sweep fixed {st['fixes']}" if st.get("fixes") else ""
    return f"privacy scrub: on ({len(ns)} names){fixed}" if ns else "privacy scrub: no names file · ALARM"

# ---------- the sweep (cloud sessions write with their own gh) ----------
SWEEP_WINDOW_S = 30 * 60
SWEEP_EVERY_S = 10 * 60

def _epoch(iso):
    try: return calendar.timegm(time.strptime(iso, "%Y-%m-%dT%H:%M:%SZ"))
    except (ValueError, TypeError): return 0

def _comment_id(url):
    m = re.search(r"issuecomment-(\d+)", url or "")
    return m[1] if m else None

def sweep(cache, edit_title, edit_comment, now=None, ns=None):
    """Issues/PRs touched in the last 30 min (from the ghcache read, no extra calls): a title or a new comment with a name is
    rewritten through the scrub. edit_title(kind, number, text) / edit_comment(id, text) -> True when the edit worked; a failed edit is
    tried again at the next sweep (the text still holds the name). -> number of fixes."""
    now = time.time() if now is None else now
    ns = names() if ns is None else ns
    if not ns or not cache: return 0
    fixes = 0
    recent = lambda it: now - _epoch(it.get("updatedAt") or it.get("createdAt")) <= SWEEP_WINDOW_S
    for kind, items in (("issue", (cache.get("open") or []) + (cache.get("closed") or [])), ("pr", cache.get("prs") or [])):
        for it in items:
            if not recent(it): continue
            t = it.get("title") or ""
            s = scrub(t, ns)
            if s != t and edit_title(kind, it["number"], s): fixes += 1
            for c in it.get("comments") or []:
                if now - _epoch(c.get("createdAt")) > SWEEP_WINDOW_S: continue
                b, cid = c.get("body") or "", _comment_id(c.get("url"))
                sb = scrub(b, ns)
                if sb != b and cid and edit_comment(cid, sb): fixes += 1
    return fixes

def sweep_due(now=None):
    now = time.time() if now is None else now
    st = _load()
    if now - st.get("sweep_at", 0) < SWEEP_EVERY_S: return False
    st["sweep_at"] = now; _save(st)
    return True

def add_fixes(n):
    if n: st = _load(); st["fixes"] = st.get("fixes", 0) + n; _save(st)
