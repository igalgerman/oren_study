// No-repeat picking (LEARN.pickItem / LEARN.seen) in think (ana, rel, sen), gaps (nikud ladder, first sound), english2 (letter keywords) and explore2 (question banks):
// an item is not shown again until every item of its bank was seen (#66).
// Usage: node tests/norepeat.test.js [desktop|phone]
const L = require('./lib');
const { chromium } = require('playwright');
(async () => {
  const out = []; const ok = (c, m, info) => out.push((c ? 'PASS ' : 'FAIL ') + m + (c || info == null ? '' : ' — ' + info));
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; window.__noFamily = true; });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(L.URL); await L.noCoach(page);
  const fresh = () => page.evaluate(() => { const s = window.LEARN.state(); s.sn = {}; s.wr = {}; s.bu = {}; });

  /* think: SEN at level 1, ANA words at level 4 (text pairs), REL (opp at level 2 draws OPP/PICCAT: use level 4 → part/syn/wordOdd/belongs; check the bank ones through B.SYN/B.PART) */
  await fresh();
  const sen = await page.evaluate(() => { const T = window.THINK, B = window.THINK_BANK; const n = B.SEN.filter(x => x[0] === 1).length; const keys = []; for (let i = 0; i < n; i++) keys.push(T.GEN.sen(1).key); return { n, keys }; });
  ok(sen.n > 3 && new Set(sen.keys).size === sen.n, 'think sentences: no sentence twice until all ' + sen.n + ' (level 1) were seen', sen.keys.length + ' draws, ' + new Set(sen.keys).size + ' different');
  await fresh();
  const ana = await page.evaluate(() => { const T = window.THINK, B = window.THINK_BANK; const n = B.ANA.filter(x => x[0] === 4).length; const keys = []; for (let i = 0; i < n; i++) keys.push(T.GEN.ana(4).key); return { n, keys }; });
  ok(ana.n > 3 && new Set(ana.keys).size === ana.n, 'think analogies: no analogy twice until all ' + ana.n + ' (level 4) were seen', ana.keys.length + ' draws, ' + new Set(ana.keys).size + ' different');
  await fresh();
  const rel = await page.evaluate(() => { const T = window.THINK, B = window.THINK_BANK; const n = B.OPP.length; const keys = []; const R = T.GEN.rel; /* draw until n opposites were shown; each opposite question has the key 'op…' */
    for (let i = 0; i < 400 && keys.length < n; i++) { const q = R(2); if (/^op/.test(q.key || '')) keys.push(q.key); } return { n, keys }; });
  ok(rel.keys.length === rel.n && new Set(rel.keys).size === rel.n, 'think opposites: none twice until all ' + rel.n + ' were seen', rel.keys.length + ' draws, ' + new Set(rel.keys).size + ' different');

  /* gaps */
  await fresh();
  const gp = await page.evaluate(() => { const G = window.GAPS; const ws = []; for (let i = 0; i < 12; i++) ws.push(G.sndQ(1).chk.w); const nk = []; for (let i = 0; i < 12; i++) nk.push(G.nikQ(0, i % 8, 8).chk.w); return { ws, nk }; });
  ok(new Set(gp.ws).size === gp.ws.length, 'gaps first sound: 12 words in a row, none twice', gp.ws.join());
  ok(new Set(gp.nk).size === gp.nk.length, 'gaps nikud ladder: 12 words in a row, none twice', gp.nk.join());

  /* english2: the keyword of a letter (box 1+) */
  await fresh();
  const en = await page.evaluate(() => { const E = window.ENGLISH2; const only = { en2: { i: { 's:B': [1, 0] }, u: {}, g: {} } }; const w0 = []; for (let i = 0; i < 4; i++) w0.push(E.gen(only, { k: 's:B' }).w);
    /* #58: only taught keywords; teach them all (ball on the letter card, bus by reading, bed and banana as words) */
    const save = { en2: { i: { 's:B': [1, 0], 'r:bus': [0, 0], 'v:bed': [0, 0], 'v:banana': [0, 0] }, u: {}, g: {} } }; const n = E.LET.B.kw.length; const ws = []; for (let i = 0; i < n; i++) ws.push(E.gen(save, { k: 's:B' }).w); return { n, ws, w0 }; });
  ok(en.w0.every(w => w === 'ball'), 'english2 letter sound: only the taught keyword (ball) before the others are taught', en.w0.join());
  ok(en.n > 2 && new Set(en.ws).size === en.n, 'english2 letter sound: each keyword of B once before any repeats', en.ws.join());

  /* explore2: a question bank (6 questions per round) */
  await fresh();
  const x2 = await page.evaluate(() => { const X = window.EXPLORE2; const banks = X.DATA.banks(); let id = null, tot = 0; for (const k in banks) { const n = banks[k].filter(q => q.lv <= 3).length; if (n >= 12 && n > tot) { id = k; tot = n; } }
    const rounds = Math.floor(tot / 6); const seenQ = []; for (let r = 0; r < rounds; r++) X.gen.pickQs(banks[id], 3, 6, id).forEach(q => seenQ.push(q.q)); return { id, tot, rounds, seenQ }; });
  ok(x2.id && x2.rounds >= 2 && new Set(x2.seenQ).size === x2.seenQ.length, 'explore2 ' + x2.id + ': ' + x2.rounds + ' rounds of 6, no question twice', x2.seenQ.length + ' shown, ' + new Set(x2.seenQ).size + ' different');

  ok(errs.length === 0, 'no page errors', errs.join(' | '));
  await b.close();
  L.finish('norepeat', out);
})();
