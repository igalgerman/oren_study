// Auto-read: story panels, lesson steps and screen instructions are read by themselves once the screen settles;
// not while reading practice wants Oren to read first, not on parent screens, not when the parents turned it off.
const L = require('./lib');
const { chromium } = require('playwright'); const sleep = L.sleep;
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; window.__noFamily = true;
    const fake = { log: [], speaking: false, speak(u) { this.log.push(u.text); }, cancel() {}, getVoices() { return []; }, onvoiceschanged: null, addEventListener() {} };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(L.URL); await L.noCoach(p); await sleep(300);
  await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; O.showMap(); });
  await sleep(500);
  /* neg = nothing should be read: wait the full time. Otherwise poll until the reading happens (max 8 s, not a fixed sleep), then 300 ms for any extra reading */
  const said = async (f, ms = 800, neg = false) => { await p.evaluate(() => { speechSynthesis.log = []; window.__fast = false; }); await f();
    if (neg) await sleep(ms); else { await p.waitForFunction(() => speechSynthesis.log.length > 0, null, { timeout: 8000 }).catch(() => {}); await sleep(300); }
    return p.evaluate(() => { window.__fast = true; return speechSynthesis.log.slice(); }); };
  let s = await said(() => p.evaluate(() => window.OREN.story([['nar', 'שָׁלוֹם לְךָ חָבֵר'], ['nar', 'הַפַּעַם הַשְּׁנִיָּה']], () => {})));
  ok('story panel is read by itself', s.length === 1 && /של/.test(s[0]), JSON.stringify(s));
  s = await said(() => p.click('#dNext'));
  ok('next story panel is read too', s.length === 1 && /פעם/.test(s[0]), JSON.stringify(s));
  await p.click('#dNext').catch(() => {});
  // lesson: the lesson sentence, then each revealed step
  const lv = await p.evaluate(() => { const l = window.OREN.ALLLV.find(x => x.type === 'learn' && x.u.gen && x.u.gen(5).k !== 'col'); return l && l.id; });
  s = await said(() => p.evaluate(id => window.OREN.startLevel(window.OREN.ALLLV.find(x => x.id === id)), lv));
  ok('lesson sentence is read by itself', s.length >= 1, JSON.stringify(s));
  s = await said(() => p.evaluate(() => { const bs = [...document.querySelectorAll('#sLearn .lch .chb, #sLearn .btnrow .bigbtn')]; bs[0].click(); }));
  ok('lesson: what happens after a tap (hint or answer) is read by itself', s.length === 1 && s[0].length > 1, JSON.stringify(s));
  // reading practice: the instruction is read right away, the text Oren should read himself waits
  s = await said(() => p.evaluate(() => { window.TAL.ACT['read-wp'].run(() => {}); }), 1200);
  const rw = await p.evaluate(() => { const c = document.querySelector('#sTal .tqc'); const P = t => window.TAL.plainHe(t).replace(/🔊/g, '').trim();
    return { w: P(c.querySelector('.bigw').textContent), q: P(c.querySelector('.qq').textContent) }; });
  ok('reading practice: the instruction is read at once', s.some(x => x.includes(rw.q.split(' ')[0])), JSON.stringify({ s, rw }));
  ok('reading practice: the word to read is not read at once', !s.some(x => x.includes(rw.w)), JSON.stringify({ s, rw }));
  // the same instruction outside a reading activity (no reading target) is read whole
  s = await said(() => p.evaluate(() => { window.TAL.ACT['think-pat'].run(() => {}); }), 1200);
  ok('non-reading question: read at once', s.length >= 1, JSON.stringify(s));
  // a plain screen instruction is read; parent setting off stops it; parent screens never
  s = await said(() => p.evaluate(() => window.TAL.openHub()));
  ok('screen instruction is read by itself', s.length === 1, JSON.stringify(s));
  await p.evaluate(() => { window.OREN.save.set.autoRead = 0; });
  s = await said(() => p.evaluate(() => window.OREN.kingdom()), 800, true);
  ok('parent setting off: nothing read', s.length === 0, JSON.stringify(s));
  await p.evaluate(() => { delete window.OREN.save.set.autoRead; window.TAL.parentPanel('read'); }); await sleep(300);
  ok('#613 the auto-read switch is in "reading help" (on = כן)', await p.evaluate(() => { const r = document.querySelector('#sPar .rhmore .popt[data-k="auto"]'); return !!r && /להקריא אוטומטית/.test(r.textContent) && /^כן$/.test(r.querySelector('.pchip.on').textContent.trim()); }));
  s = await said(() => p.evaluate(() => { window.OREN.sayNow = 'בדיקה בלוח הורים'; }), 800, true);
  ok('parent screen: nothing read', s.length === 0, JSON.stringify(s));
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); L.finish('auto-read', res);
})().catch(e => { console.log('FAIL crashed — ' + e.message); console.log('RESULT auto-read 0 1'); process.exitCode = 1; });
