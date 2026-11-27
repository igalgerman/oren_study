/* ===== THE FRIEND ON ACTIVITY SCREENS + THE DAY'S PATH STRIP (injected into index.html by build) =====
   One small friend in the corner of activity screens, with a speech bubble:
     FRIEND.onCorrect(ctx)  the 'right' event: its fixed sound + a line that names what he did (per kind of task), a little hop
     FRIEND.onWrong(ctx)    the 'wrong' event: its fixed sound, a sad tilt, and it hands over to the help button (#54)
     FRIEND.question(q,card,o) a picture that stands for a word: the word is said (q.word), tapping the picture says it again;
                            o = {id, i}: the activity id and the question's index (i 0 = the mission starts)
   #53 the friend coaches: his own voice (VOICE), at most 5 recurring EVENTS with a fixed sound + fixed line each,
     one sentence on what to do the first time in a new kind of task (KINDS), and lines of his own (mission start,
     a nudge to the help button after IDLE ms without a tap) at most one per GAP ms and never over the narrator.
     FRIEND.mount()/unmount() show / hide the friend (screens change → hidden; activities mount it)
   While Oren is inside a step of the day's path:
     FRIEND.stepStart(i)    the friend ties the step to the day's story (said before the screen's instruction)
     FRIEND.stepCheck()     after a step is done: one story line on the result card
     PATHBAR.render()       a thin strip in the top bar: today's quest + one dot per step
   FRIEND.voiceList() = the lines said in the friend's voice (FRIEND.VOICE), FRIEND.speakList() = every line (voice pregen). */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$}=O;const D=O.D||(x=>x);

/* ---------- lines (kid text, full nikud) ---------- */
/* #53 the friend's own voice (the owner's pick; the narrator stays Kore 0.9) */
const VOICE='he-IL-Chirp3-HD-Puck';
/* #53 the recurring events: always the same sound and the same short line, so Oren knows them at once (max 5) */
const snd=f=>()=>{try{if((O.save.snd|0)<1||!O.audio||!O.audio())return;f(O.A.ctx.currentTime);}catch(e){}};
const EVENTS={
  right:{line:'יֵשׁ! נָכוֹן!',sfx:snd(t=>{O.tone(O.NT(79),t,.09,{type:'sine',vol:.12});O.tone(O.NT(86),t+.09,.18,{type:'sine',vol:.12});})},
  wrong:{line:'אֲנִי כָּאן. גַּע בְּעֶזְרָה.',sfx:snd(t=>{O.tone(O.NT(67),t,.12,{type:'sine',vol:.1});O.tone(O.NT(64),t+.13,.2,{type:'sine',vol:.09});})},
  newtype:{line:'מַשֶּׁהוּ חָדָשׁ!',sfx:snd(t=>{[72,76,79].forEach((n,k)=>O.tone(O.NT(n),t+k*.08,.1,{type:'triangle',vol:.08}));})},
  done:{line:'סִיַּמְתָּ אֶת הַמְּשִׂימָה!',sfx:snd(t=>{[79,84,88,91].forEach((n,k)=>O.tone(O.NT(n),t+k*.07,.14,{type:'sine',vol:.09}));})},
  streak:{line:'שָׁלֹשׁ בְּרֶצֶף!',sfx:snd(t=>{[84,88,91,96].forEach((n,k)=>O.tone(O.NT(n),t+k*.06,.1,{type:'square',vol:.04,lp:3000}));})}};
