#!/usr/bin/env node
/* Create every game sentence in the Google voice IN ADVANCE, so Oren never waits for a new sentence.
   1. collect: runs the built game (oren2/index.html) in a headless browser with a fake Audio and records every
      text the game sends to /api/tts, while driving all screens and activities; plus a static pass over the finite
      data (worlds, intro, quests, words, sentences, stories), each through the page's own fullSpell, so the texts
      are exactly what the client sends. Random math questions are skipped (made on demand, then cached),
      except the math sentence set (#402: every question of the small math units).
   2. upload: POST /api/tts/pregen on the site, 15 texts per call, at most 15 new sentences a minute (Google quota),
      stops after 400 new sentences a day (Cloudflare KV free tier: 1000 writes/day, shared with family saves and the
      site's own queue of up to 300 a day) and hands the rest to the site's queue (/api/tts/queue).
      Resumable: state in ~/.cache/oren-pregen/ (done texts + today's count). Run it again tomorrow to continue.
   Usage:  node oren2/cf/tools/pregen.js              collect + upload to https://oren-game.pages.dev
           node oren2/cf/tools/pregen.js --collect    collect only (prints count)      --upload  upload last list only
           SITE=https://... node oren2/cf/tools/pregen.js                                                           */
const path = require('path'), fs = require('fs'), os = require('os');
if (require.main === module && process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {   // Node's fetch reads the proxy only with this flag
  const c = require('child_process').spawn(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => c.kill(sig));
  c.on('exit', code => process.exit(code == null ? 1 : code)); return;
}
const ROOT = path.resolve(__dirname, '..', '..');                  // oren2/
const SITE = (process.env.SITE || 'https://oren-game.pages.dev').replace(/\/$/, '');
const DIR = path.join(os.homedir(), '.cache', 'oren-pregen'); if (require.main === module) fs.mkdirSync(DIR, { recursive: true });
const LIST = path.join(DIR, 'said.json'), STATE = path.join(DIR, 'state.json');
const DAY_MAX = 400, PER_MIN = 15, BATCH = 15;
/* a sentence: plain text = game voice (Kore 0.9), else {t,v,r} (e.g. English: Despina 0.85) */
const GV = 'he-IL-Chirp3-HD-Kore', GR = 0.9;
const txt = x => typeof x === 'string' ? x : x.t, idOf = x => typeof x === 'string' ? x : x.v + '|' + x.r + '|' + x.t;
const norm = x => { if (!x) return null; const o = typeof x === 'string' ? { t: x } : x; const t = String(o.t || '').slice(0, 400).trim(); if (!t) return null;
  const v = o.v || GV, r = +o.r || GR; return v === GV && r === GR ? t : { t, v, r }; };
const post = async (u, body) => { const r = await fetch(SITE + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = a => process.argv.includes(a);

/* a pure-data array literal from a source file: const NAME=[ ... ]; */
function literal(file, name) {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8'); const i = s.indexOf('const ' + name + '=['); if (i < 0) return [];
  let j = s.indexOf('[', i), d = 0, q = null;
  for (let k = j; k < s.length; k++) { const c = s[k];
    if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') q = c; else if (c === '[') d++; else if (c === ']' && --d === 0) {
      try { return new Function('return ' + s.slice(j, k + 1))(); } catch (e) { console.log('skip', name, e.message); return []; } } }
  return [];
}

/* random math questions (new numbers every time) are skipped: made on first use, then cached */
const RANDOM = /שווה כמה|כמה שווה|ועוד כמה|כמה כפול|פותרים במאונך|^מה השעה\?|קטן, שווה, גדול$|^\d+ \? \d+|בבוקר, ועוד \d+|(התשובה|זריקה|לשחות)\. \d|חילק \d+|^‎?\d+ : \?|המבלבל חטף|בבוקר, ועוד|בכל שורה יש .* שורות\?|שווה בשווה ל|כמה עגולים ציי?רת\?$/;   /* #416: the story word problems (numbers said as words); the draw paper task */
/* static pass: finite data through the client's own text path (fullSpell, then the same 400-char parts, #401); runs in the page.
   D = { SENT, STORIES, INTRO } (literal() of talents.js / index.html). Also used by tests/voice-audit.test.js (#406). */
const STATIC = D => { const O = window.OREN, T = window.TAL, out = [], sp = s => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const add = s => { if (s && /[א-ת]/.test(s)) out.push(...window.__ttsParts(window.__fullSpell(s))); };   // #401: the same parts the game asks for
  (D.INTRO || []).forEach(x => add(x[1])); add('אוֹרֶן, אַתָּה אַלּוּף הַחֶשְׁבּוֹן שֶׁל אֶרֶץ הַבְּלוֹקִים!');
  O.WORLDS.forEach(w => { (w.intro || []).forEach(add); (w.outro || []).forEach(add); add(w.say); });
  (T.TOG || []).forEach(a => add(sp(typeof a.kid === 'function' ? a.kid('') : a.kid))); Object.values(T.RW || {}).forEach(r => add(sp(r.t)));
  (T.WORDS || []).forEach(w => add(sp(w.w)));
  /* English words and letters (eng-word, eng-listen, eng-letter) in the English game voice */
  (T.WORDS || []).filter(w => w.en).forEach(w => [w.en, w.en[0].toUpperCase() + '. ' + w.en].forEach(t => window.__ttsParts(sp(t)).forEach(t => out.push({ t, v: 'en-US-Chirp3-HD-Despina', r: 0.85 }))));
  ['זמן לנוח. כל הכבוד היום, אורן! נתראה מחר.', 'הזמן של היום נגמר. כל הכבוד היום, אורן! נתראה מחר.', 'עוד דקה אחת לסיום היום', ...[2, 3, 4, 5].map(n => `עוד ${n} דקות לסיום היום`)].forEach(add);
  (D.SENT || []).forEach(s => { add(s[0]); add(s[1]); });
  (D.STORIES || []).forEach(st => { add(st.t); st.s.forEach(add); st.q.forEach(q => add(q[0])); });
  /* the content packs: their own lists of what they say */
  const W = window, tryf = f => { try { f(); } catch (e) {} };
  tryf(() => (T.STORIES || []).forEach(st => { add(st.t); st.s.forEach(add); st.q.forEach(q => add(q[0])); }));
  tryf(() => W.READBANK2.speakList().forEach(add));
  tryf(() => T.storyWordList().forEach(add));   /* #420: a word tapped in a story is said alone; the "words we will meet" card */
  tryf(() => W.GAPS.speakList().forEach(add));   /* rhymes (#419) */
  tryf(() => W.EXPLORE2.kidTexts().forEach(s => add(sp(s))));
  tryf(() => { const fv = new Set(W.FRIEND.voiceList ? W.FRIEND.voiceList() : []); W.FRIEND.speakList().filter(s => !fv.has(s)).forEach(s => add(sp(s))); });   /* #53 the friend's own lines: below, in his voice */
  tryf(() => W.FRIEND.voiceList().forEach(s => { s = sp(s); if (/[א-ת]/.test(s)) window.__ttsParts(window.__fullSpell(s)).forEach(t => out.push({ t, v: W.FRIEND.VOICE, r: 0.9 })); }));   /* #53 the friend's own voice */
  tryf(() => W.OREN.WARD_SAY.forEach(s => add(sp(s))));   /* the wardrobe lines (#662) */
  tryf(() => (window.OREN.friendTexts()).forEach(s => add(sp(s))));   /* #661 the friend's names, ages and lock hints */
  tryf(() => window.OREN.FNAME.forEach(n => window.OREN.FAGE.forEach(a => add(sp(n + ', גִּיל ' + a[1])))));
  tryf(() => W.BW.speakList().forEach(s => add(sp(s))));   /* the building world (#64) */
  tryf(() => W.HELP.allTexts().forEach(s => add(sp(s))));
  tryf(() => W.LESSONS.speakList().forEach(s => add(sp(s))));
  tryf(() => W.HEALTH.remTexts().forEach(add));
  tryf(() => W.PDAY.speakList().forEach(add));   /* the parent's skip / new day (#648) */
  tryf(() => T.choiceList().forEach(add));   /* #266 choice screens: each opening and each choice is its own clip */
  tryf(() => W.ENGLISH2.speakList().forEach(t => { t = sp(t); if (/[א-ת]/.test(t)) add(t); else if (t) window.__ttsParts(t).forEach(t => out.push({ t, v: 'en-US-Chirp3-HD-Despina', r: 0.85 }, { t, v: 'en-US-Chirp3-HD-Despina', r: 0.7 })); }));   /* r 0.7: the slow replay, a second tap on the speaker (#425) */
  return out; };

async function collect() {
  const { chromium } = require('playwright');
  const page = path.join(os.tmpdir(), 'oren-pregen-page.html');
  fs.writeFileSync(page, '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') + '</body></html>');
  const DATA = { SENT: literal('talents.js', 'SENT'), STORIES: literal('talents.js', 'STORIES'), INTRO: literal('index.html', 'INTRO') };
  const SAID = new Map(), MATHS = new Map(); const b = await chromium.launch();
  for (const vp of [{ viewport: { width: 1366, height: 768 } }, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]) {
    const ctx = await b.newContext(vp);
    await ctx.addInitScript(() => { window.__noFamily = true; try { localStorage.clear(); } catch (e) {} window.__said = [];
      window.Audio = function (u) { if (u && u.startsWith('/api/tts?')) { const q = new URLSearchParams(u.split('?')[1]); window.__said.push({ t: q.get('t'), v: q.get('v'), r: +q.get('r') }); }
        const a = { play: () => { setTimeout(() => { a.onplaying && a.onplaying(); a.onended && a.onended(); }, 5); return Promise.resolve(); }, pause() {}, addEventListener() {} }; return a; };
      setInterval(() => { if (window.__gv) window.__gv.ok = true; }, 50);
      /* press every "read to me" on the screen: the HUD 🔊, the dialog 🔊 and each small 🔊 of the reading helper */
      window.__sweep = () => { for (const s of ['#btnSay', '#dSay']) { const x = document.querySelector(s); if (x && x.offsetParent) x.click(); }
        document.querySelectorAll('.rdb').forEach(x => { if (x.offsetParent) x.click(); }); }; });
    const p = await ctx.newPage(); await p.goto('file://' + page); await p.waitForFunction(() => window.TAL && window.TAL.S, null, { timeout: 20000 }); await sleep(800);
    const T0 = Date.now(), log = m => console.log(`  [${Math.round((Date.now() - T0) / 1000)}s] ${m}`);
    const run = (f, ms = 8000) => Promise.race([p.evaluate(f), sleep(ms).then(() => { throw new Error('slow'); })]);
    const ev = async (f, w = 400, ms) => { try { await run(f, ms); } catch (e) {} await sleep(w); if (w >= 200) try { await run(() => window.__sweep()); } catch (e) {} };
    const prep = `(()=>{const O=window.OREN,T=window.TAL;O.save.story.intro=1;O.save.gems=120;T.S().prof={an:'dragon',col:'#8e6fd1',love:'code'};})()`;
    await ev(prep); await ev(`window.OREN.showMap()`);
    await ev(`(()=>{window.TAL.S().prof=null;window.TAL.profile(window.OREN.showMap);})()`); await ev(prep);
    // home: first-time tour, "what do you feel like today?", something else, the path, the story ending, the together suggestion
    for (let d = 0; d < 3; d++) {
      await ev(`(()=>{const T=window.TAL;T.S().coach={};delete T.S().daily;window.OREN.showMap();})()`, 1500);
      await ev(`(async()=>{for(let i=0;i<16;i++){const t=document.querySelector('.tour');if(!t)break;t.click();await new Promise(r=>setTimeout(r,300));}})()`, 300, 10000);
      await ev(`window.TAL.otherDay()`, 300);
      await ev(`(()=>{window.OREN.showMap();const c=document.querySelectorAll('#sHome .dcard');c.length&&c[${d}%c.length].click();})()`, 300);
      await ev(`(()=>{const d=window.TAL.dailyEnsure();d.done=d.done.map(()=>1);d.claimed=0;d.sg=0;d.t=d.t.filter(x=>!/^tog:/.test(x));d.done=d.t.map(()=>1);window.OREN.showMap();})()`, 300);
      await ev(`document.querySelector('#sHome .bigbtn.huge')&&document.querySelector('#sHome .bigbtn.huge').click()`, 300);
      await ev(`(()=>{const b=document.querySelector('#ov .bigbtn');b&&b.click();})()`, 300);
      await ev(`(()=>{document.querySelector('#ov').hidden=true;window.TAL.S().daily.claimed=1;window.OREN.showMap();})()`, 300); }
    log('home done');
    // journey: worlds and every level start
    await ev(`(async()=>{const O=window.OREN;O.save.story={intro:1};for(const w of O.WORLDS){O.showWorld(w);await new Promise(r=>setTimeout(r,150));window.__sweep();document.querySelector('#dlg').hidden=true;}})()`, 500, 60000);
    await ev(`(async()=>{const O=window.OREN,G=window.__oren4;for(const lv of O.ALLLV){try{if(lv.type==='learn'){delete O.save.seen[lv.u.id];O.startLevel(lv);}else G.playLevel(lv);}catch(e){}await new Promise(r=>setTimeout(r,80));window.__sweep();}})()`, 25000);
    await ev(`window.OREN.showJourney()`, 1500); await ev(`window.OREN.kingdom()`, 1500); await ev(`window.OREN.studio(false)`);
    log('journey done');
    // city: hub, groups, buildings, every activity a few times (answers right; each new question is read)
    await ev(`window.TAL.openHub()`, 1500); for (let g = 0; g < 4; g++) await ev(`window.TAL.openGroup(window.TAL.GROUPS[${g}])`);
    const acts = await p.evaluate(() => window.TAL.BUILD.flatMap(b => [['B', b.id], ...b.acts.map(a => ['A', a.id])]));
    for (const [k, id] of acts) {
      if (k === 'B') { log('building ' + id); await ev(`window.TAL.openBuilding(window.TAL.BUILD.find(b=>b.id==='${id}'))`, 250); continue; }
      for (let rep = 0; rep < (vp.isMobile ? 1 : 3); rep++) {
        await ev(`(()=>{document.querySelector('#ov').hidden=true;const a=window.TAL.ACT['${id}'];if(!a.avail||a.avail())a.run(()=>{});})()`, 300);
        for (let k2 = 0; k2 < 40; k2++) {
          await ev(`(()=>{window.__sweep();const q=window.__quiz;if(q&&q.wrap.isConnected){const c=q.wrap.querySelector('.chs');if(c&&c.children[q.ans]){window.__fast=true;c.children[q.ans].click();window.__fast=false;}return;}
            const b=[...document.querySelectorAll('#sTal .bigbtn,#sTal .chb,#sTal .actc')].filter(x=>!x.disabled&&x.offsetParent);if(b.length)b[Math.floor(Math.random()*b.length)].click();})()`, 150);
          if (await run(() => !document.querySelector('#ov').hidden).catch(() => false)) { await ev(`window.__sweep()`, 100); break; } } } }
    log('city done');
    // arcade and other kid lines
    await ev(`(()=>{document.querySelector('#ov').hidden=true;window.TAL_arcade(()=>{});})()`, 1500);
    for (const g of ['balloon', 'soccer', 'basket', 'swim', 'mole', 'frog']) { await ev(`(()=>{window.TAL_arcade(()=>{});window.__arc.start('${g}');})()`, 1200); await ev(`window.__arc.finish(9)`, 300); }
    await ev(`window.TAL.callParents('כְּדֵי לִקְרֹא בְּקוֹל צָרִיךְ אִשּׁוּר שֶׁל הוֹרֶה לַמִּיקְרוֹפוֹן.')`); await ev(`window.TAL.breakTime&&window.TAL.breakTime()`);
    await ev(`(()=>{window.TAL.parentPanel('voice');const b=[...document.querySelectorAll('#sPar button')].find(x=>/השמיעו|דוגמה/.test(x.textContent));b&&b.click();})()`, 300);
    const stat = await p.evaluate(STATIC, DATA);
    (await p.evaluate(() => window.__said)).concat(stat).forEach(x => { const c = norm(x); if (c) SAID.set(idOf(c), c); });
    /* #402 the math sentence set: every question of the small math units, through the same text path (kept past the random filter) */
    (await p.evaluate(() => window.OREN.mathSpeechList().flatMap(s => window.__ttsParts(window.__fullSpell(s))))).forEach(x => { const c = norm(x); if (c) MATHS.set(idOf(c), c); });
    console.log('collected', SAID.size, 'so far (' + (vp.isMobile ? 'phone' : 'desktop') + ')'); await ctx.close(); }
  await b.close(); const MATH = [...MATHS.values()].filter(x => !SAID.has(idOf(x)) || RANDOM.test(txt(x)));
  const L = [...SAID.values()].filter(x => !RANDOM.test(txt(x))).concat(MATH); fs.writeFileSync(LIST, JSON.stringify(L));
  console.log('sentences', L.length, 'chars', L.reduce((a, x) => a + txt(x).length, 0), '→', LIST); return L;
}

async function upload(L) {
  let st = {}; try { st = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) {}
  const today = new Date().toISOString().slice(0, 10); if (st.day !== today) { st.day = today; st.newToday = 0; } st.done = st.done || {};
  const save = () => fs.writeFileSync(STATE, JSON.stringify(st));
  const todo = L.filter(x => !st.done[idOf(x)]); let made = 0, chars = 0, hits = 0, used = '?';
  try { console.log('download list:', JSON.stringify(await post('/api/tts/list', L))); } catch (e) { console.log('list upload failed:', e.message); }
  console.log(`site ${SITE} · to check ${todo.length} of ${L.length} · new today so far ${st.newToday}/${DAY_MAX}`);
  for (let i = 0; i < todo.length;) {
    if (st.newToday + BATCH > DAY_MAX) { save(); const rest = todo.slice(i); let q = {};
      try { q = await post('/api/tts/queue', rest); } catch (e) { q = { error: e.message }; }
      console.log(`daily limit reached (${st.newToday} new today). ${rest.length} left: handed to the site's queue (made automatically while the game is used): ${JSON.stringify(q)}`); return; }
    const part = todo.slice(i, i + BATCH); let j;
    try { const r = await fetch(SITE + '/api/tts/pregen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texts: part }) });
      j = await r.json(); if (!r.ok || !j.ok) throw new Error(r.status + ' ' + JSON.stringify(j)); }
    catch (e) { console.log('call failed:', e.message, '— waiting a minute'); await sleep(60000); continue; }
    let n = 0; j.res.forEach((x, k) => { if (x === 'hit' || x === 'new' || x === 'empty') st.done[idOf(part[k])] = 1; if (x === 'new') { n++; chars += txt(part[k]).length; } if (x === 'hit') hits++; });
    made += n; st.newToday += n; used = j.used; i += BATCH; save();
    const bad = j.res.filter(x => !['hit', 'new', 'empty'].includes(x));
    console.log(`${Math.min(i, todo.length)}/${todo.length} checked · new ${made} (${chars} chars) · cached ${hits} · month ${used}/${j.cap}${bad.length ? ' · problems: ' + bad.join(',') : ''}`);
    if (bad.includes('cap')) { console.log('monthly cap reached; stopping.'); return; }
    if (n || bad.length) await sleep(Math.ceil((n + bad.length) * 60000 / PER_MIN));   // ≤15 Google requests a minute
  }
  console.log(`done: all ${L.length} sentences exist. new now ${made} (${chars} chars), new today ${st.newToday}.`);
}

module.exports = { STATIC, RANDOM, literal, norm, idOf, txt, GV, GR };
if (require.main === module) (async () => {
  const L = arg('--upload') ? JSON.parse(fs.readFileSync(LIST, 'utf8')) : await collect();
  if (!arg('--collect')) await upload(L);
})().catch(e => { console.error(e); process.exit(1); });
