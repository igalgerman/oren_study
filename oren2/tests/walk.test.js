// #745: the example screen walker (tests/walk.js). Self-check of the helper (no browser), then one real walk: every Talents City activity
// shows a visible back/home control (the rule of #356, as the template for the #266 / #356 follow-ups).
const W = require('./walk');
const L = require('./lib');
const { chromium } = require('playwright');
(async () => {
  const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
  // the helper itself: lists every broken screen, survives a throw, FAILs on an empty walk
  const w = await W.walkScreens(['a', 'b', 'c', 'd'], async id => { if (id === 'c') throw new Error('boom\nmore'); }, id => id === 'a' ? true : id === 'b' ? 'no back' : false);
  ok('walker lists all broken screens', w.total === 4 && w.broken.join('|') === 'b: no back|c: boom|d', w.broken.join('|'));
  ok('walkLine names them', /^FAIL .*3 break it: b: no back, c: boom, d$/.test(W.walkLine('r', w)), W.walkLine('r', w));
  ok('walkLine passes a clean walk, fails an empty one', /^PASS /.test(W.walkLine('r', { total: 2, broken: [] })) && /^FAIL /.test(W.walkLine('r', { total: 0, broken: [] })));
  // the example walk
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; window.__noFamily = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss());
  await p.goto(L.URL); await L.noCoach(p);
  await p.evaluate(() => { const O = window.OREN; O.save.story.intro = 1; window.TAL.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; O.showMap(); });
  const ids = await p.evaluate(() => Object.keys(window.TAL.ACT));
  const atHub = () => p.evaluate(() => !document.querySelector('#sTal').hidden && !!document.querySelector('#sTal .gdoors') && document.querySelector('#dlg').hidden);
  const skipped = [];
  const w2 = await W.walkScreens(ids, async id => {
    await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.TAL.openHub(); });
    await p.evaluate(id => { const T = window.TAL; T.ACT[id].run(() => T.openHub()); }, id); await L.sleep(100);
    await p.evaluate(() => { const ov = document.querySelector('#ov'); if (!ov.hidden) ov.hidden = true; });
  }, async id => {
    if (await atHub()) { skipped.push(id); return true; }   // not open for Oren yet: went straight back
    const seen = await p.evaluate(() => ['btnBack', 'btnHome'].some(i => { const e = document.getElementById(i); if (!e || e.hidden || getComputedStyle(e).visibility === 'hidden') return false;
      const r = e.getBoundingClientRect(); if (!r.width) return false; const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!t && (t === e || e.contains(t)); }));
    return seen || 'no back control';
  });
  res.push(W.walkLine('every activity shows a back/home control', w2));
  ok('no page errors', !errs.length, errs.slice(0, 3).join(' | '));
  await b.close();
  L.finish('walk', res);
})();
