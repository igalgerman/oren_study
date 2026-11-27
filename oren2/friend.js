/* ===== THE FRIEND ON ACTIVITY SCREENS + THE DAY'S PATH STRIP (injected into index.html by build) =====
   One small friend in the corner of activity screens, with a speech bubble:
     FRIEND.onCorrect(ctx)  a short warm line (varied; streaks; effort after a fixed mistake), a little hop
     FRIEND.onWrong(ctx)    a gentle line, a sad tilt; ctx.final = the answer is shown now
     FRIEND.question(q,card) a picture that stands for a word: the word is said (q.word), tapping the picture says it again
     FRIEND.mount()/unmount() show / hide the friend (screens change → hidden; activities mount it)
   While Oren is inside a step of the day's path:
     FRIEND.stepStart(i)    the friend says the opening line of the story's scene (story.js, #386; said before the screen's instruction)
     FRIEND.stepCheck()     after a step is done: the scene's closing line on the result card, and the story moves one scene on
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
/* the day's story is the script of story.js (#386): one scene per learning step */
const SM=()=>window.STORYMIX;
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
let hintAt=0;   /* #409 a hint just said keeps the bubble and the voice: a reaction line right after it is skipped */
function talk(t,o){o=o||{};if(!o.hint&&Date.now()-hintAt<1500)return t;last=t;FR.log.push(t);if(FR.log.length>50)FR.log.shift();if(!FR.shown()&&onAct())FR.mount();if(!o.nobub)bubble(t,o.ms);if(!o.quiet)O.say(T.spk(t));return t;}

/* ---------- reactions ---------- */
/* ctx: {tries} = wrong tries on this question before the right answer; {quiet} = bubble only (something else is about to speak);
   {nobub} = no bubble (the screen shows the line itself). Returns the line. */
FR.onCorrect=ctx=>{ctx=ctx||{};if(!FR.shown()&&onAct())FR.mount();const fixed=(ctx.tries|0)>0||missed;missed=false;
  if(fixed)streak=0;else streak++;anim('joy');
  let t;if(fixed)t=draw(EFFORT);else if(yday(ctx))t=RXL.yday;else if(STREAK[streak])t=STREAK[streak];else if(streak>=10&&streak%5===0)t=STREAK_MORE;else t=draw(OK);
  return talk(t,ctx);};
FR.onWrong=ctx=>{ctx=ctx||{};if(!FR.shown()&&onAct())FR.mount();streak=0;const x=hk(kindOf(ctx));if(x)x.n++;missed=!ctx.final;anim('sad');if(ctx.final)missed=false;return talk(draw(ctx.final?SHOWN:WRONG),ctx);};
FR.reset=()=>{streak=0;missed=false;};
/* #409 the first hint of the help button (#54) is said by the friend in his bubble (no popup). The voice is the caller's.
   false = no friend on this screen (the caller shows its own box). */
const friendHere=()=>petOnScreen()||FR.shown();
FR.hint=html=>{if(!friendHere()&&ACTS.some(id=>{const e=$('#'+id);return e&&!e.hidden;}))FR.mount();if(!friendHere())return false;
  FR.hinted=html;talk(html,{quiet:1,ms:7000,hint:1});hintAt=Date.now();return true;};
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
/* #414 the mission's learning goal (goals.js): its own clip, after the path's story line and before the screen's instruction.
   A quiz takes it with its first question; any other screen gets it once the mission's screen is drawn. */
const GSEP='\u2063';
let goalT='';
/* a question read again (listen first, #389) is the question alone: the goal was said once */
FR.noGoal=x=>goalT?String(x||'').split(goalT+GSEP).join('').trim():String(x||'');
FR.goal=t=>{if(!t)return;goalT=t;lead=(lead?lead+' '+GSEP:'')+t+GSEP;setTimeout(()=>{if(lead.includes(t))leadOnScreen();},0);};

