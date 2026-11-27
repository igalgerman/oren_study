/* ===== עִיר הַכִּשְׁרוֹנוֹת — talents city (injected into index.html by build) ===== */
(()=>{'use strict';
const O=window.OREN;if(!O)return;
const {h,$,pick,shuffle,ICON,SPR,sprite}=O;
const sfx=O.sfx;const D=O.D;
/* #432 a missing field or one of the wrong type (an old or damaged save) gets its blank value */
const isObj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const S=()=>{const s=O.save;for(const k of ['tl','time'])if(!isObj(s[k]))s[k]={};for(const k of ['mood','jar','art'])if(!Array.isArray(s[k]))s[k]=[];if(!isObj(s.set))s.set={hide:{}};if(!isObj(s.set.hide))s.set.hide={};if(!isObj(s.typ))s.typ={best:{},wpm:0};return s;};
const today=O.today;
/* #394 the daily path: a mission started from the path is a short scene (at most PATH_Q questions, ~60-90 s);
   the same activity opened from its building keeps its full length. PATH is on from the path step until home or the city hub. */
let PATH=0;const PATH_Q=4;const pathN=n=>PATH?Math.min(n,PATH_Q):n;
O.on('screen',id=>{if(id==='sHome')PATH=0;});
const L_=t=>`<span class="ltr">${t}</span>`;
const nb=n=>`<b>${n}</b>`;
const plainHe=s=>String(s).replace(/<[^>]+>/g,' ').replace(/[֑-ׇ]/g,'').replace(/\s+/g,' ').trim();
/* what the voice says: full spelling (מִלָּה → מילה), not nikud just stripped (מלה), #405 */
const spoken=s=>window.__fullSpell?window.__fullSpell(String(s).replace(/\d/g,d=>String.fromCharCode(0xE000+ +d))).replace(/[\uE000-\uE009]/g,c=>c.charCodeAt(0)-0xE000):plainHe(s);   /* digits stay digits: the voice worker reads them (gender, + − ×) */
/* text for the voice: keep the nikud (the voice layer turns it into full spelling) */
const spk=s=>String(s).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
/* #266 on a screen where Oren chooses, the voice names the choices: "א, ב, אוֹ ג." (the labels as shown, with nikud) */
/* The opening and every choice are separate clips (SEP, split by the core's ttsParts), each a fixed text,
   so pregen makes them all in advance: T.choiceList() is every such clip (talents' own + what each module registers). */
const SEP='\u2063',CHOICES=new Set(),lab=x=>spk(x).replace(/[.!?…:]+$/,'');
const addChoices=a=>a.forEach(x=>{x=lab(x);if(x){CHOICES.add(x);CHOICES.add('אוֹ '+x);}});
const addSay=a=>a.forEach(x=>{x=spk(x);if(x)CHOICES.add(x);});
const orList=a=>{a=[...new Set(a.map(lab).filter(Boolean))];if(a.length>1)a[a.length-1]='אוֹ '+a[a.length-1];return a.length?SEP+a.join(SEP):'';};
const choiceList=()=>{addChoices(BUILD.map(b=>b.name).concat(Object.values(ACT).map(a=>a.name),GROUPS.map(g=>g.n)));
  addSay(GROUPS.map(g=>g.n+'.').concat(BUILD.map(b=>b.name+(b.blurb?'. '+b.blurb:''))));return [...CHOICES];};
const choiceSay=(root,sel)=>root?orList([...root.querySelectorAll(sel)].filter(x=>!x.closest('[hidden]')).map(x=>x.textContent)):'';
/* #435 a question that does not test reading (a flag per activity: T.quiz o.readAns, default: not a reading id): after the question the
   voice reads the answers one by one ("א, ב, אוֹ ג", each its own clip, as on the choice screens), the answer being said is lit (.rdlit).
   ansSay(row,labels) marks the row (data-ra) and returns the clips to put after the question; '' when an answer has no word or number
   (a picture): then nothing is read or lit. The light follows the voice (the core's 'vpart' at each clip) and goes out when it ends or is hushed. */
const READ_ACT=/^(read-|story-|rb2-|nik-|snd-|eng-)/;
const raN=s=>spk(s).replace(/[\u0591-\u05C7]/g,'').replace(/^או\s+/,'').replace(/[^\p{L}\p{N}]+/gu,'');
const ansSay=(row,a)=>{a=(a||[]).map(lab);if(O.readHelp&&!O.readHelp().ans)return '';/* #613 the parent may turn it off */if(!row||a.length<2||!a.every(x=>/[א-ת0-9]/.test(x)))return '';row.dataset.ra=1;return orList(a);};
const unlit=()=>document.querySelectorAll('.chb.rdlit').forEach(b=>b.classList.remove('rdlit'));
O.on('vpart',t=>{const k=raN(t);if(!k)return unlit();document.querySelectorAll('.chs[data-ra] .chb').forEach(b=>b.classList.toggle('rdlit',raN(b.textContent)===k));});
O.on('voice',on=>{if(!on)unlit();});
addChoices([...Array(101).keys()].map(String));   /* number answers (word math, number series): every clip in pregen */

/* ---------- extra pixel sprites ---------- */
const P=(rows,pal)=>sprite(rows,pal);
const X={
  sun:P(['Y...Y...Y','.Y.YYY.Y.','..YYYYY..','.YYOOOYY.','YYOOOOOYY','.YYOOOYY.','..YYYYY..','.Y.YYY.Y.','Y...Y...Y'],{Y:'#ffcf4d',O:'#ffe27a'}),
  moon:P(['..MMMM..','.MMMM...','MMMM....','MMM.....','MMM.....','MMMM....','.MMMM...','..MMMM..'],{M:'#fff1a8'}),
  ball:P(['..BBRR..','.BBBRRR.','BBBWWRRR','BBWWWWRR','YYWWWWGG','YYYWWGGG','.YYYGGG.','..YYGG..'],{B:'#3a8fc4',R:'#e4572e',Y:'#ffd166',G:'#4fae4f',W:'#ffffff'}),
  car:P(['...RRRRR....','..RWWRWWR...','.RRRRRRRRRR.','RRRRRRRRRRRR','RRRRRRRRRRRY','.KK.....KK..','.KK.....KK..'],{R:'#e4572e',W:'#bfe6f5',K:'#2b2b2b',Y:'#ffd166'}),
  bird:P(['....BB...','...BBBB..','..BBKBBOO','BBBBBBB..','.BBBBBB..','..BBBB...','...O.O...'],{B:'#3a8fc4',K:'#1d2631',O:'#f28c28'}),
  cake:P(['...RR...','.IIIIII.','IIPIIPII','BBBBBBBB','PPPPPPPP','BBBBBBBB','BBBBBBBB'],{R:'#e63946',I:'#ffffff',P:'#ff9cc2',B:'#c68b59'}),
  apple:P(['....S...','...SGG..','.RRRRRR.','RrRRRRRR','RrRRRRRR','RRRRRRRR','.RRRRRR.','..RR.RR.'],{S:'#6b4423',G:'#52b788',R:'#e63946',r:'#ff9a9a'}),
  fish:P(['..BBBB..B','.BbbbbBBB','BEbbbbbB.','BbbbbbbB.','.BbbbbBBB','..BBBB..B'],{B:'#3d8fd1',b:'#8cc8f2',E:'#1b1b1b'}),
  bookS:P(['.RRRRRR.','RRRRRRRW','RRYYRRRW','RRRRRRRW','RRRRRRRW','RRRRRRRW','RRRRRRRW','.RRRRRRW'],{R:'#c0392b',Y:'#ffd166',W:'#fffaf0'}),
  hat:P(['...BBBB...','...BBBB...','...BBBB...','...RRRR...','BBBBBBBBBB','.BBBBBBBB.'],{B:'#2b2b3a',R:'#e4572e'}),
  boat:P(['.....W......','.....WW.....','.....WWW....','.....WWWW...','.....P......','BBBBBBBBBBBB','.BBBBBBBBBB.','..BBBBBBBB..'],{W:'#ffffff',P:'#5a5f66',B:'#94613a'}),
  key:P(['.YYY......','Y...Y.....','Y...YYYYYY','Y...Y..Y.Y','.YYY......'],{Y:'#e9b949'}),
  heart:P(['.RR.RR.','RRRRRRR','RRRRRRR','.RRRRR.','..RRR..','...R...'],{R:'#e4572e'}),
  cup:P(['BBBBBB..','BBBBBBBB','BBBBBB.B','BBBBBB.B','BBBBBBBB','BBBBBB..','.BBBB...'],{B:'#3a8fc4'}),
  egg:P(['..WW..','.WWWW.','.WWWW.','WWWWWW','WWWWWW','WWWWWW','.WWWW.','..WW..'],{W:'#fffaf0'}),
  shoe:P(['..RR......','..RRR.....','..RRRRRR..','RRRRRRRRRR','WWWWWWWWWW'],{R:'#e4572e',W:'#ffffff'}),
  cloud:P(['...WWW....','..WWWWW.W.','..WWWWWWW.','.WWWWWWWWW','WWWWWWWWWW','.WWWWWWWW.'],{W:'#ffffff'}),
  log:P(['.BBBBBBBB.','BbBBBBBBRR','BBBBBBBBRr','BbBBBBBBRR','.BBBBBBBB.'],{B:'#94613a',b:'#6b4423',R:'#e9c8a0',r:'#c8925a'}),
  stone:P(['..SSSS..','.SSsSSS.','SSSSSSsS','SsSSSSSS','.SSSSSS.'],{S:'#8d939a',s:'#b9bfc5'}),
  leaf:P(['.....GG','...GGGG','..GGgGG','.GGgGG.','GGgGG..','.GG....','G......'],{G:'#4fae4f',g:'#8acb68'}),
  coin:P(['.YYYY.','YYyyYY','YyYYyY','YyYYyY','YYyyYY','.YYYY.'],{Y:'#e9b949',y:'#fff1a8'}),
  nail:P(['SSSSS','..S..','..S..','..S..','..S..','..S..','...S.'],{S:'#6b737a'}),
  cork:P(['.CCCC.','CcCCcC','CCCCCC','CcCCcC','.CCCC.'],{C:'#c8925a',c:'#94613a'}),
  clip:P(['.SSSS.','S....S','S.SS.S','S.S..S','S.S..S','S.SSSS','S.....','.SSSSS'],{S:'#9aa1a8'}),
  screw:P(['SSSSS','SKSKS','.SSS.','.SKS.','.SSS.','.SKS.','..S..'],{S:'#9aa1a8',K:'#5a5f66'}),
  pencil:P(['......Pk','.....PPP','....YYP.','...YYY..','..YYY...','.WYY....','WW......'],{P:'#ff9cc2',k:'#a24b6e',Y:'#ffd166',W:'#e9c8a0'}),
  magnet:P(['RR..BB','RR..BB','RR..BB','RR..BB','RRRRBB','.RRRB.'],{R:'#e4572e',B:'#3a8fc4'}),
  note:P(['....KKK','....K.K','....K..','....K..','.KKKK..','KKKKK..','.KKK...'],{K:'#23303b'}),
  flask:P(['..GG..','..GG..','..GG..','.GGGG.','GGLLGG','GLLLLG','GLLLLG','.GGGG.'],{G:'#9aa1a8',L:'#7cc35f'}),
  palette:P(['..WWWW..','.WRWWBW.','WWWWWWWW','WYWWWWW.','WWWGW...','.WWWW...'],{W:'#e9c8a0',R:'#e4572e',B:'#3a8fc4',Y:'#ffd166',G:'#4fae4f'}),
  puzzle:P(['..PP....','PPPPPP..','PPPPPPGG','.PPPPGGG','.PPPGGGG','..PPGGG.','....GG..'],{P:'#8e6fd1',G:'#3cc8bb'}),
  globe:P(['..BBBB..','.BGGBBB.','BGGGBBGB','BBGBBGGB','BBBBGGBB','BGBBBGBB','.BBGBBB.','..BBBB..'],{B:'#3a8fc4',G:'#4fae4f'}),
  keys:P(['KKKKKKKKKK','KWKWKWKWKK','KKKKKKKKKK','KWKWKWKWKK','KKKKKKKKKK','KWWWWWWWKK','KKKKKKKKKK'],{K:'#5a5f66',W:'#f4e4c1'}),
  abc:P(['.RR.BBB..GG','R..RB..BG..','RRRRBBB.G..','R..RB..BG..','R..RBBB..GG'],{R:'#e4572e',B:'#3a8fc4',G:'#4fae4f'}),
  jar:P(['.KKKKKK.','KCCCCCCK','.K....K.','K......K','K......K','K......K','K......K','.KKKKKK.'],{K:'#5a7f9a',C:'#c8925a'}),
  pen:P(['......K','.....KY','....KYY','...KYY.','..KYY..','.PYY...','PP.....'],{K:'#23303b',Y:'#3a8fc4',P:'#23303b'}),
  portal:P(['..PPPPPP..','.PppppppP.','PpPPPPPPpP','PpPyyyyPpP','PpPyYYyPpP','PpPyYYyPpP','PpPyyyyPpP','PpPPPPPPpP','.PppppppP.','..PPPPPP..'],{P:'#6c4fc1',p:'#b48cf2',y:'#ffd166',Y:'#fff1a8'})
};
const ALLSPR=k=>X[k]||SPR[k]||'';
const FACE=(rows,col)=>sprite(rows,{Y:col||'#ffd166',K:'#1d2631',R:'#e4572e',B:'#3a8fc4'});
const FACES={
  happy:{n:'שָׂמֵחַ',s:FACE(['...YYYY...','.YYYYYYYY.','.YYYYYYYY.','YYYKYYKYYY','YYYKYYKYYY','YYYYYYYYYY','YYKYYYYKYY','.YYKKKKYY.','.YYYYYYYY.','...YYYY...'])},
  calm:{n:'רָגוּעַ',s:FACE(['...YYYY...','.YYYYYYYY.','.YYYYYYYY.','YYYYYYYYYY','YYKKYYKKYY','YYYYYYYYYY','YYYYYYYYYY','.YYKKKKYY.','.YYYYYYYY.','...YYYY...'],'#a8e0c0')},
  excited:{n:'נִרְגָּשׁ',s:FACE(['...YYYY...','.YYYYYYYY.','.YKKYYKKY.','YYKKYYKKYY','YYYYYYYYYY','YYYKKKKYYY','YYYKRRKYYY','.YYKKKKYY.','.YYYYYYYY.','...YYYY...'],'#ffcf4d')},
  tired:{n:'עָיֵף',s:FACE(['...YYYY...','.YYYYYYYY.','.YYYYYYYY.','YYYYYYYYYY','YKKKYYKKKY','YYYYYYYYYY','YYYYYYYYYY','.YYYKKYYY.','.YYYYYYYY.','...YYYY...'],'#c9c3e6')},
  sad:{n:'עָצוּב',s:FACE(['...YYYY...','.YYYYYYYY.','.YYYYYYYY.','YYYKYYKYYY','YYYKYYKYYY','YYBYYYYYYY','YYYKKKKYYY','.YKYYYYKY.','.YYYYYYYY.','...YYYY...'],'#9ccdf5')},
  angry:{n:'כּוֹעֵס',s:FACE(['...YYYY...','.YYYYYYYY.','.YKYYYYKY.','YYYKYYKYYY','YYYKYYKYYY','YYYYYYYYYY','YYYKKKKYYY','.YKYYYYKY.','.YYYYYYYY.','...YYYY...'],'#ff8a5c')}
};

/* ---------- shared UI ---------- */
let KEY=null;
addEventListener('keydown',e=>{if($('#sTal').hidden||!KEY||!$('#ov').hidden||!$('#dlg').hidden)return;KEY(e);});
const hudT=(title,extra='')=>O.hud(`<div class="chip">${title}</div>${extra}`);
const progressBar=(i,n)=>`<div class="progress">${Array.from({length:n},(_,k)=>`<i class="pb${k<i?' on':k===i?' cur':''}"></i>`).join('')}</div>`;
const starsHTML=st=>`<div class="stars">${[0,1,2].map(k=>`<span style="animation-delay:${.3+k*.35}s">${k<st?SPR.star:SPR.starOff}</span>`).join('')}</div>`;
function record(id,st,extra){const s=S();const c=s.tl[id]||{s:0,n:0,b:0};c.s=Math.max(c.s|0,st|0);c.n=(c.n|0)+1;if(extra&&extra.b!=null)c.b=Math.max(c.b|0,extra.b|0);s.tl[id]=c;dailyMark(id);O.persist();O.emit('tlDone',id,st|0);}
function result(o){const ov=$('#ov');ov.hidden=false;
  ov.innerHTML=`<div class="card"><h2>${o.title||'כָּל הַכָּבוֹד!'}</h2>${o.sub?`<div class="sub">${o.sub}</div>`:''}${o.stars!=null?starsHTML(o.stars):''}${o.gems?`<div class="gain">+${o.gems} ${SPR.gem}</div>`:''}${o.extra||''}</div>`;
  const row=h('div','btnrow');if(o.again){const a=h('button','bigbtn plain sm',ICON.redo+'<span>שׁוּב</span>');a.onclick=()=>{ov.hidden=true;o.again();};row.appendChild(a);}
  const b=h('button','bigbtn',ICON.play+'<span>הַמְשֵׁךְ</span>');b.onclick=()=>{ov.hidden=true;o.back();};row.appendChild(b);ov.firstChild.appendChild(row);
  O.celebrate(ov.firstChild);/* #427 one fixed 2 s celebration; the big one only at a chapter end (story.js) */if(window.FRIEND)setTimeout(()=>window.FRIEND.stepCheck(),0);setTimeout(()=>b.focus(),300);}
function finishAct(id,errors,n,gems,back,again,title){const st=errors<=Math.max(1,n*.1)?3:errors<=Math.max(3,n*.3)?2:1;const bonus=5+st*2;O.addGems(bonus);record(id,st);result({title,stars:st,gems:gems+bonus,back,again});}
/* generic multiple-choice quiz: q = {pr, opts, ans, cls, ltr, play, auto, reveal(el), explain, key, bank, bkey}
   q.bank: the item comes from a finite bank — its first answer is recorded there (LEARN.seen, key q.bkey or q.key; #360).
   o.pool: the generator draws from a finite list — the quiz keeps its own bank 'tq-<id>' and lets the learning engine choose (wrong ones back on schedule).
   o.end(err): called once after the last question, before the result.
   o.lesson: lesson card id(s) (lessoncard.js, #258) shown before the first questions, once; a "show me again" button on the screen. */
/* #395 quiet adaptive difficulty: these path missions use the skill model (learn.js, skill 'a:<id>'). The level is the number of
   answer choices minus 1; its top is today's difficulty. Two wrong first answers in a row → the next questions have one choice less
   (never below 2), with no message or sound. Each first answer is recorded; the end of the round sets the level for next time. */
const ADAPT={'world-flag':2,'world-ani':2,'world-il':2,'sci-body':2,'sci-animals':3};
function quiz(o){if(o.lesson&&window.LESSONS&&!o._ls){o._ls=1;return window.LESSONS.first(o.lesson,o.back,()=>quiz(o));}const qs=[],seen=new Set();let t=0;const LN=window.LEARN,pb=o.pool&&LN&&LN.pickItem?'tq-'+o.id:null;
  const ask=ADAPT[o.id]&&LN&&LN.state?'a:'+o.id:null;let lv=0,wr=0;
  /* the first adaptive round starts at the top: an older star level in the same skill (noteAct, 1..5) is ignored (q = adaptive since) */
  if(ask)try{const mx=ADAPT[o.id],k0=LN.state().k[ask],first=!k0||!k0.q;LN.setMax(ask,mx);lv=LN.start(ask,first?mx:1);const k=LN.state().k[ask];
    if(first&&!k.lk)lv=mx;lv=Math.max(1,Math.min(mx,lv|0));k.l=lv;k.q=1;}catch(e){lv=0;}
  /* fewer choices: keep the right one and the first lv distractors of a fixed random order (so each step down removes one more) */
  const fit=q=>{if(!lv)return q;if(!q._all){const ds=q.opts.map((_,k)=>k).filter(k=>k!==q.ans);q._all={opts:q.opts.slice(),ans:q.ans,ds:shuffle(ds)};}
    const A=q._all,keep=new Set([A.ans,...A.ds.slice(0,lv)]);q.opts=A.opts.filter((_,k)=>keep.has(k));q.ans=q.opts.indexOf(A.opts[A.ans]);return q;};
  const note=(q,ok)=>{if(!ask||q._n)return;q._n=1;try{LN.record(ask,ok,true,Date.now()-(q._t||Date.now()));}catch(e){}
    if(ok){wr=0;return;}if(++wr>=2&&lv>1){lv--;wr=0;for(let j=i+1;j<qs.length;j++)fit(qs[j]);}};
  const gen=()=>{const q=o.gen(qs.length);if(!pb||q.bank||q.key==null)return q;const c=[q];for(let j=0;j<24;j++){const x=o.gen(qs.length);if(x.key!=null&&!c.some(y=>y.key===x.key))c.push(x);}
    try{const r=LN.pickItem(pb,c.filter(x=>!seen.has(x.key)).map(x=>({k:x.key})));const x=r&&c.find(y=>y.key===r.item.k);if(x)return Object.assign(x,{bank:pb});}catch(e){}return q;};
  const nQ=pathN(o.n);while(qs.length<nQ&&t++<400){const q=gen();const k=q.key||(q.pr+'|'+q.ans);if(seen.has(k))continue;seen.add(k);qs.push(fit(q));}
  let i=0,err=0,gems=0,lock=false,tries=0,HB=null;const RA=o.readAns!=null?!!o.readAns:!READ_ACT.test(o.id);O.setScreen('sTal',o.bg||'valley',o.back);
  const bk=O.hereTake&&O.hereTake('tq:'+o.id);if(bk){i=Math.min(Math.max(0,bk.i|0),qs.length-1);err=bk.err|0;gems=bk.gems|0;}/* #44: reopened mid-quiz = the same place */
  const s=$('#sTal');s.innerHTML='';const wrap=h('div','tq');s.appendChild(wrap);if(o.lesson&&window.LESSONS)s.appendChild(window.LESSONS.againBtn(o.lesson,o.back,()=>quiz(o)));
  const render=()=>{const q=qs[i];q._t=Date.now();tries=0;lock=false;if(O.hereProg)O.hereProg('tq:'+o.id,{i,err,gems});if(O.evQ)O.evQ(q.key||(plainHe(String(q.pr))+'|'+q.ans),{m:o.id});hudT(o.title,progressBar(i,qs.length));const tOps=q.opts.map(x=>plainHe(String(x))).filter(x=>/[א-ת]/.test(x));const row=h('div','chs'+(q.ltr?' ltr':''));const ra=RA?ansSay(row,q.opts):'';
    O.sayNow=(q.say||spoken(q.pr))+(ra||(!q.say&&tOps.length===q.opts.length&&!(O.readHelp&&!O.readHelp().ans)?'. '+tOps.join(', '):''));
    wrap.innerHTML='';const card=h('div','prq tqc',q.pr);if(q.play){const pb=h('button','hintbtn',ICON.say+`<span>${q.playLbl||'הַשְׁמַע'}</span>`);pb.onclick=q.play;card.appendChild(pb);}
    wrap.appendChild(card);window.__noAuto=0;if(window.FRIEND)window.FRIEND.question(q,card,{id:o.id,i});if(window.TAL.rdQ)window.TAL.rdQ(q,card,{read:/^(read-|story-|rb2-)/.test(o.id)});q.opts.forEach((op,k)=>{const b=h('button','chb '+(q.cls||''),op);b.onclick=()=>{if(!(O.tapTooSoon&&O.tapTooSoon()))pickA(k,b);};row.appendChild(b);});wrap.appendChild(row);
    const ex=h('div','hintbox');ex.hidden=true;wrap.appendChild(ex);card.classList.add('flashin');
    /* #54 one help button: clue, then the answer with its explanation (the question ends like after two mistakes) */
    HB=window.HELP&&HELP.mc?HELP.mc(wrap,{row,ans:q.ans,clue:q.clue,explain:q.explain,before:ex,reveal:()=>{if(lock)return;lock=true;err++;note(qs[i],false);if(window.FRIEND)window.FRIEND.onWrong({final:true,m:o.id});if(q.reveal)q.reveal(wrap.querySelector('.tqc'));setTimeout(next,D(4200));}}):null;if(o.side){const sb=h('button','bigbtn plain sm qside',o.side.lbl);sb.onclick=()=>o.side.open(wrap);wrap.appendChild(sb);}if(q.auto&&q.play)setTimeout(()=>{if(qs[i]===q)q.play();},D(350));};
  const resolve=(q)=>{const ex=wrap.querySelector('.hintbox');if(q.explain){ex.hidden=false;ex.innerHTML=`<div class="cap">${q.explain}</div>`;}if(q.reveal)q.reveal(wrap.querySelector('.tqc'));};
  function pickA(k,b){if(lock||b.disabled)return;const q=qs[i];if(O.evAns)O.evAns(k===q.ans,{m:o.id,tr:tries,x:k});if(!tries){note(q,k===q.ans);O.emit('tq',o.id,k===q.ans);if(q.bank&&window.LEARN)try{window.LEARN.seen(q.bank,q.bkey!=null?q.bkey:q.key,k===q.ans,false);}catch(e){}}
    if(k===q.ans){if(window.TAL.rdA)window.TAL.rdA(q,tries,b);lock=true;if(window.FRIEND)window.FRIEND.onCorrect({tries,m:o.id});b.classList.add('ok');sfx.ok(i);const g=tries||(HB&&HB.step)?1:2;gems+=g;O.addGems(g,b);O.floatText(b,'+'+g);resolve(q);setTimeout(next,D(q.explain||q.reveal?2300:1000));return;}
    tries++;err++;b.classList.add('bad');b.disabled=true;sfx.no();if(o.onWrong)o.onWrong();const fin=tries>=2||q.opts.length<=2;if(window.FRIEND)window.FRIEND.onWrong({final:fin,m:o.id});
    if(fin){lock=true;const c=wrap.querySelector('.chs').children[q.ans];c.classList.add('show');if(HB&&HB.el.isConnected){HB.answer();if(q.reveal)q.reveal(wrap.querySelector('.tqc'));}else resolve(q);setTimeout(next,D(HB?4200:2600));}}
  function next(){if(!wrap.isConnected)return;i++;if(i>=qs.length){KEY=null;if(ask)try{LN.done(ask);}catch(e){}if(o.end)try{o.end(err);}catch(e){}finishAct(o.id,err,qs.length,gems,o.back,()=>quiz(o),o.doneTitle);}else render();}
  KEY=e=>{if(wrap.hidden)return;if(/^[1-9]$/.test(e.key)){const b=wrap.querySelector('.chs')&&wrap.querySelector('.chs').children[+e.key-1];if(b)b.click();}};
  window.__quiz={get ans(){return qs[i]&&qs[i].ans;},get i(){return i;},get wrap(){return wrap;}};
  render();}

/* ---------- buildings & activities registry ---------- */
const BUILD=[];const ACT={};
function building(b){BUILD.push(b);b.acts.forEach(a=>{ACT[a.id]=a;a.b=b;});}
const touchOnly=()=>matchMedia('(pointer:coarse)').matches&&!matchMedia('(any-pointer:fine)').matches;
const bState=b=>(b.needsKeys&&touchOnly())?'off':window.TAL_bState?window.TAL_bState(b):(S().set.hide[b.id]?'off':'on');
const actOff=id=>!!(S().set.offA||{})[id];
function actStars(id){return (S().tl[id]||{}).s|0;}
const GROUPS=[{id:'readg',n:'קוֹרְאִים וְכוֹתְבִים',e:'📖',c:'#c0392b',ids:['read','write','stories','eng']},{id:'explore',n:'חוֹקְרִים וְחוֹשְׁבִים',e:'🔬',c:'#3cb371',ids:['lab','world','think','code']},{id:'create',n:'יוֹצְרִים',e:'🎨',c:'#ff7eb6',ids:['art','music','type']},{id:'calm',n:'נִרְגָּעִים',e:'🍃',c:'#7cc3a0',ids:['mind']}];
const groupOf=b=>GROUPS.find(g=>g.ids.includes(b.id))||GROUPS[GROUPS.length-1];
const visB=g=>g.ids.map(id=>BUILD.find(b=>b.id===id)).filter(b=>b&&bState(b)!=='off');
const bStars=b=>[b.acts.reduce((a,x)=>a+actStars(x.id),0),b.acts.length*3];
function bldCard(b,back){const bs=bState(b);const [got,max]=bStars(b);
  const c=h('button','wcard2 bld',`<span class="ico">${b.icon()}</span><span class="nm">${b.name}</span><span class="bar"><i style="width:${got/max*100}%"></i></span>`);c.style.setProperty('--lc',b.color);
  if(bs!=='on'){c.classList.add('lockb');c.appendChild(h('span','cnt','🔒 '+bs.lock));c.onclick=()=>{sfx.no();window.TAL_locked&&window.TAL_locked(b);};}else c.onclick=()=>{sfx.pop(2);openBuilding(b);};return c;}
/* level 1: four big doors */
function openHub(){KEY=null;PATH=0;O.setScreen('sTal','valley',O.showMap);O.hud(`<div class="starcount">${SPR.star}<span>${Object.values(S().tl).reduce((a,c)=>a+(c.s|0),0)}</span></div>`);
  const s=$('#sTal');s.innerHTML='';
  s.appendChild(h('div','whead',`<span class="gd bob">${X.portal}</span><h1>עִיר הַכִּשְׁרוֹנוֹת</h1>`));
  const g4=h('div','gdoors');
  GROUPS.forEach(g=>{const bs=visB(g);if(!bs.length)return;const anyNew=bs.some(b=>bState(b)==='on');
    const c=h('button','gdoor'+(anyNew?'':' lockb'),`<span class="gem2">${g.e}</span><b>${g.n}</b>`);
    c.style.setProperty('--gc',g.c);c.onclick=()=>{sfx.pop(3);const on=bs.filter(b=>bState(b)==='on');if(bs.length===1&&on.length===1)openBuilding(bs[0]);else openGroup(g);};g4.appendChild(c);});
  s.appendChild(g4);O.sayNow='עִיר הַכִּשְׁרוֹנוֹת. מָה נְשַׂחֵק?'+choiceSay(g4,'.gdoor b');O.emit('hub',s);}
/* level 2: just the buildings of one door */
function openGroup(g){KEY=null;PATH=0;O.setScreen('sTal','valley',openHub);O.hud('');const s=$('#sTal');s.innerHTML='';
  s.appendChild(h('div','whead',`<span class="gd">${g.e}</span><h1>${g.n}</h1>`));const grid=h('div','hub gsub');visB(g).forEach(b=>grid.appendChild(bldCard(b)));s.appendChild(grid);O.sayNow=spk(g.n)+'.'+choiceSay(grid,'.nm');O.emit('group',s,g);}
/* the activities a building shows: the ones already tried + new ones up to 4 (at least one new), so the rest open gradually; the parent's "all open" shows them all */
function menuActs(b){const list=b.acts.filter(a=>(!a.avail||a.avail())&&!actOff(a.id)&&!a.noMenu);if(S().set.all)return list;
  const tried=a=>!!(S().tl[a.id]||{}).n;let k=Math.max(1,4-list.filter(tried).length);return list.filter(a=>tried(a)||k-->0);}
function openBuilding(b){KEY=null;PATH=0;const gg=groupOf(b);const up=visB(gg).length>1?()=>openGroup(gg):openHub;const ma=menuActs(b);
  if(ma.length===1){ma[0].run(up);return;}/* #8: a building with one activity opens it straight away (no extra tap) */
  O.setScreen('sTal',b.bg,up);O.hud('');const s=$('#sTal');s.innerHTML='';
  s.appendChild(h('div','whead',`<span class="gd">${b.icon()}</span><h1>${b.name}</h1>`));
  const grid=h('div','acts');
  ma.forEach(a=>{const st=actStars(a.id);const c=h('button','actc',`<span class="ai">${a.icon()}</span><span class="an">${a.name}</span><span class="st">${[0,1,2].map(k=>k<st?SPR.star:SPR.starOff).join('')}</span>`);
    c.onclick=()=>{sfx.pop(2);a.run(()=>openBuilding(b));};grid.appendChild(c);});
  s.appendChild(grid);const say=spk(b.name+(b.blurb?'. '+b.blurb:''))+choiceSay(grid,'.an');O.sayNow=say;if(b.blurb)setTimeout(()=>{if(grid.isConnected)O.say(say);},D(400));}

/* ---------- daily missions ---------- */
/* #358 variety: all stories are one activity; the topic is the building (the journey and the math drills are 'math', together/home missions their kind) */
const kindOf=id=>/^story-/.test(id)?'story':id;
const topicOf=id=>id==='math'||/^ln-/.test(id)?'math':ACT[id]?ACT[id].b.id:String(id).split(':')[0];
/* may mission id come after seq (the day's missions so far)? not the same activity as the last one, not a 3rd of one topic in a row, not a 3rd of one activity today */
function fits(seq,id){const n=seq.length,k=kindOf(id),tp=topicOf(id);
  if(n&&kindOf(seq[n-1])===k)return false;
  if(n>=2&&topicOf(seq[n-1])===tp&&topicOf(seq[n-2])===tp)return false;
  return seq.filter(x=>kindOf(x)===k).length<2;}
/* the new missions st after seq, in their order where they fit; a mission that does not fit is swapped for one from more() that does; nothing fits → it stays (repeat only when nothing else) */
function vary(seq,st,more){const out=[],left=st.slice();let extra=null;
  while(left.length){const cur=seq.concat(out);const j=left.findIndex(x=>fits(cur,x));if(j>=0){out.push(left.splice(j,1)[0]);continue;}
    extra=extra||(more?more():[]).slice();const k=extra.findIndex(x=>!cur.includes(x)&&!left.includes(x)&&fits(cur,x));
    out.push(k>=0?extra.splice(k,1)[0]:left[0]);left.shift();}
  return out;}
const fitPick=(seq,pool)=>{const f=pool.filter(x=>fits(seq,x));return pick(f.length?f:pool);};
/* #394 long: open-ended, can't be a short scene (free drawing, a full chess game): building only, never on the path */
const dailyPool=()=>Object.keys(ACT).filter(id=>bState(ACT[id].b)==='on'&&!actOff(id)&&!ACT[id].noDaily&&!ACT[id].long&&(!ACT[id].avail||ACT[id].avail()));
/* the day's path: t = steps ('math', an activity id, 'tog:<k>' together, 'rw:<k>' real-world), ch = how it was formed (a domain Oren chose, or 'plan').
   No path until Oren answers "what do you feel like today?" (or the parent's template builds it). cr = real-world missions waiting for the path. */
function dailyEnsure(){const s=S();if(s.daily&&s.daily.d===today()){const d=s.daily,pool=dailyPool();d.cr=d.cr||[];for(let i=0;i<d.t.length;i++)if(d.t[i]!=='math'&&!/:/.test(d.t[i])&&!d.done[i]&&!pool.includes(d.t[i])&&!(ACT[d.t[i]]&&ACT[d.t[i]].inPath&&ACT[d.t[i]].inPath())){const alt=pool.filter(x=>!d.t.includes(x));if(alt.length)d.t[i]=fitPick(d.t.slice(0,i),alt);}return d;}
  const prev=s.daily;const cr=prev?[...(prev.cr||[]),...prev.t.filter((x,i)=>/^rw:/.test(x)&&!prev.done[i]),...(prev.tm||[]).filter(x=>x==='math'||ACT[x])]:[];   /* #359: tm = missions of a topic the parent put off to tomorrow */
  const plan=S().set.plan;let t=[];
  if(plan&&plan.length){const used=new Set();t=plan.map(sp=>{if(sp==='math')return 'math';if(String(sp).startsWith('act:')){const aid=sp.slice(4);if(ACT[aid]&&dailyPool().includes(aid)&&!used.has(aid)){used.add(aid);return aid;}sp='any';}const pool=dailyPool().filter(id=>!used.has(id)&&(sp==='any'||ACT[id].b.id===sp));const id=pool.length?fitPick([...used],pool):pick(dailyPool().filter(x=>!used.has(x)));used.add(id);return id||'math';}).concat(cr);}
  s.daily={d:today(),t,done:t.map(()=>0),claimed:0,ch:t.length?'plan':0,cr:t.length?[]:cr};O.persist();return s.daily;}
function dailyMark(id){const d=dailyEnsure();const i=d.t.indexOf(id);if(i>=0&&!d.done[i]){d.done[i]=1;}}
O.on('levelDone',(lv)=>{if(!lv||lv.type==='train')return;S().last={id:'math',d:today()};const d=dailyEnsure();const i=d.t.findIndex((x,k)=>x==='math'&&!d.done[k]);if(i>=0){d.done[i]=1;O.persist();}});
/* ---------- map integration ---------- */
O.on('map',m=>{const rs=m.querySelector('.reset');if(rs)rs.remove();if(window.TAL_noHome)return;m.querySelectorAll('.hello,.statline').forEach(e=>e.remove());m.querySelectorAll('.topbar .tool').forEach(t=>{if(/הַמַּמְלָכָה|הַגִּבּוֹר שֶׁלִּי/.test(t.textContent))t.remove();});});
O.on('kingdomScene',sc=>{if(!window.TAL_noHome&&!sc.querySelector('.kmine')){const r=h('div','kmine');const a=h('button','tool',`<span class="ti">${O.AV()}</span><span>הַגִּבּוֹר שֶׁלִּי</span>`);a.onclick=()=>O.studio(false,O.kingdom);r.append(a);sc.prepend(r);}const s=S();if(s.kpic!=null&&s.art[s.kpic]){const f=h('div','kpic',artSVG(s.art[s.kpic]));(sc.querySelector('.kmine')||sc).appendChild(f);}});

/* ---------- time tracking (body breaks, meals and topic switching live in health.js) ---------- */
let lastAct=Date.now(),session=0;
['pointerdown','keydown'].forEach(ev=>addEventListener(ev,()=>{lastAct=Date.now();},true));
/* every tick is saved (and so sent to the family save): the phone shows the full play time (#41) */
function timeTick(){if(O.paused||document.hidden||Date.now()-lastAct>60000||$('#hud').hidden)return;const s=S();const d=today();s.time[d]=(s.time[d]|0)+15;session+=15;if(window.DAYLOG&&window.DAYLOG.beat)window.DAYLOG.beat();O.persist();}
O.timeTick=timeTick;setInterval(timeTick,15000);
const breakTime=()=>window.HEALTH&&window.HEALTH.breakNow();

/* exports for other chunks */
window.TAL={ADAPT,ansSay,READ_ACT,pathN,pathOn:()=>{PATH=1;},get onPath(){return !!PATH;},fits,vary,spk,orList,choiceSay,choiceList,addChoices,addSay,openGroup,GROUPS,bState,dailyPool,S,X,ALLSPR,FACES,quiz,result,record,finishAct,building,ACT,BUILD,openHub,openBuilding,hudT,progressBar,starsHTML,plainHe,L_,nb,dailyEnsure,setKey:f=>{KEY=f;},get key(){return KEY;},breakTime,artSVG:(...a)=>artSVG(...a)};
function artSVG(str){return window.TAL_artSVG?window.TAL_artSVG(str):'';}

})();

