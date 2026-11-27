/* ===== THE FRIEND ON ACTIVITY SCREENS + THE DAY'S PATH STRIP (injected into index.html by build) =====
   One small friend in the corner of activity screens, with a speech bubble:
     FRIEND.onCorrect(ctx)  a short warm line (varied; streaks; effort after a fixed mistake), a little hop
     FRIEND.onWrong(ctx)    a gentle line, a sad tilt; ctx.final = the answer is shown now
     FRIEND.question(q,card) a picture that stands for a word: the word is said (q.word), tapping the picture says it again
     FRIEND.mount()/unmount() show / hide the friend (screens change → hidden; activities mount it)
   While Oren is inside a step of the day's path:
     FRIEND.stepStart(i)    the friend ties the step to the day's story (said before the screen's instruction)
     FRIEND.stepCheck()     after a step is done: one story line on the result card
     PATHBAR.render()       a thin strip in the top bar: today's quest + one dot per step
   FRIEND.speakList() lists every line the friend may say (for the voice pregen). */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$}=O;const D=O.D||(x=>x);

/* ---------- lines (kid text, full nikud) ---------- */
const OK=['יוֹפִי!','נָכוֹן מְאוֹד!','וָאוּ, אַתָּה אַלּוּף!','כָּל הַכָּבוֹד!','מְצֻיָּן!','בְּדִיּוּק!','יֵשׁ! צָדַקְתָּ!','נָכוֹן!','הִצְלַחְתָּ!',
 'עֲבוֹדָה טוֹבָה!','אַתָּה מִתְקַדֵּם יָפֶה!','חָשַׁבְתָּ טוֹב!','הִסְתַּכַּלְתָּ טוֹב!','מַמָּשׁ טוֹב!','כָּכָה עוֹשִׂים!','סוּפֶּר!','תּוֹתָח!',
 'אֲנִי גֵּאֶה בְּךָ!','בִּדַּקְתָּ וְצָדַקְתָּ!','מְעֻלֶּה!','בְּרָבוֹ!','יָפֶה מְאוֹד!','עוֹד אֶחָד נָכוֹן!','קָלַעְתָּ!','נֶהְדָּר!','אַתָּה עוֹבֵד יָפֶה!','עָשִׂיתָ אֶת זֶה!'];
const STREAK={3:'שָׁלֹשׁ בְּרֶצֶף!',5:'חָמֵשׁ בְּרֶצֶף! אַתָּה בִּתְנוּפָה!',8:'שְׁמוֹנֶה בְּרֶצֶף! אֵין עָלֶיךָ!'};
const STREAK_MORE='עוֹד רֶצֶף אָרֹךְ! כָּל הַכָּבוֹד!';                 /* 10, 15, 20... */
const EFFORT=['רָאִיתָ? נִסִּיתָ שׁוּב וְהִצְלַחְתָּ!','לֹא וִתַּרְתָּ, וְהִצְלַחְתָּ!','חָשַׁבְתָּ שׁוּב וּמָצָאתָ!','כָּכָה לוֹמְדִים: מְנַסִּים שׁוּב!','טָעִיתָ, תִּקַּנְתָּ וְהִצְלַחְתָּ!'];
const WRONG=['כִּמְעַט! נַסֵּה שׁוּב.','לֹא נוֹרָא, נַסֵּה עוֹד פַּעַם.','הִסְתַּכֵּל שׁוּב, אַתָּה יָכוֹל!','זֶה בְּסֵדֶר לִטְעוֹת. נַסֵּה שׁוּב!','עוֹד נִסָּיוֹן אֶחָד!'];
const SHOWN=['זֶה בְּסֵדֶר! עַכְשָׁו אַתָּה יוֹדֵעַ.','לֹא נוֹרָא, נִלְמַד אֶת זֶה יַחַד.','גַּם מִטָּעֻיּוֹת לוֹמְדִים!'];
/* the day's story: what each step brings (by the quest's emoji, see QUESTS in talents.js) */
const STORY={'🦸':['בּוֹא נַחְזִיר עוֹד גָּבִישׁ לָעִיר!','עוֹד גָּבִישׁ חָזַר לָעִיר!'],'🧱':['בּוֹא נוֹסִיף עוֹד חֵלֶק לַגֶּשֶׁר!','הַגֶּשֶׁר גָּדַל בְּעוֹד חֵלֶק!'],
 '⚽':['בּוֹא נַבְקִיעַ עוֹד גּוֹל!','גּוֹל! הַקְּבוּצָה שֶׁלְּךָ מוֹבִילָה!'],'🌊':['בּוֹא נִתְקָרֵב עוֹד קְצָת אֶל הַדָּג!','הִתְקָרַבְנוּ אֶל הַדָּג הַקָּטָן!'],
 '🎵':['בּוֹא נַחְזִיר עוֹד תָּו לַשִּׁיר!','עוֹד תָּו חָזַר לַשִּׁיר!'],'🏀':['בּוֹא נִקְלַע עוֹד סַל!','סַל! עוֹד שְׁתֵּי נְקֻדּוֹת!'],
 '🗝️':['בּוֹא נִפְתַּח עוֹד מַנְעוּל!','עוֹד מַנְעוּל נִפְתַּח!'],'🚀':['בּוֹא נָבִיא עוֹד כּוֹכָב לַחֲלָלִית!','הַחֲלָלִית קִבְּלָה עוֹד כּוֹכָב!']};
