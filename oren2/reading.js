/* ===== READING: "קוֹדֶם אַתָּה, אַחַר כָּךְ אֲנִי" =====
   Every text Oren should read gets a small 🔊 (not story lines: a tap on a line reads it, one 🔊 reads the story, G4). Pressing it reads the text and lights up each word as it is said.
   On quiz questions the game first lets him try; at level 1/2 it reads by itself after a pause.
   Levels go up by themselves when he answers correctly without hearing the question first ("solo"). */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$}=O;const D=O.D;
const HEB=/[א-ת]/;
const RD=()=>{const s=T.S();s.rd=s.rd||{lvl:1,solo:0};return s.rd;};
const mode=()=>{const m=(T.S().set||{}).rdMode;return m===1||m===2||m===3?m:'auto';};
const level=()=>{const m=mode();return m==='auto'?((RD().lvl|0)||1):m;};
const UP={1:25,2:85};                         /* solo answers needed to move up from level 1 / level 2 */
const TARGETS='#sTal .tqc .qq:not(.tqi),#sTal .tqc .sent,#sTal .lsent:not(.blab),#sHome .hbub2';

/* ---- words: wrap each word once, keep the element's own markup ---- */
function words(el){if(el._rw&&el._rw.length&&el._rw.every(w=>w.isConnected))return el._rw;const out=[];
  const tw=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement&&n.parentElement.closest('.rdb,.rdcue,.tleft,svg,button')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  const nodes=[];while(tw.nextNode())nodes.push(tw.currentNode);
  for(const n of nodes){if(!n.nodeValue.trim())continue;const f=document.createDocumentFragment();
    for(const p of n.nodeValue.split(/(\s+)/)){if(!p)continue;if(/^\s+$/.test(p)){f.appendChild(document.createTextNode(p));continue;}const sp=document.createElement('span');sp.className='rw';sp.textContent=p;f.appendChild(sp);out.push(sp);}
    n.parentNode.replaceChild(f,n);}
  el._rw=out;return out;}

/* ---- speaking with lit-up words ---- */
let cur=null;
function stop(){if(!cur)return;const r=cur;cur=null;r.timers.forEach(clearTimeout);r.words.forEach(w=>w.classList.remove('on'));r.el.classList.remove('reading');r.resolve();}
const light=(r,k)=>r.words.forEach((w,j)=>w.classList.toggle('on',j===k));
const rate=()=>.9;                             /* the game voice speaks at 0.9 */
function estimate(r,from){r.timers.forEach(clearTimeout);r.timers=[];let t=0;
  for(let k=from;k<r.words.length;k++){const len=(r.words[k].textContent.match(/[א-תA-Za-z0-9]/g)||[]).length;r.timers.push(setTimeout(()=>{if(cur===r)light(r,k);},t));t+=(170+70*len)/rate();}
  r.timers.push(setTimeout(()=>{if(cur===r)stop();},t+250));}
/* watch the browser voice of OUR reading for word boundaries (the voice engine itself is untouched) */
function attach(u,r){const starts=[];String(u.text||'').replace(/\S+/g,(m,o)=>{starts.push(o);return m;});const n=r.words.length;
  const idx=ci=>{let k=0;for(let j=0;j<starts.length;j++){if(starts[j]<=ci)k=j;else break;}return starts.length===n?k:Math.min(n-1,Math.round(k*n/Math.max(1,starts.length)));};
  u.addEventListener('start',()=>{if(cur!==r)return;r.started=true;r.timers.forEach(clearTimeout);r.timers=[];r.timers.push(setTimeout(()=>{if(cur===r&&!r.gotB)estimate(r,0);},600));});
  u.addEventListener('boundary',e=>{if(cur!==r||(e.name&&e.name!=='word'))return;r.gotB=true;r.timers.forEach(clearTimeout);r.timers=[];light(r,idx(e.charIndex|0));});
  const end=()=>{if(cur===r)stop();};u.addEventListener('end',end);u.addEventListener('error',end);}
