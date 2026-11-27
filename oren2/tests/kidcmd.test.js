// #617: parent -> kid commands (message, reminder, skip) are shown and taken ONLY on Oren's play device, never on the device where
// the parent panel sent them; with two play devices, the one with the latest play heartbeat; the parent sees "נשלח…" -> "אורן שמע ✓".
// Two devices through a fake /api/save: A = Oren's laptop (playing), B = the parent's phone (panel open; Oren also played on it today).
const L = require('./lib');
const http = require('http'), fs = require('fs'), path = require('path'); const { chromium } = require('playwright'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const PUB = path.join(L.ROOT, 'cf', 'public'); const KV = new Map();
const srv = http.createServer((q, r) => { const m = /^\/api\/save\/([a-f0-9]{32})$/.exec(q.url);
  if (m) { if (q.method === 'GET') { const v = KV.get(m[1]); r.writeHead(v ? 200 : 404, { 'content-type': 'application/json' }); return r.end(v || '{}'); }
    if (q.method === 'PUT') { let b = ''; q.on('data', c => b += c); q.on('end', () => { KV.set(m[1], b); r.end('{"ok":true}'); }); return; } }
  if (q.url.startsWith('/api/')) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{}'); }
  const f = path.join(PUB, q.url === '/' ? 'index.html' : q.url.split('?')[0].split('#')[0]); if (fs.existsSync(f)) r.end(fs.readFileSync(f)); else { r.writeHead(404); r.end(); } }).listen(0);
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const until = (pg, fn, arg, ms = 8000) => pg.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true).catch(() => false);
(async () => { const b = await chromium.launch(); const errs = []; const BASE = 'http://localhost:' + srv.address().port + '/';
  /* one clock for both devices (tests/mute.js starts each page at 10:00 at its own load, so two pages would be seconds apart and
     "newer settings win" would pick the wrong device); like real devices, both read the same time */
  const d10 = new Date(); d10.setHours(+(process.env.TEST_HOUR || 10), 0, 0, 0); const OFF = d10 - Date.now();
  const sameClock = off => { const D = window.Date, R = () => Math.round(performance.timeOrigin + performance.now() + off);
    const F = function (...a) { return a.length ? new D(...a) : new D(R()); }; F.prototype = D.prototype; F.UTC = D.UTC; F.parse = D.parse; F.now = () => R(); window.Date = F; };
  const init = () => { window.__fast = true; window.__moments = false; window.__famGap = 0; window.__pcGap = 300; window.__skipWait = 6000; window.__health = true; window.__parPull = 400;
    /* every kid overlay this page ever shows: the message / reminder lock, the skip bubble */
    window.__kidUI = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1 && n.matches && n.matches('.hlock,.pdskip')) window.__kidUI.push(n.className); }))).observe(document, { childList: true, subtree: true }); };
  const A = await (await b.newContext({ viewport: { width: 1366, height: 768 } })).newPage(); A.on('pageerror', e => errs.push('A ' + e.message)); A.setDefaultTimeout(8000);
  await A.addInitScript(sameClock, OFF); await A.addInitScript(init);
  await A.goto(BASE); await A.waitForFunction(() => window.OREN && window.OREN.family && window.HEALTH, null, { timeout: 20000 }); await L.noCoach(A);
  const ids = await A.evaluate(() => { const O = window.OREN, T = window.TAL, P = window.PDAY; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' };
    const pool = T.dailyPool(); const by = t => pool.find(id => P.topOf(id) === t && !/^ln-/.test(id));
    const ids = { r: by('readg'), e: by('explore') }; T.S().daily = { d: O.today(), t: ['math', ids.r, ids.e], done: [1, 0, 0], ch: 'math', cr: [] };
    localStorage.setItem('oren4-played', O.today()); O.persist(); O.showMap(); return ids; });
  /* he plays a mission on his laptop (the play heartbeat), then is back home */
  await A.evaluate(id => window.TAL_step(window.TAL.S().daily.t.indexOf(id)), ids.r); await sleep(400);
  await A.evaluate(() => { const c = window.DAYLOG.cur(); if (c && !c.end) window.DAYLOG.end('q'); window.OREN.showMap(); window.OREN.famNow(); }); await sleep(800);

  const B = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage(); B.on('pageerror', e => errs.push('B ' + e.message)); B.setDefaultTimeout(8000);
  await B.addInitScript(sameClock, OFF); await B.addInitScript(init);
  await B.goto(BASE); await B.waitForFunction(() => window.OREN && window.OREN.family && window.TAL && window.TAL.S().daily && window.HEALTH, null, { timeout: 20000 }).catch(() => { });
  await L.noCoach(B);
  /* Oren also played on the parent's phone earlier today (the same game page) */
  await B.evaluate(() => localStorage.setItem('oren4-played', window.OREN.today()));
  const pullA = () => A.evaluate(() => window.OREN.famPull()).then(() => A.evaluate(() => window.HEALTH.check())).then(() => sleep(400));
  const remSec = () => B.locator('#sPar .psec', { hasText: 'תזכורת לאורן' });
  const exitB = async () => { await B.locator('#sPar .bigbtn', { hasText: 'יציאה מלוח ההורים' }).click(); await sleep(300); await B.evaluate(() => window.HEALTH.check()); await sleep(1500); };
  const bKid = () => B.evaluate(() => window.__kidUI.slice());

  // ---------- a typed message ----------
  await B.evaluate(() => window.TAL.parentPanel('rem')); await sleep(400);
  await remSec().locator('.pchip', { hasText: /^עכשיו$/ }).click(); await sleep(150);
  await remSec().locator('input.hmsgin').fill('אבא אוהב אותך'); await remSec().locator('.hmsgsend').click(); await sleep(300);
  { const r = await B.evaluate(() => ({ m: window.TAL.S().set.rem, me: window.OREN.dev })); ok('the message carries its target (kid) and the sender\'s device id', r.m && r.m.to === 'kid' && r.m.by && r.m.by === r.me, JSON.stringify(r)); }
  ok('the parent sees "נשלח…" while it is on its way', /נשלח…/.test(await remSec().textContent()));
  await exitB();
  ok('the message never shows on the parent\'s phone, also after the panel is closed', !(await bKid()).length, JSON.stringify(await bKid()));
  await pullA();
  ok('Oren\'s laptop shows the message (the friend says it)', await until(A, () => (document.querySelector('.hlock.hmsg h2') || {}).textContent === 'אבא אוהב אותך', null, 4000));
  await A.locator('.hlock .hface').first().click(); await sleep(300); await A.evaluate(() => window.OREN.famNow()); await sleep(600);
  await B.evaluate(() => window.TAL.parentPanel('rem')); await sleep(300);
  ok('the parent sees "אורן שמע ✓" (from his laptop, the panel follows by itself)', await until(B, () => /אורן שמע ✓/.test((document.querySelector('#sPar .hremst') || {}).textContent || ''), null, 6000),
    await remSec().textContent().catch(() => ''));

  // ---------- a reminder ----------
  await remSec().locator('.bigbtn', { hasText: 'מים' }).click(); await sleep(300);
  ok('the reminder: "נשלח…" on the parent\'s phone', /נשלח…/.test(await B.locator('#sPar .hremst').textContent()));
  await exitB();
  ok('the reminder never shows on the parent\'s phone', !(await bKid()).length, JSON.stringify(await bKid()));
  await pullA();
  ok('the reminder shows on Oren\'s laptop', await until(A, () => !!document.querySelector('.hlock.hrem .hk') && /מַיִם/.test(document.querySelector('.hlock.hrem h2').textContent), null, 4000));
  await A.locator('.hlock .hback').click(); await sleep(300); await A.evaluate(() => window.OREN.famNow()); await sleep(600);
  await B.evaluate(() => window.TAL.parentPanel('rem')); await sleep(300);
  ok('the reminder: "אורן שמע ✓" on the parent\'s phone', await until(B, () => /אורן שמע ✓/.test((document.querySelector('#sPar .hremst') || {}).textContent || ''), null, 6000));

  // ---------- skip now ----------
  await A.evaluate(id => window.TAL_step(window.TAL.S().daily.t.indexOf(id)), ids.e); await sleep(500);
  await A.evaluate(() => { window.OREN.timeTick && window.OREN.timeTick(); window.OREN.famNow(); }); await sleep(600);
  await B.evaluate(() => window.TAL.parentPanel('day')); await sleep(300);
  ok('"דלג עכשיו" on the parent\'s phone while he plays', await until(B, () => !!document.querySelector('#sPar .pnow .pdskipnow'), null, 6000));
  await B.locator('#sPar .pnow .pdskipnow').click(); await sleep(300);
  { const c = await B.evaluate(() => { const c = window.PDAY.cmds().filter(x => x.k === 'now').pop(); return { c, done: !!(window.OREN.save.pcA || {})[c.i], me: window.OREN.dev }; });
    ok('the skip carries the target and the sender, and the parent\'s phone does not take it', c.c.to === 'kid' && c.c.by === c.me && !c.done, JSON.stringify(c)); }
  ok('the parent sees "נשלח…" on the skip', /נשלח…/.test(await B.locator('#sPar .pnow').textContent()));
  await sleep(1200); await A.evaluate(() => window.OREN.famPull()); await sleep(400);
  ok('Oren\'s laptop takes the skip (waits for his answer)', await until(A, () => !!window.PDAY.pending(), null, 4000));
  await A.evaluate(id => window.OREN.emit('tq', id, true), ids.e);
  ok('the friend says "let\'s move on" on Oren\'s laptop', await until(A, () => /בּוֹא נַעֲבֹר/.test((document.querySelector('.pdskip') || {}).textContent || ''), null, 4000));
  await sleep(2500); await A.evaluate(() => window.OREN.famNow()); await sleep(600);
  ok('the parent sees "אורן שמע ✓" on the skip', await until(B, () => [...document.querySelectorAll('#sPar .dllog .dl-p')].some(r => /אורן שמע ✓/.test(r.textContent)), null, 6000),
    await B.evaluate(() => [...document.querySelectorAll('#sPar .dllog .dlrow')].map(r => r.textContent).join(' | ')));
  ok('the parent\'s phone never showed a kid overlay (message, reminder, skip)', !(await bKid()).length, JSON.stringify(await bKid()));

  // ---------- two play devices: only the one with the latest play heartbeat ----------
  await B.evaluate(() => window.TAL.parentPanel('rem')); await sleep(300);
  await A.evaluate(() => { const c = window.DAYLOG.cur(); if (c && !c.end) window.DAYLOG.end('q'); window.OREN.showMap(); }); await sleep(300);
  await A.evaluate(() => { window.__kidUI = []; const O = window.OREN; O.save.now = { id: null, t: Date.now() + 60000, s: Date.now(), dv: 'other-laptop' }; O.persist(); });
  await remSec().locator('input.hmsgin').fill('עוד הודעה'); await remSec().locator('.hmsgsend').click(); await sleep(300); await exitB();
  await pullA(); await sleep(600); await A.evaluate(() => window.HEALTH.check()); await sleep(400);
  ok('he plays on another device now (newer heartbeat): this laptop does not take the message', !(await A.evaluate(() => window.__kidUI.length)) && !(await A.evaluate(() => window.TAL.S().set.rem.s)));
  await A.evaluate(() => { const O = window.OREN; O.save.now = { id: null, t: Date.now() + 120000, s: Date.now(), dv: O.dev }; O.persist(); window.HEALTH.check(); }); await sleep(400);
  ok('... and takes it once its heartbeat is the latest again', await until(A, () => (document.querySelector('.hlock.hmsg h2') || {}).textContent === 'עוד הודעה', null, 4000));
  ok('no kid overlay on the parent\'s phone at all', !(await bKid()).length, JSON.stringify(await bKid()));

  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); srv.close();
  console.log(res.join('\n')); const f = res.filter(x => x.startsWith('FAIL')).length; console.log('RESULT kidcmd', res.length - f, f); process.exit(f ? 1 : 0);
})().catch(e => { console.log(res.join('\n')); console.error(String(e).slice(0, 300)); console.log('RESULT kidcmd 0 1'); process.exit(1); });

