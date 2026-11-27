// Batch #457 — how the kid screens feel:
// #393 the top progress strip: the hero chases the Mixer (one step per finished mission, the last one catches him), same size as the old dots.
// #427 the end of a mission: one fixed 2 s celebration, always the same; confetti + music only as bigCelebration() at the end of a story chapter.
// #421 the instruction lights up word by word while the voice reads it (the stories' word light); the whole line when the timing is unknown.
const L = require('./lib');
const { chromium } = require('playwright'); const sleep = L.sleep;
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const PHONE = L.variant === 'phone';
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  /* a fake Google voice: every clip waits for __next() while __hold, else plays __clipMs ms; __dur = the clip length it reports (undefined = unknown) */
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__noFamily = true; window.__listen = false; window.__fast = true;
    window.__aLog = []; window.__hold = false; window.__clipMs = 30; window.__dur = undefined;
    window.Audio = function (u) { const t = new URLSearchParams(String(u).split('?')[1] || '').get('t'); const a = { paused: false, pause() { a.paused = true; }, addEventListener() {},
      get duration() { return window.__dur; },
      play() { setTimeout(() => { if (a.paused) return; a.onplay && a.onplay(); a.onplaying && a.onplaying(); window.__aLog.push(t);
        window.__next = () => { if (!a.paused) a.onended && a.onended(); }; if (!window.__hold) setTimeout(window.__next, window.__clipMs); }, 5); return Promise.resolve(); } }; return a; };
    setInterval(() => { if (window.__gv) window.__gv.ok = true; }, 20); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(L.URL); await L.noCoach(p);
  await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; O.showMap(); });
  await sleep(300);

  // ================= #393 the hero chases the Mixer =================
  const strip = (n, k, all) => p.evaluate(([n, k, all]) => { const O = window.OREN, T = window.TAL, d = T.dailyEnsure();
    d.t = Array(n).fill('math'); d.done = Array(n).fill(0).map((_, j) => j < k ? 1 : 0); d.bs = 0; d.ch = 'math'; O.persist();
    O.setScreen('sTal', 'meadow', O.showMap); window.FRIEND.stepStart(Math.min(k, n - 1));
    if (all) { d.done = d.done.map(() => 1); window.PATHBAR.render(); }
    const e = document.querySelector('#hudMid #frPath'); if (!e) return null; const R = x => x && x.getBoundingClientRect();
    const hr = e.querySelector('.fph'), mx = e.querySelector('.fpm'), t = e.querySelector('.fpt'), a = R(hr), m = R(mx), r = R(e);
    return { w: r.width, h: r.height, dots: e.querySelectorAll('i').length, btn: e.querySelectorAll('button').length, hero: !!(hr && hr.querySelector('svg')), mix: !!(mx && mx.querySelector('svg')),
      k: t ? +t.dataset.k : -1, caught: !!(t && t.classList.contains('caught')), touch: !!(a && m && a.left < m.right && a.right > m.left),
      gap: a && m ? Math.min(Math.abs(m.left - a.right), Math.abs(a.left - m.right)) : -1, hx: a ? a.left + a.width / 2 : 0, mxx: m ? m.left + m.width / 2 : 0, label: e.getAttribute('aria-label') }; }, [n, k, !!all]);
  /* the old dots strip measured on 27 Nov 2026: desktop 64 + 14 px per mission x 24 high, phone 51 + 11 px x 19 high */
  const oldW = n => PHONE ? 51 + 11 * n : 64 + 14 * n, oldH = PHONE ? 19 : 24;
  const bad = [];
  for (let n = 1; n <= 6; n++) {
    let prev = null;
    for (let k = 0; k < n; k++) { const s = await strip(n, k); if (!s) { bad.push(`n${n} k${k}: no strip`); continue; }
      if (!s.hero || !s.mix || s.dots || s.btn) bad.push(`n${n} k${k}: hero/mixer/dots/button ${JSON.stringify(s)}`);
      if (s.k !== k || s.caught || s.touch) bad.push(`n${n} k${k}: step/caught ${JSON.stringify(s)}`);
      if (s.label !== `${k}/${n}`) bad.push(`n${n} k${k}: label ${s.label}`);
      if (prev && !(Math.abs(s.hx - s.mxx) < Math.abs(prev.hx - prev.mxx) - 3)) bad.push(`n${n} k${k}: not closer ${prev.hx}->${s.hx} (mixer ${s.mxx})`);
      if (s.h > oldH + 0.5 || s.w > oldW(n) + 10) bad.push(`n${n} k${k}: size ${s.w}x${s.h} (old ${oldW(n)}x${oldH})`);
      prev = s; }
    const c = await strip(n, n - 1, true);
    if (!c || !c.caught || !c.touch || c.k !== n || c.label !== `${n}/${n}`) bad.push(`n${n}: last mission, no catch ${JSON.stringify(c)}`);
  }
  ok('#393 1..6 missions: hero + Mixer (no dots, no button), one step closer per finished mission, the last one catches him, size as before', !bad.length, bad.join(' | '));
  await strip(5, 2); await L.shot(p, { path: L.SHOTDIR + `/393-strip-${L.variant}.png` });
  await strip(5, 4, true); await sleep(200); await L.shot(p, { path: L.SHOTDIR + `/393-caught-${L.variant}.png` });
  await p.evaluate(() => window.OREN.showMap()); await sleep(100);
  ok('#393 home: no strip', await p.evaluate(() => !document.querySelector('#frPath')));

  // ================= #427 calm celebration =================
  /* count the big things: the win music (sfx.win) and the confetti rain */
  await p.evaluate(() => { const O = window.OREN; window.__big = { win: 0 }; const w = O.sfx.win; O.sfx.win = (...a) => { window.__big.win++; return w(...a); }; });
  const cel = () => p.evaluate(() => ({ win: window.__big.win, rain: (window.__celeb || {}).rain | 0, calm: (window.__celeb || {}).calm | 0, big: (window.__celeb || {}).big | 0,
    card: !!document.querySelector('#ov:not([hidden]) .card.celeb') }));
  const zero = () => p.evaluate(() => { window.__big.win = 0; if (window.__celeb) Object.assign(window.__celeb, { rain: 0, calm: 0, big: 0 }); });
  ok('#427 bigCelebration() exists', await p.evaluate(() => typeof window.OREN.bigCelebration === 'function'));
  // an activity mission (quiz / maze / memory use the same result card)
  await zero(); await p.evaluate(() => { window.__fast = false; window.TAL.finishAct('think-maze', 0, 1, 3, () => {}, null, 'יָצָאתָ מֵהַמָּבוֹךְ!'); }); await sleep(150);
  let c1 = await cel(); await sleep(2100); let c2 = await cel();
  ok('#427 activity mission: one calm celebration on the card, no confetti, no win music', c1.calm === 1 && c1.card && !c1.win && !c1.rain && !c1.big, JSON.stringify(c1));
  ok('#427 ...it lasts 2 s', c1.card && !c2.card, JSON.stringify({ c1, c2 }));
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; });
  // a math level
  await zero(); await p.evaluate(() => { window.__fast = true; const X = window.__oren4, lv = X.ALLLV.find(l => l.type === 'game'); X.save.story[lv.w.id + '-in'] = 1; X.startLevel(lv); });
  await sleep(300); await p.evaluate(() => { window.__fast = false; window.__oren4.finishLevel(); }); await sleep(600);
  c1 = await cel(); await sleep(2000); c2 = await cel();
  ok('#427 math level: the same calm celebration, 2 s, no confetti, no win music', c1.calm === 1 && c1.card && !c2.card && !c1.win && !c1.rain && !c1.big, JSON.stringify({ c1, c2 }));
  const look = await p.evaluate(() => { const c = document.querySelector('#ov .card'); if (!c) return null; c.classList.add('celeb'); const a = getComputedStyle(c).animationName, d = getComputedStyle(c).animationDuration; return { a, d }; });
  ok('#427 the celebration is one fixed 2 s animation', look && look.a !== 'none' && look.d === '2s', JSON.stringify(look));
  await p.evaluate(() => { window.__fast = true; document.querySelector('#ov').hidden = true; window.OREN.showMap(); }); await sleep(100);
  // the end of a story chapter (scene 5 of a chapter): the big one; any other scene: only the calm one
  const pathMission = sc => p.evaluate(async sc => { const O = window.OREN, T = window.TAL, d = T.dailyEnsure(); O.save.mix = sc; d.t = ['think-maze', 'think-mem']; d.done = [0, 0]; d.bs = 0; d.ch = 'think'; d.claimed = 0; O.persist();
    window.FRIEND.stepStart(0); d.done[0] = 1; O.persist(); T.finishAct('think-maze', 0, 1, 3, () => {}, null, 'יָצָאתָ!'); await new Promise(r => setTimeout(r, 300)); }, sc);
  await zero(); await pathMission({ c: 1, s: 2 }); c1 = await cel();
  ok('#427 a mission in the middle of a chapter: calm only', c1.calm === 1 && !c1.big && !c1.win && !c1.rain, JSON.stringify(c1));
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; });
  await zero(); await pathMission({ c: 1, s: 5 }); c1 = await cel();
  ok('#427 the mission that ends a story chapter: the big celebration (confetti + music) once', c1.big === 1 && c1.win === 1 && c1.rain === 1, JSON.stringify(c1));
  ok('#427 ...the story moved on to the next chapter', await p.evaluate(() => JSON.stringify(window.OREN.save.mix)) === '{"c":2,"s":1}');
  await L.shot(p, { path: L.SHOTDIR + `/427-card-${L.variant}.png` });
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.OREN.showMap(); }); await sleep(100);

  // ================= #421 the instruction lights up word by word =================
  /* open a quiz, then read its question again with a held voice clip; sample which word of the question is lit */
  const open = id => p.evaluate(id => { window.__hold = false; window.TAL.ACT[id].run(() => {}); }, id);
  const readHeld = async (sel, dur) => p.evaluate(async ([sel, dur]) => { const O = window.OREN, el = document.querySelector(sel); if (!el) return { none: 1 };
    window.__fast = false; window.__dur = dur; window.__hold = true; window.__aLog = []; O.hush(); await new Promise(r => setTimeout(r, 50)); O.say(O.sayNow);
    const lit = () => { const ws = [...el.querySelectorAll('.rw')]; return ws.map((w, j) => w.classList.contains('on') ? j : -1).filter(j => j >= 0); };
    const seen = []; let words = 0, t0 = Date.now();
    /* every clip before the question's own (the goal, the story line): let it end */
    for (let k = 0; k < 200 && Date.now() - t0 < 7000; k++) { await new Promise(r => setTimeout(r, 40));
      const l = lit(); words = el.querySelectorAll('.rw').length; if (l.length) seen.push(l.join(','));
      if (!l.length && window.__next && window.__aLog.length && !seen.length && k % 3 === 2) window.__next(); }
    window.__next && window.__next(); window.__hold = false; await new Promise(r => setTimeout(r, 300)); window.__fast = true;
    return { words, seen: [...new Set(seen)], after: lit().length, log: window.__aLog.slice() }; }, [sel, dur]);
  await open('sci-body'); await sleep(400);
  let r = await readHeld('#sTal .tqc .qq', 4);
  const order = r.seen.map(x => x.split(',').map(Number));
  ok('#421 quiz question: its words light up one at a time, in order, while it is read', r.words > 2 && order.length >= Math.min(3, r.words) && order.every(x => x.length === 1) && order.every((x, j) => !j || x[0] > order[j - 1][0]) && order[0][0] === 0, JSON.stringify(r));
  ok('#421 ...the light goes out when the voice ends', r.after === 0, JSON.stringify(r));
  if (process.env.SHOTS) { await p.evaluate(() => { window.__fast = false; window.__dur = 4; window.__hold = true; const O = window.OREN; O.hush(); O.say(O.sayNow); });   /* a word lit, mid-question */
    await sleep(200); await p.evaluate(() => window.__next && window.__next()); await sleep(1200); await L.shot(p, { path: L.SHOTDIR + `/421-quiz-${L.variant}.png` });
    await p.evaluate(() => { window.__hold = false; window.__next && window.__next(); window.__fast = true; }); await sleep(300); }
  r = await readHeld('#sTal .tqc .qq', undefined);
  ok('#421 timing unknown: the whole line lights up while it is read', r.seen.length >= 1 && r.seen.includes([...Array(r.words).keys()].join(',')) && r.after === 0, JSON.stringify(r));
  ok('#421 no new button on the question', await p.evaluate(() => document.querySelectorAll('#sTal .tqc .qq button:not(.rdb)').length === 0));
  // the math play bubble, the home sentence
  await p.evaluate(() => { window.OREN.showMap(); }); await sleep(200);
  await p.evaluate(() => { const X = window.__oren4, lv = X.ALLLV.find(l => l.id === 'num-pv2-1') || X.ALLLV.find(l => l.type === 'game'); X.save.story[lv.w.id + '-in'] = 1; X.startLevel(lv); }); await sleep(500);
  r = await readHeld('#sPlay .wcard', 3);
  ok('#421 math word question: its words light one by one', r.words > 2 && r.seen.length >= 3 && r.seen.every(x => !x.includes(',')) && r.after === 0, JSON.stringify(r));
  await p.evaluate(() => { window.OREN.showMap(); }); await sleep(300);
  r = await readHeld('#sHome .hbub2', 3);
  ok('#421 home: the friend\'s sentence lights word by word', r.words > 1 && r.seen.length >= 2 && r.after === 0, JSON.stringify(r));
  // stories keep their own light (a tap on a line); the instruction light never runs at the same time
  ok('#421 the stories\' highlighter is the one used (T.readFollow in reading.js)', await p.evaluate(() => typeof window.TAL.readFollow === 'function'));
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); L.finish('feel', res);
})().catch(e => { console.log('FAIL crashed — ' + e.message); console.log('RESULT feel 0 1'); process.exitCode = 1; });