/* ---------- the day's path ---------- */
let cur=null;                                  /* {i, d: the day, done: announced} while inside a path step */
const daily=()=>{try{return T.S().set.noDaily?null:T.dailyEnsure();}catch(e){return null;}};
const quest=()=>(T.quest&&T.quest())||{e:'⭐',k:'⭐'};
/* a together / at-home step (tog:, rw:) is not a scene: no story line, the story does not move */
const isScene=id=>!/:/.test(String(id));
FR.stepStart=i=>{const d=daily();if(!d||i==null||i<0||i>=d.t.length){cur=null;return;}cur={i,d:d.d,id:d.t[i]};
  const dn=d.done.slice(d.bs|0),left=dn.filter(x=>!x).length,first=!dn.some(Boolean);
  /* #412 the latest piece he collected comes along: its own clip before the scene's opening line */
  const it=window.SHIP&&SHIP.latest&&SHIP.latest(),carry=it?SHIP.carrySay(it.i)+GSEP:'';
  lead=SM()&&isScene(cur.id)?carry+(first?FIRST+' ':left<=1?LAST+' ':'')+SM().scene().open:'';PATHBAR.render();};
FR.stepCheck=()=>{if(!cur)return;const d=daily();if(!d||d.d!==cur.d||d.t[cur.i]!==cur.id||!d.done[cur.i]||cur.done)return;cur.done=1;PATHBAR.render();
  if(!SM()||!isScene(cur.id))return;const sc=SM().scene(),close=sc.close;SM().advance();
  const t=d.done.slice(d.bs|0).every(Boolean)?close+' '+ALL:close;
  const card=$('#ov:not([hidden]) .card');if(card&&!card.querySelector('.frstory')){const s=h('div','frstory',`<span class="frq">${quest().k}</span><span>${t}</span>`);
    const row=card.querySelector('.btnrow');if(row)card.insertBefore(s,row);else card.appendChild(s);setTimeout(()=>{if(s.isConnected){last=t;O.say(T.spk(t));}},D(1200));
    storyPic(card,sc);ezAsk(card,cur.id,t);moments(card);}
  else talk(t,{ms:3500});};
/* #411 at the end of a scene, at most every third scene (save.ez.n counts the scenes since the last question): 'easy or hard?'
   with two big faces, one tap. The answer moves that mission's level one step (hard = one easier, easy = one harder; a level the
   parent locked stays); a math journey level said 'hard' is played again on the next path math mission (save.ez.rep).
   The answer is a day-log line ('f', x.ez 'e'|'h') that the parent's day view shows. */
const EZ={q:'הָיָה קַל אוֹ קָשֶׁה?',e:'קַל',h:'קָשֶׁה',EVERY:3};FR.EZ=EZ;T.addChoices&&T.addChoices([EZ.e,EZ.h]);
let lastLv=null;O.on('levelDone',lv=>{lastLv=lv&&lv.type!=='train'?lv:null;});
function ezAsk(card,id,t){const S=O.save;if(!S)return;const z=S.ez=S.ez||{};z.n=(z.n|0)+1;if(z.n<EZ.EVERY||card.querySelector('.frez'))return;z.n=0;O.persist();
  const lv=id==='math'?lastLv:null,box=h('div','frez',`<div class="frezq">${EZ.q}</div>`),row=h('div','frezr');
  [['e','😀'],['h','😣']].forEach(([a,f])=>{const b=h('button','frezf',`<span class="frezi">${f}</span><span>${EZ[a]}</span>`);b.dataset.a=a;
    b.onclick=ev=>{ev.stopPropagation();if(box._a)return;box._a=a;row.querySelectorAll('button').forEach(x=>{x.disabled=true;});b.classList.add('on');O.sfx.pop&&O.sfx.pop(2);ezSet(id,lv,a);};row.appendChild(b);});
  box.appendChild(row);const r=card.querySelector('.btnrow');if(r)card.insertBefore(box,r);else card.appendChild(box);
  setTimeout(()=>{if(box.isConnected&&!box._a)O.say(T.spk(EZ.q));},D(1300));}
