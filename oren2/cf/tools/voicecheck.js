#!/usr/bin/env node
/* Pronunciation check of every game sentence in the game voice (Kore 0.9). Run after pregen.js.
   Lessons so far: Gemini that is told the intended text "hears" what it expects (it passed אחדות read as אַחְדוּת),
   and Chirp mostly ignores nikud — respellings work (אחדות → אחאדות). So:
   1. Gemini vocalizes every sentence by its meaning (text only, /api/tts/nikud, 25 a call) = the intended reading.
   2. Gemini transcribes the stored audio BLIND, with nikud (/api/tts/verify blind). Each word is compared by sound
      with the intended reading; a word that differs in two blind listens is a suspect.
   3. A suspect word that already has a chosen spelling in the dictionary is fixed at once (/api/tts/fix: the
      sentence made again under its original URL). Otherwise respelling variants go to the parent's page
      https://oren-game.pages.dev/api/tts/listen ("which one sounds right") — never applied on Gemini's word alone.
   4. The parent's choices (KV ttsvote) and the words he marked while listening (KV ttsmarks) are read on every run:
      choices are applied (word = dictionary + all its sentences made again; word#n = that sentence only),
      marked words get variants on the page.
   5. The summary goes to /api/tts/review (one KV write).
   Resumable: state in ~/.cache/oren-voicecheck/ (state.json, log.txt). Gemini paced to 8 a minute.
   Usage:  node oren2/cf/tools/voicecheck.js           apply choices, check new sentences, update both pages
           node oren2/cf/tools/voicecheck.js --pages   only apply choices + update the listening page and the review
           node oren2/cf/tools/voicecheck.js --again   check every sentence again
           node oren2/cf/tools/voicecheck.js --report  no network: coverage + static findings over every sentence (#405)
   Runs in CI after pregen (deploy.yml, #405), state kept in the Actions cache: every sentence gets checked over the days.
   #570: the full check runs once a day (a second run that day only applies choices + updates the pages) and stops
   while RESERVE (default 5) of each model's DAILY (default 20) Gemini calls are left for targeted runs (--pages).
   Env: SITE, PER_MIN (default 8), WRITES (KV writes this script may use a day, default 250), MAX_MIN (stop after n min)                    */
const path = require('path'), fs = require('fs'), os = require('os');
const MAIN = require.main === module;   // required by tests: only the functions, no run
if (MAIN && process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {   // Node's fetch reads the proxy only with this flag
  const c = require('child_process').spawn(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' } });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => c.kill(sig));
  c.on('exit', code => process.exit(code == null ? 1 : code)); return;
}
const SITE = (process.env.SITE || 'https://oren-game.pages.dev').replace(/\/$/, '');
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']; let mi = 0; const VOICE = 'he-IL-Chirp3-HD-Kore', RATE = 0.9;
const PER_MIN = +process.env.PER_MIN || 8, WRITES = +process.env.WRITES || 250, MAX_MIN = +process.env.MAX_MIN || 0;
const DAILY = +process.env.DAILY || 20, RESERVE = +process.env.RESERVE || 5;   // #570 Gemini calls a day per model; the sweep leaves RESERVE of them
const DIR = path.join(os.homedir(), '.cache', 'oren-voicecheck'); fs.mkdirSync(DIR, { recursive: true });
const STATE = path.join(DIR, 'state.json'), LOG = path.join(DIR, 'log.txt');
const PRE = path.join(os.homedir(), '.cache', 'oren-pregen');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = a => process.argv.includes(a);
const today = () => new Date().toISOString().slice(0, 10);
const qday = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });   // #570 Gemini's quota day: resets at midnight Pacific
const log = m => { const l = new Date().toISOString().slice(11, 19) + ' ' + m; console.log(l); fs.appendFileSync(LOG, l + '\n'); };
let S = { items: {}, nik: {}, applied: {}, queue: [], day: '', writes: 0 };
try { S = { ...S, ...JSON.parse(fs.readFileSync(STATE, 'utf8')) }; } catch (e) {}
const save = () => fs.writeFileSync(STATE, JSON.stringify(S));
if (S.day !== today()) { S.day = today(); S.writes = 0; }