/* #53 kinds of task: what to do (said once, the first time) and the specific praise for a right answer */
const KINDS=[
  {k:'first',re:/^(read-first|rb2-first-)/,intro:'מְחַפְּשִׂים אֶת הָאוֹת שֶׁבַּהַתְחָלָה.',ok:'מָצָאתָ אֶת הָאוֹת הָרִאשׁוֹנָה!'},
  {k:'pw',re:/^(read-pw|rb2-pw-)/,intro:'מִסְתַּכְּלִים בַּתְּמוּנָה וּבוֹחֲרִים אֶת הַמִּלָּה.',ok:'קָרָאתָ אֶת הַמִּלָּה הַנְּכוֹנָה!'},
  {k:'wp',re:/^(read-wp|rb2-wp-)/,intro:'קוֹרְאִים אֶת הַמִּלָּה וּבוֹחֲרִים תְּמוּנָה.',ok:'מָצָאתָ אֶת הַתְּמוּנָה הַנְּכוֹנָה!'},
  {k:'sent',re:/^(read-sent|rb2-sent-)/,intro:'קוֹרְאִים אֶת הַמִּשְׁפָּט וּבוֹחֲרִים תְּשׁוּבָה.',ok:'הֵבַנְתָּ אֶת הַמִּשְׁפָּט!'},
  {k:'snd',re:/^snd-/,intro:'מַקְשִׁיבִים לַצְּלִיל שֶׁבַּהַתְחָלָה.',ok:'שָׁמַעְתָּ אֶת הַצְּלִיל הָרִאשׁוֹן!'},
  {k:'rhyme',re:/^read-rhyme/,intro:'מְחַפְּשִׂים מִלָּה שֶׁנִּשְׁמַעַת דּוֹמֶה בַּסּוֹף.',ok:'מָצָאתָ אֶת הַחָרוּז!'},
  {k:'nik',re:/^nik-/,intro:'מִסְתַּכְּלִים טוֹב עַל הַנִּקּוּד.',ok:'קָרָאתָ אֶת הַנִּקּוּד נָכוֹן!'},
  {k:'eng',re:/^eng-/,intro:'מַקְשִׁיבִים וּבוֹחֲרִים בְּאַנְגְּלִית.',ok:'יָדַעְתָּ אֶת זֶה בְּאַנְגְּלִית!'},
  {k:'notes',re:/^mus-notes/,intro:'בּוֹחֲרִים אֶת הַשֵּׁם שֶׁל הַתָּו.',ok:'זִהִיתָ אֶת הַתָּו!'},
  {k:'dur',re:/^mus-dur/,intro:'בּוֹדְקִים כַּמָּה זְמַן הַתָּו נִמְשָׁךְ.',ok:'זִהִיתָ אֶת אֹרֶךְ הַתָּו!'},
  {k:'ear',re:/^mus-ear/,intro:'מַקְשִׁיבִים לַצְּלִילִים וּבוֹחֲרִים.',ok:'שָׁמַעְתָּ נָכוֹן!'},
  {k:'pat',re:/^think-pat/,intro:'מְגַלִּים מָה חוֹזֵר, וּבוֹחֲרִים מָה בָּא אַחַר כָּךְ.',ok:'גִּלִּיתָ מָה חוֹזֵר!'},
  {k:'flag',re:/^world-flag/,intro:'מוֹצְאִים אֶת הַדֶּגֶל הַנָּכוֹן.',ok:'מָצָאתָ אֶת הַדֶּגֶל!'},
  {k:'know',re:/^(sci-|world-|art-)/,intro:'שׁוֹמְעִים אֶת הַשְּׁאֵלָה וּבוֹחֲרִים תְּשׁוּבָה.',ok:'יָדַעְתָּ אֶת הַתְּשׁוּבָה!'},
  {k:'math',re:/^math$/,intro:'פּוֹתְרִים אֶת הַתַּרְגִּיל.',ok:'פָּתַרְתָּ אֶת הַתַּרְגִּיל!'}];
const kindOf=id=>KINDS.find(x=>x.re.test(String(id||'')))||null;
const START='יוֹצְאִים לַדֶּרֶךְ!';                     /* a mission starts (a kind he already knows) */
const SHOWN='זֶה בְּסֵדֶר! עַכְשָׁו אַתָּה יוֹדֵעַ.';        /* the answer is shown now (bubble only: the help box says the answer) */
const GAP=30000,IDLE=20000;                              /* own lines: at most one per GAP; the help nudge after IDLE without a tap */
/* the day's story: what each step brings (by the quest's emoji, see QUESTS in talents.js) */
const STORY={'🦸':['בּוֹא נַחְזִיר עוֹד גָּבִישׁ לָעִיר!','עוֹד גָּבִישׁ חָזַר לָעִיר!'],'🧱':['בּוֹא נוֹסִיף עוֹד חֵלֶק לַגֶּשֶׁר!','הַגֶּשֶׁר גָּדַל בְּעוֹד חֵלֶק!'],
 '⚽':['בּוֹא נַבְקִיעַ עוֹד גּוֹל!','גּוֹל! הַקְּבוּצָה שֶׁלְּךָ מוֹבִילָה!'],'🌊':['בּוֹא נִתְקָרֵב עוֹד קְצָת אֶל הַדָּג!','הִתְקָרַבְנוּ אֶל הַדָּג הַקָּטָן!'],
 '🎵':['בּוֹא נַחְזִיר עוֹד תָּו לַשִּׁיר!','עוֹד תָּו חָזַר לַשִּׁיר!'],'🏀':['בּוֹא נִקְלַע עוֹד סַל!','סַל! עוֹד שְׁתֵּי נְקֻדּוֹת!'],
 '🗝️':['בּוֹא נִפְתַּח עוֹד מַנְעוּל!','עוֹד מַנְעוּל נִפְתַּח!'],'🚀':['בּוֹא נָבִיא עוֹד כּוֹכָב לַחֲלָלִית!','הַחֲלָלִית קִבְּלָה עוֹד כּוֹכָב!']};
