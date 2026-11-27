/* Mutes every browser the tests launch: Chromium audio (--mute-audio) AND the browser voice
   (speechSynthesis on Windows plays through the OS, not Chromium, so --mute-audio alone is not enough).
   Loaded by tests/lib.js and by run.sh (NODE_OPTIONS), so any script that uses either is silent. Idempotent. */
try{const pw=require(require.resolve('playwright',{paths:[process.cwd(),__dirname]}));const c=pw.chromium;
if(!c.__muted){c.__muted=1;const orig=c.launch.bind(c);
  const SILENT=()=>{try{const s=window.speechSynthesis;if(s&&!s.__muted){s.__muted=1;const sp=s.speak.bind(s);s.speak=u=>{try{u.volume=0;}catch(e){}return sp(u);};}
    const P=HTMLMediaElement.prototype,pl=P.play;P.play=function(){this.muted=true;this.volume=0;return pl.apply(this,arguments);};}catch(e){}};
  // Fake daytime clock (#89): the game locks at bedtime, so tests that run at night must not see night.
  // The page's Date is shifted so the clock starts at TEST_HOUR:00 (default 10:00, between the 07:30 and 13:00 meal pauses); it still ticks. TEST_REAL_CLOCK=1 turns it off.
  const HOUR=+(process.env.TEST_HOUR||10),REAL=process.env.TEST_REAL_CLOCK==='1';
  const CLOCK=h=>{const D=Date,n=new D();const off=new D(n.getFullYear(),n.getMonth(),n.getDate(),h,0,0)-n;
    const F=function(...a){return a.length?new D(...a):new D(D.now()+off);};F.prototype=D.prototype;F.UTC=D.UTC;F.parse=D.parse;F.now=()=>D.now()+off;window.Date=F;};
  // #79: the random 'explain how you did it' card (HELP.teach, max once a day after help) must not pop up in tests: it covers #ov and blocks clicks/reads. Held off in every suite; help.test.js sets teachP itself when it tests the card. TEST_HELP_TEACH=1 turns this off.
  const NOTEACH=()=>{const t=setInterval(()=>{try{const h=window.HELP;if(h&&h.cfg){h.cfg.teachP=0;clearInterval(t);}}catch(e){}},20);setTimeout(()=>clearInterval(t),20000);};
  const noTeach=async x=>{if(process.env.TEST_HELP_TEACH!=='1')await x.addInitScript(NOTEACH);};
  // #258: lesson cards (lessoncard.js) come before an activity's first questions; suites that open activities expect the questions, so lessons are off
  // in every suite (window.__lessons = false). lessoncard.test.js and know.test.js set window.__lessons = true in their own init script. TEST_LESSONS=1 turns this off.
  const NOLESSON=()=>{window.__lessons=false;};
  const noLesson=async x=>{if(process.env.TEST_LESSONS!=='1')await x.addInitScript(NOLESSON);};
  // #389 'listen first' (friend.js) holds answer buttons until the question was heard and holds a fast tap after a wrong one; suites tap at once,
  // so it is off in every suite (window.__listen = false). listen.test.js sets window.__listen = true in its own init script. TEST_LISTEN=1 turns this off.
  const NOLISTEN=()=>{window.__listen=false;};
  const noListen=async x=>{if(process.env.TEST_LISTEN!=='1')await x.addInitScript(NOLISTEN);};
  const fakeClock=async x=>{if(!REAL)await x.addInitScript(CLOCK,HOUR);};
  c.launch=async(o={})=>{const b=await orig({...o,args:[...(o.args||[]),'--mute-audio']});
    const nc=b.newContext.bind(b),np=b.newPage.bind(b);
    b.newContext=async(...a)=>{const x=await nc(...a);await x.addInitScript(SILENT);await fakeClock(x);await noTeach(x);await noLesson(x);await noListen(x);return x;};
    b.newPage=async(...a)=>{const p=await np(...a);await p.addInitScript(SILENT);await fakeClock(p);await noTeach(p);await noLesson(p);await noListen(p);return p;};return b;};}}catch(e){}
