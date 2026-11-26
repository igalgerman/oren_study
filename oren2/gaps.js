/* ===== CURRICULUM GAPS (grade 1-2): nikud ladder, first sound, spelling, word race, final letters, more stories =====
   Self-contained. window.GAPS.register() adds the activities to the library / writing house.
   Every activity is recorded with T.record: the round itself ('nik-3', 'snd-2', 'spell-1') and the activity
   card ('read-nik', 'read-sound', 'write-spell', 'read-flu' with the personal best in .b). GAPS.SKILLS names them. */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;
const {h,$,pick,shuffle,ICON,SPR}=O;const sfx=O.sfx,D=O.D;
const ALLSPR=k=>T.ALLSPR(k);
const TL=id=>(T.S().tl[id]||{});

/* ---------- word pool: full nikud, "word|sprite" ---------- */
const RAW=`דָּג|fish יָד גַּן חַג סַל פַּח חַם קַר אַבָּא סַבָּא מַפָּה שָׁנָה בָּנָנָה גָּמָל חָלָב לָבָן תָּמָר שַׁבָּת פָּנָס|lantern עָנָן|cloud דַּף חַלָּה כַּף קָטָן גַּל נָחָשׁ צָב|turtle מַתָּנָה נַעַל|shoe
סִירָה|boat שִׁיר עִיר תִּיק דָּגִים פִּיל מִיץ כִּיס תַּנִּין כָּרִית חִידָה גִּיטָרָה סִיר תִּירָס מִטָּה יָדַיִם מַיִם שָׁמַיִם בַּיִת|hut פִּיתָה
שָׁלוֹם כּוֹס|cup יוֹם חוֹל קוֹף דּוֹב חַלּוֹן לִימוֹן כּוֹכָב|star כּוֹבַע|hat גָּדוֹל שׁוֹקוֹלָד דּוֹדָה אוֹר עוֹף מָקוֹם אָרוֹן סַבּוֹן בַּלּוֹן תּוֹף חוֹף צִפּוֹר|bird עִפָּרוֹן|pencil
סוּס תּוּת עוּגָה|cake בּוּבָּה חָתוּל|cat כַּדּוּר|ball תַּפּוּז גּוּר דּוּבִּי לוּחַ מוּזִיקָה שׁוּק תַּפּוּחַ|apple קוּפָּה חוּט שׁוּעָל סוּכָּה
כֶּלֶב|dog סֵפֶר|bookS דֶּגֶל|flag בֵּיצָה|egg עֵץ|tree לֵב|heart שֶׁמֶשׁ|sun גֶּשֶׁם יֶלֶד מֶלֶךְ רֶגֶל נֵר שֵׁן כֶּתֶר פֶּרַח|flower קֶשֶׁת|rainbow תֵּה מֶלוֹן אוֹהֶל שׁוֹטֵר דֶּלֶת חֶדֶר יָרֵחַ|moon
דְּבוֹרָה שְׂמִיכָה סְבִיבוֹן גְּלִידָה תְּמוּנָה נְמָלָה מְכוֹנִית|car דְּרָקוֹן|dragon כִּבְשָׂה|sheep מַפְתֵּחַ|key יַלְדָּה מִכְתָּב צְפַרְדֵּעַ סַבְתָּא מַחְבֶּרֶת כְּבִישׁ שׁוּלְחָן`;

/* ---------- reading the nikud of a word ---------- */
const VO=['a','i','o','u','e','s'];                       /* the ladder order */
const VM={'ָ':'a','ַ':'a','ֲ':'a','ִ':'i','ֹ':'o','ֺ':'o','ֳ':'o','ֻ':'u','ֵ':'e','ֶ':'e','ֱ':'e','ְ':'s'};
const isL=c=>/[א-ת]/.test(c);
const vowOf=m=>{for(const c of m)if(VM[c])return VM[c];return '';};
const bareMarks=m=>[...m].filter(c=>!VM[c]).join('');     /* dagesh, shin/sin dot */
function parse(w){const L=[];let pos=0;for(const c of w){if(isL(c))L.push({c,m:'',a:pos,z:pos+c.length});else if(L.length){L[L.length-1].m+=c;L[L.length-1].z=pos+c.length;}pos+=c.length;}
  const syl=[],skip=new Set();
  for(let i=0;i<L.length;i++){if(skip.has(i))continue;const a=L[i],n=L[i+1];let v=vowOf(a.m),end=i;
    if(!v&&n&&n.c==='ו'&&n.m==='ּ'){v='u';end=i+1;}
    else if(!v&&n&&n.c==='ו'&&n.m==='ֹ'){v='o';end=i+1;}
    else if(!v&&i===0&&a.c==='ו'&&a.m==='ּ')v='u';
    else if((v==='i'||v==='e')&&n&&n.c==='י'&&!n.m&&(i+2<L.length))end=i+1;
    if(v==='s'&&i===L.length-1)v='';                      /* the silent shva of final kaf */
    if(end>i)skip.add(end);
    if(v)syl.push({i,v,s:w.slice(a.a,L[end].z),z:L[end].z});}
  return {L,syl};}
const WD=RAW.trim().split(/\s+/).map(t=>{const [w,spr]=t.split('|');const {L,syl}=parse(w);const vs=[...new Set(syl.map(x=>x.v))];
  return {w,spr:spr||'',plain:L.map(x=>x.c).join(''),f:L[0].c,base:L[0].c+bareMarks(L[0].m),syl,vs,r:Math.max(...vs.map(v=>VO.indexOf(v))),s1:syl[0]&&syl[0].i===0?syl[0]:null};});
const hi=w=>w.s1?`<b class="gp-hi">${w.w.slice(0,w.s1.z)}</b>${w.w.slice(w.s1.z)}`:w.w;
const FORM={a:'ָ',i:'ִי',o:'וֹ',u:'וּ',e:'ֵ',s:'ְ'};
const mk=(base,v)=>base+FORM[v];
const BASES=['בּ','גּ','ד','ל','מ','נ','ס','ר','ת','שׁ','כּ','פּ','ק','ז','צ','י','ח'];
/* letters that sound alike are never offered against each other */
const GRP=['אעה','בו','כךחק','טת','סש','צץ','מם','נן','פף','ג','ד','ז','י','ל','ר'];
const grp=c=>GRP.findIndex(g=>g.includes(c));
const sameSound=(a,b)=>grp(a)===grp(b);
const clash=(a,b)=>(a==='e'&&b==='s')||(a==='s'&&b==='e');   /* a starting shva sounds like a short e */
const sayW=w=>O.say(w.w);
const pic=w=>w.spr&&ALLSPR(w.spr)?`<span class="pic">${ALLSPR(w.spr)}</span>`:'';
const plainHe=s=>T.plainHe(s);

