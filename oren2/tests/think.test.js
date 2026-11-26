// THINK: generators (one correct answer, distinct options), content banks (nikud, ktiv male copies), levels, day log, test plans.
// Pure Node — loads think-bank.js + think.js without a page.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'think-bank.js')); require(path.join(ROOT, 'think.js'));
const C = window.THINK, B = window.THINK_BANK;
const out = []; const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
const N = +process.env.N || 400;

/* ---------- helpers ---------- */
const NIK = /[֑-ׇ]/;
const tk = o => C.okey(o);
const nOpts = (sk, lv, q) => sk === 'mth' ? null : sk === 'ana' ? (lv <= 3 ? 3 : 4) : lv <= 2 ? 3 : 4;
// predict a missing value in a sequence: periodic (period 1..4) or arithmetic
function predict(vals, qi, mod) {
  for (let p = 1; p <= 4; p++) {
    let good = true, seen = 0;
    for (let j = p; j < vals.length; j++) { if (vals[j] == null || vals[j - p] == null) continue; seen++; if (vals[j] !== vals[j - p]) { good = false; break; } }
    if (!good || seen < 2) continue;
    if (qi - p >= 0 && vals[qi - p] != null) return vals[qi - p];
    if (qi + p < vals.length && vals[qi + p] != null) return vals[qi + p];
  }
  const ks = vals.map((v, j) => [v, j]).filter(x => x[0] != null);
  const d = (ks[1][0] - ks[0][0]) / (ks[1][1] - ks[0][1]);
  const v = ks[0][0] + d * (qi - ks[0][1]);
  return mod ? ((v % mod) + mod) % mod : v;
}
const ATTR = ['s', 'c', 'n', 'z', 'r', 'f'];
const same = (a, b, ks) => ks.every(k => a[k] === b[k]);

