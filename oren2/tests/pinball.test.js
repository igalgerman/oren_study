// #667 pinball: reachable from the arcade, spoken rule, real input (click sides, keys), a round played to its end, calm speed + cap + easier after a bad round (#351).
const L = require('./lib');
const {chromium}=require('playwright');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tag=L.variant==='phone'?'p':'d';const res=[];const ok=(n,c,i='')=>res.push((c?'PASS ':'FAIL ')+n+(i?' — '+i:''));
(async()=>{const b=await chromium.launch();const ctx=await b.newContext(L.VIEWPORT);await ctx.addInitScript(()=>{try{localStorage.clear()}catch(e){};window.__fast=true;});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts|ERR_|Failed to load/.test(m.text()))errs.push('console: '+m.text());});
 await p.goto(L.URL);await L.noCoach(p);await sleep(500);
 await p.evaluate(()=>{const O=window.OREN,T=window.TAL;O.save.story.intro=1;T.S().prof={an:'cat',col:'#3a8fc4',love:'art'};window.TAL_arcade(()=>O.showMap());});await sleep(400);
 ok('pinball cabinet is in the arcade hall',await p.locator('.cab',{hasText:'פִּינְבּוֹל'}).count()===1);
 await p.locator('.cab',{hasText:'פִּינְבּוֹל'}).click();await sleep(300);
 ok('one rule line, spoken text is in the pregen list, no extra buttons',await p.evaluate(()=>/הַצַּד/.test(document.querySelector('.rule').textContent)&&document.querySelectorAll('#sTal .field button').length===0));
 await sleep(2800);await L.shot(p,{path:L.SHOTDIR+`/pinball-${tag}-play.png`});
 ok('countdown ends, the ball is in play',await p.evaluate(()=>window.__arc.cur&&window.__arc.cur.balls>=1&&!!document.querySelector('.pball')));
 // real input: click the left half, press keys
 const box=await p.locator('.field.pin').boundingBox();
 const minAng=side=>p.evaluate(sd=>new Promise(r=>{let m=9;const t0=performance.now();(function f(){const v=document.querySelector('.pflip.'+sd).style.transform.match(/rotate\((-?[\d.]+)rad/);if(v)m=Math.min(m,sd==='r'?Math.PI-v[1]:+v[1]);if(performance.now()-t0<300)requestAnimationFrame(f);else r(m);})();}),side);
 let pr=minAng('l');await p.mouse.click(box.x+box.width*.25,box.y+box.height*.8);
 const aL=await pr;ok('click on the left side lifts the left flipper',aL<0.45,'min angle '+aL);
 pr=minAng('r');await p.keyboard.press('ArrowRight');const aR=await pr;
 ok('arrow key lifts the right flipper',aR<0.45,'min angle '+aR);
 // the hit-boxes are where the flippers are drawn: a ball dropped on each flipper's middle is hit by a flip and goes up
 for(const [i,sd] of [[0,'l'],[1,'r']]){
   const r=await p.evaluate(async([i,sd])=>{const c=window.__arc.cur,g=c.geo(),w=ms=>new Promise(r=>setTimeout(r,ms));const dir=i?-1:1;
     const fb=document.querySelector('.pflip.'+sd).getBoundingClientRect(),fr=document.querySelector('.field.pin').getBoundingClientRect();
     await w(400);const sg=g.L*.5,mx=g.px[i]+dir*Math.cos(.5)*sg;c.setBall(mx,g.py+Math.sin(.5)*sg-26,0,0);const s0=c.score;let vmin=9;
     const key=i?'ArrowRight':'ArrowLeft';await w(60);document.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));
     for(let k=0;k<20;k++){await w(16);vmin=Math.min(vmin,c.ball.vy);}
     return {vmin,mx,drawnL:fb.left-fr.left,drawnR:fb.right-fr.left,px:g.px[i]};},[i,sd]);
   ok(sd+' flipper: a flip under the ball sends it up (hit segment is where the flipper is drawn)',r.vmin<-.05&&r.mx>r.drawnL-2&&r.mx<r.drawnR+2,JSON.stringify(r));}
 // a round to its end by itself: no input, the 3 balls drain
 let n=0;for(;n<400;n++){if(await p.evaluate(()=>!document.querySelector('#ov').hidden))break;await sleep(150);}
 const r=await p.evaluate(()=>({ov:!document.querySelector('#ov').hidden,rec:(window.TAL.S().tl['arc-pinball']||{}).s|0}));
 ok('a round plays to its end by itself (3 balls drain), the result shows and stars are saved',r.ov&&r.rec>0,JSON.stringify(r)+' polls '+n);
 await L.shot(p,{path:L.SHOTDIR+`/pinball-${tag}-result.png`});
 // #351 calm base, hard cap, easier after a bad round
 const x=await p.evaluate(()=>{const a=window.__arc.state();a.lv={};a.gr={};const calm=window.__arc.tune('pinball');a.lv={pinball:999};const top=window.__arc.tune('pinball');
   a.lv={pinball:3};a.gr={pinball:2};document.querySelector('#ov').hidden=true;window.__arc.start('pinball');window.__arc.finish(0);const bad=window.__arc.tune('pinball').lv;return {calm,top,bad};});
 ok('base speed is calm, below the hard cap',x.calm.grav<x.top.grav&&x.calm.vmax<x.top.vmax&&x.calm.lv===0,JSON.stringify(x));
 ok('hard cap: gravity and ball speed stop at level 4',x.top.lv===4&&x.top.vmax<=.6*1.24+1e-9&&x.top.grav<=.0003*1.32+1e-9,JSON.stringify(x.top));
 ok('a bad round (1 star) makes the next one easier',x.bad===2,JSON.stringify(x));
 ok('no JS errors',!errs.length,errs.slice(0,5).join(' | '));await b.close();L.finish('pinball-'+L.variant,res);})();