/* the activity's level: the first round not yet passed with 2+ stars */
const level=(pre,n)=>{for(let k=1;k<=n;k++)if((TL(pre+'-'+k).s|0)<2)return k;return n;};
const MAIN={nik:'read-nik',snd:'read-sound',spell:'write-spell'};
O.on('tlDone',id=>{const m=/^(nik|snd|spell)-\d$/.exec(id);if(m)T.record(MAIN[m[1]],TL(id).s|0);});

/* ===================== 4. NIKUD LADDER ===================== */
const RUNG=[{v:'a',n:'קָמָץ וּפַתָּח',say:'קָמָץ וּפַתָּח אוֹמְרִים: אַ',ex:'בָּ בַּ'},{v:'i',n:'חִירִיק',say:'חִירִיק אוֹמֵר: אִי',ex:'בִּי'},
 {v:'o',n:'חוֹלָם',say:'חוֹלָם אוֹמֵר: אוֹ',ex:'בּוֹ'},{v:'u',n:'שׁוּרוּק וְקֻבּוּץ',say:'שׁוּרוּק וְקֻבּוּץ אוֹמְרִים: אוּ',ex:'בּוּ בֻּ'},
 {v:'e',n:'צֵירֵי וְסֶגּוֹל',say:'צֵירֵי וְסֶגּוֹל אוֹמְרִים: אֶ',ex:'בֵּ בֶּ'},{v:'s',n:'שְׁוָא',say:'שְׁוָא: קוֹל קָצָר מְאוֹד, אוֹ שֶׁקֶט',ex:'בְּ'}];
const learnedAt=r=>VO.slice(0,r+1);
const poolAt=r=>WD.filter(w=>w.r<=r);
const focusAt=r=>WD.filter(w=>w.r===r);
/* a word chosen by the learning engine (LEARN.pickItem: wrong ones back on schedule, unseen first, no repeats) and marked seen; focus = the words of the newest rung, tried first 70% of the time */
function lword(bank,pool,focus){const LN=window.LEARN;if(LN&&LN.pickItem&&pool.length>1)try{const ask=a=>{const r=LN.pickItem(bank,a.map(x=>({k:x.w})));return r&&{w:a.find(x=>x.w===r.item.k),why:r.why};};
  let r=focus&&focus.length&&Math.random()<.7?ask(focus):null;if(!r||!r.w||r.why==='recycle')r=ask(pool);if(r&&r.w){LN.seen(bank,r.w.w,true,false);return r.w;}}catch(e){}
  return focus&&focus.length&&Math.random()<.7?pick(focus):pick(pool);}
/* question kinds: hs = hear a word, choose its first syllable · ss = see a syllable, choose the word · rw = hear a word, choose it */
function sylOpts(w,learned){const a=w.s1;const out=[{s:a.s,v:a.v,b:w.base}];
  const same=shuffle(learned.filter(v=>v!==a.v&&!clash(v,a.v))).map(v=>({s:mk(w.base,v),v,b:w.base}));
  const other=shuffle(BASES.filter(b=>!sameSound(b[0],w.f))).map(b=>({s:mk(b,a.v),v:a.v,b}));
  for(const c of [...same,...other]){if(out.length>=3)break;if(!out.some(o=>o.s===c.s))out.push(c);}
  return shuffle(out);}
function nikQ(r,i,n){const learned=learnedAt(r);const kind=i<n*.4?'hs':i<n*.75?'ss':'rw';
  const pool=poolAt(r).filter(w=>w.s1);const focus=focusAt(r).filter(w=>w.s1);
  const w=lword('gp-nik',pool,focus);
  if(kind==='hs'){const os=sylOpts(w,learned);return {pr:`<div class="gp-ear">👂</div><div class="qq">בְּאֵיזוֹ הֲבָרָה מַתְחִילָה הַמִּלָּה?</div>`,opts:os.map(o=>o.s),ans:os.findIndex(o=>o.s===w.s1.s),cls:'tx big2',
      play:()=>sayW(w),auto:1,playLbl:'שׁוּב',say:'באיזו הברה מתחילה המילה',explain:`<span class="bigw">${hi(w)}</span>`,key:'hs'+w.w,chk:{t:'syl',w:w.w}};}
  if(kind==='ss'){const same=pool.filter(x=>x!==w&&x.base===w.base&&x.s1.v!==w.s1.v&&!clash(x.s1.v,w.s1.v));
    const diff=pool.filter(x=>x!==w&&!sameSound(x.f,w.f));const ds=[];for(const x of [...shuffle(same),...shuffle(diff)]){if(ds.length>=2)break;if(!ds.includes(x)&&!ds.some(d=>d.w===x.w))ds.push(x);}
    const os=shuffle([w,...ds]);return {pr:`<div class="qq">אֵיזוֹ מִלָּה מַתְחִילָה כָּךְ?</div><div class="bigw gp-syl">${w.s1.s}</div>`,opts:os.map(x=>x.w),ans:os.indexOf(w),cls:'tx',
      reveal:()=>sayW(w),explain:`<span class="bigw">${hi(w)}</span>`,key:'ss'+w.s1.s,chk:{t:'start',syl:w.s1.s,w:w.w}};}
  const like=pool.filter(x=>x!==w&&(x.f===w.f||x.plain.length===w.plain.length));const ds=shuffle(like.length>=2?like:pool.filter(x=>x!==w)).slice(0,2);
  const os=shuffle([w,...ds]);return {pr:`<div class="gp-ear">👂</div><div class="qq">אֵיזוֹ מִלָּה שָׁמַעְתָּ?</div>`,opts:os.map(x=>x.w),ans:os.indexOf(w),cls:'tx',
    play:()=>sayW(w),auto:1,playLbl:'שׁוּב',say:'איזו מילה שמעת',explain:`${pic(w)}<span class="bigw">${w.w}</span>`,key:'rw'+w.w,chk:{t:'word',w:w.w}};}
