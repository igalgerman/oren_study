// Healthy screen time (health.js): body breaks at the end of an activity, meal pauses by the clock,
// topic switching (a domain rests till tomorrow), resting doors, parent settings, family merge.
// Time is simulated through HEALTH.clock.  Usage: node tests/health.test.js [desktop|phone]   (HSHOTS=dir saves screenshots)
const L = require('./lib');
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, i = '') => { res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : '')); if (process.env.DBG) console.log(res[res.length - 1]); };
// the built game; if health.js is not injected yet, inject it here
let html = fs.readFileSync(path.join(L.ROOT, 'index.html'), 'utf8');
const BUILT = html.includes('window.HEALTH=H');   // integrated into the game (phase 2): also test the parent panel and sync
if (!BUILT) {
  const css = fs.readFileSync(path.join(L.ROOT, 'health.css'), 'utf8'), js = fs.readFileSync(path.join(L.ROOT, 'health.js'), 'utf8');
  html = html.replace('<!--/TALENTS-->', '<style>' + css + '</style>\n<script>\n' + js + '\n</script>\n<!--/TALENTS-->');
}
const PAGE = path.join(L.TMP, 'health-' + L.variant + '.html'); fs.mkdirSync(L.TMP, { recursive: true }); fs.writeFileSync(PAGE, L.wrap(html));
const SH = process.env.HSHOTS; if (SH) fs.mkdirSync(SH, { recursive: true });
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { window.__fast = true; window.__noFamily = true; window.__health = true; });
  const p = await ctx.newPage(); p.setDefaultTimeout(5000); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const shot = async n => { if (SH) await p.screenshot({ path: path.join(SH, n + '-' + L.variant + '.png') }); };
  const T0 = '2026-11-25T10:00:00';
  const boot = async t => {
    await p.waitForFunction(() => window.HEALTH && window.TAL && window.TAL.S, null, { timeout: 15000 });
    await p.evaluate(t => { window.__t = +new Date(t); window.HEALTH.clock = () => window.__t; const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = T.S().prof || { an: 'cat', col: '#3a8fc4', love: 'art' }; }, t);
    await L.noCoach(p);
  };
  const clock = (ms) => p.evaluate(ms => { window.__t += ms; }, ms);
  const setClock = (t) => p.evaluate(t => { window.__t = +new Date(t); }, t);
  const home = () => p.evaluate(() => { window.OREN.showMap(); });
  const ticks = (min) => p.evaluate(min => { for (let i = 0; i < min * 4; i++) { window.__t += 15000; window.HEALTH.tick(15); } }, min);
  const st = () => p.evaluate(() => { const r = window.HEALTH.day(); return JSON.parse(JSON.stringify(r)); });
  const lock = () => p.evaluate(() => { const e = document.querySelector('.hlock'); if (!e) return null; const bt = e.querySelector('.hback'); return { cls: e.className, h2: (e.querySelector('h2') || {}).textContent, sub: (e.querySelector('.sub') || {}).textContent, dis: bt ? bt.disabled : null, cards: [...e.querySelectorAll('.hcards .dcard b')].map(x => x.textContent), one: !!e.querySelector('.hone'), par: !!e.querySelector('.hpar') }; });
  const pressBack = () => p.locator('.hlock .hback').click();
  const readAct = () => p.evaluate(() => window.TAL.dailyPool().find(id => window.HEALTH.domOf(id) === 'read'));
  // a whole activity: start it, finish it, press "continue" on the result window
  const playAct = async (id) => { await p.evaluate(id => { const T = window.TAL, O = window.OREN; T.ACT[id].run(() => O.showMap()); }, id); await sleep(150);
    await p.evaluate(id => { const T = window.TAL, O = window.OREN; T.finishAct(id, 0, 5, 0, () => O.showMap()); }, id); await sleep(150);
    await p.locator('#ov .bigbtn:not(.plain)').click(); await sleep(400); };

  await p.goto('file://' + PAGE); await boot(T0); await home(); await sleep(300);
  ok('nothing shows at the start', !(await lock()));
  // ---------- body breaks ----------
  await ticks(19); await sleep(300); ok('no break before the interval', !(await lock()));
  await ticks(1.25); await sleep(300); let l = await lock();
  ok('after 20 active minutes, at home: a break screen', l && /hbrk/.test(l.cls), JSON.stringify(l));
  ok('the first break: water', l && l.h2 === 'בּוֹא נִשְׁתֶּה מַיִם!', l && l.h2);
  ok('"I\'m back" waits for a short countdown', l && l.dis === true);
  await shot('break-water');
  await clock(31000); await sleep(400); l = await lock(); ok('then the button turns on', l && l.dis === false);
  await pressBack(); await sleep(450); ok('back where he was (home)', !(await lock()) && await p.evaluate(() => !document.getElementById('sHome').hidden));
  let r = await st(); ok('break logged as taken', r.breaks.length === 1 && r.breaks[0].k === 'water' && r.breaks[0].ok === 1, JSON.stringify(r.breaks));
  // never in the middle of an activity
  const rid = await readAct(); ok('a reading activity exists', !!rid, rid);
  await p.evaluate(id => window.TAL.ACT[id].run(() => window.OREN.showMap()), rid); await sleep(200);
  await ticks(21); await sleep(1300); ok('no break in the middle of an activity', !(await lock()));
  await p.evaluate(id => window.TAL.finishAct(id, 0, 5, 0, () => window.OREN.showMap()), rid); await sleep(1300);
  ok('not over the result window either', !(await lock()) && await p.evaluate(() => !document.getElementById('ov').hidden));
  await p.locator('#ov .bigbtn:not(.plain)').click(); await sleep(400); l = await lock();
  ok('the break comes when the activity ends', l && /hbrk/.test(l.cls));
  ok('breaks rotate (2nd: toilet)', l && l.h2 === 'אוּלַי צָרִיךְ לָלֶכֶת לַשֵּׁרוּתִים?', l && l.h2);
  r = await st(); ok('activities and minutes are counted per domain', (r.act.read | 0) >= 1 && (r.dom.read | 0) >= 20 * 60, JSON.stringify({ act: r.act, dom: r.dom }));
  await clock(31000); await sleep(350); await pressBack(); await sleep(500); l = await lock();
  // ---------- topic switching (right after the break: 21 minutes of reading) ----------
  ok('over 15 minutes of reading: the friend suggests something else', l && /htopic/.test(l.cls) && l.h2 === 'עָשִׂינוּ הַמּוֹן קְרִיאָה הַיּוֹם!' && l.sub === 'נַמְשִׁיךְ מָחָר. מָה בָּא לְךָ עַכְשָׁו?', JSON.stringify(l));
  ok('two big cards of other domains + "one more"', l && l.cards.length === 2 && !l.cards.includes('קוֹרְאִים וְכוֹתְבִים') && l.one, JSON.stringify(l && l.cards));
  await shot('topic');
  await p.locator('.hlock .hone').click(); await sleep(400); ok('"one more" closes it', !(await lock()));
  r = await st(); ok('reading now rests till tomorrow', !!r.rest.read && r.one.read === 1 && await p.evaluate(() => window.HEALTH.resting('read')));
  await playAct(rid); l = await lock(); ok('after the one more: asked again, without "one more"', l && /htopic/.test(l.cls) && !l.one);
  await p.locator('.hlock .hcards .dcard').first().click(); await sleep(500);
  ok('a card takes him to the other domain', !(await lock()) && await p.evaluate(() => window.HEALTH.current() !== 'read'), await p.evaluate(() => window.HEALTH.current()));
  // resting doors
  await p.evaluate(() => { const T = window.TAL; document.getElementById('dlg').hidden = true; T.openGroup(T.GROUPS.find(g => g.id === 'readg')); }); await sleep(300);
  const moons = await p.evaluate(() => [...document.querySelectorAll('#sTal .bld')].map(b => [b.querySelector('.nm').textContent, !!b.querySelector('.hmoon')]));
  ok('resting buildings show a small moon, others not', moons.some(x => x[1]) && moons.some(x => !x[1] && x[0] === 'אַנְגְּלִית'), JSON.stringify(moons));
  await shot('rest-doors');
  await p.locator('#sTal .bld.hrest').first().click(); await sleep(300); l = await lock();
  ok('tapping a resting door: the friend gently suggests something else', l && /hrestc/.test(l.cls) && l.h2 === 'זֶה נָח עַד מָחָר 🌙' && l.cards.length === 2 && !l.one, JSON.stringify(l));
  await shot('rest-tap');
  await p.evaluate(() => { document.querySelector('.hlock').remove(); document.body.classList.remove('hlocked'); window.HEALTH.allow('read'); window.HEALTH.decorate(); }); await sleep(200);
  ok('a parent can let it go on today', await p.evaluate(() => !window.HEALTH.resting('read') && !document.querySelector('#sTal .hmoon')));
  // by count: 4 activities in one domain
  const sid = await p.evaluate(() => window.TAL.dailyPool().find(id => window.HEALTH.domOf(id) === 'sci'));
  if (sid) { for (let i = 0; i < 3; i++) { await playAct(sid); if (await lock()) break; }
    ok('3 science activities: nothing yet', !(await lock()));
    await playAct(sid); l = await lock(); ok('the 4th: topic switch for science', l && l.h2 === 'עָשִׂינוּ הַמּוֹן מַדָּע הַיּוֹם!', l && l.h2);
    await p.locator('.hlock .hone').click(); await sleep(300); }
  // calm never rests
  await p.evaluate(() => { const r = window.HEALTH.day(); r.dom.calm = 3600; r.act.calm = 9; window.HEALTH.onActivityEnd('calm', 'x'); }); await sleep(2900); await p.evaluate(() => window.HEALTH.check()); await sleep(200);
  ok('calm activities never rest', !(await lock()) && !(await st()).rest.calm);
  // movement + eyes
  await p.evaluate(() => window.HEALTH.showBreak()); await sleep(200); l = await lock();
  ok('3rd: movement, the friend jumps', l && /hjump|hstretch/.test(l.cls) && /קוֹפְצִים|מִתְמַתְּחִים/.test(l.h2), l && l.h2);
  await sleep(300); await shot('break-move'); await clock(31000); await sleep(350); await pressBack(); await sleep(400);
  await p.evaluate(() => window.HEALTH.showBreak()); await sleep(200); l = await lock(); ok('4th: eyes rest', l && l.h2 === 'מְנוּחָה לָעֵינַיִם');
  await clock(21000); await sleep(350); await pressBack(); await sleep(400);
  // ---------- meals ----------
  await home(); await setClock('2026-11-25T13:05:00'); await p.evaluate(() => window.HEALTH.check()); await sleep(300); l = await lock();
  ok('lunch time: the game pauses', l && /hmeal/.test(l.cls) && l.h2 === 'הִגִּיעַ זְמַן לֶאֱכֹל!' && /נַמְשִׁיךְ אַחֲרֵי הָאֹכֶל/.test(l.sub), JSON.stringify(l));
  ok('"I ate" waits (minimum pause)', l && l.dis === true);
  await shot('meal');
  await clock(9 * 60000); await sleep(350); ok('still waiting after 9 minutes', (await lock()).dis === true);
  // a reload does not skip the meal
  await p.reload();
  await boot('2026-11-25T13:14:30'); await home(); await sleep(400); l = await lock();
  ok('after a reload the meal pause is still there', l && /hmeal/.test(l.cls));
  await clock(60000); await sleep(400); l = await lock(); ok('after 10 minutes "I ate" turns on', l && l.dis === false, JSON.stringify([l, await st().then(r => r.meals), await p.evaluate(() => new Date(window.HEALTH.clock()).toString())]));
  await pressBack(); await sleep(400); r = await st(); ok('meal logged', r.meals.l && r.meals.l.e > r.meals.l.s);
  await p.evaluate(() => window.HEALTH.check()); await sleep(200); ok('only once per meal per day', !(await lock()));
  // parent unlock with the password (existing login)
  if (await p.evaluate(() => !!window.TAL.login)) {
    await setClock('2026-11-25T18:40:00'); await p.evaluate(() => window.HEALTH.check()); await sleep(300); l = await lock();
    ok('dinner pause has a small parent button', l && /hmeal/.test(l.cls) && l.par);
    await p.locator('.hlock .hpar').click(); await sleep(300);
    await p.fill('#pw1', 'abcd'); if (await p.locator('#pw2').count()) await p.fill('#pw2', 'abcd'); await p.locator('#ov .bigbtn:not(.plain)').click(); await sleep(600);
    r = await st(); ok('the parent password ends the pause early', !(await lock()) && r.meals.d && r.meals.d.p === 1, JSON.stringify(r.meals));
  }
  // ---------- settings ----------
  await p.evaluate(() => { window.HEALTH.setCfg('off', { water: 1, toilet: 1, move: 1, eyes: 1, meal: 1 }); }); await ticks(40); await home(); await sleep(400);
  ok('all reminders off: no breaks', !(await lock()));
  await p.evaluate(() => { window.HEALTH.setCfg('off', { move: 0 }); window.HEALTH.setCfg('brk', 15); }); await home(); await sleep(400); l = await lock();
  ok('only movement on, every 15 minutes', l && /hjump|hstretch/.test(l.cls)); await clock(31000); await sleep(350); await pressBack(); await sleep(300);
  // parent panel
  if (BUILT) {
    /* #7: the settings live under הגדרות, today's log stays on the day tab */
    await p.evaluate(() => window.TAL.parentPanel('day')); await sleep(400);
    const lg0 = await p.evaluate(() => { const lg = [...document.querySelectorAll('#sPar .psec')].find(x => /הפסקות וזמן לפי תחום/.test(x.textContent)); return { log: lg ? lg.textContent : '', set: /הפסקות, ארוחות/.test(document.getElementById('sPar').textContent), old: /תזכורת הפסקה אחרי/.test(document.getElementById('sPar').textContent) }; });
    await p.evaluate(() => window.TAL.parentPanel('health')); await sleep(400);
    const pn = await p.evaluate(() => { const s = [...document.querySelectorAll('#sPar .psec')].find(x => /הפסקות, ארוחות/.test(x.textContent));
      return { sec: !!s, chips: s ? s.querySelectorAll('.pchip').length : 0, times: s ? s.querySelectorAll('input[type=time]').length : 0, old: /תזכורת הפסקה אחרי/.test(document.getElementById('sPar').textContent) }; });
    pn.log = lg0.log; pn.old = pn.old || lg0.old; pn.onDay = lg0.set;
    ok('#7 break settings are not on the day tab', !pn.onDay);
    ok('parent panel: reminders, interval, meal times, topic threshold', pn.sec && pn.chips === 11 && pn.times === 3, JSON.stringify(pn));
    ok('parent panel: today\'s log (breaks, minutes per domain)', /קריאה וכתיבה/.test(pn.log) && /💧/.test(pn.log), pn.log.slice(0, 200));
    ok('the old break reminder row is gone', !pn.old);
    await p.evaluate(() => { const s = [...document.querySelectorAll('#sPar .psec')].find(x => /הפסקות, ארוחות/.test(x.textContent)); s.scrollIntoView(); }); await sleep(200); await shot('parent');
    await p.locator('#sPar .psec', { hasText: 'הפסקות, ארוחות' }).locator('.pchip', { hasText: '30 דק׳' }).first().click(); await sleep(300);
    ok('interval chip saves', await p.evaluate(() => window.HEALTH.cfg().brk === 30));
    await p.evaluate(() => window.OREN.showMap()); await sleep(200);
  }
  // ---------- #46: a reminder from the parent (bathroom / water / eat), now or in X minutes ----------
  await p.evaluate(() => { window.__says = []; const O = window.OREN, s0 = O.say; O.say = t => { window.__says.push(String(t)); return s0 && s0(t); }; });
  const rem = () => p.evaluate(() => { const e = document.querySelector('.hlock.hrem'); if (!e) return null; return { h2: (e.querySelector('h2') || {}).textContent, ok: !!e.querySelector('.hback'), dis: (e.querySelector('.hback') || {}).disabled, k: (e.querySelector('.hk') || {}).textContent }; });
  ok('three fixed reminder sentences, with nikud', await p.evaluate(() => { const t = window.HEALTH.remTexts(); return t.length === 3 && t.every(s => /[ְ-ּ]/.test(s)); }));
  if (BUILT) {
    await p.evaluate(() => window.TAL.parentPanel('day')); await sleep(400);
    const rs = p.locator('#sPar .psec', { hasText: 'תזכורת לאורן' });
    const rp = await rs.evaluate(s => ({ big: [...s.querySelectorAll('.bigbtn')].map(b => b.textContent.trim()), chips: [...s.querySelectorAll('.pchip')].map(b => b.textContent.trim()), inputs: s.querySelectorAll('input,textarea').length })).catch(() => null);
    ok('parent panel: 3 reminder buttons, "now" or in X minutes, one message field (#353)', rp && rp.big.length === 3 && rp.chips[0] === 'עכשיו' && rp.chips.length >= 3 && rp.inputs === 1, JSON.stringify(rp));
    await rs.locator('.pchip', { hasText: /^5 דק׳$/ }).click(); await sleep(200);
    await p.locator('#sPar .psec', { hasText: 'תזכורת לאורן' }).locator('.bigbtn', { hasText: 'מים' }).click(); await sleep(300);
    const sr = await p.evaluate(() => ({ r: window.TAL.S().set.rem, now: window.HEALTH.clock() }));
    ok('parent sends "water in 5 minutes"', sr.r && sr.r.k === 'water' && sr.r.at === sr.now + 5 * 60000 && !sr.r.ok, JSON.stringify(sr));
    ok('the panel says when it will show', /תופיע ב-/.test(await p.locator('#sPar .psec', { hasText: 'תזכורת לאורן' }).textContent()));
    await shot('parent-reminder');
    await p.evaluate(() => window.OREN.showMap()); await sleep(200);
  } else await p.evaluate(() => { window.TAL.S().set.rem = { k: 'water', at: window.HEALTH.clock() + 5 * 60000, t: window.HEALTH.clock() }; });
  await p.evaluate(() => window.HEALTH.check()); await sleep(200); ok('a later reminder waits for its time', !(await rem()));
  await clock(5 * 60000); await p.evaluate(() => window.HEALTH.check()); await sleep(600); l = await rem();
  ok('at its time, at home: a big picture with the sentence', l && l.k === '💧' && /לִשְׁתּוֹת מַיִם/.test(l.h2) && l.ok && !l.dis, JSON.stringify(l));
  ok('the game voice reads it', await p.evaluate(() => window.__says.some(s => /מַיִם/.test(s))));
  await shot('reminder-water');
  await pressBack(); await sleep(400);
  ok('ok dismisses it, and it is marked seen', !(await rem()) && await p.evaluate(() => window.TAL.S().set.rem.ok === 1));
  await p.evaluate(() => window.HEALTH.check()); await sleep(200); ok('and it does not come back', !(await rem()));
  // it does not interrupt: during an activity it waits for the end
  await p.evaluate(id => window.TAL.ACT[id].run(() => window.OREN.showMap()), rid); await sleep(200);
  await p.evaluate(() => { const t = window.HEALTH.clock(); window.TAL.S().set.rem = { k: 'toilet', at: t, t }; window.HEALTH.check(); }); await sleep(300);
  await clock(30000); await p.evaluate(() => window.HEALTH.check()); await sleep(300);
  ok('reminder "now" does not interrupt an activity', !(await rem()));
  await p.evaluate(id => window.TAL.finishAct(id, 0, 5, 0, () => window.OREN.showMap()), rid); await sleep(600);
  ok('not over the result window', !(await rem()));
  await p.locator('#ov .bigbtn:not(.plain)').click(); await sleep(500); l = await rem();
  ok('it shows when the activity ends', l && l.k === '🚽' && /לַשֵּׁרוּתִים/.test(l.h2), JSON.stringify(l));
  await pressBack(); await sleep(400); if (await lock()) { await clock(31000); await sleep(400); await pressBack(); await sleep(400); }
  // ... but at most about a minute
  await p.evaluate(id => window.TAL.ACT[id].run(() => window.OREN.showMap()), rid); await sleep(200);
  await p.evaluate(() => { const t = window.HEALTH.clock(); window.TAL.S().set.rem = { k: 'eat', at: t, t }; window.HEALTH.check(); }); await sleep(300);
  await clock(61000); await p.evaluate(() => window.HEALTH.check()); await sleep(400); l = await rem();
  ok('after about a minute it shows even in an activity', l && l.k === '🍽️' && /לֶאֱכֹל/.test(l.h2), JSON.stringify(l));
  await pressBack(); await sleep(300); await p.evaluate(() => window.OREN.showMap()); await sleep(300);
  if (await lock()) { await clock(31000); await sleep(400); await pressBack(); await sleep(400); }
  // an old reminder (device was off for hours) is not shown
  await p.evaluate(() => { const t = window.HEALTH.clock() - 3 * 3600e3; window.TAL.S().set.rem = { k: 'water', at: t, t }; window.HEALTH.check(); }); await sleep(300);
  ok('a reminder from hours ago is skipped', !(await rem()));
  // ---------- #353: a typed message from the parent, the friend says it aloud ----------
  const msg = () => p.evaluate(() => { const e = document.querySelector('.hlock.hmsg'); if (!e) return null; return { h2: (e.querySelector('h2') || {}).textContent, again: !!e.querySelector('.hagain'), close: !!e.querySelector('.hback'), fr: !!e.querySelector('.hav') }; });
  const TXT = 'אורן, יש לך 2 דקות ואז לאכול <b>';
  if (BUILT) {
    await p.evaluate(() => window.TAL.parentPanel('day')); await sleep(400);
    const ms = () => p.locator('#sPar .psec', { hasText: 'תזכורת לאורן' });
    const fld = await ms().evaluate(s => { const i = s.querySelector('input.hmsgin'); return i ? { ph: i.placeholder, max: i.maxLength, lbl: s.textContent.includes('הודעה מהחבר') } : null; }).catch(() => null);
    ok('#353 one text field "a message from the friend", max ~120 chars', fld && fld.lbl && fld.max >= 100 && fld.max <= 140, JSON.stringify(fld));
    await p.evaluate(() => { window.TAL.S().set.rem = null; });
    await ms().locator('.pchip', { hasText: /^עכשיו$/ }).click(); await sleep(200);
    await ms().locator('input.hmsgin').fill('   '); const dis = await ms().locator('.hmsgsend').isDisabled();
    await ms().locator('.hmsgsend').evaluate(b => { b.disabled = false; b.click(); }); await sleep(200);
    ok('#353 an empty / only-spaces message cannot be sent', dis && await p.evaluate(() => !window.TAL.S().set.rem));
    await ms().locator('input.hmsgin').fill(TXT); await sleep(100);
    await p.evaluate(() => { const s = [...document.querySelectorAll('#sPar .psec')].find(x => /תזכורת לאורן/.test(x.textContent)); s.scrollIntoView(); }); await shot('parent-message');
    await ms().locator('.hmsgsend').click(); await sleep(300);
    const sm = await p.evaluate(() => ({ r: window.TAL.S().set.rem, now: window.HEALTH.clock() }));
    ok('#353 parent sends the text "now", same delivery path as the reminders', sm.r && sm.r.k === 'msg' && sm.r.x === 'אורן, יש לך 2 דקות ואז לאכול <b>' && sm.r.at === sm.now && !sm.r.ok, JSON.stringify(sm));
    ok('#353 the panel says it waits for the end of the activity', /ממתינה לסוף הפעילות/.test(await ms().textContent()));
    await p.evaluate(() => { window.__msg = window.TAL.S().set.rem; window.TAL.S().set.rem = null; window.OREN.showMap(); }); await sleep(200);
  } else await p.evaluate(x => { window.__msg = { k: 'msg', x }; }, TXT);
  // "now" during an activity: delivered at the next safe point (the end of the activity)
  await p.evaluate(id => window.TAL.ACT[id].run(() => window.OREN.showMap()), rid); await sleep(200);
  await p.evaluate(() => { window.__says = []; const t = window.HEALTH.clock(); window.TAL.S().set.rem = Object.assign({}, window.__msg, { at: t, t }); window.HEALTH.check(); }); await sleep(300);
  ok('#353 the message does not interrupt an activity', !(await msg()));
  await p.evaluate(id => window.TAL.finishAct(id, 0, 5, 0, () => window.OREN.showMap()), rid); await sleep(600);
  await p.locator('#ov .bigbtn:not(.plain)').click(); await sleep(700); l = await msg();
  ok('#353 at the end of the activity: the friend big, the text big, hear-again and close', l && l.fr && l.h2 === TXT && l.again && l.close, JSON.stringify(l));
  ok('#353 the friend says the text in the game voice', await p.evaluate(x => window.__says.some(s => s.includes('אורן, יש לך 2 דקות ואז לאכול')), TXT), JSON.stringify(await p.evaluate(() => window.__says)));
  ok('#353 digits are spoken as Hebrew words (#122 path)', await p.evaluate(() => !/\d/.test(window.__fullSpell('יש לך 2 דקות')) && /שתי/.test(window.__fullSpell('יש לך 2 דקות'))));
  await shot('message-kid');
  await p.evaluate(() => { window.__says = []; }); await p.locator('.hlock .hagain').click(); await sleep(300);
  ok('#353 "hear again" says it again', await p.evaluate(() => window.__says.some(s => s.includes('2 דקות'))) && !!(await msg()));
  ok('#353 shown = said', await p.evaluate(() => !!window.TAL.S().set.rem.s));
  await pressBack(); await sleep(300);
  ok('#353 close dismisses it and it does not come back', !(await msg()) && await p.evaluate(() => { window.HEALTH.check(); return window.TAL.S().set.rem.ok === 1 && !document.querySelector('.hlock.hmsg'); }));
  if (BUILT) { await p.evaluate(() => window.TAL.parentPanel('day')); await sleep(300);
    ok('#353 the parent sees "said"', /נאמרה/.test(await p.locator('#sPar .psec', { hasText: 'תזכורת לאורן' }).textContent()));
    await p.evaluate(() => window.OREN.showMap()); await sleep(300); }
  await p.evaluate(() => { const t = window.HEALTH.clock(); window.TAL.S().set.rem = { k: 'msg', x: '   ', at: t, t }; window.HEALTH.check(); }); await sleep(300);
  ok('#353 an empty message is never shown', !(await msg()));
  await p.evaluate(() => { window.TAL.S().set.rem = null; });
  // ---------- tomorrow ----------
  await setClock('2026-11-26T09:00:00'); await p.evaluate(() => { const r = window.HEALTH.day(); r.on = 60; });
  const rv = await p.evaluate(() => ({ rest: window.HEALTH.resting('read'), sci: window.HEALTH.resting('sci'), review: window.HEALTH.review() }));
  ok('tomorrow nothing rests', !rv.rest && !rv.sci);
  ok('tomorrow: a review of where he stopped', rv.review.length >= 1, JSON.stringify(rv.review));
  // ---------- family merge ----------
  const mg = await p.evaluate(() => window.HEALTH.merge({ '2026-11-25': { on: 100, ba: 50, dom: { math: 60 }, act: { math: 1 }, breaks: [{ k: 'water', t: '10:00' }], meals: {}, rest: {} } },
    { '2026-11-25': { on: 80, ba: 70, dom: { math: 30, read: 40 }, act: { math: 3 }, breaks: [{ k: 'water', t: '10:00', ok: 1 }, { k: 'eyes', t: '11:00' }], meals: { l: { s: 5, e: 9 } }, rest: { math: 'math' } } }));
  const m = mg['2026-11-25']; ok('merge: max per field, union of breaks', m.on === 100 && m.ba === 70 && m.dom.math === 60 && m.dom.read === 40 && m.act.math === 3 && m.breaks.length === 2 && m.breaks[0].ok === 1 && m.meals.l.e === 9 && m.rest.math === 'math', JSON.stringify(m));
  if (await p.evaluate(() => window.OREN.mergeIn.toString().includes('HEALTH') || window.OREN.mergeIn.toString().includes('health'))) {
    const fm = await p.evaluate(() => { const O = window.OREN; O.mergeIn({ health: { '2026-11-20': { on: 999, dom: { eng: 120 }, breaks: [] } } }); return O.save.health['2026-11-20']; });
    ok('family sync merges the health log', fm && fm.on === 999 && fm.dom.eng === 120, JSON.stringify(fm));
  }
  const cap = await p.evaluate(() => { const s = window.TAL.S(); for (let i = 0; i < 80; i++) s.health['2025-01-' + String(i).padStart(3, '0')] = { on: 1 }; window.__t += 864e5; window.HEALTH.day(); return Object.keys(s.health).length; });
  ok('history is capped at 60 days', cap <= 61, cap);
  // ---------- layout ----------
  await p.evaluate(() => window.HEALTH.showTopic('math')); await sleep(300);
  const fit = await p.evaluate(() => { const c = document.querySelector('.hlock .card').getBoundingClientRect(); return { w: c.width, r: c.right, l: c.left, b: c.bottom, iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth }; });
  ok('the screen fits the window', fit.l >= 0 && fit.r <= fit.iw && fit.b <= fit.ih && fit.sw <= fit.iw, JSON.stringify(fit));
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); L.finish('health-' + L.variant, res);
})().catch(e => { console.error(e); L.finish('health', res.concat(['FAIL crashed: ' + e.message])); });
