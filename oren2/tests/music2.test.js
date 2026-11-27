// Music 2 pack (music2.js): exact pitch, staff positions, engraving, and every activity played through.
// Usage: node tests/music2.test.js [desktop|phone]     SHOTS=<dir> saves screenshots there.
// Before integration the pack files are injected into the built page; after integration they are already in it.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const L = require('./lib.js');
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const E = require('../music2.js');
const SHOTS = process.env.SHOTS && process.env.SHOTS !== '1' ? process.env.SHOTS : null;

// ---- pure checks (node) ----
const near = (a, b) => Math.abs(a - b) < 1e-6;
ok('A4 = 440 Hz', near(E.freq(69), 440));
ok('middle C = 261.6256 Hz', Math.abs(E.freq(60) - 261.6255653) < 1e-6);
ok('equal temperament: every semitone ×2^(1/12), octave ×2', [...Array(36).keys()].every(k => near(E.freq(48 + k + 1) / E.freq(48 + k), Math.pow(2, 1 / 12))) && near(E.freq(72) / E.freq(60), 2));
ok('steps -> MIDI (C4 D4 E4 F4 G4 A4 B4 C5, C3)', JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, -7].map(E.midiOf)) === '[60,62,64,65,67,69,71,72,48]');
ok('solfège names', [0, 1, 2, 3, 4, 5, 6, 7, -4].map(E.nameOf).join(' ') === 'דּוֹ רֶה מִי פָה סוֹל לָה סִי דּוֹ פָה');
// treble: lines E4 G4 B4 D5 F5 = y 88 76 64 52 40; middle C on the first ledger line below (y 100)
ok('treble lines E G B D F', [2, 4, 6, 8, 10].map(i => E.yOf(i)).join() === '88,76,64,52,40');
ok('treble spaces F A C E', [3, 5, 7, 9].map(i => E.yOf(i)).join() === '82,70,58,46');
ok('middle C: one ledger line below', E.yOf(0) === 100 && JSON.stringify(E.ledgers(0)) === '[0]' && E.ledgers(1).length === 0 && E.ledgers(2).length === 0);
ok('A5 one ledger above, C6 two', JSON.stringify(E.ledgers(12)) === '[12]' && JSON.stringify(E.ledgers(14)) === '[12,14]');
ok('bass lines G2 B2 D3 F3 A3; middle C one ledger above', [-10, -8, -6, -4, -2].map(i => E.yOf(i, 'bass')).join() === '88,76,64,52,40' && E.yOf(0, 'bass') === 28 && JSON.stringify(E.ledgers(0, 'bass')) === '[0]');
ok('stems: up below the middle line, down on/above it', E.stemUp(5) && !E.stemUp(6) && !E.stemUp(7) && E.stemUp(0) && E.stemUp(-7, 'bass') && !E.stemUp(-6, 'bass'));
// engraving in the SVG: head y, stem side
const svg = E.staffSVG([{ i: 0, d: 'q' }, { i: 7, d: 'h' }, { i: 4, d: 'w' }]);
const heads = [...svg.matchAll(/<ellipse cx="([\d.]+)" cy="([\d.]+)"/g)].map(m => [+m[1], +m[2]]);
const stems = [...svg.matchAll(/<line x1="([\d.]+)" x2="[\d.]+" y1="([\d.]+)" y2="([\d.]+)" stroke="#23303b" stroke-width="2.3"/g)].map(m => [+m[1], +m[2], +m[3]]);
ok('SVG: heads on C4 / C5 / G4', heads[0][1] === 100 && heads[1][1] === 58 && heads[2][1] === 76, JSON.stringify(heads));
ok('SVG: C4 stem up on the right, C5 stem down on the left, whole note no stem', stems.length === 2 && stems[0][0] > heads[0][0] && stems[0][2] < stems[0][1] && stems[1][0] < heads[1][0] && stems[1][2] > stems[1][1], JSON.stringify(stems));
ok('SVG: half and whole notes are hollow', (svg.match(/class="hole"/g) || []).length === 2);
ok('melodies: every bar has 4 beats', E.parseMel && ['2q 1q 0h | 2q 1q 0h', '0q 0q 4q 4q | 5q 5q 4h | 3q 3q 2q 2q | 1q 1q 0h'].every(s => E.barBeats(E.parseMel(s)).every(b => b === 4)));
// ---- #615 play-first games: pure right/wrong logic ----
const seq = a => { let k = 0; return () => a[k++ % a.length]; };
ok('#615 high/low pair: two different sounds, "high" exactly when the 2nd is higher, the gap shrinks by level', E.hlPair && [1, 2, 3].every(lv => [0, .3, .5, .7, .99].every(r => { const q = E.hlPair(lv, seq([r, r, 1 - r])); const g = Math.abs(q.b - q.a); const [lo, hi] = E.HLGAP[lv - 1]; return q.a !== q.b && q.hi === (q.b > q.a) && g >= lo && g <= hi; })) && E.HLGAP[0][0] > E.HLGAP[2][1]);
ok('#615 high/low pair: both sounds stay in a comfortable range', E.hlPair && [...Array(200)].every(() => { const q = E.hlPair(1 + Math.floor(Math.random() * 3)); return [q.a, q.b].every(m => m >= 48 && m <= 84); }));
ok('#615 copy the rhythm: 2-4 claps, growing slowly by level', E.COPY && E.COPY.length >= 3 && E.COPY[0].every(p => p.length >= 2 && p.length <= 3) && E.COPY[E.COPY.length - 1].some(p => p.length === 4) && E.COPY.flat().every(p => p.length >= 2 && p.length <= 4 && p[0] === 0));
{ const on = [0, 600, 900, 1500], tol = 280; const sh = (a, d) => a.map(t => t + d);
  ok('#615 rhythm copy: the same taps (any start time) are right', E.copyJudge && E.copyJudge(on, sh(on, 5000), tol));
  ok('#615 rhythm copy: within the tolerance is right', E.copyJudge && E.copyJudge(on, [5000, 5700, 5850, 6620], tol));
  ok('#615 rhythm copy: a tap too late is wrong', E.copyJudge && !E.copyJudge(on, [5000, 5600, 5900, 6900], tol));
  ok('#615 rhythm copy: too few or too many taps are wrong', E.copyJudge && !E.copyJudge(on, [5000, 5600, 5900], tol) && !E.copyJudge(on, [5000, 5600, 5900, 6500, 6800], tol));
  ok('#615 rhythm copy: even taps for an uneven rhythm are wrong', E.copyJudge && !E.copyJudge([0, 300, 1200], [0, 600, 1200], tol)); }
