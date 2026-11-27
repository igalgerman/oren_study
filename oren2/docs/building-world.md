# Building world — design spec (#63, built by #64)

Spec only. No game code here. Decisions are the owner's (issue #63):
gems (💎) are the building material; stars (⭐) are mastery and only **unlock** blocks and areas (never spent);
one free 2D block world replaces the small kingdom shop; the parent panel shows only a picture; original art; kid text with nikud; one main action.

## 1. The idea in one line
Oren opens **הַמַּמְלָכָה**, sees his own little world (a big grid of blocks), picks a block at the bottom and taps the world to build. Tapping a block takes it away. That is all.

## 2. Screen (the only new kid screen)
Replaces the current `kingdom()` content (screen `sKing`, door "מַמְלָכָה" and home tool stay, same name, same entry points).

- Top bar: as today on hub screens (back + 🔊, gems counter visible because gems are spent here). Title chip stays `הַמַּמְלָכָה שֶׁל אוֹרֶן`.
- Keep as they are: the small `kmine` row (my hero / my badges) and the hung pixel picture (`kpic`).
- **World grid:** 8 columns × 8 rows, every area the same size. Cells are square and fill the width: ~44 px on a 390 px phone, up to ~72 px on desktop (G7: never under 44 px). Sky-coloured background per area; the hero (`AV()`) stands on the ground at the left as decoration (not a cell, not tappable).
- **Block bar (bottom):** one row of big buttons, only the **unlocked** blocks, newest first, the selected one raised and outlined. Each button: the block picture + its gem price (`💎2`). No names under the buttons (spoken on tap instead). More than fit: the row scrolls sideways. No eraser button, no shop title.
- **Next unlock line:** one small line above the bar: `⭐ עוֹד 7 לַקֻּבִּיָּה הַבָּאָה` with the locked block as a dark silhouette. Hidden when everything is unlocked.
- **Area arrows:** a big ◀ / ▶ at the side edge of the grid only when another area is unlocked (hidden otherwise). One area on screen at a time.
- Main action = tap the world. Nothing else on the screen competes with it.

## 3. Rules
- Tap an **empty** cell → place the selected block, pay its gems. Not enough gems → the cell shakes, `sfx.no()`, the friend says the line in §7. Nothing is placed.
- Tap a **filled** cell → remove it, the gems it cost come back (`+2` float text). So nothing is ever lost; building is free play.
- Tap a block button → select it and say its name.
- Falling blocks (only these two): **sand** and **water** fall to the lowest empty cell of their column when placed (short drop animation). Every other block stays where it is put (it may float — this is a toy, not physics).
- A new world starts with the bottom 2 rows filled with grass (top) and dirt (below), so it is never empty. These are normal blocks (removing them refunds 1 gem each).
- No typing, no menus, no confirm dialogs, no timers.

## 4. Block types and gem costs
Gems are earned at ~1-2 per correct answer and ~10-30 per finished level, so a block must cost little: he should place several after every level. Animals and gold are the "save up" items.

| id | kid name | 💎 | unlock ⭐ | look / wow |
|---|---|---|---|---|
| grass | דֶּשֶׁא | 1 | 0 | green top, dirt below |
| dirt | אֲדָמָה | 1 | 0 | brown |
| wood | עֵץ | 2 | 0 | planks |
| stone | אֶבֶן | 2 | 0 | grey bricks |
| flower | פֶּרַח | 2 | 3 | sways gently |
| leaves | עָלִים | 1 | 8 | green, for trees |
| glass | זְכוּכִית | 3 | 8 | see-through, a sparkle glides over it |
| door | דֶּלֶת | 5 | 15 | wooden door |
| roof | גַּג | 3 | 15 | red tiles |
| water | מַיִם | 3 | 25 | falls, little waves move |
| sand | חוֹל | 1 | 35 | falls (comes with the beach area) |
| sheep | כִּבְשָׂה | 10 | 50 | walks (§6) |
| lamp | פָּנָס | 4 | 70 | glows, pulses softly |
| fish | דָּג | 8 | 90 | water block with a fish swimming; falls like water |
| bird | צִפּוֹר | 8 | 90 | flaps in place |
| gold | זָהָב | 20 | 120 | shiny, sparkles |
| cloud | עָנָן | 2 | 150 | comes with the sky area |
| rainbow | קֶשֶׁת | 30 | 200 | colours shimmer |

All block pictures are new original 16×16 pixel SVGs in the same `px` style as `SPR` (no Minecraft textures, no copied art).

## 5. Stars and unlocks
- Stars counted: `allStars = totalStars()` (journey levels) **+** the best stars of every activity (`sum of TAL.S().tl[id].s`). Earned stars only go up, so an unlock never disappears.
- Blocks unlock at the ⭐ column in §4. Areas:
  - **אָחוּ** (meadow) — from the start.
  - **חוֹף** (beach) — at 35 ⭐: sand ground instead of grass, sea-blue sky.
  - **שָׁמַיִם** (sky) — at 150 ⭐: no ground, clouds to build on, starry evening colours.
- Unlocks are checked when the kingdom screen opens (not in the middle of a level), so the surprise happens where he can use it. Several new unlocks at once → shown one after another.

