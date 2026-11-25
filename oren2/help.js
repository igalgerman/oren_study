/* ===== HELP LADDER — automatic help when Oren is stuck (no help button) =====
   Stuck = 2 wrong answers on the same question, or a long idle (cfg.idle, 25s).
   Ladder: 1 small tip → 2 picture with animation → 3 a similar question solved together, step by step, with voice
           → 4 a new similar question he solves alone (only this one earns the star) → if that fails too: call a parent.
   Reading words: first sound → syllables → the whole word → parent.
   Sometimes after a success: "explain to me how you did it" (3 short explanations, or "I said it aloud").
   Hard items come back after a day inside normal practice (HELP.due); right → marked understood.
   Everything is pre-written; voice goes through O.say.  Explainers per question type: HELP.register(type, explainer).

   Host API (see the integration notes in the commit / report):
     HELP.start(q, ctx)  when a question is shown.  ctx = {mount, gen, present(q2), done(why), unit, topic, wrongs}
     HELP.wrong()        on every wrong answer → {level, off}   (off: no explainer for this question; host keeps its own flow)
     HELP.right()        on the right answer   → {solo, star}
     HELP.stop()         leaving the screen
     HELP.due(n, filter) hard items that are due again → host questions (with q.fromHelp)
     HELP.stuckList()    for the parent panel / skills tracking (parent text, no nikud)            */
