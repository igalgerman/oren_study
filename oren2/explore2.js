/* ===== EXPLORE 2: מִצְפֵּה הַכּוֹכָבִים · גַּן הַטֶּבַע · חֲדַר הַמַּפּוֹת · לוּחַ הַשָּׁנָה · אֲתַר הַבְּנִיָּה =====
   Loaded after talents.js. Nothing runs until EXPLORE2.register(T.building, T.GROUPS) is called.
   Each topic = a short narrated lesson (fact cards with art + 🔊) and then a quiz. Levels go up by themselves:
   level 1 at first, level 2 after 2+ stars, level 3 after 3 stars and 2+ plays (read from the normal T.record data). */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;
const {h,$,pick,shuffle,ICON}=O;const sfx=O.sfx,D=O.D;
const SV=(vb,body,cls='')=>`<svg class="e2svg ${cls}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
const em=(e,c='')=>`<span class="e2em ${c}">${e}</span>`;
const lvl=id=>{const c=T.S().tl[id]||{};const s=c.s|0;return 1+(s>=2?1:0)+(s>=3&&(c.n|0)>=2?1:0);};
let STEP=null;const setStep=f=>{STEP=f;};O.on&&O.on('screen',()=>{STEP=null;});
let uid=0;

/* ================= ART (all original, simple SVG) ================= */
const SUN=SV('0 0 120 120',`<g stroke="#ffb703" stroke-width="7" stroke-linecap="round">${[0,1,2,3,4,5,6,7].map(k=>{const a=k*Math.PI/4;return `<line x1="${60+44*Math.cos(a)}" y1="${60+44*Math.sin(a)}" x2="${60+56*Math.cos(a)}" y2="${60+56*Math.sin(a)}"/>`;}).join('')}</g><circle cx="60" cy="60" r="36" fill="#ffcf4d"/><circle cx="60" cy="60" r="25" fill="#ffe27a"/>`);
const moon=(ph,cx,cy,r)=>{const lit='#fff1a8',dk='#3b3f5c';
  if(ph==='full')return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${lit}" stroke="#c9b75a" stroke-width="2"/><circle cx="${cx-r*.3}" cy="${cy-r*.2}" r="${r*.16}" fill="#eadb8a"/><circle cx="${cx+r*.25}" cy="${cy+r*.3}" r="${r*.12}" fill="#eadb8a"/>`;
  const base=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${dk}" stroke="#8a8fb0" stroke-width="2"/>`;if(ph==='new')return base;
  const inner=ph==='half'?'':` A ${r*.5} ${r} 0 0 0 ${cx} ${cy-r}`;
  return base+`<path d="M ${cx} ${cy-r} A ${r} ${r} 0 0 1 ${cx} ${cy+r}${ph==='half'?` L ${cx} ${cy-r}`:inner} Z" fill="${lit}"/>`;};
const MOONF=SV('0 0 120 120',`<rect width="120" height="120" rx="12" fill="#1d2140"/>`+moon('full',60,60,44));
const MOONS=SV('0 0 400 110',`<rect width="400" height="110" rx="14" fill="#1d2140"/>${[['new',335],['cres',245],['half',155],['full',65]].map(([p,x])=>moon(p,x,55,34)).join('')}`);
const pl=(k,cx,cy,r)=>{const id='e2c'+(++uid);const clip=b=>`<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath><g clip-path="url(#${id})">${b}</g>`;
  const c=(f,rr=r)=>`<circle cx="${cx}" cy="${cy}" r="${rr}" fill="${f}"/>`;
  switch(k){
    case 'mercury':return c('#a7a9ac')+`<circle cx="${cx-r*.3}" cy="${cy-r*.2}" r="${r*.25}" fill="#8b8d91"/><circle cx="${cx+r*.35}" cy="${cy+r*.3}" r="${r*.18}" fill="#8b8d91"/>`;
    case 'venus':return c('#e9c46a')+clip(`<ellipse cx="${cx}" cy="${cy-r*.3}" rx="${r}" ry="${r*.18}" fill="#f4dc95"/><ellipse cx="${cx}" cy="${cy+r*.35}" rx="${r}" ry="${r*.15}" fill="#d9ad4f"/>`);
    case 'earth':return c('#3a8fc4')+clip(`<ellipse cx="${cx-r*.35}" cy="${cy-r*.25}" rx="${r*.38}" ry="${r*.3}" fill="#4fae4f"/><ellipse cx="${cx+r*.4}" cy="${cy+r*.3}" rx="${r*.3}" ry="${r*.38}" fill="#4fae4f"/><ellipse cx="${cx}" cy="${cy-r*.92}" rx="${r*.5}" ry="${r*.18}" fill="#fff"/>`);
    case 'mars':return c('#d8572a')+`<circle cx="${cx+r*.3}" cy="${cy-r*.25}" r="${r*.22}" fill="#b0441f"/><circle cx="${cx-r*.35}" cy="${cy+r*.3}" r="${r*.16}" fill="#b0441f"/>`;
    case 'jupiter':return c('#d9a066')+clip([-.6,-.25,.15,.5].map((y,j)=>`<rect x="${cx-r}" y="${cy+y*r}" width="${2*r}" height="${r*(j%2?.14:.2)}" fill="${j%2?'#f1d3a6':'#b9773f'}"/>`).join('')+`<ellipse cx="${cx+r*.35}" cy="${cy+r*.32}" rx="${r*.2}" ry="${r*.12}" fill="#c0532d"/>`);
    case 'saturn':return `<ellipse cx="${cx}" cy="${cy}" rx="${r*1.75}" ry="${r*.45}" fill="none" stroke="#c9b27a" stroke-width="${r*.22}"/>`+c('#e7cf8a')+clip(`<rect x="${cx-r}" y="${cy-r*.35}" width="${2*r}" height="${r*.18}" fill="#d4b66a"/>`)+`<path d="M ${cx-r*1.75} ${cy} A ${r*1.75} ${r*.45} 0 0 0 ${cx+r*1.75} ${cy}" fill="none" stroke="#c9b27a" stroke-width="${r*.22}"/>`;
    case 'uranus':return c('#8fd6e0')+clip(`<rect x="${cx-r}" y="${cy-r*.1}" width="${2*r}" height="${r*.15}" fill="#a9e3ea"/>`);
    case 'neptune':return c('#3f63d6')+`<ellipse cx="${cx-r*.25}" cy="${cy-r*.2}" rx="${r*.25}" ry="${r*.14}" fill="#2b47a8"/>`;}
  return '';};
const PLANETS=[['mercury','כּוֹכַב חַמָּה',6.5],['venus','נֹגַהּ',9.5],['earth','כַּדּוּר הָאָרֶץ',10],['mars','מַאְדִּים',7.5],['jupiter','צֶדֶק',26],['saturn','שַׁבְּתַאי',17],['uranus','אוּרָנוּס',15],['neptune','נֶפְטוּן',14.5]].map(([k,n,r])=>({k,n,r}));
const PL=k=>PLANETS.find(p=>p.k===k);
const planetSVG=k=>SV('-30 -30 60 60',pl(k,0,0,PL(k).r));
const ROWX=[496,456,414,372,306,222,148,80],ROWR=[5,8,8.5,6.5,25,17,12,11.5];
const planetRow=hi=>SV('0 0 560 110',`<rect width="560" height="110" rx="14" fill="#1d2140"/><circle cx="600" cy="55" r="70" fill="#ffcf4d"/>`+
  PLANETS.map((p,i)=>`<g opacity="${hi&&!hi.includes(p.k)?.3:1}">${pl(p.k,ROWX[i],55,ROWR[i])}</g>`).join(''),'e2wide');
const EARTH_DN=SV('0 0 400 170',`<rect width="400" height="170" rx="14" fill="#1d2140"/><circle cx="345" cy="85" r="42" fill="#ffcf4d"/><g stroke="#ffcf4d" stroke-width="4" opacity=".55">${[-30,-15,0,15,30].map(d=>`<line x1="290" y1="${85+d}" x2="200" y2="${85+d*1.4}"/>`).join('')}</g>
  ${pl('earth',120,85,62)}<path d="M120 23 A62 62 0 0 0 120 147 Z" fill="rgba(8,12,35,.62)"/><text x="160" y="90" class="e2lbl" font-size="22" fill="#1d2631">☀ יוֹם</text><text x="80" y="92" class="e2lbl" font-size="22" style="fill:#fff;stroke:none">לַיְלָה</text>
  <path d="M75 15 A70 70 0 0 1 170 20" fill="none" stroke="#fff" stroke-width="3" marker-end="url(#e2ar)"/><defs><marker id="e2ar" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8Z" fill="#fff"/></marker></defs>`,'e2wide');
const ASTRO=SV('0 0 200 200',`<rect width="200" height="200" rx="16" fill="#1d2140"/>${[[20,30],[170,25],[160,150],[30,160],[100,15],[185,95]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="2" fill="#fff"/>`).join('')}
  <rect x="62" y="70" width="76" height="80" rx="22" fill="#9aa1a8"/><rect x="70" y="78" width="60" height="78" rx="20" fill="#f4f4f4" stroke="#c9ccd1" stroke-width="3"/><rect x="88" y="100" width="24" height="16" rx="3" fill="#3a8fc4"/><circle cx="94" cy="108" r="3" fill="#e4572e"/><circle cx="104" cy="108" r="3" fill="#ffd166"/>
  <rect x="44" y="88" width="30" height="16" rx="8" fill="#f4f4f4" stroke="#c9ccd1" stroke-width="3" transform="rotate(-25 59 96)"/><rect x="126" y="88" width="30" height="16" rx="8" fill="#f4f4f4" stroke="#c9ccd1" stroke-width="3" transform="rotate(25 141 96)"/>
  <rect x="76" y="148" width="20" height="30" rx="8" fill="#f4f4f4" stroke="#c9ccd1" stroke-width="3"/><rect x="104" y="148" width="20" height="30" rx="8" fill="#f4f4f4" stroke="#c9ccd1" stroke-width="3"/>
  <circle cx="100" cy="56" r="32" fill="#f4f4f4" stroke="#c9ccd1" stroke-width="3"/><rect x="78" y="42" width="44" height="28" rx="13" fill="#23395d"/><path d="M86 50 Q94 45 100 48" stroke="#9cd3ff" stroke-width="4" fill="none" stroke-linecap="round"/>`);
const ROCKET=SV('0 0 200 200',`<rect width="200" height="200" rx="16" fill="#1d2140"/>${[[25,40],[170,30],[150,170],[40,150],[180,110]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="2" fill="#fff"/>`).join('')}
  <path d="M100 160 Q88 182 100 196 Q112 182 100 160Z" fill="#ff9f1c"/><path d="M100 164 Q94 178 100 188 Q106 178 100 164Z" fill="#ffd166"/>
  <path d="M100 20 C130 45 132 110 124 160 L76 160 C68 110 70 45 100 20Z" fill="#f4f4f4" stroke="#c9ccd1" stroke-width="3"/><path d="M100 20 C112 30 118 40 121 52 L79 52 C82 40 88 30 100 20Z" fill="#e4572e"/>
  <circle cx="100" cy="88" r="15" fill="#3a8fc4" stroke="#9aa1a8" stroke-width="5"/><path d="M76 125 L52 165 L78 158Z" fill="#e4572e"/><path d="M124 125 L148 165 L122 158Z" fill="#e4572e"/>`);
const HOOPOE=SV('0 0 200 160',`<rect width="200" height="160" rx="16" fill="#dff1d8"/><path d="M30 140 H170" stroke="#94613a" stroke-width="8" stroke-linecap="round"/>
  ${[-50,-30,-10,10,30].map((a,i)=>`<g transform="rotate(${a} 120 52)"><path d="M120 52 L120 14" stroke="#f0a35e" stroke-width="9" stroke-linecap="round"/><circle cx="120" cy="14" r="4.5" fill="#1d2631"/></g>`).join('')}
  <ellipse cx="95" cy="95" rx="48" ry="30" fill="#e8a26a"/><circle cx="125" cy="62" r="18" fill="#e8a26a"/><circle cx="131" cy="58" r="3.5" fill="#1d2631"/><path d="M141 64 Q170 74 186 92" stroke="#1d2631" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M60 88 L118 88 L110 118 L52 112Z" fill="#fff"/>${[0,1,2,3].map(k=>`<path d="M${62+k*13} 88 L${55+k*13} 113" stroke="#1d2631" stroke-width="6"/>`).join('')}<path d="M50 100 L20 92 L22 110Z" fill="#1d2631"/>
  <path d="M85 124 L82 140 M102 124 L104 140" stroke="#6b4423" stroke-width="4"/>`);
const KALANIT=SV('0 0 160 160',`<rect width="160" height="160" rx="16" fill="#e7f4dc"/><path d="M80 150 Q76 120 80 95" stroke="#4fae4f" stroke-width="6" fill="none"/><path d="M80 130 Q60 122 50 128 M80 130 Q100 122 110 128" stroke="#4fae4f" stroke-width="5" fill="none"/>
  ${[0,60,120,180,240,300].map(a=>`<ellipse cx="80" cy="45" rx="17" ry="27" fill="#e63946" transform="rotate(${a} 80 70)"/>`).join('')}<circle cx="80" cy="70" r="14" fill="#1d2631"/>${[0,1,2,3,4,5,6,7].map(k=>`<circle cx="${80+18*Math.cos(k*.785)}" cy="${70+18*Math.sin(k*.785)}" r="2.5" fill="#1d2631"/>`).join('')}`);
const WHEEL=SV('0 0 120 120',`<circle cx="60" cy="60" r="48" fill="none" stroke="#94613a" stroke-width="12"/><circle cx="60" cy="60" r="48" fill="none" stroke="#6b4423" stroke-width="3"/>${[0,1,2,3,4,5].map(k=>`<line x1="60" y1="60" x2="${60+44*Math.cos(k*Math.PI/3)}" y2="${60+44*Math.sin(k*Math.PI/3)}" stroke="#94613a" stroke-width="7"/>`).join('')}<circle cx="60" cy="60" r="11" fill="#6b4423"/>`);
const PRESS=SV('0 0 120 120',`<rect x="18" y="14" width="12" height="96" fill="#94613a"/><rect x="90" y="14" width="12" height="96" fill="#94613a"/><rect x="14" y="10" width="92" height="14" fill="#6b4423"/><rect x="56" y="24" width="8" height="30" fill="#5a5f66"/><rect x="34" y="54" width="52" height="12" fill="#6b4423"/><rect x="30" y="76" width="60" height="10" fill="#fffaf0" stroke="#c9b27a"/><path d="M38 80 H82" stroke="#1d2631" stroke-width="2" stroke-dasharray="4 3"/><rect x="14" y="96" width="92" height="14" fill="#6b4423"/><path d="M64 34 H96" stroke="#5a5f66" stroke-width="5" stroke-linecap="round"/>`);
const SHOFAR=SV('0 0 120 120',`<path d="M18 92 Q30 40 70 34 Q100 30 108 12 L116 20 Q108 46 74 52 Q44 58 34 98Z" fill="#e9c8a0" stroke="#94613a" stroke-width="4"/><ellipse cx="26" cy="96" rx="12" ry="8" fill="#94613a"/>`);
const SUKKAH=SV('0 0 140 120',`<rect x="20" y="40" width="100" height="70" fill="#fffaf0" stroke="#94613a" stroke-width="5"/><path d="M14 40 H126" stroke="#4fae4f" stroke-width="14" stroke-linecap="round"/>${[24,44,64,84,104].map(x=>`<path d="M${x} 33 l8 -10 l8 10" fill="#7cc35f"/>`).join('')}
  <path d="M30 50 Q50 62 70 50 Q90 62 110 50" stroke="#e4572e" stroke-width="3" fill="none"/>${[40,70,100].map((x,i)=>`<circle cx="${x}" cy="${60}" r="5" fill="${['#ffd166','#e4572e','#3a8fc4'][i]}"/>`).join('')}<rect x="50" y="80" width="40" height="22" fill="#c68b59"/>`);
const HANUK=SV('0 0 160 120',`<rect x="60" y="100" width="40" height="10" fill="#b8860b"/><rect x="76" y="40" width="8" height="62" fill="#d4a72c"/><path d="M12 62 H148" stroke="#d4a72c" stroke-width="7"/>${[0,1,2,3,4,5,6,7,8].map(k=>{const x=12+k*17,top=k===4?24:46;return `<rect x="${x-4}" y="${top}" width="8" height="${k===4?16:16}" fill="#3a8fc4"/><path d="M${x} ${top-14} Q${x+6} ${top-4} ${x} ${top-1} Q${x-6} ${top-4} ${x} ${top-14}Z" fill="#ff9f1c"/>`;}).join('')}`);
const MATZAH=SV('0 0 120 120',`<rect x="14" y="14" width="92" height="92" rx="6" fill="#efd8a8" stroke="#c8925a" stroke-width="4"/>${[30,46,62,78,94].map(y=>`<path d="M22 ${y} H98" stroke="#c8925a" stroke-width="2" stroke-dasharray="2 5"/>`).join('')}${[[34,40],[70,58],[52,84],[86,30],[40,70]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="4" fill="#b9773f" opacity=".7"/>`).join('')}`);
const ILFLAG=SV('0 0 60 40',`<rect width="60" height="40" fill="#fff"/><rect y="4" width="60" height="5" fill="#0038b8"/><rect y="31" width="60" height="5" fill="#0038b8"/><path d="M30 12 L37 24 L23 24Z M30 28 L23 16 L37 16Z" fill="none" stroke="#0038b8" stroke-width="1.8"/>`,'e2flag');
const GOAL=SV('0 0 200 130',`<rect width="200" height="130" rx="14" fill="#7cc35f"/><path d="M0 110 H200" stroke="#fff" stroke-width="3"/><rect x="50" y="20" width="100" height="62" fill="none" stroke="#fff" stroke-width="6"/>${[0,1,2,3,4,5,6,7,8].map(k=>`<path d="M${60+k*10} 22 V80" stroke="#fff" stroke-width="1" opacity=".6"/>`).join('')}<circle cx="100" cy="100" r="15" fill="#fff" stroke="#1d2631" stroke-width="2"/><path d="M100 92 l7 5 -3 8 h-8 l-3 -8z" fill="#1d2631"/>`);
const HOOP=SV('0 0 200 140',`<rect width="200" height="140" rx="14" fill="#f2c18d"/><rect x="60" y="14" width="80" height="54" fill="#fff" stroke="#1d2631" stroke-width="4"/><rect x="85" y="34" width="30" height="22" fill="none" stroke="#e4572e" stroke-width="3"/><ellipse cx="100" cy="68" rx="20" ry="5" fill="none" stroke="#e4572e" stroke-width="4"/><path d="M82 70 L90 92 M100 72 V94 M118 70 L110 92" stroke="#fff" stroke-width="2"/><circle cx="150" cy="110" r="16" fill="#e8772e"/><path d="M134 110 H166 M150 94 V126" stroke="#1d2631" stroke-width="2"/>`);
const POOL=SV('0 0 200 130',`<rect width="200" height="130" rx="14" fill="#cfe9f5"/><rect x="16" y="16" width="168" height="98" rx="8" fill="#3a8fc4"/>${[40,62,84].map(y=>`<path d="M16 ${y} H184" stroke="#fff" stroke-width="2" stroke-dasharray="6 6"/>`).join('')}<circle cx="70" cy="51" r="9" fill="#ffd166"/><path d="M80 52 Q100 44 120 52" stroke="#f4c9a0" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M30 100 Q60 92 90 100 T150 100" stroke="#9cd3ff" stroke-width="3" fill="none"/>`);
/* life-cycle pictures */
const SEED=st=>SV('0 0 100 100',`<rect x="5" y="66" width="90" height="28" rx="6" fill="#94613a"/>`+[
  `<ellipse cx="50" cy="74" rx="11" ry="7" fill="#e9c8a0" stroke="#6b4423" stroke-width="2"/>`,
  `<path d="M50 70 V52" stroke="#4fae4f" stroke-width="4"/><path d="M50 56 Q38 46 34 54 Q42 60 50 56Z M50 54 Q62 44 66 52 Q58 58 50 54Z" fill="#7cc35f"/>`,
  `<path d="M50 70 V24" stroke="#4fae4f" stroke-width="5"/>${[56,40,28].map((y,i)=>`<path d="M50 ${y} Q${i%2?30:70} ${y-12} ${i%2?24:76} ${y-2} Q${i%2?36:64} ${y+4} 50 ${y}Z" fill="#7cc35f"/>`).join('')}`,
  `<path d="M50 70 V30" stroke="#4fae4f" stroke-width="5"/>${[56,42].map((y,i)=>`<path d="M50 ${y} Q${i%2?30:70} ${y-12} ${i%2?24:76} ${y-2} Q${i%2?36:64} ${y+4} 50 ${y}Z" fill="#7cc35f"/>`).join('')}${[0,72,144,216,288].map(a=>`<ellipse cx="50" cy="12" rx="7" ry="11" fill="#ff7eb6" transform="rotate(${a} 50 22)"/>`).join('')}<circle cx="50" cy="22" r="6" fill="#ffd166"/>`][st]);
