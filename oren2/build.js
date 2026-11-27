/* ===== THE BUILDING WORLD (#64, spec: oren2/docs/building-world.md; injected into index.html by build) =====
   One free 8×8 block world on the kingdom screen: gems (💎) are the building material, stars (⭐) only unlock blocks and areas.
   Tap an empty cell = place the selected block (pay its gems); tap a filled cell = take it away (the gems come back).
   Sand, water and fish fall to the lowest empty cell; the sheep walks. Save: save.bw = {a:{area:{'x,y':id}}, seen:[...], first}.
   BW.render(scene) draws it (called by the core's kingdom()); BW.parentPic() = the parent day tab's picture; BW.speakList() for pregen. */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O)return;
const {h,$,sprite}=O;const sfx=O.sfx;const D=O.D||(x=>x);
const BW=window.BW={};
const N=8;
const say=t=>{try{O.say(T&&T.spk?T.spk(t):t);}catch(e){}};

/* ---------- original 16×16 pixel blocks (same px style as SPR) ---------- */
const hs=(x,y)=>(x*7+y*13+x*y*3)%11;
const gen=f=>Array.from({length:16},(_,y)=>Array.from({length:16},(_,x)=>f(x,y,hs(x,y))).join(''));
const tile=(f,pal)=>sprite(gen(f),pal,false);
const art=(rows,pal)=>sprite(rows,pal);
const WATER=(x,y,k)=>(y%5===1&&(x+y)%6<3)?'w':k%7===0?'d':'B';
const ART={
  grass:tile((x,y,k)=>y<3?(k%5===0?'g':'G'):y===3?((x%3===1)?'g':'D'):(k%7===0?'d':'D'),{G:'#5fb846',g:'#4a9c37',D:'#9a6a3f',d:'#7c5230'}),
  dirt:tile((x,y,k)=>k%6===0?'d':k===1&&y%3===0?'s':'D',{D:'#9a6a3f',d:'#7c5230',s:'#b5926c'}),
  wood:tile((x,y,k)=>y%4===3?'d':x===((y>>2)*5+3)%16?'d':k%9===0?'l':'W',{W:'#c68b4e',d:'#8a5a2e',l:'#dca468'}),
  stone:tile((x,y,k)=>y%4===0||x===(((y>>2)%2)?3:11)?'M':k%8===0?'s':'S',{S:'#9aa3ab',s:'#808a93',M:'#6b737b'}),
  flower:art(['.......','..PPP..','.PPYPP.','..PPP..','...G...','.LLG...','...GLL.','...G...'],{P:'#ff7eb6',Y:'#ffd166',G:'#3f8f3a',L:'#5fb846'}),
  leaves:tile((x,y,k)=>k%4===0?'l':k%5===0?'d':'L',{L:'#4fa83f',l:'#76c95e',d:'#2f7a2a'}),
  glass:tile((x,y)=>x===0||y===0||x===15||y===15?'F':(x+y===6||x+y===7||x+y===12)?'W':'g',{F:'#7fb3c9',g:'rgba(200,236,250,.55)',W:'#ffffff'}),
  door:tile((x,y)=>x<2||x>13||y<1?'F':(y===7||x===7||x===8)?'F':(x===11&&y===9)?'K':(y%3===0?'d':'W'),{F:'#6b4423',W:'#b07a45',d:'#94613a',K:'#ffd166'}),
  roof:tile((x,y)=>y%4===3?'d':(x+((y>>2)%2)*2)%4===0?'d':y%4===0?'r':'R',{R:'#d1493b',r:'#e87766',d:'#9c2f25'}),
  water:tile(WATER,{B:'#3a8fc4',d:'#2f7aac',w:'#9fd6f2'}),
  sand:tile((x,y,k)=>k%5===0?'s':k===3?'d':'S',{S:'#f0d58c',s:'#e2c070',d:'#c9a85a'}),
  sheep:art(['..WWWWWW....','.WWWWWWWW...','WWWWWWWWWKK.','WWWWWWWWKEKK','WWWWWWWWKKK.','.WWWWWWWW...','.K.K..K.K...','.K.K..K.K...'],{W:'#ffffff',K:'#3a3a44',E:'#ffffff'}),
  lamp:art(['..KKK..','.KYYYK.','.KYWYK.','.KYYYK.','..KKK..','...K...','...K...','...K...','..KKK..'],{K:'#3a3f47',Y:'#ffd166',W:'#fff6c8'}),
  fish:sprite(gen((x,y,k)=>{const fx=x-4,fy=y-6;if(fy>=0&&fy<4&&fx>=0&&fx<7)return (fx===1&&fy===1)?'E':'O';if(fx>=7&&fx<9&&fy>=-1&&fy<5&&Math.abs(fy-1.5)<=fx-6)return 'O';return WATER(x,y,k);}),{B:'#3a8fc4',d:'#2f7aac',w:'#9fd6f2',O:'#f28c28',E:'#1d2631'},false),
  bird:art(['...RR....','..RRRR...','.RRKRROO.','RRRRRR...','.RRRRR...','..RRR....','...O.O...'],{R:'#e4572e',K:'#1d2631',O:'#ffd166'}),
  gold:tile((x,y)=>x===0||y===0||x===15||y===15?'d':(x-y===3||x-y===4||x-y===-6)?'W':'Y',{Y:'#f2c230',d:'#b88a12',W:'#fff3b0'}),
  cloud:art(['....WWW.....','..WWWWWWW...','.WWWWWWWWWW.','WWWWWWWWWWWW','.WWWWWWWWWW.'],{W:'#ffffff'}),
  rainbow:sprite(gen((x,y)=>{const d=Math.hypot(x-7.5,y-15);return d>15?'.':d>12.5?'R':d>10?'O':d>7.5?'Y':d>5?'G':d>2.5?'B':'.';}),{R:'#e4572e',O:'#f28c28',Y:'#ffd166',G:'#5fb846',B:'#3a8fc4'}),
};
/* id, kid name (nikud), gem cost, star unlock, falls / walks */
const BLOCKS=[['grass','דֶּשֶׁא',1,0],['dirt','אֲדָמָה',1,0],['wood','עֵץ',2,0],['stone','אֶבֶן',2,0],['flower','פֶּרַח',2,3],['leaves','עָלִים',1,8],
  ['glass','זְכוּכִית',3,8],['door','דֶּלֶת',5,15],['roof','גַּג',3,15],['water','מַיִם',3,25,1],['sand','חוֹל',1,35,1],['sheep','כִּבְשָׂה',10,50,0,1],
  ['lamp','פָּנָס',4,70],['fish','דָּג',8,90,1],['bird','צִפּוֹר',8,90],['gold','זָהָב',20,120],['cloud','עָנָן',2,150],['rainbow','קֶשֶׁת',30,200]]
  .map(([id,n,c,u,fall,walk],i)=>({id,n,c,u,i,fall:!!fall,walk:!!walk,svg:ART[id]}));
