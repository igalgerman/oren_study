// ENGLISH2: content correctness (nikud, spelling rules, phonics keywords, one correct answer, distinct options),
// mastery / spaced review / unlocking, the speak list, and the screens in a real browser (desktop or phone).
// Usage: node tests/english2.test.js [desktop|phone]     SHOTS=1 (or E2SHOTS=<dir>) saves screenshots.
const path = require('path'), fs = require('fs');
const L = require('./lib');
const ROOT = L.ROOT;
const out = []; const ok = (c, m, extra) => out.push((c ? 'PASS ' : 'FAIL ') + m + (c || extra == null ? '' : '  ' + extra));

/* ======================= Part 1: pure (Node) ======================= */
global.window = {};
require(path.join(ROOT, 'english2.js'));
const E = window.ENGLISH2;
delete global.window;
let seed = 7; E.setRng(() => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; });

const NIK = /[\u05B0-\u05BC\u05C1\u05C2\u05C7]/;
const HEB = /[\u05D0-\u05EA]/;
/* every Hebrew word of 2+ letters carries nikud (kid text) */
const allNikud = s => String(s).replace(/<[^>]+>/g, ' ').split(/[\s\-–־.,!?:;"'()]+/).filter(w => (w.match(/[\u05D0-\u05EA]/g) || []).length >= 2).every(w => NIK.test(w));
const kid = [];
E.THEMES.forEach(t => { kid.push(['theme ' + t.id, t.he]); t.w.forEach(w => kid.push(['word ' + w[0], w[1]])); });
Object.entries(E.EXTRA).forEach(([k, v]) => kid.push(['extra ' + k, v[0]]));
E.SIGHT.forEach(s => kid.push(['sight ' + s[0], s[2]]));
E.SENT.forEach(s => kid.push(['sentence ' + s[0], s[1]]));
E.PHRASES.forEach(p => { kid.push(['phrase ' + p[0], p[1]]); kid.push(['situation ' + p[0], p[3]]); });
E.SONGS.forEach(s => kid.push(['song ' + s.th, s.he]));
E.LEVELS.forEach(Lv => Lv.units.forEach(u => { if (HEB.test(u.he)) kid.push(['unit ' + u.id, u.he]); }));
const badNik = kid.filter(([n, s]) => !HEB.test(s) || !allNikud(s));
ok(!badNik.length, `kid Hebrew has nikud on every word (${kid.length} strings)`, JSON.stringify(badNik.slice(0, 5)));
/* parent text: no nikud */
const par = [...Object.values(E.SKILLS), ...E.LEVELS.flatMap(Lv => Lv.units.map(u => u.p))];
ok(par.every(s => !NIK.test(s)), 'parent text without nikud', JSON.stringify(par.filter(s => NIK.test(s))));
ok(['אנגלית: אוצר מילים', 'אנגלית: אותיות וצלילים', 'אנגלית: קריאה ראשונה', 'אנגלית: דיבור'].every(n => Object.values(E.SKILLS).includes(n)), 'the four skill names for parents');

/* English words: spelling form, uniqueness, pictures */
const tw = E.THEMES.flatMap(t => t.w);
ok(tw.length >= 140 && tw.length <= 160, `about 150 theme words (${tw.length})`);
ok(new Set(tw.map(w => w[0])).size === tw.length, 'no word twice in the themes');
ok(tw.every(w => /^[a-z]+( [a-z]+)?$|^TV$/.test(w[0])), 'theme words are plain lowercase English', tw.filter(w => !/^[a-z]+( [a-z]+)?$|^TV$/.test(w[0])).map(w => w[0]).join(','));
const pics = Object.values(E.WORD).map(w => w.pic);
const dupPic = pics.filter((p, i) => pics.indexOf(p) !== i);
ok(!dupPic.length, `every word has its own picture (${pics.length})`, dupPic.join(' '));
ok(Object.values(E.WORD).every(w => w.pic && w.he), 'every word has a picture and a Hebrew meaning');
const HE_SAME = Object.values(E.WORD).filter((w, i, a) => a.findIndex(x => x.he === w.he) !== i).map(w => w.en);
ok(HE_SAME.every(w => ['bug'].includes(w)), 'Hebrew meanings distinct (bug/insect share חרק on purpose, never in one question)', HE_SAME.join(','));
/* numbers spelled right */
const NUMS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
ok(NUMS.every((n, i) => E.WORD[n] && E.WORD[n].pic === 'n:' + (i + 1)), 'numbers 1-20: spelling matches the number');

/* letters and phonics keywords */
ok(E.AZ.join('') === 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '26 letters A-Z');
const grp = E.LGROUPS.flat();
ok(grp.length === 26 && new Set(grp).size === 26, 'letter groups cover every letter once');
const DIGRAPH = /^(ch|sh|th|wh|ph|kn|wr|gh)/;
const kwBad = [];
E.LETTERS.forEach(([Lt, he, kw]) => kw.forEach(w => {
  const lw = w.toLowerCase(), l = Lt.toLowerCase();
  if (!E.WORD[w]) kwBad.push(w + ':no word');
  if (Lt === 'X') { if (!lw.endsWith('x')) kwBad.push(w + ':x not at end'); return; }
  if (lw[0] !== l) kwBad.push(w + ':starts ' + lw[0]);
  if (DIGRAPH.test(lw)) kwBad.push(w + ':digraph');
  if ((l === 'c' || l === 'g') && /^[cg][eiy]/.test(lw) && !['girl'].includes(lw)) kwBad.push(w + ':soft ' + l);
  if (l === 'q' && !lw.startsWith('qu')) kwBad.push(w + ':q without u');
}));
/* vowel keywords: short vowel sound at the start (hand-checked list) */
const SHORT = { A: ['apple', 'ant'], E: ['egg', 'elephant'], I: ['igloo', 'insect'], O: ['octopus', 'olive'], U: ['umbrella', 'up'] };
Object.entries(SHORT).forEach(([v, ws]) => { if (JSON.stringify(E.LET[v].kw) !== JSON.stringify(ws)) kwBad.push(v + ' vowel keywords changed: recheck short sound'); });
ok(!kwBad.length, 'letter keywords start with the letter sound (X ends), no digraph / soft c-g / long vowels', kwBad.join(' '));
ok(E.LETTERS.every(([Lt, he]) => !he || /^[\u05D0-\u05EA][\u05B0-\u05BC\u05C1\u05C2\u05F3]*[\u05D0-\u05EA]?[\u05B0-\u05BC\u05F3]*$/.test(he)), 'Hebrew sound letters are Hebrew');
ok(['A', 'E', 'I', 'O', 'U', 'W'].every(v => !E.LET[v].he) && E.LET.B.he === 'בּ' && E.LET.P.he === 'פּ' && E.LET.F.he === 'פ' && E.LET.V.he === 'ו', 'vowels and W get no Hebrew letter; B=בּ P=פּ F=פ V=ו');

/* reading */
const VOW = 'aeiou';
const cvcBad = E.CVC.flatMap(([v, ws]) => ws.filter(w => !(w.length === 3 && !VOW.includes(w[0]) && w[1] === v && !VOW.includes(w[2]) && E.WORD[w])));
ok(!cvcBad.length, `CVC words are consonant-vowel-consonant with the unit's vowel (${E.CVCW.length})`, cvcBad.join(','));
const SW = E.SIGHT.map(s => s[0]);
ok(JSON.stringify(SW) === JSON.stringify(['I', 'a', 'the', 'is', 'my', 'see', 'like', 'can']), 'sight words I a the is my see like can');
const sentBad = [];
E.SENT.forEach(([s, he, a, ds]) => {
  if (!/^[A-Z][a-z ]*[a-z]\.$/.test(s.replace(/^I /, 'I '))) sentBad.push(s + ':form');
  s.replace(/\.$/, '').split(' ').forEach(w => { const lw = w === 'I' ? 'I' : w.toLowerCase(); if (!SW.includes(lw) && !E.CVCW.includes(lw) && !/^[^aeiou][aeiou][^aeiou]$/.test(lw)) sentBad.push(s + ':' + w); });
  if (!s.toLowerCase().includes(a)) sentBad.push(s + ':answer word missing');
  [a, ...ds].forEach(x => { if (!E.WORD[x]) sentBad.push(x + ':no picture'); });
  ds.forEach(x => { if (s.toLowerCase().split(/\W/).includes(x)) sentBad.push(s + ':distractor in sentence ' + x); });
  if (!HEB.test(he)) sentBad.push(s + ':no hebrew');
});
ok(!sentBad.length, `sentences use only sight words + CVC words, one picture fits (${E.SENT.length})`, sentBad.join(' | '));
ok(SW.every(w => E.SENT.some(s => s[0].split(/[ .]/).map(x => x === 'I' ? x : x.toLowerCase()).includes(w))), 'every sight word appears in a sentence');

/* phrases */
const PHe = E.PHRASES.map(p => p[1]), PEm = E.PHRASES.map(p => p[2]);
ok(new Set(PHe).size === PHe.length && new Set(PEm).size === PEm.length, 'phrases: distinct meanings and emoji');
ok(E.PUNITS.flatMap(u => u.w).sort().join('|') === E.PHRASES.map(p => p[0]).sort().join('|'), 'phrase units cover every phrase once');
ok(E.PHRASES.every(p => /^[A-Z][A-Za-z ,']*[.!?]$/.test(p[0])), 'phrases: English sentence form');
ok(E.PHRASES.some(p => p[0] === 'My name is Oren.') && E.PHRASES.some(p => p[0] === 'How are you?') && E.PHRASES.some(p => p[0] === 'Good night!') && E.PHRASES.some(p => p[0] === 'Thank you!'), 'phrases include the asked ones');

/* songs */
ok(E.THEMES.every(t => E.SONG[t.id]) && E.SONGS.length === E.THEMES.length, 'one song per theme');
ok(E.SONGS.every(s => s.l.length === 4 && s.l.every(l => /^[A-Z][A-Za-z ,!.'-]+$/.test(l))), 'songs: 4 lines of plain English each');

/* generators: one correct answer, distinct options, no clashes, phonics rules */
function freshSave() { return { set: {} }; }
function seenAll(save, lv, b) { const d = E.day(); E.LEVELS[lv].units.forEach(u => u.items.forEach(k => { E.st(save).i[k] = [b, d]; })); }
const genBad = []; let nGen = 0; const types = {};
for (const b of [0, 1, 2, 3]) for (let lv = 0; lv < 4; lv++) {
  const save = freshSave(); seenAll(save, lv, b);
  for (const u of E.LEVELS[lv].units) for (const k of u.items) for (const pass of [0, 1]) for (let r = 0; r < 6; r++) {
    let q; try { q = E.gen(save, { k, pass }); } catch (e) { genBad.push(k + ':' + e.message); continue; }
    nGen++; types[q.type] = (types[q.type] || 0) + 1;
    const keys = q.opts.map(E.okey);
    if (new Set(keys).size !== keys.length) genBad.push(k + ':dup');
    if (!(q.ans >= 0 && q.ans < q.opts.length)) genBad.push(k + ':ans');
    if (q.opts.length < 3 || q.opts.length > 4) genBad.push(k + ':n=' + q.opts.length);
    const a = q.opts[q.ans];
    const want = { hear: () => a.w === q.w, say: () => a.v === q.w, name: () => a.v.toUpperCase() === q.L, case: () => a.v === (q.up ? q.L.toLowerCase() : q.L), sound: () => a.v === q.L,
      read: () => a.w === q.w, spell: () => a.v === q.w, sight: () => a.v === q.w, sent: () => a.w === q.w, mean: () => a.v === E.PH[q.p].he, sit: () => a.v === q.p }[q.type];
    if (!want || !want()) genBad.push(k + ':wrong answer ' + q.type);
    const ws = q.opts.map(o => o.w || o.v);
    if (q.opts[0].t === 'pic') { const ps = ws.map(w => E.WORD[w].pic); if (new Set(ps).size !== ps.length) genBad.push(k + ':same picture'); }
    if (['hear', 'say', 'read', 'spell'].includes(q.type)) for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) if (E.clash(ws[i], ws[j])) genBad.push(k + ':clash ' + ws[i] + '/' + ws[j]);
    if (q.type === 'hear' || q.type === 'say') { const th = E.WORD[q.w].th; const plain = ['colors', 'num1', 'num2'];
      if (ws.some(w => (plain.includes(th) || plain.includes(E.WORD[w].th)) && E.WORD[w].th !== th)) genBad.push(k + ':colours/numbers mixed with other themes'); }
    if (q.type === 'sound') { const inW = q.w.toUpperCase().split(''); q.opts.forEach((o, i) => { if (i !== q.ans && (inW.includes(o.v) || (E.SOUNDMATE[q.L] || []).includes(o.v))) genBad.push(k + ':ambiguous letter ' + o.v + ' for ' + q.w); }); }
    if (q.type === 'case') { const lowWanted = q.up; if (!q.opts.every(o => lowWanted ? o.v === o.v.toLowerCase() : o.v === o.v.toUpperCase())) genBad.push(k + ':mixed case'); }
    if (q.type === 'name' && !q.opts.every(o => q.low ? o.v === o.v.toLowerCase() : o.v === o.v.toUpperCase())) genBad.push(k + ':name mixed case');
    if (q.type === 'mean' || q.type === 'sit') { for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) { const pa = E.PHRASES.find(p => p[0] === ws[i] || p[1] === ws[i])[0], pb = E.PHRASES.find(p => p[0] === ws[j] || p[1] === ws[j])[0]; if (E.PCLASH.some(([x, y]) => (x === pa && y === pb) || (x === pb && y === pa))) genBad.push(k + ':phrase clash'); } }
  }
}
ok(!genBad.length, `${nGen} generated questions: one correct answer, distinct options, no clashes, unambiguous letters`, [...new Set(genBad)].slice(0, 8).join(' | '));
ok(['hear', 'say', 'name', 'case', 'sound', 'read', 'spell', 'sight', 'sent', 'mean', 'sit'].every(t => types[t] > 0), 'all 11 question types appear', JSON.stringify(types));

/* everything spoken is in the speak list */
const SL = new Set(E.speakList());
const spoken = new Set();
E.LEVELS.slice(0, 4).forEach(Lv => Lv.units.forEach(u => [...new Set(u.items.map(E.groupOf))].forEach(g => { if (!/^x:/.test(g)) spoken.add(E.teachCard(g).say); })));
for (const b of [0, 2]) for (let lv = 0; lv < 4; lv++) { const save = freshSave(); seenAll(save, lv, b); E.LEVELS[lv].units.forEach(u => u.items.forEach(k => { for (let r = 0; r < 8; r++) { const q = E.gen(save, { k, pass: r % 2 });
  ({ hear: () => spoken.add(q.w), say: () => q.opts.forEach(o => spoken.add(o.v)), name: () => spoken.add(q.L), case: () => spoken.add(q.L), sound: () => { spoken.add(q.w); spoken.add(E.sayIsFor(q.L, q.w)); },
    read: () => spoken.add(q.w), spell: () => { spoken.add(q.w); q.opts.forEach(o => spoken.add(o.v)); }, sight: () => q.opts.forEach(o => spoken.add(o.v)), sent: () => spoken.add(q.s), mean: () => spoken.add(q.p), sit: () => { q.opts.forEach(o => spoken.add(o.v)); spoken.add(q.p); } })[q.type](); } })); }
E.SONGS.forEach(s => s.l.forEach(l => spoken.add(l)));
const missing = [...spoken].filter(s => !SL.has(s));
ok(!missing.length && SL.size > 300, `speakList() has every English string the game says (${SL.size})`, missing.slice(0, 8).join(' | '));
ok([...SL].every(s => !HEB.test(s)), 'speakList is English only');

/* rounds, mastery, unlocking, spaced review */
{
  const save = freshSave(); let d = E.day();
  /* #58: letters and sounds are the first English path; words open after the first letter group */
  ok(E.levelOpen(save, 1) && !E.levelOpen(save, 0) && !E.levelOpen(save, 2) && !E.levelOpen(save, 3) && !E.levelOpen(save, 4), 'start: only letters and sounds open (first path)');
  const play = (lv, rounds, wrongEvery) => { let n = 0; for (let r = 0; r < rounds; r++) { const P = E.plan(save, lv, d); P.teach.forEach(g => E.touch(save, E.teachCard(g).items, d));
      const b0 = {}; P.qs.forEach(q => { if (!(q.k in b0)) b0[q.k] = E.box(save, q.k); }); const res = {};
      P.qs.forEach(q => { n++; const r1 = wrongEvery && n % wrongEvery === 0 ? 'bad' : 'ok'; res[q.k] = res[q.k] === 'bad' || r1 === 'bad' ? 'bad' : 'ok'; E.mark(save, q.k, res[q.k], b0[q.k], d); });
      if (r % 2) d++; } };
  const pl = E.plan(save, 1, d);
  ok(pl.teach.length === 2 && pl.teach.every(g => /^L:[SATPIN]$/.test(g)) && pl.qs.length >= 6 && pl.qs.every(q => /^[ncs]:[SATPIN]$/.test(q.k)), 'first letter round: 2 letters of s a t p i n, their name/case/sound', JSON.stringify(pl));
  const lcB = E.teachCard('L:B');
  ok(lcB.w === 'ball' && lcB.say === 'B is for ball.' && lcB.he === 'בּ' && lcB.mean === 'כַּדּוּר', 'letter card: the voice reads the word, its Hebrew meaning is shown', JSON.stringify(lcB));
  let r0 = 0; while (E.doneUnits(save, 1) < 1 && r0 < 40) { play(1, 1); r0++; }
  ok(E.levelOpen(save, 0) && !E.levelOpen(save, 2), `words open after the first letter group (${r0} rounds)`);
  const p0 = E.plan(save, 0, d);
  ok(p0.teach.length === 2 && p0.teach.every(g => g.startsWith('v:')) && p0.qs.length === 4, 'first word round: 2 new words taught, 4 questions (#59)', JSON.stringify({ t: p0.teach, n: p0.qs.length }));
  ok(p0.qs.every((q, i) => i === 0 || q.k !== p0.qs[i - 1].k), 'no word twice in a row');
  ok(p0.unit.id === 'v-colors', 'words start with colours');
  /* play rounds: all first-try right, a new day every 2 rounds */
  let r1 = 0; while (E.doneUnits(save, 0) < 3 && r1 < 40) { play(0, 1); r1++; }
  ok(r1 >= 6 && r1 <= 20, `3 word themes need a sensible number of rounds (${r1})`);
  ok(E.levelOpen(save, 1) && E.levelOpen(save, 4) && !E.levelOpen(save, 3), 'after 3 themes: songs open, talk still closed');
  ok(E.openSongs(save).map(s => s.th).join(',') === E.LEVELS[0].units.filter(u => E.unitDone(save, u)).map(u => u.id.slice(2)).join(','), 'songs open only for finished themes');
  d += 3; const pr = E.plan(save, 0, d); const oldKeys = new Set(E.LEVELS[0].units.filter(u => E.unitDone(save, u)).flatMap(u => u.items));
  ok(pr.qs.some(q => oldKeys.has(q.k)), 'spaced review: later rounds bring back words of finished themes');
  let r2 = 0; while (E.doneUnits(save, 1) < 3 && r2 < 60) { play(1, 1); r2++; }
  ok(E.levelOpen(save, 2) && r2 < 40, `reading opens after 3 letter groups (${r2} rounds)`);
  /* mistakes slow things down but never block */
  const s2 = freshSave(); const save0 = save; let dd = E.day(); let r3 = 0;
  const playS = (sv) => { const P = E.plan(sv, 0, dd); P.teach.forEach(g => E.touch(sv, E.teachCard(g).items, dd)); const b0 = {}; P.qs.forEach(q => { if (!(q.k in b0)) b0[q.k] = E.box(sv, q.k); }); const res = {};
    P.qs.forEach((q, i) => { const r = (i + r3) % 3 === 0 ? 'bad' : 'ok'; res[q.k] = res[q.k] === 'bad' || r === 'bad' ? 'bad' : 'ok'; E.mark(sv, q.k, res[q.k], b0[q.k], dd); }); dd++; };
  while (E.doneUnits(s2, 0) < 1 && r3 < 60) { playS(s2); r3++; }
  ok(E.doneUnits(s2, 0) >= 1 && r3 > 4, `with a third wrong, colours still get learned (${r3} rounds)`);
  /* a demoted word of a finished theme comes back as review, the theme stays finished */
  const k = 'v:red'; E.mark(save0, k, 'bad', E.box(save0, k), d);
  ok(E.unitDone(save0, E.UNIT['v-colors']) && E.plan(save0, 0, d).qs.some(q => q.k === k), 'a forgotten word comes back; finished theme stays finished');
  /* parent text and merge */
  E.save = save0; const lt = E.levelOf('eng-voc'), lc = E.levelOf('eng-talk');
  ok(/יחידות/.test(lt) && /נפתח אחרי 5/.test(lc) && !NIK.test(lt + lc), 'levelOf: parent progress text', lt + ' / ' + lc);
  const rep = E.report(save0); ok(rep.length === 5 && rep[0].known > 0 && rep.every(x => x.name), 'report() per level');
  const a = freshSave(), b = freshSave(); E.st(a).i['v:red'] = [1, 5]; E.st(b).i['v:red'] = [3, 9]; E.st(b).i['v:blue'] = [2, 4]; E.st(b).u['v-colors'] = 1; E.st(b).g.colors = 2;
  E.merge(a, b); ok(a.en2.i['v:red'][0] === 3 && a.en2.i['v:blue'][0] === 2 && a.en2.u['v-colors'] && a.en2.g.colors === 2, 'merge keeps the better progress');
  const as = freshSave(); as.set.all = 1; ok([0, 1, 2, 3, 4].every(lv => E.levelOpen(as, lv)) && E.openSongs(as).length === E.SONGS.length, 'parent "all open" opens every level and song');
}

/* #58: every English word a question shows or says was taught before (on a card) */
{
  const save = freshSave(); let d = E.day(); const bad = [], seenT = {}; let nq = 0, n = 0;
  for (let r = 0; r < 900 && !(E.unitDone(save, E.UNIT['r-sent']) && E.unitDone(save, E.UNIT['p-me'])); r++) {
    const open = [1, 0, 2, 3].filter(x => E.levelOpen(save, x) && E.curUnit(save, x)); const lvr = open.length ? open[r % open.length] : 0;
    const P = E.plan(save, lvr, d); P.teach.forEach(g => E.touch(save, E.teachCard(g).items, d));
    const b0 = {}; P.qs.forEach(q => { if (!(q.k in b0)) b0[q.k] = E.box(save, q.k); }); const res = {};
    P.qs.forEach(st => { const q = E.gen(save, st); nq++; seenT[q.type] = 1; const T = E.taught(save);
      E.words(q).forEach(w => { if (!T.has(w)) bad.push(q.type + ':' + w + ' (' + q.k + ')'); });
      n++; const r1 = n % 7 === 0 ? 'bad' : 'ok'; res[st.k] = res[st.k] === 'bad' || r1 === 'bad' ? 'bad' : 'ok'; E.mark(save, st.k, res[st.k], b0[st.k], d); });
    if (r % 2) d++;
  }
  ok(E.unitDone(save, E.UNIT['r-sent']) && E.unitDone(save, E.UNIT['p-me']) && ['say', 'sound', 'spell', 'sight', 'sent', 'sit'].every(t => seenT[t]), `played through to sentences (${nq} questions, types ${Object.keys(seenT).join(',')})`);
  ok(!bad.length, 'no question uses an untaught English word', [...new Set(bad)].slice(0, 10).join(' | '));
  /* reading done but the family words never taught: new sentences with mom/dad get their word cards first */
  const sv = freshSave(), dd = E.day(); E.LEVELS[2].units.slice(0, 6).forEach(u => { u.items.forEach(k => { E.st(sv).i[k] = [2, dd + 9]; }); E.st(sv).u[u.id] = 1; });
  E.SENT.slice(0, 5).forEach(s => { E.st(sv).i['x:' + s[0]] = [2, dd + 9]; });
  const ps = E.plan(sv, 2, dd); const hasMom = ps.qs.some(q => /mom|dad/.test(q.k));
  ok(hasMom && ps.teach.includes('v:mom') && ps.teach.includes('v:dad') && E.teachCard('v:mom').kind === 'word', 'a sentence word not taught yet (mom, dad) gets its word card first', JSON.stringify(ps.teach));
}

/* ======================= Part 2: the screens (Playwright) ======================= */
(async () => {
  let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ok(false, 'playwright missing'); return L.finish('english2', out); }
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const has = idx.includes('window.ENGLISH2=');
  const inj = has ? '' : '<style>' + fs.readFileSync(path.join(ROOT, 'english2.css'), 'utf8') + '</style><script>' + fs.readFileSync(path.join(ROOT, 'english2.js'), 'utf8') + '\nwindow.ENGLISH2.register();</script>';
  fs.mkdirSync(L.TMP, { recursive: true }); const PAGE = path.join(L.TMP, 'e2-' + L.variant + '.html'); fs.writeFileSync(PAGE, L.wrap(idx + inj));
  const SHOT = process.env.E2SHOTS || (process.env.SHOTS ? L.SHOTDIR : ''); if (SHOT) fs.mkdirSync(SHOT, { recursive: true });
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) { } window.__fast = true; window.__noFamily = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto('file://' + PAGE); await L.noCoach(p); await L.sleep(300);
  await p.evaluate(() => { const O = window.OREN; O.save.story.intro = 1; O.save.set = { brk: 0, hide: {} }; O.save.prof = { an: 'cat', col: '#3a8fc4', love: 'eng' }; window.__said = []; const o = O.sayLang; O.sayLang = (t, l, slow) => { window.__said.push(t); (window.__said2 = window.__said2 || []).push([t, !!slow]); return o(t, l, slow); }; if (!has()) window.ENGLISH2.register(); function has() { return window.TAL.BUILD.find(x => x.id === 'eng').acts.some(a => a.id === 'eng-voc'); } });
  const v = L.variant;
  const shot = async n => { if (SHOT) { await L.sleep(650); await p.screenshot({ path: path.join(SHOT, `${v}-${n}.png`) }); } };
  const overflow = () => p.evaluate(() => { const e = document.scrollingElement; return e.scrollWidth - innerWidth; });
  const info = () => p.evaluate(() => { const T = window.TAL, b = T.BUILD.find(x => x.id === 'eng'); return { acts: b.acts.map(a => a.id), vis: b.acts.filter(a => !a.avail || a.avail()).map(a => a.id), act: Object.keys(T.ACT).filter(k => /^eng/.test(k)) }; });
  const i0 = await info();
  ok(i0.acts.join() === 'eng-abc,eng-voc,eng-read,eng-talk,eng-song' && i0.act.slice().sort().join() === i0.acts.slice().sort().join(), 'register(): the eng building has the 5 new acts (old ones gone from ACT)', JSON.stringify(i0));
  ok(i0.vis.join() === 'eng-abc', 'a new player sees only "letters and sounds" (first path, #58)', JSON.stringify(i0.vis));
  await p.evaluate(() => window.TAL.openBuilding(window.TAL.BUILD.find(x => x.id === 'eng'))); await L.sleep(200);
  ok((await p.$$eval('#sTal .acts .actc', a => a.length)) === 0 && await p.evaluate(() => !document.querySelector('#sTal').hidden && document.querySelector('#sTal').children.length > 0), 'building with one act: no menu, "letters and sounds" opens straight away (#8)'); await shot('01-building-new');
  /* play a real round with clicks (letters open words; then a word round) */
  await p.evaluate(() => { const E = window.ENGLISH2, s = window.OREN.save, d = E.day(); E.LEVELS[1].units[0].items.forEach(k => { E.st(s).i[k] = [2, d + 3]; }); });
  ok((await info()).vis.join() === 'eng-abc,eng-voc', 'after the first letter group: words appear');
  await p.evaluate(() => window.TAL.ACT['eng-voc'].run(() => window.TAL.openBuilding(window.TAL.BUILD.find(x => x.id === 'eng')))); await L.sleep(150);
  const t1 = await p.evaluate(() => ({ kind: window.__e2.step.t, head: document.querySelector('#sTal .e2head') && document.querySelector('#sTal .e2head').textContent, btn: document.querySelectorAll('#sTal .chs .chb').length }));
  ok(t1.kind === 'teach' && t1.btn === 1, 'round starts with a teach card, one button', JSON.stringify(t1)); await shot('02-teach-word');
  const ovOpen = () => p.evaluate(() => !document.querySelector('#ov').hidden);
  const seenTypes = {};
  async function answer(wrong) { return p.evaluate(wrong => { const q = window.__quiz; const c = q.wrap.querySelector('.chs'); if (!c) return null; const st = window.__e2 && window.__e2.step; const ty = st && st.t === 'q' ? 'q' : 'teach';
      let k = q.ans; if (wrong && ty === 'q') k = [...c.children].findIndex((b, i) => i !== q.ans && !b.disabled); const b = c.children[k]; if (b && !b.disabled) b.click(); return ty; }, wrong); }
  async function playRound(opts = {}) { for (let k = 0; k < 120; k++) { if (await ovOpen()) return true; const ty = await p.evaluate(() => { const st = window.__e2.step; return st ? (st.t === 'teach' ? 'teach:' + st.c.kind : 'q') : null; });
      const qt = await p.evaluate(() => { const c = document.querySelector('#sTal .tqc'); return c ? c.dataset.e2 || '' : ''; });
      if (opts.onStep) await opts.onStep(ty); await answer(opts.wrong && k % 5 === 2); await L.sleep(opts.slow || 60); } return false; }
  const done1 = await playRound();
  const r1 = await p.evaluate(() => ({ st: (window.TAL.S().tl['eng-voc'] || {}).s | 0, en2: Object.keys(window.OREN.save.en2.i).length, said: window.__said.slice() }));
  ok(done1 && r1.st > 0 && r1.en2 >= 4, 'a full word round finishes, stars recorded with T.record, progress saved', JSON.stringify({ done1, st: r1.st, n: r1.en2 }));
  await shot('03-result');
  const SLb = new Set(await p.evaluate(() => window.ENGLISH2.speakList()));
  const notListed = r1.said.filter(s => !SLb.has(s));
  ok(r1.said.length > 4 && !notListed.length, `everything said in English is in speakList (${r1.said.length} said)`, notListed.join(' | '));
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; });
  /* open everything and walk through each level; screenshot each kind of screen */
  await p.evaluate(() => { window.OREN.save.set.all = 1; });
  const i1 = await info(); ok(i1.vis.length === 5, 'with all open: 5 act cards', JSON.stringify(i1.vis));
  await p.evaluate(() => window.TAL.openBuilding(window.TAL.BUILD.find(x => x.id === 'eng'))); await L.sleep(150); await shot('04-building-all');
  const wantShots = new Set();
  async function walk(lv, rounds, label) {
    for (let r = 0; r < rounds; r++) {
      await p.evaluate(lv => { document.querySelector('#ov').hidden = true; window.ENGLISH2.screens.ACTS[lv].run(() => { }); }, lv); await L.sleep(120);
      for (let k = 0; k < 120; k++) { if (await ovOpen()) break;
        const st = await p.evaluate(() => { const s = window.__e2.step; if (!s) return null; if (s.t === 'teach') return 'teach-' + s.c.kind; const c = document.querySelector('#sTal .tqc'); return 'q'; });
        const qt = st === 'q' ? await p.evaluate(() => window.__e2q && window.__e2q.type) : st;
        if (qt && !wantShots.has(qt)) { wantShots.add(qt); const of = await overflow(); ok(of <= 1, `${label} ${qt}: fits the screen`, 'overflow ' + of);
          if (qt === 'teach-letter') { const lm = await p.evaluate(() => { const c = window.__e2.step.c, m = document.querySelector('#sTal .e2teach .e2mean'); return { m: m && m.textContent, he: window.ENGLISH2.WORD[c.w].he, w: c.w }; });
            ok(lm.m && lm.m.trim() === lm.he, 'letter card shows the word with its Hebrew meaning', JSON.stringify(lm)); } await shot(`${label}-${qt}`); }
        await answer(false); await L.sleep(50); }
      const st = await p.evaluate(id => (window.TAL.S().tl[id] || {}).s | 0, ['eng-voc', 'eng-abc', 'eng-read', 'eng-talk'][lv]);
      if (r === 0) ok(st > 0, `${label}: round finished and recorded`);
    }
  }
  await walk(0, 4, '10-voc');
  await walk(1, 4, '20-abc');
  /* reading: jump to later units for sight words and sentences */
  await walk(2, 2, '30-read');
  await p.evaluate(() => { const E = window.ENGLISH2, s = window.OREN.save, d = E.day(); E.LEVELS[2].units.slice(0, 5).forEach(u => { u.items.forEach(k => { E.st(s).i[k] = [2, d + 5]; }); E.st(s).u[u.id] = 1; }); });
  await walk(2, 3, '31-read');
  await p.evaluate(() => { const E = window.ENGLISH2, s = window.OREN.save, d = E.day(); const u = E.LEVELS[2].units[5]; u.items.forEach(k => { E.st(s).i[k] = [2, d + 5]; }); E.st(s).u[u.id] = 1; });
  await walk(2, 2, '32-read');
  await walk(3, 4, '40-talk');
  const need = ['teach-word', 'hear', 'say', 'teach-letter', 'name', 'case', 'sound', 'teach-cvc', 'read', 'teach-sight', 'sight', 'sent', 'teach-phrase', 'mean'];
  ok(need.every(t => wantShots.has(t)), 'saw every kind of screen', [...wantShots].join(','));
  /* reading hint lights up the sentence words; honor button on phrases */
  /* songs */
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.ENGLISH2.screens.ACTS[4].run(() => { }); }); await L.sleep(150);
  ok(await p.evaluate(() => !!document.querySelector('#sTal .e2song')), 'songs: straight to a song (no menu)');
  const firstSong = await p.evaluate(() => document.querySelector('#sTal .e2head').textContent);
  ok(firstSong === E.SONGS[0].he, 'the first song is the colours song', firstSong);
  const so = await p.evaluate(() => ({ lines: document.querySelectorAll('#sTal .e2line').length, words: document.querySelectorAll('#sTal .e2w').length, btn: document.querySelectorAll('#sTal .chs .chb').length }));
  ok(so.lines === 4 && so.words > 10 && so.btn === 1, 'song screen: 4 lines, words to light up, one button', JSON.stringify(so));
  await p.evaluate(() => { window.__said = []; document.querySelector('#sTal .chs .chb').click(); });
  let lit = false; for (let k = 0; k < 40 && !lit; k++) { await L.sleep(5); lit = await p.evaluate(() => !!document.querySelector('#sTal .e2w.on')); }
  ok(lit, 'karaoke: words light up while the song is sung'); if (lit) await shot('51-song-karaoke');
  for (let k = 0; k < 200; k++) { const st = await p.evaluate(() => window.__quiz.i); if (st === 2) break; await L.sleep(30); }
  const said = await p.evaluate(() => window.__said.slice());
  ok(said.length === 4, 'each song line is said once', JSON.stringify(said));
  await p.evaluate(() => document.querySelector('#sTal .chs .chb').click()); await L.sleep(300);
  ok(await ovOpen() && (await p.evaluate(() => (window.TAL.S().tl['eng-song'] || {}).s | 0)) === 3, 'finishing a song records eng-song');
  await shot('52-song-done');
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.ENGLISH2.screens.ACTS[4].run(() => { }); }); await L.sleep(150);
  const second = await p.evaluate(() => document.querySelector('#sTal .e2head').textContent);
  ok(second === E.SONGS[1].he, 'next time: the next song not sung yet', second);
  /* gradual unlocking in the UI (fresh save): words only -> after 3 themes letters + songs */
  await p.evaluate(() => { const O = window.OREN, E = window.ENGLISH2; O.save.set = { brk: 0, hide: {} }; O.save.en2 = {}; O.save.kn = {}; const d = E.day();
    E.LEVELS[0].units.slice(0, 3).forEach(u => u.items.forEach(k => { E.st(O.save).i[k] = [2, d + 3]; })); E.LEVELS[1].units[0].items.forEach(k => { E.st(O.save).i[k] = [2, d + 3]; }); });
  const i2 = await info(); ok(i2.vis.join() === 'eng-abc,eng-voc,eng-song', 'after 3 themes: songs appear', JSON.stringify(i2.vis));
  /* songs with no open song: no crash, back to the building (the card is hidden anyway) */
  const ns = await p.evaluate(() => { const O = window.OREN; const keep = O.save.en2; O.save.en2 = {}; let backed = 0; window.ENGLISH2.screens.songs(() => { backed = 1; }); const card = !window.TAL.ACT['eng-song'].avail(); O.save.en2 = keep; return { backed, card }; });
  ok(ns.backed && ns.card, 'songs() with no open song goes back; songs card hidden', JSON.stringify(ns));
  /* simplicity: one 🔊 per question card, 4 options as 2x2 */
  await p.evaluate(() => { window.OREN.save.set.all = 1; window.ENGLISH2.screens.ACTS[0].run(() => { }); }); await L.sleep(150);
  let g4 = null, spk = [];
  for (let k = 0; k < 60 && !(await ovOpen()); k++) { const r = await p.evaluate(() => { const st = window.__e2.step; if (!st || st.t !== 'q') return null; const c = document.querySelector('#sTal .tqc');
      return { rd: c.querySelectorAll('.rdb').length + c.querySelectorAll('.hintbtn').length, four: document.querySelector('#sTal .chs').children.length === 4, grid: document.querySelector('#sTal .chs').classList.contains('e2g4') }; });
    if (r) { spk.push(r.rd); if (r.four) g4 = r.grid; } await answer(false); await L.sleep(40); }
  ok(spk.length && spk.every(n => n === 1), 'one sound button per question card', JSON.stringify(spk));
  ok(g4 !== false, '4 options are laid out 2x2', String(g4));
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; });
  /* #425: a second tap on the 🔊 (soon after the first) says the English slowly; the first tap and a late tap at normal speed */
  await p.evaluate(() => { window.ENGLISH2.screens.ACTS[0].run(() => { }); }); await L.sleep(150);
  for (let k = 0; k < 30 && !(await p.evaluate(() => !!document.querySelector('#sTal .tqc .hintbtn:not(.lsn)'))); k++) { await answer(false); await L.sleep(60); }
  const sl = await p.evaluate(async () => { const z = ms => new Promise(r => setTimeout(r, ms)); const b = () => document.querySelector('#sTal .tqc .hintbtn:not(.lsn)');
    const tap = async () => { window.__said2 = []; b().click(); await z(250); return window.__said2.filter(x => /[A-Za-z]/.test(x[0])); };
    await z(300); const a = await tap(), s = await tap(); await z(2600); const c = await tap(); return { a, s, c }; });
  ok(sl.a.length && sl.a.every(x => !x[1]) && sl.s.length && sl.s.every(x => x[1]) && sl.c.length && sl.c.every(x => !x[1]), '#425 second tap on 🔊 says it slowly; first and late taps normal, no new button', JSON.stringify(sl));
  /* #425: the slow version of every English string is made in advance (pregen at 0.7) */
  const pg = fs.readFileSync(path.join(ROOT, 'cf', 'tools', 'pregen.js'), 'utf8');
  ok(/ENGLISH2\.speakList\(\)[^\n]*r: 0\.85[^\n]*r: 0\.7|ENGLISH2\.speakList\(\)[^\n]*r: 0\.7[^\n]*r: 0\.85/.test(pg), '#425 pregen makes every English2 string at 0.85 and slow at 0.7');
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; });
  /* the activities-suite helper (window.__quiz) can play every act */
  ok(await p.evaluate(() => typeof window.__quiz.ans === 'number'), 'window.__quiz is there for the activities suite');
  ok(!errs.length, 'no JS errors', errs.slice(0, 5).join(' | '));
  await b.close(); L.finish('english2-' + v, out);
})().catch(e => { ok(false, 'crash ' + e.stack); L.finish('english2', out); });