function ezSet(id,lv,a){const S=O.save,LN=window.LEARN,DL=window.DAYLOG;
  if(id==='math'){if(lv&&a==='h')S.ez.rep=lv.id;}
  else if(LN&&LN.state)try{const st=LN.state(),sk=id==='ln-math'?(st.rc||[]).find(x=>(LN.DRILL_IDS||[]).includes(x)):'a:'+id,k=sk&&st.k[sk];
    if(k&&!k.lk){const l=Math.max(1,Math.min(LN.maxLv(sk),(k.l|0||1)+(a==='h'?-1:1)));if(l!==k.l)LN.setLevel(sk,l);}}catch(e){}
  if(DL&&DL.add){const d=new Date();DL.add(O.today(),[d.getHours()*60+d.getMinutes(),lv?'lv:'+lv.id:id,0,0,0,0,'f',{ez:a}]);}O.persist();}
/* ---------- friend moments: after 'continue' on a scene's result card, before the story goes on (one at a time) ----------
   #428 every third scene (save.frb counts the scenes): ONE short arcade round as a break; the friend picks the game, one tap yes / skip.
   #410 once per path (save.frtch = the path): the friend makes a funny mistake on something Oren knows (KNOW: known), one tap
   corrects him (3 choices); he says thanks; a wrong tap is gentle (the right one lights up), no penalty, nothing recorded. */
const BRK={EVERY:3,ask:g=>'הִגִּיעַ זְמַן לְהַפְסָקָה קְטַנָּה! בָּחַרְתִּי לָנוּ מִשְׂחָק: '+g.n+'.',yes:'כֵּן, נְשַׂחֵק!',no:'לֹא, מַמְשִׁיכִים'};FR.BRK=BRK;
const TCH={claim:'אֲנִי חוֹשֵׁב שֶׁזֶּה',ask:'נָכוֹן? מָה הַתְּשׁוּבָה הַנְּכוֹנָה?',thanks:'תּוֹדָה! צָדַקְתָּ, אֲנִי טָעִיתִי. 😄',gentle:'לֹא נוֹרָא! הִנֵּה הַתְּשׁוּבָה הַנְּכוֹנָה. תּוֹדָה שֶׁעָזַרְתָּ לִי!'};FR.TCH=TCH;
T.addChoices&&T.addChoices([BRK.yes,BRK.no]);
const games=()=>T.arcGames||[];
const pathKey=()=>{const d=daily();return d?d.d+':'+(d.bs|0):'';};
/* a question of a math skill Oren knows (KNOW), with a number answer and 3 choices: [right, the friend's wrong one, one more] */
function teachQ(){const K=window.KNOW,LN=window.LEARN;if(!K||!K.st||!LN||!LN.gen)return null;
  const ks=Object.keys(K.st().k).filter(id=>K.known(id)&&(K.skillOf(id)||{}).area==='math');
  for(const id of O.shuffle(ks)){const s=K.skillOf(id);let q;try{q=LN.gen(s.sk,s.lv);}catch(e){continue;}
    if(!q||!Array.isArray(q.opts)||q.opts.length<3||!/\?/.test(q.html||''))continue;const r=q.opts[q.ans];const ws=O.shuffle([...new Set(q.opts.filter(x=>x!==r))]);if(ws.length<2)continue;
    return {skill:id,html:q.html,right:r,wrong:ws[0],opts:O.shuffle([r,ws[0],ws[1]])};}
  return null;}
FR.teachQ=teachQ;
function momentFor(){const S=O.save;if(!S||window.__moments===false)return null;   /* __moments=false: off (tests of the path flow) */
  if((S.frb|0)>=BRK.EVERY&&games().length)return 'brk';
  if(S.frtch!==pathKey()&&teachQ())return 'tch';return null;}
function moments(card){const S=O.save;if(!S)return;S.frb=(S.frb|0)+1;O.persist();
  const rows=card.querySelectorAll('.btnrow'),b=rows.length&&rows[rows.length-1].lastElementChild;if(!b||b._fm)return;const go=b.onclick;if(!go)return;b._fm=1;
  b.onclick=e=>{const k=momentFor(),next=()=>{const ov=$('#ov');if(ov)ov.hidden=true;go.call(b,e);};
    if(k==='brk')brkOffer(next);else if(k==='tch')teach(next);else go.call(b,e);};}
