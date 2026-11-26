// The friend on activity screens: says a short warm line on every right answer (varied, streaks, effort after a fixed mistake),
// a gentle line on mistakes, says the word a picture stands for, never covers the answers; the day's path strip in the top bar,
// the story line at the start / end of each step, and the two clear choices when the whole day is done.
const L = require('./lib');
const { chromium } = require('playwright'); const sleep = L.sleep;
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const NIK = /[ְ-ׇּׁׂ]/, HEB = /[א-ת]/;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; window.__noFamily = true;
    const fake = { log: [], speaking: false, speak(u) { this.log.push(u.text); }, cancel() {}, getVoices() { return []; }, onvoiceschanged: null, addEventListener() {} };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true }); });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(L.URL); await L.noCoach(p);
  if (!await p.evaluate(() => !!window.FRIEND)) { await p.addStyleTag({ path: L.ROOT + '/friend.css' }); await p.addScriptTag({ path: L.ROOT + '/friend.js' }); }
  await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; O.showMap(); });
  await sleep(300);
  // --- the lines ---
  const lines = await p.evaluate(() => window.FRIEND.speakList());
  const bad = lines.filter(t => HEB.test(t) && !NIK.test(t));
  ok('friend lines: 25+ right-answer lines, all with nikud', lines.length >= 40 && !bad.length, bad.join(' | '));
  ok('no "you are smart" praise', !lines.some(t => /גָּאוֹן|חָכָם/.test(t)));
  // --- a day path: math done, now "first letter" ---
  await p.evaluate(() => { const T = window.TAL, d = T.dailyEnsure(); d.t = ['math', 'read-first', 'read-wp', 'eng-word']; d.done = [1, 0, 0, 0]; d.ch = 'readg'; window.OREN.persist(); });
  const said = async (f, ms = 700) => { await p.evaluate(() => { speechSynthesis.log = []; window.__fast = false; }); await f(); await sleep(ms);
    return p.evaluate(() => { window.__fast = true; return speechSynthesis.log.slice(); }); };
  const V = t => p.evaluate(t => (window.__fullSpell ? window.__fullSpell(t) : t).replace(/[\u0591-\u05C7]/g, ''), t);   // how a line sounds in the voice log
  const has = async (s, t) => { const v = await V(t); return s.some(x => x.replace(/[\u0591-\u05C7]/g, '').includes(v)); };
  let s = await said(() => p.evaluate(() => window.TAL_step(1)), 900);
  const w = await p.evaluate(() => window.FRIEND.word || '');
  ok('"first letter": the picture\'s word is said', !!w && await has(s, w), JSON.stringify({ w, s }));
  ok('step start: the friend ties it to the day\'s story', s.some(x => /בוא|מתחילים|עוד צעד/.test(x.replace(/[\u0591-\u05C7]/g, ''))), JSON.stringify(s));
  const ui = await p.evaluate(() => { const f = document.querySelector('.frc'), pb = document.querySelector('#hudMid #frPath');
    return { fr: !!f && !f.hidden, dots: pb ? pb.querySelectorAll('i').length : 0, on: pb ? pb.querySelectorAll('i.on').length : 0, cur: pb ? pb.querySelectorAll('i.cur').length : 0, pic: !!document.querySelector('#sTal .tqc .pic.frpic') }; });
  ok('friend is on the activity screen', ui.fr);
  ok('path strip in the top bar: one dot per step, done + current marked', ui.dots === 4 && ui.on === 1 && ui.cur === 1, JSON.stringify(ui));
  ok('tapping the picture says the word again', ui.pic);
  const overlap = () => p.evaluate(() => { const f = document.querySelector('.frc'); if (!f || f.hidden) return false; const a = f.getBoundingClientRect();
    return [...document.querySelectorAll('#screens .chb, #screens .tqc, #screens .bigbtn')].some(x => { const r = x.getBoundingClientRect(); return r.width && a.left < r.right && a.right > r.left && a.top < r.bottom && a.bottom > r.top; }); });
  ok('friend does not cover the question or the answers', !await overlap());
  // right answer: a spoken line; wrong: a gentle line; fixed: effort praise
  const pickAns = async right => { await p.waitForFunction(() => !(window.OREN.tapTooSoon && window.OREN.tapTooSoon()), null, { polling: 50 }); return p.evaluate(r => { const q = window.__quiz, ch = q.wrap.querySelector('.chs').children; const k = r ? q.ans : [...ch].findIndex((x, j) => j !== q.ans && !x.disabled); ch[k].click(); }, right); };   /* #436: taps in the first 400 ms of a new question are ignored */
  const OKL = await p.evaluate(() => window.FRIEND._lines);
  s = await said(() => pickAns(true), 300);
  let last = await p.evaluate(() => window.FRIEND.last);
  ok('right answer: the friend says a short line', OKL.ok.includes(last) && await has(s, last), JSON.stringify({ last, s }));
  ok('friend hops', await p.evaluate(() => document.querySelector('.frc').classList.contains('joy')));
  const settle = () => p.waitForFunction(() => { const q = window.__quiz; return q && q.wrap.isConnected && ![...q.wrap.querySelectorAll('.chs .chb')].some(x => x.classList.contains('ok') || x.classList.contains('show')); }, null, { timeout: 8000 }).catch(() => {});
  await sleep(300); await settle();
  s = await said(() => pickAns(false), 300); last = await p.evaluate(() => window.FRIEND.last);
  ok('wrong answer: a gentle line', OKL.wrong.includes(last) && await has(s, last), last);
  ok('friend looks sad', await p.evaluate(() => document.querySelector('.frc').classList.contains('sad')));
  await pickAns(true); await sleep(100); last = await p.evaluate(() => window.FRIEND.last);
  ok('fixed after a mistake: praise for trying again', OKL.effort.includes(last), last);
  // streak + variety
  await sleep(300); await settle(); const got = [];
  for (let k = 0; k < 4; k++) { await pickAns(true); await sleep(80); got.push(await p.evaluate(() => window.FRIEND.last)); await sleep(300); await settle(); }
  ok('three in a row: a streak line', got[2] === 'שָׁלֹשׁ בְּרֶצֶף!', JSON.stringify(got));
  ok('lines are not repeated back to back', new Set(got).size === got.length, JSON.stringify(got));
  // end of the step: one story line on the result card (answer the rest of the round first)
  for (let k = 0; k < 12 && await p.evaluate(() => document.querySelector('#ov').hidden); k++) { await pickAns(true).catch(() => {}); await sleep(300); await settle(); }
  await p.waitForSelector('#ov:not([hidden]) .frstory', { timeout: 15000 }).catch(() => {});
  const st = await p.evaluate(() => { const e = document.querySelector('#ov:not([hidden]) .frstory'); return e && e.textContent; });
  ok('step done: a story line on the result card', !!st && NIK.test(st), String(st));
  // leaving: no friend on home, no strip
  await p.evaluate(() => window.OREN.showMap()); await sleep(200);
  ok('home: no corner friend, no strip', await p.evaluate(() => { const f = document.querySelector('.frc'); return (!f || f.hidden) && !document.querySelector('#frPath'); }));
  // a reading question (try to read first): only the word is said, not the question
  s = await said(() => p.evaluate(() => window.TAL_step(2)), 900);
  const wpW = await p.evaluate(() => { const e = document.querySelector('#sTal .tqc .bigw'); return e ? window.TAL.plainHe(e.textContent).trim() : '§'; });
  ok('"which picture": the word to read is not said', !s.some(x => x.includes(wpW)) && await p.evaluate(() => !window.FRIEND.word), JSON.stringify({ wpW, s }));
  await p.evaluate(() => window.OREN.showMap()); await sleep(200);
  // --- math: the friend is there and reacts ---
  await p.evaluate(() => { const O = window.OREN; const lv = O.ALLLV.find(x => x.type !== 'learn' && x.type !== 'train'); O.save.story[lv.w.id + '-in'] = 1; O.startLevel(lv); });
  await sleep(400);
  ok('math screen: the friend is there (or the math friend already is)', await p.evaluate(() => { const f = document.querySelector('.frc'); return (f && !f.hidden) || !!document.querySelector('#sPlay #pet'); }));
  const ansMath = async () => { const a = await p.evaluate(() => { const P = window.__oren4.play; if (P.choice) { P.choice.row.children[P.choice.ans].click(); return null; } return (P.boxes || []).filter(x => !x.done).map(x => String(x.ans)); });
    if (a) { for (const v of a) { await p.keyboard.type(v); } await p.keyboard.press('Enter'); } };
  s = await said(ansMath, 300); last = await p.evaluate(() => window.FRIEND.last);
  ok('math right answer: the friend says a line', OKL.ok.concat(OKL.streak).includes(last) && await has(s, last), JSON.stringify({ last, s }));
  ok('math: friend does not cover the answer pad', !await overlap());
  // --- the whole day done: one sentence, exactly two choices ---
  await p.evaluate(() => { const O = window.OREN, d = window.TAL.dailyEnsure(); d.done = d.t.map(() => 1); d.claimed = 1; O.persist(); O.showMap(); }); await sleep(300);
  const hd = await p.evaluate(() => ({ say: document.querySelector('#sHome .hbub2').textContent, ch: document.querySelectorAll('#sHome .frdone .bigbtn').length, badge: !!document.querySelector('#sHome .frbadge'), more: !!document.querySelector('#sHome .dmore'), doors: !!document.querySelector('#sHome .doors2') }));
  ok('day done: "you finished all of today\'s missions", a done badge, two choices only', /סִיַּמְתָּ אֶת כָּל הַמְּשִׂימוֹת/.test(hd.say) && hd.ch === 2 && hd.badge && !hd.more && !hd.doors, JSON.stringify(hd));
  await p.evaluate(() => window.OREN.showMap()); await sleep(300);
  const again = await p.evaluate(() => ({ say: (document.querySelector('#sHome .hbub2') || { textContent: '' }).textContent, ch: document.querySelectorAll('#sHome .frdone .bigbtn').length }));
  ok('back home, day still done: the sentence is not said again, the two choices stay', !/סִיַּמְתָּ/.test(again.say) && again.ch === 2, JSON.stringify(again));
  await p.click('#sHome .frdone .bigbtn.blue'); await sleep(300);
  ok('free time: the doors', await p.evaluate(() => !!document.querySelector('#sHome .doors2') && !document.querySelector('#sHome .frdone')));
  await p.evaluate(() => window.OREN.showMap()); await sleep(200);
  ok('free time: the friend reminds once that tapping it brings another path', /גַּע בִּי/.test(await p.evaluate(() => document.querySelector('#sHome .hbub2').textContent)));
  await p.evaluate(() => window.OREN.showMap()); await sleep(200);
  ok('...only once', !/גַּע בִּי/.test(await p.evaluate(() => document.querySelector('#sHome .hbub2').textContent)));
  await p.click('#sHome .hpair'); await sleep(300);
  const bn = await p.evaluate(() => ({ cards: document.querySelectorAll('#sHome .dchoice .dcard').length }));
  ok('tapping the friend in free time: the choice cards for another path', bn.cards >= 2, JSON.stringify(bn));
  await p.click('#sHome .dchoice .dcard:not(.cont)'); await sleep(300);
  const bp = await p.evaluate(() => { const d = window.TAL.dailyEnsure(); return { n: d.t.length - (d.bs | 0), circles: document.querySelectorAll('#sHome .tpath .tstep2').length, go: !!document.querySelector('#sHome .bigbtn.huge') }; });
  ok('another path: 2-3 new steps, only they are on the path', bp.n >= 2 && bp.n <= 3 && bp.circles === bp.n && bp.go, JSON.stringify(bp));
  await L.shot(p, { path: L.SHOTDIR + '/friend-' + L.variant + '.png' });
  // --- #433: an error in the middle of a mission: the friend says "oops, back to our path", home, progress kept, error logged ---
  const OOPS = 'אוֹי, חוֹזְרִים לַמַּסָּע';
  await p.evaluate(() => { const T = window.TAL, a = T.ACT['read-first'] || Object.values(T.ACT).find(x => !x.avail || x.avail()); a.run(() => {}); }); await sleep(400);
  const inAct = await p.evaluate(() => !document.querySelector('#sTal').hidden || !document.querySelector('#sPlay').hidden);
  const g0 = await p.evaluate(() => { const O = window.OREN; O.save.gems = (O.save.gems | 0) + 7; return O.save.gems; });   // not saved yet
  s = await said(async () => { await p.addScriptTag({ content: 'setTimeout(function boom433(){throw new Error("test433 boom")},0)\n//# sourceURL=boom433.js' }); }, 600);
  const rec = await p.evaluate(() => { const O = window.OREN; let st = {}; try { st = JSON.parse(localStorage.getItem('oren4-v1') || '{}'); } catch (e) {}
    const e = (O.save.iss || []).find(x => x.k === 'err' && /test433/.test(x.m || ''));
    return { home: !document.querySelector('#sHome').hidden, tal: !document.querySelector('#sTal').hidden, play: !document.querySelector('#sPlay').hidden,
      gems: O.save.gems, stored: st.gems, last: window.FRIEND.last, m: e && e.m }; });
  ok('#433 error in a mission: home appears', inAct && rec.home && !rec.tal && !rec.play, JSON.stringify({ inAct, rec }));
  ok('#433 progress was saved first', rec.gems === g0 && rec.stored === g0, JSON.stringify({ g0, rec }));
  ok('#433 the friend says "oops, back to our path" (nikud, in the voice list)', rec.last === OOPS && await has(s, OOPS) && (await p.evaluate(() => window.FRIEND.speakList())).includes(OOPS), JSON.stringify({ last: rec.last, s }));
  ok('#433 the error is logged with file and line', /test433 boom @ boom433 boom433\.js:\d+:\d+/.test(rec.m || ''), rec.m);
  const home2 = await p.evaluate(() => { window.OREN.showMap(); return 1; }); await sleep(100);
  await p.addScriptTag({ content: 'setTimeout(function boom433b(){throw new Error("test433 home")},0)' }); await sleep(300);
  ok('#433 an error on the home screen does not loop (home stays)', home2 && await p.evaluate(() => !document.querySelector('#sHome').hidden));
  errs.splice(0, errs.length, ...errs.filter(m => !/test433/.test(m)));
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); L.finish('friend', res);
})().catch(e => { console.log('FAIL crashed — ' + e.message); console.log('RESULT friend 0 1'); process.exitCode = 1; });