(()=>{try{const ss=window.speechSynthesis;if(!ss)return;const orig=ss.speak.bind(ss);ss.speak=u=>{if(cur&&!cur.u&&u&&u.lang!=='en-US'){cur.u=u;attach(u,cur);}return orig(u);};}catch(e){}})();
function readEl(el){stop();const ws=words(el);if(!ws.length)return Promise.resolve();heard(el);
  const cue=el.parentNode&&el.parentNode.querySelector('.rdcue');if(cue)cue.remove();
  return new Promise(res=>{const r={el,words:ws,timers:[],resolve:res};cur=r;el.classList.add('reading');
    O.say(ws.map(w=>w.textContent).join(' '));
    r.timers.push(setTimeout(()=>{if(cur===r&&!r.started&&!r.gotB)estimate(r,0);},700));});}
let seqTok=0;
async function readSeq(els,mark){const tok=++seqTok;for(let i=0;i<els.length;i++){if(tok!==seqTok||!els[i].isConnected)return;if(mark)mark(i);await readEl(els[i]);if(tok!==seqTok)return;}}
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
/* only in reading activities, and only the text to read waits (a sentence / a word); the instruction (.qq) is said right away */
T.rdQ=(q,card,o)=>{clearQ();decorateAll();const target=o&&o.read&&!q.play?card.querySelector('.sent')||card.querySelector('.bigw'):null;
  Q={q,card,heard:false,answered:false,timers:[],target};if(!Q.target)return;
  const tt=T.plainHe(target.textContent.replace(/🔊/g,'')).replace(/\s+/g,' ').trim();if(tt&&O.sayNow){const ns=T.plainHe(O.sayNow).replace(/\s+/g,' ').split(tt).join(' ').trim();O.sayNow=/[א-ת]/.test(ns)?ns:'';}
  const lv=level(),btn=Q.target.querySelector('.rdb');if(lv===3)return;
  if(lv===2&&btn)btn.classList.add('pulse');
  Q.target.after(h('div','rdcue','נַסֵּה לִקְרֹא 👀'));
  const me=Q,wrap=card.parentNode;if(wrap&&!wrap._rdL){wrap._rdL=1;wrap.addEventListener('click',e=>{if(Q&&e.target.closest('.chb'))Q.answered=true;},true);}
  me.timers.push(setTimeout(()=>{if(Q===me&&!me.answered&&!me.heard&&me.target.isConnected)T.readEl(me.target).then(()=>{/* then the answers that are words */
    if(Q!==me||me.answered||!wrap)return;const os=[...wrap.querySelectorAll('.chs .chb')].filter(b=>!b.disabled).map(b=>b.textContent.trim()).filter(t=>HEB.test(t));if(os.length)O.say(os.join(', '));});},D(lv===1?3000:8000)));};
T.rdA=(q,tries,b)=>{if(!Q||Q.q!==q||!Q.target)return;clearQ();if(tries||Q.heard)return;
  const r=RD();r.solo=(r.solo|0)+1;
  if(mode()==='auto'&&UP[r.lvl]&&r.solo>=UP[r.lvl]){r.lvl++;O.floatText(Q.card,'🎉 עָלִיתָ שָׁלָב בִּקְרִיאָה!');}
  else if(r.solo%4===1)O.floatText(Q.card,'קָרָאתָ לְבַד! ⭐');
  O.persist();};
O.on('screen',()=>{clearQ();Q=null;seqTok++;stop();});

/* ---- parent: one setting ---- */
T.rdSettings=(body,sec,refresh)=>{const r=RD(),m=mode();
  const box=sec(body,'📖 קריאה',`<div class="pnote">כשאורן רואה שאלה, הוא מנסה לקרוא לבד. אם לא הצליח, המשחק מקריא לו ומדגיש כל מילה בזמן שהיא נאמרת. ליד כל טקסט יש 🔊 לשמיעה.</div><div class="pnote">שלב נוכחי: <b>${level()}</b> · ענה נכון בלי הקראה: <b>${r.solo|0}</b> פעמים${m==='auto'&&UP[r.lvl]?` · לשלב הבא: ${UP[r.lvl]}`:''}</div>`);
  const row=h('div','popt','<span>שלב:</span>');
  [['auto','אוטומטי (מומלץ)'],[1,'1 · מקריאים אחרי 3 שניות'],[2,'2 · מקריאים אחרי 8 שניות'],[3,'3 · קורא לבד']].forEach(([v,n])=>{const c=h('button','pchip'+(m===v?' on':''),n);c.onclick=()=>{T.S().set.rdMode=v;O.persist();refresh();};row.appendChild(c);});
  box.appendChild(row);};
window.__rd={level,mode,RD,decorateAll,get cur(){return cur;}};
})();