const PUPA=SV('0 0 100 100',`<path d="M20 10 H80" stroke="#6b4423" stroke-width="6" stroke-linecap="round"/><path d="M50 12 V20" stroke="#6b4423" stroke-width="3"/><path d="M50 20 C70 30 68 70 50 92 C32 70 30 30 50 20Z" fill="#8acb68" stroke="#4f8a3a" stroke-width="3"/><path d="M40 45 Q50 50 60 45 M40 60 Q50 65 60 60" stroke="#4f8a3a" stroke-width="2" fill="none"/>`);
const TADPOLE=SV('0 0 100 100',`<rect width="100" height="100" rx="12" fill="#cfe9f5"/><ellipse cx="38" cy="50" rx="16" ry="13" fill="#3b3f5c"/><path d="M52 50 Q70 38 90 52 Q70 60 52 54Z" fill="#5a5f86"/><circle cx="32" cy="46" r="3" fill="#fff"/>`);
const FROGEGGS=SV('0 0 100 100',`<rect width="100" height="100" rx="12" fill="#cfe9f5"/>${[[30,35],[50,30],[70,38],[40,55],[60,55],[30,72],[52,74],[72,68]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="10" fill="#e8f6ff" stroke="#9cc" stroke-width="2"/><circle cx="${x}" cy="${y}" r="4" fill="#1d2631"/>`).join('')}`);

/* ---------- Israel map (physical: land, seas, cities; no borders) ---------- */
const ilP=([la,lo])=>[+((lo-33.7)*85).toFixed(1),+((33.4-la)*100).toFixed(1)];
const pts=a=>a.map(p=>ilP(p).join(',')).join(' ');
const MED=[[33.4,35.25],[33.27,35.19],[33.09,35.10],[33.0,35.09],[32.92,35.07],[32.81,35.04],[32.82,35.0],[32.835,34.955],[32.69,34.94],[32.61,34.92],[32.50,34.89],[32.33,34.85],[32.16,34.80],[32.08,34.765],[32.05,34.75],[31.80,34.64],[31.67,34.55],[31.52,34.43],[31.32,34.22],[31.13,33.80],[31.08,33.7]];
const GULF=[[29.55,34.95],[29.53,35.0],[29.37,35.0],[29.2,34.95],[29.2,34.76],[29.3,34.80],[29.49,34.90]];
const DEAD=[[31.77,35.53],[31.72,35.59],[31.50,35.58],[31.35,35.56],[31.15,35.50],[31.05,35.43],[31.10,35.38],[31.46,35.39],[31.70,35.45]];
const KIN=[[32.89,35.6],[32.85,35.64],[32.78,35.65],[32.71,35.60],[32.70,35.57],[32.74,35.54],[32.80,35.52],[32.87,35.54]];
const JORDAN=[[33.2,35.62],[33.0,35.61],[32.89,35.6]],JORDAN2=[[32.70,35.57],[32.5,35.57],[32.2,35.55],[32.0,35.53],[31.77,35.53]];
const CITIES={jer:['יְרוּשָׁלַיִם',[31.78,35.22],[-4,20]],ta:['תֵּל אָבִיב',[32.08,34.80],[34,-6]],hai:['חֵיפָה',[32.79,35.03],[24,5]],bs:['בְּאֵר שֶׁבַע',[31.25,34.79],[6,20]],eil:['אֵילַת',[29.56,34.95],[-28,-2]]};
const SEAS={med:['הַיָּם הַתִּיכוֹן',[32.45,34.18]],kin:['הַכִּנֶּרֶת',[32.8,35.585],[14,-16]],dead:['יָם הַמֶּלַח',[31.42,35.49],[-4,52]],red:['יָם סוּף',[29.35,34.88],[-36,5]]};
const REGIONS={galil:['הַגָּלִיל',[[33.1,35.07],[33.2,35.6],[32.72,35.55],[32.6,35.3],[32.75,35.07]],[32.95,35.33]],negev:['הַנֶּגֶב',[[31.35,34.25],[31.3,35.3],[30.6,35.2],[29.6,34.99],[29.55,34.9],[30.4,34.45]],[30.6,34.85]]};
const cityPos=k=>ilP(CITIES[k][1]);
function ilMap(o={}){const lab=o.labels||[],hit=o.hit||'';const L=(k,n,[x,y],off=[0,0],fs=16)=>lab.includes(k)?`<text x="${x+off[0]}" y="${y+off[1]}" class="e2lbl" font-size="${fs}">${n}</text>`:'';
  let s=`<defs><linearGradient id="e2land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8d08d"/><stop offset=".45" stop-color="#cfe0a0"/><stop offset=".6" stop-color="#ead39a"/><stop offset="1" stop-color="#e6c27f"/></linearGradient></defs>
  <rect x="0" y="0" width="204" height="420" fill="url(#e2land)"/>
  <polygon points="0,0 ${pts(MED)} 0,232" fill="#7cc3ea" data-k="med" class="${hit==='sea'?'e2hit':''}"/>
  <polygon points="${pts(GULF)}" fill="#7cc3ea"/>${hit==='sea'?`<rect x="78" y="376" width="44" height="44" fill="transparent" data-k="red" class="e2hit"/><polygon points="${pts(GULF)}" fill="transparent" data-k="red" class="e2hit"/>`:''}
  <polyline points="${pts(JORDAN)}" fill="none" stroke="#5fa8d8" stroke-width="2.5"/><polyline points="${pts(JORDAN2)}" fill="none" stroke="#5fa8d8" stroke-width="2.5"/>
  <polygon points="${pts(DEAD)}" fill="#5fb0d8" stroke="#3a8fc4" stroke-width="1"/><polygon points="${pts(KIN)}" fill="#4aa3e0" stroke="#3a8fc4" stroke-width="1"/>`;
  if(hit==='sea'){const[dx,dy]=ilP([31.42,35.49]),[kx,ky]=ilP([32.8,35.585]);s+=`<circle cx="${dx}" cy="${dy}" r="24" fill="transparent" data-k="dead" class="e2hit"/><circle cx="${kx}" cy="${ky}" r="22" fill="transparent" data-k="kin" class="e2hit"/>`;}
  if(hit==='region')for(const k in REGIONS)s+=`<polygon points="${pts(REGIONS[k][1])}" fill="transparent" stroke="${lab.includes(k)?'#6b4423':'none'}" stroke-dasharray="4 3" data-k="${k}" class="e2hit"/>`;
  for(const k in CITIES){const [x,y]=cityPos(k);s+=`<circle cx="${x}" cy="${y}" r="4.5" fill="#e4572e" stroke="#fff" stroke-width="2"/>${hit==='city'?`<circle cx="${x}" cy="${y}" r="21" fill="transparent" data-k="${k}" class="e2hit"/>`:''}`;}
  s+=`<g class="e2lbls" pointer-events="none">`;
  for(const k in SEAS){const [x,y]=ilP(SEAS[k][1]);s+=L(k,SEAS[k][0],[x,y],SEAS[k][2],k==='med'?17:16);}
  for(const k in CITIES){const [x,y]=cityPos(k);s+=L(k,CITIES[k][0],[x,y],CITIES[k][2]);}
  for(const k in REGIONS){const [x,y]=ilP(REGIONS[k][2]);s+=L(k,REGIONS[k][0],[x,y],[0,0],18);}
  s+=`</g>`+compass(186,32,14);
  return SV('0 0 204 420',s,'e2il');}
const compass=(x,y,r)=>`<g pointer-events="none"><circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="#1d2631" stroke-width="1.5"/><path d="M${x} ${y-r+2} L${x+r*.35} ${y} L${x-r*.35} ${y}Z" fill="#e4572e"/><path d="M${x} ${y+r-2} L${x+r*.35} ${y} L${x-r*.35} ${y}Z" fill="#9aa1a8"/><text x="${x}" y="${y-r-3}" class="e2lbl" font-size="${r*1.1}">צָפוֹן</text></g>`;

/* ---------- world map (continents; simplified, equirectangular) ---------- */
const wP=([la,lo])=>[lo+180,85-la];const wpts=a=>a.map(p=>wP(p).map(v=>+v.toFixed(1)).join(',')).join(' ');
const CONT={
 namerica:['צְפוֹן אֲמֶרִיקָה',[[[66,-166],[70,-160],[71,-156],[70,-142],[69,-133],[70,-125],[68,-110],[68,-98],[66,-87],[62,-80],[60,-78],[63,-72],[60,-65],[55,-60],[52,-56],[48,-53],[47,-60],[45,-61],[44,-66],[42,-70],[41,-72],[39,-74],[37,-76],[35,-76],[32,-80],[30,-81],[27,-80],[25,-80.5],[26,-82],[29,-83],[30,-85],[30,-89],[29,-90],[29,-94],[27,-97],[24,-97.5],[21,-97],[19,-96],[18.5,-94],[19,-91],[21,-90],[21.5,-87],[18,-88],[16,-88],[15.8,-84],[13,-83.5],[11,-83.7],[9,-81],[9,-79],[8,-77.5],[7.5,-78],[8,-80],[7.5,-81],[8.5,-83],[10,-85.5],[12,-87],[13.5,-89],[14.5,-92],[16,-95],[16,-97],[17,-100],[19,-105],[21,-105.5],[23,-106.5],[25,-108.5],[28,-111],[31.5,-114.5],[28,-112.8],[24.5,-110.5],[22.9,-109.9],[24.5,-112],[27,-114.5],[30,-116],[32.5,-117],[34.5,-120.5],[37,-122.4],[40,-124.3],[43,-124.5],[46,-124],[48.4,-124.7],[50,-127],[52,-128],[54.5,-130.5],[57,-134],[59.5,-139],[60,-144],[60.5,-147],[59,-152],[57.5,-155],[55,-160],[54.5,-164],[56,-160],[58.5,-157.5],[59,-161],[61,-165],[63.5,-164],[64.5,-166.5]],
   [[60,-43],[61,-48],[65,-52],[69,-54],[72,-56],[76,-68],[78,-72],[81,-62],[83,-40],[82,-22],[80,-18],[76,-19],[72,-22],[70,-23],[68,-30],[66,-36],[63,-41]],[[23,-84],[23.2,-80],[22,-77],[20,-74.2],[20,-77],[21.6,-79.5],[22,-82],[22,-84.5]]],[45,-100]],
 samerica:['דְּרוֹם אֲמֶרִיקָה',[[[12,-72],[11,-74.5],[9.5,-76],[8,-77],[7,-77.8],[4,-77.3],[1.5,-79],[-1,-80.5],[-3.5,-80.3],[-6,-81.2],[-9,-79],[-14,-76.3],[-17,-72],[-18.5,-70.3],[-23,-70.5],[-27,-70.9],[-30,-71.5],[-33,-71.7],[-37,-73.5],[-40,-73.7],[-43,-74],[-46,-75.5],[-49,-75.5],[-52,-74.5],[-54,-72],[-55,-68.5],[-54.5,-65.5],[-52.5,-68.5],[-50,-68.5],[-47.5,-66],[-45,-67],[-42.5,-64],[-41,-65],[-39,-62],[-38.5,-58],[-36.5,-56.7],[-35,-57.2],[-34.5,-54],[-32,-52],[-28.5,-48.7],[-25.5,-48.5],[-23,-43.5],[-22.5,-41],[-18,-39.5],[-13,-38.5],[-10,-36],[-7,-34.8],[-5,-35.5],[-3,-40],[-2.5,-44],[-1,-48],[0,-50],[2,-50.5],[4.5,-51.7],[5.8,-55],[6.5,-58],[8.5,-60],[10.5,-61.8],[10.7,-64],[10.5,-67],[11.5,-70]]],[-12,-58]],
 europe:['אֵירוֹפָּה',[[[36,-5.6],[36.7,-4.5],[36.8,-2],[37.6,-0.7],[38.8,0.2],[40.5,0.8],[41.3,2.2],[42.4,3.2],[43.2,3.3],[43.5,4.8],[43.1,6],[43.7,7.5],[44.4,8.8],[44,10],[42.5,11],[41.2,13],[40,15.6],[38,15.6],[38.9,16.6],[39.9,16.5],[40.5,17.3],[40,18.5],[40.6,18],[41.9,16],[43.6,13.5],[45.6,12.4],[45.6,13.8],[45,14],[43.5,16.4],[42,18.5],[41,19.4],[40,20],[39.2,20.2],[38.3,21],[37,21.7],[36.5,22.5],[37.5,23.5],[38.5,23],[40,22.7],[40.5,23.8],[40.8,26],[41,28.5],[41.2,29],
   [42.5,37],[42,41.7],[43,44],[44,47.2],[46.8,51.5],[47.5,52],[51,57],[55,59],[60,59.5],[64,59.5],[67,64],[68.5,66.5],
   [69,60],[68.4,54],[67.8,47],[66.2,44],[64.5,40],[66.3,34],[67,32.5],[69,33],[69.7,30.5],[70.5,28],[71,25.5],[70.5,22],[70,19.5],[69,16],[67.5,14.5],[65.5,12.5],[64,10],[62.5,6.5],[61,5],[59,5.5],[58,7],[58.5,9.5],[59.2,10.5],[58.3,11.5],[56.5,12.6],[55.5,13],[56.2,14.5],[56.2,16],[57.5,16.6],[59,18],[60.3,18.6],[61.5,17.2],[63,18.5],[64.5,21.3],[65.8,22.3],[65,25.3],[64,24],[63,21.5],[61.5,21.5],[60.5,22],[60,22.8],[60.4,26.5],[60.7,28.5],[59.9,30],[59.4,28],[59.4,24],[58.4,23.5],[57.5,21.6],[56.5,21],[55.5,21.2],[54.5,19.6],[54.4,18.5],[54.8,16],[54.2,13.5],[54.5,11],[54.4,10.2],[55,9.7],[56,10.3],[57.7,10.5],[57,8.3],[55.5,8.2],[54,8.8],[53.5,7.2],[53.3,5],[52.3,4.5],[51.4,3.5],[51,2],[50,1.5],[49.7,0.2],[49.4,-1.2],[49.7,-1.6],[48.7,-1.6],[48.6,-4.6],[47.8,-4.3],[47,-2.2],[46,-1.2],[44.5,-1.2],[43.4,-1.8],[43.4,-3.8],[43.6,-6],[43.7,-8],[42.9,-9.3],[41,-8.7],[38.7,-9.5],[37,-9],[37,-7.5],[36.1,-6]],
   [[50.1,-5.7],[50.6,-3.5],[50.8,-1],[51.1,1.4],[51.9,1.5],[52.9,1.7],[53.5,0.2],[54.5,-0.6],[55.8,-1.8],[56.5,-2.7],[57.6,-1.8],[58.6,-3.1],[58.5,-5],[57.5,-5.8],[56.3,-5.6],[55.3,-4.8],[54.7,-3.4],[53.4,-3],[53.3,-4.5],[52.5,-4.1],[51.7,-5.2],[51.4,-3.2]],[[51.5,-9.8],[52.2,-6.4],[53.3,-6.1],[54.6,-5.6],[55.3,-7.3],[54.3,-8.6],[53.5,-10.1],[52,-10.4]],[[63.4,-19],[64,-22.6],[65.5,-24],[66.4,-22],[66.2,-15],[65,-13.6],[64,-15.5]],[[38.2,12.4],[38.3,15.6],[36.7,15.1],[37.5,12.5]]],[54,18]],
 africa:['אַפְרִיקָה',[[[35.8,-5.9],[35.2,-2.5],[35.7,0],[36.8,3],[36.9,8],[37.3,10],[36.5,11],[35.2,11],[34,10.2],[33.5,11.2],[32.8,12.5],[32.5,15.2],[31,17.5],[30.3,19.2],[31.7,20],[32.8,22],[32.6,23.2],[31.6,25.2],[31.3,27.5],[31,29.8],[31.4,31.5],[31.1,32.3],[29.9,32.55],[28,33.6],[26,34.3],[23,35.6],[22,36.9],[19,37.5],[16,39.2],[14.5,41],[12.6,43.3],[11.5,43.2],[11.2,44.8],[11.8,51.2],[10,51],[6,49.2],[2,46],[-1.7,41.5],[-4.7,39.2],[-6.8,39.5],[-10,40.2],[-15,40.7],[-17,39],[-19.8,34.8],[-23,35.5],[-25.5,32.8],[-28.8,32.2],[-31.5,29.5],[-33.9,25.6],[-34.3,22.3],[-34.8,20],[-34.2,18.5],[-32,18.2],[-29,16.5],[-26,14.9],[-22,14.2],[-18,11.8],[-15.5,12],[-12,13.7],[-9,13.2],[-6,12.2],[-4.5,11.5],[-1.5,9.2],[1,9.5],[3.5,9.6],[4.4,8.5],[4.3,6.5],[6.4,3],[6.2,1.3],[5.2,-1.5],[5,-4],[4.4,-7.5],[6.5,-11],[8,-13],[9.5,-13.5],[11,-15.2],[12.5,-16.7],[14.7,-17.5],[16,-16.5],[19,-16.2],[21,-17],[23.5,-16],[26,-14.5],[27.8,-13],[29,-10],[31.5,-9.8],[33.5,-7.5],[34.8,-6.5]],
   [[-12,49.3],[-15.5,50.2],[-20,48.8],[-25.2,47],[-25,44],[-21.5,43.4],[-16,44.6],[-15.2,47.2],[-13.4,48.3]]],[5,20]],
 asia:['אַסְיָה',[[[41.2,29],[42.5,37],[42,41.7],[43,44],[44,47.2],[46.8,51.5],[47.5,52],[51,57],[55,59],[60,59.5],[64,59.5],[67,64],[68.5,66.5],[70,70],[73,72],[72,80],[74,86],[76,95],[77.5,104],[76,112],[73.5,118],[73,129],[71.5,139],[72.5,150],[70,160],[69.5,170],[67,180],[65,180],[62,179],[60,170],[60,164],[57,162],[51,156.6],[54,155.8],[58,157],[59.5,152],[59,143],[54,137],[53.3,141.2],[50,140.5],[47,138.5],[43,132],[42,130.5],[40,129.5],[38.3,128.5],[35.3,129.3],[34.7,126.5],[36.8,126.2],[38,124.8],[39.8,124.2],[40.8,121.5],[39.1,121.3],[40,119.5],[38.8,117.6],[37.5,119],[37.4,122.5],[36,120.5],[35,119.3],[33,120.8],[31.7,121.8],[30,122],[27.5,120.6],[25,119],[23,116.5],[22.3,114.2],[21.5,111],[21.5,108],[20,106.5],[18,106.5],[16,108.3],[12.5,109.3],[10.5,107.5],[8.6,104.8],[10.4,104.5],[12.3,102.3],[13.5,100.5],[12.5,99.9],[10,99.2],[8.3,100.3],[6.5,101.3],[3,103.4],[1.3,104.2],[2.5,101.4],[4.2,100.6],[6.5,100],[8,98.3],[10,98.5],[13,98.7],[16.3,97.6],[16,94.6],[18.5,94.2],[20.7,92.4],[22.5,91.5],[21.7,89],[21.5,87],[20,86.5],[18,84.2],[15.8,80.8],[13,80.2],[10.3,79.8],[8.1,77.5],[10,76.2],[13,74.8],[15.5,73.8],[19,72.8],[21,72.6],[22.3,70.2],[23.6,68.3],[25,66.8],[25.4,61.6],[25.6,57.4],[27,56.5],[27.2,54],[28.9,50.8],[30,48.5],[29.5,47.8],[27,49.6],[26.1,51.2],[24.5,51.6],[24.2,54],[25.4,55.5],[26.3,56.4],[24,56.8],[22.5,59.8],[20.5,58.3],[18,56.4],[16.6,53],[14.8,50.5],[13.2,45],[12.7,43.5],[14.5,42.9],[16.5,42.6],[19,41.2],[21.5,39.1],[24.5,37.3],[27.5,35.4],[29.5,35],[28.5,34.6],[27.8,34.2],[28.5,33.4],[29.9,32.6],[31.1,32.4],[31.1,33.8],[31.3,34.2],[31.8,34.6],[32.8,35],[33.5,35.4],[34.5,35.9],[35.5,35.9],[36.5,36],[36.8,35.5],[36.6,34.5],[36.2,32.5],[36.8,31],[36.5,30.5],[36.2,29.5],[36.6,28],[37,27.3],[38.5,26.6],[39.5,26.2],[40,26.2],[40.4,26.7],[40.6,29.5]],
   [[31,130.5],[34,131],[35.5,135],[35,137],[35.5,140],[38,141],[41.5,141.5],[43.3,145.5],[45.5,142],[42,140],[40,140],[37,137],[36,136],[34,132.5]],[[9.8,80.1],[8.5,81.3],[6.8,81.8],[6,80.6],[7,79.8]],[[5.6,95.3],[3,98.8],[0.5,103],[-2.5,106],[-5.8,105.8],[-4.8,102.3],[-1.5,100.3],[2,98]],[[7,116.8],[4.5,118.5],[1,119],[-3.5,116],[-3,111],[-2.8,110],[1.5,109],[2.5,111.5],[4.5,114],[6,116]],[[-6,105.5],[-6.5,112],[-7.6,114.5],[-8.5,114.5],[-8,110],[-7.2,106]]],[48,92]],
 australia:['אוֹסְטְרַלְיָה',[[[-11,142.5],[-17,141],[-12.5,136.5],[-12,131],[-14.5,129],[-15,125],[-19,121.5],[-22,114],[-26,113.5],[-32,115.7],[-35,117.5],[-32,126],[-31.5,131],[-35,135.5],[-35,138],[-38,140.5],[-39,146.5],[-37.5,150],[-33,151.5],[-28,153.5],[-24.5,152.5],[-19,146.5],[-14.5,144]],[[-0.8,131],[-1.5,134.5],[-2.5,137.5],[-2.6,141],[-5.5,145.8],[-6.8,147.5],[-10.5,150.5],[-8.5,143.5],[-8,139],[-4,135],[-3.8,132.5]]],[-25,134]],
 antarctica:['אַנְטַארְקְטִיקָה',[[[-90,-180],[-70,-180],[-71,-160],[-74,-140],[-73,-120],[-73,-100],[-71,-80],[-68,-68],[-64,-60],[-63,-57],[-65,-58],[-70,-60],[-73,-60],[-77,-50],[-75,-35],[-71,-15],[-70,0],[-69,20],[-69,40],[-67,55],[-67,70],[-69,75],[-66,90],[-66,110],[-67,130],[-68,150],[-71,165],[-72,170],[-70,180],[-90,180]]],[-75,10]]};
const CONT_COL={namerica:'#f2a65a',samerica:'#e9c46a',europe:'#8e9fe0',africa:'#e88f6b',asia:'#7cc35f',australia:'#c895e0',antarctica:'#eef3f7'};
const OCEANS={pacific:['הָאוֹקְיָנוֹס הַשָּׁקֵט',[0,-140],'הַשָּׁקֵט'],atlantic:['הָאוֹקְיָנוֹס הָאַטְלַנְטִי',[22,-42],'הָאַטְלַנְטִי'],indian:['הָאוֹקְיָנוֹס הַהֹדִּי',[-20,75],'הַהֹדִּי']};
const PAD={antarctica:[20,121,320,44]};
function worldMap(o={}){const lab=o.labels||[];let s=`<rect width="360" height="165" fill="#8fd0f2"/>`;
  if(o.hit)for(const k in CONT){const [x,y]=wP(CONT[k][2]),r=PAD[k]||[x-24,y-24,48,48];s+=`<g data-k="${k}" class="e2hit"><rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" fill="transparent"/></g>`;}
  for(const k in CONT){const [n,polys]=CONT[k];s+=`<g data-k="${k}" class="${o.hit?'e2hit':''}" fill="${o.plain?'#c9d6a3':CONT_COL[k]}" stroke="#5c6b73" stroke-width=".5">${polys.map(p=>`<polygon points="${wpts(p)}"/>`).join('')}</g>`;}
  s+=`<polygon points="${wpts([[63,-94],[60,-94],[57,-92.5],[55,-85],[52,-80],[55,-77],[58,-77],[61,-78],[62.5,-82],[64,-87]])}" fill="#8fd0f2"/><ellipse cx="${wP([43.2,34.5])[0]}" cy="${wP([43.2,34.5])[1]}" rx="6.5" ry="2.2" fill="#8fd0f2"/><ellipse cx="${wP([42,50.5])[0]}" cy="${wP([42,50.5])[1]}" rx="2.6" ry="5" fill="#8fd0f2"/>`;
  if(o.il){const [x,y]=wP([31.5,35]);s+=`<circle cx="${x}" cy="${y}" r="2.6" fill="#e4572e" stroke="#fff" stroke-width="1" pointer-events="none"/>`;}
  if(o.mark){const [x,y]=wP(OCEANS[o.mark][1]);s+=`<g pointer-events="none"><circle cx="${x}" cy="${y}" r="9" fill="#ffd166" stroke="#1d2631" stroke-width="1.5"/><text x="${x}" y="${y+4}" class="e2lbl" font-size="11">?</text></g>`;}
  s+=`<g pointer-events="none">`;for(const k of lab){if(CONT[k]){const [x,y]=wP(CONT[k][2]);s+=`<text x="${x}" y="${y}" class="e2lbl" font-size="9">${CONT[k][0]}</text>`;}if(OCEANS[k]){const [x,y]=wP(OCEANS[k][1]);s+=`<text x="${x}" y="${y}" class="e2lbl e2sea" font-size="9">${OCEANS[k][2]}</text>`;}}
  s+=`</g>`;return SV('0 0 360 165',s,'e2world');}