const STORY0=['בּוֹא נִתְקַדֵּם בַּסִּפּוּר!','הִתְקַדַּמְנוּ בַּסִּפּוּר!'];
const FIRST='מַתְחִילִים אֶת הַמַּסָּע שֶׁל הַיּוֹם!',LAST='עוֹד צַעַד אֶחָד וְנַגִּיעַ לַסּוֹף!',ALL='סִיַּמְנוּ אֶת כָּל הַשְּׁבִיל!';

/* ---------- the friend in the corner ---------- */
const sprite=()=>T.friend?T.friend():O.PET().s();
let el=null,bub=null,bubT=0,streak=0,last='',kind=null,ownAt=-1e9;
const FR={get last(){return last;},log:[],VOICE,EVENTS,KINDS,GAP,IDLE,said:[]};
function ensure(){if(el&&el.isConnected)return el;el=h('div','frc','<div class="frb" hidden></div><span class="frs"></span>');el.setAttribute('aria-hidden','true');
  document.body.appendChild(el);bub=el.querySelector('.frb');return el;}
const petOnScreen=()=>{const p=$('#sPlay #pet');return !!(p&&!$('#sPlay').hidden&&p.offsetParent);};
FR.mount=()=>{if(petOnScreen())return FR.unmount();ensure();const s=el.querySelector('.frs');const sp=sprite();if(s._sp!==sp){s.innerHTML=sp;s._sp=sp;}
  el.hidden=false;document.body.classList.add('fron');idleArm();};
FR.unmount=()=>{clearTimeout(idleT);if(el){el.hidden=true;el.classList.remove('joy','sad');if(bub)bub.hidden=true;}document.body.classList.remove('fron');};
FR.shown=()=>!!(el&&!el.hidden&&el.isConnected);
function anim(c){if(!el)return;el.classList.remove('joy','sad');void el.offsetWidth;el.classList.add(c);}
/* show a line in the bubble (and on the math screen's own bubble when the friend there talks) */
function bubble(t,ms){if(petOnScreen()){const b=$('#bText');if(b)b.innerHTML=t;return;}if(!FR.shown())return;
  bub.innerHTML=t;bub.hidden=false;bub.classList.remove('pop');void bub.offsetWidth;bub.classList.add('pop');clearTimeout(bubT);bubT=setTimeout(()=>{if(bub)bub.hidden=true;},D(ms||2200));}
const onAct=()=>['sTal','sPlay'].some(id=>{const e=$('#'+id);return e&&!e.hidden;});
function talk(t,o){o=o||{};last=t;FR.log.push(t);if(FR.log.length>50)FR.log.shift();if(!FR.shown()&&onAct())FR.mount();if(!o.nobub)bubble(t,o.ms);if(!o.quiet)voice(t);return t;}
/* every friend line in the friend's own voice (FR.said: what was spoken, for the tests) */
function voice(t){FR.said.push(t);if(FR.said.length>50)FR.said.shift();O.say(T.spk(t),'he',0,VOICE);}
/* the narrator (or any voice) is speaking now */
const busy=()=>{try{const g=window.__gv;if(g&&g.audio&&!g.audio.paused&&!g.audio.ended)return true;}catch(e){}try{return !!(window.speechSynthesis&&speechSynthesis.speaking);}catch(e){return false;}};
/* an event: its fixed sound, then its line (or the given line) */
function event(k,t,o){const e=EVENTS[k];e.sfx();FR.lastEvent=k;return talk(t||e.line,o);}
/* a line of the friend's own (not an answer to a tap): at most one per GAP, never over the narrator */
function own(k,t,o){o=o||{};const now=Date.now();if(!o.force&&(now-ownAt<GAP||busy()))return '';ownAt=now;return k?event(k,t,o):talk(t,o);}

