# Working rules for this repo (the learning game)

This is the public game repo. The backlog (issues) lives elsewhere; a session gets its issue text from the task prompt.

## Simplicity first
- Keep everything simple. Do not add a feature, option, button or setting unless it was asked for or is clearly needed.
- Prefer removing over adding. One clear main action per screen for the kid (age 6-7, new to computers, very smart).
- When unsure whether something is needed, leave it out.

## Language and content
- Talk to the user in English. Kid-facing text in Hebrew with correct nikud; parent-facing text can be without nikud.
- Original characters and art only (no copyrighted characters or brands).
- The kid's name is a placeholder in the source; never write a real name, e-mail address or play data in this repo.

## Project layout
- `oren2/` is the game. Edit `talents.js`, `talents.css`, `arcade.js`, `arcade.css` and the core in `index.html`, then run `python3 build_talents.py` (in `oren2/`); commit BOTH `oren2/index.html` and `oren2/cf/public/index.html` (CI is red when they differ from a fresh build).
- Tests: `oren2/tests/run.sh` (all suites) runs in CI and cloud sessions only.

## Git rules
- Work on a branch `lane/<n>`; open a PR to `main`. Never push to `main`, never force-push, never merge a PR yourself (the guard hook in `.claude/` blocks it).
- Commit with the neutral git identity already set in this checkout; do not change it.

## Rules that hold on every screen
- A rule that must hold on every screen (voice, back/forward, help) gets an automatic test that walks every screen (`oren2/tests/walk.js`) and fails with the list of screens that break it.

## Before the switch: mirror PRs only (#854)
- Until the deploy switch, this repo only takes PRs from the mirror (branch `mirror/*`, label `mirror`); issues are off. Do not open other PRs here. After the switch, normal `lane/<n>` game PRs are allowed too.
