// #359: the parent panel's day view — one day with ‹ ›, what he did (live), the plan ahead (changes reach Oren's device by sync),
// skips from the parent's phone (now · a mission · a topic · a level he knows), undo, an offline queue, no level drop, no settings on the main view.
// Two devices through a fake /api/save: A = Oren's device (desktop), B = the parent's phone (390x844).
const L = require('./lib');
const http = require('http'), fs = require('fs'), path = require('path'); const { chromium } = require('playwright'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const PUB = path.join(L.ROOT, 'cf', 'public');
const serve = KV => http.createServer((q, r) => { const m = /^\/api\/save\/([a-f0-9]{32})$/.exec(q.url);
  if (m) { if (q.method === 'GET') { const v = KV.get(m[1]); r.writeHead(v ? 200 : 404, { 'content-type': 'application/json' }); return r.end(v || '{}'); }
    if (q.method === 'PUT') { let b = ''; q.on('data', c => b += c); q.on('end', () => { KV.set(m[1], b); r.end('{"ok":true}'); }); return; } }
  if (q.url.startsWith('/api/')) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{}'); }
  const f = path.join(PUB, q.url === '/' ? 'index.html' : q.url.split('?')[0].split('#')[0]); if (fs.existsSync(f)) r.end(fs.readFileSync(f)); else { r.writeHead(404); r.end(); } }).listen(0);
const KV = new Map(), srv = serve(KV);
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const until = (pg, fn, arg, ms = 8000) => pg.waitForFunction(fn, arg, { timeout: ms, polling: 100 }).then(() => true).catch(() => false);
// #621: a fresh family (its own fake save server): the kid opens his first mission of the day, the parent's day view shows
// "playing now" and never "עוד לא שיחק היום" with it (day view and the health part); no heartbeat and no rows: the line is back.
async function playingNoRows(b, errs) { const KV2 = new Map(), s2 = serve(KV2); const BASE = 'http://localhost:' + s2.address().port + '/', FAM = 'a0'.repeat(16);
  const K = await (await b.newContext({ viewport: { width: 1366, height: 768 } })).newPage(); K.on('pageerror', e => errs.push('K ' + e.message));
  await K.addInitScript(() => { window.__fast = true; window.__moments = false; window.__famGap = 0; window.__pcGap = 300; });
  await K.goto(BASE); await K.waitForFunction(() => window.OREN && window.OREN.family, null, { timeout: 20000 }); await L.noCoach(K);
  await K.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; localStorage.setItem('oren4-played', O.today()); O.persist(); O.showMap(); O.famNow(); }); await sleep(500);
  const P = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage(); P.on('pageerror', e => errs.push('P ' + e.message));
  await P.addInitScript(() => { window.__fast = true; window.__moments = false; window.__famGap = 0; window.__parPull = 400; });
  await P.goto(BASE); await P.waitForFunction(() => window.OREN && window.OREN.family && window.TAL, null, { timeout: 20000 }); await L.noCoach(P);
  const txt = () => P.evaluate(() => document.querySelector('#sPar').textContent);
  await P.evaluate(() => window.TAL.parentPanel('day')); await sleep(300);
  { const t = await txt(); ok('#621 not played yet today, no heartbeat: "עוד לא שיחק היום"', /עוד לא שיחק היום/.test(t) && !/משחק עכשיו/.test(t), t.slice(0, 160)); }
  const id = await K.evaluate(() => window.TAL.dailyPool().find(id => !/^arc-|^ln-/.test(id)));
  await K.evaluate(id => { window.TAL.ACT[id].run(() => {}); document.querySelector('#hud').hidden = false; window.OREN.timeTick(); }, id);
  const live = await until(P, () => /משחק עכשיו/.test(document.querySelector('#sPar').textContent), null, 10000);
  { const t = await txt(); ok('#621 the kid opens a mission: within 10 s "משחק עכשיו" and no "עוד לא שיחק היום"', live && !/עוד לא שיחק היום/.test(t), t.slice(0, 200)); }
  await P.evaluate(() => window.TAL.parentPanel('rem')); await sleep(300);
  { const t = await txt(); ok('#621 health part while he plays: no "עוד לא שיחק היום"', !/עוד לא שיחק היום/.test(t), t.slice(0, 200)); }
  /* he stops: no heartbeat for 10 min (stale now.t), still no finished rows -> the line is back */
  await K.close(); const stale = await P.evaluate(() => Date.now() - 10 * 60000); const sv = JSON.parse(KV2.get(FAM)); sv.now = Object.assign(sv.now || {}, { t: stale, s: stale }); KV2.set(FAM, JSON.stringify(sv));
  await P.evaluate(t => { const O = window.OREN; O.realSave.now = Object.assign(O.realSave.now || {}, { t, s: t }); const T = window.TAL; T.S().time && delete T.S().time[O.today()];
    const hd = (O.realSave.health || {})[O.today()]; if (hd) hd.dom = {}; window.TAL.parentPanel('day'); }, stale); await sleep(300);
  { const t = await txt(); ok('#621 stale heartbeat, no rows: "עוד לא שיחק היום" again', /עוד לא שיחק היום/.test(t) && !/משחק עכשיו/.test(t), t.slice(0, 200)); }
  await P.context().close(); await K.context().close(); s2.close(); }
