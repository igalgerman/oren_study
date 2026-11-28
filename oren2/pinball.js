/* ===== 🎱 ARCADE: big-flipper pinball (#667): tap the left or right side (or ← →) to flip; 3 balls; calm speed + hard cap (#351) ===== */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T||!T.arcAdd)return;const {h}=O;const sfx=O.sfx,D=O.D;
const GM={id:'pinball',n:'פִּינְבּוֹל',e:'🎱',c:'#ff5a5a',d:'מַכִּים בַּכַּדּוּר בְּמַחְבְּטִים'};
const R=13,BR=30,TH=9,BALLS=3;
function pinball(){const K=T.arcKit,F=K.frame('pinball');const t=K.tune('pinball');let alive=true,last=0,score=0,balls=BALLS,end=0,hits=0;
  F.field.classList.add('pin');F.field.style.direction='ltr';
  const W=()=>F.field.clientWidth||360,H=()=>F.field.clientHeight||400;
  const ball=h('div','pball');const bumps=[[.3,.3],[.7,.3],[.5,.5]].map(([x,y])=>{const e=h('div','pbump','⭐');F.field.appendChild(e);return {e,x,y};});
  const fl=[{side:-1,th:.5,tgt:.5,e:h('i','pflip l')},{side:1,th:.5,tgt:.5,e:h('i','pflip r')}];
  F.field.append(ball,fl[0].e,fl[1].e);
  const zl=h('div','pzone l','<b>⬅️</b>'),zr=h('div','pzone r','<b>➡️</b>');F.field.append(zl,zr);
  F.rule('🎱 לְחַץ עַל הַצַּד הַשְּׂמָאלִי אוֹ הַיְּמָנִי כְּדֵי לְהַכּוֹת בַּכַּדּוּר!','לְחַץ עַל הַצַּד הַשְּׂמָאלִי אוֹ הַיְּמָנִי כְּדֵי לְהַכּוֹת בַּכַּדּוּר');
  let b={x:0,y:0,vx:0,vy:0};
  const launch=()=>{b={x:W()*(.35+Math.random()*.3),y:R+4,vx:(Math.random()<.5?-1:1)*.08,vy:0};F.time('🎱 '+balls);};
  const geo=()=>{const w=W(),hh=H(),L=Math.max(70,w*t.flip);return {w,hh,L,py:hh-46,px:[w*.17,w*.83]};};
  /* th: -.45 (up) .. +.5 (down); the same direction as the drawing: left flipper points right, right flipper points left */
  const dirOf=f=>({x:-f.side*Math.cos(f.th),y:Math.sin(f.th)});
  function flip(i){if(!alive)return;const f=fl[i];f.tgt=-.45;sfx.pop(3);setTimeout(()=>{f.tgt=.5;},200);}
  const side=e=>{const r=F.field.getBoundingClientRect();return e.clientX<r.left+r.width/2?0:1;};
  F.field.onpointerdown=e=>{e.preventDefault();flip(side(e));};
  T.setKey(e=>{if(e.key==='ArrowLeft'||e.key==='z'||e.key==='Z'){e.preventDefault();flip(0);}else if(e.key==='ArrowRight'||e.key==='/'||e.key==='m'||e.key==='M'){e.preventDefault();flip(1);}else if(e.key===' '||e.key==='Enter'){e.preventDefault();flip(0);flip(1);}});
  const cap=()=>{const s=Math.hypot(b.vx,b.vy);if(s>t.vmax){b.vx*=t.vmax/s;b.vy*=t.vmax/s;}};
  const push=(cx,cy,rad,e,kick)=>{let dx=b.x-cx,dy=b.y-cy,d=Math.hypot(dx,dy);if(d>=rad)return false;if(d<1e-6){dx=0;dy=-1;d=1;}const nx=dx/d,ny=dy/d;b.x=cx+nx*rad;b.y=cy+ny*rad;const vn=b.vx*nx+b.vy*ny;if(vn<0){b.vx-=(1+e)*vn*nx;b.vy-=(1+e)*vn*ny;}if(kick){b.vx+=nx*kick;b.vy+=ny*kick;}cap();return true;};
  function step(dt,g){b.vy+=t.grav*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;
    if(b.x<R){b.x=R;b.vx=Math.abs(b.vx)*.8;}if(b.x>g.w-R){b.x=g.w-R;b.vx=-Math.abs(b.vx)*.8;}if(b.y<R){b.y=R;b.vy=Math.abs(b.vy)*.8;}
    bumps.forEach(m=>{if(push(m.x*g.w,m.y*g.hh,BR+R,1,0)){const s=Math.hypot(b.vx,b.vy),mn=.16;if(s<mn){b.vx*=mn/s;b.vy*=mn/s;}score++;F.score(score);sfx.pop(score%8);m.e.classList.remove('hit');void m.e.offsetWidth;m.e.classList.add('hit');O.floatText&&O.floatText(m.e,'+1');}});
    fl.forEach((f,i)=>{const d=f.tgt-f.th,mv=Math.sign(d)*Math.min(Math.abs(d),.012*dt);f.th+=mv;const dr=dirOf(f),px=g.px[i],ex=px+dr.x*g.L,ey=g.py+dr.y*g.L;
      const sx=ex-px,sy=ey-g.py,u=Math.max(0,Math.min(1,((b.x-px)*sx+(b.y-g.py)*sy)/(g.L*g.L)));
      if(push(px+sx*u,g.py+sy*u,R+TH,.5,mv<0?.3+.25*u:0)&&mv<0){score++;F.score(score);}});}
  function loop(now){if(!alive||!F.field.isConnected){alive=false;return;}if(O.paused){end+=now-last;last=now;requestAnimationFrame(loop);return;}
    const dt=Math.min(33,now-last);last=now;const g=geo();for(let k=0;k<3;k++)step(dt/3,g);
    ball.style.transform=`translate(${b.x-R}px,${b.y-R}px)`;
    fl.forEach((f,i)=>{f.e.style.cssText=`left:${g.px[i]}px;top:${g.py}px;width:${g.L}px;transform:rotate(${f.side<0?f.th:Math.PI-f.th}rad)`;});
    bumps.forEach(m=>{m.e.style.left=(m.x*g.w-BR)+'px';m.e.style.top=(m.y*g.hh-BR)+'px';});
    if(b.y>g.hh+R){balls--;sfx.no();if(balls<=0){done();return;}launch();}
    if(now>=end){done();return;}requestAnimationFrame(loop);}
  function done(){if(!alive)return;alive=false;const st=score>=12?3:score>=6?2:1;K.finish('pinball',score,st);}
  K.setCur({stop:()=>{alive=false;},finish:sc=>{if(sc!=null)score=sc;done();},hit:()=>{flip(0);flip(1);},setBall:(x,y,vx,vy)=>{b={x,y,vx,vy};},get ball(){return b;},geo,get score(){return score;},get balls(){return balls;}});
  K.countdown(F,()=>{launch();last=performance.now();end=last+D(75000);requestAnimationFrame(loop);});}
T.arcAdd(GM,pinball);T.addSay&&T.addSay(['לְחַץ עַל הַצַּד הַשְּׂמָאלִי אוֹ הַיְּמָנִי כְּדֵי לְהַכּוֹת בַּכַּדּוּר.']);
})();