/* ---------- neighbourhood map ---------- */
const HOOD={school:['בֵּית הַסֵּפֶר','🏫',[100,24]],field:['מִגְרַשׁ הַכַּדּוּרֶגֶל','⚽',[100,176]],park:['הַגַּן','🌳',[176,100]],pool:['הַבְּרֵכָה','🏊',[24,100]],house:['הַבַּיִת','🏠',[100,100]]};
const hoodMap=()=>SV('0 0 200 200',`<rect width="200" height="200" rx="10" fill="#bfe3a5"/><rect x="88" y="10" width="24" height="180" fill="#a9b0b6"/><rect x="10" y="88" width="180" height="24" fill="#a9b0b6"/><path d="M100 14 V186 M14 100 H186" stroke="#fff" stroke-width="2" stroke-dasharray="6 6"/>
  ${Object.values(HOOD).map(([n,e,[x,y]])=>`<rect x="${x-20}" y="${y-20}" width="40" height="40" rx="8" fill="#fff" stroke="#5c6b73" stroke-width="1.5"/><text x="${x}" y="${y+10}" font-size="28" text-anchor="middle">${e}</text>`).join('')}${compass(24,32,14)}`,'e2hood');
const legend=()=>`<div class="e2leg">${Object.values(HOOD).map(([n,e])=>`<span>${e} ${n.replace(/^הַ/,'')}</span>`).join('')}</div>`;

/* ---------- flags (talents.js FL is reused when exported as T.FL) ---------- */
const star5=(cx,cy,r,f)=>`<polygon points="${[0,1,2,3,4,5,6,7,8,9].map(k=>{const a=-Math.PI/2+k*Math.PI/5,rr=k%2?r*.4:r;return (cx+rr*Math.cos(a)).toFixed(2)+','+(cy+rr*Math.sin(a)).toFixed(2);}).join(' ')}" fill="${f}"/>`;
const MYFL={
 il:['יִשְׂרָאֵל','<rect width="60" height="40" fill="#fff"/><rect y="4" width="60" height="5" fill="#0038b8"/><rect y="31" width="60" height="5" fill="#0038b8"/><path d="M30 12 L37 24 L23 24Z M30 28 L23 16 L37 16Z" fill="none" stroke="#0038b8" stroke-width="1.8"/>'],
 jp:['יַפָּן','<rect width="60" height="40" fill="#fff"/><circle cx="30" cy="20" r="11" fill="#bc002d"/>'],
 fr:['צָרְפַת','<rect width="20" height="40" fill="#0055a4"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#ef4135"/>'],
 it:['אִיטַלְיָה','<rect width="20" height="40" fill="#009246"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#ce2b37"/>'],
 ng:['נִיגֶּרְיָה','<rect width="20" height="40" fill="#008751"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#008751"/>'],
 gh:['גָּאנָה','<rect width="60" height="14" fill="#ce1126"/><rect y="13" width="60" height="14" fill="#fcd116"/><rect y="26" width="60" height="14" fill="#006b3f"/>'+star5(30,20,6.5,'#000')],
 ar:['אַרְגֶּנְטִינָה','<rect width="60" height="40" fill="#74acdf"/><rect y="13.3" width="60" height="13.4" fill="#fff"/><circle cx="30" cy="20" r="4.6" fill="#f6b40e"/>'+[0,1,2,3,4,5,6,7].map(k=>`<line x1="${30+5*Math.cos(k*.785)}" y1="${20+5*Math.sin(k*.785)}" x2="${30+6.6*Math.cos(k*.785)}" y2="${20+6.6*Math.sin(k*.785)}" stroke="#f6b40e" stroke-width="1"/>`).join('')],
 br:['בְּרָזִיל','<rect width="60" height="40" fill="#009c3b"/><polygon points="30,4 55,20 30,36 5,20" fill="#ffdf00"/><circle cx="30" cy="20" r="9" fill="#002776"/><path d="M21.5 18 Q30 15 38.6 21" stroke="#fff" stroke-width="1.6" fill="none"/>'],
 us:['אַרְצוֹת הַבְּרִית',Array.from({length:13},(_,k)=>`<rect y="${(k*40/13).toFixed(2)}" width="60" height="${(40/13+.05).toFixed(2)}" fill="${k%2?'#fff':'#b22234'}"/>`).join('')+'<rect width="25" height="21.5" fill="#3c3b6e"/>'+Array.from({length:20},(_,k)=>`<circle cx="${2.5+(k%5)*5+(Math.floor(k/5)%2)*2.5}" cy="${2.7+Math.floor(k/5)*5.2}" r=".9" fill="#fff"/>`).join('')],
 in:['הֹדּוּ','<rect width="60" height="14" fill="#ff9933"/><rect y="13" width="60" height="14" fill="#fff"/><rect y="26" width="60" height="14" fill="#138808"/><circle cx="30" cy="20" r="5" fill="none" stroke="#000080" stroke-width="1"/>'+[0,1,2,3,4,5,6,7,8,9,10,11].map(k=>`<line x1="30" y1="20" x2="${30+5*Math.cos(k*Math.PI/6)}" y2="${20+5*Math.sin(k*Math.PI/6)}" stroke="#000080" stroke-width=".5"/>`).join('')],
 cn:['סִין','<rect width="60" height="40" fill="#de2910"/>'+star5(10,10,6,'#ffde00')+[[20,4],[24,8],[24,14],[20,18]].map(([x,y])=>star5(x,y,2,'#ffde00')).join('')]};
const FCONT={il:'asia',jp:'asia',in:'asia',cn:'asia',fr:'europe',it:'europe',de:'europe',nl:'europe',se:'europe',ch:'europe',ua:'europe',ie:'europe',ng:'africa',gh:'africa',ar:'samerica',br:'samerica',us:'namerica'};
const FLV={il:1,jp:1,fr:1,it:1,us:2,br:2,ng:2,in:2,cn:2,de:2,ar:3,gh:3,nl:3,se:3,ch:3,ua:3,ie:3};
const FLAGS=()=>Object.assign({},MYFL,T.FL||{});
const flagSVG=k=>`<svg class="flagsvg e2flag" viewBox="0 0 60 40" aria-hidden="true">${FLAGS()[k][1]}</svg>`;

/* ---------- blocks: cabinet projection (front face flat, depth up-right) ---------- */
const BC={R:'#e4572e',B:'#3a8fc4',Y:'#ffd166',G:'#4fae4f',K:'#94613a',P:'#b48cf2',W:'#f4f1ea'};
const BN={R:'אָדֹם',B:'כָּחֹל',Y:'צָהֹב',G:'יָרֹק',K:'חוּם',P:'סָגֹל',W:'לָבָן'};
const tint=(hex,f)=>{const n=parseInt(hex.slice(1),16);let r=n>>16,g=n>>8&255,b=n&255;const m=v=>Math.max(0,Math.min(255,Math.round(f>0?v+(255-v)*f:v*(1+f))));return `rgb(${m(r)},${m(g)},${m(b)})`;};
/* cols[z][x] = string of colour letters bottom→top; z=0 is the front row */
function cab(cols,o={}){const s=o.s||30,dx=o.dx||s*.5,dy=o.dy||s*.42,Dp=cols.length,W=cols[0].length;const mh=o.maxH||Math.max(1,...cols.flat().map(c=>c.length));
  const Wd=W*s+Dp*dx+4,Ht=mh*s+Dp*dy+4;const X=(x,z)=>2+x*s+z*dx,Y=(y,z)=>Ht-2-(y+1)*s-z*dy;let out='';
  if(o.floor)for(let z=Dp-1;z>=0;z--)for(let x=0;x<W;x++){const x0=X(x,z),yb=Ht-2-z*dy;out+=`<polygon points="${x0},${yb} ${x0+s},${yb} ${x0+s+dx},${yb-dy} ${x0+dx},${yb-dy}" fill="${(x+z)%2?'#c9d6a3':'#d7e3b3'}" stroke="#a4b384" stroke-width="1" data-x="${x}" data-z="${z}" class="e2cell"/>`;}
  for(let z=Dp-1;z>=0;z--)for(let y=0;y<mh;y++)for(let x=0;x<W;x++){const c=cols[z][x][y];if(!c)continue;const col=BC[c]||c,x0=X(x,z),y0=Y(y,z);
    out+=`<g data-x="${x}" data-z="${z}" class="e2cell"><polygon points="${x0},${y0} ${x0+s},${y0} ${x0+s+dx},${y0-dy} ${x0+dx},${y0-dy}" fill="${tint(col,.35)}"/><polygon points="${x0+s},${y0} ${x0+s+dx},${y0-dy} ${x0+s+dx},${y0-dy+s} ${x0+s},${y0+s}" fill="${tint(col,-.28)}"/><rect x="${x0}" y="${y0}" width="${s}" height="${s}" fill="${col}"/><path d="M${x0} ${y0} h${s} l${dx} ${-dy} M${x0+s} ${y0} v${s} M${x0} ${y0} l${dx} ${-dy} h${s} v${s} l${-dx} ${dy} h${-s} v${-s}" fill="none" stroke="rgba(29,38,49,.55)" stroke-width="1.3"/></g>`;}
  return SV(`0 0 ${Wd} ${Ht}`,out,'e2cab '+(o.cls||''));}
const gridSVG=(rows,cell=18,col='#3a8fc4')=>{const R=rows.length,C=rows[0].length;return SV(`0 0 ${C*cell+2} ${R*cell+2}`,rows.map((r,y)=>[...r].map((c,x)=>`<rect x="${1+x*cell}" y="${1+y*cell}" width="${cell}" height="${cell}" fill="${c==='.'?'#fff':(BC[c]||col)}" stroke="#5c6b73" stroke-width="1"/>`).join('')).join(''),'e2grid');};

/* ================= GENERIC ACTIVITY SHAPES ================= */
const spk=T.spk;
/* fact cards, one per screen, read aloud with highlighted words; then().
   card = {art, t} */
/* a card shows one short line; the whole text is spoken (the line lights up, the rest follows) */
const HEB_PL=x=>x.replace(/[\u0591-\u05C7]/g,'');
function splitLine(t){const re=/[.!?:,–]/g;let m,head=t;while((m=re.exec(t))){const hd=t.slice(0,m.index+1);if(!t.slice(m.index+1).trim())break;if(HEB_PL(hd).length>=12){head=hd.replace(/\s*[,:–]$/,'');break;}}
  if(HEB_PL(head).length<=28)return [head];const ws=head.split(' ');let out='';for(const w of ws){const nx=out?out+' '+w:w;if(HEB_PL(nx).length>26)break;out=nx;}return [out.replace(/[,:–]$/,'')+'…'];}
function lesson(o){const cards=o.cards.filter(c=>c);if(!cards.length)return o.then();let i=0;O.setScreen('sTal',o.bg,o.back);const s=$('#sTal');
  const show=()=>{const c=cards[i];T.hudT(o.title,T.progressBar(i,cards.length));O.sayNow=spk(c.t);s.innerHTML='';
    const [vis]=splitLine(c.t);const card=h('div','prq tqc e2card',`<div class="e2art">${c.art||''}</div><div class="sent" data-rd="1">${vis}</div>`);s.appendChild(card);card.classList.add('flashin');
    const nx=h('button','bigbtn e2next',ICON.play+'<span>הַמְשֵׁךְ</span>');
    nx.onclick=()=>{T.readStop&&T.readStop();sfx.pop(2);i++;if(i<cards.length)show();else{STEP=null;o.then();}};s.appendChild(nx);
    setTimeout(()=>{if(card.isConnected&&cards[i]===c)O.say(O.sayNow);},D(450));setStep(()=>nx.click());};
  show();}
/* question bank → T.quiz. q = {lv, q, a, ds, art, ex, cls} */
const Q=(lv,q,a,ds,x)=>Object.assign({lv,q,a,ds},x||{});
function pickQs(bank,L,n,id){const ok=bank.filter(q=>q.lv<=L),LN=window.LEARN;
  if(id&&LN&&LN.pickItem&&ok.length>n)try{/* the learning engine chooses (wrong ones back on schedule, unseen first, no repeats) */const bk='x2-'+id,items=ok.map(q=>({k:q.q,lv:q.lv})),got=[],ex=new Set();
    while(got.length<n){const r=LN.pickItem(bk,items,{lv:L,upto:true,exclude:ex});if(!r)break;ex.add(r.item.k);got.push(Object.assign({},ok.find(q=>q.q===r.item.k),{bank:bk}));}
    if(got.length===n)return got.sort((a,b)=>a.lv-b.lv);}catch(e){}
  const pool=shuffle(ok);pool.sort((a,b)=>(b.lv===L)-(a.lv===L));return pool.slice(0,Math.min(n,pool.length)).sort((a,b)=>a.lv-b.lv);}
const mkQ=q=>{const opts=shuffle([q.a,...q.ds]);return {pr:`${q.art?`<div class="e2art sm">${q.art}</div>`:''}<div class="qq">${q.q}</div>`,opts:opts.map(x=>q.fmt?q.fmt(x):x),ans:opts.indexOf(q.a),cls:(q.cls||'tx')+' e2o',key:q.q+'|'+q.a,explain:q.ex||'',bank:q.bank,bkey:q.q};};
function runQuiz(o,list){STEP=null;T.quiz({id:o.id,title:o.title,bg:o.bg,back:o.back,n:list.length,gen:i=>typeof list[i]==='function'?list[i]():mkQ(list[i])});}
/* a lesson + quiz activity: def = {id,name,icon,bg,title,cards:[{lv,art,t}],bank:[Q...],n} */
function lessonAct(def){return Object.assign({},def,{run:back=>{const L=lvl(def.id),o={id:def.id,title:def.title||def.name,bg:def.bg,back};
  lesson({...o,cards:def.cards.filter(c=>c.lv===L),then:()=>runQuiz(o,def.gen?def.gen(L):pickQs(def.bank,L,def.n||6,def.id))});}});}

/* tap things in the right order. rounds = [{q, items:[{html,lbl}] in order, start, ex}] */
function orderGame(o){let r=0,err=0,gems=0;O.setScreen('sTal',o.bg,o.back);const s=$('#sTal');
  const play=()=>{const R=o.rounds[r];let k=0;T.hudT(o.title,T.progressBar(r,o.rounds.length));O.sayNow=spk(R.q);s.innerHTML='';
    const card=h('div','prq tqc e2ord',`<div class="qq">${R.q}</div><div class="e2slots">${R.start?`<span class="e2start">${R.start}</span>`:''}${R.items.map((_,j)=>`<span class="e2slot"><i>${j+1}</i></span>`).join('')}</div>${R.ends?`<div class="e2ends"><span>${R.ends[0]}</span><span>${R.ends[1]}</span></div>`:''}`);s.appendChild(card);
    const row=h('div','e2items');const ex=h('div','hintbox');ex.hidden=true;
    const tap=(it,b)=>{if(b.disabled)return;if(it===R.items[k]){const sl=card.querySelectorAll('.e2slot')[k];sl.innerHTML=`${it.html}<b>${it.lbl}</b>`;sl.classList.add('on');b.disabled=true;b.classList.add('ok','used');k++;sfx.pop(k);O.say(spk(it.lbl));
        if(k===R.items.length){const g=2;gems+=g;O.addGems(g,card);sfx.ok(r);O.floatText(card,'+2');if(R.ex){ex.hidden=false;ex.innerHTML=`<div class="cap">${R.ex}</div>`;}setStep(null);
          setTimeout(()=>{if(!card.isConnected)return;r++;if(r<o.rounds.length)play();else T.finishAct(o.id,err,o.rounds.reduce((a,x)=>a+x.items.length,0),gems,o.back,()=>o.again(),o.doneTitle);},D(R.ex?2600:1500));}}
      else{err++;sfx.no();b.classList.remove('shake');void b.offsetWidth;b.classList.add('shake');}};
    const btns=new Map();shuffle(R.items.slice()).forEach(it=>{const b=h('button','chb e2it',`${it.html}<b>${it.lbl}</b>`);b.onclick=()=>tap(it,b);btns.set(it,b);row.appendChild(b);});
    const n=R.items.length;row.style.setProperty('--cols',n<=3?n:n===4?2:Math.ceil(n/2));s.append(row,ex);setStep(()=>{const it=R.items[k];if(it)btns.get(it).click();});};
  play();}

