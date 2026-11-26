# Glossary (#30)
One line per term, as the repo uses it. Rules live in `FLOW.md`; this file only names things.

## Game (`oren2/`)
- **Oren's journey** — the game (`oren2/index.html`): worlds with levels, plus Talents City; kid text in Hebrew with nikud.
- **Core** — `oren2/index.html` (worlds, save, voice) + `talents.js` + `reading.js` + `wire.js` + `build_talents.py`; one change here touches everyone.
- **Pack** — one extra game file (`arcade.js`, `chess.js`, `gaps.js`, `english2.js`, …) that `build_talents.py` injects into `index.html` after `talents.js`.
- **Build** — `python3 oren2/build_talents.py`: injects the packs into `index.html` and writes the website copy `cf/public/index.html` (never commit either).
- **Talents City** (עִיר הַכִּשְׁרוֹנוֹת) — `talents.js`: a city of buildings; each building holds activities (`building()` registry).
- **Activity** — one playable thing inside a building (an `ACT` entry).
- **Missions** — the daily missions: the day's short list of activities Oren is asked to do (`talents.js`, "daily missions").
- **Arcade** — `arcade.js`: short bright mini-games just for fun; records only, no currency.
- **Nikud ladder** — `gaps.js` part 4: the vowel marks taught one rung at a time (kamatz/patach → chirik → cholam → shuruk/kubutz → tsere/segol → shva).
- **Help ladder** — `help.js`: automatic help when Oren is stuck (tip → animated picture → a similar question solved together); no help button.
- **Voice** — fixed Google he-IL-Chirp3-HD-Kore at 0.9; **pregen** (`cf/tools/pregen.js`) makes all audio in advance, **voicecheck** checks pronunciation.

## Flow (`FLOW.md`, `tools/runner`)
- **Owner** — the parent; decides only what only he can decide. **Owner lane** — what waits for him: `ready-for-human` and `needs-triage` issues (panel "YOUR LANE").
- **Backlog** — the GitHub issues of igalgerman/oren_study, open and closed; the only source of truth for work.
- **Lane** — the kind of an issue, one label each: `core` (core files, max `max_core` at once), `pack` (one pack file + its test, parallel), `review` (read-only report).
- **Lane branch** — `lane/<n>`: the branch (and worktree `wt-<n>`) where issue n is built.
- **Express** — label for a tiny issue that goes first in the queue (e.g. the canary).
- **Runner** — `tools/runner/runner.py`: takes ready issues and drives worker → reviewer → merge → deploy → close.
- **Pass** — one runner run over the ready queue (`run-pass-*`); **run-<n>** — the runner window for one issue.
- **Watchdog** — `tools/runner/watchdog.py`: every minute checks windows, starts passes, opens intake, restarts finished control tabs.
- **Worker** / **Reviewer** — the Claude sessions in `issue-<n>` / `review-<n>`; the reviewer gives a verdict (GREEN/BLUE/PURPLE/RED).
- **Integrate** — merging a green PR into `main`: normally the runner's auto-merge on a green `tests` check, fallback `tools/integrate.sh`.
- **Park** — a worker waiting for the owner `park_minutes` (30): the issue gets `blocked` + `ready-for-human`, the lane is freed, windows stay open.
- **Later** — label for an issue whose code is merged and only a live/owner check is left (`Due:` line); the runner skips it.
- **Batch** — an issue titled `Batch:` that groups small members (`In batch #N`); one worker, one PR, `Fixes #m` per member.
- **Intake** — turning an idea or a `needs-triage` issue into ready tickets: `intake-<n>` window, `/grill-me` → `/to-tickets` → triage.
- **Triage** — giving a new issue its labels (`docs/agents/triage-labels.md`), P-level, Acceptance list, lane and `Blocked by`.
- **Acceptance** — the `## Acceptance` section (3-7 checkable points + tests, `Out of scope`); the runner never starts an issue without it.
- **Control tabs** — the Herdr space `oren`: `orchestrator` (main session, `ORCHESTRATOR.md`), `inbox` (owner's requests → issues), `inspector`.
- **Canary** — `canary.py`: one rolling express issue, run every 6 h (at most hourly), that proves the whole flow still works end to end.
