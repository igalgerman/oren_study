/* ===== LESSON CARDS (#56): teach a new idea before its first questions =====
   The first time Oren meets a new idea, a few cards come before the questions: the friend, a big picture,
   the voice reads the line, ONE button to continue, no typing. Shown once; a small "show me again" button
   on the activity screen brings them back.
     LESSONS.add(id,{title,bg,cards:[{art:()=>html, t:'kid text (nikud)', after:card=>{}}]})   packs add their lessons
     LESSONS.first(ids,back,then)   unseen lessons of ids (in order), then then(); seen ones are skipped
     LESSONS.show(ids,back,then)    the lessons again, always (the "show me again" button)
     LESSONS.againBtn(ids,back,then) the small button; put it on the activity screen
     LESSONS.seen(id) · LESSONS.mark(id,on) (KNOW sets it) · LESSONS.speakList() (voice pregen)
   Seen lessons: T.S().lc = {id:1}. */
(()=>{'use strict';const O=window.OREN,T=window.TAL;
const DEF={};
const api=window.LESSONS={DEF,add:(id,def)=>{DEF[id]=def;},speakList:()=>Object.values(DEF).flatMap(d=>d.cards.map(c=>c.t))};
if(!O||!T)return;
const {h,$,ICON}=O;const sfx=O.sfx,D=O.D||(x=>x);
const LC=()=>{const s=T.S();s.lc=s.lc||{};return s.lc;};
const list=ids=>(Array.isArray(ids)?ids:[ids]).filter(id=>DEF[id]);
api.seen=id=>!!LC()[id];
/* KNOW (#57): a known skill marks its lesson seen (skipped); a wrong answer later unmarks it (the lesson comes back) */
api.mark=(id,on)=>{if(on)LC()[id]=1;else delete LC()[id];O.persist();};
function run(ids,back,then){ids=ids.slice();if(!ids.length)return then();const id=ids.shift(),d=DEF[id],cards=d.cards;let i=0;if(O.track)O.track('pop',{p:'card',id});
  O.setScreen('sTal',d.bg||'final',back);const s=$('#sTal');
  const show=()=>{const c=cards[i];T.hudT(d.title,T.progressBar(i,cards.length));s.innerHTML='';
    const wrap=h('div','tq lc');s.appendChild(wrap);
    const card=h('div','prq tqc lccard',`<div class="lcart">${typeof c.art==='function'?c.art():c.art||''}</div><div class="sent">${c.t}</div>`);wrap.appendChild(card);card.classList.add('flashin');
    const row=h('div','chs');const go=h('button','chb lcgo',ICON.play+'<span>הַמְשֵׁךְ</span>');row.appendChild(go);wrap.appendChild(row);
    go.onclick=()=>{if(go.disabled)return;go.disabled=true;T.readStop&&T.readStop();sfx.pop(2);i++;
      if(i<cards.length)return show();LC()[id]=1;O.persist();window.__quiz=null;T.setKey(null);run(ids,back,then);};
    window.__quiz={ans:0,get i(){return i;},wrap};O.sayNow=T.spk?T.spk(c.t):c.t;
    T.setKey(e=>{if(e.key==='Enter'||e.key===' ')go.click();});
    if(window.FRIEND&&window.FRIEND.mount)window.FRIEND.mount();
    setTimeout(async()=>{const se=card.querySelector('.sent');if(!card.isConnected||!se)return;
      if(T.readEl)await T.readEl(se);else O.say(T.spk?T.spk(c.t):c.t);if(card.isConnected&&c.after)c.after(card);},D(400));};
  show();}
/* window.__lessons === false (set by the test browsers, tests/mute.js): no lessons, straight to the activity */
api.first=(ids,back,then)=>window.__lessons===false?then():run(list(ids).filter(id=>!api.seen(id)),back,then);
api.show=(ids,back,then)=>run(list(ids),back,then);
api.againBtn=(ids,back,then)=>{const b=h('button','lcagain','📖 <span>הַרְאֵה לִי שׁוּב</span>');b.onclick=()=>{sfx.pop(1);api.show(ids,back,then);};return b;};

/* ---- lessons for activities of the core (#258; the packs add their own): the activity calls LESSONS.first(id,...) before its first question ---- */
const SP=k=>`<span class="lcpic">${T.ALLSPR(k)}</span>`,X=T.X;
api.add('sci-groups',{title:'אַרְבַּע קְבוּצוֹת שֶׁל בַּעֲלֵי חַיִּים',bg:'forest',cards:[
  {art:()=>SP('dog'),t:'יוֹנֵק: יֵשׁ לוֹ פַּרְוָה אוֹ שֵׂעָר, וְהַגּוּרִים יוֹנְקִים חָלָב מֵאִמָּא.'},
  {art:()=>SP('bird'),t:'עוֹף: יֵשׁ לוֹ נוֹצוֹת וּכְנָפַיִם, וְהָאֶפְרוֹחִים בּוֹקְעִים מִבֵּיצִים.'},
  {art:()=>SP('fish'),t:'דָּג: הוּא חַי בַּמַּיִם, שׂוֹחֶה עִם סְנַפִּירִים וְנוֹשֵׁם בְּתוֹךְ הַמַּיִם.'},
  {art:()=>SP('turtle'),t:'זוֹחֵל: הָעוֹר שֶׁלּוֹ יָבֵשׁ וּמְכֻסֶּה קַשְׂקַשִּׂים, כְּמוֹ הַצָּב וְהַנָּחָשׁ.'},
  {art:()=>SP('whale'),t:'הַלִּוְיָתָן חַי בַּיָּם, אֲבָל הוּא יוֹנֵק: הוּא נוֹשֵׁם אֲוִיר וּמֵינִיק אֶת הַגּוּרִים.'}]});
api.add('sci-mag',{title:'מָה מַגְנֵט מוֹשֵׁךְ?',bg:'city',cards:[
  {art:()=>`<div class="lcrow">${SP('nail')}<span class="lcpic">${X.magnet}</span>${SP('clip')}</div>`,t:'מַגְנֵט מוֹשֵׁךְ אֵלָיו דְּבָרִים מִבַּרְזֶל, כְּמוֹ מַסְמֵר וּמְהַדֵּק. גַּם פְּלָדָה הִיא סוּג שֶׁל בַּרְזֶל.'},
  {art:()=>`<div class="lcrow">${SP('leaf')}<span class="lcpic">${X.magnet}</span>${SP('apple')}</div>`,t:'מַגְנֵט לֹא מוֹשֵׁךְ עֵץ, אֶבֶן, פְּלַסְטִיק אוֹ אֹכֶל.'}]});
const CONT=['אַסְיָה','אַפְרִיקָה','אֵירוֹפָּה','צְפוֹן אֲמֶרִיקָה','דְּרוֹם אֲמֶרִיקָה','אוֹסְטְרַלְיָה','אַנְטַארְקְטִיקָה'];
api.add('world-cont',{title:'מָה זוֹ יַבֶּשֶׁת?',bg:'valley',cards:[
  {art:()=>`<span class="lcpic">${X.globe}</span>`,t:'יַבֶּשֶׁת הִיא שֶׁטַח אֲדָמָה עֲנָקִי, וּמִסָּבִיב לָהּ יָם. בְּכָל יַבֶּשֶׁת יֵשׁ הַרְבֵּה מְדִינוֹת.'},
  {art:()=>`<span class="lcpic sm">${X.globe}</span><div class="lcchips">${CONT.map(c=>`<span>${c}</span>`).join('')}</div>`,t:'בָּעוֹלָם יֵשׁ שֶׁבַע יַבָּשׁוֹת: אַסְיָה, אַפְרִיקָה, אֵירוֹפָּה, צְפוֹן אֲמֶרִיקָה, דְּרוֹם אֲמֶרִיקָה, אוֹסְטְרַלְיָה וְאַנְטַארְקְטִיקָה.'},
  {art:()=>`<span class="lcpic">🦘</span>`,t:'כָּל בַּעַל חַיִּים גָּר בַּטֶּבַע בְּיַבֶּשֶׁת מְסֻיֶּמֶת. הַקֶּנְגּוּרוּ, לְמָשָׁל, גָּר בְּאוֹסְטְרַלְיָה.'}]});
/* code: a tiny board (robot, 2 steps, the diamond) and its program */
const BOT=`<div class="lcrow lccode lcpic"><i>🤖</i><i></i><i></i><i>💎</i></div>`;
api.add('code-prog',{title:'מָה זֶה תָּכְנִית?',bg:'city',cards:[
  {art:()=>`${BOT}<div class="lcrow lcprog"><b>➡</b><b>➡</b><b>➡</b></div>`,t:'תָּכְנִית הִיא רְשִׁימָה שֶׁל חִצִּים. הָרוֹבּוֹט עוֹשֶׂה אוֹתָם אֶחָד אַחֲרֵי הַשֵּׁנִי, לְפִי הַסֵּדֶר.'},
  {art:()=>`${BOT}<div class="lcrow lcprog"><b>➡</b><b class="on">➡</b><b>➡</b></div>`,t:'כָּל חֵץ מַזִּיז אֶת הָרוֹבּוֹט מִשְׁבֶּצֶת אַחַת. כְּשֶׁהַתָּכְנִית מוּכָנָה, לוֹחֲצִים עַל הַפְעֵל.'}]});
api.add('code-rep',{title:'בְּלוֹק חוֹזֵר',bg:'city',cards:[
  {art:()=>`<div class="lcrow lcprog"><b>➡<sub>×3</sub></b><span class="lcarr">=</span><b>➡</b><b>➡</b><b>➡</b></div>`,t:'לְחִיצָה עַל בְּלוֹק עוֹשָׂה אוֹתוֹ פִּי 2 אוֹ פִּי 3: הָרוֹבּוֹט עוֹשֶׂה אֶת אוֹתוֹ צַעַד שׁוּב וָשׁוּב.'}]});
/* sudoku: a solved 4x4, the row (then the column and the box) lit */
const SUD=[[0,1,2,3],[2,3,0,1],[1,0,3,2],[3,2,1,0]],SUDK=['apple','ball','fish','sun'];
const sudArt=on=>`<div class="sud lcsud">${SUD.flat().map((v,i)=>`<span class="sdc fix${(i%4)===1?' br':''}${((i/4)|0)===1?' bb':''}${on(i%4,(i/4)|0)?' lchl':''}">${T.ALLSPR(SUDK[v])}</span>`).join('')}</div>`;
api.add('think-sud',{title:'סוּדוֹקוּ',bg:'mount',cards:[
  {art:()=>sudArt((x,y)=>y===0),t:'בְּסוּדוֹקוּ יֵשׁ חֹק אֶחָד: בְּכָל שׁוּרָה, כָּל תְּמוּנָה מוֹפִיעָה פַּעַם אַחַת בִּלְבַד.'},
  {art:()=>sudArt((x,y)=>x===0||(x<2&&y<2)),t:'גַּם בְּכָל טוּר, וְגַם בְּכָל רִבּוּעַ קָטָן שֶׁל אַרְבַּע מִשְׁבְּצוֹת: כָּל תְּמוּנָה פַּעַם אַחַת.'}]});
/* symmetry: a butterfly on a 6x6 grid, the mirror line in the middle */
const BFLY=['100001','110011','111111','011110','110011','100001'];
const symArt=half=>`<div class="symg lcsym lcpic" style="--n:6">${BFLY.join('').split('').map((v,i)=>`<i class="sc${i%6===2?' edge':''}"${v==='1'&&(!half||i%6<3)?' style="background:#8e6fd1"':''}></i>`).join('')}</div>`;
api.add('art-sym',{title:'סִימֶטְרִיָּה',bg:'valley',cards:[
  {art:()=>symArt(false),t:'סִימֶטְרִיָּה זֶה כְּמוֹ מַרְאָה: הַצַּד הַשֵּׁנִי שֶׁל הַקַּו נִרְאֶה בְּדִיּוּק כְּמוֹ הַצַּד הָרִאשׁוֹן, רַק הָפוּךְ.'},
  {art:()=>symArt(true),t:'מָה שֶׁצָּבוּעַ בְּצַד אֶחָד שֶׁל הַקַּו, צוֹבְעִים גַּם בַּצַּד הַשֵּׁנִי, בְּאוֹתוֹ מֶרְחָק מֵהַקַּו.'}]});
})();