const B=Object.fromEntries(BLOCKS.map(b=>[b.id,b]));
/* areas: starter ground (row 6, row 7) */
const AREAS=[{id:'meadow',n:'אָחוּ',in:'הָאָחוּ',u:0,g:['grass','dirt']},{id:'beach',n:'חוֹף',in:'הַחוֹף',u:35,g:['sand','sand']},{id:'sky',n:'שָׁמַיִם',in:'הַשָּׁמַיִם',u:150,g:[null,'cloud']}];
const AREA_ART={
  meadow:tile((x,y,k)=>y<10?(k===2&&y<4?'W':'S'):y<11?'G':y<13?(k%4===0?'g':'G'):'D',{S:'#bfe6f5',W:'#ffffff',G:'#5fb846',g:'#4a9c37',D:'#9a6a3f'}),
  beach:tile((x,y,k)=>(x-12)**2+(y-3)**2<5?'Y':y<7?'S':y<11?(y%2&&k%3===0?'w':'B'):k%5===0?'s':'A',{S:'#9fdcf5',Y:'#ffd166',B:'#3a8fc4',w:'#9fd6f2',A:'#f0d58c',s:'#e2c070'}),
  sky:tile((x,y,k)=>(x-4)**2+(y-4)**2<6?'M':(k===0&&y<10)?'*':y>12&&(x<6||x>9)?'C':'N',{N:'#3b3f8f',M:'#fff1a8','*':'#ffffff',C:'#f1f4ff'}),
};
/* the old shop's prices: old kingdom items are refunded once (#64 §10) */
const OLD={flower:5,tree:10,flag:8,lantern:12,sheep:15,pond:25,hut:30,tower:40,fountain:50,windmill:60,dragon:80,rainbow:100};

