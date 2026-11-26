/* ===== MUSIC 2: reading notes, ear, rhythm and melodies — new activities inside the music hall =====
   Connects to Oren's piano lessons: see a note on the staff -> name it -> play it on the on-screen piano.
   Every activity has gradual levels; Oren always plays his current level and moves up with 2+ stars.
   Pure helpers (pitch, staff positions, engraving) work without the game, so the tests can check them in node. */
(()=>{'use strict';
/* ---------- pure music helpers ---------- */
const SOL=['דּוֹ','רֶה','מִי','פָה','סוֹל','לָה','סִי'];
const SC=[0,2,4,5,7,9,11];
const mod7=i=>((i%7)+7)%7;
const midiOf=i=>60+SC[mod7(i)]+12*Math.floor(i/7);      /* diatonic step -> MIDI; step 0 = middle C (C4 = 60) */
const freq=m=>440*Math.pow(2,(m-69)/12);                  /* equal temperament, A4 = 440 Hz */
const nameOf=i=>SOL[mod7(i)];
const CLEF={treble:{bot:2},bass:{bot:-10}};               /* step of the bottom line: E4 (treble) / G2 (bass) */
const GAP=12,TOP=40,BOT=TOP+4*GAP,INK='#23303b';          /* staff lines at y = 40,52,64,76,88 */
const yOf=(i,clef='treble')=>BOT-(i-CLEF[clef].bot)*GAP/2;
const stemUp=(i,clef='treble')=>i<CLEF[clef].bot+4;       /* below the middle line: stem up on the right; on/above: down on the left */
function ledgers(i,clef='treble'){const b=CLEF[clef].bot,t=b+8,out=[];for(let k=b-2;k>=i;k-=2)out.push(k);for(let k=t+2;k<=i;k+=2)out.push(k);return out;}
const BEATS={w:4,h:2,q:1,e:.5};
/* original clef drawings (simple strokes) */
const TREBLE=`<path d="M27 104 C28 112 38 112 37 102 L33 30 C32 19 41 13 43 23 C45 33 36 44 28 52 C18 62 15 76 22 85 C29 93 45 92 46 80 C47 70 38 64 31 68 C25 72 26 80 32 82" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="28" cy="104" r="4" fill="${INK}"/>`;
const BASS=`<circle cx="21" cy="52" r="5.5" fill="${INK}"/><path d="M17 50 C18 36 46 34 47 54 C48 74 31 88 14 96" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><circle cx="56" cy="46" r="3.2" fill="${INK}"/><circle cx="56" cy="58" r="3.2" fill="${INK}"/>`;
/* one note: head on its line/space, ledger lines, stem on the correct side, flag for an unbeamed eighth */
function noteSVG(x,n,clef,one){const y=one?64:yOf(n.i,clef),c=n.col||INK,d=n.d||'q';let s=`<g class="m2n${n.cls?' '+n.cls:''}" data-k="${n.k==null?'':n.k}">`;
  if(!one)ledgers(n.i,clef).forEach(k=>{s+=`<line x1="${x-13}" x2="${x+13}" y1="${yOf(k,clef)}" y2="${yOf(k,clef)}" stroke="${INK}" stroke-width="2"/>`;});
  if(d==='w')s+=`<ellipse cx="${x}" cy="${y}" rx="10" ry="6.6" fill="${c}"/><ellipse class="hole" cx="${x}" cy="${y}" rx="4.4" ry="4.6" transform="rotate(-50 ${x} ${y})" fill="#fff"/>`;
  else{s+=`<ellipse cx="${x}" cy="${y}" rx="8" ry="5.8" transform="rotate(-20 ${x} ${y})" fill="${c}"/>`;if(d==='h')s+=`<ellipse class="hole" cx="${x}" cy="${y}" rx="5.6" ry="2.6" transform="rotate(-30 ${x} ${y})" fill="#fff"/>`;
    const up=one||stemUp(n.i,clef),sx=up?x+7.3:x-7.3,sy=up?y-40:y+40;s+=`<line x1="${sx}" x2="${sx}" y1="${y}" y2="${sy}" stroke="${c}" stroke-width="2.3"/>`;
    if(d==='e'&&!n.beam)s+=up?`<path d="M${sx} ${sy} C${sx+1} ${sy+9} ${sx+13} ${sy+13} ${sx+10} ${sy+28} C${sx+9} ${sy+19} ${sx+4} ${sy+15} ${sx} ${sy+12} Z" fill="${c}"/>`:`<path d="M${sx} ${sy} C${sx+1} ${sy-9} ${sx+13} ${sy-13} ${sx+10} ${sy-28} C${sx+9} ${sy-19} ${sx+4} ${sy-15} ${sx} ${sy-12} Z" fill="${c}"/>`;}
  return s+'</g>';}
const SP={w:70,h:56,q:44,e:36};
/* a staff: notes = [{i (step), d ('w','h','q','e'), col, k, beam:'s'|'e', bar (bar line after)}]
   o = {clef:'treble'|'bass', one (single line, rhythm only), time (4/4), end (final bar line), minW, cls} */
function staffSVG(notes,o={}){const clef=o.clef||'treble',one=!!o.one;let x=one?24:66;let body='';
  if(o.time){body+=`<text x="${x+8}" y="${one?57:60}" font-size="25" font-weight="900" font-family="Georgia,serif" text-anchor="middle" fill="${INK}">4</text><text x="${x+8}" y="${one?81:84}" font-size="25" font-weight="900" font-family="Georgia,serif" text-anchor="middle" fill="${INK}">4</text>`;x+=30;}
  const xs=[];notes.forEach((n,j)=>{const nx=x+16;xs.push(nx);body+=noteSVG(nx,n,clef,one);x+=SP[n.d||'q'];
    if(n.bar&&j<notes.length-1){body+=`<line x1="${x}" x2="${x}" y1="${one?52:TOP}" y2="${one?76:BOT}" stroke="${INK}" stroke-width="2"/>`;x+=14;}});
  notes.forEach((n,j)=>{if(n.beam==='s'&&notes[j+1]&&(one||stemUp(n.i,clef))){const y=(one?64:Math.min(yOf(n.i,clef),yOf(notes[j+1].i,clef)))-40;body+=`<rect x="${xs[j]+6.2}" y="${y}" width="${xs[j+1]-xs[j]+2.2}" height="6" fill="${n.col||INK}"/>`;}});
  let w=Math.max(x+(o.end?22:16),o.minW||0);const shift=!o.fill&&o.minW&&x+16<o.minW?(o.minW-x-16)/2:0;
  if(o.end)body+=`<line x1="${w-14}" x2="${w-14}" y1="${one?52:TOP}" y2="${one?76:BOT}" stroke="${INK}" stroke-width="2"/><rect x="${w-10}" y="${one?52:TOP}" width="5" height="${one?24:BOT-TOP}" fill="${INK}"/>`;
  let s=`<svg class="m2staff${o.cls?' '+o.cls:''}" viewBox="0 ${one?14:8} ${w} ${one?78:112}" data-w="${w}" aria-hidden="true">`;
  if(one)s+=`<line x1="6" x2="${w-6}" y1="64" y2="64" stroke="${INK}" stroke-width="2"/>`;
  else{for(let k=0;k<5;k++)s+=`<line x1="6" x2="${w-6}" y1="${TOP+k*GAP}" y2="${TOP+k*GAP}" stroke="${INK}" stroke-width="2"/>`;s+=clef==='bass'?BASS:TREBLE;}
  return s+`<g transform="translate(${shift},0)">${body}</g></svg>`;}
/* "2q 1q 0h | 2q 1q 0h" -> notes; numbers are steps (0 = middle C), bars marked with | */
function parseMel(str){const out=[];str.trim().split(/\s+/).forEach(t=>{if(t==='|'){if(out.length)out[out.length-1].bar=1;return;}const m=t.match(/^(-?\d+)([whqe])$/);if(m)out.push({i:+m[1],d:m[2]});});return out;}
const barBeats=notes=>{const bars=[];let cur=0;notes.forEach(n=>{cur+=BEATS[n.d];if(n.bar){bars.push(cur);cur=0;}});bars.push(cur);return bars;};
const onsets=pat=>{let t=0;return pat.map(d=>{const o=t;t+=BEATS[d];return o;});};
const ENG={SOL,SC,midiOf,freq,nameOf,yOf,stemUp,ledgers,CLEF,BEATS,staffSVG,parseMel,barBeats,onsets,TOP,BOT,GAP};
if(typeof module!=='undefined'&&module.exports){module.exports=ENG;}
if(typeof window==='undefined')return;
window.MUSIC2={ENG};
const O=window.OREN,T=window.TAL;if(!O||!T)return;
const {h,$,rand,pick,shuffle,ICON}=O;const sfx=O.sfx,D=O.D;

/* ---------- levels ---------- */
const READ=[
  {pool:[0,1,2],opts:3,names:1},                 /* דּוֹ רֶה מִי */
  {pool:[0,1,2,3,4],opts:3,names:1},             /* דּוֹ עַד סוֹל */
  {pool:[2,3,4,5,6,7],opts:3,names:0},           /* עַד דּוֹ הַגָּבוֹהַּ */
  {pool:[0,1,2,3,4,5,6,7],opts:4,names:0},       /* כָּל הָאוֹקְטָבָה */
  {pool:[-7,-6,-5,-4,-3,-2,-1,0],opts:4,names:1,clef:'bass'}];
const EAR=['hl-big','same','hl-small','which2','which3'];
const RHY=[{vals:['w','h','q'],nq:6,pats:[['q','q','q','q'],['h','h'],['q','q','h']]},
  {vals:['w','h','q'],nq:3,pats:[['q','q','h'],['h','q','q'],['q','h','q'],['w'],['h','h'],['q','q','q','q']]},
  {vals:['h','q','e'],nq:3,pats:[['q','e','e','q','q'],['e','e','q','h'],['q','q','e','e','q'],['e','e','e','e','h']]},
  {vals:['w','h','q','e'],nq:2,pats:[['e','e','q','e','e','q'],['h','e','e','q'],['q','e','e','h'],['e','e','e','e','q','q'],['q','q','e','e','q'],['e','e','q','q','q']]}];
const MEL=[
  {names:1,songs:['2q 1q 0h | 2q 1q 0h','0q 1q 2q 2q | 2q 1q 0h','0q 0q 1q 1q | 2h 0h']},
  {names:1,songs:['0q 1q 2q 3q | 4h 4h','4q 3q 2q 1q | 0w','0q 2q 4q 2q | 0h 0h']},
  {names:0,songs:['0q 1q 2q 0q | 0q 1q 2q 0q | 2q 3q 4h | 2q 3q 4h','2q 2q 3q 4q | 4q 3q 2q 1q | 0q 0q 1q 2q | 2q 1q 1h','4q 2q 2h | 3q 1q 1h | 0q 1q 2q 3q | 4q 4q 4h']},
  {names:0,songs:['0q 0q 4q 4q | 5q 5q 4h | 3q 3q 2q 2q | 1q 1q 0h','0q 1q 2q 3q | 4q 5q 6q 7q | 7w','7q 4q 2q 4q | 7q 4q 2h | 0q 2q 4q 7q | 7w']}];
const VALN={w:'שָׁלֵם',h:'חֲצִי',q:'רֶבַע',e:'שְׁמִינִית'},VALB={w:'4',h:'2',q:'1',e:'½'};
const ACTS={read:['mus2-read','קְרִיאַת תָּוִים',READ.length],ear:['mus2-ear','שְׁמִיעָה',EAR.length],rhy:['mus2-rhythm','קוֹרְאִים קֶצֶב',RHY.length],mel:['mus2-melody','מְנַגְּנִים מֵהַתָּוִים',MEL.length]};
const ST=()=>{const s=T.S();s.m2=s.m2||{};for(const k in ACTS)s.m2[k]=Math.min(ACTS[k][2],Math.max(1,s.m2[k]|0));return s.m2;};

/* ---------- sound (exact pitch through the game's own synth: O.NT = 440·2^((n-69)/12)) ---------- */
const play=(m,dur=.7,vol=1,at=0)=>{if(T.playMidi)return T.playMidi(m,dur,vol,at);if((O.save.snd|0)<1||!O.audio())return;O.tone(O.NT(m),O.A.ctx.currentTime+at,dur,{type:'triangle',vol:.2*vol,rel:.35,lp:3200});};
const drum=()=>{if(O.audio()&&(O.save.snd|0)>=1)O.noise(O.A.ctx.currentTime,.12,{ft:'lowpass',f:600,vol:.5});};
const click=hi=>{if(O.audio()&&(O.save.snd|0)>=1)O.tone(hi?1760:1320,O.A.ctx.currentTime,.03,{vol:.07,lp:6000});};

/* ---------- on-screen piano (one octave). Keys are the children of .chs so the shared test loop can press children[ans]. ---------- */
function keyboard(lo,names,onKey){const kb=h('div','chs mkb');const whites=[];for(let m=lo;m<=lo+12;m++)if(SC.includes((m-lo)%12))whites.push(m);
  whites.forEach(m=>{const k=h('button','mw',names?`<span>${SOL[SC.indexOf((m-lo)%12)]}</span>`:'');k.dataset.m=m;k.onclick=()=>onKey(m,k);kb.appendChild(k);});
  whites.forEach((m,wi)=>{if(wi===whites.length-1||[4,11].includes((m-lo)%12))return;const k=h('button','mbk','');k.dataset.m=m+1;k.style.left=`calc(${(wi+1)/whites.length*100}% - 3.4%)`;k.onclick=()=>onKey(m+1,k);kb.appendChild(k);});
  kb.idx=m=>[...kb.children].findIndex(k=>+k.dataset.m===m);return kb;}
const flash=(k,c)=>{k.classList.remove('ok','bad');void k.offsetWidth;k.classList.add(c);setTimeout(()=>k.classList.remove(c),D(500));};

/* ---------- one runner for all four activities ---------- */
let CUR=null;
function lesson(key,qs,back){const [id,title,max]=ACTS[key];const lvl=ST()[key];let i=0,err=0,gems=0,items=0;qs.forEach(q=>{items+=q.items||1;});
  O.setScreen('sTal','final',back);const s=$('#sTal');s.innerHTML='';const wrap=h('div','tq m2');s.appendChild(wrap);
  if(key==='rhy'&&window.LESSONS)s.appendChild(window.LESSONS.againBtn(rhyLessons(),back,()=>rhyRun(back)));
  const show=()=>{const q=qs[i];T.hudT(title,T.progressBar(i,qs.length));wrap.innerHTML='';T.setKey(null);CUR=KIND[q.k](q,wrap,done);};
  function done(e,first,el){err+=e;const g=first?2:e>=2&&!el?0:1;if(g){gems+=g;O.addGems(g,el||wrap);O.floatText(el||wrap,'+'+g);}
    setTimeout(()=>{if(!wrap.isConnected)return;i++;if(i<qs.length)show();else finish();},D(e>=2?2200:1300));}
  function finish(){CUR=null;T.setKey(null);const st=err<=Math.max(1,items*.1)?3:err<=Math.max(3,items*.3)?2:1;const up=st>=2&&lvl<max;const m2=ST();if(up)m2[key]=lvl+1;
    const bonus=5+st*2;O.addGems(bonus);T.record(id,st);
    T.result({title:{read:'קוֹרֵא תָּוִים אַלּוּף!',ear:'אֹזֶן מְצֻיֶּנֶת!',rhy:'מְתוֹפֵף אַלּוּף!',mel:'נִגַּנְתָּ מֵהַתָּוִים!'}[key],sub:up?`עָלִיתָ לְשָׁלָב ${lvl+1}!`:st>=2&&lvl===max?'סִיַּמְתָּ אֶת כָּל הַשְּׁלָבִים!':'',stars:st,gems:gems+bonus,back,again:()=>START[key](back)});}
  window.__quiz={get ans(){return CUR&&CUR.ans?CUR.ans():undefined;},get i(){return i;},get wrap(){return wrap;}};
  show();}

/* question kinds: each draws itself into wrap and calls done(errors, firstTry, element) once */
const KIND={
  choice(q,wrap,done){let tries=0,lock=false;const card=h('div','prq tqc',q.pr);
    if(q.play){const pb=h('button','hintbtn',ICON.say+`<span>${q.playLbl||'הַשְׁמַע'}</span>`);pb.onclick=q.play;card.appendChild(pb);}
    wrap.appendChild(card);O.sayNow=q.say||T.plainHe(q.pr);if(T.rdQ&&!q.play)T.rdQ(q,card);
    const row=h('div','chs'+(q.opts.length===4?' g4':''));q.opts.forEach((op,k)=>{const b=h('button','chb tx '+(q.cls||''),op);b.onclick=()=>pickA(k,b);row.appendChild(b);});wrap.appendChild(row);
    if(q.play&&q.auto)setTimeout(()=>{if(card.isConnected)q.play();},D(400));
    function pickA(k,b){if(lock||b.disabled)return;
      if(k===q.ans){if(T.rdA&&!q.play)T.rdA(q,tries,b);lock=true;b.classList.add('ok');sfx.ok(tries);if(q.after)q.after();done(tries,!tries,b);return;}
      tries++;b.classList.add('bad');b.disabled=true;sfx.no();
      if(tries>=2||q.opts.length<=2){lock=true;row.children[q.ans].classList.add('show');if(q.after)q.after();done(Math.max(tries,2),false,null);}}
    return {ans:()=>q.ans,solve:()=>row.children[q.ans].click()};},
  /* see the note -> press it on the piano */
  piano(q,wrap,done){let tries=0,lock=false;const card=h('div','prq tqc',`${staffSVG([{i:q.i,d:'q'}],{clef:q.clef,minW:200})}<div class="qq">נַגֵּן אֶת הַתָּו הַזֶּה בַּפְּסַנְתֵּר.</div>`);wrap.appendChild(card);O.sayNow='נגן את התו הזה בפסנתר.';
    const target=midiOf(q.i);const kb=keyboard(q.clef==='bass'?48:60,q.names,(m,k)=>{play(m);if(lock)return;
      if(m===target){lock=true;flash(k,'ok');sfx.ok(tries);done(tries,!tries,k);return;}
      tries++;flash(k,'bad');if(tries>=2){lock=true;const c=kb.children[kb.idx(target)];c.classList.add('show');setTimeout(()=>play(target),D(500));done(2,false,null);}});
    wrap.appendChild(kb);keyMap(kb);return {ans:()=>kb.idx(target),solve:()=>kb.children[kb.idx(target)].click()};},
  /* a short melody on the staff, played note by note */
  melody(q,wrap,done){const notes=parseMel(q.song);let pos=0,err=0,miss=0,lock=false;
    const card=h('div','prq tqc m2mel');wrap.appendChild(card);
    const per=innerWidth<700?2:4;   /* bars per line: big enough to read on a phone */
    const draw=()=>{const rows=[];let row=[],bars=0;notes.forEach((n,j)=>{row.push(Object.assign({},n,{k:j,col:j<pos?'#2e8b3e':j===pos&&!lock?'#2f7fc0':null,cls:j===pos&&!lock?'cur':''}));if(n.bar){bars++;if(bars%per===0){rows.push(row);row=[];}}});if(row.length)rows.push(row);
      const svg=(r,ri,minW)=>staffSVG(r.map((n,j)=>Object.assign({},n,{bar:j<r.length-1?n.bar:0})),{time:ri===0,end:ri===rows.length-1,minW,fill:1});
      const maxW=Math.max(...rows.map((r,ri)=>+svg(r,ri).match(/data-w="([\d.]+)"/)[1]));
      card.innerHTML=rows.map((r,ri)=>svg(r,ri,maxW)).join('')+`<div class="qq">נַגֵּן אֶת הַתָּוִים לְפִי הַסֵּדֶר, מִשְּׂמֹאל לְיָמִין ➡️</div>`;};
    draw();O.sayNow='נגן את התווים לפי הסדר, משמאל לימין.';
    const kb=keyboard(60,q.names,(m,k)=>{play(m,.45);if(lock)return;const t=midiOf(notes[pos].i);
      if(m===t){flash(k,'ok');pos++;miss=0;kb.querySelectorAll('.show').forEach(x=>x.classList.remove('show'));
        if(pos>=notes.length){lock=true;draw();sfx.ok(2);let t0=.5;notes.forEach(n=>{play(midiOf(n.i),.4*BEATS[n.d],.8,t0);t0+=.42*BEATS[n.d];});done(err,!err,k);return;}draw();return;}
      err++;miss++;flash(k,'bad');if(miss>=2)kb.children[kb.idx(t)].classList.add('show');});
    wrap.appendChild(kb);keyMap(kb);
    return {ans:()=>pos<notes.length?kb.idx(midiOf(notes[pos].i)):undefined,solve:()=>{while(!lock)kb.children[kb.idx(midiOf(notes[pos].i))].click();}};},
  /* listen to the rhythm, then tap it on the drum */
  tap(q,wrap,done){const pat=q.pat,on=onsets(pat);let tries=0,taps=[],t0=0,phase='idle';const beat=60/72*1000;
    const notes=pat.map((d,j)=>({i:0,d,k:j,beam:d==='e'?(on[j]%1===0&&pat[j+1]==='e'?'s':on[j]%1?'e':0):0}));
    const card=h('div','prq tqc',`${staffSVG(notes,{one:true,time:true,end:true,cls:'m2rhy'})}<div class="qq">לְחַץ "הַתְחֵל". קֹדֶם תִּשְׁמַע אֶת הַקֶּצֶב, אַחַר כָּךְ תּוֹפֵף אוֹתוֹ.</div>`);
    const msg=h('div','lcap m2msg','');const dr=h('button','drum m2drum','🥁');const go=h('button','bigbtn',ICON.play+'<span>הַתְחֵל</span>');
    wrap.append(card,msg,dr,go);O.sayNow='לחץ התחל. קודם תשמע את הקצב, אחר כך תופף אותו.';
    const lit=j=>{const g=card.querySelector(`.m2n[data-k="${j}"]`);if(g){g.classList.add('now');setTimeout(()=>g.classList.remove('now'),D(beat*BEATS[pat[j]]*.8));}};
    const hit=()=>{dr.classList.remove('hit');void dr.offsetWidth;dr.classList.add('hit');drum();if(phase==='tap')taps.push(performance.now());};
    dr.onclick=hit;T.setKey(e=>{if(e.code==='Space'||e.key===' '){e.preventDefault();hit();}});
    const later=(f,ms)=>setTimeout(()=>{if(wrap.isConnected)f();},D(ms));
    const judge=()=>{phase='idle';const tol=window.__fast?60:200;const used=new Set();let hits=0;
      on.forEach(o=>{const at=t0+o*D(beat);const k=taps.findIndex((t,j)=>!used.has(j)&&Math.abs(t-at)<tol);if(k>=0){used.add(k);hits++;}});
      const extra=taps.length-used.size;return hits===on.length&&extra===0;};
    const finishTry=good=>{if(good){msg.textContent='מְעֻלֶּה! בְּדִיּוּק בַּקֶּצֶב.';sfx.ok(1);done(tries,!tries,dr);return;}
      tries++;sfx.no();if(tries>=2){msg.textContent='לֹא נוֹרָא, נַמְשִׁיךְ.';done(2,false,null);return;}msg.textContent='כִּמְעַט! נַסֵּה שׁוּב.';go.disabled=false;};
    go.onclick=()=>{go.disabled=true;phase='demo';msg.textContent='הַקְשֵׁב...';
      on.forEach((o,j)=>later(()=>{lit(j);drum();},o*beat));
      for(let k=0;k<4;k++)later(()=>{click(k===0);msg.textContent=String(k+1);},(4+k)*beat+beat);
      later(()=>{phase='tap';taps=[];t0=performance.now();msg.textContent='עַכְשָׁו אַתָּה!';on.forEach((o,j)=>later(()=>lit(j),o*beat));},9*beat);
      later(()=>finishTry(judge()),9*beat+4.6*beat);};
    return {pat,solve:()=>{phase='idle';finishTry(true);}};}};
/* computer keyboard: A S D F G H J K = white keys from the lowest */
function keyMap(kb){const ws=[...kb.querySelectorAll('.mw')];T.setKey(e=>{const k='ASDFGHJK'.indexOf((e.code||'').replace('Key',''));if(k>=0&&ws[k]&&!e.repeat){e.preventDefault();ws[k].click();}});}

/* ---------- question sets per level ---------- */
const noteBtn=(i,clef)=>`<span class="m2opt">${staffSVG([{i,d:'q'}],{clef,minW:120,cls:'mini'})}<b>${nameOf(i)}</b></span>`;
function readQs(){const L=READ[ST().read-1];const qs=[];let last=null;
  for(let n=0;n<8;n++){let i;do i=pick(L.pool);while(i===last&&L.pool.length>1);last=i;
    if(n%2===0){const right=nameOf(i);const names=[...new Set(L.pool.map(nameOf))].filter(x=>x!==right);const opts=shuffle([right,...shuffle(names).slice(0,L.opts-1)]);
      qs.push({k:'choice',pr:`${staffSVG([{i,d:'q'}],{clef:L.clef,minW:200})}<div class="qq">אֵיזֶה תָּו זֶה?</div>`,opts,ans:opts.indexOf(right),after:()=>play(midiOf(i)),key:'r'+n});}
    else qs.push({k:'piano',i,clef:L.clef,names:L.names});}
  return qs;}
function earQs(){const kind=EAR[ST().ear-1];const qs=[];
  for(let n=0;n<8;n++){
    if(kind==='hl-big'||kind==='hl-small'){const a=rand(60,67);const b=a+(Math.random()<.5?-1:1)*(kind==='hl-big'?rand(7,12):rand(2,4));const opts=['גָּבוֹהַּ יוֹתֵר ⬆️','נָמוּךְ יוֹתֵר ⬇️'];
      qs.push({k:'choice',pr:`<div class="m2ear">🎵 🎵</div><div class="qq">הַקְשֵׁב לִשְׁנֵי צְלִילִים. הַשֵּׁנִי גָּבוֹהַּ יוֹתֵר אוֹ נָמוּךְ יוֹתֵר?</div>`,opts,ans:b>a?0:1,play:()=>{play(a,.6);play(b,.6,1,.8);},auto:1,playLbl:'שׁוּב',say:'הקשב לשני צלילים. השני גבוה יותר או נמוך יותר?',a,b});}
    else if(kind==='same'){const a=rand(60,69);const same=n%2===0?Math.random()<.5:Math.random()<.5;const b=same?a:a+(Math.random()<.5?-1:1)*rand(2,5);const opts=['אוֹתוֹ צְלִיל','צְלִיל אַחֵר'];
      qs.push({k:'choice',pr:`<div class="m2ear">🎵 🎵</div><div class="qq">הַקְשֵׁב לִשְׁנֵי צְלִילִים. אוֹתוֹ צְלִיל אוֹ צְלִיל אַחֵר?</div>`,opts,ans:same?0:1,play:()=>{play(a,.6);play(b,.6,1,.8);},auto:1,playLbl:'שׁוּב',say:'הקשב לשני צלילים. אותו צליל או צליל אחר?',a,b});}
    else{const pool=kind==='which2'?[0,4]:[0,2,4];const x=pick(pool);const opts=pool.map(i=>noteBtn(i));
      qs.push({k:'choice',pr:`<div class="m2ear">🎹</div><div class="qq">קֹדֶם דּוֹ, וְאַחֲרָיו תָּו סוֹדִי. אֵיזֶה תָּו הוּא?</div>`,opts,ans:pool.indexOf(x),cls:'m2pic',play:()=>{play(60,.6);play(midiOf(x),.7,1,1.1);},auto:1,playLbl:'שׁוּב',say:'קודם דו, ואחריו תו סודי. איזה תו הוא?',a:60,b:midiOf(x)});}}
  return qs;}
function rhyQs(){const L=RHY[ST().rhy-1];const qs=[];
  for(let n=0;n<L.nq;n++){const v=L.vals[n%L.vals.length];const byBeats=n>=L.vals.length;const opts=shuffle(L.vals.map(x=>byBeats?VALB[x]:VALN[x]));const right=byBeats?VALB[v]:VALN[v];
    qs.push({k:'choice',pr:`${staffSVG([{i:0,d:v}],{one:true,minW:160})}<div class="qq">${byBeats?'כַּמָּה פְּעָמוֹת נִמְשָׁךְ הַתָּו הַזֶּה?':'אֵיזֶה תָּו זֶה?'}</div>`,opts,ans:opts.indexOf(right),cls:byBeats?'m2num':'',key:'v'+n});}
  shuffle(L.pats.slice()).slice(0,8-L.nq).forEach(p=>qs.push({k:'tap',pat:p}));
  return qs;}
function melQs(){const L=MEL[ST().mel-1];return L.songs.map(song=>({k:'melody',song,names:L.names,items:parseMel(song).length}));}
/* lesson cards before the first rhythm questions (#56): note lengths; eighths get their own lesson when they first appear */
const LN=window.LESSONS;
/* after the line is read: the note sounds for its length while one dot per beat lights up */
const beats=card=>{const ds=[...card.querySelectorAll('.lcbeats i')];const q=D(600);play(60,ds.length*.6*.95);
  ds.forEach((x,k)=>setTimeout(()=>{if(!card.isConnected)return;ds.forEach(y=>y.classList.remove('on'));x.classList.add('on');click(k===0);},k*q));
  setTimeout(()=>ds.forEach(y=>y.classList.remove('on')),ds.length*q+D(300));};
const lenCard=(d,t)=>({art:()=>`${staffSVG([{i:0,d}],{one:true,minW:160})}<div class="lcbeats">${'<i></i>'.repeat(BEATS[d])}</div>`,t,after:beats});
if(LN){LN.add('mus-len',{title:'כַּמָּה זְמַן נִמְשָׁךְ תָּו?',bg:'final',cards:[
    lenCard('w','זֶה תָּו שָׁלֵם: עִגּוּל רֵיק, בְּלִי מַקֵּל. הוּא אָרֹךְ: נִמְשָׁךְ אַרְבַּע פְּעָמוֹת.'),
    lenCard('h','זֶה תָּו חֲצִי: עִגּוּל רֵיק עִם מַקֵּל. הוּא נִמְשָׁךְ שְׁתֵּי פְּעָמוֹת.'),
    lenCard('q','זֶה תָּו רֶבַע: עִגּוּל מָלֵא עִם מַקֵּל. הוּא קָצָר: נִמְשָׁךְ פְּעָמָה אַחַת.')]});
  LN.add('mus-len8',{title:'תָּו חָדָשׁ: שְׁמִינִית',bg:'final',cards:[
    {art:()=>staffSVG([{i:0,d:'e'}],{one:true,minW:160}),t:'זוֹ שְׁמִינִית: עִגּוּל מָלֵא, מַקֵּל וְדֶגֶל. הִיא מְהִירָה: נִמְשֶׁכֶת חֲצִי פְּעָמָה.'},
    {art:()=>`<div class="lcrow">${staffSVG([{i:0,d:'e',beam:'s'},{i:0,d:'e',beam:'e'}],{one:true,minW:160})}<span class="lcarr">=</span>${staffSVG([{i:0,d:'q'}],{one:true,minW:160})}</div>`,t:'שְׁתֵּי שְׁמִינִיּוֹת יַחַד נִמְשָׁכוֹת כְּמוֹ רֶבַע אֶחָד.'}]});}
const rhyLessons=()=>['mus-len',...(RHY[ST().rhy-1].vals.includes('e')?['mus-len8']:[])];
const rhyRun=back=>lesson('rhy',rhyQs(),back);
const START={read:back=>lesson('read',readQs(),back),ear:back=>lesson('ear',earQs(),back),rhy:back=>LN?LN.first(rhyLessons(),back,()=>rhyRun(back)):rhyRun(back),mel:back=>lesson('mel',melQs(),back)};

/* ---------- registration + parent info ---------- */
const ICONS={read:()=>staffSVG([{i:4,d:'q'}],{minW:96,cls:'mini'}),ear:()=>'<span style="font-size:34px">👂</span>',rhy:()=>staffSVG([{i:0,d:'e',beam:'s'},{i:0,d:'e',beam:'e'},{i:0,d:'q'}],{one:true,cls:'mini'}),mel:()=>staffSVG([{i:0,d:'q'},{i:2,d:'q'},{i:4,d:'q'}],{cls:'mini'})};
const actList=()=>Object.keys(ACTS).map(k=>({id:ACTS[k][0],name:ACTS[k][1],icon:ICONS[k],run:START[k],avail:k==='mel'?()=>((T.S().tl['mus2-read']||{}).s|0)>0:undefined}));
const SKILLS={'קריאת תווים':['mus2-read','mus2-melody'],'שמיעה':['mus2-ear'],'קצב':['mus2-rhythm']};
let reg=false;
/* the new activities replace the hall's older note-name / note-length / ear quizzes (they stay in T.ACT, so old records still count) */
const RETIRE=['mus-notes','mus-dur','mus-ear'];
function register(building){if(reg)return;reg=true;const acts=actList();const hall=T.BUILD.find(b=>b.id==='music');
  if(hall){hall.acts=hall.acts.filter(a=>!RETIRE.includes(a.id));const add=acts.filter(a=>!T.ACT[a.id]);hall.acts.unshift(...add);add.forEach(a=>{T.ACT[a.id]=a;a.b=hall;});}
  else (building||T.building)({id:'music',name:'אוּלַם הַמּוּזִיקָה',color:'#b8860b',bg:'final',icon:()=>T.X.note,acts});}
/* for the parent panel: one row per skill (plain text, no nikud) */
function skills(){const tl=T.S().tl,m2=ST();const lv={'קריאת תווים':m2.read,'שמיעה':m2.ear,'קצב':m2.rhy};
  return Object.entries(SKILLS).map(([name,ids])=>({name,ids,stars:ids.reduce((a,id)=>a+((tl[id]||{}).s|0),0),max:ids.length*3,plays:ids.reduce((a,id)=>a+((tl[id]||{}).n|0),0),level:lv[name]}));}
Object.assign(window.MUSIC2,{register,skills,SKILLS,START,ST,READ,EAR,RHY,MEL,play,
  setLevel:(k,n)=>{ST()[k]=n;O.persist();},solve:()=>CUR&&CUR.solve&&CUR.solve()});
Object.defineProperty(window.MUSIC2,'cur',{get:()=>CUR});
})();
