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
    // pcA is max-merged: "done" here is fine only when it came from Oren's laptop (it may sync first), never from the phone itself
    const aT = await A.evaluate(id => (window.OREN.save.pcA || {})[id] || 0, c.c.i);
    ok('the skip carries the target and the sender, and the parent\'s phone does not take it', c.c.to === 'kid' && c.c.by === c.me && (!c.done || aT > 0), JSON.stringify({ ...c, aT })); }
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

  // ---------- the parent uses the panel on Oren's own laptop (it holds the latest heartbeat): a reminder and a ✕ still reach it ----------
  await A.locator('.hlock .hface').first().click(); await sleep(300);
  ids.c = await A.evaluate(() => { const O = window.OREN, T = window.TAL, d = T.S().daily; const id = T.dailyPool().find(x => window.PDAY.topOf(x) === 'create' && !/^ln-/.test(x) && !d.t.includes(x));
    d.t.push(id); d.done.push(0); O.persist(); window.__kidUI = []; return id; });
  await A.evaluate(() => window.TAL.parentPanel('rem')); await sleep(400);
  const remA = () => A.locator('#sPar .psec', { hasText: 'תזכורת לאורן' });
  await remA().locator('.pchip', { hasText: /^עכשיו$/ }).click(); await sleep(150);
  await remA().locator('.bigbtn', { hasText: 'מים' }).click(); await sleep(300);
  await A.evaluate(() => window.TAL.parentPanel('day')); await sleep(400);
  const nmR = await A.evaluate(id => window.TAL.stepName(id), ids.c);
  await A.locator('#sPar .pdplan', { hasText: nmR }).last().locator('.tdx').click(); await sleep(400);
  { const r = await A.evaluate(() => { const c = window.PDAY.cmds().filter(x => x.k === 'drop').pop(); return { c, done: !!(window.OREN.save.pcA || {})[c && c.i], me: window.OREN.dev, ui: window.__kidUI.length }; });
    ok('panel open on his laptop: the reminder waits (no overlay over the panel), the command is from this device', r.c && r.c.by === r.me && !r.ui, JSON.stringify(r)); }
  await A.locator('#sPar .bigbtn', { hasText: 'יציאה מלוח ההורים' }).click(); await sleep(400); await A.evaluate(() => window.HEALTH.check());
  ok('panel closed on his laptop: the reminder shows there', await until(A, () => !!document.querySelector('.hlock.hrem .hk') && /מַיִם/.test(document.querySelector('.hlock.hrem h2').textContent), null, 4000));
  ok('... and the ✕ is applied there (the mission is off today)', await until(A, id => { const d = window.TAL.S().daily, c = window.PDAY.cmds().filter(x => x.k === 'drop').pop();
    return !!(window.OREN.save.pcA || {})[c.i] && !d.t.some((x, n) => x === id && !d.done[n]); }, ids.c, 4000));
  ok('his laptop keeps its play heartbeat after the panel', await A.evaluate(() => { window.DAYLOG.beat(); return window.OREN.save.now.dv === window.OREN.dev; }));

  // ---------- #648 "יום חדש": a done plan + the command -> a new path of missions not done today, on Oren's device only ----------
  await A.locator('.hlock .hback').click().catch(() => { }); await sleep(300);
  const before = await A.evaluate(() => { const O = window.OREN, T = window.TAL, d = T.dailyEnsure(); d.done = d.done.map(() => 1); d.claimed = 1; O.persist(); O.showMap();
    window.__tracked = []; const tr = O.track; O.track = function (k, ...a) { window.__tracked.push(k); return tr.call(this, k, ...a); };
    const did = [...new Set([...d.t, ...window.DAYLOG.rows(O.today()).map(e => e[1])])].filter(x => x !== 'math');
    window.__kidUI = []; window.__kidTx = []; new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1 && n.matches && n.matches('.pdskip')) window.__kidTx.push(n.textContent); }))).observe(document.body, { childList: true });
    return { did, stars: O.totalStars(), gems: O.save.gems | 0, n: d.t.length }; });
  await A.evaluate(() => window.OREN.famNow()); await sleep(600);
  const bDaily0 = await B.evaluate(() => { window.__kidUI = []; return JSON.stringify(window.TAL.S().daily); });
  await B.evaluate(() => window.TAL.parentPanel('day')); await sleep(400);
  const nd = B.locator('#sPar .bigbtn', { hasText: 'יום חדש' });
  ok('the parent day view has one "יום חדש" button', (await nd.count()) === 1);
  await nd.click(); await sleep(300);
  { const r = await B.evaluate(() => { const c = window.PDAY.cmds().filter(x => x.k === 'new').pop(); return { c, me: window.OREN.dev }; });
    ok('the new-day command is for Oren\'s device and carries the sender', r.c && r.c.to === 'kid' && r.c.by === r.me, JSON.stringify(r)); }
  ok('the parent sees "יום חדש · נשלח…" in today\'s timeline', /יום חדש[^]*נשלח…/.test(await B.locator('#sPar .dllog').textContent().catch(() => '')));
  await exitB();
  ok('the parent\'s phone does not take the new day (no overlay, its own path copy unchanged)', !(await bKid()).length && !(await B.evaluate(() => (window.__tracked || []).includes('newday'))) &&
    !(await B.evaluate(() => window.DAYLOG.rows(window.OREN.today()).some(e => e[1] === 'newday'))), JSON.stringify(await bKid()));
  await pullA();
  ok('Oren\'s laptop: the friend says "יוֹם חָדָשׁ, מַסָּע חָדָשׁ!"', await until(A, () => window.__kidTx.some(t => /יוֹם חָדָשׁ, מַסָּע חָדָשׁ!/.test(t)), null, 4000));
  { const r = await A.evaluate(() => { const O = window.OREN, d = window.TAL.S().daily, o = d.bs | 0;
      return { t: d.t.slice(o), open: d.done.slice(o).filter(x => !x).length, stars: O.totalStars(), gems: O.save.gems | 0, ev: (window.__tracked || []).includes('newday'),
        row: window.DAYLOG.rows(O.today()).some(e => e[1] === 'newday'), map: !document.querySelector('#sHome').hidden }; });
    ok('a new path with open missions starts at once', r.t.length >= 3 && r.open === r.t.length && r.map, JSON.stringify(r));
    ok('none of its missions was done today', !r.t.some(x => before.did.includes(x)), JSON.stringify({ t: r.t, did: before.did }));
    ok('stars and gems unchanged', r.stars === before.stars && r.gems === before.gems, JSON.stringify({ r, before }));
    ok('a play log event and a day log line on his laptop', r.ev && r.row, JSON.stringify(r)); }
  await sleep(2500); await A.evaluate(() => window.OREN.famNow()); await sleep(600);
  await B.evaluate(() => window.TAL.parentPanel('day')); await sleep(300);
  ok('the parent\'s timeline shows "יום חדש" with "אורן שמע ✓"', await until(B, () => [...document.querySelectorAll('#sPar .dllog .dlrow')].some(r => /יום חדש/.test(r.textContent) && /אורן שמע ✓/.test(r.textContent)), null, 6000),
    await B.evaluate(() => [...document.querySelectorAll('#sPar .dllog .dlrow')].map(r => r.textContent).join(' | ')));
  ok('no kid overlay on the parent\'s phone after the new day', !(await bKid()).length, JSON.stringify(await bKid()) + ' ' + bDaily0.length);
  // ---------- #617 (28 Nov): a tap on the phone never makes the laptop speak or act ----------
  await A.evaluate(() => { window.__kidUI = []; window.OREN.showMap(); }); await sleep(800);
  await A.evaluate(() => { window.__syn = 0; window.OREN.on('synced', () => window.__syn++); window.__cancels = 0;
    const fake = { speaking: false, pending: false, speak() { }, cancel() { window.__cancels++; }, getVoices() { return []; }, onvoiceschanged: null, addEventListener() { } };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true }); window.__fast = false; });
  await sleep(1200);
  const said0 = await A.evaluate(() => { window.__cancels = 0; return window.__autoSaid || 0; });
  /* Oren (or the parent) taps on the phone: a mission's gems and a sound setting change there, and the phone syncs */
  await B.evaluate(() => { const O = window.OREN; O.addGems(3); O.save.set.vol = (O.save.set.vol | 0) === 1 ? 2 : 1; O.persist(); O.famNow(); }); await sleep(800);
  await pullA(); await sleep(1500);
  { const r = await A.evaluate(s0 => ({ syn: window.__syn, said: (window.__autoSaid || 0) > s0, cancels: window.__cancels, home: !document.querySelector('#sHome').hidden, kid: window.__kidUI.slice() }), said0);
    await A.evaluate(() => { window.__fast = true; });
    ok('a tap on the phone reaches the laptop (synced)', r.syn > 0, JSON.stringify(r));
    ok('the laptop does not speak because of a tap on the phone', !r.said, JSON.stringify(r));
    ok('the laptop does not stop its own speech or change screen because of a tap on the phone', !r.cancels && r.home && !r.kid.length, JSON.stringify(r)); }
  // ---------- #746: the same, with a mission done on the phone, while the laptop is on a mission screen (not home) ----------
  await A.evaluate(id => { window.__fast = true; window.TAL_step(window.TAL.S().daily.t.indexOf(id)); }, ids.e); await sleep(600);
  await A.evaluate(() => { window.__fast = false; window.__kidUI = []; window.__cancels = 0; window.__scr = document.querySelector('.screen:not([hidden])') && document.querySelector('.screen:not([hidden])').id; window.__syn = 0; });
  const said1 = await A.evaluate(() => window.__autoSaid || 0);
  await B.evaluate(() => { const O = window.OREN, d = window.TAL.S().daily, i = d.done.findIndex(x => !x); if (i >= 0) d.done[i] = 1; O.addGems(2); O.persist(); O.famNow(); }); await sleep(800);
  await pullA(); await sleep(1500);
  { const r = await A.evaluate(s0 => ({ said: (window.__autoSaid || 0) > s0, cancels: window.__cancels, scr: (document.querySelector('.screen:not([hidden])') || {}).id, was: window.__scr, kid: window.__kidUI.slice() }), said1);
    await A.evaluate(() => { window.__fast = true; });
    ok('a mission done on the phone: the laptop on a mission screen stays there (no redraw to another screen)', r.scr === r.was && !r.kid.length, JSON.stringify(r));
    ok('... and does not speak or cut its speech', !r.said && !r.cancels, JSON.stringify(r)); }
  // ---------- #659 pause / resume from the parent panel: only Oren's laptop obeys, saved first, "עצור ✓" only after it confirmed ----------
  const SH = process.env.SHOTS_659; const shot = (pg, n) => SH ? pg.screenshot({ path: path.join(SH, n + '.png') }) : null;
  await B.evaluate(() => window.TAL.parentPanel('rem')); await sleep(400);
  const pzSec = B.locator('#sPar .psec', { hasText: 'עצירת המשחק' });
  ok('the panel has one pause button', (await pzSec.locator('.bigbtn').count()) === 1 && /עצור את המשחק/.test(await pzSec.textContent()));
  await A.evaluate(() => { window.__kidUI = []; window.OREN.persist(); });
  const saveT0 = await A.evaluate(() => JSON.stringify(window.OREN.save).length);
  await pzSec.locator('.bigbtn').click(); await sleep(300);
  { const r = await B.evaluate(() => ({ m: window.TAL.S().set.pz, me: window.OREN.dev })); ok('the pause command is for Oren\'s device and carries the sender', r.m && r.m.on === 1 && r.m.to === 'kid' && r.m.by === r.me && !r.m.ok, JSON.stringify(r)); }
  ok('the panel says "נשלח…", not "עצור", before the device confirmed', /נשלח…/.test(await pzSec.textContent()) && !/עצור ✓/.test(await pzSec.textContent()));
  ok('the parent\'s phone is not paused', !(await B.evaluate(() => window.OREN.paused)));
  await pullA();
  ok('Oren\'s laptop shows the calm pause screen with the friend', await until(A, () => window.OREN.paused && !!document.querySelector('.pzov.remote .hav svg') && !document.querySelector('.pzov.remote button'), null, 4000));
  ok('progress was saved before the pause (save kept, local copy written)', await A.evaluate(n => !!localStorage.getItem(Object.keys(localStorage).find(k => /oren4-save|oren4-s$/.test(k)) || 'x') || JSON.stringify(window.OREN.save).length >= n * 0.9, saveT0));
  await shot(A, 'pause-laptop-1366x768');
  await sleep(500); await A.evaluate(() => window.OREN.famNow()); await sleep(600);
  await A.evaluate(() => { window.OREN.showMap(); window.__pzSeen = 0; const f = () => { if (!window.OREN.paused || !document.querySelector('.pzov.remote')) window.__pzSeen++; }; window.__pzIv = setInterval(f, 20); window.OREN.emit && window.OREN.emit('synced'); });
  await sleep(1500);
  ok('a sync / screen change (home redraw) never lifts the parent\'s pause (no flash)', (await A.evaluate(() => { clearInterval(window.__pzIv); return window.__pzSeen; })) === 0);
  ok('the panel shows "המשחק עצור ✓" after the device confirmed (it follows by itself)', await until(B, () => /המשחק עצור ✓/.test((document.querySelector('#sPar .hpzst') || {}).textContent || ''), null, 6000), await pzSec.textContent().catch(() => ''));
  await shot(B, 'panel-phone-390x844');
  ok('still not paused on the parent\'s phone', !(await B.evaluate(() => window.OREN.paused)));
  await pzSec.locator('.bigbtn').click(); await sleep(300);
  await pullA();
  ok('resume: Oren\'s laptop is playing again', await until(A, () => !window.OREN.paused && !document.querySelector('.pzov'), null, 4000));
  await sleep(500); await A.evaluate(() => window.OREN.famNow()); await sleep(600);
  ok('the panel is back to "המשחק פועל"', await until(B, () => /המשחק פועל/.test((document.querySelector('#sPar .hpzst') || {}).textContent || ''), null, 6000));
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); srv.close();
  console.log(res.join('\n')); const f = res.filter(x => x.startsWith('FAIL')).length; console.log('RESULT kidcmd', res.length - f, f); process.exit(f ? 1 : 0);
})().catch(e => { console.log(res.join('\n')); console.error(String(e).slice(0, 300)); console.log('RESULT kidcmd 0 1'); process.exit(1); });

