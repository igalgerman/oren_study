/* ===== LEARN: one adaptive skill model for the whole game ("what next?") + math depth + paper tasks =====
   Part 1 (window.LEARN core) is pure: the skill model, zones, spaced review, the "what next?" choice, placement,
   family merge, and the question generators (mental-math strategies, word problems, challenge puzzles, paper tasks).
   It runs in Node for the tests. Part 2 hooks it into the game: two activities in the thinking tower
   ('ln-math' = math training, the engine picks the strategy and level; 'ln-paper' = take paper and pencil),
   the parent's view and controls (no placement test in the game, #57: the parent answers a few questions in KNOW).
   State: save.lrn = {v, k:{skill:{l,h,n,d,i,u,f,g,lk,r}}, pl:{domain:level}, rc:[recent skills], pf:{focus,pace}, pt, pp}
     l level · h last first-try answers ('1'/'0', 12) · n answers · d last day (day number) · i review step (IV) · u due day
     f quick perfect rounds in a row · g good rounds in a row (calm pace) · lk locked by the parent · r open round [n,ok,ms] */
window.LEARN=(()=>{'use strict';
let rnd=Math.random;
const ri=(a,b)=>a+Math.floor(rnd()*(b-a+1));
const pk=a=>a[Math.floor(rnd()*a.length)];
const shuf=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const L=t=>`<span class="ltr">${t}</span>`;
const B=n=>`<b>${n}</b>`;

/* ---------- days ---------- */
let nowFn=()=>Date.now();
const dayNum=t=>{const d=new Date(t==null?nowFn():t);return Math.floor((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()))/864e5);};
const today=()=>dayNum();

/* ---------- the skill model ---------- */
const IV=[1,2,4,8,16,30];                 /* review intervals (days) */
const MAXK=150;                           /* cap on stored skills */
const MAXLV={};                           /* per-skill max level (default 5) */
const maxLv=sk=>MAXLV[sk]||5;
const blank=()=>({v:1,k:{},pl:{},rc:[],pf:{focus:[],pace:1},pt:0});
const ensure=st=>{st=st&&typeof st==='object'?st:blank();st.k=st.k||{};st.pl=st.pl||{};st.rc=st.rc||[];st.pf=st.pf||{focus:[],pace:1};st.pf.focus=st.pf.focus||[];if(st.pf.pace==null)st.pf.pace=1;return st;};
const rec=(st,sk)=>st.k[sk]||(st.k[sk]={l:1,h:'',n:0,d:0,i:0,u:0,f:0});
/* recent first-try accuracy, newer answers weigh more */
function acc(h){if(!h)return null;let w=0,s=0,x=1;for(let j=h.length-1;j>=0;j--){w+=x;if(h[j]==='1')s+=x;x*=.85;}return s/w;}
/* accuracy, lowered when a review is overdue (forgetting) */
function eff(k,t){const a=acc(k&&k.h);if(a==null)return null;if(!k.u)return a;const od=(t==null?today():t)-k.u;if(od<=0)return a;const iv=IV[k.i|0]||1;return a*Math.max(.7,1-.06*od/iv);}
function zone(k,t){if(!k||(k.n|0)<3||!k.h)return 'new';const e=eff(k,t);if(e>=.88&&k.n>=5)return 'mastered';if(e>=.6)return 'learning';return 'hard';}
const isDue=(k,t)=>!!(k&&k.u&&(t==null?today():t)>=k.u);
function prune(st){const ks=Object.keys(st.k);if(ks.length<=MAXK)return;ks.sort((a,b)=>(st.k[a].d|0)-(st.k[b].d|0)).slice(0,ks.length-MAXK).forEach(k=>delete st.k[k]);}
/* one answer */
function record(st,sk,correct,firstTry,ms){st=ensure(st);const k=rec(st,sk);const good=!!correct&&firstTry!==false;
  k.h=(k.h+(good?'1':'0')).slice(-12);k.n=(k.n|0)+1;k.d=today();k.r=k.r||[0,0,0];k.r[0]++;if(good)k.r[1]++;k.r[2]+=Math.max(0,Math.min(120000,+ms||0));
  st.rc=[sk,...st.rc.filter(x=>x!==sk)].slice(0,6);prune(st);return k;}
/* how fast is "quick" for one answer (ms) */
const QUICK=sk=>/^wp/.test(sk)?22000:/^ch/.test(sk)?28000:/^pp/.test(sk)?240000:9000;
/* end of a round: level up / jump / down, and the next review day.
   pace 0 calm: up after 2 good rounds · 1 normal: up after a good round, jump after 2 quick perfect rounds · 2 fast: lower bar, jump after 1 quick perfect round */
function done(st,sk){st=ensure(st);const k=st.k[sk];if(!k||!k.r||!k.r[0])return null;const [n,ok,ms]=k.r;k.r=null;const a=ok/n,quick=ms/n<QUICK(sk);
  const pace=st.pf.pace|0;const thr=pace===2?.84:.9;let up=0;
  if(a===1&&quick)k.f=(k.f|0)+1;else if(a<1)k.f=0;
  if(!k.lk){
    if(a>=thr){if(pace===0){k.g=(k.g|0)+1;if(k.g>=2){up=1;k.g=0;}}else up=1;
      if(a===1&&quick&&(k.f|0)>=(pace===2?1:pace===0?3:2)){up=2;k.f=0;}}
    else{k.g=0;if(a<.6)up=-1;}
    const lv=Math.max(1,Math.min(maxLv(sk),(k.l|0||1)+up));up=lv-(k.l|0||1);k.l=lv;}
  if(a>=.8)k.i=Math.min(IV.length-1,(k.i|0)+(k.u?1:0));else if(a<.6)k.i=0;
  k.u=today()+IV[k.i|0];
  return {acc:a,up,lv:k.l,quick,due:k.u};}
/* a level the round is about to play (the engine may nudge a mastered skill one up) */
function start(st,sk,lv){st=ensure(st);const k=rec(st,sk);if(!k.lk&&lv>k.l)k.l=Math.min(maxLv(sk),lv);k.r=[0,0,0];return k.l;}
function setLevel(st,sk,lv,lock){st=ensure(st);const k=rec(st,sk);if(lv!=null)k.l=Math.max(1,Math.min(maxLv(sk),lv|0));if(lock!=null)k.lk=lock?1:0;k.f=0;k.g=0;st.pt=nowFn();return k;}
function setPrefs(st,p){st=ensure(st);if(p.focus)st.pf.focus=p.focus.slice(0,2);if(p.pace!=null)st.pf.pace=Math.max(0,Math.min(2,p.pace|0));st.pt=nowFn();return st.pf;}

/* ---------- "what next?" ----------
   candidate: {skill, step, dom, topic, frontier, ext:{n,acc,lv,due}}  (ext = what another part of the game knows, when the engine has no record)
   returns {skill, step, dom, lv, why: 'learn'|'new'|'review'|'stretch'|'easier'} */
function view(st,c,t){const k=st.k[c.skill];if(k&&k.n)return k;const e=c.ext;if(!e||!e.n)return k||null;const m=Math.min(8,e.n);const A=e.acc==null?.75:e.acc;
  const h=Array.from({length:m},(_,j)=>Math.floor((j+1)*A+1e-9)>Math.floor(j*A+1e-9)?'1':'0').join('');return {l:(k&&k.l>1)?k.l:(e.lv||1),h,n:e.n,d:e.d||0,i:e.i|0,u:e.due||0,lk:k&&k.lk};}
function score(st,c,t,wantReview,lastTopic){const k=view(st,c,t);const z=zone(k,t);const due=isDue(k,t)||!!(c.ext&&c.ext.dueNow);
  let s={learning:10,new:c.frontier?8:4,hard:3,mastered:1}[z];let why=z==='learning'?'learn':z==='new'?'new':z==='hard'?'easier':'stretch';
  if(due&&wantReview){s=14;why='review';}else if(due&&z==='mastered')s=2;
  const f=st.pf.focus||[];if(f.includes(c.dom)||f.includes(c.skill)||(c.topic&&f.includes(c.topic)))s+=5;
  /* interleave: what he just did today weighs less (a due review is not held back by it) */
  const r=st.k[c.skill]&&st.k[c.skill].d===t&&why!=='review'?st.rc.indexOf(c.skill):-1;if(r===0)s-=9;else if(r===1)s-=5;else if(r>=2)s-=2;
  if(c.topic&&lastTopic&&c.topic===lastTopic&&r!==0)s-=2;
  s+=(c.boost||0)+rnd()*2;
  let lv=(k&&k.l)||1;const mx=c.max||maxLv(c.skill);if(z==='mastered'&&!due&&!(k&&k.lk))lv=Math.min(mx,lv+1);
  return {s,why,lv,due,z};}
const dueOf=(st,c,t)=>isDue(view(st,c,t),t)||!!(c.ext&&c.ext.dueNow);
function pick(st,cands,o){st=ensure(st);o=o||{};const t=o.t==null?today():o.t;const ex=o.exclude||new Set();
  const pool=cands.filter(c=>!ex.has(c.skill));if(!pool.length)return null;
  const lastC=cands.find(c=>c.skill===st.rc[0]);const lastTopic=lastC&&lastC.topic;
  const anyDue=pool.some(c=>dueOf(st,c,t));const wantReview=o.review!=null?!!o.review:anyDue&&rnd()<.2;
  let best=null;for(const c of pool){const v=score(st,c,t,wantReview,lastTopic);if(o.review===true&&!v.due)v.s-=20;if(!best||v.s>best.v.s)best={c,v};}
  const {c,v}=best;return {skill:c.skill,step:c.step,dom:c.dom,lv:v.lv,why:v.why,zone:v.z,name:c.name};}
/* a day path of n steps: ~20% reviews (at least one when something is due), topics interleaved, each skill and each
   activity once (the journey step 'math' may repeat: it always plays the next level) */
function plan(st,cands,n,o){st=ensure(st);o=o||{};const t=o.t==null?today():o.t;const sim=Object.assign({},st,{rc:st.rc.slice()});
  const dueN=cands.filter(c=>dueOf(st,c,t)).length;
  const nRev=dueN?Math.min(dueN,Math.max(1,Math.round(n*.2))):0;const revAt=new Set();for(let j=0;j<nRev;j++)revAt.add(Math.min(n-1,1+j*5));
  const out=[],used=new Set(o.used||[]),usedSteps=new Set(o.usedSteps||[]);
  for(let i=0;i<n;i++){const avail=cands.filter(c=>c.step==='math'||(!used.has(c.skill)&&!usedSteps.has(c.step)));
    const p=pick(sim,avail,{t,review:revAt.has(i)});if(!p)break;out.push(p);if(p.step!=='math'){used.add(p.skill);usedSteps.add(p.step);}sim.rc=[p.skill,...sim.rc.filter(x=>x!==p.skill)].slice(0,6);}
  return out;}

/* ---------- placement: a short staircase ("where are you?") ----------
   ladder = [[skill, level], ...] easy → hard. Start in the middle, 2 up after a right answer (1 up after the first wrong), 1 down after a wrong one. */
function placeStart(ladder){return {i:Math.floor(ladder.length/2)-1,w:0,n:0,hi:-1,lo:ladder.length};}
function placeStep(ps,ladder,ok){ps.n++;if(ok){ps.hi=Math.max(ps.hi,ps.i);ps.i=Math.min(ladder.length-1,ps.i+(ps.w?1:2));}else{ps.w++;ps.lo=Math.min(ps.lo,ps.i);ps.i=Math.max(0,ps.i-1);}return ps;}
const placeDone=(ps,ladder,max)=>ps.n>=(max||7)||ps.w>=3||(ps.hi>=ladder.length-1&&ps.n>=3);
/* the levels the placement found: every skill gets the highest level it reached at or below the last passed rung */
function placeResult(ps,ladder){const top=ps.hi;const lv={};ladder.forEach(([sk,l],j)=>{if(j<=top)lv[sk]=Math.max(lv[sk]||1,l);});return {top,lv};}
function applyPlacement(st,dom,res){st=ensure(st);st.pl[dom]=Math.max(1,res.top+2);for(const sk in res.lv){const k=rec(st,sk);if(!k.lk&&!k.n)k.l=Math.max(k.l|0,res.lv[sk]);}return st;}

/* ---------- family merge: per skill the record with more answers wins (the later one when equal); prefs: the later setting ---------- */
function merge(dst,src){dst=ensure(dst);if(!src||typeof src!=='object')return dst;src=ensure(JSON.parse(JSON.stringify(src)));const newer=(+src.pt||0)>(+dst.pt||0);
  for(const sk in src.k){const a=dst.k[sk],b=src.k[sk];if(!b)continue;const lk=newer?b.lk:a?a.lk:b.lk;
    if(!a||(b.n|0)>(a.n|0)||((b.n|0)===(a.n|0)&&(b.d|0)>(a.d|0)))dst.k[sk]=b;if(lk!=null)dst.k[sk].lk=lk;}
  for(const d in src.pl)dst.pl[d]=Math.max(dst.pl[d]|0,src.pl[d]|0);
  if(newer){dst.pf=src.pf;dst.pt=src.pt;}
  if(src.pp&&(!dst.pp||(src.pp.d|0)>(dst.pp.d|0)))dst.pp=src.pp;
  mergeSeen(dst,src);prune(dst);return dst;}

/* ---------- parent summary (plain text) ---------- */
function summary(st,names,t){st=ensure(st);t=t==null?today():t;const rows=Object.keys(st.k).filter(sk=>st.k[sk].n>=3).map(sk=>{const k=st.k[sk];return {skill:sk,name:(names&&names(sk))||sk,acc:Math.round((acc(k.h)||0)*100),lv:k.l,zone:zone(k,t),due:isDue(k,t),n:k.n,lk:!!k.lk};});
  return {strong:rows.filter(r=>r.zone==='mastered').sort((a,b)=>b.acc-a.acc),weak:rows.filter(r=>r.zone==='hard').sort((a,b)=>a.acc-b.acc),learning:rows.filter(r=>r.zone==='learning'),due:rows.filter(r=>r.due)};}

/* =================== content =================== */
/* number answer + 3 distinct, non-negative distractors */
function numOpts(ans,cands){const out=[ans];for(const c of [...(cands||[]),ans+1,ans-1,ans+10,ans-10,ans+2,ans-2,ans+5,ans+3])if(Number.isInteger(c)&&c>=0&&c<=1000&&!out.includes(c)&&out.length<4)out.push(c);
  const opts=shuf(out);return {opts,ans:opts.indexOf(ans)};}
const Q=(sk,lv,o)=>Object.assign({sk,lv},o,numOpts(o.v,o.ds));
const ex=(...lines)=>lines.map(l=>`<div>${L(l)}</div>`).join('');

/* ---------- mental math strategies ---------- */
const MM={
 'mm-ten':lv=>{
  if(lv===1){const a=ri(1,9);return Q('mm-ten',1,{v:10-a,html:`<div class="lnx">${L(`${a} + ? = 10`)}</div>`,text:'כַּמָּה חָסֵר עַד 10?',ds:[a,11-a,9-a],ex:ex(`${a} + ${10-a} = 10`),key:'t1'+a});}
  if(lv===2){const a=ri(6,9),b=ri(11-a,9),c=10-a;return Q('mm-ten',2,{v:a+b,html:`<div class="lnx">${L(`${a} + ${b} = ?`)}</div>`,tip:'קֹדֶם מַשְׁלִימִים לְ-10.',ds:[a+b-1,a+b+1,a+b-10],ex:ex(`${a} + ${c} = 10`,`10 + ${b-c} = ${a+b}`),key:'t2'+a+'+'+b});}
  if(lv===3){const t=ri(1,9)*10,a=t+ri(1,9),nx=Math.ceil(a/10)*10;return Q('mm-ten',3,{v:nx-a,html:`<div class="lnx">${L(`${a} + ? = ${nx}`)}</div>`,text:'כַּמָּה חָסֵר עַד הָעֶשֶׂרֶת הַבָּאָה?',ds:[10-(nx-a),nx-a+1,nx-a-1],ex:ex(`${a} + ${nx-a} = ${nx}`),key:'t3'+a});}
  if(lv===4){const a=ri(1,8)*10+ri(3,9),b=ri(11-a%10,9),c=10-a%10;return Q('mm-ten',4,{v:a+b,html:`<div class="lnx">${L(`${a} + ${b} = ?`)}</div>`,tip:'מַשְׁלִימִים לָעֶשֶׂרֶת הַבָּאָה, וּמוֹסִיפִים אֶת הַשְּׁאָר.',ds:[a+b-10,a+b+1,a+b-1],ex:ex(`${a} + ${c} = ${a+c}`,`${a+c} + ${b-c} = ${a+b}`),key:'t4'+a+'+'+b});}
  const a=ri(1,7)*10+ri(1,9),u=a%10,c=10-u,b=ri(3,9);const parts=shuf([a,b,c]);const s=a+b+c;
  return Q('mm-ten',5,{v:s,html:`<div class="lnx">${L(parts.join(' + ')+' = ?')}</div>`,tip:'מְחַפְּשִׂים שְׁנֵי מִסְפָּרִים שֶׁמַּשְׁלִימִים לְעֶשֶׂרֶת.',ds:[s-10,s+10,s-1],ex:ex(`${a} + ${c} = ${a+c}`,`${a+c} + ${b} = ${s}`),key:'t5'+parts.join('+')});},
 'mm-dbl':lv=>{
  if(lv<=2){const n=lv===1?ri(1,5):ri(6,10);return Q('mm-dbl',lv,{v:2*n,html:`<div class="lnx">${L(`${n} + ${n} = ?`)}</div>`,tip:'כָּפוּל: מִסְפָּר וְעוֹד אוֹתוֹ מִסְפָּר.',ds:[2*n-1,2*n+1,2*n+2],ex:ex(`${n} + ${n} = ${2*n}`),key:'d'+n});}
  if(lv===3){const n=ri(3,9),d=pk([1,-1]),m=n+d;return Q('mm-dbl',3,{v:n+m,html:`<div class="lnx">${L(`${n} + ${m} = ?`)}</div>`,tip:'כִּמְעַט כָּפוּל!',ds:[2*n,2*m,n+m+2],ex:ex(`${n} + ${n} = ${2*n}`,`${2*n} ${d>0?'+':'−'} 1 = ${n+m}`),key:'d3'+n+m});}
  if(lv===4){const n=pk([ri(11,25),ri(2,5)*10,25,15,35,45]);return Q('mm-dbl',4,{v:2*n,html:`<div class="lnx">${L(`${n} + ${n} = ?`)}</div>`,tip:'כָּפוּל שֶׁל מִסְפָּר גָּדוֹל: עֲשָׂרוֹת כָּפוּל, וַאֲחָדוֹת כָּפוּל.',ds:[2*n-10,2*n+10,2*n+1],ex:ex(`${n-n%10} + ${n-n%10} = ${2*(n-n%10)}`,`${n%10} + ${n%10} = ${2*(n%10)}`,`${2*(n-n%10)} + ${2*(n%10)} = ${2*n}`),key:'d4'+n});}
  const n=ri(12,49),d=pk([1,-1]),m=n+d;return Q('mm-dbl',5,{v:n+m,html:`<div class="lnx">${L(`${n} + ${m} = ?`)}</div>`,tip:'כִּמְעַט כָּפוּל שֶׁל מִסְפָּר גָּדוֹל.',ds:[2*n,2*m,n+m+10],ex:ex(`${n} + ${n} = ${2*n}`,`${2*n} ${d>0?'+':'−'} 1 = ${n+m}`),key:'d5'+n+m});},
 'mm-comp':lv=>{
  const mk=(a,op,b,steps,key)=>{const v=op==='+'?a+b:a-b;const r=Math.round(b/10)*10,fix=Math.abs(r-b);
    return Q('mm-comp',lv,{v,html:`<div class="lnx">${L(`${a} ${op==='+'?'+':'−'} ${b} = ?`)}</div>`,tip:`מְעַגְּלִים אֶת ${B(b)} לְ-${B(r)}, וּמְתַקְּנִים בְּ-${B(fix)}.`,ds:[v+fix,v-fix,v+10],ex:ex(...steps),key});};
  const near=(a,op,b)=>{const r=Math.round(b/10)*10,fix=r-b;const m=op==='+'?a+r:a-r;const v=op==='+'?a+b:a-b;
    return [`${a} ${op==='+'?'+':'−'} ${r} = ${m}`,`${m} ${(op==='+')===(fix>0)?'−':'+'} ${Math.abs(fix)} = ${v}`];};
  if(lv===1){const a=ri(3,9);return mk(a,'+',9,near(a,'+',9),'c1'+a);}
  if(lv===2){if(rnd()<.5){const a=ri(11,80);return mk(a,'+',9,near(a,'+',9),'c2p'+a);}const a=ri(15,90);return mk(a,'−',9,near(a,'−',9),'c2m'+a);}
  if(lv===3){const b=pk([19,21,11]);if(rnd()<.6){const a=ri(12,70);return mk(a,'+',b,near(a,'+',b),'c3p'+a+b);}const a=ri(35,95);return mk(a,'−',b===21?19:b,near(a,'−',b===21?19:b),'c3m'+a+b);}
  if(lv===4){const b=pk([29,39,31,19,49]);if(rnd()<.5){const a=ri(11,99-b);return mk(a,'+',b,near(a,'+',b),'c4p'+a+b);}const a=ri(b+5,99);return mk(a,'−',b,near(a,'−',b),'c4m'+a+b);}
  if(rnd()<.5){const b=pk([98,99,101]);const a=ri(12,95);return mk(a,'+',b,near(a,'+',b),'c5p'+a+b);}
  const b=ri(2,7)*10+pk([8,9]);const a=ri(b+6,99);return mk(a,'−',b,near(a,'−',b),'c5m'+a+b);},
 'mm-skip':lv=>{
  const S=[[2,0],[10,0]],S2=[[5,0],[10,0],[2,1]],S3=[[10,ri(1,9)],[3,0],[5,ri(1,4)]],S4=[[-2,0],[-5,0],[-10,0],[4,0]],S5=[[25,0],[pk([6,7,8,9]),0],[-3,0],[11,0]];
  const [d,off]=pk([S,S2,S3,S4,S5][lv-1]);const len=5;let st;
  if(d>0)st=off+d*ri(0,lv<=2?3:5);else st=-d*ri(len,len+6)+(lv>=4?ri(0,1)*(-d===10?5:0):0);
  const seq=Array.from({length:len},(_,j)=>st+d*j);if(seq.some(x=>x<0||x>300))return MM['mm-skip'](lv);
  const qi=lv<=2?len-1:ri(1,len-1);const v=seq[qi];
  return Q('mm-skip',lv,{v,html:`<div class="lnx lnseq">${L(seq.map((x,j)=>j===qi?'?':x).join(', '))}</div>`,text:'מָה הַמִּסְפָּר הֶחָסֵר?',tip:'בְּכַמָּה קוֹפְצִים כָּל פַּעַם?',ds:[v+1,v-1,v+(d>0?d:-d)],
    ex:`<div>קוֹפְצִים כָּל פַּעַם ${L((d>0?'+':'−')+Math.abs(d))}</div>`,seq,qi,step:d,key:'s'+seq.join(',')+qi});},
 'mm-pv':lv=>{
  const moves=lv===1?[pk([10,-10])]:lv===2?shuf([pk([10,-10]),pk([1,-1])]):lv===3?[pk([20,30,-20]),pk([1,2,3,-1,-2])]:lv===4?[pk([11,9,-11,-9])]:[pk([10,20,-10]),pk([1,-1,2]),pk([11,9,-11,-9])];
  /* a move as chart steps: tens (rows) then ones (cells); 9 = a row down and one back, 11 = a row down and one forward */
  const parts=m=>{let t=Math.trunc(m/10),o=m-10*t;if(Math.abs(o)>=6){t+=Math.sign(o);o-=10*Math.sign(o);}return [...Array(Math.abs(t)).fill(10*Math.sign(t)),...Array(Math.abs(o)).fill(Math.sign(o))];};
  let start,path;for(let tr=0;tr<200;tr++){start=ri(1,100);path=[start];let c=start,ok=true;for(const m of moves)for(const p of parts(m)){c+=p;if(c<1||c>100)ok=false;path.push(c);}if(ok)break;}
  const v=path[path.length-1];const expr=start+moves.map(m=>(m>0?' + ':' − ')+Math.abs(m)).join('');
  return Q('mm-pv',lv,{v,html:`<div class="lnx">${L(expr+' = ?')}</div>`,chart:{start,path},
    tip:'בְּלוּחַ הַמֵּאָה: עוֹד 10 זֶה שׁוּרָה אַחַת לְמַטָּה, וְעוֹד 1 זֶה מִשְׁבֶּצֶת אַחַת קָדִימָה.',ds:[v+10,v-10,v+1,v-1],moves,ex:`<div>${L(path.join(' → '))}</div>`,key:'p'+expr});}
};
const MM_IDS=Object.keys(MM);

/* ---------- word problems ----------
   Every template: id, th (theme), lv [from,to], f = the answer from the numbers in the order they appear in the text (a, b, c, d), g(x) → text.
   x.N / x.M: names · x.v(m,f) / x.w(m,f): a word that agrees with N / M (marked for the grammar test) · x.c(n,noun,prep): count + noun with gender agreement */
const NOUN={goal:['גּוֹל','גּוֹלִים','m'],ball:['כַּדּוּר','כַּדּוּרִים','m'],kick:['בְּעִיטָה','בְּעִיטוֹת','f'],practice:['אִמּוּן','אִמּוּנִים','m'],player:['שַׂחְקָן','שַׂחְקָנִים','m'],
  card:['קְלָף','קְלָפִים','m'],basket:['סַל','סַלִּים','m'],throw:['זְרִיקָה','זְרִיקוֹת','f'],point:['נְקֻדָּה','נְקֻדּוֹת','f'],day:['יוֹם','יָמִים','m'],lap:['בְּרֵכָה','בְּרֵכוֹת','f'],
  lane:['מַסְלוּל','מַסְלוּלִים','m'],kid:['יֶלֶד','יְלָדִים','m'],minute:['דַּקָּה','דַּקּוֹת','f'],song:['שִׁיר','שִׁירִים','m'],note:['תָּו','תָּוִים','m'],month:['חֹדֶשׁ','חֳדָשִׁים','m'],
  block:['בְּלוֹק','בְּלוֹקִים','m'],floor:['קוֹמָה','קוֹמוֹת','f'],window:['חַלּוֹן','חַלּוֹנוֹת','m'],tower:['מִגְדָּל','מִגְדָּלִים','m'],star:['כּוֹכָב','כּוֹכָבִים','m'],
  astro:['אַסְטְרוֹנָאוּט','אַסְטְרוֹנָאוּטִים','m'],engine:['מָנוֹעַ','מְנוֹעִים','m'],ship:['חֲלָלִית','חֲלָלִיּוֹת','f'],step:['צַעַד','צְעָדִים','m'],rock:['אֶבֶן','אֲבָנִים','f'],
  sticker:['מַדְבֵּקָה','מַדְבֵּקוֹת','f'],shekel:['שֶׁקֶל','שְׁקָלִים','m'],team:['קְבוּצָה','קְבוּצוֹת','f'],key:['קְלִיד','קְלִידִים','m'],dog:['כֶּלֶב','כְּלָבִים','m'],hen:['תַּרְנְגֹלֶת','תַּרְנְגוֹלוֹת','f'],
  row:['שׁוּרָה','שׁוּרוֹת','f'],jump:['קְפִיצָה','קְפִיצוֹת','f'],circle:['עִגּוּל','עִגּוּלִים','m'],word:['מִלָּה','מִלִּים','f']};
const TWO={m:{'':'שְׁנֵי','בְּ':'בִּשְׁנֵי','לְ':'לִשְׁנֵי','וְ':'וּשְׁנֵי','מִ':'מִשְּׁנֵי'},f:{'':'שְׁתֵּי','בְּ':'בִּשְׁתֵּי','לְ':'לִשְׁתֵּי','וְ':'וּשְׁתֵּי','מִ':'מִשְּׁתֵּי'}};
/* n + noun, agreeing in gender: "גּוֹל אֶחָד", "שְׁתֵּי דַּקּוֹת", "<b>5</b> כַּדּוּרִים"; with a prefix: "לִשְׁנֵי מִגְדָּלִים", "בְּ-<b>4</b> יָמִים" */
function count(n,key,prep){const w=NOUN[key];if(!w)throw new Error('noun '+key);prep=prep||'';
  if(n===1){if(prep)throw new Error('one with prefix '+key);return `${w[0]} ${w[2]==='m'?'אֶחָד':'אַחַת'}`;}
  if(n===2)return `${TWO[w[2]][prep]} ${w[1]}`;
  return `${prep?prep+'-':''}${B(n)} ${w[1]}`;}
const NAMES_M=['יוֹנָתָן','דָּנִי','אִיתַי','עוֹמֶר','אֵיתָן','רוֹן','עִדּוֹ'],NAMES_F=['נוֹעָה','מָאיָה','תָּמָר','שִׁירָה','יָעֵל','מִיכַל','הִילָה'];
const noDag=s=>s.replace(/^(.[֑-ׇ]*?)ּ/,'$1');
const lp=nm=>'לְ'+noDag(nm);                     /* "לְדָנִי" */
const vav=nm=>(/^[במפ]/.test(nm)?'וּ':'וְ')+noDag(nm);   /* "וְדָנִי", "וּמָאיָה" */
const plainName=s=>s.replace(/[֑-ׇ]/g,'');
const mark=(nm,t)=>`<span data-w="${plainName(nm)}">${t}</span>`;
const LIM=[0,10,20,50,100,100];
/* two numbers a > b with a ≤ lim */
const pair=(lv,minB)=>{const lim=LIM[lv];const a=ri(Math.max((minB||1)+1,Math.ceil(lim/3)),lim);const b=ri(minB||1,a-1);return [a,b];};
const split=(lv,minA)=>{const lim=LIM[lv];const s=ri(Math.max(2*(minA||1),Math.ceil(lim/3)),lim);const a=ri(minA||1,s-(minA||1));return [a,s-a];};
const WT=[
 /* ---- soccer ---- */
 {id:'soc-add',th:'soccer',lv:[1,3],f:'a+b',g:x=>{const [a,b]=split(x.lv);return [`${x.N} ${x.v('הִבְקִיעַ','הִבְקִיעָה')} ${x.c(a,'goal')} בַּמִּשְׂחָק הָרִאשׁוֹן, וְעוֹד ${x.c(b,'goal')} בַּמִּשְׂחָק הַשֵּׁנִי. כַּמָּה גּוֹלִים ${x.v('הוּא הִבְקִיעַ','הִיא הִבְקִיעָה')} בְּסַךְ הַכֹּל?`,a,b];}},
 {id:'soc-sub',th:'soccer',lv:[1,3],f:'a-b',g:x=>{const [a,b]=pair(x.lv);return [`בַּשַּׂק הָיוּ ${x.c(a,'ball')}. ${x.N} ${x.v('לָקַח','לָקְחָה')} ${x.c(b,'ball')} לָאִמּוּן. כַּמָּה כַּדּוּרִים נִשְׁאֲרוּ בַּשַּׂק?`,a,b];}},
 {id:'soc-cmp',th:'soccer',lv:[2,4],f:'a-b',two:1,g:x=>{const [a,b]=pair(x.lv);return [`${x.N} ${x.v('בָּעַט','בָּעֲטָה')} ${x.c(a,'kick')} לַשַּׁעַר. ${x.M} ${x.w('בָּעַט','בָּעֲטָה')} ${x.c(b,'kick')}. בְּכַמָּה בְּעִיטוֹת ${x.N} ${x.v('בָּעַט','בָּעֲטָה')} יוֹתֵר?`,a,b];}},
 {id:'soc-mul',th:'soccer',lv:[3,5],f:'a*b',g:x=>{const a=pk([2,3,4,5,10]),b=ri(3,x.lv===3?5:9);return [`בְּכָל אִמּוּן ${x.N} ${x.v('בּוֹעֵט','בּוֹעֶטֶת')} ${x.c(a,'kick')} לַשַּׁעַר. כַּמָּה בְּעִיטוֹת ${x.v('הוּא בּוֹעֵט','הִיא בּוֹעֶטֶת')} בְּ-${B(b)} אִמּוּנִים?`,a,b];}},
 {id:'soc-bench',th:'soccer',lv:[3,4],f:'a-b',g:x=>{const a=ri(12,22),b=ri(5,11);return [`בַּקְּבוּצָה שֶׁל ${x.N} יֵשׁ ${x.c(a,'player')}. ${x.c(b,'player')} מְשַׂחֲקִים עַל הַמִּגְרָשׁ, וְהַשְּׁאָר יוֹשְׁבִים עַל הַסַּפְסָל. כַּמָּה שַׂחְקָנִים יוֹשְׁבִים עַל הַסַּפְסָל?`,a,b];}},
 {id:'soc-cards',th:'soccer',lv:[4,5],f:'a+b-c',g:x=>{const a=ri(10,40),b=ri(3,20),c=ri(2,a);return [`${x.N} ${x.v('אָסַף','אָסְפָה')} ${x.c(a,'card')} שֶׁל שַׂחְקָנֵי כַּדּוּרֶגֶל. ${x.v('הוּא קִבֵּל','הִיא קִבְּלָה')} עוֹד ${x.c(b,'card')} מֵחָבֵר, ${x.v('וְנָתַן','וְנָתְנָה')} ${x.c(c,'card')} לְחָבֵר אַחֵר. כַּמָּה קְלָפִים יֵשׁ ${x.v('לוֹ','לָהּ')} עַכְשָׁו?`,a,b,c];}},
 {id:'soc-start',th:'soccer',lv:[3,5],f:'b-a',g:x=>{const a=ri(2,5),b=a+ri(3,x.lv===3?25:60);return [`בַּמִּשְׂחָק הָאַחֲרוֹן ${x.N} ${x.v('הִבְקִיעַ','הִבְקִיעָה')} ${x.c(a,'goal')}, וְעַכְשָׁו יֵשׁ ${x.v('לוֹ','לָהּ')} ${x.c(b,'goal')} בָּעוֹנָה. כַּמָּה גּוֹלִים הָיוּ ${x.v('לוֹ','לָהּ')} לִפְנֵי הַמִּשְׂחָק?`,a,b];}},
 {id:'soc-teams',th:'soccer',lv:[5,5],f:'a*b',g:x=>{const b=ri(2,4);return [`בְּכָל קְבוּצַת כַּדּוּרֶגֶל מְשַׂחֲקִים ${x.c(11,'player')} עַל הַמִּגְרָשׁ. כַּמָּה שַׂחְקָנִים מְשַׂחֲקִים ${b===2?'בִּשְׁתֵּי קְבוּצוֹת':`בְּ-${B(b)} קְבוּצוֹת`}?`,11,b];}},
 {id:'soc-season',th:'soccer',lv:[4,5],f:'a+b+c',g:x=>{const a=ri(2,15),b=ri(2,15),c=ri(2,15);return [`${x.N} ${x.v('הִבְקִיעַ','הִבְקִיעָה')} ${x.c(a,'goal')} בְּסֶפְּטֶמְבֶּר, ${x.c(b,'goal')} בְּאוֹקְטוֹבֶּר ${x.c(c,'goal','וְ')} בְּנוֹבֶמְבֶּר. כַּמָּה גּוֹלִים ${x.v('הוּא הִבְקִיעַ','הִיא הִבְקִיעָה')} בִּשְׁלוֹשֶׁת הַחֳדָשִׁים?`,a,b,c];}},
 /* ---- basketball ---- */
 {id:'bb-add',th:'basket',lv:[1,3],f:'a+b',g:x=>{const [a,b]=split(x.lv);return [`${x.N} ${x.v('קָלַע','קָלְעָה')} ${x.c(a,'basket')} בַּחֲצִי הָרִאשׁוֹן שֶׁל הַמִּשְׂחָק, וְעוֹד ${x.c(b,'basket')} בַּחֲצִי הַשֵּׁנִי. כַּמָּה סַלִּים ${x.v('הוּא קָלַע','הִיא קָלְעָה')}?`,a,b];}},
 {id:'bb-miss',th:'basket',lv:[1,3],f:'a-b',g:x=>{const [a,b]=pair(x.lv,2);return [`${x.N} ${x.v('זָרַק','זָרְקָה')} ${x.c(a,'throw')} לַסַּל. ${x.c(b,'throw')} לֹא נִכְנְסוּ. כַּמָּה זְרִיקוֹת נִכְנְסוּ לַסַּל?`,a,b];}},
 {id:'bb-pts',th:'basket',lv:[3,5],f:'a*b',g:x=>{const a=ri(3,x.lv===3?6:12),b=x.lv===5?3:2;return [`${x.N} ${x.v('קָלַע','קָלְעָה')} ${x.c(a,'basket')}${b===3?' מֵרָחוֹק':''}. כָּל סַל כָּזֶה שָׁוֶה ${x.c(b,'point')}. כַּמָּה נְקֻדּוֹת ${x.v('הוּא קִבֵּל','הִיא קִבְּלָה')}?`,a,b];}},
 {id:'bb-win',th:'basket',lv:[2,4],f:'a-b',g:x=>{const [a,b]=pair(x.lv,2);return [`בַּמִּשְׂחָק נִרְשְׁמוּ לַקְּבוּצָה שֶׁל ${x.N} ${x.c(a,'point')}, וְלַקְּבוּצָה הַשְּׁנִיָּה ${x.c(b,'point')}. בְּכַמָּה נְקֻדּוֹת נִצְּחָה הַקְּבוּצָה שֶׁל ${x.N}?`,a,b];}},
 {id:'bb-week',th:'basket',lv:[4,5],f:'a*b',g:x=>{const a=ri(3,5),b=pk([4,5,10]);return [`${x.N} ${x.v('הִתְאַמֵּן','הִתְאַמְּנָה')} ${x.c(a,'day')} בַּשָּׁבוּעַ. בְּכָל אִמּוּן ${x.v('הוּא זָרַק','הִיא זָרְקָה')} ${x.c(b,'throw')}. כַּמָּה זְרִיקוֹת ${x.v('הוּא זָרַק','הִיא זָרְקָה')} בְּכָל הַשָּׁבוּעַ?`,a,b];}},
 {id:'bb-goal',th:'basket',lv:[2,4],f:'a-b',g:x=>{const [a,b]=pair(x.lv,2);return [`${x.N} ${x.v('רוֹצֶה','רוֹצָה')} לִקְלֹעַ ${x.c(a,'basket')} בָּאִמּוּן. ${x.v('הוּא כְּבָר קָלַע','הִיא כְּבָר קָלְעָה')} ${x.c(b,'basket')}. כַּמָּה סַלִּים עוֹד ${x.v('חֲסֵרִים לוֹ','חֲסֵרִים לָהּ')}?`,a,b];}},
 {id:'bb-dbl',th:'basket',lv:[2,3],f:'a*b',g:x=>{const a=ri(3,x.lv===2?10:40);return [`אֶתְמוֹל ${x.N} ${x.v('קָלַע','קָלְעָה')} ${x.c(a,'basket')}, וְהַיּוֹם ${x.v('הוּא קָלַע','הִיא קָלְעָה')} אוֹתוֹ מִסְפָּר בְּדִיּוּק. כַּמָּה סַלִּים ${x.v('הוּא קָלַע','הִיא קָלְעָה')} בִּשְׁנֵי הַיָּמִים?`,a,2];}},
 {id:'bb-teams',th:'basket',lv:[4,5],f:'b/a',g:x=>{const q=ri(2,6);return [`בְּכָל קְבוּצַת כַּדּוּרְסַל מְשַׂחֲקִים ${x.c(5,'player')}. לָאִמּוּן הִגִּיעוּ ${x.c(5*q,'kid')}. כַּמָּה קְבוּצוֹת מְלֵאוֹת אֶפְשָׁר לְהַרְכִּיב?`,5,5*q];}},
 /* ---- swimming ---- */
 {id:'sw-add',th:'swim',lv:[1,3],f:'a+b',g:x=>{const [a,b]=split(x.lv);return [`${x.N} ${x.v('שָׂחָה','שָׂחֲתָה')} ${x.c(a,'lap')} בַּבֹּקֶר, וְעוֹד ${x.c(b,'lap')} אַחֲרֵי הַצָּהֳרַיִם. כַּמָּה בְּרֵכוֹת ${x.v('הוּא שָׂחָה','הִיא שָׂחֲתָה')} הַיּוֹם?`,a,b];}},
 {id:'sw-left',th:'swim',lv:[1,3],f:'a-b',g:x=>{const [a,b]=pair(x.lv);return [`${x.N} ${x.v('תִּכְנֵן','תִּכְנְנָה')} לִשְׂחוֹת ${x.c(a,'lap')}. ${x.v('הוּא כְּבָר שָׂחָה','הִיא כְּבָר שָׂחֲתָה')} ${x.c(b,'lap')}. כַּמָּה בְּרֵכוֹת נִשְׁאֲרוּ ${x.v('לוֹ','לָהּ')}?`,a,b];}},
 {id:'sw-cmp',th:'swim',lv:[2,4],f:'a-b',two:1,g:x=>{const [a,b]=pair(x.lv);return [`${x.N} ${x.v('שָׂחָה','שָׂחֲתָה')} ${x.c(a,'lap')}, ${vav(x.Mn)} ${x.w('שָׂחָה','שָׂחֲתָה')} ${x.c(b,'lap')}. בְּכַמָּה בְּרֵכוֹת ${x.N} ${x.v('שָׂחָה','שָׂחֲתָה')} יוֹתֵר?`,a,b];}},
 {id:'sw-lanes',th:'swim',lv:[3,5],f:'a*b',g:x=>{const a=ri(3,x.lv===3?5:8),b=pk([2,3,4,5]);return [`בַּבְּרֵכָה יֵשׁ ${x.c(a,'lane')}. בְּכָל מַסְלוּל שׂוֹחִים ${x.c(b,'kid')}. כַּמָּה יְלָדִים שׂוֹחִים בַּבְּרֵכָה?`,a,b];}},
 {id:'sw-week',th:'swim',lv:[4,5],f:'a*b+c',g:x=>{const a=pk([2,3,4,5]),b=ri(3,5),c=ri(2,9);return [`בְּכָל יוֹם אִמּוּן ${x.N} ${x.v('שׂוֹחֶה','שׂוֹחָה')} ${x.c(a,'lap')}. הַשָּׁבוּעַ ${x.v('הוּא הִתְאַמֵּן','הִיא הִתְאַמְּנָה')} ${x.c(b,'day')}, וּבְשַׁבָּת ${x.v('הוּא שָׂחָה','הִיא שָׂחֲתָה')} עוֹד ${x.c(c,'lap')}. כַּמָּה בְּרֵכוֹת ${x.v('הוּא שָׂחָה','הִיא שָׂחֲתָה')} הַשָּׁבוּעַ?`,a,b,c];}},
 {id:'sw-time',th:'swim',lv:[3,4],f:'a-b',g:x=>{const a=pk([30,40,45,50,60]),b=ri(5,a-5);return [`הָאִמּוּן בַּבְּרֵכָה נִמְשָׁךְ ${x.c(a,'minute')}. ${x.N} ${x.v('כְּבָר שָׂחָה','כְּבָר שָׂחֲתָה')} ${x.c(b,'minute')}. כַּמָּה דַּקּוֹת נִשְׁאֲרוּ לָאִמּוּן?`,a,b];}},
 /* ---- piano ---- */
 {id:'pi-add',th:'piano',lv:[1,3],f:'a+b',g:x=>{const [a,b]=split(x.lv);return [`${x.N} ${x.v('נִגֵּן','נִגְּנָה')} ${x.c(a,'song')} בַּבֹּקֶר, וְעוֹד ${x.c(b,'song')} בָּעֶרֶב. כַּמָּה שִׁירִים ${x.v('הוּא נִגֵּן','הִיא נִגְּנָה')} הַיּוֹם?`,a,b];}},
 {id:'pi-notes',th:'piano',lv:[1,3],f:'a-b',g:x=>{const [a,b]=pair(x.lv);return [`בַּשִּׁיר הֶחָדָשׁ יֵשׁ ${x.c(a,'note')}. ${x.N} ${x.v('כְּבָר לָמַד','כְּבָר לָמְדָה')} ${x.c(b,'note')}. כַּמָּה תָּוִים נִשְׁאֲרוּ ${x.v('לוֹ','לָהּ')} לִלְמֹד?`,a,b];}},
 {id:'pi-mul',th:'piano',lv:[3,5],f:'a*b',g:x=>{const a=pk([5,10]),b=ri(3,7);return [`${x.N} ${x.v('מִתְאַמֵּן','מִתְאַמֶּנֶת')} בִּפְסַנְתֵּר ${x.c(a,'minute')} בְּכָל יוֹם. כַּמָּה דַּקּוֹת ${x.v('הוּא מִתְאַמֵּן','הִיא מִתְאַמֶּנֶת')} בְּ-${B(b)} יָמִים?`,a,b];}},
 {id:'pi-book',th:'piano',lv:[2,4],f:'a-b',g:x=>{const [a,b]=pair(x.lv);return [`בַּסֵּפֶר שֶׁל ${x.N} יֵשׁ ${x.c(a,'song')}. ${x.v('הוּא כְּבָר יוֹדֵעַ','הִיא כְּבָר יוֹדַעַת')} לְנַגֵּן ${x.c(b,'song')}. כַּמָּה שִׁירִים ${x.v('הוּא עוֹד לֹא יוֹדֵעַ','הִיא עוֹד לֹא יוֹדַעַת')}?`,a,b];}},
 {id:'pi-months',th:'piano',lv:[4,5],f:'a*b-c',g:x=>{const a=ri(2,4),b=ri(3,6),c=ri(2,a*b-1);return [`${x.N} ${x.v('לָמַד','לָמְדָה')} ${x.c(a,'song')} בְּכָל חֹדֶשׁ, בְּמֶשֶׁךְ ${x.c(b,'month')}. ${x.c(c,'song')} ${x.v('הוּא שָׁכַח','הִיא שָׁכְחָה')}. כַּמָּה שִׁירִים ${x.v('הוּא זוֹכֵר','הִיא זוֹכֶרֶת')} עַכְשָׁו?`,a,b,c];}},
 {id:'pi-test',th:'piano',lv:[3,4],f:'a-b',g:x=>{const a=pk([20,30,40,50,60]),b=ri(5,a-3);return [`לִפְנֵי הַהוֹפָעָה ${x.N} ${x.v('צָרִיךְ','צְרִיכָה')} לְהִתְאַמֵּן ${x.c(a,'minute')}. ${x.v('הוּא כְּבָר הִתְאַמֵּן','הִיא כְּבָר הִתְאַמְּנָה')} ${x.c(b,'minute')}. כַּמָּה דַּקּוֹת עוֹד ${x.v('חֲסֵרוֹת לוֹ','חֲסֵרוֹת לָהּ')}?`,a,b];}},
 {id:'pi-keys',th:'piano',lv:[3,5],f:'a+b',g:x=>{const [a,b]=pk([[52,36],[36,25],[29,20],[22,15],[15,10]]);return [`לַפְּסַנְתֵּר שֶׁל ${x.N} יֵשׁ ${x.c(a,'key')} לְבָנִים ${x.c(b,'key','וְ')} שְׁחֹרִים. כַּמָּה קְלִידִים יֵשׁ לַפְּסַנְתֵּר?`,a,b];}},
 /* ---- building ---- */
 {id:'bl-add',th:'build',lv:[1,3],f:'a+b',g:x=>{const [a,b]=split(x.lv,3);return [`${x.N} ${x.v('בָּנָה','בָּנְתָה')} מִגְדָּל מִ-${B(a)} בְּלוֹקִים. ${x.v('הוּא הוֹסִיף','הִיא הוֹסִיפָה')} עוֹד ${x.c(b,'block')}. מִכַּמָּה בְּלוֹקִים בָּנוּי הַמִּגְדָּל עַכְשָׁו?`,a,b];}},
 {id:'bl-sub',th:'build',lv:[1,3],f:'a-b',g:x=>{const [a,b]=pair(x.lv);return [`בַּקֻּפְסָה הָיוּ ${x.c(a,'block')}. ${x.N} ${x.v('לָקַח','לָקְחָה')} ${x.c(b,'block')} לַבִּנְיָן. כַּמָּה בְּלוֹקִים נִשְׁאֲרוּ בַּקֻּפְסָה?`,a,b];}},
 {id:'bl-win',th:'build',lv:[3,5],f:'a*b',g:x=>{const a=ri(2,x.lv===3?5:9),b=pk([2,3,4,5]);return [`${x.N} ${x.v('בּוֹנֶה','בּוֹנָה')} בִּנְיָן שֶׁל ${x.c(a,'floor')}. בְּכָל קוֹמָה יֵשׁ ${x.c(b,'window')}. כַּמָּה חַלּוֹנוֹת יֵשׁ בַּבִּנְיָן?`,a,b];}},
 {id:'bl-cmp',th:'build',lv:[2,4],f:'a-b',two:1,g:x=>{const [a,b]=pair(Math.min(x.lv,3),2);return [`הַמִּגְדָּל שֶׁל ${x.N} גָּבוֹהַּ ${x.c(a,'floor')}, וְהַמִּגְדָּל שֶׁל ${x.M} גָּבוֹהַּ ${x.c(b,'floor')}. בְּכַמָּה קוֹמוֹת הַמִּגְדָּל שֶׁל ${x.N} גָּבוֹהַּ יוֹתֵר?`,a,b];}},
 {id:'bl-div',th:'build',lv:[4,5],f:'a/b',g:x=>{const b=ri(2,5),q=ri(2,9);return [`${x.N} ${x.v('חִלֵּק','חִלְּקָה')} ${x.c(b*q,'block')} שָׁוֶה בְּשָׁוֶה ${x.c(b,'tower','לְ')}. כַּמָּה בְּלוֹקִים יֵשׁ בְּכָל מִגְדָּל?`,b*q,b];}},
 {id:'bl-fall',th:'build',lv:[4,5],f:'a*b-c',g:x=>{const a=ri(2,5),b=ri(3,10),c=ri(2,b);return [`${x.N} ${x.v('בָּנָה','בָּנְתָה')} ${x.c(a,'tower')}, וּבְכָל מִגְדָּל ${x.c(b,'block')}. ${x.c(c,'block')} נָפְלוּ. כַּמָּה בְּלוֹקִים נִשְׁאֲרוּ בַּמִּגְדָּלִים?`,a,b,c];}},
 {id:'bl-need',th:'build',lv:[2,4],f:'a-b',g:x=>{const [a,b]=pair(x.lv,2);return [`לַגֶּשֶׁר ${x.N} ${x.v('צָרִיךְ','צְרִיכָה')} ${x.c(a,'block')}. יֵשׁ ${x.v('לוֹ','לָהּ')} ${x.c(b,'block')}. כַּמָּה בְּלוֹקִים עוֹד ${x.v('חֲסֵרִים לוֹ','חֲסֵרִים לָהּ')}?`,a,b];}},
 {id:'bl-half',th:'build',lv:[3,4],f:'a/2',g:x=>{const a=2*ri(3,x.lv===3?10:40);return [`${lp(x.Nn)} הָיוּ ${x.c(a,'block')}. ${x.v('הוּא נָתַן','הִיא נָתְנָה')} חֲצִי מֵהֶם לְחָבֵר. כַּמָּה בְּלוֹקִים נִשְׁאֲרוּ ${x.v('לוֹ','לָהּ')}?`,a];}},
 /* ---- space ---- */
 {id:'sp-stars',th:'space',lv:[1,3],f:'a+b',g:x=>{const [a,b]=split(x.lv);return [`מֵהַחַלּוֹן שֶׁל הַחֲלָלִית ${x.N} ${x.v('סָפַר','סָפְרָה')} ${x.c(a,'star')} בַּצַּד הַיְּמָנִי, וְעוֹד ${x.c(b,'star')} בַּצַּד הַשְּׂמָאלִי. כַּמָּה כּוֹכָבִים ${x.v('הוּא סָפַר','הִיא סָפְרָה')}?`,a,b];}},
 {id:'sp-walk',th:'space',lv:[1,3],f:'a-b',g:x=>{const [a,b]=pair(x.lv,2);return [`בַּחֲלָלִית יֵשׁ ${x.c(a,'astro')}. ${x.c(b,'astro')} יָצְאוּ לְהַלִּיכָה בֶּחָלָל. כַּמָּה אַסְטְרוֹנָאוּטִים נִשְׁאֲרוּ בִּפְנִים?`,a,b];}},
 {id:'sp-eng',th:'space',lv:[3,5],f:'a*b',g:x=>{const a=ri(2,x.lv===3?4:6),b=ri(2,x.lv===3?5:9);return [`לְכָל חֲלָלִית יֵשׁ ${x.c(a,'engine')}. כַּמָּה מְנוֹעִים יֵשׁ ${x.c(b,'ship','לְ')}?`,a,b];}},
 {id:'sp-moon',th:'space',lv:[2,4],f:'a-b',two:1,g:x=>{const [a,b]=pair(x.lv,2);return [`עַל הַיָּרֵחַ ${x.N} ${x.v('צָעַד','צָעֲדָה')} ${x.c(a,'step')}, ${vav(x.Mn)} ${x.w('צָעַד','צָעֲדָה')} ${x.c(b,'step')}. בְּכַמָּה צְעָדִים ${x.N} ${x.v('צָעַד','צָעֲדָה')} יוֹתֵר?`,a,b];}},
 {id:'sp-share',th:'space',lv:[4,5],f:'a/b',g:x=>{const b=ri(2,5),q=ri(2,6);return [`${x.c(b*q,'astro')} מִתְחַלְּקִים שָׁוֶה בְּשָׁוֶה ${x.c(b,'ship','לְ')}. כַּמָּה אַסְטְרוֹנָאוּטִים יֵשׁ בְּכָל חֲלָלִית?`,b*q,b];}},
 {id:'sp-station',th:'space',lv:[4,5],f:'a-b+c',g:x=>{const a=ri(6,20),b=ri(2,a-1),c=ri(2,9);return [`בְּתַחֲנַת הֶחָלָל הָיוּ ${x.c(a,'astro')}. ${x.c(b,'astro')} חָזְרוּ לְכַדּוּר הָאָרֶץ, וְעוֹד ${x.c(c,'astro')} הִגִּיעוּ. כַּמָּה אַסְטְרוֹנָאוּטִים יֵשׁ עַכְשָׁו בַּתַּחֲנָה?`,a,b,c];}},
 {id:'sp-rocks',th:'space',lv:[3,5],f:'b-a',g:x=>{const [b,a]=pair(x.lv,2);return [`בַּקֻּפְסָה שֶׁל ${x.N} הָיוּ כַּמָּה אַבְנֵי יָרֵחַ. ${x.v('הוּא הוֹסִיף','הִיא הוֹסִיפָה')} ${x.c(a,'rock')}, וְעַכְשָׁו יֵשׁ בַּקֻּפְסָה ${x.c(b,'rock')}. כַּמָּה אֲבָנִים הָיוּ בַּהַתְחָלָה?`,a,b];}},
 {id:'sp-count',th:'space',lv:[2,4],f:'a-b',g:x=>{const a=x.lv===2?pk([10,15,20]):pk([10,20,30,40,50,60]),b=ri(2,a-1);return [`הַטִּיל יוֹצֵא לַדֶּרֶךְ בְּעוֹד ${x.c(a,'minute')}. עָבְרוּ ${x.c(b,'minute')}. כַּמָּה דַּקּוֹת נִשְׁאֲרוּ עַד הַשִּׁגּוּר?`,a,b];}},
 /* ---- mixed ---- */
 {id:'st-add',th:'build',lv:[1,2],f:'a+b',g:x=>{const [a,b]=split(x.lv);return [`${lp(x.Nn)} יֵשׁ ${x.c(a,'sticker')} שֶׁל חֲלָלִיּוֹת. ${x.v('הוּא קִבֵּל','הִיא קִבְּלָה')} עוֹד ${x.c(b,'sticker')}. כַּמָּה מַדְבֵּקוֹת יֵשׁ ${x.v('לוֹ','לָהּ')} עַכְשָׁו?`,a,b];}},
 {id:'mo-need',th:'soccer',lv:[2,4],f:'a-b',g:x=>{const [a,b]=pair(x.lv,2);return [`כַּדּוּר חָדָשׁ עוֹלֶה ${x.c(a,'shekel')}. ${lp(x.Nn)} יֵשׁ ${x.c(b,'shekel')}. כַּמָּה שְׁקָלִים עוֹד ${x.v('חֲסֵרִים לוֹ','חֲסֵרִים לָהּ')}?`,a,b];}},
 {id:'mo-change',th:'soccer',lv:[4,5],f:'c-a*b',g:x=>{const a=ri(3,9),b=ri(2,4),c=pk([50,100]);return [`כָּל כַּדּוּר עוֹלֶה ${x.c(a,'shekel')}. ${x.N} ${x.v('קָנָה','קָנְתָה')} ${x.c(b,'ball')} ${x.v('וְשִׁלֵּם','וְשִׁלְּמָה')} בִּשְׁטָר שֶׁל ${B(c)} שְׁקָלִים. כַּמָּה עֹדֶף ${x.v('הוּא קִבֵּל','הִיא קִבְּלָה')}?`,a,b,c];}},
 {id:'mo-two',th:'swim',lv:[3,5],f:'a+b',g:x=>{const a=ri(5,45),b=ri(5,45);return [`מִשְׁקְפֵי שְׂחִיָּה עוֹלִים ${x.c(a,'shekel')}, וְכוֹבַע יָם עוֹלֶה ${x.c(b,'shekel')}. ${x.N} ${x.v('קָנָה','קָנְתָה')} אֶת שְׁנֵיהֶם. כַּמָּה ${x.v('הוּא שִׁלֵּם','הִיא שִׁלְּמָה')}?`,a,b];}},
];
const WT_BY_LV=lv=>WT.filter(t=>t.lv[0]<=lv&&lv<=t.lv[1]);
/* the answer from the numbers, in text order */
const solve=(f,nums)=>{const [a,b,c,d]=nums;return Function('a','b','c','d','return '+f)(a,b,c,d);};
function wordQ(lv,tid){const pool=tid?WT.filter(t=>t.id===tid):WT_BY_LV(lv);const t=pk(pool);const fem=rnd()<.5;
  const Nn=pk(fem?NAMES_F:NAMES_M);let Mn;do{Mn=pk(rnd()<.5?NAMES_F:NAMES_M);}while(Mn===Nn);const gM=NAMES_F.includes(Mn);
  const x={lv:Math.max(t.lv[0],Math.min(t.lv[1],lv)),Nn,Mn,N:Nn,M:Mn,v:(m,f)=>mark(Nn,fem?f:m),w:(m,f)=>mark(Mn,gM?f:m),c:count};
  for(let k=0;k<40;k++){const [text,...nums]=t.g(x);const v=solve(t.f,nums);if(Number.isInteger(v)&&v>=0&&v<=200)
    return Object.assign({sk:'wp',lv,tid:t.id,th:t.th,f:t.f,nums,tx:text,text:'',v,html:`<div class="lnwp">${text}</div>`,ex:ex(t.f.replace(/[abcd]/g,ch=>nums['abcd'.indexOf(ch)]).replace(/\*/g,' × ').replace(/\//g,' : ').replace(/-/g,' − ').replace(/\+/g,' + ').replace(/\s+/g,' ')+' = '+v),key:'w'+t.id+nums.join(',')},numOpts(v,[v+1,v-1,...nums.filter(n=>n!==v)]));}
  throw new Error('word template '+t.id);}

/* ---------- challenge problems (a strong kid) ---------- */
const FRUIT=['🍎','🍌','🍇','🍒','🍓'];
const CH={
 miss:lv=>{const lim=[0,10,20,100,100,100][lv];let op=pk(lv>=4?['+','−','×']:['+','−']);let a,c,pos=ri(0,1),ans;
   if(op==='×'){a=ri(2,9);ans=ri(2,lv===5?12:9);c=a*ans;}else if(op==='+'){c=ri(Math.min(lim,5),lim);a=ri(1,c-1);ans=c-a;}else{const big=ri(Math.min(lim,5),lim);a=ri(1,big-1);if(pos===0){ans=big;c=big-a;}else{ans=a;a=big;c=big-ans;}}
   const sq='<span class="lnbox"></span>';const lhs=op==='−'?(pos===0?`${sq} − ${a}`:`${a} − ${sq}`):pos===0?`${sq} ${op} ${a}`:`${a} ${op} ${sq}`;
   return {kind:'miss',p:{op,a,c,pos},v:ans,html:`<div class="lnx">${L(`${lhs} = ${c}`)}</div>`,text:'אֵיזֶה מִסְפָּר מִסְתַּתֵּר בַּמִּשְׁבֶּצֶת?',ds:[c,ans+1,ans-1],key:'m'+op+a+c+pos};},
 riddle:lv=>{const lim=[0,10,20,50,100,100][lv];
   if(lv<=3){const x=ri(1,lim-2);if(rnd()<.5){const a=ri(1,lim-x);return {kind:'riddle',p:{steps:[['+',a]],res:x+a},v:x,text:`אֲנִי מִסְפָּר. אִם מוֹסִיפִים לִי ${B(a)}, מְקַבְּלִים ${B(x+a)}. מִי אֲנִי?`,ds:[x+a,x+2*a,x+1],key:'r+'+x+a};}
     const a=ri(1,Math.max(1,Math.min(x,lim)));const X=x+a;return {kind:'riddle',p:{steps:[['-',a]],res:X-a},v:X,text:`אֲנִי מִסְפָּר. אִם מוֹרִידִים מִמֶּנִּי ${B(a)}, נִשְׁאָרִים ${B(X-a)}. מִי אֲנִי?`,ds:[X-2*a,X-a,X+1],key:'r-'+X+a};}
   const k=pk([2,3,lv===5?4:2]),x=ri(2,lv===5?20:12),a=ri(1,9);return {kind:'riddle',p:{steps:[['*',k],['+',a]],res:x*k+a},v:x,text:`אֲנִי מִסְפָּר. אִם כּוֹפְלִים אוֹתִי פִּי ${B(k)} וּמוֹסִיפִים ${B(a)}, מְקַבְּלִים ${B(x*k+a)}. מִי אֲנִי?`,ds:[x*k+a,x+1,x*k],key:'rk'+x+k+a};},
 balance:lv=>{const [f1,f2,f3]=shuf(FRUIT);const A=ri(2,lv>=3?12:6),Bv=ri(1,lv>=3?15:8);
   const rows=[[`${f1} + ${f1}`,2*A],[`${f1} + ${f2}`,A+Bv]];let v=Bv,ask=f2,p={eqs:[[[0,0],2*A],[[0,1],A+Bv]],ask:1};
   if(lv>=4){const Cv=ri(1,12);rows.push([`${f2} + ${f3}`,Bv+Cv]);v=Cv;ask=f3;p={eqs:[[[0,0],2*A],[[0,1],A+Bv],[[1,2],Bv+Cv]],ask:2};}
   return {kind:'balance',p,v,html:`<div class="lnbal">${rows.map(r=>`<div>${L(`${r[0]} = ${r[1]}`)}</div>`).join('')}<div class="lnask">${L(`${ask} = ?`)}</div></div>`,text:'כַּמָּה שָׁוֶה הַפְּרִי הָאַחֲרוֹן?',tip:'כָּל פְּרִי שָׁוֶה מִסְפָּר. מַתְחִילִים מֵהַשּׁוּרָה הָרִאשׁוֹנָה.',ds:[rows[rows.length-1][1],A,v+1],key:'b'+rows.map(r=>r[1]).join(',')};},
 digits:lv=>{if(lv<=3){const t=ri(1,8),d=ri(1,9-t);return {kind:'digits',p:{t,d},v:t*10+t+d,text:`אֲנִי מִסְפָּר דּוּ-סִפְרָתִי. סִפְרַת הָעֲשָׂרוֹת שֶׁלִּי הִיא ${B(t)}, וְסִפְרַת הָאֲחָדוֹת גְּדוֹלָה מִמֶּנָּה בְּ-${B(d)}. מִי אֲנִי?`,ds:[(t+d)*10+t,t*10+d,t*10+t],key:'g'+t+d};}
   let t,u;do{u=ri(0,8);t=ri(u+1,9);}while(t+u>18);const s=t+u,d=t-u;return {kind:'digits2',p:{s,d},v:t*10+u,text:`אֲנִי מִסְפָּר דּוּ-סִפְרָתִי. סְכוּם הַסְּפָרוֹת שֶׁלִּי הוּא ${B(s)}, וְסִפְרַת הָעֲשָׂרוֹת גְּדוֹלָה בְּ-${B(d)} מִסִּפְרַת הָאֲחָדוֹת. מִי אֲנִי?`,ds:[u*10+t,t*10+u+1,s*10+d].filter(x=>x<100),key:'h'+s+d};},
 grow:lv=>{let seq,rule;if(lv<=3){const a=ri(1,10),d0=ri(1,2);seq=[a];for(let j=0;j<5;j++)seq.push(seq[j]+d0+j);rule='הַקְּפִיצָה גְּדֵלָה בְּ-1 כָּל פַּעַם';}
   else if(lv===4){const a=ri(10,30),x=ri(3,6),y=ri(1,x-1);seq=[a];for(let j=0;j<5;j++)seq.push(seq[j]+(j%2?-y:x));rule=`קָדִימָה ${x}, אָחוֹרָה ${y}, וְשׁוּב`;}
   else{const a=ri(1,5),k=2;seq=[a];for(let j=0;j<4;j++)seq.push(seq[j]*k);rule='כָּל מִסְפָּר גָּדוֹל פִּי 2 מֵהַקּוֹדֵם';}
   const v=seq.pop();return {kind:'grow',p:{seq},v,html:`<div class="lnx lnseq">${L(seq.join(', ')+', ?')}</div>`,text:'מָה הַמִּסְפָּר הַבָּא?',tip:'חַפֵּשׂ אֶת הַחֻקִּיּוּת.',rule,ds:[v+1,v-1,2*seq[seq.length-1]-seq[seq.length-2]],key:'q'+seq.join(',')};},
 legs:lv=>{const a=ri(2,lv===5?6:4),b=ri(2,lv===5?6:4);return {kind:'legs',p:{a,b},v:4*a+2*b,text:`בֶּחָצֵר יֵשׁ ${count(a,'dog')} וְעוֹד ${count(b,'hen')}. לְכָל כֶּלֶב יֵשׁ ${B(4)} רַגְלַיִם, וּלְכָל תַּרְנְגֹלֶת יֵשׁ שְׁתֵּי רַגְלַיִם. כַּמָּה רַגְלַיִם יֵשׁ לְכֻלָּם בְּיַחַד?`,ds:[2*(a+b),4*(a+b),4*a+2*b+2],key:'l'+a+b};},
};
const CH_BY_LV=[null,['miss','riddle'],['miss','riddle','balance'],['miss','riddle','balance','digits','grow'],['miss','riddle','balance','digits','grow'],['miss','riddle','balance','digits','grow','legs']];
function chalQ(lv,kind){kind=kind||pk(CH_BY_LV[lv]);const q=CH[kind](lv);return Object.assign({sk:'ch',lv},q,{html:q.html||`<div class="lnwp">${q.text}</div>`,text:q.html?q.text:'',ex:q.rule?`<div>${q.rule}</div>`:''},numOpts(q.v,q.ds));}

/* ---------- paper & pencil tasks ---------- */
const PM={
 calc:lv=>{let a,b,op='+';if(lv===1){a=ri(4,9);b=ri(3,9);}else if(lv===2){const ua=ri(3,9);a=ri(1,6)*10+ua;b=ri(1,2)*10+ri(10-ua,9);}
   else if(lv===3){a=ri(31,95);b=ri(12,a-10);op='-';}else if(lv===4){a=ri(120,580);b=ri(110,399);}else{a=ri(320,900);b=ri(118,a-100);op='-';}
   const v=op==='+'?a+b:a-b;return {kind:'calc',p:{a,b,op},v,task:`פְּתֹר עַל הַדַּף${lv>=2?' בְּתַרְגִּיל מְאֻנָּךְ':''}:`,big:`${a} ${op==='+'?'+':'−'} ${b}`,sol:colSol(a,b,op==='+'?'+':'−')};},
 draw:lv=>{const r=ri(2,lv>=3?6:4),c=ri(2,lv>=3?6:5);return {kind:'draw',p:{r,c},v:r*c,task:`צַיֵּר ${count(r,'row')} שֶׁל ${count(c,'circle')}. כַּמָּה עִגּוּלִים צִיַּרְתָּ?`,sol:`${dots(r,c)}<div>${L(Array(r).fill(c).join(' + ')+' = '+r*c)}</div>`};},
 groups:lv=>{const k=ri(2,lv>=3?5:3),q=ri(2,lv>=3?6:4);return {kind:'groups',p:{n:k*q,k},v:q,task:`צַיֵּר ${B(k*q)} כּוֹכָבִים, וְהַקֵּף קְבוּצוֹת שֶׁל ${B(k)}. כַּמָּה קְבוּצוֹת יֵשׁ?`,sol:`<div class="lngr">${Array(q).fill(`<span>${'★'.repeat(k)}</span>`).join('')}</div><div>${L(`${k*q} : ${k} = ${q}`)}</div>`};},
 line:lv=>{const j=ri(2,lv>=3?5:4),n=ri(2,4),s=lv>=4?ri(1,10):0;const end=s+j*n;return {kind:'line',p:{s,j,n},v:end,task:`צַיֵּר קַו מִסְפָּרִים מִ-${B(0)} עַד ${B(Math.ceil((end+2)/5)*5)}. הַתְחֵל בְּ-${B(s)} וּקְפֹץ ${count(n,'jump')} שֶׁל ${B(j)}. אֵיפֹה נָחַתָּ?`,sol:`<div>${L(Array.from({length:n+1},(_,i)=>s+i*j).join(' → '))}</div>`};}
};
/* writing tasks: a finite bank (each item has a key; the game picks unseen ones first) */
const PW_COPY=['הַכַּדּוּר עָף גָּבוֹהַּ.','אֲנִי שׂוֹחֶה בַּבְּרֵכָה.','הַחֲלָלִית טָסָה לַיָּרֵחַ.','אֲנִי מְנַגֵּן בִּפְסַנְתֵּר.','בָּנִיתִי מִגְדָּל גָּבוֹהַּ.','קָלַעְתִּי סַל!'];
const PW_LET=[['מ','מַיִם, מִטָּה, מְכוֹנִית'],['ש','שֶׁמֶשׁ, שִׁיר, שָׁעוֹן'],['ב','בַּיִת, בַּלּוֹן, בָּנָנָה'],['כ','כַּדּוּר, כֶּלֶב, כּוֹכָב'],['ת','תַּפּוּחַ, תֹּף, תִּיק'],['ר','רַכֶּבֶת, רֶגֶל, רוֹבּוֹט'],['ל','לֵב, לֶחֶם, לִימוֹן'],['ד','דָּג, דֶּלֶת, דְּבוֹרָה']];
const PW_FREE=['כְּתֹב מִשְׁפָּט אֶחָד עַל הַסְּפּוֹרְט שֶׁאַתָּה הֲכִי אוֹהֵב.','כְּתֹב מִשְׁפָּט אֶחָד: מָה הָיִיתָ לוֹקֵחַ אִתְּךָ לֶחָלָל?','צַיֵּר מִגְדָּל, וּכְתֹב מִתַּחְתָּיו כַּמָּה קוֹמוֹת יֵשׁ בּוֹ.','כְּתֹב אֶת הַשֵּׁם שֶׁלְּךָ וְאֶת הַשֵּׁם שֶׁל חָבֵר טוֹב.','צַיֵּר אֶת הַמִּשְׂחָק שֶׁאַתָּה אוֹהֵב, וּכְתֹב לוֹ שֵׁם.'];
const PW=[...PW_COPY.map(s=>({k:'c'+s,kind:'copy',task:'הַעְתֵּק לַדַּף אֶת הַמִּשְׁפָּט (בְּלִי נִקּוּד):',big:s,check:['רֶוַח בֵּין מִלָּה לְמִלָּה','סִימָן בַּסּוֹף (. אוֹ !)','כָּל הָאוֹתִיּוֹת עַל הַשּׁוּרָה']})),
  ...PW_LET.map(([l,ws])=>({k:'l'+l,kind:'words',task:`כְּתֹב עַל הַדַּף ${count(3,'word')} שֶׁמַּתְחִילוֹת בָּאוֹת:`,big:l,check:[`כָּל מִלָּה מַתְחִילָה בְּ-${l}`,'רֶוַח בֵּין הַמִּלִּים'],eg:ws})),
  ...PW_FREE.map(t=>({k:'f'+t,kind:'free',task:t,check:['רֶוַח בֵּין מִלָּה לְמִלָּה','סִימָן בַּסּוֹף']}))];
function colSol(a,b,op){const v=op==='+'?a+b:a-b;/* op: '+' or '−' */const w=String(Math.max(a,b,v)).length+2;const r=x=>String(x).padStart(w,' ');
  return `<pre class="lncol" dir="ltr">${r(a)}\n${op}${r(b).slice(1)}\n${'─'.repeat(w)}\n${r(v)}</pre>`;}
const dots=(r,c)=>`<div class="lndots">${Array(r).fill(`<div>${'●'.repeat(c)}</div>`).join('')}</div>`;
function paperQ(kind,lv,item){if(kind==='write'){const t=item||pk(PW);return Object.assign({sk:'pp-write',lv,self:true},t);}
  const ks=lv<=1?['calc','draw','groups']:lv===2?['calc','draw','groups','line']:['calc','calc','draw','groups','line'];const q=PM[pk(ks)](lv);return Object.assign({sk:'pp-math',lv},q);}

/* one question of any engine skill */
function gen(sk,lv){lv=Math.max(1,Math.min(maxLv(sk),lv|0||1));if(MM[sk])return MM[sk](lv);if(sk==='wp')return wordQ(lv);if(sk==='ch')return chalQ(lv);if(sk==='pp-math')return paperQ('math',lv);if(sk==='pp-write')return paperQ('write',lv);throw new Error('no generator '+sk);}
/* math placement ladder: easy → hard */
const MATH_LADDER=[['mm-ten',1],['mm-dbl',1],['mm-skip',1],['mm-ten',2],['mm-dbl',2],['mm-pv',1],['mm-dbl',3],['mm-skip',2],['mm-comp',1],['mm-ten',3],['wp',2],['mm-pv',2],['mm-ten',4],['mm-comp',2],['mm-skip',3],['wp',3],['mm-pv',3],['mm-dbl',4],['mm-comp',3],['mm-ten',5],['mm-pv',4],['wp',4],['mm-comp',4],['mm-dbl',5],['mm-skip',4],['mm-pv',5],['wp',5],['mm-comp',5],['mm-skip',5]];

/* kid names (nikud) and parent names (plain) */
const KID={'mm-ten':'מַשְׁלִימִים לְ-10','mm-dbl':'כְּפוּלִים','mm-comp':'מְעַגְּלִים וּמְתַקְּנִים','mm-skip':'סְפִירָה בְּדִלּוּגִים','mm-pv':'לוּחַ הַמֵּאָה','wp':'סִפּוּרֵי חֶשְׁבּוֹן','ch':'חִידוֹת לָאַלּוּפִים','mix':'חֲזָרָה מְעֻרְבֶּבֶת','pp-math':'דַּף וְעִפָּרוֹן','pp-write':'דַּף וְעִפָּרוֹן'};
const PAR={'mm-ten':'השלמה ל-10 ולעשרת','mm-dbl':'כפולים וכמעט כפולים','mm-comp':'עיגול ותיקון (+9, +19, −9)','mm-skip':'ספירה בדילוגים','mm-pv':'קפיצות בלוח המאה','wp':'בעיות מילוליות','ch':'אתגרי חשיבה','pp-math':'דף ועיפרון: חשבון','pp-write':'דף ועיפרון: כתיבה'};

/* ---------- finite banks: what he has seen, wrong items back on schedule, runway ----------
   st.sn[bank] = "h,h,…" seen item ids, oldest first (capped) · st.wr[bank][h] = [due day, step] wrong/helped items (1,2,4,8 days)
   st.bu[bank][day] = new items seen that day (last 21 days) — the pace for the runway */
const SN_CAP=300,WR_CAP=40;
const hash=k=>{let x=0x811c9dc5;const s=String(k);for(let i=0;i<s.length;i++){x^=s.charCodeAt(i);x=Math.imul(x,0x01000193)>>>0;}return x.toString(36);};
const snList=(st,b)=>{const v=(st.sn||{})[b];return v?v.split(','):[];};
function seen(st,bank,key,ok,helped){st=ensure(st);st.sn=st.sn||{};st.wr=st.wr||{};st.bu=st.bu||{};const h=hash(key),t=today();
  const l=snList(st,bank);const at=l.indexOf(h);const isNew=at<0;if(!isNew)l.splice(at,1);l.push(h);st.sn[bank]=l.slice(-SN_CAP).join(',');
  if(isNew){const u=st.bu[bank]||(st.bu[bank]={});u[t]=(u[t]|0)+1;for(const d in u)if(+d<t-21)delete u[d];}
  const w=st.wr[bank]||(st.wr[bank]={});
  if(!ok||helped){w[h]=[t+IV[0],0];}
  else if(w[h]&&w[h][0]<=t){const step=w[h][1]+1;if(step>3)delete w[h];else w[h]=[t+IV[step],step];}
  const ks=Object.keys(w);if(ks.length>WR_CAP)ks.sort((a,b)=>w[a][0]-w[b][0]).slice(0,ks.length-WR_CAP).forEach(k=>delete w[k]);
  if(!ks.length)delete st.wr[bank];return isNew;}
/* items: [{k, lv?}] or keys · o: {lv: level filter, upto: ≤ lv, exclude: Set of keys, mastered: allow spot reviews, held: Set of keys picked and not answered yet}
   order: a wrong item that is due → an unseen item at his level → (mastered) a 15% spot review → the oldest seen item. A held item is skipped while others are left.
   Picking records nothing: the pack calls seen() once, after the answer (#360). */
function pickItem(st,bank,items,o){st=ensure(st);o=o||{};const t=today();const ex=o.exclude||new Set(),hd=o.held||new Set();
  const all=items.map(x=>typeof x==='object'?x:{k:x}).filter(x=>!ex.has(x.k));
  const atLv=o.lv==null?all:all.filter(x=>x.lv==null||(o.upto?x.lv<=o.lv:x.lv===o.lv));const pool=atLv.length?atLv:all;if(!pool.length)return null;
  const w=(st.wr||{})[bank]||{};const sn=snList(st,bank);const pos=new Map(sn.map((h,i)=>[h,i]));
  const due=pool.filter(x=>{const e=w[hash(x.k)];return e&&e[0]<=t&&!hd.has(x.k);}).sort((a,b)=>w[hash(a.k)][0]-w[hash(b.k)][0]);
  if(due.length)return {item:due[0],why:'review'};
  const fresh=pool.filter(x=>!pos.has(hash(x.k))&&!hd.has(x.k));const old=pool.filter(x=>pos.has(hash(x.k))&&!w[hash(x.k)]&&!hd.has(x.k));
  if(o.mastered&&old.length&&rnd()<.15)return {item:pk(old),why:'spot'};
  if(fresh.length)return {item:pk(fresh),why:'new'};
  const rec=pool.filter(x=>(!w[hash(x.k)]||w[hash(x.k)][0]<=t)&&!hd.has(x.k));const src=rec.length?rec:pool;const at=x=>pos.has(hash(x.k))?pos.get(hash(x.k)):-1;
  return {item:src.slice().sort((a,b)=>at(a)-at(b))[0],why:'recycle'};}
/* unseen items left at his level, and how many weeks that is at his pace (new items a week, last 14 days; perWeek when no data) */
function runwayOf(st,bank,items,o){st=ensure(st);o=o||{};const t=today();const sn=new Set(snList(st,bank));
  const all=items.map(x=>typeof x==='object'?x:{k:x});const atLv=o.lv==null?all:all.filter(x=>x.lv==null||(o.upto?x.lv<=o.lv:x.lv===o.lv));
  const left=atLv.filter(x=>!sn.has(hash(x.k))).length;const u=(st.bu||{})[bank]||{};let n14=0;for(const d in u)if(+d>t-14)n14+=u[d];
  const weekly=n14?n14/2:(o.perWeek||0);const weeks=weekly?left/weekly:Infinity;
  return {bank,total:atLv.length,left,weekly,weeks,low:weekly>0&&weeks<2,used:n14>0};}
function mergeSeen(dst,src){for(const b in src.sn||{}){dst.sn=dst.sn||{};const a=snList(dst,b),set=new Set(a);const add=snList(src,b).filter(h=>!set.has(h));dst.sn[b]=[...add,...a].slice(-SN_CAP).join(',');}
  for(const b in src.wr||{}){dst.wr=dst.wr||{};const w=dst.wr[b]||(dst.wr[b]={});for(const h in src.wr[b]){const x=src.wr[b][h],y=w[h];if(!y||x[1]>y[1]||(x[1]===y[1]&&x[0]>y[0]))w[h]=x;}}
  for(const b in src.bu||{}){dst.bu=dst.bu||{};const u=dst.bu[b]||(dst.bu[b]={});for(const d in src.bu[b])u[d]=Math.max(u[d]|0,src.bu[b][d]|0);}}

/* ---------- the stateless API: works on the bound state (the game binds save.lrn; Node tests get a private one) ---------- */
const BIND={};
/* items picked in this page but not answered yet (bank → key → ms): one quiz does not ask the same item twice; forgotten after 20 minutes */
const HELD={};const held=b=>{const m=HELD[b]||(HELD[b]=new Map());const t=nowFn();for(const [k,v] of m)if(t-v>12e5)m.delete(k);return m;};
const S=()=>BIND.state?BIND.state():(BIND._st=ensure(BIND._st));
const DRILL_IDS=['mm-ten','mm-dbl','mm-comp','mm-skip','mm-pv','wp','ch'];
const drillCands=st=>DRILL_IDS.map(sk=>({skill:sk,step:'ln-math',dom:'math',topic:sk==='wp'?'word':sk==='ch'?'chal':'mental',frontier:!(st.k[sk]||{}).n,name:PAR[sk]}));
const candsOf=dom=>BIND.cands?BIND.cands(dom):drillCands(S());
const core={blank,ensure,record,done,start,setLevel,setPrefs,pick,plan,merge,summary,applyPlacement,seen,pickItem,runwayOf};
return {core,
  /* "what next?" for a domain ('math', a group id, or nothing for anything) */
  next:(dom,o)=>pick(S(),o&&o.cands||candsOf(dom),o),
  /* the day path: step ids (the game adds at most one paper task a day) */
  plan:(dom,n,used)=>BIND.planSteps?BIND.planSteps(dom,n,used):plan(S(),candsOf(dom),n,{used}).map(x=>x.step),
  planDetail:(dom,n,o)=>plan(S(),candsOf(dom),n,o),
  record:(sk,correct,firstTry,ms)=>{const k=record(S(),sk,correct,firstTry,ms);BIND.after&&BIND.after();return k;},
  done:sk=>{const r=done(S(),sk);BIND.after&&BIND.after();return r;},
  start:(sk,lv)=>start(S(),sk,lv),
  setLevel:(sk,lv,lock)=>{const k=setLevel(S(),sk,lv,lock);BIND.onLevel&&BIND.onLevel(sk,k);BIND.after&&BIND.after();return k;},
  setPrefs:p=>{const r=setPrefs(S(),p);BIND.after&&BIND.after();return r;},
  summary:()=>summary(S(),BIND.names||(sk=>PAR[sk]||sk)),
  state:()=>S(),
  bind:o=>{Object.assign(BIND,o);},
  seen:(bank,key,ok,helped)=>{if(HELD[bank])HELD[bank].delete(key);const r=seen(S(),bank,key,ok,helped);BIND.after&&BIND.after();return r;},
  pickItem:(bank,items,o)=>{const hd=held(bank);const r=pickItem(S(),bank,items,Object.assign({},o,{held:new Set([...hd.keys(),...((o&&o.held)||[])])}));if(r)hd.set(r.item.k,nowFn());return r;},hash,
  merge,zone,eff,acc,isDue,placeStart,placeStep,placeDone,placeResult,
  MM,MM_IDS,DRILL_IDS,PW,WT,WT_BY_LV,wordQ,solve,CH,CH_BY_LV,chalQ,PM,PW,paperQ,gen,count,NOUN,NAMES_M,NAMES_F,lp,vav,MATH_LADDER,KID,PAR,IV,QUICK,maxLv,dayNum,
  setRandom:f=>{rnd=f||Math.random;},setNow:f=>{nowFn=f||(()=>Date.now());}};})();

/* ======================= part 2: the game ======================= */
(()=>{'use strict';const O=window.OREN,T=window.TAL,C=window.LEARN;if(!O||!T||!C)return;const {h,$}=O;const sfx=O.sfx,D=O.D;const K=C.core;
const ST=()=>{const s=O.save;s.lrn=K.ensure(s.lrn);return s.lrn;};
const plain=s=>T.plainHe(String(s||''));
const PAR=C.PAR,KID=C.KID,DRILLS=C.DRILL_IDS;
const DOMN={math:'חשבון',readg:'קריאה וכתיבה',explore:'חוקרים וחושבים',create:'יוצרים',calm:'נרגעים'};
const THK={'think-pat':'shp','think-ana':'ana','think-ser':'ser','think-rel':'rel','think-mat':'mat','think-sen':'sen','read-rc':'rc'};

/* ---------- what the rest of the game knows ---------- */
const offW=()=>(T.S().set.offW)||{};
function journeyNext(){for(const w of O.WORLDS){if(offW()[w.id])continue;for(const lv of w.levels){if(!O.stars(lv.id)&&!(O.known&&O.known(lv.id))&&O.unlocked(lv))return lv;}}return null;}
/* journey unit → the strategy drill that supports it (boosted while the unit is hard for him) */
const SUPPORT=[[/^add-(2|3|4|8|11|12)$/,'mm-ten'],[/^add-1$|^time-h2$/,'mm-dbl'],[/^(add|sub)-(8|9)$/,'mm-comp'],[/^num-seq|^mul-[0-3]$/,'mm-skip'],[/^(add-[5-7]|sub-[4-6]|num-pv2)$/,'mm-pv'],[/^word-/,'wp']];
const supportOf=id=>{for(const [re,sk] of SUPPORT)if(re.test(id))return sk;return null;};
function unitExt(u){const st=(O.save.st||{})[u.id];const lv=1+[0,1,2].filter(j=>O.stars(u.id+'-'+j)).length;const rq=(O.save.rq||[]).filter(x=>x&&x.u===u.id).length;
  return {n:st?st.a|0:0,acc:st&&st.a?st.o/st.a:null,lv,dueNow:rq>=2};}
function mathCands(){const out=[];const lv=journeyNext();const j=lv&&unitExt(lv.u);const st=ST();
  if(lv)out.push({skill:'u:'+lv.u.id,step:'math',dom:'math',topic:lv.w.id,frontier:true,ext:j,name:plain(lv.u.name)+' ('+plain(lv.w.name)+')'});
  const k=st.k['u:'+(lv&&lv.u.id)];const a=k&&k.n>=4?C.acc(k.h):j&&j.n>=4?j.acc:null;const hard=lv&&a!=null&&a<.6?supportOf(lv.u.id):null;
  const strong=Math.max(...DRILLS.map(sk=>(st.k[sk]||{}).l||1))>=3||(st.pl.math|0)>=12;
  DRILLS.forEach(sk=>{if(sk==='ch'&&!strong)return;if(sk==='mm-comp'&&((st.k['mm-ten']||{}).l|0)<2&&!(st.k['mm-comp']||{}).n&&(st.pl.math|0)<9)return;
    out.push({skill:sk,step:'ln-math',dom:'math',topic:sk==='wp'?'word':sk==='ch'?'chal':'mental',frontier:!(st.k[sk]||{}).n,boost:hard===sk?4:0,name:PAR[sk]});});
  return out;}
function actExt(id){const r=T.S().tl[id];const TH=window.THINK;let n=r?r.n|0:0,a=r&&r.n?[.4,.55,.75,.92][r.s|0]:null;
  const sk=THK[id];if(sk&&TH&&TH.skillStat){const x=TH.skillStat(O.save,sk);if(x.n>=4){n=x.n;a=x.acc;}}return {n,acc:a,lv:1};}
const grpOf=id=>T.GROUPS.find(g=>g.ids.includes(T.ACT[id].b.id));
function actCands(dom){return T.dailyPool().filter(id=>!/^ln-/.test(id)&&(!dom||(grpOf(id)||{}).id===dom))
  .map(id=>({skill:'a:'+id,step:id,dom:(grpOf(id)||{id:'other'}).id,topic:T.ACT[id].b.id,frontier:!((T.S().tl[id]||{}).n),ext:actExt(id),name:plain(T.ACT[id].b.name)+' — '+plain(T.ACT[id].name)}));}
function cands(dom){if(dom==='math')return mathCands();if(dom)return actCands(dom);return [...mathCands(),...actCands()];}
const nameOf=sk=>{if(PAR[sk])return PAR[sk];if(/^u:/.test(sk)){const u=O.ALLU.find(x=>x.id===sk.slice(2));return u?plain(u.name):sk;}if(/^a:/.test(sk)){const a=T.ACT[sk.slice(2)];return a?plain(a.name):sk;}return sk;};
const paperToday=()=>{const p=ST().pp;return !!(p&&p.d===C.dayNum());};
/* the day path: n step ids for a domain — 'math' (journey), 'ln-math', activity ids, and at most one 'ln-paper' a day (math / reading domains) */
function planSteps(dom,n,used){const u=new Set(used||[]);const steps=K.plan(ST(),cands(dom),n,{usedSteps:new Set([...u].filter(x=>x!=='math'))}).map(x=>x.step);
  if(dom==='math'&&journeyNext()&&!steps.includes('math'))steps[steps.length?steps.length-1:0]='math';
  if(n>=3&&!paperToday()&&(!dom||dom==='math'||dom==='readg')&&!u.has('ln-paper')&&T.ACT['ln-paper']&&!T.S().set.noPaper)steps.splice(1,steps.length>=n?1:0,'ln-paper');
  return steps.slice(0,n);}
C.bind({state:ST,cands,planSteps,names:nameOf,after:()=>{},onLevel:(sk,k)=>{const m=THK[sk.slice(2)];if(/^a:/.test(sk)&&m&&m!=='rc'&&O.save.th){O.save.th.lv=O.save.th.lv||{};O.save.th.lv[m]=k.l;}O.persist();}});
/* a city activity finished with st stars (call it from T.record; the tlDone event is the fallback) */
C.noteAct=(id,st)=>{if(!id||/^ln-/.test(id))return;const s=ST();const sk='a:'+id;const ok=Math.max(0,Math.min(3,st|0));K.start(s,sk,1);
  for(let j=0;j<3;j++)K.record(s,sk,j<ok,true,5000);K.done(s,sk);C._noted=id;};
C.names=nameOf;C.journeyNext=journeyNext;C.cands=cands;
/* what the parent sees: per domain the next things the engine plans, and what is due for review */
C.parentView=()=>{const st=ST(),t=C.dayNum();const doms=['math',...T.GROUPS.map(g=>g.id)].filter(d=>cands(d).length);const snap=JSON.stringify(st);
  const out=doms.map(d=>{const cs=cands(d);const p=K.plan(JSON.parse(snap),cs,4,{t}).map(x=>({skill:x.skill,name:x.name||nameOf(x.skill),lv:x.lv,why:x.why}));
    const due=cs.filter(c=>C.isDue(st.k[c.skill],t)||(c.ext&&c.ext.dueNow)).map(c=>c.name||nameOf(c.skill));return {dom:d,name:DOMN[d]||d,next:p,due};});
  const sm=C.summary();return {doms:out,strong:sm.strong.slice(0,4),weak:sm.weak.slice(0,4),prefs:JSON.parse(JSON.stringify(st.pf)),placed:Object.assign({},st.pl)};};

/* ---------- finite banks: registry, runway ----------
   LEARN.bank(id, {name (parent text), acts:[activity ids], items:()=>[{k, lv}], level:()=>his level (or null), upto, perWeek})
   Packs call LEARN.pickItem(bank, items, {lv}) to choose and LEARN.seen(bank, key, ok, helped) after each item. */
const BANKS={};
C.bank=(id,cfg)=>{BANKS[id]=Object.assign({id,acts:[],perWeek:0},cfg);return BANKS[id];};
const tryv=f=>{try{return f();}catch(e){return null;}};
/* the banks that exist in the game today (each only when its pack is loaded) */
function autoBanks(){const W=window;
  const TB=W.THINK_BANK,TH=W.THINK;if(TB){
    if(TB.RC&&!BANKS.rc)C.bank('rc',{name:'קטעי הבנת הנקרא',acts:['read-rc'],items:()=>TB.RC.map(x=>({k:x.p,lv:x.lv})),level:()=>TH&&O.save.th?TH.level(O.save.th,'rc'):1,perWeek:4});
    if(TB.SEN&&!BANKS['th-sen'])C.bank('th-sen',{name:'השלמת משפטים',acts:['think-sen'],items:()=>TB.SEN.map(x=>({k:JSON.stringify(x).slice(0,80)})),perWeek:6});
    if(TB.ANA&&!BANKS['th-ana'])C.bank('th-ana',{name:'אנלוגיות',acts:['think-ana'],items:()=>TB.ANA.map(x=>({k:JSON.stringify(x).slice(0,80)})),perWeek:6});
    if(TB.OPP&&!BANKS['th-rel'])C.bank('th-rel',{name:'קשרים בין מילים',acts:['think-rel'],items:()=>[...TB.OPP,...(TB.SYN||[]),...(TB.PART||[]),...(TB.ODD||[])].map(x=>({k:JSON.stringify(x).slice(0,80)})),perWeek:6});}
  const R=W.READBANK2;if(R&&R.words){const lv=sk=>tryv(()=>R.level(sk))||1;
    if(!BANKS['rb-word'])C.bank('rb-word',{name:'מילים לקריאה',acts:['read-first','read-pw','read-wp','read-build'],items:()=>R.words.map(x=>({k:x.w,lv:x.lv})),level:()=>lv('word'),perWeek:25});
    if(R.sentences&&!BANKS['rb-sent'])C.bank('rb-sent',{name:'משפטים',acts:['read-sent'],items:()=>R.sentences.map(x=>({k:x.t,lv:x.lv})),level:()=>lv('sent'),perWeek:10});
    if(R.stories&&!BANKS['rb-story'])C.bank('rb-story',{name:'סיפורים',acts:['story-new'],items:()=>R.stories.map(x=>({k:x.t,lv:x.lv})),level:()=>lv('story'),perWeek:3});}
  const G=W.GAPS;if(G&&Array.isArray(G.STORIES)&&!BANKS['gaps-story'])C.bank('gaps-story',{name:'סיפורי הספרייה',acts:G.STORIES.map((_,i)=>'story-'+i),items:()=>G.STORIES.map(x=>({k:x.t})),perWeek:2});
  const E=W.ENGLISH2;if(E&&Array.isArray(E.THEMES)&&!BANKS['eng-words'])C.bank('eng-words',{name:'מילים באנגלית',acts:['eng-voc'],items:()=>E.THEMES.flatMap(th=>(th.words||th.w||th.items||[]).map(w=>({k:Array.isArray(w)?w[0]:typeof w==='object'?(w.en||w.k||JSON.stringify(w)):w}))),perWeek:12});
  const X=W.EXPLORE2;if(X&&typeof X.kidTexts==='function'&&!BANKS['explore-facts'])C.bank('explore-facts',{name:'עובדות בחוקרים',acts:tryv(()=>X.ids())||[],items:()=>X.kidTexts().map(k=>({k})),perWeek:15});
  if(T.TOG&&!BANKS.together)C.bank('together',{name:'משחקים ביחד',acts:[],items:()=>T.TOG.map(a=>({k:a.k})),perWeek:2});
  if(T.RW&&!BANKS.realworld)C.bank('realworld',{name:'משימות בבית',acts:[],items:()=>Object.keys(T.RW).map(k=>({k})),perWeek:1});
  if(!BANKS['pp-write'])C.bank('pp-write',{name:'משימות כתיבה על דף',acts:['ln-paper'],items:()=>C.PW.map(x=>({k:x.k})),perWeek:2});}
C.banks=()=>{autoBanks();return BANKS;};
/* every bank: unseen items left at his level and the weeks they last; LEARN.runway() = only the ones running low (under ~2 weeks) */
C.runwayAll=()=>{autoBanks();return Object.values(BANKS).map(b=>{const items=tryv(b.items)||[];const lv=b.level?tryv(b.level):null;
  return Object.assign(K.runwayOf(ST(),b.id,items,{lv,upto:b.upto,perWeek:b.perWeek}),{name:b.name,lv,acts:b.acts});}).filter(r=>r.total>0);};
C.runway=()=>C.runwayAll().filter(r=>r.low&&r.used);
/* one line for the parent summary, only when relevant */
C.runwayLine=()=>{const r=C.runway().sort((a,b)=>a.weeks-b.weeks).slice(0,3);if(!r.length)return '';
  return '📦 כמעט נגמר תוכן: '+r.map(x=>`${x.name}${x.lv?' ברמה '+x.lv:''} (נשארו ${x.left})`).join(', ')+' — כדאי להוסיף';};
/* for the content map: "נשארו X חדשים" for an activity with a finite bank */
C.runwayOf=actId=>{const rs=C.runwayAll().filter(r=>r.acts.includes(actId));if(!rs.length)return '';return `נשארו ${rs.reduce((a,r)=>a+r.left,0)} חדשים`;};

/* ---------- the screen pieces ---------- */
const hundred=(chart,show)=>{let s='<div class="lnhc" dir="ltr">';for(let i=1;i<=100;i++){const cls=i===chart.start?' st':show&&chart.path.includes(i)?(i===chart.path[chart.path.length-1]?' en':' pt'):'';s+=`<span class="${cls.trim()}">${i}</span>`;}return s+'</div>';};
/* one question card: one instruction line, multiple choice; the strategy (q.tip) only behind the help button (#216); a short explanation after a mistake */
function askQ(wrap,q,i,n,title,onAns){T.hudT(title,T.progressBar(i,n));wrap.innerHTML='';const t0=Date.now();
  const card=h('div','prq tqc lnq',`${q.html||''}${q.chart?hundred(q.chart,false):''}${q.text?`<div class="qq">${q.text}</div>`:''}`);wrap.appendChild(card);if(T.rdQ&&q.text)T.rdQ(q,card);
  O.sayNow=plain((q.text?'':(q.html||'')).replace(/<span class="lnbox"><\/span>/g,' מה ')+' '+(q.text||''));
  const row=h('div','chs ltr');let tries=0,lock=false;
  q.opts.forEach((v,k)=>{const b=h('button','chb num',String(v));b.onclick=()=>pickA(k,b);row.appendChild(b);});wrap.appendChild(row);
  const exb=h('div','hintbox');exb.hidden=true;wrap.appendChild(exb);card.classList.add('flashin');
  /* only: the help box already shows the answer with the explanation, so the explanation box holds just 'continue' */
  const showEx=(only)=>{if(q.chart){const c=card.querySelector('.lnhc');if(c)c.outerHTML=hundred(q.chart,true);}exb.hidden=false;exb.innerHTML=only||!q.ex?'':`<div class="cap">${q.ex}</div>`;
    const nb=h('button','bigbtn',O.ICON.play+'<span>הַמְשֵׁךְ</span>');nb.onclick=()=>{sfx.pop(1);onAns(null);};exb.appendChild(nb);setTimeout(()=>nb.focus(),50);T.setKey(e=>{if(e.key==='Enter'||e.key===' ')nb.click();});};
  /* #54 one help button: the strategy tip as the clue, then the answer with its explanation (the question ends like after two mistakes) */
  const HB=window.HELP&&HELP.mc?HELP.mc(wrap,{row,ans:q.ans,clue:q.tip,explain:q.ex||(q.tip?'💡 '+q.tip:''),before:exb,
    reveal:()=>{if(lock)return;lock=true;if(tries===0)onAns({ok:false,first:true,ms:Date.now()-t0},true);tries++;showEx(true);}}):null;
  function pickA(k,b){if(lock||b.disabled)return;const ms=Date.now()-t0;
    if(k===q.ans){lock=true;if(tries===0)onAns({ok:true,first:true,ms},true);b.classList.add('ok');sfx.ok(i);const g=tries||(HB&&HB.step)?1:2;O.addGems(g,b);O.floatText(b,'+'+g);
      if(tries){showEx();}else{if(q.chart){const c=card.querySelector('.lnhc');if(c)c.outerHTML=hundred(q.chart,true);}setTimeout(()=>onAns(null),D(q.chart?1500:900));}return;}
    if(tries===0)onAns({ok:false,first:true,ms},true);tries++;b.classList.add('bad');b.disabled=true;sfx.no();
    if(tries>=2){lock=true;row.children[q.ans].classList.add('show');if(HB&&HB.el.isConnected){HB.answer();showEx(true);}else showEx();}}
  T.setKey(e=>{if(/^[1-9]$/.test(e.key)){const b=row.children[+e.key-1];if(b)b.click();}});
  window.__learn={q,get ans(){return q.ans;},wrap,i};}

/* ---------- math training: the engine picks 1–3 skills, interleaved ---------- */
/* what Oren knows (#57): every strategy is a ladder of levels ('mm-ten@2'). 3 right in a row → the next level; 2 wrong in a row → one level down.
   No placement test in the game: the parent answers 3 questions; the game learns from his answers anyway. */
const KN=window.KNOW;
const kid=(sk,lv)=>sk+'@'+lv;
if(KN)KN.area('math',{name:'חשבון',skills:DRILLS.flatMap(sk=>Array.from({length:C.maxLv(sk)},(_,j)=>({id:kid(sk,j+1),track:sk,sk,lv:j+1}))),
  asks:[['math-10','מחבר ומחסר עד 10',1],['math-20','מחבר ומחסר עד 20 (גם מעבר עשרת)',2],['math-100','מחבר ומחסר עד 100',3]].map(([id,q,lv])=>({id,q,skills:DRILLS.filter(sk=>C.maxLv(sk)>=lv).map(sk=>kid(sk,lv))})),
  on:evs=>{const st=ST();evs.forEach(x=>{const s=KN.skillOf(x.skill),k=st.k[s.sk]||{l:1},mx=C.maxLv(s.sk),l=k.l||1;if(k.lk)return;let nl=l;
    if(x.e==='known')nl=Math.max(l,Math.min(mx,s.lv+1));else if(x.e==='back')nl=Math.min(l,s.lv-1);
    else if(x.e==='place'){nl=x.yes?Math.max(l,Math.min(mx,s.lv+1)):Math.min(l,s.lv);if(x.yes)st.pl.math=Math.max(st.pl.math|0,6*s.lv);}
    if(nl!==l)C.setLevel(s.sk,Math.max(1,nl));});O.persist();}});
function mathRound(back){const st=ST();
  const dc=mathCands().filter(c=>c.step==='ln-math');const t=C.dayNum();
  const due=dc.filter(c=>C.isDue(st.k[c.skill],t));let parts,title;
  if(due.length>=2){parts=due.slice(0,3).map(c=>({sk:c.skill,lv:(st.k[c.skill]||{}).l||1}));title=KID.mix;}
  else{const a=K.pick(st,dc,{t});const b=K.pick(st,dc,{t,exclude:new Set([a.skill]),review:due.length?true:undefined});parts=[{sk:a.skill,lv:a.lv}];if(b)parts.push({sk:b.skill,lv:b.lv});title=KID[a.skill];}
  parts.forEach(p=>{p.lv=K.start(st,p.sk,p.lv);});
  const N=T.pathN(6);/* #394 short on the daily path */const order=parts.length===1?Array(N).fill(0):parts.length===2?[0,0,1,0,1,0]:[0,1,2,0,1,2];
  /* about 1 question in 10: a quick review one level easier (a level he already passed) */
  const qs=[],seen=new Set();for(let i=0;i<N;i++){const p=parts[order[i]];const lv=p.lv>1&&KN&&Math.random()<KN.core.REVIEW?p.lv-1:p.lv;let q;for(let k=0;k<30;k++){q=C.gen(p.sk,lv);if(!seen.has(q.key))break;}seen.add(q.key);q.klv=lv;qs.push(q);}
  /* the lesson of each strategy in the round, the first time (#258) */
  const LS=window.LESSONS,lids=[...new Set(parts.map(p=>MLS[p.sk]).filter(Boolean))];
  let i=0,err=0,s,wrap;
  const start=()=>{i=0;err=0;O.setScreen('sTal','mount',back);s=$('#sTal');s.innerHTML='';wrap=h('div','tq lnr');s.appendChild(wrap);if(LS&&lids.length)s.appendChild(LS.againBtn(lids,back,start));if(KN)KN.begin('math',()=>wrap.isConnected&&!s.hidden);go();};
  const ttl=()=>`${parts.length>2?title:KID[qs[i].sk]} · שָׁלָב ${qs[i].lv}`;
  const go=()=>askQ(wrap,qs[i],i,N,ttl(),(r)=>{if(r){C.record(qs[i].sk,r.ok,r.first,r.ms);if(KN)KN.hit(kid(qs[i].sk,qs[i].klv),r.ok);if(!r.ok)err++;O.persist();return;}i++;if(i<N)go();else end();});
  function end(){T.setKey(null);let msg='';parts.forEach(p=>{const r=C.done(p.sk);if(r&&r.up>=2)msg='🚀 קָפַצְתָּ שְׁנֵי שְׁלַבִּים!';else if(r&&r.up===1&&!msg)msg='🎉 עָלִיתָ שָׁלָב!';});if(KN)KN.end('math');
    T.finishAct('ln-math',err,N,0,back,()=>mathRound(back),msg||undefined);}
  if(LS&&lids.length)return LS.first(lids,back,start);start();}
/* lesson cards (lessoncard.js, #258): each mental-math strategy is taught once, with an example, before its first question */
const MLS={'mm-ten':'math-ten','mm-dbl':'math-dbl','mm-comp':'math-comp','mm-skip':'math-skip','mm-pv':'math-pv'};
if(window.LESSONS){const LS=window.LESSONS,LT=t=>`<span class="ltr">${t}</span>`,EX=(...ls)=>`<div class="lcpic lnx">${ls.map(LT).join('<br>')}</div>`;
  LS.add('math-ten',{title:KID['mm-ten'],bg:'mount',cards:[
    {art:()=>EX('8 + 5 = ?'),t:'כְּדֵי לְחַבֵּר 8 וְעוֹד 5, קֹדֶם מַשְׁלִימִים לְ-10: 8 וְעוֹד 2 זֶה 10.'},
    {art:()=>EX('8 + 2 = 10','10 + 3 = 13'),t:'מִתּוֹךְ הַ-5 נִשְׁאַר עוֹד 3. 10 וְעוֹד 3 זֶה 13.'}]});
  LS.add('math-dbl',{title:KID['mm-dbl'],bg:'mount',cards:[
    {art:()=>EX('6 + 6 = 12'),t:'כָּפוּל זֶה מִסְפָּר וְעוֹד אוֹתוֹ מִסְפָּר: 6 וְעוֹד 6 זֶה 12.'},
    {art:()=>EX('6 + 7 = ?','6 + 6 + 1 = 13'),t:'6 וְעוֹד 7 זֶה כִּמְעַט כָּפוּל: כְּמוֹ 6 וְעוֹד 6, וְעוֹד 1. זֶה 13.'}]});
  LS.add('math-comp',{title:KID['mm-comp'],bg:'mount',cards:[
    {art:()=>EX('24 + 9 = ?','24 + 10 = 34','34 − 1 = 33'),t:'9 קָרוֹב מְאוֹד לְ-10. כְּדֵי לְחַבֵּר 24 וְעוֹד 9, מְחַבְּרִים 10 וּמוֹרִידִים 1: 34 פָּחוֹת 1 זֶה 33.'}]});
  LS.add('math-skip',{title:KID['mm-skip'],bg:'mount',cards:[
    {art:()=>EX('2, 4, 6, 8, ?'),t:'בִּסְפִירָה בְּדִלּוּגִים קוֹפְצִים כָּל פַּעַם אוֹתוֹ מִסְפָּר. כָּאן קוֹפְצִים בְּ-2, אָז אַחֲרֵי 8 בָּא 10.'}]});
  LS.add('math-pv',{title:KID['mm-pv'],bg:'mount',cards:[
    {art:()=>`<div class="lcpic lcpv">${hundred({start:23,path:[23,33,34]},true)}</div>`,t:'בְּלוּחַ הַמֵּאָה: עוֹד 10 זֶה שׁוּרָה אַחַת לְמַטָּה, וְעוֹד 1 זֶה מִשְׁבֶּצֶת אַחַת קָדִימָה.'}]});}

/* ---------- paper & pencil ---------- */
function paper(back){const st=ST();const last=st.pp&&st.pp.k;const kind=last==='math'?'write':'math';const sk=kind==='math'?'pp-math':'pp-write';
  const lv=kind==='math'?Math.max(1,Math.min(5,Math.round(['mm-ten','mm-comp','mm-pv'].reduce((a,x)=>a+((st.k[x]||{}).l||1),0)/3))):1;
  const wi=kind==='write'?K.pickItem(st,'pp-write',C.PW):null;const q=C.paperQ(kind,lv,wi&&wi.item);K.start(st,sk,lv);const t0=Date.now();
  O.setScreen('sTal','meadow',back);T.hudT('✏️ דַּף וְעִפָּרוֹן');const s=$('#sTal');s.innerHTML='';
  const box=h('div','tspec lnpaper',`<div class="tse bob">📝</div><h1>קַח דַּף וְעִפָּרוֹן</h1><div class="lsent">${q.task}${q.big?`<div class="lnbig${kind==='math'?' lnnum':''}">${q.big}</div>`:''}</div>`);s.appendChild(box);
  O.sayNow=plain(q.task+' '+(q.big||''));setTimeout(()=>{if(box.isConnected)O.say(O.sayNow);},D(400));
  const finish=(ok,tries)=>{st.pp={d:C.dayNum(),k:kind};if(q.self)K.seen(st,'pp-write',q.k,true);C.record(sk,ok,tries===0,Date.now()-t0);C.done(sk);O.persist();const stars=ok?(tries?2:3):1;O.addGems(3+stars*2);T.record('ln-paper',stars);};
  const row=h('div','btnrow');box.appendChild(row);
  if(q.self){/* writing: a short self-check, then show a parent */
    const b=h('button','bigbtn huge','<span>כָּתַבְתִּי ✓</span>');b.onclick=()=>{sfx.pop(2);row.remove();
      const chk=h('div','lnchk',`<div class="cap">בְּדֹק אֶת הַדַּף:</div>${q.check.map(c=>`<label><input type="checkbox"> ${c}</label>`).join('')}${q.eg?`<div class="lneg">לְמָשָׁל: ${q.eg}</div>`:''}`);box.appendChild(chk);
      const r2=h('div','btnrow');const d=h('button','bigbtn','<span>בָּדַקְתִּי ✓</span>');d.onclick=()=>{finish(true,0);T.result({title:'כָּל הַכָּבוֹד!',sub:'הַרְאֵה אֶת הַדַּף לְאַבָּא אוֹ לְאִמָּא!',stars:3,gems:9,back});};r2.appendChild(d);box.appendChild(r2);};
    row.appendChild(b);return;}
  /* math: solve on paper, then type the answer */
  const b=h('button','bigbtn huge','<span>פָּתַרְתִּי עַל הַדַּף ✓</span>');b.onclick=()=>{sfx.pop(2);row.remove();pad();};row.appendChild(b);
  let tries=0;
  function pad(){const p=h('div','lnpad');let val='';const disp=h('div','lndisp','?');const cap=h('div','cap','מָה יָצָא לְךָ?');p.append(cap,disp);
    const keys=h('div','lnkeys');const put=v=>{if(v==='⌫')val=val.slice(0,-1);else if(val.length<4)val+=v;disp.textContent=val||'?';};
    ['1','2','3','4','5','6','7','8','9','⌫','0','✓'].forEach(k=>{const kb=h('button','lnk'+(k==='✓'?' go':''),k);kb.onclick=()=>{sfx.pop(1);if(k==='✓')check();else put(k);};keys.appendChild(kb);});p.appendChild(keys);box.appendChild(p);
    T.setKey(e=>{if(/^[0-9]$/.test(e.key))put(e.key);else if(e.key==='Backspace')put('⌫');else if(e.key==='Enter')check();});
    window.__learn={q,get ans(){return q.v;},type:v=>{val=String(v);disp.textContent=val;check();}};
    function check(){if(!val)return;const ok=+val===q.v;
      if(ok||tries>=1){T.setKey(null);p.remove();const sol=h('div','hintbox lnsol',`<div class="cap">${ok?'נָכוֹן! 🎉':'הַתְּשׁוּבָה הִיא '+`<b class="ltr">${q.v}</b>`}<div>כָּךְ פּוֹתְרִים:</div>${q.sol}</div>`);box.appendChild(sol);
        if(ok){sfx.ok(2);O.floatText(disp,'+'+(tries?1:2));}else sfx.no();finish(ok,tries);
        const r3=h('div','btnrow');const c=h('button','bigbtn',O.ICON.play+'<span>הַמְשֵׁךְ</span>');c.onclick=()=>{sfx.pop(1);back();};r3.appendChild(c);box.appendChild(r3);setTimeout(()=>c.focus(),100);return;}
      tries++;sfx.no();val='';disp.textContent='?';cap.textContent='כִּמְעַט! בְּדֹק שׁוּב עַל הַדַּף, וְנַסֵּה שׁוּב.';}}}

/* ---------- parent: the path block (day tab) and the per-skill controls (progress tab) ---------- */
const WHY={learn:'בתרגול',new:'חדש',review:'חזרה',stretch:'מתקדם',easier:'רמה קלה יותר'};
C.parentPanel=(box,sec,rerender)=>{const v=C.parentView();const st=ST();
  const lines=v.doms.map(d=>{const [a,b]=d.next;if(!a)return '';return `<div class="lnp-row"><b>${d.name}:</b> ${a.name}${a.lv>1||a.skill[0]!=='a'?`, רמה ${a.lv}`:''} <small>(${WHY[a.why]||''})</small>${b?` → אחריו: ${b.name}`:''}</div>`;}).join('');
  const due=[...new Set(v.doms.flatMap(d=>d.due))];
  const rl=C.runwayLine();
  const el=sec(box,'המסלול של אורן — הבא בתור',`${rl?`<div class="lnp-row lnp-run">${rl}</div>`:''}${lines}${due.length?`<div class="lnp-row"><b>לחזרה:</b> ${due.slice(0,5).join(', ')}</div>`:''}`);
  const fr=h('div','lnp-ctl','<span class="lnp-l">מיקוד (עד 2):</span>');const opts=[...v.doms.map(d=>[d.dom,d.name]),...['wp','ch'].map(k=>[k,PAR[k]])];
  opts.forEach(([id,nm])=>{const on=st.pf.focus.includes(id);const b=h('button','pchip'+(on?' on':''),nm);b.onclick=()=>{let f=st.pf.focus.filter(x=>x!==id);if(!on)f=[...f,id].slice(-2);C.setPrefs({focus:f});rerender&&rerender();};fr.appendChild(b);});el.appendChild(fr);
  const pr=h('div','lnp-ctl','<span class="lnp-l">קצב:</span>');[['רגוע',0],['רגיל',1],['מהיר',2]].forEach(([nm,p])=>{const b=h('button','pchip'+((st.pf.pace|0)===p?' on':''),nm);b.onclick=()=>{C.setPrefs({pace:p});rerender&&rerender();};pr.appendChild(b);});el.appendChild(pr);
  el.appendChild(h('div','pnote','שינויים ידניים במסלול של היום (סדר, הוספה, הסרה) תמיד קודמים להמלצות.'));return el;};
const ZN={mastered:'שולט',learning:'בתרגול',hard:'קשה לו',new:'עוד לא תרגל'};
C.skillsPanel=(box,sec,rerender)=>{const st=ST(),t=C.dayNum();const ids=[...DRILLS,...Object.keys(st.k).filter(k=>/^a:/.test(k)&&st.k[k].n>=3)];
  const el=sec(box,'רמות לפי מיומנות',`<div class="pnote">המשחק מתאים רמה לבד. אפשר לקדם, להחזיר או לנעול רמה.</div>`);
  ids.forEach(sk=>{const k=st.k[sk]||{l:1,n:0};const mx=C.maxLv(sk);const r=h('div','prow lnp-sk',`<span class="pn">${nameOf(sk)} <small>${ZN[C.zone(st.k[sk],t)]}${k.n>=3?` · ${Math.round((C.acc(k.h)||0)*100)}%`:''}</small></span><span class="pc">רמה ${k.l||1}/${mx}${k.lk?' 🔒':''}</span>`);
    const bt=h('span','lnp-bt');const mk=(lbl,fn,dis)=>{const b=h('button','pchip',lbl);b.disabled=!!dis;b.onclick=()=>{fn();rerender&&rerender();};bt.appendChild(b);};
    mk('קדם רמה',()=>C.setLevel(sk,(k.l||1)+1),(k.l||1)>=mx);mk('החזר רמה',()=>C.setLevel(sk,(k.l||1)-1),(k.l||1)<=1);mk(k.lk?'שחרר':'נעל',()=>C.setLevel(sk,null,!k.lk));r.appendChild(bt);el.appendChild(r);});return el;};

/* ---------- activities ---------- */
C.run=(id,back)=>{if(id==='ln-math')return mathRound(back);if(id==='ln-paper')return paper(back);const a=T.ACT[id];if(a)a.run(back);};
const addAct=(bid,a)=>{const b=T.BUILD.find(x=>x.id===bid);if(!b)return;const old=T.ACT[a.id];if(old){Object.assign(old,a);return;}a.b=b;b.acts.push(a);T.ACT[a.id]=a;};
C.register=()=>{addAct('think',{id:'ln-math',name:'אִמּוּן חֶשְׁבּוֹן',icon:()=>'<span style="font-size:34px">🧮</span>',run:mathRound});
  addAct('think',{id:'ln-paper',name:'דַּף וְעִפָּרוֹן',icon:()=>'<span style="font-size:34px">📝</span>',avail:()=>!paperToday(),run:paper});
  if(!C._on){C._on=1;O.on('tlDone',id=>{if(!id||/^ln-/.test(id))return;if(C._noted===id){C._noted=null;return;}const s=ST(),k=s.k['a:'+id];
    if(!k||!k.n)C.noteAct(id,(T.S().tl[id]||{}).s|0);else{k.d=C.dayNum();s.rc=['a:'+id,...s.rc.filter(x=>x!=='a:'+id)].slice(0,6);}C._noted=null;});}};
/* parent names of the activities (read by the content map, like every pack's SKILLS) */
C.SKILLS={'ln-math':'אימון חשבון: השלמה ל-10, כפולים, עיגול ותיקון, דילוגים, לוח המאה, בעיות מילוליות ואתגרים — המשחק בוחר רמה ונושא','ln-paper':'דף ועיפרון: פעם ביום משימה על דף (חשבון או כתיבה) ובדיקה'};
C.levelOf=id=>{if(id==='ln-math'){const st=ST();const ls=DRILLS.map(sk=>(st.k[sk]||{}).l||1);return 'רמה ממוצעת '+(ls.reduce((a,b)=>a+b,0)/ls.length).toFixed(1)+'/5';}return tryv(()=>C.runwayOf(id))||'';};
C.register();
})();
