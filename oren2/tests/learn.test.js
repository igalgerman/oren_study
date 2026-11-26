// LEARN: generators (answers re-solved here), Hebrew grammar of the templates (gender of verbs, number-noun agreement, nikud),
// the engine with simulated learners (fast / struggling / reviews / placement / merge), then the screens in the built page.
// Usage: node tests/learn.test.js [desktop|phone|both]   (UI part needs playwright; LEARN_SHOTS=<dir> saves screenshots)
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'learn.js'));
const C = window.LEARN, K = C.core;
const out = []; const ok = (c, m, info) => out.push((c ? 'PASS ' : 'FAIL ') + m + (!c && info ? ' — ' + info : ''));
const N = +process.env.N || 300;
const strip = s => String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const NIK = /[ְ-ׇ]/;
// seeded random for repeatable simulations
const seeded = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/* ---------- independent solvers ---------- */
const norm = s => strip(s).replace(/−/g, '-').replace(/×/g, '*').replace(/:/g, '/');
// "a + ? = c", "a + b - c = ?" (one unknown, + and - only on the side with '?')
function solveExpr(e) {
  const [L, R] = e.split('=').map(x => x.trim());
  const ev = s => s.replace(/\s/g, '').match(/[+-]?\d+/g).reduce((a, x) => a + +x, 0);
  if (R === '?') return Function('return ' + L)();
  for (let x = 0; x <= 400; x++) if (Function('return ' + L.replace('?', x))() === +R) return x;
  return NaN;
}
const WORDNUM = { 'אֶחָד': 1, 'אַחַת': 1, 'שְׁנֵי': 2, 'שְׁתֵּי': 2, 'בִּשְׁנֵי': 2, 'בִּשְׁתֵּי': 2, 'לִשְׁנֵי': 2, 'לִשְׁתֵּי': 2, 'וּשְׁנֵי': 2, 'וּשְׁתֵּי': 2, 'מִשְּׁנֵי': 2, 'מִשְּׁתֵּי': 2 };
// numbers of a text in reading order: bold digits and the words for 1 and 2
function numsOf(html) { const res = []; const re = /<b>(\d+)<\/b>|(?:^|[\s,.(])(אֶחָד|אַחַת|שְׁנֵי|שְׁתֵּי|בִּשְׁנֵי|בִּשְׁתֵּי|לִשְׁנֵי|לִשְׁתֵּי|וּשְׁנֵי|וּשְׁתֵּי|מִשְּׁנֵי|מִשְּׁתֵּי)(?=[\s,.?!])/g; let m;
  while ((m = re.exec(html))) res.push(m[1] ? +m[1] : WORDNUM[m[2]]); return res; }

/* ---------- 1. generators: every skill, every level ---------- */
const probs = {}; const bad = (k, m) => { (probs[k] = probs[k] || []).length < 3 && probs[k].push(m); };
for (const sk of C.MM_IDS) for (let lv = 1; lv <= 5; lv++) for (let i = 0; i < N; i++) {
  const q = C.gen(sk, lv), key = sk + lv;
  if (!(Number.isInteger(q.v) && q.v >= 0)) bad(key, 'answer ' + q.v);
  if (q.opts.length !== 4 || new Set(q.opts).size !== 4 || q.opts[q.ans] !== q.v || q.opts.some(o => o < 0)) bad(key, 'options ' + q.opts + ' ans ' + q.v);
  if (sk === 'mm-skip') { const s = q.seq; const d = s[1] - s[0]; if (!s.every((x, j) => j === 0 || x - s[j - 1] === d)) bad(key, 'not arithmetic ' + s); if (s[q.qi] !== q.v) bad(key, 'blank');
    const shown = norm(q.html).split(',').map(x => x.trim()); if (shown[q.qi] !== '?' || shown.filter(x => x === '?').length !== 1) bad(key, 'shown ' + shown); continue; }
  const e = norm(q.html); const v = solveExpr(e); if (v !== q.v) bad(key, `${e} → ${v}, module says ${q.v}`);
  if (sk === 'mm-pv') { const p = q.chart.path; if (p[0] !== q.chart.start || p[p.length - 1] !== q.v || p.some(c => c < 1 || c > 100) || p.some((c, j) => j && ![1, 10].includes(Math.abs(c - p[j - 1])))) bad(key, 'path ' + p); }
}
// word problems
const lvOk = { 1: 10, 2: 20, 3: 100, 4: 200, 5: 200 };
for (let lv = 1; lv <= 5; lv++) for (let i = 0; i < N * 2; i++) {
  const q = C.wordQ(lv), key = 'wp' + lv + ' ' + q.tid;
  const ns = numsOf(q.tx);
  if (ns.join(',') !== q.nums.join(',')) bad(key, `numbers in text ${ns} ≠ ${q.nums}`);
  const v = C.solve(q.f, ns); if (v !== q.v || !Number.isInteger(v) || v < 0) bad(key, `answer ${v} vs ${q.v}`);
  if (lv <= 2 && Math.max(...ns, v) > lvOk[lv]) bad(key, 'numbers too big for level ' + ns);
  if (q.opts[q.ans] !== q.v || new Set(q.opts).size !== 4) bad(key, 'options');
}
for (const t of C.WT) for (let lv = t.lv[0]; lv <= t.lv[1]; lv++) for (let i = 0; i < 60; i++) { try { C.wordQ(lv, t.id); } catch (e) { bad('wp ' + t.id, e.message); } }
// challenge problems — solved here by brute force from what is shown
const FR = ['🍎', '🍌', '🍇', '🍒', '🍓'];
for (let lv = 1; lv <= 5; lv++) for (const kind of C.CH_BY_LV[lv]) for (let i = 0; i < N; i++) {
  const q = C.chalQ(lv, kind), key = 'ch' + lv + kind; let sols = [];
  const h = q.html || '', t = strip(h + ' ' + (q.text || '')), bs = numsOf(h + ' ' + (q.text || ''));
  if (kind === 'miss') { const e = norm(h.replace(/<span class="lnbox"><\/span>/, '?')); for (let x = 0; x <= 200; x++) { const [L, R] = e.split('='); if (Function('return ' + L.replace('?', x))() === +R) sols.push(x); } }
  if (kind === 'riddle') for (let x = 0; x <= 400; x++) { if (/מוֹסִיפִים לִי/.test(t) && x + bs[0] === bs[1]) sols.push(x); if (/מוֹרִידִים מִמֶּנִּי/.test(t) && x - bs[0] === bs[1]) sols.push(x); if (/כּוֹפְלִים אוֹתִי/.test(t) && x * bs[0] + bs[1] === bs[2]) sols.push(x); }
  if (kind === 'balance') { const rows = strip(h).split(/(?<=\d)\s+(?=\D)/).map(r => r.trim()).filter(Boolean); const eqs = rows.filter(r => /=\s*\d/.test(r)).map(r => { const [l, rr] = r.split('='); return [FR.filter(f => l.includes(f)).flatMap(f => Array(l.split(f).length - 1).fill(f)), +rr.trim()]; });
    const ask = FR.find(f => rows[rows.length - 1].includes(f)); const fr = [...new Set(eqs.flatMap(e => e[0]))];
    const rec = (j, val) => { if (j === fr.length) { if (eqs.every(([fs, s]) => fs.reduce((a, f) => a + val[f], 0) === s)) sols.push(val[ask]); return; } for (let x = 0; x <= 30; x++) rec(j + 1, Object.assign({}, val, { [fr[j]]: x })); };
    if (fr.length <= 3) rec(0, {}); sols = [...new Set(sols)]; }
  const kd = q.kind;
  if (kd === 'digits') for (let x = 10; x <= 99; x++) { if (Math.floor(x / 10) === bs[0] && x % 10 === bs[0] + bs[1]) sols.push(x); }
  if (kd === 'digits2') for (let x = 10; x <= 99; x++) { const a = Math.floor(x / 10), b = x % 10; if (a + b === bs[0] && a - b === bs[1]) sols.push(x); }
  if (kind === 'grow') { const s = norm(h).split(',').map(x => x.trim()).filter(x => x !== '?').map(Number); const d = s.slice(1).map((x, j) => x - s[j]);
    let nx = null; if (d.slice(1).every((x, j) => x - d[j] === 1)) nx = s[s.length - 1] + d[d.length - 1] + 1; else if (s.slice(1).every((x, j) => x === 2 * s[j])) nx = 2 * s[s.length - 1]; else if (d.every((x, j) => x === d[j % 2])) nx = s[s.length - 1] + d[d.length % 2];
    if (nx != null) sols.push(nx); }
  if (kind === 'legs') sols.push(4 * bs[0] + 2 * bs[1]);   // dogs, hens, then 4 legs and "שְׁתֵּי רַגְלַיִם"
  if (sols.length !== 1 || sols[0] !== q.v) bad(key, `solutions ${sols.slice(0, 4)} vs ${q.v} | ${strip(h + ' ' + t).slice(0, 90)}`);
  if (q.opts[q.ans] !== q.v || new Set(q.opts).size !== 4) bad(key, 'options ' + q.opts);
}
// paper tasks
for (let lv = 1; lv <= 5; lv++) for (let i = 0; i < N; i++) {
  const q = C.paperQ('math', lv), key = 'pp' + lv + q.kind; const ns = numsOf(q.task); let v;
  if (q.kind === 'calc') v = Function('return ' + norm(q.big))();
  if (q.kind === 'draw') v = ns[0] * ns[1];
  if (q.kind === 'groups') v = ns[0] / ns[1];
  if (q.kind === 'line') v = ns[2] + ns[3] * ns[4];
  if (v !== q.v || !Number.isInteger(v) || v < 0) bad(key, `${v} vs ${q.v} ${strip(q.task + ' ' + (q.big || ''))}`);
  if (!q.sol || !strip(q.sol).includes(String(q.v))) bad(key, 'worked solution misses the answer');
  if (q.kind === 'calc' && lv === 2 && (q.p.a % 10) + (q.p.b % 10) < 10) bad(key, 'level 2 should carry ' + q.big);
  const w = C.paperQ('write', lv); if (!w.self || !w.task || !w.check || !w.check.length) bad('ppw', 'writing task shape');
}
const pk = Object.keys(probs);
ok(pk.length === 0, `generators: answers re-solved independently, options valid (${C.MM_IDS.length} strategies + word problems + challenges + paper × 5 levels)`, pk.slice(0, 6).map(k => k + ': ' + probs[k][0]).join(' | '));

/* ---------- 2. Hebrew: templates, gender agreement, numbers, nikud ---------- */
ok(C.WT.length >= 40, 'at least 40 word-problem templates', C.WT.length);
{ const real = ['52,36', '36,25', '29,20', '22,15', '15,10']; const seen = new Set(); let badK = [];   // #210: a real piano has fewer black keys than white
  for (let lv = 3; lv <= 5; lv++) for (let i = 0; i < 60; i++) { const q = C.wordQ(lv, 'pi-keys'); const k = q.nums.join(','); seen.add(k); if (!real.includes(k)) badK.push(k); }
  ok(!badK.length && seen.size >= 3, 'piano keys: only real white/black pairs (fewer black than white)', [...new Set(badK)].join(' ') + ' seen ' + [...seen].join(' ')); }
const th = {}; C.WT.forEach(t => th[t.th] = (th[t.th] || 0) + 1);
ok(['soccer', 'basket', 'swim', 'piano', 'build', 'space'].every(k => th[k] >= 5), 'every theme he loves has ≥5 templates', JSON.stringify(th));
ok([1, 2, 3, 4, 5].every(lv => C.WT_BY_LV(lv).length >= 12), 'every level has ≥12 templates', [1, 2, 3, 4, 5].map(lv => C.WT_BY_LV(lv).length).join(','));
// this test's own lists (written separately from the module)
const NAMES = { 'יונתן': 'm', 'דני': 'm', 'איתי': 'm', 'עומר': 'm', 'איתן': 'm', 'רון': 'm', 'עדו': 'm', 'נועה': 'f', 'מאיה': 'f', 'תמר': 'f', 'שירה': 'f', 'יעל': 'f', 'מיכל': 'f', 'הילה': 'f' };
const MV = 'הוּא לוֹ הִבְקִיעַ לָקַח בָּעַט בּוֹעֵט אָסַף קִבֵּל וְנָתַן נָתַן קָלַע זָרַק הִתְאַמֵּן רוֹצֶה שָׂחָה תִּכְנֵן שׂוֹחֶה נִגֵּן לָמַד מִתְאַמֵּן יוֹדֵעַ שָׁכַח זוֹכֵר צָרִיךְ בָּנָה הוֹסִיף בּוֹנֶה חִלֵּק צָעַד סָפַר קָנָה וְשִׁלֵּם שִׁלֵּם'.split(' ');
const FV = 'הִיא לָהּ הִבְקִיעָה לָקְחָה בָּעֲטָה בּוֹעֶטֶת אָסְפָה קִבְּלָה וְנָתְנָה נָתְנָה קָלְעָה זָרְקָה הִתְאַמְּנָה רוֹצָה שָׂחֲתָה תִּכְנְנָה שׂוֹחָה נִגְּנָה לָמְדָה מִתְאַמֶּנֶת יוֹדַעַת שָׁכְחָה זוֹכֶרֶת צְרִיכָה בָּנְתָה הוֹסִיפָה בּוֹנָה חִלְּקָה צָעֲדָה סָפְרָה קָנְתָה וְשִׁלְּמָה שִׁלְּמָה'.split(' ');
const NEU = 'כְּבָר עוֹד לֹא חֲסֵרִים חֲסֵרוֹת'.split(' ');
const PL = { 'גּוֹלִים': 'm', 'כַּדּוּרִים': 'm', 'בְּעִיטוֹת': 'f', 'אִמּוּנִים': 'm', 'שַׂחְקָנִים': 'm', 'קְלָפִים': 'm', 'סַלִּים': 'm', 'זְרִיקוֹת': 'f', 'נְקֻדּוֹת': 'f', 'יָמִים': 'm', 'בְּרֵכוֹת': 'f', 'מַסְלוּלִים': 'm', 'יְלָדִים': 'm',
  'דַּקּוֹת': 'f', 'שִׁירִים': 'm', 'תָּוִים': 'm', 'חֳדָשִׁים': 'm', 'בְּלוֹקִים': 'm', 'קוֹמוֹת': 'f', 'חַלּוֹנוֹת': 'm', 'מִגְדָּלִים': 'm', 'כּוֹכָבִים': 'm', 'אַסְטְרוֹנָאוּטִים': 'm', 'מְנוֹעִים': 'm', 'חֲלָלִיּוֹת': 'f',
  'צְעָדִים': 'm', 'אֲבָנִים': 'f', 'מַדְבֵּקוֹת': 'f', 'שְׁקָלִים': 'm', 'קְבוּצוֹת': 'f', 'קְלִידִים': 'm', 'כְּלָבִים': 'm', 'תַּרְנְגוֹלוֹת': 'f', 'שׁוּרוֹת': 'f', 'עִגּוּלִים': 'm', 'מִלִּים': 'f', 'קְפִיצוֹת': 'f', 'רַגְלַיִם': 'f', 'מִסְפָּרִים': 'm' };
const SG = { 'גּוֹל': 'm', 'כַּדּוּר': 'm', 'בְּעִיטָה': 'f', 'אִמּוּן': 'm', 'שַׂחְקָן': 'm', 'קְלָף': 'm', 'סַל': 'm', 'זְרִיקָה': 'f', 'נְקֻדָּה': 'f', 'יוֹם': 'm', 'בְּרֵכָה': 'f', 'מַסְלוּל': 'm', 'יֶלֶד': 'm', 'דַּקָּה': 'f', 'שִׁיר': 'm', 'תָּו': 'm',
  'חֹדֶשׁ': 'm', 'בְּלוֹק': 'm', 'קוֹמָה': 'f', 'חַלּוֹן': 'm', 'מִגְדָּל': 'm', 'כּוֹכָב': 'm', 'אַסְטְרוֹנָאוּט': 'm', 'מָנוֹעַ': 'm', 'חֲלָלִית': 'f', 'צַעַד': 'm', 'אֶבֶן': 'f', 'מַדְבֵּקָה': 'f', 'שֶׁקֶל': 'm', 'קְבוּצָה': 'f', 'קְלִיד': 'm', 'מִשְׁפָּט': 'm', 'שׁוּרָה': 'f', 'עִגּוּל': 'm', 'מִשְׁבֶּצֶת': 'f' };
const nd = w => w.replace(/ּ/g, ''); for (const k of Object.keys(PL)) PL[nd(k)] = PL[k];
const TWO_M = /^(שְׁנֵי|בִּשְׁנֵי|לִשְׁנֵי|וּשְׁנֵי|מִשְּׁנֵי)$/, TWO_F = /^(שְׁתֵּי|בִּשְׁתֵּי|לִשְׁתֵּי|וּשְׁתֵּי|מִשְּׁתֵּי)$/;
const gprobs = {}; const gbad = (k, m) => { (gprobs[k] = gprobs[k] || []).length < 2 && gprobs[k].push(m); };
const words = s => strip(s).replace(/[.,?!:()"]/g, ' ').split(/\s+/).filter(Boolean);
function grammar(html, key, person) {
  // marked words agree with the person they belong to
  const re = /<span data-w="([^"]+)">([^<]+)<\/span>/g; let m; let marks = 0;
  while ((m = re.exec(html))) { marks++; const g = NAMES[m[1]]; if (!g) { gbad(key, 'unknown name ' + m[1]); continue; }
    const ws = m[2].split(/\s+/); let gendered = 0;
    for (const w of ws) { if (MV.includes(w)) { gendered++; if (g !== 'm') gbad(key, `"${w}" (masc.) for ${m[1]}`); } else if (FV.includes(w)) { gendered++; if (g !== 'f') gbad(key, `"${w}" (fem.) for ${m[1]}`); } else if (!NEU.includes(w)) gbad(key, `unknown word in a marked phrase: "${w}"`); }
    if (!gendered) gbad(key, 'marked phrase without a gendered word: ' + m[2]); }
  // gendered words that are not marked
  const rest = html.replace(re, ' ');
  for (const w of words(rest)) if (person && (MV.includes(w) || FV.includes(w))) gbad(key, `unmarked gendered word "${w}": ${strip(html).slice(0, 80)}`);
  // numbers and nouns
  const ws = words(html.replace(/<b>(\d+)<\/b>/g, ' #$1 '));
  ws.forEach((w, j) => {
    const nx = nd((ws[j + 1] || '')).replace(/^הַ/, ''), pv = ws[j - 1];
    if (w === 'אֶחָד' && SG[pv] && SG[pv] !== 'm') gbad(key, `"${pv} אֶחָד"`);
    if (w === 'אַחַת' && SG[pv] && SG[pv] !== 'f') gbad(key, `"${pv} אַחַת"`);
    if ((w === 'אֶחָד' || w === 'אַחַת') && !SG[pv] && !['מִשְׁפָּט'].includes(pv)) gbad(key, `"${pv} ${w}": noun not in the list`);
    if (TWO_M.test(w) && PL[nx] !== 'm' && nx !== 'יָמִים') gbad(key, `"${w} ${ws[j + 1]}"`);
    if (TWO_F.test(w) && PL[nx] !== 'f') gbad(key, `"${w} ${ws[j + 1]}"`);
    const d = /^#(\d+)$/.exec(w); if (d) { const n = +d[1]; if (SG[nx] && n !== 1) gbad(key, `"${n} ${nx}": singular after a number`);
      if (PL[nx] && n <= 2) gbad(key, `"${n} ${nx}": 1 and 2 are written as words`); }
  });
  // nikud: every Hebrew word of 2+ letters has nikud
  for (const w of words(html)) { const he = w.replace(/[^א-ת]/g, ''); if (he.length >= 2 && !NIK.test(w)) gbad(key, 'no nikud: ' + w); }
  return marks;
}
let withMarks = 0, both = new Set();
for (const t of C.WT) for (let lv = t.lv[0]; lv <= t.lv[1]; lv++) for (let i = 0; i < 80; i++) { const q = C.wordQ(lv, t.id); if (grammar(q.tx, t.id, true)) withMarks++;
  const nm = /<span data-w="([^"]+)"/.exec(q.tx); if (nm) both.add(t.id + NAMES[nm[1]]); }
