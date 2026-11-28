/* ===== THE BAG (#664): 12 artifacts Oren wins and uses (injected into index.html by build) =====
   Design: oren2/docs/bag-artifacts.md. Won at the end of the daily path (one per two ship pieces, in order); one tap in the bag
   uses it: a visible effect on home for the rest of the day + the friend says it. No currency.
   save.bag = {h:[ids won], fx:{id,d}}; old or broken saves = an empty bag.
   BAG.award()    the next artifact for this finale (needs ship pieces: held < ceil(n/2)), or null
   BAG.cardHTML/newSay  the finale card's surprise
   BAG.mount(s)   home: the bag button (once he has one) + today's effect
   BAG.open()     the bag screen;  BAG.use(id)  use it;  BAG.says() every kid sentence (pregen) */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$}=O;
const B=window.BAG={};
/* id, emoji, name, how it moves, particle emoji (default = the emoji), spoken effect line */
B.ARTS=[
 {id:'lamp',e:'🏮',n:'פָּנָס קֶסֶם',m:'glow',t:'הַבַּיִת מֵאִיר בְּאוֹר חַם!'},
 {id:'rainbow',e:'🌈',n:'קֶשֶׁת',m:'big',t:'קֶשֶׁת גְּדוֹלָה בַּשָּׁמַיִם!'},
 {id:'balloon',e:'🎈',n:'בָּלוֹנִים',m:'rise',t:'בָּלוֹנִים עוֹלִים לַשָּׁמַיִם!'},
 {id:'snow',e:'❄️',n:'כַּדּוּר שֶׁלֶג',m:'fall',t:'יוֹרֵד שֶׁלֶג רַךְ!'},
 {id:'butter',e:'🦋',n:'פַּרְפָּרִים',m:'drift',t:'פַּרְפָּרִים מְעַפְעֲפִים סְבִיבֵנוּ!'},
 {id:'fire',e:'🎆',n:'זִקּוּקִים',m:'pop',t:'בּוּם! זִקּוּקִים בַּשָּׁמַיִם!'},
 {id:'compass',e:'🧭',n:'מַצְפֵּן קֶסֶם',m:'pulse',t:'הַמַּצְפֵּן מַרְאֶה לָנוּ לְאָן לָלֶכֶת!'},
 {id:'bell',e:'🔔',n:'פַּעֲמוֹן',m:'rise',p:'🎵',t:'דִּינְג דּוֹנְג! צְלִילִים עוֹלִים!'},
 {id:'hat',e:'🎩',n:'כּוֹבַע קֶסֶם',m:'hop',t:'הוֹפּ! כֻּלָּנוּ קוֹפְצִים!'},
 {id:'bubble',e:'🫧',n:'בּוּעוֹת',m:'rise',t:'בּוּעוֹת עוֹלוֹת וְצָפוֹת!'},
 {id:'kite',e:'🪁',n:'עֲפִיפוֹן',m:'big',t:'הָעֲפִיפוֹן עָף לְאַט לְאַט!'},
 {id:'flower',e:'🌸',n:'פְּרָחִים',m:'fall',t:'פְּרָחִים יוֹרְדִים כְּמוֹ גֶּשֶׁם!'}];
const TITLE='הַתִּיק שֶׁלִּי',ASK='בְּחַר חֵפֶץ וְנִרְאֶה מָה הוּא עוֹשֶׂה!',LOCK='עוֹד לֹא מָצָאנוּ אֶת זֶה. נַמְשִׁיךְ בַּמַּסְלוּל!',NEW=n=>'חֵפֶץ חָדָשׁ בַּתִּיק: '+n+'!';
B.useSay=a=>a.n+'! '+a.t;
B.newSay=a=>a?NEW(a.n):'';
B.says=()=>[TITLE,ASK,LOCK,...B.ARTS.map(B.useSay),...B.ARTS.map(B.newSay)];
T.addSay&&T.addSay(B.says());T.addChoices&&T.addChoices(B.ARTS.map(a=>a.n));
const say=t=>{try{O.say(T.spk(t));}catch(e){}};
B.get=()=>{let s=O.save.bag;if(!s||typeof s!=='object'||Array.isArray(s))s=O.save.bag={h:[]};
  if(!Array.isArray(s.h))s.h=[];s.h=s.h.filter((id,i,a)=>B.ARTS.some(x=>x.id===id)&&a.indexOf(id)===i);
  if(s.fx&&(typeof s.fx!=='object'||!s.h.includes(s.fx.id)))delete s.fx;return s;};
