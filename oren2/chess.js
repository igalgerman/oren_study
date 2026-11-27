/* ===== CHESS CLUB: מוֹעֲדוֹן הַשַּׁחְמָט =====
   Gradual: the board and the pieces -> how each piece moves (one at a time) -> what can you capture ->
   check and escaping it -> mate in one -> a small game against a very gentle computer.
   The rules engine (full legal moves: castling, en passant, promotion) is pure and is tested with perft. */
(()=>{'use strict';
/* ---------- rules engine ---------- */
const FILES='abcdefgh';
const sqName=s=>FILES[s&7]+((s>>3)+1);
const sqOf=n=>FILES.indexOf(n[0])+8*(+n[1]-1);
const isW=p=>p>='A'&&p<='Z';
const side=p=>!p?null:isW(p)?'w':'b';
const at=(f,r)=>f>=0&&f<8&&r>=0&&r<8?r*8+f:-1;
const KN=[[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
const KG=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
const RD=[[1,0],[-1,0],[0,1],[0,-1]],BD=[[1,1],[1,-1],[-1,1],[-1,-1]];
function fromFEN(fen){const [bd,t,c,ep]=fen.trim().split(/\s+/);const b=Array(64).fill('');let r=7,f=0;
  for(const ch of bd){if(ch==='/'){r--;f=0;}else if(/\d/.test(ch))f+=+ch;else{b[r*8+f]=ch;f++;}}
  return {b,t:t||'w',c:c&&c!=='-'?c:'',ep:ep&&ep!=='-'?sqOf(ep):-1};}
function toFEN(p){let s='';for(let r=7;r>=0;r--){let e=0;for(let f=0;f<8;f++){const x=p.b[r*8+f];if(!x)e++;else{if(e)s+=e;e=0;s+=x;}}if(e)s+=e;if(r)s+='/';}
  return `${s} ${p.t} ${p.c||'-'} ${p.ep>=0?sqName(p.ep):'-'}`;}
/* is square s attacked by colour `by`? */
function attacked(b,s,by){const f=s&7,r=s>>3,w=by==='w';
  const pr=w?r-1:r+1,P=w?'P':'p';for(const df of[-1,1]){const q=at(f+df,pr);if(q>=0&&b[q]===P)return true;}
  const N=w?'N':'n',K=w?'K':'k';for(const[df,dr]of KN){const q=at(f+df,r+dr);if(q>=0&&b[q]===N)return true;}
  for(const[df,dr]of KG){const q=at(f+df,r+dr);if(q>=0&&b[q]===K)return true;}
  const R=w?'R':'r',B=w?'B':'b',Q=w?'Q':'q';
  for(const[dirs,A]of[[RD,R],[BD,B]])for(const[df,dr]of dirs){let x=f+df,y=r+dr;while(x>=0&&x<8&&y>=0&&y<8){const p=b[y*8+x];if(p){if(p===A||p===Q)return true;break;}x+=df;y+=dr;}}
  return false;}
const kingSq=(b,c)=>b.indexOf(c==='w'?'K':'k');
const inCheck=(p,c=p.t)=>{const k=kingSq(p.b,c);return k>=0&&attacked(p.b,k,c==='w'?'b':'w');};
function pseudo(p,only){const out=[],b=p.b,me=p.t,op=me==='w'?'b':'w';
  for(let s=0;s<64;s++){const pc=b[s];if(!pc||side(pc)!==me||(only!=null&&s!==only))continue;const f=s&7,r=s>>3,u=pc.toUpperCase();
    const add=(t,x)=>out.push(Object.assign({f:s,t,pc,cap:b[t]||''},x||{}));
    if(u==='P'){const dir=me==='w'?1:-1,start=me==='w'?1:6,last=me==='w'?7:0;
      const push=(t,x)=>{if((t>>3)===last)for(const q of'QRBN')add(t,Object.assign({pr:me==='w'?q:q.toLowerCase()},x));else add(t,x);};
      const one=at(f,r+dir);if(one>=0&&!b[one]){push(one);const two=at(f,r+2*dir);if(r===start&&!b[two])add(two,{dbl:1});}
      for(const df of[-1,1]){const t=at(f+df,r+dir);if(t<0)continue;if(b[t]&&side(b[t])===op)push(t);else if(t===p.ep&&!b[t])add(t,{ep:1,cap:op==='w'?'P':'p'});}}
    else if(u==='N'||u==='K'){for(const[df,dr]of(u==='N'?KN:KG)){const t=at(f+df,r+dr);if(t>=0&&side(b[t])!==me)add(t);}
      if(u==='K'){const c=p.c||'';const home=me==='w'?4:60,R=me==='w'?'R':'r';
        if(s===home&&!attacked(b,home,op)){
          if(c.includes(me==='w'?'K':'k')&&!b[home+1]&&!b[home+2]&&b[home+3]===R&&!attacked(b,home+1,op)&&!attacked(b,home+2,op))add(home+2,{cs:'K'});
          if(c.includes(me==='w'?'Q':'q')&&!b[home-1]&&!b[home-2]&&!b[home-3]&&b[home-4]===R&&!attacked(b,home-1,op)&&!attacked(b,home-2,op))add(home-2,{cs:'Q'});}}}
    else{const dirs=u==='R'?RD:u==='B'?BD:RD.concat(BD);
      for(const[df,dr]of dirs){let x=f+df,y=r+dr;while(x>=0&&x<8&&y>=0&&y<8){const t=y*8+x;if(b[t]){if(side(b[t])===op)add(t);break;}add(t);x+=df;y+=dr;}}}}
  return out;}
const RIGHTS={0:'Q',7:'K',4:'KQ',56:'q',63:'k',60:'kq'};
function make(p,m){const b=p.b.slice();b[m.t]=m.pr||m.pc;b[m.f]='';
  if(m.ep)b[m.t+(p.t==='w'?-8:8)]='';
  if(m.cs){const home=p.t==='w'?4:60;if(m.cs==='K'){b[home+1]=b[home+3];b[home+3]='';}else{b[home-1]=b[home-4];b[home-4]='';}}
  let c=p.c||'';for(const s of[m.f,m.t])if(RIGHTS[s])for(const ch of RIGHTS[s])c=c.replace(ch,'');
  return {b,t:p.t==='w'?'b':'w',c,ep:m.dbl?(m.f+m.t)/2:-1,ply:(p.ply|0)+1};}
const legal=(p,only)=>pseudo(p,only).filter(m=>!inCheck(make(p,m),p.t));
function status(p){const ms=legal(p);if(!ms.length)return inCheck(p)?'mate':'stale';return inCheck(p)?'check':'';}
function perft(p,d){if(d===0)return 1;const ms=legal(p);if(d===1)return ms.length;let n=0;for(const m of ms)n+=perft(make(p,m),d-1);return n;}
const mates=p=>legal(p).filter(m=>status(make(p,m))==='mate');
const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
/* hand-made mate-in-one puzzles (white to move), easy -> harder; verified by the tests */
const PUZ=['6k1/5ppp/8/8/8/8/8/R5K1 w - -','6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - -','3k4/8/3K4/8/8/8/8/7R w - -','k7/7R/8/8/8/8/8/6RK w - -',
  '4k3/8/4K3/8/8/8/8/7Q w - -','k7/8/1K6/8/8/8/7Q/8 w - -','6rk/6pp/8/6N1/8/8/8/6K1 w - -','7k/8/6K1/8/8/8/8/1Q6 w - -'];
const ENG={fromFEN,toFEN,attacked,inCheck,pseudo,legal,make,status,perft,mates,sqName,sqOf,START,PUZ};
if(typeof module!=='undefined'&&module.exports){module.exports=ENG;}
if(typeof window==='undefined')return;
window.CHESS={ENG};
const O=window.OREN,T=window.TAL;if(!O||!T)return;
const {h,$,pick,shuffle,ICON}=O;const sfx=O.sfx,D=O.D;

/* ---------- original piece art (simple shapes) ---------- */
const SHAPE={
  P:'<circle cx="50" cy="30" r="13"/><path d="M38 45 H62 L68 77 H32 Z"/><rect x="24" y="76" width="52" height="12" rx="4"/>',
  R:'<path d="M24 88 H76 V77 H69 L65 44 H72 V20 H62 V29 H55 V20 H45 V29 H38 V20 H28 V44 H35 L31 77 H24 Z"/>',
  B:'<circle cx="50" cy="15" r="6"/><path d="M50 23 C30 38 32 60 39 70 H61 C68 60 70 38 50 23 Z"/><path class="dt" d="M57 37 L45 52" fill="none"/><rect x="34" y="70" width="32" height="7" rx="2"/><rect x="24" y="77" width="52" height="11" rx="4"/>',
  N:'<path d="M30 88 H74 C74 66 72 48 64 37 C59 28 52 22 45 19 L44 10 L37 19 C29 25 21 37 19 47 C17 54 22 59 29 56 L39 50 C41 57 34 65 30 74 Z"/><circle class="dt" cx="40" cy="31" r="3"/><rect x="24" y="78" width="56" height="10" rx="4"/>',
  Q:'<path d="M26 75 L19 33 L32 57 L35 25 L44 54 L50 19 L56 54 L65 25 L68 57 L81 33 L74 75 Z"/><circle cx="19" cy="31" r="5"/><circle cx="35" cy="23" r="5"/><circle cx="50" cy="16" r="5"/><circle cx="65" cy="23" r="5"/><circle cx="81" cy="31" r="5"/><rect x="22" y="75" width="56" height="13" rx="4"/>',
  K:'<path d="M46 8 H54 V17 H63 V25 H54 V33 H46 V25 H37 V17 H46 Z"/><path d="M28 75 C17 58 22 39 37 41 C44 42 48 47 50 53 C52 47 56 42 63 41 C78 39 83 58 72 75 Z"/><path d="M44 47 C44 38 56 38 56 47" /><rect x="24" y="75" width="52" height="13" rx="4"/>'};
const piece=pc=>{const w=isW(pc),u=pc.toUpperCase();return `<svg class="czp ${w?'w':'b'}" viewBox="0 0 100 100" aria-hidden="true"><g fill="${w?'#fff8ea':'#2f3640'}" stroke="${w?'#2b2b2b':'#0f1416'}" stroke-width="4" stroke-linejoin="round">${SHAPE[u].replace(/class="dt"/g,`stroke="${w?'#2b2b2b':'#c9d1d9'}" fill="${w?'#2b2b2b':'#c9d1d9'}"`)}</g></svg>`;};
/* names: [indefinite, definite, feminine] */
const NM={K:['מֶלֶךְ','הַמֶּלֶךְ',0],Q:['מַלְכָּה','הַמַּלְכָּה',1],R:['צְרִיחַ','הַצְּרִיחַ',0],B:['רָץ','הָרָץ',0],N:['פָּרָשׁ','הַפָּרָשׁ',0],P:['רַגְלִי','הָרַגְלִי',0]};
const COL={w:[['לָבָן','לְבָנָה'],['הַלָּבָן','הַלְּבָנָה']],b:[['שָׁחֹר','שְׁחֹרָה'],['הַשָּׁחֹר','הַשְּׁחֹרָה']]};
const ORDER=['R','B','Q','K','N','P'];
const RULE={R:'הַצְּרִיחַ הוֹלֵךְ יָשָׁר: קָדִימָה, אָחוֹרָה וְלַצְּדָדִים, כַּמָּה מִשְׁבָּצוֹת שֶׁהוּא רוֹצֶה.',
  B:'הָרָץ הוֹלֵךְ בַּאֲלַכְסוֹן, כַּמָּה מִשְׁבָּצוֹת שֶׁהוּא רוֹצֶה. הוּא תָּמִיד נִשְׁאָר עַל אוֹתוֹ צֶבַע.',
  Q:'הַמַּלְכָּה הֲכִי חֲזָקָה! הִיא הוֹלֶכֶת יָשָׁר וְגַם בַּאֲלַכְסוֹן, כַּמָּה מִשְׁבָּצוֹת שֶׁהִיא רוֹצָה.',
  K:'הַמֶּלֶךְ הוֹלֵךְ רַק מִשְׁבֶּצֶת אַחַת, לְכָל כִּוּוּן. צָרִיךְ לִשְׁמֹר עָלָיו!',
  N:'הַפָּרָשׁ קוֹפֵץ: שְׁתַּיִם יָשָׁר וְאַחַת הַצִּדָּה, כְּמוֹ הָאוֹת ר. הוּא יָכוֹל לִקְפֹּץ מֵעַל כֵּלִים.',
  P:'הָרַגְלִי הוֹלֵךְ קָדִימָה מִשְׁבֶּצֶת אַחַת. בַּצַּעַד הָרִאשׁוֹן שֶׁלּוֹ מֻתָּר לוֹ שְׁתַּיִם. הוּא אוֹכֵל בַּאֲלַכְסוֹן, קָדִימָה.'};

/* ---------- the board ---------- */
function boardEl(onTap){const el=h('div','czb');for(let row=0;row<8;row++)for(let col=0;col<8;col++){const s=(7-row)*8+col;const c=h('div','cq '+((row+col)%2?'dk':'lt'));c.dataset.s=s;el.appendChild(c);}
  el.onclick=e=>{const c=e.target.closest('.cq');if(c&&onTap)onTap(+c.dataset.s,c);};return el;}
/* mk: {dots:Set, caps:Set, good:Set, sel, chk, last:[from,to], hint} */
function paint(el,b,mk={}){el.querySelectorAll('.cq').forEach(c=>{const s=+c.dataset.s,pc=b[s];
  c.className='cq '+(c.classList.contains('dk')?'dk':'lt')+(mk.sel===s?' sel':'')+(mk.chk===s?' chk':'')+(mk.last&&mk.last.includes(s)?' last':'')+(mk.good&&mk.good.has(s)?' good':'')+(mk.hint===s?' hint':'');
  c.innerHTML=(pc?piece(pc):'')+((mk.dots&&mk.dots.has(s))?`<i class="${pc?'ring':'dot'}"></i>`:'');});}
const flashSq=(el,s,cls='bad')=>{const c=el.querySelector(`.cq[data-s="${s}"]`);if(!c)return;c.classList.remove(cls);void c.offsetWidth;c.classList.add(cls);setTimeout(()=>c.classList.remove(cls),D(600));};
const say=t=>{O.sayNow=T.spk?T.spk(t):t;};

/* ---------- state ---------- */
const ST=()=>{const s=T.S();s.cz=s.cz||{mv:0,mate:1};return s.cz;};
const stars=id=>((T.S().tl[id]||{}).s|0);

/* ---------- a short lesson = a few tasks; each task calls done(errors) once ---------- */
let CUR=null;
function lesson(id,title,tasks,back,opts={}){let i=0,err=0,gems=0;O.setScreen('sTal','valley',back);const s=$('#sTal');s.innerHTML='';const wrap=h('div','tq cz');s.appendChild(wrap);
  const show=()=>{T.hudT(title,T.progressBar(i,tasks.length));wrap.innerHTML='';CUR=tasks[i](wrap,done);};
  function done(e,el){err+=e;const g=e?(e>=2?0:1):2;if(g){gems+=g;O.addGems(g,el||wrap);O.floatText(el||wrap,'+'+g);}
    setTimeout(()=>{if(!wrap.isConnected)return;i++;if(i<tasks.length)show();else finish();},D(e>=2?2200:1400));}
  function finish(){CUR=null;const n=tasks.length;const st=err<=Math.max(1,n*.1)?3:err<=Math.max(3,n*.3)?2:1;const bonus=5+st*2;O.addGems(bonus);
    const sub=opts.onEnd?opts.onEnd(st)||'':'';T.record(id,st);T.result({title:opts.done||'כָּל הַכָּבוֹד!',sub,stars:st,gems:gems+bonus,back,again:opts.again});}
  window.__quiz={get ans(){return CUR&&CUR.ans?CUR.ans():undefined;},get i(){return i;},get wrap(){return wrap;}};
  show();}
const prompt=(wrap,html,sub)=>{const c=h('div','prq tqc czq',`<div class="qq">${html}</div>${sub?`<div class="czsub">${sub}</div>`:''}`);wrap.appendChild(c);say(html+(sub?' '+sub:''));return c;};
const note=(wrap)=>{const n=h('div','lcap czmsg','');wrap.appendChild(n);return n;};
/* multiple choice (same look as the game's quizzes; .chs children so the shared test loop can answer) */
/* #54 hp = {clue, explain} for the one help button: tap 1 = clue (or wrong options go away), tap 2 = the answer; after(card,quiet) */
function choiceTask(pr,opts,ans,after,hp={}){return (wrap,done)=>{let tries=0,lock=false;const card=h('div','prq tqc',pr);wrap.appendChild(card);say(T.plainHe(pr));if(T.rdQ)T.rdQ({pr},card);
  const row=h('div','chs');opts.forEach((op,k)=>{const b=h('button','chb tx',op);b.onclick=()=>{if(lock||b.disabled)return;
    if(k===ans){lock=true;b.classList.add('ok');sfx.ok(tries);if(after)after(card);done(Math.max(tries,HB&&HB.step?1:0),b);return;}
    tries++;b.disabled=true;b.classList.add('bad');sfx.no();if(tries>=2||opts.length<=2){if(HB&&HB.el.isConnected)return HB.answer();lock=true;row.children[ans].classList.add('show');if(after)after(card);done(2,null);}};row.appendChild(b);});
  wrap.appendChild(row);
  const HB=window.HELP&&HELP.mc?HELP.mc(wrap,{row,ans,clue:hp.clue,explain:hp.explain,reveal:()=>{if(lock)return;lock=true;if(after)after(card,true);done(2,null);}}):null;
  return {ans:()=>ans,solve:()=>row.children[ans].click()};};}

/* #54 the one help button on a board: clue() marks the piece and returns the text, answer() shows the move and ends the task */
const boardHelp=(wrap,o)=>{const a=window.HELP&&HELP.button?HELP.button(wrap,{clue:o.clue,answer:o.answer}):null;if(a)a.wrong=o.wrong;return a;};
/* after a wrong try: the 2nd one offers the help by itself, the last one shows the answer */
const helpAfter=(hb,errs,max,end)=>{if(errs>=max){if(hb&&hb.el.isConnected)hb.answer();else end();}else if(errs===2&&hb)hb.offer();};
const helped=hb=>hb&&hb.step?1:0;
/* how each piece looks (a clue for finding it) */
const LOOKS={K:'לַמֶּלֶךְ יֵשׁ צְלָב קָטָן לְמַעְלָה.',Q:'לַמַּלְכָּה יֵשׁ כֶּתֶר עִם כַּדּוּרִים קְטַנִּים.',R:'הַצְּרִיחַ נִרְאֶה כְּמוֹ מִגְדָּל.',B:'לָרָץ יֵשׁ כּוֹבַע מְחֻדָּד.',
  N:'הַפָּרָשׁ נִרְאֶה כְּמוֹ רֹאשׁ שֶׁל סוּס.',P:'הָרַגְלִי הוּא הַכְּלִי הַקָּטָן, וְיֵשׁ הַרְבֵּה כְּמוֹתוֹ.'};

/* random helpers */
const empty=()=>Array(64).fill('');
const freeSq=(b,ok=()=>true)=>{const c=[];for(let s=0;s<64;s++)if(!b[s]&&ok(s))c.push(s);return pick(c);};
const posOf=(b,t='w')=>({b,t,c:'',ep:-1});
const reach=(b,s)=>new Set(legal(posOf(b,side(b[s])),s).map(m=>m.t));
const mid=s=>(s>>3)>0&&(s>>3)<7;   /* pawns never stand on the first or last rank */
const near=(a,b)=>Math.max(Math.abs((a&7)-(b&7)),Math.abs((a>>3)-(b>>3)));

/* ---------- 1. the board and the pieces ---------- */
function nameTask(u){const opts=shuffle([u,...shuffle(ORDER.filter(x=>x!==u)).slice(0,2)]);
  return choiceTask(`<div class="czbig">${piece(Math.random()<.5?u:u.toLowerCase())}</div><div class="qq">אֵיזֶה כְּלִי זֶה?</div>`,opts.map(x=>NM[x][0]),opts.indexOf(u),null,{explain:LOOKS[u]});}
function findTask(pc){return (wrap,done)=>{const u=pc.toUpperCase(),c=side(pc),[ind,def,fem]=NM[u];const uniq=u==='K'||u==='Q';
  const txt=uniq?`אֵיפֹה ${def} ${COL[c][1][fem]}? גַּע ${fem?'בָּהּ':'בּוֹ'}.`:`אֵיפֹה יֵשׁ ${ind} ${COL[c][0][fem]}? גַּע בּוֹ.`;
  prompt(wrap,txt);const b=fromFEN(START).b;let tries=0,lock=false;
  const end=()=>{if(lock)return;lock=true;paint(el,b,{good:new Set(b.map((x,k)=>x===pc?k:-1).filter(k=>k>=0))});done(2,null);};
  const miss=s=>{tries++;sfx.no();flashSq(el,s);helpAfter(hb,tries,3,end);};
  const el=boardEl((s)=>{if(lock)return;if(b[s]===pc){lock=true;paint(el,b,{good:new Set([s])});sfx.ok(tries);done(Math.max(tries,helped(hb)),el.querySelector(`[data-s="${s}"]`));return;}miss(s);});
  paint(el,b);wrap.appendChild(el);
  const hb=boardHelp(wrap,{clue:()=>`${c==='w'?'הַכֵּלִים הַלְּבָנִים לְמַטָּה.':'הַכֵּלִים הַשְּׁחֹרִים לְמַעְלָה.'} ${LOOKS[u]}`,
    answer:()=>{end();return `הִנֵּה ${def} ${COL[c][1][fem]}, בַּמִּשְׁבֶּצֶת הַיְּרֻקָּה. ${LOOKS[u]}`;},wrong:()=>{if(!lock)miss(b.findIndex(x=>x!==pc));}});
  return {solve:()=>el.querySelector(`[data-s="${b.indexOf(pc)}"]`).click()};};}
function runBoard(back){const kinds=shuffle(ORDER.slice()).slice(0,3);const finds=shuffle(['K','Q','R','B','N','P','k','q','r','n']).slice(0,3);   /* #59: 6 short tasks */
  const tasks=[];for(let k=0;k<3;k++){tasks.push(nameTask(kinds[k]));tasks.push(findTask(finds[k]));}
  lesson('chess-board','הַלּוּחַ וְהַכֵּלִים',tasks,back,{done:'מַכִּיר אֶת הַכֵּלִים!',again:()=>runBoard(back)});}

/* ---------- 2. how each piece moves: tap every square it can reach ---------- */
function moveBoard(u,k){const b=empty();const W=u;let s;
  if(u==='P'){s=k===0?at(pick([1,2,3,4,5,6]),1):k===1?at(pick([1,2,3,4,5,6]),pick([2,3,4])):at(pick([1,2,3,4,5,6]),pick([1,2,3]));}
  else s=k===1?pick([0,7,56,63,3,24,39,60]):at(pick([2,3,4,5]),pick([2,3,4,5]));
  b[s]=W;const others=sq=>sq!==s;
  if(k>=2){ /* own pieces block the way; later also black pieces to capture */
    const r=[...reach(b,s)];const block=u==='K'||u==='N'?1:2;
    for(let j=0;j<block&&r.length;j++){const t=r.splice(Math.floor(Math.random()*r.length),1)[0];b[t]=mid(t)?pick(['P','N','B']):pick(['N','B']);}
    if(k===3||u==='P'){const r2=u==='P'?[at((s&7)-1,(s>>3)+1),at((s&7)+1,(s>>3)+1)].filter(x=>x>=0&&!b[x]):[...reach(b,s)].filter(x=>!b[x]);
      const n=u==='P'?Math.min(r2.length,1+Math.floor(Math.random()*2)):u==='K'?0:2;for(let j=0;j<n&&r2.length;j++){const t=r2.splice(Math.floor(Math.random()*r2.length),1)[0];b[t]=mid(t)?pick(['p','n','b','r']):pick(['n','b','r']);}
      if(u==='P'&&Math.random()<.5){const fr=at(s&7,(s>>3)+1);if(fr>=0&&!b[fr]&&k===3)b[fr]='p';}}}
  return {b,s};}
function moveTask(u,k){return (wrap,done)=>{let su=moveBoard(u,k);while(!reach(su.b,su.s).size)su=moveBoard(u,k);const {b,s}=su;const tgt=reach(b,s);const [ind,def,fem]=NM[u];
  prompt(wrap,`לְאָן ${def} ${fem?'יְכוֹלָה':'יָכוֹל'} לָלֶכֶת? גַּע בְּכָל הַמִּשְׁבָּצוֹת.`);
  const got=new Set();let errs=0,lock=false,hs=null;const msg=note(wrap);
  const end=()=>{if(lock)return;lock=true;paint(el,b,{sel:s,dots:tgt,good:new Set([...tgt].filter(x=>!got.has(x)))});msg.textContent='הִנֵּה כָּל הַמִּשְׁבָּצוֹת.';done(2,null);};
  const miss=t=>{errs++;sfx.no();flashSq(el,t);helpAfter(hb,errs,5,end);};
  const el=boardEl(t=>{if(lock||t===s||got.has(t))return;if(tgt.has(t)){got.add(t);if(hs===t)hs=null;sfx.pop(2);paint(el,b,{sel:s,dots:got,hint:hs});if(got.size===tgt.size){lock=true;msg.textContent='מָצָאתָ אֶת כֻּלָּן!';sfx.ok(errs);done(Math.max(errs>3?2:errs>1?1:0,helped(hb)),el);}return;}miss(t);});
  paint(el,b,{sel:s});wrap.appendChild(el);
  const hb=boardHelp(wrap,{clue:()=>{hs=[...tgt].find(x=>!got.has(x));paint(el,b,{sel:s,dots:got,hint:hs});return `${RULE[u]} סִמַּנְתִּי לְךָ מִשְׁבֶּצֶת אַחַת.`;},
    answer:()=>{end();return `הִנֵּה כָּל הַמִּשְׁבָּצוֹת שֶׁ${def} ${fem?'יְכוֹלָה':'יָכוֹל'} לְהַגִּיעַ אֲלֵיהֶן.`;},wrong:()=>{if(!lock)miss([...Array(64).keys()].find(x=>x!==s&&!tgt.has(x)));}});
  return {target:tgt,solve:()=>[...tgt].forEach(t=>{if(!lock&&!got.has(t))el.querySelector(`[data-s="${t}"]`).click();})};};}
function demo(u,back,go){O.setScreen('sTal','valley',back);T.hudT(NM[u][0]);const s=$('#sTal');s.innerHTML='';const wrap=h('div','tq cz');s.appendChild(wrap);
  const b=empty();const sq=u==='P'?sqOf('d2'):sqOf('d4');b[sq]=u;const card=h('div','prq tqc czq',`<div class="czhead">${piece(u)}<b>${NM[u][1]}</b></div><div class="qq">${RULE[u]}</div>`);wrap.appendChild(card);
  const el=boardEl(null);el.classList.add('sm');paint(el,b,{sel:sq,dots:reach(b,sq)});wrap.appendChild(el);say(RULE[u]);O.say(T.spk?T.spk(RULE[u]):RULE[u]);
  const bt=h('button','bigbtn',ICON.play+'<span>הַמְשֵׁךְ</span>');bt.onclick=()=>{sfx.pop(2);go();};wrap.appendChild(bt);CUR={solve:()=>bt.click()};}
function runMoves(back){const cz=ST();const k=Math.min(cz.mv,ORDER.length-1);const u=ORDER[k];
  demo(u,back,()=>lesson('chess-moves',`אֵיךְ ${NM[u][1]} ${NM[u][2]?'זָזָה':'זָז'}`,[0,1,2,3].map(j=>moveTask(u,j)),back,{done:`עַכְשָׁו אַתָּה מַכִּיר אֶת ${NM[u][1]}!`,again:()=>runMoves(back),
    onEnd:st=>{if(st>=2&&cz.mv===k&&k<ORDER.length){cz.mv=k+1;O.persist();const nx=ORDER[k+1];return nx?`בַּפַּעַם הַבָּאָה: ${NM[nx][1]}`:'לָמַדְתָּ אֶת כָּל הַכֵּלִים!';}return '';}}));}

/* ---------- 3. what can you capture? exactly one black piece can be taken ---------- */
function captureSetup(n){const kinds=ORDER.slice(0,Math.max(1,Math.min(6,ST().mv)));
  for(let t=0;t<500;t++){const b=empty();const whites=[];const nw=n>=5&&kinds.length>1?2:1;
    for(let j=0;j<nw;j++){const u=pick(kinds);const s=freeSq(b,x=>u!=='P'||((x>>3)>0&&(x>>3)<6));b[s]=u;whites.push(s);}
    const hasK=whites.some(s=>b[s]==='K');
    for(let j=0;j<3;j++){const pc=pick(['p','n','b','r','q']);const s=freeSq(b,x=>pc!=='p'||mid(x));b[s]=pc;}
    if(hasK)continue; /* no king here: a king may only take an undefended piece, too hard for now */
    const caps=new Set();whites.forEach(s=>legal(posOf(b,'w'),s).forEach(m=>{if(m.cap)caps.add(m.t);}));
    if(caps.size===1)return {b,target:[...caps][0],from:legal(posOf(b,'w')).find(m=>m.t===[...caps][0])};}
  return null;}
function captureTask(n){return (wrap,done)=>{let su=captureSetup(n);while(!su)su=captureSetup(n);const {b,target,from}=su;
  prompt(wrap,'אֵיזֶה כְּלִי שָׁחֹר אֶפְשָׁר לֶאֱכֹל? גַּע בּוֹ.');const msg=note(wrap);let tries=0,lock=false;
  const [,def,fem]=NM[from.pc];
  const end=()=>{if(lock)return;lock=true;paint(el,b,{good:new Set([target]),sel:from.f});msg.textContent=`${def} ${fem?'יְכוֹלָה':'יָכוֹל'} לֶאֱכֹל כָּאן.`;done(2,null);};
  const miss=s=>{tries++;sfx.no();flashSq(el,s);helpAfter(hb,tries,2,end);};
  const el=boardEl(s=>{if(lock||side(b[s])!=='b')return;if(s===target){lock=true;const nb=make(posOf(b,'w'),from).b;paint(el,nb,{last:[from.f,from.t]});msg.textContent='יָפֶה! אָכַלְתָּ!';sfx.ok(tries);done(Math.max(tries,helped(hb)),el);return;}miss(s);});
  paint(el,b);wrap.appendChild(el);
  const hb=boardHelp(wrap,{clue:()=>{paint(el,b,{hint:from.f});return `סִמַּנְתִּי אֶת ${def}. ${fem?'הִיא':'הוּא'} ${fem?'יְכוֹלָה':'יָכוֹל'} לֶאֱכֹל. לְאָן ${fem?'הִיא מַגִּיעָה':'הוּא מַגִּיעַ'}?`;},
    answer:()=>{end();return `${def} ${fem?'אוֹכֶלֶת':'אוֹכֵל'} אֶת הַכְּלִי בַּמִּשְׁבֶּצֶת הַיְּרֻקָּה. ${RULE[from.pc]}`;},wrong:()=>{if(!lock)miss(b.findIndex((x,k)=>side(x)==='b'&&k!==target));}});
  return {b,target,solve:()=>el.querySelector(`[data-s="${target}"]`).click()};};}
function runCapture(back){lesson('chess-capture','מָה אֶפְשָׁר לֶאֱכֹל?',[0,1,2,3,4,5].map(n=>captureTask(n)),back,{done:'צַיָּד אַלּוּף!',again:()=>runCapture(back)});}

/* ---------- move input shared by check / mate / game: tap a piece, then a square ---------- */
function mover(el,getPos,o){let sel=null;const draw=extra=>paint(el,getPos().b,Object.assign({sel,dots:sel!=null&&o.dots?new Set(legal(getPos(),sel).map(m=>m.t)):null,chk:inCheck(getPos())?kingSq(getPos().b,getPos().t):null,last:o.last&&o.last(),hint:o.hint&&o.hint()},extra||{}));
  el.onclick=e=>{const c=e.target.closest('.cq');if(!c||o.locked())return;const s=+c.dataset.s,p=getPos();
    if(side(p.b[s])===p.t){sel=s;sfx.pop(1);draw();return;}
    if(sel==null)return;const ps=pseudo(p,sel).filter(m=>m.t===s);const lg=legal(p,sel).filter(m=>m.t===s);
    const m=lg.find(x=>!x.pr||x.pr.toUpperCase()==='Q');const from=sel;sel=null;o.onMove(m||null,ps.length>0,from,s);};
  return {draw,select:s=>{sel=s;draw();},get sel(){return sel;}};}

/* ---------- 4. check: is the king attacked? then: save him ---------- */
function checkSetup(want){for(let t=0;t<800;t++){const b=empty();const K=freeSq(b);b[K]='K';const a=pick(['r','b','q','n']);const as=freeSq(b,x=>near(x,K)>1);b[as]=a;
    const k=freeSq(b,x=>near(x,K)>1&&near(x,as)>0);b[k]='k';const p=posOf(b,'w');if(inCheck(posOf(b,'b')))continue;
    if(want==null)return {p,K};const chk=inCheck(p);if(want==='yes'&&!chk||want==='no'&&chk)continue;
    if(want==='esc'&&(!chk||legal(p).length<2))continue;if(want==='no'&&!legal(p).length)continue;return {p,K,a,as};}return null;}
function isCheckTask(){return (wrap,done)=>{const yes=Math.random()<.5;const {p,as}=checkSetup(yes?'yes':'no');const el=boardEl(null);paint(el,p.b);
  const [ind,def,fem]=NM[p.b[as].toUpperCase()];
  const why=yes?`כֵּן! ${def} ${COL.b[1][fem]} ${fem?'תּוֹקֶפֶת':'תּוֹקֵף'} אֶת הַמֶּלֶךְ.`:'לֹא, אַף כְּלִי לֹא תּוֹקֵף אֶת הַמֶּלֶךְ.';
  const t=choiceTask(`<div class="qq">הַאִם הַמֶּלֶךְ הַלָּבָן בְּשַׁח?</div>`,['כֵּן','לֹא'],yes?0:1,(card,quiet)=>{
    if(!quiet)card.insertAdjacentHTML('beforeend',`<div class="czsub">${why}</div>`);
    paint(el,p.b,{chk:yes?kingSq(p.b,'w'):null,sel:yes?as:null});},
    {clue:()=>{paint(el,p.b,{hint:as});return `סִמַּנְתִּי אֶת ${def} ${COL.b[1][fem]}. ${fem?'הִיא יְכוֹלָה':'הוּא יָכוֹל'} לְהַגִּיעַ לַמֶּלֶךְ הַלָּבָן?`;},explain:why})(wrap,done);wrap.insertBefore(el,wrap.querySelector('.chs'));t.pos=p;return t;};}
function escapeTask(withHelp){return (wrap,done)=>{let su=null;for(let t=0;t<50&&!su;t++){su=checkSetup('esc');if(su&&withHelp){const b=su.p.b;const r=freeSq(b,x=>{const bb=b.slice();bb[x]='R';return legal(posOf(bb,'w'),x).some(m=>m.t===su.as)&&near(x,su.K)>1;});if(r==null){su=null;continue;}b[r]='R';}}
  let p=su.p;prompt(wrap,'הַמֶּלֶךְ שֶׁלְּךָ בְּשַׁח! הַצֵּל אוֹתוֹ.');const msg=note(wrap);let errs=0,lock=false,hs=null;
  const ms0=legal(p);const best=ms0.find(m=>withHelp&&m.t===su.as&&m.pc==='R')||ms0.find(m=>m.pc==='K')||ms0[0];const [,bdef,bfem]=NM[best.pc];
  const end=()=>{if(lock)return;lock=true;paint(el,p.b,{dots:new Set(legal(p).map(x=>x.t)),sel:best.f,good:new Set([best.t])});msg.textContent='לְכָאן אֶפְשָׁר לָלֶכֶת.';done(2,null);};
  const miss=pseudoOk=>{errs++;sfx.no();msg.textContent=pseudoOk?'עֲדַיִן שַׁח! נַסֵּה מִשְׁבֶּצֶת אַחֶרֶת.':'הַכְּלִי לֹא זָז כָּכָה.';if(!withHelp)mv.select(su.K);else mv.draw();helpAfter(hb,errs,4,end);};
  const el=boardEl(null);const mv=mover(el,()=>p,{dots:false,locked:()=>lock,hint:()=>hs,onMove:(m,pseudoOk,from)=>{
    if(m){lock=true;p=make(p,m);paint(el,p.b,{last:[m.f,m.t]});msg.textContent='הַמֶּלֶךְ בָּטוּחַ!';sfx.ok(errs);done(Math.max(errs>2?2:errs,helped(hb)),el);return;}miss(pseudoOk);}});
  if(withHelp)mv.draw();else mv.select(su.K);wrap.appendChild(el);
  const hb=boardHelp(wrap,{clue:()=>{hs=best.f;mv.draw();return best.pc==='K'?'הַמֶּלֶךְ צָרִיךְ לָזוּז לְמִשְׁבֶּצֶת שֶׁאַף כְּלִי שָׁחֹר לֹא תּוֹקֵף.':`סִמַּנְתִּי אֶת ${bdef}. ${bfem?'הִיא יְכוֹלָה':'הוּא יָכוֹל'} לֶאֱכֹל אֶת הַכְּלִי שֶׁתּוֹקֵף!`;},
    answer:()=>{end();return `${bdef} ${bfem?'זָזָה':'זָז'} לַמִּשְׁבֶּצֶת הַיְּרֻקָּה, וְהַמֶּלֶךְ בָּטוּחַ.`;},wrong:()=>{if(!lock)miss(true);}});
  return {get pos(){return p;},K:su.K,solve:()=>{const m=legal(p)[0];if(withHelp||mv.sel!==m.f)el.querySelector(`[data-s="${m.f}"]`).click();el.querySelector(`[data-s="${m.t}"]`).click();}};};}
function runCheck(back){lesson('chess-check','שַׁח!',[isCheckTask(),isCheckTask(),escapeTask(0),escapeTask(0),escapeTask(1)],back,{done:'שׁוֹמֵר הַמֶּלֶךְ!',again:()=>runCheck(back)});}

/* ---------- 5. mate in one (hand-made puzzles) ---------- */
function mateTask(fen){return (wrap,done)=>{let p=fromFEN(fen);const sol=mates(p);prompt(wrap,'תֵּן מָט בְּמַהֲלָךְ אֶחָד!');const msg=note(wrap);let errs=0,lock=false,hs=null;
  const [,def,fem]=NM[sol[0].pc];
  const end=()=>{if(lock)return;lock=true;paint(el,p.b,{sel:sol[0].f,good:new Set([sol[0].t])});msg.textContent='הִנֵּה הַמָּט.';done(2,null);};
  const miss=m=>{errs++;sfx.no();msg.textContent=m&&status(make(p,m))==='check'?'זֶה שַׁח, אֲבָל לֹא מָט. נַסֵּה שׁוּב.':m?'זֶה לֹא מָט. נַסֵּה שׁוּב.':'הַכְּלִי לֹא זָז כָּכָה.';mv.draw();helpAfter(hb,errs,4,end);};
  const el=boardEl(null);const mv=mover(el,()=>p,{dots:true,locked:()=>lock,hint:()=>hs,onMove:(m,pseudoOk)=>{
    if(m&&status(make(p,m))==='mate'){lock=true;p=make(p,m);paint(el,p.b,{last:[m.f,m.t],chk:kingSq(p.b,'b')});msg.textContent='מָט! כָּל הַכָּבוֹד!';sfx.ok(errs);done(Math.max(errs>2?2:errs,helped(hb)),el);return;}miss(m);}});
  mv.draw();wrap.appendChild(el);
  const hb=boardHelp(wrap,{clue:()=>{hs=sol[0].f;mv.draw();return `סִמַּנְתִּי אֶת ${def}. ${fem?'הִיא נוֹתֶנֶת':'הוּא נוֹתֵן'} אֶת הַמָּט. לְאָן?`;},
    answer:()=>{end();return `${def} ${fem?'הוֹלֶכֶת':'הוֹלֵךְ'} לַמִּשְׁבֶּצֶת הַיְּרֻקָּה. הַמֶּלֶךְ הַשָּׁחֹר בְּשַׁח, וְאֵין לוֹ לְאָן לִבְרֹחַ. זֶה מָט!`;},wrong:()=>{if(!lock)miss(null);}});return {solve:()=>{el.querySelector(`[data-s="${sol[0].f}"]`).click();el.querySelector(`[data-s="${sol[0].t}"]`).click();}};};}
function runMate(back){const cz=ST();const lv=cz.mate===2?2:1;const set=lv===1?PUZ.slice(0,4):PUZ.slice(4);
  lesson('chess-mate','מָט בְּמַהֲלָךְ אֶחָד',set.map(mateTask),back,{done:'אַלּוּף הַמָּט!',again:()=>runMate(back),onEnd:st=>{if(st>=2&&lv===1){cz.mate=2;O.persist();return 'עָלִיתָ לְשָׁלָב הַבָּא!';}return '';}});}

/* ---------- 6. a small game against a very gentle computer ---------- */
function botMove(p){const ms=legal(p);const caps=ms.filter(m=>m.cap);const pool=caps.length?caps:ms;const m=pick(pool);return m.pr?Object.assign({},m,{pr:m.pc==='p'?'q':'Q'}):m;}
function runGame(back){O.setScreen('sTal','valley',back);T.hudT('מְשַׂחֲקִים!');const s=$('#sTal');s.innerHTML='';const wrap=h('div','tq cz');s.appendChild(wrap);
  let p=fromFEN(START),last=null,lock=false,over=false;const msg=h('div','lcap czmsg','אַתָּה הַלְּבָנִים. הָזֵז כְּלִי, כְּמוֹ הַחֵץ!');say(msg.textContent);O.say(T.spk?T.spk(msg.textContent):msg.textContent);
  const el=boardEl(null);wrap.append(msg,el);const arrow=hintArrow(el,sqOf('e2'),sqOf('e4'));
  const end=res=>{over=true;lock=true;CUR=null;const st=res==='win'?3:res==='draw'?2:1;const g=res==='win'?10:3;O.addGems(g);T.record('chess-play',st);
    setTimeout(()=>T.result({title:res==='win'?'מָט! נִצַּחְתָּ!':res==='draw'?'תֵּיקוּ!':'הַמַּחְשֵׁב נִצֵּחַ הַפַּעַם.',sub:res==='lose'?'נְשַׂחֵק שׁוּב?':'',stars:st,gems:g,back,again:()=>runGame(back)}),D(900));};
  const after=()=>{const st=status(p);if(st==='mate')return end(p.t==='b'?'win':'lose'),true;if(st==='stale'||(p.ply|0)>=200||onlyKings(p.b))return end('draw'),true;return false;};
  const mv=mover(el,()=>p,{dots:true,locked:()=>lock||p.t!=='w',last:()=>last,onMove:(m)=>{if(!m){sfx.no();mv.draw();return;}
    p=make(p,m);last=[m.f,m.t];arrow.remove();sfx.pop(m.cap?4:2);mv.draw();if(after())return;lock=true;msg.textContent='הַמַּחְשֵׁב חוֹשֵׁב…';
    setTimeout(()=>{if(!el.isConnected||over)return;const b=botMove(p);p=make(p,b);last=[b.f,b.t];sfx.pop(b.cap?1:0);lock=false;mv.draw();if(after())return;msg.textContent=inCheck(p)?'שַׁח! הַצֵּל אֶת הַמֶּלֶךְ.':'תּוֹרְךָ.';},D(700));}});
  mv.draw();
  CUR={get pos(){return p;},play:m=>{el.querySelector(`[data-s="${m.f}"]`).click();el.querySelector(`[data-s="${m.t}"]`).click();},end};}
/* a big arrow over the board (first-move hint); squares in board % coordinates */
function hintArrow(el,a,b){const c=s=>[(s&7)*12.5+6.25,(7-(s>>3))*12.5+6.25];const [x1,y1]=c(a),[x2,y2]=c(b);
  const g=h('div','czarrow',`<svg viewBox="0 0 100 100" aria-hidden="true"><defs><marker id="czah" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto"><path d="M0 0 L4 2 L0 4 Z" fill="#2f9e44"/></marker></defs><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2+4}" stroke="#2f9e44" stroke-width="4.5" stroke-linecap="round" marker-end="url(#czah)" opacity=".85"/></svg>`);el.appendChild(g);return g;}
const onlyKings=b=>b.every(x=>!x||x==='K'||x==='k');

/* ---------- registration + parent info ---------- */
const ACTS=[
  {id:'chess-board',name:'הַלּוּחַ וְהַכֵּלִים',icon:()=>piece('K'),run:runBoard},
  {id:'chess-moves',name:'אֵיךְ הַכֵּלִים זָזִים',icon:()=>piece('R'),run:runMoves,avail:()=>stars('chess-board')>0},
  {id:'chess-capture',name:'מָה אֶפְשָׁר לֶאֱכֹל?',icon:()=>piece('p'),run:runCapture,avail:()=>ST().mv>=2},
  {id:'chess-check',name:'שַׁח!',icon:()=>piece('k'),run:runCheck,avail:()=>ST().mv>=5&&stars('chess-capture')>0},
  {id:'chess-mate',name:'מָט בְּמַהֲלָךְ אֶחָד',icon:()=>piece('Q'),run:runMate,avail:()=>stars('chess-check')>0},
  {id:'chess-play',name:'מְשַׂחֲקִים!',icon:()=>piece('N'),run:runGame,avail:()=>stars('chess-mate')>0}];
const SKILLS={'שחמט':ACTS.map(a=>a.id)};
let reg=false;
function register(building){if(reg)return;reg=true;(building||T.building)({id:'chess',name:'מוֹעֲדוֹן הַשַּׁחְמָט',color:'#6b4f3a',bg:'valley',icon:()=>piece('N'),blurb:'לוֹמְדִים לְשַׂחֵק שַׁחְמָט, צַעַד אַחַר צַעַד.',acts:ACTS});
  const g=(T.GROUPS||[]).find(x=>x.id==='explore');if(g&&!g.ids.includes('chess'))g.ids.push('chess');}
function skills(){const tl=T.S().tl;return Object.entries(SKILLS).map(([name,ids])=>({name,ids,stars:ids.reduce((a,id)=>a+((tl[id]||{}).s|0),0),max:ids.length*3,plays:ids.reduce((a,id)=>a+((tl[id]||{}).n|0),0),level:ST().mv}));}
Object.assign(window.CHESS,{register,skills,SKILLS,ST,piece,NM,ORDER,botMove,unlockAll:()=>{const cz=ST();cz.mv=6;cz.mate=1;['chess-board','chess-capture','chess-check'].forEach(id=>{if(!stars(id))T.record(id,1);});},
  solve:()=>CUR&&CUR.solve&&CUR.solve()});
Object.defineProperty(window.CHESS,'cur',{get:()=>CUR});
})();
