/* ===== DAY LOG: everything Oren did, for the parent (also from another house, in real time through the family save) =====
   save.alog[day].e = [[min, id, stars, ok, n, helped, o], ...]   min = minutes after midnight when it started,
     ok/n = right on the first try / questions, o: 'c' done · 'q' left in the middle · 'x' opened and closed at once (only for Oren's "again" list) · 's' a path step he did not reach · 'b' stopped for a break
     · 'f' his answer to 'easy or hard?' at the end of a scene (#411, x.ez 'e' easy · 'h' hard)
     · 'h' his answer to the friend's hero challenge (#681, x.hr 'y' took it · 'n' not now; x.ok / x.n = right / questions of the round)
     · 'p' skipped by the parent (#359, x.pc = the command id; hidden when that command was undone: save.pcU[id])
     · 'k' Oren skipped the activity himself (#616); x.sk = his skips in it (any line: questions skipped, shown "דילג ×N"; the day's count for the parent's limit)
   x (optional object): a story's {t, g, lv, r} (#355); lg = what he learned, on a finished line (#414, goals.js); any activity: lv = his level when it started (learning engine), ra = taps on read-aloud (#359; shown "9 הקראות", #612)
   save.now = {id, t, s, dv}  the activity being played, the last moment something happened (ms; also each active play tick, the heartbeat) and when this play
     session started (s; a new session after 3+ min without a heartbeat) — "playing now · N min (from HH:MM)" for the parent (#352).
   x.sc = seconds he spent in it (#660, from 30 s; shown as minutes)
   Detailed entries are kept for 14 days (think.js keeps the day counts for 35). Parent text has no nikud. */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;
const DL=window.DAYLOG={};
const S=()=>O.save;
const day=()=>O.today();
const pad=n=>String(n).padStart(2,'0');
const minOf=t=>{const d=new Date(t);return d.getHours()*60+d.getMinutes();};
const hhmm=m=>pad(m/60|0)+':'+pad(m%60);
const MAXE=80,KEEP=14;
const plain=s=>T.plainHe?T.plainHe(String(s||'')):String(s||'');
function logOf(d){const s=S();s.alog=s.alog||{};const L=s.alog[d]||(s.alog[d]={a:{},s:0,k:{}});L.e=L.e||[];return L;}
function trim(){const s=S();const ks=Object.keys(s.alog||{}).sort();ks.slice(0,Math.max(0,ks.length-KEEP)).forEach(k=>{if(s.alog[k])delete s.alog[k].e;});}
function add(d,e){if(O.isParentPlay)return;const L=logOf(d);L.e.push(e);if(L.e.length>MAXE)L.e.splice(0,L.e.length-MAXE);trim();}
DL.add=add;

/* ---------- the activity being played ---------- */
let cur=null;
const GAP=3*60000;
/* dv: this device (#617: the latest heartbeat's device takes the parent's commands); another device that just used the parent panel gives no heartbeat (his own device keeps it) */
const mark=id=>{if(O.isParentPlay||(O.parBusy&&O.parBusy()))return;const t=Date.now(),p=S().now;S().now={id,t,s:p&&p.s&&t-(+p.t||0)<GAP?p.s:t,dv:O.dev};};
const now=()=>mark(cur?cur.id:null);
/* the heartbeat: every active play tick (talents.js timeTick, which saves anyway) — never from the parent panel */
DL.beat=()=>{const par=document.querySelector('#sPar');if(par&&!par.hidden)return;mark(cur&&!cur.end?cur.id:null);};
const lvOf=id=>{const k=((O.save.lrn||{}).k||{})['a:'+id];return k&&k.n?k.l|0:0;};
function begin(id){if(O.isParentPlay)return;if(O.hereBegin)O.hereBegin(id);/* #44 the place Oren is in */if(cur&&!cur.end)end(cur.brk?'b':'q');cur={id,t:Date.now(),d:day(),ok:0,n:0,help:0,ra:0,lv:lvOf(id)};now();O.emit('dlBegin',id);}
function end(o,st){const c=cur;if(!c||c.end)return;c.end=1;evEnd(c.id,o,c.t);if(o!=='c'&&o!=='p'&&o!=='k'&&!c.n&&Date.now()-c.t<15000)o='x';   /* opened and closed at once: 'x' — kept for Oren's "again" list, not shown to the parent */
  const x=Object.assign({},c.x||{});if(c.lv&&x.lv==null)x.lv=c.lv;if(c.ra)x.ra=c.ra;{const sc=Math.round((Date.now()-c.t)/1000);if(sc>=30)x.sc=Math.min(sc,7200);}/* #660 seconds in the mission */if(o==='c'){const g=lgOf(c.id,x);if(g)x.lg=g;}
  add(c.d,[minOf(c.t),c.id,st|0,c.ok,c.n,c.help,o].concat(Object.keys(x).length?[x]:[]));now();cur=null;O.persist();}
