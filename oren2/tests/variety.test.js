// #358 variety rule for the day's missions: the same activity never twice in a row, the same topic never more than 2 in a row,
// the same activity at most 2 a day (all stories count as one activity "story"); it repeats only when nothing else is available.
// A full day (12+ missions: first path + "another small path" rounds) with a fresh save and with saves where one bank is all new.
// Usage: node tests/variety.test.js [desktop|phone]
const L = require('./lib');
const { chromium } = require('playwright');
(async () => {
  const out = []; const ok = (c, m, info) => out.push((c ? 'PASS ' : 'FAIL ') + m + (c || info == null ? '' : ' — ' + info));
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch (e) {} window.__fast = true; window.__noFamily = true; });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(L.URL); await L.noCoach(page);

  /* one simulated day: Oren picks a domain (the list repeats), plays the whole path, asks for another small path, ... until n missions */
  const day = (doms, n, setup) => page.evaluate(({ doms, n, setup }) => {
    const T = window.TAL, O = window.OREN; const S0 = T.S(); delete S0.daily; S0.tl = {}; O.save.lrn = null; S0.set.noDaily = 0;
    if (setup) (new Function('T', 'O', setup))(T, O);
    const days = [];
    for (let r = 0; r < 12 && T.dailyEnsure().t.length < n; r++) {
      const d = T.dailyEnsure(); const dm = doms[r % doms.length];
      if (dm === 'cont') T.chooseDay('readg', 'story-3'); else T.chooseDay(dm);
      d.done = d.t.map(() => 1); d.bs = d.t.length; d.ch = null; d.free = 0;   /* path done → "another small path" (FR.bonus) */
    }
    return T.dailyEnsure().t.slice();
  }, { doms, n, setup });
  const kind = id => /^story-/.test(id) ? 'story' : id;
  const topic = await page.evaluate(() => { const T = window.TAL, m = {}; Object.keys(T.ACT).forEach(id => { m[id] = T.ACT[id].b.id; }); return m; });
  const top = id => id === 'math' || /^ln-/.test(id) ? 'math' : topic[id] || String(id).split(':')[0];
  const check = t => { const bad = [];
    t.forEach((id, i) => { if (i && kind(t[i - 1]) === kind(id)) bad.push(`twice in a row: ${t[i - 1]},${id} @${i}`);
      if (i >= 2 && top(t[i - 2]) === top(id) && top(t[i - 1]) === top(id)) bad.push(`topic ${top(id)} 3 in a row @${i}`); });
    const cnt = {}; t.forEach(id => { cnt[kind(id)] = (cnt[kind(id)] || 0) + 1; }); for (const k in cnt) if (cnt[k] > 2) bad.push(`${k} ${cnt[k]} times`);
    return bad; };
  const run = async (name, doms, setup) => { for (let k = 0; k < 3; k++) { const t = await day(doms, 12, setup); const bad = check(t);
      if (t.length < 12 || bad.length) { ok(false, name, `${t.length} missions: ${t.join(' ')} | ${bad.join('; ')}`); return; } }
    ok(true, name + ' (3 simulated days of 12+ missions)'); };

  /* fresh save */
  await run('fresh save, Oren always picks reading: varied missions', ['readg']);
  await run('fresh save, Oren picks the story building again and again', ['b:stories']);
  await run('fresh save, "continue where I stopped" on a story, then reading', ['cont', 'readg']);
  await run('fresh save, math every time', ['math']);
  await run('fresh save, a mix of domains', ['readg', 'math', 'explore', 'create', 'b:stories', 'calm']);
  /* one bank all new, everything else already played and strong (the engine prefers what is new) */
  const strongBut = re => `Object.keys(T.ACT).forEach(id=>{if(!${re}.test(id)){T.S().tl[id]={n:6,s:3};window.LEARN.noteAct(id,3);window.LEARN.noteAct(id,3);}});`;
  await run('stories all new, the rest strong', ['readg', 'b:stories', 'readg'], strongBut('/^story-/'));
  await run('sentences all new, the rest strong', ['readg', 'b:read'], strongBut('/^read-sent$/'));
  await run('math all new, the rest strong', ['math', 'readg', 'math'], strongBut('/^ln-math$/'));
  await run('explore facts all new, the rest strong', ['explore', 'b:world'], strongBut('/^(world|map|his|yr)-/'));

  /* nothing else available: only the stories building is on → still a path (repeats only then) */
  const only = await page.evaluate(() => { const T = window.TAL, O = window.OREN; const S0 = T.S(); delete S0.daily; const st = S0.set; const keep = { hide: Object.assign({}, st.hide), offW: Object.assign({}, st.offW) };
    T.BUILD.forEach(bb => { if (bb.id !== 'stories') st.hide[bb.id] = 1; }); O.WORLDS.forEach(w => { st.offW[w.id] = 1; });
    T.chooseDay('b:stories'); const t = T.dailyEnsure().t.slice(); st.hide = keep.hide; st.offW = keep.offW; delete S0.daily; return t; });
  ok(only.length >= 3 && only.every(x => /^story-/.test(x)), 'only stories on: the path still has stories (repeat only when nothing else)', only.join(' '));

  /* Oren can still open any story himself from its building, after 2 stories today */
  const self = await page.evaluate(() => { const T = window.TAL; const S0 = T.S(); delete S0.daily; T.chooseDay('b:stories');
    const b = T.BUILD.find(x => x.id === 'stories'); T.openBuilding ? T.openBuilding(b) : null; return { acts: b.acts.length, cards: document.querySelectorAll('#sTal .acts .actc').length }; });
  ok(self.cards >= 3, 'the stories building still lists the stories (the rule is only for the missions)', JSON.stringify(self));

  ok(!errs.length, 'no page errors', errs.join(' | '));
  await b.close(); L.finish('variety', out);
})();