function nikRound(r,back){const n=8;T.quiz({id:'nik-'+(r+1),title:RUNG[r].n,bg:'city',back,n,gen:i=>nikQ(r,i,n),doneTitle:'עָלִיתָ בַּסֻּלָּם!'});}
function nikIntro(r,back){O.setScreen('sTal','city',back);T.hudT('סֻלַּם הַנִּקּוּד');const R=RUNG[r];const s=$('#sTal');s.innerHTML='';
  const ex=shuffle(focusAt(r).filter(w=>w.s1)).slice(0,3);O.sayNow=R.n+'. כמו במילים: '+ex.map(w=>plainHe(w.w)).join(', ');
  const card=h('div','prq tqc gp-intro',`<div class="gp-new">חָדָשׁ!</div><div class="gp-sign">${R.ex}</div><div class="qq">${R.say}</div>`);
  const row=h('div','gp-exs');ex.forEach(w=>{const e=h('span','gp-ex',`${pic(w)}<span>${hi(w)}</span>`);e.onclick=()=>sayW(w);row.appendChild(e);});card.appendChild(row);s.appendChild(card);
  const br=h('div','btnrow');const go=h('button','bigbtn',ICON.play+'<span>הַמְשֵׁךְ</span>');go.onclick=()=>nikRound(r,back);br.appendChild(go);s.appendChild(br);
  setTimeout(()=>{if(card.isConnected)O.say(R.n+'. '+'כְּמוֹ בַּמִּלִּים: '+ex.map(w=>w.w).join(', '));},D(400));}
function nikMenu(back){const me=()=>nikMenu(back);O.setScreen('sTal','city',back);T.hudT('סֻלַּם הַנִּקּוּד');const s=$('#sTal');s.innerHTML='';
  const cur=level('nik',RUNG.length)-1,R=RUNG[cur],st=TL('nik-'+(cur+1)).s|0;O.sayNow=plainHe(R.n);
  const card=h('div','prq tqc gp-intro gp-cur',`<div class="gp-sign">${R.ex}</div><div class="qq">${R.n}</div><div class="gp-st">${[0,1,2].map(k=>k<st?SPR.star:SPR.starOff).join('')}</div>`);s.appendChild(card);
  const br=h('div','btnrow');const p=h('button','bigbtn',ICON.play+'<span>הַמְשֵׁךְ</span>');p.onclick=()=>(TL('nik-'+(cur+1)).n|0)?nikRound(cur,me):nikIntro(cur,me);br.appendChild(p);s.appendChild(br);}

/* ===================== 5. WHAT SOUND STARTS THE WORD (audio only) ===================== */
const LETTERS='בגדזחטיכלמנסעפצקרשת'.split('');
function sndQ(L){const pool=WD.filter(w=>w.s1&&(L<3||w.s1.v!=='s'));const w=lword('gp-snd',pool);
  if(L<3){const k=L===1?3:4;const ds=[];for(const c of shuffle(LETTERS)){if(ds.length>=k-1)break;if(!sameSound(c,w.f)&&!ds.some(d=>sameSound(d,c)))ds.push(c);}
    const os=shuffle([w.f,...ds]);return {pr:`<div class="gp-ear">👂</div><div class="qq">בְּאֵיזוֹ אוֹת מַתְחִילָה הַמִּלָּה שֶׁשָּׁמַעְתָּ?</div>`,opts:os,ans:os.indexOf(w.f),cls:'tx big2'+(os.length===4?' gp4':''),
      play:()=>sayW(w),auto:1,playLbl:'שׁוּב',say:'באיזו אות מתחילה המילה ששמעת',explain:`${pic(w)}<span class="bigw">${hi(w)}</span>`,key:w.w,chk:{t:'letter',w:w.w}};}
  const os=sylOpts(w,['a','i','o','u','e']);return {pr:`<div class="gp-ear">👂</div><div class="qq">בְּאֵיזוֹ הֲבָרָה מַתְחִילָה הַמִּלָּה שֶׁשָּׁמַעְתָּ?</div>`,opts:os.map(o=>o.s),ans:os.findIndex(o=>o.s===w.s1.s),cls:'tx big2',
    play:()=>sayW(w),auto:1,playLbl:'שׁוּב',say:'באיזו הברה מתחילה המילה ששמעת',explain:`${pic(w)}<span class="bigw">${hi(w)}</span>`,key:w.w,chk:{t:'syl',w:w.w}};}
function sndRound(back,L0){const L=L0||level('snd',3);T.quiz({id:'snd-'+L,title:'מָה שׁוֹמְעִים בַּהַתְחָלָה?',bg:'city',back,n:8,gen:()=>sndQ(L)});}

/* ===================== 7. SPELLING: hear a word, build it from letters ===================== */
const FINAL={'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'};
const spLen=(w,L)=>{const n=w.plain.length;return L===1?n<=3:L===2?n===4:n>=5;};
function spell(back,L0){const L=L0||level('spell',3);const pool=shuffle(WD.filter(w=>spLen(w,L))).slice(0,6);let i=0,err=0,gems=0,lets=0;
  O.setScreen('sTal','meadow',back);const s=$('#sTal');
  const run=()=>{const w=pool[i];const need=[...w.plain];let k=0,miss=0;T.hudT('כּוֹתְבִים מִלִּים',T.progressBar(i,pool.length));O.sayNow=T.spk(w.w);s.innerHTML='';lets+=need.length;
    const card=h('div','prq tqc gp-sp',`<div class="qq">שׁוֹמְעִים וְכוֹתְבִים</div>${pic(w)}<div class="slots">${need.map(()=>'<span class="slot2"></span>').join('')}</div>`);
    const pb=h('button','hintbtn',ICON.say+'<span>הַשְׁמַע</span>');pb.onclick=()=>sayW(w);card.appendChild(pb);s.appendChild(card);
    const extra=[];const last=need[need.length-1];if(L>1&&FINAL[last]&&!need.includes(FINAL[last]))extra.push(FINAL[last]);
    for(const c of shuffle(LETTERS)){if(extra.length>=L)break;if(!need.some(x=>sameSound(x,c))&&!extra.some(x=>sameSound(x,c)))extra.push(c);}
    const row=h('div','chs gp-tiles');const fb=h('div','lcap','');
    const all=shuffle([...need,...extra]);const rows=all.length<=4?1:all.length<=10?2:3;row.style.gridTemplateColumns=`repeat(${Math.ceil(all.length/rows)},auto)`;all.forEach(c=>{const b=h('button','chb tx big2',c);b.dataset.c=c;b.onclick=()=>tap(b);row.appendChild(b);});
    s.appendChild(row);s.appendChild(fb);
    function tap(b){if(b.disabled||k>=need.length)return;const c=b.dataset.c;
      if(c===need[k]){const sl=card.querySelectorAll('.slot2')[k];sl.textContent=c;sl.classList.add('on');b.disabled=true;b.classList.add('ok');k++;miss=0;sfx.pop(k);fb.textContent='';row.querySelectorAll('.show').forEach(x=>x.classList.remove('show'));
        if(k===need.length){const g=2;gems+=g;O.addGems(g,card);sfx.ok(i);O.floatText(card,'+2');card.querySelector('.slots').outerHTML=`<div class="bigw gp-done">${w.w}</div>`;sayW(w);
          setTimeout(()=>{if(!card.isConnected)return;i++;if(i<pool.length)run();else{T.setKey(null);T.finishAct('spell-'+L,err,lets,gems,back,()=>spell(back,L));}},D(1500));}}
      else{err++;miss++;sfx.no();b.classList.remove('shake');void b.offsetWidth;b.classList.add('shake');
        if(k===need.length-1&&FINAL[need[k]]===c)fb.innerHTML=`בְּסוֹף מִלָּה כּוֹתְבִים <b>${need[k]}</b> (אוֹת סוֹפִית)`;
        if(miss>=2){const t=[...row.children].find(x=>!x.disabled&&x.dataset.c===need[k]);if(t)t.classList.add('show');}}}
    T.setKey(e=>{const c=T.TYPE&&T.TYPE.keyOf(e);if(!c||c===' ')return;const b=[...row.children].find(x=>!x.disabled&&x.dataset.c===c)||[...row.children].find(x=>!x.disabled);if(b&&b.dataset.c===c)b.click();else if(b){err++;miss++;sfx.no();}});
    window.__spell={get need(){return need;},get k(){return k;},row};
    setTimeout(()=>{if(card.isConnected)sayW(w);},D(350));};
  run();}