/* tap the right place on a map; items = [{q, map(html), k, ex}] or plain multiple-choice items {mc:Q} */
function mapQuiz(o){const items=o.items;let i=0,err=0,gems=0,tries=0,lock=false;O.setScreen('sTal',o.bg,o.back);const s=$('#sTal');
  const next=()=>{if(!s.isConnected)return;i++;if(i>=items.length){STEP=null;T.finishAct(o.id,err,items.length,gems,o.back,()=>o.again());}else show();};
  const show=()=>{const it=items[i];tries=0;lock=false;T.hudT(o.title,T.progressBar(i,items.length));O.sayNow=spk(it.q);s.innerHTML='';
    const card=h('div','prq tqc e2mapq',`${it.top||''}<div class="qq">${it.q}</div><div class="e2mapw">${it.map}</div>`);s.appendChild(card);card.classList.add('flashin');
    const ex=h('div','hintbox');ex.hidden=true;s.appendChild(ex);if(T.rdQ)T.rdQ({},card);
    const els=k=>[...card.querySelectorAll(`[data-k="${k}"]`)];
    const done=(good)=>{lock=true;els(it.k).forEach(e=>e.classList.add(good?'e2ok':'e2show'));if(it.reveal){const w=card.querySelector('.e2mapw');w.innerHTML=it.reveal;els(it.k).forEach(e=>e.classList.add(good?'e2ok':'e2show'));}
      if(it.ex){ex.hidden=false;ex.innerHTML=`<div class="cap">${it.ex}</div>`;}setTimeout(next,D(it.ex?2600:1500));};
    card.querySelector('.e2mapw').addEventListener('click',e=>{if(lock)return;const t=e.target.closest('[data-k]');if(!t||!t.classList.contains('e2hit'))return;const k=t.dataset.k;
      if(k===it.k){const g=tries?1:2;gems+=g;O.addGems(g,card);O.floatText(card,'+'+g);sfx.ok(i);done(true);}
      else{tries++;err++;sfx.no();els(k).forEach(x=>{x.classList.remove('e2bad');void x.getBBox;x.classList.add('e2bad');setTimeout(()=>x.classList.remove('e2bad'),700);});if(tries>=2)done(false);}});
    setStep(()=>{const t=card.querySelector(`.e2hit[data-k="${it.k}"]`);if(t)t.dispatchEvent(new MouseEvent('click',{bubbles:true}));});};
  window.__e2map={get k(){return items[i]&&items[i].k;}};show();}

/* ================= 🚀 SPACE ================= */
const SKY_SUN=lessonAct({id:'sky-sun',name:'שֶׁמֶשׁ וְיָרֵחַ',icon:()=>SUN,bg:'final',skill:'מדע: שמש, ירח, יום ולילה',
 cards:[{lv:1,art:SUN,t:'הַשֶּׁמֶשׁ הִיא כּוֹכָב: כַּדּוּר עֲנָק וְחַם מְאוֹד, שֶׁנּוֹתֵן לָנוּ אוֹר וְחֹם.'},{lv:1,art:SUN,t:'הַשֶּׁמֶשׁ גְּדוֹלָה הַרְבֵּה יוֹתֵר מִכַּדּוּר הָאָרֶץ. הִיא נִרְאֵית קְטַנָּה כִּי הִיא רְחוֹקָה מְאוֹד.'},
  {lv:1,art:EARTH_DN,t:'כַּדּוּר הָאָרֶץ מִסְתּוֹבֵב. הַצַּד שֶׁמּוּל הַשֶּׁמֶשׁ – יוֹם. הַצַּד הַשֵּׁנִי – לַיְלָה.'},{lv:1,art:MOONF,t:'הַיָּרֵחַ מִסְתּוֹבֵב סְבִיב כַּדּוּר הָאָרֶץ. הוּא לֹא מֵאִיר בְּעַצְמוֹ – הַשֶּׁמֶשׁ מְאִירָה אוֹתוֹ.'},
  {lv:2,art:MOONS,t:'בְּכָל לַיְלָה הַיָּרֵחַ נִרְאֶה קְצָת אַחֶרֶת. פַּעַם הוּא דַּק כְּמוֹ בָּנָנָה, וּפַעַם הוּא עִגּוּל מָלֵא.'},{lv:2,art:MOONF,t:'בְּעֵרֶךְ פַּעַם בְּחֹדֶשׁ רוֹאִים יָרֵחַ מָלֵא.'},
  {lv:2,art:SUN,t:'הַשֶּׁמֶשׁ הִיא הַכּוֹכָב הֲכִי קָרוֹב אֵלֵינוּ. אֶת הַכּוֹכָבִים הָאֲחֵרִים רוֹאִים בַּלַּיְלָה.'},
  {lv:3,art:planetRow(['earth']),t:'כַּדּוּר הָאָרֶץ מַקִּיף אֶת הַשֶּׁמֶשׁ. סִבּוּב אֶחָד שָׁלֵם לוֹקֵחַ שָׁנָה.'},{lv:3,art:SUN,t:'אָסוּר לְהִסְתַּכֵּל יָשָׁר אֶל הַשֶּׁמֶשׁ – זֶה מַזִּיק לָעֵינַיִם!'}],
 bank:[Q(1,'מָה נוֹתֵן לָנוּ אוֹר וְחֹם בַּיּוֹם?','הַשֶּׁמֶשׁ',['הַיָּרֵחַ','הָעֲנָנִים']),Q(1,'הַשֶּׁמֶשׁ הִיא...','כּוֹכָב',['כּוֹכַב לֶכֶת','יָרֵחַ']),Q(1,'מִי הֲכִי גָּדוֹל?','הַשֶּׁמֶשׁ',['כַּדּוּר הָאָרֶץ','הַיָּרֵחַ']),
  Q(1,'לָמָּה יֵשׁ יוֹם וְלַיְלָה?','כַּדּוּר הָאָרֶץ מִסְתּוֹבֵב',['הַשֶּׁמֶשׁ הוֹלֶכֶת לִישֹׁן','הַיָּרֵחַ מַסְתִּיר אֶת הַשֶּׁמֶשׁ'],{art:EARTH_DN}),Q(1,'מִי מִסְתּוֹבֵב סְבִיב כַּדּוּר הָאָרֶץ?','הַיָּרֵחַ',['הַשֶּׁמֶשׁ','כָּל הַכּוֹכָבִים']),
  Q(1,'הַאִם הַיָּרֵחַ מֵאִיר בְּעַצְמוֹ?','לֹא, הַשֶּׁמֶשׁ מְאִירָה אוֹתוֹ',['כֵּן, יֵשׁ בּוֹ מְנוֹרָה','כֵּן, הוּא בּוֹעֵר']),
  Q(2,'אֵיזֶה יָרֵחַ בַּתְּמוּנָה?','יָרֵחַ מָלֵא',['חֲצִי יָרֵחַ','יָרֵחַ דַּק'],{art:MOONF}),Q(2,'אֵיזֶה יָרֵחַ בַּתְּמוּנָה?','חֲצִי יָרֵחַ',['יָרֵחַ מָלֵא','יָרֵחַ דַּק'],{art:SV('0 0 120 120',`<rect width="120" height="120" rx="12" fill="#1d2140"/>`+moon('half',60,60,44))}),
  Q(2,'אֵיזֶה יָרֵחַ בַּתְּמוּנָה?','יָרֵחַ דַּק',['יָרֵחַ מָלֵא','חֲצִי יָרֵחַ'],{art:SV('0 0 120 120',`<rect width="120" height="120" rx="12" fill="#1d2140"/>`+moon('cres',60,60,44))}),
  Q(2,'כָּל כַּמָּה זְמַן, בְּעֵרֶךְ, רוֹאִים יָרֵחַ מָלֵא?','פַּעַם בְּחֹדֶשׁ',['כָּל יוֹם','פַּעַם בְּשָׁנָה']),Q(2,'מָה הַכּוֹכָב הֲכִי קָרוֹב אֵלֵינוּ?','הַשֶּׁמֶשׁ',['הַיָּרֵחַ','מַאְדִּים']),
  Q(2,'לָמָּה הַשֶּׁמֶשׁ נִרְאֵית קְטַנָּה?','כִּי הִיא רְחוֹקָה מְאוֹד',['כִּי הִיא קְטַנָּה','כִּי הִיא יְשֵׁנָה']),
  Q(3,'כַּמָּה זְמַן לוֹקֵחַ לְכַדּוּר הָאָרֶץ לְהַקִּיף אֶת הַשֶּׁמֶשׁ?','שָׁנָה',['יוֹם','שָׁבוּעַ']),Q(3,'כַּמָּה זְמַן לוֹקֵחַ לְכַדּוּר הָאָרֶץ לְהִסְתּוֹבֵב פַּעַם אַחַת סְבִיב עַצְמוֹ?','יוֹם',['שָׁנָה','שָׁעָה']),
  Q(3,'כְּשֶׁבְּיִשְׂרָאֵל יוֹם, בַּצַּד הַשֵּׁנִי שֶׁל כַּדּוּר הָאָרֶץ...','לַיְלָה',['גַּם יוֹם','תָּמִיד חֹרֶף']),Q(3,'מֻתָּר לְהִסְתַּכֵּל יָשָׁר אֶל הַשֶּׁמֶשׁ?','לֹא, זֶה מַזִּיק לָעֵינַיִם',['כֵּן, כַּמָּה שֶׁרוֹצִים','רַק בַּבֹּקֶר'])]});
const SKY_PL=lessonAct({id:'sky-planets',name:'כּוֹכְבֵי הַלֶּכֶת',icon:()=>planetSVG('saturn'),bg:'final',skill:'מדע: כוכבי הלכת',
 cards:[{lv:1,art:planetRow(),t:'סְבִיב הַשֶּׁמֶשׁ מִסְתּוֹבְבִים שְׁמוֹנָה כּוֹכְבֵי לֶכֶת. אֶחָד מֵהֶם הוּא כַּדּוּר הָאָרֶץ – הַבַּיִת שֶׁלָּנוּ!'},
  {lv:1,art:planetRow(['mercury','venus','earth','mars']),t:'הֲכִי קָרוֹב לַשֶּׁמֶשׁ: כּוֹכַב חַמָּה. אַחֲרָיו: נֹגַהּ, כַּדּוּר הָאָרֶץ וּמַאְדִּים.'},{lv:1,art:planetSVG('mars'),t:'לְמַאְדִּים קוֹרְאִים "הַכּוֹכָב הָאָדֹם", כִּי הָאֲדָמָה שֶׁלּוֹ אֲדַמְדַּמָּה.'},
  {lv:2,art:planetRow(['jupiter','saturn','uranus','neptune']),t:'אַחֲרֵי מַאְדִּים בָּאִים הָעֲנָקִים: צֶדֶק, שַׁבְּתַאי, אוּרָנוּס וְנֶפְטוּן.'},{lv:2,art:planetSVG('jupiter'),t:'צֶדֶק הוּא כּוֹכַב הַלֶּכֶת הֲכִי גָּדוֹל.'},{lv:2,art:planetSVG('saturn'),t:'לְשַׁבְּתַאי יֵשׁ טַבָּעוֹת גְּדוֹלוֹת שֶׁל חֲתִיכוֹת קֶרַח.'},
  {lv:3,art:planetSVG('venus'),t:'נֹגַהּ הוּא כּוֹכַב הַלֶּכֶת הֲכִי חַם. נֶפְטוּן רָחוֹק מְאוֹד מֵהַשֶּׁמֶשׁ, וְשָׁם קַר מְאוֹד.'},{lv:3,art:planetSVG('mercury'),t:'כּוֹכַב חַמָּה הוּא כּוֹכַב הַלֶּכֶת הֲכִי קָטָן.'}],
 bank:[Q(1,'כַּמָּה כּוֹכְבֵי לֶכֶת מִסְתּוֹבְבִים סְבִיב הַשֶּׁמֶשׁ?','8',['3','20']),Q(1,'עַל אֵיזֶה כּוֹכַב לֶכֶת אֲנַחְנוּ גָּרִים?','כַּדּוּר הָאָרֶץ',['מַאְדִּים','צֶדֶק']),
  Q(1,'אֵיזֶה כּוֹכַב לֶכֶת הֲכִי קָרוֹב לַשֶּׁמֶשׁ?','כּוֹכַב חַמָּה',['נֶפְטוּן','צֶדֶק']),Q(1,'לְאֵיזֶה כּוֹכַב לֶכֶת קוֹרְאִים "הַכּוֹכָב הָאָדֹם"?','מַאְדִּים',['נֹגַהּ','אוּרָנוּס']),
  Q(1,'אֵיזֶה כּוֹכַב לֶכֶת בַּתְּמוּנָה?','כַּדּוּר הָאָרֶץ',['מַאְדִּים','שַׁבְּתַאי'],{art:planetSVG('earth')}),
  Q(2,'אֵיזֶה כּוֹכַב לֶכֶת הֲכִי גָּדוֹל?','צֶדֶק',['כַּדּוּר הָאָרֶץ','מַאְדִּים']),Q(2,'לְאֵיזֶה כּוֹכַב לֶכֶת יֵשׁ טַבָּעוֹת גְּדוֹלוֹת שֶׁרוֹאִים הֵיטֵב?','שַׁבְּתַאי',['מַאְדִּים','נֹגַהּ']),
  Q(2,'אֵיזֶה כּוֹכַב לֶכֶת בַּתְּמוּנָה?','שַׁבְּתַאי',['מַאְדִּים','כּוֹכַב חַמָּה'],{art:planetSVG('saturn')}),Q(2,'מִי בָּא אַחֲרֵי כַּדּוּר הָאָרֶץ, רָחוֹק יוֹתֵר מֵהַשֶּׁמֶשׁ?','מַאְדִּים',['נֹגַהּ','כּוֹכַב חַמָּה']),
  Q(3,'אֵיזֶה כּוֹכַב לֶכֶת הֲכִי חַם?','נֹגַהּ',['מַאְדִּים','נֶפְטוּן']),Q(3,'אֵיזֶה כּוֹכַב לֶכֶת הֲכִי רָחוֹק מֵהַשֶּׁמֶשׁ?','נֶפְטוּן',['מַאְדִּים','צֶדֶק']),Q(3,'אֵיזֶה כּוֹכַב לֶכֶת הֲכִי קָטָן?','כּוֹכַב חַמָּה',['צֶדֶק','שַׁבְּתַאי']),
  Q(3,'בֵּין אֵילוּ כּוֹכְבֵי לֶכֶת נִמְצָא כַּדּוּר הָאָרֶץ?','נֹגַהּ וּמַאְדִּים',['צֶדֶק וְשַׁבְּתַאי','אוּרָנוּס וְנֶפְטוּן'])]});
const pItem=p=>({html:`<span class="e2pi">${planetSVG(p.k)}</span>`,lbl:p.n,k:p.k});
const SKY_ORD={id:'sky-order',name:'בַּסֵּדֶר מֵהַשֶּׁמֶשׁ',icon:()=>planetSVG('earth'),skill:'מדע: סדר כוכבי הלכת',run:function run(back){const L=lvl('sky-order');const all=PLANETS.map(pItem);
  const R=n=>({q:'לְחַץ עַל כּוֹכְבֵי הַלֶּכֶת לְפִי הַסֵּדֶר: מֵהַקָּרוֹב לַשֶּׁמֶשׁ – עַד הָרָחוֹק.',start:`<span class="e2pi">${SUN}</span>`,items:all.slice(0,n),ex:n<8?'כָּל הַכָּבוֹד! אַחֲרֵי מַאְדִּים בָּאִים צֶדֶק, שַׁבְּתַאי, אוּרָנוּס וְנֶפְטוּן.':'מְעֻלֶּה! זֶה הַסֵּדֶר שֶׁל כָּל שְׁמוֹנַת כּוֹכְבֵי הַלֶּכֶת.'});
  const go=()=>orderGame({id:'sky-order',title:'בַּסֵּדֶר מֵהַשֶּׁמֶשׁ',bg:'final',back,again:()=>run(back),rounds:L===1?[R(4)]:L===2?[R(4),R(8)]:[R(8)]});
  if(L===1)lesson({title:'בַּסֵּדֶר מֵהַשֶּׁמֶשׁ',bg:'final',back,cards:[{art:planetRow(),t:'כָּךְ מְסֻדָּרִים כּוֹכְבֵי הַלֶּכֶת. מֵהַשֶּׁמֶשׁ וְהָלְאָה: כּוֹכַב חַמָּה, נֹגַהּ, כַּדּוּר הָאָרֶץ, מַאְדִּים, צֶדֶק, שַׁבְּתַאי, אוּרָנוּס וְנֶפְטוּן.'}],then:go});else go();}};
const SKY_AST=lessonAct({id:'sky-astro',name:'אַסְטְרוֹנָאוּטִים',icon:()=>ASTRO,bg:'final',skill:'מדע: חלל ואסטרונאוטים',
 cards:[{lv:1,art:ROCKET,t:'אַסְטְרוֹנָאוּטִים הֵם אֲנָשִׁים שֶׁטָּסִים לֶחָלָל בַּחֲלָלִית.'},{lv:1,art:ASTRO,t:'בֶּחָלָל אֵין אֲוִיר לִנְשִׁימָה, לָכֵן לוֹבְשִׁים חֲלִיפַת חָלָל עִם קַסְדָּה.'},{lv:1,art:ASTRO,t:'בְּתוֹךְ הַחֲלָלִית הָאַסְטְרוֹנָאוּטִים מְרַחֲפִים, כְּאִלּוּ אֵין לָהֶם מִשְׁקָל.'},
  {lv:2,art:MOONF,t:'לִפְנֵי יוֹתֵר מֵחֲמִשִּׁים שָׁנָה אֲנָשִׁים נָחֲתוּ עַל הַיָּרֵחַ וְהָלְכוּ עָלָיו.'},{lv:2,art:ROCKET,t:'בְּתַחֲנַת הֶחָלָל אַסְטְרוֹנָאוּטִים גָּרִים וְעוֹבְדִים כַּמָּה חֳדָשִׁים.'},
  {lv:3,art:ASTRO,t:'בֶּחָלָל הַשָּׁמַיִם שְׁחֹרִים, גַּם כְּשֶׁהַשֶּׁמֶשׁ זוֹרַחַת.'},{lv:3,art:planetSVG('earth'),t:'מֵהֶחָלָל רוֹאִים שֶׁכַּדּוּר הָאָרֶץ עָגֹל וְכָחֹל: רֻבּוֹ מְכֻסֶּה בְּמַיִם.'}],
 bank:[Q(1,'אֵיךְ טָסִים לֶחָלָל?','בַּחֲלָלִית',['בְּאוֹפַנַּיִם','בְּסִירָה']),Q(1,'לָמָּה צְרִיכִים חֲלִיפַת חָלָל?','כִּי בֶּחָלָל אֵין אֲוִיר לִנְשִׁימָה',['כִּי בֶּחָלָל יוֹרֵד גֶּשֶׁם','כְּדֵי לִהְיוֹת יָפִים']),
  Q(1,'מָה קוֹרֶה לָאַסְטְרוֹנָאוּטִים בְּתוֹךְ הַחֲלָלִית?','הֵם מְרַחֲפִים',['הֵם שׂוֹחִים בְּמַיִם','הֵם נִהְיִים קְטַנִּים']),
  Q(2,'עַל מָה אֲנָשִׁים כְּבָר הָלְכוּ?','עַל הַיָּרֵחַ',['עַל הַשֶּׁמֶשׁ','עַל צֶדֶק']),Q(2,'אֵיפֹה אַסְטְרוֹנָאוּטִים גָּרִים כַּמָּה חֳדָשִׁים?','בְּתַחֲנַת הֶחָלָל',['עַל הַשֶּׁמֶשׁ','עַל מַאְדִּים']),
  Q(3,'אֵיזֶה צֶבַע הַשָּׁמַיִם בֶּחָלָל?','שָׁחֹר',['כָּחֹל','וָרֹד']),Q(3,'בַּמֶּה מְכֻסֶּה רֹב כַּדּוּר הָאָרֶץ?','בְּמַיִם',['בְּחוֹל','בְּשֶׁלֶג'])]});

