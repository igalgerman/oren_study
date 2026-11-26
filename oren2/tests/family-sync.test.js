// Website mode: every device shares one fixed family save (no codes or links) through a fake /api/save server; an old per-device family id is merged in once.
const L = require('./lib');
const http=require('http'),fs=require('fs'),path=require('path');const {chromium}=require('playwright');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PUB=path.join(L.ROOT,'cf','public');const KV=new Map();let puts=0,FAILN=0,FAILST=500,FAILB='{}';const DIAGS=[];
const srv=http.createServer(async(q,r)=>{const m=/^\/api\/save\/([a-f0-9]{32})$/.exec(q.url);
  if(m){if(q.method==='GET'){const v=KV.get(m[1]);r.writeHead(v?200:404,{'content-type':'application/json'});return r.end(v||'{}');}
    if(q.method==='PUT'){let b='';q.on('data',c=>b+=c);q.on('end',()=>{puts++;if(FAILN>0){FAILN--;r.writeHead(FAILST,{'content-type':'application/json'});return r.end(FAILB);}KV.set(m[1],b);r.end('{"ok":true}');});return;}}
  if(q.url==='/api/diag'&&q.method==='POST'){let b='';q.on('data',c=>b+=c);q.on('end',()=>{DIAGS.push(JSON.parse(b));r.end('{"ok":true}');});return;}
  const f=path.join(PUB,q.url==='/'?'index.html':q.url.split('?')[0].split('#')[0]);if(fs.existsSync(f)){r.end(fs.readFileSync(f));}else{r.writeHead(404);r.end();}}).listen(0);const BASE=()=>'http://localhost:'+srv.address().port;
