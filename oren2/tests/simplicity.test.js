// Simplicity G1/G6/G7 in the core: kid activity top bar has only back + repeat; hubs keep home/gems; tap targets >=44px.
const L = require('./lib');
const { chromium } = require('playwright');
(async () => {
  const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
  const b = await chromium.launch();
  const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await L.noCoach(p);
  const vis = sel => p.evaluate(s => { const e = document.querySelector(s); return !!e && e.offsetParent !== null && getComputedStyle(e).display !== 'none'; }, sel);
  const bar = async () => ({ gems: await vis('#gemc'), music: await vis('#btnMusic'), home: await vis('#btnHome'), chip: await p.evaluate(() => [...document.querySelectorAll('#hudMid .chip')].some(e => e.offsetParent !== null)), say: await vis('#btnSay'), back: await vis('#btnBack') });
  await p.evaluate(() => { const O = window.OREN; O.save.story.intro = 1; window.TAL.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; window.TAL.openHub(); });
  let t = await bar();
  ok('G1 hub keeps gems/music/title area', t.gems && t.music, JSON.stringify(t));
  await p.evaluate(() => window.TAL.quiz ? 0 : 0);
  await p.evaluate(() => window.TAL.openBuilding(window.TAL.BUILD[0]));
  await p.evaluate(() => { const O = window.OREN; O.setScreen('sTal', 'city', () => {}); window.TAL.hudT('בְּדִיקָה', ''); });
  t = await bar();
  ok('G1 activity: gems hidden', !t.gems, JSON.stringify(t));
  ok('G1 activity: music hidden', !t.music, JSON.stringify(t));
  ok('G1 activity: home hidden', !t.home, JSON.stringify(t));
  ok('G1 activity: title chip hidden', !t.chip, JSON.stringify(t));
  ok('G1 activity: back + repeat stay', t.back && t.say, JSON.stringify(t));
  await p.evaluate(() => { window.OREN.setScreen('sTal', 'valley', () => {}); window.OREN.hud(''); });
  t = await bar();
  ok('G1 leaving the activity restores gems + music', t.gems && t.music, JSON.stringify(t));
  // G7: top-bar buttons are at least 44px
  const sz = await p.evaluate(() => ['#btnBack', '#btnSay', '#btnMusic'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return Math.min(r.width, r.height); }));
  ok('G7 top-bar buttons >=44px', sz.every(x => x >= 44), sz.join(','));
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close();
  L.finish('simplicity', res);
})();
