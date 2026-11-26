// #44 pause button + autosave of the place: a reload in the middle of a task brings Oren back to the same task and question
// (math level, quiz activity); the pause button stops the game and a reload brings it back paused; leaving / finishing = no resume.
const L = require('./lib'); const { chromium } = require('playwright'); const sleep = L.sleep; const path = require('path');
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
(async () => { const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { window.__fast = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await L.noCoach(p);
  await p.evaluate(() => { const O = window.OREN; O.save.story.intro = 1; window.TAL.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; O.persist(); });
  const vis = sel => p.evaluate(s => { const e = document.querySelector(s); if (!e || e.hidden) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; }, sel);
  const here = () => p.evaluate(() => JSON.parse(localStorage.getItem('oren4-here') || 'null'));
  // close the game and open it again: Oren taps his card on the start screen
  const reopen = async () => { await p.reload(); await L.noCoach(p); await p.click('#btnStart'); await sleep(900); };
  const mathAt = () => p.evaluate(() => { const P = window.__oren4.play; return P ? { id: P.lv.id, i: P.i, k: window.__oren4.qkey(P.qs[P.i]), on: document.querySelectorAll('#hudMid .pb.on').length } : null; });
  const ansMath = async () => { await sleep(500); const a = await p.evaluate(() => { const P = window.__oren4.play; if (P.choice) { P.choice.row.children[P.choice.ans].click(); return null; } return (P.boxes || []).filter(x => !x.done).map(x => String(x.ans)); });
    if (a) { for (const v of a) await p.keyboard.type(v); await p.keyboard.press('Enter'); } await sleep(1200); };

  // home: no pause button
  await p.evaluate(() => window.OREN.showMap()); await sleep(300);
  ok('home: no pause button', !await vis('#btnPause'));

  // --- math level: two answers, reload, same level at the same question ---
  await p.evaluate(() => { const O = window.OREN; const lv = O.ALLLV.find(x => x.type === 'chal'); O.save.story[lv.w.id + '-in'] = 1; O.persist(); O.startLevel(lv); }); await sleep(500);
  ok('math level: one pause button in the top bar', await vis('#btnPause') && await p.evaluate(() => document.querySelectorAll('#hud #btnPause').length === 1));
  await ansMath(); await ansMath();
  const m0 = await mathAt();
  ok('math level: two answered', m0 && m0.i === 2, JSON.stringify(m0));
  const t0 = await p.evaluate(() => window.OREN.save.t);
  await reopen();
  const m1 = await mathAt();
  ok('reload mid-level: back in the same level', await vis('#sPlay') && m1 && m1.id === m0.id, JSON.stringify({ m0, m1 }));
  ok('reload mid-level: the same question, two done in the progress bar', m1 && m1.i === 2 && m1.k === m0.k && m1.on === 2, JSON.stringify({ m0, m1 }));
  await ansMath();
  ok('after the resume he goes on answering', (await mathAt() || {}).i === 3);

  // --- pause ---
  const tFam = await p.evaluate(() => window.OREN.save.t);
  await p.click('#btnPause'); await sleep(300);
  const pz = await p.evaluate(() => { const o = document.querySelector('.pzov'); const r = o && o.getBoundingClientRect(); return o ? { full: r.width >= innerWidth - 1 && r.height >= innerHeight - 1 && getComputedStyle(o).position === 'fixed', btn: o.querySelectorAll('button').length, txt: o.textContent, paused: document.body.classList.contains('paused') } : null; });
  ok('pause: one full-screen overlay with ONE button (continue)', pz && pz.full && pz.btn === 1 && pz.paused, JSON.stringify(pz));
  ok('pause: kid text with nikud', pz && /עָצַרְנוּ/.test(pz.txt) && /מַמְשִׁיכִים/.test(pz.txt), pz && pz.txt);
  await L.shot(p, { path: path.join(L.SHOTDIR, 'pause-' + L.variant + '.png') });
  ok('pause: saving the place does not touch the family save (no cloud write)', await p.evaluate(t => window.OREN.save.t === t && !('here' in JSON.parse(localStorage.getItem('oren4-v1'))), tFam));
  const tm = await p.evaluate(() => { const O = window.OREN, d = O.today(); const a = (O.save.time || {})[d] | 0; document.querySelector('#hud').hidden = false; O.timeTick(); return [a, (O.save.time || {})[d] | 0]; });
  ok('pause: play time does not count while paused', tm[0] === tm[1], JSON.stringify(tm));
  const mP = await mathAt(), iP = mP.i; await p.keyboard.type('12'); await sleep(300);
  ok('pause: the keyboard does not answer under the overlay', (await mathAt()).i === iP && await p.evaluate(() => (window.__oren4.play.boxes || []).every(x => x.val === '')));
  await reopen();
  ok('reload while paused: back in the level, still paused', await vis('#sPlay') && await vis('.pzov') && (await mathAt()).i === iP);
  ok('reload while paused: the same question', (await mathAt()).k === mP.k && (await here()).pz === 1);
  await p.click('.pzov button'); await sleep(300);
  ok('continue: the overlay goes away', !await vis('.pzov') && !await p.evaluate(() => document.body.classList.contains('paused')) && (await here()).pz !== 1);
  await ansMath();
  ok('continue: he answers on', (await mathAt()).i === iP + 1);
  const tm2 = await p.evaluate(() => { const O = window.OREN, d = O.today(); const a = (O.save.time || {})[d] | 0; document.querySelector('#hud').hidden = false; O.timeTick(); return [a, (O.save.time || {})[d] | 0]; });
  ok('continue: play time counts again', tm2[1] > tm2[0], JSON.stringify(tm2));

  // --- back = he chose to stop: no resume ---
  await p.click('#btnBack'); await sleep(400);
  ok('back from the level: the place is forgotten', await here() === null);

  // --- quiz activity ---
  await p.evaluate(() => window.TAL.ACT['read-first'].run(window.OREN.showMap)); await sleep(500);
  const ansQ = async () => { await sleep(500); await p.evaluate(() => { const q = window.__quiz; q.wrap.querySelector('.chs').children[q.ans].click(); }); await sleep(1500); };
  await ansQ(); await ansQ();
  const q0 = await p.evaluate(() => window.__quiz.i);
  await reopen();
  const q1 = await p.evaluate(() => ({ i: window.__quiz && window.__quiz.i, con: !!(window.__quiz && window.__quiz.wrap.isConnected), on: document.querySelectorAll('#hudMid .pb.on').length, hud: document.querySelector('#hud').textContent }));
  ok('reload mid-quiz: the same activity at the same question', q0 === 2 && q1.con && q1.i === 2 && q1.on === 2 && /אוֹת רִאשׁוֹנָה/.test(q1.hud), JSON.stringify({ q0, q1 }));
  ok('mid-quiz: the pause button is there too', await vis('#btnPause'));
  // finishing it = no resume
  await p.evaluate(() => window.TAL.record('read-first', 3)); await sleep(100);
  ok('a finished activity is not resumed', await here() === null);
  await reopen();
  ok('after finishing, reopening goes home', await vis('#sHome') || await vis('#sMap'));

  // --- timed rounds stand still while paused (review of #532): the clock, the falling letters, no result behind the card ---
  const ovUp = () => p.evaluate(() => !document.querySelector('#ov').hidden);
  await p.evaluate(() => window.TAL.ACT['type-rain'].run(window.OREN.showMap)); await sleep(1500);
  const rain = () => p.evaluate(() => ({ t: (document.querySelector('#sTal .score') || {}).textContent, y: (window.__rain.blocks || []).map(o => Math.round(o.y)).join(',') }));
  await p.click('#btnPause'); await sleep(200); const r0 = await rain(); await sleep(2000); const r1 = await rain();
  ok('rain paused 2 s: the clock and the letters did not move, no result card', r0.t === r1.t && r0.y === r1.y && r0.y !== '' && !await ovUp(), JSON.stringify({ r0, r1 }));
  await p.click('.pzov button'); await sleep(1500); const r2 = await rain();
  ok('rain after continue: the clock runs again', r2.t !== r1.t && /⏱️/.test(r2.t), JSON.stringify({ r1, r2 }));
  await p.click('#btnBack'); await sleep(300);
  // an arcade round (45 s, ~3 s in the fast test mode)
  await p.evaluate(() => { window.TAL_arcade(window.OREN.showMap); window.__arc.start('balloon'); }); await sleep(700);
  const arc = () => p.evaluate(() => ({ t: (document.querySelector('#sTal .gstat .tm') || {}).textContent, y: [...document.querySelectorAll('#sTal .bal')].map(e => e.style.top).join(',') }));
  ok('arcade round: the pause button is there', await vis('#btnPause'));
  await p.click('#btnPause'); await sleep(200); const a0 = await arc(); await sleep(2500); const a1 = await arc();
  ok('arcade paused: the clock and the balloons did not move, the round did not end', a0.t === a1.t && a0.y === a1.y && !await ovUp(), JSON.stringify({ a0, a1 }));
  await p.click('.pzov button'); await sleep(4000);
  ok('arcade after continue: the round runs on to its end', await ovUp());
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.OREN.showMap(); }); await sleep(300);
  // the math speed round (60 s)
  await p.evaluate(() => { const O = window.__oren4; O.playSpeed(O.WORLDS[0]); }); await sleep(500);
  await p.click('#btnPause'); await sleep(200);
  const sp0 = await p.evaluate(() => window.__oren4.play.end - Date.now()); await sleep(1500); const sp1 = await p.evaluate(() => window.__oren4.play.end - Date.now());
  ok('speed round paused: the time left stays', Math.abs(sp0 - sp1) < 400, JSON.stringify([sp0, sp1]));
  await p.click('.pzov button'); await p.click('#btnBack'); await sleep(300);

  // --- parent play (sandbox) never writes Oren's place ---
  await p.evaluate(() => { window.OREN.parentPlay(true, true); window.TAL.ACT['read-first'].run(window.OREN.showMap); }); await sleep(400);
  ok('parent play: no place saved', await here() === null);
  await p.evaluate(() => window.OREN.parentPlay(false));

  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); L.finish('resume-' + L.variant, res); })().catch(e => { console.error(e); res.push('FAIL crash ' + e.message); L.finish('resume', res); process.exit(1); });