function momentCard(cls,html){const ov=$('#ov');ov.hidden=false;ov.innerHTML=`<div class="card frm ${cls}"><div class="frms">${sprite()}</div>${html}</div>`;return ov.firstChild;}
function brkOffer(next){const S=O.save;S.frb=0;O.persist();const g=O.shuffle(games().slice())[0],t=BRK.ask(g);
  const c=momentCard('frbrk',`<div class="frmt">${t}</div><div class="frbg">${g.e}</div>`),row=h('div','btnrow');
  const y=h('button','bigbtn','<span>'+BRK.yes+'</span>'),n=h('button','bigbtn plain','<span>'+BRK.no+'</span>');
  y.onclick=()=>{O.sfx.pop&&O.sfx.pop(3);$('#ov').hidden=true;cur=null;lead='';T.arcBreak(g.id,next);};
  n.onclick=()=>{O.sfx.pop&&O.sfx.pop(1);next();};row.append(y,n);c.appendChild(row);last=t;O.say(T.spk(t));return c;}
function teach(next){const q=teachQ();if(!q)return next();O.save.frtch=pathKey();O.persist();
  const eq=v=>q.html.replace('?',`<b class="frtw">${v}</b>`);
  const c=momentCard('frtch',`<div class="frtq">${eq(q.wrong)}</div><div class="frmt">${TCH.claim} <b>${q.wrong}</b>! 🤪 ${TCH.ask}</div>`),row=h('div','frtr');
  q.opts.forEach(v=>{const b=h('button','bigbtn plain frto','<span class="ltr">'+v+'</span>');b.dataset.v=v;
    b.onclick=()=>{if(row._a)return;row._a=1;row.querySelectorAll('button').forEach(x=>{x.disabled=true;});const good=v===q.right;
      row.querySelectorAll('button').forEach(x=>{if(+x.dataset.v===q.right)x.classList.add(good?'ok':'show');});c.querySelector('.frtq').innerHTML=eq(q.right);
      const t=good?TCH.thanks:TCH.gentle;c.querySelector('.frmt').textContent=t;anim(good?'joy':'sad');last=t;O.sfx.pop&&O.sfx.pop(good?3:1);O.say(T.spk(t));
      setTimeout(()=>{if(c.isConnected)next();},D(3500));};row.appendChild(b);});
  c.appendChild(row);last=TCH.claim;O.say(T.spk(TCH.claim)+GSEP+q.wrong+GSEP+T.spk(TCH.ask));FR.teaching=q;return c;}
/* the next path math mission after a 'hard' answer: that level again, once */
FR.ezRep=()=>{const S=O.save,z=S&&S.ez;if(!z||!z.rep)return null;const id=z.rep;z.rep=null;O.persist();return (O.ALLLV||[]).find(l=>l.id===id)||null;};
/* #387: the end of a scene, a 2 s picture of what changed in the story: the ship as the story has it, the scene's new piece
   blinking (the ship's own drawing). It lies over the result card; one tap (anywhere on it) skips, it never waits for him. */
const PICMS=2000;
function storyPic(card,sc){const S=window.SHIP;if(!S||!S.el||card.querySelector('.frsp'))return;
  const k=(sc.c-1)*5+sc.s,e=h('div','frsp',S.el('big',k));e.setAttribute('role','img');e.setAttribute('aria-label',sc.item);
  const end=()=>{clearTimeout(e._t);if(e.isConnected)e.remove();};e.onclick=ev=>{ev.stopPropagation();ev.preventDefault();end();};
  if(getComputedStyle(card).position==='static')card.style.position='relative';card.appendChild(e);e._t=setTimeout(end,D(PICMS));}
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
FR.inStep=()=>!!cur;FR.lead=t=>{lead=t;};FR._lead=t=>{const x=lead;if(t!=null)lead=t;return x;};

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
FR.speakList=()=>[EZ.q,...games().map(BRK.ask),TCH.claim,TCH.ask,TCH.thanks,TCH.gentle,...(window.SHIP&&SHIP.carrySay?SHIP.PIECES.map((_,i)=>SHIP.carrySay(i)):[]),...(window.GOALS?window.GOALS.speakList():[]),LISTEN,RXL.hint,RXL.yday,RXL.back,OOPS,READFIRST,DONE,FREE,FREE+' '+MORE,...OK,...Object.values(STREAK),STREAK_MORE,...EFFORT,...WRONG,...SHOWN,FIRST,LAST,ALL,
  ...(SM()?SM().SCRIPT.flatMap(ch=>ch.sc.flatMap(([a,b])=>[a,FIRST+' '+a,LAST+' '+a,b,b+' '+ALL])):[]),...(SM()?SM().speakList():[])];
