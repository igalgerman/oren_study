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
 const exp=await p.evaluate(()=>{const T=window.TAL;return T.GROUPS.filter(g=>g.ids.some(id=>T.dailyPool().some(a=>T.ACT[a].b.id===id))).length+2;});
 ok('something else: math, the doors with something in them + together (no building list)',o.names.length===exp&&o.names.length<=6&&!o.names.some(n=>/מַעְבָּדָה|אָמָּנוּת/.test(n))&&o.names.some(n=>n.includes('אַבָּא')),JSON.stringify(o.names));
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
 const g0=await p.evaluate(()=>{window.OREN.save.gems=0;return 0;});/* #391: no gems, so no ship choice before the friend's suggestion */
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
 // --- #391 the ship: one place on home that grows by one piece per daily path; the day's gems buy one addition ---
 {const fs=require('fs'),path=require('path');
  const doc=fs.readFileSync(path.join(__dirname,'..','docs','story-mixer.md'),'utf8');
  const script=[...doc.matchAll(/^\| \d+\.\d+ \|.*\| ([^|(]+?) \([^|]*\) \|$/gm)].map(x=>x[1].trim());
  const sp=await p.evaluate(()=>({n:window.SHIP.PIECES.length,names:window.SHIP.PIECES.map(x=>x.n)}));
  ok('ship: 60 pieces in the order of the story script',script.length===60&&sp.n===60&&script.every((x,i)=>x===sp.names[i]),JSON.stringify(sp.names.slice(0,3))+' vs '+JSON.stringify(script.slice(0,3)));
  // old saves: no ship key, or a broken one -> an empty place, no crash
  const old=await p.evaluate(()=>{const O=window.OREN,r=[];for(const v of [undefined,'x',{n:'a',x:5},null]){if(v===undefined)delete O.save.ship;else O.save.ship=v;O.showMap();
    const el=document.querySelector('#sHome .hship');r.push(!!el&&el.querySelectorAll('.shp').length===0&&el.querySelectorAll('.shx').length===0);}return r;});
  ok('ship: an old or broken save shows an empty place on home',old.every(Boolean),JSON.stringify(old));
  // the end of a daily path adds the next piece (once a day), shown on the finale card
  const fin=async(gems)=>{await p.evaluate(g=>{const T=window.TAL,O=window.OREN;delete T.S().daily;T.chooseDay('math');const d=T.S().daily;d.done=d.t.map(()=>1);d.sg=1;O.save.gems=g;document.querySelector('#ov').hidden=true;O.showMap();},gems);await sleep(150);
    await p.locator('#sHome .bigbtn.huge',{hasText:'סוֹף הַסִּפּוּר'}).click({force:true});await sleep(250);};
  await p.evaluate(()=>{delete window.OREN.save.ship;});await fin(0);
  const f1=await p.evaluate(()=>({n:window.SHIP.get().n,card:document.querySelector('#ov .qwin').textContent,pic:!!document.querySelector('#ov .qwin .hship'),gems:window.OREN.save.gems|0}));
  ok('ship: the end of the path adds the first piece, named on the finale card',f1.n===1&&f1.card.includes('קֶרֶשׁ תַּחְתּוֹן')&&f1.pic&&f1.gems===0,JSON.stringify(f1));
  await p.locator('#ov .bigbtn').click();await sleep(250);
  ok('ship: no gems -> no choice, straight home with the piece on the ship',await p.evaluate(()=>document.querySelector('#ov').hidden&&!document.querySelector('#sHome').hidden&&document.querySelectorAll('#sHome .hship .shp').length===1));
  await fin(0);ok('ship: one piece per day only',await p.evaluate(()=>window.SHIP.get().n===1));await p.evaluate(()=>{document.querySelector('#ov').hidden=true;});
  // the next day: the next piece of the script, and the day's gems are spent with ONE tap on 1 of 2-3 additions
  await p.evaluate(()=>{window.OREN.save.ship.d='2000-01-01';});await fin(25);
  const f2=await p.evaluate(()=>({n:window.SHIP.get().n,card:document.querySelector('#ov .qwin').textContent}));
  ok('ship: the next day adds the next piece of the script',f2.n===2&&f2.card.includes('קֶרֶשׁ צַד'),JSON.stringify(f2));
  await p.locator('#ov .bigbtn').click();await sleep(250);
  const pk=await p.evaluate(()=>({btn:document.querySelectorAll('#ov .shpick .bigbtn').length,other:document.querySelectorAll('#ov .bigbtn:not(.shpick .bigbtn),#ov input,#ov select,#ov textarea').length,title:(document.querySelector('#ov h2')||{}).textContent}));
  ok('ship: gems -> one choice of 2-3 additions, nothing else on the card (no typing, no menu)',pk.btn>=2&&pk.btn<=3&&pk.other===0&&/[ְ-ּ]/.test(pk.title||''),JSON.stringify(pk));
  const pick=await p.evaluate(()=>document.querySelector('#ov .shpick .bigbtn').dataset.id);
  await p.locator('#ov .shpick .bigbtn').first().click();await sleep(250);
  const f3=await p.evaluate(()=>({x:window.SHIP.get().x,gems:window.OREN.save.gems|0,cost:window.SHIP.COST,home:!document.querySelector('#sHome').hidden&&document.querySelector('#ov').hidden,shown:document.querySelectorAll('#sHome .hship .shx').length}));
  ok('ship: one tap buys the addition with gems and it shows on the ship at home',f3.x.length===1&&f3.x[0]===pick&&f3.gems===25-f3.cost&&f3.cost>0&&f3.home&&f3.shown===1,JSON.stringify(f3));
  // kid text: nikud, every new sentence in the pregen list
  const kt=await p.evaluate(()=>{const S=window.SHIP,L=new Set(window.TAL.choiceList()),sp=window.TAL.spk;const all=S.says();return {n:all.length,miss:all.filter(x=>!L.has(sp(x))),nonik:all.filter(x=>!/[ְ-ּ]/.test(x))};});
  ok('ship: kid text has nikud and every sentence is in the pregen list',kt.n>=60&&!kt.miss.length&&!kt.nonik.length,JSON.stringify(kt).slice(0,300));
  // saved and restored: a fresh page with this save shows the same ship; family merge keeps the newest
  const saved=await p.evaluate(()=>{window.OREN.persist();return localStorage.getItem('oren4-v1');});
  const ctx2=await b.newContext(L.VIEWPORT);await ctx2.addInitScript(s=>{try{if(!sessionStorage.getItem('k')){localStorage.clear();localStorage.setItem('oren4-v1',s);sessionStorage.setItem('k','1');}}catch(e){};window.__fast=true;window.__noFamily=true;},saved);
  const p2=await ctx2.newPage();p2.on('pageerror',e=>errs.push(e.message));await p2.goto(L.URL);await p2.waitForFunction(()=>window.TAL&&window.TAL.S&&window.SHIP);await sleep(300);
  const rs=await p2.evaluate(()=>{window.OREN.showMap();return {s:window.SHIP.get(),shp:document.querySelectorAll('#sHome .hship .shp').length,shx:document.querySelectorAll('#sHome .hship .shx').length};});
  ok('ship: saved and restored on reload',rs.s.n===2&&rs.s.x.length===1&&rs.shp===2&&rs.shx===1,JSON.stringify(rs));await ctx2.close();
  const mg=await p.evaluate(()=>{const O=window.OREN;O.mergeIn({v:4,t:(+O.save.t||0)+1e6,ship:{n:5,x:['fish'],d:'2000-01-02'}});return window.SHIP.get().n;});
  ok('ship: family merge takes the newest save',mg===5,String(mg));}
 // --- #392 tap a built piece on home: the friend says what it is and how he earned it; a story door shows the item that opens it ---
 {await p.evaluate(()=>{const O=window.OREN;O.save.ship={n:5,x:['fish'],d:'2000-01-02'};window.__said=[];const sy=O.say;O.say=(t,...a)=>{window.__said.push(String(t||''));return sy.call(O,t,...a);};document.querySelector('#ov').hidden=true;O.showMap();});await sleep(200);
  const ln=await p.evaluate(()=>{const S=window.SHIP,L=new Set(window.TAL.choiceList()),sp=window.TAL.spk,NK=/[ְ-ּ]/;
    const pc=S.PIECES.map((_,i)=>S.pieceSay(i)),ex=S.EXTRAS.map(e=>S.extraSay(e.id)),dr=S.PIECES.map((_,i)=>S.doorSay(i)),all=[...pc,...ex,...dr];
    return {n:all.length,what:S.PIECES.every((x,i)=>pc[i].includes(x.n)&&dr[i].includes(x.n))&&S.EXTRAS.every((e,i)=>ex[i].includes(e.n)),
      how:pc.every(x=>/כְּשֶׁ/.test(x))&&ex.every(x=>x.replace(/[\u0591-\u05C7]/g,"").includes("יהלומים")),miss:all.filter(x=>!L.has(sp(x))),nonik:all.filter(x=>!NK.test(x))};});
  ok('#392 every piece type (60 ship pieces + 9 additions) has a friend line: what it is + how he earned it; nikud; all in the pregen list',ln.n===129&&ln.what&&ln.how&&!ln.miss.length&&!ln.nonik.length,JSON.stringify(ln).slice(0,300));
  const tp=await p.evaluate(()=>{const S=window.SHIP,r=[];const els=[...document.querySelectorAll('#sHome .hship .shp,#sHome .hship .shx')];
    for(const el of els){window.__said=[];el.dispatchEvent(new MouseEvent('click',{bubbles:true}));const i=el.dataset.i,x=el.dataset.x,want=i!=null?S.pieceSay(+i):S.extraSay(x);
      const bub=document.querySelector('#sHome .hbub2');r.push({k:i!=null?'p'+i:x,bub:!!bub&&bub.textContent.includes(want),spoke:window.__said.some(t=>t.includes(window.TAL.spk(want)))});}return r;});
  ok('#392 tapping each built piece on home: the friend\'s bubble says its line, with audio',tp.length===6&&tp.every(x=>x.bub&&x.spoke),JSON.stringify(tp));
  // a real tap on the ship drawing always gets a line (the piece under the finger, or the newest one)
  await p.evaluate(()=>{window.__said=[];});await p.locator('#sHome .hship svg').click();await sleep(100);
  ok('#392 a real tap on the ship says a piece line',await p.evaluate(()=>{const S=window.SHIP,b=document.querySelector('#sHome .hbub2').textContent;return window.__said.length>0&&S.PIECES.some((_,i)=>i<5&&b.includes(S.pieceSay(i)))||['fish'].some(x=>b.includes(S.extraSay(x)));}));
  // the story door: the end of today's path shows the ship piece that opens it; tapping it says so
  await p.evaluate(()=>{const T=window.TAL,O=window.OREN;delete T.S().daily;T.chooseDay('math');document.querySelector('#ov').hidden=true;O.showMap();});await sleep(150);
  const dr=await p.evaluate(()=>{const S=window.SHIP,g=document.querySelector('#sHome .tgoal.sdoor');if(!g)return {g:0};window.__said=[];g.click();
    return {g:1,item:g.textContent.includes(S.PIECES[5].n),bub:document.querySelector('#sHome .hbub2').textContent.includes(S.doorSay(5)),spoke:window.__said.some(t=>t.includes(window.TAL.spk(S.doorSay(5))))};});
  ok('#392 a story door at the end of the path shows the item that opens it; a tap says it',dr.g&&dr.item&&dr.bub&&dr.spoke,JSON.stringify(dr));
  const nd=await p.evaluate(()=>{const O=window.OREN;O.save.ship.d=O.today();O.showMap();const a=!document.querySelector('#sHome .tgoal.sdoor')&&!!document.querySelector('#sHome .tgoal');O.save.ship.d='2000-01-02';return a;});
  ok('#392 no door when today\'s piece is already earned (the path goal as before)',nd);}
 // --- #388: inside the path, "continue" on the result card starts the next mission (no home in between) ---
 const W=await p.evaluate(()=>{const T=window.TAL,O=window.OREN;const st=T.S().set;delete st.plan;st.noDaily=0;O.WORLDS.forEach(w=>{O.save.story[w.id+'-in']=1;});const rw=T.S().rw=T.S().rw||{};O.WORLDS.concat(T.BUILD).forEach(x=>{rw[x.id]=1;});/* no real-world mission joins the path here */
   const acts=T.dailyPool().filter(id=>!/^(write-trace)$/.test(id)).slice(0,2);window.__started=[];
   acts.forEach(id=>{const r=T.ACT[id].run;T.ACT[id].run=bk=>{window.__back=bk;window.__started.push(id);return r(bk);};});
   T.S().daily={d:O.today(),t:[acts[0],'math',acts[1]],done:[0,0,0],claimed:0,ch:'plan',cr:[]};
   window.__scr=[];O.on('screen',id=>window.__scr.push(id));O.showMap();window.__scr=[];return acts;});
 await p.locator('#sHome .bigbtn.huge').click({force:true});await sleep(300);
 const fin=async id=>{await p.evaluate(id=>window.TAL.finishAct(id,0,5,0,window.__back),id);await sleep(200);await p.locator('#ov .bigbtn:not(.plain)').click();await sleep(500);};
 await fin(W[0]);
 if(!(await p.locator('#sLearn').isHidden()))await L.doLesson(p);
 const m1=await p.evaluate(()=>({play:!!window.__oren4.play,d:window.TAL.S().daily.done.slice()}));
 ok('#388 continue after mission 1 starts the math level (step 2) directly',m1.play&&m1.d[0]===1,JSON.stringify(m1));
 await p.evaluate(()=>window.__oren4.finishLevel());await sleep(700);await p.locator('#ov .bigbtn').last().click();await sleep(500);
 const m2=await p.evaluate(()=>({st:window.__started.slice(),d:window.TAL.S().daily.done.slice(),tal:!document.querySelector('#sTal').hidden}));
 ok('#388 continue after the math level starts mission 3 directly',m2.st.length===2&&m2.st[1]===W[1]&&m2.d[1]===1&&m2.tal,JSON.stringify(m2));
 await fin(W[1]);
 const m3=await p.evaluate(()=>({scr:window.__scr.slice(),home:!document.querySelector('#sHome').hidden,end:!!document.querySelector('#sHome .bigbtn.huge')&&document.querySelector('#sHome .bigbtn.huge').textContent}));
 ok('#388 a 3-mission path is walked without seeing home; home comes at the end with the story ending',m3.home&&m3.scr.indexOf('sHome')===m3.scr.length-1&&/סוֹף הַסִּפּוּר/.test(m3.end||''),JSON.stringify(m3));
 await p.evaluate(()=>{const T=window.TAL,O=window.OREN;T.S().daily={d:O.today(),t:[window.__started[0],window.__started[1]],done:[0,0],claimed:0,ch:'plan',cr:[]};O.showMap();});
 await p.locator('#sHome .bigbtn.huge').click({force:true});await sleep(300);await p.click('#btnBack');await sleep(300);
 ok('#388 the back button in a mission still goes home (step not done)',await p.evaluate(()=>!document.querySelector('#sHome').hidden&&window.TAL.S().daily.done[0]===0));
 // the daily time limit still stops him: time is up -> continue does not start the next mission, the time-up screen comes
 await p.evaluate(()=>{const T=window.TAL,O=window.OREN,s=T.S();s.time=s.time||{};s.time[O.today()]=40*60;s.set.lim={daily:30,bed:0,today:null};});
 await p.locator('#sHome .bigbtn.huge').click({force:true});await sleep(300);const n0=await p.evaluate(()=>window.__started.length);
 await fin(await p.evaluate(()=>window.__started[window.__started.length-1]));await sleep(2600);
 const tl=await p.evaluate(n0=>({started:window.__started.length-n0,lock:!!document.querySelector('.tlock:not(.tyay)')}),n0);
 ok('#388 time limit: continue does not start the next mission, the time-up screen shows',tl.started===0&&tl.lock,JSON.stringify(tl));
 ok('no errors',!errs.length,errs.join('|'));await b.close();L.finish('day-path-'+L.variant,res);})();
