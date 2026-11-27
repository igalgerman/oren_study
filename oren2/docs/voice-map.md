# Voice map: every way the game speaks (#396, voice audit 1/11)

Line numbers are from `main` on 27 Nov 2026 (commit 7bd6c2c) and drift as the code changes; the function names stay.
`index.html` lines are in the core (outside the injected `<!--TALENTS-->` part).
The check: `oren2/tests/voice-stats.test.js` (#396 lines, scanner `oren2/tests/voicescan.js`) fails when any code starts the
browser's own speech outside `browserSay`, and when a file that speaks is missing from this map.

## 1. One entry point: `say(text, lang, slow)`

Every spoken sentence goes through `say()`. Since #397 (audit 2/11) `say()` only puts the sentence in ONE speech queue
(`SQ`, `sayNext`, `sayOne` next to `say` in `index.html`): one sentence at a time, the next starts when the one before ends
(never two voices together, never cut in the middle). `hush()` empties the queue and stops the voice. The same sentence twice
in a row is said once; at most 3 wait. A voice that never reports its end is let go after about twice its length (`sayGuard`).
Since #399 (audit 4/11) each queued line carries its screen id (`SQ.scr`, +1 on every `setScreen`): a line with an old id is
dropped (when it would start, after the voice check, or when its slow Google audio arrives late), so it is never spoken on a newer screen.
Only the queue (`sayOne`) starts a voice; `voice-stats` (#397 lines, `voicescan.js` `bypass`) fails on any other call.
For each sentence the queue picks ONE voice, in this order:

| order | voice | when | where |
|---|---|---|---|
| 1 | Google voice (he-IL-Chirp3-HD-Kore 0.9; English en-US-Chirp3-HD-Despina 0.85, slow 0.7) | on the family website, after `/api/tts/status` answered ok | `index.html:1543` `googleSay` |
| 2 | Claude artifact voice (`window.claude.use('tts')`) | inside the Claude artifact | `index.html:1557` (in `say`), setup `index.html:1451-1456` (`TTS`, `useClaude`) |
| 3 | browser voice (`speechSynthesis`) | the one fallback (owner, answer 3: only when the whole session is offline; on the family site, online, Google is tried even when the status check failed, #404) | `index.html:1518` `browserSay` |

- `sayNext()` — waits for the status check (`GV.pending`); `sayOne()` rechecks the status in the background, then picks the voice.
- `index.html:2343` — `say`, `hush` and `sayNow` are given to every pack file as `O.say` / `O.hush` / `O.sayNow`.

### Google voice details (`googleSay`, `index.html:1543`)
- `new Audio('/api/tts?t=…&v=…&r=…&k=<ver>')` (`index.html:1546`), one part at a time: texts over 400 chars are cut by
  `ttsParts` (`index.html:1535`, #401); the next part starts on `onended`.
- On a failure (`timeout` after `GV.ms` = 8 s, `audio-error`, `no-audio`): one retry (`blocked` = autoplay refused: no retry).
  Then (#404, audit 9/11): offline (`navigator.onLine === false`) -> `browserSay`; online -> `vmMark`: the text on the screen
  lights up (`.vmiss`) with a 🔊 (`.vmissb`) that tries again; text on a button or not on the screen -> the top-bar 🔊
  (`#btnSay`) lights up and retries that line. `hush()` turns the lights off (`vmClear`). Test: `voice-stats` (#404 lines).
- `/api/tts/status` check: `index.html:1525` (`GV.check`, 3 tries at start, again after 20 s when it failed).

### Claude voice (artifact)
- `TTS.ns.speak(...)` in `say` (`index.html:1557`); on an error other than not-granted / unavailable / stopped it falls back to `browserSay`.

### Browser voice (`browserSay`, `index.html:1518`) — the ONLY place allowed to start `speechSynthesis`
- `new SpeechSynthesisUtterance` + `speechSynthesis.speak(u)`; every use is counted with its reason (`voiceLog`, #36).
- Voice choice for it: `pickVoice` (`index.html:1448`, reads `speechSynthesis.getVoices()`), started at `index.html:1561`.
- Guard: `index.html:1562` wraps `speechSynthesis.speak` and logs any call that did not come from `browserSay` as `direct-call`.

## 2. What triggers speech

- Auto-read: `index.html:1567` — when a screen sets `sayNow`, it is read once after 300 ms (`hush()` then `say(sayNow)`).
- The 🔊 button: `index.html:1653` (`#btnSay`), the bubble `index.html:2063`, story panels `index.html:1680` (`#dSay`).
- Core screens set `sayNow`: `index.html:1686, 1713, 1756, 1899, 1910, 1971, 1975, 2064, 2087, 2243, 2280, 2312, 2330, 2339`.
- Pack files call `O.say(...)` / `say(...)` or set `O.sayNow` (lines that speak, set `sayNow` or check the voice):

| file | lines |
|---|---|
| `again.js` | 23 |
| `arcade.js` | 22, 31 |
| `chess.js` | 95, 111, 115, 181, 258 |
| `english2.js` | 339, 340 (reads `speechSynthesis.speaking` / `__gv.audio`, never speaks), 416, 428, 457 |
| `explore2.js` | 185, 189, 206, 209, 220, 438, 487 |
| `friend.js` | 48, 59, 65, 67, 68, 71, 86, 138 |
| `gaps.js` | 46, 86, 90, 92, 114, 149, 255, 261 |
| `health.js` | 106, 124, 132, 142 (parent message spoken from `/api/tts` on demand, #353), 151, 154, 159, 184 |
| `help.js` | 43, 414, 433, 457, 458, 469, 474, 477, 510 |
| `learn.js` | 472, 541 |
| `lessoncard.js` | 29, 33 |
| `music2.js` | 109, 120, 138, 156 |
| `pday.js` | 100 |
| `read-bank2.js` | 904, 946, 957, 960, 964, 988-990, 1016-1023, 1035-1037 |
| `reading.js` | 36 (watches `speechSynthesis.speak` for word boundaries, never speaks), 40, 60, 66 |
| `ship.js` | 72 |
| `talents.js` | 103, 141, 144, 155, 222, 226, 233, 320-338, 366, 373, 377, 412, 433, 438, 468, 478, 489, 497, 527, 554, 573, 600, 631, 655, 663, 666, 676, 690, 714, 719, 758, 774, 793, 824, 832, 853, 900, 929, 932, 947, 982, 996, 1163, 1172, 1188, 1198, 1199, 1208, 1219, 1394, 1403, 1437, 1442, 1477, 1495, 1512 |
| `think.js` | 295, 337, 340, 360 |
| `topic.js` | 8, 38, 52, 55, 56 |

## 3. Stopping the voice

- `hush()`: empties the speech queue, `speechSynthesis.cancel()`, pause the Google `Audio`, `TTS.ns.stop()`.
- Called on every screen change (`setScreen` `index.html:1645`), back (`index.html:1654`, `1661`), pause (`index.html:1242`),
  overlay buttons (`index.html:1663`), next story panel (`index.html:1681`), level/lesson start (`index.html:2031, 2034, 2041`).

## 4. Audio files and fetches around the voice

- `cf/public/sw.js` (website service worker): `/api/tts/status` network first (`cf/public/sw.js:51`), `/api/tts?…` audio
  from the saved copy first (`cf/public/sw.js:52`), prefetch of the sentence list `/api/tts/list` (`cf/public/sw.js:66`),
  status saved at install (`cf/public/sw.js:11`). This is how the Google voice keeps working offline.
- Voice stats: `voiceLog` / `voiceFlush` `index.html:1506-1512` send counts to `/api/tts/stats` (no audio).
- Server (Cloudflare worker, built by `cf/tools/make_worker.py`): `tts()` `cf/tools/make_worker.py:284`, Google synth
  `cf/tools/make_worker.py:467`; the parent listen page plays `/api/tts?…` and `/api/tts/try` (`cf/tools/make_worker.py:32-33`).
- Build-time tools (not in the game): `cf/tools/pregen.js` (records every sentence in advance), `cf/tools/voicecheck.js`
  (pronunciation check), `cf/tools/voicemissing.js` (missing-recording report).

## 5. Not speech

- Sound effects and music: Web Audio (`AudioContext`) `index.html:1373` (`audio()`), `index.html:1437` (`renderAudio`);
  `duck()` `index.html:1436` lowers the music while a voice speaks.