/* ===================== 8b. WORD RACE: how many words in 45 seconds ===================== */
let dict=null,dictTried=false;
async function getDict(){if(dictTried)return dict;dictTried=true;try{for(let i=0;i<20&&!(window.claude&&window.claude.use);i++)await new Promise(r=>setTimeout(r,100));
  if(window.claude&&window.claude.use)dict=await window.claude.use('dictation');}catch(e){dict=null;}return dict;}
const SECS=45;
function race(back){O.setScreen('sTal','city',back);T.hudT('מֵרוֹץ מִלִּים');O.sayNow='כמה מילים תקרא בארבעים וחמש שניות?';const s=$('#sTal');s.innerHTML='';const best=TL('read-flu').b|0;
  s.appendChild(h('div','whead',`<span class="gd gp-gd">⏱️</span><h1>כַּמָּה מִלִּים בְּ-45 שְׁנִיּוֹת?</h1>`));
  const tip=h('div','lsent','קוֹרְאִים בְּקוֹל כָּל מִלָּה, וְלוֹחֲצִים "קָרָאתִי".');s.appendChild(tip);
  if(best)s.appendChild(h('div','gp-best',`הַשִּׂיא שֶׁלְּךָ: <b>${best}</b> מִלִּים`));
  const br=h('div','btnrow');const go=h('button','bigbtn',ICON.play+'<span>הַמְשֵׁךְ</span>');br.appendChild(go);s.appendChild(br);
  let mic=false;getDict().then(d=>{if(d&&tip.isConnected){mic=true;tip.textContent='קוֹרְאִים בְּקוֹל כָּל מִלָּה. הַמִּיקְרוֹפוֹן מַקְשִׁיב.';}});
  go.onclick=()=>{if(mic&&T.needPerm)T.needPerm('dictation','כְּדֵי לִקְרֹא בְּקוֹל צָרִיךְ אִשּׁוּר שֶׁל הוֹרֶה לַמִּיקְרוֹפוֹן.');raceRun(back,mic?dict:null,best);};}
function raceRun(back,d,best){O.setScreen('sTal','city',back);const s=$('#sTal');s.innerHTML='';O.hush();
  const R=Math.max(1,level('nik',RUNG.length)-1);let pool=[];const nextW=()=>{if(!pool.length)pool=shuffle(WD.filter(w=>w.r<=R));return pool.pop();};
  let w=nextW(),count=0,shown=Date.now(),live=true;const t0=Date.now();
  const bar=h('div','gp-time','<i></i>');const card=h('div','prq tqc gp-race',`<div class="bigw" id="gpW">${w.w}</div><div class="gp-cnt">✓ <b id="gpN">0</b></div>${d?'<div class="heard" id="gpH">מַקְשִׁיב...</div>':''}`);
  const row=h('div','btnrow');const ok=h('button','bigbtn','✓ <span>קָרָאתִי</span>');const skip=h('button','bigbtn plain sm',ICON.skip+'<span>דַּלֵּג</span>');
  if(!d)row.appendChild(ok);row.appendChild(skip);s.append(bar,card,row);
  const hud=()=>T.hudT('מֵרוֹץ מִלִּים',`<div class="chip">${Math.max(0,Math.ceil(SECS-(Date.now()-t0)/1000))}</div>`);hud();
  const show=()=>{$('#gpW').textContent=w.w;shown=Date.now();const e=$('#gpW');e.classList.remove('flashin');void e.offsetWidth;e.classList.add('flashin');};
  const advance=good=>{if(!live)return;if(good){count++;$('#gpN').textContent=count;sfx.pop(count%8+1);}w=nextW();show();};
  ok.onclick=()=>{if(Date.now()-shown<500)return;advance(true);};skip.onclick=()=>advance(false);
  T.setKey(e=>{if(!d&&(e.key===' '||e.key==='Enter')){e.preventDefault&&e.preventDefault();ok.click();}});
  /* the voice text of one breath grows ("חתול כלב ..."): look for the shown word only after what was already matched */
  const want=x=>plainHe(x).replace(/[^א-ת]/g,'');let used=0;
  const hear=(text,fin)=>{if(!live)return;const t=want(text||'');if($('#gpH'))$('#gpH').textContent=plainHe(text||'');const k=want(w.w);const j=t.indexOf(k,used);if(j>=0){used=j+k.length;advance(true);}if(fin)used=0;};
  if(d){try{d.onPartial(({text})=>hear(text,false));d.onFinal(({text})=>hear(text,true));
      d.onState(({state})=>{if(live&&state==='idle')setTimeout(()=>{if(live)d.start().catch(()=>{});},150);});
      d.start().catch(()=>{});}catch(e){}}
  const tick=setInterval(()=>{if(!card.isConnected){stop();return;}const left=SECS-(Date.now()-t0)/1000;bar.firstChild.style.width=Math.max(0,left/SECS*100)+'%';hud();if(left<=0)end();},200);
  function stop(){if(!live)return;live=false;clearInterval(tick);T.setKey(null);if(d)try{d.stop();}catch(e){}}
  function end(){stop();const st=count>=18?3:count>=10?2:1;const g=3+st*2;O.addGems(g);T.record('read-flu',st,{b:count});
    T.result({title:count>best?'שִׂיא חָדָשׁ!':'כָּל הַכָּבוֹד!',sub:`קָרָאתָ ${count} מִלִּים בְּ-45 שְׁנִיּוֹת`+(best&&count<=best?` · הַשִּׂיא: ${best}`:''),stars:st,gems:g,back,again:()=>raceRun(back,d,Math.max(best,count))});}
  window.__race={get w(){return w;},get count(){return count;},end,ok};}

