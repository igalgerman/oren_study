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
api.first=(ids,back,then)=>run(list(ids).filter(id=>!api.seen(id)),back,then);
api.show=(ids,back,then)=>run(list(ids),back,then);
api.againBtn=(ids,back,then)=>{const b=h('button','lcagain','📖 <span>הַרְאֵה לִי שׁוּב</span>');b.onclick=()=>{sfx.pop(1);api.show(ids,back,then);};return b;};
})();