/* ---- Hebrew helpers ---- */
const plain = s => s.replace(/[֑-ׇ]/g, '');
const tokens = s => (s.match(/[\u0590-\u05BD\u05BF-\u05FF]+/g) || [])   /* maqaf splits words */.filter(t => /[א-ת]/.test(t));
const mat = s => plain(s).replace(/[^א-ת]/g, '').replace(/[וי]/g, '').replace(/[ךםןףץ]/g, c => 'כמנפצ'['ךםןףץ'.indexOf(c)]);
const VW = { 'ִ': 'i', 'ֵ': 'e', 'ֶ': 'e', 'ַ': 'a', 'ָ': 'a', 'ֹ': 'o', 'ֺ': 'o', 'ֻ': 'u', 'ֱ': 'e', 'ֲ': 'a', 'ֳ': 'o', 'ׇ': 'o' };
const CN = { 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ו': 'v', 'ז': 'z', 'ח': 'k', 'ט': 't', 'י': 'y', 'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'פ': 'p', 'ף': 'p', 'צ': 'c', 'ץ': 'c', 'ק': 'k', 'ר': 'r', 'ת': 't' };
/* rough sound of a vocalized word; b/v k/kh p/f, ח/כ, ט/ת, א/ע/ה and shva are not told apart (transcription noise) */
function phon(w) {
  const n = w.normalize('NFD'), g = n.match(/[א-ת][֑-ׇ]*/g) || []; let out = '';
  g.forEach((x, i) => { const l = x[0], k = x.slice(1), v = [...k].map(c => VW[c] || '').join('');
    if (l === 'ו' && k.includes('ּ') && !v) { out += 'u'; return; }
    if (l === 'ו' && v === 'o') { out += 'o'; return; }
    if (l === 'י' && !v && i > 0) return;
    out += (l === 'ש' ? (k.includes('ׂ') ? 's' : 'S') : CN[l] || '') + v; });
  if (n[0] === 'ו') out = out.replace(/^(va|ve|vi|u)/, 'u');
  return out.replace(/(.)\1+/g, '$1');
}
/* the words whose sound differs between the intended reading and what was heard (tokens matched by their letters) */
function diff(intended, heard) {
  const A = tokens(intended), B = tokens(heard); const out = []; let j = 0;
  for (const a of A) { const k = B.slice(j, j + 4).findIndex(b => mat(b) === mat(a)); if (k < 0) continue;
    const b = B[j + k]; j += k + 1; if (phon(a) !== phon(b)) out.push({ word: plain(a), want: a.normalize('NFC'), heard: b }); }
  return out;
}
/* Gemini's vocalized text keeps every word of the game text in order (numbers may become words) */
function sameWords(t, v) { const B = tokens(v).map(mat), A = tokens(t).filter(w => plain(w).length >= 2).map(mat); let j = 0, hit = 0;
  for (const a of A) { const k = B.indexOf(a, j); if (k >= 0) { hit++; j = k + 1; } } return hit >= Math.ceil(A.length * 0.8); }
/* number words: checked and reported, never respelled (synth() makes them from digits) */
const NUMW = new Set('אפס אחד אחת שניים שתיים שתים שני שתי שלוש שלושה שלושת ארבע ארבעה ארבעת חמש חמישה חמשת שש שישה ששת שבע שבעה שבעת שמונה שמונת תשע תשעה תשעת עשר עשרה עשרים שלושים ארבעים חמישים שישים שבעים שמונים תשעים מאה מאות מאתיים אלף אלפים אלפיים'.split(' '));
const isNum = w => NUMW.has(w) || (w[0] === 'ו' && NUMW.has(w.slice(1)));
/* respelling variants for the parent: plain, vowel letters (a → א in an open syllable, like אחאדות; i → י; o/u → ו), nikud */
function variants(word, want) {
  const g = want.normalize('NFD').match(/[א-ת][֑-ׇ]*/g) || [];
  const isV = k => /[ִ-ׇֻ]/.test(k);
  const mk = all => g.map((x, i) => { const l = x[0], k = x.slice(1), n = g[i + 1]; if (!n || l === 'ו' || l === 'י') return l;
    const open = isV(n.slice(1)) || 'וי'.includes((g[i + 2] || ' ')[0]);
    if (/[ַָ]/.test(k) && !'אהע'.includes(n[0]) && (all || open)) return l + 'א';
    if (/ִ/.test(k) && n[0] !== 'י') return l + 'י';
    if (/[ֹֻ]/.test(k) && n[0] !== 'ו') return l + 'ו';
    return l; }).join('');
  const L = [word, mk(false), mk(true), want.normalize('NFC')].filter(v => v && /^[֑-״'\- ]{1,60}$/.test(v));
  return [...new Set(L)].slice(0, 4);
}

/* ---- site calls ---- */
let lastG = 0, gStreak = 0;
async function call(p, body) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(SITE + p, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const tx = await r.text(); let j = null; try { j = JSON.parse(tx); } catch (e) {} return { status: r.status, j, tx };
    } catch (e) { if (i >= 3) return { status: 0, j: null, tx: String(e) }; await sleep(5000 * (i + 1)); }
  }
}
class Stop extends Error {}
/* #570 the full sweep (CI, after every deploy) runs once a day and leaves a reserve of each model's daily calls,
   so targeted runs (--pages, the parent's picks, regen) still work on a day with many deploys */
