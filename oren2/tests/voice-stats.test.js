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
  // voice-map.md names every file that speaks or stops the voice
  const map = fs.readFileSync(require('path').join(__dirname, '..', 'docs', 'voice-map.md'), 'utf8');
  const speakers = Object.entries(src).filter(([f, t]) => f !== 'gaps-math.js' && /speechSynthesis|new Audio\(|\/api\/tts|\bsay\(|\.say\(|sayNow/.test(f === 'index.html' ? VS.core(t) : t)).map(([f]) => f);
  const missing = speakers.filter(f => !map.includes('`' + f + ':') && !map.includes('`' + f + '`'));
  ok('#396 voice-map.md names every file that speaks', missing.length === 0, missing.join(' '));
  L.finish('voice-stats', res);
})().catch(e => { console.log('FAIL crashed — ' + e.message); console.log('RESULT voice-stats 0 1'); process.exitCode = 1; });