ok('#615 color memory: right so far = more, all = ok, a wrong key = bad', E.memCheck && E.memCheck([0, 2, 1], [0]) === 'more' && E.memCheck([0, 2, 1], [0, 2]) === 'more' && E.memCheck([0, 2, 1], [0, 2, 1]) === 'ok' && E.memCheck([0, 2, 1], [0, 1]) === 'bad' && E.memCheck([0, 2, 1], [1]) === 'bad');
ok('#615 color memory: the melody grows by one each time', E.memSeqs && (() => { const s = E.memSeqs(1, seq([.1, .6, .3, .9, .2, .5, .8])); return s.length >= 3 && s.length <= 5 && s.every((x, k) => k === 0 || (x.length === s[k - 1].length + 1 && x.slice(0, -1).join() === s[k - 1].join())) && s.flat().every(k => k >= 0 && k < E.MEMKEYS.length); })());
ok('#615 every note keeps its own color (the same in every octave), 7 different colors', E.colOf && E.colOf(0) === E.colOf(7) && E.colOf(2) === E.colOf(-5) && new Set([0, 1, 2, 3, 4, 5, 6].map(E.colOf)).size === 7);
ok('#615 my song: played back in order, starting at once, pauses kept but never too long or too short', E.songPlan && (() => { const pl = E.songPlan([{ m: 60, t: 1000 }, { m: 64, t: 1400 }, { m: 67, t: 5000 }, { m: 62, t: 5010 }]); return pl.map(x => x.m).join() === '60,64,67,62' && pl[0].at === 0 && Math.abs(pl[1].at - .4) < 1e-9 && pl[2].at - pl[1].at <= .9 + 1e-9 && pl[3].at - pl[2].at >= .25 - 1e-9; })());

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; window.__noFamily = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await L.noCoach(p);
  if (!(await p.evaluate(() => !!(window.MUSIC2 && window.MUSIC2.register)))) {
    await p.addStyleTag({ content: fs.readFileSync(path.join(L.ROOT, 'music2.css'), 'utf8') });
    await p.addScriptTag({ content: fs.readFileSync(path.join(L.ROOT, 'music2.js'), 'utf8') });
  }
  await p.evaluate(() => { const O = window.OREN; O.save.story.intro = 1; O.save.snd = 2; window.MUSIC2.register(window.TAL.building); window.MUSIC2.register(window.TAL.building); });
  ok('registered once inside the music hall', await p.evaluate(() => { const m = window.TAL.BUILD.find(b => b.id === 'music'); return ['mus2-read', 'mus2-ear', 'mus2-rhythm', 'mus2-melody'].every(id => m.acts.filter(a => a.id === id).length === 1 && window.TAL.ACT[id].b === m); }));
  // record every pitch the game plays
  await p.evaluate(() => { window.__freqs = []; const O = window.OREN; const t = O.tone; O.tone = (f, ...a) => { window.__freqs.push(f); return t(f, ...a); }; O.audio(); });
  const ovOpen = () => p.evaluate(() => !document.querySelector('#ov').hidden);
  const shot = async name => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, `music-${name}-${L.variant}.png`) }); };
  const noHScroll = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  async function playThrough(key, id, solve) {
    for (let k = 0; k < 120 && !(await ovOpen()); k++) { await p.evaluate(solve); await L.sleep(90); }
    return ovOpen();
  }
  const solveAny = () => { const M = window.MUSIC2; if (M.cur && M.cur.solve) M.cur.solve(); };

  // ---- #615 play first: a fresh save sees only the no-theory games ----
  const PLAY = ['mus3-hl', 'mus3-copy', 'mus3-mem', 'mus3-song'], THEORY = ['mus2-read', 'mus2-ear', 'mus2-rhythm', 'mus2-melody', 'mus-rhythm'];
  await p.evaluate(() => window.TAL.openBuilding(window.TAL.BUILD.find(b => b.id === 'music'))); await L.sleep(200);
  const fresh = await p.evaluate(([PLAY, THEORY]) => { const T = window.TAL, m = T.BUILD.find(b => b.id === 'music'); const ids = [...document.querySelectorAll('#sTal .actc')].map(c => c.dataset.id || '');
    const txt = document.querySelector('#sTal').textContent; return { first: m.acts.slice(0, 4).map(a => a.id), open: m.acts.filter(a => !a.avail || a.avail()).map(a => a.id),
      names: PLAY.map(id => T.ACT[id] && T.ACT[id].name), shown: PLAY.every(id => txt.includes(T.ACT[id].name)), pool: T.dailyPool().filter(id => T.ACT[id].b === m), theoryShown: THEORY.some(id => T.ACT[id] && txt.includes(T.ACT[id].name)) }; }, [PLAY, THEORY]);
  ok('#615 the music hall opens with the 4 play games first', JSON.stringify(fresh.first) === JSON.stringify(PLAY) && fresh.shown, JSON.stringify(fresh));
  ok('#615 play game names: Hebrew with nikud', fresh.names.every(n => /[\u0591-\u05C7]/.test(n || '')), JSON.stringify(fresh.names));
  ok('#615 fresh save: no theory activity is open in the hall', !THEORY.some(id => fresh.open.includes(id)) && !fresh.theoryShown, JSON.stringify(fresh.open));
  ok('#615 fresh save: the daily path picks only play games for music', fresh.pool.length > 0 && fresh.pool.every(id => !THEORY.includes(id)) && PLAY.filter(id => id !== 'mus3-song').every(id => fresh.pool.includes(id)), JSON.stringify(fresh.pool));
  await shot('hall-play');
  // high or low: two sounds, bird or bear, the answer matches the pitches played
  await p.evaluate(() => { window.__freqs = []; window.TAL.ACT['mus3-hl'].run(() => {}); }); await L.sleep(250);
  const hl1 = await p.evaluate(() => { const q = window.__quiz, c = q.wrap.querySelector('.chs'); const cur = window.MUSIC2.cur; return { n: c.children.length, t: c.textContent, ans: q.ans, a: cur.q.a, b: cur.q.b, said: window.OREN.sayNow, freqs: window.__freqs.length, prog: document.querySelectorAll('#hud .progress > *').length, big: Math.min(...[...c.children].map(x => x.getBoundingClientRect().height)) }; });
  ok('#615 high/low: two big targets, bird (high) and bear (low)', hl1.n === 2 && hl1.t.includes('🐦') && hl1.t.includes('🐻') && hl1.big >= 90, JSON.stringify(hl1));
  ok('#615 high/low: the bird is right exactly when the 2nd sound is higher', (hl1.b > hl1.a) === (hl1.ans === 0), JSON.stringify(hl1));
  ok('#615 high/low: plays the two sounds by itself, one spoken instruction', hl1.freqs >= 2 && (hl1.said || '').includes('הצליל השני גבוה כמו ציפור, או נמוך כמו דוב?'), JSON.stringify(hl1));
  ok('#615 high/low: a short round (3-5 tasks)', hl1.prog >= 3 && hl1.prog <= 5, String(hl1.prog));
  await shot('play-hl');
  const playRight = () => { const q = window.__quiz; if (!q || !q.wrap.isConnected) return; const M = window.MUSIC2; if (M.cur && M.cur.solve && !M.cur.q) { M.cur.solve(); return; } const c = q.wrap.querySelector('.chs'); if (c && q.ans != null && c.children[q.ans]) c.children[q.ans].click(); };
  ok('#615 high/low round plays through', await playThrough('hl', 'mus3-hl', playRight));
  const g1 = await p.evaluate(() => ({ good: window.MUSIC2.ST().good, s: (window.TAL.S().tl['mus3-hl'] || {}).s | 0, open: window.TAL.ACT['mus2-read'].avail() }));
  ok('#615 a good play round counts; theory still locked after one', g1.good === 1 && g1.s >= 2 && !g1.open, JSON.stringify(g1));
  // a weak round (all wrong) does not count
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.TAL.ACT['mus3-hl'].run(() => {}); }); await L.sleep(200);
  await playThrough('hl', 'mus3-hl', () => { const q = window.__quiz; if (!q || !q.wrap.isConnected) return; const c = q.wrap.querySelector('.chs'); const b = c && [...c.children].find((x, k) => k !== q.ans && !x.disabled); if (b) b.click(); });
  ok('#615 a weak round (1 star) does not count toward the unlock', await p.evaluate(() => window.MUSIC2.ST().good === 1));

  // copy the rhythm: the friend claps, Oren taps the big drum back
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.TAL.ACT['mus3-copy'].run(() => {}); }); await L.sleep(150);
  const cp = await p.evaluate(() => { const d = document.querySelector('#sTal .m2drum'); const r = d.getBoundingClientRect(); return { drum: !!d, w: r.width, said: window.OREN.sayNow, n: window.MUSIC2.cur.on.length }; });
  ok('#615 copy the rhythm: a big drum, 2-3 claps at level 1, one instruction', cp.drum && cp.w >= 110 && cp.n >= 2 && cp.n <= 3 && !!cp.said, JSON.stringify(cp));
  await shot('play-copy');
  const waitTap = () => p.waitForFunction(() => window.MUSIC2.cur && window.MUSIC2.cur.phase === 'tap', null, { timeout: 5000 });
  await waitTap();
  // tapped right (relative timing, any start) -> excellent; taps sent with their own times through the drum's hook
  const cpOk = await p.evaluate(() => { const c = window.MUSIC2.cur; c.on.forEach(o => c.hit(10000 + o * c.beat)); return document.querySelector('#sTal .m2msg').textContent; });
  ok('#615 copy the rhythm: the same rhythm tapped back is "excellent"', cpOk.includes('מְעֻלֶּה'), cpOk);
  await L.sleep(250); await waitTap();
  const cpBad = await p.evaluate(() => { const c = window.MUSIC2.cur; c.on.forEach((o, k) => c.hit(10000 + o * c.beat + (k === c.on.length - 1 ? 3 * c.beat : 0))); return document.querySelector('#sTal .m2msg').textContent; });
  ok('#615 copy the rhythm: a clap far off the rhythm is "almost, again"', cpBad.includes('כִּמְעַט'), cpBad);
  ok('#615 copy the rhythm round plays through', await playThrough('cp', 'mus3-copy', () => { const c = window.MUSIC2.cur; if (c && c.solve) c.solve(); }));
  ok('#615 a 2nd good round', await p.evaluate(() => window.MUSIC2.ST().good === 2));

  // color memory: colored keys light up a growing melody, he repeats it
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.TAL.ACT['mus3-mem'].run(() => {}); }); await L.sleep(150);
  const mm = await p.evaluate(() => { const pads = [...document.querySelectorAll('#sTal .m2pad')]; return { n: pads.length, cols: pads.map(x => getComputedStyle(x).backgroundColor), h: Math.min(...pads.map(x => x.getBoundingClientRect().height)), seq: window.MUSIC2.cur.seq.slice() }; });
  ok('#615 color memory: 4 big colored keys, each its own color', mm.n === 4 && new Set(mm.cols).size === 4 && mm.h >= 80, JSON.stringify(mm));
  await shot('play-mem');
  await p.waitForFunction(() => window.MUSIC2.cur && window.MUSIC2.cur.phase === 'tap', null, { timeout: 5000 });
  const mbad = await p.evaluate(() => { const c = window.MUSIC2.cur, pads = document.querySelectorAll('#sTal .m2pad'); const wrong = (c.seq[0] + 1) % pads.length; pads[wrong].click(); return { err: c.err, phase: c.phase }; });
  ok('#615 color memory: a wrong key -> shown again', mbad.err === 1 && mbad.phase === 'show', JSON.stringify(mbad));
  ok('#615 color memory round plays through (the melody grows)', await playThrough('mem', 'mus3-mem', () => { const c = window.MUSIC2.cur; if (!c || c.phase !== 'tap') return; document.querySelectorAll('#sTal .m2pad')[c.ans()].click(); }));
  const g3 = await p.evaluate(() => ({ good: window.MUSIC2.ST().good, sub: (document.querySelector('#ov .sub') || {}).textContent || '' }));
  ok('#615 3 good play rounds -> the result says new games are open', g3.good === 3 && /חֲדָשִׁים/.test(g3.sub), JSON.stringify(g3));

  // my song: free play on big colored keys, then hear it played back
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.TAL.ACT['mus3-song'].run(() => {}); }); await L.sleep(150);
  const sg0 = await p.evaluate(() => ({ keys: document.querySelectorAll('#sTal .m2pad').length, btn: !!document.querySelector('#sTal .m2listen:not([hidden])') }));
  ok('#615 my song: big colored keys, the listen button waits for a few notes', sg0.keys >= 5 && !sg0.btn, JSON.stringify(sg0));
  await p.evaluate(() => { const ks = document.querySelectorAll('#sTal .m2pad'); [0, 2, 4, 2, 1].forEach(k => ks[k].click()); });
  await shot('play-song');
  const sg1 = await p.evaluate(async () => { window.__freqs = []; document.querySelector('#sTal .m2listen').click(); await new Promise(r => setTimeout(r, 400)); return { n: window.__freqs.length }; });
  ok('#615 my song: "listen" plays his song back', sg1.n >= 5, JSON.stringify(sg1));
  for (let k = 0; k < 40 && !(await ovOpen()); k++) await L.sleep(60);
  ok('#615 my song ends on the result card', await ovOpen());

  // ---- theory is open now: later levels, with the same colors ----
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.TAL.openBuilding(window.TAL.BUILD.find(b => b.id === 'music')); }); await L.sleep(200);
  const un = await p.evaluate(([PLAY, THEORY]) => { const T = window.TAL, m = T.BUILD.find(b => b.id === 'music'); const open = m.acts.filter(a => !a.avail || a.avail()).map(a => a.id);
    return { open, first: open.slice(0, 4), pool: T.dailyPool().filter(id => T.ACT[id].b === m) }; }, [PLAY, THEORY]);
  ok('#615 after 3 good rounds: theory opens, after the play games', ['mus2-read', 'mus2-ear', 'mus2-rhythm'].every(id => un.open.includes(id)) && JSON.stringify(un.first) === JSON.stringify(PLAY) && un.open.indexOf('mus2-read') > 3, JSON.stringify(un));
  ok('#615 after the unlock the daily path may pick theory too', un.pool.includes('mus2-read'), JSON.stringify(un.pool));
  await shot('hall-open');

  // hall shows the new activities (the parent's "all open": the hall itself opens new ones a few at a time)
  await p.evaluate(() => { window.TAL.S().set.all = 1; window.TAL.openBuilding(window.TAL.BUILD.find(b => b.id === 'music')); }); await L.sleep(200);
  ok('music hall shows reading, ear and rhythm; melody waits for reading', await p.evaluate(() => { const t = document.querySelector('#sTal').textContent; return t.includes('קְרִיאַת תָּוִים') && t.includes('שְׁמִיעָה') && t.includes('קוֹרְאִים קֶצֶב') && !t.includes('מְנַגְּנִים מֵהַתָּוִים'); }));
  ok('older note-name / length / ear quizzes leave the hall (still in ACT)', await p.evaluate(() => { const m = window.TAL.BUILD.find(b => b.id === 'music'); return ['mus-notes', 'mus-dur', 'mus-ear'].every(id => !m.acts.some(a => a.id === id) && window.TAL.ACT[id]) && m.acts.some(a => a.id === 'mus-piano') && m.acts.some(a => a.id === 'mus-rhythm'); }));
  await shot('hall');

  // ---- reading: name the note, then play it on the piano ----
  await p.evaluate(() => window.TAL.ACT['mus2-read'].run(() => {})); await L.sleep(200);
  ok('reading L1: staff + 3 solfège options', await p.evaluate(() => !!document.querySelector('#sTal .m2staff') && document.querySelectorAll('#sTal .chs .chb').length === 3));
  ok('#615 reading: the note on the staff has its own color', await p.evaluate(() => { const e = document.querySelector('#sTal .prq .m2staff .m2n ellipse'); return !!e && e.getAttribute('fill').toLowerCase() !== '#23303b'; }));
  await shot('read-name');
  // answer the name question correctly -> the note sounds at its exact pitch
  const q0 = await p.evaluate(() => { window.__freqs = []; const q = window.__quiz; q.wrap.querySelector('.chs').children[q.ans].click(); return document.querySelector('#sTal .chb.ok').textContent; });
  await L.sleep(50);
  const f0 = await p.evaluate(() => window.__freqs[0]);
  const expectF = { 'דּוֹ': 261.6255653, 'רֶה': 293.6647679, 'מִי': 329.6275569 }[q0];
  ok('the named note sounds at its exact frequency', f0 && Math.abs(f0 - expectF) < 1e-3, `${q0} ${f0}`);
  await L.sleep(250);
  ok('then: see the note -> play it on the piano (8 white + 5 black keys)', await p.evaluate(() => document.querySelectorAll('#sTal .mkb .mw').length === 8 && document.querySelectorAll('#sTal .mkb .mbk').length === 5));
  ok('#615 the piano keys keep the colors of the play games (do = the same color)', await p.evaluate(() => { const E = window.MUSIC2.ENG, k = document.querySelector('#sTal .mkb .mw[data-m="60"]'); return !!k && k.style.getPropertyValue('--nc').trim().toLowerCase() === E.colOf(0).toLowerCase() && E.MEMKEYS[0] === 0; }));
  await shot('read-piano');
  // a wrong key first: marked, counted
  await p.evaluate(() => { const q = window.__quiz; const kb = q.wrap.querySelector('.mkb'); const k = [...kb.children].findIndex((x, j) => j !== q.ans && x.classList.contains('mw')); kb.children[k].click(); });
  ok('wrong key: piano still waits for the right one', await p.evaluate(() => window.__quiz.i === 1));
  await p.evaluate(() => { window.__freqs = []; const q = window.__quiz; q.wrap.querySelector('.mkb').children[q.ans].click(); });
  const f1 = await p.evaluate(() => window.__freqs[0]);
  ok('pressing a key plays an equal-tempered pitch', [60, 62, 64, 65, 67, 69, 71, 72].some(m => Math.abs(f1 - 440 * Math.pow(2, (m - 69) / 12)) < 1e-6), String(f1));
  ok('reading lesson finishes', await playThrough('read', 'mus2-read', () => { const q = window.__quiz; if (!q || !q.wrap.isConnected) return; const c = q.wrap.querySelector('.chs'); if (c && c.children[q.ans]) c.children[q.ans].click(); }));
  ok('reading: stars recorded; all right → do-re-mi known (#57), so it moves on to the next skill (level 3)', await p.evaluate(() => (window.TAL.S().tl['mus2-read'] || {}).s >= 2 && window.MUSIC2.ST().read === 3));
  await shot('read-result');
  // every reading level, incl. bass clef: the note asked is drawn where it belongs
  for (let lv = 2; lv <= 5; lv++) {
    await p.evaluate(lv => { document.querySelector('#ov').hidden = true; window.MUSIC2.setLevel('read', lv); window.TAL.ACT['mus2-read'].run(() => {}); }, lv); await L.sleep(150);
    if (lv === 5) await shot('read-bass');
    if (lv === 4) ok('4 answers are laid out as a balanced group (2x2 on phones)', await p.evaluate(() => { const c = document.querySelector('#sTal .chs'); if (!c || c.children.length !== 4) return true; if (!c.classList.contains('g4')) return false; const tops = [...c.children].map(b => Math.round(b.getBoundingClientRect().top)); const rows = {}; tops.forEach(t => rows[t] = (rows[t] || 0) + 1); return Object.values(rows).every(n => n === 2 || n === 4); }));
    const done = await playThrough('read', 'mus2-read', () => { const q = window.__quiz; if (!q || !q.wrap.isConnected) return; const c = q.wrap.querySelector('.chs'); if (c && c.children[q.ans]) c.children[q.ans].click(); });
    ok(`reading level ${lv} plays through`, done);
  }
  ok('bass-clef level uses the lower octave (C3–C4)', await p.evaluate(() => { const r = window.MUSIC2.READ[4]; return r.clef === 'bass' && r.pool[0] === -7; }));

  // ---- ear training: all 5 levels ----
  for (let lv = 1; lv <= 5; lv++) {
    await p.evaluate(lv => { document.querySelector('#ov').hidden = true; window.MUSIC2.setLevel('ear', lv); window.__freqs = []; window.TAL.ACT['mus2-ear'].run(() => {}); }, lv); await L.sleep(250);
    if (lv === 1 || lv === 4) await shot('ear-' + lv);
    ok(`ear level ${lv}: plays two notes by itself`, await p.evaluate(() => window.__freqs.length >= 2));
    ok(`ear level ${lv} plays through`, await playThrough('ear', 'mus2-ear', () => { const q = window.__quiz; if (!q || !q.wrap.isConnected) return; const c = q.wrap.querySelector('.chs'); if (c && c.children[q.ans]) c.children[q.ans].click(); }));
  }
  // answers are right: higher/lower matches the pitches played
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.MUSIC2.setLevel('ear', 3); window.__freqs = []; window.TAL.ACT['mus2-ear'].run(() => {}); }); await L.sleep(300);
  const hl = await p.evaluate(() => { const f = window.__freqs.filter((x, i, a) => true); return { f, ans: window.__quiz.ans }; });
  // the synth plays 3 partials per note; first partial of note 1 and note 2
  const fa = hl.f[0], fb = hl.f.find((x, i) => i > 0 && Math.abs(x - fa) > 1 && Math.abs(x - fa * 2) > 1 && Math.abs(x - fa * 3) > 1);
  ok('ear: "higher" is the answer exactly when the 2nd note is higher', fb && ((fb > fa) === (hl.ans === 0)), JSON.stringify([fa, fb, hl.ans]));

  // ---- rhythm: values + tapping ----
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.MUSIC2.setLevel('rhy', 3); window.TAL.ACT['mus2-rhythm'].run(() => {}); }); await L.sleep(200);
  await shot('rhy-value');
  // play until the first tap round, then tap it for real (fast mode timings)
  for (let k = 0; k < 10; k++) { const t = await p.evaluate(() => !!document.querySelector('#sTal .m2drum')); if (t) break; await p.evaluate(() => { const q = window.__quiz; q.wrap.querySelector('.chs').children[q.ans].click(); }); await L.sleep(150); }
  await shot('rhy-tap');
  const tapped = await p.evaluate(async () => {
    document.querySelector('#sTal .bigbtn').click();
    await new Promise(r => setTimeout(r, Math.ceil(9 * 60 / 72 * 1000 / 15) + 5));
    return { msg: document.querySelector('#sTal .m2msg').textContent };
  });
  ok('rhythm: listen, count 1-2-3-4, then "now you"', tapped.msg.includes('עַכְשָׁו'), tapped.msg);
  await L.sleep(400);
  ok('rhythm: no taps -> "almost, try again"', await p.evaluate(() => document.querySelector('#sTal .m2msg').textContent.includes('נַסֵּה')));
  // simpler: use the hook to finish taps (timing logic is checked above)
  await p.evaluate(() => window.MUSIC2.solve());
  ok('rhythm lesson finishes', await playThrough('rhy', 'mus2-rhythm', solveAny));
  ok('rhythm recorded', await p.evaluate(() => (window.TAL.S().tl['mus2-rhythm'] || {}).n >= 1));
  // real tapping on the onsets is judged correct
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.MUSIC2.setLevel('rhy', 2); window.TAL.ACT['mus2-rhythm'].run(() => {}); }); await L.sleep(150);
  for (let k = 0; k < 10; k++) { const t = await p.evaluate(() => !!document.querySelector('#sTal .m2drum')); if (t) break; await p.evaluate(() => { const q = window.__quiz; q.wrap.querySelector('.chs').children[q.ans].click(); }); await L.sleep(150); }
  const judged = await p.evaluate(async () => {
    const go = document.querySelector('#sTal .bigbtn'); const dr = document.querySelector('#sTal .m2drum');
    const pat = window.MUSIC2.cur.pat, BE = { w: 4, h: 2, q: 1, e: .5 }, beat = Math.ceil(60 / 72 * 1000 / 15);
    go.click();
    await new Promise(r => setTimeout(r, 9 * beat + 3));
    let t = 0; const ons = []; pat.forEach(d => { ons.push(t); t += BE[d]; });
    ons.forEach(o => setTimeout(() => dr.click(), o * beat));
    await new Promise(r => setTimeout(r, 5 * beat));
    return { msg: document.querySelector('#sTal .m2msg').textContent, pat };
  });
  ok('rhythm: tapping on the beat is judged "excellent"', judged.msg.includes('מְעֻלֶּה'), JSON.stringify(judged));
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; });

  // ---- melodies ----
  await p.evaluate(() => window.TAL.openBuilding(window.TAL.BUILD.find(b => b.id === 'music'))); await L.sleep(150);
  ok('melody activity appears after reading', await p.evaluate(() => document.querySelector('#sTal').textContent.includes('מְנַגְּנִים מֵהַתָּוִים')));
  for (let lv = 1; lv <= 4; lv++) {
    await p.evaluate(lv => { document.querySelector('#ov').hidden = true; window.MUSIC2.setLevel('mel', lv); window.TAL.ACT['mus2-melody'].run(() => {}); }, lv); await L.sleep(150);
    if (lv === 1 || lv === 3 || lv === 4) await shot('melody-' + lv);
    if (lv === 1) {
      // wrong key twice -> the right key glows
      await p.evaluate(() => { const q = window.__quiz; const kb = q.wrap.querySelector('.mkb'); const k = [...kb.children].findIndex((x, j) => j !== q.ans && x.classList.contains('mw')); kb.children[k].click(); kb.children[k].click(); });
      ok('melody: two misses -> the right key glows', await p.evaluate(() => { const q = window.__quiz; return q.wrap.querySelector('.mkb').children[q.ans].classList.contains('show'); }));
    }
    ok(`melody level ${lv} plays through`, await playThrough('mel', 'mus2-melody', () => { const q = window.__quiz; if (!q || !q.wrap.isConnected || q.ans == null) return; q.wrap.querySelector('.mkb').children[q.ans].click(); }));
    if (lv === 3) await shot('melody-result');
  }
  ok('no horizontal scroll', await noHScroll());
  // parent info
  const sk = await p.evaluate(() => window.MUSIC2.skills());
  ok('parent skills: קריאת תווים / שמיעה / קצב with stars and level', sk.map(s => s.name).join() === 'קריאת תווים,שמיעה,קצב' && sk.every(s => s.plays > 0 && s.level >= 1), JSON.stringify(sk));
  ok('no JS errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  await b.close(); L.finish('music2', res);
})();