/* ===== READING · ENGLISH · WORLD · STORIES ===== */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$,pick,shuffle,ICON,SPR}=O;const {X,ALLSPR,quiz,building}=T;const sfx=O.sfx,D=O.D;
const WORDS=[['חָתוּל',['חָ','תוּל'],'cat','cat'],['כֶּלֶב',['כֶּ','לֶב'],'dog','dog'],['דָּג',['דָּג'],'fish','fish'],['עֵץ',['עֵץ'],'tree','tree'],['פֶּרַח',['פֶּ','רַח'],'flower','flower'],
 ['שֶׁמֶשׁ',['שֶׁ','מֶשׁ'],'sun','sun'],['יָרֵחַ',['יָ','רֵחַ'],'moon','moon'],['כּוֹכָב',['כּוֹ','כָב'],'star','star'],['בַּיִת',['בַּ','יִת'],'hut','house'],['כַּדּוּר',['כַּ','דּוּר'],'ball','ball'],
 ['תַּפּוּחַ',['תַּ','פּוּחַ'],'apple','apple'],['מְכוֹנִית',['מְ','כוֹ','נִית'],'car','car'],['צִפּוֹר',['צִ','פּוֹר'],'bird','bird'],['עוּגָה',['עוּ','גָה'],'cake','cake'],['סֵפֶר',['סֵ','פֶר'],'bookS','book'],
 ['כּוֹבַע',['כּוֹ','בַע'],'hat','hat'],['סִירָה',['סִי','רָה'],'boat','boat'],['מַפְתֵּחַ',['מַפְ','תֵּחַ'],'key','key'],['לֵב',['לֵב'],'heart','heart'],['כּוֹס',['כּוֹס'],'cup','cup'],
 ['בֵּיצָה',['בֵּי','צָה'],'egg','egg'],['נַעַל',['נַ','עַל'],'shoe','shoe'],['דֶּגֶל',['דֶּ','גֶל'],'flag','flag'],['כִּבְשָׂה',['כִּבְ','שָׂה'],'sheep','sheep'],['דְּרָקוֹן',['דְּ','רָ','קוֹן'],'dragon','dragon'],
 ['קֶשֶׁת',['קֶ','שֶׁת'],'rainbow','rainbow'],['פָּנָס',['פָּ','נָס'],'lantern','lantern'],['עָנָן',['עָ','נָן'],'cloud','cloud'],['יַהֲלוֹם',['יַ','הֲ','לוֹם'],'gem','diamond']].map(([w,syl,spr,en])=>({w,syl,spr,en}));
T.WORDS=WORDS;
const pic=w=>`<span class="pic">${ALLSPR(w.spr)}</span>`;
const first=w=>w.w.replace(/[֑-ׇ]/g,'')[0];
const others=(w,n,f)=>shuffle(WORDS.filter(x=>x!==w&&(!f||f(x)))).slice(0,n);
const sayEn=t=>O.sayLang(t,'en');
/* sentences */
const SENT=[['הֶחָתוּל יָשֵׁן עַל הַכִּיסֵּא.','מִי יָשֵׁן?','cat',['dog','bird']],['הַכֶּלֶב רָץ אַחֲרֵי הַכַּדּוּר.','אַחֲרֵי מָה הַכֶּלֶב רָץ?','ball',['apple','car']],
 ['הַצִּפּוֹר עָפָה אֶל הָעֵץ.','לְאָן עָפָה הַצִּפּוֹר?','tree',['hut','boat']],['אוֹרֶן אוֹכֵל תַּפּוּחַ אָדֹם.','מָה אוֹרֶן אוֹכֵל?','apple',['cake','egg']],
 ['בַּלַּיְלָה רוֹאִים אֶת הַיָּרֵחַ.','מָה רוֹאִים בַּלַּיְלָה?','moon',['sun','rainbow']],['הַדָּג שׂוֹחֶה בַּיָּם.','מִי שׂוֹחֶה?','fish',['sheep','dragon']],
 ['אַבָּא קָנָה עוּגָה לְיוֹם הַהֻלֶּדֶת.','מָה אַבָּא קָנָה?','cake',['shoe','key']],['הַסִּירָה שָׁטָה עַל הַמַּיִם.','מָה שָׁט עַל הַמַּיִם?','boat',['car','ball']],
 ['בַּבֹּקֶר הַשֶּׁמֶשׁ זוֹרַחַת.','מָה זוֹרֵחַ בַּבֹּקֶר?','sun',['moon','cloud']],['נוֹעָה שָׂמָה כּוֹבַע עַל הָרֹאשׁ.','מָה נוֹעָה שָׂמָה עַל הָרֹאשׁ?','hat',['shoe','cup']],
 ['אַבָּא פָּתַח אֶת הַדֶּלֶת בְּמַפְתֵּחַ.','בַּמֶּה אַבָּא פָּתַח אֶת הַדֶּלֶת?','key',['flag','heart']],['הַכִּבְשָׂה אוֹכֶלֶת דֶּשֶׁא בַּשָּׂדֶה.','מִי אוֹכֵל דֶּשֶׁא?','sheep',['fish','bird']]];
function buildWord(back){const pool=shuffle(WORDS.filter(w=>w.syl.length>1)).slice(0,T.pathN(6));let i=0,err=0,gems=0;O.setScreen('sTal','city',back);
  const s=$('#sTal');const run=()=>{const w=pool[i];let k=0;T.hudT('בּוֹנִים מִלָּה',T.progressBar(i,pool.length));O.sayNow=T.spk(w.w);
    s.innerHTML='';const card=h('div','prq tqc',`${pic(w)}<div class="slots">${w.syl.map(()=>'<span class="slot2"></span>').join('')}</div>`);s.appendChild(card);
    const row=h('div','chs');shuffle(w.syl.map((x,ix)=>[x,ix])).forEach(([sy,ix])=>{const b=h('button','chb tx',sy);b.onclick=()=>{if(b.disabled)return;
      if(w.syl[k]===sy){const sl=card.querySelectorAll('.slot2')[k];sl.textContent=sy;sl.classList.add('on');b.disabled=true;b.classList.add('ok');k++;sfx.pop(k);
        if(k===w.syl.length){const g=2;gems+=g;O.addGems(g,card);sfx.ok(i);O.floatText(card,'+2');card.querySelector('.slots').classList.add('flash');O.say(T.spk(w.w));setTimeout(()=>{if(!card.isConnected)return;i++;if(i<pool.length)run();else T.finishAct('read-build',err,pool.length,gems,back,()=>buildWord(back));},D(1400));}}
      else{err++;sfx.no();b.classList.remove('shake');void b.offsetWidth;b.classList.add('shake');}};row.appendChild(b);});
    s.appendChild(row);s.appendChild(h('div','lsent','לוֹחֲצִים עַל הַהֲבָרוֹת לְפִי הַסֵּדֶר, מִיָּמִין לִשְׂמֹאל'));};run();}
let dict=null,dictChecked=false;
async function checkDict(){if(dictChecked)return dict;dictChecked=true;try{for(let i=0;i<20&&!(window.claude&&window.claude.use);i++)await new Promise(r=>setTimeout(r,100));if(window.claude&&window.claude.use)dict=await window.claude.use('dictation');}catch(e){dict=null;}return dict;}
checkDict();
function readAloud(back){T.needPerm&&T.needPerm('dictation','כְּדֵי לִקְרֹא בְּקוֹל צָרִיךְ אִשּׁוּר שֶׁל הוֹרֶה לַמִּיקְרוֹפוֹן.');const pool=shuffle(WORDS.slice()).slice(0,6);let i=0,ok=0;O.setScreen('sTal','city',back);const s=$('#sTal');
  const run=()=>{const w=pool[i];T.hudT('קוֹרְאִים בְּקוֹל',T.progressBar(i,pool.length));O.sayNow='לְחַץ עַל הַמִּיקְרוֹפוֹן וּקְרָא אֶת הַמִּלָּה.';s.innerHTML='';
    const card=h('div','prq tqc',`${pic(w)}<div class="bigw">${w.w}</div><div class="heard" id="heard">לְחַץ עַל הַמִּיקְרוֹפוֹן וּקְרָא אֶת הַמִּלָּה</div>`);s.appendChild(card);
    const row=h('div','btnrow');const mic=h('button','bigbtn blue','🎤 <span>אֲנִי קוֹרֵא</span>');const skip=h('button','bigbtn plain sm',ICON.skip+'<span>דַּלֵּג</span>');row.append(mic,skip);s.appendChild(row);
    const done=good=>{if(good){ok++;O.addGems(2,card);sfx.ok(i);O.floatText(card,'+2');}setTimeout(()=>{if(!card.isConnected)return;i++;if(i<pool.length)run();else{T.record('read-voice',ok>=5?3:ok>=3?2:1);T.result({title:'קָרָאתָ יָפֶה!',sub:`קָרָאתָ נָכוֹן ${ok} מִתּוֹךְ ${pool.length}`,stars:ok>=5?3:ok>=3?2:1,back,again:()=>readAloud(back)});}},D(1300));};
    skip.onclick=()=>done(false);
    mic.onclick=()=>{const d=dict;if(!d){$('#heard').textContent='הַמִּיקְרוֹפוֹן לֹא זָמִין כָּאן';return;}let fin='';
      try{d.onFinal(({text})=>{fin+=' '+text;});d.onPartial(({text})=>{$('#heard').textContent=text;});d.onState(({state})=>{if(state==='idle'){const said=T.plainHe(fin).replace(/[^א-ת]/g,''),want=T.plainHe(w.w).replace(/[^א-ת]/g,'');
          const good=said.includes(want);$('#heard').innerHTML=good?'✓ נָכוֹן!':`שָׁמַעְתִּי: ${T.plainHe(fin)||'...'} · נַסֵּה שׁוּב`;if(good)done(true);else sfx.no();}});
        d.start().catch(e=>{const c=String(e&&(e.code||e.reason||e.message)||e);$('#heard').textContent='הַמִּיקְרוֹפוֹן לֹא אֻשַּׁר';if(/not_granted|dismissed/.test(c)&&T.callParents)T.callParents('הַמִּיקְרוֹפוֹן צָרִיךְ אִשּׁוּר שֶׁל הוֹרֶה.');});$('#heard').textContent='מַקְשִׁיב...';setTimeout(()=>{try{d.stop();}catch(e){}},3500);}catch(e){$('#heard').textContent='הַמִּיקְרוֹפוֹן לֹא זָמִין כָּאן';}};};run();}
building({id:'read',name:'הַסִּפְרִיָּה',color:'#c0392b',bg:'city',icon:()=>X.bookS,blurb:'קוֹרְאִים מִלִּים וּמִשְׁפָּטִים עִם נִקּוּד.',acts:[
  {id:'read-first',name:'אוֹת רִאשׁוֹנָה',icon:()=>X.apple,run:back=>quiz({id:'read-first',title:'אוֹת רִאשׁוֹנָה',bg:'city',back,n:5,gen:()=>{const w=pick(WORDS);const f=first(w);const opts=shuffle([f,...shuffle([...new Set(WORDS.map(first))].filter(x=>x!==f)).slice(0,2)]);
     return {pr:`${pic(w)}<div class="qq">בְּאֵיזוֹ אוֹת מַתְחִילָה הַמִּלָּה?</div>`,opts,ans:opts.indexOf(f),cls:'tx big2',say:'באיזו אות מתחילה המילה?',word:w.w,explain:`<span class="bigw">${w.w}</span>`,key:w.w};}})},
  {id:'read-pw',name:'מִלָּה וּתְמוּנָה',icon:()=>X.cat||SPR.cat,run:back=>quiz({id:'read-pw',title:'אֵיזוֹ מִלָּה?',bg:'city',back,n:5,gen:()=>{const w=pick(WORDS);const opts=shuffle([w,...others(w,2)]);return {pr:`${pic(w)}<div class="qq">אֵיזוֹ מִלָּה מַתְאִימָה לַתְּמוּנָה?</div>`,opts:opts.map(x=>x.w),ans:opts.indexOf(w),cls:'tx',key:w.w};}})},
  {id:'read-wp',name:'תְּמוּנָה לַמִּלָּה',icon:()=>X.sun,run:back=>quiz({id:'read-wp',title:'אֵיזוֹ תְּמוּנָה?',bg:'city',back,n:5,gen:()=>{const w=pick(WORDS);const opts=shuffle([w,...others(w,3)]);return {pr:`<div class="bigw">${w.w}</div><div class="qq">אֵיזוֹ תְּמוּנָה מַתְאִימָה לַמִּלָּה?</div>`,opts:opts.map(pic),ans:opts.indexOf(w),cls:'picb',key:w.w};}})},
  {id:'read-build',name:'בּוֹנִים מִלָּה',icon:()=>X.puzzle,run:buildWord},
  {id:'read-sent',name:'קוֹרְאִים מִשְׁפָּט',icon:()=>X.bookS,run:back=>quiz({id:'read-sent',title:'קוֹרְאִים מִשְׁפָּט',bg:'city',back,n:5,gen:()=>{const [t,qq,a,ds]=pick(SENT);const opts=shuffle([a,...ds]);return {pr:`<div class="sent">${t}</div><div class="qq">${qq}</div>`,opts:opts.map(k=>`<span class="pic">${ALLSPR(k)}</span>`),ans:opts.indexOf(a),cls:'picb',key:t};}})},
  {id:'read-voice',name:'קוֹרְאִים בְּקוֹל',icon:()=>'<span style="font-size:34px">🎤</span>',avail:()=>!!dict,noDaily:true,run:readAloud}]});
/* English */
const EW=WORDS.filter(w=>w.en);
building({id:'eng',name:'אַנְגְּלִית',color:'#3a8fc4',bg:'sea',icon:()=>X.abc,blurb:'מִלִּים רִאשׁוֹנוֹת בְּאַנְגְּלִית. לוֹחֲצִים עַל הָרַמְקוֹל כְּדֵי לִשְׁמֹעַ.',acts:[
  {id:'eng-letter',name:'אוֹתִיּוֹת',icon:()=>X.abc,run:back=>quiz({id:'eng-letter',title:'אַנְגְּלִית: אוֹתִיּוֹת',bg:'sea',back,n:5,gen:()=>{const w=pick(EW);const L=w.en[0].toUpperCase();const opts=shuffle([w,...shuffle(EW.filter(x=>x.en[0]!==w.en[0])).slice(0,2)]);
     return {pr:`<div class="bigw ltr">${L} ${L.toLowerCase()}</div><div class="qq">אֵיזוֹ תְּמוּנָה מַתְחִילָה בָּאוֹת הַזֹּאת?</div>`,opts:opts.map(pic),ans:opts.indexOf(w),cls:'picb',play:()=>sayEn(L+'. '+w.en),auto:1,explain:`<span class="ltr bigw">${w.en}</span>`,key:L};}})},
  {id:'eng-word',name:'מִלִּים',icon:()=>X.ball,run:back=>quiz({id:'eng-word',title:'אַנְגְּלִית: מִלִּים',bg:'sea',back,n:5,gen:()=>{const w=pick(EW);const opts=shuffle([w,...others(w,2,x=>!!x.en)]);
     return {pr:`${pic(w)}<div class="qq">אֵיךְ אוֹמְרִים בְּאַנְגְּלִית?</div>`,opts:opts.map(x=>x.en),ans:opts.indexOf(w),cls:'en',ltr:1,play:()=>sayEn(w.en),explain:`<span class="ltr bigw">${w.en}</span> = ${w.w}`,key:w.en};}})},
  {id:'eng-listen',name:'מַקְשִׁיבִים',icon:()=>'<span style="font-size:34px">👂</span>',run:back=>quiz({id:'eng-listen',title:'אַנְגְּלִית: מַקְשִׁיבִים',bg:'sea',back,n:5,gen:()=>{const w=pick(EW);const opts=shuffle([w,...others(w,3,x=>!!x.en)]);
     return {pr:`<div class="qq">הַקְשֵׁב לַמִּלָּה וּבְחַר תְּמוּנָה</div>`,opts:opts.map(pic),ans:opts.indexOf(w),cls:'picb',play:()=>sayEn(w.en),auto:1,playLbl:'שׁוּב',explain:`<span class="ltr bigw">${w.en}</span> = ${w.w}`,key:w.en};}})}]});
/* World & Israel */
const FL={il:['יִשְׂרָאֵל','<rect width="60" height="40" fill="#fff"/><rect y="4" width="60" height="5" fill="#0038b8"/><rect y="31" width="60" height="5" fill="#0038b8"/><path d="M30 12 L37 24 L23 24Z M30 28 L23 16 L37 16Z" fill="none" stroke="#0038b8" stroke-width="1.8"/>'],
 jp:['יַפָּן','<rect width="60" height="40" fill="#fff"/><circle cx="30" cy="20" r="11" fill="#bc002d"/>'],fr:['צָרְפַת','<rect width="20" height="40" fill="#0055a4"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#ef4135"/>'],
 it:['אִיטַלְיָה','<rect width="20" height="40" fill="#009246"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#ce2b37"/>'],de:['גֶּרְמַנְיָה','<rect width="60" height="14" fill="#000"/><rect y="13" width="60" height="14" fill="#dd0000"/><rect y="26" width="60" height="14" fill="#ffce00"/>'],
 nl:['הוֹלַנְד','<rect width="60" height="14" fill="#ae1c28"/><rect y="13" width="60" height="14" fill="#fff"/><rect y="26" width="60" height="14" fill="#21468b"/>'],se:['שְׁוֶדְיָה','<rect width="60" height="40" fill="#006aa7"/><rect x="18" width="7" height="40" fill="#fecc00"/><rect y="16" width="60" height="7" fill="#fecc00"/>'],
 ch:['שְׁוַיְץ','<rect width="60" height="40" fill="#da291c"/><rect x="26" y="9" width="8" height="22" fill="#fff"/><rect x="19" y="16" width="22" height="8" fill="#fff"/>'],ua:['אוּקְרַאִינָה','<rect width="60" height="20" fill="#0057b7"/><rect y="20" width="60" height="20" fill="#ffd700"/>'],
 ie:['אִירְלַנְד','<rect width="20" height="40" fill="#169b62"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#ff883e"/>']};
const flag=k=>`<svg class="flagsvg" viewBox="0 0 60 40" aria-hidden="true">${FL[k][1]}</svg>`;
const ANI=[['קֶנְגּוּרוּ','אוֹסְטְרַלְיָה',['אֵירוֹפָּה','אַפְרִיקָה']],['קוֹאָלָה','אוֹסְטְרַלְיָה',['אַסְיָה','אֵירוֹפָּה']],['אַרְיֵה','אַפְרִיקָה',['אוֹסְטְרַלְיָה','אֵירוֹפָּה']],['גִ׳ירָפָה','אַפְרִיקָה',['אוֹסְטְרַלְיָה','אַנְטַארְקְטִיקָה']],
 ['פַּנְדָּה','אַסְיָה',['אַפְרִיקָה','אוֹסְטְרַלְיָה']],['טִיגְרִיס','אַסְיָה',['אוֹסְטְרַלְיָה','אֵירוֹפָּה']],['פִּינְגְּוִין קֵיסָרִי','אַנְטַארְקְטִיקָה',['אַסְיָה','אֵירוֹפָּה']],['לָאמָה','דְּרוֹם אֲמֶרִיקָה',['אַפְרִיקָה','אוֹסְטְרַלְיָה']],['עַצְלָן','דְּרוֹם אֲמֶרִיקָה',['אֵירוֹפָּה','אַסְיָה']]];
const ISR=[['מָה הָעִיר הַבִּירָה שֶׁל יִשְׂרָאֵל?','יְרוּשָׁלַיִם',['חֵיפָה','אֵילַת']],['אֵיזֶה יָם יֵשׁ בְּאֵילַת?','הַיָּם הָאָדֹם',['הַיָּם הַתִּיכוֹן','יָם הַמֶּלַח']],
 ['בְּאֵיזֶה יָם הַמַּיִם כָּל כָּךְ מְלוּחִים שֶׁאֶפְשָׁר לָצוּף בְּקַלּוּת?','יָם הַמֶּלַח',['הַיָּם הָאָדֹם','הַכִּנֶּרֶת']],['מָה הַצְּבָעִים שֶׁל דֶּגֶל יִשְׂרָאֵל?','כָּחֹל וְלָבָן',['אָדֹם וְלָבָן','יָרֹק וְצָהֹב']],
 ['הַכִּנֶּרֶת הִיא...','אֲגַם',['הַר','מִדְבָּר']],['אֵיזֶה מִדְבָּר יֵשׁ בִּדְרוֹם יִשְׂרָאֵל?','הַנֶּגֶב',['הַגָּלִיל','הַגּוֹלָן']],['הַחֶרְמוֹן הוּא...','הַר',['יָם','עִיר']]];
building({id:'world',name:'הָעוֹלָם וְיִשְׂרָאֵל',color:'#4fae4f',bg:'valley',icon:()=>X.globe,blurb:'דְּגָלִים, יַבָּשׁוֹת וְהָאָרֶץ שֶׁלָּנוּ.',acts:[
  {id:'world-flag',name:'דְּגָלִים',icon:()=>flag('il'),run:back=>quiz({id:'world-flag',pool:1,title:'דְּגָלִים',bg:'valley',back,n:5,gen:()=>{const ks=Object.keys(FL);const k=pick(ks);const opts=shuffle([k,...shuffle(ks.filter(x=>x!==k)).slice(0,2)]);return {pr:`${flag(k)}<div class="qq">שֶׁל אֵיזוֹ מְדִינָה הַדֶּגֶל?</div>`,opts:opts.map(x=>FL[x][0]),ans:opts.indexOf(k),cls:'tx',key:k};}})},
  {id:'world-ani',name:'אֵיפֹה הֵם גָּרִים?',icon:()=>X.globe,run:back=>quiz({id:'world-ani',lesson:'world-cont',pool:1,title:'אֵיפֹה הֵם גָּרִים?',bg:'valley',back,n:5,gen:()=>{const [a,c,ds]=pick(ANI);const opts=shuffle([c,...ds]);return {pr:`<div class="bigw">${a}</div><div class="qq">בְּאֵיזוֹ יַבֶּשֶׁת חַי בַּעַל הַחַיִּים הַזֶּה בַּטֶּבַע?</div>`,opts,ans:opts.indexOf(c),cls:'tx',key:a};}})},
  {id:'world-il',name:'הָאָרֶץ שֶׁלָּנוּ',icon:()=>flag('il'),run:back=>quiz({id:'world-il',pool:1,title:'הָאָרֶץ שֶׁלָּנוּ',bg:'valley',back,n:5,gen:()=>{const [q,a,ds]=pick(ISR);const opts=shuffle([a,...ds]);return {pr:`<div class="sent">${q}</div>`,opts,ans:opts.indexOf(a),cls:'tx',key:q};}})}]});
/* Bedtime stories */
const STORIES=[
 {t:'הַחֲתוּלָה וְהַכַּדּוּר הָאָדֹם',hw:[['הִתְגַּלְגֵּל','🌀'],['פָּנָס','🔦'],['חֹשֶׁךְ','🌑']],spr:['cat','ball'],gk:'sci',goal:'כדי לראות צריך אור',s:['לְנוֹעָה יֵשׁ חֲתוּלָה קְטַנָּה בְּשֵׁם מִיצִי.','מִיצִי אוֹהֶבֶת לְשַׂחֵק בְּכַדּוּר אָדֹם.','יוֹם אֶחָד הַכַּדּוּר הִתְגַּלְגֵּל מִתַּחַת לַמִּטָּה.','מִתַּחַת לַמִּטָּה הָיָה חֹשֶׁךְ, וּמִיצִי לֹא מָצְאָה אוֹתוֹ.','נוֹעָה הֵבִיאָה פָּנָס, וְהָאוֹר הֵאִיר מִתַּחַת לַמִּטָּה.','עִם אוֹר רוֹאִים! הִנֵּה הַכַּדּוּר! מִיצִי קָפְצָה מִשִּׂמְחָה.'],
  q:[['אֵיזֶה צֶבַע הַכַּדּוּר?','אָדֹם',['כָּחֹל','יָרֹק']],['מָה עָזַר לְנוֹעָה לִמְצֹא אֶת הַכַּדּוּר?','פָּנָס',['מַפְתֵּחַ','סֵפֶר']],['לָמָּה הַפָּנָס עָזַר?','כִּי צָרִיךְ אוֹר כְּדֵי לִרְאוֹת',['כִּי הַפָּנָס כָּבֵד','כִּי הַפָּנָס עוֹשֶׂה רַעַשׁ']]],les:2},
 {t:'הַזֶּרַע שֶׁל אוֹרֶן',hw:[['הָעָצִיץ','🪴'],['נֶבֶט','🌱'],['הִשְׁקָה','💧']],spr:['flower','sun'],gk:'sci',goal:'צמח צריך מים ואור',s:['אוֹרֶן שָׁתַל זֶרַע קָטָן בְּעָצִיץ.','כָּל בֹּקֶר הוּא הִשְׁקָה אוֹתוֹ בְּמַיִם.','הוּא שָׂם אֶת הָעָצִיץ לְיַד הַחַלּוֹן, בַּשֶּׁמֶשׁ, כִּי צֶמַח צָרִיךְ אוֹר.','אַחֲרֵי שָׁבוּעַ יָצָא נֶבֶט יָרֹק.','אַחֲרֵי חֹדֶשׁ פָּרַח פֶּרַח צָהֹב וְיָפֶה.','אוֹרֶן הָיָה גֵּאֶה מְאוֹד.'],
  q:[['אֵיזֶה צֶבַע הָיָה הַפֶּרַח?','צָהֹב',['אָדֹם','סָגֹל']],['מָה יָצָא מֵהַזֶּרַע אַחֲרֵי שָׁבוּעַ?','נֶבֶט יָרֹק',['תַּפּוּחַ','אֶבֶן']],['מָה צָרִיךְ צֶמַח כְּדֵי לִגְדֹּל?','מַיִם וְאוֹר שֶׁמֶשׁ',['חֹשֶׁךְ וְשֶׁקֶט','מוּזִיקָה וְעוּגָה']]],les:2},
 {t:'הַדְּרָקוֹן שֶׁפָּחַד מֵהַחֹשֶׁךְ',hw:[['דְּרָקוֹן','🐉'],['כּוֹכָבִים','⭐'],['נוֹצְצִים','✨']],spr:['dragon','moon'],gk:'sci',goal:'למה רואים כוכבים רק בלילה',s:['נִיצוֹץ הָיָה דְּרָקוֹן קָטָן וְאַמִּיץ.','הוּא לֹא פָּחַד מִשּׁוּם דָּבָר, חוּץ מֵהַחֹשֶׁךְ.','פִּיקְסֶל הֶחָתוּל אָמַר: "בּוֹא נִסְתַּכֵּל עַל הַשָּׁמַיִם."','הֵם יָצְאוּ הַחוּצָה, וְהַשָּׁמַיִם הָיוּ מְלֵאִים כּוֹכָבִים נוֹצְצִים.','פִּיקְסֶל אָמַר: "הַכּוֹכָבִים שָׁם גַּם בַּיּוֹם, אֲבָל אוֹר הַשֶּׁמֶשׁ חָזָק מְאוֹד, וְלָכֵן לֹא רוֹאִים אוֹתָם."','"רַק בַּחֹשֶׁךְ רוֹאִים כּוֹכָבִים!" אָמַר נִיצוֹץ. מֵאָז הוּא אוֹהֵב אֶת הַלַּיְלָה.'],
  q:[['מִמָּה פָּחַד נִיצוֹץ?','מֵהַחֹשֶׁךְ',['מִכְּלָבִים','מִמַּיִם']],['מָה הֵם רָאוּ בַּשָּׁמַיִם?','כּוֹכָבִים',['שֶׁמֶשׁ','גֶּשֶׁם']],['לָמָּה לֹא רוֹאִים כּוֹכָבִים בַּיּוֹם?','כִּי אוֹר הַשֶּׁמֶשׁ חָזָק מְאוֹד',['כִּי הַכּוֹכָבִים יְשֵׁנִים','כִּי הַכּוֹכָבִים נוֹפְלִים']]],les:2},
 {t:'יוֹם הַהֻלֶּדֶת שֶׁל סַבְתָּא',hw:[['הַהֻלֶּדֶת','🎂'],['נֵרוֹת','🕯️'],['בַּעֲשָׂרוֹת','🔟']],spr:['cake','heart'],gk:'math',goal:'ספירה בעשרות: 7 נרות של 10 שנים = 70',s:['הַיּוֹם יוֹם הַהֻלֶּדֶת שֶׁל סַבְתָּא. הִיא בַּת שִׁבְעִים!','אוֹרֶן וְאַבָּא אָפוּ עוּגַת שׁוֹקוֹלָד.','עַל הָעוּגָה הֵם שָׂמוּ שִׁבְעָה נֵרוֹת: נֵר אֶחָד לְכָל עֶשֶׂר שָׁנִים.','אוֹרֶן סָפַר בַּעֲשָׂרוֹת: עֶשֶׂר, עֶשְׂרִים, שְׁלוֹשִׁים, אַרְבָּעִים, חֲמִשִּׁים, שִׁשִּׁים, שִׁבְעִים!','כָּל הַמִּשְׁפָּחָה שָׁרָה לָהּ שִׁיר, וְסַבְתָּא כִּבְּתָה אֶת הַנֵּרוֹת.','הִיא חִבְּקָה אֶת אוֹרֶן וְאָמְרָה: "אַתָּה יוֹדֵעַ לִסְפֹּר בַּעֲשָׂרוֹת!"'],
  q:[['אֵיזוֹ עוּגָה הֵם אָפוּ?','שׁוֹקוֹלָד',['גְּבִינָה','תַּפּוּחִים']],['כַּמָּה נֵרוֹת הָיוּ עַל הָעוּגָה?','7',['70','10']],['כָּל נֵר הוּא עֶשֶׂר שָׁנִים. לְסָבָא יֵשׁ שִׁשָּׁה נֵרוֹת. בֶּן כַּמָּה סָבָא?','60',['6','16']]],les:2},
 {t:'הַסִּירָה שֶׁל דָּנִי',hw:[['סִירָה','⛵'],['בַּשְּׁלוּלִית','💦'],['סָפַג','🧽']],spr:['boat','cloud'],gk:'sci',goal:'נייר סופג מים ונהיה רך, עץ צף ונשאר חזק',s:['דָּנִי בָּנָה סִירָה מִנְּיָר.','הוּא שָׂם אוֹתָהּ בַּשְּׁלוּלִית שֶׁלְּיַד הַבַּיִת.','רוּחַ נָשְׁבָה, וְהַסִּירָה שָׁטָה מַהֵר.','פִּתְאוֹם הִתְחִיל גֶּשֶׁם. הַנְּיָר סָפַג מַיִם, נִהְיָה רַךְ וְשָׁקַע.','דָּנִי הֵבִין: נְיָר סוֹפֵג מַיִם, אֲבָל עֵץ צָף וְנִשְׁאָר חָזָק.','בַּפַּעַם הַבָּאָה הוּא יִבְנֶה סִירָה מֵעֵץ!'],
  q:[['מִמָּה הָיְתָה הַסִּירָה?','מִנְּיָר',['מֵעֵץ','מִבַּרְזֶל']],['מָה קָרָה כְּשֶׁהִתְחִיל גֶּשֶׁם?','הַנְּיָר סָפַג מַיִם',['הַסִּירָה עָפָה','הַשֶּׁמֶשׁ זָרְחָה']],['לָמָּה כְּדַאי לִבְנוֹת סִירָה מֵעֵץ?','כִּי עֵץ צָף וְלֹא נִהְיָה רַךְ בַּמַּיִם',['כִּי עֵץ יָפֶה יוֹתֵר','כִּי עֵץ שָׁט גַּם בְּלִי מַיִם']]],les:2},
 {t:'חָכָם הַיַּנְשׁוּף סוֹפֵר כּוֹכָבִים',hw:[['יַנְשׁוּף','🦉'],['כּוֹכָבִים','⭐'],['חֶשְׁבּוֹן','➕']],spr:['owl','star'],gk:'math',goal:'חיבור: 10 ועוד 5 הם 15',s:['בַּיַּעַר גָּר יַנְשׁוּף חָכָם.','בַּיּוֹם הוּא יָשֵׁן, וּבַלַּיְלָה הוּא עֵר וְסוֹפֵר אֶת הַכּוֹכָבִים.','בַּלַּיְלָה הָרִאשׁוֹן הוּא סָפַר עֲשָׂרָה כּוֹכָבִים.','בַּלַּיְלָה הַשֵּׁנִי הוּא סָפַר עוֹד חֲמִשָּׁה.','"עֲשָׂרָה וְעוֹד חֲמִשָּׁה, כַּמָּה זֶה בְּיַחַד?" שָׁאַל חָכָם.','חָכָם חִיֵּךְ: "חֶשְׁבּוֹן זֶה כֵּיף!"'],
  q:[['אֵיפֹה גָּר הַיַּנְשׁוּף?','בַּיַּעַר',['בַּיָּם','בָּעִיר']],['כַּמָּה כּוֹכָבִים הוּא סָפַר בַּלַּיְלָה הָרִאשׁוֹן?','10',['5','15']],['כַּמָּה כּוֹכָבִים הוּא סָפַר בְּסַךְ הַכֹּל?','15',['10','5']]],les:2}];
/* ---------- a story screen (#355): the bedtime stories here and the story bank (read-bank2.js) ----------
   Read first, listen later: the read-aloud help follows Oren's story level (READBANK2.level('story'), 1-5).
   line / all = seconds until the per-line 🔊 / the whole-story "read to me" show (null = never); wrong = what a wrong answer shows at once.
   Every question has one "📖 to the story" button; the story opens over the question (its state is kept) with one button back. */
const READ_HELP=[{band:'low',to:2,line:0,all:10,wrong:['line','all']},{band:'mid',to:4,line:25,all:25,wrong:['line','all']},{band:'top',to:5,line:null,all:null,wrong:['line']}];
const helpOf=lv=>READ_HELP.find(b=>lv<=b.to)||READ_HELP[READ_HELP.length-1];
/* #613 the parent's one "reading help" setting (O.readHelp) picks the rule: read to him = the line taps and "read to me" at once;
   tries first = the level table above, its wait from the setting (the lowest level keeps about half: 10 s of 25); reads alone = both only after a wrong answer */
const storyHelp=lv=>{const r=O.readHelp?O.readHelp():{m:'try',w:25};
  if(r.m==='read')return {band:'read',line:0,all:0,wrong:['line','all']};
  if(r.m==='alone')return {band:'alone',line:null,all:null,wrong:['line','all']};
  const b=helpOf(lv);return b.all==null?b:Object.assign({},b,{line:b.line&&r.w,all:b.band==='low'?Math.round(r.w*.4):r.w});};
const STORY_SAY='קְרָא אֶת הַסִּפּוּר, וְאַחַר כָּךְ עוֹנִים עַל שְׁאֵלוֹת.';
const storyLv=()=>{try{const R=window.READBANK2;return R&&R.level?R.level('story')|0||1:1;}catch(e){return 1;}};
let SS=null;   /* the story being played: {id, t0, lv, help, wrong, heard, log} */
/* a story he listened to (whole or a line) is marked: only stories read alone move the story level up (read-bank2.js) */
O.on('tlDone',id=>{if(SS&&SS.id===id){const c=T.S().tl[id];if(c){c.l=SS.heard?1:0;O.persist();}}});
/* #420: a story word as said and stored: letters and nikud only (no punctuation, no markup) */
const HW_T='מִלִּים שֶׁנִּפְגֹּשׁ בַּסִּפּוּר';
const swd=t=>String(t||'').replace(/[^\u0591-\u05C7\u05D0-\u05EA]/g,'');
const stoks=line=>String(line||'').replace(/<[^>]+>/g,' ').split(/\s+/).map(swd).filter(Boolean);
/* every word of every story (bedtime + the story bank), for the voice pregen: a tapped word is said alone */
T.storyWordList=()=>{const out=new Set([HW_T]);const R=window.READBANK2;[...STORIES,...((R&&R.stories)||[])].forEach(st=>{st.s.forEach(l=>stoks(l).forEach(w=>out.add(w)));(st.hw||[]).forEach(x=>out.add(x[0]));});return [...out];};
T.HW_T=HW_T;
function storyScreen(o){/* o: {act (activity id for the day log), id (quiz id), title (html), name (quiz title), tp (plain title), goal, spr:[html,html], lines:[html], vl:[vocalized lines, when lines may lack nikud], hw:[[word, picture]] (#420), q:[{pr, say, a, ds}], back, qback, end(err, heard): after the last question (#360)} */
  const lv=storyLv(),help=storyHelp(lv);const ss=SS={id:o.id,t0:Date.now(),lv,help,wrong:false,heard:false,log:{t:o.tp,g:o.goal||'',lv,r:'a'}};
  if(window.DAYLOG&&DAYLOG.note)DAYLOG.note(o.act,ss.log);
  const shows=k=>(ss.wrong&&help.wrong.includes(k))||(help[k]!=null&&Date.now()-ss.t0>=D(help[k]*1000));
  const heard=()=>{ss.heard=true;ss.log.r='l';};
  /* the story and, under its last line (normal flow, never over the text), one row: one 🔊 "read to me" (when allowed) and one forward "▶ הַמְשֵׁךְ" (G2/G4: no per-line 🔊, a tap on a line reads it) */
  function page(box,fwd){const pg=h('div','story');pg.innerHTML=`<div class="sth"><span>${o.spr[0]}</span><h2>${o.title}</h2><span>${o.spr[1]}</span></div>`+o.lines.map((x,i)=>`<p class="sl" data-i="${i}">${x}</p>`).join('');box.appendChild(pg);
    const row=h('div','btnrow strow');const rd=h('button','bigbtn blue sm strd',ICON.say);rd.setAttribute('aria-label','הַקְרֵא לִי');row.append(rd,fwd);box.appendChild(row);
    const mark=i=>pg.querySelectorAll('.sl').forEach(p=>p.classList.toggle('cur',+p.dataset.i===i));
    pg.addEventListener('click',e=>{if(e.target.closest('.rdb'))heard();},true);
    /* a tap on a word says just that word (with nikud) and keeps it for word practice the next day (#420); 🔊 reads the line */
    const vl=(o.vl||o.lines).map(stoks);if(T.rdWords)pg.querySelectorAll('.sl').forEach(p=>T.rdWords(p));
    const tapWord=(p,w)=>{const ws=T.rdWords?T.rdWords(p):[],j=ws.indexOf(w),v=vl[+p.dataset.i]||[];const wd=v.length===ws.length&&v[j]?v[j]:swd(w.textContent);if(!wd)return false;
      if(T.readStop)T.readStop();ws.forEach(x=>x.classList.toggle('on',x===w));setTimeout(()=>w.classList.remove('on'),D(1200));O.say(wd);
      const R=window.READBANK2;if(R&&R.ask)R.ask(wd);return true;};
    pg.querySelectorAll('.sl').forEach(p=>p.onclick=e=>{if(pg.classList.contains('noline'))return;heard();const w=e&&e.target&&e.target.closest&&e.target.closest('.rw');if(w&&p.contains(w)&&tapWord(p,w))return;mark(+p.dataset.i);if(T.readEl)T.readEl(p);else O.say(T.spk(p.textContent));});
    rd.onclick=()=>{heard();const els=[...pg.querySelectorAll('.sl')];if(T.readSeq){T.readSeq(els,mark);return;}let i=0;const nx=()=>{if(i>=els.length||!pg.isConnected)return;mark(i);O.say(T.spk(els[i].textContent));i++;setTimeout(nx,3200);};nx();};/* the game voice, never the browser voice directly (#36) */
    const upd=()=>{if(!pg.isConnected)return;pg.classList.toggle('noline',!shows('line'));rd.hidden=!shows('all');};
    upd();[help.line,help.all].forEach(sec=>{if(sec==null)return;const left=D(sec*1000)-(Date.now()-ss.t0);if(left>0)setTimeout(upd,left+30);});
    return pg;}
  const peek=wrap=>{const s=wrap.parentNode,say0=O.sayNow;O.hush();wrap.hidden=true;const box=h('div','stpeek');s.appendChild(box);O.sayNow='';
    const bk=h('button','bigbtn stback',ICON.play+'<span>הַמְשֵׁךְ</span>');bk.onclick=()=>{T.readStop&&T.readStop();box.remove();wrap.hidden=false;O.sayNow=say0;};
    page(box,bk);s.scrollTop=0;};
  const questions=()=>{O.hush();T.readStop&&T.readStop();quiz({id:o.id,title:o.name,bg:'final',back:o.qback||o.back,n:o.q.length,
    gen:i=>{const q=o.q[i];/* the index, not a counter: "again" restarts at 0 (#350) */const opts=shuffle([q.a,...q.ds]);return {pr:`<div class="sent">${q.pr}</div>`,opts,ans:opts.indexOf(q.a),cls:'tx',say:q.say,key:q.pr};},
    onWrong:()=>{ss.wrong=true;},end:err=>{if(o.end)o.end(err,ss.heard);},side:{lbl:'📖 <span>לַסִּפּוּר</span>',open:peek}});};
  O.setScreen('sTal','final',o.back);T.hudT('סִפּוּר');const s=$('#sTal');s.innerHTML='';
  /* #420: "words we will meet": 2-3 hard words of the story with a picture, a tap says the word */
  if(o.hw&&o.hw.length){const c=h('div','sthw',`<div class="sthwt">${HW_T}</div>`);const r=h('div','sthwr');
    o.hw.forEach(([w,pic])=>{const b=h('button','hwt',`<span class="hwp">${pic}</span><span class="hww">${w}</span>`);b.type='button';b.onclick=()=>{O.sfx.pop(1);O.say(w);};r.appendChild(b);});c.appendChild(r);s.appendChild(c);}
  const go=h('button','bigbtn stgo',ICON.play+'<span>הַמְשֵׁךְ</span>');go.onclick=questions;page(s,go);
  if(help.band!=='read'&&window.FRIEND&&FRIEND.readFirst){O.sayNow=T.spk(FRIEND.READFIRST);FRIEND.readFirst();}else O.sayNow=STORY_SAY;}   /* read to him: no "try alone first" */
