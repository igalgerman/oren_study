/* ===== #414 ONE LEARNING GOAL PER MISSION (injected into index.html by build) =====
   T = the one table: every Talents City activity id + 'math' (+ one per math world, 'w:<world id>', for the lv:<id> levels) ->
   a short kid phrase (full nikud) that follows "הַיּוֹם נִלְמַד". The friend says it once a day per mission at the start
   (FRIEND.goal: after the path's story line, before the screen's instruction; save.gls = {d: day, i: [said keys]}).
   When a mission is finished, daylog.js puts the parent text (no nikud) on its day log line: x.lg (GOALS.plain).
   GOALS.learned(day) = that day's finished goals, once each (for the parent view). GOALS.speakList() = every line (pregen). */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;
const PRE='הַיּוֹם נִלְמַד ';
const G={T:{
 'math':'לִפְתֹּר תַּרְגִּילִים בְּחֶשְׁבּוֹן',
 'w:num':'עַל מִסְפָּרִים: עֲשָׂרוֹת וַאֲחָדוֹת','w:add':'לְחַבֵּר מִסְפָּרִים','w:sub':'לְחַסֵּר מִסְפָּרִים','w:mul':'לְהַכְפִּיל מִסְפָּרִים',
 'w:div':'לְחַלֵּק שָׁוֶה בְּשָׁוֶה','w:word':'לִפְתֹּר סִפּוּרֵי חֶשְׁבּוֹן','w:time':'עַל שָׁעוֹן, צוּרוֹת וּמְדִידָה','w:fin':'לְהִשְׁתַּמֵּשׁ בְּכָל מַה שֶּׁלָּמַדְנוּ',
 /* reading and writing */
 'read-first':'לִמְצֹא אֶת הָאוֹת הָרִאשׁוֹנָה בַּמִּלָּה','read-pw':'לִקְרֹא מִלָּה וְלִמְצֹא אֶת הַתְּמוּנָה שֶׁלָּהּ',
 'read-wp':'לִרְאוֹת תְּמוּנָה וְלִמְצֹא אֶת הַמִּלָּה שֶׁלָּהּ','read-build':'לִבְנוֹת מִלָּה מֵאוֹתִיּוֹת','read-sent':'לִקְרֹא מִשְׁפָּט שָׁלֵם',
 'read-voice':'לִקְרֹא מִלִּים בְּקוֹל רָם','read-rc':'לִקְרֹא וּלְהָבִין מָה קָרָה','read-nik':'לִקְרֹא אוֹתִיּוֹת עִם נִקּוּד',
 'read-sound':'לִשְׁמֹעַ אֶת הַצְּלִיל הָרִאשׁוֹן בַּמִּלָּה','read-flu':'לִקְרֹא מִלִּים מַהֵר וְנָכוֹן','read-rhyme':'אֵילוּ מִלִּים מִתְחָרְזוֹת',
 'write-trace':'לִכְתֹּב אוֹתִיּוֹת בַּדֶּרֶךְ הַנְּכוֹנָה','write-mix':'לִכְתֹּב מִלִּים וּמִשְׁפָּטִים','write-paper':'לִכְתֹּב עַל דַּף אֲמִתִּי',
 'write-spell':'לִכְתֹּב מִלִּים בְּלִי טָעֻיּוֹת',
 /* bedtime stories (the story's own lesson, #355) */
 'story-0':'שֶׁכְּדֵי לִרְאוֹת צָרִיךְ אוֹר','story-1':'שֶׁצֶּמַח צָרִיךְ מַיִם וְאוֹר','story-2':'לָמָּה רוֹאִים כּוֹכָבִים רַק בַּלַּיְלָה',
 'story-3':'לִסְפֹּר בַּעֲשָׂרוֹת','story-4':'שֶׁנְּיָר סוֹפֵג מַיִם, וְעֵץ צָף','story-5':'שֶׁעֲשָׂרָה וְעוֹד חֲמִשָּׁה הֵם חֲמִשָּׁה עָשָׂר',
 'story-6':'שֶׁגֶּשֶׁם יוֹרֵד מֵהָעֲנָנִים וּמַשְׁקֶה צְמָחִים','story-7':'שֶׁכְּלָבִים שׁוֹמְעִים טוֹב מֵאִתָּנוּ',
 'story-8':'לְהֵרָגַע וּלְנַסּוֹת שׁוּב כְּשֶׁמַּשֶּׁהוּ נֶהֱרַס','story-9':'שֶׁגַּם כְּשֶׁמְּפַחֲדִים, אֶפְשָׁר לְנַסּוֹת','story-10':'אֵיךְ נוֹצָר צֵל',
 'story-11':'אֵיךְ דָּג נוֹשֵׁם בַּמַּיִם','story-12':'שֶׁמִּטָּעֻיּוֹת לוֹמְדִים','story-13':'לִסְפֹּר כְּדֵי לָדַעַת מָה חָסֵר',
 'story-14':'שֶׁלְּשַׁתֵּף זֶה כֵּיף יוֹתֵר','story-15':'שֶׁשֶּׁלֶג הוּא מַיִם קְפוּאִים','story-16':'אֵיךְ נוֹצֶרֶת קֶשֶׁת בַּשָּׁמַיִם',
 'story-17':'מִלָּה חֲדָשָׁה: גָּבִישׁ','story-18':'לַעֲזֹר לְמִי שֶׁמִּתְקַשֶּׁה','story-19':'שֶׁמִּי שֶׁלֹּא מְוַתֵּר, מַגִּיעַ',
 'story-new':'לִקְרֹא סִפּוּר וְלִלְמֹד מִמֶּנּוּ דָּבָר חָדָשׁ',
 /* the world, maps and holidays */
 'world-flag':'לְזַהוֹת דְּגָלִים שֶׁל אֲרָצוֹת','world-ani':'אֵיפֹה גָּרוֹת חַיּוֹת בָּעוֹלָם','world-il':'עַל מְקוֹמוֹת בָּאָרֶץ שֶׁלָּנוּ',
 'map-read':'לִקְרֹא מַפָּה','map-il':'לִמְצֹא מְקוֹמוֹת עַל מַפַּת יִשְׂרָאֵל','map-world':'עַל הַיַּבָּשׁוֹת וְהָאוֹקְיָנוֹסִים',
 'map-flags':'לִמְצֹא אֲרָצוֹת עַל הַמַּפָּה לְפִי הַדֶּגֶל','his-then':'מָה הָיָה פַּעַם וּמָה יֵשׁ הַיּוֹם',
 'his-inv':'מָה הִמְצִיאוּ קֹדֶם וּמָה אַחַר כָּךְ','his-old':'אֵיךְ אֲנָשִׁים חָיוּ בִּימֵי קֶדֶם','yr-hol':'עַל הַחַגִּים שֶׁלָּנוּ',
 'yr-order':'אֶת הַסֵּדֶר שֶׁל הַחַגִּים בַּשָּׁנָה','yr-sport':'עַל סוּגֵי סְפּוֹרְט','yr-gk':'דְּבָרִים חֲדָשִׁים עַל הָעוֹלָם',
 /* lab, nature and sky */
 'sci-float':'מָה צָף וּמָה שׁוֹקֵעַ','sci-mag':'מָה מַגְנֵט מוֹשֵׁךְ','sci-animals':'לְמַיֵּן בַּעֲלֵי חַיִּים לִקְבוּצוֹת',
 'sci-body':'עַל הַחֲלָקִים שֶׁל הַגּוּף','sci-plant':'מָה צֶמַח צָרִיךְ כְּדֵי לִגְדֹּל','sci-states':'אֵיךְ מַיִם נִהְיִים קֶרַח וְאֵדִים',
 'sci-day':'לָמָּה יֵשׁ יוֹם וְלַיְלָה','sci-circ':'אֵיךְ נוּרָה נִדְלֶקֶת בְּמַעְגָּל חַשְׁמַלִּי',
 'nat-home':'אֵיפֹה חַיּוֹת גָּרוֹת וּמָה הֵן אוֹכְלוֹת','nat-groups':'לְמַיֵּן חַיּוֹת לְמִשְׁפָּחוֹת','nat-cycle':'אֵיךְ בַּעֲלֵי חַיִּים גְּדֵלִים',
 'nat-il':'עַל הַטֶּבַע בְּיִשְׂרָאֵל','sky-sun':'עַל הַשֶּׁמֶשׁ וְעַל הַיָּרֵחַ','sky-planets':'עַל כּוֹכְבֵי הַלֶּכֶת',
 'sky-order':'אֶת הַסֵּדֶר שֶׁל כּוֹכְבֵי הַלֶּכֶת מֵהַשֶּׁמֶשׁ','sky-astro':'אֵיךְ חַיִּים אַסְטְרוֹנָאוּטִים בֶּחָלָל',
 /* thinking, code and chess */
 'code-maze':'לְתַכְנֵת רוֹבּוֹט צַעַד אַחַר צַעַד','think-sudoku':'לְסַדֵּר כָּל תְּמוּנָה פַּעַם אַחַת בְּכָל שׁוּרָה',
 'think-maze':'לְתַכְנֵן דֶּרֶךְ בְּמָבוֹךְ','think-mem':'לִזְכֹּר אֵיפֹה כָּל תְּמוּנָה','think-pat':'מָה בָּא אַחַר כָּךְ בְּסִדְרָה',
 'think-ana':'לִמְצֹא אֶת הַקֶּשֶׁר בֵּין שְׁנֵי זוּגוֹת','think-ser':'אֵיךְ סִדְרַת מִסְפָּרִים מַמְשִׁיכָה','think-rel':'לִמְצֹא מָה הַקֶּשֶׁר בֵּין דְּבָרִים',
 'think-mat':'לִמְצֹא מָה חָסֵר בַּלּוּחַ','think-sen':'לִבְחֹר מִלָּה שֶׁמַּשְׁלִימָה מִשְׁפָּט','think-test':'לַחְשֹׁב לְאַט עַל שְׁאֵלוֹת קָשׁוֹת',
 'ln-math':'לִפְתֹּר תַּרְגִּילִים בְּרֹאשׁ','ln-paper':'לִפְתֹּר תַּרְגִּילִים עַל דַּף',
 'chess-board':'עַל הַלּוּחַ וְהַכֵּלִים שֶׁל שַׁחְמָט','chess-moves':'אֵיךְ כָּל כְּלִי זָז','chess-capture':'מָתַי כְּלִי יָכוֹל לֶאֱכֹל כְּלִי אַחֵר',
 'chess-check':'מָה זֶה שַׁח','chess-mate':'לָתֵת מַט בְּמַהֲלָךְ אֶחָד','chess-play':'לַחְשֹׁב לִפְנֵי כָּל מַהֲלָךְ',
 /* building */
 'blk-plan':'לִבְנוֹת לְפִי תָּכְנִית','blk-count':'לִסְפֹּר קֻבִּיּוֹת, גַּם כָּאֵלֶּה שֶׁלֹּא רוֹאִים','blk-mirror':'לִבְנוֹת כְּמוֹ בְּמַרְאָה',
 'blk-view':'אֵיךְ דָּבָר נִרְאֶה מִלְמַעְלָה וּמִקָּדִימָה','blk-free':'לְתַכְנֵן וְלִבְנוֹת בְּעַצְמְךָ',
 /* English */
 'en-day':'אוֹתִיּוֹת וּמִלִּים בְּאַנְגְּלִית','eng-voc':'מִלִּים חֲדָשׁוֹת בְּאַנְגְּלִית','eng-abc':'אוֹתִיּוֹת וּצְלִילִים בְּאַנְגְּלִית','eng-read':'לִקְרֹא מִלִּים בְּאַנְגְּלִית',
 'eng-talk':'לְדַבֵּר בְּאַנְגְּלִית','eng-song':'לָשִׁיר בְּאַנְגְּלִית',
 /* music, art, typing, calm */
 'mus-notes':'אֶת הַשֵּׁמוֹת שֶׁל הַתָּוִים','mus-dur':'שֶׁיֵּשׁ תָּוִים אֲרֻכִּים וְתָוִים קְצָרִים','mus-ear':'לִשְׁמֹעַ אִם צְלִיל גָּבוֹהַּ אוֹ נָמוּךְ',
 'mus-rhythm':'לְהַקִּישׁ בַּקֶּצֶב','mus-piano':'לְנַגֵּן שִׁיר עַל פְּסַנְתֵּר','mus2-read':'לִקְרֹא תָּוִים','mus2-ear':'לְהַקְשִׁיב וּלְזַהוֹת צְלִילִים',
 'mus2-rhythm':'לִקְרֹא קֶצֶב מֵהַתָּוִים','mus2-melody':'לְנַגֵּן מַנְגִּינָה מֵהַתָּוִים',
 'art-draw':'לְצַיֵּר בְּרִבּוּעִים קְטַנִּים','art-cbn':'לִפְתֹּר תַּרְגִּיל וְלִצְבֹּעַ לְפִי הַתְּשׁוּבָה',
 'art-mix':'אֵיזֶה צֶבַע יוֹצֵא מִשְּׁנֵי צְבָעִים','art-sym':'מָה זֶה סִימֶטְרִיָּה, כְּמוֹ בְּמַרְאָה',
 'type-lessons':'אֵיפֹה הָאוֹתִיּוֹת עַל הַמִּקְלֶדֶת','type-rain':'לִמְצֹא אוֹתִיּוֹת מַהֵר בַּמִּקְלֶדֶת',
 'mind-breath':'לִנְשֹׁם לְאַט כְּדֵי לְהֵרָגַע','mind-feel':'לָתֵת שֵׁם לָרְגָשׁוֹת שֶׁלָּנוּ','mind-jar':'לִמְצֹא דְּבָרִים טוֹבִים לְהוֹדוֹת עֲלֵיהֶם',
 'mind-sounds':'לְהַקְשִׁיב בְּשֶׁקֶט','mind-scan':'לְהַרְגִּישׁ כָּל חֵלֶק בַּגּוּף'}};
