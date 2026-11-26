/* ===== KNOW (#57): what Oren already knows — skip what he knows, step back quietly, learn over time =====
   One small model for every area (math, English, music, and any area added later).
   An area lists its skills, easy → hard, in tracks (one track = one ladder, e.g. the rhythm activity):
     KNOW.area(id,{name (parent text), skills:[{id, track, lesson (lesson card id), ...pack data}],
                   asks:[{id, q (parent question, plain text), skills:[skill ids]}], on:events=>{} (the pack moves its own levels)})
   The rules (owner, 25 Nov 2026):
     · 3 right answers in a row on a skill → 'known': its lesson is skipped, the next harder skill follows.
     · a wrong answer on a known skill → not known any more: its lesson comes back.
     · 2 wrong answers in a row → quietly back to the easier skill of the same track (no message).
     · about 1 question in 10 is a quick review of a skill he already knows (KNOW.review).
     · the parent answers a few yes/no questions per area (parent panel); yes = that skill and the easier ones
       of its track are known, no = that skill and the harder ones are not. The game keeps learning from his answers.
   Part 1 (pure, runs in Node for the tests) works on a state object; part 2 binds it to save.kn and the lesson cards.
   State: save.kn = {k:{skill:{r (right in a row), w (wrong in a row), ok (known), b (stepped back from it)}}, pl:{ask:1|0}, t} */