/* ---------- reactions ---------- */
/* ctx: {tries} = wrong tries on this question first; {quiet} = bubble only (something else is about to speak);
   {nobub} = no bubble (the screen shows the line itself); {final} (wrong) = the answer is shown now. Returns the line. */
FR.onCorrect=ctx=>{ctx=ctx||{};if(!FR.shown()&&onAct())FR.mount();streak=(ctx.tries|0)>0?0:streak+1;anim('joy');idleArm();
  if(streak===3)return event('streak',null,ctx);return event('right',kind&&kind.ok,ctx);};
/* wrong: the friend hands over to the help button (it pulses); when the answer is shown now, a calm bubble only */
FR.onWrong=ctx=>{ctx=ctx||{};if(!FR.shown()&&onAct())FR.mount();streak=0;anim('sad');idleArm();
  if(ctx.final)return event('wrong',SHOWN,Object.assign({},ctx,{quiet:1}));
  pointHelp();return event('wrong',null,ctx);};
const helpBtn=()=>{const w=[...document.querySelectorAll('#screens .helpq')].find(x=>x.offsetParent&&!x.classList.contains('done'));return w?w.querySelector('.helpbtn'):null;};
function pointHelp(){const hb=helpBtn();if(!hb)return false;hb.classList.remove('frhand');void hb.offsetWidth;hb.classList.add('frhand');return true;}
FR.reset=()=>{streak=0;};
/* a story opens: try to read alone first (#355). Bubble only: the screen's own instruction (sayNow) says it */
const READFIRST='קוֹדֶם נְנַסֶּה לִקְרֹא לְבַד!';FR.READFIRST=READFIRST;FR.readFirst=()=>talk(READFIRST,{quiet:1,ms:4000});

/* ---------- a picture that stands for a word: say the word ---------- */
let lead='';                                   /* a story line waiting to be said before the next instruction */
FR.question=(q,card,o)=>{FR.mount();if(o&&o.id!=null){kind=kindOf(o.id);if(!(o.i|0))missionStart(card,q);}const w=q&&q.word?T.spk(q.word):'';FR.word=w;const pre=[takeLead(),w].filter(Boolean).join(' ');
  if(w&&card){const p=card.querySelector('.pic');if(p&&!p._fw){p._fw=1;p.classList.add('frpic');p.onclick=()=>{O.sfx.pop&&O.sfx.pop(1);O.say(w);};}}
  if(!pre)return;
  if(window.__noAuto)setTimeout(()=>{if(!card||card.isConnected)O.say(pre);},D(300));   /* reading practice: only the word (the question waits for him) */
  else O.sayNow=pre+' '+(O.sayNow||'');};
function takeLead(){const t=lead;lead='';if(t)bubble(t,3500);return t;}
/* other screens of a step: put the story line before whatever the screen says */
function leadOnScreen(){if(!lead)return;if(window.__noAuto){O.say(takeLead());return;}const t=takeLead();O.sayNow=t+' '+(O.sayNow||'');}

/* ---------- #53 a mission starts: the first time in a kind of task one sentence on what to do (once), else one short line ---------- */
const seen=()=>{const s=O.save;if(!s.frk||typeof s.frk!=='object')s.frk={};return s.frk;};
function missionStart(card,q){const k=kind;let line='',ev=null;
  if(k&&!seen()[k.k]){seen()[k.k]=1;O.persist();line=k.intro;ev='newtype';}
  else if(Date.now()-ownAt>=GAP)line=START;
  if(!line)return;
  /* the friend speaks first, then the question is read (never both at once): a question that plays itself (q.auto) plays after him */
  const auto=q&&q.auto&&q.play?q.play:null;if(auto)q.auto=0;
  const live=()=>!card||card.isConnected;
  setTimeout(()=>{if(!live())return;const was=O.sayNow;
    const t=ev?own(ev,line,{force:1,ms:4000}):own(null,line,{ms:3000});if(!t){if(auto)auto();return;}
    const st=window.__autoSaid|0;let n=0;
    const iv=setInterval(()=>{if(++n>40||!live()||O.sayNow!==was||(window.__autoSaid|0)!==st){clearInterval(iv);return;}   /* gone, or something else spoke */
      if(n<3||busy())return;clearInterval(iv);if(auto)auto();else if(was)O.say(was);},D(200));},D(150));}
