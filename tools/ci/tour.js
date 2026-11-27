// Regression tour (#618): the core game flows against a live URL, in a real browser, at desktop 1366x768 and phone 390x844.
// Usage: node tools/ci/tour.js [url]   (default https://oren-game.pages.dev)   SHOTS=<dir> saves a screenshot per check.
// Prints `PASS <id> <viewport>` / `FAIL <id> <viewport> <repro>` per check, then `TOUR: PASS` or `TOUR: FAIL <id>: <repro>; ...`; exit 1 on a fail.
// Never touches the real family save: every page's /api/save/<family> goes to a throwaway id (marked smoke, deleted at the end);
// event logs and diagnostics are answered locally.
const path = require('path'), fs = require('fs'), crypto = require('crypto');
try { require(path.join(__dirname, '../../oren2/tests/mute.js')); } catch (e) {}   // silent browser + daytime clock + no teach/lesson/listen holds
const { chromium } = require('playwright');
const BASE = (process.argv[2] || 'https://oren-game.pages.dev').replace(/\/+$/, '');
const FAMILY = 'a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0', SHOTS = process.env.SHOTS;
const VPS = { desktop: { viewport: { width: 1366, height: 768 } }, phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = (p, f, arg, ms = 10000) => p.waitForFunction(f, arg, { timeout: ms, polling: 100 }).then(() => true, () => false);
const lines = [], fails = [], tids = new Set();

// a page on a throwaway family id `tid`, ready on the kid's home screen (or the start screen with parent=true)
async function open(b, vp, tid, parent) {
  tids.add(tid);
  const ctx = await b.newContext({ ...VPS[vp], serviceWorkers: 'block' });
  await ctx.route('**/api/**', r => { const q = r.request(), u = q.url();
    if (/\/api\/(log|diag|tts\/stats)/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    const m = /\/api\/save\/([a-f0-9]{32})/.exec(u); if (!m) return r.continue();
    if (m[1] !== FAMILY && m[1] !== tid) return r.abort();                          // never another family
    const o = { url: u.replace(FAMILY, tid) };
    if (q.method() === 'PUT') { try { const j = JSON.parse(q.postData()); j.smoke = 'tour'; o.postData = JSON.stringify(j); } catch (e) {} }
    return r.continue(o); });
  await ctx.addInitScript(() => { window.__fast = true; window.__famGap = 0; window.__pullGap = 500; window.__parPull = 1000; window.__pcGap = 1000; window.__moments = false;
    navigator.sendBeacon = () => false;   // beacons could skip the routes above; the game then uses fetch
    // every line the game's speech queue takes, for the voice check
    window.__spk = []; setInterval(() => { const q = window.__sq; if (!q) return; [q.cur, ...q.list].forEach(x => { if (x && !window.__spk.includes(x.t)) window.__spk.push(x.t); }); }, 30); });
  const p = await ctx.newPage(); p.setDefaultTimeout(8000); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  p.tts = []; p.on('request', q => { if (/\/api\/tts\?t=/.test(q.url())) p.tts.push(decodeURIComponent((/[?&]t=([^&]*)/.exec(q.url()) || [])[1] || '')); });
  await p.goto(BASE + '/'); await p.waitForFunction(() => window.OREN && window.OREN.family && window.TAL && window.TAL.S, null, { timeout: 20000 });
  await p.evaluate(() => { window.TAL.S().coach = { home: 99, hub: 99, group: 99, map: 99, tour: 1, 'i-city': 1, 'i-map': 1, 'i-king': 1, 'i-arc': 1 }; });
  if (!parent) await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; O.persist(); O.showMap(); });
  return p;
}
// run one check: fn returns true, or a short reason (string/false) / throws; `steps` = how to repeat it by hand
async function check(id, vp, page, steps, fn) {
  let r; try { r = await Promise.race([fn(), sleep(45000).then(() => 'timeout')]); } catch (e) { r = String(e.message || e).split('\n')[0].slice(0, 80); }
  if (SHOTS && page) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${id}-${vp}.png`) }).catch(() => {}); }
  if (r === true) lines.push(`PASS ${id} ${vp}`);
  else { const rep = steps + (r ? ` (${r})` : ''); lines.push(`FAIL ${id} ${vp} ${rep}`); fails.push(`${id}: ${rep}`); }
  console.log(lines[lines.length - 1]);
}
const home = p => p.evaluate(() => { document.querySelectorAll('.tlock,.hlock').forEach(e => e.remove()); document.body.classList.remove('tlocked'); const o = document.querySelector('#ov'); if (o) o.hidden = true; window.OREN.showMap(); });
const parentIn = async P => { await P.click('.users .ucard.par'); await P.fill('#pw1', 'abcd'); if (await P.locator('#pw2').count()) await P.fill('#pw2', 'abcd'); await P.keyboard.press('Enter');
  await P.locator('#ov .pchoice .ucard.par').click({ timeout: 3000 }).catch(() => {});   // "parent panel / together time" choice
  return until(P, () => !document.querySelector('#sPar').hidden); };

async function tour(b, vp) {
  const other = vp === 'desktop' ? 'phone' : 'desktop', tid = crypto.randomBytes(16).toString('hex');
  // both devices open together: the test clock (mute.js, 10:00) starts per page, so they must start at the same moment (newer edits win a merge)
  const [K, P] = await Promise.all([open(b, vp, tid), open(b, other, tid, true)]);
  await check('daily-path', vp, K, 'open home, see 3 day cards, tap one, tap the big button', async () => {
    if (!await until(K, () => document.querySelectorAll('#sHome .dchoice .dcard').length === 3)) return 'not 3 day cards';
    await K.locator('#sHome .dchoice .dcard').first().click();
    if (!await until(K, () => document.querySelectorAll('#sHome .tpath .tstep2').length >= 3 && document.querySelector('#sHome .bigbtn.huge'))) return 'no path';
    await K.locator('#sHome .bigbtn.huge').click({ force: true });
    return await until(K, () => document.querySelector('#sHome').hidden) || 'mission did not open'; });

  await check('voice-question', vp, K, 'open a reading question (read-first), hear it, tap help, hear the help', async () => {
    await home(K); await K.evaluate(() => { window.__fast = false; window.__spk = []; window.TAL.ACT['read-first'].run(() => {}); }); K.tts.length = 0;
    if (!await until(K, () => [...document.querySelectorAll('#sTal .chs .chb')].filter(x => x.offsetParent).length >= 2)) return 'no question';
    const q = await K.evaluate(() => window.TAL.plainHe(document.querySelector('#sTal .qq').textContent).replace(/🔊/g, '').trim());
    if (!await until(K, () => window.__spk.length > 0, null, 8000)) return 'question not spoken';
    for (let i = 0; i < 40 && !K.tts.length; i++) await sleep(200);
    if (!K.tts.length) return 'no /api/tts request for the question';
    const n = await K.evaluate(() => window.__spk.length);
    await K.locator('.helpbtn:visible').first().click();
    const ok = await until(K, n => window.__spk.length > n, n, 8000);
    await K.evaluate(() => { window.__fast = true; }); return ok || `help not spoken (question: ${q.slice(0, 30)})`; });

  await check('sound-button', vp, K, 'home, tap the music button: music off; tap again: music back on', async () => {
    await home(K); const tap = () => K.locator('#btnMusic').click();
    const st = () => K.evaluate(() => ({ s: window.OREN.save.snd | 0, g: window.OREN.A ? window.OREN.A.musicBus.gain.value : -1 }));
    for (let i = 0; i < 3 && (await st()).s !== 2; i++) await tap();
    if (!await until(K, () => window.OREN.A && window.OREN.A.musicBus.gain.value > 0.01)) return 'music not playing at start ' + JSON.stringify(await st());
    await tap(); if ((await st()).s === 2) return 'state did not change';
    if (!await until(K, () => window.OREN.A.musicBus.gain.value < 0.005)) return 'music did not stop ' + JSON.stringify(await st());
    for (let i = 0; i < 3 && (await st()).s !== 2; i++) await tap();
    return await until(K, () => window.OREN.save.snd === 2 && window.OREN.A.musicBus.gain.value > 0.01) || 'music not back on ' + JSON.stringify(await st()); });

  await check('story', vp, K, 'open a story (story-0), tap "to the questions", see a question', async () => {
    await home(K); await K.evaluate(() => window.TAL.ACT['story-0'].run(() => {}));
    if (!await until(K, () => document.querySelectorAll('#sTal .sl').length > 0)) return 'no story lines';
    await K.locator('#sTal .stgo').click();
    return await until(K, () => [...document.querySelectorAll('#sTal .chs .chb')].filter(x => x.offsetParent).length >= 2) || 'no question after the story'; });

  // two devices on one throwaway family: the kid on `vp`, the parent on the other viewport
  await home(K);
  await check('parent-live', vp, P, `kid (${vp}) plays an activity; parent (${other}) has the day view open: it shows him playing`, async () => {
    if (!await parentIn(P)) return 'parent panel did not open';
    await P.evaluate(() => window.TAL.parentPanel('day')); await sleep(500);
    if (await P.evaluate(() => /משחק עכשיו/.test(document.querySelector('#sPar').textContent))) return 'already "playing" before the kid played';
    const id = await K.evaluate(() => window.TAL.dailyPool().find(id => !/^arc-/.test(id)));
    await K.evaluate(id => { window.TAL.ACT[id].run(() => {}); document.querySelector('#hud').hidden = false; window.OREN.timeTick(); }, id);
    /* #621: "playing now" and "not played yet today" never on the screen together (checked on every poll) */
    if (!await until(P, () => { const t = document.querySelector('#sPar').textContent; if (/משחק עכשיו/.test(t) && /עוד לא שיחק היום/.test(t)) window.__both = 1; return /משחק עכשיו/.test(t); }, null, 20000)) return 'day view did not update';
    await sleep(1500); const both = await P.evaluate(() => { const t = document.querySelector('#sPar').textContent; return !!window.__both || (/משחק עכשיו/.test(t) && /עוד לא שיחק היום/.test(t)); });
    return !both || 'day view shows "משחק עכשיו" and "עוד לא שיחק היום" together'; });

  await check('parent-message', vp, K, `parent (${other}) taps "now" + a ready message; the kid's home (${vp}) shows it`, async () => {
    await K.evaluate(() => { window.__health = true; }); await home(K);   // health.js (reminders, messages) is off under automation unless __health
    await P.evaluate(() => window.TAL.parentPanel('rem')); const s = P.locator('#sPar .psec', { hasText: 'תזכורת לאורן' });
    await s.locator('.pchip', { hasText: /^עכשיו$/ }).click(); const txt = (await s.locator('.hready').first().textContent()).trim(); await s.locator('.hready').first().click();
    for (let i = 0; i < 6; i++) {   // the kid's device pulls the family save itself (~12-60 s); nudge the same pull to keep the tour short
      if (await until(K, t => { const e = document.querySelector('.hlock.hmsg'); return !!e && e.textContent.includes(t); }, txt, 3000)) return true;
      await K.evaluate(() => window.OREN.famPull()); }
    return 'message not shown: ' + txt; });

  await check('time-limit', vp, K, `kid (${vp}) at a 5-min limit with 10 played: locked; parent (${other}) taps +15: kid unlocks`, async () => {
    await K.evaluate(() => { window.__health = false; }); await home(K); await K.evaluate(() => { const O = window.OREN, T = window.TAL; T.S().time[O.today()] = 600; const st = T.S().set; st.lim = Object.assign(st.lim || {}, { daily: 5, today: null }); O.persist(); O.famNow(); T.limCheck(); });
    if (!await until(K, () => !!document.querySelector('.tlock:not(.tyay)'))) return 'no lock when time is up';
    if (!await until(P, () => { window.OREN.famPull(); const l = window.TAL.S().set.lim; return l && l.daily === 5; }, null, 15000)) return 'parent did not get the limit';
    await P.evaluate(() => window.TAL.parentPanel('time')); await P.locator('#sPar .pbig .bigbtn', { hasText: '+15' }).first().click();
    return await until(K, () => !document.querySelector('.tlock:not(.tyay)'), null, 20000) || 'kid still locked after +15'; });
  const errs = [...K.errs, ...P.errs]; if (errs.length) console.log(`note ${vp}: page errors: ${errs.slice(0, 2).join(' | ').slice(0, 200)}`);
  await K.context().close(); await P.context().close();
}

(async () => {
  const t0 = Date.now(), b = await chromium.launch();
  try { for (const vp of Object.keys(VPS)) await tour(b, vp); }
  catch (e) { fails.push('tour: ' + String(e.message || e).split('\n')[0].slice(0, 120)); }
  // clean up the throwaway saves (the site deletes only saves marked smoke)
  let gone = 0; try { const c = await b.newContext(); const p = await c.newPage(); await p.goto(BASE + '/api/tts/status').catch(() => {});
    for (const t of tids) gone += await p.evaluate(t => fetch('/api/save/' + t, { method: 'DELETE' }).then(r => r.status === 200 || r.status === 404), t).catch(() => false); } catch (e) {}
  await b.close();
  console.log(fails.length ? ('TOUR: FAIL ' + fails.join('; ')).slice(0, 399) : 'TOUR: PASS');
  console.error(`tour took ${Math.round((Date.now() - t0) / 1000)} s; test saves deleted ${gone}/${tids.size}`);
  process.exit(fails.length ? 1 : 0);
})();
