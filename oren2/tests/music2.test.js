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

  // hall shows the new activities
  await p.evaluate(() => window.TAL.openBuilding(window.TAL.BUILD.find(b => b.id === 'music'))); await L.sleep(200);
  ok('music hall shows reading, ear and rhythm; melody waits for reading', await p.evaluate(() => { const t = document.querySelector('#sTal').textContent; return t.includes('קְרִיאַת תָּוִים') && t.includes('שְׁמִיעָה') && t.includes('קוֹרְאִים קֶצֶב') && !t.includes('מְנַגְּנִים מֵהַתָּוִים'); }));
  ok('older note-name / length / ear quizzes leave the hall (still in ACT)', await p.evaluate(() => { const m = window.TAL.BUILD.find(b => b.id === 'music'); return ['mus-notes', 'mus-dur', 'mus-ear'].every(id => !m.acts.some(a => a.id === id) && window.TAL.ACT[id]) && m.acts.some(a => a.id === 'mus-piano') && m.acts.some(a => a.id === 'mus-rhythm'); }));
  await shot('hall');

  // ---- reading: name the note, then play it on the piano ----
  await p.evaluate(() => window.TAL.ACT['mus2-read'].run(() => {})); await L.sleep(200);
  ok('reading L1: staff + 3 solfège options', await p.evaluate(() => !!document.querySelector('#sTal .m2staff') && document.querySelectorAll('#sTal .chs .chb').length === 3));
  await shot('read-name');
  // answer the name question correctly -> the note sounds at its exact pitch
  const q0 = await p.evaluate(() => { window.__freqs = []; const q = window.__quiz; q.wrap.querySelector('.chs').children[q.ans].click(); return document.querySelector('#sTal .chb.ok').textContent; });
  await L.sleep(50);
  const f0 = await p.evaluate(() => window.__freqs[0]);
  const expectF = { 'דּוֹ': 261.6255653, 'רֶה': 293.6647679, 'מִי': 329.6275569 }[q0];
  ok('the named note sounds at its exact frequency', f0 && Math.abs(f0 - expectF) < 1e-3, `${q0} ${f0}`);
  await L.sleep(250);
  ok('then: see the note -> play it on the piano (8 white + 5 black keys)', await p.evaluate(() => document.querySelectorAll('#sTal .mkb .mw').length === 8 && document.querySelectorAll('#sTal .mkb .mbk').length === 5));
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