/* ===================== 1. FINAL LETTERS (for the writing house) ===================== */
const FINALS=[['ך','כַּף סוֹפִית','כ','מֶלֶךְ'],['ם','מֵם סוֹפִית','מ','יָם'],['ן','נוּן סוֹפִית','נ','עָנָן'],['ף','פֵּא סוֹפִית','פ','קוֹף'],['ץ','צָדִי סוֹפִית','צ','עֵץ']];
const finNote=l=>{const f=FINALS.find(x=>x[0]===l);return f?`<div class="gp-fin">אוֹת סוֹפִית בָּאָה רַק בְּסוֹף מִלָּה: <b>${f[2]}</b> ← <b>${f[0]}</b> · <b>${f[3]}</b></div>`:'';};

/* ===================== 8. MORE BEDTIME STORIES (why? / what happened first?) ===================== */
const STORIES=[
 {t:'הַגֶּשֶׁם הָרִאשׁוֹן',spr:['cloud','flower'],s:['בַּבֹּקֶר הַשָּׁמַיִם הָיוּ אֲפֹרִים.','מָיָה רָאֲתָה עָנָן גָּדוֹל וְשָׁחֹר.','הִיא לָקְחָה מִטְרִיָּה וְיָצְאָה לַגַּן.','פִּתְאוֹם יָרַד גֶּשֶׁם רִאשׁוֹן.','הַפְּרָחִים בַּגַּן שָׂמְחוּ וְשָׁתוּ מַיִם.','מָיָה קָפְצָה בַּשְּׁלוּלִיּוֹת וְצָחֲקָה.'],
  q:[['מָה לָקְחָה מָיָה כְּשֶׁיָּצְאָה?','מִטְרִיָּה',['כּוֹבַע','כַּדּוּר']],['לָמָּה הַפְּרָחִים שָׂמְחוּ?','כִּי הֵם קִבְּלוּ מַיִם',['כִּי הָיְתָה שֶׁמֶשׁ','כִּי מָיָה שָׁרָה לָהֶם']],['מָה קָרָה רִאשׁוֹן?','מָיָה רָאֲתָה עָנָן',['מָיָה קָפְצָה בַּשְּׁלוּלִיּוֹת','הַפְּרָחִים שָׁתוּ מַיִם']]]},
 {t:'הַגּוּר שֶׁל גִּיל',spr:['dog','heart'],s:['לְגִיל יֵשׁ גּוּר קָטָן בְּשֵׁם בּוּבִּי.','יוֹם אֶחָד בּוּבִּי בָּרַח מֵהֶחָצֵר.','גִּיל חִפֵּשׂ אוֹתוֹ בְּכָל הָרְחוֹב.','הוּא שָׁמַע נְבִיחָה קְטַנָּה מֵאֲחוֹרֵי הַשִּׂיחַ.','בּוּבִּי יָשַׁב שָׁם, כִּי הוּא פָּחַד מֵרַעַשׁ שֶׁל מְכוֹנִית.','גִּיל חִבֵּק אוֹתוֹ וְהֵבִיא אוֹתוֹ הַבַּיְתָה.'],
  q:[['אֵיךְ קוֹרְאִים לַגּוּר?','בּוּבִּי',['שׁוֹקוֹ','רֶקְס']],['לָמָּה בּוּבִּי הִתְחַבֵּא מֵאֲחוֹרֵי הַשִּׂיחַ?','כִּי הוּא פָּחַד מֵרַעַשׁ',['כִּי הוּא רָצָה לִישֹׁן','כִּי הוּא חִפֵּשׂ עֶצֶם']],['מָה קָרָה רִאשׁוֹן?','בּוּבִּי בָּרַח',['גִּיל שָׁמַע נְבִיחָה','גִּיל חִבֵּק אֶת בּוּבִּי']]]},
 {t:'הַמִּגְדָּל שֶׁל יוֹנִי',spr:['tower','puzzle'],s:['יוֹנִי בָּנָה מִגְדָּל גָּבוֹהַּ מִקֻּבִּיּוֹת.','הוּא שָׂם קֻבִּיָּה עַל קֻבִּיָּה, לְאַט לְאַט.','אָחִיו הַקָּטָן רָץ וְנָגַע בַּמִּגְדָּל.','הַמִּגְדָּל נָפַל, וְכָל הַקֻּבִּיּוֹת הִתְפַּזְּרוּ.','יוֹנִי כָּעַס, אֲבָל אַחַר כָּךְ הוּא חִיֵּךְ.','"בּוֹא נִבְנֶה מִגְדָּל חָדָשׁ בְּיַחַד!" הוּא אָמַר.'],
  q:[['מִמָּה בָּנָה יוֹנִי אֶת הַמִּגְדָּל?','מִקֻּבִּיּוֹת',['מֵחוֹל','מִנְּיָר']],['לָמָּה הַמִּגְדָּל נָפַל?','כִּי הָאָח הַקָּטָן נָגַע בּוֹ',['כִּי הָיְתָה רוּחַ','כִּי יוֹנִי קָפַץ']],['מָה קָרָה רִאשׁוֹן?','יוֹנִי בָּנָה מִגְדָּל',['הַמִּגְדָּל נָפַל','יוֹנִי חִיֵּךְ']]]},
 {t:'הַצִּפּוֹר הַקְּטַנָּה',spr:['bird','tree'],s:['בְּקֵן עַל הָעֵץ גָּרָה צִפּוֹר קְטַנָּה.','כָּל הַצִּפֳּרִים עָפוּ, אֲבָל הִיא פָּחֲדָה.','אִמָּא שֶׁלָּהּ אָמְרָה: "תְּנַסִּי, אֲנִי כָּאן."','הַצִּפּוֹר פָּתְחָה כְּנָפַיִם וְקָפְצָה.','הִיא עָפָה עַד הָעֵץ הַשֵּׁנִי!','מֵאָז הִיא עָפָה כָּל יוֹם.'],
  q:[['אֵיפֹה גָּרָה הַצִּפּוֹר?','בְּקֵן עַל הָעֵץ',['בַּבַּיִת','בַּיָּם']],['לָמָּה הַצִּפּוֹר לֹא עָפָה בַּהַתְחָלָה?','כִּי הִיא פָּחֲדָה',['כִּי הִיא הָיְתָה רְעֵבָה','כִּי יָרַד גֶּשֶׁם']],['מָה קָרָה רִאשׁוֹן?','אִמָּא אָמְרָה לָהּ לְנַסּוֹת',['הַצִּפּוֹר עָפָה עַד הָעֵץ הַשֵּׁנִי','הַצִּפּוֹר עָפָה כָּל יוֹם']]]},
 {t:'הַפָּנָס שֶׁל סַבָּא',spr:['lantern','moon'],s:['בַּלַּיְלָה הַחַשְׁמַל בַּבַּיִת כָּבָה.','הָיָה חֹשֶׁךְ גָּמוּר, וְתָמָר לֹא רָאֲתָה כְּלוּם.','סַבָּא הוֹצִיא פָּנָס יָשָׁן מֵהָאָרוֹן.','הוּא הִדְלִיק אוֹתוֹ, וְהַחֶדֶר הִתְמַלֵּא בְּאוֹר.','תָּמָר וְסַבָּא שִׂחֲקוּ בִּצְלָלִים עַל הַקִּיר.','כְּשֶׁהַחַשְׁמַל חָזַר, תָּמָר אָמְרָה: "חֲבָל!"'],
  q:[['מָה סַבָּא הוֹצִיא מֵהָאָרוֹן?','פָּנָס',['סֵפֶר','שְׂמִיכָה']],['לָמָּה הָיָה חֹשֶׁךְ בַּבַּיִת?','כִּי הַחַשְׁמַל כָּבָה',['כִּי הָיָה עָנָן','כִּי תָּמָר יָשְׁנָה']],['מָה קָרָה רִאשׁוֹן?','הַחַשְׁמַל כָּבָה',['סַבָּא הִדְלִיק פָּנָס','הַחַשְׁמַל חָזַר']]]},
 {t:'הַדָּג הַזָּהֹב',spr:['fish','wave'],s:['בַּיָּם הַכָּחֹל שָׂחָה דָּג קָטָן וְזָהֹב.','הוּא רָצָה לִרְאוֹת מָה יֵשׁ מֵעַל הַמַּיִם.','הוּא קָפַץ גָּבוֹהַּ וְרָאָה סִירָה לְבָנָה.','עַל הַסִּירָה יָשַׁב יֶלֶד וְנוֹפֵף לוֹ.','הַדָּג חָזַר לַמַּיִם וְסִפֵּר לַחֲבֵרִים שֶׁלּוֹ.'],
  q:[['אֵיזֶה צֶבַע הָיָה הַדָּג?','זָהֹב',['אָדֹם','יָרֹק']],['לָמָּה הַדָּג קָפַץ?','כִּי הוּא רָצָה לִרְאוֹת מָה יֵשׁ מֵעַל הַמַּיִם',['כִּי הוּא פָּחַד','כִּי הוּא הָיָה עָיֵף']],['מָה קָרָה רִאשׁוֹן?','הַדָּג קָפַץ',['הַדָּג חָזַר לַמַּיִם','הַדָּג סִפֵּר לַחֲבֵרִים']]]},
 {t:'הָעוּגָה שֶׁנִּשְׂרְפָה',spr:['cake','flame'],s:['אַבָּא וְשִׁירָה אָפוּ עוּגָה לְשַׁבָּת.','הֵם שָׂמוּ אוֹתָהּ בַּתַּנּוּר וְהָלְכוּ לְשַׂחֵק.','אַחֲרֵי זְמַן מָה, שִׁירָה הֵרִיחָה רֵיחַ שֶׁל שְׂרֵפָה.','הֵם רָצוּ לַמִּטְבָּח, אֲבָל הָעוּגָה כְּבָר הָיְתָה שְׁחֹרָה.','"בַּפַּעַם הַבָּאָה נָשִׂים שָׁעוֹן," אָמַר אַבָּא.','הֵם אָפוּ עוּגָה חֲדָשָׁה, וְהַפַּעַם הִיא יָצְאָה טְעִימָה.'],
  q:[['אֵיפֹה שָׂמוּ אֶת הָעוּגָה?','בַּתַּנּוּר',['בַּמְּקָרֵר','בָּאָרוֹן']],['לָמָּה הָעוּגָה נִשְׂרְפָה?','כִּי הֵם שָׁכְחוּ אוֹתָהּ בַּתַּנּוּר',['כִּי הִיא נָפְלָה','כִּי שָׂמוּ בָּהּ מֶלַח']],['מָה קָרָה רִאשׁוֹן?','שִׁירָה הֵרִיחָה שְׂרֵפָה',['הֵם אָפוּ עוּגָה חֲדָשָׁה','אַבָּא אָמַר שֶׁיָּשִׂימוּ שָׁעוֹן']]]},
 {t:'הַכִּבְשָׂה שֶׁהָלְכָה לְאִבּוּד',spr:['sheep','mount'],s:['בַּשָּׂדֶה הָיוּ עֶשֶׂר כְּבָשִׂים לְבָנוֹת.','בָּעֶרֶב הָרוֹעֶה סָפַר אוֹתָן, וְהָיוּ רַק תֵּשַׁע.','כִּבְשָׂה אַחַת טִפְּסָה עַל הָהָר וְלֹא יָדְעָה אֵיךְ לָרֶדֶת.','הַכֶּלֶב שֶׁל הָרוֹעֶה רָץ וּמָצָא אוֹתָהּ.','הוּא הוֹבִיל אוֹתָהּ בַּשְּׁבִיל בַּחֲזָרָה לָעֵדֶר.'],
  q:[['כַּמָּה כְּבָשִׂים סָפַר הָרוֹעֶה בָּעֶרֶב?','9',['10','8']],['לָמָּה הַכִּבְשָׂה לֹא חָזְרָה?','כִּי הִיא לֹא יָדְעָה אֵיךְ לָרֶדֶת מֵהָהָר',['כִּי הִיא יָשְׁנָה','כִּי הִיא כָּעֲסָה']],['מָה קָרָה רִאשׁוֹן?','הָרוֹעֶה סָפַר אֶת הַכְּבָשִׂים',['הַכֶּלֶב מָצָא אֶת הַכִּבְשָׂה','הַכִּבְשָׂה חָזְרָה לָעֵדֶר']]]},
 {t:'הַמְּכוֹנִית הָאֲדֻמָּה',spr:['car','star'],s:['לְאָדָם יֵשׁ מְכוֹנִית צַעֲצוּעַ אֲדֻמָּה.','הוּא לָקַח אוֹתָהּ לַגַּן כְּדֵי לְשַׂחֵק עִם חֲבֵרִים.','רוֹנִי רָצָה לְשַׂחֵק בָּהּ גַּם.','בַּהַתְחָלָה אָדָם לֹא רָצָה לְהַשְׁאִיל.','אַחַר כָּךְ הֵם בָּנוּ כְּבִישׁ מֵחוֹל, וְשִׂחֲקוּ בְּתוֹרוֹת.','"כָּכָה הַרְבֵּה יוֹתֵר כֵּיף!" אָמַר אָדָם.'],
  q:[['אֵיזֶה צֶבַע הַמְּכוֹנִית?','אֲדֻמָּה',['כְּחֻלָּה','צְהֻבָּה']],['לָמָּה בַּסּוֹף הָיָה יוֹתֵר כֵּיף?','כִּי הֵם שִׂחֲקוּ יַחַד בְּתוֹרוֹת',['כִּי אָדָם שִׂחֵק לְבַד','כִּי הַמְּכוֹנִית נִשְׁבְּרָה']],['מָה קָרָה רִאשׁוֹן?','אָדָם לֹא רָצָה לְהַשְׁאִיל',['הֵם בָּנוּ כְּבִישׁ מֵחוֹל','הֵם שִׂחֲקוּ בְּתוֹרוֹת']]]},
 {t:'שֶׁלֶג בַּחֶרְמוֹן',spr:['mount','cloud'],s:['בַּחֹרֶף נָסְעָה הַמִּשְׁפָּחָה לַחֶרְמוֹן.','עַל הָהָר הָיָה שֶׁלֶג לָבָן וְקַר.','נוֹגָה לָבְשָׁה מְעִיל, כְּפָפוֹת וְכוֹבַע.','הִיא בָּנְתָה אִישׁ שֶׁלֶג עִם אַף מִגֶּזֶר.','בַּסּוֹף כֻּלָּם שָׁתוּ שׁוֹקוֹ חַם.'],
  q:[['מִמָּה הָיָה הָאַף שֶׁל אִישׁ הַשֶּׁלֶג?','מִגֶּזֶר',['מֵאֶבֶן','מִתַּפּוּחַ']],['לָמָּה נוֹגָה לָבְשָׁה מְעִיל וּכְפָפוֹת?','כִּי בַּחוּץ הָיָה קַר',['כִּי הָיָה חַם','כִּי הִיא הָלְכָה לַיָּם']],['מָה קָרָה רִאשׁוֹן?','הַמִּשְׁפָּחָה נָסְעָה לַחֶרְמוֹן',['נוֹגָה בָּנְתָה אִישׁ שֶׁלֶג','כֻּלָּם שָׁתוּ שׁוֹקוֹ']]]},
 {t:'הַקֶּשֶׁת בַּשָּׁמַיִם',spr:['rainbow','sun'],s:['אַחֲרֵי הַגֶּשֶׁם יָצְאָה הַשֶּׁמֶשׁ.','אִיתַי הִסְתַּכֵּל מֵהַחַלּוֹן וְרָאָה קֶשֶׁת.','הוּא סָפַר אֶת הַצְּבָעִים: אָדֹם, כָּתֹם, צָהֹב, יָרֹק, כָּחֹל וְסָגֹל.','אַבָּא הִסְבִּיר: "קֶשֶׁת יֵשׁ כְּשֶׁיֵּשׁ גַּם שֶׁמֶשׁ וְגַם טִפּוֹת מַיִם."','אִיתַי צִיֵּר אֶת הַקֶּשֶׁת בַּמַּחְבֶּרֶת.'],
  q:[['כַּמָּה צְבָעִים סָפַר אִיתַי?','6',['3','10']],['לָמָּה הוֹפִיעָה קֶשֶׁת?','כִּי הָיוּ גַּם שֶׁמֶשׁ וְגַם טִפּוֹת מַיִם',['כִּי הָיָה לַיְלָה','כִּי אִיתַי צִיֵּר אוֹתָהּ']],['מָה קָרָה רִאשׁוֹן?','יָרַד גֶּשֶׁם',['אִיתַי רָאָה קֶשֶׁת','אִיתַי צִיֵּר בַּמַּחְבֶּרֶת']]]},
 {t:'הָאֶבֶן הַנּוֹצֶצֶת',spr:['crystal','lantern'],s:['לִיאוֹר וְאַבָּא טִיְּלוּ לְיַד מְעָרָה.','בִּפְנִים הָיָה חָשׁוּךְ, אָז הֵם הִדְלִיקוּ פָּנָס.','עַל הַקִּיר נָצְצָה אֶבֶן כְּחֻלָּה.','"זֶה יַהֲלוֹם?" שָׁאַל לִיאוֹר.','אַבָּא צָחַק: "זֶה גָּבִישׁ. בַּטֶּבַע יֵשׁ הַרְבֵּה אֲבָנִים יָפוֹת."','הֵם צִלְּמוּ אֶת הָאֶבֶן, וְהִשְׁאִירוּ אוֹתָהּ בַּמָּקוֹם.'],
  q:[['אֵיזֶה צֶבַע הָיְתָה הָאֶבֶן?','כְּחֻלָּה',['אֲדֻמָּה','לְבָנָה']],['לָמָּה הֵם הִדְלִיקוּ פָּנָס?','כִּי בַּמְּעָרָה הָיָה חָשׁוּךְ',['כִּי הָיָה קַר','כִּי הֵם חִפְּשׂוּ אֶת אַבָּא']],['מָה קָרָה רִאשׁוֹן?','הֵם הִדְלִיקוּ פָּנָס',['הֵם רָאוּ אֶבֶן כְּחֻלָּה','הֵם צִלְּמוּ אֶת הָאֶבֶן']]]},
 {t:'הַמַּגְלֵשָׁה בַּגַּן',spr:['star','heart'],s:['בַּגַּן הָיְתָה מַגְלֵשָׁה גְּבוֹהָה.','הַרְבֵּה יְלָדִים עָמְדוּ בַּתּוֹר.','יַלְדָּה קְטַנָּה בָּכְתָה, כִּי הִיא לֹא הִגִּיעָה לַמַּדְרֵגָה.','עִידוֹ עָזַר לָהּ לְטַפֵּס, וְהִיא גָּלְשָׁה וְצָחֲקָה.','הַגַּנֶּנֶת אָמְרָה: "עִידוֹ, אַתָּה חָבֵר טוֹב!"'],
  q:[['מִי עָזַר לַיַּלְדָּה?','עִידוֹ',['הַגַּנֶּנֶת','אַבָּא']],['לָמָּה הַיַּלְדָּה בָּכְתָה?','כִּי הִיא לֹא הִגִּיעָה לַמַּדְרֵגָה',['כִּי הִיא נָפְלָה','כִּי הִיא רָצְתָה הַבַּיְתָה']],['מָה קָרָה רִאשׁוֹן?','הַיַּלְדָּה בָּכְתָה',['הַיַּלְדָּה גָּלְשָׁה','הַגַּנֶּנֶת דִּבְּרָה עִם עִידוֹ']]]},
 {t:'צְבִיקָה הַצָּב לֹא מְוַתֵּר',spr:['turtle','flower'],s:['צְבִיקָה הַצָּב הָלַךְ לְאַט לְאַט אֶל הַבְּרֵכָה.','הָאַרְנָב רָץ מַהֵר וְצָחַק עָלָיו.','בַּדֶּרֶךְ הָאַרְנָב עָצַר לֶאֱכֹל, וְנִרְדַּם מִתַּחַת לָעֵץ.','צְבִיקָה הִמְשִׁיךְ לָלֶכֶת, צַעַד אַחֲרֵי צַעַד.','כְּשֶׁהָאַרְנָב הִתְעוֹרֵר, צְבִיקָה כְּבָר שָׂחָה בַּבְּרֵכָה.'],
  q:[['לְאָן הָלַךְ צְבִיקָה?','אֶל הַבְּרֵכָה',['אֶל הַיָּם','אֶל הָהָר']],['לָמָּה הָאַרְנָב לֹא הִגִּיעַ רִאשׁוֹן?','כִּי הוּא נִרְדַּם בַּדֶּרֶךְ',['כִּי הוּא הָלַךְ לְאַט','כִּי הוּא פָּחַד מִמַּיִם']],['מָה קָרָה רִאשׁוֹן?','הָאַרְנָב צָחַק עַל צְבִיקָה',['הָאַרְנָב נִרְדַּם','הָאַרְנָב הִתְעוֹרֵר']]]}];