const STORY0=['בּוֹא נִתְקַדֵּם בַּסִּפּוּר!','הִתְקַדַּמְנוּ בַּסִּפּוּר!'];
const FIRST='מַתְחִילִים אֶת הַמַּסָּע שֶׁל הַיּוֹם!',LAST='עוֹד צַעַד אֶחָד וְנַגִּיעַ לַסּוֹף!',ALL='סִיַּמְנוּ אֶת כָּל הַשְּׁבִיל!';

/* ---------- picking lines: a shuffled bag, never the same line twice close together ---------- */
const bags={},recent=[];
function draw(list){const k=list[0];let b=bags[k];if(!b||!b.length){b=bags[k]=O.shuffle(list.slice());if(b.length>3&&recent.includes(b[b.length-1]))b.unshift(b.pop());}
  let j=b.length-1;while(j>0&&recent.includes(b[j]))j--;const t=b.splice(j,1)[0];recent.push(t);if(recent.length>10)recent.shift();return t;}

/* ---------- the friend in the corner ---------- */
const sprite=()=>T.friend?T.friend():O.PET().s();
let el=null,bub=null,bubT=0,streak=0,missed=false,last='';
const FR={get last(){return last;},log:[]};
function ensure(){if(el&&el.isConnected)return el;el=h('div','frc','<div class="frb" hidden></div><span class="frs"></span>');el.setAttribute('aria-hidden','true');
  document.body.appendChild(el);bub=el.querySelector('.frb');return el;}
const petOnScreen=()=>{const p=$('#sPlay #pet');return !!(p&&!$('#sPlay').hidden&&p.offsetParent);};
FR.mount=()=>{if(petOnScreen())return FR.unmount();ensure();const s=el.querySelector('.frs');const sp=sprite();if(s._sp!==sp){s.innerHTML=sp;s._sp=sp;}
  el.hidden=false;document.body.classList.add('fron');};
FR.unmount=()=>{if(el){el.hidden=true;el.classList.remove('joy','sad');if(bub)bub.hidden=true;}document.body.classList.remove('fron');};
FR.shown=()=>!!(el&&!el.hidden&&el.isConnected);
function anim(c){if(!el)return;el.classList.remove('joy','sad');void el.offsetWidth;el.classList.add(c);}
/* show a line in the bubble (and on the math screen's own bubble when the friend there talks) */
function bubble(t,ms){if(petOnScreen()){const b=$('#bText');if(b)b.innerHTML=t;return;}if(!FR.shown())return;
  bub.innerHTML=t;bub.hidden=false;bub.classList.remove('pop');void bub.offsetWidth;bub.classList.add('pop');clearTimeout(bubT);bubT=setTimeout(()=>{if(bub)bub.hidden=true;},D(ms||2200));}
const onAct=()=>['sTal','sPlay'].some(id=>{const e=$('#'+id);return e&&!e.hidden;});
function talk(t,o){o=o||{};last=t;FR.log.push(t);if(FR.log.length>50)FR.log.shift();if(!FR.shown()&&onAct())FR.mount();if(!o.nobub)bubble(t,o.ms);if(!o.quiet)O.say(T.spk(t));return t;}

