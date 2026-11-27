/* ===== READING: "קוֹדֶם אַתָּה, אַחַר כָּךְ אֲנִי" =====
   Every text Oren should read gets a small 🔊 (not story lines: a tap on a line reads it, one 🔊 reads the story, G4). Pressing it reads the text and lights up each word as it is said.
   On quiz questions the game first lets him try; at level 1/2 it reads by itself after a pause.
   Levels go up by themselves when he answers correctly without hearing the question first ("solo"). */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$}=O;const D=O.D;
const HEB=/[א-ת]/;
const RD=()=>{const s=T.S();s.rd=s.rd||{lvl:1,solo:0};return s.rd;};
/* #613 the parent's one "reading help" setting (O.readHelp, the core): it decides here, in the stories (talents.js) and in the voice */
const RH=()=>O.readHelp?O.readHelp():{m:'try',w:25,slow:false,ans:true,hi:true,auto:true};
const level=()=>(RD().lvl|0)||1;
const UP={1:25,2:85};                         /* solo answers needed to move up from level 1 / level 2 */
const TARGETS='#sTal .tqc .qq:not(.tqi),#sTal .tqc .sent,#sTal .lsent:not(.blab),#sHome .hbub2';

/* ---- words: wrap each word once, keep the element's own markup ---- */
function words(el){if(el._rw&&el._rw.length&&el._rw.every(w=>w.isConnected))return el._rw;const out=[];
  const skip=n=>{const p=n.parentElement;if(!p||p.closest('.rdb,.rdcue,.tleft,svg'))return true;const b=p.closest('button');return !!(b&&el.contains(b));};/* a button inside the text (🔊); a text inside a button (the math bubble) is fine */
  const tw=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode:n=>skip(n)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  const nodes=[];while(tw.nextNode())nodes.push(tw.currentNode);
  for(const n of nodes){if(!n.nodeValue.trim())continue;const f=document.createDocumentFragment();
    for(const p of n.nodeValue.split(/(\s+)/)){if(!p)continue;if(/^\s+$/.test(p)){f.appendChild(document.createTextNode(p));continue;}const sp=document.createElement('span');sp.className='rw';sp.textContent=p;f.appendChild(sp);out.push(sp);}
    n.parentNode.replaceChild(f,n);}
  el._rw=out;return out;}

/* ---- speaking with lit-up words ---- */
let cur=null;
function stop(){if(!cur)return;const r=cur;cur=null;r.timers.forEach(clearTimeout);r.words.forEach(w=>w.classList.remove('on'));r.el.classList.remove('reading');r.resolve();}
const light=(r,k)=>{const hi=RH().hi;r.words.forEach((w,j)=>w.classList.toggle('on',hi&&j===k));};   /* #613 the parent may turn the word light off */
const rate=()=>RH().slow?.72:.9;               /* the game voice speaks at 0.9 (slow: the same recording at 0.8 of that) */
const wms=w=>(170+70*(String(w).match(/[א-תA-Za-z0-9]/g)||[]).length)/rate();   /* how long a word takes to say */
/* light r.words one after the other from word `from`: each word wms(word) * scale after the one before, starting at t0; then end() */
function plan(r,from,live,end,t0,scale){r.timers.forEach(clearTimeout);r.timers=[];let t=t0||0;scale=scale||1;
  for(let k=from;k<r.words.length;k++){r.timers.push(setTimeout(()=>{if(live())light(r,k);},t));t+=wms(r.words[k].textContent)*scale;}
  r.timers.push(setTimeout(()=>{if(live())end();},t+250));}
