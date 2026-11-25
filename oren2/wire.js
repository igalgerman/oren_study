/* ===== WIRING: plugs the content packs into the game. Loaded last by build_talents.py, after every pack. =====
   Each step is guarded: a pack that is missing (or throws) never stops the others. */
(()=>{'use strict';const O=window.OREN,T=window.TAL,W=window;if(!O||!T)return;
const step=(n,f)=>{try{f();}catch(e){console.error('wire '+n+': '+(e&&e.message));}};

/* curriculum gaps: nikud ladder, first sound, spelling, word race in the library / writing house;
   14 more bedtime stories + "why? / what first?" questions for the old ones; final letters in the writing house */
step('gaps',()=>{const G=W.GAPS;if(!G)return;G.register();
  const sb=T.BUILD.find(b=>b.id==='stories');
  if(T.STORIES&&sb&&!T.STORIES._gaps){T.STORIES._gaps=1;
    Object.entries(G.STORY_Q||{}).forEach(([k,qs])=>{const st=T.STORIES[+k];if(st)st.q.push(...qs);});
    G.STORIES.forEach(st=>{const k=T.STORIES.length;T.STORIES.push(st);const a={id:'story-'+k,name:st.t,icon:()=>T.ALLSPR(st.spr[0]),run:back=>T.readStory(k,back),b:sb};sb.acts.push(a);T.ACT[a.id]=a;});}
  if(T.WRITE&&T.WRITE.AB&&G.FINALS)G.FINALS.forEach(f=>{if(!T.WRITE.AB.some(x=>x[0]===f[0]))T.WRITE.AB.push([f[0],f[1]]);});});

/* music hall 2; chess joins the thinking tower */
step('music2',()=>{if(W.MUSIC2)W.MUSIC2.register(T.building);});
step('chess',()=>{if(W.CHESS)W.CHESS.register(T.building);});

/* explore 2: nature → the lab, maps + calendar → the world building, new sky (explore) and blocks (create) */
step('explore2',()=>{const X=W.EXPLORE2;if(!X)return;X.register(T.building,T.GROUPS,{merge:true});
  const nm={lab:'מַעְבָּדָה וְטֶבַע',world:'הָעוֹלָם, מַפּוֹת וְחַגִּים'};T.BUILD.forEach(b=>{if(nm[b.id])b.name=nm[b.id];});});

/* the explore door keeps at most 4 buildings: code and chess move into the thinking tower (activity ids stay) */
step('think-merge',()=>{const th=T.BUILD.find(b=>b.id==='think');if(!th)return;
  ['code','chess'].forEach(id=>{const b=T.BUILD.find(x=>x.id===id);if(!b)return;b.acts.forEach(a=>{a.b=th;if(!th.acts.includes(a))th.acts.push(a);});
    T.BUILD.splice(T.BUILD.indexOf(b),1);T.GROUPS.forEach(g=>{const i=g.ids.indexOf(id);if(i>=0)g.ids.splice(i,1);});});});

/* english 2 replaces the acts of the 'eng' building (same building id) */
step('english2',()=>{if(W.ENGLISH2)W.ENGLISH2.register();});

/* health counts the minutes of every activity: wrap the runs of the activities the packs added or replaced */
step('health',()=>{if(W.HEALTH&&W.HEALTH.wrapRuns)W.HEALTH.wrapRuns();});

/* day log: every activity run opens a log line (after all packs added theirs); path steps he did not reach yesterday */
step('daylog',()=>{const D=W.DAYLOG;if(!D)return;D.wrap();D.pathLeft();});
})();
