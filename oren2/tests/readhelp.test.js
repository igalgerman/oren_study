// #613 one parent setting "עזרה בקריאה": read to him / tries first (default) / reads alone, and under "עוד" the wait,
// the reading speed, auto-read, reading the answers and the word light. One value (OREN.readHelp) decides everywhere; it syncs with the family save.
const { chromium } = require('playwright');
const L = require('./lib.js');
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const fast = s => Math.ceil(s * 1000 / 15) + 250;   /* D(): __fast runs the clock 15x */
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { window.__fast = true; window.__noFamily = true; try { localStorage.clear(); } catch (e) {}
    const fake = { log: [], speaking: false, pending: false, speak(u) { this.log.push(u.text); }, cancel() {}, getVoices() { return []; }, onvoiceschanged: null, addEventListener() {} };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await L.noCoach(p);
  await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; O.persist(); });
  const setRH = rh => p.evaluate(rh => { const s = window.TAL.S().set; if (rh === null) delete s.rh; else s.rh = rh; }, rh);
  // 1. defaults = the game as it was
  const d0 = await p.evaluate(() => window.OREN.readHelp());
  ok('default: tries first, 25 s, normal speed, auto-read, answers read, word light', d0.m === 'try' && d0.w === 25 && !d0.slow && d0.auto && d0.ans && d0.hi, JSON.stringify(d0));
  // 2. the parent panel: one box, the main choice in one row, the rest folded under "עוד"
  await p.evaluate(() => window.TAL.parentPanel('read')); await L.sleep(200);
  const pn = await p.evaluate(() => { const box = document.querySelector('#sPar .rhm').closest('.psec'), more = box.querySelector('.rhmore');
    return { t: box.textContent.includes('עזרה בקריאה'), main: [...box.querySelectorAll('.rhm .pchip')].map(x => x.textContent.trim()), on: (box.querySelector('.rhm .pchip.on') || {}).textContent,
      closed: !!more && !more.open, sum: more && more.querySelector('summary').textContent.trim(), rows: [...more.querySelectorAll('.popt')].map(r => r.dataset.k + ':' + r.querySelector('.pchip.on').textContent.trim()),
      voiceChip: [...document.querySelectorAll('#sPar .pchip')].filter(x => /הקראה אוטומטית/.test(x.textContent)).length }; });
  ok('panel: "עזרה בקריאה" with 3 choices, "קודם מנסה לבד" chosen', pn.t && pn.main.join('|') === 'מקריאים לו|קודם מנסה לבד|קורא לבד' && pn.on === 'קודם מנסה לבד', JSON.stringify(pn));
  ok('panel: 5 more options folded under "עוד", each on today\'s value', pn.closed && pn.sum === 'עוד' && pn.rows.join('|') === 'w:25 שניות|slow:רגילה|auto:כן|ans:כן|hi:כן' && !pn.voiceChip, JSON.stringify(pn));
  const st0 = await p.evaluate(() => +window.OREN.save.setT || 0);
  await p.locator('#sPar .rhm .pchip', { hasText: 'קורא לבד' }).click(); await L.sleep(100);
  const st1 = await p.evaluate(() => ({ m: window.OREN.readHelp().m, t: +window.OREN.save.setT || 0, on: document.querySelector('#sPar .rhm .pchip.on').textContent }));
  ok('a tap sets the value and marks the settings for the family save (setT)', st1.m === 'alone' && st1.t > st0 && st1.on === 'קורא לבד', JSON.stringify({ st0, st1 }));
  await p.evaluate(() => { document.querySelector('#sPar .rhmore').open = true; document.querySelector('#sPar .rhmore').dispatchEvent(new Event('toggle')); });
  for (const [k, lbl, want] of [['w', '45 שניות', ['w', 45]], ['slow', 'איטית', ['slow', true]], ['auto', 'רק בלחיצה על 🔊', ['auto', false]], ['ans', 'לא', ['ans', false]], ['hi', 'לא', ['hi', false]]]) {
    await p.locator(`#sPar .rhmore .popt[data-k="${k}"] .pchip`, { hasText: lbl }).click(); await L.sleep(60);
    const v = await p.evaluate(k => ({ v: window.OREN.readHelp()[k], open: document.querySelector('#sPar .rhmore').open, a: window.OREN.save.set.autoRead }), want[0]);
    ok(`"עוד" → ${k} = ${lbl}`, v.v === want[1] && v.open && (k !== 'auto' || v.a === 0), JSON.stringify(v));
  }
  await setRH(null); await p.evaluate(() => { delete window.OREN.save.set.autoRead; });
  // 3. stories: 🔊 ("read to me") and line taps at 0 s, by the setting (middle story level, where "tries first" waits)
  const story = (lv, k = 0) => p.evaluate(([k, lv]) => { const R = window.READBANK2; R.levelHook = lv ? () => lv : null; window.__rb2run.story(() => {}, k); }, [k, lv]);
  const vis = async () => { await L.sleep(120); return p.evaluate(() => { const pg = [...document.querySelectorAll('#sTal .story')].pop(); const rd = [...document.querySelectorAll('#sTal .strd')].pop();
    return { line: !!pg && !pg.classList.contains('noline'), all: !!rd && !rd.hidden && rd.offsetParent !== null }; }); };
  const wrongTap = async () => { await L.sleep(100); await p.evaluate(() => { const q = window.__quiz; const bs = [...q.wrap.querySelectorAll('.chs .chb')]; bs.find((x, k) => k !== q.ans).click(); }); };
  const afterWrong = async () => { await p.evaluate(() => document.querySelector('#sTal .stgo').click()); await wrongTap(); await p.evaluate(() => document.querySelector('#sTal .qside').click()); return vis(); };
  await setRH({ m: 'read' }); await story(3); let v = await vis();
  ok('story, "מקריאים לו": 🔊 and line taps at 0 s', v.line && v.all, JSON.stringify(v));
  const sayR = await p.evaluate(() => window.OREN.sayNow.replace(/[֑-ׇ]/g, ''));
  ok('story, "מקריאים לו": no "try to read alone first"', !/ננסה לקרא לבד/.test(sayR) && /קרא את הספור/.test(sayR), sayR);
  await setRH(null); await story(3); v = await vis();
  ok('story, default "קודם מנסה לבד" (middle level): hidden at 0 s', !v.line && !v.all, JSON.stringify(v));
  await setRH({ m: 'alone' }); await story(1); v = await vis();
  ok('story, "קורא לבד" (even at the lowest level): hidden at 0 s', !v.line && !v.all, JSON.stringify(v));
  await L.sleep(fast(12)); v = await vis();
  ok('story, "קורא לבד": still hidden later', !v.line && !v.all, JSON.stringify(v));
  v = await afterWrong();
  ok('story, "קורא לבד": both after a wrong answer', v.line && v.all, JSON.stringify(v));
  // the wait (tries first): 10 s → shown after ~10 s; 45 s → still hidden at ~25 s
  await setRH({ w: 10 }); await story(3); const a10 = await vis(); await L.sleep(fast(10)); const b10 = await vis();
  ok('wait 10 s: hidden at 0, shown after ~10 s', !a10.all && b10.all && b10.line, JSON.stringify([a10, b10]));
  await setRH({ w: 45 }); await story(3); await L.sleep(fast(25)); const c45 = await vis(); await L.sleep(fast(20)); const d45 = await vis();
  ok('wait 45 s: hidden at ~25 s, shown after ~45 s', !c45.all && d45.all, JSON.stringify([c45, d45]));
  ok('the lowest story level keeps about half the wait (10 of 25)', await p.evaluate(() => { const O = window.OREN; const s = window.TAL.S().set; s.rh = { w: 25 }; const a = window.TAL.storyHelp(1).all; s.rh = { w: 45 }; const b2 = window.TAL.storyHelp(1).all; delete s.rh; return a === 10 && b2 === 18; }));
  // 4. a reading sentence: the sentence's 🔊 at 0 s, by the setting
  const sent = async () => { await p.evaluate(() => window.TAL.ACT['read-sent'].run(() => {})); await p.waitForSelector('#sTal .tqc .sent .rdb', { state: 'attached' }); await L.sleep(60);
    return p.evaluate(() => { const s = document.querySelector('#sTal .tqc .sent'); const P = t => t.replace(/[֑-ׇ]/g, '').replace(/[^א-ת ]/g, '').replace(/\s+/g, ' ').trim();
      return { btn: s.querySelector('.rdb').offsetParent !== null, cue: !!document.querySelector('#sTal .rdcue'), said: P(window.OREN.sayNow).includes(P(window.TAL.plainHe(s.textContent))) }; }); };
  await setRH({ m: 'read' }); let s1 = await sent();
  ok('sentence, "מקריאים לו": 🔊 at 0 s, no "try" cue, the sentence is read with the question', s1.btn && !s1.cue && s1.said, JSON.stringify(s1));
  await setRH(null); s1 = await sent();
  ok('sentence, default "קודם מנסה לבד": 🔊 at 0 s, "try to read" cue, the sentence waits', s1.btn && s1.cue && !s1.said, JSON.stringify(s1));
  await setRH({ m: 'alone' }); s1 = await sent();
  ok('sentence, "קורא לבד": no 🔊 on the sentence at 0 s, not read; the question keeps its 🔊', !s1.btn && !s1.cue && !s1.said && await p.evaluate(() => document.querySelector('#sTal .tqc .qq .rdb').offsetParent !== null), JSON.stringify(s1));
  await p.waitForFunction(() => !(window.OREN.tapTooSoon && window.OREN.tapTooSoon()), null, { polling: 30 }); await p.evaluate(() => { const q = window.__quiz; [...q.wrap.querySelectorAll('.chs .chb')].find((x, k) => k !== q.ans).click(); }); await L.sleep(60);
  ok('sentence, "קורא לבד": 🔊 after a wrong answer', await p.evaluate(() => document.querySelector('#sTal .tqc .sent .rdb').offsetParent !== null));
  // 5. a value from another device (the family save, newer setT) takes effect on the next screen, without a reload
  await setRH(null); await p.evaluate(() => window.OREN.settleSet());
  await p.evaluate(() => { const O = window.OREN; const set = JSON.parse(JSON.stringify(O.save.set)); set.rh = { m: 'read', w: 10, slow: 1, ans: 0, hi: 0 }; set.autoRead = 0; O.mergeIn({ set, setT: Date.now() + 5000 }); });
  const sy = await p.evaluate(() => window.OREN.readHelp());
  ok('synced from another device: every option arrives', sy.m === 'read' && sy.w === 10 && sy.slow && !sy.auto && !sy.ans && !sy.hi, JSON.stringify(sy));
  await story(3); v = await vis();
  ok('synced from another device: the next story follows it (🔊 at 0 s), no reload', v.line && v.all, JSON.stringify(v));
  await setRH(null); await p.evaluate(() => { delete window.OREN.save.set.autoRead; });
  // 6. speed: slow plays the same recording at 0.8 (no other URL, the voice stays Kore)
  const spd = await p.evaluate(async () => { const O = window.OREN, made = []; const A0 = window.Audio;
    window.Audio = function (u) { const a = { u, playbackRate: 1, play() { setTimeout(() => { a.onplaying && a.onplaying(); setTimeout(() => a.onended && a.onended(), 10); }, 5); return Promise.resolve(); }, pause() {}, addEventListener() {} }; made.push(a); return a; };
    const g = window.__gv; const ok0 = g.ok, pd = g.pending; g.ok = true; g.pending = false; window.__fast = false; const wait = ms => new Promise(r => setTimeout(r, ms));
    const s = window.TAL.S().set; O.hush(); O.say('שָׁלוֹם אוֹרֶן'); await wait(150); s.rh = { slow: 1 }; O.hush(); O.say('שָׁלוֹם אוֹרֶן'); await wait(150); delete s.rh;
    O.hush(); window.__fast = true; g.ok = ok0; g.pending = pd; window.Audio = A0; return made.map(a => [a.u, a.playbackRate]); });
  ok('speed: normal 1, slow 0.8 on the same recording', spd.length === 2 && spd[0][1] === 1 && spd[1][1] === 0.8 && spd[0][0] === spd[1][0] && /Kore/.test(spd[0][0]), JSON.stringify(spd));
  // 7. answers read one by one (#435): off → no answer clips
  const ans = await p.evaluate(() => { const T = window.TAL, s = T.S().set; const r1 = document.createElement('div'); const on = T.ansSay(r1, ['כֶּלֶב', 'חָתוּל']);
    s.rh = { ans: 0 }; const r2 = document.createElement('div'); const off = T.ansSay(r2, ['כֶּלֶב', 'חָתוּל']); delete s.rh; return { on: !!on && r1.dataset.ra === '1', off, ra: r2.dataset.ra || '' }; });
  ok('answers: read one by one by default, not when off', ans.on && ans.off === '' && !ans.ra, JSON.stringify(ans));
  // 8. word light (#421): off → the words do not light while read
  const lit = async hi => { await setRH(hi ? null : { hi: 0 }); await p.evaluate(() => window.TAL.ACT['read-sent'].run(() => {})); await p.waitForSelector('#sTal .tqc .qq .rdb');
    return p.evaluate(async () => { window.__fast = false; const el = document.querySelector('#sTal .tqc .qq'); window.TAL.readEl(el); let n = 0; for (let k = 0; k < 30; k++) { await new Promise(r => setTimeout(r, 50)); n = Math.max(n, el.querySelectorAll('.rw.on').length); }
      window.TAL.readStop(); window.__fast = true; return n; }); };
  const l1 = await lit(true), l0 = await lit(false);
  ok('word light: on by default, none when off', l1 >= 1 && l0 === 0, JSON.stringify([l1, l0]));
  await setRH(null);
  // 9. auto-read off = only on 🔊: the screen line is not said by itself
  const auto = await p.evaluate(async () => { const O = window.OREN; O.save.set.autoRead = 0; window.__fast = false; speechSynthesis.log = []; window.TAL.openHub(); await new Promise(r => setTimeout(r, 900)); const n = speechSynthesis.log.length; delete O.save.set.autoRead; window.__fast = true; return n; });
  ok('auto-read off: nothing said by itself', auto === 0, String(auto));
  ok('no JS errors', !errs.length, errs.slice(0, 3).join(' | '));
  L.finish('readhelp', res); await b.close();
})().catch(e => { console.log('FAIL crashed — ' + e.message); console.log('RESULT readhelp 0 1'); process.exitCode = 1; });
