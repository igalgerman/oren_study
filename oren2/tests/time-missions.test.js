// Missions control (today + template) and screen-time limits / lock screen.
const L = require('./lib');
const {chromium}=require('playwright');const URL=L.URL;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const res=[];const ok=(n,c,i='')=>res.push((c?'PASS ':'FAIL ')+n+(i?' — '+i:''));
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1366,height:768}});await ctx.addInitScript(()=>{try{localStorage.clear()}catch(e){};window.__fast=true;setInterval(()=>{const c=document.querySelector('#ov:not([hidden]) .pchoice .ucard.par');if(c)c.click();},80);});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(URL);await L.noCoach(p);await sleep(500);
 await p.evaluate(()=>{const O=window.OREN,T=window.TAL;O.save.story.intro=1;T.S().prof={an:'cat',col:'#3a8fc4',love:'art'};O.showMap();});await sleep(300);
 ok('test clock is daytime (fake clock, #89)',await p.evaluate(()=>{const h=new Date().getHours();return h>=9&&h<=17;}));
 ok('no path before Oren chooses',await p.evaluate(()=>window.TAL.S().daily.t.length===0&&!!document.querySelector('#sHome .dchoice')));
 await p.evaluate(()=>window.TAL.chooseDay('math'));await sleep(200);
 // create parent
 await p.click('#sHome .parbtn');await p.fill('#pw1','abcd');await p.fill('#pw2','abcd');await p.keyboard.press('Enter');await sleep(300);
 // missions tab: today controls
 await p.evaluate(()=>window.TAL.parentPanel('plan'));await sleep(200);
 const t0=await p.evaluate(()=>window.TAL.S().daily.t.slice());
 await p.locator('.tdrow').nth(1).click();await sleep(50);await p.locator('.tdrow').nth(1).locator('.pchip',{hasText:'▲'}).click();await sleep(100);const t1=await p.evaluate(()=>window.TAL.S().daily.t.slice());ok('reorder today',t1[0]===t0[1]&&t1[1]===t0[0],JSON.stringify([t0,t1]));
 await p.locator('.tdrow').nth(2).locator('.pchip',{hasText:'✕'}).click();await sleep(100);ok('remove step',await p.evaluate(n=>window.TAL.S().daily.t.length===n-1,t0.length));
 await p.locator('#sPar .pchip',{hasText:'הוספת נושא'}).click();await p.locator('#sPar .pdtops .pchip',{hasText:'חשבון'}).click();await sleep(100);ok('add step',await p.evaluate(n=>window.TAL.S().daily.t.length===n,t0.length));
 // template with specific activity
 await p.evaluate(()=>window.TAL.parentPanel('tmpl'));await sleep(150);
 await p.evaluate(()=>{const s=document.querySelectorAll('#sPar .psel');s[1].value='act:art-mix';s[1].dispatchEvent(new Event('change'));});await p.locator('#sPar .bigbtn',{hasText:'שמירת התבנית'}).click();await sleep(1100);
 ok('template saved with specific activity',await p.evaluate(()=>JSON.stringify(window.TAL.S().set.plan).includes('act:art-mix')));
 const nd=await p.evaluate(()=>{delete window.TAL.S().daily;return window.TAL.dailyEnsure().t;});ok('new day uses template',nd[1]==='art-mix',JSON.stringify(nd));
 // time tab
 await p.evaluate(()=>window.TAL.parentPanel('time'));await sleep(200);await p.evaluate(()=>document.querySelectorAll('#sPar details').forEach(d=>d.open=true));await p.locator('#sPar .psec',{hasText:'הגבלה קבועה'}).locator('.pchip',{hasText:/^30$/}).click();await sleep(100);
 ok('daily limit set',await p.evaluate(()=>window.TAL.S().set.lim.daily===30));
 await p.locator('#sPar .bigbtn',{hasText:'+15'}).click();await sleep(100);ok('today +15',await p.evaluate(()=>window.TAL.S().set.lim.today.min===45));
 await p.evaluate(()=>document.querySelectorAll('#sPar details').forEach(d=>d.open=true));await p.locator('#sPar .pchip',{hasText:'כמו כל יום'}).click();await sleep(100);
 await p.locator('#sPar .bigbtn',{hasText:'יציאה'}).click();await sleep(300);
 ok('the top bar shows the time left',(await p.textContent('#hud .tpill')).includes('30 דַּקּוֹת'));
 // the last 5 minutes
 await p.evaluate(()=>{window.__toasts=[];new MutationObserver(m=>m.forEach(r=>r.addedNodes.forEach(n=>{if(n.classList&&n.classList.contains('toast'))window.__toasts.push(n.textContent);}))).observe(document.body,{childList:true});const T=window.TAL,O=window.OREN;T.S().time[O.today()]=26*60;});await sleep(2600);ok('last 5 minutes: the pill turns orange',await p.evaluate(()=>document.querySelector('#hud .tpill').classList.contains('low')));
 // time up
 await p.evaluate(()=>{const T=window.TAL,O=window.OREN;T.S().time[O.today()]=31*60;});await sleep(5600);ok('time-up lock shown',await p.locator('.tlock').count()===1);ok('#8 time lock: the parent button is small and plain ("להורים", no nikud)',await p.evaluate(()=>{const b=document.querySelector('.tlock .bigbtn.tpb');return !!b&&b.textContent.includes('להורים')&&parseFloat(getComputedStyle(b).fontSize)<18;}));
 await L.shot(p,{path:L.SHOTDIR+'/timeup.png'});
 await p.evaluate(()=>{window.OREN.showMap();document.querySelector('#ov').hidden=true;});await sleep(5600);ok('lock persists (kid cannot dismiss)',await p.locator('.tlock').count()===1);
 await p.locator('.tlock .bigbtn').click();await sleep(150);await p.locator('#pw1').click();await p.keyboard.type('abcd');await p.keyboard.press('Enter');await sleep(200);await p.locator('#ov .bigbtn',{hasText:'+20'}).click();await sleep(300);
 ok('parent adds time → unlocked',await p.locator('.tlock').count()===0&&await p.evaluate(()=>window.TAL.S().set.lim.today.min===51));
 await sleep(5600);ok('stays unlocked after adding time',await p.locator('.tlock').count()===0);
 // bedtime
 await p.evaluate(()=>{const l=window.TAL.S().set.lim;l.bed=new Date().getHours();l.bedOff=null;});await sleep(5600);ok('bedtime lock',await p.locator('.tlock').count()===1&&(await p.textContent('.tlock')).includes('לָנוּחַ'));
 ok('no errors',!errs.length,errs.join('|'));await b.close();L.finish('time-missions-'+L.variant,res);})();