const sweepDue = (st, day) => st.swept !== day;
const usedOf = (st, day, m) => (st.used && st.used.day === day && st.used[m]) || 0;
const mayCall = (st, day, m, sweep, daily = DAILY, reserve = RESERVE) => !sweep || usedOf(st, day, m) < daily - reserve;
function countCall(st, day, m) { if (!st.used || st.used.day !== day) st.used = { day }; st.used[m] = (st.used[m] || 0) + 1; }
const sweepNote = (why, n) => why === 'ran' ? 'sweep skipped: ran today' : `reserve kept: ${n} calls per model`;
let SWEEP = false;
async function gemini(p, body) {      // paced; another model when one is busy or at its daily limit (free tier: ~20 a day each)
  const live = () => MODELS.filter(m => (S.gone || {})[m] !== qday() && mayCall(S, qday(), m, SWEEP));
  if (SWEEP && !live().length) throw new Stop(sweepNote('reserve', RESERVE));
  const next = () => { const L = live(); if (!L.length) return false; mi = (L.indexOf(MODELS[mi]) + 1) % L.length; mi = MODELS.indexOf(L[mi]); return true; };
  if (!live().includes(MODELS[mi]) && !next()) throw new Stop('every Gemini model is at its daily limit');
  for (let i = 0, busy = 0; i < 12; i++) {
    const w = lastG + 60000 / PER_MIN - Date.now(); if (w > 0) await sleep(w); lastG = Date.now();
    countCall(S, qday(), MODELS[mi]); const { status, j, tx } = await call(p, { ...body, m: MODELS[mi] });
    if (j && j.res) { gStreak = 0; return j.res; }
    const why = String((j && (j.err || j.why || j.raw)) || tx);
    if (j && j.status === 429 && /per ?day|PerDay|daily|requests per day/i.test(why)) {
      S.gone = S.gone || {}; S.gone[MODELS[mi]] = qday(); save(); log(`  ${MODELS[mi]}: daily limit reached`);
      if (!next()) throw new Stop('every Gemini model is at its daily limit'); continue; }
    if (j && (j.status === 429 || j.status === 503 || j.status === 404)) {
      if (++gStreak > 40) throw new Stop('Gemini keeps refusing: ' + why.slice(0, 200));
      if (j.status === 404) { S.gone = S.gone || {}; S.gone[MODELS[mi]] = qday(); if (!next()) throw new Stop('no Gemini model'); continue; }
      if (++busy % 2 === 0 && next()) { log(`  gemini busy, trying ${MODELS[mi]}`); continue; }
      log(`  gemini ${j.status} (${MODELS[mi]}), waiting… ${why.slice(0, 80)}`); await sleep(20000 * Math.min(4, busy)); continue;
    }
    log(`  ${p} failed (${status}): ${why.slice(0, 160)}`);
    if (status >= 500 || status === 0 || (j && j.status >= 500)) { await sleep(20000); continue; }
    return null;
  }
  return null;
}
async function fix(t, words, only) {
  for (let i = 0; i < 4; i++) {
    const { status, j, tx } = await call('/api/tts/fix', { t, words: words || {}, only: only || {} });
    if (j && j.ok) { S.writes += 1 + (j.changed ? 1 : 0); S.dirty = 1; save(); await sleep(3500); return j; }   // Google: 20 a minute, shared
    log(`  fix failed (${status}): ${(j && j.why) || tx.slice(0, 160)}`);
    if (status === 502 || status === 429 || status === 0 || status >= 500) { await sleep(60000); continue; }
    return null;
  }
  return null;
}

