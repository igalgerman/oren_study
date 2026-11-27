// #406 voice audit (CI only): plays every screen of every pack in a fake audio player and checks every spoken line.
// The recordings are what pregen makes in advance (cf/tools/pregen.js: its static pass over the packs' own speak lists +
// the math sentence set), stored like the site's KV: key = 'tts:' + sha256(voice|rate|text) (make_worker.py ttsKey), value =
// the text it was made from. For every clip the game asks for while a line is spoken, the fake player checks:
//   1. the clip belongs to the line being spoken (one of its fullSpell parts, #401),
//   2. a recording exists for its key (random math questions are made on demand: pregen's RANDOM, not checked),
//   3. the recording's own text hashes to that key (audio that does not match its text).
// Report in the GitHub job summary (+ tests/.tmp/voice-audit-<half>.txt: every clip by rule). Refuses to run outside GitHub Actions /
// a cloud session (even with ALLOW_LOCAL_TESTS=1). Usage (in oren2/, after run.sh built tests/.tmp/t.html): node tests/voice-audit.test.js 1|2
if (process.env.GITHUB_ACTIONS !== 'true' && process.env.CLAUDE_CODE_REMOTE !== 'true') {
  console.error('voice audit runs in GitHub Actions only (#406)'); process.exit(3); }
