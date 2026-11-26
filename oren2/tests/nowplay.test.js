// #352: parent panel "playing now · N min (from HH:MM)" with one stop button; the "today" card never says "hasn't played" after play.
// Two devices through a fake /api/save: A = Oren's device (desktop), B = the parent's phone (390x844).
const L = require('./lib');
const http = require('http'), fs = require('fs'), path = require('path'); const { chromium } = require('playwright'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const PUB = path.join(L.ROOT, 'cf', 'public'); const KV = new Map();
const srv = http.createServer((q, r) => { const m = /^\/api\/save\/([a-f0-9]{32})$/.exec(q.url);
  if (m) { if (q.method === 'GET') { const v = KV.get(m[1]); r.writeHead(v ? 200 : 404, { 'content-type': 'application/json' }); return r.end(v || '{}'); }
    if (q.method === 'PUT') { let b = ''; q.on('data', c => b += c); q.on('end', () => { KV.set(m[1], b); r.end('{"ok":true}'); }); return; } }
  if (q.url.startsWith('/api/')) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{}'); }
  const f = path.join(PUB, q.url === '/' ? 'index.html' : q.url.split('?')[0].split('#')[0]); if (fs.existsSync(f)) r.end(fs.readFileSync(f)); else { r.writeHead(404); r.end(); } }).listen(0);
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
(async () => { const b = await chromium.launch(); const errs = []; const BASE = 'http://localhost:' + srv.address().port + '/';
  const init = () => { window.__fast = true; window.__famGap = 0; window.__parPull = 300; };
  const A = await (await b.newContext({ viewport: { width: 1366, height: 768 } })).newPage(); await A.addInitScript(init); A.on('pageerror', e => errs.push('A ' + e.message));
  await A.goto(BASE); await A.waitForFunction(() => window.OREN && window.OREN.family, null, { timeout: 20000 }); await L.noCoach(A);
  await A.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; O.persist(); O.showMap(); }); await sleep(1500);
  // A plays: one active tick is the heartbeat (save.now with the session start)
  await A.evaluate(() => { document.querySelector('#hud').hidden = false; window.OREN.timeTick(); }); await sleep(2500);
  const hb = JSON.parse(KV.get('a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0') || '{}').now || {};
  const aNow = await A.evaluate(() => Date.now()); /* the browser clock, not node's */
  ok('a play tick writes the heartbeat with the session start to the family save', hb.t > aNow - 60000 && hb.s && hb.s <= hb.t, JSON.stringify(hb));

  const B = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage(); await B.addInitScript(() => { window.__fast = true; window.__famGap = 0; window.__parPull = 600000; }); B.on('pageerror', e => errs.push('B ' + e.message));
  await B.goto(BASE); await B.waitForFunction(() => window.OREN && window.OREN.family && window.OREN.save.now, null, { timeout: 20000 }).catch(() => { }); await L.noCoach(B);
  await B.evaluate(() => window.TAL.parentPanel('sum')); await sleep(300);
  const top = () => B.evaluate(() => { const e = document.querySelector('#sPar .pnow'); const btn = e && [...e.querySelectorAll('button')].find(x => x.textContent.includes('לעצור עכשיו'));
    const tot = document.querySelector('#sPar .pdtot'); return { txt: e ? e.textContent : null, btn: !!btn, above: !!(e && tot && (e.compareDocumentPosition(tot) & 4)) }; });
  { const t = await top(); ok('parent sees "playing now" at the top, with one stop button', /משחק עכשיו/.test(t.txt) && t.btn && t.above, JSON.stringify(t)); }
  // the right minutes from the session start: heartbeat 1 min ago, started 25 min ago
  const at = (ago, len) => B.evaluate(([ago, len]) => { const t = Date.now() - ago * 60000, s = t - len * 60000; window.OREN.save.now = { id: null, t, s }; window.TAL.parentPanel('sum');
    const d = new Date(Date.now() - (ago + len) * 60000); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }, [ago, len]);
  { const hm = await at(1, 24); const t = await top(); ok('heartbeat 1 min ago: "משחק עכשיו · 25 דק׳ (מ-HH:MM)"', t.txt && t.txt.includes('משחק עכשיו · 25 דק׳ (מ-' + hm + ')') && t.btn, JSON.stringify(t) + ' ' + hm); }
  { await at(4, 20); const t = await top(); ok('heartbeat 4 min ago: "שיחק לאחרונה", no stop button', /שיחק לאחרונה: היום/.test(t.txt) && !/משחק עכשיו/.test(t.txt) && !t.btn, JSON.stringify(t)); }
  { await B.evaluate(() => window.TAL.parentPanel('day')); const t = await top(); ok('#359: the line is at the top of the day view', !!t.txt && t.above, JSON.stringify(t)); }

  // "today" card: minutes but no activity in today's list -> no "hasn't played yet"; the arcade is named
  await B.evaluate(() => { window.__tt = () => { window.TAL.parentPanel('full'); const s = [...document.querySelectorAll('#sPar .psec')].find(x => (x.querySelector('h3') || {}).textContent === 'היום'); return s ? s.querySelector('.pnote').textContent : null; };
    window.__day = () => { const O = window.OREN, d = O.today(); O.save.alog = O.save.alog || {}; return O.save.alog[d] = O.save.alog[d] || { a: {}, s: 0, k: {} }; }; });
  { const t = await B.evaluate(() => { window.TAL.S().time[window.OREN.today()] = 480; window.__day().a = {}; return window.__tt(); }); ok('today: 8 min and no activity -> never "עוד לא שיחק"', t && /8 דק׳/.test(t) && !/עוד לא שיחק/.test(t), t); }
  { const t = await B.evaluate(() => { window.__day().a = { 'arc-balloon': 2 }; return window.__tt(); }); ok('today: arcade play is counted and named', t && /ארקייד/.test(t) && !/arc-/.test(t), t); }
  { const t = await B.evaluate(() => { const O = window.OREN; window.TAL.S().time[O.today()] = 0; window.__day().a = {}; O.save.now = { id: null, t: Date.now() - 30 * 60000, s: Date.now() - 40 * 60000 }; return window.__tt(); }); ok('today: a last-play time today -> no "עוד לא שיחק"', t && !/עוד לא שיחק/.test(t), t); }
  { const t = await B.evaluate(() => { const O = window.OREN; window.TAL.S().time[O.today()] = 0; window.__day().a = {}; O.save.now = null; return window.__tt(); }); ok('today: no minutes and no play -> "עוד לא שיחק"', t && /עוד לא שיחק/.test(t), t); }

  // the stop button: Oren's device gets the gentle stop screen on its next sync
  await A.evaluate(() => window.OREN.timeTick()); await sleep(2500);
  await B.evaluate(() => window.OREN.famPull()); await sleep(500); await B.evaluate(() => window.TAL.parentPanel('sum')); await sleep(300);
  { const t = await top(); ok('before stop: playing now', /משחק עכשיו/.test(t.txt) && t.btn, JSON.stringify(t)); }
  if (process.env.SHOTS) { fs.mkdirSync(L.SHOTDIR, { recursive: true }); await B.screenshot({ path: path.join(L.SHOTDIR, 'nowplay-phone.png') }); }
  await B.locator('#sPar .pnow button', { hasText: 'לעצור עכשיו' }).click(); await sleep(1500);
  ok('stop uses the parent time mechanism ("he has" -> 0 left)', await B.evaluate(() => window.TAL.timeLeft() === 0), await B.evaluate(() => JSON.stringify(window.TAL.S().set.lim)));
  { const t = await top(); ok('after stop: no second stop button', !t.btn, JSON.stringify(t)); }
  await A.evaluate(() => window.OREN.timeTick());
  const locked = await A.waitForFunction(() => { const e = document.querySelector('.tlock:not(.tyay)'); return !!e && /הַזְּמַן שֶׁל הַיּוֹם נִגְמַר/.test(e.textContent); }, null, { timeout: 10000 }).then(() => true).catch(() => false);
  ok('Oren\'s device shows the gentle stop screen on the next sync', locked, await A.evaluate(() => JSON.stringify(window.TAL.S().set.lim)));
  // the parent panel itself is not a heartbeat (only Oren's play is)
  { const t0 = await B.evaluate(() => (window.OREN.save.now || {}).t); await B.evaluate(() => window.OREN.timeTick()); ok('the parent panel does not send a heartbeat', await B.evaluate(() => (window.OREN.save.now || {}).t) === t0); }
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); srv.close(); L.finish('nowplay', res);
})().catch(e => { console.error(e); srv.close(); L.finish('nowplay', res.concat(['FAIL crashed: ' + e.message])); });
