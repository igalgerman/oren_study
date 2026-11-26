/* ===== AGAIN (#39): one big button on home → one list of big tiles: what Oren did and what he closed by mistake.
   Read from the day log (save.alog[day].e, kept 14 days, family-merged): newest first, one block per day with a picture,
   each thing once a day. Tap a tile: it opens again. No typing, no search, no voice. ===== */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;
const A=window.AGAIN={};const h=O.h,$=O.$;
const pad=n=>String(n).padStart(2,'0');
const dstr=x=>x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate());
const WD=['יוֹם רִאשׁוֹן','יוֹם שֵׁנִי','יוֹם שְׁלִישִׁי','יוֹם רְבִיעִי','יוֹם חֲמִישִׁי','יוֹם שִׁשִּׁי','שַׁבָּת'];
const ago=n=>{const x=new Date();x.setDate(x.getDate()-n);return dstr(x);};
function dayHead(d){if(d===ago(0))return ['☀️','הַיּוֹם'];if(d===ago(1))return ['🌙','אֶתְמוֹל'];return ['📅',WD[new Date(d+'T12:00').getDay()]];}
/* what a log id opens; null when it is gone or turned off */
function target(id){
  if(/^lv:/.test(id)){const lv=O.ALLLV.find(l=>l.id===id.slice(3));const off=(T.S().set.offW||{});if(!lv||off[lv.w.id])return null;
    return {ic:lv.w.icon(),n:lv.u.name,c:lv.w.color,run:()=>O.startLevel(lv)};}
  const a=T.ACT[id];if(!a||!T.dailyPool().includes(id))return null;return {ic:a.icon(),n:a.name,c:a.b.color,run:()=>a.run(O.showMap)};}
/* [[day, [ids newest first]], ...] newest day first */
function list(){const log=O.save.alog||{};return Object.keys(log).sort().reverse().map(d=>{const e=(log[d]||{}).e||[];const seen=new Set(),ids=[];
    e.map((x,i)=>[x,i]).filter(([x])=>x&&x[6]!=='s').sort((p,q)=>(q[0][0]-p[0][0])||(q[1]-p[1])).forEach(([x])=>{const id=x[1];if(seen.has(id)||!target(id))return;seen.add(id);ids.push(id);});
    return [d,ids];}).filter(([,ids])=>ids.length);}
A.list=list;
A.button=s=>{if(!list().length)return;const b=h('button','againbtn','<span class="agic">🔁</span><b>עוֹד פַּעַם</b>');b.onclick=()=>{O.sfx.pop(2);open();};
  (s.querySelector('.dpick')||s.appendChild(h('div','dpick'))).appendChild(b);};
function open(){O.setScreen('sTal','meadow',O.showMap);O.hud('');O.sayNow='';const s=$('#sTal');s.innerHTML='';
  s.appendChild(h('div','whead','<span class="gd">🔁</span><h1>עוֹד פַּעַם</h1>'));const box=h('div','again');
  list().forEach(([d,ids])=>{const [pic,t]=dayHead(d);const day=h('div','agday',`<div class="aghead"><span class="agpic">${pic}</span><b class="agt">${t}</b></div>`);const g=h('div','dall');
    ids.forEach(id=>{const x=target(id);const b=h('button','dcard agtile',`<span class="dic">${x.ic}</span><b>${x.n}</b>`);b.dataset.id=id;b.style.setProperty('--dc',x.c);b.onclick=()=>{O.sfx.pop(3);x.run();};g.appendChild(b);});
    day.appendChild(g);box.appendChild(day);});
  s.appendChild(box);}
A.open=open;
})();
