// #616 Oren can skip a question or a task: one small "⏭️ דַּלֵּג" next to the help button on every question screen.
// A skip = the next question; from the first question, or the 2nd skip in a row = the whole activity ("בְּסֵדֶר, נַעֲבֹר לְמַשֶּׁהוּ אַחֵר!"
// and the next mission). Not a failure: no level change, no stars; the item comes back on a later day (due in 1 day, #360).
// Parent setting "דילוג לאורן": כבוי / עד 3 ביום (default) / בלי הגבלה; the day view shows "דילג ×N".
const { chromium } = require('playwright');
const L = require('./lib.js');
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const P = t => String(t || '').replace(/[֑-ׇ]/g, '');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { window.__fast = true; window.__noFamily = true; try { localStorage.clear(); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await L.noCoach(p);
  await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; O.persist();
    window.__steps = []; window.TAL_step = i => window.__steps.push(i);
    const ids = T.dailyPool().slice(0, 6); const d = T.dailyEnsure(); d.t = ids.slice(); d.done = ids.map(() => 0); window.__ids = ids; O.persist(); });
  const ID = await p.evaluate(() => window.__ids);
  const setSkip = v => p.evaluate(v => { const s = window.TAL.S().set; if (v == null) delete s.skip; else s.skip = v; }, v);
  /* a quiz of 5 bank items (a finite pool, #360); the activity line opens like a path mission's */
  const quiz = (id = ID[0]) => p.evaluate(id => { const T = window.TAL, DL = window.DAYLOG; document.querySelector('#ov').hidden = true; DL.begin(id);
    T.quiz({ id, title: 'דִּלּוּג', back: () => {}, n: 5, gen: k => ({ pr: '<div class="qq">שְׁאֵלָה ' + k + '</div>', opts: ['אַחַת', 'שְׁתַּיִם', 'שָׁלֹשׁ'], ans: 0, cls: 'tx', key: id + '-' + k, bank: 'tq-' + id }) }); }, id);
  const st = () => p.evaluate(() => { const vis = e => !!(e && e.offsetParent); const sb = [...document.querySelectorAll('.skipbtn')].filter(vis);
    return { i: window.__quiz && window.__quiz.i, n: sb.length, lbl: sb[0] ? sb[0].textContent.trim() : '', help: [...document.querySelectorAll('.helpbtn')].filter(vis).length,
      ov: !!document.querySelector('.pdskip'), ovT: (document.querySelector('.pdskip') || {}).textContent || '' }; });
  const calm = () => p.waitForFunction(() => !(window.OREN.tapTooSoon && window.OREN.tapTooSoon()), null, { polling: 30 });
  const tapSkip = async () => { await calm(); await p.evaluate(() => [...document.querySelectorAll('.skipbtn')].find(x => x.offsetParent).click()); await L.sleep(60); };
  const right = async () => { await calm();
    await p.evaluate(() => { const q = window.__quiz; q.wrap.querySelectorAll('.chs .chb')[q.ans].click(); }); await L.sleep(250); };
  const today = () => p.evaluate(() => window.OREN.today());
  const clearDay = async () => { await p.evaluate(() => { const s = window.OREN.save; const d = window.OREN.today(); if (s.alog && s.alog[d]) s.alog[d].e = []; }); };

  // 1. the button: on every question screen, small, next to help, read aloud (in pregen); hidden when the parent set it off
  await quiz(); let s = await st();
  ok('default: one "⏭️ דַּלֵּג" button on the question screen, next to the one help button', s.n === 1 && P(s.lbl).includes('דלג') && s.help === 1, JSON.stringify(s));
  const look = await p.evaluate(() => { const sb = document.querySelector('.skipbtn'), hb = document.querySelector('.helpbtn'); const a = sb.getBoundingClientRect(), c = hb.getBoundingClientRect();
    return { small: a.height < c.height && a.width < c.width, same: sb.closest('.helpq') === hb.closest('.helpq'), aria: sb.getAttribute('aria-label') }; });
  ok('the skip button is smaller than the help button (secondary), in the same help row', look.small && look.same, JSON.stringify(look));
  ok('its label is in pregen (T.choiceList)', await p.evaluate(() => window.TAL.choiceList().some(x => x.replace(/[֑-ׇ]/g, '') === 'דלג')));
  await calm(); const said = await p.evaluate(async () => { const O = window.OREN, log = []; const s0 = O.say; O.say = t => { log.push(t); }; document.querySelector('.skipbtn').click(); await new Promise(r => setTimeout(r, 30)); O.say = s0; return log; });
  ok('a tap reads the label aloud', said.some(t => P(t).includes('דלג')), JSON.stringify(said));
  await L.sleep(400);
  await setSkip('off'); await quiz(); s = await st();
  ok('setting off: no skip button (help stays)', s.n === 0 && s.help === 1, JSON.stringify(s));
  await setSkip(null); await clearDay();

  // 2. skip a question → the next question; no level change, no stars, no wrong count
  await quiz(); await right(); s = await st();
  const before = await p.evaluate(() => ({ gems: window.OREN.save.gems, lrn: JSON.stringify(window.OREN.save.lrn.k || {}) }));
  await tapSkip(); const s2 = await st();
  ok('skip on the 2nd question → the 3rd question, no "move on" screen', s.i === 1 && s2.i === 2 && !s2.ov, JSON.stringify([s, s2]));
  const after = await p.evaluate(() => ({ gems: window.OREN.save.gems, lrn: JSON.stringify(window.OREN.save.lrn.k || {}) }));
  ok('a skipped question: no gems, no skill-level change', before.gems === after.gems && before.lrn === after.lrn, JSON.stringify([before, after]));
  // 3. the skipped item comes back on a later day, not today (due in 1 day, like a wrong item of the task pool)
  const back = await p.evaluate(id => { const LN = window.LEARN, items = [id + '-1', id + '-new'].map(k => ({ k }));
    const t0 = LN.pickItem('tq-' + id, items); LN.setNow(() => Date.now() + 86400000); const t1 = LN.pickItem('tq-' + id, items); LN.setNow(null);
    const asked = window.__quiz.keys; return { t0: t0 && t0.item.k, w0: t0 && t0.why, t1: t1 && t1.item.k, w1: t1 && t1.why, asked }; }, ID[0]);
  ok('the skipped item is not picked again today (a new item is)', back.t0 === ID[0] + '-new' && back.asked.includes(ID[0] + '-1'), JSON.stringify(back));
  ok('the next day the skipped item comes back first (review)', back.t1 === ID[0] + '-1' && back.w1 === 'review', JSON.stringify(back));
  // 4. a second skip in a row → the whole activity: the friend's line, then the next mission
  await tapSkip(); s = await st();
  ok('2 skips in a row → "בְּסֵדֶר, נַעֲבֹר לְמַשֶּׁהוּ אַחֵר!"', s.ov && P(s.ovT).includes('בסדר, נעבר למשהו אחר'), JSON.stringify(s));
  await L.sleep(400); s = await st();
  ok('… and the next mission opens', !s.ov && (await p.evaluate(() => window.__steps.length)) >= 1, JSON.stringify(s));
  // 5. from the first question → the whole activity at once; the path step counts as skipped (done = 2)
  await p.evaluate(() => { window.__steps = []; });
  await quiz(ID[1]); await tapSkip(); s = await st();
  ok('skip on the first question → the whole activity ("נעבור למשהו אחר")', s.ov, JSON.stringify(s));
  await L.sleep(400);
  const pd = await p.evaluate(id => { const d = window.TAL.dailyEnsure(); return { done: d.done[d.t.indexOf(id)], steps: window.__steps.slice(), stars: (window.TAL.S().tl[id] || {}).s | 0 }; }, ID[1]);
  ok('the skipped mission is passed on the path (done = 2), no stars, the next mission opens', pd.done === 2 && pd.stars === 0 && pd.steps.length === 1 && pd.steps[0] === 2, JSON.stringify(pd));

  // 6. the day view: skips per activity ("דילג ×2")
  const dv = await p.evaluate(([d, a, b2]) => { const DL = window.DAYLOG; const rows = DL.rows(d); const r = rows.find(e => e[1] === a), r2 = rows.find(e => e[1] === b2);
    return { a: r ? DL.rowHTML(r) : '', b: r2 ? DL.rowHTML(r2) : '' }; }, [await today(), ID[0], ID[1]]);
  ok('day view: "דילג ×2" on the activity skipped twice, "דילג ×1" on the other', /דילג ×2/.test(dv.a) && /דילג ×1/.test(dv.b), JSON.stringify(dv));
  await p.evaluate(() => window.TAL.parentPanel('day')); await L.sleep(200);
  ok('the parent\'s day view shows it', await p.evaluate(() => /דילג ×2/.test(document.querySelector('#sPar').textContent)));
  await p.evaluate(() => { document.querySelector('#sPar').hidden = true; });

  // 7. the limit: 3 a day (3 used now), then the button is hidden for the rest of the day; unlimited: still there
  await quiz(ID[2]); s = await st();
  ok('limit 3 a day: after 3 skips the button is hidden', s.n === 0 && s.help === 1, JSON.stringify(s));
  await setSkip('all'); await quiz(ID[2]); s = await st();
  ok('"בלי הגבלה": the button is still there after 3', s.n === 1, JSON.stringify(s));
  await setSkip(null);
  ok('the count is per day: a new day starts at 0', await p.evaluate(() => { const P = window.PDAY; return P.skipsToday() === 3 && P.skipsToday('2000-01-01') === 0; }));

  // 8. the parent setting: 3 choices, default "עד 3 ביום"; a tap marks the settings for the family save; another device's value arrives
  await p.evaluate(() => window.TAL.parentPanel('skip')); await L.sleep(200);
  const pn = await p.evaluate(() => { const box = document.querySelector('#sPar .skset'); return box ? { t: box.closest('.psec').textContent.includes('דילוג לאורן'),
    ch: [...box.querySelectorAll('.pchip')].map(x => x.textContent.trim()), on: (box.querySelector('.pchip.on') || {}).textContent } : null; });
  ok('panel "דילוג לאורן": כבוי / עד 3 ביום / בלי הגבלה, default "עד 3 ביום"', pn && pn.t && pn.ch.join('|') === 'כבוי|עד 3 ביום|בלי הגבלה' && pn.on === 'עד 3 ביום', JSON.stringify(pn));
  const t0 = await p.evaluate(() => +window.OREN.save.setT || 0);
  await p.locator('#sPar .skset .pchip', { hasText: 'בלי הגבלה' }).click(); await L.sleep(100);
  const t1 = await p.evaluate(() => ({ v: window.PDAY.skipSet(), t: +window.OREN.save.setT || 0, on: document.querySelector('#sPar .skset .pchip.on').textContent }));
  ok('a tap sets it and marks the settings for the family save (setT)', t1.v === 'all' && t1.t > t0 && t1.on === 'בלי הגבלה', JSON.stringify({ t0, t1 }));
  await p.evaluate(() => { document.querySelector('#sPar').hidden = true; const O = window.OREN; O.settleSet && O.settleSet(); const set = JSON.parse(JSON.stringify(O.save.set)); set.skip = 'off'; O.mergeIn({ set, setT: Date.now() + 5000 }); });
  ok('a value from another device (newer settings) arrives', await p.evaluate(() => window.PDAY.skipSet() === 'off'));
  await quiz(ID[3]); s = await st();
  ok('… and the next question screen follows it (no button)', s.n === 0, JSON.stringify(s));
  await setSkip('all');

  // 9. math level: skip on the 2nd question → the next question, the level is not failed
  const m = await p.evaluate(async () => { const O = window.OREN, o4 = window.__oren4; document.querySelector('#ov').hidden = true; const lv = O.ALLLV.find(l => l.type !== 'boss' && l.type !== 'train');
    o4.playLevel(lv); const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let k = 0; k < 40 && !(o4.play && document.querySelector('#sPlay .skipbtn')); k++) { await wait(50); const g = [...document.querySelectorAll('#dlg .bigbtn,#ov .bigbtn')].find(x => x.offsetParent); if (g) g.click(); }
    const pl = o4.play; if (!pl) return { err: 'no play' };
    /* help twice = the answer, the question ends: now on the 2nd question */ for (let k = 0; k < 2; k++) { const hb = document.querySelector('#sPlay .helpbtn'); if (hb) hb.click(); await wait(80); }
    for (let k = 0; k < 40 && o4.play.i < 1; k++) await wait(50);
    for (let k = 0; k < 60 && O.tapTooSoon && O.tapTooSoon(); k++) await wait(30); const sb = document.querySelector('#sPlay .skipbtn'); if (!sb) return { err: 'no button', i: pl.i };
    const i0 = pl.i, e0 = pl.errors, s0 = O.stars(lv.id); sb.click(); await wait(300); return { i0, i1: o4.play.i, e0, e1: o4.play.errors, s0, s1: O.stars(lv.id), ov: !!document.querySelector('.pdskip') }; });
  ok('math level: skip → the next question, no error counted, no stars', m.i1 === m.i0 + 1 && m.e1 === m.e0 && m.s1 === m.s0 && !m.ov, JSON.stringify(m));

  // 10. screenshot of a question screen with the button at 390x844 (the PR's picture)
  if (process.env.SKIP_SHOT) { const ph = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await ph.addInitScript(() => { window.__fast = true; window.__noFamily = true; });
    const q = await ph.newPage(); await q.goto(L.URL); await L.noCoach(q);
    await q.evaluate(() => { window.OREN.save.story.intro = 1; window.TAL.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; document.querySelector('#ov').hidden = true; window.TAL.ACT['world-flag'].run(() => {}); });
    for (let k = 0; k < 8; k++) { await L.sleep(150); if (await q.evaluate(() => !!document.querySelector('#sTal .skipbtn'))) break; await q.evaluate(() => { const x = [...document.querySelectorAll('#sTal .bigbtn')].find(e => e.offsetParent); if (x) x.click(); }); }
    await L.sleep(400); await q.screenshot({ path: process.env.SKIP_SHOT }); await ph.close(); }
  ok('no JS errors', !errs.length, errs.slice(0, 3).join(' | '));
  L.finish('kidskip', res); await b.close();
})().catch(e => { console.log('FAIL crashed — ' + e.message); console.log('RESULT kidskip 0 1'); process.exitCode = 1; });