/* ---- words known to be risky (homographs in a 1st-2nd grade game): the parent chooses, not Gemini ---- */
const RISKY = [
  { w: 'עשרת', want: 'עֲשֶׂרֶת', vars: ['עשרת', 'עֲשֶׂרֶת', 'אשרת'] },
  { w: 'ספרתי', want: 'סִפְרָתִי', vars: ['ספרתי', 'סִפְרָתִי', 'ספראתי'] },
  { w: 'ספרת', want: 'סִפְרַת', vars: ['ספרת', 'סִפְרַת', 'ספראת'] },
  { w: 'שארית', want: 'שְׁאֵרִית', vars: ['שארית', 'שְׁאֵרִית', 'שאירית'] },
  { w: 'כפול', want: 'כָּפוּל', vars: ['כפול', 'כָּפוּל', 'כאפול'] },
  { w: 'ישן', want: 'יָשֵׁן', vars: ['ישן', 'יָשֵׁן', 'יאשן'] },
  { w: 'פתח', want: 'פָּתַח', vars: ['פתח', 'פָּתַח', 'פאתח'] },
  { w: 'שמה', want: 'שָׂמָה', vars: ['שמה', 'סמה', 'סאמה'] },
  { w: 'רבע', want: 'רֶבַע', vars: ['רבע', 'רֶבַע', 'רעבע'] },
  { w: 'ספר', s: 'באיזו אות מתחילה המילה ספר', want: 'סֵפֶר', vars: ['ספר', 'סֵפֶר', 'סעפר'] },
  { w: 'ספר', s: 'בליילה הריאשון הוא ספר עשרה כוכבים.', want: 'סָפַר', vars: ['ספר', 'סָפַר', 'סאפאר'] },
  { w: 'ספר', s: 'ספר איזו תמונה מתאימה למלה?', want: 'סַפֵּר', vars: ['ספר', 'סַפֵּר', 'ספאר'] },
  // from the parent's spot-check notes (s = what is said after numbers become words, t = the game text = the audio key)
  { w: 'ושתי', t: '4 עשרות ו- 2 אחדות הן המספר:', s: 'ארבע עשרות ושתי אחדות הן המספר:', want: 'וּשְׁתֵּי', vars: ['ושתי', 'וּשְׁתֵּי', 'ושתיי', 'ו-שתי'], ctx: false, hint: '2 לא נשמע טוב' },
  { w: 'ממאה', t: 'מ-100 מורידים קודם עשרות, ואחר כך אחדות.', s: 'ממאה מורידים קודם עשרות, ואחר כך אחדות.', want: 'מִמֵּאָה', vars: ['ממאה', 'מִמֵּאָה', 'מ-מאה', 'ממיאה'], ctx: false, hint: '100' },
  { w: 'עשר', t: 'כותבים מספר מעל מספר. מתחילים מהאחדות, מימין. אים יוצא 10 או יותר, כותבים את האחדות ומעבירים 1 לעשרות.', s: 'כותבים מספר מעל מספר. מתחילים מהאחדות, מימין. אים יוצא עשר או יותר, כותבים את האחדות ומעבירים אחת לעשרות.', want: 'עֶשֶׂר', vars: ['עשר', 'עֶשֶׂר', 'עסר', 'אסר'], hint: '10 לא נשמע טוב' },
  { w: 'עשר', t: 'לדני יש 23 צדפים, ולמאייה יש 11 צדפים. כמה צדפים יש להם ביחד?', s: 'לדני יש עשרים ושלושה צדפים, ולמאייה יש אחד עשר צדפים. כמה צדפים יש להם ביחד?', want: 'עָשָׂר', vars: ['עשר', 'עָשָׂר', 'עסאר', 'עשאר'], hint: '23 ו 11' },
  { w: 'הכסא', s: 'החתול ישן על הכסא. מי ישן?', want: 'הַכִּסֵּא', vars: ['הכסא', 'הכיסא', 'הַכִּסֵּא'], ctx: false, hint: 'המילה כסא לא נכונה, זה צריך להיות כיסא', forms: { 'כסא': 'כיסא' } },
  { w: 'מידי', s: 'מתחילים מהאחדות. אים הספרה למעלה קטנה מידי, פורטים עשרת אחת ל-10 אחדות.', want: 'מִדַּי', vars: ['מידי', 'מדאי', 'מידאי', 'מִדַּי'], ctx: false },
  { w: 'ולמאייה', s: 'לדני יש 23 צדפים, ולמאייה יש 11 צדפים. כמה צדפים יש להם ביחד?', want: 'וּלְמָאיָה', vars: ['ולמאייה', 'ולמאיה', 'ולמאיא', 'ולמאי-יה'], ctx: false },
  { w: 'למלה', s: 'תפוח איזו תמונה מתאימה למלה?', want: 'לַמִּלָּה', vars: ['למלה', 'למילה', 'לַמִּלָּה'], ctx: false, hint: 'המילה מילה לא נכונה' },
];

let SAID = [], DICT = {};
const item = x => typeof x === 'string' ? { t: x.slice(0, 400).trim(), v: VOICE, r: RATE } : { t: String(x.t).slice(0, 400).trim(), v: x.v || VOICE, r: +x.r || RATE };
const id = it => it.v + '|' + it.r.toFixed(2) + '|' + it.t;
const has = (t, w) => tokens(t).includes(w);
const rec = t => { const k = id({ t, v: VOICE, r: RATE }); return S.items[k] || (S.items[k] = { t, v: VOICE, r: RATE, n: S.nik[t] || t }); };
function markFix(t, w, v) { const o = rec(t); o.note = (o.st === 'fix' && o.note ? o.note + ', ' : 'תוקן: ') + w + ' → ' + v; o.st = 'fix'; o.pend = (o.pend || []).filter(p => p.word !== w); }

/* which entry a vote answers, for the whole word (global) or one sentence, and whether its note gets new variants (ask).
   A follow-up (word#1xx) missing from this machine's queue (the state lives on the machine that made it) takes the scope
   of its word; it is never asked again from here. A 'none is right' that already has a follow-up is not asked again (#86). */
