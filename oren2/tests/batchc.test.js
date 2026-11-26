// Batch C wired into the built game: LEARN (banks, pickItem/seen, "content left"), HELP (automatic help, no hint button), TOPIC (friend at home).
// Usage: node tests/batchc.test.js [desktop|phone]     SHOTS=1 saves screenshots (SHOTDIR=... to choose where)
const L = require('./lib');
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const SHOTDIR = process.env.SHOTDIR || L.SHOTDIR;
const shot = async (page, name) => { if (!process.env.SHOTS) return; fs.mkdirSync(SHOTDIR, { recursive: true }); await page.screenshot({ path: path.join(SHOTDIR, `batchc-${name}-${L.variant}.png`) }); };
(async () => {
  const out = []; const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => { window.__noFamily = true; });
  await page.goto(L.URL); await L.noCoach(page);
  ok(await page.evaluate(() => !!(window.LEARN && window.HELP && window.TOPIC)), 'LEARN, HELP and TOPIC are built into the game');

  /* ---------- LEARN: banks, pickItem/seen in the packs, "content left" ---------- */
  ok(await page.evaluate(() => { const b = LEARN.banks(); return ['rb-word', 'rb-sent', 'rb-story', 'rc'].every(k => b[k]); }), 'banks registered for reading words / sentences / stories / comprehension');
  const seen = await page.evaluate(async () => {
    const T = window.TAL, O = window.OREN; const before = (LEARN.state().sn || {})['rb-sent'] || '';
    T.ACT['read-sent'].run(O.showMap); await new Promise(r => setTimeout(r, 400));
    const row = document.querySelector('#sTal .chs'); const ans = window.__quiz && window.__quiz.ans;
    row && row.children[ans] && row.children[ans].click();
    await new Promise(r => setTimeout(r, 200));
    return { before, after: (LEARN.state().sn || {})['rb-sent'] || '' };
  });
  ok(seen.after && seen.after !== seen.before, 'answering a reading sentence marks it seen (LEARN.seen) so it does not repeat');
  ok(await page.evaluate(() => /נשארו \d+ חדשים/.test(LEARN.runwayOf('read-sent'))), 'content map line: "נשארו N חדשים" for a finite bank');
  await page.evaluate(() => { window.OREN.showMap(); });

  await page.evaluate(() => window.TAL.parentPanel('day')); await page.waitForTimeout(400);
  if (await page.locator('#pw1').count()) { await page.fill('#pw1', 'sod1234'); await page.fill('#pw2', 'sod1234'); await page.keyboard.press('Enter'); await page.waitForTimeout(500); }
  const par = { day: await page.evaluate(() => document.querySelector('#sPar').textContent) };
  await page.evaluate(() => { const b = [...document.querySelectorAll('#sPar *')].find(e => e.children.length === 0 && /המסלול של אורן/.test(e.textContent)); if (b) b.scrollIntoView({ block: 'start' }); }); await page.waitForTimeout(200);
  await shot(page, 'parent-day');
  ok(/המסלול של אורן/.test(par.day), 'parent panel (day): "the path of Oren — next in line" block from LEARN');
  const day = await page.evaluate(() => { const T = window.TAL; const s = T.S(); s.daily = null; s.set.plan = null; const steps = []; return { has: typeof window.LEARN.plan === 'function' && window.LEARN.plan('math', 3, new Set()).length > 0 }; });
  ok(day.has, 'LEARN.plan chooses steps for the day path');
  await page.evaluate(() => { window.OREN.showMap(); });
  /* ---------- HELP: no hint button, automatic help after two wrong answers ---------- */
  const r = await page.evaluate(async () => {
    const O4 = window.__oren4, O = window.OREN; const lv = O4.ALLLV.find(l => l.id === 'add-2-0');
    const q = () => ({ k: 'bin', l: 8, op: '+', r: 5, res: 13, miss: 'res', ans: 13 });
    window.HELP.cfg.idle = 600000; O4.playLevel(lv, [q(), q(), q()]);
    const hintBtn = [...document.querySelectorAll('#sPlay button')].some(x => /רֶמֶז/.test(x.textContent));
    const wrong = () => { const bx = document.querySelector('#sPlay .ans'); const box = O4.play; box.boxes[0].val = '5'; document.querySelector('#sPlay .key[data-k="go"]').click(); };
    wrong(); await new Promise(r => setTimeout(r, 700)); const one = !!document.querySelector('.hlp');
    wrong(); await new Promise(r => setTimeout(r, 700)); const two = !!document.querySelector('.hlp');
    return { hintBtn, one, two };
  });
  ok(!r.hintBtn, 'no "רֶמֶז" button on a math question');
  ok(!r.one && r.two, 'help appears by itself after the second wrong answer (not after the first)');
  await shot(page, 'help');
  await page.evaluate(() => { HELP.stop(); window.OREN.showMap(); });

  /* ---------- TOPIC: the friend at home ---------- */
  const t = await page.evaluate(async () => {
    const T = window.TAL, O = window.OREN; const d = T.dailyEnsure(); T.S().set.noDaily = 0; O.showMap(); await new Promise(r => setTimeout(r, 400));
    const pair = document.querySelector('#sHome .hpair'); if (!pair) return { err: 'no friend' };
    pair.click(); await new Promise(r => setTimeout(r, 300));
    return { open: !!document.querySelector('#ov:not([hidden]) .tpc'), btns: document.querySelectorAll('#ov .tpch .bigbtn').length,
      css: getComputedStyle(document.querySelector('#ov .tpch') || document.body).display };
  });
  ok(t.open && t.btns === 2, 'tapping the friend at home opens two choices (tour / practice): ' + JSON.stringify(t));
  ok(t.css === 'flex' || t.css === 'grid', 'topic picker has CSS');
  await shot(page, 'topic-choice');
  await page.evaluate(() => document.querySelectorAll('#ov .tpch .bigbtn')[1].click()); await page.waitForTimeout(300);
  await shot(page, 'topic-grid');
  ok(await page.evaluate(() => document.querySelectorAll('#ov .tpg .tpt, #ov .tpany').length > 0), 'second choice shows the topics (or "finish the path first")');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
  L.finish('batchc-' + L.variant, out);
})();
