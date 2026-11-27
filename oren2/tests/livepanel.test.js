// #612: the parent's day view follows Oren live. Three pages through a fake /api/save (+ /api/log like the worker):
// A = Oren's device (desktop), B = the parent's phone with the day view open the whole time, C = a second phone whose
// timer never fires (only screen lock / unlock can refresh it). The kid plays 3 activities over simulated minutes, with a
// save outage in the middle (the retry must come back within ~1 min, not after the old 20 min backoff), then the save
// keeps failing: the panel says "אין עדכון מהמשחק מאז HH:MM" until a save works again.
const L = require('./lib');
const http = require('http'), fs = require('fs'), path = require('path'); const { chromium } = require('playwright'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const PUB = path.join(L.ROOT, 'cf', 'public'); const KV = new Map(); let FAIL = 0, SF = 0, puts = 0;
const srv = http.createServer((q, r) => { const m = /^\/api\/save\/([a-f0-9]{32})$/.exec(q.url);
  if (m) { if (q.method === 'GET') { const v = KV.get(m[1]); const h = { 'content-type': 'application/json' }; if (SF) h['x-sync-fail'] = String(SF); r.writeHead(v ? 200 : 404, h); return r.end(v || '{}'); }
    if (q.method === 'PUT') { let b = ''; q.on('data', c => b += c); q.on('end', () => { puts++; if (FAIL > 0 && /OrenKid/.test(q.headers['user-agent'] || '')) { FAIL--; r.writeHead(503, { 'content-type': 'application/json' }); return r.end('{"error":"store","why":"test outage"}'); } KV.set(m[1], b); r.end('{"ok":true}'); }); return; } }
  /* like the worker (#612): a 'sync' failure event from Oren's device is kept and returned with the save */
  if (q.url === '/api/log' && q.method === 'POST') { let b = ''; q.on('data', c => b += c); q.on('end', () => { try { (JSON.parse(b).ev || []).forEach(e => { if (e.k === 'sync' && e.kid === 1) SF = Math.max(SF, +e.t || 0); }); } catch (e) { } r.writeHead(200, { 'content-type': 'application/json' }); r.end('{"ok":true}'); }); return; }
  if (q.url.startsWith('/api/')) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{}'); }
  const f = path.join(PUB, q.url === '/' ? 'index.html' : q.url.split('?')[0].split('#')[0]); if (fs.existsSync(f)) r.end(fs.readFileSync(f)); else { r.writeHead(404); r.end(); } }).listen(0);
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const until = (pg, fn, arg, ms = 8000) => pg.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true).catch(() => false);
(async () => { const b = await chromium.launch(); const errs = []; const BASE = 'http://localhost:' + srv.address().port + '/';
  const A = await (await b.newContext({ viewport: { width: 1366, height: 768 }, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0 OrenKid' })).newPage(); /* the fake server fails only this device's saves */ A.on('pageerror', e => errs.push('A ' + e.message));
  /* __famRetry 100 ms stands for the real 5 s: the old backoff (x3 up to 20 min) would need ~85 s here after 8 failures, the cap (1 min = 12 x) ~7 s */
  await A.addInitScript(() => { window.__fast = true; window.__moments = false; window.__famGap = 0; window.__famRetry = 100; window.__logGap = 0; });
  await A.goto(BASE); await A.waitForFunction(() => window.OREN && window.OREN.family, null, { timeout: 20000 }); await L.noCoach(A);
  const ids = await A.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' };
    localStorage.setItem('oren4-played', O.today()); O.persist(); O.showMap(); return T.dailyPool().filter(id => T.ACT[id] && !/^ln-/.test(id)).slice(0, 4); });
  await A.evaluate(() => window.OREN.famNow()); await sleep(500);
  /* one activity: opens, two answers, 4 active play ticks (= 1 simulated minute), finished */
  const play = id => A.evaluate(id => { const O = window.OREN, DL = window.DAYLOG; document.querySelector('#hud').hidden = false; dispatchEvent(new Event('pointerdown'));
    DL.begin(id); O.emit('tq', id, true); O.emit('tq', id, false); for (let i = 0; i < 4; i++) O.timeTick(); DL.end('c', 2); }, id);
  const opt = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
  const B = await (await b.newContext(opt)).newPage(); B.on('pageerror', e => errs.push('B ' + e.message));
  await B.addInitScript(() => { window.__fast = true; window.__moments = false; window.__famGap = 0; window.__parPull = 700; });
  const C = await (await b.newContext(opt)).newPage(); C.on('pageerror', e => errs.push('C ' + e.message));
  await C.addInitScript(() => { window.__fast = true; window.__moments = false; window.__famGap = 0; window.__parPull = 600000; });
  for (const P of [B, C]) { await P.goto(BASE); await P.waitForFunction(() => window.OREN && window.OREN.family && window.TAL, null, { timeout: 20000 }); await L.noCoach(P); await P.evaluate(() => window.TAL.parentPanel('day')); }
  await sleep(300);
  const view = P => P.evaluate(() => { const v = document.querySelector('#sPar .pday'); return v ? { rows: v.querySelectorAll('.dllog .dlrow').length, tot: (v.querySelector('.pdtot') || {}).textContent || '',
    now: (v.querySelector('.pnow') || {}).textContent || '', txt: v.textContent } : null; });
  const rowsAre = (P, n, min) => until(P, ([n, min]) => { const v = document.querySelector('#sPar .pday'); return !!v && v.querySelectorAll('.dllog .dlrow').length === n && (v.querySelector('.pdtot') || {}).textContent.includes(min + ' דק׳'); }, [n, min], 15000);

  // ---------- 1: the panel, open the whole time, follows each new activity and the minutes ----------
  await play(ids[0]);
  ok('activity 1: the open panel shows its row and 1 minute, no reload', await rowsAre(B, 1, 1), JSON.stringify(await view(B)));
  /* a save outage while he plays (8 failed saves): the next save gets through within ~1 min, not after the 20 min backoff */
  FAIL = 8; await play(ids[1]);
  ok('activity 2 after 8 failed saves: the panel has it soon (retry wait capped)', await rowsAre(B, 2, 2), JSON.stringify(await view(B)) + ' fail left ' + FAIL);
  ok('the failed saves were retried, the outage is over', FAIL === 0, String(FAIL));

  // ---------- 2: screen locked and opened again -> it refreshes at once ----------
  const vis = (P, st) => P.evaluate(st => { Object.defineProperty(document, 'visibilityState', { value: st, configurable: true }); Object.defineProperty(document, 'hidden', { value: st === 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, st);
  ok('the phone whose timer never fired still shows the old state', (await view(C)).rows === 0, JSON.stringify(await view(C)));
  await vis(C, 'hidden'); await sleep(200); await vis(C, 'visible');
  ok('hidden then visible: the panel refreshes (2 rows, 2 minutes)', await rowsAre(C, 2, 2), JSON.stringify(await view(C)));
  await play(ids[2]);
  ok('activity 3: all 3 rows and 3 minutes on the open panel', await rowsAre(B, 3, 3), JSON.stringify(await view(B)));
  ok('no "no update" line while the saves work', !/אין עדכון מהמשחק/.test((await view(B)).txt));

  // ---------- 3: the kid's device cannot upload -> the panel says so in one line ----------
  const upT = JSON.parse(KV.get('a0'.repeat(16))).upT; ok('each upload carries its time (upT)', upT > 0, String(upT));
  FAIL = 1e9; await play(ids[3]);
  const hm = await B.evaluate(t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }, upT);
  ok('upload failing: "אין עדכון מהמשחק מאז HH:MM" (the last upload)', await until(B, hm => (document.querySelector('#sPar .pday .pnow') || {}).textContent.includes('אין עדכון מהמשחק מאז ' + hm), hm, 12000), JSON.stringify(await view(B)) + ' SF ' + SF);
  ok('the line is one line, at the top', await B.evaluate(() => document.querySelectorAll('#sPar .pdstale').length === 1));
  /* the parent's own phone saves during the outage (opening the panel saves on page load): the line keeps Oren's last upload time */
  await B.evaluate(() => window.OREN.famNow()); await sleep(300);
  ok('a parent save during the outage keeps the kid\'s upload time (upT)', JSON.parse(KV.get('a0'.repeat(16))).upT === upT, String(JSON.parse(KV.get('a0'.repeat(16))).upT) + ' vs ' + upT);
  await C.reload(); await C.waitForFunction(() => window.OREN && window.OREN.family && window.TAL, null, { timeout: 20000 }); await L.noCoach(C); await C.evaluate(() => window.TAL.parentPanel('day'));
  ok('a phone opened during the outage still says "מאז" the kid\'s last upload', await until(C, hm => (document.querySelector('#sPar .pday .pnow') || {}).textContent.includes('אין עדכון מהמשחק מאז ' + hm), hm, 12000), JSON.stringify(await view(C)));
  if (process.env.SHOTS) { fs.mkdirSync(L.SHOTDIR, { recursive: true }); await B.screenshot({ path: path.join(L.SHOTDIR, 'livepanel-stale-phone.png') }); }
  FAIL = 0; await A.evaluate(() => { window.OREN.timeTick(); });
  ok('a save works again: the line is gone and the 4th row is there', await until(B, () => { const v = document.querySelector('#sPar .pday'); return !!v && !v.querySelector('.pdstale') && v.querySelectorAll('.dllog .dlrow').length === 4; }, null, 12000), JSON.stringify(await view(B)));

  // ---------- 4: the read-aloud count is labelled (the stray "9×") ----------
  { const t = await B.evaluate(() => [window.DAYLOG.rowHTML([600, 'x', 0, 0, 0, 0, 'c', { ra: 9 }]), window.DAYLOG.rowHTML([600, 'x', 0, 0, 0, 0, 'c', { ra: 1 }])].map(h => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent; }));
    ok('read-aloud taps: "9 הקראות" / "הקראה אחת", no bare "×9"', /9 הקראות/.test(t[0]) && /הקראה אחת/.test(t[1]) && !/×/.test(t.join('')), JSON.stringify(t)); }
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); srv.close(); L.finish('livepanel', res);
})().catch(e => { console.error(e); srv.close(); L.finish('livepanel', res.concat(['FAIL crashed: ' + e.message])); });
