/* ===== CURRICULUM GAPS · math units: picture graphs, shapes, length & weight =====
   Plain question generators in the core's own format (CH + chk), so they play in every math mode.
   Usage inside the core script (before WORLDS): const GX=gapsMath({rand,pick,shuffle,mm,CH,SPR,L_,nb});
   GX.units['pict-1'] ... are ready unit objects; GX.place says which world gets which units. */
function gapsMath({rand,pick,shuffle,mm,CH,SPR,L_,nb}){
const numOpts=(ans,k,lo)=>{const s=new Set([ans]);let t=0;while(s.size<k&&t++<60){const v=ans+pick([-3,-2,-1,1,2,3]);if(v>=lo)s.add(v);}let v=ans+1;while(s.size<k){s.add(v);v++;}return shuffle([...s]);};
const ch=(pr,opts,ans,h1,h2,cls,chk,ltr)=>Object.assign(CH(pr,opts,ans,h1,h2,!!ltr,cls),{chk});

/* ---------- picture graphs ---------- */
const CATS=[['star','כּוֹכָבִים','מִכּוֹכָבִים','וְכוֹכָבִים','הַכּוֹכָבִים'],['flower','פְּרָחִים','מִפְּרָחִים','וּפְרָחִים','הַפְּרָחִים'],['tree','עֵצִים','מֵעֵצִים','וְעֵצִים','הָעֵצִים'],
 ['sheep','כְּבָשִׂים','מִכְּבָשִׂים','וּכְבָשִׂים','הַכְּבָשִׂים'],['cat','חֲתוּלִים','מֵחֲתוּלִים','וַחֲתוּלִים','הַחֲתוּלִים'],['dog','כְּלָבִים','מִכְּלָבִים','וּכְלָבִים','הַכְּלָבִים']];
function graph(cs,ns,cols){const mx=Math.max(...ns);let s=`<div class="pgraph ${cols?'cols':'rows'}">`;
  cs.forEach((c,k)=>{s+=`<div class="pgr"><span class="pgc pgl">${SPR[c[0]]}</span>`;for(let j=0;j<mx;j++)s+=`<span class="pgc">${j<ns[k]?SPR[c[0]]:''}</span>`;s+='</div>';});return s+'</div>';}
const pict=(k,lo,hi,kinds)=>()=>{const cs=shuffle(CATS.slice()).slice(0,k);let ns;do{ns=cs.map(()=>rand(lo,hi));}while(new Set(ns).size<k);
  const cols=mm(.5),g=graph(cs,ns,cols),line=cols?'בַּטּוּר':'בַּשּׁוּרָה',ask=pick(kinds);
  const lbl=`אֶת הַתְּמוּנָה בַּמִּסְגֶּרֶת הַצְּהֻבָּה לֹא סוֹפְרִים. הִיא רַק אוֹמֶרֶת מָה יֵשׁ ${line}.`;
  const list=cs.map((c,j)=>`${SPR[c[0]]} ${L_(ns[j])}`).join(' · ');
  if(ask==='most'||ask==='least'){const v=ask==='most'?Math.max(...ns):Math.min(...ns);
    return ch(`<div class="qq">מִמָּה יֵשׁ הֲכִי ${ask==='most'?'הַרְבֵּה':'מְעַט'}?</div>${g}`,cs.map(c=>SPR[c[0]]),ns.indexOf(v),
      cols?`מְחַפְּשִׂים אֶת הַטּוּר הֲכִי ${ask==='most'?'גָּבוֹהַּ':'נָמוּךְ'}`:`מְחַפְּשִׂים אֶת הַשּׁוּרָה הֲכִי ${ask==='most'?'אֲרֻכָּה':'קְצָרָה'}`,list,'pgo',{t:'pict',ask,ns});}
  if(ask==='more'||ask==='total'){let a,b;do{a=rand(0,k-1);b=rand(0,k-1);}while(a===b||(ask==='more'&&ns[a]<=ns[b]));const ans=ask==='more'?ns[a]-ns[b]:ns[a]+ns[b];const o=numOpts(ans,4,ask==='more'?1:2);
    const pr=ask==='more'?`בְּכַמָּה יֵשׁ יוֹתֵר ${cs[a][1]} ${cs[b][2]}?`:`כַּמָּה ${cs[a][1]} ${cs[b][3]} יֵשׁ בְּיַחַד?`;
    return ch(`<div class="qq">${pr}</div>${g}`,o.map(String),o.indexOf(ans),ask==='more'?'סוֹפְרִים כָּל שׁוּרָה, וּמוֹרִידִים אֶת הַקָּטָן מֵהַגָּדוֹל':'סוֹפְרִים אֶת שְׁתֵּיהֶן, וּמְחַבְּרִים',
      `${list}<br>${L_(ask==='more'?`${ns[a]} − ${ns[b]} = ?`:`${ns[a]} + ${ns[b]} = ?`)}`,'',{t:'pict',ask,ns,a,b},true);}
  const j=rand(0,k-1),o=numOpts(ns[j],3,1);
  return ch(`<div class="qq">כַּמָּה ${cs[j][1]} יֵשׁ?</div>${g}`,o.map(String),o.indexOf(ns[j]),`סוֹפְרִים אֶחָד אֶחָד ${line} שֶׁל ${cs[j][4]}`,lbl,'',{t:'pict',ask:'count',ns,j},true);};

/* ---------- shapes ---------- */
const COL=['#e4572e','#3a8fc4','#4fae4f','#f28c28','#8e6fd1','#e9b949','#3cb3a6'];
const NAME={tri:'מְשֻׁלָּשׁ',sq:'רִבּוּעַ',rect:'מַלְבֵּן',circ:'עִגּוּל',pent:'מְחֻמָּשׁ',hex:'מְשֻׁשֶּׁה'};
const SIDES={tri:3,sq:4,rect:4,pent:5,hex:6};
const rot=(pts,a)=>{const c=Math.cos(a),s=Math.sin(a);return pts.map(([x,y])=>[50+(x-50)*c-(y-50)*s,50+(x-50)*s+(y-50)*c]);};
const ngon=(n,r,a0,jit)=>Array.from({length:n},(_,k)=>{const a=a0+k*2*Math.PI/n+(jit?(Math.random()-.5)*.5:0),rr=r*(jit?.82+Math.random()*.18:1);return [50+rr*Math.cos(a),50+rr*Math.sin(a)];});
function shapeSVG(t,hard,cls,size){const col=pick(COL);let body;
  if(t==='circ')body=`<circle cx="50" cy="50" r="${rand(28,42)}"`;
  else{let p;
    if(t==='tri')p=hard?(()=>{const a0=Math.random()*6.28,a1=a0+(100+Math.random()*40)*Math.PI/180,a2=a1+(95+Math.random()*40)*Math.PI/180;return [a0,a1,a2].map(a=>[50+44*Math.cos(a),50+44*Math.sin(a)]);})():ngon(3,44,-Math.PI/2);
    else if(t==='sq'){const s=(size||rand(50,66))/2;p=[[50-s,50-s],[50+s,50-s],[50+s,50+s],[50-s,50+s]];}
    else if(t==='rect'){const w=rand(78,86)/2,hh=(size||rand(28,44))/2;p=[[50-w,50-hh],[50+w,50-hh],[50+w,50+hh],[50-w,50+hh]];if(hard&&mm(.4))p=rot(p,Math.PI/2);}
    else p=ngon(SIDES[t],42,Math.random()*6.28,hard);
    if(hard&&(t==='sq'||t==='rect'||t==='tri'))p=rot(p,Math.random()*6.28);
    body=`<polygon points="${p.map(q=>q.map(v=>v.toFixed(1)).join(',')).join(' ')}"`;}
  return `<svg class="${cls||''}" viewBox="0 0 100 100" aria-hidden="true">${body} fill="${col}" stroke="#1d2631" stroke-width="3" stroke-linejoin="round"/></svg>`;}
const HINT={tri:`לַמְּשֻׁלָּשׁ ${L_(3)} צְלָעוֹת`,sq:`לָרִבּוּעַ ${L_(4)} צְלָעוֹת שָׁווֹת`,rect:`לַמַּלְבֵּן ${L_(4)} צְלָעוֹת: שְׁתַּיִם אֲרֻכּוֹת וּשְׁתַּיִם קְצָרוֹת`,circ:'לָעִגּוּל אֵין פִּנּוֹת בִּכְלָל',
  pent:`לַמְּחֻמָּשׁ ${L_(5)} צְלָעוֹת`,hex:`לַמְּשֻׁשֶּׁה ${L_(6)} צְלָעוֹת`};
/* a square is also a rectangle: never ask "which is the rectangle?" next to a square, never offer "rectangle" as a wrong name of a square */
function whichQ(set,hard){const t=pick(set);const others=shuffle(set.filter(x=>x!==t&&!(t==='rect'&&x==='sq'))).slice(0,2);const ts=shuffle([t,...others]);
  return ch(`<div class="qq">אֵיזוֹ צוּרָה הִיא ${NAME[t]}?</div>`,ts.map(x=>shapeSVG(x,hard)),ts.indexOf(t),HINT[t],'סוֹפְרִים אֶת הַצְּלָעוֹת שֶׁל כָּל צוּרָה','shp',{t:'shape',ask:'which',ts,target:t});}
function nameQ(set,hard){const t=pick(set.filter(x=>x!=='circ'||set.length<5));const others=shuffle(set.filter(x=>x!==t&&!(t==='sq'&&x==='rect'))).slice(0,2);const ns=shuffle([t,...others]);
  return ch(`<div class="qq">אֵיךְ קוֹרְאִים לַצּוּרָה הַזֹּאת?</div>${shapeSVG(t,hard,'shp1')}`,ns.map(x=>NAME[x]),ns.indexOf(t),'סוֹפְרִים אֶת הַצְּלָעוֹת',HINT[t],'tx',{t:'shape',ask:'name',ns,target:t});}
function countQ(hard){const t=pick(['tri','sq','rect','pent','hex']);const corners=mm(.5);const o=['3','4','5','6'];
  return ch(`<div class="qq">כַּמָּה ${corners?'קָדְקֳדִים':'צְלָעוֹת'} יֵשׁ לַצּוּרָה?</div>${shapeSVG(t,hard,'shp1')}`,o,SIDES[t]-3,
    corners?'קָדְקֹד הוּא פִּנָּה. סוֹפְרִים אֶת הַפִּנּוֹת':'צֶלַע הִיא קַו יָשָׁר. סוֹפְרִים אֶת הַקַּוִּים מִסָּבִיב','מַתְחִילִים בְּאֶחָד, וּמַמְשִׁיכִים מִסָּבִיב עַד שֶׁחוֹזְרִים אֵלָיו','',{t:'shape',ask:corners?'corners':'sides',target:t},true);}
/* the two rectangles get different heights, so they never look the same (#292) */
function sqQ(hard){const sq=shapeSVG('sq',hard,'');const ts=shuffle(['sq','rect','rect']);const h1=rand(28,44),hs=[h1,28+(h1-28+8)%17];let r=0;const svgs=ts.map(x=>x==='sq'?sq:shapeSVG('rect',hard,'',hs[r++]));
  return ch('<div class="qq">אֵיזֶה מַלְבֵּן הוּא גַּם רִבּוּעַ?</div>',svgs,ts.indexOf('sq'),'לָרִבּוּעַ כָּל אַרְבַּע הַצְּלָעוֹת שָׁווֹת','מְחַפְּשִׂים מַלְבֵּן שֶׁהָאֹרֶךְ וְהָרֹחַב שֶׁלּוֹ שָׁוִים','shp',{t:'shape',ask:'sqrect',ts});}
const B4=['tri','sq','rect','circ'],B6=['tri','sq','rect','pent','hex','circ'];
const shp1=i=>{const hard=i>=3;return mm(.65)?whichQ(B4,hard):nameQ(B4,hard);};
const shp2=i=>{const hard=i>=2;const r=Math.random();return r<.4?countQ(hard):r<.65?nameQ(B6.filter(x=>x!=='circ'),hard):r<.85?sqQ(hard):whichQ(B6,hard);};

/* ---------- length: a ruler in cm ---------- */
const U=28,X0=22,XX=v=>X0+v*U;
function rulerSVG(s,e,obj){let g=`<svg class="ruler" viewBox="0 0 330 118" aria-hidden="true" direction="ltr">`;
  if(obj==='pencil')g+=`<rect x="${XX(s)}" y="16" width="10" height="22" fill="#ff9cc2" stroke="#1d2631" stroke-width="2"/><rect x="${XX(s)+10}" y="16" width="${XX(e)-XX(s)-28}" height="22" fill="#ffd166" stroke="#1d2631" stroke-width="2"/>`+
    `<path d="M${XX(e)-18} 16 L${XX(e)} 27 L${XX(e)-18} 38 Z" fill="#e9c8a0" stroke="#1d2631" stroke-width="2" stroke-linejoin="round"/><path d="M${XX(e)-6} 23.5 L${XX(e)} 27 L${XX(e)-6} 30.5Z" fill="#1d2631"/>`;
  else{g+=`<rect x="${XX(s)}" y="18" width="${XX(e)-XX(s)}" height="18" rx="9" fill="#e48aa6" stroke="#1d2631" stroke-width="2"/>`;for(let v=s+.5;v<e-.4;v+=.5)g+=`<line x1="${XX(v)}" y1="20" x2="${XX(v)}" y2="34" stroke="#b9587a" stroke-width="1.5"/>`;
    g+=`<circle cx="${XX(e)-8}" cy="24" r="2.6" fill="#1d2631"/>`;}
  g+=`<line x1="${XX(s)}" y1="40" x2="${XX(s)}" y2="62" stroke="#3a8fc4" stroke-width="2" stroke-dasharray="4 3"/><line x1="${XX(e)}" y1="40" x2="${XX(e)}" y2="62" stroke="#e4572e" stroke-width="2.5" stroke-dasharray="4 3"/>`;
  g+=`<rect x="${X0-12}" y="62" width="${10*U+24}" height="50" fill="#ffe8a3" stroke="#1d2631" stroke-width="3"/>`;
  for(let v=0;v<=10;v++){g+=`<line x1="${XX(v)}" y1="62" x2="${XX(v)}" y2="80" stroke="#1d2631" stroke-width="2.5"/><text x="${XX(v)}" y="102" text-anchor="middle" font-family="Noto Sans Hebrew,Arial" font-weight="900" font-size="16" fill="#1d2631">${v}</text>`;
    if(v<10)g+=`<line x1="${XX(v+.5)}" y1="62" x2="${XX(v+.5)}" y2="71" stroke="#1d2631" stroke-width="1.5"/>`;}
  return g+'</svg>';}
const CM='ס״מ';
const len1=i=>{const off=i>=3&&mm(.6);const s=off?rand(1,4):0;const L=off?rand(2,Math.min(6,10-s)):rand(2,10);const e=s+L;const obj=mm(.5)?'pencil':'worm';const o=numOpts(L,3,1);
  return ch(`<div class="qq">מָה הָאֹרֶךְ שֶׁל ${obj==='pencil'?'הָעִפָּרוֹן':'הַתּוֹלַעַת'}?</div>${rulerSVG(s,e,obj)}`,o.map(n=>`<span dir="rtl">${n} ${CM}</span>`),o.indexOf(L),
    s?`זֶה לֹא מַתְחִיל בְּ-${L_(0)}! סוֹפְרִים אֶת הַסֶּנְטִימֶטְרִים מֵהַהַתְחָלָה עַד הַסּוֹף`:`מַתְחִילִים בְּ-${L_(0)}. מְחַפְּשִׂים אֶת הַמִּסְפָּר שֶׁבַּסּוֹף`,
    s?`מַתְחִיל בְּ-${L_(s)}, נִגְמָר בְּ-${L_(e)}: ${L_(`${e} − ${s} = ?`)}`:'הַקַּו הָאָדֹם בַּסּוֹף מַרְאֶה אֶת הַמִּסְפָּר','tx',{t:'ruler',s,e});};
/* longer / shorter: each option is a pencil drawn to the same scale */
function penSVG(x,L,col){const w=L*18;return `<svg viewBox="0 0 200 44" aria-hidden="true"><rect x="${x}" y="12" width="8" height="20" fill="#ff9cc2" stroke="#1d2631" stroke-width="2"/><rect x="${x+8}" y="12" width="${w-24}" height="20" fill="${col}" stroke="#1d2631" stroke-width="2"/><path d="M${x+w-16} 12 L${x+w} 22 L${x+w-16} 32Z" fill="#e9c8a0" stroke="#1d2631" stroke-width="2"/></svg>`;}
function longQ(hard){let Ls;do{Ls=[0,0,0].map(()=>rand(3,10));}while(new Set(Ls).size<3);const long=mm(.5);const cols=shuffle(COL.slice()).slice(0,3);
  const opts=Ls.map((L,k)=>penSVG(hard?rand(2,190-L*18):2,L,cols[k]));const v=long?Math.max(...Ls):Math.min(...Ls);
  return ch(`<div class="qq">אֵיזֶה עִפָּרוֹן הֲכִי ${long?'אָרֹךְ':'קָצָר'}?</div>`,opts,Ls.indexOf(v),hard?'מִסְתַּכְּלִים גַּם עַל הַהַתְחָלָה וְגַם עַל הַסּוֹף':`כֻּלָּם מַתְחִילִים בְּאוֹתוֹ מָקוֹם. ${long?'מִי מַגִּיעַ הֲכִי רָחוֹק?':'מִי נִגְמָר הֲכִי מֻקְדָּם?'}`,
    long?'הָאָרֹךְ תּוֹפֵס הֲכִי הַרְבֵּה מָקוֹם':'הַקָּצָר תּוֹפֵס הֲכִי מְעַט מָקוֹם','pen',{t:'long',Ls,ask:long?'long':'short'});}
/* heavier / lighter: a balance scale */
const CUBE=c=>`<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M4 10 L12 3 L37 3 L30 10Z" fill="${c}" opacity=".7" stroke="#1d2631" stroke-width="2"/><path d="M30 10 L37 3 L37 30 L30 37Z" fill="${c}" opacity=".85" stroke="#1d2631" stroke-width="2"/><rect x="4" y="10" width="26" height="27" fill="${c}" stroke="#1d2631" stroke-width="2.5"/></svg>`;
function scaleSVG(cl,cr,leftDown){const th=(leftDown?1:-1)*13*Math.PI/180,R=70,cx=100,cy=34;const L=[cx-R*Math.cos(th),cy+R*Math.sin(th)],Rr=[cx+R*Math.cos(th),cy-R*Math.sin(th)];
  const pan=([x,y],c)=>`<line x1="${x}" y1="${y}" x2="${x-22}" y2="${y+30}" stroke="#5a5f66" stroke-width="2"/><line x1="${x}" y1="${y}" x2="${x+22}" y2="${y+30}" stroke="#5a5f66" stroke-width="2"/><path d="M${x-30} ${y+30} L${x+30} ${y+30} L${x+22} ${y+38} L${x-22} ${y+38}Z" fill="#9aa1a8" stroke="#1d2631" stroke-width="2"/><g transform="translate(${x-17} ${y-4}) scale(.85)">${CUBE(c).replace(/<\/?svg[^>]*>/g,'')}</g>`;
  return `<svg class="scale" viewBox="0 0 200 140" aria-hidden="true"><rect x="70" y="126" width="60" height="10" fill="#94613a" stroke="#1d2631" stroke-width="2"/><rect x="96" y="${cy}" width="8" height="94" fill="#c8925a" stroke="#1d2631" stroke-width="2"/>`+
    `<line x1="${L[0].toFixed(1)}" y1="${L[1].toFixed(1)}" x2="${Rr[0].toFixed(1)}" y2="${Rr[1].toFixed(1)}" stroke="#1d2631" stroke-width="6" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="6" fill="#e4572e" stroke="#1d2631" stroke-width="2"/>${pan(L,cl)}${pan(Rr,cr)}</svg>`;}
function balQ(hard){const cs=shuffle(COL.slice()).slice(0,hard?3:2);const heavy=mm(.5);
  if(!hard){const lt=mm(.5);const svg=scaleSVG(cs[0],cs[1],lt);const hv=lt?0:1;const opts=cs.map(CUBE);
    return ch(`<div class="qq">אֵיזוֹ קֻבִּיָּה ${heavy?'כְּבֵדָה':'קַלָּה'} יוֹתֵר?</div>${svg}`,opts,heavy?hv:1-hv,'בַּמֹּאזְנַיִם, הַצַּד הַכָּבֵד יוֹרֵד לְמַטָּה','הַצַּד הַקַּל עוֹלֶה לְמַעְלָה','cube',{t:'bal',hv,ask:heavy?'heavy':'light'});}
  /* cs[0] > cs[1] > cs[2] */
  const s1=mm(.5)?scaleSVG(cs[0],cs[1],true):scaleSVG(cs[1],cs[0],false),s2=mm(.5)?scaleSVG(cs[1],cs[2],true):scaleSVG(cs[2],cs[1],false);
  const idx=shuffle([0,1,2]);const opts=idx.map(k=>CUBE(cs[k]));
  return ch(`<div class="qq">אֵיזוֹ קֻבִּיָּה הֲכִי ${heavy?'כְּבֵדָה':'קַלָּה'}?</div><div class="gp-scales">${s1}${s2}</div>`,opts,idx.indexOf(heavy?0:2),'בְּכָל מֹאזְנַיִם, הַצַּד שֶׁלְּמַטָּה כָּבֵד יוֹתֵר',
    heavy?'מְחַפְּשִׂים קֻבִּיָּה שֶׁתָּמִיד יוֹרֶדֶת לְמַטָּה':'מְחַפְּשִׂים קֻבִּיָּה שֶׁתָּמִיד עוֹלָה לְמַעְלָה','cube',{t:'bal3',idx,ask:heavy?'heavy':'light'});}
const len2=i=>{const hard=i>=3;return mm(.5)?longQ(hard):balQ(hard);};

const units={
 'pict-1':{id:'pict-1',lbl:'▮▮▮',name:'גְּרַף תְּמוּנוֹת',lesson:'בִּגְרַף תְּמוּנוֹת כָּל תְּמוּנָה הִיא דָּבָר אֶחָד. סוֹפְרִים אֶת הַתְּמוּנוֹת בְּכָל שׁוּרָה. הַתְּמוּנָה בַּמִּסְגֶּרֶת הַצְּהֻבָּה רַק אוֹמֶרֶת מָה יֵשׁ בַּשּׁוּרָה.',gen:pict(3,1,6,['count','count','most','least'])},
 'pict-2':{id:'pict-2',lbl:'▮▮ ?',name:'גְּרָף: בְּכַמָּה יוֹתֵר?',lesson:'כְּדֵי לָדַעַת בְּכַמָּה יֵשׁ יוֹתֵר, סוֹפְרִים כָּל שׁוּרָה וּמוֹרִידִים אֶת הַקָּטָן מֵהַגָּדוֹל.',gen:pict(4,2,9,['more','more','total','most','count'])},
 'shp-1':{id:'shp-1',lbl:'△ □ ○',name:'צוּרוֹת',lesson:'לַמְּשֻׁלָּשׁ 3 צְלָעוֹת. לָרִבּוּעַ וְלַמַּלְבֵּן 4. לָעִגּוּל אֵין צְלָעוֹת בִּכְלָל.',gen:shp1},
 'shp-2':{id:'shp-2',lbl:'⬠ ⬡',name:'צְלָעוֹת וְקָדְקֳדִים',lesson:'צֶלַע הִיא קַו יָשָׁר. קָדְקֹד הוּא הַפִּנָּה שֶׁבָּהּ שְׁתֵּי צְלָעוֹת נִפְגָּשׁוֹת. לָרִבּוּעַ כָּל הַצְּלָעוֹת שָׁווֹת, וְהוּא גַּם מַלְבֵּן.',gen:shp2},
 'len-1':{id:'len-1',lbl:'ס״מ',name:'מוֹדְדִים בְּסַרְגֵּל',lesson:'מַתְחִילִים לִמְדֹּד מֵהָאֶפֶס. הַמִּסְפָּר שֶׁבּוֹ הַחֵפֶץ נִגְמָר הוּא הָאֹרֶךְ בְּסֶנְטִימֶטְרִים.',gen:len1},
 'len-2':{id:'len-2',lbl:'⚖',name:'אָרֹךְ, קָצָר, כָּבֵד, קַל',lesson:'בַּמֹּאזְנַיִם, הַצַּד הַכָּבֵד יוֹרֵד לְמַטָּה, וְהַצַּד הַקַּל עוֹלֶה לְמַעְלָה.',gen:len2}};
return {units,place:{word:{after:'word-2',ids:['pict-1','pict-2']},time:{after:null,ids:['shp-1','shp-2','len-1','len-2']}},rulerSVG,shapeSVG,scaleSVG};}