/* ---------- reactions ---------- */
/* ctx: {tries} = wrong tries on this question before the right answer; {quiet} = bubble only (something else is about to speak);
   {nobub} = no bubble (the screen shows the line itself). Returns the line. */
FR.onCorrect=ctx=>{ctx=ctx||{};if(!FR.shown()&&onAct())FR.mount();const fixed=(ctx.tries|0)>0||missed;missed=false;
  if(fixed)streak=0;else streak++;anim('joy');
  let t;if(fixed)t=draw(EFFORT);else if(STREAK[streak])t=STREAK[streak];else if(streak>=10&&streak%5===0)t=STREAK_MORE;else t=draw(OK);
  return talk(t,ctx);};
FR.onWrong=ctx=>{ctx=ctx||{};if(!FR.shown()&&onAct())FR.mount();streak=0;missed=!ctx.final;anim('sad');if(ctx.final)missed=false;return talk(draw(ctx.final?SHOWN:WRONG),ctx);};
FR.reset=()=>{streak=0;missed=false;};
/* a story opens: try to read alone first (#355). Bubble only: the screen's own instruction (sayNow) says it */
const READFIRST='קוֹדֶם נְנַסֶּה לִקְרֹא לְבַד!';FR.READFIRST=READFIRST;FR.readFirst=()=>talk(READFIRST,{quiet:1,ms:4000});

/* ---------- a picture that stands for a word: say the word ---------- */
let lead='';                                   /* a story line waiting to be said before the next instruction */
FR.question=(q,card)=>{FR.mount();missed=false;const w=q&&q.word?T.spk(q.word):'';FR.word=w;const pre=[takeLead(),w].filter(Boolean).join(' ');
  if(w&&card){const p=card.querySelector('.pic');if(p&&!p._fw){p._fw=1;p.classList.add('frpic');p.onclick=()=>{O.sfx.pop&&O.sfx.pop(1);O.say(w);};}}
  if(!pre)return;
  if(window.__noAuto)setTimeout(()=>{if(!card||card.isConnected)O.say(pre);},D(300));   /* reading practice: only the word (the question waits for him) */
  else O.sayNow=pre+' '+(O.sayNow||'');};
function takeLead(){const t=lead;lead='';if(t)bubble(t,3500);return t;}
/* other screens of a step: put the story line before whatever the screen says */
function leadOnScreen(){if(!lead)return;if(window.__noAuto){O.say(takeLead());return;}const t=takeLead();O.sayNow=t+' '+(O.sayNow||'');}

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
    const row=card.querySelector('.btnrow');if(row)card.insertBefore(s,row);else card.appendChild(s);setTimeout(()=>{if(s.isConnected){last=t;O.say(T.spk(t));}},D(1200));}
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
T.addChoices&&T.addChoices([BONUS,FREEB]);T.addSay&&T.addSay([DONE,FREE,FREE+' '+MORE]);
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
  if(id==='sPlay'||(cur&&id==='sTal'))setTimeout(()=>{if(!$('#'+id).hidden){FR.mount();if(id==='sPlay'||id==='sTal')leadOnScreen();}},0);
  else FR.unmount();});
O.on('levelDone',()=>setTimeout(FR.stepCheck,D(600)));

/* #433: an error in the middle of a mission sent Oren home (core error handler): the friend says it on the home screen */
const OOPS='אוֹי, חוֹזְרִים לַמַּסָּע';
FR.oops=()=>{FR.mount();anim('sad');return talk(OOPS,{ms:3000});};
FR.speakList=()=>[LISTEN,OOPS,READFIRST,DONE,FREE,FREE+' '+MORE,...OK,...Object.values(STREAK),STREAK_MORE,...EFFORT,...WRONG,...SHOWN,FIRST,LAST,ALL,
  ...[...Object.values(STORY),STORY0].flatMap(([a,b])=>[a,FIRST+' '+a,LAST+' '+a,b,b+' '+ALL])];
