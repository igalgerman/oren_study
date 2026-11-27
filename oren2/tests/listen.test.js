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
  const q = await p.evaluate(() => window.OREN.sayNow);
  await p.evaluate(() => { const u = speechSynthesis.last; if (u && u.onend) u.onend({}); }); await sleep(150);
  s = await st();
  ok('then the question is read again', s.said.length >= 2 && s.said[s.said.length - 1] === speechSynthesis_like(q, s.said), JSON.stringify({ said: s.said, q }));
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
