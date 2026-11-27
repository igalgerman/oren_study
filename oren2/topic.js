/* ===== TOPIC PICKER: a hidden path for "I want to practice …" =====
   Tapping the friend on the home screen → two choices: what can I do here? (the tour again) / I want to practice…
   If a step of today's path is waiting, the friend first suggests finishing it. Then a grid of big topic icons
   (the name is spoken on tap) → practice at Oren's level in that topic (the journey's next level in a math world,
   or the adaptive engine's pick inside the topic). Topics resting till tomorrow (health) are not offered. */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$}=O;const sfx=O.sfx;
const TP=window.TOPIC={};
const say=t=>{try{O.say(T.spk?T.spk(t):t);}catch(e){}};
/* topic: id, icon, kid name (nikud), health domain, how to practice */
const TOPICS=[
 {id:'add',e:'➕',n:'חִבּוּר',dm:'math',w:'add'},{id:'sub',e:'➖',n:'חִסּוּר',dm:'math',w:'sub'},
 {id:'mul',e:'✖️',n:'כֶּפֶל',dm:'math',w:'mul'},{id:'div',e:'➗',n:'חִלּוּק',dm:'math',w:'div'},
 {id:'time',e:'🕐',n:'שָׁעוֹן',dm:'math',w:'time'},{id:'read',e:'📖',n:'קְרִיאָה',dm:'read',b:['read','stories']},
 {id:'eng',e:'🇬🇧',n:'אַנְגְּלִית',dm:'eng',b:['eng']},{id:'think',e:'🧩',n:'חִידוֹת',dm:'think',b:['think']}];
TP.TOPICS=TOPICS;
const resting=t=>!!(window.HEALTH&&window.HEALTH.resting&&window.HEALTH.resting(t.dm));
const worldOff=w=>!!((T.S().set||{}).offW||{})[w];
/* the activities of a topic that Oren can play now */
const actsOf=t=>(t.b||[]).flatMap(bid=>{const b=T.BUILD.find(x=>x.id===bid);return b&&T.bState(b)==='on'?b.acts.filter(a=>T.dailyPool().includes(a.id)).map(a=>a.id):[];});
function available(t){if(resting(t))return false;if(t.w){const w=O.WORLDS.find(x=>x.id===t.w);return !!w&&!worldOff(t.w)&&!!O.unlocked&&O.unlocked(w.levels[0]);}return actsOf(t).length>0;}
TP.available=()=>TOPICS.filter(available);
/* practice in a topic: math → the next level of that world he has not passed (or a level to polish); else the engine's choice */
TP.practice=(id,back)=>{const t=TOPICS.find(x=>x.id===id);if(!t)return;back=back||O.showMap;
  if(t.w){const w=O.WORLDS.find(x=>x.id===t.w);const open=w.levels.filter(l=>O.unlocked(l));const lv=open.find(l=>!O.stars(l.id))||open.slice().sort((a,b)=>O.stars(a.id)-O.stars(b.id))[0]||w.levels[0];O.startLevel(lv);return lv.id;}
  const ids=actsOf(t);let step=null;
  try{if(window.LEARN&&LEARN.cands){const cs=LEARN.cands().filter(c=>ids.includes(c.step));const r=cs.length&&LEARN.next(null,{cands:cs});if(r&&ids.includes(r.step))step=r.step;}}catch(e){}
  if(!step)step=O.pick(ids);const a=T.ACT[step];if(a)a.run(back);return step;};

/* ---------- screens ---------- */
const close=()=>{const ov=$('#ov');ov.hidden=true;ov.innerHTML='';};
function card(html){const ov=$('#ov');ov.hidden=false;ov.innerHTML=`<div class="card tpc">${html}</div>`;return ov.firstChild;}
const friend=()=>T.friend?T.friend():(T.FACES&&T.FACES.happy?T.FACES.happy.s:'');
/* what is left of today's path */
function pathLeft(){try{const d=T.dailyEnsure();if(!d||!d.t||!d.t.length)return 0;return d.t.filter((x,i)=>!d.done[i]).length;}catch(e){return 0;}}
TP.open=()=>{sfx.pop(2);const c=card(`<div class="tpf bob">${friend()}</div>`);const row=h('div','tpch');
  const a=h('button','bigbtn','<span>מָה אֶפְשָׁר לַעֲשׂוֹת פֹּה?</span>');a.onclick=()=>{close();if(T.tour)T.tour();else if(window.TAL_tour)window.TAL_tour();};
  const b=h('button','bigbtn blue','<span>אֲנִי רוֹצֶה לְתַרְגֵּל…</span>');b.onclick=()=>{sfx.pop(2);nudge();};
  row.append(a,b);c.appendChild(row);c.appendChild(closeBtn());say(T.choiceSay(row,'span'));};
const closeBtn=()=>{const x=h('button','tpx','✕');x.setAttribute('aria-label','סגור');x.onclick=()=>{sfx.pop(1);close();};return x;};
function nudge(){const left=pathLeft();if(!left)return grid();
  const t=left===1?'אוּלַי נְסַיֵּם קֹדֶם אֶת הַמַּסְלוּל? נִשְׁאַר רַק עוֹד צַעַד!':`אוּלַי נְסַיֵּם קֹדֶם אֶת הַמַּסְלוּל? נִשְׁאֲרוּ עוֹד ${left} צְעָדִים!`;
  const c=card(`<div class="tpf bob">${friend()}</div><h2>${t}</h2>`);
  const go=h('button','bigbtn huge','<span>בּוֹא נַמְשִׁיךְ</span>');go.onclick=()=>{close();if(T.nextStep)T.nextStep();else O.showMap();};
  const anyway=h('button','tpany','בְּכָל זֹאת לְתַרְגֵּל');anyway.onclick=()=>{sfx.pop(1);grid();};
  const r=h('div','btnrow');r.appendChild(go);c.appendChild(r);c.appendChild(anyway);c.appendChild(closeBtn());say(t+' '+T.choiceSay(c,'.bigbtn span,.tpany'));}
function grid(){const ts=TP.available();const head='מָה בָּא לְךָ לְתַרְגֵּל?';const c=card(`<h2>${head}</h2>`);
  const g=h('div','tpg');ts.forEach(t=>{const b=h('button','tpt',`<span class="tpe">${t.e}</span><b>${t.n}</b>`);b.dataset.id=t.id;
    b.onclick=()=>{sfx.pop(3);say(t.n);close();TP.practice(t.id);};g.appendChild(b);});
  c.appendChild(g);c.appendChild(closeBtn());say(head+' '+T.choiceSay(g,'b'));}
TP.grid=grid;TP.nudge=nudge;
})();
