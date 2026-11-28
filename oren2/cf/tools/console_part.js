/* #869 owner console: questions + notices in D1, first answer wins. Three separate keys (Pages secrets, never in the repo):
   CONSOLE_PUSH_KEY creates/updates, CONSOLE_READ_KEY lists, CONSOLE_ANSWER_KEY answers. One key opens only its own door. */
const CON_SQL="CREATE TABLE IF NOT EXISTS questions(repo TEXT NOT NULL,key TEXT NOT NULL,project TEXT,issue INTEGER,gates TEXT,text_he TEXT,options TEXT,recommended TEXT,asked_at INTEGER,answer TEXT,answered_at INTEGER,via TEXT,PRIMARY KEY(repo,key));CREATE TABLE IF NOT EXISTS notices(id INTEGER PRIMARY KEY AUTOINCREMENT,repo TEXT,project TEXT,at INTEGER,text_he TEXT,issue INTEGER);";
let conReady=false;
async function conAuth(req,secret){const k=req.headers.get('x-console-key')||'';if(!k||!secret)return false;return (await sha(k))===(await sha(secret));}
const conStr=(x,n)=>typeof x==='string'&&x.length>0&&x.length<=n;
const conRepo=x=>conStr(x,100)&&/^[\w.-]+\/[\w.-]+$/.test(x);
const conKey=x=>conStr(x,120)&&/^[\w.:#-]+$/.test(x);
/* gates: repo#n strings; a plain n (number or "n") = the question's own repo */
function conGates(g){if(g==null)return [];if(!Array.isArray(g)||g.length>20)return null;const o=[];for(const x of g){const s=String(x);if(!/^(\d{1,7}|[\w.-]+\/[\w.-]+#\d{1,7})$/.test(s))return null;o.push(s);}return o;}
async function consoleApi(req,env,u){
 if(!env.DB)return J({error:'no db'},503);
 if(!conReady){if(env.DB.exec)await env.DB.exec(CON_SQL);conReady=true;}
 const p=u.pathname,get=req.method==='GET',post=req.method==='POST';
 let o={};if(post){try{o=JSON.parse(await req.text());if(!o||typeof o!=='object'||Array.isArray(o))throw 0;}catch(e){return J({error:'bad request'},400);}}
 if(p==='/api/console/question'||p==='/api/console/notice'){
  if(!post)return J({error:'method'},405);
  if(!(await conAuth(req,env.CONSOLE_PUSH_KEY)))return J({error:'forbidden'},403);
  if(!conRepo(o.repo)||!conStr(o.text_he,2000)||(o.project!=null&&!conStr(o.project,60))||(o.issue!=null&&!Number.isInteger(o.issue)))return J({error:'bad request'},400);
  const now=Date.now();
  if(p==='/api/console/notice'){const r=await env.DB.prepare('INSERT INTO notices(repo,project,at,text_he,issue) VALUES(?,?,?,?,?)').bind(o.repo,o.project||null,now,o.text_he,o.issue==null?null:o.issue).run();return J({ok:true,id:r&&r.meta?r.meta.last_row_id:null});}
  const g=conGates(o.gates);if(!conKey(o.key)||g===null||(o.options!=null&&(!Array.isArray(o.options)||o.options.length>10))||(o.recommended!=null&&!conStr(o.recommended,200)))return J({error:'bad request'},400);
  /* the same (repo,key) is one row: a second push updates the text of a question still open; an answered one is never touched */
  const had=await env.DB.prepare('SELECT 1 AS x FROM questions WHERE repo=? AND key=?').bind(o.repo,o.key).first();
  if(had){await env.DB.prepare('UPDATE questions SET project=?,issue=?,gates=?,text_he=?,options=?,recommended=? WHERE repo=? AND key=? AND answered_at IS NULL').bind(o.project||null,o.issue==null?null:o.issue,JSON.stringify(g),o.text_he,JSON.stringify(o.options||[]),o.recommended||null,o.repo,o.key).run();return J({ok:true,created:false});}
  await env.DB.prepare('INSERT INTO questions(repo,key,project,issue,gates,text_he,options,recommended,asked_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(o.repo,o.key,o.project||null,o.issue==null?null:o.issue,JSON.stringify(g),o.text_he,JSON.stringify(o.options||[]),o.recommended||null,now).run();
  return J({ok:true,created:true});}
 if(p==='/api/console/questions'||p==='/api/console/notices'){
  if(!get)return J({error:'method'},405);
  if(!(await conAuth(req,env.CONSOLE_READ_KEY)))return J({error:'forbidden'},403);
  if(p==='/api/console/notices')return J({notices:((await env.DB.prepare('SELECT id,repo,project,at,text_he,issue FROM notices ORDER BY id DESC LIMIT 200').all()).results)||[]});
  const st=u.searchParams.get('state')||'open';if(!/^(open|answered|all)$/.test(st))return J({error:'bad request'},400);
  const W=st==='open'?' WHERE answered_at IS NULL':st==='answered'?' WHERE answered_at IS NOT NULL':'';
  const rows=((await env.DB.prepare('SELECT repo,key,project,issue,gates,text_he,options,recommended,asked_at,answer,answered_at,via FROM questions'+W+' ORDER BY asked_at DESC LIMIT 200').all()).results)||[];
  return J({questions:rows.map(r=>({...r,gates:JSON.parse(r.gates||'[]'),options:JSON.parse(r.options||'[]')}))});}
 if(p==='/api/console/answer'){
  if(!post)return J({error:'method'},405);
  if(!(await conAuth(req,env.CONSOLE_ANSWER_KEY)))return J({error:'forbidden'},403);
  if(!conRepo(o.repo)||!conKey(o.key)||!conStr(o.answer,2000)||!conStr(o.via,30))return J({error:'bad request'},400);
  const now=Date.now();
  const r=await env.DB.prepare('UPDATE questions SET answer=?,answered_at=?,via=? WHERE repo=? AND key=? AND answered_at IS NULL').bind(o.answer,now,o.via,o.repo,o.key).run();
  if(r&&r.meta&&r.meta.changes===1)return J({ok:true,answered_at:now});
  const x=await env.DB.prepare('SELECT via,answered_at FROM questions WHERE repo=? AND key=?').bind(o.repo,o.key).first();
  if(!x)return J({error:'no such question'},404);
  return J({error:'already answered ('+x.via+', '+new Date(x.answered_at).toISOString()+')',via:x.via,answered_at:x.answered_at},409);}
 return J({error:'not found'},404);}

/* #885 owner console in the Claude chat: a SECOND route `/mcp` (+ OAuth 2.1 under /oauth and /.well-known/oauth-*), separate from /api/mcp (#674).
   Own small OAuth flow (workers-oauth-provider needs a Workers KV/DO setup that does not fit the single generated Pages _worker.js).
   Login = a 6-digit code mailed (Resend API) to the secret CONSOLE_OWNER_EMAIL; the key is CONSOLE_MAIL_KEY; CONSOLE_SIGN_KEY peppers every stored hash,
   so a new CONSOLE_SIGN_KEY revokes every token, code and card code at once. Only hashes are stored in D1; the address, codes and keys never leave the worker. */
const CONA_SQL="CREATE TABLE IF NOT EXISTS con_clients(id TEXT PRIMARY KEY,redirects TEXT,at INTEGER);CREATE TABLE IF NOT EXISTS con_txn(id TEXT PRIMARY KEY,client TEXT,redirect TEXT,challenge TEXT,state TEXT,at INTEGER,code_hash TEXT,code_exp INTEGER,tries INTEGER DEFAULT 0,used INTEGER DEFAULT 0);CREATE TABLE IF NOT EXISTS con_tokens(hash TEXT PRIMARY KEY,kind TEXT,client TEXT,exp INTEGER,txn TEXT);CREATE TABLE IF NOT EXISTS con_otc(hash TEXT PRIMARY KEY,exp INTEGER);CREATE TABLE IF NOT EXISTS con_mail(at INTEGER);";
let conaReady=false;
const CON_CODE_MS=6e5,CON_TRIES=5,CON_MAILS_H=5,CON_TOKEN_MS=30*864e5,CON_OTC_MS=12*36e5;
function conRand(n){const a=new Uint8Array(n);crypto.getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(2,'0')).join('');}
function conDigits(){const a=new Uint32Array(1);for(;;){crypto.getRandomValues(a);if(a[0]<4294000000)return String(a[0]%1000000).padStart(6,'0');}}
const conH=(env,k,v)=>sha((env.CONSOLE_SIGN_KEY||'')+'|'+k+'|'+v);
const conOrigin=u=>u.origin;
/* ---- ONE pure function: which questions show, in which order, what collapses (also for #873's page) ---- */
function conSortCollapse(qs,now,keepMs){
 keepMs=keepMs||864e5;now=now||Date.now();
 const gl=q=>(q.gates||[]).length;
 const open=qs.filter(q=>q.answered_at==null).sort((a,b)=>(gl(b)-gl(a))||((a.asked_at||0)-(b.asked_at||0)));
 const answered=qs.filter(q=>q.answered_at!=null&&now-q.answered_at<=keepMs).sort((a,b)=>b.answered_at-a.answered_at).map(q=>({repo:q.repo,key:q.key,project:q.project,line:'✓ נענה: '+q.answer,via:q.via,answered_at:q.answered_at}));
 const groups=[];
 for(const q of open){const p=q.project||q.repo||'';let g=groups.find(x=>x.project===p);if(!g){g={project:p,count:0,items:[]};groups.push(g);}g.count++;g.items.push(q);}
 return {count:open.length,title:'מחכה לך ('+open.length+')',open,answered,groups,projects:groups.map(g=>g.project)};}
function conRows(rows){return rows.map(r=>({...r,gates:JSON.parse(r.gates||'[]'),options:JSON.parse(r.options||'[]')}));}
async function conaInit(env){if(!conaReady){if(env.DB.exec)await env.DB.exec(CONA_SQL+CON_SQL);conaReady=true;}}
async function conQuestions(env){await conaInit(env);
 const rows=((await env.DB.prepare('SELECT repo,key,project,issue,gates,text_he,options,recommended,asked_at,answer,answered_at,via FROM questions ORDER BY asked_at DESC LIMIT 400').all()).results)||[];
 const now=Date.now(),raw=conRows(rows).filter(q=>q.answered_at==null||now-q.answered_at<=864e5);const v=conSortCollapse(raw,now);v.raw=raw;return v;}
async function conNewOtc(env){const c=conRand(24),now=Date.now();await env.DB.prepare('DELETE FROM con_otc WHERE exp<?').bind(now).run();await env.DB.prepare('INSERT INTO con_otc(hash,exp) VALUES(?,?)').bind(await conH(env,'otc',c),now+CON_OTC_MS).run();return c;}
async function conUseOtc(env,c){if(typeof c!=='string'||c.length!==48)return false;const r=await env.DB.prepare('DELETE FROM con_otc WHERE hash=? AND exp>?').bind(await conH(env,'otc',c),Date.now()).run();return !!(r&&r.meta&&r.meta.changes===1);}
/* ---- the card (a ui:// MCP App resource): the only place the one-time code lives ---- */
const CON_CARD_JS=`
const $=s=>document.querySelector(s),esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let id=0,pend={},code=window.__CODE__,D=null,filter='all',busy=false;try{filter=localStorage.getItem('conFilter')||'all';}catch(e){}
addEventListener('message',e=>{const m=e.data;if(m&&m.jsonrpc==='2.0'&&m.id!=null&&pend[m.id]){pend[m.id](m);delete pend[m.id];}});
const rpc=(method,params)=>new Promise(r=>{const i=++id;pend[i]=r;parent.postMessage({jsonrpc:'2.0',id:i,method,params},'*');setTimeout(()=>{if(pend[i]){delete pend[i];r({error:{message:'timeout'}});}},15000);});
const call=(name,args)=>rpc('tools/call',{name,arguments:args});
const sorted=${conSortCollapse.toString()};
function ago(t){const m=Math.max(0,Math.round((Date.now()-t)/6e4));return m<60?m+' דק׳':m<1440?Math.round(m/60)+' שע׳':Math.round(m/1440)+' ימים';}
function q1(q){const el=document.createElement('section');el.className='q';el.dataset.k=q.repo+'|'+q.key;
 const opts=q.options||[];const rec=q.recommended;const ordered=opts.slice().sort((a,b)=>(a===rec?-1:0)-(b===rec?-1:0));
 el.innerHTML='<div class="pj">'+esc(q.project||q.repo)+(q.issue?' · #'+q.issue:'')+' · '+ago(q.asked_at)+'</div><p class="tx">'+esc(q.text_he)+'</p>'+
  (ordered.length?'<div class="bt">'+ordered.map((o,i)=>'<button class="'+(o===rec?'main':'')+'" data-a="'+esc(o)+'">'+(o===rec?'⭐ מומלץ: ':'')+esc(o)+'</button>').join('')+'</div>'
   :'<div class="free"><textarea rows="2" maxlength="2000" placeholder="התשובה שלך"></textarea><button class="main" data-free="1">שלח</button></div>')+
  ((q.gates||[]).length?'<details><summary>פרטים נוספים</summary><div class="dt">חוסם: '+q.gates.map(g=>esc(String(g).includes('#')?g:'#'+g)).join(', ')+'</div></details>':'');
 el.querySelectorAll('button').forEach(b=>b.onclick=()=>send(q,b.dataset.free?el.querySelector('textarea').value.trim():b.dataset.a,el));return el;}
function draw(){const v=D.view,all=v.projects;if(filter!=='all'&&all.indexOf(filter)<0)filter='all';
 $('#t').textContent=v.title;
 $('#f').innerHTML=all.length>1?['all'].concat(all).map(p=>'<button class="chip'+(p===filter?' on':'')+'" data-p="'+esc(p)+'">'+(p==='all'?'הכל':esc(p))+'</button>').join(''):'';
 $('#f').querySelectorAll('button').forEach(b=>b.onclick=()=>{filter=b.dataset.p;try{localStorage.setItem('conFilter',filter);}catch(e){}draw();});
 const L=$('#l');L.innerHTML='';
 v.groups.filter(g=>filter==='all'||g.project===filter).forEach(g=>{const h=document.createElement('h2');h.textContent=g.project+' ('+g.count+')';L.appendChild(h);g.items.forEach(q=>L.appendChild(q1(q)));});
 if(!v.count){const p=document.createElement('p');p.className='none';p.textContent='אין שאלות פתוחות';L.appendChild(p);}
 v.answered.filter(a=>filter==='all'||a.project===filter).forEach(a=>{const d=document.createElement('div');d.className='done';d.textContent=a.line;L.appendChild(d);});}
async function load(){const r=await call('refresh_questions',{});if(r.result&&r.result.structuredContent){D={view:sorted(r.result.structuredContent.questions,Date.now())};const c=r.result._meta&&r.result._meta.code;if(c)code=c;draw();}else if(!D)$('#t').textContent='מחכה לך';}
async function send(q,a,el){if(busy||!a)return;busy=true;el.classList.add('wait');
 const r=await call('answer_question',{repo:q.repo,key:q.key,answer:a,code});busy=false;
 const res=r.result,c=res&&res._meta&&res._meta.code;if(c)code=c;
 if(!res||res.isError){el.classList.remove('wait');const m=res&&res.structuredContent&&res.structuredContent.error;let n=el.querySelector('.err');if(!n){n=document.createElement('p');n.className='err';el.appendChild(n);}n.textContent=m||'לא נשמר, נסה שוב';return;}
 await load();}
(async()=>{await rpc('ui/initialize',{appInfo:{name:'console',version:'1'},appCapabilities:{},protocolVersion:'2025-11-21'});parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'},'*');
 load();setInterval(()=>{if(!document.hidden)load();},30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});})();`;
const CON_CARD_CSS=`:root{color-scheme:light dark;--bg:#fbf8f1;--card:#fff;--tx:#222;--mut:#666;--ac:#2d7ff9;--ok:#2a9d4a;--ln:#e3ddd0}@media(prefers-color-scheme:dark){:root{--bg:#1d1d1f;--card:#2a2a2d;--tx:#eee;--mut:#aaa;--ln:#3c3c40}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:16px/1.45 system-ui,Arial,sans-serif;padding:12px;max-width:640px;margin-inline:auto;overflow-x:hidden}
h1{font-size:22px;margin:0 0 8px}h2{font-size:16px;color:var(--mut);margin:16px 0 6px}.q{background:var(--card);border:1px solid var(--ln);border-radius:14px;padding:12px;margin:8px 0}.q.wait{opacity:.5}
.pj{font-size:13px;color:var(--mut)}.tx{margin:4px 0 10px;font-size:17px;overflow-wrap:anywhere}.bt{display:flex;flex-direction:column;gap:8px}
button{font:inherit;border:1px solid var(--ln);background:var(--card);color:var(--tx);border-radius:12px;padding:12px;min-height:44px;cursor:pointer;text-align:start}button.main{background:var(--ac);color:#fff;border-color:var(--ac)}
textarea{width:100%;font:inherit;border:1px solid var(--ln);border-radius:10px;padding:8px;margin-bottom:8px;background:var(--bg);color:var(--tx)}
#f{display:flex;flex-wrap:wrap;gap:6px}.chip{padding:6px 12px;min-height:36px;border-radius:99px}.chip.on{background:var(--ac);color:#fff}
.done{color:var(--ok);padding:6px 4px;font-size:15px}.none{text-align:center;color:var(--mut);padding:20px}.err{color:#d33;margin:6px 0 0}details{margin-top:8px;color:var(--mut);font-size:14px}`;
function conCardHtml(code){return '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>מחכה לך</title><style>'+CON_CARD_CSS+'</style></head><body><h1 id="t">מחכה לך</h1><div id="f"></div><div id="l"></div><script>window.__CODE__='+JSON.stringify(code)+';'+CON_CARD_JS.replace(/<\//g,'<\\/')+'</script></body></html>';}
/* ---- MCP tools ---- */
const CON_URI='ui://console/questions.html';
const CON_TOOLS=[
 {name:'show_questions',description:'Show the owner the card of questions that wait for him. Takes no input. Never answer a question for him.',inputSchema:{type:'object',properties:{}},_meta:{ui:{resourceUri:CON_URI,visibility:['model','app']}}},
 {name:'refresh_questions',description:'App only: the current questions for the card.',inputSchema:{type:'object',properties:{}},_meta:{ui:{resourceUri:CON_URI,visibility:['app']}}},
 {name:'answer_question',description:'App only: the owner taps an option on the card.',inputSchema:{type:'object',properties:{repo:{type:'string'},key:{type:'string'},answer:{type:'string'},code:{type:'string'}},required:['repo','key','answer','code']},_meta:{ui:{resourceUri:CON_URI,visibility:['app']}}}];
const conMcpT=(text,sc,meta,err)=>({content:[{type:'text',text}],...(sc?{structuredContent:sc}:{}),...(meta?{_meta:meta}:{}),isError:!!err});
async function conTool(name,a,env){
 if(!env.DB)return conMcpT('no database',null,null,1);
 if(name==='show_questions'){const v=await conQuestions(env);return conMcpT(v.title,{count:v.count,questions:v.raw});}
 if(name==='refresh_questions'){const v=await conQuestions(env);return conMcpT(v.title,{count:v.count,questions:v.raw},{code:await conNewOtc(env)});}
 if(name==='answer_question'){
  const fail=m=>conMcpT(m,{error:m},null,1);
  if(!a||typeof a.repo!=='string'||!conRepo(a.repo)||!conKey(a.key)||!conStr(a.answer,2000))return fail('בקשה לא תקינה');
  if(!(await conUseOtc(env,a.code)))return fail('הכרטיס פג תוקף, רענן');
  const q=await env.DB.prepare('SELECT options,answered_at,answer,via FROM questions WHERE repo=? AND key=?').bind(a.repo,a.key).first();
  if(!q)return conMcpT('אין שאלה כזו',{error:'אין שאלה כזו'},{code:await conNewOtc(env)},1);
  const opts=JSON.parse(q.options||'[]');
  if(opts.length&&opts.indexOf(a.answer)<0)return conMcpT('תשובה לא מהרשימה',{error:'תשובה לא מהרשימה'},{code:await conNewOtc(env)},1);
  const now=Date.now(),r=await env.DB.prepare("UPDATE questions SET answer=?,answered_at=?,via='chat-card' WHERE repo=? AND key=? AND answered_at IS NULL").bind(a.answer,now,a.repo,a.key).run();
  const meta={code:await conNewOtc(env)};
  if(r&&r.meta&&r.meta.changes===1)return conMcpT('נשמר',{ok:true},meta);
  const x=await env.DB.prepare('SELECT via,answered_at FROM questions WHERE repo=? AND key=?').bind(a.repo,a.key).first();
  const m='כבר נענה ('+x.via+', '+new Date(x.answered_at).toISOString()+')';return conMcpT(m,{error:m},meta,1);}
 return conMcpT('unknown tool',null,null,1);}
/* ---- OAuth 2.1 (authorization code + PKCE S256, dynamic client registration, refresh) ---- */
const conHtml=(b,s)=>new Response('<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>קונסולה</title><style>body{font:18px system-ui,Arial;background:#fbf8f1;color:#222;margin:0;padding:24px;max-width:420px;margin-inline:auto}button,input{font:inherit;width:100%;padding:14px;border-radius:12px;border:1px solid #ccc;margin-top:12px}button{background:#2d7ff9;color:#fff;border:0}input{text-align:center;letter-spacing:6px}.e{color:#c22}</style></head><body>'+b+'</body></html>',{status:s||200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-frame-options':'DENY','referrer-policy':'no-referrer'}});
const conEsc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const conRedirOk=x=>{try{const r=new URL(x);return r.protocol==='https:'||(r.protocol==='http:'&&(r.hostname==='localhost'||r.hostname==='127.0.0.1'));}catch(e){return false;}};
async function conB64url(t){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function conMeta(u){const o=conOrigin(u);return {
 '/.well-known/oauth-authorization-server':{issuer:o,authorization_endpoint:o+'/oauth/authorize',token_endpoint:o+'/oauth/token',registration_endpoint:o+'/oauth/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none']},
 '/.well-known/oauth-protected-resource':{resource:o+'/mcp',authorization_servers:[o],bearer_methods_supported:['header']}};}
async function conTokens(env,client,txn){const now=Date.now(),a=conRand(32),r=conRand(32);
 await env.DB.prepare('DELETE FROM con_tokens WHERE exp<?').bind(now).run();
 for(const [k,t] of [['access',a],['refresh',r]])await env.DB.prepare('INSERT INTO con_tokens(hash,kind,client,exp,txn) VALUES(?,?,?,?,?)').bind(await conH(env,k,t),k,client,now+CON_TOKEN_MS,txn).run();
 return {access_token:a,token_type:'Bearer',expires_in:CON_TOKEN_MS/1000,refresh_token:r};}
async function conOauth(req,env,u){
 const p=u.pathname,post=req.method==='POST',o=conOrigin(u);
 const wk=conMeta(u);const pn=p.replace(/\/mcp$/,'');
 if(wk[pn])return J(wk[pn]);
 if(!env.DB||!env.CONSOLE_SIGN_KEY)return J({error:'console is off'},503);
 await conaInit(env);const now=Date.now();
 const oerr=(e,s)=>J({error:e},s||400);
 if(p==='/oauth/register'){if(!post)return J({error:'method'},405);
  let b;try{b=JSON.parse(await req.text());}catch(e){return oerr('invalid_client_metadata');}
  const rs=b&&Array.isArray(b.redirect_uris)?b.redirect_uris:[];if(!rs.length||rs.length>5||!rs.every(conRedirOk))return oerr('invalid_redirect_uri');
  if((await env.DB.prepare('SELECT COUNT(*) AS n FROM con_clients').first()).n>=50)return oerr('too many clients',429);
  const id=conRand(16);await env.DB.prepare('INSERT INTO con_clients(id,redirects,at) VALUES(?,?,?)').bind(id,JSON.stringify(rs),now).run();
  return J({client_id:id,redirect_uris:rs,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']},201);}
 if(p==='/oauth/authorize'){
  if(req.method==='GET'){const q=u.searchParams;
   const c=await env.DB.prepare('SELECT redirects FROM con_clients WHERE id=?').bind(q.get('client_id')||'').first();
   const ru=q.get('redirect_uri')||'';
   if(!c||JSON.parse(c.redirects).indexOf(ru)<0)return conHtml('<p class="e">בקשה לא תקינה</p>',400);
   if(q.get('response_type')!=='code'||q.get('code_challenge_method')!=='S256'||!/^[\w-]{43,128}$/.test(q.get('code_challenge')||''))return conHtml('<p class="e">בקשה לא תקינה</p>',400);
   const id=conRand(16);await env.DB.prepare('DELETE FROM con_txn WHERE at<?').bind(now-36e5).run();
   await env.DB.prepare('INSERT INTO con_txn(id,client,redirect,challenge,state,at) VALUES(?,?,?,?,?,?)').bind(id,q.get('client_id'),ru,q.get('code_challenge'),q.get('state')||'',now).run();
   return conHtml('<h1>קונסולה</h1><form method="post" action="/oauth/authorize"><input type="hidden" name="txn" value="'+id+'"><input type="hidden" name="step" value="send"><button>שלח לי קוד</button></form>');}
  if(!post)return J({error:'method'},405);
  const f=new URLSearchParams(await req.text()),txn=f.get('txn')||'';
  const t=await env.DB.prepare('SELECT * FROM con_txn WHERE id=? AND used=0 AND at>?').bind(txn,now-36e5).first();
  if(!t)return conHtml('<p class="e">הבקשה פגה, התחל שוב מהצ׳אט</p>',400);
  const form=(msg)=>conHtml('<h1>קונסולה</h1>'+(msg?'<p class="e">'+msg+'</p>':'<p>נשלח קוד למייל שלך</p>')+'<form method="post" action="/oauth/authorize"><input type="hidden" name="txn" value="'+txn+'"><input type="hidden" name="step" value="check"><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" autofocus><button>כניסה</button></form>');
  if(f.get('step')==='send'){
   if(!env.CONSOLE_OWNER_EMAIL||!env.CONSOLE_MAIL_KEY)return conHtml('<p class="e">שליחת מייל לא מוגדרת</p>',503);
   await env.DB.prepare('DELETE FROM con_mail WHERE at<?').bind(now-36e5).run();
   if((await env.DB.prepare('SELECT COUNT(*) AS n FROM con_mail').first()).n>=CON_MAILS_H)return conHtml('<p class="e">יותר מדי בקשות, נסה בעוד שעה</p>',429);
   const code=conDigits();
   const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:'Bearer '+env.CONSOLE_MAIL_KEY,'content-type':'application/json'},body:JSON.stringify({from:'Console <onboarding@resend.dev>',to:[env.CONSOLE_OWNER_EMAIL],subject:'קוד כניסה: '+code,text:'קוד הכניסה לקונסולה: '+code+'\nתקף 10 דקות.'})}).catch(()=>null);
   await env.DB.prepare('INSERT INTO con_mail(at) VALUES(?)').bind(now).run();
   if(!r||!r.ok)return conHtml('<p class="e">המייל לא נשלח, נסה שוב</p>',502);
   await env.DB.prepare('UPDATE con_txn SET code_hash=?,code_exp=?,tries=0 WHERE id=?').bind(await conH(env,'code:'+txn,code),now+CON_CODE_MS,txn).run();
   return form('');}
  if(f.get('step')==='check'){
   const n=t.tries+1;await env.DB.prepare('UPDATE con_txn SET tries=? WHERE id=?').bind(n,txn).run();
   const code=(f.get('code')||'').trim();
   if(!t.code_hash||n>CON_TRIES||now>t.code_exp)return conHtml('<p class="e">הקוד לא תקף, בקש קוד חדש</p>',403);
   if(!/^\d{6}$/.test(code)||(await conH(env,'code:'+txn,code))!==t.code_hash)return form('קוד שגוי');
   const w=await env.DB.prepare('UPDATE con_txn SET used=1 WHERE id=? AND used=0').bind(txn).run();if(!(w&&w.meta&&w.meta.changes===1))return conHtml('<p class="e">הקוד כבר נוצל</p>',403);
   const ac=conRand(24);await env.DB.prepare('INSERT INTO con_tokens(hash,kind,client,exp,txn) VALUES(?,?,?,?,?)').bind(await conH(env,'authcode',ac),'authcode',t.client,now+6e4,txn).run();
   const ru=new URL(t.redirect);ru.searchParams.set('code',ac);if(t.state)ru.searchParams.set('state',t.state);
   return new Response(null,{status:302,headers:{location:ru.toString(),'cache-control':'no-store'}});}
  return conHtml('<p class="e">בקשה לא תקינה</p>',400);}
 if(p==='/oauth/token'){if(!post)return J({error:'method'},405);
  const f=new URLSearchParams(await req.text()),gt=f.get('grant_type');
  if(gt==='authorization_code'){
   const h=await conH(env,'authcode',f.get('code')||''),row=await env.DB.prepare("SELECT * FROM con_tokens WHERE hash=? AND kind='authcode' AND exp>?").bind(h,now).first();
   const del=await env.DB.prepare('DELETE FROM con_tokens WHERE hash=?').bind(h).run();/* single use */
   if(!row||!(del&&del.meta&&del.meta.changes===1)||row.client!==f.get('client_id'))return oerr('invalid_grant');
   const t=await env.DB.prepare('SELECT challenge,redirect FROM con_txn WHERE id=?').bind(row.txn).first();
   if(!t||(await conB64url(f.get('code_verifier')||''))!==t.challenge||f.get('redirect_uri')!==t.redirect)return oerr('invalid_grant');
   return J(await conTokens(env,row.client,row.txn));}
  if(gt==='refresh_token'){
   const h=await conH(env,'refresh',f.get('refresh_token')||''),row=await env.DB.prepare("SELECT * FROM con_tokens WHERE hash=? AND kind='refresh' AND exp>?").bind(h,now).first();
   if(!row||row.client!==f.get('client_id'))return oerr('invalid_grant');
   await env.DB.prepare('DELETE FROM con_tokens WHERE hash=?').bind(h).run();return J(await conTokens(env,row.client,row.txn));}
  return oerr('unsupported_grant_type');}
 return J({error:'not found'},404);}
/* ---- /mcp: streamable HTTP, POST JSON-RPC ---- */
const conRpcR=(id,result)=>J({jsonrpc:'2.0',id:id==null?null:id,result});
const conRpcE=(id,code,message)=>J({jsonrpc:'2.0',id:id==null?null:id,error:{code,message}});
async function conAuthed(req,env){const m=/^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization')||'');if(!m||!env.DB||!env.CONSOLE_SIGN_KEY)return false;await conaInit(env);
 return !!(await env.DB.prepare("SELECT 1 AS x FROM con_tokens WHERE hash=? AND kind='access' AND exp>?").bind(await conH(env,'access',m[1]),Date.now()).first());}
async function conMcp(req,env,u){
 if(!(await conAuthed(req,env)))return new Response(JSON.stringify({error:'unauthorized'}),{status:401,headers:{...JH,'www-authenticate':'Bearer resource_metadata="'+conOrigin(u)+'/.well-known/oauth-protected-resource"'}});
 if(req.method!=='POST')return J({error:'method'},405);
 let b;try{b=JSON.parse(await req.text());}catch(e){return conRpcE(null,-32700,'parse error');}
 if(!b||typeof b!=='object'||Array.isArray(b)||b.jsonrpc!=='2.0'||typeof b.method!=='string')return conRpcE(null,-32600,'invalid request');
 if(b.id===undefined)return new Response(null,{status:202});/* notification */
 const id=b.id,m=b.method;
 if(m==='initialize')return conRpcR(id,{protocolVersion:'2025-06-18',capabilities:{tools:{},resources:{}},serverInfo:{name:'oren-console',version:'1'}});
 if(m==='ping')return conRpcR(id,{});
 if(m==='tools/list')return conRpcR(id,{tools:CON_TOOLS});
 if(m==='resources/list')return conRpcR(id,{resources:[{uri:CON_URI,name:'questions',mimeType:'text/html;profile=mcp-app'}]});
 if(m==='resources/read'){if(!b.params||b.params.uri!==CON_URI)return conRpcE(id,-32002,'resource not found');
  return conRpcR(id,{contents:[{uri:CON_URI,mimeType:'text/html;profile=mcp-app',text:conCardHtml(await conNewOtc(env)),_meta:{ui:{prefersBorder:false}}}]});}
 if(m==='tools/call'){const n=b.params&&b.params.name;if(!CON_TOOLS.some(t=>t.name===n))return conRpcE(id,-32602,'unknown tool');
  return conRpcR(id,await conTool(n,b.params.arguments||{},env));}
 return conRpcE(id,-32601,'method not found');}
async function consoleMcp(req,env,u){const p=u.pathname;if(p==='/mcp')return conMcp(req,env,u);return conOauth(req,env,u);}
