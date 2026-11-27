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
/* a word chosen by the learning engine (LEARN.pickItem: wrong ones back on schedule, unseen first, no repeats); the question carries bank + bkey, the quiz records the answer (#360); focus = the words of the newest rung, tried first 70% of the time */
function lword(bank,pool,focus){const LN=window.LEARN;if(LN&&LN.pickItem&&pool.length>1)try{const ask=a=>{const r=LN.pickItem(bank,a.map(x=>({k:x.w})));return r&&{w:a.find(x=>x.w===r.item.k),why:r.why};};
  let r=focus&&focus.length&&Math.random()<.7?ask(focus):null;if(!r||!r.w||r.why==='recycle')r=ask(pool);if(r&&r.w)return r.w;}catch(e){}
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
      play:()=>sayW(w),auto:1,playLbl:'שׁוּב',say:'באיזו הברה מתחילה המילה',explain:`<span class="bigw">${hi(w)}</span>`,bank:'gp-nik',bkey:w.w,key:'hs'+w.w,chk:{t:'syl',w:w.w}};}
  if(kind==='ss'){const same=pool.filter(x=>x!==w&&x.base===w.base&&x.s1.v!==w.s1.v&&!clash(x.s1.v,w.s1.v));
    const diff=pool.filter(x=>x!==w&&!sameSound(x.f,w.f));const ds=[];for(const x of [...shuffle(same),...shuffle(diff)]){if(ds.length>=2)break;if(!ds.includes(x)&&!ds.some(d=>d.w===x.w))ds.push(x);}
    const os=shuffle([w,...ds]);return {pr:`<div class="qq">אֵיזוֹ מִלָּה מַתְחִילָה כָּךְ?</div><div class="bigw gp-syl">${w.s1.s}</div>`,opts:os.map(x=>x.w),ans:os.indexOf(w),cls:'tx',
      reveal:()=>sayW(w),explain:`<span class="bigw">${hi(w)}</span>`,bank:'gp-nik',bkey:w.w,key:'ss'+w.s1.s,chk:{t:'start',syl:w.s1.s,w:w.w}};}
  const like=pool.filter(x=>x!==w&&(x.f===w.f||x.plain.length===w.plain.length));const ds=shuffle(like.length>=2?like:pool.filter(x=>x!==w)).slice(0,2);
  const os=shuffle([w,...ds]);return {pr:`<div class="gp-ear">👂</div><div class="qq">אֵיזוֹ מִלָּה שָׁמַעְתָּ?</div>`,opts:os.map(x=>x.w),ans:os.indexOf(w),cls:'tx',
    play:()=>sayW(w),auto:1,playLbl:'שׁוּב',say:'איזו מילה שמעת',explain:`${pic(w)}<span class="bigw">${w.w}</span>`,bank:'gp-nik',bkey:w.w,key:'rw'+w.w,chk:{t:'word',w:w.w}};}
function nikRound(r,back){const n=5;T.quiz({id:'nik-'+(r+1),title:RUNG[r].n,bg:'city',back,n,gen:i=>nikQ(r,i,n),doneTitle:'עָלִיתָ בַּסֻּלָּם!'});}
function nikIntro(r,back){O.setScreen('sTal','city',back);T.hudT('סֻלַּם הַנִּקּוּד');const R=RUNG[r];const s=$('#sTal');s.innerHTML='';
  const ex=shuffle(focusAt(r).filter(w=>w.s1)).slice(0,3);O.sayNow=R.n+'. כמו במילים: '+ex.map(w=>plainHe(w.w)).join(', ');
  const card=h('div','prq tqc gp-intro',`<div class="gp-new">חָדָשׁ!</div><div class="gp-sign">${R.ex}</div><div class="qq">${R.say}</div>`);
  const row=h('div','gp-exs');ex.forEach(w=>row.appendChild(h('span','gp-ex',`${pic(w)}<span>${hi(w)}</span>`)));card.appendChild(row);s.appendChild(card);
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
      play:()=>sayW(w),auto:1,playLbl:'שׁוּב',say:'באיזו אות מתחילה המילה ששמעת',explain:`${pic(w)}<span class="bigw">${hi(w)}</span>`,bank:'gp-snd',bkey:w.w,key:w.w,chk:{t:'letter',w:w.w}};}
  const os=sylOpts(w,['a','i','o','u','e']);return {pr:`<div class="gp-ear">👂</div><div class="qq">בְּאֵיזוֹ הֲבָרָה מַתְחִילָה הַמִּלָּה שֶׁשָּׁמַעְתָּ?</div>`,opts:os.map(o=>o.s),ans:os.findIndex(o=>o.s===w.s1.s),cls:'tx big2',
    play:()=>sayW(w),auto:1,playLbl:'שׁוּב',say:'באיזו הברה מתחילה המילה ששמעת',explain:`${pic(w)}<span class="bigw">${hi(w)}</span>`,bank:'gp-snd',bkey:w.w,key:w.w,chk:{t:'syl',w:w.w}};}
function sndRound(back,L0){const L=L0||level('snd',3);T.quiz({id:'snd-'+L,title:'מָה שׁוֹמְעִים בַּהַתְחָלָה?',bg:'city',back,n:5,gen:()=>sndQ(L)});}

