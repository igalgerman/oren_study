/* ======================= SESSION SCREENSHOTS (#462) =======================
   A small downscaled JPEG (480 px wide, at most ~40 KB) at six key moments of the event log (#348): mission opened, the 2nd wrong answer
   in a row, help used, a popup, an error, and 30 s with no answer. Each is linked to the event that caused it (its event id i, within
   the session sid) and rides in the next /api/log batch (no extra send, no retry). No library: the visible kid screen is cloned into an
   SVG foreignObject and drawn on a canvas.
   Privacy: only the kid game screens; never the parent panel, the parent login/PIN, parent play, or any input/typed text.
   Never slows play: taken when the browser is idle, skipped when the frame is busy (a long task in the last 2 s, no idle time within
   3 s, or a frame over 150 ms just before), on a slow device, offline, or without a family id (nothing would be sent). At most 30 per page session; at most 8 wait unsent
   (oldest dropped). The server keeps at most 30 per session and 100 per day (oldest dropped) for 14 days. */
(()=>{const W=window,O=W.OREN;if(!O||!O.track)return;
const KID=['sHome','sMap','sWorld','sLearn','sPlay','sKing','sStudio','sTable','sFinal','sTal'];
const S={n:0,cap:30,max:8,q:[],w:480,kb:40,jank:150,lastLong:0,lastT:0,wrong:0,idleT:0,skip:{},pend:0};
const vis=el=>!!el&&!el.hidden&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
const curScreen=()=>{const x=[...document.querySelectorAll('#screens > .screen')].find(s=>!s.hidden);return x?x.id:'';};
/* the privacy rule: a kid screen, no parent anything, no typed text on screen */
function allowed(){try{if(O.isParentPlay)return false;const b=document.body;if(!b||b.classList.contains('inpar'))return false;
  if(KID.indexOf(curScreen())<0)return false;const par=document.getElementById('sPar');if(vis(par))return false;
  for(const el of document.querySelectorAll('.plog,input:not([type=hidden]):not([type=range]):not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable]:not([contenteditable=false])'))if(vis(el))return false;
  return true;}catch(e){return false;}}
const slow=()=>(navigator.hardwareConcurrency||4)<=2||(navigator.deviceMemory||4)<1;
const busy=()=>S.jank>0&&S.lastLong>0&&performance.now()-S.lastLong<2000;/* performance clock: the game may speed up Date in tests */
try{new PerformanceObserver(l=>{for(const x of l.getEntries())if(x.duration>100)S.lastLong=Math.max(S.lastLong,x.startTime+x.duration);}).observe({type:'longtask'});}catch(e){}
const no=why=>{S.skip[why]=(S.skip[why]||0)+1;return false;};
/* the screen as an SVG image: the page's styles + a clone of the body without hidden parts, scripts, the parent panel and input values */
function svgOf(){const w=innerWidth,h=innerHeight,b=document.body,cs=getComputedStyle(b);
  const css=[...document.querySelectorAll('style')].map(s=>s.textContent).join('\n').replace(/(^|[\s,{}>+~(])body(?=[\s,{.:#[>+~)])/g,'$1.shot-body').replace(/(^|[\s,{}>+~(])(html|:root)(?=[\s,{.:#[>+~)])/g,'$1.shot-root')+'\n*{animation:none!important;transition:none!important}';/* a picture starts every animation at 0 (often invisible) */
  const c=b.cloneNode(true),oc=b.querySelectorAll('canvas'),cc=c.querySelectorAll('canvas');/* a visible canvas (the scene) becomes a picture */
  oc.forEach((x,k)=>{try{if(!vis(x)||!cc[k]||!x.width)return;const im=document.createElement('img');im.src=x.toDataURL('image/png');im.className=x.className;im.id=x.id;im.style.cssText=x.style.cssText;
    const r=x.getBoundingClientRect();im.style.width=r.width+'px';im.style.height=r.height+'px';im.style.imageRendering='pixelated';cc[k].replaceWith(im);}catch(e){}});
  c.querySelectorAll('script,[hidden],#sPar,.plog,input,textarea,select,audio,video,iframe,canvas').forEach(x=>x.remove());
  const sc=document.getElementById('screens'),csc=c.querySelector('#screens');if(sc&&csc&&sc.scrollTop&&csc.firstElementChild)csc.style.cssText+=';overflow:hidden';
  if(sc&&csc&&sc.scrollTop)[...csc.children].forEach(x=>{x.style.transform='translateY(-'+sc.scrollTop+'px)';});
  const div=document.createElement('div');div.className='shot-root';div.setAttribute('dir',document.documentElement.dir||'rtl');
  const bd=document.createElement('div');bd.className='shot-body '+b.className;bd.style.cssText='width:'+w+'px;height:'+h+'px;overflow:hidden;margin:0;background:'+cs.background+';font-family:'+cs.fontFamily+';color:'+cs.color;
  while(c.firstChild)bd.appendChild(c.firstChild);const st=document.createElement('style');st.textContent=css;div.appendChild(st);div.appendChild(bd);
  const x=new XMLSerializer().serializeToString(div);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'"><foreignObject x="0" y="0" width="'+w+'" height="'+h+'">'+x+'</foreignObject></svg>';}
function grab(){return new Promise((ok,bad)=>{const w=innerWidth,h=innerHeight,img=new Image();
  img.onload=()=>{try{const cw=Math.min(S.w,w),ch=Math.round(h*cw/w),cv=document.createElement('canvas');cv.width=cw;cv.height=ch;const g=cv.getContext('2d');
    g.fillStyle='#fff';g.fillRect(0,0,cw,ch);g.drawImage(img,0,0,cw,ch);let d='';
    for(const qq of [.6,.45,.3]){d=cv.toDataURL('image/jpeg',qq);if(d.length*.75<=S.kb*1024)break;}
    if(d.length*.75>S.kb*1024*1.15)return bad('big');ok(d);}catch(e){bad('draw');}};
  img.onerror=()=>bad('img');img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgOf());});}
/* the frame is calm: 12 animation frames (~0.2 s), none longer than S.jank = 150 ms (a busy page = skip; 0 = no check, tests only) */
const calm=()=>new Promise(ok=>{if(!S.jank)return ok(true);let n=0,t=performance.now(),worst=0;const to=setTimeout(()=>ok(false),2000);
  const f=()=>{const x=performance.now();worst=Math.max(worst,x-t);t=x;if(++n<12)requestAnimationFrame(f);else{clearTimeout(to);ok(worst<S.jank);}};requestAnimationFrame(f);});
const idle=f=>W.requestIdleCallback?W.requestIdleCallback(f,{timeout:3000}):setTimeout(()=>f({didTimeout:false,timeRemaining:()=>10}),200);
/* one shot for event e (after `wait` ms, so a just-opened screen has drawn) */
function shoot(e,wait,again){if(S.n+S.pend>=S.cap)return no('cap');if(document.visibilityState==='hidden')return no('hidden');if(navigator.onLine===false)return no('off');if(slow())return no('slow');
  if(!O.family)return no('nofam');if(!allowed())return no('priv');if(busy())return no('busy');
  S.pend++;setTimeout(()=>idle(dl=>{const end=r=>{S.pend--;return r;};/* busy: one more try 2.5 s later, then skipped */
    const late=()=>{S.pend--;if(again)return no('busy');no('later');shoot(e,2500,1);return false;};
    if(dl&&dl.didTimeout)return late();if(busy())return late();
    calm().then(c=>{if(!c){S.lastLong=performance.now();return late();}if(document.visibilityState==='hidden')return end(no('hidden'));if(!allowed())return end(no('priv'));
    grab().then(d=>{end();S.n++;S.q.push({i:e.i,d});if(S.q.length>S.max)S.q.splice(0,S.q.length-S.max);S.lastT=Date.now();},why=>{end();no(String(why));});});}),wait||0);return true;}
/* the six moments, from the event stream */
function onEvent(e){const k=e.k;
  if(k==='mis'){S.wrong=0;shoot(e,1500);}
  else if(k==='q'){clearTimeout(S.idleT);const q=e.q;S.idleT=setTimeout(()=>{if(document.visibilityState==='visible'&&O.evSnap().q===q)O.track('idle',{ms:30000,q});},W.__idleMs||30000);}
  else if(k==='ans'){clearTimeout(S.idleT);if(e.ok)S.wrong=0;else if(++S.wrong>=2){S.wrong=0;shoot(e,300);}}
  else if(k==='help'||k==='pop'||k==='err'||k==='idle')shoot(e,k==='err'?0:400);}
W.SHOTS={on:e=>{try{onEvent(e);}catch(x){}},
  /* the batch takes the waiting shots (up to `room` characters); a failed send gives them back */
  take:room=>{const out=[];let n=0;while(S.q.length&&n+S.q[0].d.length<=(room||1e9)){const s=S.q.shift();n+=s.d.length;out.push(s);}return out;},
  back:sh=>{S.q=sh.concat(S.q).slice(-S.max);},
  allowed,shoot,stat:()=>({n:S.n,q:S.q.length,pend:S.pend,skip:Object.assign({},S.skip),busy:busy()}),
  _set:o=>Object.assign(S,o)};
})();
