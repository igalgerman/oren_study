// Edge cases of the math game: real-speed transitions, blocked storage, migration, merge rules, key spam, timers, reduced motion, cloud size.
const L = require('./lib');
const {chromium}=require('playwright');
const URL=L.URL;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[];const ok=(name,cond,info='')=>results.push((cond?'PASS ':'FAIL ')+name+(info?' — '+info:''));
async function page(b,opts={},init){const ctx=await b.newContext({viewport:{width:1366,height:650},...opts});await ctx.addInitScript(()=>{window.TAL_noHome=true;});if(init)await ctx.addInitScript(init);const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts|ERR_/.test(m.text()))p.errs.push(m.text())});await p.goto(URL);await p.evaluate(()=>{if(window.HELP&&HELP.cfg){HELP.cfg.teachP=0;HELP.cfg.teachSoloP=0;}});return p;}  // no random 'explain how you did it' card (HELP.teach) over the level overlay
const st=p=>p.evaluate(()=>{const P=window.__oren4.play;if(!P)return null;return {i:P.i,lock:P.lock,q:P.qs[P.i],ch:P.choice?P.choice.ans:null,mode:P.mode};});
async function answerOnce(p){const s=await st(p);if(!s||s.lock)return false;const q=s.q;
  if(s.ch!=null){await p.locator('#qa .chs button, #qa .bubs button').nth(s.ch).click({force:true});return true;}
  if(q.k==='col'){for(const d of String(q.res).split('').reverse())await p.keyboard.press(d);return true;}
  if(q.k==='rem'){for(const v of [q.qq,q.r]){for(const c of String(v))await p.keyboard.press(c);await p.keyboard.press('Enter');}return true;}
  for(const c of String(q.ans))await p.keyboard.press(c);await p.keyboard.press('Enter');return true;}