/* ---------- #389 listen first ----------
   A new row of answer buttons (.chs .chb) rests until the spoken question has ended, 4 s at most; with no voice (offline,
   auto-read off, reading practice where he reads first) it is open at once. A tap that comes fast after a wrong tap (Oren is
   guessing) is not judged: the options rest 2 s, the friend says 'let's listen again' and the question is read again.
   No penalty, no timer on screen. Not in the speed game (it has its own clock). window.__listen=false turns it off (tests). */
const LISTEN='בּוֹא נַקְשִׁיב שׁוּב';
const LS={MAX:4000,REST:2000,FAST:1500,log:[]};FR.listen=LS;LS.line=LISTEN;
let vS=0;
/* ---------- #408 the friend reacts to how Oren plays: one short line, at most one reaction per question (one .chs row) ----------
   silence: RX.QUIET with no tap and no voice while a question waits -> 'want a hint?', the help button (#54) lights up;
   fast guessing: the listen-first rest below, with its line (LISTEN) -- the same trigger, never a second message;
   hard yesterday (2+ mistakes in that activity), right at the first try today -> once; back after RX.BREAK -> a welcome before the question. */
const RXL={hint:'רוֹצֶה רֶמֶז? גַּע בַּכַּפְתּוֹר עֶזְרָה.',fast:LISTEN,yday:'אֶתְמוֹל זֶה הָיָה קָשֶׁה, וְהַיּוֹם הִצְלַחְתָּ!',back:'אֵיזֶה כֵּיף שֶׁחָזַרְתָּ! בּוֹא נַמְשִׁיךְ.'};
const RX={QUIET:20000,BREAK:30*60000,lines:RXL,log:[]};FR.react=RX;
let lastRow=null,vOn=false,vE=0;
function reacted(r,k){if(r){if(r._rx)return false;r._rx=k;}RX.log.push(k);if(RX.log.length>50)RX.log.shift();return true;}
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const yest=()=>{const d=new Date();d.setDate(d.getDate()-1);return ymd(d);};
function kindOf(ctx){if(ctx&&ctx.m)return ctx.m;const e=$('#sPlay');return e&&!e.hidden?'math':'';}
/* mistakes per activity per day: {d, n, pd, pn (the day before it was played), y (said today)} */
function hk(m){const S=O.save;if(!S||!m)return null;const H=S.frh=S.frh||{};let x=H[m];const t=ymd(new Date());
  if(!x||x.d!==t)x=H[m]={d:t,n:0,pd:x?x.d:'',pn:x?x.n|0:0};return x;}
function yday(ctx){const x=hk(kindOf(ctx));if(!x||x.y||x.pd!==yest()||x.pn<2)return false;
  if(!reacted(lastRow&&lastRow.isConnected?lastRow:null,'yday'))return false;x.y=1;return true;}
const ovOpen=()=>['#ov','#dlg'].some(q=>{const e=$(q);return e&&!e.hidden;});
function helpOf(r){for(let e=r.parentElement;e&&e!==document.body;e=e.parentElement){const q=e.querySelector('.helpq');if(q)return q._help||null;}return null;}
function onRow(r){const t=Date.now();r._q={t0:t};const S=O.save;if(!S||speedy(r))return;const b=S.frt;S.frt=t;
  if(!b||t-b<RX.BREAK||!reacted(r,'back'))return;const w=T.spk(RXL.back);talk(RXL.back,{quiet:1,ms:3500});
  if(window.__noAuto)O.say(w);else O.sayNow=w+' '+(O.sayNow||'');}
