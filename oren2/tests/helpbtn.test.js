// #54 one help button on every question, in every pack: tap 1 = a small clue, tap 2 = the answer with a short explanation;
// after 2 wrong answers the help comes by itself. Walks every Talents City activity + the math levels.
const L = require('./lib.js'); const { chromium } = require('playwright');
const NIK = /[ְ-ׇּׁׂ]/, HEB = /[א-ת]/;
const heNik = t => HEB.test(t) && NIK.test(t);
// activities that must reach a question screen (a sample from every pack; the walk below checks ALL that have one)
const MUST = ['read-first', 'read-wp', 'read-sent', 'read-sound', 'read-build', 'read-rc', 'read-nik', 'write-mix', 'write-spell',
  'world-flag', 'mus-notes', 'mus2-read', 'sci-float', 'sci-animals', 'think-pat', 'think-ana', 'ln-math', 'chess-board', 'chess-mate', 'chess-capture', 'chess-check',
  'eng-voc', 'eng-read', 'sky-sun', 'nat-home', 'map-read', 'his-then', 'yr-gk', 'blk-count'];

// a test gives no right/wrong feedback (every pick goes to the next question): no 'after 2 wrong' there
const NOFEED = ['think-test'];

(async () => {
  const res = []; const ok = (c, m) => res.push((c ? 'PASS ' : 'FAIL ') + m);
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT);
  await ctx.addInitScript(() => { window.__noFamily = true; window.__fast = true; try { localStorage.clear(); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await L.noCoach(p);

  /* 1. the fixed texts: Hebrew with nikud, and pregen collects them */
  const tx = await p.evaluate(() => window.HELP && window.HELP.allTexts ? window.HELP.allTexts() : []);
  ok(tx.length >= 5 && tx.every(heNik), 'help button texts are Hebrew with nikud: ' + tx.filter(t => !heNik(t)).join(' | '));
  const pre = require('fs').readFileSync(require('path').join(L.ROOT, 'cf/tools/pregen.js'), 'utf8');
  ok(/HELP\.allTexts\(\)/.test(pre), 'pregen collects HELP.allTexts()');

  /* 2. every activity: get to its question screen (past lesson cards), then the help button */
  const state = () => p.evaluate(() => { const s = document.querySelector('#sTal'), vis = e => !!(e && e.offsetParent);
    const chb = [...s.querySelectorAll('.chs .chb')].filter(vis).length, board = !!s.querySelector('.czb') && !!s.querySelector('.helpq,.prq');
    const hb = [...document.querySelectorAll('.helpbtn')].filter(vis);
    return { q: chb >= 2 || (board && !!s.querySelector('.helpq')), chb, help: hb.length, ov: !document.querySelector('#ov').hidden }; });
  const open = async id => { await p.evaluate(id => { document.querySelector('#ov').hidden = true; window.TAL.ACT[id].run(() => {}); }, id); await L.sleep(60);
    for (let k = 0; k < 8; k++) { const st = await state(); if (st.q || st.ov) return st;
      const clicked = await p.evaluate(() => { const vis = x => x.offsetParent && !x.disabled && !x.closest('.helpq'), one = [...document.querySelectorAll('#sTal .chs .chb')].filter(vis);
        const b = [...document.querySelectorAll('#sTal .bigbtn')].find(vis) || (one.length === 1 ? one[0] : null);   /* lesson cards: 'next' / a single 'got it' */ if (b) { b.click(); return true; } return false; });
      if (!clicked) return st; await L.sleep(80); }
    return state(); };
  await p.evaluate(() => { window.TAL.S().set.thTest = 1; });   // the timed thinking test is off unless a parent turns it on
  const only = process.env.HB_ONLY ? process.env.HB_ONLY.split(',') : null;   // debugging: HB_ONLY=id1,id2
  const ids = (await p.evaluate(() => Object.keys(window.TAL.ACT))).filter(x => !only || only.includes(x));
  const withQ = [], bad = [];
  for (const id of ids) {
    let st; try { st = await open(id); } catch (e) { bad.push(id + ': ' + e.message.slice(0, 80)); continue; }
    if (!st.q && !MUST.includes(id)) continue;
    if (!st.q) { bad.push(id + ': no question screen'); continue; }
    withQ.push(id);
    if (st.help !== 1) { bad.push(`${id}: ${st.help} help buttons`); continue; }
    const t1 = await p.evaluate(() => { const b = document.querySelector('.helpbtn'); if (!b) return 'NO BUTTON'; b.click(); const x = document.querySelector('.helpbox'); return x && !x.hidden ? x.textContent : ''; });
    await L.sleep(30);
    const t2 = await p.evaluate(() => { const b = document.querySelector('.helpbtn'); if (!b) return { t: 'NO BUTTON ' + document.querySelector('#sTal').textContent.slice(0, 80) }; b.click(); const x = document.querySelector('.helpbox'); return { t: x && !x.hidden ? x.textContent : '', dis: b.disabled,
      shown: !!document.querySelector('#sTal .show, #sTal .good, #sTal .ok, #sTal .hint'), n: document.querySelectorAll('.helpbtn').length }; });
    if (!heNik(t1)) bad.push(`${id}: tap 1 clue "${t1.slice(0, 40)}"`);
    else if (!heNik(t2.t) || t2.t === t1) bad.push(`${id}: tap 2 explanation "${t2.t.slice(0, 40)}"`);
    else if (!t2.shown) bad.push(`${id}: tap 2 does not show the answer`);
    else if (t2.n !== 1) bad.push(`${id}: ${t2.n} help buttons after tap 2`);
    /* after 2 wrong answers the help is offered by itself */
    if (NOFEED.includes(id)) continue;
    const st2 = await open(id);
    if (!st2.q) { bad.push(id + ': no question on the second run'); continue; }
    for (let k = 0; k < 2; k++) await p.evaluate(() => { const w = document.querySelector('.helpq'), h = w && w._help; if (h && h.wrong) { h.wrong(); return; }
      const a = h ? h.ans : -1; const bs = [...document.querySelectorAll('#sTal .chs .chb')]; const x = bs.find((b, i) => i !== a && !b.disabled && b.offsetParent); if (x) x.click(); });
    await L.sleep(60);
    const auto = await p.evaluate(() => { const x = document.querySelector('.helpbox'); return x && !x.hidden ? x.textContent : ''; });
    if (!heNik(auto)) bad.push(`${id}: no help after 2 wrong answers`);
  }
  const miss = MUST.filter(x => !withQ.includes(x));
  ok(withQ.length >= 30 && !miss.length, `question screens found in ${withQ.length} activities` + (miss.length ? ' — missing ' + miss.join(',') : ''));
  ok(!bad.length, 'every question has one help button: clue, then answer + explanation, offered after 2 wrong (' + bad.length + ') ' + bad.slice(0, +(process.env.HB_ALL || 12)).join(' | '));

  /* 3. the math levels (#sPlay) */
  await p.evaluate(() => { document.querySelector('#ov').hidden = true; document.querySelector('#sTal').innerHTML = ''; });   // #424: the last activity's round (its timers) ends here, before the math levels
  const math = await p.evaluate(async () => { const O = window.OREN, G = window.__oren4, out = [], seen = new Set();
    for (const lv of O.ALLLV) { if (lv.type === 'learn' || lv.type === 'boss') continue; const q0 = lv.gen(0); const k = q0.k + (q0.k === 'bin' ? q0.op : ''); if (seen.has(k)) continue; seen.add(k);
      try { G.playLevel(lv); } catch (e) { out.push(lv.id + ' ERR ' + e.message); continue; } await new Promise(r => setTimeout(r, 40));
      const s = document.querySelector('#sPlay'), hb = [...s.querySelectorAll('.helpbtn')].filter(e => e.offsetParent);
      if (hb.length !== 1) { out.push(`${lv.id} (${k}): ${hb.length} help buttons`); continue; }
      hb[0].click(); const x = s.querySelector('.helpbox'); const t1 = x && !x.hidden ? x.textContent : '';
      hb[0].click(); const t2 = x && !x.hidden ? x.textContent : '';
      const shown = !!s.querySelector('.ans.show, .chb.show, .bubb.pop, .helpbox .hq-a');
      if (!t1 || !t2 || t1 === t2 || !shown) out.push(`${lv.id} (${k}): clue "${t1.slice(0, 30)}" answer "${t2.slice(0, 30)}" shown=${shown}`); }
    return { out, n: seen.size }; });
  ok(math.n >= 5 && !math.out.length, `math questions (${math.n} kinds): one help button, clue then answer ` + math.out.slice(0, 6).join(' | '));
  const ans = await p.evaluate(async () => { const O = window.OREN, G = window.__oren4; const lv = O.ALLLV.find(l => l.type !== 'learn' && l.type !== 'boss' && l.gen(0).k === 'bin');
    G.playLevel(lv); await new Promise(r => setTimeout(r, 40)); const pl = G.play; window.HELP.stop(); pl.help = false;   // the ladder off: the button itself must offer the help
    const q = pl.qs[pl.i]; return q.ans != null ? q.ans : q.res; });
  for (let k = 0; k < 2; k++) { await p.keyboard.type(String(ans + 1)); await p.keyboard.press('Enter'); await L.sleep(700); }
  const mathAuto = await p.evaluate(() => { const x = document.querySelector('#sPlay .helpbox'); return x && !x.hidden ? x.textContent : ''; });
  ok(heNik(mathAuto), 'math: after 2 wrong answers the help comes by itself: ' + mathAuto.slice(0, 50));
  ok(!errs.length, 'no page errors ' + errs.slice(0, 3).join(' | '));
  await b.close(); L.finish('helpbtn', res);
})();
