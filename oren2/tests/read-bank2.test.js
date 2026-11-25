// READBANK2: the graded reading & writing bank — words, sentences, stories, writing tasks.
// Pure Node — loads read-bank2.js without a page. Prints PASS/FAIL lines and a RESULT line (like the other suites).
// WARN lines (ktiv male guesses) are for proofreading only and never fail the run.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'read-bank2.js'));
const R = window.READBANK2;
const out = []; let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; out.push('PASS ' + m); } else { fail++; out.push('FAIL ' + m); } };
const bad = []; const chk = (c, m) => { if (!c) bad.push(m); };
const flush = name => { ok(!bad.length, name + (bad.length ? ': ' + bad.slice(0, 8).join(' | ') + (bad.length > 8 ? ` (+${bad.length - 8})` : '') : '')); bad.length = 0; };
const warns = [];

const NIK = /[֑-ׇ]/;
const { letters, vowels, bare } = R;
const VM = { 'ָ': 'a', 'ַ': 'a', 'ִ': 'i', 'ֹ': 'o', 'ֺ': 'o', 'ֻ': 'u', 'ֵ': 'e', 'ֶ': 'e', 'ְ': 's', 'ֲ': 'h', 'ֱ': 'h', 'ֳ': 'h' };
const vow = m => [...m].map(c => VM[c]).filter(Boolean);
const tok = s => s.split(/\s+/).filter(Boolean);
const lettersOnly = s => [...s].filter(c => c >= 'א' && c <= 'ת').join('');
/* plain (ktiv male) word: the letters of the vocalized word, in order, with only ו / י added */
function plainOK(v, p) {
  if (NIK.test(p)) return 'nikud in plain';
  const a = lettersOnly(v), b = lettersOnly(p); let i = 0;
  for (const c of b) { if (i < a.length && c === a[i]) i++; else if (c !== 'ו' && c !== 'י') return `extra ${c}`; }
  return i === a.length ? '' : 'missing letters';
}
/* a rough guess of the ו / י that ktiv male adds (warnings only, for proofreading) */
function guessAdds(v) {
  const L = letters(v); let n = 0;
  const vv = x => x ? vow(x.m).filter(k => k !== 's') : [];
  L.forEach((x, i) => {
    const nx = L[i + 1], pv = L[i - 1], vs = vow(x.m), last = i === L.length - 1;
    if (vs.includes('o') && x.c !== 'ו' && !(nx && (nx.c === 'ו' || nx.c === 'א')) && !last) n++;      /* holam chaser → ו */
    if (x.m.includes('\u05BB')) n++;                                                              /* qubutz → ו */
    if (vs.includes('i') && nx && nx.c !== 'י' && (vv(nx).length || nx.m.includes('\u05BC') || /[אהחע]/.test(nx.c))) n++;   /* open chirik → י */
    if (x.c === 'י' && i > 0 && !last && (vs.length) && !(pv && /[וי]/.test(pv.c)) && !(nx && /[וי]/.test(nx.c))) n++;      /* consonant yod → יי */
    if (x.c === 'ו' && i > 0 && !last && vs.length && !vs.includes('o')) n++;                      /* consonant vav → וו */
  });
  return n;
}
function textPlain(v, p, where) {
  const A = tok(v), B = tok(p);
  if (A.length !== B.length) { chk(false, `${where}: ${A.length} words vs ${B.length} in plain`); return; }
  A.forEach((w, i) => { const e = plainOK(w, B[i]); chk(!e, `${where}: "${w}" ≠ "${B[i]}" (${e})`);
    if (!e) { const adds = lettersOnly(B[i]).length - lettersOnly(w).length, g = guessAdds(w); if (adds !== g) warns.push(`${w} → ${B[i]} (added ${adds}, guess ${g})`); } });
}

