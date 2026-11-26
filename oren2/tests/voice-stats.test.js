// #36: Oren must hear the Google game voice (Chirp3 Kore), not the browser voice. Every browser-voice use is counted with its
// reason, sentences are counted per day by voice, the counts go to /api/tts/stats in ONE batch (never per sentence),
// a failed status check is tried again later in the visit, and no screen calls the browser voice directly.
// The page is served at a fake https origin (Playwright route) with a fake Audio element and a fake browser voice.
const L = require('./lib');
const fs = require('fs');
const { chromium } = require('playwright');
const sleep = L.sleep;
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const HTML = fs.readFileSync(L.PAGE, 'utf8');
// fake Audio: the URL's text decides what happens. MISSING = the server has no audio (JSON 429 -> media error 4),
// NET = network error (media error 2), SLOW = never starts, BLOCK = play() refused (autoplay). Anything else plays.
const INIT = () => {
  try { localStorage.clear(); } catch (e) {}
  window.__vsTest = true;
  const fake = { log: [], speaking: false, speak(u) { this.log.push(u.text); }, cancel() {}, getVoices() { return []; }, onvoiceschanged: null, addEventListener() {} };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
  window.__played = [];
  window.Audio = function (url) {
    const a = this; a.src = url; a.paused = true; a.ended = false; a.error = null;
    const t = decodeURIComponent((/[?&]t=([^&]*)/.exec(url) || [])[1] || '');
    a.pause = () => { a.paused = true; };
    a.play = () => {
      if (/BLOCK/.test(t)) return Promise.reject(Object.assign(new Error('no gesture'), { name: 'NotAllowedError' }));
      setTimeout(() => {
        if (/MISSING/.test(t)) { a.error = { code: 4 }; a.onerror && a.onerror(); return; }
        if (/NET/.test(t)) { a.error = { code: 2 }; a.onerror && a.onerror(); return; }
        if (/SLOW/.test(t)) return;
        a.paused = false; window.__played.push(t); a.onplay && a.onplay(); a.onplaying && a.onplaying();
        setTimeout(() => { a.paused = true; a.ended = true; a.onended && a.onended(); }, 40);
      }, 20);
      return Promise.resolve();
    };
  };
};
(async () => {
  const b = await chromium.launch();
  const open = async (origin, statusFails) => {
    const ctx = await b.newContext({ ...L.VIEWPORT, serviceWorkers: 'block' });
    await ctx.addInitScript(INIT);
    const posts = []; const st = { fails: statusFails || 0, calls: 0 };
    await ctx.route('**/*', async r => {
      const u = new URL(r.request().url());
      if (u.pathname === '/api/tts/stats') { posts.push({ origin: u.origin, body: r.request().postData() }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
      if (u.origin !== origin) return r.fulfill({ status: 404, body: '' });
      if (u.pathname === '/') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML });
      if (u.pathname === '/api/tts/status') { st.calls++; if (st.fails-- > 0) return r.fulfill({ status: 503, body: '{}' }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"ver":3}' }); }
      if (u.pathname.startsWith('/api/save/')) return r.fulfill({ status: r.request().method() === 'GET' ? 404 : 200, contentType: 'application/json', body: '{"ok":true}' });
      return r.fulfill({ status: 404, body: '' });
    });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(origin + '/'); await L.noCoach(p);
    await p.evaluate(() => { window.OREN.save.story.intro = 1; window.TAL.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; window.OREN.showMap(); });
    return { ctx, p, posts, st, errs };
  };
  const speak = (p, t) => p.evaluate(t => { window.__fast = false; window.OREN.hush(); window.OREN.say(t); }, t);
  const vs = p => p.evaluate(() => { const v = window.__vs; return { n: JSON.parse(JSON.stringify(v.n)), ev: v.ev.map(e => ({ ...e })), browser: speechSynthesis.log.slice() }; });
  const today = p => p.evaluate(() => window.OREN.today());

  // 1. family site, status ok, audio served: only Google, 0 browser utterances (story screen: "read to me" + a line's 🔊)
  { const { ctx, p, posts, errs } = await open('https://oren.test');
    await p.waitForFunction(() => window.__gv && window.__gv.ok, null, { timeout: 8000 });
    for (const t of ['שָׁלוֹם אוֹרֶן', 'כׇּל הַכָּבוֹד', 'בּוֹא נְשַׂחֵק']) { await speak(p, t); await sleep(150); }
    await p.evaluate(() => { window.__fast = false; window.TAL.readStory(0, () => window.OREN.showMap()); });
    await sleep(700); await p.click('#sTal .btnrow .bigbtn.blue'); await sleep(1500);
    await p.click('#sTal .sl[data-i="2"] .rdb').catch(() => p.click('#sTal .sl[data-i="2"]')); await sleep(800);
    const r = await vs(p); const d = await today(p); const n = r.n[d] || {};
    ok('site + audio: 0 browser utterances (normal sentences, story read-to-me, a line\'s 🔊)', r.browser.length === 0 && !r.ev.length, JSON.stringify(r));
    ok('site + audio: every sentence counted as Google', (n.google | 0) >= 5 && !(n.browser | 0), JSON.stringify(n));
    ok('stats are batched: nothing sent per sentence', posts.length === 0, posts.length + ' posts');
    await p.evaluate(() => window.__voiceFlush());
    await sleep(300);
    const body = posts[0] && JSON.parse(posts[0].body);
    ok('one batch POST to /api/tts/stats with the day counts', posts.length === 1 && body && body.days && body.days[d] && body.days[d].google === n.google, JSON.stringify(posts));
    await p.evaluate(() => window.__voiceFlush()); await sleep(200);
    ok('nothing new = nothing sent', posts.length === 1, posts.length + ' posts');
    // 2. every reason is recorded: no audio on the server, audio network error, timeout, autoplay blocked, a direct browser call
    await p.evaluate(() => { window.__gv.ms = 400; });
    for (const t of ['MISSING אַחַת', 'NET שְׁתַּיִם', 'SLOW שָׁלוֹשׁ', 'BLOCK אַרְבַּע']) { await speak(p, t); await sleep(1100); }
    await p.evaluate(() => { const u = new SpeechSynthesisUtterance('ישיר'); u.lang = 'he-IL'; speechSynthesis.speak(u); });
    const r2 = await vs(p); const R = r2.ev.map(e => e.r);
    for (const [why, txt] of [['no-audio', 'MISSING'], ['audio-error', 'NET'], ['timeout', 'SLOW'], ['blocked', 'BLOCK'], ['direct-call', 'ישיר']]) {
      const e = r2.ev.find(x => x.r === why);
      ok('reason recorded: ' + why, !!e && e.k.includes(txt) && e.ms === 400 && e.h === 'oren.test', JSON.stringify(r2.ev)); }
    ok('one event per browser use', R.length === 5 && r2.n[d].browser === 5, JSON.stringify(R));
    await p.evaluate(() => window.__voiceFlush()); await sleep(300);
    const b2 = posts[1] && JSON.parse(posts[1].body);
    ok('second batch carries the events with reason, text key, GV.ms and host', posts.length === 2 && b2.ev.length === 5 && b2.ev.every(e => e.r && e.k && e.ms === 400 && e.h === 'oren.test' && e.d === d), JSON.stringify(b2));
    ok('no page errors (site)', !errs.length, errs.join('|'));
    await ctx.close(); }

  // 3. status fails once, then works: Google is used
  { const { ctx, p } = await open('https://oren.test', 1);
    await p.waitForFunction(() => window.__gv && window.__gv.ok, null, { timeout: 8000 }).catch(() => {});
    await speak(p, 'נִסָּיוֹן שֵׁנִי'); await sleep(300);
    const r = await vs(p); ok('status fails once then works: Google, no browser voice', r.browser.length === 0 && r.ev.length === 0, JSON.stringify(r));
    await ctx.close(); }

  // 4. status fails for the whole first check: browser voice with reason status-failed, then the status is checked again later
  //    in the visit and Google comes back (GV.ok is not stuck false for the whole visit)
  { const { ctx, p, st } = await open('https://oren.test', 3);
    await p.waitForFunction(() => window.__gv && !window.__gv.pending, null, { timeout: 10000 });
    await p.evaluate(() => { window.__gv.again = 0; });
    await speak(p, 'בְּלִי שָׁרָת'); await sleep(400);
    const r = await vs(p); const e = r.ev.find(x => x.k === 'בְּלִי שָׁרָת');
    ok('status failed: reason status-failed recorded', !!e && e.r === 'status-failed' && e.h === 'oren.test', JSON.stringify(r.ev));
    await p.waitForFunction(() => window.__gv.ok, null, { timeout: 5000 }).catch(() => {});
    await speak(p, 'הַשָּׁרָת חָזַר'); await sleep(400);
    const r2 = await vs(p);
    ok('status checked again later in the visit, Google used afterwards', st.calls >= 4 && !r2.ev.some(x => x.k === 'הַשָּׁרָת חָזַר') && r2.browser.length === r.browser.length && r2.n[await today(p)].google >= 1, JSON.stringify({ calls: st.calls, ev: r2.ev, browser: r2.browser }));
    await ctx.close(); }

  // 5. the Claude artifact host: the browser voice is counted with reason artifact-host, and sent to the family site
  { const host = 'https://abc.claudeusercontent.com'; const { ctx, p, posts } = await open(host);
    await sleep(500);
    await speak(p, 'בַּאַרְטִיפַקְט'); await sleep(200);
    const r = await vs(p);
    const e = r.ev.find(x => x.k === 'בַּאַרְטִיפַקְט');
    ok('artifact host: reason artifact-host', !!e && e.r === 'artifact-host' && e.h === 'abc.claudeusercontent.com' && r.ev.every(x => x.r === 'artifact-host'), JSON.stringify(r.ev));
    await p.evaluate(() => window.__voiceFlush()); await sleep(300);
    ok('artifact host: the batch goes to the family site', posts.length === 1 && posts[0].origin === 'https://oren-game.pages.dev', JSON.stringify(posts.map(x => x.origin)));
    await ctx.close(); }

  // 6. source check: no screen makes its own browser utterance (only browserSay does), so one screen never mixes two voices
  { const src = fs.readFileSync(require('path').join(L.ROOT, 'index.html'), 'utf8');
    const n = (src.match(/new SpeechSynthesisUtterance/g) || []).length;
    ok('only browserSay creates a browser utterance', n === 1 && /function browserSay[^\n]*new SpeechSynthesisUtterance/.test(src), n + ' found'); }
  await b.close(); L.finish('voice-stats', res);
})().catch(e => { console.log('FAIL crashed — ' + e.message); console.log('RESULT voice-stats 0 1'); process.exitCode = 1; });
