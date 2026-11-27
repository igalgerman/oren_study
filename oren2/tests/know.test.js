// KNOW (#57): know what Oren knows, skip easy lessons, learn over time.
// Part 1: the rules on a made-up area (pure, in Node). Part 2: music, English, math and the parent panel in the built page.
// Usage: node tests/know.test.js [desktop|phone]
const path = require('path');
const L = require('./lib');
global.window = {};
const KN = require(path.join(L.ROOT, 'know.js')), K = KN.core;
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (!c && i ? ' — ' + i : ''));

/* ---------- part 1: a made-up area ---------- */
KN.area('space', { name: 'חלל', skills: [{ id: 'sp1', track: 'fly', lesson: 'l1' }, { id: 'sp2', track: 'fly', lesson: 'l2' }, { id: 'sp3', track: 'fly' }, { id: 'pl1', track: 'land' }, { id: 'pl2', track: 'land' }],
  asks: [{ id: 'q-fly', q: 'flies', skills: ['sp2'] }, { id: 'q-land', q: 'lands', skills: ['pl1'] }] });
const E = ev => ev.map(x => x.e + ':' + x.skill + (x.to ? '>' + x.to : '')).join(',');
{
  const st = K.ensure();
  ok('made-up area: the first skill is the one to work on', K.current(st, 'space', 'fly').id === 'sp1');
  ok('2 right in a row: not known yet', E([...K.answer(st, 'sp1', true), ...K.answer(st, 'sp1', true)]) === '' && !K.known(st, 'sp1'));
  ok('3 right in a row: known', E(K.answer(st, 'sp1', true)) === 'known:sp1' && K.known(st, 'sp1'));
  ok('known → the next harder skill of the same track follows', K.current(st, 'space', 'fly').id === 'sp2' && K.current(st, 'space', 'land').id === 'pl1');
  ok('a later wrong answer: not known any more (the lesson comes back)', E(K.answer(st, 'sp1', false)) === 'lost:sp1' && !K.known(st, 'sp1') && K.current(st, 'space', 'fly').id === 'sp1');
  const s2 = K.ensure(); ['sp1', 'sp1', 'sp1'].forEach(x => K.answer(s2, x, true));
  ok('right, wrong, right, wrong: no step back (not 2 in a row)', E([true, false, true, false].flatMap(v => K.answer(s2, 'sp2', v))) === '' && K.known(s2, 'sp1'));
  ok('2 wrong in a row: quietly back to the easier skill', E(K.answer(s2, 'sp2', false)) === 'back:sp2>sp1' && !K.known(s2, 'sp1') && K.current(s2, 'space', 'fly').id === 'sp1' && s2.k.sp2.b === 1);
  [1, 2, 3].forEach(() => K.answer(s2, 'sp1', true));
  ok('easier skill known again: forward again, the step-back mark is gone', K.known(s2, 'sp1') && K.current(s2, 'space', 'fly').id === 'sp2' && !s2.k.sp2.b);
  const s3 = K.ensure();
  ok('2 wrong on the easiest skill: nothing easier, no event', E([...K.answer(s3, 'sp1', false), ...K.answer(s3, 'sp1', false)]) === '');
  ok('an unknown skill id is ignored', E(K.answer(s3, 'nope', true)) === '' && !s3.k.nope);
}
{ // review: about 1 in 10, only skills he knows, only easier ones of the same track
  const st = K.ensure(); [1, 2, 3].forEach(() => K.answer(st, 'sp1', true));
  let n = 0, wrong = 0; for (let i = 0; i < 5000; i++) { const r = K.review(st, 'sp2'); if (r) { n++; if (r.id !== 'sp1') wrong++; } }
  ok('about 1 question in 10 is a quick review', n > 350 && n < 650 && !wrong, n + ' of 5000');
  const fresh = K.ensure(); let m = 0; for (let i = 0; i < 1000; i++) if (K.review(fresh, 'sp2')) m++;
  ok('no review when nothing is known yet', m === 0);
  let x = 0; for (let i = 0; i < 1000; i++) if (K.review(st, 'sp1')) x++;
  ok('no review of the skill itself or harder ones', x === 0);
}
{ // the parent's answers
  const st = K.ensure();
  const ev = K.place(st, 'space', 'q-fly', true);
  ok('parent "yes": that skill and the easier ones are known', K.known(st, 'sp1') && K.known(st, 'sp2') && !K.known(st, 'sp3') && st.pl['q-fly'] === 1 && ev.every(x => x.e === 'place' && x.yes));
  ok('… so the game starts at the next skill', K.current(st, 'space', 'fly').id === 'sp3');
  K.place(st, 'space', 'q-fly', false);
  ok('parent "no": that skill and the harder ones are not known (easier ones stay)', K.known(st, 'sp1') && !K.known(st, 'sp2') && st.pl['q-fly'] === 0);
  ok('an unknown question changes nothing', K.place(st, 'space', 'nope', true).length === 0);
}
{ // family merge
  const a = K.ensure(), b = K.ensure(); a.t = 5; b.t = 9; b.k.sp1 = { r: 3, w: 0, ok: 1 };
  ok('family merge: the newer state wins', K.known(K.merge(a, b), 'sp1') && K.merge(b, a) === b);
}