/* ================= 🐾 NATURE ================= */
const NAT_HOME=lessonAct({id:'nat-home',name:'אֵיפֹה גָּרִים? מָה אוֹכְלִים?',icon:()=>em('🐪'),bg:'forest',skill:'טבע: בתי גידול ומזון',
 cards:[{lv:1,art:em('🐟 🐪 🐒'),t:'כָּל בַּעַל חַיִּים גָּר בְּמָקוֹם שֶׁמַּתְאִים לוֹ: הַדָּג בַּמַּיִם, הַגָּמָל בַּמִּדְבָּר וְהַקּוֹף בַּיַּעַר.'},{lv:1,art:em('🐪'),t:'הַגָּמָל יָכוֹל לָלֶכֶת בַּמִּדְבָּר יָמִים רַבִּים בְּלִי לִשְׁתּוֹת.'},
  {lv:1,art:em('🐄 🐇 🦁'),t:'יֵשׁ חַיּוֹת שֶׁאוֹכְלוֹת צְמָחִים, כְּמוֹ הַפָּרָה וְהָאַרְנָב. יֵשׁ חַיּוֹת שֶׁאוֹכְלוֹת בָּשָׂר, כְּמוֹ הָאַרְיֵה.'},
  {lv:2,art:em('🐝 🌼'),t:'הַדְּבוֹרָה שׁוֹתָה צוּף מֵהַפְּרָחִים וְעוֹשָׂה מִמֶּנּוּ דְּבַשׁ.'},{lv:2,art:em('🐼'),t:'הַפַּנְדָּה אוֹכֶלֶת כִּמְעַט רַק בַּמְבּוּק.'},{lv:2,art:em('🐻‍❄️'),t:'דֹּב הַקֹּטֶב גָּר בַּצָּפוֹן הַקַּר, בֵּין קֶרַח וְשֶׁלֶג.'},
  {lv:3,art:em('🐻'),t:'יֵשׁ חַיּוֹת שֶׁאוֹכְלוֹת גַּם צְמָחִים וְגַם בָּשָׂר, כְּמוֹ הַדֹּב.'},{lv:3,art:em('🦉 🦇'),t:'יֵשׁ חַיּוֹת שֶׁעֵרוֹת בַּלַּיְלָה וִישֵׁנוֹת בַּיּוֹם, כְּמוֹ הַיַּנְשׁוּף וְהָעֲטַלֵּף.'}],
 bank:[Q(1,'אֵיפֹה גָּר הַדָּג?','בַּמַּיִם',['בַּמִּדְבָּר','עַל הָעֵץ'],{art:em('🐟')}),Q(1,'אֵיפֹה גָּר הַגָּמָל?','בַּמִּדְבָּר',['בַּיָּם','בַּקֶּרַח'],{art:em('🐪')}),Q(1,'מָה אוֹכֶלֶת הַפָּרָה?','עֵשֶׂב',['בָּשָׂר','דָּגִים'],{art:em('🐄')}),
  Q(1,'מָה אוֹכֵל הָאַרְיֵה?','בָּשָׂר',['עֵשֶׂב','פְּרָחִים'],{art:em('🦁')}),Q(1,'אֵיפֹה גָּר הַקּוֹף?','בַּיַּעַר',['בַּיָּם','בַּקֶּרַח'],{art:em('🐒')}),
  Q(2,'מָה עוֹשָׂה הַדְּבוֹרָה מִצּוּף הַפְּרָחִים?','דְּבַשׁ',['חָלָב','לֶחֶם'],{art:em('🐝')}),Q(2,'מָה אוֹכֶלֶת הַפַּנְדָּה?','בַּמְבּוּק',['דָּגִים','בָּשָׂר'],{art:em('🐼')}),Q(2,'אֵיפֹה גָּר דֹּב הַקֹּטֶב?','בֵּין קֶרַח וְשֶׁלֶג',['בַּמִּדְבָּר','בַּגַּן'],{art:em('🐻‍❄️')}),
  Q(3,'מָה אוֹכֵל הַדֹּב?','גַּם צְמָחִים וְגַם בָּשָׂר',['רַק עֵשֶׂב','רַק דְּבַשׁ'],{art:em('🐻')}),Q(3,'מָתַי הַיַּנְשׁוּף עֵר?','בַּלַּיְלָה',['בַּצָּהֳרַיִם','אַף פַּעַם'],{art:em('🦉')}),Q(3,'מִי אוֹכֵל רַק צְמָחִים?','הָאַרְנָב',['הָאַרְיֵה','הַנָּמֵר'])]});
const CLS=['יוֹנֵק','עוֹף','דָּג','זוֹחֵל','חֶרֶק'];
const ANI2=[[1,'🐄','הַפָּרָה','יוֹנֵק',1],[1,'🐕','הַכֶּלֶב','יוֹנֵק'],[1,'🦅','הַנֶּשֶׁר','עוֹף'],[1,'🐦','הַצִּפּוֹר','עוֹף',1],[1,'🐟','הַדָּג','דָּג'],
 [2,'🐍','הַנָּחָשׁ','זוֹחֵל'],[2,'🦎','הַלְּטָאָה','זוֹחֵל',1],[2,'🐢','הַצָּב','זוֹחֵל'],[2,'🐜','הַנְּמָלָה','חֶרֶק',1],[2,'🐝','הַדְּבוֹרָה','חֶרֶק',1],[2,'🦋','הַפַּרְפַּר','חֶרֶק'],
 [3,'🐋','הַלִּוְיָתָן','יוֹנֵק',0,'הַלִּוְיָתָן חַי בַּיָּם, אֲבָל הוּא יוֹנֵק: הוּא נוֹשֵׁם אֲוִיר וּמֵינִיק אֶת הַגּוּרִים.'],[3,'🐬','הַדּוֹלְפִין','יוֹנֵק',0,'הַדּוֹלְפִין נוֹשֵׁם אֲוִיר וּמֵינִיק – הוּא יוֹנֵק.'],[3,'🦇','הָעֲטַלֵּף','יוֹנֵק',0,'הָעֲטַלֵּף עָף, אֲבָל הוּא יוֹנֵק וְלֹא עוֹף.'],[3,'🐧','הַפִּינְגְּוִין','עוֹף',0,'הַפִּינְגְּוִין לֹא עָף, אֲבָל יֵשׁ לוֹ נוֹצוֹת וּמַקּוֹר – הוּא עוֹף.']];
const NAT_GRP=lessonAct({id:'nat-groups',name:'מִשְׁפְּחוֹת שֶׁל חַיּוֹת',icon:()=>em('🦋'),bg:'forest',skill:'טבע: מיון בעלי חיים (יונקים, עופות, דגים, זוחלים, חרקים)',
 cards:[{lv:1,art:em('🐄 🐕'),t:'יוֹנְקִים מֵינִיקִים אֶת הַגּוּרִים שֶׁלָּהֶם בְּחָלָב. גַּם אֲנַחְנוּ יוֹנְקִים!'},{lv:1,art:em('🦅 🐦'),t:'לָעוֹפוֹת יֵשׁ נוֹצוֹת וּמַקּוֹר, וְהֵם מַטִּילִים בֵּיצִים.'},{lv:1,art:em('🐟'),t:'דָּגִים חַיִּים בַּמַּיִם וְנוֹשְׁמִים בִּזִימִים.'},
  {lv:2,art:em('🐍 🦎 🐢'),t:'לַזּוֹחֲלִים יֵשׁ עוֹר עִם קַשְׂקַשִּׂים, כְּמוֹ לַנָּחָשׁ, לַלְּטָאָה וְלַצָּב.'},{lv:2,art:em('🐜 🐝 🦋'),t:'לַחֲרָקִים יֵשׁ שֵׁשׁ רַגְלַיִם, כְּמוֹ לַנְּמָלָה, לַדְּבוֹרָה וְלַפַּרְפַּר.'},
  {lv:3,art:em('🕷️'),t:'לָעַכָּבִישׁ יֵשׁ שְׁמוֹנֶה רַגְלַיִם, וְלָכֵן הוּא לֹא חֶרֶק.'},{lv:3,art:em('🐋 🐬'),t:'הַלִּוְיָתָן וְהַדּוֹלְפִין חַיִּים בַּיָּם, אֲבָל הֵם יוֹנְקִים, לֹא דָּגִים.'},{lv:3,art:em('🦇'),t:'הָעֲטַלֵּף עָף, אֲבָל הוּא יוֹנֵק וְלֹא עוֹף.'}],
 gen:L=>{const pool=shuffle(ANI2.filter(a=>a[0]<=L));pool.sort((a,b)=>(b[0]===L)-(a[0]===L));const list=pool.slice(0,L===3?5:6).map(([lv,e,n,c,f,ex])=>Q(lv,`${n} ${f?'הִיא':'הוּא'}...`,c,shuffle(CLS.filter(x=>x!==c&&(L>1||!['זוֹחֵל','חֶרֶק'].includes(x)))).slice(0,2),{art:em(e),ex:ex||''}));
  if(L===3)list.push(Q(3,'כַּמָּה רַגְלַיִם יֵשׁ לְחֶרֶק?','6',['4','8'],{art:em('🐜')}),Q(3,'הָעַכָּבִישׁ הוּא חֶרֶק?','לֹא',['כֵּן'],{art:em('🕷️'),ex:'לָעַכָּבִישׁ יֵשׁ שְׁמוֹנֶה רַגְלַיִם, וְלַחֶרֶק – שֵׁשׁ.'}));return list.sort((a,b)=>a.lv-b.lv);}});
const CYC={chicken:{lv:1,t:'כָּךְ גָּדֵל אֶפְרוֹחַ: מִבֵּיצָה יוֹצֵא אֶפְרוֹחַ, וְהוּא גָּדֵל לְתַרְנְגֹלֶת.',q:'אֵיךְ גָּדֵל אֶפְרוֹחַ? לְחַץ לְפִי הַסֵּדֶר.',items:[[em('🥚','sm'),'בֵּיצָה'],[em('🐣','sm'),'אֶפְרוֹחַ'],[em('🐔','sm'),'תַּרְנְגֹלֶת']]},
 plant:{lv:1,t:'כָּךְ גָּדֵל צֶמַח: זֶרַע, נֶבֶט, צֶמַח – וּפֶרַח.',q:'אֵיךְ גָּדֵל צֶמַח? לְחַץ לְפִי הַסֵּדֶר.',items:[[SEED(0),'זֶרַע'],[SEED(1),'נֶבֶט'],[SEED(2),'צֶמַח'],[SEED(3),'פֶּרַח']]},
 butterfly:{lv:2,t:'כָּךְ גָּדֵל פַּרְפַּר: בֵּיצָה, זַחַל, גֹּלֶם – וּפַרְפַּר!',q:'אֵיךְ גָּדֵל פַּרְפַּר? לְחַץ לְפִי הַסֵּדֶר.',items:[[em('🥚','sm'),'בֵּיצָה'],[em('🐛','sm'),'זַחַל'],[PUPA,'גֹּלֶם'],[em('🦋','sm'),'פַּרְפַּר']]},
 frog:{lv:3,t:'כָּךְ גְּדֵלָה צְפַרְדֵּעַ: מֵהַבֵּיצִים בַּמַּיִם יוֹצְאִים רֹאשָׁנִים, וְהֵם גְּדֵלִים לִצְפַרְדְּעִים.',q:'אֵיךְ גְּדֵלָה צְפַרְדֵּעַ? לְחַץ לְפִי הַסֵּדֶר.',items:[[FROGEGGS,'בֵּיצִים'],[TADPOLE,'רֹאשָׁן'],[em('🐸','sm'),'צְפַרְדֵּעַ']]}};
const cycArt=c=>`<div class="e2row">${c.items.map(([a,l])=>`<span class="e2cyc">${a}<b>${l}</b></span>`).join('<span class="e2arr">⬅</span>')}</div>`;
const NAT_CYC={id:'nat-cycle',name:'אֵיךְ גְּדֵלִים?',icon:()=>em('🐛'),skill:'טבע: מחזורי חיים',run:function run(back){const L=lvl('nat-cycle');const ks=L===1?['chicken','plant']:L===2?['butterfly','plant']:['frog','butterfly'];
  const rounds=ks.map(k=>({q:CYC[k].q,items:CYC[k].items.map(([html,lbl])=>({html:`<span class="e2pi">${html}</span>`,lbl})),ends:['קֹדֶם','אַחַר כָּךְ']}));
  lesson({title:'אֵיךְ גְּדֵלִים?',bg:'forest',back,cards:ks.filter(k=>CYC[k].lv===L).map(k=>({art:cycArt(CYC[k]),t:CYC[k].t})),then:()=>orderGame({id:'nat-cycle',title:'אֵיךְ גְּדֵלִים?',bg:'forest',back,again:()=>run(back),rounds})});}};
const SEASONS=`<div class="e2row">${[['🍂','סְתָו'],['🌧️','חֹרֶף'],['🌸','אָבִיב'],['☀️','קַיִץ']].map(([e,n])=>`<span class="e2cyc">${em(e,'sm')}<b>${n}</b></span>`).join('')}</div>`;
const NAT_IL=lessonAct({id:'nat-il',name:'הַטֶּבַע בְּיִשְׂרָאֵל',icon:()=>KALANIT,bg:'forest',skill:'טבע: עונות השנה, חי וצומח בישראל',
 cards:[{lv:1,art:SEASONS,t:'בְּיִשְׂרָאֵל יֵשׁ אַרְבַּע עוֹנוֹת: סְתָו, חֹרֶף, אָבִיב וְקַיִץ.'},{lv:1,art:em('🌧️ ☀️'),t:'בַּחֹרֶף יוֹרֵד גֶּשֶׁם וְקַר. בַּקַּיִץ חַם מְאוֹד, וְכִמְעַט לֹא יוֹרֵד גֶּשֶׁם.'},
  {lv:1,art:KALANIT,t:'בְּסוֹף הַחֹרֶף וּבָאָבִיב פּוֹרְחִים הַרְבֵּה פְּרָחִים, כְּמוֹ הַכַּלָּנִית הָאֲדֻמָּה.'},{lv:1,art:em('🍂'),t:'בַּסְּתָו נוֹשְׁרִים הֶעָלִים שֶׁל חֵלֶק מֵהָעֵצִים, וְיוֹרֵד הַגֶּשֶׁם הָרִאשׁוֹן.'},
  {lv:2,art:HOOPOE,t:'הַדּוּכִיפַת הִיא הַצִּפּוֹר הַלְּאֻמִּית שֶׁל יִשְׂרָאֵל. יֵשׁ לָהּ כֶּתֶר שֶׁל נוֹצוֹת עַל הָרֹאשׁ.'},{lv:2,art:'',t:'הַיָּעֵל גָּר בַּמִּדְבָּר וּמְטַפֵּס עַל סְלָעִים מַהֵר מְאוֹד. אֶפְשָׁר לִפְגֹּשׁ אוֹתוֹ בְּעֵין גֶּדִי.'},
  {lv:2,art:em('🕊️ 🦢'),t:'בַּסְּתָו וּבָאָבִיב עוֹבְרוֹת מֵעַל יִשְׂרָאֵל הַרְבֵּה מְאוֹד צִפּוֹרִים נוֹדְדוֹת.'},
  {lv:3,art:em('🌾 🍇 🫒'),t:'שִׁבְעַת הַמִּינִים: חִטָּה, שְׂעוֹרָה, גֶּפֶן, תְּאֵנָה, רִמּוֹן, זַיִת וְתָמָר.'},{lv:3,art:em('🫒'),t:'עֵץ הַזַּיִת יָכוֹל לִחְיוֹת מֵאוֹת שָׁנִים, וּמֵהַזֵּיתִים עוֹשִׂים שֶׁמֶן.'}],
 bank:[Q(1,'מָתַי יוֹרֵד הֲכִי הַרְבֵּה גֶּשֶׁם בְּיִשְׂרָאֵל?','בַּחֹרֶף',['בַּקַּיִץ','בָּאָבִיב']),Q(1,'מָתַי הֲכִי חַם בְּיִשְׂרָאֵל?','בַּקַּיִץ',['בַּחֹרֶף','בַּסְּתָו']),Q(1,'כַּמָּה עוֹנוֹת יֵשׁ בַּשָּׁנָה?','4',['2','7']),
  Q(1,'מָתַי פּוֹרְחִים הֲכִי הַרְבֵּה פְּרָחִים?','בָּאָבִיב',['בַּקַּיִץ','בַּסְּתָו']),Q(1,'אֵיזוֹ עוֹנָה בָּאָה אַחֲרֵי הַחֹרֶף?','הָאָבִיב',['הַסְּתָו','הַקַּיִץ']),
  Q(2,'מָה הַצִּפּוֹר הַלְּאֻמִּית שֶׁל יִשְׂרָאֵל?','הַדּוּכִיפַת',['הַיּוֹנָה','הַתֻּכִּי'],{art:HOOPOE}),Q(2,'אֵיפֹה גָּר הַיָּעֵל?','בֵּין סְלָעִים בַּמִּדְבָּר',['בְּתוֹךְ הַיָּם','בְּתוֹךְ הָעִיר']),
  Q(2,'מָה עוֹבֵר מֵעַל יִשְׂרָאֵל בַּסְּתָו וּבָאָבִיב?','צִפּוֹרִים נוֹדְדוֹת',['פִּילִים','דָּגִים']),Q(2,'אֵיזֶה פֶּרַח אָדֹם פּוֹרֵחַ בְּסוֹף הַחֹרֶף?','הַכַּלָּנִית',['הַחַמָּנִית','הַחַרְצִית'],{art:KALANIT}),
  Q(3,'מָה מֵאֵלֶּה הוּא מִשִּׁבְעַת הַמִּינִים?','רִמּוֹן',['תַּפּוּחַ','בָּנָנָה']),Q(3,'מָה מֵאֵלֶּה הוּא מִשִּׁבְעַת הַמִּינִים?','זַיִת',['תּוּת','אֲבַטִּיחַ']),Q(3,'מָה מֵאֵלֶּה הוּא מִשִּׁבְעַת הַמִּינִים?','תְּאֵנָה',['מַנְגּוֹ','אֲגַס']),
  Q(3,'מָה עוֹשִׂים מִזֵּיתִים?','שֶׁמֶן',['סֻכָּר','קֶמַח'])]});

/* ================= 🗺️ MAPS & HISTORY ================= */
const hq=(q,a,ds,lv,ex)=>Q(lv,q,a,ds,{art:hoodMap()+(lv>=2?legend():''),ex});
const MAP_READ=lessonAct({id:'map-read',name:'קוֹרְאִים מַפָּה',icon:()=>em('🧭'),bg:'sea',skill:'גאוגרפיה: קריאת מפה, מקרא וכיוונים',
 cards:[{lv:1,art:hoodMap(),t:'מַפָּה הִיא צִיּוּר שֶׁל מָקוֹם, כְּמוֹ שֶׁרוֹאִים אוֹתוֹ מִלְמַעְלָה – כְּמוֹ צִפּוֹר.'},{lv:1,art:hoodMap(),t:'הַבַּיִת בָּאֶמְצַע. מִיָּמִין לַבַּיִת – הַגַּן. מִשְּׂמֹאל לַבַּיִת – הַבְּרֵכָה.'},
  {lv:2,art:hoodMap()+legend(),t:'הַמִּקְרָא מַסְבִּיר מָה אוֹמֵר כָּל סֵמֶל בַּמַּפָּה.'},{lv:3,art:hoodMap(),t:'בְּרֹב הַמַּפּוֹת: צָפוֹן לְמַעְלָה, דָּרוֹם לְמַטָּה, מִזְרָח יָמִינָה וּמַעֲרָב שְׂמֹאלָה.'}],
 bank:[hq('מָה נִמְצָא מִיָּמִין לַבַּיִת?','הַגַּן',['הַבְּרֵכָה','בֵּית הַסֵּפֶר'],1),hq('מָה נִמְצָא מִשְּׂמֹאל לַבַּיִת?','הַבְּרֵכָה',['הַגַּן','מִגְרַשׁ הַכַּדּוּרֶגֶל'],1),
  hq('מָה נִמְצָא לְמַעְלָה, מֵעַל הַבַּיִת?','בֵּית הַסֵּפֶר',['מִגְרַשׁ הַכַּדּוּרֶגֶל','הַגַּן'],1),hq('מָה נִמְצָא לְמַטָּה, מִתַּחַת לַבַּיִת?','מִגְרַשׁ הַכַּדּוּרֶגֶל',['בֵּית הַסֵּפֶר','הַבְּרֵכָה'],1),
  Q(2,'מָה אוֹמֵר הַסֵּמֶל 🏊 בַּמַּפָּה?','בְּרֵכָה',['גַּן','בֵּית סֵפֶר'],{art:hoodMap()+legend()}),Q(2,'מָה אוֹמֵר הַסֵּמֶל 🌳 בַּמַּפָּה?','גַּן',['בְּרֵכָה','בַּיִת'],{art:hoodMap()+legend()}),
  Q(2,'אֵיזֶה סֵמֶל מְסַמֵּן בֵּית סֵפֶר?','🏫',['🏠','⚽'],{art:hoodMap()+legend(),cls:'sym'}),
  hq('מָה נִמְצָא בַּצָּפוֹן שֶׁל הַמַּפָּה?','בֵּית הַסֵּפֶר',['מִגְרַשׁ הַכַּדּוּרֶגֶל','הַבְּרֵכָה'],3,'צָפוֹן – לְמַעְלָה.'),hq('מָה נִמְצָא בַּמִּזְרָח שֶׁל הַמַּפָּה?','הַגַּן',['הַבְּרֵכָה','בֵּית הַסֵּפֶר'],3,'מִזְרָח – יָמִינָה.'),
  hq('מָה נִמְצָא בַּמַּעֲרָב שֶׁל הַמַּפָּה?','הַבְּרֵכָה',['הַגַּן','מִגְרַשׁ הַכַּדּוּרֶגֶל'],3,'מַעֲרָב – שְׂמֹאלָה.'),hq('מָה נִמְצָא בַּדָּרוֹם שֶׁל הַמַּפָּה?','מִגְרַשׁ הַכַּדּוּרֶגֶל',['בֵּית הַסֵּפֶר','הַגַּן'],3,'דָּרוֹם – לְמַטָּה.')]});