/* a "why?" or "what happened first?" question for each of the 6 older stories (by index) */
const STORY_Q={
 0:[['לָמָּה מִיצִי לֹא מָצְאָה אֶת הַכַּדּוּר?','כִּי הוּא הָיָה מִתַּחַת לַמִּטָּה, בַּחֹשֶׁךְ',['כִּי הַכַּדּוּר הָיָה בַּגַּן','כִּי מִיצִי יָשְׁנָה']],['מָה קָרָה רִאשׁוֹן?','הַכַּדּוּר הִתְגַּלְגֵּל מִתַּחַת לַמִּטָּה',['נוֹעָה הֵבִיאָה פָּנָס','מִיצִי קָפְצָה מִשִּׂמְחָה']]],
 1:[['לָמָּה אוֹרֶן הָיָה גֵּאֶה?','כִּי הַפֶּרַח שֶׁלּוֹ גָּדַל',['כִּי הוּא קִבֵּל מַתָּנָה','כִּי הוּא נִצַּח בְּמִשְׂחָק']],['מָה קָרָה רִאשׁוֹן?','אוֹרֶן שָׁתַל זֶרַע',['יָצָא נֶבֶט יָרֹק','פָּרַח פֶּרַח צָהֹב']]],
 2:[['לָמָּה נִיצוֹץ לֹא הִצְלִיחַ לְהֵרָדֵם?','כִּי הוּא פָּחַד מֵהַחֹשֶׁךְ',['כִּי הוּא הָיָה רָעֵב','כִּי הָיָה רַעַשׁ']]],
 3:[['לָמָּה סַבְתָּא חִיְּכָה?','כִּי הִיא שָׂמְחָה מֵהַמַּתָּנוֹת',['כִּי הָעוּגָה נָפְלָה','כִּי הָיָה גֶּשֶׁם']]],
 4:[['לָמָּה דָּנִי רוֹצֶה לִבְנוֹת סִירָה מֵעֵץ?','כִּי נְיָר נִרְטָב בַּגֶּשֶׁם',['כִּי עֵץ יוֹתֵר יָפֶה','כִּי אֵין לוֹ נְיָר']]],
 5:[['מָה קָרָה רִאשׁוֹן?','חָכָם סָפַר עֲשָׂרָה כּוֹכָבִים',['חָכָם סָפַר עוֹד חֲמִשָּׁה','חָכָם חִיֵּךְ']]]};