/* ---------- 1. every generator, every level ---------- */
const probs = {};
const bad = (sk, lv, msg) => { const k = sk + lv; probs[k] = probs[k] || []; if (probs[k].length < 3) probs[k].push(msg); };
for (const sk of Object.keys(C.GEN)) for (let lv = 1; lv <= 5; lv++) {
  let n = 0;
  for (let i = 0; i < N; i++) {
    let q; try { q = C.GEN[sk](lv); } catch (e) { bad(sk, lv, 'throws ' + e.message); continue; }
    n++;
    const keys = q.opts.map(tk);
    if (new Set(keys).size !== keys.length) bad(sk, lv, 'duplicate options ' + keys);
    if (!(q.ans >= 0 && q.ans < q.opts.length)) bad(sk, lv, 'answer out of range');
    const want = nOpts(sk, lv, q);
    if (want && q.opts.length !== want) bad(sk, lv, `options ${q.opts.length} != ${want}`);
    if (sk === 'mth' && q.opts.length < 2) bad(sk, lv, 'too few options');
    if (!q.rule) bad(sk, lv, 'no explanation');
    [...(q.items || []), ...(q.cells || []), q.a, q.b, q.c, ...q.opts].forEach(o => { if (o && o.t === 'tile' && !(o.v.n >= 1 && o.v.n <= 5)) bad(sk, lv, 'tile count ' + o.v.n); });
    if (q.kind === 'series' && (q.items[q.qi] !== null || q.items.filter(x => x === null).length !== 1)) bad(sk, lv, 'series must hide exactly the answer (a ? slot)');
    q.opts.forEach(o => { if (o.t === 'num' && (o.v < 0 || o.v > 999 || !Number.isInteger(o.v))) bad(sk, lv, 'number out of range ' + o.v); });
    // independent checks that exactly one option fits
    let fits = null;
    if (sk === 'ser') { fits = q.opts.map(o => o.v === (q.key.split('|')[0].split(',').map(Number))[q.qi]); q.items.forEach(o => { if (o && o.v < 0) bad(sk, lv, 'negative item'); }); }
    if (sk === 'shp') {
      const vals = k => { const a = q.items.map(o => o ? o.v[k] : null); if (q.qi >= a.length) a.push(null); else a[q.qi] = null; return a; };
      const pred = {}; ATTR.forEach(k => { pred[k] = predict(vals(k), q.qi, k === 'r' ? 360 : 0); });
      fits = q.opts.map(o => ATTR.every(k => o.v[k] === pred[k]));
    }
    if (sk === 'mat') {
      const M = q.N, cells = q.cells.map(c => c && c.v), mi = cells.indexOf(null), r = Math.floor(mi / M), c = mi % M;
      const row = cells.filter((x, j) => x && Math.floor(j / M) === r), col = cells.filter((x, j) => x && j % M === c), any = cells.find(Boolean);
      fits = q.opts.map(o => { const t = o.v;
        if (lv === 1) return row.every(x => same(x, t, ATTR));
        if (lv <= 3) return row.every(x => x.s === t.s) && col.every(x => x.c === t.c) && same(t, any, ['n', 'z', 'r', 'f']);
        if (lv === 4) return row.every(x => x.s === t.s) && col.every(x => x.n === t.n) && same(t, any, ['c', 'z', 'r', 'f']);
        return cells.some(x => x && x.s === t.s) && cells.some(x => x && x.c === t.c) && row.every(x => x.s !== t.s && x.c !== t.c) && col.every(x => x.s !== t.s && x.c !== t.c) && same(t, any, ['n', 'z', 'r', 'f']); });
    }
    if (sk === 'ana' && q.a.t !== 'txt') {
      const ks = q.a.t === 'tile' ? ATTR : ['v', 'n', 'z', 'fl', 'up'];
      const get = o => q.a.t === 'tile' ? o.v : o;
      const A = get(q.a), Bb = get(q.b), Cc = get(q.c);
      const exp = Object.assign({}, Cc); ks.forEach(k => { if (k !== 'v' && A[k] !== Bb[k]) exp[k] = Bb[k]; });
      fits = q.opts.map(o => ks.every(k => get(o)[k] === exp[k]));
    }
    if (sk === 'mth') {
      const m = /([0-9]+)\?<\/div>|מִ-([0-9]+)\?/.exec(q.text || '');
      if (/גָּדוֹל מִ-/.test(q.text)) { const x = +/מִ-([0-9]+)/.exec(q.text)[1]; fits = q.opts.map(o => o.v > x); }
      else if (/קָטָן מִ-/.test(q.text)) { const x = +/מִ-([0-9]+)/.exec(q.text)[1]; fits = q.opts.map(o => o.v < x); }
      else if (/&gt;/.test(q.html || '')) { const [a, t] = (q.html.match(/[0-9]+/g) || []).map(Number); fits = q.opts.map(o => a + o.v > t); }
    }
    if (fits) { const k = fits.filter(Boolean).length; if (k !== 1 || !fits[q.ans]) bad(sk, lv, `fitting options ${k}, answer fits ${!!fits[q.ans]} key ${q.key}`); }
  }
  const p = probs[sk + lv];
  ok(!p && n === N, `${sk} level ${lv}: ${N} questions, one correct answer, distinct options${p ? ' — ' + p.join(' | ') : ''}`);
}

