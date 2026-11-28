// Screen-time limit: what is left in the top bar, spoken reminders, "finish what you started", count-based limits,
// the parent's "⏱️ היום" block, and a grant from the parent's phone unlocking Oren's device after a pull.
// Usage: node tests/timelimit.test.js [desktop|phone]
const L = require('./lib');
const http = require('http'), fs = require('fs'), path = require('path'); const { chromium } = require('playwright'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const PAGE = path.join(L.TMP, 'tlim-' + L.variant + '.html'); fs.mkdirSync(L.TMP, { recursive: true }); fs.writeFileSync(PAGE, L.wrap(fs.readFileSync(path.join(L.ROOT, 'index.html'), 'utf8')));
const PUB = path.join(L.ROOT, 'cf', 'public'); const KV = new Map();
const srv = http.createServer((q, r) => { const m = /^\/api\/save\/([a-f0-9]{32})$/.exec(q.url);
  if (m) { if (q.method === 'GET') { const v = KV.get(m[1]); r.writeHead(v ? 200 : 404, { 'content-type': 'application/json' }); return r.end(v || '{}'); }
    if (q.method === 'PUT') { let b = ''; q.on('data', c => b += c); q.on('end', () => { KV.set(m[1], b); r.end('{"ok":true}'); }); return; } }
  const f = path.join(PUB, q.url === '/' ? 'index.html' : q.url.split('?')[0]); if (fs.existsSync(f)) r.end(fs.readFileSync(f)); else { r.writeHead(404); r.end(); } }).listen(0);
(async () => {
  const b = await chromium.launch(); const errs = [];
  // ---------- one device ----------
  const ctx = await b.newContext(L.VIEWPORT); await ctx.addInitScript(() => { window.__fast = true; window.__noFamily = true; });
  const p = await ctx.newPage(); p.setDefaultTimeout(5000); p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + PAGE); await p.waitForFunction(() => window.TAL && window.TAL.limCheck); await L.noCoach(p);
  await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; window.__said = []; O.say = t => window.__said.push(t); O.showMap(); });
  const pill = () => p.evaluate(() => { const e = document.querySelector('#hud .tpill'); return e && !e.hidden ? { t: e.textContent, low: e.classList.contains('low') } : null; });
  const used = m => p.evaluate(m => { window.TAL.S().time[window.OREN.today()] = m * 60; }, m);
  const lim = o => p.evaluate(o => { const st = window.TAL.S().set; st.lim = Object.assign(st.lim || {}, o); window.TAL.limCheck(); }, o);
  const said = () => p.evaluate(() => window.__said.join(' | '));
  const locked = () => p.evaluate(() => { const e = document.querySelector('.tlock:not(.tyay)'); return e ? e.querySelector('h2').textContent : null; });
  const rid = await p.evaluate(() => window.TAL.dailyPool().find(id => !/^arc-/.test(id)));
  const startAct = () => p.evaluate(id => window.TAL.ACT[id].run(() => window.OREN.showMap()), rid);
  const endAct = async () => { await p.evaluate(id => window.TAL.finishAct(id, 0, 5, 0, () => window.OREN.showMap()), rid); await sleep(100); };
  const cont = async () => { await p.locator('#ov .bigbtn:not(.plain)').click(); await sleep(150); await p.evaluate(() => window.TAL.limCheck()); await sleep(100); };

  ok('no limit: nothing in the top bar', !(await pill()));
  await used(18); await lim({ daily: 30 }); await sleep(100);
  let pl = await pill(); ok('a limit: the top bar shows the minutes left', pl && pl.t === '⏱️ 12 דַּקּוֹת' && !pl.low, JSON.stringify(pl));
  await p.locator('#hud .tpill').click(); ok('tapping it says how much is left', (await said()).includes('נִשְׁאֲרוּ לְךָ 12 דַּקּוֹת'), await said());
  // #361: every ~10 minutes one calm line with the minutes as words; a heads-up at 5 and at 1
  await used(20); await lim({}); ok('time left said at 10 minutes, as words', (await said()).includes('נִשְׁאֲרוּ לָנוּ עוֹד עֶשֶׂר דַּקּוֹת'), await said());
  await used(25); await lim({}); pl = await pill(); ok('last minutes: orange, and the gentle heads-up at 5', pl && pl.low && pl.t === '⏱️ 5 דַּקּוֹת' && (await said()).includes('עוֹד חָמֵשׁ דַּקּוֹת נִגְמֹר. בּוֹא נְסַיֵּם אֶת מָה שֶׁהִתְחַלְנוּ.'), JSON.stringify(pl) + ' ' + await said());
  ok('no digits in the spoken time lines', !/\d/.test((await p.evaluate(() => window.__said)).filter(x => /לָנוּ|נִגְמֹר/.test(x)).join(' ')), await said());
  await p.evaluate(() => window.TAL.openHub()); await sleep(100); ok('the pill is on every screen', !!(await pill()));
  if (process.env.HSHOTS) await p.screenshot({ path: path.join(process.env.HSHOTS, 'pill-' + L.variant + '.png') });
  // #361: the 1-minute heads-up waits for a safe point (after an answer), never mid-question
  await startAct(); await sleep(150); await p.evaluate(() => { window.__said = []; }); await used(29); await lim({}); await sleep(100);
  const h1 = 'עוֹד דַּקָּה אַחַת נִגְמֹר. בּוֹא נְסַיֵּם אֶת מָה שֶׁהִתְחַלְנוּ.';
  ok('heads-up at 1 minute: not said in the middle of a question', !(await said()).includes(h1), await said());
  await p.evaluate(id => window.OREN.emit('tq', id, true), rid); await sleep(100);
  ok('heads-up at 1 minute: said right after his answer', (await said()).includes(h1), await said());
  // finish what you started
  await sleep(150); await used(31); await lim({}); await sleep(100);
  ok('time is up mid-activity: no lock, a gentle banner', !(await locked()) && await p.evaluate(() => { const g = document.querySelector('.tgrace'); return !!g && g.textContent.includes('זֶה הַתַּרְגִּיל הָאַחֲרוֹן, אַחֲרָיו נִפָּרֵד'); }));
  if (process.env.HSHOTS) await p.screenshot({ path: path.join(process.env.HSHOTS, 'grace-' + L.variant + '.png') });
  await endAct(); await p.evaluate(() => window.TAL.limCheck()); ok('not over the result window', !(await locked()));
  await cont(); ok('when the activity ends: the lock', (await locked()) === 'הַזְּמַן שֶׁל הַיּוֹם נִגְמַר' && !(await p.locator('.tgrace').count()));
  if (process.env.HSHOTS) await p.screenshot({ path: path.join(process.env.HSHOTS, 'lock-' + L.variant + '.png') });
  // a grant unlocks it with a happy note
  await p.evaluate(() => { const l = window.TAL.S().set.lim; l.today = { d: window.OREN.today(), min: 45 }; window.TAL.limCheck(); }); await sleep(100);
  ok('more time: unlocks with "אַבָּא אוֹ אִמָּא נָתְנוּ לְךָ עוֹד זְמַן! 🎉"', !(await locked()) && await p.evaluate(() => { const e = document.querySelector('.tyay'); return !!e && e.textContent.includes('אַבָּא אוֹ אִמָּא נָתְנוּ לְךָ עוֹד זְמַן! 🎉'); }));
  await p.evaluate(() => document.querySelectorAll('.tyay').forEach(e => e.remove()));
  // "finish what started" off: lock right away
  await startAct(); await sleep(100); await lim({ nofin: 1, today: null }); await used(31); await lim({}); ok('with "finish" off: locks mid-activity', !!(await locked()));
  await lim({ nofin: 0, today: { d: await p.evaluate(() => window.OREN.today()), none: 1 } }); await p.evaluate(() => document.querySelectorAll('.tyay').forEach(e => e.remove()));
  ok('"no limit today": unlocked, no pill', !(await locked()) && !(await pill()));
  // the day's tasks: finishing them never stops him, unless the parent switched "stop when tasks done" on
  const today = () => p.evaluate(() => window.OREN.today());
  const plan = async () => { const d = await today(); await p.evaluate(([d, id]) => { window.TAL.S().daily = { d, t: [id], done: [0], claimed: 0, ch: 'plan', cr: [] }; }, [d, rid]); };
  await lim({ today: { d: await today(), n: 2 }, daily: 0, stopDone: 0 }); await p.evaluate(() => window.OREN.showMap()); await sleep(100);
  ok('an old task-count limit does nothing: no pill', !(await pill()));
  await plan(); await startAct(); await sleep(100); await endAct(); await cont(); await p.evaluate(() => window.TAL.limCheck());
  ok('tasks done, setting OFF: no lock (free time)', !(await locked()));
  await plan(); await lim({ today: null, stopDone: 1 }); await startAct(); await sleep(100); await endAct(); await p.evaluate(() => window.TAL.limCheck());
  ok('setting ON: no lock over the last result', !(await locked()));
  await cont(); ok('setting ON: the lock right after the last task', (await locked()) === 'סִיַּמְתָּ אֶת הַמְּשִׂימוֹת שֶׁל הַיּוֹם!', await locked());
  // the parent dialog on the lock: "tasks done" = one continue button; time lock keeps its minute buttons
  const dlgBtns = async () => { await p.locator('.tlock .bigbtn').click(); await sleep(150); await p.locator('#pw1').click(); await p.keyboard.type('abcd'); if (await p.locator('#pw2').count()) { await p.locator('#pw2').click(); await p.keyboard.type('abcd'); } await p.keyboard.press('Enter'); await sleep(250); return p.evaluate(() => [...document.querySelectorAll('#ov .bigbtn')].map(x => x.textContent)); };
  const dd = await dlgBtns(); ok('done-lock parent dialog: one continue button, no +minutes', dd.length === 2 && dd[0] === 'להמשיך לשחק היום' && !dd.some(x => /דק׳/.test(x)), JSON.stringify(dd));
  if (process.env.HSHOTS) await p.screenshot({ path: path.join(process.env.HSHOTS, 'done-lock-dialog-' + L.variant + '.png') });
  await p.locator('#ov .bigbtn', { hasText: 'להמשיך' }).click(); await sleep(300); ok('done-lock: continue lifts the lock for today', !(await locked()));
  await lim({ stopDone: 0, daily: 30 }); await used(31); await lim({}); const td = await dlgBtns(); ok('time-lock parent dialog keeps +10/+20/+30', ['+10 דק׳', '+20 דק׳', '+30 דק׳'].every(x => td.includes(x)) && !td.includes('להמשיך לשחק היום'), JSON.stringify(td));
  await p.locator('#ov .bigbtn', { hasText: '+20' }).click(); await sleep(300); await lim({ daily: 0, today: null }); await p.evaluate(() => document.querySelectorAll('.tyay').forEach(e => e.remove()));
  // the parent's block
  await p.evaluate(() => { document.querySelectorAll('.tlock').forEach(e => e.remove()); document.body.classList.remove('tlocked'); window.TAL.parentPanel('time'); }); await sleep(300);
  const pb = await p.evaluate(() => { const s = document.querySelector('#sPar .pbody .psec'); return { h: s && s.querySelector('h3').textContent, chips: s ? [...s.querySelectorAll('.pchip')].map(x => x.textContent) : [], big: s ? [...s.querySelectorAll('.pbig .bigbtn')].map(x => x.textContent).join('|') : '' }; });
  ok('parent: "⏱️ היום" block first: two big buttons, the rest folded', pb.h === '⏱️ היום' && ['ללא הגבלה', '⏹ לסיים עכשיו'].every(c => pb.chips.includes(c)) && pb.big === 'יֵשׁ לוֹ עוֹד 5 דק׳', JSON.stringify(pb));
  if (process.env.HSHOTS) await p.screenshot({ path: path.join(process.env.HSHOTS, 'parent-today-' + L.variant + '.png') });
  if (process.env.HSHOTS) { await p.evaluate(() => document.querySelectorAll('#sPar details.pdet').forEach(d => d.open = true)); await p.evaluate(() => { const c = [...document.querySelectorAll('#sPar .pchip')].find(x => x.textContent.includes('לעצור אותו')); c && c.scrollIntoView({ block: 'center' }); }); await sleep(200); await p.screenshot({ path: path.join(process.env.HSHOTS, 'parent-switch-' + L.variant + '.png') }); }
  ok('parent: no task-count buttons', !pb.chips.some(c => /משימות$/.test(c)) && !pb.big.includes('משימה'), JSON.stringify(pb));
  const tog = () => p.evaluate(() => { const c = [...document.querySelectorAll('#sPar .pchip')].find(x => x.textContent.includes('לעצור אותו כשסיים את משימות היום')); if (!c) return null; const on = c.classList.contains('on'); c.click(); return on; });
  await lim({ stopDone: 0 }); await p.evaluate(() => window.TAL.parentPanel('time')); await sleep(300); const t1 = await tog(); ok('parent: "stop when tasks done" is OFF by default and turns ON', t1 === false && await p.evaluate(() => window.TAL.S().set.lim.stopDone === 1), String(t1));
  await sleep(200); ok('parent: and OFF again', (await tog()) === true && await p.evaluate(() => !window.TAL.S().set.lim.stopDone));
  // #658: "he has N minutes" with any N: big − / +, default 5, remembered; fake clock = the played seconds
  await lim({ daily: 0, today: null }); await used(10);
  const stp = async n => { await p.evaluate(() => window.TAL.parentPanel('time')); await sleep(250); return p.evaluate(n => { const q = t => [...document.querySelectorAll('#sPar .pstep .pchip')].find(x => x.textContent === t), nv = () => parseInt(document.querySelector('#sPar .pstep .pnum').textContent, 10); const d = nv(); let k = 0; while (nv() < n && k++ < 70) q('+').click(); k = 0; while (nv() > n && k++ < 70) q('−').click(); const bt = document.querySelector('#sPar .pbig .bigbtn'); const r = { d, lab: bt.textContent }; bt.click(); return r; }, n); };
  await p.evaluate(() => localStorage.removeItem('oren4-gmin')); const r5 = await stp(5); ok('default is 5 minutes', r5.d === 5 && /5 דק׳/.test(r5.lab), JSON.stringify(r5));
  for (const n of [1, 2, 7]) {
    await used(10); const r = await stp(n); await sleep(200); await p.evaluate(() => window.TAL.limCheck());
    ok(n + ' minute(s): he has exactly ' + n + ' left', await p.evaluate(() => window.TAL.timeLeft()) === n, JSON.stringify(r));
    await used(10 + n); await p.evaluate(() => window.TAL.limCheck()); await sleep(150);
    ok(n + ' minute(s): at the end the time is up', await p.evaluate(() => window.TAL.timeLeft()) === 0);
  }
  const r7 = await stp(7); ok('the last number (7) is remembered', r7.d === 7, JSON.stringify(r7));
  const rb = await p.evaluate(() => { localStorage.setItem('oren4-gmin', '99'); window.TAL.parentPanel('time'); return document.querySelector('#sPar .pstep .pnum').textContent; }); ok('stays within 1-60', rb === '60 דק׳', rb);
  await lim({ daily: 0, today: null }); await p.evaluate(() => document.querySelectorAll('.tlock').forEach(e => e.remove()));
  await ctx.close();
  // ---------- two devices: the parent's phone grants, Oren's device unlocks ----------
  if (fs.existsSync(path.join(PUB, 'index.html'))) {
    const BASE = 'http://localhost:' + srv.address().port + '/';
    const init = () => { window.__fast = true; window.__famGap = 0; window.__pullGap = 300; };
    const A = await (await b.newContext({ viewport: { width: 1366, height: 768 } })).newPage(); await A.addInitScript(init); A.on('pageerror', e => errs.push('A ' + e.message));
    await A.goto(BASE); await A.waitForFunction(() => window.OREN && window.OREN.family, null, { timeout: 20000 }); await L.noCoach(A);
    await A.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; T.S().time[O.today()] = 600; const st = T.S().set; st.lim = st.lim || {}; st.lim.daily = 5; O.persist(); O.showMap(); }); await sleep(2500);
    await A.evaluate(() => window.TAL.limCheck()); ok('Oren\'s device: locked (5 minutes, 10 played)', await A.evaluate(() => !!document.querySelector('.tlock')));
    const B = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage(); await B.addInitScript(() => { window.__fast = true; window.__famGap = 60000; window.__pullGap = 300; }); /* the phone's normal save delay must not slow a grant (#34) */ B.on('pageerror', e => errs.push('B ' + e.message));
    await B.goto(BASE); await B.waitForFunction(() => window.OREN && window.OREN.family && window.TAL.S().set.lim && window.TAL.S().set.lim.daily === 5, null, { timeout: 20000 }).catch(() => { }); await L.noCoach(B);
    await B.evaluate(() => window.TAL.parentPanel('time')); await sleep(400);
    await B.waitForTimeout(500); await B.locator('#sPar .pbig .bigbtn').click();
    const got = await A.waitForFunction(() => !document.querySelector('.tlock:not(.tyay)') && !!document.querySelector('.tyay'), null, { timeout: 6000 }).then(() => true).catch(() => false);
    ok('the parent\'s phone grants 5: Oren\'s device unlocks by itself, with the happy note', got, await A.evaluate(() => JSON.stringify(window.TAL.S().set.lim)));
    ok('and the top bar shows the new time', await A.evaluate(() => { const e = document.querySelector('#hud .tpill'); return !!e && !e.hidden && /[45] דַּקּוֹת/.test(e.textContent); }));
    // #45: 'he has X minutes' REPLACES what is left: end now (stopper), then 30 -> stopper goes, 30 left (not 30 + old)
    const chip = (t) => B.evaluate(() => window.TAL.parentPanel('time')).then(() => sleep(300)).then(() => B.evaluate(() => { document.querySelectorAll('#sPar details[open] details.pdet').forEach(d => { d.open = true; }); })).then(() => B.locator('#sPar .pchip', { hasText: t }).first().click());
    await chip('לסיים עכשיו');
    ok('parent ends the day: his device locks', await A.waitForFunction(() => !!document.querySelector('.tlock:not(.tyay)'), null, { timeout: 6000 }).then(() => true).catch(() => false));
    const step = async n => { await B.evaluate(() => window.TAL.parentPanel('time')); await sleep(300); await B.evaluate(n => { const q = t => [...document.querySelectorAll('#sPar .pstep .pchip')].find(x => x.textContent === t), nv = () => parseInt(document.querySelector('#sPar .pstep .pnum').textContent, 10); let k = 0; while (nv() < n && k++ < 70) q('+').click(); k = 0; while (nv() > n && k++ < 70) q('−').click(); }, n); await B.locator('#sPar .pbig .bigbtn').click(); };
    await step(30);
    const un = await A.waitForFunction(() => !document.querySelector('.tlock:not(.tyay)'), null, { timeout: 6000 }).then(() => true).catch(() => false);
    ok('parent: "30 minutes": the stopper goes away at once', un);
    ok('and he has exactly 30 minutes left (replaces, not adds)', await A.evaluate(() => window.TAL.timeLeft() === 30), await A.evaluate(() => JSON.stringify(window.TAL.S().set.lim)));
    await step(20);
    ok('a smaller number replaces too: 20 left', await A.waitForFunction(() => window.TAL.timeLeft() === 20, null, { timeout: 6000 }).then(() => true).catch(() => false));
    // #361: Oren's laptop played more than the parent's phone knows (its saves fail, the phone still shows the old minutes).
    // "he has 30 more" must give him 30 more, never end his time early.
    await step(60); await A.waitForFunction(() => window.TAL.timeLeft() >= 55, null, { timeout: 6000 }).catch(() => { });
    await A.route('**/api/save/*', r => r.request().method() === 'PUT' ? r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"store"}' }) : r.continue());
    await A.evaluate(() => { const O = window.OREN, T = window.TAL; T.S().time[O.today()] = 45 * 60; O.persist(); }); await sleep(500);
    const bUsed = await B.evaluate(() => { window.OREN.famPull(); return Math.floor((window.TAL.S().time[window.OREN.today()] | 0) / 60); });
    await step(30);
    const gotIt = await A.waitForFunction(() => { const t = window.TAL.S().set.lim.today; return t && t.add === 30; }, null, { timeout: 6000 }).then(() => true).catch(() => false);
    await sleep(2500); await A.evaluate(() => window.TAL.limCheck());
    ok('saves failing: the phone still thinks he played less', bUsed < 45, String(bUsed));
    ok('"he has 30 more" from the phone: his device is not stopped', gotIt && !(await A.evaluate(() => !!document.querySelector('.tlock:not(.tyay)'))), await A.evaluate(() => JSON.stringify(window.TAL.S().set.lim.today)));
    const aLeft = await A.evaluate(() => window.TAL.timeLeft());
    ok('and he gets the full 30 minutes from now', aLeft >= 29 && aLeft <= 30, String(aLeft));
    // the save works again: the phone shows the same "נשאר" as his device
    await A.unroute('**/api/save/*'); await A.evaluate(() => { dispatchEvent(new Event('online')); });
    const same = await B.waitForFunction(a => { window.OREN.famPull(); return Math.abs(window.TAL.timeLeft() - a) <= 1 && Math.floor((window.TAL.S().time[window.OREN.today()] | 0) / 60) >= 45; }, aLeft, { timeout: 8000, polling: 500 }).then(() => true).catch(() => false);
    ok('the parent panel shows the same minutes left as his device (±1)', same, JSON.stringify(await B.evaluate(() => [window.TAL.timeLeft(), window.TAL.S().set.lim.today, window.TAL.S().tg])));
    await B.evaluate(() => window.TAL.parentPanel('time')); await sleep(300);
    const st = await B.evaluate(() => (document.querySelector('#sPar .pstat') || {}).textContent || '');
    ok('the panel line says the same "נשאר"', new RegExp('נשאר: (' + aLeft + '|' + (aLeft - 1) + ') דק׳').test(st), st);
  }
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); srv.close(); L.finish('timelimit-' + L.variant, res);
})().catch(e => { console.error(e); srv.close(); L.finish('timelimit', res.concat(['FAIL crashed: ' + e.message])); });
