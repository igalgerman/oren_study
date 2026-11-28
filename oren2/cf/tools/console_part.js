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
