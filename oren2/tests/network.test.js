// #434 bad network: the real website (cf/dist/_worker.js + /sw.js) on a slow network and with no network.
// Slow (throttled browser context): the game opens, the Google voice plays, the save reaches the server.
// Offline (context.setOffline): the page opens from the service worker's copy, recorded voice plays from the device for lines heard before,
// and a save made offline waits and is sent when the network returns (both mid-session and after an offline reload).
// The service worker registers only on https; this localhost server is http, so the test registers /sw.js itself (localhost is a secure context).
const L = require('./lib');
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const MP3 = fs.readFileSync(path.join(__dirname, 'fixtures', 'tone.mp3'));
const FIX = 'a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0';
const until = async (f, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await sleep(100); } return !!(await f()); };
(async () => {
  const m = await import(require('url').pathToFileURL(path.join(L.ROOT, 'cf', 'dist', '_worker.js')).href);
  const kv = new Map(); let puts = 0;
  const KV = { get: async k => kv.has(k) ? kv.get(k) : null, put: async (k, v) => { if (k.startsWith('fam:') || k === FIX || k.includes(FIX)) puts++; kv.set(k, v); }, delete: async k => { kv.delete(k); }, list: async o => ({ keys: [...kv.keys()].filter(k => k.startsWith(o.prefix || '')).map(name => ({ name })) }) };
  const env = { SAVES: KV };
  let tts = 0;   // audio requests that reached the server
  const srv = http.createServer((q, r) => { const b = []; q.on('data', c => b.push(c)); q.on('end', async () => {
    const u = new URL(q.url, 'http://x');
    if (u.pathname === '/api/tts' && u.searchParams.get('t')) { tts++; r.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': MP3.length }); return r.end(MP3); }   // stands in for Google
    if (u.pathname === '/api/tts/status') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{"ok":true,"ver":1}'); }
    try { const body = b.length && q.method !== 'GET' && q.method !== 'HEAD' ? Buffer.concat(b) : undefined;
      const x = await m.default.fetch(new Request('http://localhost' + q.url, { method: q.method, headers: q.headers, body }), env, { waitUntil() {} });
      const hd = {}; x.headers.forEach((v, k) => { if (k !== 'content-encoding') hd[k] = v; }); r.writeHead(x.status, hd); r.end(Buffer.from(await x.arrayBuffer()));
    } catch (e) { r.writeHead(500); r.end(String(e)); } }); }).listen(0);
  const BASE = 'http://localhost:' + srv.address().port;
  const saved = () => { for (const [k, v] of kv) if (k.includes(FIX)) try { return JSON.parse(v); } catch (e) {} return null; };
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errs = [];
  // the test clock (tests/mute.js) starts at 10:00 on every page load; a reload must not go back in time (newer saves would look older), so the clock here runs on from the test start
  const D0 = new Date(), START = new Date(D0.getFullYear(), D0.getMonth(), D0.getDate(), +(process.env.TEST_HOUR || 10)).getTime(), T0 = Date.now();
  const init = ([start, t0]) => { window.__famGap = 0; window.__famRetry = 300; window.TAL_noHome = true;
    const D = Date, real = () => performance.timeOrigin + performance.now(), now = () => Math.round(start + real() - t0);
    const F = function (...a) { return a.length ? new D(...a) : new D(now()); }; F.prototype = D.prototype; F.UTC = D.UTC; F.parse = D.parse; F.now = now; window.Date = F; };
  const ready = p => p.waitForFunction(() => window.OREN && window.OREN.save && window.TAL && window.TAL.S, null, { timeout: 30000 }).then(() => true, () => false);
  const google = p => p.evaluate(() => { const n = window.__vs.n; return Object.values(n).reduce((a, d) => a + (d.google | 0), 0); });
  const browserVoice = p => p.evaluate(() => { const n = window.__vs.n; return Object.values(n).reduce((a, d) => a + (d.browser | 0), 0); });
  const speak = (p, t) => p.evaluate(t => { window.__fast = false; window.OREN.say(t); }, t);
  const LINE = 'שָׁלוֹם אוֹרֵן, נְשַׂחֵק?';

  // ---------- slow network ----------
  { const ctx = await b.newContext(L.VIEWPORT); await ctx.addInitScript(init, [START, T0]); const p = await ctx.newPage(); p.on('pageerror', e => errs.push('slow ' + e.message));
    const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });   // "fast 3G": 1.6 Mbit/s, 400 ms
    const t0 = Date.now(); await p.goto(BASE + '/', { timeout: 60000 }); const up = await ready(p) && await p.waitForFunction(() => window.OREN.family, null, { timeout: 30000 }).then(() => true, () => false); const secs = (Date.now() - t0) / 1000;
    ok('slow: the game opens', up && await p.evaluate(() => [...document.querySelectorAll('section.screen')].some(x => !x.hidden && x.offsetHeight > 0)), secs.toFixed(1) + ' s');
    await L.noCoach(p);
    await p.evaluate(() => window.__gv.wait); const g0 = await google(p);
    await speak(p, LINE); const played = await until(async () => await google(p) > g0, 10000);
    ok('slow: the recorded voice plays (not the browser voice)', played && await browserVoice(p) === 0, JSON.stringify(await p.evaluate(() => window.__vs.n)));
    await p.evaluate(() => { const O = window.OREN; O.save.gems = 41; O.persist(); });
    ok('slow: a save reaches the server', await until(() => (saved() || {}).gems === 41, 15000), JSON.stringify({ g: (saved() || {}).gems }));
    await ctx.close(); }

  // ---------- no network ----------
  { const ctx = await b.newContext(L.VIEWPORT); await ctx.addInitScript(init, [START, T0]); const p = await ctx.newPage(); p.on('pageerror', e => errs.push('offline ' + e.message));
    await p.goto(BASE + '/'); await ready(p); await p.waitForFunction(() => window.OREN.family, null, { timeout: 20000 }); await L.noCoach(p);
    const ctl = await p.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
      for (let i = 0; i < 50 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 100)); return !!navigator.serviceWorker.controller; });
    ok('offline: the service worker controls the page', ctl);
    await p.evaluate(() => window.__gv.wait);
    await speak(p, LINE); await until(async () => await google(p) > 0, 8000);
    const heard = await p.evaluate(async () => { await new Promise(r => setTimeout(r, 300)); return (await (await caches.open('oren-audio-v2')).keys()).length; });
    ok('online: a heard line is kept on the device', heard >= 1, String(heard));
    // mid-session: the network drops, Oren keeps playing, the save waits and goes out when the network is back
    await ctx.setOffline(true); await sleep(200);
    const g0 = await google(p), t0 = tts;
    await speak(p, LINE); const playedOff = await until(async () => await google(p) > g0, 8000);
    ok('offline: a line heard before plays in the recorded voice from the device', playedOff && tts === t0 && await browserVoice(p) === 0, JSON.stringify({ played: playedOff, tts: tts - t0, n: await p.evaluate(() => window.__vs.n) }));
    await p.evaluate(() => { const O = window.OREN; O.save.gems = 52; O.persist(); }); await sleep(2500);
    ok('offline: the save waits (nothing reaches the server)', (saved() || {}).gems !== 52 && await p.evaluate(() => JSON.parse(localStorage.getItem('oren4-v1')).gems) === 52);
    await ctx.setOffline(false);
    ok('back online: the waiting save is sent', await until(() => (saved() || {}).gems === 52, 15000), JSON.stringify({ g: (saved() || {}).gems }));
    // offline from the start: the page opens from the device's copy, the save made offline is sent after reconnect
    await ctx.setOffline(true);
    const t1 = tts; await p.reload({ timeout: 30000 }).catch(e => errs.push('reload ' + e.message)); const up = await ready(p);
    ok('offline: the game opens with no network', up && await p.evaluate(() => !navigator.onLine && [...document.querySelectorAll('section.screen')].some(x => !x.hidden && x.offsetHeight > 0)));
    await L.noCoach(p); await p.evaluate(() => window.__gv.wait);
    const g1 = await google(p); await speak(p, LINE); const played2 = await until(async () => await google(p) > g1, 8000);
    ok('offline after reload: the recorded voice still plays from the device', played2 && tts === t1 && await browserVoice(p) === 0, JSON.stringify({ played: played2, gv: await p.evaluate(() => window.__gv.ok), n: await p.evaluate(() => window.__vs.n) }));
    await p.evaluate(() => { const O = window.OREN; O.save.gems = 63; O.save.s['add-0-1'] = 2; O.persist(); }); await sleep(2500);
    ok('offline after reload: the save waits on the device', (saved() || {}).gems !== 63 && await p.evaluate(() => JSON.parse(localStorage.getItem('oren4-v1')).gems) === 63);
    await ctx.setOffline(false);
    ok('back online after an offline start: the save is sent', await until(() => { const s = saved() || {}; return s.gems === 63 && (s.s || {})['add-0-1'] === 2; }, 15000), JSON.stringify({ g: (saved() || {}).gems }));
    await ctx.close(); }
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); srv.close();
  L.finish('network', res);
})().catch(e => { console.error(e); process.exit(1); });
