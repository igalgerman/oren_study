# Simplicity spec (audit of HEAD c11528b + all packs injected) — screenshots in this folder

## Global rules
G1 Top bar on kid activity screens: back (start/right corner) + 🔊 repeat + the music/sound button (#610 owner rule, 27 Nov: a way to hear the text and to turn the music off on every screen). Hide gems, home, title chip (title spoken). Home only on hub screens (city, map, kingdom, studio). Never home+back together. (setScreen ~1301, T.hudT)
G2 Max 1 primary (green, big, bottom-centre) + 1 secondary per kid screen. Next step always "▶ הַמְשֵׁךְ" (unify הַבָּא/לַשְּׁאֵלוֹת/מַתְחִילִים/לְחִידוֹן...).
G3 2–4 options, balanced layout (row of 2–3 or 2x2), never 3+1 orphan.
G4 One short spoken instruction line in the question card, one 🔊. No second instruction box, no adult text, no per-line 🔊 in stories.
G5 Menus: max 4–6 tiles, hide locked items, show "next" as one big button, hide 0-star rows, distinct icons (no duplicate books/flags).
G6 No timers/digits pressure; one progress bar; disabled buttons fill as progress.
G7 Tap ≥44px, text ≥16px on phone (planet labels, map labels, cbn cells, chess coords).
G8 Parent panel: one action per row, details on tap, no technical prose by default, hide empty sections.

## P1
1 think.js ser render ~267 / gen ~51: series shows the answer, no "?" slot → blank items[qi], "?" at end if last. (phone-a-think-think-ser.png)
2 talents.js other() ~1250 "משהו אחר": 25 identical tiles → 6 big tiles (4 doors + math + arcade), drill down.
3 openGroup/bldCard ~108–121 + explore2 register: explore door 8 buildings → merge to ≤4 (lab+nature, world+maps+calendar, think+code+chess, sky) or 2 doors; remove "0/24 ★".
4 openBuilding ~123: remove 2-line description (speak it), ≤4 tiles, rest unlock gradually; library drop ⏱️ read-flu from kid menu (parent-initiated).
5 index.html playLevel ~1627: "לִמּוּד" + "רֶמֶז" under every question (+ challenge chips) → one 💡 ladder hint→example→lesson (align with help.js: no help button? NOTE help ladder = automatic; keep at most one small 💡), remove "אתגר" chip.
6 gaps.js nikMenu ~87: show only current vowel big + one start; intro examples display-only.
7 think.js readRC ~307: add spoken instruction; one audio control; flatten nested box.
8 talents.js art-mix ~482, states ~404, dayNight ~412: next button only after the interaction.
9 health.js showBreak ~117: one counter (jump count or ring); button fills as progress (also meal).

## P2
- code menu ~638: 15 level tiles → one "שָׁלָב N ▶"; typing lessonsMenu ~283 same.
- pixel editor ~440: 8 colours, 3 tools, one "שְׁמֹר".
- colorByNum ~526: 6x6, 2–3 colours, single digit, ≥18px.
- piano ~345: first choice 🎹 free / 🎵 song; recording inside free play or removed; light keys instead of note-name text.
- jar ~601: 6 options.
- chess.js: hide coordinates; chess-play spoken line + arrow hint first move.
- explore2.js cards ~181: 1 line + speech; "הַמְשֵׁךְ"; enlarge/remove tiny planet/map labels.
- think-ana: options must differ clearly (size×2 or colour).
- learn.js ln-math: intro 1 spoken line; strategy line into 💡; 2x2 options.
- read-build/write-spell/write-mix: instruction 1 line at card top; balanced letters.
- readStory ~247/story-new: remove per-line 🔊; one 🔊 + "הַמְשֵׁךְ".
- badges ~895: earned + one "next badge".
- showJourney ~1355: remove cage + "0/49"; progress bar/stars.
- Parent sumTab ~959: 3 lines (today minutes, streak, today's activities); rest in "פירוט מלא".
- tryTab ~1011 (122 controls): 2 buttons "לשחק כהורה" / "להתחיל מחדש".
- partsTab ~1119 (140): one toggle per building; activity chips after tapping.
- progTab ~1138: one "⋯" per row; one reset at bottom.
- voiceTab ~1097: prose into closed "עזרה".
- permTab ~1105: hide on website when nothing to approve.
- Day tab: move HEALTH.panel and T.rdSettings to הגדרות; day tab = today only.
- msgTab: drop gift chips (or one +💎 toggle).

## P3
- mind-breath/sounds/scan, code-maze: add spoken instruction.
- arcade openArcade: hide locked cabinets or 🔒 with reason.
- studio ~1334: one category at a time (tap body part) or only hair/shirt/pet.
- desktop play: keypad under answer slot.
- read-first: unambiguous pictures (drop "תו").
- sci-plant: only "היום הבא" green.
- health showRest: "עוד אחד קטן" as icon button.
- BUG music2 songs: "Cannot read properties of undefined (reading 'he')" in sing()/songs() from music hall.
