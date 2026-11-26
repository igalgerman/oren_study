// Simplicity G1/G6/G7 in the core: kid activity top bar has only back + repeat; hubs keep home/gems; tap targets >=44px.
const L = require('./lib');
const { chromium } = require('playwright');
(async () => {
  const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
  const b = await chromium.launch();
  const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await L.noCoach(p);
  const vis = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && e.offsetParent !== null && getComputedStyle(e).display !== 'none'; }, sel);
  const bar = async () => ({ gems: await vis('#gemc'), music: await vis('#btnMusic'), home: await vis('#btnHome'), chip: await p.evaluate(() => [...document.querySelectorAll('#hudMid .chip')].some(e => e.offsetParent !== null)), say: await vis('#btnSay'), back: await vis('#btnBack') });
  await p.evaluate(() => { const O = window.OREN; O.save.story.intro = 1; window.TAL.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; window.TAL.openHub(); });
  let t = await bar();
  ok('G1 hub keeps gems/music/title area', t.gems && t.music, JSON.stringify(t));
  await p.evaluate(() => window.TAL.quiz ? 0 : 0);
  await p.evaluate(() => window.TAL.openBuilding(window.TAL.BUILD[0]));
  await p.evaluate(() => { const O = window.OREN; O.setScreen('sTal', 'city', () => {}); window.TAL.hudT('בְּדִיקָה', ''); });
  t = await bar();
  ok('G1 activity: gems hidden', !t.gems, JSON.stringify(t));
  ok('G1 activity: music hidden', !t.music, JSON.stringify(t));
  ok('G1 activity: home hidden', !t.home, JSON.stringify(t));
  ok('G1 activity: title chip hidden', !t.chip, JSON.stringify(t));
  ok('G1 activity: back + repeat stay', t.back && t.say, JSON.stringify(t));
  await p.evaluate(() => { window.OREN.setScreen('sTal', 'valley', () => {}); window.OREN.hud(''); });
  t = await bar();
  ok('G1 leaving the activity restores gems + music', t.gems && t.music, JSON.stringify(t));
  // G7: top-bar buttons are at least 44px
  const sz = await p.evaluate(() => ['#btnBack', '#btnSay', '#btnMusic'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return Math.min(r.width, r.height); }));
  ok('G7 top-bar buttons >=44px', sz.every(x => x >= 44), sz.join(','));

  /* ---------- P1 (docs/simplicity-spec.md) ---------- */
  await p.evaluate(() => { const O = window.OREN; O.save.set = { brk: 0, hide: {} }; O.save.prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; window.__said = []; const o = O.say; O.say = (t, ...a) => { window.__said.push(String(t)); return o(t, ...a); }; });
  // P1.1 number series: the missing item is a "?" slot, the answer is not shown
  let r = await p.evaluate(() => { const T = window.TAL; T.ACT['think-ser'].run(() => window.OREN.showMap()); const q = window.__think.q; const sl = [...document.querySelectorAll('#sTal .thser .thi')];
    return { n: sl.length, miss: sl.filter(e => e.classList.contains('miss')).map(e => e.textContent.trim()), atQi: (sl[q.qi] || {}).textContent || '' }; });
  ok('P1.1 series: one "?" slot where the answer goes', r.miss.length === 1 && r.miss[0] === '?' && r.atQi.trim() === '?', JSON.stringify(r));
  // P1.2 "something else": at most 6 big tiles (math, the doors, together), no list of every building; a door drills down
  r = await p.evaluate(() => { const T = window.TAL; delete T.S().daily; T.otherDay(); const names = [...document.querySelectorAll('#sTal .dall .dcard b')].map(x => x.textContent);
    return { names, groups: T.GROUPS.filter(g => names.includes(g.n)).length, blds: T.BUILD.filter(b => names.includes(b.name)).length }; });
  ok('P1.2 something else: <= 6 big tiles', r.names.length >= 4 && r.names.length <= 6, JSON.stringify(r.names));
  ok('P1.2 something else: the doors, not every building', r.groups >= 3 && r.blds === 0, JSON.stringify(r));
  await p.evaluate(() => { const c = [...document.querySelectorAll('#sTal .dall .dcard')].find(x => x.textContent.includes('חוֹקְרִים')); if (c) c.click(); }); await L.sleep(200);
  r = await p.evaluate(() => { const T = window.TAL; const g = T.GROUPS.find(x => x.id === 'explore'); return { names: [...document.querySelectorAll('#sTal .dall .dcard b')].map(x => x.textContent), ids: g.ids.map(id => (T.BUILD.find(b => b.id === id) || {}).name) }; });
  ok('P1.2 a door drills down to its buildings', r.names.length >= 2 && r.names.every(n => r.ids.includes(n)), JSON.stringify(r));
  await p.evaluate(() => { const c = document.querySelector('#sTal .dall .dcard'); if (c) c.click(); }); await L.sleep(200);
  r = await p.evaluate(() => String((window.TAL.S().daily || {}).ch));
  ok('P1.2 picking a building builds the day from it', /^b:/.test(r), r);
  // P1.3 explore door: <= 4 buildings, no "0/24" star counts
  r = await p.evaluate(() => { const T = window.TAL; T.openGroup(T.GROUPS.find(g => g.id === 'explore')); const c = [...document.querySelectorAll('#sTal .bld')]; return { n: c.length, txt: c.map(x => x.textContent) }; });
  ok('P1.3 explore door: <= 4 buildings', r.n >= 2 && r.n <= 4, JSON.stringify(r));
  ok('P1.3 building cards: no "0/24" counts', !r.txt.some(t => /\d+\/\d+/.test(t)), JSON.stringify(r.txt));
  // P1.4 building screen: description spoken not shown, <= 4 tiles at first, one more after trying them all, no word race in the kid menu
  r = await p.evaluate(() => { const T = window.TAL; const b = T.BUILD.find(x => x.id === 'read'); window.__said = []; T.openBuilding(b);
    return { lsent: !!document.querySelector('#sTal .lsent'), tiles: [...document.querySelectorAll('#sTal .actc .an')].map(e => e.textContent), say: T.plainHe(window.OREN.sayNow), blurb: T.plainHe(b.blurb) }; });
  ok('P1.4 building: no description box', !r.lsent, JSON.stringify(r));
  ok('P1.4 building: description is spoken', r.say.includes(r.blurb.slice(0, 10)), r.say);
  ok('P1.4 building: <= 4 tiles at first', r.tiles.length >= 1 && r.tiles.length <= 4, JSON.stringify(r.tiles));
  ok('P1.4 library: no word race (⏱️) for the kid', !r.tiles.some(t => t.includes('מֵרוֹץ')), JSON.stringify(r.tiles));
  r = await p.evaluate(() => { const T = window.TAL; const b = T.BUILD.find(x => x.id === 'read'); T.openBuilding(b); const shown = [...document.querySelectorAll('#sTal .actc')].length;
    const ids = b.acts.filter(a => (!a.avail || a.avail()) && !a.noMenu).slice(0, 8).map(a => a.id); ids.slice(0, shown).forEach(id => { T.S().tl[id] = { s: 1, n: 1 }; });
    T.openBuilding(b); const after = document.querySelectorAll('#sTal .actc').length; T.S().set.all = 1; T.openBuilding(b); const all = document.querySelectorAll('#sTal .actc').length; delete T.S().set.all;
    return { shown, after, all }; });
  ok('P1.4 building: one more tile opens after trying the shown ones', r.after === r.shown + 1, JSON.stringify(r));
  ok('P1.4 building: parent "all open" shows every tile', r.all > r.after, JSON.stringify(r));
  // P1.5 math question: no "challenge" chip, no "לִמּוּד" text button; at most one small 💡
  r = await p.evaluate(() => new Promise(res => { const O = window.OREN; const lv = O.ALLLV.find(l => l.type === 'chal' && (l.u.lesson || l.u.table || l.u.div)); O.save.story[lv.w.id + '-in'] = 1; O.startLevel(lv);
    setTimeout(() => { const s = document.querySelector('#sPlay'); const hb = [...s.querySelectorAll('.hintrow button')]; res({ badge: !!s.querySelector('.badge'), lsn: /לִמּוּד/.test(s.querySelector('.left').textContent), hb: hb.map(b => b.textContent.trim()) }); }, 600); }));
  ok('P1.5 question: no "challenge" chip', !r.badge, JSON.stringify(r));
  ok('P1.5 question: no "לִמּוּד" text button, at most one small 💡', !r.lsn && r.hb.length <= 1 && r.hb.every(t => t === '💡'), JSON.stringify(r));
  // P1.6 nikud ladder intro: the examples are display-only
  r = await p.evaluate(() => { window.GAPS.nikIntro(0, () => window.OREN.showMap()); const ex = [...document.querySelectorAll('#sTal .gp-ex')]; return { n: ex.length, tap: ex.some(e => e.onclick), btn: document.querySelectorAll('#sTal .bigbtn').length }; });
  ok('P1.6 nikud intro: examples display-only, one start button', r.n > 0 && !r.tap && r.btn === 1, JSON.stringify(r));
  // P1.7 reading comprehension: spoken instruction, one audio control (the top 🔊)
  r = await p.evaluate(() => new Promise(res => { window.__said = []; window.TAL.ACT['read-rc'].run(() => window.OREN.showMap());
    setTimeout(() => { const s = document.querySelector('#sTal'); res({ said: window.__said.slice(), say: window.OREN.sayNow, cardBtns: s.querySelectorAll('.tqc button').length }); }, 900); }));
  ok('P1.7 reading: the instruction is spoken', r.said.some(t => /קְרָא|קרא/.test(t) && /תְּשׁוּבָה|תשובה/.test(t)), JSON.stringify(r.said));
  ok('P1.7 reading: one audio control (no button inside the card), 🔊 has something to say', r.cardBtns === 0 && !!r.say, JSON.stringify(r));
  // P1.8 colour mixing: the next button only after a mix
  r = await p.evaluate(() => { window.TAL.ACT['art-mix'].run(() => window.OREN.showMap()); const go = () => { const b = document.querySelector('#sTal .btnrow .bigbtn'); return !!b && !b.hidden && b.offsetParent !== null; };
    const before = go(); const m = document.querySelectorAll('#sTal .mixb'); m[0].click(); m[1].click(); return { before, after: go() }; });
  ok('P1.8 colour mixing: next button only after mixing', !r.before && r.after, JSON.stringify(r));
  // P1.9 breaks: one counter, no clock digits; the button fills as progress (also meals)
  r = await p.evaluate(() => { const H = window.HEALTH; const info = () => { const e = document.querySelector('.hlock'); const b = e.querySelector('.hback'); return { clock: /\d+:\d\d/.test(e.textContent), counters: e.querySelectorAll('.hcnt,.hcd').length, fill: b.style.getPropertyValue('--p') }; };
    const j = (H.showBreak('jump'), info()); const w = (H.showBreak('water'), info()); const m = (H.showMeal(H.MEALS ? H.MEALS[0][0] : 'b'), info()); document.querySelectorAll('.hlock').forEach(e => { clearInterval(e._iv); e.remove(); }); document.body.classList.remove('hlocked'); return { j, w, m }; });
  ok('P1.9 jump break: one counter, no clock', !r.j.clock && r.j.counters === 1, JSON.stringify(r.j));
  ok('P1.9 water break / meal: no clock digits', !r.w.clock && !r.m.clock && r.w.counters === 0 && r.m.counters === 0, JSON.stringify([r.w, r.m]));
  ok('P1.9 break and meal buttons fill as progress', [r.j, r.w, r.m].every(x => x.fill !== ''), JSON.stringify(r));
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close();
  L.finish('simplicity', res);
})();
