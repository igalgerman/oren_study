// #634 no limits, no repeats: a simulated day of 60 minutes (each mission ~90 s of play) on home, the way Oren taps
// (the "continue where I stopped" card when there is one, else the first card; the story ending; the topic-rest cards).
// It never shows an end screen (time-up lock, a "day done" screen, a home with nothing to press) and no mission repeats
// while an unseen one exists. Also: the 3 missions the owner saw with 0 questions log their questions; the body scan
// (no questions) is not on the path; a quiz opened again the same day does not ask the same questions while new ones exist.
// Usage: node tests/fullday.test.js
const L = require('./lib');
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const out = []; const ok = (c, m, info) => out.push((c ? 'PASS ' : 'FAIL ') + m + (c || info == null ? '' : ' — ' + info));
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; window.__noFamily = true; window.__moments = false; window.__health = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await p.waitForFunction(() => window.TAL && window.TAL.S && window.HEALTH); await L.noCoach(p);
  await p.evaluate(() => { const T = window.TAL, O = window.OREN, H = window.HEALTH; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' };
    T.S().coach = Object.assign(T.S().coach || {}, { tour: 1 }); delete T.S().daily;
    /* body breaks and meals stay out of this day (they pause play, they don't end it); the topic rest is real */
    T.S().set.hl = { off: { water: 1, toilet: 1, move: 1, eyes: 1, meal: 1 } };
    window.__t = Date.now(); H.clock = () => window.__t; });

  const SEC = 90, DAY = 60 * 60;
  const st = { t: 0, seq: [], ends: [], reps: [], homes: 0 };
  /* one mission played: ~90 s of active time in its domain, then the activity ends the usual way */
  const play = id => p.evaluate(({ id, SEC }) => {
    const T = window.TAL, O = window.OREN, H = window.HEALTH; const r = H.day(); const dm = H.domOf(id);
    window.__t += SEC * 1000; r.on += SEC; if (dm) r.dom[dm] = (r.dom[dm] | 0) + SEC; const s = T.S(); s.time[O.today()] = (s.time[O.today()] | 0) + SEC;
    if (id !== 'math' && !/:/.test(id)) { s.last = { id, d: O.today() }; T.record(id, 3); }  /* marked before the path is re-checked, as a finished mission is */
    const d = T.dailyEnsure();
    if (id === 'math') { O.emit('levelDone', { id: 'sim' }); }
    else if (/:/.test(id)) { const k = d.t.findIndex((x, i) => x === id && !d.done[i]); if (k >= 0) d.done[k] = 1; O.persist(); }
    O.showMap(); }, { id, SEC });
  /* was a mission seen today while another one in the pool was not? */
  const note = async id => {
    if (id !== 'math' && !/:/.test(id)) {
      if (st.seq.includes(id)) { if (process.env.DBG) console.log('REP', id, await p.evaluate(() => { const d = window.TAL.S().daily; return JSON.stringify({ t: d.t, bs: d.bs, ch: d.ch, last: window.TAL.S().last }); })); const left = await p.evaluate(seen => window.TAL.dailyPool().filter(x => !seen.includes(x)).length, st.seq); if (left) st.reps.push(id + ' @' + st.seq.length + ' (' + left + ' unseen)'); }
    }
    st.seq.push(id); };
  for (let n = 0; st.t < DAY && n < 200; n++) {
    await sleep(60);
    const v = await p.evaluate(() => { const q = s => document.querySelector(s); const home = q('#sHome') && !q('#sHome').hidden;
      const big = q('#sHome .bigbtn.huge'); const d = window.TAL.S().daily;
      return { home, ov: q('#ov') && !q('#ov').hidden, lock: !!q('.tlock'), hl: !!q('.hlock'), topic: !!q('.hlock .hcards .dcard'),
        done: !!q('#sHome .frdone,#sHome .frbadge'), cards: document.querySelectorAll('#sHome .dchoice .dcard').length, cont: !!q('#sHome .dchoice .dcard.cont'),
        big: big ? big.textContent : '', nx: d ? d.done.findIndex(x => !x) : -1, id: d && d.done.findIndex(x => !x) >= 0 ? d.t[d.done.findIndex(x => !x)] : null }; });
    if (v.lock) { st.ends.push('time-up lock @' + Math.round(st.t / 60) + ' min'); break; }
    if (v.topic) { /* "we did a lot of X today": Oren taps the first other topic; that mission plays */
      const id = await p.evaluate(() => { let got = null; const T = window.TAL; Object.keys(T.ACT).forEach(k => { const a = T.ACT[k]; if (!a._sim) { const r = a.run; a.run = bk => { window.__ran = k; return r(bk); }; a._sim = 1; } });
        window.__ran = null; document.querySelector('.hlock .hcards .dcard').click(); return window.__ran || (window.HEALTH.current() === 'math' ? 'math' : null); });
      await sleep(150); if (id) { await note(id); await play(id); st.t += SEC; } else await p.evaluate(() => window.OREN.showMap());
      continue; }
    if (v.hl) { await p.evaluate(() => { const b = document.querySelector('.hlock .bigbtn,.hlock .hface'); if (b) b.click(); }); continue; }
    if (v.ov) { await p.evaluate(() => { const bs = [...document.querySelectorAll('#ov .bigbtn')]; const b = bs.find(x => /אַחַר כָּךְ/.test(x.textContent)) || bs[0]; if (b) b.click(); else document.querySelector('#ov').hidden = true; }); continue; }
    if (!v.home) { await p.evaluate(() => window.OREN.showMap()); continue; }
    st.homes++;
    if (v.done) { st.ends.push('"day done" screen @' + Math.round(st.t / 60) + ' min'); break; }
    if (v.cards) { await p.evaluate(c => document.querySelector(c ? '#sHome .dchoice .dcard.cont' : '#sHome .dchoice .dcard').click(), v.cont); continue; }
    if (v.nx >= 0 && v.id) { await note(v.id); await play(v.id); st.t += SEC; continue; }
    if (/סוֹף הַסִּפּוּר/.test(v.big)) { await p.evaluate(() => document.querySelector('#sHome .bigbtn.huge').click()); continue; }
    st.ends.push('home with nothing to press @' + Math.round(st.t / 60) + ' min: ' + JSON.stringify(v)); break;
  }
  ok(st.t >= DAY && !st.ends.length, '#634 a simulated 60-minute day never shows an end screen', Math.round(st.t / 60) + ' min, ' + st.seq.length + ' missions; ' + st.ends.join('; '));
  ok(st.seq.length >= 40 && !st.reps.length, '#634 no mission repeats in the day while an unseen one exists', st.reps.join('; ') + ' | ' + st.seq.join(' '));

  /* #634 the missions opened with 0 questions in the owner's log: read-build and the English scene log each question; the body scan has none and is not on the path */
  const evq = async (id, answer) => { await p.evaluate(id => { window.__evq = 0; window.__eva = 0; const O = window.OREN; if (!O.__evw) { O.__evw = 1; const q = O.evQ, a = O.evAns; O.evQ = (...x) => { window.__evq++; return q(...x); }; O.evAns = (...x) => { window.__eva++; return a(...x); }; }
      window.TAL.ACT[id].run(() => window.OREN.showMap()); }, id); await sleep(500);
    if (answer) await p.evaluate(answer); await sleep(300);
    const r = await p.evaluate(() => ({ q: window.__evq, a: window.__eva })); await p.evaluate(() => window.OREN.showMap()); return r; };
  const rb = await evq('read-build', () => { const R = window.__rb2; if (R) R.need.forEach(x => { const t = [...R.row.children].find(y => !y.disabled && y.dataset.t === x); if (t) t.click(); }); });
  ok(rb.q >= 1 && rb.a >= 1, '#634 read-build logs its question and the answer (the log showed 0 questions)', JSON.stringify(rb));
  const en = await p.evaluate(() => !!(window.TAL.ACT['en-day'] && window.TAL.ACT['en-day'].inPath && window.TAL.ACT['en-day'].inPath()));
  if (en) {
    const r = await p.evaluate(async () => { window.__evq = 0; window.__eva = 0; window.TAL.ACT['en-day'].run(() => window.OREN.showMap());
      for (let k = 0; k < 8 && !window.__evq; k++) { await new Promise(r => setTimeout(r, 300)); const go = document.querySelector('#sTal .e2go'); if (go) go.click(); }
      await new Promise(r => setTimeout(r, 300)); const a = window.__quiz && window.__quiz.ans; const row = document.querySelector('#sTal .chs'); if (row && a != null && row.children[a]) row.children[a].click();
      await new Promise(r => setTimeout(r, 200)); return { q: window.__evq, a: window.__eva }; });
    await p.evaluate(() => window.OREN.showMap());
    ok(r.q >= 1 && r.a >= 1, '#634 the English scene logs its questions and answers (the log showed 0 questions)', JSON.stringify(r));
  } else ok(false, '#634 the English scene is on for a fresh save', 'en-day not in the path');
  const ms = await p.evaluate(() => ({ inPool: window.TAL.dailyPool().includes('mind-scan'), act: !!window.TAL.ACT['mind-scan'] }));
  ok(ms.act && !ms.inPool, '#634 the body scan (no questions) is not a path mission; its building still has it', JSON.stringify(ms));

  /* #634 questions: a quiz opened again today does not repeat a question while new ones exist (flags: many more than one round) */
  const fl = await p.evaluate(async () => { const keys = []; for (let k = 0; k < 3; k++) { window.TAL.ACT['world-flag'].run(() => {});
      await new Promise(r => setTimeout(r, 200)); const Q = window.__quiz; keys.push(...((Q && Q.keys) || []));
      for (let j = 0; Q && j < 12 && !document.querySelector('#ov:not([hidden])'); j++) { const i0 = Q.i, row = document.querySelector('#sTal .chs'); const bt = row && row.children[Q.ans]; if (bt) bt.click();
        for (let w = 0; w < 30 && Q.i === i0 && !document.querySelector('#ov:not([hidden])'); w++) await new Promise(r => setTimeout(r, 100)); }
      window.OREN.showMap(); }
    const all = new Set(keys).size; let early = 0; keys.forEach((k, i) => { const before = new Set(keys.slice(0, i)); if (before.has(k) && before.size < all) early++; });
    return { keys, all, early }; });
  ok(fl.keys.length >= 10 && fl.all >= 5 && !fl.early, '#634 world-flag opened 3 times today: no flag twice before every flag was asked', fl.keys.join(' '));

  ok(!errs.length, 'no page errors', errs.join(' | '));
  await b.close(); L.finish('fullday', out);
})();
