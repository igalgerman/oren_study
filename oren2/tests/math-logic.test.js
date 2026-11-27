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
 return {n,levels:O.ALLLV.length,kinds,bad:[...new Set(bad)].slice(0,30),cnt:new Set(bad).size};});
await b.close();
L.finish('math-logic',[(r.cnt===0?'PASS':'FAIL')+` all generated math questions valid (${r.n} checked across ${r.levels} levels)`+(r.cnt?' — '+r.bad.join(' | '):''),(errs.length?'FAIL':'PASS')+' no JS errors '+errs.slice(0,3).join(' | ')]);})();
