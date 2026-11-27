// Regression tests for specific bugs: kingdom opens without the old badges button (#426), avatar default + one-time migration, cap hat rendering.
const L = require('./lib');
const { chromium } = require('playwright');
(async () => {
  const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
  const b = await chromium.launch();
  // 1. #426: the kingdom opens with only "my hero" (the badges button and wall are gone), no errors
  {
    const ctx = await b.newContext(L.VIEWPORT);
    await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(L.URL); await L.noCoach(p);
    await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; O.kingdom(); });
    await p.locator('.kmine .tool').first().waitFor({ timeout: 5000 }).catch(() => {});
    ok('#426 kingdom: "my hero" only, no badges button', await p.locator('.kmine .tool').count() === 1 && await p.locator('.kmine .tool', { hasText: 'הַתַּגִּים' }).count() === 0);
    ok('no page errors (kingdom)', !errs.length, errs.join(' | '));
    await ctx.close();
  }
  // 2. avatar default look + one-time migration that keeps Oren's later choices
  {
    const ctx = await b.newContext(L.VIEWPORT);
    await ctx.addInitScript(() => { window.__fast = true; });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(L.URL);
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('oren4-v1', JSON.stringify({ v: 4, t: 1, s: {}, m: {}, seen: {}, story: { intro: 1 }, rq: [], days: [], ans: 0, ok: 0, trains: 0, gems: 0, av: { hair: 'black', skin: 'light', shirt: 'green', hat: 'none', pet: 'cat' }, owned: { none: 1, cap: 1 }, k: {}, tc: [], sp: {}, made: {} })); });
    await p.reload(); await p.waitForFunction(() => window.OREN && window.OREN.save);
    const a = await p.evaluate(() => { const s = window.OREN.save; return { av: s.av, f: s.avOren }; });
    ok('old save migrated to the new default look', a.av.hair === 'lightbrown' && a.av.pants === 'olive' && a.f === 1, JSON.stringify(a));
    await p.evaluate(() => { const O = window.OREN; O.save.av.shirt = 'red'; O.persist(); });
    await p.reload(); await p.waitForFunction(() => window.OREN && window.OREN.save);
    const sh = await p.evaluate(() => window.OREN.save.av.shirt);
    ok("Oren's later choice survives reload (migration runs once)", sh === 'red', sh);
    const cap = await p.evaluate(() => { const O = window.OREN; O.save.av.hat = 'cap'; const svg = O.AV(); return typeof svg === 'string' && svg.includes('<svg'); });
    ok('avatar with cap renders', cap);
    ok('no page errors (avatar)', !errs.length, errs.join(' | '));
    // kingdom block bar pictures must not collapse to zero width (was: the old shop items, #64)
    const shopW = await p.evaluate(() => { const O = window.OREN; O.save.story.intro = 1; O.kingdom(); const svgs = [...document.querySelectorAll('#sKing .bwb .si svg')]; return svgs.length ? Math.min(...svgs.map(s => s.getBoundingClientRect().width)) : 0; });
    ok('kingdom block bar shows its pictures', shopW > 20, String(shopW));
    // hint sentences with numbers used to break into one line per number
    const capLines = await p.evaluate(() => { const d = document.createElement('div'); d.style.width = '600px'; document.body.appendChild(d); d.innerHTML = '<div class="cap"><span>כּוֹתְבִים <span class="ltr">2</span> וּמַעֲבִירִים 1</span></div>'; const h = d.querySelector('.cap span').getBoundingClientRect().height; d.remove(); return h; });
    ok('hint sentence stays on one line', capLines < 50, String(capLines));
    // problem log: counted per day, merged across devices, shown in the parent summary
    const iss = await p.evaluate(() => { const O = window.OREN; window.__fast = false; window.dispatchEvent(new ErrorEvent('error', { message: 'boom' })); window.dispatchEvent(new ErrorEvent('error', { message: 'boom' })); window.__fast = true;
      const d = O.today(); O.mergeIn({ iss: [{ d, k: 'voice', n: 2 }] }); O.mergeIn({ iss: [{ d, k: 'voice', n: 1 }] });
      const e = O.save.iss.find(x => x.k === 'err'), v = O.save.iss.find(x => x.k === 'voice'); return { e: e && e.n, v: v && v.n }; });
    ok('problem log counts and merges', iss.e === 2 && iss.v === 2, JSON.stringify(iss));
    await ctx.close();
  }
  // #350: a real crash keeps the message AND its first stack line (file:line:col), so the next one is findable
  {
    const ctx = await b.newContext(L.VIEWPORT);
    await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
    const p = await ctx.newPage(); p.on('pageerror', () => {});
    await p.goto(L.URL); await p.waitForFunction(() => window.OREN && window.OREN.save);
    await p.addScriptTag({ content: 'function oopsCrash(){const o={};const [a]=o.missing;return a;}' });
    const m = await p.evaluate(() => new Promise(r => { window.__fast = false; setTimeout(window.oopsCrash, 0); setTimeout(() => { window.__fast = true; const e = (window.OREN.save.iss || []).find(x => x.k === 'err'); r(e && e.m); }, 100); }));
    ok('crash record keeps the message', /undefined is not iterable/.test(m || ''), m);
    ok('crash record keeps the first stack line (file:line:col)', / @ oopsCrash \S*:\d+:\d+$/.test(m || '') && !/file:\/\//.test(m || ''), m);
    await ctx.close();
  }
  // #350 root cause: "שׁוּב" (again) on a finished story/science quiz re-ran the quiz with a question counter already past the end
  // -> `const [q,a,ds]=Q[k++]` on undefined -> "undefined is not iterable". Again must start the same questions from the first one.
  {
    const ctx = await b.newContext(L.VIEWPORT);
    await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(L.URL); await L.noCoach(p);
    const toQuiz = {
      'story-1': () => document.querySelector('#sTal .btnrow .bigbtn:last-child').click(),
      'story-new': () => document.querySelector('#sTal .btnrow .bigbtn:last-child').click(),
      'sci-day': () => { const r = document.querySelector('#earthR'); r.value = 180; r.oninput(); document.querySelector('#sTal > .bigbtn').click(); },
      'sci-states': () => { const g = [...document.querySelectorAll('#sTal .bigbtn')].pop(); g.hidden = false; g.click(); },
      'sci-plant': () => { for (let d = 0; d < 4; d++) { window.__plant.water(); window.__plant.next(); } },
      'sci-circ': () => document.querySelectorAll('#sTal .btnrow button').forEach(x => x.click()),
    };
    for (const id of Object.keys(toQuiz)) {
      const n0 = errs.length;
      await p.evaluate(([id, f]) => { document.querySelector('#ov').hidden = true; window.TAL.ACT[id].run(() => {}); (0, eval)('(' + f + ')')(); }, [id, toQuiz[id].toString()]);
      await p.waitForFunction(() => window.__quiz && window.__quiz.wrap.isConnected && document.querySelector('#sTal .tq .chb'), null, { timeout: 5000 }).catch(() => {});
      const first = await p.evaluate(() => document.querySelector('#sTal .tq .prq') && document.querySelector('#sTal .tq .prq').textContent);
      // answer every question right until the result card with "again" shows
      for (let k = 0; k < 12; k++) {
        if (await p.evaluate(() => !document.querySelector('#ov').hidden)) break;
        await p.evaluate(() => { const q = window.__quiz, b = q && q.wrap.querySelectorAll('.chs .chb')[q.ans]; if (b && !b.disabled) b.click(); });
        await L.sleep(400);
      }
      const again = p.locator('#ov .btnrow .bigbtn.plain');
      const hasAgain = await again.count() === 1; if (hasAgain) await again.click(); await L.sleep(150);
      const r = await p.evaluate(() => ({ i: window.__quiz && window.__quiz.i, q: document.querySelector('#sTal .tq .prq') && document.querySelector('#sTal .tq .prq').textContent }));
      ok(`${id}: "again" after the last question restarts at question 1, no crash`, hasAgain && first && r.i === 0 && !!r.q && errs.length === n0, JSON.stringify({ hasAgain, first: !!first, r: { i: r.i, q: !!r.q }, errs: errs.slice(n0) }));
    }
    await ctx.close();
  }
  // journey map (#7): no cage and no "0/49" count on the world cards; one progress bar per card that grows with the stars
  {
    const ctx = await b.newContext(L.VIEWPORT);
    await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(L.URL); await L.noCoach(p);
    const j = await p.evaluate(() => { const O = window.OREN; O.save.story.intro = 1; window.TAL_noHome = true; O.showJourney();
      const cards = [...document.querySelectorAll('#sMap .worlds > .wcard2')];
      const r = { cards: cards.length, caged: document.querySelectorAll('#sMap .caged').length, count: cards.filter(c => /\d+\s*\/\s*\d+/.test(c.textContent)).length,
        bars: cards.every(c => c.querySelectorAll('.bar').length === 1), w0: cards[0] && cards[0].querySelector('.bar i').style.width };
      window.TAL_noHome = false; return r; });
    ok('journey: no cage, no "0/49" count, one progress bar per world card', j.cards > 0 && j.caged === 0 && j.count === 0 && j.bars && j.w0 === '0%', JSON.stringify(j));
    ok('no page errors (journey)', !errs.length, errs.join(' | '));
    await ctx.close();
  }
  // #356: one way back on every screen. Each activity (opened from the Talents City hub), the journey screens and the story dialogs
  // show the back/home control in the top bar (not covered), a real tap lands on the screen Oren came from; the phone back gesture never leaves the game
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    // window.__lessons: lesson cards on here, as before #258 (a first lesson stands in front of an activity's round, like in the game)
    await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; window.__noFamily = true; window.__lessons = true; });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss());
    await p.goto(L.URL); await L.noCoach(p);
    await p.evaluate(() => { const O = window.OREN; O.save.story.intro = 1; O.save.set = Object.assign(O.save.set || {}, { brk: 0 }); window.TAL.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; O.showMap(); });
    // the back (or home) control: visible, not covered by a dialog, centre point of it
    const backAt = () => p.evaluate(() => { for (const id of ['btnBack', 'btnHome']) { const e = document.getElementById(id); if (!e || e.hidden || getComputedStyle(e).visibility === 'hidden') continue;
      const r = e.getBoundingClientRect(); if (!r.width) continue; const x = r.x + r.width / 2, y = r.y + r.height / 2, t = document.elementFromPoint(x, y); if (t && (t === e || e.contains(t))) return { id, x, y }; } return null; });
    const screen = () => p.evaluate(() => { const s = [...document.querySelectorAll('.screen')].find(x => !x.hidden); return s ? s.id : ''; });
    const atHub = () => p.evaluate(() => !document.querySelector('#sTal').hidden && !!document.querySelector('#sTal .gdoors') && document.querySelector('#dlg').hidden);
    const ids = await p.evaluate(() => Object.keys(window.TAL.ACT));
    const noBack = [], wrong = [], long = [], recount = [], MAXQ = 6, bldQ = {};   // #59: a round opened from a building is about 5 questions (at most 6)
    const countQ = () => p.evaluate(() => { const pr = document.querySelector('#hud .progress'); return pr ? pr.children.length : 0; });
    for (const id of ids) {
      await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.TAL.openHub(); });
      await p.evaluate(id => { const T = window.TAL; T.ACT[id].run(() => T.openHub()); }, id); await L.sleep(120);
      await p.evaluate(() => { const ov = document.querySelector('#ov'); if (!ov.hidden) ov.hidden = true; });   // a first-time popup (placement, lesson pick) is not this test
      if (await atHub()) continue;                // not open yet for Oren (e.g. the champions' test): the activity went straight back
      const lesson = await p.evaluate(() => !!document.querySelector('#sTal .lccard'));
      const nq = lesson ? 0 : await countQ(); if (nq > MAXQ && id !== 'mind-scan') long.push(id + ':' + nq); if (lesson) recount.push(id); else bldQ[id] = nq;   // mind-scan: 8 calm-down steps, no questions (~2 min)
      const at = await backAt(); if (!at) { noBack.push(id); continue; }
      await p.mouse.click(at.x, at.y); await L.sleep(120);
      if (!(await atHub())) wrong.push(id + '→' + (await screen()));
    }
    ok('every activity (' + ids.length + ') shows the back control in the top bar', noBack.length === 0, noBack.join(', '));
    ok('a tap on it lands on the screen Oren came from (the hub)', wrong.length === 0, wrong.join(', '));
    // #555: a lesson card in front (its own progress bar of cards) hides the round from the count; those activities are counted again with lesson cards off (as in every other suite)
    await p.evaluate(() => { window.__lessons = false; });
    for (const id of recount) {
      await p.evaluate(id => { document.querySelector('#ov').hidden = true; const T = window.TAL; T.openHub(); T.ACT[id].run(() => T.openHub()); }, id); await L.sleep(120);
      await p.evaluate(() => { const ov = document.querySelector('#ov'); if (!ov.hidden) ov.hidden = true; });
      if (await atHub()) continue;
      const nq = await countQ(); if (nq > MAXQ && id !== 'mind-scan') long.push(id + ':' + nq); bldQ[id] = nq;
    }
    ok('#59 no activity round is longer than ' + MAXQ + ' questions (lesson cards off too)', long.length === 0 && recount.includes('mus2-rhythm') && recount.includes('eng-abc'), long.join(', ') + ' recounted: ' + recount.length);
    // #555: the rhythm and letters rounds still end normally: end screen, stars recorded, progress saved
    for (const id of ['mus2-rhythm', 'eng-abc']) {
      await p.evaluate(id => { document.querySelector('#ov').hidden = true; const T = window.TAL; T.openHub(); T.ACT[id].run(() => T.openHub()); }, id); await L.sleep(150);
      let end = false;
      for (let k = 0; k < 60 && !end; k++) {
        end = await p.evaluate(id => { if (!document.querySelector('#ov').hidden) return true; const M = window.MUSIC2;
          if (id === 'mus2-rhythm' && M.cur && M.cur.pat) { M.cur.solve(); return false; }
          const q = window.__quiz; const c = q && q.wrap.isConnected && q.wrap.querySelector('.chs'); if (c && c.children[q.ans] && !c.children[q.ans].disabled) c.children[q.ans].click(); return false; }, id);
        await L.sleep(120);
      }
      const sv = await p.evaluate(id => ({ s: (window.TAL.S().tl[id] || {}).s | 0, m2: (window.TAL.S().m2 || {}).rhy, en: window.OREN.save.en2 ? Object.keys(window.OREN.save.en2.i || {}).length : 0 }), id);
      ok('#555 a ' + id + ' round ends on the end screen, stars and progress saved', end && sv.s > 0 && (id === 'eng-abc' ? sv.en > 0 : sv.m2 >= 1), JSON.stringify(Object.assign({ end }, sv)));
    }
    await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.__lessons = true; });
    // #59: journey levels are short too; the place-value split (num-pv2, 42 = 40 + 2) is 5 questions a level, not 5 + 6 + 8
    const jl = await p.evaluate(() => { const lv = window.OREN.WORLDS.flatMap(w => w.levels); const pv = lv.filter(l => l.u.id === 'num-pv2');
      return { n: lv.length, long: lv.filter(l => l.n > (l.type === 'boss' ? 10 : 5)).map(l => l.id + ':' + l.n), pv: pv.map(l => l.n) }; });
    ok('#59 every journey level is at most 5 questions (a boss at most 10)', jl.n > 0 && jl.long.length === 0, jl.long.slice(0, 8).join(', '));
    ok('#59 place-value split: 3 levels of at most 5 questions', jl.pv.length === 3 && jl.pv.every(n => n <= 5), JSON.stringify(jl.pv));
    // #634 (was #394's short scenes): a path mission has its full length, the same as opened from its building
    {
      await p.evaluate(() => { window.__lessons = false; });
      const pool = await p.evaluate(() => window.TAL.dailyPool()); const pathQ = {}, over = [];
      for (const id of pool) {
        await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.TAL.openHub(); });
        await p.evaluate(id => { const T = window.TAL; T.S().daily = { d: window.OREN.today(), t: [id], done: [0], claimed: 0, ch: 'plan', cr: [] }; window.TAL_step(0); }, id); await L.sleep(120);
        await p.evaluate(() => { const ov = document.querySelector('#ov'); if (!ov.hidden) ov.hidden = true; });
        const cards = await p.evaluate(() => { let k = 0; while (document.querySelector('#sTal .e2card') && k < 9) { document.querySelector('#sTal .e2next').click(); k++; } return k; });   // explore lessons: a few short cards, then the questions
        const n = await countQ(); pathQ[id] = n;
      }
      /* the building run comes first and changes the state (lesson cards seen, words learned, items used), so a few rounds differ by that; the old cap made every 5-6 round a 3-4 one */
      const both = Object.keys(bldQ).filter(id => id in pathQ), cut = both.filter(id => pathQ[id] < bldQ[id]), long = both.filter(id => pathQ[id] >= 5);
      ok('#634 path missions are not cut short (the old cap was 4): 10+ path rounds of 5+ questions, at most a few differ from the building run', pool.length > 20 && long.length >= 10 && cut.length <= Math.max(3, both.length / 10), long.length + ' long; differ: ' + cut.map(id => id + ':' + bldQ[id] + '>' + pathQ[id]).join(', '));
      ok('#634 the body scan (no questions) is not a path mission', !pool.includes('mind-scan'));
      const lg = await p.evaluate(() => { const T = window.TAL; return { inPool: T.dailyPool().filter(id => T.ACT[id].long), long: Object.keys(T.ACT).filter(id => T.ACT[id].long) }; });
      ok('#394 the open-ended long ones (free drawing, a full chess game) are building-only', lg.inPool.length === 0 && lg.long.includes('art-draw') && lg.long.includes('chess-play'), JSON.stringify(lg));
      const ml = await p.evaluate(() => { const O = window.OREN, O4 = window.__oren4; const lv = O.ALLLV.find(l => l.type === 'boss' && l.n > 5);
        O.pathLevel(lv.id); O4.playLevel(lv); const a = O4.play.qs.length; O.showMap(); O4.playLevel(lv); const b = O4.play.qs.length; O.showMap(); return { a, b, n: lv.n }; });
      ok('#634 a math level on the path has its full length, as from the journey', ml.a === ml.n && ml.b === ml.n, JSON.stringify(ml));
      const gm = await p.evaluate(() => { const T = window.TAL, out = {}; ['think-mem', 'think-maze'].forEach(id => { T.S().tl[id] = Object.assign(T.S().tl[id] || {}, { n: 9 }); });
        const size = () => ({ mem: document.querySelectorAll('#sTal .memg > *').length, mz: (document.querySelector('#sTal svg.mz') || { getAttribute: () => '0 0 0' }).getAttribute('viewBox').split(' ')[2] / 10 });
        for (const id of ['think-mem', 'think-maze']) { T.S().daily = { d: window.OREN.today(), t: [id], done: [0], claimed: 0, ch: 'plan', cr: [] }; window.TAL_step(0); out[id + '-path'] = size()[id === 'think-mem' ? 'mem' : 'mz'];
          T.openHub(); T.ACT[id].run(() => T.openHub()); out[id + '-bld'] = size()[id === 'think-mem' ? 'mem' : 'mz']; }
        document.querySelector('#ov').hidden = true; return out; });
      ok('#634 memory and maze have their full size on the path too (8 pairs, 8x8)', gm['think-mem-path'] === 16 && gm['think-mem-bld'] === 16 && gm['think-maze-path'] === 8 && gm['think-maze-bld'] === 8, JSON.stringify(gm));
      // stars, level and progress still work on a short path round
      await p.evaluate(() => { const T = window.TAL; document.querySelector('#ov').hidden = true; delete T.S().tl['world-il']; T.S().daily = { d: window.OREN.today(), t: ['world-il', 'math'], done: [0, 0], claimed: 0, ch: 'plan', cr: [] }; window.__pi = 0; window.TAL_step(0); }); await L.sleep(200);
      for (let n = 0; n < 8 && await p.evaluate(() => document.getElementById('ov').hidden && !!window.__quiz && !!window.__quiz.wrap.isConnected); n++) {
        await p.evaluate(() => { const q = window.__quiz; q.wrap.querySelectorAll('.chs .chb')[q.ans].click(); }); await L.sleep(250); }
      const sr = await p.evaluate(() => { const T = window.TAL; return { tl: T.S().tl['world-il'], done: T.S().daily.done[window.__pi], card: !document.getElementById('ov').hidden }; });
      ok('#394 a path round gives stars, counts the play and marks the mission done', sr.tl && sr.tl.s === 3 && sr.tl.n === 1 && sr.done === 1 && sr.card, JSON.stringify(sr));
      await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.__lessons = true; window.OREN.showMap(); });
    }
    // journey screens: back goes one step up
    const steps = [['journey', 'O.showJourney()', 'sHome'], ['kingdom', 'O.kingdom();setTimeout(()=>{document.querySelector("#ov").hidden=true},30)', 'sHome'], ['arcade', 'window.TAL_arcade(O.showMap)', 'sHome'],
      ['world', 'O.save.story[O.WORLDS[0].id+"-in"]=1;O.showWorld(O.WORLDS[0])', 'sMap']];
    for (const [n, c, to] of steps) {
      await p.evaluate(c => { const O = window.OREN; document.querySelector('#ov').hidden = true; O.showMap(); eval(c); }, c); await L.sleep(150);
      const at = await backAt(); if (at) { await p.mouse.click(at.x, at.y); await L.sleep(150); }
      const s = await screen(); ok('back from ' + n + ' → ' + to, !!at && s === to, (at ? 'landed on ' + s : 'no back control'));
    }
    // a story dialog (first visit of a world) does not cover the back control, and back closes the dialog with the screen
    await p.evaluate(() => { const O = window.OREN; delete O.save.story[O.WORLDS[0].id + '-in']; O.showJourney(); O.showWorld(O.WORLDS[0]); }); await L.sleep(150);
    const dlgOpen = await p.evaluate(() => !document.querySelector('#dlg').hidden);
    const atD = await backAt();
    ok('world story dialog: the back control stays visible above it', dlgOpen && !!atD, 'dialog ' + dlgOpen);
    if (atD) { await p.mouse.click(atD.x, atD.y); await L.sleep(150); }
    ok('back from the story dialog → the journey, dialog closed', (await screen()) === 'sMap' && await p.evaluate(() => document.querySelector('#dlg').hidden));
    // the same with the phone back gesture: the dialog never stays over the next screen
    await p.evaluate(() => { const O = window.OREN; O.showJourney(); O.showWorld(O.WORLDS[0]); }); await L.sleep(150);
    await p.keyboard.press('Shift'); await p.goBack().catch(() => {}); await L.sleep(250);
    ok('phone back during the story dialog → the journey, dialog closed', (await screen()) === 'sMap' && await p.evaluate(() => document.querySelector('#dlg').hidden));
    // phone back gesture: one step back each time, never out of the game
    await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.TAL.openHub(); }); await L.sleep(100);
    await p.evaluate(() => { const T = window.TAL; T.ACT['read-wp'].run(() => T.openHub()); }); await L.sleep(150);
    await p.keyboard.press('Shift'); await p.goBack().catch(() => {}); await L.sleep(250);
    ok('phone back in an activity → the hub', await atHub());
    for (let k = 0; k < 4; k++) { await p.keyboard.press('Shift'); await p.goBack().catch(() => {}); await L.sleep(250); }
    ok('phone back again and again → home, never out of the game', (await screen()) === 'sHome' && p.url().startsWith(L.URL) && await p.evaluate(() => !!window.OREN));
    // a popup with a close button: phone back closes just the popup, the screen stays
    await p.evaluate(() => { document.querySelector('#ov').hidden = true; window.TAL.openHub(); window.TOPIC && window.TOPIC.open ? window.TOPIC.open() : null; }); await L.sleep(150);
    const hasPop = await p.evaluate(() => !document.querySelector('#ov').hidden && !!document.querySelector('#ov .tpx'));
    if (hasPop) { await p.keyboard.press('Shift'); await p.goBack().catch(() => {}); await L.sleep(250); }
    ok('phone back with a popup open closes just the popup', !hasPop || (await p.evaluate(() => document.querySelector('#ov').hidden) && await atHub()), hasPop ? '' : 'no topic popup in this build');
    ok('no page errors (#356 back)', !errs.length, errs.slice(0, 3).join(' | '));
    if (process.env.SHOTDIR356) { const fs = require('fs'), path = require('path'); fs.mkdirSync(process.env.SHOTDIR356, { recursive: true });
      await p.evaluate(() => { const O = window.OREN; delete O.save.story[O.WORLDS[0].id + '-in']; O.showJourney(); O.showWorld(O.WORLDS[0]); }); await L.sleep(300);
      await p.screenshot({ path: path.join(process.env.SHOTDIR356, '1-world-story.png') }); }
    await ctx.close();
  }
  await b.close();
  L.finish('regressions', res);
})().catch(e => { console.log('FAIL crashed — ' + e.message.split('\n')[0]); console.log('RESULT regressions 0 1'); process.exitCode = 1; });
