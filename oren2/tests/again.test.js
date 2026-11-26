// "Again" (#39): one big button on home opens one list of big tiles — what Oren did and what he closed by mistake —
// newest first, grouped by day (a picture per day), scroll down to go back in time. Tap a tile: it opens again. No voice, no typing.
const L = require('./lib');
const {chromium}=require('playwright');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const res=[];const ok=(n,c,i='')=>res.push((c?'PASS ':'FAIL ')+n+(i?' — '+i:''));
const NIK=/[ְ-ּ]/;
(async()=>{const b=await chromium.launch();const ctx=await b.newContext(L.VIEWPORT);await ctx.addInitScript(()=>{try{localStorage.clear()}catch(e){};window.__fast=true;window.__noFamily=true;});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(L.URL);await p.waitForFunction(()=>window.TAL&&window.TAL.S);await sleep(300);
 await p.evaluate(()=>{const O=window.OREN,T=window.TAL;O.save.story.intro=1;T.S().prof={an:'cat',col:'#3a8fc4',love:'art'};});await L.noCoach(p);
 const home=async()=>{await p.evaluate(()=>window.OREN.showMap());await sleep(300);};
 // --- nothing done yet: no button ---
 await home();ok('no history: no "again" button on home',await p.locator('#sHome .againbtn').count()===0);
 // --- a seeded history: today, yesterday, 3 days ago ---
 const seed=await p.evaluate(()=>{const O=window.OREN,T=window.TAL;const pool=T.dailyPool();const [a1,a2,a3,a4,off]=pool;T.S().set.offA=T.S().set.offA||{};T.S().set.offA[off]=1;
   const lv=O.ALLLV.find(l=>l.type!=='train');const dd=n=>{const x=new Date();x.setDate(x.getDate()-n);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
   const E=(m,id,o)=>[m,id,2,0,0,0,o];O.save.alog={};
   O.save.alog[dd(0)]={a:{},s:0,k:{},e:[E(1,a1,'c'),E(2,a2,'q'),E(3,a1,'c'),E(4,off,'c'),E(5,a3,'s')]};
   O.save.alog[dd(1)]={a:{},s:0,k:{},e:[E(500,'lv:'+lv.id,'c'),E(510,a3,'c')]};
   O.save.alog[dd(3)]={a:{},s:0,k:{},e:[E(400,a4,'b')]};
   O.persist();return {a1,a2,a3,a4,off,lv:lv.id};});
 await home();
 const btn=await p.evaluate(()=>{const e=document.querySelector('#sHome .againbtn');return e?{t:e.textContent,n:document.querySelectorAll('#sHome .againbtn').length}:null;});
 ok('home has ONE "again" button with kid text in nikud',btn&&btn.n===1&&NIK.test(btn.t),JSON.stringify(btn));
 await p.evaluate(()=>{window.__said=0;const O=window.OREN,s=O.say;O.say=(...x)=>{window.__said++;return s(...x);};});
 await p.locator('#sHome .againbtn').click();await sleep(400);
 const scr=await p.evaluate(()=>{const s=document.querySelector('#sTal');const days=[...s.querySelectorAll('.agday')].map(d=>({pic:!!d.querySelector('.agpic'),t:d.querySelector('.agt').textContent,ids:[...d.querySelectorAll('.agtile')].map(x=>x.dataset.id)}));
   return {vis:!s.hidden,days,inputs:s.querySelectorAll('input,textarea,select').length,title:(s.querySelector('h1')||{}).textContent||'',sayNow:window.OREN.sayNow};});
 ok('the list opens',scr.vis&&scr.days.length===3,JSON.stringify(scr.days));
 ok('grouped by day, newest day first, each day with a picture and nikud text',scr.days.length===3&&scr.days.every(d=>d.pic&&NIK.test(d.t))&&scr.days[0].t.includes('הַיּוֹם')&&scr.days[1].t.includes('אֶתְמוֹל'),JSON.stringify(scr.days.map(d=>d.t)));
 const d0=(scr.days[0]||{}).ids||[],d1=(scr.days[1]||{}).ids||[],d2=(scr.days[2]||{}).ids||[];
 ok('today: newest first, each thing once, done AND left in the middle; turned-off and not-reached steps are not shown',JSON.stringify(d0)===JSON.stringify([seed.a1,seed.a2]),JSON.stringify(d0));
 ok('yesterday has the math level and the activity, newest first',JSON.stringify(d1)===JSON.stringify([seed.a3,'lv:'+seed.lv]),JSON.stringify(d1));
 ok('older days further down',JSON.stringify(d2)===JSON.stringify([seed.a4]),JSON.stringify(d2));
 ok('no typing / search, nikud title, no voice',scr.inputs===0&&NIK.test(scr.title)&&!scr.sayNow&&await p.evaluate(()=>window.__said===0),JSON.stringify({i:scr.inputs,t:scr.title,s:scr.sayNow}));
 ok('tiles are big pictures',await p.evaluate(()=>{const t=document.querySelector('#sTal .agtile');const r=t.getBoundingClientRect();return r.width>=100&&r.height>=100&&!!t.querySelector('.dic');}));
 ok('no horizontal overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 if(process.env.HSHOTS){await p.screenshot({path:require('path').join(process.env.HSHOTS,'again-'+L.variant+'.png')});await home();await p.screenshot({path:require('path').join(process.env.HSHOTS,'again-home-'+L.variant+'.png')});await p.locator('#sHome .againbtn').click();await sleep(400);}
 // --- tap a tile: it opens again ---
 await p.locator(`#sTal .agtile[data-id="${seed.a2}"]`).click();await sleep(400);
 {const r=await p.evaluate(()=>({cur:window.DAYLOG.cur(),tal:!document.querySelector('#sTal').hidden,ag:!!document.querySelector('#sTal .again')}));ok('tapping an activity tile opens it again',r.cur&&r.cur.id===seed.a2&&!r.ag,JSON.stringify(r));}
 await home();await p.locator('#sHome .againbtn').click();await sleep(300);
 await p.locator(`#sTal .agtile[data-id="lv:${seed.lv}"]`).click();await sleep(500);
 ok('tapping a math level tile opens that level',await p.evaluate(id=>{const pl=window.__oren4.play;return (!document.querySelector('#sPlay').hidden&&pl&&pl.lv&&pl.lv.id===id)||!document.querySelector('#sLearn').hidden;},seed.lv));
 // --- closed by mistake: opened and closed at once is in the list, but not in the parent's day log ---
 await home();const a5=await p.evaluate(()=>{const T=window.TAL;const id=T.dailyPool().find(x=>x!==T.dailyPool()[0]&&x!==T.dailyPool()[1]&&x!==T.dailyPool()[2]&&x!==T.dailyPool()[3]&&x!==T.dailyPool()[4]);T.ACT[id].run(window.OREN.showMap);return id;});
 await sleep(300);await home();await p.locator('#sHome .againbtn').click();await sleep(300);
 const first=await p.evaluate(()=>(document.querySelector('#sTal .agday .agtile')||{dataset:{}}).dataset.id);
 ok('closed by mistake (opened and closed at once) comes first in the list',first===a5,first+' vs '+a5);
 ok('...but the parent day log still skips it',await p.evaluate(id=>!window.DAYLOG.rows(window.OREN.today()).some(e=>e[1]===id),a5));
 ok('no page errors',!errs.length,errs.join(' | '));
 await b.close();L.finish('again '+L.variant,res);})().catch(e=>{console.error(e);process.exit(1);});
