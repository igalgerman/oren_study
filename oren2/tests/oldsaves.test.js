// #432 old or damaged saves: each of the 20 saves in tests/fixtures/saves/ (missing fields, empty lists, wrong types, broken JSON,
// old save formats) is put in the browser storage; the game must open, start (start button) and show the home map with no console error.
const L = require('./lib'); const { chromium } = require('playwright'); const sleep = L.sleep; const path = require('path'); const fs = require('fs');
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const DIR = path.join(__dirname, 'fixtures', 'saves');
const FIX = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort();
(async () => { const b = await chromium.launch();
  ok('20 fixture saves', FIX.length === 20, String(FIX.length));
  const one = async f => { const store = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const ctx = await b.newContext(L.VIEWPORT);
    await ctx.addInitScript(st => { window.__fast = true; if (!sessionStorage.getItem('fx')) { sessionStorage.setItem('fx', 1); localStorage.clear(); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); } }, store);
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|ERR_FILE_NOT_FOUND/.test(m.text())) errs.push('console: ' + m.text()); });
    try {
      await p.goto(L.URL); await L.noCoach(p);
      const start = await p.locator('#btnStart').isVisible();
      await p.click('#btnStart', { timeout: 5000 }); await sleep(800);
      // a first-time save plays the intro story; then home (the talents city or the map)
      await p.evaluate(() => window.OREN.showMap()); await sleep(600);
      const map = await p.evaluate(() => { const on = [...document.querySelectorAll('#screens > .screen')].filter(e => !e.hidden).map(e => e.id); return on.length === 1 && on[0] !== 'sStart' && document.querySelector('#' + on[0]).children.length > 0 ? on[0] : false; });
      // the world map (journey) opens too
      await p.evaluate(() => window.OREN.showJourney()); await sleep(400);
      // the save written back after the start is a valid save again
      const back = await p.evaluate(() => { window.OREN.persist(); try { const v = JSON.parse(localStorage.getItem('oren4-v1')); return v && v.v === 4 && typeof v.s === 'object' && !Array.isArray(v.s) && Array.isArray(v.days); } catch (e) { return false; } });
      ok(f + ': opens, start, home map, no console error', start && map && back && !errs.length, JSON.stringify({ start, map, back, errs: errs.slice(0, 3) }));
    } catch (e) { ok(f + ': opens, start, home map, no console error', false, e.message.split('\n')[0] + ' ' + JSON.stringify(errs.slice(0, 3))); }
    await ctx.close(); };
  for (let i = 0; i < FIX.length; i += 4) await Promise.all(FIX.slice(i, i + 4).map(one));
  await b.close(); L.finish('oldsaves', res);
})().catch(e => { console.error(e); process.exit(1); });
