/* ===== healthy screen time: body breaks, meals, topic switching (injected into index.html by build_talents.py) =====
   Data: T.S().health[day] = {on, ba, breaks:[{k,t,ok}], dom:{math:sec,...}, act:{math:n}, lt:{math:lastId}, rest:{math:lastId}, one:{math:1}, ov:{math:1}, meals:{b:{s,e}}}
   on = active seconds today, ba = value of `on` at the last break. History is capped at 60 days.
   Settings: T.S().set.hl = {off:{water,toilet,move,eyes,meal}, brk:20, thr:15, meals:{b:'07:30',l:'13:00',d:'18:30'}}
   Hooks: HEALTH.onActivityEnd(dom,id), HEALTH.tick(sec), HEALTH.check(), HEALTH.blocking(), HEALTH.resting(dom), HEALTH.review(), HEALTH.panel(box,sec,rerender)
   Tests: HEALTH.clock can be replaced (fake time). Off under automation unless window.__health is set (so other suites are not interrupted). */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$}=O;const sfx=O.sfx;
const H={};window.HEALTH=H;T.health=H;
H.clock=()=>Date.now();
const now=()=>H.clock();
const pad=n=>String(n).padStart(2,'0');
const dayOf=t=>{const d=new Date(t);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const hm=t=>{const d=new Date(t);return pad(d.getHours())+':'+pad(d.getMinutes());};
const off=()=>!!(window.__noHealth||(navigator.webdriver&&!window.__health)||O.isParentPlay);

/* ---------- domains ---------- */
const DOMS=[
 {id:'math',w:'חֶשְׁבּוֹן',n:'מַסַּע הַחֶשְׁבּוֹן',e:'🧮',c:'#d99a2b',p:'חשבון'},
 {id:'read',w:'קְרִיאָה',n:'קוֹרְאִים וְכוֹתְבִים',e:'📖',c:'#c0392b',b:['read','write','stories','type'],p:'קריאה וכתיבה'},
 {id:'eng',w:'אַנְגְּלִית',n:'אַנְגְּלִית',e:'🔤',c:'#3a8fc4',b:['eng'],p:'אנגלית'},
 {id:'think',w:'חֲשִׁיבָה',n:'חִידוֹת וְקוֹד',e:'🧩',c:'#e8a33d',b:['think','code'],p:'חשיבה וקוד'},
 {id:'sci',w:'מַדָּע',n:'מַדָּע וְעוֹלָם',e:'🔬',c:'#3cb371',b:['lab','world'],p:'מדע ועולם'},
 {id:'art',w:'יְצִירָה',n:'יְצִירָה',e:'🎨',c:'#ff7eb6',b:['art'],p:'יצירה'},
 {id:'music',w:'מוּזִיקָה',n:'מוּזִיקָה',e:'🎵',c:'#b8860b',b:['music'],p:'מוזיקה'},
 {id:'calm',n:'נִרְגָּעִים',e:'🍃',c:'#7cc3a0',b:['mind'],p:'רגיעה',free:1},
 {id:'arcade',n:'אַרְקֵייד',e:'🕹️',c:'#ff3fa4',p:'ארקייד'}];
const DOM=id=>DOMS.find(x=>x.id===id);
const GFALL={readg:'read',explore:'sci',create:'art',calm:'calm'};
const bdom=bid=>{const d=DOMS.find(x=>x.b&&x.b.includes(bid));if(d)return d.id;const g=(T.GROUPS.find(x=>x.ids.includes(bid))||{}).id;return GFALL[g]||'art';};
H.DOMS=DOMS;
H.domOf=id=>{if(!id)return null;if(id==='math')return 'math';if(/^arc-/.test(id))return 'arcade';const a=T.ACT[id];return a&&a.b?bdom(a.b.id):null;};
const enabled=dm=>dm==='math'?true:dm==='arcade'?!!window.TAL_arcade:T.dailyPool().some(id=>H.domOf(id)===dm);

/* ---------- settings & the day's record ---------- */
const MEALS=[['b','אֲרוּחַת בֹּקֶר','בוקר','07:30'],['l','אֲרוּחַת צָהֳרַיִם','צהריים','13:00'],['d','אֲרוּחַת עֶרֶב','ערב','18:30']];
H.MEAL_WIN=60;H.MEAL_MIN=10;
/* read with defaults; nothing is written until a parent changes something (so Oren's device never makes the family settings look newer) */
function cfg(){const c=T.S().set.hl||{};const m={};MEALS.forEach(([k,,,t])=>{m[k]=/^\d\d:\d\d$/.test((c.meals||{})[k]||'')?c.meals[k]:t;});
  return {off:Object.assign({},c.off||{}),meals:m,brk:[15,20,30].includes(c.brk)?c.brk:20,thr:[10,15,20].includes(c.thr)?c.thr:15};}
H.setCfg=(k,v)=>{const st=T.S().set;const c=st.hl=st.hl||{};if(k==='off'||k==='meals')c[k]=Object.assign({},cfg()[k],v);else c[k]=v;if(k==='off')for(const x of Object.keys(c.off))if(!c.off[x])delete c.off[x];O.persist();};
H.cfg=cfg;
function day(t){const s=T.S();s.health=s.health||{};const d=dayOf(t==null?now():t);let r=s.health[d];
  if(!r){r=s.health[d]={};const ks=Object.keys(s.health).sort();ks.slice(0,Math.max(0,ks.length-60)).forEach(k=>delete s.health[k]);}
  r.on=r.on|0;r.ba=r.ba|0;r.breaks=r.breaks||[];['dom','act','lt','rest','one','ov','meals'].forEach(k=>r[k]=r[k]||{});return r;}
H.day=day;
H.resting=dm=>{const r=day();return !!(dm&&r.rest[dm]&&!r.ov[dm]);};
/* the parent lets a resting domain go on today */
H.allow=dm=>{const r=day();r.ov[dm]=1;O.persist();decorate();};
/* yesterday's (last play day's) resting domains: the path starts with them ("we continue where we stopped") */
H.review=()=>{const s=T.S(),hs=s.health||{},td=dayOf(now());const k=Object.keys(hs).filter(x=>x<td&&Object.keys((hs[x]||{}).rest||{}).length).sort().pop();
  if(!k)return [];const prev=Object.keys(hs).filter(x=>x<td&&(hs[x].on|0)>0).sort().pop();if(prev&&prev!==k)return [];
  return Object.entries(hs[k].rest).filter(([dm])=>!(hs[k].ov||{})[dm]).map(([dm,id])=>{if(dm==='math')return 'math';return T.ACT[id]&&T.dailyPool().includes(id)?id:null;}).filter(Boolean);};
/* compact daily log for the parent / skills agent */
H.log=d=>{const r=(T.S().health||{})[d||dayOf(now())];if(!r)return null;return {min:Math.round((r.on|0)/60),breaks:r.breaks||[],dom:r.dom||{},act:r.act||{},rest:Object.keys(r.rest||{}),meals:r.meals||{}};};

/* ---------- what Oren is doing now ---------- */
let cur=null,pend=null,lastIn=now(),ticks=0,lastTick=0;
const wrapRuns=()=>Object.values(T.ACT).forEach(a=>{if(!a.run||a.run._hw)return;const r=a.run;const f=back=>{const x=r(back);cur=H.domOf(a.id);return x;};f._hw=1;a.run=f;});wrapRuns();H.wrapRuns=wrapRuns;   /* packs wired later call H.wrapRuns() again */
if(window.TAL_arcade){const oa=window.TAL_arcade;window.TAL_arcade=T.arcade=b=>{const x=oa(b);cur='arcade';return x;};}
const MATHS=['sMap','sWorld','sLearn','sPlay','sTable','sFinal','sTeach'],MENU=['sHome','sKing','sStudio','sPar','sStart'];
const scr=()=>[...MATHS,...MENU,'sTal'].find(id=>{const e=$('#'+id);return e&&!e.hidden;});
O.on('screen',id=>{if(MATHS.includes(id))cur='math';else if(MENU.includes(id))cur=null;if(pend)pend.ready=1;setTimeout(()=>{decorate();H.check();},0);});
['hub','group','other'].forEach(e=>O.on(e,()=>{cur=null;setTimeout(decorate,0);}));
H.current=()=>cur;
H.onActivityEnd=(dm,id)=>{if(off()||!dm)return;const r=day();r.act[dm]=(r.act[dm]|0)+1;if(id)r.lt[dm]=id;pend={dm,at:performance.now(),ov:0,ready:0};O.persist();};
O.on('tlDone',id=>H.onActivityEnd(H.domOf(id),id));
O.on('levelDone',lv=>H.onActivityEnd('math','math'));

/* ---------- active time ---------- */
H.tick=sec=>{if(off()||H.blocking())return;const p=$('#sPar'),hud=$('#hud');if((p&&!p.hidden)||(hud&&hud.hidden))return;
  const r=day(),t=now();/* more than 10 minutes since the last active moment: that was a natural break */if(lastTick&&t-lastTick>600000+sec*1000)r.ba=r.on;lastTick=t;r.on+=sec;if(cur)r.dom[cur]=(r.dom[cur]|0)+sec;if(++ticks%4===0)O.persist();H.check();};
['pointerdown','keydown'].forEach(ev=>addEventListener(ev,()=>{lastIn=now();},true));
setTimeout(()=>{lastTick=+O.save.t||0;},0);
setInterval(()=>{if(document.hidden||now()-lastIn>60000)return;H.tick(15);},15000);
setInterval(()=>H.check(),1000);
setTimeout(()=>{const ov=$('#ov');if(ov&&window.MutationObserver)new MutationObserver(()=>{if(ov.hidden)setTimeout(H.check,0);else endSeen();}).observe(ov,{attributes:true,attributeFilter:['hidden']});},0);

/* ---------- when to show what ---------- */
const KINDS=['water','toilet','move','eyes'];
const enKinds=()=>{const c=cfg();return KINDS.filter(k=>!c.off[k]);};
const mealAt=(k,t)=>{const [hh,mm]=cfg().meals[k].split(':').map(Number);const d=new Date(t);d.setHours(hh,mm,0,0);return +d;};
function mealDue(){if(cfg().off.meal)return null;const t=now(),r=day();const m=MEALS.find(([k])=>!r.meals[k]&&t>=mealAt(k,t)&&t<mealAt(k,t)+H.MEAL_WIN*60000);return m?m[0]:null;}
function breakDue(){if(!enKinds().length)return 0;const r=day(),iv=cfg().brk*60,since=r.on-r.ba;return since>=iv?since-iv+1:0;}
function topicDue(dm){const d=DOM(dm);if(!d||d.free)return false;const r=day();if(r.ov[dm])return false;if(r.rest[dm])return true;return (r.dom[dm]|0)>=cfg().thr*60;}   /* #634 only the minutes: the old 4-activities count closed a domain after ~5 min of short scenes */
const vis=id=>{const e=$(id);return e&&!e.hidden;};
const safeBase=()=>!vis('#ov')&&!vis('#dlg')&&vis('#hud')&&!vis('#sPar')&&!document.querySelector('.tlock,.tour');
H.blocking=()=>!!document.querySelector('.hlock');
/* an activity has ended once its result window was closed, the screen changed, or (no result window) after a moment */
const endSeen=()=>{if(!pend||pend.ready)return;if(vis('#ov')||vis('#dlg'))pend.ov=1;else if(pend.ov||performance.now()-pend.at>2500)pend.ready=1;};
H.check=()=>{endSeen();if(off()||H.blocking()||!safeBase())return;const r=day(),t=now();
  if(remCheck(t))return;
  const open=MEALS.find(([k])=>r.meals[k]&&!r.meals[k].e);if(open)return showMeal(open[0]);
  const atEnd=!!pend&&!!pend.ready,menu=['sHome','sMap','sKing'].includes(scr()),notPlay=!vis('#sPlay');
  const m=mealDue();if(m&&(atEnd||menu||(notPlay&&t-mealAt(m,t)>5*60000)))return showMeal(m);
  const bd=breakDue();if(bd&&(atEnd||menu||(notPlay&&bd>5*60)))return showBreak();
  if(atEnd){const p=pend;pend=null;if(topicDue(p.dm))return showTopic(p.dm);}};
/* the old reminder's entry point */
H.breakNow=()=>showBreak();

/* ---------- screens ---------- */
const friend=()=>T.friend?T.friend():T.FACES.happy.s;
function lock(cls,html){close();const el=h('div','hlock '+cls,`<div class="card">${html}</div>`);document.body.appendChild(el);document.body.classList.add('hlocked');O.hush&&O.hush();return el;}
function close(){document.querySelectorAll('.hlock').forEach(e=>{clearInterval(e._iv);e.remove();});document.body.classList.remove('hlocked');}
const after=()=>setTimeout(()=>{decorate();H.check();},300);
addEventListener('keydown',e=>{if(!H.blocking()||(e.target.closest&&e.target.closest('#ov,.hlock')))return;e.stopPropagation();},true);
const say=t=>setTimeout(()=>{if(H.blocking())O.say(T.spk(t));},400);
/* no clock digits: the button fills up as the time passes, and turns on when the time is up */
function wait(el,btn,until){const t0=now(),all=Math.max(1,until-t0);const up=()=>{const left=Math.max(0,until-now());btn.disabled=left>0;btn.style.setProperty('--p',Math.round(100-left/all*100)+'%');btn.classList.toggle('ready',!left);if(!left){if(!btn._r){btn._r=1;sfx.ok&&sfx.ok(1);}}};up();el._iv=setInterval(up,250);}

const BRK={
 water:{e:'💧',t:'בּוֹא נִשְׁתֶּה מַיִם!',s:'שְׁתֵה כּוֹס מַיִם, וְאַחַר כָּךְ נַמְשִׁיךְ.',sec:30},
 toilet:{e:'🚽',t:'אוּלַי צָרִיךְ לָלֶכֶת לַשֵּׁרוּתִים?',s:'כְּדַאי לְנַסּוֹת. וְאַחַר כָּךְ לִשְׁטֹף יָדַיִם!',sec:30},
 jump:{e:'🤸',t:'קוֹפְצִים 10 פְּעָמִים!',s:'קְפֹץ אִתִּי, כְּמוֹ צְפַרְדֵּעַ!',sec:30,cls:'hjump'},
 stretch:{e:'🤸',t:'מִתְמַתְּחִים!',s:'יָדַיִם לְמַעְלָה, עַד הַתִּקְרָה! וְעַכְשָׁו לְמַטָּה, עַד הָרִצְפָּה.',sec:30,cls:'hstretch'},
 eyes:{e:'👀',t:'מְנוּחָה לָעֵינַיִם',s:'הִסְתַּכֵּל רָחוֹק, מִבַּעַד לַחַלּוֹן, עַד שֶׁהַשָּׁעוֹן נִגְמָר.',sec:20}};
H.BRK=BRK;
function showBreak(kind){const r=day(),en=enKinds();if(!kind){if(!en.length)return;const all=Object.values(T.S().health||{}).reduce((a,x)=>a+((x&&x.breaks)||[]).length,0);kind=en[all%en.length];}
  const v=kind==='move'?((r.breaks.filter(x=>x.k==='move').length+Math.floor(now()/864e5))%2?'stretch':'jump'):kind;const b=BRK[v];
  const rec={k:kind,t:hm(now())};r.breaks.push(rec);r.ba=r.on;O.persist();
  const el=lock('hbrk '+(b.cls||''),`<div class="hfr"><span class="hav bob">${friend()}</span><span class="hk">${b.e}</span></div><h2>${b.t}</h2><div class="sub">${b.s}</div>${v==='jump'?'<div class="hcnt">1</div>':''}`);
  const btn=h('button','bigbtn huge hback','<span>חָזַרְתִּי!</span>');el.firstChild.appendChild(btn);const t0=now();wait(el,btn,t0+b.sec*1000);
  if(v==='jump'){const c=el.querySelector('.hcnt');const iv=setInterval(()=>{if(!el.isConnected)return clearInterval(iv);c.textContent=Math.min(10,1+Math.floor((now()-t0)/2000));},500);}
  btn.onclick=()=>{if(btn.disabled)return;rec.ok=1;O.persist();sfx.win&&sfx.win();close();after();};
  sfx.star&&sfx.star(0);say(b.t+' '+b.s);return el;}
H.showBreak=showBreak;

function showMeal(k){const r=day(),t=now();const m=r.meals[k]=r.meals[k]||{s:t};O.persist();const nm=(MEALS.find(x=>x[0]===k)||[])[1]||'';
  const el=lock('hmeal',`<div class="hfr"><span class="hav bob">${friend()}</span><span class="hk">🍽️</span></div><h2>הִגִּיעַ זְמַן לֶאֱכֹל!</h2><div class="sub">${nm}. נַמְשִׁיךְ אַחֲרֵי הָאֹכֶל.</div>`);
  const btn=h('button','bigbtn huge hback','<span>אָכַלְתִּי</span>');el.firstChild.appendChild(btn);wait(el,btn,m.s+H.MEAL_MIN*60000);
  const done=p=>{m.e=now();if(p)m.p=1;O.persist();close();after();};btn.onclick=()=>{if(!btn.disabled){sfx.win&&sfx.win();done();}};
  if(T.login){const pb=h('button','hpar','🔒 הורה');pb.onclick=()=>T.login(()=>done(1));el.firstChild.appendChild(pb);}
  if(O.musicStop)O.musicStop();say('הִגִּיעַ זְמַן לֶאֱכֹל! נַמְשִׁיךְ אַחֲרֵי הָאֹכֶל.');return el;}
H.showMeal=showMeal;

/* ---------- a reminder from the parent (#46): T.S().set.rem = {k:'toilet'|'water'|'eat', at, t, ok}
   Synced like the other family settings. Shown when it is due, at the end of what Oren is doing (waits at most a minute), until "ok". */
const REM={toilet:{e:'🚽',p:'🚽 שירותים',t:'הִגִּיעַ הַזְּמַן לָלֶכֶת לַשֵּׁרוּתִים!'},water:{e:'💧',p:'💧 לשתות מים',t:'הִגִּיעַ הַזְּמַן לִשְׁתּוֹת מַיִם!'},eat:{e:'🍽️',p:'🍽️ לאכול',t:'הִגִּיעַ הַזְּמַן לֶאֱכֹל!'}};
const REM_BY='אַבָּא אוֹ אִמָּא מַזְכִּירִים:',REM_WAIT=60000,REM_OLD=2*3600e3;
H.remTexts=()=>Object.values(REM).map(x=>REM_BY+' '+x.t);
let remSince=null;
const inAct=()=>vis('#sPlay')||(vis('#sTal')&&!!cur);
/* #353: k:'msg' = a short text the parent typed (x); the friend says it as typed (on demand from /api/tts), s=1 once said */
const MSG_MAX=120,msgOf=m=>m&&m.k==='msg'&&typeof m.x==='string'?m.x.trim().slice(0,MSG_MAX):'';
const remOk=m=>m&&(REM[m.k]||msgOf(m));
/* #413: 6 ready one-tap messages (audio made in advance: in the pregen list); Oren answers with one face (f) */
const READY=['אַבָּא גֵּאֶה בְּךָ!','אִמָּא גֵּאָה בְּךָ!','אוֹהֲבִים אוֹתְךָ!','כָּל הַכָּבוֹד, אוֹרֶן!','עוֹד מְעַט אוֹכֶל!','בּוֹא רֶגַע אֵלֵינוּ.'],FACES=['❤️','😊','👍','😂'];
H.readyMsgs=()=>READY.slice();T.addSay&&T.addSay(READY);
/* #617: only on Oren's play device (never on the parent's phone that sent it) */
function remCheck(t){const m=(T.S().set||{}).rem;if(!m||m.ok||!remOk(m)||t<m.at||t-m.at>REM_OLD||(O.kidDev&&!O.kidDev(m))){remSince=null;return false;}
  if(!remSince||remSince.t!==m.t)remSince={t:m.t,at:t};
  if(inAct()&&!(pend&&pend.ready)&&t-remSince.at<REM_WAIT)return false;
  showRem(m);return true;}
function showMsg(m){const x=msgOf(m);
  const el=lock('hrem hmsg',`<div class="hfr"><span class="hav bob">${friend()}</span></div><h2></h2>`);el.querySelector('h2').textContent=x;
  const ag=h('button','hagain','🔊');ag.setAttribute('aria-label','שׁוּב');ag.onclick=()=>O.say(T.spk(x));el.firstChild.appendChild(ag);
  const row=h('div','hfaces');FACES.forEach(f=>{const b=h('button','hface',f);b.onclick=()=>{m.ok=1;m.f=f;O.persist();O.famNow&&O.famNow();sfx.win&&sfx.win();close();after();};row.appendChild(b);});el.firstChild.appendChild(row);
  m.s=1;O.persist();O.famNow&&O.famNow();sfx.star&&sfx.star(0);say(x);return el;}
function showRem(m){if(m.k==='msg')return showMsg(m);const x=REM[m.k];
  const el=lock('hrem',`<div class="hfr"><span class="hav bob">${friend()}</span><span class="hk">${x.e}</span></div><div class="sub">${REM_BY}</div><h2>${x.t}</h2>`);
  const btn=h('button','bigbtn huge hback','<span>בְּסֵדֶר!</span>');el.firstChild.appendChild(btn);
  btn.onclick=()=>{m.ok=1;O.persist();O.famNow&&O.famNow();sfx.win&&sfx.win();close();after();};
  m.s=1;O.persist();sfx.star&&sfx.star(0);say(REM_BY+' '+x.t);return el;}
let remWhen=0;
/* #617: the delivery status the parent sees: "נשלח…" until Oren's device showed it, then "אורן שמע ✓" (and his face answer) */
const remStat=m=>`${m.k==='msg'?'💬 '+msgOf(m):REM[m.k].p} · ${m.s||m.ok?'אורן שמע ✓'+(m.f?' · אורן ענה: '+m.f:''):'נשלח…'+(now()<m.at?' · תופיע ב-'+hm(m.at):'')}`;
H.remRefresh=()=>{const el=document.querySelector('#sPar .hremst'),m=(T.S().set||{}).rem;if(el&&remOk(m))el.textContent=remStat(m);};
function remPanel(box,sec,re){const m=(T.S().set||{}).rem;
  const s=sec(box,'🔔 תזכורת לאורן','<div class="pnote">אורן יראה תמונה גדולה וישמע אותה בקול — בסוף מה שהוא עושה עכשיו (עד דקה המתנה).</div>');
  if(remOk(m)&&now()-m.at<REM_OLD){const st=h('div','pstat hremst');st.textContent=remStat(m);s.appendChild(st);}
  const w=h('div','popt','<span>מתי:</span>');[[0,'עכשיו'],[5,'5 דק׳'],[10,'10 דק׳'],[15,'15 דק׳'],[30,'30 דק׳']].forEach(([v,n])=>{const b=h('button','pchip'+(remWhen===v?' on':''),n);b.onclick=()=>{remWhen=v;re&&re();};w.appendChild(b);});s.appendChild(w);
  const g=h('div','pbig');Object.entries(REM).forEach(([k,x])=>{const b=h('button','bigbtn sm','<span>'+x.p+'</span>');b.onclick=()=>{const t=now();T.S().set.rem={k,at:t+remWhen*60000,t,to:'kid',by:O.dev};O.persist();O.famNow&&O.famNow();sfx.ok&&sfx.ok(1);re&&re();};g.appendChild(b);});s.appendChild(g);
  /* #353: a typed message the friend says aloud (same "when", same delivery) */
  const send=x=>{const t=now();T.S().set.rem={k:'msg',x,at:t+remWhen*60000,t,to:'kid',by:O.dev};O.persist();O.famNow&&O.famNow();sfx.ok&&sfx.ok(1);re&&re();};
  const f=h('div','popt hmsgrow','<span>הודעה מהחבר:</span>');READY.forEach(x=>{const b=h('button','hready',x);b.onclick=()=>send(x);f.appendChild(b);});const i=document.createElement('input');i.type='text';i.className='pgin hmsgin';i.maxLength=MSG_MAX;i.dir='rtl';i.placeholder='מה החבר יגיד לאורן?';i.setAttribute('aria-label','הודעה מהחבר');
  const sb=h('button','pchip hmsgsend','📣 שלח');const upd=()=>{sb.disabled=!i.value.trim();};upd();
  i.oninput=upd;i.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')sb.click();};
  sb.onclick=()=>{const x=i.value.trim().slice(0,MSG_MAX);if(x)send(x);};
  const g2=h('div','hmsgtype');g2.append(i,sb);f.appendChild(g2);s.appendChild(f);}

/* two big cards of other domains Oren did least today */
const fresh=dm=>{if(dm==='math'||dm==='arcade')return true;const dt=((T.S().daily||{}).t)||[];return T.dailyPool().some(id=>H.domOf(id)===dm&&!dt.includes(id));};   /* #634 a domain with a mission he has not played today */
function cards(ex){const r=day();return DOMS.filter(d=>d.id!==ex&&!H.resting(d.id)&&enabled(d.id)&&fresh(d.id)).map(d=>[d,(r.dom[d.id]|0)+Math.random()]).sort((a,b)=>a[1]-b[1]).slice(0,2).map(x=>x[0]);}
function goDom(dm){close();sfx.pop&&sfx.pop(3);
  if(dm==='math'){const lv=T.nextLevel&&T.nextLevel();if(lv){if(!O.save.story[lv.w.id+'-in'])O.showWorld(lv.w);else O.startLevel(lv);}else O.showJourney();return;}
  if(dm==='arcade'){window.TAL_arcade(O.showMap);return;}
  const tl=T.S().tl,dt=((T.S().daily||{}).t)||[];let pool=T.dailyPool().filter(id=>H.domOf(id)===dm).sort((a,b)=>((tl[a]||{}).n|0)-((tl[b]||{}).n|0));
  const nw=pool.filter(id=>!dt.includes(id));if(nw.length)pool=nw;   /* #634 not a mission he already played today */
  const id=pool.length?O.pick(pool.slice(0,3)):null;if(id)T.ACT[id].run(O.showMap);else O.showMap();}
H.goDom=goDom;
function chooser(cls,dm,head,sub,oneMore){const r=day();const el=lock('htopic '+cls,`<div class="hfr"><span class="hav bob">${friend()}</span><span class="hk">🌙</span></div><h2>${head}</h2><div class="sub">${sub}</div>`);
  const row=h('div','hcards');cards(dm).forEach(d=>{const b=h('button','dcard',`<span class="dic"><span>${d.e}</span></span><b>${d.n}</b>`);b.style.setProperty('--dc',d.c);b.onclick=()=>goDom(d.id);row.appendChild(b);});el.firstChild.appendChild(row);
  if(!r.one[dm]){const o=h('button','hone','<span aria-hidden="true">⏭️</span><span>עוֹד אֶחָד קָטָן</span>');o.onclick=()=>{r.one[dm]=1;O.persist();sfx.pop&&sfx.pop(1);close();oneMore&&oneMore();};el.firstChild.appendChild(o);}
  sfx.star&&sfx.star(0);say(head+' '+sub+T.choiceSay(el,'.hcards b,.hone span:last-child'));return el;}
function showTopic(dm){const r=day(),d=DOM(dm);if(!r.rest[dm]){r.rest[dm]=r.lt[dm]||dm;O.persist();}
  return chooser('',dm,topicHead(d),TOPSUB,after);}
const TOPSUB='נַמְשִׁיךְ מָחָר. מָה בָּא לְךָ עַכְשָׁו?',RESTH='זֶה נָח עַד מָחָר 🌙',RESTSUB='מָחָר נַמְשִׁיךְ מֵאֵיפֹה שֶׁעָצַרְנוּ. מָה בָּא לְךָ עַכְשָׁו?';
function topicHead(d){return d.id==='arcade'?'שִׂחַקְנוּ הַמּוֹן בָּאַרְקֵייד הַיּוֹם!':`עָשִׂינוּ הַמּוֹן ${d.w} הַיּוֹם!`;}
/* #266 the chooser's fixed clips, for pregen */
T.addChoices&&T.addChoices(DOMS.map(d=>d.n).concat(['עוֹד אֶחָד קָטָן']));T.addSay&&T.addSay(DOMS.map(d=>topicHead(d)+' '+TOPSUB).concat([RESTH+' '+RESTSUB]));
H.showTopic=showTopic;
/* a resting door was tapped: the friend gently suggests something else ("one more" opens it anyway, once a day) */
function showRest(dm,el){return chooser('hrestc',dm,RESTH,RESTSUB,()=>{bypass=1;try{el.click();}finally{bypass=0;}});}
H.showRest=showRest;

/* ---------- resting doors: a small moon, and a gentle suggestion when tapped ---------- */
let bypass=0;
function domOfEl(el){if(el.matches('.door.journey'))return 'math';if(el.matches('.door.arcade'))return 'arcade';
  const txt=((el.querySelector('b,.nm')||{}).textContent||'').trim();if(!txt)return null;
  const b=T.BUILD.find(x=>x.name===txt);if(b)return bdom(b.id);
  const g=T.GROUPS.find(x=>x.n===txt);if(g){const ds=[...new Set(g.ids.filter(id=>T.BUILD.some(x=>x.id===id)).map(bdom))];return ds.length&&ds.every(H.resting)?ds[0]:null;}
  const d=DOMS.find(x=>x.n===txt);return d?d.id:null;}
function decorate(){if(off())return;document.querySelectorAll('.door,.gdoor,.bld,.dcard').forEach(el=>{if(el.closest('.hlock'))return;const dm=domOfEl(el),rs=dm&&H.resting(dm);
  el.classList.toggle('hrest',!!rs);const m=el.querySelector('.hmoon');if(rs){el.dataset.hrest=dm;if(!m)el.appendChild(h('span','hmoon','🌙 נָח עַד מָחָר'));}else{delete el.dataset.hrest;if(m)m.remove();}});}
H.decorate=decorate;
document.addEventListener('click',e=>{if(bypass||off())return;const el=e.target.closest&&e.target.closest('[data-hrest]');if(!el||el.closest('.hlock')||!H.resting(el.dataset.hrest))return;e.stopPropagation();e.preventDefault();sfx.pop&&sfx.pop(1);showRest(el.dataset.hrest,el);},true);

/* ---------- parent panel (no nikud) ---------- */
/* part: 'today' = the reminder + today's log (day tab), 'set' = the settings (settings tab), none = all */
H.panel=(box,sec,re,part)=>{const c=cfg(),r=day();if(part!=='set')remPanel(box,sec,re);
  const s1=part==='today'?null:sec(box,'הפסקות, ארוחות והחלפת נושא','<div class="pnote">בסוף פעילות (אף פעם לא באמצע שאלה): כל כמה דקות פעילות — הפסקה של כחצי דקה עם החבר, בסבב: מים, שירותים, תנועה, מנוחת עיניים. בזמן ארוחה המשחק עוצר עד "אכלתי" (לפחות 10 דקות, או סיסמת הורה). אחרי הרבה זמן באותו תחום — החבר מציע תחום אחר, והתחום נח עד מחר.</div>');
  if(s1){const tg=h('div','popt','<span>תזכורות:</span>');[['water','💧 מים'],['toilet','🚽 שירותים'],['move','🤸 תנועה'],['eyes','👀 עיניים'],['meal','🍽️ ארוחות']].forEach(([k,n])=>{const b=h('button','pchip'+(c.off[k]?'':' on'),n);b.onclick=()=>{H.setCfg('off',{[k]:c.off[k]?0:1});re&&re();};tg.appendChild(b);});s1.appendChild(tg);
  const iv=h('div','popt','<span>הפסקה כל:</span>');[15,20,30].forEach(v=>{const b=h('button','pchip'+(c.brk===v?' on':''),v+' דק׳');b.onclick=()=>{H.setCfg('brk',v);re&&re();};iv.appendChild(b);});s1.appendChild(iv);
  const ml=h('div','popt','<span>ארוחות:</span>');MEALS.forEach(([k,,n])=>{const l=h('label','hml',n+' ');const i=document.createElement('input');i.type='time';i.className='pgin sm';i.value=c.meals[k];i.setAttribute('aria-label','ארוחת '+n);
    i.onkeydown=e=>e.stopPropagation();i.onchange=()=>{if(/^\d\d:\d\d$/.test(i.value))H.setCfg('meals',{[k]:i.value});};l.appendChild(i);ml.appendChild(l);});s1.appendChild(ml);
  const th=h('div','popt','<span>החלפת נושא אחרי:</span>');[10,15,20].forEach(v=>{const b=h('button','pchip'+(c.thr===v?' on':''),v+' דק׳');b.onclick=()=>{H.setCfg('thr',v);re&&re();};th.appendChild(b);});s1.appendChild(th);}
  if(part==='set')return s1;
  /* today's log */
  const BI={water:'💧',toilet:'🚽',move:'🤸',eyes:'👀'};
  const br=r.breaks.length?r.breaks.map(x=>`<span class="hlg${x.ok?'':' no'}">${BI[x.k]||''} ${x.t}</span>`).join(' '):'עוד לא היו הפסקות היום';
  const me=MEALS.filter(([k])=>r.meals[k]).map(([k,,n])=>{const m=r.meals[k];return `<span class="hlg">🍽️ ${n} ${hm(m.s)}${m.e?' – '+hm(m.e)+(m.p?' (הורה)':''):''}</span>`;}).join(' ');
  const s2=sec(box,'היום: הפסקות וזמן לפי תחום',`<div class="pnote">${br}${me?'<br>'+me:''}</div>`);
  const ds=DOMS.filter(d=>(r.dom[d.id]|0)>=30||r.act[d.id]);/* #621 not while he plays, nor once today has any minutes */
  if(!ds.length&&!(window.DAYLOG&&window.DAYLOG.playing())&&!Object.values(r.dom).some(v=>v>0))s2.appendChild(h('div','pnote','עוד לא שיחק היום'));
  ds.forEach(d=>{const row=h('div','prow',`<span class="pn">${d.e} ${d.p}</span><span class="pc">${Math.round((r.dom[d.id]|0)/60)} דק׳ · ${r.act[d.id]|0} פעילויות</span>`);
    if(H.resting(d.id)){row.appendChild(h('span','hrs','🌙 נח עד מחר'));const b=h('button','pchip','לאפשר שוב היום');b.onclick=()=>{H.allow(d.id);re&&re();};row.appendChild(b);}s2.appendChild(row);});
  return s1;};

/* family sync: merge two saves' health maps (per day: max per field, union of lists) */
H.merge=(dst,src)=>{if(!src||typeof src!=='object')return dst;dst=dst||{};
  for(const [d,v] of Object.entries(src)){if(!v||typeof v!=='object')continue;const c=dst[d]=dst[d]||{};
    for(const k of ['on','ba'])c[k]=Math.max(+c[k]||0,+v[k]||0);
    for(const k of ['dom','act','one','ov']){c[k]=c[k]||{};for(const [x,n] of Object.entries(v[k]||{}))c[k][x]=Math.max(+c[k][x]||0,+n||0);}
    for(const k of ['lt','rest']){c[k]=c[k]||{};for(const [x,n] of Object.entries(v[k]||{}))if(!c[k][x])c[k][x]=n;}
    c.meals=c.meals||{};for(const [x,m] of Object.entries(v.meals||{})){if(!m)continue;const e=c.meals[x]||{};const ms=Math.min(+e.s||Infinity,+m.s||Infinity);c.meals[x]={s:isFinite(ms)?ms:0,e:Math.max(+e.e||0,+m.e||0)};if(!c.meals[x].e)delete c.meals[x].e;if(e.p||m.p)c.meals[x].p=1;}
    const seen=new Map();for(const b of [...(c.breaks||[]),...(v.breaks||[])]){if(!b||!b.k)continue;const key=b.k+b.t;const e=seen.get(key);if(e){if(b.ok)e.ok=1;}else seen.set(key,Object.assign({},b));}
    c.breaks=[...seen.values()].sort((a,b)=>a.t<b.t?-1:1);}
  const ks=Object.keys(dst).sort();ks.slice(0,Math.max(0,ks.length-60)).forEach(k=>delete dst[k]);return dst;};
})();