/* ---------- #389 listen first ----------
   A new row of answer buttons (.chs .chb) rests until the spoken question has ended, 4 s at most; with no voice (offline,
   auto-read off, reading practice where he reads first) it is open at once. A tap that comes fast after a wrong tap (Oren is
   guessing) is not judged: the options rest 2 s, the friend says 'let's listen again' and the question is read again.
   No penalty, no timer on screen. Not in the speed game (it has its own clock). window.__listen=false turns it off (tests). */
const LISTEN='בּוֹא נַקְשִׁיב שׁוּב';
const LS={MAX:4000,REST:2000,FAST:1500,log:[]};FR.listen=LS;LS.line=LISTEN;
let vS=0;
const lsOff=()=>window.__listen===false;
const noVoice=()=>!!(window.__fast||window.__noAuto||navigator.onLine===false||(O.save&&O.save.set&&O.save.set.autoRead===0));
const P4=()=>(window.__oren4||{}).play;
const speedy=r=>{const p=P4();return !!(p&&p.mode==='speed'&&r.closest('#sPlay'));};
const done=r=>!!r.querySelector('.ok,.show,.pop');
const rest=(r,ms)=>{r.classList.add('lsn');r._ls.until=Date.now()+ms;};
const reread=s=>{if(!s.re)return;s.re=0;if(O.sayNow)O.say(O.sayNow);};
function free(r){r.classList.remove('lsn');const s=r._ls;s.until=0;s.wait=0;reread(s);}
function gate(r){if(r._ls)return r._ls;const s=r._ls={t0:Date.now(),w:0,until:0,wait:0,re:0};
  if(!lsOff()&&!noVoice()&&!speedy(r)){s.wait=1;rest(r,LS.MAX);}return s;}
FR.held=b=>{const r=b&&b.closest&&b.closest('.chs');return !!(r&&r.classList.contains('lsn'));};
/* the right button when the screen tells it (quiz, math training, math play): a right tap is never held */
function right(r){try{const q=window.__quiz,l=window.__learn,p=P4();let a=null;
  if(p&&p.choice&&p.choice.row===r)a=p.choice.ans;else if(q&&q.wrap&&q.wrap.contains(r))a=q.ans;else if(l&&l.wrap&&l.wrap.contains(r))a=l.ans;
  return a==null?null:r.children[a];}catch(e){return null;}}
document.addEventListener('click',e=>{const b=e.target&&e.target.closest&&e.target.closest('.chs .chb');if(!b||lsOff())return;const r=b.closest('.chs'),s=gate(r);
  if(r.classList.contains('lsn')){e.stopImmediatePropagation();e.preventDefault();return;}
  if(s.w&&Date.now()-s.w<LS.FAST&&!b.disabled&&!done(r)&&!speedy(r)&&right(r)!==b){e.stopImmediatePropagation();e.preventDefault();
    s.w=0;rest(r,LS.REST);s.re=Date.now();LS.log.push('rest');talk(LISTEN,{ms:LS.REST});return;}
  setTimeout(()=>{if(b.classList.contains('bad'))s.w=Date.now();},0);},true);
O.on('voice',on=>{const t=Date.now();if(on){vS=t;return;}
  document.querySelectorAll('.chs').forEach(r=>{const s=r._ls;if(!s)return;
    if(s.re&&vS>=s.re){reread(s);return;}                       /* the friend's line ended: read the question again */
    if(s.wait&&vS>=s.t0)free(r);});});                           /* the question was heard: open */
setInterval(()=>{const t=Date.now();document.querySelectorAll('.chs.lsn').forEach(r=>{if(r._ls&&r._ls.until<=t)free(r);});},100);
new MutationObserver(ms=>{if(lsOff())return;for(const m of ms)for(const n of m.addedNodes){if(n.nodeType!==1)continue;
  const rs=n.matches('.chs')?[n]:n.querySelectorAll('.chs');rs.forEach(r=>{if(r.querySelector('.chb'))gate(r);});}}).observe(document.body,{childList:true,subtree:true});
FR._cur=()=>cur;FR._lines={ok:OK,streak:[...Object.values(STREAK),STREAK_MORE],effort:EFFORT,wrong:WRONG,shown:SHOWN};
window.FRIEND=FR;window.PATHBAR=PATHBAR;
})();
