/* ===== 🏒 AIR HOCKEY (#668): an arcade cabinet, own pack file. You against the computer, mouse / touch / arrow keys. Calm speed rules of #351 (tune().pk puck cap, tune().ai) ===== */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T||!T.arcPack)return;const {h}=O;const P=T.arcPack,sfx=O.sfx,D=O.D;
const RULE='הַזֵּז אֶת הַמַּחְבֵּט וְהַבְקַע שַׁעַר!';
T.addSay&&T.addSay([RULE]);
const GOALS=5,ROUND_MS=60000;
function hockey(){const F=P.frame('hockey');const cfg=P.tune('hockey');F.field.classList.add('hk');
  F.rule('🏒 '+RULE,RULE);
  const W=Math.max(200,Math.min(F.field.clientWidth||340,((F.field.clientHeight||440)*.66)|0)),Hh=Math.round(W/.66);
  const rink=h('div','rink','<i class="mid"></i><i class="ring"></i><i class="gate top"></i><i class="gate bot"></i>');rink.style.width=W+'px';rink.style.height=Hh+'px';
  const puckEl=h('div','puck'),me=h('div','mallet me'),cpu=h('div','mallet cpu');rink.append(puckEl,me,cpu);F.field.appendChild(rink);
  const rp=W*.045,rm=W*.075,GW=W*.4,CAPV=cfg.pk*W/1000;/* px per ms: the hard cap */
  puckEl.style.width=puckEl.style.height=rp*2+'px';me.style.width=me.style.height=cpu.style.width=cpu.style.height=rm*2+'px';
  let alive=true,pg=0,ag=0,end=0,last=0,hold=0;
  const puck={x:W/2,y:Hh/2,vx:0,vy:0},m={x:W/2,y:Hh*.85,px:W/2,py:Hh*.85,tx:W/2,ty:Hh*.85},c={x:W/2,y:Hh*.15,px:W/2,py:Hh*.15};
  const serve=dir=>{puck.x=W/2;puck.y=Hh/2;hold=700;puck.vy=dir*CAPV*.5;puck.vx=(Math.random()-.5)*CAPV*.3;};
  const goal=who=>{if(who==='me'){pg++;F.score(pg);sfx.ok(pg);O.floatText(rink,'+1');serve(1);}else{ag++;sfx.no();serve(-1);}F.time(pg+' : '+ag);if(pg>=GOALS||ag>=GOALS)done();};
  const clampMallet=(o,top)=>{o.x=Math.max(rm,Math.min(W-rm,o.x));o.y=top?Math.max(rm,Math.min(Hh/2-rm,o.y)):Math.max(Hh/2+rm,Math.min(Hh-rm,o.y));};
  const hit=(o,vx,vy)=>{const dx=puck.x-o.x,dy=puck.y-o.y,d=Math.hypot(dx,dy),min=rp+rm;if(d>=min||d===0)return;const nx=dx/d,ny=dy/d;puck.x=o.x+nx*min;puck.y=o.y+ny*min;
    const rel=(puck.vx-vx)*nx+(puck.vy-vy)*ny;if(rel<0){puck.vx-=2*rel*nx;puck.vy-=2*rel*ny;}puck.vx+=vx*.5;puck.vy+=vy*.5;sfx.pop(2);};
  const capSpeed=()=>{const v=Math.hypot(puck.vx,puck.vy);if(v>CAPV){puck.vx*=CAPV/v;puck.vy*=CAPV/v;}};
  const step=dt=>{
    /* the player's mallet follows the pointer, but never faster than the cap (calm) */
    const mx=m.tx-m.x,my=m.ty-m.y,md=Math.hypot(mx,my),mv=CAPV*1.5*dt;if(md>mv){m.x+=mx/md*mv;m.y+=my/md*mv;}else{m.x=m.tx;m.y=m.ty;}clampMallet(m,false);
    /* the computer: follows the puck's x slowly, goes back home when the puck is on our side */
    const aiv=cfg.ai*W/1000*dt,tx=puck.y<Hh/2?puck.x:W/2,ty=puck.y<Hh*.45&&puck.vy<=0.02*W?Math.max(rm,puck.y-rp*1.5):Hh*.15;
    c.x+=Math.max(-aiv,Math.min(aiv,tx-c.x));c.y+=Math.max(-aiv*.7,Math.min(aiv*.7,ty-c.y));clampMallet(c,true);
    if(hold>0){hold-=dt;}else{puck.x+=puck.vx*dt;puck.y+=puck.vy*dt;}
    puck.vx*=1-.0003*dt;puck.vy*=1-.0003*dt;
    hit(m,(m.x-m.px)/dt,(m.y-m.py)/dt);hit(c,(c.x-c.px)/dt,(c.y-c.py)/dt);m.px=m.x;m.py=m.y;c.px=c.x;c.py=c.y;
    if(puck.x<rp){puck.x=rp;puck.vx=Math.abs(puck.vx);}if(puck.x>W-rp){puck.x=W-rp;puck.vx=-Math.abs(puck.vx);}
    const inGate=Math.abs(puck.x-W/2)<GW/2;
    if(puck.y<rp){if(inGate&&puck.y<-rp){goal('me');return;}if(!inGate){puck.y=rp;puck.vy=Math.abs(puck.vy);}}
    if(puck.y>Hh-rp){if(inGate&&puck.y>Hh+rp){goal('cpu');return;}if(!inGate){puck.y=Hh-rp;puck.vy=-Math.abs(puck.vy);}}
    /* a puck that is too slow gets a gentle nudge, so a round never stalls */
    if(hold<=0&&Math.hypot(puck.vx,puck.vy)<CAPV*.08)puck.vy+=(puck.y<Hh/2?-1:1)*CAPV*.002*dt;
    capSpeed();};
  const draw=()=>{const put=(e,o,r)=>{e.style.transform=`translate(${o.x-r}px,${o.y-r}px)`;};put(puckEl,puck,rp);put(me,m,rm);put(cpu,c,rm);};
  const loop=now=>{if(!alive||!F.field.isConnected){alive=false;return;}if(O.paused){end+=now-last;last=now;requestAnimationFrame(loop);return;}
    let dt=Math.min(40,now-last);last=now;while(dt>0&&alive){const s=Math.min(8,dt);step(s);dt-=s;}draw();if(!alive)return;
    if(now>=end){done();return;}requestAnimationFrame(loop);};
  const to=e=>{const r=rink.getBoundingClientRect();if(!r.width)return;m.tx=(e.clientX-r.left)*W/r.width;m.ty=(e.clientY-r.top)*Hh/r.height;};
  rink.addEventListener('pointermove',to);rink.addEventListener('pointerdown',e=>{try{rink.setPointerCapture(e.pointerId);}catch(x){}to(e);});
  T.setKey(e=>{const st={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(st){e.preventDefault();m.tx=Math.max(0,Math.min(W,m.tx+st[0]*W*.12));m.ty=Math.max(Hh/2,Math.min(Hh,m.ty+st[1]*Hh*.12));}});
  function done(){if(!alive)return;alive=false;const st=pg>=GOALS&&ag<=2?3:pg>ag?2:1;P.finish('hockey',pg,st,` · ${pg}:${ag}`);}
  /* test hooks (like the other cabinets): hit = the puck rolls into the computer's goal */
  P.setCur({stop:()=>{alive=false;},finish:sc=>{if(sc!=null)pg=sc;done();},hit:()=>{if(!alive)return;hold=0;puck.x=W/2;puck.y=rp*2;puck.vx=0;puck.vy=-CAPV*.5;},get score(){return pg;},state:()=>({puck,m,c,W,Hh,CAPV,pg,ag}),step});
  draw();F.time('0 : 0');
  P.countdown(F,()=>{last=performance.now();end=last+D(ROUND_MS);serve(1);requestAnimationFrame(loop);});}
P.add({id:'hockey',n:'הוֹקִי אֲוִיר',e:'🏒',c:'#36e0d0',d:'מַבְקִיעִים שַׁעַר'},hockey);
})();
