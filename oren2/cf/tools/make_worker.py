#!/usr/bin/env python3
"""Bundle the website (index.html, manifest, icons) and the save API into one Pages _worker.js.
Used for deploys where the asset-upload step is not available."""
import base64,json,pathlib
d=pathlib.Path(__file__).resolve().parent.parent
pub=d/'public'
html=(pub/'index.html').read_text(encoding='utf-8')
man=(pub/'manifest.webmanifest').read_text(encoding='utf-8')
i192=base64.b64encode((pub/'icon-192.png').read_bytes()).decode()
i512=base64.b64encode((pub/'icon-512.png').read_bytes()).decode()
sw=(pub/'sw.js').read_text(encoding='utf-8')
# offline mode on the website only: register the service worker (this copy of the page is never used in Claude or file://)
REG="<script>if('serviceWorker' in navigator&&location.protocol==='https:')addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));</script>"
k=html.rindex('</body>');html=html[:k]+REG+html[k:]
LISTEN=r'''<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>האזנה לקול</title>
<style>body{margin:0;background:#f6f2e8;font-family:system-ui,Arial;color:#222}main{max-width:560px;margin:auto;padding:16px}
h1{font-size:21px;margin:4px 0 2px}.pr{color:#666;font-size:15px;margin:4px 0 10px}.card{background:#fff;border-radius:16px;padding:16px;margin:10px 0}
.sent{font-size:23px;line-height:1.55;margin:6px 0 14px}.sent mark{background:#ffe48a;border-radius:6px;padding:0 3px}
button{font:inherit;border:0;border-radius:14px;cursor:pointer;color:#fff}button:disabled{opacity:.6}
.play{background:#3a8fc4;font-size:22px;padding:14px;width:100%}.row{display:flex;gap:10px;margin-top:12px}.row button{flex:1;font-size:20px;padding:16px 8px}
.ok{background:#4fbf63}.no{background:#e4572e}.var{display:flex;gap:8px;margin:10px 0}.var .play{flex:1;width:auto;font-size:19px;padding:13px}
.var .pick{background:#4fbf63;font-size:17px;padding:13px 14px}.lnk{background:none;color:#3a8fc4;text-decoration:underline;font-size:15px;padding:8px 0}
.w{display:inline-block;background:#eee;color:#222;font-size:21px;padding:6px 10px;margin:4px 3px;border-radius:10px}.w.on{background:#e4572e;color:#fff}
.done{text-align:center;font-size:21px;padding:30px 0}.top{background:#fff3c4;border-radius:10px;padding:6px 10px;font-size:15px;color:#555}
.var .half{background:#f5a623;font-size:16px;padding:13px 10px}.var .half.on{background:#b36b00}.hint{background:#e8f3fb;border-radius:10px;padding:8px 10px;margin:8px 0;font-size:16px}
textarea{width:100%;box-sizing:border-box;font:inherit;font-size:16px;border:1px solid #ccc;border-radius:10px;padding:8px;margin-top:10px;min-height:56px}
.nx{background:#888;font-size:18px;padding:13px;width:100%;margin-top:8px}</style><main id="m">טוען…</main>
<script>
const m=document.getElementById('m');let D,a,mode,ci=0,si=0,marks=[],bad=null;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const HW=/[֐-׿]+/g;
const turl=x=>'/api/tts?t='+encodeURIComponent(x.t)+'&v='+(x.v||'he-IL-Chirp3-HD-Kore')+'&r='+(x.r||0.9)+'&fresh='+D.sid;/* never an old copy from this browser's cache */
const tryurl=t=>'/api/tts/try?t='+encodeURIComponent(t)+'&v=he-IL-Chirp3-HD-Kore&r=0.9';
function play(u,b){if(a)a.pause();a=new Audio(u);if(b){b.disabled=true;a.onended=a.onerror=()=>{b.disabled=false;};}a.play().catch(()=>{if(b)b.disabled=false;});}
let LS={};try{LS=JSON.parse(localStorage.getItem('listen')||'{}');}catch(e){}
const keep=()=>{try{localStorage.setItem('listen',JSON.stringify(LS));}catch(e){}};
function flush(){if(!marks.length)return;const b=JSON.stringify(marks);marks=[];try{if(!navigator.sendBeacon('/api/tts/listen/marks',b))throw 0;}catch(e){fetch('/api/tts/listen/marks',{method:'POST',body:b,keepalive:true});}}
addEventListener('pagehide',flush);document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
async function load(){D=await (await fetch('/api/tts/listen/data')).json();D.votes=D.votes||{};
  D.pend=(D.choose||[]).filter(x=>!((x.id||x.w) in D.votes)).map(x=>({...x,vars:x.vars.slice().sort(()=>Math.random()-.5)}));
  if(LS.sid!==D.sid){LS={sid:D.sid,si:0};keep();}si=LS.si||0;mode=D.pend.length?'c':'s';draw(false);}
function draw(auto){if(mode==='c')choose();else sample(auto);}
const NOTE='הערה (למשל: ב׳ כמעט טוב, אבל ההטעמה בסוף)';
function topBar(){const w=Math.max(0,D.pend.length-ci),s=Math.max(0,(D.sample||[]).length-si);return '<div class="top">ממתינים: '+w+' מילים לבחירה · '+s+' משפטים לבדיקה</div>';}
function choose(){const x=D.pend[ci];if(!x){mode='s';return draw(false);}
  const sub=v=>x.s.replace(HW,t=>t===x.w?v:t),half=new Set();
  m.innerHTML=topBar()+'<h1>איזו גרסה נשמעת נכון?</h1><div class="pr">מילה '+(ci+1)+' מתוך '+D.pend.length+'</div>'+(x.hint?'<div class="hint">לפי ההערה שלך: '+esc(x.hint)+'</div>':'')+'<div class="card"><div class="sent">'+esc(x.s).replace(HW,t=>t===x.w?'<mark>'+t+'</mark>':t)+'</div>'+
   x.vars.map((v,i)=>'<div class="var"><button class="play" data-i="'+i+'">▶ גרסה '+'אבגדה'[i]+'</button><button class="pick" data-i="'+i+'">נכון</button><button class="half" data-i="'+i+'">חצי</button></div>').join('')+
   '<textarea id="nt" placeholder="'+NOTE+'"></textarea><button class="nx" id="none">אף אחת לא נכונה — הבא</button></div><button class="lnk" id="skip">לדלג לבדיקת משפטים</button>';
  const nt=document.getElementById('nt'),nb=document.getElementById('none');
  m.querySelectorAll('.play').forEach(b=>b.onclick=()=>play(tryurl(sub(x.vars[b.dataset.i])),b));
  m.querySelectorAll('.half').forEach(b=>b.onclick=()=>{const v=x.vars[b.dataset.i];half.has(v)?half.delete(v):half.add(v);b.classList.toggle('on');nb.textContent=half.size?'שמירה והבא':'אף אחת לא נכונה — הבא';});
  m.querySelectorAll('.pick').forEach(b=>b.onclick=()=>vote(x.id||x.w,{v:x.vars[b.dataset.i],half:[...half],note:nt.value.trim()}));
  nb.onclick=()=>vote(x.id||x.w,{v:'',half:[...half],note:nt.value.trim()});document.getElementById('skip').onclick=()=>{mode='s';draw(false);};}
function vote(w,o){D.votes[w]=o;fetch('/api/tts/listen/vote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({w,...o})});ci++;draw(false);}
function sample(auto){const L=D.sample||[],x=L[si];
  if(!x){flush();m.innerHTML='<div class="done">סיימת, תודה!<br><small>'+L.length+' משפטים</small></div>';return;}
  const words=bad?esc(x.t).replace(HW,t=>'<span class="w'+(bad.has(t)?' on':'')+'">'+t+'</span>'):esc(x.t);
  m.innerHTML=topBar()+'<h1>'+(bad?'איזו מילה לא טובה?':'איך זה נשמע?')+'</h1><div class="pr">'+(si+1)+' מתוך '+L.length+(bad?' · לגעת במילה (לא חובה)':'')+'</div><div class="card"><div class="sent"'+(/[a-z]/i.test(x.t)&&!/[א-ת]/.test(x.t)?' dir="ltr"':'')+'>'+words+'</div><button class="play" id="pl">▶ השמעה</button>'+
   (bad?'<textarea id="nt" placeholder="'+NOTE+'"></textarea><div class="row"><button class="ok" id="nx">הבא</button></div>':'<div class="row"><button class="ok" id="g">✓ טוב</button><button class="no" id="b">✗ משהו לא טוב</button></div>')+'</div>';
  const pl=document.getElementById('pl');pl.onclick=()=>play(turl(x),pl);if(auto)play(turl(x),pl);
  if(bad){m.querySelectorAll('.w').forEach(s=>s.onclick=()=>{bad.has(s.textContent)?bad.delete(s.textContent):bad.add(s.textContent);s.classList.toggle('on');});
    document.getElementById('nx').onclick=()=>mark(x,false);}
  else{document.getElementById('g').onclick=()=>mark(x,true);document.getElementById('b').onclick=()=>{bad=new Set();sample(false);};}}
function mark(x,ok){const nt=document.getElementById('nt');marks.push({t:x.t,v:x.v,r:x.r,ok,w:bad?[...bad]:[],note:nt?nt.value.trim().slice(0,300):''});bad=null;si++;LS.si=si;keep();if(marks.length>=5)flush();sample(true);}
load().catch(()=>{m.textContent='שגיאה בטעינה';});
</script></html>'''
NUMJS=r'''/* Numbers in Hebrew words for the Hebrew voice (Chirp reads digits badly and without gender agreement).
   A number before a noun agrees with it (NG: m/f), "2" before a noun is שני/שתי; a bare number, a list or arithmetic uses
   the counting (feminine) form; 1:30 → אחת וחצי; + − × : = between numbers → ועוד פחות כפול חלקי שווה; ו-7 → ושבע. */
const NG=(()=>{const g={},add=(s,v)=>s.split(' ').forEach(w=>{g[w]=v;});
 add('נוסעים עמודים שקלים דברים בלוקים גלגלים תפוחים עפרונות ספרים כדורים ילדים צדפים ימים שבועות חלקים צעצועים אפסים כוכבים זוגות מספרים פרחים עצים חתולים כלבים דגים בלונים מטבעות יהלומים צעדים ריבועים משולשים עיגולים כיסאות כסאות סוסים כבשים חודשים לילות תותים ענבים אגסים תפוזים גזרים צבעים קלפים עלים פרפרים צבים ארנבים דובים אריות פילים קופים שירים סיפורים חדרים חלונות מזלגות מטרים ליטרים סנטימטרים קילומטרים תרגילים שלבים שיעורים ציורים ניסויים בניינים תווים שיניים ילד ספר כדור תפוח גלגל צעצוע יום שבוע חודש עמוד שקל בלוק מטר דבר כוכב צעד יהלום בנים אנשים גברים מכתבים פעמונים שולחנות קירות בתים מגדלים אוטובוסים רכבות מטוסים קרונות טורים','m');
 add('עשרות אחדות מאות דקות מדבקות עוגיות אצבעות קבוצות מכוניות שעות חבילות גולות ערמות שניות מילים מלים אותיות משימות נקודות קפיצות פעמים שורות צורות רגליים רגלים ידיים עיניים כנפיים אוזניים נעליים חיות פרות תרנגולות ביצים סוכריות בננות מחברות קוביות אבנים שלוליות נמלים דבורים ג׳ירפות תמונות דלתות קומות מדרגות כפות צלחות כוסות פיצות פרוסות חתיכות ספרות שנים ילדות בנות נשים ציפורים צפורים בובות עגבניות מלפפונים שאלות נשימות תקלות נסיונות עשרת דקה שעה שנייה מילה אות משימה מכונית עוגייה עוגיה אצבע קבוצה שנה ילדה ספרה נקודה תחנות תחנה','f');
 return g;})();
const NF=['אפס','אחת','שתיים','שלוש','ארבע','חמש','שש','שבע','שמונה','תשע','עשר'],NM=['אפס','אחד','שניים','שלושה','ארבעה','חמישה','שישה','שבעה','שמונה','תשעה','עשרה'];
const TF=['','אחת עשרה','שתים עשרה','שלוש עשרה','ארבע עשרה','חמש עשרה','שש עשרה','שבע עשרה','שמונה עשרה','תשע עשרה'],TM=['','אחד עשר','שנים עשר','שלושה עשר','ארבעה עשר','חמישה עשר','שישה עשר','שבעה עשר','שמונה עשר','תשעה עשר'];
const TENS=['','','עשרים','שלושים','ארבעים','חמישים','שישים','שבעים','שמונים','תשעים'],HUN=['','מאה','מאתיים','שלוש מאות','ארבע מאות','חמש מאות','שש מאות','שבע מאות','שמונה מאות','תשע מאות'];
const THC=['','אלף','אלפיים','שלושת אלפים','ארבעת אלפים','חמשת אלפים','ששת אלפים','שבעת אלפים','שמונת אלפים','תשעת אלפים','עשרת אלפים'];
function heNumWords(n,m,before){n=+n;if(!isFinite(n)||n<0||n>=1e6||n!==Math.floor(n))return null;
 if(n===2&&before)return m?'שני':'שתי';if(n===0)return 'אפס';
 const P=[],th=Math.floor(n/1000),h=Math.floor(n%1000/100),r=n%100;
 if(th)P.push(th<=10?THC[th]:heNumWords(th,true,false)+' אלף');if(h)P.push(HUN[h]);
 if(r){if(r<=10)P.push((m?NM:NF)[r]);else if(r<20)P.push((m?TM:TF)[r-10]);else{P.push(TENS[Math.floor(r/10)]);if(r%10)P.push((m?NM:NF)[r%10]);}}
 if(P.length>1)P[P.length-1]='ו'+P[P.length-1];return P.join(' ');}
const OPS={'+':'ועוד','−':'פחות','-':'פחות','×':'כפול','x':'כפול','*':'כפול',':':'חלקי','÷':'חלקי','=':'שווה'};
function heNum(t){if(!/\d/.test(t))return t;
 t=t.replace(/[‎‏]/g,'').replace(/\d{1,3}(?:,\d{3})+(?!\d)/g,x=>x.replace(/,/g,''));
 t=t.replace(/(^|[^\d:])(\d{1,2}):(\d{2})(?![\d:])/g,(x,p,h,mi)=>{h=+h;mi=+mi;if(h>24||mi>59)return x;const H=heNumWords(h,false,false);
  return p+(mi===0?H:mi===30?H+' וחצי':mi===15?H+' ורבע':H+' ו'+heNumWords(mi,false,false));});
 for(let i=0;i<3;i++)t=t.replace(/(\d)\s*([+−×÷=*])\s*(?=\d)/g,(x,a,o)=>a+' '+OPS[o]+' ').replace(/(\d)\s+([-:x])\s+(?=\d)/g,(x,a,o)=>a+' '+OPS[o]+' ');
 t=t.replace(/(\d)[ ]+(?=\d)/g,'$1, ');/* a list of numbers: a short pause between them */
 t=t.replace(/(\d+)\.(\d+)/g,(x,a,b)=>a+' נקודה '+b.split('').join(' '));
 return t.replace(/(?<![\dA-Za-zא-ת])(?:([ובלמהכש])-\s?)?(\d+)/g,(x,pre,d,off,all)=>{
  const nx=/^\s+([א-ת][א-ת׳"']*)/.exec(all.slice(off+x.length));const g=nx&&NG[nx[1]];
  const w=heNumWords(d,g==='m',!!g);return w==null?x:(pre||'')+w;});}
'''
js='''const HTML=%s;const LISTEN=%s;%sconst MAN=%s;const SW=%s;const IC={'/icon-192.png':'%s','/icon-512.png':'%s'};
const JH={'content-type':'application/json','cache-control':'no-store'};
/* Storage (#71): Cloudflare D1 (free ~100k row writes a day) instead of Workers KV (1k writes a day). Reads: D1 first, then the old KV
   data (copied to D1 on read); writes: D1 only. No D1 binding (tests, old deploys) = plain KV. Tables: saves(id,data,updated),
   tts_audio(key,bin,created), meta(k,v) for counters and settings. */
const isId=k=>/^[a-f0-9]{32}$/.test(k);const tbl=k=>isId(k)?'saves':/^tts:/.test(k)?'tts_audio':'meta';
const TC={saves:['id','data'],tts_audio:['key','bin'],meta:['k','v']};let dbReady=false;
async function dbInit(env){if(dbReady||!env.DB.exec)return;await env.DB.exec("CREATE TABLE IF NOT EXISTS tts_audio(key TEXT PRIMARY KEY,bin BLOB,created INTEGER);CREATE TABLE IF NOT EXISTS saves(id TEXT PRIMARY KEY,data TEXT,updated INTEGER);CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT);");dbReady=true;}
const toAB=b=>b instanceof ArrayBuffer?b:Array.isArray(b)?new Uint8Array(b).buffer:ArrayBuffer.isView(b)?b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength):b;
async function dbPut(env,k,v){await dbInit(env);const t=tbl(k),c=TC[t];
 await env.DB.prepare('INSERT INTO '+t+'('+c[0]+','+c[1]+(t==='meta'?'':','+(t==='saves'?'updated':'created'))+') VALUES(?,?'+(t==='meta'?'':',?')+') ON CONFLICT('+c[0]+') DO UPDATE SET '+c[1]+'=excluded.'+c[1])
  .bind(...(t==='meta'?[k,String(v)]:[k,t==='tts_audio'?toAB(v):String(v),Date.now()])).run();}
async function kvGet(env,k,type){
 if(!env.DB)return env.SAVES.get(k,type);
 await dbInit(env);const t=tbl(k),c=TC[t];
 const r=await env.DB.prepare('SELECT '+c[1]+' FROM '+t+' WHERE '+c[0]+'=?').bind(k).first();
 if(r&&r[c[1]]!=null){const x=r[c[1]];return type==='arrayBuffer'?toAB(x):type==='json'?JSON.parse(x):x;}
 const o=await env.SAVES.get(k,type==='arrayBuffer'?'arrayBuffer':undefined);
 if(o!=null){try{await dbPut(env,k,o);}catch(e){}return type==='json'?JSON.parse(o):o;}
 return null;}
async function kvPut(env,k,v,o){if(!env.DB)return env.SAVES.put(k,v,o);return dbPut(env,k,v);}
const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function api(req,env,id){if(!/^[a-f0-9]{32}$/.test(id))return new Response('{"error":"bad id"}',{status:400,headers:JH});
 if(req.method==='GET'){const v=await kvGet(env,id);return v?new Response(v,{headers:JH}):new Response('{}',{status:404,headers:JH});}
 if(req.method==='PUT'){const t=await req.text();if(t.length>300000)return new Response('{"error":"too big"}',{status:413,headers:JH});
  try{const o=JSON.parse(t);if(!o||typeof o!=='object'||o.v!==4)throw 0;}catch(e){return new Response('{"error":"bad json"}',{status:400,headers:JH});}
  try{await kvPut(env,id,t);}catch(e){return J({error:'store',why:String(e&&e.message||e).slice(0,200)},503);}/* e.g. the daily write limit: the game shows the real reason (#129) */
  return new Response('{"ok":true}',{headers:JH});}
 return new Response('{"error":"method"}',{status:405,headers:JH});}
/* /api/diag (#129): when all save retries fail, the game posts {fam,log,snap} (rolling sync log + DOM snapshot) for the orchestrator.
   D1 table diag (kept 30 days); no D1 or D1 refuses (e.g. its write limit) = KV key diag:<time>. GET (needs the DIAG_KEY secret) = newest 20 without snapshots, ?id= = one record; at most 200 records are kept. */
async function diag(req,env,u){
 if(req.method==='POST'){const t=await req.text();if(t.length>20000)return J({error:'too big'},413);let o;
  try{o=JSON.parse(t);if(!o||!isId(String(o.fam))||!Array.isArray(o.log)||typeof o.snap!=='string')throw 0;}catch(e){return J({error:'bad request'},400);}
  const at=Date.now(),log=JSON.stringify(o.log.slice(-50)),fam=(await sha(String(o.fam))).slice(0,6);/* only a short hash of the family id is kept: the id itself is the save secret */
  if(env.DB)try{if(env.DB.exec)await env.DB.exec("CREATE TABLE IF NOT EXISTS diag(id INTEGER PRIMARY KEY AUTOINCREMENT,fam TEXT,at INTEGER,log TEXT,snap TEXT);");
   const r=await env.DB.prepare('INSERT INTO diag(fam,at,log,snap) VALUES(?,?,?,?)').bind(fam,at,log,o.snap).run();
   try{await env.DB.prepare('DELETE FROM diag WHERE at<?').bind(at-30*864e5).run();await env.DB.prepare('DELETE FROM diag WHERE id NOT IN (SELECT id FROM diag ORDER BY id DESC LIMIT 200)').bind().run();}catch(e){}
   return J({ok:true,id:String(r&&r.meta&&r.meta.last_row_id||at)});}catch(e){}
  try{const k='diag:'+at;await env.SAVES.put(k,JSON.stringify({fam,at,log,snap:o.snap}),{expirationTtl:30*86400});
   try{const old=((await env.SAVES.list({prefix:'diag:'})).keys||[]).map(x=>x.name).sort().reverse().slice(200);for(const x of old)await env.SAVES.delete(x);}catch(e){}
   return J({ok:true,id:k});}catch(e){return J({error:'store'},503);}}
 if(req.method!=='GET')return J({error:'method'},405);
 const key=req.headers.get('x-admin-key')||u.searchParams.get('key')||'';/* GET = parent/admin only: env DIAG_KEY (a secret set in Cloudflare); unset = always refused */
 if(!env.DIAG_KEY||key!==env.DIAG_KEY)return J({error:'unauthorized'},401);
 const id=u.searchParams.get('id');const out=x=>({id:String(x.id),fam:x.fam,at:x.at,log:JSON.parse(x.log||'[]'),snap:x.snap,snapLen:x.snapLen});
 if(id){let x=null;if(/^diag:\\d+$/.test(id)){const v=await env.SAVES.get(id);if(v)x={id,...JSON.parse(v)};}
  else if(env.DB&&/^\\d+$/.test(id))try{x=await env.DB.prepare('SELECT id,fam,at,log,snap FROM diag WHERE id=?').bind(+id).first();}catch(e){}
  return x?J(out(x)):J({error:'not found'},404);}
 let L=[];if(env.DB)try{L=((await env.DB.prepare('SELECT id,fam,at,log,length(snap) AS snapLen FROM diag ORDER BY id DESC LIMIT ?').bind(20).all()).results||[]);}catch(e){}
 try{const ks=((await env.SAVES.list({prefix:'diag:'})).keys||[]).map(k=>k.name).sort().reverse().slice(0,20);
  for(const k of ks){const v=JSON.parse(await env.SAVES.get(k));L.push({id:k,fam:v.fam,at:v.at,log:v.log,snapLen:(v.snap||'').length});}}catch(e){}
 return J(L.sort((a,b)=>b.at-a.at).slice(0,20).map(out));}
/* Google voice (game voice: Chirp3-HD Kore at 0.9), every sentence created once and kept forever in KV,
   plus a monthly character cap far below Google's free tier. */
const TTS_CAP=250000;const GAME_VOICE='he-IL-Chirp3-HD-Kore',GAME_RATE=0.9;const VOICES=/^(he-IL-((Standard|Wavenet)-[A-D]|Chirp3-HD-[A-Za-z]+)|en-US-Chirp3-HD-[A-Za-z]+)$/;
async function sha(t){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function tts(req,env,u){if(!env.GOOGLE_TTS_KEY)return new Response('{"ok":false,"why":"no key"}',{status:503,headers:JH});
 if(u.pathname==='/api/tts/status')return J({ok:true,ver:await ttsVer(env)});/* the game adds &k=ver to its audio URLs: a bump = fresh audio everywhere */
 if(u.pathname==='/api/tts/ver'&&req.method==='POST'){const v=(await ttsVer(env,true))+1;await kvPut(env,'ttsver',String(v));verV=v;verAt=Date.now();return J({ok:true,ver:v});}
 if(u.pathname==='/api/tts/gm'){if(!env.GEMINI_KEY)return new Response('{"ok":false,"why":"no GEMINI_KEY"}',{status:503,headers:JH});const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',{headers:{'x-goog-api-key':env.GEMINI_KEY}});const j=await r.json();return new Response(JSON.stringify((j.models||[]).map(m=>m.name).filter(n=>/gemini/.test(n))),{status:r.status,headers:JH});}
 if(u.pathname==='/api/tts/verify'&&req.method==='POST'){/* Gemini listens to the stored audio and reports pronunciation */
  if(!env.GEMINI_KEY)return new Response('{"ok":false,"why":"no GEMINI_KEY"}',{status:503,headers:JH});
  const b=await req.json();const t=String(b.t||'').slice(0,400),v=b.v||'he-IL-Chirp3-HD-Kore',rt=+b.r||0.9,want=String(b.n||t);
  const au=b.fresh?await tryTts(env,t,v,rt):await tts(req,env,new URL(u.origin+'/api/tts?t='+encodeURIComponent(t)+'&v='+encodeURIComponent(v)+'&r='+rt));if(!au.ok)return new Response(JSON.stringify({ok:false,why:'audio '+au.status}),{status:502,headers:JH});
  const buf=new Uint8Array(await au.arrayBuffer());let bin='';for(let i=0;i<buf.length;i+=8192)bin+=String.fromCharCode.apply(null,buf.subarray(i,i+8192));
  const prompt=b.blind?(v.startsWith('en-')?'Transcribe exactly what is said in this recording, by its sounds, even if a word sounds wrong or makes no sense. Do not correct or guess from context. Reply JSON {"heard":"<transcript>"}':
    'תמלל בדיוק את מה שנשמע בהקלטה, בניקוד מלא, לפי הצלילים בפועל — גם אם יוצאת מילה אחרת ממה שהגיוני או משפט בלי היגיון. אל תתקן ואל תנחש לפי ההקשר: אם נשמע אַחְדוּת כתוב אַחְדוּת, אם נשמע אֲחָדוֹת כתוב אֲחָדוֹת. מספרים כתוב במילים, בדיוק כפי שנאמרו (למשל שְׁלוֹשָׁה או שָׁלוֹשׁ). החזר JSON בלבד: {"heard":"<התמלול בניקוד מלא>"}'):v.startsWith('en-')?('Listen. The speaker should say exactly: "'+want+'". Reply JSON {"heard":"<exact transcript>","ok":true|false,"issues":[{"word":"","heard_as":"","note":""}]} — ok=false if any word is mispronounced, unclear, skipped or added, or the stress is clearly wrong.'):
   ('הקשב להקלטה בעברית. הדובר אמור לומר בדיוק: "'+want+'". החזר JSON בלבד: {"heard":"<תמלול מדויק עם ניקוד מלא של מה שנאמר בפועל>","ok":true|false,"issues":[{"word":"<המילה בטקסט>","heard_as":"<איך נשמעה, בניקוד>","expected":"<ההגייה הנכונה בניקוד>","note":"<הסבר קצר>"}]}. ok=false אם מילה כלשהי נהגתה בתנועות שגויות, בהטעמה שגויה ברורה, דולגה, נוספה או לא ברורה. היה מחמיר — זה משחק לימודי לילד.');
  const g=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+(b.m||'gemini-2.5-flash')+':generateContent',{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':env.GEMINI_KEY},
   body:JSON.stringify({contents:[{parts:[{inline_data:{mime_type:'audio/mp3',data:btoa(bin)}},{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0}})});
  const gj=await g.json();const txt=((((gj.candidates||[])[0]||{}).content||{}).parts||[]).map(x=>x.text||'').join('');let res=null;try{res=JSON.parse(txt);}catch(e){}
  return new Response(JSON.stringify({ok:g.ok,status:g.status,res,raw:res?undefined:(txt||gj).toString().slice(0,500),err:gj.error&&gj.error.message}),{status:200,headers:JH});}
 if(u.pathname==='/api/tts/nikud'&&req.method==='POST'){/* text only: Gemini vocalizes up to 25 game sentences by their meaning (the intended reading) */
  if(!env.GEMINI_KEY)return new Response('{"ok":false,"why":"no GEMINI_KEY"}',{status:503,headers:JH});
  const b=await req.json();const L=(Array.isArray(b.texts)?b.texts:[]).slice(0,25).map(x=>String(x).slice(0,400));
  const prompt='אלה משפטים ממשחק לימודי בעברית לילד בכיתה א׳-ב׳ (חשבון, קריאה, סיפורים). נקד כל משפט בניקוד מלא ומדויק לפי המשמעות בהקשר (למשל: 4 עֲשָׂרוֹת ו-7 אֲחָדוֹת, סְפָרוֹת של מספר). אל תשנה אותיות, מילים או סימנים — רק הוסף ניקוד. מספרים בספרות כתוב במילים מנוקדות, כפי שצריך לומר אותם בקול בעברית תקנית (התאמת מין לשם העצם שאחריהם, ו-2 לפני שם עצם = שְׁנֵי/שְׁתֵּי; מספר בודד או בתרגיל — בצורת הספירה: שָׁלוֹשׁ, שְׁתַּיִם). סימני חשבון כתוב במילים (וְעוֹד, פָּחוֹת, כָּפוּל, חֶלְקִי, שָׁוֶה). החזר JSON בלבד: מערך של מחרוזות באותו סדר ובאותו אורך. המשפטים: '+JSON.stringify(L);
  const g=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+(b.m||'gemini-3-flash-preview')+':generateContent',{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':env.GEMINI_KEY},
   body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0}})});
  const gj=await g.json();const txt=((((gj.candidates||[])[0]||{}).content||{}).parts||[]).map(x=>x.text||'').join('');let res=null;try{res=JSON.parse(txt);}catch(e){}
  return new Response(JSON.stringify({ok:g.ok,status:g.status,res,err:gj.error&&gj.error.message}),{status:200,headers:JH});}
 if(u.pathname==='/api/tts/respell'&&req.method==='POST'){/* text only: new respellings for a word Chirp misreads, following the parent's note */
  if(!env.GEMINI_KEY)return new Response('{"ok":false,"why":"no GEMINI_KEY"}',{status:503,headers:JH});
  const b=await req.json();const q=k=>String(b[k]||'').slice(0,300);
  const prompt='קול הקראה עברי (Google Chirp3) מתעלם כמעט לגמרי מניקוד, ולכן מתקנים הגייה בכתיב חלופי באותיות בלבד (למשל אחדות נקראה אַחְדוּת, והכתיב אחאדות נקרא נכון אֲחָדוֹת). המילה: "'+q('w')+'" במשפט: "'+q('s')+'". ההגייה הרצויה: '+q('want')+'. כתיבים שכבר נוסו: '+JSON.stringify(b.tried||[])+'. כתיבים שנשמעו "חצי נכון": '+JSON.stringify(b.half||[])+'. הערת ההורה שהאזין: "'+q('note')+'". הצע 3 כתיבים חדשים ושונים זה מזה (אותיות עבריות בלבד, מותר מקף), שלא נוסו, לפי ההערה — למשל אמות קריאה (א/ו/י), הכפלת אות, החלפת אות דומה בצליל (ס/ש, כ/ח, ת/ט), או מקף בין הברות כדי להזיז הטעמה. החזר JSON בלבד: מערך של 3 מחרוזות.';
  const g=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+(b.m||'gemini-3-flash-preview')+':generateContent',{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':env.GEMINI_KEY},
   body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.4}})});
  const gj=await g.json();const txt=((((gj.candidates||[])[0]||{}).content||{}).parts||[]).map(x=>x.text||'').join('');let res=null;try{res=JSON.parse(txt);}catch(e){}
  return new Response(JSON.stringify({ok:g.ok,status:g.status,res,err:gj.error&&gj.error.message}),{status:200,headers:JH});}
 if(u.pathname==='/api/tts/review'){if(req.method==='POST'){await kvPut(env,'ttsreview',await req.text());return new Response('{"ok":true}',{headers:JH});}
  const d=await kvGet(env,'ttsreview','json')||[];
  const html=`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>בדיקת הגייה</title><style>body{font-family:system-ui,Arial;margin:0;padding:16px;background:#f6f2e8}main{max-width:640px;margin:auto}h1{font-size:22px}.c{background:#fff;border-radius:12px;padding:10px 12px;margin:8px 0;display:flex;gap:10px;align-items:flex-start}.c.bad{border-right:6px solid #e4572e}.c.fix{border-right:6px solid #4fbf63}.c b{display:block;font-size:17px}.c small{color:#666;display:block}button{font-size:18px;border:0;border-radius:10px;background:#3a8fc4;color:#fff;padding:8px 12px;cursor:pointer}.f{margin:8px 0}.f button{background:#888;font-size:14px;padding:6px 10px}.f button.on{background:#333}</style><main><h1>בדיקת הגייה של הקולות</h1><p id="s"></p><div class="f"><button class="on" onclick="f('all',this)">הכל</button><button onclick="f('bad',this)">בעייתיים</button><button onclick="f('fix',this)">תוקנו</button><button onclick="f('ok',this)">תקינים</button></div><div id="l"></div></main>
<script>const D=${JSON.stringify(d)};let a,F='all';function draw(){const L=D.filter(x=>F==='all'||x.st===F);document.getElementById('s').textContent='נבדקו '+D.length+' · תקינים '+D.filter(x=>x.st==='ok').length+' · תוקנו '+D.filter(x=>x.st==='fix').length+' · בעייתיים '+D.filter(x=>x.st==='bad').length;
document.getElementById('l').innerHTML=L.map((x,i)=>'<div class="c '+x.st+'"><button onclick="pl('+D.indexOf(x)+')">▶</button><div><b>'+x.n+'</b>'+(x.note?'<small>'+x.note+'</small>':'')+'</div></div>').join('');}
function f(k,b){F=k;document.querySelectorAll('.f button').forEach(x=>x.classList.toggle('on',x===b));draw();}
function pl(i){const x=D[i];if(a)a.pause();a=new Audio('/api/tts?t='+encodeURIComponent(x.t)+'&v='+(x.v||'he-IL-Chirp3-HD-Kore')+'&r='+(x.r||0.9));a.play();}draw();</script></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});}
 if(u.pathname==='/api/tts/check'){/* diagnose: what the game sends vs with nikud vs browser voice, with timing */
  const S=[['בארץ הבלוקים, כל המספרים חיו בשלום.','בְּאֶרֶץ הַבְּלוֹקִים, כָּל הַמִּסְפָּרִים חָיוּ בְּשָׁלוֹם.'],['שלום אורן! מה בא לך היום?','שָׁלוֹם אוֹרֶן! מָה בָּא לְךָ הַיּוֹם?'],['כל הכבוד! עשית את זה בעצמך.','כָּל הַכָּבוֹד! עָשִׂיתָ אֶת זֶה בְּעַצְמְךָ.'],['כמה זה שבע ועוד חמש?','כַּמָּה זֶה שֶׁבַע וְעוֹד חָמֵשׁ?']];
  const html=`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>בדיקת קול</title><style>body{font-family:system-ui,Arial;margin:0;padding:16px;background:#f6f2e8}main{max-width:560px;margin:auto}h1{font-size:22px}.c{background:#fff;border-radius:12px;padding:12px;margin:10px 0}.c p{font-size:18px;margin:0 0 8px}button{font-size:16px;padding:10px 12px;border:0;border-radius:10px;color:#fff;margin:4px;cursor:pointer}.a{background:#3a8fc4}.b{background:#4fbf63}.br{background:#888}small{color:#666;display:block;margin-top:4px}</style><main><h1>בדיקת קול — מה שמעת במשחק?</h1><p>לכל משפט 3 כפתורים. תגיד לי איזה מהם דומה למה ששמעת במשחק, ואיזה הכי טוב.</p>${S.map((x,i)=>`<div class="c"><p>${x[1]}</p><button class="a" onclick="g(${i},0,this)">א · Kore כמו במשחק</button><button class="b" onclick="g(${i},1,this)">ב · Kore עם ניקוד</button><button class="br" onclick="br(${i})">ג · קול הדפדפן</button><small id="t${i}"></small></div>`).join('')}</main>
<script>const S=${JSON.stringify(S)};let a;function g(i,k,b){if(a)a.pause();speechSynthesis.cancel();const t0=performance.now();a=new Audio('/api/tts?t='+encodeURIComponent(S[i][k])+'&v=he-IL-Chirp3-HD-Kore&r=0.9');a.onplaying=()=>{document.getElementById('t'+i).textContent='התחיל אחרי '+((performance.now()-t0)/1000).toFixed(1)+' שניות';};a.onerror=()=>{document.getElementById('t'+i).textContent='שגיאה';};a.play();}
function br(i){if(a)a.pause();speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(S[i][0]);u.lang='he-IL';u.rate=.92;speechSynthesis.speak(u);document.getElementById('t'+i).textContent='זה קול הדפדפן (הגיבוי)';}</script></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});}
 if(u.pathname==='/api/tts/top3'){/* final 3, blind, longer real passages */
  const F=['Kore','Sulafat','Leda'];
  const S=[['סיפור','לפני הרבה זמן, בממלכה רחוקה, גר דרקון קטן בשם ניצוץ. ניצוץ אהב מאוד מספרים. בכל בוקר הוא ספר את הכוכבים שנשארו בשמיים: אחד, שתיים, שלוש. יום אחד הוא גילה שכוכב אחד חסר. אתה מוכן לעזור לו למצוא אותו?'],['עידוד','כמעט! זה לא נורא לטעות, ככה לומדים. בוא ננסה עוד פעם ביחד. יופי! הצלחת! אני גאה בך.']];
  const html=`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>גמר קולות</title><style>body{font-family:system-ui,Arial;margin:0;padding:16px;background:#f6f2e8;text-align:center}main{max-width:560px;margin:auto}h1{font-size:24px;margin:8px 0}.st{color:#555;font-size:16px;margin-bottom:12px}.c{background:#fff;border-radius:14px;padding:14px;margin:12px 0;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center}.c h2{width:100%%;margin:0;font-size:22px}.big{font-size:19px;padding:12px 16px;border:0;border-radius:12px;cursor:pointer;color:#fff}.pl{background:#3a8fc4}.pl.on{background:#f5a623}.ch{background:#4fbf63;width:100%%}.w{font-size:34px;font-weight:900;color:#2e7d32}</style><main id="m"></main>
<script>const F=${JSON.stringify(F)},S=${JSON.stringify(S)};let a;const m=document.getElementById('m');const L=F.slice().sort(()=>Math.random()-.5);
function url(v,i){return '/api/tts?t='+encodeURIComponent(S[i][1])+'&v=he-IL-Chirp3-HD-'+v+'&r=0.9';}
function play(v,i,b){if(a)a.pause();document.querySelectorAll('.pl').forEach(x=>x.classList.remove('on'));b.classList.add('on');a=new Audio(url(v,i));a.onended=()=>b.classList.remove('on');a.play();}
F.forEach(v=>S.forEach((x,i)=>fetch(url(v,i))));
m.innerHTML='<h1>גמר: 3 קולות</h1><div class="st">השמות מוסתרים. שמע כל קול בסיפור ארוך ובעידוד, כמו במשחק אמיתי, ובחר אחד.</div>'+L.map((v,n)=>'<div class="c"><h2>קול '+'אבג'[n]+'</h2>'+S.map((x,i)=>'<button class="big pl" data-n="'+n+'" data-i="'+i+'">▶ '+x[0]+'</button>').join('')+'<button class="big ch" data-n="'+n+'">זה הקול</button></div>').join('');
m.querySelectorAll('.pl').forEach(b=>b.onclick=()=>play(L[b.dataset.n],+b.dataset.i,b));
m.querySelectorAll('.ch').forEach(b=>b.onclick=()=>{if(a)a.pause();m.innerHTML='<h1>בחרת:</h1><div class="w">'+L[b.dataset.n]+'</div><p>כתוב לי את השם בצ׳אט.</p><p>אם אתה מתלבט בין שניים, השמע את שניהם לאורן ותן לו לבחור.</p><button class="big pl" onclick="location.reload()">להתחיל מחדש</button>';});
</script></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});}
 if(u.pathname==='/api/tts/final'){/* blind "which is nicer, A or B" process: the winner stays, a new voice challenges it */
  const F=['Sulafat','Leda','Achernar','Despina','Aoede','Laomedeia','Kore'];
  const S=['שלום אורן! היום נצא יחד למסע בממלכת המספרים. מוכן?','כמה זה שבע ועוד חמש? נסה לספור על האצבעות.','החתול הקטן ישן על הכיסא, ואז קפץ אל החלון.'];
  const html=`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>בחירת קול</title><style>body{font-family:system-ui,Arial;margin:0;padding:16px;background:#f6f2e8;text-align:center}main{max-width:520px;margin:auto}h1{font-size:24px;margin:8px 0}.st{color:#666;font-size:16px}.s{background:#fff;border-radius:12px;padding:12px;margin:14px 0;font-size:18px}.pair{display:flex;gap:12px}.pair>div{flex:1;background:#fff;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px}.big{font-size:22px;padding:14px;border:0;border-radius:12px;cursor:pointer;color:#fff}.pl{background:#3a8fc4}.ch{background:#4fbf63}.pl.on{background:#f5a623}h2{margin:0;font-size:22px}.w{font-size:34px;font-weight:900;color:#2e7d32}.lnk{background:none;border:0;color:#3a8fc4;font-size:16px;text-decoration:underline;cursor:pointer;margin-top:12px}</style><main id="m"></main>
<script>const F=${JSON.stringify(F)},S=${JSON.stringify(S)};let champ=F[0],k=1,a,hist=[];const m=document.getElementById('m');
function url(v,i){return '/api/tts?t='+encodeURIComponent(S[i])+'&v=he-IL-Chirp3-HD-'+v+'&r=0.9';}
function play(v,i,b){if(a)a.pause();document.querySelectorAll('.pl').forEach(x=>x.classList.remove('on'));if(b)b.classList.add('on');a=new Audio(url(v,i));a.onended=()=>b&&b.classList.remove('on');a.play();}
F.forEach(v=>S.forEach((x,i)=>fetch(url(v,i))));/* warm up so every button plays at once */
function step(){if(k>=F.length)return done();const ch=F[k],i=(k-1)%%3;const L=Math.random()<.5?[champ,ch]:[ch,champ];
  m.innerHTML='<h1>איזה קול יותר נעים לאורן?</h1><div class="st">שלב '+k+' מתוך '+(F.length-1)+' · השמות מוסתרים כדי לבחור רק לפי האוזן</div><div class="s">'+S[i]+'</div><div class="pair">'+L.map((v,n)=>'<div><h2>קול '+'אב'[n]+'</h2><button class="big pl" data-n="'+n+'">▶ השמעה</button><button class="big ch" data-n="'+n+'">זה יותר טוב</button></div>').join('')+'</div>'+(hist.length?'<button class="lnk" id="bk">חזרה שלב אחד</button>':'');
  m.querySelectorAll('.pl').forEach(b=>b.onclick=()=>play(L[b.dataset.n],i,b));m.querySelectorAll('.ch').forEach(b=>b.onclick=()=>{hist.push(champ);champ=L[b.dataset.n];k++;step();});
  const bk=document.getElementById('bk');if(bk)bk.onclick=()=>{champ=hist.pop();k--;step();};}
function done(){m.innerHTML='<h1>הקול שבחרת:</h1><div class="w">'+champ+'</div><p>האזן לו עוד פעם בשלושת המשפטים:</p>'+S.map((x,i)=>'<button class="big pl" style="width:100%%;margin:6px 0" data-i="'+i+'">▶ '+['סיפור','תרגיל','קריאה'][i]+'</button>').join('')+'<p>אם הוא מתאים, כתוב לי בצ׳אט: <b>'+champ+'</b></p><button class="lnk" id="re">להתחיל מחדש</button>';
  m.querySelectorAll('.pl').forEach(b=>b.onclick=()=>play(champ,+b.dataset.i,b));document.getElementById('re').onclick=()=>{champ=F[0];k=1;hist=[];step();};}
step();</script></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});}
 if(u.pathname==='/api/tts/page'){const r=await fetch('https://texttospeech.googleapis.com/v1/voices?languageCode=he-IL',{headers:{'x-goog-api-key':env.GOOGLE_TTS_KEY}});const j=await r.json();
  const T='שלום אורן! היום נלמד יחד. החתול ישן על הכיסא. כמה זה שלוש ועוד ארבע? נכון, שבע!';
  const vs=(j.voices||[]).filter(v=>/Chirp3-HD|Wavenet/.test(v.name)).sort((a,b)=>(a.ssmlGender>b.ssmlGender?-1:1)||a.name.localeCompare(b.name));
  const row=v=>`<div class="r" data-v="${v.name}"><button onclick="p('${v.name}',this)">▶</button><b>${v.name.replace('he-IL-','').replace('Chirp3-HD-','')}</b><span>${v.ssmlGender==='MALE'?'גבר':'אישה'} · ${/Chirp3/.test(v.name)?'חדש':'WaveNet'}${v.name==='he-IL-Wavenet-D'?' · גבר 2':''}</span><i class="st">${[1,2,3,4,5].map(n=>`<a onclick="rate('${v.name}',${n})" data-n="${n}">★</a>`).join('')}</i></div>`;
  const html=`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>בחירת קול</title><style>body{font-family:system-ui,Arial;margin:16px;background:#f6f2e8}h1{font-size:22px}.r{display:flex;gap:12px;align-items:center;background:#fff;margin:6px 0;padding:8px 12px;border-radius:10px}button{font-size:20px;width:48px;height:40px;border:0;border-radius:8px;background:#4fbf63;color:#fff;cursor:pointer}b{min-width:120px}span{color:#666;min-width:110px}.st{margin-inline-start:auto;font-style:normal;white-space:nowrap}.st a{font-size:26px;color:#ccc;cursor:pointer;padding:0 2px}.st a.on{color:#f5b400}#sum{background:#fff;border-radius:10px;padding:12px;margin-top:16px}#sum textarea{width:100%%;height:120px;font-size:14px;direction:rtl}#sum button{width:auto;padding:0 16px;font-size:16px}@media(max-width:600px){.r{flex-wrap:wrap}.st{width:100%%}}</style>
<h1>בחירת קול — לחצו ▶ להאזנה</h1><p>המשפט: ${T}</p>${vs.map(row).join('')}<div id="sum"><b>הדירוג שלך</b> (נשמר בדפדפן הזה)<textarea id="out" readonly></textarea><button onclick="navigator.clipboard.writeText(document.getElementById('out').value).then(()=>this.textContent='הועתק ✓')">העתקת הדירוג</button></div><script>let R={};try{R=JSON.parse(localStorage.getItem('voiceRate')||'{}')}catch(e){}function draw(){document.querySelectorAll('.r').forEach(r=>{const n=R[r.dataset.v]|0;r.querySelectorAll('.st a').forEach(x=>x.classList.toggle('on',+x.dataset.n<=n));});const L=Object.entries(R).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).map(([v,n])=>'★'.repeat(n)+' '+v.replace('he-IL-','').replace('Chirp3-HD-',''));document.getElementById('out').value=L.length?'דירוג קולות:'+String.fromCharCode(10)+L.join(String.fromCharCode(10)):'עוד לא דירגת';}function rate(v,n){R[v]=R[v]===n?0:n;try{localStorage.setItem('voiceRate',JSON.stringify(R))}catch(e){}draw();}draw();let a;function p(v,b){if(a)a.pause();b.textContent='…';a=new Audio('/api/tts?t='+encodeURIComponent(${JSON.stringify(T)})+'&v='+v+'&r=1');a.onplaying=()=>b.textContent='▶';a.onerror=()=>b.textContent='✕';a.play();}</script></html>`;
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});}
 if(u.pathname==='/api/tts/voices'){const lang=/^[a-z]{2}-[A-Z]{2}$/.test(u.searchParams.get('lang')||'')?u.searchParams.get('lang'):'he-IL';
  const r=await fetch('https://texttospeech.googleapis.com/v1/voices?languageCode='+lang,{headers:{'x-goog-api-key':env.GOOGLE_TTS_KEY}});return new Response(await r.text(),{status:r.status,headers:JH});}
 if(u.pathname==='/api/tts/fix')return fix(req,env);
 if(u.pathname.startsWith('/api/tts/listen'))return listen(req,env,u);
 if(u.pathname==='/api/tts/try'){const t=(u.searchParams.get('t')||'').slice(0,400).trim(),v=u.searchParams.get('v')||GAME_VOICE,rt=Math.min(1.3,Math.max(.7,+u.searchParams.get('r')||GAME_RATE));if(!t||!VOICES.test(v))return J({error:'bad request'},400);return tryTts(env,t,v,rt);}
 if(u.pathname==='/api/tts/pregen')return pregen(req,env);
 if(u.pathname==='/api/tts/queue')return queue(req,env);
 if(u.pathname==='/api/tts/list')return list(req,env);
 if(u.pathname==='/api/tts/en')return enPage();
 const text=(u.searchParams.get('t')||'').slice(0,400).trim(),voice=u.searchParams.get('v')||GAME_VOICE,rate=Math.min(1.3,Math.max(.7,+u.searchParams.get('r')||GAME_RATE));
 if(!text||!VOICES.test(voice))return new Response('{"error":"bad request"}',{status:400,headers:JH});
 const key=await ttsKey(voice,rate,text);
 const hit=await kvGet(env,key,'arrayBuffer');if(hit)return new Response(hit,{headers:AH});
 if(req.headers.get('x-cache-only'))return new Response('{"ok":false,"why":"not made yet"}',{status:404,headers:JH});/* "download all voices" never creates new sentences */
 const du=await dayUsed(env);if(du>=dayBudget(env))return overBudget();
 const month=monthKey();const used=+(await kvGet(env,month))||0;
 if(used+text.length>TTS_CAP)return new Response('{"ok":false,"why":"monthly cap"}',{status:429,headers:JH});
 const bin=await synth(env,voice,rate,text);if(!bin.length)return new Response(JSON.stringify({ok:false,why:'google '+bin.status}),{status:502,headers:JH});
 await kvPut(env,key,bin);await kvPut(env,month,String(used+text.length),{expirationTtl:60*60*24*62});
 await dayPut(env,du+1);
 return new Response(bin,{headers:AH});}
/* English voice for the game's English words: blind "A or B" like /api/tts/final (winner stays, a new voice challenges it) */
function enPage(){const F=['Kore','Leda','Sulafat','Aoede','Achernar','Despina'];
 const S=['cat','Apple. A is for apple.',"Good job! Let's try again."],N=['מילה','משפט קצר','עידוד'];
 const html=`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>קול באנגלית</title><style>body{font-family:system-ui,Arial;margin:0;padding:16px;background:#f6f2e8;text-align:center}main{max-width:520px;margin:auto}h1{font-size:24px;margin:8px 0}.st{color:#666;font-size:16px}.s{background:#fff;border-radius:12px;padding:12px;margin:14px 0;font-size:22px;direction:ltr}.pair{display:flex;gap:12px}.pair>div{flex:1;background:#fff;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px}.big{font-size:22px;padding:14px;border:0;border-radius:12px;cursor:pointer;color:#fff}.pl{background:#3a8fc4}.ch{background:#4fbf63}.pl.on{background:#f5a623}h2{margin:0;font-size:22px}.w{font-size:34px;font-weight:900;color:#2e7d32}.lnk{background:none;border:0;color:#3a8fc4;font-size:16px;text-decoration:underline;cursor:pointer;margin-top:12px}</style><main id="m"></main>
<script>const F=${JSON.stringify(F)},S=${JSON.stringify(S)},N=${JSON.stringify(N)};let champ=F[0],k=1,a,hist=[];const m=document.getElementById('m');
function url(v,i){return '/api/tts?t='+encodeURIComponent(S[i])+'&v=en-US-Chirp3-HD-'+v+'&r=0.85';}
function play(v,i,b){if(a)a.pause();document.querySelectorAll('.pl').forEach(x=>x.classList.remove('on'));if(b)b.classList.add('on');a=new Audio(url(v,i));a.onended=()=>b&&b.classList.remove('on');a.play();}
function step(){if(k>=F.length)return done();const ch=F[k],i=(k-1)%%3;const L=Math.random()<.5?[champ,ch]:[ch,champ];L.forEach(v=>fetch(url(v,i)));
  m.innerHTML='<h1>איזה קול באנגלית יותר נעים לאורן?</h1><div class="st">שלב '+k+' מתוך '+(F.length-1)+' · השמות מוסתרים כדי לבחור רק לפי האוזן</div><div class="s">'+S[i]+'</div><div class="pair">'+L.map((v,n)=>'<div><h2>קול '+'אב'[n]+'</h2><button class="big pl" data-n="'+n+'">▶ השמעה</button><button class="big ch" data-n="'+n+'">זה יותר טוב</button></div>').join('')+'</div>'+(hist.length?'<button class="lnk" id="bk">חזרה שלב אחד</button>':'');
  m.querySelectorAll('.pl').forEach(b=>b.onclick=()=>play(L[b.dataset.n],i,b));m.querySelectorAll('.ch').forEach(b=>b.onclick=()=>{hist.push(champ);champ=L[b.dataset.n];k++;step();});
  const bk=document.getElementById('bk');if(bk)bk.onclick=()=>{champ=hist.pop();k--;step();};}
function done(){S.forEach((x,i)=>fetch(url(champ,i)));m.innerHTML='<h1>הקול שבחרת:</h1><div class="w">'+champ+'</div><p>האזן לו עוד פעם בשלושת המשפטים:</p>'+S.map((x,i)=>'<button class="big pl" style="width:100%%;margin:6px 0" data-i="'+i+'">▶ '+N[i]+'</button>').join('')+'<p>אם הוא מתאים, כתוב לי בצ׳אט: <b>'+champ+'</b></p><button class="lnk" id="re">להתחיל מחדש</button>';
  m.querySelectorAll('.pl').forEach(b=>b.onclick=()=>play(champ,+b.dataset.i,b));document.getElementById('re').onclick=()=>{champ=F[0];k=1;hist=[];step();};}
step();</script></html>`;
 return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});}
const AH={'content-type':'audio/mpeg','cache-control':'public, max-age=31536000, immutable'};/* fixed audio reaches devices through &k=ver (see /api/tts/status) */
let verV=null,verAt=0;async function ttsVer(env,fresh){if(fresh||verV==null||Date.now()-verAt>FX_TTL){verV=+(await kvGet(env,'ttsver'))||1;verAt=Date.now();}return verV;}
const monthKey=()=>'ttsuse:'+new Date().toISOString().slice(0,7);
/* Daily KV write budget (Workers KV free tier: ~1000 writes a day, shared with the family save). Voice (TTS) writes stop at
   TTS_DAY_BUDGET (env, default 600 new sentences a day); the family save (api) never looks at it. State: one KV key 'ttsday:YYYY-MM-DD',
   written once per batch (pregen, queue) and at most every 5th single sentence. When it is used up /api/tts answers 429
   and the game plays the browser voice for audio that is not made yet. */
const dayBudget=env=>+env.TTS_DAY_BUDGET||600;
const dayKey=()=>'ttsday:'+new Date().toISOString().slice(0,10);
const dayUsed=async env=>+(await kvGet(env,dayKey()))||0;
const dayPut=(env,n)=>kvPut(env,dayKey(),String(n),{expirationTtl:172800});
const overBudget=()=>J({ok:false,error:'daily voice budget used, retry tomorrow',why:'daily budget'},429);
const ttsKey=async(voice,rate,text)=>'tts:'+await sha(voice+'|'+rate.toFixed(2)+'|'+text);
/* Pronunciation dictionary for the Hebrew voices: KV 'ttsfixw' = {plainWord: vocalized or respelled}, exact whole words only
   (a word = a run of Hebrew letters/nikud; prefixed forms like ועשרות are their own entries). Kept in isolate memory for 5 minutes. */
let fxW=null,fxAt=0;const FX_TTL=300000;
async function fixWords(env,fresh){if(fresh||!fxW||Date.now()-fxAt>FX_TTL){let w=null;try{w=JSON.parse(await kvGet(env,'ttsfixw'));}catch(e){}fxW=w&&typeof w==='object'?w:{};fxAt=Date.now();}return fxW;}
const fxApply=(text,W)=>text.replace(/[\\u0590-\\u05FF]+/g,x=>Object.prototype.hasOwnProperty.call(W,x)?W[x]:x);
async function fixText(env,text,only){if(only)text=fxApply(text,only);return fxApply(text,await fixWords(env));}
const FX_KEY=/^[\\u05D0-\\u05EA]{1,30}$/,FX_VAL=/^[\\u0591-\\u05F4'\\- ]{1,60}$/;
function fxMap(o){if(o==null)return {};if(typeof o!=='object'||Array.isArray(o))return null;const m={};
 for(const k in o){const v=o[k];if(!FX_KEY.test(k)||(v!==null&&(typeof v!=='string'||!FX_VAL.test(v))))return null;m[k]=v;}return m;}
/* POST /api/tts/fix {t,v?,r?,words:{plain:fixed|null},only?:{plain:fixed}}: words are merged into the dictionary (null removes one;
   one write, only if it changed), "only" applies to this sentence alone; t is made again and stored under its ORIGINAL key,
   so the game's URL now plays the fixed audio (one write). GET gives the dictionary. */
async function fix(req,env){if(req.method==='GET')return J(await fixWords(env,true));
 if(req.method!=='POST')return J({error:'method'},405);
 let b;try{b=await req.json();}catch(e){return J({error:'bad json'},400);}
 const t=String(b&&b.t||'').slice(0,400).trim(),v=b.v||GAME_VOICE,rate=Math.min(1.3,Math.max(.7,+b.r||GAME_RATE));
 const words=fxMap(b.words),only=fxMap(b.only);
 if(!t||!VOICES.test(v)||!words||!only)return J({error:'bad request'},400);
 const du=await dayUsed(env);if(du>=dayBudget(env))return overBudget();
 const W={...await fixWords(env,true)};let changed=false;
 for(const k in words){if(words[k]===null){if(k in W){delete W[k];changed=true;}}else if(W[k]!==words[k]){W[k]=words[k];changed=true;}}
 if(changed){await kvPut(env,'ttsfixw',JSON.stringify(W));fxW=W;fxAt=Date.now();}
 const used=+(await kvGet(env,monthKey()))||0;if(used+t.length>TTS_CAP)return J({ok:false,why:'monthly cap'},429);
 const sent=v.startsWith('he-')?await fixText(env,heNum(noEmoji(t)),only):noEmoji(t);
 const bin=await synth(env,v,rate,t,only);if(!bin.length)return J({ok:false,why:'google '+bin.status},502);
 await kvPut(env,await ttsKey(v,rate,t),bin);await dayPut(env,du+1);
 return J({ok:true,sent,changed,words:Object.keys(W).length});}
/* a sentence made fresh (with the dictionary) and NOT stored: variants to choose from, checks of a respelling */
async function tryTts(env,t,v,rt){const used=+(await kvGet(env,monthKey()))||0;if(used+t.length>TTS_CAP)return J({ok:false,why:'monthly cap'},429);
 const bin=await synth(env,v,rt,t);if(!bin.length)return J({ok:false,why:'google '+bin.status},502);
 return new Response(bin,{headers:{'content-type':'audio/mpeg','cache-control':'public, max-age=86400'}});}
/* /api/tts/listen: the parent's page. 'ttslisten' = {choose:[{w,s,vars}],sample:[{t,v,r}],sid} (voicecheck.js posts it),
   'ttsvote' = {word: chosen spelling ('' = none is right)}, 'ttsmarks' = [{t,v,r,ok,w:[words],at}] (sent in batches of 5) */
async function listen(req,env,u){const p=u.pathname;
 const get=async k=>{try{return JSON.parse(await kvGet(env,k));}catch(e){return null;}};
 if(p==='/api/tts/listen')return new Response(LISTEN,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
 if(p==='/api/tts/listen/data'){const q=await get('ttslisten')||{};return J({choose:q.choose||[],sample:q.sample||[],sid:q.sid||'',votes:await get('ttsvote')||{},marks:u.searchParams.has('marks')?(await get('ttsmarks')||[]):undefined});}
 if(req.method!=='POST')return J({error:'method'},405);
 let b;try{b=JSON.parse(await req.text());}catch(e){return J({error:'bad json'},400);}
 if(p==='/api/tts/listen/q'){if(!b||!Array.isArray(b.choose)||!Array.isArray(b.sample))return J({error:'bad request'},400);
  await kvPut(env,'ttslisten',JSON.stringify({choose:b.choose.slice(0,200),sample:b.sample.slice(0,300),sid:String(Date.now())}));return J({ok:true});}
 if(p==='/api/tts/listen/vote'){const w=String(b&&b.w||''),v=b&&b.v;if(!/^[\u05D0-\u05EA]{1,30}(#[0-9]{1,3})?$/.test(w)||typeof v!=='string'||(v&&!FX_VAL.test(v)))return J({error:'bad request'},400);
  const half=(Array.isArray(b.half)?b.half:[]).filter(x=>typeof x==='string'&&FX_VAL.test(x)).slice(0,5),note=String(b.note||'').slice(0,300);
  const V=await get('ttsvote')||{};V[w]={v,half,note,at:Date.now()};await kvPut(env,'ttsvote',JSON.stringify(V));return J({ok:true});}
 if(p==='/api/tts/listen/marks'){if(!Array.isArray(b)||b.length>50)return J({error:'bad request'},400);const M=await get('ttsmarks')||[];
  for(const x of b)if(x&&typeof x.t==='string')M.push({t:x.t.slice(0,400),v:VOICES.test(x.v||'')?x.v:GAME_VOICE,r:+x.r||GAME_RATE,ok:!!x.ok,w:(Array.isArray(x.w)?x.w:[]).slice(0,10).map(w=>String(w).slice(0,30)),note:String(x.note||'').slice(0,300),at:Date.now()});
  if(M.length>3000)M.splice(0,M.length-3000);await kvPut(env,'ttsmarks',JSON.stringify(M));return J({ok:true});}
 return J({error:'not found'},404);}
/* what the voice must not read aloud: emoji and pictographs (with their variation selectors, joiners, keycaps, flags) and ✓ ✗ */
const noEmoji=t=>{const c=t.replace(/\\s*[\\u2190-\\u21FF]\\s*/g,', ').replace(/[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\p{Emoji_Modifier}\\u{E0020}-\\u{E007F}\\u200D\\uFE0E\\uFE0F\\u20E3\\u2713\\u2717\\u2714\\u2718]/gu,'').replace(/[ ]{2,}/g,' ').trim();return c||t;};
async function synth(env,voice,rate,text,only){text=noEmoji(text);if(voice.startsWith('he-'))text=await fixText(env,heNum(text),only);const r=await fetch('https://texttospeech.googleapis.com/v1/text:synthesize',{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':env.GOOGLE_TTS_KEY},
   body:JSON.stringify({input:{text},voice:{languageCode:voice.slice(0,5),name:voice},audioConfig:{audioEncoding:'MP3',speakingRate:rate}})});
 if(!r.ok)return {length:0,status:r.status};
 const s=atob((await r.json()).audioContent);const bin=new Uint8Array(s.length);for(let i=0;i<s.length;i++)bin[i]=s.charCodeAt(i);return bin;}
/* Create game sentences in advance: POST {texts:[...]} up to 15, each a text (game voice) or {t,v,r} (e.g. the English voice); cached ones are skipped,
   one KV write per new sentence and the month counter written once per call. */
async function pregen(req,env){if(req.method!=='POST')return new Response('{"error":"method"}',{status:405,headers:JH});
 let L;try{L=(await req.json()).texts;if(!Array.isArray(L)||L.length>15||L.some(t=>typeof t!=='string'&&!(t&&typeof t==='object'&&typeof t.t==='string')))throw 0;}catch(e){return new Response('{"error":"bad request"}',{status:400,headers:JH});}
 const month=monthKey();let used=+(await kvGet(env,month))||0;const u0=used;const out=[];const du=await dayUsed(env);let made=0;
 for(const x of L){const c=qClean(x);if(c==null){out.push(typeof x==='string'||!x.t.trim()?'empty':'bad voice');continue;}const i=qItem(c),text=i[0],voice=i[1],rate=+i[2];
  const key=await ttsKey(voice,rate,text);
  if(await kvGet(env,key,'arrayBuffer')){out.push('hit');continue;}
  if(du+made>=dayBudget(env)){out.push('budget');continue;}
  if(used+text.length>TTS_CAP){out.push('cap');continue;}
  const bin=await synth(env,voice,rate,text);if(!bin.length){out.push('google '+bin.status);continue;}
  await kvPut(env,key,bin);used+=text.length;made++;out.push('new');}
 if(used!==u0)await kvPut(env,month,String(used),{expirationTtl:60*60*24*62});
 if(made)await dayPut(env,du+made);
 return new Response(JSON.stringify({ok:true,res:out,used,cap:TTS_CAP}),{headers:JH});}
const J=(o,s)=>new Response(JSON.stringify(o),{status:s||200,headers:JH});
/* Automatic pregen queue (no cron, no person): cf/tools/pregen.js POSTs the sentences the server does not have yet
   (JSON array of texts, or {t,v,r}) to /api/tts/queue. Ordinary visits (the page, /api/save) then make a few in the
   background with ctx.waitUntil: at most QN new per batch, a batch at most every QGAP ms (Google: 20 a minute, shared
   with the game itself), at most QDAY new a day (KV free tier: 1000 writes a day, shared with family saves).
   All state is one KV key 'ttsq' = {q:[item...],at,day,n}; item = text (game voice) or [text,voice,rate].
   Per batch: one write per new sentence + the queue once + the month counter once. */
const QN=5,QGAP=30000,QDAY=300,QMAX=10000;let qAt=0;
const today=()=>new Date().toISOString().slice(0,10);
const qItem=x=>typeof x==='string'?[x,GAME_VOICE,GAME_RATE]:x;
const qId=x=>{const i=qItem(x);return i[1]+'|'+(+i[2]).toFixed(2)+'|'+i[0];};
function qClean(x){const o=typeof x==='string'?{t:x}:x;if(!o||typeof o!=='object'||typeof o.t!=='string')return null;
 const t=o.t.slice(0,400).trim(),v=o.v||GAME_VOICE,r=Math.min(1.3,Math.max(.7,+o.r||GAME_RATE));
 if(!t||!VOICES.test(v))return null;return v===GAME_VOICE&&r===GAME_RATE?t:[t,v,r];}
async function qLoad(env){let s=null;try{s=JSON.parse(await kvGet(env,'ttsq'));}catch(e){}
 if(!s||!Array.isArray(s.q))s={q:[],at:0,day:'',n:0};if(s.day!==today()){s.day=today();s.n=0;}return s;}
async function queue(req,env){
 if(req.method==='GET'){const s=await qLoad(env);return J({ok:true,left:s.q.length,doneToday:s.n,dayMax:QDAY});}
 if(req.method!=='POST')return J({error:'method'},405);
 let L;try{L=await req.json();if(!Array.isArray(L)||L.length>QMAX)throw 0;}catch(e){return J({error:'bad request'},400);}
 const s=await qLoad(env);const seen=new Set(s.q.map(qId));let added=0;
 for(const x of L){const c=qClean(x);if(c==null)continue;const id=qId(c);if(seen.has(id)||s.q.length>=QMAX)continue;seen.add(id);s.q.push(c);added++;}
 if(added)await kvPut(env,'ttsq',JSON.stringify(s));
 return J({ok:true,added,left:s.q.length,doneToday:s.n});}
async function qRun(env){if(!env.GOOGLE_TTS_KEY)return;const now=Date.now();if(now-qAt<QGAP)return;qAt=now;
 const s=await qLoad(env);if(!s.q.length||s.n>=QDAY||now-(s.at||0)<QGAP)return;
 const month=monthKey();let used=+(await kvGet(env,month))||0;const u0=used,done=new Set();let made=0,looked=0;const du=await dayUsed(env);
 for(const x of s.q){if(made>=QN||s.n>=QDAY||looked>=4*QN)break;looked++;const i=qItem(x),t=i[0],v=i[1],r=+i[2];
  const key=await ttsKey(v,r,t);
  if(await kvGet(env,key,'arrayBuffer')){done.add(qId(x));continue;}
  if(du+made>=dayBudget(env)||used+t.length>TTS_CAP)break;
  const bin=await synth(env,v,r,t);if(!bin.length){if(bin.status===400)done.add(qId(x));else break;continue;}/* 400: Google will never make it */
  await kvPut(env,key,bin);used+=t.length;made++;s.n++;done.add(qId(x));}
 if(used!==u0)await kvPut(env,month,String(used),{expirationTtl:60*60*24*62});
 if(made)await dayPut(env,du+made);
 if(!done.size)return;
 const s2=await qLoad(env);/* read again so sentences queued meanwhile are kept */
 s2.q=s2.q.filter(x=>!done.has(qId(x)));s2.at=now;s2.day=s.day;s2.n=s.n;await kvPut(env,'ttsq',JSON.stringify(s2));}
/* the list of all game sentences (pregen.js POSTs it, texts or {t,v,r}; one KV write), for "download all voices to this device" */
const ttsUrl=x=>{const i=qItem(x);return '/api/tts?t='+encodeURIComponent(i[0])+'&v='+i[1]+'&r='+i[2];};
async function list(req,env){
 if(req.method==='GET'){let L=[];try{L=JSON.parse(await kvGet(env,'ttsall'))||[];}catch(e){}const k=await ttsVer(env);return J({ver:k,urls:L.map(x=>ttsUrl(x)+'&k='+k)});}
 if(req.method!=='POST')return J({error:'method'},405);
 let L;try{L=await req.json();if(!Array.isArray(L)||L.length>QMAX)throw 0;}catch(e){return J({error:'bad request'},400);}
 const seen=new Set();L=L.map(qClean).filter(c=>c!=null&&!seen.has(qId(c))&&seen.add(qId(c)));await kvPut(env,'ttsall',JSON.stringify(L));return J({ok:true,n:L.length});}
export default{async fetch(req,env,ctx){const u=new URL(req.url);const p=u.pathname;
 if(ctx&&ctx.waitUntil&&(p==='/'||p==='/index.html'||p.startsWith('/api/save/')))ctx.waitUntil(qRun(env).catch(()=>{}));
 if(p==='/sw.js')return new Response(SW,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-cache'}});
 if(p.startsWith('/api/tts'))return tts(req,env,u).catch(e=>J({ok:false,why:String(e&&e.message||e).slice(0,200)},503));/* a failing KV write (daily limit) used to be Cloudflare error 1101 */
 if(p==='/api/diag')return diag(req,env,u).catch(e=>J({error:'diag',why:String(e&&e.message||e).slice(0,200)},503));
 const m=/^\\/api\\/save\\/([^/]+)$/.exec(p);if(m)return api(req,env,m[1]);
 if(p==='/manifest.webmanifest')return new Response(MAN,{headers:{'content-type':'application/manifest+json'}});
 if(IC[p])return new Response(b64(IC[p]),{headers:{'content-type':'image/png','cache-control':'public, max-age=86400'}});
 if(p==='/'||p==='/index.html')return new Response(HTML,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
 return new Response('Not found',{status:404});}};
'''%(json.dumps(html,ensure_ascii=False),json.dumps(LISTEN,ensure_ascii=False),NUMJS,json.dumps(man,ensure_ascii=False),json.dumps(sw,ensure_ascii=False),i192,i512)
out=d/'dist';out.mkdir(exist_ok=True)
(out/'_worker.js').write_text(js,encoding='utf-8')
print('worker',len(js.encode()))
