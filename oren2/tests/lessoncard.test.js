// Lesson cards (#56): the first time Oren meets a new idea, a short lesson comes before the questions:
// the friend, a big picture, the voice, ONE button to continue, no typing. Shown once; "show me again" brings it back.
// First lessons: music note lengths (rhythm) and English letters and sounds.
// Usage: node tests/lessoncard.test.js [desktop|phone]
const L = require('./lib');
const { chromium } = require('playwright'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const NIK = /[ְ-ּ]/;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; window.__noFamily = true; window.__lessons = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await L.noCoach(p);
  await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; });
  ok('LESSONS module is there', await p.evaluate(() => !!(window.LESSONS && window.LESSONS.show && window.LESSONS.first)));
  const card = () => p.evaluate(() => { const s = document.querySelector('#sTal'); const c = s.querySelector('.lccard');
    return c ? { t: c.querySelector('.sent').textContent, art: !!c.querySelector('.lcart svg,.lcart .e2let,.lcart .pic,.lcart .lcpic'), btns: [...s.querySelectorAll('button')].filter(x => x.offsetParent && !x.closest('.lccard')).length,
      go: !!s.querySelector('.lcgo'), inputs: s.querySelectorAll('input,textarea,select').length, friend: document.body.classList.contains('fron'), ans: window.__quiz && window.__quiz.ans } : null; });
  const tapThrough = async () => { const seen = []; for (let k = 0; k < 10; k++) { const c = await card(); if (!c) break; seen.push(c); await p.locator('#sTal .lcgo').click(); await sleep(150); } return seen; };
  const rhythmStart = lv => p.evaluate(lv => { document.querySelector('#ov').hidden = true; window.MUSIC2.setLevel('rhy', lv); window.TAL.ACT['mus2-rhythm'].run(() => {}); }, lv);

  // ---- music: note lengths before the first rhythm questions ----
  await rhythmStart(1); await sleep(300);
  const c1 = await card();
  ok('rhythm, first time: a lesson card comes first', !!c1 && !(await p.locator('#sTal .m2').count()), JSON.stringify(c1));
  ok('lesson card: big picture, nikud text, friend, one button, no typing', c1 && c1.art && NIK.test(c1.t) && c1.friend && c1.btns === 1 && c1.go && c1.inputs === 0, JSON.stringify(c1));
  await L.shot(p, { path: require('path').join(L.SHOTDIR, 'lesson-music-' + L.variant + '.png') });
  const ms = await tapThrough();
  ok('music lesson teaches whole, half and quarter notes with their beats', ms.length === 3 && /שָׁלֵם/.test(ms[0].t) && /אַרְבַּע/.test(ms[0].t) && /חֲצִי/.test(ms[1].t) && /שְׁתֵּי/.test(ms[1].t) && /רֶבַע/.test(ms[2].t) && /אַחַת/.test(ms[2].t), JSON.stringify(ms.map(x => x.t)));
  ok('after the lesson: the rhythm questions', await p.locator('#sTal .m2').count() === 1 && !(await card()));
  ok('lesson marked as seen', await p.evaluate(() => window.LESSONS.seen('mus-len')));
  // second time: straight to the questions, with a small "show me again" button
  await rhythmStart(1); await sleep(300);
  ok('rhythm, second time: no lesson, questions at once', !(await card()) && await p.locator('#sTal .m2').count() === 1);
  const ag = p.locator('#sTal .lcagain');
  ok('a "show me again" button (nikud) is on the question screen', await ag.count() === 1 && NIK.test(await ag.textContent()));
  await ag.click(); await sleep(300);
  const again = await tapThrough();
  ok('"show me again" brings the lesson back, then the questions', again.length === 3 && await p.locator('#sTal .m2').count() === 1);
  // level 3 adds eighth notes: their own lesson the first time
  await rhythmStart(3); await sleep(300);
  const e8 = await tapThrough();
  ok('eighth notes: their own lesson the first time they appear', e8.length >= 1 && e8.every(x => /שְׁמִינִי/.test(x.t)), JSON.stringify(e8.map(x => x.t)));
  await rhythmStart(3); await sleep(300);
  ok('eighth lesson shown once', !(await card()));

  // ---- English: letters and sounds before the first letter round ----
  await p.evaluate(() => { const E2 = window.ENGLISH2, s = E2.st(window.OREN.save); E2.LEVELS[0].units.slice(0, 3).forEach(u => { s.u[u.id] = 1; }); window.OREN.persist(); });
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.TAL.ACT['eng-abc'].run(() => {}); }); await sleep(300);
  const ec = await card();
  ok('English letters, first time: a lesson card comes first', !!ec && ec.art && ec.btns === 1 && NIK.test(ec.t), JSON.stringify(ec));
  await L.shot(p, { path: require('path').join(L.SHOTDIR, 'lesson-english-' + L.variant + '.png') });
  const es = await tapThrough();
  ok('English lesson: letters, big and small, a letter has a sound', es.length === 3 && /אוֹתִיּוֹת/.test(es[0].t) && /גְּדוֹלָה/.test(es[1].t) && /קְטַנָּה/.test(es[1].t) && /צְלִיל/.test(es[2].t), JSON.stringify(es.map(x => x.t)));
  ok('then the letter round starts', await p.evaluate(() => !!(window.__e2 && window.__e2.step)));
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.TAL.ACT['eng-abc'].run(() => {}); }); await sleep(300);
  ok('English letters, second time: no lesson, a "show me again" button', !(await card()) && await p.locator('#sTal .lcagain').count() === 1);

  // ---- #258: lesson cards for more activities (first time only, "show me again" brings them back) ----
  const open = id => p.evaluate(id => { document.querySelector('#ov').hidden = true; window.TAL.ACT[id].run(() => {}); }, id);
  const ready = sel => p.evaluate(sel => !document.querySelector('#sTal .lccard') && !!document.querySelector('#sTal ' + sel), sel);
  const GATES = [
    ['sci-animals', ['sci-groups'], '.tq .chs .chb', /יוֹנֵק/],
    ['sci-mag', ['sci-mag'], '.tq .chs .chb', /בַּרְזֶל/],
    ['world-ani', ['world-cont'], '.tq .chs .chb', /יַבֶּשֶׁת/],
    ['mus2-read', ['mus-staff'], '.m2', /חֲמֻשָּׁה/],
    ['think-ana', ['think-ana'], '.thq .chs .chb', /זוּג/],
    ['think-mat', ['think-mat'], '.thq .chs .chb', /שׁוּרָה/],
    ['code-maze', ['code-prog'], '.lvgo', /חִצִּים/],
    ['think-sudoku', ['think-sud'], '.sud', /פַּעַם אַחַת/],
    ['art-sym', ['art-sym'], '.symg', /מַרְאָה/],
  ];
  for (const [id, ls, sel, word] of GATES) {
    await p.evaluate(ls => ls.forEach(l => window.LESSONS.mark(l, 0)), ls);
    await open(id); await sleep(300);
    const c = await card();
    ok(id + ', first time: a lesson card (big picture, nikud, friend, one button, no typing)', !!c && c.art && NIK.test(c.t) && c.friend && c.btns === 1 && c.go && c.inputs === 0, JSON.stringify(c));
    if (id === 'think-sudoku' || id === 'code-maze') await L.shot(p, { path: require('path').join(L.SHOTDIR, 'lesson-' + id + '-' + L.variant + '.png') });
    const seen = await tapThrough();
    ok(id + ': the lesson teaches its idea', seen.some(x => word.test(x.t)), JSON.stringify(seen.map(x => x.t)));
    ok(id + ': after the lesson, the activity', await ready(sel) && await p.evaluate(ls => ls.every(l => window.LESSONS.seen(l)), ls));
    await open(id); await sleep(300);
    ok(id + ', second time: no lesson, the activity at once', !(await card()) && await ready(sel));
    const ag = p.locator('#sTal .lcagain');
    ok(id + ': a "show me again" button', await ag.count() === 1);
    if (await ag.count() === 1) { await ag.click(); await sleep(300); const again = await tapThrough();
      ok(id + ': "show me again" brings the lesson back, then the activity', again.length === seen.length && await ready(sel)); }
  }
  // code-maze: the repeat block gets its own lesson the first time a level has it
  await p.evaluate(() => { const s = window.TAL.S(); s.code = {}; for (let k = 0; k < 6; k++) s.code[k] = 3; window.LESSONS.mark('code-rep', 0); });
  await open('code-maze'); await sleep(200); await p.locator('#sTal .lvgo').click(); await sleep(300);
  const rp = await tapThrough();
  ok('code-maze: the repeat block lesson before the first level with it', rp.length >= 1 && rp.some(x => /פִּי 2/.test(x.t)) && await ready('.cboard'), JSON.stringify(rp.map(x => x.t)));
  await open('code-maze'); await sleep(200); await p.locator('#sTal .lvgo').click(); await sleep(300);
  ok('code-maze: the repeat lesson shown once', !(await card()) && await ready('.cboard'));
  // math training: every mental-math strategy has its own lesson; the round's strategies are taught before its first question
  const MS = ['math-ten', 'math-dbl', 'math-comp', 'math-skip', 'math-pv'];
  ok('ln-math: a lesson for each mental-math strategy', await p.evaluate(ms => ms.every(id => window.LESSONS.DEF[id] && window.LESSONS.DEF[id].cards.length), MS));
  await p.evaluate(ms => ms.forEach(l => window.LESSONS.mark(l, 0)), MS);
  await open('ln-math'); await sleep(300);
  const mc = await card();
  ok('ln-math, first time: a strategy lesson comes first', !!mc && NIK.test(mc.t) && mc.btns === 1, JSON.stringify(mc));
  const mt = await tapThrough();
  const mseen = await p.evaluate(ms => ms.filter(l => window.LESSONS.seen(l)), MS);
  ok('ln-math: after the lesson, the questions; that strategy is marked seen', mt.length >= 1 && mseen.length >= 1 && await ready('.lnr .chs'), JSON.stringify(mseen));
  await p.evaluate(ms => ms.forEach(l => window.LESSONS.mark(l, 1)), MS);
  await open('ln-math'); await sleep(300);
  ok('ln-math, strategies seen: no lesson, a "show me again" button', !(await card()) && await ready('.lnr .chs') && await p.locator('#sTal .lcagain').count() === 1);
  const allIds = [...GATES.flatMap(g => g[1]), 'code-rep', ...MS];
  ok('#258: every new lesson line is in the voice list', await p.evaluate(ids => { const sl = window.LESSONS.speakList(); return ids.every(id => window.LESSONS.DEF[id].cards.every(c => sl.includes(c.t))); }, allIds));

  // ---- voice list ----
  const sl = await p.evaluate(() => window.LESSONS.speakList());
  ok('every lesson line is in the voice list, in Hebrew with nikud', sl.length >= 8 && sl.every(t => /[א-ת]/.test(t) && NIK.test(t)), JSON.stringify(sl));
  ok('no horizontal overflow', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); L.finish('lessoncard-' + L.variant, res);
})().catch(e => { console.error(e); res.push('FAIL crashed — ' + e.message); L.finish('lessoncard-' + L.variant, res); });
