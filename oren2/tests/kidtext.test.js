// #422 Kid text checker: over ALL kid text (every Hebrew string literal with nikud in the game's source files) and the
// question generators (every world level, many seeds; every Talents City activity screen, many runs) four rules:
//   nonikud  a Hebrew word (2+ letters) without nikud inside kid text
//   one      the number 1 before a plural noun ("1 תַּפּוּחִים")
//   vav      the vav "and" with shva before a letter with shva ("וְשְׁ..." must be "וּשְׁ...")
//   gender   a feminine verb/address to the kid (Oren is a boy): "אַתְּ", "לַחֲצִי", "אַתָּה רוֹצָה"
// A finding fails the suite unless it is in ALLOW (false positive, with the reason) or KNOWN (real, listed in the
// findings issue, fixed there). A KNOWN entry that no longer shows up also fails, so the list stays short.
// Usage: node tests/kidtext.test.js
const L = require('./lib');
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');

const NIK = /[ְ-ׇּׁׂ]/, HEB = /[א-ת]/g;
const strip = w => w.replace(/[֑-ׇ]/g, '');
const text = s => String(s).replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<(style|script)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/\$\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
const words = t => t.match(/[א-ת][א-ת֑-ׇ]*/g) || [];
const FEM = new Set(['לחצי', 'בחרי', 'גררי', 'הקשיבי', 'שמעי', 'מצאי', 'ספרי', 'נסי', 'קראי', 'כתבי', 'הסתכלי', 'בואי', 'געי', 'ציירי',
  'התאימי', 'הקישי', 'עני', 'שחקי', 'חשבי', 'זכרי', 'התחילי', 'המשיכי', 'תלחצי', 'תבחרי', 'תגררי', 'תמצאי', 'תספרי', 'תקראי', 'תכתבי',
  'שימי', 'קחי', 'תני', 'עשי', 'סדרי', 'צבעי', 'גלי', 'נגני', 'שירי', 'רקדי', 'קפצי', 'חפשי', 'אמרי', 'הראי', 'נחשי', 'פתרי', 'השלימי']);
/* the four rules on one kid text; returns [{rule, word, ctx}] */
function check(raw, opts = {}) {
  const t = text(raw), out = [], ws = words(t);
  /* kid text = most of its Hebrew words carry nikud (a parent line with one example like "ניקוד: קמץ (אַ)" is not); the voice text is plain on purpose */
  const long = ws.filter(w => (w.match(HEB) || []).length >= 2), bare = long.filter(w => !NIK.test(w));
  if (!opts.voice && bare.length && bare.length < long.length - bare.length) for (const w of bare) out.push({ rule: 'nonikud', word: w });
  for (const m of t.matchAll(/(?:^|[^\d.,:/])1\s+([א-ת][א-ת֑-ׇ]*)/g)) { const w = m[1], s = strip(w);
    if (s.length >= 4 && (/ִים$|ִיּ?ִ?ים$/.test(w) || /וֹת$/.test(w) || (!NIK.test(w) && /(ים|ות)$/.test(s)))) out.push({ rule: 'one', word: '1 ' + w }); }
  for (const w of ws) { const m = w.match(/^\u05D5\u05B0[א-ת]([\u05B0\u05BC\u05C1\u05C2]*)/); if (m && m[1].includes('\u05B0')) out.push({ rule: 'vav', word: w }); }   // marks in either order
  for (let i = 0; i < ws.length; i++) { const w = ws[i], s = strip(w);
    if (w === 'אַתְּ' || FEM.has(s) && NIK.test(w) && /ִ?י$/.test(w)) out.push({ rule: 'gender', word: w });
    const nx = ws[i + 1] || '', femPast = /ְ[א-ת]ּ?ָה$/.test(nx), femNow = /(וֹ|ִי)[א-ת]ּ?ָה$/.test(nx);   // אָכְלָה / רוֹצָה, יְכוֹלָה
    const mascPast = /^[א-ת]\u05BC?\u05B8[א-ת]\u05BC?\u05B7[א-ת]\u05B0?$/.test(nx);   // אָכַל, הָלַךְ
    if (/[א-ת]{2}/.test(s) && /\u05EA(\u05BC\u05B0|\u05B0\u05BC)$/.test(w)) out.push({ rule: 'gender', word: w });   // הִצְלַחְתְּ: past tense to a girl
    if ((w === 'אַתָּה' && (femPast || femNow)) || (w === 'הוּא' && femPast) || (w === 'הִיא' && mascPast)) out.push({ rule: 'gender', word: w + ' ' + ws[i + 1] }); }
  return out.map(f => Object.assign(f, { ctx: t.slice(0, 90) }));
}

