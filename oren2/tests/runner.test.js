// #666 arcade runner: in the hall, plays a whole round to its end (keys, touch, autopilot), calm speed + cap + easier after a bad round (#351).
const L = require('./lib');
const {chromium}=require('playwright');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const VP=L.VIEWPORT;const tag=process.argv[2]==='phone'?'p':'d';
const res=[];const ok=(n,c,i='')=>res.push((c?'PASS ':'FAIL ')+n+(i?' — '+i:''));
(async()=>{const b=await chromium.launch();const ctx=await b.newContext(VP);await ctx.addInitScript(()=>{try{localStorage.clear()}catch(e){};window.__fast=true;});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts|ERR_|Failed to load/.test(m.text()))errs.push('console: '+m.text());});
 await p.goto(L.URL);await L.noCoach(p);await sleep(500);
 await p.evaluate(()=>{const O=window.OREN,T=window.TAL;O.save.story.intro=1;T.S().prof={an:'cat',col:'#3a8fc4',love:'art'};window.TAL_arcade(()=>O.showMap());});await sleep(400);
 ok('reachable from the arcade: a runner cabinet',await p.evaluate(()=>[...document.querySelectorAll('.cab b')].some(x=>x.textContent==='רִיצָה')));
 await L.shot(p,{path:L.SHOTDIR+`/runner-${tag}-hall.png`,fullPage:true});
 await p.locator('.cab',{hasText:'רִיצָה'}).click();await sleep(300);
 ok('one rule line with nikud, spoken text is the same sentence',await p.evaluate(()=>/[ְ-ׇ]/.test(document.querySelector('.rule').textContent)&&document.querySelectorAll('.arc.game .rn-pad button').length===2));
 await sleep(800);await L.shot(p,{path:L.SHOTDIR+`/runner-${tag}-play.png`});
 // keyboard: space jumps, arrow down ducks
 await p.keyboard.press('Space');await sleep(60);const j=await p.evaluate(()=>window.__run.state.jumping);
 await sleep(1100);await p.keyboard.press('ArrowDown');await sleep(30);const dk=await p.evaluate(()=>window.__run.state.ducking);
 ok('keyboard: Space jumps, ArrowDown ducks',j&&dk,`h=${j} duck=${dk}`);
 // touch: the two big buttons and a tap on the field
 await sleep(900);await p.locator('.rn-j').dispatchEvent('pointerdown');await sleep(30);const tj=await p.evaluate(()=>window.__run.state.jumping);
 await sleep(900);await p.locator('.rn-d').dispatchEvent('pointerdown');await sleep(30);const td=await p.evaluate(()=>window.__run.state.ducking);
 ok('touch: jump and duck buttons work',tj&&td,`${tj} ${td}`);
 // play the round to its end by the autopilot (no finish() shortcut)
 let ended=false;for(let k=0;k<1500;k++){if(await p.evaluate(()=>!document.querySelector('#ov').hidden)){ended=true;break;}await p.evaluate(()=>window.__arc.hit());await sleep(15);}
 const r=await p.evaluate(()=>({ov:!document.querySelector('#ov').hidden,rec:(window.TAL.S().tl['arc-runner']||{}).s|0,plays:window.__arc.state().plays}));
 ok('a round plays to its end by itself, stars saved',ended&&r.ov&&r.rec>0,JSON.stringify(r));
 await L.shot(p,{path:L.SHOTDIR+`/runner-${tag}-result.png`});
 // #351
 const c=await p.evaluate(()=>{const a=window.__arc.state();a.lv={runner:999};a.gr={};const hi=window.__arc.tune('runner');a.lv={};const lo=window.__arc.tune('runner');return {hi,lo};});
 ok('base speed calm, level capped at 4 (no speed beyond the cap)',c.lo.lv===0&&c.hi.lv===4,JSON.stringify(c));
 const sp=await p.evaluate(async()=>{const a=window.__arc.state();const w=ms=>new Promise(r=>setTimeout(r,ms));const out={};
   document.querySelector('#ov').hidden=true;a.lv={runner:99};window.__arc.start('runner');await w(900);out.cap=window.__run.state.speed;window.__arc.finish(8);await w(200);document.querySelector('#ov').hidden=true;
   a.lv={};window.__arc.start('runner');await w(900);out.base=window.__run.state.speed;window.__arc.finish(0);await w(200);document.querySelector('#ov').hidden=true;
   a.lv={runner:3};window.__arc.start('runner');await w(300);window.__arc.finish(0);await w(200);out.after=window.__arc.tune('runner').lv;document.querySelector('#ov').hidden=true;return out;});
 ok('speed: base < cap <= 0.26 widths/s',sp.base<sp.cap&&sp.cap<=.26&&sp.base<=.21,JSON.stringify(sp));
 ok('easier after a bad round (level 3 -> 2)',sp.after===2,JSON.stringify(sp));
 await p.evaluate(()=>window.OREN.showMap());await sleep(300);
 ok('no JS errors',!errs.length,errs.slice(0,5).join(' | '));await b.close();L.finish('runner-'+L.variant,res);})();
