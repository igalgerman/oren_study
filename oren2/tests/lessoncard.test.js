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
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; window.__noFamily = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await L.noCoach(p);
  await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; });
  ok('LESSONS module is there', await p.evaluate(() => !!(window.LESSONS && window.LESSONS.show && window.LESSONS.first)));
  const card = () => p.evaluate(() => { const s = document.querySelector('#sTal'); const c = s.querySelector('.lccard');
    return c ? { t: c.querySelector('.sent').textContent, art: !!c.querySelector('.lcart svg,.lcart .e2let,.lcart .pic'), btns: [...s.querySelectorAll('button')].filter(x => x.offsetParent && !x.closest('.lccard')).length,
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

  // ---- voice list ----
  const sl = await p.evaluate(() => window.LESSONS.speakList());
  ok('every lesson line is in the voice list, in Hebrew with nikud', sl.length >= 8 && sl.every(t => /[א-ת]/.test(t) && NIK.test(t)), JSON.stringify(sl));
  ok('no horizontal overflow', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok('no page errors', errs.length === 0, errs.join(' | '));
  await b.close(); L.finish('lessoncard-' + L.variant, res);
})().catch(e => { console.error(e); res.push('FAIL crashed — ' + e.message); L.finish('lessoncard-' + L.variant, res); });
