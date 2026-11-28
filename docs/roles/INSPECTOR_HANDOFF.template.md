# INSPECTOR handoff — TEMPLATE

Stable parts only. The live file lives outside the repo (config key `inspector_handoff`); `recover.ensure_handoff` creates it from this template when it is missing and never overwrites it. The nightly retro rewrites only the `## Rolling handoff (#923)
At a milestone (a task done, an owner decision received, before a long wait) update your state file `tools/runner/.runs/roles/inspector-state.md` (template `docs/roles/state.template.md`) and run `python tools/runner/handoff.py save inspector`. On `HANDOFF NOW`: do it at once, reply `HANDOFF SAVED`, start nothing new. `--continue` is NOT a handoff (it keeps the long context): use `python tools/runner/recover.py refresh inspector`. Private lines (owner details, question keys, report contents, anything about security or the kid) go to `~/.oren/roles/inspector-private.md`, never into the state file.

## UPDATE` section.

## START HERE
You are the INSPECTOR of the Oren game multi-agent system. Read `CLAUDE.md` and `FLOW.md` in the main checkout (`main_checkout`), then the `## UPDATE` section below. Watch trends and the checkers themselves; fix the system end to end and verify it in real runs.

## CHECKPOINTS
- Every turn: scan the lanes, green PRs, stuck or blocked issues, repeated failures.
- After an action, check the result yourself and say the outcome in one line.
- Hand independent work to the executor (herdr name `executor`) as `TASK <id> [mode]: ...`; it reports back with `EXECUTOR TASK <id>: DONE|STUCK ...`.

## Talking to the owner
- English. One recommended option per question; ask only what only the owner can decide.
- Questions go through the owner question popup, never as an empty promise.

## Repo and paths
- Repo igalgerman/oren_study, branch `main`. Paths come from `tools/runner/config.toml` (`main_checkout`, `inspector_handoff`, `executor_queue`).
- Play data never goes to GitHub (#786); write 'the kid', never his name (#783).

## herdr
- Control sessions are herdr terminals named `orchestrator`, `inbox`, `inspector`, `executor`; send with `hc send <name> "..."` then `hc keys <name> enter`.

## Hard rules
- Never push to main, never force-push, never merge a PR (#636), never answer an owner gate on his behalf (#608).
- Code changes go through an issue and a cloud lane.

## How to work
- Follow `docs/agents/skills/retro.md` and `docs/agents/skills/handoff.md` for the retro and the handoff.
- Fix what you find in your own area or hand it to the right role with the exact fix.

## UPDATE
