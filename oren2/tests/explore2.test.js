// EXPLORE 2 (space, nature, maps & history, calendar, blocks): data checks + play every activity at every level.
// Standalone: loads the built index.html, injects explore2.js/.css, registers the buildings.
// Usage: node tests/explore2.test.js [desktop|phone]   (SHOTS=1 or SHOTDIR=<dir> saves screenshots)
const L = require('./lib');
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const JS = fs.readFileSync(path.join(L.ROOT, 'explore2.js'), 'utf8'), CSS = fs.readFileSync(path.join(L.ROOT, 'explore2.css'), 'utf8');
const SHOTS = process.env.SHOTDIR || (process.env.SHOTS ? path.join(L.SHOTDIR, 'explore2') : '');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const HEB = /[א-ת]/, NIK = /[ְ-ׇּׁׂ]/;
// every Hebrew word must carry nikud (kid-facing text)
const noNikud = s => String(s).replace(/<[^>]+>/g, ' ').split(/[\s\-–.,:;!?()"'/+=…⬅]+/).filter(w => HEB.test(w) && !NIK.test(w));

(async () => {
  const res = [], ok = (c, m) => res.push((c ? 'PASS ' : 'FAIL ') + m);
  const b = await chromium.launch();
  const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; window.__noFamily = true; });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto(L.URL); await L.noCoach(p);
  if (!(await p.evaluate(() => !!window.EXPLORE2))) { await p.addStyleTag({ content: CSS }); await p.addScriptTag({ content: JS }); }
  await p.evaluate(() => { const O = window.OREN; O.save.story.intro = 1; O.save.set = { brk: 0, hide: {} }; O.save.prof = { an: 'cat', col: '#3a8fc4', love: 'art' };
    window.EXPLORE2.register(window.TAL.building, window.TAL.GROUPS); O.showMap(); });

  /* ---------- data checks ---------- */
  const d = await p.evaluate(() => {
    const E = window.EXPLORE2, D = E.DATA, out = {};
    out.ids = E.ids(); out.psz = Object.fromEntries(D.PLANETS.map(x => [x.k, x.r])); out.skills = E.SKILLS; out.planets = D.PLANETS.map(x => x.k); out.hol = D.HOL_ORDER;
    out.inv = D.INV.map(x => [x.k, x.ago]); out.cities = D.CITIES; out.cont = D.CONT; out.fcont = D.FCONT;
    out.banks = Object.entries(D.banks()).map(([id, bank]) => [id, bank.map(q => ({ lv: q.lv, q: q.q, a: q.a, ds: q.ds }))]);
    out.kid = E.kidTexts();
    out.groups = window.TAL.GROUPS.map(g => [g.id, g.ids]);
    // generated questions: many runs, every option list distinct with the right answer inside exactly once
    const gq = []; const chk = (tag, q) => { const m = E.gen.mkQ(q); gq.push([tag, m.opts.length, new Set(m.opts).size, m.ans, m.opts[m.ans] === (q.fmt ? q.fmt(q.a) : q.a), q.ds.includes(q.a)]); };
    for (let k = 0; k < 40; k++) for (let L = 1; L <= 3; L++) {
      E.gen.NAT_GRP(L).forEach(q => chk('groups' + L, q)); E.gen.YR_HOL(L).forEach(q => chk('hol' + L, q));
      const c = E.gen.countQ(L); chk('count' + L, c); out.cnt = out.cnt || []; out.cnt.push([c.key, c.a]);
      ['top', 'front'].forEach(kind => { const v = E.gen.viewQ(L, kind); chk('view' + kind + L, v); });
    }
    out.gq = gq;
    // views: the cube picture must match the expected answer for a known shape
    out.view = [E.gen.topView([[1, 1, 0], [1, 0, 0]]).join('/'), E.gen.frontView([[2, 1, 0], [1, 1, 1]]).join('/')];
    out.plans = Object.values(D.PLANS).flat().map(r => r.join('/'));
    out.mirr = Object.values(D.MIRR).flat().map(r => r.every(row => row === [...row].reverse().join('')));
    return out;
  });
  ok(d.ids.length >= 24 && new Set(d.ids).size === d.ids.length, `activity ids unique (${d.ids.length})`);
  ok(d.ids.every(id => d.skills[id] && !NIK.test(d.skills[id])), 'every activity has a parent skill name (no nikud)');
  ok(JSON.stringify(d.planets) === JSON.stringify(['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']), 'planet order Mercury→Neptune');
  ok(['mercury', 'mars', 'venus', 'earth', 'neptune', 'uranus', 'saturn', 'jupiter'].every((k, i, A) => !i || d.psz[A[i - 1]] < d.psz[k]), 'planet pictures: sizes in the true order (Mercury smallest, Jupiter biggest)');
  ok(JSON.stringify(d.hol) === JSON.stringify(['rh', 'yk', 'suk', 'han', 'tu', 'pur', 'pes', 'atz', 'lag', 'shav']), 'holidays in calendar order from Rosh Hashana');
  ok(d.inv.every((x, i) => !i || d.inv[i - 1][1] > x[1]), 'inventions sorted oldest→newest ' + d.inv.map(x => x[0]).join(','));
  const C = d.cities, y = k => C[k].xy[1], x = k => C[k].xy[0];
  ok(y('hai') < y('ta') && y('ta') < y('jer') && y('jer') < y('bs') && y('bs') < y('eil'), 'cities north→south: Haifa, Tel Aviv, Jerusalem, Beer Sheva, Eilat');
  ok(x('jer') > x('ta') && x('jer') > x('bs'), 'Jerusalem east of Tel Aviv and Beer Sheva');
  ok(d.cont.length === 7, '7 continents');
  ok(d.fcont.il === 'asia' && d.fcont.jp === 'asia' && d.fcont.fr === 'europe' && d.fcont.br === 'samerica' && d.fcont.us === 'namerica' && d.fcont.ng === 'africa', 'country → continent table');
  ok(d.view[0] === 'B../BB.', 'top view of a known shape ' + d.view[0]);
  ok(d.view[1] === '.../B../BBB', 'front view of a known shape ' + d.view[1]);
  ok(d.mirr.every(Boolean), 'mirror tasks are symmetric');
  let bankBad = [];
  d.banks.forEach(([id, bank]) => bank.forEach(q => {
    const all = [q.a, ...q.ds];
    if (q.ds.length < 1 || new Set(all).size !== all.length) bankBad.push(id + ': ' + q.q);
    if (![1, 2, 3].includes(q.lv)) bankBad.push(id + ' level: ' + q.q);
  }));
  ok(!bankBad.length, 'question banks: one correct answer, distinct options ' + bankBad.slice(0, 5).join(' | '));
  const lvls = d.banks.map(([id, bank]) => [id, [1, 2, 3].map(L => bank.filter(q => q.lv === L).length)]);
  ok(lvls.every(([, n]) => n[0] >= 3), 'every bank has at least 3 level-1 questions ' + lvls.filter(([, n]) => n[0] < 3).map(x => x[0]).join(','));
  const gBad = d.gq.filter(([, n, u, ans, hit, dup]) => n !== u || ans < 0 || !hit || dup || n < 2);
  ok(!gBad.length, `generated questions (${d.gq.length}): distinct options, exactly one correct ` + JSON.stringify(gBad.slice(0, 3)));
  ok(d.cnt.every(([k, a]) => { const [r, c] = k.split('x').map(Number); return r * c === +a; }), 'counting answers = rows × columns');
  const nk = [...new Set(d.kid.flatMap(noNikud))];
  ok(!nk.length, `nikud on all kid text (${d.kid.length} strings) ` + nk.slice(0, 12).join(' '));
  ok(d.groups.find(g => g[0] === 'explore')[1].includes('sky') && d.groups.find(g => g[0] === 'create')[1].includes('blocks'), 'buildings placed in city groups');

  /* ---------- play every activity at every level ---------- */
  const ovOpen = () => p.evaluate(() => !document.querySelector('#ov').hidden);
  const screenNoNikud = async () => noNikud(await p.evaluate(() => [...document.querySelectorAll('#sTal, #hudMid')].map(e => e.innerText + ' ' + [...e.querySelectorAll('svg text')].map(t => t.textContent).join(' ')).join(' ')));
  let shotN = 0;
  const snap = async name => { if (!SHOTS) return; await sleep(150); await p.screenshot({ path: path.join(SHOTS, `${L.variant}-${String(++shotN).padStart(2, '0')}-${name}.png`) }); };
  const LV = { 1: null, 2: { s: 2, n: 1 }, 3: { s: 3, n: 2 } };
  const screenBad = new Set();
  // #216 simplicity (docs/simplicity-spec.md G2/G3/G4/G7), checked on every screen of every activity
  const simp = { card: new Set(), btn: new Set(), font: new Set(), tap: new Set(), opts: new Set() }; let nCards = 0;
  const probe = id => p.evaluate(([id, phone]) => {
    const S = document.querySelector('#sTal'), out = { card: [], btn: [], font: [], tap: [], opts: [], cards: 0 };
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const he = /[א-ת]/, plain = t => t.replace(/[֑-ׇ]/g, '').trim();
    // G4: an info card shows one short line; the whole text is spoken. G2: its only button is "▶ הַמְשֵׁךְ"
    const card = S.querySelector('.e2card');
    if (card) { out.cards = 1; const se = card.querySelector('.sent'), t = plain(se ? se.textContent : '');
      const lh = se ? parseFloat(getComputedStyle(se).lineHeight) || parseFloat(getComputedStyle(se).fontSize) * 1.3 : 0;
      if (!se || t.length > 40 || se.getBoundingClientRect().height > lh * 1.5) out.card.push(`${id}: "${t}" (${t.length} chars, ${se ? Math.round(se.getBoundingClientRect().height) : 0}px)`);
      const said = plain(window.OREN.sayNow || '');
      if (t && !said.replace(/[.,!?:–\s]/g, '').includes(t.replace(/[.,!?:–\s]/g, '').slice(0, 10))) out.card.push(`${id}: line not spoken`);
      const bs = [...S.querySelectorAll('button')].filter(vis);
      if (bs.length !== 1 || bs[0].textContent.trim() !== 'הַמְשֵׁךְ' || !bs[0].querySelector('svg')) out.btn.push(`${id}: ${bs.map(b => b.textContent.trim()).join('/')}`); }
    for (const b of S.querySelectorAll('button')) if (vis(b) && /הַבָּא|לַשְּׁאֵלוֹת|מַתְחִילִים|לְחִידוֹן|הָלְאָה/.test(b.textContent)) out.btn.push(`${id}: "${b.textContent.trim()}"`);
    if (phone) {
      // G7: kid text >= 16px (SVG labels: font size × picture scale)
      for (const t of S.querySelectorAll('svg text')) { if (!he.test(t.textContent) || !vis(t)) continue; const m = t.getScreenCTM(); const px = parseFloat(getComputedStyle(t).fontSize) * (m ? Math.hypot(m.a, m.b) : 1);
        if (px < 15.5) out.font.push(`${id}: svg "${plain(t.textContent)}" ${px.toFixed(1)}px`); }
      for (const e of S.querySelectorAll('*')) { if (e.closest('svg') || !vis(e)) continue; const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('');
        if (he.test(own) && parseFloat(getComputedStyle(e).fontSize) < 15.5) out.font.push(`${id}: "${plain(own).slice(0, 20)}" ${getComputedStyle(e).fontSize}`); }
      // G7: tap targets >= 44px (a map place = all its tappable shapes together; the core 🔊 .rdb has a 44px hit ring)
      const tg = new Map();
      for (const e of S.querySelectorAll('button:not(.rdb), .e2hit')) { if (!vis(e) || e.disabled) continue; const r = e.getBoundingClientRect(), k = e.dataset.k ? 'k:' + e.dataset.k : e;
        const u = tg.get(k) || { l: 1e9, t: 1e9, r: -1e9, b: -1e9, n: e.tagName.toLowerCase() + '.' + String(e.getAttribute('class')).split(' ').join('.') + (e.dataset.k ? '[' + e.dataset.k + ']' : '') };
        u.l = Math.min(u.l, r.left); u.t = Math.min(u.t, r.top); u.r = Math.max(u.r, r.right); u.b = Math.max(u.b, r.bottom); tg.set(k, u); }
      for (const u of tg.values()) if (Math.min(u.r - u.l, u.b - u.t) < 43.5) out.tap.push(`${id}: ${u.n} ${Math.round(u.r - u.l)}x${Math.round(u.b - u.t)}`);
    }
    // G3: 2-4 answer options, balanced (all rows the same, or one column) - never a lone orphan row
    for (const box of S.querySelectorAll('.chs, .e2items')) { const os = [...box.children].filter(e => e.tagName === 'BUTTON' && e.offsetWidth > 0); if (os.length < 2) continue;
      const rows = {}; os.forEach(o => { const k = Math.round(o.getBoundingClientRect().top / 8); rows[k] = (rows[k] || 0) + 1; }); const n = Object.values(rows);
      const orphan = n.length > 1 && n.some(x => x === 1) && n.some(x => x > 1), uneven = n.length > 1 && Math.max(...n) - Math.min(...n) > 1;
      if ((box.classList.contains('chs') && os.length > 4) || orphan || uneven) out.opts.push(`${id}: ${os.length} options in rows ${n.join('+')}`); }
    return out;
  }, [id, L.variant === 'phone']);
  const addProbe = r => { nCards += r.cards; for (const k in simp) r[k].forEach(x => simp[k].add(x)); };
  for (const id of d.ids) for (const lv of [1, 2, 3]) {
    const e0 = errs.length;
    await p.evaluate(([id, t]) => { document.querySelector('#ov').hidden = true; const s = window.TAL.S(); if (t) s.tl[id] = t; else delete s.tl[id]; window.TAL.ACT[id].run(() => window.TAL.openHub()); }, [id, LV[lv]]);
    await sleep(120);
    const got = await p.evaluate(id => window.EXPLORE2.level(id), id);
    if (lv === 1 || SHOTS) await snap(`${id}-L${lv}-a`);
    let steps = 0, shot2 = false;
    for (; steps < 260 && !(await ovOpen()); steps++) {
      if (steps % 4 === 0) (await screenNoNikud()).forEach(w => screenBad.add(w + ' @' + id));
      if (lv === 1 || steps % 3 === 0) addProbe(await probe(id));
      if (SHOTS && !shot2 && steps === 3) { shot2 = true; await snap(`${id}-L${lv}-b`); }
      if (id === 'blk-free' && steps > 12) break;
      await p.evaluate(() => window.EXPLORE2.step()); await sleep(id === 'blk-free' ? 20 : 45);
    }
    if (id === 'blk-free') { await snap(`${id}-L${lv}-built`); }
    else if (lv === 1) await snap(`${id}-L${lv}-done`);
    const st = await p.evaluate(id => (window.TAL.S().tl[id] || {}).s | 0, id);
    ok(got === lv && st > 0 && errs.length === e0, `${id} L${lv}: level ${got}, stars ${st}, steps ${steps}, errors ${errs.length - e0}`);
  }
  ok(!screenBad.size, 'nikud on every word shown on screen ' + [...screenBad].slice(0, 10).join(' | '));
  const sl = k => [...simp[k]].slice(0, +(process.env.E2N || 8)).join(' | ');
  ok(nCards > 20 && !simp.card.size, `G4 info cards: one short line shown, the rest spoken (${nCards} cards) ` + sl('card'));
  ok(!simp.btn.size, 'G2 info card: one button "▶ הַמְשֵׁךְ"; no הַבָּא/לַשְּׁאֵלוֹת/מַתְחִילִים buttons ' + sl('btn'));
  if (L.variant === 'phone') {
    ok(!simp.font.size, 'G7 phone: kid text and planet/map labels >= 16px ' + sl('font'));
    ok(!simp.tap.size, 'G7 phone: tap targets >= 44px ' + sl('tap'));
  }
  ok(!simp.opts.size, 'G3 answer options: 2-4, balanced rows, no orphan ' + sl('opts'));
  // free build is saved and comes back
  const fb = await p.evaluate(() => { const v = (window.TAL.S().e2 || {}).fb || ''; window.TAL.ACT['blk-free'].run(() => {}); return [v.length, v.split(',').length, document.querySelectorAll('#sTal .e2cell').length]; });
  ok(fb[1] === 30 && fb[0] > 29 && fb[0] < 200 && fb[2] > 30, 'free build saved small and redrawn ' + JSON.stringify(fb));
  // map-flags (#209): every flag stays inside its card (intro card with 3 flags + each quiz card)
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; delete window.TAL.S().tl['map-flags']; window.TAL.ACT['map-flags'].run(() => window.TAL.openHub()); });
  await sleep(150);
  const flagOut = [];
  const checkFlags = tag => p.evaluate(tag => [...document.querySelectorAll('#sTal .flagsvg')].flatMap(f => {
    const c = f.closest('.tqc'), a = f.getBoundingClientRect(), r = c.getBoundingClientRect();
    return a.left < r.left - 0.5 || a.right > r.right + 0.5 ? [`${tag}: flag ${Math.round(a.left)}..${Math.round(a.right)} card ${Math.round(r.left)}..${Math.round(r.right)}`] : [];
  }), tag);
  flagOut.push(...await checkFlags('intro'));
  const nFlags = await p.evaluate(() => document.querySelectorAll('#sTal .e2card .flagsvg').length);
  for (let s = 0; s < 80 && !(await ovOpen()); s++) { await p.evaluate(() => window.EXPLORE2.step()); await sleep(60); flagOut.push(...await checkFlags('step' + s)); }
  ok(nFlags === 3 && !flagOut.length, `map-flags: every flag inside its card (${nFlags} intro flags) ` + flagOut.slice(0, 3).join(' | '));
  // the buildings open from the city
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.TAL.openBuilding(window.TAL.BUILD.find(b => b.id === 'sky')); });
  await sleep(150); await snap('building-sky');
  const cards = await p.evaluate(() => document.querySelectorAll('#sTal .acts .actc').length);
  ok(cards === 4, 'space building shows its 4 activities');
  const hScroll = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
  ok(!hScroll, 'no horizontal page scroll');
  // merge option: fewer doors (nature → lab, maps + calendar → world)
  const p2 = await ctx.newPage(); await p2.goto(L.URL); await L.noCoach(p2);
  if (!(await p2.evaluate(() => !!window.EXPLORE2))) { await p2.addStyleTag({ content: CSS }); await p2.addScriptTag({ content: JS }); }
  const mg = await p2.evaluate(() => { const T = window.TAL, made = window.EXPLORE2.register(T.building, T.GROUPS, { merge: true });
    const acts = id => (T.BUILD.find(b => b.id === id) || { acts: [] }).acts.map(a => a.id);
    return { made, lab: acts('lab'), world: acts('world'), explore: T.GROUPS.find(g => g.id === 'explore').ids, all: window.EXPLORE2.ids().every(id => T.ACT[id] && T.ACT[id].b) }; });
  ok((mg.made === undefined || JSON.stringify(mg.made) === '["sky","blocks"]') && mg.lab.includes('nat-cycle') && mg.world.includes('map-il') && mg.world.includes('yr-hol') && mg.all && !mg.explore.includes('nature') && mg.explore.includes('sky'),
    'merge option: nature→lab, maps+calendar→world, new doors only sky+blocks ' + JSON.stringify(mg.made));
  await p2.evaluate(() => window.TAL.ACT['nat-cycle'].run(() => {})); await sleep(150);
  ok(await p2.evaluate(() => !!document.querySelector('#sTal .e2card')), 'merged activity runs');
  ok(!errs.length, 'no JS errors ' + errs.slice(0, 5).join(' | '));
  await b.close(); L.finish('explore2-' + L.variant, res);
})();