/* #414 a finished mission keeps what he learned (parent text): a story's own goal, else the mission's goal (goals.js) */
/* #730 play log: how a mission ended, once per line: mdone (finished) · mskip (Oren skipped it, #616/#647) · mleft (he went back early, also opened and closed at once); m = mission id, sec = seconds. Break/parent skip/path step are not events. Kinds are a-z only (the log server's rule). */
function evEnd(id,o,t){const k=o==='c'?'mdone':o==='k'?'mskip':o==='q'||o==='x'?'mleft':'';if(k&&O.track)O.track(k,{m:id,sec:Math.round((Date.now()-t)/1000)});}
function lgOf(id,x){const G=window.GOALS;return (x&&x.g)||(G?G.plain(id):'');}
DL.begin=begin;DL.end=end;DL.cur=()=>cur;
/* a story adds its details to its line (#355): x = {t: title, g: goal, lv: story level, r: 'a' read alone · 'l' listened}; the object is filled in while he plays */
DL.note=(id,x)=>{if(O.isParentPlay)return;if(!cur||cur.end||cur.id!==id||cur.x)begin(id);if(cur.x&&cur.x.sk&&x)x.sk=cur.x.sk;cur.x=x;};
/* a round that ends again and again ("again"): each finish is its own line */
function done(id,st){if(O.isParentPlay)return;if(cur&&cur.id===id&&!cur.end){end('c',st);return;}if(cur&&!cur.end)end('q');
  const t=Date.now(),g=lgOf(id);evEnd(id,'c',t);add(day(),[minOf(t),id,st|0,0,0,0,'c'].concat(g?[{lg:g}]:[]));mark(null);O.persist();}
O.on('tlDone',(id,st)=>done(id,st!=null?st:((T.S().tl[id]||{}).s|0)));
O.on('levelDone',(lv,st)=>{if(lv&&lv.id)done('lv:'+lv.id,st);});
O.on('tq',(id,ok)=>{if(cur&&!cur.end){cur.n++;if(ok)cur.ok++;now();}});
O.on('ans',(u,ok)=>{if(cur&&!cur.end){cur.n++;if(ok)cur.ok++;now();}});
O.on('help',()=>{if(cur&&!cur.end)cur.help++;});
/* #359: the help layer reports through O.track('help'); a tap on a read-aloud button (🔊) counts as read-aloud */
if(O.track&&!O.track._dl){const tr=O.track;O.track=function(k,...a){if(k==='help'&&cur&&!cur.end)cur.help++;return tr.call(this,k,...a);};O.track._dl=1;}
document.addEventListener('click',e=>{const b=e.target&&e.target.closest&&e.target.closest('.rdb,.hagain');if(b&&cur&&!cur.end)cur.ra++;},true);
/* math levels start through the play screen; leaving to the map / city / home without finishing = left in the middle */
const ACTIVE=new Set(['sTal','sPlay','sLearn']);
O.on('screen',id=>{if(id==='sPlay')setTimeout(()=>{const p=window.__oren4&&window.__oren4.play;if(p&&p.lv&&p.lv.type!=='train'&&(!cur||cur.id!=='lv:'+p.lv.id||cur.end))begin('lv:'+p.lv.id);},0);
  else if(!ACTIVE.has(id)&&cur&&!cur.end)end(cur.brk?'b':'q');});
