/* ===== ENGLISH 2: a gradual beginner English program for the 'eng' building =====
   Part 1 (window.ENGLISH2) is pure: content, mastery + spaced review, round planning and question generators. It runs in Node (tests).
   Part 2 hooks it into the game. ENGLISH2.register() replaces the acts of the 'eng' building (the building id stays 'eng').
   Five acts = five levels, each opens by mastery of an earlier one. Letters and sounds are the first path (#58):
     eng-abc  26 letters: upper/lower case, letter name, first sound           always open (first)
     eng-voc  words by themes (hear -> picture, picture -> heard word)          after the first letter group
     eng-read CVC words, sight words, tiny sentences                           after 3 letter groups
     eng-talk short phrases: hear, say aloud (honor button), meaning            after 5 word themes
     eng-song a short chant per theme, words light up                           after 2 word themes (each song after its theme)
   Progress: save.en2 = {i:{itemKey:[box,dueDay]}, u:{unitId:1}, g:{theme:timesSung}}. box 0..5; an item is known at box>=2.
   A unit is done (sticky) when every new group in it was taught and 80% of its items are known.
   Taught words (#58): a question shows or says only English words already taught on a card (taught(), words()). */
window.ENGLISH2=(()=>{'use strict';
let rnd=Math.random;
const pk=a=>a[Math.floor(rnd()*a.length)];
const shuf=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const uniq=a=>[...new Set(a)];

/* ---------- level 1: words by theme. [english, hebrew, picture]
   picture: 's:key' game sprite · '#rrggbb' colour patch · 'n:7' number · 'g:key' pixel picture made here · anything else = emoji ---------- */
const THEMES=[
 {id:'colors',he:'צְבָעִים',p:'צבעים',w:[['red','אָדֹם','#e53935'],['blue','כָּחֹל','#1e6fd9'],['yellow','צָהֹב','#ffd400'],['green','יָרֹק','#2e9e44'],['orange','כָּתֹם','#ff8c1a'],
   ['purple','סָגֹל','#8e44ad'],['pink','וָרֹד','#ff8fc8'],['black','שָׁחֹר','#222222'],['white','לָבָן','#ffffff'],['brown','חוּם','#8b5a2b']]},
 {id:'num1',he:'מִסְפָּרִים 1–10',p:'מספרים 1-10',w:[['one','אַחַת','n:1'],['two','שְׁתַּיִם','n:2'],['three','שָׁלוֹשׁ','n:3'],['four','אַרְבַּע','n:4'],['five','חָמֵשׁ','n:5'],
   ['six','שֵׁשׁ','n:6'],['seven','שֶׁבַע','n:7'],['eight','שְׁמוֹנֶה','n:8'],['nine','תֵּשַׁע','n:9'],['ten','עֶשֶׂר','n:10']]},
 {id:'animals',he:'חַיּוֹת',p:'חיות',w:[['cat','חָתוּל','s:cat'],['dog','כֶּלֶב','🐶'],['fish','דָּג','s:fish'],['bird','צִפּוֹר','s:bird'],['cow','פָּרָה','🐄'],['horse','סוּס','🐴'],
   ['sheep','כִּבְשָׂה','s:sheep'],['pig','חֲזִיר','🐷'],['duck','בַּרְוָז','🦆'],['rabbit','אַרְנָב','🐰']]},
 {id:'sports',he:'סְפּוֹרְט',p:'ספורט',w:[['soccer','כַּדּוּרֶגֶל','⚽'],['basketball','כַּדּוּרְסַל','🏀'],['tennis','טֶנִיס','🎾'],['swim','לִשְׂחוֹת','🏊'],['bike','אוֹפַנַּיִם','🚲'],
   ['goal','שַׁעַר','🥅'],['medal','מֶדַלְיָה','🏅'],['trophy','גָּבִיעַ','🏆']]},
 {id:'family',he:'מִשְׁפָּחָה',p:'משפחה',w:[['mom','אִמָּא','👩'],['dad','אַבָּא','👨'],['baby','תִּינוֹק','👶'],['grandma','סַבְתָּא','👵'],['grandpa','סַבָּא','👴'],['boy','יֶלֶד','👦'],
   ['girl','יַלְדָּה','👧'],['family','מִשְׁפָּחָה','👨‍👩‍👧‍👦'],['friends','חֲבֵרִים','🧑‍🤝‍🧑'],['teacher','מוֹרָה','🧑‍🏫']]},
 {id:'food',he:'אֹכֶל',p:'אוכל',w:[['apple','תַּפּוּחַ','s:apple'],['banana','בָּנָנָה','🍌'],['bread','לֶחֶם','🍞'],['milk','חָלָב','🥛'],['water','מַיִם','💧'],['egg','בֵּיצָה','s:egg'],
   ['cake','עוּגָה','s:cake'],['pizza','פִּיצָה','🍕'],['cheese','גְּבִינָה','🧀'],['ice cream','גְּלִידָה','🍦'],['carrot','גֶּזֶר','🥕'],['grapes','עֲנָבִים','🍇'],
   ['cookie','עוּגִיָּה','🍪'],['strawberry','תּוּת','🍓']]},
 {id:'body',he:'הַגּוּף',p:'הגוף',w:[['eyes','עֵינַיִם','👀'],['ear','אֹזֶן','👂'],['nose','אַף','👃'],['mouth','פֶּה','👄'],['hand','יָד','✋'],['arm','זְרוֹעַ','💪'],
   ['leg','רֶגֶל','🦵'],['foot','כַּף רֶגֶל','🦶'],['tooth','שֵׁן','🦷'],['tongue','לָשׁוֹן','👅']]},
 {id:'toys',he:'צַעֲצוּעִים',p:'צעצועים',w:[['ball','כַּדּוּר','s:ball'],['teddy bear','דֻּבִּי','🧸'],['car','מְכוֹנִית','s:car'],['boat','סִירָה','s:boat'],['kite','עֲפִיפוֹן','🪁'],
   ['balloon','בַּלּוֹן','🎈'],['train','רַכֶּבֶת','🚂'],['book','סֵפֶר','s:bookS'],['drum','תֹּף','🥁'],['robot','רוֹבּוֹט','🤖']]},
 {id:'actions',he:'פְּעֻלּוֹת',p:'פעולות',w:[['run','לָרוּץ','🏃'],['walk','לָלֶכֶת','🚶'],['jump','לִקְפֹּץ','g:jump'],['eat','לֶאֱכֹל','g:eat'],['drink','לִשְׁתּוֹת','🥤'],['sleep','לִישֹׁן','😴'],
   ['sing','לָשִׁיר','🎤'],['dance','לִרְקֹד','💃'],['read','לִקְרֹא','📖'],['write','לִכְתֹּב','✍️'],['clap','לִמְחֹא כַּפַּיִם','👏'],['laugh','לִצְחֹק','😂'],
   ['cry','לִבְכּוֹת','😢'],['climb','לְטַפֵּס','🧗']]},
 {id:'clothes',he:'בְּגָדִים',p:'בגדים',w:[['hat','כּוֹבַע','s:hat'],['shoe','נַעַל','s:shoe'],['shirt','חֻלְצָה','👕'],['pants','מִכְנָסַיִם','👖'],['dress','שִׂמְלָה','👗'],['socks','גַּרְבַּיִם','🧦'],
   ['coat','מְעִיל','🧥'],['glasses','מִשְׁקָפַיִם','👓'],['scarf','צָעִיף','🧣'],['gloves','כְּפָפוֹת','🧤']]},
 {id:'wild',he:'חַיּוֹת בָּר',p:'חיות בר',w:[['lion','אַרְיֵה','🦁'],['tiger','טִיגְרִיס','🐯'],['monkey','קוֹף','🐒'],['bear','דֹּב','🐻'],['elephant','פִּיל','🐘'],
   ['zebra','זֶבְּרָה','🦓'],['frog','צְפַרְדֵּעַ','🐸'],['turtle','צָב','s:turtle'],['owl','יַנְשׁוּף','s:owl']]},
 {id:'weather',he:'בַּחוּץ',p:'בחוץ: מזג אוויר וטבע',w:[['sun','שֶׁמֶשׁ','s:sun'],['rain','גֶּשֶׁם','🌧️'],['cloud','עָנָן','s:cloud'],['snow','שֶׁלֶג','❄️'],['wind','רוּחַ','🌬️'],['rainbow','קֶשֶׁת','s:rainbow'],
   ['hot','חַם','🥵'],['cold','קַר','🥶'],['moon','יָרֵחַ','s:moon'],['star','כּוֹכָב','s:star'],
   ['tree','עֵץ','s:tree'],['flower','פֶּרַח','s:flower']]},
 {id:'home',he:'הַבַּיִת',p:'הבית',w:[['house','בַּיִת','s:hut'],['door','דֶּלֶת','🚪'],['window','חַלּוֹן','🪟'],['bed','מִטָּה','🛏️'],['chair','כִּסֵּא','🪑'],['cup','כּוֹס','s:cup'],
   ['key','מַפְתֵּחַ','s:key'],['clock','שָׁעוֹן','🕐'],['bath','אַמְבַּטְיָה','🛁'],['TV','טֵלֵוִיזְיָה','📺']]},
 {id:'num2',he:'מִסְפָּרִים 11–20',p:'מספרים 11-20',w:[['eleven','אַחַת עֶשְׂרֵה','n:11'],['twelve','שְׁתֵּים עֶשְׂרֵה','n:12'],['thirteen','שְׁלוֹשׁ עֶשְׂרֵה','n:13'],['fourteen','אַרְבַּע עֶשְׂרֵה','n:14'],
   ['fifteen','חֲמֵשׁ עֶשְׂרֵה','n:15'],['sixteen','שֵׁשׁ עֶשְׂרֵה','n:16'],['seventeen','שְׁבַע עֶשְׂרֵה','n:17'],['eighteen','שְׁמוֹנֶה עֶשְׂרֵה','n:18'],['nineteen','תְּשַׁע עֶשְׂרֵה','n:19'],['twenty','עֶשְׂרִים','n:20']]}];
/* words used only as letter keywords or in reading */
const EXTRA={ant:['נְמָלָה','🐜'],igloo:['אִיגְלוּ','g:igloo'],insect:['חֶרֶק','🐞'],juice:['מִיץ','🧃'],leaf:['עָלֶה','s:leaf'],octopus:['תַּמְנוּן','🐙'],olive:['זַיִת','🫒'],
 queen:['מַלְכָּה','👑'],umbrella:['מִטְרִיָּה','☂️'],up:['לְמַעְלָה','⬆️'],violin:['כִּנּוֹר','🎻'],volcano:['הַר גַּעַשׁ','🌋'],fox:['שׁוּעָל','🦊'],box:['קֻפְסָה','📦'],
 'yo-yo':['יוֹ־יוֹ','🪀'],zero:['אֶפֶס','n:0'],
 bat:['עֲטַלֵּף','🦇'],rat:['עַכְבְּרוֹשׁ','🐀'],map:['מַפָּה','🗺️'],bag:['תִּיק','🎒'],hen:['תַּרְנְגֹלֶת','🐔'],pen:['עֵט','🖊️'],web:['קוּרֵי עַכָּבִישׁ','🕸️'],
 pin:['נַעַץ','📌'],bin:['פַּח','🗑️'],log:['בּוּל עֵץ','s:log'],pot:['סִיר','🍲'],bus:['אוֹטוֹבּוּס','🚌'],bug:['חֶרֶק','🐛'],hug:['לְחַבֵּק','🫂']};
const WORD={};
THEMES.forEach(t=>t.w.forEach(([en,he,pic])=>{WORD[en]={en,he,pic,th:t.id};}));
Object.entries(EXTRA).forEach(([en,[he,pic]])=>{if(!WORD[en])WORD[en]={en,he,pic,th:null};});
/* options that must never stand side by side (one picture could pass for the other) */
const CLASH=[['bear','teddy bear'],['ball','soccer'],['ball','basketball'],['ball','tennis'],['soccer','goal'],['family','mom'],['family','dad'],['family','boy'],['family','girl'],['friends','boy'],['friends','girl'],
 ['hand','clap'],['read','book'],['drink','cup'],['drink','milk'],['drink','water'],['cup','milk'],['sleep','bed'],['eyes','glasses'],['hot','sun'],['cold','snow'],['rain','cloud'],['wind','cloud'],
 ['rain','water'],['swim','water'],['house','door'],['house','window'],['mouth','eat'],['bird','duck'],['bird','owl'],['tongue','mouth'],['run','walk'],['hug','friends']];
const clash=(a,b)=>CLASH.some(([x,y])=>(x===a&&y===b)||(x===b&&y===a));

/* ---------- level 2: letters. [letter, the Hebrew letter with the same sound (consonants), keywords]
   keyword 1 is the main one ("B is for ball."). X: the sound is at the end of the word. ---------- */
const LETTERS=[['A','',['apple','ant']],['B','בּ',['ball','bus','bed','banana']],['C','ק',['cat','cake','car','cow']],['D','ד',['dog','duck','door','dad']],['E','',['egg','elephant']],
 ['F','פ',['fish','five','foot','frog']],['G','ג',['girl','goal']],['H','ה',['hat','horse','hand','house']],['I','',['igloo','insect']],['J','ג׳',['jump','juice']],['K','ק',['kite','key']],
 ['L','ל',['lion','leg','leaf']],['M','מ',['moon','milk','monkey','mouth']],['N','נ',['nose','nine']],['O','',['octopus','olive']],['P','פּ',['pig','pizza','pen','pants']],['Q','קְו',['queen']],
 ['R','ר',['rain','robot','rainbow']],['S','ס',['sun','socks','six','seven']],['T','ט',['tiger','ten','tooth','tennis']],['U','',['umbrella','up']],['V','ו',['violin','volcano']],
 ['W','',['window','water','walk']],['X','קְס',['fox','box','six']],['Y','י',['yo-yo','yellow']],['Z','ז',['zebra','zero']]];
const LET={};LETTERS.forEach(([L,he,kw])=>{LET[L]={L,l:L.toLowerCase(),he,kw,end:L==='X'};});
const AZ=LETTERS.map(x=>x[0]);
const LGROUPS=[['S','A','T','P','I','N'],['M','D','G','O','C','K'],['E','U','R','H','B','F'],['L','J','V','W'],['X','Y','Z','Q']];
/* letters that make (or can make) the same sound: never offered together in a sound question */
const SOUNDMATE={C:['K','Q','S'],K:['C','Q'],Q:['C','K'],S:['C','Z'],J:['G'],G:['J'],X:['K','S','C','Z']};
/* letters that look alike, to make case questions meaningful */
const LOOK={lower:[['b','d','p','q'],['n','m','h','u'],['i','l','j','t'],['a','o','e','c'],['v','w','y'],['f','t'],['g','q']],upper:[['M','N','W'],['E','F'],['O','Q','C','G'],['P','R','B'],['I','L','T'],['U','V']]};
const sayIsFor=(L,w)=>`${L} is for ${w}.`;

/* ---------- level 3: reading ---------- */
const CVC=[['a',['cat','hat','bat','rat','map','bag']],['e',['bed','hen','pen','red','ten','web']],['i',['pig','pin','bin','six']],['o',['dog','log','hot','pot','fox','box']],['u',['sun','bus','cup','bug','run','hug']]];
/* sight word, an example, the example in Hebrew */
const SIGHT=[['I','I','אֲנִי'],['a','a cat','חָתוּל'],['the','the sun','הַשֶּׁמֶשׁ'],['is','The sun is hot.','הַשֶּׁמֶשׁ חַמָּה.'],['my','my dog','הַכֶּלֶב שֶׁלִּי'],['see','I see','אֲנִי רוֹאֶה'],['like','I like','אֲנִי אוֹהֵב'],['can','I can','אֲנִי יָכוֹל']];
/* sentence, Hebrew, the picture word, two picture words that do not fit */
const SENT=[['I see a cat.','אֲנִי רוֹאֶה חָתוּל.','cat',['dog','pig']],['I see a dog.','אֲנִי רוֹאֶה כֶּלֶב.','dog',['cat','hen']],['I see a pig.','אֲנִי רוֹאֶה חֲזִיר.','pig',['dog','bug']],
 ['I see a bus.','אֲנִי רוֹאֶה אוֹטוֹבּוּס.','bus',['car','boat']],['I see the sun.','אֲנִי רוֹאֶה אֶת הַשֶּׁמֶשׁ.','sun',['moon','star']],['I see my mom.','אֲנִי רוֹאֶה אֶת אִמָּא שֶׁלִּי.','mom',['dad','baby']],
 ['I see my dad.','אֲנִי רוֹאֶה אֶת אַבָּא שֶׁלִּי.','dad',['mom','grandpa']],['I like red.','אֲנִי אוֹהֵב אָדֹם.','red',['blue','green']],['I like my hat.','אֲנִי אוֹהֵב אֶת הַכּוֹבַע שֶׁלִּי.','hat',['bag','cup']],
 ['I like my bed.','אֲנִי אוֹהֵב אֶת הַמִּטָּה שֶׁלִּי.','bed',['bus','box']],['I can run.','אֲנִי יָכוֹל לָרוּץ.','run',['swim','sleep']],['I can hug.','אֲנִי יָכוֹל לְחַבֵּק.','hug',['run','sleep']],
 ['The sun is hot.','הַשֶּׁמֶשׁ חַמָּה.','sun',['snow','rain']]];

/* ---------- level 4: phrases. [english, hebrew, emoji, a situation (kid text)] ---------- */
const PHRASES=[
 ['Hello!','שָׁלוֹם!','👋','פָּגַשְׁתָּ חָבֵר. מָה אוֹמְרִים?'],['Goodbye!','לְהִתְרָאוֹת!','🚶','הוֹלְכִים הַבַּיְתָה מֵחָבֵר. מָה אוֹמְרִים?'],
 ['Good morning!','בֹּקֶר טוֹב!','🌅','קַמְתָּ בַּבֹּקֶר. מָה אוֹמְרִים לְאִמָּא?'],['Good night!','לַיְלָה טוֹב!','🌙','הוֹלְכִים לִישֹׁן. מָה אוֹמְרִים?'],
 ['Thank you!','תּוֹדָה!','🎁','קִבַּלְתָּ מַתָּנָה. מָה אוֹמְרִים?'],['Please.','בְּבַקָּשָׁה.','🤲','רוֹצִים לְבַקֵּשׁ יָפֶה. מָה אוֹמְרִים?'],
 ['Sorry!','סְלִיחָה!','😔','דָּרַכְתָּ בְּטָעוּת עַל הָרֶגֶל שֶׁל חָבֵר. מָה אוֹמְרִים?'],['Yes.','כֵּן.','👍','רוֹצֶה גְּלִידָה? אַתָּה מְאוֹד רוֹצֶה! מָה עוֹנִים?'],
 ['No.','לֹא.','👎','רוֹצֶה לָלֶכֶת לִישֹׁן עַכְשָׁו? אַתָּה לֹא רוֹצֶה! מָה עוֹנִים?'],
 ['My name is Oren.','קוֹרְאִים לִי אוֹרֶן.','📛','שׁוֹאֲלִים אוֹתְךָ אֵיךְ קוֹרְאִים לְךָ. מָה עוֹנִים?'],['What is your name?','אֵיךְ קוֹרְאִים לְךָ?','❓','בָּא יֶלֶד חָדָשׁ, וְאַתָּה רוֹצֶה לָדַעַת אֵיךְ קוֹרְאִים לוֹ. מָה שׁוֹאֲלִים?'],
 ['How are you?','מָה שְׁלוֹמְךָ?','🙂','רוֹצִים לָדַעַת מָה שְׁלוֹם חָבֵר. מָה שׁוֹאֲלִים?'],["I'm fine, thank you.",'אֲנִי בְּסֵדֶר, תּוֹדָה.','😊','שׁוֹאֲלִים אוֹתְךָ מָה שְׁלוֹמְךָ, וְהַכֹּל טוֹב. מָה עוֹנִים?'],
 ['I love you, Mom!','אֲנִי אוֹהֵב אוֹתָךְ, אִמָּא!','❤️','רוֹצִים לְהַגִּיד לְאִמָּא שֶׁאוֹהֲבִים אוֹתָהּ. מָה אוֹמְרִים?'],["Let's play!",'בּוֹא נְשַׂחֵק!','🎮','רוֹצִים לְהַזְמִין חָבֵר לְשַׂחֵק. מָה אוֹמְרִים?'],
 ['I like soccer.','אֲנִי אוֹהֵב כַּדּוּרֶגֶל.','⚽','רוֹצִים לְסַפֵּר שֶׁאוֹהֲבִים כַּדּוּרֶגֶל. מָה אוֹמְרִים?'],['Happy birthday!','יוֹם הֻלֶּדֶת שָׂמֵחַ!','🎂','לְחָבֵר יֵשׁ יוֹם הֻלֶּדֶת. מָה אוֹמְרִים?'],
 ["I'm hungry.",'אֲנִי רָעֵב.','🍽️','הַבֶּטֶן שֶׁלְּךָ רוֹצָה אֹכֶל. מָה אוֹמְרִים?']];
const PH={};PHRASES.forEach(([en,he,emo,sit])=>{PH[en]={en,he,emo,sit};});
const PCLASH=[['Hello!','Good morning!'],['Goodbye!','Good night!'],['Thank you!',"I'm fine, thank you."]];
const pclash=(a,b)=>PCLASH.some(([x,y])=>(x===a&&y===b)||(x===b&&y===a));
const PUNITS=[{id:'p-hi',he:'שָׁלוֹם וּלְהִתְרָאוֹת',p:'ברכות: שלום, להתראות, בוקר טוב, לילה טוב',w:['Hello!','Goodbye!','Good morning!','Good night!']},
 {id:'p-nice',he:'מִלִּים יָפוֹת',p:'נימוס: תודה, בבקשה, סליחה, כן, לא',w:['Thank you!','Please.','Sorry!','Yes.','No.']},
 {id:'p-me',he:'נָעִים לְהַכִּיר',p:'היכרות: איך קוראים לך, מה שלומך',w:['My name is Oren.','What is your name?','How are you?',"I'm fine, thank you."]},
 {id:'p-fun',he:'מִשְׁפָּטִים שְׂמֵחִים',p:'משפטים: אהבה, משחק, כדורגל, יום הולדת, רעב',w:['I love you, Mom!',"Let's play!",'I like soccer.','Happy birthday!',"I'm hungry."]}];

/* ---------- level 5: one chant per theme (original lyrics) ---------- */
const SONGS=[
 {th:'colors',he:'שִׁיר הַצְּבָעִים',l:['Red and yellow, green and blue,','Orange, purple, pink for you!','Black and white and brown, hooray!','I see colors every day!']},
 {th:'num1',he:'שִׁיר הַסְּפִירָה',l:['One, two, three, four, five,','I can jump and I can dive!','Six, seven, eight, nine, ten,','Let\'s count again, my friend!']},
 {th:'animals',he:'שִׁיר הַחַיּוֹת',l:['A cat, a dog, a duck, a frog,','A frog that jumps up on a log!','A horse, a rabbit, a cow, a sheep,','And all the animals go to sleep.']},
 {th:'sports',he:'שִׁיר הַסְּפּוֹרְט',l:['Kick the ball into the goal!','Basketball, bounce and roll!','I can swim and ride my bike,','These are sports I really like!']},
 {th:'family',he:'שִׁיר הַמִּשְׁפָּחָה',l:['Mom and Dad and baby too,','Grandma, Grandpa, I love you!','A boy, a girl, my friends and me,','We are a happy family!']},
 {th:'food',he:'שִׁיר הָאֹכֶל',l:['Apple, banana, bread and cheese,','Pizza, pizza! More, please!','Ice cream, carrots, eggs and grapes,','Yummy food in funny shapes!']},
 {th:'body',he:'שִׁיר הַגּוּף',l:['Eyes and ears and mouth and nose,','Hands and arms and feet and toes!','Legs that run and hands that clap,','Now we stop and take a nap.']},
 {th:'toys',he:'שִׁיר הַצַּעֲצוּעִים',l:['A ball, a kite, a car, a train,','I play with them again, again!','A teddy bear, a drum, a book,','Come and play! Come and look!']},
 {th:'actions',he:'שִׁיר "אֲנִי יָכוֹל"',l:['I can walk and I can run,','I can jump, it is so much fun!','I can sing and I can dance,','I can clap, clap, clap my hands!']},
 {th:'clothes',he:'שִׁיר הַבְּגָדִים',l:['A hat on my head, socks on my feet,','A shirt and pants, I look so neat!','A coat and gloves and a scarf for snow,','Now I am ready! Off I go!']},
 {th:'wild',he:'שִׁיר חַיּוֹת הַבָּר',l:['A lion, a tiger, a monkey, a bear,','Wild animals everywhere!','An elephant, a zebra, a turtle too,','An owl in a tree says hoo, hoo, hoo!']},
 {th:'weather',he:'שִׁיר מֶזֶג הָאֲוִיר',l:['The sun is hot, the snow is cold,','The wind blows hard, so hold, hold, hold!','The rain falls down on me and you,','Then comes a rainbow, red and blue!']},
 {th:'home',he:'שִׁיר הַבַּיִת',l:['This is my house, this is my door,','This is my bed, this is the floor.','This is a chair, a window too,','Come to my house, I will play with you!']},
 {th:'num2',he:'שִׁיר הַמִּסְפָּרִים הַגְּדוֹלִים',l:['Eleven, twelve, thirteen, fourteen,','Fifteen, sixteen, seventeen!','Eighteen, nineteen, here we go,','Twenty! Twenty! Now I know!']}];
const SONG={};SONGS.forEach(s=>{SONG[s.th]=s;});

/* ---------- levels and units ---------- */
const tag=(p,list)=>list.map(x=>p+x);
const LEVELS=[
 {id:'eng-voc',teach:1,newG:4,capG:6,units:THEMES.map(t=>({id:'v-'+t.id,he:t.he,p:t.p,items:tag('v:',t.w.map(w=>w[0]))}))},
 {id:'eng-abc',teach:1,newG:2,capG:3,units:LGROUPS.map(g=>({id:'l-'+g.join('').toLowerCase(),he:`אוֹתִיּוֹת <span class="ltr">${g.join(' ')}</span>`,p:'האותיות '+g.join(' '),items:g.flatMap(L=>['n:'+L,'c:'+L,'s:'+L])}))},
 {id:'eng-read',teach:1,newG:3,capG:5,units:[...CVC.map(([v,ws])=>({id:'r-'+v,he:`מִלִּים עִם <span class="ltr">${v}</span>`,p:`קריאת מילים קצרות עם ${v} (${ws.slice(0,3).join(', ')}...)`,items:tag('r:',ws)})),
   {id:'r-sight',he:'מִלִּים שֶׁרוֹאִים הַרְבֵּה',p:'מילים שכיחות: '+SIGHT.map(s=>s[0]).join(', '),items:tag('w:',SIGHT.map(s=>s[0]))},
   {id:'r-sent',he:'מִשְׁפָּטִים',p:'קריאת משפטים קצרים',items:tag('x:',SENT.map(s=>s[0]))}]},
 {id:'eng-talk',teach:1,newG:2,capG:3,units:PUNITS.map(u=>({id:u.id,he:u.he,p:u.p,items:tag('p:',u.w)}))},
 {id:'eng-song',units:SONGS.map(s=>({id:'g-'+s.th,he:s.he,p:'שיר: '+s.th,items:['g:'+s.th]}))}];
const UNIT={};LEVELS.forEach((L,li)=>L.units.forEach(u=>{u.lv=li;UNIT[u.id]=u;}));
const ITEM_UNIT={};LEVELS.forEach(L=>L.units.forEach(u=>u.items.forEach(k=>{ITEM_UNIT[k]=u;})));
const LV=id=>LEVELS.findIndex(L=>L.id===id);
/* the group taught together on one card: a letter's three items share one card; sentences need no card */
const groupOf=k=>/^[ncs]:/.test(k)?'L:'+k.slice(2):k;
const teaches=g=>!/^x:/.test(g);
const groupItems=(u,g)=>u.items.filter(k=>groupOf(k)===g);
const groupsOf=u=>uniq(u.items.map(groupOf));
/* when a level opens: [level, units done needed] ; the parent switch "all open" (set.all) opens everything */
const OPEN=[[1,1],null,[1,3],[0,5],[0,2]];
const PREV=[1,null,1,2];   /* knowing this level opens the next one (#57) */
const SKILLS={'eng-voc':'אנגלית: אוצר מילים','eng-abc':'אנגלית: אותיות וצלילים','eng-read':'אנגלית: קריאה ראשונה','eng-talk':'אנגלית: דיבור','eng-song':'אנגלית: שירים ודקלומים'};

/* ---------- progress, mastery, spaced review ---------- */
const INT=[0,1,1,3,7,14];                         /* days until the next review, by box */
const day=(t)=>{const d=t?new Date(t):new Date();return Math.floor((d.getTime()-d.getTimezoneOffset()*60000)/864e5);};
const st=save=>{save.en2=save.en2||{};const e=save.en2;e.i=e.i||{};e.u=e.u||{};e.g=e.g||{};return e;};
const box=(save,k)=>((st(save).i[k]||[0])[0])|0;
const seen=(save,k)=>!!st(save).i[k];
const known=(save,k)=>box(save,k)>=2;
function touch(save,keys,d){const E=st(save);keys.forEach(k=>{if(!E.i[k])E.i[k]=[0,d];});}
/* res: 'ok' first try without help · 'bad' a wrong answer · 'hint' helped (no change). b0 = the box when the round started (one step per round) */
function mark(save,k,res,b0,d){const E=st(save);const b=res==='ok'?Math.min(5,b0+1):res==='bad'?(b0>=2?1:0):b0;E.i[k]=[b,d+INT[b]];return b;}
function unitDone(save,u){const E=st(save);if(E.u[u.id])return true;if(u.lv===4)return false;
  if(!groupsOf(u).every(g=>u.items.some(k=>groupOf(k)===g&&seen(save,k))))return false;
  const n=u.items.filter(k=>known(save,k)).length;if(n>=Math.ceil(u.items.length*.8)){E.u[u.id]=1;return true;}return false;}
const doneUnits=(save,lv)=>LEVELS[lv].units.filter(u=>unitDone(save,u)).length;
/* a level also opens when Oren already knows the level before it (#57: 3 right in a row, or the parent said so) */
const knowsLv=(save,lv)=>!!(save.kn&&save.kn.k&&(save.kn.k[LEVELS[lv].id]||{}).ok);
function levelOpen(save,lv){if(lv===1||(save.set&&save.set.all))return true;if(lv<4&&knowsLv(save,PREV[lv]))return true;const [from,n]=OPEN[lv];return doneUnits(save,from)>=n;}
const songOpen=(save,th)=>levelOpen(save,4)&&(unitDone(save,UNIT['v-'+th])||!!(save.set&&save.set.all));
const openSongs=save=>SONGS.filter(s=>songOpen(save,s.th));
const curUnit=(save,lv)=>LEVELS[lv].units.find(u=>!unitDone(save,u))||null;
/* the English words already taught on a card: words, reading words, sight words, phrases, and each letter's main keyword */
function taught(save){const T=new Set();Object.keys(st(save).i).forEach(k=>{const c=k[0],v=k.slice(2);
  if(c==='v'||c==='r'||c==='w'||c==='p')T.add(v);else if((c==='n'||c==='c'||c==='s')&&LET[v])T.add(LET[v].kw[0]);});return T;}
const sentWords=s=>s.replace(/[.!?,]/g,'').split(' ').map(w=>w==='I'?w:w.toLowerCase());
/* the English words a question shows or says (pictures are not words) */
function words(q){const o=q.opts.filter(x=>x.t==='en').map(x=>x.v);
  switch(q.type){case 'hear':case 'read':case 'sound':return [q.w];case 'say':case 'spell':case 'sight':return uniq([q.w,...o]);
    case 'sent':return sentWords(q.s);case 'mean':return [q.p];case 'sit':return uniq([q.p,...o]);}return [];}
/* a word card for every word of the new sentences not taught yet (mom, dad) */
function sentTeach(save,keys){const T=taught(save);return uniq(keys.filter(k=>/^x:/.test(k)).flatMap(k=>sentWords(k.slice(2)))).filter(w=>!T.has(w)&&WORD[w])
  .map(w=>WORD[w].th?'v:'+w:CVCW.includes(w)?'r:'+w:null).filter(Boolean);}

/* ---------- a round: teach cards for new groups, then about 8 questions ---------- */
const ROUND=8;
function plan(save,lv,d){const L=LEVELS[lv];if(d==null)d=day();const E=st(save);
  const cur=curUnit(save,lv);let fresh=[],learn=[];
  if(cur){const gs=groupsOf(cur);const lg=gs.filter(g=>groupItems(cur,g).some(k=>seen(save,k))&&groupItems(cur,g).some(k=>!known(save,k)));
    learn=lg.flatMap(g=>groupItems(cur,g).filter(k=>!known(save,k)));
    const room=Math.max(0,Math.min(L.newG,L.capG-lg.length));
    fresh=gs.filter(g=>!groupItems(cur,g).some(k=>seen(save,k))).slice(0,room);
    if(!fresh.length&&!learn.length)fresh=gs.filter(g=>!groupItems(cur,g).some(k=>seen(save,k))).slice(0,1);}
  const freshItems=cur?fresh.flatMap(g=>groupItems(cur,g)):[];
  const curSet=new Set([...freshItems,...learn]);
  const all=L.units.flatMap(u=>u.items);
  const old=all.filter(k=>seen(save,k)&&!curSet.has(k));
  const weak=shuf(old.filter(k=>!known(save,k)));
  const due=shuf(old.filter(k=>known(save,k)&&(E.i[k][1]|0)<=d)).sort((a,b)=>(E.i[a][1]|0)-(E.i[b][1]|0));
  const nRev=cur?(freshItems.length+learn.length>=6?2:3):ROUND;
  const review=[...weak,...due].slice(0,nRev);
  const cap=Math.max(ROUND,freshItems.length+review.length);const qs=[];const add=(k,pass)=>{if(qs.length<cap)qs.push({k,pass});};
  freshItems.forEach(k=>add(k,0));shuf(learn).slice(0,Math.max(0,cap-freshItems.length-review.length)).forEach(k=>add(k,0));review.forEach(k=>add(k,0));
  /* new and still-learning items come back once more (the other way round) while there is room */
  const again=[...freshItems,...learn].filter(k=>!/^[ncs]:|^x:/.test(k));for(let i=0;qs.length<ROUND&&i<again.length;i++)add(again[i],1);
  const rest=shuf(old.filter(k=>!qs.some(q=>q.k===k)));while(qs.length<6&&rest.length)add(rest.pop(),0);
  const ord=spread(shuf(qs));return {lv,unit:cur,teach:[...(lv===2?sentTeach(save,ord.map(q=>q.k)):[]),...fresh.filter(teaches)],qs:ord};}
/* no item twice in a row */
function spread(a){const left=a.slice(),out=[];while(left.length){const last=out.length?out[out.length-1].k:null;
  const cnt=k=>left.filter(x=>x.k===k).length;const ok=left.filter(x=>x.k!==last);const pool=ok.length?ok:left;const top=Math.max(...pool.map(x=>cnt(x.k)));
  const c=pool.filter(x=>cnt(x.k)===top);const x=c[Math.floor(rnd()*c.length)];out.push(x);left.splice(left.indexOf(x),1);}return out;}

/* ---------- question generators (pure data; the screen draws them) ----------
   q = {k, lv, type, opts:[...], ans, ...}. option kinds: {t:'pic',w} word picture · {t:'en',v} English text (spoken in turn) · {t:'let',v} a letter · {t:'he',v,emo} Hebrew meaning */
const okey=o=>o.t+':'+(o.w||o.v);
function mk(q,ans,ds){const all=[ans,...ds];const keys=all.map(okey);if(new Set(keys).size!==keys.length)throw new Error('dup opts '+q.k+' '+keys);
  if(all.some(o=>o.t==='pic')){const ps=all.map(o=>WORD[o.w].pic);if(new Set(ps).size!==ps.length)throw new Error('dup pictures '+q.k);}
  const opts=shuf(all);return Object.assign(q,{opts,ans:opts.findIndex(o=>okey(o)===okey(ans))});}
/* n distractor words for word w from pool: distinct picture, no clash, seen first */
function distract(save,w,pool,n,pref){const ws=[w];const out=[];const ok=x=>x!==w&&!ws.includes(x)&&!out.includes(x)&&!out.some(y=>clash(x,y))&&!clash(x,w)&&WORD[x]&&![w,...out].some(y=>WORD[y].pic===WORD[x].pic);
  const tiers=pref||[pool];for(const tier of tiers){for(const x of shuf(tier)){if(out.length>=n)break;if(ok(x))out.push(x);}if(out.length>=n)break;}return out;}
function genVoc(save,k,pass){const w=k.slice(2),b=box(save,k),th=WORD[w].th;const T=taught(save);
  const same=THEMES.find(t=>t.id===th).w.map(x=>x[0]);const sameSeen=same.filter(x=>T.has(x));
  const others=[...T].filter(x=>{const t=WORD[x]&&WORD[x].th;return t&&t!==th&&t!=='colors'&&t!=='num1'&&t!=='num2';});
  const plain=th==='colors'||th==='num1'||th==='num2';
  let type=pass===1?'say':b>=1&&rnd()<.5?'say':'hear';
  /* 'say' shows English words: only taught ones (#58); too few → 'hear' (pictures) */
  let ds=type==='say'?distract(save,w,same,2,[sameSeen,...(plain?[]:[others])]):[];if(type==='say'&&ds.length<2)type='hear';
  if(type==='hear')ds=distract(save,w,same,b>=2?3:2,[sameSeen,same,...(plain?[]:[others])]);
  if(type==='hear')return mk({k,lv:0,type,w},{t:'pic',w},ds.map(x=>({t:'pic',w:x})));
  return mk({k,lv:0,type,w},{t:'en',v:w},ds.map(x=>({t:'en',v:x})));}
function genAbc(save,k){const kind=k[0],L=k.slice(2),b=box(save,k);const seenL=AZ.filter(x=>seen(save,'n:'+x)&&x!==L);
  const fill=(cands,n,bad)=>{const out=[];for(const x of cands){if(out.length>=n)break;if(x!==L&&!out.includes(x)&&!(bad||[]).includes(x))out.push(x);}return out;};
  if(kind==='n'){const n=b>=2?4:3;const ds=fill([...shuf(seenL),...shuf(AZ)],n-1);const low=b>=1&&rnd()<.5;
    return mk({k,lv:1,type:'name',L,low},{t:'let',v:low?L.toLowerCase():L},ds.map(x=>({t:'let',v:low?x.toLowerCase():x})));}
  if(kind==='c'){const up=b%2===0;const target=up?L.toLowerCase():L;const set=up?LOOK.lower:LOOK.upper;const look=(set.find(g=>g.includes(target))||[]).filter(x=>x!==target).map(x=>x.toUpperCase());
    const ds=fill([...shuf(look),...shuf(seenL),...shuf(AZ)],2);
    return mk({k,lv:1,type:'case',L,up,show:up?L:L.toLowerCase()},{t:'let',v:target},ds.map(x=>({t:'let',v:up?x.toLowerCase():x})));}
  const kw=b===0?LET[L].kw[0]:lkw(L,taught(save));const inWord=kw.toUpperCase().replace(/[^A-Z]/g,'').split('');
  const bad=[...inWord,...(SOUNDMATE[L]||[])];const n=b>=2?4:3;
  const ds=fill([...shuf(seenL),...shuf(AZ)],n-1,bad);
  return mk({k,lv:1,type:'sound',L,w:kw,end:LET[L].end},{t:'let',v:L},ds.map(x=>({t:'let',v:x})));}
/* a keyword of letter L chosen by the learning engine (unseen first, no repeats); plain random without it */
function lkw(L,T){const kws=LET[L].kw.filter((w,i)=>!i||!T||T.has(w));const LN=typeof window!=='undefined'&&window.LEARN;if(LN&&LN.pickItem&&kws.length>1){try{const r=LN.pickItem('eng-kw',kws.map(w=>({k:L+':'+w})));const w=r&&r.item.k.slice(2);if(w&&kws.includes(w)){LN.seen('eng-kw',r.item.k,true,false);return w;}}catch(e){}}return pk(kws);}
const CVCW=CVC.flatMap(([v,ws])=>ws);const vowelOf=w=>(CVC.find(([v,ws])=>ws.includes(w))||[''])[0];
const diff1=(a,b)=>a.length===b.length&&[...a].filter((c,i)=>c!==b[i]).length===1;
function genRead(save,k,pass){const kind=k[0],v=k.slice(2),b=box(save,k);
  if(kind==='r'){const vw=vowelOf(v);const same=CVCW.filter(x=>vowelOf(x)===vw),other=CVCW.filter(x=>vowelOf(x)!==vw);
    const type=b>=1&&(pass===1||rnd()<.4)?'spell':'read';
    if(type==='read'){const ds=distract(save,v,CVCW,2,b>=1?[same,other]:[other,same]);return mk({k,lv:2,type,w:v},{t:'pic',w:v},ds.map(x=>({t:'pic',w:x})));}
    const T=taught(save),tw=a=>a.filter(x=>T.has(x));const near=CVCW.filter(x=>diff1(x,v));const ds=distract(save,v,CVCW,2,[tw(near),tw(same),tw(other)]);
    if(ds.length<2){const dr=distract(save,v,CVCW,2,b>=1?[same,other]:[other,same]);return mk({k,lv:2,type:'read',w:v},{t:'pic',w:v},dr.map(x=>({t:'pic',w:x})));}
    return mk({k,lv:2,type,w:v},{t:'en',v},ds.map(x=>({t:'en',v:x})));}
  if(kind==='w'){const sw=SIGHT.map(s=>s[0]);const seenW=sw.filter(x=>x!==v&&seen(save,'w:'+x));const ds=shuf(seenW).slice(0,2);
    return mk({k,lv:2,type:'sight',w:v},{t:'en',v},ds.map(x=>({t:'en',v:x})));}
  const s=SENT.find(x=>x[0]===v);return mk({k,lv:2,type:'sent',s:v,he:s[1],w:s[2]},{t:'pic',w:s[2]},s[3].map(x=>({t:'pic',w:x})));}
function genTalk(save,k,pass){const p=k.slice(2),b=box(save,k);const all=PHRASES.map(x=>x[0]).filter(x=>x!==p&&!pclash(x,p));
  const seenP=all.filter(x=>seen(save,'p:'+x));const pool=[...shuf(seenP),...shuf(all.filter(x=>!seenP.includes(x)))];
  const ds=[];for(const x of pool){if(ds.length>=2)break;if(!ds.some(y=>pclash(x,y)||PH[x].he===PH[y].he||PH[x].emo===PH[y].emo)&&PH[x].emo!==PH[p].emo&&PH[x].he!==PH[p].he)ds.push(x);}
  /* 'sit' offers English phrases: only taught ones (#58); too few → 'mean' */
  const dsT=ds.filter(x=>seenP.includes(x));const type=b>=1&&dsT.length>=2&&(pass===1||rnd()<.5)?'sit':'mean';
  if(type==='mean')return mk({k,lv:3,type,p},{t:'he',v:PH[p].he,emo:PH[p].emo},ds.map(x=>({t:'he',v:PH[x].he,emo:PH[x].emo})));
  return mk({k,lv:3,type,p,sit:PH[p].sit},{t:'en',v:p},dsT.map(x=>({t:'en',v:x})));}
function gen(save,step){const k=step.k;const c=k[0];
  if(c==='v')return genVoc(save,k,step.pass);if(c==='n'||c==='c'||c==='s')return genAbc(save,k);if(c==='r'||c==='w'||c==='x')return genRead(save,k,step.pass);return genTalk(save,k,step.pass);}
/* a teach card: what it shows and says */
function teachCard(g){if(g.startsWith('L:')){const L=g.slice(2),x=LET[L];return {g,kind:'letter',L,l:x.l,he:x.he,w:x.kw[0],mean:WORD[x.kw[0]].he,end:x.end,say:sayIsFor(L,x.kw[0]),items:['n:'+L,'c:'+L,'s:'+L]};}
  const c=g[0],v=g.slice(2);
  if(c==='v')return {g,kind:'word',w:v,say:v,items:[g]};
  if(c==='r')return {g,kind:'cvc',w:v,say:v,items:[g]};
  if(c==='w'){const s=SIGHT.find(x=>x[0]===v);return {g,kind:'sight',w:v,ex:s[1],exHe:s[2],say:s[1]===v?v:v+'. '+s[1],items:[g]};}
  return {g,kind:'phrase',p:v,say:v,items:[g]};}

/* ---------- everything the game speaks in English (to make the voice in advance) ---------- */
function speakList(){const out=[];const add=s=>out.push(s);
  THEMES.forEach(t=>t.w.forEach(w=>add(w[0])));
  AZ.forEach(L=>{add(L);LET[L].kw.forEach(w=>{add(w);add(sayIsFor(L,w));});});
  CVCW.forEach(add);SIGHT.forEach(s=>{add(s[0]);if(s[1]!==s[0])add(s[0]+'. '+s[1]);});SENT.forEach(s=>add(s[0]));
  PHRASES.forEach(p=>add(p[0]));SONGS.forEach(s=>s.l.forEach(add));
  return uniq(out);}

/* ---------- parents (no nikud) ---------- */
function levelOf(id){return levelText(null,id);}
function levelText(save,id){save=save||api.save;if(!save)return '';const lv=LV(id);if(lv<0)return '';const L=LEVELS[lv];
  if(!levelOpen(save,lv)){const [from,n]=OPEN[lv];return n===1?'נפתח אחרי קבוצת האותיות הראשונה':`נפתח אחרי ${n} ${from===0?'נושאי מילים':'קבוצות אותיות'}`;}
  if(lv===4){const o=openSongs(save);return `${o.length}/${SONGS.length} שירים פתוחים`;}
  const items=L.units.flatMap(u=>u.items);const kn=items.filter(k=>known(save,k)).length;const cu=curUnit(save,lv);
  return `${doneUnits(save,lv)}/${L.units.length} יחידות · ${kn}/${items.length} פריטים ידועים${cu?' · עכשיו: '+cu.p:' · הכל נלמד, חזרות'}`;}
function report(save){save=save||api.save;return LEVELS.map((L,lv)=>{const items=L.units.flatMap(u=>u.items);const cu=curUnit(save,lv);
  const weak=items.filter(k=>seen(save,k)&&box(save,k)===0&&lv<4).map(k=>k.slice(2));
  return {id:L.id,name:SKILLS[L.id],open:levelOpen(save,lv),units:L.units.length,done:doneUnits(save,lv),items:items.length,known:items.filter(k=>known(save,k)).length,now:cu?cu.p:'',weak,text:levelText(save,L.id)};});}
/* family merge: the better box of each item, sticky units, songs */
function merge(save,o){if(!o||!o.en2)return;const E=st(save),F=o.en2;
  Object.entries(F.i||{}).forEach(([k,v])=>{const c=E.i[k];if(!c||(v[0]|0)>(c[0]|0)||((v[0]|0)===(c[0]|0)&&(v[1]|0)<(c[1]|0)))E.i[k]=[v[0]|0,v[1]|0];});
  Object.keys(F.u||{}).forEach(k=>{E.u[k]=1;});Object.entries(F.g||{}).forEach(([k,v])=>{E.g[k]=Math.max(E.g[k]|0,v|0);});}

let UI=null,SAVE=null;      /* the game sets the live save (Part 2); tests pass one */
const api={THEMES,WORD,EXTRA,CLASH,clash,LETTERS,LET,AZ,LGROUPS,SOUNDMATE,LOOK,CVC,CVCW,SIGHT,SENT,PHRASES,PH,PCLASH,PUNITS,SONGS,SONG,LEVELS,UNIT,ITEM_UNIT,OPEN,SKILLS,INT,
  day,st,box,seen,known,taught,words,touch,mark,unitDone,doneUnits,levelOpen,songOpen,openSongs,curUnit,plan,gen,teachCard,groupOf,groupsOf,okey,sayIsFor,speakList,levelOf,levelText,report,merge,
  setRng:f=>{rnd=f||Math.random;},set save(s){SAVE=s;},get save(){return SAVE;},set ui(u){UI=u;},
  register:()=>{if(UI)UI.register();}};
return api;
})();