/* ---------- kid text (Hebrew with nikud; all of it in BW.speakList for the voice pregen) ---------- */
const HINT='👇 בְּחַר קֻבִּיָּה, וּלְחַץ עַל מָקוֹם רֵיק כְּדֵי לִבְנוֹת.';
const REMOVE='לְחִיצָה עַל קֻבִּיָּה מוֹרִידָה אוֹתָהּ, וְהַיַּהֲלוֹמִים חוֹזְרִים.';
const NOGEM='חֲסֵרִים יַהֲלוֹמִים. אֶפְשָׁר לְהַרְוִיחַ עוֹד בַּשְּׁלַבִּים!';
const FIRST='וַאוּ! בָּנִיתָ אֶת הַקֻּבִּיָּה הָרִאשׁוֹנָה!';
const NEXT=n=>n===1?'עוֹד כּוֹכָב אֶחָד לַקֻּבִּיָּה הַבָּאָה':`עוֹד ${n} כּוֹכָבִים לַקֻּבִּיָּה הַבָּאָה`;
const NEWB=b=>`כָּל הַכָּבוֹד! פָּתַחְתָּ קֻבִּיָּה חֲדָשָׁה: ${b.n}!`;
const NEWA=a=>`פָּתַחְתָּ מָקוֹם חָדָשׁ: ${a.in}!`;
const GO='הַמְשֵׁךְ';
BW.speakList=()=>{const gaps=new Set();const us=[...new Set(BLOCKS.map(b=>b.u))].sort((a,b)=>a-b);for(let i=1;i<us.length;i++)for(let n=1;n<=us[i]-us[i-1];n++)gaps.add(n);
  return [HINT.replace('👇 ',''),REMOVE,NOGEM,FIRST,...BLOCKS.map(b=>b.n),...AREAS.map(a=>a.n),...BLOCKS.filter(b=>b.u).map(NEWB),...AREAS.filter(a=>a.u).map(NEWA),...[...gaps].map(NEXT)];};
BW.BLOCKS=BLOCKS;BW.AREAS=AREAS;

/* ---------- save ---------- */
const S=()=>O.save;
const W=()=>{const s=S();if(!s.bw||typeof s.bw!=='object')s.bw={a:{},seen:[],first:0};const w=s.bw;w.a=w.a||{};w.seen=w.seen||[];return w;};
const starter=id=>{const a=AREAS.find(x=>x.id===id)||AREAS[0],m={};a.g.forEach((b,r)=>{if(b)for(let x=0;x<N;x++){if(id==='sky'&&(x===3||x===4))continue;m[x+','+(6+r)]=b;}});return m;};
const area=id=>{const w=W();if(!w.a[id]||typeof w.a[id]!=='object')w.a[id]=starter(id);return w.a[id];};
/* one time: the old kingdom items give their gems back, then the old list is cleared (he loses nothing) */
function migrate(){const s=S();if(s.bw)return;let g=0;for(const v of Object.values(s.k||{}))g+=OLD[v]|0;s.gems=(s.gems|0)+g;s.k={};W();area('meadow');O.persist();}
BW.migrate=migrate;
const allStars=()=>{let n=0;try{n=O.totalStars();}catch(e){}for(const v of Object.values(S().tl||{}))n+=(v&&v.s)|0;return n;};
BW.allStars=allStars;
const open=st=>AREAS.filter(a=>a.u<=st);