(()=>{'use strict';
const O=()=>window.OREN||{},T=()=>window.TAL||{},O4=()=>window.__oren4||{};
const D=ms=>(O().D?O().D(ms):ms);
const RM=()=>{try{return !!(O().RM&&O().RM());}catch(e){return false;}};
const R=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const pick=a=>a[Math.floor(Math.random()*a.length)];
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const tens=n=>n-n%10;
const range=(a,b,s=1)=>{const o=[];if(s>0)for(let v=a;v<=b;v+=s)o.push(v);else for(let v=a;v>=b;v+=s)o.push(v);return o;};
const E=t=>/^\d+$/.test(String(t))?String(t):`<span class="ltr">${t}</span>`;   /* equations stay left-to-right inside Hebrew */
const strip=s=>String(s==null?'':s).replace(/<svg[\s\S]*?<\/svg>/g,' ').replace(/<[^>]+>/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const plain=s=>strip(s).replace(/[֑-ׇ]/g,'');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cfg={idle:25000,teachP:.5,teachSoloP:.08,teachGap:4*60000,keep:40};

/* ---------- speech: numbers and signs as words (voice only) ---------- */
const F=['אפס','אחת','שתיים','שלוש','ארבע','חמש','שש','שבע','שמונה','תשע','עשר','אחת עשרה','שתים עשרה','שלוש עשרה','ארבע עשרה','חמש עשרה','שש עשרה','שבע עשרה','שמונה עשרה','תשע עשרה','עשרים'];
const TN=['','','עשרים','שלושים','ארבעים','חמישים','שישים','שבעים','שמונים','תשעים'];
const HN=['','מאה','מאתיים','שלוש מאות','ארבע מאות','חמש מאות','שש מאות','שבע מאות','שמונה מאות','תשע מאות'];
function nw(n){n=+n;if(n<=20)return F[n];const p=[];const hh=n/100|0,r=n%100;if(hh)p.push(HN[hh]);if(r){if(r<=20)p.push(F[r]);else{p.push(TN[r/10|0]);if(r%10)p.push(F[r%10]);}}if(p.length>1)p[p.length-1]='ו'+p[p.length-1];return p.join(' ');}
function speech(html){let t=strip(html);
  t=t.replace(/\b(\d{1,2}):(\d{2})\b/g,(m,h,mm)=>{mm=+mm;return nw(h)+(mm===0?'':mm===30?' וחצי':mm===15?' ורבע':' ו'+nw(mm));});
  t=t.replace(/\s*\+\s*/g,' ועוד ').replace(/\s*−\s*/g,' פחות ').replace(/\s*×\s*/g,' כפול ').replace(/(\d)\s+:\s+(\d)/g,'$1 חלקי $2')
     .replace(/\s*=\s*\?/g,' שווה כמה?').replace(/\s*=\s*/g,' שווה ').replace(/\s*<\s*/g,' קטן מ ').replace(/\s*>\s*/g,' גדול מ ').replace(/←/g,',').replace(/·/g,',');
  return t.replace(/\d+/g,m=>nw(m)).replace(/-/g,' ').replace(/\s+/g,' ').trim();}
const say=t=>{try{const o=O();o.sayNow=speech(t);if(o.say)o.say(speech(t));}catch(e){}};

/* ---------- animated pictures: elements carry data-t (ms) + data-to (transform) / data-op (opacity) / data-dash ---------- */
const A=(t,o)=>` data-t="${t}"`+(o.to?` data-to="${o.to}"`:'')+(o.op!=null?` data-op="${o.op}"`:'')+(o.dash?' data-dash="0"':'');
function play(root){if(!root)return;const els=[...root.querySelectorAll('[data-t]')];
  els.forEach(e=>{if(e.dataset.op0==null){e.dataset.op0=e.style.opacity;e.dataset.tf0=e.style.transform;}e.classList.remove('go');if(e.dataset.to)e.style.transform=e.dataset.tf0;if(e.dataset.op!=null)e.style.opacity=e.dataset.op0;if(e.dataset.dash)e.style.strokeDashoffset='';});
  (root._hlpT||[]).forEach(clearTimeout);root._hlpT=[];
  const fire=e=>{e.classList.add('go');if(e.dataset.to)e.style.transform=e.dataset.to;if(e.dataset.op!=null)e.style.opacity=e.dataset.op;if(e.dataset.dash)e.style.strokeDashoffset='0';};
  if(RM()){els.forEach(fire);return;}
  void root.getBoundingClientRect();
  els.forEach(e=>root._hlpT.push(setTimeout(()=>fire(e),D(+e.dataset.t||0))));}
const svg=(w,h,body,cls='')=>`<svg class="hlp-svg ${cls}" direction="ltr" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;
const txt=(x,y,s,o={})=>`<text x="${x}" y="${y}" text-anchor="middle" font-size="${o.fs||16}" font-weight="900" fill="${o.c||'#23303b'}"${o.t!=null?A(o.t,{op:1})+' style="opacity:0"':''}>${s}</text>`;
const BL='#3a8fc4',RD='#e4572e',GR='#4fbf63',OR='#e8873a';
/* ten-frames: make ten (8 + 5: two red blocks move into the blue 8) */
function vMake10(l,r){const c=30,oy=26,ox=[10,200],bigL=l>=r,big=Math.max(l,r),small=Math.min(l,r),need=10-big;
  const pos=(f,i)=>[ox[f]+(i%5)*c+3,oy+(i/5|0)*c+3];let s='';
  for(const f of [0,1])for(let i=0;i<10;i++){const [x,y]=pos(f,i);s+=`<rect x="${x-3}" y="${y-3}" width="${c}" height="${c}" fill="#fff" stroke="#23303b" stroke-width="2"/>`;}
  const fb=bigL?0:1,fs=1-fb;
  for(let i=0;i<big;i++){const [x,y]=pos(fb,i);s+=`<rect x="${x}" y="${y}" width="${c-6}" height="${c-6}" rx="3" fill="${BL}"/>`;}
  for(let i=0;i<small;i++){const [x,y]=pos(fs,i);let mv='';if(i<need){const [tx,ty]=pos(fb,big+i);mv=A(700+i*450,{to:`translate(${tx-x}px,${ty-y}px)`});}
    s+=`<rect class="hlp-mv" x="${x}" y="${y}" width="${c-6}" height="${c-6}" rx="3" fill="${RD}"${mv}/>`;}
  const tEnd=700+need*450+300;
  s+=txt(185,oy+36,'+',{fs:30});s+=txt(ox[0]+75,oy+86,l,{fs:20});s+=txt(ox[1]+75,oy+86,r,{fs:20});
  s+=txt(ox[fb]+75,oy+110,'10',{fs:22,c:BL,t:tEnd});s+=txt(ox[fs]+75,oy+110,String(small-need),{fs:22,c:RD,t:tEnd});
  return svg(360,150,s);}
/* number line with animated hops; hide = the value to show as "?" */
function vLine(min,max,hops,hide){const W=360,P=18,x=v=>P+(v-min)/(max-min)*(W-2*P),y=92;let s=`<line x1="${P-6}" y1="${y}" x2="${W-P+6}" y2="${y}" stroke="#23303b" stroke-width="3"/>`;
  const span=max-min,every=span<=20?1:span<=60?5:10;const labels=new Set();
  for(let v=Math.ceil(min/every)*every;v<=max;v+=every){s+=`<line x1="${x(v)}" y1="${y-6}" x2="${x(v)}" y2="${y+6}" stroke="#23303b" stroke-width="2"/>`;if(span<=20||v%10===0)labels.add(v);}
  hops.forEach(hp=>{labels.add(hp.a);labels.add(hp.b);});labels.add(min);labels.add(max);
  let t=500;hops.forEach((hp,i)=>{const x1=x(hp.a),x2=x(hp.b),hgt=Math.min(56,14+Math.abs(x2-x1)*.45),mx=(x1+x2)/2,L=Math.round(Math.abs(x2-x1)*1.25+hgt*1.6+4);
    const col=hp.c||(hp.b>hp.a?GR:RD);
    s+=`<path d="M${x1} ${y-4} Q${mx} ${y-4-2*hgt} ${x2} ${y-4}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" style="stroke-dasharray:${L};stroke-dashoffset:${L}"${A(t,{dash:1})}/>`;
    if(hp.lbl!=null)s+=txt(mx,y-10-hgt,hp.lbl,{fs:14,c:col,t:t+350});
    t+=hp.dt||(Math.abs(hp.b-hp.a)<=1&&hops.length>3?260:650);});
  const fsz=span<=20?(span>12?11:13):12;
  [...labels].filter(v=>v>=min&&v<=max).forEach(v=>{if(v===hide)s+=`<rect x="${x(v)-11}" y="${y+9}" width="22" height="20" rx="4" fill="#ffcf4d"/>`+txt(x(v),y+24,'?',{fs:15});else s+=txt(x(v),y+24,v,{fs:fsz});});
  if(hops.length)s+=`<circle cx="${x(hops[0].a)}" cy="${y}" r="6" fill="${BL}"/>`;
  return svg(W,124,s);}
/* base-ten blocks: rods of 10 + single cubes */
const S9=9;
function btGroup(n,x0,y0,col,o={}){let s='',x=x0;const rods=[],ones=[];
  for(let i=0;i<(n/10|0);i++){rods.push([x,y0]);x+=S9+4;}
  const ox=x+(rods.length?4:0);for(let i=0;i<n%10;i++){ones.push([ox+(i%2)*(S9+2),y0+10*S9-(1+(i/2|0))*(S9+2)+2]);}
  rods.forEach(([rx,ry],i)=>{s+=`<g${o.rodA?o.rodA(i):''}><rect x="${rx}" y="${ry}" width="${S9}" height="${10*S9}" fill="${col}" stroke="#23303b" stroke-width="1.5"/>`;for(let k=1;k<10;k++)s+=`<line x1="${rx}" y1="${ry+k*S9}" x2="${rx+S9}" y2="${ry+k*S9}" stroke="#23303b" stroke-width=".6"/>`;s+='</g>';});
  ones.forEach(([cx,cy],i)=>{s+=`<rect x="${cx}" y="${cy}" width="${S9}" height="${S9}" fill="${col}" stroke="#23303b" stroke-width="1.2"${o.oneA?o.oneA(i,cx,cy):''}/>`;});
  const w=Math.max(S9,(ones.length?ox+2*S9+2:x-4)-x0);return {s,w,rods,ones,ox};}
function btWidth(n){return btGroup(n,0,0,'#000').w;}
/* tens with tens, ones with ones (glow in two steps) */
function vTensOnes(l,r,op){const g=34,wl=btWidth(l),wr=btWidth(r),W=Math.max(300,wl+wr+g+40),x0=(W-(wl+wr+g))/2,y0=14;
  const hl=(x,y,w,h,t,c)=>`<rect x="${x-3}" y="${y-3}" width="${w+6}" height="${h+6}" rx="4" fill="none" stroke="${c}" stroke-width="3" style="opacity:0"${A(t,{op:1})}/>`;
  const a=btGroup(l,x0,y0,OR),b=btGroup(r,x0+wl+g,y0,BL);let s=a.s+b.s;
  const box=(G,t,c,which)=>{const pts=which==='r'?G.rods:G.ones;if(!pts.length)return '';const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);const h=which==='r'?10*S9:Math.max(...ys)+S9-Math.min(...ys);return hl(Math.min(...xs),Math.min(...ys),Math.max(...xs)+S9-Math.min(...xs),h,t,c);};
  s+=box(a,500,'#8e6fd1','r')+box(b,500,'#8e6fd1','r')+box(a,1500,GR,'o')+box(b,1500,GR,'o');
  s+=txt(x0+wl+g/2,y0+52,op,{fs:26})+txt(x0+wl/2,y0+10*S9+22,l)+txt(x0+wl+g+wr/2,y0+10*S9+22,r);
  return svg(W,y0+10*S9+30,s);}
/* ones of both numbers gather; ten of them make a new rod */
function vBundle(l,r){const g=30,wl=btWidth(l),wr=btWidth(r),mW=40,W=Math.max(320,wl+wr+g*2+mW+10),x0=(W-(wl+wr+g*2+mW))/2,y0=14,mx=x0+wl+wr+g*2;
  const nA=l%10,tot=l%10+r%10;const tgt=i=>[mx+(i/10|0)*(S9+6),y0+10*S9-(i%10+1)*S9];
  const mk=(off,col)=>(i,cx,cy)=>{const [tx,ty]=tgt(off+i);return A(500+(off+i)*160,{to:`translate(${tx-cx}px,${ty-cy}px)`});};
  const a=btGroup(l,x0,y0,OR,{oneA:mk(0,OR)}),b=btGroup(r,x0+wl+g,y0,BL,{oneA:mk(nA,BL)});
  const tEnd=500+tot*160+400;let s=a.s+b.s;
  s+=`<rect x="${mx-3}" y="${y0-3}" width="${S9+6}" height="${10*S9+6}" rx="3" fill="none" stroke="#8e6fd1" stroke-width="3" style="opacity:0"${A(tEnd,{op:1})}/>`+txt(mx+S9/2,y0+10*S9+22,'10',{fs:18,c:'#8e6fd1',t:tEnd});
  s+=txt(x0+wl+g/2,y0+52,'+',{fs:26})+txt(x0+wl/2,y0+10*S9+22,l)+txt(x0+wl+g+wr/2,y0+10*S9+22,r);
  return svg(W,y0+10*S9+30,s);}
/* take away: the last blocks fade and get a cross */
function vTake(l,r){const c=Math.min(32,340/l),W=Math.max(200,l*c+20),x0=(W-l*c)/2;let s='';
  for(let i=0;i<l;i++){const x=x0+i*c+2,gone=i>=l-r,t=600+(l-1-i)*380;
    s+=`<rect x="${x}" y="20" width="${c-4}" height="${c-4}" rx="3" fill="${BL}"${gone?A(t,{op:.25}):''}/>`;
    if(gone)s+=`<path d="M${x+3} 23 L${x+c-7} ${17+c} M${x+c-7} 23 L${x+3} ${17+c}" stroke="${RD}" stroke-width="4" stroke-linecap="round" style="opacity:0"${A(t,{op:1})}/>`;}
  return svg(W,c+40,s+txt(W/2,c+36,l,{fs:16}));}
/* through ten: 13 − 5 → first the 3 outside, then 2 from the full ten */
function vThru10(l,r){const c=28,o=l%10,ox=[12,190];let s='';const pos=(f,i)=>[ox[f]+(i%5)*c+3,20+(i/5|0)*c+3];
  for(const f of [0,1])for(let i=0;i<10;i++){const [x,y]=pos(f,i);s+=`<rect x="${x-3}" y="${y-3}" width="${c}" height="${c}" fill="#fff" stroke="#23303b" stroke-width="2"/>`;}
  const cross=(x,y,t)=>`<path d="M${x+3} ${y+3} L${x+c-9} ${y+c-9} M${x+c-9} ${y+3} L${x+3} ${y+c-9}" stroke="${RD}" stroke-width="4" stroke-linecap="round" style="opacity:0"${A(t,{op:1})}/>`;
  let t=600;for(let i=o-1;i>=0;i--){const [x,y]=pos(1,i);s+=`<rect x="${x}" y="${y}" width="${c-6}" height="${c-6}" rx="3" fill="${BL}"${A(t,{op:.25})}/>`+cross(x,y,t);t+=380;}
  const tTen=t+200;t+=700;
  for(let i=9;i>=0;i--){const [x,y]=pos(0,i);const gone=i>=10-(r-o);s+=`<rect x="${x}" y="${y}" width="${c-6}" height="${c-6}" rx="3" fill="${BL}"${gone?A(t,{op:.25}):''}/>`;if(gone){s+=cross(x,y,t);t+=380;}}
  s+=txt(ox[0]+70,20+2*c+24,'10',{fs:20,c:'#8e6fd1',t:tTen});
  return svg(360,20+2*c+34,s);}
/* take tens and ones away from base-ten blocks */
function vTakeBT(l,r){const W=Math.max(260,btWidth(l)+60),x0=(W-btWidth(l))/2,y0=12,tr=r/10|0,or=r%10,nt=l/10|0,no=l%10;
  const cross=(x,y,w,h,t)=>`<path d="M${x} ${y} L${x+w} ${y+h} M${x+w} ${y} L${x} ${y+h}" stroke="${RD}" stroke-width="3" stroke-linecap="round" style="opacity:0"${A(t,{op:1})}/>`;
  const g=btGroup(l,x0,y0,BL,{rodA:i=>i>=nt-tr?A(600+(nt-1-i)*400,{op:.25}):'',oneA:i=>i>=no-or?A(600+tr*400+300+(no-1-i)*330,{op:.25}):''});
  let s=g.s;g.rods.forEach(([x,y],i)=>{if(i>=nt-tr)s+=cross(x,y+30,S9,30,600+(nt-1-i)*400);});
  g.ones.forEach(([x,y],i)=>{if(i>=no-or)s+=cross(x,y,S9,S9,600+tr*400+300+(no-1-i)*330);});
  return svg(W,y0+10*S9+30,s+txt(W/2,y0+10*S9+22,l));}
/* array of l rows × r, rows appear with a running total; last total "?" */
function vArray(l,r){const c=Math.min(24,200/Math.max(r,1),150/Math.max(l,1)),W=r*c+90,H=l*c+16;let s='';
  for(let i=0;i<l;i++){const t=400+i*520;let row='';for(let j=0;j<r;j++)row+=`<circle cx="${14+j*c+c/2}" cy="${8+i*c+c/2}" r="${c*.36}" fill="${['#e4572e','#3a8fc4','#4fbf63','#8e6fd1','#e8873a'][i%5]}"/>`;
    s+=`<g style="opacity:0"${A(t,{op:1})}>${row}</g>`+txt(14+r*c+34,8+i*c+c/2+6,i===l-1?'?':r*(i+1),{fs:Math.min(16,c*.8),c:'#23303b',t:t});}
  return svg(W,H,s);}
/* share p dots into k boxes, one by one */
function vShare(p,k){const W=360,bw=Math.min(80,(W-20)/k-8),gap=((W-20)-k*bw)/(k+1),dot=10,top=12,rows=Math.ceil(p/12),boxY=top+rows*14+24,per=Math.ceil(p/k),cols=Math.max(1,Math.min(4,Math.floor((bw-2)/14))),bh=Math.ceil(per/cols)*14+14;let s='';
  for(let b=0;b<k;b++)s+=`<rect x="${10+gap+b*(bw+gap)}" y="${boxY}" width="${bw}" height="${bh}" rx="6" fill="#fff3c4" stroke="#23303b" stroke-width="2"/>`;
  for(let j=0;j<p;j++){const sx=W/2-(Math.min(p,12)*14)/2+(j%12)*14+7,sy=top+(j/12|0)*14+7,b=j%k,slot=j/k|0;
    const tx=10+gap+b*(bw+gap)+bw/2-((Math.min(cols,per))*14)/2+(slot%cols)*14+7,ty=boxY+10+(slot/cols|0)*14+4;
    s+=`<circle class="hlp-mv" cx="${sx}" cy="${sy}" r="${dot/2+1}" fill="${BL}"${A(500+j*Math.max(70,Math.min(220,4200/p)),{to:`translate(${tx-sx}px,${ty-sy}px)`})}/>`;}
  return svg(W,boxY+bh+8,s);}
/* place-value table for comparing (columns glow from the left) */
function vPlace(a,b){const da=String(a).padStart(3,' '),db=String(b).padStart(3,' '),n=Math.max(String(a).length,String(b).length),cols=['מֵאוֹת','עֲשָׂרוֹת','אֲחָדוֹת'].slice(3-n),cw=80,W=cw*n+20;let s='';
  const A_=String(a).padStart(n,'0').split(''),B_=String(b).padStart(n,'0').split('');let stop=n-1;for(let i=0;i<n;i++)if(A_[i]!==B_[i]){stop=i;break;}
  cols.forEach((c,i)=>{const x=10+i*cw;s+=`<rect x="${x}" y="4" width="${cw}" height="116" fill="${i%2?'#fffaf0':'#f4e4c1'}" stroke="#23303b" stroke-width="1.5"/>`+txt(x+cw/2,24,c,{fs:13});
    if(i<=stop)s+=`<rect x="${x+3}" y="34" width="${cw-6}" height="82" rx="6" fill="none" stroke="${i===stop?GR:'#8e6fd1'}" stroke-width="4" style="opacity:0"${A(500+i*800,{op:1})}/>`;
    s+=txt(x+cw/2,66,A_[i]==='0'&&i<n-String(a).length?'':A_[i],{fs:28,c:OR})+txt(x+cw/2,106,B_[i]==='0'&&i<n-String(b).length?'':B_[i],{fs:28,c:BL});});
  return svg(W,124,s);}
/* clock: minute hand sweeps from 12; 5-minute numbers light up on the way */
function vClock(h,m){const cx=100,cy=100;let s=`<circle cx="100" cy="100" r="94" fill="#fffaf0" stroke="#23303b" stroke-width="7"/>`;
  for(let i=1;i<=12;i++){const a=i*Math.PI/6;s+=`<text x="${(cx+66*Math.sin(a)).toFixed(1)}" y="${(cy-66*Math.cos(a)+8).toFixed(1)}" text-anchor="middle" font-size="22" font-weight="900" fill="#23303b">${i}</text>`;}
  for(let k=1;k<=m/5;k++){const a=k*Math.PI/6;s+=`<text x="${(cx+108*Math.sin(a)).toFixed(1)}" y="${(cy-108*Math.cos(a)+5).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="900" fill="${BL}" style="opacity:0"${A(600+k*220,{op:1})}>${k*5}</text>`;}
  const ha=((h%12)+m/60)*30;
  s+=`<line class="hlp-pulse" x1="100" y1="100" x2="100" y2="54" stroke="${OR}" stroke-width="11" stroke-linecap="round" style="transform-origin:100px 100px;transform:rotate(${ha}deg)"/>`;
  s+=`<line class="hlp-rot" x1="100" y1="100" x2="100" y2="26" stroke="${BL}" stroke-width="6" stroke-linecap="round" style="transform-origin:100px 100px;transition-duration:${Math.max(.4,m/60*2.6)}s"${A(500,{to:`rotate(${m*6}deg)`})}/><circle cx="100" cy="100" r="7" fill="#23303b"/>`;
  return `<svg class="hlp-svg hlp-clock" direction="ltr" viewBox="-22 -22 244 244" aria-hidden="true">${s}</svg>`;}
/* fraction: parts get numbered one by one */
function vFrac(n,shape){let s='';const t=i=>500+i*600;
  if(shape!=='bar'){for(let i=0;i<n;i++){const a0=i*2*Math.PI/n-Math.PI/2,a1=(i+1)*2*Math.PI/n-Math.PI/2,am=(a0+a1)/2;
      s+=`<path d="M100 100 L${(100+88*Math.cos(a0)).toFixed(1)} ${(100+88*Math.sin(a0)).toFixed(1)} A88 88 0 0 1 ${(100+88*Math.cos(a1)).toFixed(1)} ${(100+88*Math.sin(a1)).toFixed(1)} Z" fill="${i===0?'#f28c28':'#fff3c4'}" stroke="#23303b" stroke-width="4"/>`;
      s+=txt((100+50*Math.cos(am)).toFixed(1),(100+50*Math.sin(am)+9).toFixed(1),i+1,{fs:28,c:'#8e6fd1',t:t(i)});}}
  else{const w=180/n;for(let i=0;i<n;i++){s+=`<rect x="${10+i*w}" y="50" width="${w}" height="100" fill="${i===0?'#3cb371':'#e8f5e1'}" stroke="#23303b" stroke-width="4"/>`+txt(10+i*w+w/2,112,i+1,{fs:28,c:'#8e6fd1',t:t(i)});}}
  return svg(200,200,s,'hlp-frac');}
const stepsHTML=lines=>`<div class="hlp-lines">${lines.map((l,i)=>`<div style="opacity:0"${A(400+i*900,{op:1})}>${E(esc(l))}</div>`).join('')}</div>`;

/* ---------- explainers ---------- */
const REG={};
const eqShow=d=>{const L=d.miss==='l'?'?':d.l,Rr=d.miss==='r'?'?':d.r,S=d.miss==='res'||!d.miss?'?':d.res;return `${L} ${d.op} ${Rr} = ${S}`;};
const eqFull=d=>`${d.l} ${d.op} ${d.r} = ${d.res}`;
const bin=(l,op,r,miss='res')=>{const res=op==='+'?l+r:op==='−'?l-r:op==='×'?l*r:l/r;return {l,op,r,res,miss,ans:miss==='res'?res:miss==='r'?r:l};};
const toQ=d=>({k:'bin',l:d.l,op:d.op,r:d.r,res:d.res,miss:d.miss||'res',ans:d.ans});
const differ=(gen,d)=>{for(let i=0;i<60;i++){const x=gen();if(x.l!==d.l||x.r!==d.r||x.op!==d.op)return x;}return gen();};
const SG=(m,f)=>m===1?f[0]:f[1];   /* singular / plural */
const left=n=>SG(n,['נִשְׁאַר','נִשְׁאֲרוּ']);
const binX=o=>Object.assign({show:eqShow,toQ,example:d=>({steps:o.steps(d),ans:d.ans})},o);
function register(type,ex){REG[type]=Object.assign({type},ex);return REG[type];}

register('add-10',binX({topic:()=>'חיבור עד 10',
  tip:d=>`לספור יחד קדימה מ-${Math.max(d.l,d.r)}, עוד ${Math.min(d.l,d.r)} (אפשר על האצבעות)`,
  hint:d=>`טִיפּ: תַּתְחִיל מִ-${E(Math.max(d.l,d.r))} וְתִסְפֹּר עוֹד ${E(Math.min(d.l,d.r))}`,
  visual:d=>{const b=Math.max(d.l,d.r),s=Math.min(d.l,d.r);return {cap:'קוֹפְצִים עַל הַקַּו',svg:vLine(0,10,range(b,b+s-1).map(v=>({a:v,b:v+1,lbl:'+1'})),d.res)};},
  similar:d=>differ(()=>{const l=R(1,8);return bin(l,'+',R(1,10-l));},d),
  steps:d=>{const b=Math.max(d.l,d.r),s=Math.min(d.l,d.r);return [`מַתְחִילִים מֵהַמִּסְפָּר הַגָּדוֹל: ${E(b)}`,`סוֹפְרִים עוֹד ${E(s)}: ${E(range(b+1,d.res).join(', '))}`,E(eqFull(d))];},
  teach:d=>[`סָפַרְתִּי מִ-${E(Math.max(d.l,d.r))} עוֹד ${E(Math.min(d.l,d.r))}`,'סָפַרְתִּי עַל הָאֶצְבָּעוֹת','זָכַרְתִּי בְּעַל פֶּה']}));

register('add-make10',binX({topic:()=>'חיבור עם מעבר עשרת (השלמה ל-10)',
  tip:d=>{const b=Math.max(d.l,d.r),n=10-b;return `להשלים קודם ל-10: ${b} + ${n} = 10, ואז עוד ${Math.min(d.l,d.r)-n}. עוזר לשחק עם 10 חפצים קטנים`;},
  hint:d=>`טִיפּ: תַּתְחִיל מִ-${E(Math.max(d.l,d.r))} וְתִסְפֹּר עוֹד ${E(Math.min(d.l,d.r))}`,
  visual:d=>({cap:'מְמַלְּאִים 10, וְאָז מוֹסִיפִים אֶת הַשְּׁאָר',svg:vMake10(d.l,d.r)}),
  similar:d=>differ(()=>{const a=R(3,9),b=R(11-a,9);return Math.random()<.5?bin(a,'+',b):bin(b,'+',a);},d),
  steps:d=>{const b=Math.max(d.l,d.r),s=Math.min(d.l,d.r),n=10-b,rest=s-n;
    return [`מַתְחִילִים מֵהַמִּסְפָּר הַגָּדוֹל: ${E(b)}`,`מַשְׁלִימִים לְ-10: ${E(`${b} + ${n} = 10`)}`,`${left(rest)} עוֹד ${rest}: ${E(`10 + ${rest} = ${d.res}`)}`,E(eqFull(d))];},
  teach:d=>['הִשְׁלַמְתִּי לְ-10',`סָפַרְתִּי מִ-${E(Math.max(d.l,d.r))} עוֹד ${E(Math.min(d.l,d.r))}`,'זָכַרְתִּי בְּעַל פֶּה']}));

const tensOnesSteps=(d,sign)=>{const ta=tens(d.l),tb=tens(d.r),oa=d.l%10,ob=d.r%10,add=sign==='+';const T=add?ta+tb:ta-tb,Ox=add?oa+ob:oa-ob,out=[];
  if(tb)out.push(`קֹדֶם הָעֲשָׂרוֹת: ${E(`${ta} ${sign} ${tb} = ${T}`)}`);
  if(ob)out.push(`אַחַר כָּךְ הָאֲחָדוֹת: ${E(`${oa} ${sign} ${ob} = ${Ox}`)}`);
  if(add&&Ox>=10)out.push(`${E(Ox)} אֲחָדוֹת ← עוֹד עֶשֶׂרֶת!`);
  if(T&&Ox&&(tb||ob))out.push(`בְּיַחַד: ${E(`${T} + ${Ox} = ${d.res}`)}`);
  out.push(E(eqFull(d)));return out;};
register('add-2d',binX({topic:()=>'חיבור עשרות ואחדות',tip:()=>'עשרות עם עשרות, אחדות עם אחדות. אפשר עם חבילות של 10 קשיות',
  hint:()=>'טִיפּ: עֲשָׂרוֹת עִם עֲשָׂרוֹת, אֲחָדוֹת עִם אֲחָדוֹת',
  visual:d=>({cap:'מְחַבְּרִים עֲשָׂרוֹת לַעֲשָׂרוֹת, וַאֲחָדוֹת לַאֲחָדוֹת',svg:vTensOnes(d.l,d.r,'+')}),
  similar:d=>differ(()=>{if(Math.min(d.l,d.r)<10){let b;do{b=R(11,89);}while(b%10>8);const s=R(1,9-b%10);return Math.random()<.5?bin(b,'+',s):bin(s,'+',b);}
    const at=R(1,7),a1=R(0,8),bt=R(1,8-at),b1=R(0,9-a1);return bin(at*10+a1,'+',bt*10+b1);},d),
  steps:d=>tensOnesSteps(d,'+'),
  teach:d=>['חִבַּרְתִּי עֲשָׂרוֹת וַאֲחָדוֹת',Math.min(d.l,d.r)<10?`סָפַרְתִּי מִ-${E(Math.max(d.l,d.r))} עוֹד ${E(Math.min(d.l,d.r))}`:'קָפַצְתִּי בַּעֲשָׂרוֹת עַל הַקַּו','זָכַרְתִּי בְּעַל פֶּה']}));

register('add-cross',binX({topic:()=>'חיבור עם מעבר עשרת',
  tip:d=>{const b=Math.max(d.l,d.r),s=Math.min(d.l,d.r);if(s<10){const up=tens(b)+10;return `להשלים לעשרת הבאה: ${b} + ${up-b} = ${up}, ואז עוד ${s-(up-b)}`;}return 'לחבר עשרות, לחבר אחדות. אם האחדות 10 או יותר - הן עוד עשרת';},
  hint:d=>{const b=Math.max(d.l,d.r),s=Math.min(d.l,d.r);return s<10?`טִיפּ: כַּמָּה חָסֵר לְ-${E(b)} עַד ${E(tens(b)+10)}?`:'טִיפּ: כְּשֶׁיֵּשׁ 10 אֲחָדוֹת אוֹ יוֹתֵר, נוֹצֶרֶת עוֹד עֶשֶׂרֶת';},
  visual:d=>{const b=Math.max(d.l,d.r),s=Math.min(d.l,d.r);if(s<10){const up=tens(b)+10,n=up-b,hops=[{a:b,b:up,lbl:'+'+n}];if(s>n)hops.push({a:up,b:d.res,lbl:'+'+(s-n)});
      return {cap:`קוֹפְצִים קֹדֶם עַד ${E(up)}`,svg:vLine(tens(b),Math.max(d.res,up)+ (d.res%10?10-d.res%10:0),hops,d.res)};}
    return {cap:'עֶשֶׂר אֲחָדוֹת הוֹפְכוֹת לְעֶשֶׂרֶת',svg:vBundle(d.l,d.r)};},
  similar:d=>differ(()=>{if(Math.min(d.l,d.r)<10){let b;do{b=R(12,88);}while(b%10<2);const s=R(10-b%10,Math.min(9,99-b));return Math.random()<.5?bin(b,'+',s):bin(s,'+',b);}
    const a1=R(2,9),b1=R(10-a1,9),at=R(1,7),bt=R(1,8-at);return bin(at*10+a1,'+',bt*10+b1);},d),
  steps:d=>{const b=Math.max(d.l,d.r),s=Math.min(d.l,d.r);if(s>=10)return tensOnesSteps(d,'+');const up=tens(b)+10,n=up-b,rest=s-n,out=[`מַתְחִילִים בְּ-${E(b)}`,`עַד ${E(up)} חָסֵר ${E(n)}: ${E(`${b} + ${n} = ${up}`)}`];
    if(rest>0)out.push(`${left(rest)} ${E(rest)}: ${E(`${up} + ${rest} = ${d.res}`)}`);out.push(E(eqFull(d)));return out;},
  teach:d=>[Math.min(d.l,d.r)<10?'הִשְׁלַמְתִּי לָעֶשֶׂרֶת הַבָּאָה':'חִבַּרְתִּי עֲשָׂרוֹת וַאֲחָדוֹת','קָפַצְתִּי עַל הַקַּו','זָכַרְתִּי בְּעַל פֶּה']}));

register('add-missing',binX({topic:()=>'מספר חסר בחיבור',tip:d=>{const k=d.miss==='r'?d.l:d.r;return `לשאול "כמה חסר מ-${k} עד ${d.res}?" ולספור קדימה יחד`;},
  hint:d=>`טִיפּ: כַּמָּה חָסֵר מִ-${E(d.miss==='r'?d.l:d.r)} עַד ${E(d.res)}?`,
  visual:d=>{const k=d.miss==='r'?d.l:d.r;if(d.res<=20)return {cap:'סוֹפְרִים אֶת הַקְּפִיצוֹת',svg:vLine(Math.max(0,Math.min(k,d.res-10)),Math.max(10,d.res),range(k,d.res-1).map(v=>({a:v,b:v+1,c:GR})))};
    const up=k%10?tens(k)+10:k,hops=[];if(up>k)hops.push({a:k,b:up,lbl:'+?'});for(let v=up;v<d.res;v+=10)hops.push({a:v,b:Math.min(d.res,v+10),lbl:'+'+(Math.min(d.res,v+10)-v)});
    return {cap:`מִ-${E(k)} קוֹפְצִים עַד ${E(d.res)}`,svg:vLine(tens(k),d.res%10?tens(d.res)+10:d.res,hops)};},
  similar:d=>differ(()=>{let res,k;if(d.res<=10){res=R(3,10);k=R(1,res-1);}else if(d.res<=20){res=R(11,20);k=R(2,res-2);}else if(d.res===100){res=100;k=R(11,89);}else{res=R(30,99);k=R(11,res-5);}
    const x=d.miss==='r'?bin(k,'+',res-k,'r'):bin(res-k,'+',k,'l');return x;},d),
  steps:d=>{const k=d.miss==='r'?d.l:d.r,a=d.ans,fin=d.miss==='r'?`${k} + ${a} = ${d.res}`:`${a} + ${k} = ${d.res}`;
    if(a<=10)return [`מַתְחִילִים בְּ-${E(k)} וְסוֹפְרִים עַד ${E(d.res)}: ${E(range(k+1,d.res).join(', '))}`,a===1?'סָפַרְנוּ אֶחָד':`סָפַרְנוּ ${E(a)}`,E(fin)];
    const up=tens(k)+10;if(k%10===0||up>=d.res)return [`${E(`${d.res} − ${k} = ${a}`)}`,E(fin)];
    return [`עַד ${E(up)}: ${E(`${k} + ${up-k} = ${up}`)}`,`וְעַד ${E(d.res)}: ${E(`${up} + ${d.res-up} = ${d.res}`)}`,`בְּיַחַד: ${E(`${up-k} + ${d.res-up} = ${a}`)}`,E(fin)];},
  teach:()=>['סָפַרְתִּי קָדִימָה','חִסַּרְתִּי','זָכַרְתִּי בְּעַל פֶּה']}));

register('sub-10',binX({topic:()=>'חיסור עד 10',tip:d=>`לשים ${d.l} חפצים, להוריד ${d.r} ולספור מה נשאר`,
  hint:d=>`טִיפּ: תַּתְחִיל מִ-${E(d.l)} וְתִסְפֹּר ${E(d.r)} אָחוֹרָה`,
  visual:d=>({cap:`מוֹחֲקִים ${E(d.r)}, וְסוֹפְרִים מַה שֶּׁנִּשְׁאַר`,svg:vTake(d.l,d.r)}),
  similar:d=>differ(()=>{const l=R(3,10);return bin(l,'−',R(1,l-1));},d),
  steps:d=>[`יֵשׁ ${E(d.l)}. מוֹרִידִים ${E(d.r)}`,`סוֹפְרִים אָחוֹרָה: ${E(range(d.l-1,d.res,-1).join(', '))}`,E(eqFull(d))],
  teach:d=>[`סָפַרְתִּי אָחוֹרָה מִ-${E(d.l)}`,`חָשַׁבְתִּי: ${E(`${d.r} + ? = ${d.l}`)}`,'זָכַרְתִּי בְּעַל פֶּה']}));

register('sub-thru10',binX({topic:()=>'חיסור דרך 10',tip:d=>{const o=d.l%10;return `לרדת קודם עד 10: ${d.l} − ${o} = 10, ואז להוריד עוד ${d.r-o}`;},
  hint:()=>'טִיפּ: קֹדֶם תֵּרֵד עַד 10',
  visual:d=>({cap:'יוֹרְדִים קֹדֶם עַד 10, וְאָז עוֹד',svg:vThru10(d.l,d.r)}),
  similar:d=>differ(()=>{const l=R(11,18);return bin(l,'−',R(l%10+1,9));},d),
  steps:d=>{const o=d.l%10;return [`קֹדֶם יוֹרְדִים עַד 10: ${E(`${d.l} − ${o} = 10`)}`,`צָרִיךְ לְהוֹרִיד עוֹד ${E(d.r-o)}: ${E(`10 − ${d.r-o} = ${d.res}`)}`,E(eqFull(d))];},
  teach:d=>['יָרַדְתִּי קֹדֶם עַד 10',`חָשַׁבְתִּי: ${E(`${d.r} + ? = ${d.l}`)}`,'סָפַרְתִּי אָחוֹרָה']}));

register('sub-2d',binX({topic:()=>'חיסור עשרות ואחדות',tip:()=>'עשרות מעשרות, אחדות מאחדות. אפשר עם מקלות וחבילות של 10',
  hint:()=>'טִיפּ: עֲשָׂרוֹת מֵעֲשָׂרוֹת, אֲחָדוֹת מֵאֲחָדוֹת',
  visual:d=>({cap:'מוֹחֲקִים עֲשָׂרוֹת מֵהָעֲשָׂרוֹת, וַאֲחָדוֹת מֵהָאֲחָדוֹת',svg:vTakeBT(d.l,d.r)}),
  similar:d=>differ(()=>{if(d.r<10){let l;do{l=R(12,99);}while(l%10===0);return bin(l,'−',R(1,l%10));}const at=R(2,9),a1=R(0,9),bt=R(1,at-1),b1=R(0,a1);return bin(at*10+a1,'−',bt*10+b1);},d),
  steps:d=>tensOnesSteps(d,'−'),
  teach:()=>['הוֹרַדְתִּי עֲשָׂרוֹת וַאֲחָדוֹת','סָפַרְתִּי אָחוֹרָה','זָכַרְתִּי בְּעַל פֶּה']}));

register('sub-cross',binX({topic:()=>'חיסור עם פריטה (מעבר עשרת)',tip:()=>'להוריד קודם את העשרות, אחר כך לרדת עד העשרת העגולה, ומשם את השאר',
  hint:d=>d.r>=10?'טִיפּ: קֹדֶם תּוֹרִיד אֶת הָעֲשָׂרוֹת':`טִיפּ: קֹדֶם תֵּרֵד עַד ${E(tens(d.l))}`,
  visual:d=>{const tr=tens(d.r),o=d.r%10,m=d.l-tr,hops=[];if(tr)hops.push({a:d.l,b:m,lbl:'−'+tr});const mo=m%10;if(mo){hops.push({a:m,b:tens(m),lbl:'−'+mo});hops.push({a:tens(m),b:d.res,lbl:'−'+(o-mo)});}else hops.push({a:m,b:d.res,lbl:'−'+o});
    return {cap:'קוֹפְצִים אָחוֹרָה בַּחֲלָקִים',svg:vLine(tens(d.res),d.l%10?tens(d.l)+10:d.l,hops,d.res)};},
  similar:d=>differ(()=>{if(d.r<10){let l;do{l=R(21,99);}while(l%10>8);return bin(l,'−',R(l%10+1,9));}const at=R(3,9),a1=R(0,8),b1=R(a1+1,9),bt=R(1,at-2);return bin(at*10+a1,'−',bt*10+b1);},d),
  steps:d=>{const tr=tens(d.r),o=d.r%10,m=d.l-tr,mo=m%10,out=[];if(tr)out.push(`קֹדֶם מוֹרִידִים עֲשָׂרוֹת: ${E(`${d.l} − ${tr} = ${m}`)}`);
    if(mo){out.push(`יוֹרְדִים עַד ${E(tens(m))}: ${E(`${m} − ${mo} = ${tens(m)}`)}`);out.push(`וְעוֹד ${E(o-mo)}: ${E(`${tens(m)} − ${o-mo} = ${d.res}`)}`);}
    else out.push(`מוֹרִידִים אֶת הָאֲחָדוֹת: ${E(`${m} − ${o} = ${d.res}`)}`);out.push(E(eqFull(d)));return out;},
  teach:()=>['יָרַדְתִּי קֹדֶם עַד הָעֶשֶׂרֶת','קָפַצְתִּי אָחוֹרָה עַל הַקַּו','זָכַרְתִּי בְּעַל פֶּה']}));

register('sub-missing',binX({topic:()=>'מספר חסר בחיסור',tip:d=>`לשאול "כמה צריך להוריד מ-${d.l} כדי שיישאר ${d.res}?" או לספור מ-${d.res} עד ${d.l}`,
  hint:d=>`טִיפּ: כַּמָּה צָרִיךְ לְהוֹרִיד מִ-${E(d.l)} כְּדֵי לְהַגִּיעַ לְ-${E(d.res)}?`,
  visual:d=>d.l<=10?{cap:`מוֹרִידִים עַד ${d.res===1?'שֶׁנִּשְׁאָר':'שֶׁנִּשְׁאָרִים'} ${E(d.res)}`,svg:vTake(d.l,d.l-d.res)}:{cap:`מִ-${E(d.res)} סוֹפְרִים עַד ${E(d.l)}`,svg:d.l-d.res<=20?vLine(tens(d.res),d.l%10?tens(d.l)+10:d.l,range(d.res,d.l-1).map(v=>({a:v,b:v+1,c:GR,dt:200}))):vLine(tens(d.res),d.l%10?tens(d.l)+10:d.l,[{a:d.res,b:d.l,lbl:'?'}])},
  similar:d=>differ(()=>{let l,res;if(d.l<=10){l=R(3,10);res=R(1,l-1);}else if(d.l<=20){l=R(11,20);res=R(2,l-2);}else{l=R(30,99);res=R(10,l-5);}return bin(l,'−',l-res,'r');},d),
  steps:d=>{const a=d.ans;return [`כַּמָּה צָרִיךְ לְהוֹרִיד מִ-${E(d.l)} כְּדֵי לְהַגִּיעַ לְ-${E(d.res)}?`,a<=10?`סוֹפְרִים מִ-${E(d.res)} עַד ${E(d.l)}: ${E(range(d.res+1,d.l).join(', '))}`:E(`${d.l} − ${d.res} = ${a}`),E(`${d.l} − ${a} = ${d.res}`)];},
  teach:()=>['סָפַרְתִּי קָדִימָה','חָשַׁבְתִּי עַל חִבּוּר','זָכַרְתִּי בְּעַל פֶּה']}));

register('mul-fact',binX({topic:d=>`לוח הכפל של ${d.k}`,tip:d=>`לבנות ${d.l} קבוצות של ${d.r} עם חפצים ולספור בקפיצות של ${d.r}`,
  hint:d=>d.l<2||d.r<2?(d.l===0||d.r===0?'טִיפּ: כָּל מִסְפָּר כָּפוּל 0 הוּא 0':'טִיפּ: כָּל מִסְפָּר כָּפוּל 1 נִשְׁאָר אוֹתוֹ מִסְפָּר'):`טִיפּ: ${E(d.l)} קְבוּצוֹת שֶׁל ${E(d.r)}. תִּקְפֹּץ בִּקְפִיצוֹת שֶׁל ${E(d.r)}`,
  visual:d=>d.l<1||d.r<1?{cap:'כָּל מִסְפָּר כָּפוּל 0 הוּא 0'}:{cap:d.l===1?`קְבוּצָה אַחַת שֶׁל ${E(d.r)}`:`${E(d.l)} קְבוּצוֹת שֶׁל ${E(d.r)}`,svg:vArray(d.l,d.r)},
  similar:d=>differ(()=>{if(d.l<2||d.r<2){const sp=d.l<2?d.l:d.r,n=R(2,10),x=d.l<2?bin(sp,'×',n):bin(n,'×',sp);x.k=n;if(sp)x.f=[n,sp];return x;}
    const n=R(2,10),flip=d.r===d.k&&d.l!==d.k;const x=flip?bin(n,'×',d.k):bin(d.k,'×',n);x.k=d.k;x.f=[d.k,n];return x;},d),
  steps:d=>{if(d.l<2||d.r<2)return [d.l===0||d.r===0?'כָּל מִסְפָּר כָּפוּל 0 הוּא 0':'כָּל מִסְפָּר כָּפוּל 1 נִשְׁאָר אוֹתוֹ מִסְפָּר',E(eqFull(d))];
    return [`${E(d.l)} קְבוּצוֹת שֶׁל ${E(d.r)}`,`סוֹפְרִים בִּקְפִיצוֹת שֶׁל ${E(d.r)}: ${E(range(1,d.l).map(i=>i*d.r).join(', '))}`,E(eqFull(d))];},
  teach:d=>[`קָפַצְתִּי בִּקְפִיצוֹת שֶׁל ${E(d.r)}`,`חִבַּרְתִּי ${E(d.r)} שׁוּב וָשׁוּב`,'זָכַרְתִּי אֶת לוּחַ הַכֶּפֶל']}));

register('div-fact',binX({topic:d=>`חילוק ב-${d.r}`,tip:d=>`לחלק ${d.l} חפצים ל-${d.r} ערימות שוות, או לשאול "${d.r} כפול כמה זה ${d.l}?"`,
  hint:d=>`טִיפּ: חֲשֹׁב עַל הַכֶּפֶל: ${E(`${d.r} × ? = ${d.l}`)}`,
  visual:d=>d.l<=40?{cap:`מְחַלְּקִים ${E(d.l)} לְ-${E(d.r)} קְבוּצוֹת שָׁווֹת`,svg:vShare(d.l,d.r)}:{cap:`קְפִיצוֹת שֶׁל ${E(d.r)} עַד ${E(d.l)}. כַּמָּה קְפִיצוֹת?`,svg:vLine(0,d.l,range(1,d.res).map(i=>({a:(i-1)*d.r,b:i*d.r,lbl:i===d.res?'?':i,c:BL,dt:380})))},
  similar:d=>differ(()=>bin(d.r*R(2,10),':',d.r),d),
  steps:d=>[`סוֹפְרִים בִּקְפִיצוֹת שֶׁל ${E(d.r)} עַד ${E(d.l)}: ${E(range(1,d.res).map(i=>i*d.r).join(', '))}`,d.res===1?'סָפַרְנוּ קְפִיצָה אַחַת':`סָפַרְנוּ ${E(d.res)} קְפִיצוֹת`,E(`${d.r} × ${d.res} = ${d.l}`),E(eqFull(d))],
  teach:d=>['חָשַׁבְתִּי עַל הַכֶּפֶל','חִלַּקְתִּי לִקְבוּצוֹת',`קָפַצְתִּי בִּקְפִיצוֹת שֶׁל ${E(d.r)}`]}));

const sym=(a,b)=>a<b?'&lt;':a>b?'&gt;':'=';
register('cmp',{topic:()=>'השוואת מספרים',tip:()=>'להשוות קודם את הספרה השמאלית (מאות או עשרות). אם הן שוות - את הספרה הבאה',
  show:d=>`${d.a} ? ${d.b}`,
  hint:d=>d.max>100?'טִיפּ: קֹדֶם מַשְׁוִים אֶת הַמֵּאוֹת':'טִיפּ: קֹדֶם מַשְׁוִים אֶת הָעֲשָׂרוֹת',
  visual:d=>({cap:'מַשְׁוִים סִפְרָה אַחֲרֵי סִפְרָה, מִשְּׂמֹאל',svg:vPlace(d.a,d.b)}),
  similar:d=>{const lo=d.max>100?100:10,hi=d.max-1;let a,b;do{a=R(lo,hi);b=Math.random()<.5?a-a%10+R(0,9):R(lo,hi);}while(a===b||b<lo||b>hi||(a===d.a&&b===d.b));return {a,b,max:d.max};},
  example:d=>{const n=String(Math.max(d.a,d.b)).length,A_=String(d.a).padStart(n,'0'),B_=String(d.b).padStart(n,'0'),names=['סִפְרַת הַמֵּאוֹת','סִפְרַת הָעֲשָׂרוֹת','סִפְרַת הָאֲחָדוֹת'].slice(3-n),out=[];
    for(let i=0;i<n;i++){out.push(`${names[i]}: ${E(A_[i])} וְ-${E(B_[i])}`);if(A_[i]!==B_[i]){out.push(E(`${A_[i]} ${sym(+A_[i],+B_[i])} ${B_[i]}`));break;}}
    out.push(d.a===d.b?`הַמִּסְפָּרִים שָׁוִים: ${E(`${d.a} = ${d.b}`)}`:`אָז ${E(`${d.a} ${sym(d.a,d.b)} ${d.b}`)}`);return {steps:out,ans:sym(d.a,d.b)};},
  teach:()=>['הִשְׁוֵיתִי קֹדֶם אֶת הַסִּפְרָה הַשְּׂמָאלִית','דִּמְיַנְתִּי אֶת הַמִּסְפָּרִים עַל הַקַּו','רָאִיתִי מִי גָּדוֹל יוֹתֵר']});

const tstr=(h,m)=>`${h}:${String(m).padStart(2,'0')}`;
register('clock',{topic:()=>'קריאת שעון',tip:()=>'להסתכל קודם על המחוג הקצר (שעות), ואז על הארוך (דקות, בקפיצות של 5). אפשר עם שעון אמיתי בבית',
  show:d=>'מָה הַשָּׁעָה?',
  hint:d=>d.m===0?'טִיפּ: הַמָּחוֹג הַקָּצָר מַרְאֶה אֶת הַשָּׁעָה':'טִיפּ: קֹדֶם הַמָּחוֹג הַקָּצָר, אַחַר כָּךְ הָאָרֹךְ',
  visual:d=>({cap:'הַקָּצָר הַכָּתֹם ← שָׁעוֹת · הָאָרֹךְ הַכָּחֹל ← דַּקּוֹת',svg:vClock(d.h,d.m)}),
  similar:d=>{let h;do{h=R(1,12);}while(h===d.h);return {h,m:d.m};},
  example:d=>({steps:[`הַמָּחוֹג הַקָּצָר ${d.m?'אַחֲרֵי':'עַל'} ${E(d.h)} ← שָׁעָה ${E(d.h)}`,d.m===0?`הַמָּחוֹג הָאָרֹךְ עַל ${E(12)} ← שָׁעָה עֲגֻלָּה`:`הַמָּחוֹג הָאָרֹךְ עַל ${E(d.m/5)} ← ${E(d.m)} דַּקּוֹת`,`הַשָּׁעָה ${E(tstr(d.h,d.m))}`],ans:tstr(d.h,d.m)}),
  teach:()=>['הִסְתַּכַּלְתִּי קֹדֶם עַל הַמָּחוֹג הַקָּצָר','סָפַרְתִּי דַּקּוֹת בִּקְפִיצוֹת שֶׁל 5','זָכַרְתִּי אֵיךְ נִרְאֶה הַשָּׁעוֹן']});

const FR=['חֲצִי','שְׁלִישׁ','רֶבַע'];
register('frac',{topic:()=>'שברים (חצי, שליש, רבע)',tip:()=>'לספור לכמה חלקים שווים חילקו: 2 חצי, 3 שליש, 4 רבע. אפשר לחתוך יחד פיצה או עוגה',
  show:()=>'אֵיזֶה חֵלֶק צָבוּעַ?',
  hint:()=>'טִיפּ: סְפֹר לְכַמָּה חֲלָקִים שָׁוִים חִלְּקוּ',
  visual:d=>({cap:`${E(2)} חֲלָקִים ← חֲצִי · ${E(3)} ← שְׁלִישׁ · ${E(4)} ← רֶבַע`,svg:vFrac(d.parts,d.shape)}),
  similar:d=>({parts:pick([2,3,4].filter(x=>x!==d.parts)),shape:pick(['circle','bar'])}),
  example:d=>({steps:[`סוֹפְרִים אֶת הַחֲלָקִים: ${E(range(1,d.parts).join(', '))}`,`${E(d.parts)} חֲלָקִים שָׁוִים ← ${FR[d.parts-2]}`,`הַחֵלֶק הַצָּבוּעַ הוּא ${FR[d.parts-2]}`],ans:FR[d.parts-2]}),
  teach:()=>['סָפַרְתִּי אֶת הַחֲלָקִים','חָשַׁבְתִּי עַל פִּיצָה','זָכַרְתִּי אֶת הַשֵּׁמוֹת']});

/* word problems (and place value stories): the game's own tip + steps */
const capOnly=h=>String(h||'').split(/<div|<svg/)[0].trim();
const fillQ=(l,ans)=>l.replace('?',ans);
register('story',{topic:()=>'בעיה מילולית',tip:()=>'לקרוא יחד לאט, לשאול "מה קרה בסיפור?", לצייר אותו, ואז לבחור תרגיל',
  show:d=>d.q.tx,
  hint:d=>capOnly(d.q.h1)?`טִיפּ: ${capOnly(d.q.h1)}`:'טִיפּ: קְרָא שׁוּב לְאַט',
  visual:d=>({cap:capOnly(d.q.h1)||'קוֹרְאִים לְאַט',html:(/<div|<svg/.test(d.q.h1||'')?String(d.q.h1).slice(capOnly(d.q.h1).length):'')+(d.q.st&&d.q.st.length?stepsHTML(d.q.st):'')}),
  example:d=>({intro:d.q.tx,steps:[...(capOnly(d.q.h1)?[capOnly(d.q.h1)]:[]),...(d.q.st||[]).map(l=>E(fillQ(l,d.q.ans))),`תְּשׁוּבָה: ${E(d.q.ans)} ${d.q.u||''}`.trim()],ans:d.q.ans}),
  teach:()=>['מָצָאתִי מִלָּה שֶׁאוֹמֶרֶת מָה לַעֲשׂוֹת','דִּמְיַנְתִּי אֶת הַסִּפּוּר','כָּתַבְתִּי תַּרְגִּיל בָּרֹאשׁ']});

/* anything else from the math worlds: the game's own hint pictures and step lines */
const genericSteps=q=>{const o4=O4();if(q.k==='ch')return [capOnly(q.h1),capOnly(q.h2),`הַתְּשׁוּבָה: ${E(q.opts[q.ans])}`].filter(Boolean);
  let lines=[];try{lines=q.k==='eq'?(q.st||[]):(o4.hintData?o4.hintData(q).s:[]);}catch(e){}
  const out=lines.map(l=>E(fillQ(l,q.ans)));
  if(q.k==='bin')out.push(E(`${q.l} ${q.op} ${q.r} = ${q.res}`));
  else if(q.k==='add3')out.push(E(`${q.a} + ${q.b} + ${q.c} = ${q.ans}`));
  else if(q.k==='rem')out.push(`${E(`${q.p} : ${q.d} = ${q.qq}`)} שְׁאֵרִית ${E(q.r)}`);
  else if(q.k==='eq')out.push(E(q.toks.map(t=>t==='?'?q.ans:t).join(' ')));
  return out;};
register('generic',{topic:d=>plain(d.topic)||'תרגיל',tip:()=>'לפתור יחד לאט, בשלבים קטנים, ולתת לו להסביר כל שלב',
  show:d=>{const q=d.q;return q.k==='bin'?eqShow(q):q.k==='add3'?`${q.a} + ${q.b} + ${q.c} = ?`:q.k==='rem'?`${q.p} : ${q.d} = ?`:q.k==='eq'?q.toks.join(' '):strip(q.pr||'');},
  hint:d=>{const q=d.q;let c=capOnly(q.h1);if(!c){try{const v=O4().hintHTML(q,1);const m=/<div class="cap"><span>([\s\S]*?)<\/span><\/div>/.exec(v)||/<div class="cap">([\s\S]*?)<\/div>/.exec(v);c=m?m[1]:'';}catch(e){}}return c?`טִיפּ: ${c}`:'טִיפּ: נַסֵּה לְאַט, שָׁלָב אַחֲרֵי שָׁלָב';},
  visual:d=>{const q=d.q;let html='';try{html=O4().hintHTML(q,q.k==='bin'||q.k==='add3'||q.k==='rem'?1:2);}catch(e){}return {cap:'',html};},
  example:d=>({intro:d.q.k==='ch'?d.q.pr:'',steps:genericSteps(d.q),ans:d.q.k==='ch'?d.q.opts[d.q.ans]:d.q.k==='rem'?d.q.qq:d.q.ans})});

/* reading a word: first sound → syllables → whole word */
const firstSound=w=>{const m=/^([א-ת])([֑-ׇ]*)/.exec(w);if(!m)return String(w).slice(0,1);let s=m[0];const rest=w.slice(s.length);
  if(!/[ְ-ׇֻ]/.test(m[2])&&/^ו[ֹּ]/.test(rest))s+=rest.slice(0,2);                 /* כּוֹ, עוּ */
  else if(/[ִֵֶ]/.test(m[2])&&/^י(?![֑-ׇ])/.test(rest))s+='י';                 /* סִי, בֵּי */
  return s;};
register('read',{reading:true,topic:()=>'קריאת מילה',tip:d=>`לקרוא יחד: קודם הצליל הראשון, אחר כך הברה הברה (${d.syl.map(plain).join('-')}), ואז את כל המילה`,
  show:d=>d.w,
  hint:d=>({t:`טִיפּ: הַצְּלִיל הָרִאשׁוֹן הוּא <span class="hlp-big">${firstSound(d.w)}</span>`,say:`הַצְּלִיל הָרִאשׁוֹן: ${firstSound(d.w)}`}),
  visual:d=>({cap:'לְאַט, חֵלֶק אַחֲרֵי חֵלֶק:',html:`<div class="hlp-syl">${d.syl.map((s,i)=>`<span${A(300+i*1000,{op:1})} style="opacity:.25">${s}</span>`).join('<i>·</i>')}</div>`,sayParts:d.syl}),
  whole:d=>({t:`הַמִּלָּה הִיא: <span class="hlp-big">${d.w}</span>`,say:d.w})});

/* ---------- which explainer fits a question ---------- */
function classify(q,ctx){if(!q||typeof q!=='object')return null;ctx=ctx||{};
  if(q.help&&REG[q.help.type])return Object.assign({q},q.help);
  const g=(type,x)=>REG[type]?Object.assign({type,q},x):null;
  if(q.k==='bin'){const {l,r,res,op,miss}=q,o=Object.assign({},{l,r,res,op,miss:miss||'res',ans:q.ans});
    if(op==='+'){if(o.miss!=='res')return res<=100?g('add-missing',o):g('generic',{topic:ctx.topic});
      if(res<=10)return g('add-10',o);if(l<10&&r<10)return g('add-make10',o);
      if(res<100)return (l%10)+(r%10)>=10?g('add-cross',o):g('add-2d',o);return g('generic',{topic:ctx.topic});}
    if(op==='−'){if(o.miss!=='res')return l<=100&&o.miss==='r'?g('sub-missing',o):g('generic',{topic:ctx.topic});
      if(l<=10)return g('sub-10',o);if(l<100){if(l%10>=r%10)return g('sub-2d',o);if(l<20&&r<10)return g('sub-thru10',o);return g('sub-cross',o);}return g('generic',{topic:ctx.topic});}
    if(op==='×'&&o.miss==='res'&&l<=10&&r<=10)return g('mul-fact',Object.assign(o,{k:q.f?q.f[0]:(r<=l?r:l)}));
    if(op===':'&&o.miss==='res'&&r>=1&&r<=10&&res<=10)return g('div-fact',o);
    return g('generic',{topic:ctx.topic});}
  if(q.k==='ch'&&q.chk){const c=q.chk;
    if(c.t==='cmp')return g('cmp',{a:c.a,b:c.b,max:Math.max(c.a,c.b)>=100?1000:100});
    if(c.t==='clock')return g('clock',{h:c.h,m:c.m});
    if(c.t==='frac')return g('frac',{parts:c.parts,shape:/<path/.test(q.pr)?'circle':'bar'});
    return null;}                                    /* other check types (pictures, shapes, graphs from the gaps pack): no step-by-step explainer yet, the game's own hint stays */
  if(q.k==='word')return g('story',{});
  if(['add3','rem','eq','ch'].includes(q.k))return g('generic',{topic:ctx.topic});
  if(q.k==='col')return null;                       /* column math keeps its own guided steps */
  const W=T().WORDS,W2=(window.READBANK2||{}).words;if((W||W2)&&(q.key||q.w)){const k=q.key||q.w;const w=(W&&W.find(x=>x.w===k))||(W2&&W2.find(x=>x.w===k&&x.syl&&x.syl.length));if(w)return g('read',{w:w.w,syl:w.syl});}
  return null;}

/* ---------- saved data: hard items, spaced return, teach-back log ---------- */
const DB=()=>{const s=O().save||(window.__helpSave=window.__helpSave||{});s.help=s.help||{items:{},tb:[],t:0};s.help.items=s.help.items||{};s.help.tb=s.help.tb||[];return s.help;};
const persist=()=>{try{if(O().persist)O().persist();}catch(e){}};
const dstr=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today=()=>HELP._today?HELP._today():dstr(new Date());
const addDays=(ds,n)=>{const [y,m,dd]=ds.split('-').map(Number);return dstr(new Date(y,m-1,dd+n));};
const keyOf=d=>{const t=d.type+'|';if(d.op&&d.l!=null)return t+[d.l,d.op,d.r,d.miss||'res'].join(' ');if(d.a!=null&&d.b!=null)return t+d.a+'?'+d.b;if(d.h!=null)return t+d.h+':'+d.m;if(d.parts)return t+d.parts;if(d.w)return t+d.w;
  const q=d.q||{};return (t+(O4().qkey?O4().qkey(q):JSON.stringify([q.k,q.key,q.tx,q.pr]))).slice(0,300);};
function sanitize(q){const c=Object.assign({},q);delete c.fromHelp;delete c.fromRq;for(const f of ['h1','h2'])if(typeof c[f]==='string')c[f]=c[f].replace(/<div class="(share|bt|tf|pairs|btwrap|ptab)">[\s\S]*$/,'');
  for(const k of Object.keys(c))if(typeof c[k]==='function')delete c[k];const j=JSON.stringify(c);return j.length<4500?c:null;}
function recordStuck(st){const d=st.d,ex=st.ex,db=DB(),k=keyOf(d);let it=db.items[k];const t=today();
  if(!it){it=db.items[k]={type:d.type,topic:ex.topic(d,st.ctx),example:plain(ex.show?ex.show(d):''),tip:ex.tip?ex.tip(d):'',unit:st.ctx.unit||'',first:t,n:0,ok:0};
    const q=st.q&&sanitize(st.q);if(q)it.q=q;}
  it.n++;it.last=t;it.due=addDays(t,1);it.ok=0;delete it.okd;
  const ks=Object.keys(db.items);if(ks.length>cfg.keep){ks.sort((a,b)=>(db.items[b].ok-db.items[a].ok)||String(db.items[a].last).localeCompare(db.items[b].last));
    for(const x of ks.slice(0,ks.length-cfg.keep))delete db.items[x];}
  persist();return k;}
function due(n,filter){n=n==null?1:n;const db=DB(),t=today(),out=[];
  const list=Object.entries(db.items).filter(([k,it])=>!it.ok&&it.q&&it.due&&it.due<=t&&it.served!==t&&(!filter||((!filter.unit||String(it.unit).split('-')[0]===String(filter.unit).split('-')[0])&&(!filter.types||filter.types.includes(it.type)))))
    .sort((a,b)=>a[1].due.localeCompare(b[1].due));
  for(const [k,it] of list.slice(0,n)){it.served=t;out.push(Object.assign(JSON.parse(JSON.stringify(it.q)),{fromHelp:k}));}
  if(out.length)persist();return out;}
function stuckList(){const db=DB();return Object.entries(db.items).map(([key,it])=>({key,type:it.type,topic:it.topic,example:it.example,tip:it.tip,unit:it.unit,first:it.first,last:it.last,times:it.n,understood:!!it.ok,understoodOn:it.okd||null,due:it.due,
    line:`נתקע ב: ${it.topic}${it.example?` (${it.example})`:''}. טיפ: ${it.tip}`+(it.ok?' ✓ הובן':'')}))
  .sort((a,b)=>(a.understood-b.understood)||String(b.last).localeCompare(a.last));}
function parentHTML(){const l=stuckList();if(!l.length)return '<div class="hlp-par empty">לא נתקע לאחרונה</div>';
  return `<div class="hlp-par">${l.slice(0,12).map(x=>`<div class="${x.understood?'ok':''}"><b>נתקע ב:</b> ${esc(x.topic)}${x.example?` <span class="ltr">(${esc(x.example)})</span>`:''}<br><b>טיפ:</b> ${esc(x.tip)}${x.understood?' <span class="okm">✓ הובן</span>':x.times>1?` <span class="n">(${x.times} פעמים)</span>`:''}</div>`).join('')}</div>`;}

/* ---------- UI ---------- */
const pet=()=>{try{return O().PET().s();}catch(e){return '';}};
const el=(cls,html)=>{const e=document.createElement('div');e.className=cls;if(html!=null)e.innerHTML=html;return e;};
let S=null,pend=null,ovOwn=false;
function panel(){if(!S)return null;let p=S.panel;const m=S.ctx.mount||document.querySelector('#sPlay:not([hidden]) .left')||document.querySelector('#sTal:not([hidden]) .tq');
  if(!m)return null;if(!p||!p.isConnected){p=el('hlp');p.setAttribute('role','status');m.appendChild(p);S.panel=p;}return p;}
function showPanel(level,html,sayText){const p=panel();if(!p)return;p.dataset.level=level;p.innerHTML=`<div class="hlp-f">${pet()}</div><div class="hlp-b">${html}</div>`;
  p.classList.remove('in');void p.offsetWidth;p.classList.add('in');const v=p.querySelector('.hlp-v');if(v){play(v);v.onclick=()=>play(v);}
  try{O().sfx&&O().sfx.pop&&O().sfx.pop(2);}catch(e){}if(sayText)say(sayText);
  if(p.scrollIntoView&&!window.__fast)setTimeout(()=>{try{p.scrollIntoView({block:'nearest',behavior:'smooth'});}catch(e){}},60);}
function hidePanel(){if(S&&S.panel){S.panel.remove();S.panel=null;}}
const ov=()=>document.getElementById('ov');
function openOv(html,cls){const o=ov();if(!o)return null;o.hidden=false;o.innerHTML=`<div class="card hlpc ${cls||''}">${html}</div>`;ovOwn=true;return o.firstChild;}
function closeOv(){const o=ov();if(o&&ovOwn&&o.querySelector('.hlpc')){o.hidden=true;o.innerHTML='';}ovOwn=false;}
const ovOpen=()=>{const o=ov(),dl=document.getElementById('dlg');return (o&&!o.hidden)||(dl&&!dl.hidden);};
const btn=(cls,html,f)=>{const b=document.createElement('button');b.className=cls;b.innerHTML=html;b.onclick=f;return b;};

function arm(){if(!S)return;clearTimeout(S.idleT);const ms=+((((O().save||{}).set||{}).helpIdle)||0)*1000||cfg.idle;
  S.idleT=setTimeout(()=>{if(!S)return;if(S.ctx.mount&&!S.ctx.mount.isConnected)return stop();if(document.hidden||ovOpen()||S.busy)return arm();onIdle();},ms);}
function onIdle(){if(!S)return;if(S.phase==='solo'){if(S.level===0)step(1);else arm();return;}
  if(S.level<(S.ex.reading?3:3))step(S.level+1);else arm();}
function step(n){const st=S;if(!st)return;st.level=n;const ex=st.ex,d=st.d;
  if(n===1&&st.phase!=='solo'&&!st.key)st.key=recordStuck(st);
  if(ex.reading){
    if(n===1){const h=ex.hint(d);showPanel(1,`<div class="hlp-t">${h.t}</div>`,h.say);}
    else if(n===2){const v=ex.visual(d);showPanel(2,`<div class="hlp-t">${v.cap}</div><div class="hlp-v">${v.html}</div>`);v.sayParts.forEach((s,i)=>setTimeout(()=>{if(S===st)say(s);},D(300+i*1000)));}
    else if(n===3){const h=ex.whole(d);showPanel(3,`<div class="hlp-t">${h.t}</div>`,h.say);}
    else parents();
    arm();return;}
  if(n===1){const h=ex.hint(d,st.ctx);showPanel(1,`<div class="hlp-t">${h}</div>`,h);}
  else if(n===2){const v=ex.visual(d,st.ctx)||{};const h=ex.hint(d,st.ctx);showPanel(2,`<div class="hlp-t sm">${h}</div>${v.cap?`<div class="hlp-cap">${v.cap}</div>`:''}<div class="hlp-v">${v.svg||''}${v.html||''}</div>`,v.cap||h);}
  else if(n===3){if(st.phase==='solo')return parents();example();return;}
  else if(n===4){solo();return;}
  else parents();
  arm();}
/* a similar question as data (for the worked example) and as a game question (for the solo try) */
function simData(st,avoid){const ex=st.ex;if(ex.similar){for(let i=0;i<20;i++){const x=Object.assign({type:st.d.type},ex.similar(st.d));if(!avoid||keyOf(x)!==avoid)return x;}}
  const q=simHostQ(st,avoid);return q?classify(q,st.ctx):null;}
function simHostQ(st,avoid){const gen=st.ctx.gen,k0=keyOf(st.d);if(gen){for(let i=0;i<120;i++){let q;try{q=gen(i);}catch(e){break;}const d=classify(q,st.ctx);if(!d||d.type!==st.d.type)continue;
      if(st.d.type==='generic'&&(q.k!==st.q.k||q.op!==st.q.op))continue;const k=keyOf(d);if(k!==k0&&k!==avoid)return q;}}
  if(st.ex.toQ&&st.ex.similar){for(let i=0;i<20;i++){const x=Object.assign({type:st.d.type},st.ex.similar(st.d));const k=keyOf(x);if(k!==avoid&&k!==k0){const q=st.ex.toQ(x);if(x.f)q.f=x.f;return q;}}}
  return null;}
function example(){const st=S;const d2=simData(st);if(!d2)return parents();st.d2=d2;st.busy=true;clearTimeout(st.idleT);
  const ex=REG[d2.type]||st.ex,e=ex.example(d2),v=ex.visual&&!['story','generic'].includes(d2.type)?ex.visual(d2):null,show=ex.show?ex.show(d2):'';
  const title=`בּוֹא נִפְתֹּר יַחַד אַחַת דּוֹמָה${show&&d2.type!=='story'&&d2.type!=='clock'&&d2.type!=='frac'?': '+E(esc(show)):''}`;
  const card=openOv(`<div class="hlp-h"><span class="hlp-f">${pet()}</span><h2>${title}</h2></div>${e.intro?`<div class="hlp-intro">${e.intro}</div>`:''}${v&&(v.svg||v.html)?`<div class="hlp-v">${v.svg||v.html||''}</div>`:''}<ol class="hlp-steps"></ol>`,'hlp-ex');
  if(!card){st.busy=false;return parents();}
  const vv=card.querySelector('.hlp-v');if(vv){play(vv);vv.onclick=()=>play(vv);}
  const ol=card.querySelector('.hlp-steps');say(title+'. '+(e.intro?strip(e.intro):''));
  let i=0;const next=()=>{if(S!==st||!card.isConnected)return;if(i<e.steps.length){const li=document.createElement('li');li.innerHTML=e.steps[i];ol.appendChild(li);say(e.steps[i]);i++;
      st.exT=setTimeout(next,D(Math.max(2400,strip(e.steps[i-1]).length*85)));return;}
    const row=el('btnrow');row.appendChild(btn('bigbtn hlp-go','<span>עַכְשָׁו תּוֹרִי!</span>',()=>{closeOv();st.busy=false;try{O().hush&&O().hush();}catch(e){}step(4);}));card.appendChild(row);};
  st.exT=setTimeout(next,D(e.intro?3200:1800));}
function solo(){const st=S;const q3=st.ctx.present?simHostQ(st,st.d2?keyOf(st.d2):null):null;
  if(!q3){st.phase='after';hidePanel();arm();return;}
  pend={q:q3,from:st};hidePanel();st.ctx.present(q3);}
function parents(){const st=S;if(!st)return;st.busy=true;clearTimeout(st.idleT);hidePanel();const ex=st.ex,d=st.d;
  const show=ex.show?ex.show(d):'',showHTML=st.q&&st.q.k==='ch'?`<div class="hlp-intro">${st.q.pr}</div>`:show?(/[א-ת]/.test(show)?`<div class="hlp-intro">${show}</div>`:`<div class="hlp-q">${E(esc(show))}</div>`):'';
  const card=openOv(`<div class="hlp-f big bob">${pet()}</div><h2>בּוֹא נִקְרָא לְאַבָּא אוֹ לְאִמָּא, נִפְתֹּר יַחַד</h2>${showHTML}${ex.tip?`<div class="hlp-tip">להורה: ${esc(ex.tip(d))}</div>`:''}`,'hlp-par-call');
  if(!card)return;const row=el('btnrow');row.appendChild(btn('bigbtn','<span>פָּתַרְנוּ יַחַד!</span>',()=>{closeOv();const c=st.ctx;if(S===st){S.busy=false;stop();}if(c.done)c.done('parents');}));card.appendChild(row);
  say('בּוֹא נִקְרָא לְאַבָּא אוֹ לְאִמָּא, נִפְתֹּר יַחַד');try{O().sfx&&O().sfx.star&&O().sfx.star(0);}catch(e){}}
function teach(st){const ex=st.ex;if(!ex.teach)return false;const opts=shuffle(ex.teach(st.d));
  const eq=st.d.l!=null&&st.d.op?E(eqFull(st.d)):'';const card=openOv(`<div class="hlp-h"><span class="hlp-f">${pet()}</span><h2>תַּסְבִּיר לִי, אֵיךְ עָשִׂיתָ?</h2></div>${eq?`<div class="hlp-q">${eq}</div>`:''}<div class="hlp-opts"></div>`,'hlp-tb');
  if(!card)return false;const box=card.querySelector('.hlp-opts');DB().t=Date.now();
  const done=pick_=>{const db=DB();db.tb.push({d:today(),type:st.d.type,ex:plain(ex.show?ex.show(st.d):''),pick:plain(pick_)});db.tb=db.tb.slice(-30);persist();
    box.innerHTML=`<div class="hlp-thanks">אֵיזֶה הֶסְבֵּר יָפֶה!</div>`;card.querySelector('.hlp-aloud')&&card.querySelector('.hlp-aloud').remove();say('אֵיזֶה הֶסְבֵּר יָפֶה!');try{O().sfx.ok(3);}catch(e){}setTimeout(closeOv,D(1500));};
  opts.forEach(o=>box.appendChild(btn('chb tx hlp-opt',`<span>${o}</span>`,()=>done(o))));
  card.appendChild(btn('hlp-aloud','🗣️ <span>אָמַרְתִּי בְּקוֹל</span>',()=>done('אמר בקול')));
  say('תַּסְבִּיר לִי, אֵיךְ עָשִׂיתָ?');return true;}

/* ---------- host API ---------- */
function start(q,ctx){stop(true);ctx=ctx||{};const d=classify(q,ctx);if(!d)return false;const ex=REG[d.type];if(!ex)return false;
  S={q,ctx,d,ex,wrong:0,level:0,phase:'orig',need:ctx.wrongs||2};
  if(pend&&pend.q===q){S.phase='solo';S.origKey=pend.from.key;pend=null;showPanel(0,`<div class="hlp-t">עַכְשָׁו אַתָּה לְבַד. אַתָּה יָכוֹל!</div>`,'עַכְשָׁו אַתָּה לְבַד. אַתָּה יָכוֹל!');}
  else pend=null;
  if(q.fromHelp)S.key=q.fromHelp;
  arm();return true;}
function wrong(){if(!S)return {level:0,off:true};const st=S;st.wrong++;
  if(st.q.fromHelp){const it=DB().items[st.q.fromHelp];if(it&&st.wrong===1){it.due=addDays(today(),1);it.n++;persist();}}
  if(st.busy)return {level:st.level};
  if(st.phase==='solo'){if(st.wrong>=2)parents();else arm();return {level:st.level,solo:true};}
  if(st.phase==='after'){parents();return {level:4};}
  if(st.level===0){if(st.wrong>=st.need)step(1);else arm();}else step(st.level+1);
  return {level:st.level};}
function right(){if(!S)return {solo:true,star:true};const st=S;const solo=st.level===0&&st.phase!=='after';
  clearTimeout(st.idleT);clearTimeout(st.exT);hidePanel();
  const db=DB();if(st.q.fromHelp&&db.items[st.q.fromHelp]){const it=db.items[st.q.fromHelp];if(solo&&st.wrong===0){it.ok=1;it.okd=today();}persist();}
  if(st.phase==='solo'&&st.origKey&&db.items[st.origKey])db.items[st.origKey].solo=today();
  const helped=st.level>0||st.phase==='solo';const p=helped?cfg.teachP:cfg.teachSoloP;
  if(st.ex.teach&&Date.now()-(db.t||0)>cfg.teachGap&&Math.random()<p&&st.ctx.teach!==false)setTimeout(()=>{if(!ovOpen())teach(st);},D(650));
  S=null;return {solo,star:solo};}
function stop(keepPend){if(S){clearTimeout(S.idleT);clearTimeout(S.exT);hidePanel();if(ovOwn&&!ov().querySelector('.hlp-tb'))closeOv();}S=null;if(!keepPend)pend=null;}

const HELP=window.HELP={register,classify,start,wrong,right,stop,due,stuckList,parentHTML,cfg,
  explain:(q,ctx)=>{const d=q&&q.type&&REG[q.type]?q:classify(q,ctx);if(!d)return null;const ex=REG[d.type];return {d,ex,topic:ex.topic(d,ctx),tip:ex.tip&&ex.tip(d),hint:ex.hint(d,ctx),visual:ex.visual&&ex.visual(d,ctx),
    example:ex.example&&(ex.reading?null:ex.example(d)),similar:ex.similar&&ex.similar(d),teach:ex.teach&&ex.teach(d),show:ex.show&&ex.show(d),whole:ex.whole&&ex.whole(d)};},
  teachLog:()=>DB().tb.slice(),get state(){return S?{type:S.d.type,level:S.level,phase:S.phase,wrong:S.wrong}:null;},
  types:()=>Object.keys(REG),_play:play,_speech:speech,_firstSound:firstSound,_teach:()=>S&&teach(S),_today:null};
})();
