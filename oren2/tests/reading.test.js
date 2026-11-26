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
  await p.waitForFunction(() => !(window.OREN.tapTooSoon && window.OREN.tapTooSoon()), null, { polling: 50 }); await p.evaluate(() => { const q = window.__quiz; q.wrap.querySelector('.chs').children[q.ans].click(); });   /* #436: taps in the first 400 ms of a new question are ignored */
  const rd = await p.evaluate(() => window.TAL.S().rd);
  ok('solo answer counted, level goes up 1 → 2', rd.solo === 25 && rd.lvl === 2, JSON.stringify(rd));
  // after hearing the question, a correct answer is not solo
  await p.evaluate(() => { window.TAL.ACT['read-sent'].run(() => {}); });
  await p.waitForSelector('.tqc .qq .rdb');
  await p.evaluate(() => document.querySelector('.tqc .qq .rdb').click()); await L.sleep(100);
  await p.waitForFunction(() => !(window.OREN.tapTooSoon && window.OREN.tapTooSoon()), null, { polling: 50 }); await p.evaluate(() => { const q = window.__quiz; q.wrap.querySelector('.chs').children[q.ans].click(); });   /* #436: taps in the first 400 ms of a new question are ignored */
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
  await p.evaluate(() => window.TAL.parentPanel('read')); await L.sleep(300);
  await p.locator('#sPar .pchip', { hasText: 'קורא לבד' }).click(); await L.sleep(200);
  ok('parent sets level 3', await p.evaluate(() => window.TAL.S().set.rdMode === 3 && window.__rd.level() === 3));
  await p.locator('#sPar .pchip', { hasText: 'אוטומטי' }).click(); await L.sleep(200);
  ok('parent back to automatic', await p.evaluate(() => window.__rd.mode() === 'auto'));
  ok('no JS errors', !errs.length, errs.slice(0, 3).join(' | '));
  await stories(b);
  L.finish('reading', res); await b.close();
})();

