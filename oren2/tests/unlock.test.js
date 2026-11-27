// #403 audio unlock: the first tap unlocks audio (desktop Chrome and an Android tablet profile), and a small icon hint
// (no popup) shows on the speaker button when audio is blocked; it goes away once sound plays again.
// Usage: node tests/unlock.test.js [desktop|tablet]
const L = require('./lib');
const { chromium, devices } = require('playwright');
const sleep = L.sleep, res = [], ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const tablet = L.variant === 'tablet';
const CTX = tablet ? { ...devices['Galaxy Tab S4'] } : { viewport: { width: 1366, height: 768 } };
(async () => {
  // a real browser policy: no sound before the first tap
  const b = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
  const ctx = await b.newContext(CTX);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {}
    // headless Chromium ignores the autoplay policy flag, so do what Chrome does: a new AudioContext starts suspended and
    // resume() works only while the page has a real user activation (a real click / tap gives one)
    const C = window.AudioContext; window.AudioContext = class extends C { constructor(...a) { super(...a); super.suspend(); }
      resume() { return navigator.userActivation.isActive ? super.resume() : Promise.resolve(); } };
    // the state before any tap is read inside the page: Playwright's evaluate() itself counts as a user gesture
    addEventListener('load', () => { const a = window.OREN.audio(); setTimeout(() => { window.__pre = { st: a && a.ctx.state, on: window.__au.on, act: navigator.userActivation.hasBeenActive }; }, 100); }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await sleep(600); // no evaluate() before the probe ran (it would count as a tap)
  await p.waitForFunction(() => window.__pre, null, { timeout: 5000 }).catch(() => {});
  const before = await p.evaluate(() => window.__pre || {});
  ok('before any tap the sound engine is locked', before.st === 'suspended' && !before.on && !before.act, JSON.stringify(before));
  await L.noCoach(p);
  // the first tap (a real click / touch on the start screen)
  const box = await p.locator('#sStart').boundingBox();
  if (tablet) await p.touchscreen.tap(box.x + box.width / 2, box.y + 40); else await p.mouse.click(box.x + box.width / 2, box.y + 40);
  await p.waitForFunction(() => window.OREN.A && window.OREN.A.ctx.state === 'running', null, { timeout: 3000 }).catch(() => {});
  const after = await p.evaluate(() => ({ st: window.OREN.A.ctx.state, on: window.__au.on, blk: window.__au.blocked }));
  ok(`first tap unlocks audio (${L.variant})`, after.st === 'running' && after.on && !after.blk, JSON.stringify(after));
  await p.evaluate(() => { const O = window.OREN; O.save.story.intro = 1; O.showMap(); }); await sleep(300);
  const hint = () => p.evaluate(() => { const e = document.querySelector('#btnSay'); return { cls: e.classList.contains('blk'), shown: !!e.offsetParent, mark: /svg/.test(getComputedStyle(e, '::after').backgroundImage), ov: !!document.querySelector('#ov:not([hidden])'), blk: window.__au.blocked }; });
  const h0 = await hint();
  ok('no hint while audio works', !h0.cls && !h0.blk && !h0.mark, JSON.stringify(h0));
  // the browser blocks the Google voice (NotAllowedError) and the browser voice ('not-allowed')
  await p.evaluate(async () => { const G = window.__gv; window.__A0 = window.Audio; window.__sp0 = speechSynthesis.speak; window.__ok0 = G.ok;
    window.Audio = function () { return { play: () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })), pause() {} }; };
    speechSynthesis.speak = u => setTimeout(() => u.onerror && u.onerror({ error: 'not-allowed' }), 5);
    G.ok = true; window.__fast = false; window.OREN.hush(); window.OREN.say('שָׁלוֹם'); await new Promise(r => setTimeout(r, 100)); window.__fast = true; });
  const h1 = await hint();
  ok('blocked voice: small icon hint on the speaker button', h1.cls && h1.blk && h1.shown && h1.mark, JSON.stringify(h1));
  ok('blocked voice: no popup', !h1.ov, JSON.stringify(h1));
  await L.shot(p, { path: L.SHOTDIR + '/unlock-hint-' + L.variant + '.png' });
  if (process.env.SHOT_OUT) await p.screenshot({ path: process.env.SHOT_OUT + '/unlock-hint-' + L.variant + '.png' });
  // only the browser voice blocked (no Google voice): also detected
  await p.evaluate(async () => { const G = window.__gv; window.__au.blocked = false; document.querySelector('#btnSay').classList.remove('blk'); G.ok = false; G.at = Date.now();
    window.__fast = false; window.OREN.hush(); window.OREN.say('בֹּקֶר'); await new Promise(r => setTimeout(r, 100)); window.__fast = true; });
  ok('blocked browser voice is detected too', (await hint()).blk);
  // sound plays again: the hint goes away
  await p.evaluate(async () => { const G = window.__gv; G.ok = true;
    window.Audio = function () { const a = { play() { setTimeout(() => { a.onplay && a.onplay(); a.onplaying && a.onplaying(); setTimeout(() => a.onended && a.onended(), 10); }, 5); return Promise.resolve(); }, pause() {} }; return a; };
    window.__fast = false; window.OREN.hush(); window.OREN.say('שָׁלוֹם'); await new Promise(r => setTimeout(r, 100)); window.__fast = true; });
  const h2 = await hint();
  ok('hint goes away once sound plays', !h2.cls && !h2.blk && !h2.mark, JSON.stringify(h2));
  // the sound engine cannot start even after a tap (the browser or the tablet keeps it off): hint
  await p.evaluate(() => { const c = window.OREN.A.ctx; window.__res0 = c.resume; c.suspend(); c.resume = () => Promise.resolve(); });
  await sleep(100);
  const hb = await p.locator('#hud').boundingBox();
  if (tablet) await p.touchscreen.tap(hb.x + hb.width / 2, hb.y + hb.height + 200); else await p.mouse.click(hb.x + hb.width / 2, hb.y + hb.height + 200);
  await sleep(200);
  const h3 = await hint();
  ok('sound engine still locked after a tap: hint', h3.cls && h3.blk && !h3.ov, JSON.stringify(h3));
  // it works again: the next tap clears the hint
  await p.evaluate(() => { const c = window.OREN.A.ctx; c.resume = window.__res0; });
  if (tablet) await p.touchscreen.tap(hb.x + hb.width / 2, hb.y + hb.height + 200); else await p.mouse.click(hb.x + hb.width / 2, hb.y + hb.height + 200);
  await p.waitForFunction(() => !window.__au.blocked, null, { timeout: 3000 }).catch(() => {});
  ok('a tap that unlocks clears the hint', !(await hint()).blk);
  await p.evaluate(() => { window.Audio = window.__A0; speechSynthesis.speak = window.__sp0; window.__gv.ok = window.__ok0; });
  ok('no errors', !errs.length, errs.join('|'));
  await b.close(); L.finish('unlock-' + L.variant, res);
})();