/* ---------- #53 no tap for IDLE ms on a question with a help button: the friend points at it ---------- */
const NUDGE='צָרִיךְ עֶזְרָה? גַּע בְּעֶזְרָה.';
let idleT=0;
function idleArm(){clearTimeout(idleT);if(!FR.shown())return;idleT=setTimeout(()=>{if(!FR.shown()||!onAct())return;
  if(helpBtn()&&$('#ov').hidden&&own(null,NUDGE,{ms:3500}))pointHelp();idleArm();},D(IDLE));}
['pointerdown','keydown'].forEach(e=>addEventListener(e,()=>{if(FR.shown())idleArm();},true));
FR.NUDGE=NUDGE;FR.START=START;FR.SHOWN=SHOWN;FR.kind=()=>kind&&kind.k;FR._ownReset=()=>{ownAt=-1e9;};

/* ---------- the day's path ---------- */
let cur=null;                                  /* {i, d: the day, done: announced} while inside a path step */
const daily=()=>{try{return T.S().set.noDaily?null:T.dailyEnsure();}catch(e){return null;}};
const quest=()=>(T.quest&&T.quest())||{e:'⭐',k:'⭐'};
const story=()=>STORY[quest().e]||STORY0;
FR.stepStart=i=>{const d=daily();if(!d||i==null||i<0||i>=d.t.length){cur=null;return;}cur={i,d:d.d,id:d.t[i]};
  const dn=d.done.slice(d.bs|0),left=dn.filter(x=>!x).length,first=!dn.some(Boolean);
  lead=(first?FIRST+' ':left<=1?LAST+' ':'')+story()[0];PATHBAR.render();};
FR.stepCheck=()=>{if(!cur)return;const d=daily();if(!d||d.d!==cur.d||d.t[cur.i]!==cur.id||!d.done[cur.i]||cur.done)return;cur.done=1;PATHBAR.render();
  const t=d.done.slice(d.bs|0).every(Boolean)?story()[1]+' '+ALL:story()[1];
  const card=$('#ov:not([hidden]) .card');if(card&&!card.querySelector('.frstory')){const s=h('div','frstory',`<span class="frq">${quest().k}</span><span>${t}</span>`);
    const row=card.querySelector('.btnrow');if(row)card.insertBefore(s,row);else card.appendChild(s);setTimeout(()=>{if(s.isConnected){last=t;voice(t);}},D(1200));}
  else talk(t,{ms:3500});};
/* the whole day is done (after the story's finale): one clear sentence and exactly two big choices on home */
const DONE='סִיַּמְתָּ אֶת כָּל הַמְּשִׂימוֹת שֶׁל הַיּוֹם! 🎉',FREE='זְמַן חוֹפְשִׁי! בְּחַר מָה שֶׁבָּא לְךָ.',MORE='רוֹצֶה עוֹד מַסְלוּל? גַּע בִּי.';
const BONUS='עוֹד מַסְלוּל קָטָן',FREEB='זְמַן חוֹפְשִׁי',BADGE='הַיּוֹם הֻשְׁלַם';
FR.bonus=()=>{const d=daily();if(!d)return;d.bs=d.t.length;d.ch=null;d.free=0;O.persist();T.home();};
FR.free=()=>{const d=daily();if(!d)return;d.free=1;O.persist();T.home();};
/* what the friend says on home when the day is done; in free time the friend reminds once (on a later visit) that tapping it brings another path */
FR.homeSay=d=>{if(!d.free){if(d.dsaid)return '';d.dsaid=1;O.persist();return DONE;}d.fv=(d.fv|0)+1;if(d.fv>=2&&!d.rem){d.rem=1;O.persist();return FREE+' '+MORE;}O.persist();return FREE;};
FR.doneEl=()=>{const row=h('div','btnrow frdone');const a=h('button','bigbtn huge','➕ <span>'+BONUS+'</span>');a.onclick=()=>{O.sfx.pop(3);FR.bonus();};
  const b=h('button','bigbtn huge blue','🎈 <span>'+FREEB+'</span>');b.onclick=()=>{O.sfx.pop(3);FR.free();};row.append(a,b);return row;};
