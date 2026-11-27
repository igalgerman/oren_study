/* ===== THINK: reading comprehension, thinking-skill tracks, the champions' challenge (timed) and skills tracking =====
   Part 1 (window.THINK) is pure logic — generators, levels, nikud stages, the day log — and runs without a page (unit tests).
   Part 2 hooks it into the game: activities in the library and the thinking tower, and the parent summary. */
window.THINK=(()=>{'use strict';
const B=window.THINK_BANK;
let rnd=Math.random;
const ri=(a,b)=>a+Math.floor(rnd()*(b-a+1));
const pk=a=>a[Math.floor(rnd()*a.length)];
/* a random item of a finite bank, chosen by the learning engine (LEARN.pickItem: wrong ones back on schedule, unseen first, no repeats); plain random without it.
   The next mk() question carries {bank, bkey}; the screen records the first answer with LEARN.seen (#360) */
const bkey=x=>JSON.stringify(x).slice(0,80);let LB=null;
function lpick(bank,arr){LB=null;const LN=typeof window!=='undefined'&&window.LEARN;if(LN&&LN.pickItem&&arr.length>1){try{const r=LN.pickItem(bank,arr.map(x=>({k:bkey(x)})));const it=r&&arr.find(x=>bkey(x)===r.item.k);if(it){LB={bank,bkey:r.item.k};return it;}}catch(e){}}return pk(arr);}
const shuf=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const L=t=>`<span class="ltr">${t}</span>`;
const MAXLV=5;

/* ---------- options ---------- */
/* opt kinds: {t:'tile',v:{s,c,n,z,r,f}} · {t:'spr',v:key,n,z,fl,up} · {t:'txt',v} · {t:'num',v} */
const tile=o=>Object.assign({s:'circle',c:0,n:1,z:1,r:0,f:1},o);
const T_=o=>({t:'tile',v:tile(o)});
const okey=o=>o.t==='tile'?'T'+['s','c','n','z','r','f'].map(k=>o.v[k]).join(','):o.t==='spr'?`S${o.v},${o.n|0},${o.z|0},${o.fl|0},${o.up|0}`:o.t[0]+String(o.v);
/* final question: answer + distractors (already distinct), shuffled */
function mk(sk,lv,o){const all=[o.ans,...o.ds];const keys=all.map(okey);if(new Set(keys).size!==keys.length)throw new Error('dup opts '+sk+lv+' '+keys);
  const opts=shuf(all);const lb=LB;LB=null;return Object.assign({sk,lv},lb,o,{opts,ans:opts.findIndex(x=>okey(x)===okey(o.ans)),ds:undefined});}
const nOpts=lv=>lv<=2?3:4;

/* ---------- shapes & colors ---------- */
const COL=['#e4572e','#3a8fc4','#4fae4f','#ffd166','#8e6fd1'];
const COLN=['אָדֹם','כָּחֹל','יָרֹק','צָהֹב','סָגֹל'];
const SHP=['circle','square','tri','diamond','star'];
/* a tile that differs from t in one of the given attributes */
const RANGE={s:SHP,c:[0,1,2,3,4],n:[1,2,3,4],z:[0,1,2],r:[0,90,180,270],f:[0,1]};
function vary(t,attrs,avoid){for(let k=0;k<60;k++){const a=pk(attrs);const v=pk(RANGE[a]);if(v===t[a])continue;const x=tile(Object.assign({},t,{[a]:v}));const key=okey({t:'tile',v:x});if(avoid.has(key))continue;avoid.add(key);return x;}return null;}
function tileDs(ans,attrs,n,extra){const avoid=new Set([okey({t:'tile',v:ans})]);const ds=[];
  for(const e of extra||[]){const k=okey({t:'tile',v:e});if(!avoid.has(k)&&ds.length<n){avoid.add(k);ds.push(e);}}
  while(ds.length<n){const x=vary(ans,attrs,avoid);if(!x)break;ds.push(x);}
  while(ds.length<n){const x=vary(ans,['s','c','n'],avoid);ds.push(x);}
  return ds.map(v=>({t:'tile',v}));}

/* ---------- number series ---------- */
function numDs(a,n,cands){const out=[];const seen=new Set([a]);for(const c of [...cands,a+1,a-1,a+2,a-2,a+10,a-10,a+3,a-3,a+5])if(c>=0&&c<=999&&!seen.has(c)&&out.length<n){seen.add(c);out.push(c);}return out.map(v=>({t:'num',v}));}
function genSer(lv){let sq,rule,cands=[];const step=d=>d>0?'+'+d:'−'+(-d);
  const arith=(st,d,len)=>Array.from({length:len},(_,j)=>st+d*j);
  if(lv===1){const d=pk([1,2]);sq=arith(ri(1,6),d,6);rule=`${L(step(d))} בְּכָל צַעַד`;cands=[sq[5]+1];}
  else if(lv===2){if(rnd()<.7){const d=pk([2,3,5,10]);sq=arith(d===10?10*ri(0,3):ri(0,10),d,6);rule=`${L(step(d))} בְּכָל צַעַד`;}else{const d=pk([1,2]);sq=arith(ri(12,20),-d,6);rule=`${L(step(-d))} בְּכָל צַעַד`;}}
  else if(lv===3){const d=ri(2,9)*(rnd()<.35?-1:1);const st=d>0?ri(1,30):ri(-d*5+2,60);sq=arith(st,d,6);rule=`${L(step(d))} בְּכָל צַעַד`;}
  else if(lv===4){const k=pk(['alt','alt','dbl','big']);
    if(k==='alt'){let a=ri(1,5),b=ri(1,5);while(b===a)b=ri(1,5);sq=[ri(1,10)];for(let j=1;j<6;j++)sq.push(sq[j-1]+(j%2?a:b));rule=`הַקְּפִיצוֹת מִתְחַלְּפוֹת: ${L(step(a)+', '+step(b))}`;}
    else if(k==='dbl'){sq=[ri(1,3)];for(let j=1;j<6;j++)sq.push(sq[j-1]*2);rule='כָּל מִסְפָּר הוּא פִּי 2 מֵהַקּוֹדֵם';}
    else{const d=pk([10,20,25,15]);sq=arith(ri(0,4)*d,d,6);rule=`${L(step(d))} בְּכָל צַעַד`;}}
  else{const k=pk(['grow','inter','updown']);
    if(k==='grow'){sq=[ri(1,10)];for(let j=1;j<6;j++)sq.push(sq[j-1]+j);rule=`הַקְּפִיצוֹת גְּדֵלוֹת: ${L('+1, +2, +3, +4...')}`;}
    else if(k==='inter'){const a=ri(1,5),b=ri(15,20);sq=[];for(let j=0;j<6;j++)sq.push(j%2?b-(j>>1):a+(j>>1));rule='יֵשׁ כָּאן שְׁתֵּי סְדָרוֹת שֶׁמִּתְחַלְּפוֹת: אַחַת עוֹלָה וְאַחַת יוֹרֶדֶת';}
    else{const a=ri(3,6),b=ri(1,a-1);sq=[ri(1,10)];for(let j=1;j<6;j++)sq.push(sq[j-1]+(j%2?a:-b));rule=`הַקְּפִיצוֹת מִתְחַלְּפוֹת: ${L(step(a)+', '+step(-b))}`;}}
  const qi=lv>=3&&rnd()<.4?ri(1,4):5;const a=sq[qi];
  if(qi>0&&qi<5)cands.push(sq[qi-1]+(sq[qi+1]-sq[qi]),sq[qi+1]+1);else cands.push(sq[4]+(sq[4]-sq[3])+1,sq[4]);
  return mk('ser',lv,{kind:'series',items:sq.map((v,j)=>j===qi?null:{t:'num',v}),qi,ans:{t:'num',v:a},ds:numDs(a,nOpts(lv)-1,cands.filter(c=>c!==a)),
    text:qi===5?'אֵיזֶה מִסְפָּר בָּא אַחַר כָּךְ?':'אֵיזֶה מִסְפָּר חָסֵר?',rule:'הַכְּלָל: '+rule,key:sq.join(',')+'|'+qi});}

/* ---------- shape series ---------- */
function genShp(lv){let items,ans,ds,rule,attrs;const n=nOpts(lv);
  if(lv===1){const byCol=rnd()<.5;const s=pk(SHP),cs=shuf([0,1,2,3,4]),ss=shuf(SHP);
    const A=byCol?tile({s,c:cs[0]}):tile({s:ss[0],c:cs[0]}),Bt=byCol?tile({s,c:cs[1]}):tile({s:ss[1],c:cs[0]}),C=byCol?tile({s,c:cs[2]}):tile({s:ss[2],c:cs[0]});
    items=[A,Bt,A,Bt,A];ans=Bt;ds=[A,C].map(v=>({t:'tile',v}));rule='הַדֶּגֶם חוֹזֵר:';attrs=[A,Bt];}
  else if(lv===2){const pat=pk(['AAB','ABB','ABC']);const ss=shuf(SHP),cs=shuf([0,1,2,3,4]);const U=[0,1,2].map(k=>tile({s:ss[k],c:cs[k]}));
    const seq=[...pat].map(ch=>U[ch.charCodeAt(0)-65]);const len=pat.length*2+(pat.length===3?1:0);items=Array.from({length:len},(_,j)=>seq[j%seq.length]);ans=seq[len%seq.length];
    const pool=[...new Set(U.map(t=>okey({t:'tile',v:t})))].map(k=>U.find(t=>okey({t:'tile',v:t})===k)).filter(t=>okey({t:'tile',v:t})!==okey({t:'tile',v:ans}));
    const extra=tile({s:ss[3],c:cs[3]});ds=[...pool,extra].slice(0,n-1).map(v=>({t:'tile',v}));rule='הַדֶּגֶם חוֹזֵר:';attrs=seq;}
  else if(lv===3){const s=pk(['circle','square','star','diamond']),c=ri(0,4);
    if(rnd()<.5){const st=ri(1,2);items=[0,1,2].map(j=>tile({s,c,n:st+j}));ans=tile({s,c,n:st+3});ds=tileDs(ans,['n'],n-1);rule='כָּל פַּעַם יֵשׁ עוֹד אֶחָד';}
    else{const r0=pk([0,90,180,270]);items=[0,1,2,3,4].map(j=>tile({s:'arrow',c,r:(r0+90*j)%360}));ans=tile({s:'arrow',c,r:(r0+450)%360});ds=tileDs(ans,['r'],n-1);rule='הַחֵץ מִסְתּוֹבֵב כָּל פַּעַם רֶבַע סִבּוּב';}}
  else{/* two things change, each with its own rhythm */
    const k=pk(lv===4?['sc','sc','rc']:['sc','rc','nc']);const ss=shuf(SHP),cs=shuf([0,1,2,3,4]);let f;
    if(k==='sc'){f=j=>tile({s:ss[j%2],c:cs[j%3]});rule='הַצּוּרָה מִתְחַלֶּפֶת כָּל פַּעַם, וְהַצְּבָעִים חוֹזְרִים כָּל שָׁלֹשׁ';}
    else if(k==='rc'){const r0=pk([0,90,180,270]);f=j=>tile({s:'arrow',c:cs[j%2],r:(r0+90*j)%360});rule='הַחֵץ מִסְתּוֹבֵב רֶבַע סִבּוּב, וְהַצֶּבַע מִתְחַלֵּף';}
    else{f=j=>tile({s:ss[j%2],c:cs[0],n:1+(j%4)});rule='כָּל פַּעַם עוֹד אֶחָד (עַד 4), וְהַצּוּרָה מִתְחַלֶּפֶת';}
    const len=lv===4?6:7;const all=Array.from({length:len+1},(_,j)=>f(j));const qi=lv===5&&rnd()<.5?ri(3,len-1):len;
    ans=all[qi];items=all.slice(0,len+1);items[qi]=null;
    ds=tileDs(ans,k==='sc'?['s','c']:k==='rc'?['r','c']:['n','s'],n-1);
    return mk('shp',lv,{kind:'series',items:items.map(v=>v&&{t:'tile',v}),qi,ans:{t:'tile',v:ans},ds,text:'מָה חָסֵר?',rule:'הַכְּלָל: '+rule,key:all.map(t=>okey({t:'tile',v:t})).join('|')+qi});}
  const show=lv<=2?attrs.slice(0,lv===1?2:attrs.length).map(v=>({t:'tile',v})):null;
  return mk('shp',lv,{kind:'series',items:[...items.map(v=>({t:'tile',v})),null],qi:items.length,ans:{t:'tile',v:ans},ds:ds.slice(0,n-1),text:'מָה בָּא אַחַר כָּךְ?',rule,ruleItems:show,key:items.map(t=>okey({t:'tile',v:t})).join('|')});}

/* ---------- matrices ---------- */
function genMat(lv){const ss=shuf(SHP),cs=shuf([0,1,2,3,4]);let N,cell,rule,attrs;
  if(lv===1){N=2;cell=(r)=>tile({s:ss[r],c:cs[r]});rule='בְּכָל שׁוּרָה יֵשׁ שְׁתֵּי צוּרוֹת זֵהוֹת';attrs=['s','c'];}
  else if(lv===2){N=2;cell=(r,c)=>tile({s:ss[r],c:cs[c]});rule='בְּכָל שׁוּרָה אוֹתָהּ צוּרָה, וּבְכָל טוּר אוֹתוֹ צֶבַע';attrs=['s','c'];}
  else if(lv===3){N=3;cell=(r,c)=>tile({s:ss[r],c:cs[c]});rule='בְּכָל שׁוּרָה אוֹתָהּ צוּרָה, וּבְכָל טוּר אוֹתוֹ צֶבַע';attrs=['s','c'];}
  else if(lv===4){N=3;const col=cs[0];cell=(r,c)=>tile({s:ss[r],c:col,n:c+1});rule='בְּכָל שׁוּרָה אוֹתָהּ צוּרָה, וּבְכָל טוּר אוֹתָהּ כַּמּוּת: 1, 2, 3';attrs=['s','n'];}
  else{N=3;const m=pk([[1,2],[2,1]]);cell=(r,c)=>tile({s:ss[(r+c)%3],c:cs[(m[0]*r+m[1]*c)%3]});rule='בְּכָל שׁוּרָה וּבְכָל טוּר יֵשׁ כָּל צוּרָה פַּעַם אַחַת וְכָל צֶבַע פַּעַם אַחַת';attrs=['s','c'];}
  const cells=[];for(let r=0;r<N;r++)for(let c=0;c<N;c++)cells.push(cell(r,c));
  const mi=lv<=2?N*N-1:(lv===5?ri(0,N*N-1):pk([N*N-1,N*N-1,ri(0,N*N-1)]));const ans=cells[mi];
  /* distractors: tiles from the matrix that do not fit here, then one-attribute changes */
  const extra=shuf(cells.filter((t,i)=>i!==mi)).filter(t=>okey({t:'tile',v:t})!==okey({t:'tile',v:ans}));
  /* level 5: wrong answers use the same three shapes and colors, so only the rule decides */
  const ds=lv===5?shuf([0,1,2].flatMap(a=>[0,1,2].map(b=>tile({s:ss[a],c:cs[b]})))).filter(t=>okey({t:'tile',v:t})!==okey({t:'tile',v:ans})).slice(0,3).map(v=>({t:'tile',v})):tileDs(ans,attrs,nOpts(lv)-1,extra.slice(0,1));
  return mk('mat',lv,{kind:'matrix',N,cells:cells.map((v,i)=>i===mi?null:{t:'tile',v}),ans:{t:'tile',v:ans},ds,text:'מָה חָסֵר בַּמִּשְׁבֶּצֶת?',rule:'הַכְּלָל: '+rule,key:cells.map(t=>okey({t:'tile',v:t})).join('|')+mi});}

/* ---------- analogies ---------- */
const OBJ1=['apple','fish','bird','car','star','heart','ball','boat','flower','tree','sheep','turtle','cake','cat','dog','cup','rabbit','carrot'];
const TR={two:{b:{},f:{n:2},r:'מֵאֶחָד נִהְיוּ שְׁנַיִם'},three:{b:{},f:{n:3},r:'מֵאֶחָד נִהְיוּ שְׁלוֹשָׁה'},big:{b:{z:0},f:{z:2},r:'מִקָּטָן נִהְיָה גָּדוֹל'}};
const spr=(v,o)=>Object.assign({t:'spr',v,n:1,z:1,fl:0,up:0},o);
const TRN={s:'הַצּוּרָה',c:'הַצֶּבַע',n:'הַכַּמּוּת',z:'הַגֹּדֶל',r:'הַכִּוּוּן'};
function genAna(lv){
  if(lv===1){const tk=pk(Object.keys(TR));const t=TR[tk];const pool=t.only||OBJ1;const [o1,o2]=shuf(pool);const A=spr(o1,t.b),Bx=spr(o1,Object.assign({},t.b,t.f)),C=spr(o2,t.b),ans=spr(o2,Object.assign({},t.b,t.f));
    /* the wrong option must look clearly different (#7): "two"/"three" get the other count, never a slightly bigger one */
    const other=tk==='big'?pk(['two','three']):tk==='two'?'three':'two';const wrong=spr(o2,Object.assign({},TR[other].b,TR[other].f));
    const ds=[C,okey(wrong)===okey(C)||okey(wrong)===okey(ans)?spr(o1,t.b):wrong];
    return mk('ana',1,{kind:'analogy',a:A,b:Bx,c:C,ans,ds,text:'כְּמוֹ בַּזּוּג הָרִאשׁוֹן — מָה חָסֵר?',rule:t.r+'. אוֹתוֹ דָּבָר בַּזּוּג הַשֵּׁנִי.',key:'p'+o1+o2+tk});}
  const pic=lv===2||(lv===3&&rnd()<.3)||(lv===5&&rnd()<.2);
  if(pic){/* shapes: one (or two) things change from A to B; C changes the same way */
    const nch=lv===2?1:2;const ch=shuf(['s','c','n']).slice(0,nch);const A=tile({s:pk(SHP),c:ri(0,4)}),Bt=tile(A);ch.forEach(k=>{Bt[k]=pk(RANGE[k].filter(v=>v!==A[k]));});
    const keep=['s','c'].filter(k=>!ch.includes(k));const C=tile(A);if(keep.length){const k=keep[0];C[k]=pk(RANGE[k].filter(v=>v!==A[k]));}else{C.f=0;}
    const ans=tile(C);ch.forEach(k=>{ans[k]=Bt[k];});
    const ds=tileDs(ans,ch,(lv<=3?3:4)-1,[C]);
    return mk('ana',lv,{kind:'analogy',a:{t:'tile',v:A},b:{t:'tile',v:Bt},c:{t:'tile',v:C},ans:{t:'tile',v:ans},ds,text:'כְּמוֹ בַּזּוּג הָרִאשׁוֹן — מָה חָסֵר?',
      rule:`בַּזּוּג הָרִאשׁוֹן ${ch.length>1?'הִשְׁתַּנּוּ':/^[sn]$/.test(ch[0])?'הִשְׁתַּנְּתָה':'הִשְׁתַּנָּה'} ${ch.map(k=>TRN[k]).join(' וְ')}. אוֹתוֹ דָּבָר בַּזּוּג הַשֵּׁנִי.`,key:'t'+[A,Bt,C].map(x=>okey({t:'tile',v:x})).join()});}
  const lvB=lv===2?3:lv;const it=lpick('th-ana',B.ANA.filter(x=>x[0]===lvB));const [,a,b,c,ans,ds,rule]=it;const n=lv<=3?3:4;
  const dd=shuf([...new Set(ds.filter(d=>d!==ans))]).slice(0,n-1);
  return mk('ana',lv,{kind:'analogy',a:{t:'txt',v:a},b:{t:'txt',v:b},c:{t:'txt',v:c},ans:{t:'txt',v:ans},ds:dd.map(v=>({t:'txt',v})),text:'כְּמוֹ בַּזּוּג הָרִאשׁוֹן — מָה חָסֵר?',rule:'הַקֶּשֶׁר: '+rule,key:'w'+a+c});}

/* ---------- word relations ---------- */
function picOdd(lv){const n=nOpts(lv);const cats=Object.keys(B.PICCAT);for(let t=0;t<50;t++){const A=pk(cats),Bk=pk(cats);if(A===Bk)continue;
    if(B.PICNO.some(([x,y])=>(x===A&&y===Bk)||(x===Bk&&y===A)))continue;const wa=B.PICCAT[A].w;if(wa.length<n-1)continue;
    const same=shuf(wa).slice(0,n-1),odd=pk(B.PICCAT[Bk].w);
    return mk('rel',lv,{kind:'words',html:'',text:'מִי לֹא שַׁיָּךְ?',ans:spr(odd),ds:same.map(v=>spr(v)),rule:`הַשְּׁאָר הֵם ${B.PICCAT[A].n}`,key:'po'+odd+same.join()});}}
function opp(lv){const n=nOpts(lv);const [w1,w2,k]=lpick('th-rel',B.OPP);const [q,a]=rnd()<.5?[w1,w2]:[w2,w1];
  const pool=shuf(B.OPP.filter(x=>x[2][0]===k[0]&&x[2]!==k)).flatMap(x=>[x[0],x[1]]).filter(x=>x!==q&&x!==a);const ds=shuf([...new Set(pool)]).slice(0,n-1);
  return mk('rel',lv,{kind:'words',html:`<div class="thw">${q}</div>`,text:'מָה הַהֵפֶךְ?',ans:{t:'txt',v:a},ds:ds.map(v=>({t:'txt',v})),rule:`הַהֵפֶךְ שֶׁל ${q} הוּא ${a}`,key:'op'+q});}
function catPair(){const ks=Object.keys(B.CAT);for(;;){const A=pk(ks),Bk=pk(ks);if(A!==Bk&&!B.CATNO.some(([x,y])=>(x===A&&y===Bk)||(x===Bk&&y===A)))return [A,Bk];}}
function wordOdd(lv){const [A,Bk]=catPair();const same=shuf(B.CAT[A][1]).slice(0,3),odd=pk(B.CAT[Bk][1]);
  return mk('rel',lv,{kind:'words',html:'',text:'אֵיזוֹ מִלָּה לֹא שַׁיֶּכֶת?',ans:{t:'txt',v:odd},ds:same.map(v=>({t:'txt',v})),rule:`הַשְּׁאָר הֵם ${B.CAT[A][0]}`,key:'wo'+odd+same.join()});}
function belongs(lv){const [A]=catPair();const ws=shuf(B.CAT[A][1]);const shown=ws.slice(0,3),a=ws[3];const others=shuf(Object.keys(B.CAT).filter(k=>k!==A&&!B.CATNO.some(([x,y])=>(x===A&&y===k)||(x===k&&y===A)))).slice(0,3).map(k=>pk(B.CAT[k][1]));
  return mk('rel',lv,{kind:'words',html:`<div class="thw sm">${shown.join(' · ')}</div>`,text:'מָה עוֹד שַׁיָּךְ לַקְּבוּצָה?',ans:{t:'txt',v:a},ds:others.map(v=>({t:'txt',v})),rule:`כֻּלָּם ${B.CAT[A][0]}`,key:'be'+shown.join()});}
function part(lv){const [p,w,g,ds]=lpick('th-rel',B.PART);
  return mk('rel',lv,{kind:'words',html:`<div class="thw">${p}</div>`,text:g==='f'?'הִיא חֵלֶק שֶׁל...':'הוּא חֵלֶק שֶׁל...',ans:{t:'txt',v:w},ds:shuf(ds).slice(0,nOpts(lv)-1).map(v=>({t:'txt',v})),rule:`${p} — חֵלֶק שֶׁל ${w}`,key:'pa'+p});}
/* "and": וּ before ב/מ/פ or a letter with shva, else וְ */
const vav=w=>/^[במפ]/.test(w)||/ְ/.test((/^.([֑-ׇ]*)/.exec(w)||[])[1]||'')?'וּ':'וְ';
function syn(lv){const [w,s,ds]=lpick('th-rel',B.SYN);
  return mk('rel',lv,{kind:'words',html:`<div class="thw">${w}</div>`,text:'אֵיזוֹ מִלָּה אוֹמֶרֶת כִּמְעַט אוֹתוֹ דָּבָר?',ans:{t:'txt',v:s},ds:shuf(ds).slice(0,nOpts(lv)-1).map(v=>({t:'txt',v})),rule:`${w} ${vav(s)}${s} — כִּמְעַט אוֹתוֹ דָּבָר`,key:'sy'+w});}
function hardOdd(lv){const [three,odd,why]=lpick('th-rel',B.ODD);
  return mk('rel',lv,{kind:'words',html:'',text:'אֵיזוֹ מִלָּה לֹא שַׁיֶּכֶת?',ans:{t:'txt',v:odd},ds:three.map(v=>({t:'txt',v})),rule:`הַשְּׁאָר ${why}`,key:'ho'+odd});}
function genRel(lv){const f=pk({1:[picOdd],2:[picOdd,opp,opp],3:[wordOdd,opp,belongs],4:[part,syn,wordOdd,belongs],5:[hardOdd,hardOdd,syn,part]}[lv]);return f(lv);}

/* ---------- sentence completion ---------- */
function genSen(lv){const it=lpick('th-sen',B.SEN.filter(x=>x[0]===lv));const [,s,a,ds]=it;const two=/…/.test(a);
  const html=s.split('___').map(x=>x).join('<span class="blank">____</span>');
  return mk('sen',lv,{kind:'words',html:`<div class="sent2">${html}</div>`,text:two?'אֵילוּ מִלִּים מַשְׁלִימוֹת אֶת הַמִּשְׁפָּט?':'אֵיזוֹ מִלָּה מַשְׁלִימָה אֶת הַמִּשְׁפָּט?',
    ans:{t:'txt',v:a},ds:shuf(ds).slice(0,nOpts(lv)-1).map(v=>({t:'txt',v})),rule:`<div class="sent2">${s.split('___').reduce((acc,x,i)=>acc+(i?`<b class="fill">${a.split(' … ')[i-1]||a}</b>`:'')+x,'')}</div>`,key:'se'+s});}

/* ---------- math puzzles (used in the champions' challenge) ---------- */
const FRUIT=['apple','ball','star','fish','heart','cake'];
function genMth(lv){const n=nOpts(lv);const N=pk(B.NAMES),O=pk(B.OBJS);const he=N.g==='m';
  const num=(a,c)=>mk('mth',lv,Object.assign(c,{ans:{t:'num',v:a},ds:numDs(a,n-1,c.cands||[]),cands:undefined}));
  const k=pk({1:['pic','pic','more'],2:['add','sub','gt'],3:['add','sub','sym','lt'],4:['sym2','cmp','two','gtx'],5:['two','mul','sym2','cmpx']}[lv]);
  if(k==='pic'){const a=ri(1,5),b=ri(1,4),s=pk(FRUIT);return num(a+b,{kind:'math',html:`<div class="throw">${Array(a).fill(`[${s}]`).join('')}<b>+</b>${Array(b).fill(`[${s}]`).join('')}</div>`,text:'כַּמָּה יֵשׁ בְּיַחַד?',rule:L(`${a} + ${b} = ${a+b}`),cands:[a+b+1,a+b-1],key:'pi'+a+b});}
  if(k==='more'){let a=ri(2,7),b=ri(2,7);while(b===a)b=ri(2,7);const [s1,s2]=shuf(FRUIT);
    return mk('mth',lv,{kind:'math',html:'',text:'אֵיפֹה יֵשׁ יוֹתֵר?',ans:spr(a>b?s1:s2,{n:Math.max(a,b)}),ds:[spr(a>b?s2:s1,{n:Math.min(a,b)})],rule:L(`${Math.max(a,b)} > ${Math.min(a,b)}`),key:'mo'+a+b});}
  const max=lv<=2?10:lv===3?20:100;
  if(k==='add'){const a=ri(2,max-2),b=ri(1,max-a);return num(a+b,{kind:'math',html:`<div class="sent2">${N.l} הָיוּ ${a} ${O}. ${he?'הוּא קִבֵּל':'הִיא קִבְּלָה'} עוֹד ${b}. כַּמָּה ${O} יֵשׁ ${he?'לוֹ':'לָהּ'} עַכְשָׁו?</div>`,text:'',rule:L(`${a} + ${b} = ${a+b}`),cands:[a-b>=0?a-b:a+b+1,a+b+10],key:'ad'+a+b});}
  if(k==='sub'){const a=ri(3,max),b=ri(1,a-1);return num(a-b,{kind:'math',html:`<div class="sent2">${N.l} הָיוּ ${a} ${O}. ${he?'הוּא נָתַן':'הִיא נָתְנָה'} ${b} ${he?'לְחָבֵר':'לַחֲבֵרָה'}. כַּמָּה ${O} נִשְׁאֲרוּ ${he?'לוֹ':'לָהּ'}?</div>`,text:'',rule:L(`${a} − ${b} = ${a-b}`),cands:[a+b],key:'su'+a+b});}
  if(k==='gt'||k==='lt'){const x=ri(4,max-3);const big=k==='gt';const a=big?ri(x+1,max):ri(0,x-1);const pool=shuf(Array.from({length:max+1},(_,i)=>i).filter(v=>big?v<=x:v>=x)).slice(0,n-1);
    return mk('mth',lv,{kind:'math',html:'',text:big?`אֵיזֶה מִסְפָּר גָּדוֹל מִ-${x}?`:`אֵיזֶה מִסְפָּר קָטָן מִ-${x}?`,ans:{t:'num',v:a},ds:pool.map(v=>({t:'num',v})),rule:L(big?`${a} > ${x}`:`${a} < ${x}`),key:k+x+a});}
  if(k==='sym'){const s=pk(FRUIT),v=ri(2,lv===3?9:20);return num(v,{kind:'math',html:`<div class="throw">[${s}]<b>+</b>[${s}]<b>=</b><b>${2*v}</b></div><div class="throw">[${s}]<b>=</b><b>?</b></div>`,text:'כַּמָּה שָׁוֶה כָּל אֶחָד?',rule:L(`${v} + ${v} = ${2*v}`),cands:[2*v,v+1,v-1],key:'sy'+s+v});}
  if(k==='sym2'){const [s,t]=shuf(FRUIT);const v=ri(2,8),w=ri(1,9);return num(w,{kind:'math',html:`<div class="throw">[${s}]<b>+</b>[${s}]<b>=</b><b>${2*v}</b></div><div class="throw">[${s}]<b>+</b>[${t}]<b>=</b><b>${v+w}</b></div><div class="throw">[${t}]<b>=</b><b>?</b></div>`,text:'כַּמָּה שָׁוֶה הַשֵּׁנִי?',rule:L(`[${s}] = ${v} ← ${v} + ${w} = ${v+w}`),cands:[v,v+w,2*v],key:'s2'+v+w});}
  if(k==='cmp'||k==='cmpx'){const mx=k==='cmp'?40:60;const a=ri(5,mx),b=ri(5,mx),lv1=a+b;let R,rv;
    if(k==='cmp'){rv=lv1+pk([-2,-1,0,1,2]);R=String(rv);}else{const c=ri(5,Math.min(60,lv1)),d=Math.max(0,lv1-c+pk([-1,0,1]));rv=c+d;R=`${c} + ${d}`;}
    const L1=`${a} + ${b}`;const sgn=lv1>rv?'>':lv1<rv?'<':'=';
    return mk('mth',lv,{kind:'math',html:`<div class="throw ltr"><b>${L1}</b><b class="q">?</b><b>${R}</b></div>`,text:'אֵיזֶה סִימָן מַתְאִים?',ans:{t:'txt',v:sgn},ds:['>','<','='].filter(x=>x!==sgn).map(v=>({t:'txt',v})),rule:L(`${L1} = ${lv1}, ${R} = ${rv}`),key:'cm'+L1+R});}
  if(k==='gtx'){const a=ri(2,8),t=ri(a+3,a+12);const ok=t-a+ri(1,3);const ds=shuf([t-a,t-a-1,t-a-2,Math.max(0,t-a-4)].filter((v,i,ar)=>v>=0&&ar.indexOf(v)===i)).slice(0,n-1);
    return mk('mth',lv,{kind:'math',html:`<div class="throw ltr"><b>${a} + ?</b><b>&gt;</b><b>${t}</b></div>`,text:'אֵיזֶה מִסְפָּר מַתְאִים בִּמְקוֹם סִימַן הַשְּׁאֵלָה?',ans:{t:'num',v:ok},ds:ds.map(v=>({t:'num',v})),rule:L(`${a} + ${ok} = ${a+ok} > ${t}`),key:'gx'+a+t});}
  if(k==='two'){const a=ri(10,lv===4?40:60),b=ri(2,15),c=ri(2,Math.min(15,a+b-1));return num(a+b-c,{kind:'math',html:`<div class="sent2">בָּאוֹטוֹבּוּס הָיוּ ${a} אֲנָשִׁים. בַּתַּחֲנָה עָלוּ ${b} וְיָרְדוּ ${c}. כַּמָּה אֲנָשִׁים יֵשׁ עַכְשָׁו בָּאוֹטוֹבּוּס?</div>`,text:'',rule:L(`${a} + ${b} − ${c} = ${a+b-c}`),cands:[a+b+c,a-b+c,a+b],key:'tw'+a+b+c});}
  /* mul */const a=ri(2,5),b=ri(2,5);return num(a*b,{kind:'math',html:`<div class="sent2">בְּכָל קֻפְסָה יֵשׁ ${a} ${O}. יֵשׁ ${b} קֻפְסָאוֹת. כַּמָּה ${O} יֵשׁ בְּסַךְ הַכֹּל?</div>`,text:'',rule:L(`${b} × ${a} = ${a*b}`),cands:[a+b,a*b+a,a*b-b],key:'mu'+a+b});}

const GEN={ser:genSer,shp:genShp,mat:genMat,ana:genAna,rel:genRel,sen:genSen,mth:genMth};

/* ---------- reading comprehension ---------- */
const HEBP=/[֑-ׇ]/g;
const strip=s=>String(s).replace(HEBP,'');
const bare=w=>w.replace(/[^א-ת]/g,'');
const EASY=new Set(B.EASY);
const easyWord=p=>{const b=bare(p);return EASY.has(b)||(/^[והבלמשכ]/.test(b)&&EASY.has(b.slice(1)));};
/* nikud stage: 0 = full nikud · 1 = common words without nikud · 2 = passage without nikud · 3 = passage and question without nikud */
function nikud(t,p,stage){if(!stage||!p)return t;if(stage>=2)return p;const tw=t.split(' '),pw=p.split(' ');if(tw.length!==pw.length)return t;return tw.map((w,i)=>easyWord(pw[i])?pw[i]:w).join(' ');}
/* a passage (not used recently) with its questions as ready options */
function rcPick(lv,recent){const pool=B.RC.map((x,i)=>i).filter(i=>B.RC[i].lv===lv);const fresh=pool.filter(i=>!(recent||[]).includes(i));let i=pk(fresh.length?fresh:pool);
  const LN=typeof window!=='undefined'&&window.LEARN;if(LN&&LN.pickItem&&pool.length){try{const r=LN.pickItem('rc',(fresh.length?fresh:pool).map(j=>({k:B.RC[j].p})));const j=r&&(fresh.length?fresh:pool).find(j=>B.RC[j].p===r.item.k);if(j!=null)i=j;}catch(e){}}
  const P=B.RC[i];const n=nOpts(lv>=4?4:2);
  const qs=P.q.map(([q,qp,a,ds],k)=>{const o=x=>x[0]==='@'?spr(x.slice(1)):{t:'txt',v:x};return mk('rc',lv,{kind:'rc',text:q,textP:qp,ans:o(a),ds:shuf(ds).slice(0,n-1).map(o),key:'rc'+i+'-'+k});});
  return {i,P,qs};}

/* ---------- levels (pure: state = save.th) ---------- */
const blankTh=()=>({lv:{},w:{},nk:0,nkw:''});
function level(th,sk){return Math.min(MAXLV,Math.max(1,(th.lv||{})[sk]|0||1));}
/* one first-try answer: 4 of the last 5 right → up; 3 of the last 4 wrong → down */
function answer(th,sk,ok){th.lv=th.lv||{};th.w=th.w||{};const w=((th.w[sk]||'')+(ok?'1':'0')).slice(-6);th.w[sk]=w;const lv=level(th,sk);let ch=0;
  const ones=s=>[...s].filter(c=>c==='1').length;
  if(w.length>=5&&ones(w.slice(-5))>=4&&lv<MAXLV){th.lv[sk]=lv+1;th.w[sk]='';ch=1;}
  else if(w.length>=4&&ones(w.slice(-4))<=1&&lv>1){th.lv[sk]=lv-1;th.w[sk]='';ch=-1;}
  else th.lv[sk]=lv;
  if(sk==='rc')ch={lv:ch,nk:nkAnswer(th,ok,lv)};
  return ch;}
/* reading without nikud: opens only at comprehension level 4+, after 9 of the last 10 answers right; steps back when 3 of the last 5 are wrong */
function nkAnswer(th,ok,rcLv){th.nk=th.nk|0;if(th.nk===0&&rcLv<4)return 0;const w=((th.nkw||'')+(ok?'1':'0')).slice(-10);th.nkw=w;const ones=s=>[...s].filter(c=>c==='1').length;
  if(w.length>=10&&ones(w)>=9&&th.nk<3){th.nk++;th.nkw='';return 1;}
  if(th.nk>0&&w.length>=5&&ones(w.slice(-5))<=2){th.nk--;th.nkw='';return -1;}
  return 0;}

/* ---------- champions' challenge: chapters per level ---------- */
const TEST=[null,{n:4,min:3},{n:5,min:4},{n:6,min:5},{n:8,min:7},{n:10,min:10},{ch:[['ana','rel','sen','rc'],['ser','mth'],['shp','mat']],n:6,min:5}];
function testPlan(tl,skills){const t=TEST[tl];if(!t)return [];
  if(t.ch)return t.ch.map(g=>{const sks=g.filter(s=>skills.includes(s));return {n:t.n,sec:t.min*60,sks:sks.length?sks:skills};});
  return [{n:t.n,sec:t.min*60,sks:skills}];}
/* the skills of one chapter, spread evenly and shuffled */
function testSkills(ch){const out=[];const sk=shuf(ch.sks);for(let i=0;i<ch.n;i++)out.push(sk[i%sk.length]);return shuf(out);}

/* ---------- day log & skills tracking (pure) ---------- */
const dkey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function lastDays(n,now){const out=[];const d=now?new Date(now):new Date();for(let i=0;i<n;i++){const x=new Date(d);x.setDate(d.getDate()-i);out.push(dkey(x));}return out;}/* newest first */
function logDay(save,d){save.alog=save.alog||{};const L=save.alog[d]||(save.alog[d]={a:{},s:0,k:{}});L.a=L.a||{};L.k=L.k||{};
  const ks=Object.keys(save.alog).sort();if(ks.length>35)ks.slice(0,ks.length-35).forEach(k=>delete save.alog[k]);return L;}
function hit(save,d,sk,ok){const L=logDay(save,d);const c=L.k[sk]||(L.k[sk]=[0,0]);c[0]++;if(ok)c[1]++;}
function sumK(save,days,sk){let a=0,o=0;for(const d of days){const c=((save.alog||{})[d]||{}).k;if(!c)continue;for(const k in c){if(sk&&k!==sk)continue;if(!sk&&k==='nk')continue;a+=c[k][0]|0;o+=c[k][1]|0;}}return [a,o];}
/* family merge: per day, the bigger count wins */
function mergeLog(dst,src){if(!src||typeof src!=='object')return dst||{};dst=dst||{};for(const d in src){const s=src[d];if(!s||typeof s!=='object')continue;const t=dst[d]||(dst[d]={a:{},s:0,k:{}});t.a=t.a||{};t.k=t.k||{};
    for(const k in s.a||{})t.a[k]=Math.max(t.a[k]|0,s.a[k]|0);t.s=Math.max(t.s|0,s.s|0);for(const k in s.k||{}){const a=t.k[k]||[0,0],b=s.k[k]||[0,0];t.k[k]=[Math.max(a[0]|0,b[0]|0),Math.max(a[1]|0,b[1]|0)];}}
  const ks=Object.keys(dst).sort();if(ks.length>35)ks.slice(0,ks.length-35).forEach(k=>delete dst[k]);return dst;}
function mergeTh(dst,src){if(!src||typeof src!=='object')return dst||blankTh();dst=dst||blankTh();dst.lv=dst.lv||{};for(const k in src.lv||{})dst.lv[k]=Math.max(dst.lv[k]|0,src.lv[k]|0);dst.nk=Math.max(dst.nk|0,src.nk|0);
  dst.best=dst.best||{};for(const k in src.best||{})dst.best[k]=Math.max(dst.best[k]|0,src.best[k]|0);return dst;}
/* per skill: accuracy (first try) in the last 14 days, trend this week vs. last week */
function skillStat(save,sk,now){const d=lastDays(14,now),w1=d.slice(0,7),w2=d.slice(7);const [a,o]=sumK(save,d,sk),[a1,o1]=sumK(save,w1,sk),[a2,o2]=sumK(save,w2,sk);
  let tr=0;if(a1>=4&&a2>=4){const x=o1/a1-o2/a2;tr=x>.08?1:x<-.08?-1:0;}return {n:a,acc:a?o/a:null,tr};}

return {clearLB:()=>{LB=null;},GEN,genSer,genShp,genMat,genAna,genRel,genSen,genMth,rcPick,nikud,easyWord,strip,bare,okey,tile,COL,COLN,SHP,level,answer,nkAnswer,blankTh,MAXLV,TEST,testPlan,testSkills,
  lastDays,logDay,hit,sumK,skillStat,mergeLog,mergeTh,dkey,setRandom:f=>{rnd=f||Math.random;}};})();