/* ---------- names for the parents' skills view (no nikud) ---------- */
const SKILLS={'read-nik':'סולם הניקוד: הברות ומילים','nik-1':'ניקוד: קמץ ופתח (אַ)','nik-2':'ניקוד: חיריק (אִי)','nik-3':'ניקוד: חולם (אוֹ)','nik-4':'ניקוד: שורוק וקובוץ (אוּ)','nik-5':'ניקוד: צירי וסגול (אֶ)','nik-6':'ניקוד: שווא',
 'read-sound':'מודעות פונולוגית: הצליל הפותח (שמיעה בלבד)','snd-1':'צליל פותח: אות (3 אפשרויות)','snd-2':'צליל פותח: אות (4 אפשרויות)','snd-3':'צליל פותח: הברה',
 'write-spell':'כתיב: שומעים מילה וכותבים מאותיות','spell-1':'כתיב: מילים של 2-3 אותיות','spell-2':'כתיב: מילים של 4 אותיות','spell-3':'כתיב: מילים של 5+ אותיות',
 'read-flu':'שטף קריאה: מילים ב-45 שניות (שיא אישי)','write-trace':'כתיבת אותיות (כולל אותיות סופיות)',
 'pict-1':'גרף תמונות: כמה, הכי הרבה, הכי מעט','pict-2':'גרף תמונות: בכמה יותר, ביחד','shp-1':'צורות: זיהוי משולש, ריבוע, מלבן, עיגול','shp-2':'צורות: צלעות, קודקודים, מחומש ומשושה',
 'len-1':'מדידת אורך בסרגל (ס"מ)','len-2':'השוואה: ארוך-קצר, כבד-קל (מאזניים)'};

