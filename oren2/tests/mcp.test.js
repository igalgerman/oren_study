// #674 MCP server (POST /api/mcp) on the worker: auth, every tool, writes are logged, limits. Worker bundle + fake KV/D1, no browser.
const L = require('./lib');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const st = sql => { let a = []; return { bind(...x) { a = x; return this; },
    async run() { const r = db.prepare(sql).run(...a); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
    async all() { return { results: db.prepare(sql).all(...a) }; }, async first() { return db.prepare(sql).get(...a) || null; } }; };
  return { db, prepare: st, exec: async sql => { db.exec(sql); } };
}
(async () => {
  const m = await import(require('url').pathToFileURL(path.join(L.ROOT, 'cf', 'dist', '_worker.js')).href);
  const kv = new Map(); const KV = { get: async k => kv.get(k) || null, put: async (k, v) => { kv.set(k, v); }, delete: async k => { kv.delete(k); }, list: async o => ({ keys: [] }) };
  const D1 = fakeD1(); const TOK = 'tok-' + 'x'.repeat(40);
  const env = { DIAG_KEY: 'sekret', MCP_TOKEN: TOK, MCP_RATE: 100000, MCP_WRITES: 100000, SAVES: KV, DB: D1 };
  const f = (o, e = env) => m.default.fetch(new Request('https://oren.test/api/mcp', o), e);
  let n = 0;
  const rpc = (method, params, tok = TOK, e = env) => f({ method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, tok ? { authorization: 'Bearer ' + tok } : {}), body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }) }, e);
  const call = async (name, args, tok) => { const r = await rpc('tools/call', { name, arguments: args || {} }, tok); const j = await r.json(); return { st: r.status, j, text: j.result && j.result.content ? j.result.content[0].text : '', err: !!(j.result && j.result.isError) }; };
  const FAM = 'a0'.repeat(16), now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  kv.set(FAM, JSON.stringify({ v: 4, gems: 12, t: now, setT: 1, s: { 'add-0-0': 3 }, time: { [day]: 600 }, set: { pw: 'SECRETPW', hl: { x: 1 }, pc: [] } }));
  // a play log event for the read tools
  await m.default.fetch(new Request('https://oren.test/api/log', { method: 'POST', body: JSON.stringify({ fam: FAM, sid: 'sess1234', tz: 0, ev: [{ i: 1, t: now - 5000, k: 'mis', m: 'add-0' }, { i: 2, t: now - 4000, k: 'q', m: 'add-0' }, { i: 3, t: now - 3000, k: 'ans', m: 'add-0', ok: 1, ms: 900 }] }) }), env);

  // ---------- auth ----------
  ok('no token = 401', (await rpc('tools/list', {}, null)).status === 401);
  ok('wrong token = 401', (await rpc('tools/list', {}, 'nope')).status === 401);
  ok('server without MCP_TOKEN = 401 even with a guess', (await rpc('tools/list', {}, 'x', { ...env, MCP_TOKEN: undefined })).status === 401);
  ok('empty bearer = 401 when MCP_TOKEN is empty', (await rpc('tools/list', {}, ' ', { ...env, MCP_TOKEN: '' })).status === 401);
  ok('token in the query string is not accepted', (await m.default.fetch(new Request('https://oren.test/api/mcp?key=' + TOK, { method: 'POST', body: '{}' }), env)).status === 401);
  ok('GET is 405 (with the token) and 401 (without)', (await f({ method: 'GET', headers: { authorization: 'Bearer ' + TOK } })).status === 405 && (await f({ method: 'GET' })).status === 401);
  ok('the play-log key (DIAG_KEY) does not open the MCP', (await rpc('tools/list', {}, 'sekret')).status === 401);
  // revoke: changing the secret locks the old token out at once
  ok('token changed (revoked): the old token = 401, the new one works', (await rpc('tools/list', {}, TOK, { ...env, MCP_TOKEN: 'new-token-' + 'y'.repeat(30) })).status === 401 && (await rpc('tools/list', {}, 'new-token-' + 'y'.repeat(30), { ...env, MCP_TOKEN: 'new-token-' + 'y'.repeat(30) })).status === 200);

  // ---------- protocol ----------
  { const j = await (await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } })).json();
    ok('initialize: protocol version, tools capability, server name', j.result && j.result.protocolVersion && j.result.capabilities.tools && /oren/i.test(j.result.serverInfo.name), JSON.stringify(j).slice(0, 200)); }
  { const r = await f({ method: 'POST', headers: { authorization: 'Bearer ' + TOK }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }); ok('notification = 202', r.status === 202); }
  ok('unknown method = JSON-RPC error', (await (await rpc('nope', {})).json()).error.code === -32601);
  ok('bad json = parse error', (await (await f({ method: 'POST', headers: { authorization: 'Bearer ' + TOK }, body: '{x' })).json()).error.code === -32700);
  const tl = (await (await rpc('tools/list', {})).json()).result.tools; const names = tl.map(t => t.name);
  ok('read tools listed', ['get_day_summary', 'get_play_log', 'get_progress'].every(x => names.includes(x)), names.join());
  ok('write tools listed (message, reminder, plan, pause)', ['send_message', 'send_reminder', 'change_plan', 'pause_today', 'resume_today'].every(x => names.includes(x)));
  ok('NO delete / secret / settings tool', !names.some(x => /delete|remove|secret|key|password|token|reset_all|wipe/i.test(x)), names.join());
  ok('every tool has a description and an object input schema', tl.every(t => t.description && t.inputSchema && t.inputSchema.type === 'object'));
  ok('unknown tool = error', (await call('delete_everything')).j.error || (await call('delete_everything')).err);

  // ---------- read tools ----------
  { const r = await call('get_day_summary', { day }); const j = JSON.parse(r.text);
    ok('get_day_summary: the day, the minutes played, the mission with its answer', j.day === day && j.min >= 0 && JSON.stringify(j).includes('add-0') && j.questions === 1 && j.right === 1, r.text.slice(0, 300)); }
  { const r = await call('get_day_summary', {}); ok('get_day_summary: no day = today', !r.err && r.text.includes(day), r.text.slice(0, 120)); }
  ok('get_day_summary: a bad day is an error', (await call('get_day_summary', { day: '2026-13-99x' })).err);
  { const r = await call('get_play_log', { limit: 2 }); const j = JSON.parse(r.text); ok('get_play_log: newest events, limited', Array.isArray(j.events) && j.events.length === 2 && j.events[0].k === 'ans', r.text.slice(0, 200));
    ok('get_play_log: a huge limit is capped', JSON.parse((await call('get_play_log', { limit: 99999 })).text).events.length <= 200); }
  { const r = await call('get_progress'); const j = JSON.parse(r.text);
    ok('get_progress: gems, missions, minutes per day', j.gems === 12 && JSON.stringify(j).includes('add-0-0') && j.minutes && j.minutes[day] === 10, r.text.slice(0, 300));
    ok('get_progress: NEVER the parent password, family id or settings', !/SECRETPW|a0a0a0a0|"pw"|sekret|MCP_TOKEN|tok-x/.test(r.text), r.text.slice(0, 300)); }
  { const bad = await call('get_progress', {}, 'nope'); ok('every tool call without the token = 401', bad.st === 401); }

  // ---------- write tools ----------
  const save = () => { const r = D1.db.prepare('SELECT data FROM saves WHERE id=?').get(FAM); return JSON.parse(r ? r.data : kv.get(FAM)); };
  { const r = await call('send_message', { text: 'שלום אורן, כל הכבוד!' }); const s = save();
    ok('send_message: set.rem is a msg for the kid, setT bumped', !r.err && s.set.rem && s.set.rem.k === 'msg' && s.set.rem.x === 'שלום אורן, כל הכבוד!' && s.set.rem.to === 'kid' && s.set.setT === undefined && s.setT > 1, JSON.stringify(s.set.rem));
    ok('send_message: the parent password and other settings are untouched', s.set.pw === 'SECRETPW' && s.set.hl.x === 1 && s.gems === 12); }
  ok('send_message: empty / long text is an error', (await call('send_message', { text: '  ' })).err && (await call('send_message', { text: 'א'.repeat(121) })).err);
  { await call('send_reminder', { kind: 'water', in_minutes: 5 }); const s = save(); ok('send_reminder: water in 5 minutes', s.set.rem.k === 'water' && s.set.rem.at - s.set.rem.t === 300000 && s.set.rem.to === 'kid'); }
  ok('send_reminder: bad kind / minutes are errors', (await call('send_reminder', { kind: 'x' })).err && (await call('send_reminder', { kind: 'eat', in_minutes: 999 })).err);
  { await call('change_plan', { op: 'drop', mission: 'add-0-0' }); const c = save().set.pc.slice(-1)[0];
    ok('change_plan: a parent command for the kid device (same format as the panel)', c.k === 'drop' && c.a === 'add-0-0' && c.to === 'kid' && c.d === day && c.i && c.t, JSON.stringify(c));
    await call('change_plan', { op: 'new' }); ok('change_plan: new / reset take no mission', save().set.pc.slice(-1)[0].k === 'new' && !('a' in save().set.pc.slice(-1)[0])); }
  ok('change_plan: bad op, missing or odd mission are errors', (await call('change_plan', { op: 'rm -rf' })).err && (await call('change_plan', { op: 'drop' })).err && (await call('change_plan', { op: 'drop', mission: '<script>' })).err);
  { await call('pause_today'); const l = save().set.lim; ok('pause_today: today limit = what he played (10 min)', l.today && l.today.d === day && l.today.min === 10, JSON.stringify(l));
    await call('resume_today'); ok('resume_today: back to the regular limit', save().set.lim.today === null); }
  { const log = save().set.mcpLog; ok('every write is in set.mcpLog (shown in the panel): time, tool, short text', Array.isArray(log) && log.length >= 6 && log.every(x => x.t && x.tool) && log.some(x => x.tool === 'send_message' && /שלום/.test(x.x)), JSON.stringify(log).slice(0, 200));
    ok('reads are not logged as writes', !log.some(x => /^get_/.test(x.tool))); }
  { for (let i = 0; i < 40; i++) await call('pause_today'); ok('the log keeps only the newest 30', save().set.mcpLog.length === 30); }
  ok('the save is still a valid v4 save', save().v === 4);

  // ---------- rate limit (own token + small limits, so the other checks are not touched) ----------
  { const RT = 'rate-' + 'z'.repeat(30), e2 = { ...env, MCP_TOKEN: RT, MCP_RATE: 5, MCP_WRITES: 3 }; let w = [];
    for (let i = 0; i < 6; i++) w.push((await rpc('ping', {}, RT, e2)).status);
    ok('rate limited: more than MCP_RATE calls in a minute = 429 (with Retry-After)', w.slice(0, 5).every(x => x === 200) && w[5] === 429);
    const e3 = { ...env, MCP_TOKEN: RT + '2', MCP_WRITES: 3 }; const out = [];
    for (let i = 0; i < 5; i++) { const r = await rpc('tools/call', { name: 'send_message', arguments: { text: 'ok' + i } }, RT + '2', e3); const j = await r.json(); out.push(!!(j.result && j.result.isError)); }
    ok('writes limited per hour: the 4th write is refused and says "limit"', out.slice(0, 3).every(x => !x) && out[3] && out[4]); }
  L.finish('mcp', res);
})().catch(e => { console.log(res.join('\n')); console.log('FAIL crashed — ' + e.stack); console.log('RESULT mcp 0 1'); process.exitCode = 1; });