const res=[];const ok=(n,c,i='')=>res.push((c?'PASS ':'FAIL ')+n+(i?' — '+i:''));
const FIX='a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0',OLD='0123456789abcdef0123456789abcdef';
(async()=>{const b=await chromium.launch();const init=()=>{window.__fast=true;window.__famGap=0;};
 const A=await (await b.newContext({viewport:{width:1366,height:768}})).newPage();await A.addInitScript(init);const errs=[];A.on('pageerror',e=>errs.push('A '+e.message));
 await A.goto(BASE()+'/');await A.waitForFunction(()=>window.OREN&&window.OREN.family,null,{timeout:20000});await sleep(500);
 const fid=await A.evaluate(()=>window.OREN.family);ok('device A uses the one fixed family save',fid===FIX,fid);ok('saved to server',KV.has(fid));
 await A.evaluate(()=>{const O=window.OREN,T=window.TAL;O.save.story.intro=1;O.save.gems=33;O.save.s['add-0-0']=3;T.S().prof={an:'owl',col:'#4fae4f',love:'music'};O.persist();});await sleep(2500);
 // device B (parent's phone, empty storage) just opens the site
 const B=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();await B.addInitScript(init);B.on('pageerror',e=>errs.push('B '+e.message));
 await B.goto(BASE()+'/');await B.waitForFunction(()=>window.OREN&&window.OREN.family&&window.OREN.save.gems===33,null,{timeout:20000}).catch(()=>{});await sleep(300);
 const rb=await B.evaluate(()=>({f:window.OREN.family,g:window.OREN.save.gems,s:window.OREN.save.s['add-0-0'],p:window.TAL.S().prof&&window.TAL.S().prof.an,hash:location.hash}));
 ok('device B joined same family and sees Oren progress',rb.f===fid&&rb.g===33&&rb.s===3&&rb.p==='owl',JSON.stringify(rb));
 // parent on B: set password + time limit
 await L.noCoach(B);await B.evaluate(()=>window.OREN.showMap());await sleep(300);await B.click('#sHome .parbtn');await B.fill('#pw1','abcd');await B.fill('#pw2','abcd');await B.keyboard.press('Enter');await sleep(300);
 await B.evaluate(()=>window.TAL.parentPanel('set'));await sleep(200);{const t=await B.textContent('#sPar');ok('no family code or link in settings',!t.includes('#f=')&&!t.includes('מכשירים נוספים'));}
 await B.evaluate(()=>{window.TAL.parentPanel('time');});await sleep(200);await B.evaluate(()=>document.querySelectorAll('#sPar details').forEach(d=>d.open=true));await B.locator('#sPar .psec',{hasText:'הגבלה קבועה'}).locator('.pchip',{hasText:/^45$/}).click();await sleep(2500);
 // meanwhile A keeps playing (newer saves)
 await A.evaluate(()=>{const O=window.OREN;O.save.gems=40;O.persist();});await sleep(2500);
 await A.evaluate(()=>window.OREN.famPull());await sleep(800);
 const ra=await A.evaluate(()=>({lim:(window.TAL.S().set.lim||{}).daily,pw:!!window.TAL.S().set.pw,g:window.OREN.save.gems}));
 ok('parent change on B reaches A and is not overwritten by A playing',ra.lim===45&&ra.pw&&ra.g===40,JSON.stringify(ra));
 await B.evaluate(()=>window.OREN.famPull());await sleep(800);ok('B sees A latest gems',await B.evaluate(()=>window.OREN.save.gems)===40);
 // #41: play time reaches the parent's phone after ONE 15 s tick (not only every 60 s)
 await A.evaluate(()=>{document.querySelector('#hud').hidden=false;window.OREN.timeTick();});await sleep(2500);
 const tA=await A.evaluate(()=>{const d=window.OREN.today();return [d,window.TAL.S().time[d]|0];});
 ok('one play tick is uploaded to the family save',tA[1]>=15&&((JSON.parse(KV.get(fid)).time||{})[tA[0]]|0)===tA[1],JSON.stringify(tA));
 await B.evaluate(()=>{window.__synced=0;window.OREN.on('synced',()=>window.__synced++);});await B.evaluate(()=>window.OREN.famPull());await sleep(800);
 {const r=await B.evaluate(a=>({t:window.TAL.S().time[a[0]]|0,sy:window.__synced,sv:(window.OREN.save.time||{})[a[0]]|0}),tA);ok('phone B gets the play time',r.t>=tA[1],JSON.stringify(r)+JSON.stringify(tA));}
 // parent sandbox on B must not reach the server
 const before=KV.get(fid);await B.evaluate(()=>{window.TAL.parentPanel('try');});await B.locator('#sPar .bigbtn',{hasText:'כניסה למשחק כהורה'}).click();await sleep(300);await B.evaluate(()=>{window.OREN.save.gems=999;window.OREN.persist();});await sleep(2000);
 ok('parent sandbox never uploads',JSON.parse(KV.get(fid)).gems!==999);
 ok('save note says family',(await A.evaluate(()=>{window.TAL_noHome=true;window.OREN.showJourney();const t=(document.querySelector('#saveNote')||{}).textContent||'';window.TAL_noHome=false;return t;})).includes('לַמִּשְׁפָּחָה'));
 // a failing save (e.g. KV daily limit) is retried with a short backoff and noted for the parent, not lost
 FAILN=2;await A.evaluate(()=>{window.__famRetry=50;window.__fast=false;const O=window.OREN;O.save.gems=51;O.persist();});
 await A.waitForFunction(()=>true);for(let i=0;i<60&&JSON.parse(KV.get(fid)).gems!==51;i++)await sleep(100);
 ok('failed save is retried until it works',JSON.parse(KV.get(fid)).gems===51&&FAILN===0,String(FAILN));
 ok('failed save is noted in the parent problem log',await A.evaluate(()=>(window.OREN.save.iss||[]).some(x=>x.k==='sync')));
 ok('a save that recovers sends no diagnostics report',DIAGS.length===0,String(DIAGS.length));
 // #129: all retries fail (server write limit) -> the real reason is noted and ONE diag record (rolling log + DOM snapshot) is sent
 FAILN=99;FAILST=503;FAILB='{"error":"store"}';await A.evaluate(()=>{const O=window.OREN;O.save.gems=52;O.persist();});
 for(let i=0;i<80&&!DIAGS.length;i++)await sleep(100);await sleep(1500);
 {const d=DIAGS[0]||{};const L=d.log||[];
  ok('all retries failed: one diag record',DIAGS.length===1,String(DIAGS.length));
  ok('diag has the family id and the rolling log (endpoint, status, retry count, error)',d.fam===fid&&L.length>=5&&L.filter(x=>x.st===503).length>=5&&L.every(x=>x.t>0&&x.ep&&'rt' in x&&'e' in x)&&L.some(x=>x.rt===4),JSON.stringify(L.slice(-2)));
  ok('diag has a DOM snapshot of the screen without scripts',typeof d.snap==='string'&&d.snap.length>200&&/<body/i.test(d.snap)&&!/<script/i.test(d.snap),String((d.snap||'').length));
  const is=await A.evaluate(()=>(window.OREN.save.iss||[]).find(x=>x.k==='sync'&&x.d===window.OREN.today()));
  ok('parent log shows the server reason, not "no internet", and that a report was sent',is&&is.m==='full'&&is.r===1,JSON.stringify(is));}
 FAILN=0;FAILST=500;FAILB='{}';await A.evaluate(()=>{window.__fast=true;});
 // device C still has an old per-device family id: its old remote save and its local save are merged into the fixed one, once
 KV.set(OLD,JSON.stringify({v:4,t:1,s:{'sub-0-0':2},m:{},seen:{},story:{},rq:[],days:['2026-01-02']}));
 const C=await (await b.newContext({viewport:{width:1366,height:768}})).newPage();
 await C.addInitScript(o=>{if(!sessionStorage.getItem('seeded')){sessionStorage.setItem('seeded',1);localStorage.setItem('oren4-family',o);localStorage.setItem('oren4-v1',JSON.stringify({v:4,t:2,s:{'mul-0-0':1},m:{},seen:{},story:{intro:1},rq:[],days:[]}));}},OLD);await C.addInitScript(init);C.on('pageerror',e=>errs.push('C '+e.message));
 await C.goto(BASE()+'/');await C.waitForFunction(()=>window.OREN&&window.OREN.family,null,{timeout:20000});await sleep(1500);
 const fx=JSON.parse(KV.get(FIX)||'{}');const rc=await C.evaluate(()=>({f:window.OREN.family,ls:localStorage.getItem('oren4-family'),g:window.OREN.save.gems}));
 ok('old family id: old save + local save merged into the fixed one',fx.s&&fx.s['sub-0-0']===2&&fx.s['mul-0-0']===1&&fx.s['add-0-0']===3&&rc.f===FIX&&rc.ls===FIX,JSON.stringify({s:fx.s,rc}));
 const p0=puts;await C.reload();await C.waitForFunction(()=>window.OREN&&window.OREN.family,null,{timeout:20000});await sleep(800);
 ok('migration happens once (old id forgotten)',await C.evaluate(()=>localStorage.getItem('oren4-family'))===FIX&&puts-p0<=2);
 ok('writes stay modest',puts<40,String(puts));ok('no errors',!errs.length,errs.join('|'));
 await b.close();srv.close();L.finish('family-sync',res);})();