/* the table key of a mission: a math level -> its world (else 'math') */
G.key=id=>{id=String(id||'');if(/^lv:/.test(id)){const lv=(O.ALLLV||[]).find(l=>l.id===id.slice(3));const k=lv&&lv.w?'w:'+lv.w.id:'math';return G.T[k]?k:'math';}return G.T[id]?id:null;};
G.of=id=>{const k=G.key(id);return k?G.T[k]:'';};
G.line=id=>{const g=G.of(id);return g?PRE+g+'.':'';};
G.plain=id=>T.plainHe(G.of(id));
G.speakList=()=>Object.values(G.T).map(g=>PRE+g+'.');
G.learned=day=>{const e=(((O.realSave||O.save).alog||{})[day]||{}).e||[],out=[];
  e.forEach(x=>{const lg=x&&x[6]==='c'&&x[7]&&x[7].lg;if(lg&&!out.includes(lg))out.push(lg);});return out;};
/* the friend says it once a day per mission, when the mission starts (daylog.js emits dlBegin) */
O.on('dlBegin',id=>{const k=G.key(id),F=window.FRIEND;if(!k||!F||!F.goal||O.isParentPlay)return;
  const s=O.save,d=O.today();if(!s.gls||s.gls.d!==d)s.gls={d,i:[]};if(s.gls.i.includes(k))return;s.gls.i.push(k);F.goal(G.line(id));});