const ALLIL=[...Object.keys(CITIES),...Object.keys(SEAS)];
const MAP_IL={id:'map-il',name:'מַפַּת יִשְׂרָאֵל',icon:()=>SV('0 0 204 420',`<rect width="204" height="420" fill="#cfe0a0"/><polygon points="0,0 ${pts(MED)} 0,232" fill="#7cc3ea"/><polygon points="${pts(DEAD)}" fill="#5fb0d8"/><polygon points="${pts(KIN)}" fill="#4aa3e0"/>`,'e2ico'),skill:'גאוגרפיה: מפת ישראל – ערים, ימים ואזורים',
 run:function run(back){const L=lvl('map-il');const o={id:'map-il',title:'מַפַּת יִשְׂרָאֵל',bg:'sea',back,again:()=>run(back)};
  const cq=k=>({q:`לְחַץ עַל ${CITIES[k][0]} בַּמַּפָּה`,k,map:ilMap({hit:'city'}),reveal:ilMap({hit:'city',labels:[k]})});
  const sq=k=>({q:`לְחַץ עַל ${SEAS[k][0]} בַּמַּפָּה`,k,map:ilMap({hit:'sea'}),reveal:ilMap({hit:'sea',labels:[k]})});
  const rq=k=>({q:`לְחַץ עַל ${REGIONS[k][0]} בַּמַּפָּה`,k,map:ilMap({hit:'region'}),reveal:ilMap({hit:'region',labels:[k]}),ex:k==='negev'?'הַנֶּגֶב הוּא מִדְבָּר גָּדוֹל בַּדָּרוֹם.':'הַגָּלִיל נִמְצָא בַּצָּפוֹן, וְיֵשׁ בּוֹ הָרִים יְרֻקִּים.'});
  const items=L===1?shuffle(['jer','ta','eil']).map(cq).concat(shuffle(['jer','ta','eil']).slice(0,2).map(cq)):L===2?shuffle(['hai','bs']).map(cq).concat(shuffle(['med','kin','dead','red']).map(sq)):shuffle([...shuffle(['jer','ta','hai','bs','eil']).slice(0,2).map(cq),...shuffle(['med','kin','dead','red']).slice(0,2).map(sq),rq('negev'),rq('galil')]);
  /* level 1 repeats two cities on purpose (practice); keep the order easy→hard */
  const lab1=['jer','ta','hai','bs','eil'],lab2=['med','kin','dead','red'];
  const cards=L===1?[{art:ilMap({labels:lab1}),t:'זוֹ מַפָּה שֶׁל יִשְׂרָאֵל. לְמַעְלָה – הַצָּפוֹן, לְמַטָּה – הַדָּרוֹם.'},{art:ilMap({labels:['jer','ta']}),t:'יְרוּשָׁלַיִם הִיא הָעִיר הֲכִי גְּדוֹלָה בְּיִשְׂרָאֵל, וְהִיא נִמְצֵאת בֵּין הָרִים. תֵּל אָבִיב נִמְצֵאת עַל חוֹף הַיָּם.'},{art:ilMap({labels:['hai','bs','eil']}),t:'חֵיפָה נִמְצֵאת בַּצָּפוֹן, לְיַד הַיָּם. בְּאֵר שֶׁבַע – בַּנֶּגֶב. אֵילַת – בַּקָּצֶה הַדְּרוֹמִי.'}]
   :L===2?[{art:ilMap({labels:['med','kin']}),t:'בַּמַּעֲרָב – הַיָּם הַתִּיכוֹן. בַּצָּפוֹן – הַכִּנֶּרֶת: אֲגַם גָּדוֹל שֶׁל מַיִם מְתוּקִים.'},{art:ilMap({labels:['dead']}),t:'יָם הַמֶּלַח הוּא הַמָּקוֹם הֲכִי נָמוּךְ בַּיַּבָּשָׁה בָּעוֹלָם. הַמַּיִם שֶׁלּוֹ מְלוּחִים מְאוֹד.'},{art:ilMap({labels:['red','eil']}),t:'לְיַד אֵילַת – יָם סוּף, שֶׁנִּקְרָא גַּם הַיָּם הָאָדֹם. יֵשׁ בּוֹ אַלְמֻגִּים צִבְעוֹנִיִּים.'}]
   :[{art:ilMap({labels:['galil','negev'],hit:'region'}),t:'בַּצָּפוֹן – הַגָּלִיל, עִם הָרִים יְרֻקִּים. בַּדָּרוֹם – הַנֶּגֶב, מִדְבָּר גָּדוֹל.'}];
  lesson({...o,cards,then:()=>mapQuiz({...o,items})});}};
const MAP_WORLD={id:'map-world',name:'יַבָּשׁוֹת וְאוֹקְיָנוֹסִים',icon:()=>em('🌍'),skill:'גאוגרפיה: יבשות ואוקיינוסים',
 run:function run(back){const L=lvl('map-world');const o={id:'map-world',title:'יַבָּשׁוֹת וְאוֹקְיָנוֹסִים',bg:'sea',back,again:()=>run(back)};
  const tq=k=>({q:`לְחַץ עַל ${CONT[k][0]}`,k,map:worldMap({hit:1}),reveal:worldMap({hit:1,labels:[k]})});
  const oq=k=>{const opts=shuffle(Object.keys(OCEANS));return {q:'אֵיזֶה אוֹקְיָנוֹס מְסֻמָּן בְּסִימַן שְׁאֵלָה?',k,map:`<div class="e2ocean">${worldMap({mark:k})}<div class="chs">${opts.map(x=>`<button class="chb tx e2o e2hit" data-k="${x}">${OCEANS[x][0]}</button>`).join('')}</div></div>`};};
  const items=L===1?['asia','africa','europe'].map(tq).concat([{...tq('asia'),q:'יִשְׂרָאֵל מְסֻמֶּנֶת בִּנְקֻדָּה אֲדֻמָּה. לְחַץ עַל הַיַּבֶּשֶׁת שֶׁלָּהּ.',map:worldMap({hit:1,il:1}),reveal:worldMap({hit:1,il:1,labels:['asia']}),ex:'יִשְׂרָאֵל נִמְצֵאת בְּאַסְיָה.'}])
   :L===2?shuffle(['namerica','samerica','australia','antarctica','europe','africa']).map(tq):shuffle(['pacific','atlantic','indian']).map(oq).concat(shuffle(Object.keys(CONT)).slice(0,3).map(tq));
  const cards=L===1?[{art:worldMap({labels:Object.keys(CONT)}),t:'בָּעוֹלָם יֵשׁ שֶׁבַע יַבָּשׁוֹת – חֲלָקִים גְּדוֹלִים שֶׁל אֲדָמָה.'},{art:worldMap({il:1,labels:['asia','africa','europe']}),t:'יִשְׂרָאֵל נִמְצֵאת בְּאַסְיָה, קָרוֹב לְאַפְרִיקָה וּלְאֵירוֹפָּה.'},{art:worldMap({labels:Object.keys(OCEANS)}),t:'רֹב כַּדּוּר הָאָרֶץ מְכֻסֶּה בְּמַיִם: אוֹקְיָנוֹסִים גְּדוֹלִים.'}]
   :L===2?[{art:worldMap({labels:['asia','antarctica']}),t:'אַסְיָה הִיא הַיַּבֶּשֶׁת הֲכִי גְּדוֹלָה. אַנְטַארְקְטִיקָה הִיא הֲכִי קָרָה – כִּמְעַט כֻּלָּהּ קֶרַח.'},{art:worldMap({labels:['australia']}),t:'אוֹסְטְרַלְיָה הִיא יַבֶּשֶׁת וְגַם מְדִינָה. שָׁם חַי הַקַּנְגּוּרוּ.'}]
   :[{art:worldMap({labels:Object.keys(OCEANS)}),t:'הָאוֹקְיָנוֹס הַשָּׁקֵט הוּא הֲכִי גָּדוֹל. יֵשׁ גַּם הָאוֹקְיָנוֹס הָאַטְלַנְטִי וְהָאוֹקְיָנוֹס הַהֹדִּי.'}];
  lesson({...o,cards,then:()=>mapQuiz({...o,items})});}};
const inCont=k=>({namerica:'בִּצְפוֹן אֲמֶרִיקָה',samerica:'בִּדְרוֹם אֲמֶרִיקָה'})[k]||'בְּ'+CONT[k][0];
const MAP_FLAGS={id:'map-flags',name:'דְּגָלִים עַל הַמַּפָּה',icon:()=>flagSVG('jp'),skill:'גאוגרפיה: מדינות, דגלים ויבשות',
 run:function run(back){const L=lvl('map-flags'),F=FLAGS();const ks=Object.keys(FCONT).filter(k=>F[k]&&(FLV[k]||3)<=L);const cur=ks.filter(k=>(FLV[k]||3)===L);
  const pickd=shuffle(cur).concat(shuffle(ks.filter(k=>!cur.includes(k)))).slice(0,6);const o={id:'map-flags',title:'דְּגָלִים עַל הַמַּפָּה',bg:'sea',back,again:()=>run(back)};
  const items=pickd.map(k=>({top:`<div class="e2fl">${flagSVG(k)}<b>${F[k][0]}</b></div>`,q:`בְּאֵיזוֹ יַבֶּשֶׁת ${k==='us'?'נִמְצְאוֹת':'נִמְצֵאת'} ${F[k][0]}? לְחַץ עָלֶיהָ.`,k:FCONT[k],map:worldMap({hit:1}),reveal:worldMap({hit:1,labels:[FCONT[k]]}),ex:`${F[k][0]} ${k==='us'?'נִמְצְאוֹת':'נִמְצֵאת'} ${inCont(FCONT[k])}.`}));
  lesson({...o,cards:L===1?[{art:`<div class="e2fl">${flagSVG('il')}${flagSVG('jp')}${flagSVG('fr')}</div>`,t:'לְכָל מְדִינָה יֵשׁ דֶּגֶל מִשֶּׁלָּהּ. וְכָל מְדִינָה נִמְצֵאת בְּאַחַת הַיַּבָּשׁוֹת.'}]:[],then:()=>mapQuiz({...o,items})});}};
const HIS_THEN=lessonAct({id:'his-then',name:'פַּעַם וְהַיּוֹם',icon:()=>em('🕯️'),bg:'clock',skill:'היסטוריה: פעם והיום (בית, תחבורה, כתיבה)',
 cards:[{lv:1,art:em('🕯️ ⬅ 💡'),t:'לִפְנֵי הַרְבֵּה שָׁנִים לֹא הָיָה חַשְׁמַל. בַּלַּיְלָה הֵאִירוּ בְּנֵרוֹת וּבִמְנוֹרוֹת שֶׁמֶן.'},{lv:1,art:em('🐴 🐪 ⬅ 🚗 🚆 ✈️'),t:'פַּעַם הָלְכוּ בָּרֶגֶל אוֹ רָכְבוּ עַל חֲמוֹרִים, סוּסִים וּגְמַלִּים. הַיּוֹם נוֹסְעִים בִּמְכוֹנִית, בְּרַכֶּבֶת וּבְמָטוֹס.'},
  {lv:1,art:em('🪶 📜 ⬅ ✏️ 💻'),t:'פַּעַם כָּתְבוּ בְּנוֹצָה וּבִדְיוֹ עַל קְלָף. הַיּוֹם כּוֹתְבִים בְּעִפָּרוֹן וְגַם בַּמַּחְשֵׁב.'},
  {lv:2,art:em('🪣 ⬅ 🚰'),t:'פַּעַם הֵבִיאוּ מַיִם מֵהַבְּאֵר אוֹ מֵהַמַּעְיָן. הַיּוֹם יֵשׁ בֶּרֶז בַּבַּיִת.'},{lv:2,art:em('✉️ ⬅ 📱'),t:'פַּעַם שָׁלְחוּ מִכְתָּב, וְהוּא הִגִּיעַ אַחֲרֵי יָמִים רַבִּים. הַיּוֹם מְדַבְּרִים בַּטֶּלֶפוֹן מִיָּד.'},
  {lv:3,art:em('🧂 ⬅ 🧊'),t:'פַּעַם שָׁמְרוּ אֹכֶל בְּמֶלַח אוֹ בְּמָקוֹם קָרִיר. הַיּוֹם יֵשׁ מְקָרֵר.'},{lv:3,art:em('⛺ ⬅ 🏠'),t:'לִפְנֵי הַרְבֵּה מְאוֹד שָׁנִים אֲנָשִׁים גָּרוּ בְּאֹהָלִים וּבִמְעָרוֹת. הַיּוֹם רֹב הָאֲנָשִׁים גָּרִים בְּבָתִּים.'}],
 bank:[Q(1,'בַּמֶּה הֵאִירוּ בַּלַּיְלָה לִפְנֵי שֶׁהָיָה חַשְׁמַל?','בְּנֵרוֹת',['בְּנוּרוֹת','בַּטֶּלֶפוֹן'],{art:em('🌙')}),Q(1,'אֵיךְ נָסְעוּ פַּעַם מֵעִיר לְעִיר?','עַל חֲמוֹר אוֹ סוּס',['בְּמָטוֹס','בְּרַכֶּבֶת חַשְׁמַלִּית']),
  Q(1,'בַּמֶּה כָּתְבוּ פַּעַם?','בְּנוֹצָה וּבִדְיוֹ',['בַּמַּחְשֵׁב','בַּטֶּלֶפוֹן']),Q(1,'מָה מֵאֵלֶּה הוּא מֵהַיּוֹם?','💻',['🪶','🕯️'],{cls:'sym',ex:'הַמַּחְשֵׁב הוּא מֵהַיּוֹם. הַנּוֹצָה וְהַנֵּר הֵם מִפַּעַם.'}),
  Q(2,'מֵאַיִן לָקְחוּ מַיִם פַּעַם?','מֵהַבְּאֵר',['מֵהַבֶּרֶז','מֵהַמְּקָרֵר']),Q(2,'אֵיךְ שָׁלְחוּ פַּעַם הוֹדָעָה לְמִישֶׁהוּ רָחוֹק?','בְּמִכְתָּב',['בְּטֶלֶפוֹן נַיָּד','בַּמַּחְשֵׁב']),
  Q(3,'אֵיךְ שָׁמְרוּ אֹכֶל פַּעַם, בְּלִי מְקָרֵר?','בְּמֶלַח',['בַּמַּקְפִּיא','בַּמִּיקְרוֹגַל']),Q(3,'אֵיפֹה גָּרוּ אֲנָשִׁים לִפְנֵי הַרְבֵּה מְאוֹד שָׁנִים?','בְּאֹהָלִים וּבִמְעָרוֹת',['בְּבִנְיְנֵי קוֹמוֹת','בַּחֲלָלִית'])]});
const INV=[{k:'wheel',lbl:'גַּלְגַּל',art:WHEEL,ago:5000,lv:1,t:'הַגַּלְגַּל הוּמְצָא לִפְנֵי יוֹתֵר מֵחֲמֵשֶׁת אֲלָפִים שָׁנָה. בִּזְכוּתוֹ אֶפְשָׁר לְהַסִּיעַ עֲגָלוֹת.'},
 {k:'print',lbl:'דְּפוּס',art:PRESS,ago:585,lv:2,t:'מְכוֹנַת הַדְּפוּס הוּמְצְאָה לִפְנֵי כְּשֵׁשׁ מֵאוֹת שָׁנָה. מֵאָז אֶפְשָׁר לְהַדְפִּיס הַרְבֵּה סְפָרִים.'},
 {k:'bulb',lbl:'נוּרָה',art:em('💡','sm'),ago:147,lv:1,t:'הַנּוּרָה הַחַשְׁמַלִּית הוּמְצְאָה לִפְנֵי כְּמֵאָה וַחֲמִשִּׁים שָׁנָה.'},
 {k:'car',lbl:'מְכוֹנִית',art:em('🚗','sm'),ago:140,lv:3,t:'הַמְּכוֹנִית הָרִאשׁוֹנָה נָסְעָה לִפְנֵי כְּמֵאָה וְאַרְבָּעִים שָׁנָה.'},
 {k:'plane',lbl:'מָטוֹס',art:em('✈️','sm'),ago:123,lv:2,t:'הַמָּטוֹס הָרִאשׁוֹן טָס לִפְנֵי כְּמֵאָה וְעֶשְׂרִים שָׁנָה.'},
 {k:'pc',lbl:'מַחְשֵׁב',art:em('💻','sm'),ago:80,lv:1,t:'הַמַּחְשְׁבִים הָרִאשׁוֹנִים נִבְנוּ לִפְנֵי כִּשְׁמוֹנִים שָׁנָה. הֵם הָיוּ גְּדוֹלִים כְּמוֹ חֶדֶר!'}];
const HIS_INV={id:'his-inv',name:'מַמְצָאִים לְפִי הַסֵּדֶר',icon:()=>WHEEL,skill:'היסטוריה: ציר זמן של המצאות',run:function run(back){const L=lvl('his-inv');const set=INV.filter(x=>x.lv<=L);
  const rounds=[{q:'מָה הוּמְצָא קֹדֶם? לְחַץ לְפִי הַסֵּדֶר – מֵהֲכִי יָשָׁן עַד הֲכִי חָדָשׁ.',items:set.map(x=>({html:`<span class="e2pi">${x.art}</span>`,lbl:x.lbl})),ends:['יָשָׁן','חָדָשׁ'],ex:'כָּל הַכָּבוֹד! זֶה צִיר הַזְּמַן שֶׁל הַמַּמְצָאִים.'}];
  lesson({title:'מַמְצָאִים',bg:'clock',back,cards:set.filter(x=>x.lv===L).map(x=>({art:`<span class="e2pi big">${x.art}</span>`,t:x.t})),then:()=>orderGame({id:'his-inv',title:'מַמְצָאִים לְפִי הַסֵּדֶר',bg:'clock',back,again:()=>run(back),rounds})});}};