function estimate(r,from){plan(r,from,()=>cur===r,stop);}
/* watch the browser voice of OUR reading for word boundaries (the voice engine itself is untouched) */
function attach(u,r){const starts=[];String(u.text||'').replace(/\S+/g,(m,o)=>{starts.push(o);return m;});const n=r.words.length;
  const idx=ci=>{let k=0;for(let j=0;j<starts.length;j++){if(starts[j]<=ci)k=j;else break;}return starts.length===n?k:Math.min(n-1,Math.round(k*n/Math.max(1,starts.length)));};
  u.addEventListener('start',()=>{if(cur!==r)return;r.started=true;r.timers.forEach(clearTimeout);r.timers=[];r.timers.push(setTimeout(()=>{if(cur===r&&!r.gotB)estimate(r,0);},600));});
  u.addEventListener('boundary',e=>{if(cur!==r||(e.name&&e.name!=='word'))return;r.gotB=true;r.timers.forEach(clearTimeout);r.timers=[];light(r,idx(e.charIndex|0));});
  const end=()=>{if(cur===r)stop();};u.addEventListener('end',end);u.addEventListener('error',end);}
(()=>{try{const ss=window.speechSynthesis;if(!ss)return;const orig=ss.speak.bind(ss);ss.speak=u=>{if(cur&&!cur.u&&u&&u.lang!=='en-US'){cur.u=u;attach(u,cur);}return orig(u);};}catch(e){}})();
function readEl(el){stop();folStop();const ws=words(el);if(!ws.length)return Promise.resolve();heard(el);
  const cue=el.parentNode&&el.parentNode.querySelector('.rdcue');if(cue)cue.remove();
  return new Promise(res=>{const r={el,words:ws,timers:[],resolve:res};cur=r;el.classList.add('reading');
    O.say(ws.map(w=>w.textContent).join(' '));
    r.timers.push(setTimeout(()=>{if(cur===r&&!r.started&&!r.gotB)estimate(r,0);},700));});}
let seqTok=0;
async function readSeq(els,mark){const tok=++seqTok;for(let i=0;i<els.length;i++){if(tok!==seqTok||!els[i].isConnected)return;if(mark)mark(i);await readEl(els[i]);if(tok!==seqTok)return;}}
/* ---- #421 the instruction lights up while the voice reads it (the same word light, no button) ----
   At each clip of the game voice (the core's 'vpart', with its audio) the instruction on the screen that the clip says is found;
   its words light one by one over the clip's length, timed like the stories (wms per word). The clip may also hold a story line or
   the goal before it: their words come first. Timing unknown (no clip length, or the words do not match one to one): the whole line
   is lit while the clip plays. The light goes out at the clip's end, the next clip, hush() and a new screen. */
const FOLLOW='.qq:not(.tqi),.sent,.lsent,.hbub2,#bText,.wcard,.e2q';
const fs=s=>{try{return window.__fullSpell?window.__fullSpell(String(s).replace(/\d/g,d=>String.fromCharCode(0xE000+ +d))).replace(/[\uE000-\uE009]/g,c=>c.charCodeAt(0)-0xE000):String(s);}catch(e){return String(s);}};/* compare as the voice says it (full spelling, #405) */
const nw=s=>fs(String(s).replace(/🔊/g,' ')).replace(/[\u0591-\u05C7]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(' ').filter(Boolean);
const at=(a,b)=>{if(!b.length||b.length>a.length)return -1;for(let i=0;i+b.length<=a.length;i++)if(b.every((x,j)=>a[i+j]===x))return i;return -1;};
let fol=null;
function folStop(){if(!fol)return;const r=fol;fol=null;r.timers.forEach(clearTimeout);r.words.forEach(w=>w.classList.remove('on'));}
const shown=e=>!!e.offsetParent&&!e.closest('[hidden]');
function follow(t,a){folStop();if(cur||!t||!RH().hi)return;const cw=nw(t);if(!cw.length)return;
  for(const el of document.querySelectorAll('#screens '+FOLLOW.split(',').join(',#screens '))){if(!shown(el))continue;
    const ew=nw(el.textContent);if(!ew.length)continue;let i=at(cw,ew),from=0,to=ew.length;
    if(i<0){const j=at(ew,cw);if(j<0)continue;i=0;from=j;to=j+cw.length;}           /* the clip is a part of the line */
    const ws=words(el).filter(w=>nw(w.textContent).length),one=ws.length===ew.length&&ws.every(w=>nw(w.textContent).length===1),dur=a&&isFinite(a.duration)&&a.duration>0?a.duration*1000:0;
    const r={el,words:one?ws.slice(from,to):ws,timers:[]};fol=r;const live=()=>fol===r;
    if(!one||!dur){r.words.forEach(w=>w.classList.add('on'));if(dur)r.timers.push(setTimeout(()=>{if(live())folStop();},dur+250));return;}
    const all=cw.reduce((s,w)=>s+wms(w),0),sc=dur/all,t0=cw.slice(0,i).reduce((s,w)=>s+wms(w),0)*sc;
    plan(r,0,live,folStop,t0,sc);return;}}
O.on('vpart',(t,a)=>follow(t,a));O.on('voice',on=>{if(!on)folStop();});
T.readFollow=follow;
T.rdWords=words;T.readEl=el=>{seqTok++;return readEl(el);};T.readSeq=readSeq;T.readStop=()=>{seqTok++;stop();};

/* ---- the 🔊 button on every readable text ---- */
function decorate(el){if(el.dataset.rd||!HEB.test(el.textContent))return;el.dataset.rd='1';
  const b=h('button','rdb','🔊');b.type='button';b.setAttribute('aria-label','הקראה');b.onclick=e=>{e.stopPropagation();O.sfx.pop(1);T.readEl(el);};el.prepend(b);}
const decorateAll=()=>document.querySelectorAll(TARGETS).forEach(decorate);
let raf=0;const mo=new MutationObserver(()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;decorateAll();});});
['#sTal','#sHome'].forEach(id=>{const e=$(id);if(e)mo.observe(e,{childList:true,subtree:true});});

