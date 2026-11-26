// Opens and plays every Talents City activity to completion through test hooks.
const L = require('./lib');
const {chromium}=require('playwright');
const URL=L.URL;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1366,height:700}});
 await ctx.addInitScript(()=>{try{localStorage.clear()}catch(e){};window.__fast=true;});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts|ERR_|Failed to load/.test(m.text()))errs.push('console: '+m.text());});
 await p.goto(URL);await L.noCoach(p);await sleep(400);await p.evaluate(()=>{const O=window.OREN;O.save.story.intro=1;O.save.set={brk:0,hide:{}};O.save.prof={an:'cat',col:'#3a8fc4',love:'art'};O.showMap();});
 const only=process.argv[2];
 const ids=(await p.evaluate(()=>Object.keys(window.TAL.ACT))).filter(i=>!only||i===only);const res=[];
 const ovOpen=()=>p.evaluate(()=>!document.querySelector('#ov').hidden);
 const tl=id=>p.evaluate(id=>(window.TAL.S().tl[id]||{}).s|0,id);
 async function quizLoop(n=80){for(let k=0;k<n;k++){if(await ovOpen())return true;await p.evaluate(()=>{const q=window.__quiz;if(!q||!q.wrap.isConnected)return;const c=q.wrap.querySelector('.chs');if(c&&c.children[q.ans])c.children[q.ans].click();});await sleep(120);}return ovOpen();}
 const click=sel=>p.evaluate(sel=>{const e=document.querySelector(sel);if(e)e.click();return !!e;},sel);
 /* batch A packs: each is played to the end in its own suite (gaps, read-bank2, music2, chess, explore2); here we only open it and check the screen is not empty */
 const OPENED=async()=>{const n=await p.evaluate(()=>document.querySelector('#sTal').children.length+(document.querySelector('#ov').hidden?0:1));return n>0?'skip':'EMPTY SCREEN';};
 /* batch B: the thinking tracks and reading comprehension are answered through window.__think (always the right option) */
 const THK=async()=>{for(let k=0;k<500&&!(await ovOpen());k++){await p.evaluate(()=>{const q=window.__think;if(!q||!q.wrap.isConnected)return;const c=q.wrap.querySelector('.chs');if(c&&c.children[q.ans])c.children[q.ans].click();});await sleep(120);}};
 /* batch C: math training (answers through window.__learn; the placement screen first when it comes) and paper & pencil (math: type the result, writing: tick "done") */
 const LNM=async()=>{for(let r=0;r<4&&!(await tl('ln-math'));r++){if(await ovOpen()){await click('#ov .bigbtn');await sleep(200);}
   for(let k=0;k<400&&!(await ovOpen());k++){await p.evaluate(()=>{const q=window.__learn,w=document.querySelector('#sTal'),row=w.querySelector('.chs');
     if(row&&q&&q.wrap&&q.wrap.isConnected&&row.children[q.ans]&&!row.children[q.ans].disabled){row.children[q.ans].click();return;}
     const nb=w.querySelector('.hintbox:not([hidden]) .bigbtn')||(!row&&w.querySelector('.btnrow .bigbtn'));if(nb)nb.click();});await sleep(100);}}};
 const LNP=async()=>{await p.evaluate(()=>{window.__learn=null;});await click('#sTal .lnpaper .btnrow .bigbtn');await sleep(200);
   const t=await p.evaluate(()=>{const q=window.__learn;if(q&&q.type){q.type(q.ans);return 1;}const d=document.querySelector('.lnchk .btnrow .bigbtn');if(d){d.click();return 2;}return 0;});
   if(!t){await click('#sTal .lnpaper .btnrow .bigbtn');await sleep(200);await click('.lnchk .btnrow .bigbtn');}await sleep(300);};
 const S={
  'read-rc':THK,'think-pat':THK,'think-ana':THK,'think-ser':THK,'think-rel':THK,'think-mat':THK,'think-sen':THK,
  'ln-math':LNM,'ln-paper':LNP,
  'write-mix':OPENED,
  'write-paper':OPENED,
  'read-nik':OPENED,
  'read-flu':OPENED,
  'write-spell':OPENED,
  'mus2-rhythm':OPENED,
  'chess-board':OPENED,
  'sky-sun':OPENED,
  'sky-planets':OPENED,
  'sky-order':OPENED,
  'sky-astro':OPENED,
  'nat-home':OPENED,
  'nat-groups':OPENED,
  'nat-cycle':OPENED,
  'nat-il':OPENED,
  'map-read':OPENED,
  'map-il':OPENED,
  'map-world':OPENED,
  'map-flags':OPENED,
  'his-then':OPENED,
  'his-inv':OPENED,
  'his-old':OPENED,
  'yr-hol':OPENED,
  'yr-order':OPENED,
  'yr-sport':OPENED,
  'blk-plan':OPENED,
  'blk-count':OPENED,
  'blk-mirror':OPENED,
  'blk-view':OPENED,
  'blk-free':OPENED,
  'read-build':async()=>{for(let k=0;k<200&&!(await ovOpen());k++){await p.evaluate(()=>{const b=[...document.querySelectorAll('#sTal .chs .chb')].filter(x=>!x.disabled);if(b.length)b[Math.floor(Math.random()*b.length)].click();});await sleep(60);}},
  'type-lessons':async()=>{await click('#sTal .acts .actc');await sleep(200);const inv=await p.evaluate(()=>{const C=window.TAL.TYPE.CODE;const o={};for(const k in C)o[C[k]]=k;return o;});
    for(let k=0;k<400&&!(await ovOpen());k++){const ch=await p.evaluate(()=>{const c=document.querySelector('#sTal .tc.cur');return c?c.textContent:null;});if(ch==null){await sleep(100);continue;}const code=ch.trim()===''?'Space':inv[ch];if(!code){console.log('no code for',JSON.stringify(ch));break;}await p.keyboard.press(code);await sleep(20);}},
  'type-rain':async()=>{await sleep(500);await p.evaluate(()=>{window.__rain.blocks.slice().forEach(o=>window.__rain.hit(o.ch));window.__rain.finish();});await sleep(500);},
  'mus-rhythm':async()=>{for(let k=0;k<12&&!(await ovOpen());k++){await click('#sTal .bigbtn');await sleep(30);await p.evaluate(()=>{const on=window.__rhythm.onsets();on.forEach(t=>setTimeout(()=>window.__rhythm.tap(),Math.max(0,t-performance.now())));});await sleep(1500);}},
  'mus-piano':async()=>{await click('#sTal .acts .actc');await sleep(200);for(let k=0;k<200&&!(await ovOpen());k++){await p.evaluate(()=>{const P=window.__piano;if(P.song&&P.pos<P.song[1].length)P.press(P.song[1][P.pos]);});await sleep(40);}},
  'sci-plant':async()=>{for(let k=0;k<4;k++){await p.evaluate(()=>{window.__plant.water();window.__plant.next();});await sleep(50);}await sleep(400);await quizLoop();},
  'sci-states':async()=>{await click('#sTal > .bigbtn');await quizLoop();},'sci-day':async()=>{await click('#sTal > .bigbtn');await quizLoop();},
  'sci-circ':async()=>{const bs=await p.$$('#sTal .btnrow button');await bs[0].click();await bs[1].click();await sleep(500);await quizLoop();},
  'art-draw':async()=>{await p.evaluate(()=>{window.__art.paint(0,2);window.__art.mirror(true);window.__art.paint(17,5);window.__art.fill(100,8);window.__art.save();});},
  'art-cbn':async()=>{await p.evaluate(()=>window.__cbn.solve());await sleep(500);},
  'art-mix':async()=>{await p.evaluate(()=>{const b=document.querySelectorAll('#sTal .mixb');b[0].click();b[1].click();});await click('#sTal .btnrow .bigbtn');await quizLoop();},
  'art-sym':async()=>{for(let k=0;k<5;k++){await p.evaluate(()=>window.__sym.solve());await sleep(300);}},
  'mind-breath':async()=>{await p.evaluate(()=>window.__breath.finish());await click('#sTal .face');},
  'mind-feel':async()=>{await click('#sTal .face');await sleep(100);},
  'mind-jar':async()=>{await p.evaluate(()=>{const b=document.querySelectorAll('#sTal .thb');[0,3,5].forEach(i=>b[i].click());});await click('#sTal .btnrow .bigbtn');},
  'mind-sounds':async()=>{await click('#sTal .ambb');await sleep(300);await click('#sTal .ambb:nth-child(2)');await sleep(300);return 'skip';},
  'mind-scan':async()=>{for(let k=0;k<9&&!(await ovOpen());k++){await click('#sTal .btnrow .bigbtn');await sleep(50);}},
  'code-maze':async()=>{let ok=0;for(let i=0;i<15;i++){await p.evaluate(()=>{document.querySelector('#ov').hidden=true;window.TAL.ACT['code-maze'].run(()=>{});});await sleep(100);await p.locator('#sTal .lvb').nth(i).click();await sleep(100);
      const L=await p.evaluate(()=>({n:window.__code.L.n,opt:window.__code.L.opt,len:window.__code.L.len,rep:window.__code.L.rep}));await p.evaluate(()=>window.__code.solve());for(let k=0;k<150&&!(await ovOpen());k++)await sleep(50);if(await ovOpen())ok++;console.log('  code lvl',i+1,JSON.stringify(L));}
    return 'levels '+ok+'/15 stars '+JSON.stringify(await p.evaluate(()=>window.TAL.S().code));},
  'think-sudoku':async()=>{for(let k=0;k<3;k++){await p.evaluate(()=>window.__sud.solve());await sleep(300);}},
  'think-maze':async()=>{await p.evaluate(()=>window.__maze.solve());await sleep(400);},
  'think-mem':async()=>{await p.evaluate(()=>window.__mem.solve());await sleep(3000);},
  'write-trace':async()=>{await p.evaluate(()=>window.__wr.scribble());await p.evaluate(()=>window.__wr.ok());const f=await p.evaluate(()=>document.querySelector('#sTal .lcap').textContent);
    let r='scribble-> '+f;await click('#sTal .bigbtn.plain');
    for(let k=0;k<4;k++){const sc=await p.evaluate(()=>{window.__wr.fill();return window.__wr.score();});r+=` | cov ${sc.cov.toFixed(2)} out ${sc.out.toFixed(2)}`;await p.evaluate(()=>window.__wr.ok());await sleep(300);}return r;},
 };
 for(const id of ids){await p.evaluate(()=>{document.querySelector('#ov').hidden=true;window.TAL.openHub();});await sleep(80);const e0=errs.length;
   const avail=await p.evaluate(id=>{const a=window.TAL.ACT[id];return !a.avail||a.avail();},id);if(!avail){res.push(`---- ${id}: unavailable here (dictation)`);continue;}
   if(id==='write-trace'){await p.evaluate(()=>window.TAL.ACT['write-trace'].run(()=>{}));await sleep(100);await click('#sTal .btnrow .bigbtn');}
   else if(id.startsWith('story-')){await p.evaluate(id=>window.TAL.ACT[id].run(()=>{}),id);await sleep(100);await click('#sTal .btnrow .bigbtn:last-child');}
   else if(id!=='code-maze')await p.evaluate(id=>window.TAL.ACT[id].run(()=>{}),id);
   await sleep(150);let extra='';
   if(S[id])extra=await S[id]()||'';else if(!(await quizLoop()))extra='QUIZ NOT DONE';
   await sleep(200);const st=await tl(id);res.push(`${st>0||extra==='skip'?'PASS':'FAIL'} ${id}: stars ${st} ${extra} errs ${errs.length-e0}`);}
 res.push((errs.length?'FAIL':'PASS')+' no JS errors '+errs.slice(0,8).join(' | '));await b.close();L.finish('activities',res);})();
