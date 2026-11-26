# Task pool: how solved items leave and wrong items come back (#360)

Three mechanisms decide what Oren is asked next. They stay separate (merging them is out of scope).

| # | Mechanism | Where | Used by | Intervals |
|---|---|---|---|---|
| 1 | **Finite bank** (each item seen / not seen) | `oren2/learn.js` `seen` / `pickItem` | talents quizzes with `q.bank` or `pool:1`, thinking tracks, reading comprehension, explore quizzes, gaps (nikud ladder, first sound), read-bank2 (words, sentences, build, writing mix, stories), paper writing | wrong or helped → back after 1 day; then right each time it is due → 2, 4, 8 days → leaves the wrong list |
| 2 | **Skill model** (level 1-5 per skill) | `oren2/learn.js` top (`record`, `plan`) | math training (`ln-math`), paper math | reviews after 1/2/4/8/16/30 days; 3 right in a row → level up, 2 wrong → level down; ~20% of the day path is reviews |
| 3 | **Help "stuck" items** | `oren2/help.js` (`HELP.due`) | the math journey (core) | a question he got stuck on comes back the next day inside practice; right on his own → understood |

## Rules of mechanism 1
- Pick order: a due wrong item → an unseen item at his level → (mastered) a 15% spot review → the oldest seen item.
- **Picking records nothing.** The item is recorded once, after the answer: `LEARN.seen(bank, key, ok, helped)`. A first-try wrong answer, or help, is `ok=false`.
- A picked item is *held* for 20 minutes in that page so one quiz does not ask it twice; the answer releases it.
- Stories and reading passages are one item each: recorded after the last question. Any wrong answer, or the story read aloud to him, → back after 1 day.

## Activities not in a pool (on purpose)
- Generated questions without a fixed list (math generators, patterns, music ear/notes, typing, art, mind, arcade, chess lessons): the skill level (2) or the activity's own stars.
- English (`english2.js`): its own spaced boxes per letter/word; `eng-kw` only rotates the example word.
- Self-checked paper tasks: recorded as done (he cannot get them wrong on screen).

Parent line (for the strong/weak view, #359): "Solved tasks leave the pool; a wrong one comes back after 1 day, then 2, 4 and 8 days."