T.addSay([STORY_SAY]);T.storyScreen=storyScreen;T.READ_HELP=READ_HELP;T.helpOf=helpOf;T.storyHelp=storyHelp;window.__story={get ss(){return SS;}};
function readStory(k,back){const st=STORIES[k];storyScreen({act:'story-'+k,id:'story-'+k,title:st.t,name:st.t,tp:T.plainHe(st.t),goal:st.goal,spr:st.spr.map(x=>ALLSPR(x)),lines:st.s,hw:st.hw,
  q:st.q.map(([pr,a,ds])=>({pr,a,ds})),back,qback:()=>openStories(back)});}
function openStories(back){O.setScreen('sTal','final',back);T.hudT('סִפּוּרֵי עֶרֶב');const s=$('#sTal');s.innerHTML='';s.appendChild(h('div','whead',`<span class="gd">${X.moon}</span><h1>סִפּוּרֵי עֶרֶב</h1>`));
  const g=h('div','acts');STORIES.forEach((st,k)=>{const n=(T.S().tl['story-'+k]||{}).s|0;const c=h('button','actc',`<span class="ai">${ALLSPR(st.spr[0])}</span><span class="an">${st.t}</span><span class="st">${[0,1,2].map(j=>j<n?SPR.star:SPR.starOff).join('')}</span>`);c.onclick=()=>readStory(k,()=>openStories(back));g.appendChild(c);});s.appendChild(g);}
T.STORIES=STORIES;T.readStory=readStory;
building({id:'stories',name:'סִפּוּרֵי עֶרֶב',color:'#6c4fc1',bg:'clock',icon:()=>X.moon,blurb:'סִפּוּרִים קְצָרִים לִקְרִיאָה, עִם שְׁאֵלוֹת בַּסּוֹף.',acts:STORIES.map((st,k)=>({id:'story-'+k,name:st.t,icon:()=>ALLSPR(st.spr[0]),run:back=>readStory(k,back)}))});
T.openStories=openStories;
})();

/* ===== TYPING (Hebrew keyboard) ===== */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$,rand,pick,SPR,ICON}=O;const {X,building}=T;const sfx=O.sfx;
const CODE={KeyE:'ק',KeyR:'ר',KeyT:'א',KeyY:'ט',KeyU:'ו',KeyI:'ן',KeyO:'ם',KeyP:'פ',KeyA:'ש',KeyS:'ד',KeyD:'ג',KeyF:'כ',KeyG:'ע',KeyH:'י',KeyJ:'ח',KeyK:'ל',KeyL:'ך',Semicolon:'ף',KeyZ:'ז',KeyX:'ס',KeyC:'ב',KeyV:'ה',KeyB:'נ',KeyN:'מ',KeyM:'צ',Comma:'ת',Period:'ץ',Space:' '};
const ROWS=[['ק','ר','א','ט','ו','ן','ם','פ'],['ש','ד','ג','כ','ע','י','ח','ל','ך','ף'],['ז','ס','ב','ה','נ','מ','צ','ת','ץ']];
const FINGER={'ש':0,'ז':0,'ד':1,'ס':1,'ק':2,'ג':2,'ב':2,'ר':3,'כ':3,'ע':3,'ה':3,'נ':3,'א':3,'ט':4,'י':4,'ח':4,'מ':4,'צ':4,'ו':4,'ן':5,'ל':5,'ת':5,'ם':6,'ך':6,'ץ':6,'פ':7,'ף':7};
const FCOL=['#e4572e','#f28c28','#e9b949','#4fae4f','#3cb371','#3a8fc4','#6c6fd1','#b065c9'];
const LESSONS=[['כ','ח'],['ג','ל'],['ד','ך'],['ש','ף'],['ע','י'],['ר','א'],['ק','ט'],['ו','ן'],['ם','פ'],['ה','נ'],['ב','מ'],['ס','צ'],['ז','ת','ץ']];
const learned=n=>LESSONS.slice(0,n+1).flat();
const WL='חתול כלב דג עץ פרח שמש ירח כוכב בית כדור ספר כובע סירה לב כוס נעל דגל ענן ים גל חול יד רגל אף פה עין שיר גן אור חג חלב לחם כד דלי גדי חיל לך כך לכל יחד חלל גלגל דלעת מלך ילד ילדה אבא אמא סבא דוד עוגה מים שלום טוב יום לילה בוקר ערב אוכל משחק חבר חברה צבע אדום כחול ירוק צהוב לבן שחור ספרים מחברת עיפרון'.split(' ');
const keyOf=e=>CODE[e.code]||(/^[א-ת ]$/.test(e.key)?e.key:null);
function kbHTML(target,allowed){return `<div class="kb">${ROWS.map(r=>`<div class="kr">${r.map(k=>`<span class="kk${k===target?' tgt':''}${allowed&&!allowed.includes(k)?' dim':''}" style="--f:${FCOL[FINGER[k]]}">${k}</span>`).join('')}</div>`).join('')}<div class="kr"><span class="kk sp${target===' '?' tgt':''}">רֶוַח</span></div></div>`;}
function lessonText(n){const al=learned(n);const words=WL.filter(w=>[...w].every(c=>al.includes(c)));const parts=[];
  while(parts.join(' ').length<34){if(words.length>=3&&Math.random()<.6)parts.push(pick(words));else{let s='';const L=rand(2,4);for(let i=0;i<L;i++)s+=pick(i===0&&n>0&&Math.random()<.5?LESSONS[n]:al);parts.push(s);}}
  return parts.join(' ');}
function typeLesson(n,back){const text=lessonText(n);let i=0,err=0,t0=0;O.setScreen('sTal','city',back);T.hudT(`שִׁעוּר ${n+1}: ${LESSONS[n].join(' ')}`);
  const s=$('#sTal');s.innerHTML='';const box=h('div','tline');const kb=h('div','');const info=h('div','note','יָדַיִם עַל הַשּׁוּרָה הָאֶמְצָעִית · הָאֶצְבַּע בַּצֶּבַע שֶׁל הַמַּקָּשׁ');s.append(box,kb,info);
  const draw=()=>{box.innerHTML=[...text].map((c,k)=>`<span class="tc${k<i?' ok':k===i?' cur':''}">${c===' '?'&nbsp;':c}</span>`).join('');kb.innerHTML=kbHTML(text[i],learned(n).concat([' ']));};draw();
  O.sayNow='הקלד את האותיות לפי הסדר.';
  T.setKey(e=>{const k=keyOf(e);if(!k)return;e.preventDefault();if(!t0)t0=Date.now();
    if(k===text[i]){i++;sfx.key();if(i>=text.length){T.setKey(null);const secs=(Date.now()-t0)/1000;const acc=Math.round(100*text.length/(text.length+err));const wpm=Math.round(text.length/5/(secs/60));
        const st=acc>=95?3:acc>=85?2:1;const ty=T.S().typ;ty.best[n]=Math.max(ty.best[n]|0,st);ty.wpm=Math.max(ty.wpm|0,wpm);ty.acc=acc;O.addGems(5+st*2);T.record('type-lessons',st);
        T.result({title:'סִיַּמְתָּ אֶת הַשִּׁעוּר!',sub:`דִּיּוּק ${acc}% · ${wpm} מִלִּים בְּדַקָּה`,stars:st,gems:5+st*2,back,again:()=>typeLesson(n,back)});return;}draw();}
    else{err++;sfx.no();box.classList.remove('shake');void box.offsetWidth;box.classList.add('shake');}});}
/* one big button: the next lesson (the first one not done yet) */
function lessonsMenu(back){O.setScreen('sTal','city',back);T.hudT('שִׁעוּרֵי הַקְלָדָה');O.sayNow='לְחַץ, וְנַתְחִיל אֶת הַשִּׁעוּר.';const s=$('#sTal');s.innerHTML='';const ty=T.S().typ;
  let n=LESSONS.findIndex((_,k)=>!(ty.best[k]|0));if(n<0)n=LESSONS.length-1;
  const b=h('button','bigbtn lvgo',ICON.play+`<span>שִׁעוּר ${n+1}</span>`);b.onclick=()=>typeLesson(n,()=>lessonsMenu(back));s.appendChild(b);}
function rainGame(back){const ty=T.S().typ;let top=0;Object.keys(ty.best).forEach(k=>{top=Math.max(top,+k);});const al=learned(Math.max(1,top));
  O.setScreen('sTal','city',back);T.hudT('גֶּשֶׁם אוֹתִיּוֹת');O.sayNow='לְחַץ בַּמִּקְלֶדֶת עַל הָאוֹת שֶׁנּוֹפֶלֶת, לִפְנֵי שֶׁהִיא נוֹגַעַת בַּדֶּשֶׁא!';const s=$('#sTal');s.innerHTML='';const field=h('div','rainf');const sc=h('div','score','⭐ 0');s.append(h('div','lsent','לְחַץ בַּמִּקְלֶדֶת עַל הָאוֹת שֶׁנּוֹפֶלֶת, לִפְנֵי שֶׁהִיא נוֹגַעַת בַּדֶּשֶׁא!'),sc,field);
  let score=0,blocks=[],t0=performance.now(),last=t0,spawn=0,alive=true,end=t0+60000;const H=()=>field.clientHeight;
  const mk=()=>{const ch=pick(al);const b=h('div','rb',ch);b.style.left=rand(4,90)+'%';field.appendChild(b);blocks.push({b,ch,y:-40});};
  const loop=now=>{if(!alive||$('#sTal').hidden||!field.isConnected){alive=false;return;}if(O.paused){end+=now-last;last=now;requestAnimationFrame(loop);return;}/* #44 paused: the clock and the letters stand still */const dt=now-last;last=now;const sp=(28+score*1.2)/1000;spawn-=dt;if(spawn<=0){mk();spawn=Math.max(500,1500-score*25);}
    blocks.forEach(o=>{o.y+=sp*dt;o.b.style.top=o.y+'px';});const fallen=blocks.filter(o=>o.y>H()-30);fallen.forEach(o=>{o.b.remove();sfx.no();});blocks=blocks.filter(o=>o.y<=H()-30);
    if(now>=end){alive=false;T.setKey(null);const st=score>=40?3:score>=20?2:1;const g=Math.min(25,Math.floor(score/2));O.addGems(g);T.record('type-rain',st,{b:score});T.result({title:'נִגְמַר הַזְּמַן!',sub:`פּוֹצַצְתָּ ${score} אוֹתִיּוֹת`,stars:st,gems:g,back,again:()=>rainGame(back)});return;}
    sc.textContent=`⭐ ${score}   ⏱️ ${Math.ceil((end-now)/1000)}`;requestAnimationFrame(loop);};
  T.setKey(e=>{const k=keyOf(e);if(!k||k===' ')return;e.preventDefault();const o=blocks.filter(x=>x.ch===k).sort((a,b)=>b.y-a.y)[0];if(o){o.b.classList.add('boom');setTimeout(()=>o.b.remove(),250);blocks=blocks.filter(x=>x!==o);score++;sfx.pop(score%10);}else sfx.no();});
  window.__rain={get blocks(){return blocks;},hit:k=>{const o=blocks.find(x=>x.ch===k);if(o){blocks=blocks.filter(x=>x!==o);o.b.remove();score++;}},finish:()=>{end=0;}};
  requestAnimationFrame(loop);}
building({id:'type',needsKeys:true,name:'מִגְדַּל הַמִּקְלֶדֶת',color:'#5a5f66',bg:'city',icon:()=>X.keys,blurb:'לוֹמְדִים לְהַקְלִיד בְּעִבְרִית בְּעֶשֶׂר אֶצְבָּעוֹת.',acts:[
  {id:'type-lessons',name:'שִׁעוּרֵי הַקְלָדָה',icon:()=>X.keys,run:lessonsMenu},
  {id:'type-rain',name:'גֶּשֶׁם אוֹתִיּוֹת',icon:()=>X.cloud,run:rainGame}]});
T.TYPE={CODE,LESSONS,lessonText,learned,keyOf};
})();

/* ===== MUSIC: notes, durations, ear, rhythm, piano ===== */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$,rand,pick,shuffle,ICON}=O;const {X,building,quiz}=T;const sfx=O.sfx,D=O.D;
const SOL=['דּוֹ','רֶה','מִי','פָה','סוֹל','לָה','סִי'];const SC=[0,2,4,5,7,9,11];
const midiOf=i=>60+SC[((i%7)+7)%7]+12*Math.floor(i/7);
function playMidi(m,dur=.7,vol=1,at=0){if((O.save.snd|0)<1||!O.audio())return;const t=O.A.ctx.currentTime+at;const f=O.NT(m);
  O.tone(f,t,dur,{type:'triangle',vol:.2*vol,rel:.35,lp:3200});O.tone(f*2,t,dur*.5,{type:'sine',vol:.05*vol,rel:.2});O.tone(f*3,t,.08,{type:'square',vol:.01*vol});}
T.playMidi=playMidi;
const CLEF='<path d="M44 104 C36 108 28 100 32 92 C36 84 48 86 47 96 C46 104 34 104 33 94 M43 112 C40 80 50 58 48 30 C47 14 36 16 37 30 C39 48 58 58 56 78 C54 92 40 96 34 86" fill="none" stroke="#23303b" stroke-width="3.2" stroke-linecap="round"/>';
function staff(idx,opts={}){const y=i=>90-(i-2)*6;let s=`<svg class="staff" viewBox="0 0 240 130" aria-hidden="true">`;for(let k=0;k<5;k++)s+=`<line x1="10" x2="230" y1="${90-k*12}" y2="${90-k*12}" stroke="#23303b" stroke-width="2"/>`;
  s+=`<g transform="translate(0,-8)">${CLEF}</g>`;const x=140,yy=y(idx);if(idx<=0)s+=`<line x1="${x-14}" x2="${x+14}" y1="102" y2="102" stroke="#23303b" stroke-width="2"/>`;if(idx>=12)s+=`<line x1="${x-14}" x2="${x+14}" y1="18" y2="18" stroke="#23303b" stroke-width="2"/>`;
  s+=`<ellipse cx="${x}" cy="${yy}" rx="9" ry="6.5" transform="rotate(-20 ${x} ${yy})" fill="${opts.col||'#23303b'}"/>`;s+=idx<6?`<line x1="${x+8}" x2="${x+8}" y1="${yy}" y2="${yy-38}" stroke="#23303b" stroke-width="2.5"/>`:`<line x1="${x-8}" x2="${x-8}" y1="${yy}" y2="${yy+38}" stroke="#23303b" stroke-width="2.5"/>`;return s+'</svg>';}
const DUR=[['שָׁלֵם',4,'w'],['חֲצִי',2,'h'],['רֶבַע',1,'q'],['שְׁמִינִית','½','e']];
function durSVG(k){const filled=k!=='w'&&k!=='h';let s=`<svg class="dur" viewBox="0 0 60 90" aria-hidden="true"><ellipse cx="26" cy="70" rx="11" ry="8" transform="rotate(-20 26 70)" fill="${filled?'#23303b':'#fff'}" stroke="#23303b" stroke-width="3"/>`;
  if(k!=='w')s+=`<line x1="36" y1="68" x2="36" y2="12" stroke="#23303b" stroke-width="3"/>`;if(k==='e')s+=`<path d="M36 12 C46 22 52 28 46 44" fill="none" stroke="#23303b" stroke-width="3"/>`;return s+'</svg>';}
/* rhythm */
const PATS=[['q','q','q','q'],['q','e','q','q'],['e','e','q','e','q'].slice(0,4),['q','r','q','q'],['e','q','e','q'],['q','q','e','e'],['e','e','e','e'],['q','e','r','q']];
function patOnsets(p){const out=[];p.forEach((b,i)=>{if(b==='q')out.push(i);if(b==='e'){out.push(i,i+.5);}});return out;}
const beatSVG=b=>b==='r'?'<svg class="beat" viewBox="0 0 40 60"><path d="M14 10 L26 22 L16 32 L26 44 C18 40 12 46 20 54" fill="none" stroke="#23303b" stroke-width="3.5"/></svg>':b==='q'?durSVG('q').replace('class="dur"','class="beat"'):`<svg class="beat" viewBox="0 0 70 90"><ellipse cx="18" cy="70" rx="10" ry="7" fill="#23303b"/><ellipse cx="50" cy="70" rx="10" ry="7" fill="#23303b"/><line x1="27" y1="68" x2="27" y2="14" stroke="#23303b" stroke-width="3"/><line x1="59" y1="68" x2="59" y2="14" stroke="#23303b" stroke-width="3"/><rect x="26" y="12" width="35" height="7" fill="#23303b"/></svg>`;
function rhythm(back){const rounds=shuffle(PATS.slice()).slice(0,4);let r=0,total=0,good=0;O.setScreen('sTal','final',back);const s=$('#sTal');
  const run=()=>{const p=rounds[r];T.hudT('קֶצֶב',T.progressBar(r,rounds.length));O.sayNow='לְחַץ הַתְחֵל, וְהַקֵּשׁ עַל הַתֹּף בַּקֶּצֶב.';s.innerHTML='';const bar=h('div','rbar',p.map((b,i)=>`<span class="rb2" data-i="${i}">${beatSVG(b)}</span>`).join(''));
    const msg=h('div','lcap','לְחַץ "הַתְחֵל". אַחֲרֵי 4 נְקִישׁוֹת, הַקֵּשׁ עַל הַתֹּף בַּקֶּצֶב.');const drum=h('button','drum','🥁');const go=h('button','bigbtn',ICON.play+'<span>הַתְחֵל</span>');s.append(bar,msg,drum,go);
    let taps=[],t0=0,running=false;const beat=60/80;const tap=()=>{if(!running)return;taps.push(performance.now());drum.classList.remove('hit');void drum.offsetWidth;drum.classList.add('hit');if(O.audio()&&(O.save.snd|0)>=1)O.noise(O.A.ctx.currentTime,.12,{ft:'lowpass',f:600,vol:.5});};
    drum.onclick=tap;T.setKey(e=>{if(e.code==='Space'||e.key===' '){e.preventDefault();tap();}});
    go.onclick=()=>{go.disabled=true;running=true;taps=[];const now=performance.now();for(let k=0;k<4;k++){setTimeout(()=>{sfx.key();msg.textContent=['1','2','3','4'][k];},D(k*beat*1000));}
      t0=now+4*beat*1000*(window.__fast?1/15:1);
      p.forEach((b,i)=>setTimeout(()=>{const el=bar.querySelector(`[data-i="${i}"]`);if(el){el.classList.add('now');setTimeout(()=>el.classList.remove('now'),D(beat*900));}},D((4+i)*beat*1000)));
      setTimeout(()=>{msg.textContent='עַכְשָׁו!';},D(4*beat*1000));
      setTimeout(()=>{if(!bar.isConnected)return;/* left the drum mid-round: its timers must not take the screen back */running=false;const on=patOnsets(p).map(x=>t0+x*beat*1000*(window.__fast?1/15:1));const tol=window.__fast?60:170;let hit=0;const used=new Set();
        on.forEach(o=>{const k=taps.findIndex((t,j)=>!used.has(j)&&Math.abs(t-o)<tol);if(k>=0){used.add(k);hit++;}});const extra=taps.length-used.size;const sc=Math.max(0,hit-extra);
        total+=on.length;good+=sc;msg.innerHTML=sc===on.length?'מְעֻלֶּה! בְּדִיּוּק בַּקֶּצֶב.':`פָּגַעְתָּ ב-${sc} מִתּוֹךְ ${on.length}`;if(sc===on.length)sfx.ok(r);else sfx.no();
        setTimeout(()=>{r++;if(r<rounds.length)run();else{T.setKey(null);const pc=good/total;const st=pc>=.85?3:pc>=.6?2:1;O.addGems(5+st*2);T.record('mus-rhythm',st);T.result({title:'מְתוֹפֵף אַלּוּף!',stars:st,gems:5+st*2,back,again:()=>rhythm(back)});}},D(1800));},D((4+4+.6)*beat*1000));};
    window.__rhythm={get t0(){return t0;},onsets:()=>patOnsets(p).map(x=>t0+x*beat*1000*(window.__fast?1/15:1)),tap};};run();}
/* piano */
const WHITE=[60,62,64,65,67,69,71,72,74,76],BLACK={61:0,63:1,66:3,68:4,70:5,73:7,75:8};
const KMAP={KeyA:60,KeyS:62,KeyD:64,KeyF:65,KeyG:67,KeyH:69,KeyJ:71,KeyK:72,KeyL:74,Semicolon:76,KeyW:61,KeyE:63,KeyT:66,KeyY:68,KeyU:70,KeyO:73,KeyP:75};
const SONGS=[['נַצְנְצִי כּוֹכָב',[60,60,67,67,69,69,67,65,65,64,64,62,62,60,67,67,65,65,64,64,62,67,67,65,65,64,64,62,60,60,67,67,69,69,67,65,65,64,64,62,62,60]],
 ['שִׁיר הַשִּׂמְחָה',[64,64,65,67,67,65,64,62,60,60,62,64,64,62,62,64,64,65,67,67,65,64,62,60,60,62,64,62,60,60]],
 ['יוֹנָתָן הַקָּטָן',[67,64,64,65,62,62,60,62,64,65,67,67,67,67,64,64,65,62,62,60,64,67,67,60]],
 ['אָחִי יַעֲקֹב',[67,69,71,67,67,69,71,67,71,72,74,71,72,74,74,76,74,72,71,67,74,76,74,72,71,67,67,62,67,67,62,67]]];
/* first a choice: 🎹 free play or 🎵 a song (the next one in turn) */
function pianoMenu(back){O.setScreen('sTal','final',back);T.hudT('פְּסַנְתֵּר');O.sayNow='נְגִינָה חָפְשִׁית, אוֹ שִׁיר?';const s=$('#sTal');s.innerHTML='';
  const me=()=>pianoMenu(back);const k=((T.S().tl['mus-piano']||{}).n|0)%SONGS.length;const row=h('div','pmodes');
  const f=h('button','bigbtn pmode','<span class="pme">🎹</span><span>נְגִינָה חָפְשִׁית</span>');f.onclick=()=>piano(me);
  const g=h('button','bigbtn blue pmode','<span class="pme">🎵</span><span>שִׁיר</span>');g.onclick=()=>piano(me,k);row.append(f,g);s.appendChild(row);}
function piano(back,songIdx){O.setScreen('sTal','final',back);const s=$('#sTal');s.innerHTML='';const song=songIdx!=null?SONGS[songIdx]:null;
  T.hudT(song?song[0]:'פְּסַנְתֵּר',song?T.progressBar(0,song[1].length):'');O.sayNow=song?'לְחַץ עַל הַמַּקָּשׁ שֶׁדּוֹלֵק.':'נַגֵּן עַל הַפְּסַנְתֵּר מָה שֶׁבָּא לְךָ.';let pos=0,err=0;
  const kb=h('div','piano');s.append(kb);
  WHITE.forEach(m=>{const k=h('button','pw','');k.dataset.m=m;k.onpointerdown=e=>{e.preventDefault();press(m);};kb.appendChild(k);});
  Object.entries(BLACK).forEach(([m,i])=>{const k=h('button','pb2','');k.dataset.m=m;k.style.left=`calc(${(i+1)*10}% - 3%)`;k.onpointerdown=e=>{e.preventDefault();press(+m);};kb.appendChild(k);});
  const glow=()=>{kb.querySelectorAll('[data-m]').forEach(k=>k.classList.toggle('next',!!song&&+k.dataset.m===song[1][pos]));if(song)T.hudT(song[0],T.progressBar(pos,song[1].length));};
  function press(m){playMidi(m);const k=kb.querySelector(`[data-m="${m}"]`);if(k){k.classList.add('dn');setTimeout(()=>k.classList.remove('dn'),180);}
    if(song){if(m===song[1][pos]){pos++;if(pos>=song[1].length){T.setKey(null);const st=err<=2?3:err<=6?2:1;O.addGems(5+st*2);T.record('mus-piano',st);setTimeout(()=>T.result({title:'נִגַּנְתָּ אֶת הַשִּׁיר!',sub:song[0],stars:st,gems:5+st*2,back,again:()=>piano(back,songIdx)}),D(700));return;}}else err++;glow();}}
  T.setKey(e=>{const m=KMAP[e.code];if(m&&!e.repeat){e.preventDefault();press(m);}});
  glow();window.__piano={press,get pos(){return pos;},song};}
building({id:'music',name:'אוּלַם הַמּוּזִיקָה',color:'#b8860b',bg:'final',icon:()=>X.note,blurb:'תָּוִים, קֶצֶב וּנְגִינָה. אֶפְשָׁר לְנַגֵּן גַּם בַּמִּקְלֶדֶת.',acts:[
  {id:'mus-notes',name:'שְׁמוֹת הַתָּוִים',icon:()=>X.note,run:back=>quiz({id:'mus-notes',title:'שְׁמוֹת הַתָּוִים',bg:'final',back,n:5,gen:i=>{const lvl=i<3?[0,2,4]:i<6?[0,1,2,3,4,5,6]:[0,1,2,3,4,5,6,7];const idx=pick(lvl);const right=SOL[idx%7];const opts=shuffle([right,...shuffle(SOL.filter(x=>x!==right)).slice(0,2)]);
     return {pr:`${staff(idx)}<div class="qq">אֵיזֶה תָּו זֶה?</div>`,opts,ans:opts.indexOf(right),cls:'tx',play:()=>playMidi(midiOf(idx)),auto:1,key:'n'+idx+'-'+i};}})},
  {id:'mus-dur',name:'אֹרֶךְ הַתָּוִים',icon:()=>durSVG('h'),run:back=>quiz({id:'mus-dur',title:'אֹרֶךְ הַתָּוִים',bg:'final',back,n:5,gen:i=>{const d=pick(DUR);if(i%2){const opts=shuffle(DUR.map(x=>String(x[1])));return {pr:`${durSVG(d[2])}<div class="qq">כַּמָּה פְּעָמוֹת נִמְשָׁךְ תָּו ${d[0]}?</div>`,opts,ans:opts.indexOf(String(d[1])),cls:'',ltr:1,key:'b'+d[2]+i};}
     const opts=shuffle(DUR.map(x=>x[0]));return {pr:`${durSVG(d[2])}<div class="qq">אֵיזֶה תָּו זֶה?</div>`,opts,ans:opts.indexOf(d[0]),cls:'tx',key:'n'+d[2]+i};}})},
  {id:'mus-ear',name:'אֹזֶן מוּזִיקָלִית',icon:()=>'<span style="font-size:34px">👂</span>',run:back=>quiz({id:'mus-ear',title:'אֹזֶן מוּזִיקָלִית',bg:'final',back,n:5,gen:i=>{const a=rand(60,72);const same=i%4===3;const b=same?a:a+(Math.random()<.5?-1:1)*rand(3,7);const opts=['גָּבוֹהַּ יוֹתֵר','נָמוּךְ יוֹתֵר','אוֹתוֹ צְלִיל'];const ans=same?2:b>a?0:1;
     return {pr:`<div class="qq">הַקְשֵׁב לִשְׁנֵי צְלִילִים. הַשֵּׁנִי...</div>`,opts,ans,cls:'tx',play:()=>{playMidi(a,.5);playMidi(b,.5,1,.6);},auto:1,playLbl:'שׁוּב',key:a+'-'+b+'-'+i};}})},
  {id:'mus-rhythm',name:'קֶצֶב',icon:()=>'<span style="font-size:34px">🥁</span>',run:rhythm},
  {id:'mus-piano',name:'פְּסַנְתֵּר',icon:()=>X.keys,run:pianoMenu}]});
T.MUSIC={SONGS,staff,midiOf,piano,pianoMenu};
})();

/* ===== SCIENCE LAB ===== */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$,pick,shuffle,ICON,SPR}=O;const {X,ALLSPR,building,quiz}=T;const sfx=O.sfx,D=O.D;
const FLOAT=[['בּוּל עֵץ','log',1,'m'],['אֶבֶן','stone',0,'f'],['מַפְתֵּחַ','key',0,'m'],['עָלֶה','leaf',1,'m'],['כַּדּוּר','ball',1,'m'],['מַטְבֵּעַ','coin',0,'m'],['תַּפּוּחַ','apple',1,'m'],['סִירָה','boat',1,'f'],['מַסְמֵר','nail',0,'m'],['פְּקָק','cork',1,'m']];
const tank=k=>`<div class="tank"><span class="item" id="itm">${ALLSPR(k)}</span><div class="water"></div></div>`;
const MAG=[['הַמַּסְמֵר','nail',1],['הַמְּהַדֵּק','clip',1],['הַבֹּרֶג','screw',1],['הָעִפָּרוֹן','pencil',0],['הֶעָלֶה','leaf',0],['הַכַּדּוּר','ball',0],['הָאֶבֶן','stone',0],['הַפְּקָק','cork',0],['הַתַּפּוּחַ','apple',0]];
const ANIMALS=[['הַכֶּלֶב','dog','יוֹנֵק'],['הֶחָתוּל','cat','יוֹנֵק'],['הַכִּבְשָׂה','sheep','יוֹנֵק','',1],['הַלִּוְיָתָן','whale','יוֹנֵק','הַלִּוְיָתָן חַי בַּיָּם, אֲבָל הוּא יוֹנֵק: הוּא נוֹשֵׁם אֲוִיר וּמֵינִיק אֶת הַגּוּרִים.'],['הַצִּפּוֹר','bird','עוֹף','',1],['הַנֶּשֶׁר','eagle','עוֹף'],['הַיַּנְשׁוּף','owl','עוֹף'],['הַדָּג','fish','דָּג'],['הַצָּב','turtle','זוֹחֵל','לַצָּב יֵשׁ שִׁרְיוֹן וְקַשְׂקַשִּׂים. הוּא זוֹחֵל.']];
const CLASSES=['יוֹנֵק','עוֹף','דָּג','זוֹחֵל'];
const BODY=[['רֹאשׁ',[50,34]],['שֵׂעָר',[50,19]],['עֵינַיִם',[36,42]],['פֶּה',[50,55]],['יָד',[5,76]],['בֶּטֶן',[50,72]],['רֶגֶל',[30,92]]];
/* plant simulator */
function plant(back){let day=1,stage=0,water=false,sun=true;O.setScreen('sTal','forest',back);T.hudT('מָה צָרִיךְ צֶמַח?');O.sayNow='הַשְׁקֵה אֶת הַצֶּמַח, וּלְחַץ הַיּוֹם הַבָּא.';const s=$('#sTal');s.innerHTML='';
  const view=h('div','plantv');const info=h('div','lcap');const row=h('div','btnrow');const wb=h('button','bigbtn blue sm','💧 <span>לְהַשְׁקוֹת</span>');const sb=h('button','bigbtn gold sm','☀️ <span>שֶׁמֶשׁ</span>');const nb2=h('button','bigbtn',ICON.play+'<span>הַיּוֹם הַבָּא</span>');row.append(wb,sb,nb2);s.append(view,info,row);
  const draw=()=>{const st=['🌰','🌱','🌿','🪴','🌷'][stage];view.innerHTML=`<div class="sky ${sun?'sunny':'dark'}">${sun?X.sun:X.cloud}</div><div class="pot"><span class="pl s${stage}">${st}</span><div class="soil ${water?'wet':''}"></div></div><div class="day">יוֹם ${day}</div>`;
    info.innerHTML=stage>=4?'הַצֶּמַח פָּרַח! 🌷':water?'הָאֲדָמָה רְטֻבָּה':'הָאֲדָמָה יְבֵשָׁה';sb.classList.toggle('plain',!sun);};
  wb.onclick=()=>{water=true;sfx.pop(2);draw();};sb.onclick=()=>{sun=!sun;sfx.pop(3);draw();};
  nb2.onclick=()=>{day++;if(water&&sun){stage=Math.min(4,stage+1);sfx.ok(stage);}else{sfx.no();info.innerHTML=!water?'הַצֶּמַח צָמֵא! צָרִיךְ מַיִם.':'בְּלִי שֶׁמֶשׁ הַצֶּמַח לֹא גָּדֵל.';}water=false;draw();if(!water&&!(stage>=4))setTimeout(()=>{if(stage<4)info.innerHTML=info.innerHTML;},0);
    if(stage>=4){nb2.disabled=true;setTimeout(()=>{if(!view.isConnected)return;const Q=[['מָה צָרִיךְ צֶמַח כְּדֵי לִגְדֹּל?','מַיִם וְאוֹר',['רַק חֹשֶׁךְ','מוּזִיקָה']],['מָה קוֹרֶה לְצֶמַח בְּלִי מַיִם?','הוּא נוֹבֵל',['הוּא גָּדֵל מַהֵר','הוּא עָף']],['מֵאַיִן הַצֶּמַח מְקַבֵּל אוֹר?','מֵהַשֶּׁמֶשׁ',['מֵהָאֲדָמָה','מֵהַגֶּשֶׁם']]];
      quiz({id:'sci-plant',title:'מָה צָרִיךְ צֶמַח?',bg:'forest',back,n:3,gen:i=>{const [q,a,ds]=Q[i];const opts=shuffle([a,...ds]);return {pr:`<div class="sent">${q}</div>`,opts,ans:opts.indexOf(a),cls:'tx',key:q};}});},D(1400));}};
  draw();window.__plant={water:()=>wb.click(),next:()=>nb2.click(),get stage(){return stage;}};}
/* circuit */
function circuit(back){let wire=false,sw=false;O.setScreen('sTal','city',back);T.hudT('מַעְגָּל חַשְׁמַלִּי');O.sayNow='סִגְרוּ אֶת הַמַּעְגָּל כְּדֵי שֶׁהַנּוּרָה תִּדָּלֵק.';const s=$('#sTal');s.innerHTML='';
  const v=h('div','circ');const info=h('div','lcap','סִגְרוּ אֶת הַמַּעְגָּל כְּדֵי שֶׁהַנּוּרָה תִּדָּלֵק');const row=h('div','btnrow');const wb=h('button','bigbtn sm','🔌 <span>לְחַבֵּר חוּט</span>');const sb=h('button','bigbtn blue sm','🔘 <span>מֶתֶג</span>');row.append(wb,sb);s.append(v,info,row);
  const draw=()=>{const on=wire&&sw;v.innerHTML=`<svg viewBox="0 0 320 200" class="csvg" aria-hidden="true"><rect x="20" y="70" width="40" height="70" rx="4" fill="#3a3f45"/><rect x="30" y="62" width="20" height="10" fill="#9aa1a8"/><text x="40" y="112" text-anchor="middle" fill="#ffd166" font-weight="900" font-size="22">+</text>
    <path d="M40 62 V30 H140" stroke="#e4572e" stroke-width="6" fill="none"/>${wire?'<path d="M140 30 H200" stroke="#e4572e" stroke-width="6"/>':'<path d="M140 30 H200" stroke="#e4572e" stroke-width="3" stroke-dasharray="6 6" opacity=".35"/>'}
    <path d="M200 30 H280 V90" stroke="#e4572e" stroke-width="6" fill="none"/><circle cx="280" cy="110" r="22" fill="${on?'#ffe27a':'#e8eef2'}" stroke="#23303b" stroke-width="3"/>${on?'<circle cx="280" cy="110" r="38" fill="#ffe27a" opacity=".35"/>':''}<rect x="270" y="130" width="20" height="14" fill="#9aa1a8"/>
    <path d="M280 144 V175 H200" stroke="#3a8fc4" stroke-width="6" fill="none"/><line x1="200" y1="175" x2="${sw?140:150}" y2="${sw?175:150}" stroke="#23303b" stroke-width="6" stroke-linecap="round"/><circle cx="200" cy="175" r="6" fill="#23303b"/><circle cx="140" cy="175" r="6" fill="#23303b"/>
    <path d="M140 175 H40 V140" stroke="#3a8fc4" stroke-width="6" fill="none"/></svg>`;info.innerHTML=on?'💡 הַנּוּרָה דּוֹלֶקֶת! הַמַּעְגָּל סָגוּר.':!wire?'חָסֵר חוּט בַּמַּעְגָּל':'הַמֶּתֶג פָּתוּחַ';
    if(on){sfx.ok(2);row.querySelectorAll('button').forEach(b=>b.disabled=true);setTimeout(()=>{if(!v.isConnected)return;const Q=[['מָתַי הַנּוּרָה דּוֹלֶקֶת?','כְּשֶׁהַמַּעְגָּל סָגוּר',['כְּשֶׁיֵּשׁ פֶּתַח בַּחוּט','כְּשֶׁאֵין סוֹלְלָה']],['מָה נוֹתֵן אֶת הַחַשְׁמַל?','הַסּוֹלְלָה',['הַנּוּרָה','הַמֶּתֶג']],['מָה עוֹשֶׂה הַמֶּתֶג?','פּוֹתֵחַ וְסוֹגֵר אֶת הַמַּעְגָּל',['מְחַמֵּם אֶת הַחֶדֶר','מַשְׁמִיעַ מוּזִיקָה']]];
      quiz({id:'sci-circ',title:'מַעְגָּל חַשְׁמַלִּי',bg:'city',back,n:3,gen:i=>{const [q,a,ds]=Q[i];const opts=shuffle([a,...ds]);return {pr:`<div class="sent">${q}</div>`,opts,ans:opts.indexOf(a),cls:'tx',key:q};}});},D(1600));}};
  wb.onclick=()=>{wire=!wire;sfx.pop(2);draw();};sb.onclick=()=>{sw=!sw;sfx.key();draw();};draw();}
