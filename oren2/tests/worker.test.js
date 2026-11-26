// The Cloudflare worker bundle (cf/dist/_worker.js): page, icons, manifest and the family save API, with a fake KV.
const L = require('./lib');
const path = require('path');
(async () => {
  const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
  const m = await import(require('url').pathToFileURL(path.join(L.ROOT, 'cf', 'dist', '_worker.js')).href);
  const kv = new Map(); const env = { SAVES: { get: async k => kv.get(k) || null, put: async (k, v) => { kv.set(k, v); } } };
  const f = (u, o) => m.default.fetch(new Request('https://oren.test' + u, o), env);
  const id = 'ab'.repeat(16);
  const home = await f('/'); const html = await home.text();
  ok('home page served as html', home.status === 200 && /text\/html/.test(home.headers.get('content-type')) && html.includes('window.OREN'));
  const ic = await f('/icon-192.png'); ok('icon served as png', ic.status === 200 && ic.headers.get('content-type') === 'image/png' && (await ic.arrayBuffer()).byteLength > 500);
  const mf = await f('/manifest.webmanifest'); ok('manifest served', mf.status === 200 && JSON.parse(await mf.text()).start_url === '/');
  ok('unknown path is 404', (await f('/nope')).status === 404);
  ok('bad family id rejected', (await f('/api/save/xyz')).status === 400);
  ok('missing save is 404', (await f('/api/save/' + id)).status === 404);
  const put = await f('/api/save/' + id, { method: 'PUT', body: JSON.stringify({ v: 4, gems: 7 }) });
  ok('save stored', put.status === 200 && JSON.parse(kv.get(id)).gems === 7);
  const get = await f('/api/save/' + id); ok('save read back', get.status === 200 && (await get.json()).gems === 7 && get.headers.get('cache-control') === 'no-store');
  ok('non-game json rejected', (await f('/api/save/' + id, { method: 'PUT', body: '{"hello":1}' })).status === 400);
  ok('oversized save rejected', (await f('/api/save/' + id, { method: 'PUT', body: JSON.stringify({ v: 4, x: 'a'.repeat(310000) }) })).status === 413);
  ok('other methods rejected', (await f('/api/save/' + id, { method: 'DELETE' })).status === 405);
  // Google voice: cache, game voice default, pregen (fake Google)
  env.GOOGLE_TTS_KEY = 'k'; const calls = []; const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => { const b = JSON.parse(o.body); calls.push(b); return new Response(JSON.stringify({ audioContent: Buffer.from('MP3' + b.input.text).toString('base64') })); };
  const writes = () => [...kv.keys()].length;
  const a1 = await f('/api/tts?t=' + encodeURIComponent('שָׁלוֹם') + '&r=0.9');
  ok('tts default is Kore 0.9', a1.status === 200 && calls[0].voice.name === 'he-IL-Chirp3-HD-Kore' && calls[0].audioConfig.speakingRate === 0.9 && a1.headers.get('content-type') === 'audio/mpeg');
  const a2 = await f('/api/tts?t=' + encodeURIComponent('שָׁלוֹם') + '&v=he-IL-Chirp3-HD-Kore&r=0.9');
  ok('tts second call is a cache hit', a2.status === 200 && calls.length === 1 && Buffer.from(await a2.arrayBuffer()).toString().startsWith('MP3'));
  ok('tts other listed voices still accepted', (await f('/api/tts?t=x&v=he-IL-Wavenet-D')).status === 200 && calls.length === 2);
  ok('tts bad voice rejected', (await f('/api/tts?t=x&v=evil')).status === 400);
  const n0 = writes();
  const pg = await f('/api/tts/pregen', { method: 'POST', body: JSON.stringify({ texts: ['שָׁלוֹם', 'אַחַת', 'שְׁתַּיִם ', ''] }) }); const pj = await pg.json();
  ok('pregen skips cached and creates new', pg.status === 200 && pj.res.join() === 'hit,new,new,empty' && calls.length === 4, JSON.stringify(pj));
  ok('pregen: one KV write per new sentence, month and day counters once', writes() - n0 === 2 && +kv.get('ttsuse:' + new Date().toISOString().slice(0, 7)) === 'שָׁלוֹם'.length + 1 + 'אַחַת'.length + 'שְׁתַּיִם'.length);
  const a3 = await f('/api/tts?t=' + encodeURIComponent('שְׁתַּיִם') + '&v=he-IL-Chirp3-HD-Kore&r=0.9');
  ok('pregen sentence served from cache with the client key', a3.status === 200 && calls.length === 4);
  ok('pregen rejects >15 texts / GET / bad json', (await f('/api/tts/pregen', { method: 'POST', body: JSON.stringify({ texts: Array(16).fill('a') }) })).status === 400 && (await f('/api/tts/pregen')).status === 405 && (await f('/api/tts/pregen', { method: 'POST', body: 'x' })).status === 400);
  // English voices (Chirp3-HD en-US) and the "download all voices" cache-only fetch
  const ae = await f('/api/tts?t=cat&v=en-US-Chirp3-HD-Kore&r=0.85');
  ok('en-US Chirp3-HD voice accepted, sent as en-US', ae.status === 200 && calls.at(-1).voice.languageCode === 'en-US' && calls.at(-1).audioConfig.speakingRate === 0.85);
  ok('other English voices rejected', (await f('/api/tts?t=cat&v=en-GB-Chirp3-HD-Kore')).status === 400 && (await f('/api/tts?t=cat&v=en-US-Wavenet-A')).status === 400);
  const en = await f('/api/tts/en'); const enh = await en.text();
  ok('English listening page', en.status === 200 && /text\/html/.test(en.headers.get('content-type')) && enh.includes('en-US-Chirp3-HD-') && enh.includes('"Kore","Leda"') && enh.includes('r=0.85') && enh.includes('width:100%'));
  const nc = calls.length; const co = await f('/api/tts?t=' + encodeURIComponent('לֹא קַיָּם') + '&r=0.9', { headers: { 'x-cache-only': '1' } });
  ok('cache-only request never creates a sentence', co.status === 404 && calls.length === nc);
  // full sentence list for the offline download: URLs exactly as the game builds them
  ok('list stored', (await (await f('/api/tts/list', { method: 'POST', body: JSON.stringify(['שָׁלוֹם', 'שָׁלוֹם', ' אַחַת ']) })).json()).n === 2);
  const lu = (await (await f('/api/tts/list')).json()).urls;
  ok('list gives the game URLs with the audio version', lu.length === 2 && lu[0] === '/api/tts?t=' + encodeURIComponent('שָׁלוֹם') + '&v=he-IL-Chirp3-HD-Kore&r=0.9&k=1');
  // English game voice (Despina 0.85): pregen and the download list take {t,v,r} items; the cache key matches the client URL
  const EN = { t: 'A. apple', v: 'en-US-Chirp3-HD-Despina', r: 0.85 };
  const pe = await (await f('/api/tts/pregen', { method: 'POST', body: JSON.stringify({ texts: [EN, { t: 'x', v: 'evil' }] }) })).json();
  ok('pregen makes an English item in its voice', pe.res.join() === 'new,bad voice' && calls.at(-1).voice.name === EN.v && calls.at(-1).voice.languageCode === 'en-US' && calls.at(-1).audioConfig.speakingRate === 0.85, JSON.stringify(pe));
  const enUrl = '/api/tts?t=' + encodeURIComponent('A. apple') + '&v=en-US-Chirp3-HD-Despina&r=0.85'; const enK = enUrl + '&k=1';
  const ce = calls.length; ok('English pregen sentence served from cache with the client URL', (await f(enUrl)).status === 200 && calls.length === ce);
  await f('/api/tts/list', { method: 'POST', body: JSON.stringify(['שָׁלוֹם', EN, EN]) });
  ok('list keeps English items with their voice', JSON.stringify((await (await f('/api/tts/list')).json()).urls) === JSON.stringify([lu[0], enK]));
  // automatic pregen queue: processed in the background of ordinary requests, budget, gap, dedupe, few KV writes
  let now = Date.now(); const realNow = Date.now; Date.now = () => now;
  let puts = 0; const put0 = env.SAVES.put; env.SAVES.put = async (k, v, o) => { puts++; return put0(k, v, o); };
  const fc = async u => { const w = []; const r = await m.default.fetch(new Request('https://oren.test' + u), env, { waitUntil: p => w.push(p) }); await r.arrayBuffer(); await Promise.all(w); return w.length; };
  const qs = () => f('/api/tts/queue').then(r => r.json());
  const Q = ['שָׁלוֹם', ...Array.from({ length: 8 }, (_, i) => 'מִשְׁפָּט ' + i), 'מִשְׁפָּט 0', { t: 'dog', v: 'en-US-Chirp3-HD-Leda', r: 0.85 }, { t: 'x', v: 'evil' }, 5];
  const qp = await (await f('/api/tts/queue', { method: 'POST', body: JSON.stringify(Q) })).json();
  ok('queue upload dedupes and drops bad items', qp.added === 10 && qp.left === 10, JSON.stringify(qp));
  ok('queue upload again adds nothing and does not write', (await (await f('/api/tts/queue', { method: 'POST', body: JSON.stringify(Q) })).json()).added === 0 && puts === 1);
  ok('queue rejects bad body / other methods', (await f('/api/tts/queue', { method: 'POST', body: '{"a":1}' })).status === 400 && (await f('/api/tts/queue', { method: 'DELETE' })).status === 405);
  let c0 = calls.length; puts = 0;
  ok('page load schedules background work', (await fc('/')) === 1);
  let q = await qs();
  ok('batch: at most 5 new, cached ones skipped free', calls.length - c0 === 5 && q.left === 4 && q.doneToday === 5, JSON.stringify(q));
  ok('batch: KV writes = new sentences + queue + month counter + day counter', puts === 8, 'puts ' + puts);
  c0 = calls.length; now += 5000; await fc('/api/save/' + id);
  ok('no new batch within the gap', calls.length === c0);
  now += 31000; await fc('/api/save/' + id); q = await qs();
  ok('next batch on a save call finishes the queue (en item made in its voice)', q.left === 0 && q.doneToday === 9 && calls.some(b => b.input.text === 'dog' && b.voice.name === 'en-US-Chirp3-HD-Leda'), JSON.stringify(q));
  now += 31000; c0 = calls.length; puts = 0; await fc('/'); ok('empty queue: no Google call, no write', calls.length === c0 && puts === 0);
  ok('unrelated paths do not schedule work', (await fc('/manifest.webmanifest')) === 0 && (await fc('/api/tts/status')) === 0);
  const st = JSON.parse(kv.get('ttsq')); st.n = 298; kv.set('ttsq', JSON.stringify(st));
  await f('/api/tts/queue', { method: 'POST', body: JSON.stringify(Array.from({ length: 6 }, (_, i) => 'עוֹד ' + i)) });
  now += 31000; c0 = calls.length; await fc('/'); q = await qs();
  ok('daily budget (300) respected', calls.length - c0 === 2 && q.doneToday === 300 && q.left === 4, JSON.stringify(q));
  now += 31000; c0 = calls.length; await fc('/'); ok('over budget: nothing more today', calls.length === c0);
  // daily KV write budget (#68): TTS writes stop at the budget, family saves never do
  const DK = 'ttsday:' + new Date().toISOString().slice(0, 10);
  kv.set(DK, '599'); { const st2 = JSON.parse(kv.get('ttsq')); st2.n = 0; kv.set('ttsq', JSON.stringify(st2)); }
  await f('/api/tts/queue', { method: 'POST', body: JSON.stringify(['תַּקְצִיב א', 'תַּקְצִיב ב', 'תַּקְצִיב ג']) });
  now += 31000; c0 = calls.length; await fc('/');
  ok('queue batch stops at the daily budget (1 left = 1 sentence)', calls.length - c0 === 1 && kv.get(DK) === '600', calls.length - c0 + ' ' + kv.get(DK));
  now += 31000; c0 = calls.length; await fc('/'); ok('budget used: background queue makes nothing more', calls.length === c0);
  kv.set(DK, '0');
  Date.now = realNow; env.SAVES.put = put0;
  // pronunciation dictionary: POST /api/tts/fix merges words, re-makes the sentence under its ORIGINAL key; synth applies whole words only
  const S1 = 'יש עשרות, אחדות, ועשרות.'; const u1 = '/api/tts?t=' + encodeURIComponent(S1) + '&v=he-IL-Chirp3-HD-Kore&r=0.9';
  await f(u1); ok('before the fix the plain text goes to Google', calls.at(-1).input.text === S1);
  puts = 0; env.SAVES.put = async (k, v, o) => { puts++; return put0(k, v, o); };
  const fx = await (await f('/api/tts/fix', { method: 'POST', body: JSON.stringify({ t: S1, words: { 'עשרות': 'עֲשָׂרוֹת', 'אחדות': 'אֲחָדוֹת' } }) })).json();
  const want = 'יש עֲשָׂרוֹת, אֲחָדוֹת, ועשרות.';
  ok('fix: dictionary applied to whole words only (ועשרות untouched)', fx.ok && fx.sent === want && calls.at(-1).input.text === want, JSON.stringify(fx));
  ok('fix: 3 KV writes (dictionary + audio + day counter)', puts === 3, 'puts ' + puts);
  const c1 = calls.length; const a4 = await f(u1);
  ok('fix: game URL now plays the fixed audio from cache', calls.length === c1 && Buffer.from(await a4.arrayBuffer()).toString() === 'MP3' + want);
  puts = 0; await f('/api/tts/fix', { method: 'POST', body: JSON.stringify({ t: S1, words: { 'עשרות': 'עֲשָׂרוֹת' } }) });
  ok('fix: same words again does not rewrite the dictionary', puts === 2, 'puts ' + puts);
  await f('/api/tts?t=' + encodeURIComponent('כמה עשרות?') + '&r=0.9');
  ok('new sentences get the dictionary', calls.at(-1).input.text === 'כמה עֲשָׂרוֹת?');
  await f('/api/tts?t=' + encodeURIComponent('three עשרות') + '&v=en-US-Chirp3-HD-Kore&r=0.85');
  ok('English voices are left alone', calls.at(-1).input.text === 'three עשרות');
  const lo = await (await f('/api/tts/fix', { method: 'POST', body: JSON.stringify({ t: 'ספר לי על הספר', only: { 'ספר': 'סַפֵּר' } }) })).json();
  ok('fix: "only" applies to this sentence, not stored', lo.sent === 'סַפֵּר לי על הספר' && !('ספר' in (await (await f('/api/tts/fix')).json())));
  await f('/api/tts/fix', { method: 'POST', body: JSON.stringify({ t: S1, words: { 'אחדות': null } }) });
  const dict = await (await f('/api/tts/fix')).json();
  ok('fix: null removes a word; GET gives the dictionary', JSON.stringify(dict) === JSON.stringify({ 'עשרות': 'עֲשָׂרוֹת' }) && calls.at(-1).input.text === 'יש עֲשָׂרוֹת, אחדות, ועשרות.');
  const bad = async body => (await f('/api/tts/fix', { method: 'POST', body: JSON.stringify(body) })).status;
  ok('fix rejects bad input', await bad({ t: '', words: {} }) === 400 && await bad({ t: 'x', words: { 'a b': 'x' } }) === 400 && await bad({ t: 'x', words: { 'שלום': '<b>' } }) === 400 && await bad({ t: 'x', v: 'evil' }) === 400 && (await f('/api/tts/fix', { method: 'DELETE' })).status === 405);
  // emoji and pictographs are never read aloud (he and en); the cache key stays the client's text
  const E1 = '🗝️ חבר נתקע במערה. כל משימה פותחת מנעול אחד! ⭐ 1️⃣ ✓'; await f('/api/tts?t=' + encodeURIComponent(E1) + '&r=0.9');
  ok('emoji stripped before Google (keycap digit kept)', calls.at(-1).input.text === 'חבר נתקע במערה. כל משימה פותחת מנעול אחד! אחת', calls.at(-1).input.text);
  await f('/api/tts?t=' + encodeURIComponent('🍎 apple 👍🏽') + '&v=en-US-Chirp3-HD-Kore&r=0.85'); ok('emoji stripped in English too', calls.at(-1).input.text === 'apple');
  const c3 = calls.length; ok('emoji sentence cached under the original text', (await f('/api/tts?t=' + encodeURIComponent(E1) + '&r=0.9')).status === 200 && calls.length === c3);
  // numbers in Hebrew words (gender agreement with the noun after them, counting form otherwise)
  const NUM = [
    ['47 הוא 4 עשרות ו-7 אחדות.', 'ארבעים ושבע הוא ארבע עֲשָׂרוֹת ושבע אחדות.'],
    ['3 עשרות ו- 9 אחדות הן המספר:', 'שלוש עֲשָׂרוֹת ותשע אחדות הן המספר:'],
    ['במספר ‎538 יש 5 מאות', 'במספר חמש מאות שלושים ושמונה יש חמש מאות'],
    ['ישבו 11 נוסעים', 'ישבו אחד עשר נוסעים'], ['עלו עוד 4 נוסעים', 'עלו עוד ארבעה נוסעים'], ['יש 2 תפוחים', 'יש שני תפוחים'],
    ['עוד 2 דקות', 'עוד שתי דקות'], ['יש 12 עמודים', 'יש שנים עשר עמודים'], ['יש 12 מדבקות', 'יש שתים עשרה מדבקות'],
    ['10 צעצועים', 'עשרה צעצועים'], ['10 אצבעות', 'עשר אצבעות'], ['3 דברים', 'שלושה דברים'], ['3 שעות', 'שלוש שעות'],
    ['81 ילדים', 'שמונים ואחד ילדים'], ['21 עוגיות', 'עשרים ואחת עוגיות'], ['22 כדורים', 'עשרים ושניים כדורים'], ['22 גולות', 'עשרים ושתיים גולות'],
    ['ב- 47 שקלים', 'בארבעים ושבעה שקלים'], ['ל- 4 מכוניות', 'לארבע מכוניות'], ['ל- 6 ילדים', 'לשישה ילדים'], ['ב- 2 שבועות', 'בשני שבועות'],
    ['7 ימים', 'שבעה ימים'], ['15 דקות', 'חמש עשרה דקות'], ['45 דקות', 'ארבעים וחמש דקות'], ['19 תפוחים', 'תשעה עשר תפוחים'],
    ['8 + 7 = 15', 'שמונה ועוד שבע שווה חמש עשרה'], ['15 − 7 = 8', 'חמש עשרה פחות שבע שווה שמונה'], ['15 - 7', 'חמש עשרה פחות שבע'],
    ['3 × 5', 'שלוש כפול חמש'], ['17 : 5 = 3', 'שבע עשרה חלקי חמש שווה שלוש'], ['40 ÷ 4', 'ארבעים חלקי ארבע'], ['3+4=7', 'שלוש ועוד ארבע שווה שבע'],
    ['כמה זה 3 ועוד 4?', 'כמה זה שלוש ועוד ארבע?'], ['השעה 3', 'השעה שלוש'], ['1:30', 'אחת וחצי'], ['10:00', 'עשר'], ['12:30', 'שתים עשרה וחצי'],
    ['3:15', 'שלוש ורבע'], ['7:45', 'שבע וארבעים וחמש'], ['ל-10', 'לעשר'], ['מ-100', 'ממאה'], ['ב-0', 'באפס'],
    ['0', 'אפס'], ['1', 'אחת'], ['2', 'שתיים'], ['20', 'עשרים'], ['100', 'מאה'], ['101', 'מאה ואחת'], ['110', 'מאה ועשר'],
    ['111', 'מאה ואחת עשרה'], ['120', 'מאה ועשרים'], ['123', 'מאה עשרים ושלוש'], ['200', 'מאתיים'], ['340', 'שלוש מאות וארבעים'],
    ['999', 'תשע מאות תשעים ותשע'], ['1000', 'אלף'], ['1,000', 'אלף'], ['2000', 'אלפיים'], ['3000', 'שלושת אלפים'], ['1001', 'אלף ואחת'],
    ['1250', 'אלף מאתיים וחמישים'], ['12000', 'שנים עשר אלף'], ['4.5', 'ארבע נקודה חמש'],
    ['2 4 6 8 ?', 'שתיים, ארבע, שש, שמונה ?'], ['10, 81, 74', 'עשר, שמונים ואחת, שבעים וארבע'],
    ['הכו רק כשהתשובה היא 6', 'הכו רק כשהתשובה היא שש'], ['13 × 4 = 10 × 4 + 3 × 4', 'שלוש עשרה כפול ארבע שווה עשר כפול ארבע ועוד שלוש כפול ארבע'],
    ['מחפשים 2 מספרים', 'מחפשים שני מספרים'], ['2 חלקים', 'שני חלקים'], ['12 עפרונות', 'שנים עשר עפרונות'], ['במספר 89 ?', 'במספר שמונים ותשע ?'],
    ['A1 ו3ד', 'A1 ו3ד'], ['דו-ספרתי', 'דו-ספרתי'],
    ['2 חלקים ← חצי, 3 ← שליש', 'שני חלקים, חצי, שלוש, שליש'],
  ];
  for (const [inp, out] of NUM) { await f('/api/tts?t=' + encodeURIComponent('מספר: ' + inp) + '&r=0.9'); const got = calls.at(-1).input.text.replace(/^מספר: /, '');
    ok('number: ' + inp, got === out, got); }
  await f('/api/tts?t=' + encodeURIComponent('3 apples') + '&v=en-US-Chirp3-HD-Kore&r=0.85'); ok('numbers left alone in English', calls.at(-1).input.text === '3 apples');
  // audio version for the game's URLs (&k=ver): bumped after fixes, read from /api/tts/status
  const v0 = (await (await f('/api/tts/status')).json()).ver; const vb = await (await f('/api/tts/ver', { method: 'POST' })).json();
  ok('status gives the audio version; POST /api/tts/ver bumps it', v0 === 1 && vb.ver === 2 && (await (await f('/api/tts/status')).json()).ver === 2 && kv.get('ttsver') === '2');
  const ck = calls.length; ok('k= is ignored by the cache key', (await f('/api/tts?t=' + encodeURIComponent('כמה עשרות?') + '&r=0.9&k=2')).status === 200 && calls.length === ck);
  // daily budget (#68): pregen and new single sentences stop at the budget; cached audio and saves keep working
  kv.set(DK, '598'); const cb = calls.length;
  const pb = await (await f('/api/tts/pregen', { method: 'POST', body: JSON.stringify({ texts: ['בּוּדְגֶט 1', 'בּוּדְגֶט 2', 'בּוּדְגֶט 3'] }) })).json();
  ok('pregen: stops at the daily budget', pb.res.join() === 'new,new,budget' && calls.length - cb === 2 && kv.get(DK) === '600', JSON.stringify(pb) + ' ' + kv.get(DK));
  const nb = await f('/api/tts?t=' + encodeURIComponent('משפט חדש לגמרי') + '&r=0.9'); const nbj = await nb.json().catch(() => null);
  ok('single new sentence: 429 with a clear message, no Google call', nb.status === 429 && nbj && /daily voice budget used, retry tomorrow/.test(nbj.error) && calls.length - cb === 2, nb.status + ' ' + JSON.stringify(nbj));
  ok('cached sentence still served over the budget', (await f('/api/tts?t=' + encodeURIComponent('בּוּדְגֶט 1') + '&r=0.9')).status === 200 && calls.length - cb === 2);
  const sv = await f('/api/save/' + id, { method: 'PUT', body: JSON.stringify({ v: 4, gems: 9 }) });
  ok('family save is never blocked by the voice budget', sv.status === 200 && JSON.parse(kv.get(id)).gems === 9);
  const fx2 = await f('/api/tts/fix', { method: 'POST', body: JSON.stringify({ t: 'עוד משפט', words: {} }) });
  ok('fix over the budget: 429, nothing written for audio', fx2.status === 429);
  kv.set(DK, '0'); env.TTS_DAY_BUDGET = '2'; kv.set(DK, '1');
  ok('budget is configurable (TTS_DAY_BUDGET)', (await f('/api/tts?t=' + encodeURIComponent('אחד') + '&r=0.9')).status === 200 && (await f('/api/tts?t=' + encodeURIComponent('שניים') + '&r=0.9')).status === 429);
  delete env.TTS_DAY_BUDGET; kv.set(DK, '0');
  // counter is written on EVERY new sentence (not every 5th), cached hits cost no writes
  kv.delete(DK); { const c1 = calls.length; for (let i = 0; i < 6; i++) await f('/api/tts?t=' + encodeURIComponent('מונה חדש ' + i) + '&r=0.9');
    ok('counter: 6 new single sentences -> ttsday is 6', kv.get(DK) === '6' && calls.length - c1 === 6, kv.get(DK));
    const rp = env.SAVES.put; const wr = []; env.SAVES.put = async (k, ...a) => { wr.push(k); return rp.call(env.SAVES, k, ...a); };
    await f('/api/tts?t=' + encodeURIComponent('מונה חדש 0') + '&r=0.9'); ok('counter: cached sentence costs 0 writes', wr.length === 0 && kv.get(DK) === '6', wr.join());
    env.TTS_DAY_BUDGET = '6';
    const ob = await f('/api/tts?t=' + encodeURIComponent('מעבר לתקציב') + '&r=0.9');
    ok('counter: budget reached -> over-budget answer, nothing written', ob.status === 429 && wr.length === 0, ob.status + ' ' + wr.join());
    const ofx = await f('/api/tts/fix', { method: 'POST', body: JSON.stringify({ t: 'תיקון מעבר', words: { מילה: 'מִלָּה' } }) });
    ok('fix over budget: 429 and ttsfixw not written', ofx.status === 429 && wr.length === 0, ofx.status + ' ' + wr.join());
    delete env.TTS_DAY_BUDGET; kv.set(DK, '0');
    const ok1 = await f('/api/tts/fix', { method: 'POST', body: JSON.stringify({ t: 'תיקון חדש', words: {} }) });
    ok('fix: first new sentence bumps the counter to 1', ok1.status === 200 && kv.get(DK) === '1', ok1.status + ' ' + kv.get(DK));
    env.SAVES.put = rp; kv.set(DK, '0'); }
  // a KV write that fails (daily write limit) must give readable JSON, not Cloudflare's HTML error 1101 (#22)
  const realPut = env.SAVES.put; env.SAVES.put = async () => { throw new Error('KV put() limit exceeded for the day.'); };
  const fl = await f('/api/tts/fix', { method: 'POST', body: JSON.stringify({ t: S1, words: { 'עשרות': 'עֲשָׂרוֹתא' } }) }); const flj = await fl.json().catch(() => null);
  ok('fix: a failing KV write gives JSON 503 with the reason', fl.status === 503 && flj && flj.ok === false && /limit/.test(flj.why), fl.status + ' ' + JSON.stringify(flj));
  const vl = await f('/api/tts/ver', { method: 'POST' }); const vlj = await vl.json().catch(() => null);
  ok('ver: a failing KV write gives JSON 503 with the reason', vl.status === 503 && vlj && vlj.ok === false && /limit/.test(vlj.why), vl.status);
  env.SAVES.put = realPut;
  // /api/tts/try: made fresh with the dictionary, never stored
  const k0 = kv.size, c2 = calls.length; const tr = await f('/api/tts/try?t=' + encodeURIComponent('יש עשרות'));
  ok('try: fresh audio with the dictionary, no KV write', tr.status === 200 && calls.length === c2 + 1 && calls.at(-1).input.text === 'יש עֲשָׂרוֹת' && kv.size === k0);
  // the parent's listening page: choices queue, votes, marks in batches
  const lp = await f('/api/tts/listen'); const lh = await lp.text();
  ok('listen page served', lp.status === 200 && /text\/html/.test(lp.headers.get('content-type')) && lh.includes('/api/tts/listen/data') && lh.includes('חצי') && lh.includes('הערה'));
  await f('/api/tts/listen/q', { method: 'POST', body: JSON.stringify({ choose: [{ w: 'אחדות', s: '4 עשרות ו-7 אחדות', vars: ['אחדות', 'אחאדות'] }], sample: [{ t: 'שלום', v: 'he-IL-Chirp3-HD-Kore', r: 0.9 }] }) });
  ok('vote stored; bad vote rejected', (await f('/api/tts/listen/vote', { method: 'POST', body: JSON.stringify({ w: 'אחדות', v: 'אחאדות', half: ['אחדות'], note: 'כמעט' }) })).status === 200 && (await f('/api/tts/listen/vote', { method: 'POST', body: JSON.stringify({ w: 'x', v: '<b>' }) })).status === 400);
  await f('/api/tts/listen/marks', { method: 'POST', body: JSON.stringify([{ t: 'שלום', ok: false, w: ['שלום'], note: 'הטעמה' }, { t: 'כן', ok: true }]) });
  const ld = await (await f('/api/tts/listen/data?marks')).json();
  ok('listen data: queue, votes, marks', ld.choose[0].w === 'אחדות' && ld.sample.length === 1 && ld.votes['אחדות'].v === 'אחאדות' && ld.votes['אחדות'].half[0] === 'אחדות' && ld.votes['אחדות'].note === 'כמעט' && ld.marks.length === 2 && ld.marks[0].w[0] === 'שלום' && ld.marks[0].note === 'הטעמה' && !ld.marks[0].ok && ld.marks[1].ok === true && !!ld.sid);
  env.SAVES.put = put0;
  globalThis.fetch = realFetch;
  // offline mode: /sw.js served, registered by the website page; in the service worker /api/save is never cached
  const sw = await f('/sw.js'); const swt = await sw.text();
  ok('sw.js served as javascript, not long-cached', sw.status === 200 && /^text\/javascript/.test(sw.headers.get('content-type')) && sw.headers.get('cache-control') === 'no-cache');
  ok('website page registers /sw.js', html.includes("navigator.serviceWorker.register('/sw.js')"));
  const H = {}; const self = { addEventListener: (n, fn) => { H[n] = fn; }, clients: {}, skipWaiting() {} };
  new Function('self', 'location', 'caches', swt)(self, new URL('https://oren.test/'), { open: () => new Promise(() => {}), keys: () => new Promise(() => {}) });
  const handled = (u, method = 'GET') => { let r = false; H.fetch({ request: new Request('https://oren.test' + u, { method }), respondWith: () => { r = true; }, waitUntil() {} }); return r; };
  ok('sw: /api/save never cached, POST ignored', !handled('/api/save/' + id) && !handled('/api/tts/pregen', 'POST') && !handled('/api/tts/queue'));
  ok('sw: page, audio, status and icons handled', handled('/') && handled('/api/tts?t=x&v=he-IL-Chirp3-HD-Kore&r=0.9') && handled('/api/tts/status') && handled('/icon-192.png'));
  // D1 storage (#71): writes go to D1 only, reads fall back to KV and copy lazily
  {
    globalThis.fetch = async (u, o) => { const b = JSON.parse(o.body); calls.push(b); return new Response(JSON.stringify({ audioContent: Buffer.from('MP3' + b.input.text).toString('base64') })); };
    const T = { tts_audio: new Map(), saves: new Map(), meta: new Map() }; const kv2 = new Map();
    const tb = q => /tts_audio/.test(q) ? 'tts_audio' : /saves/.test(q) ? 'saves' : 'meta';
    const DB = { prepare: q => ({ bind: (...a) => ({
      first: async () => { const r = T[tb(q)].get(a[0]); return r === undefined ? null : r; },
      run: async () => { const t = tb(q); T[t].set(a[0], t === 'tts_audio' ? { bin: a[1] } : t === 'saves' ? { data: a[1] } : { v: a[1] }); return {}; } }) }) };
    const env2 = { DB, SAVES: { get: async (k, t) => kv2.get(k) || null, put: async (k, v) => { kv2.set(k, v); } }, GOOGLE_TTS_KEY: 'k' };
    const g = (u, o) => m.default.fetch(new Request('https://oren.test' + u, o), env2);
    const id2 = 'cd'.repeat(16);
    ok('D1: save goes to D1, not KV', (await g('/api/save/' + id2, { method: 'PUT', body: JSON.stringify({ v: 4, gems: 3 }) })).status === 200 && JSON.parse(T.saves.get(id2).data).gems === 3 && kv2.size === 0);
    ok('D1: save read back from D1', (await (await g('/api/save/' + id2)).json()).gems === 3);
    const id3 = 'ef'.repeat(16); kv2.set(id3, JSON.stringify({ v: 4, gems: 9 }));
    ok('D1: old save in KV is still read and copied to D1', (await (await g('/api/save/' + id3)).json()).gems === 9 && !!T.saves.get(id3));
    const k0 = kv2.size; const nc2 = calls.length;
    const v1 = await g('/api/tts?t=' + encodeURIComponent('דִּין') + '&r=0.9');
    ok('D1: new sentence stored in D1 audio table, KV untouched', v1.status === 200 && T.tts_audio.size === 1 && T.meta.size >= 1 && kv2.size === k0 && calls.length === nc2 + 1);
    const v2 = await g('/api/tts?t=' + encodeURIComponent('דִּין') + '&r=0.9');
    ok('D1: second request is a D1 hit', v2.status === 200 && calls.length === nc2 + 1 && Buffer.from(await v2.arrayBuffer()).toString().startsWith('MP3'));
    const key = [...T.tts_audio.keys()][0]; const bytes = T.tts_audio.get(key).bin; T.tts_audio.clear(); kv2.set(key, bytes);
    const v3 = await g('/api/tts?t=' + encodeURIComponent('דִּין') + '&r=0.9');
    ok('D1: old audio in KV is served without Google and copied to D1', v3.status === 200 && calls.length === nc2 + 1 && T.tts_audio.size === 1);
  }
  globalThis.fetch = realFetch;
  L.finish('worker', res);
})().catch(e => { console.log('FAIL crashed — ' + e.message); console.log('RESULT worker 0 1'); process.exitCode = 1; });
