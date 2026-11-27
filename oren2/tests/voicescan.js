// #396: static scan of the game's own code for the browser's own speech (speechSynthesis).
// Only ONE place may start it: browserSay() in the core of index.html, the offline fallback (owner, answer 3).
// Every other speak goes through say() (Google voice /api/tts, or the Claude voice in the artifact).
// Allowed elsewhere: cancel(), getVoices(), .speaking, and the .speak.bind() observers (they only watch, never start speech).
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..');                 // oren2/
// a direct start of the browser voice: a new utterance, or .speak( on anything but the Claude voice (TTS.ns.speak)
const BAD = [/SpeechSynthesisUtterance/, /(?<!TTS\.ns)\.speak\s*\(/];
// the core of index.html = everything outside the injected parts (TALENTS and GAPSMATH come from the .js files)
function core(html) {
  const cut = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b); return i < 0 || j < 0 ? s : s.slice(0, i) + '\n'.repeat(s.slice(i, j).split('\n').length - 1) + s.slice(j); };
  return cut(cut(html, '<!--TALENTS-->', '<!--/TALENTS-->'), '/*GAPSMATH*/', '/*/GAPSMATH*/');
}
// the body of function name(...){...} by brace matching: [start, end) offsets
function fnRange(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  let k = src.indexOf('{', i), d = 0;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return [i, k + 1]; }
  return null;
}
// sources: name -> text. Returns { hits: ['file:line text'], fallback: {utter, speak} } (fallback = what browserSay holds)
function scan(sources) {
  const hits = []; let fallback = null;
  for (const [file, text0] of Object.entries(sources)) {
    let text = text0;
    if (file === 'index.html') {
      text = core(text0);
      const r = fnRange(text, 'browserSay');
      if (r) {
        const body = text.slice(r[0], r[1]);
        fallback = { utter: (body.match(/new SpeechSynthesisUtterance\(/g) || []).length, speak: (body.match(/speechSynthesis\.speak\(/g) || []).length };
        text = text.slice(0, r[0]) + body.replace(/[^\n]/g, ' ') + text.slice(r[1]);
      }
    }
    text.split('\n').forEach((ln, n) => { if (BAD.some(re => re.test(ln))) hits.push(file + ':' + (n + 1) + ' ' + ln.trim().slice(0, 100)); });
  }
  return { hits, fallback };
}
// the game's code: the core of index.html + every oren2/*.js (each is injected into the page) + the website's service worker
function gameSources() {
  const out = { 'index.html': fs.readFileSync(path.join(DIR, 'index.html'), 'utf8') };
  for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.js')).sort()) out[f] = fs.readFileSync(path.join(DIR, f), 'utf8');
  const sw = path.join(DIR, 'cf', 'public', 'sw.js'); if (fs.existsSync(sw)) out['cf/public/sw.js'] = fs.readFileSync(sw, 'utf8');
  return out;
}
// #397 the speech queue: the voices are started only by the queue (sayOne), never by a screen. Returns 'file:line text' for every
// call of googleSay / browserSay / TTS.ns.speak outside the queue's own functions (sayOne, googleSay, browserSay).
function bypass(sources) {
  const hits = []; const CALL = /\b(googleSay|browserSay)\s*\(|TTS\.ns\.speak\s*\(/;
  for (const [file, text0] of Object.entries(sources)) {
    let text = file === 'index.html' ? core(text0) : text0;
    if (file === 'index.html') for (const fn of ['sayOne', 'googleSay', 'browserSay']) {
      const r = fnRange(text, fn); if (r) text = text.slice(0, r[0]) + text.slice(r[0], r[1]).replace(/[^\n]/g, ' ') + text.slice(r[1]); }
    text.split('\n').forEach((ln, n) => { if (CALL.test(ln) && !/function (googleSay|browserSay)\(/.test(ln)) hits.push(file + ':' + (n + 1) + ' ' + ln.trim().slice(0, 100)); });
  }
  return hits;
}
module.exports = { scan, gameSources, core, fnRange, bypass };