const L = require('./lib');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const PG = require('../cf/tools/pregen.js');
const { chromium } = require('playwright');
const sleep = L.sleep;
// two halves run in parallel (CI time budget, #187): 'voice-audit 1' = home, worlds, levels, arcade + every 2nd activity; 'voice-audit 2' = the other activities
const HALF = process.argv[2] === '2' ? 2 : 1;
const res = []; const ok = (n, c, i = '') => res.push((c ? 'PASS ' : 'FAIL ') + n + (i ? ' — ' + i : ''));
const HTML = fs.readFileSync(L.PAGE, 'utf8');
const ORIGIN = 'https://oren.test';
const key = (v, r, t) => 'tts:' + crypto.createHash('sha256').update(v + '|' + (+r).toFixed(2) + '|' + t).digest('hex');   // as the worker's ttsKey
const N = s => String(s).replace(/\s+/g, ' ').trim();
// every Hebrew string literal of the game's source (the pieces of a `template` too): a fixed sentence the game can say
const NN = s => String(s).replace(/<[^>]+>/g, ' ').replace(/[\u0591-\u05C7]/g, '').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, ' ').replace(/\s+/g, ' ').trim();   // without nikud, tags, emoji
const SRCN = NN([fs.readFileSync(path.join(L.ROOT, 'index.html'), 'utf8'), ...fs.readdirSync(L.ROOT).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(L.ROOT, f), 'utf8'))].join('\n'));
const LITS = [...new Set([fs.readFileSync(path.join(L.ROOT, 'index.html'), 'utf8'), ...fs.readdirSync(L.ROOT).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(L.ROOT, f), 'utf8'))]
  .flatMap(src => src.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`[^`]*`/g) || []).flatMap(q => q.slice(1, -1).split(/\$\{[^}]*\}/)).filter(x => /[\u05D0-\u05EA]{2}/.test(x)))];

// the fake player: every Audio() of the game voice reports (url, the line being spoken) to node, then plays at once
const INIT = () => {
  try { localStorage.clear(); } catch (e) {}
  let seed = 406; Math.random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };   // the same walk every run
  window.__clips = [];
  window.Audio = function (url) {
    const a = this; a.src = url; a.paused = true; a.ended = false; a.error = null;
    const it = window.__sq && window.__sq.cur;
    if (/^\/api\/tts\?/.test(url || '')) window.__clips.push({ url, line: it ? it.t : null, lang: it ? it.lang : null });
    a.pause = () => { a.paused = true; a.stop = true; };
    a.play = () => { setTimeout(() => { if (a.stop) return; a.paused = false; a.onplay && a.onplay(); a.onplaying && a.onplaying();
      setTimeout(() => { if (a.paused) return; a.paused = true; a.ended = true; a.onended && a.onended(); }, 5); }, 5); return Promise.resolve(); };
  };
};

(async () => {
  const T0 = Date.now();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...L.VIEWPORT, serviceWorkers: 'block' });
  await ctx.addInitScript(INIT);
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.origin !== ORIGIN) return r.fulfill({ status: 404, body: '' });
    if (u.pathname === '/') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML });
    if (u.pathname === '/api/tts/status') return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"ver":3}' });
    if (u.pathname.startsWith('/api/')) return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    return r.fulfill({ status: 404, body: '' });
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(ORIGIN + '/'); await L.noCoach(p);
  await p.waitForFunction(() => window.__gv && window.__gv.ok, null, { timeout: 10000 });

  // the recordings: pregen's own lists (the static pass + the math sentence set), keyed like the site's KV
  const DATA = { SENT: PG.literal('talents.js', 'SENT'), STORIES: PG.literal('talents.js', 'STORIES'), INTRO: PG.literal('index.html', 'INTRO') };
  const stat = await p.evaluate(PG.STATIC, DATA);
  const maths = await p.evaluate(() => window.OREN.mathSpeechList().flatMap(s => window.__ttsParts(window.__fullSpell(s))));
  const REC = new Map();
  for (const x of stat.concat(maths)) { const c = PG.norm(x); if (!c) continue; const o = typeof c === 'string' ? { t: c, v: PG.GV, r: PG.GR } : c; REC.set(key(o.v, o.r, o.t), o.t); }
  const PLAY = new Set(await p.evaluate(ls => ls.flatMap(x => { try { return window.__ttsParts(window.__fullSpell(x.replace(/<[^>]+>/g, ' '))); } catch (e) { return []; } }), LITS));
  ok('the recordings list (pregen static pass + math set) is built', REC.size > 3000, 'n=' + REC.size);

  // play every screen: home, worlds and every level start, the city (every building, every activity, a few answers), arcade
  const ev = async (f, w = 120) => { try { await Promise.race([p.evaluate(f), sleep(8000)]); } catch (e) {} await sleep(w); };
  const prep = `(()=>{const O=window.OREN,T=window.TAL;O.save.story.intro=1;O.save.gems=120;T.S().prof={an:'dragon',col:'#8e6fd1',love:'code'};})()`;
  await ev(prep); await ev(`window.OREN.showMap()`, 400);
  if (HALF === 1) {
    await ev(`(()=>{const T=window.TAL;delete T.S().daily;window.OREN.showMap();})()`, 400);
    await ev(`window.TAL.otherDay&&window.TAL.otherDay()`, 300);
    await ev(`(async()=>{const O=window.OREN;for(const w of O.WORLDS){O.showWorld(w);await new Promise(r=>setTimeout(r,120));document.querySelector('#dlg').hidden=true;}})()`, 200);
    await ev(`(async()=>{const O=window.OREN,G=window.__oren4;for(const lv of O.ALLLV){try{if(lv.type==='learn'){delete O.save.seen[lv.u.id];O.startLevel(lv);}else G.playLevel(lv);}catch(e){}await new Promise(r=>setTimeout(r,60));}})()`, 300);
    await ev(`window.OREN.showJourney()`, 300); await ev(`window.OREN.kingdom()`, 300); await ev(`window.OREN.studio(false)`, 300); }
  await ev(`window.TAL.openHub()`, 300); for (let g = 0; g < 4; g++) await ev(`window.TAL.openGroup(window.TAL.GROUPS[${g}])`, 200);
  const acts = await p.evaluate(() => window.TAL.BUILD.flatMap(b => [['B', b.id], ...b.acts.map(a => ['A', a.id])]));
  let nAct = 0, nWant = 0, ai = 0; const silent = [], notRun = [], noBtn = [];
  // #610 owner rule: every screen has a way to hear its text again (🔊) and to turn the music off (the top-bar sound button)
  const btns = () => p.evaluate(() => { const v = s => { const e = document.querySelector(s); return !!e && !!e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'; };
    return { say: v('#btnSay'), snd: v('#btnMusic') }; }).catch(() => ({ say: false, snd: false }));
  for (const [k, id] of acts) {
    if (k === 'B') { await ev(`window.TAL.openBuilding(window.TAL.BUILD.find(b=>b.id==='${id}'))`, 150); continue; }
    if (ai++ % 2 !== HALF - 1) continue;
    nWant++;
    const c0 = await p.evaluate(() => window.__clips.length);
    const ran = await p.evaluate(id => { window.OREN.hush(); document.querySelector('#ov').hidden = true; const a = window.TAL.ACT[id];
      try { a.run(() => {}); return 'ok'; } catch (e) { return e.message; } }, id).catch(e => e.message);   // locked ones too (avail = progress)
    if (ran === 'ok') nAct++; else notRun.push(id + ': ' + ran);
    await sleep(450);   // the screen's own line is read after it settles (auto-read, 300 ms)
    { const bt = await btns(); if (!bt.say || !bt.snd) noBtn.push(id + (bt.say ? '' : ' no 🔊') + (bt.snd ? '' : ' no sound button')); }
    for (let k2 = 0; k2 < 5; k2++) {
      await ev(`(()=>{const q=window.__quiz;if(q&&q.wrap.isConnected){const c=q.wrap.querySelector('.chs');if(c&&c.children[q.ans]){c.children[q.ans].click();}return;}
        const b=[...document.querySelectorAll('#sTal .bigbtn,#sTal .chb,#sTal .actc')].filter(x=>!x.disabled&&x.offsetParent);if(b.length)b[Math.floor(Math.random()*b.length)].click();})()`, 100);
      if (await p.evaluate(() => !document.querySelector('#ov').hidden).catch(() => false)) break;
    }
    if (await p.evaluate(n => window.__clips.length === n, c0)) {   // #610 opened again alone, with time to settle: a screen that says nothing fails
      const c1 = await p.evaluate(() => window.__clips.length);
      await p.evaluate(id => { window.OREN.hush(); document.querySelector('#ov').hidden = true; try { window.TAL.ACT[id].run(() => {}); } catch (e) {} }, id).catch(() => {});
      if (!(await p.waitForFunction(n => window.__clips.length > n, c1, { timeout: 4000 }).then(() => 1, () => 0))) silent.push(id); }   // up to 4 s: slow under load
    // reading practice (TAL.READ_ACT) at a level where Oren reads first may wait silent (auto-read suite): it still needs its 🔊, checked above
  }
  // #610 the explore bank on the daily path (#394): the space question the owner met silent (castle/night scene) is read, question then
  // each answer, its 🔊 reads it again, and the sound button is there
  const path610 = {};
  if (HALF === 2) {
    await ev(`(()=>{const O=window.OREN,T=window.TAL;document.querySelector('#ov').hidden=true;delete T.S().daily;O.showMap();T.S().daily.o=['explore','math','readg','create','calm'];O.showMap();
      document.querySelector('#sHome .dcard:not(.cont)').click();T.S().daily.t[0]='sky-astro';O.showMap();document.querySelector('#sHome .bigbtn.huge').click();})()`, 600);
    const inQuiz = () => p.evaluate(() => !!(window.__quiz && window.__quiz.wrap.isConnected && window.__quiz.wrap.querySelector('.qq')));
    let c0 = 0; for (let k = 0; k < 12 && !(await inQuiz()); k++) { c0 = await p.evaluate(() => window.__clips.length); await ev(`window.EXPLORE2.step()`, 300); }
    await sleep(900);   // auto-read after the screen settles
    const T = l => l.map(c => N(new URLSearchParams(c.url.split('?')[1]).get('t')).replace(/^או /, ''));
    Object.assign(path610, await p.evaluate(() => { const w = window.__quiz && window.__quiz.wrap; return { onPath: window.TAL.onPath, quiz: !!(w && w.isConnected),
      q: w ? w.querySelector('.qq').textContent.replace('🔊', '').trim() : '', opts: w ? [...w.querySelectorAll('.chs > *')].map(b => b.textContent.trim()) : [], card: !!(w && w.querySelector('.qq .rdb')) }; }));
    path610.btn = await btns(); path610.want = await p.evaluate(L => L.map(x => window.__fullSpell(x).replace(/\s+/g, ' ').trim()), [path610.q, ...path610.opts]);
    path610.auto = T(await p.evaluate(n => window.__clips.slice(n), c0));
    let c1 = await p.evaluate(() => window.__clips.length); await p.evaluate(() => { window.OREN.hush(); document.querySelector('#sTal .qq .rdb').click(); }).catch(() => {}); await sleep(600);
    path610.card1 = T(await p.evaluate(n => window.__clips.slice(n), c1));
    c1 = await p.evaluate(() => window.__clips.length); await p.evaluate(() => { window.OREN.hush(); document.querySelector('#btnSay').click(); }).catch(() => {}); await sleep(600);
    path610.top = T(await p.evaluate(n => window.__clips.slice(n), c1));
    const all = L => path610.want.every(t => L.includes(t)) && L.indexOf(path610.want[0]) === 0;
    path610.ok = path610.onPath && path610.quiz && path610.opts.length >= 2 && path610.btn.snd && path610.btn.say && path610.card &&
      all(path610.auto) && all(path610.top) && path610.card1.join(' ').includes(path610.want[0]);
  }
  if (HALF === 1) { await ev(`(()=>{document.querySelector('#ov').hidden=true;window.TAL_arcade(()=>{});})()`, 400);
    for (const g of ['balloon', 'soccer', 'basket', 'swim', 'mole', 'frog']) { await ev(`(()=>{window.TAL_arcade(()=>{});window.__arc.start('${g}');})()`, 400); await ev(`window.__arc.finish(9)`, 200); } }
  await sleep(500);

  // check every clip
  const clips = await p.evaluate(() => window.__clips.map(c => { const q = new URLSearchParams(c.url.split('?')[1]);
    const parts = c.line == null ? null : c.lang === 'en' ? window.__ttsParts(String(c.line).replace(/<[^>]+>/g, ' ')) : window.__ttsParts(window.__fullSpell(c.line));
    // a line of separate clips (U+2063, #266: an opening, then each choice): the rules look at the one piece this clip comes from
    let piece = c.line; if (c.line != null && c.lang !== 'en') { const raw = window.__ttsParts(c.line), i = parts.indexOf(q.get('t')); if (raw.length === parts.length && i >= 0) piece = raw[i]; }   // as googleSay's rp
    return { t: q.get('t'), v: q.get('v'), r: q.get('r'), line: c.line, piece, parts }; }));
  const noLine = [], wrongLine = [], missing = [], badHash = [], lines = new Set(), kind = {};
  // a clip with no recording is allowed only by one of these rules (each counted in the report):
  //   play    a fixed sentence of the game's source (a string literal through fullSpell): pregen's play-through (pregen.js collect) records it when it meets that screen
  //   random  pregen's own RANDOM rule: random math questions, made on first use
  //   numbers the line has a number in it, or two number words (clock, arcade sums, counting, math answers): made on first use
  //   choices a question said with its choices in one clip, choices shuffled each time: made on first use
  //   word    put together: at most 4 runs of the source's text + at most 3 other words ('כְּתֹב אֶת הַמִּלָּה. X', 'אֵיפֹה יֵשׁ X? גַּע בּוֹ.'): made on first use
  const choices = t => /(\?|\.\.\.)\. |^\. |\? [^?.]+,[^?.]+$/.test(t);
  const word = l => { const w = NN(l).split(' ').filter(x => /\p{L}/u.test(x)); let vars = 0, runs = 0, fixed = 0;   // cover the line with the longest runs of words found in the source:
    for (let i = 0; i < w.length;) { let j = i; while (j < w.length && SRCN.includes(w.slice(i, j + 1).join(' '))) j++;   // at most 4 runs, 3 words left over
      if (j === i) { vars++; i++; } else { runs++; fixed += w.slice(i, j).join(' ').length; i = j; } }
    return runs <= 4 && vars <= 3 && fixed >= 4; };
  // the help's last step (help.js BT.ans): 'הַתְּשׁוּבָה הִיא: <answer>' + the explanation, e.g. the completed sentence (#608): the answer (1-3 words) + a 'word' line
  const ANS = NN('הַתְּשׁוּבָה הִיא') + ':';
  const helpAns = l => { const t = NN(l); if (!t.startsWith(ANS)) return false; const w = t.slice(ANS.length).trim().split(' ');
    for (let k = 1; k <= 3 && k < w.length; k++) if (word(w.slice(k).join(' '))) return true; return false; };
  const NUMW = /(^|\s)ו?(אחת|אחד|שתיים|שתים|שנים|שניים|שלוש|שלושה|ארבע|ארבעה|חמש|חמישה|שש|שישה|שבע|שבעה|שמונה|תשע|תשעה|עשר|עשרה|עשרים|שלושים|ארבעים|חמישים|שישים|שבעים|שמונים|תשעים|מאה)(?=[\s.,?!]|$)/g;
  const numbers = c => /\d/.test(c.piece) || (c.t.match(NUMW) || []).length >= 2;
  const why = c => PLAY.has(c.t) || SRCN.includes(NN(c.piece)) ? 'play' : PG.RANDOM.test(c.t) ? 'random' : numbers(c) ? 'numbers' : choices(c.t) ? 'choices' : word(c.piece) || helpAns(c.piece) ? 'word' : '';
  const check = (c, rec) => { const k = key(c.v, c.r, c.t);
    if (c.line == null) return noLine.push(c.t);
    lines.add(c.line);
    if (!c.parts.map(N).includes(N(c.t))) return wrongLine.push(c.t + '  ≠  ' + c.line);
    if (!rec.has(k)) { const w = why(c); if (w) (kind[w] = kind[w] || new Set()).add(c.t); else missing.push(c.t + (c.v !== PG.GV ? ' [' + c.v + ' ' + c.r + ']' : '') + (NN(c.piece) !== c.t ? '  (line: ' + c.piece + ')' : '')); return; }
    (kind.recorded = kind.recorded || new Set()).add(c.t);
    if (key(c.v, c.r, rec.get(k)) !== k) badHash.push(c.t); };
  for (const c of clips) check(c, REC);
  const uniq = a => [...new Set(a)];
  const counts = ['recorded', 'play', 'random', 'numbers', 'choices', 'word'].map(w => w + ' ' + (kind[w] ? kind[w].size : 0)).join(' · ');
  fs.writeFileSync(path.join(L.TMP, 'voice-audit-' + HALF + '.txt'), Object.entries(kind).flatMap(([w, set]) => [...set].map(t => w + '\t' + t))
    .concat(uniq(missing).map(x => 'missing\t' + x), uniq(wrongLine).map(x => 'line\t' + x), uniq(badHash).map(x => 'hash\t' + x)).join('\n') + '\n');
  console.log('clips', clips.length, 'lines', lines.size, 'activities', nAct + '/' + nWant, 'silent', silent.join(' ') || '-', '·', counts, '·', Math.round((Date.now() - T0) / 1000) + 's');
  ok('the fake player heard every screen: every activity of this half opened, the game spoke', nAct === nWant && nAct >= 50 && clips.length >= 80, `activities=${nAct}/${nWant} clips=${clips.length} lines=${lines.size} ` + notRun.slice(0, 5).join(' | '));
  ok('#610 every activity screen has the 🔊 replay and the sound button', !noBtn.length, noBtn.slice(0, 6).join(' | '));
  const RA = new RegExp(await p.evaluate(() => window.TAL.READ_ACT.source)), mute = silent.filter(id => !RA.test(id));
  ok('#610 every activity screen says something when it opens (opened again alone first; reading practice where Oren reads first excepted)', !mute.length, mute.join(' '));
  if (HALF === 2) ok('#610 explore question on the daily path: read by itself (question, then each answer), its 🔊 reads it again, the top-bar 🔊 and the sound button are there', path610.ok, JSON.stringify(path610));
  ok('every clip is asked for while a line is spoken (the speech queue)', !noLine.length, uniq(noLine).slice(0, 5).join(' | '));
  ok('every clip belongs to the line being spoken', !wrongLine.length, uniq(wrongLine).slice(0, 5).join(' | '));
  ok('every spoken line has a recording (pregen) or is made on first use by a named rule', !missing.length, uniq(missing).length + ': ' + uniq(missing).slice(0, 8).join(' | '));
  ok('every recording matches its text hash', !badHash.length, uniq(badHash).slice(0, 5).join(' | '));
  // the checker itself: a new fixed line nobody records, and audio stored under another text's key, both fail
  { const c0 = clips.find(c => c.line != null && REC.has(key(c.v, c.r, c.t))); const k0 = key(c0.v, c0.r, c0.t);
    const before = [missing.length, badHash.length], t1 = 'זְבַרְגּוּל פְּלִינְטוֹק מְזַרְקֵל קוּפְלוֹנִי טְרַמְבִּיל';
    const w0 = wrongLine.length;
    check({ ...c0, t: t1, line: t1, piece: t1, parts: [t1] }, REC); const R2 = new Map(REC); R2.set(k0, c0.t + ' אחר'); check(c0, R2); check({ ...c0, t: c0.t + ' אחר' }, REC);
    ok('self-check: a line without audio, audio of another text and a clip of another line all fail', missing.length === before[0] + 1 && badHash.length === before[1] + 1 && wrongLine.length === w0 + 1);
    missing.length = before[0]; badHash.length = before[1]; wrongLine.length = w0;
    ok('self-check: the help answer of a sentence completion is a put-together line (#608)', helpAns('הַתְּשׁוּבָה הִיא: יְשֵׁנִים בַּלַּיְלָה אֲנַחְנוּ יְשֵׁנִים בַּמִּטָּה.') && !helpAns('הַתְּשׁוּבָה הִיא: ' + t1)); }
  ok('no page errors while playing every screen', !errs.length, errs.slice(0, 3).join(' | '));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const m = uniq(missing), w = uniq(wrongLine), h = uniq(badHash);
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Voice audit ${HALF}/2 (#406)\n${lines.size} lines, ${clips.length} clips, ${nAct} activities` + (HALF === 1 ? ' + home, worlds, levels, arcade' : '') +
      `\n\nclips: ${counts} · **no recording: ${m.length}** · not the line spoken: ${w.length} · hash mismatch: ${h.length}\n\n` +
      [...m.slice(0, 20).map(x => '- no recording: ' + x), ...w.slice(0, 10).map(x => '- not the line: ' + x), ...h.slice(0, 10).map(x => '- hash: ' + x)].join('\n') + '\n\n');
  }
  await b.close();
  L.finish('voice-audit-' + HALF, res);
})().catch(e => { console.error(e); console.log('RESULT voice-audit-' + HALF + ' 0 1'); process.exit(1); });
