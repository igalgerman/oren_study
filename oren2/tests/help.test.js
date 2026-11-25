// Help ladder (help.js): explainers for every generated question type (math in every worked example, similar questions, nikud),
// and the ladder itself in the real play screen: tip → picture → worked example → solo try → parent; idle; teach-back; spaced return; reading.
// Usage: node tests/help.test.js [desktop|phone]     SHOTS=1 saves screenshots (SHOTDIR=... to choose where)
const L = require('./lib');
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const SHOTDIR = process.env.SHOTDIR || L.SHOTDIR;
const shot = async (page, name) => { if (!process.env.SHOTS) return; fs.mkdirSync(SHOTDIR, { recursive: true }); await page.screenshot({ path: path.join(SHOTDIR, `help-${name}-${L.variant}.png`) }); };
(async () => {
  const out = []; const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { window.__noFamily = true; });
  await page.goto(L.URL);
  await L.noCoach(page);
  if (!(await page.evaluate(() => !!window.HELP))) {           // phase 1: not built into the game yet → inject
    await page.addStyleTag({ path: path.join(L.ROOT, 'help.css') });
    await page.addScriptTag({ path: path.join(L.ROOT, 'help.js') });
  }
  ok(await page.evaluate(() => !!(window.HELP && HELP.register && HELP.start && HELP.stuckList)), 'HELP API present');

  /* ---------- 1. explainers over every math level ---------- */
  const r = await page.evaluate(() => {
    const O4 = window.__oren4, bad = [], types = {}, plainTypes = {}; let n = 0, covered = 0;
    const NIK = /[ְ-ׇּׁׂ]/;
    const nikudOK = (html, tag) => { const t = String(html).replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ');
      for (const w of t.match(/[א-ת][א-ת֑-ׇ]*/g) || []) { if ((w.match(/[א-ת]/g) || []).length >= 2 && !NIK.test(w)) bad.push(tag + ' no nikud "' + w + '"'); } };
    const noNikud = (s, tag) => { if (/[֑-ׇ]/.test(s)) bad.push(tag + ' parent text has nikud: ' + s); if (/undefined|NaN/.test(s)) bad.push(tag + ' parent text broken: ' + s); };
    const txt = html => { const d = document.createElement('div'); d.innerHTML = String(html).replace(/<svg[\s\S]*?<\/svg>/g, ' '); return d.textContent.replace(/\s+/g, ' '); };
    const calc = e => { const t = e.replace(/−/g, '-').replace(/×/g, '*').replace(/:/g, '/'); if (!/^[\d\s+\-*/]+$/.test(t)) return NaN; return Function('return (' + t + ')')(); };
    const checkMath = (lines, tag) => { for (const ln of lines) { const s = txt(ln);
        for (const m of s.matchAll(/(\d+(?:\s+[+−×:]\s+\d+)+)\s*=\s*(\d+)(?:\s*שְׁאֵרִית\s*(\d+))?/g)) { if (m[3] != null) { const [p, dv] = m[1].split(':').map(Number); if (Math.floor(p / dv) !== +m[2] || p % dv !== +m[3]) bad.push(tag + ' wrong remainder "' + m[0] + '"'); continue; }
          const v = calc(m[1]); if (v !== +m[2]) bad.push(tag + ' wrong step "' + m[0] + '"'); }
        for (const m of s.matchAll(/(?<![\d+−×:]\s*)(\d+)\s*([<>])\s*(\d+)(?!\s*[+−×:])/g)) { const a = +m[1], c = +m[3]; if ((m[2] === '<') !== (a < c)) bad.push(tag + ' wrong compare "' + m[0] + '"'); }
        if (/undefined|NaN|Infinity|\[object/.test(s)) bad.push(tag + ' broken text "' + s + '"'); } };
    const exCheck = (d, tag, ctx) => { const ex = HELP.explain(d, ctx); if (!ex) { bad.push(tag + ' no explain'); return; }
      const hint = typeof ex.hint === 'string' ? ex.hint : ex.hint.t; nikudOK(hint, tag + ' hint'); if (/undefined|NaN/.test(hint)) bad.push(tag + ' hint broken ' + hint);
      if (!/טִיפּ/.test(hint)) bad.push(tag + ' hint without טִיפּ');
      if (ex.visual) { const v = ex.visual; if (v.cap) nikudOK(v.cap, tag + ' cap'); if (/undefined|NaN/.test((v.cap || '') + (v.svg || '') + (v.html || ''))) bad.push(tag + ' visual broken');
        if (!(v.svg || v.html || v.cap)) bad.push(tag + ' empty visual'); }
      noNikud(ex.topic, tag + ' topic'); if (ex.tip) noNikud(ex.tip, tag + ' tip');
      if (ex.teach) { if (ex.teach.length !== 3 || new Set(ex.teach).size !== 3) bad.push(tag + ' teach not 3'); ex.teach.forEach(t => nikudOK(t, tag + ' teach')); }
      if (ex.example) { const st = ex.example.steps; if (!st || st.length < 2) bad.push(tag + ' example too short'); st.forEach(s => nikudOK(s, tag + ' step')); checkMath(st, tag + ' example');
        const last = txt(st[st.length - 1]); const ans = String(ex.example.ans).replace('&lt;', '<').replace('&gt;', '>'); if (!last.includes(ans)) bad.push(tag + ' last step lacks answer ' + ans + ' | ' + last); }
      return ex; };
    const recompute = x => x.op === '+' ? x.l + x.r : x.op === '−' ? x.l - x.r : x.op === '×' ? x.l * x.r : x.l / x.r;
    for (const lv of O4.ALLLV) for (let i = 0; i < 40; i++) {
      const q = lv.gen(i); n++; const ctx = { gen: lv.gen, unit: lv.u.id, topic: lv.u.name }; const d = HELP.classify(q, ctx);
      if (!d) { if (q.k !== 'col' && !(q.chk && !['cmp', 'clock', 'frac'].includes(q.chk.t))) bad.push(lv.id + ' not classified ' + q.k); continue; }
      covered++; types[d.type] = (types[d.type] || 0) + 1; if (d.type !== 'generic') plainTypes[d.type] = 1;
      const tag = lv.id + ' ' + d.type + ' ' + JSON.stringify([q.l, q.op, q.r, q.miss, q.chk]).slice(0, 60);
      const ex = exCheck(d, tag, ctx); if (!ex) continue;
      if (ex.similar) {                                           // similar question: same type, valid, different
        const s = Object.assign({ type: d.type }, ex.similar);
        if (s.op) { if (recompute(s) !== s.res || !Number.isInteger(s.res) || s.res < 0) bad.push(tag + ' similar math ' + JSON.stringify(s));
          if (s.ans !== (s.miss === 'res' ? s.res : s.miss === 'r' ? s.r : s.l)) bad.push(tag + ' similar ans');
          const d2 = HELP.classify({ k: 'bin', l: s.l, op: s.op, r: s.r, res: s.res, miss: s.miss, ans: s.ans, f: s.f }); if (!d2 || d2.type !== d.type) bad.push(tag + ' similar type ' + (d2 && d2.type) + ' ' + JSON.stringify(s));
          if (s.l === d.l && s.r === d.r) bad.push(tag + ' similar is the same question');
          exCheck(s, tag + ' sim', ctx); }
        else { if (JSON.stringify(s) === JSON.stringify(Object.assign({ type: d.type }, ex.similar)) && s.a === d.a && s.b === d.b && s.h === d.h && s.parts === d.parts) bad.push(tag + ' similar same'); exCheck(s, tag + ' sim', ctx); }
      }
    }
    // generic/story worked examples come from the level generator: check a sample through the explainer directly
    const extra = []; for (const lv of O4.ALLLV.filter(l => /word|num|add-4|div-11|time-add|num-seq/.test(l.id))) { const q = lv.gen(1); const d = HELP.classify(q, { topic: lv.u.name }); if (d) extra.push(exCheck(d, lv.id + ' direct', {}) ? 1 : 0); }
    // reading words
    let words = 0; for (const w of (window.TAL.WORDS || [])) { const d = HELP.classify({ key: w.w }); if (!d || d.type !== 'read') { bad.push('word ' + w.w); continue; } words++;
      const ex = HELP.explain(d); nikudOK(ex.hint.t, 'read hint'); const fs = HELP._firstSound(w.w); if (!w.w.startsWith(fs) || !fs) bad.push('first sound ' + w.w + ' ' + fs);
      if (!w.syl[0].startsWith(fs.replace(/[וי]$/, '')) ) bad.push('first sound not in first syllable ' + w.w + ' ' + fs);
      if (w.syl.join('') !== w.w) bad.push('syllables ' + w.w); noNikud(ex.tip, 'read tip'); }
    return { n, covered, types, plain: Object.keys(plainTypes).length, words, bad: [...new Set(bad)].slice(0, 25), cnt: new Set(bad).size };
  });
  ok(r.cnt === 0, `explainers: ${r.covered}/${r.n} generated questions explained, types ${JSON.stringify(r.types)}` + (r.cnt ? ' — ' + r.bad.join(' | ') : ''));
  ok(r.plain >= 14, `${r.plain} dedicated math explainers in use`);
  ok(r.words >= 20, `reading: ${r.words} words with first sound + syllables`);
  ok(await page.evaluate(() => { const s = HELP._speech('<span class="ltr">8 + 5 = ?</span>'); const t = HELP._speech('הַשָּׁעָה 3:30. עַד 10: 3 + 7 = 10. 12 : 3 = ?'); return /שמונה ועוד חמש שווה כמה/.test(s) && /שלוש וחצי/.test(t) && /עשר, שלוש ועוד שבע/.test(t.replace(':',',')) && /שתים עשרה חלקי שלוש שווה כמה/.test(t) && !/\d/.test(s + t); }), 'voice text: numbers and signs spoken as words');

  /* ---------- 2. the ladder in the real play screen ---------- */
  await page.evaluate(() => { window.__fast = false; HELP.cfg.idle = 60000; HELP.cfg.teachP = 0; HELP.cfg.teachSoloP = 0; window.__sayLog = []; const o = window.OREN; const s0 = o.say; o.say = t => { window.__sayLog.push(t); }; });
  const startMake10 = async () => page.evaluate(() => { const O4 = window.__oren4; const lv = O4.ALLLV.find(l => l.id === 'add-2-0');
    const q = { k: 'bin', l: 8, op: '+', r: 5, res: 13, miss: 'res', ans: 13 }; O4.playLevel(lv, [q, { k: 'bin', l: 7, op: '+', r: 6, res: 13, miss: 'res', ans: 13 }]);
    window.__presented = null; window.__done = null;
    window.__ctx = { mount: document.querySelector('#sPlay .left'), gen: lv.gen, unit: lv.u.id, topic: lv.u.name, present: q2 => { window.__presented = q2; }, done: w => { window.__done = w; } };
    return HELP.start(q, window.__ctx); });
  ok(await startMake10(), 'start on 8 + 5');
  const w1 = await page.evaluate(() => Object.assign(HELP.wrong(), { panel: !!document.querySelector('.hlp') }));
  ok(w1.level === 0 && !w1.panel, 'one wrong answer: no help yet (he tries alone)');
  const w2 = await page.evaluate(() => HELP.wrong());
  const hintTxt = await page.evaluate(() => (document.querySelector('.hlp .hlp-t') || {}).textContent || '');
  ok(w2.level === 1 && /טִיפּ: תַּתְחִיל מִ-8 וְתִסְפֹּר עוֹד 5/.test(hintTxt.replace(/\s+/g, ' ')), 'two wrong: small tip "' + hintTxt + '"');
  ok(await page.evaluate(() => window.__sayLog.some(t => /טִיפּ/.test(t))), 'tip is spoken');
  await page.waitForTimeout(400); await shot(page, '1-tip');
  await page.evaluate(() => HELP.wrong());
  ok(await page.evaluate(() => { const p = document.querySelector('.hlp'); return p && p.dataset.level === '2' && p.querySelectorAll('.hlp-v svg .hlp-mv').length === 5; }), 'third wrong: picture (8 blue + 5 red blocks)');
  await page.waitForTimeout(2600);
  ok(await page.evaluate(() => { const mv = [...document.querySelectorAll('.hlp-v svg .hlp-mv')]; return mv.filter(e => e.style.transform && e.style.transform.includes('translate')).length === 2; }), 'animation: 2 red blocks moved to the blue 8');
  const ovf = await page.evaluate(() => { const p = document.querySelector('.hlp'); const r = p.getBoundingClientRect(); return r.right <= innerWidth + 1 && r.left >= -1 && document.documentElement.scrollWidth <= innerWidth + 1; });
  ok(ovf, 'help panel fits the screen width');
  await shot(page, '2-picture');
  await page.evaluate(() => HELP.wrong());
  ok(await page.evaluate(() => !!document.querySelector('#ov:not([hidden]) .hlp-ex')), 'fourth wrong: worked example opens');
  const exTitle = await page.evaluate(() => document.querySelector('.hlp-ex h2').textContent.replace(/\s+/g, ' '));
  ok(/בּוֹא נִפְתֹּר יַחַד אַחַת דּוֹמָה: \d \+ \d = \?/.test(exTitle) && !/8 \+ 5/.test(exTitle), 'example is a similar question: "' + exTitle + '"');
  await page.waitForSelector('.hlp-ex .hlp-go', { timeout: 20000 });
  const exSteps = await page.evaluate(() => [...document.querySelectorAll('.hlp-ex .hlp-steps li')].map(l => l.textContent.replace(/\s+/g, ' ')));
  ok(exSteps.length === 4 && /מַשְׁלִימִים לְ-10: \d \+ \d = 10/.test(exSteps[1]) && /עוֹד \d: 10 \+ \d = 1\d/.test(exSteps[2]), 'example shown step by step: ' + exSteps.join(' / '));
  ok(await page.evaluate(() => window.__sayLog.filter(t => /בּוֹא נִפְתֹּר|מַתְחִילִים|מַשְׁלִימִים|עוֹד/.test(t)).length >= 4), 'example steps are spoken');
  ok(await page.evaluate(() => { const c = document.querySelector('.hlp-ex'); const r = c.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }), 'example card fits the screen');
  await shot(page, '3-example');
  await page.click('.hlp-ex .hlp-go');
  const pres = await page.evaluate(() => window.__presented);
  ok(pres && pres.k === 'bin' && pres.op === '+' && pres.l < 10 && pres.r < 10 && pres.res > 10 && !(pres.l === 8 && pres.r === 5) && pres.res === pres.l + pres.r, 'then a new similar question to solve alone: ' + (pres && pres.l + '+' + pres.r));
  // host would show it now (integration); simulate showQ
  await page.evaluate(() => HELP.start(window.__presented, window.__ctx));
  ok(await page.evaluate(() => HELP.state && HELP.state.phase === 'solo' && /לְבַד/.test(document.querySelector('.hlp').textContent)), 'solo try: "עַכְשָׁו אַתָּה לְבַד"');
  await page.evaluate(() => { HELP.wrong(); HELP.wrong(); });
  ok(await page.evaluate(() => /בּוֹא נִקְרָא לְאַבָּא אוֹ לְאִמָּא, נִפְתֹּר יַחַד/.test((document.querySelector('#ov:not([hidden]) .hlpc') || {}).textContent || '')), 'solo fails twice: friend calls a parent');
  ok(await page.evaluate(() => /להורה:/.test(document.querySelector('.hlp-tip').textContent)), 'parent tip shown on the call card');
  await page.waitForTimeout(700); await shot(page, '4-parents');
  await page.click('#ov .hlpc .bigbtn');
  ok(await page.evaluate(() => window.__done === 'parents' && document.querySelector('#ov').hidden && !HELP.state), '"פָּתַרְנוּ יַחַד!" closes and tells the game to move on');

  // solo success earns the star
  await startMake10();
  await page.evaluate(() => { HELP.wrong(); HELP.wrong(); HELP.wrong(); HELP.wrong(); });
  await page.waitForSelector('.hlp-ex .hlp-go', { timeout: 20000 }); await page.click('.hlp-ex .hlp-go');
  const star = await page.evaluate(() => { HELP.start(window.__presented, window.__ctx); return HELP.right(); });
  ok(star.solo && star.star, 'solved the similar one alone → star');
  const helpedStar = await page.evaluate(() => { HELP.start({ k: 'bin', l: 9, op: '+', r: 4, res: 13, miss: 'res', ans: 13 }, window.__ctx); HELP.wrong(); HELP.wrong(); return HELP.right(); });
  ok(!helpedStar.star, 'right after a tip → no star');

  // idle
  await page.evaluate(() => { HELP.cfg.idle = 500; HELP.start({ k: 'bin', l: 6, op: '+', r: 7, res: 13, miss: 'res', ans: 13 }, window.__ctx); });
  await page.waitForTimeout(800);
  ok(await page.evaluate(() => HELP.state && HELP.state.level === 1 && !!document.querySelector('.hlp')), 'long idle on a question → tip without any wrong answer');
  await page.evaluate(() => { HELP.stop(); HELP.cfg.idle = 60000; });

  // teach-back
  await page.evaluate(() => { HELP.cfg.teachP = 1; HELP.cfg.teachGap = 0; HELP.start({ k: 'bin', l: 7, op: '+', r: 5, res: 12, miss: 'res', ans: 12 }, window.__ctx); HELP.wrong(); HELP.wrong(); HELP.right(); });
  await page.waitForSelector('#ov:not([hidden]) .hlp-tb', { timeout: 5000 });
  const tb = await page.evaluate(() => ({ h: document.querySelector('.hlp-tb h2').textContent, n: document.querySelectorAll('.hlp-tb .hlp-opt').length, aloud: !!document.querySelector('.hlp-tb .hlp-aloud') }));
  ok(/תַּסְבִּיר לִי, אֵיךְ עָשִׂיתָ\?/.test(tb.h) && tb.n === 3 && tb.aloud, 'teach-back: 3 explanations + "I said it aloud"');
  await shot(page, '5-teach');
  await page.click('.hlp-tb .hlp-opt');
  ok(await page.evaluate(() => /אֵיזֶה הֶסְבֵּר יָפֶה/.test(document.querySelector('.hlp-tb').textContent) && HELP.teachLog().length === 1), 'any explanation is honored and logged');
  await page.waitForTimeout(1700); await page.evaluate(() => { HELP.cfg.teachP = 0; });

  // spaced return + parent list
  const sp = await page.evaluate(() => { const list = HELP.stuckList(); const it = list.find(x => x.example === '8 + 5 = ?');
    const sameDay = HELP.due(5).length; const t = new Date(); t.setDate(t.getDate() + 1); const tom = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    HELP._today = () => tom; const due = HELP.due(10); const q = due.find(x => x.l === 8 && x.r === 5); let understood = false;
    if (q) { HELP.start(q, window.__ctx); HELP.right(); understood = HELP.stuckList().find(x => x.example === '8 + 5 = ?').understood; }
    const again = HELP.due(10).some(x => x.l === 8 && x.r === 5); HELP._today = null;
    return { line: it && it.line, nik: list.some(x => /[֑-ׇ]/.test(x.line)), sameDay, due: due.length, q: !!q, understood, again, html: HELP.parentHTML() }; });
  ok(sp.line && /^נתקע ב: חיבור עם מעבר עשרת \(השלמה ל-10\) \(8 \+ 5 = \?\)\. טיפ: /.test(sp.line) && !sp.nik, 'parent list: "' + sp.line + '"');
  ok(sp.sameDay === 0 && sp.q, 'hard item comes back the next day (not the same day)');
  ok(sp.understood && !sp.again, 'right the next day → marked understood');
  ok(/נתקע ב:/.test(sp.html), 'parentHTML ready for the parent panel');

  /* ---------- 3. more pictures (one per explainer) ---------- */
  const gal = await page.evaluate(() => { const qs = [
      ['add-cross 1', { k: 'bin', l: 37, op: '+', r: 5, res: 42, miss: 'res', ans: 42 }], ['add-cross 2', { k: 'bin', l: 38, op: '+', r: 27, res: 65, miss: 'res', ans: 65 }],
      ['add-2d', { k: 'bin', l: 34, op: '+', r: 25, res: 59, miss: 'res', ans: 59 }], ['add-10', { k: 'bin', l: 3, op: '+', r: 4, res: 7, miss: 'res', ans: 7 }],
      ['add-missing', { k: 'bin', l: 9, op: '+', r: 6, res: 15, miss: 'r', ans: 6 }], ['sub-10', { k: 'bin', l: 9, op: '−', r: 4, res: 5, miss: 'res', ans: 5 }],
      ['sub-thru10', { k: 'bin', l: 13, op: '−', r: 5, res: 8, miss: 'res', ans: 8 }], ['sub-2d', { k: 'bin', l: 76, op: '−', r: 34, res: 42, miss: 'res', ans: 42 }],
      ['sub-cross', { k: 'bin', l: 52, op: '−', r: 17, res: 35, miss: 'res', ans: 35 }], ['mul-fact', { k: 'bin', l: 4, op: '×', r: 6, res: 24, miss: 'res', ans: 24, f: [6, 4] }],
      ['div-fact', { k: 'bin', l: 12, op: ':', r: 3, res: 4, miss: 'res', ans: 4 }], ['cmp', { k: 'ch', chk: { t: 'cmp', a: 47, b: 52 }, pr: '', opts: ['<', '=', '>'], ans: 0 }],
      ['cmp3', { k: 'ch', chk: { t: 'cmp', a: 347, b: 374 }, pr: '', opts: ['<', '=', '>'], ans: 0 }], ['clock', { k: 'ch', chk: { t: 'clock', h: 3, m: 45 }, pr: '', opts: [], ans: 0 }],
      ['frac', { k: 'ch', chk: { t: 'frac', parts: 3 }, pr: '<path', opts: [], ans: 1 }]];
    const box = document.createElement('div'); box.id = 'hlpGal'; box.style.cssText = 'position:fixed;inset:0;z-index:300;overflow:auto;background:#cfe8f7;display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:10px;padding:10px;direction:rtl';
    const out = []; for (const [nm, q] of qs) { const ex = HELP.explain(q); const v = ex.visual; const c = document.createElement('div'); c.className = 'hlp'; c.innerHTML = `<div class="hlp-b"><b style="direction:ltr">${nm}</b><div class="hlp-t sm">${ex.hint}</div><div class="hlp-cap">${v.cap || ''}</div><div class="hlp-v">${v.svg || ''}${v.html || ''}</div></div>`; box.appendChild(c); out.push(nm + ':' + ex.d.type); }
    document.body.appendChild(box); box.querySelectorAll('.hlp-v').forEach(v => HELP._play(v)); return out; });
  ok(gal.every(s => s.split(':')[1].startsWith(s.split(':')[0].split(' ')[0].replace('cmp3', 'cmp'))), 'gallery types: ' + gal.join(', '));
  await page.waitForTimeout(6000); await shot(page, '6-gallery'); await page.evaluate(() => { const g = document.getElementById('hlpGal'); g.scrollTop = g.scrollHeight / 2 - 100; }); await shot(page, '6-gallery2'); await page.evaluate(() => { const g = document.getElementById('hlpGal'); g.scrollTop = g.scrollHeight; }); await shot(page, '6-gallery3');
  ok(await page.evaluate(() => { const bad = [...document.querySelectorAll('#hlpGal svg')].filter(s => { const r = s.getBoundingClientRect(); return r.width < 40 || r.height < 30; }); return bad.length === 0; }), 'all pictures render with a size');
  await page.evaluate(() => document.getElementById('hlpGal').remove());

  /* ---------- 4. reading: first sound → syllables → whole word → parent ---------- */
  const rd = await page.evaluate(async () => { const T = window.TAL; T.ACT['read-wp'].run(() => {}); await new Promise(r => setTimeout(r, 1000));
    const wrap = window.__quiz.wrap; const w = wrap.querySelector('.bigw').textContent.trim();
    window.__rctx = { mount: wrap, gen: null, done: x => { window.__done = x; } }; const okStart = HELP.start({ key: w }, window.__rctx); HELP.wrong(); HELP.wrong();
    return { w, okStart, t1: document.querySelector('.hlp .hlp-t').textContent }; });
  ok(rd.okStart && rd.t1.includes('הַצְּלִיל הָרִאשׁוֹן') && rd.t1.includes(HELP_fs(rd.w)), `reading "${rd.w}": first sound "${rd.t1}"`);
  function HELP_fs(w) { return w.slice(0, 1); }
  await page.waitForTimeout(500); await shot(page, '7-read-sound');
  await page.evaluate(() => HELP.wrong()); await page.waitForTimeout(2600);
  const syl = await page.evaluate(() => [...document.querySelectorAll('.hlp .hlp-syl span')].map(s => s.textContent));
  ok(syl.length >= 1 && syl.join('') === rd.w, 'then syllables: ' + syl.join(' · '));
  await shot(page, '8-read-syllables');
  await page.evaluate(() => HELP.wrong());
  ok(await page.evaluate(w => document.querySelector('.hlp .hlp-big').textContent === w, rd.w), 'then the whole word');
  await page.evaluate(() => HELP.wrong());
  ok(await page.evaluate(() => !!document.querySelector('#ov:not([hidden]) .hlp-par-call')), 'then a parent');
  await page.evaluate(() => document.querySelector('#ov .hlpc .bigbtn').click());

  /* ---------- 5. word problem + clock through the full ladder (examples from the level generator) ---------- */
  for (const id of ['word-0-0', 'time-q-0']) {
    const res = await page.evaluate(async id => { const O4 = window.__oren4; const lv = O4.ALLLV.find(l => l.id === id); O4.playLevel(lv);
      const q = O4.play.qs[0]; window.__presented = null; const ctx = { mount: document.querySelector('#sPlay .left'), gen: lv.gen, unit: lv.u.id, present: q2 => { window.__presented = q2; }, done: () => {} };
      HELP.start(q, ctx); HELP.wrong(); HELP.wrong(); HELP.wrong(); HELP.wrong(); return { type: HELP.explain(q).d.type, ex: !!document.querySelector('#ov:not([hidden]) .hlp-ex') }; }, id);
    await page.waitForSelector('.hlp-ex .hlp-go', { timeout: 30000 });
    const steps = await page.evaluate(() => [...document.querySelectorAll('.hlp-ex .hlp-steps li')].map(l => l.textContent.replace(/\s+/g, ' ')));
    await shot(page, '9-example-' + id);
    await page.click('.hlp-ex .hlp-go');
    const p2 = await page.evaluate(() => window.__presented);
    ok(!!(res.ex && steps.length >= 2 && p2), `${id} (${res.type}): example ${steps.join(' / ').slice(0, 160)} → solo question ${p2 ? 'given' : 'missing'}`);
    await page.evaluate(() => HELP.stop());
  }

  // phone/desktop: no horizontal scroll anywhere we drew
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal page scroll');
  ok(errs.length === 0, 'no JS errors ' + errs.slice(0, 3).join(' | '));
  await b.close();
  L.finish('help-' + L.variant, out);
})().catch(e => { console.error(e); console.log('RESULT help 0 1'); process.exit(1); });
