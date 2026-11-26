// #122: numbers sent to the voice are Hebrew words (digits stay on screen); prefixes joined, gender by the next word.
const L = require('./lib');
const {chromium}=require('playwright');
const res=[];const ok=(n,c,i='')=>res.push((c?'PASS ':'FAIL ')+n+(i?' — '+i:''));
(async()=>{const b=await chromium.launch();const ctx=await b.newContext(L.VIEWPORT);
 await ctx.addInitScript(()=>{try{localStorage.clear()}catch(e){};window.__fast=true;window.__noFamily=true;});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));await p.goto(L.URL);await L.noCoach(p);
 const S=s=>p.evaluate(x=>window.__fullSpell(x),s);
 const N=(n,f)=>p.evaluate(([a,b])=>window.__numWords(a,b),[n,f]);
 const exp={0:'אפס',1:'אחת',2:'שתיים',3:'שלוש',7:'שבע',10:'עשר',11:'אחת עשרה',12:'שתים עשרה',14:'ארבע עשרה',20:'עשרים',21:'עשרים ואחת',37:'שלושים ושבע',48:'ארבעים ושמונה',99:'תשעים ותשע',100:'מאה',101:'מאה ואחת',120:'מאה ועשרים',200:'מאתיים',305:'שלוש מאות וחמש'};
 for(const k in exp){const g=await N(+k,true);ok('fem '+k,g===exp[k],g);}
 const m={1:'אחד',2:'שניים',3:'שלושה',10:'עשרה',11:'אחד עשר',12:'שנים עשר',15:'חמישה עשר',22:'עשרים ושניים'};
 for(const k in m){const g=await N(+k,false);ok('masc '+k,g===m[k],g);}
 let all=true,bad='';for(let i=0;i<=100;i++){const g=await N(i,true);if(!g||/\d/.test(g)){all=false;bad+=i+' ';}}ok('0-100 all words',all,bad);
 const a=await S('כְּשֶׁהָאֲחָדוֹת מַגִּיעוֹת לְ-10 אוֹ יוֹתֵר, נוֹצֶרֶת עוֹד עֶשֶׂרֶת.');ok('ל-10 joined',a.includes('ללעשר')===false&&a.includes('לעשר או יותר')&&!/\d/.test(a),a);
 const a2=await S('כְּשֶׁהָאֲחָדוֹת מַגִּיעוֹת ל-10 אוֹ יוֹתֵר, נוֹצֶרֶת עוֹד עֶשֶׂרֶת.');ok('#86: the lesson sentence with עשרת has no digits in the voice',a2.includes('לעשר או יותר')&&!/\d/.test(a2),a2);
 const c=await S('כָּל מִסְפָּר דּוּ-סִפְרָתִי בָּנוּי מֵעֲשָׂרוֹת וַאֲחָדוֹת: 47 הוּא 4 עֲשָׂרוֹת וְ-7 אֲחָדוֹת.');ok('47 / 4 עשרות / ו-7',c.includes('ארבעים ושבע הוא ארבע עשרות ושבע אחדות')&&!/\d/.test(c),c);
 const d=await S('יֵשׁ 2 כַּדּוּרִים וְ-8 עֲשָׂרוֹת. הַשְׁלָמָה לְ-100');ok('masc/fem by next word, prefix',d.includes('שני כדורים')&&d.includes('ושמונה עשרות')&&d.endsWith('למאה'),d);
 const e=await S('הַשָּׁעָה 3:45 וְ-1.5');ok('times/decimals left alone',e.includes('3:45')&&e.includes('1.5'),e);
 ok('no page errors',errs.length===0,errs.join('|'));
 await b.close();L.finish('voice-numbers',res);})();
