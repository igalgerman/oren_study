// Every activity (Talents City + packs) speaks a short instruction when it opens (#55).
// Opens each TAL.ACT activity (and the sub-screens behind a menu), then checks that the screen set its
// auto-read sentence (O.sayNow) or said something itself. Activities that are not open yet (avail() false) are skipped.
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
 const SUB=[['code-maze','#sTal .lvb'],['mus-piano','#sTal .acts .actc'],['type-lessons','#sTal .acts .actc']];
 for(const [id,sel] of SUB){
   await p.evaluate(id=>{const O=window.OREN;document.querySelector('#ov').hidden=true;O.showMap();window.TAL.ACT[id].run(()=>O.showMap());},id);
   await L.sleep(300);await reset();await p.evaluate(sel=>document.querySelector(sel).click(),sel);await L.sleep(500);check(id+' > '+sel,await spoken());
 }
 if(miss.length)console.log('MISSING '+miss.join(', '));
 L.finish('instructions',lines);await b.close();})();