/* ---------- 2. reading passages ---------- */
const SPRITES = 'cat dog dragon owl eagle whale turtle star tree mount wave book tower flower sheep hut flag rainbow lantern sun moon ball car bird cake apple fish bookS hat boat key heart cup egg shoe cloud leaf rabbit carrot umbrella'.split(' ');
const holamHaser = w => { const cs = [...w]; let base = null; for (const ch of cs) { if (/[א-ת]/.test(ch)) base = ch; else if (ch === 'ֹ' && base !== 'ו') return true; } return false; };
const NOVAV = new Set(['לא', 'כל', 'זאת', 'ראש', 'כה', 'פה', 'איפה']);
function plainOk(v, p) { // p must be v without nikud, with only ו / י added (ktiv male)
  const s = C.bare(C.strip(v)), t = C.bare(p);
  let i = 0; for (const ch of t) { if (s[i] === ch) i++; else if (ch !== 'ו' && ch !== 'י') return 'extra letter ' + ch; }
  if (i !== s.length) return 'missing letters';
  if ((/ֻ/.test(v) || holamHaser(v)) && !NOVAV.has(s) && !NOVAV.has(s.slice(1)) && (t.match(/ו/g) || []).length <= (s.match(/ו/g) || []).length) return 'needs ו (kubutz/holam)';
  if (NIK.test(p)) return 'nikud left in plain text';
  return null;
}
let rcBad = [];
const lvCount = {};
B.RC.forEach((P, i) => {
  lvCount[P.lv] = (lvCount[P.lv] || 0) + 1;
  const tw = P.t.split(' '), pw = P.p.split(' ');
  if (tw.length !== pw.length) rcBad.push(`#${i} passage words ${tw.length}/${pw.length}`);
  else tw.forEach((w, j) => { const e = plainOk(w, pw[j]); if (e) rcBad.push(`#${i} "${w}"→"${pw[j]}": ${e}`); });
  P.q.forEach(([q, qp, a, ds], k) => {
    const qw = q.split(' '), qpw = qp.split(' ');
    if (qw.length !== qpw.length) rcBad.push(`#${i}.${k} question words`); else qw.forEach((w, j) => { const e = plainOk(w, qpw[j]); if (e) rcBad.push(`#${i}.${k} "${w}"→"${qpw[j]}": ${e}`); });
    const all = [a, ...ds]; if (new Set(all).size !== all.length) rcBad.push(`#${i}.${k} duplicate options`);
    const need = P.lv >= 4 ? 3 : 2; if (ds.length < need) rcBad.push(`#${i}.${k} needs ${need} distractors`);
    all.filter(x => x[0] === '@').forEach(x => { if (!SPRITES.includes(x.slice(1))) rcBad.push(`#${i}.${k} unknown picture ${x}`); });
    if (P.lv >= 3 && a[0] === '@') rcBad.push(`#${i}.${k} picture answer above level 2`);
  });
});
ok(!rcBad.length, `reading passages: ${B.RC.length} passages, plain (ktiv male) copies aligned word by word ${rcBad.slice(0, 6).join(' | ')}`);
{ const st = B.RC.filter(P => P.lv >= 3), bad = st.filter(P => !['sci', 'math', 'value', 'word'].includes(P.gk) || !/[א-ת]/.test(P.goal || '') || NIK.test(P.goal) || !(P.les >= 0 && P.les < P.q.length)).map(P => P.p.slice(0, 20));
  ok(!bad.length, `#355 every story passage (level 3+) has one learning goal (no nikud) and a lesson question ${bad.join(' | ')}`); }
ok(B.RC.length >= 40 && [1, 2, 3, 4, 5].every(l => lvCount[l] >= 6), 'at least 40 passages, 6+ per level ' + JSON.stringify(lvCount));

