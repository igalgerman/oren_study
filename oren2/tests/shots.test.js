// #462 session screenshots + session review page + weekly 'where Oren got stuck' digest (on the #348 event log).
// Part 1: the worker with an in-memory SQLite as D1: shots ride in the batch row (one write), caps (30/session, 100/day, oldest
//         dropped, 14 days), key protection (401), the digest with fixture events.
// Part 2: the real page through that worker: the six moments, the privacy rule, busy/offline/cap skips, then play 3 questions with
//         2 wrong in a row and the review page shows the timeline with those screenshots (desktop + phone).
const L = require('./lib');
const path = require('path'), http = require('http'), fs = require('fs');
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
function fakeD1() {
  const db = new DatabaseSync(':memory:'), log = [];
  const st = sql => { let a = []; return { bind(...x) { a = x; return this; },
    async run() { log.push(sql); const r = db.prepare(sql).run(...a); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
    async all() { log.push(sql); return { results: db.prepare(sql).all(...a) }; },
    async first() { log.push(sql); return db.prepare(sql).get(...a) || null; } }; };
  return { db, log, prepare: st, exec: async sql => { db.exec(sql); } };
}
const WR = /^\s*(INSERT|UPDATE|DELETE|REPLACE)/i;
const JPG = 'data:image/jpeg;base64,' + Buffer.alloc(900, 7).toString('base64');
(async () => {
  const m = await import(require('url').pathToFileURL(path.join(L.ROOT, 'cf', 'dist', '_worker.js')).href);
  const kv = new Map(); const KV = { get: async k => kv.get(k) || null, put: async (k, v) => { kv.set(k, v); }, delete: async k => { kv.delete(k); }, list: async o => ({ keys: [...kv.keys()].filter(k => k.startsWith(o.prefix)).map(name => ({ name })) }) };
  const D1 = fakeD1(); const env = { DIAG_KEY: 'sekret', SAVES: KV, DB: D1 };
  const f = (u, o) => m.default.fetch(new Request('https://oren.test' + u, o), env);
  const fam = 'b1'.repeat(16), H = { headers: { 'x-admin-key': 'sekret' } };
  const post = b => f('/api/log', { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b) });
  const rows = () => D1.db.prepare('SELECT * FROM evlog').all();
  const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
  // ---------- part 1: server ----------
  { // old #348 table without the screenshot columns: the worker adds them
    D1.db.exec('CREATE TABLE evlog(id INTEGER PRIMARY KEY AUTOINCREMENT, fam TEXT, sid TEXT, at INTEGER, tz INTEGER, n INTEGER, ev TEXT)');
    const ev = [{ i: 1, t: now, k: 'mis', m: 'add-0', s: 'sPlay' }, { i: 2, t: now + 1000, k: 'ans', ok: 0, m: 'add-0', s: 'sPlay' }, { i: 3, t: now + 2000, k: 'ans', ok: 0, m: 'add-0', s: 'sPlay' }];
    const w0 = D1.log.length;
    const r = await post({ fam, sid: 'ses00001', tz: 0, ev, sh: [{ i: 1, d: JPG }, { i: 3, d: JPG }, { i: 4, d: 'data:image/png;base64,AAAA' }, { i: 0, d: JPG }, { i: 2, d: 'data:image/jpeg;base64,' + 'A'.repeat(61000) }] });
    const j = await r.json(); const R = rows();
    ok('batch with screenshots: stored in the same row, bad ones dropped (png, too big, no event id)', r.status === 200 && j.sh === 2 && R.length === 1 && R[0].ns === 2 && R[0].si === '1,3' && JSON.parse(R[0].sh).every(s => s.d === JPG), JSON.stringify(j));
    ok('write budget: a batch with screenshots is still ONE write', D1.log.slice(w0).filter(s => WR.test(s) && !/^\s*DELETE FROM evlog WHERE at</.test(s) && !/UPDATE evlog SET sh=NULL/.test(s)).length === 1, JSON.stringify(D1.log.slice(w0).filter(s => WR.test(s))));
    const w1 = D1.log.length; await post({ fam, sid: 'ses00001', tz: 0, ev: [{ i: 5, t: now + 3000, k: 'help', h: 'tip' }], sh: [{ i: 5, d: JPG }] });
    ok('write budget: the next batch within the hour = exactly one INSERT', D1.log.slice(w1).filter(s => WR.test(s)).length === 1, JSON.stringify(D1.log.slice(w1).filter(s => WR.test(s))));
    ok('a too big body is refused (413)', (await post('{"x":"' + 'a'.repeat(600001) + '"}')).status === 413);
    // key protection
    ok('review page: no key = 401, wrong key = 401', (await f('/api/log/review?day=' + day)).status === 401 && (await f('/api/log/review?key=nope&day=' + day)).status === 401);
    const rk = await f('/api/log/review?key=sekret&day=' + day); const ck = rk.headers.get('set-cookie') || '';
    ok('review page: the key opens it and sets an owner cookie', rk.status === 200 && /^dk=sekret;/.test(ck) && /HttpOnly/.test(ck), ck);
    ok('review page: the cookie or the x-admin-key header also open it', (await f('/api/log/review?day=' + day, { headers: { cookie: 'a=1; dk=sekret' } })).status === 200 && (await f('/api/log/review?day=' + day, H)).status === 200);
    ok('digest: no key = 401', (await f('/api/log/digest')).status === 401 && (await f('/api/log/digest', { headers: { cookie: 'dk=bad' } })).status === 401);
    const html = await rk.text();
    ok('review page: the session with a one-line summary (minutes, missions, errors) and its screenshots', /id="sses00001"/.test(html) && /1 missions/.test(html) && /0 errors/.test(html) && (html.match(/<img /g) || []).length === 3 && /id="sses00001-3"[^>]*>.*?wrong.*?<img/.test(html), html.slice(0, 300));
    ok('review page: no screenshots from other days, no sessions on an empty day', !/<section/.test(await (await f('/api/log/review?day=2001-01-01', H)).text()));
    D1.db.exec('DELETE FROM evlog'); }
  { // caps: 35 shots in one session -> the newest 30; 5 sessions x 30 in a day -> the newest 100; older than 14 days -> gone
    const ins = (sid, at, ids) => D1.db.prepare('INSERT INTO evlog(fam,sid,at,tz,n,ev,sh,si,ns) VALUES(?,?,?,?,?,?,?,?,?)').run('x', sid, at, 0, ids.length,
      JSON.stringify(ids.map(i => ({ i, t: at + i, k: 'ans', ok: 0, s: 'sPlay', m: 'm-' + sid }))), JSON.stringify(ids.map(i => ({ i, d: JPG }))), ids.join(','), ids.length);
    const t0 = Date.parse(day + 'T00:00:00Z') + 60000;
    for (let b = 0; b < 5; b++) ins('capses01', t0 + b * 1000, [1, 2, 3, 4, 5, 6, 7].map(k => b * 7 + k));
    let h = await (await f('/api/log/review?day=' + day, H)).text();
    const imgs = (s, sid) => (s.split('id="s' + sid + '"')[1] || '').split('<section')[0].match(/<img /g) || [];
    const hasImg = (s, sid, i) => /<img /.test(((s.split('id="s' + sid + '-' + i + '"')[1]) || '').split('</li>')[0]);
    ok('cap: at most 30 screenshots per session, the oldest dropped', imgs(h, 'capses01').length === 30 && [1, 2, 3, 4, 5].every(i => !hasImg(h, 'capses01', i)) && [6, 20, 35].every(i => hasImg(h, 'capses01', i)), String(imgs(h, 'capses01').length));
    for (let s = 2; s <= 4; s++) for (let b = 0; b < 3; b++) ins('capses0' + s, t0 + s * 100000 + b * 1000, Array.from({ length: 10 }, (_, k) => b * 10 + k + 1));
    h = await (await f('/api/log/review?day=' + day, H)).text();
    const all = (h.match(/<img /g) || []).length;
    ok('cap: at most 100 screenshots per day, the oldest dropped (the first session loses its shots first)', all === 100 && imgs(h, 'capses04').length === 30 && imgs(h, 'capses01').length === 10, all + ' ' + imgs(h, 'capses01').length);
    ins('oldses01', now - 15 * 864e5, [1, 2]); ins('oldses02', now - 13 * 864e5, [1]);
    const w0 = D1.log.length;
    await f('/api/log/summary?days=1', H); // a summary read runs the prune
    const R = rows(); const byS = s => R.filter(r => r.sid === s);
    ok('prune: screenshots older than 14 days deleted, newer kept', byS('oldses01')[0].sh === null && byS('oldses01')[0].ns === 0 && byS('oldses02')[0].ns === 1);
    ok('prune: rows whose shots are all over the caps are cleared', byS('capses01').filter(r => r.ns > 0).length === 2 && byS('capses04').every(r => r.ns === 10), JSON.stringify(byS('capses01').map(r => r.ns)));
    ok('prune: one UPDATE for all of it', D1.log.slice(w0).filter(s => /^UPDATE/.test(s)).length === 1, JSON.stringify(D1.log.slice(w0).filter(s => WR.test(s))));
    D1.db.exec('DELETE FROM evlog'); }
  { // digest with fixture events: 7 places, the top 5 by wrong + 2 x silence + 3 x error, each with one screenshot link
    const t = now - 2 * 864e5; let i = 0; const ev = [], sh = [];
    const add = (m, k, extra = {}) => { i++; ev.push(Object.assign({ i, t: t + i * 1000, k, m, s: 'sTal' }, extra)); return i; };
    const P = { 'p-a': [6, 0, 0], 'p-b': [1, 2, 0], 'p-c': [0, 0, 2], 'p-d': [3, 0, 0], 'p-e': [2, 0, 0], 'p-f': [1, 0, 0], 'p-g': [0, 0, 0] };
    for (const [m, [w, s, e]] of Object.entries(P)) { add(m, 'mis'); for (let k = 0; k < w; k++) add(m, 'ans', { ok: 0 }); add(m, 'ans', { ok: 1 });
      for (let k = 0; k < s; k++) add(m, 'idle', { ms: 30000 }); for (let k = 0; k < e; k++) add(m, 'err', { msg: 'x' }); }
    const sa = ev.find(e => e.m === 'p-a' && e.k === 'ans' && !e.ok).i, sc = ev.find(e => e.m === 'p-c' && e.k === 'err').i, sm = ev.find(e => e.m === 'p-a' && e.k === 'mis').i;
    D1.db.prepare('INSERT INTO evlog(fam,sid,at,tz,n,ev,sh,si,ns) VALUES(?,?,?,?,?,?,?,?,?)').run('x', 'dig00001', t + 1000 * i, -120, ev.length, JSON.stringify(ev),
      JSON.stringify([sm, sa, sc].map(k => ({ i: k, d: JPG }))), [sm, sa, sc].join(','), 3);
    const tx = await (await f('/api/log/digest?days=7', H)).text();
    const j = await (await f('/api/log/digest?days=7&fmt=json', H)).json();
    const tday = new Date(t + 120 * 6e4).toISOString().slice(0, 10);
    ok('digest: the top 5 places, worst first (wrong + 2 x silence + 3 x error)', j.top.map(p => p.place).join() === 'p-a,p-c,p-b,p-d,p-e' && j.top[0].wrong === 6 && j.top[1].errors === 2 && j.top[2].silence === 2, JSON.stringify(j.top.map(p => [p.place, p.score])));
    ok('digest: a screenshot link per place that has one (the stuck moment, not the mission start)', j.top[0].shot === 'https://oren.test/api/log/review?day=' + tday + '#sdig00001-' + sa && j.top[1].shot.endsWith('-' + sc) && j.top[3].shot === null, JSON.stringify(j.top.map(p => p.shot)));
    ok('digest: prints as text lines with the links', tx.split('\n')[0].startsWith('Where Oren got stuck') && /^1\. p-a - 6 wrong, 0 silences \(30 s\), 0 errors - https:\/\/oren\.test\/api\/log\/review\?day=/m.test(tx) && /^5\. p-e /m.test(tx) && !/p-f|p-g/.test(tx), tx);
    D1.db.exec('DELETE FROM evlog'); }
  // ---------- part 2: the real page through the worker ----------
  let posts = 0;
  const srv = http.createServer(async (q, r) => { let b = []; q.on('data', c => b.push(c)); q.on('end', async () => {
    if (q.url === '/api/log' && q.method === 'POST') posts++;
    try {
    const body = b.length ? Buffer.concat(b) : undefined;
    const x = await m.default.fetch(new Request('http://localhost' + q.url, { method: q.method, headers: q.headers, body: q.method === 'GET' || q.method === 'HEAD' ? undefined : body }), env);
    const hd = {}; x.headers.forEach((v, k) => { hd[k] = v; }); r.writeHead(x.status, hd); r.end(Buffer.from(await x.arrayBuffer()));
    } catch (e) { console.log('SERVER', q.url, e.message); r.writeHead(500); r.end(); } }); }).listen(0);
  const BASE = 'http://localhost:' + srv.address().port;
  const b = await chromium.launch();
  const ctx = await b.newContext(L.VIEWPORT); await ctx.addInitScript(() => { window.__fast = true; window.__famGap = 0; window.TAL_noHome = true; window.__idleMs = 2500; window.__logGap = 0; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/'); await p.waitForFunction(() => window.OREN && window.OREN.family && window.SHOTS, null, { timeout: 20000 }); await L.noCoach(p);
  const st = () => p.evaluate(() => window.SHOTS.stat());
  const flush = async () => { await p.evaluate(() => window.OREN.evFlush('tick')); await sleep(500); };
  // privacy rule
  { const r = await p.evaluate(async () => { const O = window.OREN, S = window.SHOTS, out = {};
      O.showMap(); await new Promise(r => setTimeout(r, 300)); out.map = S.allowed();
      O.setScreen('sPar', 'valley', () => {}); out.par = S.allowed(); const n0 = S.stat().skip.priv | 0; S.shoot({ i: 9001 }, 0); out.parSkip = (S.stat().skip.priv | 0) === n0 + 1;
      O.showMap(); const ov = document.getElementById('ov'); ov.hidden = false; ov.innerHTML = '<div class="card plog"><h2>PIN</h2><input type="password"></div>'; out.pin = S.allowed(); ov.hidden = true; ov.innerHTML = '';
      const inp = document.createElement('input'); document.getElementById('sMap').appendChild(inp); out.typed = S.allowed(); inp.remove();
      window.OREN.parentPlay(true); out.pplay = S.allowed(); window.OREN.parentPlay(false); O.showMap(); out.back = S.allowed(); return out; });
    ok('privacy: kid screens allowed; parent panel, PIN/login, typed text and parent play never', r.map && !r.par && r.parSkip && !r.pin && !r.typed && !r.pplay && r.back, JSON.stringify(r)); }
  // the six moments, each linked to its event
  { await p.evaluate(() => { const O = window.__oren4; O.save.story.intro = 1; O.playLevel(O.ALLLV[0]); }); await sleep(3500);
    await p.evaluate(() => window.SHOTS._set({ q: [] }));
    const ids = await p.evaluate(async () => { const O = window.OREN, S = window.SHOTS, out = {}; const w = ms => new Promise(r => setTimeout(r, ms));
      const last = () => { const b = O.evlog(); return b; };
      const settle = async () => { await w(150); for (let k = 0; k < 100 && S.stat().pend; k++) await w(100); };
      const mark = async (name, f, ms) => { const n0 = S.stat().n; f(); await w(ms || 0); await settle(); out[name] = S.stat().n - n0; };
      S._set({ jank: 0 }); /* the moments only (the busy check has its own test below) */
      await mark('mis', () => O.evMission('m-test'), 1600);
      await mark('help', () => O.track('help', { h: 'tip' }));
      await mark('pop', () => O.track('pop', { p: 'card' }));
      await mark('err', () => setTimeout(() => { throw new Error('boom462'); }, 0), 100);
      await mark('wrong1', () => O.evAns(0, {}));
      await mark('wrong2', () => O.evAns(0, {}));
      await mark('idle', () => O.evQ('zz', {}), 2700);
      S._set({ jank: 150 });
      return out; });
    await flush(); await flush();
    const R = rows(), E = new Map(); R.forEach(r => JSON.parse(r.ev).forEach(e => E.set((e.osid || r.sid) + ':' + e.i, e)));
    const kinds = R.flatMap(r => (r.si || '').split(',').filter(Boolean).map(i => (E.get(r.sid + ':' + i) || {}).k)).sort().join();
    ok('six moments: mission opened, help, popup, error, 2nd wrong in a row, 30 s silence each take one shot', ids.mis === 1 && ids.help === 1 && ids.pop === 1 && ids.err === 1 && ids.wrong1 === 0 && ids.wrong2 === 1 && ids.idle === 1, JSON.stringify(ids));
    ok('six moments: each screenshot is linked to the event that caused it (stored with the batch)', kinds === 'ans,err,help,idle,mis,pop', kinds); }
  // size: 480 px wide JPEG, about 20-40 KB
  { const r = await p.evaluate(async () => { const S = window.SHOTS, w = ms => new Promise(r => setTimeout(r, ms)); window.__logGap = 1e9; S._set({ jank: 0 }); S.shoot({ i: 9100 }, 0); await w(150); for (let k = 0; k < 100 && S.stat().pend; k++) await w(100); S._set({ jank: 150 }); window.__logGap = 0; const s = S.take().find(x => x.i === 9100); if (!s) return null;
      const im = new Image(); im.src = s.d; await im.decode(); return { w: im.naturalWidth, kb: Math.round(s.d.length * 0.75 / 1024), jpg: s.d.startsWith('data:image/jpeg;base64,') }; });
    ok('size: a 480 px wide JPEG of at most ~40 KB', r && r.w === 480 && r.kb <= 46 && r.jpg, JSON.stringify(r)); }
  // never slows play: busy frame, offline, session cap
  { const r = await p.evaluate(async () => { const S = window.SHOTS, w = ms => new Promise(r => setTimeout(r, ms)); const out = {};
      const n0 = S.stat().n, b0 = S.stat().skip.busy | 0; let jank = true; const loop = () => { const t = performance.now(); while (performance.now() - t < 200) { /* every frame takes 200 ms */ } if (jank) requestAnimationFrame(loop); }; requestAnimationFrame(loop);
      S.shoot({ i: 9200 }, 0); await w(5500); jank = false; out.s1 = S.stat(); out.busySkipped = (S.stat().skip.busy | 0) === b0 + 1 && !S.take().some(x => x.i === 9200);
      await w(3000); S.shoot({ i: 9201 }, 0); await w(1200); out.s2 = S.stat(); out.afterwards = (S.stat().skip.busy | 0) === b0 + 1 && S.take().some(x => x.i === 9201);
      const c0 = S.stat().skip.cap | 0; S._set({ n: 30 }); S.shoot({ i: 9202 }, 0); out.cap = (S.stat().skip.cap | 0) === c0 + 1 && !S.take().some(x => x.i === 9202); S._set({ n: 0 }); return out; });
    ok('busy frame: capture is skipped while the page is busy (one later try, also busy), taken once the browser is calm', r.busySkipped && r.afterwards, JSON.stringify(r));
    ok('cap: at most 30 per session on the device', r.cap, JSON.stringify(r));
    await ctx.setOffline(true); const off = await p.evaluate(async () => { const S = window.SHOTS, n0 = S.stat().skip.off | 0; S.shoot({ i: 9300 }, 0); await new Promise(r => setTimeout(r, 300)); return (S.stat().skip.off | 0) === n0 + 1 && !S.take().some(x => x.i === 9300); });
    await ctx.setOffline(false); ok('offline: no capture', off); }
  // the Playwright story: play 3 questions with 2 wrong in a row, then the session page shows the timeline with those screenshots
  { await p.waitForFunction(() => window.SHOTS.stat().pend === 0, null, { timeout: 9000 }).catch(() => {}); await flush(); D1.db.exec('DELETE FROM evlog'); await p.evaluate(() => { window.SHOTS._set({ q: [], n: 0, jank: 0 }); });
    const EVW = s => WR.test(s) && /evlog/.test(s); const w0 = D1.log.filter(EVW).length, p0 = posts; // busy check off: a loaded CI box must not skip the moments here (tested above)
    await p.evaluate(() => { window.OREN.showMap(); const O = window.__oren4; O.playLevel(O.ALLLV[0]); });
    await p.waitForFunction(() => window.SHOTS.stat().pend === 0, null, { timeout: 9000 }).catch(() => {}); // the mission-start shot (the level start can be busy: one later try)
    const tapAnswer = async (v) => { const c = await p.evaluate(() => { const P = window.__oren4.play; return P.choice ? P.choice.ans : null; });
      if (c != null) { await p.locator('#qa .chs button:not([disabled]), #qa .bubs button:not([disabled])').nth(v === 'wrong' ? (c === 0 ? 1 : 0) : 0).click(); return; }
      const a = await p.evaluate(() => { const P = window.__oren4.play; return P.qs[P.i].ans; });
      for (const d of String(v === 'wrong' ? a + 1 : a)) await p.locator(`#pad .key[data-k="${d}"]`).click();
      await p.locator('#pad .key.go').click(); };
    const qi = () => p.evaluate(() => window.__oren4.play.i);
    await tapAnswer('right'); await sleep(1300);
    const i2 = await qi(); await tapAnswer('wrong'); await sleep(700); await tapAnswer('wrong'); await sleep(1500);
    if (await qi() === i2) { await tapAnswer('right'); await sleep(1300); }
    await tapAnswer('right'); await sleep(1200);
    await flush(); await sleep(300);
    const wN = D1.log.filter(EVW).length - w0;
    ok('write budget: the play batch with its screenshots = one write per batch', posts - p0 >= 1 && wN === posts - p0, (posts - p0) + ' posts, ' + wN + ' writes ' + JSON.stringify(D1.log.filter(EVW).slice(w0)));
    const tz = await p.evaluate(() => new Date().getTimezoneOffset()); const d = new Date(Date.now() - tz * 6e4).toISOString().slice(0, 10);
    const sid = await p.evaluate(() => window.OREN.evlog().sid);
    const shotDir = process.env.SHOT_DIR;
    for (const vp of ['desktop', 'phone']) {
      const c2 = await b.newContext(vp === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 768 } });
      const rp = await c2.newPage(); const resp = await rp.goto(BASE + '/api/log/review?key=sekret&day=' + d);
      const v = await rp.evaluate(sid => { const s = document.getElementById('s' + sid); if (!s) return null; const li = [...s.querySelectorAll('li')];
        const wrongs = li.filter(x => x.classList.contains('k-ans') && x.querySelector('.bad'));
        return { sum: s.querySelector('.sum').textContent, mis: li.some(x => x.classList.contains('k-mis') && x.querySelector('img')), wrongs: wrongs.length,
          secondWrongShot: wrongs.length >= 2 && !!wrongs[1].querySelector('img') && !wrongs[0].querySelector('img'), rights: li.filter(x => x.querySelector('.ok')).length,
          imgs: s.querySelectorAll('img').length, loaded: [...s.querySelectorAll('img')].every(i => i.complete && i.naturalWidth === 480),
          over: document.documentElement.scrollWidth - innerWidth }; }, sid);
      ok('review page (' + vp + '): the session timeline (mission, answers right/wrong) with the screenshot at the 2nd wrong answer in a row', resp.status() === 200 && v && v.wrongs >= 2 && v.secondWrongShot && v.rights >= 2 && v.loaded && /min · 1 missions · \d+ right \/ \d+ wrong · 0 errors/.test(v.sum), JSON.stringify(v));
      ok('review page (' + vp + '): fits the screen (no sideways scroll)', v && v.over <= 0, JSON.stringify(v && v.over));
      if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); await rp.screenshot({ path: path.join(shotDir, 'review-' + vp + '.png'), fullPage: false }); }
      await c2.close(); }
    const c3 = await b.newContext(); const np = await c3.newPage(); const nr = await np.goto(BASE + '/api/log/review?day=' + d);
    ok('review page: no key = 401 in a browser', nr.status() === 401); await c3.close(); }
  ok('no page errors except the test one', errs.every(e => /boom462/.test(e)), errs.join('; '));
  await b.close(); srv.close();
  L.finish('shots', res);
})().catch(e => { console.error(e); process.exit(1); });