FR.badgeEl=()=>h('div','frbadge','✓ '+BADGE);
FR.inStep=()=>!!cur;FR.lead=t=>{lead=t;};

const PATHBAR={render(){let b=$('#frPath');const d=cur&&daily();
  document.body.classList.toggle('frpon',!!(d&&d.d===cur.d));if(!d||d.d!==cur.d){if(b)b.remove();return;}
  const mid=$('#hudMid');if(!mid)return;if(!b){b=h('div','frpath');b.id='frPath';b.setAttribute('role','img');}if(b.parentNode!==mid)mid.appendChild(b);
  const q=quest();const o=d.bs|0,t=d.t.slice(o),dn=d.done.slice(o),n=t.length,k=dn.filter(Boolean).length;
  b.setAttribute('aria-label',`${k}/${n}`);
  b.innerHTML=`<span class="fpq">${q.e}</span>`+t.map((_,j)=>`<i class="${dn[j]?'on':j+o===cur.i?'cur':''}"></i>`).join('')+`<span class="fpg${k>=n?' won':''}">🎁</span>`;}};

/* the top bar is rewritten by every screen: keep the strip in it while inside a step */
(()=>{const mid=$('#hudMid');if(mid)new MutationObserver(()=>{const b=$('#frPath');if(cur&&(!b||b.parentNode!==mid))PATHBAR.render();}).observe(mid,{childList:true});})();
/* screens: the friend is on the math play screen and on any screen of a path step; quizzes and activities mount it themselves */
const ACTS=['sTal','sPlay','sLearn'];
O.on('screen',id=>{FR.reset();
  if(cur&&!ACTS.includes(id)&&id!=='sWorld'){cur=null;lead='';}
  PATHBAR.render();
  if(id==='sPlay')kind=kindOf('math');
  if(id==='sPlay'||(cur&&id==='sTal'))setTimeout(()=>{if(!$('#'+id).hidden){FR.mount();if(id==='sPlay'||id==='sTal')leadOnScreen();if(id==='sPlay'&&FR.shown())missionStart($('#sPlay .left')||$('#sPlay'));}},0);
  else FR.unmount();});
O.on('levelDone',()=>setTimeout(FR.stepCheck,D(600)));
/* #53 a mission is finished: the 'done' sound; its line when no story line of the day's path comes */
const finished=()=>{if(!FR.shown())return;if(cur)EVENTS.done.sfx();else event('done',null,{ms:3000});};
O.on('levelDone',lv=>{if(lv&&lv.type!=='train')setTimeout(finished,D(300));});O.on('tlDone',()=>setTimeout(finished,D(300)));

/* #433: an error in the middle of a mission sent Oren home (core error handler): the friend says it on the home screen */
const OOPS='אוֹי, חוֹזְרִים לַמַּסָּע';
FR.oops=()=>{FR.mount();anim('sad');return talk(OOPS,{ms:3000});};
/* what the friend says in his own voice (talk/voice), and what goes into the narrator's sentences (the story leads) */
FR.voiceList=()=>[...new Set([OOPS,READFIRST,DONE,FREE,FREE+' '+MORE,START,SHOWN,NUDGE,...Object.values(EVENTS).map(e=>e.line),...KINDS.flatMap(k=>[k.intro,k.ok]),
  FIRST,LAST,ALL,...[...Object.values(STORY),STORY0].flatMap(([a,b])=>[a,b,b+' '+ALL])])];
FR.speakList=()=>[...new Set([...FR.voiceList(),...[...Object.values(STORY),STORY0].flatMap(([a])=>[a,FIRST+' '+a,LAST+' '+a])])];
FR._cur=()=>cur;
window.FRIEND=FR;window.PATHBAR=PATHBAR;
})();