(async () => { const b = await chromium.launch(); const errs = []; const BASE = 'http://localhost:' + srv.address().port + '/';
  const A = await (await b.newContext({ viewport: { width: 1366, height: 768 } })).newPage(); A.on('pageerror', e => errs.push('A ' + e.message)); A.setDefaultTimeout(8000);
  await A.addInitScript(() => { window.__fast = true; window.__moments = false; window.__famGap = 0; window.__pcGap = 300; window.__skipWait = 6000; });
  await A.goto(BASE); await A.waitForFunction(() => window.OREN && window.OREN.family, null, { timeout: 20000 }); await L.noCoach(A);
  // Oren's path for today: math + three missions from three different topics; he played on this device today
  const ids = await A.evaluate(() => { const O = window.OREN, T = window.TAL, P = window.PDAY; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' };
    const pool = T.dailyPool(); const by = t => pool.find(id => P.topOf(id) === t && !/^ln-/.test(id));
    const ids = { r: by('readg'), e: by('explore'), c: by('create') }; T.S().daily = { d: O.today(), t: ['math', ids.r, ids.e, ids.c], done: [0, 0, 0, 0], ch: 'math', cr: [] };
    localStorage.setItem('oren4-played', O.today());
    const y = new Date(); y.setDate(y.getDate() - 1); const yd = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    window.DAYLOG.add(yd, [540, ids.c, 3, 5, 6, 0, 'c']); const nm = new Date().getHours() * 60 + new Date().getMinutes(); window.__m0 = Math.max(0, nm - 60); window.DAYLOG.add(O.today(), [window.__m0, ids.r, 2, 4, 6, 1, 'c', { lv: 2, ra: 1 }]);
    O.persist(); O.showMap(); return Object.assign(ids, { yd }); });
  await A.evaluate(() => window.OREN.famNow()); await sleep(800);

  const B = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage(); B.on('pageerror', e => errs.push('B ' + e.message)); B.setDefaultTimeout(8000);
  await B.addInitScript(() => { window.__fast = true; window.__moments = false; window.__famGap = 0; window.__parPull = 400; });
  await B.goto(BASE); await B.waitForFunction(() => window.OREN && window.OREN.family && window.TAL && window.TAL.S().daily, null, { timeout: 20000 }).catch(() => { });
  await B.evaluate(() => window.TAL.parentPanel('day')); await sleep(300);
  const view = () => B.evaluate(() => { const v = document.querySelector('#sPar .pday'); return { day: (v.querySelector('.pdday') || {}).textContent, did: [...v.querySelectorAll('.dllog .dlrow')].map(r => r.textContent),
    plan: [...v.querySelectorAll('.pdplan .pn')].map(r => r.textContent), txt: v.textContent }; });

  // ---------- the main view ----------
  { const v = await view(); ok('opens on today, with what he did: name, topic, ✓/✗, stars, level, help, read-aloud', v.day === 'היום' && v.did.length === 1 && /✓ 4 · ✗ 2/.test(v.did[0]) && /⭐⭐/.test(v.did[0]) && /רמה 2/.test(v.did[0]) && /עזרה ×1/.test(v.did[0]) && /הקראה אחת/.test(v.did[0]), JSON.stringify(v.did)); }
  { const v = await view(); ok('the plan ahead: the open missions in order', v.plan.length === 4 && /חשבון/.test(v.plan[0]), JSON.stringify(v.plan)); }
  { const m = await B.evaluate(() => { const s = document.querySelector('#sPar'); return { inputs: s.querySelectorAll('input,select,textarea').length, more: [...s.querySelectorAll('button')].filter(x => /הגדרות ועוד/.test(x.textContent)).length,
      words: /הגבלה קבועה|סיסמה|בדיקת קול|תזכורת לאורן|תקלות/.test(s.textContent), tabs: s.querySelectorAll('.ptabs').length }; });
    ok('the main view has no settings controls, one "הגדרות ועוד" entry', m.inputs === 0 && m.more === 1 && !m.words && !m.tabs, JSON.stringify(m)); }
  { await B.locator('#sPar .pdmore').click(); await sleep(200); const t = await B.evaluate(() => [...document.querySelectorAll('#sPar summary')].map(x => x.textContent).join('|'));
    ok('"הגדרות ועוד" holds time, reminders + message, voice, the template', /זמן משחק/.test(t) && /תזכורת/.test(t) && /קול/.test(t) && /התבנית/.test(t), t);
    await B.locator('#sPar .pdback').click(); await sleep(200); }
  { const m = await B.evaluate(() => ({ learn: !!document.querySelector('#sPar .pdlearn'), ask: !!document.querySelector('#sPar .pdask') }));
    ok('#429 #430 nothing finished with a goal yet: no "מה למד היום", no question', !m.learn && !m.ask, JSON.stringify(m)); }
  if (process.env.SHOTS) { fs.mkdirSync(L.SHOTDIR, { recursive: true }); await B.screenshot({ path: path.join(L.SHOTDIR, 'pday-phone.png'), fullPage: true }); }

  // ---------- day navigation ----------
  await B.locator('#sPar .pdprev').click(); await sleep(200);
  { const v = await view(); ok('› shows yesterday with yesterday\'s rows only, no plan', v.day === 'אתמול' && v.did.length === 1 && /✓ 5 · ✗ 1/.test(v.did[0]) && !v.plan.length, JSON.stringify(v)); }
  await B.locator('#sPar .pdprev').click(); await sleep(200);
  { const v = await view(); ok('a day without play says so', /לא שיחק ביום הזה/.test(v.txt) && !v.did.length, v.txt.slice(0, 120)); }
  ok('#431 an empty week shows no week picture', !(await B.evaluate(() => !!document.querySelector('#sPar .pdweek'))));
  await B.locator('#sPar .pdnext').click(); await B.locator('#sPar .pdnext').click(); await sleep(200);
  { const v = await view(); ok('‹ back to today', v.day === 'היום' && v.did.length === 1 && await B.evaluate(() => document.querySelector('#sPar .pdnext').disabled), v.day); }

  // ---------- live ----------
  await A.evaluate(id => { window.DAYLOG.add(window.OREN.today(), [window.__m0 + 30, id, 3, 6, 6, 0, 'c']); window.OREN.persist(); window.OREN.famNow(); }, ids.e);
  ok('live: a new activity on his device appears on the open day view by itself', await until(B, () => document.querySelectorAll('#sPar .pday .dllog .dlrow').length === 2));

  // ---------- plan changes reach Oren's device ----------
  const kidPlan = () => A.evaluate(() => { const d = window.TAL.S().daily; return d.t.filter((x, n) => !d.done[n]); });
  const pull = () => A.evaluate(() => window.OREN.famPull()).then(() => sleep(300));
  /* the parent's view follows his device (his save goes up ~1.5 s after a change) */
  const syncB = () => until(B, () => !window.PDAY.cmds().some(c => !(window.OREN.save.pcA || {})[c.i]), null, 6000).then(() => sleep(200));
  await B.locator('#sPar .pdplan', { hasText: await B.evaluate(id => window.TAL.stepName(id), ids.r) }).locator('.tdx').click(); await sleep(300);
  { const v = await view(); ok('✕ on a mission: it leaves the plan at once, "דילג (הורה) · ממתין" with בטל', v.plan.length === 3 && v.did.some(x => /דילג \(הורה\).*ממתין/.test(x)), JSON.stringify(v)); }
  await pull();
  { const k = await kidPlan(); const row = await A.evaluate(id => (window.OREN.save.alog[window.OREN.today()].e || []).find(e => e[6] === 'p' && e[1] === id), ids.r);
    ok('Oren\'s device takes it on the next sync: the mission is off today, a "p" line in the log', !k.includes(ids.r) && k.length === 3 && !!row, JSON.stringify(k)); }
  await until(B, () => [...document.querySelectorAll('#sPar .dllog .dl-p')].some(r => !/ממתין/.test(r.textContent)), null, 6000);
  { const v = await view(); ok('the parent sees "דילג (הורה)" from his device, with בטל', v.did.some(x => /דילג \(הורה\)/.test(x) && !/ממתין/.test(x)) && await B.locator('#sPar .dllog .dl-p button', { hasText: 'בטל' }).count() === 1, JSON.stringify(v.did)); }
  await B.locator('#sPar .dllog .dl-p button', { hasText: 'בטל' }).click(); await sleep(300); await pull();
  { const k = await kidPlan(); ok('undo: the mission is back on his device, in its place', k.length === 4 && k[1] === ids.r, JSON.stringify(k)); }
  await until(B, () => !document.querySelector('#sPar .dllog .dl-p'), null, 6000);
  { const v = await view(); ok('undo: the skip line is gone from the day list', !v.did.some(x => /דילג/.test(x)) && v.plan.length === 4, JSON.stringify(v)); }
  // move a mission up
  { await syncB(); const row = B.locator('#sPar .pdplan', { hasText: await B.evaluate(id => window.TAL.stepName(id), ids.c) }); await row.click(); await row.locator('button', { hasText: 'למעלה' }).click(); await sleep(300); await pull();
    const k = await kidPlan(); ok('▲ on the parent\'s phone moves the mission up on his device', k.indexOf(ids.c) === 2 && k.indexOf(ids.e) === 3, JSON.stringify(k)); }
  // a topic not today
  { await syncB(); const row = B.locator('#sPar .pdplan', { hasText: await B.evaluate(id => window.TAL.stepName(id), ids.e) }); await row.click(); await row.locator('button', { hasText: 'לא היום' }).click(); await sleep(300); await pull();
    const k = await kidPlan(); const topic = await A.evaluate(id => window.PDAY.topOf(id), ids.e);
    ok('"לא היום": all missions of that topic leave today on his device', !(await A.evaluate((k, t) => k.some(x => window.PDAY.topOf(x) === t), [k, topic])) && k.length === 3, JSON.stringify(k)); }
  { /* ... and come back tomorrow: a copy of today's path is moved one day back, the next day's path is built from it, then today is restored */
    const nd = await A.evaluate(() => { const T = window.TAL, O = window.OREN, keep = JSON.stringify(T.S().daily); T.S().daily.d = '2000-01-01';
      const d = T.dailyEnsure(); const r = { d: d.d === O.today(), next: d.t.concat(d.cr || []) }; T.S().daily = JSON.parse(keep); O.persist(); return r; });
    ok('"לא היום": the topic\'s missions come back in tomorrow\'s path', nd.d && nd.next.includes(ids.e), JSON.stringify(nd)); }
  // back to the regular plan
  { await syncB(); await B.locator('#sPar .bigbtn', { hasText: 'חזרה לתוכנית הרגילה' }).click(); await sleep(300); await pull(); const k = await kidPlan();
    ok('"חזרה לתוכנית הרגילה": the regular plan is back on his device', JSON.stringify(k) === JSON.stringify(['math', ids.r, ids.e, ids.c]), JSON.stringify(k)); }
  // he already knows: math level and an activity's level; no stars, no drop
  { await syncB(); const lv0 = await A.evaluate(() => { const lv = window.TAL.nextLevel(); return { id: lv.id, st: window.OREN.totalStars() }; });
    const row = B.locator('#sPar .pdplan').first(); await row.click(); await row.locator('button', { hasText: 'הוא כבר יודע' }).click(); await sleep(300); await pull();
    const r = await A.evaluate(id => { const O = window.OREN, lv = window.TAL.nextLevel(); return { next: lv && lv.id, stars: O.stars(id), total: O.totalStars(), known: O.known(id) }; }, lv0.id);
    ok('"הוא כבר יודע" on math: the picker moves to the next level, no stars given', r.next !== lv0.id && r.stars === 0 && r.total === lv0.st && r.known, JSON.stringify([lv0, r])); }
  { await syncB(); const l0 = await A.evaluate(id => ((window.OREN.save.lrn || {}).k || {})['a:' + id], ids.c); const lvA = l0 ? l0.l || 1 : 1;
    const row = B.locator('#sPar .pdplan', { hasText: await B.evaluate(id => window.TAL.stepName(id), ids.c) }); await row.click(); await row.locator('button', { hasText: 'הוא כבר יודע' }).click(); await sleep(300); await pull();
    const l1 = await A.evaluate(id => window.OREN.save.lrn.k['a:' + id].l, ids.c); ok('"הוא כבר יודע" on an activity: his level goes up by one (never down)', l1 === lvA + 1, lvA + ' -> ' + l1); }

  // ---------- skip now: waits for the answer in progress ----------
  await A.evaluate(id => { const d = window.TAL.S().daily; d.done[0] = 1; window.TAL_step(d.t.indexOf(id)); }, ids.r); await sleep(500);
  await A.evaluate(() => window.OREN.timeTick && window.OREN.timeTick());
  for (let k = 0; k < 30 && !(await B.evaluate(() => window.OREN.famPull().then(() => !!(window.OREN.save.now || {}).id))); k++) await sleep(250); await B.evaluate(() => window.TAL.parentPanel('day')); await sleep(200);
  const skipBtn = await B.locator('#sPar .pnow .pdskipnow').count(); ok('"דלג עכשיו" next to "משחק עכשיו" while he plays', skipBtn === 1, await B.evaluate(() => document.querySelector('#sPar .pnow').textContent));
  if (skipBtn) await B.locator('#sPar .pnow .pdskipnow').click(); else await B.evaluate(() => window.PDAY.send('now'));
  await sleep(1500);
  { const r = await A.evaluate(() => ({ pend: !!window.PDAY.pending(), cur: !!(window.DAYLOG.cur() && !window.DAYLOG.cur().end), bubble: !!document.querySelector('.pdskip') }));
    ok('skip now: taken by his device, but it waits for the answer in progress', r.pend && r.cur && !r.bubble, JSON.stringify(r)); }
  await A.evaluate(id => window.OREN.emit('tq', id, true), ids.r);
  ok('after his answer: the friend says "בּוֹא נַעֲבֹר לְמַשֶּׁהוּ אַחֵר!"', await until(A, () => /בּוֹא נַעֲבֹר לְמַשֶּׁהוּ אַחֵר/.test((document.querySelector('.pdskip') || {}).textContent || ''), null, 4000));
  ok('and the next planned mission opens', await until(A, ids => { const d = window.TAL.S().daily; const cu = window.DAYLOG.cur(); return !document.querySelector('.pdskip') && cu && !cu.end && cu.id === ids.e && d.done[d.t.indexOf(ids.r)] === 2; }, ids, 5000), await A.evaluate(() => JSON.stringify([window.TAL.S().daily, window.DAYLOG.cur()])));
  { const r = await A.evaluate(id => { const e = window.OREN.save.alog[window.OREN.today()].e.filter(x => x[1] === id).pop(); return { o: e && e[6], st: (window.TAL.S().tl[id] || {}).s | 0 }; }, ids.r);
    ok('a skip is never a failure and gives no stars ("p", not "q")', r.o === 'p' && r.st === 0, JSON.stringify(r)); }

  // ---------- offline: queued, applied on the next sync ----------
  await A.evaluate(() => { const c = window.DAYLOG.cur(); if (c && !c.end) window.DAYLOG.end('q'); window.OREN.showMap(); }); await sleep(300);
  await B.evaluate(() => window.OREN.famPull()); await B.evaluate(() => window.TAL.parentPanel('day')); await sleep(200);
  await A.route('**/api/save/**', r => r.abort());
  await B.locator('#sPar .pdplan .tdx').last().click(); await sleep(400);
  const last = await B.evaluate(() => { const c = window.PDAY.cmds(); return c[c.length - 1]; });
  await A.evaluate(() => window.OREN.famPull()); await sleep(300);
  ok('offline: his device has not taken it yet', !(await A.evaluate(i => !!(window.OREN.save.pcA || {})[i], last.i)));
  await A.unroute('**/api/save/**'); await pull();
  ok('back online: the queued skip is applied on the next sync', await A.evaluate(c => !!(window.OREN.save.pcA || {})[c.i] && !window.TAL.S().daily.t.filter((x, n) => !window.TAL.S().daily.done[n]).includes(c.a), last), JSON.stringify(last));
  // the parent's phone never applies commands itself
  ok('the parent\'s phone does not apply commands to its own copy', await B.evaluate(() => !Object.keys(window.OREN.save.pcA || {}).length || !localStorage.getItem('oren4-played')));
  // ---------- #429 learned today, #430 one question, #431 the week picture ----------
  const exp = await A.evaluate(ids => { const O = window.OREN, G = window.GOALS, DL = window.DAYLOG, T = window.TAL; const m = window.__m0 + 40;
    const lv = (O.ALLLV || []).find(l => l.w && G.T['w:' + l.w.id] && l.w.id === 'add') || (O.ALLLV || [])[0];
    const fin = ['lv:' + lv.id, ids.c, ids.e, 'eng-voc'];
    fin.forEach((id, k) => DL.add(O.today(), [m + k, id, 2, 3, 4, 0, 'c', { lg: G.plain(id) }]));
    const kd = k => { const x = new Date(); x.setDate(x.getDate() - k); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    T.S().time[kd(0)] = 1500; T.S().time[kd(1)] = 600; T.S().time[kd(3)] = 2400;
    O.persist(); O.famNow(); return { learned: G.learned(O.today()), all: Object.values(G.T).map(g => T.plainHe(g)), qs: [].concat(...Object.values(G.Q)) }; }, ids);
  await B.evaluate(() => window.TAL.parentPanel('day'));
  ok('#429 a finished mission: "מה למד היום" appears by itself', await until(B, () => document.querySelectorAll('#sPar .pdlearn li').length > 0, null, 8000));
  { const r = await B.evaluate(() => { const v = document.querySelector('#sPar .pday'); const l = v.querySelector('.pdlearn'); const secs = [...v.children];
      return { li: [...l.querySelectorAll('li')].map(x => x.textContent.trim()), title: l.querySelector('h3').textContent, at: secs.indexOf(l), did: secs.indexOf(v.querySelector('.dllog').closest('section')) }; });
    ok('#429 up to 3 lines, at the top of the day view (before what he did)', r.title === 'מה למד היום' && r.li.length === 3 && r.at >= 0 && r.at < r.did, JSON.stringify(r));
    ok('#429 the lines come from the goal table (the day\'s finished goals, in order)', JSON.stringify(r.li) === JSON.stringify(exp.learned.slice(0, 3)) && r.li.every(x => exp.all.includes(x)), JSON.stringify([r.li, exp.learned])); }
  { const r = await B.evaluate(() => { const v = document.querySelector('#sPar .pday'); const q = v.querySelectorAll('.pdask'); const secs = [...v.children];
      return { n: q.length, t: q[0] && q[0].textContent, last: !!q[0] && secs.indexOf(q[0]) === secs.length - 1 }; });
    const q = (r.t || '').replace(/^.*?:\s*/, '');
    ok('#430 one question at the end of the day, from the fixed list', r.n === 1 && r.last && /^תשאל אותו:/.test(r.t) && exp.qs.includes(q), JSON.stringify(r));
    const same = await B.evaluate(() => { window.PDAY.refresh(); return document.querySelector('#sPar .pdask').textContent; });
    ok('#430 the same question all day (one per day)', same === r.t, same); }
  { const r = await A.evaluate(() => { const G = window.GOALS, O = window.OREN, all = [].concat(...Object.values(G.Q)); const out = new Set();
      for (let k = 0; k < 20; k++) { const d = '2026-01-' + String(k + 1).padStart(2, '0'); const x = G.askOf(d, [['lv:' + ((O.ALLLV || [])[0] || {}).id, 'c'], ['read-first', 'c']]); if (x) out.add(x); }
      return { tied: [...out].every(q => G.Q.math.includes(q) || G.Q.readg.includes(q)), many: out.size > 1, none: G.askOf('2026-01-01', []) === '' && G.askOf('2026-01-01', [['read-first', 'q']]) === '', inList: [...out].every(q => all.includes(q)) }; });
    ok('#430 the question is tied to what he finished (its topic), changes by day, none when nothing finished', r.tied && r.many && r.none && r.inList, JSON.stringify(r)); }
  { const r = await B.evaluate(() => { const w = document.querySelector('#sPar .pdweek'); if (!w) return null; const bars = [...w.querySelectorAll('.pdwk i')].map(x => parseFloat(x.style.height) || 0);
      const nums = (w.textContent.match(/\d+/g) || []); return { bars, sh: [...w.querySelectorAll('.pdsh')].map(x => x.textContent), nums, barTxt: [...w.querySelectorAll('.pdwk')].map(x => x.textContent).join('') }; });
    ok('#431 week picture: 7 bars of minutes (today on the right, the biggest day full height)', r && r.bars.length === 7 && r.bars[3] === 100 && r.bars[6] > r.bars[5] && r.bars[5] > 0 && r.bars[4] === 0, JSON.stringify(r));
    ok('#431 under them 3 topic shares (math, reading, English) and no other numbers', r && r.sh.length === 3 && /חשבון/.test(r.sh[0]) && /קריאה/.test(r.sh[1]) && /אנגלית/.test(r.sh[2]) && r.nums.length === 3 && !/\d/.test(r.barTxt), JSON.stringify(r)); }
  { const w = await A.evaluate(() => window.PDAY.week(window.OREN.today()));
    ok('#431 shares come from the day log (math 1, reading 1 of the 3 topics, English 1)', w && w.sh.math > 0 && w.sh.readg > 0 && w.sh.eng > 0 && Math.round(w.sh.math + w.sh.readg + w.sh.eng) === 100, JSON.stringify(w)); }
  if (process.env.SHOTS) { fs.mkdirSync(L.SHOTDIR, { recursive: true }); await B.screenshot({ path: path.join(L.SHOTDIR, 'pday-learn-phone.png'), fullPage: true });
    await B.evaluate(() => document.querySelector('#sPar .pdweek').scrollIntoView()); await sleep(200); await B.screenshot({ path: path.join(L.SHOTDIR, 'pday-week-phone.png') });
    await A.evaluate(() => window.TAL.parentPanel('day')); await sleep(300); await A.screenshot({ path: path.join(L.SHOTDIR, 'pday-learn-desktop.png'), fullPage: true });
    await A.evaluate(() => document.querySelector('#sPar .pdweek').scrollIntoView()); await sleep(200); await A.screenshot({ path: path.join(L.SHOTDIR, 'pday-week-desktop.png') }); }
  await playingNoRows(b, errs);
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); srv.close(); L.finish('pday', res);
})().catch(e => { console.error(e); srv.close(); L.finish('pday', res.concat(['FAIL crashed: ' + e.message])); });