['hub','group','map'].forEach(e=>O.on(e,()=>{if(cur&&!cur.end)end(cur.brk?'b':'q');}));
/* a health break while playing */
try{new MutationObserver(()=>{if(cur&&!cur.end&&document.body.classList.contains('hlocked'))cur.brk=1;}).observe(document.body,{attributes:true,attributeFilter:['class']});}catch(e){}
/* every activity's run() opens a log line */
DL.wrap=()=>{Object.values(T.ACT).forEach(a=>{if(a._dl||typeof a.run!=='function')return;const r=a.run;a.run=function(...x){begin(a.id);return r.apply(this,x);};a._dl=1;});};
/* path steps of an earlier day that he did not reach */
function pathLeft(){const s=S(),dl=s.daily;if(!dl||!dl.t||dl.d===day()||dl.lg)return;dl.lg=1;
  const L=logOf(dl.d);dl.t.forEach((x,i)=>{if(!dl.done[i]&&!/^(tog|rw):/.test(x))L.e.push([23*60+59,x,0,0,0,0,'s']);});}
DL.pathLeft=pathLeft;

/* ---------- for the parent ---------- */
const GN=()=>Object.fromEntries((T.GROUPS||[]).map(g=>[g.id,plain(g.n)]));
DL.nameOf=id=>{if(id==='math')return 'מסע החשבון';
  if(/^lv:/.test(id)){const lv=O.ALLLV.find(l=>l.id===id.slice(3));return lv?`${plain(lv.u.name)} (${plain(lv.w.name)})`:'חשבון';}
  const a=T.ACT[id];return a?plain(a.name):id;};
DL.domOf=id=>{if(id==='math'||/^lv:/.test(id))return 'חשבון';const a=T.ACT[id];if(!a||!a.b)return '';const g=(T.GROUPS||[]).find(x=>x.ids.includes(a.b.id));return g?GN()[g.id]:plain(a.b.name);};
const ICO={c:'✓',q:'✗',s:'⏭',b:'⏸',p:'⏭',k:'⏭',f:'💬',h:'🦸'},WHY={c:'',q:'יצא באמצע',s:'לא הגיע',b:'הפסקה',p:'דילג (הורה)',k:'',f:'',h:''};
/* a bank story's own quiz line (rb2-st-N) repeats its 'story-new' line: not shown */
const undone=e=>e[6]==='p'&&e[7]&&(O.realSave.pcU||{})[e[7].pc];
DL.rows=d=>{const L=((O.realSave.alog||{})[d]||{}).e||[];return L.filter(e=>e[6]!=='x'&&!/^rb2-st-/.test(e[1])&&!undone(e)).sort((a,b)=>a[0]-b[0]);};
/* #660 hard for him: he said so, or fewer than half right on the first try (3+ questions) */
DL.hard=e=>{const x=e[7]&&typeof e[7]==='object'?e[7]:null;return (!!x&&x.ez==='h')||(e[6]!=='f'&&e[6]!=='p'&&e[6]!=='k'&&e[6]!=='s'&&e[6]!=='b'&&e[4]>=3&&e[3]*2<e[4]);};
/* #660 the day in one line, from the same rows as the list (so the two never disagree): done · left in the middle · skipped · right of questions · help · what was hard */
DL.sum=rows=>{const r={done:0,left:0,skip:0,q:0,ok:0,help:0,hard:[]};
  rows.forEach(e=>{const o=e[6];if(o==='c')r.done++;else if(o==='q')r.left++;else if(o==='p'||o==='k')r.skip++;
    if(o!=='f'&&o!=='p'&&o!=='s'&&o!=='b'&&o!=='newday'){r.q+=e[4]|0;r.ok+=e[3]|0;r.help+=e[5]|0;}
    if(e[1]!=='newday'&&DL.hard(e)){const n=DL.nameOf(e[1]);if(!r.hard.includes(n))r.hard.push(n);}});return r;};
DL.sumHTML=rows=>{const r=DL.sum(rows);const a=[];if(r.done)a.push(r.done===1?'משימה אחת הושלמה':`${r.done} משימות הושלמו`);if(r.left)a.push(`${r.left} יצא באמצע`);if(r.skip)a.push(`דילג על ${r.skip}`);
  if(r.q)a.push(`${r.ok} מתוך ${r.q} נכון בניסיון ראשון`);if(r.help)a.push(`עזרה ×${r.help}`);
  return a.length||r.hard.length?`<div class="dlsum">${a.join(' · ')}${r.hard.length?`<div class="dlhard">קשה לו: ${r.hard.join(', ')}</div>`:''}</div>`:'';};