const JUG=SV('0 0 120 120',`<path d="M44 20 H76 V30 Q98 44 96 74 Q94 104 60 108 Q26 104 24 74 Q22 44 44 30Z" fill="#c8794a" stroke="#8a4f2c" stroke-width="3"/><path d="M30 64 Q60 72 90 64" stroke="#8a4f2c" stroke-width="3" fill="none"/><path d="M96 50 Q112 56 98 76" stroke="#8a4f2c" stroke-width="5" fill="none"/>`);
const SCROLL=SV('0 0 140 100',`<rect x="22" y="18" width="96" height="64" fill="#f1e0b8"/><rect x="10" y="12" width="16" height="76" rx="8" fill="#c8925a"/><rect x="114" y="12" width="16" height="76" rx="8" fill="#c8925a"/>${[30,42,54,66].map(y=>`<path d="M34 ${y} H106" stroke="#6b4423" stroke-width="2" stroke-dasharray="7 3"/>`).join('')}`);
const FORT=SV('0 0 200 120',`<rect width="200" height="120" rx="14" fill="#9cd3ff"/><path d="M0 120 L30 50 L170 50 L200 120Z" fill="#c9a26b"/><path d="M30 50 L170 50 L160 62 L40 62Z" fill="#a37d4b"/>${[50,80,110,140].map(x=>`<rect x="${x}" y="38" width="14" height="14" fill="#e6c899"/>`).join('')}<rect x="0" y="104" width="200" height="16" fill="#5fb0d8"/>`);
const HIS_OLD=lessonAct({id:'his-old',name:'בִּימֵי קֶדֶם',icon:()=>JUG,bg:'clock',skill:'היסטוריה: ימי קדם בארץ',
 cards:[{lv:1,art:em('⛏️ 🏺'),t:'בָּאָרֶץ שֶׁלָּנוּ יֵשׁ מְקוֹמוֹת עַתִּיקִים מְאוֹד. אַרְכֵאוֹלוֹגִים חוֹפְרִים שָׁם וּמוֹצְאִים כֵּלִים מִפַּעַם.'},{lv:1,art:em('🏛️'),t:'יְרוּשָׁלַיִם הִיא עִיר עַתִּיקָה מְאוֹד. אֲנָשִׁים גָּרִים בָּהּ כְּבָר אַלְפֵי שָׁנִים.'},{lv:1,art:JUG,t:'פַּעַם עָשׂוּ כַּדִּים וּקְעָרוֹת מֵחֶרֶס.'},
  {lv:2,art:SCROLL,t:'בִּמְעָרוֹת לְיַד יָם הַמֶּלַח מָצְאוּ מְגִלּוֹת עַתִּיקוֹת מְאוֹד. רֻבָּן כְּתוּבוֹת בְּעִבְרִית.'},{lv:2,art:FORT,t:'מְצָדָה הִיא מִבְצָר עַתִּיק עַל רֹאשׁ הַר, לְיַד יָם הַמֶּלַח.'},
  {lv:3,art:em('🌾 🫒 🍇'),t:'פַּעַם רֹב הָאֲנָשִׁים בָּאָרֶץ הָיוּ חַקְלָאִים: הֵם גִּדְּלוּ חִטָּה, זֵיתִים וַעֲנָבִים.'},{lv:3,art:em('📖'),t:'הָעִבְרִית הִיא שָׂפָה עַתִּיקָה. אֱלִיעֶזֶר בֶּן יְהוּדָה עָזַר שֶׁשּׁוּב יְדַבְּרוּ בָּהּ כָּל יוֹם.'}],
 bank:[Q(1,'מָה עוֹשֶׂה אַרְכֵאוֹלוֹג?','חוֹפֵר וּמוֹצֵא דְּבָרִים עַתִּיקִים',['בּוֹנֶה מְטוֹסִים','מְטַפֵּל בְּחַיּוֹת']),Q(1,'יְרוּשָׁלַיִם הִיא עִיר...','עַתִּיקָה מְאוֹד',['חֲדָשָׁה לְגַמְרֵי','בְּתוֹךְ הַיָּם']),
  Q(1,'מִמָּה עָשׂוּ כַּדִּים פַּעַם?','מֵחֶרֶס',['מִפְּלַסְטִיק','מִנְּיָר'],{art:JUG}),Q(2,'מָה מָצְאוּ בַּמְּעָרוֹת לְיַד יָם הַמֶּלַח?','מְגִלּוֹת עַתִּיקוֹת',['מְכוֹנִיּוֹת','מַחְשְׁבִים']),
  Q(2,'מָה זֹאת מְצָדָה?','מִבְצָר עַתִּיק עַל הַר',['אֲגַם','עִיר חֲדָשָׁה'],{art:FORT}),Q(3,'בְּאֵיזוֹ שָׂפָה כְּתוּבוֹת רֹב הַמְּגִלּוֹת הָעַתִּיקוֹת?','עִבְרִית',['אַנְגְּלִית','יַפָּנִית']),
  Q(3,'מָה גִּדְּלוּ הַחַקְלָאִים בָּאָרֶץ פַּעַם?','חִטָּה, זֵיתִים וַעֲנָבִים',['קָפֶה וְקָקָאוֹ','תֵּה וְאֹרֶז']),Q(3,'הָעִבְרִית הִיא שָׂפָה...','עַתִּיקָה, וּמְדַבְּרִים בָּהּ גַּם הַיּוֹם',['חֲדָשָׁה מֵהַשָּׁנָה','שֶׁאַף אֶחָד לֹא מְדַבֵּר'])]});

/* ================= 🕎 HOLIDAYS & GENERAL KNOWLEDGE ================= */
const HOL=[{k:'rh',n:'רֹאשׁ הַשָּׁנָה',lv:1,art:`<span class="e2pair">${em('🍎🍯','sm')}${SHOFAR}</span>`,t:'רֹאשׁ הַשָּׁנָה הוּא הַהַתְחָלָה שֶׁל הַשָּׁנָה הָעִבְרִית. אוֹכְלִים תַּפּוּחַ בִּדְבַשׁ וְתוֹקְעִים בַּשּׁוֹפָר.',q:'בְּאֵיזֶה חַג אוֹכְלִים תַּפּוּחַ בִּדְבַשׁ וְתוֹקְעִים בַּשּׁוֹפָר?',ic:em('🍎','sm')},
 {k:'yk',n:'יוֹם כִּפּוּר',lv:2,art:em('🚲 🤝'),t:'בְּיוֹם כִּפּוּר מְבַקְּשִׁים סְלִיחָה. הַרְבֵּה מְבֻגָּרִים צָמִים, וְהַכְּבִישִׁים שְׁקֵטִים.',q:'בְּאֵיזֶה יוֹם מְבַקְּשִׁים סְלִיחָה, וְהַכְּבִישִׁים שְׁקֵטִים?',ic:em('🤝','sm')},
 {k:'suk',n:'סֻכּוֹת',lv:1,art:SUKKAH,t:'בְּסֻכּוֹת בּוֹנִים סֻכָּה, מְקַשְּׁטִים אוֹתָהּ וְאוֹכְלִים בָּהּ.',q:'בְּאֵיזֶה חַג בּוֹנִים סֻכָּה?',ic:SUKKAH},
 {k:'han',n:'חֲנֻכָּה',lv:1,art:HANUK,t:'בַּחֲנֻכָּה מַדְלִיקִים נֵרוֹת בַּחֲנֻכִּיָּה שְׁמוֹנָה יָמִים, מְסוֹבְבִים סְבִיבוֹן וְאוֹכְלִים סֻפְגָּנִיּוֹת.',q:'בְּאֵיזֶה חַג מַדְלִיקִים נֵרוֹת בַּחֲנֻכִּיָּה?',ic:HANUK},
 {k:'tu',n:'ט״וּ בִּשְׁבָט',lv:2,art:em('🌳 🌱'),t:'ט״וּ בִּשְׁבָט הוּא רֹאשׁ הַשָּׁנָה לָאִילָנוֹת. נוֹטְעִים עֵצִים וְאוֹכְלִים פֵּרוֹת יְבֵשִׁים.',q:'בְּאֵיזֶה חַג נוֹטְעִים עֵצִים?',ic:em('🌳','sm')},
 {k:'pur',n:'פּוּרִים',lv:1,art:em('🎭'),t:'בְּפוּרִים מִתְחַפְּשִׂים, שׁוֹלְחִים מִשְׁלוֹחַ מָנוֹת וְאוֹכְלִים אָזְנֵי הָמָן.',q:'בְּאֵיזֶה חַג מִתְחַפְּשִׂים?',ic:em('🎭','sm')},
 {k:'pes',n:'פֶּסַח',lv:1,art:MATZAH,t:'בְּפֶסַח עוֹרְכִים לֵיל סֵדֶר, קוֹרְאִים בַּהַגָּדָה וְאוֹכְלִים מַצָּה.',q:'בְּאֵיזֶה חַג אוֹכְלִים מַצָּה?',ic:MATZAH},
 {k:'atz',n:'יוֹם הָעַצְמָאוּת',lv:2,art:ILFLAG,t:'יוֹם הָעַצְמָאוּת הוּא יוֹם הַהֻלֶּדֶת שֶׁל מְדִינַת יִשְׂרָאֵל. תּוֹלִים דְּגָלִים וְרוֹאִים זִקּוּקִים.',q:'בְּאֵיזֶה יוֹם חוֹגְגִים אֶת יוֹם הַהֻלֶּדֶת שֶׁל מְדִינַת יִשְׂרָאֵל?',ic:ILFLAG},
 {k:'lag',n:'לַ״ג בָּעֹמֶר',lv:2,art:em('🔥'),t:'בְּלַ״ג בָּעֹמֶר מַדְלִיקִים מְדוּרוֹת – תָּמִיד יַחַד עִם מְבֻגָּרִים.',q:'בְּאֵיזֶה חַג מַדְלִיקִים מְדוּרוֹת?',ic:em('🔥','sm')},
 {k:'shav',n:'שָׁבוּעוֹת',lv:2,art:em('🧀 🌾'),t:'בְּשָׁבוּעוֹת אוֹכְלִים מַאַכְלֵי חָלָב וְחוֹגְגִים אֶת הַבִּכּוּרִים – הַפֵּרוֹת הָרִאשׁוֹנִים.',q:'בְּאֵיזֶה חַג אוֹכְלִים מַאַכְלֵי חָלָב?',ic:em('🧀','sm')}];
const YR_HOL=lessonAct({id:'yr-hol',name:'הַחַגִּים שֶׁלָּנוּ',icon:()=>HANUK,bg:'meadow',skill:'מורשת: חגי ישראל – מנהגים וסמלים',
 cards:HOL.map(x=>({lv:x.lv,art:x.art,t:x.t})).concat([{lv:3,art:HANUK,t:'חֲנֻכָּה חָלָה בַּחֹרֶף, וּפֶסַח – בָּאָבִיב. לְפֶסַח קוֹרְאִים גַּם "חַג הָאָבִיב".'}]),
 gen:L=>{const pool=HOL.filter(x=>x.lv<=Math.min(L,2));const qs=shuffle(pool.filter(x=>x.lv===Math.min(L,2))).concat(shuffle(pool.filter(x=>x.lv<Math.min(L,2)))).slice(0,L===3?4:5)
   .map(x=>Q(x.lv,x.q,x.n,shuffle(pool.filter(y=>y!==x).map(y=>y.n)).slice(0,2),{art:x.art}));
  if(L===3)qs.push(Q(3,'כַּמָּה יָמִים מַדְלִיקִים נֵרוֹת בַּחֲנֻכָּה?','שְׁמוֹנָה',['שְׁלוֹשָׁה','עֶשְׂרִים'],{art:HANUK}),Q(3,'בְּאֵיזוֹ עוֹנָה חָלָה חֲנֻכָּה?','בַּחֹרֶף',['בַּקַּיִץ','בָּאָבִיב']),Q(3,'אֵיזֶה חַג נִקְרָא גַּם "חַג הָאָבִיב"?','פֶּסַח',['פּוּרִים','חֲנֻכָּה']));
  return qs.sort((a,b)=>a.lv-b.lv);}});
const HOL_ORDER=['rh','yk','suk','han','tu','pur','pes','atz','lag','shav'];
const YR_ORD={id:'yr-order',name:'חַגִּים לְפִי הַסֵּדֶר',icon:()=>em('📅'),skill:'מורשת: סדר החגים בשנה',run:function run(back){const L=lvl('yr-order');
  const ks=L===1?['rh','han','pur','pes']:L===2?['rh','suk','han','pur','pes','shav']:HOL_ORDER;const it=k=>{const x=HOL.find(y=>y.k===k);return {html:`<span class="e2pi">${x.ic}</span>`,lbl:x.n};};
  const rounds=[{q:'סַדֵּר אֶת הַחַגִּים לְפִי הַסֵּדֶר בַּשָּׁנָה. מַתְחִילִים בְּרֹאשׁ הַשָּׁנָה.',items:ks.map(it),ends:['בִּתְחִלַּת הַשָּׁנָה','בְּסוֹף הַשָּׁנָה'],ex:'כָּל הַכָּבוֹד! כָּךְ הַחַגִּים בָּאִים בְּמֶשֶׁךְ הַשָּׁנָה.'}];
  lesson({title:'חַגִּים לְפִי הַסֵּדֶר',bg:'meadow',back,cards:L===1?[{art:`<span class="e2pair">${SHOFAR}${em('🍎🍯','sm')}</span>`,t:'הַשָּׁנָה הָעִבְרִית מַתְחִילָה בְּרֹאשׁ הַשָּׁנָה, בַּסְּתָו. אַחֲרָיו בָּאִים עוֹד חַגִּים, אֶחָד אַחֲרֵי הַשֵּׁנִי.'}]:[],
   then:()=>orderGame({id:'yr-order',title:'חַגִּים לְפִי הַסֵּדֶר',bg:'meadow',back,again:()=>run(back),rounds})});}};
const YR_SPORT=lessonAct({id:'yr-sport',name:'סְפּוֹרְט',icon:()=>em('⚽'),bg:'meadow',skill:'ידע כללי: חוקי ספורט בסיסיים',
 cards:[{lv:1,art:GOAL,t:'בְּכַדּוּרֶגֶל בּוֹעֲטִים בַּכַּדּוּר בָּרַגְלַיִם וּמְנַסִּים לְהַבְקִיעַ גּוֹל לַשַּׁעַר.'},{lv:1,art:GOAL,t:'בִּזְמַן הַמִּשְׂחָק, רַק לַשּׁוֹעֵר מֻתָּר לִתְפֹּס אֶת הַכַּדּוּר בַּיָּדַיִם.'},{lv:1,art:HOOP,t:'בְּכַדּוּרְסַל מְכַדְרְרִים אֶת הַכַּדּוּר וְזוֹרְקִים אוֹתוֹ לַסַּל.'},
  {lv:2,art:GOAL,t:'בִּקְבוּצַת כַּדּוּרֶגֶל יֵשׁ בַּמִּגְרָשׁ אַחַד עָשָׂר שַׂחְקָנִים. בְּכַדּוּרְסַל – חֲמִשָּׁה.'},{lv:2,art:POOL,t:'בִּשְׂחִיָּה יֵשׁ כַּמָּה סִגְנוֹנוֹת, כְּמוֹ חֲתִירָה, חָזֶה וְגַב.'},{lv:2,art:POOL,t:'שׂוֹחִים רַק כְּשֶׁיֵּשׁ מַצִּיל אוֹ מְבֻגָּר שֶׁשּׁוֹמֵר עָלֵינוּ.'},
  {lv:3,art:HOOP,t:'בְּכַדּוּרְסַל, זְרִיקָה מֵרָחוֹק – מֵאֲחוֹרֵי הַקַּשְׁת – שָׁוָה שָׁלוֹשׁ נְקֻדּוֹת.'},{lv:3,art:GOAL,t:'מִשְׂחַק כַּדּוּרֶגֶל רָגִיל נִמְשָׁךְ תִּשְׁעִים דַּקּוֹת: שְׁתֵּי מַחֲצִיּוֹת.'}],
 bank:[Q(1,'בַּמֶּה בּוֹעֲטִים בַּכַּדּוּר בְּכַדּוּרֶגֶל?','בָּרֶגֶל',['בַּיָּד','בַּמַּחְבֵּט'],{art:GOAL}),Q(1,'לְאָן זוֹרְקִים אֶת הַכַּדּוּר בְּכַדּוּרְסַל?','לַסַּל',['לַשַּׁעַר','לַבְּרֵכָה'],{art:HOOP}),
  Q(1,'לְמִי מֻתָּר לִתְפֹּס אֶת הַכַּדּוּר בַּיָּדַיִם בְּכַדּוּרֶגֶל?','לַשּׁוֹעֵר',['לְכָל הַשַּׂחְקָנִים','לַקָּהָל']),
  Q(2,'כַּמָּה שַׂחְקָנִים יֵשׁ לִקְבוּצָה בַּמִּגְרָשׁ בְּכַדּוּרֶגֶל?','11',['5','20']),Q(2,'כַּמָּה שַׂחְקָנִים יֵשׁ לִקְבוּצָה בַּמִּגְרָשׁ בְּכַדּוּרְסַל?','5',['11','2']),
  Q(2,'מָה מֵאֵלֶּה הוּא סִגְנוֹן שְׂחִיָּה?','גַּב',['סַל','שַׁעַר'],{art:POOL}),Q(2,'מָתַי מֻתָּר לִשְׂחוֹת?','כְּשֶׁיֵּשׁ מַצִּיל אוֹ מְבֻגָּר',['תָּמִיד לְבַד','רַק בַּלַּיְלָה'],{art:POOL}),
  Q(3,'כַּמָּה נְקֻדּוֹת שָׁוָה זְרִיקָה מֵאֲחוֹרֵי הַקַּשְׁת בְּכַדּוּרְסַל?','3',['1','10'],{art:HOOP}),Q(3,'כַּמָּה דַּקּוֹת נִמְשָׁךְ מִשְׂחַק כַּדּוּרֶגֶל רָגִיל?','90',['10','300'])]});
const YR_GK={id:'yr-gk',name:'יֶדַע כְּלָלִי',icon:()=>em('💡'),skill:'ידע כללי: גוף, צבעים, מקצועות ותחבורה',
 bank:[Q(1,'כַּמָּה אֶצְבָּעוֹת יֵשׁ בִּשְׁתֵּי הַיָּדַיִם יַחַד?','10',['5','8'],{art:em('🖐️🖐️')}),Q(1,'בַּמֶּה אֲנַחְנוּ שׁוֹמְעִים?','בָּאָזְנַיִם',['בָּעֵינַיִם','בָּאַף'],{art:em('👂')}),
  Q(1,'מִי מְכַבֶּה שְׂרֵפוֹת?','כַּבַּאי',['טַבָּח','טַיָּס'],{art:em('🚒')}),Q(1,'מִי מְטַפֵּל בַּחוֹלִים?','רוֹפֵא',['נַגָּר','דַּוָּר'],{art:em('🩺')}),
  Q(1,'מָה נוֹסֵעַ עַל פַּסִּים?','רַכֶּבֶת',['סְפִינָה','מָטוֹס'],{art:em('🛤️')}),Q(1,'מָה הַצֶּבַע שֶׁל הַשָּׁמַיִם בְּיוֹם בָּהִיר?','כָּחֹל',['יָרֹק','סָגֹל']),
  Q(2,'כָּחֹל וְצָהֹב מְעֹרְבָּבִים יַחַד נוֹתְנִים...','יָרֹק',['אָדֹם','שָׁחֹר'],{art:em('🔵 + 🟡')}),Q(2,'מָה הַלֵּב עוֹשֶׂה?','מַזְרִים דָּם בַּגּוּף',['מְעַכֵּל אֹכֶל','שׁוֹמֵעַ קוֹלוֹת'],{art:em('❤️')}),
  Q(2,'בַּמֶּה אֲנַחְנוּ נוֹשְׁמִים?','בָּרֵאוֹת',['בַּבֶּטֶן','בָּרַגְלַיִם']),Q(2,'מָה עוֹשֶׂה נַגָּר?','בּוֹנֶה דְּבָרִים מֵעֵץ',['אוֹפֶה לֶחֶם','מְתַקֵּן שִׁנַּיִם'],{art:em('🪚')}),
  Q(2,'מָה טָס בַּשָּׁמַיִם?','מָטוֹס',['אוֹטוֹבּוּס','רַכֶּבֶת']),
  Q(3,'כַּמָּה פְּעָמִים בַּיּוֹם כְּדַאי לְצַחְצֵחַ שִׁנַּיִם?','פַּעֲמַיִם',['אַף פַּעַם','פַּעַם בְּשָׁבוּעַ'],{art:em('🪥')}),Q(3,'מִי עוֹזֵר לְחַיּוֹת חוֹלוֹת?','וֵטֶרִינָר',['טַיָּס','סַפָּר'],{art:em('🐶')}),
  Q(3,'אָדֹם וְצָהֹב מְעֹרְבָּבִים יַחַד נוֹתְנִים...','כָּתֹם',['כָּחֹל','יָרֹק'],{art:em('🔴 + 🟡')}),Q(3,'מָה חוֹבְשִׁים עַל הָרֹאשׁ כְּשֶׁרוֹכְבִים עַל אוֹפַנַּיִם?','קַסְדָּה',['כּוֹבַע גֶּרֶב','מִשְׁקְפֵי שֶׁמֶשׁ'],{art:em('🚲')})],
 run:back=>{const L=lvl('yr-gk');runQuiz({id:'yr-gk',title:'יֶדַע כְּלָלִי',bg:'meadow',back},pickQs(YR_GK.bank,L,7,'yr-gk'));}};

/* ================= 🧱 BLOCK BUILDING ================= */
const PLANS={1:[['RRR','R.R','RRR'],['.R.','RRR','.R.'],['R..','RR.','RRR'],['RRR','.R.','.R.']],
 2:[['.RR.','RRRR','YYYY','Y..Y'],['.GG.','GGGG','.KK.','.KK.'],['..R.','..RR','KKKK','.KK.'],['BYYB','YBBY','YBBY','BYYB']],
 3:[['R.R.R','RRRRR','.YYY.','.YBY.','.YBY.'],['..R..','.BBB.','.BYB.','.BBB.','R.B.R'],['.RRR.','RRYRR','.RRR.','..G..','.GGG.']]};
const MIRR={1:[['R..R','RRRR','.RR.'],['B..B','.BB.','B..B'],['.GG.','GGGG','G..G']],2:[['RR..RR','RRRRRR','.RRRR.','..RR..'],['B....B','BB..BB','BBYYBB','.BYYB.'],['..BB..','.BYYB.','BBBBBB','R.RR.R']],
 3:[['.BBBB.','BYBBYB','BBBBBB','.BRRB.','.B..B.'],['G.GG.G','GGGGGG','GYGGYG','GGGGGG','GG..GG'],['..YY..','.YRRY.','YYYYYY','.G..G.','GG..GG']]};
