# Working rules for this repo (Oren's games)

## Simplicity first
- Keep everything simple. Do not complicate things that don't need it.
- Do not add a feature, option, button or setting unless it was asked for or is clearly needed. No features "just to add".
- Prefer removing over adding. Fewer buttons, fewer choices, uncluttered screens.
- One clear main action per screen for Oren (age 6-7, new to computers, very smart).
- When unsure whether something is needed — ask, or leave it out.

## Language
- Talk to the user in English.
- Kid-facing text in Hebrew with correct nikud; parent-facing text can be without nikud.

## Content
- Original characters and art only (no copyrighted characters/brands, even if Oren likes them).

## Project layout
- `oren2/` — the main game. Edit `talents.js`, `talents.css`, `arcade.js`, `arcade.css` and the core in `index.html`, then run `python3 build_talents.py` (injects the parts into `index.html` and writes `cf/public/index.html`).
- Tests: `oren2/tests/run.sh` (all suites, in parallel). Run before every publish.
- Publish: the Claude artifact from `oren2/index.html`; the website via `oren2/cf/tools/deploy.sh` (Cloudflare Pages, project `oren-game`).
- Voice: after pregen, run `node oren2/cf/tools/voicecheck.js` so new sentences are pronunciation-checked (parent picks spellings at https://oren-game.pages.dev/api/tts/listen; results at /api/tts/review).
- Game voice is fixed: Google he-IL-Chirp3-HD-Kore at 0.9. After adding/changing missions or kid text, run `node oren2/cf/tools/pregen.js` after deploy so all audio exists in advance (resumable, ~700 new sentences/day).

## Parallel work
Several Claude sessions may work at once. Read `FLOW.md` (rules) — the owner's short guide is `HOWTO.md`.

## Agent skills

### Issue tracker

Issues live in GitHub Issues of igalgerman/a (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five roles (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix) plus lane labels `core` / `pack` / `review`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root (created lazily). See `docs/agents/domain.md`.

## One backlog, no duplicates (every session: orchestrator, intake/grill-me, workers)
- The only source of truth for work is GitHub issues in igalgerman/oren_study (open AND closed). Before creating any issue or starting any work:
  `gh issue list -R igalgerman/oren_study --state all --limit 200 --json number,title,state,labels` and read the related ones.
- Already exists (open or done)? Don't create it again — add a comment to that issue instead, or reopen it.
- Overlaps an open issue (same screen or same files)? Add `Blocked by: #n` so they run one after the other, never in parallel.
- Everything that touches the core gets the `core` label (only one core runs at a time).
- A worker does only its own issue. Something else found? Open a new issue (after the check above), don't fix it on the side.