DL.rowHTML=e=>{const [m,id,st,ok,n,hp,o,x]=e;const sx=x&&typeof x==='object'?x:null;
  if(id==='newday')return `<div class="prow dlrow dl-p"><span class="pn"><b class="dli">🌅</b> ${hhmm(m)} · יום חדש</span><span class="pc">מסלול חדש (הורה)</span></div>`;   /* #648 */
  const story=sx&&sx.t;
  const res=[sx&&sx.sc?`${Math.max(1,Math.round(sx.sc/60))} דק׳`:'',st&&o==='c'?'⭐'.repeat(Math.min(3,st)):'',n?`✓ ${ok} · ✗ ${n-ok}`:'',sx&&sx.lv?'רמה '+(sx.lv|0):'',hp?`עזרה ×${hp}`:'',sx&&sx.sk?`דילג ×${sx.sk|0}`:'',story?(sx.r==='l'?'האזין להקראה':'קרא לבד'):'',sx&&sx.ra?(sx.ra===1?'הקראה אחת':`${sx.ra} הקראות`):'',DL.hard(e)&&!(sx&&sx.ez==='h')?'היה לו קשה':'',sx&&sx.hr?(sx.hr==='y'?`אתגר גיבורים: ${sx.ok|0} מתוך ${sx.n|0}`:'דחה אתגר גיבורים'):'',sx&&sx.ez?(sx.ez==='h'?'אמר: היה קשה 😣':'אמר: היה קל 😀'):'',WHY[o]].filter(Boolean).join(' · ');
  const name=story?`${plain(sx.t)}${sx.g?` <span class="dlgoal">🎯 ${plain(sx.g)}</span>`:''}`:DL.nameOf(id);
  return `<div class="prow dlrow dl-${o}"><span class="pn"><b class="dli">${ICO[o]||''}</b> ${o==='s'?'':hhmm(m)+' · '}${name} <small>${DL.domOf(id)}</small></span><span class="pc">${res}</span></div>`;};
/* the top line of the summary: playing now / last played */
DL.playing=()=>{const nw=O.realSave.now;return !!(nw&&nw.t&&Date.now()-nw.t<GAP);};
DL.nowLine=()=>{const nw=O.realSave.now;if(!nw||!nw.t)return '';
  if(DL.playing()){const s=+nw.s||nw.t,d=new Date(s);return `<div class="dlnow on">🟢 משחק עכשיו · ${Math.max(0,Math.round((Date.now()-s)/60000))} דק׳ (מ-${pad(d.getHours())}:${pad(d.getMinutes())})</div>`;}
  const d=new Date(nw.t),t0=new Date();const same=d.toDateString()===t0.toDateString();const y=new Date(t0);y.setDate(t0.getDate()-1);
  const when=same?'היום':d.toDateString()===y.toDateString()?'אתמול':pad(d.getDate())+'.'+pad(d.getMonth()+1);
  return `<div class="dlnow">שיחק לאחרונה: ${when} ${pad(d.getHours())}:${pad(d.getMinutes())}</div>`;};
DL.hhmm=hhmm;
/* family merge: the log lines of a day from the other device are added (same line = once); "playing now" keeps the newer one */
DL.merge=(save,o)=>{for(const d in o.alog||{}){const src=(o.alog[d]||{}).e;if(!Array.isArray(src)||!src.length)continue;const L=(save.alog[d]=save.alog[d]||{a:{},s:0,k:{}});L.e=L.e||[];
    const have=new Set(L.e.map(x=>JSON.stringify(x)));src.forEach(x=>{const k=JSON.stringify(x);if(!have.has(k)){have.add(k);L.e.push(x);}});
    L.e.sort((a,b)=>a[0]-b[0]);if(L.e.length>MAXE)L.e.splice(0,L.e.length-MAXE);}
  if(o.now&&(+o.now.t||0)>(+(save.now||{}).t||0))save.now=o.now;trim();};
/* the parent's day view (pday.js, #359) draws DL.rows(d) with DL.rowHTML */
})();
