// Curriculum-gap activities: nikud ladder, first sound, spelling, word race, final letters, stories, math units (graphs, shapes, length).
// Usage: node tests/gaps.test.js [desktop|phone]     GAPS_PAGE=/path/page.html injects gaps.* into a page built without them.
const L = require('./lib');
const fs = require('fs'), path = require('path');
const {chromium}=require('playwright');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SA=process.env.GAPS_PAGE;                     /* standalone: inject the new files into an older build */
const SHOTS=process.env.GAPS_SHOTS;                 /* folder for screenshots */
(async()=>{const b=await chromium.launch();const ctx=await b.newContext(L.VIEWPORT);
 await ctx.addInitScript(()=>{try{localStorage.clear()}catch(e){};window.__fast=true;window.__noFamily=true;});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/fonts|ERR_|Failed to load/.test(m.text()))errs.push('console: '+m.text());});
 await p.goto(SA?'file://'+SA:L.URL);await L.noCoach(p);
 if(SA){await p.addStyleTag({content:fs.readFileSync(path.join(L.ROOT,'gaps.css'),'utf8')});await p.addScriptTag({content:fs.readFileSync(path.join(L.ROOT,'gaps.js'),'utf8')});
   await p.addScriptTag({content:fs.readFileSync(path.join(L.ROOT,'gaps-math.js'),'utf8')});await p.evaluate(()=>window.GAPS.register());}
 await p.evaluate(()=>{const O=window.OREN;O.save.story.intro=1;O.save.set={brk:0,hide:{}};O.save.prof={an:'cat',col:'#3a8fc4',love:'art'};O.showMap();});
 const out=[];const ok=(n,c,d)=>out.push((c?'PASS ':'FAIL ')+n+(c||!d?'':' — '+d));
 const shot=async n=>{if(!SHOTS)return;fs.mkdirSync(SHOTS,{recursive:true});await sleep(350);await p.screenshot({path:path.join(SHOTS,n+'-'+L.variant+'.png')});};
 const ovOpen=()=>p.evaluate(()=>!document.querySelector('#ov').hidden);
 const tl=id=>p.evaluate(id=>window.TAL.S().tl[id]||null,id);
 const closeOv=()=>p.evaluate(()=>{const b=[...document.querySelectorAll('#ov .bigbtn')].pop();if(b)b.click();});
 async function quizLoop(n=80,each){for(let k=0;k<n;k++){if(await ovOpen())return true;if(each)await each(k);await p.evaluate(()=>{const q=window.__quiz;if(!q||!q.wrap.isConnected)return;const c=q.wrap.querySelector('.chs');if(c&&c.children[q.ans]&&!c.children[q.ans].classList.contains('ok'))c.children[q.ans].click();});await sleep(120);}return ovOpen();}

 /* ---------- data: nikud, parsing, voice text ---------- */
 const D=await p.evaluate(()=>{const G=window.GAPS;const bad=[];const NIK=/[֑-ׇ]/;
   const ex={'סִירָה':['סִי','ia'],'חָתוּל':['חָ','au'],'שָׁלוֹם':['שָׁ','ao'],'בֵּיצָה':['בֵּי','ea'],'מֶלֶךְ':['מֶ','e'],'כִּבְשָׂה':['כִּ','isa'],'דּוּבִּי':['דּוּ','ui'],'שׁוּק':['שׁוּ','u'],'אוֹר':['אוֹ','o'],'יָדַיִם':['יָ','ai'],'צְפַרְדֵּעַ':['צְ','sae'],'אוֹהֶל':['אוֹ','oe']};
   for(const [w,[s1,vs]] of Object.entries(ex)){const x=G.WD.find(y=>y.w===w);if(!x){bad.push('missing '+w);continue;}if(!x.s1||x.s1.s!==s1)bad.push('s1 '+w+' '+(x.s1&&x.s1.s));if([...new Set(vs)].sort().join('')!==x.vs.slice().sort().join(''))bad.push('vowels '+w+' '+x.vs.join(''));}
   G.WD.forEach(w=>{if(!w.syl.length)bad.push('no syllables '+w.w);if(!(w.r>=0))bad.push('rung '+w.w);if(w.spr&&!window.TAL.ALLSPR(w.spr))bad.push('sprite '+w.spr);
     const fs=window.__fullSpell(w.w);if(/[^א-ת]/.test(fs)||fs.length<w.plain.length)bad.push('fullSpell '+w.w+' → '+fs);});
   const dup=G.WD.map(w=>w.w).filter((w,i,a)=>a.indexOf(w)!==i);if(dup.length)bad.push('dup '+dup);
   const perRung=[0,1,2,3,4,5].map(r=>G.WD.filter(w=>w.r===r).length);
   const want={'חַלּוֹן':'חלון','דּוּבִּי':'דובי','סוּכָּה':'סוכה','שׁוּלְחָן':'שולחן','מִטָּה':'מיטה','קוּפָּה':'קופה','תַּנִּין':'תנין','שׁוֹקוֹלָד':'שוקולד','דְּבוֹרָה':'דבורה','גִּיטָרָה':'גיטרה','בּוּבָּה':'בובה','סְבִיבוֹן':'סביבון'};
   for(const [w,f] of Object.entries(want))if(window.__fullSpell(w)!==f)bad.push('fullSpell '+w+' → '+window.__fullSpell(w)+' (want '+f+')');
   /* every Hebrew word a child sees has nikud */
   const kid=[];G.RUNG.forEach(r=>kid.push(r.n,r.say));G.FINALS.forEach(f=>kid.push(f[1],f[3]));Object.values(G.ACTS).flat().forEach(a=>kid.push(a.name));
   G.STORIES.forEach(s=>{kid.push(s.t,...s.s);s.q.forEach(q=>kid.push(q[0],q[1],...q[2]));});Object.values(G.STORY_Q).flat().forEach(q=>kid.push(q[0],q[1],...q[2]));
   kid.forEach(t=>String(t).replace(/<[^>]+>/g,' ').split(/[\s,.!?:"()·←\-]+/).forEach(wd=>{if(/[א-ת]{2,}/.test(wd)&&!NIK.test(wd))bad.push('no nikud: '+wd+' in '+t);}));
   /* stories */
   G.STORIES.forEach((s,k)=>{if(!s.spr.every(x=>window.TAL.ALLSPR(x)))bad.push('story sprite '+k);if(s.s.length<5)bad.push('story short '+k);if(s.q.length!==3)bad.push('story q '+k);
     if(!s.q.some(q=>/^לָמָּה/.test(q[0])))bad.push('story no why '+k);if(!s.q.some(q=>/רִאשׁוֹן\?$/.test(q[0])))bad.push('story no first '+k);
     s.q.forEach(q=>{if(q[2].includes(q[1])||new Set(q[2]).size!==2)bad.push('story opts '+k+' '+q[0]);});});
   return {bad,n:G.WD.length,perRung,stories:G.STORIES.length,fs:G.WD.map(w=>w.w+'='+window.__fullSpell(w.w)).join(' ')};});
 ok(`word pool parses, sprites exist, voice text is clean (${D.n} words, per vowel step ${D.perRung.join('/')})`,!D.bad.filter(x=>!/^no nikud|^story/.test(x)).length,D.bad.filter(x=>!/^no nikud|^story/.test(x)).join(' | '));
 ok('every child-facing Hebrew word has nikud',!D.bad.filter(x=>/^no nikud/.test(x)).length,D.bad.filter(x=>/^no nikud/.test(x)).slice(0,8).join(' | '));
 ok(`new stories: 3 questions each with "why?" and "what happened first?" (${D.stories})`,D.stories>=14&&!D.bad.filter(x=>/^story/.test(x)).length,D.bad.filter(x=>/^story/.test(x)).join(' | '));
 ok('every vowel step has at least 12 new words',D.perRung.every(n=>n>=12),D.perRung.join('/'));
 if(process.env.GAPS_FS)console.log(D.fs);

 /* ---------- generators: nikud ladder + first sound ---------- */
 const G2=await p.evaluate(()=>{const G=window.GAPS,bad=[];const VO=['a','i','o','u','e','s'];const W=w=>G.WD.find(x=>x.w===w);
   const sem=s=>{const x=G.parse(s+'א');const sy=x.syl[0];return x.L[0].c+'|'+(sy?sy.v:'');};
   for(let r=0;r<6;r++)for(let t=0;t<40;t++)for(let i=0;i<8;i++){const q=G.nikQ(r,i,8);const tag='nik'+r+'/'+i;
     if(!(q.ans>=0&&q.ans<q.opts.length))bad.push(tag+' ans');if(new Set(q.opts).size!==q.opts.length)bad.push(tag+' dup '+q.opts);
     const w=W(q.chk.w);if(!w){bad.push(tag+' word');continue;}if(w.r>r)bad.push(tag+' word above step '+w.w);
     if(q.chk.t==='syl'){if(q.opts[q.ans]!==w.s1.s)bad.push(tag+' syl '+w.w);const ss=q.opts.map(sem);if(new Set(ss).size!==3)bad.push(tag+' same sound '+q.opts);
       q.opts.forEach(o=>{const v=sem(o).split('|')[1];if(VO.indexOf(v)>r)bad.push(tag+' unlearned vowel '+o);});}
     if(q.chk.t==='start'){if(q.opts[q.ans]!==w.w)bad.push(tag+' start');q.opts.forEach((o,k)=>{if(k===q.ans)return;const x=W(o);if(x&&G.sameSound(x.f,w.f)&&x.s1.v===w.s1.v)bad.push(tag+' two words start alike '+o+' '+w.w);});}
     if(q.chk.t==='word'&&q.opts[q.ans]!==w.w)bad.push(tag+' word');}
   for(const Lv of [1,2,3])for(let t=0;t<200;t++){const q=G.sndQ(Lv);const w=W(q.chk.w);const tag='snd'+Lv;if(new Set(q.opts).size!==q.opts.length)bad.push(tag+' dup');
     if(q.opts.length!==(Lv===2?4:3))bad.push(tag+' n');
     if(Lv<3){if(q.opts[q.ans]!==w.f)bad.push(tag+' letter');q.opts.forEach((a,k)=>q.opts.forEach((c,j)=>{if(k<j&&G.sameSound(a,c))bad.push(tag+' alike '+a+c);}));}
     else if(q.opts[q.ans]!==w.s1.s)bad.push(tag+' syl');}
   return [...new Set(bad)].slice(0,12);});
 ok('nikud ladder questions: right answer, learned vowels only, no two options that sound alike',!G2.length,G2.join(' | '));

 /* ---------- math generators ---------- */
 const M=await p.evaluate(()=>{const O=window.OREN;const rand=(a,b)=>a+Math.floor(Math.random()*(b-a+1));const mm=x=>Math.random()<x;const L_=t=>`<span class="ltr">${t}</span>`;
   const CH=(pr,opts,ans,h1,h2,ltr,cls)=>({k:'ch',pr,opts,ans,h1,h2,ltr:!!ltr,cls:cls||''});
   const GX=window.__GX||gapsMath({rand,pick:O.pick,shuffle:O.shuffle,mm,CH,SPR:O.SPR,L_,nb:n=>`<b>${n}</b>`});window.__GX=GX;const bad=[];const SIDES={tri:3,sq:4,rect:4,pent:5,hex:6};const cnt={};
   for(const u of Object.values(GX.units))for(let t=0;t<150;t++)for(let i=0;i<9;i++){const q=u.gen(i);const c=q.chk,tag=u.id;const right=q.opts[q.ans];cnt[c.t+':'+c.ask]=(cnt[c.t+':'+c.ask]||0)+1;
     if(q.k!=='ch'||!(q.ans>=0&&q.ans<q.opts.length))bad.push(tag+' ans');if(new Set(q.opts).size!==q.opts.length)bad.push(tag+' dup');
     if([q.pr,q.h1,q.h2,...q.opts].some(x=>/undefined|NaN/.test(x)))bad.push(tag+' text');
     if(c.t==='pict'){const ns=c.ns;const exp=c.ask==='count'?ns[c.j]:c.ask==='more'?ns[c.a]-ns[c.b]:c.ask==='total'?ns[c.a]+ns[c.b]:null;
       if(exp!=null&&+right!==exp)bad.push(tag+' pict '+c.ask);if(c.ask==='most'&&ns[q.ans]!==Math.max(...ns))bad.push(tag+' most');if(c.ask==='least'&&ns[q.ans]!==Math.min(...ns))bad.push(tag+' least');
       if(c.ask==='more'&&!(ns[c.a]>ns[c.b]))bad.push(tag+' more order');if(new Set(ns).size!==ns.length)bad.push(tag+' tie');}
     if(c.t==='shape'){if(c.ask==='which'){if(c.ts[q.ans]!==c.target)bad.push(tag+' which');if(c.target==='rect'&&c.ts.includes('sq'))bad.push(tag+' square offered as not-a-rectangle');}
       if(c.ask==='name'){if(c.ns[q.ans]!==c.target)bad.push(tag+' name');if(c.target==='sq'&&c.ns.includes('rect'))bad.push(tag+' rectangle offered as wrong name of a square');}
       if((c.ask==='sides'||c.ask==='corners')&&+right!==SIDES[c.target])bad.push(tag+' sides');if(c.ask==='sqrect'&&c.ts[q.ans]!=='sq')bad.push(tag+' sqrect');}
     if(c.t==='ruler'){if(parseInt(right.replace(/<[^>]+>/g,''))!==c.e-c.s)bad.push(tag+' ruler');if(c.e>10||c.s<0||c.e-c.s<2)bad.push(tag+' ruler range');}
     if(c.t==='long'&&c.Ls[q.ans]!==(c.ask==='long'?Math.max(...c.Ls):Math.min(...c.Ls)))bad.push(tag+' long');
     if(c.t==='bal'&&q.ans!==(c.ask==='heavy'?c.hv:1-c.hv))bad.push(tag+' bal');
     if(c.t==='bal3'&&c.idx[q.ans]!==(c.ask==='heavy'?0:2))bad.push(tag+' bal3');}
   return {bad:[...new Set(bad)].slice(0,12),cnt,units:Object.keys(GX.units)};});
 ok(`math units generate correct questions (${M.units.join(', ')})`,!M.bad.length,M.bad.join(' | '));
 ok('every math question kind appears',['pict:count','pict:most','pict:least','pict:more','pict:total','shape:which','shape:name','shape:sides','shape:corners','shape:sqrect','ruler:undefined','long:long','long:short','bal:heavy','bal:light','bal3:heavy','bal3:light'].every(k=>M.cnt[k]),JSON.stringify(M.cnt));

 /* ---------- math in the real game modes ---------- */
 const inWorld=await p.evaluate(()=>!!window.__oren4.ALLU.find(u=>u.id==='pict-1'));
 if(inWorld){const lv=await p.evaluate(()=>window.__oren4.ALLLV.filter(l=>/^(pict|shp|len)-/.test(l.id)).map(l=>[l.id,l.type,l.mode||'']));ok('math units are levels in the worlds',lv.length===18,JSON.stringify(lv));}
 for(const [k,uid] of [['learn','pict-2'],['mine','shp-1'],['run','len-1'],['build','len-2'],['learn','shp-2'],['learn','pict-1']]){
   await p.evaluate(([k,uid])=>{const O=window.__oren4;const GX=window.__GX;const real=O.ALLLV.find(l=>l.id.startsWith(uid+'-'));const host=real&&k==='learn'?real:(O.ALLLV.find(l=>l.type==='game'&&l.mode===k)||O.ALLLV.find(l=>l.type==='learn'));
     let qs;for(let t=0;t<50;t++){qs=[0,1,2,3,4].map(i=>GX.units[uid].gen(i+3));if(uid!=='len-2'||qs[0].chk.t==='bal3')break;}O.playLevel(host,qs);},[k,uid]);
   await sleep(900);const good=await p.evaluate(()=>{const qa=document.querySelector('#qa');if(!qa)return 'no qa';const r=qa.getBoundingClientRect();const bs=[...qa.querySelectorAll('.chb')];
     const vis=bs.every(b=>{const x=b.getBoundingClientRect();return x.width>30&&x.bottom<=innerHeight+2&&x.right<=innerWidth+2&&x.left>=-2;});return bs.length>=2&&vis?'':'buttons '+bs.length+' off screen';});
   ok(`${uid} plays in ${k} mode, choices fit the screen`,!good,good);await shot('math-'+uid+'-'+k);
   await p.evaluate(()=>{const P=window.__oren4.play;const c=document.querySelector('#qa .chs');if(P&&c)c.children[P.qs[P.i].ans].click();});await sleep(500);}
 await p.evaluate(()=>window.OREN.showMap());await sleep(300);

const EMIT=await p.evaluate(()=>/tlDone/.test(String(window.TAL.record)));   /* older builds do not announce finished rounds */
 /* ---------- nikud ladder: menu → intro → round → next step unlocks ---------- */
 await p.evaluate(()=>window.GAPS.nikMenu(()=>window.OREN.showMap()));await shot('nik-menu');
 ok('ladder menu: only the current vowel and one button',await p.evaluate(()=>document.querySelectorAll('#sTal .gp-cur').length===1&&document.querySelectorAll('#sTal .bigbtn').length===1&&/קָמָץ/.test(document.querySelector('#sTal .gp-cur').textContent)));
 await p.click('#sTal .btnrow .bigbtn');await sleep(300);ok('first time on a step shows the new vowel',await p.locator('#sTal .gp-intro').count()===1);await shot('nik-intro');
 await p.click('#sTal .btnrow .bigbtn');await sleep(400);await shot('nik-q-hear');
 let done=await quizLoop(80,async k=>{if(k===4)await shot('nik-q-see');if(k===10)await shot('nik-q-word');});
 ok('ladder round finishes and records nik-1 + read-nik',done&&((await tl('nik-1'))||{}).s===3&&(!EMIT||((await tl('read-nik'))||{}).s===3),JSON.stringify([await tl('nik-1'),await tl('read-nik')]));
 await closeOv();await sleep(300);
 ok('step 2 (chirik) is next after a good round',await p.evaluate(()=>/חִירִיק/.test((document.querySelector('#sTal .gp-cur')||{}).textContent||'')));
 await p.evaluate(()=>{const t=window.TAL.S().tl;for(let k=1;k<=5;k++)t['nik-'+k]={s:3,n:1};window.GAPS.nikMenu(()=>window.OREN.showMap());});await shot('nik-menu-top');
 await p.evaluate(()=>window.GAPS.nikRound(5,()=>window.OREN.showMap()));await sleep(300);done=await quizLoop();ok('shva step plays',done);await closeOv();

 /* ---------- what sound starts the word ---------- */
 await p.evaluate(()=>window.GAPS.sndRound(()=>window.OREN.showMap()));await sleep(300);await shot('snd-1');done=await quizLoop();
 ok('first-sound round records snd-1 and read-sound',done&&((await tl('snd-1'))||{}).s>=2&&(!EMIT||!!(await tl('read-sound'))));await closeOv();
 await p.evaluate(()=>window.GAPS.sndRound(()=>window.OREN.showMap()));await sleep(300);await shot('snd-2');ok('first sound levels up to 4 letters, in a balanced block',await p.evaluate(()=>{const b=[...document.querySelectorAll('#sTal .chs .chb')];const tops=new Set(b.map(x=>Math.round(x.getBoundingClientRect().top)));return b.length===4&&(tops.size===1||tops.size===2&&b.filter(x=>Math.round(x.getBoundingClientRect().top)===[...tops][0]).length===2);}));
 await p.evaluate(()=>window.GAPS.sndRound(()=>window.OREN.showMap(),3));await sleep(300);await shot('snd-3');done=await quizLoop();ok('first-sound syllable level plays',done);await closeOv();

 /* ---------- spelling ---------- */
 const spellRun=async(Lv,wrongFinal)=>{await p.evaluate(Lv=>window.GAPS.spell(()=>window.OREN.showMap(),Lv),Lv);await sleep(400);let sawFin=false;
   for(let k=0;k<200&&!(await ovOpen());k++){const r=await p.evaluate(wf=>{const S=window.__spell;if(!S||!S.row.isConnected)return 0;const need=S.need[S.k];if(need==null)return 0;
       const F={'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'};if(wf&&S.k===S.need.length-1&&F[need]){const w=[...S.row.children].find(b=>!b.disabled&&b.dataset.c===F[need]);if(w&&!w.dataset.t){w.dataset.t=1;w.click();return 2;}}
       const b=[...S.row.children].find(b=>!b.disabled&&b.dataset.c===need);if(b)b.click();return 1;},wrongFinal);
     if(r===2){await sleep(100);sawFin=sawFin||await p.evaluate(()=>/אוֹת סוֹפִית/.test(document.querySelector('#sTal .lcap').textContent));if(sawFin)await shot('spell-final');}await sleep(r?90:200);}
   return sawFin;};
 await p.evaluate(()=>window.GAPS.spell(()=>window.OREN.showMap(),3));await sleep(400);await shot('spell-3');ok('spelling letters in equal rows',await p.evaluate(()=>{const b=[...document.querySelectorAll('#sTal .gp-tiles .chb')];const m={};b.forEach(x=>{const k=Math.round(x.getBoundingClientRect().top);m[k]=(m[k]||0)+1;});const c=Object.values(m);return Math.max(...c)-Math.min(...c)<=1&&b.every(x=>x.getBoundingClientRect().right<=innerWidth);}));
 await p.evaluate(()=>window.GAPS.spell(()=>window.OREN.showMap()));await sleep(400);await shot('spell-1');
 await spellRun(1);ok('spelling round records spell-1 and write-spell',((await tl('spell-1'))||{}).s>=2&&(!EMIT||!!(await tl('write-spell'))));await closeOv();
 let fin=false;for(let t=0;t<4&&!fin;t++){fin=await spellRun(2,true);await closeOv();}
 ok('spelling: a regular letter at the end of a word gets the final-letter note',fin);
 await spellRun(3);ok('spelling level 3 plays',!!(await tl('spell-3')));await closeOv();

 /* ---------- word race (honor mode + a fake microphone) ---------- */
 await p.evaluate(()=>{window.GAPS.dict=null;window.GAPS.race(()=>window.OREN.showMap());});await sleep(300);await shot('race-start');
 await p.click('#sTal .btnrow .bigbtn');await sleep(300);await shot('race-run');
 await p.evaluate(()=>{for(let k=0;k<5;k++)window.__race.ok.click();});   /* all five in one tick: under load, separate 80ms sleeps can add up past half a second */
 const fast=await p.evaluate(()=>window.__race.count);for(let k=0;k<4;k++){await sleep(520);await p.evaluate(()=>window.__race.ok.click());}
 const c2=await p.evaluate(()=>window.__race.count);ok('word race: taps faster than half a second are ignored',fast<=1&&c2>=4,fast+' '+c2);
 await p.evaluate(()=>window.__race.end());await sleep(300);const fl=await tl('read-flu');ok('word race records the personal best',fl&&fl.b===c2,JSON.stringify(fl));await shot('race-end');await closeOv();
 await p.evaluate(()=>{const H={};const d={onPartial:f=>H.p=f,onFinal:f=>H.f=f,onState:f=>H.s=f,start:()=>Promise.resolve(),stop:()=>{}};window.__fakeH=H;window.GAPS.dict=d;window.GAPS.race(()=>window.OREN.showMap());});
 await p.click('#sTal .btnrow .bigbtn');await sleep(300);
 const mic=await p.evaluate(async()=>{const H=window.__fakeH;const T=window.TAL;let said='';for(let k=0;k<3;k++){said+=' '+T.plainHe(window.__race.w.w);H.p({text:said});await new Promise(r=>setTimeout(r,30));}H.p({text:said+' בלה'});return window.__race.count;});
 ok('word race with the microphone counts each word it hears',mic===3,'count '+mic);await p.evaluate(()=>window.__race.end());await sleep(200);await closeOv();

 /* ---------- final letters + stories render ---------- */
 const finOK=await p.evaluate(()=>{const G=window.GAPS;return G.FINALS.every(f=>G.finNote(f[0]).includes(f[0])&&G.finNote(f[0]).includes(f[2]))&&G.finNote('א')==='';});ok('final-letter note for ך ם ן ף ץ',finOK);
 const traced=await p.evaluate(()=>{const ab=window.TAL.WRITE&&window.TAL.WRITE.AB;return ab?['ך','ם','ן','ף','ץ'].every(l=>ab.some(x=>x[0]===l)):null;});
 if(traced!==null)ok('final letters are in the writing house',traced);
 const st=await p.evaluate(()=>window.TAL.ACT['story-19']?20:(window.TAL.STORIES||[]).length);if(st)ok('20 bedtime stories',st>=20,st);

 ok('no JS errors',!errs.length,errs.slice(0,4).join(' | '));
 await b.close();L.finish('gaps',out);})();