/* ======================= Part 2: the screens ======================= */
(()=>{'use strict';const O=window.OREN,T=window.TAL,E2=window.ENGLISH2;if(!O||!T||!E2)return;
const {h,$,ICON,SPR}=O;const sfx=O.sfx,D=O.D;
const S=()=>T.S();
Object.defineProperty(E2,'save',{get:()=>O.save,configurable:true});
const L_=t=>`<span class="ltr">${t}</span>`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* ---------- pictures ---------- */
const PX={
 igloo:O.sprite(['....WWWW....','..WWLWWLWW..','.WWWWWWWWWW.','WLWWWLWWWLWW','WWWWWKKWWWWW','WWLWKKKKWLWW','WWWWKKKKWWWW','SSSSSSSSSSSS'],{W:'#ffffff',L:'#9fd3f0',K:'#2b4a66',S:'#cfe8f7'}),
 jump:O.sprite(['.S........S.','..S.HHHH.S..','...SSSSSS...','....BBBB....','...BBBBBB...','....BBBB....','....PPPP....','...PP..PP...','..PP....PP..','............','...DDDDDD...','GGGGGGGGGGGG'],{S:'#f6d2a8',H:'#5b3a1e',B:'#e4572e',P:'#2f5d8a',D:'#5e9f48',G:'#7cc35f'}),
 eat:O.sprite(['..YYYYYY....','.YYYYYYYY...','YYKYYYYKYY..','YYYYYYYYYY..','YYYKKKKYYY..','YYYKOOSSSSSS','YYYKKKKYYY..','.YYYYYYYY...','..YYYYYY....'],{Y:'#ffd166',K:'#1d2631',O:'#f28c28',S:'#9aa1a8'})};
const blob=c=>`<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6c12 0 24 8 25 21 1 9-4 13-3 20 1 8-8 12-16 11-6-1-9 3-16 1C12 57 6 50 7 41c1-7-3-11-1-18C9 12 20 6 32 6z" fill="${c}" stroke="#23303b" stroke-width="3"/><circle cx="56" cy="12" r="4" fill="${c}" stroke="#23303b" stroke-width="2"/></svg>`;
function pic(w,cls){const p=(E2.WORD[w]||{}).pic||'';const c=cls?' '+cls:'';
  if(p.startsWith('s:'))return `<span class="pic${c}">${T.ALLSPR(p.slice(2))}</span>`;
  if(p.startsWith('g:'))return `<span class="pic${c}">${PX[p.slice(2)]}</span>`;
  if(p[0]==='#')return `<span class="pic e2c${c}">${blob(p)}</span>`;
  if(p.startsWith('n:')){const n=+p.slice(2);return `<span class="pic e2n${c}"><b>${n}</b>${n>0&&n<=10?`<i>${'●'.repeat(n)}</i>`:''}</span>`;}
  return `<span class="pic e2e${c}">${p}</span>`;}
const heOf=w=>(E2.WORD[w]||{}).he||'';

/* ---------- voice ---------- */
let TOK=0,SLOWT=-1;
/* #425: a second tap on the same 🔊 soon after the first says the English slowly (no new button); SLOWT = the token of that slow replay */
const SLOWMS=2500,isSlow=()=>SLOWT===TOK;
const twice=fn=>{let last=0;return ()=>{const now=Date.now(),s=now-last<SLOWMS;last=s?0:now;SLOWT=s?TOK+1:-1;fn();};};/* fn starts one new voice token (++TOK) */
const en=t=>{try{O.sayLang(t,'en',isSlow());}catch(e){}};
const he=t=>{try{O.say(t);}catch(e){}};
const speaking=()=>{try{const g=window.__gv;if(g&&g.audio&&!g.audio.paused&&!g.audio.ended)return true;}catch(e){}try{return !!(window.speechSynthesis&&speechSynthesis.speaking);}catch(e){return false;}};
const estMs=(t,lang)=>lang==='en'?(320+75*String(t).length)/(isSlow()?.7:.85):(250+65*T.plainHe(t).length)/.9;
/* wait until the voice is done (or about the time it should take) */
async function waitSay(t,lang,tok){const est=D(estMs(t,lang)),t0=Date.now();let on=false;
  for(;;){if(tok!==TOK)return false;const el=Date.now()-t0,sp=speaking();if(sp)on=true;if(on&&!sp&&el>D(250))break;if(!on&&el>=est)break;if(el>est*3+D(1500))break;await sleep(Math.max(10,D(90)));}return tok===TOK;}
async function talk(parts){const tok=++TOK;for(const [lang,t] of parts){if(tok!==TOK)return;if(lang==='en')en(t);else he(t);if(!(await waitSay(t,lang,tok)))return;await sleep(D(220));}}
const hush=()=>{TOK++;};
O.on('screen',hush);
/* light the words of el while the English voice reads t */
async function karaoke(el,t,tok){const ws=[...el.querySelectorAll('.e2w')];en(t);let dur=D(estMs(t,'en'));
  await sleep(Math.max(10,D(150)));const a=window.__gv&&window.__gv.audio;
  if(a){if(!(a.duration>0))await new Promise(r=>{a.addEventListener('loadedmetadata',r,{once:true});setTimeout(r,800);});if(a.duration>0&&isFinite(a.duration))dur=a.duration*1000;}
  const len=ws.map(w=>w.textContent.length+2),tot=len.reduce((x,y)=>x+y,0)||1;let acc=0;const t0=Date.now();
  for(let i=0;i<ws.length;i++){if(tok!==TOK)break;ws.forEach((w,j)=>w.classList.toggle('on',j===i));const until=acc+dur*len[i]/tot;acc=until;while(Date.now()-t0<until&&tok===TOK)await sleep(Math.max(10,D(40)));}
  await waitSay(t,'en',tok);ws.forEach(w=>w.classList.remove('on'));return tok===TOK;}
const wordsHTML=t=>t.split(' ').map(w=>`<span class="e2w">${w}</span>`).join(' ');

/* ---------- drawing a question / teach card ---------- */
const QQ={hear:'הַקְשֵׁב וּבְחַר תְּמוּנָה',say:'אֵיךְ אוֹמְרִים אֶת זֶה בְּאַנְגְּלִית?',name:'אֵיזוֹ אוֹת שָׁמַעְתָּ?',caseUp:'מְצָא אֶת הָאוֹת הַקְּטַנָּה',caseLow:'מְצָא אֶת הָאוֹת הַגְּדוֹלָה',
  sound:'בְּאֵיזוֹ אוֹת מַתְחִילָה הַמִּלָּה?',soundEnd:'בְּאֵיזוֹ אוֹת נִגְמֶרֶת הַמִּלָּה?',read:'קְרָא אֶת הַמִּלָּה וּבְחַר תְּמוּנָה',spell:'אֵיזוֹ מִלָּה שָׁמַעְתָּ?',sight:'אֵיזוֹ מִלָּה שָׁמַעְתָּ?',
  sent:'קְרָא אֶת הַמִּשְׁפָּט וּבְחַר תְּמוּנָה',mean:'מָה זֶה אוֹמֵר?'};
const tiles=w=>`<div class="e2tiles">${[...w].map(c=>`<span class="e2t">${c}</span>`).join('')}</div>`;
const letBig=(U,l)=>`<div class="e2let">${L_(U+' '+l)}</div>`;
function optHTML(o){if(o.t==='pic')return pic(o.w);if(o.t==='let')return `<span class="ltr">${o.v}</span>`;if(o.t==='he')return `<span class="e2emo">${o.emo}</span><span>${o.v}</span>`;return `<span class="ltr">${o.v}</span>`;}
const optCls=q=>{const o=q.opts[0];return o.t==='pic'?'picb':o.t==='let'?'e2lb':o.t==='he'?'e2hb':'e2tb';};
/* what the card shows + what it says (first time this kind of question appears in a round, the Hebrew question is said first) */
function qView(q){const w=q.w,qq=x=>`<div class="e2q">${x}</div>`;
  switch(q.type){
    case 'hear':return {pr:qq(QQ.hear),play:[['en',w]],ask:QQ.hear,explain:`${L_(`<b>${w}</b>`)} = ${heOf(w)}`};
    case 'say':return {pr:`${pic(w,'big')}${qq(QQ.say)}`,seq:true,ask:QQ.say,explain:`${L_(`<b>${w}</b>`)} = ${heOf(w)}`,after:[['en',w]]};
    case 'name':return {pr:qq(QQ.name),play:[['en',q.L]],ask:QQ.name,explain:letBig(q.L,q.L.toLowerCase())};
    case 'case':return {pr:`<div class="e2let e2one">${L_(q.show)}</div>${qq(q.up?QQ.caseUp:QQ.caseLow)}`,play:[['en',q.L]],ask:q.up?QQ.caseUp:QQ.caseLow,explain:letBig(q.L,q.L.toLowerCase())};
    case 'sound':return {pr:`${pic(w,'big')}${qq(q.end?QQ.soundEnd:QQ.sound)}`,play:[['en',w]],ask:q.end?QQ.soundEnd:QQ.sound,explain:`${letBig(q.L,q.L.toLowerCase())}<div class="e2ex">${L_(w)} = ${heOf(w)}</div>`,after:[['en',E2.sayIsFor(q.L,w)]]};
    case 'read':return {pr:`${tiles(w)}${qq(QQ.read)}`,hint:w,ask:QQ.read,explain:`${L_(`<b>${w}</b>`)} = ${heOf(w)}`,after:[['en',w]],noAuto:1};
    case 'spell':return {pr:qq(QQ.spell),play:[['en',w]],ask:QQ.spell,explain:`${L_(`<b>${w}</b>`)} = ${heOf(w)}`,cls:'e2tb'};
    case 'sight':return {pr:qq(QQ.sight),play:[['en',w]],ask:QQ.sight,explain:L_(`<b>${w}</b>`)};
    case 'sent':return {pr:`<div class="e2sent">${wordsHTML(q.s)}</div>${qq(QQ.sent)}`,hint:q.s,karaoke:1,ask:QQ.sent,explain:`<div class="e2ex">${q.he}</div>`,afterK:1,noAuto:1};
    case 'mean':return {pr:`<div class="e2phr">${L_(q.p)}</div>${qq(QQ.mean)}`,play:[['en',q.p]],ask:QQ.mean,explain:`${L_(`<b>${q.p}</b>`)} = ${E2.PH[q.p].he}`};
    case 'sit':return {pr:`<div class="e2sit">${E2.PH[q.p].emo}</div>${qq(q.sit)}`,seq:true,ask:q.sit,explain:`${L_(`<b>${q.p}</b>`)} = ${E2.PH[q.p].he}`,after:[['en',q.p]]};}
  return {pr:''};}
function teachView(c){
  if(c.kind==='word')return {head:'מִלָּה חֲדָשָׁה!',body:`${pic(c.w,'big')}<div class="e2word">${L_(c.w)}</div><div class="e2he">${heOf(c.w)}</div>`};
  if(c.kind==='letter'){const kw=c.w;const hi=c.end?kw.slice(0,-1)+`<b>${kw.slice(-1)}</b>`:`<b>${kw[0]}</b>${kw.slice(1)}`;
    const snd=c.he?`נִשְׁמַעַת כְּמוֹ <b class="e2heL">${c.he}</b>, `:'נִשְׁמַעַת ';
    return {head:'אוֹת חֲדָשָׁה!',body:`${letBig(c.L,c.l)}<div class="e2kw">${pic(kw)}<span class="e2word sm">${L_(hi)}</span></div><div class="e2he e2mean">${c.mean}</div><div class="e2q">הָאוֹת ${L_(c.L)} ${snd}כְּמוֹ ${c.end?'בַּסּוֹף':'בַּהַתְחָלָה'} שֶׁל ${L_(kw)}</div>`};}
  if(c.kind==='cvc')return {head:'מְחַבְּרִים צְלִילִים לְמִלָּה',body:`${tiles(c.w)}${pic(c.w,'big')}<div class="e2he">${L_(c.w)} = ${heOf(c.w)}</div>`,tiles:1};
  if(c.kind==='sight')return {head:'מִלָּה שֶׁרוֹאִים הַרְבֵּה!',body:`<div class="e2word">${L_(c.w)}</div><div class="e2he">${L_(c.ex)} = ${c.exHe}</div>`};
  return {head:'הַקְשֵׁב, וְאָז אֱמֹר בְּקוֹל',body:`<div class="e2sit">${E2.PH[c.p].emo}</div><div class="e2phr">${L_(c.p)}</div><div class="e2he">${E2.PH[c.p].he}</div>`,honor:1};}

/* #54 a short Hebrew clue for the help button ('' = wrong options go away) */
const CLUE={read:'הַקְשֵׁב לַמִּלָּה וּבְחַר אֶת הַתְּמוּנָה שֶׁלָּהּ.',sent:'הַקְשֵׁב לַמִּשְׁפָּט וְחַפֵּשׂ בּוֹ אֶת הַמִּלָּה שֶׁל הַתְּמוּנָה.'};
function clueOf(q){if(CLUE[q.type])return CLUE[q.type];
  if(q.type==='sound'&&E2.LET[q.L].he)return `${q.end?'בַּסּוֹף':'בַּהַתְחָלָה'} יֵשׁ צְלִיל כְּמוֹ <b class="e2heL">${E2.LET[q.L].he}</b>.`;return '';}

/* ---------- one round of a level ---------- */
const NAMES=['eng-voc','eng-abc','eng-read','eng-talk','eng-song'];
const ACTN={'eng-voc':'מִלִּים','eng-abc':'אוֹתִיּוֹת וּצְלִילִים','eng-read':'קוֹרְאִים','eng-talk':'מְדַבְּרִים','eng-song':'שִׁירִים'};
const snapshot=()=>({open:NAMES.map((_,lv)=>E2.levelOpen(O.save,lv)),units:E2.LEVELS.map(L=>L.units.filter(u=>E2.unitDone(O.save,u)).map(u=>u.id)),songs:E2.openSongs(O.save).length});
function doneTitle(a,b){const nl=NAMES.findIndex((_,lv)=>b.open[lv]&&!a.open[lv]);if(nl>0)return `נִפְתַּח מִשְׂחָק חָדָשׁ: ${ACTN[NAMES[nl]]}! 🎉`;
  if(b.songs>a.songs)return 'נִפְתַּח שִׁיר חָדָשׁ! 🎵';
  for(let lv=0;lv<4;lv++){const nu=b.units[lv].find(id=>!a.units[lv].includes(id));if(nu)return `סִיַּמְתָּ: ${E2.UNIT[nu].he}! 🎉`;}return undefined;}
function round(lv,back){hush();const save=O.save,d=E2.day();const P=E2.plan(save,lv,d);const id=NAMES[lv];const before=snapshot();
  const steps=[...P.teach.map(g=>({t:'teach',c:E2.teachCard(g)})),...P.qs.map(s=>({t:'q',s}))];
  const b0={};P.qs.forEach(s=>{if(!(s.k in b0))b0[s.k]=E2.box(save,s.k);});P.teach.forEach(g=>E2.teachCard(g).items.forEach(k=>{b0[k]=0;}));
  const res={};const asked=new Set();
  let i=0,err=0,gems=0,nq=0;O.setScreen('sTal','sea',back);const s=$('#sTal');s.innerHTML='';const wrap=h('div','tq e2');s.appendChild(wrap);
  if(lv===1&&window.LESSONS)s.appendChild(window.LESSONS.againBtn('eng-abc',back,()=>round(1,back)));
  const title=()=>P.unit?P.unit.he:'חֲזָרָה';
  let cur=null;
  function render(){const st=steps[i];hush();T.hudT(title(),T.progressBar(i,steps.length));wrap.innerHTML='';
    if(st.t==='teach')return renderTeach(st.c);renderQ(st.s);}
  function renderTeach(c){const v=teachView(c);window.__e2q=null;E2.touch(save,c.items,d);O.persist();cur={ans:0};
    const card=h('div','prq tqc e2teach',`<div class="e2head">${v.head}</div>${v.body}`);
    const pb=h('button','hintbtn',ICON.say+'<span>שׁוּב</span>');pb.onclick=twice(()=>speakTeach(c,card,v));card.appendChild(pb);wrap.appendChild(card);
    const row=h('div','chs');const go=h('button','chb e2go',v.honor?'🗣️ <span>אָמַרְתִּי!</span>':ICON.play+'<span>הַמְשֵׁךְ</span>');
    go.onclick=()=>{if(go.disabled)return;go.disabled=true;sfx.pop(2);if(v.honor){O.floatText(go,'⭐');O.addGems(1,go);gems+=1;}setTimeout(next,D(v.honor?700:250));};row.appendChild(go);wrap.appendChild(row);
    O.sayNow=T.plainHe(v.head);card.classList.add('flashin');setTimeout(()=>{if(card.isConnected)speakTeach(c,card,v);},D(350));}
  async function speakTeach(c,card,v){const tok=++TOK;
    if(v.tiles){const ts=[...card.querySelectorAll('.e2t')];for(const t of ts){if(tok!==TOK)return;ts.forEach(x=>x.classList.remove('on'));t.classList.add('on');await sleep(D(450));}if(tok!==TOK)return;ts.forEach(x=>x.classList.add('on'));}
    en(c.say);await waitSay(c.say,'en',tok);if(tok===TOK)card.querySelectorAll('.e2t').forEach(x=>x.classList.remove('on'));}
  function renderQ(step){const q=E2.gen(save,step);window.__e2q=q;const v=qView(q);let tries=0,lock=false,hinted=false,fin=false;cur={ans:q.ans};
    const card=h('div','prq tqc',v.pr);
    const playIt=()=>{if(v.seq)return playSeq();if(v.play)return talk(v.play);};
    if(v.play||v.seq){const pb=h('button','hintbtn',ICON.say+`<span>${v.seq?'שׁוּב':'הַשְׁמַע'}</span>`);pb.onclick=twice(()=>playIt());card.appendChild(pb);}
    wrap.appendChild(card);
    const row=h('div','chs'+(q.opts[0].t==='let'||q.opts[0].t==='en'?' ltr':'')+(q.opts.length===4?' e2g4':''));
    q.opts.forEach((o,k)=>{const b=h('button','chb '+optCls(q),optHTML(o));b.onclick=()=>pick(k,b);row.appendChild(b);});wrap.appendChild(row);
    const ex=h('div','hintbox');ex.hidden=true;wrap.appendChild(ex);card.classList.add('flashin');
    O.sayNow=T.plainHe(v.ask||'');
    async function playSeq(){const tok=++TOK;const bs=[...row.children];
      for(let k=0;k<q.opts.length;k++){if(tok!==TOK||lock)break;bs.forEach(b=>b.classList.remove('e2on'));bs[k].classList.add('e2on');en(q.opts[k].v);if(!(await waitSay(q.opts[k].v,'en',tok)))break;await sleep(D(300));}
      bs.forEach(b=>b.classList.remove('e2on'));}
    const first=!asked.has(q.type);asked.add(q.type);
    if(!v.noAuto)setTimeout(async()=>{if(!card.isConnected)return;if(first&&v.ask){await talk([['he',v.ask]]);if(!card.isConnected)return;}playIt();},D(350));
    else if(first&&v.ask)setTimeout(()=>{if(card.isConnected)talk([['he',v.ask]]);},D(350));
    const settle=r=>{const k=q.k;const p=res[k];res[k]=p==='bad'||r==='bad'?'bad':p==='hint'||r==='hint'?'hint':'ok';E2.mark(save,k,res[k],b0[k]|0,d);O.persist();};
    const sayAfter=()=>{if(v.afterK){const tok=++TOK;karaoke(card.querySelector('.e2sent'),q.s,tok);}else if(v.after)talk(v.after);};
    const reveal=()=>{if(v.explain){ex.hidden=false;ex.innerHTML=`<div class="cap"><div class="e2ex">${v.explain}</div></div>`;}sayAfter();};
    /* #54 the one help button: tap 1 = the spoken clue + a short Hebrew clue, tap 2 = the answer + its explanation (the question ends like after two mistakes) */
    const HB=window.HELP&&HELP.mc?HELP.mc(wrap,{row,ans:q.ans,before:ex,explain:v.explain?`<div class="e2ex">${v.explain}</div>`:'',
      clue:()=>{hinted=true;if(v.hint){if(v.karaoke){const tok=++TOK;karaoke(card.querySelector('.e2sent'),v.hint,tok);}else talk([['en',v.hint]]);}else playIt();return clueOf(q);},
      reveal:()=>{if(lock)return;lock=true;hush();if(!fin)err++;settle('bad');nq++;sayAfter();setTimeout(next,D(4200));}}):null;
    function pick(k,b){if(lock||b.disabled)return;
      if(k===q.ans){lock=true;hush();b.classList.add('ok');sfx.ok(i);const g=tries||hinted?1:2;gems+=g;O.addGems(g,b);O.floatText(b,'+'+g);
        if(!tries&&T.skHit)T.skHit(NAMES[lv],!hinted);if(!tries&&KN)KN.hit(NAMES[lv],!hinted);settle(tries?'bad':hinted?'hint':'ok');nq++;reveal();setTimeout(next,D(v.after||v.afterK?2600:1700));return;}
      if(!tries&&T.skHit)T.skHit(NAMES[lv],false);if(!tries&&KN)KN.hit(NAMES[lv],false);tries++;err++;b.classList.add('bad');b.disabled=true;sfx.no();
      if(tries>=2){if(HB&&HB.el.isConnected){fin=true;HB.answer();return;}lock=true;hush();settle('bad');nq++;row.children[q.ans].classList.add('show');reveal();setTimeout(next,D(3000));}}
    }
  function next(){if(!wrap.isConnected)return;i++;if(i>=steps.length){T.setKey(null);const t=doneTitle(before,snapshot());T.finishAct(id,err,Math.max(1,nq),gems,back,()=>round(lv,back),t);}else render();}
  T.setKey(e=>{if(/^[1-9]$/.test(e.key)){const r=wrap.querySelector('.chs');const b=r&&r.children[+e.key-1];if(b)b.click();}});
  window.__quiz={get ans(){return cur&&cur.ans;},get i(){return i;},get wrap(){return wrap;}};
  window.__e2={get step(){return steps[i];},steps,P};
  render();}

/* ---------- songs ---------- */
/* one action: the song he has sung the least (a newly opened song first) */
function songs(back){hush();const list=E2.openSongs(O.save);if(!list.length){he('עוֹד אֵין שִׁיר. קֹדֶם לוֹמְדִים מִלִּים!');const s=$('#sTal');if(s)s.innerHTML='';if(back)back();return;}const g=E2.st(O.save).g;const min=Math.min(...list.map(x=>g[x.th]|0));return sing(list.find(x=>(g[x.th]|0)===min),back);}
function sing(song,back){hush();O.setScreen('sTal','sea',back);T.hudT('אַנְגְּלִית: '+song.he);O.sayNow='הקשב ושיר איתי';const s=$('#sTal');s.innerHTML='';
  const wrap=h('div','tq e2');s.appendChild(wrap);
  const card=h('div','prq tqc e2song',`<div class="e2head">${song.he}</div><div class="e2q">הַקְשֵׁב וְשִׁיר אִתִּי</div>${song.l.map(l=>`<div class="e2line">${wordsHTML(l)}</div>`).join('')}`);wrap.appendChild(card);
  const row=h('div','chs');const go=h('button','chb e2go',ICON.play+'<span>שָׁרִים יַחַד</span>');row.appendChild(go);wrap.appendChild(row);
  let state=0;window.__quiz={ans:0,get i(){return state;},get wrap(){return wrap;}};
  go.onclick=async()=>{if(go.disabled)return;
    if(state===2){T.setKey(null);E2.st(O.save).g[song.th]=(E2.st(O.save).g[song.th]|0)+1;O.persist();T.finishAct('eng-song',0,1,0,back,()=>sing(song,back),'שַׁרְתָּ יָפֶה! 🎵');return;}
    state=1;go.disabled=true;const tok=++TOK;const ls=[...card.querySelectorAll('.e2line')];
    for(const l of ls){if(tok!==TOK)return;ls.forEach(x=>x.classList.remove('cur'));l.classList.add('cur');if(!(await karaoke(l,song.l[ls.indexOf(l)],tok)))return;await sleep(D(350));}
    ls.forEach(x=>x.classList.remove('cur'));state=2;go.disabled=false;go.innerHTML=ICON.play+'<span>הַמְשֵׁךְ</span>';go.classList.add('pulse2');sfx.star(0);};
  T.setKey(e=>{if(e.key==='Enter'||e.key===' ')go.click();});
  setTimeout(()=>{if(card.isConnected&&state===0)talk([['he','הַקְשֵׁב וְשִׁיר אִתִּי']]);},D(300));}

/* ---------- the acts of the 'eng' building ---------- */
const ICONS={'eng-voc':()=>T.X.ball,'eng-abc':()=>T.X.abc,'eng-read':()=>T.X.bookS,'eng-talk':()=>'<span style="font-size:34px">🗣️</span>','eng-song':()=>'<span style="font-size:34px">🎵</span>'};
/* a lesson card before the first letter round (#56): letters, big and small, a letter has a sound */
const LN=window.LESSONS;
if(LN)LN.add('eng-abc',{title:'אוֹתִיּוֹת בְּאַנְגְּלִית',bg:'sea',cards:[
  {art:()=>`<div class="e2let">${L_('A B C')}</div><div class="lcarr">→</div>`,t:'אֵלֶּה אוֹתִיּוֹת בְּאַנְגְּלִית. קוֹרְאִים אוֹתָן מִשְּׂמֹאל לְיָמִין.',after:()=>talk([['en','A, B, C.']])},
  {art:()=>`<div class="lcrow"><div class="e2let e2one">B</div><div class="e2let e2one">b</div></div>`,t:'לְכָל אוֹת יֵשׁ צוּרָה גְּדוֹלָה וְצוּרָה קְטַנָּה. שְׁתֵּיהֶן אוֹתָהּ אוֹת.',after:()=>talk([['en','B']])},
  {art:()=>`<div class="lcrow"><div class="e2let e2one">B</div><div class="e2kw">${pic('ball')}<span class="e2word sm"><b>b</b>all</span></div></div>`,t:'לְכָל אוֹת יֵשׁ צְלִיל. הָאוֹת הַזֹּאת נִשְׁמַעַת כְּמוֹ בּ, כְּמוֹ בַּהַתְחָלָה שֶׁל בּוֹל.',after:()=>talk([['en',E2.sayIsFor('B','ball')]])}]});
const ABC=back=>round(1,back);
/* what Oren knows (#57): the English levels are one ladder. 2 wrong in a row → the level plays the easier one, quietly, until that is known again */
const KN=window.KNOW;
if(KN)KN.area('english',{name:'אנגלית',skills:NAMES.slice(0,4).map(id=>({id,track:'eng',lesson:LN&&id==='eng-abc'?'eng-abc':undefined})),
  asks:[{id:'eng-voc',q:'מכיר מילים בסיסיות באנגלית',skills:['eng-voc']},{id:'eng-abc',q:'מכיר את האותיות באנגלית והצלילים שלהן',skills:['eng-abc']},{id:'eng-read',q:'קורא מילים קצרות באנגלית',skills:['eng-read']}]});
const runLv=(lv,back)=>(lv>=2&&lv<=3&&KN&&KN.stepped(NAMES[lv]))?runLv(lv-1,back):lv===4?songs(back):lv===1&&LN?LN.first('eng-abc',back,()=>ABC(back)):round(lv,back);
const ACTS=NAMES.map((id,lv)=>({id,name:ACTN[id],icon:ICONS[id],avail:()=>lv===4?E2.openSongs(O.save).length>0:E2.levelOpen(O.save,lv),run:back=>runLv(lv,back)}));
function register(){const b=T.BUILD.find(x=>x.id==='eng');if(!b||b._e2)return;b._e2=1;
  b.acts.forEach(a=>{if(T.ACT[a.id]===a)delete T.ACT[a.id];});b.acts=[ACTS[1],ACTS[0],...ACTS.slice(2)];   /* letters and sounds first (#58) */ACTS.forEach(a=>{a.b=b;T.ACT[a.id]=a;});
  b.blurb='לוֹמְדִים אַנְגְּלִית צַעַד אַחַר צַעַד. לוֹחֲצִים עַל הָרַמְקוֹל כְּדֵי לִשְׁמֹעַ.';}
E2.ui={register};
E2.screens={round,songs,sing,pic,ACTS};
})();
