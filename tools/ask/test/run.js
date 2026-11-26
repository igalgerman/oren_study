const {chromium}=require('../../../oren2/node_modules/playwright');
const {spawn}=require('child_process');const path=require('path');
const py='C:\\Users\\97254\\miniforge3\\python.exe';
(async()=>{
 const p=spawn(py,[path.join(__dirname,'..','ask.py'),path.join(__dirname,'sample.json')],{env:{...process.env,ASK_NO_BROWSER:'1'}});
 let out='',err='';p.stdout.on('data',d=>out+=d);
 const url=await new Promise(r=>p.stderr.on('data',d=>{err+=d;const m=err.match(/http:\/\/\S+/);if(m)r(m[0]);}));
 const b=await chromium.launch();const pg=await b.newPage({viewport:{width:390,height:844}});
 await pg.goto(url);
 await pg.click('button');
 console.log('highlighted cards (expect 2):',await pg.locator('.card.bad').count());
 await pg.click('text=מבחן קצר במשחק');
 const n1=await pg.locator('.card.bad').count();console.log('after answering one card (expect 1):',n1);
 await pg.click('text=חיבור');
 const n0=await pg.locator('.card.bad').count();console.log('after answering both (expect 0):',n0);
 await pg.click('text=שעון');
 if(n1!==1||n0!==0){console.log('FAIL');p.kill();await b.close();process.exit(1);}
 await pg.fill('textarea','הערה בעברית');
 await pg.screenshot({path:'C:/work/Oren_study/shots/ask/ask-phone.png',fullPage:true});
 const exited=new Promise(r=>p.on('exit',r));
 await pg.click('button');await pg.waitForSelector('text=תודה');
 await exited;await b.close();
 console.log(out.trim());
})();