async function finishLevel(p,maxMs=60000){const t0=Date.now();while(Date.now()-t0<maxMs){if(!(await p.locator('#ov').isHidden()))return true;await answerOnce(p);await sleep(150);}return false;}
(async()=>{const b=await chromium.launch();
 // 1. real speed: intro, studio, first 3 levels incl. lesson, transitions, gem fly
 {const p=await page(b);await p.click('#btnStart');await sleep(700);let g=0;while(g++<10&&!(await p.locator('#dlg').isHidden())){await p.click('#dNext');await sleep(400);}
  await p.locator('#sStudio .bigbtn').last().click();await sleep(900);await p.locator('.wcard2').nth(1).click();await sleep(900);g=0;while(g++<10&&!(await p.locator('#dlg').isHidden())){await p.click('#dNext');await sleep(400);}
  let levels=0;for(let i=0;i<3;i++){await p.locator('.pnode').nth(i).click();await sleep(900);if(!(await p.locator('#sLearn').isHidden())){await L.doLesson(p);await sleep(900);}
    const done=await finishLevel(p);if(done)levels++;await sleep(2200);await L.shot(p,{path:L.SHOTDIR+'/real-res'+i+'.png'});await p.evaluate(()=>document.getElementById('btnBack').click());await sleep(1500);}
  const gems=await p.evaluate(()=>window.__oren4.save.gems);const gemc=await p.textContent('#gemc');
  ok('real-speed: 3 levels with transitions',levels===3&&!p.errs.length,`levels ${levels}, errors ${p.errs.join('; ')}`);ok('gem counter matches save',gemc.trim()===String(gems),`hud ${gemc} save ${gems}`);
  const wipeHidden=await p.locator('#wipe').isHidden();ok('wipe overlay hidden after transitions',wipeHidden);
  const flies=await p.locator('.gemfly').count();ok('no leftover flying gems',flies===0,String(flies));
  await p.context().close();}
 // 2. localStorage throwing (private mode)
 {const p=await page(b,{},()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}});});
  await p.evaluate(()=>window.__oren4&&window.__oren4.setFast(true));const loaded=await p.evaluate(()=>!!window.__oren4);
  if(loaded){await p.click('#btnStart');await sleep(200);let g=0;while(g++<10&&!(await p.locator('#dlg').isHidden()))await p.click('#dNext');await p.locator('#sStudio .bigbtn').last().click();await p.locator('.wcard2').nth(1).click();g=0;while(g++<10&&!(await p.locator('#dlg').isHidden()))await p.click('#dNext');
    await p.locator('.pnode').nth(0).click();await sleep(100);if(!(await p.locator('#sLearn').isHidden()))await L.doLesson(p);await finishLevel(p,20000);}
  ok('works when browser storage is blocked',loaded&&!p.errs.length,p.errs.slice(0,2).join('; '));await p.context().close();}
 // 3. migration from previous version save
 {const p=await page(b,{},()=>{try{localStorage.clear();localStorage.setItem('oren3-v1',JSON.stringify({s:{'add-0':3,'add-5':2,'add-16':2,'mul-15':1,'word-3':1},m:{'3x4':1,'4x3':1},days:['2026-11-24'],ans:50,ok:40}));}catch(e){}});
  const s=await p.evaluate(()=>window.__oren4.save);
  ok('migration: unit stars → 3 levels',s.s['add-0-0']===3&&s.s['add-0-2']===3&&s.s['add-5-1']===2&&s.s['word-3-0']===1,JSON.stringify(s.s).slice(0,160));
  ok('migration: bosses',s.s['add-boss']===2&&s.s['mul-boss']===1);ok('migration: table + days + gems',s.m['3x4']===1&&s.days.length===1&&s.gems===40&&s.story.intro===1);
  const unl=await p.evaluate(()=>{const O=window.__oren4;const W=O.WORLDS.find(w=>w.id==='add');return W.levels.filter(l=>O.save.s[l.id]).length;});ok('migrated levels count',unl>=7,String(unl));
  await p.context().close();}
 // 4. mergeIn rules
 {const p=await page(b,{},()=>{try{localStorage.clear()}catch(e){}});const r=await p.evaluate(()=>{const O=window.__oren4,s=O.save;s.gems=100;s.t=1000;s.s={'add-0-0':2};s.k={'1,1':'tree'};
    O.mergeIn({t:500,gems:5,s:{'add-0-0':1,'add-0-1':3},k:{},m:{'2x2':1}});const a={g:s.gems,s0:s.s['add-0-0'],s1:s.s['add-0-1'],k:Object.keys(s.k).length,m:s.m['2x2']};
    O.mergeIn({t:2000,gems:7,k:{'2,2':'flower','3,3':'tree'}});a.g2=s.gems;a.k2=Object.keys(s.k).length;return a;});
  ok('merge: older cloud copy does not overwrite gems/kingdom',r.g===100&&r.k===1);ok('merge: stars take max, table OR',r.s0===2&&r.s1===3&&r.m===1);ok('merge: newer copy wins for gems/kingdom',r.g2===7&&r.k2===2);await p.context().close();}
 // 5. double submit / spam + leaving mid-delay + speed timer stop
 {const p=await page(b,{},()=>{try{localStorage.clear()}catch(e){}});await p.evaluate(()=>{const O=window.__oren4;O.save.story.intro=1;O.save.story['add-in']=1;O.save.seen['add-0']=1;});
  await p.click('#btnStart');await sleep(900);await p.locator('.wcard2').nth(1).click();await sleep(900);await p.locator('.pnode').nth(0).click();await sleep(900);
  const s=await st(p);for(const c of String(s.q.ans))await p.keyboard.press(c);await p.keyboard.press('Enter');await p.keyboard.press('Enter');await p.keyboard.press('Enter');await sleep(80);
  const s2=await st(p);ok('Enter spam counts one answer',s2.i===1,'i='+s2.i);
  await sleep(1300);const s3=await st(p);for(const c of String(s3.q.ans))await p.keyboard.press(c);await p.keyboard.press('Enter');await sleep(50);await p.click('#btnBack');await sleep(1800);
  ok('leaving during the success delay is safe',!p.errs.length&&!(await p.locator('#sWorld').isHidden()),p.errs.join('; '));
  // choices: keyboard digit selects option
  await p.evaluate(()=>{const O=window.__oren4;const lv=O.WORLDS[0].levels.find(l=>l.u.id==='num-eo'&&l.type==='learn');O.playLevel(lv,[{k:'ch',pr:'<div class="big">7</div>',opts:['זוּגִי','אִי-זוּגִי'],ans:1,h1:'x',h2:'y',ltr:false,cls:'tx',chk:{t:'eo',n:7}}]);});await sleep(900);
  await p.keyboard.press('2');await sleep(300);ok('digit key picks a choice',(await p.evaluate(()=>window.__oren4.play&&window.__oren4.play.i))===1);
  // speed: leave mid-run → no result overlay later
  await sleep(1500);await p.evaluate(()=>{const O=window.__oren4;O.playSpeed(O.WORLDS[1]);});await sleep(800);await p.evaluate(()=>{window.__oren4.play.end=Date.now()+1500;});await p.click('#btnBack');await sleep(2500);
  ok('leaving speed challenge stops its timer',await p.locator('#ov').isHidden(),'overlay visible?');
  // kingdom: not enough gems
  await p.evaluate(()=>{const O=window.__oren4;O.save.gems=3;O.kingdom();});await sleep(900);await p.locator('.shop .opt').nth(11).click();await p.locator('.kcell').nth(0).click();await sleep(100);
  ok('kingdom refuses item without enough gems',await p.evaluate(()=>Object.keys(window.__oren4.save.k).length===0&&window.__oren4.save.gems===3));
  ok('no errors in interaction tests',!p.errs.length,p.errs.join('; '));await p.context().close();}
 // 6. reduced motion + phone portrait sanity
 {const p=await page(b,{reducedMotion:'reduce'});await p.evaluate(()=>window.__oren4.setFast(true));await p.click('#btnStart');let g=0;while(g++<10&&!(await p.locator('#dlg').isHidden()))await p.click('#dNext');
  await p.locator('#sStudio .bigbtn').last().click();await p.locator('.wcard2').nth(6).click();g=0;while(g++<10&&!(await p.locator('#dlg').isHidden()))await p.click('#dNext');await p.locator('.pnode').nth(0).click();await sleep(100);
  if(!(await p.locator('#sLearn').isHidden()))await L.doLesson(p);const done=await finishLevel(p,20000);ok('reduced-motion mode playable',done&&!p.errs.length,p.errs.join('; '));await p.context().close();}
 // 7. cloud document size at full progress
 {const p=await page(b);const r=await p.evaluate(()=>{const O=window.__oren4,s=O.save;O.ALLLV.forEach(l=>s.s[l.id]=3);for(let a=1;a<=10;a++)for(let c=1;c<=10;c++)s.m[a+'x'+c]=3;
    const gens=O.ALLLV.map(l=>l.gen);s.rq=[];let t=0;while(s.rq.length<60&&t++<2000){const q=gens[t%gens.length](0);if(q.k==='ch'&&/<svg/.test(q.pr))continue;s.rq.push({q,u:'x'});}
    for(let i=0;i<30;i++)s.tc.push({op:'+',a:12,b:30,ans:42,tx:O.storyFor('+',O.HEROES[1],'תַּפּוּחִים',12,30),d:'2026-11-25',solved:0});for(let x=0;x<12;x++)for(let y=0;y<4;y++)s.k[x+','+y]='rainbow';
    for(let i=0;i<400;i++)s.days.push('2027-01-'+i);return JSON.stringify(s).length;});
  ok('cloud document stays under 256 KiB at full progress',r<200000,(r/1024).toFixed(1)+' KiB');await p.context().close();}
 await b.close();L.finish('edge-cases',results);})();
