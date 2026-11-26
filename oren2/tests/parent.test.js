// Users, parent password, permissions, parts on/off, gradual unlock, skip/reset, messages, badges, plan, reset.
const L = require('./lib');
const {chromium}=require('playwright');const URL=L.URL;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const VP=process.argv[2]==='phone'?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1366,height:720}};
const res=[];const ok=(n,c,i='')=>res.push((c?'PASS ':'FAIL ')+n+(i?' — '+i:''));
(async()=>{const b=await chromium.launch();const ctx=await b.newContext(VP);
 await ctx.addInitScript(()=>{try{localStorage.clear()}catch(e){};window.__fast=true;setInterval(()=>{const c=document.querySelector('#ov:not([hidden]) .pchoice .ucard.par');if(c)c.click();},80);window.__ps={dictation:'prompt',db:'granted',user:'granted'};
   window.claude={use:async n=>n==='permissions'?{state:async x=>x?(window.__ps[x]||'unavailable'):{...window.__ps},request:async()=>{window.__req=(window.__req||0)+1;for(const k in window.__ps)if(window.__ps[k]==='prompt')window.__ps[k]='granted';return {...window.__ps};},manage:async()=>{}}
     :n==='dictation'?{onFinal(){},onPartial(){},onState(){},start:async()=>{},stop(){}}:null};});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts|ERR_|Failed to load/.test(m.text()))errs.push('console: '+m.text());});
 const shot=n=>L.shot(p,{path:L.SHOTDIR+'/u-'+(process.argv[2]||'d')+'-'+n+'.png'});
 await p.goto(URL);await L.noCoach(p);await sleep(600);
 ok('start: two user cards',await p.locator('.users .ucard').count()===2);await shot('start');
 // first parent login = create password
 await p.click('.ucard.par');await sleep(150);ok('first time asks to create password',(await p.textContent('#ov h2')).includes('יצירת'));
 await p.fill('#pw1','ab');await p.fill('#pw2','ab');await p.keyboard.press('Enter');await sleep(100);ok('short password rejected',(await p.textContent('#pgErr')).length>0);
 await p.fill('#pw1','sod1234');await p.fill('#pw2','sod1234');await p.keyboard.press('Enter');await sleep(400);
 ok('panel opens after creating password',await p.evaluate(()=>!document.querySelector('#sPar').hidden));
 ok('password stored as hash',await p.evaluate(()=>/^[0-9a-f]{64}$/.test(window.TAL.S().set.pw)));
 await sleep(300);ok('summary warns about pending permission',await p.locator('.pwarn',{hasText:'הרשאות'}).count()===1);await shot('sum');
 for(const t of ['perm','parts','prog','msg','set']){await p.evaluate(t=>window.TAL.parentPanel(t),t);await sleep(250);await shot(t);}
 // permissions
 await p.evaluate(()=>window.TAL.parentPanel('perm'));await sleep(300);const rows=await p.locator('#sPar .pst').allTextContents();ok('permission rows shown',rows.length>=3,rows.join(','));
 await p.locator('#sPar .bigbtn',{hasText:'אפשרו'}).click();await sleep(400);ok('request-all called and states refreshed',await p.evaluate(()=>window.__req===1&&window.__ps.dictation==='granted'));
 ok('after grant: all-approved note',(await p.textContent('#sPar')).includes('כל ההרשאות מאושרות'));
 // exit and wrong password
 await p.locator('#sPar .bigbtn',{hasText:'יציאה'}).click();await sleep(300);
 ok('exit lands on home with parent button',await p.evaluate(()=>!document.querySelector('#sHome').hidden)&&await p.locator('#sHome .parbtn').count()===1);
 await p.evaluate(()=>window.OREN.showJourney());ok('journey has no reset button',await p.locator('#sMap .reset').count()===0);await p.evaluate(()=>window.OREN.showMap());
 await p.click('#sHome .parbtn');await sleep(150);await p.fill('#pw1','nope');await p.keyboard.press('Enter');await sleep(150);ok('wrong password refused',(await p.textContent('#pgErr')).includes('שגויה')&&await p.evaluate(()=>document.querySelector('#sPar').hidden));
 // forgot
 await p.click('.plink');await sleep(100);await p.fill('#fq','100');await p.keyboard.press('Enter');ok('forgot: wrong answer refused',(await p.textContent('#pgErr')).includes('לא'));
 await p.fill('#fq','888');await p.keyboard.press('Enter');await sleep(100);ok('forgot: back to create password',(await p.textContent('#ov h2')).includes('יצירת'));
 await p.fill('#pw1','new123');await p.fill('#pw2','new123');await p.keyboard.press('Enter');await sleep(300);ok('new password works',await p.evaluate(()=>!document.querySelector('#sPar').hidden));
 // parts: disable building, activity, world
 const r1=await p.evaluate(async()=>{const T=window.TAL,O=window.OREN,st=T.S().set;st.hide.lab=1;st.offA['read-first']=1;st.offW.add=1;T.S().prof=null;
   T.openHub();await new Promise(r=>setTimeout(r,200));const wiz=!!document.querySelector('.profg');
   for(let k=0;k<2;k++){document.querySelector('.pfb').click();await new Promise(r=>setTimeout(r,80));}
   const prof=JSON.stringify(T.S().prof);document.querySelector('#sTal .bigbtn').click();await new Promise(r=>setTimeout(r,250));
   const head=!!document.querySelector('.hhead .hbub');const fav=!!document.querySelector('.gdoor.fav');const names=[];T.GROUPS.forEach(g=>{T.openGroup(g);document.querySelectorAll('#sTal .bld .nm').forEach(e=>names.push(e.textContent));});
   T.openBuilding(T.BUILD.find(b=>b.id==='read'));const acts=[...document.querySelectorAll('.actc .an')].map(e=>e.textContent);
   O.showJourney();await new Promise(r=>setTimeout(r,200));const hiddenCards=[...document.querySelectorAll('.worlds > .wcard2')].filter(c=>c.hidden).length;
   const d=T.dailyEnsure();return {wiz,prof,lab:names.some(n=>n.replace(/[\u0591-\u05C7]/g,'')==='המעבדה'),head,fav,first:acts.some(a=>a.includes('אוֹת רִאשׁוֹנָה')),hiddenCards,daily:d.t.some(id=>id.startsWith('sci-')||id==='read-first')};});
 ok('profile wizard on first hub visit (no animal: the friend is the studio pet)',r1.wiz&&r1.prof.includes('love')&&!r1.prof.includes('"an"'),r1.prof);ok('favourite door marked',r1.fav);
 ok('disabled building hidden',!r1.lab);ok('disabled activity hidden',!r1.first);ok('disabled world hidden on map',r1.hiddenCards===1);ok('daily missions skip disabled parts',!r1.daily);
 await shot('hubp');
 // gradual
 const r2=await p.evaluate(async()=>{const T=window.TAL,st=T.S().set;st.hide={};st.offA={};st.grad={on:1,every:2,base:(window.OREN.save.days||[]).length,extra:0,seen:2};T.openHub();await new Promise(r=>setTimeout(r,150));
   const stt=T.BUILD.map(b=>T.bState(b));const locked=stt.filter(x=>x!=='on').length,open=stt.filter(x=>x==='on').length;const lb=T.BUILD.filter(b=>T.bState(b)!=='on');const lbl='🔒 '+T.bState(lb[0]).lock;
   window.TAL_locked(lb[3]);await new Promise(r=>setTimeout(r,100));const ov=!document.querySelector('#ov').hidden;return {locked,open,lbl,ov};});
 ok('gradual: 2 open, rest locked',r2.open===2&&r2.locked===11,JSON.stringify(r2));
 await shot('locked');await p.locator('#ov .bigbtn',{hasText:'פּוֹתֵחַ'}).click();await sleep(150);await p.fill('#pw1','new123');await p.keyboard.press('Enter');await sleep(300);
 ok('parent opens a locked building on request',await p.evaluate(()=>window.TAL.BUILD.filter(b=>window.TAL.bState(b)==='on').length)===3);
 ok('new building celebrated',await p.evaluate(()=>(window.TAL.S().set.grad.seen|0)===3));
 await p.evaluate(()=>{window.TAL.S().set.grad.on=0;});
 // progress: skip & reset world
 const r3=await p.evaluate(()=>{const T=window.TAL,O=window.OREN;T.parentPanel('prog');const row=document.querySelectorAll('#sPar .psec')[0].querySelectorAll('.prow')[1];const sk=row.querySelectorAll('.practs .pchip')[0];sk.click();sk.click();
   const w=O.WORLDS[1];const done=w.levels.every(l=>O.stars(l.id)>0);const row2=document.querySelectorAll('#sPar .psec')[0].querySelectorAll('.prow')[1];const rs=row2.querySelectorAll('.practs .pchip')[1];rs.click();rs.click();const cleared=w.levels.every(l=>!O.stars(l.id));return {done,cleared};});
 ok('skip world marks levels',r3.done);ok('reset world clears stars',r3.cleared);
 // message
 await p.evaluate(()=>window.TAL.parentPanel('msg'));await p.fill('#sPar textarea','אורן, כל הכבוד! אוהבים אותך');await p.locator('#sPar .bigbtn',{hasText:'שליחה'}).click();await sleep(200);
 const g0=await p.evaluate(()=>window.OREN.save.gems|0);await p.locator('#sPar .bigbtn',{hasText:'יציאה'}).click();await sleep(1200);
 ok('kid sees the message on home',await p.evaluate(()=>!document.querySelector('#ov').hidden&&document.querySelector('.pmsg')&&document.querySelector('.pmsg').textContent.includes('כל הכבוד')));await shot('msg-kid');
 await p.locator('#ov .emo').first().click();await sleep(200);const r4=await p.evaluate(()=>({g:window.OREN.save.gems|0,m:window.TAL.S().set.msg}));ok('reply (no gift: P2 dropped the gift chips)',r4.m.seen&&r4.m.reply==='❤️'&&r4.g===g0,JSON.stringify(r4));
 await p.evaluate(()=>window.TAL.parentPanel('msg'));ok('parent sees reply',(await p.textContent('#sPar')).includes('אורן הגיב'));
 // badges
 await p.evaluate(()=>{window.TAL.S().tl['read-pw']={s:2,n:1};window.OREN.showMap();});await sleep(4600);ok('badge earned quietly',await p.evaluate(()=>!!window.TAL.S().bdg.star1));
 await p.evaluate(()=>window.TAL.badges(()=>{}));await sleep(200);ok('badge wall',await p.locator('.bdg.got').count()>=1);await shot('badges');
 // daily swap
 ok('kid home has no swap buttons (simple)',await p.evaluate(()=>{window.OREN.showMap();return document.querySelectorAll('#sHome .dsw,#sHome .merow').length===0;}));
 // call parents when permission is not granted
 const r6=await p.evaluate(async()=>{window.__ps.dictation='prompt';window.TAL.ACT['read-voice'].run(()=>{});await new Promise(r=>setTimeout(r,400));return !document.querySelector('#ov').hidden&&document.querySelector('#ov h2').textContent;});
 ok('kid told to call parents for microphone',String(r6).includes('קְרָא'),String(r6));await shot('callp');
 await p.locator('#ov .bigbtn',{hasText:'הוֹרֶה'}).click();await sleep(100);await p.fill('#pw1','new123');await p.keyboard.press('Enter');await sleep(300);ok('parent approves → permission requested',await p.evaluate(()=>window.__ps.dictation==='granted'&&window.__req>=2));
 // reset keeps password & profile
 const r7=await p.evaluate(()=>{const pw=window.TAL.S().set.pw;window.TAL.parentPanel('prog');const b=[...document.querySelectorAll('#sPar .pchip')].find(x=>x.textContent.includes('איפוס כל'));b.click();b.click();const s=window.OREN.save;return {pw:s.set&&s.set.pw===pw,prof:!!s.prof,gems:s.gems|0,tl:Object.keys(s.tl||{}).length};});
 ok('full reset keeps password+profile, wipes progress',r7.pw&&r7.prof&&r7.gems===0&&r7.tl===0,JSON.stringify(r7));
 const r8=await p.evaluate(async()=>{const T=window.TAL,O=window.OREN;T.S().set.plan=['math','read','mind'];delete T.S().daily;O.showMap();await new Promise(r=>setTimeout(r,300));
   const steps=document.querySelectorAll('.today .tstep2').length;const d=T.S().daily;const ok2=d.t[0]==='math'&&T.ACT[d.t[1]].b.id==='read'&&T.ACT[d.t[2]].b.id==='mind';
   const doors=document.querySelectorAll('#sHome .door').length;T.otherDay();await new Promise(r=>setTimeout(r,100));document.querySelector('#sTal .door.city').click();await new Promise(r=>setTimeout(r,200));const groups=document.querySelectorAll('.gdoor').length;
   const homeBtn=!document.querySelector('#btnHome').hidden;T.openBuilding(T.BUILD[0]);await new Promise(r=>setTimeout(r,100));const homeBtn2=!document.querySelector('#btnHome').hidden;document.querySelector('#btnHome').click();await new Promise(r=>setTimeout(r,200));
   const back=!document.querySelector('#sHome').hidden;document.querySelector('.today .bigbtn').click();await new Promise(r=>setTimeout(r,300));const math=!document.querySelector('#sPlay').hidden||!document.querySelector('#sLearn').hidden||!document.querySelector('#sWorld').hidden;
   window.TAL.parentPanel('voice');const v=document.querySelector('#sPar').textContent.includes('Kore');window.TAL.parentPanel('plan');const pl=document.querySelectorAll('#sPar .plrow').length;
   return {steps,ok2,doors,groups,homeBtn,homeBtn2,back,math,v,pl};});
 ok('home: plan respected, no doors on home (inside "something else"), grouped city, home button, continue starts math, voice+plan tabs',r8.steps===3&&r8.ok2&&r8.doors===0&&r8.groups===4&&!r8.homeBtn&&r8.homeBtn2&&r8.back&&r8.math&&r8.v&&r8.pl===3,JSON.stringify(r8));
 await p.evaluate(()=>{window.TAL.parentPanel('voice');});await sleep(200);await shot('voice');await p.evaluate(()=>{window.OREN.showMap();});await sleep(300);await shot('home');
 // #7 simplicity P2: the parent panel (G8: one action per row, details on tap, no prose by default, hide empty sections)
 const vis=e=>!!e&&e.checkVisibility();
 const s1=await p.evaluate(()=>{const T=window.TAL,O=window.OREN;T.S().time[O.today()]=1260;T.parentPanel('sum');const b=document.querySelector('#sPar .pbody');
   const top=[...b.children].filter(e=>e.checkVisibility()&&!e.matches('details,.pwarn'));const det=b.querySelector(':scope > details.pdet:not(.piss)');
   return {top:top.map(e=>e.className),lines:b.querySelectorAll(':scope > .psum .psl').length,txt:(b.querySelector('.psum')||{}).textContent||'',det:det&&det.querySelector('summary').textContent,open:det&&det.open,tiles:!!b.querySelector('.ptiles')&&b.querySelector('.ptiles').checkVisibility()};});
 ok('P2 sum: 3 lines (minutes, streak, today), the rest in a closed "פירוט מלא"',s1.top.length===1&&s1.lines===3&&/21 דק/.test(s1.txt)&&/רצף/.test(s1.txt)&&s1.det&&s1.det.includes('פירוט מלא')&&!s1.open&&!s1.tiles,JSON.stringify(s1));
 const s2=await p.evaluate(()=>{window.TAL.parentPanel('try');const d=document.querySelector('#sPar details[open] .pdin');const bs=[...d.querySelectorAll('button')].filter(x=>x.checkVisibility());return bs.map(x=>x.textContent.trim());});
 ok('P2 try: just 2 buttons "לשחק כהורה" / "להתחיל מחדש"',s2.length===2&&s2[0].includes('לשחק כהורה')&&s2[1].includes('להתחיל מחדש'),JSON.stringify(s2));
 const s2b=await p.evaluate(async()=>{const O=window.OREN;localStorage.setItem('oren4-v1-parent',JSON.stringify(Object.assign({},O.save,{gems:3})));
   [...document.querySelectorAll('#sPar .pdin button')].find(x=>x.textContent.includes('להתחיל מחדש'))?.click();await new Promise(r=>setTimeout(r,200));const r={pp:O.isParentPlay,gems:O.save.gems};O.parentPlay(false);return r;});
 ok('P2 try: "להתחיל מחדש" enters a fresh parent user',s2b.pp&&s2b.gems===500,JSON.stringify(s2b));
 const s3=await p.evaluate(()=>{const T=window.TAL;T.parentPanel('parts');const sec=[...document.querySelectorAll('#sPar .psec')].find(x=>x.querySelector('h3').textContent==='בניינים ופעילויות');
   const rows=[...sec.querySelectorAll('.pbld')];const chipsVis=[...sec.querySelectorAll('.pacts .pchip')].filter(x=>x.checkVisibility()).length;const togs=rows.map(r=>r.querySelectorAll(':scope > .pchip').length);
   rows[0]?.querySelector('.pbn')?.click();const sec2=[...document.querySelectorAll('#sPar .psec')].find(x=>x.querySelector('h3').textContent==='בניינים ופעילויות');
   const after=[...sec2.querySelectorAll('.pacts .pchip')].filter(x=>x.checkVisibility()).length;return {n:rows.length,b:T.BUILD.length,togs,chipsVis,after,first:T.BUILD[0].acts.length};});
 ok('P2 parts: one toggle per building, activity chips only after tapping the building',s3.n===s3.b&&s3.togs.every(x=>x===1)&&s3.chipsVis===0&&s3.after===s3.first,JSON.stringify(s3));
 const s4=await p.evaluate(()=>{window.TAL.parentPanel('prog');const rows=[...document.querySelectorAll('#sPar .psec .prow')].filter(r=>r.querySelector('.pmore'));const vis=rows.map(r=>[...r.querySelectorAll('button')].filter(x=>x.checkVisibility()).length);
   const resets=[...document.querySelectorAll('#sPar button')].filter(x=>x.checkVisibility()&&/איפוס/.test(x.textContent));const all=[...document.querySelectorAll('#sPar .pbody button')].filter(x=>x.checkVisibility());
   rows[0]?.querySelector('.pmore')?.click();const r0=[...document.querySelectorAll('#sPar .psec .prow')].filter(r=>r.querySelector('.pmore'))[0];
   return {rows:rows.length,vis,resets:resets.map(x=>x.textContent),last:(all[all.length-1]||{}).textContent||'',opened:[...(r0||document.createElement('i')).querySelectorAll('button')].filter(x=>x.checkVisibility()).map(x=>x.textContent)};});
 ok('P2 prog: one "⋯" per row, actions behind it, one reset at the bottom',s4.rows>=10&&s4.vis.every(x=>x===1)&&s4.resets.length===1&&s4.last.includes('איפוס כל')&&s4.opened.some(t=>t.includes('דילוג'))&&s4.opened.some(t=>t.includes('איפוס')),JSON.stringify(s4));
 const s5=await p.evaluate(()=>{window.TAL.parentPanel('voice');const d=document.querySelector('#sPar details[open] .pdin');const help=d&&d.querySelector('details.pdet');const notes=[...(d||document).querySelectorAll('.pnote')].filter(x=>x.checkVisibility()).length;
   return {help:help&&help.querySelector('summary').textContent,open:help&&help.open,notes,inHelp:help&&help.querySelectorAll('.pnote').length};});
 ok('P2 voice: explanation in a closed "עזרה"',s5.help&&s5.help.includes('עזרה')&&!s5.open&&s5.notes===0&&s5.inHelp>=1,JSON.stringify(s5));
 const s6=await p.evaluate(()=>{const c=window.claude;window.__site=1;delete window.claude;window.TAL.parentPanel('more');const t=[...document.querySelectorAll('#sPar summary')].map(x=>x.textContent);window.claude=c;
   window.TAL.parentPanel('more');const t2=[...document.querySelectorAll('#sPar summary')].map(x=>x.textContent);delete window.__site;return {site:t.some(x=>x.includes('הרשאות')),app:t2.some(x=>x.includes('הרשאות'))};});
 ok('P2 perm: hidden on the website (nothing to approve), shown inside Claude',!s6.site&&s6.app,JSON.stringify(s6));
 const s7=await p.evaluate(()=>{const P=window.TAL.parentPanel;P('day');const day=document.querySelector('#sPar .pbody').textContent;P('more');const sm=[...document.querySelectorAll('#sPar summary')].map(x=>x.textContent).join('|');
   P('health');const hs=!!document.querySelector('#sPar details[open] .psec')&&/הפסקות, ארוחות/.test(document.querySelector('#sPar details[open]').textContent);P('read');const rd=/קורא לבד/.test((document.querySelector('#sPar details[open]')||{}).textContent||'');
   return {dayHealth:/הפסקות, ארוחות/.test(day),dayRead:/קורא לבד/.test(day),dayRem:/תזכורת לאורן/.test(day),sm,hs,rd};});
 ok('P2 day: break/meal settings and reading level moved to settings; today stays',!s7.dayHealth&&!s7.dayRead&&s7.dayRem&&s7.hs&&s7.rd,JSON.stringify(s7));
 const s8=await p.evaluate(()=>{window.TAL.parentPanel('msg');const d=document.querySelector('#sPar details[open] .pdin');return {chips:d.querySelectorAll('.pchip').length,gift:/מתנה|💎/.test(d.textContent)};});
 ok('P2 msg: no gift chips',s8.chips===0&&!s8.gift,JSON.stringify(s8));
 ok('no JS errors',!errs.length,errs.slice(0,5).join(' | '));
 await b.close();L.finish('parent-'+L.variant,res);})();