function voteScope(k, vo, queue, risky, votes) {
  const w = k.split('#')[0], q = queue.find(x => x.id === k);
  if (!q && /#1\d\d$/.test(k)) { const b = queue.find(x => x.id === w) || risky.find(r => r.w === w && !r.s && r.ctx !== true);
    return { q: b ? { ...b, id: k } : null, w, global: !!b, ask: false }; }
  const followed = Object.keys(votes || {}).some(x => x.startsWith(w + '#1') && /#1\d\d$/.test(x) && ((votes[x] || {}).at || 0) >= (vo.at || 0) && x !== k);
  return { q, w, global: q && 'global' in q ? q.global : !k.includes('#'), ask: !!q && !followed && ((vo.half || []).length > 0 || !!vo.note) };
}

/* the parent's choices: word → that spelling in the dictionary, for every prefixed form, all its sentences made again;
   word#n → that sentence only; '' → none of the variants is right */
async function applyVotes() {
  const { j } = await call('/api/tts/listen/data?marks'); if (!j) return { marks: [], votes: {} };
  for (const [k, raw] of Object.entries(j.votes || {})) {
    const vo = typeof raw === 'string' ? { v: raw, half: [], note: '' } : raw, v = vo.v, sig = String(vo.at || v);
    if (k in S.applied && S.applied[k] === sig) continue;
    const { q, w, global, ask } = voteScope(k, vo, [...(S.queue || []), ...(j.choose || [])], RISKY, j.votes);
    if (!v && ask) {          // half right / a comment: new respellings that follow it
      const r = await gemini('/api/tts/respell', { w, s: q.s, want: q.want, tried: q.vars, half: vo.half, note: vo.note });
      const fresh = (Array.isArray(r) ? r : []).map(x => String(x).trim()).filter(x => /^[\u05D0-\u05EA'\-]{1,40}$/.test(x) && !q.vars.includes(x));
      const own = tokens(vo.note || '').map(plain).filter(x => x !== w && x[0] === w[0] && Math.abs(x.length - w.length) <= 2);   // a spelling he wrote himself comes first
      const vars = [...new Set([...own, ...(vo.half || []), ...fresh])].slice(0, 4);
      S.retry = S.retry || []; const nid = w + '#' + (100 + S.retry.length);
      if (vars.length) S.retry.push({ id: nid, w, s: q.s, want: q.want, vars, global, t: q.t, forms: q.forms, hint: vo.note || 'חצי נכון: ' + vo.half.join(', ') });
      S.applied[k] = sig; log(`choice ${k}: half/comment "${vo.note}" → new variants ${vars.join(', ')}`); save(); continue; }
    if (v === w) { S.applied[k] = sig; if (q && (q.t || q.s)) { const o = rec(q.t || q.s); if (!o.st) o.st = 'ok'; } log(`choice ${k}: as it is`); save(); continue; }   // the plain one is right
    if (!v) { S.applied[k] = sig; if (q && (q.t || q.s)) { const o = rec(q.t || q.s); o.st = 'bad'; o.note = w + ': אף גרסה לא נשמעה נכון — צריך לבדוק'; } log(`choice ${k}: none is right`); save(); continue; }
    if (S.writes + 3 > WRITES) { log('write budget for today used up; the other choices are applied next run'); break; }
    if (!global) { if (!q) continue; const r = await fix(q.t || q.s, {}, { [w]: v }); if (r) { S.applied[k] = sig; markFix(q.t || q.s, w, v); log(`choice ${k} → ${v}: ${r.sent}`); } save(); continue; }
    const forms = { [w]: v }; for (const [f, fv] of Object.entries((q && q.forms) || {})) forms[f] = fv;   // only forms listed by hand: מפתח is not מ+פתח
    // (no automatic prefixed forms)
    const L = SAID.filter(x => x.v.startsWith('he-') && (tokens(x.t).some(t => t in forms) || (q && q.t === x.t)));   // q.t: a word made from digits
    log(`choice ${w} → ${v}: ${Object.keys(forms).join(', ')} in ${L.length} sentences`);
    let first = true, all = true;
    for (const x of L) { if (S.writes + 1 > WRITES) { all = false; break; } const r = await fix(x.t, first ? forms : {}, {}); if (!r) { all = false; break; } first = false; markFix(x.t, w, v); }
    if (all && L.length) S.applied[k] = sig; save();
  }
  return { marks: j.marks || [], votes: j.votes || {} };
}

/* the listening page: words to choose a spelling for, then sentences to spot-check (risky first) */
async function pages(votes, marks) {
  const old = S.queue || [], choose = [], seen = new Set();
  const add = (w, s, want, vars, ctx, hint, x) => { const key = ctx ? w + '|' + s : w; if (seen.has(key)) return; seen.add(key);
    if (!ctx && DICT[w]) return;                                          // already in the dictionary
    const C = old.filter(x => x.w === w && (!ctx || x.s === s) && !/#1\d\d$/.test(x.id) && !!x.id.includes('#') === ctx), o = C[0];
    if (C.some(x => x.id in S.applied)) return;                          // already chosen (a follow-up with new variants may be queued)
    choose.push({ id: o ? o.id : (ctx ? w + '#' : w), w, s, want, vars, global: !ctx, hint: hint || undefined, ...(x || {}) }); };
  // the intended reading of the sentences the parent flagged (one Gemini call), so their variants make sense
  const flagged = [...new Set((marks || []).filter(m => !m.ok && (m.w || []).length && !S.nik[m.t]).map(m => m.t))].slice(0, 25);
  if (flagged.length) { try { const r = await gemini('/api/tts/nikud', { texts: flagged }); if (Array.isArray(r) && r.length === flagged.length) flagged.forEach((t, q) => { if (typeof r[q] === 'string' && sameWords(t, r[q])) S.nik[t] = r[q]; }); save(); } catch (e) { if (!(e instanceof Stop)) throw e; } }
  for (const r of RISKY) { const s = r.s || (SAID.find(x => has(x.t, r.w)) || {}).t; if (s) add(r.w, s, r.want, r.vars, r.ctx != null ? r.ctx : !!r.s, r.hint, r.t ? { t: r.t, forms: r.forms } : r.forms ? { forms: r.forms } : null); }
  for (const x of Object.values(S.items)) for (const p of (x.pend || []).filter(p => !isNum(p.word))) add(p.word, x.t, p.want, variants(p.word, p.want), false);
  for (const m of marks || []) { if (m.ok) continue;
    if (!(m.w || []).length && m.note) { const o = rec(m.t); o.st = 'bad'; o.note = 'הערת ההורה: ' + m.note; }
    for (const w0 of m.w || []) { const w = plain(w0); if (isNum(w)) { const o = rec(m.t); o.st = 'bad'; o.note = 'מספר: ' + w + (m.note ? ' — ' + m.note : ''); continue; }
      const want = (tokens(S.nik[m.t] || '').find(t => plain(t) === w)) || w; add(w, m.t, want, variants(w, want), false, m.note); } }
  for (const r of S.retry || []) if (!(r.id in S.applied)) choose.push(r);
  for (const o of old) if (!choose.some(c => c.id === o.id) && o.id in (votes || {})) choose.push(o);   // keep answered ones findable
  const ids = new Set(choose.filter(c => !c.id.endsWith('#')).map(c => c.id)); let n = 1;
  for (const c of choose) if (c.id.endsWith('#')) { while (ids.has(c.w + '#' + n)) n++; c.id = c.w + '#' + n; ids.add(c.id); }
  S.queue = choose;
  // spot-check: risky sentences first (math words, homographs, numbers, short items, English), then a random sample
  const RISK = /עשרות|אחדות|מאות|ספר|עשר|שארית|כפול|חילוק|חיסור|חיבור|שווה|שוה|זוגי|חצי|רבע|שליש|ישן|פתח|שמה|אחר|שמונה/;
  const score = x => (/\d/.test(x.t) ? 6 : 0) + (x.st === 'bad' ? 9 : 0) + (x.st === 'fix' ? 5 : 0) + (RISK.test(x.t) ? 3 : 0) + (/\d/.test(x.t) ? 1 : 0) + (tokens(x.t).length <= 2 ? 2 : 0) + (/[A-Za-z]/.test(x.t) ? 2 : 0);
  const pool = SAID.map(x => ({ x, s: score({ ...x, ...(S.items[id(x)] || {}) }) + Math.random() })).sort((a, b) => b.s - a.s);
  const risky = pool.filter(p => p.s >= 3).slice(0, 30).map(p => p.x), rest = pool.filter(p => p.s < 3).sort(() => Math.random() - .5).slice(0, 40 - risky.length).map(p => p.x);
  const sample = [...risky, ...rest].map(x => ({ t: x.t, v: x.v, r: x.r }));
  const { j } = await call('/api/tts/listen/q', { choose, sample }); S.writes++; save();
  log(`listening page: ${choose.filter(c => !(c.id in (votes || {}))).length} words to choose, ${sample.length} sentences → ${SITE}/api/tts/listen ${j && j.ok ? '' : '(failed)'}`);
}
/* new audio under old URLs: bump the version the game puts in its URLs (&k=ver), so devices fetch it again */
async function bump() { if (!S.dirty) return; const { j } = await call('/api/tts/ver', {}); if (j && j.ok) { S.dirty = 0; S.writes++; save(); log(`audio version → ${j.ver}`); } }
async function review() {
  const L = Object.values(S.items).filter(x => ['ok', 'fix', 'bad'].includes(x.st)).map(x => ({ t: x.t, n: x.n || x.t, st: x.st, note: x.note || '', v: x.v, r: x.r }));
  const order = { bad: 0, fix: 1, ok: 2 }; L.sort((a, b) => order[a.st] - order[b.st]);
  const { status, j } = await call('/api/tts/review', L); S.writes++; save();
  log(`review: ${L.length} sentences (${status} ${j && j.ok ? 'ok' : 'failed'}) → ${SITE}/api/tts/review`);
}

/* one sentence: blind listen (twice when something differs), compare with the intended reading */
async function check(it) {
  const want = S.nik[it.t], listen = () => gemini('/api/tts/verify', { t: it.t, v: it.v, r: it.r, blind: 1 });
  const h1 = await listen(); if (!h1 || !h1.heard) return { st: 'err' };
  if (it.v.startsWith('en-')) { const n = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return n(h1.heard) === n(it.t) ? { st: 'ok', n: h1.heard } : { st: 'bad', n: it.t, note: 'נשמע: ' + h1.heard }; }
  if (!want) return { st: 'ok', n: h1.heard, note: 'לא נבדק מול ניקוד' };
  let d = diff(want, h1.heard); if (!d.length) return { st: 'ok', n: want };
  const h2 = await listen(); if (!h2 || !h2.heard) return { st: 'err' };
  const d2 = diff(want, h2.heard); d = d.filter(x => d2.some(y => y.word === x.word && phon(y.heard) === phon(x.heard)));
  if (!d.length) return { st: 'ok', n: want };                         // the two listens disagree: transcription noise
  const note = d.map(x => `${x.word}: נשמע ${x.heard} במקום ${x.want}`).join('; ');
  if (d.every(x => DICT[x.word]) && S.writes + 1 <= WRITES) {          // the dictionary already knows them: make it again
    if (await fix(it.t, {}, {})) { const h3 = await listen();
      if (h3 && h3.heard && !diff(want, h3.heard).length) return { st: 'fix', n: want, note: 'תוקן: ' + d.map(x => x.word + ' → ' + DICT[x.word]).join(', ') }; }
  }
  return { st: 'bad', n: want, note: note + ' — לבחירה בדף ההאזנה', pend: d.map(x => ({ word: x.word, want: x.want })) };
}

/* #405: what to listen to = every sentence of the pregen list not checked yet (plain, English, not only risky/new ones) */
const todo = (said, items, again) => said.filter(x => { const o = items[id(x)]; return again || !o || !o.st || o.st === 'err' || (o.st === 'fix' && !o.at); });
/* #405: a static pass over every sentence (no network): what the voice is likely to misread.
   spell = a spelling the voice reads wrong (fix it at the source); num-noun = a digit before a plural noun the worker's
   number gender list (NG in make_worker.py) does not know (the number may get the wrong gender); risky = a homograph
   the parent picks on the listening page; latin = Latin letters inside a Hebrew sentence */
const SPELL = { 'שוה': 'שווה', 'מלה': 'מילה', 'למלה': 'למילה', 'המלה': 'המילה', 'כסא': 'כיסא', 'הכסא': 'הכיסא', 'מידי': 'מדי' };
function readNG() { const g = {}; try { const s = fs.readFileSync(path.join(__dirname, 'make_worker.py'), 'utf8');
  for (const m of s.matchAll(/add\('([^']+)','([mf])'\)/g)) for (const w of m[1].split(' ')) g[w] = m[2]; } catch (e) {} return g; }
function lint(t, ng) {
  const out = [], P = plain(t), W = tokens(P);
  for (const w of W) if (SPELL[w]) out.push({ rule: 'spell', word: w, fix: SPELL[w] });
  for (const m of P.matchAll(/\d+\s+([א-ת]+)/g)) { const n = m[1]; if (/(ים|ות|יים)$/.test(n) && !ng[n]) out.push({ rule: 'num-noun', word: n }); }
  const R = new Set(RISKY.map(r => r.w)); for (const w of W) if (R.has(w)) out.push({ rule: 'risky', word: w });
  if (/[א-ת]/.test(P) && /[A-Za-z]/.test(P)) out.push({ rule: 'latin', word: (P.match(/[A-Za-z]+/) || [''])[0] });
  return out.filter((f, i) => out.findIndex(g => g.rule === f.rule && g.word === f.word) === i);
}
/* the findings list (markdown): coverage of the pregen list, then each finding with its sentences */
function report(said, items, ng) {
  const he = said.filter(x => x.v.startsWith('he-')), done = said.filter(x => { const o = items[id(x)]; return o && ['ok', 'fix', 'bad'].includes(o.st); });
  const F = {}; for (const x of he) for (const f of lint(x.t, ng)) { const k = f.rule + ' ' + f.word; (F[k] = F[k] || { ...f, s: [] }).s.push(x.t); }
  const bad = said.filter(x => (items[id(x)] || {}).st === 'bad');
  const L = [`voicecheck: ${said.length} sentences in the pregen list · ${done.length} checked · ${said.length - done.length} to check`, ''];
  const names = { spell: 'spelling the voice misreads', 'num-noun': 'number before a noun of unknown gender', risky: 'homograph (parent picks on the listen page)', latin: 'Latin letters in Hebrew' };
  for (const r of Object.keys(names)) { const G = Object.values(F).filter(f => f.rule === r).sort((a, b) => b.s.length - a.s.length); if (!G.length) continue;
    L.push(`### ${names[r]} (${G.length})`); for (const f of G) L.push(`- ${f.word}${f.fix ? ' → ' + f.fix : ''} · ${f.s.length}× · e.g. ${f.s[0].slice(0, 90)}`); L.push(''); }
  if (bad.length) { L.push(`### heard wrong (${bad.length})`); for (const x of bad) L.push(`- ${x.t.slice(0, 90)} — ${(items[id(x)] || {}).note || ''}`); L.push(''); }
  return L.join('\n');
}
if (!MAIN) module.exports = { voteScope, variants, diff, todo, lint, report, sweepDue, mayCall, countCall, sweepNote, qday };
else (async () => {
  try { SAID = JSON.parse(fs.readFileSync(path.join(PRE, 'said.json'), 'utf8')).map(item).filter(x => x.t); } catch (e) { log('no said.json — run pregen.js --collect first'); return; }
  const rep = () => { const r = report(SAID, S.items, readNG()); console.log(r); if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Voice check\n\n' + r + '\n'); };
  if (arg('--report')) return rep();   // no network: the findings list over every sentence
  let made = {}; try { made = JSON.parse(fs.readFileSync(path.join(PRE, 'state.json'), 'utf8')).done || {}; } catch (e) {}
  DICT = (await call('/api/tts/fix')).j || {};
  let { marks, votes } = await applyVotes(); await bump(); DICT = (await call('/api/tts/fix')).j || DICT;
  await pages(votes, marks);
  if (arg('--pages')) return review();
  const note = m => { log(m); if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, m + '\n\n'); };
  if (!sweepDue(S, qday()) && !arg('--again')) { note(sweepNote('ran')); await review(); return rep(); }   // #570 once a day
  S.swept = qday(); save(); SWEEP = true;
  // 0. make again the sentences made before synth() learned numbers in words and dropping emoji (one write each)
  const RG = S.regen || {}, REGEN = 'num2', R = SAID.filter(x => x.v.startsWith('he-') && made[x.t] && (((/\d/.test(x.t) || /\p{Extended_Pictographic}/u.test(x.t)) && !RG[x.t]) || (/[\u2190-\u21FF]/.test(x.t) && RG[x.t] !== 'num2')));   // num2: arrows → a pause
  S.regen = S.regen || {}; let rn = 0;
  for (const x of R) { if (S.writes + 1 > WRITES) { log(`regen: write budget used up, ${R.length - rn} left for the next run`); break; }
    const r = await fix(x.t, {}, {}); if (!r) { log('regen stopped (KV/Google refused)'); break; } S.regen[x.t] = REGEN; rn++;
    const o = S.items[id(x)]; if (o && o.at) o.at = 0; save(); }
  if (R.length) log(`regen: ${rn}/${R.length} sentences with numbers/emoji made again`); await bump();
  try {
    // 1. what to listen to: risky ones first (numbers, math words, what the parent flagged), made ones before not-yet-made
    const RISK = /עשרות|אחדות|מאות|ספר|עשר|שארית|כפול|חילוק|חיסור|חיבור|שווה|שוה|זוגי|חצי|רבע|שליש|ישן|פתח|שמה|אחר|שמונה/;
    const pr = x => (/\d/.test(x.t) ? 4 : 0) + (RISK.test(x.t) ? 3 : 0) + (tokens(x.t).length <= 2 ? 1 : 0) + (made[x.t] ? 2 : 0);
    const Q = todo(SAID, S.items, arg('--again')).sort((a, b) => pr(b) - pr(a));
    log(`voicecheck: ${Q.length} to check of ${SAID.length}; dictionary ${Object.keys(DICT).length} words; ${S.writes}/${WRITES} writes today`);
    // 2. the intended reading (Gemini vocalizes by meaning, 25 a call), just before those sentences are listened to
    const nikud = async k => { const L = Q.slice(k, k + 25).filter(x => x.v.startsWith('he-') && !S.nik[x.t]).map(x => x.t); if (!L.length) return;
      const r = await gemini('/api/tts/nikud', { texts: L });
      if (Array.isArray(r) && r.length === L.length) L.forEach((t, q) => { if (typeof r[q] === 'string' && sameWords(t, r[q])) S.nik[t] = r[q]; }); save(); };
    let n = 0; const T0 = Date.now();
    for (const it of Q) {
      if (MAX_MIN && Date.now() - T0 > MAX_MIN * 60000) throw new Stop(`time box of ${MAX_MIN} min used up`);   // CI: stop before the job's timeout
      if (n % 25 === 0) await nikud(n);
      n++; if (!made[it.t]) S.writes += 2;
      const r = await check(it); const o = S.items[id(it)] || {};
      S.items[id(it)] = { t: it.t, v: it.v, r: it.r, st: r.st, n: r.n, note: r.note || '', pend: r.pend || [], at: Date.now() };
      if (o.st === 'fix' && r.st === 'ok') { S.items[id(it)].st = 'fix'; S.items[id(it)].note = o.note; }   // fixed by a choice, now heard right
      save(); log(`${n}/${Q.length} ${r.st.padEnd(3)} ${it.t.slice(0, 70)}${r.note ? '  — ' + r.note : ''}`);
      if (n % 20 === 0) { const c = {}; for (const x of Object.values(S.items)) c[x.st] = (c[x.st] || 0) + 1;
        log(`progress ${n}/${Q.length} · ${Math.round((Date.now() - T0) / 60000)} min · ${JSON.stringify(c)} · writes ${S.writes}`);
        SWEEP = false; const nv = await applyVotes(); await bump(); DICT = (await call('/api/tts/fix')).j || DICT; marks = nv.marks; votes = nv.votes; await pages(votes, marks); SWEEP = true; }   // the parent may be choosing right now
    }
  } catch (e) { if (!(e instanceof Stop)) throw e; log('stopped: ' + e.message + ' — run again later to continue'); }
  SWEEP = false; note(sweepNote('reserve', RESERVE));
  await bump(); await pages(votes, marks); await review();
  const c = {}; for (const x of Object.values(S.items)) c[x.st] = (c[x.st] || 0) + 1;
  log('done: ' + JSON.stringify(c) + ' · dictionary: ' + JSON.stringify(DICT));
  rep();
})().catch(e => { log('crashed: ' + (e && e.stack || e)); save(); process.exitCode = 1; });
