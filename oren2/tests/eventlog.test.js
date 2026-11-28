// #348 game event log: track(kind,data) on the device -> batches to /api/log (one D1 row per batch) -> /api/log/summary.
// Part 1: the worker bundle with an in-memory SQLite standing in for D1 (batching, validation, summary, prune, write budget).
// Part 2: the real page served by that worker in a browser: play two questions, then the summary shows them; buffer cap, session cap, no retry loop.
const L = require('./lib');
const path = require('path'), http = require('http');
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
// a tiny D1: prepare(sql).bind(...).run/all/first + exec, every statement logged (to count writes)
function fakeD1() {
  const db = new DatabaseSync(':memory:'), log = [];
  const st = sql => { let a = []; return { bind(...x) { a = x; return this; },
    async run() { log.push(sql); const r = db.prepare(sql).run(...a); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
    async all() { log.push(sql); return { results: db.prepare(sql).all(...a) }; },
    async first() { log.push(sql); return db.prepare(sql).get(...a) || null; } }; };
  return { db, log, prepare: st, exec: async sql => { db.exec(sql); } };
}
(async () => {
  const m = await import(require('url').pathToFileURL(path.join(L.ROOT, 'cf', 'dist', '_worker.js')).href);
  const kv = new Map(); const KV = { get: async k => kv.get(k) || null, put: async (k, v) => { kv.set(k, v); }, delete: async k => { kv.delete(k); }, list: async o => ({ keys: [...kv.keys()].filter(k => k.startsWith(o.prefix)).map(name => ({ name })) }) };
  const D1 = fakeD1(); const env = { DIAG_KEY: 'sekret', LOG_READ_KEY: 'rd-key-675', SAVES: KV, DB: D1 };
  const f = (u, o, e = env) => m.default.fetch(new Request('https://oren.test' + u, o), e);
  const fam = 'a0'.repeat(16), H = { headers: { 'x-admin-key': 'sekret' } };
  const post = (b, e) => f('/api/log', { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b) }, e);
  const rows = () => D1.db.prepare('SELECT * FROM evlog').all();
  const t0 = Date.now();
  // ---------- part 1: server ----------
  { const ev = [{ i: 1, t: t0, k: 'ss', dev: 'desktop' }, { i: 2, t: t0 + 1000, k: 'mis', m: 'add-0' }, { i: 3, t: t0 + 2000, k: 'q', m: 'add-0', q: 'x1' },
      { i: 4, t: t0 + 5000, k: 'ans', m: 'add-0', q: 'x1', ok: 1, ms: 3000 }, { i: 5, t: t0 + 6000, k: 'q', m: 'add-0', q: 'x2' },
      { i: 6, t: t0 + 9000, k: 'ans', m: 'add-0', q: 'x2', ok: 0, ms: 3000 }, { i: 7, t: t0 + 10000, k: 'help', h: 'tip' },
      { i: 8, t: t0 + 11000, k: 'pop', p: 'tb' }, { i: 9, t: t0 + 12000, k: 'voice', src: 'google' }, { i: 10, t: t0 + 13000, k: 'voice', src: 'browser', why: 'timeout' },
      { i: 11, t: t0 + 14000, k: 'err', msg: 'boom', s: 'sPlay', nest: { a: 1 }, long: 'z'.repeat(500) }, { i: 12, t: t0 + 15000, k: 'tap', s: 'sPlay', tg: '#btnBack' }];
    const w0 = D1.log.length;
    const r = await post({ fam, sid: 'abcd1234', tz: -120, ev }); const j = await r.json();
    ok('log: a batch is stored', r.status === 200 && j.ok && j.n === ev.length, JSON.stringify(j));
    const R = rows(); ok('log: one D1 row per batch (one write)', R.length === 1 && R[0].n === ev.length && D1.log.slice(w0).filter(s => /^\s*(INSERT|UPDATE|REPLACE)/i.test(s)).length === 1, String(R.length));
    ok('log: only a short hash of the family id is kept', R[0].fam.length === 6 && !JSON.stringify(R).includes(fam));
    const st = JSON.parse(R[0].ev); ok('log: nested objects dropped, long strings cut', st[10].nest === undefined && st[10].long.length <= 160 && st[10].msg === 'boom', JSON.stringify(st[10]).slice(0, 120));
    const w1 = D1.log.length; await post({ fam, sid: 'abcd1234', tz: -120, ev: [{ i: 13, t: t0 + 16000, k: 'tap', s: 'sPlay', tg: '.key' }] });
    ok('log: a second batch is one more INSERT and no extra prune write', D1.log.slice(w1).filter(s => /^\s*(INSERT|DELETE|UPDATE)/i.test(s)).length === 1, JSON.stringify(D1.log.slice(w1)));
    ok('log: bad family id / bad body / empty / too many events rejected', (await post({ fam: 'x', sid: 'abcd1234', ev })).status === 400 && (await post('x')).status === 400
      && (await post({ fam, sid: 'abcd1234', ev: [] })).status === 400 && (await post({ fam, sid: 'abcd1234', ev: Array(401).fill({ k: 'tap', t: t0 }) })).status === 400 && (await post({ fam, sid: '!', ev })).status === 400);
    ok('log: oversized batch rejected (413)', (await post({ fam, sid: 'abcd1234', ev: [{ k: 'tap', t: t0, x: 'a'.repeat(70000) }] })).status === 413);
    ok('log: GET on /api/log is 405 (with a key; 401 without)', (await f('/api/log', H)).status === 405 && (await f('/api/log')).status === 401);
    const nk = new Map(); const noDb = await post({ fam, sid: 'abcd1234', ev }, { SAVES: { ...KV, put: async (k, v) => nk.set(k, v) } });
    ok('log: no D1 = 503 and nothing written to KV (1k writes a day)', noDb.status === 503 && nk.size === 0);
    // #675 every GET under /api/log needs the parent key (DIAG_KEY) or the separate read token (LOG_READ_KEY): no key = 401, no data
    { const RK = { headers: { 'x-admin-key': 'rd-key-675' } }, BAD = { headers: { 'x-admin-key': 'nope' } };
      for (const pth of ['/api/log/summary?days=7', '/api/log/raw', '/api/log/review', '/api/log/digest', '/api/log/nosuch', '/api/log']) {
        const a = await f(pth), at = await a.text(), b = await f(pth, BAD), c = await f(pth, H), d = await f(pth, RK);
        ok('#675 ' + pth + ': no key = 401 with no data', a.status === 401 && at.length < 40 && !/days|ev|sid|tap/.test(at), a.status + ' ' + at.slice(0, 80));
        ok('#675 ' + pth + ': wrong key = 401, the parent key and the read token both open it', b.status === 401 && c.status !== 401 && d.status !== 401, [b.status, c.status, d.status].join(' ')); }
      ok('#675 summary: the read token gives the same summary as the parent key', JSON.stringify(await (await f('/api/log/summary?days=7', RK)).json()) === JSON.stringify(await (await f('/api/log/summary?days=7', H)).json()));
      ok('#675 no secrets set = every read refused (an empty key never matches)', (await f('/api/log/summary', { headers: { 'x-admin-key': '' } }, { ...env, DIAG_KEY: undefined, LOG_READ_KEY: undefined })).status === 401
        && (await f('/api/log/summary', RK, { ...env, LOG_READ_KEY: '' })).status === 401); }
    // #715 the read token is read-only: summary 200, but a write or delete with it is refused and stores nothing
    { const RK = { headers: { 'x-admin-key': 'rd-key-675' } }, n0 = rows().length;
      ok('#715 LOG_READ_KEY reads /api/log/summary (200)', (await f('/api/log/summary?days=7', RK)).status === 200);
      const bad = []; for (const mt of ['DELETE', 'PUT', 'PATCH']) for (const pth of ['/api/log', '/api/log/summary', '/api/log/raw']) { const r = await f(pth, { method: mt, headers: { 'x-admin-key': 'rd-key-675' } }); if (r.status < 400) bad.push(mt + ' ' + pth + ' ' + r.status); }
      ok('#715 LOG_READ_KEY is refused on any write (DELETE/PUT/PATCH on every log path fail, nothing stored or removed)', !bad.length && rows().length === n0, bad.join(', ') + ' ' + rows().length + '/' + n0); }
    const s = await (await f('/api/log/summary?days=7', H)).json(); const d = s.days && s.days[0];
    ok('summary: one day with sessions, events and play minutes', s.days.length === 1 && d.sessions === 1 && d.events === 13 && d.min > 0.2 && d.min < 0.4, JSON.stringify(d));
    ok('summary: right/wrong per mission, questions and answer time', d.missions['add-0'] && d.missions['add-0'].open === 1 && d.missions['add-0'].q === 2 && d.missions['add-0'].right === 1 && d.missions['add-0'].wrong === 1 && d.missions['add-0'].ms === 3000 && d.right === 1 && d.wrong === 1, JSON.stringify(d.missions));
    ok('summary: help, popups, errors, taps, voice Google/browser share', d.help.tip === 1 && d.popups.tb === 1 && d.errors === 1 && d.taps === 2 && d.voice.google === 1 && d.voice.browser === 1 && d.voice.share === 0.5, JSON.stringify(d));
    ok('summary: no raw events without the admin key', s.raw === undefined && (await f('/api/log/summary?raw=50')).status === 401);
    const sr = await (await f('/api/log/summary?days=7&raw=5', H)).json();
    ok('summary: raw recent events (newest first) with the admin key', Array.isArray(sr.raw) && sr.raw.length === 5 && sr.raw[0].k === 'tap' && sr.raw[0].i === 13 && sr.raw[0].sid === 'abcd1234', JSON.stringify(sr.raw && sr.raw[0]));
    D1.db.prepare('INSERT INTO evlog(fam,sid,at,tz,n,ev) VALUES(?,?,?,?,?,?)').run('old', 'old00000', t0 - 31 * 864e5, 0, 1, JSON.stringify([{ k: 'tap', t: t0 - 31 * 864e5 }]));
    D1.db.prepare('INSERT INTO evlog(fam,sid,at,tz,n,ev) VALUES(?,?,?,?,?,?)').run('mid', 'mid00000', t0 - 20 * 864e5, 0, 1, JSON.stringify([{ k: 'tap', t: t0 - 20 * 864e5 }]));
    D1.db.prepare('INSERT INTO evlog(fam,sid,at,tz,n,ev) VALUES(?,?,?,?,?,?)').run('yr', 'yr000000', t0 - 366 * 864e5, 0, 1, JSON.stringify([{ k: 'tap', t: t0 - 366 * 864e5 }]));
    D1.db.prepare('INSERT INTO evlog(fam,sid,at,tz,n,ev) VALUES(?,?,?,?,?,?)').run('half', 'half0000', t0 - 200 * 864e5, 0, 1, JSON.stringify([{ k: 'tap', t: t0 - 200 * 864e5 }]));
    const s30 = await (await f('/api/log/summary?days=30', H)).json();
    ok('#641 prune: raw events older than 365 days are deleted, newer ones (20, 31, 200 days) kept', !rows().some(x => x.fam === 'yr') && ['old', 'mid', 'half'].every(k => rows().some(x => x.fam === k)) && s30.days.length === 2, JSON.stringify(rows().map(x => x.fam)));
    D1.db.exec('DELETE FROM evlog'); }
  // #641 raw read with paging and filters: /api/log/raw?from&to&sid&k&n&after|before (admin key only)
  { const day = t0 - 5 * 864e5; const E = (i, k, sid) => ({ i, t: day + i * 1000, k, ...(sid ? { osid: sid } : {}) });
    D1.db.prepare('INSERT INTO evlog(fam,sid,at,tz,n,ev) VALUES(?,?,?,?,?,?)').run('f', 'sessa000', day + 4000, 0, 3, JSON.stringify([E(1, 'ss'), E(2, 'tap'), E(3, 'mis')]));
    D1.db.prepare('INSERT INTO evlog(fam,sid,at,tz,n,ev) VALUES(?,?,?,?,?,?)').run('f', 'sessb000', day + 7000, 0, 3, JSON.stringify([E(4, 'ss'), E(5, 'tap'), E(6, 'tap')]));
    D1.db.prepare('INSERT INTO evlog(fam,sid,at,tz,n,ev) VALUES(?,?,?,?,?,?)').run('f', 'sessc000', day + 9e7, 0, 1, JSON.stringify([E(90000, 'tap')]));   // the next day: outside `to`
    const raw = async (q, h = H) => { const r = await f('/api/log/raw?' + q, h); return r.status === 200 ? r.json() : { status: r.status }; };
    const Q = 'from=' + day + '&to=' + (day + 864e5);
    ok('#641 raw: no admin key = 401', (await raw(Q, {})).status === 401);
    const p1 = await raw(Q + '&n=3'), p2 = await raw(Q + '&n=3&after=' + encodeURIComponent(p1.next || ''));
    const all = (p1.ev || []).concat(p2.ev || []).map(e => e.i);
    ok('#641 raw paging: two pages of 3 events give 6 in order, no gaps or repeats', p1.ev.length === 3 && p2.ev.length === 3 && JSON.stringify(all) === '[1,2,3,4,5,6]' && !!p1.next && !p2.next, JSON.stringify({ p1, p2 }));
    ok('#641 raw: every event carries its session id', p1.ev[0].sid === 'sessa000' && p2.ev[0].sid === 'sessb000', JSON.stringify(p2.ev[0]));
    const one = await raw(Q + '&n=5000');
    ok('#641 raw: one page of up to 5000, only events inside from..to', one.ev.length === 6 && !one.next, JSON.stringify(one.ev.map(e => e.i)));
    ok('#641 raw filters: sid and kind', (await raw(Q + '&sid=sessb000')).ev.map(e => e.i).join() === '4,5,6' && (await raw(Q + '&k=ss')).ev.map(e => e.i).join() === '1,4', '');
    const n1 = await raw('n=2'), n2 = await raw('n=2&before=' + encodeURIComponent(n1.next || ''));
    ok('#641 raw without from: newest first, before= gives the older page', n1.ev.map(e => e.i).join() === '90000,6' && n2.ev.map(e => e.i).join() === '5,4', JSON.stringify({ n1, n2 }));
    D1.db.exec('DELETE FROM evlog'); }
  // #612: a save failure on Oren's device (sync, kid 1) comes back with the save (x-sync-fail), so the parent's panel can say "no update since"
  { await f('/api/save/' + fam, { method: 'PUT', body: JSON.stringify({ v: 4, upT: t0 }) });
    const h0 = (await f('/api/save/' + fam)).headers.get('x-sync-fail');
    await post({ fam, sid: 'par00001', tz: -120, ev: [{ i: 1, t: t0 + 50000, k: 'sync', why: 'net', n: 0, kid: 0 }] });
    const h1 = (await f('/api/save/' + fam)).headers.get('x-sync-fail');
    const w = D1.log.length; await post({ fam, sid: 'kid00001', tz: -120, ev: [{ i: 1, t: t0 + 60000, k: 'sync', why: 'net', n: 0, kid: 1 }, { i: 2, t: t0 + 61000, k: 'tap' }] });
    const writes = D1.log.slice(w).filter(s => /^\s*(INSERT|UPDATE)/i.test(s)).length;
    const r2 = await f('/api/save/' + fam); const h2 = r2.headers.get('x-sync-fail');
    await post({ fam, sid: 'kid00001', tz: -120, ev: [{ i: 3, t: t0 + 30000, k: 'sync', why: 'net', n: 1, kid: 1 }] });
    const h3 = (await f('/api/save/' + fam)).headers.get('x-sync-fail');
    ok('#612 save failure: none -> no header; the parent phone\'s own failure is not counted', h0 === null && h1 === null, String([h0, h1]));
    ok('#612 save failure on Oren\'s device: GET /api/save has x-sync-fail = its time (one extra write), the save itself unchanged', h2 === String(t0 + 60000) && writes === 2 && (await r2.json()).upT === t0, String([h2, writes]));
    ok('#612 an older failure arriving later does not move it back', h3 === String(t0 + 60000), String(h3));
    D1.db.exec('DELETE FROM evlog'); }
  // ---------- part 2: the real page through the worker ----------
  let FAIL = false, posts = 0;
  const srv = http.createServer(async (q, r) => { let b = []; q.on('data', c => b.push(c)); q.on('end', async () => {
    if (q.url === '/api/log' && q.method === 'POST') { posts++; if (FAIL) { r.writeHead(503); return r.end('{}'); } }
    const body = b.length ? Buffer.concat(b) : undefined;
    const x = await m.default.fetch(new Request('http://localhost' + q.url, { method: q.method, headers: q.headers, body: q.method === 'GET' || q.method === 'HEAD' ? undefined : body }), env);
    const hd = {}; x.headers.forEach((v, k) => { hd[k] = v; }); r.writeHead(x.status, hd); r.end(Buffer.from(await x.arrayBuffer())); }); }).listen(0);
  const BASE = 'http://localhost:' + srv.address().port;
  const summary = async (raw) => (await fetch(BASE + '/api/log/summary?days=1' + (raw ? '&raw=' + raw : ''), H)).json();
  const b = await chromium.launch();
  const ctx = await b.newContext(L.VIEWPORT); await ctx.addInitScript(() => { window.__fast = true; window.__famGap = 0; window.TAL_noHome = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/'); await p.waitForFunction(() => window.OREN && window.OREN.family, null, { timeout: 20000 }); await L.noCoach(p);
  await p.evaluate(() => { const O = window.__oren4; O.save.story.intro = 1; O.playLevel(O.ALLLV[0]); }); await sleep(400);
  const q0 = await p.evaluate(() => { const P = window.__oren4.play; return { k: P.qs[P.i].k, ans: P.qs[P.i].ans, ch: P.choice ? P.choice.ans : null, n: P.choice ? P.choice.opts.length : 0, m: P.lv.u.id }; });
  // answer with real taps: the pad keys (or the choice button)
  const tapAnswer = async (v) => { const c = await p.evaluate(() => { const P = window.__oren4.play; return P.choice ? P.choice.ans : null; });
    if (c != null) { await p.locator('#qa .chs button, #qa .bubs button').nth(v === 'wrong' ? (c + 1) % 2 : c).click(); return; }
    const a = await p.evaluate(() => { const P = window.__oren4.play; return P.qs[P.i].ans; });
    for (const d of String(v === 'wrong' ? a + 1 : a)) await p.locator(`#pad .key[data-k="${d}"]`).click();
    await p.locator('#pad .key.go').click(); };
  await tapAnswer('right'); await sleep(1200);
  await tapAnswer('wrong'); await sleep(900); await tapAnswer('right'); await sleep(600);
  await p.evaluate(() => dispatchEvent(new Event('pagehide'))); await sleep(800);
  const s = await summary(); const d = (s.days || [])[0] || {}; const mm = (d.missions || {})[q0.m] || {};
  ok('play two questions, then the summary shows them', mm.q >= 2 && mm.right === 2 && mm.wrong === 1 && mm.open >= 1 && d.right === 2 && d.wrong === 1, JSON.stringify({ m: q0.m, mm, k: q0.k }));
  const raw = (await summary(400)).raw || [];
  const K = k => raw.filter(e => e.k === k);
  { const ss = K('ss')[0] || {};
    ok('session start: device, host, version, viewport, browser, language, network', ss.dev === 'desktop' && !!ss.os && ss.sid.length === 10 && ss.host === 'localhost' && ss.ver > 0 && ss.vw === 1366 && /Chrom/.test(ss.br) && !!ss.lang && 'net' in ss, JSON.stringify(ss));
    ok('#641 session start is the first event of the session and has the screen size', raw[raw.length - 1] && raw[raw.length - 1].k === 'ss' && ss.scw > 0 && ss.sch > 0, JSON.stringify(ss)); }
  { const ms = K('mis')[0] || {};
    ok('#641 mission start says why it was picked (the tap and screen that opened it, or auto)', ms.auto === 1 || (!!ms.tg && !!ms.via), JSON.stringify(ms)); }
  ok('session end on page hide', K('se').length === 1 && K('se')[0].dur >= 0);
  ok('screen changes with time spent', K('scr').some(e => e.s === 'sPlay') && K('scr').every(e => typeof e.ms === 'number'), JSON.stringify(K('scr').slice(0, 3)));
  ok('answers carry the time to answer and the question id', K('ans').length === 3 && K('ans').every(e => e.ms >= 0 && e.q && e.m === q0.m), JSON.stringify(K('ans')));
  ok('every tap: screen + target id, no text', K('tap').length >= 3 && K('tap').every(e => e.s && e.tg && Object.keys(e).every(k => ['i', 't', 'k', 's', 'tg', 'm', 'x', 'sid'].includes(k))), JSON.stringify(K('tap').slice(0, 2)));
  ok('performance: page load time', K('perf').length === 1 && K('perf')[0].load > 0, JSON.stringify(K('perf')));
  ok('no personal data or kid text: no Hebrew in any event', !/[א-ת]/.test(JSON.stringify(raw)));
  // errors, console errors/warnings and rejections carry a small state snapshot
  await p.evaluate(() => { setTimeout(() => { throw new Error('boom348'); }, 0); console.error('cerr348'); console.warn('cwarn348'); Promise.reject(new Error('rej348')); }); await sleep(300);
  await p.evaluate(() => window.OREN.evFlush('hide')); await sleep(600);
  { const r2 = (await summary(100)).raw || []; const e = r2.find(x => x.k === 'err' && /boom348/.test(x.msg)) || {};
    ok('JS error logged with a state snapshot (screen, mission, question, level, stars)', e.s === 'sPlay' && e.m === q0.m && !!e.q && !!e.lv && 'st' in e, JSON.stringify(e));
    ok('unhandled rejection, console error and warning logged', r2.some(x => x.k === 'err' && /rej348/.test(x.msg) && x.rej === 1) && r2.some(x => x.k === 'cerr' && /cerr348/.test(x.msg) && x.s) && r2.some(x => x.k === 'cwarn' && /cwarn348/.test(x.msg)), JSON.stringify(r2.filter(x => /err|warn/.test(x.k)))); }
  // batching: at most one send per ~60 s besides page hide
  { await p.evaluate(() => { window.__logGap = 60000; window.OREN.evFlush('hide'); }); await sleep(300); const n0 = posts;
    await p.evaluate(() => { for (let k = 0; k < 3; k++) { window.OREN.track('tap', { s: 'x', tg: '#a' }); window.OREN.persist(); window.OREN.evFlush('tick'); } }); await sleep(500);
    ok('batching: saves and ticks within a minute make no extra send', posts === n0, String(posts - n0)); }
  // offline: capped buffer, oldest dropped, no retry loop
  { FAIL = true; await p.evaluate(() => { window.__logGap = 0; for (let k = 0; k < 700; k++) window.OREN.track('tap', { s: 'x', tg: '#b' + k }); window.OREN.evFlush('tick'); }); await sleep(600);
    const n0 = posts; await sleep(1500);
    const st = await p.evaluate(() => window.OREN.evlog());
    ok('offline: the buffer is capped (oldest dropped) and kept on the device', st.buf === 600 && st.last === '#b699' && st.first !== '#b0' && st.kept === 600, JSON.stringify(st));
    ok('offline: no retry loop (no new sends while nothing happens)', posts === n0, String(posts - n0));
    FAIL = false; await p.evaluate(() => window.OREN.evFlush('tick')); await sleep(600);
    ok('back online: the next send carries the kept events', (await p.evaluate(() => window.OREN.evlog().buf)) <= 400, JSON.stringify(await p.evaluate(() => window.OREN.evlog()))); }
  // session cap
  { const st = await p.evaluate(() => { for (let k = 0; k < 2500; k++) window.OREN.track('tap', { s: 'x', tg: '#c' }); return window.OREN.evlog(); });
    ok('session cap: at most 2000 events per session, the rest counted as dropped', st.n === 2000 && st.drop > 0, JSON.stringify(st)); }
  // parent play (sandbox) is not logged
  { const st = await p.evaluate(() => { const O = window.OREN; const n = O.evlog().drop; O.parentPlay(true); O.track('tap', { s: 'x', tg: '#d' }); const r = O.evlog().drop === n + 0; O.parentPlay(false); return r; });
    ok('parent sandbox is not logged', st); }
  ok('no page errors except the test ones', errs.every(e => /boom348|rej348/.test(e)), errs.join('; '));
  await b.close(); srv.close();
  L.finish('eventlog', res);
})().catch(e => { console.error(e); process.exit(1); });