/* ---------- sprite keys from the real sources ---------- */
const tal = fs.readFileSync(path.join(ROOT, 'talents.js'), 'utf8'), idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const block = (s, start) => { const i = s.indexOf(start); let d = 0, j = i + start.length - 1; for (; j < s.length; j++) { if (s[j] === '{') d++; if (s[j] === '}') { d--; if (!d) break; } } return s.slice(i, j); };
const keys = new Set([...block(tal, 'const X={').matchAll(/^\s*(\w+):/gm), ...block(idx, 'const SPR={').matchAll(/^\s*(\w+):/gm)].map(m => m[1]));
R.SPRITES.forEach(k => chk(keys.has(k), 'sprite listed but missing in the game: ' + k)); flush('every sprite key in the bank exists in SPR / X');
const picOK = k => R.isSpr(k) ? keys.has(k) : !/^[a-zA-Z]+$/.test(k) && !/[א-ת]/.test(k);

/* ---------- 1. words ---------- */
const W = R.words;
ok(W.length >= 250 && W.length <= 300, `250-300 words (${W.length})`);
const LV = R.levels.word;
W.forEach(w => {
  chk(w.syl.join('') === w.w, `syllables join: ${w.syl.join('+')} ≠ ${w.w}`);
  chk(w.syl.every(s => NIK.test(s)), `nikud in every syllable: ${w.w}`);
  const e = plainOK(w.w, w.plain); chk(!e, `plain ${w.w} → ${w.plain}: ${e}`);
  if (!e) { const adds = w.plain.length - lettersOnly(w.w).length, g = guessAdds(w.w); if (adds !== g) warns.push(`word ${w.w} → ${w.plain} (added ${adds}, guess ${g})`); }
  chk(R.themes[w.th], `theme ${w.th} (${w.w})`);
  chk(!w.pic || picOK(w.pic), `picture ${w.pic} (${w.w})`);
  chk(Array.isArray(w.v) && w.v.length, `vowels listed: ${w.w}`);
});
flush('words: syllables join to the word, nikud, plain form, theme, picture');
/* one vowel nucleus per syllable (a closing shva, an onset shva in a cluster and a final furtive patach are fine) */
W.forEach(w => w.syl.forEach((s, si) => {
  const L = letters(s); let nuc = 0;
  L.forEach((x, i) => {
    let v = vow(x.m);
    if (x.c === 'ו' && !v.length && x.m.includes('ּ') && (i === 0 || !vow(L[i - 1].m).length)) v = ['u'];
    const furtive = si === w.syl.length - 1 && i === L.length - 1 && i > 0 && /[חעה]/.test(x.c) && v.length === 1 && v[0] === 'a' && L.slice(0, i).some(y => vow(y.m).some(k => k !== 's') || (y.c === 'ו' && y.m.includes('ּ')));
    if (furtive) return;
    v.filter(k => k !== 's').forEach(() => nuc++);
  });
  const shvas = L.map((x, i) => vow(x.m).includes('s') ? i : -1).filter(i => i >= 0);
  if (!nuc && shvas.length === 1 && shvas[0] === 0) nuc = 1;                 /* a lone vocal shva: מְ */
  chk(nuc === 1, `one vowel in syllable "${s}" of ${w.w} (${nuc})`);
  shvas.forEach(i => chk(i === 0 || i === L.length - 1, `shva inside syllable "${s}" of ${w.w}`));
}));
flush('words: every syllable has exactly one vowel (correct split)');
/* levels: 1 a · 2 +i · 3 +o · 4 +u · 5 +e · 6 +shva · 7 chataf / 4+ syllables / dagesh in yod / long compounds */
const NEW = { 2: 'i', 3: 'o', 4: 'u', 5: 'e', 6: 's' };
W.forEach(w => {
  const vs = vowels(w.w), L = w.lv;
  if (L < 7) { const allowed = LV[L - 1].v; vs.forEach(v => chk(allowed.includes(v), `level ${L} ${w.w} uses ${v}`));
    chk(!vs.includes('h'), `chataf before level 7: ${w.w}`);
    chk(w.syl.length <= (L === 1 ? 2 : 3), `level ${L} syllables ≤ ${L === 1 ? 2 : 3}: ${w.w}`);
    if (NEW[L]) chk(vs.includes(NEW[L]) || (L === 2 && vs.join() === 'a' && w.syl.length === 3), `level ${L} ${w.w} must use the new vowel ${NEW[L]}`); }
  else chk(vs.includes('h') || w.syl.length >= 4 || letters(w.w).some(x => x.c === 'י' && x.m.includes('\u05BC')) || lettersOnly(w.w).length >= 6, `level 7 ${w.w} is not harder`);
});
flush('words: levels follow the nikud ladder (monotonic)');
for (let L = 1; L <= 7; L++) ok(W.filter(w => w.lv === L).length >= 30, `level ${L} has 30+ words (${W.filter(w => w.lv === L).length})`);
const avgLen = L => { const a = W.filter(w => w.lv === L); return a.reduce((s, w) => s + lettersOnly(w.w).length, 0) / a.length; };
ok(avgLen(1) < avgLen(7) && avgLen(6) <= avgLen(7), 'words get longer with the level');
chk(new Set(W.map(w => w.w)).size === W.length, 'duplicate words: ' + W.map(w => w.w).filter((w, i, a) => a.indexOf(w) !== i));
chk(new Set(W.map(w => w.plain)).size === W.length, 'duplicate plain words');
const pics = W.filter(w => w.pic).map(w => w.pic); chk(new Set(pics).size === pics.length, 'two words share a picture: ' + pics.filter((p, i, a) => a.indexOf(p) !== i));
R.NEAR.forEach(g => g.forEach(x => chk(W.some(w => w.w === x), 'near-group word not in the bank: ' + x)));
flush('words: no duplicates, pictures unique, look-alike groups valid');
ok(W.filter(w => w.pic).length >= 200, `200+ words with a picture (${W.filter(w => w.pic).length})`);