window.KNOW=(()=>{'use strict';
const AREAS={};
const REVIEW=.1;
const blank=()=>({k:{},pl:{},t:0});
const ensure=st=>{st=st&&typeof st==='object'?st:blank();st.k=st.k||{};st.pl=st.pl||{};return st;};
const rec=(st,id)=>st.k[id]||(st.k[id]={r:0,w:0,ok:0});
function area(id,def){def.id=id;def.asks=def.asks||[];def.skills.forEach(s=>{s.track=s.track||'';s.area=id;});AREAS[id]=def;return def;}
const skillOf=id=>{for(const a in AREAS){const s=AREAS[a].skills.find(x=>x.id===id);if(s)return s;}return null;};
const track=(a,tr)=>((AREAS[a]||{skills:[]}).skills).filter(s=>s.track===(tr||''));
const near=(id,d)=>{const s=skillOf(id);if(!s)return null;const t=track(s.area,s.track);return t[t.indexOf(s)+d]||null;};
const known=(st,id)=>!!(st&&st.k&&st.k[id]&&st.k[id].ok);
/* one first-try answer → the events it caused: [{e:'known'|'lost'|'back', skill, to}] */
function answer(st,id,ok){st=ensure(st);const s=skillOf(id);if(!s)return [];const k=rec(st,id),ev=[];st.t=Date.now();
  if(ok){k.r=(k.r|0)+1;k.w=0;
    if(!k.ok&&k.r>=3){k.ok=1;ev.push({e:'known',skill:id,area:s.area});const nx=near(id,1);if(nx&&st.k[nx.id])delete st.k[nx.id].b;}}
  else{k.r=0;k.w=(k.w|0)+1;
    if(k.ok){k.ok=0;ev.push({e:'lost',skill:id,area:s.area});}
    if(k.w>=2){k.w=0;const pv=near(id,-1);if(pv){const p=rec(st,pv.id);p.ok=0;p.r=0;k.b=1;ev.push({e:'back',skill:id,to:pv.id,area:s.area});}}}
  return ev;}
/* the skill to work on in a track: the first one not known (all known: the hardest) */
function current(st,a,tr){const t=track(a,tr);return t.find(s=>!known(st,s.id))||t[t.length-1]||null;}
/* about 1 in 10: a known easier skill of the same track to review now (else null) */
function review(st,id,rnd){const s=skillOf(id);if(!s)return null;const t=track(s.area,s.track);const easier=t.slice(0,t.indexOf(s)).filter(x=>known(st,x.id));
  rnd=rnd||Math.random;if(!easier.length||rnd()>=REVIEW)return null;return easier[Math.floor(rnd()*easier.length)];}
/* the parent's yes/no answer → events [{e:'place', skill, yes}] for every skill it changed */
function place(st,a,askId,yes){st=ensure(st);const A=AREAS[a];const q=A&&A.asks.find(x=>x.id===askId);if(!q)return [];st.pl[askId]=yes?1:0;st.t=Date.now();const ev=[];
  q.skills.forEach(id=>{const s=skillOf(id);if(!s)return;const t=track(a,s.track),i=t.indexOf(s);
    (yes?t.slice(0,i+1):t.slice(i)).forEach(x=>{const k=rec(st,x.id);k.ok=yes?1:0;k.r=0;k.w=0;delete k.b;ev.push({e:'place',skill:x.id,yes:!!yes,area:a});});});
  return ev;}
/* family merge: the newer state wins */
function merge(dst,src){dst=ensure(dst);if(!src||typeof src!=='object')return dst;return (+src.t||0)>(+dst.t||0)?ensure(JSON.parse(JSON.stringify(src))):dst;}
const core={AREAS,REVIEW,ensure,area,skillOf,track,near,known,answer,current,review,place,merge};
const api=Object.assign({core},{area,skillOf,track,AREAS});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof document==='undefined')return api;

/* ---------- part 2: the game ---------- */
const O=window.OREN,T=window.TAL;if(!O||!T)return api;
const h=O.h;
const ST=()=>{O.save.kn=ensure(O.save.kn);return O.save.kn;};
/* during a round the pack's level changes wait for its end (KNOW.begin/end), so they do not fight its own level-up */
const held={};
function fire(ev){ev.forEach(x=>{const s=skillOf(x.skill);const L=window.LESSONS;
    if(L&&L.mark){if(x.e==='known'||(x.e==='place'&&x.yes))s.lesson&&L.mark(s.lesson,1);
      else if(x.e==='lost'||(x.e==='place'&&!x.yes))s.lesson&&L.mark(s.lesson,0);
      else if(x.e==='back'){const p=skillOf(x.to);if(p&&p.lesson)L.mark(p.lesson,0);}}});
  const by={};ev.forEach(x=>{(by[x.area]=by[x.area]||[]).push(x);});
  for(const a in by){if(held[a]&&!held[a].alive())api.end(a);if(held[a])held[a].q.push(...by[a]);else if(AREAS[a].on)AREAS[a].on(by[a]);}}
api.st=ST;
api.known=id=>known(ST(),id);
api.current=(a,tr)=>current(ST(),a,tr);
api.review=id=>review(ST(),id);
api.stepped=id=>!!(ST().k[id]&&ST().k[id].b);
api.hit=(id,ok)=>{const ev=answer(ST(),id,ok);fire(ev);O.persist();return ev;};
api.set=(a,ask,yes)=>{const ev=place(ST(),a,ask,yes);fire(ev);O.persist();return ev;};
/* alive(): the round's screen is still there (a round left in the middle stops holding) */
api.begin=(a,alive)=>{api.end(a);held[a]={q:[],alive:alive||(()=>true)};};
api.end=a=>{const x=held[a];delete held[a];if(x&&x.q.length&&AREAS[a]&&AREAS[a].on)AREAS[a].on(x.q);O.persist();};
/* parent panel: a few yes/no questions per area (plain text, no nikud) */
api.panel=(box,sec,rerender)=>{const st=ST();const as=Object.values(AREAS).filter(a=>a.asks.length);if(!as.length)return null;
  const el=sec(box,'מה אורן כבר יודע','<div class="pnote">המשחק לא מלמד את מה שאורן כבר יודע. אפשר לשנות בכל זמן — המשחק ממשיך ללמוד מהתשובות שלו.</div>');
  as.forEach(a=>{el.appendChild(h('div','knarea',`<b>${a.name}</b>`));
    a.asks.forEach(q=>{const v=st.pl[q.id];const r=h('div','prow knq',`<span class="pn">${q.q}</span>`);const bt=h('span','lnp-bt');
      [['כן',1],['לא',0]].forEach(([lbl,yes])=>{const b=h('button','pchip'+(v===yes?' on':''),lbl);b.dataset.ask=q.id;b.dataset.yes=yes;b.onclick=()=>{api.set(a.id,q.id,yes);rerender&&rerender();};bt.appendChild(b);});
      r.appendChild(bt);el.appendChild(r);});});
  return el;};
return api;
})();
