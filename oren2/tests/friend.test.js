// The friend on activity screens (#53 coaching): on a right answer a fixed sound + a line naming what he did, on a mistake it hands
// over to the help button, one sentence on what to do the first time in a new kind of task, its own voice, fixed sounds/lines per
// event, lines of its own at most one per 30 s and never over another voice; says the word a picture stands for, never covers the answers; the day's path strip in the top bar,
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
  const FX = await p.evaluate(() => { const F = window.FRIEND; return { voice: F.VOICE, ev: Object.fromEntries(Object.entries(F.EVENTS).map(([k, e]) => [k, e.line])), kinds: F.KINDS.map(k => [k.k, k.intro, k.ok]), vl: F.voiceList(), sl: F.speakList(), help: F.HELPTAP, hint: F.react.lines.hint }; });
  ok('#53 at most 5 events, each with a fixed line and sound', Object.keys(FX.ev).length <= 5 && ['right', 'wrong', 'newtype', 'done', 'streak'].every(k => FX.ev[k]), JSON.stringify(FX.ev));
  ok('#53 every kind of task: one short sentence on what to do + a specific praise, nikud, in the friend-voice list', FX.kinds.length >= 10 && FX.kinds.every(([, a, b]) => NIK.test(a) && NIK.test(b) && a.split(' ').length <= 9 && FX.vl.includes(a) && FX.vl.includes(b)), JSON.stringify(FX.kinds.filter(([, a, b]) => !(NIK.test(a) && NIK.test(b)))));
  ok('#53 the friend has its own Google Chirp3-HD Hebrew voice, not the narrator\'s', /^he-IL-Chirp3-HD-[A-Za-z]+$/.test(FX.voice) && FX.voice !== 'he-IL-Chirp3-HD-Kore', FX.voice);
  ok('#53 one wording for the help button: the wrong-answer line and the silence hint (#408)', FX.ev.wrong.endsWith(FX.help) && FX.hint.endsWith(FX.help), JSON.stringify([FX.ev.wrong, FX.hint]));
  ok('#53 the friend-voice lines are all in the full list, every one with nikud', FX.vl.length >= 40 && FX.vl.every(t => FX.sl.includes(t)) && !FX.vl.filter(t => HEB.test(t) && !NIK.test(t)).length);
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
  const ii = await V(KN.first.intro), nq = x => x.replace(/[\u0591-\u05C7]/g, '');
  ok('#53 first time in a new kind of task: the friend says what to do (once, saved)', s.some(x => nq(x).includes(ii)) && await p.evaluate(() => !!window.OREN.save.frk.first), JSON.stringify(s));
  ok('#53 ...then the question, never two sentences before it (the goal waits this time)', s.length >= 2 && nq(s[0]).includes(ii) && /באיזו אות/.test(nq(s[s.length - 1])) && !s.slice(0, -1).some(x => /באיזו אות/.test(nq(x))), JSON.stringify(s));
  ok('#53 it never blocks: the answers are on the screen at once', await p.evaluate(() => !!document.querySelector('#sTal .chs .chb')));
  ok('step start: the friend ties it to the day\'s story', s.some(x => /בוא|מתחילים|עוד צעד/.test(x.replace(/[\u0591-\u05C7]/g, ''))), JSON.stringify(s));
  const ui = await p.evaluate(() => { const f = document.querySelector('.frc'), pb = document.querySelector('#hudMid #frPath');
    const t = pb && pb.querySelector('.fpt'); return { fr: !!f && !f.hidden, hero: !!(pb && pb.querySelector('.fph svg')), mix: !!(pb && pb.querySelector('.fpm svg')), k: t ? t.dataset.k : '', label: pb && pb.getAttribute('aria-label'), pic: !!document.querySelector('#sTal .tqc .pic.frpic') }; });
  ok('friend is on the activity screen', ui.fr);
  ok('path strip in the top bar: the hero chases the Mixer, one step per finished mission (#393)', ui.hero && ui.mix && ui.k === '1' && ui.label === '1/4', JSON.stringify(ui));
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
  // streak + variety: questions 1-3 right (#394: a path round is 4 questions, so the mistake comes on question 4)
  const got = [last]; await sleep(300); await settle();
  for (let k = 0; k < 2; k++) { await pickAns(true); await sleep(80); got.push(await p.evaluate(() => window.FRIEND.last)); await sleep(300); await settle(); }
  ok('three in a row: a streak line', got[2] === 'שָׁלֹשׁ בְּרֶצֶף!', JSON.stringify(got));
  ok('#53 the same event gives the same line (so he knows it)', got[0] === KN.first.ok && got[1] === got[0], JSON.stringify(got));
  s = await said(() => pickAns(false), 300); last = await p.evaluate(() => window.FRIEND.last);
  ok('#53 wrong answer: the friend hands over to the help button (it says so, the button lights up)', last === FX.ev.wrong && await has(s, last) && await p.evaluate(() => !!document.querySelector('#sTal .helpq.offer')), last);
  ok('friend looks sad', await p.evaluate(() => document.querySelector('.frc').classList.contains('sad')));
  await pickAns(true); await sleep(100); last = await p.evaluate(() => window.FRIEND.last);
  ok('fixed after a mistake: the same right-answer line', last === KN.first.ok, last);
  await sleep(300); await settle();
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
  const flag = async () => { await p.evaluate(() => { const T = window.TAL; T.ACT['world-flag'].run(() => {}); }); await p.waitForSelector('#sTal .tqc', { timeout: 8000 }).catch(() => {}); await sleep(300); };
  await flag();
  const ev = await p.evaluate(async () => { const F = window.FRIEND, O = window.OREN, w = ms => new Promise(r => setTimeout(r, ms)); const snd = [], lines = {};
    const sf0 = {}; Object.entries(F.EVENTS).forEach(([k, e]) => { sf0[k] = e.sfx; e.sfx = () => snd.push(k); });
    F.mount(); F.question({}, null, { id: 'none', i: 1 });   /* a kind without its own praise: the event's own line */
    const run = k => { F.reset(); if (k === 'right') F.onCorrect({}); else if (k === 'wrong') F.onWrong({}); else if (k === 'streak') { F.onCorrect({}); F.onCorrect({}); F.onCorrect({}); }
      else if (k === 'done') O.emit('tlDone', 'x', 3); else if (k === 'newtype') { delete O.save.frk.know; F.question({}, document.querySelector('#sTal .tqc'), { id: 'sci-x', i: 0 }); } };
    for (const k of ['right', 'wrong', 'streak', 'done', 'newtype']) { lines[k] = []; for (let j = 0; j < 2; j++) { snd.length = 0; run(k); await w(k === 'done' ? 150 : k === 'newtype' ? 80 : 0); lines[k].push([F.last, snd[snd.length - 1]]); } }
    Object.entries(sf0).forEach(([k, f]) => { F.EVENTS[k].sfx = f; }); const ov = document.querySelector('#ov'); if (ov) ov.hidden = true; return lines; });
  const evOk = Object.entries(ev).every(([k, r]) => r.every(([t, sn]) => sn === k && t === (k === 'newtype' ? KN.know.intro : FX.ev[k])));
  ok('#53 each event plays its fixed sound and its fixed line, the same every time', evOk && Object.keys(ev).length === 5, JSON.stringify(ev));
  const vu = await p.evaluate(async () => { const G = window.__gv, O = window.OREN, A0 = window.Audio, ok0 = G.ok, urls = []; window.Audio = function (x) { urls.push(x); return { play: () => Promise.resolve(), pause() {} }; };
    const v = u => new URLSearchParams(String(u).split('?')[1] || '').get('v'); G.ok = true; window.__fast = false;
    O.hush(); window.FRIEND.onCorrect({}); await new Promise(r => setTimeout(r, 50)); const f = urls.map(v); urls.length = 0;
    O.hush(); O.say('שָׁלוֹם'); await new Promise(r => setTimeout(r, 50)); const n = urls.map(v); O.hush();
    window.__fast = true; G.ok = ok0; window.Audio = A0; G.audio = null; return { f, n, voice: window.FRIEND.VOICE }; });
  ok('#53 the friend voice id is used for friend lines only (the narrator stays Kore)', vu.f.length && vu.f.every(x => x === vu.voice) && vu.n.length && vu.n.every(x => x === 'he-IL-Chirp3-HD-Kore'), JSON.stringify(vu));
  const rl = await p.evaluate(async () => { const F = window.FRIEND, O = window.OREN, w = ms => new Promise(r => setTimeout(r, ms)), card = document.querySelector('#sTal .tqc');
    O.sayNow = ''; F._lead(''); F._own(); F.question({}, card, { id: 'sci-x', i: 0 }); await w(80); const a = F.last   /* a known kind, no story/goal line: one short line */
    F.question({}, card, { id: 'sci-x', i: 0 }); await w(80); const b = F.log.filter(x => x === F.START).length;  /* again at once: nothing */
    F._own(); window.__sq.cur = { t: 'x' }; const n0 = F.log.length; F.question({}, card, { id: 'sci-x', i: 0 }); await w(80); const c = F.log.length - n0;   /* a voice is speaking: nothing */
    window.__sq.cur = null; return { a, b, c, start: F.START }; });
  ok('#53 mission start: one short line of the friend\'s own', rl.a === rl.start, JSON.stringify(rl));
  ok('#53 never more than one own line per ~30 s, never over another voice', rl.b === 1 && rl.c === 0, JSON.stringify(rl));
  await p.evaluate(() => { const F = window.FRIEND; F.react.QUIET = 300; F._own(Date.now()); window.OREN.showMap(); }); await flag();
  await p.evaluate(() => window.OREN.emit('voice', false));   /* the voice before has ended (a stubbed voice above never reported it) */
  const qh = await p.evaluate(async () => { const F = window.FRIEND, w = ms => new Promise(r => setTimeout(r, ms)), n0 = F.log.length;
    await w(900); const early = F.log.slice(n0).filter(x => x === F.react.lines.hint).length; F._own(); await w(900);
    const late = F.log.slice(n0).filter(x => x === F.react.lines.hint).length, lit = !!document.querySelector('#sTal .helpq.offer'); F.react.QUIET = 20000; return { early, late, lit }; });
  ok('#53 the silence hint (#408) is one of the friend\'s own lines: not within 30 s of another, then once, the help button lit', qh.early === 0 && qh.late === 1 && qh.lit, JSON.stringify(qh));
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
  // --- #386 the story engine: the save keeps chapter + scene, the friend says the script's lines, a hint for tomorrow ---
  const SM = await p.evaluate(() => { const M = window.STORYMIX; return { n: M.SCRIPT.length, sc: M.SCRIPT.map(c => c.sc.length), all: M.speakList(), fr: window.FRIEND.speakList(),
    s11: M.scene({ c: 1, s: 1 }), s12: M.scene({ c: 1, s: 2 }), wrap: M.next({ c: 12, s: 5 }), ch: M.next({ c: 1, s: 5 }) }; });
  ok('#386 the script: 12 chapters x 5 scenes', SM.n === 12 && SM.sc.every(x => x === 5), JSON.stringify(SM.sc));
  ok('#386 every script line and hint has nikud and is in the voice list', SM.all.every(t => NIK.test(t) && SM.fr.includes(t)) && SM.all.length >= 120,
    SM.all.filter(t => !NIK.test(t) || !SM.fr.includes(t)).join(' | '));
  ok('#386 the story goes on: 1.5 -> 2.1, 12.5 -> 1.1', SM.ch.c === 2 && SM.ch.s === 1 && SM.wrap.c === 1 && SM.wrap.s === 1, JSON.stringify([SM.ch, SM.wrap]));
  // a fresh day at scene 1.1: open line at the start, close line on the result card, the save moves to 1.2
  const voiced = async (s, t) => has(s, t);
  await p.evaluate(() => { const O = window.OREN, T = window.TAL; delete O.save.mix; const d = T.dailyEnsure(); d.t = ['read-first', 'read-wp']; d.done = [0, 0]; d.ch = 'readg'; d.claimed = 0; d.bs = 0; O.persist(); O.showMap(); });
  s = await said(() => p.evaluate(() => window.TAL_step(0)), 900);
  ok('#386 an old save without chapter/scene starts at chapter 1, scene 1 (no crash)', await p.evaluate(() => JSON.stringify(window.STORYMIX.pos())) === '{"c":1,"s":1}');
  ok('#386 step start: the friend says the opening line of scene 1.1', await voiced(s, SM.s11.open), JSON.stringify(s));
  for (let k = 0; k < 14 && await p.evaluate(() => document.querySelector('#ov').hidden); k++) { await pickAns(true).catch(() => {}); await sleep(300); await settle(); }
  await p.waitForSelector('#ov:not([hidden]) .frstory', { timeout: 15000 }).catch(() => {});
  const cl = await p.evaluate(() => { const e = document.querySelector('#ov:not([hidden]) .frstory'); return e && e.textContent; });
  ok('#386 step done: the closing line of scene 1.1 on the result card', !!cl && cl.includes(SM.s11.close), String(cl));
  const saved = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('oren4-v1') || '{}').mix; } catch (e) { return null; } });
  ok('#386 the save moves on to chapter 1, scene 2', JSON.stringify(saved) === '{"c":1,"s":2}', JSON.stringify(saved));
  await sleep(1500); await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.OREN.showMap(); }); await sleep(200);
  // closing and reopening, and skipping a day: a new page from that save (yesterday's path, two days ago) goes on at 1.2
  const json = await p.evaluate(() => { const sv = JSON.parse(localStorage.getItem('oren4-v1')); sv.daily.d = '2000-01-01'; return JSON.stringify(sv); });
  const reopen = async (j, f) => { const c2 = await b.newContext(L.VIEWPORT); await c2.addInitScript(j => { try { localStorage.clear(); localStorage.setItem('oren4-v1', j); } catch (e) {} window.__fast = true; window.__noFamily = true;
      const fake = { log: [], speaking: false, speak(u) { this.log.push(u.text); }, cancel() {}, getVoices() { return []; }, onvoiceschanged: null, addEventListener() {} };
      Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true }); }, j);
    const p2 = await c2.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message)); await p2.goto(L.URL); await L.noCoach(p2); const r = await p2.evaluate(f); await sleep(300); await c2.close(); return { r, e2 }; };
  const nx = await reopen(json, () => { const T = window.TAL, O = window.OREN, d = T.dailyEnsure(); d.t = ['read-first', 'read-wp']; d.done = [0, 0]; d.ch = 'readg'; O.persist(); speechSynthesis.log = []; window.__fast = false;
    window.TAL_step(0); return new Promise(r => setTimeout(() => r({ pos: window.STORYMIX.pos(), fresh: d.d !== '2000-01-01', said: speechSynthesis.log.slice() }), 900)); });
  ok('#386 reopened after a skipped day: a new day, the same scene (1.2)', nx.r.fresh && nx.r.pos.c === 1 && nx.r.pos.s === 2 && !nx.e2.length, JSON.stringify(nx));
  ok('#386 ...and the friend opens with the line of scene 1.2', await voiced(nx.r.said, SM.s12.open), JSON.stringify(nx.r.said));
  // an old save (no chapter/scene, the old quest day) loads without a crash and starts at 1.1
  const old = await reopen(JSON.stringify({ gems: 5, story: { intro: 1 }, prof: { an: 'cat', col: '#3a8fc4' }, daily: { d: '2000-01-01', t: ['math'], done: [1], claimed: 1, ch: 'math' } }),
    () => { window.OREN.showMap(); return { pos: window.STORYMIX.pos(), home: !document.querySelector('#sHome').hidden }; });
  ok('#386 an old save without chapter/scene: home, chapter 1 scene 1, no page errors', old.r.home && old.r.pos.c === 1 && old.r.pos.s === 1 && !old.e2.length, JSON.stringify(old));
  // the end of the day: the finale card gives the hint for tomorrow (and says it)
  await p.evaluate(() => { const O = window.OREN, d = window.TAL.dailyEnsure(); O.save.mix = { c: 1, s: 5 }; window.STORYMIX.advance(); d.done = d.t.map(() => 1); d.claimed = 0; d.sg = 1; O.persist(); O.showMap(); }); await sleep(300);
  s = await said(() => p.evaluate(() => document.querySelector('#sHome .bigbtn.huge').click()), 700);
  const fin = await p.evaluate(() => ({ h: (document.querySelector('#ov:not([hidden]) .qwin h2') || { textContent: '' }).textContent, hint: window.STORYMIX.hint() }));
  ok('#386 end of the day: a hint for tomorrow (next chapter: we sail to the island of clocks)', fin.h.endsWith(fin.hint) && /מַפְלִיגִים אֶל אִי הַשְּׁעוֹנִים/.test(fin.h) && await voiced(s, fin.hint), JSON.stringify({ fin, s }));
  await L.shot(p, { path: L.SHOTDIR + '/story-hint-' + L.variant + '.png' });
  ok('#386 family save: the device further on in the story wins', await p.evaluate(() => { const M = window.STORYMIX; return JSON.stringify(M.merge({ c: 1, s: 2 }, { c: 2, s: 1 })) === '{"c":2,"s":1}' && JSON.stringify(M.merge({ c: 3, s: 1 }, { c: 2, s: 4 })) === '{"c":3,"s":1}' && JSON.stringify(M.merge(undefined, { c: 1, s: 3 })) === '{"c":1,"s":3}'; }));
  ok('#386 no page errors', !errs.length, errs.join(' | '));
  // --- #387 every path mission: opens with the scene's line, ends with a 2 s story picture (the ship, the new piece), one tap skips ---
  const ids = await p.evaluate(() => ['math', ...window.TAL.dailyPool()]);
  const miss = [];
  for (const id of ids) {
    const r = await p.evaluate(id => { const O = window.OREN, T = window.TAL, F = window.FRIEND, M = window.STORYMIX; O.save.mix = { c: 2, s: 3 };
      const d = T.dailyEnsure(); d.t = ['read-first', id]; d.done = [1, 0]; d.bs = 0; O.persist();
      const sc = M.scene(); F.stepStart(1); const lead = F._lead(); d.done[1] = 1;
      const ov = document.querySelector('#ov'); ov.innerHTML = '<div class="card"><h2>x</h2><div class="btnrow"><button class="bigbtn">ok</button></div></div>'; ov.hidden = false;
      F.stepCheck(); const pic = ov.querySelector('.frsp'), shp = pic && pic.querySelectorAll('.shp').length, nw = pic && pic.querySelectorAll('.shp.nw').length;
      F._lead(''); ov.hidden = true; ov.innerHTML = ''; return { open: lead.includes(sc.open), pic: !!pic, shp, nw, item: pic && pic.getAttribute('aria-label') === sc.item }; }, id);
    if (!(r.open && r.pic && r.shp === 8 && r.nw === 1 && r.item)) miss.push(id + ' ' + JSON.stringify(r));
  }
  ok('#387 every path mission (' + ids.length + '): the scene\'s opening line + a story picture with the new ship piece', ids.length >= 5 && !miss.length, miss.join(' | '));
  const pic = await p.evaluate(() => { const O = window.OREN, T = window.TAL, F = window.FRIEND, ov = document.querySelector('#ov');
    O.save.mix = { c: 1, s: 1 }; const d = T.dailyEnsure(); d.t = ['math', 'read-first']; d.done = [0, 0]; O.persist(); window.__fast = false;
    F.stepStart(0); d.done[0] = 1; ov.innerHTML = '<div class="card"><h2>x</h2><div class="btnrow"><button class="bigbtn">ok</button></div></div>'; ov.hidden = false;
    let tapped = 0; ov.querySelector('.bigbtn').onclick = () => tapped++; F.stepCheck(); const e = ov.querySelector('.frsp');
    return { on: !!e && e.isConnected, cover: !!e && getComputedStyle(e).position === 'absolute' }; });
  ok('#387 the picture is on the result card', pic.on && pic.cover, JSON.stringify(pic));
  await L.shot(p, { path: L.SHOTDIR + '/story-pic-' + L.variant + '.png' });
  await sleep(2400);
  ok('#387 the picture goes away by itself after 2 s (never blocks)', await p.evaluate(() => !document.querySelector('#ov .frsp')));
  const skip = await p.evaluate(() => { const O = window.OREN, T = window.TAL, F = window.FRIEND, ov = document.querySelector('#ov');
    O.save.mix = { c: 1, s: 2 }; const d = T.dailyEnsure(); d.t = ['math', 'read-first']; d.done = [0, 0]; O.persist();
    F.stepStart(0); d.done[0] = 1; ov.innerHTML = '<div class="card"><h2>x</h2><div class="btnrow"><button class="bigbtn">ok</button></div></div>'; ov.hidden = false;
    let tapped = 0; ov.querySelector('.bigbtn').onclick = () => tapped++; F.stepCheck(); const e = ov.querySelector('.frsp'); e.click();
    const gone = !ov.querySelector('.frsp'); window.__fast = true; ov.hidden = true; ov.innerHTML = ''; return { gone, tapped }; });
  ok('#387 one tap skips the picture (and does not press the card\'s button)', skip.gone && skip.tapped === 0, JSON.stringify(skip));
  ok('#387 no new spoken sentences outside the voice list', await p.evaluate(() => { const all = window.FRIEND.speakList(); return window.STORYMIX.SCRIPT.every(ch => ch.sc.every(x => all.includes(x[1]))); }));
  ok('#387 no page errors', !errs.length, errs.join(' | '));
  // --- #411 end of a scene, at most every third scene: 'easy or hard?' with two big faces, one tap; the answer moves the level and is stored ---
  const card = () => { const ov = document.querySelector('#ov'); ov.innerHTML = '<div class="card"><h2>x</h2><div class="btnrow"><button class="bigbtn">ok</button></div></div>'; ov.hidden = false; return ov; };
  const asks = await p.evaluate(card => { card = eval(card); const O = window.OREN, T = window.TAL, F = window.FRIEND; O.save.ez = {}; const out = [];
    for (let k = 0; k < 7; k++) { O.save.mix = { c: 1, s: 1 }; const d = T.dailyEnsure(); d.t = ['read-first', 'world-flag']; d.done = [0, 0]; d.bs = 0; O.persist();
      F.stepStart(1); d.done[1] = 1; const ov = card(); F.stepCheck(); const q = ov.querySelector('.frez');
      out.push(q ? { f: q.querySelectorAll('button.frezf').length, h: Math.min(...[...q.querySelectorAll('button.frezf')].map(x => x.getBoundingClientRect().height)) } : 0);
      ov.hidden = true; ov.innerHTML = ''; }
    F._lead(''); return out; }, card.toString());
  ok('#411 asked on every third scene only (scenes 3 and 6 of 7)', asks.map(x => x ? 1 : 0).join('') === '0010010', JSON.stringify(asks));
  ok('#411 two big faces (64 px or more)', asks[2] && asks[2].f === 2 && asks[2].h >= 64, JSON.stringify(asks[2]));
  ok('#411 the question is in the voice list, with nikud', await p.evaluate(() => { const q = window.FRIEND.EZ; return !!q && /[ְ-ׇּׁׂ]/.test(q.q) && window.FRIEND.speakList().includes(q.q) && q.q.includes('קַל') && q.q.includes('קָשֶׁה'); }));
  const tapEz = (id, l, a) => p.evaluate(([card, id, l, a]) => { card = eval(card); const O = window.OREN, T = window.TAL, F = window.FRIEND, LN = window.LEARN, sk = 'a:' + id;
    O.save.ez = { n: 2 }; LN.start(sk, 1); LN.state().k[sk].l = l; LN.state().k[sk].lk = 0; O.save.mix = { c: 1, s: 1 };
    const d = T.dailyEnsure(); d.t = ['read-first', id]; d.done = [0, 0]; d.bs = 0; O.persist(); F.stepStart(1); d.done[1] = 1; const ov = card(); F.stepCheck();
    const bs = [...ov.querySelectorAll('.frez button.frezf')]; const pic = ov.querySelector('.frsp'); if (pic) pic.click(); const bt = bs.find(x => x.dataset.a === a); bt.click(); bt.click(); bs.forEach(x => x.click());
    const lv = LN.state().k[sk].l, dis = bs.every(x => x.disabled), row = (O.save.alog[O.today()].e || []).filter(e => e[1] === id && e[6] === 'f').pop();
    ov.hidden = true; ov.innerHTML = ''; F._lead(''); return { lv, dis, row: row && row[7] && row[7].ez, rows: (O.save.alog[O.today()].e || []).filter(e => e[1] === id && e[6] === 'f').length }; }, [card.toString(), id, l, a]);
  const hard = await tapEz('world-flag', 2, 'h');
  ok('#411 "hard": the next round of that mission is one level easier, one tap only', hard.lv === 1 && hard.dis && hard.row === 'h' && hard.rows === 1, JSON.stringify(hard));
  const easy = await tapEz('sci-animals', 2, 'e');
  ok('#411 "easy": one level up', easy.lv === 3 && easy.row === 'e', JSON.stringify(easy));
  const lock = await p.evaluate(card => { card = eval(card); const O = window.OREN, T = window.TAL, F = window.FRIEND, LN = window.LEARN, sk = 'a:world-ani';
    O.save.ez = { n: 2 }; LN.start(sk, 1); LN.state().k[sk].l = 2; LN.state().k[sk].lk = 1; const d = T.dailyEnsure(); d.t = ['read-first', 'world-ani']; d.done = [0, 0]; d.bs = 0;
    F.stepStart(1); d.done[1] = 1; const ov = card(); F.stepCheck(); ov.querySelector('.frez button.frezf[data-a="h"]').click(); const l = LN.state().k[sk].l; LN.state().k[sk].lk = 0; ov.hidden = true; ov.innerHTML = ''; F._lead(''); return l; }, card.toString());
  ok('#411 a level the parent locked stays', lock === 2, String(lock));
  // math: "hard" after a level -> the next path math mission plays that level again (no new one yet)
  const mth = await p.evaluate(card => { card = eval(card); const O = window.OREN, T = window.TAL, F = window.FRIEND; O.save.ez = { n: 2 };
    const lv = T.nextLevel(); const d = T.dailyEnsure(); d.t = ['math', 'math']; d.done = [0, 0]; d.bs = 0; O.persist(); F.stepStart(0);
    O.emit('levelDone', lv, 2); d.done[0] = 1; const ov = card(); F.stepCheck(); ov.querySelector('.frez button.frezf[data-a="h"]').click(); ov.hidden = true; ov.innerHTML = '';
    const had = O.save.s[lv.id]; O.save.s[lv.id] = 2; const nx = T.nextLevel(); let went = null; const pl = O.pathLevel; O.pathLevel = id => { went = id; }; const sl = O.startLevel, sw = O.showWorld; O.startLevel = () => {}; O.showWorld = () => {};
    window.TAL_step(1); O.pathLevel = pl; O.startLevel = sl; O.showWorld = sw; const again = O.save.ez.rep; let went2 = null; O.pathLevel = id => { went2 = id; }; O.startLevel = () => {}; O.showWorld = () => {}; window.TAL_step(1); O.pathLevel = pl; O.startLevel = sl; O.showWorld = sw;
    if (had == null) delete O.save.s[lv.id]; else O.save.s[lv.id] = had; F._lead(''); O.showMap();
    return { lv: lv.id, nx: nx && nx.id, went, went2, again: again || null, row: (O.save.alog[O.today()].e || []).some(e => e[1] === 'lv:' + lv.id && e[6] === 'f' && e[7].ez === 'h') }; }, card.toString());
  ok('#411 math "hard": the next path math mission repeats that level, once', mth.nx !== mth.lv && mth.went === mth.lv && mth.went2 === mth.nx && !mth.again && mth.row, JSON.stringify(mth));
  await p.evaluate(() => window.TAL.parentPanel('day')); await sleep(300);
  const pv = await p.evaluate(() => (document.querySelector('#sPar') || document.body).innerText);
  ok('#411 the parent day view shows the answers', pv.includes('אמר: היה קשה') && pv.includes('אמר: היה קל'), pv.replace(/\s+/g, ' ').slice(0, 300));
  await p.evaluate(() => window.OREN.showMap()); await sleep(200);
  const shot = await p.evaluate(card => { card = eval(card); const O = window.OREN, T = window.TAL, F = window.FRIEND; O.save.ez = { n: 2 }; O.save.mix = { c: 1, s: 3 };
    const d = T.dailyEnsure(); d.t = ['read-first', 'world-il']; d.done = [1, 0]; d.bs = 0; O.persist(); F.stepStart(1); d.done[1] = 1; const ov = card(); F.stepCheck(); const pic = ov.querySelector('.frsp'); if (pic) pic.click(); return !!ov.querySelector('.frez'); }, card.toString());
  if (process.env.SHOTS) await sleep(900);
  await L.shot(p, { path: L.SHOTDIR + '/easy-hard-' + L.variant + '.png' });
  await p.evaluate(() => { const ov = document.querySelector('#ov'); ov.hidden = true; ov.innerHTML = ''; window.FRIEND._lead(''); });
  ok('#411 screenshot of the question on the result card', shot);
  ok('#411 no page errors', !errs.length, errs.join(' | '));
  // --- #407 the friend remembers: at the start of the day yesterday + today, at the end two things he did + a hint ---
  const SEP = '⁣', nSent = t => (t.match(/[^.!?]+[.!?]+/g) || [t]).filter(x => /[א-ת]/.test(x)).length;
  const R = await p.evaluate(() => { const M = window.STORYMIX, T = window.TAL, O = window.OREN;
    const ids = Object.keys(T.ACT), by = {}; ids.forEach(id => { const k = M.topicOf(id); if (k && !by[k]) by[k] = id; }); by.math = 'lv:x';
    const ks = Object.keys(by), outs = [];
    const keep = JSON.stringify({ alog: O.save.alog, mix: O.save.mix });
    for (const a of ks) for (const c of ks) for (let ch = 1; ch <= 12; ch++) { const e = [[600, by[a], 1, 3, 3, 0, 'c'], [620, by[c], 1, 3, 3, 0, 'c']];
      O.save.mix = { c: ch, s: ch === 1 ? 1 : 3 }; O.save.alog = { [M.dayKey(-1)]: { e }, [O.today()]: { e } }; outs.push(M.dayStart(), M.dayEnd()); }
    const k0 = JSON.parse(keep); O.save.alog = k0.alog || {}; O.save.mix = k0.mix; return { ks, outs, voice: window.FRIEND.speakList() }; });
  const parts = [...new Set(R.outs.flatMap(t => t.split(SEP).map(x => x.trim())))];
  ok('#407 the lines are built from fixed parts that are all in the voice list (pregen)', R.ks.length >= 5 && parts.every(t => R.voice.includes(t)), parts.filter(t => !R.voice.includes(t)).slice(0, 5).join(' | '));
  ok('#407 every start / end line: at most 2 sentences, kid text with nikud', R.outs.every(t => nSent(t.split(SEP).join(' ')) <= 2) && parts.every(t => NIK.test(t)),
    R.outs.filter(t => nSent(t.split(SEP).join(' ')) > 2).slice(0, 3).join(' | '));
  // the save: yesterday he did math and a reading mission (and left a riddle in the middle: not a fact)
  const mem = await p.evaluate(() => { const M = window.STORYMIX, O = window.OREN, T = window.TAL;
    O.save.alog = { [M.dayKey(-1)]: { e: [[600, 'lv:a1', 2, 3, 3, 0, 'c'], [610, 'read-first', 1, 4, 5, 0, 'c'], [620, 'read-wp', 1, 2, 2, 0, 'c'], [630, M.byTopic('think'), 0, 0, 1, 0, 'q']] } };
    O.save.mix = { c: 2, s: 3 }; return { s: M.dayStart(), math: M.DID.math[0], read: M.DID.read[1], think: M.DID.think, today: M.TODAY(2) }; });
  ok('#407 start of the day: by name, what we did yesterday (math + reading), what comes today', mem.s.startsWith('אוֹרֶן, אֶתְמוֹל ') && mem.s.includes(mem.math) && mem.s.includes(mem.read) && mem.s.endsWith(SEP + mem.today), JSON.stringify(mem));
  ok('#407 no invented facts: a mission left in the middle is not told', !mem.think.some(t => mem.s.includes(t)), mem.s);
  const empty = await p.evaluate(() => { const M = window.STORYMIX, O = window.OREN; O.save.alog = { [M.dayKey(-3)]: { e: [[600, 'read-first', 1, 4, 5, 0, 'c']] } }; return { s: M.dayStart(), z: M.dayEnd(), hint: M.hint() }; });
  ok('#407 empty history (nothing yesterday): no memory line; the day ends with the hint alone', empty.s === '' && empty.z === empty.hint, JSON.stringify(empty));
  // home at the start of the day: the memory line is said; with no history, the plain welcome
  const home = async (log) => p.evaluate(log => { const M = window.STORYMIX, O = window.OREN, T = window.TAL; O.save.alog = log ? { [M.dayKey(-1)]: { e: log } } : {};
    O.save.mix = { c: 1, s: 2 }; O.save.daily = null; const d = T.dailyEnsure(); d.t = []; d.done = []; d.ch = 0; O.persist(); window.__fast = false; speechSynthesis.log = []; O.showMap();
    return new Promise(r => setTimeout(() => { window.__fast = true; r({ bub: (document.querySelector('#sHome .hbub2') || { textContent: '' }).textContent, said: speechSynthesis.log.slice(), want: M.dayStart() }); }, 900)); }, log);
  let hm = await home([[600, 'lv:a1', 2, 3, 3, 0, 'c'], [610, 'read-first', 1, 4, 5, 0, 'c']]);
  ok('#407 home at the start of the day: the friend says the memory line', /אֶתְמוֹל/.test(hm.bub) && await voiced(hm.said, hm.want.split(SEP)[0]), JSON.stringify(hm));
  await L.shot(p, { path: L.SHOTDIR + '/memory-start-' + L.variant + '.png' });
  hm = await home(null);
  ok('#407 empty history: a plain welcome on home', !/אֶתְמוֹל/.test(hm.bub) && /אוֹרֶן/.test(hm.bub), JSON.stringify(hm));
  const later = await p.evaluate(() => { const M = window.STORYMIX, O = window.OREN, T = window.TAL; O.save.alog = { [M.dayKey(-1)]: { e: [[600, 'lv:a1', 2, 3, 3, 0, 'c']] } };
    const d = T.dailyEnsure(); d.t = ['math', 'read-first']; d.done = [1, 0]; d.ch = 'math'; O.persist(); O.showMap(); return (document.querySelector('#sHome .hbub2') || { textContent: '' }).textContent; });
  ok('#407 after the first step of the day: no memory line any more', !/אֶתְמוֹל/.test(later), later);
  // the end of the day: two things he did today + the hint for tomorrow
  await p.evaluate(() => { const M = window.STORYMIX, O = window.OREN, d = window.TAL.dailyEnsure(); O.save.alog = { [O.today()]: { e: [[600, 'lv:a1', 2, 3, 3, 0, 'c'], [610, 'read-first', 1, 4, 5, 0, 'c'], [620, 'lv:a2', 2, 3, 3, 0, 'c']] } };
    O.save.mix = { c: 1, s: 3 }; d.t = ['math', 'read-first']; d.done = [1, 1]; d.claimed = 0; d.sg = 1; O.persist(); O.showMap(); }); await sleep(300);
  s = await said(() => p.evaluate(() => document.querySelector('#sHome .bigbtn.huge').click()), 700);
  const end = await p.evaluate(() => { const M = window.STORYMIX; return { h: (document.querySelector('#ov:not([hidden]) .qwin h2') || { textContent: '' }).textContent, z: M.dayEnd(), hint: M.hint(), math: M.DID.math[0], read: M.DID.read[1] }; });
  ok('#407 end of the day: two things he did today, then the hint', end.h === end.z && end.z.startsWith('הַיּוֹם ' + end.math + ' ' + end.read) && end.z.endsWith(SEP + end.hint) && await voiced(s, end.hint), JSON.stringify({ end, s }));
  await L.shot(p, { path: L.SHOTDIR + '/memory-end-' + L.variant + '.png' });
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; });
  ok('#407 no page errors', !errs.length, errs.join(' | '));
  // --- #414 every mission has one short learning goal: the friend says it once at the start, the day log keeps it when finished ---
  const gt = await p.evaluate(() => { const G = window.GOALS, T = window.TAL, O = window.OREN; if (!G) return { none: 1 };
    const ids = [...Object.keys(T.ACT), 'math', ...O.ALLLV.map(l => 'lv:' + l.id)];
    return { miss: ids.filter(id => !G.of(id)), extra: Object.keys(G.T).filter(k => !/^w:/.test(k) && k !== 'math' && !T.ACT[k]),
      lines: G.speakList(), fl: window.FRIEND.speakList(), n: ids.length }; });
  ok('#414 every activity + math level has a goal in the one table (none missing, none left over)', !gt.none && !gt.miss.length && !gt.extra.length, JSON.stringify({ miss: gt.miss, extra: gt.extra }));
  const gbad = (gt.lines || []).filter(t => t.replace(/[^א-ת֑-ׇ ]/g, '').split(' ').some(w => w.length > 1 && !NIK.test(w)) || t.length > 70);
  ok('#414 goal lines: short, kid text with nikud on every word', gt.lines && gt.lines.length >= 100 && !gbad.length, gbad.join(' | '));
  ok('#414 every goal line is in the friend\'s pregen list', gt.lines && gt.lines.every(t => gt.fl.includes(t)));
  // free play: an activity opens -> its goal is said before the instruction, once a day
  const goalRun = async id => { let o; const s = await said(async () => { o = await p.evaluate(id => { const O = window.OREN, T = window.TAL; O.showMap(); T.ACT[id].run(O.showMap); return { line: window.GOALS.line(id) }; }, id); }, 900);
    o.bub = await p.evaluate(() => [...document.querySelectorAll('.frb, #bText')].map(e => e.textContent).join(' ')); o.s = s; return o; };
  await p.evaluate(() => { const O = window.OREN; O.save.gls = null; O.save.alog = {}; O.save.frk = Object.fromEntries(window.FRIEND.KINDS.map(k => [k.k, 1])); const d = window.TAL.dailyEnsure(); d.t = []; d.done = []; O.persist(); });   /* #53 kinds already met: the goal is the one sentence */
  let g1 = await goalRun('sci-float');
  ok('#414 quiz activity: the friend says the goal at the start (voice + bubble)', await voiced(g1.s, g1.line) && g1.bub.includes(g1.line), JSON.stringify(g1));
  const g2 = await goalRun('sci-plant');
  ok('#414 hands-on activity (no quiz): the goal is said too', await voiced(g2.s, g2.line), JSON.stringify(g2));
  g1 = await goalRun('sci-float');
  ok('#414 the same mission again today: the goal is not said again', !await voiced(g1.s, g1.line), JSON.stringify(g1.s));
  // the path: the story line first, then the goal
  await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.gls = null; O.showMap(); const d = T.dailyEnsure(); d.t = ['math', 'read-wp', 'read-pw']; d.done = [1, 0, 0]; O.persist(); });
  s = await said(() => p.evaluate(() => window.TAL_step(1)), 900);
  const gp = await p.evaluate(() => window.GOALS.line('read-wp'));
  ok('#414 path mission: the goal is said at its start, after the story line', (await voiced(s, gp) || s.some(x => x.replace(/[\u0591-\u05C7]/g, '').includes(gp.replace(/[\u0591-\u05C7]/g, '')))) && s.some(x => /^(נקח אתנו[^⁣]+⁣)?([^⁣]+ ⁣)+היום נלמד/.test(x.replace(/[\u0591-\u05C7]/g, ''))), JSON.stringify({ gp, s }));
  // finished -> the goal goes into the day log line (parent text, no nikud); left in the middle -> not learned
  const grec = await p.evaluate(() => { const O = window.OREN, T = window.TAL, G = window.GOALS; O.emit('tlDone', 'read-wp', 2);
    T.ACT['sci-mag'].run(O.showMap); O.showMap();
    const e = (O.save.alog[O.today()] || {}).e || [], row = id => e.filter(x => x[1] === id).pop();
    return { done: row('read-wp'), left: row('sci-mag'), want: G.plain('read-wp'), learned: G.learned(O.today()) }; });
  ok('#414 finished: the goal is recorded on its day log line (no nikud)', grec.done && grec.done[6] === 'c' && grec.done[7] && grec.done[7].lg === grec.want && !NIK.test(grec.want), JSON.stringify(grec));
  ok('#414 left in the middle: no goal recorded; the day\'s learned list has the finished one', grec.left && !(grec.left[7] && grec.left[7].lg) && grec.learned.includes(grec.want) && grec.learned.length === 1, JSON.stringify(grec));
  ok('#414 no page errors', !errs.length, errs.join(' | '));
  // --- friend moments (#572): a fake scene result card; 'continue' runs the card's own button unless a moment comes first ---
  const scene = (o) => p.evaluate(o => { const O = window.OREN, T = window.TAL, F = window.FRIEND, ov = document.querySelector('#ov');
    if (o.frb != null) O.save.frb = o.frb; if ('frtch' in o) O.save.frtch = o.frtch; O.save.mix = { c: 1, s: 2 };
    const d = T.dailyEnsure(); d.t = ['read-first', 'world-flag']; d.done = [0, 0]; d.bs = o.bs | 0; O.persist();
    F.stepStart(1); d.done[1] = 1; ov.innerHTML = '<div class="card"><h2>x</h2><div class="btnrow"><button class="bigbtn">ok</button></div></div>'; ov.hidden = false;
    window.__tapped = 0; ov.querySelector('.bigbtn').onclick = () => { window.__tapped++; ov.hidden = true; }; F.stepCheck(); const pic = ov.querySelector('.frsp'); if (pic) pic.click();
    ov.querySelector('.btnrow .bigbtn').click();
    const m = ov.hidden ? null : ov.querySelector('.frbrk') ? 'brk' : ov.querySelector('.frtch') ? 'tch' : null; F._lead(''); return { m, tapped: window.__tapped, frb: O.save.frb, key: d.d + ':' + (d.bs | 0) }; }, o);
  const noKnow = () => p.evaluate(() => { const K = window.KNOW.st(); Object.keys(K.k).forEach(id => { if (K.k[id].ok) K.k[id].ok = 0; }); });
  await noKnow();
  // #428 the break: every third scene, the friend picks the game, one tap yes / skip
  const brks = []; await p.evaluate(() => { window.OREN.save.frb = 0; });
  for (let k = 0; k < 6; k++) { const r = await scene({}); brks.push(r.m === 'brk' ? 1 : 0);
    if (r.m === 'brk') await p.evaluate(() => document.querySelector('#ov .frbrk .bigbtn.plain').click()); }
  ok('#428 the break is offered after every 3rd scene only (scenes 3 and 6 of 6)', brks.join('') === '001001', brks.join(''));
  const off = await scene({ frb: 2 });
  const offer = await p.evaluate(() => { const c = document.querySelector('#ov .frbrk'), G = window.TAL.arcGames;
    return { bs: c ? [...c.querySelectorAll('.btnrow .bigbtn')].map(x => x.textContent) : [], game: c && G.some(g => c.textContent.includes(g.n)), menu: c ? c.querySelectorAll('.cab').length : -1,
      voice: window.FRIEND.speakList().includes(window.FRIEND.last), nik: /[ְ-ׇּׁׂ]/.test(c ? c.textContent : '') }; });
  ok('#428 the offer: the friend names ONE game he picked (no menu), two buttons yes / skip, said and in the voice list', off.m === 'brk' && off.tapped === 0 && offer.bs.length === 2 && offer.game && offer.menu === 0 && offer.voice && offer.nik, JSON.stringify({ off, offer }));
  await L.shot(p, { path: L.SHOTDIR + '/break-offer-' + L.variant + '.png' });
  const skipB = await p.evaluate(() => { document.querySelector('#ov .frbrk .bigbtn.plain').click(); return { tapped: window.__tapped, frb: window.OREN.save.frb }; });
  ok('#428 skip: the story goes on at once (the card\'s continue)', skipB.tapped === 1 && skipB.frb === 0, JSON.stringify(skipB));
  await scene({ frb: 2 });
  const play = await p.evaluate(() => { const A = window.__arc, st = A.state(); st.lv = {}; window.TAL.arcGames.forEach(g => { st.lv[g.id] = 4; });
    document.querySelector('#ov .frbrk .bigbtn:not(.plain)').click(); const g = { id: A.brkId };
    return { inBreak: A.inBreak, tal: !document.querySelector('#sTal').hidden, game: !!document.querySelector('#sTal .arc.game'), lv: g.id ? A.tune(g.id).lv : -1, ov: document.querySelector('#ov').hidden }; });
  ok('#428 yes: one round of that game at the calm base speed (#351 level 0, even after good rounds)', play.inBreak && play.tal && play.game && play.lv === 0 && play.ov, JSON.stringify(play));
  await sleep(300);
  const back = await p.evaluate(async () => { const A = window.__arc; A.finish(3); await new Promise(r => setTimeout(r, 200)); const ov = document.querySelector('#ov');
    const bs = [...ov.querySelectorAll('.btnrow .bigbtn')]; const again = bs.length; bs[bs.length - 1].click(); await new Promise(r => setTimeout(r, 100));
    return { again, tapped: window.__tapped, inBreak: A.inBreak, lv: A.state().lv[Object.keys(A.state().lv)[0]] }; });
  ok('#428 after the round: one "continue" (no "again"), back to the story; the game\'s own level is untouched', back.again === 1 && back.tapped === 1 && !back.inBreak && back.lv === 4, JSON.stringify(back));
  await p.evaluate(() => window.OREN.showMap()); await sleep(200);
  // #410 teach the friend: once per path, only on a skill he knows, one tap of 3 corrects him
  let t0 = await scene({ frb: 0, frtch: null });
  ok('#410 nothing he knows yet: no mistake to correct', t0.m === null && t0.tapped === 1, JSON.stringify(t0));
  await p.evaluate(() => { window.KNOW.st().k['mm-ten@1'] = { r: 3, w: 0, ok: 1 }; });
  t0 = await scene({ frb: 0, frtch: null });
  const tq = await p.evaluate(() => { const c = document.querySelector('#ov .frtch'), q = window.FRIEND.teaching, bs = c ? [...c.querySelectorAll('.frto')] : [];
    return { n: bs.length, vals: bs.map(x => +x.dataset.v), q, wrongShown: c && c.querySelector('.frtq .frtw').textContent === String(q.wrong), gems: window.OREN.save.gems | 0 }; });
  ok('#410 the friend gets a known skill wrong (mm-ten), 3 choices with the right one', t0.m === 'tch' && tq.q.skill === 'mm-ten@1' && tq.n === 3 && tq.vals.includes(tq.q.right) && tq.vals.includes(tq.q.wrong) && tq.wrongShown, JSON.stringify({ t0, tq }));
  await L.shot(p, { path: L.SHOTDIR + '/teach-' + L.variant + '.png' });
  const fix = await p.evaluate(async r => { document.querySelector(`#ov .frtch .frto[data-v="${r}"]`).click(); const c = document.querySelector('#ov .frtch');
    const o = { t: c.querySelector('.frmt').textContent, ok: !!c.querySelector('.frto.ok'), dis: [...c.querySelectorAll('.frto')].every(x => x.disabled) };
    await new Promise(r => setTimeout(r, 400)); o.tapped = window.__tapped; o.gems = window.OREN.save.gems | 0; return o; }, tq.q.right);
  ok('#410 one tap corrects him: the friend says thanks, the story goes on', fix.t === await p.evaluate(() => window.FRIEND.TCH.thanks) && fix.ok && fix.dis && fix.tapped === 1 && fix.gems === tq.gems, JSON.stringify(fix));
  const again1 = await scene({ frb: 0 });
  ok('#410 at most once per path (the same path: not again)', again1.m === null && again1.tapped === 1, JSON.stringify(again1));
  await scene({ frb: 0, bs: 1 });
  const gentle = await p.evaluate(async () => { const q = window.FRIEND.teaching, c = document.querySelector('#ov .frtch'); if (!c) return { none: 1 };
    const w = [...c.querySelectorAll('.frto')].find(x => +x.dataset.v !== q.right); w.click(); const o = { t: c.querySelector('.frmt').textContent, show: !!c.querySelector(`.frto.show[data-v="${q.right}"]`) };
    await new Promise(r => setTimeout(r, 400)); o.tapped = window.__tapped; o.known = window.KNOW.known(q.skill); o.gems = window.OREN.save.gems | 0; return o; });
  ok('#410 the next path: again once; a wrong correction is gentle (the right one lights up), no penalty', !gentle.none && gentle.t === await p.evaluate(() => window.FRIEND.TCH.gentle) && gentle.show && gentle.tapped === 1 && gentle.known && gentle.gems === tq.gems, JSON.stringify(gentle));
  ok('#410 the lines: kid text with nikud, in the voice list', await p.evaluate(() => { const T = window.FRIEND.TCH, all = window.FRIEND.speakList(); return Object.values(T).every(t => /[ְ-ׇּׁׂ]/.test(t) && all.includes(t)); }));
  await noKnow();
  // #412 the friend holds the latest collected item on home and mentions it when a scene opens
  const held = await p.evaluate(() => { const O = window.OREN, S = window.SHIP; O.save.ship = { n: 0, x: [] }; O.persist(); O.showMap();
    const none = !document.querySelector('#sHome .hpair .hheld'); O.save.ship = { n: 3, x: [], d: '2000-01-01' }; O.persist(); O.showMap();
    const e = document.querySelector('#sHome .hpair .hheld'); return { none, txt: e && e.textContent, want: S.PIECES[2].n }; });
  ok('#412 home: the latest piece is shown with the friend (none on an empty ship)', held.none && held.txt && held.txt.includes(held.want), JSON.stringify(held));
  await L.shot(p, { path: L.SHOTDIR + '/held-' + L.variant + '.png' });
  s = await said(() => p.evaluate(() => document.querySelector('#sHome .hheld').click()), 300);
  ok('#412 a tap on it: the friend says what it is (#392 line)', await p.evaluate(() => document.querySelector('#sHome .hbub2').textContent) === await p.evaluate(() => window.SHIP.pieceSay(2)));
  const open1 = await p.evaluate(() => { const O = window.OREN, T = window.TAL, F = window.FRIEND, S = window.SHIP; const d = T.dailyEnsure(); d.t = ['read-first', 'world-flag']; d.done = [0, 0]; d.bs = 0; O.persist();
    F.stepStart(1); const a = F._lead(''); O.save.ship = { n: 0, x: [] }; F.stepStart(1); const z = F._lead(''); O.showMap(); return { a, z, want: S.carrySay(2), open: window.STORYMIX.scene().open }; });
  ok('#412 the scene\'s opening line mentions the last item, as its own clip before the scene line', open1.a.split('⁣')[0] === open1.want && open1.a.includes(open1.open), JSON.stringify(open1));
  ok('#412 no item yet: the opening line is the scene line alone', !open1.z.includes('קִבַּלְתָּ') && open1.z.includes(open1.open), JSON.stringify(open1));
  ok('#412 every item line: nikud, in the voice list', await p.evaluate(() => { const S = window.SHIP, all = window.FRIEND.speakList(); return S.PIECES.every((_, i) => all.includes(S.carrySay(i)) && /[ְ-ׇּׁׂ]/.test(S.carrySay(i))); }));
  // --- #423 one English word per scene, in the English program's order; it comes back on later days (en2 spaced review) ---
  const EW = await p.evaluate(() => { const O = window.OREN, M = window.STORYMIX, E = window.ENGLISH2, SEP = '⁣';
    const order = E.LEVELS[0].units.flatMap(u => u.items).map(k => k.slice(2));
    O.save.en2 = {}; O.save.mixw = {}; delete O.save.mixs; O.save.mix = { c: 1, s: 1 }; const got = [], leads = [];
    for (let k = 0; k < 7; k++) { const w1 = M.word(), w2 = M.word(); leads.push(M.lead()); got.push(w1 === w2 ? w1 : '!' + w1 + '/' + w2); M.advance(); }
    const t = E.day(), red = O.save.en2.i['v:red'].slice();
    // the English building already taught the first 12 words: the next scene gets the 13th
    O.save.en2 = { i: {} }; order.slice(0, 12).forEach(w => { O.save.en2.i['v:' + w] = [2, t + 5]; }); O.save.mix = { c: 3, s: 2 }; const skip = M.word();
    // a later day: 'red' was taught, now it is due -> it comes back in the next scene; then not again until its next review day
    O.save.en2 = { i: { 'v:red': [0, t] } }; O.save.mixw = { red: t - 1 }; O.save.mix = { c: 4, s: 1 }; const back = M.lead(), due1 = O.save.en2.i['v:red'][1];
    M.advance(); const again = M.lead();
    O.save.en2.i['v:red'] = [3, t - 2]; M.advance(); M.lead(); const due3 = O.save.en2.i['v:red'][1];
    // a word taught today does not come back the same day
    O.save.en2 = { i: { 'v:red': [0, t] } }; O.save.mixw = { red: t }; O.save.mix = { c: 5, s: 1 }; const same = M.lead();
    delete O.save.mix; delete O.save.mixw; O.save.en2 = {}; O.persist();
    return { order: order.slice(0, 7), got, leads, red, t, skip, want13: order[12], back, due1, again, due3, same, SEP,
      say0: M.wordSay('red'), back0: M.backSay('red'), all: M.speakList(), fr: window.FRIEND.speakList(), n: order.length,
      lines: order.flatMap(w => [M.wordSay(w), M.backSay(w)]), key: M.wordSay('key') }; });
  ok('#423 each scene has one word, the next one of the English program (no word out of order), the same word all scene long',
    JSON.stringify(EW.got) === JSON.stringify(EW.order), JSON.stringify(EW));
  ok('#423 a word he already learned in the English building is not taught again: the next unlearned one', EW.skip === EW.want13, EW.skip + ' / ' + EW.want13);
  ok('#423 the scene\'s opening line + the word as its own clip ("key זֶה מַפְתֵּחַ")', EW.leads[0].split(EW.SEP)[1] === EW.say0 && EW.key === 'key זֶה מַפְתֵּחַ.', JSON.stringify(EW.leads[0]));
  ok('#423 the taught word goes into the English skill model (en2), due tomorrow', EW.red[0] === 0 && EW.red[1] === EW.t + 1, JSON.stringify(EW.red));
  ok('#423 a later day: the due word comes back in the next scene ("זוֹכֵר? ...")', EW.back.split(EW.SEP).includes(EW.back0) && !EW.again.includes(EW.back0), JSON.stringify([EW.back, EW.again]));
  ok('#423 ...spaced by the skill model: box 0 -> back in 1 day, box 3 -> in 3 days', EW.due1 === EW.t + 1 && EW.due3 === EW.t + 3, JSON.stringify([EW.due1, EW.due3, EW.t]));
  ok('#423 a word taught today does not come back the same day', !EW.same.includes(EW.back0), EW.same);
  ok('#423 every word line: Hebrew with nikud, in the voice list (pregen)', EW.lines.length === 2 * EW.n && EW.lines.every(x => NIK.test(x) && EW.all.includes(x) && EW.fr.includes(x)),
    EW.lines.filter(x => !NIK.test(x) || !EW.fr.includes(x)).join(' | '));
  const st423 = await p.evaluate(() => { const O = window.OREN, T = window.TAL, F = window.FRIEND; O.save.en2 = {}; delete O.save.mixs; O.save.mix = { c: 1, s: 1 }; const d = T.dailyEnsure(); d.t = ['read-first', 'world-flag']; d.done = [0, 0]; d.bs = 0; O.persist();
    F.stepStart(1); const a = F._lead(''); O.showMap(); return { a, want: window.STORYMIX.wordSay('red') }; });
  ok('#423 the path step: the friend says the scene word after the opening line', st423.a.split('⁣').includes(st423.want), JSON.stringify(st423));
  ok('#572 no page errors', !errs.length, errs.join(' | '));
  await b.close(); L.finish('friend', res);
})().catch(e => { console.log('FAIL crashed — ' + e.message); console.log('RESULT friend 0 1'); process.exitCode = 1; });