/* ---------- the screen ---------- */
let cur='meadow',sel=null,root=null,walkT=0;
const persist=()=>{try{O.persist();}catch(e){}};
BW.render=sc=>{migrate();const st=allStars();if(!open(st).find(a=>a.id===cur))cur='meadow';area(cur);
  O.sayNow=HINT.replace('👇 ','');root=h('div','bw');sc.appendChild(root);draw();
  clearInterval(walkT);walkT=setInterval(()=>{if(!root||!root.isConnected||$('#sKing').hidden){clearInterval(walkT);return;}BW.tick();},4000);
  const news=BLOCKS.filter(b=>b.u&&b.u<=st).concat(AREAS.filter(a=>a.u&&a.u<=st)).filter(x=>!W().seen.includes(x.id)).sort((a,b)=>a.u-b.u);
  if(news.length)setTimeout(()=>cards(news),0);};
function bar(st){return BLOCKS.filter(b=>b.u<=st).sort((a,b)=>b.u-a.u||a.i-b.i);}
function draw(drop){if(!root)return;const w=W(),st=allStars(),A=area(cur),ar=open(st),ai=ar.findIndex(a=>a.id===cur),list=bar(st);
  if(!sel||!list.find(b=>b.id===sel))sel=list[0].id;
  root.innerHTML='';const box=h('div','bwbox');const g=h('div','bwgrid bw-'+cur);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const id=A[x+','+y],c=h('button','bwc',id&&B[id]?B[id].svg:'');c.dataset.x=x;c.dataset.y=y;if(id)c.dataset.b=id;
    c.setAttribute('aria-label',id&&B[id]?B[id].n.replace(/[֑-ׇ]/g,''):'מקום ריק');c.onclick=()=>tap(x,y,c);g.appendChild(c);
    if(drop&&drop.x===x&&drop.y===y){c.style.setProperty('--d',drop.d);c.classList.add(drop.d?'drop':'new');}}
  const hero=h('div','bwhero',O.AV());g.appendChild(hero);box.appendChild(g);
  const arrow=(k,dir,cls)=>{const a=h('button','bwarr '+cls,dir);a.setAttribute('aria-label',ar[k].n.replace(/[֑-ׇ]/g,''));a.onclick=()=>{cur=ar[k].id;area(cur);persist();sfx.pop&&sfx.pop(2);say(ar[k].n);draw();};box.appendChild(a);return a;};
  if(ai<ar.length-1)arrow(ai+1,'◀','nx');if(ai>0)arrow(ai-1,'▶','pv');
  root.appendChild(box);
  if(!w.first)root.appendChild(h('div','lcap bwhint',HINT));
  const nx=BLOCKS.filter(b=>b.u>st).sort((a,b)=>a.u-b.u)[0];
  if(nx){const n=nx.u-st,l=h('button','bwnext',`<span class="bwsil">${nx.svg}</span><span>⭐ עוֹד ${n} לַקֻּבִּיָּה הַבָּאָה</span>`);l.onclick=()=>say(NEXT(n));root.appendChild(l);}
  const bb=h('div','bwbar');for(const b of list){const o=h('button','bwb'+(b.id===sel?' sel':''),`<span class="si">${b.svg}</span><span class="pr">💎${b.c}</span>`);o.dataset.b=b.id;
    o.setAttribute('aria-label',b.n.replace(/[֑-ׇ]/g,''));o.onclick=()=>{sel=b.id;sfx.pop&&sfx.pop(2);say(b.n);draw();};bb.appendChild(o);}
  root.appendChild(bb);const s=bb.querySelector('.sel');if(s&&s.scrollIntoView&&bb.scrollWidth>bb.clientWidth)try{s.scrollIntoView({block:'nearest',inline:'nearest'});}catch(e){}}
function tap(x,y,c){const w=W(),A=area(cur),k=x+','+y,id=A[k];
  if(id){delete A[k];const back=(B[id]||{c:0}).c;S().gems=(S().gems|0)+back;O.updateGems(true);sfx.pop&&sfx.pop(1);O.floatText(c,'+'+back);persist();draw();return;}
  const b=B[sel];if(!b)return;
  if((S().gems|0)<b.c){c.classList.remove('shake');void c.offsetWidth;c.classList.add('shake');sfx.no&&sfx.no();say(NOGEM);return;}
  let ty=y;if(b.fall)while(ty+1<N&&!A[x+','+(ty+1)])ty++;
  S().gems-=b.c;A[x+','+ty]=b.id;O.updateGems(true);sfx.buy&&sfx.buy();persist();
  const firstNow=!w.first;if(firstNow)w.first=1;
  draw({x,y:ty,d:ty-y});const nc=root.querySelector(`.bwc[data-x="${x}"][data-y="${ty}"]`);
  setTimeout(()=>{if(nc&&nc.isConnected)O.burst(...O.center(nc),b.fall?8:12);},D(b.fall&&ty>y?250:0));
  if(firstNow){say(FIRST);setTimeout(()=>{if(root&&root.isConnected)say(REMOVE);},D(2600));}}
