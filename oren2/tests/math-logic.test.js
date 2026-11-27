// Generates every math question many times and checks answers, hints, steps and options.
const L = require('./lib');
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(L.URL);
const r=await p.evaluate(()=>{const O=window.__oren4;const bad=[];let n=0;const kinds={};const seenT={};
 const ev=expr=>{const t=expr.trim().split(/\s+/);const vals=[],ops=[];for(let i=0;i<t.length;i++){if(i%2===0)vals.push(Number(t[i]));else ops.push(t[i]);}
   if(vals.some(isNaN))return NaN;for(let i=0;i<ops.length;){if(ops[i]==='×'||ops[i]===':'){const v=ops[i]==='×'?vals[i]*vals[i+1]:vals[i]/vals[i+1];vals.splice(i,2,v);ops.splice(i,1);}else i++;}
   let v=vals[0];for(let i=0;i<ops.length;i++)v=ops[i]==='+'?v+vals[i+1]:v-vals[i+1];return v;};
 const checkLines=(lines,q,ans,tag)=>{(lines||[]).forEach((ln,i)=>{const [lhs,rhs]=ln.split('=');const v=ev(lhs);
     if(isNaN(v)){bad.push(tag+' unparsable "'+ln+'"');return;}if(!Number.isInteger(v)||v<0)bad.push(tag+' nonint/neg "'+ln+'"');
     if(rhs.trim()==='?'){if(i!==lines.length-1)bad.push(tag+' ? not last');if(ans!=null&&v!==ans)bad.push(tag+' final "'+ln+'" ans '+ans+' '+JSON.stringify(q).slice(0,200));}
     else if(v!==Number(rhs))bad.push(tag+' wrong step "'+ln+'"');});};
 const tstr=(h,m)=>`${h}:${String(m).padStart(2,'0')}`;const h12=h=>((h-1+120)%12)+1;
 for(const lv of O.ALLLV){
  for(let t=0;t<30;t++){const qs=O.uniq(lv.gen,lv.n);if(qs.length<lv.n)bad.push('short '+lv.id+' '+qs.length);
   for(const q of qs){n++;kinds[q.k]=(kinds[q.k]||0)+1;const tag=lv.id;
    const nums=[q.l,q.r,q.res,q.a,q.b,q.c,q.p,q.d,q.qq,q.ans].filter(v=>v!==undefined&&q.k!=='ch');
    if(nums.some(v=>!Number.isInteger(v)||v<0||v>999))bad.push(tag+' range '+JSON.stringify(q).slice(0,150));
    if(q.k!=='col')for(const lev of [1,2]){const hh=O.hintHTML(q,lev);if(!hh||/undefined|NaN|Infinity|\[object/.test(hh))bad.push(tag+' hint'+lev+' '+JSON.stringify(q).slice(0,150));}
    if(q.k==='bin'){const res=q.op==='+'?q.l+q.r:q.op==='−'?q.l-q.r:q.op==='×'?q.l*q.r:q.l/q.r;if(res!==q.res)bad.push(tag+' math');
      if((q.miss==='res'?q.res:q.miss==='r'?q.r:q.l)!==q.ans)bad.push(tag+' ans');if(q.op===':'&&q.r===0)bad.push(tag+' div0');
      const d=O.hintData(q);if(d.s.length)checkLines(d.s,q,q.ans,tag);
      if(['bin'].includes(q.k)){const bo=O.bubbleOpts(q);if(bo.length!==4||new Set(bo).size!==4||!bo.includes(q.ans)||bo.some(v=>v<0))bad.push(tag+' bubbles '+bo);}}
    if(q.k==='add3'){if(q.a+q.b+q.c!==q.ans)bad.push(tag+' add3');checkLines(O.hintData(q).s,q,q.ans,tag);}
    if(q.k==='rem'){if(q.d*q.qq+q.r!==q.p||q.r>=q.d)bad.push(tag+' rem');checkLines(O.hintData(q).s,q,null,tag);}
    if(q.k==='word'){if(!Number.isInteger(q.ans)||q.ans<0||(!q.nt&&q.ans<=0))bad.push(tag+' word ans '+q.ans);
      if(/undefined|NaN/.test(q.tx+q.h1+q.u))bad.push(tag+' word text');checkLines(q.st,q,q.st.some(l=>l.includes('?'))?q.ans:null,tag);
      if(!q.nt){const textNums=[...q.tx.matchAll(/<b>(\d+)<\/b>/g)].map(m=>+m[1]);const inter=q.st.slice(0,-1).map(l=>+l.split('=')[1]);
        q.st.forEach(l=>l.split('=')[0].trim().split(/\s+/).filter((x,i)=>i%2===0).map(Number).forEach(v=>{if(!textNums.includes(v)&&!inter.includes(v))bad.push(tag+' step number '+v+' not in text');}));}
      const bo=O.bubbleOpts(q);if(new Set(bo).size!==4||!bo.includes(q.ans))bad.push(tag+' wbubbles');}
    if(q.k==='eq'){const qi=q.toks.indexOf('?');if(qi<0||q.toks.filter(x=>x==='?').length!==1)bad.push(tag+' eq ?');
      const toks=q.toks.map(x=>x==='?'?q.ans:x);
      if(toks.includes('=')){const e=toks.indexOf('=');const L=toks.slice(0,e).join(' '),R=toks.slice(e+1).join(' ');if(ev(L)!==ev(R))bad.push(tag+' eq false '+toks.join(' '));}
      else{const nums2=toks.filter(x=>x!==',');const d=nums2[1]-nums2[0];for(let i=1;i<nums2.length;i++)if(nums2[i]-nums2[i-1]!==d)bad.push(tag+' seq '+nums2.join(','));if(nums2.some(v=>v<0||v>999))bad.push(tag+' seq range');}
      checkLines(q.st,q,q.ans,tag);}
    if(q.k==='ch'){if(!(q.ans>=0&&q.ans<q.opts.length))bad.push(tag+' ch idx');if(new Set(q.opts).size!==q.opts.length)bad.push(tag+' ch dup '+q.opts);
      const c=q.chk;if(!c){bad.push(tag+' no chk');continue;}const right=q.opts[q.ans];
      if(c.t==='eo'&&right!==(c.n%2?'אִי-זוּגִי':'זוּגִי'))bad.push(tag+' eo');
      if(c.t==='cmp'&&right!==(c.a<c.b?'<':c.a>c.b?'>':'='))bad.push(tag+' cmp');
      if(c.t==='most'&&+right!==(c.big?Math.max(...c.ns):Math.min(...c.ns)))bad.push(tag+' most');
      if(c.t==='clock'&&right!==tstr(c.h,c.m))bad.push(tag+' clock');
      if(c.t==='add'&&right!==tstr(h12(c.h+c.k),c.m))bad.push(tag+' clockadd');
      if(c.t==='frac'&&right!==['חֲצִי','שְׁלִישׁ','רֶבַע'][c.parts-2])bad.push(tag+' frac');
      if(c.t==='setclock'){const hm=lv.u.id==='time-h'?[0]:lv.u.id==='time-half'?[0,30]:[0,15,30,45];if(q.opts.length!==1||!(c.h>=1&&c.h<=12)||!hm.includes(c.m)||!q.hand||q.hand.t!=='clock')bad.push(tag+' setclock '+JSON.stringify(c));}
      if(c.t==='pzeat'&&(q.opts.length!==1||![2,3,4].includes(c.parts)||!q.hand||q.hand.eat!==1))bad.push(tag+' pzeat '+JSON.stringify(c));
      if(c.t==='pzleft'&&(+right!==c.parts-1||![2,3,4].includes(c.parts)))bad.push(tag+' pzleft '+JSON.stringify(c));
      if(c.t==='tfill'&&(+right!==10-c.n||c.n<3||c.n>9))bad.push(tag+' tfill '+JSON.stringify(c));
      if(c.t==='coins'){const w=c.want;if(q.opts.length!==1||!q.hand||q.hand.t!=='coins'||q.hand.want!==w||!(w>=2&&w<=20)||O.COIN.sum(O.COIN.make(w))!==w)bad.push(tag+' coins '+JSON.stringify(c));}
      if(c.t==='change'){const w=c.paid-c.price;if(q.opts.length!==1||!q.hand||q.hand.want!==w||![5,10].includes(c.paid)||!(c.price>=2&&c.price<c.paid))bad.push(tag+' change '+JSON.stringify(c));}
      if(c.t==='coinsum'&&+right!==O.COIN.sum(c.coins))bad.push(tag+' coinsum '+JSON.stringify(c));
      if(c.t==='chg'&&+right!==c.paid-c.price)bad.push(tag+' chg '+JSON.stringify(c));
      if(c.t)seenT[lv.u.id+':'+c.t]=1;
      if(c.t==='clock'||c.t==='add'){if(q.opts.some(o=>!/^([1-9]|1[0-2]):[0-5][05]$/.test(o)))bad.push(tag+' bad time opt '+q.opts);}}
    if(q.k==='col'){const st=O.colInit(q);if((q.op==='+'?q.a+q.b:q.a-q.b)!==q.res)bad.push(tag+' col math');if(q.op==='−'&&st.R.length!==st.A.length)bad.push(tag+' lead0');
      let carry=0;for(let c=0;c<st.R.length;c++){let digit;if(q.op==='+'){const s=(st.A[c]|0)+(st.B[c]|0)+carry;digit=s%10;carry=s>=10?1:0;if(c>=st.A.length&&c>=st.B.length)digit=s;}
        else{if(O.colNeedBorrow(st,c)){st.tops[c]+=10;let j=c+1;while(st.tops[j]===0){st.tops[j]=9;j++;}st.tops[j]-=1;}digit=st.tops[c]-(st.B[c]|0);}if(digit!==st.R[c])bad.push(tag+' col digit');}}
   }}}
 // teacher mode
 for(const op of ['+','−','×',':'])for(const hero of O.HEROES){const t=O.storyFor(op,hero,'תַּפּוּחִים',12,3);if(/undefined/.test(t))bad.push('story '+op);}
 if(O.teachCheck(':',10,3,false)==='')bad.push('teachCheck div');if(O.teachCheck('−',3,10,false)==='')bad.push('teachCheck sub');if(O.teachCheck('+',5,4,false)!=='')bad.push('teachCheck ok');
 /* #267: the hands-on questions are mixed into the existing levels (clock h / half / q / boss, fractions + boss) */
 for(const k of ['time-h:setclock','time-half:setclock','time-q:setclock','time-boss:setclock','time-frac:pzeat','time-frac:pzleft','time-frac:frac','time-boss:pzeat','time-h:clock'])if(!seenT[k])bad.push('#267 never seen '+k);
 /* #417 fill-the-ten questions in the make-ten unit; #418 coins: exact payments first (word-c1), then simple change (word-c2) */
 for(const k of ['add-2:tfill','word-c1:coins','word-c1:coinsum','word-c2:change','word-c2:chg'])if(!seenT[k])bad.push('#417/#418 never seen '+k);
 const wi=O.WORLDS.find(w=>w.id==='word').units.map(u=>u.id);if(!(wi.indexOf('word-c1')>=0&&wi.indexOf('word-c1')<wi.indexOf('word-c2')))bad.push('#418 coin units order '+wi);
 return {n,levels:O.ALLLV.length,kinds,bad:[...new Set(bad)].slice(0,30),cnt:new Set(bad).size};});
/* #415 the wrong-answer classifier (a table of examples), #417 the ten-frame logic, #418 coin logic and the voice of the prices */
const r2=await p.evaluate(()=>{const O=window.__oren4,bad=[];const K=O.mistakeKind,B=(l,op,r)=>{const res=op==='+'?l+r:l-r;return {k:'bin',l,op,r,res,miss:'res',ans:res};};
 const T=[[7,'+',5,13,'one'],[7,'+',5,11,'one'],[34,'+',20,64,'ten'],[34,'+',20,44,'ten'],[30,'+',12,24,'swap'],[52,'−',7,54,'swap'],
   [13,'−',5,18,'op'],[52,'−',7,59,'op'],[52,'−',7,35,'ten'],[13,'−',5,9,'one'],[7,'+',5,20,null],[7,'+',5,12,null],[30,'+',11,15,null],[20,'+',2,22,null],[40,'+',0,4,null]];
 for(const [l,op,r,g,k] of T){const got=K(B(l,op,r),g);if(got!==k)bad.push(`#415 ${l}${op}${r} given ${g}: ${got} (want ${k})`);}
 /* a choice (no exercise behind it): only the number is compared */
 if(K({k:'ch'},36,63)!=='swap'||K({k:'ch'},8,7)!=='one'||K({k:'ch'},5,9)!==null)bad.push('#415 choice classify');
 for(const k of ['one','ten','swap','op'])if(!O.MK[k]||!/[ְ-ׇ]/.test(O.MK[k]))bad.push('#415 hint text '+k);
 const HT=new Set(window.HELP_TEXTS||[]);for(const t of [...Object.values(O.MK),...Object.values(O.TFC)])if(!HT.has(t))bad.push('not in pregen list (HELP_TEXTS): '+t);
 const F=O.TF;const eq=(a,b,tag)=>{if(JSON.stringify(a)!==JSON.stringify(b))bad.push('#417 '+tag+' '+JSON.stringify(a)+' want '+JSON.stringify(b));};
 eq(F.need('+',8,5),[2,3],'need 8+5');eq(F.at('+',8,5,0),{f:[8,0],step:1},'8+5 t0');eq(F.at('+',8,5,2),{f:[10,0],step:2},'8+5 t2');eq(F.at('+',8,5,5),{f:[10,3],step:3},'8+5 t5');
 eq(F.lines('+',8,5),['8 + 2 = 10','10 + 3 = 13'],'lines 8+5');
 eq(F.need('−',13,5),[3,2],'need 13-5');eq(F.at('−',13,5,0),{f:[10,3],step:1},'13-5 t0');eq(F.at('−',13,5,3),{f:[10,0],step:2},'13-5 t3');eq(F.at('−',13,5,5),{f:[8,0],step:3},'13-5 t5');
 eq(F.lines('−',13,5),['13 − 3 = 10','10 − 2 = 8'],'lines 13-5');
 for(const id of ['add-2','sub-2']){const u=O.ALLU.find(x=>x.id===id);for(let i=0;i<300;i++){const q=u.gen(i);if(q.k!=='bin')continue;if(!F.ok(q)){bad.push('#417 not across ten '+id+' '+JSON.stringify(q));continue;}
   const add=q.op==='+',l=add?Math.max(q.l,q.r):q.l,r=add?Math.min(q.l,q.r):q.r,n=F.need(q.op,l,r),e=F.at(q.op,l,r,n[0]+n[1]);
   if(n[0]<1||n[1]<1||e.step!==3||e.f[0]+e.f[1]!==q.ans)bad.push('#417 frame end '+id+' '+JSON.stringify([q.l,q.op,q.r,e]));}}
 const C=O.COIN;for(let n=2;n<=20;n++){const m=C.make(n);if(C.sum(m)!==n||m.some(v=>![1,2,5,10].includes(v)))bad.push('#418 make '+n);}
 const spoken=[];for(const id of ['word-c1','word-c2']){const u=O.ALLU.find(x=>x.id===id);for(let i=0;i<200;i++){const q=u.gen(i);const t=window.__fullSpell(O.qSpeech(q));spoken.push(t);if(/\d/.test(t))bad.push('#418 digits in voice: '+t);if(!/שקל/.test(t))bad.push('#418 no shekel word: '+t);}}
 return {bad:[...new Set(bad)].slice(0,30),cnt:new Set(bad).size,ex:spoken.slice(0,2)};});
/* #416 the word problems of the path count the thing of the story scene (core units + learn.js); no story thing -> the old things;
   the new story sentences are random (numbers), so pregen leaves them to on-demand voice like the other random math (RANDOM) */
const RANDOM=require('../cf/tools/pregen.js').RANDOM;
const r3=await p.evaluate(src=>{const O=window.__oren4,M=window.STORYMIX,LN=window.LEARN,RANDOM=new RegExp(src);const bad=[],was=M.thing;let used=0,n=0;
 const strip=s=>String(s).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 const things=[...Object.values(M.THING),...M.CH_THING];const units=O.ALLU.filter(u=>/^word-(\d|boss)/.test(u.id));
 for(const t of things){M.thing=()=>t;
   for(const u of units)for(let i=0;i<40;i++){const q=u.gen(i);if(q.k!=='word')continue;n++;if(q.tx.includes(t[1]))used++;if(/undefined|NaN/.test(q.tx+q.u))bad.push('text '+q.tx);}
   for(let lv=1;lv<=5;lv++){const q=LN.wordQ(lv);if(!/^sc-/.test(q.tid)||!q.tx.includes(t[1]))bad.push('learn not the scene thing '+t[1]+' '+q.tid);
     const said=window.__fullSpell(strip(q.tx));if(!RANDOM.test(said))bad.push('pregen would keep a random sentence: '+said);}}
 M.thing=()=>null;let old=0;for(const u of units.filter(u=>/^word-[0-4]$/.test(u.id)))for(let i=0;i<40;i++){const q=u.gen(i);{const hit=q.k==='word'&&things.find(t=>q.tx.includes(t[1])&&!/תַּפּוּחִים|צְדָפִים|בָּלוֹנִים|עוּגִיּוֹת|סֻכָּרִיּוֹת/.test(t[1]));if(hit){old++;bad.push('fb '+hit[1]+': '+q.tx.slice(0,60));}}}
 if(old)bad.push('fallback still uses scene things '+old);if(LN.wordQ(2).tid.startsWith('sc-'))bad.push('learn fallback');
 M.thing=was;const fish=(()=>{const s0=O.save.mix;O.save.mix={c:1,s:2};const t=M.thing();O.save.mix=s0;return t&&t[1];})();if(fish!=='דָּגִים')bad.push('scene 1.2 thing '+fish);
 return {bad:[...new Set(bad)].slice(0,10),share:Math.round(100*used/Math.max(1,n))};},RANDOM.source);
await b.close();
L.finish('math-logic',[(r3.bad.length===0&&r3.share>=30?'PASS':'FAIL')+` #416 word problems count the story scene's thing (${r3.share}% of core word questions), old things without one, pregen leaves them to on-demand voice`+(r3.bad.length?' — '+r3.bad.join(' | '):''),(r2.cnt===0?'PASS':'FAIL')+' #415 mistake classifier, #417 ten-frame, #418 coins logic + prices said as words ('+r2.ex.join(' / ')+')'+(r2.cnt?' — '+r2.bad.join(' | '):''),(r.cnt===0?'PASS':'FAIL')+` all generated math questions valid (${r.n} checked across ${r.levels} levels)`+(r.cnt?' — '+r.bad.join(' | '):''),(errs.length?'FAIL':'PASS')+' no JS errors '+errs.slice(0,3).join(' | ')]);})();