/* ---- quiz questions: try first, then the game reads ---- */
let Q=null;
function heard(el){if(Q&&Q.card&&Q.card.contains(el))Q.heard=true;}
function clearQ(){if(Q){Q.timers.forEach(clearTimeout);Q.timers=[];}}
/* only in reading activities, and only the text to read waits (a sentence / a word); the instruction (.qq) is said right away.
   #613 by the parent's setting: read to him = the text is read with the question at once (no wait, no cue); tries first = the levels below;
   reads alone = the text's 🔊 shows only after a wrong answer, never read by itself */
T.rdQ=(q,card,o)=>{clearQ();decorateAll();const target=o&&o.read&&!q.play?card.querySelector('.sent')||card.querySelector('.bigw'):null;
  Q={q,card,heard:false,answered:false,timers:[],target};if(!Q.target)return;const m=RH().m;
  if(m==='read'){const t=T.spk(target.textContent.replace(/🔊/g,' '));if(t&&!T.plainHe(O.sayNow||'').includes(T.plainHe(t)))O.sayNow=t+' '+(O.sayNow||'');return;}
  const tt=T.plainHe(target.textContent.replace(/🔊/g,'')).replace(/\s+/g,' ').trim();if(tt&&O.sayNow){const ns=T.plainHe(O.sayNow).replace(/\s+/g,' ').split(tt).join(' ').trim();O.sayNow=/[א-ת]/.test(ns)?ns:'';}
  if(m==='alone'){Q.target.classList.add('rdhide');return;}
  const lv=level(),btn=Q.target.querySelector('.rdb');if(lv===3)return;
  if(lv===2&&btn)btn.classList.add('pulse');
  Q.target.after(h('div','rdcue','נַסֵּה לִקְרֹא 👀'));
  const me=Q,wrap=card.parentNode;if(wrap&&!wrap._rdL){wrap._rdL=1;wrap.addEventListener('click',e=>{if(Q&&e.target.closest('.chb'))Q.answered=true;},true);}
  me.timers.push(setTimeout(()=>{if(Q===me&&!me.answered&&!me.heard&&me.target.isConnected)T.readEl(me.target).then(()=>{/* then the answers that are words */
    if(Q!==me||me.answered||!wrap)return;const os=[...wrap.querySelectorAll('.chs .chb')].filter(b=>!b.disabled).map(b=>b.textContent.trim()).filter(t=>HEB.test(t));if(os.length)O.say(os.join(', '));});},D(lv===1?3000:8000)));};
