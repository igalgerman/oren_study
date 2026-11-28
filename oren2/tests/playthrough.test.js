// Long play-through of every world on a viewport (FULL=1 only): levels, bosses, extras, layout overflow.
const L = require('./lib');
const {chromium,devices}=require('playwright');
const VP={desktop:{viewport:{width:1366,height:650}},big:{viewport:{width:1920,height:1000}},phone:devices['iPhone 13'],phoneLand:devices['iPhone 13 landscape']};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(name,wi,extras){
 const b=await chromium.launch();const ctx=await b.newContext({...VP[name],deviceScaleFactor:1});await ctx.addInitScript(()=>{window.TAL_noHome=true;});const p=await ctx.newPage();const log=[];let where='';const shots=new Set();
 p.on('pageerror',e=>log.push('PAGEERROR '+e.message+' @'+where));p.on('console',m=>{if(m.type()==='error'&&!/fonts|ERR_/.test(m.text()))log.push('CONSOLE '+m.text())});
 const kb=!name.startsWith('phone');const tagN=`${name}-w${wi}`;
 const shot=async n=>{if(shots.has(n))return;shots.add(n);await L.shot(p,{path:L.SHOTDIR+`/${tagN}-${n}.png`});};
 const overflow=async tag=>{const o=await p.evaluate(()=>{const W=innerWidth,bad=[];if(document.documentElement.scrollWidth>W+1)bad.push('hscroll');
   document.querySelectorAll('.screen:not([hidden]) *, .hud *, #ov:not([hidden]) *, #dlg:not([hidden]) *').forEach(e=>{if(e.closest('.scn'))return;const r=e.getBoundingClientRect();if(r.width&&(r.right>W+1||r.left<-1))bad.push((typeof e.className==='string'?e.className:e.tagName)+' '+Math.round(r.left)+'..'+Math.round(r.right))});return [...new Set(bad)].slice(0,4)});
   if(o.length)log.push(`OVERFLOW ${tag}: ${o.join(' | ')}`)};
 const key=async k=>{if(kb)await p.keyboard.press(k==='go'?'Enter':k);else await p.click(`#pad .key[data-k="${k}"]`);};
 const typeNum=async v=>{for(const ch of String(v))await key(ch);await key('go');};
 const st=()=>p.evaluate(()=>{const P=window.__oren4.play;if(!P)return null;const q=P.qs[P.i];return {i:P.i,len:P.qs.length,lock:P.lock,q,ch:P.choice?{ans:P.choice.ans,n:P.choice.opts.length}:null};});
 const dlgThrough=async()=>{let g=0;while(g++<12&&!(await p.locator('#dlg').isHidden())){await shot('dlg');await overflow('dlg');await p.click('#dNext');await sleep(60);}};
 async function answer(s,wrong){const q=s.q;
   if(s.ch){const btns=p.locator('#qa .chs button, #qa .bubs button');if(wrong){const w=(s.ch.ans+1)%s.ch.n;await btns.nth(w).click({force:true});await sleep(700);}await btns.nth(s.ch.ans).click({force:true});return;}
   if(q.k==='col'){const R=String(q.res).split('').reverse().map(Number);if(wrong){await key(String((R[0]+1)%10));await sleep(60);}for(const d of R){await key(String(d));await sleep(20);}return;}
   if(q.k==='rem'){if(wrong){await typeNum(q.qq+1);await typeNum(q.r);await sleep(700);}await typeNum(q.qq);await typeNum(q.r);return;}
   if(wrong){await typeNum(q.ans+1);await sleep(700);}await typeNum(q.ans);}
 async function playUntilDone(tag,mode){let guard=0,qn=0;
   while(guard++<90){if(!(await p.locator('#ov').isHidden()))return true;const s=await st();if(!s||s.lock||!s.q){await sleep(30);continue;}
     where=tag+' q'+s.i;if(qn===0){await shot('q-'+tag.replace(/\W/g,''));await overflow('q '+tag);}qn++;
     if(mode==='reveal'&&s.i===1&&!s.ch&&s.q.k!=='col'&&s.q.k!=='rem'){for(let w=0;w<3;w++){await typeNum(s.q.ans+7);await sleep(650);}
        await sleep(300);if((await st()).len!==s.len+1)log.push('requeue failed '+tag);await p.waitForFunction(i=>{const P=window.__oren4.play;return P&&P.i>i;},s.i,{timeout:7000}).catch(()=>log.push('stuck after reveal '+tag));continue;}
     if(mode==='hint'&&s.i===0){await p.click('#hintBtn');await sleep(40);if(s.q.k!=='col')await p.click('#hintBtn').catch(()=>{});await shot('hint-'+tag.replace(/\W/g,''));await overflow('hint '+tag);}
     await answer(s,mode==='wrong'&&s.i<2);
     const t0=Date.now();while(Date.now()-t0<5000){const s2=await st();if(!s2||s2.i!==s.i||!(await p.locator('#ov').isHidden()))break;await sleep(30);}
     if(Date.now()-t0>=5000)log.push('STUCK '+tag+' q'+s.i+' '+JSON.stringify(s.q).slice(0,140));}
   return !(await p.locator('#ov').isHidden());}
 try{
  await p.goto(L.URL);
  await p.evaluate(wi=>{localStorage.clear();if(wi>0){const O=window.__oren4;const s={v:4,t:1,s:{},m:{},seen:{},story:{intro:1},rq:[],days:[],ans:0,ok:0,trains:0,music:true,gems:0,av:{hair:'brown',skin:'light',shirt:'red',hat:'none',pet:'cat'},owned:{none:1,cap:1},k:{},tc:[],sp:{},made:{}};
    if(O.WORLDS[wi].id==='fin')O.WORLDS.forEach(w=>{if(w.id!=='fin')s.s[w.units[w.units.length-1].id]=1;});localStorage.setItem('oren4-v1',JSON.stringify(s));}},wi);
  await p.reload();await p.evaluate(()=>window.__oren4.setFast(true));
  await shot('start');await p.click('#btnStart');await sleep(150);
  if(wi===0){await dlgThrough();if(await p.locator('#sStudio').isHidden())log.push('studio not shown after intro');await shot('studio');await overflow('studio');
    await p.locator('#sStudio .wopt:not(.lock)').nth(1).click();await p.locator('#sStudio .hatb').nth(2).click();await p.locator('#sStudio .bigbtn').last().click();await sleep(100);}
  if(await p.locator('#sMap').isHidden())log.push('map not shown');await shot('map');await overflow('map');
  const nLv=await p.evaluate(wi=>window.__oren4.WORLDS[wi].levels.length,wi);
  await p.evaluate(()=>document.querySelectorAll('.wcard2').forEach(c=>{c.hidden=false;}));/* G5: 0-star worlds are hidden tiles (#98) */await p.locator('.wcard2').nth(wi).click();await sleep(100);await dlgThrough();
  if(await p.locator('#sWorld').isHidden())log.push('world path not shown');await shot('path');await overflow('path');
  for(let i=0;i<(process.env.SKIPLV?3:nLv);i++){const tag=`W${wi}L${i}`;where=tag;
    const node=p.locator('.pnode').nth(i);if(await node.isDisabled()){log.push('locked '+tag);break;}
    await node.click();await sleep(60);
    if(!(await p.locator('#sLearn').isHidden())){await shot('learn-'+tag);await overflow('learn '+tag);
      if(i%2===0){let g=0;while(g++<20&&!(await p.locator('#sLearn').isHidden())){await p.locator('#sLearn .bigbtn').first().click();await sleep(30);}}else await p.locator('#sLearn .bigbtn.plain').click();await sleep(60);}
    if(await p.locator('#sPlay').isHidden()){log.push('play not started '+tag);break;}
    const mode=(i%5===1)?'reveal':(i%5===2)?'wrong':(i%5===3)?'hint':'plain';
    const ok=await playUntilDone(tag,mode);if(!ok){log.push('no result '+tag);break;}
    await sleep(60);await shot('res-'+tag);await overflow('res '+tag);
    const blue=p.locator('#ov .bigbtn.blue');if(await blue.count())await blue.click();else await p.locator('#ov .bigbtn').last().click();
    await sleep(80);await dlgThrough();
    if(!(await p.locator('#sFinal').isHidden())){await shot('final');await overflow('final');break;}
    if(await p.locator('#sWorld').isHidden()){log.push('not back on path after '+tag);break;}
  }
  const info=await p.evaluate(wi=>{const O=window.__oren4,W=O.WORLDS[wi];return {done:W.levels.filter(l=>O.save.s[l.id]).length,of:W.levels.length,gems:O.save.gems,rq:O.save.rq.length,story:Object.keys(O.save.story).length};},wi);
  log.push('info '+JSON.stringify(info));if(info.done!==info.of&&!process.env.SKIPLV)log.push('INCOMPLETE');
  if(extras){where='extras';
    await p.click('#btnBack');await sleep(100);
    // speed challenge
    await p.evaluate(()=>document.querySelectorAll('.wcard2').forEach(c=>{c.hidden=false;}));/* G5: 0-star worlds are hidden tiles (#98) */await p.locator('.wcard2').nth(wi).click();await sleep(100);await p.locator('.whead .bigbtn').click();await sleep(100);await shot('speed');await overflow('speed');
    for(let k=0;k<5;k++){const s=await st();if(s&&!s.lock){await answer(s,false).catch(()=>{});}await sleep(250);}
    await p.evaluate(()=>{window.__oren4.play.end=Date.now();});await sleep(600);
    if(await p.locator('#ov').isHidden())log.push('speed no result');await shot('speed-res');await p.locator('#ov .bigbtn').last().click();await sleep(100);
    await p.click('#btnBack');await sleep(100);
    // kingdom
    await p.locator('.tool:not(.hubtool)').nth(0).click();await sleep(100);const g0=await p.evaluate(()=>window.__oren4.save.gems);
    await p.evaluate(()=>{const o=document.querySelector('#ov .bwcard');if(o)document.getElementById('ov').hidden=true;});
    const placedN=()=>p.evaluate(()=>Object.keys(window.__oren4.save.bw.a.meadow).length);const n0=await placedN();
    await p.locator('#sKing .bwb[data-b="wood"]').click();await p.locator('#sKing .bwc[data-x="1"][data-y="1"]').click();await p.locator('#sKing .bwc[data-x="2"][data-y="1"]').click();await sleep(100);
    const g1=await p.evaluate(()=>window.__oren4.save.gems);if(g1!==g0-4)log.push('kingdom gems '+g0+'→'+g1);
    if(await placedN()!==n0+2)log.push('kingdom placed '+(await placedN()-n0));
    await shot('kingdom');await overflow('kingdom');
    await p.locator('#sKing .bwc[data-x="2"][data-y="1"]').click();await sleep(50);
    if(await placedN()!==n0+1)log.push('remove failed');
    await p.click('#btnBack');await sleep(100);
    // teacher: build a story puzzle 12 : 3, solve wrong then right, then family solves
    await p.locator('.tool:not(.hubtool)').nth(2).click();await sleep(100);
    await p.locator('#sTeach .optrow').first().locator('button').nth(3).click();await sleep(50);
    await p.locator('#sTeach .optrow').nth(1).locator('button').nth(1).click();await sleep(50);
    const tk=async k=>{await p.locator(`#sTeach .pad .key`).nth(['1','2','3','4','5','6','7','8','9','del','0','go'].indexOf(k)).click();await sleep(30);};
    await tk('1');await tk('3');await tk('go');await tk('3');await tk('go');await sleep(80);
    const err=await p.locator('#sTeach .cap').first().textContent();if(!/מִתְחַלֵּק/.test(err))log.push('teacher no divisibility msg: '+err);
    await p.locator('#sTeach .ans').first().click();await tk('del');await tk('del');await tk('1');await tk('2');await tk('go');await tk('go');await sleep(120);
    await shot('teach-solve');await overflow('teach');
    await tk('5');await tk('go');await sleep(100);await tk('4');await tk('go');await sleep(200);
    if(await p.locator('#ov').isHidden())log.push('teacher save failed');
    await p.locator('#ov .bigbtn').last().click();await sleep(100);await shot('teach-list');
    await p.locator('.tcard').first().click();await sleep(100);
    const fk=async k=>{await p.locator(`#sTeach .pad .key`).nth(['1','2','3','4','5','6','7','8','9','del','0','go'].indexOf(k)).click();await sleep(30);};
    await fk('4');await fk('go');await sleep(100);
    if(!(await p.evaluate(()=>window.__oren4.save.tc[0].solved)))log.push('family solve failed');
    await shot('family');await p.click('#btnBack');await sleep(80);await p.click('#btnBack');await sleep(80);
    // training
    await p.locator('.tool:not(.hubtool)').nth(3).click();await sleep(100);
    if(await p.locator('#sPlay').isHidden())log.push('training not started');else{const ok=await playUntilDone('train','wrong');if(!ok)log.push('training no result');await p.locator('#ov .bigbtn').last().click();await sleep(100);}
    await p.locator('.tool:not(.hubtool)').nth(4).click();await sleep(100);await shot('table');await overflow('table');await p.click('#btnBack');
    await p.reload();const pers=await p.evaluate(()=>({k:Object.keys(window.__oren4.save.k).length,tc:window.__oren4.save.tc.length,hat:window.__oren4.save.av.hat}));log.push('persist '+JSON.stringify(pers));
  }
 }catch(e){await L.shot(p,{path:L.SHOTDIR+`/${tagN}-CRASH.png`}).catch(()=>{});log.push('CRASH at '+where+': '+e.message.split('\n').slice(0,3).join(' / '));}
 await b.close();return tagN+':\n  '+(log.join('\n  ')||'OK');}
(async()=>{const name=L.variant==='phone'?'phone':'desktop';const list=(process.env.WORLDS||'0,1,2,3,4,5,6,7').split(',').map(Number);
  const r=await Promise.all(list.map(w=>run(name,w,w===0)));
  const lines=r.map(t=>{const bad=/CRASH|PAGEERROR|CONSOLE|OVERFLOW|STUCK|not shown|failed|no result|not started/.test(t);return (bad?'FAIL ':'PASS ')+t.replace(/\n\s*/g,' | ');});
  L.finish('playthrough-'+name,lines);})();