/* ice-water-steam */
function states(back){let temp=1;O.setScreen('sTal','mount',back);T.hudT('קֶרַח, מַיִם וְאֵדִים');O.sayNow='גְּרֹר אֶת הָעִגּוּל כְּדֵי לְקָרֵר אוֹ לְחַמֵּם.';const s=$('#sTal');s.innerHTML='';
  const v=h('div','statev');const rng=h('input','');rng.type='range';rng.min=0;rng.max=2;rng.value=1;rng.id='tempR';rng.className='trng';rng.setAttribute('aria-label','חום');
  const lab=h('div','lcap');const go=h('button','bigbtn',ICON.play+'<span>הַמְשֵׁךְ</span>');const rw=h('div','trw');rw.append(h('span','tre','❄️'),rng,h('span','tre','🔥'));go.hidden=true;const hint=h('div','lcap dnh','👆 גְּרֹר אֶת הָעִגּוּל ↔ לְקַר וּלְחַם');const seen=new Set([1]);s.append(v,rw,hint,lab,go);
  const draw=()=>{temp=+rng.value;v.innerHTML=temp===0?'<div class="ice">🧊</div>':temp===1?'<div class="wat">💧💧💧</div>':'<div class="steam">♨️</div>';lab.innerHTML=['קַר מְאוֹד: הַמַּיִם קוֹפְאִים לְקֶרַח','חַמִּים: מַיִם נוֹזְלִים','חַם מְאוֹד: הַמַּיִם רוֹתְחִים וְהוֹפְכִים לְאֵדִים'][temp];};
  rng.oninput=()=>{draw();sfx.pop(temp+1);seen.add(temp);if(seen.size>=3){go.hidden=false;hint.hidden=true;}};draw();
  go.onclick=()=>{const Q=[['מָה קוֹרֶה לְקֶרַח בַּשֶּׁמֶשׁ?','הוּא נָמֵס לְמַיִם',['הוּא נִהְיֶה אֶבֶן','הוּא נִהְיֶה גָּדוֹל']],['מָה קוֹרֶה לְמַיִם בַּמַּקְפִּיא?','הֵם קוֹפְאִים לְקֶרַח',['הֵם רוֹתְחִים','הֵם נֶעֱלָמִים']],['מָה יוֹצֵא מִקֻּמְקוּם רוֹתֵחַ?','אֵדִים',['קֶרַח','חוֹל']],['קֶרַח, מַיִם וְאֵדִים הֵם...','אוֹתוֹ חֹמֶר',['שְׁלוֹשָׁה דְּבָרִים שׁוֹנִים לְגַמְרֵי','סוּגִים שֶׁל אֶבֶן']]];
    quiz({id:'sci-states',title:'קֶרַח, מַיִם וְאֵדִים',bg:'mount',back,n:4,gen:i=>{const [q,a,ds]=Q[i];const opts=shuffle([a,...ds]);return {pr:`<div class="sent">${q}</div>`,opts,ans:opts.indexOf(a),cls:'tx',key:q};}});};}
/* day & night */
function dayNight(back){O.setScreen('sTal','final',back);T.hudT('יוֹם וְלַיְלָה');O.sayNow='גְּרֹר אֶת הָעִגּוּל וְסוֹבֵב אֶת כַּדּוּר הָאָרֶץ.';const s=$('#sTal');s.innerHTML='';let ang=0;
  const v=h('div','dnv');const lab=h('div','lcap');const rng=h('input','trng');rng.type='range';rng.min=0;rng.max=359;rng.value=0;rng.id='earthR';rng.setAttribute('aria-label','סיבוב');const go=h('button','bigbtn',ICON.play+'<span>הַמְשֵׁךְ</span>');go.hidden=true;const hint=h('div','lcap dnh','👆 גְּרֹר אֶת הָעִגּוּל ↔ וְסוֹבֵב אֶת כַּדּוּר הָאָרֶץ');s.append(v,rng,hint,lab,go);
  const draw=()=>{ang=+rng.value;const day=Math.cos(ang*Math.PI/180)>0;v.innerHTML=`<svg viewBox="0 0 320 180" class="csvg" aria-hidden="true"><circle cx="40" cy="90" r="30" fill="#ffcf4d"/><g stroke="#ffcf4d" stroke-width="4">${[0,1,2,3,4,5,6,7].map(k=>`<line x1="${40+38*Math.cos(k*Math.PI/4)}" y1="${90+38*Math.sin(k*Math.PI/4)}" x2="${40+46*Math.cos(k*Math.PI/4)}" y2="${90+46*Math.sin(k*Math.PI/4)}"/>`).join('')}</g>
    <circle cx="220" cy="90" r="60" fill="#3a8fc4"/><path d="M220 30 A60 60 0 0 1 220 150 Z" fill="rgba(10,15,40,.55)"/><g transform="rotate(${-ang} 220 90)"><rect x="152" y="80" width="14" height="14" fill="#e4572e"/><path d="M150 80 L159 70 L168 80Z" fill="#94613a"/></g></svg>`;
    lab.innerHTML=day?'☀️ בַּבַּיִת שֶׁל אוֹרֶן עַכְשָׁו יוֹם':'🌙 בַּבַּיִת שֶׁל אוֹרֶן עַכְשָׁו לַיְלָה';};
  rng.oninput=()=>{draw();if(Math.cos(ang*Math.PI/180)<0){go.hidden=false;hint.hidden=true;}};draw();
  go.onclick=()=>{const Q=[['לָמָּה יֵשׁ יוֹם וְלַיְלָה?','כַּדּוּר הָאָרֶץ מִסְתּוֹבֵב',['הַשֶּׁמֶשׁ הוֹלֶכֶת לִישֹׁן','הָעֲנָנִים מַסְתִּירִים']],['כְּשֶׁאֶצְלֵנוּ יוֹם, בַּצַּד הַשֵּׁנִי שֶׁל כַּדּוּר הָאָרֶץ...','לַיְלָה',['גַּם יוֹם','שֶׁלֶג']],['מָה מֵאִיר לָנוּ בַּיּוֹם?','הַשֶּׁמֶשׁ',['הַיָּרֵחַ','הַכּוֹכָבִים']]];
    quiz({id:'sci-day',title:'יוֹם וְלַיְלָה',bg:'final',back,n:3,gen:i=>{const [q,a,ds]=Q[i];const opts=shuffle([a,...ds]);return {pr:`<div class="sent">${q}</div>`,opts,ans:opts.indexOf(a),cls:'tx',key:q};}});};}
const bodyFig=(x,y)=>`<div class="bodyf">${O.AV()}<span class="arrow" style="left:${x}%;top:${y}%"></span></div>`;
building({id:'lab',name:'הַמַּעְבָּדָה',color:'#3cb371',bg:'mount',icon:()=>X.flask,blurb:'נִסּוּיִים קְטַנִּים: מְנַחֲשִׁים, בּוֹדְקִים וְלוֹמְדִים.',acts:[
  {id:'sci-float',name:'צָף אוֹ שׁוֹקֵעַ?',icon:()=>X.boat,run:back=>quiz({id:'sci-float',pool:1,title:'צָף אוֹ שׁוֹקֵעַ?',bg:'sea',back,n:5,gen:()=>{const [n,k,f,g]=pick(FLOAT);const fm=g==='f';return {pr:`${tank(k)}<div class="qq">${n}: ${fm?'תָּצוּף אוֹ תִּשְׁקַע?':'יָצוּף אוֹ יִשְׁקַע?'}</div>`,opts:fm?['תָּצוּף','תִּשְׁקַע']:['יָצוּף','יִשְׁקַע'],ans:f?0:1,cls:'tx',key:n,reveal:el=>{const it=el.querySelector('#itm');if(it)it.classList.add(f?'floats':'sinks');sfx.plank();},explain:`${n} ${f?(fm?'צָפָה':'צָף'):(fm?'שׁוֹקַעַת':'שׁוֹקֵעַ')}!`};}})},
  {id:'sci-mag',name:'מַגְנֵטִים',icon:()=>X.magnet,run:back=>quiz({id:'sci-mag',lesson:'sci-mag',pool:1,title:'מַגְנֵטִים',bg:'city',back,n:5,gen:()=>{const [n,k,m]=pick(MAG);return {pr:`<div class="magv"><span class="mg">${X.magnet}</span><span class="item" id="itm">${ALLSPR(k)}</span></div><div class="qq">הַאִם הַמַּגְנֵט יִמְשֹׁךְ אֶת ${n}?</div>`,opts:['כֵּן','לֹא'],ans:m?0:1,cls:'tx',key:n,reveal:el=>{const it=el.querySelector('#itm');if(it&&m)it.classList.add('pulled');},explain:m?'מַגְנֵט מוֹשֵׁךְ בַּרְזֶל וּפְלָדָה.':'מַגְנֵט לֹא מוֹשֵׁךְ עֵץ, אֶבֶן, פְּלַסְטִיק אוֹ אֹכֶל.'};}})},
  {id:'sci-animals',name:'מִיּוּן בַּעֲלֵי חַיִּים',icon:()=>SPR.owl,run:back=>quiz({id:'sci-animals',lesson:'sci-groups',pool:1,title:'מִיּוּן בַּעֲלֵי חַיִּים',bg:'forest',back,n:5,gen:()=>{const [n,k,c,ex,fm]=pick(ANIMALS);return {pr:`<span class="pic">${ALLSPR(k)}</span><div class="qq">${n} ${fm?'הִיא':'הוּא'}...</div>`,opts:CLASSES,ans:CLASSES.indexOf(c),cls:'tx',key:n,explain:ex||''};}})},
  {id:'sci-body',name:'גּוּף הָאָדָם',icon:()=>O.AV(),run:back=>quiz({id:'sci-body',pool:1,title:'גּוּף הָאָדָם',bg:'valley',back,n:5,gen:()=>{const [n,[x,y]]=pick(BODY);const opts=shuffle([n,...shuffle(BODY.filter(b=>b[0]!==n)).slice(0,2).map(b=>b[0])]);return {pr:`${bodyFig(x,y)}<div class="qq">מָה מְסֻמָּן בַּחֵץ?</div>`,opts,ans:opts.indexOf(n),cls:'tx',key:n};}})},
  {id:'sci-plant',name:'מָה צָרִיךְ צֶמַח?',icon:()=>SPR.flower,run:plant},
  {id:'sci-states',name:'קֶרַח, מַיִם וְאֵדִים',icon:()=>'<span style="font-size:34px">🧊</span>',run:states},
  {id:'sci-day',name:'יוֹם וְלַיְלָה',icon:()=>X.moon,run:dayNight},
  {id:'sci-circ',name:'מַעְגָּל חַשְׁמַלִּי',icon:()=>'<span style="font-size:34px">💡</span>',run:circuit}]});
})();

/* ===== ART STUDIO ===== */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$,rand,pick,shuffle,ICON,SPR}=O;const {X,building,quiz}=T;const sfx=O.sfx,D=O.D;
const PAL=['#1d2631','#ffffff','#e63946','#ff8a3d','#ffd166','#4fae4f','#2d6a4f','#7fd6f5','#3a8fc4','#24467a','#8e6fd1','#ff9cc2','#94613a','#e9c8a0','#8d939a','#c9e86a'];
const HEX='0123456789abcdef';const N=16;
function artSVG(str,cls){if(!str)return '';let r='';for(let i=0;i<N*N;i++){const c=str[i];if(c&&c!=='.')r+=`<rect x="${i%N}" y="${(i/N)|0}" width="1.05" height="1.05" fill="${PAL[HEX.indexOf(c)]}"/>`;}
  return `<svg class="${cls||'artsvg'}" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><rect width="16" height="16" fill="#fffaf0"/>${r}</svg>`;}
window.TAL_artSVG=s=>artSVG(s,'artsvg framed');
/* --- pixel editor: 8 colours, 3 tools, one save (the saved picture hangs in the kingdom) --- */
const EDPAL=[0,2,3,4,5,8,10,12];
function editor(back){let cells='.'.repeat(N*N).split('');let col=2,tool='brush',editing=null;
  O.setScreen('sTal','valley',back);T.hudT('סְטוּדְיוֹ פִּיקְסֶלִים');O.sayNow='צַיְּרוּ צִיּוּר מִשֶּׁלָּכֶם.';const s=$('#sTal');s.innerHTML='';
  const wrap=h('div','pxed');const grid=h('div','pxg');grid.style.setProperty('--n',N);
  for(let i=0;i<N*N;i++){const c=h('i','px');c.dataset.i=i;grid.appendChild(c);}
  const pal=h('div','pxpal');EDPAL.forEach((k,j)=>{const b=h('button','sw'+(k===col?' on':''));b.style.background=PAL[k];b.setAttribute('aria-label','צבע '+(j+1));b.onclick=()=>{col=k;if(tool==='erase')setTool('brush');pal.querySelectorAll('.sw').forEach((x,q)=>x.classList.toggle('on',q===j));sfx.pop(2);};pal.appendChild(b);});
  const tools=h('div','pxtools');const TB={};
  [['brush','🖌️','מִכְחוֹל'],['fill','🪣','דְּלִי'],['erase','🧽','מַחַק']].forEach(([id,ic,nm])=>{const b=h('button','tbtn'+(id===tool?' on':''),`<span>${ic}</span><small>${nm}</small>`);b.onclick=()=>setTool(id);TB[id]=b;tools.appendChild(b);});
  function setTool(t){tool=t;Object.entries(TB).forEach(([k,b])=>b.classList.toggle('on',k===t));sfx.pop(1);}
  function draw(){const ch=grid.children;for(let i=0;i<N*N;i++){const c=cells[i];ch[i].style.background=c==='.'?'':PAL[HEX.indexOf(c)];}}
  function paint(i){const v=tool==='erase'?'.':HEX[col];if(tool==='fill'){flood(i,v);draw();sfx.pop(4);return;}
    if(cells[i]!==v){cells[i]=v;draw();sfx.key&&sfx.key();}}
  function flood(i,v){const from=cells[i];if(from===v)return;const st=[i];while(st.length){const j=st.pop();if(cells[j]!==from)continue;cells[j]=v;const x=j%N,y=(j/N)|0;if(x>0)st.push(j-1);if(x<N-1)st.push(j+1);if(y>0)st.push(j-N);if(y<N-1)st.push(j+N);}}
  let down=false;const at=e=>{const r=grid.getBoundingClientRect();const x=Math.floor((e.clientX-r.left)/r.width*N),y=Math.floor((e.clientY-r.top)/r.height*N);return x>=0&&y>=0&&x<N&&y<N?y*N+x:-1;};
  grid.onpointerdown=e=>{e.preventDefault();down=true;try{grid.setPointerCapture(e.pointerId);}catch(_){}const i=at(e);if(i>=0)paint(i);};
  grid.onpointermove=e=>{if(!down||tool==='fill')return;const i=at(e);if(i>=0)paint(i);};
  grid.onpointerup=grid.onpointercancel=()=>{down=false;};
  const row=h('div','btnrow');const sv=h('button','bigbtn','<span>שְׁמֹר</span>');row.append(sv);
  sv.onclick=()=>{const str=cells.join('');if(!/[^.]/.test(str)){O.floatText(sv,'עוֹד רֵיק!');sfx.no();return;}const s=T.S();
    if(editing!=null&&s.art[editing]!=null)s.art[editing]=str;else{if(s.art.length>=12){s.art.shift();if(s.kpic!=null)s.kpic=s.kpic>0?s.kpic-1:null;}s.art.push(str);editing=s.art.length-1;}
    s.kpic=editing;s.artT=s.kpicT=Date.now();const first=!(s.tl['art-draw']);T.record('art-draw',3);if(first)O.addGems(10,sv);sfx.build&&sfx.build();O.burst(...O.center(grid),30);O.floatText(sv,'נִשְׁמַר!');};
  wrap.append(grid,h('div','pxside'));wrap.lastChild.append(pal,tools);s.append(wrap,row);draw();
  T.setKey(null);
  window.__art={paint:(i,c)=>{col=c;tool='brush';paint(i);},fill:(i,c)=>{col=c;tool='fill';paint(i);setTool('brush');},save:()=>sv.click(),get cells(){return cells.join('');}};}
/* --- colour mixing --- */
const CN={red:['אָדֹם','#e63946'],yellow:['צָהֹב','#ffd166'],blue:['כָּחֹל','#3a8fc4'],white:['לָבָן','#ffffff'],black:['שָׁחֹר','#1d2631'],orange:['כָּתֹם','#ff8a3d'],green:['יָרֹק','#4fae4f'],purple:['סָגֹל','#8e6fd1'],pink:['וָרֹד','#ff9cc2'],sky:['תְּכֵלֶת','#9ad8f5'],gray:['אָפֹר','#8d939a'],brown:['חוּם','#94613a']};
const MIX=[['red','yellow','orange'],['blue','yellow','green'],['blue','red','purple'],['red','white','pink'],['blue','white','sky'],['black','white','gray']];
const blob=k=>`<span class="blob" style="--c:${CN[k][1]}"></span>`;
const swatch=k=>`<span class="swc" style="--c:${CN[k][1]}"></span><span>${CN[k][0]}</span>`;
function mixLab(back){O.setScreen('sTal','valley',back);T.hudT('מְעַרְבְּבִים צְבָעִים');O.sayNow='בַּחֲרוּ שְׁנֵי צְבָעִים וְעַרְבְּבוּ.';const s=$('#sTal');s.innerHTML='';const base=['red','yellow','blue','white','black'];let sel=[];
  const pot=h('div','mixpot','<div class="potc"></div>');const lab=h('div','lcap','בַּחֲרוּ שְׁנֵי צְבָעִים וְעַרְבְּבוּ');const row=h('div','mixrow');
  base.forEach(k=>{const b=h('button','mixb',blob(k)+`<span>${CN[k][0]}</span>`);b.onclick=()=>{sel.push(k);if(sel.length>2)sel=sel.slice(-2);sfx.pop(2);show();};row.appendChild(b);});
  const show=()=>{const p=pot.firstChild;if(sel.length<2){p.style.background=sel[0]?CN[sel[0]][1]:'#e8eef2';lab.innerHTML=sel.length?`${CN[sel[0]][0]} + ...`:'בַּחֲרוּ שְׁנֵי צְבָעִים וְעַרְבְּבוּ';return;}
    const m=MIX.find(x=>(x[0]===sel[0]&&x[1]===sel[1])||(x[0]===sel[1]&&x[1]===sel[0]));p.classList.remove('swirl');void p.offsetWidth;p.classList.add('swirl');
    if(sel[0]===sel[1]){p.style.background=CN[sel[0]][1];lab.innerHTML=`${CN[sel[0]][0]} + ${CN[sel[0]][0]} = ${CN[sel[0]][0]}`;}
    else if(m){p.style.background=CN[m[2]][1];lab.innerHTML=`${CN[sel[0]][0]} + ${CN[sel[1]][0]} = <b>${CN[m[2]][0]}</b>!`;sfx.ok(2);tried.add(m[2]);go.hidden=false;}
    else{const wk=sel.includes('white')?'white':'black',oth=sel[0]===wk?sel[1]:sel[0];const hx=c=>[1,3,5].map(k=>parseInt(c.slice(k,k+2),16));const a=hx(CN[oth][1]),b=hx(CN[wk][1]);const m=a.map((v,k)=>Math.round(v*.6+b[k]*.4));
      p.style.background=`rgb(${m.join(',')})`;lab.innerHTML=`${CN[sel[0]][0]} + ${CN[sel[1]][0]} = ${CN[oth][0]} ${wk==='white'?'בָּהִיר':'כֵּהֶה'}`;sfx.ok(1);}
    sel=[];};
  const tried=new Set();const go=h('button','bigbtn',ICON.play+'<span>הַמְשֵׁךְ</span>');go.hidden=true;go.onclick=()=>mixQuiz(back);const r2=h('div','btnrow');r2.appendChild(go);
  s.append(pot,lab,row,r2);show();}
function mixQuiz(back){quiz({id:'art-mix',title:'מְעַרְבְּבִים צְבָעִים',bg:'valley',back,n:6,gen:i=>{const m=MIX[i%MIX.length];const rev=Math.random()<.35&&i>2;
  if(rev){const opts=shuffle([m[1],...shuffle(['red','blue','yellow','white','black'].filter(x=>x!==m[0]&&x!==m[1])).slice(0,2)]);return {pr:`<div class="mixq">${blob(m[0])}<b>+</b><span class="blob q">?</span><b>=</b>${blob(m[2])}</div><div class="qq">${CN[m[0]][0]} וְעוֹד אֵיזֶה צֶבַע נוֹתְנִים ${CN[m[2]][0]}?</div>`,opts:opts.map(swatch),ans:opts.indexOf(m[1]),cls:'tx sw2',key:'r'+m[2]};}
  const opts=shuffle([m[2],...shuffle(['orange','green','purple','pink','sky','gray','brown'].filter(x=>x!==m[2])).slice(0,2)]);
  return {pr:`<div class="mixq">${blob(m[0])}<b>+</b>${blob(m[1])}<b>=</b><span class="blob q">?</span></div><div class="qq">${CN[m[0]][0]} וְ${CN[m[1]][0]} נוֹתְנִים...</div>`,opts:opts.map(swatch),ans:opts.indexOf(m[2]),cls:'tx sw2',key:m[2],
    reveal:el=>{const q=el.querySelector('.blob.q');if(q){q.textContent='';q.style.setProperty('--c',CN[m[2]][1]);q.classList.remove('q');}}};}});}
/* --- symmetry --- */
function symmetry(back){const R=T.pathN(5),M=8;let r=0,err=0,gems=0;O.setScreen('sTal','valley',back);const s=$('#sTal');
  const run=()=>{T.hudT('סִימֶטְרִיָּה',T.progressBar(r,R));O.sayNow='השלימו את הצד השני כמו במראה';
    const colr=pick([2,8,5,10,3]);const tgt=[];for(let y=0;y<M;y++)for(let x=0;x<M/2;x++)tgt[y*M+x]=Math.random()<.34+r*.05?1:0;
    for(let y=0;y<M;y++){let any=0;for(let x=0;x<M/2;x++)any|=tgt[y*M+x];if(!any&&y%2===0)tgt[y*M+rand(0,M/2-1)]=1;}
    const cur=Array(M*M).fill(0);s.innerHTML='';s.appendChild(h('div','lsent','הַשְׁלִימוּ אֶת הַצַּד הַשֵּׁנִי — כְּמוֹ בַּמַּרְאָה 🦋'));
    const g=h('div','symg');g.style.setProperty('--n',M);
    for(let i=0;i<M*M;i++){const x=i%M;const c=h('button','sc'+(x<M/2?' given':'')+(x===M/2-1?' edge':''));if(x<M/2){if(tgt[i])c.style.background=PAL[colr];c.disabled=true;c.tabIndex=-1;}
      else c.onclick=()=>{cur[i]^=1;c.style.background=cur[i]?PAL[colr]:'';c.classList.remove('bad');sfx.key&&sfx.key();};c.dataset.i=i;g.appendChild(c);}
    const row=h('div','btnrow');const chk=h('button','bigbtn',SPR.star+'<span>בְּדִיקָה</span>');row.appendChild(chk);s.append(g,row);if(window.LESSONS)s.appendChild(window.LESSONS.againBtn('art-sym',back,()=>symmetry(back)));let tries=0;
    chk.onclick=()=>{let bad=0;for(let y=0;y<M;y++)for(let x=M/2;x<M;x++){const i=y*M+x;const want=tgt[y*M+(M-1-x)];if(cur[i]!==want){bad++;g.children[i].classList.add('bad');}}
      if(!bad){sfx.ok(r);const gg=tries?1:3;gems+=gg;O.addGems(gg,chk);chk.disabled=true;g.classList.add('done');setTimeout(()=>{if(!g.isConnected)return;r++;if(r>=R){T.setKey(null);T.finishAct('art-sym',err,R,gems,back,()=>symmetry(back));}else run();},D(1100));}
      else{tries++;err++;sfx.no();setTimeout(()=>g.querySelectorAll('.bad').forEach(c=>c.classList.remove('bad')),D(1200));
        if(tries>=3){for(let y=0;y<M;y++)for(let x=M/2;x<M;x++){const i=y*M+x;cur[i]=tgt[y*M+(M-1-x)];g.children[i].style.background=cur[i]?PAL[colr]:'';}O.floatText(chk,'כָּךְ זֶה נִרְאֶה');}}};
    window.__sym={solve:()=>{for(let y=0;y<M;y++)for(let x=M/2;x<M;x++){const i=y*M+x;cur[i]=tgt[y*M+(M-1-x)];}chk.click();}};};
  run();}
/* --- colour by number (each cell = exercise) --- */
/* 6x6 pictures, 2-3 colours each; every answer is one digit */
const PICS=[
 {n:'לֵב',p:['RR..RR','RPRRRR','RRRRRR','RRRRRR','.RRRR.','..RR..'],c:{R:2,P:11}},
 {n:'עֵץ',p:['..GG..','.GGGG.','GGGGGG','.GGGG.','..BB..','..BB..'],c:{G:5,B:12}},
 {n:'בַּיִת',p:['..RR..','.RRRR.','RRRRRR','.WWWW.','.WBWW.','.WBWW.'],c:{R:2,W:13,B:12}},
 {n:'דָּג',p:['..OO..','.OOO.O','OEOOOO','OOOOOO','.OOO.O','..OO..'],c:{O:3,E:0}},
 {n:'פִּטְרִיָּה',p:['.RRRR.','RWRRWR','RRRRRR','..WW..','..WW..','.WWWW.'],c:{R:2,W:13}},
 {n:'כּוֹכָב',p:['..YY..','..YY..','YYOOYY','.YOOY.','.YYYY.','YY..YY'],c:{Y:4,O:3}}];
function exFor(ans,lvl){const t=lvl===0?pick(['+','-']):lvl===1?pick(['+','-','+']):pick(['×','+','-']);
  if(t==='×'){const f=[];for(let a=2;a<=ans/2;a++)if(ans%a===0)f.push(a);if(f.length){const a=pick(f);return `${a}×${ans/a}`;}}
  if(t==='-'&&ans<9){const b=rand(1,9-ans);return `${ans+b}-${b}`;}const a=rand(1,ans-1);return `${a}+${ans-a}`;}
function colorByNum(back,pi){const lvl=Math.min(2,((T.S().tl['art-cbn']||{}).n|0)>>1);pi=pi==null?((T.S().tl['art-cbn']||{}).n|0)%PICS.length:pi;const P=PICS[pi];const M=6;
  O.setScreen('sTal','valley',back);T.hudT('צְבִיעָה לְפִי מִסְפָּרִים');O.sayNow='פִּתְרוּ אֶת הַתַּרְגִּיל, וְצִבְעוּ בַּצֶּבַע שֶׁל הַתְּשׁוּבָה.';const s=$('#sTal');s.innerHTML='';
  const keys=Object.keys(P.c);const nums=shuffle([2,3,4,5,6,7,8,9]).slice(0,keys.length);const ansOf={};keys.forEach((k,j)=>ansOf[k]=nums[j]);
  let sel=0,err=0,left=0;const legend=h('div','cleg');
  keys.forEach((k,j)=>{const b=h('button','lg'+(j===0?' on':''),`<span class="swc" style="--c:${PAL[P.c[k]]}"></span><b>${ansOf[k]}</b>`);b.onclick=()=>{sel=j;legend.querySelectorAll('.lg').forEach((x,q)=>x.classList.toggle('on',q===j));sfx.pop(2);};legend.appendChild(b);});
  const g=h('div','cbn');g.style.setProperty('--n',M);
  P.p.forEach((row,y)=>[...row].forEach((ch,x)=>{const c=h('button','cbc');if(ch==='.'){c.classList.add('bg');c.disabled=true;c.tabIndex=-1;}
    else{left++;c.textContent=exFor(ansOf[ch],lvl);c.onclick=()=>{if(c.classList.contains('done'))return;const k=keys[sel];
      if(k===ch){c.classList.add('done');c.style.background=PAL[P.c[ch]];c.textContent='';sfx.pop(3+((left%4)));left--;if(left===0)win();}
      else{err++;c.classList.add('bad');sfx.no();setTimeout(()=>c.classList.remove('bad'),D(500));}};c.dataset.k=ch;}
    g.appendChild(c);}));
  s.append(legend,g);
  function win(){g.classList.add('done');sfx.build&&sfx.build();setTimeout(()=>{if(!g.isConnected)return;T.setKey(null);T.finishAct('art-cbn',Math.floor(err/2),12,4,back,()=>colorByNum(back),`גִּלִּיתָ: ${P.n}!`);},D(900));}
  T.setKey(e=>{const n=+e.key;if(n>=1&&n<=keys.length)legend.children[n-1].click();});
  window.__cbn={solve:()=>{[...g.children].forEach(c=>{if(c.dataset.k&&!c.classList.contains('done')){sel=keys.indexOf(c.dataset.k);c.click();}});},ans:ansOf,get left(){return left;}};}
building({id:'art',name:'סְטוּדְיוֹ הָאָמָּנוּת',color:'#ff7eb6',bg:'valley',icon:()=>X.palette,blurb:'מְצַיְּרִים, מְעַרְבְּבִים צְבָעִים וּמְגַלִּים תְּמוּנוֹת.',acts:[
  {id:'art-draw',name:'סְטוּדְיוֹ פִּיקְסֶלִים',icon:()=>X.pencil,long:1,run:back=>editor(back)},
  {id:'art-cbn',name:'צְבִיעָה לְפִי מִסְפָּרִים',icon:()=>X.palette,run:back=>colorByNum(back)},
  {id:'art-mix',name:'מְעַרְבְּבִים צְבָעִים',icon:()=>X.flask,run:mixLab},
  {id:'art-sym',name:'סִימֶטְרִיָּה',icon:()=>'<span style="font-size:34px">🦋</span>',run:back=>window.LESSONS?window.LESSONS.first('art-sym',back,()=>symmetry(back)):symmetry(back)}]});
})();

/* ===== MINDFULNESS GROVE ===== */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$,rand,ICON,SPR}=O;const {X,FACES,building}=T;const sfx=O.sfx,D=O.D;
let amb=null,timers=[];
const clearT=()=>{timers.forEach(t=>{clearTimeout(t);clearInterval(t);});timers=[];};
let guard=null;const later=(f,ms)=>{const g=guard;const t=setTimeout(()=>{if(g&&!g.isConnected)return;f();},ms);timers.push(t);return t;};
function stopAmb(){if(amb){try{amb.stop();}catch(e){}amb=null;}}
const quiet=()=>{O.musicStop();O.hush&&O.hush();};
const leave=back=>()=>{clearT();stopAmb();if((O.save.snd|0)>=2)O.musicStart();back();};
function soft(f,dur,vol){const a=O.audio();if(!a||(O.save.snd|0)<1)return;O.tone(f,a.ctx.currentTime+.02,dur,{type:'sine',vol:vol||.12,rel:dur*.6,bus:a.sfxBus});}
/* --- breathing --- */
function breath(back,cycles){cycles=cycles||5;clearT();const bk=leave(back);O.setScreen('sTal','forest',bk);quiet();T.hudT('נְשִׁימַת בּוּעָה');O.sayNow='נוֹשְׁמִים יַחַד עִם הַבּוּעָה.';const s=$('#sTal');s.innerHTML='';
  const v=h('div','breathv','<div class="bub"><span class="bt"></span></div><div class="bc"></div>');const lab=h('div','lsent blab','נוֹשְׁמִים יַחַד עִם הַבּוּעָה');s.append(v,lab);
  const bub=v.querySelector('.bub'),bt=v.querySelector('.bt'),bc=v.querySelector('.bc');let c=0;guard=v;
  const IN=D(4000),HOLD=D(2000),OUT=D(5000);
  const step=()=>{if($('#sTal').hidden)return clearT();if(c>=cycles){done();return;}bc.innerHTML=Array.from({length:cycles},(_,k)=>`<i class="${k<c?'on':''}"></i>`).join('');
    bub.style.transitionDuration=IN+'ms';bub.className='bub grow';bt.textContent='';lab.textContent='שְׁאַף...';soft(262,IN/1000,.07);
    later(()=>{bub.className='bub grow hold';lab.textContent='הַחְזֵק';later(()=>{bub.style.transitionDuration=OUT+'ms';bub.className='bub';lab.textContent='נְשֹׁף...';soft(196,OUT/1000,.06);later(()=>{c++;step();},OUT);},HOLD);},IN);};
  later(step,D(600));
  function done(){bc.innerHTML='';bt.textContent='😊';lab.innerHTML='יָפֶה מְאוֹד! אֵיךְ אַתָּה מַרְגִּישׁ עַכְשָׁו?';sfx.star(0);T.record('mind-breath',3);O.addGems(4);
    const row=h('div','faces sm');['calm','happy','tired','sad'].forEach(k=>{const b=h('button','face',`${FACES[k].s}<span>${FACES[k].n}</span>`);b.onclick=()=>{logMood(k);sfx.pop(3);bk();};row.appendChild(b);});s.appendChild(row);}
  window.__breath={finish:()=>{clearT();c=cycles;done();}};}
/* --- calm sounds --- */
const AMB={rain:['גֶּשֶׁם','🌧️'],waves:['גַּלִּים','🌊'],wind:['רוּחַ','🍃'],birds:['צִפּוֹרִים','🐦'],night:['לַיְלָה בַּשָּׂדֶה','🦗']};
function makeAmb(kind){const a=O.audio();if(!a)return null;const c=a.ctx,out=c.createGain();out.gain.value=0;out.connect(a.master);out.gain.setTargetAtTime(.9,c.currentTime,.8);
  const len=c.sampleRate*3,buf=c.createBuffer(1,len,c.sampleRate),d=buf.getChannelData(0);let last=0;for(let i=0;i<len;i++){const w=Math.random()*2-1;last=(last+.02*w)/1.02;d[i]=kind==='waves'||kind==='wind'?last*3.5:w;}
  const nodes=[],ivs=[];const src=c.createBufferSource();src.buffer=buf;src.loop=true;const f=c.createBiquadFilter();const g=c.createGain();src.connect(f).connect(g).connect(out);nodes.push(src);
  if(kind==='rain'){f.type='lowpass';f.frequency.value=2200;g.gain.value=.16;ivs.push(setInterval(()=>{const t=c.currentTime;for(let k=0;k<3;k++)O.noise(t+Math.random()*.3,.03,{ft:'bandpass',f:2500+Math.random()*3000,q:6,vol:.05,bus:out});},300));}
  else if(kind==='waves'){f.type='lowpass';f.frequency.value=700;g.gain.value=.0;const lfo=c.createOscillator(),lg=c.createGain();lfo.frequency.value=.11;lg.gain.value=.5;lfo.connect(lg).connect(g.gain);const off=c.createConstantSource?c.createConstantSource():null;if(off){off.offset.value=.55;off.connect(g.gain);off.start();nodes.push(off);}else g.gain.value=.5;lfo.start();nodes.push(lfo);}
  else if(kind==='wind'){f.type='bandpass';f.Q.value=1.2;f.frequency.value=500;g.gain.value=.9;const lfo=c.createOscillator(),lg=c.createGain();lfo.frequency.value=.07;lg.gain.value=300;lfo.connect(lg).connect(f.frequency);lfo.start();nodes.push(lfo);}
  else if(kind==='birds'){f.type='lowpass';f.frequency.value=500;g.gain.value=.03;const chirp=()=>{const t=c.currentTime+Math.random()*.4,b=2000+Math.random()*1800,n=rand(2,5);for(let k=0;k<n;k++)O.tone(b,t+k*.11,.08,{type:'sine',vol:.05,slide:b*(1.2+Math.random()*.3),bus:out});};ivs.push(setInterval(()=>{if(Math.random()<.6)chirp();},900));}
  else{f.type='lowpass';f.frequency.value=400;g.gain.value=.03;ivs.push(setInterval(()=>{const t=c.currentTime;for(let k=0;k<3;k++)O.tone(4200,t+k*.06,.03,{type:'square',vol:.012,bus:out});},700));
    ivs.push(setInterval(()=>{if(Math.random()<.3)O.tone(330,c.currentTime,.25,{type:'sine',vol:.04,slide:300,bus:out});},2300));}
  src.start();
  return {stop:()=>{ivs.forEach(clearInterval);out.gain.setTargetAtTime(0,c.currentTime,.3);setTimeout(()=>{nodes.forEach(n=>{try{n.stop();}catch(e){}});out.disconnect();},1500);}};}
