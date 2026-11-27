/* ===== THE SHIP (#391): the one place on home that grows (injected into index.html by build) =====
   Story script: oren2/docs/story-mixer.md (#385). At the end of each daily path (the story's finale) Oren gets the next
   ship piece of the script, once a day. Then, with enough gems, ONE tap picks 1 of 2-3 additions (a sea animal, a cloud...).
   save.ship = {n: pieces earned 0..60, x: [addition ids], d: the day of the last piece}; old or broken saves = an empty place.
   The block world (#63/#64) replaces this later: see the PR of #391.
   SHIP.el(cls)   the ship picture (the empty sea when n=0)
   SHIP.award()   the next piece for today, or null (already today / ship complete)
   SHIP.offer(next) the additions choice when there are gems, then next()
   SHIP.says()    every kid sentence (for pregen, registered with T.addSay) */
(()=>{'use strict';const O=window.OREN,T=window.TAL;if(!O||!T)return;const {h,$}=O;
const S=window.SHIP={};
/* the 60 pieces, in the order of the script (one chapter = one part of the ship = 5 pieces) */
const NAMES=[
 'קֶרֶשׁ תַּחְתּוֹן','קֶרֶשׁ צַד','קֶרֶשׁ צַד שֵׁנִי','חַרְטוֹם','צֶבַע כָּחֹל',
 'רִצְפַּת סִפּוּן','מַעֲקֶה','סֻלָּם','שָׁעוֹן','גַּלְגַּל הַצָּלָה',
 'תֹּרֶן','חֶבֶל','סֻלַּם חֲבָלִים','סַל תַּצְפִּית','דֶּגֶל',
 'מִפְרָשׂ קָטָן','מִפְרָשׂ גָּדוֹל','טְלַאי אָדֹם','טְלַאי צָהֹב','חֶבֶל לַמִּפְרָשׂ',
 'הֶגֶה','מַצְפֵּן','מַפָּה','מִשְׁקֶפֶת','פַּעֲמוֹן',
 'עֹגֶן','שַׁרְשֶׁרֶת','מָשׁוֹט','מָשׁוֹט שֵׁנִי','דְּלִי',
 'קִיר לַתָּא','גַּג לַתָּא','דֶּלֶת','חַלּוֹן עָגֹל','אֲרֻבָּה',
 'פָּנָס','פָּנָס שֵׁנִי','שַׁרְשֶׁרֶת אוֹרוֹת','כּוֹכָב זוֹהֵר','יָרֵחַ לַדֶּגֶל',
 'מַדַּף סְפָרִים','שֻׁלְחָן','כָּרִית','תְּמוּנָה','מִטָּה',
 'צוֹפָר','זַרְקוֹר','עָצִיץ','בַּיִת לַצִּפּוֹר','דֶּגֶל שֵׁנִי',
 'סֶרֶט צִבְעוֹנִי','בָּלוֹן','קִשּׁוּט','שַׁרְשֶׁרֶת דְּגָלִים','כּוֹבַע קַבַּרְנִיט',
 'כִּסֵּא לַמְּבַלְבֵּל','שַׁרְשֶׁרֶת בָּלוֹנִים','תֹּף','מַגְלֵשָׁה לַיָּם','שֶׁלֶט שֵׁם'];
S.PIECES=NAMES.map((n,i)=>({n,p:Math.floor(i/5)}));
/* additions bought with gems (one per day, one tap) */
S.EXTRAS=[{id:'fish',e:'🐟',n:'דָּג',x:14,y:86},{id:'dolph',e:'🐬',n:'דּוֹלְפִין',x:100,y:87},{id:'turtle',e:'🐢',n:'צָב',x:58,y:88},
 {id:'crab',e:'🦀',n:'סַרְטָן',x:36,y:88},{id:'bird',e:'🐦',n:'צִפּוֹר',x:32,y:22},{id:'cloud',e:'☁️',n:'עָנָן',x:82,y:12},
 {id:'rainbow',e:'🌈',n:'קֶשֶׁת',x:14,y:12},{id:'octo',e:'🐙',n:'תְּמָנוּן',x:80,y:88},{id:'whale',e:'🐳',n:'לִוְיָתָן',x:112,y:80}];
S.COST=10;
const TITLE='מָה נוֹסִיף לַסְּפִינָה?',NEW=n=>'חֵלֶק חָדָשׁ לַסְּפִינָה: '+n+'!';
S.says=()=>[TITLE,...NAMES.map(NEW)];
T.addSay&&T.addSay(S.says());T.addChoices&&T.addChoices(S.EXTRAS.map(x=>x.n));
S.get=()=>{let s=O.save.ship;if(!s||typeof s!=='object'||Array.isArray(s))s=O.save.ship={n:0,x:[]};
  s.n=Math.max(0,Math.min(NAMES.length,s.n|0));if(!Array.isArray(s.x))s.x=[];s.x=s.x.filter((id,i,a)=>S.EXTRAS.some(e=>e.id===id)&&a.indexOf(id)===i);return s;};
S.award=()=>{const s=S.get(),d=O.today();if(s.d===d||s.n>=NAMES.length)return null;s.n++;s.d=d;O.persist();return S.PIECES[s.n-1];};
/* the drawing: 12 parts (viewBox 120x92, bow on the left); a part shows from the bottom up, one fifth per piece */
const PART=[
 [54,76,'<path d="M10 58H110L98 75H24Z" fill="#8a5a2b" stroke="#5b3a1a" stroke-width="1.5"/><path d="M14 63H106M18 68H102" stroke="#5b3a1a"/><path d="M24 75L98 75" stroke="#3a8fc4" stroke-width="3"/>'],
 [44,59,'<rect x="12" y="54" width="96" height="4" fill="#c08a4e"/><path d="M14 47H104M14 47V54M26 47V54M38 47V54M50 47V54M86 47V54M98 47V54" stroke="#6b4423" stroke-width="1.5"/>'],
 [4,56,'<rect x="57" y="8" width="4" height="47" fill="#6b4423"/><rect x="53" y="12" width="12" height="5" fill="#a0703d"/><path d="M61 9L104 47" stroke="#8b6b4a"/>'],
 [10,46,'<path d="M56 12V43H26Z" fill="#fff" stroke="#c9c9c9"/><path d="M62 18V42H80Z" fill="#fff" stroke="#c9c9c9"/><rect x="40" y="32" width="5" height="4" fill="#e04848"/><rect x="47" y="26" width="5" height="4" fill="#f2c230"/>'],
 [40,55,'<circle cx="72" cy="47" r="5" fill="none" stroke="#6b4423" stroke-width="2"/><path d="M72 41V53M66 47H78" stroke="#6b4423"/>'],
 [56,86,'<path d="M24 60V70M20 66Q24 72 28 66" stroke="#555" stroke-width="2" fill="none"/><circle cx="24" cy="59" r="1.8" fill="none" stroke="#555"/><path d="M44 62L36 84M76 62L84 84" stroke="#a0703d" stroke-width="2.5"/>'],
 [28,55,'<rect x="82" y="42" width="20" height="12" fill="#d9a066" stroke="#8a5a2b"/><path d="M80 42L92 34L104 42Z" fill="#c0392b"/><rect x="96" y="30" width="4" height="7" fill="#777"/>'],
 [4,50,'<circle cx="20" cy="45" r="2" fill="#ffd34d"/><circle cx="34" cy="45" r="2" fill="#ffd34d"/><circle cx="46" cy="45" r="2" fill="#ffd34d"/><circle cx="59" cy="6" r="2.5" fill="#ffd34d"/>'],
 [42,54,'<rect x="85" y="45" width="6" height="5" fill="#ffe58a" stroke="#8a5a2b"/><rect x="94" y="45" width="5" height="9" fill="#8a5a2b"/>'],
 [42,54,'<rect x="38" y="49" width="6" height="5" fill="#c0603b"/><circle cx="41" cy="46" r="3" fill="#e86aa6"/><path d="M26 54V47L31 45V50Z" fill="#f2c230"/>'],
 [6,56,'<path d="M59 10L12 54M61 10L106 46" stroke="#555" stroke-width=".6"/><path d="M48 20l-3 5h5zM36 31l-3 5h5zM24 42l-3 5h5zM72 21l3 5h-5zM84 32l3 5h-5zM96 42l3 5h-5z" fill="#e04848"/>'],
 [6,40,'<path d="M104 38V22M110 38V16" stroke="#777" stroke-width=".6"/><circle cx="104" cy="18" r="4" fill="#e86aa6"/><circle cx="110" cy="12" r="4" fill="#4fae4f"/>']];
let uid=0;
S.el=(cls)=>{const s=S.get(),id='sh'+(++uid);let defs='',use='';
  for(let i=0;i<s.n;i++){const [y0,y1,g]=PART[Math.floor(i/5)],j=i%5,bh=(y1-y0)/5,top=y1-(j+1)*bh;
    if(j===0)defs+='<g id="'+id+'p'+Math.floor(i/5)+'">'+g+'</g>';
    defs+='<clipPath id="'+id+'c'+i+'"><rect x="0" y="'+(top-.3).toFixed(1)+'" width="120" height="'+(bh+.6).toFixed(1)+'"/></clipPath>';
    use+='<use class="shp" href="#'+id+'p'+Math.floor(i/5)+'" clip-path="url(#'+id+'c'+i+')"/>';}
  const ex=s.x.map(k=>S.EXTRAS.find(e=>e.id===k)).map(e=>'<text class="shx" x="'+e.x+'" y="'+e.y+'" font-size="14" text-anchor="middle">'+e.e+'</text>').join('');
  return '<div class="hship'+(cls?' '+cls:'')+'" role="img" aria-label="הַסְּפִינָה"><svg viewBox="0 0 120 92"><defs>'+defs+'</defs>'+
    '<rect x="0" y="72" width="120" height="20" rx="4" fill="#5fb3e6"/><path d="M4 76q6-3 12 0t12 0M64 80q6-3 12 0t12 0M30 86q6-3 12 0t12 0" stroke="#d6f0ff" fill="none"/>'+use+ex+'</svg></div>';};
/* the finale card: the new piece + the ship */
S.cardHTML=pc=>pc?'<div class="shnew">'+NEW(pc.n)+'</div>'+S.el('big'):'';
S.newSay=pc=>pc?NEW(pc.n):'';
/* the day's gems: one tap on 1 of up to 3 additions, then next() */
S.offer=next=>{const s=S.get(),left=S.EXTRAS.filter(e=>!s.x.includes(e.id));if((O.save.gems|0)<S.COST||left.length<2){next();return;}
  const opts=O.shuffle(left.slice()).slice(0,3),ov=$('#ov');ov.hidden=false;
  ov.innerHTML='<div class="card shcard"><h2>'+TITLE+'</h2>'+S.el('big')+'</div>';
  const row=h('div','btnrow shpick');const gem=O.SPR&&O.SPR.gem||'💎';
  opts.forEach(e=>{const b=h('button','bigbtn plain','<span class="shem">'+e.e+'</span><b>'+e.n+'</b><small>'+gem+S.COST+'</small>');b.dataset.id=e.id;
    b.onclick=()=>{if(b.disabled)return;row.querySelectorAll('button').forEach(x=>x.disabled=true);O.save.gems=Math.max(0,(O.save.gems|0)-S.COST);s.x.push(e.id);O.persist();O.updateGems&&O.updateGems(true);
      O.sfx&&O.sfx.win&&O.sfx.win();ov.hidden=true;next();};row.appendChild(b);});
  ov.firstChild.appendChild(row);O.say(T.spk(TITLE)+T.choiceSay(row,'b'));};
})();
