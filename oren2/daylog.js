/* ===== DAY LOG: everything Oren did, for the parent (also from another house, in real time through the family save) =====
   save.alog[day].e = [[min, id, stars, ok, n, helped, o], ...]   min = minutes after midnight when it started,
     ok/n = right on the first try / questions, o: 'c' done · 'q' left in the middle · 's' a path step he did not reach · 'b' stopped for a break
   save.now = {id, t}  the activity being played and the last moment something happened (ms) — "playing now" for the parent.
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
const now=t=>{if(O.isParentPlay)return;S().now={id:cur?cur.id:null,t:t||Date.now()};};
function begin(id){if(O.isParentPlay)return;if(cur&&!cur.end)end(cur.brk?'b':'q');cur={id,t:Date.now(),d:day(),ok:0,n:0,help:0};now();}
function end(o,st){const c=cur;if(!c||c.end)return;c.end=1;if(o!=='c'&&!c.n&&Date.now()-c.t<15000){cur=null;return;}   /* opened and closed at once: not worth a line */
  add(c.d,[minOf(c.t),c.id,st|0,c.ok,c.n,c.help,o]);now();cur=null;O.persist();}
DL.begin=begin;DL.end=end;DL.cur=()=>cur;
/* a round that ends again and again ("again"): each finish is its own line */
function done(id,st){if(O.isParentPlay)return;if(cur&&cur.id===id&&!cur.end){end('c',st);return;}if(cur&&!cur.end)end('q');
  const t=Date.now();add(day(),[minOf(t),id,st|0,0,0,0,'c']);S().now={id:null,t};O.persist();}
O.on('tlDone',(id,st)=>done(id,st!=null?st:((T.S().tl[id]||{}).s|0)));
O.on('levelDone',(lv,st)=>{if(lv&&lv.id)done('lv:'+lv.id,st);});
O.on('tq',(id,ok)=>{if(cur&&!cur.end){cur.n++;if(ok)cur.ok++;now();}});
O.on('ans',(u,ok)=>{if(cur&&!cur.end){cur.n++;if(ok)cur.ok++;now();}});
O.on('help',()=>{if(cur&&!cur.end)cur.help++;});
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
const ICO={c:'✓',q:'✗',s:'⏭',b:'⏸'},WHY={c:'',q:'יצא באמצע',s:'לא הגיע',b:'הפסקה'};
DL.rows=d=>{const L=((O.realSave.alog||{})[d]||{}).e||[];return L.slice().sort((a,b)=>a[0]-b[0]);};
DL.rowHTML=e=>{const [m,id,st,ok,n,hp,o]=e;const res=[st&&o==='c'?'⭐'.repeat(Math.min(3,st)):'',n?`${ok}/${n} נכון בניסיון ראשון`:'',hp?`עזרה ×${hp}`:'',WHY[o]].filter(Boolean).join(' · ');
  return `<div class="prow dlrow dl-${o}"><span class="pn"><b class="dli">${ICO[o]||''}</b> ${o==='s'?'':hhmm(m)+' · '}${DL.nameOf(id)} <small>${DL.domOf(id)}</small></span><span class="pc">${res}</span></div>`;};
/* the top line of the summary: playing now / last played */
DL.nowLine=()=>{const nw=O.realSave.now;if(!nw||!nw.t)return '';const ago=Date.now()-nw.t;const nm=nw.id?DL.nameOf(nw.id):'';
  if(ago<3*60000)return `<div class="dlnow on">🟢 אורן משחק עכשיו${nm?': '+nm:''} · ${ago<60000?'עכשיו':'לפני '+Math.round(ago/60000)+' דק׳'}</div>`;
  const d=new Date(nw.t),t0=new Date();const same=d.toDateString()===t0.toDateString();const y=new Date(t0);y.setDate(t0.getDate()-1);
  const when=same?'היום':d.toDateString()===y.toDateString()?'אתמול':pad(d.getDate())+'.'+pad(d.getMonth()+1);
  return `<div class="dlnow">שיחק לאחרונה: ${when} ${pad(d.getHours())}:${pad(d.getMinutes())}</div>`;};
DL.hhmm=hhmm;
/* family merge: the log lines of a day from the other device are added (same line = once); "playing now" keeps the newer one */
DL.merge=(save,o)=>{for(const d in o.alog||{}){const src=(o.alog[d]||{}).e;if(!Array.isArray(src)||!src.length)continue;const L=(save.alog[d]=save.alog[d]||{a:{},s:0,k:{}});L.e=L.e||[];
    const have=new Set(L.e.map(x=>JSON.stringify(x)));src.forEach(x=>{const k=JSON.stringify(x);if(!have.has(k)){have.add(k);L.e.push(x);}});
    L.e.sort((a,b)=>a[0]-b[0]);if(L.e.length>MAXE)L.e.splice(0,L.e.length-MAXE);}
  if(o.now&&(+o.now.t||0)>(+(save.now||{}).t||0))save.now=o.now;trim();};
/* parent panel, day tab: "playing now" and what he did today and yesterday, one line each. Tap a day to see its lines. */
const rowsHTML=d=>{const r=DL.rows(d);return r.length?r.map(DL.rowHTML).join(''):'<div class="pnote">עוד לא שיחק</div>';};
DL.panel=(box,sec)=>{const s=sec(box,'מה אורן עשה','<div class="dlnowbox">'+DL.nowLine()+'</div>');
  const ds=[0,1].map(i=>{const x=new Date();x.setDate(x.getDate()-i);return x;});
  ds.forEach((x,i)=>{const d=x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate());const det=document.createElement('details');det.className='pdet';if(i===0)det.open=true;
    det.innerHTML=`<summary>${i?'אתמול':'היום'}</summary><div class="pdin dllog" data-d="${d}">${rowsHTML(d)}</div>`;s.appendChild(det);});return s;};
/* top line of the summary tab */
DL.nowBox=box=>{const d=document.createElement('div');d.className='dlnowbox';d.innerHTML=DL.nowLine();box.appendChild(d);};
/* redraw the live parts (called after each family pull while the parent panel is open) */
DL.refresh=()=>{document.querySelectorAll('.dlnowbox').forEach(e=>{e.innerHTML=DL.nowLine();});document.querySelectorAll('.dllog[data-d]').forEach(e=>{e.innerHTML=rowsHTML(e.dataset.d);});};
})();
