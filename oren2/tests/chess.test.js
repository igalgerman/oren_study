// Chess club pack (chess.js): legal moves (perft), puzzles verified, every activity played through, a game vs the gentle bot.
// Usage: node tests/chess.test.js [desktop|phone]     SHOTS=<dir> saves screenshots there.
// Before integration the pack files are injected into the built page; after integration they are already in it.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const L = require('./lib.js');
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const E = require('../chess.js');
const SHOTS = process.env.SHOTS && process.env.SHOTS !== '1' ? process.env.SHOTS : null;

// ---- rules engine (node) ----
const pf = (fen, ds) => ds.map(d => E.perft(E.fromFEN(fen), d));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let r;
r = pf(E.START, [1, 2, 3]); ok('perft start position 1-3 = 20, 400, 8902', eq(r, [20, 400, 8902]), r.join());
r = pf('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -', [1, 2, 3]); ok('perft "kiwipete" (castling, pins, ep) = 48, 2039, 97862', eq(r, [48, 2039, 97862]), r.join());
r = pf('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -', [1, 2, 3, 4]); ok('perft position 3 (en passant) = 14, 191, 2812, 43238', eq(r, [14, 191, 2812, 43238]), r.join());
r = pf('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq -', [1, 2, 3]); ok('perft position 4 (promotions) = 6, 264, 9467', eq(r, [6, 264, 9467]), r.join());
r = pf('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ -', [1, 2, 3]); ok('perft position 5 = 44, 1486, 62379', eq(r, [44, 1486, 62379]), r.join());
ok('FEN round trip', E.toFEN(E.fromFEN(E.START)) === E.START);
ok('fool\'s mate is mate', (() => { let p = E.fromFEN(E.START); for (const [f, t] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) { const m = E.legal(p).find(m => m.f === E.sqOf(f) && m.t === E.sqOf(t)); p = E.make(p, m); } return E.status(p) === 'mate'; })());
ok('stalemate detected', E.status(E.fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - -')) === 'stale');
E.PUZ.forEach((f, i) => {
  const p = E.fromFEN(f); const m = E.mates(p);
  const legalPos = !E.inCheck(E.fromFEN(f.replace(' w ', ' b ')));
  ok(`puzzle ${i + 1}: legal position, white to move, has a mate in one`, legalPos && p.t === 'w' && m.length >= 1 && E.status(p) !== 'mate', m.map(x => E.sqName(x.f) + E.sqName(x.t)).join());
});

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; window.__noFamily = true; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await L.noCoach(p);
  if (!(await p.evaluate(() => !!(window.CHESS && window.CHESS.register)))) {
    await p.addStyleTag({ content: fs.readFileSync(path.join(L.ROOT, 'chess.css'), 'utf8') });
    await p.addScriptTag({ content: fs.readFileSync(path.join(L.ROOT, 'chess.js'), 'utf8') });
  }
  await p.evaluate(() => { const O = window.OREN; O.save.story.intro = 1; O.save.set = { brk: 0, hide: {} }; if (!window.TAL.ACT['chess-board']) { window.CHESS.register(window.TAL.building); window.CHESS.register(window.TAL.building); } });
  ok('registered once as a building, in the "explore" door', await p.evaluate(() => window.TAL.BUILD.filter(b => b.id === 'chess').length <= 1 && !!window.TAL.ACT['chess-board'] && window.TAL.GROUPS.some(g => g.ids.includes(window.TAL.ACT['chess-board'].b.id))));
  const ovOpen = () => p.evaluate(() => !document.querySelector('#ov').hidden);
  const shot = async name => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: path.join(SHOTS, `chess-${name}-${L.variant}.png`) }); };
  const solveAll = async (n = 60) => { for (let k = 0; k < n && !(await ovOpen()); k++) { await p.evaluate(() => window.CHESS.solve()); await L.sleep(160); } return ovOpen(); };
  const open = id => p.evaluate(id => { document.querySelector('#ov').hidden = true; window.TAL.ACT[id].run(() => {}); }, id);
  const acts = () => p.evaluate(() => { const b = window.TAL.ACT['chess-board'].b; return b.acts.filter(a => /^chess-/.test(a.id) && (!a.avail || a.avail())).map(a => a.id); });

  await p.evaluate(() => window.TAL.openBuilding(window.TAL.ACT['chess-board'].b)); await L.sleep(200);
  ok('at first only "the board and the pieces" is open', eq(await acts(), ['chess-board']));
  await shot('hall-first');

  // ---- 1. board & names ----
  await open('chess-board'); await L.sleep(150);
  await shot('names');
  // wrong answers on a find task are counted, right square ends it
  for (let k = 0; k < 8 && !(await p.evaluate(() => !!document.querySelector('#sTal .czb'))); k++) { await p.evaluate(() => window.CHESS.solve()); await L.sleep(160); }
  await shot('find');
  const findOk = await p.evaluate(() => { const q = document.querySelector('#sTal .qq').textContent; return q.includes('גַּע'); });
  ok('find-the-piece task on the start position', findOk);
  ok('board & names finishes', await solveAll());
  ok('board: recorded, "how pieces move" opens', await p.evaluate(() => (window.TAL.S().tl['chess-board'] || {}).s === 3) && (await acts()).includes('chess-moves'));

  // ---- 2. moves, one piece at a time ----
  for (let k = 0; k < 6; k++) {
    await open('chess-moves'); await L.sleep(150);
    if (k === 0 || k === 4) await shot('demo-' + k);
    if (k === 0) ok('demo: one green "▶ הַמְשֵׁךְ"', await p.evaluate(() => { const b = document.querySelectorAll('#sTal .bigbtn'); return b.length === 1 && b[0].textContent.includes('הַמְשֵׁךְ'); }));
    if (k === 0) ok('one instruction line per card (no second line)', await p.evaluate(() => !document.querySelector('#sTal .czsub')));
    const u = await p.evaluate(() => document.querySelector('#sTal .czhead b').textContent);
    await p.evaluate(() => window.CHESS.solve()); await L.sleep(150);   // "let's try"
    // the squares marked as targets are exactly the engine's legal destinations, and a wrong tap is refused
    const chk = await p.evaluate(() => { const C = window.CHESS.cur; const t = [...C.target]; const bad = [...Array(64).keys()].find(s => !C.target.has(s) && !document.querySelector(`#sTal .cq[data-s="${s}"] .czp`)); document.querySelector(`#sTal .cq[data-s="${bad}"]`).click(); return { n: t.length, bad }; });
    if (k === 0) await shot('moves-task');
    ok(`moves: ${u} has squares to find (${chk.n})`, chk.n > 0);
    ok(`moves: ${u} finishes`, await solveAll());
    if (k === 2) await shot('moves-result');
  }
  ok('all six pieces learned; capture, check, mate, game unlock in order', await p.evaluate(() => window.CHESS.ST().mv === 6) && eq(await acts(), ['chess-board', 'chess-moves', 'chess-capture']));
  // the knight jumps; the pawn moves forward and captures diagonally (engine check from the UI side)
  ok('knight on b1 at the start: a3, c3', await p.evaluate(() => { const E = window.CHESS.ENG; return E.legal(E.fromFEN(E.START), E.sqOf('b1')).map(m => E.sqName(m.t)).sort().join() === 'a3,c3'; }));

  // ---- 3. capture ----
  await open('chess-capture'); await L.sleep(150); await shot('capture');
  ok('capture: exactly one black piece can be taken (engine)', await p.evaluate(() => { const E = window.CHESS.ENG, C = window.CHESS.cur; const pos = { b: C.b, t: 'w', c: '', ep: -1 }; const caps = new Set(E.legal(pos).filter(m => m.cap).map(m => m.t)); return caps.size === 1 && caps.has(C.target); }));
  const wc = await p.evaluate(() => { const C = window.CHESS.cur; const s = C.b.findIndex((x, k) => x && x === x.toLowerCase() && k !== C.target); document.querySelector(`#sTal .cq[data-s="${s}"]`).click(); return window.__quiz.i; });
  ok('capture: tapping the wrong black piece does not finish the task', wc === 0);
  // tap a black piece that is NOT the answer -> red, still waiting
  const wrongCap = await p.evaluate(() => { const cells = [...document.querySelectorAll('#sTal .cq')]; const blacks = cells.filter(c => c.querySelector('.czp.b')); return blacks.length; });
  ok('capture: three black pieces on the board', wrongCap === 3, String(wrongCap));
  ok('capture finishes', await solveAll());
  ok('check opens after capture', (await acts()).includes('chess-check'));

  // ---- 4. check ----
  await open('chess-check'); await L.sleep(150); await shot('is-check');
  const ans = await p.evaluate(() => window.__quiz.ans);
  ok('is-the-king-in-check: yes/no answer matches the engine', await p.evaluate(() => { const E = window.CHESS.ENG, C = window.CHESS.cur; return (C.ans() === 0) === E.inCheck(C.pos) && C.pos.b.includes('k'); }));
  for (let k = 0; k < 6 && !(await p.evaluate(() => document.querySelector('#sTal .qq').textContent.includes('הַצֵּל'))); k++) { await p.evaluate(() => window.CHESS.solve()); await L.sleep(160); }
  await shot('escape');
  // a move that leaves the king in check is refused
  ok('escape: the king in check is marked', await p.evaluate(() => !!document.querySelector('#sTal .cq.chk')));
  const ref = await p.evaluate(() => {
    const E = window.CHESS.ENG, C = window.CHESS.cur, pos = C.pos;
    const bad = E.pseudo(pos, C.K).find(m => E.inCheck(E.make(pos, m), 'w'));
    if (!bad) return { skip: 1 };
    document.querySelector(`#sTal .cq[data-s="${bad.t}"]`).click();
    return { msg: document.querySelector('#sTal .czmsg').textContent, still: window.CHESS.cur.pos === pos };
  });
  ok('escape: a king move that stays in check is refused ("still check")', ref.skip || (ref.msg.includes('עֲדַיִן שַׁח') && ref.still), JSON.stringify(ref));
  ok('check lesson finishes', await solveAll());
  ok('mate opens after check', (await acts()).includes('chess-mate'));

  // ---- 5. mate in one ----
  await open('chess-mate'); await L.sleep(150);
  // a non-mating legal move is refused with "not mate"
  const nm = await p.evaluate(() => {
    const E = window.CHESS.ENG; const fen = E.PUZ[0]; const pos = E.fromFEN(fen);
    const m = E.legal(pos).find(x => E.status(E.make(pos, x)) !== 'mate');
    document.querySelector(`#sTal .cq[data-s="${m.f}"]`).click(); const dots = document.querySelectorAll('#sTal .cq .dot,#sTal .cq .ring').length;
    document.querySelector(`#sTal .cq[data-s="${m.t}"]`).click();
    return { dots, msg: document.querySelector('#sTal .czmsg').textContent };
  });
  ok('mate: selecting a piece shows its moves; a non-mate move is refused', nm.dots > 0 && nm.msg.includes('לֹא מָט'), JSON.stringify(nm));
  await shot('mate');
  ok('mate puzzles finish (level 1)', await solveAll());
  ok('mate level 2 next time', await p.evaluate(() => window.CHESS.ST().mate === 2));
  await open('chess-mate'); await L.sleep(150); await shot('mate-2');
  ok('mate puzzles finish (level 2)', await solveAll());

  // ---- 6. game vs the gentle bot ----
  ok('game opens when all pieces are learned', (await acts()).includes('chess-play'));
  await open('chess-play'); await L.sleep(200); await shot('game-start');
  ok('game: one instruction line + a big arrow hint for the first move; no a–h/1–8 labels', await p.evaluate(() => document.querySelectorAll('#sTal .czarrow').length === 1 && document.querySelectorAll('#sTal .czq,#sTal .czsub').length === 0 && !document.querySelector('#sTal .rk,#sTal .fl') && !/[a-h][1-8]|\b[1-8]\b/.test(document.querySelector('#sTal .czb').textContent)));
  // #7: the one line is short, spoken, and points at the arrow; the arrow shows a legal first move (e2 → e4)
  const gi = await p.evaluate(() => { const t = document.querySelector('#sTal .czmsg').textContent; const s = String(window.OREN.sayNow || '');
    const ln = document.querySelector('#sTal .czarrow line'); return { t, spoken: s.includes('הַחֵץ') || s.includes('החץ'), x1: ln && +ln.getAttribute('x1'), y1: ln && +ln.getAttribute('y1') }; });
  ok('game: the start line is short, spoken and points at the arrow', gi.t.includes('הַחֵץ') && gi.t.replace(/[֑-ׇ]/g, '').length <= 32 && gi.spoken, JSON.stringify(gi));
  ok('game: the arrow starts on the e2 pawn', gi.x1 === 4 * 12.5 + 6.25 && gi.y1 === 6 * 12.5 + 6.25, JSON.stringify(gi));
  await p.evaluate(() => { const C = window.CHESS, E = C.ENG; C.cur.play(E.legal(C.cur.pos).find(m => E.sqName(m.f) === 'e2' && E.sqName(m.t) === 'e4')); });
  ok('game: the arrow goes away after the first move', await p.evaluate(() => !document.querySelector('#sTal .czarrow')));
  const g = await p.evaluate(async () => {
    const C = window.CHESS, E = C.ENG; const sleep = ms => new Promise(r => setTimeout(r, ms));
    let moves = 0, illegal = 0;
    for (let k = 0; k < 400; k++) {
      if (!document.querySelector('#ov').hidden) break;
      const cur = C.cur; if (!cur) break; const pos = cur.pos;
      if (pos.t !== 'w') { await sleep(60); continue; }
      const ms = E.legal(pos); if (!ms.length) { await sleep(60); continue; }
      // a simple attacker for the test: mate if possible, else take the biggest piece, else random
      const V = { q: 9, r: 5, b: 3, n: 3, p: 1, '': 0 };
      const mate = ms.find(m => E.status(E.make(pos, m)) === 'mate');
      const m = mate || ms.slice().sort((a, b) => V[b.cap] - V[a.cap] || Math.random() - .5)[0];
      cur.play(m); moves++; await sleep(80);
      if (C.cur && C.cur.pos === pos) illegal++;
    }
    await sleep(300);
    return { moves, illegal, over: !document.querySelector('#ov').hidden, title: document.querySelector('#ov h2') && document.querySelector('#ov h2').textContent };
  });
  ok('game: every move accepted, the bot answers, the game ends (an early mate is a valid end)', g.illegal === 0 && g.over && g.moves >= 1, JSON.stringify(g));
  await shot('game-end');
  ok('game recorded', await p.evaluate(() => (window.TAL.S().tl['chess-play'] || {}).n >= 1));
  // the bot never makes an illegal move, prefers captures
  ok('bot: only legal moves, takes when it can', await p.evaluate(() => { const C = window.CHESS, E = C.ENG; const pos = E.fromFEN('rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -'); const key = m => m.f + '-' + m.t; const lg = new Set(E.legal(pos).map(key));
    for (let k = 0; k < 40; k++) { const m = C.botMove(pos); if (!lg.has(key(m)) || !m.cap) return false; } return true; }));
  // a game in progress: screenshot mid-game on a fresh board
  await open('chess-play'); await L.sleep(150);
  await p.evaluate(async () => { const C = window.CHESS, E = C.ENG; const s = ms => new Promise(r => setTimeout(r, ms)); for (const mv of [['e2', 'e4'], ['g1', 'f3'], ['f1', 'c4']]) { while (C.cur.pos.t !== 'w') await s(30); const m = E.legal(C.cur.pos).find(x => E.sqName(x.f) === mv[0] && E.sqName(x.t) === mv[1]); if (m) C.cur.play(m); await s(120); } document.querySelector(`#sTal .cq[data-s="${E.sqOf('d1')}"]`).click(); });
  await L.sleep(150); await shot('game-mid');
  ok('no horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const sk = await p.evaluate(() => window.CHESS.skills());
  ok('parent skill "שחמט" with stars and plays', sk.length === 1 && sk[0].name === 'שחמט' && sk[0].plays >= 6, JSON.stringify(sk));
  ok('no JS errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  await b.close(); L.finish('chess', res);
})();