/* ---------- 3. nikud on all kid text ---------- */
const kid = [];
B.RC.forEach(P => { kid.push(P.t); P.q.forEach(([q, , a, ds]) => kid.push(q, a, ...ds)); });
B.ANA.forEach(x => kid.push(x[1], x[2], x[3], x[4], ...x[5], x[6]));
Object.values(B.PICCAT).forEach(x => kid.push(x.n));
B.OPP.forEach(x => kid.push(x[0], x[1]));
Object.values(B.CAT).forEach(x => kid.push(x[0], ...x[1]));
B.PART.forEach(x => kid.push(x[0], x[1], ...x[3])); B.SYN.forEach(x => kid.push(x[0], x[1], ...x[2])); B.ODD.forEach(x => kid.push(...x[0], x[1], x[2]));
B.SEN.forEach(x => kid.push(x[1], x[2], ...x[3])); B.NAMES.forEach(x => kid.push(x.n, x.l, x.m)); kid.push(...B.OBJS);
for (const sk of Object.keys(C.GEN)) for (let lv = 1; lv <= 5; lv++) for (let i = 0; i < 60; i++) { const q = C.GEN[sk](lv); kid.push(q.text || '', String(q.rule).replace(/<[^>]+>/g, ' '), String(q.html || '').replace(/<[^>]+>/g, ' ')); q.opts.forEach(o => { if (o.t === 'txt') kid.push(o.v); }); }
const noNik = new Set();
kid.forEach(s => String(s).replace(/<[^>]+>/g, ' ').split(/[\s,.!?:;"()…—–\-·←]+/).forEach(w => { const he = (w.match(/[א-ת]/g) || []).length; if (he >= 2 && !NIK.test(w) && w !== 'ב׳') noNik.add(w); }));
ok(!noNik.size, 'every Hebrew kid word has nikud ' + [...noNik].slice(0, 12).join(' '));
// common nikud slips
const slip = []; const all = kid.join(' ');
[[/כֹּל(?=[\s,.])/, 'כֹּל (use כָּל)'], [/ְְ/, 'double shva'], [/[ִ-ֻ]{2,}/, 'two vowels on one letter'], [/הָיְיָ/, 'הָיְיָ']].forEach(([re, m]) => { if (re.test(all)) slip.push(m); });
ok(!slip.length, 'no common nikud slips ' + slip.join(', '));

/* ---------- 4. banks: options distinct ---------- */
const bankBad = [];
B.ANA.forEach(x => { if (x[5].includes(x[4])) bankBad.push('ana ' + x[1]); if (x[5].length < (x[0] >= 4 ? 3 : 2)) bankBad.push('ana few ' + x[1]); });
B.SEN.forEach(x => { if (x[3].includes(x[2]) || new Set(x[3]).size !== x[3].length) bankBad.push('sen ' + x[1]); if ((x[1].match(/___/g) || []).length !== (/…/.test(x[2]) ? 2 : 1)) bankBad.push('sen blanks ' + x[1]); });
B.PART.forEach(x => { if (x[3].includes(x[1])) bankBad.push('part ' + x[0]); });
B.ODD.forEach(x => { if (x[0].includes(x[1])) bankBad.push('odd ' + x[1]); });
const seenW = {}; Object.entries(B.CAT).forEach(([k, [, ws]]) => ws.forEach(w => { if (seenW[w]) bankBad.push(`word ${w} in ${k} and ${seenW[w]}`); seenW[w] = k; }));
ok(!bankBad.length, `word banks consistent: ${B.ANA.length} analogies, ${B.SEN.length} sentences, ${B.OPP.length} opposites, ${B.PART.length} parts, ${B.ODD.length} odd-one-out ${bankBad.join(' | ')}`);

/* ---------- 5. levels ---------- */
{ const th = C.blankTh(); [1, 1, 1, 1, 1].forEach(x => C.answer(th, 'ser', x)); ok(C.level(th, 'ser') === 2, 'level up after 5 right'); }
{ const th = C.blankTh(); th.lv.ser = 3; [1, 0, 1, 1, 1].forEach(x => C.answer(th, 'ser', x)); ok(C.level(th, 'ser') === 4, 'level up after 4 of 5 right'); }
{ const th = C.blankTh(); th.lv.ser = 3; [0, 0, 1, 0].forEach(x => C.answer(th, 'ser', x)); ok(C.level(th, 'ser') === 2, 'level down after 3 of 4 wrong'); }
{ const th = C.blankTh(); [0, 0, 0, 0, 0, 0].forEach(x => C.answer(th, 'ser', x)); ok(C.level(th, 'ser') === 1, 'never below level 1'); th.lv.ser = 5; [1, 1, 1, 1, 1, 1].forEach(x => C.answer(th, 'ser', x)); ok(C.level(th, 'ser') === 5, 'never above level 5'); }
{ const th = C.blankTh(); th.lv.rc = 3; for (let i = 0; i < 4; i++) C.answer(th, 'rc', 1); ok(th.nk === 0, 'no nikud fading below comprehension level 4');
  th.lv.rc = 5; for (let i = 0; i < 10; i++) C.answer(th, 'rc', 1); ok(th.nk === 1, 'nikud stage 1 after 10 right at level 4+');
  for (let i = 0; i < 10; i++) C.answer(th, 'rc', i !== 3); ok(th.nk === 2, 'nikud stage 2 after 9 of 10');
  [0, 1, 0, 1, 0].forEach(x => C.answer(th, 'rc', x)); ok(th.nk === 1, 'nikud steps back after 3 of 5 wrong'); }
{ const P = B.RC.find(x => x.lv === 3); const s1 = C.nikud(P.t, P.p, 1), w1 = s1.split(' '), tw = P.t.split(' '), pw = P.p.split(' ');
  ok(C.nikud(P.t, P.p, 0) === P.t && C.nikud(P.t, P.p, 2) === P.p, 'nikud stages 0 and 2');
  ok(w1.every((w, i) => w === tw[i] || (w === pw[i] && C.easyWord(pw[i]))) && w1.some((w, i) => w !== tw[i]) && w1.some((w, i) => w === tw[i] && NIK.test(w)), 'nikud stage 1: only common words lose nikud: ' + s1); }

/* ---------- 6. day log & merge ---------- */
{ const sv = {}; const days = C.lastDays(40, new Date('2026-11-25T12:00')); days.forEach(d => C.hit(sv, d, 'ser', true)); ok(Object.keys(sv.alog).length === 35, 'day log keeps 35 days');
  C.hit(sv, days[0], 'ser', false); const st = C.skillStat(sv, 'ser', new Date('2026-11-25T12:00')); ok(st.n === 15 && Math.abs(st.acc - 14 / 15) < 1e-9, 'skill accuracy over 14 days ' + JSON.stringify(st)); }
{ const a = { '2026-11-20': { a: { x: 2 }, s: 3, k: { ser: [4, 3] } } }, b = { '2026-11-20': { a: { x: 1, y: 1 }, s: 5, k: { ser: [2, 2], rc: [1, 1] } }, '2026-11-21': { a: { z: 1 }, s: 1, k: {} } };
  const m = C.mergeLog(a, b); ok(m['2026-11-20'].a.x === 2 && m['2026-11-20'].a.y === 1 && m['2026-11-20'].s === 5 && m['2026-11-20'].k.ser.join() === '4,3' && m['2026-11-20'].k.rc.join() === '1,1' && m['2026-11-21'], 'family merge of the day log keeps the bigger counts');
  const t = C.mergeTh({ lv: { ser: 2 }, nk: 0 }, { lv: { ser: 3, rc: 2 }, nk: 1, best: { 1: 75 } }); ok(t.lv.ser === 3 && t.lv.rc === 2 && t.nk === 1 && t.best[1] === 75, 'family merge of levels'); }
{ const sv = {}; const d = C.lastDays(14, new Date('2026-11-25T12:00')); d.slice(0, 7).forEach(x => C.hit(sv, x, 'ana', true)); d.slice(7).forEach(x => C.hit(sv, x, 'ana', x.endsWith('0'))); ok(C.skillStat(sv, 'ana', new Date('2026-11-25T12:00')).tr === 1, 'trend up when this week is better'); }

/* ---------- 7. the champions' challenge ---------- */
{ const sk = ['shp', 'ana', 'ser', 'rc', 'mth']; const p = [1, 2, 3, 4, 5, 6].map(l => C.testPlan(l, sk));
  ok(p[0].length === 1 && p[0][0].n === 4 && p[0][0].sec === 180 && p[4][0].n === 10 && p[4][0].sec === 600, 'test levels 1–5: one chapter, 4 questions/3 min … 10/10 min');
  ok(p[5].length === 3 && p[5].every(c => c.n === 6 && c.sks.every(s => sk.includes(s))), 'test level 6: three chapters from open skills');
  const s = C.testSkills(p[4][0]); ok(s.length === 10 && sk.every(k => s.includes(k)), 'chapter mixes all open skills'); ok(C.testPlan(0, sk).length === 0, 'level 0 = closed'); }

/* ---------- 7b. analogies: no two options look nearly the same (#7): a size-only difference is small vs big (x2), never normal vs big ---------- */
{ const probs = [];
  for (let lv = 1; lv <= 5; lv++) for (let i = 0; i < N; i++) { const q = C.genAna(lv); if (q.opts[0].t === 'txt') continue;
    const get = o => o.t === 'tile' ? o.v : o, ks = q.opts[0].t === 'tile' ? ATTR : ['v', 'n', 'z', 'fl', 'up'];
    for (let a = 0; a < q.opts.length; a++) for (let b2 = a + 1; b2 < q.opts.length; b2++) { const A = get(q.opts[a]), Bq = get(q.opts[b2]);
      const diff = ks.filter(k => A[k] !== Bq[k]);
      if (diff.length === 1 && diff[0] === 'z' && Math.abs((A.z ?? 1) - (Bq.z ?? 1)) < 2 && probs.length < 3) probs.push(`lv${lv} ${tk(q.opts[a])} ~ ${tk(q.opts[b2])}`); } }
  ok(!probs.length, 'analogy options: a size-only difference is always small vs big ' + probs.join(' | ')); }

/* ---------- 8. the compare question in the page: the sign the kid sees is the sign the button holds (#208) ---------- */
(async () => {
  const L = require('./lib'); const { chromium } = require('playwright');
  const b = await chromium.launch(); const p = await (await b.newContext(L.VIEWPORT)).newPage();
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; });
  await p.goto(L.URL); await L.noCoach(p);
  await p.evaluate(() => { const C = window.THINK; C.GEN.ser = () => { let q; do q = C.genMth(4); while (!/^cm/.test(q.key)); return q; }; window.TAL.ACT['think-ser'].run(() => window.OREN.showMap()); });
  const btns = await p.$$('#sTal .chs .chb');
  const vals = await p.evaluate(() => window.__think.q.opts.map(o => o.v));
  // which way does the drawn sign point? ink in the middle row sits right for ">" and left for "<"
  const seen = [];
  for (const [k, el] of btns.entries()) {
    if (vals[k] === '=') continue;
    const png = (await (await el.$('.tht')).screenshot()).toString('base64');
    seen.push([vals[k], await p.evaluate(async src => { const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data, bg = [d[0], d[1], d[2]]; let sx = 0, n = 0, x0 = 1e9, x1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 150) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); } }
      const ym = c.height / 2 | 0; for (let y = ym - 1; y <= ym + 1; y++) for (let x = x0; x <= x1; x++) { const i = (y * c.width + x) * 4; if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 150) { sx += x; n++; } }
      return n ? (sx / n > (x0 + x1) / 2 ? '>' : '<') : '?'; }, png)]);
  }
  ok(seen.length === 2 && seen.every(([v, s]) => v === s), 'compare question: each sign button shows the sign it holds (not mirrored) ' + JSON.stringify(seen));
  // the "small → big" analogy: in the answer buttons the big picture is drawn at least twice as wide as the small one (#7)
  const sz = await p.evaluate(() => { const C = window.THINK; C.GEN.ana = () => { let q; do q = C.genAna(1); while (!/big$/.test(q.key)); return q; };
    document.querySelector('#ov').hidden = true; window.TAL.ACT['think-ana'].run(() => window.OREN.showMap());
    const q = window.__think.q; const btns = [...document.querySelectorAll('#sTal .chs .chb')];
    const w = z => { const k = q.opts.findIndex(o => (o.n | 0) === 1 && o.z === z); return k < 0 ? 0 : btns[k].querySelector('.ths svg').getBoundingClientRect().width; };
    return { s: w(0), b: w(2) }; });
  ok(sz.s > 0 && sz.b >= 2 * sz.s, 'analogy "small → big": the big option is drawn at least x2 the small one ' + JSON.stringify(sz));
  await b.close();
  require('./lib').finish('think', out);
})();
