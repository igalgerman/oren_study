"""Ask the owner questions in Hebrew in a browser page. Usage: ask.py questions.json [--timeout-min N]"""
import html, json, os, sys, threading, time, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer  # threads: an idle browser pre-connect must not block the page

CSS = """
:root{--bg:#f4f5f7;--card:#fff;--fg:#1b1d21;--line:#c9ced6;--sel:#dff3e4;--acc:#1f9d4c;--bad:#d93025}
@media(prefers-color-scheme:dark){:root{--bg:#15171a;--card:#212428;--fg:#eceef1;--line:#454a52;--sel:#1d4a2c;--acc:#2eb85f;--bad:#ff6b5e}}
body{margin:0;background:var(--bg);color:var(--fg);font:19px/1.5 "Segoe UI",Arial,sans-serif}
main{max-width:720px;margin:0 auto;padding:16px}
.card{background:var(--card);border:2px solid var(--line);border-radius:14px;padding:16px;margin:14px 0}
.card.bad{border-color:var(--bad)}
.q{font-weight:bold;font-size:21px;margin-bottom:10px}
label.opt{display:flex;align-items:center;gap:12px;border:2px solid var(--line);border-radius:10px;padding:12px;margin:8px 0;cursor:pointer}
label.opt:has(input:checked){background:var(--sel);border-color:var(--acc)}
input[type=radio],input[type=checkbox]{width:24px;height:24px;flex:none}
input[type=text],textarea{width:100%;box-sizing:border-box;font:inherit;padding:10px;border:2px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg);margin-top:6px}
textarea{min-height:110px}
.err{color:var(--bad);display:none;font-size:17px}.bad .err{display:block}
button{width:100%;font-weight:bold;font-size:24px;font-family:inherit;padding:16px;margin:10px 0 40px;border:0;border-radius:14px;background:var(--acc);color:#fff;cursor:pointer}
"""

JS = """
const D=%s;
document.getElementById('f').addEventListener('submit',async e=>{
 e.preventDefault();const out={};let bad=null;
 D.questions.forEach(q=>{
  const c=document.getElementById('c_'+q.id);let v;
  if(q.free){v=c.querySelector('textarea').value.trim();}
  else{
   const ch=[...c.querySelectorAll('input.o:checked')].map(i=>i.value);
   const ot=q.other?c.querySelector('input.t').value.trim():'';
   if(ot)ch.push(ot);
   v=q.multi?ch:(ch[0]||'');
   if(!ch.length){c.classList.add('bad');bad=bad||c;return;}
  }
  c.classList.remove('bad');out[q.id]=v;});
 if(bad){bad.scrollIntoView({behavior:'smooth',block:'center'});return;}
 const r=await fetch('/answer',{method:'POST',body:JSON.stringify(out)});
 if(r.ok)document.querySelector('main').innerHTML='<div class="card q">תודה! אפשר לסגור את הלשונית.</div>';
});
document.querySelectorAll('.card').forEach(c=>['input','change'].forEach(ev=>c.addEventListener(ev,()=>c.classList.remove('bad'))));
document.querySelectorAll('input.t[data-single]').forEach(t=>t.addEventListener('input',()=>{
 if(t.value)t.closest('.card').querySelectorAll('input.o').forEach(i=>i.checked=false);}));
"""


def page(data):
    e = html.escape
    parts = []
    for q in data["questions"]:
        qid = e(q["id"], True)
        body = ""
        if q.get("free"):
            body = "<textarea></textarea>"
        else:
            kind = "checkbox" if q.get("multi") else "radio"
            for o in q.get("options", []):
                body += ('<label class="opt"><input class="o" type="%s" name="n_%s" value="%s"><span>%s</span></label>'
                         % (kind, qid, e(o, True), e(o)))
            if q.get("other"):
                body += ('<div>אחר:<input class="t" type="text"%s></div>'
                         % ("" if q.get("multi") else ' data-single="1"'))
        parts.append('<div class="card" id="c_%s"><div class="q">%s</div>%s%s<div class="err">צריך לענות על השאלה הזו</div></div>'
                     % (qid, e(q["text"]), ('<details><summary>עוד</summary><p style="white-space:pre-wrap">%s</p></details>' % e(q["details"])) if q.get("details") else "", body))
    intro = "<p>%s</p>" % e(data["intro"]) if data.get("intro") else ""
    title = e(data.get("title", "שאלות"))
    return ('<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1"><title>%s</title><style>%s</style></head>'
            '<body><main><h1>%s</h1>%s<form id="f" novalidate>%s<button type="submit">שלח</button></form></main>'
            '<script>%s</script></body></html>'
            % (title, CSS, title, intro, "".join(parts), JS % json.dumps(data).replace("</", "<\\/")))


def open_browser(url, win=os.name == "nt"):
    """#310: open the page in the owner's default browser, also from a hidden background window.
    Windows: os.startfile (shell default browser), fallback webbrowser.open; elsewhere webbrowser.open. -> opened?"""
    if win:
        try:
            os.startfile(url)
            return True
        except Exception:
            pass
    try:
        return bool(webbrowser.open(url))
    except Exception:
        return False


def main():
    args = sys.argv[1:]
    timeout = 60.0
    if "--timeout-min" in args:
        i = args.index("--timeout-min")
        timeout = float(args[i + 1])
        del args[i:i + 2]
    qfile = args[0]
    with open(qfile, encoding="utf-8") as f:
        data = json.load(f)
    body = page(data).encode("utf-8")
    result = {}
    done = threading.Event()

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if self.path != "/answer":
                self.send_response(404)
                self.end_headers()
                return
            n = int(self.headers.get("Content-Length", 0))
            result["a"] = json.loads(self.rfile.read(n).decode("utf-8"))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ok")
            done.set()

    srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = "http://127.0.0.1:%d/" % srv.server_port
    print(url, file=sys.stderr, flush=True)
    if not os.environ.get("ASK_NO_BROWSER") and not open_browser(url):
        print("could not open the browser: open %s by hand" % url, file=sys.stderr, flush=True)
    sys.stdout.reconfigure(encoding="utf-8")
    if not done.wait(timeout * 60):
        print(json.dumps({"timeout": True}))
        sys.exit(3)
    time.sleep(0.3)
    out = {"answers": result["a"]}
    base = os.path.splitext(qfile)[0]
    with open(base + ".answers.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
