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
  await p.evaluate(() => { const O = window.OREN; delete O.save.seen['add-8']; O.startLevel(O.ALLLV.find(l => l.id === 'add-8-0')); }); await sleep(400);
  ok('regrouping lesson: 10 cubes become a stick', await p.evaluate(() => !!document.querySelector('#sLearn .mblk .mbt .rod.new') && document.querySelectorAll('#sLearn .mblk .mbo .one').length < 10));
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