/* ---------- registration ---------- */
const ACTS={
 read:[{id:'read-nik',name:'סֻלַּם הַנִּקּוּד',icon:()=>'<span class="gp-ic">בָּ</span>',run:nikMenu},
  {id:'read-sound',name:'מָה שׁוֹמְעִים בַּהַתְחָלָה?',icon:()=>'<span style="font-size:34px">👂</span>',run:back=>sndRound(back)},
  {id:'read-flu',name:'מֵרוֹץ מִלִּים',icon:()=>'<span style="font-size:34px">⏱️</span>',run:race}],
 write:[{id:'write-spell',name:'כּוֹתְבִים מִלִּים',icon:()=>T.X.abc,run:back=>spell(back)}]};
function addAct(bid,a){const b=T.BUILD.find(x=>x.id===bid);if(!b||T.ACT[a.id])return;b.acts.push(a);T.ACT[a.id]=a;a.b=b;}
function register(){Object.entries(ACTS).forEach(([bid,as])=>as.forEach(a=>addAct(bid,a)));}
window.GAPS={register,ACTS,WD,parse,hi,level,nikMenu,nikRound,nikIntro,nikQ,RUNG,sndQ,sndRound,spell,race,raceRun,FINALS,finNote,STORIES,STORY_Q,SKILLS,sameSound,
  set dict(v){dict=v;dictTried=true;}};
})();