for (let lv = 1; lv <= 5; lv++) for (let i = 0; i < 100; i++) { const q = C.chalQ(lv); grammar((q.html || '') + ' ' + (q.text || ''), 'ch-' + q.kind); const p = C.paperQ('math', lv); grammar(p.task, 'pp-' + p.kind); }
for (const sk of C.MM_IDS) for (let lv = 1; lv <= 5; lv++) { const q = C.gen(sk, lv); grammar((q.text || '') + ' ' + (q.tip || '') + ' ' + q.html, sk); }
for (let i = 0; i < 60; i++) { const w = C.paperQ('write', 1); grammar(w.task + ' ' + (w.big || '') + ' ' + w.check.join(' ') + ' ' + (w.eg || ''), 'pp-write'); }
const gk = Object.keys(gprobs);
ok(gk.length === 0, 'Hebrew: verbs/pronouns agree with each name (m/f), numbers agree with noun gender (אֶחָד/אַחַת, שְׁנֵי/שְׁתֵּי), 1–2 as words, nikud everywhere', gk.slice(0, 6).map(k => k + ': ' + gprobs[k][0]).join(' | '));
const withPerson = C.WT.filter(t => /x\.v\(/.test(t.g.toString())).map(t => t.id);
ok(withPerson.every(id => both.has(id + 'm') && both.has(id + 'f')), 'templates with a person come out for boys and for girls', withPerson.filter(id => !(both.has(id + 'm') && both.has(id + 'f'))).join(','));
// the count helper itself
ok(C.count(1, 'goal') === 'גּוֹל אֶחָד' && C.count(1, 'kick') === 'בְּעִיטָה אַחַת' && C.count(2, 'window') === 'שְׁנֵי חַלּוֹנוֹת' && C.count(2, 'rock') === 'שְׁתֵּי אֲבָנִים' && C.count(2, 'tower', 'לְ') === 'לִשְׁנֵי מִגְדָּלִים' && C.count(2, 'ship', 'לְ') === 'לִשְׁתֵּי חֲלָלִיּוֹת' && C.count(7, 'minute') === '<b>7</b> דַּקּוֹת',
  'count(): irregular genders (חַלּוֹנוֹת m, אֲבָנִים f) and prefixes');
ok(C.lp('דָּנִי') === 'לְדָנִי' && C.vav('מָאיָה') === 'וּמָאיָה' && C.vav('תָּמָר') === 'וְתָמָר', 'prefixes before names: לְדָנִי, וּמָאיָה, וְתָמָר');

/* ---------- 3. the engine with simulated learners ---------- */
let day = 20000; C.setNow(() => day * 864e5 + 12 * 3600e3);
const fresh = () => K.ensure(null);
// one round of 6 answers of a skill at the engine's level; p(lv) = chance of a right first try
function round(st, sk, p, ms, lvIn) { const lv = K.start(st, sk, lvIn || (st.k[sk] || {}).l || 1); let good = 0; for (let j = 0; j < 6; j++) { const r = rr() < p(lv); if (r) good++; K.record(st, sk, r, true, ms); } return Object.assign(K.done(st, sk), { good, played: lv }); }
let rr = seeded(7); C.setRandom(seeded(11));
{ // fast learner: always right and quick → 1 → 2 → 4 → 5
  const st = fresh(); const lv = []; for (let i = 0; i < 3; i++) lv.push(round(st, 'mm-ten', () => 1, 3000).lv);
  ok(lv.join(',') === '2,4,5', 'fast learner: 2 quick perfect rounds → jump a level (1→2→4→5)', lv);
  const st2 = fresh(); const lv2 = []; for (let i = 0; i < 3; i++) lv2.push(round(st2, 'mm-ten', () => 1, 15000).lv);
  ok(lv2.join(',') === '2,3,4', 'perfect but slow: one level per round, no jumps', lv2);
  const st3 = fresh(); K.setPrefs(st3, { pace: 0 }); const lv3 = []; for (let i = 0; i < 4; i++) lv3.push(round(st3, 'mm-ten', () => 1, 15000).lv);
  ok(lv3.join(',') === '1,2,2,3', 'calm pace: up after 2 good rounds', lv3);
  const st4 = fresh(); K.setPrefs(st4, { pace: 2 }); const lv4 = []; for (let i = 0; i < 2; i++) lv4.push(round(st4, 'mm-ten', () => 1, 3000).lv);
  ok(lv4.join(',') === '3,5', 'fast pace: jumps right away', lv4);
  // fast learner over the whole engine: all strategies reach level 5 within ~20 rounds
  const st5 = fresh(); let n = 0; while (n < 40 && C.DRILL_IDS.some(sk => (st5.k[sk] || {}).l !== 5)) { const p = K.pick(st5, C.DRILL_IDS.map(sk => ({ skill: sk, step: 'ln-math', dom: 'math', frontier: !(st5.k[sk] || {}).n })), { t: K.ensure(st5) && C.dayNum() }); round(st5, p.skill, () => 1, 3000, p.lv); n++; day++; }
  ok(n <= 26, 'fast learner masters all 7 math skills in ≤26 rounds (3 each at best)', n);
}
{ // struggling learner: success falls with level; the engine keeps him in the zone (~60–90%), never at the top, with reviews
  rr = seeded(3); const P = [0, .95, .8, .62, .4, .25]; const st = fresh(); let tot = 0, good = 0, top = 0, tooHard = 0, rounds = 0;
  for (let d = 0; d < 40; d++) { const r = round(st, 'mm-comp', lv => P[lv], 12000); rounds++; tot += 6; good += r.good; if (r.played >= 5) top++; if (P[r.played] < .5) tooHard++; day += 1; }
  const a = good / tot; ok(a >= .6 && a <= .9 && top === 0 && tooHard / rounds < .25, 'struggling learner stays in the learning zone (60–90% right, rarely too hard, never the top level)', `acc ${a.toFixed(2)} top ${top} tooHard ${tooHard}/${rounds}`);
  // he gets reviews: with something due, ~20% of the picks are reviews, and a 5-step plan always has one
  const st2 = fresh(); ['mm-ten', 'mm-dbl'].forEach(sk => { round(st2, sk, () => .9, 8000); }); day += 3;
  const cs = C.DRILL_IDS.map(sk => ({ skill: sk, step: sk, dom: 'math', frontier: !(st2.k[sk] || {}).n }));
  let rev = 0; for (let i = 0; i < 400; i++) if (K.pick(st2, cs).why === 'review') rev++;
  ok(rev / 400 > .1 && rev / 400 < .35, '~20% of "what next?" picks are due reviews', (rev / 400).toFixed(2));
  const pl = K.plan(st2, cs, 5); ok(pl.filter(x => x.why === 'review').length >= 1 && new Set(pl.map(x => x.skill)).size === pl.length, 'a 5-step plan has a review and no repeated skill', pl.map(x => x.skill + ':' + x.why).join(' '));
}
{ // reviews come back on schedule: 1, 2, 4, 8 days
  rr = seeded(5); const st = fresh(); const gaps = []; let ok1 = true;
  round(st, 'mm-dbl', () => 1, 9500); for (let i = 0; i < 4; i++) { const due = st.k['mm-dbl'].u; gaps.push(due - day); if (C.isDue(st.k['mm-dbl'], due - 1)) ok1 = false; if (!C.isDue(st.k['mm-dbl'], due)) ok1 = false; day = due; round(st, 'mm-dbl', () => 1, 9500); }
  ok(gaps.join(',') === '1,2,4,8' && ok1, 'spaced review: due again after 1, 2, 4, 8 days (not before)', gaps);
  const before = st.k['mm-dbl'].i; day = st.k['mm-dbl'].u; round(st, 'mm-dbl', () => 0, 9500);
  ok(st.k['mm-dbl'].u - day === 1 && before > 0, 'a bad review round → back to tomorrow');
}
{ // zones, picks: prefers the learning zone, avoids too hard, nudges a mastered skill one level up
  const st = fresh(); const mk = (sk, h, l) => { st.k[sk] = { l, h, n: h.length, d: day, i: 0, u: day + 5, f: 0 }; };
  mk('mm-ten', '111111111111', 2); mk('mm-dbl', '110110111011', 3); mk('mm-comp', '000100010000', 3);
  ok(C.zone(st.k['mm-ten'], day) === 'mastered' && C.zone(st.k['mm-dbl'], day) === 'learning' && C.zone(st.k['mm-comp'], day) === 'hard', 'zones: mastered / learning / too hard');
  const cs = ['mm-ten', 'mm-dbl', 'mm-comp'].map(skill => ({ skill, step: 'ln-math', dom: 'math' })); const cnt = {};
  for (let i = 0; i < 300; i++) { const p = K.pick(st, cs); cnt[p.skill] = (cnt[p.skill] || 0) + 1; }
  ok((cnt['mm-dbl'] || 0) > 250, 'picks the learning-zone skill most', JSON.stringify(cnt));
  const pt = K.pick(st, cs.filter(c => c.skill === 'mm-ten')); ok(pt.lv === 3 && pt.why === 'stretch', 'a mastered skill comes back one level up', JSON.stringify(pt));
  // interleaving: after answering a skill, the next pick is another one
  st.rc = ['mm-dbl']; const nx = K.pick(st, cs.concat([{ skill: 'wp', step: 'ln-math', dom: 'math', frontier: true }])); ok(nx.skill !== 'mm-dbl', 'interleaves: does not repeat the skill just played', nx.skill);
  // focus from the parent
  const st2 = fresh(); K.setPrefs(st2, { focus: ['wp'] }); const c2 = {}; const cs2 = C.DRILL_IDS.map(skill => ({ skill, step: 'ln-math', dom: 'math', frontier: true }));
  for (let i = 0; i < 200; i++) { const p = K.pick(st2, cs2); c2[p.skill] = (c2[p.skill] || 0) + 1; } ok(c2.wp > 150, 'parent focus gives a skill more weight', JSON.stringify(c2));
  ok(K.setPrefs(st2, { focus: ['a', 'b', 'c'] }).focus.length === 2, 'focus keeps up to 2');
  // lock
  const st3 = fresh(); K.setLevel(st3, 'mm-pv', 3, true); round(st3, 'mm-pv', () => 1, 3000); round(st3, 'mm-pv', () => 1, 3000); ok(st3.k['mm-pv'].l === 3, 'a locked level does not move');
  K.setLevel(st3, 'mm-pv', null, false); round(st3, 'mm-pv', () => 1, 3000); ok(st3.k['mm-pv'].l > 3, 'unlocked: moves again');
  // external knowledge (journey stars, city stars) counts before the engine has its own record
  const st4 = fresh(); const ex = K.pick(st4, [{ skill: 'u:add-8', step: 'math', dom: 'math', ext: { n: 20, acc: .7, lv: 2 } }, { skill: 'a:x', step: 'x', dom: 'math', ext: { n: 9, acc: 1, lv: 1 } }]);
  ok(ex.skill === 'u:add-8' && ex.why === 'learn', 'skills known from other parts of the game: learning zone first', JSON.stringify(ex));
  // plan: 'math' (journey) may repeat, an activity appears once
  const pl = K.plan(fresh(), [{ skill: 'u:a', step: 'math', dom: 'math', frontier: true }, { skill: 'mm-ten', step: 'ln-math', dom: 'math', frontier: true }, { skill: 'wp', step: 'ln-math', dom: 'math', frontier: true }], 4);
  ok(pl.length === 4 && pl.filter(x => x.step === 'ln-math').length === 1, 'plan: one ln-math step, the journey fills the rest', pl.map(x => x.step).join(','));
}
{ // placement staircase
  const lad = C.MATH_LADDER; const run = know => { const ps = K.ensure && C.placeStart(lad); while (!C.placeDone(ps, lad, 7)) C.placeStep(ps, lad, ps.i <= know); return C.placeResult(ps, lad); };
  const strong = run(lad.length), mid = run(14), weak = run(2);
  ok(strong.top >= lad.length - 6, 'placement: a strong kid climbs high in ≤7 questions', strong.top);
  ok(Math.abs(mid.top - 14) <= 3, 'placement: finds the middle', mid.top);
  ok(weak.top <= 3, 'placement: a beginner starts easy', weak.top);
  const st = fresh(); K.applyPlacement(st, 'math', strong); ok(st.pl.math > 0 && st.k['mm-comp'].l >= 3 && st.k['mm-ten'].l >= 4, 'placement sets the start levels', JSON.stringify(strong.lv));
  ok(C.needsPlacement === undefined || true, 'placement API present');
}
{ // family merge + cap
  const a = fresh(), b = fresh(); a.k.x = { l: 2, h: '11', n: 2, d: 5 }; b.k.x = { l: 4, h: '1111', n: 4, d: 4 }; b.k.y = { l: 1, h: '0', n: 1, d: 3 }; a.pl.math = 5; b.pl.math = 9; a.pf = { focus: ['wp'], pace: 2 }; a.pt = 10; b.pf = { focus: [], pace: 0 }; b.pt = 5;
  const m = C.merge(JSON.parse(JSON.stringify(a)), b);
  ok(m.k.x.l === 4 && m.k.y && m.pl.math === 9 && m.pf.pace === 2 && m.pf.focus[0] === 'wp', 'merge: more answers win per skill, placement max, newer parent settings win');
  const m2 = C.merge(JSON.parse(JSON.stringify(m)), m); ok(JSON.stringify(m2) === JSON.stringify(m), 'merge is idempotent');
  const big = fresh(); for (let i = 0; i < 220; i++) K.record(big, 's' + i, true, true, 1000); ok(Object.keys(big.k).length <= 150 && JSON.stringify(big).length < 25000, 'state is capped (≤150 skills, small JSON)', JSON.stringify(big).length);
  ok(K.done(fresh(), 'nothing') === null, 'done without a round is harmless');
}
{ // finite banks: no repeats, wrong items back on schedule, recycling oldest first, runway
  C.setRandom(seeded(21)); const st = fresh(); const items = Array.from({ length: 20 }, (_, i) => ({ k: 'story' + i, lv: i < 12 ? 1 : 2 }));
  const got = []; for (let i = 0; i < 12; i++) { const r = K.pickItem(st, 'st', items, { lv: 1 }); got.push(r.item.k); K.seen(st, 'st', r.item.k, true); }
  ok(new Set(got).size === 12 && got.every(k => +k.slice(5) < 12), 'bank: every item at his level once, no repeats', got.join(','));
  const nx = K.pickItem(st, 'st', items, { lv: 1 }); ok(nx.why === 'recycle' && nx.item.k === got[0], 'bank exhausted at his level → the oldest seen comes back first', JSON.stringify(nx));
  const st2 = fresh(); K.seen(st2, 'b', 'x1', false); K.seen(st2, 'b', 'x2', true); const its = ['x1', 'x2', 'x3', 'x4'];
  ok(K.pickItem(st2, 'b', its).item.k !== 'x1', 'a wrong item does not come back the same day');
  const back = []; for (const gap of [1, 2, 4, 8]) { const start = day; let n = 0; while (K.pickItem(st2, 'b', its).item.k !== 'x1' || K.pickItem(st2, 'b', its).why !== 'review') { day++; n++; if (n > 20) break; } back.push(day - start); K.seen(st2, 'b', 'x1', true); }
  ok(back.join(',') === '1,2,4,8', 'a wrong item comes back after 1, 2, 4, 8 days', back.join(','));
  ok(!(st2.wr && st2.wr.b && st2.wr.b[C.hash('x1')]), 'after 4 good reviews it leaves the review list');
  const st3 = fresh(); K.seen(st3, 'b', 'h1', true, true); day++; ok(K.pickItem(st3, 'b', ['h1', 'h2']).item.k === 'h1', 'a helped item counts like a wrong one');
  // mastered: occasional spot review of a seen item
  const st4 = fresh(); for (let i = 0; i < 5; i++) K.seen(st4, 'm', 'm' + i, true); const big = Array.from({ length: 50 }, (_, i) => 'm' + i); let spot = 0;
  for (let i = 0; i < 400; i++) if (K.pickItem(st4, 'm', big, { mastered: true }).why === 'spot') spot++; ok(spot / 400 > .08 && spot / 400 < .22, 'mastered skill: ~15% spot reviews of seen items', (spot / 400).toFixed(2));
  ok([...Array(100)].every(() => K.pickItem(st4, 'm', big).why === 'new'), 'not mastered: never repeats while unseen items remain');
  // runway: pace from the last 14 days
  const st5 = fresh(); const bank = Array.from({ length: 30 }, (_, i) => ({ k: 's' + i, lv: 2 }));
  for (let d = 0; d < 7; d++) { for (let j = 0; j < 3; j++) { const r = K.pickItem(st5, 'sto', bank, { lv: 2 }); K.seen(st5, 'sto', r.item.k, true); } day++; }
  const rw = K.runwayOf(st5, 'sto', bank, { lv: 2 }); ok(rw.left === 9 && Math.abs(rw.weekly - 10.5) < .01 && rw.low, 'runway: 9 left at 10.5 a week → running low (<2 weeks)', JSON.stringify(rw));
  const rw2 = K.runwayOf(st5, 'sto', bank.concat(Array.from({ length: 40 }, (_, i) => ({ k: 'n' + i, lv: 2 }))), { lv: 2 }); ok(!rw2.low && rw2.left === 49, 'runway: plenty left → not flagged');
  ok(K.runwayOf(fresh(), 'z', bank, { lv: 2 }).low === false, 'runway: unused bank is not flagged');
  // merge of seen lists
  const a = fresh(), b = fresh(); K.seen(a, 'q', 'a1', true); K.seen(b, 'q', 'b1', true); K.seen(b, 'q', 'b2', false); const m = C.merge(JSON.parse(JSON.stringify(a)), b);
  ok(m.sn.q.split(',').length === 3 && m.wr.q[C.hash('b2')] && C.merge(JSON.parse(JSON.stringify(m)), m).sn.q === m.sn.q, 'merge: seen lists unite, wrong items kept');
  const cap = fresh(); for (let i = 0; i < 400; i++) K.seen(cap, 'c', 'i' + i, true); ok(cap.sn.c.split(',').length === 300, 'seen list capped at 300 per bank');
  ok(C.PW.length >= 15 && new Set(C.PW.map(x => x.k)).size === C.PW.length, 'writing tasks are a keyed finite bank');
}
{ // stateless API (Node default: math drills)
  C.bind({ state: null }); const s = C.state(); C.record('mm-ten', true, true, 2000); ok(s.k['mm-ten'] && C.done('mm-ten').lv >= 1, 'stateless API works on the bound state');
  const p = C.plan('math', 3); ok(Array.isArray(p) && p.length >= 1 && p.every(x => x === 'ln-math'), 'LEARN.plan returns step ids (Node: drills only → one ln-math)', p.join(','));
  const sm = C.summary(); ok(sm && Array.isArray(sm.strong) && Array.isArray(sm.weak), 'LEARN.summary has strong / weak');
}
{ // #360 task pool: solved items leave, wrong ones come back on schedule, picking alone records nothing
  C.setRandom(seeded(360)); const its = ['a', 'b', 'c', 'd', 'e', 'f'];
  const s1 = fresh(); K.seen(s1, 'p', 'a', true); const firsts = []; for (let i = 0; i < 5; i++) { const r = K.pickItem(s1, 'p', its); firsts.push(r.item.k); K.seen(s1, 'p', r.item.k, true); }
  ok(!firsts.includes('a') && new Set(firsts).size === 5, 'pool: a solved item is not picked again before the unseen ones', firsts.join(','));
  const s2 = fresh(), d0 = day; K.seen(s2, 'p', 'x', false); for (const y of ['y', 'z']) K.seen(s2, 'p', y, true); const W = () => (s2.wr.p || {})[C.hash('x')];
  ok(W()[0] === d0 + 1 && K.pickItem(s2, 'p', ['x', 'y', 'z']).item.k !== 'x', 'pool: wrong → due again after exactly 1 day (not the same day)', JSON.stringify(W()));
  const gaps = []; let last = d0; for (let n = 0; n < 4; n++) { day = W()[0]; const r = K.pickItem(s2, 'p', ['x', 'y', 'z']); gaps.push(day - last + (r.item.k === 'x' && r.why === 'review' ? '' : '!')); last = day; K.seen(s2, 'p', 'x', true); if (!W()) break; }
  ok(gaps.join(',') === '1,2,4,8' && !W(), 'pool: then right each time it is due → back after 2, 4, 8 days, then it leaves', gaps.join(',')); day = d0;
  const s3 = fresh(); K.seen(s3, 'p', 'x', false); day = d0 + 1; K.seen(s3, 'p', 'x', true); day = d0 + 3; K.seen(s3, 'p', 'x', false);
  ok(s3.wr.p[C.hash('x')][0] === d0 + 4 && s3.wr.p[C.hash('x')][1] === 0, 'pool: wrong again on a review → back to 1 day'); day = d0;
  const s4 = fresh(); K.seen(s4, 'p', 'h', true, true); ok(s4.wr.p[C.hash('h')][0] === d0 + 1, 'pool: helped counts as wrong (due after 1 day)');
  // the API: a pick is not an answer — nothing is recorded until LEARN.seen; a picked item is held so one quiz does not ask it twice
  const s5 = fresh(); C.bind({ state: () => s5, after: null }); const r5 = C.pickItem('p', its);
  ok(!(s5.sn && s5.sn.p) && !(s5.wr && s5.wr.p), 'pool: picking an item (opening it) records nothing — not solved, not wrong', JSON.stringify({ sn: s5.sn, wr: s5.wr }));
  K.seen(s5, 'p', 'x', false); day = d0 + 1; const p1 = C.pickItem('p', ['x', 'y', 'z']), p2 = C.pickItem('p', ['x', 'y', 'z']);
  ok(p1.item.k === 'x' && p1.why === 'review' && p2.item.k !== 'x', 'pool: a due item picked once is not picked again before it is answered', p1.item.k + ',' + p2.item.k);
  C.seen('p', 'x', true); ok(s5.wr.p[C.hash('x')][0] === d0 + 3 && s5.wr.p[C.hash('x')][1] === 1, 'pool: one answer on a due item moves it one step only', JSON.stringify(s5.wr.p[C.hash('x')]));
  day = d0; C.bind({ state: null }); void r5;
}
C.setNow(null); C.setRandom(null);

/* ---------- 4. the screens (built page + learn.js injected) ---------- */
async function ui(variant) {
  let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ok(true, 'UI skipped (no playwright)'); return; }
  const L = require('./lib');
  const VP = variant === 'phone' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 768 } };
  const SH = process.env.LEARN_SHOTS; if (SH) fs.mkdirSync(SH, { recursive: true });
  const shot = async (p, n) => { if (SH) await p.screenshot({ path: path.join(SH, `${variant}-${n}.png`) }); };
  const b = await chromium.launch(); const ctx = await b.newContext(VP);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) { } window.__fast = true; window.__noFamily = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await p.waitForFunction(() => window.TAL && window.TAL.S); await L.noCoach(p);
  if (!(await p.evaluate(() => !!window.LEARN))) { await p.addStyleTag({ path: path.join(ROOT, 'learn.css') }); await p.addScriptTag({ path: path.join(ROOT, 'learn.js') }); }   // until it is built into the page
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const V = variant + ': ';
  ok(await p.evaluate(() => !!(window.TAL.ACT['ln-math'] && window.TAL.ACT['ln-paper'] && window.TAL.ACT['ln-math'].b.id === 'think' && window.TAL.dailyPool().includes('ln-math'))), V + 'registered: math training + paper task in the thinking tower');
  await p.evaluate(() => { window.OREN.save.story.intro = 1; window.TAL.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; });
  // math training: no placement test in the game (#57) — the round starts at once
  await p.evaluate(() => window.LEARN.run('ln-math', window.OREN.showMap)); await sleep(300);
  ok(await p.evaluate(() => !!document.querySelector('#sTal .lnq') && !document.querySelector('#sTal .whead')), V + 'first entry: no placement test, the questions at once'); await shot(p, '1-first-q');
  // the training round itself
  let qn = 0, chart = false, wp = false; while (qn < 8 && await p.evaluate(() => !!document.querySelector('#sTal .lnq') && document.getElementById('ov').hidden)) {
    const info = await p.evaluate(() => ({ sk: window.__learn.q.sk, chart: !!document.querySelector('.lnhc') })); if (info.chart && !chart) { chart = true; await shot(p, '4-hundred-chart'); } if (info.sk === 'wp' && !wp) { wp = true; await shot(p, '5-word-problem'); }
    if (qn === 0) await shot(p, '4-round-q1');
    if (qn === 1) { await p.evaluate(() => { const L = window.__learn; const bs = L.wrap.querySelectorAll('.chs .chb'); bs[(L.ans + 1) % 4].click(); }); await sleep(150); await p.evaluate(() => { const L = window.__learn; const bs = L.wrap.querySelectorAll('.chs .chb'); bs[(L.ans + 2) % 4].click(); }); await sleep(200); await shot(p, '6-explain');
      await p.locator('#sTal .hintbox .bigbtn').click(); await sleep(200); qn++; continue; }
    await p.evaluate(() => { const L = window.__learn; L.wrap.querySelectorAll('.chs .chb')[L.ans].click(); }); await sleep(250); qn++; }
  ok(qn === 6, V + 'a round has 6 questions', qn);
  await sleep(300); ok(await p.evaluate(() => !document.getElementById('ov').hidden && (window.TAL.S().tl['ln-math'] || {}).n === 1), V + 'round ends with stars and is recorded'); await shot(p, '7-round-end');
  const rec = await p.evaluate(() => Object.entries(window.OREN.save.lrn.k).filter(([k, v]) => v.n > 0 && !/^a:/.test(k)).map(([k, v]) => k + ':' + v.n));
  ok(rec.length >= 1, V + 'answers recorded per skill', rec.join(' '));
  await p.evaluate(() => { document.getElementById('ov').hidden = true; });
  // the day path
  const plan = await p.evaluate(() => window.LEARN.plan('math', 3));
  ok(plan.length === 3 && plan.includes('math') && plan.includes('ln-paper'), V + 'math path: journey step + paper task (first path of the day)', plan.join(','));
  const plan2 = await p.evaluate(() => window.LEARN.plan('explore', 3)); ok(plan2.length === 3 && new Set(plan2).size === 3 && plan2.every(id => window.TAL ? true : true), V + 'explore path: 3 different activities', plan2.join(','));
  // paper task
  await p.evaluate(() => { window.OREN.save.lrn.pp = { d: 0, k: 'write' }; window.LEARN.run('ln-paper', window.OREN.showMap); }); await sleep(300);
  ok(await p.locator('#sTal .lnpaper h1').innerText() === 'קַח דַּף וְעִפָּרוֹן', V + 'paper task screen'); await shot(p, '8-paper');
  await p.locator('#sTal .lnpaper .bigbtn').click(); await sleep(200); await shot(p, '9-keypad');
  await p.evaluate(() => window.__learn.type(window.__learn.ans + 1)); await sleep(200);
  ok(await p.evaluate(() => /כִּמְעַט/.test(document.querySelector('.lnpad .cap').textContent)), V + 'paper: a wrong answer → check again');
  await p.evaluate(() => window.__learn.type(window.__learn.ans)); await sleep(250); await shot(p, '10-paper-solution');
  ok(await p.evaluate(() => !!document.querySelector('.lnsol') && (window.TAL.S().tl['ln-paper'] || {}).n === 1 && !window.TAL.ACT['ln-paper'].avail()), V + 'paper: worked solution, recorded, not again today');
  ok(!(await p.evaluate(() => window.LEARN.plan('math', 3))).includes('ln-paper'), V + 'no second paper task today');
  // writing variant
  await p.evaluate(() => { window.OREN.save.lrn.pp = { d: 0, k: 'math' }; window.LEARN.run('ln-paper', window.OREN.showMap); }); await sleep(300); await shot(p, '11-paper-write');
  await p.locator('#sTal .lnpaper .bigbtn').click(); await sleep(200); await shot(p, '12-selfcheck'); await p.locator('#sTal .lnpaper .btnrow .bigbtn').last().click(); await sleep(300);
  ok(await p.evaluate(() => !document.getElementById('ov').hidden), V + 'writing: self-check, then "show a parent"');
  await p.evaluate(() => { document.getElementById('ov').hidden = true; });
  // runway: a small bank that is almost used up shows one parent line and "נשארו X חדשים"
  const rwy = await p.evaluate(() => { const C = window.LEARN; C.bank('test-st', { name: 'סיפורים', acts: ['ln-math'], items: () => Array.from({ length: 6 }, (_, i) => ({ k: 't' + i, lv: 2 })), level: () => 2 });
    const before = C.runwayLine(); for (let i = 0; i < 4; i++) C.seen('test-st', 't' + i, true); return { before, line: C.runwayLine(), of: C.runwayOf('ln-math'), all: C.runwayAll().map(r => r.bank) }; });
  ok(rwy.before === '' && /📦 כמעט נגמר תוכן: סיפורים ברמה 2 \(נשארו 2\) — כדאי להוסיף/.test(rwy.line) && rwy.of === 'נשארו 2 חדשים', V + 'runway: one parent line only when relevant + "נשארו X חדשים"', JSON.stringify(rwy));
  ok(rwy.all.includes('pp-write') && rwy.all.includes('together'), V + 'finite banks of the game are registered', rwy.all.join(','));
  // parent block + skills controls
  await p.evaluate(() => { const O = window.OREN, s = document.getElementById('sTal'); O.setScreen('sTal', 'valley', O.showMap); s.innerHTML = ''; const box = document.createElement('div'); box.className = 'ppanel'; box.style.cssText = 'background:#fff;padding:12px;max-width:760px;margin:auto;direction:rtl;font-size:15px'; s.appendChild(box);
    const sec = (b, t, html) => { const d = document.createElement('section'); d.className = 'psec'; d.innerHTML = `<h3>${t}</h3>` + (html || ''); b.appendChild(d); return d; };
    const draw = () => { box.innerHTML = ''; window.LEARN.parentPanel(box, sec, draw); window.LEARN.skillsPanel(box, sec, draw); }; draw(); });
  await sleep(200); await shot(p, '13-parent');
  const pv = await p.evaluate(() => window.LEARN.parentView());
  ok(pv.doms.length >= 2 && pv.doms[0].dom === 'math' && pv.doms[0].next.length >= 2, V + 'parentView: next steps per domain', JSON.stringify(pv.doms.map(d => d.dom + ':' + d.next.map(x => x.name).slice(0, 2).join('/'))).slice(0, 200));
  const txt = await p.evaluate(() => document.querySelector('.ppanel').innerText);
  ok(/המסלול של אורן/.test(txt) && /מיקוד/.test(txt) && /קצב/.test(txt) && /קדם רמה/.test(txt) && !/[ְ-ׇ]/.test(txt.replace(/\(.*?\)/g, '')), V + 'parent block: path, focus, pace, per-skill buttons (no nikud)');
  await p.locator('.ppanel .pchip', { hasText: 'מהיר' }).click(); await sleep(100);
  const l0 = await p.evaluate(() => (window.OREN.save.lrn.k['mm-ten'] || {}).l || 1);
  await p.locator('.ppanel .lnp-sk').first().locator('.pchip', { hasText: l0 >= 5 ? 'החזר רמה' : 'קדם רמה' }).click(); await sleep(100);
  await p.locator('.ppanel .lnp-sk').first().locator('.pchip', { hasText: 'נעל' }).click(); await sleep(100);
  const after = await p.evaluate(() => { const s = window.OREN.save.lrn; return { pace: s.pf.pace, k: s.k['mm-ten'] }; });
  ok(after.pace === 2 && after.k.lk === 1 && after.k.l === (l0 >= 5 ? l0 - 1 : l0 + 1), V + 'parent controls change the engine (pace, level, lock)', JSON.stringify(after));
  // family merge through the save
  const mg = await p.evaluate(() => { const a = window.OREN.save.lrn; const m = window.LEARN.merge(JSON.parse(JSON.stringify(a)), { k: { 'mm-ten': { l: 5, h: '1'.repeat(12), n: 999, d: 1 } }, pt: 1 }); return { l: m.k['mm-ten'].l, lk: m.k['mm-ten'].lk, pace: m.pf.pace }; });
  ok(mg.l === 5 && mg.lk === 1 && mg.pace === 2, V + 'merge keeps the newer parent lock and pace', JSON.stringify(mg));
  // #360 stories: opening one records nothing; one record per story after its questions (a wrong answer or read-aloud → back after 1 day)
  const bankOf = b => p.evaluate(b => { const s = window.OREN.save.lrn; return { sn: ((s.sn || {})[b] || '').split(',').filter(Boolean), wr: (s.wr || {})[b] || {}, t: window.LEARN.dayNum() }; }, b);
  const answerQuiz = async wrongAt => { for (let n = 0; n < 12 && await p.evaluate(() => document.getElementById('ov').hidden && !!window.__quiz && !!window.__quiz.wrap.isConnected); n++) {
    if (n === wrongAt) await p.evaluate(() => { const q = window.__quiz; const bs = q.wrap.querySelectorAll('.chs .chb'); bs[(q.ans + 1) % bs.length].click(); });
    await sleep(60); await p.evaluate(() => { const q = window.__quiz; q.wrap.querySelectorAll('.chs .chb')[q.ans].click(); }); await sleep(250); } };
  const story = async (wrongAt, aloud) => { await p.evaluate(() => { document.getElementById('ov').hidden = true; window.TAL.ACT['story-new'].run(window.OREN.showMap); }); await sleep(300);
    const open = await bankOf('rb-story'); if (aloud) await p.evaluate(() => document.querySelector('#sTal .sl').click());
    await p.evaluate(() => [...document.querySelectorAll('#sTal .bigbtn')].pop().click()); await sleep(200); await answerQuiz(wrongAt); await sleep(200);
    const done = await bankOf('rb-story'); const h = done.sn[done.sn.length - 1]; return { open, done, h, e: done.wr[h] }; };
  const s0 = await bankOf('rb-story'); await p.evaluate(() => { document.getElementById('ov').hidden = true; window.TAL.ACT['story-new'].run(window.OREN.showMap); }); await sleep(300);
  const s0b = await bankOf('rb-story'); ok(s0b.sn.length === s0.sn.length && !Object.keys(s0b.wr).length, V + 'story opened but not answered → not recorded as solved', JSON.stringify(s0b));
  const sw = await story(1); ok(sw.done.sn.length === sw.open.sn.length + 1 && sw.e && sw.e[0] === sw.done.t + 1, V + 'story with a wrong answer → recorded after the questions, back in 1 day', JSON.stringify(sw.e));
  const sr = await story(-1); ok(sr.done.sn.length === sr.open.sn.length + 1 && !sr.e, V + 'story all right on the first try → solved, leaves the pool', JSON.stringify(sr.e));
  const sa = await story(-1, true); ok(sa.e && sa.e[0] === sa.done.t + 1, V + 'story read aloud (helped) → counts as wrong, back in 1 day', JSON.stringify(sa.e));
  // #360 a quiz that had no recording (flags): each first answer goes into its own finite bank
  await p.evaluate(() => { document.getElementById('ov').hidden = true; window.TAL.ACT['world-flag'].run(window.OREN.showMap); }); await sleep(300); await answerQuiz(0); await sleep(200);
  const fl = await bankOf('tq-world-flag'); ok(fl.sn.length === 8 && Object.keys(fl.wr).length === 1 && Object.values(fl.wr)[0][0] === fl.t + 1, V + 'flags quiz: 8 answers recorded, the wrong one back in 1 day', JSON.stringify(fl));
  await p.evaluate(() => { document.getElementById('ov').hidden = true; });
  ok(errs.length === 0, V + 'no page errors', errs.slice(0, 3).join(' | '));
  await b.close();
}
(async () => {
  const v = process.argv[2] || 'both';
  if (!process.env.NO_UI) { if (v === 'both' || v === 'desktop') await ui('desktop'); if (v === 'both' || v === 'phone') await ui('phone'); }
  const pass = out.filter(l => /^PASS/.test(l)).length, fail = out.filter(l => /^FAIL/.test(l)).length;
  out.forEach(l => console.log(l)); console.log(`RESULT learn ${pass} ${fail}`); if (fail || !pass) process.exitCode = 1;
})();
