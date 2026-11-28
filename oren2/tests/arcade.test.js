// Arcade hall: every cabinet plays to completion, records (no tickets, no prize shop), real clicks.
const L = require('./lib');
const {chromium}=require('playwright');const fs=require('fs');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const VP=L.VIEWPORT;const tag=process.argv[2]==='phone'?'p':'d';
const res=[];const ok=(n,c,i='')=>res.push((c?'PASS ':'FAIL ')+n+(i?' — '+i:''));
(async()=>{const b=await chromium.launch();const ctx=await b.newContext(VP);await ctx.addInitScript(()=>{try{localStorage.clear()}catch(e){};window.__fast=true;});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts|ERR_|Failed to load/.test(m.text()))errs.push('console: '+m.text());});
 await p.goto(L.URL);await L.noCoach(p);await sleep(500);
 await p.evaluate(()=>{const O=window.OREN,T=window.TAL;O.save.story.intro=1;T.S().prof={an:'cat',col:'#3a8fc4',love:'art'};window.TAL_arcade(()=>O.showMap());});await sleep(400);
 ok('arcade hall with 9 cabinets (air hockey #668, pinball #667, chase)',await p.locator('.cab').count()===9);ok('no tickets or prize shop',await p.locator('.prize,.tkbig').count()===0&&!/🎟|פְּרָסִים/.test(await p.textContent('#sTal')));await L.shot(p,{path:L.SHOTDIR+`/arc-${tag}-hall.png`,fullPage:true});
 const ids=['balloon','soccer','basket','swim','mole','frog','hockey','pinball','chase'];
 for(const id of ids){const e0=errs.length;
   await p.evaluate(id=>window.__arc.start(id),id);await sleep(700);await L.shot(p,{path:L.SHOTDIR+`/arc-${tag}-${id}.png`});
   // play by hooks until result overlay appears
   for(let k=0;k<200;k++){if(await p.evaluate(()=>!document.querySelector('#ov').hidden))break;await p.evaluate(()=>window.__arc.hit());await sleep(id==='swim'||id==='basket'||id==='chase'?120:60);
     if(k===40&&['balloon','mole'].includes(id))await p.evaluate(()=>window.__arc.finish());}
   if(!(await p.evaluate(()=>!document.querySelector('#ov').hidden)))await p.evaluate(()=>window.__arc.finish());await sleep(300);
   const r=await p.evaluate(id=>({ov:!document.querySelector('#ov').hidden,t:window.__arc.state().tickets,tk:/🎟/.test(document.querySelector('#ov').textContent),rc:/שִׂיא/.test(document.querySelector('#ov').textContent),best:window.__arc.state().best[id]|0,rec:(window.TAL.S().tl['arc-'+id]||{}).s|0}),id);
   ok(`${id}: finished, stars saved, no tickets, no record (#426)`,r.ov&&r.t==null&&!r.tk&&!r.rc&&r.best===0&&r.rec>0,JSON.stringify(r)+' errs '+(errs.length-e0));
   if(id==='soccer')await L.shot(p,{path:L.SHOTDIR+`/arc-${tag}-result.png`});
   await p.evaluate(()=>{document.querySelector('#ov').hidden=true;window.TAL_arcade();});await sleep(200);}
 // real interaction: pop a balloon by clicking
 await p.evaluate(()=>window.__arc.start('balloon'));await sleep(1500);const bal=p.locator('.bal').first();await bal.waitFor({timeout:5000}).catch(()=>{});
 if(await bal.count()){await bal.click({force:true});await sleep(200);}ok('click pops a balloon',await p.evaluate(()=>window.__arc.cur&&window.__arc.cur.score>=1));await p.evaluate(()=>window.__arc.finish());
 // real click soccer corner
 await p.evaluate(()=>{document.querySelector('#ov').hidden=true;window.__arc.start('soccer');});await sleep(300);await p.locator('.corner').first().click();await sleep(90);ok('soccer kick by click resolves',await p.evaluate(()=>!!document.querySelector('.kmsg').textContent||document.querySelector('.tm').textContent.includes('2/')));
 await p.evaluate(()=>{document.querySelector('#ov').hidden=true;});
 // #668 air hockey: real mouse + keys move the mallet, the puck never passes the cap, the computer is slow, a round plays to its end
 await p.evaluate(()=>{document.querySelector('#ov').hidden=true;window.__fast=false;window.__arc.start('hockey');});await sleep(4200);
 const rk=await p.locator('.rink').boundingBox();
 await p.mouse.move(rk.x+rk.width*.2,rk.y+rk.height*.9);await p.mouse.move(rk.x+rk.width*.8,rk.y+rk.height*.7,{steps:8});await sleep(900);
 const mv=await p.evaluate(()=>{const s=window.__arc.cur.state();return {mx:s.m.x/s.W,my:s.m.y/s.Hh};});
 ok('hockey: mouse moves the mallet (lower half only)',mv.mx>.6&&mv.my>.5,JSON.stringify(mv));
 await p.keyboard.press('ArrowLeft');await p.keyboard.press('ArrowLeft');await sleep(600);
 ok('hockey: arrow keys move the mallet',await p.evaluate(mx=>window.__arc.cur.state().m.tx/window.__arc.cur.state().W<mx,mv.mx));
 await L.shot(p,{path:L.SHOTDIR+`/arc-${tag}-hockey-play.png`});
 const sp=await p.evaluate(()=>{const c=window.__arc.cur,s=c.state();let mx=0;s.puck.vx=9;s.puck.vy=-9;for(let i=0;i<400;i++){c.step(8);mx=Math.max(mx,Math.hypot(s.puck.vx,s.puck.vy));}return {mx,cap:s.CAPV};});
 ok('hockey: puck speed never above the cap',sp.mx<=sp.cap*1.0001,JSON.stringify(sp));
 const hk=await p.evaluate(()=>{const a=window.__arc.state();a.lv={hockey:999};const hi=window.__arc.tune('hockey');a.lv={};return {hi,lo:window.__arc.tune('hockey')};});
 ok('hockey: hard cap on puck and computer speed, calm base lower',hk.hi.pk<=1.1&&hk.hi.ai<=.6&&hk.lo.pk<hk.hi.pk&&hk.lo.pk<=.8&&hk.lo.ai<hk.hi.ai,JSON.stringify(hk));
 // play to the end by hooks (puck rolled into the computer's goal 5 times)
 let wonRound=false;for(let k=0;k<300;k++){if(await p.evaluate(()=>!document.querySelector('#ov').hidden)){wonRound=true;break;}await p.evaluate(()=>window.__arc.hit());await sleep(150);}
 ok('hockey: a round plays to its end and shows the result',wonRound&&/5:\d/.test(await p.textContent('#ov')),(await p.textContent('#ov')).slice(0,80));
 await p.evaluate(()=>{const a=window.__arc.state();window.__fast=true;a.lv={hockey:3};document.querySelector('#ov').hidden=true;window.__arc.start('hockey');});await sleep(300);await p.evaluate(()=>window.__arc.finish(0));
 ok('hockey: bad round makes the next one easier',await p.evaluate(()=>window.__arc.tune('hockey').lv===2));
 await p.evaluate(()=>{document.querySelector('#ov').hidden=true;});
 // #351: calm base speed, hard cap, ease after a bad round (caps written here, not read from the game)
 const CAP={balloonSp:.075,spawn:700,stay:1700,gap:800,meter:.08,zoneMin:24,rivalT:44000};
 const huge=await p.evaluate(()=>{const a=window.__arc.state();['balloon','soccer','basket','swim','mole','frog','hockey'].forEach(id=>{a.best[id]=99999;});a.lv={balloon:999,soccer:999,basket:999,swim:999,mole:999,frog:999};a.gr={};
   const ts={};['balloon','soccer','basket','swim','mole','frog','hockey'].forEach(id=>ts[id]=window.__arc.tune(id));const qs=[...Array(300)].map(()=>window.__arc.q('swim'));return {ts,qmax:Math.max(...qs.map(q=>Math.max(q.ans,...(q.txt.match(/\d+/g)||[]).map(Number)))),x:qs.some(q=>/×/.test(q.txt))};});
 const T=huge.ts,t=Object.assign({},T.frog,{sp:T.balloon.sp,spawn:T.balloon.spawn,stay:T.mole.stay,gap:T.mole.gap,meter:T.basket.meter,zone:T.basket.zone,rivalT:T.swim.rivalT,max:Math.max(...Object.values(T).map(x=>x.max))});
 ok('balloon rise speed capped at huge best',t.sp[1]<=CAP.balloonSp&&t.spawn>=CAP.spawn,JSON.stringify(t));
 ok('mole speed capped at huge best',t.stay>=CAP.stay&&t.gap>=CAP.gap,JSON.stringify(t));
 ok('basketball meter capped at huge best',t.meter<=CAP.meter&&t.zone>=CAP.zoneMin,JSON.stringify(t));
 ok('swim dolphin capped at huge best',t.rivalT>=CAP.rivalT,JSON.stringify(t));
 ok('soccer/basket/swim/mole/balloon numbers stay 1-10 without 3 good rounds',t.max===10&&huge.qmax<=10&&!huge.x,JSON.stringify(huge));
 ok('frog line stays at 20 without 3 good rounds',t.line<=20,JSON.stringify(t));
 const calm=await p.evaluate(()=>{const a=window.__arc.state();a.lv={};return window.__arc.tune('basket');});
 ok('calm base is slower than the cap',calm.meter<t.meter&&calm.sp[1]<t.sp[1]&&calm.rivalT>t.rivalT&&calm.lv===0&&T.basket.lv===4,JSON.stringify(calm));
 // a bad round (1 star) lowers the next round's level; a 3-star round raises it one step
 const ad=await p.evaluate(async()=>{const a=window.__arc.state();a.lv={soccer:3};a.gr={soccer:2};const w=ms=>new Promise(r=>setTimeout(r,ms));
   window.__arc.start('soccer');await w(200);window.__arc.finish(0);const bad=window.__arc.tune('soccer').lv,gr0=a.gr.soccer|0;document.querySelector('#ov').hidden=true;
   window.__arc.start('soccer');await w(200);window.__arc.finish(8);const good=window.__arc.tune('soccer').lv;document.querySelector('#ov').hidden=true;
   a.lv.soccer=99;window.__arc.start('soccer');await w(200);window.__arc.finish(8);const top=window.__arc.tune('soccer').lv;document.querySelector('#ov').hidden=true;
   return {bad,gr0,good,top};});
 ok('bad round lowers the next level and resets the streak',ad.bad===2&&ad.gr0===0,JSON.stringify(ad));
 ok('good round raises one step, never past the cap',ad.good===3&&ad.top<=4,JSON.stringify(ad));
 const wide=await p.evaluate(()=>{const a=window.__arc.state();a.gr={frog:3};return window.__arc.tune('frog');});
 ok('3 good rounds in a row open the wider range',wide.wide&&wide.max===20,JSON.stringify(wide));
 // #665 chase: real tap + Space step the chaser; speed capped; calm base
 await p.evaluate(()=>{document.querySelector('#ov').hidden=true;window.__arc.start('chase');});await sleep(300);
 ok('chase: instructions shown (one rule line, one main button)',/תְּפֹס/.test(await p.locator('.rule').innerText())&&await p.locator('.rungo').count()===1);
 await sleep(3200);const x0=await p.evaluate(()=>parseFloat(document.querySelector('.run.me').style.left)||0);
 await p.locator('.rungo').click();await p.keyboard.press('Space');await sleep(100);const x1=await p.evaluate(()=>parseFloat(document.querySelector('.run.me').style.left)||0);
 ok('chase: click and Space both move the chaser',x1>x0+4,x0+' -> '+x1);await p.evaluate(()=>window.__arc.finish());await sleep(200);await p.evaluate(()=>{document.querySelector('#ov').hidden=true;});
 const ch=await p.evaluate(()=>{const a=window.__arc.state();a.lv={chase:999};const top=window.__arc.tune('chase');a.lv={};return {top,base:window.__arc.tune('chase')};});
 ok('chase: runner speed hard-capped (>=13000 ms) and calm base slower',ch.top.chT>=13000&&ch.base.chT>ch.top.chT&&ch.base.chGap>=.25,JSON.stringify(ch));
 await p.evaluate(()=>window.OREN.showMap());await sleep(300);
 ok('no JS errors',!errs.length,errs.slice(0,5).join(' | '));await b.close();L.finish('arcade-'+L.variant,res);})();
