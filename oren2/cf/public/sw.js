/* Offline mode for the family website (served at /sw.js by cf/dist/_worker.js; never used inside Claude or file://).
   - the page '/': network first (4 s), else the saved copy;  manifest, icons, Google fonts: saved copy first
   - /api/tts/status: network first, else the saved answer (so offline the game keeps the Google voice it has saved);
     also saved at install (#434: the first visit asks it before this worker runs, so an offline reload had no saved answer)
   - /api/tts?... audio: saved copy first (these URLs never change), at most MAX sentences, oldest used dropped first
   - /api/save and everything else: never cached
   - postMessage({type:'prefetch', urls?:[...]}) saves a list of sentences (default: the server's list of all game
     sentences, /api/tts/list); progress is posted back as {type:'prefetch', left, ok, fail}. */
const PAGE = 'oren-page-v1', AUDIO = 'oren-audio-v2', MAX = 1500;
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(PAGE).then(c => c.addAll(SHELL).then(() => c.add('/api/tts/status').catch(() => {}))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(ks => Promise.all(ks.filter(k => k !== PAGE && k !== AUDIO).map(k => caches.delete(k)))).then(() => self.clients.claim())));

const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('slow')), ms))]);
async function networkFirst(req, key, ms) {
  const c = await caches.open(PAGE);
  try { const r = await timeout(fetch(req), ms); if (r.ok) await c.put(key, r.clone()); return r; }
  catch (e) { const hit = await c.match(key); if (hit) return hit; throw e; }
}
async function cacheFirst(req, name) {
  const c = await caches.open(name); const hit = await c.match(req); if (hit) return hit;
  const r = await fetch(req); if (r.ok || r.type === 'opaque') await c.put(req, r.clone()); return r;
}
/* audio: one cache entry per URL (no Range header), served whole or as a 206 slice for Safari's range requests */
let trimming = null;
function trim() {
  if (!trimming) trimming = (async () => { const c = await caches.open(AUDIO); const ks = await c.keys();
    for (let i = 0; i < ks.length - MAX; i++) await c.delete(ks[i]); })().finally(() => { trimming = null; });
  return trimming;
}
async function audio(req, e) {
  const url = req.url, c = await caches.open(AUDIO);
  let r = await c.match(url);
  if (r) { const keep = r.clone(); e.waitUntil(c.delete(url).then(() => c.put(url, keep))); }   // most recently used goes last
  else { r = await fetch(url); if (!r.ok) return r; await c.put(url, r.clone()); e.waitUntil(trim()); }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  if (!range) return r;
  const buf = await r.arrayBuffer(), n = buf.byteLength;
  let a = range[1] === '' ? Math.max(0, n - (+range[2] || 0)) : +range[1], b = range[1] !== '' && range[2] !== '' ? Math.min(+range[2], n - 1) : n - 1;
  if (a >= n || a > b) return new Response(null, { status: 416, headers: { 'content-range': 'bytes */' + n } });
  return new Response(buf.slice(a, b + 1), { status: 206, headers: { 'content-type': 'audio/mpeg', 'content-range': `bytes ${a}-${b}/${n}`, 'content-length': String(b - a + 1), 'accept-ranges': 'bytes' } });
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    const p = u.pathname;
    if (p.startsWith('/api/save')) return;
    if (p === '/' || p === '/index.html') return e.respondWith(networkFirst(req, '/', 4000));
    if (p === '/api/tts/status') return e.respondWith(networkFirst(req, p, 4000));
    if (p === '/api/tts' && u.searchParams.get('t')) return e.respondWith(audio(req, e));
    if (SHELL.includes(p)) return e.respondWith(cacheFirst(req, PAGE));
    return;
  }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') e.respondWith(cacheFirst(req, PAGE));
});

/* "download all voices to this device": fetch only sentences the server already has (header x-cache-only),
   6 at a time, and report progress to the page that asked */
self.addEventListener('message', e => {
  const d = e.data || {}; if (d.type !== 'prefetch') return;
  const tell = m => { if (e.source && e.source.postMessage) e.source.postMessage(Object.assign({ type: 'prefetch' }, m)); };
  e.waitUntil((async () => {
    let urls = d.urls;
    if (!Array.isArray(urls)) try { const j = await (await fetch('/api/tts/list', { cache: 'no-store' })).json(); urls = Array.isArray(j) ? j : j.urls; } catch (er) { urls = null; }
    if (!Array.isArray(urls)) return tell({ left: 0, ok: 0, fail: 1, error: 'list' });
    if (d.k != null) urls = urls.map(x => /[?&]k=/.test(x) ? x : x + '&k=' + d.k); /* the game's audio URLs carry the voice-fix version */
    const c = await caches.open(AUDIO); const have = new Set((await c.keys()).map(r => r.url));
    const todo = urls.map(x => new URL(x, location.origin).href).filter(x => !have.has(x)).slice(0, MAX);
    let ok = urls.length - todo.length, fail = 0, i = 0, left = todo.length;
    tell({ left, ok, fail });
    const one = async () => { while (i < todo.length) { const url = todo[i++];
      try { const r = await fetch(url, { headers: { 'x-cache-only': '1' } }); if (r.ok) { await c.put(url, r); ok++; } else fail++; } catch (er) { fail++; }
      left--; if (left % 20 === 0 || !left) tell({ left, ok, fail }); } };
    await Promise.all([one(), one(), one(), one(), one(), one()]);
    await trim();
  })());
});
