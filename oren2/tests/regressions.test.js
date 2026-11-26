// Regression tests for specific bugs: kingdom badges button, avatar default + one-time migration, cap hat rendering.
const L = require('./lib');
const { chromium } = require('playwright');
(async () => {
  const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
  const b = await chromium.launch();
  // 1. kingdom → "my badges" button must open the badges wall without errors
  {
    const ctx = await b.newContext(L.VIEWPORT);
    await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(L.URL); await L.noCoach(p);
    await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; O.kingdom(); });
    const btn = p.locator('.kmine .tool', { hasText: 'הַתַּגִּים' });
    await btn.waitFor({ timeout: 5000 }).catch(() => {});
    ok('kingdom has the badges button', await btn.count() === 1);
    if (await btn.count()) await btn.click();
    await p.waitForSelector('#sTal .bdgg', { timeout: 5000 }).catch(() => {});
    ok('badges wall opens from the kingdom', await p.locator('#sTal .bdgg').count() === 1);
    ok('no page errors (kingdom badges)', !errs.length, errs.join(' | '));
    await ctx.close();
  }
  // 2. avatar default look + one-time migration that keeps Oren's later choices
  {
    const ctx = await b.newContext(L.VIEWPORT);
    await ctx.addInitScript(() => { window.__fast = true; });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(L.URL);
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('oren4-v1', JSON.stringify({ v: 4, t: 1, s: {}, m: {}, seen: {}, story: { intro: 1 }, rq: [], days: [], ans: 0, ok: 0, trains: 0, gems: 0, av: { hair: 'black', skin: 'light', shirt: 'green', hat: 'none', pet: 'cat' }, owned: { none: 1, cap: 1 }, k: {}, tc: [], sp: {}, made: {} })); });
    await p.reload(); await p.waitForFunction(() => window.OREN && window.OREN.save);
    const a = await p.evaluate(() => { const s = window.OREN.save; return { av: s.av, f: s.avOren }; });
    ok('old save migrated to the new default look', a.av.hair === 'lightbrown' && a.av.pants === 'olive' && a.f === 1, JSON.stringify(a));
    await p.evaluate(() => { const O = window.OREN; O.save.av.shirt = 'red'; O.persist(); });
    await p.reload(); await p.waitForFunction(() => window.OREN && window.OREN.save);
    const sh = await p.evaluate(() => window.OREN.save.av.shirt);
    ok("Oren's later choice survives reload (migration runs once)", sh === 'red', sh);
    const cap = await p.evaluate(() => { const O = window.OREN; O.save.av.hat = 'cap'; const svg = O.AV(); return typeof svg === 'string' && svg.includes('<svg'); });
    ok('avatar with cap renders', cap);
    ok('no page errors (avatar)', !errs.length, errs.join(' | '));
    // kingdom shop item pictures used to collapse to zero width
    const shopW = await p.evaluate(() => { const O = window.OREN; O.save.story.intro = 1; O.kingdom(); const svgs = [...document.querySelectorAll('.shop .opt .si svg')]; return svgs.length ? Math.min(...svgs.map(s => s.getBoundingClientRect().width)) : 0; });
    ok('kingdom shop items show their pictures', shopW > 20, String(shopW));
    // hint sentences with numbers used to break into one line per number
    const capLines = await p.evaluate(() => { const d = document.createElement('div'); d.style.width = '600px'; document.body.appendChild(d); d.innerHTML = '<div class="cap"><span>כּוֹתְבִים <span class="ltr">2</span> וּמַעֲבִירִים 1</span></div>'; const h = d.querySelector('.cap span').getBoundingClientRect().height; d.remove(); return h; });
    ok('hint sentence stays on one line', capLines < 50, String(capLines));
    // problem log: counted per day, merged across devices, shown in the parent summary
    const iss = await p.evaluate(() => { const O = window.OREN; window.__fast = false; window.dispatchEvent(new ErrorEvent('error', { message: 'boom' })); window.dispatchEvent(new ErrorEvent('error', { message: 'boom' })); window.__fast = true;
      const d = O.today(); O.mergeIn({ iss: [{ d, k: 'voice', n: 2 }] }); O.mergeIn({ iss: [{ d, k: 'voice', n: 1 }] });
      const e = O.save.iss.find(x => x.k === 'err'), v = O.save.iss.find(x => x.k === 'voice'); return { e: e && e.n, v: v && v.n }; });
    ok('problem log counts and merges', iss.e === 2 && iss.v === 2, JSON.stringify(iss));
    await ctx.close();
  }
  // #350: a real crash keeps the message AND its first stack line (file:line:col), so the next one is findable
  {
    const ctx = await b.newContext(L.VIEWPORT);
    await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    const p = await ctx.newPage(); p.on('pageerror', () => {});
    await p.goto(L.URL); await p.waitForFunction(() => window.OREN && window.OREN.save);
    await p.addScriptTag({ content: 'function oopsCrash(){const o={};const [a]=o.missing;return a;}' });
    const m = await p.evaluate(() => new Promise(r => { window.__fast = false; setTimeout(window.oopsCrash, 0); setTimeout(() => { window.__fast = true; const e = (window.OREN.save.iss || []).find(x => x.k === 'err'); r(e && e.m); }, 100); }));
    ok('crash record keeps the message', /undefined is not iterable/.test(m || ''), m);
    ok('crash record keeps the first stack line (file:line:col)', / @ oopsCrash \S*:\d+:\d+$/.test(m || '') && !/file:\/\//.test(m || ''), m);
    await ctx.close();
  }
  // journey map (#7): no cage and no "0/49" count on the world cards; one progress bar per card that grows with the stars
  {
    const ctx = await b.newContext(L.VIEWPORT);
    await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(L.URL); await L.noCoach(p);
    const j = await p.evaluate(() => { const O = window.OREN; O.save.story.intro = 1; window.TAL_noHome = true; O.showJourney();
      const cards = [...document.querySelectorAll('#sMap .worlds > .wcard2')];
      const r = { cards: cards.length, caged: document.querySelectorAll('#sMap .caged').length, count: cards.filter(c => /\d+\s*\/\s*\d+/.test(c.textContent)).length,
        bars: cards.every(c => c.querySelectorAll('.bar').length === 1), w0: cards[0] && cards[0].querySelector('.bar i').style.width };
      window.TAL_noHome = false; return r; });
    ok('journey: no cage, no "0/49" count, one progress bar per world card', j.cards > 0 && j.caged === 0 && j.count === 0 && j.bars && j.w0 === '0%', JSON.stringify(j));
    ok('no page errors (journey)', !errs.length, errs.join(' | '));
    await ctx.close();
  }
  await b.close();
  L.finish('regressions', res);
})().catch(e => { console.log('FAIL crashed — ' + e.message.split('\n')[0]); console.log('RESULT regressions 0 1'); process.exitCode = 1; });
