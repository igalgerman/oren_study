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
  await p.evaluate(() => { window.TAL.S().rd.lvl = 3; window.__hl = []; window.__spoken = []; document.querySelector('.tqc .qq .rdb').click(); });   /* level 3: no auto-read can cut in on the button's reading */
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
  await p.evaluate(() => { window.TAL.S().rd.lvl = 1; });
  await p.evaluate(() => { window.__spoken = []; window.TAL.ACT['read-sent'].run(() => {}); });
  /* the instruction may be said at once; the sentence to read is said only after the wait */
  const sentSaid = () => p.evaluate(() => { const e = document.querySelector('#sTal .tqc .sent'); if (!e) return -1;
    /* compare letters only (no niqqud, punctuation or ו/י): the spoken text uses full spelling, the screen text uses the spelling with vowel marks */
    const N = t => t.replace(/[֑-ׇ]/g, '').replace(/[^א-ת]/g, '').replace(/[וי]/g, '');
    const w = N(window.TAL.plainHe(e.textContent).replace(/🔊/g, '').trim().split(/\s+/).slice(0, 2).join(' '));
    return window.__spoken.filter(t => N(t).startsWith(w)).length; });
  await L.sleep(1500); const early = await sentSaid();
  let late = await sentSaid(); for (let k = 0; k < 40 && late < 1; k++) { await L.sleep(250); late = await sentSaid(); }   /* wait for the condition (max 10 s), not a fixed sleep */
  ok('level 1: waits, then reads by itself', early === 0 && late >= 1, `${early} → ${late}` + (late < 1 ? ' ' + JSON.stringify(await p.evaluate(() => ({ s: window.__spoken, rd: window.TAL.S().rd, sent: (document.querySelector('#sTal .tqc .sent') || {}).textContent }))) : ''));
  // 4. level 3 never reads by itself
  await p.evaluate(() => { window.TAL.S().rd.lvl = 3; window.__spoken = []; window.TAL.ACT['read-sent'].run(() => {}); });
  await L.sleep(4000);
  ok('level 3: no auto-read, no cue', await sentSaid() === 0 && await p.evaluate(() => !document.querySelector('.rdcue')));
  // 5. answering correctly without hearing counts as "solo" and moves him up a level
  await p.evaluate(() => { const T = window.TAL; T.S().rd = { lvl: 1, solo: 24 }; T.ACT['read-sent'].run(() => {}); });
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
  // 6. stories (G4): no per-line 🔊, one 🔊 "read to me" that reads line by line
  await p.evaluate(() => window.TAL.ACT['story-0'].run(() => {}));
  await p.waitForSelector('#sTal .sl'); await L.sleep(100);
  ok('G4 story: no per-line 🔊', await p.evaluate(() => document.querySelectorAll('#sTal .sl').length > 0 && document.querySelectorAll('#sTal .sl .rdb').length === 0));
  await p.evaluate(() => { window.__spoken = []; document.querySelector('#sTal .strd').click(); });
  await p.waitForFunction(() => window.__spoken.length >= 2, null, { timeout: 8000 });
  ok('"read to me" goes line by line', await p.evaluate(() => window.__spoken.length >= 2));
  // 7. home bubble has 🔊
  await p.evaluate(() => window.OREN.showMap()); await L.sleep(400);
  ok('🔊 on the home bubble', await p.locator('#sHome .hbub2 .rdb').count() === 1);
  // 8. the parent's reading setting is "עזרה בקריאה" (#613, tests/readhelp.test.js); the sentence level still moves by itself
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
    return { line: !!pg && !pg.classList.contains('noline'), all: !!rd && !rd.hidden && rd.offsetParent !== null }; }); };   /* line help = a tap on a line reads it */
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
  ok('📖 opens the story (text + read to me) with one button back to the question', pk.story && pk.qHidden && pk.rd && pk.back.length === 1 && /הַמְשֵׁךְ/.test(pk.back[0]), JSON.stringify(pk));
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
  ok('low level: tapping a line reads it at once, "read to me" only after ~10 s', r[0].line && !r[0].all && r[1].line && r[1].all, JSON.stringify(r));
  r = await band(3, fast(25));
  ok('middle level: both hidden, both after ~25 s', !r[0].line && !r[0].all && r[1].line && r[1].all, JSON.stringify(r));
  ok('middle level: both at once after a wrong answer', r[2].line && r[2].all, JSON.stringify(r));
  r = await band(5, fast(25));
  ok('top level: no read to me at all; tapping a line reads it only after a wrong answer', !r[0].line && !r[0].all && !r[1].line && !r[1].all && r[2].line && !r[2].all, JSON.stringify(r));
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
  await words420(p, run);
  await chapters731(p);
  ok('stories: no JS errors', !errs.length, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

/* ---------- #731: a story is read in chapters of at most STORY_CHAPTER_S seconds; each chapter has one button (continue); the last leads to the questions ---------- */
async function chapters731(p) {
  const d = await p.evaluate(() => { const T = window.TAL, all = [...window.READBANK2.stories.map(s => ['R' + s.id, s.s]), ...T.STORIES.map((s, k) => ['B' + k, s.s])];
    const long = all.filter(([, l]) => { const c = T.storyChapters(l.length); return c.some(([a, b]) => T.storyChapterSecs(l.slice(a, b)) > T.STORY_CHAPTER_S) || c[0][0] !== 0 || c[c.length - 1][1] !== l.length || c.some(([a, b], i) => b <= a || (i && c[i - 1][1] !== a)); }).map(x => x[0]);
    return { long, n: all.length, multi: all.filter(([, l]) => T.storyChapters(l.length).length > 1).length, budget: T.STORY_CHAPTER_S }; });
  ok('#731 no story chapter is longer than the budget (every bank and bedtime story, chapters cover every line)', d.long.length === 0 && d.n > 50 && d.budget <= 240, JSON.stringify(d));
  ok('#731 stories of 5+ lines are cut into chapters', d.multi >= 2, JSON.stringify(d));
  const ch = await p.evaluate(() => { const T = window.TAL, c = T.storyChapters(T.STORIES[11].s.length); return c.map(([a, b]) => b - a); });
  await p.evaluate(() => window.TAL.readStory(11, () => {})); await L.sleep(150);
  const c1 = await p.evaluate(() => ({ lines: document.querySelectorAll('#sTal .story .sl').length, btns: [...document.querySelectorAll('#sTal .strow .bigbtn')].filter(b => !b.hidden && !b.classList.contains('strd')).length, go: !!document.querySelector('#sTal .stgo') }));
  await p.evaluate(() => document.querySelector('#sTal .stgo').click()); await L.sleep(150);
  const c2 = await p.evaluate(() => ({ lines: document.querySelectorAll('#sTal .story .sl').length, stories: document.querySelectorAll('#sTal .story').length, go: !!document.querySelector('#sTal .stgo'), q: !!window.__quiz && !window.__quiz.wrap.hidden }));
  await p.evaluate(() => document.querySelector('#sTal .stgo').click()); await L.sleep(150);
  const c3 = await p.evaluate(() => ({ q: !!document.querySelector('#sTal .tqc, #sTal .chs'), go: !!document.querySelector('#sTal .stgo') }));
  ok('#731 chapter 1 then chapter 2 (cut by storyChapters), each with the one continue button; the last continue opens the questions',
    c1.lines === ch[0] && c1.btns === 1 && c1.go && c2.lines === ch[1] && c2.stories === 1 && c2.go && c3.q && !c3.go, JSON.stringify([ch, c1, c2, c3]));
}

/* ---------- #420: "words we will meet" before a story; words he taps while reading come back the next day in word practice ---------- */
async function words420(p, run) {
  // data: every story (bank + bedtime) has 2-3 words, each with nikud and a picture, met as a word of the story itself
  const dat = await p.evaluate(() => { const C = t => String(t).replace(/<[^>]+>/g, ' ').split(/\s+/).map(w => w.replace(/[^֑-ׇא-ת]/g, ''));
    const all = [...window.READBANK2.stories.map(s => ['R' + s.id, s]), ...window.TAL.STORIES.map((s, k) => ['B' + k, s])];
    return all.filter(([, s]) => { const hw = s.hw || []; const toks = new Set(s.s.flatMap(C));
      return !(hw.length >= 2 && hw.length <= 3 && hw.every(([w, pic]) => /[ְ-ּ]/.test(w) && pic && toks.has(w))); }).map(([id]) => id).concat(['n' + all.length]); });
  ok('#420 every story has 2-3 words we will meet (nikud + picture, words of the story)', dat.length === 1 && dat[0] === 'n60', JSON.stringify(dat));
  // the card: above the story, one tile per word (picture + word), a tap says the word
  const spy = () => p.evaluate(() => { const O = window.OREN; window.__said420 = []; if (!O.__say420) { O.__say420 = O.say; O.say = (t, ...a) => { window.__said420.push(t); return O.__say420(t, ...a); }; } });
  await spy(); await run(p, 0, 1); await L.sleep(150);
  const card = await p.evaluate(() => { const c = document.querySelector('#sTal .sthw'), st = document.querySelector('#sTal .story'); const hw = window.READBANK2.stories[0].hw;
    const ts = c ? [...c.querySelectorAll('.hwt')] : []; if (ts[0]) ts[0].click();
    return { has: !!c, above: !!c && !!st && c.getBoundingClientRect().bottom <= st.getBoundingClientRect().top + 1, title: c && c.querySelector('.sthwt').textContent,
      n: ts.length, want: hw.length, words: ts.map(t => t.querySelector('.hww').textContent).join() === hw.map(x => x[0]).join(), pics: ts.every(t => t.querySelector('.hwp').textContent.trim()), said: window.__said420.slice(), w0: hw[0][0] }; });
  ok('#420 pre-story card above the story: title, one tile per word with picture and word', card.has && card.above && /מִלִּים שֶׁנִּפְגֹּשׁ/.test(card.title) && card.n === card.want && card.words && card.pics, JSON.stringify(card));
  ok('#420 tapping a word tile says the word', card.said.includes(card.w0), JSON.stringify(card.said));
  await p.evaluate(() => window.TAL.readStory(0, () => {})); await L.sleep(150);
  ok('#420 the bedtime stories show the card too', await p.evaluate(() => document.querySelectorAll('#sTal .sthw .hwt').length === window.TAL.STORIES[0].hw.length));
  // tap a word while reading: the word (with nikud) is said and stored; due tomorrow, not today
  await p.evaluate(() => { const S = window.LEARN.state(); if (S.wr) delete S.wr['rb-asked']; if (S.sn) delete S.sn['rb-asked']; window.TAL.S().askw = []; window.LEARN.setNow(null); });
  await spy(); await run(p, 1, 1); await L.sleep(150);
  const tap = await p.evaluate(() => { const ln = document.querySelectorAll('#sTal .story .sl')[2]; const ws = [...ln.querySelectorAll('.rw')]; const w = ws[1]; w.click();
    const want = window.READBANK2.stories[1].s[2].split(/\s+/)[1].replace(/[^֑-ׇא-ת]/g, '');
    return { want, said: window.__said420.slice(), asked: window.READBANK2.asked(), due: window.READBANK2.askedDue() }; });
  ok('#420 tapping a word in the story says that word (with nikud)', tap.said.includes(tap.want) && /[ְ-ּ]/.test(tap.want), JSON.stringify(tap));
  ok('#420 the tapped word is stored, not due the same day', tap.asked.includes(tap.want) && !tap.due.includes(tap.want), JSON.stringify(tap));
  const tmr = await p.evaluate(() => { const L = window.LEARN; L.setNow(() => Date.now() + 864e5); return window.READBANK2.askedDue(); });
  ok('#420 the next day the tapped word is due', tmr.includes(tap.want), JSON.stringify(tmr));
  // next day, word practice: the round starts with it ("which word did you hear?"), the word is said, he picks it among written words
  await spy(); await p.evaluate(() => window.__rb2run.pw(() => {})); await L.sleep(200);
  const q = await p.evaluate(() => { const Q = window.__quiz; const bs = [...Q.wrap.querySelectorAll('.chs .chb')].map(b => b.textContent.trim());
    return { qq: Q.wrap.querySelector('.tqc').textContent, opts: bs, right: bs[Q.ans], said: window.__said420.slice() }; });
  ok('#420 next day: word practice starts with the tapped word (heard, then picked among words)', /אֵיזוֹ מִלָּה שָׁמַעְתָּ/.test(q.qq) && q.right === tap.want && q.opts.length === 3 && q.said.includes(tap.want), JSON.stringify(q));
  await L.sleep(100); await p.evaluate(() => { const Q = window.__quiz; Q.wrap.querySelector('.chs').children[Q.ans].click(); }); await L.sleep(100);
  ok('#420 answered right: not due again that day', await p.evaluate(w => !window.READBANK2.askedDue().includes(w), tap.want));
  // voice: the card title, the question and every word of every story are in the pregen lists
  const pg = await p.evaluate(() => { const R = window.READBANK2, T = window.TAL; const sl = new Set(R.speakList()), wl = new Set(T.storyWordList());
    const miss = [...R.stories.flatMap(s => s.hw.map(x => x[0])).filter(w => !sl.has(w)), ...T.STORIES.flatMap(s => s.hw.map(x => x[0])).filter(w => !wl.has(w))];
    return { miss, title: sl.has(T.HW_T) || wl.has(T.HW_T), heard: sl.has(R.UI.heard), word: wl.has(window.READBANK2.stories[1].s[2].split(/\s+/)[1].replace(/[^֑-ׇא-ת]/g, '')), n: wl.size }; });
  const src = require('fs').readFileSync(require('path').join(__dirname, '../cf/tools/pregen.js'), 'utf8');
  ok('#420 pregen: card words, title, question and all story words', !pg.miss.length && pg.title && pg.heard && pg.word && pg.n > 500 && /storyWordList\(\)/.test(src), JSON.stringify(pg).slice(0, 300));
  await p.evaluate(() => window.LEARN.setNow(null));
}