T.rdA=(q,tries,b)=>{if(!Q||Q.q!==q||!Q.target)return;clearQ();if(tries||Q.heard||RH().m==='read')return;/* read to him: never "read alone" */
  const r=RD();r.solo=(r.solo|0)+1;
  if(UP[r.lvl]&&r.solo>=UP[r.lvl]){r.lvl++;O.floatText(Q.card,'🎉 עָלִיתָ שָׁלָב בִּקְרִיאָה!');}
  else if(r.solo%4===1)O.floatText(Q.card,'קָרָאתָ לְבַד! ⭐');
  O.persist();};
O.on('screen',()=>{clearQ();Q=null;seqTok++;stop();folStop();});
O.on('tq',(id,right)=>{if(!right&&Q&&Q.target)Q.target.classList.remove('rdhide');});   /* reads alone: a wrong answer brings the 🔊 */

/* ---- parent: one setting "עזרה בקריאה" (#613): the main choice in one row, the rest folded under "עוד"; defaults = the game as it was ---- */
let moreOpen=false;
T.rdSettings=(body,sec,refresh)=>{const st=T.S().set,r=RD(),cur=RH();
  const box=sec(body,'📖 עזרה בקריאה','<div class="pnote">כמה עזרה בהקראה אורן מקבל בסיפורים ובמשפטים לקריאה. הוראות ושאלות שאינן בודקות קריאה תמיד מוקראות.</div>');
  const put=(k,v)=>{const rh=st.rh&&typeof st.rh==='object'?st.rh:(st.rh={});rh[k]=v;O.persist();refresh();};
  const row=(par,lbl,opts,val,set)=>{const w=h('div','popt'+(lbl?'':' rhmain'),lbl?`<span>${lbl}</span>`:'');opts.forEach(([v,n])=>{const c=h('button','pchip'+(val===v?' on':''),n);c.onclick=()=>set(v);w.appendChild(c);});par.appendChild(w);return w;};
  row(box,'',[['read','מקריאים לו'],['try','קודם מנסה לבד'],['alone','קורא לבד']],cur.m,v=>put('m',v)).classList.add('rhm');
  const d=document.createElement('details');d.className='pdet rhmore';d.open=moreOpen;d.ontoggle=()=>{moreOpen=d.open;};d.innerHTML='<summary>עוד</summary>';const din=h('div','pdin');d.appendChild(din);box.appendChild(d);
  row(din,'כמה לחכות לפני עזרה',[[10,'10 שניות'],[25,'25 שניות'],[45,'45 שניות']],cur.w,v=>put('w',v)).dataset.k='w';
  row(din,'מהירות הקראה',[[0,'רגילה'],[1,'איטית']],cur.slow?1:0,v=>put('slow',v)).dataset.k='slow';
  row(din,'להקריא אוטומטית',[[1,'כן'],[0,'רק בלחיצה על 🔊']],cur.auto?1:0,v=>{st.autoRead=v;O.persist();refresh();}).dataset.k='auto';
  row(din,'להקריא גם את התשובות',[[1,'כן'],[0,'לא']],cur.ans?1:0,v=>put('ans',v)).dataset.k='ans';
  row(din,'להדגיש מילה בזמן ההקראה',[[1,'כן'],[0,'לא']],cur.hi?1:0,v=>put('hi',v)).dataset.k='hi';
  din.appendChild(h('div','pnote',`"כמה לחכות" חל על "קודם מנסה לבד" (בשלב הסיפורים הנמוך: כמחצית). שלב קריאה במשפטים: <b>${level()}</b> · ענה נכון בלי הקראה: <b>${r.solo|0}</b> פעמים${UP[r.lvl]?` · לשלב הבא: ${UP[r.lvl]}`:''}`));};
window.__rd={level,RH,RD,decorateAll,get cur(){return cur;}};
})();
