// The day's path: "what do you feel like today?" choice, something else, together time (parent and Oren initiated),
// real-world missions, fewer rewards, the first-time tour, family merge of the new save keys.
const L = require('./lib');
const {chromium}=require('playwright');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const res=[];const ok=(n,c,i='')=>res.push((c?'PASS ':'FAIL ')+n+(i?' — '+i:''));
(async()=>{const b=await chromium.launch();const ctx=await b.newContext(L.VIEWPORT);await ctx.addInitScript(()=>{try{localStorage.clear()}catch(e){};window.__fast=true;window.__noFamily=true;});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(L.URL);await p.waitForFunction(()=>window.TAL&&window.TAL.S);await sleep(300);
 const home=()=>p.evaluate(()=>window.OREN.showMap());
 // --- first-time tour ---
 await p.evaluate(()=>{const O=window.OREN,T=window.TAL;O.save.story.intro=1;T.S().prof={an:'cat',col:'#3a8fc4',love:'art'};O.showMap();});await sleep(1200);
 ok('tour starts on the first home visit',await p.locator('.tour').count()===1);
 let n=0;while(await p.locator('.tour').count()&&n<30){await p.locator('.tour').click({position:{x:5,y:5}});n++;await sleep(120);}
 ok('tour: 3 short steps, one tap each, then gone',n===3&&await p.locator('.tour').count()===0,'taps '+n);
 await home();await sleep(1200);ok('tour shows only once',await p.locator('.tour').count()===0&&await p.evaluate(()=>window.TAL.S().coach.tour===1));
 await p.locator('#sHome .hpair').click();await sleep(300);ok('tapping the friend opens two choices',await p.locator('#ov .tpch .bigbtn').count()===2);await p.locator('#ov .tpch .bigbtn').first().click();await sleep(300);ok('the first choice replays the tour',await p.locator('.tour').count()===1);
 await p.evaluate(()=>window.OREN.showMap());await sleep(200);ok('leaving home ends the tour',await p.locator('.tour').count()===0);
 await L.noCoach(p);
 // --- the day choice, from enabled parts only ---
 await p.evaluate(()=>{const st=window.TAL.S().set;st.hide.lab=1;st.hide.art=1;st.offA=st.offA||{};st.offA['read-pw']=1;window.TAL.S().last={id:'write-trace',d:'2000-01-01'};});await home();await sleep(300);
 const c=await p.evaluate(()=>({cards:document.querySelectorAll('#sHome .dchoice .dcard').length,cont:document.querySelectorAll('#sHome .dcard.cont').length,more:!!document.querySelector('#sHome .dmore'),big:!!document.querySelector('#sHome .bigbtn.huge'),bub:document.querySelector('#sHome .hbub2').textContent,doors:document.querySelectorAll('#sHome .doors2 .door').length}));
 ok('home asks "what do you feel like today?" with 3 cards + something else; the doors live inside "something else"',c.cards===3&&c.more&&!c.big&&c.bub.includes('מָה בָּא לְךָ הַיּוֹם')&&c.doors===0,JSON.stringify(c));
 ok('one card continues where Oren stopped',c.cont===1);
 await p.evaluate(()=>{const d=window.TAL.S().daily;d.o=['explore','math','readg','create','calm'];});await home();await sleep(200);
 await p.locator('#sHome .dcard:not(.cont)').first().click();await sleep(300);
 const d1=await p.evaluate(()=>{const T=window.TAL,d=T.S().daily;const off=new Set(['lab','art']);return {t:d.t,ch:d.ch,bad:d.t.filter(id=>T.ACT[id]&&(off.has(T.ACT[id].b.id)||id==='read-pw')).length,inDom:d.t.filter(id=>T.ACT[id]&&T.GROUPS.find(g=>g.id==='explore').ids.includes(T.ACT[id].b.id)).length,dom:T.S().dom,path:document.querySelectorAll('#sHome .tpath .tstep2').length,go:!!document.querySelector('#sHome .bigbtn.huge')};});
 ok('choice builds 3 steps in the domain + 1 surprise, only enabled parts',d1.ch==='explore'&&d1.t.length===4&&d1.inDom>=3&&d1.bad===0,JSON.stringify(d1));
 ok('then the usual path with one big button',d1.path===4&&d1.go);ok('balancing remembers the chosen domain',d1.dom&&d1.dom.explore>0);
 // continue card + no math when all worlds are off
 await p.evaluate(()=>{const T=window.TAL,O=window.OREN;delete T.S().daily;O.WORLDS.forEach(w=>T.S().set.offW[w.id]=1);});await home();await sleep(200);
 await p.locator('#sHome .dcard.cont').click();await sleep(200);
 const d2=await p.evaluate(()=>window.TAL.S().daily.t);ok('"continue" starts with the last activity, no math when worlds are off',d2[0]==='write-trace'&&!d2.includes('math'),JSON.stringify(d2));
 // --- something else ---
 await p.evaluate(()=>{const T=window.TAL;delete T.S().daily;T.S().set.offW={};});await home();await sleep(200);
 await p.locator('#sHome .dmore').click();await sleep(300);
 const o=await p.evaluate(()=>({names:[...document.querySelectorAll('#sTal .dall .dcard b')].map(x=>x.textContent)}));
 const exp=await p.evaluate(()=>{const T=window.TAL;return T.BUILD.filter(b=>T.dailyPool().some(id=>T.ACT[id].b===b)).length+2;});
 ok('something else lists every enabled world/building + together',o.names.length===exp&&!o.names.some(n=>/מַעְבָּדָה|אָמָּנוּת/.test(n))&&o.names.some(n=>n.includes('אַבָּא')),JSON.stringify(o.names));
 await p.locator('#sTal .dall .dcard',{hasText:'אַבָּא'}).click();await sleep(300);
 const d3=await p.evaluate(()=>{const d=window.TAL.S().daily;return {t:d.t,ch:d.ch,lead:window.TAL.TOG.find(a=>'tog:'+a.k===d.t[0]).lead};});
 ok('"together" from something else: an Oren-led together step + 2 surprises',d3.ch==='tog'&&/^tog:/.test(d3.t[0])&&d3.lead===1&&d3.t.length===3,JSON.stringify(d3));
 // --- together screen ---
 await p.locator('#sHome .bigbtn.huge').click({force:true});await sleep(300);
 const ts=await p.evaluate(()=>({kid:document.querySelector('#sTal .tspec .lsent').textContent,par:document.querySelector('#sTal .tpar').textContent,btn:[...document.querySelectorAll('#sTal .tspec .bigbtn')].map(b=>b.textContent)}));
 ok('together screen: kid text with nikud, parent line without nikud, one "we finished" button',/[ְ-ּ]/.test(ts.kid)&&ts.par.startsWith('להורה:')&&!/[ְ-ּ]/.test(ts.par)&&ts.btn.length===1&&ts.btn[0].includes('סִיַּמְנוּ'),JSON.stringify(ts));
 await p.locator('#sTal .tspec .bigbtn').click();await sleep(300);ok('finishing returns home with the step done',await p.evaluate(()=>window.TAL.S().daily.done[0]===1&&!document.querySelector('#sHome').hidden));
 // --- parent: "I have time now" ---
 await p.click('#sHome .parbtn');await p.fill('#pw1','abcd');await p.fill('#pw2','abcd');await p.keyboard.press('Enter');await sleep(300);
 await p.locator('.pchoice .ucard.tog').click();await sleep(200);
 const chips=await p.locator('#ov .togp .pchip').count();ok('parent sees ~10 joint activities + surprise',chips>=11,String(chips));
 const nx0=await p.evaluate(()=>window.TAL.S().daily.done.findIndex(x=>!x));
 await p.locator('#ov .togp .pchip',{hasText:'דו-קרב'}).click();await sleep(300);
 const d4=await p.evaluate(()=>{const d=window.TAL.S().daily;const nx=d.done.findIndex(x=>!x);return {next:d.t[nx],nx,home:!document.querySelector('#sHome').hidden,cur:(document.querySelector('#sHome .tstep2.cur')||{}).className};});
 ok('"I have time now" inserts 🤝 as the NEXT step and returns home',d4.next==='tog:duel'&&d4.nx===nx0&&d4.home&&/tog/.test(d4.cur||''),JSON.stringify(d4));
 // --- Oren-initiated: after the path the friend suggests time together ---
 await p.evaluate(()=>{const d=window.TAL.S().daily;d.t=d.t.filter(x=>!/^tog:/.test(x));d.done=d.t.map(()=>1);d.claimed=0;d.sg=0;window.OREN.showMap();});await sleep(200);
 ok('end of path: the story ending, no prize',await p.locator('#sHome .bigbtn.huge',{hasText:'סוֹף הַסִּפּוּר'}).count()===1&&!/פְּרָס/.test(await p.textContent('#sHome')));
 const g0=await p.evaluate(()=>window.OREN.save.gems|0);
 await p.locator('#sHome .bigbtn.huge').click({force:true});await sleep(300);
 ok('story finale, no gems',await p.locator('#ov .qwin').count()===1&&await p.locator('#ov .gain').count()===0&&await p.evaluate(g=>(window.OREN.save.gems|0)===g,g0));
 await p.locator('#ov .bigbtn').click();await sleep(300);
 ok('the friend suggests playing with a parent',(await p.textContent('#ov')).includes('רוֹצֶה לְשַׂחֵק עִם אַבָּא אוֹ אִמָּא'));
 await p.locator('#ov .bigbtn',{hasText:'זְמַן'}).click();await sleep(300);
 const d5=await p.evaluate(()=>{const T=window.TAL,d=T.S().daily;const nx=d.done.findIndex(x=>!x);const a=T.TOG.find(x=>'tog:'+x.k===d.t[nx]);return {id:d.t[nx],lead:a&&a.lead,go:!!document.querySelector('#sHome .bigbtn.huge')};});
 ok('yes adds an Oren-led 🤝 step',/^tog:/.test(d5.id||'')&&d5.lead===1&&d5.go,JSON.stringify(d5));
 await p.evaluate(()=>{const d=window.TAL.S().daily;d.done=d.t.map(()=>1);window.OREN.showMap();});await sleep(200);
 await p.locator('#sHome .bigbtn.huge').click({force:true}).catch(()=>{});await sleep(200);ok('suggestion only once a day',!(await p.evaluate(()=>!!document.querySelector('#ov')&&!document.querySelector('#ov').hidden&&document.querySelector('#ov').textContent.includes('רוֹצֶה לְשַׂחֵק'))));
 await p.evaluate(()=>{document.querySelector('#ov').hidden=true;});
 // --- real-world missions ---
 const r1=await p.evaluate(()=>{const O=window.OREN,T=window.TAL,d=T.S().daily;d.t.push('math');d.done.push(0);const nx=d.t.length-1;
   const w=O.WORLDS.find(x=>x.id==='add');w.levels.forEach(l=>O.save.s[l.id]=2);O.emit('levelDone',w.levels[w.levels.length-1],2);return {nx,t:d.t.slice(),done:d.done.slice()};});
 {const nx=r1.done.findIndex(x=>!x);ok('finishing a math world adds its real-world mission as the next step',r1.done[r1.nx]===1&&r1.t[nx]==='rw:add',JSON.stringify(r1));}
 const r2=await p.evaluate(()=>{const T=window.TAL,b=T.BUILD.find(x=>x.id==='think');b.acts.forEach(a=>T.record(a.id,2));return T.S().daily.t.filter(x=>x==='rw:think').length;});
 ok('finishing a city building adds its mission (once)',r2===1);
 await p.evaluate(()=>{const T=window.TAL,b=T.BUILD.find(x=>x.id==='think');T.record(b.acts[0].id,3);});
 ok('no duplicate mission later',await p.evaluate(()=>window.TAL.S().daily.t.filter(x=>x==='rw:think').length===1));
 await p.evaluate(()=>{const d=window.TAL.S().daily;window.TAL_step(d.t.indexOf('rw:add'));});await sleep(300);
 const rw=await p.evaluate(()=>({t:document.querySelector('#sTal .tspec .lsent').textContent,b:document.querySelector('#sTal .tspec .bigbtn').textContent}));
 ok('mission screen: kid text + "I finished" (honor system)',rw.t.includes('מַזְלְגוֹת')&&rw.b.includes('סִיַּמְתִּי'),JSON.stringify(rw));
 await p.locator('#sTal .tspec .bigbtn').click();await sleep(200);ok('mission marked done',await p.evaluate(()=>{const d=window.TAL.S().daily;return d.done[d.t.indexOf('rw:add')]===1;}));
 ok('a mission before the choice waits for the path',await p.evaluate(()=>{const T=window.TAL,O=window.OREN;delete T.S().daily;const d=T.dailyEnsure();
   const w=O.WORLDS.find(x=>x.id==='sub');w.levels.forEach(l=>O.save.s[l.id]=2);O.emit('levelDone',w.levels[0],2);const wait=d.t.length===0&&d.cr.includes('rw:sub');T.chooseDay('math');return wait&&T.S().daily.t.includes('rw:sub');}));
 // --- fewer rewards ---
 await p.evaluate(()=>{window.__toasts=0;new MutationObserver(m=>m.forEach(r=>r.addedNodes.forEach(n=>{if(n.classList&&n.classList.contains('toast'))window.__toasts++;}))).observe(document.body,{childList:true});window.OREN.showMap();});await sleep(4800);
 ok('badges are earned quietly (no toast)',await p.evaluate(()=>window.__toasts===0&&Object.keys(window.TAL.S().bdg||{}).length>0));
 await p.evaluate(()=>window.TAL_arcade(window.OREN.showMap));await sleep(200);
 ok('arcade has no tickets or prize shop',await p.locator('.prize,.tkbig').count()===0&&await p.evaluate(()=>window.__arc.state().tickets===undefined));
 // --- template and "no missions" still work ---
 ok('parent template skips the choice',await p.evaluate(()=>{const T=window.TAL;T.S().set.plan=['math','any'];delete T.S().daily;window.OREN.showMap();const r=!document.querySelector('#sHome .dchoice')&&T.S().daily.ch==='plan'&&T.S().daily.t.length===2;delete T.S().set.plan;return r;}));
 ok('"no daily missions" shows neither choice nor path',await p.evaluate(()=>{const T=window.TAL;T.S().set.noDaily=1;window.OREN.showMap();const r=!document.querySelector('#sHome .dchoice')&&!document.querySelector('#sHome .tpath');T.S().set.noDaily=0;return r;}));
 // --- family merge of the new keys ---
 const m=await p.evaluate(()=>{const O=window.OREN,s=O.save;s.dom={math:5,explore:9};s.rw={add:1};s.coach=Object.assign({},s.coach,{tour:0});
   O.mergeIn({v:4,t:1,dom:{math:7,calm:3},rw:{lab:1},coach:{tour:1}});return {dom:s.dom,rw:s.rw,tour:s.coach.tour};});
 ok('family merge: domains (newest day), missions (union), tour seen (union)',m.dom.math===7&&m.dom.explore===9&&m.dom.calm===3&&m.rw.add===1&&m.rw.lab===1&&m.tour===1,JSON.stringify(m));
 ok('no errors',!errs.length,errs.join('|'));await b.close();L.finish('day-path-'+L.variant,res);})();