## 6. Wow moments
1. **New block card:** when a block unlocks, a card pops on the kingdom screen: the block big, spinning in, confetti (`burst`/`rain`), the star sound, and the friend (his companion animal) jumps and says `כָּל הַכָּבוֹד! פָּתַחְתָּ קֻבִּיָּה חֲדָשָׁה: זְכוּכִית!`. One button `▶ הַמְשֵׁךְ`; the new block is then already selected in the bar.
2. **New area card:** same card with the area picture: `פָּתַחְתָּ מָקוֹם חָדָשׁ: הַחוֹף!`, then the ▶ arrow pulses once.
3. **Falling sand/water** with a small splash/puff when it lands.
4. **Sheep walks:** every few seconds it steps one cell left or right if that cell is empty and has a block under it; it turns at walls. Its position is saved.
5. **Living blocks:** flowers sway, water waves, lamps glow, glass and gold sparkle, the bird flaps, the rainbow shimmers (CSS animations only, paused when the screen is hidden).
6. **First block ever:** the friend says `וַאוּ! בָּנִיתָ אֶת הַקֻּבִּיָּה הָרִאשׁוֹנָה!` once.

## 7. Kid text (Hebrew with nikud; all spoken, so all must be in pregen)
- First visit hint (shown until the first block is placed): `👇 בְּחַר קֻבִּיָּה, וְלַחַץ עַל מָקוֹם רֵיק כְּדֵי לִבְנוֹת.`
- After the first block (spoken once): `לְחִיצָה עַל קֻבִּיָּה מוֹרִידָה אוֹתָהּ, וְהַיַּהֲלוֹמִים חוֹזְרִים.`
- Not enough gems: `חֲסֵרִים יַהֲלוֹמִים. אֶפְשָׁר לְהַרְוִיחַ עוֹד בַּשְּׁלַבִּים!`
- Next unlock: `עוֹד {n} כּוֹכָבִים לַקֻּבִּיָּה הַבָּאָה`
- Unlock cards and first block: the lines in §6.
- Block names: §4. Area names: אָחוּ, חוֹף, שָׁמַיִם.
- Kingdom intro (`i-king`, replaces today's line about the palace and buying): `זֹאת הַמַּמְלָכָה שֶׁלְּךָ! בַּיַּהֲלוֹמִים בּוֹנִים, וְהַכּוֹכָבִים פּוֹתְחִים קֻבִּיּוֹת חֲדָשׁוֹת.`

## 8. Parent panel
- One picture only: a small SVG drawing of the area with the most placed blocks (same pixel art, no grid lines), in the day tab under the day view, caption `מה אורן בנה` (parent text, no nikud).
- Hidden while he has built nothing beyond the starter ground. No buttons, no settings, no counts.

## 9. Save data
- `save.bw = {a:{meadow:{'x,y':'wood',...}, beach:{...}, sky:{...}}, seen:['glass',...], first:1}` — `a` = placed blocks per area (only areas he opened), `seen` = unlock cards already shown.
- Add `bw` to the newer-copy-wins list in `mergeIn` (next to `k`), like the kingdom today; works with family sync.
- `parentSandbox()` gets an empty world; parent play never writes the kid's world.

## 10. What to remove
- `SHOP` list, `kSel`, the shop panel (`.shop`, `renderShop`), the 12×4 `.kgrid` and its handlers, the `khint` line, the castle + freed guards strip (`.ktop` on the kingdom screen) and the old `sayNow` text. CSS for these.
- The castle in the level-result card and elsewhere stays (not part of this).
- Old kingdom items: one-time migration — refund the gem value of every item in `save.k` (SHOP prices), then clear `save.k`, flag `save.bw` created. He loses nothing.
- Sprites that become unused after this (check with grep) are removed; sprites used elsewhere stay.
- Tests on the old shop are replaced: `tests/edge-cases.test.js` "kingdom refuses item without enough gems", `tests/playthrough.test.js` kingdom part, `tests/regressions.test.js` "kingdom shop items show their pictures". `qa-fix` kingdom → my hero and `regressions` badges button stay.

## 11. Out of scope
3D, crafting, mining/digging, enemies, day/night cycle, saving several worlds, sharing, sounds per block beyond the existing `sfx`, any setting in the parent panel, any new way to earn gems or stars.

## 12. Build list for #64 (in order)
1. Tests first — new suite `oren2/tests/build.test.js` (+ budget line in `tests/budget.txt`): place costs gems; remove refunds; not enough gems → nothing placed + shake; sand/water fall to the lowest empty cell; locked block not in the bar; reaching the star threshold shows the unlock card once (`seen`); area arrow only when unlocked; `bw` survives `mergeIn` (newer wins); old `save.k` migration refunds gems once; parent day tab shows the picture only when something was built; no page errors; no horizontal overflow at 390×844 and 1366×768.
2. Block data: one `BLOCKS` list (id, name with nikud, cost, star unlock, flags fall/walk) and `AREAS` list (id, name, star unlock, ground, colours); `allStars()`.
3. Original 16×16 pixel SVGs for the 18 blocks + 3 area backgrounds.
4. Rewrite `kingdom()`: grid 8×8, block bar, next-unlock line, area arrows, tap place/remove, falling, keep `kmine` + `kpic` + `kingdomScene` event.
5. Unlock check on screen open + unlock/area cards with the friend, confetti and sounds; first-block line.
6. Living-block CSS animations; sheep walking (timer only while `sKing` is visible).
7. Save: `save.bw`, `mergeIn`, `parentSandbox`, one-time `save.k` refund migration.
8. Parent picture in the day tab.
9. Remove the old shop code/CSS/tests (§10); update the `i-king` intro line.
10. `python3 build_talents.py`, `tests/run.sh` green, screenshots phone 390×844 + desktop 1366×768 of: empty world, built world, unlock card, beach area, parent picture.
11. After deploy: `node oren2/cf/tools/pregen.js` and `node oren2/cf/tools/voicecheck.js` for the new lines (§4 names, §6, §7).
