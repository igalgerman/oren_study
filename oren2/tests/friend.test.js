// The friend on activity screens (#53 coaching): on a right answer a fixed sound + a line naming what he did, on a mistake it hands
// over to the help button, one sentence on what to do the first time in a new kind of task, its own voice, fixed sounds/lines per
// event, lines of its own (mission start, idle nudge) at most one per 30 s and never over the narrator; says the word a picture stands for, never covers the answers; the day's path strip in the top bar,
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
  ok('friend lines: all with nikud', lines.length >= 40 && !bad.length, bad.join(' | '));
  const FX = await p.evaluate(() => { const F = window.FRIEND; return { voice: F.VOICE, ev: Object.fromEntries(Object.entries(F.EVENTS).map(([k, e]) => [k, e.line])), kinds: F.KINDS.map(k => [k.k, k.intro, k.ok]), vl: F.voiceList() }; });
  ok('#53 at most 5 events, each with a fixed line and sound', Object.keys(FX.ev).length <= 5 && ['right', 'wrong', 'newtype', 'done', 'streak'].every(k => FX.ev[k]), JSON.stringify(FX.ev));
  ok('#53 every kind of task: one short sentence on what to do + a specific praise, nikud, in the voice list', FX.kinds.length >= 10 && FX.kinds.every(([, a, b]) => NIK.test(a) && NIK.test(b) && a.split(' ').length <= 9 && FX.vl.includes(a) && FX.vl.includes(b)), JSON.stringify(FX.kinds.filter(([, a, b]) => !(NIK.test(a) && NIK.test(b)))));
  ok('#53 the friend has its own Google Chirp3-HD Hebrew voice, not the narrator\'s', /^he-IL-Chirp3-HD-[A-Za-z]+$/.test(FX.voice) && FX.voice !== 'he-IL-Chirp3-HD-Kore', FX.voice);
  const KN = Object.fromEntries(FX.kinds.map(([k, a, b]) => [k, { intro: a, ok: b }]));
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
  ok('#53 first time in a new kind of task: the friend says what to do, then the question is read', await has(s, KN.first.intro) && s.findIndex(x => x.includes((KN.first.intro).replace(/[\u0591-\u05C7]/g, '').slice(0, 8))) >= 0 && await p.evaluate(() => !!window.OREN.save.frk.first), JSON.stringify(s));
  const sq = await p.evaluate(() => window.OREN.sayNow); const iq = await V(sq.slice(0, 30)), ii = await V(KN.first.intro);
  ok('#53 ...the friend first, the instruction after it (never at once)', s.findIndex(x => x.replace(/[\u0591-\u05C7]/g, '').includes(ii)) < s.findLastIndex(x => x.replace(/[\u0591-\u05C7]/g, '').includes(iq.slice(0, 12))), JSON.stringify({ s, sq }));
  ok('#53 it never blocks: the answers can be tapped at once', await p.evaluate(() => { const b = document.querySelector('#sTal .chs .chb'); if (!b) return false; const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && b.contains(e); }));
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
  s = await said(() => pickAns(true), 300);
  let last = await p.evaluate(() => window.FRIEND.last);
  ok('#53 right answer: the friend names what he found ("first letter")', last === KN.first.ok && await has(s, last) && await p.evaluate(() => window.FRIEND.lastEvent === 'right'), JSON.stringify({ last, s }));
  ok('friend hops', await p.evaluate(() => document.querySelector('.frc').classList.contains('joy')));
  const settle = () => p.waitForFunction(() => { const q = window.__quiz; return q && q.wrap.isConnected && ![...q.wrap.querySelectorAll('.chs .chb')].some(x => x.classList.contains('ok') || x.classList.contains('show')); }, null, { timeout: 8000 }).catch(() => {});
  await sleep(300); await settle();
  s = await said(() => pickAns(false), 300); last = await p.evaluate(() => window.FRIEND.last);
  ok('#53 wrong answer: the friend hands over to the help button (it says so, the button pulses)', last === FX.ev.wrong && await has(s, last) && await p.evaluate(() => !!document.querySelector('#sTal .helpbtn.frhand')), last);
  ok('friend looks sad', await p.evaluate(() => document.querySelector('.frc').classList.contains('sad')));
  await pickAns(true); await sleep(100); last = await p.evaluate(() => window.FRIEND.last);
  ok('fixed after a mistake: the same right-answer line', last === KN.first.ok, last);
  // streak + variety
  await sleep(300); await settle(); const got = [];
  for (let k = 0; k < 4; k++) { await pickAns(true); await sleep(80); got.push(await p.evaluate(() => window.FRIEND.last)); await sleep(300); await settle(); }
  ok('three in a row: a streak line', got[2] === 'שָׁלֹשׁ בְּרֶצֶף!', JSON.stringify(got));
  ok('#53 the same event gives the same line (so he knows it)', got[0] === KN.first.ok && got[1] === got[0] && got[3] === got[0], JSON.stringify(got));
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
  ok('"which picture": the word to read is not said', !s.some(x => x.split(/[\s.,!?]+/).includes(wpW)) && await p.evaluate(() => !window.FRIEND.word), JSON.stringify({ wpW, s }));
  await p.evaluate(() => window.OREN.showMap()); await sleep(200);
  // --- math: the friend is there and reacts ---
  await p.evaluate(() => { const O = window.OREN; const lv = O.ALLLV.find(x => x.type !== 'learn' && x.type !== 'train'); O.save.story[lv.w.id + '-in'] = 1; O.startLevel(lv); });
  await sleep(400);
  ok('math screen: the friend is there (or the math friend already is)', await p.evaluate(() => { const f = document.querySelector('.frc'); return (f && !f.hidden) || !!document.querySelector('#sPlay #pet'); }));
  const ansMath = async () => { const a = await p.evaluate(() => { const P = window.__oren4.play; if (P.choice) { P.choice.row.children[P.choice.ans].click(); return null; } return (P.boxes || []).filter(x => !x.done).map(x => String(x.ans)); });
    if (a) { for (const v of a) { await p.keyboard.type(v); } await p.keyboard.press('Enter'); } };
  s = await said(ansMath, 300); last = await p.evaluate(() => window.FRIEND.last);
  ok('math right answer: the friend says "you solved it"', [KN.math.ok, FX.ev.streak].includes(last) && await has(s, last), JSON.stringify({ last, s }));
  ok('math: friend does not cover the answer pad', !await overlap());
  // --- #53 events, voice, rate limit (on a plain activity screen) ---
  await p.evaluate(() => window.OREN.showMap()); await sleep(200);
  await p.evaluate(() => { const T = window.TAL, a = T.ACT['world-flag'] || Object.values(T.ACT).find(x => !x.avail || x.avail()); a.run(() => {}); }); await p.waitForSelector('#sTal .tqc', { timeout: 8000 }).catch(() => {}); await sleep(300);
  const ev = await p.evaluate(async () => { const F = window.FRIEND, O = window.OREN, w = ms => new Promise(r => setTimeout(r, ms)); const snd = [], lines = {};
    const sf0 = {}; Object.entries(F.EVENTS).forEach(([k, e]) => { sf0[k] = e.sfx; e.sfx = () => snd.push(k); });
    F.mount(); F.question({}, null, { id: 'none', i: 1 });   /* a kind without its own praise: the event's own line */
    const run = k => { F.reset(); if (k === 'right') F.onCorrect({}); else if (k === 'wrong') F.onWrong({}); else if (k === 'streak') { F.onCorrect({}); F.onCorrect({}); F.onCorrect({}); }
      else if (k === 'done') O.emit('tlDone', 'x', 3); else if (k === 'newtype') { delete O.save.frk.know; F.question({}, document.querySelector('#sTal .tqc'), { id: 'sci-x', i: 0 }); } };
    for (const k of ['right', 'wrong', 'streak', 'done', 'newtype']) { lines[k] = []; for (let j = 0; j < 2; j++) { snd.length = 0; run(k); await w(k === 'done' ? 120 : k === 'newtype' ? 60 : 0); lines[k].push([F.last, snd[snd.length - 1]]); } }
    Object.entries(sf0).forEach(([k, f]) => { F.EVENTS[k].sfx = f; }); return lines; });
  const evOk = Object.entries(ev).every(([k, r]) => r.every(([t, sn]) => sn === k && t === (k === 'newtype' ? KN.know.intro : FX.ev[k])));
  ok('#53 each event plays its fixed sound and its fixed line, the same every time', evOk && Object.keys(ev).length === 5, JSON.stringify(ev));
  const vu = await p.evaluate(async () => { const G = window.__gv, A0 = window.Audio, ok0 = G.ok, urls = []; window.Audio = function (x) { urls.push(x); return { play: () => Promise.resolve(), pause() {} }; };
    G.ok = true; window.__fast = false; window.FRIEND.onCorrect({}); const f = urls.slice(); urls.length = 0; window.OREN.say('שָׁלוֹם'); const n = urls.slice();
    window.__fast = true; G.ok = ok0; window.Audio = A0; G.audio = null; const v = u => new URLSearchParams(String(u).split('?')[1] || '').get('v'); return { f: f.map(v), n: n.map(v), voice: window.FRIEND.VOICE }; });
  ok('#53 the friend voice id is used for friend lines only (the narrator stays Kore)', vu.f.length && vu.f.every(x => x === vu.voice) && vu.n.length && vu.n.every(x => x === 'he-IL-Chirp3-HD-Kore'), JSON.stringify(vu));
  const rl = await p.evaluate(async () => { const F = window.FRIEND, w = ms => new Promise(r => setTimeout(r, ms)), card = document.querySelector('#sTal .tqc');
    F._ownReset(); F.question({}, card, { id: 'sci-x', i: 0 }); await w(60); const a = F.last;                 /* a known kind: one short line */
    F.question({}, card, { id: 'sci-x', i: 0 }); await w(60); const b = F.log.filter(x => x === F.START).length;  /* again at once: nothing */
    F._ownReset(); speechSynthesis.speaking = true; const n0 = F.log.length; F.question({}, card, { id: 'sci-x', i: 0 }); await w(60); const c = F.log.length - n0;   /* the narrator speaks: nothing */
    speechSynthesis.speaking = false; return { a, b, c, start: F.START }; });
  ok('#53 mission start: one short line of the friend\'s own', rl.a === rl.start, JSON.stringify(rl));
  ok('#53 never more than one own line per ~30 s, never over the narrator', rl.b === 1 && rl.c === 0, JSON.stringify(rl));
  const idle = await p.evaluate(async () => { const F = window.FRIEND, w = ms => new Promise(r => setTimeout(r, ms)); document.querySelector('#ov').hidden = true;   /* the 'done' event above may have opened a reward window */
    F._ownReset(); F.mount(); const n0 = F.log.length, hq = !!document.querySelector('#sTal .helpq:not(.done) .helpbtn');
    await w(Math.ceil(F.IDLE / 15) + 400); const said = F.log.slice(n0); const pulse = !!document.querySelector('#sTal .helpbtn.frhand');
    await w(Math.ceil(F.IDLE / 15) + 400); return { said, again: F.log.slice(n0).length, pulse, nudge: F.NUDGE, hq, tal: !document.querySelector('#sTal').hidden }; });
  ok('#53 idle 20+ s: the friend nudges to the help button (and it pulses)', idle.said[0] === idle.nudge && idle.pulse, JSON.stringify(idle));
  ok('#53 ...and not again within 30 s', idle.again === 1, JSON.stringify(idle));
  await p.evaluate(() => window.OREN.showMap()); await sleep(200);
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