B.art=id=>B.ARTS.find(x=>x.id===id);
B.fxNow=()=>{const s=B.get();return s.fx&&s.fx.d===O.today()?B.art(s.fx.id):null;};
/* won at the finale, after the ship piece: one artifact per two pieces, in order */
B.award=()=>{const s=B.get(),n=window.SHIP&&SHIP.get?SHIP.get().n:0;if(s.h.length>=B.ARTS.length||s.h.length>=Math.ceil(n/2))return null;
  const a=B.ARTS[s.h.length];s.h.push(a.id);O.persist();return a;};
B.cardHTML=a=>a?'<div class="bgnew"><span class="bgbox">🎁</span><span class="bgpop">'+a.e+'</span><b>'+NEW(a.n)+'</b></div>':'';
/* home: the effect of today (a layer over home that never takes a tap) and the bag button */
const rnd=(i,k)=>((i*37+k*53)%100);
function layer(a){const l=h('div','bgfx bgm-'+a.m);l.dataset.id=a.id;l.setAttribute('aria-hidden','true');
  const n={rise:9,fall:11,drift:7,pop:7,big:1,glow:0,pulse:0,hop:0}[a.m]||0;
  for(let i=0;i<n;i++){const p=h('span','bgp',a.p||a.e);p.style.cssText='--x:'+rnd(i,3)+'%;--y:'+(8+rnd(i,7)*.6)+'%;--d:'+(-(i*0.9)).toFixed(1)+'s;--s:'+(22+rnd(i,11)%18)+'px';l.appendChild(p);}
  return l;}
B.mount=s=>{const st=B.get();if(!st.h.length)return;
  const hr=s.querySelector('.hrow'),bt=h('button','bgbtn','🎒');bt.setAttribute('aria-label',TITLE);bt.onclick=e=>{e.stopPropagation();O.sfx&&O.sfx.pop&&O.sfx.pop(2);B.open();};
  (s.querySelector('.hstage')||s).appendChild(bt);
  const a=B.fxNow();if(!a)return;s.appendChild(layer(a));
  if(a.m==='hop'){const p=s.querySelector('.hpair');p&&p.classList.add('bghop');}
  if(a.m==='pulse')setTimeout(()=>{const g=s.querySelector('.bigbtn.huge');g&&g.classList.add('bgpulse');},0);};
/* use: one at a time, shown at once on home, spoken */
B.use=id=>{const a=B.art(id),s=B.get();if(!a||!s.h.includes(id))return false;s.fx={id,d:O.today()};O.persist();
  const ov=$('#ov');ov.hidden=true;ov.innerHTML='';O.showMap();O.sfx&&(a.id==='bell'?O.sfx.win&&O.sfx.win():O.sfx.star&&O.sfx.star(1));say(B.useSay(a));return true;};
B.open=()=>{const s=B.get(),ov=$('#ov');ov.hidden=false;ov.innerHTML='<div class="card bgcard"><h2>'+TITLE+'</h2></div>';const c=ov.firstChild,g=h('div','bgg');
  B.ARTS.forEach(a=>{const won=s.h.includes(a.id),b=h('button','bgs'+(won?' won':' lock'),won?'<span class="bge">'+a.e+'</span><b>'+a.n+'</b>':'<span class="bge">❔</span>');b.dataset.id=a.id;
    b.onclick=()=>{if(won){B.use(a.id);}else{O.sfx&&O.sfx.pop&&O.sfx.pop(1);say(LOCK);}};g.appendChild(b);});
  c.appendChild(g);const x=h('button','bgx','✕');x.setAttribute('aria-label','סגור');x.onclick=()=>{O.sfx&&O.sfx.pop&&O.sfx.pop(1);ov.hidden=true;ov.innerHTML='';};c.appendChild(x);
  say(TITLE+'. '+ASK);};
})();