function quiet(t){if(vOn||document.hidden||window.__noAuto||ovOpen()||(window.HELP&&HELP.state))return;
  document.querySelectorAll('.chs').forEach(r=>{const s=r._q;if(!s||r._rx||!r.offsetParent||r.classList.contains('lsn')||done(r)||speedy(r))return;
    if(t-Math.max(s.t0,s.lt||0,vE)<RX.QUIET)return;const hb=helpOf(r);if(!hb||hb.step||!hb.el.isConnected||!reacted(r,'hint'))return;
    hb.el.classList.add('offer');talk(RXL.hint,{ms:3500});});}
const lsOff=()=>window.__listen===false;
const noVoice=()=>!!(window.__fast||window.__noAuto||navigator.onLine===false||(O.save&&O.save.set&&O.save.set.autoRead===0));
const P4=()=>(window.__oren4||{}).play;
const speedy=r=>{const p=P4();return !!(p&&p.mode==='speed'&&r.closest('#sPlay'));};
const done=r=>!!r.querySelector('.ok,.show,.pop');
const rest=(r,ms)=>{r.classList.add('lsn');r._ls.until=Date.now()+ms;};
const reread=s=>{if(!s.re)return;s.re=0;if(O.sayNow)O.say(FR.noGoal(O.sayNow));};
function free(r){r.classList.remove('lsn');const s=r._ls;s.until=0;s.wait=0;reread(s);}
function gate(r){if(r._ls)return r._ls;const s=r._ls={t0:Date.now(),w:0,until:0,wait:0,re:0};
  if(!lsOff()&&!noVoice()&&!speedy(r)){s.wait=1;rest(r,LS.MAX);}return s;}
FR.held=b=>{const r=b&&b.closest&&b.closest('.chs');return !!(r&&r.classList.contains('lsn'));};
/* the right button when the screen tells it (quiz, math training, math play): a right tap is never held */
function right(r){try{const q=window.__quiz,l=window.__learn,p=P4();let a=null;
  if(p&&p.choice&&p.choice.row===r)a=p.choice.ans;else if(q&&q.wrap&&q.wrap.contains(r))a=q.ans;else if(l&&l.wrap&&l.wrap.contains(r))a=l.ans;
  return a==null?null:r.children[a];}catch(e){return null;}}
document.addEventListener('click',e=>{const b=e.target&&e.target.closest&&e.target.closest('.chs .chb');if(!b)return;const r=b.closest('.chs');
  lastRow=r;if(r._q)r._q.lt=Date.now();if(O.save)O.save.frt=Date.now();if(lsOff())return;const s=gate(r);
  if(r.classList.contains('lsn')){e.stopImmediatePropagation();e.preventDefault();return;}
  if(s.w&&Date.now()-s.w<LS.FAST&&!b.disabled&&!done(r)&&!speedy(r)&&right(r)!==b){e.stopImmediatePropagation();e.preventDefault();
    s.w=0;rest(r,LS.REST);s.re=Date.now();LS.log.push('rest');if(reacted(r,'fast'))talk(LISTEN,{ms:LS.REST});return;}
  setTimeout(()=>{if(b.classList.contains('bad'))s.w=Date.now();},0);},true);
O.on('voice',on=>{const t=Date.now();vOn=!!on;if(on){vS=t;return;}vE=t;
  document.querySelectorAll('.chs').forEach(r=>{const s=r._ls;if(!s)return;
    if(s.re&&vS>=s.re){reread(s);return;}                       /* the friend's line ended: read the question again */
    if(s.wait&&vS>=s.t0)free(r);});});                           /* the question was heard: open */
setInterval(()=>{const t=Date.now();quiet(t);document.querySelectorAll('.chs.lsn').forEach(r=>{if(r._ls&&r._ls.until<=t)free(r);});},100);
new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes){if(n.nodeType!==1)continue;
  const rs=n.matches('.chs')?[n]:n.querySelectorAll('.chs');rs.forEach(r=>{if(!r.querySelector('.chb'))return;if(!r._q)onRow(r);if(!lsOff())gate(r);});}}).observe(document.body,{childList:true,subtree:true});
FR._cur=()=>cur;FR._lines={ok:OK,streak:[...Object.values(STREAK),STREAK_MORE],effort:EFFORT,wrong:WRONG,shown:SHOWN};
window.FRIEND=FR;window.PATHBAR=PATHBAR;
})();