/* the sheep: one step left or right onto an empty cell with a block under it (turns at walls) */
const dirs={};
BW.tick=()=>{const w=W();let moved=0;for(const [aid,A] of Object.entries(w.a)){for(const [k,id] of Object.entries(Object.assign({},A))){if(!B[id]||!B[id].walk)continue;
  const [x,y]=k.split(',').map(Number);let d=dirs[aid+k]||(Math.random()<.5?-1:1);
  const okAt=nx=>nx>=0&&nx<N&&!A[nx+','+y]&&(y+1>=N||!!A[nx+','+(y+1)]);
  if(!okAt(x+d))d=-d;if(!okAt(x+d))continue;delete A[k];const nk=(x+d)+','+y;A[nk]=id;dirs[aid+nk]=d;delete dirs[aid+k];moved=1;}}
  if(moved){persist();if(root&&root.isConnected&&!$('#sKing').hidden)draw();}};

/* ---------- unlock cards: one after another, the friend cheers, the newest block is selected ---------- */
function cards(list){const ov=$('#ov');let i=0;const friend=()=>{try{return T&&T.friend?T.friend():O.PET().s();}catch(e){return '';}};
  const next=()=>{if(i>=list.length){ov.hidden=true;ov.innerHTML='';const lb=list.filter(x=>B[x.id]).pop();if(lb)sel=lb.id;draw();const la=list.filter(x=>!B[x.id]).pop();
      if(la){const a=root&&root.querySelector('.bwarr.nx');if(a)a.classList.add('pulse');}return;}
    const x=list[i++],isB=!!B[x.id];W().seen.push(x.id);persist();
    const pic=isB?x.svg:AREA_ART[x.id],line=isB?NEWB(x):NEWA(x);
    ov.hidden=false;ov.innerHTML=`<div class="card bwcard" data-u="${x.id}"><div class="bwnew">${pic}</div><div class="bwfr">${friend()}</div><h2>${line}</h2></div>`;
    const b=h('button','bigbtn',(O.ICON&&O.ICON.play||'▶')+`<span>${GO}</span>`);b.onclick=()=>{sfx.pop&&sfx.pop(2);next();};ov.firstChild.appendChild(b);
    try{sfx.star&&sfx.star(2);O.rain();}catch(e){}say(line);};
  next();}

/* ---------- the parent day tab: one picture of what he built (no buttons, no counts) ---------- */
/* how many cells differ from the starter ground */
const diff=(A,id)=>{const s0=starter(id);let n=0;for(const k of new Set([...Object.keys(A||{}),...Object.keys(s0)]))if((A||{})[k]!==s0[k])n++;return n;};
BW.parentPic=()=>{const rs=O.realSave||O.save,w=rs&&rs.bw;if(!w||!w.a)return null;
  let best=null,bn=0;for(const id of Object.keys(w.a)){const n=diff(w.a[id],id);if(n>bn){bn=n;best=id;}}
  if(!best)return null;const A=w.a[best],bg={meadow:'#bfe6f5',beach:'#9fdcf5',sky:'#3b3f8f'}[best]||'#bfe6f5';
  const inner=Object.entries(A).filter(([,id])=>B[id]).map(([k,id])=>{const [x,y]=k.split(',').map(Number);return B[id].svg.replace('<svg ',`<svg x="${x*16}" y="${y*16}" width="16" height="16" `);}).join('');
  return h('div','bwpic',`<svg viewBox="0 0 128 128" role="img" aria-label="מה אורן בנה"><rect width="128" height="128" fill="${bg}"/>${inner}</svg><div class="bwcap">מה אורן בנה</div>`);};
})();
