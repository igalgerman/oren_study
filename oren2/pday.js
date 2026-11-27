/* ===== PARENT DAY VIEW (#359): one day at a time — what he did (live), the plan ahead, how he does per topic =====
   Parent commands travel in save.set.pc (settings are newer-wins by setT and sent at once): [{i, k, a, d (day), t}]
     k: 'now' skip what he plays now · 'drop' a planned mission (a = step id) · 'up' / 'down' (a = step id) · 'add' (a = step id)
        'off' a topic not today (a = topic id) · 'know' he already knows the level of a mission (a = step id) · 'reset' back to the regular plan
        'undo' (a = the command id) · 'new' a new path now, of missions he did not do today (#648)
   #614: the list is joined by id when two copies meet (index.html pcJoin), so a command is never taken out of it: an 'undo' calls it off.
   Oren's device applies each command once (save.pcA[id] = time, max-merged), only where Oren played today (a local flag, so the
   parent's phone never applies them), and checks for new ones every ~12 s while he plays (a read; it writes only when a command came).
   Every skip is a 'p' line in the day log ("דילג (הורה)", x = {pc, k, at, ...} = what undo needs); undo = save.pcU[id] (max-merged).
   A skip never counts as a failure, never lowers a level and gives no stars. Parent text has no nikud. */
