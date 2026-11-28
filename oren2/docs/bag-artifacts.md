# The bag: 12 artifacts Oren wins and uses (#664)

One reward kind he understands: stars = what he knows; won items = things he can use. No new currency (the ship's
additions still cost gems, unchanged; the bag costs nothing).

## How an artifact is won
The end of the daily path gives one ship piece a day (#391). Every second piece also gives the next artifact, in a fixed order:
`held artifacts < ceil(ship pieces / 2)` -> the next one (so the 1st path wins artifact 1, the 3rd wins artifact 2 ... the 23rd wins
artifact 12; an old save with a longer ship catches up one per day). The finale card shows it with a small surprise (the emoji pops out
of a gift box, spoken "חֵפֶץ חָדָשׁ בַּתִּיק: ...!").

## What each does (one tap in the bag; the effect shows at once on home, stays for the rest of that day, one at a time; spoken)
| # | artifact | effect on home |
|---|---|---|
| 1 | 🏮 פָּנָס קֶסֶם | warm glow over the whole home |
| 2 | 🌈 קֶשֶׁת | a big rainbow across the sky |
| 3 | 🎈 בָּלוֹנִים | balloons rise |
| 4 | ❄️ כַּדּוּר שֶׁלֶג | soft snow falls |
| 5 | 🦋 פַּרְפָּרִים | butterflies drift around |
| 6 | 🎆 זִקּוּקִים | fireworks pop in the sky |
| 7 | 🧭 מַצְפֵּן קֶסֶם | the big "go" button pulses: where to go next |
| 8 | 🔔 פַּעֲמוֹן | a bell rings, notes rise |
| 9 | 🎩 כּוֹבַע קֶסֶם | Oren and the friend jump |
| 10 | 🫧 בּוּעוֹת | bubbles rise |
| 11 | 🪁 עֲפִיפוֹן | a kite flies across |
| 12 | 🌸 פְּרָחִים | flowers rain down |

## Screens
- Home: a 🎒 button appears once he has won one item (nothing to show before). One tap opens the bag.
- Bag: a card with a 4x3 grid. Won items are in colour (tap = use it: closes the bag, effect + voice). Not yet won = a ❔ slot (tap = the friend says to keep going).
- Save: `save.bag = {h:[ids won, in order], fx:{id, d}}`; synced with the family merge; old/broken saves = empty bag.