/* #430 one end-of-day question for the parent to ask Oren: a fixed list per topic of the goal table (parent text, no nikud).
   askOf(day, [[id, o], ...]) picks, for that day, one topic of his finished missions (o 'c' with a goal) and one question of it. */
G.Q={math:['איזה תרגיל פתרת היום? תראה לי איך','איך אתה בודק שהתשובה נכונה?','מה היה התרגיל הכי קשה היום?'],
 readg:['איזו מילה קראת היום? תקרא לי אותה','איזו אות למדת היום? איזו מילה מתחילה בה?','תכתוב לי מילה אחת שלמדת היום'],
 story:['מה למדת מהסיפור? מה קרה בו?','מה היית עושה במקום הגיבור?'],
 eng:['איזו מילה באנגלית למדת היום?','איך אומרים באנגלית משהו שלמדת היום?'],
 explore:['מה גילית היום שלא ידעת?','איך פתרת את החידה של היום?'],
 create:['מה יצרת היום? תספר לי עליו','מה היה הכי כיף ליצור היום?'],
 calm:['איך הרגשת אחרי התרגיל של השקט?','תראה לי איך נושמים לאט']};
const qTop=k=>{if(k==='math'||/^(w:|ln-)/.test(k))return 'math';if(/^story-/.test(k))return 'story';if(/^(en|eng)-/.test(k))return 'eng';
  const P=window.PDAY,t=P&&P.topOf?P.topOf(k):null;return G.Q[t]?t:null;};
G.askOf=(day,list)=>{const tops=[];(list||[]).forEach(([id,o])=>{const k=o==='c'&&G.key(id);const t=k&&qTop(k);if(t&&!tops.includes(t))tops.push(t);});
  if(!tops.length)return '';const n=parseInt(String(day).replace(/\D/g,''),10)||0;const q=G.Q[tops[n%tops.length]];return q[Math.floor(n/tops.length)%q.length];};
G.ask=day=>G.askOf(day,((((O.realSave||O.save).alog||{})[day]||{}).e||[]).filter(x=>x&&x[7]&&x[7].lg).map(x=>[x[1],x[6]]));
window.GOALS=G;
})();