/* ---------- #355 stories: buttons never cover the text, story <-> questions, read first / listen later, day log ---------- */
async function stories(b) {
  const open = async vp => { const ctx = await b.newContext(vp); await ctx.addInitScript(() => { window.__fast = true; window.__noFamily = true; });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(L.URL); await p.evaluate(() => localStorage.clear()); await p.reload(); await L.noCoach(p);
    await p.evaluate(() => { const O = window.OREN, T = window.TAL; O.save.story.intro = 1; T.S().prof = { an: 'cat', col: '#3a8fc4', love: 'art' }; O.persist(); }); return { ctx, p, errs }; };
  /* story k of the bank at a forced story level (null = the real level) */
  const run = (p, k, lv) => p.evaluate(([k, lv]) => { const R = window.READBANK2; R.levelHook = lv ? () => lv : null; window.__rb2run.story(() => {}, k); }, [k, lv]);
  const vis = async p => { await L.sleep(150); return p.evaluate(() => { const pg = [...document.querySelectorAll('#sTal .story')].pop(); const rd = [...document.querySelectorAll('#sTal .strd')].pop();
    const rdb = pg.querySelector('.sl .rdb'); return { line: !!rdb && rdb.offsetParent !== null, all: !!rd && !rd.hidden && rd.offsetParent !== null }; }); };
  const toQ = p => p.evaluate(() => document.querySelector('#sTal .stgo').click());
  /* 100 ms is enough only because this part runs __fast (the 400 ms tap guard is D(400) = 27 ms); without __fast wait 450 ms */
  const wrongTap = async p => { await L.sleep(100); return p.evaluate(() => { const q = window.__quiz; const bs = [...q.wrap.querySelectorAll('.chs .chb')]; const w = bs.find((x, k) => k !== q.ans); w.click(); return bs.indexOf(w); }); };   /* #436: taps in the first 400 ms of a new question are ignored */
  // 1. buttons under the last line, never over the text, before and after scrolling (laptop and phone)
  for (const [nm, vp] of [['1366x768', { viewport: { width: 1366, height: 768 } }], ['390x844', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
    const { ctx, p, errs } = await open(vp);
    const k = await p.evaluate(() => { const S = window.READBANK2.stories; return S.reduce((m, s, i) => s.s.length > S[m].s.length ? i : m, 0); });
    await run(p, k, 1); await p.waitForFunction(() => { const r = document.querySelector('#sTal .strd'); return r && !r.hidden; });
    const overlap = () => p.evaluate(() => { const bs = [...document.querySelectorAll('#sTal .strow .bigbtn')].filter(x => !x.hidden).map(x => x.getBoundingClientRect());
      const ls = [...document.querySelectorAll('#sTal .sl')].map(x => x.getBoundingClientRect());
      const hit = bs.some(a => ls.some(l => a.left < l.right && a.right > l.left && a.top < l.bottom && a.bottom > l.top));
      return { hit, nb: bs.length, below: bs.every(a => a.top >= ls[ls.length - 1].bottom - 1) }; });
    const o1 = await overlap();
    await p.evaluate(() => { const s = document.querySelector('#sTal'); s.scrollTop = s.scrollHeight / 2; window.scrollTo(0, document.body.scrollHeight / 2); }); await L.sleep(100); const o2 = await overlap();
    await p.evaluate(() => { const s = document.querySelector('#sTal'); s.scrollTop = s.scrollHeight; window.scrollTo(0, document.body.scrollHeight); }); await L.sleep(100); const o3 = await overlap();
    ok(`stories ${nm}: the buttons cover no story line, before and after scrolling`, [o1, o2, o3].every(o => !o.hit && o.nb === 2 && o.below), JSON.stringify([o1, o2, o3]));
    ok(`stories ${nm}: no JS errors`, !errs.length, errs.slice(0, 3).join(' | ')); await ctx.close();
  }
  const { ctx, p, errs } = await open(L.VIEWPORT);
  // 2. story -> question 1 -> story -> back to question 1: same question, the wrong answer stays marked
  await run(p, 0, 1); await toQ(p);
  const q0 = await p.evaluate(() => ({ i: window.__quiz.i, t: document.querySelector('#sTal .tqc').textContent }));
  const wi = await wrongTap(p);
  ok('question screen: one "📖 to the story" button', await p.evaluate(() => { const b = document.querySelectorAll('#sTal .qside'); return b.length === 1 && /לַסִּפּוּר/.test(b[0].textContent); }));
  await p.evaluate(() => document.querySelector('#sTal .qside').click());
  const pk = await p.evaluate(() => ({ story: !!document.querySelector('#sTal .stpeek .story .sl'), qHidden: window.__quiz.wrap.hidden, rd: !!document.querySelector('#sTal .stpeek .strd'), back: [...document.querySelectorAll('#sTal .stpeek .stback')].map(x => x.textContent.trim()) }));
  ok('📖 opens the story (text + read to me) with one button back to the question', pk.story && pk.qHidden && pk.rd && pk.back.length === 1 && /לַשְּׁאֵלָה/.test(pk.back[0]), JSON.stringify(pk));
  await p.evaluate(() => document.querySelector('#sTal .stback').click());
  const q1 = await p.evaluate(wi => ({ i: window.__quiz.i, t: document.querySelector('#sTal .tqc').textContent, shown: !window.__quiz.wrap.hidden, peek: !!document.querySelector('.stpeek'),
    bad: window.__quiz.wrap.querySelectorAll('.chs .chb')[wi].classList.contains('bad') && window.__quiz.wrap.querySelectorAll('.chs .chb')[wi].disabled }), wi);
  ok('back to question 1: same question, the answers kept', q1.i === 0 && q0.i === 0 && q1.t === q0.t && q1.shown && !q1.peek && q1.bad, JSON.stringify({ q0, q1 }));
  // 3. read first, listen later: the 3 bands of the one table
  const H = await p.evaluate(() => window.TAL.READ_HELP.map(x => [x.band, x.to, x.line, x.all]));
  ok('one table of read-aloud help: low / mid / top', H.length === 3 && H.map(x => x[0]).join() === 'low,mid,top', JSON.stringify(H));
  const fast = s => Math.ceil(s * 1000 / 15) + 200;   /* D(): __fast runs the clock 15x */
  const band = async (lv, wait) => { await run(p, 0, lv); const a = await vis(p); await L.sleep(wait); const b2 = await vis(p);
    await run(p, 0, lv); await toQ(p); await wrongTap(p); await p.evaluate(() => document.querySelector('#sTal .qside').click()); const c = await vis(p); return [a, b2, c]; };
  const say = await (async () => { await run(p, 0, 1); return p.evaluate(() => ({ now: window.OREN.sayNow, fr: window.FRIEND.last })); })();
  ok('story opens with the friend: "first we try to read alone!"', /לבד/.test((say.now || '').replace(/[֑-ׇ]/g, '')) && /קוֹדֶם נְנַסֶּה לִקְרֹא לְבַד/.test(say.fr), JSON.stringify(say));
  let r = await band(1, fast(10));
  ok('low level: per-line 🔊 at once, "read to me" only after ~10 s', r[0].line && !r[0].all && r[1].line && r[1].all, JSON.stringify(r));
  r = await band(3, fast(25));
  ok('middle level: both hidden, both after ~25 s', !r[0].line && !r[0].all && r[1].line && r[1].all, JSON.stringify(r));
  ok('middle level: both at once after a wrong answer', r[2].line && r[2].all, JSON.stringify(r));
  r = await band(5, fast(25));
  ok('top level: no read to me at all; the per-line 🔊 only after a wrong answer', !r[0].line && !r[0].all && !r[1].line && !r[1].all && r[2].line && !r[2].all, JSON.stringify(r));
  // 4. day log: read alone / listened, the level and the goal; only stories read alone move the level up
  const finish = () => p.evaluate(async () => { await new Promise(r => setTimeout(r, 100)); for (let k = 0; k < 3; k++) { const q = window.__quiz; q.wrap.querySelector('.chs').children[q.ans].click(); await new Promise(r => setTimeout(r, 250)); } });
  const lv1 = await p.evaluate(() => window.READBANK2.stories.filter(s => s.lv === 1).map(s => s.id));
  await p.evaluate(() => { const T = window.TAL; T.S().tl = {}; window.OREN.realSave.alog = {}; });
  for (const k of lv1.slice(0, 2)) { await run(p, k, null); await p.evaluate(() => document.querySelector('#sTal .strd').click()); await toQ(p); await finish(); }
  const lvL = await p.evaluate(() => window.READBANK2.level('story'));
  for (const k of lv1.slice(2, 4)) { await run(p, k, null); await toQ(p); await finish(); }
  const lvA = await p.evaluate(() => window.READBANK2.level('story'));
  ok('listened stories keep the level; stories read alone move it up', lvL === 1 && lvA === 2, `${lvL} → ${lvA}`);
  const lg = await p.evaluate(() => { const O = window.OREN; return (O.realSave.alog[O.today()].e || []).filter(e => e[1] === 'story-new' && e[6] === 'c').map(e => e[7]); });
  ok('day log: each story line has its goal, level and read alone / listened', lg.length === 4 && lg.every(x => x && x.t && x.g && x.lv === 1) && lg.map(x => x.r).join() === 'l,l,a,a', JSON.stringify(lg));
  await p.evaluate(() => window.TAL.parentPanel('day')); await L.sleep(300);
  const rows = await p.evaluate(() => [...document.querySelectorAll('.dllog .dlrow.dl-c')].map(x => x.textContent));
  ok('parent day log shows the story name, its goal, read alone / listened and the level', rows.length === 4 && rows.every(t => /🎯/.test(t) && /רמה 1/.test(t)) && rows.filter(t => /קרא לבד/.test(t)).length === 2 && rows.filter(t => /האזין/.test(t)).length === 2, JSON.stringify(rows));
  ok('stories: no JS errors', !errs.length, errs.slice(0, 3).join(' | '));
  await ctx.close();
}
