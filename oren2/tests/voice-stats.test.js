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
// LATE = a slow fetch: the audio arrives after 400 ms even if pause() was called while it loaded (#399).
const INIT = () => {
  try { localStorage.clear(); } catch (e) {}
  window.__vsTest = true;
  // #397 __aev: every voice start / natural end / cut (stopped while speaking), browser voice and Google audio alike
  window.__aev = [];
  const fake = { log: [], speaking: false, cur: null, getVoices() { return []; }, onvoiceschanged: null, addEventListener() {},
    speak(u) { this.log.push(u.text); this.cur = u; window.__aev.push(['start', u.text]);
      setTimeout(() => { if (this.cur !== u) return; this.cur = null; window.__aev.push(['end', u.text]); u.onend && u.onend(); }, 40); },
    cancel() { const u = this.cur; if (!u) return; this.cur = null; window.__aev.push(['cut', u.text]); u.onerror && u.onerror({ error: 'interrupted' }); } };
  Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
  window.__played = [];
  window.__N = s => String(s).replace(/[\u0591-\u05C7]/g, '').replace(/\s+/g, ' ').trim();
  window.Audio = function (url) {
    const a = this; a.src = url; a.paused = true; a.ended = false; a.error = null;
    const t = decodeURIComponent((/[?&]t=([^&]*)/.exec(url) || [])[1] || '');
    // #404 __req: every audio request by its text; FLAKY fails the first try only; __fixed: MISSING texts the server now has
    //      (texts compared without nikud: the audio URL carries the respelled text)
    const N = s => String(s).replace(/[\u0591-\u05C7]/g, '').replace(/\s+/g, ' ').trim(); window.__N = N;
    (window.__req = window.__req || []).push(N(t)); const tries = window.__req.filter(x => x === N(t)).length;
    const fixed = (window.__fixed || []).some(x => N(t).includes(N(x)));
    a.pause = () => { if (!a.paused && !a.ended) window.__aev.push(['cut', t]); a.paused = true; a.stop = true; };
    a.play = () => {
      if (/BLOCK/.test(t)) return Promise.reject(Object.assign(new Error('no gesture'), { name: 'NotAllowedError' }));
      setTimeout(() => {
        if (/LATE/.test(t)) return setTimeout(() => { a.paused = false; a.onplay && a.onplay(); a.onplaying && a.onplaying();
          if (a.paused) return; window.__played.push(t); window.__aev.push(['start', t]);
          setTimeout(() => { if (a.paused) return; a.paused = true; a.ended = true; window.__aev.push(['end', t]); a.onended && a.onended(); }, 40); }, 400);
        if (a.stop) return;
        if ((/MISSING/.test(t) && !fixed) || (/FLAKY/.test(t) && tries === 1)) { a.error = { code: 4 }; a.onerror && a.onerror(); return; }
        if (/NET/.test(t)) { a.error = { code: 2 }; a.onerror && a.onerror(); return; }
        if (/SLOW/.test(t)) return;
        a.paused = false; window.__played.push(t); window.__aev.push(['start', t]); a.onplay && a.onplay(); a.onplaying && a.onplaying();
        setTimeout(() => { if (a.paused) return; a.paused = true; a.ended = true; window.__aev.push(['end', t]); a.onended && a.onended(); }, 40);
      }, 20);
      return Promise.resolve();
    };
  };
  // #635 the one retry is a fetch of the same URL: __fx = every such fetch by its text; MISSING (not fixed) = the server's JSON
  //      502 'google 429', NET = network error, anything else = audio
  const of = window.fetch.bind(window); window.__fx = [];
  window.fetch = (u, o) => { const s = String(u && u.url || u); if (!/\/api\/tts\?/.test(s)) return of(u, o);
    const N = window.__N, t = N(decodeURIComponent((/[?&]t=([^&]*)/.exec(s) || [])[1] || '')); window.__fx.push(t);
    if (/NET/.test(t)) return Promise.reject(new TypeError('Failed to fetch'));
    if (/MISSING/.test(t) && !(window.__fixed || []).some(x => t.includes(N(x)))) return Promise.resolve(new Response('{"ok":false,"why":"google 429"}', { status: 502, headers: { 'content-type': 'application/json' } }));
    return Promise.resolve(new Response('ID3', { status: 200, headers: { 'content-type': 'audio/mpeg' } })); };
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
    //    (#404: the browser voice is used only offline, so these sentences are said with the whole session offline)
    await p.evaluate(() => { window.__gv.ms = 400; });
    await ctx.setOffline(true);
    for (const t of ['MISSING אַחַת', 'NET שְׁתַּיִם', 'SLOW שָׁלוֹשׁ', 'BLOCK אַרְבַּע']) { await speak(p, t); await sleep(1100); }
    await p.evaluate(() => { const u = new SpeechSynthesisUtterance('ישיר'); u.lang = 'he-IL'; speechSynthesis.speak(u); });
    const r2 = await vs(p); const R = r2.ev.map(e => e.r);
    for (const [why, txt] of [['no-audio', 'MISSING'], ['audio-error', 'NET'], ['timeout', 'SLOW'], ['blocked', 'BLOCK'], ['direct-call', 'ישיר']]) {
      const e = r2.ev.find(x => x.r === why);
      ok('reason recorded: ' + why, !!e && e.k.includes(txt) && e.ms === 400 && e.h === 'oren.test', JSON.stringify(r2.ev)); }
    ok('one event per browser use', R.length === 5 && r2.n[d].browser === 5, JSON.stringify(R));
    await ctx.setOffline(false);
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

  // 4. status fails for the whole first check: offline -> browser voice with reason status-failed; online (#404) -> the
  //    recording is still tried, no browser voice; the status is checked again later in the visit and Google comes back
  { const { ctx, p, st } = await open('https://oren.test', 3);
    await p.waitForFunction(() => window.__gv && !window.__gv.pending, null, { timeout: 10000 });
    await speak(p, 'שָׁרָת לֹא עוֹנֶה'); await sleep(400);
    const r0 = await vs(p);
    ok('#404 status failed, online: the recording is tried, no browser voice', !r0.browser.length && !r0.ev.length && await p.evaluate(() => window.__req.includes(window.__N('שָׁרָת לֹא עוֹנֶה'))), JSON.stringify(r0));
    await ctx.setOffline(true);
    await p.evaluate(() => { window.__gv.again = 0; });
    await speak(p, 'בְּלִי שָׁרָת'); await sleep(400);
    await ctx.setOffline(false);
    const r = await vs(p); const e = r.ev.find(x => x.k === 'בְּלִי שָׁרָת');
    ok('status failed, offline: reason status-failed recorded', !!e && e.r === 'status-failed' && e.h === 'oren.test', JSON.stringify(r.ev));
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

  // #404 one clear rule when a recording is missing: one retry, then the text lights up with a 🔊 that tries again;
  //      the browser voice only when the whole session is offline (offline true / false)
  { const { ctx, p, errs } = await open('https://oren.test');
    await p.waitForFunction(() => window.__gv && window.__gv.ok, null, { timeout: 8000 });
    await p.evaluate(() => { window.__gv.ms = 400; window.__noAuto = true; });
    // a line on the screen, then the voice says it
    const show = (t, tag) => p.evaluate(([t, tag]) => { document.querySelectorAll('.t404').forEach(e => e.remove());
      const s = [...document.querySelectorAll('section.screen')].find(x => !x.hidden); const e = document.createElement(tag || 'div'); e.className = 't404'; e.textContent = t; s.prepend(e); }, [t, tag]);
    const st = t => p.evaluate(t => { const e = document.querySelector('.t404'); const N = window.__N; return { req: window.__req.filter(x => x === N(t)).length, fx: window.__fx.filter(x => x === N(t)).length, played: window.__played.some(x => N(x) === N(t)),
      lit: !!e && e.classList.contains('vmiss'), btn: !!(e && e.querySelector('.vmissb')), hud: document.querySelector('#btnSay').classList.contains('vmiss'), browser: speechSynthesis.log.length }; }, t);
    // case 1: the retry works -> the recording plays, nothing lights up
    await show('FLAKY שׁוּב'); await speak(p, 'FLAKY שׁוּב'); await sleep(500);
    let r = await st('FLAKY שׁוּב');
    ok('#404 case 1: the first try fails, the one retry plays the recording (no browser voice, nothing lit)', r.req === 2 && r.fx === 1 && r.played && !r.lit && !r.btn && !r.browser, JSON.stringify(r));
    // case 2: still missing after the one retry (online) -> the text lights up with a 🔊, no browser voice
    await show('MISSING חָסֵר'); await speak(p, 'MISSING חָסֵר'); await sleep(600);
    r = await st('MISSING חָסֵר');
    ok('#404 case 2 (offline false): exactly one retry, then the text lights up with a 🔊, no browser voice', r.req === 1 && r.fx === 1 && !r.played && r.lit && r.btn && !r.browser, JSON.stringify(r));
    // #641 every audio failure carries the sentence id; the final miss also logs the HTTP status of that sentence's URL
    await sleep(300);
    { const au = await p.evaluate(() => window.OREN.evBuf().filter(e => e.k === 'au' && e.src === 'google'));
      const fl = au.filter(e => e.ev === 'fail'), miss = au.find(e => e.ev === 'missing'), hs = au.find(e => e.ev === 'http');
      ok('#641 audio failure: sentence id on every fail, the HTTP status (502 from the fake server) after the miss', fl.length >= 1 && fl.every(e => !!e.sn) && !!miss && miss.sn === fl[fl.length - 1].sn && !!hs && hs.st === 502 && hs.sn === miss.sn, JSON.stringify(au)); }
    // the 🔊 tries again: now the server has it -> it plays and the light goes off
    await p.evaluate(() => { window.__fixed = ['MISSING חָסֵר']; });
    await p.click('.t404 .vmissb'); await sleep(400);
    r = await st('MISSING חָסֵר');
    ok('#404 the 🔊 on the lit text tries again: it plays, the light is off', r.req === 2 && r.played && !r.lit && !r.btn && !r.browser, JSON.stringify(r));
    // a line that is not on the screen as one text (or on a button): the 🔊 in the top bar lights up and retries it
    await p.evaluate(() => { window.__fixed = []; });
    await show('עוֹד', 'button'); await speak(p, 'MISSING לֹא עַל הַמָּסָךְ'); await sleep(600);
    r = await st('MISSING לֹא עַל הַמָּסָךְ');
    ok('#404 text not on the screen: the top-bar 🔊 lights up', r.req === 1 && r.fx === 1 && r.hud && !r.browser, JSON.stringify(r));
    await p.evaluate(() => { window.__fixed = ['MISSING לֹא עַל הַמָּסָךְ']; });
    await p.click('#btnSay'); await sleep(400);
    r = await st('MISSING לֹא עַל הַמָּסָךְ');
    ok('#404 the top-bar 🔊 retries that line, then its light is off', r.req === 2 && r.played && !r.hud, JSON.stringify(r));
    // a text that has its own 🔊 (like the home bubble): it lights up, no second 🔊; its own 🔊 plays it and the light goes off
    await p.evaluate(() => { window.__fixed = []; document.querySelectorAll('.t404').forEach(e => e.remove()); const s = [...document.querySelectorAll('section.screen')].find(x => !x.hidden);
      const e = document.createElement('div'); e.className = 't404'; e.innerHTML = '<button type="button" aria-label="הקראה">🔊</button>MISSING יֵשׁ לִי'; e.firstChild.onclick = () => window.OREN.say('MISSING יֵשׁ לִי'); s.prepend(e); });
    await speak(p, 'MISSING יֵשׁ לִי'); await sleep(600);
    r = await st('MISSING יֵשׁ לִי'); const own = await p.evaluate(() => document.querySelectorAll('.t404 button').length);
    ok('#404 a text with its own 🔊 lights up, no second 🔊 is added', r.lit && own === 1 && !r.hud, JSON.stringify({ r, own }));
    await p.evaluate(() => { window.__fixed = ['MISSING יֵשׁ לִי']; }); await p.click('.t404 button'); await sleep(400);
    r = await st('MISSING יֵשׁ לִי');
    ok('#404 its own 🔊 plays it and the light goes off', r.played && !r.lit, JSON.stringify(r));
    // a screen change (hush) turns every light off
    await show('MISSING כָּבֶה'); await speak(p, 'MISSING כָּבֶה'); await p.waitForFunction(() => document.querySelector('.t404.vmiss'), null, { timeout: 3000 }).catch(() => {});
    const lit = (await st('MISSING כָּבֶה')).lit; await p.evaluate(() => window.OREN.hush());
    ok('#404 hush (screen change) turns the light off', lit && !(await st('MISSING כָּבֶה')).lit, String(lit));
    // #635 the log says why the server had no audio (status + its reason); a missing line counts one failed try and one retry;
    //      the same line said again by itself within a minute makes no request (it lights up at once); a 🔊 tap tries again;
    //      a timeout is not retried
    // a timer that changes the screen meanwhile drops the line (#399): then the case is played again once
    let evs = [], r1 = {}, r2 = {};
    for (let k = 0; k < 2; k++) { const scr = await p.evaluate(() => window.__sq.scr);
      await p.evaluate(() => { window.__fixed = []; window.__miss.clear(); window.__ev0 = window.OREN.evBuf().length; window.__req = []; window.__fx = []; });
      await show('MISSING נֶעְלָם'); await speak(p, 'MISSING נֶעְלָם'); await sleep(600);
      evs = await p.evaluate(() => window.OREN.evBuf().slice(window.__ev0).filter(e => e.k === 'au' || e.k === 'retry').map(e => ({ k: e.k, ev: e.ev, why: e.why, st: e.st, sv: e.sv })));
      for (let j = 0; j < 3; j++) { await speak(p, 'MISSING נֶעְלָם'); await sleep(150); }
      r1 = await st('MISSING נֶעְלָם');
      if (r1.btn) { await p.evaluate(() => { window.__fixed = ['MISSING נֶעְלָם']; }); await p.click('.t404 .vmissb'); await sleep(400); }
      r2 = await st('MISSING נֶעְלָם');
      if (await p.evaluate(() => window.__sq.scr) === scr) break; }
    const mi = evs.find(e => e.ev === 'missing') || {};
    ok('#635 a missing line is logged with the server status and reason', mi.why === 'no-audio' && mi.st === 502 && mi.sv === 'google 429', JSON.stringify(evs));
    ok('#635 a missing line: one failed try, one retry (was two failed tries)', evs.filter(e => e.ev === 'fail').length === 1 && evs.filter(e => e.k === 'retry').length === 1, JSON.stringify(evs));
    ok('#635 said again 3 times by itself: no new request, the text lights up at once', r1.req === 1 && r1.fx === 1 && r1.lit && r1.btn && !r1.browser, JSON.stringify(r1));
    ok('#635 then a 🔊 tap tries again: it plays', r2.req === 2 && r2.played && !r2.lit, JSON.stringify(r2));
    await show('SLOW חָסֵר'); await speak(p, 'SLOW חָסֵר'); await sleep(900);
    r = await st('SLOW חָסֵר');
    ok('#635 a timeout is not retried: one try, then the 🔊 (no second long wait)', r.req === 1 && r.fx === 0 && r.lit && !r.browser, JSON.stringify(r));
    // case 3: the whole session offline -> the browser voice, nothing lights up
    await ctx.setOffline(true);
    // a timer that changes the screen meanwhile (slow under load) drops the line (#399): then the case is played again once
    for (let k = 0; k < 2; k++) { const scr = await p.evaluate(() => window.__sq.scr);
      await show('MISSING בְּלִי רֶשֶׁת'); await speak(p, 'MISSING בְּלִי רֶשֶׁת');
      await p.waitForFunction(() => speechSynthesis.log.length || document.querySelector('.t404.vmiss'), null, { timeout: 4000 }).catch(() => {}); await sleep(200);
      r = await st('MISSING בְּלִי רֶשֶׁת'); if (await p.evaluate(() => window.__sq.scr) === scr) break;
      await p.evaluate(() => { window.__req = []; speechSynthesis.log.length = 0; }); }
    await ctx.setOffline(false);
    ok('#404 case 3 (offline true): the browser voice says it, nothing lights up', r.browser === 1 && !r.lit && !r.btn && !r.hud, JSON.stringify(r));
    ok('#404 no page errors', !errs.length, errs.join('|'));
    await ctx.close(); }

  // #397 one speech queue: two say() calls in a row play one after the other (no overlap, the first is not cut), on the
  // Google voice (family site) and on the browser voice (artifact host without the Claude voice); hush() empties the queue
  for (const [name, host] of [['Google', 'https://oren.test'], ['browser', 'https://abc.claudeusercontent.com']]) {
    const { ctx, p, errs } = await open(host);
    if (name === 'Google') await p.waitForFunction(() => window.__gv && window.__gv.ok, null, { timeout: 8000 }); else await sleep(500);
    const two = async (a, b, then) => { await p.evaluate(([a, b, then]) => { window.__fast = false; window.__noAuto = true; window.OREN.hush(); window.__aev.length = 0;
      window.OREN.say(a); window.OREN.say(b); if (then) window.OREN.hush(); }, [a, b, then]); await sleep(700); return p.evaluate(() => window.__aev.slice()); };
    const ev = (await two('אֶחָד', 'שְׁתַּיִם')).map(e => [e[0], e[1].replace(/[\u0591-\u05C7]/g, '')]);
    ok('#397 ' + name + ': two say() in a row play one after the other, none cut, never two at once',
      ev.map(e => e[0] + ' ' + e[1]).join() === 'start אחד,end אחד,start שתים,end שתים' || ev.map(e => e[0] + ' ' + e[1]).join() === 'start אחד,end אחד,start שתיים,end שתיים', JSON.stringify(ev));
    const ev2 = (await two('שָׁלוֹשׁ', 'אַרְבַּע', true)).map(e => [e[0], e[1].replace(/[\u0591-\u05C7]/g, '')]);
    ok('#397 ' + name + ': hush() stops the voice and empties the queue (nothing waits to be said)', !ev2.some(e => e[1] === 'ארבע') && !ev2.some(e => e[0] === 'end'), JSON.stringify(ev2));
    ok('#397 ' + name + ': no page errors', !errs.length, errs.join('|'));
    await ctx.close(); }

  // #399 the line spoken always belongs to the current screen: each queued line carries its screen id, a line with an old id is dropped
  { const { ctx, p, errs } = await open('https://oren.test');
    await p.waitForFunction(() => window.__gv && window.__gv.ok, null, { timeout: 8000 });
    const starts = () => p.evaluate(() => window.__aev.filter(e => e[0] === 'start').map(e => e[1].replace(/[\u0591-\u05C7]/g, '')));
    // slow audio fetch + fast screen change: the old screen's audio arrives late and is not played; the new screen's line is
    await p.evaluate(() => { window.__fast = false; window.__noAuto = true; window.OREN.hush(); window.__aev.length = 0;
      window.OREN.say('LATE מַפָּה'); setTimeout(() => { window.OREN.setScreen('sTal', 'city', null); window.__noAuto = true; window.OREN.say('עִיר'); }, 60); });
    await sleep(1000);
    let st = await starts();
    ok('#399 slow audio fetch + fast screen change: only the current screen\'s line plays', st.join() === 'עיר', JSON.stringify(st));
    // queued lines of the old screen are dropped even when nothing emptied the queue: only the screen id changed
    await p.evaluate(() => { window.OREN.hush(); window.__aev.length = 0; const q = window.__sq;
      window.OREN.say('אֶחָד'); window.OREN.say('שְׁתַּיִם'); window.OREN.say('שָׁלוֹשׁ');
      const ids = q.list.map(x => x.scr).concat(q.cur ? [q.cur.scr] : []); window.__ids = typeof q.scr === 'number' && ids.length === 3 && ids.every(x => x === q.scr); q.scr++; });
    await sleep(700);
    st = await starts();
    ok('#399 each queued line carries its screen id', await p.evaluate(() => window.__ids), '');
    ok('#399 a queued line with an old screen id is dropped', st.join() === 'אחד', JSON.stringify(st));
    await p.evaluate(() => { window.OREN.say('אַרְבַּע'); }); await sleep(400); st = await starts();
    ok('#399 a line of the current screen still plays after the drop', st.join() === 'אחד,ארבע', JSON.stringify(st));
    ok('#399 no page errors', !errs.length, errs.join('|'));
    await ctx.close(); }

  // 6. source check: no screen makes its own browser utterance (only browserSay does), so one screen never mixes two voices
  { const src = fs.readFileSync(require('path').join(L.ROOT, 'index.html'), 'utf8');
    const n = (src.match(/new SpeechSynthesisUtterance/g) || []).length;
    ok('only browserSay creates a browser utterance', n === 1 && /function browserSay[^\n]*new SpeechSynthesisUtterance/.test(src), n + ' found'); }
  // #400: after pregen, a read-only report counts the kid sentences with no recording yet (fake sentence list, no network)
  { const path = require('path'), os = require('os'), cp = require('child_process');
    const tool = path.join(L.ROOT, 'cf', 'tools', 'voicemissing.js');
    const run = (dir, extra = {}) => { const sum = path.join(dir, 'summary.md'), out = path.join(dir, 'out.txt'); fs.writeFileSync(sum, ''); fs.writeFileSync(out, '');
      const r = cp.spawnSync(process.execPath, [tool], { encoding: 'utf8', env: { ...process.env, PREGEN_DIR: dir, GITHUB_STEP_SUMMARY: sum, GITHUB_OUTPUT: out, ...extra } });
      return { code: r.status, log: r.stdout + r.stderr, sum: fs.readFileSync(sum, 'utf8'), out: fs.readFileSync(out, 'utf8') }; };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmiss-'));
    const list = Array.from({ length: 24 }, (_, i) => 'מִשְׁפָּט ' + (i + 1) + '.').concat([{ t: 'Hello Oren', v: 'en-US-Chirp3-HD-Despina', r: 0.85 }]);
    const done = { 'מִשְׁפָּט 1.': 1, 'מִשְׁפָּט 2.': 1, 'en-US-Chirp3-HD-Despina|0.85|Hello Oren': 1 };
    fs.writeFileSync(path.join(dir, 'said.json'), JSON.stringify(list)); fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ day: '2026-11-26', newToday: 3, done }));
    const before = fs.readFileSync(path.join(dir, 'said.json'), 'utf8') + fs.readFileSync(path.join(dir, 'state.json'), 'utf8');
    const a = run(dir);
    ok('missing report: exits 0 even when sentences are missing (not a failure)', a.code === 0, a.code + ' ' + a.log.slice(0, 200));
    ok('missing report: count of sentences with no recording', /22 of 25 /.test(a.log) && /^missing=22$/m.test(a.out), a.log.split('\n')[0] + ' | ' + a.out.trim());
    const shown = (a.log.match(/^\s+\d+\. /gm) || []).length;
    ok('missing report: lists the first 20', shown === 20 && a.log.includes('מִשְׁפָּט 3.') && !a.log.includes('מִשְׁפָּט 23.'), shown + ' listed');
    ok('missing report: in the job summary too', /22 of 25/.test(a.sum) && a.sum.includes('מִשְׁפָּט 3.'), a.sum.slice(0, 120));
    ok('missing report: one-line status text for the dashboard', /^text=22 of 25 kid sentences have no recording yet$/m.test(a.out), a.out.trim());
    ok('missing report: read-only (list and state unchanged)', before === fs.readFileSync(path.join(dir, 'said.json'), 'utf8') + fs.readFileSync(path.join(dir, 'state.json'), 'utf8')
      && !/fetch\(|writeFileSync\((LIST|STATE)/.test(fs.readFileSync(tool, 'utf8')));
    fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ done: Object.fromEntries(list.map(x => [typeof x === 'string' ? x : x.v + '|' + x.r + '|' + x.t, 1])) }));
    const z = run(dir);
    ok('missing report: all recorded -> 0', z.code === 0 && /^missing=0$/m.test(z.out) && /0 of 25 /.test(z.log), z.out.trim());
    const e = run(fs.mkdtempSync(path.join(os.tmpdir(), 'vmiss-')));
    ok('missing report: no sentence list yet -> says so, exits 0', e.code === 0 && /no sentence list/.test(e.log) && !/^missing=/m.test(e.out), e.log.trim() + ' | ' + e.out.trim()); }
  await b.close();
  // #396: no code starts the browser's own speech directly; only browserSay (the offline fallback) may, once
  const VS = require('./voicescan');
  const real = VS.scan(VS.gameSources());
  ok('#396 no direct browser speech in the game code', real.hits.length === 0, real.hits.join(' | '));
  ok('#396 the one fallback (browserSay) starts the browser voice exactly once', !!real.fallback && real.fallback.utter === 1 && real.fallback.speak === 1, JSON.stringify(real.fallback));
  // the checker itself catches a planted direct call (in a pack file and in the core), and lets the allowed uses through
  const src = VS.gameSources();
  const planted = VS.scan({ ...src, 'x.js': 'cancel();\nconst u=new SpeechSynthesisUtterance("שלום");speechSynthesis.speak(u);' });
  ok('#396 checker: a planted direct call in a .js file fails', planted.hits.length === 1 && planted.hits[0].startsWith('x.js:2'), planted.hits.join(' | '));
  const core2 = VS.scan({ 'index.html': src['index.html'].replace('function say(', 'function sneak(){window.speechSynthesis.speak(0);}\nfunction say(') });
  ok('#396 checker: a planted call in the core of index.html fails', core2.hits.length === 1, core2.hits.join(' | '));
  const fine = VS.scan({ 'y.js': 'speechSynthesis.cancel();speechSynthesis.getVoices();const s=speechSynthesis.speaking;const o=ss.speak.bind(ss);TTS.ns.speak(t,{});' });
  ok('#396 checker: cancel / getVoices / speaking / .speak.bind / the Claude voice are allowed', fine.hits.length === 0, fine.hits.join(' | '));
  // #397 all speech goes through the queue: nothing outside it starts a voice (Google audio, browser voice, Claude voice)
  const by = VS.bypass(src);
  ok('#397 every voice is started by the speech queue only (no screen calls googleSay / browserSay / TTS.ns.speak)', by.length === 0, by.join(' | '));
  const by2 = VS.bypass({ ...src, 'z.js': 'O.say(t);\nbrowserSay(t,"he");' });
  ok('#397 checker: a planted call that skips the queue fails', by2.length === 1 && by2[0].startsWith('z.js:2'), by2.join(' | '));
  // voice-map.md names every file that speaks or stops the voice
  const map = fs.readFileSync(require('path').join(__dirname, '..', 'docs', 'voice-map.md'), 'utf8');
  const speakers = Object.entries(src).filter(([f, t]) => f !== 'gaps-math.js' && /speechSynthesis|new Audio\(|\/api\/tts|\bsay\(|\.say\(|sayNow/.test(f === 'index.html' ? VS.core(t) : t)).map(([f]) => f);
  const missing = speakers.filter(f => !map.includes('`' + f + ':') && !map.includes('`' + f + '`'));
  ok('#396 voice-map.md names every file that speaks', missing.length === 0, missing.join(' '));
  L.finish('voice-stats', res);
})().catch(e => { console.log('FAIL crashed — ' + e.message); console.log('RESULT voice-stats 0 1'); process.exitCode = 1; });
