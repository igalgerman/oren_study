# בדיקות — המסע של אורן

בדיקות אוטומטיות שמריצות את המשחק בדפדפן אמיתי (Playwright) ובודקות שהכל עובד: חשבון, כל הפעילויות, לוח ההורים, הארקייד, סנכרון בין מכשירים והשרת של Cloudflare.
כל החבילות רצות במקביל, בערך דקה וחצי.

## Run

```bash
oren2/tests/run.sh            # build + all suites in parallel (~90s), non-zero exit on failure
FULL=1 oren2/tests/run.sh     # also the slow full play-through of every world (desktop + phone)
SHOTS=1 oren2/tests/run.sh    # also save screenshots to tests/.tmp/shots/
JOBS=4 oren2/tests/run.sh     # limit parallel browsers (default 6)
node oren2/tests/arcade.test.js phone   # one suite; desktop|phone variant where supported
```

Logs: `tests/.tmp/logs/<suite>.log`. Every suite prints `PASS …` / `FAIL …` lines and a final `RESULT <name> <pass> <fail>`.

Time budget (#187): run.sh times every suite into `tests/.tmp/times.tsv` and FAILS a suite slower than its line in `tests/budget.txt`
(default 60 s; a bigger budget needs a `# why`); hard timeout 120 s per suite; CI fails a shard over 8 min (`RUN_BUDGET=480`) and shows the
times in the step summary. New test? Add it to an existing suite unless a new one is clearly needed, and give a new suite a budget line.
The test gardener (`python3 tools/test_garden.py`, weekly from the watchdog) proposes trims in ONE issue 'Test trim proposal (week N)'; it never deletes a test.
Needs Node and the `playwright` package with Chromium (no npm install inside the repo).

## Suites

| file | covers |
|---|---|
| math-logic | every generated math question (many samples per level): answers, step lines, hints, options, clocks, column math |
| edge-cases | real-speed level transitions, blocked localStorage, old-save migration, cloud merge rules, key spam, timers, reduced motion, save size |
| regressions | kingdom → badges button, avatar default look + one-time migration, cap hat rendering |
| activities | opens and finishes all ~47 Talents City activities through test hooks; all 15 code-robot levels solvable |
| parent (desktop/phone) | users + parent password, permissions, parts on/off, gradual unlock, skip/reset, messages, badges, daily plan, home, full reset |
| time-missions | today's missions control, daily template, screen-time limit, 5-minute warning, lock screen, bedtime |
| sandbox-voice (desktop/phone) | parent "play as parent" sandbox with its own save + skip bar, voice check |
| entry | start screen Oren / parent buttons, parent choice (panel, play, or time together) |
| day-path (desktop/phone) | "what do you feel like today?" choice from enabled parts, something else, together time (parent "I have time now" and Oren-led), real-world missions, no tickets / prize / badge toasts, first-time tour, family merge of the new keys |
| arcade (desktop/phone) | all arcade cabinets, records, real clicks (no tickets or prize shop) |
| family-sync | website mode: fresh devices share one fixed family save (no codes or links), old per-device id merged once, settings/progress sync through a fake `/api/save` |
| health | body breaks (water, toilet, movement, eyes) at the end of an activity, meal pauses by the clock, topic switching and resting doors, parent settings and log, family merge |
| timelimit | what is left in the top bar, spoken reminders, finish-the-current-activity grace, count-based limits, the parent's "⏱️ היום" block, a grant from the parent's phone unlocking Oren's device |
| helpbtn (desktop/phone) | #54 one help button on every question of every pack and the math levels: tap 1 = clue, tap 2 = answer + explanation, offered by itself after 2 wrong; texts with nikud and in pregen |
| worker | the Cloudflare `_worker.js` bundle: page, icons, manifest, save API (GET/PUT/400/404/405/413), Google voice cache and `/api/tts/pregen` (fake Google) |
| instructions | every activity (and the code-robot level, piano song and typing lesson behind a menu) speaks a short instruction when it opens (#55) |
| eventlog | #348 game event log: `track()` batches to `/api/log` (one D1 row per batch), session cap, capped offline buffer, no retry loop, `/api/log/summary` (daily summary, raw events with the admin key), 30-day prune; plays two questions through the real worker |
| network | #434 the real website on a slow network (throttled) and with no network: the game opens, the recorded voice plays from the device for lines heard before (service worker), a save made offline waits and is sent when the network returns; CI / cloud only like every suite |
| kidtext | #422 all kid text (every Hebrew string with nikud in the sources) + every level generator (30 seeds) + every Talents City activity screen (12 runs): no bare word in kid text, no "1" + plural, no וְ before shva, no feminine verb to the kid; false positives in `ALLOW` (with reasons), real ones in `KNOWN` (fixed in the findings issue) |
| playthrough (FULL=1) | plays every world level by level on a viewport, extras, layout overflow |

## Voice in advance

`node oren2/cf/tools/pregen.js` (after each deploy that changes kid text) plays the built game headless, collects every sentence the game would send to the Google voice (plus worlds, quests, words, sentences and stories), and creates the missing ones on the site through `POST /api/tts/pregen`. Paced to 15 a minute, stops at 700 new sentences a day (KV free tier); run it again the next day to continue. State: `~/.cache/oren-pregen/`.
