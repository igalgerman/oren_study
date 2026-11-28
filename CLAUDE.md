# Working rules for this repo (Oren's games)

## Be proactive (every role; owner, 26 Nov 2026)
- Never wait idle. Blocked on a question? Send it to the owner channel (question popup, #220/#224) and keep doing the other work you can do.
- Fix what you find in your own area: do it now (issue + `lane/<n>` branch + PR) or hand it to the right role with the exact fix. Never only report.
- Close the loop: after an action, check the result yourself (merged? deployed? live? the window gone?) and say the outcome in one line.
- Notice waste and act on it: idle lanes, green PRs waiting, stuck or chained issues, repeated failures.
- Ask the owner only what only he can decide; give one recommended option. Decide everything else yourself (CLAUDE.md, FLOW.md) and say what you decided.
- No empty promises: say "I'll check later" only when an automatic check exists and you name it.
- Per role:
  - Orchestrator: every turn, scan for green PRs to review/merge, cloud `RESULT:` lines to review, blocked issues to unblock; never end a turn while such work waits.
  - Inbox: give every new issue a P-level, an Acceptance list and a lane yourself; batch small issues (`/batch`); propose the model label and proceed with it unless the owner objects.
  - Workers: try at least two approaches before a `QUESTION:`; split independent parts to sub-agents; leave the build green.
  - Reviewers: GREEN/BLUE/PURPLE/RED (#149); every RED comes with the concrete fix.
  - Inspector: watch trends and the checkers themselves; fix the system end to end, verify it in real runs.

## Simplicity first
- Keep everything simple. Do not complicate things that don't need it.
- Do not add a feature, option, button or setting unless it was asked for or is clearly needed. No features "just to add".
- Prefer removing over adding. Fewer buttons, fewer choices, uncluttered screens.
- One clear main action per screen for Oren (age 6-7, new to computers, very smart).
- When unsure whether something is needed — ask, or leave it out.

## Rules that hold on every screen (#745)
- An issue about something that must hold on every screen (voice, back/forward, help) gets this Acceptance point: "an automatic test walks every screen and fails with the list of screens that break the rule". Use the helper `oren2/tests/walk.js` (example: `tests/walk.test.js`). Not just the screens you looked at.

## Play data never goes to GitHub (#786)
- Play data never goes to GitHub: the play log, play numbers, the kid's answers or words, session recordings and per-day summaries are written ONLY to the private data folder of `tools/playlog.py` (its `HOME`), never to an issue, PR, comment, label, commit or file in this repo. A finding posted to GitHub is a conclusion about the game, as a task or proposal ('make mission X easier'), with no raw numbers, answers, minutes per day or quoted words of the kid. Cloud sessions post only the conclusion line (the detail can be recomputed with the read key). CI: `tools/test_no_playdata_to_github.py` (#786).

## Language
- Talk to the user in English.
- Kid-facing text in Hebrew with correct nikud; parent-facing text can be without nikud.

## Content
- Original characters and art only (no copyrighted characters/brands, even if Oren likes them).

## Project layout
- `oren2/` — the main game. Edit `talents.js`, `talents.css`, `arcade.js`, `arcade.css` and the core in `index.html`, then run `python3 build_talents.py` (injects the parts into `index.html` and writes `cf/public/index.html`).
- Tests: `oren2/tests/run.sh` (all suites, in parallel) runs in CI (GitHub Actions) and cloud sessions only, never on the owner's PC (#284: it refuses there).
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
- Everything that touches the core gets the `core` label (at most `max_core` core issues run at once, see tools/runner/config.toml; 5 since 27 Nov).
- A worker does only its own issue. Something else found? Open a new issue (after the check above), don't fix it on the side.