function sounds(back){clearT();stopAmb();const bk=leave(back);O.setScreen('sTal','forest',bk);quiet();T.hudT('צְלִילִים מַרְגִּיעִים');O.sayNow='בְּחַר צְלִיל, עֲצֹם עֵינַיִם וְהַקְשֵׁב.';const s=$('#sTal');s.innerHTML='';let cur=null,t0=0;
  s.appendChild(h('div','lsent','בְּחַר צְלִיל, עֲצֹם עֵינַיִם וְהַקְשֵׁב 🎧'));const g=h('div','ambg');
  Object.entries(AMB).forEach(([k,[n,e]])=>{const b=h('button','ambb',`<span class="ae">${e}</span><span>${n}</span>`);b.onclick=()=>{stopAmb();g.querySelectorAll('.ambb').forEach(x=>x.classList.remove('on'));if(cur===k){cur=null;return;}cur=k;b.classList.add('on');amb=makeAmb(k);if(!t0)t0=Date.now();};g.appendChild(b);});
  const tm=h('div','lcap');s.append(g,tm);const iv=setInterval(()=>{if($('#sTal').hidden){clearInterval(iv);stopAmb();return;}if(t0&&cur){const sec=((Date.now()-t0)/1000)|0;tm.textContent=`🕰️ ${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;if(sec>=45&&!(T.S().tl['mind-sounds']||{}).n){T.record('mind-sounds',3);O.addGems(3);}else if(sec===45)T.record('mind-sounds',3);}},1000);timers.push(iv);}
/* --- feelings check-in --- */
const REPLY={happy:['אֵיזֶה כֵּיף! 🌞','רוֹצֶה לְהוֹסִיף מַשֶּׁהוּ לְצִנְצֶנֶת הַתּוֹדָה?','mind-jar'],calm:['נִפְלָא. רֹגַע זֶה כֹּחַ.','אֶפְשָׁר לְהַקְשִׁיב לִצְלִילִים מַרְגִּיעִים.','mind-sounds'],excited:['וָאוּ, יֵשׁ לְךָ הַרְבֵּה אֵנֶרְגִּיָּה!','נְשִׁימָה אַחַת אֲרֻכָּה עוֹזֶרֶת לְהִתְרַכֵּז.','mind-breath'],
  tired:['זֶה בְּסֵדֶר לִהְיוֹת עָיֵף.','אוּלַי מְתִיחָה קְטַנָּה אוֹ סְרִיקַת גּוּף?','mind-scan'],sad:['זֶה בְּסֵדֶר לִהְיוֹת עָצוּב. כָּל רֶגֶשׁ עוֹבֵר.','אֶפְשָׁר לְסַפֵּר לְמִישֶׁהוּ שֶׁאוֹהֵב אוֹתְךָ, אוֹ לִנְשֹׁם יַחַד.','mind-breath'],angry:['גַּם כַּעַס הוּא רֶגֶשׁ רָגִיל.','בּוֹא נִנְשֹׁם לְאַט כְּמוֹ בּוּעָה, וְהַכַּעַס יִקְטַן.','mind-breath']};
function logMood(k){const s=T.S();s.mood.push({d:O.today(),f:k,t:Date.now()});if(s.mood.length>120)s.mood=s.mood.slice(-120);s.moodT=Date.now();O.persist();}
function feel(back){clearT();O.setScreen('sTal','forest',back);T.hudT('אֵיךְ אֲנִי מַרְגִּישׁ?');O.sayNow='איך אתה מרגיש היום?';const s=$('#sTal');s.innerHTML='';
  s.appendChild(h('div','whead',`<h1>אֵיךְ אַתָּה מַרְגִּישׁ עַכְשָׁו?</h1>`));const g=h('div','faces');
  Object.entries(FACES).forEach(([k,f])=>{const b=h('button','face',`${f.s}<span>${f.n}</span>`);b.onclick=()=>{logMood(k);T.record('mind-feel',3);sfx.ok(1);const [a,b2,act]=REPLY[k];s.innerHTML='';
    s.appendChild(h('div','fresp',`<div class="fbig">${f.s}</div><h2>${a}</h2><div class="lsent">${b2}</div>`));O.say(a+' '+b2);const row=h('div','btnrow');
    const go=h('button','bigbtn',ICON.play+'<span>בּוֹא נְנַסֶּה</span>');go.onclick=()=>T.ACT[act].run(back);const no=h('button','bigbtn plain sm','<span>לֹא עַכְשָׁו</span>');no.onclick=back;row.append(no,go);s.appendChild(row);};g.appendChild(b);});
  s.appendChild(g);const hist=T.S().mood.slice(-7);if(hist.length)s.appendChild(h('div','mhist',`<span>הָרְגָשׁוֹת הָאַחֲרוֹנִים שֶׁלִּי:</span>${hist.map(m=>FACES[m.f]?`<i>${FACES[m.f].s}</i>`:'').join('')}`));}
/* --- gratitude jar --- */
const THX=[['🏠','הַמִּשְׁפָּחָה שֶׁלִּי'],['🧑‍🤝‍🧑','חֲבֵרִים'],['🐱','חַיּוֹת'],['🍎','אֹכֶל טָעִים'],['☀️','מֶזֶג אֲוִיר יָפֶה'],['⚽','מִשְׂחָק בַּחוּץ'],['📚','סִפּוּר טוֹב'],['🎨','צִיּוּר'],['🛏️','מִטָּה חַמָּה'],['🎵','מוּזִיקָה'],['🤗','חִבּוּק'],['🏫','מַשֶּׁהוּ שֶׁלָּמַדְתִּי']];
/* the kid sees 6 of them (saved days keep the index into THX) */
const JAR6=[0,1,2,3,5,10];
const BALL=['#e63946','#ffd166','#4fae4f','#3a8fc4','#8e6fd1','#ff9cc2','#ff8a3d','#7fd6f5'];
function jarSVG(n){const k=Math.min(n,40);let b='';for(let i=0;i<k;i++){const x=24+((i*37)%5)*14+(i%2)*5,y=150-Math.floor(i/5)*12;b+=`<circle cx="${x}" cy="${y}" r="7" fill="${BALL[i%BALL.length]}"/>`;}
  return `<svg viewBox="0 0 120 170" class="jarsvg" aria-hidden="true"><rect x="30" y="4" width="60" height="14" rx="4" fill="#c8925a"/><path d="M28 20 H92 Q100 24 100 34 V156 Q100 166 90 166 H30 Q20 166 20 156 V34 Q20 24 28 20Z" fill="rgba(200,235,255,.35)" stroke="#5a7f9a" stroke-width="3"/>${b}<path d="M30 34 V150" stroke="#fff" stroke-opacity=".6" stroke-width="4" stroke-linecap="round"/></svg>`;}
function jar(back){clearT();O.setScreen('sTal','forest',back);T.hudT('צִנְצֶנֶת הַתּוֹדָה');O.sayNow='על מה אתה מודה היום? בחר שלושה דברים';const s=$('#sTal');s.innerHTML='';const sel=new Set();
  const total=()=>T.S().jar.reduce((a,j)=>a+(j.i?j.i.length:0),0);
  const top=h('div','jartop',`<div class="jarw">${jarSVG(total())}</div><div class="lsent">עַל מָה אַתָּה מוֹדֶה הַיּוֹם? בְּחַר 3 דְּבָרִים 💛</div>`);const g=h('div','thx');
  JAR6.forEach(k=>{const [e,n]=THX[k];const b=h('button','thb',`<span class="ae">${e}</span><span>${n}</span>`);b.onclick=()=>{if(sel.has(k)){sel.delete(k);b.classList.remove('on');}else if(sel.size<3){sel.add(k);b.classList.add('on');sfx.pop(sel.size+1);}upd();};g.appendChild(b);});
  const row=h('div','btnrow');const ok=h('button','bigbtn',SPR.heart?SPR.heart:'💛');ok.innerHTML='💛 <span>לְהַכְנִיס לַצִּנְצֶנֶת</span>';ok.disabled=true;row.appendChild(ok);
  const upd=()=>{ok.disabled=sel.size<1;};
  ok.onclick=()=>{const s0=T.S();const d=O.today();const ex=s0.jar.find(j=>j.d===d);if(ex)ex.i=[...new Set([...ex.i,...sel])];else s0.jar.push({d,i:[...sel]});if(s0.jar.length>200)s0.jar=s0.jar.slice(-200);s0.jarT=Date.now();
    const first=!ex;T.record('mind-jar',3);if(first)O.addGems(4,ok);top.querySelector('.jarw').innerHTML=jarSVG(total());top.querySelector('.jarw').classList.add('pop');sfx.build&&sfx.build();
    g.remove();ok.remove();top.querySelector('.lsent').innerHTML=`תּוֹדָה! בַּצִּנְצֶנֶת יֵשׁ ${total()===1?'דָּבָר טוֹב אֶחָד':`כְּבָר ${total()} דְּבָרִים טוֹבִים`}. 💛`;const b=h('button','bigbtn',ICON.play+'<span>הַמְשֵׁךְ</span>');b.onclick=back;row.appendChild(b);};
  s.append(top,g,row);}
/* --- body scan --- */
const SCAN=[['שְׁבוּ בְּנוֹחוּת וְעִצְמוּ עֵינַיִם.',null],['שִׂימוּ לֵב לְכַפּוֹת הָרַגְלַיִם. הֵן נוֹגְעוֹת בָּרִצְפָּה.',92],['עַכְשָׁו הָרַגְלַיִם. הֵן כְּבֵדוֹת וּרְגוּעוֹת.',80],['הַבֶּטֶן עוֹלָה וְיוֹרֶדֶת עִם הַנְּשִׁימָה.',62],['הַיָּדַיִם. סִגְרוּ אֶגְרוֹף חָזָק... וְשַׁחְרְרוּ.',66],['הַכְּתֵפַיִם. הָרִימוּ אוֹתָן לָאָזְנַיִם... וְהוֹרִידוּ.',46],['הַפָּנִים. חַיְּכוּ חִיּוּךְ קָטָן.',30],['כָּל הַגּוּף רָגוּעַ. פִּקְחוּ עֵינַיִם לְאַט.',null]];
function scan(back){clearT();const bk=leave(back);O.setScreen('sTal','forest',bk);quiet();T.hudT('סְרִיקַת גּוּף');const s=$('#sTal');s.innerHTML='';let i=0;
  const fig=h('div','scanf',`${O.AV()}<span class="glow"></span>`);guard=fig;const txt=h('div','lsent big2');const row=h('div','btnrow');const nx=h('button','bigbtn',ICON.play+'<span>הַמְשֵׁךְ</span>');row.appendChild(nx);s.append(fig,txt,row);
  const show=()=>{clearT();const [t,y]=SCAN[i];txt.innerHTML=t;const gl=fig.querySelector('.glow');gl.style.opacity=y==null?0:1;if(y!=null)gl.style.top=y+'%';O.say(t);soft(220,1.5,.05);
    T.hudT('סְרִיקַת גּוּף',T.progressBar(i,SCAN.length));later(()=>nx.click(),D(9000));};
  nx.onclick=()=>{i++;if(i>=SCAN.length){clearT();T.record('mind-scan',3);O.addGems(4);T.result({title:'כָּל הַכָּבוֹד!',sub:'הַגּוּף וְהָרֹאשׁ נָחִים.',gems:4,back:bk});return;}show();};show();}
building({id:'mind',name:'חֻרְשַׁת הַשֶּׁקֶט',color:'#7cc3a0',bg:'forest',icon:()=>FACES.calm.s,blurb:'מָקוֹם שָׁקֵט לִנְשֹׁם, לְהַרְגִּישׁ וּלְהַקְשִׁיב.',acts:[
  {id:'mind-breath',name:'נְשִׁימַת בּוּעָה',icon:()=>'<span style="font-size:34px">🫧</span>',run:back=>breath(back)},
  {id:'mind-feel',name:'אֵיךְ אֲנִי מַרְגִּישׁ?',icon:()=>FACES.happy.s,run:feel},
  {id:'mind-jar',name:'צִנְצֶנֶת הַתּוֹדָה',icon:()=>X.jar,run:jar},
  {id:'mind-sounds',name:'צְלִילִים מַרְגִּיעִים',icon:()=>'<span style="font-size:34px">🎧</span>',run:sounds,noDaily:true},
  {id:'mind-scan',name:'סְרִיקַת גּוּף',icon:()=>O.AV(),run:scan}]});
})();

/* ===== CODE ROBOT ===== */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$,ICON,SPR}=O;const {X,building}=T;const sfx=O.sfx,D=O.D;
const NL=15;const DIRS={U:[0,-1,'⬆'],D:[0,1,'⬇'],L:[-1,0,'⬅'],R:[1,0,'➡']};
const rng=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
function bfs(L,maxRun){const {n,w,s,g}=L;const dist=new Map([[s,0]]);const q=[s];while(q.length){const c=q.shift();if(c===g)return dist.get(c);const x=c%n,y=(c/n)|0;
  for(const [dx,dy] of Object.values(DIRS))for(let k=1;k<=maxRun;k++){const nx=x+dx*k,ny=y+dy*k;if(nx<0||ny<0||nx>=n||ny>=n||w.has(ny*n+nx))break;const id=ny*n+nx;if(!dist.has(id)){dist.set(id,dist.get(c)+1);q.push(id);}}}return -1;}
function level(i){const n=i<3?4:i<8?5:6;const r=rng(1000+i*77);const dens=.12+Math.min(.18,i*.015);const minLen=Math.min(3+i,n+5);
  for(let t=0;t<4000;t++){const w=new Set();for(let c=0;c<n*n;c++)if(r()<dens)w.add(c);const s=Math.floor(r()*n*n),g=Math.floor(r()*n*n);if(s===g||w.has(s)||w.has(g))continue;
    const L={n,w,s,g,rep:i>=6};const len=bfs(L,1);if(len<minLen)continue;L.len=len;L.opt=L.rep?bfs(L,3):len;return L;}
  return {n:4,w:new Set(),s:0,g:15,len:6,opt:6,rep:i>=6};}
const LV=Array.from({length:NL},(_,i)=>level(i));
const C=()=>{const s=T.S();s.code=s.code||{};return s.code;};
/* one big button: the next level (the first one not done yet) */
function menu(back){O.setScreen('sTal','city',back);T.hudT('רוֹבּוֹט הַקּוֹד');O.sayNow='תַּכְנְתוּ אֶת הָרוֹבּוֹט: סַדְּרוּ חִצִּים כְּדֵי שֶׁיַּגִּיעַ לַיַּהֲלוֹם.';const s=$('#sTal');s.innerHTML='';const cs=C();
  let i=LV.findIndex((_,k)=>!(cs[k]|0));if(i<0)i=NL-1;
  const LS=window.LESSONS,go=()=>play(i,back);
  const b=h('button','bigbtn lvgo',ICON.play+`<span>שָׁלָב ${i+1}</span>`);b.onclick=()=>LS&&LV[i].rep?LS.first('code-rep',back,go):go();s.appendChild(b);
  if(LS)s.appendChild(LS.againBtn(LV[i].rep?['code-prog','code-rep']:'code-prog',back,()=>menu(back)));}
function play(li,back){const L=LV[li];const n=L.n;let prog=[],running=false;const mback=()=>menu(back);O.setScreen('sTal','city',mback);T.hudT(`רוֹבּוֹט הַקּוֹד · שָׁלָב ${li+1}`);O.sayNow='סַדֵּר חִצִּים כְּדֵי שֶׁהָרוֹבּוֹט יַגִּיעַ לַיַּהֲלוֹם, וּלְחַץ הַפְעֵל.';
  const s=$('#sTal');s.innerHTML='';const maxB=L.opt+4;
  const board=h('div','cboard');board.style.setProperty('--n',n);for(let c=0;c<n*n;c++){const d=h('i','ct'+(L.w.has(c)?' wall':''));if(L.w.has(c))d.innerHTML=X.stone;if(c===L.g)d.innerHTML=`<span class="cg bob">${SPR.gem}</span>`;board.appendChild(d);}
  const bot=h('div','cbot','🤖');board.appendChild(bot);
  const place=(c,anim)=>{bot.style.transitionDuration=anim?'':'0s';bot.style.left=(c%n)/n*100+'%';bot.style.top=((c/n)|0)/n*100+'%';};
  const info=h('div','lcap',L.rep?`טִיפּ: לְחִיצָה עַל בְּלוֹק מַגְדִּילָה אוֹתוֹ פִּי 2 אוֹ פִּי 3!`:`הַדֶּרֶךְ הַקְּצָרָה בְּיוֹתֵר: ${L.opt} צְעָדִים`);
  const prow=h('div','prog');const pad=h('div','cpad');
  ['U','L','R','D'].forEach(k=>{const b=h('button','cdir d'+k,DIRS[k][2]);b.setAttribute('aria-label',{U:'למעלה',D:'למטה',L:'שמאלה',R:'ימינה'}[k]);b.onclick=()=>add(k);pad.appendChild(b);});
  const row=h('div','btnrow');const undo=h('button','bigbtn plain sm','↩️ <span>מְחַק</span>');const run=h('button','bigbtn',ICON.play+'<span>הַפְעֵל!</span>');row.append(undo,run);
  s.append(board,info,prow,pad,row);place(L.s);
  function drawP(){prow.innerHTML='';prog.forEach((p,j)=>{const b=h('button','cblk',`${DIRS[p.d][2]}${p.k>1?`<sub>×${p.k}</sub>`:''}`);b.onclick=()=>{if(running)return;if(L.rep){p.k=p.k%3+1;sfx.pop(p.k+1);}else{prog.splice(j,1);sfx.pop(1);}drawP();};prow.appendChild(b);});
    for(let j=prog.length;j<maxB;j++)prow.appendChild(h('i','cslot'));}
  function add(k){if(running||prog.length>=maxB)return;prog.push({d:k,k:1});sfx.key&&sfx.key();drawP();}
  undo.onclick=()=>{if(running)return;prog.pop();drawP();};
  run.onclick=()=>{if(running||!prog.length)return;running=true;run.disabled=true;let c=L.s;place(c);const steps=[];prog.forEach((p,j)=>{for(let k=0;k<p.k;k++)steps.push([p.d,j]);});let i=0;
    const tick=()=>{if($('#sTal').hidden||!board.isConnected)return;prow.querySelectorAll('.cblk').forEach((b,j)=>b.classList.toggle('now',steps[i]&&steps[i][1]===j));
      if(i>=steps.length){fail('הָרוֹבּוֹט לֹא הִגִּיעַ לַיַּהֲלוֹם. נְנַסֶּה שׁוּב?');return;}
      const [dx,dy]=DIRS[steps[i][0]];const x=c%n+dx,y=((c/n)|0)+dy;if(x<0||y<0||x>=n||y>=n||L.w.has(y*n+x)){bot.classList.add('bump');sfx.hit&&sfx.hit();setTimeout(()=>bot.classList.remove('bump'),400);fail('אוּפְּס! הָרוֹבּוֹט נִתְקַע. תַּקְּנוּ אֶת הַקּוֹד.');return;}
      c=y*n+x;place(c,1);sfx.jump?sfx.jump():sfx.pop(2);i++;if(c===L.g){setTimeout(()=>{if(board.isConnected)win();},D(400));return;}setTimeout(tick,D(380));};setTimeout(tick,D(200));};
  function fail(msg){sfx.no();info.innerHTML=msg;setTimeout(()=>{place(L.s);running=false;run.disabled=false;prow.querySelectorAll('.now').forEach(b=>b.classList.remove('now'));},D(900));}
  function win(){const used=prog.length;const st=used<=L.opt?3:used<=L.opt+2?2:1;const cs=C();const prev=cs[li]|0;cs[li]=Math.max(prev,st);
    const doneN=Object.values(cs).filter(v=>v>0).length;const tot=Object.values(cs).reduce((a,v)=>a+(v|0),0);T.record('code-maze',Math.min(3,Math.round(tot/NL)),{b:doneN});
    const g=prev?1:5+st;O.addGems(g);T.result({title:st===3?'קוֹד מֻשְׁלָם!':'הָרוֹבּוֹט הִגִּיעַ!',sub:`הִשְׁתַּמַּשְׁתָּ ב-${used} בְּלוֹקִים${st<3?` · אֶפְשָׁר גַּם ב-${L.opt}`:''}`,stars:st,gems:g,back:li+1<NL?()=>play(li+1,back):mback,again:()=>play(li,back)});}
  drawP();
  window.__code={L,add,run:()=>run.click(),solve:()=>{prog=solution(L);drawP();run.click();}};}
function solution(L){const {n,w,s,g}=L;const maxRun=L.rep?3:1;const prev=new Map([[s,null]]);const q=[s];while(q.length){const c=q.shift();if(c===g)break;const x=c%n,y=(c/n)|0;
  for(const [d,[dx,dy]] of Object.entries(DIRS))for(let k=1;k<=maxRun;k++){const nx=x+dx*k,ny=y+dy*k;if(nx<0||ny<0||nx>=n||ny>=n||w.has(ny*n+nx))break;const id=ny*n+nx;if(!prev.has(id)){prev.set(id,[c,d,k]);q.push(id);}}}
  const out=[];let c=g;while(prev.get(c)){const [p,d,k]=prev.get(c);out.unshift({d,k});c=p;}return out;}
building({id:'code',name:'מַעְבֶּדֶת הַקּוֹד',color:'#5b8def',bg:'city',icon:()=>'<span style="font-size:34px">🤖</span>',blurb:'מְתַכְנְתִים רוֹבּוֹט צַעַד אַחַר צַעַד.',acts:[
  {id:'code-maze',name:'רוֹבּוֹט הַקּוֹד',icon:()=>'<span style="font-size:34px">🤖</span>',run:back=>window.LESSONS?window.LESSONS.first('code-prog',back,()=>menu(back)):menu(back)}]});
})();

/* ===== THINKING TOWER ===== */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$,rand,pick,shuffle,SPR}=O;const {X,ALLSPR,building,quiz}=T;const sfx=O.sfx,D=O.D;
const plays=id=>((T.S().tl[id]||{}).n|0);
/* --- sudoku 4x4 --- */
function sudokuGrid(){const base=[[0,1,2,3],[2,3,0,1],[1,0,3,2],[3,2,1,0]];const sym=shuffle([0,1,2,3]);let rows=[...(Math.random()<.5?[0,1,2,3]:[1,0,3,2])];
  if(Math.random()<.5)rows=[rows[2],rows[3],rows[0],rows[1]];const cols=Math.random()<.5?[0,1,2,3]:[1,0,2,3];const g=rows.map(r=>cols.map(c=>sym[base[r][c]]));if(Math.random()<.5)return g[0].map((_,c)=>g.map(r=>r[c]));return g;}
function sudoku(back){const SYM=shuffle(['apple','ball','fish','sun','heart','car','bird','cake']).slice(0,4);const R=3;let r=0,err=0,gems=0;O.setScreen('sTal','mount',back);const s=$('#sTal');
  const run=()=>{T.hudT('סוּדוֹקוּ',T.progressBar(r,R));O.sayNow='בכל שורה, בכל טור ובכל ריבוע: כל תמונה פעם אחת';const sol=sudokuGrid();const holes=Math.min(10,5+r+Math.min(3,plays('think-sudoku')));
    const cells=shuffle([...Array(16).keys()]).slice(0,holes);const cur=sol.flat().map((v,i)=>cells.includes(i)?-1:v);let sel=0,left=holes;
    s.innerHTML='';s.appendChild(h('div','lsent','בְּכָל שׁוּרָה, בְּכָל טוּר וּבְכָל רִבּוּעַ — כָּל תְּמוּנָה פַּעַם אַחַת בִּלְבַד.'));
    const g=h('div','sud');cur.forEach((v,i)=>{const c=h('button','sdc'+(v>=0?' fix':'')+((i%4)===1?' br':'')+(((i/4)|0)===1?' bb':''),v>=0?ALLSPR(SYM[v]):'');
      if(v<0)c.onclick=()=>{if(cur[i]>=0)return;if(sol.flat()[i]===sel){cur[i]=sel;c.innerHTML=ALLSPR(SYM[sel]);c.classList.add('ok');sfx.ok(left);left--;if(!left)solved();}else{err++;tries++;c.classList.add('bad');sfx.no();setTimeout(()=>c.classList.remove('bad'),D(500));}};
      else{c.disabled=true;c.tabIndex=-1;}g.appendChild(c);});
    const pal=h('div','sudp');SYM.forEach((k,j)=>{const b=h('button','sdp'+(j===0?' on':''),ALLSPR(k));b.setAttribute('aria-label','תמונה '+(j+1));b.onclick=()=>{sel=j;pal.querySelectorAll('.sdp').forEach((x,q)=>x.classList.toggle('on',q===j));sfx.pop(2);};pal.appendChild(b);});
    s.append(g,pal);if(window.LESSONS)s.appendChild(window.LESSONS.againBtn('think-sud',back,()=>sudoku(back)));let tries=0;
    T.setKey(e=>{const n=+e.key;if(n>=1&&n<=4)pal.children[n-1].click();});
    function solved(){const gg=tries?1:3;gems+=gg;O.addGems(gg);g.classList.add('done');setTimeout(()=>{if(!g.isConnected)return;r++;if(r>=R){T.setKey(null);T.finishAct('think-sudoku',Math.floor(err/2),R*3,gems,back,()=>sudoku(back));}else run();},D(1000));}
    window.__sud={solve:()=>{cur.forEach((v,i)=>{if(v<0){sel=sol.flat()[i];g.children[i].click();}});}};};
  run();}
/* --- maze --- */
function genMaze(n){const W=Array.from({length:n*n},()=>[1,1,1,1]);const vis=new Set([0]);const st=[0];const D4=[[0,-1,0,2],[1,0,1,3],[0,1,2,0],[-1,0,3,1]];
  while(st.length){const c=st[st.length-1],x=c%n,y=(c/n)|0;const nb=shuffle(D4).filter(([dx,dy])=>{const nx=x+dx,ny=y+dy;return nx>=0&&ny>=0&&nx<n&&ny<n&&!vis.has(ny*n+nx);});
    if(!nb.length){st.pop();continue;}const [dx,dy,a,b]=nb[0];const id=(y+dy)*n+x+dx;W[c][a]=0;W[id][b]=0;vis.add(id);st.push(id);}return W;}
function maze(back){const n=Math.min([5,6,7,8][Math.min(3,plays('think-maze'))],T.onPath?6:9);/* #394 on the daily path: at most a 6x6 maze */const W=genMaze(n);let p=0;const goal=n*n-1;O.setScreen('sTal','forest',back);T.hudT('מָבוֹךְ');O.sayNow='עזרו לחתול להגיע לעוגה';
  const s=$('#sTal');s.innerHTML='';const wrap=h('div','mzw');const sz=100/n;
  let svg=`<svg viewBox="0 0 ${n*10} ${n*10}" class="mz" aria-hidden="true"><rect width="${n*10}" height="${n*10}" fill="#eaf6e1"/>`;
  W.forEach((w,c)=>{const x=(c%n)*10,y=((c/n)|0)*10;if(w[0])svg+=`<line x1="${x}" y1="${y}" x2="${x+10}" y2="${y}"/>`;if(w[1])svg+=`<line x1="${x+10}" y1="${y}" x2="${x+10}" y2="${y+10}"/>`;if(w[2])svg+=`<line x1="${x}" y1="${y+10}" x2="${x+10}" y2="${y+10}"/>`;if(w[3])svg+=`<line x1="${x}" y1="${y}" x2="${x}" y2="${y+10}"/>`;});
  svg+='</svg>';wrap.innerHTML=svg+`<span class="mzg" style="left:${(n-1)*sz}%;top:${(n-1)*sz}%;width:${sz}%;height:${sz}%">${ALLSPR('cake')}</span><span class="mzp" style="width:${sz}%;height:${sz}%">${SPR.cat||'🐱'}</span>`;
  const trail=h('div','mzt');wrap.appendChild(trail);const pl=wrap.querySelector('.mzp');
  const pos=()=>{pl.style.left=(p%n)*sz+'%';pl.style.top=((p/n)|0)*sz+'%';};pos();
  const mv=(dir)=>{const D4={U:[0,-1,0],R:[1,0,1],D:[0,1,2],L:[-1,0,3]}[dir];if(W[p][D4[2]]){sfx.hit&&sfx.hit();pl.classList.add('bump');setTimeout(()=>pl.classList.remove('bump'),250);return;}
    const dot=h('i','');dot.style.cssText=`left:${(p%n+.5)*sz}%;top:${(((p/n)|0)+.5)*sz}%`;trail.appendChild(dot);p+=D4[0]+D4[1]*n;pos();sfx.key&&sfx.key();if(p===goal)win();};
  const pad=h('div','cpad');['U','L','R','D'].forEach(k=>{const b=h('button','cdir d'+k,{U:'⬆',D:'⬇',L:'⬅',R:'➡'}[k]);b.onclick=()=>mv(k);pad.appendChild(b);});
  wrap.onclick=e=>{const r=wrap.getBoundingClientRect();const x=Math.floor((e.clientX-r.left)/r.width*n),y=Math.floor((e.clientY-r.top)/r.height*n);const px=p%n,py=(p/n)|0;
    if(x===px&&y===py-1)mv('U');else if(x===px&&y===py+1)mv('D');else if(y===py&&x===px+1)mv('R');else if(y===py&&x===px-1)mv('L');};
  s.append(h('div','lsent','עִזְרוּ לֶחָתוּל לְהַגִּיעַ לָעוּגָה!'+(matchMedia('(pointer:coarse)').matches?'':' (אֶפְשָׁר גַּם עִם הַחִצִּים)')),wrap,pad);
  T.setKey(e=>{const k={ArrowUp:'U',ArrowDown:'D',ArrowLeft:'L',ArrowRight:'R'}[e.key];if(k){e.preventDefault();mv(k);}});
  let done=false;function win(){if(done)return;done=true;T.setKey(null);sfx.build&&sfx.build();setTimeout(()=>wrap.isConnected&&T.finishAct('think-maze',0,1,3,back,()=>maze(back),'יָצָאתָ מֵהַמָּבוֹךְ!'),D(600));}
  window.__maze={solve:()=>{const prev=new Map([[0,null]]);const q=[0];const DD=[['U',0,-1,0],['R',1,0,1],['D',0,1,2],['L',-1,0,3]];while(q.length){const c=q.shift();for(const [d,dx,dy,wi] of DD){if(W[c][wi])continue;const id=c+dx+dy*n;if(!prev.has(id)){prev.set(id,[c,d]);q.push(id);}}}
    const path=[];let c=goal;while(prev.get(c)){path.unshift(prev.get(c)[1]);c=prev.get(c)[0];}path.forEach(mv);},n};}
/* --- memory --- */
function memory(back){const lv=Math.min(2,plays('think-mem'));const pairs=Math.min([4,6,8][lv],T.onPath?6:8);/* #394 on the daily path: at most 6 pairs */const pool=shuffle(['apple','ball','fish','sun','heart','car','bird','cake','boat','hat','key','cup','egg','shoe']).slice(0,pairs);
  const deck=shuffle([...pool,...pool]);let open=[],moves=0,found=0,lock=false;O.setScreen('sTal','city',back);T.hudT('זִכָּרוֹן');O.sayNow='מצאו זוגות';const s=$('#sTal');s.innerHTML='';
  const info=h('div','lcap','מִצְאוּ אֶת כָּל הַזּוּגוֹת');const g=h('div','memg c'+(pairs>6?4:pairs>4?4:4));
  deck.forEach((k,i)=>{const c=h('button','mc',`<span class="fr">${ALLSPR(k)}</span><span class="bk2">?</span>`);c.dataset.k=k;c.setAttribute('aria-label','קלף '+(i+1));
    c.onclick=()=>{if(lock||c.classList.contains('flip'))return;c.classList.add('flip');sfx.pop(2);open.push(c);if(open.length===2){moves++;lock=true;const [a,b]=open;
      if(a.dataset.k===b.dataset.k){setTimeout(()=>{a.classList.add('got');b.classList.add('got');sfx.ok(found);found++;open=[];lock=false;info.textContent=`מָצָאתָ ${found} מִתּוֹךְ ${pairs}`;if(found===pairs)win();},D(350));}
      else setTimeout(()=>{a.classList.remove('flip');b.classList.remove('flip');open=[];lock=false;},D(900));}};g.appendChild(c);});
  s.append(info,g);
  function win(){const extra=moves-pairs;const err=extra<=pairs*.5?0:extra<=pairs?2:5;setTimeout(()=>g.isConnected&&T.finishAct('think-mem',err,10,2,back,()=>memory(back),`מָצָאתָ הַכֹּל ב-${moves} נִסְיוֹנוֹת!`),D(600));}
  window.__mem={solve:()=>{const by={};[...g.children].forEach(c=>(by[c.dataset.k]=by[c.dataset.k]||[]).push(c));let t=0;Object.values(by).forEach(([a,b])=>{setTimeout(()=>{a.click();b.click();},t);t+=D(500);});}};}
/* --- patterns --- */
const PS=['apple','ball','fish','sun','heart','car','bird','cake','boat','star'];
function patGen(i){const lv=Math.min(3,Math.floor(i/2));const kinds=[['AB','AAB','ABB'],['ABC','AABB','ABB'],['ABCD','AABC','num'],['num','num2','ABAC']][lv];const k=pick(kinds);
  if(k==='num'||k==='num2'){const st=rand(1,k==='num'?5:10),d=k==='num'?pick([2,3,5,10]):pick([2,3,4,5]);const sq=Array.from({length:5},(_,j)=>st+d*j);const a=sq[4];const opts=shuffle([a,a+d,a-1].filter((v,j,arr)=>arr.indexOf(v)===j));
    return {pr:`<div class="pat num">${sq.slice(0,4).map(v=>`<b>${v}</b>`).join('')}<b class="q">?</b></div><div class="qq">אֵיזֶה מִסְפָּר בָּא אַחַר כָּךְ?</div>`,opts:opts.map(String),ans:opts.indexOf(a),cls:'num',key:sq.join(),explain:`כָּל פַּעַם מוֹסִיפִים ${d}`};}
  const syms=shuffle(PS).slice(0,4);const unit=[...k].map(c=>syms[c.charCodeAt(0)-65]);const len=unit.length*2+(unit.length<3?2:1);const seq=Array.from({length:len+1},(_,j)=>unit[j%unit.length]);const a=seq[len];
  const opts=shuffle([...new Set([a,...syms.slice(0,unit.length<3?3:4)])]).slice(0,3);if(!opts.includes(a))opts[0]=a;const o2=shuffle(opts);
  return {pr:`<div class="pat">${seq.slice(0,len).map(x=>`<span>${ALLSPR(x)}</span>`).join('')}<span class="q">?</span></div><div class="qq">מָה בָּא אַחַר כָּךְ?</div>`,opts:o2.map(x=>`<span class="pic sm">${ALLSPR(x)}</span>`),ans:o2.indexOf(a),cls:'pc',key:seq.join()};}
building({id:'think',name:'מִגְדַּל הַחֲשִׁיבָה',color:'#e8a33d',bg:'mount',icon:()=>X.puzzle,blurb:'חִידוֹת שֶׁמְּאַמְּנוֹת אֶת הַמֹּחַ.',acts:[
  {id:'think-sudoku',name:'סוּדוֹקוּ',icon:()=>X.puzzle,run:back=>window.LESSONS?window.LESSONS.first('think-sud',back,()=>sudoku(back)):sudoku(back)},
  {id:'think-maze',name:'מָבוֹךְ',icon:()=>'<span style="font-size:34px">🌀</span>',run:maze},
  {id:'think-mem',name:'זִכָּרוֹן',icon:()=>'<span style="font-size:34px">🃏</span>',run:memory},
  {id:'think-pat',name:'מָה בָּא אַחַר כָּךְ?',icon:()=>'<span style="font-size:34px">🔁</span>',run:back=>quiz({id:'think-pat',title:'מָה בָּא אַחַר כָּךְ?',bg:'mount',back,n:5,gen:patGen})}]});
})();

/* ===== WRITING HOUSE ===== */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$,ICON,SPR}=O;const {X,ALLSPR,building}=T;const sfx=O.sfx,D=O.D;
const AB=[['א','אָלֶף'],['ב','בֵּית'],['ג','גִּימֶל'],['ד','דָּלֶת'],['ה','הֵא'],['ו','וָו'],['ז','זַיִן'],['ח','חֵית'],['ט','טֵית'],['י','יוֹד'],['כ','כַּף'],['ל','לָמֶד'],['מ','מֵם'],['נ','נוּן'],['ס','סָמֶךְ'],['ע','עַיִן'],['פ','פֵּא'],['צ','צָדִי'],['ק','קוֹף'],['ר','רֵישׁ'],['ש','שִׁין'],['ת','תָּו']];
T.WRITE={AB};
const W=()=>{const s=T.S();s.wr=s.wr||{};return s.wr;};
const wordFor=l=>(T.WORDS||[]).find(w=>w.w.replace(/[֑-ׇ]/g,'')[0]===l);
const FONT='bold 230px "Segoe UI", Arial, "Noto Sans Hebrew", sans-serif';
function menu(back){O.setScreen('sTal','meadow',back);T.hudT('בֵּית הַכְּתִיבָה');O.sayNow='בוא נכתוב אותיות!';const s=$('#sTal');s.innerHTML='';
  s.appendChild(h('div','whead',`<span class="gd">${X.pen}</span><h1>כּוֹתְבִים אוֹתִיּוֹת</h1>`));
  const w=W();const nx=AB.findIndex(([l])=>!(w[l]|0));const row=h('div','btnrow');const go=h('button','bigbtn huge',ICON.play+'<span>הַמְשֵׁךְ</span>');const st=nx<0?Math.floor(Math.random()*AB.length):nx;
  go.onclick=()=>trace(st,back,[0,1,2,3].map(k=>(st+k)%AB.length));row.appendChild(go);s.appendChild(row);
  const pickL=h('button','dmore','🔤 <span>לִבְחֹר אוֹת</span>');s.appendChild(h('div','dpick')).appendChild(pickL);
  const g=h('div','abg');g.hidden=true;pickL.onclick=()=>{g.hidden=false;pickL.parentNode.remove();O.sfx.pop(2);};AB.forEach(([l],i)=>{const st=w[l]|0;const b=h('button','abb'+(st?' got':''),`<b>${l}</b><span>${[0,1,2].map(k=>k<st?SPR.star:SPR.starOff).join('')}</span>`);b.onclick=()=>trace(i,back,[i,...[1,2,3].map(k=>(i+k)%AB.length)]);g.appendChild(b);});
  s.appendChild(g);}
function trace(i0,back,queue){let qi=0,err=0,gems=0;const mback=()=>menu(back);O.setScreen('sTal','meadow',mback);const s=$('#sTal');
  const run=()=>{const [l,name]=AB[queue[qi]];T.hudT('כּוֹתְבִים: '+l,T.progressBar(qi,queue.length));O.sayNow='האות '+T.plainHe(name);s.innerHTML='';let tries=0;
    const wd=wordFor(l);s.appendChild(h('div','wrhead',`<span class="wrl">${l}</span><span class="wrn">${name}</span>${wd?`<span class="wrw"><span class="pic sm">${ALLSPR(wd.spr)}</span><b>${wd.w}</b></span>`:''}`));
    const box=h('div','wrbox');const cv=document.createElement('canvas');cv.className='wrc';box.appendChild(cv);s.appendChild(box);
    const row=h('div','btnrow');const clr=h('button','bigbtn plain sm','🧽 <span>מְחַק</span>');const ok=h('button','bigbtn',SPR.star+'<span>סִיַּמְתִּי</span>');row.append(clr,ok);s.appendChild(row);
    const fb=h('div','lcap','');s.appendChild(fb);
    const R=300,dpr=Math.min(2,window.devicePixelRatio||1);cv.width=R*dpr;cv.height=R*dpr;const c=cv.getContext('2d');c.scale(dpr,dpr);
    const G=document.createElement('canvas');G.width=G.height=100;const gc=G.getContext('2d');gc.scale(1/3,1/3);gc.font=FONT;gc.textAlign='center';gc.textBaseline='middle';gc.fillStyle='#000';gc.fillText(l,150,160);
    const gd=gc.getImageData(0,0,100,100).data;const guide=[];for(let k=0;k<1e4;k++)guide[k]=gd[k*4+3]>100;const gN=guide.filter(Boolean).length||1;
    const near=new Uint8Array(1e4);for(let k=0;k<1e4;k++)if(guide[k]){const x=k%100,y=(k/100)|0;for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<100&&yy<100)near[yy*100+xx]=1;}}
    const ink=new Uint8Array(1e4);let inkN=0;
    const bg=()=>{c.clearRect(0,0,R,R);c.fillStyle='#fffaf0';c.fillRect(0,0,R,R);c.strokeStyle='#e3d6b8';c.lineWidth=2;c.setLineDash([8,8]);c.beginPath();c.moveTo(0,R*.25);c.lineTo(R,R*.25);c.moveTo(0,R*.82);c.lineTo(R,R*.82);c.stroke();c.setLineDash([]);
      c.font=FONT;c.textAlign='center';c.textBaseline='middle';c.fillStyle='rgba(120,130,140,.28)';c.fillText(l,150,160);};
    bg();let down=false,last=null;
    const pt=e=>{const r=cv.getBoundingClientRect();return [(e.clientX-r.left)/r.width*R,(e.clientY-r.top)/r.height*R];};
    const mark=(x,y)=>{const gx=Math.round(x/3),gy=Math.round(y/3);for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){if(dx*dx+dy*dy>16)continue;const xx=gx+dx,yy=gy+dy;if(xx>=0&&yy>=0&&xx<100&&yy<100){const k=yy*100+xx;if(!ink[k]){ink[k]=1;inkN++;}}}};
    const seg=(a,b)=>{c.strokeStyle='#3a8fc4';c.lineWidth=22;c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke();const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4));for(let k=0;k<=n;k++)mark(a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n);};
    cv.onpointerdown=e=>{e.preventDefault();down=true;try{cv.setPointerCapture(e.pointerId);}catch(_){}last=pt(e);seg(last,last);};
    cv.onpointermove=e=>{if(!down)return;const p=pt(e);seg(last,p);last=p;};cv.onpointerup=cv.onpointercancel=()=>{down=false;};
    const score=()=>{let cov=0,out=0;for(let k=0;k<1e4;k++){if(guide[k]&&ink[k])cov++;if(ink[k]&&!near[k])out++;}return {cov:cov/gN,out:inkN?out/inkN:1};};
    clr.onclick=()=>{ink.fill(0);inkN=0;bg();sfx.pop(1);fb.textContent='';};
    ok.onclick=()=>{const {cov,out}=score();if(cov>=.62&&out<=.3){const st=tries===0&&cov>.75?3:tries<=1?2:1;const w=W();w[l]=Math.max(w[l]|0,st);T.S().wrT=Date.now();const g=tries?1:3;gems+=g;O.addGems(g,ok);sfx.ok(qi);
        box.classList.add('done');O.say&&O.say(name);fb.innerHTML='מְצֻיָּן! ✨';setTimeout(()=>{if(!box.isConnected)return;qi++;if(qi>=queue.length){T.finishAct('write-trace',err,queue.length*2,gems,mback,()=>trace(i0,back,queue));}else run();},D(1100));}
      else{tries++;err++;sfx.no();if(out>.3)clr.click();fb.innerHTML=cov<.62&&out<=.3?'עוֹד קְצָת! עִבְרוּ עַל כָּל הָאוֹת.':'יָצָאתָ מִחוּץ לָאוֹת. נְנַסֶּה שׁוּב?';}};
    window.__wr={fill:()=>{for(let k=0;k<1e4;k++)if(guide[k]){ink[k]=1;}inkN=ink.reduce((a,v)=>a+v,0);},score,ok:()=>ok.click(),scribble:()=>{for(let k=0;k<1e4;k+=3)ink[k]=1;inkN=ink.reduce((a,v)=>a+v,0);}};};
  run();}
building({id:'write',name:'בֵּית הַכְּתִיבָה',color:'#c27c4e',bg:'meadow',icon:()=>X.pen,blurb:'לוֹמְדִים לִכְתֹּב אֶת כָּל הָאוֹתִיּוֹת.',acts:[
  {id:'write-trace',name:'כּוֹתְבִים אוֹתִיּוֹת',icon:()=>X.pen,run:menu}]});
})();

/* ===== USERS (Oren / parent) · PARENT PANEL · PERSONAL TOUCHES ===== */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$,ICON,SPR,shuffle}=O;const {FACES,BUILD,ACT,ALLSPR}=T;const sfx=O.sfx,D=O.D;
const SET=()=>{const s=T.S().set;s.offA=s.offA||{};s.offW=s.offW||{};s.grad=s.grad||{on:0,every:2,base:0,extra:0,order:null,seen:0};return s;};
const plain=T.plainHe;
const RSET=()=>{const s=O.realSave;s.set=s.set||{};return s.set;};
/* ---------- password (hashed; kid-proofing, not bank security) ---------- */
async function hash(pw){const t='oren4|'+pw;try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
  catch(e){let x=2166136261;for(const c of t){x^=c.charCodeAt(0);x=Math.imul(x,16777619);}return 'f'+(x>>>0).toString(16);}}
let parentOn=false;
function login(then){if(O.isParentPlay){parentOn=true;then&&then();return;}const st=RSET();const ov=$('#ov');ov.hidden=false;const first=!st.pw;
  ov.innerHTML=`<div class="card plog"><div class="pli">${first?'🔑':'🔒'}</div><h2>${first?'יצירת משתמש הורה':'כניסת הורה'}</h2>
    <div class="sub">${first?'בחרו סיסמה קבועה (לפחות 4 תווים). היא תשמש אתכם לכניסה ללוח ההורים, בכל מכשיר.':'הקלידו את סיסמת ההורה'}</div>
    <input id="pw1" type="password" class="pgin" autocomplete="off" placeholder="סיסמה" aria-label="סיסמה">${first?'<input id="pw2" type="password" class="pgin" autocomplete="off" placeholder="שוב את הסיסמה" aria-label="אימות סיסמה">':''}<div class="pgerr" id="pgErr"></div></div>`;
  const row=h('div','btnrow');const no=h('button','bigbtn plain sm','<span>ביטול</span>');no.onclick=()=>{ov.hidden=true;};const ok=h('button','bigbtn sm','<span>'+(first?'שמירה וכניסה':'כניסה')+'</span>');row.append(no,ok);
  if(!first){const fg=h('button','plink','שכחתי סיסמה');fg.onclick=()=>forgot(then);ov.firstChild.append(row,fg);}else ov.firstChild.appendChild(row);
  const p1=$('#pw1'),p2=$('#pw2');setTimeout(()=>p1.focus(),60);const err=t=>{$('#pgErr').textContent=t;sfx.no();};
  const go=async()=>{const a=p1.value;if(first){if(a.length<4)return err('לפחות 4 תווים');if(a!==p2.value)return err('הסיסמאות לא זהות');st.pw=await hash(a);st.pwT=Date.now();O.persist();}
    else if(await hash(a)!==st.pw){p1.value='';return err('סיסמה שגויה');}
    parentOn=true;ov.hidden=true;sfx.ok(2);then&&then();};
  ok.onclick=go;[p1,p2].forEach(x=>x&&(x.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')go();}));}
function forgot(then){const ov=$('#ov');ov.innerHTML=`<div class="card plog"><h2>איפוס סיסמה</h2><div class="sub">כדי לוודא שזה מבוגר: כמה זה 37 × 24?<br>(ההתקדמות של אורן לא תימחק — רק הסיסמה)</div><input id="fq" class="pgin" inputmode="numeric" autocomplete="off" aria-label="תשובה"><div class="pgerr" id="pgErr"></div></div>`;
  const row=h('div','btnrow');const no=h('button','bigbtn plain sm','<span>ביטול</span>');no.onclick=()=>{ov.hidden=true;};const ok=h('button','bigbtn sm','<span>המשך</span>');row.append(no,ok);ov.firstChild.appendChild(row);
  const q=$('#fq');setTimeout(()=>q.focus(),60);const go=()=>{if(q.value.trim()==='888'){delete RSET().pw;O.persist();login(then);}else{$('#pgErr').textContent='לא נכון';sfx.no();}};ok.onclick=go;q.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')go();};}

window.TAL_parentGate=()=>login(()=>parentChoice());
/* the password check alone (e.g. to end a meal pause early); the panel stays closed */
T.login=then=>login(()=>{parentOn=false;then&&then();});
O.on('screen',id=>{if(parentOn&&O.parMark)O.parMark();/* #617 */if(id!=='sPar'&&!O.isParentPlay&&$('#ov').hidden)parentOn=false;});
/* ---------- permissions ---------- */
let permP=null;
function getPerm(){if(!permP)permP=(async()=>{for(let i=0;i<30&&!(window.claude&&window.claude.use);i++)await new Promise(r=>setTimeout(r,100));try{return window.claude&&window.claude.use?await window.claude.use('permissions'):null;}catch(e){return null;}})();return permP;}
const PNAME={dictation:'מיקרופון — קריאה בקול (אורן קורא מילים והמשחק בודק)',db:'שמירת ההתקדמות בענן',user:'זיהוי המשתמש (כדי שההתקדמות תישמר לאורן)'};
const PST={granted:['מאושר ✓','ok'],prompt:['עוד לא אושר','warn'],denied:['נחסם','bad'],unavailable:['לא זמין בדפדפן הזה','na']};
async function permStates(){const P=await getPerm();if(!P)return null;try{return await P.state();}catch(e){return null;}}
/* kid side: "call your parents" */
function callParents(why,after){const ov=$('#ov');ov.hidden=false;
  ov.innerHTML=`<div class="card"><div class="callp bob">🙋</div><h2>קְרָא לְאַבָּא אוֹ לְאִמָּא</h2><div class="sub">${why}</div></div>`;
  const row=h('div','btnrow');const no=h('button','bigbtn plain sm','<span>אַחַר כָּךְ</span>');no.onclick=()=>{ov.hidden=true;};
  const pb=h('button','bigbtn sm','🔒 <span>הוֹרֶה כָּאן</span>');pb.onclick=()=>login(()=>{if(after)after();else panel('perm');});row.append(no,pb);ov.firstChild.appendChild(row);
  O.say('קרא לאבא או לאמא. '+plain(why));sfx.star(0);}
T.callParents=callParents;
T.needPerm=async(name,why)=>{const P=await getPerm();if(!P)return true;let st;try{st=await P.state(name);}catch(e){return true;}
  if(st==='granted'||st==='unavailable')return true;
  callParents(why,async()=>{if(st==='prompt'){try{await P.request([name]);}catch(e){}}else panel('perm');});return false;};
/* ---------- gradual opening of buildings ---------- */
function order(){const st=SET();const ids=BUILD.map(b=>b.id);let o=(st.grad.order||[]).filter(id=>ids.includes(id));ids.forEach(id=>{if(!o.includes(id))o.push(id);});return o;}
function gradInfo(){const st=SET(),g=st.grad;const ord=order().filter(id=>!st.hide[id]);if(!g.on)return {ord,open:ord,next:null,left:0};
  const days=Math.max(0,(O.save.days||[]).length-(g.base|0));const ev=Math.max(1,g.every|0);const cnt=Math.min(ord.length,2+Math.floor(days/ev)+(g.extra|0));
  return {ord,open:ord.slice(0,cnt),next:ord[cnt]||null,left:ev-(days%ev)};}
window.TAL_bState=b=>{const st=SET();if(st.hide[b.id])return 'off';const gi=gradInfo();if(gi.open.includes(b.id))return 'on';
  return {lock:b.id===gi.next?(gi.left===1?'נִפְתָּח בַּיּוֹם הַבָּא':`נִפְתָּח בְּעוֹד ${gi.left} יְמֵי מִשְׂחָק`):'בְּקָרוֹב'};};
window.TAL_locked=b=>{const ov=$('#ov');ov.hidden=false;ov.innerHTML=`<div class="card"><div class="callp">🔒</div><h2>${b.name}</h2><div class="sub">הַבִּנְיָן הַזֶּה עוֹד סָגוּר. הוּא יִפָּתַח בְּקָרוֹב!<br>רוֹצֶה לִפְתֹּחַ אוֹתוֹ עַכְשָׁו? בַּקֵּשׁ מֵאַבָּא אוֹ מֵאִמָּא.</div></div>`;
  const row=h('div','btnrow');const no=h('button','bigbtn plain sm','<span>בְּסֵדֶר</span>');no.onclick=()=>{ov.hidden=true;};
  const pb=h('button','bigbtn sm','🔒 <span>הוֹרֶה פּוֹתֵחַ</span>');pb.onclick=()=>login(()=>{const g=SET().grad;const o=order();o.splice(o.indexOf(b.id),1);const gi=gradInfo();o.splice(Math.max(0,gi.open.length),0,b.id);g.order=o;g.extra=(g.extra|0)+1;O.persist();parentOn=false;T.openHub();});
  row.append(no,pb);ov.firstChild.appendChild(row);};
/* ---------- personal profile ---------- */
const P_COL=[['#e63946','אָדֹם'],['#3a8fc4','כָּחֹל'],['#4fae4f','יָרֹק'],['#ffd166','צָהֹב'],['#8e6fd1','סָגֹל'],['#ff8a3d','כָּתֹם']];
const P_LOVE=[['art','לְצַיֵּר','🎨'],['music','לְנַגֵּן','🎵'],['code','לִבְנוֹת רוֹבּוֹטִים','🤖'],['read','לִקְרֹא','📚'],['lab','לַחְקֹר','🧪'],['think','לִפְתֹּר חִידוֹת','🧩']];
T.addChoices(P_COL.map(x=>x[1]).concat(P_LOVE.map(x=>x[1])));T.addSay(['מָה הַצֶּבַע הָאָהוּב עָלֶיךָ?','מָה הֲכִי כֵּיף לְךָ?']);
const prof=()=>T.S().prof;
/* one companion everywhere: the friend chosen in the studio. An older save chose an animal in the profile — that one wins once. */
O.PETS.fish=O.PETS.fish||{n:'בּוּעִי',s:()=>T.X.fish};
T.friend=()=>{const sv=O.save,pr=sv.prof;if(pr&&pr.an&&!sv.petMig){if(O.PETS[pr.an]){sv.av.pet=pr.an;O.persist();}sv.petMig=1;}return O.PET().s();};
function profile(back){const pr=Object.assign({},prof()||{});let step=0;O.setScreen('sTal','valley',back);const s=$('#sTal');
  const Q=[['מָה הַצֶּבַע הָאָהוּב עָלֶיךָ?','',P_COL.map(([c,n])=>[c,`<span class="swc big" style="--c:${c}"></span><span>${n}</span>`]),'col'],
    ['מָה הֲכִי כֵּיף לְךָ?','',P_LOVE.map(([k,n,e])=>[k,`<span class="ae">${e}</span><span>${n}</span>`]),'love']];
  const run=()=>{const [q,sub,opts,key]=Q[step];T.hudT('הַכַּרְטִיס שֶׁלִּי',T.progressBar(step,Q.length));s.innerHTML='';
    s.appendChild(h('div','whead',`<span class="gd bob">${O.AV()}</span><h1>${q}</h1>`));if(sub)s.appendChild(h('div','lsent',sub));
    const g=h('div','profg');opts.forEach(([v,html])=>{const b=h('button','pfb'+(pr[key]===v?' on':''),html);b.onclick=()=>{pr[key]=v;sfx.pop(step+2);step++;if(step<Q.length)run();else done();};g.appendChild(b);});s.appendChild(g);O.sayNow=T.spk(q)+T.choiceSay(g,'.pfb>span:last-child');};
  const done=()=>{const S0=T.S();S0.prof=pr;S0.profT=Date.now();O.persist();sfx.win();s.innerHTML='';T.hudT('הַכַּרְטִיס שֶׁלִּי');
    s.appendChild(h('div','pcard',`<div class="pcav">${O.AV()}<span class="pcpet bob">${T.friend()}</span></div><h2>נָעִים לְהַכִּיר, אוֹרֶן!</h2><div class="lsent">${O.PET().n} יְלַוֶּה אוֹתְךָ 😊</div>`));
    s.querySelector('.pcard').style.setProperty('--fc',pr.col);const row=h('div','btnrow');const b=h('button','bigbtn',ICON.play+'<span>הַמְשֵׁךְ</span>');b.onclick=back;row.appendChild(b);s.appendChild(row);O.say('נעים להכיר, אורן!');};
  run();}
T.profile=profile;T.hello=()=>hello();
/* ---------- personal greeting in the hub ---------- */
const hour=()=>new Date().getHours();
const hello=()=>{const H=hour();return H<12?'בֹּקֶר טוֹב':H<17?'צָהֳרַיִם טוֹבִים':'עֶרֶב טוֹב';};
function suggestion(){const s=T.S(),pr=prof()||{};const on=BUILD.filter(b=>T.bState(b)==='on');
  const g=SET().grad;const gi=gradInfo();if(g.on&&gi.open.length>(g.seen|0)){const nb=BUILD.find(b=>b.id===gi.open[gi.open.length-1]);g.seen=gi.open.length;O.persist();if(nb)return {t:`🎉 נִפְתַּח בִּנְיָן חָדָשׁ: ${nb.name}!`,b:nb};}
  const fav=on.find(b=>b.id===pr.love);if(fav){const a=fav.acts.find(x=>!(s.tl[x.id]||{}).n&&!(s.set.offA||{})[x.id]&&(!x.avail||x.avail()));if(a)return {t:`רוֹצֶה לְנַסּוֹת "${a.name}"?`,a};}
  const fresh=shuffle(on.flatMap(b=>b.acts)).find(x=>!(s.tl[x.id]||{}).n&&!(s.set.offA||{})[x.id]&&(!x.avail||x.avail()));
  if(s.last&&s.last.d!==O.today()&&ACT[s.last.id]&&T.bState(ACT[s.last.id].b)==='on')return {t:`בַּפַּעַם הַקּוֹדֶמֶת הָיִיתָ בְּ"${ACT[s.last.id].name}". מַמְשִׁיכִים?`,a:ACT[s.last.id]};
  if(fresh)return {t:`עוֹד לֹא נִסִּיתָ אֶת "${fresh.name}". בּוֹא נְנַסֶּה!`,a:fresh};
  return {t:'אַתָּה כְּבָר מַכִּיר אֶת כָּל הָעִיר! אֵיזֶה אַלּוּף!'};}
O.on('hub',s=>{const pr=prof();if(!pr){setTimeout(()=>profile(T.openHub),0);return;}
  const fg=T.GROUPS.findIndex(g=>g.ids.includes(pr.love));s.querySelectorAll('.gdoor').forEach(c=>{if(c.querySelector('b').textContent===(T.GROUPS[fg]||{}).n){c.classList.add('fav');c.appendChild(h('span','favh','❤️'));}});
  const sg=suggestion();if(sg.b)setTimeout(()=>toast(sg.t),D(300));O.sayNow=(sg.b?T.spk(sg.t):'עִיר הַכִּשְׁרוֹנוֹת. בְּחַר דֶּלֶת.')+T.choiceSay(s,'.gdoor b');});
T.addSay(['עִיר הַכִּשְׁרוֹנוֹת. מָה נְשַׂחֵק?','עִיר הַכִּשְׁרוֹנוֹת. בְּחַר דֶּלֶת.']);
O.on('group',s=>{const pr=prof();if(!pr)return;s.querySelectorAll('.bld').forEach(c=>{const b=BUILD.find(x=>x.name===c.querySelector('.nm').textContent);if(b&&b.id===pr.love){c.classList.add('fav');c.appendChild(h('span','favh','❤️'));}});});
/* remember the last activity */
Object.values(ACT).forEach(a=>{const r=a.run;a.run=back=>{const s=T.S();s.last={id:a.id,d:O.today()};return r(back);};});
/* #426: no badges any more (only stars + gems); an old save keeps its s.bdg, nothing reads it */
function toast(html){if(parentOn||!$('#sPar').hidden)return;document.querySelectorAll('.toast').forEach(x=>x.remove());const t=h('div','toast',html);document.body.appendChild(t);sfx.star(1);setTimeout(()=>t.classList.add('out'),D(2400));setTimeout(()=>t.remove(),D(2900));}
/* ---------- message from the parents ---------- */
O.on('map',m=>{const st=SET();
  /* hide math worlds the parent switched off */
  const cards=m.querySelectorAll('.worlds > .wcard2');O.WORLDS.forEach((w,i)=>{if(st.offW[w.id]&&cards[i])cards[i].hidden=true;});
});
/* ---------- start screen: choose user ---------- */
(()=>{const sb=$('#btnStart');if(!sb)return;const u=h('div','users');
  sb.className='ucard kid';sb.innerHTML=`<span class="ua bob">${O.AV()}</span><b>אוֹרֶן</b><small>יוֹצְאִים לַדֶּרֶךְ!</small>`;
  const pb=h('button','ucard par',`<span class="ua">👤</span><b>הוֹרֶה</b><small>${RSET().pw?'כניסה עם סיסמה':'יצירת משתמש הורה'}</small>`);pb.onclick=()=>{O.audio&&O.audio();login(parentChoice);};
  const wrap=h('div','whoin','<div class="whot">מִי נִכְנָס?</div>');sb.before(wrap);wrap.appendChild(u);u.append(sb,pb);})();
/* Windows + Chrome (not Edge) on the website: one gentle link to open the same game in Edge; progress is the same everywhere */
(()=>{const ua=navigator.userAgent;if(!/Windows/.test(ua)||/Edg\//.test(ua)||!/Chrome\//.test(ua)||!/^https?:$/.test(location.protocol)||/claude\.ai|claudeusercontent/.test(location.host)||window.claude)return;
  const w=$('.whoin');if(!w)return;const a=h('a','edgehint','💡 בְּ-Edge הַקּוֹל בְּעִבְרִית יוֹתֵר טוֹב — לִפְתֹּחַ שָׁם');a.href='#';
  a.onclick=e=>{e.preventDefault();location.href='microsoft-edge:'+location.origin+location.pathname;};w.appendChild(a);})();
function parentChoice(){const ov=$('#ov');ov.hidden=false;ov.innerHTML='<div class="card plog"><h2>שלום! מה תרצו לעשות?</h2></div>';const r=h('div','pchoice');
  const a=h('button','ucard par',`<span class="ua">📊</span><b>לוח הורים</b><small>התקדמות, משימות, זמן והגדרות</small>`);a.onclick=()=>{ov.hidden=true;panel('sum');};
  const b=h('button','ucard kid',`<span class="ua">🎮</span><b>לשחק כהורה</b><small>הכל פתוח, לא משפיע על אורן</small>`);b.onclick=()=>{ov.hidden=true;enterTry();O.showMap();};
  const t=h('button','ucard tog',`<span class="ua">🤝</span><b>יש לי זמן עכשיו</b><small>פעילות קצרה יחד עם אורן</small>`);t.onclick=()=>togPick();
  r.append(a,b,t);ov.firstChild.appendChild(r);const c=h('button','plink','ביטול');c.onclick=()=>{ov.hidden=true;parentOn=false;};ov.firstChild.appendChild(c);}
/* "I have time now": the parent picks a joint activity (or a surprise); it becomes the next step of Oren's path */
function togPick(){const ov=$('#ov');ov.hidden=false;ov.innerHTML='<div class="card plog"><div class="pli">🤝</div><h2>מה נעשה יחד?</h2><div class="sub">הפעילות תופיע כצעד הבא בשביל של אורן. כמה דקות, בלי מסך — רוב הזמן אורן מוביל.</div></div>';
  const g=h('div','popt togp');const go=k=>{T.addTog(k);ov.hidden=true;parentOn=false;sfx.ok(2);O.showMap();};
  const sp=h('button','pchip on','🎲 הפתעה');sp.onclick=()=>go(null);g.appendChild(sp);
  T.TOG.forEach(a=>{const b=h('button','pchip',a.e+' '+plain(a.n));b.onclick=()=>go(a.k);g.appendChild(b);});ov.firstChild.appendChild(g);
  const c=h('button','plink','ביטול');c.onclick=()=>{ov.hidden=true;parentOn=false;};ov.firstChild.appendChild(c);}
/* ======================= PARENT PANEL ======================= */
const BAR=(v,max,col)=>`<span class="pbar"><i style="width:${max?Math.min(100,v/max*100):0}%;background:${col||'#4fae4f'}"></i></span>`;
const fmtMin=sec=>{const m=Math.round(sec/60);return m<60?m+' דק׳':(m/60).toFixed(1)+' שע׳';};
function lastDays(n){const out=[];const d=new Date();for(let i=n-1;i>=0;i--){const x=new Date(d);x.setDate(d.getDate()-i);const k=x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');out.push([k,x]);}return out;}
/* #359: the main view is one day (what he did, live · the plan ahead · strong / weak); everything else is behind one "הגדרות ועוד" entry, in closed sections */
const MORE=[['time','⏱️ זמן משחק והגבלה'],['rem','⏰ תזכורת והודעה לאורן'],['tmpl','🗓️ התבנית לכל יום'],['know','🧭 מה אורן כבר יודע'],['learn','🛤️ המסלול של אורן — הבא בתור'],['full','📈 פירוט מלא'],['iss','⚠️ תקלות'],['voice','🔊 קול — בדיקה ובחירה'],['try','🎮 לשחק כהורה (ניסיון)'],['parts','🧩 להפעיל / לכבות חלקים'],['health','🥤 הפסקות וארוחות'],['read','📖 עזרה בקריאה'],['prog','⏭️ דילוג, איפוס ויהלומים'],['perm','🎤 הרשאות'],['set','🔑 סיסמה וגיבוי'],['map','🗺️ מפת התוכן']];
const FN={map:box=>{if(T.contentMap)T.contentMap(box,sec,BAR);},full:fullTab,try:tryTab,tmpl:tmplTab,time:timeTab,iss:issues,
  rem:box=>{if(window.HEALTH)window.HEALTH.panel(box,sec,()=>panel('rem'),'today');},know:box=>{if(window.KNOW)window.KNOW.panel(box,sec,()=>panel('know'));},learn:box=>{if(window.LEARN)window.LEARN.parentPanel(box,sec,()=>panel('learn'));},
  health:box=>{if(window.HEALTH)window.HEALTH.panel(box,sec,()=>panel('health'),'set');},read:box=>{if(T.rdSettings)T.rdSettings(box,sec,()=>panel('read'));},voice:voiceTab,perm:permTab,parts:partsTab,prog:progTab,set:setTab};
/* a section that would be empty is not listed (G8) */
const HAS={iss:()=>issList().length>0,perm:()=>!permNone(),rem:()=>!!window.HEALTH,know:()=>!!window.KNOW,learn:()=>!!window.LEARN};
const ALIAS={sum:'day',plan:'day','plan-t':'tmpl'};
let curTab='day',openSec=null;
/* on the website there is nothing to approve: no permissions section (G8: hide empty sections) */
const permNone=()=>!!window.__site&&!(window.claude&&window.claude.use);
const exitParent=()=>{parentOn=false;O.showMap();};
function panel(tab){if(O.isParentPlay)O.parentPlay(false);const dl=$('#dlg');if(dl&&!dl.hidden)dl.hidden=true;if(!parentOn)return login(()=>panel(tab));
  tab=ALIAS[tab]||tab;if(tab&&FN[tab]){openSec=tab;curTab='more';}else if(tab){curTab=tab==='more'?'more':'day';if(tab!=='more')openSec=null;}
  const sy=$('#screens').scrollTop;O.setScreen('sPar','valley',exitParent);O.hud('<div class="chip">לוח הורים</div>');const s=$('#sPar');s.innerHTML='';
  s.appendChild(h('div','whead',`<h1>${curTab==='more'?'הגדרות ועוד':'לוח הורים'}</h1>`));
  const body=h('div','pbody');s.appendChild(body);
  if(curTab==='day'){const v=h('div','pday');body.appendChild(v);if(window.PDAY)window.PDAY.view(v,{sec,nowTop});{const pic=window.BW&&window.BW.parentPic();if(pic)body.appendChild(pic);}
    const mr=h('div','btnrow');const mb=h('button','bigbtn plain sm pdmore','⚙️ <span>הגדרות ועוד</span>');mb.onclick=()=>{openSec=null;panel('more');};mr.appendChild(mb);body.appendChild(mr);}
  else{const bk=h('button','pchip pdback','→ חזרה ליום');bk.onclick=()=>panel('day');body.appendChild(bk);warns(body);
    MORE.filter(([id])=>!HAS[id]||HAS[id]()).forEach(([id,n])=>{const d=document.createElement('details');d.className='pdet';const sm=document.createElement('summary');sm.textContent=n;d.appendChild(sm);const inner=h('div','pdin');d.appendChild(inner);let done=false;
    const fill=()=>{if(done)return;done=true;FN[id](inner);};d.addEventListener('toggle',()=>{if(d.open){openSec=id;fill();}});if(openSec===id){d.open=true;fill();}body.appendChild(d);});}
  const out=h('div','btnrow');const bb=h('button','bigbtn plain sm',ICON.home+'<span>יציאה מלוח ההורים</span>');bb.onclick=exitParent;out.appendChild(bb);s.appendChild(out);window.__par=curTab;parLiveOn();
  if(openSec&&curTab==='more')setTimeout(()=>{const o=s.querySelector('details[open]');if(o&&tab===openSec)o.scrollIntoView({block:'start'});else $('#screens').scrollTop=sy;},0);}
T.parentPanel=t=>{parentOn=true;panel(t);};
/* #352: the top line of the day: "playing now · N min (from HH:MM)" + stop, and (#359) "skip now", or "last played" */
let nowPull=0;
function nowTop(el){const DL=window.DAYLOG,PD=window.PDAY;el.innerHTML=DL?DL.nowLine():'';
  /* #612: Oren's device cannot upload (the server got its save failures): say so, instead of looking up to date */
  const st=O.famStale&&O.famStale();if(st){const d=new Date(st);el.appendChild(h('div','dlnow pdstale',`אין עדכון מהמשחק מאז ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`));}
  const left=T.limLeft();if(!DL||!DL.playing()||(left&&left.min<=0))return;
  const row=el.querySelector('.dlnow:not(.pdstale)')||el;const nw=(O.realSave.now||{}).id;
  /* #614: נשלח… → דולג ✓ (his device left the activity), or "המשחק לא קיבל עדיין" after 30 s; while it waits the panel pulls every 5 s */
  if(PD&&nw){const st=PD.nowState&&PD.nowState();
    if(st&&st.s!=='done'){const b=h('button','pchip pdskipwait',st.s==='late'?'⏭ המשחק לא קיבל עדיין · בטל':'⏭ נשלח… בטל');b.onclick=()=>{PD.undo(st.c.i);nowTop(el);};row.appendChild(b);
      clearTimeout(nowPull);nowPull=setTimeout(()=>{if(el.isConnected)parPull();},window.__parPull||5000);}
    else{if(st)row.appendChild(h('span','pchip pdskipped','דולג ✓'));if(!st||st.c.a!==nw){const b=h('button','pchip pdskipnow','⏭ דלג עכשיו');b.onclick=()=>{PD.send('now',nw);sfx.ok&&sfx.ok(1);nowTop(el);};row.appendChild(b);}}}
  const b=h('button','pchip bad','⏹ לעצור עכשיו');b.onclick=()=>{stopNow();sfx.ok&&sfx.ok(1);nowTop(el);};row.appendChild(b);}
/* while the parent panel is open: pull the family save every 30 s so the day view follows Oren live, also from another house;
   #612: and at once when the phone screen is opened again (a locked phone runs no timers) */
let parLive=0;
const parPull=()=>{O.parMark&&O.parMark();return Promise.resolve(O.famPull&&O.famPull()).then(()=>{if(!parentOn||$('#sPar').hidden)return;if(window.PDAY&&curTab==='day')window.PDAY.refresh();if(window.HEALTH&&window.HEALTH.remRefresh)window.HEALTH.remRefresh();});};
function parLiveOn(){if(parLive)return;parLive=setInterval(()=>{if(!parentOn||$('#sPar').hidden){clearInterval(parLive);parLive=0;return;}parPull();},window.__parPull||30000);}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&parentOn&&!$('#sPar').hidden){parPull();parLiveOn();}});
const sec=(box,t,html)=>{const d=h('section','psec',`<h3>${t}</h3>`);if(html)d.insertAdjacentHTML('beforeend',html);box.appendChild(d);return d;};
/* --- summary --- */
/* problems in the last 14 days: one short line, details only on tap */
const ISS={voice:'🔊 הקול של Google לא ענה בזמן — הושמע קול גיבוי',sync:'☁️ השמירה לענן לא הצליחה',err:'🐞 תקלה במשחק'};
const WHY={off:'(המכשיר לא היה מחובר לאינטרנט)',full:'(השרת לא קיבל שמירות באותו זמן — המשחק ניסה שוב אחר כך)'};/* #129: the real reason, 'no internet' only when offline */
const issList=()=>{const from=lastDays(14)[0][0];return (O.realSave.iss||[]).filter(x=>x.d>=from).sort((a,b)=>a.d<b.d?1:-1);};
function issues(box){const L=issList();box.appendChild(h('div','piss',`<div class="pnote">${L.length} תקלות בשבועיים האחרונים</div>`+L.map(x=>`<div class="prow"><span class="pn">${x.d.slice(8)}.${x.d.slice(5,7)} · ${ISS[x.k]||x.k}${WHY[x.m]?' '+WHY[x.m]:x.m?` <small dir="ltr">${String(x.m).replace(/[<>&]/g,'')}</small>`:''}${x.r?' · 📨 נשלח דיווח לבדיקה':''}</span><span class="pc">×${x.n}</span></div>`).join('')));}
/* the two "not checked yet" notes stay at the top of the settings (#359: no longer on the day view) */
function warns(box){permStates().then(st=>{if(st&&Object.values(st).some(v=>v==='prompt'||v==='denied')){const w=h('button','pwarn','⚠️ יש הרשאות שעוד לא אושרו (למשל מיקרופון). לחצו כאן כדי לאשר מראש, כדי שאורן לא ייתקע באמצע.');w.onclick=()=>panel('perm');box.querySelector('.pdback').after(w);}});
  if(!SET().voiceOk){const w=h('button','pwarn','🔊 עוד לא בדקתם את הקול של המשחק. לחצו כאן — לוקח דקה: שומעים דוגמה ואומרים אוקי.');w.onclick=()=>panel('voice');box.appendChild(w);}}
function fullTab(box){const s0=T.S(),sv=O.save;
  if(window.LEARN){const rl=window.LEARN.runwayLine();if(rl)box.appendChild(h('div','pnote',rl));}if(T.thinkSummary)T.thinkSummary(box,sec);
  const acc=sv.ans?Math.round((sv.ok|0)/sv.ans*100):0;const totT=Object.values(s0.time).reduce((a,v)=>a+(v|0),0);const talSt=Object.values(s0.tl).reduce((a,c)=>a+(c.s|0),0);
  sec(box,'במבט אחד',`<div class="ptiles">
    <div><b>${new Set([...(sv.days||[]),...Object.keys(s0.time).filter(k=>(s0.time[k]|0)>=60)]).size}</b><span>ימי משחק</span></div><div><b>${O.dayStreak()}</b><span>רצף ימים</span></div>
    <div><b>${acc}%</b><span>דיוק בחשבון (${sv.ans|0} שאלות)</span></div><div><b>${O.totalStars()}</b><span>כוכבים במסע</span></div>
    <div><b>${O.masteredCount()}/100</b><span>עובדות בלוח הכפל</span></div><div><b>${fmtMin(totT)}</b><span>זמן כולל</span></div>
    <div><b>${talSt}</b><span>כוכבים בעיר הכשרונות</span></div></div>`);
  const days=lastDays(14);const mx=Math.max(600,...days.map(([k])=>s0.time[k]|0));
  sec(box,'זמן משחק — 14 ימים אחרונים',`<div class="pchart">${days.map(([k,x])=>{const v=s0.time[k]|0;return `<div class="pcol" title="${k}: ${fmtMin(v)}"><span class="pv">${v?Math.round(v/60):''}</span><i style="height:${v/mx*100}%"></i><small>${'אבגדהוש'[x.getDay()]}</small></div>`;}).join('')}</div><div class="pnote">בדקות, היום מימין. נספר רק זמן פעיל.</div>`);
  if(T.thinkSkills)T.thinkSkills(box,sec,BAR);
  sec(box,'התקדמות בעולמות המסע',O.WORLDS.map(w=>{const got=w.levels.reduce((a,l)=>a+O.stars(l.id),0),max=w.levels.length*3;return `<div class="prow"><span class="pn">${w.name}${SET().offW[w.id]?' <small>(כבוי)</small>':''}</span>${BAR(got,max,w.color)}<span class="pc">${got}/${max}</span></div>`;}).join(''));
  const st=sv.st||{};const units=O.ALLU.filter(u=>!u.boss&&st[u.id]&&st[u.id].a>=4).map(u=>({u,r:st[u.id].o/st[u.id].a}));
  const weak=[...units].sort((a,b)=>a.r-b.r).slice(0,5),strong=[...units].sort((a,b)=>b.r-a.r).slice(0,3);
  sec(box,'נושאים בחשבון',units.length?`<div class="psub">צריך עוד תרגול:</div>${weak.map(x=>`<div class="prow"><span class="pn">${x.u.name} <small>(${x.u.w.name})</small></span>${BAR(x.r,1,x.r<.6?'#e4572e':x.r<.8?'#e9b949':'#4fae4f')}<span class="pc">${Math.round(x.r*100)}%</span></div>`).join('')}
    <div class="psub">הכי חזק:</div>${strong.map(x=>`<div class="prow"><span class="pn">${x.u.name}</span>${BAR(x.r,1)}<span class="pc">${Math.round(x.r*100)}%</span></div>`).join('')}<div class="pnote">אחוז = תשובות נכונות בניסיון ראשון ובלי רמז.</div>`:'<div class="pnote">עוד אין מספיק נתונים. יופיע אחרי כמה שלבים.</div>');
  sec(box,'עיר הכשרונות',BUILD.map(b=>{const got=b.acts.reduce((a,x)=>a+((s0.tl[x.id]||{}).s|0),0),max=b.acts.length*3,plays=b.acts.reduce((a,x)=>a+((s0.tl[x.id]||{}).n|0),0);const bs=T.bState(b);
    return `<div class="prow"><span class="pn">${b.name}${bs==='off'?' <small>(כבוי)</small>':bs!=='on'?' <small>(🔒 עוד לא נפתח)</small>':''}</span>${BAR(got,max,b.color)}<span class="pc">${got}/${max} · ${plays} פעמים</span></div>`;}).join('')+
    `<div class="pnote">הקלדה: ${s0.typ.wpm|0} מילים בדקה · ${Object.keys(s0.typ.best).length}/13 שיעורים · כתיבה: ${Object.keys(s0.wr||{}).length}/22 אותיות · קוד: ${Object.values(s0.code||{}).filter(v=>v>0).length}/15 שלבים · ציורים: ${s0.art.length}</div>`);
  const pr=prof();const md=s0.mood.slice(-14);const jarN=s0.jar.reduce((a,j)=>a+(j.i?j.i.length:0),0);
  sec(box,'אורן — רגשות והעדפות',`${pr?`<div class="pnote">החבר: ${plain(O.PET().n)} · צבע: ${plain((P_COL.find(a=>a[0]===pr.col)||[])[1]||'')} · הכי כיף לו: ${plain((P_LOVE.find(a=>a[0]===pr.love)||[])[1]||'')}</div>`:''}
    ${md.length?`<div class="pmood">${md.map(m=>FACES[m.f]?`<span title="${m.d}">${FACES[m.f].s}<small>${m.d.slice(5).replace('-','/')}</small></span>`:'').join('')}</div>`:'<div class="pnote">עוד לא נרשמו רגשות.</div>'}<div class="pnote">בצנצנת התודה: ${jarN} דברים טובים.</div>`);}
/* --- the template for every day (the day view's "plan ahead" is in pday.js) --- */
function tmplTab(box){const st=SET();let plan=(st.plan&&st.plan.slice())||['math','any','any'];
  const ps=sec(box,'התבנית לכל יום',`<div class="pnote">מכאן נבנה השביל של כל יום חדש. לכל צעד: חשבון, פעילות לבחירת המשחק, בניין מסוים או פעילות מסוימת. כשיש תבנית, אורן לא נשאל "מה בא לך היום?" — השביל נבנה ממנה. בסוף השביל מגיע סוף הסיפור של היום, ואז זמן חופשי.</div>`);
  const rows=h('div','');ps.appendChild(rows);
  const opts=[['math','🧮 חשבון'],['any','🎲 לבחירת המשחק'],...BUILD.filter(b=>!st.hide[b.id]).map(b=>[b.id,'🏠 '+plain(b.name)+' (פעילות כלשהי)']),...BUILD.filter(b=>!st.hide[b.id]).flatMap(b=>b.acts.filter(a=>!st.offA[a.id]).map(a=>['act:'+a.id,'· '+plain(b.name)+' — '+plain(a.name)]))];
  const draw=()=>{rows.innerHTML='';plan.forEach((v,i)=>{const r=h('div','popt plrow',`<span>צעד ${i+1}:</span>`);const sel=document.createElement('select');sel.className='psel';sel.setAttribute('aria-label','צעד '+(i+1));
      opts.forEach(([k,n])=>{const o=document.createElement('option');o.value=k;o.textContent=n;if(k===v)o.selected=true;sel.appendChild(o);});sel.onchange=()=>{plan[i]=sel.value;};r.appendChild(sel);
      const up=h('button','pchip','▲');up.disabled=i===0;up.onclick=()=>{[plan[i-1],plan[i]]=[plan[i],plan[i-1]];draw();};const rm=h('button','pchip','✕');rm.disabled=plan.length<2;rm.onclick=()=>{plan.splice(i,1);draw();};r.append(up,rm);rows.appendChild(r);});
    if(plan.length<5){const add=h('button','pchip','+ הוספת צעד');add.onclick=()=>{plan.push('any');draw();};rows.appendChild(add);}};draw();
  const row=h('div','btnrow');const sv=h('button','bigbtn sm','<span>שמירת התבנית</span>');sv.onclick=()=>{st.plan=plan.slice();const dd=T.S().daily;let now=false;if(!dd||!dd.done.some(Boolean)){delete T.S().daily;now=true;}O.persist();sfx.ok(1);O.floatText(sv,now?'נשמר — כבר מהיום':'נשמר — יתחיל ממחר');setTimeout(()=>panel('tmpl'),900);};
  const df=h('button','bigbtn plain sm','<span>חזרה לברירת מחדל</span>');df.onclick=()=>{delete st.plan;O.persist();panel('tmpl');};row.append(df,sv);ps.appendChild(row);}
/* --- try it yourself (parent sandbox) --- */
function enterTry(fresh){parentOn=false;O.parentPlay(true,fresh);}
function tryIt(id){enterTry();if(id==='math'){O.showJourney();return;}const a=ACT[id];if(a)a.run(O.showMap);else O.showMap();}
T.tryIt=tryIt;
/* two buttons (G8): play as the parent user, or start that parent user over (fresh: all open, 500 gems) */
function tryTab(box){const ts=sec(box,'משתמש הורה',`<div class="pnote">משתמש נפרד: הכל פתוח. ההתקדמות של אורן לא מושפעת.</div>`);
  const r=h('div','btnrow');const go=h('button','bigbtn','🎮 <span>לשחק כהורה</span>');go.onclick=()=>{enterTry();O.showMap();};
  const rs=h('button','bigbtn plain sm','↺ <span>להתחיל מחדש</span>');rs.onclick=()=>{try{localStorage.removeItem('oren4-v1-parent');}catch(e){}enterTry(true);O.showMap();};r.append(go,rs);ts.appendChild(r);}
(()=>{const bar=h('div','pbar2',`<span class="pbt">👤 מצב הורה — ניסיון. אורן לא מושפע.</span>`);bar.hidden=true;
  const sk=h('button','pchip','⏭ דלג / סיים');sk.onclick=()=>{$('#ov').hidden=true;if(O.skipLevel())return toast('דילגת על השלב ✓');if(!$('#sTal').hidden){const l=T.S().last;if(l&&ACT[l.id]){T.record(l.id,3);toast('סומן כהושלם ✓');}$('#btnBack').click();}else $('#btnBack').click();};
  const hm=h('button','pchip','🏠 בית');hm.onclick=()=>O.showMap();const ex=h('button','pchip on','🚪 חזרה ללוח ההורים');ex.onclick=()=>{O.parentPlay(false);parentOn=true;panel('try');};
  bar.append(sk,hm,ex);document.body.appendChild(bar);O.on('mode',on=>{bar.hidden=!on;});})();
/* --- screen time ---
   lim = {daily (min, every day), bed, nofin (1 = do not let him finish the current activity), bedOff, today:{d, min | n | none}}  — today's preset/grant, back to daily tomorrow.
   A count limit (n) = activities completed today. Settings are newer-wins in the family save (setT), so a grant from the parent's phone reaches Oren's device on the next pull. */
setTimeout(()=>{SET();if(O.settleSet)O.settleSet();},0);
const LIM=()=>{const st=SET();st.lim=st.lim||{daily:0,bed:0,today:null};return st.lim;};
const usedMin=()=>Math.floor(((T.S().time||{})[O.today()]|0)/60);
const doneN=()=>(T.S().cnt||{})[O.today()]|0;
O.on('tlDone',()=>{tEnd=Date.now();cntUp();});O.on('levelDone',()=>{tEnd=Date.now();cntUp();});
function cntUp(){if(O.isParentPlay)return;const s=T.S();s.cnt=s.cnt||{};const d=O.today();s.cnt[d]=(s.cnt[d]|0)+1;const ks=Object.keys(s.cnt).sort();ks.slice(0,Math.max(0,ks.length-30)).forEach(k=>delete s.cnt[k]);}
const todayL=()=>{const l=LIM();return l.today&&l.today.d===O.today()?l.today:null;};
/* today's limit: {min} or {n} or null */
function limNow(){const t=todayL(),l=LIM();if(t){if(t.none)return null;if(t.min!=null)return {min:effMin(t)};}return l.daily?{min:l.daily|0}:null;}
/* #361: a grant ("he has X more", "+15") keeps what the giving device knew he had played (u) and what it gave (add, at).
   A phone whose copy of his play time is behind (his saves failed) would otherwise end his time early. The device he plays on
   notes what IT had played when the grant first reached it (save.tg[at], synced, max), and both devices count X from there.
   The giving device notes nothing (its count is u); it remembers its own grants on this device only. */
const GAVE='oren4-gave',gave=()=>{try{return JSON.parse(localStorage.getItem(GAVE))||[];}catch(e){return [];}};
function effMin(t){if(t.add==null||!t.at)return t.min|0;const s=T.S(),g=s.tg=s.tg||{},sp=$('#sPar');
  if(g[t.at]==null&&!parentOn&&!O.isParentPlay&&(!sp||sp.hidden)&&!gave().includes(t.at)&&(!O.kidDev||O.kidDev())){g[t.at]=usedMin();const ks=Object.keys(g).sort();ks.slice(0,Math.max(0,ks.length-10)).forEach(k=>delete g[k]);O.persist();}
  return (t.min|0)+Math.max(0,(g[t.at]!=null?g[t.at]|0:t.u|0)-(t.u|0));}
/* a grant of v minutes counted from u played minutes */
function giveT(u,v){const at=Date.now();try{localStorage.setItem(GAVE,JSON.stringify(gave().concat(at).slice(-10)));}catch(e){}return {d:O.today(),min:u+v,add:v,u,at};}
function limitToday(){const x=limNow();return x&&x.min?x.min:0;}
/* what is left: {min:m}, or null without a limit */
T.limLeft=()=>{const x=limNow();if(!x)return null;return {min:Math.max(0,x.min-usedMin())};};
T.timeLeft=()=>{const x=T.limLeft();return x&&x.min!=null?x.min:null;};
/* more minutes for today, on top of what is left */
const pnow=()=>{O.persist();O.famNow&&O.famNow();};
/* "he has 0 more minutes" (#132): his device shows the gentle stop screen on its next sync */
function stopNow(){LIM().today={d:O.today(),min:usedMin()};pnow();}
function grant(v){const l=LIM(),x=limNow();const base=x&&x.min&&x.min>usedMin()?x.min:usedMin();l.today=giveT(base,v);pnow();}
const pdOpen={};/* which "more" sections stay open when the panel redraws */
const pdet=(box,key,title)=>{const d=document.createElement('details');d.className='pdet';d.innerHTML=`<summary>${title}</summary>`;const inner=h('div','pdin');d.appendChild(inner);if(pdOpen[key])d.open=true;d.addEventListener('toggle',()=>{pdOpen[key]=d.open;});box.appendChild(d);return inner;};
function timeTab(box){const l=LIM(),x=limNow(),left=T.limLeft(),t=todayL();
  const lt=!x?'ללא הגבלה':x.min+' דק׳';const ll=!left?'':left.min+' דק׳';
  /* one status line, two big buttons, the rest folded */
  const ts=sec(box,'⏱️ היום',`<div class="pstat">שוחקו ${usedMin()} דק׳ · ${doneN()} משימות · הגבלה: ${lt}${t?' (רק היום)':''}${ll?` · נשאר: ${ll}`:''}</div>`);
  const mk=(row,n,fn,on)=>{const b=h('button','pchip big'+(on?' on':''),n);b.onclick=()=>{fn();sfx.ok&&sfx.ok(1);panel('time');};row.appendChild(b);return b;};
  const g=h('div','pbig');[['+15 דק׳',()=>grant(15)]].forEach(([n,f])=>{const b=h('button','bigbtn sm','<span>'+n+'</span>');b.onclick=()=>{f();sfx.ok&&sfx.ok(1);panel('time');};g.appendChild(b);});ts.appendChild(g);
  const more=pdet(ts,'tmore','עוד אפשרויות');
  const pr=h('div','popt','<span>יֵשׁ לוֹ עוֹד:</span>');[20,30,45,60].forEach(v=>mk(pr,v+' דק׳',()=>{l.today=giveT(usedMin(),v);pnow();},left&&left.min===v));
  mk(pr,'ללא הגבלה',()=>{l.today={d:O.today(),none:1};pnow();},t&&t.none);if(t)mk(pr,'↺ כמו כל יום',()=>{l.today=null;pnow();});
  mk(pr,'⏹ לסיים עכשיו',stopNow).classList.add('bad');more.appendChild(pr);
  const ds=sec(pdet(box,'tdaily','🗓️ הגבלה קבועה לכל יום'),'הגבלה קבועה לכל יום','<div class="pnote">נספר רק זמן פעיל. אורן רואה למעלה כמה נשאר. בסוף הזמן — מסך "נתראה מחר"; אם אורן באמצע פעילות, הוא מסיים אותה (עד 5 דקות). שינוי מהטלפון שלכם מגיע למכשיר של אורן תוך כדקה.</div>');
  const dr=h('div','popt','<span>דקות ביום:</span>');[[0,'ללא'],[20,'20'],[30,'30'],[45,'45'],[60,'60'],[90,'90']].forEach(([v,n])=>{const b=h('button','pchip'+((l.daily|0)===v?' on':''),n);b.onclick=()=>{l.daily=v;O.persist();panel('time');};dr.appendChild(b);});ds.appendChild(dr);
  const br=h('div','popt','<span>לא לשחק אחרי:</span>');[[0,'ללא'],[18,'18:00'],[19,'19:00'],[20,'20:00'],[21,'21:00']].forEach(([v,n])=>{const b=h('button','pchip'+((l.bed|0)===v?' on':''),n);b.onclick=()=>{l.bed=v;O.persist();panel('time');};br.appendChild(b);});ds.appendChild(br);
  const fr=h('div','popt','<span>בסוף הזמן:</span>');const fb=h('button','pchip'+(l.nofin?'':' on'),'לסיים את מה שהתחיל');fb.onclick=()=>{if(l.nofin)delete l.nofin;else l.nofin=1;O.persist();panel('time');};fr.appendChild(fb);ds.appendChild(fr);
  const sr=h('div','popt','<span>כשהמשימות נגמרות:</span>');const sb=h('button','pchip'+(l.stopDone?' on':''),'לעצור אותו כשסיים את משימות היום');sb.onclick=()=>{if(l.stopDone)delete l.stopDone;else l.stopDone=1;pnow();panel('time');};sr.appendChild(sb);ds.appendChild(sr);}
/* enforcement on the kid side */
let warned={},lockEl=null,lockKind='',tEnd=0,grace=0,graceEl=null,lastPull=0;
const unlockMsg='אַבָּא אוֹ אִמָּא נָתְנוּ לְךָ עוֹד זְמַן! 🎉';
function unlock(happy){if(lockEl){lockEl.remove();lockEl=null;}document.body.classList.remove('tlocked');if(happy){const pr=T.S().prof||{};const c=h('div','tlock tyay',`<div class="card"><div class="callp bob">${T.friend()}</div><h2>${unlockMsg}</h2></div>`);document.body.appendChild(c);sfx.win();O.rain&&O.rain();O.say(T.spk(unlockMsg));setTimeout(()=>c.remove(),3500);c.onclick=()=>c.remove();}if((O.save.snd|0)>=2)O.musicStart();}
function timeUp(kind){if(lockEl&&lockEl.isConnected)return;endGrace();O.hush&&O.hush();O.musicStop();const n=doneN();lockKind=kind;const pr=T.S().prof||{};
  const head=kind==='bed'?'זְמַן לָנוּחַ':kind==='done'?'סִיַּמְתָּ אֶת הַמְּשִׂימוֹת שֶׁל הַיּוֹם!':'הַזְּמַן שֶׁל הַיּוֹם נִגְמַר';
  lockEl=h('div','tlock',`<div class="card"><div class="callp bob">${T.friend()}</div><h2>${head}</h2><div class="sub">כָּל הַכָּבוֹד הַיּוֹם, אוֹרֶן!${n?` סִיַּמְתָּ ${n===1?'מְשִׂימָה אַחַת':`${n} מְשִׂימוֹת`}.`:''}<br>הַמֹּחַ וְהַגּוּף צְרִיכִים גַּם לָנוּחַ וּלְשַׂחֵק בַּחוּץ.<br>הַכֹּל שָׁמוּר. נִתְרָאֶה מָחָר 👋</div></div>`);
  const row=h('div','btnrow');const pb=h('button','bigbtn plain sm tpb','🔒 <span>להורים</span>');/* #8: a small parent button, not a kid button */pb.onclick=()=>login(()=>{const ov=$('#ov');ov.hidden=false;ov.innerHTML=kind==='done'?'<div class="card"><h2>להמשיך לשחק היום?</h2></div>':'<div class="card"><h2>כמה להוסיף להיום?</h2></div>';const r=h('div','btnrow');
      const give=f=>{f();if(kind==='bed')LIM().bedOff=O.today();if(kind==='done')LIM().doneOff=O.today();pnow();ov.hidden=true;parentOn=false;unlock(false);};
      if(kind==='done'){const b=h('button','bigbtn sm','<span>להמשיך לשחק היום</span>');b.onclick=()=>give(()=>{});r.appendChild(b);}
      else[[10,'+10 דק׳'],[20,'+20 דק׳'],[30,'+30 דק׳']].forEach(([v,n2])=>{const b=h('button','bigbtn sm','<span>'+n2+'</span>');b.onclick=()=>give(()=>grant(v));r.appendChild(b);});
      const c=h('button','bigbtn plain sm','<span>ביטול</span>');c.onclick=()=>{ov.hidden=true;parentOn=false;};r.appendChild(c);ov.firstChild.appendChild(r);});
  row.appendChild(pb);lockEl.firstChild.appendChild(row);document.body.appendChild(lockEl);document.body.classList.add('tlocked');O.say(T.spk(head+' כָּל הַכָּבוֹד הַיּוֹם, אוֹרֶן! נִתְרָאֶה מָחָר.'));}
/* "finish what you started": a gentle banner, then the lock when the activity ends (at most 5 minutes) */
const inAct=()=>!$('#sPlay').hidden||(!$('#sTal').hidden&&!!(T.health&&T.health.current()));
function endGrace(){grace=0;if(graceEl){graceEl.remove();graceEl=null;}}
O.on('screen',()=>{if(grace&&!lockEl)graceDone=1;});let graceDone=0;
const bedNow=()=>{const l=LIM();return l.bed&&new Date().getHours()>=l.bed&&l.bedOff!==O.today();};
const kidSide=()=>!(parentOn||O.isParentPlay||$('#hud').hidden||!$('#sPar').hidden);
/* the parent's switch: stop him when the day's tasks are all done (default OFF) */
const doneStop=()=>{const l=LIM();if(!l.stopDone||l.doneOff===O.today())return false;const d=T.S().daily;return !!(d&&d.d===O.today()&&d.t.length&&d.done.every(x=>x));};
function limCheck(){const left=T.limLeft(),bed=bedNow();const timeOver=!!(left&&left.min<=0);const byTasks=!bed&&!timeOver&&doneStop();const over=bed||timeOver||byTasks;pill(left);
  if(lockEl&&lockEl.isConnected){if(!over){const k=lockKind;lockKind='';unlock(k!=='bed'||!bedNow());}return;}
  if(!over){endGrace();graceDone=0;if(left)warn(left);return;}
  if(!kidSide())return;
  if(bed){if($('#sPlay').hidden)timeUp('bed');return;}
  const ovOpen=!$('#ov').hidden||!$('#dlg').hidden;
  if(!grace){if(!LIM().nofin&&(inAct()||ovOpen)&&!(byTasks&&!ovOpen)){grace=Date.now();graceDone=0;tEnd0=tEnd;
      if(!byTasks&&inAct()){graceEl=h('div','tgrace','⏳ זֶה הַתַּרְגִּיל הָאַחֲרוֹן, אַחֲרָיו נִפָּרֵד');document.body.appendChild(graceEl);O.say(T.spk('זֶה הַתַּרְגִּיל הָאַחֲרוֹן, אַחֲרָיו נִפָּרֵד'));}return;}
    timeUp(byTasks?'done':'time');return;}
  if(Date.now()-grace>5*60000||((tEnd>tEnd0||graceDone||!inAct())&&!ovOpen))timeUp(byTasks?'done':'time');}
let tEnd0=0;
/* spoken, calm (#361): every 10 minutes what is left (as words), a heads-up at 5 and at 1; said at a safe point:
   right away outside an activity, else after his next answer (or when the activity ends), never in the middle of a question */
const TENS=['','עֶשֶׂר','עֶשְׂרִים','שְׁלוֹשִׁים','אַרְבָּעִים','חֲמִשִּׁים','שִׁשִּׁים','שִׁבְעִים','שְׁמוֹנִים','תִּשְׁעִים'];
const HEADS={5:'עוֹד חָמֵשׁ דַּקּוֹת נִגְמֹר. בּוֹא נְסַיֵּם אֶת מָה שֶׁהִתְחַלְנוּ.',1:'עוֹד דַּקָּה אַחַת נִגְמֹר. בּוֹא נְסַיֵּם אֶת מָה שֶׁהִתְחַלְנוּ.'};
let tlPend='';
const inQ=()=>inAct()||!$('#sTal').hidden;
function tlSay(t){if(inQ())tlPend=t;else{tlPend='';O.say(T.spk(t));}}
const tlSafe=()=>{if(!tlPend||lockEl)return;const t=tlPend;tlPend='';O.say(T.spk(t));};
O.on('ans',tlSafe);O.on('tq',tlSafe);O.on('screen',()=>setTimeout(()=>{if(tlPend&&!inQ())tlSafe();},0));
function warn(left){const d=O.today(),m=left.min;const once=(k,f)=>{if(warned[d+k])return;warned[d+k]=1;f();};
  if(m>=4&&m<=5)once('h5',()=>tlSay(HEADS[5]));else if(m===1)once('h1',()=>tlSay(HEADS[1]));
  else if(m>=10&&m%10===0&&TENS[m/10])once('l'+m,()=>tlSay(`נִשְׁאֲרוּ לָנוּ עוֹד ${TENS[m/10]} דַּקּוֹת`));}
/* what is left, small, in the top bar on every screen */
let pillEl=null;
function pillText(left){return left.min<=0?'⏱️ 0':left.min===1?'⏱️ דַּקָּה אַחַת':`⏱️ ${left.min} דַּקּוֹת`;}
function pillSay(left){return left.min===1?'נִשְׁאֲרָה לְךָ דַּקָּה אַחַת':`נִשְׁאֲרוּ לְךָ ${left.min} דַּקּוֹת`;}
function pill(left){const hud=$('#hud');if(!hud)return;if(!pillEl){pillEl=h('button','tpill','');pillEl.onclick=()=>{const l2=T.limLeft();if(l2){sfx.pop(1);O.say(T.spk(pillSay(l2)));}};const g=$('#gemc');if(g)g.before(pillEl);else hud.appendChild(pillEl);}
  const show=left&&left.min>0&&!O.isParentPlay&&$('#sPar').hidden;pillEl.hidden=!show;document.body.classList.toggle('haspill',!!show);if(!show)return;const tx=pillText(left);if(pillEl.textContent!==tx)pillEl.textContent=tx;pillEl.classList.toggle('low',left.min<=5);}
O.on('screen',()=>setTimeout(()=>pill(T.limLeft()),0));O.on('synced',()=>limCheck());
setInterval(()=>{limCheck();const left=T.limLeft();/* a limit is active or locked: look for the parent's change often (#45) */
  if(O.family&&(lockEl||left)&&Date.now()-lastPull>(window.__pullGap!=null?window.__pullGap:lockEl?5000:20000)){lastPull=Date.now();O.famPull&&O.famPull();}},2000);
T.limCheck=limCheck;
/* --- voice --- *//* --- voice --- */
const SAMPLE='שָׁלוֹם אוֹרֶן! הַיּוֹם נִלְמַד יַחַד. הֶחָתוּל יָשֵׁן עַל הַכִּיסֵּא. כַּמָּה זֶה שָׁלוֹשׁ וְעוֹד אַרְבַּע? נָכוֹן, שֶׁבַע!';
/* one fixed game voice (Google Kore at 0.9, chosen by the parents); no voice options */
function voiceTab(box){const st=SET();const g=(window.__gv||{}).ok;
  const vc=sec(box,'בדיקת קול — דקה אחת',`<div class="vnow">${g?'קול: <b>Kore</b> — אותו קול בכל המכשירים':'קול: <b>הקול של המכשיר</b> (באתר המשחק: Kore — אותו קול בכל המכשירים)'}${st.voiceOk?' · <span class="pst ok">אושר ✓</span>':''}</div><div class="vsample">${SAMPLE}</div>`);
  const r=h('div','btnrow');const pl=h('button','bigbtn','▶ <span>השמיעו דוגמה</span>');pl.onclick=()=>O.say(SAMPLE);
  const okb=h('button','bigbtn sm','👍 <span>אוקי, הקול טוב</span>');okb.onclick=()=>{st.voiceOk={t:Date.now()};O.persist();sfx.win();panel('voice');};
  r.append(pl,okb);vc.appendChild(r);/* auto-read moved to "📖 עזרה בקריאה" (#613) */const sw=navigator.serviceWorker;if(g&&sw&&sw.controller){const dl=h('button','bigbtn plain sm','⬇️ <span>הורדת כל הקולות למכשיר הזה (כ-15MB)</span>');dl.onclick=()=>{dl.disabled=true;sw.onmessage=e=>{const d=e.data||{};if(d.type==='prefetch')dl.lastChild.textContent=d.left?'מוריד… נשארו '+d.left:'✓ '+d.ok+' קולות שמורים במכשיר';};sw.controller.postMessage({type:'prefetch',k:(window.__gv&&window.__gv.ver)|0});};vc.appendChild(dl);}
  /* the explanations wait behind "עזרה" (G8) */
  const help=document.createElement('details');help.className='pdet';help.innerHTML='<summary>❓ עזרה</summary>';const hin=h('div','pdin');help.appendChild(hin);vc.appendChild(help);
  hin.appendChild(h('div','pnote','לחצו ▶ ושמעו דוגמה. אם הקול נשמע טוב — "אוקי, הקול טוב" וסיימתם.'));if(g)return;
  sec(hin,'איך מקבלים קול עברי טוב יותר — בחינם',`<div class="pnote">• <b>במחשב Windows עם Edge:</b> יש קולות עבריים טבעיים מובנים (Hila / Avri). פשוט פותחים את המשחק ב-Edge.<br>• <b>Windows בלי חיבור:</b> הגדרות ← זמן ושפה ← דיבור ← הוספת קולות ← עברית.<br>• <b>טלפון Android:</b> הגדרות ← נגישות ← המרת טקסט לדיבור ← מנוע Google ← להתקין עברית.<br>• <b>אייפון/אייפד:</b> הגדרות ← נגישות ← תוכן מוקרא ← קולות ← עברית ← להוריד את Carmit (משופר).</div>`);
}
/* --- permissions --- */
async function permTab(box){const d=sec(box,'הרשאות','<div class="pnote">בודק…</div>');const P=await getPerm();
  if(!P&&!window.claude){d.innerHTML='<h3>הרשאות</h3><div class="pnote">✓ באתר הזה לא צריך הרשאות מיוחדות. (קריאה בקול עם מיקרופון זמינה רק בגרסה שבתוך Claude.)</div>';return;}
  if(!P){d.innerHTML='<h3>הרשאות</h3><div class="pnote">בתצוגה הזו אי אפשר לבקש הרשאות מראש. אם תידרש הרשאה (למשל מיקרופון), אורן יתבקש לקרוא לכם, ואז תאשרו בחלון שייפתח.</div>';return;}
  let st={};try{st=await P.state();}catch(e){}
  const names=[...new Set(['dictation',...Object.keys(st)])];
  d.innerHTML=`<h3>הרשאות</h3><div class="pnote">כדאי לאשר כאן הכל מראש, כדי שאורן לא יקבל חלון אישור באמצע משחק. אם משהו נחסם, המשחק יבקש מאורן לקרוא לכם.</div>`+
    names.map(n=>{const v=st[n]||'unavailable';const [lbl,cls]=PST[v]||[v,'na'];return `<div class="prow"><span class="pn">${PNAME[n]||n}</span><span class="pst ${cls}">${lbl}</span></div>`;}).join('');
  const row=h('div','btnrow');const all=h('button','bigbtn sm','✅ <span>אפשרו את כל ההרשאות</span>');all.onclick=async()=>{all.disabled=true;try{await P.request();}catch(e){}panel('perm');};row.appendChild(all);
  if(Object.values(st).includes('denied')){const mg=h('button','bigbtn plain sm','⚙️ <span>פתיחת הגדרות הרשאות</span>');mg.onclick=async()=>{try{await P.manage();}catch(e){O.floatText(mg,'פתחו את תפריט ההרשאות של הדף');}panel('perm');};row.appendChild(mg);}
  d.appendChild(row);
  if(!names.some(n=>st[n]==='prompt'||st[n]==='denied'))d.appendChild(h('div','pnote','✓ כל ההרשאות מאושרות. אין צורך לעשות כלום.'));
  d.appendChild(h('div','pnote','קריאה בקול עובדת ב-Chrome או Edge במחשב. בדפדפנים אחרים הפעילות פשוט לא תופיע.'));}
/* --- parts: enable / disable / gradual --- */
function toggle(on,lbl,fn){const b=h('button','pchip'+(on?' on':''),(on?'✓ ':'')+lbl);b.onclick=()=>{fn();O.persist();panel('parts');};return b;}
let partsOpen=null;
function partsTab(box){const st=SET();const g=st.grad;
  if(T.thinkSettings)T.thinkSettings(box,sec,()=>panel('parts'));
  const gs=sec(box,'פתיחה הדרגתית של עיר הכשרונות','<div class="pnote">כשההפעלה ההדרגתית פועלת, אורן מתחיל עם 2 בניינים ובניין חדש נפתח כל כמה ימי משחק — זה שומר על עניין ועל הפתעה. אורן רואה את הבניינים הסגורים ומתי ייפתחו.</div>');
  const r1=h('div','popt','<span>מצב:</span>');r1.appendChild(toggle(!!g.on,g.on?'פועל':'כבוי',()=>{g.on=g.on?0:1;if(g.on){g.base=(O.save.days||[]).length;g.extra=0;g.seen=2;}}));gs.appendChild(r1);
  if(g.on){const r2=h('div','popt','<span>בניין חדש כל:</span>');[1,2,3,7].forEach(n=>r2.appendChild(toggle((g.every|0)===n,n===1?'יום משחק':n+' ימי משחק',()=>{g.every=n;})));gs.appendChild(r2);
    const gi=gradInfo();gs.appendChild(h('div','pnote',`פתוחים ${gi.open.length} מתוך ${gi.ord.length}.${gi.next?` הבא בתור: ${(BUILD.find(b=>b.id===gi.next)||{}).name} (בעוד ${gi.left} ימי משחק).`:''}`));
    const r3=h('div','btnrow');const nx=h('button','bigbtn sm','<span>פתחו את הבא עכשיו</span>');nx.disabled=!gi.next;nx.onclick=()=>{g.extra=(g.extra|0)+1;O.persist();panel('parts');};r3.appendChild(nx);gs.appendChild(r3);
    const ol=h('div','gord');const od=pdet(gs,'gord','סדר הפתיחה (אפשר להזיז)');
    gi.ord.forEach((id,i)=>{const b=BUILD.find(x=>x.id===id);const row=h('div','gro'+(gi.open.includes(id)?' open':''),`<span>${i+1}. ${b.name} ${gi.open.includes(id)?'✓':'🔒'}</span>`);
      const up=h('button','pchip','▲');up.disabled=i===0;up.onclick=()=>{const o=order();const a=o.indexOf(id);const prev=gi.ord[i-1];const bI=o.indexOf(prev);o[a]=prev;o[bI]=id;g.order=o;O.persist();panel('parts');};row.appendChild(up);ol.appendChild(row);});
    od.appendChild(ol);}
  /* one toggle per building; its activities show only after a tap on the building's name (G8) */
  const bs=sec(box,'בניינים ופעילויות','<div class="pnote">דברים כבויים לא מופיעים לאורן. לחיצה על שם הבניין: הפעילויות שלו.</div>');
  BUILD.forEach(b=>{const on=!st.hide[b.id];const row=h('div','pbld'+(partsOpen===b.id?' open':''));const nb=h('button','pbn',(on?'◂ ':'')+b.name);nb.disabled=!on;
    row.appendChild(nb);row.appendChild(toggle(on,on?'פועל':'כבוי',()=>{if(on)st.hide[b.id]=1;else delete st.hide[b.id];}));
    if(on){const acts=h('div','pacts');b.acts.forEach(a=>{const aon=!st.offA[a.id];acts.appendChild(toggle(aon,plain(a.name),()=>{if(aon)st.offA[a.id]=1;else delete st.offA[a.id];}));});row.appendChild(acts);
      nb.onclick=()=>{partsOpen=partsOpen===b.id?null:b.id;bs.querySelectorAll('.pbld.open').forEach(x=>{if(x!==row)x.classList.remove('open');});row.classList.toggle('open',partsOpen===b.id);};}bs.appendChild(row);});
  const ws=sec(box,'עולמות החשבון','<div class="pnote">עולם כבוי לא מופיע במפה, וגם לא נדרש כדי להגיע לקרב האחרון.</div>');const wr=h('div','popt');
  O.WORLDS.filter(w=>w.id!=='fin').forEach(w=>{const on=!st.offW[w.id];wr.appendChild(toggle(on,w.name,()=>{if(on)st.offW[w.id]=1;else delete st.offW[w.id];}));});ws.appendChild(wr);
  const os=sec(box,'עוד');const r4=h('div','popt','<span>משימות היום:</span>');r4.appendChild(toggle(!st.noDaily,st.noDaily?'כבוי':'פועל',()=>{st.noDaily=st.noDaily?0:1;}));os.appendChild(r4);
  const r5=h('div','popt','<span>כל השלבים פתוחים (בלי לחכות לכוכבים):</span>');r5.appendChild(toggle(!!st.all,st.all?'פתוח':'כבוי',()=>{st.all=!st.all;}));os.appendChild(r5);}
/* --- progress: skip / reset / gems --- */
function armBtn(lbl,cls,fn){const b=h('button','pchip '+(cls||''),lbl);let arm=0;b.onclick=()=>{if(Date.now()-arm>3000){arm=Date.now();b.textContent='בטוחים? לחצו שוב';b.classList.add('arm');return;}fn();O.persist();sfx.ok(1);panel('prog');};return b;}
/* one "⋯" per row (its actions open on tap); the one big reset is last (G8) */
function moreRow(row,...btns){const m=h('button','pchip pmore','⋯');m.setAttribute('aria-label','עוד');const a=h('span','practs');btns.forEach(b=>a.appendChild(b));
  m.onclick=()=>row.classList.toggle('open');row.append(m,a);return row;}
function progTab(box){const sv=O.save,s0=T.S();
  const ws=sec(box,'עולמות החשבון','<div class="pnote">לחיצה על ⋯: דילוג (כל השלבים עבורים) או איפוס.</div>');
  O.WORLDS.forEach(w=>{const got=w.levels.filter(l=>O.stars(l.id)).length;const row=h('div','prow',`<span class="pn">${w.name}</span>${BAR(got,w.levels.length,w.color)}<span class="pc">${got}/${w.levels.length}</span>`);
    moreRow(row,armBtn('⏭️ דילוג','',()=>{w.levels.forEach(l=>{if(!O.stars(l.id))sv.s[l.id]=1;});sv.story[w.id+'-in']=1;sv.story[w.id+'-out']=1;}),
      armBtn('↺ איפוס','bad',()=>{w.levels.forEach(l=>{delete sv.s[l.id];});delete sv.story[w.id+'-in'];delete sv.story[w.id+'-out'];w.units.forEach(u=>{if(sv.st)delete sv.st[u.id];});}));ws.appendChild(row);});
  const bs=sec(box,'בנייני עיר הכשרונות','<div class="pnote">לחיצה על ⋯: איפוס הבניין (הציורים נשמרים).</div>');
  BUILD.forEach(b=>{const got=b.acts.reduce((a,x)=>a+((s0.tl[x.id]||{}).s|0),0);const row=h('div','prow',`<span class="pn">${b.name}</span>${BAR(got,b.acts.length*3,b.color)}<span class="pc">${got}/${b.acts.length*3}</span>`);
    moreRow(row,armBtn('↺ איפוס','bad',()=>{b.acts.forEach(a=>delete s0.tl[a.id]);if(b.id==='code')s0.code={};if(b.id==='write')s0.wr={};if(b.id==='type')s0.typ={best:{},wpm:0};}));bs.appendChild(row);});
  const gs=sec(box,'יהלומים',`<div class="pnote">כרגע: <b>${sv.gems|0}</b> יהלומים.</div>`);const gr=h('div','popt');
  [10,50,-10].forEach(n=>{const b=h('button','pchip',(n>0?'+':'')+n);b.onclick=()=>{sv.gems=Math.max(0,(sv.gems|0)+n);O.persist();O.updateGems&&O.updateGems();panel('prog');};gr.appendChild(b);});gs.appendChild(gr);
  if(window.LEARN)window.LEARN.skillsPanel(pdet(box,'skills','📶 רמות לפי מיומנות'),sec,()=>panel('prog'));
  const rs=sec(box,'איפוס מלא','<div class="pnote">מוחק את כל ההתקדמות של אורן. הסיסמה, ההגדרות והכרטיס האישי נשמרים.</div>');
  const rr=h('div','popt');rr.appendChild(armBtn('🗑️ איפוס כל ההתקדמות','bad',()=>{const keep={set:SET(),prof:prof()};O.resetAll(keep);}));rs.appendChild(rr);}
/* --- settings --- */
function setTab(box){const st=SET();
  const ps=sec(box,'סיסמת הורה','<div class="pnote">החלפת הסיסמה. (אם תשכחו: במסך הכניסה יש "שכחתי סיסמה".)</div>');const p1=h('input','pgin sm');p1.type='password';p1.placeholder='סיסמה חדשה';const p2=h('input','pgin sm');p2.type='password';p2.placeholder='שוב';
  [p1,p2].forEach(x=>{x.autocomplete='off';x.onkeydown=e=>e.stopPropagation();});const pb=h('button','pchip','שמירת סיסמה');pb.onclick=async()=>{if(p1.value.length<4||p1.value!==p2.value){O.floatText(pb,p1.value.length<4?'לפחות 4 תווים':'לא זהות');sfx.no();return;}st.pw=await hash(p1.value);st.pwT=Date.now();O.persist();O.floatText(pb,'נשמר ✓');p1.value=p2.value='';};
  const pr=h('div','popt');pr.append(p1,p2,pb);ps.appendChild(pr);
  const ks=sec(box,'הכרטיס האישי של אורן','<div class="pnote">אורן בחר חיה, צבע ותחום אהוב. המשחק משתמש בזה כדי לברך אותו, להציע לו פעילויות ולהדגיש את מה שהוא אוהב.</div>');const kr=h('div','popt');const kb=h('button','pchip','פתחו את הכרטיס מחדש לאורן');kb.onclick=()=>{parentOn=false;profile(T.openHub);};kr.appendChild(kb);ks.appendChild(kr);
  const bk=sec(box,'גיבוי','<div class="pnote">ההתקדמות נשמרת אוטומטית בענן. אפשר גם להעתיק גיבוי ידני ולהדביק אותו במחשב אחר.</div>');
  const ta=h('textarea','pta');ta.setAttribute('aria-label','גיבוי');ta.rows=3;ta.onkeydown=e=>e.stopPropagation();const r=h('div','btnrow');
  const ex=h('button','bigbtn sm','<span>הצג גיבוי</span>');ex.onclick=()=>{ta.value=JSON.stringify(O.save);ta.select();try{navigator.clipboard&&navigator.clipboard.writeText(ta.value).then(()=>O.floatText(ex,'הועתק!'),()=>{});}catch(e){}};
  const im=h('button','bigbtn plain sm','<span>שחזור מגיבוי</span>');im.onclick=()=>{try{const o=JSON.parse(ta.value);if(!o||typeof o!=='object'||!o.v)throw 0;o.t=Date.now()+1;O.mergeIn(o);O.persist();O.floatText(im,'שוחזר!');sfx.win();setTimeout(()=>panel('set'),600);}catch(e){O.floatText(im,'גיבוי לא תקין');sfx.no();}};
  r.append(ex,im);bk.append(ta,r);}
})();

/* ===== HOME: one clear place to start · "what do you feel like today?" · today's path · together time · home button ===== */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$,ICON,SPR,pick,shuffle}=O;const {X,ACT,ALLSPR}=T;const sfx=O.sfx,D=O.D;
function nextLevel(){const off=(T.S().set.offW)||{};for(const w of O.WORLDS){if(off[w.id])continue;for(const lv of w.levels){if(!O.stars(lv.id)&&!O.known(lv.id)&&O.unlocked(lv))return lv;}}return null;}
T.nextLevel=nextLevel;
const dayNum=()=>{const [y,m,d]=O.today().split('-').map(Number);return Math.floor(Date.UTC(y,m-1,d)/864e5);};
/* ---------- together time (🤝): Oren leads most of these ---------- */
const TOG=[
 {k:'read',e:'📖',n:'קוֹרְאִים יַחַד',lead:1,kid:'קַח סֵפֶר וּקְרָא לְאַבָּא אוֹ לְאִמָּא. אַתָּה קוֹרֵא, וְהֵם מַקְשִׁיבִים!',par:'אורן קורא לכם (ספר, שלט או אריזה). הקשיבו, ועזרו רק אם הוא מבקש.'},
 {k:'teach',e:'🧑‍🏫',n:'אֲנִי הַמּוֹרֶה',lead:1,kid:L=>`לַמֵּד אֶת אַבָּא אוֹ אִמָּא מַשֶּׁהוּ שֶׁלָּמַדְתָּ${L?` — ${L}`:''}. עַכְשָׁו אַתָּה הַמּוֹרֶה!`,par:L=>`אורן מלמד אתכם${L?' ('+T.plainHe(L)+')':''}. היו תלמידים סקרנים: שאלו שאלות, ו"טעו" פעם אחת כדי שיתקן אתכם.`},
 {k:'duel',e:'⚡',n:'דּוּ-קְרָב חֶשְׁבּוֹן',lead:1,kid:'אַתָּה שׁוֹאֵל תַּרְגִּיל, וְאַבָּא אוֹ אִמָּא עוֹנִים. אַחַר כָּךְ מִתְחַלְּפִים. מִי עוֹנֶה מַהֵר יוֹתֵר?',par:()=>{const lv=nextLevel();return 'תרגילים בעל פה, בתורות — אורן שואל ראשון.'+(lv?' נושא מתאים עכשיו: '+T.plainHe(lv.u.name)+'.':'');}},
 {k:'find',e:'🔍',n:'מִי מוֹצֵא רִאשׁוֹן?',lead:1,kid:'אַתָּה בּוֹחֵר צֶבַע אוֹ צוּרָה, וְכֻלָּם מְחַפְּשִׂים בַּבַּיִת. מִי מוֹצֵא רִאשׁוֹן?',par:'אורן בוחר צבע או צורה (עיגול, ריבוע...), וכולם מחפשים דבר כזה בבית. אחר כך מתחלפים.'},
 {k:'king',e:'👑',n:'הַמֶּלֶךְ אוֹמֵר',lead:1,kid:'אַתָּה הַמֶּלֶךְ! תֵּן הוֹרָאוֹת, וְאַבָּא אוֹ אִמָּא עוֹשִׂים אוֹתָן רַק כְּשֶׁאַתָּה אוֹמֵר "הַמֶּלֶךְ אוֹמֵר".',par:'אורן נותן הוראות. עושים רק כשהוא אומר "המלך אומר" — ו"מתבלבלים" לפעמים, כדי שיצחק.'},
 {k:'breath',e:'🫧',n:'נוֹשְׁמִים יַחַד',lead:1,kid:'לַמֵּד אֶת אַבָּא אוֹ אִמָּא לִנְשֹׁם: שְׁאִיפָה אֲרֻכָּה... וּנְשִׁיפָה אִטִּית. חָמֵשׁ פְּעָמִים, וּבַסּוֹף חִבּוּק!',par:'אורן מלמד אתכם נשימה איטית (כמו בחורשת השקט). 5 נשימות, ובסוף חיבוק.'},
 {k:'ask',e:'❓',n:'שְׁאֵלָה וּתְשׁוּבָה',kid:'אַבָּא אוֹ אִמָּא שׁוֹאֲלִים שְׁאֵלָה, וְאַתָּה עוֹנֶה. אַחַר כָּךְ אַתָּה שׁוֹאֵל אוֹתָם!',par:'חידון קצר בתורות — על חיות, מספרים, מקומות. אורן שואל גם אתכם.'},
 {k:'story',e:'📜',n:'סִפּוּר מִשָּׁלוֹשׁ מִלִּים',kid:'בַּחֲרוּ יַחַד שָׁלוֹשׁ מִלִּים, וְסַפְּרוּ סִפּוּר שֶׁיֵּשׁ בּוֹ אֶת כֻּלָּן. אַתָּה מַתְחִיל!',par:'בוחרים 3 מילים (למשל: דרקון, עוגה, אוטובוס) וממציאים יחד סיפור, משפט-משפט בתורות.'},
 {k:'draw',e:'🎨',n:'צִיּוּר בְּתוֹרוֹת',kid:'קְחוּ דַּף וְעִפָּרוֹן. אַתָּה מְצַיֵּר קַו, אַחַר כָּךְ אַבָּא אוֹ אִמָּא, וְשׁוּב אַתָּה. מָה יֵצֵא?',par:'כל אחד מוסיף קו או צורה בתורו, עד שיוצא ציור. אורן מחליט מה זה.'},
 {k:'count',e:'🔢',n:'סוֹפְרִים בְּתוֹרוֹת',kid:'אַתָּה אוֹמֵר מִסְפָּר, וְאַבָּא אוֹ אִמָּא אוֹמְרִים אֶת הַבָּא. עַד כַּמָּה תַּגִּיעוּ?',par:'סופרים בתורות. אפשר גם בקפיצות של 2, 5 או 10, או אחורה.'},
 {k:'hide',e:'🧸',n:'חַם אוֹ קַר',kid:'אַבָּא אוֹ אִמָּא מַחְבִּיאִים צַעֲצוּעַ, וְאַתָּה מְחַפֵּשׂ. הֵם אוֹמְרִים "חַם" אוֹ "קַר". אַחַר כָּךְ אַתָּה מַחְבִּיא!',par:'מחביאים צעצוע ואורן מחפש לפי "חם / קר". אחר כך הוא מחביא ואתם מחפשים.'}];
/* ---------- real-world missions: one when a math world or a city building is finished ---------- */
const RW={
 num:{e:'🔟',t:'אֱסֹף דְּבָרִים קְטַנִּים, וְסַדֵּר אוֹתָם בַּעֲרֵמוֹת שֶׁל עֶשֶׂר. כַּמָּה עֲרֵמוֹת יָצְאוּ? סַפֵּר לְאַבָּא אוֹ לְאִמָּא!'},
 add:{e:'🍴',t:'סְפֹר כַּמָּה כַּפּוֹת וְכַמָּה מַזְלְגוֹת יֵשׁ בַּמְּגֵרָה. כַּמָּה יֵשׁ בְּיַחַד? סַפֵּר לְאַבָּא אוֹ לְאִמָּא!'},
 sub:{e:'🧸',t:'שִׂים 10 צַעֲצוּעִים עַל הַשָּׁטִיחַ, וְהַחְבֵּא 3. כַּמָּה נִשְׁאֲרוּ? סַפֵּר לְאַבָּא אוֹ לְאִמָּא!'},
 mul:{e:'🪑',t:'סְפֹר אֶת הָרַגְלַיִם שֶׁל הַכִּסְאוֹת בַּמִּטְבָּח. לְכָל כִּסֵּא יֵשׁ 4!'},
 div:{e:'✏️',t:'חַלֵּק 12 עֶפְרוֹנוֹת שָׁוֶה בְּשָׁוֶה לְ-3 עֲרֵמוֹת. כַּמָּה יֵשׁ בְּכָל עֲרֵמָה? סַפֵּר לְאַבָּא אוֹ לְאִמָּא!'},
 word:{e:'💬',t:'הַמְצֵא תַּרְגִּיל-סִפּוּר עַל הַבַּיִת שֶׁלְּךָ, וּשְׁאַל אֶת אַבָּא אוֹ אִמָּא!'},
 time:{e:'🕰️',t:'מְצָא שָׁעוֹן בַּבַּיִת. מָה הַשָּׁעָה עַכְשָׁו?'},
 fin:{e:'🏰',t:'סַפֵּר לְמִישֶׁהוּ בַּבַּיִת אֵיךְ נִצַּחְתָּ בַּטִּירָה!'},
 read:{e:'🏷️',t:'מְצָא בַּבַּיִת 3 דְּבָרִים שֶׁכָּתוּב עֲלֵיהֶם מַשֶּׁהוּ, וּקְרָא אוֹתָם.'},
 write:{e:'📝',t:'כְּתֹב פֶּתֶק קָטָן לְאַבָּא אוֹ לְאִמָּא, וְתֵן לָהֶם.'},
 stories:{e:'🌙',t:'סַפֵּר לְמִישֶׁהוּ בַּבַּיִת סִפּוּר שֶׁקָּרָאתָ.'},
 eng:{e:'🔤',t:'מְצָא בַּבַּיִת 3 דְּבָרִים שֶׁאַתָּה יוֹדֵעַ אֵיךְ קוֹרְאִים לָהֶם בְּאַנְגְּלִית.'},
 world:{e:'🚩',t:'צַיֵּר עַל דַּף דֶּגֶל שֶׁל אֶרֶץ שֶׁאַתָּה זוֹכֵר.'},
 lab:{e:'💧',t:'עִם אַבָּא אוֹ אִמָּא: מְצָא דָּבָר שֶׁשּׁוֹקֵעַ בַּמַּיִם, וְדָבָר שֶׁצָּף.'},
 art:{e:'🔴',t:'מְצָא 5 דְּבָרִים אֲדֻמִּים בַּבַּיִת.'},
 music:{e:'🥁',t:'תּוֹפֵף קֶצֶב עַל הַשֻּׁלְחָן, וּבַקֵּשׁ מִמִּישֶׁהוּ לַחֲזֹר אַחֲרֶיךָ.'},
 think:{e:'📏',t:'סַדֵּר 5 דְּבָרִים מֵהַקָּטָן לַגָּדוֹל.'},
 code:{e:'🤖',t:'תֵּן לְאַבָּא אוֹ לְאִמָּא הוֹרָאוֹת כְּמוֹ לְרוֹבּוֹט: "צַעַד קָדִימָה, פְּנֵה יָמִינָה"!'},
 mind:{e:'👂',t:'שֵׁב בְּשֶׁקֶט דַּקָּה אַחַת, וְהַקְשֵׁב: כַּמָּה קוֹלוֹת אַתָּה שׁוֹמֵעַ?'},
 type:{e:'⌨️',t:'מְצָא עַל הַמִּקְלֶדֶת אֶת הָאוֹתִיּוֹת שֶׁל הַשֵּׁם שֶׁלְּךָ.'}};
/* a new step: right after where Oren is now; before he chose his path it waits for it (real-world) or starts it (together) */
function addStep(id,now){const d=T.dailyEnsure();const nx=d.done.findIndex(x=>!x);
  if(nx>=0){d.t.splice(nx,0,id);d.done.splice(nx,0,0);}else if(!now&&!d.ch){d.cr=d.cr||[];if(!d.cr.includes(id))d.cr.push(id);}else{d.t.push(id);d.done.push(0);}O.persist();}
function togStep(lead){const S0=T.S();const pool=TOG.filter(a=>(!lead||a.lead)&&a.k!==S0.togL);const a=pick(pool);S0.togL=a.k;return 'tog:'+a.k;}
T.TOG=TOG;T.RW=RW;
T.addTog=k=>{const id=k?'tog:'+k:togStep(false);if(T.S().set.noDaily){O.persist();special(-1,id);return;}addStep(id,true);};
/* the first check only notes what is already finished (quietly, without saving, so a fresh device does not look newer than the family save) */
function checkRW(){const S0=T.S();const seed=!S0.rw;S0.rw=S0.rw||{};let any=0;
  const doneW=w=>!((S0.set.offW||{})[w.id])&&w.levels.every(l=>O.stars(l.id));
  const doneB=b=>{const a=b.acts.filter(x=>!x.avail||x.avail());return a.length&&a.every(x=>((S0.tl[x.id]||{}).s|0)>0);};
  [...O.WORLDS.filter(doneW),...T.BUILD.filter(doneB)].forEach(x=>{if(!RW[x.id]||S0.rw[x.id])return;S0.rw[x.id]=1;any=1;if(!seed&&!S0.set.noDaily)addStep('rw:'+x.id);});
  if(any&&!seed)O.persist();}
O.on('levelDone',checkRW);O.on('tlDone',checkRW);setTimeout(()=>{if(!T.S().rw)checkRW();},0);
/* what Oren learned last (for "teach your parent") */
function learned(){const l=T.S().last;if(!l)return '';if(l.id==='math'){const lv=nextLevel();return lv?lv.u.name:'';}return ACT[l.id]?ACT[l.id].name:'';}
/* ---------- the day's domains ---------- */
const MATH={id:'math',n:'מַסַּע הַחֶשְׁבּוֹן',e:'🧮',c:'#d99a2b'};
const rest=id=>!!(window.HEALTH&&window.HEALTH.resting(window.HEALTH.domOf(id)));
const poolOf=bids=>T.dailyPool().filter(id=>bids.includes(ACT[id].b.id)&&!rest(id));
const grpOf=bid=>T.GROUPS.find(g=>g.ids.includes(bid))||{};
const gid=dm=>String(dm).startsWith('b:')?grpOf(dm.slice(2)).id:dm;
const domOf=id=>id==='math'?'math':ACT[id]?grpOf(ACT[id].b.id).id:null;
function doms(){const out=[];if(nextLevel()&&!rest('math'))out.push(MATH);T.GROUPS.forEach(g=>{if(poolOf(g.ids).length)out.push(g);});return out;}
/* "what next?": the learning engine (learn.js) picks the steps of a domain by his level, due reviews and what he has not seen; the old random pick fills what it leaves */
function stepsOf(dm,n,used){let out=[];if(window.LEARN&&LEARN.plan&&!String(dm).startsWith('b:')&&dm!=='tog'){try{out=(LEARN.plan(dm,n,used)||[]).filter(x=>x&&(ACT[x]||x==='math')).slice(0,n);}catch(e){out=[];}}
  if(out.length>=n)return out;const rest=stepsOfRnd(dm,n-out.length,new Set([...used,...out.filter(x=>x!=='math')]));return out.concat(rest);}
function stepsOfRnd(dm,n,used){if(dm==='math')return Array(n).fill('math');const bid=String(dm).startsWith('b:')?dm.slice(2):null;
  let pool=shuffle(poolOf(bid?[bid]:(T.GROUPS.find(g=>g.id===dm)||{ids:[]}).ids).filter(x=>!used.has(x)));
  if(bid&&pool.length<n)pool=pool.concat(shuffle(poolOf(grpOf(bid).ids||[]).filter(x=>!used.has(x)&&!pool.includes(x))));return pool.slice(0,n);}
/* quiet balancing: a domain not chosen for a while weighs more */
const age=id=>{const v=(T.S().dom||{})[id];return v==null?15:Math.min(14,Math.max(0,dayNum()-v))+1;};
function wpick(arr,n){const a=arr.slice(),out=[];while(out.length<n&&a.length){let r=Math.random()*a.reduce((x,y)=>x+age(y.id),0),k=0;for(;k<a.length-1;k++){r-=age(a[k].id);if(r<=0)break;}out.push(a.splice(k,1)[0]);}return out;}
/* 3 steps in the chosen domain + 1 surprise from another one ("together" = 1 together step + 2 surprises) */
function choose(dm,first){const d=T.dailyEnsure(),S0=T.S();const bonus=(d.bs|0)>0;let st=dm==='tog'?[togStep(true)]:first?[first]:[];
  if(dm!=='tog')st=st.concat(stepsOf(dm,(bonus?2:3)-st.length,new Set([...d.t,...st])));
  wpick(doms().filter(x=>x.id!==gid(dm)),bonus?(dm==='tog'?1:0):(dm==='tog'?2:1)).forEach(o=>{st=st.concat(stepsOf(o.id,1,new Set([...d.t,...st])));});
  /* #424 at most one English a day: English the path picks by itself goes (the English scene comes instead, below); English Oren picked himself (the building, "continue") stays */
  const isEn=x=>!!(ACT[x]&&ACT[x].b&&ACT[x].b.id==='eng'),noEn=a=>dm==='b:eng'?a:a.filter(x=>!isEn(x)||x===first);st=noEn(st);
  if(!st.length)st=['math'];
  /* a domain that rested yesterday: the path starts with it, where Oren stopped (once a day) */
  if(!bonus&&!d.rv&&window.HEALTH){d.rv=1;const rv=window.HEALTH.review().find(x=>!d.t.includes(x)&&!st.includes(x));if(rv&&!isEn(rv))st=[rv].concat(st);}
  /* #358 variety: a mission that would repeat the kind is swapped for the engine's next pick in this domain, then in the others */
  st=T.vary(d.t,st,()=>{let ex=[];[dm,...wpick(doms().filter(x=>x.id!==gid(dm)),9).map(o=>o.id)].forEach(id=>{if(id!=='tog')ex=ex.concat(noEn(stepsOf(id,3,new Set([...d.t,...st,...ex]))).filter(x=>!ex.includes(x)));});return ex;});
  /* #424 one short English scene per path, once a day, while English is on for him */
  const sc=ACT['en-day'];st=noEn(st);
  if(!d.en&&!st.some(isEn)&&sc&&sc.inPath())st.push('en-day');if(st.some(isEn))d.en=1;
  if(!bonus){st=st.concat(d.cr||[]);d.cr=[];}st.forEach(x=>{d.t.push(x);d.done.push(0);});d.ch=dm;if(window.PDAY)window.PDAY.mark();
  if(dm!=='tog'){S0.dom=S0.dom||{};S0.dom[gid(dm)]=dayNum();}O.persist();sfx.ok(2);home();}
function lastStep(){const l=T.S().last;if(!l)return null;if(l.id==='math')return nextLevel()?'math':null;return T.dailyPool().includes(l.id)?l.id:null;}
/* "something else": a few big tiles (math, the doors, together time); a door drills down to its buildings */
function other(gr){O.setScreen('sTal','meadow',gr?()=>other():O.showMap);O.hud('');const say=gr?gr.n+'.':'מָה בָּא לְךָ? בְּחַר מָה שֶׁתִּרְצֶה.';const s=$('#sTal');s.innerHTML='';
  s.appendChild(h('div','whead',`<span class="gd">${gr?gr.e:'🔍'}</span><h1>${gr?gr.n:'מָה בָּא לְךָ?'}</h1>`));const g=h('div','dall');
  const add=(ic,n,c,fn)=>{const b=h('button','dcard',`<span class="dic">${ic}</span><b>${n}</b>`);b.style.setProperty('--dc',c);b.onclick=()=>{sfx.pop(3);fn();};g.appendChild(b);};
  const blds=x=>x.ids.map(bid=>T.BUILD.find(b=>b.id===bid)).filter(b=>b&&poolOf([b.id]).length);
  if(gr)blds(gr).forEach(b=>add(b.icon(),b.name,b.color,()=>choose('b:'+b.id)));
  else{if(nextLevel())add(`<span>${MATH.e}</span>`,MATH.n,MATH.c,()=>choose('math'));
    T.GROUPS.forEach(x=>{const bs=blds(x);if(bs.length)add(`<span>${x.e}</span>`,x.n,x.c,()=>bs.length>1?other(x):choose('b:'+bs[0].id));});
    add('<span>🤝</span>','מְשַׂחֲקִים עִם אַבָּא אוֹ אִמָּא','#e0794a',()=>choose('tog'));}
  s.appendChild(g);if(!gr)s.appendChild(doorsEl());O.sayNow=T.spk(say)+T.choiceSay(s,'.dcard b,.door b');O.emit('other',s);}
/* ---------- path steps ---------- */
function special(i,id){const [kind,k]=id.split(':');const isT=kind==='tog';const a=isT?TOG.find(x=>x.k===k):RW[k];
  const fin=()=>{const d=T.dailyEnsure();const j=i>=0&&d.t[i]===id?i:d.t.findIndex((x,n)=>x===id&&!d.done[n]);if(j>=0)d.done[j]=1;O.persist();};
  if(!a){fin();O.showMap();return;}
  const L=learned(),kid=isT?(typeof a.kid==='function'?a.kid(L):a.kid):a.t,par=isT?(typeof a.par==='function'?a.par(L):a.par):'';
  O.setScreen('sTal','meadow',O.showMap);T.hudT(isT?'🤝 זְמַן בְּיַחַד':'🏠 מְשִׂימָה בַּבַּיִת');const s=$('#sTal');s.innerHTML='';
  const box=h('div','tspec'+(isT?' tog':''),`<div class="tse bob">${a.e}</div><h1>${isT?a.n:'מְשִׂימָה בַּבַּיִת'}</h1><div class="lsent">${kid}</div>${isT?`<div class="tpar">להורה: ${par}</div>`:''}`);
  const row=h('div','btnrow');const b=h('button','bigbtn huge',`<span>${isT?'סִיַּמְנוּ':'סִיַּמְתִּי'} ✓</span>`);b.onclick=()=>{fin();O.celebrate();O.showMap();};row.appendChild(b);box.appendChild(row);s.appendChild(box);
  O.sayNow=T.spk(kid);setTimeout(()=>{if(box.isConnected)O.say(T.spk(kid));},D(400));}
function runStep(i){const d=T.dailyEnsure();const id=d.t[i];if(window.FRIEND)window.FRIEND.stepStart(i);if(/:/.test(id)){special(i,id);return;}
  if(id==='math'){const lv=(window.FRIEND&&window.FRIEND.ezRep&&window.FRIEND.ezRep())||nextLevel();/* #411 'hard' -> that level again */if(!lv){O.showJourney();return;}if(O.pathLevel)O.pathLevel(lv.id);
    if(!O.save.story[lv.w.id+'-in'])O.showWorld(lv.w);else O.startLevel(lv);return;}
  /* #388: the result card's "continue" goes on to the next path mission; leaving before it is done goes home */
  const a=ACT[id];if(!a)return;const nDone=()=>T.dailyEnsure().done.filter(Boolean).length,n0=nDone();
  const back=()=>{if(nDone()>n0)nextStep();else O.showMap();};back.home=1;T.pathOn();a.run(back);}
window.TAL_step=runStep;
/* #388: the next path mission, straight away. A break / meal / topic screen that is due comes first; home only at the end of
   the path, when today's time is up (the time-up screen follows), or when he taps something else on that screen. */
let scrN=0;O.on('screen',()=>{scrN++;});
function nextStep(){const d=T.dailyEnsure(),left=T.limLeft?T.limLeft():null;
  if(T.S().set.noDaily||d.done.every(Boolean)||(left&&left.min<=0)){O.showMap();return;}
  const go=()=>{const k=T.dailyEnsure().done.findIndex(x=>!x);if(k<0)O.showMap();else runStep(k);};
  const H=T.health;if(!H||!H.check){go();return;}H.check();if(!H.blocking()){go();return;}
  const s0=scrN;let calm=0;const iv=setInterval(()=>{if(scrN!==s0){clearInterval(iv);return;}if(H.blocking()){calm=0;return;}if(++calm>=3){clearInterval(iv);go();}},250);}
T.nextStep=nextStep;
/* the day's story is the Mixer chase of story.js (#386): the save keeps chapter + scene, not the date */
const quest=()=>T.quest?T.quest():{e:'⛵',k:'⛵',a:'',z:''};
/* #266 the fixed clips of home and "something else" (for pregen) */
T.addChoices([MATH.n,'מַסָּע','עִיר','מַמְלָכָה','אַרְקֵייד','מְשַׂחֲקִים עִם אַבָּא אוֹ אִמָּא','לְהַמְשִׁיךְ מֵאֵיפֹה שֶׁעָצַרְתִּי','מַשֶּׁהוּ אַחֵר','עוֹד פַּעַם','הַמְשֵׁךְ','סוֹף הַסִּפּוּר']);
T.addSay(['בֹּקֶר טוֹב','צָהֳרַיִם טוֹבִים','עֶרֶב טוֹב'].map(x=>x+', אוֹרֶן! בְּמָה נְשַׂחֵק?').concat(['שָׁלוֹם אוֹרֶן! מָה בָּא לְךָ הַיּוֹם?','כָּל הַכָּבוֹד! עַכְשָׁו זְמַן חוֹפְשִׁי 🎈','סִיַּמְתָּ אֶת הַשְּׁבִיל! בּוֹא נִרְאֶה אֵיךְ נִגְמַר הַסִּפּוּר.','מָה בָּא לְךָ? בְּחַר מָה שֶׁתִּרְצֶה.']));
const stepInfo=id=>{if(id==='math')return {n:'שָׁלָב בְּחֶשְׁבּוֹן',ic:SPR.tree,c:'#d99a2b'};const [k,v]=String(id).split(':');
  if(k==='tog'){const a=TOG.find(x=>x.k===v)||{n:''};return {n:'🤝 '+a.n,ic:'<span>🤝</span>',c:'#e0794a'};}
  if(k==='rw')return {n:'מְשִׂימָה בַּבַּיִת',ic:`<span>${(RW[v]||{}).e||'🏠'}</span>`,c:'#2a9d8f'};
  return ACT[id]?{n:ACT[id].name,ic:ACT[id].icon(),c:ACT[id].b.color}:{n:'',ic:'',c:'#999'};};
/* for the parent panel (no nikud) */
T.stepName=id=>{const P=T.plainHe;if(id==='math')return '🧮 שלב בחשבון';const [k,v]=String(id).split(':');
  if(k==='tog')return '🤝 יחד: '+P((TOG.find(x=>x.k===v)||{n:''}).n);if(k==='rw')return '🏠 משימה בבית: '+P((RW[v]||{t:''}).t);
  return ACT[id]?P(ACT[id].b.name)+' — '+P(ACT[id].name):id;};
/* end of the path: the day's story ends with a hint for tomorrow (no prize), then sometimes the friend suggests time together */
function finale(d,q){d.claimed=1;const SH=window.SHIP,pc=SH?SH.award():null;/* #391 the day's ship piece */O.persist();q=quest();/* #386: the day ends with a short hint about tomorrow */const ov=$('#ov');ov.hidden=false;ov.innerHTML=`<div class="card qwin"><div class="qbig">${q.e}</div><h2>${q.z}</h2>${SH?SH.cardHTML(pc):''}</div>`;
  const after=()=>{if(!d.sg&&!d.t.some(x=>/^tog:/.test(x))){d.sg=1;O.persist();suggestTog();}else home();};
  const r=h('div','btnrow');const ok=h('button','bigbtn',ICON.play+'<span>יֶשׁ!</span>');ok.onclick=()=>{ov.hidden=true;if(SH)SH.offer(after);else after();};
  r.appendChild(ok);ov.firstChild.appendChild(r);O.celebrate(ov.firstChild);O.say(T.spk(q.z)+(pc?'\u2063'+T.spk(SH.newSay(pc)):''));}
function suggestTog(){const pr=T.S().prof||{};const ov=$('#ov');ov.hidden=false;
  ov.innerHTML=`<div class="card"><div class="callp bob">${T.friend()}</div><h2>רוֹצֶה לְשַׂחֵק עִם אַבָּא אוֹ אִמָּא?</h2><div class="sub">לֵךְ לִשְׁאֹל אִם יֵשׁ לָהֶם זְמַן!</div></div>`;
  const r=h('div','btnrow');const no=h('button','bigbtn plain sm','<span>אַחַר כָּךְ</span>');no.onclick=()=>{ov.hidden=true;home();};
  const yes=h('button','bigbtn','🤝 <span>יֵשׁ לָהֶם זְמַן!</span>');yes.onclick=()=>{ov.hidden=true;addStep(togStep(true),true);home();};r.append(no,yes);ov.firstChild.appendChild(r);
  O.say('רוצה לשחק עם אבא או אמא? לך לשאול אם יש להם זמן!');sfx.star(0);}
T.suggestTog=suggestTog;
function home(){const S0=T.S();
  if(O.save.story.intro&&!S0.prof){T.profile(O.showMap);return;}
  O.setScreen('sHome','meadow',null);O.hud(`<div class="starcount">${SPR.star}<span>${O.totalStars()}</span></div>`);const s=$('#sHome');s.innerHTML='';
  const pr=S0.prof||{};const st=S0.set;const d=st.noDaily?null:T.dailyEnsure();const q=quest();const nx=d?d.done.findIndex(x=>!x):-1;const pickDay=d&&nx<0&&!d.ch;
  /* Oren, his friend, and one sentence */
  const dayDone=!!(d&&nx<0&&d.claimed&&d.ch&&window.FRIEND);
  /* #407 the start of the day (no step done yet): the friend remembers yesterday and tells what comes today ('' = no history) */
  const mem=d&&!d.done.some(Boolean)&&window.STORYMIX&&window.STORYMIX.dayStart?window.STORYMIX.dayStart():'';
  const say=!d?`${T.hello()}, אוֹרֶן! בְּמָה נְשַׂחֵק?`:dayDone?window.FRIEND.homeSay(d):mem?mem:pickDay?'שָׁלוֹם אוֹרֶן! מָה בָּא לְךָ הַיּוֹם?':nx>=0?`${q.e} ${q.a}`:d.claimed?'כָּל הַכָּבוֹד! עַכְשָׁו זְמַן חוֹפְשִׁי 🎈':'סִיַּמְתָּ אֶת הַשְּׁבִיל! בּוֹא נִרְאֶה אֵיךְ נִגְמַר הַסִּפּוּר.';
  const tl='';
  s.appendChild(h('div','hstage',`${say?`<div class="hbub2" style="--fc:${pr.col||'#4fae4f'}">${say}${tl}</div>`:''}<div class="hrow"><div class="hpair" role="button" aria-label="מָה אֶפְשָׁר לַעֲשׂוֹת כָּאן?"><span class="hav bob">${O.AV()}</span><span class="hpet2 bob" style="animation-delay:-.7s">${T.friend()}</span>${window.SHIP&&window.SHIP.held?window.SHIP.held():''}</div>${window.SHIP?window.SHIP.el():''}</div>`));
  s.querySelector('.hpair').onclick=()=>{sfx.pop(2);if(dayDone&&d.free)window.FRIEND.bonus();else if(window.TOPIC)window.TOPIC.open();else tour();};
  if(pickDay){/* "what do you feel like today?": 3 big cards (one is "continue" when there is a last activity) + something else */
    const all=doms(),ln=lastStep(),lg=ln&&domOf(ln);if(!d.o||all.some(x=>!d.o.includes(x.id))){d.o=wpick(all,all.length).map(x=>x.id);O.persist();}
    const list=d.o.map(id=>all.find(x=>x.id===id)).filter(x=>x&&x.id!==lg).slice(0,ln?2:3);
    const row=h('div','dchoice');const card=(ic,n,c,fn,cls)=>{const b=h('button','dcard'+(cls?' '+cls:''),`<span class="dic">${ic}</span><b>${n}</b>`);b.style.setProperty('--dc',c);b.onclick=()=>{sfx.pop(3);fn();};row.appendChild(b);};
    if(ln){const inf=stepInfo(ln);card(ACT[ln]?ACT[ln].b.icon():inf.ic,'לְהַמְשִׁיךְ מֵאֵיפֹה שֶׁעָצַרְתִּי',inf.c,()=>choose(lg,ln),'cont');}
    list.forEach(x=>card(`<span>${x.e}</span>`,x.n,x.c,()=>choose(x.id)));
    const more=h('button','dmore','🔍 <span>מַשֶּׁהוּ אַחֵר</span>');more.onclick=()=>{sfx.pop(2);other();};
    const wrap=h('div','dpick');wrap.append(row,more);s.appendChild(wrap);}
  /* the whole day is done: a done badge and two big choices (another small path / free time); free time = the doors */
  else if(dayDone){if(d.free)s.appendChild(doorsEl());else{s.appendChild(window.FRIEND.badgeEl());s.appendChild(window.FRIEND.doneEl());}}
  /* the path: circles only, and one big button */
  else if(d&&d.t.length){const card=h('div','today');const path=h('div','tpath');path.style.setProperty('--n',d.t.length-(d.bs|0)+1);
    d.t.forEach((id,i)=>{if(i<(d.bs|0))return;const inf=stepInfo(id);if(i>(d.bs|0))path.appendChild(h('i','tlink'+(d.done[i-1]?' on':'')));
      const b=h('div','tstep2'+(d.done[i]?' done':i===nx?' cur':'')+(/^tog:/.test(id)?' tog':''),`<span class="ti2">${d.done[i]?`<span class="qk">${q.k}</span>`:inf.ic}</span>`);b.style.setProperty('--sc',inf.c);b.title=T.plainHe(inf.n);b.setAttribute('role','img');b.setAttribute('aria-label',T.plainHe(inf.n));path.appendChild(b);});
    path.appendChild(h('i','tlink'+(nx<0?' on':'')));
    /* #392 the story door: the end of the path shows the ship piece that opens it; a tap, the friend says so */
    const dk=!d.claimed&&window.SHIP&&window.SHIP.door?window.SHIP.door():null;
    const gl=path.appendChild(h('span','tgoal'+(nx<0?' won':'')+(dk?' sdoor':''),dk?`<span>🚪</span><small>${dk.n}</small>`:`<span>${nx<0?'🏆':q.e}</span>`));
    if(dk){path.classList.add('hasdoor');gl.setAttribute('role','button');gl.onclick=()=>{sfx.pop(2);window.SHIP.talk(dk.say);};}
    card.appendChild(path);const row=h('div','btnrow');
    if(nx>=0){const go=h('button','bigbtn huge',ICON.play+'<span>הַמְשֵׁךְ</span>');go.onclick=()=>{sfx.pop(3);runStep(nx);};row.appendChild(go);}
    else if(!d.claimed){const c=h('button','bigbtn gold huge',`${q.e} <span>סוֹף הַסִּפּוּר</span>`);c.onclick=()=>finale(d,q);row.appendChild(c);}
    if(row.children.length)card.appendChild(row);s.appendChild(card);
    const more=h('button','dmore','🔍 <span>מַשֶּׁהוּ אַחֵר</span>');more.onclick=()=>{sfx.pop(2);other();};s.appendChild(h('div','dpick')).appendChild(more);}
  /* the round doors live inside "something else"; on home only when there is no daily path */
  if(!d)s.appendChild(doorsEl());
  if(window.AGAIN)window.AGAIN.button(s);
  O.sayNow=say?T.spk(say)+T.choiceSay(s,'.dcard b,.dmore span,.door b,.bigbtn span,.againbtn b'):'';
  const pb=h('button','parbtn','🔒');pb.title='כניסת הורים';pb.setAttribute('aria-label','כניסת הורים');pb.onclick=()=>window.TAL_parentGate();s.appendChild(pb);
}
function doorsEl(){const doors=h('div','doors2');
  const DOORS=[['journey','מַסָּע',SPR.mount||SPR.tree,'#d99a2b',()=>O.showJourney()],['city','עִיר',X.portal,'#6c4fc1',()=>T.openHub()],['king','מַמְלָכָה',SPR.tower,'#3a8fc4',()=>O.kingdom()]];
  if(window.TAL_arcade)DOORS.push(['arcade','אַרְקֵייד','<span style="font-size:46px;line-height:1">🕹️</span>','#ff3fa4',()=>window.TAL_arcade(O.showMap)]);
  DOORS.forEach(([k,n,ic,c,fn])=>{const b=h('button','door '+k,`<span class="dico">${ic}</span><b>${n}</b>`);b.style.setProperty('--dc',c);b.onclick=()=>{sfx.pop(2);fn();};doors.appendChild(b);});
  return doors;}
window.TAL_home=home;T.home=home;T.chooseDay=choose;T.otherDay=other;
/* the guide: points at the one thing to press, says it, then gets out of the way */
let coachEl=null;
function coach(target,text,key,times){if(!target||!target.isConnected||!$('#ov').hidden||!$('#dlg').hidden||document.querySelector('.tlock,.tour,.hlock'))return;const S0=T.S();S0.coach=S0.coach||{};const n=S0.coach[key]|0;if(n>=(times||1))return;S0.coach[key]=n+1;O.persist();
  uncoach();const pr=S0.prof||{};const el=h('div','coach',`<div class="cbub"><span class="cpet">${T.friend()}</span><span>${text}</span></div><div class="chand">👆</div>`);document.body.appendChild(el);coachEl=el;
  const place=()=>{if(!target.isConnected||!$('#ov').hidden||!$('#dlg').hidden||document.querySelector('.tlock')){uncoach();return;}const r=target.getBoundingClientRect();const hand=el.querySelector('.chand'),bub=el.querySelector('.cbub');
    hand.style.left=(r.left+r.width/2-22)+'px';hand.style.top=(r.bottom-8)+'px';const bw=Math.min(340,innerWidth-24);bub.style.width=bw+'px';
    let top=r.bottom+48;if(top+90>innerHeight){top=r.top-100;hand.classList.add('up');hand.style.top=(r.top-56)+'px';}else hand.classList.remove('up');
    bub.style.top=top+'px';bub.style.left=Math.max(12,Math.min(innerWidth-bw-12,r.left+r.width/2-bw/2))+'px';};
  place();el._iv=setInterval(place,400);const off=()=>{if(coachEl===el)uncoach();};setTimeout(()=>{if(el.isConnected)document.addEventListener('pointerdown',off,{once:true,capture:true});},50);el._to=setTimeout(off,D(14000));
  setTimeout(()=>O.say(T.spk(text)),D(400));}
function uncoach(){if(coachEl){clearInterval(coachEl._iv);clearTimeout(coachEl._to);coachEl.remove();coachEl=null;}}
T.coach=coach;O.on('screen',()=>uncoach());
/* the first-time tour of home: the friend explains one thing at a time; tap anywhere to continue. Tapping the friend plays it again. */
function tour(){if(document.querySelector('.tour')||$('#sHome').hidden||!$('#ov').hidden)return;uncoach();const S0=T.S();S0.coach=S0.coach||{};S0.coach.tour=1;O.persist();
  const q=sel=>$('#sHome '+sel);const pr=S0.prof||{};
  const steps=[['.hpair','שָׁלוֹם! אֲנִי הֶחָבֵר שֶׁלְּךָ. לְחַץ בְּכָל מָקוֹם כְּדֵי לְהַמְשִׁיךְ.'],
    q('.today')?['.today .bigbtn','זֶה הַשְּׁבִיל שֶׁל הַיּוֹם. לוֹחֲצִים עַל הַכַּפְתּוֹר הַגָּדוֹל, וְהוֹלְכִים צַעַד אַחַר צַעַד.']
      :q('.dchoice')?['.dchoice','כָּל יוֹם אַתָּה בּוֹחֵר מָה בָּא לְךָ. לוֹחֲצִים עַל כַּרְטִיס, וּמַתְחִילִים!']:['.doors2','לוֹחֲצִים עַל דֶּלֶת, וּמַתְחִילִים!'],
    ['.dmore','רוֹצֶה מַשֶּׁהוּ אַחֵר? כָּאן יֵשׁ אֶת הַכֹּל. וְאִם תִּשְׁכַּח — לְחַץ עָלַי!']].filter(([sel])=>q(sel));
  const el=h('div','tour',`<div class="tspot"></div><div class="tbub"><span class="cpet">${T.friend()}</span><span class="tt"></span></div>`);document.body.appendChild(el);
  let i=-1;const spot=el.querySelector('.tspot'),bub=el.querySelector('.tbub');
  const end=()=>{if(!el.isConnected)return;el.remove();O.hush&&O.hush();};
  const next=()=>{i++;if(i>=steps.length||$('#sHome').hidden)return end();const [sel,text]=steps[i];const t=q(sel);if(!t)return next();
    t.scrollIntoView({block:'nearest'});const r=t.getBoundingClientRect(),p=8;Object.assign(spot.style,{left:(r.left-p)+'px',top:(r.top-p)+'px',width:(r.width+2*p)+'px',height:(r.height+2*p)+'px'});
    bub.querySelector('.tt').innerHTML=text;const bw=Math.min(380,innerWidth-24);bub.style.width=bw+'px';bub.style.left=Math.max(12,Math.min(innerWidth-bw-12,r.left+r.width/2-bw/2))+'px';
    const below=r.bottom+p+14;bub.style.top='';bub.style.bottom='';if(below+130<innerHeight)bub.style.top=below+'px';else bub.style.bottom=(innerHeight-r.top+p+14)+'px';
    bub.classList.remove('pop');void bub.offsetWidth;bub.classList.add('pop');O.say(T.spk(text));};
  el.onclick=e=>{e.stopPropagation();sfx.pop(1);next();};el._end=end;next();}
T.tour=tour;O.on('screen',()=>{const t=document.querySelector('.tour');if(t)t._end();});
/* where the guide points the first times; each place has a short first-visit intro */
const later=(f)=>setTimeout(f,D(700));
const intro=(key,target,text,after)=>{if(!((T.S().coach||{})[key]|0))coach(target,text,key,1);else if(after)after();};T.intro=intro;
O.on('screen',id=>{if(id==='sHome')later(()=>{if($('#sHome').hidden||!$('#ov').hidden)return;if(!(T.S().coach||{}).tour){tour();return;}
  const d=T.S().daily;const b=$('#sHome .bigbtn.huge');if(b)coach(b,d&&d.done.some(x=>!x)?'הַכַּפְתּוֹר הַגָּדוֹל מַמְשִׁיךְ בַּשְּׁבִיל!':'כָּאן רוֹאִים אֵיךְ נִגְמַר הַסִּפּוּר!','home',1);});});
O.on('hub',s=>later(()=>{const b=s.querySelector('.gdoor');if(b)intro('i-city',b,'זֹאת עִיר הַכִּשְׁרוֹנוֹת! כָּאן קוֹרְאִים, חוֹקְרִים, יוֹצְרִים וְנִרְגָּעִים. בְּחַר דֶּלֶת!',()=>coach(b,'בְּחַר דֶּלֶת — וּבוֹא נְשַׂחֵק!','hub',2));}));
O.on('group',s=>later(()=>{const b=s.querySelector('.bld:not(.lockb)');if(b)coach(b,'לְחַץ עַל בִּנְיָן כְּדֵי לְהִכָּנֵס','group',2);}));
O.on('map',m=>later(()=>{const b=m.querySelector('.jnext')||m.querySelector('.worlds .wcard2:not(.locked):not([hidden])');if(b&&!$('#sMap').hidden)intro('i-map',b,'זֶה הַמַּסָּע! בְּכָל עוֹלָם יֵשׁ חֶשְׁבּוֹן וְחָבֵר שֶׁצָּרִיךְ עֶזְרָה. אוֹסְפִים כּוֹכָבִים וּמַצִּילִים אוֹתוֹ!',()=>coach(b,'לְחַץ עַל עוֹלָם כְּדֵי לְהַתְחִיל אֶת הַמַּסָּע','map',2));}));
O.on('kingdomScene',sc=>later(()=>{const b=sc.querySelector('.bwgrid');if(b&&!$('#sKing').hidden&&$('#ov').hidden)intro('i-king',b,'זֹאת הַמַּמְלָכָה שֶׁלְּךָ! בַּיַּהֲלוֹמִים בּוֹנִים, וְהַכּוֹכָבִים פּוֹתְחִים קֻבִּיּוֹת חֲדָשׁוֹת.');}));
O.on('synced',()=>{if(!$('#sHome').hidden&&$('#ov').hidden&&!document.querySelector('.tour'))home();});
/* a home button that is always in the same place */
(()=>{const bb=$('#btnBack');if(!bb)return;const hb=h('button','ibtn','');hb.id='btnHome';hb.innerHTML=ICON.home;hb.setAttribute('aria-label','בית');hb.title='הַבַּיִת';hb.hidden=true;hb.onclick=()=>{O.hush&&O.hush();sfx.pop(1);O.showMap();};bb.after(hb);
  O.on('screen',(id,back)=>{hb.hidden=id==='sStart'||id==='sHome'||back===O.showMap;});})();
})();
