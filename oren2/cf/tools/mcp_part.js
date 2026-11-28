/* #674 MCP server (POST /api/mcp, JSON-RPC over HTTP, "Streamable HTTP" without streaming) so Claude / ChatGPT can analyze Oren's day.
   PRIVATE: every call (also GET) needs `Authorization: Bearer <MCP_TOKEN>` (Pages secret; no secret = the server is off, 401). Not the DIAG_KEY / LOG_READ_KEY.
   Revoke = set a new MCP_TOKEN secret (and redeploy): the old one is dead at once. The token is never accepted in a URL.
   Read tools: get_day_summary, get_play_log, get_progress (only whitelisted fields of the save: never the parent password, the family id or any key).
   Write tools = only what the parent panel can already do: send_message, send_reminder (set.rem), change_plan (set.pc command, same format as the panel),
   pause_today / resume_today (set.lim.today). No delete tool. Each write is appended to set.mcpLog (newest 30; shown in the parent panel under the reminder tab).
   Limits per token: MCP_RATE calls/minute (60), MCP_WRITES writes/hour (60); counters live in the worker instance. */
const MCP_FAM='a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0',MCP_MAXMSG=120,MCP_PLAN=['drop','add','up','down','off','know','reset','new'],MCP_REM=['water','toilet','eat'];
const mcpCnt=new Map();
function mcpHit(k,lim){const now=Date.now();for(const [a,v] of mcpCnt)if(v.e<now)mcpCnt.delete(a);const v=mcpCnt.get(k)||{n:0,e:0};if(!v.e)v.e=now+(k.startsWith('w')?36e5:6e4);v.n++;mcpCnt.set(k,v);return v.n<=lim;}
const mcpR=(id,result)=>J({jsonrpc:'2.0',id:id==null?null:id,result});
const mcpE=(id,code,message)=>J({jsonrpc:'2.0',id:id==null?null:id,error:{code,message}});
const mcpT=(o,err)=>({content:[{type:'text',text:typeof o==='string'?o:JSON.stringify(o)}],isError:!!err});
const MCP_TOOLS=[
 {name:'get_day_summary',description:"Summary of one day of Oren's play: minutes, sessions, questions, right/wrong, per-mission results, help used, errors. Default today.",inputSchema:{type:'object',properties:{day:{type:'string',description:'YYYY-MM-DD, default today'}}}},
 {name:'get_play_log',description:"The newest raw play events (missions opened, questions, answers with right/wrong and time, help, errors), newest first. Optional day and limit (max 200).",inputSchema:{type:'object',properties:{day:{type:'string',description:'YYYY-MM-DD, default: any day'},limit:{type:'integer',description:'1-200, default 50'}}}},
 {name:'get_progress',description:"Oren's progress: gems, mission stars, minutes played per day (last 14 days), learning levels.",inputSchema:{type:'object',properties:{}}},
 {name:'send_message',description:'Parent message that the friend in the game says aloud to Oren (max 120 characters, Hebrew without nikud is fine). Same as the parent panel.',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']}},
 {name:'send_reminder',description:'A reminder for Oren: water, toilet or eat, now or in up to 60 minutes. Same as the parent panel.',inputSchema:{type:'object',properties:{kind:{type:'string',enum:MCP_REM},in_minutes:{type:'integer',description:'0-60, default 0'}},required:['kind']}},
 {name:'change_plan',description:"Change today's mission plan like the parent panel: drop/add/up/down a mission, off (a topic not today), know (he knows this level), reset (back to the regular plan) or new (a new path). 'mission' = the mission/step id for drop, add, up, down, know; the topic id for off.",inputSchema:{type:'object',properties:{op:{type:'string',enum:MCP_PLAN},mission:{type:'string'}},required:['op']}},
 {name:'pause_today',description:"Stop play for today (today's limit = what he has already played). Back to normal tomorrow, or call resume_today.",inputSchema:{type:'object',properties:{}}},
 {name:'resume_today',description:"Undo pause_today: today's limit goes back to the regular daily limit.",inputSchema:{type:'object',properties:{}}}];
async function mcpAuth(req,env){const m=/^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization')||'');const t=env.MCP_TOKEN;
 if(!m||typeof t!=='string'||t.length<20)return null;const a=await sha(m[1]);return a===(await sha(t))?a:null;}
async function mcpTz(env){try{const r=await env.DB.prepare('SELECT tz FROM evlog ORDER BY id DESC LIMIT 1').first();return r?+r.tz||0:0;}catch(e){return 0;}}
const mcpDay=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&!isNaN(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
async function mcpSave(env){let o=null;try{o=JSON.parse(await kvGet(env,MCP_FAM));}catch(e){}return o&&typeof o==='object'&&o.v===4?o:null;}
async function mcpLogRows(env,n){await evInit(env);return ((await env.DB.prepare('SELECT sid,at,tz,ev FROM evlog ORDER BY id DESC LIMIT ?').bind(n).all()).results)||[];}
async function mcpRead(name,a,env){const now=Date.now();
 if(!env.DB&&name!=='get_progress')return mcpT('no database',1);
 if(name==='get_day_summary'){await evInit(env);const tz=await mcpTz(env),day=a.day==null?evDay(now,tz):a.day;if(!mcpDay(day))return mcpT('day must be YYYY-MM-DD',1);
  const days=Math.max(1,Math.min(30,Math.ceil((now-Date.parse(day+'T00:00:00Z'))/864e5)+1));
  const rows=((await env.DB.prepare('SELECT sid,at,tz,ev FROM evlog WHERE at>=? ORDER BY id').bind(now-(days+1)*864e5).all()).results)||[];
  const D=(evSummary(rows,days,now)||[]).find(x=>x.day===day)||{day,min:0,sessions:0,questions:0,right:0,wrong:0,missions:{}};return mcpT(D);}
 if(name==='get_play_log'){const lim=Math.max(1,Math.min(200,Math.round(+a.limit||50)));if(a.day!=null&&!mcpDay(a.day))return mcpT('day must be YYYY-MM-DD',1);
  const rows=await mcpLogRows(env,60),out=[];
  for(const r of rows){let L=[];try{L=JSON.parse(r.ev)||[];}catch(e){}
   for(let j=L.length-1;j>=0&&out.length<lim;j--){const t=+L[j].t||r.at;if(a.day&&evDay(t,+r.tz||0)!==a.day)continue;out.push(Object.assign({},L[j],{t,sid:L[j].osid||r.sid}));}
   if(out.length>=lim)break;}return mcpT({events:out});}
 if(name==='get_progress'){const s=await mcpSave(env);if(!s)return mcpT('no save yet',1);const days=Object.keys(s.time||{}).sort().slice(-14),min={};days.forEach(d=>{min[d]=Math.round((+s.time[d]||0)/60);});
  const k=(s.lrn&&s.lrn.k)||{},lv={};Object.keys(k).slice(0,200).forEach(x=>{if(k[x]&&typeof k[x]==='object')lv[x]=k[x].l||1;});
  const st={};Object.keys(s.s||{}).slice(0,400).forEach(x=>{if(typeof s.s[x]==='number')st[x]=s.s[x];});
  return mcpT({gems:+s.gems||0,stars:st,minutes:min,levels:lv});}
 return null;}
/* writes: read the family save, change ONE field of set, bump setT (the devices take newer settings), log it, write it back */
async function mcpWrite(name,a,env,tokH){if(!mcpHit('w'+tokH,+env.MCP_WRITES||60))return mcpT('write limit reached (per hour); try later',1);
 const s=await mcpSave(env);if(!s)return mcpT('no save yet',1);const now=Date.now(),set=s.set=(s.set&&typeof s.set==='object')?s.set:{};let note='';
 if(name==='send_message'){const x=typeof a.text==='string'?a.text.trim():'';if(!x||x.length>MCP_MAXMSG)return mcpT('text must be 1-'+MCP_MAXMSG+' characters',1);set.rem={k:'msg',x,at:now,t:now,to:'kid',by:'ai'};note=x;}
 else if(name==='send_reminder'){const m=a.in_minutes==null?0:+a.in_minutes;if(!MCP_REM.includes(a.kind)||!(m>=0&&m<=60)||m!==Math.floor(m))return mcpT('kind water|toilet|eat, in_minutes 0-60',1);set.rem={k:a.kind,at:now+m*6e4,t:now,to:'kid',by:'ai'};note=a.kind+' +'+m;}
 else if(name==='change_plan'){const op=a.op,need=op!=='reset'&&op!=='new';if(!MCP_PLAN.includes(op))return mcpT('op must be one of '+MCP_PLAN.join(),1);
  if(need&&!(typeof a.mission==='string'&&/^[\w:.-]{1,40}$/.test(a.mission)))return mcpT('mission id needed for '+op,1);
  const day=evDay(now,await mcpTz(env)),c={i:now.toString(36)+Math.random().toString(36).slice(2,6),k:op,d:day,t:now,to:'kid',by:'ai'};if(need)c.a=a.mission;
  set.pc=[...(Array.isArray(set.pc)?set.pc:[]).filter(x=>x&&x.d===day),c].slice(-40);note=op+(need?' '+a.mission:'');}
 else if(name==='pause_today'||name==='resume_today'){const day=evDay(now,await mcpTz(env)),l=set.lim=(set.lim&&typeof set.lim==='object')?set.lim:{daily:0,bed:0,today:null};
  l.today=name==='pause_today'?{d:day,min:Math.floor((+((s.time||{})[day])||0)/60)}:null;}
 else return null;
 set.mcpLog=[...(Array.isArray(set.mcpLog)?set.mcpLog:[]),{t:now,tool:name,x:note.slice(0,120)}].slice(-30);
 s.setT=Math.max(now,(+s.setT||0)+1);await kvPut(env,MCP_FAM,JSON.stringify(s));return mcpT({ok:true});}
async function mcp(req,env){const tokH=await mcpAuth(req,env);
 if(!tokH)return new Response('{"error":"unauthorized"}',{status:401,headers:Object.assign({'www-authenticate':'Bearer'},JH)});
 if(req.method!=='POST')return J({error:'method'},405);
 if(!mcpHit('r'+tokH,+env.MCP_RATE||60))return new Response('{"error":"rate limited"}',{status:429,headers:Object.assign({'retry-after':'60'},JH)});
 const t=await req.text();let o;if(t.length>20000)return mcpE(null,-32600,'too big');
 try{o=JSON.parse(t);if(!o||typeof o!=='object'||Array.isArray(o))throw 0;}catch(e){return mcpE(null,-32700,'parse error');}
 if(o.id===undefined&&typeof o.method==='string')return new Response(null,{status:202});/* a notification */
 const id=o.id,p=o.params&&typeof o.params==='object'?o.params:{};
 if(o.method==='initialize')return mcpR(id,{protocolVersion:typeof p.protocolVersion==='string'?p.protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'oren-day',version:'1'}});
 if(o.method==='ping')return mcpR(id,{});
 if(o.method==='tools/list')return mcpR(id,{tools:MCP_TOOLS});
 if(o.method==='tools/call'){const name=String(p.name||''),a=p.arguments&&typeof p.arguments==='object'?p.arguments:{};
  if(!MCP_TOOLS.some(x=>x.name===name))return mcpE(id,-32602,'unknown tool');
  try{const r=(await mcpRead(name,a,env))||(await mcpWrite(name,a,env,tokH));return mcpR(id,r);}catch(e){return mcpR(id,mcpT('failed: '+String(e&&e.message||e).slice(0,100),1));}}
 return mcpE(id,-32601,'method not found');}
