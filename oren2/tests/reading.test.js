// Reading mode: 🔊 on readable text, word-by-word highlighting, try-first auto-read, levels, parent setting.
// Speech is a stub that fires start / word boundaries / end, so the test is deterministic.
const { chromium } = require('playwright');
const L = require('./lib.js');
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const STUB = () => {
  window.__fast = false; window.__noFamily = true;
  try { localStorage.clear(); } catch (e) {}
  window.__spoken = []; window.__hl = [];
  let cur = null;
  const fire = (u, type, extra) => { const e = new SpeechSynthesisEvent(type, Object.assign({ utterance: u }, extra || {})); u.dispatchEvent(e); };
  const stub = {
    speaking: false, pending: false, paused: false, onvoiceschanged: null,
    getVoices: () => [],
    cancel() { if (cur) { const u = cur; cur = null; fire(u, 'end'); } },
    speak(u) {
      cur = u; window.__spoken.push(u.text);
      const starts = []; u.text.replace(/\S+/g, (m, o) => { starts.push(o); return m; });
      setTimeout(() => { if (cur !== u) return; fire(u, 'start');
        starts.forEach((ci, k) => setTimeout(() => { if (cur !== u) return; fire(u, 'boundary', { charIndex: ci, name: 'word' });
          /* sample right after the event, not on a later timer: under load a timer can run after the next word lit up */
          window.__hl.push([...document.querySelectorAll('.reading .rw')].findIndex(w => w.classList.contains('on'))); }, 40 * (k + 1)));
        setTimeout(() => { if (cur === u) { cur = null; fire(u, 'end'); } }, 40 * (starts.length + 2));
      }, 20);
    }
  };
  window.__busy = () => !!cur;
  Object.defineProperty(window, 'speechSynthesis', { value: stub, configurable: true });
};
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(L.VIEWPORT); await ctx.addInitScript(STUB);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(L.URL); await L.noCoach(p);
  await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; });
  // 1. 🔊 on quiz question + sentence, cue at level 1
  await p.evaluate(() => window.TAL.ACT['read-sent'].run(() => {}));
  await p.waitForSelector('.tqc .qq .rdb');
  ok('🔊 on quiz question and sentence', await p.evaluate(() => !!document.querySelector('.tqc .qq .rdb') && !!document.querySelector('.tqc .sent .rdb')));
  ok('try-to-read cue at level 1', await p.locator('.rdcue').count() === 1);
  // 2. pressing 🔊 speaks the vocalized text (as full spelling) and lights the words in order, then clears
  /* the question is also read once by itself when the screen settles: let that reading finish before pressing 🔊, or the two overlap */
  await p.waitForFunction(() => window.__spoken.length >= 1 && !window.__busy(), null, { timeout: 8000 }).catch(() => {}); await L.sleep(150);
  await p.waitForFunction(() => !window.__busy(), null, { timeout: 3000 }).catch(() => {});
  await p.evaluate(() => { window.TAL.S().set.rdMode = 3; window.__hl = []; window.__spoken = []; document.querySelector('.tqc .qq .rdb').click(); });   /* level 3: no auto-read can cut in on the button's reading */
  await p.waitForFunction(() => window.__spoken.length >= 1);
  const sent = await p.evaluate(() => window.__spoken[0]);
  const words = await p.evaluate(() => [...document.querySelectorAll('.tqc .qq .rw')].map(w => w.textContent).join(' '));
  const expect = await p.evaluate(w => window.__fullSpell(w), words);
  ok('speaks the question text (full spelling of the vocalized words)', sent === expect, JSON.stringify([sent, expect]));
  await p.waitForFunction(() => !document.querySelector('.reading'), null, { timeout: 5000 });
  const hl = await p.evaluate(() => window.__hl);
  ok('words light up in order', hl.length > 1 && hl.every((v, k) => v === k), JSON.stringify(hl));
  ok('highlight cleared at the end', await p.evaluate(() => document.querySelectorAll('.rw.on').length === 0));
  // 3. level 1 reads by itself after the pause
  await p.evaluate(() => { window.TAL.S().set.rdMode = 'auto'; });
  await p.evaluate(() => { window.__spoken = []; window.TAL.ACT['read-sent'].run(() => {}); });
  /* the instruction may be said at once; the sentence to read is said only after the wait */
  const sentSaid = () => p.evaluate(() => { const e = document.querySelector('#sTal .tqc .sent'); if (!e) return -1;
    /* compare letters only (no niqqud, punctuation or ו/י): the spoken text uses full spelling, the screen text uses the spelling with vowel marks */
    const N = t => t.replace(/[֑-ׇ]/g, '').replace(/[^א-ת]/g, '').replace(/[וי]/g, '');
    const w = N(window.TAL.plainHe(e.textContent).replace(/🔊/g, '').trim().split(/\s+/).slice(0, 2).join(' '));
    return window.__spoken.filter(t => N(t).startsWith(w)).length; });
  await L.sleep(1500); const early = await sentSaid();
  let late = await sentSaid(); for (let k = 0; k < 40 && late < 1; k++) { await L.sleep(250); late = await sentSaid(); }   /* wait for the condition (max 10 s), not a fixed sleep */
  ok('level 1: waits, then reads by itself', early === 0 && late >= 1, `${early} → ${late}` + (late < 1 ? ' ' + JSON.stringify(await p.evaluate(() => ({ s: window.__spoken, mode: window.TAL.S().set.rdMode, rd: window.TAL.S().rd, sent: (document.querySelector('#sTal .tqc .sent') || {}).textContent }))) : ''));
  // 4. level 3 never reads by itself
  await p.evaluate(() => { window.TAL.S().set.rdMode = 3; window.__spoken = []; window.TAL.ACT['read-sent'].run(() => {}); });
  await L.sleep(4000);
  ok('level 3: no auto-read, no cue', await sentSaid() === 0 && await p.evaluate(() => !document.querySelector('.rdcue')));
  // 5. answering correctly without hearing counts as "solo" and moves him up a level
  await p.evaluate(() => { const T = window.TAL; T.S().set.rdMode = 'auto'; T.S().rd = { lvl: 1, solo: 24 }; T.ACT['read-sent'].run(() => {}); });
  await p.waitForSelector('.tqc .qq .rdb');
  await p.evaluate(() => { const q = window.__quiz; q.wrap.querySelector('.chs').children[q.ans].click(); });
  const rd = await p.evaluate(() => window.TAL.S().rd);
  ok('solo answer counted, level goes up 1 → 2', rd.solo === 25 && rd.lvl === 2, JSON.stringify(rd));
  // after hearing the question, a correct answer is not solo
  await p.evaluate(() => { window.TAL.ACT['read-sent'].run(() => {}); });
  await p.waitForSelector('.tqc .qq .rdb');
  await p.evaluate(() => document.querySelector('.tqc .qq .rdb').click()); await L.sleep(100);
  await p.evaluate(() => { const q = window.__quiz; q.wrap.querySelector('.chs').children[q.ans].click(); });
  ok('heard first → not solo', await p.evaluate(() => window.TAL.S().rd.solo === 25));
  // 6. stories: 🔊 on every line; "read to me" reads line by line
  await p.evaluate(() => window.TAL.ACT['story-0'].run(() => {}));
  await p.waitForSelector('.sl .rdb');
  ok('🔊 on every story line', await p.evaluate(() => document.querySelectorAll('.sl').length === document.querySelectorAll('.sl .rdb').length));
  await p.evaluate(() => { window.__spoken = []; [...document.querySelectorAll('#sTal .bigbtn')].find(x => x.textContent.includes('הַקְרֵא')).click(); });
  await p.waitForFunction(() => window.__spoken.length >= 2, null, { timeout: 8000 });
  ok('"read to me" goes line by line', await p.evaluate(() => window.__spoken.length >= 2));
  // 7. home bubble has 🔊
  await p.evaluate(() => window.OREN.showMap()); await L.sleep(400);
  ok('🔊 on the home bubble', await p.locator('#sHome .hbub2 .rdb').count() === 1);
  // 8. parent setting: one place, sets the level
  await p.evaluate(() => window.TAL.parentPanel('day')); await L.sleep(300);
  await p.locator('#sPar .pchip', { hasText: 'קורא לבד' }).click(); await L.sleep(200);
  ok('parent sets level 3', await p.evaluate(() => window.TAL.S().set.rdMode === 3 && window.__rd.level() === 3));
  await p.locator('#sPar .pchip', { hasText: 'אוטומטי' }).click(); await L.sleep(200);
  ok('parent back to automatic', await p.evaluate(() => window.__rd.mode() === 'auto'));
  ok('no JS errors', !errs.length, errs.slice(0, 3).join(' | '));
  L.finish('reading', res); await b.close();
})();