/* false positives: rule|word -> reason */
const ALLOW = {
  'one|1 לָעֲשָׂרוֹת': 'column addition tip: "carry 1 to the tens" (a digit moved to a column, not a count of tens)',
  'one|1 מֵאוֹת': 'place-value table: the digits row is followed by the header row "מֵאוֹת עֲשָׂרוֹת אֲחָדוֹת"',
  'gender|הוּא הֶרְאָה': 'masculine past of ל"ה root ראה (he showed), not the feminine pattern אָכְלָה',
  'gender|הוּא נִרְאָה': 'masculine (he looks), ל"ה root ראה',
};
/* real findings, fixed in the findings issue (#515 lists the first run: none): rule|word */
const KNOWN = [
];

/* every string literal in a JS source (quotes and template literals; ${...} becomes a space) */
function literals(src) {
  const out = []; let i = 0;
  while (i < src.length) { const c = src[i];
    if (c === '/' && src[i + 1] === '/') { const j = src.indexOf('\n', i); i = j < 0 ? src.length : j; continue; }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 2; continue; }
    if (c === '"' || c === "'" || c === '`') { let j = i + 1, s = '', d = 0;
      for (; j < src.length; j++) { const x = src[j];
        if (x === '\\') { s += src[j + 1] || ''; j++; continue; }
        if (c === '`' && x === '$' && src[j + 1] === '{') { d = 1; j += 2; for (; j < src.length && d; j++) { if (src[j] === '{') d++; else if (src[j] === '}') d--; } j--; s += ' '; continue; }
        if (x === c || (c !== '`' && x === '\n')) break; s += x; }
      if (/[א-ת]/.test(s)) out.push(s); i = j + 1; continue; }
    i++; }
  return out;
}
function sources() {
  const files = fs.readdirSync(L.ROOT).filter(f => /\.js$/.test(f)).map(f => [f, fs.readFileSync(path.join(L.ROOT, f), 'utf8')]);
  // index.html: only the core (the parts between the build markers are the .js files above)
  const html = fs.readFileSync(path.join(L.ROOT, 'index.html'), 'utf8').replace(/\/\*GAPSMATH\*\/[\s\S]*?\/\*\/GAPSMATH\*\//, ' ').replace(/<!--TALENTS-->[\s\S]*?<!--\/TALENTS-->/, ' ');
  files.push(['index.html', html.replace(/<svg[\s\S]*?<\/svg>/g, ' ')]);
  return files;
}

(async () => {
  const res = []; const ok = (c, m) => res.push((c ? 'PASS ' : 'FAIL ') + m);
  /* 1. the rules themselves */
  const has = (t, rule, o) => check(t, o).some(f => f.rule === rule);
  ok(has('לַחֲצוּ עַל הכפתור', 'nonikud') && !has('לַחֲצוּ עַל הַכַּפְתּוֹר', 'nonikud') && !has('להורה: בלי ניקוד', 'nonikud') && !has('ניקוד: קמץ ופתח (אַ)', 'nonikud') && !has('באיזו אות מתחילה הַמִּלָּה', 'nonikud', { voice: true }), 'rule nonikud: a bare word in kid text, parent text skipped');
  ok(has('יֵשׁ 1 תַּפּוּחִים', 'one') && has('1 עֲשָׂרוֹת', 'one') && !has('יֵשׁ 1 תַּפּוּחַ', 'one') && !has('יֵשׁ 11 תַּפּוּחִים', 'one') && !has('1 חֲנוּת', 'one'), 'rule one: 1 + plural, not 11 / singular');
  ok(has('אֶחָד וְשְׁנַיִם', 'vav') && has('וְכְּלָבִים', 'vav') && has('וְכְ\u05BCלָבִים', 'vav') && !has('אֶחָד וּשְׁנַיִם', 'vav') && !has('וְעַכְשָׁו', 'vav'), 'rule vav: וְ before shva');
  ok(has('לַחֲצִי עַל הַכּוֹכָב', 'gender') && has('אַתְּ גִּבּוֹרָה', 'gender') && has('אַתָּה רוֹצָה', 'gender') && has('הוּא אָכְלָה', 'gender') && has('הִיא אָכַל', 'gender') && has('הִצְלַחְתְּ', 'gender') && !has('הִצְלַחְתָּ', 'gender') && !has('הִיא אָכְלָה', 'gender') && !has('הוּא רָאָה', 'gender') && !has('לְחַץ עַל הַכּוֹכָב', 'gender') && !has('אַתָּה רוֹצֶה', 'gender') && !has('חֲצִי עוּגָה', 'gender'), 'rule gender: feminine address to the kid');

  /* 2. collect: source strings with nikud + generators in the page */
  const items = [];                                   // {src, t, all}
  for (const [f, s] of sources()) for (const x of literals(s)) for (const part of x.split(/[|\n]/)) items.push({ src: f, t: part });   // data records "דָּג|דג|animals": each field alone
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { window.__noFamily = true; window.__fast = true; try { localStorage.clear(); } catch (e) {}
    let z = 422; Math.random = () => { z = (z * 1103515245 + 12345) % 2147483648; return z / 2147483648; }; });   // fixed seeds: same findings every run
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await L.noCoach(p);
  const gen = await p.evaluate(() => {
    const O4 = window.__oren4, out = [], seen = new Set(), add = (src, t) => { t = String(t); if (/[א-ת]/.test(t) && !seen.has(t)) { seen.add(t); out.push({ src, t }); } };
    const walk = (src, v, d) => { if (d > 4 || v == null) return; if (typeof v === 'string') add(src, v); else if (Array.isArray(v)) v.forEach(x => walk(src, x, d + 1)); else if (typeof v === 'object') for (const k in v) walk(src, v[k], d + 1); };
    let n = 0; for (const lv of O4.ALLLV) for (let i = 0; i < 30; i++) { try { walk('level ' + lv.id, lv.gen(i), 0); n++; } catch (e) { add('level ' + lv.id, 'ERROR ' + e.message); } }
    /* every Talents City activity, run 12 times: the screen's text (title, question, options) and what the voice reads */
    let acts = 0; const A = window.TAL.ACT, O = window.OREN;
    for (const id in A) { const a = A[id]; if (a.avail && !a.avail()) continue;
      for (let r = 0; r < 12; r++) { try { O.sayNow = ''; a.run(() => {}); acts++; } catch (e) { continue; }
        const s = document.querySelector('#sTal'); if (s) { const w = document.createTreeWalker(s, NodeFilter.SHOW_TEXT); let x; while ((x = w.nextNode())) { const el = x.parentElement; if (el && !el.closest('svg,style,script')) add('activity ' + id, x.nodeValue); } }
        if (O.sayNow) add('activity ' + id + ' (voice)', O.sayNow); } }
    return { n, acts, out };
  });
  for (const x of gen.out) items.push({ src: x.src, t: x.t });
  ok(gen.n > 5000 && gen.acts > 500, `generators ran: ${gen.n} level questions, ${gen.acts} activity screens`);
  ok(items.length > 3000, `kid text collected: ${items.length} strings`);

  /* 3. findings */
  const found = new Map();                            // key -> {src, ctx}
  for (const it of items) for (const f of check(it.t, { voice: / \(voice\)$/.test(it.src) })) { const k = f.rule + '|' + f.word; if (!found.has(k)) found.set(k, { src: it.src, ctx: f.ctx }); }
  const isKnown = new Set(KNOWN), rows = [...found].filter(([k]) => !ALLOW[k] && !isKnown.has(k));
  if (process.env.KIDTEXT_DUMP) fs.writeFileSync(process.env.KIDTEXT_DUMP, JSON.stringify([...found].map(([k, v]) => [k, v.src, v.ctx]), null, 1));
  const byRule = r => rows.filter(([k]) => k.startsWith(r + '|'));
  for (const r of ['nonikud', 'one', 'vav', 'gender']) { const x = byRule(r);
    ok(!x.length, `${r}: no new findings (${x.length})` + (x.length ? ' — ' + x.slice(0, 12).map(([k, v]) => `${k.split('|')[1]} [${v.src}: ${v.ctx}]`).join(' | ') : '')); }
  const stale = KNOWN.filter(k => !found.has(k)), deadAllow = Object.keys(ALLOW).filter(k => !found.has(k));
  ok(!stale.length && !deadAllow.length, 'every KNOWN / ALLOW entry still shows up (remove fixed ones) ' + stale.concat(deadAllow).join(' | '));
  ok(!errs.length, 'no page errors ' + errs.slice(0, 3).join(' | '));
  await b.close(); L.finish('kidtext', res);
})();
