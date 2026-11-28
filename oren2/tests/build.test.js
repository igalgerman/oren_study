// #64 Building world (spec: oren2/docs/building-world.md): gems build, stars only unlock; one free 8×8 block world replaces the
// kingdom shop; unlock cards; falling sand/water; area arrows; save.bw (newer copy wins in mergeIn); old save.k refunded once;
// parent play never writes the kid's world; the parent day tab shows a picture only when he built something; no overflow.
const L = require('./lib');
const { chromium } = require('playwright'); const sleep = L.sleep;
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const NIK = /[ְ-ׇּׁׂ]/;
const shots = !!process.env.SHOTS;
(async () => {
  const b = await chromium.launch(); const errs = [];
  const open = async (vp, init) => { const ctx = await b.newContext(vp);
    await ctx.addInitScript(s => { try { localStorage.clear(); if (s) localStorage.setItem('oren4-v1', s); } catch (e) {} window.__fast = true; window.__noFamily = true; }, init || null);
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.goto(L.URL); await L.noCoach(p);
    await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; });
    return p; };
  const W = p => p.evaluate(() => JSON.parse(JSON.stringify(window.OREN.save.bw || null)));
  const cell = (p, x, y) => p.locator(`#sKing .bwc[data-x="${x}"][data-y="${y}"]`);
  const pick = (p, id) => p.locator(`#sKing .bwb[data-b="${id}"]`).click();
  const shot = (p, n) => shots ? L.shot(p, { path: L.SHOTDIR + '/build-' + n + '.png' }) : null;
  const parentDay = async p => { await p.evaluate(() => window.TAL.parentPanel('day')); await sleep(150);
    if (await p.locator('#pw1').count()) { await p.fill('#pw1', 'sod1234'); if (await p.locator('#pw2').count()) await p.fill('#pw2', 'sod1234'); await p.keyboard.press('Enter'); await sleep(300); } };
  const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  for (const [tag, vp] of [['desktop', { viewport: { width: 1366, height: 768 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
    const p = await open(vp);
    // ---------- a new world ----------
    await p.evaluate(() => { const O = window.OREN; O.save.gems = 10; O.kingdom(); }); await sleep(150);
    const g = await p.evaluate(() => ({ cells: document.querySelectorAll('#sKing .bwc').length, bar: [...document.querySelectorAll('#sKing .bwb')].map(x => x.dataset.b),
      shop: document.querySelectorAll('#sKing .shop,#sKing .kgrid,#sKing .ktop').length, kmine: document.querySelectorAll('#sKing .kmine').length,
      cw: Math.min(...[...document.querySelectorAll('#sKing .bwc')].map(c => c.getBoundingClientRect().width)), arrows: document.querySelectorAll('#sKing .bwarr').length,
      hint: (document.querySelector('#sKing .bwhint') || {}).textContent || '', next: (document.querySelector('#sKing .bwnext') || {}).textContent || '' }));
    ok(tag + ': one 8×8 world, no shop / old grid / castle strip; my hero + badges row stays', g.cells === 64 && g.shop === 0 && g.kmine === 1, JSON.stringify(g));
    ok(tag + ': cells at least 44 px', g.cw >= 43.5, String(g.cw));
    ok(tag + ': only the unlocked blocks in the bar (no flower at 0 stars)', g.bar.length === 4 && ['grass', 'dirt', 'wood', 'stone'].every(x => g.bar.includes(x)) && !g.bar.includes('flower'), g.bar.join());
    ok(tag + ': no area arrow while only the meadow is open', g.arrows === 0);
    ok(tag + ': first-visit hint + next-unlock line (Hebrew with nikud)', NIK.test(g.hint) && /3/.test(g.next) && NIK.test(g.next), g.hint + ' | ' + g.next);
    let w = await W(p);
    ok(tag + ': starter ground = grass row 6, dirt row 7', w && w.a.meadow['0,6'] === 'grass' && w.a.meadow['7,7'] === 'dirt' && Object.keys(w.a.meadow).length === 16, JSON.stringify(w && w.a));
    await shot(p, tag + '-empty');
    // ---------- place / remove / not enough gems ----------
    await pick(p, 'wood'); await cell(p, 2, 1).click(); await sleep(50);
    w = await W(p); let gems = await p.evaluate(() => window.OREN.save.gems);
    ok(tag + ': tap an empty cell places the block (it stays: wood does not fall) and pays its gems', w.a.meadow['2,1'] === 'wood' && gems === 8, gems + ' ' + JSON.stringify(w.a.meadow));
    ok(tag + ': the first-visit hint goes after the first block', await p.locator('#sKing .bwhint').count() === 0 && w.first === 1);
    await cell(p, 2, 1).click(); await sleep(50);
    w = await W(p); gems = await p.evaluate(() => window.OREN.save.gems);
    ok(tag + ': tap a filled cell removes it and gives the gems back', !w.a.meadow['2,1'] && gems === 10, String(gems));
    await p.evaluate(() => { window.OREN.save.gems = 1; }); await pick(p, 'wood'); await cell(p, 4, 2).click(); await sleep(30);
    w = await W(p); gems = await p.evaluate(() => window.OREN.save.gems);
    ok(tag + ': not enough gems: nothing placed, the cell shakes', !w.a.meadow['4,2'] && gems === 1 && await cell(p, 4, 2).evaluate(e => e.classList.contains('shake')));
    // ---------- stars unlock (cards once, newest selected), area arrow, falling ----------
    await p.evaluate(() => { const O = window.OREN, T = window.TAL; T.S().tl = { 'x-test': { s: 40, n: 1 } }; O.save.gems = 100; O.kingdom(); }); await sleep(150);
    const cards = []; for (let k = 0; k < 12 && await p.locator('#ov .bwcard').count(); k++) { cards.push(await p.locator('#ov .bwcard').getAttribute('data-u')); if (k === 0) await shot(p, tag + '-unlock'); await p.locator('#ov .bwcard .bigbtn').click(); await sleep(60); }
    ok(tag + ': 40 stars: one card per new block / area, one after another', ['flower', 'leaves', 'glass', 'door', 'roof', 'water', 'sand', 'beach'].every(x => cards.includes(x)) && cards.length === 8, cards.join());
    const card1 = await p.evaluate(() => document.querySelector('#sKing .bwb.sel') && document.querySelector('#sKing .bwb.sel').dataset.b);
    ok(tag + ': the newest block is selected after the cards', card1 === 'sand', card1);
    w = await W(p); ok(tag + ': cards saved as seen', ['flower', 'sand', 'beach'].every(x => w.seen.includes(x)));
    await p.evaluate(() => window.OREN.kingdom()); await sleep(100);
    ok(tag + ': a card is shown only once', await p.locator('#ov .bwcard').count() === 0);
    ok(tag + ': stars are not spent', await p.evaluate(() => window.TAL.S().tl['x-test'].s === 40 && window.OREN.save.gems === 100));
    ok(tag + ': area arrow once the beach is open', await p.locator('#sKing .bwarr').count() === 1);
    await pick(p, 'sand'); await cell(p, 3, 0).click(); await sleep(50);
    await pick(p, 'water'); await cell(p, 3, 0).click(); await sleep(50);
    w = await W(p); gems = await p.evaluate(() => window.OREN.save.gems);
    ok(tag + ': sand and water fall to the lowest empty cell of the column', w.a.meadow['3,5'] === 'sand' && w.a.meadow['3,4'] === 'water' && !w.a.meadow['3,0'] && gems === 96, JSON.stringify(w.a.meadow) + ' ' + gems);
    await pick(p, 'glass'); await cell(p, 5, 3).click(); await pick(p, 'flower'); await cell(p, 6, 5).click(); await sleep(50);
    await shot(p, tag + '-built');
    await p.locator('#sKing .bwarr').click(); await sleep(100);
    w = await W(p); ok(tag + ': ▶ opens the beach with a sand ground', !!w.a.beach && w.a.beach['0,6'] === 'sand' && await p.locator('#sKing .bwgrid.bw-beach').count() === 1, JSON.stringify(Object.keys(w.a)));
    await shot(p, tag + '-beach');
    ok(tag + ': no horizontal overflow', await noOverflow(p));
    // ---------- parent play never writes the kid's world ----------
    const before = JSON.stringify(await W(p));
    await p.evaluate(() => { window.OREN.parentPlay(true, true); window.OREN.kingdom(); }); await sleep(100);
    const pw = await W(p); await pick(p, 'wood'); await cell(p, 1, 1).click(); await sleep(30);
    await p.evaluate(() => window.OREN.parentPlay(false)); await sleep(50);
    ok(tag + ': parent play starts an empty world and never writes the kid\'s world', pw && Object.keys(pw.a.meadow).length === 16 && JSON.stringify(await W(p)) === before);
    // ---------- #679 show Dad or Mom: one button, appears in the parent panel, a heart goes back to his device ----------
    await p.evaluate(() => { const O = window.OREN; O.save.set = O.save.set || {}; delete O.save.set.show; O.save.gems = 50; O.kingdom(); }); await sleep(100);
    await pick(p, 'wood'); await cell(p, 5, 2).click(); await sleep(30);
    const sb = await p.evaluate(() => [...document.querySelectorAll('#sKing .bwshow')].map(e => e.textContent));
    ok(tag + ': #679 one "show Dad or Mom" button after building, Hebrew with nikud', sb.length === 1 && NIK.test(sb[0]), sb.join());
    await shot(p, tag + '-show');
    await p.locator('#sKing .bwshow').click(); await sleep(80);
    let sh = await p.evaluate(() => (window.OREN.save.set || {}).show || []);
    ok(tag + ': #679 the creation is saved for the parent (set.show) and the button says it was sent', sh.length === 1 && sh[0].a['5,2'] === 'wood' && await p.locator('#sKing .bwshow.sent').count() === 1, JSON.stringify(sh).slice(0, 120));
    for (let k = 0; k < 7; k++) await p.evaluate(() => window.BW.show());
    sh = await p.evaluate(() => window.OREN.save.set.show);
    ok(tag + ': #679 caps: at most 5 saved creations, each under 1500 bytes', sh.length === 5 && sh.every(x => JSON.stringify(x).length <= 1500), sh.length + ' ' + Math.max(...sh.map(x => JSON.stringify(x).length)));
    await parentDay(p);
    ok(tag + ': #679 the parent day tab shows what he showed (3 newest) with a heart and a well-done button', await p.locator('#sPar .bwshow-row').count() === 3 && await p.locator('#sPar .bwshow-row').first().locator('.bwrb').count() === 2);
    if (shots) await L.shot(p, { path: L.SHOTDIR + '/build-' + tag + '-parentshow.png', fullPage: true });
    await p.locator('#sPar .bwshow-row').first().locator('.bwrb').first().click(); await sleep(80);
    const rem = await p.evaluate(() => window.OREN.save.set.rem);
    ok(tag + ': #679 the heart is a ready message only for his device (to kid), spoken text with nikud', rem && rem.k === 'msg' && rem.to === 'kid' && rem.x === 'אוֹהֲבִים אוֹתְךָ!', JSON.stringify(rem));
    ok(tag + ': #679 the answered creation shows "sent", no second tap', await p.locator('#sPar .bwshow-row').first().locator('.bwrb').count() === 0);
    ok(tag + ': #679 every new kid line is in the pregen list', await p.evaluate(() => { const l = window.BW.speakList(); return l.some(x => /לְאַבָּא/.test(x)) && l.length > 0; }));
    // ---------- parent day tab: a picture of what he built ----------
    await parentDay(p);
    const pic = await p.evaluate(() => { const e = document.querySelector('#sPar .bwpic'); return e ? { svg: !!e.querySelector('svg'), btn: e.querySelectorAll('button,input,select').length, txt: e.textContent.trim() } : null; });
    ok(tag + ': parent day tab shows one picture, no buttons, caption "מה אורן בנה"', pic && pic.svg && !pic.btn && pic.txt === 'מה אורן בנה', JSON.stringify(pic));
    if (shots) await L.shot(p, { path: L.SHOTDIR + '/build-' + tag + '-parent.png', fullPage: true });
    ok(tag + ': no horizontal overflow (parent)', await noOverflow(p));
    await p.context().close();
  }

  { // nothing built yet: no parent picture
    const p = await open({ viewport: { width: 1366, height: 768 } });
    await p.evaluate(() => window.OREN.kingdom()); await sleep(100);
    await parentDay(p);
    ok('parent day tab: no picture while only the starter ground is there', await p.locator('#sPar .bwpic').count() === 0);
    // the area arrow is hidden until another area unlocks; a sheep is a block too
    await p.evaluate(() => { const O = window.OREN; O.save.gems = 50; window.TAL.S().tl = { a: { s: 60 } }; window.OREN.save.bw.seen = window.BW.BLOCKS.map(x => x.id).concat(window.BW.AREAS.map(x => x.id)); O.kingdom(); }); await sleep(100);
    await pick(p, 'sheep'); await cell(p, 4, 5).click(); await sleep(30);
    const sx = m => Object.keys(m).filter(k => m[k] === 'sheep').map(k => k.split(',').map(Number));
    const s0 = sx((await W(p)).a.meadow);
    ok('sheep placed (10 gems)', s0.length === 1 && s0[0][1] === 5 && await p.evaluate(() => window.OREN.save.gems === 40), JSON.stringify(s0));
    await p.evaluate(() => window.BW.tick()); const s1 = sx((await W(p)).a.meadow);
    ok('the sheep steps one cell left or right on its ground', s1.length === 1 && s1[0][1] === 5 && Math.abs(s1[0][0] - s0[0][0]) === 1, JSON.stringify([s0, s1]));
    // mergeIn: newer copy wins, an older one does not overwrite
    const m = await p.evaluate(() => { const O = window.OREN; O.save.t = 1000; O.save.bw = { a: { meadow: { '0,0': 'wood' } }, seen: [], first: 1 };
      O.mergeIn({ t: 500, bw: { a: { meadow: { '1,1': 'stone' } }, seen: [], first: 1 } }); const older = JSON.stringify(O.save.bw.a);
      O.mergeIn({ t: 2000, bw: { a: { meadow: { '2,2': 'glass' } }, seen: ['glass'], first: 1 } }); return { older, newer: JSON.stringify(O.save.bw.a) }; });
    ok('bw: an older copy does not overwrite, a newer copy wins (mergeIn)', /0,0/.test(m.older) && !/1,1/.test(m.older) && /2,2/.test(m.newer) && !/0,0/.test(m.newer), JSON.stringify(m));
    // kid text: every spoken line has nikud
    const sl = await p.evaluate(() => window.BW.speakList());
    ok('speakList: block names, area names, cards, hints (all with nikud)', sl.length >= 30 && sl.every(s => NIK.test(s)) && sl.some(s => /זְכוּכִית/.test(s)) && sl.some(s => /חֲסֵרִים יַהֲלוֹמִים/.test(s)), sl.filter(s => !NIK.test(s)).join(' | '));
    await p.context().close();
  }

  { // old kingdom items: the gems come back once, save.k is cleared
    const old = JSON.stringify({ v: 4, t: 1, s: {}, m: {}, seen: {}, story: { intro: 1 }, rq: [], days: [], gems: 3, av: { hair: 'lightbrown', skin: 'light', shirt: 'black', pants: 'olive', hat: 'none', pet: 'cat' }, owned: { none: 1, cap: 1 }, k: { '0,0': 'flower', '3,2': 'rainbow' }, tc: [], sp: {}, made: {} });
    const p = await open({ viewport: { width: 1366, height: 768 } }, old);
    const r1 = await p.evaluate(() => { const O = window.OREN; O.kingdom(); return { g: O.save.gems, k: Object.keys(O.save.k || {}).length, bw: !!O.save.bw }; });
    const r2 = await p.evaluate(() => { const O = window.OREN; O.save.k = { '1,1': 'flower' }; O.kingdom(); return O.save.gems; });
    ok('old kingdom items: their gems come back once (5 + 100), save.k cleared', r1.g === 108 && r1.k === 0 && r1.bw && r2 === 108, JSON.stringify(r1) + ' ' + r2);
    await p.context().close();
  }
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close(); L.finish('build', res);
})().catch(e => { console.error(e); process.exit(1); });