/* ---------- 2. sentences ---------- */
const S = R.sentences;
ok(S.length >= 120, `120+ sentences (${S.length})`);
const RANGE = { 1: [2, 3], 2: [3, 4], 3: [4, 5], 4: [5, 6], 5: [6, 8], 6: [7, 8] };
let prevLv = 0;
S.forEach((s, i) => {
  const n = tok(s.t).length; chk(n >= RANGE[s.lv][0] && n <= RANGE[s.lv][1], `sentence level ${s.lv} has ${n} words: ${s.t}`);
  chk(s.lv >= prevLv, `levels in order at ${i}`); prevLv = s.lv;
  chk(NIK.test(s.t) && NIK.test(s.q), `nikud: ${s.t}`);
  textPlain(s.t, s.p, 'sentence'); textPlain(s.q, s.qp, 'question');
  const opts = [s.a, ...s.ds]; chk(opts.length === 3 && new Set(opts).size === 3, `3 different options: ${s.t}`);
  chk(opts.every(o => (o[0] === '@') === (s.a[0] === '@')), `options all pictures or all words: ${s.t}`);
  opts.filter(o => o[0] === '@').forEach(o => chk(picOK(o.slice(1)), `picture option ${o}: ${s.t}`));
  opts.filter(o => o[0] !== '@').forEach(o => chk(NIK.test(o) || /^\d+$/.test(o), `nikud in option ${o}`));
});
chk(new Set(S.map(s => s.t)).size === S.length, 'duplicate sentences');
flush('sentences: graded length, nikud, plain aligned, exactly one correct answer');
for (let L = 1; L <= 6; L++) ok(S.filter(s => s.lv === L).length >= 20, `sentence level ${L} has 20+`);

