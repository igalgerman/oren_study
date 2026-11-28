// Simplicity G1/G6/G7 in the core: kid activity top bar has back + repeat + the music/sound button (#610); hubs keep home/gems; tap targets >=44px.
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
  ok('#610 owner rule: the music/sound button stays on activity screens', t.music, JSON.stringify(t));
  ok('G1 activity: home hidden', !t.home, JSON.stringify(t));
  ok('G1 activity: title chip hidden', !t.chip, JSON.stringify(t));
  ok('G1 activity: back + repeat stay', t.back && t.say, JSON.stringify(t));
  await p.evaluate(() => { window.OREN.setScreen('sTal', 'valley', () => {}); window.OREN.hud(''); });
  t = await bar();
  ok('G1 leaving the activity restores gems + music', t.gems && t.music, JSON.stringify(t));
  // #610: the button on an activity screen has the same 3 states (music / effects only / quiet), and the choice is kept after a reload
  { await p.evaluate(() => { window.OREN.setScreen('sTal', 'city', () => {}); window.TAL.hudT('בְּדִיקָה', ''); });
    const st = []; for (let k = 0; k < 3; k++) { await p.click('#btnMusic'); st.push(await p.evaluate(() => [window.OREN.save.snd, document.querySelector('#btnMusic').title])); }
    ok('#610 activity: the button cycles music -> effects only -> quiet', new Set(st.map(x => x[0])).size === 3 && st.every(x => x[1]), JSON.stringify(st));
    }
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
  /* ---------- P2 kid (docs/simplicity-spec.md) ---------- */
  const btns = () => p.evaluate(() => [...document.querySelectorAll('#sTal button')].filter(b => b.offsetParent !== null).map(b => b.textContent.replace(/\s+/g, ' ').trim()).filter(t => t !== '🔊' && !/הַרְאֵה לִי שׁוּב/.test(t)));   // the small lesson 'show me again' (#258) is not a main action
  // P2.1 code robot: one big "שָׁלָב N ▶" (the next unfinished level), no level grid
  r = await p.evaluate(() => { const T = window.TAL; T.S().code = { 0: 3, 1: 2 }; T.ACT['code-maze'].run(() => window.OREN.showMap()); return { grid: document.querySelectorAll('#sTal .lvb').length, go: [...document.querySelectorAll('#sTal .lvgo')].map(b => b.textContent.trim()) }; });
  ok('P2.1 code menu: no level tiles, one big "שָׁלָב 3" button', r.grid === 0 && r.go.length === 1 && /שָׁלָב 3\b/.test(r.go[0]), JSON.stringify(r));
  ok('P2.1 code menu: that is the only button', (await btns()).length === 1, JSON.stringify(await btns()));
  await p.evaluate(() => document.querySelector('#sTal .lvgo')?.click()); await L.sleep(150);
  ok('P2.1 code menu: the button opens level 3', await p.evaluate(() => !!document.querySelector('#sTal .cboard') && /שָׁלָב 3\b/.test(document.querySelector('#hud').textContent)), await p.evaluate(() => document.querySelector('#hud').textContent));
  // typing lessons: one big "שִׁעוּר N" button
  r = await p.evaluate(() => { const T = window.TAL; T.S().typ = { best: { 0: 2 } }; T.ACT['type-lessons'].run(() => window.OREN.showMap()); return { tiles: document.querySelectorAll('#sTal .actc').length, go: [...document.querySelectorAll('#sTal .lvgo')].map(b => b.textContent.trim()), lsent: !!document.querySelector('#sTal .lsent') }; });
  ok('P2.1 typing: no lesson tiles, one big "שִׁעוּר 2" button', r.tiles === 0 && r.go.length === 1 && /שִׁעוּר 2\b/.test(r.go[0]) && !r.lsent, JSON.stringify(r));
  ok('P2.1 typing: that is the only button', (await btns()).length === 1, JSON.stringify(await btns()));
  // P2.2 pixel editor: 8 colours, 3 tools, one "שְׁמֹר"
  r = await p.evaluate(() => { window.TAL.ACT['art-draw'].run(() => window.OREN.showMap()); const s = document.querySelector('#sTal');
    return { sw: s.querySelectorAll('.pxpal .sw').length, tools: [...s.querySelectorAll('.pxtools .tbtn')].map(b => b.textContent.trim()), big: [...s.querySelectorAll('.btnrow button')].map(b => b.textContent.trim()) }; });
  ok('P2.2 pixel editor: 8 colours', r.sw === 8, JSON.stringify(r));
  ok('P2.2 pixel editor: 3 tools', r.tools.length === 3, JSON.stringify(r.tools));
  ok('P2.2 pixel editor: one "שְׁמֹר" button', r.big.length === 1 && r.big[0] === 'שְׁמֹר', JSON.stringify(r.big));
  // P2.3 colour by number: 6x6, 2-3 colours, single-digit numbers, text >= 18px
  r = await p.evaluate(() => { const T = window.TAL; const out = []; for (let k = 0; k < 8; k++) { T.S().tl['art-cbn'] = { s: 1, n: k }; T.ACT['art-cbn'].run(() => window.OREN.showMap()); const s = document.querySelector('#sTal');
    const cells = [...s.querySelectorAll('.cbn .cbc')]; const txt = cells.filter(c => !c.classList.contains('bg')).map(c => c.textContent);
    out.push({ n: cells.length, cols: s.querySelectorAll('.cleg .lg').length, nums: Object.values(window.__cbn.ans), multi: txt.filter(t => /\d\d/.test(t)), fs: Math.min(...cells.filter(c => !c.classList.contains('bg')).map(c => parseFloat(getComputedStyle(c).fontSize))) }); } delete T.S().tl['art-cbn']; return out; });
  ok('P2.3 colour by number: 6x6 grid', r.every(x => x.n === 36), JSON.stringify(r.map(x => x.n)));
  ok('P2.3 colour by number: 2-3 colours', r.every(x => x.cols >= 2 && x.cols <= 3), JSON.stringify(r.map(x => x.cols)));
  ok('P2.3 colour by number: single-digit numbers only', r.every(x => x.nums.every(n => n >= 1 && n <= 9) && !x.multi.length), JSON.stringify(r.map(x => [x.nums, x.multi])));
  ok('P2.3 colour by number: cell text >= 18px', r.every(x => x.fs >= 18), JSON.stringify(r.map(x => x.fs)));
  // P2.4 piano: first a choice of two big buttons; free play has no recording; song lights the key, no note names
  r = await p.evaluate(() => { window.TAL.ACT['mus-piano'].run(() => window.OREN.showMap()); const s = document.querySelector('#sTal');
    return { modes: [...s.querySelectorAll('.pmode')].map(b => b.textContent.trim()), keys: s.querySelectorAll('.piano').length, all: [...s.querySelectorAll('button')].filter(b => b.textContent.trim() !== '🔊').length }; });
  ok('P2.4 piano: a choice screen with two big buttons 🎹 / 🎵', r.modes.length === 2 && r.modes[0].includes('🎹') && r.modes[1].includes('🎵') && r.keys === 0 && r.all === 2, JSON.stringify(r));
  r = await p.evaluate(() => { document.querySelectorAll('#sTal .pmode')[0]?.click(); const s = document.querySelector('#sTal');
    return { keys: s.querySelectorAll('.piano .pw').length, rec: /הַקְלָטָה|הַשְׁמָעָה/.test(s.textContent), songs: s.querySelectorAll('.acts .actc').length, extra: [...s.querySelectorAll('button')].filter(b => !b.closest('.piano') && b.textContent.trim() !== '🔊').length }; });
  ok('P2.4 piano free play: keys only, no recording, no song list', r.keys >= 8 && !r.rec && !r.songs && r.extra === 0, JSON.stringify(r));
  r = await p.evaluate(() => { window.TAL.ACT['mus-piano'].run(() => window.OREN.showMap()); document.querySelectorAll('#sTal .pmode')[1]?.click(); const s = document.querySelector('#sTal'); const P = window.__piano;
    const lit = [...s.querySelectorAll('.piano .next')].map(k => +k.dataset.m); const names = ['דּוֹ', 'רֶה', 'מִי', 'פָה', 'סוֹל', 'לָה', 'סִי']; return { song: !!P.song, lit, want: P.song && P.song[1][P.pos], noteText: names.filter(n => s.textContent.includes(n)) }; });
  ok('P2.4 piano song: the key to press is lit', r.song && r.lit.length === 1 && r.lit[0] === r.want, JSON.stringify(r));
  ok('P2.4 piano song: no note-name text', !r.noteText.length, JSON.stringify(r.noteText));
  // P2.5 gratitude jar: 6 options
  r = await p.evaluate(() => { window.TAL.ACT['mind-jar'].run(() => window.OREN.showMap()); return document.querySelectorAll('#sTal .thb').length; });
  ok('P2.5 jar: 6 options', r === 6, String(r));
  /* ---------- batch #216: G2 one "▶ הַמְשֵׁךְ", G3 balanced options, G4 one instruction line + one 🔊 ---------- */
  // G2: every kid "next step" button says הַמְשֵׁךְ (no הַבָּא / לַשְּׁאֵלוֹת / לַחִידוֹן / מַמְשִׁיכִים / הַלְאָה ... on a ▶ button)
  { const src = require('fs').readFileSync(require('path').join(L.ROOT, 'index.html'), 'utf8');
    const bad = (src.match(/ICON\.play\s*\+\s*[`'][^`']*<span>(הַבָּא|לַשְּׁאֵלוֹת|לַשְּׁאֵלָה|לַחִידוֹן|לַחִידוֹת|מַמְשִׁיכִים|הַלְאָה|לַמַּסְלוּל|מַתְחִילִים|יוֹצְאִים)[^`']*[`']/g) || []);
    ok('G2 next buttons: always "▶ הַמְשֵׁךְ"', !bad.length, bad.join(' | ')); }
  // balanced rows: never 3+1 (rows differ by at most one, the last row has 2+ when there are several rows)
  const rowsOf = sel => p.evaluate(sel => { const bs = [...document.querySelectorAll(sel)].filter(b => b.offsetParent !== null); const m = {}; bs.forEach(b => { const t = Math.round(b.getBoundingClientRect().top / 8); m[t] = (m[t] || 0) + 1; });
    return Object.keys(m).sort((a, b) => a - b).map(k => m[k]); }, sel);
  const balanced = r => r.length === 1 || (Math.max(...r) - Math.min(...r) <= 1 && r[r.length - 1] >= 2);
  const card = () => p.evaluate(() => { const c = document.querySelector('#sTal .tqc'); const t = c && c.querySelector('.tqi'); const lh = t ? parseFloat(getComputedStyle(t).lineHeight) || parseFloat(getComputedStyle(t).fontSize) * 1.3 : 0;
    return { tqi: t ? t.textContent.trim() : null, top: !!t && c.firstElementChild === t, oneLine: !!t && t.getBoundingClientRect().height <= lh * 1.5, rdb: c ? c.querySelectorAll('.rdb').length : -1,
      say: c ? c.querySelectorAll('.hintbtn').length : -1, lsent: document.querySelectorAll('#sTal .lsent').length }; });
  for (const id of ['read-build', 'write-mix', 'write-spell']) {
    await p.evaluate(id => { window.__said = []; window.TAL.ACT[id].run(() => window.OREN.showMap()); }, id); await L.sleep(300);
    r = await card();
    ok(`G4 ${id}: one instruction line at the top of the card`, r.tqi && r.top && r.oneLine && !r.lsent, JSON.stringify(r));
    ok(`G4 ${id}: one 🔊 in the card`, r.rdb + r.say <= 1, JSON.stringify(r));
    const said = await p.evaluate(() => window.TAL.plainHe(window.OREN.sayNow || ''));
    ok(`G4 ${id}: the instruction is spoken`, said.includes(await p.evaluate(t => window.TAL.plainHe(t), r.tqi || '#')), said);
    const rows = await rowsOf('#sTal .chs .chb');
    ok(`G3 ${id}: letter tiles in balanced rows`, balanced(rows), JSON.stringify(rows));
  }
  // G3: a 4-option question is 4 in a row or 2x2, never 3+1
  await p.evaluate(() => window.TAL.quiz({ id: 'g3test', title: 'בְּדִיקָה', bg: 'city', back: () => window.OREN.showMap(), n: 1, gen: () => ({ pr: '<div class="qq">מָה?</div>', opts: ['אַרְיֵה גָּדוֹל', 'פִּיל אָפֹר', 'גִּ׳ירָפָה', 'זֶבְּרָה'], ans: 0, cls: 'tx' }) })); await L.sleep(200);
  r = await rowsOf('#sTal .chs .chb');
  ok('G3 four options: balanced rows', balanced(r), JSON.stringify(r));
  // G4 story: no per-line 🔊; one 🔊 (read to me) + one "▶ הַמְשֵׁךְ"
  await p.evaluate(() => window.TAL.readStory(0, () => window.OREN.showMap())); await L.sleep(200);
  r = await p.evaluate(() => ({ line: document.querySelectorAll('#sTal .sl .rdb').length, row: [...document.querySelectorAll('#sTal .strow button')].map(b => b.textContent.trim() || b.getAttribute('aria-label')) }));
  ok('G4 story: no per-line 🔊', r.line === 0, JSON.stringify(r));
  ok('G2 story: one 🔊 + "הַמְשֵׁךְ"', r.row.length === 2 && r.row[1] === 'הַמְשֵׁךְ', JSON.stringify(r));
  // G5 journey menu: no locked or 0-star worlds, the next world is one big "▶ הַמְשֵׁךְ"; <= 6 tiles
  const jr = () => p.evaluate(() => { const O = window.OREN; O.showJourney(); const cs = [...document.querySelectorAll('#sMap .worlds > .wcard2')].filter(c => !c.hidden);
    const go = [...document.querySelectorAll('#sMap .jnext')]; return { n: cs.length, names: cs.map(c => c.querySelector('.nm').textContent), locked: cs.filter(c => c.classList.contains('locked')).length,
      go: go.map(b => b.textContent.trim()), w0: O.WORLDS.filter(w => cs.some(c => c.querySelector('.nm').textContent === w.name) && !w.levels.some(l => O.stars(l.id))).length }; });
  await p.evaluate(() => { const O = window.OREN; O.save.s = {}; O.save.set = { brk: 0, hide: {} }; });
  r = await jr();
  ok('G5 journey (fresh): no locked or 0-star world tiles', r.locked === 0 && r.w0 === 0 && r.n <= 6, JSON.stringify(r));
  ok('G5 journey: the next world is one big "הַמְשֵׁךְ"', r.go.length === 1 && r.go[0] === 'הַמְשֵׁךְ', JSON.stringify(r));
  await p.evaluate(() => document.querySelector('#sMap .jnext').click()); await L.sleep(150);
  ok('G5 journey: "הַמְשֵׁךְ" opens the next world', await p.evaluate(() => !document.querySelector('#sWorld').hidden || !document.querySelector('#dlg').hidden));
  await p.evaluate(() => { const O = window.OREN; [O.WORLDS[0], O.WORLDS[2]].forEach(w => { O.save.s[w.levels[0].id] = 2; }); });
  r = await jr();
  ok('G5 journey: worlds with stars show as tiles', r.n === 2 && r.locked === 0 && r.w0 === 0, JSON.stringify(r));
  await p.evaluate(() => { const O = window.OREN; O.save.set.all = 1; }); r = await jr(); await p.evaluate(() => { delete window.OREN.save.set.all; });
  ok('G5 journey: parent "all open" shows every world', r.n === (await p.evaluate(() => window.OREN.WORLDS.length)), JSON.stringify(r));
  // G6: the world screen has no "x / N" star count
  await p.evaluate(() => { const O = window.OREN; O.save.story[O.WORLDS[0].id + '-in'] = 1; O.showWorld(O.WORLDS[0]); });
  r = await p.evaluate(() => document.querySelector('#hud').textContent);
  ok('G6 world screen: no "x / N" count', !/\d+\s*\/\s*\d+/.test(r), r);
  // G7 (phone): kid text >= 16px and tap targets >= 44px on the menus (the 🔊 .rdb has a 44px hit area of its own; the parent button is not for the kid)
  if (L.variant === 'phone') {
    const g7 = () => p.evaluate(() => { const out = []; const vis = e => e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden';
      document.querySelectorAll('#sTal button,#sMap button,#sWorld button').forEach(e => { if (!vis(e) || e.closest('.rdb,.parbtn')) return; const r = e.getBoundingClientRect(); if (r.width < 43.5 || r.height < 43.5) out.push(e.className + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); });
      document.querySelectorAll('#sTal *,#sMap *,#sWorld *').forEach(e => { if (!vis(e) || e.closest('.parbtn,.statline,.reset')) return; if (![...e.childNodes].some(c => c.nodeType === 3 && /[א-ת]/.test(c.textContent))) return; const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 16) out.push((e.parentElement.className || '') + '>' + e.tagName + ' ' + fs + 'px'); });
      return [...new Set(out)]; });
    for (const [nm, fn] of [['hub', () => window.TAL.openHub()], ['journey', () => { const O = window.OREN; O.save.s[O.WORLDS[1].levels[0].id] = 1; O.showJourney(); }], ['world', () => { const O = window.OREN; O.showWorld(O.WORLDS[0]); }],
      ['something else', () => { const T = window.TAL; delete T.S().daily; T.otherDay(); }], ['pixel editor', () => window.TAL.ACT['art-draw'].run(() => window.OREN.showMap())]]) {
      await p.evaluate(fn); await L.sleep(150); r = await g7();
      ok(`G7 phone ${nm}: text >= 16px, taps >= 44px`, !r.length, JSON.stringify(r));
    }
  }
  /* ---------- #8 P3 leftovers (docs/simplicity-spec.md + docs/qa-deep-report.md) ---------- */
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.__arc.open(() => {}); }); await L.sleep(150);
  ok('#8 arcade: no "✨ new" tag on the cabinets', await p.evaluate(() => document.querySelectorAll('#sTal .cab').length === 10 && !document.querySelector('#sTal .hs.new') && !/חָדָשׁ/.test(document.querySelector('#sTal .cabs').textContent)));
  await p.evaluate(() => window.__arc.start('frog')); await L.sleep(300);
  r = await p.evaluate(() => { const bg = e => getComputedStyle(e).backgroundColor; const f = document.querySelector('.jb:not(.back)'), m = document.querySelector('.jb.back'); return { f: bg(f), m: bg(m) }; });
  ok('#8 frog: "−1" is quieter than the forward jumps (not yellow)', r.m !== 'rgb(255, 210, 63)' && r.m !== r.f, JSON.stringify(r));
  await p.evaluate(() => { if (window.__arc.cur) window.__arc.cur.stop(); document.querySelector('#ov').hidden = true; });
  // studio: four rows; the first visit has skin and no hats, later visits hats and no skin; pants gone
  const studioRows = first => p.evaluate(f => { window.OREN.save.gems = 0; window.OREN.studio(f, () => {}); return [...document.querySelectorAll('#sStudio .orow h4')].map(e => e.textContent); }, first);
  const s1 = await studioRows(true), s2 = await studioRows(false);
  ok('#8 studio: 4 rows, first visit hair/skin/shirt/friend', s1.length === 4 && s1.includes('צֶבַע עוֹר') && !s1.includes('כּוֹבַע') && !s1.includes('מִכְנָסַיִם'), s1.join());
  ok('#8/#426 studio: 3 rows later (no skin, no hats)', s2.length === 3 && !s2.includes('כּוֹבַע') && !s2.includes('צֶבַע עוֹר') && !s2.includes('מִכְנָסַיִם'), s2.join());
  r = await p.evaluate(() => ({ sw: Math.min(...[...document.querySelectorAll('#sStudio .sw')].map(e => e.getBoundingClientRect().width)) }));
  if (L.variant === 'phone') ok('#8 studio: colour swatches >= 44px on the phone', r.sw >= 43.5, String(r.sw));
  // reading: the music note "תָּו" is never a picture to guess
  ok('#8 read-first: "תָּו" has no picture (the note looked like other things)', await p.evaluate(() => !window.READBANK2.words.some(w => w.pic === 'note')));
  // a home mission that asks "how many" ends with "tell dad or mom", so "done" fits
  r = await p.evaluate(() => { window.TAL.dailyEnsure().t[0] = 'rw:num'; window.TAL_step(0); return document.querySelector('#sTal .tspec .lsent').textContent; });
  ok('#8 home mission: "how many?" -> "tell dad or mom", then "done"', /סַפֵּר לְאַבָּא אוֹ לְאִמָּא/.test(r), r);
  // play screen: the keypad is under the answer on every screen size (the speed challenge always shows the keypad)
  await p.evaluate(() => window.__oren4.playSpeed(window.OREN.WORLDS[0])); await L.sleep(300);
  r = await p.evaluate(() => { const qa = document.querySelector('#qa').getBoundingClientRect(), pd = document.querySelector('#pad').getBoundingClientRect(); return { qaB: Math.round(qa.bottom), padT: Math.round(pd.top), qaH: Math.round(qa.height) }; });
  ok('#8 play: keypad under the answer slot', r.qaH > 0 && r.padT >= r.qaB, JSON.stringify(r));
  ok('#8 speed challenge: one counter (the time bar), no score box', await p.evaluate(() => !!document.querySelector('#tbar') && !document.querySelector('#sPlay #score')));
  // a stale top-bar label never stays on the next screen
  r = await p.evaluate(() => { const O = window.OREN; document.querySelector('#hudMid').innerHTML = '<div class="chip">old</div>'; O.setScreen('sTal', 'city', () => {}); return document.querySelector('#hudMid').textContent; });
  ok('#8 HUD: the last screen\'s label is cleared on a new screen', !r.includes('old'), r);
  // a building with one activity opens it straight away
  r = await p.evaluate(() => { const T = window.TAL, O = window.OREN; O.save.set.all = 0; O.save.en2 = {}; const b = T.BUILD.find(x => x.id === 'eng'); const n = b.acts.filter(a => (!a.avail || a.avail())).length; T.openBuilding(b); return { n, menu: !!document.querySelector('#sTal .acts') }; });
  ok('#8 one-activity building: no menu, the activity opens', r.n === 1 && !r.menu, JSON.stringify(r));
  // "one more" on a resting door is a real button with an icon
  r = await p.evaluate(() => { window.HEALTH.showRest('read', document.body); const o = document.querySelector('.hlock .hone'); const out = o ? { t: o.textContent, h: o.getBoundingClientRect().height, u: getComputedStyle(o).textDecorationLine } : null; document.querySelectorAll('.hlock').forEach(e => e.remove()); return out; });
  ok('#8 rest: "one more" is an icon button, not an underlined link', r && /⏭️/.test(r.t) && r.h >= 43.5 && r.u !== 'underline', JSON.stringify(r));
  /* ---------- #426 rewards: only stars + gems (gems build the kingdom); badges, hats and records are gone ---------- */
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; const O = window.OREN; O.save.story.intro = 1; O.kingdom(); }); await L.sleep(200);
  r = await p.evaluate(() => ({ btn: [...document.querySelectorAll('.kmine .tool')].map(x => x.textContent), wall: typeof window.TAL.badges }));
  ok('#426 kingdom: no badges button, no badge wall', !r.btn.some(t => /תַּגִּים/.test(t)) && r.btn.some(t => /הַגִּבּוֹר/.test(t)) && r.wall === 'undefined', JSON.stringify(r));
  await L.shot(p, { path: require('path').join(L.SHOTDIR, `426-kingdom-${L.variant}.png`) });
  await p.evaluate(() => window.OREN.studio(false, () => {})); await L.sleep(200);
  r = await p.evaluate(() => ({ rows: [...document.querySelectorAll('#sStudio .orow h4')].map(x => x.textContent), price: document.querySelectorAll('#sStudio .pr').length }));
  ok('#426 studio: no hat row, nothing to buy', !r.rows.some(t => /כּוֹבַע/.test(t)) && r.price === 0 && r.rows.length >= 2, JSON.stringify(r));
  await L.shot(p, { path: require('path').join(L.SHOTDIR, `426-studio-${L.variant}.png`) });
  /* ---------- #661 the friend: name, colour, hat, accessory, age (+ kind) ---------- */
  r = await p.evaluate(() => { const O = window.OREN; O.save.av = { hair: 'brown', skin: 'light', shirt: 'blue', pants: 'jeans', pet: 'cat' }; O.save.story.intro = 1; O.persist();
    const NIK = /[ְ-ׇּׁׂ]/, kinds = { kind: Object.keys(O.PETS).length, colour: O.FCOL.length, hat: O.FHAT.length, acc: O.FACC.length, name: O.FNAME.length, age: O.FAGE.length };
    O.studio(false, () => {}); const rows = [...document.querySelectorAll('#sStudio .frow')]; const pics = rows.map(x => x.querySelectorAll('button').length);
    const base = O.PET().s(); O.save.av.pcol = 'red'; O.save.av.phat = 'cap'; O.save.av.pacc = 'bow'; O.save.av.pname = 'זִיו'; O.save.av.page = 5;
    const dressed = O.PET().s(), hello = window.TAL.friend(), nm = O.PET().n;
    const texts = O.friendTexts(); return { kinds, pics, titles: rows.map(x => x.querySelector('h4').textContent), changed: base !== dressed && hello === dressed, nm, nik: texts.every(t => NIK.test(t)), nt: texts.length, lockedBtn: document.querySelectorAll('#sStudio .frow .lk').length }; });
  ok('#661 friend: 5+ kinds of choices (kind, colour, hat, accessory, name, age), 4+ options each', Object.values(r.kinds).filter(n => n >= 4).length >= 5 && r.pics.length >= 5 && r.pics.every(n => n >= 4), JSON.stringify(r));
  ok('#661 friend: some options are locked until stars are earned', r.lockedBtn >= 3, String(r.lockedBtn));
  ok('#661 friend: colour/hat/accessory change the picture everywhere (home sprite), the chosen name shows, all texts with nikud', r.changed && r.nm === 'זִיו' && r.nik && r.nt >= 8, JSON.stringify(r));
  r = await p.evaluate(() => { const O = window.OREN; O.studio(false, () => {}); window.__saidLast = null; const w = O.say; const names = [...document.querySelectorAll('#sStudio .fname')]; names[0].click(); const sel = document.querySelector('#sStudio .fname.sel'); return { n: O.save.av.pname, sel: sel && sel.textContent, back: Object.values(localStorage).some(v => v.includes('"pname":"' + O.save.av.pname + '"')) }; });
  ok('#661 friend: tapping a name picks it, saves it (in save.av, synced with the hero)', r.n === r.sel && r.back, JSON.stringify(r));
  await p.evaluate(() => { window.OREN.save.av.pcol = 'purple'; window.OREN.save.av.phat = 'wizard'; window.OREN.studio(false, () => {}); }); await L.sleep(200);
  r = await p.evaluate(() => ({ lk: document.querySelectorAll('#sStudio .frow .lk').length, hs: document.documentElement.scrollWidth <= innerWidth + 1 }));
  ok('#661 friend studio: no horizontal overflow', r.hs, JSON.stringify(r));
  await L.shot(p, { path: require('path').join(L.SHOTDIR, `661-friend-${L.variant}.png`), fullPage: true });
  r = await p.evaluate(() => { const T = window.TAL; T.parentPanel('full'); return /תגים/.test(document.querySelector('#sPar').textContent); });
  ok('#426 parent panel: no badge count', !r);
  await p.locator('#sPar .bigbtn', { hasText: 'יציאה' }).click(); await L.sleep(300);
  await p.evaluate(() => { window.__arc.state().best.frog = 5; document.querySelector('#ov').hidden = true; window.__arc.open(() => {}); }); await L.sleep(150);
  ok('#426 arcade cabinets: no record tag', await p.evaluate(() => !/שִׂיא/.test(document.querySelector('#sTal .cabs').textContent) && !document.querySelector('#sTal .hs')));
  const ovRec = () => p.evaluate(() => { const o = document.querySelector('#ov'); const t = o.hidden ? '' : o.textContent; o.hidden = true; return t; });
  await p.evaluate(() => window.__arc.start('frog')); await L.sleep(200); await p.evaluate(() => window.__arc.finish(99)); await L.sleep(300);
  r = await ovRec(); ok('#426 arcade: a new best shows no "record" title', r && !/שִׂיא/.test(r), r);
  await p.evaluate(() => { window.OREN.save.sp = {}; window.__oren4.playSpeed(window.OREN.WORLDS[0]); }); await L.sleep(200);
  await p.evaluate(() => { const q = window.__oren4.play; q.score = 12; q.end = 0; }); await L.sleep(500);
  r = await ovRec(); ok('#426 speed challenge: the end card has no record line', /12/.test(r) && !/שִׂיא/.test(r), r);
  await p.evaluate(() => { window.TAL.S().tl['read-flu'] = { s: 2, n: 1, b: 9 }; window.GAPS.dict = null; window.GAPS.race(() => {}); }); await L.sleep(200);
  r = await p.evaluate(() => document.querySelector('#sTal').textContent);
  ok('#426 word race: the start screen has no record line', !/שִׂיא/.test(r), r);
  await p.evaluate(() => window.GAPS.raceRun(() => {}, null, 9)); await L.sleep(150); await p.evaluate(() => window.__race.end()); await L.sleep(300);
  r = await ovRec(); ok('#426 word race: the end card has no record line', r && !/שִׂיא/.test(r), r);
  // an old save with badges, a bought hat and records still loads; the hat's gems come back once
  r = await p.evaluate(() => { const O = window.OREN; O.mergeIn({ t: Date.now() + 1e6, gems: 5, av: { hair: 'black', skin: 'light', shirt: 'green', hat: 'crown', pet: 'cat' }, owned: { none: 1, cap: 1, crown: 1, helmet: 1 }, bdg: { star1: 1 }, sp: { add: 9 }, arc: { best: { frog: 7 }, plays: 3 } });
    O.hatsBack(); const a = O.save.gems; O.hatsBack(); const svg = O.AV(); return { a, b: O.save.gems, hat: O.save.av.hat, svg: /<svg/.test(svg) }; });
  ok('#426 old save: a bought hat is refunded once (crown 60 + helmet 20), the hero still draws', r.a === 85 && r.b === 85 && !r.hat && r.svg, JSON.stringify(r));
  await p.evaluate(() => window.OREN.showMap());
  ok('no page errors', !errs.length, errs.join(' | '));
  // #610 music is OFF by default (owner, 27 Nov): a fresh save is 'effects only' (snd 1); an old save with music (snd 2) moves to 1 once
  // (flag in the save); after that his own choice is kept after a reload. A reload = a new page that starts from the stored save
  // (a file:// page in a test browser sometimes loses its storage on q.reload(), so the stored text is carried over by hand).
  { const page = async stored => { const c = await b.newContext(L.VIEWPORT);
      await c.addInitScript(s => { window.__fast = true; try { localStorage.clear(); if (s) localStorage.setItem('oren4-v1', s); } catch (e) {} }, stored || null);
      const q = await c.newPage(); await q.goto(L.URL); await L.noCoach(q); return { c, q }; };
    const st = q => q.evaluate(() => [window.OREN.save.snd, window.OREN.save.sndMig610, document.querySelector('#btnMusic').title]);
    const reload = async x => { const s = await x.q.evaluate(() => localStorage.getItem('oren4-v1')); await x.c.close(); return page(s); };
    const tap = async (q, n) => { await q.evaluate(() => { const O = window.OREN; O.showMap(); O.setScreen('sTal', 'city', () => {}); window.TAL.hudT('בְּדִיקָה', ''); });
      for (let k = 0; k < n; k++) await q.click('#btnMusic'); return q.evaluate(() => window.OREN.save.snd); };
    let x = await page(); const fresh = await st(x.q);
    ok('#610 a fresh save starts with no music: effects only (snd 1)', fresh[0] === 1 && fresh[2] === 'רַק צְלִילִים', JSON.stringify(fresh));
    x = await reload(x); const fresh2 = await st(x.q); ok('#610 a fresh save stays without music after a reload', fresh2[0] === 1, JSON.stringify(fresh2)); await x.c.close();
    x = await page(JSON.stringify({ v: 4, snd: 2, t: 1, gems: 7, story: { intro: 1 } })); const old = await st(x.q);
    ok('#610 an old save with music (snd 2) gives effects only (1) after the one-time migration', old[0] === 1 && !!old[1] && (await x.q.evaluate(() => window.OREN.save.gems)) === 7, JSON.stringify(old));
    const want = await tap(x.q, 2);   // 1 -> 0 -> 2
    x = await reload(x); const got = await st(x.q);
    ok('#610 after the migration his own choice (music, 2) is kept after a reload', want === 2 && got[0] === 2 && got[2] === 'מוּזִיקָה וּצְלִילִים', want + ' ' + JSON.stringify(got));
    const w0 = await tap(x.q, 2); x = await reload(x); const g0 = await st(x.q);   // 2 -> 1 -> 0
    ok('#610 the sound choice made on an activity screen is kept after a reload (quiet, 0)', w0 === 0 && g0[0] === 0 && g0[2] === 'שֶׁקֶט', JSON.stringify([w0, g0])); await x.c.close(); }
  await b.close();
  L.finish('simplicity', res);
})();