/* ======================= part 2: the game ======================= */
(()=>{'use strict';const O=window.OREN,T=window.TAL,C=window.THINK;if(!O||!T||!C)return;const {h,$}=O;const sfx=O.sfx,D=O.D;const {X,ALLSPR}=T;

/* ---------- three new sprites (original pixel art) ---------- */
const P=(r,p)=>O.sprite(r,p);
X.rabbit=P(['.WW..WW.','.WP..PW.','.WP..PW.','.WW..WW.','WWWWWWWW','WKWWWWKW','WWWPPWWW','WWWWWWWW','.WWWWWW.','.WW..WW.'],{W:'#f4f1ea',P:'#ff9cc2',K:'#1d2631'});
X.carrot=P(['....G.G','.....GG','....OO.','...OOO.','...OOO.','..OOO..','..OO...','.OO....','.O.....'],{G:'#4fae4f',O:'#f28c28'});
X.umbrella=P(['....K....','..RRRRR..','.RRRRRRR.','RRRRRRRRR','R.RR.RR.R','....K....','....K....','....K....','..K.K....','...K.....'],{R:'#e4572e',K:'#5a5f66'});

/* ---------- state ---------- */
const S=()=>T.S();
const TH=()=>{const s=S();s.th=s.th||C.blankTh();s.th.lv=s.th.lv||{};s.th.w=s.th.w||{};return s.th;};
const day=()=>O.today();
const hit=(sk,ok)=>{C.hit(O.save,day(),sk,ok);};
T.skHit=hit;
/* nikud helper for any reading activity: current stage (0..3) and the text to show */
T.nikudStage=()=>TH().nk|0;
T.nikudText=(t,p,forQuestion)=>{const st=TH().nk|0;return forQuestion?(st>=3&&p?p:t):C.nikud(t,p,st);};

/* ---------- drawing ---------- */
function shapeSVG(s,cx,cy,r,col,fill,rot){const st=fill?`fill="${col}" stroke="#1d2631" stroke-width="2.4"`:`fill="#fff" stroke="${col}" stroke-width="4.5"`;let el;
  if(s==='circle')el=`<circle cx="${cx}" cy="${cy}" r="${r}" ${st}/>`;
  else if(s==='square')el=`<rect x="${cx-r*.88}" y="${cy-r*.88}" width="${r*1.76}" height="${r*1.76}" rx="2" ${st}/>`;
  else if(s==='tri')el=`<polygon points="${cx},${cy-r} ${cx+r*1.05},${cy+r*.8} ${cx-r*1.05},${cy+r*.8}" ${st}/>`;
  else if(s==='diamond')el=`<polygon points="${cx},${cy-r*1.1} ${cx+r*.85},${cy} ${cx},${cy+r*1.1} ${cx-r*.85},${cy}" ${st}/>`;
  else if(s==='star'){let p='';for(let k=0;k<10;k++){const a=-Math.PI/2+k*Math.PI/5,rr=k%2?r*.45:r*1.08;p+=`${(cx+rr*Math.cos(a)).toFixed(1)},${(cy+rr*Math.sin(a)).toFixed(1)} `;}el=`<polygon points="${p}" ${st}/>`;}
  else el=`<polygon points="${cx},${cy-r*1.1} ${cx+r*.9},${cy} ${cx+r*.35},${cy} ${cx+r*.35},${cy+r*1.05} ${cx-r*.35},${cy+r*1.05} ${cx-r*.35},${cy} ${cx-r*.9},${cy}" ${st}/>`;
  return rot?`<g transform="rotate(${rot} ${cx} ${cy})">${el}</g>`:el;}
const POS={1:[[30,30]],2:[[17,30],[43,30]],3:[[30,17],[17,42],[43,42]],4:[[18,18],[42,18],[18,42],[42,42]],5:[[16,16],[44,16],[30,30],[16,44],[44,44]]};
function tileSVG(t){const col=C.COL[t.c]||'#888';const n=t.n||1;const r=n>1?(t.z===0?6:t.z===2?11:9):[10,16,23][t.z==null?1:t.z];
  return `<svg class="tl" viewBox="0 0 60 60" aria-hidden="true">${POS[n].map(([x,y])=>shapeSVG(t.s,x,y,r,col,t.f!==0,t.r)).join('')}</svg>`;}
function sprHTML(o){const one=`<span class="ths${o.z===0?' s0':o.z===2?' s2':''}${o.fl?' fl':''}${o.up?' up':''}">${ALLSPR(o.v)}</span>`;return `<span class="thsg n${Math.min(o.n||1,9)}">${one.repeat(o.n||1)}</span>`;}
function optHTML(o){if(!o)return '<b class="q">?</b>';if(o.t==='tile')return tileSVG(o.v);if(o.t==='spr')return sprHTML(o);if(o.t==='num')return `<b class="thn">${o.v}</b>`;/* a lone < or > in the RTL page is drawn mirrored; keep signs left-to-right (#208) */return `<span class="tht${/^[<>=]$/.test(o.v)?' ltr':''}">${o.v}</span>`;}
const optCls=o=>o.t==='tile'?'thc tile':o.t==='spr'?'thc picb':o.t==='num'?'num':'tx';
const sprTok=html=>String(html).replace(/\[([a-zA-Z]+)\]/g,(m,k)=>`<span class="ths">${ALLSPR(k)}</span>`);
/* the visual part of a question */
function promptHTML(q){
  if(q.kind==='series')return `<div class="thser${q.ans.t==='num'?' lr':''}">${q.items.map(o=>`<span class="thi${o?'':' miss'}">${optHTML(o)}</span>`).join('')}</div>`;
  if(q.kind==='matrix')return `<div class="thmat n${q.N}">${q.cells.map(o=>`<span class="thi${o?'':' miss'}">${optHTML(o)}</span>`).join('')}</div>`;
  if(q.kind==='analogy'){const w=q.a.t==='txt';return `<div class="thana${w?' w':''}"><div class="thpair"><span class="thi">${optHTML(q.a)}</span><span class="arr">←</span><span class="thi">${optHTML(q.b)}</span></div><div class="thpair"><span class="thi">${optHTML(q.c)}</span><span class="arr">←</span><span class="thi miss">${optHTML(null)}</span></div></div>`;}
  return sprTok(q.html||'');}

/* ---------- tracks ---------- */
const SK={
  shp:{id:'think-pat',n:'מָה בָּא אַחַר כָּךְ?',e:'🔁'},
  ana:{id:'think-ana',n:'זוּגוֹת מַתְאִימִים',e:'🔗'},
  ser:{id:'think-ser',n:'סִדְרוֹת מִסְפָּרִים',e:'🔢'},
  rel:{id:'think-rel',n:'מָה הַקֶּשֶׁר?',e:'🧩'},
  mat:{id:'think-mat',n:'הַמִּשְׁבֶּצֶת הַחֲסֵרָה',e:'▦'},
  sen:{id:'think-sen',n:'מַשְׁלִימִים מִשְׁפָּט',e:'✏️'}};
const ORDER=['shp','ana','ser','rel','mat','sen'];
/* the tracks open one by one: two at first, one more after every 3 finished rounds */
function openTracks(){const s=S();if((s.set||{}).all)return ORDER.slice();const plays=ORDER.reduce((a,k)=>a+((s.tl[SK[k].id]||{}).n|0),0);return ORDER.slice(0,Math.min(ORDER.length,2+Math.floor(plays/3)));}

/* the shared quiz screen: card, options, a gentle explanation after a mistake */
function round(o){/* o: {id, sk, title, bg, back, n, next(i) → q, again} */
  let i=0,err=0,gems=0;const qs=[];O.setScreen('sTal',o.bg||'mount',o.back);const s=$('#sTal');s.innerHTML='';const wrap=h('div','tq thq');s.appendChild(wrap);if(o.lesson&&window.LESSONS)s.appendChild(window.LESSONS.againBtn(o.lesson,o.back,o.again));
  const render=()=>{let q;for(let t=0;t<30;t++){C.clearLB();q=o.next(i);if(!qs.some(x=>x.key===q.key))break;}qs.push(q);let tries=0,lock=false,first=true;
    T.hudT(o.title,T.progressBar(i,o.n));O.sayNow=T.plainHe((q.say||'')+' '+(q.text||''));wrap.innerHTML='';
    const card=h('div','prq tqc',`${promptHTML(q)}${q.text?`<div class="qq">${q.text}</div>`:''}`);wrap.appendChild(card);if(T.rdQ&&q.text)T.rdQ(q,card);
    const row=h('div','chs n'+q.opts.length+(q.opts[0].t==='num'?' ltr':''));q.opts.forEach((op,k)=>{const b=h('button','chb '+optCls(op),optHTML(op));b.onclick=()=>pickA(k,b);row.appendChild(b);});wrap.appendChild(row);
    const ex=h('div','hintbox');ex.hidden=true;wrap.appendChild(ex);card.classList.add('flashin');
    const done=(ok)=>{if(!first)return;first=false;if(q.bank&&window.LEARN)try{window.LEARN.seen(q.bank,q.bkey,ok,false);}catch(e){}const ch=C.answer(TH(),o.sk,ok);hit(o.sk,ok);O.persist();if(ch===1)O.floatText(card,'🎉 עָלִיתָ שָׁלָב!');};
    const ruleHTML=()=>`<div>${sprTok(q.rule)}</div>${q.ruleItems?`<div class="thser sm">${q.ruleItems.map(x=>`<span class="thi">${optHTML(x)}</span>`).join('')}</div>`:''}`;
    /* only: the help box already shows the answer with the rule, so the explanation box holds just 'continue' */
    const explain=(only)=>{ex.hidden=false;ex.innerHTML=only?'':`<div class="cap">${ruleHTML()}</div>`;
      const nb=h('button','bigbtn sm',O.ICON.play+'<span>הַמְשֵׁךְ</span>');nb.onclick=()=>{sfx.pop(1);next();};ex.appendChild(nb);setTimeout(()=>nb.focus(),50);T.setKey(e=>{if(e.key==='Enter'||e.key===' ')nb.click();});};
    /* #54 one help button: clue (elimination), then the answer with the rule (the question ends like after two mistakes) */
    const HB=window.HELP&&HELP.mc?HELP.mc(wrap,{row,ans:q.ans,explain:ruleHTML,before:ex,reveal:()=>{if(lock)return;lock=true;err++;done(false);explain(true);}}):null;
    function pickA(k,b){if(lock||b.disabled)return;
      if(k===q.ans){lock=true;done(tries===0);if(T.rdA)T.rdA(q,tries,b);b.classList.add('ok');sfx.ok(i);const g=tries||(HB&&HB.step)?1:2;gems+=g;O.addGems(g,b);O.floatText(b,'+'+g);
        if(tries)explain();else setTimeout(next,D(900));return;}
      tries++;err++;done(false);b.classList.add('bad');b.disabled=true;sfx.no();
      if(tries>=2||q.opts.length<=2){lock=true;row.children[q.ans].classList.add('show');if(HB&&HB.el.isConnected){HB.answer();explain(true);}else explain();}}
    T.setKey(e=>{if(/^[1-9]$/.test(e.key)){const b=row.children[+e.key-1];if(b)b.click();}});
    window.__think={q,get ans(){return q.ans;},wrap,i};};
  function next(){if(!wrap.isConnected)return;i++;if(i>=o.n){T.setKey(null);T.finishAct(o.id,err,o.n,gems,o.back,o.again);}else render();}
  render();}
/* lesson cards before the first analogy / matrix questions (#258) */
const TLS={ana:'think-ana',mat:'think-mat'};
function track(sk,back){const LS=window.LESSONS,l=LS&&TLS[sk];const go=()=>round({id:SK[sk].id,sk,title:SK[sk].n,bg:'mount',back,n:6,lesson:l,next:()=>C.GEN[sk](C.level(TH(),sk)),again:()=>track(sk,back)});
  return l?LS.first(l,back,go):go();}
if(window.LESSONS){const LS=window.LESSONS,SPI=(v,n)=>`<span class="thi">${sprHTML({v,n})}</span>`,AR='<span class="arr">←</span>',Q='<span class="thi miss"><b class="q">?</b></span>';
  const ana=done=>`<div class="thana"><div class="thpair">${SPI('apple',1)}${AR}${SPI('apple',2)}</div><div class="thpair">${SPI('ball',1)}${AR}${done?SPI('ball',2):Q}</div></div>`;
  LS.add('think-ana',{title:'זוּגוֹת מַתְאִימִים',bg:'mount',cards:[
    {art:()=>ana(false),t:'זוּגוֹת מַתְאִימִים: בַּזּוּג הָרִאשׁוֹן, תַּפּוּחַ אֶחָד נִהְיָה שְׁנֵי תַּפּוּחִים. מָה יִהְיֶה הַכַּדּוּר?'},
    {art:()=>ana(true),t:'בַּזּוּג הַשֵּׁנִי עוֹשִׂים אוֹתוֹ שִׁנּוּי: כַּדּוּר אֶחָד נִהְיָה שְׁנֵי כַּדּוּרִים.'}]});
  const T1=tileSVG(C.tile({s:'circle',c:0})),T2=tileSVG(C.tile({s:'square',c:1}));
  const mat=done=>`<div class="thmat n2"><span class="thi">${T1}</span><span class="thi">${T1}</span><span class="thi">${T2}</span>${done?`<span class="thi">${T2}</span>`:'<span class="thi miss"><b class="q">?</b></span>'}</div>`;
  LS.add('think-mat',{title:'הַמִּשְׁבֶּצֶת הַחֲסֵרָה',bg:'mount',cards:[
    {art:()=>mat(false),t:'בְּכָל שׁוּרָה יֵשׁ חֹק. לְמַעְלָה יֵשׁ שְׁנֵי עִגּוּלִים אֲדֻמִּים. לְמַטָּה יֵשׁ רִבּוּעַ כָּחֹל, וּמָה חָסֵר?'},
    {art:()=>mat(true),t:'הַחֹק: בְּכָל שׁוּרָה שְׁתֵּי צוּרוֹת זֵהוֹת. אָז חָסֵר עוֹד רִבּוּעַ כָּחֹל. מִסְתַּכְּלִים עַל הַשּׁוּרוֹת וְגַם עַל הַטּוּרִים.'}]});}

/* ---------- reading comprehension ---------- */
function readRC(back){const th=TH();th.rcR=th.rcR||[];let lv=C.level(th,'rc');let pi=0,err=0,gems=0;const NP=lv<=2?3:2;O.setScreen('sTal','city',back);const s=$('#sTal');
  let wrapNow=null;const passage=()=>{lv=C.level(TH(),'rc');const pick=C.rcPick(lv,th.rcR);th.rcR=[...th.rcR,pick.i].slice(-12);let qi=0,perr=0;
    const ask=()=>{const q=pick.qs[qi];const nk=TH().nk|0;let tries=0,lock=false,first=true;
      T.hudT('קוֹרְאִים וּמְבִינִים',T.progressBar(pi,NP));s.innerHTML='';const wrap=h('div','tq thq rcq');wrapNow=wrap;s.appendChild(wrap);
      const card=h('div','prq tqc');const ps=h('div','thp'+(nk?' nk':''),T.nikudText(pick.P.t,pick.P.p));
      /* one audio control, the top 🔊: it reads the story and the question at levels 1–2 (level 3: after a mistake), above that it repeats the instruction */
      const INSTR='קְרָא אֶת הַסִּפּוּר וּבְחַר תְּשׁוּבָה';const addSay=()=>{O.sayNow=T.plainHe(pick.P.t+' '+q.text);};O.sayNow=T.plainHe(INSTR);
      /* the question is not a .qq, so it gets no second 🔊 */
      const qq=h('div','rcqq',T.nikudText(q.text,q.textP,true));card.append(ps,qq);if(lv<=2)addSay();wrap.appendChild(card);
      if(!qi)setTimeout(()=>{if(wrap.isConnected)O.say(INSTR);},D(400));
      const row=h('div','chs n'+q.opts.length);q.opts.forEach((op,k)=>{const b=h('button','chb '+optCls(op),optHTML(op));b.onclick=()=>pickA(k,b);row.appendChild(b);});wrap.appendChild(row);
      const done=ok=>{if(!first)return;first=false;const ch=C.answer(TH(),'rc',ok);hit('rc',ok);if(nk||ch.nk)hit('nk',ok);O.persist();if(ch.lv===1)O.floatText(card,'🎉 עָלִיתָ שָׁלָב!');else if(ch.nk===1)O.floatText(card,'🎉 קוֹרֵא גַּם בְּלִי נִקּוּד!');};
      /* #54 one help button: clue (elimination), then the answer (the question ends like after two mistakes) */
      const HB=window.HELP&&HELP.mc?HELP.mc(wrap,{row,ans:q.ans,reveal:()=>{if(lock)return;lock=true;err++;perr++;done(false);setTimeout(nextQ,D(4200));}}):null;
      function pickA(k,b){if(lock||b.disabled)return;
        if(k===q.ans){lock=true;done(tries===0);b.classList.add('ok');sfx.ok(qi);const g=tries||(HB&&HB.step)?1:2;gems+=g;O.addGems(g,b);O.floatText(b,'+'+g);setTimeout(nextQ,D(tries?1600:900));return;}
        tries++;err++;perr++;done(false);b.classList.add('bad');b.disabled=true;sfx.no();if(lv===3)addSay();
        if(tries>=2){lock=true;row.children[q.ans].classList.add('show');if(HB&&HB.el.isConnected)HB.answer();setTimeout(nextQ,D(HB?4200:2400));}}
      T.setKey(e=>{if(/^[1-9]$/.test(e.key)){const b=row.children[+e.key-1];if(b)b.click();}});
      window.__think={q,get ans(){return q.ans;},wrap,i:qi};};
    const nextQ=()=>{if(!wrapNow||!wrapNow.isConnected)return;qi++;if(qi<pick.qs.length)ask();else{if(window.LEARN)try{window.LEARN.seen('rc',pick.P.p,!perr,false);}catch(e){}pi++;if(pi<NP)passage();else{T.setKey(null);T.finishAct('read-rc',err,NP*3,gems,back,()=>readRC(back));}}};
    ask();};
  passage();}

/* ---------- the champions' challenge (timed chapters) ---------- */
const testLv=()=>Math.max(0,Math.min(6,((S().set||{}).thTest)|0));
const testSkills=()=>[...openTracks(),'rc','mth'];
function challenge(back){const tl=testLv();if(!tl)return back();const plan=C.testPlan(tl,testSkills());let ci=0,tot=0,ok=0;const s=$('#sTal');
  const intro=()=>{O.setScreen('sTal','final',back);T.hudT('אֶתְגַּר הָאַלּוּפִים');s.innerHTML='';const ch=plan[ci];
    O.sayNow=T.plainHe(`פֶּרֶק ${ci+1}. ${ch.n} שְׁאֵלוֹת.`);
    s.appendChild(h('div','whead',`<span class="gd">🏆</span><h1>אֶתְגַּר הָאַלּוּפִים</h1>`));
    s.appendChild(h('div','lsent',`${plan.length>1?`פֶּרֶק ${ci+1} מִתּוֹךְ ${plan.length}.<br>`:''}${ch.n} שְׁאֵלוֹת. יֵשׁ ${ch.sec/60} דַּקּוֹת.<br>קוֹרְאִים בְּעִיּוּן וּבוֹחֲרִים. אֶפְשָׁר לְדַלֵּג וְלַחְזֹר.`));
    const row=h('div','btnrow');const go=h('button','bigbtn',O.ICON.play+'<span>הַמְשֵׁךְ</span>');go.onclick=()=>{sfx.pop(2);chapter(ch);};row.appendChild(go);s.appendChild(row);setTimeout(()=>go.focus(),100);};
  function chapter(ch){const sks=C.testSkills(ch);const qs=sks.map(sk=>{C.clearLB();if(sk!=='rc')return C.GEN[sk](C.level(TH(),sk));const p=C.rcPick(Math.min(C.level(TH(),'rc'),3));return Object.assign(O.pick(p.qs),{pt:p.P.t,pp:p.P.p});});
    const got=qs.map(()=>null);let i=0,left=ch.sec;const t0=Date.now();O.setScreen('sTal','final',()=>{clearInterval(iv);back();});
    const wrap=h('div','tq thq');s.innerHTML='';const bar=h('div','thtime','<i></i><span></span>');s.appendChild(bar);s.appendChild(wrap);
    const tick=()=>{left=Math.max(0,ch.sec-Math.round((Date.now()-t0)/1000));bar.firstChild.style.width=(left/ch.sec*100)+'%';bar.lastChild.textContent='⏳';bar.classList.toggle('low',left<=30);if(left<=0)finish();};
    const iv=setInterval(()=>{if(!wrap.isConnected){clearInterval(iv);return;}tick();},1000);
    const render=()=>{const q=qs[i];T.hudT('אֶתְגַּר הָאַלּוּפִים',T.progressBar(i,qs.length));wrap.innerHTML='';
      const card=h('div','prq tqc',`${q.pt?`<div class="thp${TH().nk?' nk':''}">${T.nikudText(q.pt,q.pp)}</div>`:''}${promptHTML(q)}${q.text?`<div class="qq">${q.pt?T.nikudText(q.text,q.textP,true):q.text}</div>`:''}`);wrap.appendChild(card);
      const row=h('div','chs n'+q.opts.length+(q.opts[0].t==='num'?' ltr':''));q.opts.forEach((op,k)=>{const b=h('button','chb '+optCls(op)+(got[i]===k?' pick':''),optHTML(op));b.onclick=()=>{if(got[i]===-1)return;sfx.pop(1);got[i]=k;b.classList.add('pick');setTimeout(()=>step(1),D(250));};row.appendChild(b);});wrap.appendChild(row);
      const nav=h('div','thnav');const skip=h('button','plink',got[i]==null?'דַּלֵּג ←':'הַבָּא ←');skip.onclick=()=>step(1);nav.appendChild(skip);wrap.appendChild(nav);
      /* #54 one help button: clue (elimination), then the answer — that question counts as not solved, and the test moves on */
      if(window.HELP&&HELP.mc)HELP.mc(wrap,{row,ans:q.ans,before:nav,reveal:()=>{got[i]=-1;setTimeout(()=>{if(wrap.isConnected&&!ended&&qs[i]===q)step(1);},D(4200));}});
      T.setKey(e=>{if(/^[1-9]$/.test(e.key)){const b=row.children[+e.key-1];if(b)b.click();}});window.__think={q,get ans(){return q.ans;},wrap,i,test:true};};
    /* after the last question, go back to the ones that were skipped; finish when all are answered */
    const step=()=>{const open=qs.map((_,k)=>k).filter(k=>got[k]==null);if(!open.length)return finish();const nx=open.find(k=>k>i);i=nx!=null?nx:open[0];render();};
    let ended=false;function finish(){if(ended)return;ended=true;clearInterval(iv);T.setKey(null);
      qs.forEach((q,k)=>{const good=got[k]===q.ans;tot++;if(good)ok++;if(got[k]!=null){hit(q.sk,good);if(q.bank&&window.LEARN)try{window.LEARN.seen(q.bank,q.bkey,good,false);}catch(e){}}hit('tst',good);});O.persist();
      ci++;if(ci<plan.length)return pause();end();}
    tick();render();}
  const pause=()=>{s.innerHTML='';O.setScreen('sTal','final',back);s.appendChild(h('div','whead',`<span class="gd">⭐</span><h1>סִיַּמְתָּ פֶּרֶק!</h1>`));s.appendChild(h('div','lsent','נְשִׁימָה עֲמֻקָּה, מִתְמַתְּחִים... וּמַמְשִׁיכִים.'));
    const row=h('div','btnrow');const go=h('button','bigbtn',O.ICON.play+'<span>הַמְשֵׁךְ</span>');go.onclick=intro;row.appendChild(go);s.appendChild(row);};
  const end=()=>{const pct=tot?Math.round(ok/tot*100):0;const th=TH();th.best=th.best||{};th.best[tl]=Math.max(th.best[tl]|0,pct);th.tn=(th.tn|0)+1;
    const st=pct>=90?3:pct>=60?2:1;T.record('think-test',st);O.addGems(5+st*3);
    T.result({title:'כָּל הַכָּבוֹד עַל הָאֶתְגָּר!',sub:`עָנִיתָ נָכוֹן עַל ${ok} מִתּוֹךְ ${tot}`,stars:st,gems:5+st*3,back,again:()=>challenge(back)});};
  intro();}

/* ---------- activities in the buildings ---------- */
const addAct=(bid,a)=>{const b=T.BUILD.find(x=>x.id===bid);if(!b)return;const old=T.ACT[a.id];if(old){Object.assign(old,a);return;}a.b=b;b.acts.push(a);T.ACT[a.id]=a;};
const icon=e=>()=>`<span style="font-size:34px">${e}</span>`;
/* adds the activities (idempotent): reading comprehension in the library, six tracks + the challenge in the thinking tower */
C.register=()=>{addAct('read',{id:'read-rc',name:'קוֹרְאִים וּמְבִינִים',icon:()=>X.bookS,run:readRC});
  ORDER.forEach(k=>addAct('think',{id:SK[k].id,name:SK[k].n,icon:k==='shp'?icon('🔁'):k==='mat'?()=>tileSVG(C.tile({s:'square',c:1})):icon(SK[k].e),avail:()=>openTracks().includes(k),run:back=>track(k,back)}));
  addAct('think',{id:'think-test',name:'אֶתְגַּר הָאַלּוּפִים',icon:icon('🏆'),noDaily:true,avail:()=>testLv()>0,run:challenge});};
C.register();
/* parent names of the activities (read by the content map, like every pack's SKILLS) */
C.SKILLS={'read-rc':'הבנת הנקרא: קטעים מדורגים, שאלות מי/מה/למה, רעיון מרכזי; ניקוד יורד בהדרגה','think-pat':'סדרות צורות: דגם חוזר, כמות, סיבוב, שני שינויים',
  'think-ana':'אנלוגיות: תמונות, צורות ואחר כך מילים (א:ב = ג:?)','think-ser':'סדרות מספרים: קפיצה קבועה, מתחלפת, גדלה, כפולה','think-rel':'קשרים בין מילים: מי לא שייך, הפכים, חלק-שלם, קרוב במשמעות',
  'think-mat':'מטריצות: משבצת חסרה 2x2 ואחר כך 3x3','think-sen':'השלמת משפטים: מילה מתאימה, מילות קישור, שתי השלמות','think-test':'אתגר אלופים: פרקים קצרים בזמן (נפתח רק על ידי הורה)'};
C.levelOf=id=>{if(id==='read-rc')return 'שלב '+C.level(TH(),'rc')+'/5';if(id==='think-test')return testLv()?'רמה '+testLv()+'/6':'';const k=ORDER.find(k=>SK[k].id===id);return k?'שלב '+C.level(TH(),k)+'/5':'';};

/* ---------- the day log (for the parent) ---------- */
const actSkill=id=>/^read-(first|pw|wp|build|sent)$/.test(id)?'dec':/^story-/.test(id)?'rc':null;
O.on('tlDone',(id,st)=>{const L=C.logDay(O.save,day());L.a[id]=(L.a[id]|0)+1;if(st)L.s=(L.s|0)+(st|0);});
O.on('levelDone',(lv,st)=>{if(!lv||!lv.w)return;const L=C.logDay(O.save,day());const k='w:'+lv.w.id;L.a[k]=(L.a[k]|0)+1;L.s=(L.s|0)+(st|0);O.persist();});
O.on('ans',(u,ok)=>{const w=O.WORLDS.find(w=>w.units.some(x=>x.id===u));if(w)hit('m:'+w.id,!!ok);});   /* sent by the math engine for each answer */
O.on('tq',(id,ok)=>{const sk=actSkill(id);if(sk)hit(sk,!!ok);});                                       /* sent by the talents quiz on each first try */

/* ======================= parent: skills tracking ======================= */
const plain=s=>T.plainHe(s);
const NAMES={dec:'קריאה — פענוח מילים',rc:'הבנת הנקרא',nk:'קריאה בלי ניקוד',ana:'אנלוגיות (זוגות מתאימים)',ser:'סדרות מספרים',shp:'סדרות צורות',mat:'מטריצות (משבצת חסרה)',rel:'קשרים בין מילים',sen:'השלמת משפטים',tst:'אתגר אלופים (בזמן)',mth:'חשבון: בעיות מילוליות ואי-שוויונות (באתגר)'};
const TIPS={dec:'לקרוא יחד 5 דקות: מילה אתם, מילה הוא',rc:'אחרי סיפור לשאול: מי? מה קרה קודם? למה?',nk:'לקרוא יחד שלטים ותוויות בלי ניקוד',ana:'לשחק "כמו ש...": חתול-גור, פרה-? ולבקש שיסביר את הקשר',
  ser:'להמציא יחד סדרות (2, 4, 6, ?) ולתת לו להמציא לכם',shp:'לבנות דגם חוזר מקוביות או חרוזים ולבקש להמשיך',mat:'פאזלים ומשחקי "מה חסר בתמונה"',rel:'משחק הפכים ו"מי לא שייך" בנסיעה',
  sen:'לקרוא משפט ולעצור לפני המילה האחרונה — שינחש',tst:'לעבוד לאט ובדיוק; את הזמן מקצרים רק אחרי דיוק גבוה','m:num':'להשוות מספרים בשלטים ובמחירים','m:add':'חיבור בעל פה בדרך (כמה זה 8+7?)',
  'm:sub':'לשחק "חנות" עם מטבעות ולתת עודף','m:mul':'לספור בקפיצות (2, 4, 6...) בזמן הליכה'};
const NK=['ניקוד מלא','מילים נפוצות בלי ניקוד','קטע בלי ניקוד','קטע ושאלה בלי ניקוד'];
function skillList(){const th=TH();const out=[];const add=(k,name,lvTxt)=>{const st=C.skillStat(O.save,k);out.push(Object.assign({k,name,lvTxt},st));};
  add('dec',NAMES.dec,'');add('rc',NAMES.rc,`שלב ${C.level(th,'rc')}/5`);add('nk',NAMES.nk,NK[th.nk|0]);
  O.WORLDS.forEach(w=>{const got=w.levels.filter(l=>O.stars(l.id)).length;add('m:'+w.id,plain(w.name),`${got}/${w.levels.length} שלבים`);});
  ['ana','ser','shp','mat','rel','sen'].forEach(k=>add(k,NAMES[k],`שלב ${C.level(th,k)}/5`));
  add('tst',NAMES.tst,testLv()?`רמה ${testLv()}/6`:'סגור');
  /* skills that other packs log with T.skHit(key, ok) appear by themselves, named by their SKILLS */
  const have=new Set(out.map(x=>x.k));const extra=new Set();C.lastDays(14).forEach(d=>Object.keys(((O.save.alog||{})[d]||{}).k||{}).forEach(k=>{if(!have.has(k))extra.add(k);}));
  extra.forEach(k=>{let n=NAMES[k]||k;if(!NAMES[k])for(const p of packs())if(p.SKILLS[k]){n=p.SKILLS[k];break;}add(k,n,'');});return out;}
const pct=x=>x==null?'—':Math.round(x*100)+'%';
const arrow=t=>t>0?'<span class="thup">▲</span>':t<0?'<span class="thdn">▼</span>':'';
/* top of the summary tab: strong / to strengthen, the last 7 days, this week vs. last week */
T.thinkSummary=(box,sec)=>{const L=skillList().filter(x=>x.n>=6);
  const strong=L.filter(x=>x.acc>=.85).sort((a,b)=>b.acc-a.acc||b.n-a.n).slice(0,3),weak=L.filter(x=>x.acc<.7).sort((a,b)=>a.acc-b.acc).slice(0,3);
  const li=x=>`<li><b>${x.name}</b> ${pct(x.acc)}${arrow(x.tr)}</li>`;
  const sk=sec(box,'מיומנויות',L.length?`<div class="thsw"><div><h4>💪 חזק ב:</h4><ul>${strong.length?strong.map(li).join(''):'<li class="pnote">עוד לא — ממשיכים לתרגל</li>'}</ul></div>
    <div><h4>🎯 כדאי לחזק:</h4><ul>${weak.length?weak.map(x=>`${li(x)}<li class="thtip">💡 ${TIPS[x.k]||'לתרגל יחד 5 דקות ביום'}</li>`).join(''):'<li class="pnote">אין כרגע נושא חלש 👏</li>'}</ul></div></div>`
    :'<div class="pnote">יופיע אחרי כמה ימי משחק (צריך לפחות 6 תשובות בנושא).</div>');sk.classList.add('thsum');
  /* the last 7 days, one line each, tap for details */
  const s0=S(),days=C.lastDays(7),log=O.save.alog||{};const dn=d=>{const t=C.lastDays(2);return d===t[0]?'היום':d===t[1]?'אתמול':'יום '+'אבגדהוש'[new Date(d+'T12:00').getDay()]+'׳';};
  const actName=k=>k.startsWith('arc-')?'ארקייד':k.startsWith('w:')?plain((O.WORLDS.find(w=>'w:'+w.id===k)||{name:'חשבון'}).name):T.ACT[k]?plain(T.ACT[k].name):k;
  const rows=days.map(d=>{const L=log[d]||{a:{},s:0,k:{}},m=Math.round((s0.time[d]|0)/60);const acts=Object.entries(L.a||{}).sort((a,b)=>b[1]-a[1]);
    if(!m&&!acts.length)return `<div class="thday off"><span>${dn(d)}</span><span>לא שיחק</span></div>`;
    const [a,o]=C.sumK(O.save,[d]);const ks=Object.entries(L.k||{}).filter(([k])=>k!=='nk');
    return `<details class="thday"><summary><span>${dn(d)}</span><span>${m} דק׳</span><span class="thacts">${acts.slice(0,3).map(([k])=>actName(k)).join(', ')||'—'}${acts.length>3?' ועוד':''}</span><span>${L.s?'⭐ '+L.s:''}</span></summary>
      <div class="pdin">${acts.map(([k,n])=>`<div class="prow"><span class="pn">${actName(k)}</span><span class="pc">×${n}</span></div>`).join('')}${a?`<div class="pnote">דיוק בניסיון ראשון: ${pct(o/a)} (${a} שאלות)${ks.length?' · '+ks.map(([k,c])=>`${NAMES[k]||actName(k.replace('m:','w:'))} ${Math.round(c[1]/c[0]*100)}%`).join(' · '):''}</div>`:''}</div></details>`;}).join('');
  const w1=C.lastDays(14).slice(0,7),w2=C.lastDays(14).slice(7);const mins=w1.map(d=>(s0.time[d]|0)/60),played=mins.filter(m=>m>=1).length;const avg=played?Math.round(mins.reduce((a,b)=>a+b,0)/played):0;
  const [a1,o1]=C.sumK(O.save,w1),[a2,o2]=C.sumK(O.save,w2);
  /* compact: one line for today, the week behind one tap */
  /* #352: "hasn't played yet" only with no minutes and no play today (the arcade counts too) */
  const t0=days[0],L0=log[t0]||{a:{}},m0=Math.round((s0.time[t0]|0)/60),a0=[...new Set(Object.keys(L0.a||{}).map(actName))];
  const nt=+((O.realSave||O.save).now||{}).t||0,playedT=nt&&new Date(nt).toDateString()===new Date().toDateString();
  sec(box,'היום',`<div class="pnote">${m0} דק׳${a0.length?' · '+a0.slice(0,3).join(', '):m0||playedT?'':' · עוד לא שיחק'}${L0.s?' · ⭐ '+L0.s:''}</div>
    <details class="pdet"><summary>📅 7 ימים אחרונים</summary><div class="pdin">${rows}<div class="pnote thavg">ממוצע ${avg} דק׳ ביום משחק · דיוק השבוע ${a1?pct(o1/a1):'—'}${a2?` (שבוע קודם ${pct(o2/a2)})`:''}</div></div></details>`);};
/* inside "full details": every skill in one table */
T.thinkSkills=(box,sec,BAR)=>{const L=skillList().filter(x=>x.n||x.k==='nk'&&(TH().nk|0));if(!L.length)return;
  sec(box,'כל המיומנויות',`${L.map(x=>`<div class="prow"><span class="pn">${x.name} <small>${x.lvTxt}</small></span>${BAR(x.acc||0,1,x.acc==null?'#ccc':x.acc<.6?'#e4572e':x.acc<.8?'#e9b949':'#4fae4f')}<span class="pc">${pct(x.acc)}${arrow(x.tr)} <small>(${x.n})</small></span></div>`).join('')}
    <div class="pnote">אחוז = תשובות נכונות בניסיון ראשון ב-14 הימים האחרונים (בסוגריים: מספר שאלות). ▲▼ = השבוע לעומת שבוע שעבר. "קריאה בלי ניקוד" עולה לבד כשהבנת הנקרא בשלב 4 ומעלה מדויקת, ויורדת אם יש קושי.</div>`);};
/* parent switch: the champions' challenge (closed by default) */
T.thinkSettings=(body,sec,refresh)=>{const tl=testLv(),th=TH();
  const box=sec(body,'🏆 אתגר אלופים (תרגול מבחן בזמן)',`<div class="pnote">פרקים קצרים בזמן, כמו במבחני המחוננים/מצטיינים, משאלות שאורן כבר מתרגל. כדאי לפתוח רק כשהדיוק גבוה (80% ומעלה) — קודם דיוק, אחר כך מהירות.</div>
    <div class="pnote">${tl?`פתוח ברמה ${tl}. `:'סגור. '}${Object.keys(th.best||{}).length?'הכי טוב: '+Object.entries(th.best).map(([k,v])=>`רמה ${k}: ${v}%`).join(' · '):''}</div>`);
  const row=h('div','popt','<span>רמה:</span>');
  [[0,'סגור'],[1,'1 · 4 שאלות / 3 דק׳'],[2,'2 · 5 / 4 דק׳'],[3,'3 · 6 / 5 דק׳'],[4,'4 · 8 / 7 דק׳'],[5,'5 · 10 / 10 דק׳'],[6,'6 · מבחן קטן: 3 פרקים']].forEach(([v,n])=>{const c=h('button','pchip'+(tl===v?' on':''),n);c.onclick=()=>{S().set.thTest=v;O.persist();refresh();};row.appendChild(c);});
  box.appendChild(row);};

/* ---------- parent: content map — everything the game offers, built from the registries ---------- */
const DESC={'read-first':'זיהוי הצליל הראשון במילה','read-pw':'קריאת מילה והתאמה לתמונה','read-wp':'קריאת מילה ובחירת תמונה','read-build':'הרכבת מילה מהברות','read-sent':'קריאת משפט קצר והבנתו','read-voice':'קריאה בקול עם זיהוי דיבור',
  'eng-letter':'אותיות באנגלית וצליליהן','eng-word':'מילים ראשונות באנגלית','eng-listen':'הבנת הנשמע באנגלית','world-flag':'דגלי מדינות','world-ani':'בעלי חיים ובתי הגידול שלהם','world-il':'מקומות בארץ',
  'type-lessons':'הקלדה עיוורת בעשר אצבעות','type-rain':'מהירות הקלדה','mus-notes':'שמות התווים','mus-dur':'אורך התווים','mus-ear':'שמיעה מוזיקלית','mus-rhythm':'קצב','mus-piano':'נגינת שירים',
  'sci-float':'צף ושוקע — ניבוי ובדיקה','sci-mag':'מגנטים','sci-animals':'מיון בעלי חיים','sci-body':'גוף האדם','sci-plant':'מה צריך צמח','sci-states':'מצבי צבירה','sci-day':'יום ולילה','sci-circ':'מעגל חשמלי',
  'art-draw':'ציור חופשי','art-cbn':'צביעה לפי מספרים','art-mix':'ערבוב צבעים','art-sym':'סימטריה','mind-breath':'נשימה מרגיעה','mind-feel':'זיהוי רגשות','mind-jar':'הכרת תודה','mind-sounds':'הקשבה ורוגע','mind-scan':'מודעות לגוף',
  'code-maze':'תכנות: רצף פקודות ולולאות','think-sudoku':'סודוקו — היגיון','think-maze':'מבוך — תכנון דרך','think-mem':'זיכרון חזותי','write-trace':'כתיבת אותיות'};
const packs=()=>Object.keys(window).map(k=>{try{return window[k];}catch(e){return null;}}).filter(x=>x&&typeof x==='object'&&x.SKILLS&&typeof x.register==='function');
const descOf=a=>{if(a.desc)return a.desc;for(const p of packs())if(p.SKILLS[a.id])return p.SKILLS[a.id];if(/^story-/.test(a.id))return 'סיפור קצר עם שאלות הבנה';return DESC[a.id]||'';};
const lvOf=a=>{let v='';for(const p of packs())if(p!==window.LEARN&&typeof p.levelOf==='function'){v=p.levelOf(a.id);if(v)break;}
  const ru=window.LEARN&&window.LEARN.runwayOf?window.LEARN.runwayOf(a.id):'';return v&&ru?v+' · '+ru:v||ru;};
/* review: the parent tries each item in the sandbox and ticks "checked" (saved in the synced settings: set.reviewed{id:day}) */
const REV=()=>{const st=O.realSave.set=O.realSave.set||{};st.reviewed=st.reviewed||{};return st.reviewed;};
let cmOnlyNew=false,cmLast=null;
/* open one item in the parent sandbox; done/back returns to the map */
T.cmTry=id=>{cmLast=id;T.cmFrom=true;const back=()=>{O.parentPlay(false);T.cmFrom=false;T.parentPanel('map');};O.parentPlay(true);
  if(id.startsWith('w:')){const w=O.WORLDS.find(x=>'w:'+x.id===id);if(w)O.showWorld(w);else back();return;}const a=T.ACT[id];if(a)a.run(back);else back();};
/* everything in the order Oren meets it: the math journey, open buildings, then the ones that open later, then switched off */
function cmItems(){const s=S(),set=s.set||{},off=set.offA||{},offW=set.offW||{};const out=[];
  O.WORLDS.forEach(w=>{const got=w.levels.filter(l=>O.stars(l.id)).length;out.push({area:'🧮 מסע החשבון',id:'w:'+w.id,name:plain(w.name),st:offW[w.id]?'off':(O.unlocked&&!O.unlocked(w.levels[0]))?'lock':'on',lv:`${got}/${w.levels.length} שלבים`,got,max:w.levels.length,desc:w.units.filter(u=>!u.boss).slice(0,4).map(u=>plain(u.name)).join(', ')});});
  const gord=((set.grad||{}).order)||[];const rank=b=>{const bs=T.bState(b);return (bs==='on'?0:bs==='off'?2000:1000)+(gord.includes(b.id)?gord.indexOf(b.id):100+T.BUILD.indexOf(b));};
  T.BUILD.slice().sort((a,b)=>rank(a)-rank(b)).forEach(b=>{const bs=T.bState(b);const bst=bs==='off'?'off':bs==='on'?'on':'lock';
    b.acts.forEach(a=>{const st=bst==='off'||off[a.id]?'off':(bst==='lock'||(a.avail&&!a.avail()))?'lock':'on';const r=s.tl[a.id]||{};
      out.push({area:plain(b.name),id:a.id,name:plain(a.name),st,lv:lvOf(a)||(r.n?`${r.n} פעמים`:''),got:r.s|0,max:3,desc:descOf(a)});});});
  const o={on:0,lock:1,off:2};return out.map((x,k)=>Object.assign(x,{k})).sort((a,b)=>(o[a.st]-o[b.st])||(a.k-b.k));}
T.contentMap=(box,sec,BAR)=>{const ST={on:'✓ פתוח',lock:'🔒 נפתח בהדרגה',off:'⏸ כבוי'};const rev=REV();const items=cmItems();const done=items.filter(x=>rev[x.id]).length;
  const S0=sec(box,'🗺️ מפת התוכן',`<div class="pnote">כל מה שיש במשחק, לפי הסדר שאורן יפגוש. ▶ נסה פותח את הפעילות במצב הורה (לא משפיע על אורן). ✓ פתוח · 🔒 נפתח בהדרגה · ⏸ כבוי.</div>`);
  const top=h('div','cmtop',`<b>בדקת ${done} מתוך ${items.length}</b>`);const f=h('button','pchip'+(cmOnlyNew?' on':''),'לא נבדקו');f.onclick=()=>{cmOnlyNew=!cmOnlyNew;S0.remove();T.contentMap(box,sec,BAR);};top.appendChild(f);S0.appendChild(top);
  let area=null;items.forEach(x=>{if(cmOnlyNew&&rev[x.id])return;if(x.area!==area){area=x.area;S0.appendChild(h('div','cmarea',area));}
    const r=h('div','cmrow'+(rev[x.id]?' ok':''),`<span class="cmn">${x.name}${x.desc?`<small>${x.desc}</small>`:''}</span><span class="cmst ${x.st}">${ST[x.st]}${x.lv?`<small>${x.lv}</small>`:''}</span>${x.max?BAR(x.got,x.max):'<span></span>'}`);r.dataset.id=x.id;
    const tr=h('button','pchip','▶ נסה');tr.onclick=()=>T.cmTry(x.id);
    const cb=h('label','cmchk',`<input type="checkbox"${rev[x.id]?' checked':''}> בדקתי`);cb.firstChild.onchange=e=>{const R=REV();if(e.target.checked)R[x.id]=O.today();else delete R[x.id];O.persist();S0.remove();T.contentMap(box,sec,BAR);};
    r.append(tr,cb);S0.appendChild(r);});
  if(cmLast){const el=S0.querySelector(`.cmrow[data-id="${cmLast}"]`);if(el)setTimeout(()=>el.scrollIntoView({block:'center'}),0);cmLast=null;}
  return S0;};

window.__th={track,readRC,challenge,openTracks,TH,skillList};
})();
