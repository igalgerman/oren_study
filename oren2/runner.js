/* ===== 🏃 ARCADE RUNNER (#666): jump the rocks, duck the branches, collect stars. Calm speed (#351). Pack file: registers into the arcade. ===== */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T||!T.arcAdd)return;const {h,$}=O;const sfx=O.sfx,D=O.D;
const GAME={id:'runner',n:'רִיצָה',e:'🏃',c:'#ff7a59',d:'קוֹפְצִים וְאוֹסְפִים'};
const RULE='🏃 קְפֹץ מֵעַל הָאֲבָנִים, הִתְכּוֹפֵף מִתַּחַת לַעֲנָפִים, וַאֲסֹף כּוֹכָבִים!';
const SAY='קְפֹץ מֵעַל הָאֲבָנִים, הִתְכּוֹפֵף מִתַּחַת לַעֲנָפִים, וַאֲסֹף כּוֹכָבִים';
T.addChoices&&T.addChoices([GAME.n]);T.addSay&&T.addSay([SAY+'.']);   /* #266 for pregen */
const PX=.18,ROUND=36000,JUMP=760,DUCK=650;   /* player x (fraction of the width), round ms, jump ms, duck ms */
function run(){const K=T.arcKit,F=K.frame('runner');const t=K.tune('runner');
  const SPEED=.2*(1+t.lv*.07);   /* field widths per second: calm base, the level (0..4) is the hard cap (#351) */
  const GAPMS=2300-t.lv*80;
  F.field.classList.add('runf');
  const me=h('div','rn-me','<i class="rh"></i><i class="rb"></i><i class="rl a"></i><i class="rl b"></i>');
  const ground=h('div','rn-ground');F.field.append(ground,me);
  const jb=h('button','bigbtn gold rn-j','⬆ <span>קְפֹץ</span>'),db=h('button','bigbtn rn-d','⬇ <span>הִתְכּוֹפֵף</span>');
  const pad=h('div','rn-pad');pad.append(jb,db);F.box.appendChild(pad);
  let alive=true,last=0,clock=0,spawn=700,stars=0,hits=0,jt=-1,dt_=-1,inv=0,items=[],seq=0;
  const hgt=()=>jt<0?0:Math.sin(Math.PI*jt/JUMP);   /* 0..1 */
  const jump=()=>{if(!alive||jt>=0)return;jt=0;dt_=-1;me.classList.remove('duck');sfx.jump?sfx.jump():sfx.pop(3);};
  const duck=()=>{if(!alive||jt>=0||dt_>=0)return;dt_=0;me.classList.add('duck');sfx.pop(1);};
  jb.onpointerdown=e=>{e.preventDefault();jump();};db.onpointerdown=e=>{e.preventDefault();duck();};
  F.field.onpointerdown=e=>{if(e.target.closest('.rn-pad'))return;e.preventDefault();jump();};
  T.setKey(e=>{if(e.key===' '||e.key==='ArrowUp'||e.key==='w'){e.preventDefault();jump();}else if(e.key==='ArrowDown'||e.key==='s'){e.preventDefault();duck();}});
  const add=(kind,y)=>{const el=h('div','rn-i '+kind+(y?' hi':''),kind==='star'?'⭐':'');F.field.appendChild(el);items.push({kind,y:y|0,x:1.08,el});};
  const make=()=>{seq++;const r=seq%4;   /* rock, stars, branch, stars: always fair and slow */
    if(r===1)add('rock');else if(r===3)add('bar');else{const hi=seq%8===2?1:0;for(let i=0;i<3;i++){add('star',hi);items[items.length-1].x+=i*.07;}}};
  const sync=()=>{me.style.bottom=`calc(18% + ${(hgt()*46).toFixed(1)}%)`;
    items.forEach(o=>{o.el.style.left=(o.x*100)+'%';});};
  const step=ms=>{clock+=ms;if(jt>=0){jt+=ms;if(jt>=JUMP)jt=-1;}if(dt_>=0){dt_+=ms;if(dt_>=DUCK){dt_=-1;me.classList.remove('duck');}}if(inv>0)inv-=ms;
    spawn-=ms;if(spawn<=0){make();spawn=GAMEMS();}
    items.forEach(o=>{o.x-=SPEED*ms/1000;});
    items=items.filter(o=>{if(o.dead)return false;const near=Math.abs(o.x-PX)<.045;
      if(near&&!o.done){const hh=hgt();
        if(o.kind==='star'&&((!o.y&&hh<.3)||(o.y&&hh>.4))){o.done=1;stars++;F.score(stars);sfx.pop(stars%8);o.el.classList.add('got');setTimeout(()=>o.el.remove(),D(250));return false;}
        if(o.kind==='rock'&&hh<.35&&inv<=0)bump(o);
        if(o.kind==='bar'&&dt_<0&&inv<=0)bump(o);}
      if(o.x<-.1){o.el.remove();return false;}return true;});
    sync();};
  const GAMEMS=()=>GAPMS;
  function bump(o){o.done=1;hits++;inv=1100;sfx.no();me.classList.add('oops');setTimeout(()=>me.classList.remove('oops'),D(500));}   /* calm: a stumble costs nothing but a moment */
  const loop=now=>{if(!alive||!F.field.isConnected){alive=false;return;}if(O.paused){last=now;requestAnimationFrame(loop);return;}
    const ms=Math.min(50,now-last)*(window.__fast?4:1);last=now;step(ms);F.time('⏱️ '+Math.max(0,Math.ceil((ROUND-clock)/1000)));if(clock>=ROUND){done();return;}requestAnimationFrame(loop);};
  function done(){if(!alive)return;alive=false;const st=stars>=9?3:stars>=5?2:1;K.finish('runner',stars,st);}
  /* test + no-hands helper: the next thing ahead is answered the right way */
  const hit=()=>{const o=items.filter(x=>!x.done&&x.x>PX&&x.x<PX+.2).sort((a,b)=>a.x-b.x)[0];if(!o)return;if(o.kind==='rock'&&o.x<PX+.12)jump();else if(o.kind==='bar'&&o.x<PX+.12)duck();else if(o.kind==='star'&&o.y&&o.x<PX+.1)jump();};
  K.setCur({stop:()=>{alive=false;},finish:sc=>{if(sc!=null)stars=sc;done();},hit,get score(){return stars;}});
  F.rule(RULE,SAY);sync();
  K.countdown(F,()=>{last=performance.now();requestAnimationFrame(loop);});
  window.__run={jump,duck,get state(){return {h:hgt(),jumping:jt>=0,ducking:dt_>=0,stars,hits,items:items.length,alive,clock,speed:SPEED};}};}
T.arcAdd(GAME,run);
})();