/* flat builder: target rows; lock = cells already given (mirror) */
function builder(o){let r=0,err=0,gems=0;O.setScreen('sTal','city',o.back);const s=$('#sTal');
  const play=()=>{const tg=o.rounds[r],R=tg.length,C=tg[0].length,half=C/2;const cur=tg.map(row=>[...row].map((c,x)=>o.mirror&&x>=half?c:'.'));
    const cols=[...new Set(tg.join('').replace(/\./g,''))];let sel=cols[0];T.hudT(o.title,T.progressBar(r,o.rounds.length));O.sayNow=spk(o.q);s.innerHTML='';
    const card=h('div','prq tqc e2bld',`<div class="qq">${o.q}</div>`);const wrap=h('div','e2bwrap');
    if(!o.mirror)wrap.appendChild(h('div','e2bp',`<b>הַתָּכְנִית</b>${gridSVG(tg)}`));
    const grid=h('div','e2bgrid'+(o.mirror?' mirror':''));grid.style.gridTemplateColumns=`repeat(${C},var(--bc))`;
    const draw=()=>{grid.innerHTML='';for(let y=0;y<R;y++)for(let x=0;x<C;x++){const c=cur[y][x];const b=h('button','e2bc'+(c!=='.'?' on':'')+(o.mirror&&x>=half?' lock':''));b.style.direction='ltr';if(c!=='.')b.style.setProperty('--c',BC[c]);b.dataset.x=x;b.dataset.y=y;b.setAttribute('aria-label',c!=='.'?BN[c]:'ריק');grid.appendChild(b);}};
    grid.style.direction='ltr';grid.onclick=e=>{const b=e.target.closest('.e2bc');if(!b||b.classList.contains('lock'))return;const x=+b.dataset.x,y=+b.dataset.y;
      if(cur[y][x]===sel)cur[y][x]='.';else{cur[y][x]=sel;if(tg[y][x]!==sel){err++;sfx.no();}else sfx.pop(2);}draw();check();};
    wrap.appendChild(grid);card.appendChild(wrap);
    const pal=h('div','e2pal');const pb=()=>{pal.innerHTML='';if(cols.length<2)return;cols.forEach(c=>{const b=h('button','e2pc'+(c===sel?' on':''),'');b.style.setProperty('--c',BC[c]);b.setAttribute('aria-label',BN[c]);b.onclick=()=>{sel=c;sfx.pop(1);pb();};pal.appendChild(b);});};pb();
    s.append(card,pal);draw();
    const check=()=>{if(cur.every((row,y)=>row.every((c,x)=>c===tg[y][x]))){grid.onclick=null;const g=3;gems+=g;O.addGems(g,card);sfx.ok(r);O.floatText(card,'+3');grid.classList.add('flash');setStep(null);
      setTimeout(()=>{if(!card.isConnected)return;r++;if(r<o.rounds.length)play();else T.finishAct(o.id,err,o.rounds.reduce((a,t)=>a+t.join('').replace(/\./g,'').length,0)/3,gems,o.back,()=>o.again());},D(1300));}};
    setStep(()=>{for(let y=0;y<R;y++)for(let x=0;x<C;x++)if(cur[y][x]!==tg[y][x]){if(tg[y][x]!=='.'&&sel!==tg[y][x]){sel=tg[y][x];pb();}if(tg[y][x]==='.'){sel=cur[y][x];}grid.querySelector(`[data-x="${x}"][data-y="${y}"]`).click();return;}});};
  play();}
const BLK_PLAN={id:'blk-plan',name:'בּוֹנִים לְפִי תָּכְנִית',icon:()=>cab([['RB','Y']].map(r=>r),{s:20}),skill:'חשיבה מרחבית: בנייה לפי תוכנית',run:function run(back){const L=lvl('blk-plan');
  const go=()=>builder({id:'blk-plan',title:'בּוֹנִים לְפִי תָּכְנִית',back,again:()=>run(back),q:'בְּנֵה בְּדִיּוּק כְּמוֹ בַּתָּכְנִית. בּוֹחֲרִים צֶבַע וְלוֹחֲצִים עַל מִשְׁבְּצוֹת.',rounds:shuffle(PLANS[L]).slice(0,3)});
  if(L===1)lesson({title:'בּוֹנִים לְפִי תָּכְנִית',bg:'city',back,cards:[{art:gridSVG(['RRR','R.R','RRR'],30),t:'תָּכְנִית הִיא צִיּוּר שֶׁמַּרְאֶה מָה לִבְנוֹת. בּוֹנִים לְפִי הַתָּכְנִית, קֻבִּיָּה אַחַר קֻבִּיָּה.'}],then:go});else go();}};
const BLK_MIR={id:'blk-mirror',name:'בְּנִיָּה בְּמַרְאָה',icon:()=>gridSVG(['R..R','RRRR','.RR.'],12),skill:'חשיבה מרחבית: סימטריה',run:function run(back){const L=lvl('blk-mirror');
  const go=()=>builder({id:'blk-mirror',title:'בְּנִיָּה בְּמַרְאָה',back,again:()=>run(back),mirror:1,q:'הַצַּד הַיְּמָנִי כְּבָר בָּנוּי. בְּנֵה אֶת הַצַּד הַשְּׂמָאלִי כְּמוֹ בְּמַרְאָה.',rounds:shuffle(MIRR[L]).slice(0,3)});
  if(L===1)lesson({title:'בְּנִיָּה בְּמַרְאָה',bg:'city',back,cards:[{art:gridSVG(['R..R','RRRR','.RR.'],30),t:'סִימֶטְרִיָּה: שְׁנֵי הַצְּדָדִים זֵהִים, כְּמוֹ בְּמַרְאָה. גַּם לְפַרְפַּר יֵשׁ כְּנָפַיִם סִימֶטְרִיּוֹת.'}],then:go});else go();}};
/* counting blocks: rows × columns */
const wall=(rows,cols,c='K')=>cab([Array.from({length:cols},()=>c.repeat(rows))],{s:26});
const plusEq=(rows,cols)=>`<span class="ltr">${Array(rows).fill(cols).join(' + ')} = ${rows*cols}</span>`;
function countQ(L){const rr=L===1?[1,2]:L===2?[2,3]:[3,5],cc=L===1?[2,3]:L===2?[2,5]:[3,5];const rows=rr[0]+Math.floor(Math.random()*(rr[1]-rr[0]+1)),cols=cc[0]+Math.floor(Math.random()*(cc[1]-cc[0]+1)),n=rows*cols;
  const cand=shuffle([n+cols,n-cols,n+1,n-1,n+rows,n+2].filter(v=>v>0&&v!==n));const ds=[...new Set(cand)].slice(0,2);
  return Q(L,rows>1?`כַּמָּה קֻבִּיּוֹת יֵשׁ בַּקִּיר? (${rows} שׁוּרוֹת, ${cols} קֻבִּיּוֹת בְּכָל שׁוּרָה)`:`כַּמָּה קֻבִּיּוֹת יֵשׁ בַּקִּיר?`,String(n),ds.map(String),{art:wall(rows,cols,pick(['K','R','B','Y'])),cls:'num',ex:rows>1?`${rows} שׁוּרוֹת שֶׁל ${cols}: ${plusEq(rows,cols)}`:`${n} קֻבִּיּוֹת`,key:rows+'x'+cols});}
const BLK_CNT={id:'blk-count',name:'כַּמָּה קֻבִּיּוֹת?',icon:()=>wall(2,3),skill:'חשבון: שורות × עמודות (כפל ראשון)',run:back=>{const L=lvl('blk-count');const o={id:'blk-count',title:'כַּמָּה קֻבִּיּוֹת?',bg:'city',back};
  const seen=new Set(),list=[];for(let t=0;list.length<6&&t<200;t++){const q=countQ(t<2&&L>1?L-1:L);if(seen.has(q.key))continue;seen.add(q.key);list.push(q);}
  lesson({...o,cards:L===1?[{art:wall(2,3,'R'),t:'כְּשֶׁיֵּשׁ שׁוּרוֹת שָׁווֹת, אֶפְשָׁר לִסְפֹּר שׁוּרָה אַחַת וּלְחַבֵּר: 3 וְעוֹד 3 זֶה 6.'}]:L===2?[{art:wall(3,4,'B'),t:'שָׁלוֹשׁ שׁוּרוֹת שֶׁל אַרְבַּע קֻבִּיּוֹת: 4 וְעוֹד 4 וְעוֹד 4 – בְּיַחַד 12.'}]:[],then:()=>runQuiz(o,list.map(q=>()=>mkQ(q)))});}};
/* views: from above / from the front. hm[z][x] = height (z=0 front) */
const hmCols=hm=>hm.map(r=>r.map(v=>'B'.repeat(v)));
const topView=hm=>{const D=hm.length;return Array.from({length:D},(_,i)=>hm[D-1-i].map(v=>v?'B':'.').join(''));};
const frontView=(hm,H=3)=>{const W=hm[0].length,m=Array.from({length:W},(_,x)=>Math.max(...hm.map(r=>r[x])));return Array.from({length:H},(_,i)=>m.map(v=>v>=H-i?'B':'.').join(''));};
function randHM(L){const W=3,Dp=L===1?2:L===2?2:3,mh=L===1?1:L===2?2:3;for(;;){const hm=Array.from({length:Dp},()=>Array.from({length:W},()=>Math.random()<.65?1+Math.floor(Math.random()*mh):0));
  const n=hm.flat().filter(v=>v).length;if(n>=2&&n<W*Dp)return hm;}}
function viewQ(L,kind){const hm=randHM(L);const vf=kind==='top'?topView:(x=>frontView(x));const right=vf(hm).join('/');const opts=new Set([right]);
  const flip=vf(hm).map(r=>[...r].reverse().join('')).join('/');if(flip!==right)opts.add(flip);for(let t=0;opts.size<3&&t<80;t++)opts.add(vf(randHM(L)).join('/'));
  const ds=[...opts].filter(v=>v!==right).slice(0,2);
  return {lv:L,q:kind==='top'?'אֵיךְ הַבִּנְיָן נִרְאֶה מִלְמַעְלָה?':'אֵיךְ הַבִּנְיָן נִרְאֶה מִקָּדִימָה?',a:right,ds,art:cab(hmCols(hm),{s:30}),cls:'picb e2vopt',fmt:v=>gridSVG(v.split('/'),20),key:right+kind,
   ex:kind==='top'?'מִלְמַעְלָה רוֹאִים רַק אֵיפֹה יֵשׁ קֻבִּיּוֹת.':'מִקָּדִימָה רוֹאִים כַּמָּה גָּבוֹהַּ כָּל טוּר.'};}
const BLK_VIEW={id:'blk-view',name:'מִלְמַעְלָה וּמִקָּדִימָה',icon:()=>cab([['BB','B'],['B','']],{s:18}),skill:'חשיבה מרחבית: מבט מלמעלה ומלפנים',run:back=>{const L=lvl('blk-view');const o={id:'blk-view',title:'מִלְמַעְלָה וּמִקָּדִימָה',bg:'city',back};
  const kinds=L===1?['top','top','top','top','top']:L===2?['front','front','front','top','front']:['top','front','top','front','front','top'];
  const seen=new Set(),list=[];kinds.forEach(k=>{let q;for(let t=0;t<50;t++){q=viewQ(L,k);if(q.ds.length===2&&!seen.has(q.key))break;}seen.add(q.key);list.push(q);});
  const ex=[[1,1,0],[1,0,0]];
  lesson({...o,cards:L===1?[{art:`<div class="e2row">${cab(hmCols(ex),{s:30})}<span class="e2arr">⬅</span>${gridSVG(topView(ex),26)}</div>`,t:'כְּשֶׁמִּסְתַּכְּלִים מִלְמַעְלָה, כְּמוֹ צִפּוֹר, רוֹאִים אֵיפֹה עוֹמְדוֹת הַקֻּבִּיּוֹת.'}]
   :L===2?[{art:`<div class="e2row">${cab(hmCols([[2,1,0],[1,1,1]]),{s:30})}<span class="e2arr">⬅</span>${gridSVG(frontView([[2,1,0],[1,1,1]]),26)}</div>`,t:'כְּשֶׁמִּסְתַּכְּלִים מִקָּדִימָה, רוֹאִים כַּמָּה גָּבוֹהַּ כָּל טוּר.'}]:[],then:()=>runQuiz(o,list)});}};
/* free building: tap a tower to make it taller (or the floor to start one) */
const FW=6,FD=5,FH=5;
function freeBuild(back){const E=T.S();E.e2=E.e2||{};let cells=(E.e2.fb||'').split(',');if(cells.length!==FW*FD)cells=Array(FW*FD).fill('');let sel='R',erase=false,placed=0;
  O.setScreen('sTal','city',back);T.hudT('בְּנִיָּה חָפְשִׁית');O.sayNow='בנה מה שאתה רוצה. לוחצים על הרצפה או על מגדל';const s=$('#sTal');s.innerHTML='';
  const board=h('div','e2free');const pal=h('div','e2pal');s.append(h('div','lsent','לוֹחֲצִים עַל הָרִצְפָּה אוֹ עַל מִגְדָּל כְּדֵי לִבְנוֹת.'),board,pal);
  const cols=()=>Array.from({length:FD},(_,z)=>Array.from({length:FW},(_,x)=>cells[z*FW+x]));
  const draw=()=>{board.innerHTML=cab(cols(),{s:40,floor:true,maxH:FH});};
  const pb=()=>{pal.innerHTML='';['R','B','Y','G','K'].forEach(c=>{const b=h('button','e2pc'+(!erase&&c===sel?' on':''),'');b.style.setProperty('--c',BC[c]);b.setAttribute('aria-label',BN[c]);b.onclick=()=>{sel=c;erase=false;sfx.pop(1);pb();};pal.appendChild(b);});
    const er=h('button','e2pc er'+(erase?' on':''),'🧽');er.setAttribute('aria-label','מחק');er.onclick=()=>{erase=true;sfx.pop(1);pb();};pal.appendChild(er);};
  board.onclick=e=>{const t=e.target.closest('.e2cell');if(!t)return;const i=(+t.dataset.z)*FW+(+t.dataset.x);
    if(erase){if(!cells[i])return;cells[i]=cells[i].slice(0,-1);sfx.pop(1);}else{if(cells[i].length>=FH){sfx.no();return;}cells[i]+=sel;sfx.pop(Math.min(5,cells[i].length+1));placed++;}
    E.e2.fb=cells.join(',');O.persist();draw();
    if(placed===8){T.record('blk-free',3);O.addGems(3,board);O.floatText(board,'+3');}};
  setStep(()=>{const i=Math.floor(Math.random()*FW*FD);const t=board.querySelector(`.e2cell[data-x="${i%FW}"][data-z="${Math.floor(i/FW)}"]`);if(t)t.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
  draw();pb();}
const BLK_FREE={id:'blk-free',name:'בְּנִיָּה חָפְשִׁית',icon:()=>cab([['RRB','YB','G']],{s:16}),noDaily:true,skill:'יצירה: בנייה חופשית',run:freeBuild};

/* ================= BUILDINGS ================= */
const BLD=[
 {id:'sky',name:'מִצְפֵּה הַכּוֹכָבִים',color:'#3b4a9a',bg:'final',icon:()=>planetSVG('saturn'),blurb:'הַשֶּׁמֶשׁ, הַיָּרֵחַ, כּוֹכְבֵי הַלֶּכֶת וְאַסְטְרוֹנָאוּטִים.',acts:[SKY_SUN,SKY_PL,SKY_ORD,SKY_AST]},
 {id:'nature',name:'גַּן הַטֶּבַע',color:'#4f8a3a',bg:'forest',icon:()=>em('🦋'),blurb:'בַּעֲלֵי חַיִּים, צְמָחִים וְעוֹנוֹת הַשָּׁנָה.',acts:[NAT_HOME,NAT_GRP,NAT_CYC,NAT_IL]},
 {id:'maps',name:'חֲדַר הַמַּפּוֹת',color:'#2f8fb0',bg:'sea',icon:()=>em('🗺️'),blurb:'מַפּוֹת, אֲרָצוֹת וְסִפּוּרִים מִפַּעַם.',acts:[MAP_READ,MAP_IL,MAP_WORLD,MAP_FLAGS,HIS_THEN,HIS_INV,HIS_OLD]},
 {id:'year',name:'לוּחַ הַשָּׁנָה',color:'#c27c4e',bg:'meadow',icon:()=>HANUK,blurb:'חַגִּים, סְפּוֹרְט וְיֶדַע כְּלָלִי.',acts:[YR_HOL,YR_ORD,YR_SPORT,YR_GK]},
 {id:'blocks',name:'אֲתַר הַבְּנִיָּה',color:'#e08a2b',bg:'city',icon:()=>cab([['RB','Y'],['G','']],{s:18}),blurb:'בּוֹנִים מִקֻּבִּיּוֹת: לְפִי תָּכְנִית, בְּמַרְאָה, סוֹפְרִים וּמְגַלִּים.',acts:[BLK_PLAN,BLK_CNT,BLK_MIR,BLK_VIEW,BLK_FREE]}];
const GROUP_OF={sky:'explore',nature:'explore',maps:'explore',year:'readg',blocks:'create'};
const SKILLS={};BLD.forEach(b=>b.acts.forEach(a=>{SKILLS[a.id]=a.skill;}));
let done=false;
/* register(T.building, T.GROUPS)                 → 5 new buildings (sky, nature, maps, year → their groups; blocks → create)
   register(T.building, T.GROUPS, {merge:true})   → fewer doors: nature's activities join 'lab', maps+year join 'world',
                                                    only sky (explore) and blocks (create) are new buildings */
const MERGE_INTO={nature:'lab',maps:'world',year:'world'};
function register(buildingFn,groups,opt){if(done)return;done=true;const bf=buildingFn||T.building;const made=[];
  BLD.forEach(b=>{const host=opt&&opt.merge&&MERGE_INTO[b.id]&&(T.BUILD||[]).find(x=>x.id===MERGE_INTO[b.id]);
    if(host){b.acts.forEach(a=>{host.acts.push(a);a.b=host;if(T.ACT)T.ACT[a.id]=a;});}else{bf(b);made.push(b.id);}});
  if(groups)made.forEach(bid=>{const g=groups.find(x=>x.id===GROUP_OF[bid]);if(g&&!g.ids.includes(bid))g.ids.push(bid);});return made;}
/* everything a child sees as text, for the nikud check in tests */
function kidTexts(){const out=[];const add=s=>{if(s)out.push(String(s));};
  BLD.forEach(b=>{add(b.name);add(b.blurb);b.acts.forEach(a=>{add(a.name);(a.cards||[]).forEach(c=>add(c.t));(a.bank||[]).forEach(q=>{add(q.q);add(q.a);q.ds.forEach(add);add(q.ex);});});});
  for(let L=1;L<=3;L++){NAT_GRP.gen(L).forEach(q=>{add(q.q);add(q.a);q.ds.forEach(add);add(q.ex);});YR_HOL.gen(L).forEach(q=>{add(q.q);add(q.a);q.ds.forEach(add);});}
  PLANETS.forEach(p=>add(p.n));Object.values(CYC).forEach(c=>{add(c.t);add(c.q);c.items.forEach(i=>add(i[1]));});INV.forEach(x=>{add(x.lbl);add(x.t);});HOL.forEach(x=>{add(x.n);add(x.t);add(x.q);});
  [CITIES,SEAS,REGIONS,CONT,OCEANS,HOOD].forEach(m=>Object.values(m).forEach(v=>add(v[0])));Object.values(MYFL).forEach(v=>add(v[0]));Object.values(BN).forEach(add);return out;}
window.EXPLORE2={register,BUILDINGS:BLD,GROUP_OF,SKILLS,kidTexts,ids:()=>BLD.flatMap(b=>b.acts.map(a=>a.id)),level:lvl,
  DATA:{PLANETS,HOL,HOL_ORDER,INV,CITIES:Object.fromEntries(Object.entries(CITIES).map(([k,v])=>[k,{n:v[0],ll:v[1],xy:cityPos(k)}])),SEAS,REGIONS,CONT:Object.keys(CONT),OCEANS,FCONT,CYC,PLANS,MIRR,HOOD,banks:()=>Object.fromEntries(BLD.flatMap(b=>b.acts).filter(a=>a.bank).map(a=>[a.id,a.bank]))},
  gen:{pickQs,NAT_GRP:L=>NAT_GRP.gen(L),YR_HOL:L=>YR_HOL.gen(L),countQ,viewQ,topView,frontView,mkQ},
  step:()=>{if(STEP)return STEP();const q=window.__quiz;if(q&&q.wrap&&q.wrap.isConnected){const c=q.wrap.querySelector('.chs');if(c&&c.children[q.ans])c.children[q.ans].click();}}};
})();
