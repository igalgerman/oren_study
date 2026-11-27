// QA fixes: lesson example is a real question (3 answers, hint, then "your turn"), place-value blocks, coach remembered after
// a reload, parent sandbox without tour/intros, home has one main action (doors inside "something else"), world screen with one
// "continue" button, compact parent "today", one companion (studio pet), back button / browser back.
const L = require('./lib');
const { chromium } = require('playwright'); const sleep = L.sleep;
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { window.__fast = true; window.__noFamily = true; });
  let p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await p.evaluate(() => localStorage.clear()); await p.reload();
  await p.waitForFunction(() => window.TAL && window.OREN);
  await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { col: '#3a8fc4', love: 'art' }; O.persist(); });
  // --- lesson: question + 3 big answers, no input box, one button only after answering ---
  await p.evaluate(() => { const O = window.OREN; O.startLevel(O.ALLLV.find(l => l.id === 'add-0-0')); }); await sleep(200);
  let l = await p.evaluate(() => ({ ch: document.querySelectorAll('#sLearn .lch .chb').length, box: document.querySelectorAll('#sLearn .ans.empty').length, btn: document.querySelectorAll('#sLearn .bigbtn').length }));
  ok('lesson: 3 answers, no input box, no button yet', l.ch === 3 && l.box === 0 && l.btn === 0, JSON.stringify(l));
  // find a run where the first two taps are wrong (the order is random)
  let r1 = null, r2 = null;
  for (let k = 0; k < 30 && !r2; k++) {
    await p.evaluate(() => { const O = window.OREN; delete O.save.seen['add-0']; O.startLevel(O.ALLLV.find(l => l.id === 'add-0-0')); }); await sleep(100);
    r1 = await p.evaluate(() => { const bs = document.querySelectorAll('#sLearn .lch .chb'); bs[0].click(); return { hint: !document.querySelector('#sLearn .hintbox').hidden, btn: document.querySelectorAll('#sLearn .bigbtn').length, ok: bs[0].classList.contains('ok') }; });
    if (r1.ok) continue;
    const t = await p.evaluate(() => { const bs = document.querySelectorAll('#sLearn .lch .chb'); bs[1].click(); return { ok: bs[1].classList.contains('ok'), show: !!document.querySelector('#sLearn .lch .chb.show'), btn: [...document.querySelectorAll('#sLearn .bigbtn')].map(x => x.textContent.trim()) }; });
    if (!t.ok) r2 = t; }
  ok('lesson: wrong → hint, still no button', r1 && r1.hint && r1.btn === 0, JSON.stringify(r1));
  ok('lesson: 2nd wrong → right answer lit + one "your turn" button', r2 && r2.show && r2.btn.length === 1 && /תּוֹרְךָ/.test(r2.btn[0]), JSON.stringify(r2));
  await p.locator('#sLearn .bigbtn').click(); await sleep(150);
  ok('lesson: "your turn" starts the practice', await p.evaluate(() => !document.querySelector('#sPlay').hidden));
  // place value: tens sticks on the left, ones on the right
  await p.evaluate(() => { const O = window.OREN; delete O.save.seen['num-pv2']; O.startLevel(O.ALLLV.find(l => l.id === 'num-pv2-0')); }); await sleep(200);
  const pv = await p.evaluate(() => { const t = document.querySelector('#sLearn .mblk .mbt'), o = document.querySelector('#sLearn .mblk .mbo'); if (!t || !o) return null;
    return { left: t.getBoundingClientRect().left < o.getBoundingClientRect().left, rods: t.children.length, ones: o.children.length, x: /×/.test(document.querySelector('#sLearn').textContent) }; });
  ok('place value lesson: sticks left of cubes, no ×', pv && pv.left && pv.rods >= 2 && pv.ones >= 1 && !pv.x, JSON.stringify(pv));
  // --- #267 hands-on math: Oren does the bundle / break himself (no watch-only animation) ---
  const startLesson = id => p.evaluate(id => { const O = window.OREN; delete O.save.seen[id]; O.startLevel(O.ALLLV.find(l => l.id === id + '-0')); }, id);
  const board = () => p.evaluate(() => { const b = document.querySelector('#sLearn .mbh'); if (!b) return null; const row = document.querySelector('#sLearn .lch');
    return { carry: b.dataset.carry === '1', borrow: b.dataset.borrow === '1', rods: b.querySelectorAll('.mbt .rod:not(.take)').length, newRod: b.querySelectorAll('.mbt .rod.new').length,
      ones: b.querySelectorAll('.mbo .one:not(.gst):not(.take)').length, ghosts: b.querySelectorAll('.mbo .one.gst').length, glow: b.querySelectorAll('.mbo .one.b10').length,
      took: b.querySelectorAll('.take').length, done: b.classList.contains('done'), rowHidden: !row || row.hidden || !row.offsetParent }; });
  const tapNext = () => p.evaluate(() => { const n = document.querySelector('#sLearn .mbh .nxt'); if (n) n.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!n; });
  let cb = null; for (let k = 0; k < 30; k++) { await startLesson('add-8'); await sleep(150); cb = await board(); if (cb && cb.carry) break; }
  await sleep(400); const cb0 = await board();
  ok('#20 carry lesson: the board waits for Oren (no stick appears by itself, answers hidden)', cb0 && cb0.carry && cb0.newRod === 0 && cb0.ghosts > 0 && cb0.rowHidden, JSON.stringify(cb0));
  let glowAt = null; for (let k = 0; k < 12; k++) { const s = await board(); if (s.glow === 10) { glowAt = s; break; } if (!await tapNext()) break; await sleep(30); }
  ok('#20 carry: tapping adds the cubes one by one, 10 loose cubes light up', glowAt && glowAt.glow === 10 && glowAt.newRod === 0, JSON.stringify(glowAt));
  await p.evaluate(() => document.querySelector('#sLearn .mbh .one.b10').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await sleep(60);
  const cb1 = await board();
  ok('#20 carry: tapping the 10 cubes bundles them into one stick', cb1.newRod === 1 && cb1.ones < 10 && cb1.glow === 0, JSON.stringify(cb1));
  for (let k = 0; k < 12 && await tapNext(); k++) await sleep(30);
  const cb2 = await board();
  ok('#20 carry: board done → the answers appear to count and answer', cb2.done && !cb2.rowHidden && cb2.ghosts === 0, JSON.stringify(cb2));
  let sb = null; for (let k = 0; k < 30; k++) { await startLesson('sub-10'); await sleep(150); sb = await board(); if (sb && sb.borrow) break; }
  ok('#20 borrow lesson: waits for Oren, answers hidden', sb && sb.borrow && sb.took === 0 && sb.rowHidden, JSON.stringify(sb));
  const o0 = sb.ones; await p.evaluate(() => document.querySelector('#sLearn .mbh .mbo .one').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await sleep(60);
  const sb1 = await board();
  ok('#20 borrow: not enough cubes → a cube tap takes nothing yet', sb1.took === 0 && sb1.ones === o0, JSON.stringify(sb1));
  await p.evaluate(() => { const r = document.querySelectorAll('#sLearn .mbh .mbt .rod'); r[r.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(60);
  const sb2 = await board();
  ok('#20 borrow: tapping a stick breaks it into 10 cubes', sb2.rods === sb.rods - 1 && sb2.ones === o0 + 10, JSON.stringify(sb2));
  for (let k = 0; k < 20 && await tapNext(); k++) await sleep(30);
  const sb3 = await board();
  ok('#20 borrow: Oren takes the cubes and sticks away himself, then the answers appear', sb3.done && sb3.took > 0 && !sb3.rowHidden, JSON.stringify(sb3));
  const hb = await p.evaluate(() => { const O = window.__oren4; O.playLevel(O.ALLLV.find(l => l.id === 'add-8-1'), [{ k: 'bin', l: 27, op: '+', r: 15, res: 42, miss: 'res', ans: 42 }]);
    const h = O.hintHTML(O.play.qs[0], 1); const d = document.createElement('div'); d.id = 'hbtest'; d.innerHTML = h; document.querySelector('#sPlay').appendChild(d);
    const b = d.querySelector('.mbh'); return { has: !!b, ghosts: b ? b.querySelectorAll('.one.gst').length : 0 }; });
  await p.evaluate(() => { const n = document.querySelector('#hbtest .mbh .nxt'); if (n) n.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(40);
  const hb2 = await p.evaluate(() => { const b = document.querySelector('#hbtest .mbh'); const r = b ? b.querySelectorAll('.one.gst').length : -1; document.querySelector('#hbtest').remove(); return r; });
  ok('#20 the hint of a carry question opens the same tappable board', hb.has && hb.ghosts === 5 && hb2 === 4, JSON.stringify(hb) + ' after tap ' + hb2);
  // --- #267 fix: a lesson example is never a hands-on question (its single check button would always win) ---
  const lx = await p.evaluate(() => { const O = window.OREN, out = [];
    for (const id of ['time-h', 'time-half', 'time-q', 'time-frac']) for (let k = 0; k < 25; k++) { delete O.save.seen[id]; O.startLevel(O.ALLLV.find(l => l.id === id + '-0'));
      if (document.querySelector('#sLearn svg.clock.set, #sLearn svg.pz')) out.push(id); }
    return out; });
  ok('#267 time and fraction lessons never show the hands-on clock or pizza (100 lessons)', !lx.length, lx.join(','));
  // --- #21 times lesson: tap the array to add a whole group; no "one more group" button ---
  await p.evaluate(() => { const O = window.OREN; delete O.save.seen['mul-5']; O.startLevel(O.ALLLV.find(l => l.id === 'mul-5-0')); }); await sleep(150);
  const rows = () => p.evaluate(() => ({ n: document.querySelectorAll('#sLearn .lpanel .arr .r').length, nw: document.querySelectorAll('#sLearn .lpanel .arr .r.nw').length,
    btns: [...document.querySelectorAll('#sLearn .btnrow .bigbtn')].filter(x => !x.hidden).map(x => x.textContent.trim()) }));
  const m0 = await rows();
  ok('#21 times lesson: one row, no "עוֹד קְבוּצָה" button, "לַתִּרְגּוּל" stays', m0.n === 1 && !m0.btns.some(t => /עוֹד קְבוּצָה/.test(t)) && m0.btns.some(t => /לַתִּרְגּוּל/.test(t)), JSON.stringify(m0));
  const tapArr = () => p.evaluate(() => document.querySelector('#sLearn .lpanel .arr').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await tapArr(); await sleep(30); const m1 = await rows();
  ok('#21 tapping the array adds one whole group, the new row flashes', m1.n === 2 && m1.nw === 1, JSON.stringify(m1));
  for (let k = 0; k < 12; k++) { await tapArr(); await sleep(20); }
  const m2 = await rows();
  ok('#21 rows stop at 10; then "now your turn"', m2.n === 10 && m2.btns.length === 1 && /תּוֹרְךָ/.test(m2.btns[0]), JSON.stringify(m2));
  const ah = await p.evaluate(() => { const O = window.__oren4; O.playLevel(O.ALLLV.find(l => l.id === 'mul-5-1'), [{ k: 'bin', l: 4, op: '×', r: 3, res: 12, miss: 'res', ans: 12, f: [3, 4] }]);
    const d = document.createElement('div'); d.id = 'ahtest'; d.innerHTML = O.hintHTML(O.play.qs[0], 1); document.querySelector('#sPlay').appendChild(d);
    const a = d.querySelector('.arr.tap'); const n0 = a ? a.querySelectorAll('.r').length : -1; const out = [n0];
    for (let k = 0; k < 6; k++) { if (a) a.dispatchEvent(new MouseEvent('click', { bubbles: true })); out.push(a.querySelectorAll('.r').length); } d.remove(); return out; });
  ok('#21 the hint of a times question opens the same tappable array (up to the number of groups)', ah[0] === 1 && ah[1] === 2 && ah[ah.length - 1] === 4, JSON.stringify(ah));
  // --- #18 turnable clock: drag the hands, minute snaps to 5, hour hand follows ---
  const hd = await p.evaluate(() => { const H = window.__oren4.HANDS; return {
    snap: [0, 14, 32, 177, 358, 92].map(H.snap),
    fwd: H.min(3 * 60 + 55, 0), back: H.min(4 * 60, 55), half: H.min(3 * 60, 30), hr: H.hour(3 * 60 + 30, 7.4), ang: H.ang(3 * 60 + 30) }; });
  ok('#18 minute hand snaps to 5 minutes', JSON.stringify(hd.snap) === JSON.stringify([0, 0, 5, 30, 0, 15]), JSON.stringify(hd.snap));
  ok('#18 hour hand follows the minute hand (3:55 → past 12 → 4:00, back → 3:55, 3:30 = hour hand half way)', hd.fwd === 240 && hd.back === 235 && hd.half === 210 && hd.ang.h === 105 && hd.ang.m === 180 && hd.hr === 7 * 60 + 30, JSON.stringify(hd));
  const startSet = (h, m) => p.evaluate(([h, m]) => { const O = window.__oren4; O.playLevel(O.ALLLV.find(l => l.id === 'time-half-1'), [O.GT.set([m], h, m)]); }, [h, m]);
  await startSet(3, 30); await sleep(150);
  const cg = await p.evaluate(() => { const s = document.querySelector('#qa svg.clock.set'); const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2, t: window.__oren4.play.qs[0].chk.t }; });
  const at = (deg, f) => [cg.x + f * cg.R * Math.sin(deg * Math.PI / 180), cg.y - f * cg.R * Math.cos(deg * Math.PI / 180)];
  const drag = async (a0, a1, f) => { await p.mouse.move(...at(a0, f)); await p.mouse.down(); for (let k = 1; k <= 12; k++) await p.mouse.move(...at(a0 + (a1 - a0) * k / 12, f)); await p.mouse.up(); await sleep(40); };
  const T = () => p.evaluate(() => +document.querySelector('#qa svg.clock.set').dataset.t);
  await drag(0, 178, .72); const t1 = await T();
  ok('#18 dragging the minute hand to 6 sets :30 and the hour hand moves with it', cg.t === 'setclock' && t1 === 30, String(t1));
  const wrong = await p.evaluate(() => { const P = window.__oren4.play; P.choice.row.children[0].click(); return { tries: P.tries, dis: P.choice.row.children[0].disabled, i: P.i }; }); await sleep(700);
  ok('#18 check with the wrong time = a wrong answer (existing hint flow), the check button stays', wrong.tries === 1 && !wrong.dis && wrong.i === 0, JSON.stringify(wrong));
  await drag(15, 105, .4); const t2 = await T();
  ok('#18 dragging the hour hand sets the hour (3:30)', t2 === 210, String(t2));
  const right = await p.evaluate(() => { const P = window.__oren4.play; P.choice.row.children[0].click(); return { lock: P.lock, i: P.i }; });
  ok('#18 check with the right time = correct', right.lock, JSON.stringify(right));
  // --- #19 pizza: tap slices to eat, tap again to put back; check the eaten part ---
  await p.evaluate(() => { const O = window.__oren4; O.playLevel(O.ALLLV.find(l => l.id === 'time-frac-1'), [O.GT.pz('eat', 4)]); }); await sleep(150);
  const slice = i => p.evaluate(i => { document.querySelectorAll('#qa svg.pz .sl')[i].dispatchEvent(new MouseEvent('click', { bubbles: true })); return document.querySelectorAll('#qa svg.pz .sl.eat').length; }, i);
  const pz = { n: await p.evaluate(() => document.querySelectorAll('#qa svg.pz .sl').length), a: await slice(0), b: await slice(1), c: await slice(1) };
  ok('#19 pizza in 4 slices: tap eats a slice, tapping it again puts it back', pz.n === 4 && pz.a === 1 && pz.b === 2 && pz.c === 1, JSON.stringify(pz));
  await slice(2); const pw = await p.evaluate(() => { const P = window.__oren4.play; P.choice.row.children[0].click(); return { tries: P.tries, lock: P.lock }; }); await sleep(700);
  ok('#19 "eat a quarter" with 2 slices eaten = wrong', pw.tries === 1 && !pw.lock, JSON.stringify(pw));
  await slice(2); const pr = await p.evaluate(() => { const P = window.__oren4.play; P.choice.row.children[0].click(); return { lock: P.lock }; });
  ok('#19 "eat a quarter" with 1 slice eaten = correct', pr.lock, JSON.stringify(pr));
  const pl = await p.evaluate(() => { const O = window.__oren4, q = O.GT.pz('left', 3); O.playLevel(O.ALLLV.find(l => l.id === 'time-frac-1'), [q]);
    return { opts: q.opts, right: q.opts[q.ans], sl: document.querySelectorAll('#qa svg.pz .sl').length, pr: q.pr.replace(/<svg[\s\S]*<\/svg>/, '') }; });
  ok('#19 "slices left": a third eaten from 3 slices → 2 left', pl.sl === 3 && String(pl.right) === '2' && /נִשְׁאֲרוּ/.test(pl.pr), JSON.stringify(pl));
  // --- world: one big continue button, path from the right ---
  await p.evaluate(() => { const O = window.OREN; O.save.story['num-in'] = 1; O.save.s = {}; O.showWorld(O.WORLDS[0]); }); await sleep(200);
  const w = await p.evaluate(() => { const n = [...document.querySelectorAll('#sWorld .pnode')]; return { big: document.querySelectorAll('#sWorld .bigbtn').length, cur: n.findIndex(x => x.classList.contains('cur')),
    rtl: n[0].getBoundingClientRect().left > n[1].getBoundingClientRect().left, kl: n[0].querySelector('.kl').textContent }; });
  ok('world: one big button, first node current and on the right, kind label', w.big === 1 && w.cur === 0 && w.rtl && /לוֹמְדִים/.test(w.kl), JSON.stringify(w));
  await p.evaluate(() => document.querySelectorAll('#sWorld .pnode')[4].click()); await sleep(100);
  ok('world: a future node does not start', await p.evaluate(() => !document.querySelector('#sWorld').hidden));
  // --- home: one main action; doors inside "something else"; path icons not buttons ---
  await p.evaluate(() => { const T = window.TAL; T.S().coach = { tour: 1 }; T.chooseDay('math'); window.OREN.showMap(); }); await sleep(300);
  const hm = await p.evaluate(() => ({ big: document.querySelectorAll('#sHome .bigbtn').length, doors: document.querySelectorAll('#sHome .door').length, stepBtns: document.querySelectorAll('#sHome button.tstep2').length, more: !!document.querySelector('#sHome .dmore') }));
  ok('home: one big button, no doors, path display-only, "something else"', hm.big === 1 && hm.doors === 0 && hm.stepBtns === 0 && hm.more, JSON.stringify(hm));
  await p.locator('#sHome .dmore').click(); await sleep(200);
  ok('"something else" has the doors', await p.evaluate(() => document.querySelectorAll('#sTal .door').length >= 3));
  // --- coach: remembered after a reload ---
  await p.evaluate(() => { const T = window.TAL; T.S().coach = { tour: 1 }; window.OREN.persist(); window.__fast = false; window.OREN.showMap(); }); await sleep(1500);
  ok('home coach shows once', await p.locator('.coach').count() === 1);
  await p.reload(); await p.waitForFunction(() => window.TAL && window.OREN); await p.evaluate(() => { window.__fast = false; window.OREN.showMap(); }); await sleep(1500);
  ok('coach remembered after reload (not shown again)', await p.locator('.coach').count() === 0 && await p.locator('.tour').count() === 0);
  ok('coach bubble never blocks taps', await p.evaluate(() => { const c = document.createElement('div'); c.className = 'coach'; c.innerHTML = '<div class="cbub">x</div>'; document.body.appendChild(c); const v = getComputedStyle(c.firstChild).pointerEvents; c.remove(); return v === 'none'; }));
  await p.evaluate(() => { window.__fast = true; });
  // --- parent sandbox: no tour, no intros; progress kept between entries ---
  await p.evaluate(() => { window.OREN.parentPlay(true); window.__fast = false; window.OREN.showMap(); }); await sleep(1500);
  ok('parent sandbox: no tour, no coach', await p.locator('.tour').count() === 0 && await p.locator('.coach').count() === 0 && await p.evaluate(() => window.OREN.save.coach.tour === 1));
  await p.evaluate(() => { window.__fast = true; window.OREN.save.gems = 123; window.OREN.persist(); window.OREN.parentPlay(false); window.OREN.parentPlay(true); });
  ok('parent sandbox keeps its progress', await p.evaluate(() => window.OREN.save.gems === 123));
  await p.evaluate(() => window.OREN.parentPlay(false));
  // --- one companion: the studio pet; an old profile animal wins once ---
  const cp = await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.av.pet = 'cat'; delete O.save.petMig; T.S().prof = { an: 'owl', col: '#3a8fc4', love: 'art' }; const s = T.friend(); return { pet: O.save.av.pet, same: s === O.PET().s() }; });
  ok('companion: profile animal migrates to the studio pet', cp.pet === 'owl' && cp.same, JSON.stringify(cp));
  await p.evaluate(() => { const T = window.TAL; T.S().prof = { col: '#3a8fc4', love: 'art' }; delete T.S().prof; T.profile(() => {}); }); await sleep(150);
  ok('profile does not ask for an animal', await p.evaluate(() => !/חַיָּה/.test(document.querySelector('#sTal').textContent)));
  // --- parent "today": compact ---
  await p.evaluate(() => { window.TAL.parentPanel('time'); }); await sleep(200);
  const pt = await p.evaluate(() => { const s = document.querySelector('#sPar .pbody .psec'); const row = null;
    return { h: s.querySelector('h3').textContent, big: [...s.querySelectorAll('.pbig .bigbtn')].map(x => x.textContent.trim()), vis: [...s.querySelectorAll('.pchip')].filter(x => x.checkVisibility()).length,
      rowBtns: row ? [...row.querySelectorAll('button')].filter(x => x.offsetParent).map(x => x.textContent) : [], gems: getComputedStyle(document.querySelector('#gemc')).display }; });
  /* #359: the mission rows live on the day view ("plan ahead"): one ✕ per row, the rest behind a tap */
  const rb = await p.evaluate(() => { const T = window.TAL, d = T.dailyEnsure(); if (!d.t.length) { d.t = ['math', T.dailyPool()[0]]; d.done = [0, 0]; } T.parentPanel('day');
    const row = document.querySelector('#sPar .pdplan'); const r = row ? [...row.querySelectorAll('button')].filter(x => x.offsetParent).map(x => x.textContent) : []; return r; });
  ok('parent today: status + the big button (+15 min), the rest folded', pt.h === '⏱️ היום' && pt.big.join('|') === '+15 דק׳' && pt.vis === 0, JSON.stringify(pt));
  ok('parent day view: a mission row shows only ✕', rb.length === 1 && rb[0] === '✕', JSON.stringify(rb));
  ok('parent panel hides the kid gems', pt.gems === 'none');
  await p.locator('#sPar .tdrow').first().click(); await sleep(100);
  ok('tap a mission row: more options', await p.evaluate(() => [...document.querySelectorAll('#sPar .tdrow')[0].querySelectorAll('.tdmore .pchip')].some(x => x.offsetParent)));
  // --- back: in-game ‹ and the browser back go to the previous screen ---
  { const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message)); await q.goto(L.URL); await q.waitForFunction(() => window.TAL && window.OREN); await L.noCoach(q);
  await q.evaluate(() => { const O = window.OREN; O.save.story.intro = 1; window.TAL.S().prof = { col: '#3a8fc4', love: 'art' }; O.showMap(); }); await sleep(100); await q.mouse.click(5, 300);
  const p0 = p; p = q;
  await p.evaluate(() => window.OREN.kingdom()); await sleep(100); await p.locator('.kmine .tool').first().click(); await sleep(150);
  ok('kingdom → my hero', await p.evaluate(() => !document.querySelector('#sStudio').hidden));
  await p.keyboard.press('Shift'); await p.evaluate(() => history.back()); await sleep(300);
  ok('browser back: hero → kingdom', await p.evaluate(() => !document.querySelector('#sKing').hidden));
  await p.keyboard.press('Shift'); await p.evaluate(() => history.back()); await sleep(300);
  ok('browser back: kingdom → home', await p.evaluate(() => !document.querySelector('#sHome').hidden));
  await p.keyboard.press('Shift'); await p.evaluate(() => history.back()); await sleep(300);
  ok('browser back at home: stays in the game', await p.evaluate(() => !document.querySelector('#sHome').hidden && /t\.html/.test(location.href)));
  p = p0; }
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); L.finish('qa-fix-' + L.variant, res);
})().catch(e => { console.log('FAIL crashed — ' + e.message); console.log('RESULT qa-fix 0 1'); process.exitCode = 1; });