/* ---------- part 2: in the game ---------- */
const { chromium } = require('playwright'); const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; window.__noFamily = true; window.__lessons = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await L.noCoach(p);
  await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; });
  const areas = await p.evaluate(() => Object.values(window.KNOW.AREAS).map(a => a.id + ':' + a.asks.length));
  ok('areas: music, English and math, each with a few parent questions', ['music', 'english', 'math'].every(id => areas.some(x => x.startsWith(id + ':') && +x.split(':')[1] >= 2 && +x.split(':')[1] <= 4)), areas.join(' '));

  const hide = () => p.evaluate(() => { document.querySelector('#ov').hidden = true; });
  const answerAll = (right, max = 12) => p.evaluate(async ([right, max]) => { const sl = ms => new Promise(r => setTimeout(r, ms));
    for (let k = 0; k < max; k++) { const q = window.__quiz; if (!q || !q.wrap || !q.wrap.isConnected || !document.getElementById('ov').hidden) return k;
      const cur = window.MUSIC2.cur; if (cur && cur.pat) { if (right) window.MUSIC2.solve(); else { const go = q.wrap.querySelector('.bigbtn'); if (go) go.click(); } await sl(400); continue; }
      const row = q.wrap.querySelector('.chs'); if (!row) { await sl(150); continue; }
      const bs = [...row.children]; const n = bs.length;
      if (right) bs[q.ans].click(); else { bs[(q.ans + 1) % n].click(); await sl(60); const c = [...row.children].find((x, j) => j !== q.ans && !x.disabled); if (c) c.click(); }
      await sl(right ? 220 : 450); } return max; }, [right, max]);

  // ---- music: 3 right in a row → known, lesson skipped, the next harder skill ----
  await p.evaluate(() => { window.LESSONS.mark('mus-len', 1); window.MUSIC2.setLevel('rhy', 1); window.TAL.ACT['mus2-rhythm'].run(() => {}); }); await sleep(250);
  await answerAll(true, 3); await sleep(200);
  const m1 = await p.evaluate(() => ({ known: window.KNOW.known('mus-len'), lv: window.MUSIC2.ST().rhy }));
  ok('music: 3 right in a row → "note lengths" known', m1.known, JSON.stringify(m1));
  await answerAll(true, 40); await sleep(300);
  const m2 = await p.evaluate(() => ({ end: !document.getElementById('ov').hidden, lv: window.MUSIC2.ST().rhy, sub: (document.querySelector('#ov .sub') || {}).textContent || '' }));
  ok('music: after the round the next harder skill (eighth notes, level 3) follows, level 2 is skipped', m2.end && m2.lv === 3, JSON.stringify(m2));
  // ---- music: 2 wrong in a row → quietly back to the easier skill ----
  await hide(); await p.evaluate(() => { window.LESSONS.mark('mus-len8', 1); window.TAL.ACT['mus2-rhythm'].run(() => {}); }); await sleep(250);
  ok('music: the eighth-notes round starts at once (its lesson was seen)', await p.evaluate(() => !document.querySelector('#sTal .lccard') && !!document.querySelector('#sTal .m2')));
  await answerAll(false, 2); await sleep(200);
  const back = await p.evaluate(() => ({ known: window.KNOW.known('mus-len'), seen: window.LESSONS.seen('mus-len'), txt: document.querySelector('#sTal').textContent }));
  ok('music: 2 wrong in a row → the easier skill is not known any more, its lesson comes back', !back.known && !back.seen, JSON.stringify(back).slice(0, 200));
  ok('music: no failure message on the screen', !/נִכְשַׁלְתָּ|חוֹזְרִים אָחוֹרָה|ירדת|יָרַדְתָּ/.test(back.txt));
  await answerAll(false, 40); await sleep(300);
  const m3 = await p.evaluate(() => ({ end: !document.getElementById('ov').hidden, lv: window.MUSIC2.ST().rhy, sub: (document.querySelector('#ov .sub') || {}).textContent || '' }));
  ok('music: the next round is the easier skill (level 2), quietly', m3.end && m3.lv === 2 && !/שָׁלָב/.test(m3.sub), JSON.stringify(m3));
  await hide(); await p.evaluate(() => window.TAL.ACT['mus2-rhythm'].run(() => {})); await sleep(250);
  ok('music: the easier lesson is shown again before that round', await p.evaluate(() => !!document.querySelector('#sTal .lccard')));
  // ---- music: review questions ----
  const rv = await p.evaluate(() => { const K = window.KNOW; K.set('music', 'mus-len', 1); window.MUSIC2.setLevel('rhy', 3); const r0 = Math.random; Math.random = () => 0.05; let qs; try { qs = window.MUSIC2.rhyQs(); } finally { Math.random = r0; } return qs.filter(q => q.k === 'choice').map(q => q.rv || ''); });
  ok('music: a review question asks about a skill he already knows', rv.length && rv.every(x => x === 'mus-len'), rv.join(','));

  // ---- the parent panel ----
  await hide(); await p.evaluate(() => window.TAL.parentPanel('know')); await sleep(300);
  const pan = await p.evaluate(() => { const s = [...document.querySelectorAll('#sPar .psec')].find(x => /מה אורן כבר יודע/.test(x.querySelector('h3').textContent));
    return s ? { rows: s.querySelectorAll('.knq').length, yes: s.querySelectorAll('.knq button').length, nik: /[ְ-ּ]/.test(s.textContent), inputs: s.querySelectorAll('input,select').length } : null; });
  ok('parent panel: short yes/no placement questions per area', pan && pan.rows >= 8 && pan.yes === pan.rows * 2 && pan.inputs === 0, JSON.stringify(pan));
  ok('parent panel text: no nikud', pan && !pan.nik);
  await L.shot(p, { path: path.join(L.SHOTDIR, 'know-panel-' + L.variant + '.png'), fullPage: true });
  await p.evaluate(() => { const b = document.querySelector('#sPar button[data-ask="mus-len8"][data-yes="1"]'); b.click(); }); await sleep(200);
  const py = await p.evaluate(() => ({ k1: window.KNOW.known('mus-len'), k2: window.KNOW.known('mus-len8'), s2: window.LESSONS.seen('mus-len8'), lv: window.MUSIC2.ST().rhy, on: !!document.querySelector('#sPar button.on[data-ask="mus-len8"][data-yes="1"]') }));
  ok('parent "knows eighth notes: yes" → both length skills known, lessons skipped, rhythm at the top level', py.k1 && py.k2 && py.s2 && py.lv === 4 && py.on, JSON.stringify(py));
  await p.evaluate(() => { document.querySelector('#sPar button[data-ask="mus-len"][data-yes="0"]').click(); }); await sleep(200);
  const pn = await p.evaluate(() => ({ k1: window.KNOW.known('mus-len'), s1: window.LESSONS.seen('mus-len'), lv: window.MUSIC2.ST().rhy }));
  ok('parent "knows note lengths: no" → the lesson comes back, rhythm from level 1', !pn.k1 && !pn.s1 && pn.lv === 1, JSON.stringify(pn));

  // ---- English: the parent says he knows letters → reading opens, the letters lesson is skipped ----
  const en = await p.evaluate(() => { const E2 = window.ENGLISH2, s = window.OREN.save; const before = E2.levelOpen(s, 2); window.KNOW.set('english', 'eng-abc', 1); return { before, after: E2.levelOpen(s, 2), seen: window.LESSONS.seen('eng-abc'), talk: E2.levelOpen(s, 3) }; });
  ok('English: "knows letters: yes" → reading words opens, the letters lesson is skipped', !en.before && en.after && en.seen && !en.talk, JSON.stringify(en));
  // 2 wrong in a row in reading → quietly the letters round
  await p.evaluate(() => { window.OREN.save.kn.k['eng-read'] = { r: 0, w: 1, ok: 0 }; window.KNOW.hit('eng-read', false); });
  const eb = await p.evaluate(() => ({ abc: window.KNOW.known('eng-abc'), stepped: window.KNOW.stepped('eng-read'), seen: window.LESSONS.seen('eng-abc') }));
  ok('English: 2 wrong in a row in reading → letters not known, its lesson comes back', !eb.abc && eb.stepped && !eb.seen, JSON.stringify(eb));
  await p.evaluate(() => { window.LESSONS.mark('eng-abc', 1); document.querySelector('#ov').hidden = true; window.TAL.ACT['eng-read'].run(() => {}); }); await sleep(300);
  ok('English: the reading activity quietly plays the easier letters round', await p.evaluate(() => !!(window.__e2 && window.__e2.P && window.__e2.P.lv === 1)));

  // ---- math: no placement test in the game; the parent's answer sets the start ----
  await hide(); await p.evaluate(() => window.LEARN.run('ln-math', () => {})); await sleep(300);
  ok('math: no placement test in the game, the round starts at once', await p.evaluate(() => !!document.querySelector('#sTal .lnq')));
  const ma = await p.evaluate(() => { window.OREN.showMap(); window.KNOW.set('math', 'math-20', 1); const k = window.OREN.save.lrn.k; return ['mm-ten', 'mm-dbl', 'mm-pv'].map(x => (k[x] || {}).l || 1); });
  ok('math: "adds up to 20: yes" → the strategies start at level 3', ma.every(l => l === 3), ma.join(','));
  // 3 right in a row on mm-ten@3 → level 4 after the round; 2 wrong in a row → back
  const mk = await p.evaluate(() => { const K = window.KNOW; K.begin('math'); [1, 2, 3].forEach(() => K.hit('mm-ten@3', true)); const mid = window.OREN.save.lrn.k['mm-ten'].l; K.end('math'); const up = window.OREN.save.lrn.k['mm-ten'].l;
    K.hit('mm-ten@4', false); K.hit('mm-ten@4', false); return { mid, up, down: window.OREN.save.lrn.k['mm-ten'].l }; });
  ok('math: 3 right in a row → the next level (after the round, not in the middle)', mk.mid === 3 && mk.up === 4, JSON.stringify(mk));
  ok('math: 2 wrong in a row → one level down', mk.down === 3, JSON.stringify(mk));

  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close();
  L.finish('know-' + L.variant, res);
})().catch(e => { console.error(e); res.push('FAIL crashed — ' + e.message); L.finish('know-' + L.variant, res); });
