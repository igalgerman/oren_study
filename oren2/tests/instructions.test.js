// Every activity (Talents City + packs) speaks a short instruction when it opens (#55).
// Opens each TAL.ACT activity (and the sub-screens behind a menu), then checks that the screen set its
// auto-read sentence (O.sayNow) or said something itself. Activities that are not open yet (avail() false) are skipped.
// #266: every choice screen (home, something else, the city, doors, buildings, arcade) names all its visible choices.
const L = require('./lib');
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext(L.VIEWPORT);
 await ctx.addInitScript(()=>{try{localStorage.clear()}catch(e){};});
 const p=await ctx.newPage();await p.goto(L.URL);await L.noCoach(p);await L.sleep(400);
 await p.evaluate(()=>{const O=window.OREN;O.save.story.intro=1;O.save.set={brk:0,hide:{}};O.save.prof={an:'cat',col:'#3a8fc4',love:'art'};O.showMap();
   window.__said=[];O.say=function(t){window.__said.push(String(t||''));};window.__fast=true;});
 const spoken=()=>p.evaluate(()=>((window.OREN.sayNow||'')+' '+window.__said.join(' ')).trim());
 const reset=()=>p.evaluate(()=>{window.OREN.sayNow='';window.__said=[];});
 const ids=await p.evaluate(()=>Object.keys(window.TAL.ACT).filter(id=>{const a=window.TAL.ACT[id];return !a.avail||a.avail();}));
 const lines=[],miss=[];const check=(name,t)=>{if(t)lines.push(`PASS ${name}: ${t.slice(0,70)}`);else{lines.push(`FAIL ${name}: no spoken instruction`);miss.push(name);}};
 for(const id of ids){
   await p.evaluate(id=>{const O=window.OREN;document.querySelector('#ov').hidden=true;O.showMap();O.sayNow='';window.__said=[];window.TAL.ACT[id].run(()=>O.showMap());},id);
   await L.sleep(500);check(id,await spoken());
 }
 // sub-screens reached from a menu: [activity, what to click]
 const SUB=[['code-maze','#sTal .lvgo'],['mus-piano','#sTal .pmode'],['type-lessons','#sTal .lvgo']];
 for(const [id,sel] of SUB){
   await p.evaluate(id=>{const O=window.OREN;document.querySelector('#ov').hidden=true;O.showMap();window.TAL.ACT[id].run(()=>O.showMap());},id);
   await L.sleep(300);await reset();await p.evaluate(sel=>document.querySelector(sel).click(),sel);await L.sleep(500);check(id+' > '+sel,await spoken());
 }

 // #266 every kid screen where Oren CHOOSES: the spoken line names every visible choice (he cannot read them yet)
 const CH=[
  ['home: what today?',()=>{const T=window.TAL;T.S().set.noDaily=0;const d=T.dailyEnsure();d.t=[];d.done=[];d.ch=null;window.OREN.showMap();},'#sHome','.dcard b,.dmore span,.againbtn b'],
  ['home: no daily path (doors)',()=>{window.TAL.S().set.noDaily=1;window.OREN.showMap();},'#sHome','.door b,.againbtn b'],
  ['home: the path',()=>{const T=window.TAL;T.S().set.noDaily=0;const d=T.dailyEnsure();d.t=['math','math'];d.done=[0,0];d.ch='math';window.OREN.showMap();},'#sHome','.bigbtn span,.dmore span,.againbtn b'],
  ['something else',()=>{window.TAL.S().set.noDaily=0;window.TAL.otherDay();},'#sTal','.dcard b,.door b'],
  ['something else > a door',()=>{const T=window.TAL;const g=T.GROUPS.find(x=>x.ids.length>1);T.otherDay(g);},'#sTal','.dcard b'],
  ['talents city',()=>window.TAL.openHub(),'#sTal','.gdoor b'],
  ['talents city > a door',()=>{const T=window.TAL;T.openGroup(T.GROUPS.find(g=>g.ids.length>1));},'#sTal','.bld .nm'],
  ['a building',()=>{const T=window.TAL;T.openBuilding(T.BUILD.find(b=>T.bState(b)==='on'&&b.acts.length>1));},'#sTal','.actc .an'],
  ['arcade',()=>window.TAL_arcade(()=>window.OREN.showMap()),'#sTal','.cab b'],
  ['my card (profile)',()=>window.TAL.profile(()=>window.OREN.showMap()),'#sTal','.pfb>span:last-child'],
  ['friend: two choices',()=>window.TOPIC.open(),'#ov','.tpch span'],
  ['friend: practice topics',()=>window.TOPIC.grid(),'#ov','.tpt b'],
  ['friend: finish the path first?',()=>{const T=window.TAL;T.S().set.noDaily=0;const d=T.dailyEnsure();d.t=['math','math','math'];d.done=[1,0,0];d.ch='math';window.TOPIC.nudge();},'#ov','.bigbtn span,.tpany'],
  ['rest: something else now',()=>window.HEALTH.showTopic('read'),'.hlock','.hcards b,.hone span:last-child'],
 ];
 for(const [name,go,root,sel] of CH){
   await p.evaluate(()=>{const O=window.OREN;document.querySelectorAll('.hlock').forEach(x=>x.remove());document.body.classList.remove('hlocked');document.querySelector('#ov').hidden=true;O.showMap();});await reset();
   await p.evaluate(go);await L.sleep(700);
   const labels=await p.evaluate(([root,sel])=>[...document.querySelectorAll(root+' :is('+sel+')')].filter(x=>x.offsetParent).map(x=>window.TAL.spk(x.textContent).replace(/[.!?…:]+$/,'')).filter(Boolean),[root,sel]);
   const t=await spoken();const lack=labels.filter(x=>!t.includes(x));
   // the opening and each choice are separate fixed clips, all in TAL.choiceList() (what pregen makes in advance)
   const notPre=await p.evaluate(()=>{const T=window.TAL,L=new Set(T.choiceList());return [window.OREN.sayNow,...window.__said].flatMap(x=>String(x||'').split('\u2063')).map(x=>T.spk(x)).filter(x=>x&&!L.has(x));});
   if(!labels.length){lines.push(`FAIL choices ${name}: no choices found on screen`);miss.push(name);}
   else if(lack.length){lines.push(`FAIL choices ${name}: not spoken: ${lack.join(' | ')} (said: ${t.slice(0,120)})`);miss.push(name);}
   else if(notPre.length){lines.push(`FAIL choices ${name}: clips not in TAL.choiceList() (no pregen): ${notPre.join(' | ')}`);miss.push(name);}
   else if(/\d/.test(t.replace(/<[^>]*>/g,''))){lines.push(`FAIL choices ${name}: digits in the spoken line (#122): ${t}`);miss.push(name);}
   else lines.push(`PASS choices ${name}: ${labels.length} named`);
 }
 if(miss.length)console.log('MISSING '+miss.join(', '));
 L.finish('instructions',lines);await b.close();})();
