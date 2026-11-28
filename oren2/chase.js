/* ===== 🏃 ARCADE pack: catch the runner before the finish line (#665). One main action: tap / Space / click the big button to run ===== */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T||!T.arcReg)return;const {h}=O,sfx=O.sfx,D=O.D;const K=T.arcKit;
const RULE='תְּפֹס אֶת הָרַצָּץ לִפְנֵי קַו הַסִּיּוּם! לְחַץ עַל "רוּץ!" שׁוּב וָשׁוּב.';
T.addSay&&T.addSay([RULE,'תְּפַסְתָּ אוֹתוֹ!','הוּא הִגִּיעַ לַסִּיּוּם. עוֹד פַּעַם!']);T.addChoices&&T.addChoices(['תְּפֹס אֶת הָרַצָּץ']);
const R=3,STEP=.03;
function chase(){const F=K.frame('chase');const t=K.tune('chase');let k=0,caught=0,me=0,rn=0,alive=true,running=false,last=0;
  F.field.classList.add('trk');
  const man=cls=>h('div','run '+cls,'<i class="rh"></i><i class="rb"></i><i class="rl a"></i><i class="rl b"></i>');
  const road=h('div','road','<span class="fl">🏁</span>');const you=man('me'),him=man('him');road.append(him,you);
  const go=h('button','bigbtn gold rungo','🏃 <span>רוּץ!</span>');const msg=h('div','kmsg','');F.field.append(road,msg,go);
  const put=()=>{you.style.left=(me*86)+'%';him.style.left=(rn*86)+'%';};
  const round=()=>{me=0;rn=t.chGap;put();msg.textContent='';msg.className='kmsg';running=true;last=performance.now();F.time(`🏃 ${k+1}/${R}`);F.rule('🏃 תְּפֹס אֶת הָרַצָּץ לִפְנֵי קַו הַסִּיּוּם!',RULE);requestAnimationFrame(loop);};
  function step(){if(!running||!alive)return;me=Math.min(1,me+STEP);you.classList.toggle('s2');sfx.pop(2);put();check();}
  function check(){if(!running)return;if(me>=rn){running=false;caught++;F.score(caught);msg.textContent='תְּפַסְתָּ אוֹתוֹ! 🎉';msg.className='kmsg win';sfx.win();next();}
    else if(rn>=1){running=false;msg.textContent='הוּא הִגִּיעַ לַסִּיּוּם. עוֹד פַּעַם!';sfx.no();next();}}
  const next=()=>setTimeout(()=>{if(!alive||!road.isConnected)return;k++;if(k>=R)done();else round();},D(1300));
  const loop=now=>{if(!alive||!road.isConnected){alive=false;return;}if(!running)return;if(O.paused){last=now;requestAnimationFrame(loop);return;}const dt=Math.min(50,now-last);last=now;rn=Math.min(1,rn+dt*(1-t.chGap)/D(t.chT));him.classList.toggle('s2',Math.floor(now/160)%2===0);put();check();if(running)requestAnimationFrame(loop);};
  go.onpointerdown=e=>{e.preventDefault();step();};go.onclick=e=>{if(e.detail===0)step();};/* keyboard Enter on the button */
  T.setKey(e=>{if(e.key===' '||e.key==='Enter'||e.key.startsWith('Arrow')){e.preventDefault();step();}});
  function done(){if(!alive)return;alive=false;running=false;const st=caught>=3?3:caught>=2?2:1;K.finish('chase',caught,st,` מִתּוֹךְ ${R}`);}
  K.setCur({stop:()=>{alive=false;running=false;},finish:sc=>{if(sc!=null)caught=sc;done();},hit:()=>{step();},get score(){return caught;}});
  F.rule('🏃 תְּפֹס אֶת הָרַצָּץ לִפְנֵי קַו הַסִּיּוּם!',RULE);K.countdown(F,round);}
T.arcReg({id:'chase',n:'תְּפֹס אֶת הָרַצָּץ',e:'🏃',c:'#ff5a5f',d:'רָצִים לַסִּיּוּם'},chase);
})();
