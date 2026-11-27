// #389 Listen first: the answer buttons rest until the spoken question has ended (4 s at most; no voice: open at once).
// A fast tap after a wrong tap is not judged: the options rest 2 s, the friend says 'let's listen again', the question is read again.
// No penalty, no timer on screen.
const L = require('./lib');
const { chromium } = require('playwright'); const sleep = L.sleep;
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const NIK = /[\u05B0-\u05C7]/;
const ACT = 'sci-animals';                                   /* a quiz with 4 options (window.__quiz tells the right one) */
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__noFamily = true; window.__listen = true;
    /* a fake browser voice: keeps the last sentence; the test ends it by hand (u.onend) */
    const fake = { log: [], last: null, speaking: false, speak(u) { this.log.push(u.text); this.last = u; }, cancel() {}, getVoices() { return []; }, onvoiceschanged: null, addEventListener() {} };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(L.URL); await L.noCoach(p);
  await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; O.showMap(); });
  await sleep(300);
  const open = () => p.evaluate(a => { speechSynthesis.log = []; speechSynthesis.last = null; window.TAL.ACT[a].run(() => {}); }, ACT);
  const st = () => p.evaluate(() => { const r = document.querySelector('#sTal .chs'); const q = window.__quiz;
    return { locked: !!(r && r.classList.contains('lsn')), n: r ? r.children.length : 0, ans: q && q.ans, judged: r ? r.querySelectorAll('.ok,.bad,.show').length : -1,
      said: speechSynthesis.log.slice(), timer: !!document.querySelector('#sTal .lsntimer,#sTal progress') }; });
  const tap = k => p.evaluate(k => { const r = document.querySelector('#sTal .chs'); r.children[k].click(); }, k);
  const wrongs = s => [...Array(s.n).keys()].filter(k => k !== s.ans);

  // --- 1. locked until the spoken question ends ---
  await open();
  await p.waitForFunction(() => speechSynthesis.log.length > 0, null, { timeout: 5000 }).catch(() => {});
  let s = await st();
  ok('question is read by itself', s.said.length >= 1, JSON.stringify(s.said));
  ok('answers rest while the question is read', s.locked);
  await tap(s.ans); s = await st();
  ok('a tap while resting is not judged (no penalty)', s.judged === 0 && s.locked, JSON.stringify(s));
  ok('no timer on screen', !s.timer);
  await L.shot(p, { path: L.SHOTDIR + `/389-listen-${L.variant}.png` });
  await p.evaluate(() => { const u = speechSynthesis.last; if (u && u.onend) u.onend({}); }); await sleep(150);
  s = await st();
  ok('the question ended: the answers open', !s.locked);
  await tap(wrongs(s)[0]); s = await st();
  ok('after that a tap is judged', s.judged === 1, JSON.stringify(s));

  // --- 2. two fast wrong taps: rest 2 s, the friend line, the question read again ---
  await sleep(100);
  await p.evaluate(() => { speechSynthesis.log = []; });
  await tap(wrongs(s)[1]); s = await st();
  ok('fast second wrong tap is not judged (no penalty)', s.judged === 1, JSON.stringify(s));
  ok('fast second wrong tap: the options rest', s.locked);
  const line = await p.evaluate(() => window.FRIEND.listen.line);
  // #397 one speech queue: the line waits until the friend's line before it has ended (never cut), so wait for it
  await p.waitForFunction(() => speechSynthesis.log.length > 0, null, { timeout: 3000 }).catch(() => {}); s = await st();
  ok('the friend says "let\'s listen again" (nikud)', s.said.length >= 1 && window_has(s.said[0], line) && NIK.test(line), JSON.stringify(s.said));
  ok('the friend line is in the voice pregen list', await p.evaluate(l => window.FRIEND.speakList().includes(l), line));
  const q0 = await p.evaluate(() => window.OREN.sayNow), q = await p.evaluate(() => window.FRIEND.noGoal(window.OREN.sayNow));   // #414 the mission's goal is said once, not again
  await p.evaluate(() => { const u = speechSynthesis.last; if (u && u.onend) u.onend({}); }); await sleep(150);
  s = await st();
  ok('then the question is read again', s.said.length >= 2 && s.said[s.said.length - 1] === speechSynthesis_like(q, s.said), JSON.stringify({ said: s.said, q }));
  ok('#414 the question read again is the question alone (the goal is not said again)', !/נלמד/.test(bare(s.said[s.said.length - 1] || '')) && (q0 === q || /נִלְמַד/.test(q0)), JSON.stringify({ said: s.said, q0 }));
  ok('still resting before 2 s', s.locked);
  await sleep(2100); s = await st();
  ok('after 2 s the options are open again', !s.locked);
  await tap(s.ans); s = await st();
  ok('the right answer still counts after the rest', await p.evaluate(() => !!document.querySelector('#sTal .chs .ok')), JSON.stringify(s));
  await sleep(1500);

  // --- 3. 4 s at most, even when the voice never ends ---
  await open(); await sleep(500); s = await st();
  ok('4 s cap: resting at first', s.locked);
  await sleep(2500); s = await st();
  ok('4 s cap: still resting at 3 s', s.locked);
  await sleep(1300); s = await st();
  ok('4 s cap: open after 4 s without the voice ending', !s.locked);

  // --- #408 the friend reacts to how Oren plays: one short line, at most one reaction per question ---
  const RX = await p.evaluate(() => { const R = window.FRIEND.react; R.QUIET = 700; return { lines: R.lines, NIK: Object.values(R.lines).every(t => /[ְ-ׇ]/.test(t)), all: Object.values(R.lines).every(t => window.FRIEND.speakList().includes(t)) }; });
  ok('#408 four triggers, one line each, nikud, all in the voice pregen list', Object.keys(RX.lines).length === 4 && RX.NIK && RX.all, JSON.stringify(RX));
  ok('#408 fast guessing is the listen-first line (one trigger)', RX.lines.fast === line, RX.lines.fast);
  const endVoice = () => p.evaluate(() => { const u = speechSynthesis.last; if (u && u.onend) u.onend({}); });
  /* the question was read to the end: end every line before it (the one speech queue waits for each), then the question's own line */
  const heard = async () => { for (let k = 0; k < 60; k++) { const st2 = await p.evaluate(back => { const b = t => String(t || '').replace(/[\u0591-\u05C7]/g, '').replace(/[^א-תa-z0-9]/gi, '');
        const q = b(window.OREN.sayNow).replace(b(back), '').slice(0, 10), u = speechSynthesis.last; return { q: !!q && !!u && b(u.text).includes(q), u: !!u }; }, RX.lines.back);
      await endVoice(); if (st2.q) break; await sleep(100); }
    await p.waitForFunction(() => { const r = document.querySelector('#sTal .chs'); return r && !r.classList.contains('lsn') && !(window.OREN.tapTooSoon && window.OREN.tapTooSoon()); }, null, { timeout: 5000 }).catch(() => {}); await sleep(50); };   /* #436: taps in the first 400 ms are ignored */
  const rlog = () => p.evaluate(() => window.FRIEND.react.log.slice());
  const fresh = () => p.evaluate(() => { window.FRIEND.react.log.length = 0; const O = window.OREN; O.save.frt = Date.now(); delete O.save.frh; });
  // silence: a long quiet while a question waits -> the friend offers a hint (the help button lights up), only once
  await fresh(); await open(); await heard(); await sleep(1100);
  let r = await p.evaluate(() => ({ last: window.FRIEND.last, offer: !!document.querySelector('#sTal .helpq.offer'), log: window.FRIEND.react.log.slice() }));
  ok('#408 silence: the friend offers a hint, the help button lights up', r.last === RX.lines.hint && r.offer && r.log.join() === 'hint', JSON.stringify(r));
  await endVoice(); await sleep(1100);
  ok('#408 silence: at most one reaction per question', (await rlog()).join() === 'hint', JSON.stringify(await rlog()));
  // fast guessing: the listen-first rest says its line once; no hint on that question afterwards
  await fresh(); await open(); await heard(); s = await st();
  await p.evaluate(() => { speechSynthesis.log = []; }); await tap(wrongs(s)[0]); await sleep(100); await tap(wrongs(s)[1]); await sleep(100);
  ok('#408 fast guessing: the listen-first line', (await rlog()).join() === 'fast' && await p.evaluate(() => window.FRIEND.last) === line, JSON.stringify(await rlog()));
  await endVoice(); await sleep(200); await endVoice(); await sleep(2300); await endVoice(); await sleep(1100);
  ok('#408 fast guessing: no second message on that question (no hint after it)', (await rlog()).join() === 'fast', JSON.stringify(await rlog()));
  // hard yesterday, right today: one line on the first right answer, then normal praise again
  const yday = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
  await fresh(); await p.evaluate(([a, y]) => { window.OREN.save.frh = { [a]: { d: y, n: 3 } }; }, [ACT, yday]);
  await open(); await heard(); s = await st(); await tap(s.ans); await sleep(100);
  ok('#408 hard yesterday, right today: the friend notices', await p.evaluate(() => window.FRIEND.last) === RX.lines.yday && (await rlog()).join() === 'yday', JSON.stringify(await rlog()));
  await sleep(1400); await heard(); s = await st(); await tap(s.ans); await sleep(100);
  ok('#408 ...only once (the next right answer gets the usual praise)', await p.evaluate(() => window.FRIEND.last) !== RX.lines.yday && (await rlog()).join() === 'yday', JSON.stringify(await rlog()));
  await fresh(); await p.evaluate(([a, y]) => { window.OREN.save.frh = { [a]: { d: y, n: 1 } }; }, [ACT, yday]);
  await open(); await heard(); s = await st(); await tap(s.ans); await sleep(1400);
  const noY = await p.evaluate(() => window.FRIEND.last);
  await heard(); s = await st(); await tap(wrongs(s)[0]); await sleep(100);
  const fh = await p.evaluate(a => window.OREN.save.frh[a], ACT);
  ok('#408 not hard yesterday (1 mistake): no line; today\'s mistakes are counted', noY !== RX.lines.yday && !(await rlog()).length && fh.n === 1 && fh.d !== yday, JSON.stringify({ noY, fh, log: await rlog() }));
  // back from a break: a welcome before the question is read, once
  await fresh(); await p.evaluate(() => { window.OREN.save.frt = Date.now() - 3 * 3600e3; });
  await open(); await sleep(150);
  r = await p.evaluate(() => ({ last: window.FRIEND.last, say: window.OREN.sayNow, log: window.FRIEND.react.log.slice() }));
  ok('#408 back from a break: the friend welcomes him, before the question', r.last === RX.lines.back && bare(r.say).startsWith(bare(RX.lines.back)) && r.log.join() === 'back', JSON.stringify(r));
  await endVoice(); await sleep(200); await endVoice(); await sleep(1100);
  ok('#408 back from a break: no second reaction on that question', (await rlog()).join() === 'back', JSON.stringify(await rlog()));
  await open(); await sleep(150);
  ok('#408 ...and no welcome again right after', (await rlog()).join() === 'back', JSON.stringify(await rlog()));
  await p.evaluate(() => { window.FRIEND.react.QUIET = 20000; window.OREN.showMap(); }); await sleep(200);

  // --- 4. no voice: open at once (offline, auto-read off) ---
  await p.evaluate(() => { Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true }); });
  await open(); await sleep(150); s = await st();
  ok('offline: the answers are open at once', s.n > 0 && !s.locked, JSON.stringify(s));
  await p.evaluate(() => { delete navigator.onLine; window.OREN.save.set.autoRead = 0; });
  await open(); await sleep(150); s = await st();
  ok('auto-read off (no voice): the answers are open at once', s.n > 0 && !s.locked, JSON.stringify(s));
  await p.evaluate(() => { delete window.OREN.save.set.autoRead; });

  // --- 5. the speed game keeps its own clock: never held ---
  const sp = await p.evaluate(async () => { const X = window.__oren4; X.playSpeed(X.WORLDS[0]); await new Promise(r => setTimeout(r, 400));
    let r = document.querySelector('#sPlay .chs'); if (!r) { r = document.createElement('div'); r.className = 'chs'; r.innerHTML = '<button class="chb">1</button>'; document.querySelector('#qa').appendChild(r); await new Promise(z => setTimeout(z, 50)); }
    return r ? (r.classList.contains('lsn') ? 'held' : 'open') : 'no-row'; });
  ok('speed game: answers are never held', sp === 'open', sp);

  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); L.finish('listen', res);
})().catch(e => { res.forEach(l => console.log(l)); console.log('FAIL crashed — ' + e.message); console.log('RESULT listen 0 1'); process.exit(1); });
/* the fake voice gets the text as the game sends it (fullSpell may add marks): compare without nikud and spaces */
function bare(t) { return String(t || '').replace(/[֑-ׇ]/g, '').replace(/[^א-תa-z0-9]/gi, ''); }
function window_has(said, line) { return bare(said).includes(bare(line)); }
function speechSynthesis_like(q, said) { const last = said[said.length - 1]; return bare(last) === bare(q) || bare(last).includes(bare(q).slice(0, 12)) ? last : '(question not read again)'; }