(()=>{'use strict';const O=window.OREN,T=window.TAL,DL=window.DAYLOG;if(!O||!T||!DL)return;
const P=window.PDAY={};
const h=O.h;
const D=O.D||(x=>x);
const today=()=>O.today();
const pad=n=>String(n).padStart(2,'0');
const plain=s=>T.plainHe(String(s||''));
const dayKey=x=>x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate());
const dayAt=back=>{const x=new Date();x.setDate(x.getDate()-back);return dayKey(x);};
const TOP={math:'🧮 חשבון',readg:'📖 קריאה וכתיבה',explore:'🔬 חוקרים וחושבים',create:'🎨 יוצרים',calm:'🍃 נרגעים'};
const topOf=id=>{id=String(id||'');if(id==='math'||id==='ln-math'||/^lv:/.test(id))return 'math';const a=T.ACT[id];if(!a||!a.b)return null;
  const g=(T.GROUPS||[]).find(x=>x.ids.includes(a.b.id));return g?g.id:null;};
const lrn=()=>((O.realSave.lrn||{}).k)||{};
const lvOf=id=>{const k=lrn()['a:'+id];return k?k.l||1:0;};
P.topOf=topOf;

/* ---------- commands ---------- */
const SETS=()=>{const s=O.save;s.set=s.set||{};return s.set;};
const cmds=()=>(((O.realSave.set||{}).pc)||[]).filter(c=>c&&c.d===today());
const isDone=c=>!!(O.realSave.pcA||{})[c.i];
const isUndone=i=>!!(O.realSave.pcU||{})[i];
const called=i=>cmds().some(x=>x.k==='undo'&&x.a===i);   /* the parent pressed בטל on it */
const waiting=c=>!isDone(c)&&!called(c.i);
P.cmds=cmds;
/* #617: a command is for Oren's play device (to) and never taken on the device that sent it (by) */
P.send=(k,a)=>{const st=SETS();const c={i:Date.now().toString(36)+Math.random().toString(36).slice(2,6),k,d:today(),t:Date.now(),to:'kid',by:O.dev};if(a!=null)c.a=a;
  st.pc=[...(st.pc||[]).filter(x=>x&&x.d===today()),c].slice(-40);O.persist(1);if(O.famNow)O.famNow();apply();return c;};
/* undo: an 'undo' follows the command; Oren's device then never runs it (if it did not yet), or takes it back (if it did meanwhile) */
P.undo=i=>P.send('undo',i);

/* the plan part of a command, on any copy of today's path (Oren's real one, or the parent's preview) */
const open=(d,j)=>j>=0&&j<d.t.length&&!d.done[j];
const firstOpen=(d,id)=>d.t.findIndex((x,n)=>x===id&&!d.done[n]);
function planOp(d,c,log){const keep=()=>{if(!d.po)d.po={t:d.t.slice()};};
  if(c.k==='drop'){const j=firstOpen(d,c.a);if(j<0)return;keep();d.t.splice(j,1);d.done.splice(j,1);log&&log(c.a,{k:'drop',at:j});}
  else if(c.k==='off'){const js=d.t.map((x,n)=>!d.done[n]&&topOf(x)===c.a?n:-1).filter(n=>n>=0);if(!js.length)return;keep();
    d.tm=d.tm||[];js.reverse().forEach(j=>{const id=d.t[j];d.t.splice(j,1);d.done.splice(j,1);d.tm.unshift(id);log&&log(id,{k:'off',at:j});});}   /* tm: they come back tomorrow (dailyEnsure) */
  else if(c.k==='up'||c.k==='down'){const j=firstOpen(d,c.a);if(j<0)return;let n=j;do{n+=c.k==='up'?-1:1;}while(n>=0&&n<d.t.length&&d.done[n]);
    if(!open(d,n))return;keep();[d.t[j],d.t[n]]=[d.t[n],d.t[j]];}
  else if(c.k==='add'){if(!c.a)return;keep();d.t.push(c.a);d.done.push(0);d.claimed=0;}
  else if(c.k==='reset'){if(!d.po)return;const t=[],dn=[];d.t.forEach((x,n)=>{if(d.done[n]){t.push(x);dn.push(d.done[n]);}});
    const left=d.po.t.slice();t.forEach(x=>{const k=left.indexOf(x);if(k>=0)left.splice(k,1);});left.forEach(x=>{t.push(x);dn.push(0);});d.t=t;d.done=dn;delete d.po;
    if(d.tm)d.tm=d.tm.filter(x=>!d.t.includes(x));}}
P.planOp=planOp;

/* ---------- Oren's device ---------- */
const FLAG='oren4-played';
const playedHere=()=>{try{return localStorage.getItem(FLAG)===today();}catch(e){return false;}};
/* this device is Oren's today once he chose his path or started a mission here (the parent's own phone never is) */
P.mark=()=>{if(O.isParentPlay||(O.parBusy&&O.parBusy()))return;try{localStorage.setItem(FLAG,today());}catch(e){}};
O.on('dlBegin',()=>{P.mark();if(O.isParentPlay)return;lastBegin=Date.now();setTimeout(apply,0);});
let lastBegin=0;
/* #617: Oren's play device (O.kidDev: not the parent panel's device, the latest heartbeat); without the family save, the one device */
const here=c=>O.kidDev?O.kidDev(c):!O.isParentPlay&&playedHere();
const minNow=()=>{const x=new Date();return x.getHours()*60+x.getMinutes();};
const famNow=()=>{O.persist();if(O.famNow)O.famNow();};   /* #614: the parent sees at once that his device took it */
const logP=(c,id,x)=>DL.add(today(),[minNow(),id,0,0,0,0,'p',Object.assign({pc:c.i,ts:Date.now()},x)]);
const todayLog=()=>(((O.save.alog||{})[today()]||{}).e)||[];
function run(c){const s=O.save;
  if(c.k==='now'){skipNow(c);return;}
  if(c.k==='new'){newDay(c);return;}
  if(c.k==='know'){const x={k:'know'};
    if(c.a==='math'){const lv=T.nextLevel&&T.nextLevel();if(!lv)return;s.pk=s.pk||{};s.pk[lv.id]=Date.now();x.lid=lv.id;}
    else{const L=window.LEARN;if(!L||!L.setLevel||!T.ACT[c.a])return;const sk='a:'+c.a;const l0=lvOf(c.a)||1;x.sk=sk;x.l0=l0;L.setLevel(sk,l0+1);}
    logP(c,c.a,x);return;}
  if(c.k==='undo'){if(pend&&pend.i===c.a)pend=null;const rows=todayLog().filter(e=>e[6]==='p'&&e[7]&&e[7].pc===c.a);if(!rows.length||isUndone(c.a))return;
    if(rows.some(e=>(+e[7].ts||0)<lastBegin))return;   /* too late: the next mission already started */
    const d=T.dailyEnsure();rows.slice().sort((a,b)=>a[7].at-b[7].at).forEach(e=>{const x=e[7];
      if(x.k==='drop'||x.k==='off'){const j=Math.min(Math.max(0,x.at|0),d.t.length);d.t.splice(j,0,e[1]);d.done.splice(j,0,0);}
      else if(x.k==='know'){if(x.lid){s.pkx=s.pkx||{};s.pkx[x.lid]=Date.now();}else if(x.sk&&window.LEARN)window.LEARN.setLevel(x.sk,x.l0);}});
    if(d.tm)d.tm=d.tm.filter(x=>!d.t.includes(x));s.pcU=s.pcU||{};s.pcU[c.a]=Date.now();return;}
  const d=T.dailyEnsure();
  if(c.k==='reset'){/* the skipped missions come back, so their skip lines go */s.pcU=s.pcU||{};cmds().forEach(x=>{if((x.k==='drop'||x.k==='off')&&isDone(x))s.pcU[x.i]=Date.now();});}
  planOp(d,c,(id,x)=>logP(c,id,x));}
function apply(){if(!here())return;const s=O.save;s.pcA=s.pcA||{};const L=cmds().filter(c=>!s.pcA[c.i]&&here(c));if(!L.length)return;
  L.forEach(c=>{s.pcA[c.i]=Date.now();if(c.k!=='undo'&&called(c.i))return;try{run(c);}catch(e){}});
  const ks=Object.keys(s.pcA);if(ks.length>80)ks.sort((a,b)=>s.pcA[a]-s.pcA[b]).slice(0,ks.length-80).forEach(k=>delete s.pcA[k]);
  famNow();const hm=document.querySelector('#sHome');if(hm&&!hm.hidden&&!pend)O.showMap();}
P.apply=apply;
O.on('synced',apply);O.on('screen',()=>setTimeout(apply,0));
/* while he plays: look for the parent's commands every ~12 s (a read only) */
let lastPull=0;
setInterval(()=>{if(!here()||!O.family||!O.famPull)return;const cu=DL.cur();if(!(cu&&!cu.end)&&!DL.playing())return;
  const gap=window.__pcGap!=null?window.__pcGap:12000;if(Date.now()-lastPull<gap)return;lastPull=Date.now();Promise.resolve(O.famPull()).then(apply,()=>{});},1000);

/* "skip now": at the next safe point (after his answer, never mid-tap; at most ~15 s), the friend says so and the next planned mission opens */
let pend=null,pendT=0,lastDown=0;
document.addEventListener('pointerdown',()=>{lastDown=Date.now();},true);
const SAYNEXT='בּוֹא נַעֲבֹר לְמַשֶּׁהוּ אַחֵר!';
/* c.a = what the parent saw him play: when that already ended, the skip is not moved to the next activity (#614) */
function skipNow(c){const cu=DL.cur();if(!cu||cu.end||(c.a&&cu.id!==c.a))return;pend=c;pendT=Date.now();}
const safe=()=>{if(pend)setTimeout(fire,D(900));};
O.on('ans',safe);O.on('tq',safe);
setInterval(()=>{if(pend&&Date.now()-pendT>(window.__skipWait!=null?window.__skipWait:12000)&&Date.now()-lastDown>800)fire();},500);
function fire(){const c=pend;if(!c)return;pend=null;const cu=DL.cur();if(!cu||cu.end)return;const id=cu.id;
  const d=T.dailyEnsure();const j=d.t.findIndex((x,n)=>!d.done[n]&&(x===id||(x==='math'&&/^lv:/.test(id))));if(j>=0)d.done[j]=2;
  cu.x=Object.assign(cu.x||{},{pc:c.i,k:'now',ts:Date.now()});DL.end('p');famNow();
  if(O.hush)O.hush();const el=h('div','pdskip',`<div class="card"><div class="callp bob">${T.friend?T.friend():''}</div><h2>${SAYNEXT}</h2></div>`);document.body.appendChild(el);O.say(T.spk(SAYNEXT));
  setTimeout(()=>{el.remove();const nx=d.done.findIndex(x=>!x);if(nx>=0&&window.TAL_step)window.TAL_step(nx);else O.showMap();},D(1800));}
P.pending=()=>pend;
/* #648 "new day": what he plays now ends (a parent skip), the new path is on the map at once, the friend says so (text + voice together, #635) */
const SAYNEW='יוֹם חָדָשׁ, מַסָּע חָדָשׁ!';
P.speakList=()=>[SAYNEXT,SAYNEW];
function newDay(c){const cu=DL.cur();if(cu&&!cu.end){cu.x=Object.assign(cu.x||{},{pc:c.i,k:'new',ts:Date.now()});DL.end('p');}
  pend=null;T.newDay();logP(c,'newday',{k:'new'});if(O.track)O.track('newday',{pc:c.i});
  if(O.hush)O.hush();O.showMap();const el=h('div','pdskip',`<div class="card"><div class="callp bob">${T.friend?T.friend():''}</div><h2>${SAYNEW}</h2></div>`);document.body.appendChild(el);O.say(T.spk(SAYNEW));
  setTimeout(()=>el.remove(),D(2200));}

/* ---------- #616 Oren's own skip: one small "⏭️ דַּלֵּג" next to the help button on every question screen (help.js asks P.skipBtn) ----------
   A tap reads the label, then: the next question (the host's o.skip) — or, from the first question, after 2 skips in a row, or where the
   host has no per-question skip, the whole activity: the friend says SKIPSAY and the next planned mission opens (like the parent's skip).
   Never a failure: no level change, no stars; the host puts the item back in its pool, due in 1 day (#360).
   Parent setting save.set.skip (synced with the settings): 'off' · 3 = at most 3 a day · 'all' = no limit (default, #634: no play limits).
   The day's count = x.sk on today's log lines (+ the open line), so it travels with the family save; the day view shows "דילג ×N". */
const SKIPSAY='בְּסֵדֶר, נַעֲבֹר לְמַשֶּׁהוּ אַחֵר!',SKIPLBL='דַּלֵּג',SKIPMAX=3;
if(T.addChoices)T.addChoices([SKIPLBL]);if(T.addSay)T.addSay([SKIPSAY]);
P.skipSet=()=>{const v=((O.realSave||O.save).set||{}).skip;return v==='off'?'off':+v===SKIPMAX?SKIPMAX:'all';};   /* default 'all' (the owner: no play limits, #634) */
P.skipsToday=d=>{d=d||today();const L=((((O.realSave||O.save).alog||{})[d]||{}).e)||[];const cu=DL.cur();
  return L.reduce((a,e)=>a+((e[7]&&e[7].sk)|0),0)+(d===today()&&cu&&!cu.end&&cu.x?cu.x.sk|0:0);};
P.skipCan=()=>{const m=P.skipSet();if(m==='off')return false;if(m==='all'||O.isParentPlay)return true;return P.skipsToday()<SKIPMAX;};
let skRow=0;   /* skips in a row in this activity: an answer or a new activity starts again */
O.on('tq',()=>{skRow=0;});O.on('ans',()=>{skRow=0;});O.on('dlBegin',()=>{skRow=0;});
const skCount=(n=1)=>{const cu=DL.cur();if(cu&&!cu.end){cu.x=cu.x||{};cu.x.sk=Math.max(0,(cu.x.sk|0)+n);}O.persist();};
/* o (the help button's host options): skip() = go to the next question; first() = this is the activity's first question */
P.skipBtn=o=>{if(!P.skipCan())return null;o=o||{};const b=h('button','skipbtn','<span aria-hidden="true">⏭️</span> <span>'+SKIPLBL+'</span>');b.type='button';b.setAttribute('aria-label',SKIPLBL);
  b.onclick=()=>{if(b.disabled||(O.tapTooSoon&&O.tapTooSoon()))return;b.disabled=true;if(O.sfx&&O.sfx.pop)O.sfx.pop(1);O.say(T.spk(SKIPLBL));skRow++;
    let first=false;try{first=!!(o.first&&o.first());}catch(e){}
    if(!o.skip||first||skRow>=2){skCount();skipAct();return;}
    setTimeout(()=>{skCount();let r=false;try{r=o.skip()!==false;}catch(e){}if(!r){skCount(-1);skRow--;b.disabled=false;}},D(500));};   /* counted first (the next screen sees it); false: the question already ended, no skip used */
  return b;};
function skipAct(){skRow=0;if(window.HELP&&HELP.stop)try{HELP.stop();}catch(e){}const cu=DL.cur(),id=cu&&!cu.end?cu.id:null;const d=T.dailyEnsure();
  if(id){const j=d.t.findIndex((x,n)=>!d.done[n]&&(x===id||(x==='math'&&/^lv:/.test(id))));if(j>=0)d.done[j]=2;DL.end('k');}
  O.persist();if(T.setKey)T.setKey(null);
  const el=h('div','pdskip',`<div class="card"><div class="callp bob">${T.friend?T.friend():''}</div><h2>${SKIPSAY}</h2></div>`);document.body.appendChild(el);
  setTimeout(()=>{if(O.hush)O.hush();O.say(T.spk(SKIPSAY));},D(400));
  setTimeout(()=>{el.remove();const nx=d.done.findIndex(x=>!x);if(nx>=0&&window.TAL_step)window.TAL_step(nx);else O.showMap();},D(2600));}
P.skipAct=skipAct;
/* the parent's setting (#616): one row of 3; today's count under it */
P.skipSettings=(box,sec,refresh)=>{const st=SETS(),v=P.skipSet();
  const s=sec(box,'⏭️ דילוג לאורן','<div class="pnote">כפתור קטן "דלג" ליד כפתור העזרה: אורן יכול לדלג על שאלה, או על כל הפעילות. דילוג אינו כישלון: בלי ירידת רמה ובלי כוכבים, והשאלה חוזרת ביום אחר.</div>');
  const row=h('div','popt skset');[['off','כבוי'],[SKIPMAX,'עד 3 ביום'],['all','בלי הגבלה']].forEach(([k,n])=>{const c=h('button','pchip'+(v===k?' on':''),n);c.onclick=()=>{st.skip=k;O.persist();refresh();};row.appendChild(c);});
  s.appendChild(row);s.appendChild(h('div','pnote','היום דילג: '+P.skipsToday()));};
/* #614 the parent's "skip now" status: 'sent' (נשלח…) · 'late' (his device did not take it in 30 s) · 'done' (he left the activity: דולג ✓, for a minute) */
P.nowState=()=>{const c=cmds().filter(x=>x.k==='now'&&!called(x.i)).pop();if(!c)return null;
  const row=DL.rows(today()).find(e=>e[6]==='p'&&e[7]&&e[7].pc===c.i);if(row)return Date.now()-(+row[7].ts||0)<60000?{c,s:'done'}:null;
  const late=window.__pcLate!=null?window.__pcLate:30000,age=Date.now()-(+c.t||0);
  if(isDone(c))return age<late+20000?{c,s:'sent'}:null;   /* taken: he leaves after his answer (or the activity ended by itself) */
  return {c,s:age<late?'sent':'late'};};

/* ---------- the parent's view ---------- */
P.vd=null;
let last=null;
const dayName=d=>{if(d===today())return 'היום';if(d===dayAt(1))return 'אתמול';const [y,m,dd]=d.split('-').map(Number);const x=new Date(y,m-1,dd);return `יום ${'אבגדהוש'[x.getDay()]}׳ ${pad(dd)}.${pad(m)}`;};
const KIND={now:'',drop:'',off:'לא היום',know:'הוא כבר יודע'};
/* today's path as the parent sees it: Oren's last saved path + the commands his device did not take yet */
function planView(){const d0=T.S().daily;if(!d0||d0.d!==today())return null;const d={t:d0.t.slice(),done:d0.done.slice(),po:d0.po?{t:d0.po.t.slice()}:null};
  cmds().filter(waiting).forEach(c=>planOp(d,c));return d;}
const stepTop=id=>/:/.test(id)?null:topOf(id);
const stepLv=id=>{if(id==='math'){const lv=T.nextLevel&&T.nextLevel();return lv?plain(lv.u.name):'';}const l=lvOf(id);return l?'רמה '+l:'';};
function pendRowHTML(c){if(c.k==='new')return `<span class="pn"><b class="dli">🌅</b> יום חדש</span><span class="pc">נשלח…</span>`;const id=c.k==='off'?null:c.a;const nm=c.k==='now'?'מה שהוא משחק עכשיו':c.k==='off'?TOP[c.a]||c.a:T.stepName(id);
  return `<span class="pn"><b class="dli">⏭</b> ${nm}</span><span class="pc">דילג (הורה)${KIND[c.k]?' · '+KIND[c.k]:''} · נשלח…</span>`;}
/* what he did on day d: his log lines, a "בטל" on a skip until the next mission starts, and the skips still on their way */
function didSec(box,d,sec){const rows=DL.rows(d);const pend=d===today()?cmds().filter(c=>waiting(c)&&['now','drop','off','know','new'].includes(c.k)):[];
  if(!rows.length&&!pend.length){if(d===today()&&DL.playing())return;/* #621 playing: the "playing now" line says it */box.appendChild(h('div','pnote pdnone',d===today()?'עוד לא שיחק היום':'לא שיחק ביום הזה'));return;}
  const s=sec(box,'מה הוא עשה','');const L=h('div','dllog');L.dataset.d=d;s.appendChild(L);
  const lastReal=Math.max(-1,...rows.filter(e=>e[6]!=='p').map(e=>e[0]));
  rows.forEach(e=>{const w=h('div','',DL.rowHTML(e));const r=w.firstChild;L.appendChild(r);const x=e[7]||{};
    if(d===today()&&e[6]==='p'&&x.pc&&(x.k==='now'||e[1]==='newday'))r.querySelector('.pc').insertAdjacentHTML('beforeend',' · <b class="pdheard">אורן שמע ✓</b>');   /* #617 */
    if(d===today()&&e[6]==='p'&&x.pc&&x.k!=='now'&&x.k!=='new'&&e[0]>=lastReal&&!cmds().some(c=>c.k==='undo'&&c.a===x.pc)){const b=h('button','pchip','בטל');b.onclick=()=>{P.undo(x.pc);P.refresh();};r.appendChild(b);}});
  pend.forEach(c=>{const r=h('div','prow dlrow dl-p pdpend',pendRowHTML(c));const b=h('button','pchip','בטל');b.onclick=()=>{P.undo(c.i);P.refresh();};r.appendChild(b);L.appendChild(r);});}
/* the plan ahead: the missions still open today, in order; per row one ✕, a tap on the row shows the rest */
let rowOpen=null;
function planSec(box,sec){const d=planView();if(!d)return;const left=d.t.map((id,n)=>({id,n})).filter(x=>!d.done[x.n]);
  const s=sec(box,'התוכנית להמשך','');
  /* #648 one button: a new path for him now (missions he did not do today); while it is on its way the plan waits for it */
  const nd=h('div','btnrow');const nb=h('button','bigbtn plain sm','<span>🌅 יום חדש</span>');nb.onclick=()=>{rowOpen=null;P.send('new');P.refresh();};nd.appendChild(nb);
  if(cmds().some(c=>c.k==='new'&&waiting(c))){s.appendChild(h('div','pnote','מסלול חדש בדרך לאורן'));return;}
  if(!left.length)s.appendChild(h('div','pnote','כל המשימות של היום בוצעו'));
  left.forEach((x,k)=>{const tp=stepTop(x.id),lv=stepLv(x.id);
    const r=h('div','prow tdrow pdplan'+(rowOpen===x.id?' open':''),`<span class="pn">${k+1}. ${T.stepName(x.id)}${lv?` <small>${lv}</small>`:''}</span>`);
    const ch=(l,f,el,cls)=>{const b=h('button','pchip'+(cls?' '+cls:''),l);b.onclick=e=>{e.stopPropagation();f();P.refresh();};el.appendChild(b);return b;};
    ch('✕',()=>{rowOpen=null;P.send('drop',x.id);},r,'tdx').title='להוריד מהיום';
    const mo=h('div','tdmore');r.appendChild(mo);
    if(k>0)ch('▲ למעלה',()=>P.send('up',x.id),mo);
    if(k<left.length-1)ch('▼ למטה',()=>P.send('down',x.id),mo);
    if(tp)ch('לא היום: '+TOP[tp],()=>{rowOpen=null;P.send('off',tp);},mo);
    if(x.id==='math'||T.ACT[x.id])ch('הוא כבר יודע',()=>P.send('know',x.id),mo);
    if(T.tryIt&&!/:/.test(x.id)){const b=h('button','pchip','▶ נסו');b.onclick=e=>{e.stopPropagation();T.tryIt(x.id);};mo.appendChild(b);}
    r.onclick=()=>{rowOpen=rowOpen===x.id?null:x.id;r.classList.toggle('open',rowOpen===x.id);};s.appendChild(r);});
  /* add a topic: one button, the topics behind it */
  const ar=h('div','popt pdadd');const ab=h('button','pchip','+ הוספת נושא');ar.appendChild(ab);const tops=h('span','pdtops');tops.hidden=true;ar.appendChild(tops);
  ab.onclick=()=>{tops.hidden=!tops.hidden;};
  Object.keys(TOP).forEach(tp=>{const id=pickOf(tp,d);if(!id)return;const b=h('button','pchip',TOP[tp]);b.onclick=()=>{P.send('add',id);P.refresh();};tops.appendChild(b);});
  if(tops.children.length)s.appendChild(ar);
  if(d.po||cmds().some(c=>waiting(c)&&['drop','off','up','down','add'].includes(c.k))){const rs=h('div','btnrow');const b=h('button','bigbtn plain sm','<span>חזרה לתוכנית הרגילה</span>');b.onclick=()=>{rowOpen=null;P.send('reset');P.refresh();};rs.appendChild(b);s.appendChild(rs);}
  s.appendChild(nd);}
/* the mission a topic adds: the learning engine's next pick (#358 rules live there), else one from the pool */
function pickOf(tp,d){if(tp==='math')return T.nextLevel&&T.nextLevel()?'math':null;const used=new Set(d.t);
  try{if(window.LEARN&&LEARN.plan){const x=(LEARN.plan(tp,1,used)||[]).find(y=>y&&T.ACT[y]&&!used.has(y));if(x)return x;}}catch(e){}
  return T.dailyPool().find(id=>topOf(id)===tp&&!used.has(id))||null;}
/* strong / weak per topic: the level, one line from the last 7 days of answers, the 2-3 hardest items */
const skillTop=sk=>/^a:/.test(sk)?topOf(sk.slice(2)):sk==='pp-write'?'readg':'math';
function strongSec(box,d,sec){const [y,m,dd]=d.split('-').map(Number);const days=[...Array(7)].map((_,i)=>dayKey(new Date(y,m-1,dd-i)));
  const by={};const add=(tp,id,ok,n)=>{const t=by[tp]=by[tp]||{ok:0,n:0,it:{}};t.ok+=ok;t.n+=n;const it=t.it[id]=t.it[id]||{ok:0,n:0};it.ok+=ok;it.n+=n;};
  days.forEach(k=>DL.rows(k).forEach(e=>{const tp=topOf(e[1]);if(tp&&e[6]!=='p'&&e[4])add(tp,e[1],e[3]|0,e[4]|0);}));
  const lv={};Object.entries(lrn()).forEach(([sk,k])=>{if(!k||!k.n)return;const tp=skillTop(sk);if(!tp)return;(lv[tp]=lv[tp]||[]).push(k.l||1);});
  const tops=Object.keys(TOP).filter(tp=>(by[tp]&&by[tp].n)||lv[tp]);if(!tops.length)return;
  const s=sec(box,'מצליח / קשה לו','<div class="pnote">לפי התשובות ב-7 הימים האחרונים (נכון בניסיון ראשון)</div>');
  tops.forEach(tp=>{const t=by[tp];const ls=lv[tp];const L=ls?Math.round(ls.reduce((a,b)=>a+b,0)/ls.length):0;
    const r=t&&t.n?t.ok/t.n:null;const how=r==null?'אין תשובות השבוע':t.n<5?`מעט תשובות (${t.ok}/${t.n})`:r>=.8?`מצליח · ${Math.round(r*100)}%`:r<.6?`קשה לו · ${Math.round(r*100)}%`:`בתרגול · ${Math.round(r*100)}%`;
    const hard=t?Object.entries(t.it).filter(([,x])=>x.n>=3&&x.ok/x.n<.8).sort((a,b)=>a[1].ok/a[1].n-b[1].ok/b[1].n).slice(0,3).map(([id,x])=>`${DL.nameOf(id)} (${Math.round(x.ok/x.n*100)}%)`):[];
    s.appendChild(h('div','prow pdtop'+(r!=null&&t.n>=5?r>=.8?' ok':r<.6?' hard':'':''),`<span class="pn"><b>${TOP[tp]}</b>${L?` <small>רמה ${L}</small>`:''}${hard.length?`<br><small>הכי קשה: ${hard.join(' · ')}</small>`:''}</span><span class="pc">${how}</span>`));});}
/* #61 suggestions from the last 7 days: a topic too hard / too easy / not played — 1-3 plain lines, one button where the action is obvious.
   days = [day rows], tops = the topics that have missions. Pure (the tests call it with sample rows). */
const EASY=.9,HARD=.6;
P.suggest=(days,tops)=>{const by={};let any=0;
  (days||[]).forEach(rs=>(rs||[]).forEach(e=>{if(!e||'pxs'.includes(e[6]))return;const tp=topOf(e[1]);if(!tp)return;any=1;const t=by[tp]=by[tp]||{ok:0,n:0};t.ok+=e[3]|0;t.n+=e[4]|0;}));
  if(!any)return [];const r=tp=>by[tp].ok/by[tp].n;const has=tops.filter(tp=>by[tp]&&by[tp].n);
  const hard=has.filter(tp=>by[tp].n>=5&&r(tp)<HARD).sort((a,b)=>r(a)-r(b)).map(tp=>({k:'hard',tp,r:r(tp)}));
  const easy=has.filter(tp=>by[tp].n>=10&&r(tp)>=EASY).sort((a,b)=>r(b)-r(a)).map(tp=>({k:'easy',tp,r:r(tp)}));
  return hard.concat(easy,tops.filter(tp=>!by[tp]).map(tp=>({k:'miss',tp}))).slice(0,3);};
const SUG={hard:'קשה לו השבוע',easy:'קל לו מדי',miss:'לא שיחק השבוע'};
function sugSec(box,sec){const days=[...Array(7)].map((_,i)=>DL.rows(dayAt(i)));const pool=T.dailyPool();
  const tops=Object.keys(TOP).filter(tp=>tp==='math'?!!(T.nextLevel&&T.nextLevel()):pool.some(id=>topOf(id)===tp));
  const L=P.suggest(days,tops);if(!L.length)return;const d=planView();const s=sec(box,'הצעות','');s.classList.add('pdsug');
  const openOf=tp=>d?d.t.find((id,n)=>!d.done[n]&&stepTop(id)===tp):null;
  L.forEach(x=>{const r=h('div','prow pdsugi',`<span class="pn"><b>${TOP[x.tp]}</b> — ${SUG[x.k]}${x.r!=null?` · ${Math.round(x.r*100)}% נכון`:''}</span>`);
    const bt=(l,f)=>{const b=h('button','pchip',l);b.onclick=()=>{f();P.refresh();};r.appendChild(b);};
    if(x.k==='easy'){const id=openOf(x.tp);if(id&&(id==='math'||T.ACT[id])&&!cmds().some(c=>c.k==='know'&&c.a===id))bt('הוא כבר יודע',()=>P.send('know',id));}
    if(x.k==='miss'&&d&&!openOf(x.tp)){const id=pickOf(x.tp,d);if(id)bt('+ להוסיף להיום',()=>P.send('add',id));}
    s.appendChild(r);});}
/* #429 what he learned on day d: up to 3 lines from the goal table (goals.js, x.lg on his finished lines); none -> hidden */
function learnSec(box,d,sec){const G=window.GOALS;const L=G&&G.learned?G.learned(d).slice(0,3):[];if(!L.length)return;
  const s=sec(box,'מה למד היום',`<ul>${L.map(x=>`<li>${x}</li>`).join('')}</ul>`);s.classList.add('pdlearn');}
/* #431 the week up to day d: 7 bars of play minutes (oldest left, d right) + the shares of math / reading / English from the day log.
   Pure data (the tests call it): {m: [7 minutes], sh: {math, readg, eng} in % or null}; an empty week -> null. */
const W3={math:'🧮 חשבון',readg:'📖 קריאה',eng:'🔤 אנגלית'};
const top3=id=>{id=String(id||'');if(/^(en|eng)-/.test(id))return 'eng';const t=topOf(id);return t==='math'||t==='readg'?t:null;};
P.week=d=>{const [y,m,dd]=d.split('-').map(Number);const ks=[...Array(7)].map((_,i)=>dayKey(new Date(y,m-1,dd-6+i)));
  const tm=T.S().time||{};const mins=ks.map(k=>Math.round((tm[k]|0)/60));const c={math:0,readg:0,eng:0};let n=0;
  ks.forEach(k=>DL.rows(k).forEach(e=>{if('pxsf'.includes(e[6]))return;const t=top3(e[1]);if(t){c[t]++;n++;}}));
  if(!n&&!mins.some(x=>x))return null;const sh=n?{math:c.math/n*100,readg:c.readg/n*100,eng:c.eng/n*100}:null;return {k:ks,m:mins,sh};};
const WCOL={math:'#3a8fc4',readg:'#c0392b',eng:'#8e44ad'};
function weekSec(box,d,sec){const w=P.week(d);if(!w)return;const mx=Math.max(1,...w.m);
  const bars=w.k.map((k,i)=>{const [y,m,dd]=k.split('-').map(Number);return `<div class="pcol pdwk"><i style="height:${w.m[i]/mx*100}%"></i><small>${'אבגדהוש'[new Date(y,m-1,dd).getDay()]}</small></div>`;}).join('');
  const sh=w.sh?`<div class="pdsplit">${Object.keys(W3).map(t=>`<i style="width:${w.sh[t]}%;background:${WCOL[t]}"></i>`).join('')}</div><div class="pdshs">${Object.keys(W3).map(t=>`<span class="pdsh"><b style="color:${WCOL[t]}">●</b> ${W3[t]} ${Math.round(w.sh[t])}%</span>`).join('')}</div>`:'';
  const s=sec(box,'השבוע',`<div class="pchart pdbars">${bars}</div>${sh}`);s.classList.add('pdweek');}
/* #430 one question to ask him about what he learned that day (goals.js), at the end of the day view; none -> hidden */
function askSec(box,d){const G=window.GOALS;const q=G&&G.ask?G.ask(d):'';if(q)box.appendChild(h('section','psec pdask',`תשאל אותו: ${q}`));}
/* the whole day view; opts = {sec, nowTop(el), more()} */
P.view=(box,opts)=>{const d=P.vd&&P.vd<=today()&&P.vd>=dayAt(13)?P.vd:today();P.vd=d;last={box,opts};box.innerHTML='';const sec=opts.sec;
  const nav=h('div','pdnav');const prev=h('button','pchip pdprev','›');prev.setAttribute('aria-label','יום קודם');prev.disabled=d<=dayAt(13);
  const next=h('button','pchip pdnext','‹');next.setAttribute('aria-label','יום הבא');next.disabled=d>=today();
  const go=k=>{const [y,m,dd]=P.vd.split('-').map(Number);P.vd=dayKey(new Date(y,m-1,dd+k));rowOpen=null;P.view(box,opts);};prev.onclick=()=>go(-1);next.onclick=()=>go(1);
  nav.append(prev,h('b','pdday',dayName(d)),next);box.appendChild(nav);
  if(d===today()){const nb=h('div','pnow');box.appendChild(nb);opts.nowTop&&opts.nowTop(nb);}
  const sec0=((T.S().time||{})[d]|0);box.appendChild(h('div','pdtot',`⏱️ ${d===today()?'היום':'ביום הזה'}: <b>${Math.floor(sec0/60)} דק׳</b> משחק`));
  learnSec(box,d,sec);didSec(box,d,sec);if(d===today()){planSec(box,sec);sugSec(box,sec);}strongSec(box,d,sec);weekSec(box,d,sec);askSec(box,d);};
P.refresh=()=>{if(last&&last.box.isConnected)P.view(last.box,last.opts);};
})();