/* ---------- 3. stories ---------- */
const ST = R.stories;
ok(ST.length === 40, `40 stories (${ST.length})`);
const oldTitles = [...tal.matchAll(/\{t:'([^']+)',spr:/g)].map(m => m[1]);
const gapsSrc = fs.existsSync(path.join(ROOT, 'gaps.js')) ? fs.readFileSync(path.join(ROOT, 'gaps.js'), 'utf8') : '';
const gapTitles = [...gapsSrc.matchAll(/\{t:'([^']+)',spr:/g)].map(m => m[1]);
prevLv = 0;
ST.forEach(st => {
  chk(st.s.length >= 3 && st.s.length <= 10, `3-10 sentences: ${st.t}`);
  chk(st.lv >= prevLv, 'story levels in order: ' + st.t); prevLv = st.lv;
  chk(st.s.length === st.p.length, `plain has every sentence: ${st.t}`);
  st.s.forEach((x, i) => { chk(NIK.test(x), `nikud: ${x}`); textPlain(x, st.p[i] || '', 'story ' + st.t); });
  textPlain(st.t, st.tp, 'title');
  chk(!oldTitles.includes(st.t) && !gapTitles.includes(st.t), 'title already used: ' + st.t);
  chk(st.spr.length === 2 && st.spr.every(picOK), 'story pictures: ' + st.t);
  chk(st.q.length === 3 && st.q.map(q => q[0]).join() === 'lit,seq,inf', `3 questions lit/seq/inf: ${st.t}`);
  st.q.forEach(([, q, qp, a, ds]) => { textPlain(q, qp, 'story question'); const o = [a, ...ds]; chk(o.length === 3 && new Set(o).size === 3, `3 different answers: ${q}`);
    o.forEach(x => chk(NIK.test(x) || /^\d+$/.test(x), 'nikud in answer ' + x)); });
});
chk(new Set(ST.map(s => s.t)).size === ST.length, 'duplicate story titles');
const avgS = L => { const a = ST.filter(s => s.lv === L); return a.reduce((t, s) => t + s.s.length, 0) / a.length; };
for (let L = 2; L <= 5; L++) chk(avgS(L) > avgS(L - 1), `stories get longer: level ${L}`);
flush('stories: 3-10 sentences, graded, plain aligned word by word, 3 questions with one answer');
/* nothing copied from the other banks */
global.window = {}; let thinkTexts = [];
try { require(path.join(ROOT, 'think-bank.js')); thinkTexts = window.THINK_BANK.RC.map(r => r.t); } catch (e) { }
window.READBANK2 = R;
const allMine = [...S.map(s => s.t), ...ST.flatMap(s => s.s)];
allMine.forEach(t => chk(!thinkTexts.some(x => x.includes(t)) && !gapsSrc.includes(t) && !tal.includes(t), 'already in another bank: ' + t));
flush('sentences and stories are new (not in think-bank / gaps / talents)');

/* ---------- 4. writing ---------- */
const WR = R.writing;
WR.copy.forEach(c => chk(c.letters.join('') === (W.find(x => x.w === c.w).plain) && c.letters.length, 'copy letters: ' + c.w)); flush('writing: copy items');
ok(WR.dict.length >= 200, `dictation items (${WR.dict.length})`);
const plains = new Set(W.map(w => bare(w.w)));
WR.miss.forEach(m => {
  const L = letters(m.w); chk(L[m.i].c === m.ans, 'missing letter is the answer: ' + m.w);
  chk(m.opts.length === 3 && new Set(m.opts).size === 3 && m.opts.filter(o => o === m.ans).length === 1, 'one correct option: ' + m.w);
  chk(m.show.includes('◌') && m.show.replace('◌', m.ans) === m.w, 'gap shown in place: ' + m.w);
  m.opts.filter(o => o !== m.ans).forEach(o => { const cand = L.map((x, j) => j === m.i ? o : x.c).join(''); chk(!plains.has(cand), `distractor makes another word: ${m.w} → ${cand}`);
    chk(!R.sameSound(o, m.ans) || R.FINAL[m.ans] === o, `distractor sounds the same: ${m.w} ${o}`); });
  if (R.FINAL[m.ans]) chk(m.opts.includes(R.FINAL[m.ans]), 'final letter offered against its regular form: ' + m.w);
});
flush('writing: missing letter — one answer, final letters, no other word');
ok(WR.miss.filter(m => R.FINAL[m.ans]).length >= 60, `final-letter items (${WR.miss.filter(m => R.FINAL[m.ans]).length})`);
WR.order.forEach(o => { chk(o.words.join(' ') === o.t, 'order words: ' + o.t); chk(new Set(o.words).size === o.words.length, 'repeated word in order item: ' + o.t); textPlain(o.t, o.p, 'order'); });
chk(new Set(WR.order.map(o => o.t)).size === WR.order.length, 'duplicate order sentences');
flush('writing: build-a-sentence items');
WR.paper.forEach(p => { textPlain(p.t, p.p, 'paper'); chk(p.chk.length >= 1 && p.chk.every(c => NIK.test(c)), 'check lines with nikud: ' + p.t);
  if (p.ex) chk(R.examples(p.ex, 4).length >= 2, 'example words for ' + p.ex); });
for (let L = 1; L <= 7; L++) chk(WR.paper.filter(p => p.lv === L).length >= 3, 'paper tasks at level ' + L);
ok(WR.paper.some(p => p.par) && WR.paper.some(p => !p.par), 'paper tasks: self-check and parent-check');
ok(WR.paper.some(p => /שֶׁמַּתְחִילוֹת בְּ-מ/.test(p.t)), 'the "3 words that start with מ" task is there');
flush('writing: paper tasks');

/* ---------- 5. API ---------- */
ok(typeof R.speakList === 'function' && typeof R.itemsFor === 'function' && R.levels && R.words && R.sentences && R.stories && R.writing, 'READBANK2 exposes words, sentences, stories, writing, levels, speakList, itemsFor');
const sp = R.speakList(); ok(W.every(w => sp.includes(w.w)) && S.every(s => sp.includes(s.t)) && ST.every(s => s.s.every(x => sp.includes(x))), 'speakList has every word, sentence and story line');
['word', 'sent', 'story', 'copy', 'dict', 'miss', 'order', 'paper'].forEach(sk => { for (let L = sk === 'dict' ? 2 : 1; L <= R.MAXLV[sk]; L++) chk(R.itemsFor(sk, L).length > 0, `itemsFor(${sk}, ${L})`); });
flush('itemsFor gives items for every skill and level');
ok(typeof R.register === 'function' && R.register() === false, 'register() is safe without a page');
ok(Object.keys(R.SKILLS).every(k => !NIK.test(R.SKILLS[k])) && Object.values(R.levels).every(a => a.every(x => !NIK.test(x.p || ''))), 'parent text has no nikud');

/* ---------- 6. in the page (skipped with NOBROWSER=1): every activity runs, records its card, no errors ---------- */
async function browser() {
  let chromium; try { ({ chromium } = require('playwright')); } catch (e) { out.push('SKIP browser (no playwright)'); return; }
  const L = require('./lib');
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) { } window.__fast = true; window.__noFamily = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(L.URL); await L.noCoach(p);
    const built = await p.evaluate(() => !!window.READBANK2);
    if (!built) await p.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'read-bank2.js'), 'utf8') });
    await p.evaluate(() => { const O = window.OREN; O.save.story.intro = 1; O.save.set = { brk: 0, hide: {} }; O.save.prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; O.showMap(); });
    const reg = await p.evaluate(() => { const T = window.TAL, R = window.READBANK2; return { reg: !!R._reg, acts: ['read-first', 'read-pw', 'read-wp', 'read-build', 'read-sent', 'story-new', 'write-mix', 'write-paper'].filter(id => T.ACT[id]),
      inStories: T.BUILD.find(x => x.id === 'stories').acts.some(a => a.id === 'story-new'), inWrite: T.BUILD.find(x => x.id === 'write').acts.filter(a => /^write-(mix|paper)$/.test(a.id)).length }; });
    ok(reg.reg && reg.acts.length === 8 && reg.inStories && reg.inWrite === 2, 'register(): library ids kept, story-new + write-mix + write-paper added — ' + JSON.stringify(reg));
    /* the voice layer's full spelling of every word matches the plain form */
    const fsDiff = await p.evaluate(() => window.__fullSpell ? window.READBANK2.words.filter(w => window.__fullSpell(w.w) !== w.plain).map(w => w.w + ' ' + window.__fullSpell(w.w) + '/' + w.plain) : null);
    if (fsDiff && fsDiff.length) warns.push('voice full spelling differs: ' + fsDiff.join(', '));
    const ovOpen = () => p.evaluate(() => !document.querySelector('#ov').hidden);
    const closeOv = () => p.evaluate(() => { const b = [...document.querySelectorAll('#ov .bigbtn')].pop(); if (b) b.click(); });
    const tl = id => p.evaluate(id => window.TAL.S().tl[id] || null, id);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    async function quizLoop(n = 60) { for (let k = 0; k < n; k++) { if (await ovOpen()) return true;
      await p.evaluate(() => { const q = window.__quiz; if (!q || !q.wrap.isConnected) return; const c = q.wrap.querySelector('.chs'); if (c && c.children[q.ans] && !c.children[q.ans].disabled) c.children[q.ans].click(); }); await sleep(120); } return ovOpen(); }
    async function tilesLoop(n = 300) { for (let k = 0; k < n; k++) { if (await ovOpen()) return true;
      await p.evaluate(() => { const r = window.__rb2; if (!r || !r.row || !r.row.isConnected) return;
        if (r.miss) { const b = [...r.row.children].find(x => x.textContent === r.miss.ans && !x.disabled); if (b) b.click(); return; }
        const b = [...r.row.children].find(x => !x.disabled && x.dataset.t === r.need[r.k]); if (b) b.click(); }); await sleep(60); } return ovOpen(); }
    const run = (id) => p.evaluate(id => window.TAL.ACT[id].run(() => window.OREN.showMap()), id);
    for (const id of ['read-first', 'read-pw', 'read-wp', 'read-sent']) {
      await run(id); const done = await quizLoop(); const r = await tl(id);
      ok(done && r && r.s === 3, `${id}: a full round at level 1, all right → 3 stars on the card`); await closeOv(); await sleep(100);
      const lvId = await p.evaluate(id => Object.keys(window.TAL.S().tl).filter(k => k.startsWith('rb2-' + id.replace('read-', '') + '-')), id);
      ok(lvId.length === 1, `${id}: the level round is recorded (${lvId})`);
    }
    await run('read-build'); ok(await tilesLoop() && ((await tl('read-build')) || {}).s >= 2, 'read-build: syllables in order'); await closeOv();
    ok(await p.evaluate(() => window.READBANK2.level('word')) === 3, 'word level: two strong activities pass a level (4 rounds → level 3)');
    await run('story-new'); await sleep(200);
    const sty = await p.evaluate(() => { const s = document.querySelectorAll('#sTal .sl'); return s.length; }); ok(sty >= 3, 'story-new shows a story (' + sty + ' lines)');
    await p.evaluate(() => [...document.querySelectorAll('#sTal .bigbtn')].pop().click()); ok(await quizLoop() && ((await tl('story-new')) || {}).s === 3, 'story-new: 3 questions → story card recorded'); await closeOv();
    await run('write-mix'); ok(await tilesLoop() && ((await tl('write-mix')) || {}).s >= 2, 'write-mix: copy + missing letter session'); await closeOv();
    await p.evaluate(() => { const S = window.TAL.S(); [1].forEach(L => { S.tl['rb2-mix-' + L] = { s: 3, n: 1 }; }); });
    const plan = await p.evaluate(() => window.__rb2run.mixPlan(2).map(x => x[0]).join(','));
    ok(plan === 'copy,dict,dict,miss,miss,order', 'write-mix level 2 plan: ' + plan);
    await p.evaluate(() => window.__rb2run.mix(() => window.OREN.showMap())); ok(await tilesLoop(), 'write-mix level 2 (dictation, missing letter, sentence order) runs to the end'); await closeOv();
    await run('write-paper'); await sleep(150);
    await p.evaluate(() => [...document.querySelectorAll('#sTal .bigbtn')].pop().click()); await sleep(150);
    const chkTxt = await p.evaluate(() => document.querySelector('#sTal').textContent);
    ok(/בּוֹא נִבְדֹּק/.test(chkTxt), 'write-paper: the check screen follows the task');
    await p.evaluate(() => [...document.querySelectorAll('#sTal .bigbtn')].pop().click()); await sleep(150);
    ok(await ovOpen() && ((await tl('write-paper')) || {}).s === 3, 'write-paper: done → card recorded'); await closeOv();
    const lvTxt = await p.evaluate(() => window.READBANK2.levelOf('read-pw')); ok(/^רמה \d\/7/.test(lvTxt) && !/[\u0591-\u05C7]/.test(lvTxt), 'levelOf() for the parents: ' + lvTxt);
    ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  } catch (e) { ok(false, 'browser run: ' + e.message); }
  await b.close();
}
(async () => {
  if (!process.env.NOBROWSER) await browser();
  out.forEach(l => console.log(l));
  if (process.env.WARN) warns.forEach(w => console.log('WARN ' + w)); else if (warns.length) console.log(`(${warns.length} proofreading hints — WARN=1 to list them)`);
  console.log(`RESULT read-bank2 ${pass} ${fail}`);
  process.exitCode = fail ? 1 : 0;
})();