/* ===================== 7. SPELLING: hear a word, build it from letters ===================== */
const FINAL={'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'};
/* #54 the help button texts on the spelling screen */
const SPH={next:'הָאוֹת הַבָּאָה',by:'אוֹת אַחֲרֵי אוֹת, מִיָּמִין לִשְׂמֹאל:',fin:'בְּסוֹף מִלָּה כּוֹתְבִים אוֹת סוֹפִית'};
window.HELP_TEXTS=(window.HELP_TEXTS||[]).concat(Object.values(SPH));
const spLen=(w,L)=>{const n=w.plain.length;return L===1?n<=3:L===2?n===4:n>=5;};
function spell(back,L0){const L=L0||level('spell',3);const pool=shuffle(WD.filter(w=>spLen(w,L))).slice(0,T.pathN(6));let i=0,err=0,gems=0,lets=0;
  O.setScreen('sTal','meadow',back);const s=$('#sTal');
  const run=()=>{const w=pool[i];const need=[...w.plain];let k=0,miss=0,HB=null;T.hudT('כּוֹתְבִים מִלִּים',T.progressBar(i,pool.length));O.sayNow='שׁוֹמְעִים וְכוֹתְבִים. '+T.spk(w.w);s.innerHTML='';lets+=need.length;
    const card=h('div','prq tqc gp-sp',`<div class="qq tqi">שׁוֹמְעִים וְכוֹתְבִים</div>${pic(w)}<div class="slots">${need.map(()=>'<span class="slot2"></span>').join('')}</div>`);
    const pb=h('button','hintbtn',ICON.say+'<span>הַשְׁמַע</span>');pb.onclick=()=>sayW(w);card.appendChild(pb);s.appendChild(card);
    const extra=[];const last=need[need.length-1];if(L>1&&FINAL[last]&&!need.includes(FINAL[last]))extra.push(FINAL[last]);
    for(const c of shuffle(LETTERS)){if(extra.length>=L)break;if(!need.some(x=>sameSound(x,c))&&!extra.some(x=>sameSound(x,c)))extra.push(c);}
    const row=h('div','chs gp-tiles');const fb=h('div','lcap','');
    const all=shuffle([...need,...extra]);const rows=all.length<=4?1:all.length<=10?2:3;row.style.gridTemplateColumns=`repeat(${Math.ceil(all.length/rows)},auto)`;all.forEach(c=>{const b=h('button','chb tx big2',c);b.dataset.c=c;b.onclick=()=>tap(b);row.appendChild(b);});
    s.appendChild(row);s.appendChild(fb);
    function tap(b){if(b.disabled||k>=need.length)return;const c=b.dataset.c;
      if(c===need[k]){const sl=card.querySelectorAll('.slot2')[k];sl.textContent=c;sl.classList.add('on');b.disabled=true;b.classList.add('ok');k++;miss=0;sfx.pop(k);fb.textContent='';row.querySelectorAll('.show').forEach(x=>x.classList.remove('show'));
        if(k===need.length)complete(HB&&HB.step?1:2);}
      else wrong(b);}
    const nextT=()=>k<need.length?[...row.children].find(x=>!x.disabled&&x.dataset.c===need[k]):null;
    function complete(g){gems+=g;if(g){O.addGems(g,card);O.floatText(card,'+'+g);}sfx.ok(i);card.querySelector('.slots').outerHTML=`<div class="bigw gp-done">${w.w}</div>`;sayW(w);
      setTimeout(()=>{if(!card.isConnected)return;i++;if(i<pool.length)run();else{T.setKey(null);T.finishAct('spell-'+L,err,lets,gems,back,()=>spell(back,L));}},D(g?1500:4200));}
    function wrong(b){err++;miss++;sfx.no();if(b){b.classList.remove('shake');void b.offsetWidth;b.classList.add('shake');
        if(k===need.length-1&&FINAL[need[k]]===b.dataset.c)fb.innerHTML=`בְּסוֹף מִלָּה כּוֹתְבִים <b>${need[k]}</b> (אוֹת סוֹפִית)`;}
      if(miss>=2){if(HB&&!HB.step)HB.offer();else{const t=nextT();if(t)t.classList.add('show');}}}
    /* #54 one help button: tap 1 = the next letter glows, tap 2 = the whole word letter by letter (a mistake, no gems) */
    if(window.HELP&&HELP.button){HB=HELP.button(s,{before:fb,get ans(){const t=nextT();return t?[...row.children].indexOf(t):-1;},
      clue:()=>{const t=nextT();if(!t)return '';t.classList.add('show');return `${SPH.next}: <b>${need[k]}</b>`;},
      answer:()=>{if(k<need.length){err++;while(k<need.length){const t=nextT();if(t){t.disabled=true;t.classList.add('ok');}k++;}fb.textContent='';complete(0);}
        const fin=FINAL[need[need.length-1]]?`<div>${SPH.fin}: <b>${need[need.length-1]}</b></div>`:'';
        return `<div>${HELP.BT.ans}: <b class="hq-a">${w.w}</b></div><div class="hq-x">${SPH.by} ${need.join(' · ')}${fin}</div>`;}});
      HB.wrong=()=>wrong(null);}
    T.setKey(e=>{const c=T.TYPE&&T.TYPE.keyOf(e);if(!c||c===' ')return;const b=[...row.children].find(x=>!x.disabled&&x.dataset.c===c)||[...row.children].find(x=>!x.disabled);if(b&&b.dataset.c===c)b.click();else if(b)wrong(null);});
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
 {t:'הַגֶּשֶׁם הָרִאשׁוֹן',hw:[['אֲפֹרִים','☁️'],['טִפּוֹת','💧'],['מִטְרִיָּה','☂️']],spr:['cloud','flower'],gk:'sci',goal:'גשם יורד מהעננים, וצמחים צריכים מים כדי לגדול',les:1,s:['בַּבֹּקֶר הַשָּׁמַיִם הָיוּ אֲפֹרִים.','מָיָה רָאֲתָה עָנָן גָּדוֹל וְשָׁחֹר, מָלֵא טִפּוֹת מַיִם.','הִיא לָקְחָה מִטְרִיָּה וְיָצְאָה לַגַּן.','פִּתְאוֹם יָרַד מֵהֶעָנָן גֶּשֶׁם רִאשׁוֹן.','הַפְּרָחִים שָׂמְחוּ, כִּי צְמָחִים צְרִיכִים מַיִם כְּדֵי לִגְדֹּל.','מָיָה קָפְצָה בַּשְּׁלוּלִיּוֹת וְצָחֲקָה.'],
  q:[['מֵאַיִן יָרַד הַגֶּשֶׁם?','מֵהֶעָנָן',['מֵהַשֶּׁמֶשׁ','מֵהָעֵץ']],['לָמָּה הַגֶּשֶׁם טוֹב לַפְּרָחִים?','כִּי צְמָחִים צְרִיכִים מַיִם כְּדֵי לִגְדֹּל',['כִּי הַגֶּשֶׁם קַר','כִּי מָיָה קָפְצָה בַּשְּׁלוּלִיּוֹת']],['מָה קָרָה רִאשׁוֹן?','מָיָה רָאֲתָה עָנָן',['מָיָה קָפְצָה בַּשְּׁלוּלִיּוֹת','הַפְּרָחִים שָׁתוּ מַיִם']]]},
 {t:'הַגּוּר שֶׁל גִּיל',hw:[['גּוּר','🐶'],['נְבִיחָה','🐕'],['הַשִּׂיחַ','🌿']],spr:['dog','heart'],gk:'sci',goal:'כלבים שומעים טוב מאיתנו, ורעש חזק מפחיד אותם',les:1,s:['לְגִיל יֵשׁ גּוּר קָטָן בְּשֵׁם בּוּבִּי.','יוֹם אֶחָד בּוּבִּי בָּרַח מֵהֶחָצֵר.','גִּיל חִפֵּשׂ אוֹתוֹ בְּכָל הָרְחוֹב.','הוּא שָׁמַע נְבִיחָה קְטַנָּה, וּמָצָא אֶת בּוּבִּי מֵאֲחוֹרֵי הַשִּׂיחַ.','בּוּבִּי רָעַד, כִּי רַעַשׁ חָזָק שֶׁל מְכוֹנִית הִפְחִיד אוֹתוֹ.','בַּבַּיִת אִמָּא הִסְבִּירָה: "כְּלָבִים שׁוֹמְעִים הַרְבֵּה יוֹתֵר טוֹב מֵאִתָּנוּ."'],
  q:[['אֵיךְ קוֹרְאִים לַגּוּר?','בּוּבִּי',['שׁוֹקוֹ','רֶקְס']],['לָמָּה רַעַשׁ שֶׁל מְכוֹנִית מַפְחִיד כְּלָבִים?','כִּי כְּלָבִים שׁוֹמְעִים טוֹב מְאוֹד',['כִּי כְּלָבִים לֹא שׁוֹמְעִים','כִּי כְּלָבִים אוֹהֲבִים מְכוֹנִיּוֹת']],['מָה קָרָה רִאשׁוֹן?','בּוּבִּי בָּרַח',['גִּיל שָׁמַע נְבִיחָה','אִמָּא הִסְבִּירָה עַל כְּלָבִים']]]},
 {t:'הַמִּגְדָּל שֶׁל יוֹנִי',hw:[['מִגְדָּל','🗼'],['מִקֻּבִּיּוֹת','🧱'],['הִתְפַּזְּרוּ','💥']],spr:['tower','puzzle'],gk:'value',goal:'כשמשהו נהרס, נרגעים ומנסים שוב',les:1,s:['יוֹנִי בָּנָה מִגְדָּל גָּבוֹהַּ מִקֻּבִּיּוֹת.','הוּא שָׂם קֻבִּיָּה עַל קֻבִּיָּה, לְאַט לְאַט.','אָחִיו הַקָּטָן רָץ וְנָגַע בַּמִּגְדָּל.','הַמִּגְדָּל נָפַל, וְכָל הַקֻּבִּיּוֹת הִתְפַּזְּרוּ.','יוֹנִי כָּעַס, אֲבָל הוּא נָשַׁם עָמֹק וְנִרְגַּע.','"לֹא נוֹרָא, אֶפְשָׁר לְנַסּוֹת שׁוּב! בּוֹא נִבְנֶה בְּיַחַד," הוּא אָמַר.'],
  q:[['לָמָּה הַמִּגְדָּל נָפַל?','כִּי הָאָח הַקָּטָן נָגַע בּוֹ',['כִּי הָיְתָה רוּחַ','כִּי יוֹנִי קָפַץ']],['מָה לָמַדְנוּ מִיּוֹנִי?','כְּשֶׁמַּשֶּׁהוּ נֶהֱרָס, נִרְגָּעִים וּמְנַסִּים שׁוּב',['כְּשֶׁמַּשֶּׁהוּ נֶהֱרָס, צוֹעֲקִים','לֹא בּוֹנִים אַף פַּעַם']],['מָה קָרָה רִאשׁוֹן?','יוֹנִי בָּנָה מִגְדָּל',['הַמִּגְדָּל נָפַל','יוֹנִי חִיֵּךְ']]]},
 {t:'הַצִּפּוֹר הַקְּטַנָּה',hw:[['בְּקֵן','🪺'],['צִפּוֹר','🐦'],['כְּנָפַיִם','🪽']],spr:['bird','tree'],gk:'value',goal:'גם כשמפחדים, אפשר לנסות',les:0,s:['בְּקֵן עַל הָעֵץ גָּרָה צִפּוֹר קְטַנָּה.','כָּל הַצִּפֳּרִים עָפוּ, אֲבָל הִיא פָּחֲדָה.','אִמָּא שֶׁלָּהּ אָמְרָה: "תְּנַסִּי, אֲנִי כָּאן."','הַצִּפּוֹר פָּתְחָה כְּנָפַיִם וְקָפְצָה.','הִיא עָפָה עַד הָעֵץ הַשֵּׁנִי!','מֵאָז הִיא עָפָה כָּל יוֹם.'],
  q:[['מָה לָמַדְנוּ מֵהַצִּפּוֹר?','גַּם כְּשֶׁמְּפַחֲדִים, אֶפְשָׁר לְנַסּוֹת',['שֶׁצָּרִיךְ תָּמִיד לְהִשָּׁאֵר בַּקֵּן','שֶׁצִּפֳּרִים לֹא עָפוֹת']],['לָמָּה הַצִּפּוֹר לֹא עָפָה בַּהַתְחָלָה?','כִּי הִיא פָּחֲדָה',['כִּי הִיא הָיְתָה רְעֵבָה','כִּי יָרַד גֶּשֶׁם']],['מָה קָרָה רִאשׁוֹן?','אִמָּא אָמְרָה לָהּ לְנַסּוֹת',['הַצִּפּוֹר עָפָה עַד הָעֵץ הַשֵּׁנִי','הַצִּפּוֹר עָפָה כָּל יוֹם']]]},
 {t:'הַפָּנָס שֶׁל סַבָּא',hw:[['הַחַשְׁמַל','⚡'],['פָּנָס','🔦'],['צֵל','👤']],spr:['lantern','moon'],gk:'sci',goal:'צל נוצר כשמשהו עוצר את האור',les:1,s:['בַּלַּיְלָה הַחַשְׁמַל בַּבַּיִת כָּבָה.','הָיָה חֹשֶׁךְ גָּמוּר, וְתָמָר לֹא רָאֲתָה כְּלוּם.','סַבָּא הוֹצִיא פָּנָס יָשָׁן מֵהָאָרוֹן.','הוּא הִדְלִיק אוֹתוֹ, וְהַחֶדֶר הִתְמַלֵּא בְּאוֹר.','תָּמָר שָׂמָה יָד מוּל הַפָּנָס, וְעַל הַקִּיר הוֹפִיעַ צֵל.','סַבָּא הִסְבִּיר: "הַיָּד עוֹצֶרֶת אֶת הָאוֹר, וְכָכָה נוֹצָר צֵל."'],
  q:[['לָמָּה הָיָה חֹשֶׁךְ בַּבַּיִת?','כִּי הַחַשְׁמַל כָּבָה',['כִּי הָיָה עָנָן','כִּי תָּמָר יָשְׁנָה']],['לָמָּה הוֹפִיעַ צֵל עַל הַקִּיר?','כִּי הַיָּד עָצְרָה אֶת הָאוֹר',['כִּי הַחַשְׁמַל חָזַר','כִּי הַקִּיר הָיָה שָׁחֹר']],['מָה קָרָה רִאשׁוֹן?','הַחַשְׁמַל כָּבָה',['סַבָּא הִדְלִיק פָּנָס','הוֹפִיעַ צֵל עַל הַקִּיר']]]},
 {t:'הַדָּג הַזָּהֹב',hw:[['זִימִים','🐟'],['סִירָה','⛵'],['אֲוִיר','💨']],spr:['fish','wave'],gk:'sci',goal:'דג נושם בזימים, רק בתוך המים',les:1,s:['בַּיָּם הַכָּחֹל שָׂחָה דָּג קָטָן וְזָהֹב.','הוּא רָצָה לִרְאוֹת מָה יֵשׁ מֵעַל הַמַּיִם.','הוּא קָפַץ גָּבוֹהַּ וְרָאָה סִירָה לְבָנָה.','אֲבָל מִיָּד הוּא חָזַר לַמַּיִם, כִּי דָּג נוֹשֵׁם רַק בְּתוֹךְ הַמַּיִם.','לַדָּג יֵשׁ זִימִים, וְאִתָּם הוּא נוֹשֵׁם בַּמַּיִם, כְּמוֹ שֶׁאֲנַחְנוּ נוֹשְׁמִים אֲוִיר.'],
  q:[['אֵיזֶה צֶבַע הָיָה הַדָּג?','זָהֹב',['אָדֹם','יָרֹק']],['לָמָּה הַדָּג חָזַר מַהֵר לַמַּיִם?','כִּי דָּג נוֹשֵׁם רַק בְּתוֹךְ הַמַּיִם',['כִּי הוּא רָאָה כָּרִישׁ','כִּי הַסִּירָה הָיְתָה רוֹעֶשֶׁת']],['מָה קָרָה רִאשׁוֹן?','הַדָּג רָצָה לִרְאוֹת מָה יֵשׁ לְמַעְלָה',['הַדָּג קָפַץ גָּבוֹהַּ','הַדָּג חָזַר לַמַּיִם']]]},
 {t:'הָעוּגָה שֶׁנִּשְׂרְפָה',hw:[['בַּתַּנּוּר','🍞'],['שְׂרֵפָה','🔥'],['שָׁעוֹן','⏰']],spr:['cake','flame'],gk:'value',goal:'מטעות לומדים: בפעם הבאה שמים שעון',les:0,s:['אַבָּא וְשִׁירָה אָפוּ עוּגָה לְשַׁבָּת.','הֵם שָׂמוּ אוֹתָהּ בַּתַּנּוּר וְהָלְכוּ לְשַׂחֵק.','אַחֲרֵי זְמַן מָה, שִׁירָה הֵרִיחָה רֵיחַ שֶׁל שְׂרֵפָה.','הֵם רָצוּ לַמִּטְבָּח, אֲבָל הָעוּגָה כְּבָר הָיְתָה שְׁחֹרָה.','"טָעִינוּ, וְלָמַדְנוּ: בַּפַּעַם הַבָּאָה נָשִׂים שָׁעוֹן," אָמַר אַבָּא.','הֵם אָפוּ עוּגָה חֲדָשָׁה, וְהַפַּעַם הִיא יָצְאָה טְעִימָה.'],
  q:[['מָה לָמְדוּ אַבָּא וְשִׁירָה מֵהַטָּעוּת?','לָשִׂים שָׁעוֹן, כְּדֵי לֹא לִשְׁכֹּחַ אֶת הָעוּגָה',['לֹא לֶאֱפוֹת אַף פַּעַם','לָשִׂים אֶת הָעוּגָה בַּמְּקָרֵר']],['לָמָּה הָעוּגָה נִשְׂרְפָה?','כִּי הֵם שָׁכְחוּ אוֹתָהּ בַּתַּנּוּר',['כִּי הִיא נָפְלָה','כִּי שָׂמוּ בָּהּ מֶלַח']],['מָה קָרָה רִאשׁוֹן?','שִׁירָה הֵרִיחָה שְׂרֵפָה',['הֵם אָפוּ עוּגָה חֲדָשָׁה','אַבָּא אָמַר שֶׁיָּשִׂימוּ שָׁעוֹן']]]},
 {t:'הַכִּבְשָׂה שֶׁהָלְכָה לְאִבּוּד',hw:[['כְּבָשִׂים','🐑'],['הָרוֹעֶה','🧑‍🌾'],['טִפְּסָה','⛰️']],spr:['sheep','mount'],gk:'math',goal:'סופרים כדי לדעת מה חסר: 10 פחות 9 זה 1',les:0,s:['בַּשָּׂדֶה הָיוּ עֶשֶׂר כְּבָשִׂים לְבָנוֹת.','בָּעֶרֶב הָרוֹעֶה סָפַר אוֹתָן, וְהָיוּ רַק תֵּשַׁע. חָסְרָה אַחַת!','כִּבְשָׂה אַחַת טִפְּסָה עַל הָהָר וְלֹא יָדְעָה אֵיךְ לָרֶדֶת.','הַכֶּלֶב שֶׁל הָרוֹעֶה רָץ וּמָצָא אוֹתָהּ.','הוּא הוֹבִיל אוֹתָהּ בַּשְּׁבִיל בַּחֲזָרָה לָעֵדֶר.'],
  q:[['הָיוּ עֶשֶׂר כְּבָשִׂים, וְהָרוֹעֶה סָפַר תֵּשַׁע. כַּמָּה כְּבָשִׂים חָסְרוּ?','1',['9','10']],['לָמָּה הַכִּבְשָׂה לֹא חָזְרָה?','כִּי הִיא לֹא יָדְעָה אֵיךְ לָרֶדֶת מֵהָהָר',['כִּי הִיא יָשְׁנָה','כִּי הִיא כָּעֲסָה']],['מָה קָרָה רִאשׁוֹן?','הָרוֹעֶה סָפַר אֶת הַכְּבָשִׂים',['הַכֶּלֶב מָצָא אֶת הַכִּבְשָׂה','הַכִּבְשָׂה חָזְרָה לָעֵדֶר']]]},
 {t:'הַמְּכוֹנִית הָאֲדֻמָּה',hw:[['מְכוֹנִית','🚗'],['צַעֲצוּעַ','🧸'],['לְהַשְׁאִיל','🤝']],spr:['car','star'],gk:'value',goal:'לשתף ולשחק בתורות זה כיף יותר',les:1,s:['לְאָדָם יֵשׁ מְכוֹנִית צַעֲצוּעַ אֲדֻמָּה.','הוּא לָקַח אוֹתָהּ לַגַּן כְּדֵי לְשַׂחֵק עִם חֲבֵרִים.','רוֹנִי רָצָה לְשַׂחֵק בָּהּ גַּם.','בַּהַתְחָלָה אָדָם לֹא רָצָה לְהַשְׁאִיל.','אַחַר כָּךְ הֵם בָּנוּ כְּבִישׁ מֵחוֹל, וְשִׂחֲקוּ בְּתוֹרוֹת.','"כָּכָה הַרְבֵּה יוֹתֵר כֵּיף!" אָמַר אָדָם.'],
  q:[['אֵיזֶה צֶבַע הַמְּכוֹנִית?','אֲדֻמָּה',['כְּחֻלָּה','צְהֻבָּה']],['לָמָּה בַּסּוֹף הָיָה יוֹתֵר כֵּיף?','כִּי הֵם שִׂחֲקוּ יַחַד בְּתוֹרוֹת',['כִּי אָדָם שִׂחֵק לְבַד','כִּי הַמְּכוֹנִית נִשְׁבְּרָה']],['מָה קָרָה רִאשׁוֹן?','אָדָם לֹא רָצָה לְהַשְׁאִיל',['הֵם בָּנוּ כְּבִישׁ מֵחוֹל','הֵם שִׂחֲקוּ בְּתוֹרוֹת']]]},
 {t:'שֶׁלֶג בַּחֶרְמוֹן',hw:[['שֶׁלֶג','❄️'],['כְּפָפוֹת','🧤'],['נָמֵס','💧']],spr:['mount','cloud'],gk:'sci',goal:'שלג הוא מים קפואים, ובחום הוא נמס',les:0,s:['בַּחֹרֶף נָסְעָה הַמִּשְׁפָּחָה לַחֶרְמוֹן.','עַל הָהָר הָיָה קַר מְאוֹד, וּמֵהֶעֲנָנִים יָרַד שֶׁלֶג לָבָן.','נוֹגָה לָבְשָׁה מְעִיל, כְּפָפוֹת וְכוֹבַע.','הִיא בָּנְתָה אִישׁ שֶׁלֶג עִם אַף מִגֶּזֶר.','בַּבַּיִת הַחַם, הַשֶּׁלֶג עַל הַכְּפָפוֹת נָמֵס וְנִהְיָה מַיִם, כִּי שֶׁלֶג הוּא מַיִם קְפוּאִים.'],
  q:[['לָמָּה הַשֶּׁלֶג נָמֵס בַּבַּיִת?','כִּי בַּבַּיִת חַם, וְשֶׁלֶג בְּחֹם נִהְיָה מַיִם',['כִּי בַּבַּיִת קַר','כִּי נוֹגָה אָכְלָה אוֹתוֹ']],['לָמָּה נוֹגָה לָבְשָׁה מְעִיל וּכְפָפוֹת?','כִּי בַּחוּץ הָיָה קַר',['כִּי הָיָה חַם','כִּי הִיא הָלְכָה לַיָּם']],['מָה קָרָה רִאשׁוֹן?','הַמִּשְׁפָּחָה נָסְעָה לַחֶרְמוֹן',['נוֹגָה בָּנְתָה אִישׁ שֶׁלֶג','הַשֶּׁלֶג נָמֵס']]]},
 {t:'הַקֶּשֶׁת בַּשָּׁמַיִם',hw:[['קֶשֶׁת','🌈'],['טִפּוֹת','💧'],['צְבָעִים','🎨']],spr:['rainbow','sun'],gk:'sci',goal:'קשת נוצרת משמש וטיפות מים, ויש בה 7 צבעים',les:1,s:['אַחֲרֵי הַגֶּשֶׁם יָצְאָה הַשֶּׁמֶשׁ.','אִיתַי הִסְתַּכֵּל מֵהַחַלּוֹן וְרָאָה קֶשֶׁת.','הוּא סָפַר שִׁשָּׁה צְבָעִים: אָדֹם, כָּתֹם, צָהֹב, יָרֹק, כָּחֹל וְסָגֹל.','אַבָּא אָמַר: "יֵשׁ עוֹד אֶחָד, כָּחֹל כֵּהֶה, בֵּין הַכָּחֹל לַסָּגֹל. בְּיַחַד שִׁבְעָה!"','"קֶשֶׁת נוֹצֶרֶת כְּשֶׁהַשֶּׁמֶשׁ מְאִירָה עַל טִפּוֹת מַיִם," הִסְבִּיר אַבָּא.'],
  q:[['כַּמָּה צְבָעִים יֵשׁ בַּקֶּשֶׁת?','7',['3','10']],['לָמָּה הוֹפִיעָה קֶשֶׁת?','כִּי הַשֶּׁמֶשׁ הֵאִירָה עַל טִפּוֹת מַיִם',['כִּי הָיָה לַיְלָה','כִּי הָיָה קַר']],['מָה קָרָה רִאשׁוֹן?','יָרַד גֶּשֶׁם',['אִיתַי רָאָה קֶשֶׁת','אַבָּא הִסְבִּיר עַל הַקֶּשֶׁת']]]},
 {t:'הָאֶבֶן הַנּוֹצֶצֶת',hw:[['מְעָרָה','🕳️'],['יַהֲלוֹם','💎'],['גָּבִישׁ','🔮']],spr:['crystal','lantern'],gk:'word',goal:'מילה חדשה: גביש, אבן נוצצת שנוצרת בטבע',les:0,s:['לִיאוֹר וְאַבָּא טִיְּלוּ לְיַד מְעָרָה.','בִּפְנִים הָיָה חָשׁוּךְ, אָז הֵם הִדְלִיקוּ פָּנָס.','עַל הַקִּיר נָצְצָה אֶבֶן כְּחֻלָּה.','"זֶה יַהֲלוֹם?" שָׁאַל לִיאוֹר.','אַבָּא צָחַק: "זֶה גָּבִישׁ, אֶבֶן נוֹצֶצֶת שֶׁנּוֹצְרָה בַּטֶּבַע."','הֵם צִלְּמוּ אֶת הָאֶבֶן, וְהִשְׁאִירוּ אוֹתָהּ בַּמָּקוֹם.'],
  q:[['מָה זֶה גָּבִישׁ?','אֶבֶן נוֹצֶצֶת מֵהַטֶּבַע',['סוּג שֶׁל פָּנָס','חַיָּה שֶׁגָּרָה בַּמְּעָרָה']],['לָמָּה הֵם הִדְלִיקוּ פָּנָס?','כִּי בַּמְּעָרָה הָיָה חָשׁוּךְ',['כִּי הָיָה קַר','כִּי הֵם חִפְּשׂוּ אֶת אַבָּא']],['מָה קָרָה רִאשׁוֹן?','הֵם הִדְלִיקוּ פָּנָס',['הֵם רָאוּ אֶבֶן כְּחֻלָּה','הֵם צִלְּמוּ אֶת הָאֶבֶן']]]},
 {t:'הַמַּגְלֵשָׁה בַּגַּן',hw:[['מַגְלֵשָׁה','🛝'],['לַמַּדְרֵגָה','🪜'],['הַגַּנֶּנֶת','👩‍🏫']],spr:['star','heart'],gk:'value',goal:'כשמישהו מתקשה, עוזרים לו',les:0,s:['בַּגַּן הָיְתָה מַגְלֵשָׁה גְּבוֹהָה.','הַרְבֵּה יְלָדִים עָמְדוּ בַּתּוֹר.','יַלְדָּה קְטַנָּה בָּכְתָה, כִּי הִיא לֹא הִגִּיעָה לַמַּדְרֵגָה.','עִידוֹ עָזַר לָהּ לְטַפֵּס, וְהִיא גָּלְשָׁה וְצָחֲקָה.','הַגַּנֶּנֶת אָמְרָה: "עִידוֹ, אַתָּה חָבֵר טוֹב!"'],
  q:[['לָמָּה הַגַּנֶּנֶת אָמְרָה שֶׁעִידוֹ חָבֵר טוֹב?','כִּי הוּא עָזַר לְמִישֶׁהִי שֶׁהִתְקַשְּׁתָה',['כִּי הוּא גָּלַשׁ הֲכִי מַהֵר','כִּי הוּא עָמַד רִאשׁוֹן בַּתּוֹר']],['לָמָּה הַיַּלְדָּה בָּכְתָה?','כִּי הִיא לֹא הִגִּיעָה לַמַּדְרֵגָה',['כִּי הִיא נָפְלָה','כִּי הִיא רָצְתָה הַבַּיְתָה']],['מָה קָרָה רִאשׁוֹן?','הַיַּלְדָּה בָּכְתָה',['הַיַּלְדָּה גָּלְשָׁה','הַגַּנֶּנֶת דִּבְּרָה עִם עִידוֹ']]]},
 {t:'צְבִיקָה הַצָּב לֹא מְוַתֵּר',hw:[['הַצָּב','🐢'],['הָאַרְנָב','🐇'],['בַּבְּרֵכָה','🏊']],spr:['turtle','flower'],gk:'value',goal:'מי שממשיך ולא מוותר, מגיע',les:0,s:['צְבִיקָה הַצָּב הָלַךְ לְאַט לְאַט אֶל הַבְּרֵכָה.','הָאַרְנָב רָץ מַהֵר וְצָחַק עָלָיו.','בַּדֶּרֶךְ הָאַרְנָב עָצַר לֶאֱכֹל, וְנִרְדַּם מִתַּחַת לָעֵץ.','צְבִיקָה הִמְשִׁיךְ לָלֶכֶת, צַעַד אַחֲרֵי צַעַד.','כְּשֶׁהָאַרְנָב הִתְעוֹרֵר, צְבִיקָה כְּבָר שָׂחָה בַּבְּרֵכָה.'],
  q:[['מָה לָמַדְנוּ מִצְּבִיקָה?','מִי שֶׁמַּמְשִׁיךְ וְלֹא מְוַתֵּר, מַגִּיעַ',['שֶׁצָּרִיךְ רַק לָרוּץ מַהֵר','שֶׁכְּדַאי לִישֹׁן בַּדֶּרֶךְ']],['לָמָּה הָאַרְנָב לֹא הִגִּיעַ רִאשׁוֹן?','כִּי הוּא נִרְדַּם בַּדֶּרֶךְ',['כִּי הוּא הָלַךְ לְאַט','כִּי הוּא פָּחַד מִמַּיִם']],['מָה קָרָה רִאשׁוֹן?','הָאַרְנָב צָחַק עַל צְבִיקָה',['הָאַרְנָב נִרְדַּם','הָאַרְנָב הִתְעוֹרֵר']]]}];
/* extra questions for the 6 older stories (by index): none since #355 — each now has its own 3 questions, the last about the lesson (2-3 per story) */
const STORY_Q={};

/* ===================== 9. RHYMES: hear a word (with its picture), pick the word that rhymes ===================== */
/* one set per line: word|sprite, its rhyme family, the words that rhyme with it. Words of one family are never offered against each other. */
const RHY_RAW=`עִפָּרוֹן|pencil on בַּלּוֹן לִימוֹן
דְּרָקוֹן|dragon on חַלּוֹן סַבּוֹן
יַהֲלוֹם|gem on חֲלוֹם שָׁלוֹם
דָּג|fish ag גַּג חַג
קֶשֶׁת|rainbow esh רֶשֶׁת
נֶשֶׁר|eagle esh גֶּשֶׁר קֶשֶׁר
כּוֹכָב|star av זָהָב
צָב|turtle av חָלָב
אַרְנָב|rabbit av זָנָב
יָרֵחַ|moon ach פּוֹרֵחַ
מַפְתֵּחַ|key ach שָׂמֵחַ
פֶּרַח|flower ach קֶרַח
תַּפּוּחַ|apple ach לוּחַ רוּחַ
לֵב|heart ev זְאֵב כְּאֵב
סִירָה|boat ia שִׁירָה דִּירָה
מִטְרִיָּה|umbrella ia סִפְרִיָּה
עֵץ|tree etz קוֹפֵץ נוֹצֵץ
דֶּגֶל|flag egel רֶגֶל עֵגֶל
כּוֹבַע|hat va צֶבַע אֶצְבַּע
לֶהָבָה|flame va אַהֲבָה
כַּדּוּר|ball ur תַּנּוּר צִיּוּר
צִפּוֹר|bird or כִּנּוֹר אוֹר
עָנָן|cloud an גַּנָּן
לִוְיָתָן|whale an קָטָן
פָּנָס|lantern as אֲנָנָס
מִגְדָּל|tower al סַנְדָּל
גַּל|wave al סַל גָּמָל
הַר|mount ar נָהָר פַּר
יַנְשׁוּף|owl uf גּוּף עוּף
מַסְמֵר|nail er שׁוֹמֵר
גָּבִישׁ|crystal ish כְּבִישׁ
צְרִיף|hut if כִּיף
מַנְעוּל|lock ul חָתוּל`;
const RHY=RHY_RAW.trim().split('\n').map(l=>{const [ws,f,...r]=l.trim().split(/\s+/);const [w,spr]=ws.split('|');return {w,spr,f,r};});
const RHY_ASK='מָה מִתְחָרֵז עִם ';
let rhyTok=0;
/* the voice: the word, then each choice in turn (one word per sentence, so every sentence exists in advance) */
function rhySay(s,os,card){const tok=++rhyTok;O.say(RHY_ASK+s.w);os.forEach((o,k)=>setTimeout(()=>{if(tok===rhyTok&&(!card||card.isConnected))O.say(o);},D(2200+k*1300)));}
function rhyQ(used){const s=lword('gp-rhy',used?RHY.filter(x=>!used.has(x.w)):RHY);if(used)used.add(s.w);const a=pick(s.r);const ds=[];
  for(const x of shuffle(RHY.filter(x=>x.f!==s.f).flatMap(x=>[x.w,...x.r]))){if(ds.length>=2)break;if(!ds.includes(x))ds.push(x);}
  const os=shuffle([a,...ds]);let card=null;
  return {pr:`<div class="gp-rhy">${pic(s)}<div class="bigw">${s.w}</div></div><div class="qq">מָה מִתְחָרֵז?</div>`,opts:os,ans:os.indexOf(a),cls:'tx',
    play:()=>{card=document.querySelector('#sTal .tqc');rhySay(s,os,card);},auto:1,playLbl:'שׁוּב',say:plainHe(RHY_ASK+s.w),
    explain:`<span class="bigw">${s.w} · ${a}</span>`,reveal:()=>O.say(s.w+', '+a),bank:'gp-rhy',bkey:s.w,key:s.w,chk:{w:s.w,a,f:s.f}};}
/* a round of 5 different words (the learning engine alone may offer the same unseen word again) */
function rhyRound(back){const used=new Set();T.quiz({id:'read-rhyme',title:'מִלִּים מִתְחָרְזוֹת',bg:'city',back,n:5,gen:i=>{if(!i)used.clear();return rhyQ(used);}});}
/* every sentence the rhymes say, for the voice pregen */
const speakList=()=>[...new Set(RHY.flatMap(s=>[RHY_ASK+s.w,s.w,...s.r,...s.r.map(a=>s.w+', '+a)]))];

/* ---------- names for the parents' skills view (no nikud) ---------- */
const SKILLS={'read-nik':'סולם הניקוד: הברות ומילים','nik-1':'ניקוד: קמץ ופתח (אַ)','nik-2':'ניקוד: חיריק (אִי)','nik-3':'ניקוד: חולם (אוֹ)','nik-4':'ניקוד: שורוק וקובוץ (אוּ)','nik-5':'ניקוד: צירי וסגול (אֶ)','nik-6':'ניקוד: שווא',
 'read-sound':'מודעות פונולוגית: הצליל הפותח (שמיעה בלבד)','snd-1':'צליל פותח: אות (3 אפשרויות)','snd-2':'צליל פותח: אות (4 אפשרויות)','snd-3':'צליל פותח: הברה',
 'write-spell':'כתיב: שומעים מילה וכותבים מאותיות','spell-1':'כתיב: מילים של 2-3 אותיות','spell-2':'כתיב: מילים של 4 אותיות','spell-3':'כתיב: מילים של 5+ אותיות',
 'read-flu':'שטף קריאה: מילים ב-45 שניות (שיא אישי)','read-rhyme':'מודעות פונולוגית: חרוזים (שומעים מילה ובוחרים מילה שמתחרזת)','write-trace':'כתיבת אותיות (כולל אותיות סופיות)',
 'pict-1':'גרף תמונות: כמה, הכי הרבה, הכי מעט','pict-2':'גרף תמונות: בכמה יותר, ביחד','shp-1':'צורות: זיהוי משולש, ריבוע, מלבן, עיגול','shp-2':'צורות: צלעות, קודקודים, מחומש ומשושה',
 'len-1':'מדידת אורך בסרגל (ס"מ)','len-2':'השוואה: ארוך-קצר, כבד-קל (מאזניים)'};

/* ---------- registration ---------- */
const ACTS={
 read:[{id:'read-nik',name:'סֻלַּם הַנִּקּוּד',icon:()=>'<span class="gp-ic">בָּ</span>',run:nikMenu},
  {id:'read-sound',name:'מָה שׁוֹמְעִים בַּהַתְחָלָה?',icon:()=>'<span style="font-size:34px">👂</span>',run:back=>sndRound(back)},
  {id:'read-flu',name:'מֵרוֹץ מִלִּים',icon:()=>'<span style="font-size:34px">⏱️</span>',noMenu:true,run:race},
  {id:'read-rhyme',name:'מִלִּים מִתְחָרְזוֹת',icon:()=>'<span style="font-size:34px">🎵</span>',run:rhyRound}],
 write:[{id:'write-spell',name:'כּוֹתְבִים מִלִּים',icon:()=>T.X.abc,run:back=>spell(back)}]};
function addAct(bid,a){const b=T.BUILD.find(x=>x.id===bid);if(!b||T.ACT[a.id])return;b.acts.push(a);T.ACT[a.id]=a;a.b=b;}
function register(){Object.entries(ACTS).forEach(([bid,as])=>as.forEach(a=>addAct(bid,a)));}
window.GAPS={register,ACTS,WD,parse,hi,level,nikMenu,nikRound,nikIntro,nikQ,RUNG,sndQ,sndRound,spell,race,raceRun,RHY,rhyQ,rhyRound,speakList,FINALS,finNote,STORIES,STORY_Q,SKILLS,sameSound,
  set dict(v){dict=v;dictTried=true;}};
})();
